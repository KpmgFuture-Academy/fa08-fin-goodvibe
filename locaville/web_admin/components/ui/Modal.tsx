"use client"

/**
 * 공용 모달 컴포넌트.
 *
 * - Escape 키로 닫기
 * - 모달 열린 동안 body 스크롤 잠금
 * - backdrop 클릭으로 닫기 (모달 본체 클릭은 stopPropagation 으로 보호)
 * - role="dialog" / aria-modal — 접근성
 */
import { useEffect } from "react"
import type { ReactNode } from "react"
import { X } from "lucide-react"

let bodyScrollLockCount = 0
let bodyScrollPrevOverflow = ""

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  width = "560px",
  hideHeader = false,
  showCloseButton = true,
  closeOnBackdrop = true,
  closeOnEscape = true,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: string
  hideHeader?: boolean
  showCloseButton?: boolean
  closeOnBackdrop?: boolean
  closeOnEscape?: boolean
}) {
  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (closeOnEscape && e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleKey)
    if (bodyScrollLockCount === 0) {
      bodyScrollPrevOverflow = document.body.style.overflow
      document.body.style.overflow = "hidden"
    }
    bodyScrollLockCount += 1
    return () => {
      document.removeEventListener("keydown", handleKey)
      bodyScrollLockCount = Math.max(0, bodyScrollLockCount - 1)
      if (bodyScrollLockCount === 0) {
        document.body.style.overflow = bodyScrollPrevOverflow
        bodyScrollPrevOverflow = ""
      }
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="modal-backdrop" onClick={closeOnBackdrop ? onClose : undefined}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        style={{ maxWidth: width, maxHeight: "calc(100vh - 32px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {!hideHeader ? (
          <div className="modal-head">
            <h2 className="modal-title">{title}</h2>
            {showCloseButton ? (
              <button type="button" className="modal-close" onClick={onClose} aria-label="닫기">
                <X size={22} />
              </button>
            ) : null}
          </div>
        ) : null}
        <div className="modal-body">
          {children}
        </div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}
