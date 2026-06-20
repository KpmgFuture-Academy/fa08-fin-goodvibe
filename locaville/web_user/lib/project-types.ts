export type ProjectAdminActivity = {
  prj_id: string
  activity_id: string
  activity_name: string
  est_start_date?: string | null
  est_end_date?: string | null
  subsidy_amt?: number | null
  subsidy_amt_display: number
  target_parcel_codes: string[]
  target_parcels: string[]
  target_parcel_names?: string | null
}

export type ProjectAdminParcelOption = {
  code: string
  code_name: string
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
}

export type ProjectActivityUpdatePayload = {
  activity_id?: string
  activity_name: string
  est_start_date?: string | null
  est_end_date?: string | null
  subsidy_amt_display: number
  parcel_codes: string[]
}
