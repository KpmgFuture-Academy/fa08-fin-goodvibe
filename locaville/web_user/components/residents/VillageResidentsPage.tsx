"use client"

/**
 * 마을주민 화면 (`/residents`) 의 컨테이너.
 *
 * - `getAdminSummary` + `getAdminTodoStatus` 를 합쳐 농가 목록을 만들고
 *   sunnypark `Resident` 타입으로 어댑팅 (`buildResidentsFromBackend`).
 * - 한 page 안에서 목록 ↔ 상세 SPA 전환 (`selectedResident` 가 있으면
 *   `ResidentDetailPage` 로 교체 렌더).
 * - 추가/수정 모달은 현재 backend write endpoint 가 없어 로컬 state 만 변경.
 *
 * backend 호출 실패 / 응답 비어 있음 → `MOCK_RESIDENTS` fallback + 안내 배너.
 */
import { useCallback, useEffect, useMemo, useState } from "react"
import { Plus, RefreshCw, Search } from "lucide-react"

import ResidentAddModal from "@/components/residents/ResidentAddModal"
import ResidentDetailPage from "@/components/residents/ResidentDetailPage"
import ResidentListTable, { type Resident } from "@/components/residents/ResidentListTable"
import { Btn } from "@/components/ui/Btn"
import { Card } from "@/components/ui/Card"
import { PageHeader } from "@/components/ui/PageHeader"
import {
  BACKEND_CONNECTION_ERROR_MESSAGE,
  createResident,
  getAdminSummary,
  getAdminTodoStatus,
  updateResident,
} from "@/lib/admin-api"
import type { AdminSummary, AdminTodoStatusItem, FarmerDiarySummary } from "@/lib/admin-types"
import { getProjectsByFarmer } from "@/lib/ville-project-api"

/**
 * sunnypark mock 데이터 — backend 가 비어있거나 호출 실패 시 fallback.
 * 가입대기/초대발송 흐름은 DB 컬럼이 아직 없어 mock 만 보임.
 */
const MOCK_RESIDENTS: Resident[] = [
  {
    id: 1001,
    name: "김철수",
    phone: "010-3333-4444",
    signupStatus: "가입대기",
    statusAction: "초대발송",
    project: "저탄소 농업프로그램",
    group: "aa작목반",
  },
  {
    id: 1002,
    name: "이장수",
    phone: "010-4444-5555",
    signupStatus: "초대발송",
    project: "저탄소 농산물인증",
    group: "bb영농조합",
  },
  {
    id: 1003,
    name: "김기수",
    phone: "010-3333-7372",
    signupStatus: "초대발송",
    statusAction: "재발송",
    project: "저탄소 농업프로그램",
    group: "aa작목반",
  },
]

/**
 * backend 의 농가 요약 + todo-status 를 합쳐 sunnypark Resident 형태로 변환.
 * - name: user_name > amo_name 우선
 * - phone: DB 미보유 → "—"
 * - signupStatus: user_no + user_name 둘 다 있으면 "가입완료", 아니면 "가입대기"
 * - project: todo-status 에서 농가별 첫 prj_name (없으면 빈 문자열)
 * - missingItems: todo-status 의 missing_evidence_types 길이 합
 * - recentRecord: latest_work_date
 */
