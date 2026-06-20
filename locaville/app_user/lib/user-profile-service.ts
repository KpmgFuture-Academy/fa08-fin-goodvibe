/**
 * 농가 본인 프로필 — backend `/user-ville/current-user?farmer_id=...` 클라이언트.
 * SettingsScreen 의 "내 정보" 카드에 표시.
 *
 * 응답: { user: { user_name, phone_no, addr_1, addr_2, login_id, amo_regno, ... },
 *         village: { ville_name, addr_1, addr_2, ... } }
 * 실패/네트워크 오류 시 user/village 모두 null 반환 → 호출 측이 fallback.
 */
import { getApiBaseUrl } from "./data-source";

export type UserProfile = {
  user_no?: number;
  user_name?: string;
  amo_regno?: string;
  login_id?: string;
  phone_no?: string;
  email?: string;
  zip_cd?: string;
  addr_1?: string;
  addr_2?: string;
  ville_id?: string;
};

export type VillageProfile = {
  ville_id?: string;
  ville_name?: string;
  zip_cd?: string;
  addr_1?: string;
  addr_2?: string;
  phone_no?: string;
};

export async function fetchCurrentUserProfile(farmerId: string): Promise<{
  user: UserProfile | null;
  village: VillageProfile | null;
}> {
  if (!farmerId) return { user: null, village: null };
  const url = new URL("/user-ville/current-user", getApiBaseUrl());
  url.searchParams.set("farmer_id", farmerId);
  try {
    const resp = await fetch(url.toString(), { cache: "no-store" });
    if (!resp.ok) return { user: null, village: null };
    const data = (await resp.json()) as { user?: UserProfile; village?: VillageProfile };
    return { user: data.user || null, village: data.village || null };
  } catch {
    return { user: null, village: null };
  }
}
