"use client";

/**
 * CalendarScreen — 마을 일정.
 *
 * 친숙한 데스크톱 캘린더 UI:
 *  - 헤더: "2026년 6월" 큰 글씨 + ‹ 오늘 ›
 *  - 요일: 일요일 빨강, 토요일 파랑
 *  - 그리드: 6주 고정. 이전·다음 달 일자도 흐리게 표시 (구글 캘린더 스타일)
 *  - 셀: 날짜는 우상단, 마감 마크는 아래에 색 dot 와 함께
 *  - 양방향 연동: 셀 클릭 → 이달 마감 그날 필터 / 마감 행 클릭 → 셀 스크롤
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarPlus, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { dayColor, getCellExtras } from "@/lib/calendar-extras";

export interface CalendarDeadline {
  name: string; day: number; dueText: string; daysLeft: number;
  projTag: { label: string; tone: string };
  custom?: boolean;
}

function projClass(tone: string): string {
  if (tone === "blue") return "proj-blue";
  if (tone === "plum") return "proj-plum";
  if (tone === "clay") return "proj-clay";
  if (tone === "amber") return "proj-amber";
  return "proj-green";
}

function projtagTone(tone: string): string {
  const cls = projClass(tone);
  if (cls === "proj-blue") return "t-blue";
  if (cls === "proj-plum") return "t-plum";
  if (cls === "proj-clay") return "t-clay";
  return "t-green";
}

type Cell = {
  /** 실제 캘린더 날짜 (이전/다음 달 일자 포함) */
  fullYear: number;
  fullMonth: number;  // 0-indexed
  day: number;
  /** 현재 보고 있는 달의 일자인지 (false 면 흐리게) */
  inMonth: boolean;
  /** 셀이 오늘인지 */
  isToday: boolean;
  /** 일·토 색 (0=일, 6=토, 그 외=평일) */
  weekday: number;
};

