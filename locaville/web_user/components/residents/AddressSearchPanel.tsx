"use client"

/**
 * 주민 추가/수정 모달 안의 주소 검색 패널.
 *
 * 입력한 키워드를 backend `/admin/address-search` 프록시로 보내고,
 * Kakao Local 응답을 그대로 카드 형태로 노출. 사용자가 한 건 클릭하면
 * 부모(`ResidentAddModal`)에게 `AddressItem` 으로 돌려줍니다.
 *
 * Kakao API key 는 backend `.env` 에서만 보관 (frontend 노출 금지).
 */
import { useState } from "react"

import type { AddressItem } from "@/lib/residents-types"

// 기존에 `import { type AddressItem } from "@/components/residents/AddressSearchPanel"`
// 로 가져가던 호출자를 위해 재-export.
export type { AddressItem } from "@/lib/residents-types"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000"

type BackendAddressItem = {
  id: string
  road_address: string
  jibun_address: string
  zip_code: string
}

export default function AddressSearchPanel({
  onClose,
  onSelectAddress,
}: {
  onClose: () => void
  onSelectAddress: (item: AddressItem) => void
}) {
  const [query, setQuery] = useState("")
  const [submittedQuery, setSubmittedQuery] = useState("")
  const [selectedId, setSelectedId] = useState("")
  const [results, setResults] = useState<AddressItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function runSearch(rawQuery: string) {
    const trimmed = rawQuery.trim()
    setSubmittedQuery(trimmed)
    if (!trimmed) {
      setResults([])
      setError("")
      return
    }
    setLoading(true)
    setError("")
    try {
      const url = `${API_BASE_URL}/admin/address-search?query=${encodeURIComponent(trimmed)}`
      const response = await fetch(url, { cache: "no-store" })
      if (!response.ok) {
        const text = await response.text()
        throw new Error(`주소 검색 실패 (${response.status}): ${text || response.statusText}`)
      }
      const data = (await response.json()) as { items?: BackendAddressItem[] }
      const mapped: AddressItem[] = (data.items || []).map((item) => ({
        id: item.id,
        roadAddress: item.road_address || item.jibun_address || "",
        jibunAddress: item.jibun_address || "",
        zipCode: item.zip_code || "",
      }))
      setResults(mapped)
    } catch (e) {
      setError(e instanceof Error ? e.message : "주소 검색에 실패했습니다.")
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  function handleSearch() {
    void runSearch(query)
  }

  function handleSelect(item: AddressItem) {
    setSelectedId(item.id)
    onSelectAddress(item)
  }

  const showEmpty = submittedQuery && !loading && results.length === 0 && !error

  return (
    <aside className="address-search-panel" aria-label="주소 검색 패널">
      <button type="button" className="address-search-close" onClick={onClose} aria-label="주소 검색 패널 닫기">
        ×
      </button>
      <h3>주소 검색</h3>
      <div className="address-search-controls">
        <input
          value={query}
          placeholder="예) 판교역로 235, 삼평동 681, 고흥"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") handleSearch()
          }}
        />
        <button type="button" onClick={handleSearch} disabled={loading}>
          {loading ? "검색 중..." : "검색"}
        </button>
      </div>
      <p className="address-search-help">도로명, 지번, 건물명으로 검색할 수 있습니다.</p>

      <div className="address-search-results" aria-live="polite">
        {!submittedQuery ? (
          <p className="address-search-message">검색어를 입력해주세요.</p>
        ) : loading ? (
          <p className="address-search-message">검색 중...</p>
        ) : error ? (
          <p className="address-search-message" style={{ color: "#c1442a" }}>{error}</p>
        ) : showEmpty ? (
          <p className="address-search-message">검색 결과가 없습니다.</p>
        ) : (
          results.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`address-result-card${selectedId === item.id ? " address-result-card-selected" : ""}`}
              onClick={() => handleSelect(item)}
            >
              {item.zipCode ? <span className="address-result-zip">[{item.zipCode}]</span> : null}
              <span>
                <strong>도로명:</strong> {item.roadAddress || "—"}
              </span>
              <span>
                <strong>지번:</strong> {item.jibunAddress || "—"}
              </span>
            </button>
          ))
        )}
      </div>
    </aside>
  )
}
