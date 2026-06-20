/**
 * 진척률 계산 공통 헬퍼.
 *
 * backend 의 `_compute_status` 는 "모든 필수 증빙이 다 제출돼야" completed 라 판정해서,
 * 일부만 올린 todo 가 통째로 0 으로 잡힌다. 이장 화면(시연·운영)에서는 부분 제출도 진척
 * 으로 보여줘야 농가의 노력이 시각화되니, 제출 비율(`submitted / required`) 로 환산.
 *
 * 규칙:
 *   - computed_status === "completed"       → 1.0
 *   - required > 0                          → min(1, submitted / required)
 *   - computed_status === "in_progress"     → 0.5 (필수 없음 + 일지·증빙 있음)
 *   - 그 외 (pending)                        → 0
 *
 * 사용 위치: 대시보드 마을 진행률, 사업 목록·상세의 진척, 농가 카드의 done/total.
 */
import type { AdminTodoStatusItem } from "@/lib/admin-types"

export function todoCompletionRatio(t: AdminTodoStatusItem): number {
  const req = t.required_evidence_types?.length ?? 0
  const sub = t.submitted_evidence_types?.length ?? 0
  if (t.computed_status === "completed") return 1
  if (req > 0) return Math.min(1, sub / req)
  if (t.computed_status === "in_progress") return 0.5
  return 0
}

export type ProgressAgg = {
  /** 진척 합 (0~total). */
  done: number
  /** todo 개수. */
  total: number
  /** done/total. total=0 면 0. */
  ratio: number
  /** 백분율(반올림). 표시용. */
  pct: number
  /** 참여 농가 수 (todo 의 farmer_id distinct). */
  participants: number
}

export function aggregateTodos(items: Iterable<AdminTodoStatusItem>): ProgressAgg {
  let done = 0
  let total = 0
  const farmerSet = new Set<string>()
  for (const t of items) {
    total += 1
    done += todoCompletionRatio(t)
    if (t.farmer_id) farmerSet.add(t.farmer_id)
  }
  const ratio = total > 0 ? done / total : 0
  return {
    done,
    total,
    ratio,
    pct: Math.round(ratio * 100),
    participants: farmerSet.size,
  }
}

/** 정수 done/total 형태로 표시 (소수점 반올림). 농가 카드의 "참여 사업 진척 0/10" 용. */
export function aggregateAsInt(items: Iterable<AdminTodoStatusItem>): { done: number; total: number } {
  const agg = aggregateTodos(items)
  return { done: Math.round(agg.done), total: agg.total }
}
