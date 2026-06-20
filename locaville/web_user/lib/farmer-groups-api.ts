import type {
  FarmerGroup,
  FarmerGroupMember,
  FarmerGroupProject,
  FarmerGroupsViewModel,
  UnassignedFarmer,
} from "@/lib/farmer-groups-types"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000"
const BACKEND_CONNECTION_ERROR_MESSAGE = "백엔드에 연결할 수 없습니다. FastAPI 서버 실행 상태를 확인해 주세요."

type AdminBusinessEntity = {
  id: string
  kind?: string
  name?: string
  group?: string
  phone?: string
  status?: string
}

type AdminBusiness = {
  id: string
  name?: string
  start?: string
  end?: string
  status?: string
}

type AdminParticipation = {
  businessId: string
  entityId: string
  status?: string
}

type AdminTaskAssignment = {
  businessId: string
  entityId: string
  taskId: string
  status?: string
  due?: string
}

type AdminBusinessManagementResponse = {
  source?: string
  businesses?: AdminBusiness[]
  entities?: AdminBusinessEntity[]
  participations?: AdminParticipation[]
  taskAssignments?: AdminTaskAssignment[]
}

function buildUrl(path: string): string {
  return new URL(path, API_BASE_URL).toString()
}

async function requestJson<T>(url: string): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, { cache: "no-store" })
  } catch {
    throw new Error(BACKEND_CONNECTION_ERROR_MESSAGE)
  }

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`API ${response.status}: ${text || response.statusText}`)
  }

  return (await response.json()) as T
}

function normalizeGroupName(group?: string): string {
  const trimmed = (group || "").trim()
  return trimmed && trimmed !== "-" ? trimmed : ""
}

function makeGroupId(groupName: string, index: number): string {
  return `group-${index + 1}-${encodeURIComponent(groupName).replace(/%/g, "").toLowerCase()}`
}

function formatPeriod(start?: string, end?: string): string {
  const startText = start && start !== "-" ? start.slice(0, 10).replaceAll("-", ".") : "-"
  const endText = end && end !== "-" ? end.slice(0, 10).replaceAll("-", ".") : "-"
  if (startText === "-" && endText === "-") return "-"
  return `${startText} - ${endText}`
}

function latestDue(assignments: AdminTaskAssignment[]): string {
  const dates = assignments
    .map((assignment) => assignment.due || "")
    .filter((due) => due && due !== "-")
    .sort()

  return dates.at(-1)?.slice(0, 10) || "-"
}

function isAttentionStatus(status?: string): boolean {
  return ["보완요청", "검토 필요", "확인 필요", "needs_review", "retake_required"].includes((status || "").trim())
}

function toMember(entity: AdminBusinessEntity, assignments: AdminTaskAssignment[]): FarmerGroupMember {
  return {
    farmerId: entity.id,
    name: entity.name || entity.id,
    phone: entity.phone || "-",
    status: entity.status || "참여중",
    assignmentCount: assignments.length,
  }
}

function toUnassignedFarmer(entity: AdminBusinessEntity, assignments: AdminTaskAssignment[]): UnassignedFarmer {
  return {
    id: entity.id,
    name: entity.name || entity.id,
    phone: entity.phone || "-",
    status: entity.status || "단체 미배정",
    assignmentCount: assignments.length,
  }
}

function toProject(business: AdminBusiness, status?: string): FarmerGroupProject {
  return {
    projectId: business.id,
    name: business.name || business.id,
    period: formatPeriod(business.start, business.end),
    status: status || business.status || "참여중",
  }
}

function transformBusinessManagement(data: AdminBusinessManagementResponse): FarmerGroupsViewModel {
  const businesses = data.businesses || []
  const entities = data.entities || []
  const participations = data.participations || []
  const taskAssignments = data.taskAssignments || []
  const businessById = new Map(businesses.map((business) => [business.id, business]))
  const assignmentsByEntity = new Map<string, AdminTaskAssignment[]>()
  const participationsByEntity = new Map<string, AdminParticipation[]>()

  for (const assignment of taskAssignments) {
    const current = assignmentsByEntity.get(assignment.entityId) || []
    current.push(assignment)
    assignmentsByEntity.set(assignment.entityId, current)
  }

  for (const participation of participations) {
    const current = participationsByEntity.get(participation.entityId) || []
    current.push(participation)
    participationsByEntity.set(participation.entityId, current)
  }

  const groupedEntities = new Map<string, AdminBusinessEntity[]>()
  const unassignedFarmers: UnassignedFarmer[] = []

  for (const entity of entities) {
    const assignments = assignmentsByEntity.get(entity.id) || []
    const groupName = normalizeGroupName(entity.group)
    if (!groupName) {
      unassignedFarmers.push(toUnassignedFarmer(entity, assignments))
      continue
    }

    const current = groupedEntities.get(groupName) || []
    current.push(entity)
    groupedEntities.set(groupName, current)
  }

  const groups: FarmerGroup[] = Array.from(groupedEntities.entries()).map(([groupName, groupEntities], index) => {
    const members = groupEntities.map((entity) => toMember(entity, assignmentsByEntity.get(entity.id) || []))
    const groupAssignments = groupEntities.flatMap((entity) => assignmentsByEntity.get(entity.id) || [])
    const projectMap = new Map<string, FarmerGroupProject>()

    for (const entity of groupEntities) {
      for (const participation of participationsByEntity.get(entity.id) || []) {
        const business = businessById.get(participation.businessId)
        if (!business || projectMap.has(participation.businessId)) continue
        projectMap.set(participation.businessId, toProject(business, participation.status))
      }
    }

    const leader = members[0]
    return {
      groupId: makeGroupId(groupName, index),
      name: groupName,
      leaderName: leader?.name || "대표 미지정",
      leaderPhone: leader?.phone || "-",
      memberCount: members.length,
      attentionCount: members.filter((member) => isAttentionStatus(member.status)).length,
      assignmentCount: groupAssignments.length,
      lastActivityDate: latestDue(groupAssignments),
      projects: Array.from(projectMap.values()),
      members,
    }
  })

  const totalGroups = groups.length
  const totalMembers = groups.reduce((sum, group) => sum + group.memberCount, 0)
  const averageMembers = totalGroups > 0 ? Math.round(totalMembers / totalGroups) : 0

  return {
    source: data.source || "backend",
    groups,
    unassignedFarmers,
    totals: {
      totalGroups,
      totalMembers,
      totalUnassigned: unassignedFarmers.length,
      averageMembers,
    },
  }
}

export async function getFarmerGroups(): Promise<FarmerGroupsViewModel> {
  const data = await requestJson<AdminBusinessManagementResponse>(buildUrl("/business-management/admin"))
  return transformBusinessManagement(data)
}
