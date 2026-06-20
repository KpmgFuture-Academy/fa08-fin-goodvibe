"use client"

/**
 * 영농 캘린더 — sunnypark 브랜치 디자인 + 실제 todo 데이터 연동.
 *
 * 데이터 흐름:
 *   - todos prop (AdminTodoStatusItem[]) → todosToCalendarEvents() 로 FarmingCalendarEvent[] 변환
 *   - manual 일정은 localStorage 'web_user.calendar.manual_events.v1' 에 임시 저장
 *   - 추후 backend `village_event` 테이블 신설 시 manual 도 서버 저장으로 마이그레이션.
 */
import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react"
import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Filter,
  Plus,
  Search,
  X,
} from "lucide-react"
import { Btn } from "@/components/ui/Btn"
import type { AdminTodoStatusItem } from "@/lib/admin-types"

type CalendarEventType =
  | "lowCarbon"
  | "ecoCertification"
  | "publicPayment"
  | "village"
  | "direct"
  | "evidence"
  | "business"
  | "education"
  | "etc"

type CalendarEventSource = "auto" | "manual"
type CalendarEventStatus = "inProgress" | "dueSoon" | "scheduled" | "completed"

export type FarmingCalendarEvent = {
  id: string
  title: string
  startDate: string
  endDate: string
  type: CalendarEventType
  source: CalendarEventSource
  status: CalendarEventStatus
  targetFarmers?: string
  memo?: string
  notify?: boolean
}

type FilterKey = "all" | "lowCarbon" | "ecoCertification" | "publicPayment" | "village" | "direct"

/** todo 의 activity/job 이름으로 캘린더 type 추정. 일치 패턴 없으면 'village'. */
function inferEventType(item: AdminTodoStatusItem): CalendarEventType {
  const text = `${item.activity_name || ""} ${item.job_name || ""} ${item.job_cd || ""}`.toLowerCase()
  if (/물떼기|논물|biochar|바이오차|tillage|tilling|중간|얕게|shallow|water_dn|fall_til/i.test(text)) {
    return "lowCarbon"
  }
  if (/인증|친환경|eco/i.test(text)) return "ecoCertification"
  if (/공익|직불|public/i.test(text)) return "publicPayment"
  if (/교육|edu/i.test(text)) return "education"
  if (/증빙|영수|invoice|evidence/i.test(text)) return "evidence"
  return "village"
}

function inferStatus(item: AdminTodoStatusItem): CalendarEventStatus {
  const computed = (item.computed_status || "").toLowerCase()
  const missing = item.missing_evidence_types?.length || 0
  const isDone = (computed === "completed" || computed === "done") && missing === 0
  if (isDone) return "completed"
  // 마감 임박 = due_date 가 오늘 ~ +3일
  if (item.due_date) {
    try {
      const due = new Date(item.due_date)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const diffDays = Math.round((due.getTime() - today.getTime()) / 86_400_000)
      if (diffDays >= 0 && diffDays <= 3) return "dueSoon"
    } catch {
      /* fallthrough */
    }
  }
  if (computed === "in_progress" || missing > 0) return "inProgress"
  return "scheduled"
}

/** AdminTodoStatusItem[] → FarmingCalendarEvent[]. due_date 가 없으면 제외. */
export function todosToCalendarEvents(items: AdminTodoStatusItem[]): FarmingCalendarEvent[] {
  const out: FarmingCalendarEvent[] = []
  for (const item of items) {
    const due = item.due_date
    if (!due) continue
    const dueText = due.slice(0, 10) // YYYY-MM-DD
    const title = (item.todo_title || item.job_name || item.activity_name || "할 일").trim()
    out.push({
      id: `todo-${item.todo_id || `${item.farmer_id}-${dueText}-${item.activity_id || ""}-${item.job_cd || ""}`}`,
      title,
      startDate: dueText,
      endDate: dueText,
      type: inferEventType(item),
      source: "auto",
      status: inferStatus(item),
      targetFarmers: item.farmer_name || item.farmer_id,
    })
  }
  return out
}

const MANUAL_STORAGE_KEY = "web_user.calendar.manual_events.v1"

