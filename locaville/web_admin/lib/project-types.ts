export type ProjectAdminActivity = {
  prj_id: string
  activity_id: string
  activity_name: string
  activity_rule?: Record<string, unknown> | null
  description?: string | null
  est_start_date?: string | null
  est_end_date?: string | null
  subsidy_amt?: number | null
  subsidy_amt_display: number
  source_flag?: string
  target_parcel_codes: string[]
  target_parcels: string[]
  target_parcel_names?: string | null
}

export type ProjectAdminParcelOption = {
  code: string
  code_name: string
}

export type ProjectAdminCodeOption = {
  code: string
  code_name: string
}

export type ProjectAdminFarmJobOption = {
  job_cd: string
  job_name?: string | null
}

export type ProjectAdminJobItem = {
  prj_id: string
  activity_id: string
  activity_name: string
  job_seq: number
  job_cd: string
  job_name?: string | null
  exec_point_cd?: string | null
  exec_point_name?: string | null
  ref_job_cd?: string | null
  ref_job_name?: string | null
  est_start_date?: string | null
  start_date_rule?: string | null
  est_end_date?: string | null
  end_date_rule?: string | null
  mandatory_yn?: string | null
  evidence_yn?: string | null
  target_parcel_codes: string[]
  target_parcels: string[]
  target_parcel_names?: string | null
}

export type ProjectAdminItem = {
  prj_id: string
  project_id: string
  prj_name: string
  exec_year?: number | null
  biz_id: string
  biz_name: string
  post_date?: string | null
  issuer?: string | null
  rag_file_id?: string | null
  activity_count: number
  activities: ProjectAdminActivity[]
}

export type ProjectAdminListResponse = {
  items: ProjectAdminItem[]
}

export type ProjectAdminDetailResponse = {
  project?: ProjectAdminItem | null
  parcel_options: ProjectAdminParcelOption[]
  jobs: ProjectAdminJobItem[]
  job_options: ProjectAdminFarmJobOption[]
  exec_point_options: ProjectAdminCodeOption[]
}

export type ProjectJobSetupResponse = {
  ok: boolean
  prj_id: string
  activity_id: string
  jobs: ProjectAdminJobItem[]
  job_options: ProjectAdminFarmJobOption[]
  exec_point_options: ProjectAdminCodeOption[]
  repeat_count: number
  repeat_job_cd?: string | null
  repeat_job_name?: string | null
  repeat_job_drafts: ProjectJobRepeatDraft[]
}

export type ProjectJobRepeatDraft = {
  exec_point_cd?: string | null
  ref_job_code_query?: string | null
  ref_job_cd?: string | null
  est_start_date?: string | null
  start_date_rule?: string | null
  est_end_date?: string | null
  end_date_rule?: string | null
  mandatory: boolean
  evidence: boolean
}

export type ProjectBaseBusinessItem = {
  biz_id: string
  biz_name: string
  biz_overview?: string | null
}

export type ProjectBaseBusinessListResponse = {
  items: ProjectBaseBusinessItem[]
}

export type ProjectActivityUpdatePayload = {
  activity_id?: string
  activity_name: string
  activity_rule?: Record<string, unknown> | null
  description?: string | null
  est_start_date?: string | null
  est_end_date?: string | null
  subsidy_amt_display: number
  parcel_codes: string[]
}

export type ProjectJobUpsertPayload = {
  job_seq?: number
  job_cd: string
  exec_point_cd?: string | null
  ref_job_cd?: string | null
  est_start_date?: string | null
  start_date_rule?: string | null
  est_end_date?: string | null
  end_date_rule?: string | null
  mandatory_yn: boolean
  evidence_yn: boolean
}

// ============================================================
// 사업 시행령 자동 초안 (PDF/DOCX/HWPX 업로드 → 사업 + todo 초안)
// ============================================================

export type ProjectDraftMeta = {
  project_name?: string | null
  project_year?: number | null
  start_date?: string | null
  end_date?: string | null
  host_org?: string | null
  exec_org?: string | null
  purpose?: string | null
  target_crops?: string[]
  target_regions?: string[]
  support_conditions?: string[]
  budget_total_krw?: number | null
  contact?: string | null
}

// backend AIPolicyRuleDateSpec — 한국어 키 (schemas/ai.py 와 일치)
export type ProjectTodoDraftDateSpec = {
  기준?: string
  전후?: string
  경과일수?: number | null
  최소경과일수?: number | null
  최대경과일수?: number | null
  근거?: string
  출처?: string
}

// backend AIPolicyRuleEvidence — 한국어 키
export type ProjectTodoDraftEvidence = {
  증빙회수?: number | null
  증빙방법?: string[]
  기타?: string
}

export type ProjectTodoDraftRule = {
  그룹ID?: string
  작업ID?: string
  작업명?: string
  선행작업?: string[]
  시작일?: ProjectTodoDraftDateSpec
  종료일?: ProjectTodoDraftDateSpec
  증빙조건?: ProjectTodoDraftEvidence
}

export type ProjectTodoDraft = {
  task_name: string
  rule: ProjectTodoDraftRule | null
  source_type: string
}

export type ProjectDraftIngestInfo = {
  filename: string
  file_type: string
  blocks: number
  chunks: number
  inserted: number
}

export type ProjectDraftPreviewBlock = {
  title?: string
  text: string
  section?: string
}

export type ProjectDraftFromDocumentResponse = {
  ingest: ProjectDraftIngestInfo
  project_draft: ProjectDraftMeta
  todo_drafts: ProjectTodoDraft[]
  preview_blocks: ProjectDraftPreviewBlock[]
}

// ============================================================
// 사업 신규 등록 (POST /project)
// ============================================================

export type ProjectCreatePayload = {
  prj_name: string
  project_id?: string | null
  auto_generate_project_id?: boolean
  rag_file_id?: string | null
  biz_id?: string | null
  biz_name?: string | null
  biz_overview?: string | null
  exec_year?: number | null
  start_date?: string | null
  end_date?: string | null
  host_org?: string | null
  exec_org?: string | null
  purpose?: string | null
  target_crops?: string[]
  target_regions?: string[]
  support_conditions?: string[]
  budget_total_krw?: number | null
  contact?: string | null
}

export type ProjectCreateResponse = {
  ok: boolean
  prj_id: string
  biz_id: string
}

export type ProjectFromRagBasicPayload = {
  rag_file_id: string
}

export type ProjectFromRagBasicSuggested = {
  prj_name?: string | null
  issuer?: string | null
  exec_year?: number | null
  post_date?: string | null
}

export type ProjectFromRagBasicResponse = {
  ok: boolean
  rag_file_id: string
  suggested: ProjectFromRagBasicSuggested
}

export type ProjectFromRagActivitySuggestionItem = {
  suggestion_id: string
  activity_name: string
  source_flag: string
  source_type?: string | null
  detail_text?: string | null
  match_score?: number | null
  exact_label_match_count?: number | null
  activity_header_count?: number | null
}

export type ProjectFromRagActivityResponse = {
  ok: boolean
  prj_id: string
  rag_file_id: string
  items: ProjectFromRagActivitySuggestionItem[]
}

export type ProjectFromRagActivityRulePayload = {
  activity_name: string
  description?: string | null
}

export type ProjectFromRagActivityRuleResponse = {
  ok: boolean
  prj_id: string
  activity_rule_suggestion?: Record<string, unknown> | null
}
