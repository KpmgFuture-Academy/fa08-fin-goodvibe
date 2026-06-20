"use client"

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { FolderPlus, Pencil, Save, Sparkles, Trash2 } from "lucide-react"
import { PageHeader } from "@/components/ui/PageHeader"
import { Card, CardBody, CardHead } from "@/components/ui/Card"
import { Btn } from "@/components/ui/Btn"
import { Modal } from "@/components/ui/Modal"
import { getRagFileDetail } from "@/lib/rag-api"
import {
  createProjectActivity,
  createProjectJob,
  deleteProjectActivity,
  deleteProjectInfo,
  deleteProjectJob,
  getProjectBaseBusinesses,
  getProjectAdminDetail,
  getProjectJobSetup,
  PROJECT_ADMIN_CONNECTION_ERROR_MESSAGE,
  suggestProjectActivityRuleFromRag,
  suggestProjectActivitiesFromRag,
  updateProjectActivity,
  updateProjectInfo,
  updateProjectJob,
} from "@/lib/project-api"
import type {
  ProjectAdminActivity,
  ProjectBaseBusinessItem,
  ProjectAdminCodeOption,
  ProjectAdminFarmJobOption,
  ProjectAdminItem,
  ProjectAdminJobItem,
  ProjectJobRepeatDraft,
  ProjectAdminParcelOption,
  ProjectFromRagActivitySuggestionItem,
} from "@/lib/project-types"
import type { RagFileItem } from "@/lib/rag-types"

type RepeatJobDraft = ProjectJobRepeatDraft

const ACTIVITY_SUGGEST_FLOW_STEPS = [
  "프로젝트 확인",
  "RAG 파일 연결 확인",
  "RAG Vector 조회",
  "활동명 후보 정리",
  "활동 관련 정보 정리",
  "제안 목록 반환",
] as const

const PRIMARY_ACTIVITY_SUGGESTION_LIMIT = 5
const REVIEW_ACTIVITY_SUGGESTION_LIMIT = 3
const PRIMARY_ACTIVITY_SCORE_THRESHOLD = 90

type SuggestedActivityDetail = {
  activity_name?: string
  heading_path?: string | null
  source_excerpt?: string | null
  main_content?: string | null
  description_suggestion?: string | null
  heading_context_lines?: string[]
  schedule_suggestion?: {
    est_start_date?: string | null
    est_end_date?: string | null
    job_cd?: string | null
    job_name?: string | null
    match_score?: number | null
  } | null
  parcel_suggestion?: {
    selected_codes?: string[]
    selected_names?: string[]
    rule_candidate_codes?: string[]
  } | null
  unit_price?: {
    amount?: number
    raw_text?: string
  } | null
}

const fieldInputStyle = {
  height: 44,
  borderRadius: 10,
  border: "1px solid var(--line)",
  background: "#fff",
  padding: "0 14px",
  font: "inherit",
} as const

const fieldTextareaStyle = {
  minHeight: 92,
  borderRadius: 10,
  border: "1px solid var(--line)",
  background: "#fff",
  padding: "12px 14px",
  font: "inherit",
  resize: "vertical" as const,
} as const

const fieldCheckboxStyle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
} as const

const DEFAULT_THIS_PRE_RULE = '{"ref":"THIS","seq":"PRE","offset":0}'
const DEFAULT_REF_END_RULE = '{"ref":"REF","condition":"END","offset":0}'

function normalizeActivityRuleForEditor(rule: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!rule) return null
  const nextRule = JSON.parse(JSON.stringify(rule)) as Record<string, unknown>

  const normalizeDateRule = (key: "시작일" | "종료일") => {
    const raw = nextRule[key]
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return
    const dateRule = raw as Record<string, unknown>
    const referenceJob = String(dateRule["기준작업"] || "").trim()
    if (!referenceJob) return
    const hasElapsedDays =
      dateRule["경과일수"] != null ||
      dateRule["최소경과일수"] != null ||
      dateRule["최대경과일수"] != null
    if (!hasElapsedDays) {
      dateRule["경과일수"] = 0
    }
  }

  normalizeDateRule("시작일")
  normalizeDateRule("종료일")
  return nextRule
}

function normalizeRuleForReferenceJob(ruleText: string | null | undefined, hasReferenceJob: boolean): string {
  const trimmed = String(ruleText || "").trim()
  if (!trimmed) return ""
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return trimmed
    }
    const ref = String(parsed.ref || "").trim().toUpperCase()
    if (hasReferenceJob || ref !== "REF") {
      return JSON.stringify(parsed)
    }
    return ""
  } catch {
    return trimmed
  }
}

function mergeRepeatJobDraftWithDefaults(
  defaultDraft?: RepeatJobDraft | null,
  overrideDraft?: RepeatJobDraft | null,
): RepeatJobDraft {
  const safeDefaultDraft: RepeatJobDraft = {
    exec_point_cd: defaultDraft?.exec_point_cd || "",
    ref_job_code_query: defaultDraft?.ref_job_code_query || "",
    ref_job_cd: defaultDraft?.ref_job_cd || "",
    est_start_date: defaultDraft?.est_start_date || "",
    start_date_rule: defaultDraft?.start_date_rule || "",
    est_end_date: defaultDraft?.est_end_date || "",
    end_date_rule: defaultDraft?.end_date_rule || "",
    mandatory: defaultDraft?.mandatory ?? true,
    evidence: defaultDraft?.evidence ?? true,
  }
  const nextDraft = { ...safeDefaultDraft, ...(overrideDraft || {}) }
  return {
    ...nextDraft,
    exec_point_cd: nextDraft.exec_point_cd || safeDefaultDraft.exec_point_cd || "",
    ref_job_code_query: nextDraft.ref_job_code_query || "",
    ref_job_cd: nextDraft.ref_job_cd || "",
    est_start_date: nextDraft.est_start_date || safeDefaultDraft.est_start_date || "",
    start_date_rule: nextDraft.start_date_rule || "",
    est_end_date: nextDraft.est_end_date || safeDefaultDraft.est_end_date || "",
    end_date_rule: nextDraft.end_date_rule || "",
    mandatory: typeof nextDraft.mandatory === "boolean" ? nextDraft.mandatory : (safeDefaultDraft.mandatory ?? true),
    evidence: typeof nextDraft.evidence === "boolean" ? nextDraft.evidence : (safeDefaultDraft.evidence ?? true),
  }
}

function normalizeActivityNameText(value: string | null | undefined): string {
  return String(value || "").replace(/\r?\n+/g, " ").replace(/\s+/g, " ").trim()
}

function normalizeMultilineText(value: string | null | undefined): string {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .trim()
}

function splitNormalizedLines(value: string | null | undefined): string[] {
  return normalizeMultilineText(value)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
}

function formatSubsidyHintPerSquareMeter(value: string | null | undefined): string {
  const text = String(value || "").trim()
  if (!text) return ""

  const explicitPerSquareMeter = text.match(/\(?\s*([\d.]+)\s*원\s*\/\s*(?:㎡|m2)\s*\)?/i)
  if (explicitPerSquareMeter) {
    return `${explicitPerSquareMeter[1]}원/제곱미터`
  }

  const tenThousandWonPerHa = text.match(/([\d.]+)\s*만원\s*\/\s*ha/i)
  if (tenThousandWonPerHa) {
    return `${tenThousandWonPerHa[1]}원/제곱미터`
  }

  const wonPerHa = text.match(/([\d,]+)\s*원\s*\/\s*ha/i)
  if (wonPerHa) {
    const amount = Number(wonPerHa[1].replace(/,/g, ""))
    if (Number.isFinite(amount)) {
      const perSquareMeter = amount / 10000
      return `${Number.isInteger(perSquareMeter) ? perSquareMeter.toLocaleString("ko-KR") : perSquareMeter.toLocaleString("ko-KR", { maximumFractionDigits: 4 })}원/제곱미터`
    }
  }

  return text
}

function findExecPointCodeFromOptions(options: ProjectAdminCodeOption[], keyword: string, fallback: string) {
  const matched = options.find((option) => option.code_name?.includes(keyword) || option.code?.toUpperCase() === fallback)
  return matched?.code || fallback
}

function normalizeActivityCompareKey(value: string | null | undefined): string {
  return normalizeActivityNameText(value).replace(/[^0-9a-zA-Z가-힣]/g, "").toLowerCase()
}

function chooseKoreanObjectConjunction(value: string): "과" | "와" {
  const text = String(value || "").trim()
  if (!text) return "와"
  const lastChar = text[text.length - 1]
  const code = lastChar.charCodeAt(0)
  if (code < 0xac00 || code > 0xd7a3) return "와"
  return (code - 0xac00) % 28 === 0 ? "와" : "과"
}

function getNextActivityOrder(project: ProjectAdminItem | null): string {
  const nextOrder = Math.max(1, (project?.activities?.length || 0) + 1)
  return String(Math.min(nextOrder, 99)).padStart(2, "0")
}

async function buildProjectHashId(
  name: string,
  issuer: string,
  execYear: string,
): Promise<string> {
  const normalizedName = name.trim()
  const normalizedIssuer = issuer.trim()
  const normalizedYear = execYear.trim()
  if (!normalizedName) {
    return ""
  }
  const yearNumber = Number.parseInt(normalizedYear, 10)
  const yearPrefix =
    Number.isFinite(yearNumber) && normalizedYear
      ? String(Math.abs(yearNumber) % 100).padStart(2, "0")
      : ""
  const source = [normalizedName, normalizedIssuer].join("||")
  const bytes = new TextEncoder().encode(source)
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  const hashSuffix = Array.from(new Uint8Array(digest))
    .slice(0, 4)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()
    .slice(0, 6)
  return yearPrefix ? `${yearPrefix}${hashSuffix}` : hashSuffix
}