function loadManualEvents(): FarmingCalendarEvent[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(MANUAL_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as FarmingCalendarEvent[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveManualEvents(events: FarmingCalendarEvent[]): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(MANUAL_STORAGE_KEY, JSON.stringify(events))
  } catch {
    /* quota or disabled — silent */
  }
}

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "lowCarbon", label: "저탄소 농업" },
  { key: "ecoCertification", label: "친환경 인증" },
  { key: "publicPayment", label: "공익직불" },
  { key: "village", label: "마을 공통" },
  { key: "direct", label: "직접 추가" },
]

const EVENT_TYPE_LABELS: Record<CalendarEventType, string> = {
  lowCarbon: "저탄소 활동",
  ecoCertification: "친환경/인증",
  publicPayment: "공익직불",
  village: "마을 공통",
  direct: "직접 추가",
  evidence: "증빙",
  business: "사업",
  education: "교육",
  etc: "기타",
}

const STATUS_LABELS: Record<CalendarEventStatus, string> = {
  inProgress: "진행중",
  dueSoon: "마감 임박",
  scheduled: "예정",
  completed: "완료",
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"]

const INITIAL_FORM = {
  title: "",
  startDate: "2026-07-01",
  endDate: "2026-07-01",
  type: "village" as CalendarEventType,
  targetFarmers: "전체 농가",
  memo: "",
  notify: true,
}

function toDate(date: string) {
  const [year, month, day] = date.split("-").map(Number)
  return new Date(year, month - 1, day)
}

function toDateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function eventTouchesDay(event: FarmingCalendarEvent, day: Date) {
  const start = toDate(event.startDate)
  const end = toDate(event.endDate)
  const current = new Date(day.getFullYear(), day.getMonth(), day.getDate())
  return current >= start && current <= end
}

function eventPosition(event: FarmingCalendarEvent, day: Date) {
  const start = toDate(event.startDate)
  const end = toDate(event.endDate)
  if (isSameDay(start, day) && isSameDay(end, day)) return "single"
  if (isSameDay(start, day)) return "start"
  if (isSameDay(end, day)) return "end"
  return "middle"
}

function buildCalendarDays(monthDate: Date) {
  const firstOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1)
  const start = new Date(firstOfMonth)
  start.setDate(firstOfMonth.getDate() - firstOfMonth.getDay())

  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start)
    day.setDate(start.getDate() + index)
    return day
  })
}

function eventMatchesFilter(event: FarmingCalendarEvent, activeFilters: Set<FilterKey>) {
  if (activeFilters.has("all")) return true
  if (activeFilters.has("direct") && event.source === "manual") return true
  if (event.type === "evidence" && activeFilters.has("lowCarbon")) return true
  return activeFilters.has(event.type as FilterKey)
}

