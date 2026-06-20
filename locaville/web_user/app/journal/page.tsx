"use client"

/**
 * 영농일지 조회 페이지 (`/journal`).
 * 필터(농가 ID / 상태 / 작업일) + 목록 표 + 행 클릭 시 우측에 상세 패널 (split layout).
 */
import { useCallback, useEffect, useState } from "react"
import { BookOpen, RefreshCw, Trash2, X } from "lucide-react"
import { BACKEND_CONNECTION_ERROR_MESSAGE, deleteDiary, listAdminDiaries } from "@/lib/admin-api"
import type { AdminDiaryItem } from "@/lib/admin-types"
import { PageHeader } from "@/components/ui/PageHeader"
import { Card, CardBody } from "@/components/ui/Card"
import { Btn } from "@/components/ui/Btn"
import { Badge } from "@/components/ui/Badge"
import { EmptyState } from "@/components/ui/EmptyState"
import { markDiarySeen } from "@/lib/sidebar-badges"

export default function JournalPage() {
  const [items, setItems] = useState<AdminDiaryItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [farmerId, setFarmerId] = useState("")
  const [status, setStatus] = useState("")
  const [workDate, setWorkDate] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const data = await listAdminDiaries({
        farmer_id: farmerId || undefined,
        status: status || undefined,
        work_date: workDate || undefined,
      })
      setItems(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : BACKEND_CONNECTION_ERROR_MESSAGE)
    } finally {
      setLoading(false)
    }
  }, [farmerId, status, workDate])

  useEffect(() => {
    void load()
  }, [load])

  // 페이지 진입 시 마지막 본 시각 갱신 → 사이드바 일지 배지 즉시 0.
  useEffect(() => {
    markDiarySeen()
  }, [])

  const selected = selectedId ? items.find((d) => d.diary_id === selectedId) ?? null : null

  async function handleDelete(item: AdminDiaryItem) {
    const farmerLabel = item.farmer_name || item.farmer_id
    const ok = window.confirm(
      `${farmerLabel} 농가의 ${item.work_date} 영농일지를 삭제할까요?\n\n잘못 기록된 일지인 경우 사용하세요. 목록과 대시보드에서 즉시 사라집니다.`,
    )
    if (!ok) return
    setDeletingId(item.diary_id)
    setError("")
    try {
      await deleteDiary(item.diary_id)
      if (selectedId === item.diary_id) setSelectedId(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : BACKEND_CONNECTION_ERROR_MESSAGE)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div>
      <PageHeader
        title="영농일지 조회"
        sub="농가가 작성한 모든 영농일지를 확인합니다."
        actions={
          <Btn icon={<RefreshCw size={16} />} onClick={() => void load()} disabled={loading}>
            새로고침
          </Btn>
        }
      />

      {error && <div className="alert alert-error">오류: {error}</div>}

      <Card>
        <div className="filter-bar">
          <input
            placeholder="농업인 ID"
            value={farmerId}
            onChange={(e) => setFarmerId(e.target.value)}
          />
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">전체 상태</option>
            <option value="saved">저장됨</option>
            <option value="needs_review">검토 필요</option>
            <option value="confirmed">확인 완료</option>
          </select>
          <input
            type="date"
            value={workDate}
            onChange={(e) => setWorkDate(e.target.value)}
          />
          <Btn size="sm" variant="ghost" onClick={() => {
            setFarmerId("")
            setStatus("")
            setWorkDate("")
          }}>
            초기화
          </Btn>
          <div className="filter-spacer" />
          <span className="filter-count">{items.length}건</span>
        </div>
      </Card>

      <div className={selected ? "split-2col" : ""} style={{ marginTop: 20 }}>
        <Card>
          {loading ? (
            <div className="loading">불러오는 중...</div>
          ) : items.length === 0 ? (
            <EmptyState icon={<BookOpen size={32} />} title="조회된 영농일지가 없습니다" />
          ) : (
            <div className="table-wrap">
              <table className="tbl tbl-clickable">
                <thead>
                  <tr>
                    <th>작업일</th>
                    <th>농업인</th>
                    <th>작물</th>
                    <th>작업 단계</th>
                    <th>작업 내용</th>
                    <th>상태</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr
                      key={item.diary_id}
                      onClick={() => setSelectedId(item.diary_id === selectedId ? null : item.diary_id)}
                      style={{ background: selectedId === item.diary_id ? "var(--bg-soft)" : undefined }}
                    >
                      <td className="cell-mono">{item.work_date}</td>
                      <td className="cell-name">
                        {item.farmer_name || item.farmer_id}
                      </td>
                      <td>{item.crop_name}</td>
                      <td>{item.work_stage_detail || item.work_stage}</td>
                      <td style={{ maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.work_detail}>
                        {item.work_detail}
                      </td>
                      <td>
                        <Badge status={item.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {selected && (
          <Card>
            <div className="card-head">
              <div className="card-head-left">
                <span className="card-head-title">영농일지 상세</span>
                <span className="card-head-sub">{selected.diary_id}</span>
              </div>
              <button className="topbar-icon-btn" onClick={() => setSelectedId(null)} aria-label="닫기">
                <X size={16} />
              </button>
            </div>
            <CardBody>
              <div className="detail-row">
                <span className="detail-row-label">작업일</span>
                <span className="detail-row-value cell-mono">{selected.work_date}</span>
              </div>
              <div className="detail-row">
                <span className="detail-row-label">농업인</span>
                <span className="detail-row-value">
                  {selected.farmer_name || selected.farmer_id}
                  {selected.farmer_name && (
                    <span className="muted" style={{ marginLeft: 8 }}>{selected.farmer_id}</span>
                  )}
                </span>
              </div>
              <div className="detail-row">
                <span className="detail-row-label">작물</span>
                <span className="detail-row-value">{selected.crop_name}</span>
              </div>
              <div className="detail-row">
                <span className="detail-row-label">작업 단계</span>
                <span className="detail-row-value">
                  {selected.work_stage_detail || selected.work_stage}
                </span>
              </div>
              <div className="detail-row">
                <span className="detail-row-label">상태</span>
                <span className="detail-row-value">
                  <Badge status={selected.status} />
                </span>
              </div>
              {selected.linked_evidence_ids && selected.linked_evidence_ids.length > 0 && (
                <div className="detail-row">
                  <span className="detail-row-label">연결 증빙</span>
                  <span className="detail-row-value">
                    {selected.linked_evidence_ids.length}건
                  </span>
                </div>
              )}
              <div style={{ marginTop: 16 }}>
                <div className="muted" style={{ fontSize: 14, marginBottom: 6 }}>작업 내용</div>
                <div style={{
                  border: "1px solid var(--line-soft)",
                  background: "var(--bg-soft)",
                  borderRadius: 8,
                  padding: 14,
                  fontSize: 15,
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                }}>
                  {selected.work_detail}
                </div>
              </div>

              <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--line-soft)" }}>
                <div className="muted" style={{ fontSize: 14, marginBottom: 8 }}>
                  이 일지가 잘못 기록됐으면 삭제할 수 있어요.
                </div>
                <Btn
                  variant="danger"
                  size="md"
                  icon={<Trash2 size={16} />}
                  disabled={deletingId === selected.diary_id}
                  onClick={() => void handleDelete(selected)}
                >
                  {deletingId === selected.diary_id ? "삭제 중..." : "삭제"}
                </Btn>
              </div>
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  )
}