async function buildActivityHashId(
  activityName: string,
  orderText: string,
): Promise<string> {
  const normalizedName = activityName.trim()
  const normalizedOrder = orderText.trim().replace(/[^\d]/g, "").slice(0, 2)
  if (!normalizedName || !normalizedOrder) {
    return ""
  }
  const prefix = normalizedOrder.padStart(2, "0")
  const bytes = new TextEncoder().encode(normalizedName)
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  const hashSuffix = Array.from(new Uint8Array(digest))
    .slice(0, 3)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()
  return `${prefix}${hashSuffix}`
}

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ prj_id: string }>
}) {
  const { prj_id } = use(params)
  const [project, setProject] = useState<ProjectAdminItem | null>(null)
  const [parcelOptions, setParcelOptions] = useState<ProjectAdminParcelOption[]>([])
  const [jobs, setJobs] = useState<ProjectAdminJobItem[]>([])
  const [jobDialogJobs, setJobDialogJobs] = useState<ProjectAdminJobItem[]>([])
  const [jobDialogJobOptions, setJobDialogJobOptions] = useState<ProjectAdminFarmJobOption[]>([])
  const [jobDialogExecPointOptions, setJobDialogExecPointOptions] = useState<ProjectAdminCodeOption[]>([])
  const [jobDialogSuggestedRepeatCount, setJobDialogSuggestedRepeatCount] = useState(1)
  const [jobDialogSuggestedJobCode, setJobDialogSuggestedJobCode] = useState("")
  const [jobDialogSuggestedJobQuery, setJobDialogSuggestedJobQuery] = useState("")
  const [jobDialogSuggestedDrafts, setJobDialogSuggestedDrafts] = useState<ProjectJobRepeatDraft[]>([])
  const [jobDialogLoading, setJobDialogLoading] = useState(false)
  const [activityCreatePreparing, setActivityCreatePreparing] = useState(false)
  const [baseBusinesses, setBaseBusinesses] = useState<ProjectBaseBusinessItem[]>([])
  const [ragFile, setRagFile] = useState<RagFileItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [jobSaving, setJobSaving] = useState(false)
  const [deletingProject, setDeletingProject] = useState(false)
  const [deletingActivity, setDeletingActivity] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [modalError, setModalError] = useState("")
  const [errorDialogOpen, setErrorDialogOpen] = useState(false)
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false)
  const [ruleDialogTitle, setRuleDialogTitle] = useState("")
  const [ruleDialogContent, setRuleDialogContent] = useState("")
  const [editOpen, setEditOpen] = useState(false)
  const [projectEditMode, setProjectEditMode] = useState(false)
  const [projectDeleteDialogOpen, setProjectDeleteDialogOpen] = useState(false)
  const [activityDeleteDialogOpen, setActivityDeleteDialogOpen] = useState(false)
  const [repeatJobModeDialogOpen, setRepeatJobModeDialogOpen] = useState(false)
  const [jobDialogOpen, setJobDialogOpen] = useState(false)
  const [jobEditOpen, setJobEditOpen] = useState(false)
  const [repeatJobOpen, setRepeatJobOpen] = useState(false)
  const [isCreateMode, setIsCreateMode] = useState(false)
  const [isCreateJobMode, setIsCreateJobMode] = useState(false)
  const [editingActivity, setEditingActivity] = useState<ProjectAdminActivity | null>(null)
  const [activityToDelete, setActivityToDelete] = useState<ProjectAdminActivity | null>(null)
  const [selectedActivityForJobs, setSelectedActivityForJobs] = useState<ProjectAdminActivity | null>(null)
  const [editingJob, setEditingJob] = useState<ProjectAdminJobItem | null>(null)
  const [selectedParcelCodeForJobs, setSelectedParcelCodeForJobs] = useState("all")
  const [formProjectName, setFormProjectName] = useState("")
  const [formProjectId, setFormProjectId] = useState("")
  const [formAutoGenerateProjectId, setFormAutoGenerateProjectId] = useState(true)
  const [formBizId, setFormBizId] = useState("")
  const [formExecYear, setFormExecYear] = useState("")
  const [formPostDate, setFormPostDate] = useState("")
  const [formIssuer, setFormIssuer] = useState("")
  const [formRagFileId, setFormRagFileId] = useState("")
  const [formActivityId, setFormActivityId] = useState("")
  const [formActivityOrder, setFormActivityOrder] = useState("01")
  const [formActivityName, setFormActivityName] = useState("")
  const [formActivityRule, setFormActivityRule] = useState<Record<string, unknown> | null>(null)
  const [formActivityRuleText, setFormActivityRuleText] = useState("")
  const [formActivityDescription, setFormActivityDescription] = useState("")
  const [formStartDate, setFormStartDate] = useState("")
  const [formEndDate, setFormEndDate] = useState("")
  const [formSubsidy, setFormSubsidy] = useState("")
  const [formSubsidyHint, setFormSubsidyHint] = useState("")
  const [formParcelCodes, setFormParcelCodes] = useState<string[]>([])
  const [jobFormSeq, setJobFormSeq] = useState("")
  const [jobFormCodeQuery, setJobFormCodeQuery] = useState("")
  const [jobFormCode, setJobFormCode] = useState("")
  const [jobFormExecPoint, setJobFormExecPoint] = useState("")
  const [jobFormPriorJobCodeQuery, setJobFormPriorJobCodeQuery] = useState("")
  const [jobFormPriorJobCode, setJobFormPriorJobCode] = useState("")
  const [jobFormStartDate, setJobFormStartDate] = useState("")
  const [jobFormStartRule, setJobFormStartRule] = useState("")
  const [jobFormEndDate, setJobFormEndDate] = useState("")
  const [jobFormEndRule, setJobFormEndRule] = useState("")
  const [jobFormMandatory, setJobFormMandatory] = useState(false)
  const [jobFormEvidence, setJobFormEvidence] = useState(false)
  const [repeatJobCount, setRepeatJobCount] = useState("1")
  const [selectedRepeatJobIndex, setSelectedRepeatJobIndex] = useState(0)
  const [repeatJobDrafts, setRepeatJobDrafts] = useState<RepeatJobDraft[]>([])
  const [suggestingActivities, setSuggestingActivities] = useState(false)
  const [activitySuggestions, setActivitySuggestions] = useState<ProjectFromRagActivitySuggestionItem[]>([])
  const [activitySuggestFlowOpen, setActivitySuggestFlowOpen] = useState(false)
  const [activitySuggestFlowStep, setActivitySuggestFlowStep] = useState(0)
  const [activitySuggestFlowStatus, setActivitySuggestFlowStatus] = useState("")
  const [activitySuggestFlowDone, setActivitySuggestFlowDone] = useState(false)
  const activitySuggestFlowTimerRef = useRef<number | null>(null)

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

  const selectedActivityJobs = useMemo(
    () => jobDialogJobs,
    [jobDialogJobs],
  )

  const selectedActivityParcelOptions = useMemo(() => {
    const codes = selectedActivityForJobs?.target_parcel_codes || []
    const names = selectedActivityForJobs?.target_parcels || []
    return codes.map((code, index) => ({
      code,
      code_name: names[index] || code,
    }))
  }, [selectedActivityForJobs])

  const repeatJobCountOptions = useMemo(
    () => Array.from({ length: 10 }, (_, index) => String(index + 1)),
    [],
  )

  const nextJobSeq = useMemo(
    () => selectedActivityJobs.reduce((max, job) => Math.max(max, job.job_seq), 0) + 1,
    [selectedActivityJobs],
  )

  const repeatJobCountValue = useMemo(() => Number(repeatJobCount) || 1, [repeatJobCount])

  const repeatJobSeqNumbers = useMemo(
    () => Array.from({ length: repeatJobCountValue }, (_, index) => nextJobSeq + index),
    [nextJobSeq, repeatJobCountValue],
  )

  const repeatJobDefaultExecPoints = useMemo(() => {
    const startExecPoint = findExecPointCode("시작", "START")
    const midExecPoint = findExecPointCode("중간", "MID")
    const endExecPoint = findExecPointCode("종료", "END")
    return Array.from({ length: repeatJobCountValue }, (_, index) => {
      if (index === 0) return startExecPoint
      if (index === repeatJobCountValue - 1) return endExecPoint
      return midExecPoint
    })
  }, [jobDialogExecPointOptions, repeatJobCountValue])

  const repeatJobDefaultDrafts = useMemo<RepeatJobDraft[]>(
    () =>
      Array.from({ length: repeatJobCountValue }, (_, index) => ({
        exec_point_cd: repeatJobDefaultExecPoints[index] || "",
        ref_job_code_query: null,
        ref_job_cd: null,
        est_start_date: selectedActivityForJobs?.est_start_date || "",
        start_date_rule: null,
        est_end_date: selectedActivityForJobs?.est_end_date || "",
        end_date_rule: null,
        mandatory: true,
        evidence: true,
      })),
    [repeatJobCountValue, repeatJobDefaultExecPoints, selectedActivityForJobs],
  )

  const selectedRepeatJobDraft = repeatJobDrafts[selectedRepeatJobIndex] || repeatJobDefaultDrafts[selectedRepeatJobIndex]
  const selectedRepeatExecPointIsStart = useMemo(() => {
    const execPointCd = String(selectedRepeatJobDraft?.exec_point_cd || "").trim().toUpperCase()
    if (!execPointCd) return false
    const matched = jobDialogExecPointOptions.find((option) => String(option.code || "").trim().toUpperCase() === execPointCd)
    const execPointName = String(matched?.code_name || "").trim()
    return execPointCd === "START" || execPointName.includes("시작")
  }, [jobDialogExecPointOptions, selectedRepeatJobDraft?.exec_point_cd])
  const selectedParcelLabel = useMemo(() => {
    if (selectedParcelCodeForJobs === "all") return "전체 대상 농지"
    return (
      selectedActivityParcelOptions.find((option) => option.code === selectedParcelCodeForJobs)?.code_name ||
      selectedParcelCodeForJobs
    )
  }, [selectedActivityParcelOptions, selectedParcelCodeForJobs])

  const sortedActivitySuggestions = useMemo(
    () =>
      [...activitySuggestions].sort((left, right) => {
        const leftExact = left.exact_label_match_count || 0
        const rightExact = right.exact_label_match_count || 0
        if (leftExact !== rightExact) return rightExact - leftExact
        const leftHeader = left.activity_header_count || 0
        const rightHeader = right.activity_header_count || 0
        if (leftHeader !== rightHeader) return rightHeader - leftHeader
        return (right.match_score || 0) - (left.match_score || 0)
      }),
    [activitySuggestions],
  )

  const primaryActivitySuggestions = useMemo(() => {
    const strongItems = sortedActivitySuggestions.filter(
      (item) =>
        (item.exact_label_match_count || 0) > 0 ||
        (item.match_score || 0) >= PRIMARY_ACTIVITY_SCORE_THRESHOLD,
    )
    const sourceItems =
      strongItems.length > 0 ? strongItems : sortedActivitySuggestions
    return sourceItems.slice(0, PRIMARY_ACTIVITY_SUGGESTION_LIMIT)
  }, [sortedActivitySuggestions])

  const reviewActivitySuggestions = useMemo(() => {
    const primaryIds = new Set(primaryActivitySuggestions.map((item) => item.suggestion_id))
    return sortedActivitySuggestions
      .filter((item) => !primaryIds.has(item.suggestion_id))
      .slice(0, REVIEW_ACTIVITY_SUGGESTION_LIMIT)
  }, [primaryActivitySuggestions, sortedActivitySuggestions])

  const hiddenActivitySuggestionCount = Math.max(
    0,
    activitySuggestions.length -
      primaryActivitySuggestions.length -
      reviewActivitySuggestions.length,
  )

  const registeredActivityNameSet = useMemo(
    () =>
      new Set(
        (project?.activities || [])
          .map((activity) => activity.activity_name?.replace(/\s+/g, "").trim().toLowerCase())
          .filter(Boolean),
      ),
    [project?.activities],
  )

  const activityOrderOptions = useMemo(
    () => Array.from({ length: 10 }, (_, index) => String(index + 1).padStart(2, "0")),
    [],
  )

  const filteredJobOptions = useMemo(() => {
    const query = jobFormCodeQuery.trim().toLowerCase()
    if (!query) return jobDialogJobOptions
    return jobDialogJobOptions.filter((option) => {
      const code = (option.job_cd || "").toLowerCase()
      const name = (option.job_name || "").toLowerCase()
      return code.includes(query) || name.includes(query)
    })
  }, [jobFormCodeQuery, jobDialogJobOptions])

  const filteredPriorJobOptions = useMemo(() => {
    const query = jobFormPriorJobCodeQuery.trim().toLowerCase()
    if (!query) return jobDialogJobOptions
    return jobDialogJobOptions.filter((option) => {
      const code = (option.job_cd || "").toLowerCase()
      const name = (option.job_name || "").toLowerCase()
      return code.includes(query) || name.includes(query)
    })
  }, [jobFormPriorJobCodeQuery, jobDialogJobOptions])

  const filteredRepeatPriorJobOptions = useMemo(() => {
    const query = (selectedRepeatJobDraft?.ref_job_code_query || "").trim().toLowerCase()
    if (!query) return jobDialogJobOptions
    return jobDialogJobOptions.filter((option) => {
      const code = (option.job_cd || "").toLowerCase()
      const name = (option.job_name || "").toLowerCase()
      return code.includes(query) || name.includes(query)
    })
  }, [jobDialogJobOptions, selectedRepeatJobDraft])

  const selectedBaseBusiness = useMemo(
    () => baseBusinesses.find((item) => item.biz_id === formBizId) || null,
    [baseBusinesses, formBizId],
  )

  const loadProjectEditResources = useCallback(async () => {
    const tasks: Promise<void>[] = []

    if (baseBusinesses.length === 0) {
      tasks.push(
        getProjectBaseBusinesses()
          .then((response) => {
            setBaseBusinesses(response.items || [])
          })
          .catch(() => {
            // keep current UI responsive even if edit-only resources fail
          }),
      )
    }

    if (tasks.length > 0) {
      await Promise.all(tasks)
    }
  }, [baseBusinesses.length])

  useEffect(() => {
    const query = jobFormCodeQuery.trim().toLowerCase()
    if (!query) return
    const matched = filteredJobOptions[0]
    if (!matched) return
    if (matched.job_cd !== jobFormCode) {
      setJobFormCode(matched.job_cd)
    }
  }, [filteredJobOptions, jobFormCode, jobFormCodeQuery])

  useEffect(() => {
    const query = jobFormPriorJobCodeQuery.trim().toLowerCase()
    if (!query) return
    if (jobFormPriorJobCode) return
    const matched = filteredPriorJobOptions[0]
    if (!matched) return
    if (matched.job_cd !== jobFormPriorJobCode) {
      setJobFormPriorJobCode(matched.job_cd)
    }
  }, [filteredPriorJobOptions, jobFormPriorJobCode, jobFormPriorJobCodeQuery])

  useEffect(() => {
    const query = (selectedRepeatJobDraft?.ref_job_code_query || "").trim().toLowerCase()
    if (!query) return
    if (selectedRepeatJobDraft?.ref_job_cd) return
    const matched = filteredRepeatPriorJobOptions[0]
    if (!matched) return
    if (matched.job_cd !== selectedRepeatJobDraft?.ref_job_cd) {
      updateSelectedRepeatJobDraft((draft) => ({
        ...draft,
        ref_job_cd: matched.job_cd,
      }))
    }
  }, [filteredRepeatPriorJobOptions, selectedRepeatJobDraft])

  useEffect(() => {
    if (selectedRepeatJobIndex < repeatJobCountValue) return
    setSelectedRepeatJobIndex(Math.max(0, repeatJobCountValue - 1))
  }, [repeatJobCountValue, selectedRepeatJobIndex])

  useEffect(() => {
    setRepeatJobDrafts((prev) =>
      Array.from({ length: repeatJobCountValue }, (_, index) =>
        mergeRepeatJobDraftWithDefaults(repeatJobDefaultDrafts[index], prev[index]),
      ),
    )
  }, [repeatJobCountValue, repeatJobDefaultDrafts])

  useEffect(() => {
    if (!projectEditMode || !formAutoGenerateProjectId) {
      return
    }
    let active = true
    buildProjectHashId(formProjectName, formIssuer, formExecYear)
      .then((nextId) => {
        if (!active) return
        setFormProjectId(nextId)
      })
      .catch(() => {
        if (!active) return
        setFormProjectId("")
      })
    return () => {
      active = false
    }
  }, [formAutoGenerateProjectId, formExecYear, formIssuer, formProjectName, projectEditMode])

  useEffect(() => {
    if (!isCreateMode) {
      return
    }
    let active = true
    buildActivityHashId(formActivityName, formActivityOrder)
      .then((nextId) => {
        if (!active) return
        setFormActivityId(nextId)
      })
      .catch(() => {
        if (!active) return
        setFormActivityId("")
      })
    return () => {
      active = false
    }
  }, [formActivityName, formActivityOrder, isCreateMode])

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const data = await getProjectAdminDetail(prj_id)
      setProject(data.project || null)
      setParcelOptions(data.parcel_options || [])
      setJobs(data.jobs || [])
      setRagFile(null)
      const ragFileId = String(data.project?.rag_file_id || "").trim()
      if (ragFileId) {
        void getRagFileDetail(ragFileId)
          .then((ragDetail) => {
            setRagFile(ragDetail.item || null)
          })
          .catch((ragError) => {
            console.warn(ragError)
            setRagFile(null)
          })
      }
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
    const normalizedActivityRule = normalizeActivityRuleForEditor(activity.activity_rule || null)
    setIsCreateMode(false)
    setEditingActivity(activity)
    setFormActivityId(activity.activity_id || "")
    setFormActivityOrder(String(activity.activity_id || "").slice(0, 2) || "01")
    setFormActivityName(activity.activity_name || "")
    setFormActivityRule(normalizedActivityRule)
    setFormActivityRuleText(
      normalizedActivityRule ? JSON.stringify(normalizedActivityRule, null, 2) : "",
    )
    setFormActivityDescription(activity.description || "")
    setFormStartDate(activity.est_start_date || "")
    setFormEndDate(activity.est_end_date || "")
    setFormSubsidy(
      activity.subsidy_amt_display != null
        ? Math.round(Number(activity.subsidy_amt_display)).toLocaleString("ko-KR")
        : "",
    )
    setFormSubsidyHint("")
    setFormParcelCodes(activity.target_parcel_codes || [])
    setModalError("")
    setErrorDialogOpen(false)
    setEditOpen(true)
  }

  function openProjectEditMode() {
    if (!project) return
    if ((project.activity_count || 0) > 0) return
    setFormProjectId(project.project_id || project.prj_id || "")
    setFormAutoGenerateProjectId(true)
    setFormBizId(project.biz_id || "")
    setFormProjectName(project.prj_name || "")
    setFormExecYear(project.exec_year != null ? String(project.exec_year) : "")
    setFormPostDate(project.post_date || "")
    setFormIssuer(project.issuer || "")
    setFormRagFileId(project.rag_file_id || "")
    setModalError("")
    setErrorDialogOpen(false)
    setProjectEditMode(true)
    void loadProjectEditResources()
  }

  function closeProjectEditMode() {
    if (saving) return
    setProjectEditMode(false)
    setModalError("")
    setErrorDialogOpen(false)
  }

  function openProjectDeleteDialog() {
    if (!project || deletingProject) return
    setNotice("")
    setModalError("")
    setErrorDialogOpen(false)
    setProjectDeleteDialogOpen(true)
  }

  function closeProjectDeleteDialog() {
    if (deletingProject) return
    setProjectDeleteDialogOpen(false)
  }

  function openActivityDeleteDialog(activity: ProjectAdminActivity) {
    if (deletingActivity) return
    setNotice("")
    setModalError("")
    setErrorDialogOpen(false)
    setActivityToDelete(activity)
    setActivityDeleteDialogOpen(true)
  }

  function closeActivityDeleteDialog() {
    if (deletingActivity) return
    setActivityDeleteDialogOpen(false)
    setActivityToDelete(null)
  }

  function closeRepeatJobModeDialog() {
    setRepeatJobModeDialogOpen(false)
  }

  function openCreateModal() {
    const nextActivityOrder = getNextActivityOrder(project)
    setIsCreateMode(true)
    setEditingActivity(null)
    setFormActivityId("")
    setFormActivityOrder(nextActivityOrder)
    setFormActivityName("")
    setFormActivityRule(null)
    setFormActivityRuleText("")
    setFormActivityDescription("")
    setFormStartDate("")
    setFormEndDate("")
    setFormSubsidy("")
    setFormSubsidyHint("")
    setFormParcelCodes([])
    setModalError("")
    setErrorDialogOpen(false)
    setEditOpen(true)
  }

  async function openCreateModalFromSuggestion(item: ProjectFromRagActivitySuggestionItem) {
    if (!project) return
    setActivityCreatePreparing(true)
    try {
      const nextActivityOrder = getNextActivityOrder(project)
      let suggestedName = normalizeActivityNameText(item.activity_name)
      let suggestedSubsidy = ""
      let suggestedStartDate = ""
      let suggestedEndDate = ""
      let suggestedDescription = ""
      let suggestedActivityRule: Record<string, unknown> | null = null
      let suggestedParcelCodes: string[] = []

      try {
        const parsed = JSON.parse(item.detail_text || "{}") as SuggestedActivityDetail
        suggestedName = normalizeActivityNameText(String(parsed.activity_name || item.activity_name || ""))
        suggestedDescription = String(parsed.description_suggestion || parsed.main_content || "").trim()
        const amount = Number(parsed.unit_price?.amount || 0)
        const rawText = String(parsed.unit_price?.raw_text || "").trim()
        if (amount > 0) {
          suggestedSubsidy = amount.toLocaleString("ko-KR")
        }
        suggestedStartDate = String(parsed.schedule_suggestion?.est_start_date || "").trim()
        suggestedEndDate = String(parsed.schedule_suggestion?.est_end_date || "").trim()
        suggestedParcelCodes = Array.isArray(parsed.parcel_suggestion?.selected_codes)
          ? parsed.parcel_suggestion?.selected_codes?.map((code) => String(code || "").trim()).filter(Boolean) || []
          : []
        setFormSubsidyHint(rawText)
      } catch {
        suggestedName = normalizeActivityNameText(item.activity_name)
        setFormSubsidyHint("")
      }

      try {
        const response = await suggestProjectActivityRuleFromRag(project.prj_id, {
          activity_name: suggestedName,
          description: suggestedDescription || null,
        })
        suggestedActivityRule =
          response.activity_rule_suggestion &&
          typeof response.activity_rule_suggestion === "object" &&
          !Array.isArray(response.activity_rule_suggestion)
            ? response.activity_rule_suggestion
            : null
      } catch {
        suggestedActivityRule = null
      }

      setIsCreateMode(true)
      setEditingActivity(null)
      setFormActivityId("")
      setFormActivityOrder(nextActivityOrder)
      setFormActivityName(suggestedName)
      const normalizedActivityRule = normalizeActivityRuleForEditor(suggestedActivityRule)
      setFormActivityRule(normalizedActivityRule)
      setFormActivityRuleText(
        normalizedActivityRule ? JSON.stringify(normalizedActivityRule, null, 2) : "",
      )
      setFormActivityDescription(suggestedDescription)
      setFormStartDate(suggestedStartDate)
      setFormEndDate(suggestedEndDate)
      setFormSubsidy(suggestedSubsidy)
      setFormParcelCodes(suggestedParcelCodes)
      setModalError("")
      setErrorDialogOpen(false)
      setEditOpen(true)
    } finally {
      setActivityCreatePreparing(false)
    }
  }

  function closeEditModal() {
    if (saving) return
    setEditOpen(false)
    setIsCreateMode(false)
    setEditingActivity(null)
    setFormActivityId("")
    setFormActivityOrder("01")
    setFormActivityRule(null)
    setFormActivityRuleText("")
    setFormActivityDescription("")
    setFormSubsidyHint("")
    setModalError("")
    setErrorDialogOpen(false)
  }

  function openJobDialog(activity: ProjectAdminActivity) {
    setSelectedActivityForJobs(activity)
    setSelectedParcelCodeForJobs("all")
    setJobDialogJobs([])
    setJobDialogJobOptions([])
    setJobDialogExecPointOptions([])
    setJobDialogSuggestedRepeatCount(1)
    setJobDialogSuggestedJobCode("")
    setJobDialogSuggestedJobQuery("")
    setJobDialogSuggestedDrafts([])
    closeJobEditModal()
    closeRepeatJobModal()
    setJobDialogLoading(true)
    void getProjectJobSetup(project?.prj_id || prj_id, activity.activity_id)
      .then((response) => {
        setJobDialogJobs(response.jobs || [])
        setJobDialogJobOptions(response.job_options || [])
        setJobDialogExecPointOptions(response.exec_point_options || [])
        setJobDialogSuggestedRepeatCount(Math.max(1, Math.min(10, Number(response.repeat_count) || 1)))
        setJobDialogSuggestedJobCode(response.repeat_job_cd || "")
        setJobDialogSuggestedJobQuery(response.repeat_job_name || response.repeat_job_cd || "")
        setJobDialogSuggestedDrafts(response.repeat_job_drafts || [])
        setJobDialogOpen(true)
      })
      .catch((e) => {
        setModalError(e instanceof Error ? e.message : PROJECT_ADMIN_CONNECTION_ERROR_MESSAGE)
        setErrorDialogOpen(true)
        setJobDialogOpen(false)
        setJobDialogJobs([])
        setJobDialogJobOptions([])
        setJobDialogExecPointOptions([])
        setJobDialogSuggestedRepeatCount(1)
        setJobDialogSuggestedJobCode("")
        setJobDialogSuggestedJobQuery("")
        setJobDialogSuggestedDrafts([])
      })
      .finally(() => {
        setJobDialogLoading(false)
      })
  }

  function closeJobDialog() {
    if (jobSaving) return
    setJobDialogOpen(false)
    setSelectedActivityForJobs(null)
    setJobDialogJobs([])
    setJobDialogJobOptions([])
    setJobDialogExecPointOptions([])
    setJobDialogSuggestedRepeatCount(1)
    setJobDialogSuggestedJobCode("")
    setJobDialogSuggestedJobQuery("")
    setJobDialogSuggestedDrafts([])
    setJobDialogLoading(false)
    closeJobEditModal()
    closeRepeatJobModal()
  }

  function prepareRepeatJobModal({
    repeatCount = "1",
    jobCode = "",
    jobQuery = "",
    drafts = [],
  }: {
    repeatCount?: string
    jobCode?: string
    jobQuery?: string
    drafts?: RepeatJobDraft[]
  } = {}) {
    if (!selectedActivityForJobs) return
    const repeatCountNumber = Math.max(1, Number(repeatCount) || 1)
    const startExecPoint = findExecPointCode("시작", "START")
    const midExecPoint = findExecPointCode("중간", "MID")
    const endExecPoint = findExecPointCode("종료", "END")
    const immediateDefaultDrafts = Array.from({ length: repeatCountNumber }, (_, index) => ({
      exec_point_cd: index === 0 ? startExecPoint : index === repeatCountNumber - 1 ? endExecPoint : midExecPoint,
      ref_job_code_query: "",
      ref_job_cd: "",
      est_start_date: selectedActivityForJobs.est_start_date || "",
      start_date_rule: "",
      est_end_date: selectedActivityForJobs.est_end_date || "",
      end_date_rule: "",
      mandatory: true,
      evidence: true,
    }))
    setEditingJob(null)
    setJobFormSeq(String(nextJobSeq))
    setJobFormCodeQuery(jobQuery)
    setJobFormCode(jobCode)
    setJobFormExecPoint("")
    setJobFormPriorJobCodeQuery("")
    setJobFormPriorJobCode("")
    setJobFormStartDate(selectedActivityForJobs.est_start_date || "")
    setJobFormStartRule("")
    setJobFormEndDate(selectedActivityForJobs.est_end_date || "")
    setJobFormEndRule("")
    setJobFormMandatory(true)
    setJobFormEvidence(true)
    setRepeatJobCount(repeatCount)
    setSelectedRepeatJobIndex(0)
    setRepeatJobDrafts(
      Array.from({ length: repeatCountNumber }, (_, index) =>
        mergeRepeatJobDraftWithDefaults(immediateDefaultDrafts[index], drafts[index]),
      ),
    )
    setModalError("")
    setErrorDialogOpen(false)
    setRepeatJobOpen(true)
  }

  function openRepeatJobModalManual() {
    closeRepeatJobModeDialog()
    prepareRepeatJobModal({
      repeatCount: "1",
      jobCode: "",
      jobQuery: "",
      drafts: [],
    })
  }

  function openRepeatJobModalFromRag() {
    closeRepeatJobModeDialog()
    prepareRepeatJobModal({
      repeatCount: String(jobDialogSuggestedRepeatCount || 1),
      jobCode: jobDialogSuggestedJobCode || "",
      jobQuery: jobDialogSuggestedJobQuery || "",
      drafts: jobDialogSuggestedDrafts,
    })
  }

  function handleOpenRepeatJobModalFromRag() {
    const suggestedJobCode = String(jobDialogSuggestedJobCode || "").trim()
    const hasSameJobCode = Boolean(
      suggestedJobCode &&
      selectedActivityJobs.some((job) => String(job.job_cd || "").trim() === suggestedJobCode),
    )
    if (hasSameJobCode) {
      setRepeatJobModeDialogOpen(true)
      return
    }
    openRepeatJobModalFromRag()
  }

  function openEditJobModal(job: ProjectAdminJobItem) {
    setIsCreateJobMode(false)
    setEditingJob(job)
    setJobFormSeq(String(job.job_seq))
    setJobFormCodeQuery(job.job_cd || job.job_name || "")
    setJobFormCode(job.job_cd || "")
    setJobFormExecPoint(job.exec_point_cd || "")
    setJobFormPriorJobCodeQuery(job.ref_job_cd || job.ref_job_name || "")
    setJobFormPriorJobCode(job.ref_job_cd || "")
    setJobFormStartDate(job.est_start_date || "")
    setJobFormStartRule(job.start_date_rule || "")
    setJobFormEndDate(job.est_end_date || "")
    setJobFormEndRule(job.end_date_rule || "")
    setJobFormMandatory(job.mandatory_yn === "Y")
    setJobFormEvidence(job.evidence_yn === "Y")
    setModalError("")
    setErrorDialogOpen(false)
    setJobEditOpen(true)
  }

  function closeJobEditModal() {
    if (jobSaving) return
    setJobEditOpen(false)
    setIsCreateJobMode(false)
    setEditingJob(null)
    setJobFormSeq("")
    setJobFormCodeQuery("")
    setJobFormCode("")
    setJobFormExecPoint("")
    setJobFormPriorJobCodeQuery("")
    setJobFormPriorJobCode("")
    setJobFormStartDate("")
    setJobFormStartRule("")
    setJobFormEndDate("")
    setJobFormEndRule("")
    setJobFormMandatory(false)
    setJobFormEvidence(false)
  }

  function closeRepeatJobModal() {
    if (jobSaving) return
    setRepeatJobOpen(false)
    setEditingJob(null)
    setJobFormSeq("")
    setJobFormCodeQuery("")
    setJobFormCode("")
    setJobFormExecPoint("")
    setJobFormPriorJobCodeQuery("")
    setJobFormPriorJobCode("")
    setJobFormStartDate("")
    setJobFormStartRule("")
    setJobFormEndDate("")
    setJobFormEndRule("")
    setJobFormMandatory(false)
    setJobFormEvidence(false)
    setRepeatJobCount("1")
    setSelectedRepeatJobIndex(0)
    setRepeatJobDrafts([])
  }

  function buildJobPayload(jobSeqValue: number, execPointCd?: string | null) {
    return {
      job_seq: jobSeqValue,
      job_cd: jobFormCode,
      exec_point_cd: execPointCd ?? (jobFormExecPoint || null),
      ref_job_cd: jobFormPriorJobCode || null,
      est_start_date: jobFormStartDate || null,
      start_date_rule: jobFormStartRule.trim() || null,
      est_end_date: jobFormEndDate || null,
      end_date_rule: jobFormEndRule.trim() || null,
      mandatory_yn: jobFormMandatory,
      evidence_yn: jobFormEvidence,
    }
  }

  function buildRepeatJobPayload(jobSeqValue: number, detail: RepeatJobDraft) {
    return {
      job_seq: jobSeqValue,
      job_cd: jobFormCode,
      exec_point_cd: detail.exec_point_cd || null,
      ref_job_cd: detail.ref_job_cd || null,
      est_start_date: detail.est_start_date || null,
      start_date_rule: (detail.start_date_rule || "").trim() || null,
      est_end_date: detail.est_end_date || null,
      end_date_rule: (detail.end_date_rule || "").trim() || null,
      mandatory_yn: detail.mandatory,
      evidence_yn: detail.evidence,
    }
  }

  function updateSelectedRepeatJobDraft(updater: (draft: RepeatJobDraft) => RepeatJobDraft) {
    setRepeatJobDrafts((prev) =>
      Array.from({ length: repeatJobCountValue }, (_, index) => {
        const baseDraft = prev[index] || repeatJobDefaultDrafts[index]
        return index === selectedRepeatJobIndex ? updater(baseDraft) : baseDraft
      }),
    )
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

  function closeRuleDialog() {
    setRuleDialogOpen(false)
    setRuleDialogTitle("")
    setRuleDialogContent("")
  }

  const parsedRuleDialogContent = useMemo(() => {
    const trimmed = ruleDialogContent.trim()
    if (!trimmed.startsWith("{")) {
      return null
    }
    try {
      return JSON.parse(trimmed) as Record<string, unknown>
    } catch {
      return null
    }
  }, [ruleDialogContent])

  function clearActivitySuggestFlowTimer() {
    if (activitySuggestFlowTimerRef.current != null) {
      window.clearInterval(activitySuggestFlowTimerRef.current)
      activitySuggestFlowTimerRef.current = null
    }
  }

  const handleSuggestActivities = useCallback(async () => {
    if (!project?.prj_id) return
    setError("")
    setNotice("")
    setSuggestingActivities(true)
    setActivitySuggestFlowOpen(true)
    setActivitySuggestFlowDone(false)
    setActivitySuggestFlowStep(0)
    setActivitySuggestFlowStatus("활동 등록 제안 요청을 시작합니다.")
    clearActivitySuggestFlowTimer()
    activitySuggestFlowTimerRef.current = window.setInterval(() => {
      setActivitySuggestFlowStep((prev) => {
        if (prev >= ACTIVITY_SUGGEST_FLOW_STEPS.length - 2) {
          return prev
        }
        return prev + 1
      })
    }, 1200)
    try {
      setActivitySuggestFlowStatus("RAG 기반 활동 제안을 검색하고 있습니다.")
      const response = await suggestProjectActivitiesFromRag(project.prj_id)
      clearActivitySuggestFlowTimer()
      setActivitySuggestFlowStep(ACTIVITY_SUGGEST_FLOW_STEPS.length - 1)
      setActivitySuggestFlowStatus("제안 목록을 정리해 화면에 반영했습니다.")
      setActivitySuggestFlowDone(true)
      setActivitySuggestions(response.items || [])
      setNotice((response.items || []).length > 0 ? "RAG 기반 활동 제안 목록을 불러왔습니다." : "RAG 제안 활동이 없습니다.")
      window.setTimeout(() => {
        setActivitySuggestFlowOpen(false)
      }, 900)
    } catch (e) {
      clearActivitySuggestFlowTimer()
      setActivitySuggestFlowStatus(e instanceof Error ? e.message : PROJECT_ADMIN_CONNECTION_ERROR_MESSAGE)
      setActivitySuggestFlowDone(true)
      setError(e instanceof Error ? e.message : PROJECT_ADMIN_CONNECTION_ERROR_MESSAGE)
    } finally {
      setSuggestingActivities(false)
    }
  }, [project?.prj_id])

  useEffect(() => {
    return () => {
      clearActivitySuggestFlowTimer()
    }
  }, [])

  function findExecPointCode(keyword: string, fallback: string) {
    return findExecPointCodeFromOptions(jobDialogExecPointOptions, keyword, fallback)
  }

  async function getLatestActivityJobs(prjId: string, activityId: string) {
    const detail = await getProjectJobSetup(prjId, activityId)
    return detail.jobs || []
  }

  async function refreshJobDialogSetup(prjId: string, activityId: string) {
    const detail = await getProjectJobSetup(prjId, activityId)
    setJobDialogJobs(detail.jobs || [])
    setJobDialogJobOptions(detail.job_options || [])
    setJobDialogExecPointOptions(detail.exec_point_options || [])
    setJobDialogSuggestedRepeatCount(Math.max(1, Math.min(10, Number(detail.repeat_count) || 1)))
    setJobDialogSuggestedJobCode(detail.repeat_job_cd || "")
    setJobDialogSuggestedJobQuery(detail.repeat_job_name || detail.repeat_job_cd || "")
    setJobDialogSuggestedDrafts(detail.repeat_job_drafts || [])
    return detail
  }

  function getNextAvailableJobSeq(jobItems: ProjectAdminJobItem[], minSeq = 1, excludeSeq?: number) {
    const usedSeqs = new Set(
      jobItems
        .filter((job) => job.job_seq !== excludeSeq)
        .map((job) => job.job_seq),
    )
    let nextSeq = Math.max(1, minSeq)
    while (usedSeqs.has(nextSeq)) {
      nextSeq += 1
    }
    return nextSeq
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
    let activityRuleValue: Record<string, unknown> | null = null
    const trimmedActivityRuleText = formActivityRuleText.trim()
    if (trimmedActivityRuleText) {
      try {
        const parsed = JSON.parse(trimmedActivityRuleText) as unknown
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          setModalError("활동규칙은 JSON 객체 형식으로 입력해 주세요.")
          setErrorDialogOpen(true)
          return
        }
        activityRuleValue = normalizeActivityRuleForEditor(parsed as Record<string, unknown>)
      } catch {
        setModalError("활동규칙 JSON 형식이 올바르지 않습니다.")
        setErrorDialogOpen(true)
        return
      }
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
          activity_rule: activityRuleValue,
          description: formActivityDescription.trim() || null,
          est_start_date: formStartDate || null,
          est_end_date: formEndDate || null,
          subsidy_amt_display: subsidyValue,
          parcel_codes: formParcelCodes,
        })
      } else if (editingActivity) {
        await updateProjectActivity(project.prj_id, editingActivity.activity_id, {
          activity_name: formActivityName.trim(),
          activity_rule: activityRuleValue,
          description: formActivityDescription.trim() || null,
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
      setFormActivityRule(activityRuleValue)
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
    if ((project.activity_count || 0) > 0) {
      setModalError("활동이 등록된 프로젝트는 기본정보를 수정할 수 없습니다.")
      setErrorDialogOpen(true)
      return
    }
    if (!formBizId.trim()) {
      setModalError("기반 사업을 선택해 주세요.")
      setErrorDialogOpen(true)
      return
    }
    if (!formProjectName.trim()) {
      setModalError("프로젝트명은 비워둘 수 없습니다.")
      setErrorDialogOpen(true)
      return
    }
    const execYearText = formExecYear.trim()
    const execYearValue = execYearText ? Number(execYearText) : null
    if (execYearText && (!Number.isInteger(execYearValue) || (execYearValue ?? 0) < 2000 || (execYearValue ?? 0) > 2100)) {
      setModalError("연도 값이 올바르지 않습니다.")
      setErrorDialogOpen(true)
      return
    }

    const finalProjectId = formAutoGenerateProjectId
      ? await buildProjectHashId(formProjectName.trim(), formIssuer, formExecYear)
      : formProjectId.trim()
    if (!finalProjectId) {
      setModalError("프로젝트ID를 생성할 수 없습니다.")
      setErrorDialogOpen(true)
      return
    }

    setSaving(true)
    setError("")
    setNotice("")
    setModalError("")
    try {
      const response = await updateProjectInfo(project.prj_id, {
        project_id: finalProjectId,
        auto_generate_project_id: formAutoGenerateProjectId,
        prj_name: formProjectName.trim(),
        biz_id: formBizId.trim(),
        exec_year: execYearValue,
        post_date: formPostDate || null,
        issuer: formIssuer.trim() || null,
        rag_file_id: formRagFileId || null,
      })
      setProjectEditMode(false)
      if (response.prj_id !== project.prj_id) {
        window.location.href = `/project/${encodeURIComponent(response.prj_id)}`
        return
      }
      await load()
      setNotice("프로젝트 기본정보가 수정되었습니다.")
    } catch (e) {
      setModalError(e instanceof Error ? e.message : PROJECT_ADMIN_CONNECTION_ERROR_MESSAGE)
      setErrorDialogOpen(true)
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteProject() {
    if (!project) return

    setDeletingProject(true)
    setError("")
    setNotice("")
    setModalError("")
    try {
      await deleteProjectInfo(project.prj_id)
      setProjectDeleteDialogOpen(false)
      window.location.href = "/project"
    } catch (e) {
      setProjectDeleteDialogOpen(false)
      setModalError(e instanceof Error ? e.message : PROJECT_ADMIN_CONNECTION_ERROR_MESSAGE)
      setErrorDialogOpen(true)
    } finally {
      setDeletingProject(false)
    }
  }

  async function handleDeleteActivity() {
    if (!project || !activityToDelete) return

    setDeletingActivity(true)
    setError("")
    setNotice("")
    setModalError("")
    try {
      await deleteProjectActivity(project.prj_id, activityToDelete.activity_id)
      await load()
      closeActivityDeleteDialog()
      if (selectedActivityForJobs?.activity_id === activityToDelete.activity_id) {
        closeJobDialog()
      }
      setNotice(`${normalizeActivityNameText(activityToDelete.activity_name) || activityToDelete.activity_id} 활동과 관련 작업이 삭제되었습니다.`)
    } catch (e) {
      closeActivityDeleteDialog()
      setModalError(e instanceof Error ? e.message : PROJECT_ADMIN_CONNECTION_ERROR_MESSAGE)
      setErrorDialogOpen(true)
    } finally {
      setDeletingActivity(false)
    }
  }

  async function handleSaveJob() {
    if (!project || !selectedActivityForJobs) return
    const jobSeqValue = Number(jobFormSeq)
    if (!Number.isInteger(jobSeqValue) || jobSeqValue <= 0) {
      setModalError("작업 순번은 1 이상의 숫자로 입력해 주세요.")
      setErrorDialogOpen(true)
      return
    }
    if (!jobFormCode.trim()) {
      setModalError("작업코드를 선택해 주세요.")
      setErrorDialogOpen(true)
      return
    }
    if (jobFormStartDate && jobFormEndDate && jobFormStartDate > jobFormEndDate) {
      setModalError("예상종료일은 예상시작일보다 빠를 수 없습니다.")
      setErrorDialogOpen(true)
      return
    }
    const seqExists = selectedActivityJobs.some((job) =>
      isCreateJobMode ? job.job_seq === jobSeqValue : job.job_seq === jobSeqValue && job.job_seq !== editingJob?.job_seq,
    )
    if (seqExists) {
      setModalError(`이미 등록된 작업 순번입니다: ${jobSeqValue}`)
      setErrorDialogOpen(true)
      return
    }

    setJobSaving(true)
    setError("")
    setNotice("")
    setModalError("")
    try {
      let finalJobSeq = jobSeqValue
      if (isCreateJobMode) {
        const latestJobs = await getLatestActivityJobs(project.prj_id, selectedActivityForJobs.activity_id)
        finalJobSeq = getNextAvailableJobSeq(latestJobs, jobSeqValue)
        await createProjectJob(project.prj_id, selectedActivityForJobs.activity_id, buildJobPayload(finalJobSeq))
      } else if (editingJob) {
        const latestJobs = await getLatestActivityJobs(project.prj_id, selectedActivityForJobs.activity_id)
        const adjustedSeq = getNextAvailableJobSeq(latestJobs, jobSeqValue, editingJob.job_seq)
        finalJobSeq = adjustedSeq
        await updateProjectJob(
          project.prj_id,
          selectedActivityForJobs.activity_id,
          editingJob.job_seq,
          buildJobPayload(finalJobSeq),
        )
      } else {
        return
      }

      await load()
      await refreshJobDialogSetup(project.prj_id, selectedActivityForJobs.activity_id)
      closeJobEditModal()
      if (finalJobSeq !== jobSeqValue) {
        setNotice(`${isCreateJobMode ? "작업이 등록" : "작업 정보가 수정"}되었습니다. 작업 순번은 ${finalJobSeq}로 조정되었습니다.`)
      } else {
        setNotice(isCreateJobMode ? "작업이 등록되었습니다." : "작업 정보가 수정되었습니다.")
      }
    } catch (e) {
      setModalError(e instanceof Error ? e.message : PROJECT_ADMIN_CONNECTION_ERROR_MESSAGE)
      setErrorDialogOpen(true)
    } finally {
      setJobSaving(false)
    }
  }

  async function handleSaveRepeatJobs() {
    if (!project || !selectedActivityForJobs) return
    const repeatCountValue = Number(repeatJobCount)
    if (!Number.isInteger(repeatCountValue) || repeatCountValue < 1 || repeatCountValue > 10) {
      setModalError("반복횟수는 1회부터 10회까지 선택할 수 있습니다.")
      setErrorDialogOpen(true)
      return
    }
    if (!jobFormCode.trim()) {
      setModalError("작업코드를 선택해 주세요.")
      setErrorDialogOpen(true)
      return
    }
    const invalidRepeatRange = Array.from({ length: repeatJobCountValue }, (_, index) => repeatJobDrafts[index] || repeatJobDefaultDrafts[index]).some(
      (draft) => draft?.est_start_date && draft?.est_end_date && draft.est_start_date > draft.est_end_date,
    )
    if (invalidRepeatRange) {
      setModalError("예상종료일은 예상시작일보다 빠를 수 없습니다.")
      setErrorDialogOpen(true)
      return
    }

    setJobSaving(true)
    setError("")
    setNotice("")
    setModalError("")
    try {
      const latestJobs = await getLatestActivityJobs(project.prj_id, selectedActivityForJobs.activity_id)
      const previousJob = [...latestJobs].sort((left, right) => right.job_seq - left.job_seq)[0]
      const isSameAsPreviousJobCode =
        Boolean(previousJob?.job_cd) && String(previousJob.job_cd).trim() === jobFormCode.trim()
      const firstJobSeq = getNextAvailableJobSeq(latestJobs, nextJobSeq)
      const latestUsedSeqs = new Set(latestJobs.map((job) => job.job_seq))
      const finalSeqs: number[] = []
      let candidateSeq = firstJobSeq
      while (finalSeqs.length < repeatCountValue) {
        while (latestUsedSeqs.has(candidateSeq)) {
          candidateSeq += 1
        }
        finalSeqs.push(candidateSeq)
        latestUsedSeqs.add(candidateSeq)
        candidateSeq += 1
      }

      for (let index = 0; index < repeatCountValue; index += 1) {
        const detail = repeatJobDrafts[index] || repeatJobDefaultDrafts[index]
        await createProjectJob(
          project.prj_id,
          selectedActivityForJobs.activity_id,
          buildRepeatJobPayload(finalSeqs[index], detail),
        )
      }
      await load()
      await refreshJobDialogSetup(project.prj_id, selectedActivityForJobs.activity_id)
      closeRepeatJobModal()
      const expectedSeqs = Array.from({ length: repeatCountValue }, (_, index) => nextJobSeq + index)
      const adjusted = finalSeqs.some((seq, index) => seq !== expectedSeqs[index])
      if (isSameAsPreviousJobCode && adjusted) {
        setNotice(`동일 작업 ${repeatCountValue}건이 추가 등록되었습니다. 작업 순번은 ${finalSeqs.join(", ")}로 조정되었습니다.`)
      } else if (isSameAsPreviousJobCode) {
        setNotice(`동일 작업 ${repeatCountValue}건이 추가 등록되었습니다.`)
      } else if (adjusted) {
        setNotice(`작업 ${repeatCountValue}건이 등록되었습니다. 작업 순번은 ${finalSeqs.join(", ")}로 조정되었습니다.`)
      } else {
        setNotice(`작업 ${repeatCountValue}건이 등록되었습니다.`)
      }
    } catch (e) {
      setModalError(e instanceof Error ? e.message : PROJECT_ADMIN_CONNECTION_ERROR_MESSAGE)
      setErrorDialogOpen(true)
    } finally {
      setJobSaving(false)
    }
  }

  async function handleDeleteJob(job: ProjectAdminJobItem) {
    if (!project || !selectedActivityForJobs) return
    const confirmed = window.confirm(
      `[${job.job_seq}] ${job.job_name || job.job_cd || "작업"} 항목을 삭제하시겠습니까?`,
    )
    if (!confirmed) return

    setJobSaving(true)
    setError("")
    setNotice("")
    try {
      await deleteProjectJob(project.prj_id, selectedActivityForJobs.activity_id, job.job_seq)
      await load()
      await refreshJobDialogSetup(project.prj_id, selectedActivityForJobs.activity_id)
      setNotice("작업이 삭제되었습니다.")
      if (editingJob?.job_seq === job.job_seq) {
        closeJobEditModal()
      }
    } catch (e) {
      setModalError(e instanceof Error ? e.message : PROJECT_ADMIN_CONNECTION_ERROR_MESSAGE)
      setErrorDialogOpen(true)
    } finally {
      setJobSaving(false)
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
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <Btn
                    variant="primary"
                    size="sm"
                    icon={<Pencil size={14} />}
                    onClick={openProjectEditMode}
                    disabled={(project.activity_count || 0) > 0 || projectEditMode || deletingProject}
                    title={(project.activity_count || 0) > 0 ? "활동이 등록된 프로젝트는 기본정보를 수정할 수 없습니다." : undefined}
                  >
                    프로젝트 기본정보 수정
                  </Btn>
                  <Btn
                    variant="danger"
                    size="sm"
                    icon={<Trash2 size={14} />}
                    onClick={openProjectDeleteDialog}
                    disabled={projectEditMode || deletingProject}
                  >
                    프로젝트 삭제
                  </Btn>
                </div>
              }
            />
            <CardBody>
              <div style={{ display: "grid", gap: 18 }}>
                {(project.activity_count || 0) > 0 ? (
                  <div className="alert alert-notice" style={{ marginBottom: 4 }}>
                    활동이 등록된 프로젝트는 기본정보를 수정할 수 없습니다.
                  </div>
                ) : null}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "140px minmax(0, 1fr) 140px",
                    gap: 16,
                    alignItems: "center",
                  }}
                >
                  <div className="detail-row-label" style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)" }}>
                    기반 사업
                  </div>
                  {projectEditMode ? (
                    <select
                      value={formBizId}
                      onChange={(e) => setFormBizId(e.target.value)}
                      style={{ ...fieldInputStyle, fontSize: 17, fontWeight: 600, width: "100%" }}
                    >
                      <option value="">기반 사업을 선택해 주세요</option>
                      {baseBusinesses.map((item) => (
                        <option key={item.biz_id} value={item.biz_id}>
                          {item.biz_name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div
                      style={{
                        minHeight: 44,
                        display: "flex",
                        alignItems: "center",
                        padding: "0 14px",
                        borderRadius: 10,
                        border: "1px solid var(--line)",
                        background: "#fff",
                        fontSize: 17,
                        fontWeight: 600,
                      }}
                    >
                      {project.biz_name || "—"}
                    </div>
                  )}
                  <div
                    style={{
                      minHeight: 44,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "0 12px",
                      borderRadius: 10,
                      border: "1px solid var(--line)",
                      background: "var(--bg-subtle, #fafafa)",
                      color: "var(--muted)",
                      fontSize: 15,
                      fontFamily: "\"Fira Code\", \"JetBrains Mono\", Consolas, monospace",
                      fontWeight: 600,
                    }}
                  >
                    {project.biz_id || "—"}
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "140px minmax(0, 1fr)",
                    gap: 16,
                    alignItems: "start",
                  }}
                >
                  <div className="detail-row-label" style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)", lineHeight: "44px" }}>
                    RAG 파일
                  </div>
                  <div style={{ display: "grid", gap: 12 }}>
                    <div
                      style={{
                        minHeight: 44,
                        display: "flex",
                        alignItems: "center",
                        padding: "0 14px",
                        borderRadius: 10,
                        border: "1px solid var(--line)",
                        background: "#fff",
                        fontSize: 17,
                        fontWeight: 600,
                        color: projectEditMode ? "var(--muted)" : "var(--ink)",
                      }}
                    >
                      {ragFile?.doc_name || project.rag_file_id || "연결된 RAG 파일이 없습니다."}
                    </div>
                    <div
                      style={{
                        minHeight: 44,
                        display: "flex",
                        alignItems: "center",
                        padding: "0 14px",
                        borderRadius: 10,
                        border: "1px solid var(--line)",
                        background: "var(--bg-subtle, #fafafa)",
                        color: (ragFile?.file_name || formRagFileId || project.rag_file_id) ? "var(--ink)" : "var(--muted)",
                        fontSize: 14,
                      }}
                    >
                      {ragFile?.file_name || (formRagFileId ? `file_id: ${formRagFileId}` : project.rag_file_id ? `file_id: ${project.rag_file_id}` : "선택된 파일이 없습니다.")}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "minmax(260px, 1.8fr) minmax(140px, 0.42fr) minmax(170px, 0.52fr) minmax(220px, 0.8fr)",
                    gap: 16,
                    alignItems: "end",
                  }}
                >
                  <div style={{ display: "grid", gap: 6, gridColumn: "1 / span 3" }}>
                    <span className="detail-row-label">프로젝트명</span>
                    {projectEditMode ? (
                      <input value={formProjectName} onChange={(e) => setFormProjectName(e.target.value)} style={{ ...fieldInputStyle, fontSize: 17, fontWeight: 600 }} />
                    ) : (
                      <div
                        style={{
                          minHeight: 44,
                          display: "flex",
                          alignItems: "center",
                          padding: "0 14px",
                          borderRadius: 10,
                          border: "1px solid var(--line)",
                          background: "#fff",
                          fontSize: 17,
                          fontWeight: 600,
                        }}
                      >
                        {project.prj_name || "—"}
                      </div>
                    )}
                  </div>

                  <div style={{ display: "grid", gap: 6 }}>
                    <span className="detail-row-label">발주기관</span>
                    {projectEditMode ? (
                      <input value={formIssuer} onChange={(e) => setFormIssuer(e.target.value)} style={{ ...fieldInputStyle, fontSize: 17, fontWeight: 600 }} />
                    ) : (
                      <div
                        style={{
                          minHeight: 44,
                          display: "flex",
                          alignItems: "center",
                          padding: "0 14px",
                          borderRadius: 10,
                          border: "1px solid var(--line)",
                          background: "#fff",
                          fontSize: 17,
                          fontWeight: 600,
                        }}
                      >
                        {project.issuer || "—"}
                      </div>
                    )}
                  </div>

                  <div style={{ display: "grid", gap: 6 }}>
                    <span className="detail-row-label">프로젝트ID</span>
                    {projectEditMode ? (
                      <div style={{ display: "grid", gap: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                          <input
                            value={formProjectId}
                            onChange={(e) => setFormProjectId(e.target.value.toUpperCase())}
                            readOnly={formAutoGenerateProjectId}
                            disabled={formAutoGenerateProjectId}
                            style={{
                              ...(formAutoGenerateProjectId ? { ...fieldInputStyle, background: "var(--bg-subtle, #fafafa)", color: "var(--muted)" } : fieldInputStyle),
                              flex: "1 1 220px",
                              minWidth: 0,
                              fontSize: 16,
                              fontFamily: "\"Fira Code\", \"JetBrains Mono\", Consolas, monospace",
                              fontWeight: 600,
                            }}
                            placeholder={formAutoGenerateProjectId ? "자동 생성" : "프로젝트ID"}
                          />
                          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--muted)", whiteSpace: "nowrap" }}>
                            <input
                              type="checkbox"
                              checked={formAutoGenerateProjectId}
                              onChange={(e) => setFormAutoGenerateProjectId(e.target.checked)}
                            />
                            자동생성
                          </label>
                        </div>
                      </div>
                    ) : (
                      <div
                        style={{
                          minHeight: 44,
                          display: "flex",
                          alignItems: "center",
                          padding: "0 14px",
                          borderRadius: 10,
                          border: "1px solid var(--line)",
                          background: "var(--bg-subtle, #fafafa)",
                          color: "var(--muted)",
                          fontSize: 16,
                          fontFamily: "\"Fira Code\", \"JetBrains Mono\", Consolas, monospace",
                          fontWeight: 600,
                        }}
                      >
                        {project.project_id || project.prj_id || "—"}
                      </div>
                    )}
                  </div>

                  <div style={{ display: "grid", gap: 6 }}>
                    <span className="detail-row-label">활동 수</span>
                    <div
                      style={{
                        minHeight: 44,
                        display: "flex",
                        alignItems: "center",
                        padding: "0 14px",
                        borderRadius: 10,
                        border: "1px solid var(--line)",
                        background: "var(--bg-subtle, #fafafa)",
                        color: "var(--muted)",
                        fontSize: 16,
                        fontWeight: 600,
                      }}
                    >
                      {project.activity_count}
                    </div>
                  </div>

                  <div style={{ display: "grid", gap: 6 }}>
                    <span className="detail-row-label">시행년도</span>
                    {projectEditMode ? (
                      <input
                        value={formExecYear}
                        inputMode="numeric"
                        onChange={(e) => setFormExecYear(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
                        style={{ ...fieldInputStyle, maxWidth: 180, fontSize: 17, fontWeight: 600 }}
                      />
                    ) : (
                      <div
                        style={{
                          minHeight: 44,
                          display: "flex",
                          alignItems: "center",
                          padding: "0 14px",
                          borderRadius: 10,
                          border: "1px solid var(--line)",
                          background: "#fff",
                          maxWidth: 180,
                          fontSize: 17,
                          fontWeight: 600,
                        }}
                      >
                        {project.exec_year || "—"}
                      </div>
                    )}
                  </div>

                  <div style={{ display: "grid", gap: 6 }}>
                    <span className="detail-row-label">공고일자</span>
                    {projectEditMode ? (
                      <input type="date" value={formPostDate} onChange={(e) => setFormPostDate(e.target.value)} style={{ ...fieldInputStyle, fontSize: 17, fontWeight: 600 }} />
                    ) : (
                      <div
                        style={{
                          minHeight: 44,
                          display: "flex",
                          alignItems: "center",
                          padding: "0 14px",
                          borderRadius: 10,
                          border: "1px solid var(--line)",
                          background: "#fff",
                          fontSize: 17,
                          fontWeight: 600,
                        }}
                      >
                        {project.post_date || "—"}
                      </div>
                    )}
                  </div>
                </div>

                {projectEditMode ? (
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                    <Btn variant="outline" onClick={closeProjectEditMode} disabled={saving}>
                      취소
                    </Btn>
                    <Btn variant="primary" icon={<Save size={16} />} onClick={() => void handleSaveProjectInfo()} disabled={saving}>
                      {saving ? "저장 중..." : "저장"}
                    </Btn>
                  </div>
                ) : null}
              </div>
            </CardBody>
          </Card>

          <div style={{ marginTop: 20 }}>
            <Card>
              <CardHead
                title="활동 정보"
                sub="프로젝트에 포함된 활동과 대상농지 정보를 확인합니다."
                action={
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    {(() => {
                      const hasRagFile = Boolean(project?.rag_file_id)
                      return (
                        <>
                          <Btn
                            variant={hasRagFile ? "primary" : "outline"}
                            size="sm"
                            icon={<Sparkles size={14} />}
                            onClick={() => void handleSuggestActivities()}
                            disabled={suggestingActivities || !hasRagFile}
                          >
                            {suggestingActivities ? "제안 검색 중..." : "활동 등록 제안"}
                          </Btn>
                          <Btn
                            variant={hasRagFile ? "outline" : "primary"}
                            size="sm"
                            icon={<FolderPlus size={14} />}
                            onClick={openCreateModal}
                          >
                            활동 등록
                          </Btn>
                        </>
                      )
                    })()}
                  </div>
                }
              />
              <CardBody>
                {activitySuggestions.length > 0 ? (
                  <div
                    style={{
                      marginBottom: 18,
                      borderRadius: 14,
                      border: "1px solid #cfe3d5",
                      background: "#f7fbf8",
                      padding: 16,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "#2f5d34" }}>RAG 제안 활동 목록</div>
                      <div className="muted" style={{ fontSize: 13 }}>
                        우선 검토 대상만 먼저 표시하며, 낮은 점수 후보는 아래로 분리됩니다.
                      </div>
                    </div>
                    <div style={{ display: "grid", gap: 8 }}>
                      <div style={{ display: "grid", gap: 8 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 12,
                            padding: "2px 2px 4px",
                          }}
                        >
                          <div style={{ fontSize: 14, fontWeight: 700, color: "#2f5d34" }}>우선 검토 대상</div>
                          <div className="muted" style={{ fontSize: 12 }}>
                            상위 {primaryActivitySuggestions.length}건
                          </div>
                        </div>
                        {primaryActivitySuggestions.map((item) => {
                          const isRegistered = registeredActivityNameSet.has(
                            normalizeActivityNameText(item.activity_name).replace(/\s+/g, "").trim().toLowerCase(),
                          )
                          const displayActivityName = normalizeActivityNameText(item.activity_name)
                          return (
                          <div
                            key={item.suggestion_id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 12,
                              width: "100%",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                flexWrap: "wrap",
                                minWidth: 0,
                                flex: "1 1 auto",
                                padding: "12px 14px",
                                borderRadius: 12,
                                border: "1px solid #d9e7dc",
                                background: "#fff",
                              }}
                            >
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  minWidth: 86,
                                  height: 28,
                                  padding: "0 10px",
                                  borderRadius: 999,
                                  background: "#e4f2e7",
                                  color: "#2f7d4a",
                                  fontSize: 12,
                                  fontWeight: 700,
                                  flexShrink: 0,
                                }}
                              >
                                {item.source_flag === "rag_suggested" ? "RAG 제안" : item.source_flag}
                              </span>
                              <span
                                style={{
                                  fontSize: 16,
                                  fontWeight: 600,
                                  maxWidth: 240,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {displayActivityName || "—"}
                              </span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                              <Btn
                                size="sm"
                                variant="outline"
                                onClick={() => openRuleDialog(`${displayActivityName || item.activity_name} 제안 상세`, item.detail_text)}
                              >
                                상세 보기
                              </Btn>
                              <Btn
                                size="sm"
                                variant="primary"
                                onClick={() => openCreateModalFromSuggestion(item)}
                                disabled={isRegistered}
                              >
                                {isRegistered ? "등록완료" : "활동등록"}
                              </Btn>
                            </div>
                          </div>
                        )})}
                      </div>

                      {reviewActivitySuggestions.length > 0 ? (
                        <div
                          style={{
                            marginTop: 4,
                            paddingTop: 14,
                            borderTop: "1px solid #d9e7dc",
                            display: "grid",
                            gap: 8,
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 12,
                              padding: "0 2px 4px",
                            }}
                          >
                            <div style={{ fontSize: 14, fontWeight: 700, color: "#6b7b70" }}>검토 가능 후보</div>
                            <div className="muted" style={{ fontSize: 12 }}>
                              점수가 낮아 추가 확인이 필요합니다.
                            </div>
                          </div>
                          {reviewActivitySuggestions.map((item) => {
                            const isRegistered = registeredActivityNameSet.has(
                              normalizeActivityNameText(item.activity_name).replace(/\s+/g, "").trim().toLowerCase(),
                            )
                            const displayActivityName = normalizeActivityNameText(item.activity_name)
                            return (
                            <div
                              key={item.suggestion_id}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 12,
                                width: "100%",
                                opacity: 0.92,
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 10,
                                  flexWrap: "wrap",
                                  minWidth: 0,
                                  flex: "1 1 auto",
                                  padding: "12px 14px",
                                  borderRadius: 12,
                                  border: "1px solid #d9e7dc",
                                  background: "#fff",
                                }}
                              >
                                <span
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    minWidth: 86,
                                    height: 28,
                                    padding: "0 10px",
                                    borderRadius: 999,
                                    background: "#eef3ef",
                                    color: "#5f7165",
                                    fontSize: 12,
                                    fontWeight: 700,
                                    flexShrink: 0,
                                  }}
                                >
                                  추가 검토
                                </span>
                                <span
                                  style={{
                                    fontSize: 16,
                                    fontWeight: 600,
                                    maxWidth: 240,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {displayActivityName || "—"}
                                </span>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                                <Btn
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openRuleDialog(`${displayActivityName || item.activity_name} 제안 상세`, item.detail_text)}
                                >
                                  상세 보기
                                </Btn>
                                <Btn
                                  size="sm"
                                  variant="primary"
                                  onClick={() => openCreateModalFromSuggestion(item)}
                                  disabled={isRegistered}
                                >
                                  {isRegistered ? "등록완료" : "활동등록"}
                                </Btn>
                              </div>
                            </div>
                          )})}
                        </div>
                      ) : null}

                      {hiddenActivitySuggestionCount > 0 ? (
                        <div className="muted" style={{ padding: "4px 2px 0", fontSize: 12 }}>
                          나머지 {hiddenActivitySuggestionCount}건은 화면에서 생략했습니다.
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}

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
                            <td>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                <span>{normalizeActivityNameText(activity.activity_name) || <span className="muted">—</span>}</span>
                                <span
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    minWidth: 74,
                                    height: 24,
                                    padding: "0 8px",
                                    borderRadius: 999,
                                    background: "#eef1f3",
                                    color: "#58636f",
                                    fontSize: 11,
                                    fontWeight: 700,
                                  }}
                                >
                                  {activity.source_flag === "db_registered" ? "기존 등록" : activity.source_flag}
                                </span>
                              </div>
                            </td>
                            <td className="cell-mono">{activity.est_start_date || <span className="muted">—</span>}</td>
                            <td className="cell-mono">{activity.est_end_date || <span className="muted">—</span>}</td>
                            <td className="cell-mono">{formatCurrency(activity.subsidy_amt_display)}</td>
                            <td>{activity.target_parcel_names || <span className="muted">—</span>}</td>
                            <td>
                              <div className="row-actions">
                                <Btn size="sm" icon={<Pencil size={14} />} onClick={() => openEditModal(activity)}>
                                  수정
                                </Btn>
                                <Btn size="sm" variant="danger" onClick={() => openActivityDeleteDialog(activity)}>
                                  삭제
                                </Btn>
                                <Btn size="sm" variant="outline" onClick={() => openJobDialog(activity)}>
                                  작업관리
                                </Btn>
                              </div>
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
                sub="프로젝트 전체 작업목록을 활동-대상농지 기준으로 확인합니다."
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
                          <th>대상농지</th>
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
                            <td>{normalizeActivityNameText(job.activity_name) || <span className="muted">—</span>}</td>
                            <td>{job.target_parcel_names || <span className="muted">—</span>}</td>
                            <td className="cell-mono">{job.job_seq}</td>
                            <td>
                              <div className="cell-mono">{job.job_cd || "—"}</div>
                              <div>{job.job_name || <span className="muted">—</span>}</div>
                            </td>
                            <td>{job.exec_point_name ? `활동 ${job.exec_point_name}` : <span className="muted">—</span>}</td>
                            <td>{job.ref_job_name || <span className="muted">—</span>}</td>
                            <td>
                              {job.est_start_date ? (
                                <div className="cell-mono">{job.est_start_date}</div>
                              ) : !job.start_date_rule ? (
                                <div className="cell-mono">
                                  <span className="muted">—</span>
                                </div>
                              ) : null}
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
                              {job.est_end_date ? (
                                <div className="cell-mono">{job.est_end_date}</div>
                              ) : !job.end_date_rule ? (
                                <div className="cell-mono">
                                  <span className="muted">—</span>
                                </div>
                              ) : null}
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
        open={projectDeleteDialogOpen}
        title="프로젝트 삭제"
        onClose={closeProjectDeleteDialog}
        width="520px"
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <Btn variant="danger" onClick={handleDeleteProject} disabled={deletingProject}>
              삭제확인
            </Btn>
            <Btn variant="outline" onClick={closeProjectDeleteDialog} disabled={deletingProject}>
              취소
            </Btn>
          </div>
        }
      >
        <div className="muted" style={{ whiteSpace: "pre-wrap", lineHeight: 1.7 }}>
          프로젝트 기본 정보 외 활동 및 작업 정보도 함께 삭제됩니다. 삭제하시겠습니까?
        </div>
      </Modal>

      <Modal
        open={activityDeleteDialogOpen}
        title="활동 삭제"
        onClose={closeActivityDeleteDialog}
        width="520px"
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <Btn variant="danger" onClick={() => void handleDeleteActivity()} disabled={deletingActivity}>
              {deletingActivity ? "삭제 중..." : "삭제확인"}
            </Btn>
            <Btn variant="outline" onClick={closeActivityDeleteDialog} disabled={deletingActivity}>
              취소
            </Btn>
          </div>
        }
      >
        <div className="muted" style={{ whiteSpace: "pre-wrap", lineHeight: 1.7 }}>
          {(() => {
            const activityLabel = normalizeActivityNameText(activityToDelete?.activity_name) || activityToDelete?.activity_id || "해당 활동"
            const conjunction = chooseKoreanObjectConjunction(activityLabel)
            return `[${activityLabel}]${conjunction} 관련 작업을 삭제하시겠습니까?`
          })()}
        </div>
      </Modal>

      <Modal
        open={activitySuggestFlowOpen}
        title="활동 등록 제안 처리 흐름"
        onClose={() => {
          if (suggestingActivities) return
          setActivitySuggestFlowOpen(false)
        }}
        width="760px"
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Btn variant={activitySuggestFlowDone ? "primary" : "outline"} onClick={() => setActivitySuggestFlowOpen(false)} disabled={suggestingActivities}>
              {activitySuggestFlowDone ? "확인" : "닫기"}
            </Btn>
          </div>
        }
      >
        <div style={{ display: "grid", gap: 18 }}>
          <div
            style={{
              borderRadius: 12,
              border: "1px solid var(--line)",
              background: "var(--bg-subtle, #fafafa)",
              padding: "14px 16px",
              fontSize: 15,
              lineHeight: 1.7,
              color: "var(--ink-soft)",
              wordBreak: "break-word",
            }}
          >
            {ACTIVITY_SUGGEST_FLOW_STEPS.join(" -> ")}
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            {ACTIVITY_SUGGEST_FLOW_STEPS.map((step, index) => {
              const isCurrent = index === activitySuggestFlowStep
              const isCompleted = index < activitySuggestFlowStep || (activitySuggestFlowDone && index === activitySuggestFlowStep)
              return (
                <div
                  key={step}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: isCurrent ? "1px solid #8db89a" : "1px solid var(--line)",
                    background: isCurrent ? "#f3fbf4" : "#fff",
                  }}
                >
                  <div
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 999,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 12,
                      fontWeight: 700,
                      color: isCompleted ? "#fff" : isCurrent ? "#2f7d4a" : "var(--muted)",
                      background: isCompleted ? "#2f7d4a" : isCurrent ? "#e1f1e5" : "var(--bg-subtle, #f3f3f3)",
                    }}
                  >
                    {index + 1}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: isCurrent ? 700 : 500, color: isCurrent ? "var(--ink)" : "var(--ink-soft)" }}>
                    {step}
                  </div>
                  {isCurrent ? (
                    <div style={{ marginLeft: "auto", fontSize: 13, color: "#2f7d4a", fontWeight: 700 }}>
                      진행 중
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
          <div className="muted" style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>
            현재 상태: {activitySuggestFlowStatus || "대기 중"}
          </div>
        </div>
      </Modal>

      <Modal
        open={editOpen}
        title={isCreateMode ? "활동 등록" : "활동 정보 수정"}
        onClose={closeEditModal}
        width="760px"
        footer={
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Btn variant="primary" icon={<Save size={16} />} onClick={() => void handleSaveActivity()} disabled={saving}>
              {saving ? (isCreateMode ? "등록 중..." : "저장 중...") : isCreateMode ? "등록" : "저장"}
            </Btn>
            <Btn variant="outline" onClick={closeEditModal} disabled={saving}>
              취소
            </Btn>
          </div>
        }
      >
        {isCreateMode || editingActivity ? (
          <div style={{ display: "grid", gap: 18 }}>
            <div style={{ display: "grid", gridTemplateColumns: "120px minmax(0, 1fr) 150px", gap: 16 }}>
              <label style={{ display: "grid", gap: 8 }}>
                <span className="detail-row-label">순번</span>
                <select
                  value={formActivityOrder}
                  onChange={(e) => setFormActivityOrder(e.target.value)}
                  disabled={!isCreateMode}
                  style={{
                    ...fieldInputStyle,
                    background: isCreateMode ? "#fff" : "var(--bg-soft)",
                    color: isCreateMode ? "var(--ink)" : "var(--muted)",
                  }}
                >
                  {activityOrderOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: "grid", gap: 8 }}>
                <span className="detail-row-label">활동명</span>
                <input value={formActivityName} onChange={(e) => setFormActivityName(e.target.value)} style={fieldInputStyle} />
              </label>
              <label style={{ display: "grid", gap: 8 }}>
                <span className="detail-row-label">활동ID</span>
                <input
                  value={formActivityId}
                  readOnly
                  disabled
                  style={{
                    ...fieldInputStyle,
                    width: 150,
                    minWidth: 150,
                    maxWidth: 150,
                    background: "var(--bg-soft)",
                    color: "var(--muted)",
                  }}
                />
              </label>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16 }}>
              <label style={{ display: "grid", gap: 8 }}>
                <span className="detail-row-label">예상시작일자</span>
                <input type="date" value={formStartDate} onChange={(e) => setFormStartDate(e.target.value)} style={fieldInputStyle} />
              </label>
              <label style={{ display: "grid", gap: 8 }}>
                <span className="detail-row-label">예상종료일자</span>
                <input type="date" value={formEndDate} onChange={(e) => setFormEndDate(e.target.value)} style={fieldInputStyle} />
              </label>
            </div>

            <label style={{ display: "grid", gap: 8 }}>
              <span className="detail-row-label" style={{ whiteSpace: "nowrap" }}>
                활동비 (원/ha)
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                <input
                  value={formSubsidy}
                  inputMode="numeric"
                  onChange={(e) => setFormSubsidy(formatNumberInput(e.target.value))}
                  style={{ ...fieldInputStyle, maxWidth: 260 }}
                />
                {formSubsidyHint ? (
                  <div
                    className="muted"
                    style={{
                      fontSize: 16,
                      fontWeight: 600,
                      lineHeight: 1.5,
                    }}
                  >
                    RAG 등록 기준 단가: {formatSubsidyHintPerSquareMeter(formSubsidyHint)}
                  </div>
                ) : null}
              </div>
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
                    <input type="checkbox" checked={formParcelCodes.includes(option.code)} onChange={() => toggleParcelCode(option.code)} />
                    <span>{option.code_name}</span>
                  </label>
                ))}
              </div>
            </div>

            <label style={{ display: "grid", gap: 8 }}>
              <span className="detail-row-label">활동규칙</span>
              <textarea
                value={formActivityRuleText}
                onChange={(e) => {
                  setFormActivityRuleText(e.target.value)
                  setFormActivityRule(null)
                }}
                style={{ ...fieldTextareaStyle, minHeight: 180, fontSize: 14, lineHeight: 1.55 }}
                placeholder={'{\n  "활동명": "",\n  "시작일": {},\n  "종료일": {},\n  "증빙조건": {}\n}'}
              />
            </label>

            <label style={{ display: "grid", gap: 8 }}>
              <span className="detail-row-label">활동설명</span>
              <textarea
                value={formActivityDescription}
                onChange={(e) => setFormActivityDescription(e.target.value)}
                style={{ ...fieldTextareaStyle, minHeight: 140, fontSize: 14, lineHeight: 1.55 }}
                placeholder="활동의 주요 내용과 수행 기준을 입력합니다."
              />
            </label>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={activityCreatePreparing}
        title=""
        onClose={() => {}}
        width="420px"
        hideHeader
        showCloseButton={false}
        closeOnBackdrop={false}
        closeOnEscape={false}
      >
        <div
          className="muted"
          style={{
            minHeight: 72,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 15,
            lineHeight: 1.6,
            textAlign: "center",
          }}
        >
          활동 등록 준비 중 ... 잠시만 기다려 주세요.
        </div>
      </Modal>

      <Modal
        open={jobDialogLoading}
        title=""
        onClose={() => {}}
        width="420px"
        hideHeader
        showCloseButton={false}
        closeOnBackdrop={false}
        closeOnEscape={false}
      >
        <div
          className="muted"
          style={{
            minHeight: 72,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 15,
            lineHeight: 1.6,
            textAlign: "center",
          }}
        >
          작업목록을 불러오고 있습니다. 잠시만 기다려 주세요.
        </div>
      </Modal>

      <Modal
        open={jobDialogOpen}
        title={selectedActivityForJobs ? `${selectedActivityForJobs.activity_name} 작업관리` : "작업관리"}
        onClose={closeJobDialog}
        width="min(1180px, calc(100vw - 32px))"
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
            <Btn
              variant="primary"
              size="sm"
              icon={<FolderPlus size={14} />}
              onClick={() => void handleOpenRepeatJobModalFromRag()}
              disabled={!selectedActivityForJobs || jobDialogLoading}
            >
              작업등록(RAG)
            </Btn>
            <Btn variant="outline" size="sm" onClick={openRepeatJobModalManual} disabled={!selectedActivityForJobs || jobDialogLoading}>
              작업등록(수기)
            </Btn>
            <Btn variant="outline" onClick={closeJobDialog} disabled={jobSaving}>
              닫기
            </Btn>
          </div>
        }
      >
        {selectedActivityForJobs ? (
          <div style={{ display: "grid", gap: 16 }}>
            {selectedActivityJobs.length === 0 ? (
              <div className="tbl-empty muted" style={{ padding: 32, minHeight: 220 }}>
                등록된 작업이 없습니다.
              </div>
            ) : (
              <div className="table-wrap project-jobs-table-wrap">
                <table className="tbl project-jobs-table">
                  <thead>
                    <tr>
                      <th>작업 순번</th>
                      <th>작업코드/작업명</th>
                      <th>실행시점</th>
                      <th>선후행작업</th>
                      <th>예상시작일/규칙</th>
                      <th>예상종료일/규칙</th>
                      <th>필수</th>
                      <th>증빙</th>
                      <th>관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedActivityJobs.map((job) => (
                        <tr key={`${job.activity_id}-${job.job_seq}`}>
                          <td className="cell-mono">{job.job_seq}</td>
                          <td>
                            <div className="cell-mono">{job.job_cd || "—"}</div>
                            <div>{job.job_name || <span className="muted">—</span>}</div>
                          </td>
                          <td>{job.exec_point_name ? `활동 ${job.exec_point_name}` : <span className="muted">—</span>}</td>
                          <td>{job.ref_job_name || <span className="muted">—</span>}</td>
                          <td>
                            {job.est_start_date ? (
                              <div className="cell-mono">{job.est_start_date}</div>
                            ) : !job.start_date_rule ? (
                              <div className="cell-mono">
                                <span className="muted">—</span>
                              </div>
                            ) : null}
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
                            {job.est_end_date ? (
                              <div className="cell-mono">{job.est_end_date}</div>
                            ) : !job.end_date_rule ? (
                              <div className="cell-mono">
                                <span className="muted">—</span>
                              </div>
                            ) : null}
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
                          <td>
                            <div className="row-actions">
                              <Btn size="sm" className="project-job-edit-btn" icon={<Pencil size={14} />} onClick={() => openEditJobModal(job)} disabled={jobSaving}>
                                상세/수정
                              </Btn>
                              <Btn size="sm" className="project-job-delete-btn" variant="danger" icon={<Trash2 size={14} />} onClick={() => void handleDeleteJob(job)} disabled={jobSaving}>
                                삭제
                              </Btn>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={repeatJobModeDialogOpen}
        title="등록 방식 선택"
        onClose={closeRepeatJobModeDialog}
        width="560px"
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
            <Btn variant="outline" onClick={openRepeatJobModalManual}>
              수기 등록
            </Btn>
            <Btn variant="primary" onClick={openRepeatJobModalFromRag}>
              RAG 등록
            </Btn>
            <Btn variant="outline" onClick={closeRepeatJobModeDialog}>
              취소
            </Btn>
          </div>
        }
      >
        <div className="muted" style={{ whiteSpace: "pre-wrap", lineHeight: 1.7 }}>
          기존 등록된 작업과 중복될 수 있습니다. 수기 등록을 권장합니다.
        </div>
      </Modal>

      <Modal
        open={jobEditOpen}
        title={isCreateJobMode ? "작업 등록" : "작업 상세/수정"}
        onClose={closeJobEditModal}
        width="860px"
        footer={
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Btn variant="primary" icon={<Save size={16} />} onClick={() => void handleSaveJob()} disabled={jobSaving}>
              {jobSaving ? (isCreateJobMode ? "등록 중..." : "저장 중...") : isCreateJobMode ? "등록" : "저장"}
            </Btn>
            <Btn variant="outline" onClick={closeJobEditModal} disabled={jobSaving}>
              취소
            </Btn>
          </div>
        }
      >
          <div style={{ display: "grid", gap: 18 }}>
            <div style={{ display: "grid", gridTemplateColumns: "220px minmax(0, 1fr)", gap: 28, alignItems: "end" }}>
              <label style={{ display: "grid", gap: 8 }}>
                <span className="detail-row-label">작업 순번</span>
                <input
                  value={jobFormSeq}
                  inputMode="numeric"
                disabled={!isCreateJobMode}
                onChange={(e) => setJobFormSeq(e.target.value.replace(/[^\d]/g, ""))}
                style={{
                  ...fieldInputStyle,
                  maxWidth: 160,
                  background: isCreateJobMode ? "#fff" : "var(--bg-soft)",
                  color: isCreateJobMode ? "var(--ink)" : "var(--muted)",
                  }}
                />
              </label>
              <div style={{ display: "grid", gap: 8 }}>
                <span className="detail-row-label">대상작업</span>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(160px, 220px) minmax(0, 1fr)", gap: 12, width: "100%" }}>
                  <input
                    value={jobFormCodeQuery}
                    onChange={(e) => setJobFormCodeQuery(e.target.value)}
                    placeholder="작업코드 또는 작업명을 입력해 검색"
                    style={fieldInputStyle}
                />
                <select value={jobFormCode} onChange={(e) => setJobFormCode(e.target.value)} style={fieldInputStyle}>
                  <option value="">작업을 선택하세요</option>
                  {filteredJobOptions.map((option) => (
                    <option key={option.job_cd} value={option.job_cd}>
                      {option.job_cd} / {option.job_name || option.job_cd}
                    </option>
                  ))}
                  </select>
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "220px minmax(0, 1fr)", gap: 28, alignItems: "end" }}>
              <label style={{ display: "grid", gap: 8 }}>
                <span className="detail-row-label">실행시점</span>
                <select value={jobFormExecPoint} onChange={(e) => setJobFormExecPoint(e.target.value)} style={fieldInputStyle}>
                  <option value="">선택 안 함</option>
                  {jobDialogExecPointOptions.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.code_name}
                    </option>
                  ))}
                </select>
              </label>
              <div style={{ display: "grid", gap: 8 }}>
                <span className="detail-row-label">선후행작업</span>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(160px, 220px) minmax(0, 1fr)", gap: 12, width: "100%" }}>
                  <input
                    value={jobFormPriorJobCodeQuery}
                    onChange={(e) => setJobFormPriorJobCodeQuery(e.target.value)}
                    placeholder="작업코드 또는 작업명을 입력해 검색"
                    style={fieldInputStyle}
                  />
                  <select
                    value={jobFormPriorJobCode}
                    onChange={(e) => {
                      const value = e.target.value
                      setJobFormPriorJobCode(value)
                      setJobFormStartRule(value ? DEFAULT_REF_END_RULE : normalizeRuleForReferenceJob(jobFormStartRule, false))
                      if (!value) {
                        setJobFormPriorJobCodeQuery("")
                      }
                    }}
                    style={fieldInputStyle}
                  >
                    <option value="">선택 안 함</option>
                    {filteredPriorJobOptions.map((option) => (
                      <option key={`prior-${option.job_cd}`} value={option.job_cd}>
                        {option.job_cd} / {option.job_name || option.job_cd}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16 }}>
              <label style={{ display: "grid", gap: 8 }}>
                <span className="detail-row-label">예상시작일</span>
                <input type="date" value={jobFormStartDate} onChange={(e) => setJobFormStartDate(e.target.value)} style={fieldInputStyle} />
              </label>
            <label style={{ display: "grid", gap: 8 }}>
              <span className="detail-row-label">예상종료일</span>
              <input type="date" value={jobFormEndDate} onChange={(e) => setJobFormEndDate(e.target.value)} style={fieldInputStyle} />
            </label>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16 }}>
            <label style={{ display: "grid", gap: 8 }}>
              <span className="detail-row-label" style={{ whiteSpace: "nowrap" }}>예상시작일규칙</span>
              <input
                value={jobFormStartRule}
                onChange={(e) => setJobFormStartRule(e.target.value)}
                style={fieldInputStyle}
              />
            </label>
            <label style={{ display: "grid", gap: 8 }}>
              <span className="detail-row-label" style={{ whiteSpace: "nowrap" }}>예상종료일규칙</span>
              <input
                value={jobFormEndRule}
                onChange={(e) => setJobFormEndRule(e.target.value)}
                style={fieldInputStyle}
              />
            </label>
          </div>

          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            <label style={fieldCheckboxStyle}>
              <input type="checkbox" checked={jobFormMandatory} onChange={(e) => setJobFormMandatory(e.target.checked)} />
              <span>필수 작업</span>
            </label>
            <label style={fieldCheckboxStyle}>
              <input type="checkbox" checked={jobFormEvidence} onChange={(e) => setJobFormEvidence(e.target.checked)} />
              <span>증빙 필요</span>
            </label>
          </div>
        </div>
      </Modal>

      <Modal
        open={repeatJobOpen}
        title="작업 등록"
        onClose={closeRepeatJobModal}
        width="860px"
        footer={
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Btn variant="primary" icon={<Save size={16} />} onClick={() => void handleSaveRepeatJobs()} disabled={jobSaving}>
              {jobSaving ? "등록 중..." : "등록"}
            </Btn>
            <Btn variant="outline" onClick={closeRepeatJobModal} disabled={jobSaving}>
              취소
            </Btn>
          </div>
        }
      >
        <div style={{ display: "grid", gap: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 24, alignItems: "center" }}>
            <label style={{ display: "grid", gridTemplateColumns: "150px minmax(0, 1fr)", gap: 12, alignItems: "center" }}>
              <span className="detail-row-label" style={{ whiteSpace: "nowrap", lineHeight: "44px" }}>반복횟수</span>
              <select value={repeatJobCount} onChange={(e) => setRepeatJobCount(e.target.value)} style={{ ...fieldInputStyle, width: "100%", minWidth: 0, maxWidth: 160 }}>
                {repeatJobCountOptions.map((count) => (
                  <option key={`repeat-job-${count}`} value={count}>
                    {count}회
                  </option>
                ))}
              </select>
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "150px minmax(0, 1fr)", gap: 12, alignItems: "center" }}>
              <span className="detail-row-label" style={{ lineHeight: "44px" }}>생성 작업 순번</span>
              <input
                value={`${nextJobSeq} ~ ${nextJobSeq + repeatJobCountValue - 1}`}
                disabled
                style={{ ...fieldInputStyle, background: "var(--bg-soft)", color: "var(--muted)" }}
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "150px minmax(0, 1fr)", gap: 12, alignItems: "center" }}>
            <span className="detail-row-label" style={{ lineHeight: "44px" }}>대상작업</span>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(160px, 220px) minmax(0, 1fr)", gap: 12, width: "100%" }}>
              <input
                value={jobFormCodeQuery}
                onChange={(e) => setJobFormCodeQuery(e.target.value)}
                placeholder="작업코드 또는 작업명을 입력해 검색"
                style={fieldInputStyle}
              />
              <select value={jobFormCode} onChange={(e) => setJobFormCode(e.target.value)} style={fieldInputStyle}>
                <option value="">작업을 선택하세요</option>
                {filteredJobOptions.map((option) => (
                  <option key={`repeat-${option.job_cd}`} value={option.job_cd}>
                    {option.job_cd} / {option.job_name || option.job_cd}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gap: 0 }}>
            <div className="muted" style={{ fontSize: 16, marginBottom: 6 }}>
              작업순번 별로 세부 정보를 입력하세요
            </div>
            <div className="repeat-job-tabs" role="tablist" aria-label="반복 작업 순번 선택">
              {repeatJobSeqNumbers.map((seq, index) => (
                <Btn
                  key={`repeat-seq-${seq}`}
                  size="sm"
                  variant="ghost"
                  className={selectedRepeatJobIndex === index ? "repeat-job-tab is-active" : "repeat-job-tab"}
                  onClick={() => setSelectedRepeatJobIndex(index)}
                  disabled={jobSaving}
                  title={`${seq}번 작업`}
                >
                  {index + 1}회
                </Btn>
              ))}
            </div>
            <div
              style={{
                display: "grid",
                gap: 18,
                padding: 18,
                marginTop: -1,
                border: "1px solid var(--line)",
                borderRadius: "0 16px 16px 16px",
                background: "var(--card)",
              }}
            >
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 220px) minmax(0, 1fr)", gap: 18, alignItems: "end" }}>
              <div style={{ display: "grid", gap: 8 }}>
                <span className="detail-row-label">실행시점</span>
                <select
                  value={selectedRepeatJobDraft?.exec_point_cd || ""}
                  onChange={(e) =>
                    updateSelectedRepeatJobDraft((draft) => ({
                      ...draft,
                      exec_point_cd: e.target.value,
                    }))
                  }
                  style={{ ...fieldInputStyle, width: "100%", minWidth: 0 }}
                >
                  <option value="">선택 안 함</option>
                  {jobDialogExecPointOptions.map((option) => (
                    <option key={`repeat-exec-${option.code}`} value={option.code}>
                      {option.code_name}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                <span className="detail-row-label" style={{ whiteSpace: "nowrap" }}>선후행작업</span>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 220px) minmax(0, 1fr)", gap: 12, width: "100%" }}>
                  <input
                    value={selectedRepeatJobDraft?.ref_job_code_query || ""}
                    onChange={(e) =>
                      updateSelectedRepeatJobDraft((draft) => ({
                        ...draft,
                        ref_job_code_query: e.target.value,
                      }))
                    }
                    placeholder="작업코드 또는 작업명을 입력해 검색"
                    style={fieldInputStyle}
                  />
                  <select
                    value={selectedRepeatJobDraft?.ref_job_cd || ""}
                    onChange={(e) =>
                      updateSelectedRepeatJobDraft((draft) => {
                        const nextRefJobCd = e.target.value
                        const hasReferenceJob = Boolean(nextRefJobCd)
                      return {
                        ...draft,
                        ref_job_cd: nextRefJobCd,
                        ref_job_code_query: nextRefJobCd ? draft.ref_job_code_query : "",
                        start_date_rule: hasReferenceJob
                          ? DEFAULT_REF_END_RULE
                          : normalizeRuleForReferenceJob(draft.start_date_rule, false),
                        end_date_rule: normalizeRuleForReferenceJob(draft.end_date_rule, hasReferenceJob),
                      }
                    })
                    }
                    style={fieldInputStyle}
                  >
                    <option value="">선택 안 함</option>
                    {filteredRepeatPriorJobOptions.map((option) => (
                      <option key={`repeat-prior-${option.job_cd}`} value={option.job_cd}>
                        {option.job_cd} / {option.job_name || option.job_cd}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16 }}>
              <label style={{ display: "grid", gap: 8 }}>
                <span className="detail-row-label">예상시작일</span>
                <input
                  type="date"
                  value={selectedRepeatJobDraft?.est_start_date || ""}
                  onChange={(e) =>
                    updateSelectedRepeatJobDraft((draft) => ({
                      ...draft,
                      est_start_date: e.target.value,
                    }))
                  }
                  style={fieldInputStyle}
                />
              </label>
              <label style={{ display: "grid", gap: 8 }}>
                <span className="detail-row-label">예상종료일</span>
                <input
                  type="date"
                  value={selectedRepeatJobDraft?.est_end_date || ""}
                  onChange={(e) =>
                    updateSelectedRepeatJobDraft((draft) => ({
                      ...draft,
                      est_end_date: e.target.value,
                    }))
                  }
                  style={fieldInputStyle}
                />
              </label>
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              <label style={{ display: "grid", gridTemplateColumns: selectedRepeatExecPointIsStart ? "130px minmax(0, 1fr)" : "130px minmax(0, 1fr) auto", gap: 10, alignItems: "center" }}>
                <span className="detail-row-label" style={{ whiteSpace: "nowrap", lineHeight: "44px" }}>시작일규칙</span>
                <input
                  value={selectedRepeatJobDraft?.start_date_rule || ""}
                  onChange={(e) =>
                    updateSelectedRepeatJobDraft((draft) => ({
                      ...draft,
                      start_date_rule: e.target.value,
                    }))
                  }
                  style={fieldInputStyle}
                />
                {!selectedRepeatExecPointIsStart ? (
                  <Btn
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      updateSelectedRepeatJobDraft((draft) => ({
                        ...draft,
                        start_date_rule: DEFAULT_THIS_PRE_RULE,
                      }))
                    }
                  >
                    기본 규칙
                  </Btn>
                ) : null}
              </label>
              <label style={{ display: "grid", gridTemplateColumns: selectedRepeatExecPointIsStart ? "130px minmax(0, 1fr)" : "130px minmax(0, 1fr) auto", gap: 10, alignItems: "center" }}>
                <span className="detail-row-label" style={{ whiteSpace: "nowrap", lineHeight: "44px" }}>종료일규칙</span>
                <input
                  value={selectedRepeatJobDraft?.end_date_rule || ""}
                  onChange={(e) =>
                    updateSelectedRepeatJobDraft((draft) => ({
                      ...draft,
                      end_date_rule: e.target.value,
                    }))
                  }
                  style={fieldInputStyle}
                />
                {!selectedRepeatExecPointIsStart ? (
                  <Btn
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      updateSelectedRepeatJobDraft((draft) => ({
                        ...draft,
                        end_date_rule: DEFAULT_THIS_PRE_RULE,
                      }))
                    }
                  >
                    기본 규칙
                  </Btn>
                ) : null}
              </label>
            </div>

            <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center" }}>
              <label style={fieldCheckboxStyle}>
                <input
                  type="checkbox"
                  checked={selectedRepeatJobDraft?.mandatory ?? true}
                  onChange={(e) =>
                    updateSelectedRepeatJobDraft((draft) => ({
                      ...draft,
                      mandatory: e.target.checked,
                    }))
                  }
                />
                <span>필수 작업</span>
              </label>
              <label style={fieldCheckboxStyle}>
                <input
                  type="checkbox"
                  checked={selectedRepeatJobDraft?.evidence ?? true}
                  onChange={(e) =>
                    updateSelectedRepeatJobDraft((draft) => ({
                      ...draft,
                      evidence: e.target.checked,
                    }))
                  }
                />
                <span>증빙 필요</span>
              </label>
              </div>
              <Btn
                type="button"
                size="sm"
                variant="secondary"
                className="activity-description-btn"
                onClick={() => openRuleDialog("활동 설명", selectedActivityForJobs?.description || "활동 설명이 없습니다.")}
              >
                활동설명 보기
              </Btn>
            </div>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={ruleDialogOpen}
        title={ruleDialogTitle || "규칙 상세"}
        onClose={closeRuleDialog}
        width={ruleDialogTitle.includes("제안 상세") ? "920px" : ruleDialogTitle === "활동 설명" ? "680px" : "560px"}
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Btn variant="outline" onClick={closeRuleDialog}>
              닫기
            </Btn>
          </div>
        }
      >
        {parsedRuleDialogContent && ruleDialogTitle.includes("제안 상세") ? (
          (() => {
            const sourceExcerpt = String(parsedRuleDialogContent.source_excerpt || "").trim()
            const extractedActivityName = normalizeActivityNameText(
              String(parsedRuleDialogContent.activity_name || "") ||
                sourceExcerpt.match(/활동명\s*[:：]\s*([^\n]+)/)?.[1]?.trim() ||
                "",
            )
            const extractedMainContent =
              normalizeMultilineText(String(parsedRuleDialogContent.main_content || "")) ||
              normalizeMultilineText(sourceExcerpt.match(/주요\s*내용\s*[:：]\s*([\s\S]*?)(?:\n\s*단가\s*[:：]|$)/)?.[1]?.trim() || "") ||
              normalizeMultilineText(sourceExcerpt)
            const headingPath = String(parsedRuleDialogContent.heading_path || "").trim()
            const descriptionSuggestion = normalizeMultilineText(String(parsedRuleDialogContent.description_suggestion || ""))
            const normalizedSourceExcerpt = sourceExcerpt.replace(/\s+/g, " ").trim()
            const headingContextLines = Array.isArray(parsedRuleDialogContent.heading_context_lines)
              ? parsedRuleDialogContent.heading_context_lines
                  .map((item) => String(item || "").trim())
                  .filter(Boolean)
                  .filter((line) => line.replace(/\s+/g, " ").trim() !== normalizedSourceExcerpt)
              : []
            const mainContentLineSet = new Set(
              splitNormalizedLines(extractedMainContent).map((line) => line.replace(/\s+/g, " ").trim()),
            )
            const supplementalDescriptionLineSet = new Set<string>()
            const supplementalDescriptionLines = splitNormalizedLines(descriptionSuggestion).filter((line) => {
              const normalizedLine = line.replace(/\s+/g, " ").trim()
              if (!normalizedLine || mainContentLineSet.has(normalizedLine)) {
                return false
              }
              if (supplementalDescriptionLineSet.has(normalizedLine)) {
                return false
              }
              supplementalDescriptionLineSet.add(normalizedLine)
              return true
            })
            const unitPrice =
              parsedRuleDialogContent.unit_price &&
              typeof parsedRuleDialogContent.unit_price === "object"
                ? (parsedRuleDialogContent.unit_price as Record<string, unknown>)
                : null
            const unitPriceText = (() => {
              if (!unitPrice) return "—"
              const amount = Number(unitPrice.amount || 0)
              const rawText = String(unitPrice.raw_text || "").trim()
              const sourceText = String(unitPrice.source_excerpt || "").trim()
              const explicitLine = sourceText
                .split(/\r?\n/)
                .map((line) => line.trim())
                .find((line) => /^단가\s*[:：]/.test(line))
              const normalizedExplicitLine = explicitLine
                ? explicitLine.replace(/^단가\s*[:：]\s*/, "").trim()
                : ""
              const fallbackLines = sourceText
                .split(/\r?\n/)
                .map((line) => line.trim())
                .filter((line) => line && !/^활동명\s*[:：]/.test(line) && !/^주요\s*내용\s*[:：]/.test(line))
              if (normalizedExplicitLine) {
                const extra = fallbackLines.find((line) => /^\(.+\)$/.test(line))
                return [normalizedExplicitLine, extra].filter(Boolean).join("\n")
              }
              if (rawText && rawText !== "0만원/ha") {
                return rawText
              }
              return amount > 0 ? `${amount.toLocaleString("ko-KR")}원` : "—"
            })()
            return (
              <div style={{ display: "grid", gap: 10 }}>
                {headingPath ? (
                  <div
                    className="muted"
                    style={{
                      fontSize: 13,
                      lineHeight: 1.5,
                    }}
                  >
                    출처 목차: {headingPath}
                  </div>
                ) : null}
                <div
                  style={{
                    border: "1px solid var(--line)",
                    borderRadius: 12,
                    overflow: "hidden",
                    background: "#fff",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "160px minmax(0, 2.2fr) 160px",
                      background: "#f0ede2",
                      borderBottom: "1px solid var(--line)",
                    }}
                  >
                    {["활동명", "주요 내용", "단가"].map((label) => (
                      <div
                        key={label}
                        style={{
                          padding: "12px 14px",
                          fontSize: 14,
                          fontWeight: 800,
                          color: "var(--ink)",
                          borderRight: label === "단가" ? "none" : "1px solid var(--line)",
                          textAlign: "center",
                        }}
                      >
                        {label}
                      </div>
                    ))}
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "160px minmax(0, 2.2fr) 160px",
                    }}
                  >
                    <div
                      style={{
                        padding: "18px 14px",
                        borderRight: "1px solid var(--line)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        lineHeight: 1.6,
                        fontSize: 16,
                        fontWeight: 700,
                      }}
                    >
                      {extractedActivityName || "—"}
                    </div>
                    <div
                      style={{
                        padding: "18px 16px",
                        borderRight: "1px solid var(--line)",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        lineHeight: 1.7,
                        color: "var(--ink-soft)",
                        fontSize: 15,
                        minWidth: 0,
                      }}
                    >
                      {extractedMainContent || "—"}
                    </div>
                    <div
                      style={{
                        padding: "18px 14px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        textAlign: "center",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        lineHeight: 1.6,
                        fontSize: 15,
                        fontWeight: 700,
                      }}
                    >
                      {unitPriceText}
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    border: "1px solid var(--line)",
                    borderRadius: 12,
                    background: "#fcfaf4",
                    padding: "14px 16px",
                    display: "grid",
                    gap: 10,
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 800, color: "var(--ink)" }}>
                    부가 내용
                  </div>
                  <div style={{ display: "grid", gap: 10 }}>
                    {supplementalDescriptionLines.length > 0 ? (
                      supplementalDescriptionLines.map((line, index) => (
                        <div
                          key={`${index}-${line.slice(0, 24)}`}
                          style={{
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                            lineHeight: 1.7,
                            color: "var(--ink-soft)",
                            fontSize: 15,
                          }}
                        >
                          {line}
                        </div>
                      ))
                    ) : (
                      <div
                        style={{
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                          lineHeight: 1.7,
                          color: "var(--ink-soft)",
                          fontSize: 15,
                        }}
                      >
                        해당 사항 없음
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })()
        ) : (
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
        )}
      </Modal>

      <Modal
        open={errorDialogOpen}
        title="오류"
        onClose={() => {
          if (saving || jobSaving) return
          setErrorDialogOpen(false)
        }}
        width="420px"
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Btn variant="primary" onClick={() => setErrorDialogOpen(false)} disabled={saving || jobSaving}>
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
