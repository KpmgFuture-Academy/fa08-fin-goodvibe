"use client"

/**
 * 상단 헤더 — 원본 chief 디자인(lvb-topbar*).
 *
 * 좌측: 페이지 라벨 + 오늘 날짜·요일.
 * 우측: 날씨 칩 (클릭 → 주간 예보 팝업) / 설정 (모달) / 새로고침.
 */
import { useCallback, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { CloudRain, CloudSun, RefreshCw, Settings, Sun } from "lucide-react"
import { pageLabelFromPath } from "@/components/Sidebar"
import { useCurrentUserVillage } from "@/components/CurrentUserVillageContext"
import WeatherPopover from "@/components/WeatherPopover"
import SettingsPanel from "@/components/SettingsPanel"

export type WeeklyForecastRow = {
  fcst_date: string
  day_of_week?: string
  sky?: string | number
  pty?: string | number
  tmp_max?: number | null
}

function todayLabelFull(): string {
  try {
    const d = new Date()
    const days = ["일", "월", "화", "수", "목", "금", "토"]
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${days[d.getDay()]}요일`
  } catch {
    return ""
  }
}

export function Header({
  weeklyForecast,
}: {
  todayLabel?: string
  weeklyForecast?: WeeklyForecastRow[]
}) {
  const pathname = usePathname()
  const router = useRouter()
  const village = useCurrentUserVillage()
  const villageName = village.currentUserVillageInfo?.village?.ville_name ?? ""

  const label = pageLabelFromPath(pathname || "")
  const dateLabel = todayLabelFull()
  const [weatherOpen, setWeatherOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const forecast = weeklyForecast || []
  const today = forecast[0]
  let WeatherIcon = Sun
  let temp: string | number = "—"
  let condition = "맑음"
  if (today) {
    const pty = String(today.pty || "0")
    const sky = String(today.sky || "1")
    WeatherIcon =
      pty !== "0" ? CloudRain : sky === "4" || sky === "3" ? CloudSun : Sun
    temp = today.tmp_max != null ? `${Math.round(today.tmp_max)}°` : "—"
    condition =
      pty !== "0" ? "비" : sky === "4" ? "흐림" : sky === "3" ? "구름 많음" : "맑음"
  }

  const onRefresh = useCallback(() => router.refresh(), [router])

  const monthLabel = (() => {
    try {
      const d = new Date()
      return `${d.getMonth() + 1}월`
    } catch {
      return ""
    }
  })()

  return (
    <header className="lvb-topbar">
      <div className="lvb-topbar-l">
        {label && <span className="lvb-topbar-title">{label}</span>}
        <span className="lvb-topbar-date">{dateLabel}</span>
      </div>
      <div className="lvb-topbar-r" style={{ position: "relative" }}>
        <button
          type="button"
          className="lvb-weather"
          aria-label={`오늘 날씨 ${condition} ${temp} — 주간 예보 보기`}
          onClick={() => setWeatherOpen((v) => !v)}
        >
          <WeatherIcon size={18} />
          <span>{condition}</span>
          <strong>{temp}</strong>
        </button>
        <button
          type="button"
          className="lvb-iconbtn lvb-iconbtn-ghost"
          aria-label="설정"
          title="설정"
          onClick={() => setSettingsOpen(true)}
        >
          <Settings size={19} />
        </button>
        <button
          type="button"
          className="lvb-iconbtn lvb-iconbtn-ghost"
          onClick={onRefresh}
          aria-label="새로고침"
          title="새로고침"
        >
          <RefreshCw size={19} />
        </button>
        <WeatherPopover
          open={weatherOpen}
          onClose={() => setWeatherOpen(false)}
          villageName={villageName || "—"}
          monthLabel={monthLabel}
          weeklyForecast={forecast}
        />
      </div>
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </header>
  )
}
