"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import type { ReactNode } from "react"
import { useParams, useRouter } from "next/navigation"
import { DatabaseZap, RefreshCw, Trash2 } from "lucide-react"
import { PageHeader } from "@/components/ui/PageHeader"
import { Card, CardBody, CardHead } from "@/components/ui/Card"
import { Btn } from "@/components/ui/Btn"
import { Modal } from "@/components/ui/Modal"
import {
  deleteRagDocument,
  getRagFileDetail,
  getRagVectorRecords,
  RAG_ADMIN_CONNECTION_ERROR_MESSAGE,
  runRagEmbedding,
  updateRagFileBasicInfo,
} from "@/lib/rag-api"
import type { RagEmbeddingRecord, RagEmbeddingResponse, RagFileDetailResponse } from "@/lib/rag-types"

type HeadingLevel = {
  depth?: number
  notation?: string
  location?: string
  rule_type?: string
  rule_options?: Record<string, unknown> | null
  pattern?: string
  name?: string
}

function describeNotation(notation: string): string {
  const value = (notation || "").trim()
  if (value === "1." || value === "1 / 1.") return "1, 2, 3..."
  if (value === "가." || value === "가 / 가.") return "가, 나, 다..."
  if (value === "1)") return "1), 2), 3)..."
  if (value === "가)") return "가), 나), 다)..."
  if (value === "①") return "①, ②, ③..."
  if (value === "㉮") return "㉮, ㉯, ㉰..."
  if (value === "(1)") return "(1), (2), (3)..."
  if (value === "(가)") return "(가), (나), (다)..."
  return value || "—"
}

function formatHeadingSummaryLine(value?: string | null): string {
  const raw = String(value || "").trim()
  return raw || "등록된 목차 정보가 없습니다."
}

function formatDocumentHeadingSummary(levels: HeadingLevel[]): string {
  const summary = levels
    .map((level) => describeNotation(String(level.notation || "").trim()))
    .filter(Boolean)
  return summary.length ? summary.join(" > ") : "등록된 목차 정보가 없습니다."
}

