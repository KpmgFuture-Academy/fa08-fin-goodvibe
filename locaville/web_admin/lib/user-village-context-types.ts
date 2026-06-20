export type CurrentUserInfo = {
  user_no?: number | null
  user_name?: string | null
  amo_regno?: string | null
  ville_id?: string | null
  farmer_regno?: string | null
  login_id?: string | null
  phone_no?: string | null
  zip_cd?: string | null
  addr_1?: string | null
  addr_2?: string | null
  auth_key?: string | null
  email?: string | null
  status_cd?: string | null
  passwd?: string | null
}

export type CurrentVillageInfo = {
  ville_id?: string | null
  ville_name?: string | null
  chief_no?: number | null
  zip_cd?: string | null
  addr_1?: string | null
  addr_2?: string | null
  phone_no?: string | null
  nx?: number | null
  ny?: number | null
}

export type CurrentUserVillageInfo = {
  user?: CurrentUserInfo | null
  village?: CurrentVillageInfo | null
}
