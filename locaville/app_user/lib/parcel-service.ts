/** 농가 필지 정보를 backend `/farmer/{id}/parcels` 에서 받아 모듈 캐시에 보관.
 *
 *  - `fetchFarmerParcels()` : backend 호출
 *  - `primeFarmerParcels()` : 결과를 모듈 캐시에 보관 (앱 부트 시 호출)
 *  - `getCachedParcels()`   : 다른 sync helper(parcel-reference 등)가 활용
 *
 *  PARCELS 정적 배열은 voice/manual 텍스트 alias 매칭용 seed 로만 유지하고,
 *  실제 필지 데이터(parcel_no/parcel_regno/usage/주소)는 backend 가 권위.
 */
import { getApiBaseUrl } from "./data-source";

export type FarmerParcel = {
  parcel_no: string;
  parcel_regno: string;
  /** 필지 고유 이름(예: "앞논"). 없으면 빈 문자열. */
  parcel_name?: string;
  usage: string;
  /** usage 코드의 한글 라벨(예: parcel_usage="RPA" → "논"). backend code_detail JOIN. */
  usage_label?: string;
  addr_1: string;
  addr_2: string;
  area: number | string | null;
};

let cachedParcels: FarmerParcel[] = [];

export async function fetchFarmerParcels(farmer_id: string): Promise<FarmerParcel[]> {
  if (!farmer_id) return [];
  const url = new URL(`/farmer/${encodeURIComponent(farmer_id)}/parcels`, getApiBaseUrl());
  const resp = await fetch(url.toString(), { cache: "no-store" });
  if (!resp.ok) return [];
  const data = (await resp.json()) as { items?: FarmerParcel[] };
  return data.items || [];
}

export function primeFarmerParcels(parcels: FarmerParcel[]): void {
  cachedParcels = parcels;
}

export function getCachedParcels(): FarmerParcel[] {
  return cachedParcels;
}
