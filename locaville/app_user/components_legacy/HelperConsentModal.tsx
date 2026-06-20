"use client";

/** 기록 도우미 동의 모달.
 *
 * 본인이 helper 또는 recipient 로 배정됐고, 본인 동의가 아직 안 된 경우 노출.
 * - helper 측: "○○○ 농가를 대신해 기록할 수 있도록 합니다. 동의하시겠어요?"
 * - recipient 측: "○○○ 님이 당신의 기록을 도울 수 있도록 합니다. 동의하시겠어요?"
 */
import { useState } from "react";
import { HeartHandshake, X } from "lucide-react";
import type { FarmHelperPair } from "@/lib/farm-helper-service";

export function HelperConsentModal({
  pair,
  myRole,
  myFarmerId,
  open,
  onClose,
  onApprove,
  onDecline,
}: {
  pair: FarmHelperPair;
  myRole: "helper" | "recipient";
  myFarmerId: string;
  open: boolean;
  onClose: () => void;
  onApprove: () => Promise<void> | void;
  /** "거절" — 일단 모달만 닫음. 실제 backend 거절 endpoint 는 향후 추가. */
  onDecline?: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const counterpart = myRole === "helper" ? pair.recipient_name : pair.helper_name;
  const counterpartLabel = counterpart || (myRole === "helper" ? pair.recipient_user_no : pair.helper_user_no);

  const title =
    myRole === "helper"
      ? `${counterpartLabel}님의 기록을 도와드릴까요?`
      : `${counterpartLabel}님이 기록을 도와드린대요`;

  const description =
    myRole === "helper"
      ? `이장님께서 ${counterpartLabel}님의 영농일지와 사진 올리는 걸 도와달라고 부탁하셨어요. 동의하시면 ${counterpartLabel}님 대신 기록을 남겨주실 수 있어요.`
      : `이장님께서 ${counterpartLabel}님께 기록을 도와드리라고 부탁하셨어요. 동의하시면 ${counterpartLabel}님이 영농일지와 사진을 대신 올려드려요.`;

  async function handleApprove() {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onApprove();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div
        role="button"
        tabIndex={-1}
        aria-label="모달 닫기"
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(31, 42, 31, 0.5)",
          zIndex: 70,
        }}
      />
      <div
        role="dialog"
        aria-modal
        style={{
          position: "fixed",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(92vw, 420px)",
          background: "#fff",
          borderRadius: 16,
          zIndex: 71,
          padding: "22px 22px 18px",
          boxShadow: "0 12px 36px rgba(31, 42, 31, 0.22)",
        }}
      >
        <button
          type="button"
          aria-label="닫기"
          onClick={onClose}
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            minWidth: 40,
            minHeight: 40,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "transparent",
            border: "none",
            color: "var(--ink-soft)",
            cursor: "pointer",
          }}
        >
          <X className="w-5 h-5" />
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              background: "var(--primary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <HeartHandshake className="w-6 h-6 text-white" />
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: "var(--ink)", margin: 0, lineHeight: 1.35 }}>
            {title}
          </h2>
        </div>

        <p style={{ fontSize: 14, fontWeight: 700, color: "var(--ink-soft)", margin: 0, lineHeight: 1.65 }}>
          {description}
        </p>

        <div
          style={{
            marginTop: 16,
            padding: "12px 14px",
            background: "var(--bg-soft, #f7f5ef)",
            borderRadius: 10,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-soft)" }}>예정 종료일</span>
          <span style={{ fontSize: 16, fontWeight: 800, color: "var(--ink)" }}>
            {pair.est_end_date || "지정 없음"}
          </span>
          <span style={{ fontSize: 11, color: "var(--ink-soft)", fontWeight: 600 }}>
            이장님께서 끝낼 때까지 계속 도와드려요.
          </span>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
          <button
            type="button"
            onClick={onDecline ? onDecline : onClose}
            disabled={submitting}
            style={{
              flex: 1,
              padding: "12px 14px",
              borderRadius: 10,
              border: "1px solid var(--line)",
              background: "#fff",
              color: "var(--ink-soft)",
              fontSize: 15,
              fontWeight: 700,
              cursor: submitting ? "not-allowed" : "pointer",
            }}
          >
            나중에
          </button>
          <button
            type="button"
            onClick={() => void handleApprove()}
            disabled={submitting}
            style={{
              flex: 1.4,
              padding: "12px 14px",
              borderRadius: 10,
              border: "none",
              background: "var(--primary)",
              color: "#fff",
              fontSize: 15,
              fontWeight: 800,
              cursor: submitting ? "not-allowed" : "pointer",
              boxShadow: "0 4px 12px rgba(47, 109, 79, 0.25)",
            }}
          >
            {submitting ? "처리 중…" : "동의해요"}
          </button>
        </div>

        <p style={{ fontSize: 10, color: "var(--muted)", margin: "10px 0 0", textAlign: "center", fontWeight: 600 }}>
          내({myFarmerId}) 동의로 기록돼요.
        </p>
      </div>
    </>
  );
}
