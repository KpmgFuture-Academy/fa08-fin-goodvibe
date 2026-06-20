"use client"

/**
 * 이장님 대시보드 — 새 UI(`components/chief`) 기반의 "처리함" 중심 화면.
 *
 * 좌측: 사진확인·알려줄일·도움연결을 한 큐에 섞은 `ProcessingInbox`.
 * 우측: 오늘 마을 메모 + 마을 진행률(`VillagePulse`).
 * 액션은 3 모달(`ChiefModals`)로, 결과는 admin-api 로 배선.
 *
 * 옛 dashboard 의 KPI/laggard/캘린더 세로 스택은 처리함으로 통합됐다.
 * 일정(캘린더) 단독 페이지는 향후 `/calendar` 로 분리 예정.
 */

import { useCallback, useMemo, useState } from "react"
import { useRouter } from "next/navigation"

import {
  assignFarmHelper,
  fetchTtsAudio,
  notifyLaggardFarmer,
  patchEvidenceStatus,
  resolveImageUrl,
  type FarmHelperPair,
  type LaggardFarmerItem,
  type RecentEvidenceItem,
} from "@/lib/admin-api"
import type { AdminSummary, AdminTodoStatusItem } from "@/lib/admin-types"
import { type VillageProject } from "@/lib/projects"
import { aggregateTodos } from "@/lib/progress"
import { deriveSeasonBanners } from "@/lib/choice-jobs"
import {
  buildInbox,
  buildVillagePulse,
  defaultNudgeText,
  summaryToFarmer,
} from "@/lib/chief-adapters"
import { useCachedResource, invalidate } from "@/lib/chief-cache"
import { chiefRes } from "@/lib/chief-resources"
import { useCurrentUserVillage } from "@/components/CurrentUserVillageContext"
import ChiefDashboard from "@/components/chief/ChiefDashboard"
import ChiefDashboardSkeleton from "@/components/chief/ChiefDashboardSkeleton"
import Toast, { useToast } from "@/components/chief/Toast"
import type { Farmer } from "@/components/chief/chief-ui"

