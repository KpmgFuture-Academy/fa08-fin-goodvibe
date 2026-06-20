"use client"

/**
 * 대시보드 하단 "농가별 현황" 표.
 * `summary.diaries_by_farmer` 와 `todoItems` 를 합쳐 한 농가 한 행으로 구성.
 * 행 클릭 → `/residents/{amo_regno}` 로 이동.
 */
import { Eye } from "lucide-react"
import { useRouter } from "next/navigation"
import { Bar } from "@/components/ui/Bar"
import { Badge } from "@/components/ui/Badge"
import { Btn } from "@/components/ui/Btn"
import type { AdminSummary, AdminTodoStatusItem } from "@/lib/admin-types"

type Row = {
  farmer_id: string
  farmer_name: string
  diary_count: number
  evidence_count: number
  latest_work_date: string | null
  total_todos: number
  completed_todos: number
  missing_count: number
}

function buildRows(summary: AdminSummary | null, todoItems: AdminTodoStatusItem[]): Row[] {
  const base = new Map<string, Row>()
  for (const f of summary?.diaries_by_farmer || []) {
    base.set(f.farmer_id, {
      farmer_id: f.farmer_id,
      farmer_name: f.farmer_name || "",
      diary_count: f.diary_count,
      evidence_count: f.evidence_count,
      latest_work_date: f.latest_work_date || null,
      total_todos: 0,
      completed_todos: 0,
      missing_count: 0,
    })
  }
  // todoItems의 farmer_id는 필터 echo이므로 신뢰 어렵지만, applied_filters 없이도
  // farmer_id가 비어있지 않은 todo들을 카운트에 활용
  for (const t of todoItems) {
    const fid = t.farmer_id
    if (!fid) continue
    if (!base.has(fid)) {
      base.set(fid, {
        farmer_id: fid,
        farmer_name: t.farmer_name || "",
        diary_count: 0,
        evidence_count: 0,
        latest_work_date: null,
        total_todos: 0,
        completed_todos: 0,
        missing_count: 0,
      })
    }
    const row = base.get(fid)!
    row.total_todos += 1
    if (t.computed_status === "completed") row.completed_todos += 1
    row.missing_count += (t.missing_evidence_types || []).length
  }
  return Array.from(base.values())
}

function rate(row: Row): number {
  if (row.total_todos > 0) return Math.round((row.completed_todos / row.total_todos) * 100)
  if (row.diary_count + row.evidence_count === 0) return 0
  return 50 // 활동은 있으나 todo가 안 잡힐 때 중간값 표기
}

export function FarmerTable({
  summary,
  todoItems,
}: {
  summary: AdminSummary | null
  todoItems: AdminTodoStatusItem[]
}) {
  const router = useRouter()
  const rows = buildRows(summary, todoItems)
  if (rows.length === 0) {
    return (
      <div className="tbl-empty muted" style={{ padding: 48 }}>
        아직 등록된 농가 활동이 없습니다.
      </div>
    )
  }
  return (
    <div className="table-wrap">
      <table className="tbl tbl-clickable">
        <thead>
          <tr>
            <th>농업인</th>
            <th>영농일지</th>
            <th>증빙사진</th>
            <th>이행률</th>
            <th>확인 필요</th>
            <th>최근 작업일</th>
            <th aria-label="조회"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const pct = rate(row)
            return (
              <tr
                key={row.farmer_id}
                onClick={() => router.push(`/residents/${encodeURIComponent(row.farmer_id)}`)}
              >
                <td className="cell-name">
                  {row.farmer_name || row.farmer_id}
                  {row.farmer_name && (
                    <div className="muted" style={{ fontSize: 13, fontWeight: 400 }}>
                      {row.farmer_id}
                    </div>
                  )}
                </td>
                <td className="cell-mono">{row.diary_count}건</td>
                <td className="cell-mono">{row.evidence_count}건</td>
                <td>
                  <div className="cell-progress">
                    <Bar value={pct} height="sm" />
                    <span className="cell-progress-value">{pct}%</span>
                  </div>
                </td>
                <td>
                  {row.missing_count > 0 ? (
                    <Badge tone="warn" label={`${row.missing_count}건`} />
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td className="cell-mono">{row.latest_work_date || <span className="muted">—</span>}</td>
                <td>
                  <Btn
                    size="sm"
                    icon={<Eye size={14} />}
                    onClick={(e) => {
                      e.stopPropagation()
                      router.push(`/residents/${encodeURIComponent(row.farmer_id)}`)
                    }}
                  >
                    상세
                  </Btn>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
