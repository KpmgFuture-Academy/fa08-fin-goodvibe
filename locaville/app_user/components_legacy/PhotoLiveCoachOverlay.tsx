"use client";

/** 라이브 카메라 코칭 오버레이 — PhotoGuardOverlay 의 라이브 버전.
 *
 *  흐름:
 *   1) mount 시 getUserMedia({video: environment}) 로 카메라 stream 시작
 *   2) <video> 풀스크린 (object-fit: cover)
 *   3) 1.5초 후 첫 frame 캡처 → 백엔드 /photo-guard/coach POST → 짧은 한국어 메시지
 *   4) 이후 3초마다 반복. 메시지가 바뀌면 TTS (speechSynthesis) 음성 안내
 *   5) status === "ok" 이면 셔터 버튼 색 변경 — 사용자가 누르면 onCapture(File)
 *   6) X 누르거나 unmount → stream stop + interval clear + TTS cancel
 *
 *  주의 — getUserMedia 는 secure context (HTTPS 또는 localhost) 에서만 작동.
 *  배포 (Vercel/Render HTTPS) 환경에선 OK. LAN HTTP 시연 시엔 카메라 안 켜짐.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { X, Camera as CameraIcon } from "lucide-react";
import { requestPhotoCoach, type PhotoCoachStatus } from "@/lib/photo-coach-service";
import { speak, stopSpeak } from "@/lib/tts-service";

interface Props {
  /** evidence_type 코드 (PIC1/PIC2/RCT/EDU 등 표준 코드). 백엔드 prompt 분기용. */
  evidenceType?: string;
  /** job_cd — backend 가 (job_cd, evidence_type) 조합으로 시행지침 9p 표 lookup.
   *  예: R0008 + PIC2 → "중간 물떼기 시작 사진" 정확 기준 prompt 에 주입. */
  jobCd?: string;
  /** 셔터 → File 1장. 호출자가 받은 File 로 기존 업로드 흐름 진행. */
  onCapture: (file: File) => void;
  /** X 누름 또는 카메라 실패 시. */
  onCancel: () => void;
}

const POLL_INTERVAL_MS = 3000;
const FIRST_TICK_DELAY_MS = 1500;

export function PhotoLiveCoachOverlay({ evidenceType, jobCd, onCapture, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const intervalRef = useRef<number | null>(null);
  const lastMessageRef = useRef<string>("");
  const capturingRef = useRef(false);

  const [status, setStatus] = useState<PhotoCoachStatus | "init">("init");
  const [message, setMessage] = useState<string>("카메라를 켜고 있어요...");
  const [permissionError, setPermissionError] = useState<string>("");

  /** 카메라 시작. unmount 시 stop. */
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setPermissionError("이 브라우저는 카메라를 지원하지 않아요");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (!mounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {
            // 사용자 제스처 부족 등으로 play 실패 — 그냥 진행 (시각만 안 뜸)
          });
        }
        setStatus("wait");
        setMessage("카메라가 켜졌어요");
      } catch (e) {
        const name = e instanceof Error ? e.name : "";
        setPermissionError(
          name === "NotAllowedError"
            ? "카메라 권한이 필요해요"
            : name === "NotFoundError"
            ? "카메라를 찾을 수 없어요"
            : "카메라를 열 수 없어요 (HTTPS 환경 필요)",
        );
      }
    })();
    return () => {
      mounted = false;
      stopSpeak();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  /** 현재 video frame 을 JPEG blob 으로 캡처. quality 로 폴링/셔터 분리. */
  const captureFrameBlob = useCallback(async (quality: number): Promise<Blob | null> => {
    const v = videoRef.current;
    if (!v || v.videoWidth === 0) return null;
    if (!canvasRef.current) canvasRef.current = document.createElement("canvas");
    const canvas = canvasRef.current;
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(v, 0, 0);
    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", quality),
    );
  }, []);

  /** 3초 폴링 — frame → 백엔드 coach → 메시지 + TTS. */
  useEffect(() => {
    if (status === "init") return;
    if (permissionError) return;
    if (intervalRef.current !== null) return;

    const tick = async () => {
      if (capturingRef.current) return;
      try {
        const blob = await captureFrameBlob(0.55);
        if (!blob) return;
        const result = await requestPhotoCoach(blob, evidenceType, jobCd);
        setStatus(result.status);
        setMessage(result.message);
        if (result.message && result.message !== lastMessageRef.current) {
          lastMessageRef.current = result.message;
          speak(result.message);
        }
      } catch (e) {
        // 한 frame 실패는 swallow — 다음 폴링 계속
        console.warn("[photo-coach]", e);
      }
    };
    const first = window.setTimeout(tick, FIRST_TICK_DELAY_MS);
    intervalRef.current = window.setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      window.clearTimeout(first);
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [status, permissionError, captureFrameBlob, evidenceType, jobCd]);

  const handleShutter = async () => {
    if (capturingRef.current) return;
    capturingRef.current = true;
    stopSpeak();
    try {
      const blob = await captureFrameBlob(0.92);
      if (!blob) {
        capturingRef.current = false;
        return;
      }
      const file = new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" });
      onCapture(file);
    } finally {
      capturingRef.current = false;
    }
  };

  const ok = status === "ok";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#000",
        zIndex: 200,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      />

      {/* 상단 — 메시지 chip + X 닫기. video 위 layer. */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          paddingTop: "calc(env(safe-area-inset-top) + 16px)",
          paddingLeft: 16,
          paddingRight: 16,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
        }}
      >
        <div
          style={{
            flex: 1,
            background: permissionError
              ? "rgba(208, 69, 69, 0.92)"
              : ok
              ? "rgba(47, 109, 79, 0.92)"
              : "rgba(0, 0, 0, 0.72)",
            color: "#fff",
            padding: "14px 18px",
            borderRadius: 18,
            fontSize: 16,
            fontWeight: 700,
            lineHeight: 1.4,
            letterSpacing: "-0.01em",
            boxShadow: "0 4px 14px rgba(0, 0, 0, 0.3)",
          }}
        >
          {permissionError || message}
        </div>
        <button
          type="button"
          onClick={onCancel}
          aria-label="닫기"
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            background: "rgba(0, 0, 0, 0.55)",
            border: "none",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* 하단 — 큰 셔터 버튼. status=ok 면 초록 fill, 그 외 흰색 fill. */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          paddingBottom: "calc(env(safe-area-inset-bottom) + 32px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1,
        }}
      >
        <button
          type="button"
          onClick={() => void handleShutter()}
          disabled={!!permissionError}
          aria-label="사진 찍기"
          style={{
            width: 82,
            height: 82,
            borderRadius: "50%",
            background: ok ? "var(--primary, #2f6d4f)" : "#fff",
            border: ok ? "4px solid #fff" : "4px solid rgba(255, 255, 255, 0.9)",
            boxShadow: ok
              ? "0 6px 20px rgba(47, 109, 79, 0.55)"
              : "0 6px 20px rgba(0, 0, 0, 0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: permissionError ? 0.4 : 1,
            transition: "all 0.2s ease",
          }}
        >
          <CameraIcon
            className="w-10 h-10"
            style={{ color: ok ? "#fff" : "var(--primary, #2f6d4f)" }}
          />
        </button>
      </div>
    </div>
  );
}
