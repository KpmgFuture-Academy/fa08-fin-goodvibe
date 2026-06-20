/**
 * v0_chief 가 호출하는 backend(`/admin`, `/diary`, `/evidence`, `/demo`) API 클라이언트.
 *
 * - 모든 함수는 `fetch` 직접 호출. 인증 헤더 없음 (MVP 단계, 다단계 권한 미구현).
 * - 응답 형태는 `admin-types.ts` 의 type 으로만 보장 (런타임 검증은 없음).
 * - 네트워크 실패는 한국어 메시지로 통일 (`BACKEND_CONNECTION_ERROR_MESSAGE`).
 * - 4xx/5xx 는 backend 가 돌려준 detail 을 그대로 노출.
 */
import type {
  AdminAgriWeather,
  AdminDiaryItem,
  AdminEvidenceItem,
  AdminSummary,
  AdminTodoStatusFilters,
  AdminTodoStatusItem,
  AdminTodoStatusResponse,
  AdminWeeklyFarmInfo,
  DemoMutationResult,
  DemoStatus,
  DiaryFilters,
  EvidenceFilters,
  EvidencePatchPayload,
} from "@/lib/admin-types"

// backend base URL. dev/prod 환경별로 `.env.local` 에서 NEXT_PUBLIC_API_BASE_URL 로 덮어쓸 수 있음.
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000"
/** 네트워크 단계 실패(연결 거부 등) 시 화면에 보여줄 통일된 메시지. */
export const BACKEND_CONNECTION_ERROR_MESSAGE =
  "백엔드에 연결할 수 없습니다. FastAPI 서버 실행 상태를 확인해 주세요."

type DiaryListResponse = { items: AdminDiaryItem[] }
type EvidenceListResponse = { items: AdminEvidenceItem[] }

/** path + 옵션 query → 최종 URL. 빈 문자열 / undefined 값은 querystring 에서 제외. */
function buildUrl(path: string, query?: Record<string, string | undefined>): string {
  const url = new URL(path, API_BASE_URL)
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value && value.trim() !== "") {
        url.searchParams.set(key, value)
      }
    }
  }
  return url.toString()
}

/**
 * 공통 fetch 래퍼. JSON 응답을 T 타입으로 캐스팅해서 반환.
 *
 * `cache: 'no-store'` — 대시보드는 항상 최신 데이터를 봐야 하므로 캐싱 금지.
 */
async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
      cache: "no-store",
    })
  } catch {
    throw new Error(BACKEND_CONNECTION_ERROR_MESSAGE)
  }

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`API ${response.status}: ${text || response.statusText}`)
  }

  return (await response.json()) as T
}

/** 대시보드 첫 화면 요약 (총계 + 농가별 + 최근 5건 + 검토 상태별). */
export async function getAdminSummary(): Promise<AdminSummary> {
  return requestJson<AdminSummary>(buildUrl("/admin/summary"))
}

/** 농가별 todo 진행 상태 + 누락 증빙. filter 가 없으면 전체. items 만 추출. */
export async function getAdminTodoStatus(filters?: AdminTodoStatusFilters): Promise<AdminTodoStatusItem[]> {
  const data = await requestJson<AdminTodoStatusResponse>(buildUrl("/admin/todo-status", filters))
  return data.items
}

/** 주간 농사정보 — 농촌진흥청 데이터 기반. backend 미구현 시 호출 측이 fallback 사용. */
export async function getAdminWeeklyFarmInfo(): Promise<AdminWeeklyFarmInfo> {
  return requestJson<AdminWeeklyFarmInfo>(buildUrl("/admin/weekly-farm-info"))
}

/** 농업 기상 관측데이터 (RDA) — 마을 인근 관측지점. backend 미구현 시 호출 측이 fallback. */
export async function getAdminAgriWeather(): Promise<AdminAgriWeather> {
  return requestJson<AdminAgriWeather>(buildUrl("/admin/agri-weather"))
}

/** 영농일지 목록. farmer/status/work_date 등 AND 필터. */
export async function listAdminDiaries(filters: DiaryFilters): Promise<AdminDiaryItem[]> {
  const data = await requestJson<DiaryListResponse>(buildUrl("/diary", filters))
  return data.items
}

/** 증빙 목록. farmer/status/evidence_type/activity_type 등 AND 필터. */
export async function listAdminEvidence(filters: EvidenceFilters): Promise<AdminEvidenceItem[]> {
  const data = await requestJson<EvidenceListResponse>(buildUrl("/evidence", filters))
  return data.items
}

