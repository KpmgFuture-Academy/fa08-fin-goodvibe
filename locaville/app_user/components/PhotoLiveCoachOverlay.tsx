"use client";

/** 라이브 카메라 코칭 오버레이.
 *
 *  흐름:
 *   1) mount 시 getUserMedia({video: environment}) 로 카메라 stream 시작
 *   2) <video> 풀스크린 (object-fit: cover)
 *   3) 첫 1.5초 후부터 프레임을 검사. 단, LLM 호출 전에 브라우저에서 먼저 거른다:
 *        - 너무 어둡거나 심하게 흔들리면 → LLM 없이 로컬 안내 (비용 0)
 *        - 직전과 거의 같은 화면이면 → 직전 판정 재사용 (호출 skip)
 *        - 그 외에만 /photo-guard/coach 호출 (관대한 안내 — 진짜 O/X 는 촬영 후)
 *   4) 메시지가 바뀌면 TTS. status==="ok" 2번 연속이면 폴링 정지(셔터만 누르면 됨)
 *   5) 변화 없으면 폴링 간격을 3→5→8초로 늘려 호출 절감
 *   6) X 누르거나 unmount → stream stop + timer clear + TTS cancel
 *
 *  getUserMedia 는 secure context(HTTPS/localhost)에서만. 실패 시 onFallback 으로 갤러리 폴백.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { X, Camera as CameraIcon, Images } from "lucide-react";
import { requestPhotoCoach, type PhotoCoachStatus } from "@/lib/photo-coach-service";
import { stopAllSpeech, prefetchChirp, speakChirpIfCached } from "@/lib/tts-service";

interface Props {
  /** evidence_type 코드 (PIC/RCT/EDU/MID_DRAINAGE_END 등). 백엔드 코칭 prompt 분기용. */
  evidenceType?: string;
  /** job_cd — (job_cd, evidence_type) 조합으로 시행지침 기준 lookup. */
  jobCd?: string;
  /** 헤더 타이틀(작업명 등). */
  title?: string;
  /** 셔터 → File 1장. */
  onCapture: (file: File) => void;
  /** X 누름. */
  onCancel: () => void;
  /** 카메라가 안 켜질 때 갤러리/파일 선택으로 폴백. */
  onFallback?: () => void;
}

const POLL_INTERVAL_MS = 2000;
const FIRST_TICK_DELAY_MS = 800;
const MAX_POLL_INTERVAL_MS = 4000;   // 변화 없을 때 늘어나는 최대 간격
const STABLE_OK_STREAK = 3;          // ok 연속 N회면 폴링 정지 (한 번 더 안내가 들리게)
// 코칭 frame — 중앙 65% 영역만 crop (가장자리 무관, 중앙이 대상물) + 640x480 안쪽으로 다운샘플.
// 화면에 점선 박스 가이드로 분석 영역을 시각화 (사용자가 "여기에 맞춰주세요" 학습).
const COACH_CROP_RATIO = 0.65;
const COACH_FRAME_MAX_W = 640;
const COACH_FRAME_MAX_H = 480;
const COACH_FRAME_QUALITY = 0.5;
const DARK_LUMA_MIN = 45;            // 평균 밝기(0-255) 이 미만이면 너무 어두움 (image_quality.py 미러)
const BLUR_MIN = 2.0;                // 가로 인접 차분 평균 이 미만이면 심한 흔들림/뭉개짐 (보수적)
const SIG_STATIC = 4;                // 8x8 서명 평균 차이 이 미만이면 '거의 같은 화면'
const SIG_MOVED = 10;                // ok 안정 정지 후 이 차이 이상이면 '사용자가 움직임' → 폴링 재개
// 같은 안내가 계속 유효해도 N ms 마다 한 번씩 다시 발화 — 흔들림이 계속되면 침묵 X.
const REPEAT_SPEAK_AFTER_MS = 3500;
// 흔들림/어둠 안내 — 같은 말 반복 시 단조롭지 않게 회전.
const SHAKY_VARIANTS = [
  "잠깐 멈추고 비춰 주세요",
  "조금만 더 가만히 들고 계세요",
  "사진이 흔들리고 있어요. 천천히",
];
const DARK_VARIANTS = [
  "조금 더 밝은 곳에서 비춰 주세요",
  "빛이 조금 부족해요. 밝은 쪽으로",
];

