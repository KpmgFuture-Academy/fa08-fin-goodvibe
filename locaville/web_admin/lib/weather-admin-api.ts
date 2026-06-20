import type {
  WeatherHourlyResponse,
  WeatherSyncResponse,
  WeatherTodayResponse,
} from "@/lib/weather-admin-types"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000"

export const WEATHER_ADMIN_CONNECTION_ERROR_MESSAGE =
  "백엔드에 연결할 수 없습니다. FastAPI 서버 실행 상태를 확인해 주세요."

function buildUrl(path: string): string {
  return new URL(path, API_BASE_URL).toString()
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, {
      ...init,
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
    })
  } catch {
    throw new Error(WEATHER_ADMIN_CONNECTION_ERROR_MESSAGE)
  }

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`API ${response.status}: ${text || response.statusText}`)
  }

  return (await response.json()) as T
}

export async function getWeatherToday(params?: {
  ville_id?: string
  source?: "auto" | "db" | "live"
}): Promise<WeatherTodayResponse> {
  const url = new URL(buildUrl("/weather/today"))
  if (params?.ville_id) url.searchParams.set("ville_id", params.ville_id)
  if (params?.source) url.searchParams.set("source", params.source)
  return requestJson<WeatherTodayResponse>(url.toString())
}

export async function getWeatherHourly(params?: {
  ville_id?: string
  start_date?: string
  end_date?: string
  limit?: number
}): Promise<WeatherHourlyResponse> {
  const url = new URL(buildUrl("/weather/hourly"))
  if (params?.ville_id) url.searchParams.set("ville_id", params.ville_id)
  if (params?.start_date) url.searchParams.set("start_date", params.start_date)
  if (params?.end_date) url.searchParams.set("end_date", params.end_date)
  if (params?.limit != null) url.searchParams.set("limit", String(params.limit))
  return requestJson<WeatherHourlyResponse>(url.toString())
}

export async function syncWeatherForVillage(params?: {
  ville_id?: string
  actor_no?: number
}): Promise<WeatherSyncResponse> {
  const url = new URL(buildUrl("/weather/sync"))
  if (params?.ville_id) url.searchParams.set("ville_id", params.ville_id)
  if (params?.actor_no != null) url.searchParams.set("actor_no", String(params.actor_no))
  return requestJson<WeatherSyncResponse>(url.toString(), {
    method: "POST",
  })
}