/** 증빙 단건 — FarmingLogDetailModal 이 영농일지의 첫 사진을 가져올 때 사용. */
export async function getEvidenceById(evidenceId: string): Promise<AdminEvidenceItem> {
  return requestJson<AdminEvidenceItem>(buildUrl(`/evidence/${encodeURIComponent(evidenceId)}`))
}

/** 주민 추가 — ResidentAddModal payload 그대로 backend 트랜잭션. */
export type CreateResidentPayload = {
  name: string
  phone: string
  address?: string
  addressDetail?: string
  parcelCrops?: { parcelName: string; crop: string }[]
  groupNo?: number
  villeId?: string
}
export type CreateResidentResponse = {
  amo_regno: string
  user_no: number
  ville_id: string
  status_cd: string
  name: string
  phone: string
}
export async function createResident(payload: CreateResidentPayload): Promise<CreateResidentResponse> {
  return requestJson<CreateResidentResponse>(buildUrl("/admin/residents"), {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

/** 주민 기본 정보 수정 — amo_family + user_master(chief_no) 동기화. */
export type UpdateResidentPayload = {
  name?: string
  phone?: string
  address?: string
  addressDetail?: string
  zipCd?: string
}
export async function updateResident(
  amoRegno: string,
  payload: UpdateResidentPayload,
): Promise<{ amo_regno: string; updated: boolean }> {
  return requestJson(buildUrl(`/admin/residents/${encodeURIComponent(amoRegno)}`), {
    method: "PATCH",
    body: JSON.stringify(payload),
  })
}

/** 도움말 RAG 챗봇 — backend `/ai/chat` (v0_farmer HelpScreen 과 같은 endpoint).
 * 정책 문서(HWPX) 청크 기반 답변. multi-turn (messages thread) + streaming 지원.
 */
export type AskHelpUsedContext = { path: string; snippet: string; score: number }
export type AskHelpResponse = {
  answer: string
  source_type: string
  used_context: AskHelpUsedContext[]
}
export type AskHelpMessage = { role: "user" | "assistant"; content: string }

/** 비-streaming (호환 유지) — 단일 질문 또는 messages thread. */
export async function askHelp(
  questionOrMessages: string | AskHelpMessage[],
  context: Record<string, string> = {},
): Promise<AskHelpResponse> {
  const body = Array.isArray(questionOrMessages)
    ? { messages: questionOrMessages, farmer_id: "", context }
    : { question: questionOrMessages, farmer_id: "", context }
  return requestJson<AskHelpResponse>(buildUrl("/ai/chat"), {
    method: "POST",
    body: JSON.stringify(body),
  })
}

/** Streaming variant — SSE 로 token / final / done 이벤트.
 *
 * `onToken`: 토큰 도착 시 (반복 호출, frontend 가 누적 표시)
 * `onFinal`: 후처리된 최종 답변 (frontend 가 raw → final 로 replace)
 * `onError`: mid-stream 또는 시작 시 에러
 * 반환: 종료를 기다리는 Promise (done 또는 error 후 resolve)
 */
export async function askHelpStream(
  messages: AskHelpMessage[],
  callbacks: {
    onToken?: (text: string) => void
    onFinal?: (resp: AskHelpResponse) => void
    onError?: (detail: string) => void
  },
  context: Record<string, string> = {},
): Promise<void> {
  const response = await fetch(buildUrl("/ai/chat/stream"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, farmer_id: "", context }),
  })
  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => "")
    callbacks.onError?.(`API ${response.status}: ${text || response.statusText}`)
    return
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buf = ""
  let currentEvent = ""
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      // SSE 한 이벤트 = "event: X\ndata: Y\n\n"
      const parts = buf.split("\n\n")
      buf = parts.pop() || ""
      for (const part of parts) {
        const lines = part.split("\n")
        let evt = ""
        let dataStr = ""
        for (const line of lines) {
          if (line.startsWith("event: ")) evt = line.slice(7).trim()
          else if (line.startsWith("data: ")) dataStr = line.slice(6)
        }
        currentEvent = evt || currentEvent
        if (!dataStr) continue
        let data: Record<string, unknown> = {}
        try { data = JSON.parse(dataStr) } catch { continue }
        if (currentEvent === "token" && typeof data.text === "string") {
          callbacks.onToken?.(data.text)
        } else if (currentEvent === "final") {
          callbacks.onFinal?.(data as unknown as AskHelpResponse)
        } else if (currentEvent === "error" && typeof data.detail === "string") {
          callbacks.onError?.(data.detail)
        } else if (currentEvent === "done") {
          return
        }
      }
    }
  } catch (e) {
    callbacks.onError?.(e instanceof Error ? e.message : "stream error")
  }
}

