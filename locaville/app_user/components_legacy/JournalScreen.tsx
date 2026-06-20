"use client";

/** 영농일지 목록 화면 — 농가의 일지 리스트 (`/diary?farmer_id=...`) + 카드 클릭 → 상세. */

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Circle, Clock3, Plus, Image as ImageIcon, ChevronRight, ChevronLeft, ChevronRight as ChevronRightIcon } from "lucide-react";
import { getParcelDisplayLabel } from "@/lib/display-labels";
import { formatDiaryDate } from "@/lib/diary-service";
import type { DiaryRecord } from "@/lib/diary-types";
import { getTodayTodos, type TodoItemApi } from "@/lib/todo-service";
import { useHelperMode } from "@/lib/helper-mode-context";
import { buildTodoActionMessage } from "@/lib/todo-display";
import { TodoRowSkeleton } from "./TodoSkeleton";

type Screen =
  | "home"
  | "voiceInput"
  | "manualInput"
  | "photoInput"
  | "saveComplete"
  | "journal"
  | "business"
  | "help"
  | "settings"
  | "journalDetail"
  | "businessDetail"
  | "splash"
  | "loginSelect"
  | "manualLogin";

interface JournalScreenProps {
  navigate: (screen: Screen) => void;
  selectedDate: Date;
  setSelectedDate: (date: Date) => void;
  diaryRecords: DiaryRecord[];
  setSelectedJournalRecord: (r: DiaryRecord | null) => void;
}

function getStatusKey(todo: TodoItemApi) {
  return (todo.computed_status || todo.status || "pending").toLowerCase();
}