export function FarmingCalendarSection({ todos = [] }: { todos?: AdminTodoStatusItem[] }) {
  // 첫 진입 시 오늘이 속한 달을 기본값으로. 사용자가 ← / → / 오늘 버튼으로 이동.
  const [monthDate, setMonthDate] = useState(() => {
    const t = new Date()
    return new Date(t.getFullYear(), t.getMonth(), 1)
  })
  // events = todo 자동 매핑(read-only) + manual 추가(localStorage 영속)
  const [manualEvents, setManualEvents] = useState<FarmingCalendarEvent[]>([])
  useEffect(() => {
    setManualEvents(loadManualEvents())
  }, [])
  const events = useMemo<FarmingCalendarEvent[]>(
    () => [...todosToCalendarEvents(todos), ...manualEvents],
    [todos, manualEvents],
  )
  const [activeFilters, setActiveFilters] = useState<Set<FilterKey>>(() => new Set(["all"]))
  const [addOpen, setAddOpen] = useState(false)
  const [detailEvent, setDetailEvent] = useState<FarmingCalendarEvent | null>(null)
  const [form, setForm] = useState(INITIAL_FORM)

  const monthLabel = `${monthDate.getFullYear()}년 ${monthDate.getMonth() + 1}월`
  const calendarDays = useMemo(() => buildCalendarDays(monthDate), [monthDate])
  const visibleEvents = useMemo(
    () => events.filter((event) => eventMatchesFilter(event, activeFilters)),
    [events, activeFilters],
  )

  function openAddDialog(date?: Date) {
    const selectedDate = date ? toDateString(date) : toDateString(monthDate)
    setForm({ ...INITIAL_FORM, startDate: selectedDate, endDate: selectedDate })
    setAddOpen(true)
  }

  function handleFilterChange(key: FilterKey) {
    setActiveFilters((prev) => {
      if (key === "all") return new Set(["all"])
      const next = new Set(prev)
      next.delete("all")
      if (next.has(key)) next.delete(key)
      else next.add(key)
      if (next.size === 0) next.add("all")
      return next
    })
  }

  function updateForm(
    field: keyof typeof INITIAL_FORM,
    value: string | boolean,
  ) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function handleSaveSchedule(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!form.title.trim()) return

    const startDate = form.startDate <= form.endDate ? form.startDate : form.endDate
    const endDate = form.startDate <= form.endDate ? form.endDate : form.startDate

    // backend `village_event` 테이블 신설 전까지는 localStorage 에 영속.
    const newEvent: FarmingCalendarEvent = {
      id: `manual-${Date.now()}`,
      title: form.title.trim(),
      startDate,
      endDate,
      type: form.type === "direct" ? "village" : form.type,
      source: "manual",
      status: "scheduled",
      targetFarmers: form.targetFarmers,
      memo: form.memo.trim() || undefined,
      notify: form.notify,
    }
    setManualEvents((current) => {
      const next = [...current, newEvent]
      saveManualEvents(next)
      return next
    })
    setAddOpen(false)
  }

  function deleteManualEvent(id: string) {
    setManualEvents((current) => {
      const next = current.filter((e) => e.id !== id)
      saveManualEvents(next)
      return next
    })
  }

  function changeMonth(delta: number) {
    setMonthDate((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1))
  }

  function goToday() {
    const t = new Date()
    setMonthDate(new Date(t.getFullYear(), t.getMonth(), 1))
  }

  return (
    <section className="farming-calendar-section">
      <div className="farming-calendar-section-head">
        <h2>이번 달 마을 영농 일정</h2>
        <span>기본 영농 일정과 직접 추가한 마을 일정을 함께 봅니다</span>
      </div>

      <div className="farming-calendar-layout">
        <aside className="farming-calendar-side">
          <div className="calendar-side-head">
            <h3>이번 달 챙길 일</h3>
            <button type="button" onClick={() => openAddDialog()} className="calendar-add-btn">
              <Plus size={18} />
              마을 일정 추가
            </button>
          </div>

          <div className="calendar-priority-list">
            {(() => {
              // 마감 임박 + 진행중 이벤트 상위 3건 (dueSoon → inProgress → scheduled 순).
              const order: Record<CalendarEventStatus, number> = {
                dueSoon: 0,
                inProgress: 1,
                scheduled: 2,
                completed: 3,
              }
              const top = [...events]
                .sort((a, b) => {
                  const o = order[a.status] - order[b.status]
                  return o !== 0 ? o : a.startDate.localeCompare(b.startDate)
                })
                .slice(0, 3)
              if (top.length === 0) {
                return (
                  <p style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", padding: "8px 0" }}>
                    이번 달엔 챙길 일정이 없어요.
                  </p>
                )
              }
              return top.map((e, idx) => {
                const d = new Date(e.startDate)
                const meta = `${d.getMonth() + 1}월 ${d.getDate()}일까지`
                const count = e.targetFarmers || STATUS_LABELS[e.status]
                // 시드 중복으로 같은 e.id 가 두 번 들어와도 React key 충돌 안 나게 idx 결합.
                return <PriorityItem key={`${e.id}-${idx}`} title={e.title} meta={meta} count={count} />
              })
            })()}
          </div>

          <div className="calendar-filter-block">
            <h4>일정 유형 필터</h4>
            <div className="calendar-filter-list">
              {FILTERS.map((filter) => (
                <label key={filter.key} className="calendar-filter-item">
                  <input
                    type="checkbox"
                    checked={activeFilters.has(filter.key)}
                    onChange={() => handleFilterChange(filter.key)}
                  />
                  <span>{filter.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="calendar-legend-block">
            <h4>색상 범례</h4>
            <Legend color="low-carbon" label="초록: 저탄소 활동" />
            <Legend color="eco" label="분홍: 친환경/인증" />
            <Legend color="village" label="노랑: 마을 공통" />
            <Legend color="direct" label="파랑: 직접 추가 일정" />
          </div>

          <div className="calendar-farmer-check">
            <h4>이번 주 확인할 농가</h4>
            <ul>
              <li>김영수 농가 · 종료 사진 확인</li>
              <li>박정호 농가 · 논물관리 일정 안내</li>
              <li>이순자 농가 · 바이오차 영수증 요청</li>
            </ul>
          </div>
        </aside>

        <div className="monthly-calendar-card">
          <div className="monthly-calendar-toolbar">
            <div className="calendar-month-controls">
              <button type="button" aria-label="이전 달" onClick={() => changeMonth(-1)}>
                <ChevronLeft size={18} />
              </button>
              <button type="button" onClick={goToday}>오늘</button>
              <button type="button" aria-label="다음 달" onClick={() => changeMonth(1)}>
                <ChevronRight size={18} />
              </button>
              <strong>{monthLabel}</strong>
            </div>
            <div className="calendar-toolbar-actions">
              <button type="button" aria-label="검색">
                <Search size={17} />
                검색
              </button>
              <button type="button" aria-label="필터">
                <Filter size={17} />
                필터
              </button>
            </div>
          </div>

          <div className="monthly-calendar-weekdays">
            {WEEKDAYS.map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>

          <div className="monthly-calendar-grid">
            {calendarDays.map((day) => {
              const dateKey = toDateString(day)
              const dayEvents = visibleEvents.filter((event) => eventTouchesDay(event, day))
              const isOutside = day.getMonth() !== monthDate.getMonth()
              return (
                <button
                  type="button"
                  key={dateKey}
                  className={`calendar-day-cell${isOutside ? " is-outside" : ""}`}
                  onClick={() => openAddDialog(day)}
                >
                  <span className="calendar-day-number">{day.getDate()}</span>
                  <span className="calendar-day-bars">
                    {dayEvents.slice(0, 3).map((event, idx) => (
                      <span
                        key={`${event.id}-${dateKey}-${idx}`}
                        role="button"
                        tabIndex={0}
                        className={[
                          "calendar-event-bar",
                          `calendar-event-${event.type}`,
                          `calendar-event-${event.source}`,
                          `calendar-event-${eventPosition(event, day)}`,
                        ].join(" ")}
                        onClick={(e) => {
                          e.stopPropagation()
                          setDetailEvent(event)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault()
                            e.stopPropagation()
                            setDetailEvent(event)
                          }
                        }}
                      >
                        {event.title}
                      </span>
                    ))}
                    {dayEvents.length > 3 && <span className="calendar-more">+{dayEvents.length - 3}건</span>}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {addOpen && (
        <AddScheduleDialog
          form={form}
          onChange={updateForm}
          onClose={() => setAddOpen(false)}
          onSubmit={handleSaveSchedule}
        />
      )}

      {detailEvent && (
        <EventDetailDialog
          event={detailEvent}
          onClose={() => setDetailEvent(null)}
          onDelete={() => {
            if (detailEvent.source === "manual") {
              deleteManualEvent(detailEvent.id)
              setDetailEvent(null)
            }
          }}
        />
      )}
    </section>
  )
}

function PriorityItem({ title, meta, count }: { title: string; meta: string; count: string }) {
  return (
    <article className="calendar-priority-item">
      <strong>{title}</strong>
      <span>{meta}</span>
      <b>{count}</b>
    </article>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="calendar-legend-item">
      <span className={`calendar-legend-dot calendar-legend-${color}`} />
      <p>{label}</p>
    </div>
  )
}

function AddScheduleDialog({
  form,
  onChange,
  onClose,
  onSubmit,
}: {
  form: typeof INITIAL_FORM
  onChange: (field: keyof typeof INITIAL_FORM, value: string | boolean) => void
  onClose: () => void
  onSubmit: (e: FormEvent<HTMLFormElement>) => void
}) {
  function handleInput(field: keyof typeof INITIAL_FORM) {
    return (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      onChange(field, e.target.value)
    }
  }

  return (
    <div className="calendar-dialog-backdrop" role="presentation">
      <form className="calendar-dialog" onSubmit={onSubmit}>
        <div className="calendar-dialog-head">
          <h3>마을 일정 추가</h3>
          <button type="button" aria-label="닫기" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <label className="calendar-form-field">
          <span>일정명</span>
          <input value={form.title} onChange={handleInput("title")} placeholder="예: 마을 공동 영농 교육" required />
        </label>

        <div className="calendar-form-row">
          <label className="calendar-form-field">
            <span>시작일</span>
            <input type="date" value={form.startDate} onChange={handleInput("startDate")} />
          </label>
          <label className="calendar-form-field">
            <span>종료일</span>
            <input type="date" value={form.endDate} onChange={handleInput("endDate")} />
          </label>
        </div>

        <div className="calendar-form-row">
          <label className="calendar-form-field">
            <span>일정 유형</span>
            <select value={form.type} onChange={handleInput("type")}>
              <option value="village">마을 공통</option>
              <option value="business">사업</option>
              <option value="evidence">증빙</option>
              <option value="education">교육</option>
              <option value="etc">기타</option>
            </select>
          </label>
          <label className="calendar-form-field">
            <span>대상</span>
            <select value={form.targetFarmers} onChange={handleInput("targetFarmers")}>
              <option value="전체 농가">전체 농가</option>
              <option value="선택 농가">선택 농가</option>
            </select>
          </label>
        </div>

        <label className="calendar-form-field">
          <span>메모</span>
          <textarea value={form.memo} onChange={handleInput("memo")} rows={3} />
        </label>

        <label className="calendar-notify-check">
          <input
            type="checkbox"
            checked={form.notify}
            onChange={(e) => onChange("notify", e.target.checked)}
          />
          <span>농가에 알림 보내기</span>
        </label>

        <div className="calendar-dialog-actions">
          <Btn variant="ghost" onClick={onClose}>취소</Btn>
          <Btn variant="primary" type="submit" icon={<CalendarPlus size={18} />}>저장</Btn>
        </div>
      </form>
    </div>
  )
}

function EventDetailDialog({
  event,
  onClose,
  onDelete,
}: {
  event: FarmingCalendarEvent
  onClose: () => void
  onDelete: () => void
}) {
  return (
    <div className="calendar-dialog-backdrop" role="presentation">
      <div className="calendar-dialog calendar-detail-dialog" role="dialog" aria-modal="true">
        <div className="calendar-dialog-head">
          <h3>{event.title}</h3>
          <button type="button" aria-label="닫기" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <dl className="calendar-detail-list">
          <div>
            <dt>기간</dt>
            <dd>{event.startDate} ~ {event.endDate}</dd>
          </div>
          <div>
            <dt>유형</dt>
            <dd>{EVENT_TYPE_LABELS[event.type]}</dd>
          </div>
          <div>
            <dt>출처</dt>
            <dd>{event.source === "auto" ? "자동 생성 일정" : "이장님 직접 추가"}</dd>
          </div>
          <div>
            <dt>상태</dt>
            <dd>{STATUS_LABELS[event.status]}</dd>
          </div>
          {event.targetFarmers && (
            <div>
              <dt>대상</dt>
              <dd>{event.targetFarmers}</dd>
            </div>
          )}
          {event.memo && (
            <div>
              <dt>메모</dt>
              <dd>{event.memo}</dd>
            </div>
          )}
        </dl>
        <div className="calendar-dialog-actions">
          {event.source === "manual" ? (
            <>
              <Btn variant="outline" onClick={onClose}>수정</Btn>
              <Btn variant="danger" onClick={onDelete}>삭제</Btn>
            </>
          ) : (
            <span className="calendar-auto-label">자동 생성 일정</span>
          )}
          <Btn variant="primary" onClick={onClose}>확인</Btn>
        </div>
      </div>
    </div>
  )
}
