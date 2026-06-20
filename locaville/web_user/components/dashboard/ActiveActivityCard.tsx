"use client"

/**
 * 대시보드 상단의 메인 hero 카드.
 * "지금은 {활동}이/가 증빙 기간이에요" — 활동명 큰 글자 + 기한 + 미제출 농가 수 + 두 액션 버튼.
 *
 * `ActivityPickerInline` 은 상단 헤더 자리에 들어가는 작은 드롭다운 — 활동 수동 전환용.
 */
import { Calendar, HelpCircle, Send, Users } from "lucide-react"
import { Btn } from "@/components/ui/Btn"
import type { ActivityDef } from "@/lib/activities"
import { formatKoreanDate, type ActivityStats } from "@/lib/dashboard-activity"
import { subjectParticle } from "@/lib/labels"

export function ActiveActivityCard({
  stats,
  onOpenNotice,
  onOpenExplainer,
}: {
  stats: ActivityStats
  onOpenNotice: () => void
  onOpenExplainer: () => void
}) {
  const { activity, earliestDue, unsubmittedFarmers } = stats
  const dueLabel = earliestDue ? `${formatKoreanDate(earliestDue)}까지 완료해야 해요` : null
  const unsubmitted = unsubmittedFarmers.length

  return (
    <section className="hero">
      <div className="hero-eyebrow">지금은</div>
      <h1 className="hero-title">
        <span>{activity.name}</span>
        <span className="hero-title-tail"> 증빙 기간이에요</span>
      </h1>

      <ul className="hero-facts">
        {dueLabel && (
          <li className="hero-fact">
            <Calendar size={22} className="hero-fact-icon" />
            <span>{dueLabel}</span>
          </li>
        )}
        <li className="hero-fact">
          <Users size={22} className="hero-fact-icon" />
          {unsubmitted > 0 ? (
            <span>
              마을 농가 가운데 <strong className="hero-emph">{unsubmitted}곳</strong>이 아직 증빙을 내지 않았어요
            </span>
          ) : (
            <span>지금 미제출인 농가는 없어요. 잘 진행되고 있어요.</span>
          )}
        </li>
      </ul>

      <div className="hero-actions">
        <Btn
          variant="primary"
          size="lg"
          icon={<Send size={18} />}
          onClick={onOpenNotice}
          disabled={unsubmitted === 0}
        >
          {unsubmitted > 0 ? "미제출 농가 안내 문구 만들기" : "안내가 필요 없습니다"}
        </Btn>
        <Btn variant="outline" size="lg" icon={<HelpCircle size={18} />} onClick={onOpenExplainer}>
          {activity.name}{subjectParticle(activity.name)} 뭔가요?
        </Btn>
      </div>
    </section>
  )
}

export function ActivityPickerInline({
  activities,
  current,
  onPick,
}: {
  activities: ActivityDef[]
  current: ActivityDef
  onPick: (code: string) => void
}) {
  return (
    <div className="activity-picker">
      <label htmlFor="activity-picker">관리할 활동</label>
      <select
        id="activity-picker"
        value={current.code}
        onChange={(e) => onPick(e.target.value)}
      >
        {activities.map((a) => (
          <option key={a.code} value={a.code}>
            {a.name}
          </option>
        ))}
      </select>
    </div>
  )
}
