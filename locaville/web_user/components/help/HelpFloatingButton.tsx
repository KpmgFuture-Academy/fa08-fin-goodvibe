"use client"

/**
 * 모든 페이지 우하단 floating 도움말 버튼 + 클릭 시 panel slide-up.
 *
 * Shell 안에 한 번만 mount → 모든 페이지에서 노출. Sidebar 메뉴 대체.
 * 카카오 톡채널 / Intercom 같은 패턴.
 */
import { useEffect, useState } from "react"
import { HelpCircle, X } from "lucide-react"

import { HelpChat } from "./HelpChat"

export function HelpFloatingButton() {
  const [open, setOpen] = useState(false)

  // ESC 로 panel 닫기.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open])

  return (
    <>
      {/* Floating 버튼 — 우하단 fixed. panel 열려도 같이 보이고 X 로 바뀜. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "도움말 닫기" : "도움말 열기"}
        style={{
          position: "fixed",
          right: 28,
          bottom: 28,
          zIndex: 1100,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "18px 28px",
          background: "var(--lvb-accent, #2f6d4f)",
          color: "#ffffff",
          border: "none",
          borderRadius: 999,
          fontSize: 18,
          fontWeight: 800,
          letterSpacing: "0.01em",
          cursor: "pointer",
          boxShadow: "0 10px 30px rgba(28, 74, 54, 0.45), 0 3px 8px rgba(0,0,0,0.12)",
          transition: "transform 0.12s ease, box-shadow 0.12s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "translateY(-1px)"
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "translateY(0)"
        }}
      >
        {open ? <X size={22} /> : <HelpCircle size={22} />}
        <span>{open ? "닫기" : "도움말"}</span>
      </button>

      {/* Slide-up panel — 버튼 위쪽으로 나타남. 데스크탑 크기 고정 (작은 화면 폴백 X — 이장님은 데스크탑). */}
      {open && (
        <div
          role="dialog"
          aria-label="도움말 챗봇"
          style={{
            position: "fixed",
            right: 28,
            bottom: 108,  // 더 큰 버튼(약 60px) + 여백
            zIndex: 1000,
            width: 520,
            maxWidth: "calc(100vw - 56px)",
            height: 720,
            maxHeight: "calc(100vh - 140px)",
            display: "flex",
            flexDirection: "column",
            background: "var(--lvb-card, #ffffff)",
            border: "1px solid var(--lvb-line, #e8e1ce)",
            borderRadius: 16,
            overflow: "hidden",
            boxShadow:
              "0 16px 48px rgba(31, 42, 31, 0.18), 0 4px 12px rgba(31, 42, 31, 0.10)",
            animation: "help-panel-in 0.18s ease-out",
          }}
        >
          <style jsx global>{`
            @keyframes help-panel-in {
              from { opacity: 0; transform: translateY(12px); }
              to { opacity: 1; transform: translateY(0); }
            }
          `}</style>

          {/* Panel 헤더 */}
          <div
            style={{
              padding: "18px 22px",
              borderBottom: "1px solid var(--lvb-line, #e8e1ce)",
              background: "var(--lvb-accent, #2f6d4f)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <HelpCircle size={22} />
              <strong style={{ fontSize: 18, letterSpacing: "0.01em" }}>도움말</strong>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="닫기"
              style={{
                background: "rgba(255,255,255,0.18)",
                color: "#fff",
                border: "none",
                borderRadius: 10,
                padding: 8,
                cursor: "pointer",
                display: "flex",
              }}
            >
              <X size={20} />
            </button>
          </div>

          <HelpChat />
        </div>
      )}
    </>
  )
}
