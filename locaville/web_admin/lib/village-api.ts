import type {
  VillageDetailResponse,
  VillageListResponse,
} from "@/lib/village-types"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000"

export const VILLAGE_CONNECTION_ERROR_MESSAGE =
  "백엔드에 연결할 수 없습니다. FastAPI 서버 실행 상태를 확인해 주세요."

function buildUrl(path: string): string {
  return new URL(path, API_BASE_URL).toString()
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, {
      ...init,
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
    })
  } catch {
    throw new Error(VILLAGE_CONNECTION_ERROR_MESSAGE)
  }

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`API ${response.status}: ${text || response.statusText}`)
  }

  return (await response.json()) as T
}

export async function getVillageList(): Promise<VillageListResponse> {
  return requestJson<VillageListResponse>(buildUrl("/village"))
}

export async function getVillageDetail(villeId: string): Promise<VillageDetailResponse> {
  return requestJson<VillageDetailResponse>(
    buildUrl(`/village/${encodeURIComponent(villeId)}`),
  )
}
