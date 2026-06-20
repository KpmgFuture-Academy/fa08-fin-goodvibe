/**
 * "사업별 이행률" 섹션. 사업 하나당 한 줄로 진행률 bar + 카운트.
 * 클릭 → `/projects/{prj_id}` 로 이동.
 */
import Link from "next/link"
import type { AdminTodoStatusItem } from "@/lib/admin-types"
import type { VillageProject } from "@/lib/projects"
import { Bar } from "@/components/ui/Bar"

export type ProjectProgressData = {
  project: VillageProject
  items: AdminTodoStatusItem[]
}

function summarize(items: AdminTodoStatusItem[]) {
  const total = items.length
  if (total === 0) return { total: 0, completed: 0, pending: 0, in_progress: 0, missing: 0, pct: 0 }
  let completed = 0
  let pending = 0
  let in_progress = 0
  let missing = 0
  for (const item of items) {
    if (item.computed_status === "completed") completed++
    else if (item.computed_status === "in_progress") in_progress++
    else pending++
    missing += (item.missing_evidence_types || []).length
  }
  return {
    total,
    completed,
    pending,
    in_progress,
    missing,
    pct: Math.round((completed / total) * 100),
  }
}

export function ProjectProgressList({ data }: { data: ProjectProgressData[] }) {
  if (data.length === 0) {
    return (
      <div className="card-body muted" style={{ fontSize: 15, padding: 28, textAlign: "center" }}>
        등록된 사업이 없습니다.
      </div>
    )
  }
  return (
    <div>
      {data.map(({ project, items }) => {
        const s = summarize(items)
        return (
          <div key={project.prj_id} className="proj-row">
            <div className="proj-row-header">
              <Link href={`/projects/${project.prj_id}`} className="proj-row-name">
                {project.prj_name}
              </Link>
              <div className="proj-row-meta">
                <span>총 {s.total}건</span>
                {s.pending > 0 && <span>대기 {s.pending}</span>}
                {s.in_progress > 0 && <span>진행 {s.in_progress}</span>}
                <span>완료 {s.completed}</span>
                <span className="proj-row-pct">{s.pct}%</span>
              </div>
            </div>
            <Bar value={s.pct} height="md" />
          </div>
        )
      })}
    </div>
  )
}
