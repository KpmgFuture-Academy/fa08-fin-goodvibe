"use client"

/**
 * 마을 주민 페이지 — 새 UI(`VillageScreen`) 기반.
 * 농가별 보기를 기본으로 하고, 단체별 보기는 그룹 API 가 추가되면 채운다.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"

import {
  BACKEND_CONNECTION_ERROR_MESSAGE,
  createResident,
  getVillageGroupMembers,
  notifyLaggardFarmer,
  type VillageGroupMember,
  type VillageGroupRow,
} from "@/lib/admin-api"
import type { AdminTodoStatusItem, FarmerDiarySummary, AdminSummary } from "@/lib/admin-types"
import { aggregateAsInt } from "@/lib/progress"
import { useCachedResource, invalidate } from "@/lib/chief-cache"
import { chiefRes } from "@/lib/chief-resources"
import { useCurrentUserVillage } from "@/components/CurrentUserVillageContext"
import VillageScreen, { type RosterFarmer, type GroupCard } from "@/components/chief/VillageScreen"
import AddResidentModal, { type AddResidentPayload, type GroupPickOption } from "@/components/chief/AddResidentModal"
import { summaryToFarmer } from "@/lib/chief-adapters"
import { getFarmerParcels, parcelDisplayName, usageToCrop, type FarmerParcel } from "@/lib/farmer-api"
import type { ParcelInfo } from "@/components/chief/chief-ui"

// 영문 raw 약자(예: VOL, COOP) 가 그대로 화면에 보이지 않게 가드.
// 한글 라벨이 있으면 그것, 없으면 일반 "단체" 로 폴백.
function safeGroupTypeLabel(g: VillageGroupRow): string {
  const ko = (g.group_type || "").trim()
  if (ko) return ko
  return "단체"
}

function groupRowToCard(
  g: VillageGroupRow,
  members: VillageGroupMember[],
): GroupCard {
  return {
    id: String(g.group_no),
    name: g.group_name || "이름 없는 단체",
    leaderName: g.chief_name || "",
    tag: { label: safeGroupTypeLabel(g), tone: "neutral" },
    biz: "",
    members: members.map((m) => ({
      id: m.farmer_id,
      name: m.farmer_name,
      isLeader: m.is_leader,
      optedOut: false,
    })),
    participants: members.length,
  }
}

function toRoster(
  s: FarmerDiarySummary,
  parcels: ParcelInfo[] = [],
  progress?: { done: number; total: number },
): RosterFarmer {
  const base = summaryToFarmer(s)
  return {
    ...base,
    parcels,
    projTags: [],
    // todo-status 로 재계산된 ratio 기반 done/total 이 있으면 우선.
    // 없을 땐 backend admin_view 의 엄격한 'END' 카운트로 폴백.
    done: progress?.done ?? s.done_todo_count ?? 0,
    total: progress?.total ?? s.todo_count ?? 0,
  }
}

export default function ResidentsPage() {
  const router = useRouter()
  const village = useCurrentUserVillage()
  const villageName = village.currentUserVillageInfo?.village?.ville_name ?? "우리 마을"
  const villeId = village.currentUserVillageInfo?.village?.ville_id ?? ""

  const [groupMembersMap, setGroupMembersMap] = useState<Record<string, VillageGroupMember[]>>({})
  // 농가별 보유 필지 — 카드 "필지 미등록" 대신 실제 필지(작물) 노출용. farmer_id → ParcelInfo[].
  const [parcelsByFarmer, setParcelsByFarmer] = useState<Record<string, ParcelInfo[]>>({})
  const [addOpen, setAddOpen] = useState(false)
  const [error, setError] = useState("") // 독려/주민등록 등 액션 오류

  // 상단 공용 데이터는 캐시에서 — 다른 탭(처리함·사업)과 공유 + 접속 시 프리페치 → 탭 복귀 즉시.
  const sumRes = chiefRes.summary()
  const todoRes = chiefRes.todoStatus()
  const vdRes = chiefRes.villageDetail(villeId)
  const summaryQ = useCachedResource(sumRes.key, sumRes.fetcher)
  const todoQ = useCachedResource(todoRes.key, todoRes.fetcher)
  const vdQ = useCachedResource(villeId ? vdRes.key : null, vdRes.fetcher, { enabled: !!villeId })
  const summary: AdminSummary | null = summaryQ.data ?? null
  const todos: AdminTodoStatusItem[] = todoQ.data ?? []
  const groupRows: VillageGroupRow[] = vdQ.data?.groups ?? []
  const loading = summaryQ.loading || (!!villeId && vdQ.loading)
  const loadErr = summaryQ.error ? BACKEND_CONNECTION_ERROR_MESSAGE : ""
  const shownError = error || loadErr

  // ?add=1 진입 시 모달 자동 open + history clean-up.
  useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    if (params.get("add") === "1") {
      setAddOpen(true)
      router.replace("/residents")
    }
  }, [router])

  // 단체 멤버는 마을상세(groupRows, 캐시)가 잡히면 병렬 fetch. 단체 수가 적어 비용 미미.
  const groupNosKey = groupRows.map((g) => g.group_no).join(",")
  useEffect(() => {
    if (!groupRows.length) { setGroupMembersMap({}); return }
    let alive = true
    void Promise.all(
      groupRows.map(async (g) => {
        const ms = await getVillageGroupMembers(g.group_no).catch(() => [] as VillageGroupMember[])
        return [String(g.group_no), ms] as const
      }),
    ).then((entries) => { if (alive) setGroupMembersMap(Object.fromEntries(entries)) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupNosKey])

  const farmers = summary?.diaries_by_farmer ?? []

  // 농가 목록이 잡히면 각 농가의 필지를 병렬 fetch (농가 수가 적어 비용 미미).
  // farmer_id 문자열 키로 비교해 불필요한 재요청을 막는다. 주민 추가로 summary 가 갱신돼도 자동 반영.
  const farmerIdsKey = farmers.map((f) => f.farmer_id).join(",")
  useEffect(() => {
    if (!farmers.length) { setParcelsByFarmer({}); return }
    let alive = true
    void Promise.all(
      farmers.map(async (f) => {
        const ps = await getFarmerParcels(f.farmer_id).catch(() => [] as FarmerParcel[])
        const infos: ParcelInfo[] = ps.map((p) => ({ name: parcelDisplayName(p), crop: usageToCrop(p) }))
        return [f.farmer_id, infos] as const
      }),
    ).then((entries) => { if (alive) setParcelsByFarmer(Object.fromEntries(entries)) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farmerIdsKey])

  // 농가별 todo ratio 합산 — backend admin_view 의 엄격한 'END' 카운트 대신 사용.
  const progressByFarmer = useMemo(() => {
    const groups = new Map<string, AdminTodoStatusItem[]>()
    for (const t of todos) {
      if (!t.farmer_id) continue
      ;(groups.get(t.farmer_id) ?? groups.set(t.farmer_id, []).get(t.farmer_id)!).push(t)
    }
    const out: Record<string, { done: number; total: number }> = {}
    for (const [fid, items] of groups) {
      out[fid] = aggregateAsInt(items)
    }
    return out
  }, [todos])

  const roster = useMemo(
    () =>
      farmers.map((f) =>
        toRoster(f, parcelsByFarmer[f.farmer_id] ?? [], progressByFarmer[f.farmer_id]),
      ),
    [farmers, parcelsByFarmer, progressByFarmer],
  )
  const groups: GroupCard[] = useMemo(
    () => groupRows.map((g) => groupRowToCard(g, groupMembersMap[String(g.group_no)] ?? [])),
    [groupRows, groupMembersMap],
  )

  const onOpenFarmer = useCallback(
    (id: string) => router.push(`/residents/${encodeURIComponent(id)}`),
    [router],
  )
  const onOpenGroup = useCallback(
    (id: string) => router.push(`/farmer-groups#${encodeURIComponent(id)}`),
    [router],
  )
  const onNudge = useCallback(async (id: string) => {
    try {
      await notifyLaggardFarmer(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : "문자 발송 중 오류가 났어요.")
    }
  }, [])
  const onAddResident = useCallback(() => setAddOpen(true), [])

  // 모달 → backend POST /admin/residents. 성공 시 마을 데이터 새로고침.
  const handleSubmitAdd = useCallback(
    async (resident: AddResidentPayload) => {
      try {
        await createResident({
          name: resident.name,
          phone: resident.phone,
          address: resident.address || undefined,
          addressDetail: resident.addressDetail || undefined,
          parcelCrops: resident.parcelCrops,
          groupNo: resident.groupNo ?? undefined,
          villeId: villeId || undefined,
        })
        setAddOpen(false)
        invalidate("chief:summary")
        invalidate(`chief:village-detail:${villeId}`)
      } catch (e) {
        const msg = e instanceof Error ? e.message : "주민 등록 실패"
        setError(msg)
      }
    },
    [villeId],
  )

  // 모달 안 단체 radio 데이터 매핑.
  const groupOptions: GroupPickOption[] = useMemo(
    () =>
      groupRows.map((g) => ({
        group_no: g.group_no,
        group_name: g.group_name || "이름 없는 단체",
        tag: { label: safeGroupTypeLabel(g), tone: "neutral" },
      })),
    [groupRows],
  )

  if (loading) {
    return <div className="p-6 text-[15px] font-bold text-[color:var(--lvb-muted)]">마을 정보를 불러오는 중이에요…</div>
  }
  if (shownError) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-[var(--lvb-danger)] bg-[var(--lvb-danger-soft)] p-4 text-[15px] font-bold text-[color:var(--lvb-danger)]">{shownError}</div>
      </div>
    )
  }

  return (
    <>
      <VillageScreen
        villageName={villageName}
        farmerCount={roster.length}
        groupCount={groups.length}
        roster={roster}
        groups={groups}
        onOpenFarmer={onOpenFarmer}
        onOpenGroup={onOpenGroup}
        onNudge={onNudge}
        onAddResident={onAddResident}
      />
      <AddResidentModal
        open={addOpen}
        groups={groupOptions}
        onClose={() => setAddOpen(false)}
        onAdd={handleSubmitAdd}
      />
    </>
  )
}
