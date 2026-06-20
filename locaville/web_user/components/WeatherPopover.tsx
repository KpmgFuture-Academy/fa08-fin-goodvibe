"use client"

/**
 * 헤더 날씨칩 클릭 시 뜨는 주간 예보 팝업 (lvb-weather-pop).
 *
 * weeklyForecast 의 7일치를 좌→우로 카드 형태로 나열. 비 또는 마감/물대기 관련 일에는
 * 카드 아래 보조 라인을 노출.
 */
import { useEffect, useRef } from "react"
import { Cloud, CloudRain, CloudSun, Sun } from "lucide-react"
import type { WeeklyForecastRow } from "@/components/Header"
import ModalPortal from "@/components/chief/ModalPortal"

const SKY_KEY: Record<string, "sun" | "cloudSun" | "cloud" | "rain"> = {
  "1": "sun",
  "3": "cloudSun",
  "4": "cloud",
}

function skyOf(row: WeeklyForecastRow): "sun" | "cloudSun" | "cloud" | "rain" {
  if (String(row.pty || "0") !== "0") return "rain"
  return SKY_KEY[String(row.sky || "1")] || "sun"
}

function IconFor({ kind, size = 28 }: { kind: "sun" | "cloudSun" | "cloud" | "rain"; size?: number }) {
  if (kind === "rain") return <CloudRain size={size} />
  if (kind === "cloud") return <Cloud size={size} />
  if (kind === "cloudSun") return <CloudSun size={size} />
  return <Sun size={size} />
}

function shortDate(fcstDate: string): string {
  // "YYYYMMDD" → "M/D"
  if (fcstDate?.length === 8) {
    return `${parseInt(fcstDate.slice(4, 6), 10)}/${parseInt(fcstDate.slice(6, 8), 10)}`
  }
  return fcstDate
}

function noteOf(row: WeeklyForecastRow, kind: "sun" | "cloudSun" | "cloud" | "rain"): string {
  if (kind === "rain") return "비 — 야외 사진은 피하세요"
  if (kind === "cloudSun") return "대체로 맑아요"
  if (kind === "cloud") return "흐려요"
  return "물대기·사진 받기 좋아요"
}

export default function WeatherPopover({
  open,
  onClose,
  villageName,
  monthLabel,
  weeklyForecast,
}: {
  open: boolean
  onClose: () => void
  villageName: string
  monthLabel: string
  weeklyForecast: WeeklyForecastRow[]
}) {
  const ref = useRef<HTMLDivElement | null>(null)

  // Esc 닫기.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, onClose])

  const todayStr = (() => {
    const d = new Date()
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    return `${y}${m}${day}`
  })()

  const days = weeklyForecast.slice(0, 7)

  return (
    <ModalPortal open={open}>
      <div
        className="lvb-pop-scrim"
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0)" }}
      />
      <div
        ref={ref}
        className="lvb-weather-pop"
        role="dialog"
        aria-label="이번 주 날씨"
        style={{
          // Portal 로 body 에 mount — zoom 영향 X.
          // 헤더 우상단(66px 헤더 + 약간 간격) 에 fixed 로 고정.
          position: "fixed",
          top: 80,
          right: 28,
          zIndex: 70,
        }}
      >
        <div className="lvb-weather-pop-head">
          <span>이번 주 날씨</span>
          <span className="lvb-weather-pop-sub">
            {villageName} · {monthLabel}
          </span>
        </div>
        {days.length === 0 ? (
          <div className="lvb-empty" style={{ padding: "24px 12px" }}>
            <div className="lvb-empty-title">날씨 정보를 가져오지 못했어요</div>
            <div className="lvb-empty-sub">
              잠시 후 다시 시도해 주세요. 백엔드 연결 상태를 확인하면 도움이 돼요.
            </div>
          </div>
        ) : (
          <>
            <div className="lvb-weather-week">
              {days.map((w) => {
                const kind = skyOf(w)
                const isToday = w.fcst_date === todayStr
                const isRain = kind === "rain"
                return (
                  <div
                    key={w.fcst_date}
                    className={`lvb-weather-day${isToday ? " is-today" : ""}${isRain ? " is-rain" : ""}`}
                  >
                    <div className="lvb-weather-dow">
                      {isToday ? "오늘" : w.day_of_week || ""}
                    </div>
                    <div className="lvb-weather-date">{shortDate(w.fcst_date)}</div>
                    <span className={`lvb-weather-ic sky-${kind}`}>
                      <IconFor kind={kind} size={28} />
                    </span>
                    <div className="lvb-weather-temp">
                      <b>{w.tmp_max != null ? `${Math.round(w.tmp_max)}°` : "—"}</b>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="lvb-weather-notes">
              {days.slice(0, 3).map((w) => {
                const kind = skyOf(w)
                const isToday = w.fcst_date === todayStr
                return (
                  <div key={w.fcst_date} className="lvb-weather-note">
                    <span className={`lvb-weather-note-day sky-${kind}`}>
                      {isToday ? "오늘" : w.day_of_week || ""}
                    </span>
                    <span>{noteOf(w, kind)}</span>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </ModalPortal>
  )
}
