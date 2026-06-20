"use client";

/** 알림 클릭 시 종류별로 후속 작업을 묻는 confirm 모달.
 *
 *  - kind="photo" : 사진/증빙 관련 알림 → 사진으로 기록하기 (photoInput) 화면
 *  - kind="voice" : 영농일지/할일 관련 알림 → 음성으로 기록하기 (voiceInput) 화면
 *
 *  HelperConsentModal 과 동일한 톤 (가운데 팝업 + dim backdrop + 두 버튼).
 */

import { Camera, NotebookPen, X } from "lucide-react";

export type NotificationActionKind = "photo" | "voice";

export function NotificationActionPromptModal({
  open,
  kind,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  kind: NotificationActionKind;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  const isPhoto = kind === "photo";
  const title = isPhoto ? "사진을 찍으러 가실까요?" : "음성으로 기록하시겠어요?";
  const description = isPhoto
    ? "지금 바로 한 장 찍어서 올리실 수 있어요."
    : "말씀만 하시면 영농일지가 자동으로 적혀요.";
  const Icon = isPhoto ? Camera : NotebookPen;
  const confirmLabel = isPhoto ? "사진 찍으러 가기" : "음성으로 기록하기";

  return (
    <>
      <div
        role="button"
        tabIndex={-1}
        aria-label="모달 닫기"
        onClick={onCancel}
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
          width: "min(92vw, 380px)",
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
          onClick={onCancel}
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
            <Icon className="w-6 h-6 text-white" />
          </div>
          <h2
            style={{
              fontSize: 18,
              fontWeight: 800,
              color: "var(--ink)",
              margin: 0,
              lineHeight: 1.35,
            }}
          >
            {title}
          </h2>
        </div>

        <p
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: "var(--ink-soft)",
            margin: 0,
            lineHeight: 1.65,
          }}
        >
          {description}
        </p>

        <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              flex: 1,
              padding: "12px 14px",
              borderRadius: 10,
              border: "1px solid var(--line)",
              background: "#fff",
              color: "var(--ink-soft)",
              fontSize: 15,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            나중에
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              flex: 1.4,
              padding: "12px 14px",
              borderRadius: 10,
              border: "none",
              background: "var(--primary)",
              color: "#fff",
              fontSize: 15,
              fontWeight: 800,
              cursor: "pointer",
              boxShadow: "0 4px 12px rgba(47, 109, 79, 0.25)",
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </>
  );
}
