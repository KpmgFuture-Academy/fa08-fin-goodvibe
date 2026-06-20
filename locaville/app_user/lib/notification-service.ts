/** v0_farmer 측 알림(notification) API 클라이언트.
 *
 * backend `/farmer/{farmer_id}/notifications/*` 호출 wrapper.
 * 헤더 종 아이콘 + slide-up panel 이 사용.
 */
import { getApiBaseUrl } from "./data-source";

export type FarmerNotification = {
  notice_no: number;
  sender_cd: string;
  content_cd: string;
  title: string;
  content: string;
  action_url: string | null;
  related_no: number | null;
  read_at: string | null;
  sent_at: string | null;
  reg_at: string | null;
};

function url(path: string): string {
  return new URL(path, getApiBaseUrl()).toString();
}

export async function fetchFarmerNotifications(farmer_id: string, limit = 30): Promise<FarmerNotification[]> {
  if (!farmer_id) return [];
  const u = new URL(`/farmer/${encodeURIComponent(farmer_id)}/notifications`, getApiBaseUrl());
  u.searchParams.set("limit", String(limit));
  const resp = await fetch(u.toString(), { cache: "no-store" });
  if (!resp.ok) return [];
  const data = (await resp.json()) as { items?: FarmerNotification[] };
  return data.items || [];
}

export async function fetchFarmerUnreadCount(farmer_id: string): Promise<number> {
  if (!farmer_id) return 0;
  const resp = await fetch(url(`/farmer/${encodeURIComponent(farmer_id)}/notifications/unread-count`), {
    cache: "no-store",
  });
  if (!resp.ok) return 0;
  const data = (await resp.json()) as { count?: number };
  return data.count ?? 0;
}

export async function markFarmerNotificationRead(farmer_id: string, notice_no: number): Promise<void> {
  if (!farmer_id) return;
  await fetch(url(`/farmer/${encodeURIComponent(farmer_id)}/notifications/${notice_no}/read`), {
    method: "PATCH",
  });
}

export async function markAllFarmerNotificationsRead(farmer_id: string): Promise<number> {
  if (!farmer_id) return 0;
  const resp = await fetch(url(`/farmer/${encodeURIComponent(farmer_id)}/notifications/read-all`), {
    method: "POST",
  });
  if (!resp.ok) return 0;
  const data = (await resp.json()) as { updated?: number };
  return data.updated ?? 0;
}