function getWeekDays(base: Date): Date[] {
  const day = base.getDay();
  const monday = new Date(base);
  monday.setDate(base.getDate() - ((day + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function toDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function toRecordDateKey(record: DiaryRecord) {
  if (!record.work_date) return "";
  return record.work_date.slice(0, 10);
}

const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

export default function JournalScreen({ navigate, selectedDate, setSelectedDate, diaryRecords, setSelectedJournalRecord }: JournalScreenProps) {
  const { effectiveFarmerId } = useHelperMode();
  const [apiTodos, setApiTodos] = useState<TodoItemApi[]>([]);
  const [loadingTodos, setLoadingTodos] = useState(true);
  const [showAllActive, setShowAllActive] = useState(false);
  const [showAllCompleted, setShowAllCompleted] = useState(false);
  const [showAllRecords, setShowAllRecords] = useState(false);

  useEffect(() => {
    let mounted = true;
    setLoadingTodos(true);
    void getTodayTodos({ farmer_id: effectiveFarmerId })
      .then((items) => {
        if (mounted) setApiTodos(items);
      })
      .catch(() => {
        if (mounted) setApiTodos([]);
      })
      .finally(() => {
        if (mounted) setLoadingTodos(false);
      });
    return () => {
      mounted = false;
    };
  }, [effectiveFarmerId]);

  // 캘린더 표시 주는 selectedDate 기준으로만 계산. weekOffset 누적 버그 회피.
  const weekDays = useMemo(() => getWeekDays(selectedDate), [selectedDate]);
  const selectedKey = toDateKey(selectedDate);

  // 화살표: selectedDate 자체를 ±7일 이동 → 같은 요일의 인접 주 자동 선택 + 캘린더도 그 주 표시.
  const shiftWeek = (delta: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + delta * 7);
    setSelectedDate(d);
  };

  const hasRecord = (d: Date) => {
    const key = toDateKey(d);
    return diaryRecords.some((r) => toRecordDateKey(r) === key);
  };

  const todoGroups = useMemo(() => {
    const sorted = [...apiTodos].sort((a, b) => {
      const order: Record<string, number> = { pending: 0, in_progress: 1, completed: 2 };
      return (order[getStatusKey(a)] ?? 99) - (order[getStatusKey(b)] ?? 99);
    });
    return {
      active: sorted.filter((t) => getStatusKey(t) !== "completed"),
      completed: sorted.filter((t) => getStatusKey(t) === "completed"),
    };
  }, [apiTodos]);

  const filtered = useMemo(() => diaryRecords.filter((r) => toRecordDateKey(r) === selectedKey), [diaryRecords, selectedKey]);
  const visibleActive = showAllActive ? todoGroups.active : todoGroups.active.slice(0, 2);
  const visibleCompleted = showAllCompleted ? todoGroups.completed : todoGroups.completed.slice(0, 2);
  const visibleRecords = showAllRecords ? filtered : filtered.slice(0, 2);

  return (
    <div className="flex flex-col gap-5 pb-8" style={{ background: "#ffffff", minHeight: "100vh" }}>
      <div className="px-4 pt-5 pb-1">
        <h1 className="text-2xl font-bold text-foreground">영농일지</h1>
        <p className="text-sm font-bold text-muted-foreground mt-0.5">한 주의 작업을 한눈에 확인하세요.</p>
      </div>

      <div className="mx-4 jt-mobile-card rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => shiftWeek(-1)} className="p-1.5 rounded-full bg-muted active:bg-secondary">
            <ChevronLeft className="w-5 h-5 text-foreground" />
          </button>
          <p className="text-base font-bold text-foreground">
            {weekDays[0].getMonth() + 1}월 {weekDays[0].getDate()}일 - {weekDays[6].getMonth() + 1}월 {weekDays[6].getDate()}일
          </p>
          <button onClick={() => shiftWeek(1)} className="p-1.5 rounded-full bg-muted active:bg-secondary">
            <ChevronRightIcon className="w-5 h-5 text-foreground" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {weekDays.map((d, i) => {
            const isActive = isSameDay(d, selectedDate);
            const isToday = isSameDay(d, new Date());
            const recorded = hasRecord(d);
            const isSunday = i === 6;
            return (
              <button key={toDateKey(d)} onClick={() => setSelectedDate(d)} className="flex flex-col items-center gap-1 py-2 rounded-xl">
                <span className={`text-xs font-bold ${isSunday ? "text-red-400" : "text-muted-foreground"}`}>{DAY_LABELS[i]}</span>
                <span
                  className={`w-9 h-9 flex items-center justify-center rounded-full text-base font-bold transition-colors ${
                    isActive ? "bg-primary text-primary-foreground" : isToday ? "bg-secondary text-primary" : "text-foreground"
                  }`}
                >
                  {d.getDate()}
                </span>
                <span className={`w-1.5 h-1.5 rounded-full ${recorded ? "bg-primary" : "bg-transparent"}`} />
              </button>
            );
          })}
        </div>
      </div>

      <div
        className="mx-4 jt-mobile-card rounded-2xl p-4"
        style={{ borderLeft: "4px solid var(--primary)" }}
      >
        <h2 className="text-lg font-extrabold mb-3" style={{ color: "var(--ink)" }}>오늘 할 일</h2>
        {loadingTodos ? (
          <TodoRowSkeleton count={2} />
        ) : todoGroups.active.length === 0 ? (
          <p className="text-base text-muted-foreground py-2">오늘 남은 할 일이 없습니다.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {visibleActive.map((t, idx) => {
              const status = getStatusKey(t);
              const msg = buildTodoActionMessage(t);
              return (
                <div
                  key={`${t.todo_id}-${idx}`}
                  className="flex items-start gap-3 p-3 rounded-xl"
                  /* 베이지 → 흰 배경 + subtle border 로 부모 카드와 톤 통일 */
                  style={{ background: "#ffffff", border: "1px solid var(--line-soft)" }}
                >
                  {status === "in_progress"
                    ? <Clock3 className="w-6 h-6 flex-shrink-0 mt-0.5" style={{ color: "var(--warn)" }} />
                    : <Circle className="w-6 h-6 text-border flex-shrink-0 mt-0.5" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-bold leading-tight break-keep text-foreground">{msg.primary}</p>
                    <p className="text-sm font-bold leading-tight break-keep mt-1" style={{ color: "var(--ink-soft)" }}>
                      {msg.sub}
                    </p>
                  </div>
                  <span
                    className="text-xs font-bold px-2 py-1 rounded-lg flex-shrink-0"
                    style={
                      status === "in_progress"
                        ? { color: "var(--warn)", background: "var(--warn-soft)" }
                        : { color: "var(--ink-soft)", background: "var(--line-soft)" }
                    }
                  >
                    {status === "in_progress" ? "진행중" : "미완료"}
                  </span>
                </div>
              );
            })}
            {todoGroups.active.length > 2 && (
              <button
                onClick={() => setShowAllActive((prev) => !prev)}
                /* underline link → modern chip 톤. 살짝 떨어진 위치에서 secondary 톤. */
                className="mt-2 mx-auto text-sm font-bold active:opacity-60"
                style={{
                  color: "var(--primary)",
                  background: "var(--accent-soft, #e3f0e6)",
                  padding: "6px 14px",
                  borderRadius: 999,
                }}
              >
                {showAllActive ? "접기" : `더 보기 +${todoGroups.active.length - 2}`}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="mx-4 jt-mobile-card rounded-2xl p-4">
        <h2 className="text-lg font-extrabold mb-3" style={{ color: "var(--ink)" }}>완료한 일</h2>
        {loadingTodos ? (
          <TodoRowSkeleton count={1} />
        ) : todoGroups.completed.length === 0 ? (
          <p className="text-base text-muted-foreground py-2">아직 완료한 일이 없습니다.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {visibleCompleted.map((t, idx) => {
              const msg = buildTodoActionMessage(t);
              return (
                <div
                  key={`${t.todo_id}-${idx}`}
                  className="flex items-start gap-3 p-3 rounded-xl"
                  /* 완료된 todo 도 흰 배경 + subtle border 로 active 와 톤 통일 */
                  style={{ background: "#ffffff", border: "1px solid var(--line-soft)" }}
                >
                  <CheckCircle2 className="w-6 h-6 text-primary flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-bold leading-tight break-keep line-through" style={{ color: "var(--ink-soft)" }}>
                      {msg.primary}
                    </p>
                    <p className="text-sm font-bold leading-tight break-keep mt-1" style={{ color: "var(--muted)" }}>
                      {msg.sub}
                    </p>
                  </div>
                </div>
              );
            })}
            {todoGroups.completed.length > 2 && (
              <button
                onClick={() => setShowAllCompleted((prev) => !prev)}
                className="mt-2 mx-auto text-sm font-bold active:opacity-60"
                style={{
                  color: "var(--primary)",
                  background: "var(--accent-soft, #e3f0e6)",
                  padding: "6px 14px",
                  borderRadius: 999,
                }}
              >
                {showAllCompleted ? "접기" : `더 보기 +${todoGroups.completed.length - 2}`}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="mx-4 jt-mobile-card rounded-2xl p-4">
        <h2 className="text-lg font-extrabold mb-3" style={{ color: "var(--ink)" }}>선택 날짜 기록</h2>
        {filtered.length === 0 ? (
          <p className="text-base text-muted-foreground py-2">선택한 날짜의 기록이 없습니다.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {visibleRecords.map((r) => (
              <button
                key={r.diary_id}
                onClick={() => {
                  setSelectedJournalRecord(r);
                  navigate("journalDetail");
                }}
                className="flex items-center justify-between p-3 rounded-xl bg-muted active:bg-secondary text-left"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-base font-bold text-foreground truncate">
                    {getParcelDisplayLabel({ field_id: r.field_id, parcel_no: r.parcel_no, fallback: r.field_address })} · {r.work_stage_detail || r.work_stage}
                  </p>
                  <div className="flex items-center gap-1 mt-0.5">
                    {r.linked_evidence_ids.length > 0 ? (
                      <span className="flex items-center gap-1 text-xs text-primary">
                        <ImageIcon className="w-3 h-3" /> 사진 있음
                      </span>
                    ) : (
                      <span className="text-xs font-bold" style={{ color: "var(--warn)" }}>사진 없음</span>
                    )}
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
              </button>
            ))}
            {filtered.length > 2 && (
              <button
                onClick={() => setShowAllRecords((prev) => !prev)}
                className="mt-1 text-sm font-bold text-primary underline underline-offset-2 text-left"
              >
                {showAllRecords ? "접기" : `더 보기 (+${filtered.length - 2})`}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="mx-4">
        <button
          onClick={() => navigate("home")}
          className="w-full bg-card border border-border text-foreground text-base font-bold py-4 rounded-2xl flex items-center justify-center gap-2 active:bg-secondary"
        >
          <Plus className="w-5 h-5 text-primary" />
          기록 추가하기
        </button>
      </div>
    </div>
  );
}
