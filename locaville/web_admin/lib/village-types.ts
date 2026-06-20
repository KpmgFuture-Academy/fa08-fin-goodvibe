export type VillageItem = {
  ville_id: string
  ville_name: string
  addr_1?: string | null
  addr_2?: string | null
  zip_cd?: string | null
  phone_no?: string | null
  chief_no?: number | null
  chief_name?: string | null
  resident_count: number
  group_count: number
}

export type VillageGroupItem = {
  group_no: number
  group_name: string
  group_type_cd?: string | null
  group_regno?: string | null
  chief_no?: number | null
  chief_name?: string | null
  zip_cd?: string | null
  addr_1?: string | null
  addr_2?: string | null
  phone_no?: string | null
  reg_dt?: string | null
}

export type VillageFamilyMember = {
  user_no: number
  user_name?: string | null
  login_id?: string | null
  phone_no?: string | null
  status_cd?: string | null
  farmer_regno?: string | null
}

export type VillageFamilyItem = {
  amo_regno: string
  ville_id: string
  amo_name: string
  chief_no?: number | null
  chief_name?: string | null
  zip_cd?: string | null
  addr_1?: string | null
  addr_2?: string | null
  phone_no?: string | null
  co_regno?: string | null
  tax_regno?: string | null
  reg_dt?: string | null
  farmer_count: number
  members: VillageFamilyMember[]
}

export type VillageDetailVillage = VillageItem & {
  nx?: number | null
  ny?: number | null
  reg_dt?: string | null
  reg_no?: number | null
  mod_dt?: string | null
  mod_no?: number | null
  family_count: number
}

export type VillageListResponse = {
  items: VillageItem[]
}

export type VillageDetailResponse = {
  village?: VillageDetailVillage | null
  groups: VillageGroupItem[]
  families: VillageFamilyItem[]
}
