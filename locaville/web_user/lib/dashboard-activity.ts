// 대시보드 첫 화면용 데이터 도출 헬퍼.
// backend는 활동/농가 단위의 미제출을 직접 알려주지 않으므로,
// 현재 가용 데이터(todo-status, evidence, summary)로 추정합니다.

import type {
  AdminEvidenceItem,
  AdminSummary,
  AdminTodoStatusItem,
} from "@/lib/admin-types"
import {
  ACTIVITIES,
  ACTIVITY_BY_CODE,
  ACTIVITY_BY_EVIDENCE_TYPE,
  type ActivityCode,
  type ActivityDef,
} from "@/lib/activities"

export type FarmerRef = {
  farmer_id: string
  farmer_name: string
}

export type ActivityStats = {
  activity: ActivityDef
  earliestDue: string | null // ISO date "YYYY-MM-DD"
  hasOpenTodo: boolean
  totalTodos: number
  completedTodos: number
  submittedFarmers: FarmerRef[]
  unsubmittedFarmers: FarmerRef[]
  exampleEvidence: AdminEvidenceItem | null
}

const SUBMITTED_STATUSES = new Set([
  "confirmed",
  "needs_review",
  "manual_review_required",
  "retake_required",
])

function parseISODate(value: string | null | undefined): Date | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function earliestDate(values: Array<string | null | undefined>): string | null {
  let best: Date | null = null
  for (const v of values) {
    const d = parseISODate(v)
    if (!d) continue
    if (!best || d.getTime() < best.getTime()) best = d
  }
  return best ? isoDate(best) : null
}

export function formatKoreanDate(value: string | null | undefined): string {
  const d = parseISODate(value)
  if (!d) return ""
  return `${d.getMonth() + 1}월 ${d.getDate()}일`
}

export function buildFarmerPool(
  summary: AdminSummary | null,
  evidence: AdminEvidenceItem[],
): Map<string, FarmerRef> {
  const pool = new Map<string, FarmerRef>()
  for (const f of summary?.diaries_by_farmer || []) {
    if (!f.farmer_id) continue
    pool.set(f.farmer_id, {
      farmer_id: f.farmer_id,
      farmer_name: f.farmer_name || "",
    })
  }
  for (const e of evidence) {
    if (!e.farmer_id) continue
    if (!pool.has(e.farmer_id)) {
      pool.set(e.farmer_id, {
        farmer_id: e.farmer_id,
        farmer_name: e.farmer_name || "",
      })
    } else if (e.farmer_name) {
      const existing = pool.get(e.farmer_id)!
      if (!existing.farmer_name) existing.farmer_name = e.farmer_name
    }
  }
  return pool
}

function evidenceActivityCode(e: AdminEvidenceItem): ActivityCode | null {
  if (e.job_cd) {
    const code = e.job_cd.toUpperCase() as ActivityCode
    if (ACTIVITY_BY_CODE[code]) return code
  }
  if (e.evidence_type) {
    const code = ACTIVITY_BY_EVIDENCE_TYPE[e.evidence_type]
    if (code) return code
  }
  return null
}

function todoActivityCode(t: AdminTodoStatusItem): ActivityCode | null {
  if (t.job_cd) {
    const code = t.job_cd.toUpperCase() as ActivityCode
    if (ACTIVITY_BY_CODE[code]) return code
  }
  return null
}

