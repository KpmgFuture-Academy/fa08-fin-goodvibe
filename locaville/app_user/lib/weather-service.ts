/** 농가 홈 화면 날씨 위젯 — backend `/weather/today` 클라이언트.
 *
 * 응답 카테고리 코드 (기상청 단기예보):
 *   sky: "1" 맑음 / "3" 구름많음 / "4" 흐림
 *   pty: "0" 없음 / "1" 비 / "2" 비·눈 / "3" 눈 / "4" 소나기
 *
 * backend 호출 실패 시 error 키만 들어옴 → 컴포넌트가 fallback 톤 표시.
 */
import { getApiBaseUrl } from "./data-source";

export type WeatherResponse = {
  fcst_date?: string;
  fcst_time?: string;
  tmp?: string;
  /** 오늘 최고기온 (TMX 또는 시간별 TMP max). 숫자 또는 문자열로 옴. */
  tmx?: number | string | null;
  /** 오늘 최저기온 */
  tmn?: number | string | null;
  sky?: string;
  pty?: string;
  pop?: string;
  reh?: string;
  nx?: number;
  ny?: number;
  error?: string;
};

export async function fetchTodayWeather(params: {
  ville_id?: string;
  crop_cd?: string;
}): Promise<WeatherResponse> {
  const url = new URL("/weather/today", getApiBaseUrl());
  if (params.ville_id) url.searchParams.set("ville_id", params.ville_id);
  if (params.crop_cd) url.searchParams.set("crop_cd", params.crop_cd);
  try {
    const resp = await fetch(url.toString(), { cache: "no-store" });
    if (!resp.ok) return { error: `HTTP ${resp.status}` };
    return (await resp.json()) as WeatherResponse;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "네트워크 오류" };
  }
}
