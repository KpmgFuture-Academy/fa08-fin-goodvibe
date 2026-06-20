"use client";

/**
 * 홈 화면 상단 날씨 위젯 — Meteocons animated SVG.
 *
 * 디자인: 카드 박스가 아니라 화면 전체 폭으로 펼쳐지고,
 *   날씨 그라데이션이 아래쪽으로 흰색까지 자연스럽게 fade 되어 본문과 경계 없이 통합.
 *
 * 배경 매핑:
 *   - 맑음(낮)   → 푸른 하늘 → 흰색
 *   - 맑음(밤)   → 진한 남색 → 흰색
 *   - 구름/흐림  → 회청 → 흰색
 *   - 비/소나기  → 회청 → 흰색
 *   - 눈         → 차가운 하얀-파랑 → 흰색
 *
 * 낮/밤 분기: fcst_time(HHMM) 기준 18~06시면 night variant.
 * SVG 파일 위치: public/weather-icons/*.svg (basmilius/weather-icons MIT).
 *
 * backend 호출 실패 시: 회색 fade + "날씨 정보를 불러올 수 없어요" 폴백.
 */
import { useEffect, useState } from "react";
import { fetchTodayWeather, type WeatherResponse } from "@/lib/weather-service";

type WeatherTheme = {
  iconFile: string;
  label: string;
  /** 위쪽 진한 색 (그라데이션 시작) */
  topColor: string;
};

// 한국 위도(약 37.5°) 기준 월별 평균 일출/일몰 시각 (시 단위, 소수점=분/60).
// 1월부터 12월까지 — 실측 평균 ±15분 오차. SunCalc 같은 정밀 계산 대신 hardcode 로 충분.
const SUNRISE_HOUR = [7.75, 7.33, 6.75, 6.08, 5.5, 5.25, 5.42, 5.83, 6.25, 6.67, 7.17, 7.67];
const SUNSET_HOUR  = [17.5, 18.0, 18.5, 18.83, 19.33, 19.83, 19.92, 19.5, 18.83, 18.0, 17.42, 17.25];

function isNightTime(fcstDate?: string, fcstTime?: string): boolean {
  // fcst_date(YYYYMMDD) 의 월 + fcst_time(HHMM) 의 시각으로 판단. 없으면 현재 시각.
  let month: number;
  let hourFloat: number;
  if (fcstDate && fcstDate.length === 8 && fcstTime && fcstTime.length >= 4) {
    month = Number(fcstDate.slice(4, 6)) - 1;
    const hh = Number(fcstTime.slice(0, 2));
    const mm = Number(fcstTime.slice(2, 4));
    hourFloat = hh + mm / 60;
  } else {
    const now = new Date();
    month = now.getMonth();
    hourFloat = now.getHours() + now.getMinutes() / 60;
  }
  if (!Number.isFinite(month) || month < 0 || month > 11) return false;
  if (!Number.isFinite(hourFloat)) return false;
  return hourFloat >= SUNSET_HOUR[month] || hourFloat < SUNRISE_HOUR[month];
}

function pickTheme(weather: WeatherResponse): WeatherTheme {
  const night = isNightTime(weather.fcst_date, weather.fcst_time);

  switch (weather.pty) {
    // modern muted weather palette — 채도 살짝 낮춰 흰 배경과 자연스레 어울리게.
    case "1":
    case "4":
      return { iconFile: "rain.svg", label: "비가 와요", topColor: "#7188a0" };
    case "2":
      return { iconFile: "sleet.svg", label: "비/눈이 와요", topColor: "#8a98aa" };
    case "3":
      return { iconFile: "snow.svg", label: "눈이 와요", topColor: "#a3b6c8" };
  }

  switch (weather.sky) {
    case "1":
      // modern muted sky — 이전 #5aa6e0 (채도 67%) → #7eb5d4 (채도 38%, softer)
      return {
        iconFile: night ? "clear-night.svg" : "clear-day.svg",
        label: night ? "맑은 밤" : "맑음",
        topColor: night ? "#3a5778" : "#7eb5d4",
      };
    case "3":
      return {
        iconFile: night ? "partly-cloudy-night.svg" : "partly-cloudy-day.svg",
        label: "구름 많음",
        topColor: night ? "#46587a" : "#94aec6",
      };
    case "4":
      return { iconFile: "cloudy.svg", label: "흐림", topColor: "#94a2b3" };
  }

  return { iconFile: "cloudy.svg", label: "날씨 확인 중", topColor: "#9aa9bb" };
}

/** topColor → 흰색으로 부드러운 fade. 이전 75% 까지 단색면 → modern muted gradient:
   상단은 진하고 60% 부터 점진적 fade. plain 한 색면 압박감 감소. */
