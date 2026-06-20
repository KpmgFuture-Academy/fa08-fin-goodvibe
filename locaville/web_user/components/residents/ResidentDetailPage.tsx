"use client"

/**
 * 한 농가의 상세 페이지.
 *
 * 부모(`VillageResidentsPage`)에서 `selectedResident` 가 들어오면 SPA 전환으로 렌더.
 *
 * 부모에서 fetch 해서 두 sub-table 이 공유하는 데이터:
 *   - `villeProjects` (`/ville-project?farmer_id=`) → 참여사업·참여단체 카드 + 필터 옵션
 *   - `logs` (`listAdminDiaries({farmer_id})`) → 영농일지 + 참여사업/단체 탭 표
 *   - `fetchedParcelCrops` (`/farmer/{id}/parcels`) → 필지/작물 정보 카드
 *
 * 두 sub-table (`FarmingLogTable`, `ParticipationLogTable`) 은 fetch 안 하고 props
 * 만 받습니다 (영농일지가 한 번만 호출되도록).
 *
 * 영농일지에 group 정보가 없어 참여단체 탭의 group_name 은 농가가 한 단체에만
 * 속할 때만 표시됩니다 (DBA 요청 사항: `journal.group_no` 컬럼 추가 필요).
 */
import { useEffect, useMemo, useState } from "react"
import { ArrowLeft, Pencil } from "lucide-react"

import DateRangePickerModal, { formatDateToDot } from "@/components/residents/DateRangePickerModal"
import FarmingLogDetailModal from "@/components/residents/FarmingLogDetailModal"
import ResidentAddModal from "@/components/residents/ResidentAddModal"
import { Btn } from "@/components/ui/Btn"
import { Card } from "@/components/ui/Card"
import { PageHeader } from "@/components/ui/PageHeader"
import { listAdminDiaries } from "@/lib/admin-api"
import type { AdminDiaryItem } from "@/lib/admin-types"
import { getFarmerParcels, parcelDisplayName, usageToCrop } from "@/lib/farmer-api"
import type { FarmingLog, ParcelCrop, Resident } from "@/lib/residents-types"
import { getProjectsByFarmer, type VilleProject } from "@/lib/ville-project-api"

// 다른 컴포넌트가 `@/components/residents/ResidentDetailPage` 에서 FarmingLog
// 를 가져가던 기존 import 를 유지하기 위해 재-export.
export type { FarmingLog } from "@/lib/residents-types"

type DetailTab = "journal" | "projects" | "groups"

// 농가의 사업/단체 fetch 실패 시 화면이 비어 보이지 않게 쓰는 fallback.
// 실제 데이터가 들어오면 즉시 교체됨.
const DEFAULT_PROJECTS = ["저탄소 농업 프로그램", "저탄소 농산물 인증"]
const DEFAULT_GROUPS = ["공 작목반", "A영농조합 법인"]
const DEFAULT_PARCEL_CROPS: ParcelCrop[] = [
  { parcelName: "앞논", crop: "벼" },
  { parcelName: "고개밭", crop: "콩" },
]
// 기간 필터 기본값 — 최근 한 달.
const TODAY = new Date()
const INITIAL_START_DATE = new Date(TODAY.getFullYear(), TODAY.getMonth() - 1, TODAY.getDate())
const INITIAL_END_DATE = new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate())
const PARTICIPATION_START_DATE = new Date(TODAY.getFullYear(), TODAY.getMonth() - 3, 1)
const PARTICIPATION_END_DATE = new Date(TODAY.getFullYear(), TODAY.getMonth() + 1, 0)

