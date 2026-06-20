"use client"

import { use, useCallback, useEffect, useMemo, useState } from "react"
import { CheckCircle2, RefreshCw } from "lucide-react"
import { useCurrentUserVillage } from "@/components/CurrentUserVillageContext"
import { PageHeader } from "@/components/ui/PageHeader"
import { Card, CardBody, CardHead } from "@/components/ui/Card"
import { Btn } from "@/components/ui/Btn"
import { Badge } from "@/components/ui/Badge"
import { Modal } from "@/components/ui/Modal"
import {
  createEngageProjectTodos,
  ENGAGE_PROJECT_CONNECTION_ERROR_MESSAGE,
  getEngageProjectTodoRefreshPreview,
  getEngageProjectActivities,
  getEngageProjectDetail,
  getEngageProjectTodos,
  refreshEngageProjectTodos,
  registerEngageProjectActivities,
  registerEngageProjectGroup,
} from "@/lib/engage-project-api"
import type {
  EngageActivityItem,
  EngageGroupItem,
  EngageMemberItem,
  EngageParticipationItem,
  EngageProjectItem,
  EngageTodoRefreshPreviewResponse,
  EngageTodoItem,
} from "@/lib/engage-project-types"

export default function EngageProjectDetailPage({
  params,
}: {
  params: Promise<{ prj_id: string }>
}) {
  const { prj_id } = use(params)
  const { currentUserVillageInfo, loading: currentUserLoading } = useCurrentUserVillage()
  const [project, setProject] = useState<EngageProjectItem | null>(null)
  const [groups, setGroups] = useState<EngageGroupItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [selectedGroupNo, setSelectedGroupNo] = useState<number | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [activityModalOpen, setActivityModalOpen] = useState(false)
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false)
  const [activities, setActivities] = useState<EngageActivityItem[]>([])
  const [members, setMembers] = useState<EngageMemberItem[]>([])
  const [participations, setParticipations] = useState<EngageParticipationItem[]>([])
  const [activityLoading, setActivityLoading] = useState(false)
  const [activitySaving, setActivitySaving] = useState(false)
  const [selectedActivityId, setSelectedActivityId] = useState("")
  const [selectedParcelMap, setSelectedParcelMap] = useState<Record<string, number[]>>({})
  const [todoModalOpen, setTodoModalOpen] = useState(false)
  const [todoModalTitle, setTodoModalTitle] = useState("농가별 To-do 리스트 조회")
  const [todoLoading, setTodoLoading] = useState(false)
  const [todoItems, setTodoItems] = useState<EngageTodoItem[]>([])
  const [todoFilterAmoRegno, setTodoFilterAmoRegno] = useState("")
  const [todoRefreshPreviewOpen, setTodoRefreshPreviewOpen] = useState(false)
  const [todoRefreshLoading, setTodoRefreshLoading] = useState(false)
  const [todoRefreshApplying, setTodoRefreshApplying] = useState(false)
  const [todoRefreshPreview, setTodoRefreshPreview] = useState<EngageTodoRefreshPreviewResponse | null>(null)

  const villageName = (currentUserVillageInfo?.village?.ville_name || "").trim()
  const villageId = (currentUserVillageInfo?.village?.ville_id || "").trim()
  const userNo = currentUserVillageInfo?.user?.user_no

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const data = await getEngageProjectDetail(prj_id)
      setProject((data.project as EngageProjectItem | null) || null)
      setGroups(data.groups || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : ENGAGE_PROJECT_CONNECTION_ERROR_MESSAGE)
    } finally {
      setLoading(false)
    }
  }, [prj_id])

  useEffect(() => {
    void load()
  }, [load])

  const selectedGroup = useMemo(
    () => groups.find((group) => Number(group.group_no) === selectedGroupNo) || null,
    [groups, selectedGroupNo],
  )

  const statusLabel = project?.engage_yn === "참여중" ? "참여 중" : "참여 등록 중"
  const participationSetByActivity = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const row of participations) {
      const activityId = String(row.activity_id || "")
      const amoRegno = String(row.amo_regno || "")
      if (!activityId || !amoRegno) continue
      if (!map.has(activityId)) map.set(activityId, new Set<string>())
      map.get(activityId)!.add(amoRegno)
    }
    return map
  }, [participations])

  const participationParcelLabelsByActivity = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const row of participations) {
      const activityId = String(row.activity_id || "")
      const amoRegno = String(row.amo_regno || "")
      if (!activityId || !amoRegno) continue
      const key = `${activityId}::${amoRegno}`
      const labels = String(row.parcel_labels || "")
        .split("|")
        .map((item) => item.trim())
        .filter(Boolean)
      map.set(key, labels)
    }
    return map
  }, [participations])

  const selectedActivity = useMemo(
    () => activities.find((activity) => activity.activity_id === selectedActivityId) || null,
    [activities, selectedActivityId],
  )
  const existingSelectedMap = useMemo(() => {
    const map: Record<string, number[]> = {}
    for (const row of participations) {
      if (String(row.activity_id || "") !== selectedActivityId) continue
      const amoRegno = String(row.amo_regno || "")
      const parcelNos = (row.parcel_nos || [])
        .map((parcelNo) => Number(parcelNo))
        .filter((parcelNo) => parcelNo > 0)
      if (amoRegno && parcelNos.length > 0) {
        map[amoRegno] = Array.from(new Set(parcelNos)).sort((a, b) => a - b)
      }
    }
    return map
  }, [participations, selectedActivityId])
  const existingSelectedSet = useMemo(() => new Set(Object.keys(existingSelectedMap)), [existingSelectedMap])
  const hasRegisteredActivityMembers = Boolean(project?.activity_group_exists)
  const hasGeneratedTodoList = Boolean(project?.todo_list_exists)
  const hasExistingSelection = existingSelectedSet.size > 0
  const hasActivitySelectionChanges = useMemo(() => {
    const normalize = (source: Record<string, number[]>): Record<string, number[]> =>
      Object.fromEntries(
        (Object.entries(source) as Array<[string, number[]]>)
          .map(([amoRegno, parcelNos]) => [
            amoRegno,
            Array.from(
              new Set(parcelNos.map((parcelNo) => Number(parcelNo)).filter((parcelNo) => parcelNo > 0)),
            ).sort((a, b) => a - b),
          ] as [string, number[]])
          .filter(([, parcelNos]) => parcelNos.length > 0)
          .sort(([left], [right]) => left.localeCompare(right)),
      )
    return JSON.stringify(normalize(selectedParcelMap)) !== JSON.stringify(normalize(existingSelectedMap))
  }, [selectedParcelMap, existingSelectedMap])

  const totalSelectedMembers = useMemo(
    () => Object.values(selectedParcelMap).filter((parcelNos) => parcelNos.length > 0).length,
    [selectedParcelMap],
  )

  const memberParcelOptionsByAmo = useMemo(
    () =>
      Object.fromEntries(
        members.map((member) => [member.amo_regno, member.parcels || []]),
      ),
    [members],
  )

  const matrixRows = useMemo(
    () =>
      members.map((member) => ({
        ...member,
        activityMap: Object.fromEntries(
          activities.map((activity) => [
            activity.activity_id,
            participationSetByActivity.get(activity.activity_id)?.has(member.amo_regno) || false,
          ]),
        ),
        activityParcelMap: Object.fromEntries(
          activities.map((activity) => [
            activity.activity_id,
            participationParcelLabelsByActivity.get(`${activity.activity_id}::${member.amo_regno}`) || [],
          ]),
        ),
      })),
    [activities, members, participationSetByActivity, participationParcelLabelsByActivity],
  )

  const buildDefaultParcelMap = useCallback(
    (activityId: string) => {
      const existingForActivity: Record<string, number[]> = {}
      for (const row of participations) {
        if (String(row.activity_id || "") !== activityId) continue
        const amoRegno = String(row.amo_regno || "")
        const parcelNos = (row.parcel_nos || [])
          .map((parcelNo) => Number(parcelNo))
          .filter((parcelNo) => parcelNo > 0)
        if (amoRegno && parcelNos.length > 0) {
          existingForActivity[amoRegno] = Array.from(new Set(parcelNos)).sort((a, b) => a - b)
        }
      }
      if (Object.keys(existingForActivity).length > 0) {
        return existingForActivity
      }
      return Object.fromEntries(
        members.map((member) => [
          member.amo_regno,
          (member.parcels || [])
            .map((parcel) => Number(parcel.parcel_no))
            .filter((parcelNo) => parcelNo > 0),
        ]),
      )
    },
    [members, participations],
  )

  const isMemberChecked = useCallback(
    (amoRegno: string) => (selectedParcelMap[amoRegno] || []).length > 0,
    [selectedParcelMap],
  )

  const isParcelChecked = useCallback(
    (amoRegno: string, parcelNo: number) => (selectedParcelMap[amoRegno] || []).includes(parcelNo),
    [selectedParcelMap],
  )

  const toggleMember = useCallback(
    (amoRegno: string) => {
      setSelectedParcelMap((prev) => {
        const current = prev[amoRegno] || []
        const allParcelNos = (memberParcelOptionsByAmo[amoRegno] || [])
          .map((parcel) => Number(parcel.parcel_no))
          .filter((parcelNo) => parcelNo > 0)
        if (current.length > 0) {
          return { ...prev, [amoRegno]: [] }
        }
        return { ...prev, [amoRegno]: allParcelNos }
      })
    },
    [memberParcelOptionsByAmo],
  )

  const toggleParcel = useCallback((amoRegno: string, parcelNo: number) => {
    setSelectedParcelMap((prev) => {
      const current = prev[amoRegno] || []
      const next = current.includes(parcelNo)
        ? current.filter((item) => item !== parcelNo)
        : [...current, parcelNo].sort((a, b) => a - b)
      return { ...prev, [amoRegno]: next }
    })
  }, [])

  const loadActivities = useCallback(async () => {
    if (project?.engage_yn !== "참여중") return
    setActivityLoading(true)
    try {
      const data = await getEngageProjectActivities(prj_id)
      setActivities(data.activities || [])
      setMembers(data.members || [])
      setParticipations(data.participations || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : ENGAGE_PROJECT_CONNECTION_ERROR_MESSAGE)
    } finally {
      setActivityLoading(false)
    }
  }, [prj_id, project?.engage_yn])

  useEffect(() => {
    if (project?.engage_yn === "참여중") {
      void loadActivities()
    }
  }, [project?.engage_yn, loadActivities])

  useEffect(() => {
    if (activities.length === 0) {
      setSelectedActivityId("")
      return
    }
    setSelectedActivityId((prev) =>
      prev && activities.some((activity) => activity.activity_id === prev)
        ? prev
        : String(activities[0]?.activity_id || ""),
    )
  }, [activities])

  useEffect(() => {
    if (!selectedActivityId || members.length === 0) {
      setSelectedParcelMap({})
      return
    }
    setSelectedParcelMap(buildDefaultParcelMap(selectedActivityId))
  }, [selectedActivityId, members, buildDefaultParcelMap])

  useEffect(() => {
    if (!activityModalOpen || !selectedActivityId) return
    setSelectedParcelMap(buildDefaultParcelMap(selectedActivityId))
  }, [activityModalOpen, selectedActivityId, buildDefaultParcelMap])

  async function handleRegister() {
    if (!selectedGroup) return
    setSaving(true)
    setError("")
    setNotice("")
    try {
      await registerEngageProjectGroup(prj_id, Number(selectedGroup.group_no))
      setNotice(`"${selectedGroup.group_name || selectedGroup.group_no}" 단체를 참여단체로 등록했습니다.`)
      setConfirmOpen(false)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "참여단체 등록에 실패했습니다.")
    } finally {
      setSaving(false)
    }
  }

  async function handleActivityRegister() {
    if (!selectedActivityId) return
    if (!hasExistingSelection && totalSelectedMembers === 0) return
    if (hasExistingSelection && !hasActivitySelectionChanges) return
    setActivitySaving(true)
    setError("")
    setNotice("")
    try {
      const selections = Object.entries(selectedParcelMap)
        .map(([amoRegno, parcelNos]) => ({
          amo_regno: amoRegno,
          parcel_nos: Array.from(
            new Set(parcelNos.map((parcelNo) => Number(parcelNo)).filter((parcelNo) => parcelNo > 0)),
          ).sort((a, b) => a - b),
        }))
        .filter((item) => item.amo_regno && item.parcel_nos.length > 0)
      const result = await registerEngageProjectActivities(prj_id, {
        activity_id: selectedActivityId,
        selections,
      })
      if (result.inserted_count > 0 || result.deleted_count > 0) {
        setNotice(
          `${selectedActivity?.activity_name || selectedActivityId} 활동에 추가 ${result.inserted_count}명, 삭제 ${result.deleted_count}명을 반영했습니다.`,
        )
      } else {
        setNotice(`${selectedActivity?.activity_name || selectedActivityId} 활동의 변경 사항이 없습니다.`)
      }
      await loadActivities()
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "활동별 농가 등록에 실패했습니다.")
    } finally {
      setActivitySaving(false)
    }
  }

  async function handleTodoModalOpen() {
    if (!project) return
    setTodoLoading(true)
    setError("")
    try {
      const shouldViewOnly = Boolean(project.todo_list_exists)
      const data = shouldViewOnly
        ? await getEngageProjectTodos(prj_id)
        : await createEngageProjectTodos(prj_id)
      setTodoItems(data.items || [])
      setTodoFilterAmoRegno("")
      setTodoModalTitle(shouldViewOnly ? "농가별 To-do 리스트 조회" : "농가별 To-do 리스트 생성 결과")
      setTodoModalOpen(true)
      setProject((prev) =>
        prev
          ? {
              ...prev,
              todo_list_exists: data.todo_list_exists,
            }
          : prev,
      )
      if (!shouldViewOnly) {
        setNotice(
          data.created_count > 0
            ? `농가별 To-do 리스트 ${data.created_count}건을 생성했습니다.`
            : "이미 생성된 농가별 To-do 리스트를 조회했습니다.",
        )
      }
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "농가별 To-do 리스트 처리에 실패했습니다.")
    } finally {
      setTodoLoading(false)
    }
  }

  async function handleMemberTodoModalOpen(member: EngageMemberItem) {
    if (!project) return
    setTodoLoading(true)
    setError("")
    try {
      const shouldViewOnly = Boolean(project.todo_list_exists)
      const data = shouldViewOnly
        ? await getEngageProjectTodos(prj_id)
        : await createEngageProjectTodos(prj_id)
      const targetAmoRegno = String(member.amo_regno || "")
      setTodoItems((data.items || []).filter((item) => String(item.amo_regno || "") === targetAmoRegno))
      setTodoFilterAmoRegno(targetAmoRegno)
      setTodoModalTitle(`${member.amo_name || member.amo_regno} To-do 리스트 조회`)
      setTodoModalOpen(true)
      setProject((prev) =>
        prev
          ? {
              ...prev,
              todo_list_exists: data.todo_list_exists,
            }
          : prev,
      )
      if (!shouldViewOnly) {
        setNotice(
          data.created_count > 0
            ? `농가별 To-do 리스트 ${data.created_count}건을 생성했습니다.`
            : "이미 생성된 농가별 To-do 리스트를 조회했습니다.",
        )
      }
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "농가별 To-do 리스트 처리에 실패했습니다.")
    } finally {
      setTodoLoading(false)
    }
  }

  async function handleTodoRefreshPreviewOpen() {
    if (!project) return
    setTodoRefreshLoading(true)
    setError("")
    try {
      const data = await getEngageProjectTodoRefreshPreview(prj_id)
      setTodoRefreshPreview(data)
      setTodoRefreshPreviewOpen(true)
      if (!data.has_changes) {
        setNotice("현재 To-do 리스트와 비교한 결과 추가/삭제 대상이 없습니다.")
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "To-do 리스트 갱신 비교에 실패했습니다.")
    } finally {
      setTodoRefreshLoading(false)
    }
  }

  async function handleTodoRefreshApply() {
    if (!todoRefreshPreview?.has_changes) {
      setTodoRefreshPreviewOpen(false)
      return
    }
    if (typeof window !== "undefined") {
      const confirmed = window.confirm(
        `신규 등록 ${todoRefreshPreview.add_count}건, 삭제 ${todoRefreshPreview.delete_count}건이 있습니다. 갱신할까요?`,
      )
      if (!confirmed) return
    }
    setTodoRefreshApplying(true)
    setError("")
    setNotice("")
    try {
      const data = await refreshEngageProjectTodos(prj_id)
      const nextItems = todoFilterAmoRegno
        ? (data.items || []).filter((item) => String(item.amo_regno || "") === todoFilterAmoRegno)
        : data.items || []
      setTodoItems(nextItems)
      setProject((prev) =>
        prev
          ? {
              ...prev,
              todo_list_exists: data.todo_list_exists,
            }
          : prev,
      )
      setTodoRefreshPreview(null)
      setTodoRefreshPreviewOpen(false)
      setNotice(`To-do 리스트를 갱신했습니다. 추가 ${data.created_count}건, 삭제 ${data.deleted_count}건을 반영했습니다.`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "To-do 리스트 갱신에 실패했습니다.")
    } finally {
      setTodoRefreshApplying(false)
    }
  }

  if (!loading && !project) {
    return (
      <div>
        <PageHeader title="사업 정보를 찾을 수 없습니다" backHref="/engage" />
        <Card>
          <div className="tbl-empty muted" style={{ padding: 48 }}>
            해당 사업 정보를 찾을 수 없습니다.
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title={project?.prj_name || "사업참여"}
        sub={`프로젝트 ID: ${project?.prj_id || prj_id}${villageName ? ` · 현재 마을: ${villageName}` : ""}${villageId ? ` (${villageId})` : ""}${userNo ? ` · 사용자번호: ${userNo}` : ""}`}
        backHref="/engage"
        actions={
          <Btn
            icon={<RefreshCw size={16} />}
            onClick={() => {
              void load()
              if (project?.engage_yn === "참여중") void loadActivities()
            }}
            disabled={loading || saving || currentUserLoading || activitySaving || todoLoading}
          >
            새로고침
          </Btn>
        }
      />

      {error && <div className="alert alert-error">오류: {error}</div>}
      {notice && <div className="alert alert-notice">{notice}</div>}

      <Card>
        <CardHead title="프로젝트 기본 정보" />
        {loading ? (
          <div className="loading">불러오는 중...</div>
        ) : (
          <CardBody>
            <div className="detail-row">
              <div className="detail-row-label">사업명</div>
              <div className="detail-row-value">{project?.biz_name || "—"}</div>
            </div>
            <div className="detail-row">
              <div className="detail-row-label">프로젝트명</div>
              <div className="detail-row-value">{project?.prj_name || "—"}</div>
            </div>
            <div className="detail-row">
              <div className="detail-row-label">공고일</div>
              <div className="detail-row-value">{project?.post_date || "—"}</div>
            </div>
            <div className="detail-row">
              <div className="detail-row-label">발주처</div>
              <div className="detail-row-value">{project?.issuer || "—"}</div>
            </div>
            <div className="detail-row">
              <div className="detail-row-label">참여상태</div>
              <div className="detail-row-value" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <Badge
                  tone={project?.engage_yn === "참여중" ? "ok" : "neutral"}
                  label={statusLabel}
                />
                {project?.engage_group_name ? (
                  <span>{project.engage_group_name}</span>
                ) : null}
              </div>
            </div>
          </CardBody>
        )}
      </Card>

      {!loading && project?.engage_yn !== "참여중" && (
        <Card>
          <CardHead
            title="참여 예정 단체"
            sub="아래 단체 중 하나를 참여 단체로 등록해 주시기 바랍니다."
          />
          {loading ? (
            <div className="loading">불러오는 중...</div>
          ) : groups.length === 0 ? (
            <div className="tbl-empty muted" style={{ padding: 48 }}>
              현재 마을에 등록된 단체가 없습니다.
            </div>
          ) : (
            <>
              <div className="table-wrap">
                <table className="tbl engage-group-table">
                  <thead>
                    <tr>
                      <th aria-label="선택"></th>
                      <th>단체명</th>
                      <th>단체유형</th>
                      <th>단체장</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((group) => {
                      const selected = Number(group.group_no) === selectedGroupNo
                      return (
                        <tr
                          key={group.group_no}
                          className={selected ? "engage-group-row-selected" : ""}
                          onClick={() => setSelectedGroupNo(Number(group.group_no))}
                          onDoubleClick={() => {
                            setSelectedGroupNo(Number(group.group_no))
                            setConfirmOpen(true)
                          }}
                        >
                          <td>
                            <input
                              type="radio"
                              name="engage-group"
                              checked={selected}
                              onChange={() => setSelectedGroupNo(Number(group.group_no))}
                              aria-label={`${group.group_name || group.group_no} 선택`}
                            />
                          </td>
                          <td className="cell-name">{group.group_name || "—"}</td>
                          <td>{group.group_type || <span className="muted">—</span>}</td>
                          <td>{group.chief_name || <span className="muted">—</span>}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="engage-register-actions">
                <Btn
                  variant="primary"
                  icon={<CheckCircle2 size={16} />}
                  disabled={!selectedGroup || saving}
                  onClick={() => setConfirmOpen(true)}
                >
                  참여단체로 등록
                </Btn>
              </div>
            </>
          )}
        </Card>
      )}

      {!loading && project?.engage_yn === "참여중" ? (
        <Card>
          <CardHead
            title="활동별 참여 현황"
            sub="농가별로 각 활동의 참여 여부를 확인합니다."
            action={
              <>
                <Btn
                  size="sm"
                  variant={hasRegisteredActivityMembers ? "outline" : "primary"}
                  onClick={() => setActivityModalOpen(true)}
                  disabled={activitySaving || todoLoading}
                >
                  활동별 참여 농가 등록/수정
                </Btn>
                <Btn
                  size="sm"
                  variant={
                    !hasRegisteredActivityMembers || hasGeneratedTodoList ? "outline" : "primary"
                  }
                  onClick={() => void handleTodoModalOpen()}
                  disabled={!hasRegisteredActivityMembers || todoLoading || activitySaving}
                >
                  {hasGeneratedTodoList ? "농가별 To-do 리스트 조회" : "농가별 To-do 리스트 생성"}
                </Btn>
              </>
            }
          />
          {activityLoading ? (
            <div className="loading">불러오는 중...</div>
          ) : matrixRows.length === 0 || activities.length === 0 ? (
            <div className="tbl-empty muted" style={{ padding: 48 }}>
              표시할 참여 현황이 없습니다.
            </div>
          ) : (
            <div className="table-wrap engage-participation-table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>농가명</th>
                    {activities.map((activity) => (
                      <th key={activity.activity_id}>{activity.activity_name || activity.activity_id}</th>
                    ))}
                    <th>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {matrixRows.map((member) => (
                    <tr key={member.amo_regno}>
                      <td className="cell-name">
                        {member.amo_name || member.amo_regno}
                        <div className="muted" style={{ fontSize: 13, fontWeight: 400 }}>
                          {member.amo_regno}
                        </div>
                      </td>
                      {activities.map((activity) => (
                        <td key={`${member.amo_regno}-${activity.activity_id}`}>
                          {member.activityMap[activity.activity_id] ? (
                            <div style={{ display: "grid", gap: 8, justifyItems: "start" }}>
                              <Badge tone="ok" label="참여" />
                              {member.activityParcelMap[activity.activity_id]?.length ? (
                                <div
                                  className="muted"
                                  style={{
                                    fontSize: 13,
                                    lineHeight: 1.5,
                                    display: "flex",
                                    flexWrap: "wrap",
                                    gap: 8,
                                  }}
                                >
                                  {member.activityParcelMap[activity.activity_id].map((label: string) => (
                                    <span key={`${member.amo_regno}-${activity.activity_id}-${label}`}>{label}</span>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <Badge tone="neutral" label="미참여" />
                          )}
                        </td>
                      ))}
                      <td>
                        <Btn
                          size="sm"
                          variant="outline"
                          onClick={() => void handleMemberTodoModalOpen(member)}
                          disabled={todoLoading || activitySaving}
                        >
                          상세보기
                        </Btn>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}

      <Modal
        open={todoModalOpen}
        title={todoModalTitle}
        onClose={() => {
          setTodoModalOpen(false)
          setTodoFilterAmoRegno("")
        }}
        width="1120px"
        footer={
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, width: "100%" }}>
            <div>
              {!todoFilterAmoRegno ? (
                <Btn
                  variant="outline"
                  onClick={() => void handleTodoRefreshPreviewOpen()}
                  disabled={todoLoading || todoRefreshLoading || todoRefreshApplying}
                >
                  {todoRefreshLoading ? "비교 중..." : "To-do 리스트 갱신 확인"}
                </Btn>
              ) : null}
            </div>
            <Btn
              variant="outline"
              onClick={() => {
                setTodoModalOpen(false)
                setTodoFilterAmoRegno("")
              }}
              disabled={todoRefreshApplying}
            >
              닫기
            </Btn>
          </div>
        }
      >
        {todoLoading ? (
          <div className="loading">불러오는 중...</div>
        ) : todoItems.length === 0 ? (
          <div className="tbl-empty muted" style={{ padding: 48 }}>
            {todoFilterAmoRegno ? "해당 농가의 To-do 리스트가 없습니다." : "생성된 농가별 To-do 리스트가 없습니다."}
          </div>
        ) : (
          <div className="table-wrap engage-todo-table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>리더명 / 농업경영체번호</th>
                  <th>활동명</th>
                  <th>농지</th>
                  <th>작업번호</th>
                  <th>작업명</th>
                  <th>예상시작일자</th>
                  <th>예상종료일자</th>
                </tr>
              </thead>
              <tbody>
                {todoItems.map((item) => (
                  <tr key={`${item.amo_regno}-${item.activity_id}-${item.parcel_no || 0}-${item.job_seq}`}>
                    <td className="cell-name">
                      {item.amo_name || `${item.leader_name || "대표자 미상"} 농가`}
                      <div className="muted" style={{ fontSize: 13, fontWeight: 400 }}>
                        {item.leader_name || "대표자 미상"}, {item.amo_regno}
                      </div>
                    </td>
                    <td>{item.activity_name || item.activity_id}</td>
                    <td>{item.parcel_name || (item.parcel_no ? `농지 ${item.parcel_no}` : <span className="muted">—</span>)}</td>
                    <td className="cell-mono">{item.job_seq}</td>
                    <td>{item.job_name || item.job_cd}</td>
                    <td className="cell-mono">{item.est_start_date || <span className="muted">—</span>}</td>
                    <td className="cell-mono">{item.est_end_date || <span className="muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      <Modal
        open={todoRefreshPreviewOpen}
        title="To-do 리스트 갱신 확인"
        onClose={() => {
          if (!todoRefreshApplying) setTodoRefreshPreviewOpen(false)
        }}
        width="1120px"
        footer={
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, width: "100%" }}>
            <div className="muted" style={{ display: "flex", alignItems: "center", fontSize: 14 }}>
              {todoRefreshPreview
                ? `신규 등록 ${todoRefreshPreview.add_count}건 / 삭제 ${todoRefreshPreview.delete_count}건`
                : "비교 결과를 불러오는 중입니다."}
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <Btn
                variant="outline"
                onClick={() => setTodoRefreshPreviewOpen(false)}
                disabled={todoRefreshApplying}
              >
                닫기
              </Btn>
              <Btn
                variant="primary"
                onClick={() => void handleTodoRefreshApply()}
                disabled={!todoRefreshPreview?.has_changes || todoRefreshApplying}
              >
                {todoRefreshApplying ? "갱신 중..." : "갱신"}
              </Btn>
            </div>
          </div>
        }
      >
        {!todoRefreshPreview ? (
          <div className="loading">불러오는 중...</div>
        ) : !todoRefreshPreview.has_changes ? (
          <div className="tbl-empty muted" style={{ padding: 48 }}>
            현재 To-do 리스트와 비교한 결과 추가/삭제 대상이 없습니다.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 24 }}>
            <section style={{ display: "grid", gap: 12 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: "var(--ink)" }}>
                신규 등록 대상
              </div>
              {todoRefreshPreview.to_add.length === 0 ? (
                <div className="tbl-empty muted" style={{ padding: 32 }}>
                  신규 등록 대상이 없습니다.
                </div>
              ) : (
                <div className="table-wrap engage-todo-table-wrap">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>리더명 / 농업경영체번호</th>
                        <th>활동명</th>
                        <th>농지</th>
                        <th>작업번호</th>
                        <th>작업명</th>
                        <th>예상시작일자</th>
                        <th>예상종료일자</th>
                      </tr>
                    </thead>
                    <tbody>
                      {todoRefreshPreview.to_add.map((item) => (
                        <tr key={`add-${item.amo_regno}-${item.activity_id}-${item.parcel_no || 0}-${item.job_seq}`}>
                          <td className="cell-name">
                            {item.amo_name || `${item.leader_name || "대표자 미상"} 농가`}
                            <div className="muted" style={{ fontSize: 13, fontWeight: 400 }}>
                              {item.leader_name || "대표자 미상"}, {item.amo_regno}
                            </div>
                          </td>
                          <td>{item.activity_name || item.activity_id}</td>
                          <td>
                            {item.parcel_name || (item.parcel_no ? `농지 ${item.parcel_no}` : <span className="muted">—</span>)}
                          </td>
                          <td className="cell-mono">{item.job_seq}</td>
                          <td>{item.job_name || item.job_cd}</td>
                          <td className="cell-mono">{item.est_start_date || <span className="muted">—</span>}</td>
                          <td className="cell-mono">{item.est_end_date || <span className="muted">—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section style={{ display: "grid", gap: 12 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: "var(--ink)" }}>
                삭제 대상
              </div>
              {todoRefreshPreview.to_delete.length === 0 ? (
                <div className="tbl-empty muted" style={{ padding: 32 }}>
                  삭제 대상이 없습니다.
                </div>
              ) : (
                <div className="table-wrap engage-todo-table-wrap">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>리더명 / 농업경영체번호</th>
                        <th>활동명</th>
                        <th>농지</th>
                        <th>작업번호</th>
                        <th>작업명</th>
                        <th>예상시작일자</th>
                        <th>예상종료일자</th>
                      </tr>
                    </thead>
                    <tbody>
                      {todoRefreshPreview.to_delete.map((item) => (
                        <tr key={`delete-${item.amo_regno}-${item.activity_id}-${item.parcel_no || 0}-${item.job_seq}`}>
                          <td className="cell-name">
                            {item.amo_name || `${item.leader_name || "대표자 미상"} 농가`}
                            <div className="muted" style={{ fontSize: 13, fontWeight: 400 }}>
                              {item.leader_name || "대표자 미상"}, {item.amo_regno}
                            </div>
                          </td>
                          <td>{item.activity_name || item.activity_id}</td>
                          <td>
                            {item.parcel_name || (item.parcel_no ? `농지 ${item.parcel_no}` : <span className="muted">—</span>)}
                          </td>
                          <td className="cell-mono">{item.job_seq}</td>
                          <td>{item.job_name || item.job_cd}</td>
                          <td className="cell-mono">{item.est_start_date || <span className="muted">—</span>}</td>
                          <td className="cell-mono">{item.est_end_date || <span className="muted">—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}
      </Modal>

      <Modal
        open={confirmOpen}
        title="참여단체 등록 확인"
        onClose={() => {
          if (!saving) setConfirmOpen(false)
        }}
        footer={
          <div style={{ display: "flex", gap: 12 }}>
            <Btn variant="outline" onClick={() => setConfirmOpen(false)} disabled={saving}>
              취소
            </Btn>
            <Btn variant="primary" onClick={() => void handleRegister()} disabled={!selectedGroup || saving}>
              {saving ? "등록 중..." : "확인"}
            </Btn>
          </div>
        }
      >
        <p style={{ margin: 0, fontSize: 16, lineHeight: 1.7 }}>
          "{selectedGroup?.group_name || "선택한 단체"}"을/를 참여자로 등록하시겠습니까?
        </p>
      </Modal>

      <Modal
        open={activityModalOpen}
        title={project?.activity_group_exists ? "활동별 농가 조회" : "활동별 농가 등록"}
        onClose={() => {
          if (!activitySaving) setCloseConfirmOpen(true)
        }}
        width="1200px"
        footer={
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, width: "100%" }}>
            <Btn variant="outline" onClick={() => setCloseConfirmOpen(true)} disabled={activitySaving}>
              화면 닫기
            </Btn>
            <Btn
              variant="primary"
              disabled={
                !selectedActivityId ||
                activitySaving ||
                (!hasExistingSelection && totalSelectedMembers === 0) ||
                (hasExistingSelection && !hasActivitySelectionChanges)
              }
              onClick={() => void handleActivityRegister()}
            >
              {activitySaving ? "등록 중..." : "등록"}
            </Btn>
          </div>
        }
      >
        <div className="split-2col">
          <Card>
            <CardHead title="프로젝트 활동목록" />
            {activityLoading ? (
              <div className="loading">불러오는 중...</div>
            ) : activities.length === 0 ? (
              <div className="tbl-empty muted" style={{ padding: 48 }}>
                등록된 활동이 없습니다.
              </div>
            ) : (
              <div className="engage-activity-list">
                {activities.map((activity) => {
                  const selected = activity.activity_id === selectedActivityId
                  const count = participationSetByActivity.get(activity.activity_id)?.size || 0
                  return (
                    <label
                      key={activity.activity_id}
                      className={`engage-activity-item${selected ? " engage-activity-item-selected" : ""}`}
                    >
                      <input
                        type="radio"
                        name="activity"
                        checked={selected}
                        onChange={() => setSelectedActivityId(activity.activity_id)}
                      />
                      <div>
                        <div className="engage-activity-name">{activity.activity_name || activity.activity_id}</div>
                        <div className="engage-activity-period">
                          활동기간 : {activity.est_start_date || "—"} ~ {activity.est_end_date || "—"}
                        </div>
                        <div className="engage-activity-count">참여농가수 : {count}명</div>
                      </div>
                    </label>
                  )
                })}
              </div>
            )}
          </Card>

          <Card>
            <CardHead title="참여자 목록" />
            {activityLoading ? (
              <div className="loading">불러오는 중...</div>
            ) : members.length === 0 ? (
              <div className="tbl-empty muted" style={{ padding: 48 }}>
                참여 단체에 등록된 참여자가 없습니다.
              </div>
            ) : (
              <div className="engage-member-list">
                {members.map((member) => {
                  const checked = isMemberChecked(member.amo_regno)
                  const wasChecked = existingSelectedSet.has(member.amo_regno)
                  const actionLabel =
                    hasExistingSelection && checked !== wasChecked
                      ? checked
                        ? "추가"
                        : "삭제"
                      : ""
                  return (
                    <label key={member.amo_regno} className="engage-member-item engage-member-item-inline">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleMember(member.amo_regno)}
                      />
                      <div className="engage-member-inline-text" style={{ width: "100%" }}>
                        <span className="engage-member-name">{member.amo_name || member.amo_regno}</span>
                        <span className="engage-member-inline-meta">
                          {member.chief_name || "대표자 미상"} · {member.amo_regno}
                        </span>
                        {(member.parcels || []).length > 0 ? (
                          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                            {(member.parcels || []).map((parcel) => (
                              <label
                                key={`${member.amo_regno}-${parcel.parcel_no}`}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                  fontSize: 14,
                                  color: "var(--muted)",
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={isParcelChecked(member.amo_regno, Number(parcel.parcel_no))}
                                  onChange={() => toggleParcel(member.amo_regno, Number(parcel.parcel_no))}
                                />
                                <span>{parcel.parcel_label || parcel.parcel_name || `농지 ${parcel.parcel_no}`}</span>
                              </label>
                            ))}
                          </div>
                        ) : (
                          <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>
                            등록된 농지 정보가 없습니다.
                          </div>
                        )}
                        {actionLabel ? (
                          <span
                            className={
                              actionLabel === "삭제"
                                ? "engage-member-change engage-member-change-remove"
                                : "engage-member-change engage-member-change-add"
                            }
                          >
                            {actionLabel}
                          </span>
                        ) : null}
                      </div>
                    </label>
                  )
                })}
              </div>
            )}
          </Card>
        </div>

      </Modal>

      <Modal
        open={closeConfirmOpen}
        title="활동 등록 마무리"
        onClose={() => setCloseConfirmOpen(false)}
        footer={
          <div style={{ display: "flex", gap: 12 }}>
            <Btn
              variant="primary"
              onClick={() => {
                setCloseConfirmOpen(false)
                setActivityModalOpen(false)
              }}
            >
              확인
            </Btn>
            <Btn variant="outline" onClick={() => setCloseConfirmOpen(false)}>
              취소
            </Btn>
          </div>
        }
      >
        <p style={{ margin: 0, fontSize: 16, lineHeight: 1.7 }}>
          활동 등록을 마치시겠습니까?
        </p>
      </Modal>
    </div>
  )
}
