"use client";

/** 사진 가이드 오버레이 — 증빙 사진 촬영 전 단계 안내.
 *
 *  순서:
 *    1) 위치 확인 (GPS) → accuracy 검사 → 권한 거부면 bypass 옵션
 *    2) 등록 필지와 거리 (Haversine 500m) → 거리 멀면 안내 + bypass 옵션
 *    3) 흔들림 측정 (DeviceMotion) → 안정 권장
 *    4) 사용자가 셔터 → vision-check 호출 → 야외/농경지 분류
 *    5) 통과면 onConfirm(meta), 거부면 다시 찍기
 *
 *  각 단계에 TTS 음성 안내 자동.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, MapPin, Compass, Camera, CheckCircle2, AlertCircle, ChevronRight, X } from "lucide-react";
import { useGeolocation } from "@/lib/geolocation-service";
import { useDeviceMotion } from "@/lib/device-motion-service";
import {
  DEFAULT_PARCEL_RADIUS_M,
  haversineMeters,
  isWithinRadius,
  nearestParcel,
  type ParcelLike,
} from "@/lib/distance-service";
import { speak, stopSpeak, ttsSupported } from "@/lib/tts-service";
import { getApiBaseUrl } from "@/lib/data-source";

/** Vision 결과 — evidence_type 별 다른 schema. */
export type VisionResult =
  | { kind: "photo"; is_outdoor: boolean; is_field: boolean; label: string; reason: string }
  | {
      kind: "receipt";
      is_receipt: boolean;
      is_farm_related: boolean;
      vendor: string;
      amount: number;
      items: string[];
      purchased_at: string;
      label: string;
      reason: string;
    }
  | {
      kind: "certificate";
      is_certificate: boolean;
      is_farm_related: boolean;
      issuer: string;
      title: string;
      issued_at: string;
      label: string;
      reason: string;
    };

export type PhotoGuardMeta = {
  gps?: { lat: number; lng: number; accuracy: number };
  /** 가장 가까운 등록 필지와의 거리 (m). 좌표 없거나 측정 못 하면 undefined. */
  parcel_distance_m?: number;
  /** 매칭된 필지 정보 (있을 때) */
  matched_parcel?: { parcel_no: string; parcel_regno?: string; usage_label?: string };
  /** GPS / 거리 검증을 우회한 경우 */
  bypass_reason?: "denied" | "unavailable" | "out_of_range" | "user_skip";
  /** 흔들림 — 촬영 시점 std */
  motion_stdev?: number;
  /** Vision 결과 — evidence_type 에 따라 schema 다름 */
  vision?: VisionResult;
  /** 어떤 evidence_type 으로 검증했는지 (PIC / RCT / EDU 코드) */
  evidence_type?: string;
};

/** evidence 타입 별 가이드 단계 — 영수증/이수증은 GPS·필지 거리 검증 skip (실내 촬영 자연스러움). */
export type EvidenceKind = "photo" | "receipt" | "certificate";

function deriveEvidenceKind(evidence_type?: string): EvidenceKind {
  const code = (evidence_type || "").toUpperCase();
  if (code.startsWith("RCT")) return "receipt";
  if (code === "EDU") return "certificate";
  return "photo";
}

type StepKey = "gps" | "parcel" | "motion" | "vision";