function formatRuleOptions(options?: Record<string, unknown> | null): string {
  if (!options || typeof options !== "object") return "—"
  const entries = Object.entries(options)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key}: ${String(value)}`)
  return entries.length ? entries.join(", ") : "—"
}

function formatSchemaNote(value?: string | null): string {
  const raw = String(value || "").trim()
  if (!raw) return "신규: 없음 / 제외: 없음"
  try {
    const parsed = JSON.parse(raw)
    const added = Array.isArray((parsed as { added?: unknown }).added)
      ? (parsed as { added: unknown[] }).added.map((item) => String(item).trim()).filter(Boolean)
      : []
    const deleted = Array.isArray((parsed as { deleted?: unknown }).deleted)
      ? (parsed as { deleted: unknown[] }).deleted.map((item) => String(item).trim()).filter(Boolean)
      : []
    return `신규: ${added.join(", ") || "없음"} / 제외: ${deleted.join(", ") || "없음"}`
  } catch {
    return raw
  }
}

function formatAttributes(value?: Record<string, unknown> | null): string {
  if (!value || typeof value !== "object") return "—"
  const hiddenKeys = new Set([
    "heading_path",
    "section",
    "chunk_loc",
    "structural_group_key",
    "source_order_start",
    "source_order_end",
    "_heading_nodes_runtime",
  ])
  const entries = Object.entries(value).filter(
    ([key, item]) => !hiddenKeys.has(key) && item !== undefined && item !== null && item !== ""
  )
  const filtered = Object.fromEntries(entries)

  const locations = Array.isArray(filtered.locations) ? filtered.locations.map((item) => String(item)) : null
  const location = filtered.location != null ? String(filtered.location) : null
  if (locations && location) {
    if (locations.length === 1 && locations[0] === location) {
      delete filtered.locations
    } else if (locations.length > 1) {
      delete filtered.location
    }
  }

  const blockTypes = Array.isArray(filtered.block_types) ? filtered.block_types.map((item) => String(item)) : null
  const blockType = filtered.block_type != null ? String(filtered.block_type) : null
  if (blockTypes && blockType) {
    if (blockTypes.length === 1 && blockTypes[0] === blockType) {
      delete filtered.block_types
    } else if (blockTypes.length > 1) {
      delete filtered.block_type
    }
  }

  const tableMetaKeys = ["row_count", "cell_count", "header_row", "table_caption", "table_caption_position"] as const
  const tableMeta = Object.fromEntries(
    tableMetaKeys
      .filter((key) => filtered[key] !== undefined && filtered[key] !== null && filtered[key] !== "")
      .map((key) => [key, filtered[key]])
  )
  for (const key of tableMetaKeys) {
    delete filtered[key]
  }
  if (Object.keys(tableMeta).length) {
    filtered.table_meta = tableMeta
  }

  const rowIndex = filtered.row_index
  if (
    rowIndex !== undefined &&
    rowIndex !== null &&
    filtered.location === "table-cell" &&
    filtered.block_type === "table-row"
  ) {
    filtered.block_type = "table"
    filtered.location = { row_index: rowIndex }
    delete filtered.row_index
  }

  if (!Object.keys(filtered).length) return "—"

  const preferredOrder = ["sector", "segment_count", "block_type", "location", "table_meta"] as const
  const ordered = Object.fromEntries([
    ...preferredOrder
      .filter((key) => filtered[key] !== undefined)
      .map((key) => [key, filtered[key]]),
    ...Object.entries(filtered).filter(([key]) => !preferredOrder.includes(key as (typeof preferredOrder)[number])),
  ])

  return JSON.stringify(ordered, null, 2)
}

function formatPreviewDebug(record: RagEmbeddingRecord): string {
  const newlineCount = Number(record.newline_count || 0)
  const lineCount = Number(record.line_count || 0)
  if (!record.content_preview) return "내용 없음"
  return `lines ${lineCount} / newlines ${newlineCount}`
}

function renderPreviewLines(value: string): ReactNode {
  if (!value) return ""
  const lines = value.split("\n")
  return lines.map((line, index) => (
    <div key={`${index}-${line.slice(0, 24)}`} style={{ marginTop: index === 0 ? 0 : 8 }}>
      <div
        style={{
          whiteSpace: "pre-wrap",
          wordBreak: "keep-all",
          overflowWrap: "anywhere",
          lineHeight: 1.6,
        }}
      >
        {line}
      </div>
    </div>
  ))
}

export default function RagDetailPage() {
  const params = useParams<{ file_id: string }>()
  const router = useRouter()
  const fileId = decodeURIComponent(String(params.file_id || ""))
  const [data, setData] = useState<RagFileDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [embeddingError, setEmbeddingError] = useState("")
  const [embeddingLoading, setEmbeddingLoading] = useState(false)
  const [embeddingTestLoading, setEmbeddingTestLoading] = useState(false)
  const [embeddingResult, setEmbeddingResult] = useState<RagEmbeddingResponse | null>(null)
  const [embeddingResultModalOpen, setEmbeddingResultModalOpen] = useState(false)
  const [vectorRecords, setVectorRecords] = useState<RagEmbeddingRecord[]>([])
  const [vectorRecordsLoading, setVectorRecordsLoading] = useState(false)
  const [vectorRecordsError, setVectorRecordsError] = useState("")
  const [vectorRecordsHasMore, setVectorRecordsHasMore] = useState(false)
  const [vectorRecordsOffset, setVectorRecordsOffset] = useState(0)
  const [vectorRecordsTotalCount, setVectorRecordsTotalCount] = useState(0)
  const [deleteError, setDeleteError] = useState("")
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [redirectingAfterDelete, setRedirectingAfterDelete] = useState(false)
  const [basicInfoEditMode, setBasicInfoEditMode] = useState(false)
  const [basicInfoSaving, setBasicInfoSaving] = useState(false)
  const [basicInfoForm, setBasicInfoForm] = useState({
    doc_cat: "",
    doc_version: "",
    publication_date: "",
    doc_number: "",
    doc_manager: "",
  })
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [showHeadingDetails, setShowHeadingDetails] = useState(false)
  const [showEmbeddingRecords, setShowEmbeddingRecords] = useState(false)
  const [showingPreviewRecords, setShowingPreviewRecords] = useState(false)
  const headingSchema = ((data?.runtime_heading_schema || data?.heading_schema) || {}) as {
    hierarchy_type?: string
    levels?: HeadingLevel[]
  }
  const headingLevels = Array.isArray(headingSchema.levels) ? headingSchema.levels : []
  const selectedTemplate = data?.templates?.find((template) => template.heading_id === data?.item?.ref_heading_id) || null
  const selectedTemplateName = String(selectedTemplate?.heading_name || data?.item?.ref_heading_id || "—").trim() || "—"
  const templateHeadingSummaryLine = formatHeadingSummaryLine(selectedTemplate?.heading_summary)
  const documentHeadingSummaryLine = formatDocumentHeadingSummary(headingLevels)
  const registeredVectorCount = data?.item?.embedding_yn === "Y" ? Number(data?.item?.vector_count || 0) : 0
  const embeddingActionLabel = registeredVectorCount > 0 ? "벡터 임베딩 재실행" : "벡터 임베딩 실행"
  const willDeleteVectors =
    (data?.item?.embedding_yn || "").trim() === "Y" || Number(data?.item?.vector_count || 0) > 0
  const embeddingSummaryText = embeddingResult
    ? `최근 실행: 파싱 ${embeddingResult.parsed_segment_count}건 · 청크 ${embeddingResult.chunk_count}건 · ${embeddingResult.preview_only ? "테스트 미저장" : `등록 ${embeddingResult.inserted_count}건`} · 모델 ${embeddingResult.embedding_model}`
    : vectorRecordsTotalCount > 0
      ? showingPreviewRecords
        ? `테스트 결과 ${vectorRecords.length}건 표시`
        : `기존 rag_vector 총 ${vectorRecordsTotalCount}건 중 ${vectorRecords.length}건 표시`
      : "표시할 벡터 파싱 실행 결과가 없습니다. 먼저 벡터 임베딩을 실행해 주세요."

  const loadVectorRecords = useCallback(async (reset: boolean) => {
    if (!fileId) return
    const nextOffset = reset ? 0 : vectorRecordsOffset
    setVectorRecordsLoading(true)
    setVectorRecordsError("")
    try {
      const page = await getRagVectorRecords(fileId, { offset: nextOffset, limit: 50 })
      setVectorRecords((prev) => (reset ? page.records : [...prev, ...page.records]))
      setVectorRecordsHasMore(page.has_more)
      setVectorRecordsOffset(page.offset + page.records.length)
      setVectorRecordsTotalCount(page.total_count)
    } catch (e) {
      setVectorRecordsError(e instanceof Error ? e.message : RAG_ADMIN_CONNECTION_ERROR_MESSAGE)
    } finally {
      setVectorRecordsLoading(false)
    }
  }, [fileId, vectorRecordsOffset])

  const load = useCallback(async () => {
    if (!fileId || redirectingAfterDelete) return
    setLoading(true)
    setError("")
    try {
      const detail = await getRagFileDetail(fileId)
      setData(detail)
      setBasicInfoForm({
        doc_cat: String(detail.item?.doc_cat || ""),
        doc_version: detail.item?.doc_version != null ? String(detail.item.doc_version) : "",
        publication_date: String(detail.item?.publication_date || ""),
        doc_number: String(detail.item?.doc_number || ""),
        doc_manager: String(detail.item?.doc_manager || ""),
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : RAG_ADMIN_CONNECTION_ERROR_MESSAGE)
    } finally {
      setLoading(false)
    }
  }, [fileId, redirectingAfterDelete])

  const cancelBasicInfoEdit = useCallback(() => {
    setBasicInfoEditMode(false)
    setDeleteError("")
    setBasicInfoForm({
      doc_cat: String(data?.item?.doc_cat || ""),
      doc_version: data?.item?.doc_version != null ? String(data.item.doc_version) : "",
      publication_date: String(data?.item?.publication_date || ""),
      doc_number: String(data?.item?.doc_number || ""),
      doc_manager: String(data?.item?.doc_manager || ""),
    })
  }, [data?.item?.doc_cat, data?.item?.doc_manager, data?.item?.doc_number, data?.item?.doc_version, data?.item?.publication_date])

  const saveBasicInfoEdit = useCallback(async () => {
    setDeleteError("")
    const docCat = basicInfoForm.doc_cat.trim()
    if (!docCat) {
      setDeleteError("문서구분을 입력해 주세요.")
      return
    }
    const docVersion = Number(basicInfoForm.doc_version)
    if (!Number.isFinite(docVersion) || docVersion <= 0) {
      setDeleteError("문서버전 값이 올바르지 않습니다.")
      return
    }

    setBasicInfoSaving(true)
    try {
      await updateRagFileBasicInfo(fileId, {
        doc_cat: docCat,
        doc_version: docVersion,
        publication_date: basicInfoForm.publication_date.trim() || null,
        doc_number: basicInfoForm.doc_number.trim() || null,
        doc_manager: basicInfoForm.doc_manager.trim() || null,
      })
      await load()
      setBasicInfoEditMode(false)
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : RAG_ADMIN_CONNECTION_ERROR_MESSAGE)
    } finally {
      setBasicInfoSaving(false)
    }
  }, [basicInfoForm.doc_cat, basicInfoForm.doc_manager, basicInfoForm.doc_number, basicInfoForm.doc_version, basicInfoForm.publication_date, fileId, load])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!showEmbeddingRecords) return
    if (vectorRecords.length > 0 || vectorRecordsLoading) return
    if ((data?.item?.vector_count || 0) < 1) return
    void loadVectorRecords(true)
  }, [data?.item?.vector_count, loadVectorRecords, showEmbeddingRecords, vectorRecords.length, vectorRecordsLoading])

  const handleRunEmbedding = useCallback(async (dbUpdate: boolean) => {
    if (!fileId) return
    if (dbUpdate) {
      setEmbeddingLoading(true)
    } else {
      setEmbeddingTestLoading(true)
    }
    setEmbeddingError("")
    try {
      const result = await runRagEmbedding(fileId, { dbUpdate })
      setEmbeddingResult(result)
      setShowingPreviewRecords(Boolean(result.preview_only))
      setEmbeddingResultModalOpen(true)
      if (!dbUpdate) {
        setVectorRecords(result.records)
        setVectorRecordsOffset(result.records.length)
        setVectorRecordsHasMore(false)
        setVectorRecordsTotalCount(result.records.length)
        setShowEmbeddingRecords(true)
      } else {
        await load()
        if (showEmbeddingRecords) {
          setVectorRecords([])
          setVectorRecordsOffset(0)
          await loadVectorRecords(true)
        }
      }
    } catch (e) {
      setEmbeddingError(e instanceof Error ? e.message : RAG_ADMIN_CONNECTION_ERROR_MESSAGE)
    } finally {
      if (dbUpdate) {
        setEmbeddingLoading(false)
      } else {
        setEmbeddingTestLoading(false)
      }
    }
  }, [fileId, load, loadVectorRecords, showEmbeddingRecords])

  const handleDeleteDocument = useCallback(async () => {
    if (!fileId) return
    setDeleteLoading(true)
    setDeleteError("")
    try {
      setRedirectingAfterDelete(true)
      await deleteRagDocument(fileId)
      setDeleteConfirmOpen(false)
      router.replace("/rag")
    } catch (e) {
      setRedirectingAfterDelete(false)
      setDeleteError(e instanceof Error ? e.message : RAG_ADMIN_CONNECTION_ERROR_MESSAGE)
    } finally {
      setDeleteLoading(false)
    }
  }, [fileId, router])

  return (
    <div>
      <PageHeader
        title={loading ? "RAG 상세정보" : data?.item?.doc_name || "RAG 상세정보"}
        sub={fileId ? `파일ID: ${fileId}` : "등록된 RAG 문서 상세정보"}
        backHref="/rag"
        actions={
          <Btn onClick={() => void load()} icon={<RefreshCw size={16} />} disabled={loading}>
            새로고침
          </Btn>
        }
      />

      {error && <div className="alert alert-error">오류: {error}</div>}

      {!loading && data?.item && (
        <>
          <Card>
            <CardHead
              title="RAG 문서 파일 기본정보"
              action={(
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <Btn size="sm" variant="outline" onClick={() => setBasicInfoEditMode(true)} disabled={basicInfoEditMode}>
                    기본정보 수정
                  </Btn>
                  <Btn size="sm" variant="danger" onClick={() => setDeleteConfirmOpen(true)} icon={<Trash2 size={16} />}>
                    RAG 파일 삭제
                  </Btn>
                  <Link href={`/rag/new?file_id=${encodeURIComponent(fileId)}`} className="btn btn-primary btn-sm">
                    <span className="btn-icon"><DatabaseZap size={16} /></span>
                    <span>RAG 파일 재등록</span>
                  </Link>
                </div>
              )}
            />
            <CardBody>
              {deleteError ? (
                <div className="alert alert-error" style={{ marginBottom: 16 }}>
                  오류: {deleteError}
                </div>
              ) : null}
              <div style={{ display: "grid", gridTemplateColumns: "3fr 1fr", gap: 16 }}>
                <Detail label="파일명" value={data.item.file_name} />
                <Detail label="파일형식" value={data.item.format_type} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "3fr 1fr", gap: 16, marginTop: 16 }}>
                <Detail label="문서명" value={data.item.doc_name} />
                {basicInfoEditMode ? (
                  <DetailEditor
                    label="문서구분"
                    value={basicInfoForm.doc_cat}
                    onChange={(value) => setBasicInfoForm((prev) => ({ ...prev, doc_cat: value }))}
                  />
                ) : (
                  <Detail label="문서구분" value={data.item.doc_cat} />
                )}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "3fr 1fr", gap: 16, marginTop: 16 }}>
                <Detail label="파일ID" value={data.item.file_id} />
                {basicInfoEditMode ? (
                  <DetailEditor
                    label="문서버전"
                    type="number"
                    step="0.1"
                    value={basicInfoForm.doc_version}
                    onChange={(value) => setBasicInfoForm((prev) => ({ ...prev, doc_version: value }))}
                  />
                ) : (
                  <Detail label="문서버전" value={data.item.doc_version?.toFixed(1)} />
                )}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 16, marginTop: 16 }}>
                {basicInfoEditMode ? (
                  <DetailEditor
                    label="공개일자"
                    type="date"
                    value={basicInfoForm.publication_date}
                    onChange={(value) => setBasicInfoForm((prev) => ({ ...prev, publication_date: value }))}
                  />
                ) : (
                  <Detail label="공개일자" value={data.item.publication_date || "—"} />
                )}
                {basicInfoEditMode ? (
                  <DetailEditor
                    label="문서번호"
                    value={basicInfoForm.doc_number}
                    onChange={(value) => setBasicInfoForm((prev) => ({ ...prev, doc_number: value }))}
                  />
                ) : (
                  <Detail label="문서번호" value={data.item.doc_number || "—"} />
                )}
                {basicInfoEditMode ? (
                  <DetailEditor
                    label="문서담당자/기관"
                    value={basicInfoForm.doc_manager}
                    onChange={(value) => setBasicInfoForm((prev) => ({ ...prev, doc_manager: value }))}
                  />
                ) : (
                  <Detail label="문서담당자/기관" value={data.item.doc_manager || "—"} />
                )}
              </div>
              {basicInfoEditMode ? (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginTop: 18, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <Btn size="sm" variant="outline" onClick={() => {}}>
                      RAG 제안
                    </Btn>
                    <div style={{ fontSize: 12, color: "var(--muted)", display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
                        (문서구분, 문서버전, 공개일자, 문서번호, 문서담당자/기관)
                      </span>
                      <span>에 대한 RAG 수정 제안</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                    <Btn size="sm" variant="outline" onClick={cancelBasicInfoEdit} disabled={basicInfoSaving}>
                      취소
                    </Btn>
                    <Btn size="sm" variant="primary" onClick={() => void saveBasicInfoEdit()} disabled={basicInfoSaving}>
                      {basicInfoSaving ? "수정 중..." : "수정"}
                    </Btn>
                  </div>
                </div>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHead title="목차 및 RAG 등록 정보" />
            <CardBody>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(280px, 1fr)", gap: 16, marginTop: 16, alignItems: "start" }}>
                <div>
                  <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 6 }}>목차 구성</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.6 }}>
                      {documentHeadingSummaryLine}
                    </div>
                    <Btn
                      size="sm"
                      variant="outline"
                      onClick={() => setShowHeadingDetails((prev) => !prev)}
                    >
                      {showHeadingDetails ? "상세정보 닫기" : "상세정보"}
                    </Btn>
                  </div>
                </div>
                <DetailWithAction
                  label="참조 템플릿"
                  value={selectedTemplateName}
                  action={(
                    <Btn
                      size="sm"
                      variant="outline"
                      onClick={() => setSummaryOpen(true)}
                      disabled={!selectedTemplate}
                    >
                      목차 보기
                    </Btn>
                  )}
                />
              </div>
              <div style={{ marginTop: 12 }}>
                {showHeadingDetails && (
                  <div className="table-wrap">
                    <table
                      className="table"
                      style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", border: "1px solid var(--line-soft)" }}
                    >
                      <thead>
                        <tr>
                          <th style={{ width: 96, textAlign: "center", border: "1px solid var(--line-soft)", padding: "12px 10px", background: "#f3f4f6" }}>단계</th>
                          <th style={{ width: 180, textAlign: "center", border: "1px solid var(--line-soft)", padding: "12px 10px", background: "#f3f4f6" }}>표기</th>
                          <th style={{ width: 140, textAlign: "center", border: "1px solid var(--line-soft)", padding: "12px 10px", background: "#f3f4f6" }}>위치</th>
                          <th style={{ width: 180, textAlign: "center", border: "1px solid var(--line-soft)", padding: "12px 10px", background: "#f3f4f6" }}>규칙유형</th>
                          <th style={{ textAlign: "left", border: "1px solid var(--line-soft)", padding: "12px 10px", background: "#f3f4f6" }}>옵션 / 패턴</th>
                        </tr>
                      </thead>
                      <tbody>
                        {headingLevels.length ? (
                          headingLevels.map((level, idx) => (
                            <tr key={`${level.depth || idx}-${level.notation || idx}`}>
                              <td style={{ textAlign: "center", border: "1px solid var(--line-soft)", padding: "12px 10px", verticalAlign: "middle" }}>
                                {level.depth ?? idx + 1}
                              </td>
                              <td style={{ textAlign: "center", border: "1px solid var(--line-soft)", padding: "12px 10px", verticalAlign: "middle" }}>
                                {describeNotation(level.notation || "")}
                              </td>
                              <td style={{ textAlign: "center", border: "1px solid var(--line-soft)", padding: "12px 10px", verticalAlign: "middle" }}>
                                {level.location || "paragraph"}
                              </td>
                              <td style={{ textAlign: "center", border: "1px solid var(--line-soft)", padding: "12px 10px", verticalAlign: "middle" }}>
                                {level.rule_type || level.name || "pattern"}
                              </td>
                              <td style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.6, border: "1px solid var(--line-soft)", padding: "12px 10px", verticalAlign: "middle" }}>
                                {level.rule_type
                                  ? formatRuleOptions(level.rule_options)
                                  : level.pattern || "—"}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={5} style={{ color: "var(--muted)", border: "1px solid var(--line-soft)", padding: "12px 10px", textAlign: "center" }}>
                              등록된 heading_schema 단계 정보가 없습니다.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 6 }}>schema_note</div>
                <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.6 }}>
                  {formatSchemaNote(data.item.schema_note)}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 16, marginTop: 16, alignItems: "end" }}>
                <Detail label="등록 벡터수" value={String(registeredVectorCount)} />
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 14, flexWrap: "wrap" }}>
                  <Btn
                    size="sm"
                    variant="outline"
                    onClick={() => void handleRunEmbedding(false)}
                    disabled={embeddingLoading || embeddingTestLoading}
                  >
                    {embeddingTestLoading ? "벡터 임베딩 테스트 중..." : "벡터 임베딩 테스트"}
                  </Btn>
                  <Btn
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setShowEmbeddingRecords((prev) => {
                        const next = !prev
                        if (next) {
                          setShowingPreviewRecords(false)
                          setVectorRecords([])
                          setVectorRecordsOffset(0)
                          setVectorRecordsHasMore(false)
                          setVectorRecordsTotalCount(0)
                        }
                        return next
                      })
                    }}
                  >
                    {showEmbeddingRecords ? "RAG 벡터 파싱정보 닫기" : "RAG 벡터 파싱정보 보기"}
                  </Btn>
                  <Btn
                    size="sm"
                    variant="primary"
                    onClick={() => void handleRunEmbedding(true)}
                    disabled={embeddingLoading || embeddingTestLoading}
                  >
                    {embeddingLoading ? "벡터 임베딩 실행 중..." : embeddingActionLabel}
                  </Btn>
                </div>
              </div>
              {embeddingError ? (
                <div className="alert alert-error" style={{ marginTop: 16 }}>
                  오류: {embeddingError}
                </div>
              ) : null}
              {showEmbeddingRecords ? (
                <div style={{ marginTop: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700 }}>벡터 파싱정보</div>
                      <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>{embeddingSummaryText}</div>
                    </div>
                  </div>
                  {vectorRecordsError ? (
                    <div className="alert alert-error" style={{ marginBottom: 16 }}>
                      오류: {vectorRecordsError}
                    </div>
                  ) : null}
                  <div className="table-wrap">
                    <table className="table" style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", border: "1px solid var(--line-soft)" }}>
                      <thead>
                        <tr>
                          <th style={{ width: 150, textAlign: "left", border: "1px solid var(--line-soft)", padding: "12px 10px", background: "#f3f4f6" }}>chunk_id</th>
                          <th style={{ width: 220, textAlign: "left", border: "1px solid var(--line-soft)", padding: "12px 10px", background: "#f3f4f6" }}>heading_path</th>
                          <th style={{ width: 140, textAlign: "left", border: "1px solid var(--line-soft)", padding: "12px 10px", background: "#f3f4f6" }}>chunk_loc</th>
                          <th style={{ width: 240, textAlign: "left", border: "1px solid var(--line-soft)", padding: "12px 10px", background: "#f3f4f6" }}>attributes</th>
                          <th style={{ textAlign: "left", border: "1px solid var(--line-soft)", padding: "12px 10px", background: "#f3f4f6" }}>내용 미리보기</th>
                        </tr>
                      </thead>
                      <tbody>
                        {vectorRecords.length ? (
                          vectorRecords.map((record) => (
                            <tr key={record.chunk_id}>
                              <td style={{ border: "1px solid var(--line-soft)", padding: "12px 10px", verticalAlign: "top", wordBreak: "break-word" }}>{record.chunk_id}</td>
                              <td style={{ border: "1px solid var(--line-soft)", padding: "12px 10px", verticalAlign: "top", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{record.heading_path || "—"}</td>
                              <td style={{ border: "1px solid var(--line-soft)", padding: "12px 10px", verticalAlign: "top", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{record.chunk_loc || "—"}</td>
                              <td style={{ border: "1px solid var(--line-soft)", padding: "12px 10px", verticalAlign: "top", whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.5, fontSize: 13 }}>
                                {formatAttributes(record.metadata)}
                              </td>
                              <td style={{ border: "1px solid var(--line-soft)", padding: "12px 10px", verticalAlign: "top", whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.6 }}>
                                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>
                                  {formatPreviewDebug(record)}
                                </div>
                                {renderPreviewLines(record.content_preview)}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={5} style={{ color: "var(--muted)", border: "1px solid var(--line-soft)", padding: "12px 10px", textAlign: "center" }}>
                              {vectorRecordsLoading ? "벡터 파싱 정보를 불러오는 중입니다." : "표시할 벡터 파싱 결과가 없습니다."}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
                    {vectorRecordsHasMore ? (
                      <Btn size="sm" variant="outline" onClick={() => void loadVectorRecords(false)} disabled={vectorRecordsLoading}>
                        {vectorRecordsLoading ? "불러오는 중..." : "다음"}
                      </Btn>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </CardBody>
          </Card>
          <Modal
            open={summaryOpen}
            title="참조 목차 구성"
            onClose={() => setSummaryOpen(false)}
            footer={<Btn onClick={() => setSummaryOpen(false)}>닫기</Btn>}
            width="680px"
          >
            <div style={{ display: "grid", gap: 14 }}>
              <div style={{ fontSize: 16, fontWeight: 400, color: "var(--muted)" }}>
                {selectedTemplateName}
              </div>
              <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.8, fontSize: 18 }}>
                {templateHeadingSummaryLine}
              </div>
            </div>
          </Modal>
          <Modal
            open={embeddingResultModalOpen}
            title="벡터 임베딩 실행 결과"
            onClose={() => setEmbeddingResultModalOpen(false)}
            footer={<Btn onClick={() => setEmbeddingResultModalOpen(false)}>확인</Btn>}
            width="560px"
          >
            <div style={{ display: "grid", gap: 12, lineHeight: 1.7 }}>
              <div>
                {embeddingResult?.preview_only ? "벡터 임베딩 테스트가 완료되었습니다." : "벡터 임베딩 실행이 완료되었습니다."}
              </div>
              {embeddingResult ? (
                <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {[
                    `파일ID: ${embeddingResult.file_id}`,
                    `파싱 segment 수: ${embeddingResult.parsed_segment_count}`,
                    `생성 chunk 수: ${embeddingResult.chunk_count}`,
                    embeddingResult.preview_only ? "DB 등록: 수행 안 함" : `등록 건수: ${embeddingResult.inserted_count}`,
                    `임베딩 모델: ${embeddingResult.embedding_model}`,
                  ].join("\n")}
                </div>
              ) : null}
            </div>
          </Modal>
          <Modal
            open={deleteConfirmOpen}
            title="RAG 파일 삭제"
            onClose={() => {
              if (!deleteLoading) setDeleteConfirmOpen(false)
            }}
            footer={(
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, width: "100%" }}>
                <Btn variant="danger" onClick={() => void handleDeleteDocument()} disabled={deleteLoading}>
                  {deleteLoading ? "삭제 중..." : "삭제실행"}
                </Btn>
                <Btn variant="outline" onClick={() => setDeleteConfirmOpen(false)} disabled={deleteLoading}>
                  취소
                </Btn>
              </div>
            )}
            width="760px"
          >
            <div style={{ display: "grid", gap: 14, lineHeight: 1.7 }}>
              <div>
                다음 RAG 파일이 삭제됩니다.
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, wordBreak: "keep-all", lineHeight: 1.5 }}>
                {data.item.doc_name}
              </div>
              {willDeleteVectors ? (
                <div style={{ color: "#991b1b" }}>
                  파일 삭제 시 Vector 데이터도 같이 삭제됩니다.
                </div>
              ) : null}
              <div style={{ color: "var(--muted)" }}>
                삭제 후에는 다시 복구할 수 없습니다.
              </div>
            </div>
          </Modal>
        </>
      )}
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 6 }}>{label}</div>
      <div>{value}</div>
    </div>
  )
}

function DetailEditor(
  {
    label,
    value,
    onChange,
    type = "text",
    step,
  }: {
    label: string
    value: string
    onChange: (value: string) => void
    type?: "text" | "number" | "date"
    step?: string
  }
) {
  return (
    <div>
      <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 6 }}>{label}</div>
      <input
        type={type}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%",
          height: 40,
          borderRadius: 10,
          border: "1px solid var(--line)",
          background: "#fff",
          padding: "0 12px",
          font: "inherit",
        }}
      />
    </div>
  )
}

function DetailWithAction({ label, value, action }: { label: string; value: string; action: ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 6 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {value ? <div>{value}</div> : null}
        {action}
      </div>
    </div>
  )
}
