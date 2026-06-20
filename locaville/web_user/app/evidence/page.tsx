"use client"

/**
 * 증빙 조회 페이지 (`/evidence`).
 * 필터 + 표 + 상세 패널. 행에서 "확인 완료" 즉시 PATCH, 상세 패널의 상태 버튼으로도 PATCH.
 */
import { useCallback, useEffect, useMemo, useState } from "react"
import { Camera, RefreshCw, Trash2, X } from "lucide-react"
import {
  BACKEND_CONNECTION_ERROR_MESSAGE,
  deleteEvidence,
  listAdminEvidence,
} from "@/lib/admin-api"
import type { AdminEvidenceItem } from "@/lib/admin-types"
import { PageHeader } from "@/components/ui/PageHeader"
import { Card, CardBody } from "@/components/ui/Card"
import { Btn } from "@/components/ui/Btn"
import { Badge } from "@/components/ui/Badge"
import { EmptyState } from "@/components/ui/EmptyState"
import { labelActivityType, labelEvidence } from "@/lib/labels"
import { resolveImageUrl } from "@/lib/image-url"
import { markEvidenceSeen } from "@/lib/sidebar-badges"

export default function EvidencePage() {
  const [items, setItems] = useState<AdminEvidenceItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [farmerId, setFarmerId] = useState("")
  const [status, setStatus] = useState("")
  const [reviewOnly, setReviewOnly] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const data = await listAdminEvidence({
        farmer_id: farmerId || undefined,
        status: status || undefined,
      })
      setItems(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : BACKEND_CONNECTION_ERROR_MESSAGE)
    } finally {
      setLoading(false)
    }
  }, [farmerId, status])

  useEffect(() => {
    void load()
  }, [load])

  // 페이지 진입 시 마지막 본 시각 갱신 → 사이드바 증빙 배지 즉시 0.
  useEffect(() => {
    markEvidenceSeen()
  }, [])

  const displayed = useMemo(() => {
    if (!reviewOnly) return items
    return items.filter((item) =>
      item.status === "needs_review" || item.status === "manual_review_required",
    )
  }, [items, reviewOnly])

  const selected = selectedId ? items.find((e) => e.evidence_id === selectedId) ?? null : null

  async function handleDelete(item: AdminEvidenceItem) {
    const farmerLabel = item.farmer_name || item.farmer_id
    const evLabel = labelEvidence({ confirmedLabel: item.confirmed_label, evidenceType: item.evidence_type })
    const ok = window.confirm(
      `${farmerLabel} 농가의 "${evLabel}" 증빙 사진을 삭제할까요?\n\n잘못 찍힌 사진이거나 부적절한 기록인 경우 사용하세요. 목록과 대시보드에서 즉시 사라집니다.`,
    )
    if (!ok) return
    setDeletingId(item.evidence_id)
    setError("")
    try {
      await deleteEvidence(item.evidence_id)
      // 상세 패널 닫고 목록 새로고침
      if (selectedId === item.evidence_id) setSelectedId(null)
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
        title="증빙사진 조회"
        sub="농가가 등록한 사진 증빙을 확인하고 검토 상태를 변경합니다."
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
            <option value="needs_review">검토 필요</option>
            <option value="manual_review_required">수동 확인 필요</option>
            <option value="confirmed">확인 완료</option>
            <option value="retake_required">재촬영 필요</option>
          </select>
          <Btn
            size="sm"
            variant={reviewOnly ? "primary" : "outline"}
            onClick={() => setReviewOnly((v) => !v)}
          >
            검토 필요만
          </Btn>
          <Btn size="sm" variant="ghost" onClick={() => {
            setFarmerId("")
            setStatus("")
            setReviewOnly(false)
          }}>
            초기화
          </Btn>
          <div className="filter-spacer" />
          <span className="filter-count">{displayed.length}건</span>
        </div>
      </Card>

      <div className={selected ? "split-2col" : ""} style={{ marginTop: 20 }}>
        <Card>
          {loading ? (
            <div className="loading">불러오는 중...</div>
          ) : displayed.length === 0 ? (
            <EmptyState
              icon={<Camera size={32} />}
              title={reviewOnly ? "검토가 필요한 증빙이 없습니다" : "조회된 증빙이 없습니다"}
            />
          ) : (
            <div className="table-wrap">
              <table className="tbl tbl-clickable">
                <thead>
                  <tr>
                    <th>등록일</th>
                    <th>농업인</th>
                    <th>사진</th>
                    <th>활동 / 증빙</th>
                    <th>상태</th>
                  </tr>
                </thead>
                <tbody>
                  {displayed.map((item) => (
                    <tr
                      key={item.evidence_id}
                      onClick={() =>
                        setSelectedId(item.evidence_id === selectedId ? null : item.evidence_id)
                      }
                      style={{ background: selectedId === item.evidence_id ? "var(--bg-soft)" : undefined }}
                    >
                      <td className="cell-mono">{item.captured_at?.slice(0, 10)}</td>
                      <td className="cell-name">{item.farmer_name || item.farmer_id}</td>
                      <td>
                        {(() => {
                          const src = resolveImageUrl(item.image_url)
                          return src ? (
                            <img
                              src={src}
                              alt={labelEvidence({ confirmedLabel: item.confirmed_label, evidenceType: item.evidence_type })}
                              style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 6, border: "1px solid var(--line)" }}
                              loading="lazy"
                            />
                          ) : (
                            <span className="muted">—</span>
                          )
                        })()}
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>
                          {labelActivityType(item.activity_type) || "활동 정보 없음"}
                        </div>
                        <div className="muted" style={{ fontSize: 13 }}>
                          {labelEvidence({ confirmedLabel: item.confirmed_label, evidenceType: item.evidence_type })}
                        </div>
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
                <span className="card-head-title">증빙 상세</span>
                <span className="card-head-sub">{selected.evidence_id.slice(0, 18)}...</span>
              </div>
              <button className="topbar-icon-btn" onClick={() => setSelectedId(null)} aria-label="닫기">
                <X size={16} />
              </button>
            </div>
            <CardBody>
              {(() => {
                const detailSrc = resolveImageUrl(selected.image_url)
                return detailSrc ? (
                <a href={detailSrc} target="_blank" rel="noreferrer">
                  <img
                    src={detailSrc}
                    alt={labelEvidence({ confirmedLabel: selected.confirmed_label, evidenceType: selected.evidence_type })}
                    style={{ width: "100%", maxHeight: 360, objectFit: "cover", borderRadius: 8, border: "1px solid var(--line)", marginBottom: 16 }}
                  />
                </a>
                ) : null
              })()}
              <div className="detail-row">
                <span className="detail-row-label">농업인</span>
                <span className="detail-row-value">
                  {selected.farmer_name || selected.farmer_id}
                </span>
              </div>
              <div className="detail-row">
                <span className="detail-row-label">활동 유형</span>
                <span className="detail-row-value">{labelActivityType(selected.activity_type) || "활동 정보 없음"}</span>
              </div>
              <div className="detail-row">
                <span className="detail-row-label">증빙 유형</span>
                <span className="detail-row-value">
                  {labelEvidence({ confirmedLabel: selected.confirmed_label, evidenceType: selected.evidence_type })}
                </span>
              </div>
              <div className="detail-row">
                <span className="detail-row-label">등록일</span>
                <span className="detail-row-value cell-mono">
                  {selected.captured_at?.slice(0, 19).replace("T", " ")}
                </span>
              </div>
              <div className="detail-row">
                <span className="detail-row-label">상태</span>
                <span className="detail-row-value">
                  <Badge status={selected.status} />
                </span>
              </div>
              {selected.user_message && (
                <div className="detail-row">
                  <span className="detail-row-label">메시지</span>
                  <span className="detail-row-value muted">{selected.user_message}</span>
                </div>
              )}

              <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--line-soft)" }}>
                <div className="muted" style={{ fontSize: 14, marginBottom: 8 }}>
                  이 사진이 잘못 찍혔거나 부적절하면 삭제할 수 있어요.
                </div>
                <Btn
                  variant="danger"
                  size="md"
                  icon={<Trash2 size={16} />}
                  disabled={deletingId === selected.evidence_id}
                  onClick={() => void handleDelete(selected)}
                >
                  {deletingId === selected.evidence_id ? "삭제 중..." : "삭제"}
                </Btn>
              </div>
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  )
}
