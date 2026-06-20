/**
 * "누락 항목 요약" 카드.
 * 전체 todo 항목의 `missing_evidence_types` 를 종류별로 집계해서 갯수와 함께 표시.
 */
import { Camera, BookOpen, Leaf, FileText } from "lucide-react"
import type { AdminTodoStatusItem } from "@/lib/admin-types"

const EVIDENCE_LABEL: Record<string, string> = {
  MID_DRAINAGE_START: "중간 물떼기 시작",
  MID_DRAINAGE_END: "중간 물떼기 종료",
  AWD_DRY_FIELD: "물 얕게 대기",
  BIOCHAR_BAG: "바이오차 포대",
  BIOCHAR_SPREADING: "바이오차 살포",
  BIOCHAR_INVOICE: "바이오차 영수증",
  AUTUMN_TILLAGE_BEFORE: "가을 경운 전",
  AUTUMN_TILLAGE_AFTER: "가을 경운 후",
  WASTE_COLLECTION: "폐기물 수거",
  UNCLEAR_OR_INVALID: "확인 불가",
}

function iconFor(code: string) {
  if (code.startsWith("BIOCHAR")) return <Leaf size={18} />
  if (code.startsWith("AUTUMN")) return <Leaf size={18} />
  if (code === "WASTE_COLLECTION") return <Leaf size={18} />
  if (code === "AWD_DRY_FIELD" || code.startsWith("MID_DRAINAGE")) return <FileText size={18} />
  return <Camera size={18} />
}

function labelFor(code: string) {
  return EVIDENCE_LABEL[code] ?? code
}

export function MissingSummary({ items }: { items: AdminTodoStatusItem[] }) {
  // 누락 증빙 코드별로 등장 횟수를 집계합니다 (todo 단위 카운트).
  const counts: Record<string, number> = {}
  for (const item of items) {
    for (const code of item.missing_evidence_types || []) {
      counts[code] = (counts[code] || 0) + 1
    }
  }
  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1])

  if (rows.length === 0) {
    return (
      <div className="card-body muted" style={{ fontSize: 15, padding: 28, textAlign: "center" }}>
        현재 누락된 증빙 항목이 없습니다.
      </div>
    )
  }

  return (
    <div className="missing-list">
      {rows.map(([code, count]) => (
        <div key={code} className="missing-row">
          <div className="missing-row-label">
            <span className="missing-row-icon">{iconFor(code)}</span>
            <span>{labelFor(code)}</span>
          </div>
          <span className="missing-row-count">{count}건</span>
        </div>
      ))}
    </div>
  )
}
