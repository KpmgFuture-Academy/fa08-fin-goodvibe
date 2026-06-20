/**
 * v0_chief 가 호출하는 backend `/farmer/*` API 클라이언트.
 *
 * 농가 단위 조회 (현재는 필지 목록만). `lib/admin-api.ts` 의 일반 admin 흐름과
 * 분리해 둔 이유: farmer/{id}/parcels 는 농가 식별자 1개를 path 로 받는 단순
 * GET 이라 admin 쪽 fetcher 와 인터페이스가 달라서.
 *
 * `usageToCrop` / `parcelDisplayName` 은 화면에서 자주 쓰는 표시용 헬퍼로,
 * backend 응답 raw 값을 사람이 읽기 좋은 한국어로 변환합니다.
 */
import { BACKEND_CONNECTION_ERROR_MESSAGE } from "@/lib/admin-api"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000"

export type FarmerParcel = {
  parcel_no: string
  parcel_regno: string
  usage: string
  parcel_usage?: string
  /** backend 가 code_detail(grp_cd='PARCEL') JOIN 으로 채워주는 한글 라벨. 예: "논", "밭", "과수원". */
  usage_label?: string
  addr_1: string
  addr_2: string
  area: number | null
  parcel_area?: number | null
}

/** backend 가 못 채운 경우의 보조 매핑 — 시드 환경/legacy 코드 호환용 폴백만. */
const USAGE_FALLBACK: Record<string, string> = {
  RPA: "논",
  DFA: "밭",
  ORC: "과수원",
  LST: "임야",
  FRT: "시설",
}

/** backend usage_label 우선, 없으면 fallback dict, 그것도 없으면 raw 코드. */
export function usageToCrop(parcelOrUsage: FarmerParcel | string): string {
  if (typeof parcelOrUsage === "string") {
    return USAGE_FALLBACK[parcelOrUsage.toUpperCase()] || parcelOrUsage || ""
  }
  const usageCode = parcelOrUsage.parcel_usage || parcelOrUsage.usage || ""
  return parcelOrUsage.usage_label || USAGE_FALLBACK[usageCode.toUpperCase()] || usageCode || ""
}

/** parcel_no/addr_2/parcel_regno 중 사람이 식별 가능한 이름. */
export function parcelDisplayName(parcel: FarmerParcel): string {
  if (parcel.addr_2) return parcel.addr_2
  if (parcel.parcel_no) return `${parcel.parcel_no}번 필지`
  return parcel.parcel_regno || "필지"
}

/** 농가가 보유한 필지 목록. farmer_id 는 amo_regno / login_id / user_no 어떤 형태도 OK. */
export async function getFarmerParcels(farmerId: string): Promise<FarmerParcel[]> {
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}/farmer/${encodeURIComponent(farmerId)}/parcels`, {
      cache: "no-store",
    })
  } catch {
    throw new Error(BACKEND_CONNECTION_ERROR_MESSAGE)
  }
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`API ${response.status}: ${text || response.statusText}`)
  }
  const data = (await response.json()) as { items?: FarmerParcel[] }
  return data.items || []
}