/** 주민에게 초대 표시 — user_master.status_cd 를 'INV' 로 (실 SMS X). */
export async function inviteResident(amoRegno: string): Promise<{
  amo_regno: string
  user_no: number
  status_cd: string
  invited_at: string
}> {
  return requestJson(buildUrl(`/admin/residents/${encodeURIComponent(amoRegno)}/invite`), {
    method: "POST",
  })
}

/**
 * 이장님 검토 액션 (확인 완료 / 재촬영 요청).
 * payload 의 status, confirmed_label, user_message 중 들어온 필드만 갱신.
 */
export async function patchEvidenceStatus(evidenceId: string, payload: EvidencePatchPayload): Promise<AdminEvidenceItem> {
  return requestJson<AdminEvidenceItem>(buildUrl(`/evidence/${evidenceId}`), {
    method: "PATCH",
    body: JSON.stringify(payload),
  })
}

/**
 * 사이드바 "새 항목" 배지 — 이장님이 마지막으로 본 시각 이후 등록된 일지/증빙 개수.
 *
 * 클라이언트가 localStorage 에 저장한 두 시각을 각각 since_diary/since_evidence 로 보냄.
 * 비어 있으면 backend 가 해당 항목을 0 으로 응답 (초기 진입 시 모든 메뉴가 0 배지).
 */
export async function fetchNewCounts(params: {
  since_diary?: string
  since_evidence?: string
}): Promise<{ diaries: number; evidence: number }> {
  return requestJson<{ diaries: number; evidence: number }>(
    buildUrl("/admin/new-counts", params),
  )
}

/**
 * 이장님 soft delete — 잘못 기록됐다고 판단한 일지를 숨김.
 *
 * DB row 는 남고 deleted_dt 만 세팅. 목록/대시보드에서는 즉시 빠짐.
 * 404 면 이미 삭제된 일지거나 잘못된 diary_id.
 */
export async function deleteDiary(diaryId: string): Promise<{ diary_id: string; deleted: boolean }> {
  return requestJson<{ diary_id: string; deleted: boolean }>(
    buildUrl(`/admin/diaries/${encodeURIComponent(diaryId)}`),
    { method: "DELETE" },
  )
}

/**
 * 이장님 soft delete — 잘못 찍힌 증빙 사진을 숨김.
 *
 * DB row 의 deleted_dt 만 세팅, S3 파일은 그대로 (cleanup job 별도).
 * 404 면 이미 삭제된 증빙이거나 잘못된 evidence_id.
 */
export async function deleteEvidence(evidenceId: string): Promise<{ evidence_id: string; deleted: boolean }> {
  return requestJson<{ evidence_id: string; deleted: boolean }>(
    buildUrl(`/admin/evidence/${encodeURIComponent(evidenceId)}`),
    { method: "DELETE" },
  )
}

/** JSON 모드 시연 데이터 카운트 + seed 존재 여부. */
export async function getDemoStatus(): Promise<DemoStatus> {
  return requestJson<DemoStatus>(buildUrl("/demo/status"))
}

/** 시연 전 JSON 모드 저장소 초기화 (mysql 모드 데이터는 손대지 않음). */
export async function resetDemoData(): Promise<DemoMutationResult> {
  return requestJson<DemoMutationResult>(buildUrl("/demo/reset"), {
    method: "POST",
  })
}

/** 시연용 샘플 diary/evidence 를 JSON 저장소에 채움. */
export async function seedDemoData(): Promise<DemoMutationResult> {
  return requestJson<DemoMutationResult>(buildUrl("/demo/seed"), {
    method: "POST",
  })
}

/**
 * 이장님이 농가에게 보낼 누락 증빙 안내문을 AI 로 생성/다듬기.
 *
 * - backend `POST /ai/evidence-guide` 호출. activity_type + missing_evidence_types 를 보내면
 *   OpenAI 가 다듬은 1~2문장 한국어 안내문이 `message` 로 돌아온다.
 * - OPENAI_API_KEY 가 없거나 OpenAI 호출이 실패해도 backend 가 규칙 기반 fallback 메시지를
 *   200 으로 돌려준다 → 호출 측은 항상 message 가 있다고 가정해도 안전.
 * - 네트워크/4xx/5xx 등 진짜 실패만 throw — 호출 측이 catch 해서 기존 정적 문구를 유지하면 된다.
 */
