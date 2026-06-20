/**
 * 이장 화면 frontend 의 choice 타입 작업 거울.
 * backend `app/services/job_schedule.py` 의 JOB_SCHEDULE choice 룰과 동기.
 *
 * 가을 윈도우 진입 시 봄에 못 한 농가들의 todo 가 자동으로 dashboard 응답에 들어와,
 * 처리함 nudge 로 노출 + 별도 시즌 배너 신호로 활용.
 */
import type { AdminTodoStatusItem } from "@/lib/admin-types"

export const CHOICE_JOB_LABELS: Record<string, string> = {
  RD001: "바이오차",
}

export function isChoiceJob(jobCd: string | undefined | null): boolean {
  return Boolean(jobCd && CHOICE_JOB_LABELS[jobCd])
}

/** 활성 시즌 배너 데이터. 한 작업의 가을 윈도우 진입 시 봄 미완료 농가 카운트 등. */
export type SeasonBanner = {
  jobCd: string
  jobLabel: string
  /** "가을 시즌이 시작됐어요" 같은 카피 — UI 가 그대로 사용. */
  headline: string
  /** "봄에 못 한 12 농가가 처리함에 떴어요" */
  detail: string
  farmerCount: number
}

/** todos 에서 choice 타입 활성 윈도우 todo 를 모아 배너로 변환. */
export function deriveSeasonBanners(todos: AdminTodoStatusItem[], today: Date = new Date()): SeasonBanner[] {
  const month = today.getMonth() + 1
  const isAutumn = month >= 8 && month <= 9
  const isSpring = month >= 3 && month <= 5
  const seasonName = isAutumn ? "가을" : isSpring ? "봄" : ""
  if (!seasonName) return []

  // 각 choice job_cd 별 농가 수 집계.
  const byJob = new Map<string, Set<string>>()
  for (const t of todos) {
    if (!isChoiceJob(t.job_cd)) continue
    const fid = t.farmer_id
    if (!fid) continue
    const set = byJob.get(t.job_cd!) ?? new Set<string>()
    set.add(fid)
    byJob.set(t.job_cd!, set)
  }

  const banners: SeasonBanner[] = []
  for (const [jobCd, set] of byJob) {
    const jobLabel = CHOICE_JOB_LABELS[jobCd]
    banners.push({
      jobCd,
      jobLabel,
      headline: `${jobLabel} ${seasonName} 시즌이 시작됐어요`,
      detail:
        seasonName === "가을"
          ? `봄에 못 한 ${set.size} 농가가 처리함에 떴어요`
          : `${set.size} 농가가 처리함에 떴어요`,
      farmerCount: set.size,
    })
  }
  return banners
}