function buildResidentsFromBackend(
  summary: AdminSummary | null,
  todoItems: AdminTodoStatusItem[],
): Resident[] {
  if (!summary) return []
  // todoItems 의 farmer_id 와 amo_regno 가 다를 수 있어 두 키 모두로 색인.
  // residents 매핑 시 amoRegno → farmer_id 순으로 fallback lookup.
  const projectByFarmer = new Map<string, string>()
  const groupByFarmer = new Map<string, string>()
  const missingByFarmer = new Map<string, number>()
  for (const item of todoItems) {
    const keys = [item.farmer_id, item.amo_regno].filter((k): k is string => !!k && k.length > 0)
    if (keys.length === 0) continue
    const projectName = item.prj_name || ""
    const groupName = item.group_name || ""
    const missingDelta = item.missing_evidence_types?.length || 0
    for (const key of keys) {
      if (projectName && !projectByFarmer.has(key)) projectByFarmer.set(key, projectName)
      if (groupName && !groupByFarmer.has(key)) groupByFarmer.set(key, groupName)
      missingByFarmer.set(key, (missingByFarmer.get(key) || 0) + missingDelta)
    }
  }

  return summary.diaries_by_farmer.map((farmer: FarmerDiarySummary, index: number): Resident => {
    const amoRegno = farmer.amo_regno || farmer.farmer_id
    const name = farmer.user_name || farmer.amo_name || farmer.farmer_name || amoRegno
    // user_master.status_cd 기반 가입 상태 판단:
    //   ACT  → 가입완료 (실제 로그인 한 사용자)
    //   INV  → 초대발송 (이장님이 초대 발송한 상태, 가입은 아직)
    //   PEND → 가입대기 (이장님이 등록만 하고 초대도 안 한 상태)
    //   빈값 → 보수적으로 가입완료 (시드 호환 — status_cd 없는 옛 row)
    const status = (farmer.status_cd || "").toUpperCase()
    let signupStatus: "가입완료" | "초대발송" | "가입대기"
    let statusAction: "초대발송" | "재발송" | undefined
    if (status === "INV") {
      signupStatus = "초대발송"
      statusAction = "재발송"
    } else if (status === "PEND") {
      signupStatus = "가입대기"
      statusAction = "초대발송"
    } else {
      signupStatus = "가입완료"
      statusAction = undefined
    }
    // 두 식별자 (amo_regno, farmer_id) 로 lookup — 둘 중 어느 키로 색인됐든 매칭.
    const lookupKeys = [amoRegno, farmer.farmer_id].filter((k): k is string => !!k && k.length > 0)
    const project =
      lookupKeys.map((k) => projectByFarmer.get(k)).find((v) => !!v) || ""
    const group =
      lookupKeys.map((k) => groupByFarmer.get(k)).find((v) => !!v) || ""
    const missing =
      lookupKeys.map((k) => missingByFarmer.get(k)).find((v) => v !== undefined) || 0
    return {
      id: index + 1,
      name,
      phone: farmer.phone || "—",
      signupStatus,
      statusAction,
      project,
      group,
      recentRecord: farmer.latest_work_date || "",
      missingItems: missing,
      amoRegno,
      villeName: farmer.ville_name,
      address: farmer.address || "",
      addressDetail: farmer.address_detail || "",
    }
  })
}

