/**
 * v0_chief 가 호출하는 backend `/ville-project` API 클라이언트.
 *
 * 마을(ville_id) / 그룹(group_no) / 농가(farmer_id) 중 하나로 필터해 그
 * 컨텍스트에서 진행중인 사업 + 참여단체 list 를 반환합니다.
 *
 * residents 화면에서의 사용처:
 *   - `getProjectsByFarmer`: 주민 상세에서 농가의 참여사업/단체 카드 + 영농일지
 *     필터 옵션 채울 때.
 *   - `getProjectsByVille`: 주민 추가/수정 모달의 사업/단체 dropdown 채울 때.
 */
import { BACKEND_CONNECTION_ERROR_MESSAGE } from "@/lib/admin-api"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000"

export type VilleProject = {
  prj_id: string
  project_id?: string
  prj_name: string
  exec_year?: number
  biz_name?: string
  group_no?: number | null
  group_name?: string
  ville_id?: string
}

type VilleProjectListResponse = { items?: VilleProject[] }

async function fetchVilleProjects(query: Record<string, string>): Promise<VilleProject[]> {
  const url = new URL("/ville-project", API_BASE_URL)
  for (const [k, v] of Object.entries(query)) {
    if (v) url.searchParams.set(k, v)
  }
  let response: Response
  try {
    response = await fetch(url.toString(), { cache: "no-store" })
  } catch {
    throw new Error(BACKEND_CONNECTION_ERROR_MESSAGE)
  }
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`API ${response.status}: ${text || response.statusText}`)
  }
  const data = (await response.json()) as VilleProjectListResponse
  return data.items || []
}

/** 농가가 참여중인 사업 + 단체 list. (login_id/amo_regno 등 어떤 farmer_id 도 OK) */
export function getProjectsByFarmer(farmerId: string): Promise<VilleProject[]> {
  return fetchVilleProjects({ farmer_id: farmerId })
}

/** 마을 전체에서 진행중인 사업 + 단체 list. (사업 추가 모달의 dropdown 용) */
export function getProjectsByVille(villeId: string): Promise<VilleProject[]> {
  return fetchVilleProjects({ ville_id: villeId })
}