export async function requestEvidenceGuide(payload: {
  activity_type: string
  missing_evidence_types: string[]
}): Promise<{ message: string }> {
  return requestJson<{ message: string }>(buildUrl("/ai/evidence-guide"), {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export type LlmCompareRequest = {
  menu_key: string
  input_text: string
  context?: string
  output_format?: "text" | "json"
  max_chars?: number
}

export type LlmCompareResult = {
  request_id: string
  selected_model: string
  used_model: string
  output_text: string
  latency_ms: number
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  error?: string | null
}

export type LlmCompareResponse = {
  compare_group_id: string
  menu_key: string
  input_text: string
  results: LlmCompareResult[]
}

export async function compareLlmOutputs(payload: LlmCompareRequest): Promise<LlmCompareResponse> {
  return requestJson<LlmCompareResponse>(buildUrl("/ai/llm-compare"), {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export async function selectLlmCompareResult(payload: {
  compare_group_id: string
  request_id: string
  selected: boolean
  memo?: string
}): Promise<{ ok: boolean; compare_group_id: string; request_id: string; selected: boolean; memo: string }> {
  return requestJson(buildUrl("/ai/llm-compare/select"), {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

/* ============================================================
 * 마을 현황(구 dashboard) — 갤러리 / 누락 농가 / AI 추천
 * ============================================================ */

export type RecentEvidenceItem = {
  evidence_id: string
  farmer_id: string
  farmer_name: string
  job_cd: string
  /** prj_journal/farm_job/prj_activity/project/program_master JOIN 으로 채워지는 한글 라벨. */
  job_name?: string
  prj_id?: string
  prj_name?: string
  activity_id?: string
  activity_name?: string
  biz_name?: string
  captured_at: string | null
  /** 'http(s)://' 또는 'uploads/...' 상대경로. 상대경로면 화면에서 API_BASE_URL prefix. */
  image_path: string
  /** 촬영 후 AI To-do 일치 판정 — 확신 낮으면 "AI 확신 낮음" 뱃지. */
  needs_chief_verification?: boolean
  todo_match_reason?: string
  /** 영수증 OCR (vendor/amount/items/date). 영수증 아니면 빈 객체. raw_json.receipt_ocr 그대로. */
  receipt_ocr?: {
    vendor?: string
    amount?: number | string
    date?: string
    items?: string[] | string
  }
}

export async function getRecentEvidence(limit = 6): Promise<RecentEvidenceItem[]> {
  const data = await requestJson<{ items: RecentEvidenceItem[] }>(
    buildUrl("/admin/recent-evidence", { limit: String(limit) }),
  )
  return data.items || []
}

/** 'uploads/...' 같은 상대 경로면 API_BASE_URL prefix 붙임. 절대 URL 은 그대로. */
export function resolveImageUrl(path: string): string {
  if (!path) return ""
  if (/^https?:\/\//i.test(path)) return path
  const cleaned = path.startsWith("/") ? path.slice(1) : path
  return `${API_BASE_URL.replace(/\/$/, "")}/${cleaned}`
}

export type LaggardFarmerItem = {
  farmer_id: string
  farmer_name: string
  unfulfilled_count: number
  sample_todos: { todo_id: string; todo_title: string; due_date: string | null }[]
}

export async function getLaggardFarmers(days = 7, topN = 5): Promise<LaggardFarmerItem[]> {
  const data = await requestJson<{ items: LaggardFarmerItem[] }>(
    buildUrl("/admin/laggard-farmers", { days: String(days), top_n: String(topN) }),
  )
  return data.items || []
}

export async function notifyLaggardFarmer(
  farmerId: string,
  body?: { title?: string; message?: string; sender_user_no?: number },
): Promise<{ notice_no: number; farmer_id: string; user_no: number; sent: boolean }> {
  return requestJson(buildUrl(`/admin/laggard-farmers/${encodeURIComponent(farmerId)}/notify`), {
    method: "POST",
    body: JSON.stringify(body || {}),
  })
}

export type AiRecommendation = {
  recommendation: string
  sample_evidence: RecentEvidenceItem[]
  context: { rain_days: string[]; upcoming_todos: unknown[] }
}

export async function getAiRecommendation(): Promise<AiRecommendation> {
  return requestJson<AiRecommendation>(buildUrl("/admin/ai-recommendation"))
}

/* ============================================================
 * 기록 도우미 (farm_helper) — 이장님 권한 측 wrapper
 * ============================================================ */

export type FarmHelperPair = {
  helper_user_no: number
  help_seq: number
  recipient_user_no: number
  helper_name: string | null
  recipient_name: string | null
  assigned_at: string | null
  helper_approved_at: string | null
  recipient_approved_at: string | null
  est_end_date: string | null
  real_end_date: string | null
  is_active: boolean
  is_pending: boolean
}

export type AssignHelperPayload = {
  helper_user_no: number
  recipient_user_no: number
  /** ISO date 'YYYY-MM-DD' */
  est_end_date: string
  chief_user_no?: number
}

export async function listFarmHelpers(villeId: string): Promise<FarmHelperPair[]> {
  const data = await requestJson<{ items: FarmHelperPair[] }>(
    buildUrl("/admin/farm-helpers", { ville_id: villeId }),
  )
  return data.items || []
}

export async function assignFarmHelper(payload: AssignHelperPayload): Promise<FarmHelperPair> {
  return requestJson<FarmHelperPair>(buildUrl("/admin/farm-helpers"), {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export async function revokeFarmHelper(
  helper_user_no: number,
  help_seq: number,
  chief_user_no?: number,
): Promise<FarmHelperPair> {
  const u = new URL(
    `/admin/farm-helpers/${helper_user_no}/${help_seq}`,
    process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000",
  )
  if (chief_user_no !== undefined) u.searchParams.set("chief_user_no", String(chief_user_no))
  return requestJson<FarmHelperPair>(u.toString(), { method: "DELETE" })
}

// 마을 상세 — 마을 정보 + 단체 + 농가(amo_family) 명단을 한 번에.
export type VillageGroupRow = {
  group_no: number | string
  group_name: string
  group_type_cd?: string
  /** code_detail JOIN 으로 채워지는 한글 라벨 (예: '영농회', '작목반'). */
  group_type?: string
  group_regno?: string
  chief_no?: number | null
  chief_name?: string
  addr_1?: string
  addr_2?: string
  phone_no?: string
}

export type VillageFamilyMember = {
  user_no: number
  user_name: string
  login_id?: string
  phone_no?: string
  status_cd?: string
  farmer_regno?: string
}

export type VillageFamilyRow = {
  amo_regno: string
  ville_id: string
  amo_name: string
  chief_no?: number | null
  chief_name?: string
  addr_1?: string
  addr_2?: string
  phone_no?: string
  farmer_count: number
  members: VillageFamilyMember[]
}

export type VillageDetail = {
  village: { ville_id: string; ville_name: string; [k: string]: unknown }
  groups: VillageGroupRow[]
  families: VillageFamilyRow[]
}

export async function getVillageDetail(villeId: string): Promise<VillageDetail> {
  return requestJson<VillageDetail>(buildUrl(`/village/${encodeURIComponent(villeId)}`))
}

// 사업 참여 농가 / 단체 멤버 — 사업 상세·단체 카드 화면용.
export type ProjectMember = {
  farmer_id: string
  amo_regno: string
  farmer_name: string
  user_no?: number | null
  user_name?: string
  phone?: string
  phone_masked?: string
  group_no?: number | string | null
  group_name?: string
  is_leader: boolean
}

export async function getProjectMembers(prjId: string): Promise<ProjectMember[]> {
  const data = await requestJson<{ items: ProjectMember[] }>(
    buildUrl(`/admin/projects/${encodeURIComponent(prjId)}/members`),
  )
  return data.items || []
}

export type VillageGroupMember = {
  farmer_id: string
  amo_regno: string
  farmer_name: string
  user_no?: number | null
  user_name?: string
  phone?: string
  phone_masked?: string
  is_leader: boolean
}

export async function getVillageGroupMembers(groupNo: number | string): Promise<VillageGroupMember[]> {
  const data = await requestJson<{ items: VillageGroupMember[] }>(
    buildUrl(`/admin/village-groups/${encodeURIComponent(String(groupNo))}/members`),
  )
  return data.items || []
}

// 농가 보유 필지.
export type FarmerParcel = {
  parcel_no: string
  parcel_regno?: string
  parcel_name?: string
  usage?: string
  parcel_usage?: string
  usage_label?: string
  addr_1?: string
  addr_2?: string
  area?: number | null
  parcel_area?: number | null
  gps_lat?: number | null
  gps_long?: number | null
}

export async function getFarmerParcels(farmerId: string): Promise<FarmerParcel[]> {
  const data = await requestJson<{ items: FarmerParcel[] }>(
    buildUrl(`/farmer/${encodeURIComponent(farmerId)}/parcels`),
  )
  return data.items || []
}

/** 텍스트 → 음성 (mp3 blob). 204 면 OpenAI 키 없음/실패 → 호출 측이 SpeechSynthesis 폴백. */
export async function fetchTtsAudio(text: string, voice = "alloy"): Promise<Blob | null> {
  const res = await fetch(buildUrl("/ai/tts"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice }),
  })
  if (res.status === 204) return null
  if (!res.ok) throw new Error(`TTS ${res.status}`)
  return await res.blob()
}