export function computeActivityStats({
  todos,
  evidence,
  farmerPool,
}: {
  todos: AdminTodoStatusItem[]
  evidence: AdminEvidenceItem[]
  farmerPool: Map<string, FarmerRef>
}): Record<ActivityCode, ActivityStats> {
  const result = {} as Record<ActivityCode, ActivityStats>

  // 활동별 todos 그룹화
  const todosByActivity = new Map<ActivityCode, AdminTodoStatusItem[]>()
  for (const t of todos) {
    const code = todoActivityCode(t)
    if (!code) continue
    if (!todosByActivity.has(code)) todosByActivity.set(code, [])
    todosByActivity.get(code)!.push(t)
  }

  // 활동별 evidence 그룹화
  const evidenceByActivity = new Map<ActivityCode, AdminEvidenceItem[]>()
  for (const e of evidence) {
    const code = evidenceActivityCode(e)
    if (!code) continue
    if (!evidenceByActivity.has(code)) evidenceByActivity.set(code, [])
    evidenceByActivity.get(code)!.push(e)
  }

  for (const activity of ACTIVITIES) {
    const activityTodos = todosByActivity.get(activity.code) || []
    const activityEvidence = evidenceByActivity.get(activity.code) || []

    const dueDates = activityTodos.map((t) => t.due_date || null)
    const earliestDue = earliestDate(dueDates)

    const completed = activityTodos.filter((t) => t.computed_status === "completed").length
    const hasOpenTodo = activityTodos.length > completed

    // 제출한 농가: 해당 활동의 evidence가 있고 status가 의미있는 제출 상태인 농가
    const submittedSet = new Set<string>()
    for (const e of activityEvidence) {
      if (!e.farmer_id) continue
      if (SUBMITTED_STATUSES.has(e.status)) submittedSet.add(e.farmer_id)
    }

    const submittedFarmers: FarmerRef[] = []
    const unsubmittedFarmers: FarmerRef[] = []
    for (const ref of farmerPool.values()) {
      if (submittedSet.has(ref.farmer_id)) {
        submittedFarmers.push(ref)
      } else {
        unsubmittedFarmers.push(ref)
      }
    }

    // 모범사진: confirmed evidence 중 image_url 있는 첫 번째
    const exampleEvidence =
      activityEvidence.find((e) => e.status === "confirmed" && e.image_url) ||
      activityEvidence.find((e) => e.image_url) ||
      null

    result[activity.code] = {
      activity,
      earliestDue,
      hasOpenTodo,
      totalTodos: activityTodos.length,
      completedTodos: completed,
      submittedFarmers: submittedFarmers.sort((a, b) => a.farmer_id.localeCompare(b.farmer_id)),
      unsubmittedFarmers: unsubmittedFarmers.sort((a, b) =>
        a.farmer_id.localeCompare(b.farmer_id),
      ),
      exampleEvidence,
    }
  }

  return result
}

// 「지금 활동」 자동 추천:
// 1) hasOpenTodo === true 인 활동만
// 2) earliestDue 임박 우선 (오늘에 가까운 미래; 지난 것은 더 우선)
// 3) 동률이면 unsubmittedFarmers.length 많은 쪽
export function recommendCurrentActivity(
  stats: Record<ActivityCode, ActivityStats>,
): ActivityCode | null {
  const candidates = ACTIVITIES.map((a) => stats[a.code]).filter((s) => s && s.hasOpenTodo)
  if (candidates.length === 0) {
    // 열린 todo가 없으면 미제출 농가가 가장 많은 활동
    const fallback = ACTIVITIES.map((a) => stats[a.code])
      .filter((s) => s && s.unsubmittedFarmers.length > 0)
      .sort((a, b) => b.unsubmittedFarmers.length - a.unsubmittedFarmers.length)
    return fallback[0]?.activity.code ?? null
  }

  const sorted = [...candidates].sort((a, b) => {
    const da = a.earliestDue ? new Date(a.earliestDue).getTime() : Number.POSITIVE_INFINITY
    const db = b.earliestDue ? new Date(b.earliestDue).getTime() : Number.POSITIVE_INFINITY
    if (da !== db) return da - db
    return b.unsubmittedFarmers.length - a.unsubmittedFarmers.length
  })
  return sorted[0]?.activity.code ?? null
}

export function listOtherActivities(
  stats: Record<ActivityCode, ActivityStats>,
  excludeCode: ActivityCode | null,
  limit = 3,
): ActivityStats[] {
  const list = ACTIVITIES.map((a) => stats[a.code])
    .filter((s) => s && s.activity.code !== excludeCode)
    .filter((s) => s.hasOpenTodo || s.unsubmittedFarmers.length > 0)

  list.sort((a, b) => {
    const da = a.earliestDue ? new Date(a.earliestDue).getTime() : Number.POSITIVE_INFINITY
    const db = b.earliestDue ? new Date(b.earliestDue).getTime() : Number.POSITIVE_INFINITY
    if (da !== db) return da - db
    return b.unsubmittedFarmers.length - a.unsubmittedFarmers.length
  })

  return list.slice(0, limit)
}