export default function CalendarScreen({
  year, month, todayDate, projLegend, deadlines, onPrevMonth, onNextMonth, onGoToday, onAddEvent,
}: {
  year: number;
  month: number;  // 0-indexed
  /** 오늘이 이 달이 아니면 null. */
  todayDate: number | null;
  projLegend: { short: string; tone?: string }[];
  deadlines: CalendarDeadline[];
  onPrevMonth?: () => void;
  onNextMonth?: () => void;
  /** "오늘" 버튼 — 이 달이 아니어도 보임 (현재 달이면 비활성). */
  onGoToday?: () => void;
  onAddEvent?: () => void;
}) {
  const overdue = deadlines.filter((d) => d.daysLeft < 0).length;
  const thisWeek = deadlines.filter((d) => d.daysLeft >= 0 && d.daysLeft <= 7).length;

  const byDay: Record<number, CalendarDeadline[]> = useMemo(() => {
    const m: Record<number, CalendarDeadline[]> = {};
    deadlines.forEach((d) => (m[d.day] = m[d.day] || []).push(d));
    return m;
  }, [deadlines]);

  // 6주(42칸) 고정 grid. 이전 달 말일과 다음 달 초일을 흐리게.
  const cells: Cell[] = useMemo(() => {
    const first = new Date(year, month, 1);
    const firstWeekday = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrev = new Date(year, month, 0).getDate();
    const prevYear = month === 0 ? year - 1 : year;
    const prevMonth = month === 0 ? 11 : month - 1;
    const nextYear = month === 11 ? year + 1 : year;
    const nextMonth = month === 11 ? 0 : month + 1;

    const out: Cell[] = [];
    // leading: 이전 달 말일
    for (let i = firstWeekday - 1; i >= 0; i--) {
      const day = daysInPrev - i;
      out.push({
        fullYear: prevYear, fullMonth: prevMonth, day,
        inMonth: false, isToday: false, weekday: (firstWeekday - 1 - i),
      });
    }
    // current month
    for (let d = 1; d <= daysInMonth; d++) {
      const weekday = new Date(year, month, d).getDay();
      out.push({
        fullYear: year, fullMonth: month, day: d,
        inMonth: true, isToday: todayDate === d, weekday,
      });
    }
    // trailing: 다음 달 초일 — 6주(42칸) 채울 때까지
    let nextDay = 1;
    while (out.length < 42) {
      const weekday = out.length % 7;
      out.push({
        fullYear: nextYear, fullMonth: nextMonth, day: nextDay,
        inMonth: false, isToday: false, weekday,
      });
      nextDay += 1;
    }
    return out;
  }, [year, month, todayDate]);

  // 양방향 선택
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const cellRefs = useRef<Record<number, HTMLDivElement | null>>({});

  useEffect(() => { setSelectedDay(null); }, [year, month]);

  const pickDay = useCallback((day: number) => {
    setSelectedDay((prev) => (prev === day ? null : day));
  }, []);

  const focusCell = useCallback((day: number) => {
    setSelectedDay(day);
    const el = cellRefs.current[day];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const filteredAgenda =
    selectedDay == null
      ? [...deadlines].sort((a, b) => a.day - b.day)
      : deadlines.filter((d) => d.day === selectedDay);

  // 요일 색 (일=빨강, 토=파랑)
  const dowColor = (i: number) =>
    i === 0 ? "var(--lvb-danger)" : i === 6 ? "#2c6b76" : "var(--lvb-muted)";

  return (
    <div className="lvb-screen-pad">
      {/* 헤더 — "2026년 6월" 큰 글씨 + ‹ 오늘 › */}
      <div className="lvb-page-head" style={{ alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ marginBottom: 4 }}>마을 일정</h1>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "var(--lvb-muted)",
                letterSpacing: "0.02em",
              }}
            >
              사업별 마감일 · 마을 일정
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginLeft: 20,
              paddingLeft: 20,
              borderLeft: "1px solid var(--lvb-line)",
            }}
          >
            {onPrevMonth && (
              <button
                type="button"
                className="lvb-iconbtn"
                onClick={onPrevMonth}
                aria-label="이전 달"
                title="이전 달"
                style={{ width: 38, height: 38 }}
              >
                <ChevronLeft size={20} />
              </button>
            )}
            <div
              style={{
                fontSize: 26,
                fontWeight: 900,
                color: "var(--lvb-ink)",
                letterSpacing: "-0.02em",
                minWidth: 140,
                textAlign: "center",
              }}
            >
              {year}년 {month + 1}월
            </div>
            {onNextMonth && (
              <button
                type="button"
                className="lvb-iconbtn"
                onClick={onNextMonth}
                aria-label="다음 달"
                title="다음 달"
                style={{ width: 38, height: 38 }}
              >
                <ChevronRight size={20} />
              </button>
            )}
            {onGoToday && (
              <button
                type="button"
                className="lvb-btn lvb-btn-outline lvb-btn-sm"
                onClick={onGoToday}
                disabled={todayDate != null}
                style={{ marginLeft: 6 }}
                title={todayDate != null ? "이미 이번 달이에요" : "이번 달로"}
              >
                오늘
              </button>
            )}
          </div>
        </div>
        <div className="lvb-page-head-tools">
          <div className="lvb-cal-legend">
            {projLegend.map((p, i) => (
              <span key={i} className="lvb-cal-leg">
                <span className={`lvb-dot ${projClass(p.tone || "green")}`} />
                {p.short}
              </span>
            ))}
          </div>
          {onAddEvent && (
            <button
              type="button"
              className="lvb-btn lvb-btn-primary lvb-btn-md"
              onClick={onAddEvent}
            >
              <CalendarPlus size={19} />
              <span>일정 추가</span>
            </button>
          )}
        </div>
      </div>

      <div className="lvb-risk-banner">
        <div className="lvb-risk-item t-danger">
          <span className="lvb-risk-num">{overdue}건</span>
          <span className="lvb-risk-lbl">지난 마감</span>
        </div>
        <div className="lvb-risk-item t-warn">
          <span className="lvb-risk-num">{thisWeek}건</span>
          <span className="lvb-risk-lbl">이번 주 마감</span>
        </div>
        <div className="lvb-risk-hint">
          {deadlines.length === 0
            ? "이 달에는 마감이 없어요. ◀ ▶ 화살표로 다른 달을 확인하거나 '일정 추가' 로 마을 일정을 적어 보세요."
            : "날짜를 누르면 그 날 마감만 보여드려요. 다시 누르면 전체로 돌아와요."}
        </div>
      </div>

      {/* 캘린더 본체 */}
      <div className="lvb-cal" style={{ padding: 14 }}>
        {/* 요일 헤더 — 일은 빨강, 토는 파랑 */}
        <div
          className="lvb-cal-grid"
          style={{ marginBottom: 6, paddingBottom: 8, borderBottom: "1px solid var(--lvb-line)" }}
        >
          {["일", "월", "화", "수", "목", "금", "토"].map((d, i) => (
            <div
              key={d}
              className="lvb-cal-dowcell"
              style={{
                color: dowColor(i),
                fontSize: 14,
                fontWeight: 800,
                padding: "8px 4px",
              }}
            >
              {d}
            </div>
          ))}
        </div>

        {/* 6주(42칸) */}
        <div className="lvb-cal-grid" style={{ gap: 4 }}>
          {cells.map((c, i) => {
            const dayDeadlines = c.inMonth ? byDay[c.day] || [] : [];
            const hasDeadlines = dayDeadlines.length > 0;
            const isSelected = c.inMonth && selectedDay === c.day;
            const isClickable = hasDeadlines;

            const extras = getCellExtras(c.fullYear, c.fullMonth, c.day);
            const numColor = dayColor(c.weekday, extras.holiday, c.inMonth);

            const baseBg = c.inMonth
              ? c.isToday
                ? "var(--lvb-accent-soft)"
                : "var(--lvb-card)"
              : "transparent";

            const border = isSelected
              ? "2px solid var(--lvb-warn)"
              : c.isToday
                ? "2px solid var(--lvb-accent)"
                : "1px solid var(--lvb-line)";

            const content = (
              <>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    marginBottom: 4,
                    gap: 4,
                  }}
                >
                  {/* 오늘 셀의 숫자는 동그란 액센트 dot */}
                  {c.isToday ? (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 34,
                        height: 34,
                        borderRadius: "50%",
                        background: "var(--lvb-accent)",
                        color: "#fff",
                        fontSize: 17,
                        fontWeight: 900,
                      }}
                    >
                      {c.day}
                    </span>
                  ) : (
                    <span
                      style={{
                        fontSize: 20,
                        fontWeight: 800,
                        lineHeight: 1.1,
                        color: numColor,
                        opacity: c.inMonth ? 1 : 0.5,
                      }}
                    >
                      {c.day}
                    </span>
                  )}
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-end",
                      gap: 2,
                    }}
                  >
                    {hasDeadlines && (
                      <span
                        style={{
                          fontSize: 12.5,
                          fontWeight: 800,
                          color: "var(--lvb-accent-dark)",
                          background: "var(--lvb-accent-soft)",
                          borderRadius: 6,
                          padding: "1px 7px",
                          lineHeight: 1.4,
                        }}
                      >
                        {dayDeadlines.length}건
                      </span>
                    )}
                    {extras.lunarLabel && (
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: "var(--lvb-muted)",
                          lineHeight: 1.3,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {extras.lunarLabel}
                      </span>
                    )}
                  </div>
                </div>
                {extras.holiday && c.inMonth && (
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 800,
                      color: "var(--lvb-danger)",
                      background: "var(--lvb-danger-soft)",
                      borderRadius: 6,
                      padding: "2px 8px",
                      lineHeight: 1.4,
                      alignSelf: "flex-start",
                    }}
                  >
                    {extras.holiday}
                  </span>
                )}
                {dayDeadlines.slice(0, 2).map((m, j) => (
                  <span key={j} className={`lvb-cal-mark ${projClass(m.projTag.tone)}`}>
                    {m.name}
                  </span>
                ))}
                {dayDeadlines.length > 2 && (
                  <span
                    style={{
                      fontSize: 12.5,
                      fontWeight: 700,
                      color: "var(--lvb-muted)",
                      padding: "2px 4px",
                    }}
                  >
                    + {dayDeadlines.length - 2}건 더
                  </span>
                )}
              </>
            );

            const commonStyle: React.CSSProperties = {
              minHeight: 110,
              padding: "8px 10px",
              borderRadius: 10,
              background: baseBg,
              border,
              display: "flex",
              flexDirection: "column",
              gap: 3,
              opacity: c.inMonth ? 1 : 0.55,
              cursor: isClickable ? "pointer" : "default",
              transition: "background 0.12s, transform 0.12s, box-shadow 0.12s",
            };

            if (isClickable) {
              return (
                <button
                  key={i}
                  type="button"
                  ref={(el) => {
                    if (c.inMonth) cellRefs.current[c.day] = el as unknown as HTMLDivElement | null;
                  }}
                  onClick={() => pickDay(c.day)}
                  aria-pressed={isSelected}
                  style={{ ...commonStyle, font: "inherit", textAlign: "left" }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "translateY(-1px)";
                    e.currentTarget.style.boxShadow = "0 4px 12px rgba(31,42,31,0.10)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  {content}
                </button>
              );
            }
            return (
              <div
                key={i}
                ref={(el) => {
                  if (c.inMonth) cellRefs.current[c.day] = el;
                }}
                style={commonStyle}
              >
                {content}
              </div>
            );
          })}
        </div>
      </div>

      <div className="lvb-sec-head">
        <div className="lvb-sec-head-l">
          <span className="lvb-sec-ic t-green"><Clock size={18} /></span>
          <span className="lvb-sec-title">
            {selectedDay != null ? `${month + 1}월 ${selectedDay}일 마감` : "이달 마감"}
          </span>
          <span className="lvb-sec-count">{filteredAgenda.length}</span>
        </div>
        {selectedDay != null && (
          <button type="button" className="lvb-link" onClick={() => setSelectedDay(null)}>
            전체 보기
          </button>
        )}
      </div>
      <div className="lvb-agenda">
        {filteredAgenda.length === 0 ? (
          <div
            style={{
              padding: "20px 14px",
              textAlign: "center",
              fontSize: 15,
              fontWeight: 600,
              color: "var(--lvb-muted)",
              background: "var(--lvb-bg-soft)",
              borderRadius: 12,
            }}
          >
            {selectedDay != null
              ? "이 날짜에는 마감이 없어요"
              : "이 달에는 마감이 없어요"}
          </div>
        ) : (
          filteredAgenda.map((d, i) => {
            const t = d.daysLeft < 0 ? "danger" : d.daysLeft <= 7 ? "warn" : "neutral";
            const isOn = selectedDay === d.day;
            return (
              <button
                key={i}
                type="button"
                className="lvb-agenda-row"
                onClick={() => focusCell(d.day)}
                style={{
                  cursor: "pointer",
                  textAlign: "left",
                  width: "100%",
                  boxShadow: isOn ? "inset 4px 0 0 var(--lvb-accent)" : undefined,
                }}
                title="달력에서 이 날짜로 이동"
              >
                <span className={`lvb-agenda-date t-${t}`}>{d.day}일</span>
                <span className={`lvb-projtag ${projtagTone(d.projTag.tone)}`}>
                  {d.projTag.label}
                </span>
                <span className="lvb-agenda-name">{d.name}</span>
                <span className="lvb-agenda-due">{d.dueText}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