// 영농일지 fetch 실패 시 fallback (실제 데이터가 들어오면 교체).
const FALLBACK_FARMING_LOGS: FarmingLog[] = [
  {
    id: "log-1",
    datetime: "2026.07.15 15:44:55",
    taskName: "중간 물떼기 2차",
    photoCount: 0,
    isMissing: true,
    author: "김철수",
  },
  {
    id: "log-2",
    datetime: "2026.06.30 11:55:11",
    taskName: "중간물떼기 1차",
    photoCount: 1,
    projectName: "저탄소 농업 프로그램",
    hasDetail: true,
    author: "김철수",
  },
  {
    id: "log-3",
    datetime: "2026.06.01 14:55:22",
    taskName: "모내기",
    farmerNote: "모내기했어요.",
    photoCount: 1,
    projectName: "저탄소 농업 프로그램",
    hasDetail: true,
    author: "김철수",
  },
  {
    id: "log-4",
    datetime: "2026.05.30 11:22:33",
    farmerNote: "콩심었다",
    photoCount: 0,
    hasDetail: true,
    author: "김철수",
  },
  {
    id: "log-5",
    datetime: "2026.05.30 06:55:11",
    taskName: "완효성 비료 뿌리세요",
    farmerNote: "밭에 비료 뿌렸다",
    photoCount: 2,
    projectName: "저탄소 농산물 인증",
    hasDetail: true,
    author: "김철수",
  },
  {
    id: "log-6",
    datetime: "2026.05.20 09:10:00",
    taskName: "논둑 정리",
    farmerNote: "논둑 정리했다",
    photoCount: 0,
    projectName: "저탄소 농업 프로그램",
    hasDetail: true,
    author: "김철수",
  },
]

