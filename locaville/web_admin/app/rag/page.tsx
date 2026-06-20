"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { DatabaseZap, RefreshCw } from "lucide-react"
import { PageHeader } from "@/components/ui/PageHeader"
import { Card } from "@/components/ui/Card"
import { Btn } from "@/components/ui/Btn"
import { getRagFiles, getRagOriginalFileUrl, RAG_ADMIN_CONNECTION_ERROR_MESSAGE } from "@/lib/rag-api"
import type { RagFileItem } from "@/lib/rag-types"

export default function RagPage() {
  const router = useRouter()
  const [items, setItems] = useState<RagFileItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const data = await getRagFiles()
      setItems(data.items || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : RAG_ADMIN_CONNECTION_ERROR_MESSAGE)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div>
      <PageHeader
        title="RAG 관리"
        sub="문서 템플릿 기반 pre-parse와 벡터 임베딩 등록 상태를 관리합니다."
        actions={
          <>
            <Link href="/rag/new" className="btn btn-primary btn-md">
              <span className="btn-icon">
                <DatabaseZap size={16} />
              </span>
              <span>RAG 파일 등록</span>
            </Link>
            <Btn icon={<RefreshCw size={16} />} onClick={() => void load()} disabled={loading}>
              새로고침
            </Btn>
          </>
        }
      />

      {error && <div className="alert alert-error">오류: {error}</div>}

      <Card>
        {loading ? (
          <div className="loading">불러오는 중...</div>
        ) : items.length === 0 ? (
          <div className="tbl-empty muted" style={{ padding: 48 }}>
            등록된 RAG 문서가 없습니다.
          </div>
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>문서명</th>
                  <th>문서구분</th>
                  <th>문서담당자/기관</th>
                  <th>벡터등록여부</th>
                  <th>원본문서</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.file_id}
                    onClick={() => router.push(`/rag/${encodeURIComponent(item.file_id)}`)}
                    style={{ cursor: "pointer" }}
                  >
                    <td className="cell-name">{item.doc_name || <span className="muted">—</span>}</td>
                    <td>{item.doc_cat || <span className="muted">—</span>}</td>
                    <td>
                      {item.doc_manager || <span className="muted">—</span>}
                    </td>
                    <td>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          minWidth: 72,
                          justifyContent: "center",
                          padding: "6px 10px",
                          borderRadius: 999,
                          background: item.embedding_yn === "Y" ? "rgba(22,163,74,0.12)" : "rgba(107,114,128,0.12)",
                          color: item.embedding_yn === "Y" ? "#166534" : "#4b5563",
                          fontWeight: 700,
                          fontSize: 13,
                        }}
                      >
                        {item.embedding_yn === "Y" ? "등록" : "미등록"}
                      </span>
                    </td>
                    <td>
                      <Btn
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation()
                          window.open(getRagOriginalFileUrl(item.file_id), "_blank", "noopener,noreferrer")
                        }}
                      >
                        원본문서 다운로드
                      </Btn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
