export type WeatherTodayResponse = {
  fcst_date?: string | null
  fcst_time?: string | null
  tmp?: number | string | null
  tmx?: number | string | null
  tmn?: number | string | null
  sky?: string | null
  pty?: string | null
  pop?: number | null
  reh?: number | null
  wsd?: number | string | null
  status?: string | null
  rain_hour?: string | null
  snow_hour?: string | null
  update_dt?: string | null
  nx?: number | null
  ny?: number | null
  source?: string | null
  fallback_from?: string | null
  error?: string | null
}

export type WeatherHourlyItem = {
  fcst_date?: string | null
  fcst_time?: string | null
  tmp?: number | string | null
  sky?: string | null
  pty?: string | null
  pop?: number | null
  reh?: number | null
  status?: string | null
  rain_hour?: string | null
  snow_hour?: string | null
  update_dt?: string | null
  nx?: number | null
  ny?: number | null
  source?: string | null
}

export type WeatherHourlyResponse = {
  nx?: number | null
  ny?: number | null
  count?: number
  source?: string | null
  items: WeatherHourlyItem[]
}

export type WeatherSyncResult = {
  ville_id?: string | null
  nx?: number | null
  ny?: number | null
  ok?: boolean
  error?: string | null
  saved_count?: number
  record_count?: number
  base_date?: string | null
  base_time?: string | null
}

export type WeatherSyncResponse = {
  target_count: number
  ok_count: number
  failed_count: number
  saved_count: number
  results: WeatherSyncResult[]
}
