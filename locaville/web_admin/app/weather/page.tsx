"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { CloudSun, RefreshCw } from "lucide-react"
import { PageHeader } from "@/components/ui/PageHeader"
import { Card, CardBody, CardHead } from "@/components/ui/Card"
import { Btn } from "@/components/ui/Btn"
import {
  getWeatherHourly,
  getWeatherToday,
  syncWeatherForVillage,
  WEATHER_ADMIN_CONNECTION_ERROR_MESSAGE,
} from "@/lib/weather-admin-api"
import type { WeatherHourlyItem, WeatherTodayResponse } from "@/lib/weather-admin-types"
import { getVillageList } from "@/lib/village-api"
import type { VillageItem } from "@/lib/village-types"

const fieldStyle: React.CSSProperties = {
  minWidth: 220,
  height: 44,
  padding: "0 14px",
  borderRadius: 12,
  border: "1px solid var(--line)",
  background: "#fff",
  color: "var(--text)",
  fontSize: 15,
}

const inlineFieldWrapStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
}

const inlineLabelStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
  color: "var(--text)",
  whiteSpace: "nowrap",
}

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
}

const statCardStyle: React.CSSProperties = {
  border: "1px solid var(--line)",
  borderRadius: 16,
  padding: 16,
  background: "var(--panel-soft, #f8f7f1)",
}

function fmtValue(value: unknown, suffix = ""): string {
  if (value == null || value === "") return "—"
  return `${value}${suffix}`
}

function fmtGrid(nx?: number | null, ny?: number | null): string {
  if (nx == null || ny == null) return "—"
  return `${nx}/${ny}`
}

function fmtDateLabel(fcstDate?: string | null, fcstTime?: string | null): string {
  if (!fcstDate) return "—"
  const time = fcstTime ? ` ${fcstTime.slice(0, 2)}:${fcstTime.slice(2, 4)}` : ""
  return `${fcstDate.slice(0, 4)}-${fcstDate.slice(4, 6)}-${fcstDate.slice(6, 8)}${time}`
}

function fmtTimestamp(value?: string | null): string {
  if (!value) return "—"
  const normalized = value.replace("Z", "")
  const [datePart = "", timePart = ""] = normalized.split("T")
  if (!datePart) return value
  if (!timePart) return datePart
  return `${datePart} ${timePart.slice(0, 8)}`
}

function fmtRainSnow(rain?: string | null, snow?: string | null): string {
  const rainValue = rain && rain !== "" ? rain : "0"
  const snowValue = snow && snow !== "" ? snow : "0"
  return `${rainValue} / ${snowValue}`
}

function parseForecastDateTime(fcstDate?: string | null, fcstTime?: string | null): Date | null {
  if (!fcstDate || !fcstTime || fcstDate.length !== 8 || fcstTime.length < 4) return null
  const year = Number(fcstDate.slice(0, 4))
  const month = Number(fcstDate.slice(4, 6))
  const day = Number(fcstDate.slice(6, 8))
  const hour = Number(fcstTime.slice(0, 2))
  const minute = Number(fcstTime.slice(2, 4))
  if ([year, month, day, hour, minute].some((value) => Number.isNaN(value))) return null
  return new Date(year, month - 1, day, hour, minute, 0, 0)
}

