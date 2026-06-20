/** 대시보드 상단 KPI 카드. 라벨 + 큰 숫자 + 보조 텍스트. `warn` 이면 강조 색. */
import type { ReactNode } from "react"

export function StatCard({
  label,
  value,
  sub,
  warn = false,
  icon,
}: {
  label: string
  value: ReactNode
  sub?: string
  warn?: boolean
  icon?: ReactNode
}) {
  return (
    <div className={`stat-card${warn ? " stat-card-warn" : ""}`}>
      <div className="stat-card-label">
        {icon && <span className="stat-card-icon">{icon}</span>}
        <span>{label}</span>
      </div>
      <div className="stat-card-value">{value}</div>
      {sub && <div className="stat-card-sub">{sub}</div>}
    </div>
  )
}
