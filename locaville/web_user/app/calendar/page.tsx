"use client"

/**
 * 마을 일정 — 새 UI(`CalendarScreen`) 기반.
 *
 * - 사업 활동 마감일(자동) + 이장님이 직접 추가한 일정(localStorage `lvb-events`)을
 *   같이 렌더. 사업참여(/engage) 흐름이 prj_todo_list 를 갱신할 때 마감일도 자동 변동.
 * - 직접 추가 일정은 backend 테이블이 아직 없어 localStorage 임시 — 후속에서 ville_event
 *   테이블 + endpoint 신설 후 swap 예정.
 */
import { useCallback, useEffect, useMemo, useState } from "react"

import { type VillageProject } from "@/lib/projects"
import { useCurrentUserVillage } from "@/components/CurrentUserVillageContext"
import { useCachedResource } from "@/lib/chief-cache"
import { chiefRes } from "@/lib/chief-resources"
import CalendarScreen, { type CalendarDeadline } from "@/components/chief/CalendarScreen"
import AddEventModal, { type EventDraft } from "@/components/chief/AddEventModal"
import Toast, { useToast } from "@/components/chief/Toast"

type StoredEvent = { id: string; date: string; title: string; memo: string }
const STORAGE_KEY = "lvb-events"

function loadEvents(): StoredEvent[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function saveEvents(events: StoredEvent[]) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(events))
  } catch {}
}

export default function CalendarPage() {
  const village = useCurrentUserVillage()
  const villeId = village.currentUserVillageInfo?.village?.ville_id ?? ""

  const [events, setEvents] = useState<StoredEvent[]>([])
  const [addOpen, setAddOpen] = useState(false)
  const toast = useToast()

  // 사업 목록은 공용 캐시에서 — 다른 탭(처리함·사업)과 공유 + 접속 시 프리페치 → 탭 복귀 즉시.
  const projRes = chiefRes.projects(villeId)
  const projectsQuery = useCachedResource<VillageProject[]>(villeId ? projRes.key : null, projRes.fetcher, { enabled: !!villeId })
  const projects = projectsQuery.data ?? []
  const loading = !villeId || projectsQuery.loading
  const errorMsg = projectsQuery.error ? "일정을 불러오지 못했어요." : ""

  useEffect(() => {
    setEvents(loadEvents())
  }, [])

  const today = useMemo(() => new Date(), [])

  // 보고 있는 월(year, month) — 좌우 화살표로 이동.
  const [viewYear, setViewYear] = useState<number>(today.getFullYear())
  const [viewMonth, setViewMonth] = useState<number>(today.getMonth())
  const year = viewYear
  const month = viewMonth
  // 오늘이 보고 있는 달일 때만 todayDate 노출.
  const isViewingCurrentMonth =
    today.getFullYear() === viewYear && today.getMonth() === viewMonth
  const todayDate = isViewingCurrentMonth ? today.getDate() : null

  const goPrevMonth = useCallback(() => {
    setViewMonth((m) => {
      if (m === 0) {
        setViewYear((y) => y - 1)
        return 11
      }
      return m - 1
    })
  }, [])
  const goNextMonth = useCallback(() => {
    setViewMonth((m) => {
      if (m === 11) {
        setViewYear((y) => y + 1)
        return 0
      }
      return m + 1
    })
  }, [])
  const goToday = useCallback(() => {
    setViewYear(today.getFullYear())
    setViewMonth(today.getMonth())
  }, [today])

  const deadlines: CalendarDeadline[] = useMemo(() => {
    const list: CalendarDeadline[] = []
    // 보고 있는 달의 셀까지의 거리는 오늘 실제 날짜 기준으로 계산.
    const todayMs = new Date(
      today.getFullYear(), today.getMonth(), today.getDate(),
    ).getTime()

    // 1) 사업 활동 마감일.
    for (const p of projects) {
      for (const a of p.activities) {
        if (!a.end_date) continue
        const d = new Date(a.end_date)
        if (Number.isNaN(d.getTime())) continue
        if (d.getFullYear() !== year || d.getMonth() !== month) continue
        const day = d.getDate()
        const dayMs = new Date(year, month, day).getTime()
        const left = Math.round((dayMs - todayMs) / 86_400_000)
        const dueText = left < 0 ? `${Math.abs(left)}일 지남` : left === 0 ? "오늘 마감" : `D-${left}`
        list.push({
          name: a.activity_name,
          day,
          dueText,
          daysLeft: left,
          projTag: { label: p.biz_name || p.prj_name, tone: "green" },
        })
      }
    }

    // 2) 사용자 추가 일정.
    for (const e of events) {
      const d = new Date(e.date)
      if (Number.isNaN(d.getTime())) continue
      if (d.getFullYear() !== year || d.getMonth() !== month) continue
      const day = d.getDate()
      const dayMs = new Date(year, month, day).getTime()
      const left = Math.round((dayMs - todayMs) / 86_400_000)
      const dueText = left < 0 ? `${Math.abs(left)}일 지남` : left === 0 ? "오늘" : `D-${left}`
      list.push({
        name: e.title,
        day,
        dueText,
        daysLeft: left,
        projTag: { label: "마을 일정", tone: "plum" },
        custom: true,
      })
    }
    return list
  }, [projects, events, year, month, today])

  const projLegend = useMemo(() => {
    const seen = new Set<string>()
    const list: { short: string; tone?: string }[] = []
    for (const p of projects) {
      const short = p.biz_name || p.prj_name
      if (seen.has(short)) continue
      seen.add(short)
      list.push({ short, tone: "green" })
    }
    if (events.length > 0) list.push({ short: "마을 일정", tone: "plum" })
    return list
  }, [projects, events])

  const handleAdd = useCallback(
    (draft: EventDraft) => {
      const id = `ev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const next = [...events, { id, ...draft }]
      setEvents(next)
      saveEvents(next)
      setAddOpen(false)
      toast.show("일정을 달력에 적었어요")
    },
    [events, toast],
  )

  if (loading) {
    return <div className="p-6 text-[15px] font-bold text-[color:var(--lvb-muted)]">일정을 불러오는 중이에요…</div>
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
      <CalendarScreen
        year={year}
        month={month}
        todayDate={todayDate}
        projLegend={projLegend}
        deadlines={deadlines}
        onAddEvent={() => setAddOpen(true)}
        onPrevMonth={goPrevMonth}
        onNextMonth={goNextMonth}
        onGoToday={goToday}
      />
      <AddEventModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdd={handleAdd}
      />
      <Toast msg={toast.msg} />
    </>
  )
}
