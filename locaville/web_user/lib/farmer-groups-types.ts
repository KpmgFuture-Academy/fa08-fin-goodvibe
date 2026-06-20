export type FarmerGroupMember = {
  farmerId: string
  name: string
  phone: string
  status: string
  assignmentCount: number
}

export type FarmerGroupProject = {
  projectId: string
  name: string
  period: string
  status: string
}

export type FarmerGroup = {
  groupId: string
  name: string
  leaderName: string
  leaderPhone: string
  memberCount: number
  attentionCount: number
  assignmentCount: number
  lastActivityDate: string
  projects: FarmerGroupProject[]
  members: FarmerGroupMember[]
}

export type UnassignedFarmer = {
  id: string
  name: string
  phone: string
  status: string
  assignmentCount: number
}

export type FarmerGroupTotals = {
  totalGroups: number
  totalMembers: number
  totalUnassigned: number
  averageMembers: number
}

export type FarmerGroupsViewModel = {
  source: string
  groups: FarmerGroup[]
  unassignedFarmers: UnassignedFarmer[]
  totals: FarmerGroupTotals
}
