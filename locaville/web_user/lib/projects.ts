/**
 * 마을 사업 목록 — backend `/project` 에서 동적으로 받아오는 구조.
 *
 * 예전엔 PRJ2026LC / PRJ2026PUB 두 사업을 하드코딩했지만, 새 시드 / 다른 마을에도
 * 작동하도록 항상 backend 응답을 사용한다. 활동(activities) 도 응답에 포함.
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000"

export type VillageActivity = {
  activity_id: string
  activity_name: string
  start_date: string | null
  end_date: string | null
}

export type VillageProject = {
  prj_id: string
  project_id: string
  prj_name: string
  exec_year: number | null
  biz_name: string
  group_no: number | null
  group_name: string
  ville_id: string
  activities: VillageActivity[]
  /** 사업 상세 카드의 "기간" 표기용 — 활동 범위에서 자동 계산. */
  period: string
  /** 활동 이름 리스트 (UI 호환용). */
  items: string[]
}

function buildPeriod(activities: VillageActivity[]): string {
  const starts = activities.map((a) => a.start_date).filter(Boolean) as string[]
  const ends = activities.map((a) => a.end_date).filter(Boolean) as string[]
  if (starts.length === 0 && ends.length === 0) return ""
  const minStart = starts.length > 0 ? starts.reduce((a, b) => (a < b ? a : b)) : ""
  const maxEnd = ends.length > 0 ? ends.reduce((a, b) => (a > b ? a : b)) : ""
  const fmt = (iso: string) => {
    if (!iso) return ""
    const [y, m] = iso.split("-")
    return `${y}.${m}`
  }
  return `${fmt(minStart)} – ${fmt(maxEnd)}`.replace(/^ – /, "").replace(/ – $/, "")
}

function normalize(raw: VillageProject): VillageProject {
  const activities = (raw.activities || []) as VillageActivity[]
  return {
    ...raw,
    activities,
    period: raw.period || buildPeriod(activities),
    items: (raw.items && raw.items.length > 0)
      ? raw.items
      : activities.map((a) => a.activity_name).filter(Boolean),
  }
}

/** 그룹 또는 마을의 사업 목록 + 활동. group_no/ville_id 둘 다 비면 빈 결과. */
export async function fetchVillageProjects(params: {
  group_no?: number | null
  ville_id?: string | null
}): Promise<VillageProject[]> {
  const url = new URL("/ville-project", API_BASE_URL)
  if (params.group_no != null) url.searchParams.set("group_no", String(params.group_no))
  if (params.ville_id) url.searchParams.set("ville_id", params.ville_id)
  try {
    const resp = await fetch(url.toString(), { cache: "no-store" })
    if (!resp.ok) return []
    const data = (await resp.json()) as { items?: VillageProject[] }
    return (data.items || []).map(normalize)
  } catch {
    return []
  }
}
