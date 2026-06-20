"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { FolderPlus, RefreshCw } from "lucide-react"
import { PageHeader } from "@/components/ui/PageHeader"
import { Card } from "@/components/ui/Card"
import { Btn } from "@/components/ui/Btn"
import {
  getProjectAdminList,
  PROJECT_ADMIN_CONNECTION_ERROR_MESSAGE,
} from "@/lib/project-api"
import type { ProjectAdminItem } from "@/lib/project-types"

export default function ProjectPage() {
  const router = useRouter()
  const [items, setItems] = useState<ProjectAdminItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const data = await getProjectAdminList()
      setItems(data.items || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : PROJECT_ADMIN_CONNECTION_ERROR_MESSAGE)
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
        title="프로젝트 관리"
        sub="정부 친환경 사업 시책에 맞는 연도별 프로젝트를 계획하고 공고합니다."
        actions={
          <>
            <Link href="/project/new" className="btn btn-primary btn-md">
              <span className="btn-icon">
                <FolderPlus size={16} />
              </span>
              <span>프로젝트 등록</span>
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
            조회된 프로젝트가 없습니다.
          </div>
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>프로젝트 ID</th>
                  <th>사업명</th>
                  <th>프로젝트명</th>
                  <th>연도</th>
                  <th>공고일</th>
                  <th>발주처</th>
                  <th>활동 수</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.prj_id}
                    onClick={() => router.push(`/project/${encodeURIComponent(item.prj_id)}`)}
                    style={{ cursor: "pointer" }}
                  >
                    <td className="cell-mono">{item.prj_id}</td>
                    <td>{item.biz_name || <span className="muted">—</span>}</td>
                    <td className="cell-name">{item.prj_name || <span className="muted">—</span>}</td>
                    <td className="cell-mono">{item.exec_year || <span className="muted">—</span>}</td>
                    <td className="cell-mono">{item.post_date || <span className="muted">—</span>}</td>
                    <td>{item.issuer || <span className="muted">—</span>}</td>
                    <td>{item.activity_count}</td>
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