export default function VillageResidentsPage() {
  const [residents, setResidents] = useState<Resident[]>([])
  const [searchInput, setSearchInput] = useState("")
  const [searchKeyword, setSearchKeyword] = useState("")
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [selectedResident, setSelectedResident] = useState<Resident | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [usingFallback, setUsingFallback] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const [summary, todoItems] = await Promise.all([getAdminSummary(), getAdminTodoStatus({})])
      const built = buildResidentsFromBackend(summary, todoItems)
      if (built.length === 0) {
        setResidents(MOCK_RESIDENTS)
        setUsingFallback(true)
        return
      }
      // 즉시 한 번 그림 — 참여사업/단체는 미지정 상태로 보임. 그 다음 ville-project 로 보강.
      setResidents(built)
      setUsingFallback(false)

      // 참여사업/단체 — todoItems 만으로는 빈 칸이 자주 생겨 ResidentDetailPage 가 쓰는
      // /ville-project?farmer_id= 를 농가별 병렬 fetch. 각 농가 1건 → 9명 ≈ 9 요청 (시연용 OK).
      const enriched = await Promise.all(
        built.map(async (r) => {
          const lookupId = r.amoRegno || ""
          if (!lookupId) return r
          try {
            const projects = await getProjectsByFarmer(lookupId)
            const projectNames = Array.from(
              new Set(projects.map((p) => p.prj_name).filter((s): s is string => !!s && s.length > 0)),
            )
            const groupNames = Array.from(
              new Set(projects.map((p) => p.group_name || "").filter((s) => s.length > 0)),
            )
            return {
              ...r,
              project: projectNames[0] || r.project || "",
              group: groupNames[0] || r.group || "",
              projects: projectNames,
              groups: groupNames,
            }
          } catch {
            return r
          }
        }),
      )
      setResidents(enriched)
    } catch (e) {
      setError(e instanceof Error ? e.message : BACKEND_CONNECTION_ERROR_MESSAGE)
      setResidents(MOCK_RESIDENTS)
      setUsingFallback(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    function showList() {
      setSelectedResident(null)
    }

    window.addEventListener("locaville:show-resident-list", showList)
    return () => window.removeEventListener("locaville:show-resident-list", showList)
  }, [])

  const filteredResidents = useMemo(() => {
    const keyword = searchKeyword.trim()
    if (!keyword) return residents
    return residents.filter((resident) => resident.name.includes(keyword))
  }, [residents, searchKeyword])

  const headerStats = useMemo(() => {
    const total = residents.length
    const waiting = residents.filter((r) => r.signupStatus !== "가입완료").length
    return { total, waiting }
  }, [residents])

  function handleSearch() {
    setSearchKeyword(searchInput)
  }

  async function handleAddResident(resident: Omit<Resident, "id" | "signupStatus" | "statusAction">) {
    // backend POST /admin/residents → DB INSERT (한 트랜잭션 안에 user_master + amo_family
    // + parcel + group_member). 성공하면 list 새로고침으로 즉시 반영.
    try {
      await createResident({
        name: resident.name,
        phone: resident.phone,
        address: resident.address,
        addressDetail: resident.addressDetail,
        parcelCrops: resident.parcelCrops,
        // 단체 이름 → group_no 매핑은 아직 frontend 에 없음 → 일단 보내지 않음.
        // 향후 ResidentAddModal 이 dropdown 으로 group_no 도 같이 보내면 추가.
      })
      await load()
    } catch (e) {
      const msg = e instanceof Error ? e.message : "주민 등록 실패"
      window.alert(`주민 등록 실패: ${msg}`)
    }
  }

  // 수정 흐름은 상세 페이지(ResidentDetailPage) 내부에서 처리되므로 부모의 update 핸들러는 제거.

  if (selectedResident) {
    return <ResidentDetailPage resident={selectedResident} onBack={() => setSelectedResident(null)} />
  }

  return (
    <div className="resident-page">
      <PageHeader
        title={`마을주민 (전체: ${headerStats.total}명, 미가입 ${headerStats.waiting}명)`}
        actions={
          <>
            <Btn variant="outline" icon={<RefreshCw size={16} />} onClick={() => void load()} disabled={loading}>
              새로고침
            </Btn>
            <Btn variant="primary" icon={<Plus size={16} />} onClick={() => setAddModalOpen(true)}>
              주민추가
            </Btn>
          </>
        }
      />

      {error && (
        <div className="alert alert-error" style={{ marginBottom: 12 }}>
          backend 연결 실패 — 샘플 데이터 표시 중. ({error})
        </div>
      )}

      <Card className="resident-list-card">
        <section className="resident-notice-block" aria-label="주요 알림 정보">
          <h2>주요 알림 정보</h2>
          {usingFallback ? (
            <>
              <p>실제 농가 데이터가 비어 있어 샘플 명단을 표시 중입니다.</p>
              <p>backend 에 농가 등록 후 새로고침하면 실제 명단이 나타납니다.</p>
            </>
          ) : (
            <>
              <p>
                전체 {headerStats.total}명 중 {headerStats.waiting}명이 아직 가입하지 않았습니다.
              </p>
              <p>가입 안내 발송 기능은 추후 연동 예정입니다.</p>
            </>
          )}
        </section>

        <div className="resident-search-bar" role="search">
          <Search size={18} className="muted" />
          <input
            aria-label="이름 검색"
            placeholder="이름 검색"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") handleSearch()
            }}
          />
          <Btn variant="secondary" onClick={handleSearch}>
            검색
          </Btn>
        </div>

        {loading ? (
          <div className="loading" style={{ padding: 32 }}>
            농가 목록을 불러오는 중...
          </div>
        ) : (
          <ResidentListTable
            residents={filteredResidents}
            onSelectDetail={setSelectedResident}
            onInvited={() => void load()}
          />
        )}
      </Card>

      <ResidentAddModal
        open={addModalOpen}
        mode="add"
        onClose={() => setAddModalOpen(false)}
        onSubmit={handleAddResident}
      />
      {/* 수정 모달은 상세 페이지 내부에서 자체 처리 (ResidentDetailPage) — 부모 중복 마운트 제거. */}
    </div>
  )
}
