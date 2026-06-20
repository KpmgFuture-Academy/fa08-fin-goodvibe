export type EngageProjectItem = {
  prj_id: string
  biz_name?: string | null
  prj_name?: string | null
  post_date?: string | null
  issuer?: string | null
  engage_yn?: string | null
  engage_group_no?: number | null
  engage_group_name?: string | null
  activity_group_exists?: boolean | null
  todo_list_exists?: boolean | null
}

export type EngageProjectListResponse = {
  items: EngageProjectItem[]
  exec_year?: number
  ville_id?: string
}

export type EngageGroupItem = {
  group_no: number
  group_name?: string | null
  group_type_cd?: string | null
  group_type?: string | null
  chief_no?: number | null
  chief_name?: string | null
}

export type EngageProjectDetailResponse = {
  project?: (EngageProjectItem & { exec_year?: number | null }) | null
  groups: EngageGroupItem[]
  ville_id?: string
  user_no?: number
}

export type EngageProjectRegisterResponse = {
  ok: boolean
  prj_id: string
  ville_id: string
  group?: EngageGroupItem | null
}

export type EngageActivityItem = {
  prj_id: string
  activity_id: string
  activity_name?: string | null
  est_start_date?: string | null
  est_end_date?: string | null
}

export type EngageMemberItem = {
  amo_regno: string
  amo_name?: string | null
  chief_no?: number | null
  chief_name?: string | null
  parcels?: EngageParcelItem[]
}

export type EngageParcelItem = {
  parcel_no: number
  parcel_name?: string | null
  parcel_label?: string | null
}

export type EngageParticipationItem = {
  group_no: number
  amo_regno: string
  prj_id: string
  activity_id: string
  start_date?: string | null
  end_date?: string | null
  act_progress?: string | null
  parcel_nos?: number[]
  parcel_labels?: string | null
  remark?: string | null
}

export type EngageActivityViewResponse = {
  project?: EngageProjectItem | null
  engage_group?: {
    group_no?: number | null
    group_name?: string | null
  } | null
  activities: EngageActivityItem[]
  members: EngageMemberItem[]
  participations: EngageParticipationItem[]
  ville_id?: string
  user_no?: number
}

export type EngageActivityRegisterResponse = {
  ok: boolean
  prj_id: string
  group_no: number
  activity_id: string
  inserted_count: number
  deleted_count: number
  selected_count: number
}

export type EngageTodoItem = {
  group_no: number
  amo_regno: string
  amo_name?: string | null
  leader_no?: number | null
  leader_name?: string | null
  activity_id: string
  activity_name?: string | null
  parcel_no?: number | null
  parcel_name?: string | null
  job_seq: number
  job_cd: string
  job_name?: string | null
  est_start_date?: string | null
  est_end_date?: string | null
}

export type EngageTodoViewResponse = {
  ok: boolean
  project?: EngageProjectItem | null
  engage_group?: {
    group_no?: number | null
    group_name?: string | null
  } | null
  todo_list_exists: boolean
  created_count: number
  items: EngageTodoItem[]
  ville_id?: string
  user_no?: number
}

export type EngageTodoRefreshPreviewResponse = {
  ok: boolean
  project?: EngageProjectItem | null
  engage_group?: {
    group_no?: number | null
    group_name?: string | null
  } | null
  todo_list_exists: boolean
  items: EngageTodoItem[]
  to_add: EngageTodoItem[]
  to_delete: EngageTodoItem[]
  add_count: number
  delete_count: number
  has_changes: boolean
  ville_id?: string
  user_no?: number
}

export type EngageTodoRefreshResponse = {
  ok: boolean
  project?: EngageProjectItem | null
  engage_group?: {
    group_no?: number | null
    group_name?: string | null
  } | null
  todo_list_exists: boolean
  created_count: number
  deleted_count: number
  items: EngageTodoItem[]
  ville_id?: string
  user_no?: number
}