// ── 로컬 프레임 분석 (LLM 없이, 비용 0) ─────────────────────────
const SAMPLE_W = 32;
const SAMPLE_H = 24;
let _sampleCanvas: HTMLCanvasElement | null = null;

function analyzeSample(v: HTMLVideoElement): { brightness: number; sharpness: number; sig: number[] } | null {
  try {
    if (typeof document === "undefined") return null;
    if (!_sampleCanvas) _sampleCanvas = document.createElement("canvas");
    const c = _sampleCanvas;
    c.width = SAMPLE_W;
    c.height = SAMPLE_H;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(v, 0, 0, SAMPLE_W, SAMPLE_H);
    const { data } = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H);
    const luma = new Float64Array(SAMPLE_W * SAMPLE_H);
    let sum = 0;
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const y = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      luma[p] = y;
      sum += y;
    }
    const brightness = sum / luma.length;
    // 선명도: 가로 인접 픽셀 밝기 차의 평균 (흐릴수록 작음)
    let diffSum = 0;
    let n = 0;
    for (let y = 0; y < SAMPLE_H; y++) {
      for (let x = 1; x < SAMPLE_W; x++) {
        diffSum += Math.abs(luma[y * SAMPLE_W + x] - luma[y * SAMPLE_W + x - 1]);
        n++;
      }
    }
    const sharpness = n ? diffSum / n : 0;
    // 8x8 블록평균 서명 (정적 화면 판별용)
    const sig: number[] = [];
    const bw = SAMPLE_W / 8;
    const bh = SAMPLE_H / 8;
    for (let by = 0; by < 8; by++) {
      for (let bx = 0; bx < 8; bx++) {
        let s = 0;
        let cnt = 0;
        for (let yy = Math.floor(by * bh); yy < Math.floor((by + 1) * bh); yy++) {
          for (let xx = Math.floor(bx * bw); xx < Math.floor((bx + 1) * bw); xx++) {
            s += luma[yy * SAMPLE_W + xx];
            cnt++;
          }
        }
        sig.push(cnt ? s / cnt : 0);
      }
    }
    return { brightness, sharpness, sig };
  } catch {
    return null;
  }
}

function sigDiff(a: number[] | null, b: number[] | null): number {
  if (!a || !b || a.length !== b.length) return 999;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
}

