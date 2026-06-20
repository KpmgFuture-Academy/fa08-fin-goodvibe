"use client"

import { use, useCallback, useEffect, useState } from "react"
import { FolderPlus, Pencil, Save } from "lucide-react"
import { PageHeader } from "@/components/ui/PageHeader"
import { Card, CardBody, CardHead } from "@/components/ui/Card"
import { Btn } from "@/components/ui/Btn"
import { Modal } from "@/components/ui/Modal"
import {
  getProjectAdminDetail,
  PROJECT_ADMIN_CONNECTION_ERROR_MESSAGE,
  createProjectActivity,
  updateProjectActivity,
  updateProjectInfo,
} from "@/lib/project-api"
import type {
  ProjectAdminActivity,
  ProjectAdminItem,
  ProjectAdminJobItem,
  ProjectAdminParcelOption,
} from "@/lib/project-types"

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ prj_id: string }>
}) {
  const { prj_id } = use(params)
  const [project, setProject] = useState<ProjectAdminItem | null>(null)
  const [parcelOptions, setParcelOptions] = useState<ProjectAdminParcelOption[]>([])
  const [jobs, setJobs] = useState<ProjectAdminJobItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [modalError, setModalError] = useState("")
  const [errorDialogOpen, setErrorDialogOpen] = useState(false)
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false)
  const [ruleDialogTitle, setRuleDialogTitle] = useState("")
  const [ruleDialogContent, setRuleDialogContent] = useState("")
  const [editOpen, setEditOpen] = useState(false)
  const [projectEditOpen, setProjectEditOpen] = useState(false)
  const [isCreateMode, setIsCreateMode] = useState(false)
  const [editingActivity, setEditingActivity] = useState<ProjectAdminActivity | null>(null)
  const [formProjectName, setFormProjectName] = useState("")
  const [formExecYear, setFormExecYear] = useState("")
  const [formPostDate, setFormPostDate] = useState("")
  const [formIssuer, setFormIssuer] = useState("")
  const [formActivityId, setFormActivityId] = useState("")
  const [formActivityName, setFormActivityName] = useState("")
  const [formStartDate, setFormStartDate] = useState("")
  const [formEndDate, setFormEndDate] = useState("")
  const [formSubsidy, setFormSubsidy] = useState("")
  const [formParcelCodes, setFormParcelCodes] = useState<string[]>([])

  const formatCurrency = (value: number | null | undefined) => {
    if (value == null) return "—"
    return Math.round(value).toLocaleString("ko-KR")
  }

  const formatNumberInput = (value: string) => {
    const cleaned = value.replace(/[^\d.]/g, "")
    if (!cleaned) return ""
    const [rawIntPart = "", rawDecimalPart = ""] = cleaned.split(".")
    const intDigits = rawIntPart.replace(/^0+(?=\d)/, "") || "0"
    const formattedInt = Number(intDigits).toLocaleString("ko-KR")
    if (cleaned.includes(".")) {
      return `${formattedInt}.${rawDecimalPart.replace(/\./g, "").slice(0, 1)}`
    }
    return formattedInt
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const data = await getProjectAdminDetail(prj_id)
      setProject(data.project || null)
      setParcelOptions(data.parcel_options || [])
      setJobs(data.jobs || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : PROJECT_ADMIN_CONNECTION_ERROR_MESSAGE)
    } finally {
      setLoading(false)
    }
  }, [prj_id])

  useEffect(() => {
    void load()
  }, [load])

  function openEditModal(activity: ProjectAdminActivity) {
    setIsCreateMode(false)
    setEditingActivity(activity)
    setFormActivityId(activity.activity_id || "")
    setFormActivityName(activity.activity_name || "")
    setFormStartDate(activity.est_start_date || "")
    setFormEndDate(activity.est_end_date || "")
    setFormSubsidy(
      activity.subsidy_amt_display != null
        ? Math.round(Number(activity.subsidy_amt_display)).toLocaleString("ko-KR")
        : "",
    )
    setFormParcelCodes(activity.target_parcel_codes || [])
    setModalError("")
    setErrorDialogOpen(false)
    setEditOpen(true)
  }

  function openProjectEditModal() {
    if (!project) return
    setFormProjectName(project.prj_name || "")
    setFormExecYear(project.exec_year != null ? String(project.exec_year) : "")
    setFormPostDate(project.post_date || "")
    setFormIssuer(project.issuer || "")
    setModalError("")
    setErrorDialogOpen(false)
    setProjectEditOpen(true)
  }

  function closeProjectEditModal() {
    if (saving) return
    setProjectEditOpen(false)
    setModalError("")
    setErrorDialogOpen(false)
  }

  function openCreateModal() {
    setIsCreateMode(true)
    setEditingActivity(null)
    setFormActivityId("")
    setFormActivityName("")
    setFormStartDate("")
    setFormEndDate("")
    setFormSubsidy("")
    setFormParcelCodes([])
    setModalError("")
    setErrorDialogOpen(false)
    setEditOpen(true)
  }

  function closeEditModal() {
    if (saving) return
    setEditOpen(false)
    setIsCreateMode(false)
    setEditingActivity(null)
    setFormActivityId("")
    setModalError("")
    setErrorDialogOpen(false)
  }

  function toggleParcelCode(code: string) {
    setFormParcelCodes((prev) =>
      prev.includes(code) ? prev.filter((item) => item !== code) : [...prev, code].sort(),
    )
  }

  function openRuleDialog(title: string, content: string | null | undefined) {
    setRuleDialogTitle(title)
    setRuleDialogContent((content || "").trim() || "규칙 정보가 없습니다.")
    setRuleDialogOpen(true)
  }

  async function handleSaveActivity() {
    if (!project) return
    const subsidyValue = Number(formSubsidy.replace(/,/g, ""))
    if (!formActivityId.trim()) {
      setModalError("활동 ID를 입력해 주세요.")
      setErrorDialogOpen(true)
      return
    }
    if (!formActivityName.trim()) {
      setModalError("활동명을 입력해 주세요.")
      setErrorDialogOpen(true)
      return
    }
    if (!Number.isFinite(subsidyValue) || subsidyValue < 0) {
      setModalError("활동비는 0 이상의 숫자로 입력해 주세요.")
      setErrorDialogOpen(true)
      return
    }
    if (!Number.isInteger(subsidyValue) || subsidyValue % 1000 !== 0) {
      setModalError("활동비는 1,000원 단위로 입력해 주세요.")
      setErrorDialogOpen(true)
      return
    }
    setSaving(true)
    setError("")
    setNotice("")
    setModalError("")
    try {
      if (isCreateMode) {
        await createProjectActivity(project.prj_id, {
          activity_id: formActivityId.trim(),
          activity_name: formActivityName.trim(),
          est_start_date: formStartDate || null,
          est_end_date: formEndDate || null,
          subsidy_amt_display: subsidyValue,
          parcel_codes: formParcelCodes,
        })
      } else if (editingActivity) {
        await updateProjectActivity(project.prj_id, editingActivity.activity_id, {
          activity_name: formActivityName.trim(),
          est_start_date: formStartDate || null,
          est_end_date: formEndDate || null,
          subsidy_amt_display: subsidyValue,
          parcel_codes: formParcelCodes,
        })
      } else {
        return
      }
      setEditOpen(false)
      setIsCreateMode(false)
      setEditingActivity(null)
      setFormActivityId("")
      await load()
      setNotice(isCreateMode ? "활동 정보가 등록되었습니다." : "활동 정보가 수정되었습니다.")
    } catch (e) {
      setModalError(e instanceof Error ? e.message : PROJECT_ADMIN_CONNECTION_ERROR_MESSAGE)
      setErrorDialogOpen(true)
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveProjectInfo() {
    if (!project) return
    if (!formProjectName.trim()) {
      setModalError("프로젝트명은 비워둘 수 없습니다.")
      setErrorDialogOpen(true)
      return
    }
    const execYearText = formExecYear.trim()
    const execYearValue = execYearText ? Number(execYearText) : null
    if (
      execYearText &&
      (execYearValue === null ||
        !Number.isInteger(execYearValue) ||
        execYearValue < 2000 ||
        execYearValue > 2100)
    ) {
      setModalError("연도 값이 올바르지 않습니다.")
      setErrorDialogOpen(true)
      return
    }

    setSaving(true)
    setError("")
    setNotice("")
    setModalError("")
    try {
      await updateProjectInfo(project.prj_id, {
        prj_name: formProjectName.trim(),
        exec_year: execYearValue,
        post_date: formPostDate || null,
        issuer: formIssuer.trim() || null,
      })
      setProjectEditOpen(false)
      await load()
      setNotice("프로젝트 기본정보가 수정되었습니다.")
    } catch (e) {
      setModalError(e instanceof Error ? e.message : PROJECT_ADMIN_CONNECTION_ERROR_MESSAGE)
      setErrorDialogOpen(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader
        title={loading ? "프로젝트 상세정보" : project?.prj_name || "프로젝트 상세정보"}
        backHref="/project"
      />
      {error && <div className="alert alert-error">오류: {error}</div>}
      {notice && <div className="alert alert-notice">{notice}</div>}

      {!loading && project ? (
        <>
          <Card>
            <CardHead
              title="프로젝트 기본 정보"
              sub={`프로젝트 ID: ${project.prj_id}`}
              action={
                <Btn variant="primary" size="sm" icon={<Pencil size={14} />} onClick={openProjectEditModal}>
                  프로젝트 기본정보 수정
                </Btn>
              }
            />
            <CardBody>
              <div className="detail-grid">
                <div className="detail-row">
                  <div className="detail-row-label">사업명</div>
                  <div className="detail-row-value">{project.biz_name || "—"}</div>
                </div>
                <div className="detail-row">
                  <div className="detail-row-label">프로젝트명</div>
                  <div className="detail-row-value">{project.prj_name || "—"}</div>
                </div>
                <div className="detail-row">
                  <div className="detail-row-label">연도</div>
                  <div className="detail-row-value">{project.exec_year || "—"}</div>
                </div>
                <div className="detail-row">
                  <div className="detail-row-label">공고일</div>
                  <div className="detail-row-value">{project.post_date || "—"}</div>
                </div>
                <div className="detail-row">
                  <div className="detail-row-label">발주처</div>
                  <div className="detail-row-value">{project.issuer || "—"}</div>
                </div>
                <div className="detail-row">
                  <div className="detail-row-label">활동 수</div>
                  <div className="detail-row-value">{project.activity_count}</div>
                </div>
              </div>
            </CardBody>
          </Card>

          <div style={{ marginTop: 20 }}>
            <Card>
              <CardHead
                title="활동 정보"
                sub="프로젝트에 포함된 활동과 대상농지 정보를 확인합니다."
                action={
                  <Btn variant="primary" size="sm" icon={<FolderPlus size={14} />} onClick={openCreateModal}>
                    활동 등록
                  </Btn>
                }
              />
              <CardBody>
                {project.activities.length === 0 ? (
                  <div className="tbl-empty muted" style={{ padding: 24 }}>
                    등록된 활동이 없습니다.
                  </div>
                ) : (
                  <div className="table-wrap">
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th>활동 ID</th>
                          <th>활동명</th>
                          <th>예상시작일자</th>
                          <th>예상종료일자</th>
                          <th>활동비 (원/ha)</th>
                          <th>대상농지</th>
                          <th>수정</th>
                        </tr>
                      </thead>
                      <tbody>
                        {project.activities.map((activity) => (
                          <tr key={activity.activity_id}>
                            <td className="cell-mono">{activity.activity_id}</td>
                            <td>{activity.activity_name || <span className="muted">—</span>}</td>
                            <td className="cell-mono">{activity.est_start_date || <span className="muted">—</span>}</td>
                            <td className="cell-mono">{activity.est_end_date || <span className="muted">—</span>}</td>
                            <td className="cell-mono">{formatCurrency(activity.subsidy_amt_display)}</td>
                            <td>{activity.target_parcel_names || <span className="muted">—</span>}</td>
                            <td>
                              <Btn
                                size="sm"
                                icon={<Pencil size={14} />}
                                onClick={() => openEditModal(activity)}
                              >
                                수정
                              </Btn>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardBody>
            </Card>
          </div>

          <div style={{ marginTop: 20 }}>
            <Card>
              <CardHead
                title="작업목록"
                sub="프로젝트와 활동에 속한 작업 목록을 확인합니다."
              />
              <CardBody>
                {jobs.length === 0 ? (
                  <div className="tbl-empty muted" style={{ padding: 24 }}>
                    등록된 작업이 없습니다.
                  </div>
                ) : (
                  <div className="table-wrap">
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th>활동명</th>
                          <th>작업 순번</th>
                        <th>작업코드/작업명</th>
                        <th>실행시점</th>
                        <th>선후행작업</th>
                          <th>예상시작일/규칙</th>
                          <th>예상종료일/규칙</th>
                        <th>필수</th>
                        <th>증빙</th>
                      </tr>
                      </thead>
                      <tbody>
                        {jobs.map((job) => (
                          <tr key={`${job.activity_id}-${job.job_seq}`}>
                            <td>{job.activity_name || <span className="muted">—</span>}</td>
                            <td className="cell-mono">{job.job_seq}</td>
                            <td>
                              <div className="cell-mono">{job.job_cd || "—"}</div>
                              <div>{job.job_name || <span className="muted">—</span>}</div>
                            </td>
                            <td>
                              <div>
                                {job.exec_point_name ? `활동 ${job.exec_point_name}` : <span className="muted">—</span>}
                              </div>
                            </td>
                            <td>
                              <div>{job.ref_job_name || <span className="muted">—</span>}</div>
                            </td>
                            <td>
                              <div className="cell-mono">{job.est_start_date || <span className="muted">—</span>}</div>
                              {job.start_date_rule ? (
                                <div style={{ marginTop: 6 }}>
                                <Btn
                                    size="sm"
                                    variant="outline"
                                    onClick={() => openRuleDialog("예상시작일 규칙", job.start_date_rule)}
                                    className="project-rule-btn"
                                  >
                                    상세보기
                                  </Btn>
                                </div>
                              ) : null}
                            </td>
                            <td>
                              <div className="cell-mono">{job.est_end_date || <span className="muted">—</span>}</div>
                              {job.end_date_rule ? (
                                <div style={{ marginTop: 6 }}>
                                <Btn
                                    size="sm"
                                    variant="outline"
                                    onClick={() => openRuleDialog("예상종료일 규칙", job.end_date_rule)}
                                    className="project-rule-btn"
                                  >
                                    상세보기
                                  </Btn>
                                </div>
                              ) : null}
                            </td>
                            <td style={{ textAlign: "center" }}>
                              <input type="checkbox" checked={job.mandatory_yn === "Y"} readOnly disabled />
                            </td>
                            <td style={{ textAlign: "center" }}>
                              <input type="checkbox" checked={job.evidence_yn === "Y"} readOnly disabled />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardBody>
            </Card>
          </div>
        </>
      ) : null}

      <Modal
        open={projectEditOpen}
        title="프로젝트 기본정보 수정"
        onClose={closeProjectEditModal}
        width="760px"
        footer={
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Btn
              variant="primary"
              icon={<Save size={16} />}
              onClick={() => void handleSaveProjectInfo()}
              disabled={saving}
            >
              {saving ? "저장 중..." : "저장"}
            </Btn>
            <Btn variant="outline" onClick={closeProjectEditModal} disabled={saving}>
              취소
            </Btn>
          </div>
        }
      >
        <div style={{ display: "grid", gap: 18 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 16,
            }}
          >
            <label style={{ display: "grid", gap: 8 }}>
              <span className="detail-row-label">사업명</span>
              <input
                value={project?.biz_name || ""}
                disabled
                style={{
                  height: 44,
                  borderRadius: 10,
                  border: "1px solid var(--line)",
                  background: "var(--bg-soft)",
                  padding: "0 14px",
                  color: "var(--muted)",
                  font: "inherit",
                }}
              />
            </label>
            <label style={{ display: "grid", gap: 8 }}>
              <span className="detail-row-label">프로젝트명</span>
              <input
                value={formProjectName}
                onChange={(e) => setFormProjectName(e.target.value)}
                style={{
                  height: 44,
                  borderRadius: 10,
                  border: "1px solid var(--line)",
                  background: "#fff",
                  padding: "0 14px",
                  font: "inherit",
                }}
              />
            </label>
            <label style={{ display: "grid", gap: 8 }}>
              <span className="detail-row-label">연도</span>
              <input
                value={formExecYear}
                inputMode="numeric"
                onChange={(e) => setFormExecYear(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
                style={{
                  height: 44,
                  borderRadius: 10,
                  border: "1px solid var(--line)",
                  background: "#fff",
                  padding: "0 14px",
                  font: "inherit",
                }}
              />
            </label>
            <label style={{ display: "grid", gap: 8 }}>
              <span className="detail-row-label">공고일</span>
              <input
                type="date"
                value={formPostDate}
                onChange={(e) => setFormPostDate(e.target.value)}
                style={{
                  height: 44,
                  borderRadius: 10,
                  border: "1px solid var(--line)",
                  background: "#fff",
                  padding: "0 14px",
                  font: "inherit",
                  color: "var(--ink)",
                }}
              />
            </label>
          </div>
          <label style={{ display: "grid", gap: 8 }}>
            <span className="detail-row-label">발주처</span>
            <input
              value={formIssuer}
              onChange={(e) => setFormIssuer(e.target.value)}
              style={{
                height: 44,
                borderRadius: 10,
                border: "1px solid var(--line)",
                background: "#fff",
                padding: "0 14px",
                font: "inherit",
              }}
            />
          </label>
        </div>
      </Modal>

      <Modal
        open={editOpen}
        title={isCreateMode ? "활동 등록" : "활동 정보 수정"}
        onClose={closeEditModal}
        width="760px"
        footer={
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Btn
              variant="primary"
              icon={<Save size={16} />}
              onClick={() => void handleSaveActivity()}
              disabled={saving}
            >
              {saving ? (isCreateMode ? "등록 중..." : "저장 중...") : (isCreateMode ? "등록" : "저장")}
            </Btn>
            <Btn variant="outline" onClick={closeEditModal} disabled={saving}>
              취소
            </Btn>
          </div>
        }
      >
        {isCreateMode || editingActivity ? (
          <div style={{ display: "grid", gap: 18 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 16,
              }}
            >
              <label style={{ display: "grid", gap: 8 }}>
                <span className="detail-row-label">활동 ID</span>
                <input
                  value={formActivityId}
                  onChange={(e) => setFormActivityId(e.target.value)}
                  disabled={!isCreateMode}
                  style={{
                    height: 44,
                    borderRadius: 10,
                    border: "1px solid var(--line)",
                    background: isCreateMode ? "#fff" : "var(--bg-soft)",
                    padding: "0 14px",
                    color: isCreateMode ? "var(--ink)" : "var(--muted)",
                    font: "inherit",
                  }}
                />
              </label>
              <label style={{ display: "grid", gap: 8 }}>
                <span className="detail-row-label">활동명</span>
                <input
                  value={formActivityName}
                  onChange={(e) => setFormActivityName(e.target.value)}
                  style={{
                    height: 44,
                    borderRadius: 10,
                    border: "1px solid var(--line)",
                    background: "#fff",
                    padding: "0 14px",
                    font: "inherit",
                  }}
                />
              </label>
              <label style={{ display: "grid", gap: 8 }}>
                <span className="detail-row-label">예상시작일자</span>
                <input
                  type="date"
                  value={formStartDate}
                  onChange={(e) => setFormStartDate(e.target.value)}
                  style={{
                    height: 44,
                    borderRadius: 10,
                    border: "1px solid var(--line)",
                    background: "#fff",
                    padding: "0 14px",
                    font: "inherit",
                    color: "var(--ink)",
                  }}
                />
              </label>
              <label style={{ display: "grid", gap: 8 }}>
                <span className="detail-row-label">예상종료일자</span>
                <input
                  type="date"
                  value={formEndDate}
                  onChange={(e) => setFormEndDate(e.target.value)}
                  style={{
                    height: 44,
                    borderRadius: 10,
                    border: "1px solid var(--line)",
                    background: "#fff",
                    padding: "0 14px",
                    font: "inherit",
                    color: "var(--ink)",
                  }}
                />
              </label>
            </div>

            <label style={{ display: "grid", gap: 8 }}>
              <span className="detail-row-label" style={{ whiteSpace: "nowrap" }}>
                활동비 (원/ha)
              </span>
              <input
                value={formSubsidy}
                inputMode="numeric"
                onChange={(e) => setFormSubsidy(formatNumberInput(e.target.value))}
                style={{
                  height: 44,
                  borderRadius: 10,
                  border: "1px solid var(--line)",
                  background: "#fff",
                  padding: "0 14px",
                  font: "inherit",
                }}
              />
            </label>

            <div style={{ display: "grid", gap: 10 }}>
              <div className="detail-row-label">대상 농지</div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: 10,
                  padding: 14,
                  border: "1px solid var(--line-soft)",
                  borderRadius: 12,
                  background: "var(--bg-soft)",
                }}
              >
                {parcelOptions.map((option) => (
                  <label
                    key={option.code}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 10px",
                      borderRadius: 10,
                      background: "#fff",
                      border: "1px solid var(--line-soft)",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={formParcelCodes.includes(option.code)}
                      onChange={() => toggleParcelCode(option.code)}
                    />
                    <span>{option.code_name}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={ruleDialogOpen}
        title={ruleDialogTitle || "규칙 상세"}
        onClose={() => setRuleDialogOpen(false)}
        width="560px"
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Btn variant="outline" onClick={() => setRuleDialogOpen(false)}>
              닫기
            </Btn>
          </div>
        }
      >
        <div
          style={{
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            lineHeight: 1.6,
            color: "var(--ink-soft)",
          }}
        >
          {ruleDialogContent}
        </div>
      </Modal>

      <Modal
        open={errorDialogOpen}
        title="오류"
        onClose={() => {
          if (saving) return
          setErrorDialogOpen(false)
        }}
        width="420px"
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Btn
              variant="primary"
              onClick={() => setErrorDialogOpen(false)}
              disabled={saving}
            >
              확인
            </Btn>
          </div>
        }
      >
        <div className="muted" style={{ whiteSpace: "pre-wrap" }}>
          {modalError || "알 수 없는 오류가 발생했습니다."}
        </div>
      </Modal>
    </div>
  )
}
