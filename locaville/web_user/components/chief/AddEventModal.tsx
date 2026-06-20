"use client"

/**
 * 마을 일정 직접 추가 모달 — 원본 chief 디자인(lvb-modal + lvb-form-field).
 *
 * 입력: 날짜 / 제목 / 메모. 저장 시 onAdd 호출.
 * 시연 단계 — backend 저장은 호출 측이 localStorage 등으로 처리.
 */
import { useState } from "react"
import { CalendarPlus, X } from "lucide-react"
import ModalPortal from "./ModalPortal"

export type EventDraft = {
  date: string  // YYYY-MM-DD
  title: string
  memo: string
}

export default function AddEventModal({
  open,
  defaultDate,
  onClose,
  onAdd,
}: {
  open: boolean
  defaultDate?: string  // YYYY-MM-DD, 기본 오늘
  onClose: () => void
  onAdd: (draft: EventDraft) => void
}) {
  const today = (() => {
    const d = new Date()
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    return `${y}-${m}-${day}`
  })()
  const [date, setDate] = useState(defaultDate || today)
  const [title, setTitle] = useState("")
  const [memo, setMemo] = useState("")

  const ok = date && title.trim().length > 0

  const reset = () => {
    setDate(defaultDate || today)
    setTitle("")
    setMemo("")
  }
  const close = () => {
    reset()
    onClose()
  }

  return (
    <ModalPortal open={open}>
    <div className="lvb-modal-scrim" onClick={close}>
      <div
        className="lvb-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="lvb-modal-head">
          <div>
            <div className="lvb-modal-title">일정 추가</div>
            <div className="lvb-modal-sub">
              마을 회의·교육 같은 일정을 달력에 적어 둬요
            </div>
          </div>
          <button
            type="button"
            className="lvb-iconbtn"
            onClick={close}
            aria-label="닫기"
          >
            <X size={20} />
          </button>
        </div>

        <div className="lvb-modal-body">
          <label className="lvb-form-field">
            <span>
              날짜 <b className="lvb-req" aria-hidden="true">*</b>
              <span className="lvb-sr">필수</span>
            </span>
            <input
              className="lvb-input"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-required="true"
            />
          </label>

          <label className="lvb-form-field">
            <span>
              제목 <b className="lvb-req" aria-hidden="true">*</b>
              <span className="lvb-sr">필수</span>
            </span>
            <input
              className="lvb-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예) 마을회관 점검"
              aria-required="true"
            />
          </label>

          <label className="lvb-form-field">
            <span>메모 <span className="lvb-field-hint">(선택)</span></span>
            <textarea
              className="lvb-textarea"
              rows={3}
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="자세히 적어 두면 나중에 알아보기 쉬워요"
            />
          </label>
        </div>

        <div className="lvb-modal-foot">
          <button
            type="button"
            className="lvb-btn lvb-btn-ghost lvb-btn-lg"
            onClick={close}
          >
            취소
          </button>
          <button
            type="button"
            className="lvb-btn lvb-btn-primary lvb-btn-lg"
            disabled={!ok}
            onClick={() => {
              onAdd({ date, title: title.trim(), memo: memo.trim() })
              reset()
            }}
          >
            <CalendarPlus size={22} />
            <span>일정 추가</span>
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}
