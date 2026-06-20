"use client"

/**
 * 영농일지 표의 기간 필터에서 사용하는 날짜 범위 picker.
 *
 * 자체 backdrop + popover 구조 (`Modal` 컴포넌트와는 별개의 가벼운 popover).
 * 한 번 클릭 = 시작일, 두 번째 클릭 = 종료일 (시작일보다 이전 클릭은 swap).
 *
 * `formatDateToDot(date)` 헬퍼는 두 sub-table 의 기간 라벨에서 함께 사용합니다.
 */
import { useEffect, useMemo, useState } from "react"

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"]

export function formatDateToDot(date: Date): string {
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`
}

function toDateOnly(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function isSameDate(a: Date | null, b: Date | null): boolean {
  if (!a || !b) return false
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function isDateInRange(date: Date, startDate: Date | null, endDate: Date | null): boolean {
  if (!startDate || !endDate) return false
  const target = toDateOnly(date).getTime()
  return target > toDateOnly(startDate).getTime() && target < toDateOnly(endDate).getTime()
}

function getCalendarDates(year: number, month: number): Date[] {
  const firstDate = new Date(year, month, 1)
  const start = new Date(year, month, 1 - firstDate.getDay())
  return Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index))
}

export default function DateRangePickerModal({
  open,
  initialStartDate,
  initialEndDate,
  onCancel,
  onApply,
}: {
  open: boolean
  initialStartDate: Date | null
  initialEndDate: Date | null
  onCancel: () => void
  onApply: (startDate: Date, endDate: Date) => void
}) {
  const [visibleMonth, setVisibleMonth] = useState(() => initialStartDate || new Date(2026, 4, 1))
  const [startDate, setStartDate] = useState<Date | null>(initialStartDate)
  const [endDate, setEndDate] = useState<Date | null>(initialEndDate)
  const today = useMemo(() => toDateOnly(new Date()), [])

  useEffect(() => {
    if (!open) return
    setStartDate(initialStartDate)
    setEndDate(initialEndDate)
    setVisibleMonth(initialStartDate || new Date(2026, 4, 1))
  }, [initialEndDate, initialStartDate, open])

  if (!open) return null

  const dates = getCalendarDates(visibleMonth.getFullYear(), visibleMonth.getMonth())

  function handleSelectDate(date: Date) {
    const selected = toDateOnly(date)
    if (!startDate || (startDate && endDate)) {
      setStartDate(selected)
      setEndDate(null)
      return
    }

    if (selected.getTime() < toDateOnly(startDate).getTime()) {
      setStartDate(selected)
      setEndDate(startDate)
      return
    }

    setEndDate(selected)
  }

  function handleApply() {
    if (!startDate || !endDate) {
      alert("시작일과 종료일을 선택해주세요.")
      return
    }
    onApply(startDate, endDate)
  }

  function moveMonth(delta: number) {
    setVisibleMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1))
  }

  function handleToday() {
    setVisibleMonth(new Date(today.getFullYear(), today.getMonth(), 1))
    if (!startDate || (startDate && endDate)) {
      setStartDate(today)
      setEndDate(null)
    } else {
      handleSelectDate(today)
    }
  }

  return (
    <div className="date-range-backdrop" onClick={onCancel}>
      <div className="date-range-popover" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="date-range-head">
          <button type="button" onClick={() => moveMonth(-1)} aria-label="이전 달">
            ‹
          </button>
          <strong>
            {visibleMonth.getFullYear()}년 {visibleMonth.getMonth() + 1}월
          </strong>
          <button type="button" onClick={() => moveMonth(1)} aria-label="다음 달">
            ›
          </button>
        </div>
        <div className="date-range-weekdays">
          {WEEKDAYS.map((weekday) => (
            <span key={weekday}>{weekday}</span>
          ))}
        </div>
        <div className="date-range-grid">
          {dates.map((date) => {
            const outsideMonth = date.getMonth() !== visibleMonth.getMonth()
            const selectedStart = isSameDate(date, startDate)
            const selectedEnd = isSameDate(date, endDate)
            const inRange = isDateInRange(date, startDate, endDate)
            const className = [
              "date-range-day",
              outsideMonth ? "outside" : "",
              inRange ? "in-range" : "",
              selectedStart || selectedEnd ? "selected" : "",
              isSameDate(date, today) ? "today" : "",
            ]
              .filter(Boolean)
              .join(" ")

            return (
              <button key={date.toISOString()} type="button" className={className} onClick={() => handleSelectDate(date)}>
                {date.getDate()}
              </button>
            )
          })}
        </div>
        <div className="date-range-footer">
          <button type="button" className="date-range-today" onClick={handleToday}>
            오늘
          </button>
          <div>
            <button type="button" className="date-range-cancel" onClick={onCancel}>
              취소
            </button>
            <button type="button" className="date-range-apply" onClick={handleApply}>
              선택
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
