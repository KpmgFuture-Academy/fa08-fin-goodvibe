/** 기록 도우미 (`farm_helper`) — 농가 측 API 클라이언트.
 *
 * backend:
 *   GET  /farmer/{farmer_id}/farm-helpers/current
 *   POST /farmer/{farmer_id}/farm-helpers/{helper_user_no}/{help_seq}/approve
 */
import { getApiBaseUrl } from "./data-source";

export type FarmHelperPair = {
  helper_user_no: number;
  help_seq: number;
  recipient_user_no: number;
  helper_name: string | null;
  recipient_name: string | null;
  /** frontend 가 helper mode 시 effective farmer_id 로 swap 하기 위해 함께 노출. */
  helper_amo_regno: string | null;
  recipient_amo_regno: string | null;
  assigned_at: string | null;
  helper_approved_at: string | null;
  recipient_approved_at: string | null;
  est_end_date: string | null;
  real_end_date: string | null;
  is_active: boolean;
  is_pending: boolean;
};

export type HelperRoleResponse = {
  /** "helper" | "recipient" | "none" */
  role: "helper" | "recipient" | "none";
  pair: FarmHelperPair | null;
};

function urlFor(path: string): string {
  return new URL(path, getApiBaseUrl()).toString();
}

export async function fetchCurrentHelperRole(farmer_id: string): Promise<HelperRoleResponse> {
  if (!farmer_id) return { role: "none", pair: null };
  const resp = await fetch(urlFor(`/farmer/${encodeURIComponent(farmer_id)}/farm-helpers/current`), {
    cache: "no-store",
  });
  if (!resp.ok) return { role: "none", pair: null };
  return (await resp.json()) as HelperRoleResponse;
}

export async function approveHelperPair(
  farmer_id: string,
  helper_user_no: number,
  help_seq: number,
): Promise<FarmHelperPair | null> {
  if (!farmer_id) return null;
  const resp = await fetch(
    urlFor(
      `/farmer/${encodeURIComponent(farmer_id)}/farm-helpers/${helper_user_no}/${help_seq}/approve`,
    ),
    { method: "POST" },
  );
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`동의 처리에 실패했어요: ${text || resp.status}`);
  }
  return (await resp.json()) as FarmHelperPair;
}
