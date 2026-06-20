"use client";

/** 농가 advice — backend `/farmer/{id}/advice/today` 클라이언트.
 *  결과 없으면 null (UI 는 카드 미노출).
 */
import { getApiBaseUrl } from "./data-source";

export type Advice = {
  advice_no: number;
  user_no: number;
  advice_date: string;
  ville_chief_yn: "Y" | "N";
  content: string;
  rationale: {
    scenario_cd?: string;
    gen_cd?: string;
    [k: string]: unknown;
  };
  action_url?: string | null;
};

export async function fetchTodayAdvice(farmerId: string): Promise<Advice | null> {
  try {
    const url = new URL(
      `/farmer/${encodeURIComponent(farmerId)}/advice/today`,
      getApiBaseUrl(),
    );
    const resp = await fetch(url.toString(), { cache: "no-store" });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { advice: Advice | null };
    return data.advice || null;
  } catch {
    return null;
  }
}