export default function DashboardPage() {
  const router = useRouter()
  const village = useCurrentUserVillage()
  const villeId = village.currentUserVillageInfo?.village?.ville_id ?? ""

  const [error, setError] = useState("") // 액션(사진확인·독려·도우미) 오류용

  // 공용 캐시에서 — 접속 시 프리페치 + 다른 탭과 공유(todo-status·projects 등) → 탭 복귀 즉시(리로드 X).
  const sumRes = chiefRes.summary()
  const evRes = chiefRes.recentEvidence()
  const lagRes = chiefRes.laggards()
  const helpRes = chiefRes.helpers(villeId)
  const aiRes = chiefRes.aiRec()
  const todoRes = chiefRes.todoStatus()
  const projRes = chiefRes.projects(villeId)

  const summaryQ = useCachedResource(sumRes.key, sumRes.fetcher)
  const evidenceQ = useCachedResource(evRes.key, evRes.fetcher)
  const laggardsQ = useCachedResource(lagRes.key, lagRes.fetcher)
  const helpersQ = useCachedResource(villeId ? helpRes.key : null, helpRes.fetcher, { enabled: !!villeId })
  const aiQ = useCachedResource(aiRes.key, aiRes.fetcher)
  const todosQ = useCachedResource(todoRes.key, todoRes.fetcher)
  const projectsQ = useCachedResource(villeId ? projRes.key : null, projRes.fetcher, { enabled: !!villeId })

  const summary: AdminSummary | null = summaryQ.data ?? null
  const evidence: RecentEvidenceItem[] = evidenceQ.data ?? []
  const laggards: LaggardFarmerItem[] = laggardsQ.data ?? []
  const helpers: FarmHelperPair[] = helpersQ.data ?? []
  const todos: AdminTodoStatusItem[] = todosQ.data ?? []
  const villageProjects: VillageProject[] = projectsQ.data ?? []
  const memo = aiQ.data?.recommendation || "오늘은 마을 농가 기록 상태를 한 번 살펴봐 주세요."

  // 데이터가 한 번도 안 잡혔을 때만 스켈레톤. 캐시 적중(프리페치/탭 복귀) 시 즉시 false → 깜빡임 없음.
  const loading =
    summaryQ.loading || evidenceQ.loading || laggardsQ.loading || aiQ.loading || todosQ.loading ||
    (!!villeId && (helpersQ.loading || projectsQ.loading))

  // ── 처리함 데이터 ─────────────────────────────────────────────
  const items = useMemo(
    () => buildInbox({ evidence, laggards, helpers, resolveImg: resolveImageUrl }),
    [evidence, laggards, helpers],
  )

  // ── 마을 진행률 ───────────────────────────────────────────────
  const farmers = summary?.diaries_by_farmer ?? []

  // 사업별 진척 — todo-status 의 prj_id 기준 완료 비율.
  // 사업 이름은 fetchVillageProjects 의 biz_name/prj_name 매핑이 우선,
  // 없으면 todo 의 prj_name. prj_id raw 노출은 막는다.
  const prjLabelById = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of villageProjects) {
      m.set(p.prj_id, p.biz_name || p.prj_name || "")
    }
    return m
  }, [villageProjects])

  const projectProgress = useMemo(() => {
    // 사업별로 todos 그룹핑 후 aggregateTodos 로 pct 계산 — 부분 제출도 진척에 반영.
    const groups = new Map<string, { name: string; items: AdminTodoStatusItem[] }>()
    for (const t of todos) {
      const pid = t.prj_id || ""
      if (!pid) continue
      const name = prjLabelById.get(pid) || t.prj_name || "사업"
      const row = groups.get(pid) ?? { name, items: [] }
      row.items.push(t)
      groups.set(pid, row)
    }
    return Array.from(groups.values()).map((g) => ({
      name: g.name,
      pct: aggregateTodos(g.items).pct,
    }))
  }, [todos, prjLabelById])

  // choice 타입(예: 바이오차) 의 현재 시즌 진입 배너 — 가을 윈도우에서 봄 미완료 농가 카운트 표시.
  const seasonBanners = useMemo(() => deriveSeasonBanners(todos), [todos])

  const pulse = useMemo(
    () => buildVillagePulse(farmers, projectProgress),
    [farmers, projectProgress],
  )

  // ── 도우미 모달용 마을 주민 명단(현재 farmers 응답 활용) ─────────
  const residents: Farmer[] = useMemo(() => farmers.map(summaryToFarmer), [farmers])

  // ── 농가가 직접 신청한 도우미 매핑 (recipient_user_no → helper_name) ─
  const appliedHelperByFarmer = useMemo(() => {
    const map: Record<string, string> = {}
    for (const p of helpers) {
      if (p.is_pending && p.recipient_user_no && p.helper_name) {
        map[String(p.recipient_user_no)] = p.helper_name
      }
    }
    return map
  }, [helpers])

  // ── 음성 메모 재생 ──────────────────────────────────────────────
  const onPlayMemo = useCallback(async () => {
    if (!memo) return
    const blob = await fetchTtsAudio(memo)
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    audio.addEventListener("ended", () => URL.revokeObjectURL(url))
    void audio.play()
  }, [memo])

  // ── 토스트 ─────────────────────────────────────────────────────
  const toast = useToast()

  // ── 액션 핸들러 ────────────────────────────────────────────────
  const onReviewDone = useCallback(
    async (p: { type: "confirm" | "retake"; evidence?: string; reason?: string }) => {
      if (!p.evidence) return
      try {
        await patchEvidenceStatus(p.evidence, {
          status: p.type === "confirm" ? "confirmed" : "retake_required",
          user_message: p.reason,
        })
        toast.show(p.type === "confirm" ? "확인 완료로 처리했어요" : "다시 찍어 달라고 요청했어요")
        invalidate("chief:") // 사진 상태 변경 → 처리함/진행률 등 캐시 새로고침
      } catch (err) {
        console.error(err)
        setError(err instanceof Error ? err.message : "사진 처리 중 오류가 났어요.")
      }
    },
    [toast],
  )

  const onNudgeSend = useCallback(
    async (p: { type: "nudge"; farmer: string; text: string }) => {
      try {
        await notifyLaggardFarmer(p.farmer, { message: p.text })
        toast.show("알림을 보냈어요")
        invalidate("chief:")
      } catch (err) {
        console.error(err)
        setError(err instanceof Error ? err.message : "문자 발송 중 오류가 났어요.")
      }
    },
    [toast],
  )

  const onHelperConnect = useCallback(
    async (p: { type: "helper"; farmer: string; helper: string }) => {
      // residents 안에 farmer / helper 의 user_no 가 없으므로 추정 — diaries_by_farmer 의 user_no 활용
      const recip = farmers.find((f) => f.farmer_id === p.farmer)
      const help = farmers.find(
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
        toast.show(`${p.helper} 님께 도움 연결을 요청했어요`)
        invalidate("chief:")
      } catch (err) {
        console.error(err)
        setError(err instanceof Error ? err.message : "도우미 연결 중 오류가 났어요.")
      }
    },
    [farmers, toast],
  )

  // ── 라우팅 ──────────────────────────────────────────────────
  const onOpenFarmer = useCallback(
    (id: string) => router.push(`/residents/${encodeURIComponent(id)}`),
    [router],
  )
  const onSeeVillage = useCallback(() => router.push("/residents"), [router])

  if (loading) {
    return <ChiefDashboardSkeleton />
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-[var(--lvb-danger)] bg-[var(--lvb-danger-soft)] p-4 text-[15px] font-bold text-[color:var(--lvb-danger)]">
          {error}
        </div>
      </div>
    )
  }

  return (
    <>
      {seasonBanners.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
          {seasonBanners.map((b) => (
            <div
              key={b.jobCd}
              role="status"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "14px 18px",
                background: "var(--lvb-warn-soft)",
                border: "1px solid var(--lvb-warn)",
                borderRadius: 14,
              }}
            >
              <span
                style={{
                  fontSize: 22,
                  fontWeight: 900,
                  color: "var(--lvb-warn-ink)",
                  letterSpacing: "-0.02em",
                }}
              >
                🍂 {b.farmerCount}
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
                <div style={{ fontSize: 15.5, fontWeight: 800, color: "var(--lvb-ink)" }}>
                  {b.headline}
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--lvb-warn-ink)" }}>
                  {b.detail}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <ChiefDashboard
        data={{
          items,
          pulse,
          memo,
          residents,
          appliedHelperByFarmer,
          nudgeTextFor: defaultNudgeText,
          resolveImg: (path: string) => (path ? resolveImageUrl(path) : undefined),
        }}
        onReviewDone={onReviewDone}
        onNudgeSend={onNudgeSend}
        onHelperConnect={onHelperConnect}
        onOpenFarmer={onOpenFarmer}
        onSeeVillage={onSeeVillage}
        onPlayMemo={onPlayMemo}
      />
      <Toast msg={toast.msg} />
    </>
  )
}