function buildFadeGradient(topColor: string): string {
  return `linear-gradient(to bottom, ${topColor} 0%, ${topColor} 55%, #ffffff 100%)`;
}

export function WeatherWidget({
  villeId,
  cropCd,
  compact,
}: {
  villeId?: string;
  cropCd?: string;
  /** true 면 헤더 옆에 끼울 수 있는 한 줄 inline 형태로 출력. */
  compact?: boolean;
}) {
  const [weather, setWeather] = useState<WeatherResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    void fetchTodayWeather({ ville_id: villeId, crop_cd: cropCd })
      .then((data) => {
        if (mounted) setWeather(data);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [villeId, cropCd]);

  // compact 한 줄 모드 — 헤더 옆 텍스트로 (아이콘 + 날씨 + 현재 + 최고/최저).
  // 예: "☁ 구름 많음 23° ↑29 ↓18"  (↑ 절제된 빨강, ↓ 절제된 파랑, 숫자는 ink)
  if (compact) {
    if (loading || !weather) return null;
    const hasError = !!weather.error || weather.tmp == null;
    if (hasError) return null;
    const theme = pickTheme(weather);
    const fmt = (v: number | string | null | undefined): number | null => {
      if (v == null) return null;
      const n = typeof v === "number" ? v : Number(v);
      if (Number.isNaN(n)) return null;
      return Math.round(n);
    };
    const tmpStr = weather.tmp != null ? `${weather.tmp}°` : "";
    const tmxNum = fmt(weather.tmx);
    const tmnNum = fmt(weather.tmn);
    // 30년 짬 — 색은 의미만 짊어진다: 화살표만 색(↑빨강 ↓파랑), 숫자는 ink 검정.
    // 톤은 saturation 낮춰 헤더 초록과 충돌 없게.
    const RED = "#b85452";
    const BLUE = "#4a7a9a";
    return (
      <span className="inline-flex items-center gap-1">
        <img src={`/weather-icons/${theme.iconFile}`} alt="" width={16} height={16} style={{ display: "inline-block" }} />
        <span>{theme.label}</span>
        {tmpStr && <span>{tmpStr}</span>}
        {(tmxNum != null || tmnNum != null) && (
          <span className="inline-flex items-center" style={{ gap: 6, fontWeight: 700 }}>
            {tmxNum != null && (
              <span className="inline-flex items-center" style={{ gap: 1 }}>
                <span style={{ color: RED }}>↑</span>
                <span style={{ color: "var(--ink)" }}>{tmxNum}</span>
              </span>
            )}
            {tmnNum != null && (
              <span className="inline-flex items-center" style={{ gap: 1 }}>
                <span style={{ color: BLUE }}>↓</span>
                <span style={{ color: "var(--ink)" }}>{tmnNum}</span>
              </span>
            )}
          </span>
        )}
      </span>
    );
  }

  if (loading || !weather) {
    return (
      <div
        className="w-full px-5 pt-4 pb-3 text-white animate-pulse"
        style={{ background: buildFadeGradient("#b6c5d5"), minHeight: 92 }}
      />
    );
  }

  const hasError = !!weather.error || weather.tmp == null;
  const theme = pickTheme(weather);
  const tempLabel = weather.tmp != null ? `${weather.tmp}°` : "—";
  const popLine =
    weather.pop && Number(weather.pop) > 0 ? `강수확률 ${weather.pop}%` : "비 안 와요";

  return (
    <div
      className="w-full px-5 pt-4 pb-3 text-white"
      style={{ background: buildFadeGradient(hasError ? "#8a9bb0" : theme.topColor) }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold opacity-90">오늘 우리 마을 날씨</p>
          {hasError ? (
            <p className="text-base font-bold mt-1 break-keep">날씨 정보를 불러올 수 없어요</p>
          ) : (
            <>
              <p className="text-4xl font-bold mt-1 leading-none">{tempLabel}</p>
              <p className="text-sm font-bold mt-1.5">
                {theme.label} · {popLine}
              </p>
            </>
          )}
        </div>
        <div className="flex-shrink-0">
          <img
            src={`/weather-icons/${theme.iconFile}`}
            alt={theme.label}
            width={68}
            height={68}
            style={{ display: "block" }}
          />
        </div>
      </div>
      {/* KOGL Type 1 출처표시 의무 — 공공데이터포털 기상청 동네예보 API. */}
      <p
        className="text-right mt-1"
        style={{ fontSize: 9, color: "rgba(255,255,255,0.7)", fontWeight: 500 }}
      >
        자료: 기상청 동네예보 (공공데이터포털)
      </p>
    </div>
  );
}
