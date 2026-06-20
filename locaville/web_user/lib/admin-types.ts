/**
 * v0_chief 가 backend 와 주고받는 admin API 의 TypeScript 타입 정의.
 *
 * 신 스키마(seed v2) 와 호환되도록 optional 필드(`amo_regno`, `user_no`, `parcel_regno` 등) 추가.
 * 기존 화면 코드가 깨지지 않도록 필수 필드는 그대로 유지하고, 새 필드는 모두 optional.
 */
export type FarmerDiarySummary = {
  farmer_id: string
  farmer_name?: string
  diary_count: number
  evidence_count: number
  latest_work_date?: string | null
  // 신 스키마 optional 필드 (vw_jeotan_farmer_summary)
  amo_regno?: string
  amo_name?: string
  user_no?: number | null
  user_name?: string
  ville_name?: string
  parcel_count?: number
  rice_area?: number
  todo_count?: number
  done_todo_count?: number
  delayed_todo_count?: number
  todo_completion_rate?: number
  // user_master 에서 가져온 연락처/주소 (chief_no JOIN; 없는 농가는 빈 문자열)
  phone?: string
  address?: string
  address_detail?: string
  zip_cd?: string
  // 가입상태 코드 — ACT(가입완료) / INV(초대발송) / PEND(가입대기). 빈값이면 미해석.
  status_cd?: string
}

export type AdminDiaryItem = {
  diary_id: string
  farmer_id: string
  farmer_name?: string
  work_date: string
  crop_name: string
  work_stage: string
  work_stage_detail?: string
  work_detail: string
  status: string
  linked_evidence_ids?: string[]
  created_at?: string | null
  updated_at?: string | null
  prj_id?: string
  project_id?: string
  field_address?: string
  input_type_cd?: string
  // 신 스키마 optional 필드
  user_no?: number | null
  user_name?: string
  amo_regno?: string
  amo_name?: string
  exec_no?: number | null
  job_cd?: string
  prj_name?: string
  activity_id?: string
  activity_name?: string
  parcel_no?: string | number | null
  parcel_regno?: string
  evidence_count?: number
  // backend 가 prj_journal.group_no + ville_group JOIN 으로 채움.
  // residents 화면의 참여단체 탭이 진짜 group_name 표시할 때 사용.
  group_no?: number | null
  group_name?: string
}

export type AdminEvidenceItem = {
  evidence_id: string
  farmer_id: string
  farmer_name?: string
  field_id?: string
  parcel_no?: string | number | null
  activity_id?: string
  activity_type: string
  evidence_type: string
  confirmed_label?: string
  status: string
  user_message?: string
  captured_at: string
  created_at?: string | null
  updated_at?: string | null
  image_url?: string
  storage_path?: string
  original_image_path?: string
  prj_id?: string
  project_id?: string
  group_no?: number | null
  job_cd?: string
  // 신 스키마 optional 필드
  user_no?: number | null
  user_name?: string
  amo_regno?: string
  amo_name?: string
  exec_no?: number | null
  seq_no?: number | null
  parcel_regno?: string
  evid_cd?: string
  /** 촬영 후 AI To-do 일치 판정 (raw_json). 확신 낮으면 "AI 확신 낮음" 뱃지. */
  todo_match?: string
  todo_match_reason?: string
  needs_chief_verification?: boolean
}

export type AdminSummary = {
  total_diaries: number
  total_evidence: number
  total_farmers: number
  diaries_by_farmer: FarmerDiarySummary[]
  evidence_by_status: Record<string, number>
  recent_diaries: AdminDiaryItem[]
  recent_evidence: AdminEvidenceItem[]
}

export type EvidencePatchPayload = {
  status?: string
  confirmed_label?: string
  user_message?: string
}

export type DiaryFilters = {
  farmer_id?: string
  status?: string
  work_date?: string
  project_id?: string
}

export type EvidenceFilters = {
  farmer_id?: string
  status?: string
  evidence_type?: string
  confirmed_label?: string
  activity_type?: string
}

export type DemoStatus = {
  diaries_count: number
  evidence_count: number
  seed_exists: boolean
}

export type DemoMutationResult = {
  ok: boolean
  message: string
}

export type AdminTodoStatusItem = {
  farmer_id: string
  farmer_name?: string
  todo_id: string
  todo_title: string
  group_no?: number | null
  prj_id?: string
  project_id?: string
  activity_id?: string
  job_cd?: string
  activity_name: string
  job_name: string
  required_evidence_types: string[]
  submitted_evidence_types: string[]
  missing_evidence_types: string[]
  computed_status: "pending" | "in_progress" | "completed" | string
  due_date?: string | null
  // 신 스키마(seed v2) — backend 가 prj_todo_list → project → ville_group JOIN 으로 채움.
  // residents 화면의 "참여사업" / "참여단체" 컬럼 표시에 사용. 옛 응답에는 없을 수 있어 optional.
  amo_regno?: string
  prj_name?: string
  group_name?: string
}

export type AdminTodoStatusFilters = {
  farmer_id?: string
  group_no?: string
  prj_id?: string
  project_id?: string
  activity_id?: string
}

export type AdminTodoStatusResponse = {
  items: AdminTodoStatusItem[]
  applied_filters?: {
    farmer_id?: string | null
    group_no?: number | null
    prj_id?: string | null
    activity_id?: string | null
  }
}

// ============================================================
// 마을현황 대시보드 — 주간 농사정보 + 농업 기상 (sunnypark 통합)
// ============================================================

export type AdminWeeklyFarmInfoLinkedTodo = {
  title: string
  incompleteCount: number
}

export type AdminWeeklyFarmInfoItem = {
  category: string
  summary: string
  lines: string[]
  linkedTodo?: AdminWeeklyFarmInfoLinkedTodo | null
}

export type AdminWeeklyFarmInfo = {
  period: string
  source: string
  village: {
    name: string
    address: string
    region: string
    zone: string
  }
  matchedCrops: string[]
  items: AdminWeeklyFarmInfoItem[]
}

export type AdminAgriWeatherDailyForecast = {
  fcst_date: string  // YYYYMMDD
  day_of_week: string  // "월" | "화" | ...
  tmp_max: number | null
  tmp_min: number | null
  sky: string  // "1" | "3" | "4"
  pty: string  // "0" | "1" | ...
  sky_label: string  // "맑음" | "구름많음" | "흐림"
  pty_label: string  // "없음" | "비" | ...
  pop_max: number | null
  is_extrapolated: boolean  // true 면 단기예보 부족분을 backend 가 carry-forward 한 값
}

export type AdminAgriWeather = {
  source: string
  village: {
    name: string
    address: string
  }
  station: {
    code: string
    name: string
    address: string
  }
  observedAt: string
  weather: {
    temperature: string
    humidity: string
    rainfall: string
    windSpeed: string
  }
  guideLines: string[]
  // 7일치 일별 forecast — dashboard weather strip 이 그대로 매핑 (이전 hardcoded 배열 대체).
  weeklyForecast?: AdminAgriWeatherDailyForecast[]
  isFallback: boolean
  fallbackReason?: string | null
}
