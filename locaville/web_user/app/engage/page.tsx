"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { useCurrentUserVillage } from "@/components/CurrentUserVillageContext"
import { RefreshCw } from "lucide-react"
import { PageHeader } from "@/components/ui/PageHeader"
import { Card } from "@/components/ui/Card"
import { Btn } from "@/components/ui/Btn"
import { getEngageProjects, ENGAGE_PROJECT_CONNECTION_ERROR_MESSAGE } from "@/lib/engage-project-api"
import type { EngageProjectItem } from "@/lib/engage-project-types"

export default function EngagePage() {
  const { currentUserVillageInfo, loading: currentUserVillageLoading } = useCurrentUserVillage()
  const [items, setItems] = useState<EngageProjectItem[]>([])
  const [execYear, setExecYear] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const villageId = (currentUserVillageInfo?.village?.ville_id || "").trim()
  const villageName = (currentUserVillageInfo?.village?.ville_name || "").trim()
  const userNo = currentUserVillageInfo?.user?.user_no

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const data = await getEngageProjects()
      setItems(data.items || [])
      setExecYear(data.exec_year || null)
    } catch (e) {
      setError(e instanceof Error ? e.message : ENGAGE_PROJECT_CONNECTION_ERROR_MESSAGE)
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
        title="사업참여"
        sub={`공고된 사업 목록을 확인하고 마을의 참여 여부를 조회합니다.${villageName ? ` 현재 마을: ${villageName}` : ""}${villageId ? ` (${villageId})` : ""}${userNo ? ` · 사용자번호: ${userNo}` : ""}`}
        actions={
          <Btn
            icon={<RefreshCw size={16} />}
            onClick={() => void load()}
            disabled={loading || currentUserVillageLoading}
          >
            새로고침
          </Btn>
        }
      />

      {error && <div className="alert alert-error">오류: {error}</div>}

      <Card>
        {loading ? (
          <div className="loading">불러오는 중...</div>
        ) : items.length === 0 ? (
          <div className="tbl-empty muted" style={{ padding: 48 }}>
            조회된 사업이 없습니다.
          </div>
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>프로젝트 ID</th>
                  <th>사업명</th>
                  <th>프로젝트명</th>
                  <th>공고일</th>
                  <th>발주처</th>
                  <th>참여여부</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.prj_id}>
                    <td className="cell-mono">{item.prj_id}</td>
                    <td>{item.biz_name || <span className="muted">—</span>}</td>
                    <td className="cell-name">{item.prj_name || <span className="muted">—</span>}</td>
                    <td className="cell-mono">{item.post_date || <span className="muted">—</span>}</td>
                    <td>{item.issuer || <span className="muted">—</span>}</td>
                    <td>
                      {item.engage_yn === "참여중" ? (
                        <Link
                          href={`/engage/${encodeURIComponent(item.prj_id)}`}
                          className="btn btn-outline btn-sm"
                        >
                          참여 중
                        </Link>
                      ) : (
                        <Link
                          href={`/engage/${encodeURIComponent(item.prj_id)}`}
                          className="btn btn-primary btn-sm"
                        >
                          참여등록
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="muted" style={{ marginTop: 16, fontSize: 15 }}>
        {execYear ? `${execYear}년도 공고 사업만 조회합니다.` : "공고 사업을 조회합니다."}
      </div>
    </div>
  )
}
