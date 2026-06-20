"use client"

/**
 * "검토 필요" 증빙 카드 리스트.
 *
 * 각 카드: 농가명 + 증빙 유형 + 등록일 + [확인 완료] / [재촬영 요청] 두 버튼.
 * 확인 완료는 즉시 PATCH, 재촬영 요청은 `RetakeRequestModal` 경유 (메시지 입력 후 저장).
 * 저장 후 0.9초 동안 인라인 성공 메시지 노출 → 목록 새로고침.
 */
import { useState } from "react"
import { Camera, CheckCircle2, RefreshCw } from "lucide-react"
import { patchEvidenceStatus } from "@/lib/admin-api"
import type { AdminEvidenceItem } from "@/lib/admin-types"
import { labelActivityType, labelEvidence } from "@/lib/labels"
import { resolveImageUrl } from "@/lib/image-url"
import { Btn } from "@/components/ui/Btn"
import { Badge } from "@/components/ui/Badge"
import { EmptyState } from "@/components/ui/EmptyState"
import { RetakeRequestModal } from "@/components/dashboard/RetakeRequestModal"

function formatDate(value?: string) {
  if (!value) return ""
  try {
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return value
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  } catch {
    return value
  }
}

function displayName(item: AdminEvidenceItem) {
  return item.farmer_name && item.farmer_name.trim() ? item.farmer_name : item.farmer_id
}

type CardState = "idle" | "saving-confirm" | "saving-retake" | "done-confirm" | "done-retake"

export function ReviewNeededList({
  items,
  onUpdated,
}: {
  items: AdminEvidenceItem[]
  onUpdated: () => void
}) {
  const [cardState, setCardState] = useState<Record<string, CardState>>({})
  const [retakeTarget, setRetakeTarget] = useState<AdminEvidenceItem | null>(null)
  const [retakeSaving, setRetakeSaving] = useState(false)
  const [error, setError] = useState("")

  function setState(id: string, state: CardState) {
    setCardState((prev) => ({ ...prev, [id]: state }))
  }

  async function applyConfirm(item: AdminEvidenceItem) {
    setError("")
    setState(item.evidence_id, "saving-confirm")
    try {
      await patchEvidenceStatus(item.evidence_id, {
        status: "confirmed",
        confirmed_label: item.confirmed_label || item.evidence_type,
      })
      setState(item.evidence_id, "done-confirm")
      // 짧게 성공 표시 후 목록 새로고침 (해당 카드는 검토 필요에서 빠짐)
      setTimeout(() => onUpdated(), 900)
    } catch (e) {
      setError(e instanceof Error ? e.message : "상태 저장에 실패했습니다.")
      setState(item.evidence_id, "idle")
    }
  }

  async function applyRetake(item: AdminEvidenceItem, message: string) {
    setError("")
    setRetakeSaving(true)
    setState(item.evidence_id, "saving-retake")
    try {
      await patchEvidenceStatus(item.evidence_id, {
        status: "retake_required",
        user_message: message,
      })
      setState(item.evidence_id, "done-retake")
      setRetakeTarget(null)
      setTimeout(() => onUpdated(), 900)
    } catch (e) {
      setError(e instanceof Error ? e.message : "상태 저장에 실패했습니다.")
      setState(item.evidence_id, "idle")
    } finally {
      setRetakeSaving(false)
    }
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<CheckCircle2 size={36} />}
        title="지금 확인할 증빙이 없습니다"
        description="농가에서 새 증빙이 올라오면 이 자리에 표시됩니다."
      />
    )
  }

  return (
    <div className="review-list">
      {error && <div className="alert alert-error">오류: {error}</div>}
      {items.map((item) => {
        const state = cardState[item.evidence_id] ?? "idle"
        const isSaving = state === "saving-confirm" || state === "saving-retake"
        const evidenceLabel = labelEvidence({
          confirmedLabel: item.confirmed_label,
          evidenceType: item.evidence_type,
        })
        const activityLabel = labelActivityType(item.activity_type)
        const farmerLabel = displayName(item)

        return (
          <div key={item.evidence_id} className="review-card">
            <div className="review-thumb">
              {(() => {
                const src = resolveImageUrl(item.image_url)
                return src ? (
                  <img src={src} alt={evidenceLabel} loading="lazy" />
                ) : (
                  <Camera size={32} />
                )
              })()}
            </div>
            <div className="review-info">
              <div className="review-name">{farmerLabel}</div>
              <div className="review-meta">
                {activityLabel ? `${activityLabel} · ` : ""}
                {evidenceLabel} · {formatDate(item.captured_at)}
              </div>
              {item.user_message && <div className="review-message">{item.user_message}</div>}
              <div style={{ marginTop: 8 }}>
                <Badge status={item.status} />
              </div>
            </div>
            <div className="review-actions">
              {state === "done-confirm" ? (
                <div className="review-success">
                  <CheckCircle2 size={20} />
                  <span>확인 완료로 저장했어요</span>
                </div>
              ) : state === "done-retake" ? (
                <div className="review-success review-success-retake">
                  <CheckCircle2 size={20} />
                  <span>재촬영 요청을 남겼어요</span>
                </div>
              ) : (
                <>
                  <Btn
                    variant="primary"
                    size="md"
                    icon={<CheckCircle2 size={16} />}
                    disabled={isSaving}
                    onClick={() => void applyConfirm(item)}
                  >
                    {state === "saving-confirm" ? "저장 중..." : "확인 완료"}
                  </Btn>
                  <Btn
                    variant="danger"
                    size="md"
                    icon={<RefreshCw size={16} />}
                    disabled={isSaving}
                    onClick={() => setRetakeTarget(item)}
                  >
                    재촬영 요청
                  </Btn>
                </>
              )}
            </div>
          </div>
        )
      })}

      <RetakeRequestModal
        open={retakeTarget !== null}
        farmerLabel={retakeTarget ? displayName(retakeTarget) : ""}
        evidenceLabel={
          retakeTarget
            ? labelEvidence({
                confirmedLabel: retakeTarget.confirmed_label,
                evidenceType: retakeTarget.evidence_type,
              })
            : ""
        }
        saving={retakeSaving}
        onClose={() => {
          if (!retakeSaving) setRetakeTarget(null)
        }}
        onSubmit={async (message) => {
          if (retakeTarget) await applyRetake(retakeTarget, message)
        }}
      />
    </div>
  )
}
