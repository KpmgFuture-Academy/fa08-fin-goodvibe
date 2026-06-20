"use client"

/**
 * 진행중인 사업 목록 — 새 UI(`ProgramsScreen`) 의 list 모드.
 * 상세는 `/projects/[id]` 에서 ProgramsScreen 의 detail 모드를 사용.
 */
import { useCallback, useMemo, useState } from "react"
import { useRouter } from "next/navigation"

import { type VillageProject } from "@/lib/projects"
import { type VillageGroupRow } from "@/lib/admin-api"
import type { AdminTodoStatusItem } from "@/lib/admin-types"
import { useCachedResource, invalidate } from "@/lib/chief-cache"
import { chiefRes } from "@/lib/chief-resources"
import { useCurrentUserVillage } from "@/components/CurrentUserVillageContext"
import ProgramsScreen, { type ProgramCard } from "@/components/chief/ProgramsScreen"
import AddProjectModal, { type AddProjectGroupOption } from "@/components/chief/AddProjectModal"
import Toast, { useToast } from "@/components/chief/Toast"
import { aggregateTodos } from "@/lib/progress"

function projectToCard(p: VillageProject, progressByPrj: Map<string, { done: number; total: number; participants: number }>): ProgramCard {
  const next = p.activities
    .filter((a) => a.end_date)
    .sort((a, b) => (a.end_date! < b.end_date! ? -1 : 1))[0]
  const agg = progressByPrj.get(p.prj_id)
  const progress = agg && agg.total > 0 ? agg.done / agg.total : 0
  return {
    id: p.prj_id,
    tag: { label: p.biz_name || "사업", tone: "neutral" },
    biz: p.biz_name || "",
    name: p.prj_name,
    issuer: "",
    year: p.exec_year ?? new Date().getFullYear(),
    progress,
    groupName: p.group_name || "",
    participants: agg?.participants ?? 0,
    nextDeadline: next ? { name: next.activity_name, dueText: next.end_date || "" } : null,
  }
}

export default function ProjectsPage() {
  const router = useRouter()
  const village = useCurrentUserVillage()
  const villageName = village.currentUserVillageInfo?.village?.ville_name ?? "우리 마을"
  const villeId = village.currentUserVillageInfo?.village?.ville_id ?? ""

  const [addOpen, setAddOpen] = useState(false)
  const toast = useToast()

  // 공용 캐시에서 — 다른 탭(처리함·일정)과 공유 + 접속 시 프리페치 → 탭 복귀 즉시(리로드 X).
  const projRes = chiefRes.projects(villeId)
  const todoRes = chiefRes.todoStatus()
  const vdRes = chiefRes.villageDetail(villeId)
  const projQ = useCachedResource(villeId ? projRes.key : null, projRes.fetcher, { enabled: !!villeId })
  const todoQ = useCachedResource(todoRes.key, todoRes.fetcher)
  const vdQ = useCachedResource(villeId ? vdRes.key : null, vdRes.fetcher, { enabled: !!villeId })
  const list: VillageProject[] = projQ.data ?? []
  const todos: AdminTodoStatusItem[] = todoQ.data ?? []
  const groupRows: VillageGroupRow[] = vdQ.data?.groups ?? []
  const loading = !villeId || projQ.loading || todoQ.loading || vdQ.loading
  const errorMsg = projQ.error || vdQ.error ? "사업 목록을 불러오지 못했어요." : ""

  // AddProjectModal 의 단체 옵션 매핑.
  const groupOptions: AddProjectGroupOption[] = useMemo(
    () =>
      groupRows.map((g) => ({
        group_no: g.group_no,
        group_name: g.group_name || "이름 없는 단체",
        group_type: g.group_type || undefined,
      })),
    [groupRows],
  )

  // 사업별 진척 (todo 완료 비율) + 참여 농가 수 집계. 부분 제출도 진척에 반영.
  const progressByPrj = useMemo(() => {
    const groups = new Map<string, AdminTodoStatusItem[]>()
    for (const t of todos) {
      const pid = t.prj_id || ""
      if (!pid) continue
      ;(groups.get(pid) ?? groups.set(pid, []).get(pid)!).push(t)
    }
    const out = new Map<string, { done: number; total: number; participants: number }>()
    for (const [pid, items] of groups) {
      const agg = aggregateTodos(items)
      out.set(pid, { done: agg.done, total: agg.total, participants: agg.participants })
    }
    return out
  }, [todos])

  const programs = useMemo(() => list.map((p) => projectToCard(p, progressByPrj)), [list, progressByPrj])

  const onOpen = useCallback((id: string) => router.push(`/projects/${encodeURIComponent(id)}`), [router])

  if (loading) {
    return <div className="p-6 text-[15px] font-bold text-[color:var(--lvb-muted)]">사업 목록을 불러오는 중이에요…</div>
  }
  if (errorMsg) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-[var(--lvb-danger)] bg-[var(--lvb-danger-soft)] p-4 text-[15px] font-bold text-[color:var(--lvb-danger)]">{errorMsg}</div>
      </div>
    )
  }

  return (
    <>
      <ProgramsScreen
        villageName={villageName}
        programs={programs}
        detail={null}
        onOpen={onOpen}
        onBack={() => router.push("/projects")}
        onOpenFarmer={(id) => router.push(`/residents/${encodeURIComponent(id)}`)}
        onToggleMember={() => router.push("/engage")}
        onAddMember={() => router.push("/engage")}
        onNudgeDeadline={() => {}}
        onSeeUnsubmitted={() => router.push("/evidence")}
        onAddProject={() => setAddOpen(true)}
      />
      <AddProjectModal
        open={addOpen}
        groups={groupOptions}
        onClose={() => setAddOpen(false)}
        onAdded={(msg) => {
          toast.show(msg)
          invalidate(`chief:projects:${villeId}`)
          invalidate("chief:todo-status")
        }}
      />
      <Toast msg={toast.msg} />
    </>
  )
}
