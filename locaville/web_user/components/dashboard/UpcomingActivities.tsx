"use client"

/**
 * "다음으로 챙길 활동" 섹션 — 최대 3개 카드.
 * 메인 활동(`ActiveActivityCard`) 외에 due_date 임박한 활동들. 카드 클릭 → 메인 교체.
 */
import { Calendar, ChevronRight } from "lucide-react"
import { Card, CardBody, CardHead } from "@/components/ui/Card"
import { formatKoreanDate, type ActivityStats } from "@/lib/dashboard-activity"
import type { ActivityCode } from "@/lib/activities"

export function UpcomingActivities({
  items,
  onPick,
}: {
  items: ActivityStats[]
  onPick: (code: ActivityCode) => void
}) {
  if (items.length === 0) return null
  return (
    <section className="section-block" style={{ marginTop: 28 }}>
      <h2 className="section-title">다음으로 챙길 활동</h2>
      <div className="upcoming-grid">
        {items.map((s) => (
          <button
            key={s.activity.code}
            type="button"
            className="upcoming-card"
            onClick={() => onPick(s.activity.code)}
          >
            <div className="upcoming-name">{s.activity.name}</div>
            <div className="upcoming-meta">
              {s.earliestDue ? (
                <span>
                  <Calendar size={16} /> {formatKoreanDate(s.earliestDue)}까지
                </span>
              ) : (
                <span className="muted">기한 미정</span>
              )}
            </div>
            <div className="upcoming-meta">
              미제출 <strong>{s.unsubmittedFarmers.length}곳</strong>
            </div>
            <div className="upcoming-cta">
              자세히 보기 <ChevronRight size={16} />
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}