function normalizeDate(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function parseLogDate(datetime: string): Date {
  const [datePart] = datetime.split(" ")
  const [year, month, day] = datePart.split(".").map(Number)
  return new Date(year, month - 1, day)
}

function isLogInRange(logDate: Date, startDate: Date, endDate: Date): boolean {
  const target = normalizeDate(logDate).getTime()
  return target >= normalizeDate(startDate).getTime() && target <= normalizeDate(endDate).getTime()
}

/**
 * backend AdminDiaryItem → 화면에서 쓰는 FarmingLog 형식.
 * - datetime: "YYYY.MM.DD HH:mm:ss" (created_at 우선, 없으면 work_date)
 * - taskName: work_stage_detail > work_stage
 * - photoCount: evidence_count (없으면 linked_evidence_ids 길이)
 * - isMissing: status === "pending" 이고 photoCount=0 인 경우
 */
function diaryToFarmingLog(item: AdminDiaryItem): FarmingLog {
  const photoCount = item.evidence_count ?? item.linked_evidence_ids?.length ?? 0
  let datetime = ""
  const stamp = item.created_at || ""
  if (stamp) {
    const d = new Date(stamp)
    if (!Number.isNaN(d.getTime())) {
      datetime = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`
    }
  }
  if (!datetime) {
    datetime = (item.work_date || "").replace(/-/g, ".") + " 00:00:00"
  }
  const isMissing = (item.status || "").toLowerCase() === "pending" && photoCount === 0
  return {
    id: item.diary_id,
    datetime,
    taskName: item.work_stage_detail || item.work_stage || "",
    farmerNote: item.work_detail || "",
    photoCount,
    projectName: item.prj_name || "",
    isMissing,
    hasDetail: true,
    author: item.farmer_name || item.amo_name || item.user_name || "",
    evidenceIds: item.linked_evidence_ids || [],
    fieldAddress: item.field_address || "",
    parcelNo: item.parcel_no != null ? String(item.parcel_no) : "",
    // backend 가 prj_journal.group_no → ville_group 으로 채워주는 실제 단체명.
    // 비어 있으면 ParticipationLogTable 의 primaryGroup fallback 으로 보강.
    groupName: item.group_name || "",
  }
}

export default function ResidentDetailPage({ resident, onBack }: { resident: Resident; onBack: () => void }) {
  const [activeTab, setActiveTab] = useState<DetailTab>("journal")
  const [detailResident, setDetailResident] = useState<Resident>(resident)
  const [editOpen, setEditOpen] = useState(false)
  const [fetchedParcelCrops, setFetchedParcelCrops] = useState<ParcelCrop[] | null>(null)
  const [villeProjects, setVilleProjects] = useState<VilleProject[]>([])
  const [logs, setLogs] = useState<FarmingLog[]>(FALLBACK_FARMING_LOGS)
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsError, setLogsError] = useState("")

  // 농가가 참여중인 사업 + 단체 fetch
  useEffect(() => {
    if (!detailResident.amoRegno) {
      setVilleProjects([])
      return
    }
    let cancelled = false
    void getProjectsByFarmer(detailResident.amoRegno)
      .then((items) => {
        if (!cancelled) setVilleProjects(items)
      })
      .catch(() => {
        if (!cancelled) setVilleProjects([])
      })
    return () => {
      cancelled = true
    }
  }, [detailResident.amoRegno])

  // 농가 영농일지 fetch — 두 sub-table 이 같은 데이터 공유
  useEffect(() => {
    if (!detailResident.amoRegno) {
      setLogs(FALLBACK_FARMING_LOGS)
      return
    }
    let cancelled = false
    setLogsLoading(true)
    setLogsError("")
    void listAdminDiaries({ farmer_id: detailResident.amoRegno })
      .then((items: AdminDiaryItem[]) => {
        if (cancelled) return
        setLogs(items.length > 0 ? items.map(diaryToFarmingLog) : [])
      })
      .catch((e) => {
        if (cancelled) return
        setLogsError(e instanceof Error ? e.message : "영농일지를 불러오지 못했습니다.")
        setLogs(FALLBACK_FARMING_LOGS)
      })
      .finally(() => {
        if (!cancelled) setLogsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [detailResident.amoRegno])

  // amoRegno 있으면 실제 필지 fetch — 실패하면 sunnypark default 유지
  useEffect(() => {
    if (!detailResident.amoRegno) {
      setFetchedParcelCrops(null)
      return
    }
    let cancelled = false
    void getFarmerParcels(detailResident.amoRegno)
      .then((parcels) => {
        if (cancelled) return
        const mapped: ParcelCrop[] = parcels.map((p) => ({
          parcelName: parcelDisplayName(p),
          // parcel 전체 전달 → backend usage_label 우선 사용 (없으면 raw 코드 fallback dict).
          crop: usageToCrop(p),
        }))
        setFetchedParcelCrops(mapped)
      })
      .catch(() => {
        if (!cancelled) setFetchedParcelCrops(null)
      })
    return () => {
      cancelled = true
    }
  }, [detailResident.amoRegno])

  const projects = useMemo(() => {
    if (villeProjects.length > 0) {
      return Array.from(new Set(villeProjects.map((p) => p.prj_name).filter(Boolean)))
    }
    if (detailResident.projects?.length) return detailResident.projects
    return DEFAULT_PROJECTS
  }, [villeProjects, detailResident.projects])

  const groups = useMemo(() => {
    if (villeProjects.length > 0) {
      const names = villeProjects
        .map((p) => p.group_name || "")
        .filter((name): name is string => name.length > 0)
      const distinct = Array.from(new Set(names))
      if (distinct.length > 0) return distinct
    }
    if (detailResident.groups?.length) return detailResident.groups
    return DEFAULT_GROUPS
  }, [villeProjects, detailResident.groups])

  const parcelCrops = useMemo(() => {
    if (fetchedParcelCrops && fetchedParcelCrops.length > 0) return fetchedParcelCrops
    if (detailResident.parcelCrops?.length) return detailResident.parcelCrops
    if (detailResident.parcels?.length) {
      return detailResident.parcels.map((parcelName, index) => ({
        parcelName,
        crop: detailResident.crops?.[index] || detailResident.crop || "",
      }))
    }
    return DEFAULT_PARCEL_CROPS
  }, [
    fetchedParcelCrops,
    detailResident.crop,
    detailResident.crops,
    detailResident.parcelCrops,
    detailResident.parcels,
  ])

  const addressText = (() => {
    const a = (detailResident.address || "").trim()
    const d = (detailResident.addressDetail || "").trim()
    const joined = [a, d].filter(Boolean).join(" ")
    return joined || "—"
  })()
  const parcelCropText = parcelCrops
    .map((item) => (item.crop ? `${item.parcelName}/${item.crop}` : item.parcelName))
    .join(", ")

  function handleUpdateResident(updatedResident: Omit<Resident, "id" | "signupStatus" | "statusAction">) {
    setDetailResident((prev) => ({
      ...prev,
      ...updatedResident,
    }))
  }

  return (
    <div className="resident-page resident-detail-page">
      <PageHeader
        title={`${detailResident.name} 상세 (${detailResident.signupStatus})`}
        actions={
          <Btn variant="outline" icon={<ArrowLeft size={16} />} onClick={onBack}>
            목록으로
          </Btn>
        }
      />

      <section className="resident-detail-card-grid" aria-label="주민 상세 요약">
        <Card className="resident-detail-card">
          <div className="resident-detail-card-head">
            <h2>주민정보</h2>
            <Btn variant="outline" size="sm" icon={<Pencil size={14} />} onClick={() => setEditOpen(true)}>
              수정
            </Btn>
          </div>
          <dl className="resident-info-list">
            <div>
              <dt>휴대폰번호</dt>
              <dd>{detailResident.phone && detailResident.phone !== "—" ? detailResident.phone : "—"}</dd>
            </div>
            <div>
              <dt>집주소</dt>
              <dd>{addressText}</dd>
            </div>
            <div>
              <dt>필지/작물 정보</dt>
              <dd>{parcelCropText || "—"}</dd>
            </div>
          </dl>
        </Card>

        <Card className="resident-detail-card">
          <h2>참여사업</h2>
          <p>{projects.length}개의 사업 참여중입니다.</p>
          <ul>
            {projects.map((project) => (
              <li key={project}>{project}</li>
            ))}
          </ul>
        </Card>

        <Card className="resident-detail-card">
          <h2>참여단체</h2>
          <p>{groups.length}개의 단체에 참여중입니다.</p>
          <ul>
            {groups.map((group) => (
              <li key={group}>{group}</li>
            ))}
          </ul>
        </Card>
      </section>

      <Card className="resident-detail-tabs-card">
        <div className="resident-detail-tabs" role="tablist" aria-label="주민 상세 탭">
          <button
            type="button"
            className={activeTab === "journal" ? "resident-detail-tab active" : "resident-detail-tab"}
            onClick={() => setActiveTab("journal")}
          >
            영농일지
          </button>
          <button
            type="button"
            className={activeTab === "projects" ? "resident-detail-tab active" : "resident-detail-tab"}
            onClick={() => setActiveTab("projects")}
          >
            참여사업
          </button>
          <button
            type="button"
            className={activeTab === "groups" ? "resident-detail-tab active" : "resident-detail-tab"}
            onClick={() => setActiveTab("groups")}
          >
            참여단체
          </button>
        </div>

        {activeTab === "journal" ? (
          <FarmingLogTable
            resident={detailResident}
            logs={logs}
            loading={logsLoading}
            error={logsError}
          />
        ) : null}
        {activeTab === "projects" ? (
          <ParticipationTable mode="projects" villeProjects={villeProjects} />
        ) : null}
        {activeTab === "groups" ? (
          <ParticipationTable mode="groups" villeProjects={villeProjects} />
        ) : null}
      </Card>

      <ResidentAddModal
        open={editOpen}
        mode="edit"
        initialResident={detailResident}
        onClose={() => setEditOpen(false)}
        onSubmit={handleUpdateResident}
      />
    </div>
  )
}

/** 참여사업·참여단체 탭 — villeProjects (농가의 사업 참여 row) 를 사업 또는 단체 단위로 dedup 해 표시.
 *  영농일지 row 와는 별개 — 일자/주민기록/사진 컬럼 노출하지 않음. */
function ParticipationTable({
  mode,
  villeProjects,
}: {
  mode: "projects" | "groups"
  villeProjects: VilleProject[]
}) {
  if (mode === "projects") {
    // 사업명 기준 dedup. 같은 prj_id 의 단체들은 chip 으로 묶어 표시.
    const byPrj = new Map<string, { prj_id: string; prj_name: string; biz_name?: string; exec_year?: number; groupNames: Set<string> }>()
    for (const p of villeProjects) {
      const key = p.prj_id || p.prj_name
      if (!key) continue
      const slot = byPrj.get(key) || {
        prj_id: p.prj_id,
        prj_name: p.prj_name || "—",
        biz_name: p.biz_name,
        exec_year: p.exec_year,
        groupNames: new Set<string>(),
      }
      if (p.group_name) slot.groupNames.add(p.group_name)
      byPrj.set(key, slot)
    }
    const rows = Array.from(byPrj.values())
    return (
      <div className="resident-detail-table-wrap">
        <table className="resident-detail-table">
          <thead>
            <tr>
              <th>사업명</th>
              <th>사업 종류</th>
              <th>연도</th>
              <th>소속 단체</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="resident-detail-empty" colSpan={4}>
                  참여중인 사업이 없습니다.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.prj_id || r.prj_name}>
                  <td>{r.prj_name}</td>
                  <td>{r.biz_name || ""}</td>
                  <td>{r.exec_year || ""}</td>
                  <td>{Array.from(r.groupNames).join(", ") || ""}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    )
  }

  // groups mode — 단체명 기준 dedup. 한 단체가 여러 사업에 속할 수 있어 사업명 chip 으로 묶음.
  const byGroup = new Map<string, { group_no?: number | null; group_name: string; prjNames: Set<string> }>()
  for (const p of villeProjects) {
    const key = String(p.group_no ?? p.group_name ?? "")
    if (!key || !p.group_name) continue
    const slot = byGroup.get(key) || {
      group_no: p.group_no,
      group_name: p.group_name,
      prjNames: new Set<string>(),
    }
    if (p.prj_name) slot.prjNames.add(p.prj_name)
    byGroup.set(key, slot)
  }
  const rows = Array.from(byGroup.values())
  return (
    <div className="resident-detail-table-wrap">
      <table className="resident-detail-table">
        <thead>
          <tr>
            <th>단체명</th>
            <th>참여 사업</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="resident-detail-empty" colSpan={2}>
                참여중인 단체가 없습니다.
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={String(r.group_no ?? r.group_name)}>
                <td>{r.group_name}</td>
                <td>{Array.from(r.prjNames).join(", ") || ""}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

function FarmingLogTable({
  resident,
  logs,
  loading,
  error,
}: {
  resident: Resident
  logs: FarmingLog[]
  loading: boolean
  error: string
}) {
  const [periodStartDate, setPeriodStartDate] = useState(INITIAL_START_DATE)
  const [periodEndDate, setPeriodEndDate] = useState(INITIAL_END_DATE)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [selectedLog, setSelectedLog] = useState<FarmingLog | null>(null)

  const filteredLogs = useMemo(
    () =>
      logs.filter((log) => isLogInRange(parseLogDate(log.datetime), periodStartDate, periodEndDate)),
    [logs, periodEndDate, periodStartDate],
  )
  const missingCount = filteredLogs.filter((log) => log.isMissing).length

  function handleRecentMonth() {
    const endDate = normalizeDate(new Date())
    const startDate = new Date(endDate.getFullYear(), endDate.getMonth() - 1, endDate.getDate())
    setPeriodStartDate(startDate)
    setPeriodEndDate(endDate)
  }

  return (
    <section className="resident-journal-section">
      <div className="resident-journal-toolbar">
        <span className="resident-journal-period">
          {formatDateToDot(periodStartDate)}~{formatDateToDot(periodEndDate)}
        </span>
        <Btn variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
          기간
        </Btn>
        <Btn variant="outline" size="sm" onClick={handleRecentMonth}>
          최근한달
        </Btn>
        <strong className={missingCount > 0 ? "resident-journal-warning" : "resident-journal-ok"}>
          {missingCount > 0 ? `[${missingCount}] 개 기록을 작성해야 합니다.` : "작성해야 할 누락 기록이 없습니다."}
        </strong>
      </div>

      {error && (
        <div className="alert alert-error" style={{ margin: "12px 16px" }}>
          {error} — 샘플 데이터 표시 중
        </div>
      )}

      <div className="resident-detail-table-wrap">
        <table className="resident-detail-table">
          <thead>
            <tr>
              <th>일시</th>
              <th>사업별 할일</th>
              <th>주민기록</th>
              <th>사진</th>
              <th>참여사업</th>
              <th>상세</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="resident-detail-empty" colSpan={6}>영농일지를 불러오는 중...</td>
              </tr>
            ) : filteredLogs.length === 0 ? (
              <tr>
                <td className="resident-detail-empty" colSpan={6}>
                  선택한 기간에 해당하는 영농일지가 없습니다.
                </td>
              </tr>
            ) : (
              filteredLogs.map((log) => (
                <tr key={log.id} className={log.isMissing ? "resident-log-missing" : ""}>
                  <td className={log.isMissing ? "cell-mono resident-log-missing-text" : "cell-mono"}>{log.datetime}</td>
                  <td className={log.isMissing ? "resident-log-missing-text" : ""}>{log.taskName || ""}</td>
                  <td>{log.farmerNote || ""}</td>
                  <td>{log.photoCount > 0 ? log.photoCount : ""}</td>
                  <td>{log.projectName || ""}</td>
                  <td>
                    {log.hasDetail && (
                      <button
                        type="button"
                        className="resident-action resident-action-detail"
                        onClick={() => setSelectedLog(log)}
                      >
                        상세
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <DateRangePickerModal
        open={pickerOpen}
        initialStartDate={periodStartDate}
        initialEndDate={periodEndDate}
        onCancel={() => setPickerOpen(false)}
        onApply={(startDate, endDate) => {
          setPeriodStartDate(startDate)
          setPeriodEndDate(endDate)
          setPickerOpen(false)
        }}
      />
      <FarmingLogDetailModal open={!!selectedLog} log={selectedLog} resident={resident} onClose={() => setSelectedLog(null)} />
    </section>
  )
}
