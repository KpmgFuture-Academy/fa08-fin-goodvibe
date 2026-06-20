"use client"

/**
 * 설정 패널 — 원본 chief 디자인(lvb-settings).
 *
 * 보기 모드(쉬운/표준) + 글자 크기(보통/크게/아주 크게) + 로그아웃.
 * 값은 SettingsContext 가 관리. Shell 의 lvb-main 이 그 값을 className/zoom 으로 적용.
 */
import { useCallback, useEffect } from "react"
import { Check, LogOut, X } from "lucide-react"
import {
  TEXT_ZOOM,
  useChiefSettings,
  type TextSize,
  type ViewMode,
} from "@/components/SettingsContext"
import ModalPortal from "@/components/chief/ModalPortal"

const TEXT_SIZES = Object.keys(TEXT_ZOOM) as TextSize[]

export default function SettingsPanel({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const { viewMode, textSize, setViewMode, setTextSize } = useChiefSettings()

  const onLogout = useCallback(() => {
    try {
      window.localStorage.removeItem("chief-session")
      window.localStorage.removeItem("currentUserVillageInfo")
    } catch {}
    window.location.href = "/"
  }, [])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, onClose])

  const onView = (v: ViewMode) => setViewMode(v)
  const onText = (s: TextSize) => setTextSize(s)

  return (
    <ModalPortal open={open}>
    <div className="lvb-modal-scrim" onClick={onClose}>
      <div
        className="lvb-modal lvb-settings"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="lvb-modal-head">
          <div>
            <div className="lvb-modal-title">설정</div>
            <div className="lvb-modal-sub">화면을 보기 편하게 맞춰요</div>
          </div>
          <button
            type="button"
            className="lvb-iconbtn"
            onClick={onClose}
            aria-label="닫기"
          >
            <X size={20} />
          </button>
        </div>

        <div className="lvb-modal-body">
          <div className="lvb-set-label">보기 모드</div>
          <div className="lvb-set-modes" role="radiogroup" aria-label="보기 모드">
            <button
              type="button"
              role="radio"
              aria-checked={viewMode === "easy"}
              className={`lvb-set-mode${viewMode === "easy" ? " is-on" : ""}`}
              onClick={() => onView("easy")}
            >
              <div className="lvb-set-mode-demo easy" aria-hidden="true">
                <span /><span /><span />
              </div>
              <div className="lvb-set-mode-name">
                쉬운 보기
                {viewMode === "easy" && <Check size={17} />}
              </div>
              <div className="lvb-set-mode-desc">
                글씨·버튼이 크고, 핵심만 보여드려요
              </div>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={viewMode === "standard"}
              className={`lvb-set-mode${viewMode === "standard" ? " is-on" : ""}`}
              onClick={() => onView("standard")}
            >
              <div className="lvb-set-mode-demo std" aria-hidden="true">
                <span /><span /><span /><span />
              </div>
              <div className="lvb-set-mode-name">
                표준 보기
                {viewMode === "standard" && <Check size={17} />}
              </div>
              <div className="lvb-set-mode-desc">
                한 화면에 더 많은 정보를 보여드려요
              </div>
            </button>
          </div>

          <div className="lvb-set-label">글자 크기</div>
          <div
            className="lvb-set-textsize"
            role="radiogroup"
            aria-label="글자 크기"
          >
            {TEXT_SIZES.map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={textSize === s}
                className={`lvb-set-txt${textSize === s ? " is-on" : ""}`}
                onClick={() => onText(s)}
              >
                <span
                  aria-hidden="true"
                  style={{
                    fontSize: s === "보통" ? 16 : s === "크게" ? 19 : 22,
                  }}
                >
                  가
                </span>
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="lvb-modal-foot">
          <button
            type="button"
            className="lvb-btn lvb-btn-ghost lvb-btn-lg"
            onClick={onLogout}
          >
            <LogOut size={20} />
            <span>로그아웃</span>
          </button>
          <button
            type="button"
            className="lvb-btn lvb-btn-primary lvb-btn-lg"
            onClick={onClose}
          >
            다 됐어요
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}