function formatDateParam(value: Date): string {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, "0")
  const day = String(value.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function getForecastWindow(now = new Date()): { hourKey: string; windowStart: Date; windowEnd: Date } {
  const windowStart = new Date(now)
  windowStart.setMinutes(0, 0, 0)
  const windowEnd = new Date(windowStart.getTime() + 24 * 60 * 60 * 1000 - 1)
  return {
    hourKey: `${windowStart.getFullYear()}-${windowStart.getMonth() + 1}-${windowStart.getDate()}-${windowStart.getHours()}`,
    windowStart,
    windowEnd,
  }
}

function selectDisplayHourlyItems(items: WeatherHourlyItem[]): WeatherHourlyItem[] {
  const datedItems = items
    .map((item) => ({
      item,
      forecastAt: parseForecastDateTime(item.fcst_date, item.fcst_time),
    }))
    .filter((entry): entry is { item: WeatherHourlyItem; forecastAt: Date } => entry.forecastAt instanceof Date)
    .sort((a, b) => a.forecastAt.getTime() - b.forecastAt.getTime())

  if (datedItems.length === 0) {
    return items
  }

  const { windowStart, windowEnd } = getForecastWindow()
  const next24HourItems = datedItems
    .filter(({ forecastAt }) => forecastAt >= windowStart && forecastAt <= windowEnd)
    .map(({ item }) => item)
  return next24HourItems
}

export default function WeatherPage() {
  const [villages, setVillages] = useState<VillageItem[]>([])
  const [villeId, setVilleId] = useState("")
  const [today, setToday] = useState<WeatherTodayResponse | null>(null)
  const [hourly, setHourly] = useState<WeatherHourlyItem[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState("")
  const lastLoadedHourKeyRef = useRef<string>("")

  const selectedVillage = useMemo(
    () => villages.find((item) => item.ville_id === villeId) || null,
    [villages, villeId],
  )

  const load = useCallback(async (options?: { refreshAt?: Date }) => {
    setLoading(true)
    setError("")
    try {
      const villageData = await getVillageList()
      const items = villageData.items || []
      setVillages(items)

      const effectiveVilleId = villeId || items[0]?.ville_id || ""
      if (!effectiveVilleId) {
        setToday(null)
        setHourly([])
        return
      }
      setVilleId(effectiveVilleId)

      const { hourKey, windowStart, windowEnd } = getForecastWindow(options?.refreshAt ?? new Date())

      const [todayData, hourlyData] = await Promise.all([
        getWeatherToday({ ville_id: effectiveVilleId, source: "auto" }),
        getWeatherHourly({
          ville_id: effectiveVilleId,
          start_date: formatDateParam(windowStart),
          end_date: formatDateParam(windowEnd),
          limit: 48,
        }),
      ])
      lastLoadedHourKeyRef.current = hourKey
      setToday(todayData)
      setHourly(selectDisplayHourlyItems(hourlyData.items || []))
      if (todayData.error) {
        setError(todayData.error)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : WEATHER_ADMIN_CONNECTION_ERROR_MESSAGE)
      setToday(null)
      setHourly([])
    } finally {
      setLoading(false)
    }
  }, [villeId])

  useEffect(() => {
    void load()
  }, [load])

  const handleRefresh = useCallback(async () => {
    const refreshAt = new Date()
    const { hourKey } = getForecastWindow(refreshAt)
    if (lastLoadedHourKeyRef.current !== hourKey) {
      setToday(null)
      setHourly([])
    }
    await load({ refreshAt })
  }, [load])

  const handleSync = useCallback(async () => {
    if (!villeId) return
    setSyncing(true)
    try {
      const result = await syncWeatherForVillage({ ville_id: villeId })
      const failed = result.results.find((item) => item.ok === false)
      if (failed?.error) {
        throw new Error(failed.error)
      }
      window.alert(`총 ${result.saved_count}건의 날씨 데이터를 등록하였습니다.`)
      await load()
    } catch (e) {
      const message = e instanceof Error ? e.message : "기상청 날씨예보 가져오기에 실패했습니다."
      setError(message)
      window.alert(message)
    } finally {
      setSyncing(false)
    }
  }, [load, villeId])

  return (
    <div>
      <PageHeader
        title="날씨정보 관리"
        sub="마을별 현재 날씨와 배치 적재된 시간대별 기상 데이터를 확인합니다."
        actions={
          <>
            <Btn onClick={() => void handleSync()} disabled={loading || syncing || !villeId}>
              {syncing ? "기상청 예보 가져오는 중..." : "기상청 날씨예보 가져오기"}
            </Btn>
            <Btn icon={<RefreshCw size={16} />} onClick={() => void handleRefresh()} disabled={loading}>
              새로고침
            </Btn>
          </>
        }
      />

      {error && <div className="alert alert-error">오류: {error}</div>}

      <Card style={{ marginBottom: 16 }}>
        <CardBody>
          <div style={inlineFieldWrapStyle}>
            <label style={inlineLabelStyle}>마을 선택</label>
            <label>
              <select
                value={villeId}
                onChange={(event) => setVilleId(event.target.value)}
                style={fieldStyle}
                disabled={loading || villages.length === 0}
              >
                {villages.length === 0 ? <option value="">마을 없음</option> : null}
                {villages.map((item) => (
                  <option key={item.ville_id} value={item.ville_id}>
                    {item.ville_name} ({item.ville_id})
                  </option>
                ))}
              </select>
            </label>
            <Btn onClick={() => void handleRefresh()} disabled={loading || !villeId}>
              선택한 마을 조회
            </Btn>
          </div>
        </CardBody>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <CardHead
          title="현재 요약"
          sub={
            selectedVillage
              ? `${selectedVillage.ville_name} · ${selectedVillage.ville_id} (${fmtGrid(today?.nx, today?.ny)})`
              : "마을 미선택"
          }
        />
        <CardBody>
          {loading ? (
            <div className="loading">불러오는 중...</div>
          ) : (
            <div style={gridStyle}>
              <div style={statCardStyle}>
                <div className="muted">예보시각</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{fmtDateLabel(today?.fcst_date, today?.fcst_time)}</div>
              </div>
              <div style={statCardStyle}>
                <div className="muted">기온</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{fmtValue(today?.tmp, "°C")}</div>
              </div>
              <div style={statCardStyle}>
                <div className="muted">날씨상태</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 20, fontWeight: 700 }}>
                  <CloudSun size={18} color="var(--accent)" />
                  <span>{fmtValue(today?.status || today?.sky)}</span>
                </div>
              </div>
              <div style={statCardStyle}>
                <div className="muted">강수확률</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{fmtValue(today?.pop, "%")}</div>
              </div>
              <div style={statCardStyle}>
                <div className="muted">습도</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{fmtValue(today?.reh, "%")}</div>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHead
          title="시간대별 날씨"
          sub="현재 정시부터 다음 24시간"
          note={selectedVillage?.addr_1 || undefined}
        />
        <CardBody>
          {loading ? (
            <div className="loading">불러오는 중...</div>
          ) : hourly.length === 0 ? (
            <div className="tbl-empty muted" style={{ padding: 48 }}>
              조회된 날씨 데이터가 없습니다.
            </div>
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th style={{ textAlign: "center" }}>예보시각</th>
                    <th style={{ textAlign: "center" }}>상태</th>
                    <th style={{ textAlign: "center" }}>기온</th>
                    <th style={{ textAlign: "center" }}>강수확률</th>
                    <th style={{ textAlign: "center" }}>습도</th>
                    <th style={{ textAlign: "center" }}>시간당 강수/적설량 (mm / cm)</th>
                    <th style={{ textAlign: "center" }}>업데이트시각</th>
                  </tr>
                </thead>
                <tbody>
                  {hourly.map((item, index) => (
                    <tr key={`${item.fcst_date}-${item.fcst_time}-${index}`}>
                      <td className="cell-mono" style={{ textAlign: "center" }}>{fmtDateLabel(item.fcst_date, item.fcst_time)}</td>
                      <td style={{ textAlign: "center" }}>{item.status || item.sky || <span className="muted">—</span>}</td>
                      <td style={{ textAlign: "center" }}>{fmtValue(item.tmp, "°C")}</td>
                      <td style={{ textAlign: "center" }}>{fmtValue(item.pop, "%")}</td>
                      <td style={{ textAlign: "center" }}>{fmtValue(item.reh, "%")}</td>
                      <td style={{ textAlign: "center" }}>{fmtRainSnow(item.rain_hour, item.snow_hour)}</td>
                      <td className="cell-mono" style={{ textAlign: "center" }}>{fmtTimestamp(item.update_dt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
