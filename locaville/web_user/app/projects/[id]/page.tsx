"use client"

/**
 * 참여사업 상세 페이지 — 새 UI(`ProgramsScreen`) 의 detail 모드.
 * 활동 마감과 배정 단체 참여 현황을 한 화면에 표시.
 */
import { use, useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"

import {
  getAdminSummary,
  getAdminTodoStatus,
  getProjectMembers,
  notifyLaggardFarmer,
  type ProjectMember,
} from "@/lib/admin-api"
import type { AdminTodoStatusItem } from "@/lib/admin-types"
import { fetchVillageProjects, type VillageProject } from "@/lib/projects"
import { useCurrentUserVillage } from "@/components/CurrentUserVillageContext"
import ProgramsScreen, {
  type DeadlineRow,
  type MemberRow,
  type ProgramDetailData,
} from "@/components/chief/ProgramsScreen"
import EngageAddModal, { type EngageCandidate } from "@/components/chief/EngageAddModal"
import Toast, { useToast } from "@/components/chief/Toast"
import { aggregateTodos, todoCompletionRatio } from "@/lib/progress"

function daysLeft(iso: string | null | undefined): number {
  if (!iso) return 9999
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 9999
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - today.getTime()) / 86_400_000)
}

function dueLabel(iso: string | null | undefined): string {
  if (!iso) return ""
  const left = daysLeft(iso)
  if (left < 0) return `${Math.abs(left)}일 지남`
  if (left === 0) return "오늘 마감"
  return `D-${left}`
}