export function PhotoLiveCoachOverlay({ evidenceType, jobCd, title, onCapture, onCancel, onFallback }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const lastMessageRef = useRef<string>("");
  const lastSpokenAtRef = useRef<number>(0);
  const shakyVariantIdxRef = useRef(0);
  const darkVariantIdxRef = useRef(0);
  const lastStatusRef = useRef<PhotoCoachStatus | "init">("init");
  const lastSentSigRef = useRef<number[] | null>(null);
  const okStreakRef = useRef(0);
  const stoppedRef = useRef(false);
  const intervalMsRef = useRef(POLL_INTERVAL_MS);
  const capturingRef = useRef(false);
  // LLM 호출이 inflight 일 때 다음 tick 이 와도 중복 호출 안 함 (병렬 호출 1개로 제한).
  const inflightRef = useRef(false);

  const [status, setStatus] = useState<PhotoCoachStatus | "init">("init");
  const [message, setMessage] = useState<string>("카메라를 켜고 있어요...");
  const [permissionError, setPermissionError] = useState<string>("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setPermissionError("이 브라우저는 카메라를 지원하지 않아요");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (!mounted) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => { /* 제스처 부족 — 진행 */ });
        }
        setStatus("wait");
        setMessage("카메라가 켜졌어요");
        setReady(true);
      } catch (e) {
        const name = e instanceof Error ? e.name : "";
        setPermissionError(
          name === "NotAllowedError" ? "카메라 권한이 필요해요"
          : name === "NotFoundError" ? "카메라를 찾을 수 없어요"
          : "카메라를 열 수 없어요 (HTTPS 환경 필요)",
        );
      }
    })();
    // 정적 안내 (흔들림/어둠) 5종을 mount 시 prefetch — 첫 발화부터 Chirp 0 ms 재생.
    for (const v of [...SHAKY_VARIANTS, ...DARK_VARIANTS, "카메라가 켜졌어요"]) {
      void prefetchChirp(v);
    }

    return () => {
      mounted = false;
      stopAllSpeech();
      if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
      if (timeoutRef.current !== null) { window.clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    };
  }, []);

  const captureFrameBlob = useCallback(async (
    quality: number,
    opts?: { cropRatio?: number; maxW?: number; maxH?: number },
  ): Promise<Blob | null> => {
    const v = videoRef.current;
    if (!v || v.videoWidth === 0) return null;
    if (!canvasRef.current) canvasRef.current = document.createElement("canvas");
    const canvas = canvasRef.current;
    const sw = v.videoWidth;
    const sh = v.videoHeight;
    // 1) 중앙 crop — 사용자가 의도한 대상물(중앙) 만 원본 픽셀 그대로 자름.
    const ratio = opts?.cropRatio ?? 1;
    const cw = Math.max(1, Math.min(sw, Math.round(sw * ratio)));
    const ch = Math.max(1, Math.min(sh, Math.round(sh * ratio)));
    const sx = Math.round((sw - cw) / 2);
    const sy = Math.round((sh - ch) / 2);
    // 2) 다운샘플 — crop 영역을 maxW x maxH 안쪽으로. 비율 유지.
    let tw = cw;
    let th = ch;
    const maxW = opts?.maxW;
    const maxH = opts?.maxH;
    if (maxW && maxH && (cw > maxW || ch > maxH)) {
      const scale = Math.min(maxW / cw, maxH / ch);
      tw = Math.max(1, Math.round(cw * scale));
      th = Math.max(1, Math.round(ch * scale));
    }
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(v, sx, sy, cw, ch, 0, 0, tw, th);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", quality));
  }, []);

  // 적응형 폴링 — 로컬 선거름(어둠/흔들림) + 프레임 dedup 으로 LLM 호출을 줄인다.
  useEffect(() => {
    if (!ready || permissionError) return;
    let cancelled = false;

    const schedule = (delay: number) => {
      if (cancelled) return;
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => void runTick(), delay);
    };

    // 같은 안내가 N ms 이상 지났으면 다시 발화 — 흔들림이 계속될 때 침묵하지 않게.
    // Chirp only. 캐시 hit 이면 0ms 재생, miss 면 합성 기다린 후 재생 (그 사이 다른 메시지로
    // 바뀌었으면 stale 한 답은 skip — 발화가 두 번 겹치는 문제 방지).
    const maybeSpeak = async (msg: string) => {
      if (!msg) return;
      const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
      const sameAsBefore = msg === lastMessageRef.current;
      if (sameAsBefore && now - lastSpokenAtRef.current < REPEAT_SPEAK_AFTER_MS) return;
      lastMessageRef.current = msg;
      lastSpokenAtRef.current = now;
      if (speakChirpIfCached(msg)) return;
      await prefetchChirp(msg);
      // 합성 끝났을 때 그 사이 새 메시지가 들어왔으면 — 이미 그 메시지가 lastMessageRef. skip.
      if (lastMessageRef.current !== msg) return;
      speakChirpIfCached(msg);
    };

    const applyLocal = (st: PhotoCoachStatus, msg: string) => {
      lastStatusRef.current = st;
      okStreakRef.current = 0;
      setStatus(st);
      setMessage(msg);
      void maybeSpeak(msg);
    };

    const runTick = async () => {
      if (cancelled) return;
      // 셔터 캡처 중이면 모든 분석 skip.
      if (capturingRef.current) { schedule(intervalMsRef.current); return; }
      const v = videoRef.current;
      if (!v || v.videoWidth === 0) { schedule(1000); return; }

      const sample = analyzeSample(v);

      // ok 안정 후 정지 상태 — 화면이 크게 변했으면(=사용자가 카메라 움직임) 폴링 재개.
      // 변화 없으면 schedule 만 하고 다음 tick 까지 계속 정지.
      if (stoppedRef.current) {
        if (sample && lastSentSigRef.current && sigDiff(sample.sig, lastSentSigRef.current) > SIG_MOVED) {
          stoppedRef.current = false;
          okStreakRef.current = 0;
          lastStatusRef.current = "init";
          intervalMsRef.current = POLL_INTERVAL_MS;
          // 아래 분석 분기로 흘러감 → 다음 안내 즉시 시도.
        } else {
          schedule(intervalMsRef.current);
          return;
        }
      }
      // 1) 너무 어두움 — LLM 없이 로컬 안내 (변형 회전 → 같은 말 반복 방지)
      if (sample && sample.brightness < DARK_LUMA_MIN) {
        const msg = DARK_VARIANTS[darkVariantIdxRef.current % DARK_VARIANTS.length];
        darkVariantIdxRef.current += 1;
        applyLocal("adjust", msg);
        schedule(intervalMsRef.current);
        return;
      }
      // 2) 심한 흔들림/뭉개짐 — LLM 없이 로컬 안내 (변형 회전)
      if (sample && sample.sharpness < BLUR_MIN) {
        const msg = SHAKY_VARIANTS[shakyVariantIdxRef.current % SHAKY_VARIANTS.length];
        shakyVariantIdxRef.current += 1;
        applyLocal("adjust", msg);
        schedule(intervalMsRef.current);
        return;
      }
      // 3) 직전 보낸 화면과 거의 동일 — 재호출 안 하고 간격만 늘림
      if (sample && lastStatusRef.current !== "init" && sigDiff(sample.sig, lastSentSigRef.current) < SIG_STATIC) {
        intervalMsRef.current = Math.min(MAX_POLL_INTERVAL_MS, intervalMsRef.current + 2000);
        schedule(intervalMsRef.current);
        return;
      }
      // 4) 실제 LLM 호출 — inflight 가드 + 응답 await 전에 다음 tick 미리 예약 (병렬).
      if (inflightRef.current) {
        // 이전 호출 아직 안 끝남 — 이 tick 은 skip, 다음 tick 만 예약.
        schedule(intervalMsRef.current);
        return;
      }
      const blob = await captureFrameBlob(COACH_FRAME_QUALITY, {
        cropRatio: COACH_CROP_RATIO,
        maxW: COACH_FRAME_MAX_W,
        maxH: COACH_FRAME_MAX_H,
      });
      if (!blob) { schedule(intervalMsRef.current); return; }
      inflightRef.current = true;
      // 다음 tick 을 응답 기다리기 전에 예약 — LLM 호출과 시간 겹침.
      schedule(intervalMsRef.current);
      try {
        const result = await requestPhotoCoach(blob, evidenceType, jobCd);
        if (cancelled) return;
        if (sample) lastSentSigRef.current = sample.sig;
        const changed = result.status !== lastStatusRef.current;
        lastStatusRef.current = result.status;
        setStatus(result.status);
        setMessage(result.message);
        void maybeSpeak(result.message);
        if (result.status === "ok") {
          okStreakRef.current += 1;
          if (okStreakRef.current >= STABLE_OK_STREAK) {
            // 안정 → 폴링 정지. 단 움직임 감지용으로 sample 분석은 계속 (interval 짧게 유지).
            stoppedRef.current = true;
            intervalMsRef.current = POLL_INTERVAL_MS;
            schedule(intervalMsRef.current);
            return;
          }
        } else {
          okStreakRef.current = 0;
        }
        intervalMsRef.current = changed ? POLL_INTERVAL_MS : Math.min(MAX_POLL_INTERVAL_MS, intervalMsRef.current + 1000);
      } catch (e) {
        console.warn("[photo-coach]", e);
      } finally {
        inflightRef.current = false;
      }
    };

    intervalMsRef.current = POLL_INTERVAL_MS;
    schedule(FIRST_TICK_DELAY_MS);
    return () => {
      cancelled = true;
      if (timeoutRef.current !== null) { window.clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    };
  }, [ready, permissionError, captureFrameBlob, evidenceType, jobCd]);

  const handleShutter = async () => {
    if (capturingRef.current) return;
    capturingRef.current = true;
    stoppedRef.current = true; // 셔터 누르면 폴링 정지 (tick 과 경합 방지)
    stopAllSpeech();
    if (timeoutRef.current !== null) { window.clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    try {
      const blob = await captureFrameBlob(0.92);
      if (!blob) { capturingRef.current = false; stoppedRef.current = false; return; }
      onCapture(new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" }));
    } finally {
      capturingRef.current = false;
    }
  };

  const ok = status === "ok";

  return (
    <div className="absolute inset-0 z-[200] flex flex-col bg-black">
      <video ref={videoRef} playsInline muted autoPlay className="absolute inset-0 h-full w-full object-cover" />

      {/* 중앙 분석 가이드 박스 — 라이브 코칭이 보는 영역(중앙 65%)을 사용자에게 시각화.
          박스 안에 대상물이 들어오도록 유도. 점선 테두리 + 외곽 살짝 어둡게. */}
      {ready && !permissionError && (
        <div className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center">
          <div
            style={{
              width: `${COACH_CROP_RATIO * 100}%`,
              aspectRatio: "4 / 3",
              border: "2px dashed rgba(255,255,255,0.75)",
              borderRadius: 14,
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.22)",
            }}
          />
        </div>
      )}

      {/* 상단 — 메시지 chip + X */}
      <div className="relative z-[1] flex items-start justify-between gap-3 px-4 pt-[calc(env(safe-area-inset-top)+16px)]">
        <div className={`flex-1 rounded-[18px] px-[18px] py-3.5 text-[16px] font-bold leading-snug text-white shadow-[0_4px_14px_rgba(0,0,0,0.3)] [word-break:keep-all] ${permissionError ? "bg-[rgba(161,43,43,0.92)]" : ok ? "bg-[rgba(47,109,79,0.92)]" : "bg-[rgba(0,0,0,0.72)]"}`}>
          {title && !permissionError && <span className="mb-0.5 block text-[13px] font-extrabold text-white/80">{title}</span>}
          {permissionError || message}
        </div>
        <button type="button" onClick={onCancel} aria-label="닫기" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/55 text-white"><X size={24} /></button>
      </div>

      {/* 권한 실패 시 — 갤러리 폴백 */}
      {permissionError && onFallback && (
        <div className="relative z-[1] mt-4 flex justify-center px-4">
          <button type="button" onClick={onFallback} className="flex min-h-[56px] items-center gap-2 rounded-2xl bg-white px-6 text-[17px] font-extrabold text-[color:var(--lv-primary)] shadow-[0_6px_18px_rgba(0,0,0,0.35)]">
            <Images size={22} /> 갤러리에서 사진 고르기
          </button>
        </div>
      )}

      {/* 하단 — 큰 셔터 */}
      <div className="absolute inset-x-0 bottom-0 z-[1] flex items-center justify-center pb-[calc(env(safe-area-inset-bottom)+32px)]">
        <button type="button" onClick={() => void handleShutter()} disabled={!!permissionError} aria-label="사진 찍기"
          className={`flex h-[82px] w-[82px] items-center justify-center rounded-full transition-all ${ok ? "border-4 border-white bg-[var(--lv-primary)] shadow-[0_6px_20px_rgba(47,109,79,0.55)]" : "border-4 border-white/90 bg-white shadow-[0_6px_20px_rgba(0,0,0,0.45)]"} ${permissionError ? "opacity-40" : ""}`}>
          <CameraIcon size={40} className={ok ? "text-white" : "text-[color:var(--lv-primary)]"} />
        </button>
      </div>
    </div>
  );
}
