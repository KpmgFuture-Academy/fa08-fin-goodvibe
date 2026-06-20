"use client"

/**
 * "미제출 농가 안내 문구 만들기" 모달.
 *
 * 미제출 농가 명단 + 자동 생성된 안내 문구(textarea, 편집 가능). 이장님은 문구를
 * 클립보드에 복사해서 카카오톡·문자 등으로 직접 발송. **자동 발송 기능 없음** —
 * 푸터에 명시. 활동별 기본 문구는 `lib/activities.ts` 의 `buildGroupNoticeMessage`.
 */
import { useEffect, useMemo, useState } from "react"
import { CheckCircle2, Copy, Sparkles, Users } from "lucide-react"
import { Modal } from "@/components/ui/Modal"
import { Btn } from "@/components/ui/Btn"
import { buildGroupNoticeMessage, type ActivityDef } from "@/lib/activities"
import { formatKoreanDate, type FarmerRef } from "@/lib/dashboard-activity"
import { requestEvidenceGuide } from "@/lib/admin-api"

const PREVIEW_LIMIT = 8

export function NoticeTemplateModal({
  open,
  activity,
  farmers,
  dueDate,
  onClose,
}: {
  open: boolean
  activity: ActivityDef
  farmers: FarmerRef[]
  dueDate: string | null
  onClose: () => void
}) {
  const dueLabel = dueDate ? formatKoreanDate(dueDate) : null

  const defaultText = useMemo(
    () => buildGroupNoticeMessage({ activity, dueLabel }),
    [activity, dueLabel],
  )

  const [text, setText] = useState<string>(defaultText)
  const [copied, setCopied] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiNotice, setAiNotice] = useState<string>("")

  // 활동을 바꾸거나 모달을 다시 열면 기본 문구로 리셋
  useEffect(() => {
    if (open) {
      setText(defaultText)
      setCopied(false)
      setExpanded(false)
      setAiNotice("")
    }
  }, [open, defaultText])

  // AI 로 안내문 다듬기 — 실패해도 기존 textarea 내용 유지.
  async function handleRefineWithAi() {
    if (aiLoading) return
    setAiLoading(true)
    setAiNotice("")
    try {
      const response = await requestEvidenceGuide({
        activity_type: activity.name,
        missing_evidence_types: activity.evidenceTypes,
      })
      const refined = (response?.message || "").trim()
      if (refined) {
        setText(refined)
        setCopied(false)
        setAiNotice("AI 가 안내문을 다듬었어요. 필요하면 직접 수정해 주세요.")
      } else {
        setAiNotice("AI 응답이 비어 있어 기본 문구를 유지했어요.")
      }
    } catch (err) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : "AI 안내문 생성에 실패했어요. 기본 문구를 그대로 보내셔도 돼요."
      setAiNotice(message)
    } finally {
      setAiLoading(false)
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2200)
    } catch {
      // 클립보드 권한이 없는 환경 — 사용자에게 textarea 선택 안내
    }
  }

  function resetText() {
    setText(defaultText)
  }

  const previewFarmers = expanded ? farmers : farmers.slice(0, PREVIEW_LIMIT)
  const hidden = Math.max(0, farmers.length - previewFarmers.length)

  return (
    <Modal
      open={open}
      title={`${activity.name} 미제출 농가 안내`}
      onClose={onClose}
      width="720px"
      footer={
        <div className="notice-footer">
          <span className="muted notice-footer-note">
            ※ 자동 문자·카카오톡 발송 기능은 없습니다. 문구를 복사해서 직접 보내주세요.
          </span>
          <div className="notice-footer-buttons">
            <Btn variant="outline" size="md" onClick={onClose}>
              닫기
            </Btn>
            <Btn
              variant="primary"
              size="lg"
              icon={copied ? <CheckCircle2 size={18} /> : <Copy size={18} />}
              onClick={() => void handleCopy()}
              disabled={!text.trim()}
            >
              {copied ? "복사했어요" : "문구 복사하기"}
            </Btn>
          </div>
        </div>
      }
    >
      <div className="notice-grid">
        <section className="notice-farmers">
          <div className="notice-section-head">
            <Users size={18} />
            <span>미제출 농가 {farmers.length}곳</span>
          </div>
          {farmers.length === 0 ? (
            <div className="muted notice-empty">미제출 농가가 없습니다.</div>
          ) : (
            <>
              <ul className="notice-farmer-list">
                {previewFarmers.map((f) => (
                  <li key={f.farmer_id}>
                    <span className="notice-farmer-name">{f.farmer_name || f.farmer_id}</span>
                    {f.farmer_name && f.farmer_id !== f.farmer_name && (
                      <span className="notice-farmer-id"> · {f.farmer_id}</span>
                    )}
                  </li>
                ))}
              </ul>
              {hidden > 0 && (
                <button
                  type="button"
                  className="notice-expand"
                  onClick={() => setExpanded(true)}
                >
                  {hidden}명 더 보기
                </button>
              )}
            </>
          )}
        </section>

        <section className="notice-message">
          <label className="notice-message-label" htmlFor="notice-text">
            보낼 안내 문구 (수정할 수 있어요)
          </label>
          <textarea
            id="notice-text"
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setCopied(false)
            }}
            rows={9}
            className="notice-textarea"
            spellCheck={false}
            disabled={aiLoading}
          />
          {aiNotice && <div className="notice-ai-hint muted">{aiNotice}</div>}
          <div className="notice-message-actions">
            <button
              type="button"
              className="notice-link-btn"
              onClick={() => void handleRefineWithAi()}
              disabled={aiLoading}
            >
              <Sparkles size={14} style={{ marginRight: 4, verticalAlign: "-2px" }} />
              {aiLoading ? "AI 가 다듬는 중…" : "AI 로 다듬기"}
            </button>
            <button
              type="button"
              className="notice-link-btn"
              onClick={resetText}
              disabled={aiLoading}
            >
              기본 문구로 되돌리기
            </button>
          </div>
        </section>
      </div>
    </Modal>
  )
}
