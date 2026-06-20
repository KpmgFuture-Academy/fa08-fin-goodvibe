"use client";

/**
 * CalendarScreen — 마을 일정(월 달력 + 위험 배너 + 이달 마감 목록).
 */

import { Clock } from "lucide-react";
import { Tag } from "./chief-ui";

export interface CalendarDeadline {
  name: string; day: number; dueText: string; daysLeft: number;
  projTag: { label: string; tone: string };
}

export default function CalendarScreen({
  monthLabel, projLegend, todayDate, firstWeekday, daysInMonth, deadlines,
}: {
  monthLabel: string;                       // "2026년 7월 · 사업별 마감일"
  projLegend: { short: string }[];
  todayDate: number;                        // 13
  firstWeekday: number;                     // 0=일
  daysInMonth: number;
  deadlines: CalendarDeadline[];
}) {
  const overdue = deadlines.filter((d) => d.daysLeft < 0).length;
  const thisWeek = deadlines.filter((d) => d.daysLeft >= 0 && d.daysLeft <= 7).length;
  const byDay: Record<number, CalendarDeadline[]> = {};
  deadlines.forEach((d) => (byDay[d.day] ||= []).push(d));

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="lvb-root bg-[var(--lvb-bg)] p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-[24px] font-extrabold text-[color:var(--lvb-ink)]">마을 일정</h1><p className="text-[15px] font-semibold text-[color:var(--lvb-muted)]">{monthLabel}</p></div>
        <div className="flex flex-wrap gap-3">{projLegend.map((p, i) => <span key={i} className="inline-flex items-center gap-1.5 text-[13px] font-bold text-[color:var(--lvb-muted)]"><span className="h-2.5 w-2.5 rounded-full bg-[var(--lvb-accent)]" />{p.short}</span>)}</div>
      </div>

      {/* 위험 배너 */}
      <div className="mb-4 flex flex-wrap items-center gap-4 rounded-2xl border border-[var(--lvb-line)] bg-white p-4">
        <div className="flex items-center gap-2"><span className="text-[22px] font-extrabold text-[color:var(--lvb-danger)]">{overdue}건</span><span className="text-[14px] font-bold text-[color:var(--lvb-muted)]">지난 마감</span></div>
        <div className="flex items-center gap-2"><span className="text-[22px] font-extrabold text-[color:var(--lvb-warn-ink)]">{thisWeek}건</span><span className="text-[14px] font-bold text-[color:var(--lvb-muted)]">이번 주 마감</span></div>
        <div className="flex-1 text-[14px] font-semibold text-[color:var(--lvb-muted)] [word-break:keep-all]">지난 마감과 이번 주 마감을 먼저 챙기세요. 아래 달력·목록에서 자세히 볼 수 있어요.</div>
      </div>

      {/* 달력 */}
      <div className="mb-5 overflow-hidden rounded-2xl border border-[var(--lvb-line)] bg-white p-3">
        <div className="grid grid-cols-7">
          {["일", "월", "화", "수", "목", "금", "토"].map((d) => <div key={d} className="py-2 text-center text-[13px] font-extrabold text-[color:var(--lvb-muted)]">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, i) => (
            <div key={i} className={`min-h-[78px] rounded-lg p-1.5 ${d ? "bg-[var(--lvb-bg-soft)]" : ""} ${d === todayDate ? "ring-2 ring-[var(--lvb-accent)]" : ""}`}>
              {d && (
                <>
                  <span className={`text-[13px] font-extrabold ${d === todayDate ? "text-[color:var(--lvb-accent)]" : "text-[color:var(--lvb-ink-soft)]"}`}>{d}</span>
                  <div className="mt-0.5 flex flex-col gap-0.5">
                    {(byDay[d] || []).map((m, j) => (
                      <span key={j} className="truncate rounded bg-[var(--lvb-accent-soft)] px-1 py-0.5 text-[11px] font-bold text-[color:var(--lvb-accent-dark)]">{m.name}</span>
                    ))}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 이달 마감 목록 */}
      <h2 className="mb-2 flex items-center gap-2 text-[16px] font-extrabold text-[color:var(--lvb-ink)]"><Clock size={18} className="text-[color:var(--lvb-accent)]" />이달 마감</h2>
      <div className="flex flex-col gap-2">
        {[...deadlines].sort((a, b) => a.day - b.day).map((d, i) => {
          const t = d.daysLeft < 0 ? "danger" : d.daysLeft <= 7 ? "warn" : "neutral";
          return (
            <div key={i} className="flex items-center gap-3 rounded-xl border border-[var(--lvb-line)] bg-white px-4 py-3">
              <span className={`w-[44px] shrink-0 text-[15px] font-extrabold ${t === "danger" ? "text-[color:var(--lvb-danger)]" : t === "warn" ? "text-[color:var(--lvb-warn-ink)]" : "text-[color:var(--lvb-muted)]"}`}>{d.day}일</span>
              <Tag tone="neutral">{d.projTag.label}</Tag>
              <span className="flex-1 text-[15px] font-extrabold text-[color:var(--lvb-ink)] [word-break:keep-all]">{d.name}</span>
              <span className="text-[13px] font-bold text-[color:var(--lvb-muted)]">{d.dueText}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* Claude Code: deadlines = ville-project 마감 응답. 기존 FarmingCalendarSection
   의 일정 데이터로 매핑해도 됩니다(자동 생성/직접 추가 일정 구분 유지). */
