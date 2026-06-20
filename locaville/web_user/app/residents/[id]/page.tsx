"use client"

/**
 * 농가 상세 페이지 — 새 UI(`FarmerDetailScreen`) 기반.
 * admin-api 의 일지/증빙/단체/도우미 정보를 새 컴포넌트 props 로 매핑.
 */
import { use, useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"

import {
  BACKEND_CONNECTION_ERROR_MESSAGE,
  assignFarmHelper,
  getAdminSummary,
  getFarmerParcels,
  listAdminDiaries,
  listAdminEvidence,
  listFarmHelpers,
  notifyLaggardFarmer,
  resolveImageUrl,
  type FarmHelperPair,
  type FarmerParcel,
} from "@/lib/admin-api"
import type {
  AdminDiaryItem,
  AdminEvidenceItem,
  AdminSummary,
  FarmerDiarySummary,
} from "@/lib/admin-types"
import { useCurrentUserVillage } from "@/components/CurrentUserVillageContext"
import FarmerDetailScreen, {
  type EvidenceCell,
  type GroupRef,
  type LogItem,
  type ProjPanel,
} from "@/components/chief/FarmerDetailScreen"
import { HelperModal, NudgeModal } from "@/components/chief/ChiefModals"
import Toast, { useToast } from "@/components/chief/Toast"
import type { Farmer, InboxItem } from "@/components/chief/chief-ui"
import { defaultNudgeText, summaryToFarmer } from "@/lib/chief-adapters"

function evidenceToCell(e: AdminEvidenceItem): EvidenceCell {
  const st: EvidenceCell["status"] =
    e.status === "confirmed" ? "confirmed" : e.status === "retake_required" ? "retake" : "review"
  const path = e.image_url || e.storage_path || ""
  return {
    id: e.evidence_id,
    status: st,
    label: e.confirmed_label || e.evidence_type || "사진",
    when: (e.captured_at || "").slice(0, 10),
    img: path,
    src: path ? resolveImageUrl(path) : undefined,
    tag: { label: e.activity_type || "", tone: "neutral" },
    needsChiefVerification: e.needs_chief_verification ?? false,
  }
}

function diaryToLog(d: AdminDiaryItem): LogItem {
  return {
    id: d.diary_id,
    date: (d.work_date || "").slice(5).replace("-", "."),
    act: d.work_stage || d.activity_name || "기록",
    note: d.work_detail,
    photos: d.evidence_count ?? (d.linked_evidence_ids?.length ?? 0),
    tag: { label: d.crop_name || "", tone: "neutral" },
  }
}

function pickHelperPair(pairs: FarmHelperPair[], userNo: number | null | undefined) {
  if (!userNo) return { helperName: null as string | null, helpingName: null as string | null }
  const helped = pairs.find((p) => p.recipient_user_no === userNo && p.is_active)
  const helping = pairs.find((p) => p.helper_user_no === userNo && p.is_active)
  return {
    helperName: helped?.helper_name ?? null,
    helpingName: helping?.recipient_name ?? null,
  }
}

export default function FarmerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const { id: farmerId } = use(params)
  const village = useCurrentUserVillage()
  const villeId = village.currentUserVillageInfo?.village?.ville_id ?? ""

  const [summary, setSummary] = useState<AdminSummary | null>(null)
  const [diaries, setDiaries] = useState<AdminDiaryItem[]>([])
  const [evidenceItems, setEvidenceItems] = useState<AdminEvidenceItem[]>([])
  const [helpers, setHelpers] = useState<FarmHelperPair[]>([])
  const [parcels, setParcels] = useState<FarmerParcel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.all([
      getAdminSummary().catch(() => null),
      listAdminDiaries({ farmer_id: farmerId }).catch(() => []),
      listAdminEvidence({ farmer_id: farmerId }).catch(() => []),
      villeId ? listFarmHelpers(villeId).catch(() => []) : Promise.resolve([]),
      getFarmerParcels(farmerId).catch(() => []),
    ])
      .then(([s, ds, es, hs, ps]) => {
        if (!alive) return
        setSummary(s)
        setDiaries(ds)
        setEvidenceItems(es)
        setHelpers(hs)
        setParcels(ps)
        setError("")
      })
      .catch((err) => { if (alive) setError(err instanceof Error ? err.message : BACKEND_CONNECTION_ERROR_MESSAGE) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [farmerId, villeId])

  const farmerSummary: FarmerDiarySummary | null = useMemo(
    () => summary?.diaries_by_farmer.find((f) => f.farmer_id === farmerId) ?? null,
    [summary, farmerId],
  )

  const farmer: Farmer = useMemo(
    () =>
      farmerSummary
        ? summaryToFarmer(farmerSummary)
        : { id: farmerId, name: farmerId, phone: "", state: "good", tone: "", parcels: [] },
    [farmerSummary, farmerId],
  )

  const evidenceCells = useMemo(() => evidenceItems.map(evidenceToCell), [evidenceItems])
  const logs = useMemo(() => diaries.map(diaryToLog), [diaries])

  // 필지 → FarmerDetailScreen 이 받는 {name, crop} 형태.
  // name: parcel_name 이 비면 usage_label 또는 '필지' 폴백. crop: usage_label.
  const parcelChips = useMemo(
    () =>
      parcels.map((p) => ({
        name: p.parcel_name || p.usage_label || "필지",
        crop: p.usage_label || p.parcel_usage || "",
      })),
    [parcels],
  )

  // 사업별 활동 패널 — 일지 기준 단순 집계 (todo 별 정보는 향후 보강)
  const projects: ProjPanel[] = useMemo(() => {
    const byProject = new Map<string, ProjPanel>()
    for (const d of diaries) {
      const pid = d.prj_id || d.project_id || ""
      const name = d.prj_name || pid || "사업"
      const existing = byProject.get(pid) ?? {
        pid: pid || `noprj-${name}`,
        biz: name,
        tag: { label: "사업", tone: "neutral" },
        done: 0,
        total: 0,
        acts: [],
      }
      existing.total += 1
      existing.done += d.status === "completed" || d.status === "saved" ? 1 : 0
      existing.acts.push({
        name: d.activity_name || d.work_stage || "활동",
        due: (d.work_date || "").slice(5).replace("-", "."),
        done: d.status === "completed",
        overdue: false,
      })
      byProject.set(pid, existing)
    }
    return Array.from(byProject.values())
  }, [diaries])

  const groups: GroupRef[] = useMemo(() => {
    const seen = new Map<string, GroupRef>()
    for (const d of diaries) {
      if (!d.group_no) continue
      const id = String(d.group_no)
      if (seen.has(id)) continue
      seen.set(id, {
        id,
        name: d.group_name || `단체 ${id}`,
        isLeader: false,
        tag: { label: "참여 단체", tone: "neutral" },
      })
    }
    return Array.from(seen.values())
  }, [diaries])

  const { helperName, helpingName } = useMemo(
    () => pickHelperPair(helpers, farmerSummary?.user_no),
    [helpers, farmerSummary],
  )

  const toast = useToast()
  const [helperOpen, setHelperOpen] = useState(false)
  const [nudgeOpen, setNudgeOpen] = useState(false)

  // 도우미 모달 데이터 — 마을 농가 전체에서 본 농가 제외.
  const villageResidents: Farmer[] = useMemo(
    () =>
      (summary?.diaries_by_farmer ?? [])
        .filter((f) => f.farmer_id !== farmerId)
        .map(summaryToFarmer),
    [summary, farmerId],
  )

  // 농가가 직접 신청한 도우미 (있으면 모달이 "승인" 모드).
  const appliedHelperName: string | null = useMemo(() => {
    const userNo = farmerSummary?.user_no
    if (!userNo) return null
    const pending = helpers.find(
      (p) => p.recipient_user_no === userNo && p.is_pending && !p.is_active,
    )
    return pending?.helper_name ?? null
  }, [helpers, farmerSummary])

  const onBack = useCallback(() => router.push("/residents"), [router])

  // 페이지 이동/즉시 발송 대신 NudgeModal 띄움.
  const onNudge = useCallback(() => setNudgeOpen(true), [])

  const onNudgeDone = useCallback(
    async (p: { type: "nudge"; farmer: string; text: string }) => {
      setNudgeOpen(false)
      try {
        await notifyLaggardFarmer(p.farmer, { message: p.text })
        toast.show("문자를 보냈어요")
      } catch (err) {
        setError(err instanceof Error ? err.message : "문자 발송 중 오류가 났어요.")
      }
    },
    [toast],
  )

  // NudgeModal 이 받는 InboxItem 형태로 farmer 정보를 감쌈.
  const nudgeItem: InboxItem = useMemo(
    () => ({
      id: `nudge:${farmerId}`,
      kind: "nudge",
      urgency: "today",
      farmer,
      projTag: null,
      title: "문자로 안부 보내기",
      sub: farmer.note || undefined,
      dueText: null,
      evidence: null,
    }),
    [farmer, farmerId],
  )

  // 페이지 이동 대신 모달 띄움.
  const onConnectHelper = useCallback(() => setHelperOpen(true), [])

  const onHelperDone = useCallback(
    async (p: { type: "helper"; farmer: string; helper: string }) => {
      setHelperOpen(false)
      // ChiefDashboard 와 같은 로직 — recipient/helper 의 user_no 를 summary 에서 추정.
      const recip = (summary?.diaries_by_farmer ?? []).find((f) => f.farmer_id === p.farmer)
      const help = (summary?.diaries_by_farmer ?? []).find(
        (f) => (f.amo_name || f.user_name || f.farmer_name) === p.helper,
      )
      if (!recip?.user_no || !help?.user_no) {
        setError("도우미 또는 농가 정보가 부족해요. 주민 명단을 확인해 주세요.")
        return
      }
      try {
        await assignFarmHelper({
          helper_user_no: help.user_no,
          recipient_user_no: recip.user_no,
          est_end_date: new Date(new Date().getFullYear(), 11, 31)
            .toISOString()
            .slice(0, 10),
        })
        toast.show(`${p.helper} 님께 도우미 연결을 요청했어요`)
        // helper 목록 다시 fetch.
        if (villeId) {
          const fresh = await listFarmHelpers(villeId).catch(() => [])
          setHelpers(fresh)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "도우미 연결 중 오류가 났어요.")
      }
    },
    [summary, villeId, toast],
  )

  const onOpenReview = useCallback(
    (evId: string) => router.push(`/evidence?focus=${encodeURIComponent(evId)}`),
    [router],
  )

  if (loading) {
    return <div className="p-6 text-[15px] font-bold text-[color:var(--lvb-muted)]">농가 정보를 불러오는 중이에요…</div>
  }
  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-[var(--lvb-danger)] bg-[var(--lvb-danger-soft)] p-4 text-[15px] font-bold text-[color:var(--lvb-danger)]">{error}</div>
      </div>
    )
  }

  return (
    <>
      <FarmerDetailScreen
        farmer={farmer}
        groups={groups}
        parcels={parcelChips}
        helperName={helperName}
        helpingName={helpingName}
        projects={projects}
        evidence={evidenceCells}
        logs={logs}
        onBack={onBack}
        onNudge={onNudge}
        onConnectHelper={onConnectHelper}
        onOpenReview={onOpenReview}
      />
      {helperOpen && (
        <HelperModal
          farmer={farmer}
          residents={villageResidents}
          appliedHelperName={appliedHelperName}
          onClose={() => setHelperOpen(false)}
          onDone={onHelperDone}
        />
      )}
      {nudgeOpen && (
        <NudgeModal
          item={nudgeItem}
          defaultText={defaultNudgeText(nudgeItem)}
          onClose={() => setNudgeOpen(false)}
          onDone={onNudgeDone}
        />
      )}
      <Toast msg={toast.msg} />
    </>
  )
}
