"use client"

/**
 * 사업·단체에 농가 참여시키기 모달 — 원본 chief 디자인(lvb-pick-list / lvb-pick).
 *
 * candidates 에서 체크박스 다중 선택 후 onAdd(ids) 로 일괄 등록.
 */
import { useState } from "react"
import { Check, UserPlus, X } from "lucide-react"
import ModalPortal from "./ModalPortal"

export type EngageCandidate = {
  id: string
  name: string
  sub?: string
}

export default function EngageAddModal({
  open,
  groupName,
  candidates,
  onClose,
  onAdd,
}: {
  open: boolean
  groupName: string
  candidates: EngageCandidate[]
  onClose: () => void
  onAdd: (ids: string[]) => void
}) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set())

  const toggle = (id: string) => {
    setPicked((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  const close = () => {
    setPicked(new Set())
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
            <div className="lvb-modal-title">농가 참여시키기</div>
            <div className="lvb-modal-sub">
              {groupName || "이 사업"}에 참여할 농가를 골라요
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
          {candidates.length === 0 ? (
            <div className="lvb-empty">
              <span className="lvb-empty-ic">
                <UserPlus size={26} />
              </span>
              <div className="lvb-empty-title">참여시킬 농가가 없어요</div>
              <div className="lvb-empty-sub">
                마을 농가가 모두 이미 참여 중이에요
              </div>
            </div>
          ) : (
            <ul
              className="lvb-pick-list"
              role="group"
              aria-label="참여시킬 농가 선택"
            >
              {candidates.map((c) => {
                const on = picked.has(c.id)
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      className={`lvb-pick${on ? " is-on" : ""}`}
                      onClick={() => toggle(c.id)}
                    >
                      <span className="lvb-check-box" aria-hidden="true">
                        {on && <Check size={16} />}
                      </span>
                      <div>
                        <div className="lvb-pick-name">{c.name}</div>
                        {c.sub && <div className="lvb-pick-sub">{c.sub}</div>}
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
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
            disabled={picked.size === 0}
            onClick={() => {
              onAdd([...picked])
              setPicked(new Set())
            }}
          >
            <UserPlus size={22} />
            <span>
              {picked.size > 0
                ? `${picked.size}명 참여시키기`
                : "참여시키기"}
            </span>
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}