export function PhotoGuardOverlay({
  parcels,
  evidenceType,
  onConfirm,
  onCancel,
}: {
  /** 등록 필지 목록 — 좌표 있는 필지만 거리 검증에 사용. */
  parcels: ParcelLike[];
  /** 증빙 타입 (PIC / RCT / EDU 코드). 미지정 시 PIC default — GPS+필지 거리 검증. */
  evidenceType?: string;
  /** 검증 통과 시 호출. file = 촬영된 사진, meta = gps/필지/motion/vision 정보. */
  onConfirm: (file: File, meta: PhotoGuardMeta) => void;
  /** 오버레이 닫기 (촬영 취소). */
  onCancel: () => void;
}) {
  const kind = deriveEvidenceKind(evidenceType);
  // 영수증/이수증은 실내 촬영이 자연스러움 → GPS·필지 거리 검증 skip.
  const skipGpsSteps = kind !== "photo";
  const gps = useGeolocation({ enabled: !skipGpsSteps });
  const motion = useDeviceMotion({ enabled: true });
  const [step, setStep] = useState<StepKey>(skipGpsSteps ? "motion" : "gps");
  const [bypass, setBypass] = useState<PhotoGuardMeta["bypass_reason"] | null>(null);
  const [checkingVision, setCheckingVision] = useState(false);
  const [visionResult, setVisionResult] = useState<PhotoGuardMeta["vision"] | null>(null);
  const [visionError, setVisionError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastSpokenRef = useRef<string>("");
  const capturedFileRef = useRef<File | null>(null);

  // 가장 가까운 등록 필지 (좌표 있는 것만)
  const nearest = useMemo(() => {
    if (gps.status !== "ok") return null;
    return nearestParcel({ lat: gps.lat, lng: gps.lng }, parcels);
  }, [gps, parcels]);

  const parcelInRange = nearest ? isWithinRadius(nearest.distanceM, DEFAULT_PARCEL_RADIUS_M) : false;
  const hasAnyParcelCoords = parcels.some((p) => p.gps_lat != null && p.gps_long != null);

  // 단계 자동 진행
  useEffect(() => {
    if (step !== "gps") return;
    if (bypass) {
      setStep("motion"); // bypass 면 parcel 단계 skip 하고 흔들림으로
      return;
    }
    if (gps.status === "denied") setBypass(null); // 사용자 결정 필요
    if (gps.status === "ok") {
      // 좌표 정확도 너무 낮으면 안내, 그래도 다음 단계 진행 가능
      setStep(hasAnyParcelCoords ? "parcel" : "motion");
    }
  }, [step, gps.status, bypass, hasAnyParcelCoords]);

  useEffect(() => {
    if (step !== "parcel") return;
    if (parcelInRange) setStep("motion");
  }, [step, parcelInRange]);

  // TTS 안내 — 같은 메시지 반복 안 함
  useEffect(() => {
    if (!ttsSupported()) return;
    const msg = currentVoice(step, gps, nearest, parcelInRange, motion, bypass);
    if (msg && msg !== lastSpokenRef.current) {
      lastSpokenRef.current = msg;
      speak(msg, { rate: 0.95 });
    }
    return () => {
      // 오버레이 unmount 시 마지막 음성 정리
    };
  }, [step, gps, nearest, parcelInRange, motion, bypass]);

  useEffect(() => () => stopSpeak(), []);

  function handleShutter() {
    fileInputRef.current?.click();
  }

  async function handleFile(file: File | null) {
    if (!file) return;
    capturedFileRef.current = file;
    setCheckingVision(true);
    setVisionError(null);
    setVisionResult(null);
    setStep("vision");
    try {
      const form = new FormData();
      form.append("file", file);
      if (evidenceType) form.append("evidence_type", evidenceType);
      const url = new URL("/photo-guard/check", getApiBaseUrl());
      const resp = await fetch(url.toString(), { method: "POST", body: form });
      if (!resp.ok) throw new Error(`Vision check 실패 (${resp.status})`);
      const data = (await resp.json()) as VisionResult;
      setVisionResult(data);
    } catch (e) {
      setVisionError(e instanceof Error ? e.message : "Vision check 실패");
    } finally {
      setCheckingVision(false);
    }
  }

  function handleConfirm() {
    const file = capturedFileRef.current;
    if (!file) return;
    const meta: PhotoGuardMeta = {
      gps:
        gps.status === "ok"
          ? { lat: gps.lat, lng: gps.lng, accuracy: gps.accuracy }
          : undefined,
      parcel_distance_m: nearest?.distanceM,
      matched_parcel: nearest
        ? {
            parcel_no: nearest.parcel.parcel_no,
            parcel_regno: nearest.parcel.parcel_regno,
            usage_label: nearest.parcel.usage_label,
          }
        : undefined,
      bypass_reason: bypass || undefined,
      motion_stdev: motion.stdev,
      vision: visionResult || undefined,
      evidence_type: evidenceType,
    };
    onConfirm(file, meta);
  }

  function handleRetake() {
    capturedFileRef.current = null;
    setVisionResult(null);
    setVisionError(null);
    setCheckingVision(false);
    setStep("motion");
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(31, 42, 31, 0.92)",
        zIndex: 80,
        display: "flex",
        flexDirection: "column",
        color: "#fff",
        padding: "calc(env(safe-area-inset-top) + 16px) 20px 20px",
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <span style={{ fontSize: 17, fontWeight: 800 }}>
          {kind === "receipt" ? "영수증 찍기 준비" : kind === "certificate" ? "이수증 찍기 준비" : "사진 찍기 준비"}
        </span>
        <button
          type="button"
          onClick={() => {
            stopSpeak();
            onCancel();
          }}
          aria-label="닫기"
          style={{
            background: "rgba(255,255,255,0.12)",
            border: "none",
            borderRadius: 10,
            padding: 8,
            color: "#fff",
            cursor: "pointer",
          }}
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 flex flex-col gap-3 overflow-y-auto">
        {/* 영수증/이수증 안내 — GPS 검증 없음을 명시 */}
        {skipGpsSteps && (
          <div
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 12,
              padding: "10px 14px",
              fontSize: 13,
              fontWeight: 600,
              color: "rgba(255,255,255,0.85)",
              lineHeight: 1.5,
            }}
          >
            {kind === "receipt"
              ? "영수증은 어디서 찍어도 괜찮아요. 글씨가 잘 보이게 찍어주세요."
              : "이수증은 어디서 찍어도 괜찮아요. 발급기관·날짜가 잘 보이게."}
          </div>
        )}

        {/* 1) 위치 단계 — photo (PIC*) 일 때만 노출 */}
        {!skipGpsSteps && (
          <StepCard
            icon={<MapPin className="w-6 h-6" />}
            title="위치 확인"
            status={
              gps.status === "ok"
                ? "ok"
                : gps.status === "loading" || gps.status === "idle"
                  ? "loading"
                  : "warn"
            }
            message={
              gps.status === "loading" || gps.status === "idle"
                ? "위치 확인 중이에요…"
                : gps.status === "ok"
                  ? `위치 확인 완료 (오차 ${Math.round(gps.accuracy)}m)`
                  : gps.status === "denied"
                    ? "위치 사용을 허용해 주시면 더 정확해요"
                    : "위치를 못 받았어요"
            }
            extra={
              gps.status !== "ok" && (
                <BypassButton
                  label="위치 없이 그래도 사진 올릴게요"
                  onClick={() => {
                    setBypass(gps.status === "denied" ? "denied" : "unavailable");
                  }}
                />
              )
            }
          />
        )}

        {/* 2) 필지 거리 단계 — photo + 좌표 등록된 필지가 있을 때만 */}
        {!skipGpsSteps && hasAnyParcelCoords && (
          <StepCard
            icon={<Compass className="w-6 h-6" />}
            title="등록한 논과 거리"
            status={
              bypass
                ? "skip"
                : gps.status !== "ok"
                  ? "wait"
                  : nearest && parcelInRange
                    ? "ok"
                    : nearest
                      ? "warn"
                      : "wait"
            }
            message={
              bypass
                ? "건너뛰었어요"
                : gps.status !== "ok"
                  ? "위치 확인 후 안내해 드려요"
                  : nearest
                    ? parcelInRange
                      ? `'${nearest.parcel.usage_label || "논"}' 안에 계세요 (약 ${Math.round(nearest.distanceM)}m)`
                      : `등록하신 논과 약 ${Math.round(nearest.distanceM)}m 떨어져 있어요`
                    : "거리 측정 중…"
            }
            extra={
              !bypass && nearest && !parcelInRange && (
                <BypassButton
                  label="여기서 찍을게요"
                  onClick={() => setBypass("out_of_range")}
                />
              )
            }
          />
        )}

        {/* 3) 흔들림 단계 */}
        <StepCard
          icon={<Camera className="w-6 h-6" />}
          title="폰 잡은 자세"
          status={
            motion.unsupported
              ? "skip"
              : motion.needsPermission
                ? "warn"
                : motion.level === "stable"
                  ? "ok"
                  : motion.level === "moderate"
                    ? "wait"
                    : "warn"
          }
          message={
            motion.unsupported
              ? "이 폰은 흔들림 측정을 지원하지 않아요"
              : motion.needsPermission
                ? "흔들림 확인을 허용해 주세요"
                : motion.level === "stable"
                  ? "잘 잡고 계세요"
                  : motion.level === "moderate"
                    ? "조금만 더 안정적으로"
                    : "잠시 멈춰주세요"
          }
          extra={
            motion.needsPermission && (
              <button
                type="button"
                onClick={() => void motion.requestPermission()}
                style={{
                  background: "rgba(255,255,255,0.16)",
                  border: "1px solid rgba(255,255,255,0.32)",
                  borderRadius: 10,
                  padding: "8px 12px",
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 700,
                  marginTop: 8,
                }}
              >
                흔들림 확인 허용
              </button>
            )
          }
        />

        {/* 4) Vision 결과 — 셔터 누른 후. evidence_type 별 schema 분기. */}
        {step === "vision" && (
          <StepCard
            icon={<Camera className="w-6 h-6" />}
            title="사진 확인"
            status={
              checkingVision
                ? "loading"
                : visionError
                  ? "warn"
                  : visionResult
                    ? visionResultIsOk(visionResult)
                      ? "ok"
                      : "warn"
                    : "wait"
            }
            message={
              checkingVision
                ? "사진 확인 중이에요…"
                : visionError
                  ? "사진 확인을 못 했어요. 그대로 올릴게요"
                  : visionResult
                    ? `${visionResult.label}${visionResult.reason ? ` · ${visionResult.reason}` : ""}`
                    : ""
            }
          />
        )}

        {/* 영수증 OCR 결과 — 가게/금액/품목 미리보기 */}
        {step === "vision" && visionResult && visionResult.kind === "receipt" && (visionResult.vendor || visionResult.amount) && (
          <div
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 12,
              padding: "12px 14px",
              fontSize: 13,
              color: "rgba(255,255,255,0.92)",
              lineHeight: 1.7,
            }}
          >
            {visionResult.vendor && (
              <div><span style={{ opacity: 0.7 }}>가게</span>　{visionResult.vendor}</div>
            )}
            {visionResult.amount > 0 && (
              <div><span style={{ opacity: 0.7 }}>금액</span>　{visionResult.amount.toLocaleString("ko-KR")}원</div>
            )}
            {visionResult.items && visionResult.items.length > 0 && (
              <div><span style={{ opacity: 0.7 }}>품목</span>　{visionResult.items.join(", ")}</div>
            )}
            {visionResult.purchased_at && (
              <div><span style={{ opacity: 0.7 }}>날짜</span>　{visionResult.purchased_at}</div>
            )}
          </div>
        )}

        {/* 이수증 결과 — 발급기관/이수일 미리보기 */}
        {step === "vision" && visionResult && visionResult.kind === "certificate" && (visionResult.issuer || visionResult.title) && (
          <div
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 12,
              padding: "12px 14px",
              fontSize: 13,
              color: "rgba(255,255,255,0.92)",
              lineHeight: 1.7,
            }}
          >
            {visionResult.issuer && (
              <div><span style={{ opacity: 0.7 }}>발급기관</span>　{visionResult.issuer}</div>
            )}
            {visionResult.title && (
              <div><span style={{ opacity: 0.7 }}>과정</span>　{visionResult.title}</div>
            )}
            {visionResult.issued_at && (
              <div><span style={{ opacity: 0.7 }}>이수일</span>　{visionResult.issued_at}</div>
            )}
          </div>
        )}
      </div>

      {/* 하단 액션 */}
      <div className="flex flex-col gap-2 mt-4">
        {step !== "vision" && (
          <button
            type="button"
            onClick={handleShutter}
            disabled={gps.status === "loading" && !bypass}
            style={{
              background: "var(--primary, #2f6d4f)",
              color: "#fff",
              border: "none",
              borderRadius: 16,
              padding: "18px",
              fontSize: 20,
              fontWeight: 800,
              cursor: "pointer",
              minHeight: 64,
              boxShadow: "0 6px 16px rgba(47, 109, 79, 0.4)",
            }}
          >
            <Camera className="w-6 h-6 inline-block mr-2 align-middle" />
            {kind === "receipt" ? "영수증 찍기" : kind === "certificate" ? "이수증 찍기" : "사진 찍기"}
          </button>
        )}
        {step === "vision" && visionResult && (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={handleConfirm}
              style={{
                background: "var(--primary, #2f6d4f)",
                color: "#fff",
                border: "none",
                borderRadius: 16,
                padding: "18px",
                fontSize: 20,
                fontWeight: 800,
                cursor: "pointer",
                minHeight: 64,
              }}
            >
              <CheckCircle2 className="w-6 h-6 inline-block mr-2 align-middle" />
              이 사진으로 올릴게요
            </button>
            <button
              type="button"
              onClick={handleRetake}
              style={{
                background: "transparent",
                color: "#fff",
                border: "1px solid rgba(255,255,255,0.32)",
                borderRadius: 16,
                padding: "14px",
                fontSize: 16,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              다시 찍기
            </button>
          </div>
        )}
        {step === "vision" && visionError && (
          <button
            type="button"
            onClick={handleConfirm}
            style={{
              background: "var(--primary, #2f6d4f)",
              color: "#fff",
              border: "none",
              borderRadius: 16,
              padding: "18px",
              fontSize: 18,
              fontWeight: 800,
              cursor: "pointer",
              minHeight: 64,
            }}
          >
            그대로 올릴게요
          </button>
        )}
      </div>

      {/* 카메라 input — 폰 기본 카메라 호출 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={(e) => void handleFile(e.target.files?.[0] || null)}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 단계 카드 컴포넌트
// ─────────────────────────────────────────────────────────────

type StepStatus = "loading" | "ok" | "warn" | "wait" | "skip";

function StepCard({
  icon,
  title,
  status,
  message,
  extra,
}: {
  icon: React.ReactNode;
  title: string;
  status: StepStatus;
  message: string;
  extra?: React.ReactNode;
}) {
  const color =
    status === "ok"
      ? "#a3e6b8"
      : status === "warn"
        ? "#ffc97a"
        : status === "loading"
          ? "#bcd6f0"
          : status === "skip"
            ? "rgba(255,255,255,0.5)"
            : "rgba(255,255,255,0.8)";
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.08)",
        border: "1px solid rgba(255,255,255,0.14)",
        borderRadius: 16,
        padding: "14px 16px",
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: "rgba(255,255,255,0.12)",
          color,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {status === "loading" ? <Loader2 className="w-5 h-5 animate-spin" /> : icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.72)", margin: 0 }}>
          {title}
        </p>
        <p style={{ fontSize: 16, fontWeight: 700, color, margin: "2px 0 0", lineHeight: 1.4 }}>
          {message}
        </p>
        {extra}
      </div>
      {status === "ok" && <CheckCircle2 className="w-5 h-5 flex-shrink-0" style={{ color: "#a3e6b8" }} />}
      {status === "warn" && <AlertCircle className="w-5 h-5 flex-shrink-0" style={{ color: "#ffc97a" }} />}
    </div>
  );
}

/** Vision 결과 평가 — evidence_type 별 schema. OK 면 true (UI 초록), 아니면 warn (노랑). */
function visionResultIsOk(v: VisionResult | null | undefined): boolean {
  if (!v) return false;
  if (v.kind === "photo") return v.is_field || v.is_outdoor;
  if (v.kind === "receipt") return v.is_receipt && v.is_farm_related;
  if (v.kind === "certificate") return v.is_certificate;
  return false;
}

function BypassButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: "rgba(255,255,255,0.16)",
        border: "1px solid rgba(255,255,255,0.32)",
        borderRadius: 10,
        padding: "8px 12px",
        color: "#fff",
        fontSize: 13,
        fontWeight: 700,
        marginTop: 8,
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        cursor: "pointer",
      }}
    >
      {label}
      <ChevronRight className="w-4 h-4" />
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// TTS 안내 메시지 결정 — 같은 메시지 반복 방지용 단일 string 반환
// ─────────────────────────────────────────────────────────────

function currentVoice(
  step: StepKey,
  gps: ReturnType<typeof useGeolocation>,
  nearest: { parcel: ParcelLike; distanceM: number } | null,
  inRange: boolean,
  motion: ReturnType<typeof useDeviceMotion>,
  bypass: PhotoGuardMeta["bypass_reason"] | null,
): string {
  if (step === "gps") {
    if (gps.status === "loading" || gps.status === "idle") return "위치를 확인하고 있어요";
    if (gps.status === "denied") return "위치 사용을 허용해 주세요";
    if (gps.status === "ok") return "위치 확인 완료";
    return "위치를 못 받았어요";
  }
  if (step === "parcel") {
    if (bypass) return "";
    if (!nearest) return "";
    if (!inRange) return `등록하신 논에서 약 ${Math.round(nearest.distanceM)}미터 떨어져 있어요`;
    return "논 안에 계세요";
  }
  if (step === "motion") {
    if (motion.unsupported || motion.needsPermission) return "";
    if (motion.level === "shaking") return "잠시 멈춰주세요";
    if (motion.level === "stable") return "이제 사진 찍어주세요";
  }
  return "";
}