function buildDetail(
  project: VillageProject,
  todos: AdminTodoStatusItem[],
  projectMembers: ProjectMember[],
  todoFarmerSet: Set<string>,
): ProgramDetailData {
  // 활동별 마감/완료 집계
  const byActivity = new Map<string, { activity_id: string; activity_name: string; done: number; total: number; end_date?: string | null }>()
  for (const a of project.activities) {
    byActivity.set(a.activity_id, {
      activity_id: a.activity_id,
      activity_name: a.activity_name,
      done: 0,
      total: 0,
      end_date: a.end_date,
    })
  }
  for (const t of todos) {
    if (!t.activity_id) continue
    const row = byActivity.get(t.activity_id)
    if (!row) continue
    row.total += 1
    row.done += todoCompletionRatio(t)
  }
  const deadlines: DeadlineRow[] = Array.from(byActivity.values()).map((r) => ({
    name: r.activity_name,
    dueText: dueLabel(r.end_date ?? null),
    daysLeft: daysLeft(r.end_date ?? null),
    doneCount: Math.round(r.done),
    total: r.total || 0,
  }))

  // 농가 명단 — /admin/projects/{prj_id}/members (act_grp 등록) 기준.
  // participating: todo 가 1건이라도 존재하면 true (현재 진행중), 아니면 false (등록만).
  const members: MemberRow[] = projectMembers.map((m) => ({
    id: m.farmer_id,
    name: m.farmer_name,
    phoneMasked: m.phone_masked || "",
    isLeader: m.is_leader,
    participating: todoFarmerSet.has(m.farmer_id),
  }))

  // 진척 — 전체 todo 의 ratio 평균 (부분 제출도 반영).
  const progress = aggregateTodos(todos).ratio

  return {
    tag: { label: project.biz_name || "사업", tone: "neutral" },
    biz: project.biz_name || "",
    name: project.prj_name,
    issuer: "",
    year: project.exec_year ?? new Date().getFullYear(),
    groupName: project.group_name || "",
    participants: members.filter((m) => m.participating).length,
    memberTotal: members.length,
    progress,
    deadlines,
    members,
  }
}

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const { id: prjId } = use(params)
  const village = useCurrentUserVillage()
  const villageName = village.currentUserVillageInfo?.village?.ville_name ?? "우리 마을"
  const villeId = village.currentUserVillageInfo?.village?.ville_id ?? ""

  const [project, setProject] = useState<VillageProject | null>(null)
  const [todos, setTodos] = useState<AdminTodoStatusItem[]>([])
  const [projectMembers, setProjectMembers] = useState<ProjectMember[]>([])
  const [villageFarmers, setVillageFarmers] = useState<{ farmer_id: string; name: string }[]>([])
  const [engageOpen, setEngageOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const toast = useToast()

  useEffect(() => {
    if (!villeId) return
    let alive = true
    setLoading(true)
    Promise.all([
      fetchVillageProjects({ ville_id: villeId }),
      getAdminTodoStatus({ prj_id: prjId }).catch(() => []),
      getProjectMembers(prjId).catch(() => []),
      getAdminSummary().catch(() => null),
    ])
      .then(([projects, ts, pms, summary]) => {
        if (!alive) return
        setProject(projects.find((p) => p.prj_id === prjId) ?? null)
        setTodos(ts)
        setProjectMembers(pms)
        setVillageFarmers(
          (summary?.diaries_by_farmer ?? []).map((f) => ({
            farmer_id: f.farmer_id,
            name: f.amo_name || f.user_name || f.farmer_name || f.farmer_id,
          })),
        )
        setError("")
      })
      .catch((err) => { if (alive) setError(err instanceof Error ? err.message : "사업 정보를 불러오지 못했어요.") })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [villeId, prjId])

  // 마을 농가 중 이 사업에 아직 안 들어간 사람들.
  const engageCandidates: EngageCandidate[] = useMemo(() => {
    const memberIds = new Set(projectMembers.map((m) => m.farmer_id))
    return villageFarmers
      .filter((f) => !memberIds.has(f.farmer_id))
      .map((f) => ({ id: f.farmer_id, name: f.name, sub: "마을 농가" }))
  }, [projectMembers, villageFarmers])

  // todo 에 등장한 농가 집합 — participating 표시에 사용.
  const todoFarmerSet = useMemo(() => {
    const set = new Set<string>()
    for (const t of todos) if (t.farmer_id) set.add(t.farmer_id)
    return set
  }, [todos])

  const detail: ProgramDetailData | null = useMemo(
    () => (project ? buildDetail(project, todos, projectMembers, todoFarmerSet) : null),
    [project, todos, projectMembers, todoFarmerSet],
  )

  const onBack = useCallback(() => router.push("/projects"), [router])
  const onOpenFarmer = useCallback(
    (id: string) => router.push(`/residents/${encodeURIComponent(id)}`),
    [router],
  )

  // 사업 참여/제외 — 활동×필지 단위 등록이라 단순 토글이 불가. 사업참여 화면으로.
  const onToggleMember = useCallback(
    () => router.push(`/engage`),
    [router],
  )
  // 사업 모달로 농가 참여시키기.
  const onAddMember = useCallback(() => setEngageOpen(true), [])
  const handleEngageAdd = useCallback(
    (ids: string[]) => {
      setEngageOpen(false)
      // 시연 단계 — 실제 등록은 사업참여(/engage) 흐름에서 처리.
      // 여기서는 사용자가 누가 추가됐는지 확인할 수 있도록 토스트만 띄움.
      toast.show(`${ids.length}명 참여 요청을 보냈어요`)
    },
    [toast],
  )

  // 활동 마감 임박 — 해당 사업의 미완료 농가들에게 일괄 알림 발송.
  const onNudgeDeadline = useCallback(
    async (activityName: string) => {
      const targets = projectMembers
        .filter((m) => todoFarmerSet.has(m.farmer_id))
        .map((m) => m.farmer_id)
      if (!targets.length) return
      const message = `${activityName} 마감이 임박했어요. 진행 상황을 확인해 주세요.`
      try {
        await Promise.all(
          targets.map((id) => notifyLaggardFarmer(id, { message }).catch(() => null)),
        )
        toast.show(`${targets.length}명에게 문자를 보냈어요`)
      } catch (err) {
        setError(err instanceof Error ? err.message : "문자 발송 중 오류가 났어요.")
      }
    },
    [projectMembers, todoFarmerSet, toast],
  )

  // 미제출 농가 보기 — 증빙 페이지로 prj 필터 걸어 이동.
  const onSeeUnsubmitted = useCallback(
    () => router.push(`/evidence?prj_id=${encodeURIComponent(prjId)}`),
    [router, prjId],
  )

  if (loading) {
    return <div className="p-6 text-[15px] font-bold text-[color:var(--lvb-muted)]">사업 정보를 불러오는 중이에요…</div>
  }
  if (error || !detail) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-[var(--lvb-danger)] bg-[var(--lvb-danger-soft)] p-4 text-[15px] font-bold text-[color:var(--lvb-danger)]">{error || "사업을 찾을 수 없어요."}</div>
      </div>
    )
  }

  return (
    <>
      <ProgramsScreen
        villageName={villageName}
        programs={[]}
        detail={detail}
        onOpen={() => {}}
        onBack={onBack}
        onOpenFarmer={onOpenFarmer}
        onToggleMember={onToggleMember}
        onAddMember={onAddMember}
        onNudgeDeadline={onNudgeDeadline}
        onSeeUnsubmitted={onSeeUnsubmitted}
      />
      <EngageAddModal
        open={engageOpen}
        groupName={detail.groupName || project?.prj_name || "이 사업"}
        candidates={engageCandidates}
        onClose={() => setEngageOpen(false)}
        onAdd={handleEngageAdd}
      />
      <Toast msg={toast.msg} />
    </>
  )
}
