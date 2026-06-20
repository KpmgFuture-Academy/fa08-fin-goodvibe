"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { MapPinned, RefreshCw } from "lucide-react"
import { PageHeader } from "@/components/ui/PageHeader"
import { Card } from "@/components/ui/Card"
import { Btn } from "@/components/ui/Btn"
import {
  getVillageList,
  VILLAGE_CONNECTION_ERROR_MESSAGE,
} from "@/lib/village-api"
import type { VillageItem } from "@/lib/village-types"

export default function VillagePage() {
  const router = useRouter()
  const [items, setItems] = useState<VillageItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const data = await getVillageList()
      setItems(data.items || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : VILLAGE_CONNECTION_ERROR_MESSAGE)
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
        title="마을관리"
        sub="마을 기본 정보와 단체, 농가 현황을 한 번에 확인합니다."
        actions={
          <Btn icon={<RefreshCw size={16} />} onClick={() => void load()} disabled={loading}>
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
            조회된 마을이 없습니다.
          </div>
        ) : (
          <div className="table-wrap">
            <table className="tbl tbl-clickable">
              <thead>
                <tr>
                  <th>마을ID</th>
                  <th>마을명</th>
                  <th>마을주소</th>
                  <th>마을대표명</th>
                  <th>주민수</th>
                  <th>단체수</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.ville_id}
                    onClick={() => router.push(`/village/${encodeURIComponent(item.ville_id)}`)}
                  >
                    <td className="cell-mono">{item.ville_id}</td>
                    <td className="cell-name">
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <MapPinned size={16} color="var(--accent)" />
                        <span>{item.ville_name || <span className="muted">—</span>}</span>
                      </div>
                    </td>
                    <td>{item.addr_1 || <span className="muted">—</span>}</td>
                    <td>{item.chief_name || <span className="muted">—</span>}</td>
                    <td>{item.resident_count ?? 0}</td>
                    <td>{item.group_count ?? 0}</td>
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
