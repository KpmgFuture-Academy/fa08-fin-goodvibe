/**
 * 상태 뱃지. backend 상태 코드를 한국어 + 색 톤으로 자동 변환.
 *
 * `status` 만 넘기면 TONE_BY_STATUS 매핑으로 라벨·톤 자동. 매핑이 없거나
 * 커스텀 라벨이 필요하면 `label`/`tone` 으로 명시.
 */
export type BadgeTone =
  | "neutral"
  | "ok"
  | "warn"
  | "danger"
  | "muted"

/** backend 가 돌려주는 상태 코드 → 한국어 라벨 + 시각 톤. */
const TONE_BY_STATUS: Record<string, { tone: BadgeTone; label: string }> = {
  confirmed: { tone: "ok", label: "확인 완료" },
  completed: { tone: "ok", label: "완료" },
  saved: { tone: "muted", label: "저장됨" },
  created: { tone: "muted", label: "생성됨" },
  in_progress: { tone: "warn", label: "진행 중" },
  needs_review: { tone: "warn", label: "검토 필요" },
  manual_review_required: { tone: "warn", label: "수동 확인" },
  retake_required: { tone: "danger", label: "재촬영 필요" },
  pending: { tone: "neutral", label: "대기" },
}

/** 상태 라벨용 알약 뱃지. status 단독 / label+tone 명시 / status+label 오버라이드 모두 지원. */
export function Badge({
  status,
  label,
  tone,
}: {
  status?: string
  label?: string
  tone?: BadgeTone
}) {
  const fromStatus = status ? TONE_BY_STATUS[status] : undefined
  const finalLabel = label ?? fromStatus?.label ?? status ?? ""
  const finalTone = tone ?? fromStatus?.tone ?? "neutral"
  return <span className={`badge badge-${finalTone}`}>{finalLabel}</span>
}
