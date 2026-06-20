/** 영농일지 관련 TS 타입 정의 (DiaryRecord + 입력 방식 enum 등). */
export type InputMethod = "voice" | "manual" | "photo";

export type ManualDiaryInput = {
  workDate: string;
  work: string;
  field: string;
  cropName: string;
  workDetail: string;
  linkedEvidenceText: string;
  /** 기록 도우미 모드 시 recipient 의 amo_regno. 비우면 본인(SAMPLE_USER_CONTEXT.farmer_id). */
  farmer_id?: string;
  todo_id?: string;
  group_no?: number;
  prj_id?: string;
  project_id?: string;
  activity_id?: string;
  job_cd?: string;
  parcel_no?: string;
  field_id?: string;
  input_type?: "voice" | "chat" | "manual";
  input_type_cd?: string;
  /** STT 인식 원본 텍스트 — 사용자 검증 후 메모 필드와 다를 수 있어 별도 보존. */
  voice_text?: string;
  /** (선택) Supabase Storage 에 보관된 음성 파일 URL — 학습 데이터. */
  voice_audio_url?: string;
  /** 유사도 매칭이 추천한 job_cd. 사용자 최종 선택과 비교해 추후 학습. */
  voice_predicted_job_cd?: string;
};

export type DiaryValidationResult = {
  is_valid: boolean;
  missing_fields: string[];
  message: string;
};

export type DiaryRecord = {
  diary_id: string;
  todo_id: string;
  project_id: string;
  prj_id?: string;
  group_no?: number;
  farmer_id: string;
  farmer_name: string;
  worker_name: string;
  work_date: string;
  field_id: string;
  parcel_no?: string;
  field_address: string;
  latitude: string;
  longitude: string;
  weather_source: string;
  weather_status: string;
  temperature_avg_c: string;
  temperature_max_c: string;
  temperature_min_c: string;
  precipitation_mm: string;
  humidity_avg_percent: string;
  sunshine_duration_hours: string;
  weather_summary: string;
  crop_name: string;
  activity_id?: string;
  job_cd?: string;
  variety_name: string;
  cultivation_area_ha: string;
  fertilizer_type: string;
  fertilizer_product_name: string;
  fertilizer_purchase_place: string;
  fertilizer_use_date: string;
  fertilizer_amount_per_area: string;
  pesticide_name: string;
  pesticide_purchase_place: string;
  pesticide_use_date: string;
  pesticide_amount: string;
  pesticide_dilution_ratio: string;
  seedling_type: string;
  seedling_purchase_place: string;
  seedling_purchase_amount: string;
  work_stage: string;
  work_stage_detail: string;
  work_detail: string;
  harvest_amount: string;
  sales_place: string;
  sales_date: string;
  sales_amount_krw: string;
  before_photo_evidence_id: string;
  during_photo_evidence_id: string;
  after_photo_evidence_id: string;
  linked_evidence_ids: string[];
  selected_activity_type: string;
  activity_selection: Record<string, unknown>;
  material_selection: Record<string, unknown>;
  photo_link_option: string;
  ai_autofill_used: boolean;
  ai_autofill_model: string;
  ai_autofill_source: string;
  ai_autofill_suggestions: Record<string, unknown>;
  ai_autofill_applied_fields: string[];
  status: string;
  created_at: string;
  updated_at: string;
  input_method: InputMethod;
  input_type_cd?: string;
  /** STT 인식 원본 (사용자 검증/수정 전). 메모와 별도 보존 → 추후 STT 학습. */
  voice_text?: string;
  /** (선택) Supabase Storage 에 보관된 음성 파일 URL. */
  voice_audio_url?: string;
  /** 유사도 매칭이 추천한 job_cd. 사용자 최종 선택과 비교. */
  voice_predicted_job_cd?: string;
};
