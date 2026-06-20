"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ChangeEvent, DragEvent } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { DatabaseZap, FileText, Loader2, Upload } from "lucide-react"
import { PageHeader } from "@/components/ui/PageHeader"
import { Card, CardBody, CardHead } from "@/components/ui/Card"
import { Btn } from "@/components/ui/Btn"
import { Modal } from "@/components/ui/Modal"
import {
  getRagFileDetail,
  getRagHeadings,
  preparseRagDocument,
  RAG_ADMIN_CONNECTION_ERROR_MESSAGE,
  registerRagDocument,
} from "@/lib/rag-api"
import type { RagHeadingOption, RagPreparseHeadingRow, RagPreparsePreviewBlock } from "@/lib/rag-types"

const ACCEPTED_SUFFIXES = [".pdf", ".docx", ".hwpx", ".md"]
const ACCEPT_ATTR = ACCEPTED_SUFFIXES.join(",")

const inputStyle = {
  height: 44,
  borderRadius: 10,
  border: "1px solid var(--line)",
  background: "#fff",
  padding: "0 14px",
  font: "inherit",
} as const

const EMPTY_SCHEMA_NOTE = JSON.stringify({ added: [], deleted: [] }, null, 2)

function isInactiveRowAction(action: string): boolean {
  return action === "삭제" || action === "제외" || action === "무시"
}

function isActiveRowAction(action: string): boolean {
  return action === "유지" || action === "신규"
}

function compareHeadingRows(
  a: RagPreparseHeadingRow & { originalIndex: number },
  b: RagPreparseHeadingRow & { originalIndex: number },
): number {
  if (a.depth !== b.depth) return a.depth - b.depth
  if (a.is_new !== b.is_new) return a.is_new ? 1 : -1
  return a.originalIndex - b.originalIndex
}

function normalizeRowAction(action: string, isNew: boolean): string {
  if (isNew) {
    return action === "무시" ? "무시" : "신규"
  }
  return action === "유지" ? "유지" : "제외"
}

function resolveDisplayNotation(
  notationDisplay: string | null | undefined,
  notation: string | null | undefined,
): string {
  const display = String(notationDisplay || "").trim()
  if (display) return display
  return String(notation || "").trim()
}

function normalizeNotationKey(notation: string): string {
  return String(notation || "").trim()
}

function uniqueNotationList(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  const items: string[] = []
  for (const value of values) {
    const text = String(value || "").trim()
    const key = normalizeNotationKey(text)
    if (!key || seen.has(key)) continue
    seen.add(key)
    items.push(text)
  }
  return items
}

function buildSchemaNote(added: string[], deleted: string[]): string {
  return JSON.stringify(
    {
      added: uniqueNotationList(added),
      deleted: uniqueNotationList(deleted),
    },
    null,
    2,
  )
}

function parseSchemaNote(value?: string | null): { added: string[]; deleted: string[] } {
  const raw = String(value || "").trim()
  if (!raw) return { added: [], deleted: [] }
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === "object") {
      const added = Array.isArray((parsed as { added?: unknown }).added)
        ? ((parsed as { added: unknown[] }).added.map((item) => String(item).trim()).filter(Boolean))
        : []
      const deleted = Array.isArray((parsed as { deleted?: unknown }).deleted)
        ? ((parsed as { deleted: unknown[] }).deleted.map((item) => String(item).trim()).filter(Boolean))
        : []
      return { added, deleted }
    }    
  } catch {
    return { added: [], deleted: [] }
  }
  return { added: [], deleted: [] }
}

function normalizeSchemaNote(value?: string | null): string {
  const { added, deleted } = parseSchemaNote(value)
  return buildSchemaNote(added, deleted)
}

function formatSchemaNoteDisplay(value?: string | null): string {
  const raw = String(value || "").trim()
  if (!raw) return "신규: 없음 / 제외: 없음"
  try {
    JSON.parse(raw)
  } catch {
    return raw
  }
  const { added, deleted } = parseSchemaNote(value)
  return `신규: ${added.join(", ") || "없음"} / 제외: ${deleted.join(", ") || "없음"}`
}

type ExitCriterionMode = "matched_heading"

type ExitCriterionTargetOption = {
  value: string
  label: string
}

type ExitCriteriaRecord = {
  mode: "matched_heading"
  target_template: "main" | "appendix"
  match: {
    depth?: number | null
    rule_id?: string | null
    notation?: string | null
  }
}

function buildExitCriterionTargetOptions(template?: RagHeadingOption | null): ExitCriterionTargetOption[] {
  const levels = Array.isArray((template?.heading_schema as { levels?: unknown } | undefined)?.levels)
    ? (((template?.heading_schema as { levels: Array<Record<string, unknown>> })?.levels) || [])
    : []

  return levels
    .filter((level) => level && typeof level === "object")
    .map((level, idx) => {
      const depth = Number(level.depth || idx + 1)
      const notation = String(level.notation || "").trim()
      const notationDisplay = String(level.notation_display || "").trim()
      const ruleId = String(level.rule_id || "").trim()
      const payload = JSON.stringify({
        depth,
        rule_id: ruleId || null,
        notation: notation || null,
      })
      const label = `depth ${depth} - ${notationDisplay || notation || ruleId || `level ${idx + 1}`}`
      return {
        value: payload,
        label,
      }
    })
}

function buildExitCriteriaValue(
  targetTemplate: "main" | "appendix",
  selectedValue: string,
): ExitCriteriaRecord | null {
  if (!selectedValue) return null
  try {
    const match = JSON.parse(selectedValue) as ExitCriteriaRecord["match"]
    return {
      mode: "matched_heading",
      target_template: targetTemplate,
      match: {
        depth: typeof match?.depth === "number" ? match.depth : null,
        rule_id: String(match?.rule_id || "").trim() || null,
        notation: String(match?.notation || "").trim() || null,
      },
    }
  } catch {
    return null
  }
}

function parseExitCriterionDepth(selectedValue: string): number | null {
  if (!selectedValue) return null
  try {
    const match = JSON.parse(selectedValue) as { depth?: unknown }
    const depth = Number(match?.depth || 0)
    return Number.isFinite(depth) && depth > 0 ? depth : null
  } catch {
    return null
  }
}

function parseExitCriteriaSelection(criteria: unknown): string {
  if (!criteria || typeof criteria !== "object") return ""
  const match = (criteria as { match?: unknown }).match
  if (!match || typeof match !== "object") return ""
  const payload = {
    depth: Number((match as { depth?: unknown }).depth || 0) || null,
    rule_id: String((match as { rule_id?: unknown }).rule_id || "").trim() || null,
    notation: String((match as { notation?: unknown }).notation || "").trim() || null,
  }
  return JSON.stringify(payload)
}

function hasSupportedSuffix(name: string): boolean {
  const lower = (name || "").toLowerCase()
  return ACCEPTED_SUFFIXES.some((s) => lower.endsWith(s))
}

function slugifyFileId(value: string): string {
  const normalized = (value || "").trim()
  const slug = normalized
    .replace(/[^\p{L}\p{N}_가-힣]+/gu, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase()
  return (slug || "rag_document").slice(0, 64)
}

export default function RagNewPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const rerenderFileId = searchParams.get("file_id") || ""
  const isRerenderMode = !!rerenderFileId
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [templates, setTemplates] = useState<RagHeadingOption[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState("")
  const [selectedAppendixTemplateId, setSelectedAppendixTemplateId] = useState("")
  const [bodyExitMode] = useState<ExitCriterionMode>("matched_heading")
  const [bodyExitTarget, setBodyExitTarget] = useState("")
  const [bodyExitTargetTouched, setBodyExitTargetTouched] = useState(false)
  const [appendixExitMode] = useState<ExitCriterionMode>("matched_heading")
  const [appendixExitTarget, setAppendixExitTarget] = useState("")
  const [appendixExitTargetTouched, setAppendixExitTargetTouched] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewBlocks, setPreviewBlocks] = useState<RagPreparsePreviewBlock[]>([])
  const [dragging, setDragging] = useState(false)
  const [preparsing, setPreparsing] = useState(false)
  const [registering, setRegistering] = useState(false)
  const [error, setError] = useState("")
  const [saveError, setSaveError] = useState("")
  const [headingRows, setHeadingRows] = useState<RagPreparseHeadingRow[]>([])
  const [hierarchyType, setHierarchyType] = useState("")
  const [appendixHeadingRows, setAppendixHeadingRows] = useState<RagPreparseHeadingRow[]>([])
  const [appendixHierarchyType, setAppendixHierarchyType] = useState("")
  const [sampleDialogOpen, setSampleDialogOpen] = useState(false)
  const [sampleDialogRow, setSampleDialogRow] = useState<RagPreparseHeadingRow | null>(null)
  const [sampleDialogMessage, setSampleDialogMessage] = useState("")
  const [normalizeConfirmOpen, setNormalizeConfirmOpen] = useState(false)

  const [fileName, setFileName] = useState("")
  const [formatType, setFormatType] = useState("")
  const [docName, setDocName] = useState("")
  const [fileId, setFileId] = useState("")
  const [docCat, setDocCat] = useState("")
  const [docVersion, setDocVersion] = useState("1.0")
  const [publicationDate, setPublicationDate] = useState("")
  const [docNumber, setDocNumber] = useState("")
  const [docManager, setDocManager] = useState("")
  const [schemaNote, setSchemaNote] = useState(EMPTY_SCHEMA_NOTE)
  const [appendixSchemaNote, setAppendixSchemaNote] = useState("삭제: 없음")

  const draftReady = useMemo(() => !!fileId && !!docName, [fileId, docName])
  const bodyTemplates = useMemo(
    () => templates.filter((template) => String(template.body_yn || "Y").trim() !== "N"),
    [templates],
  )
  const appendixTemplates = useMemo(
    () => templates.filter((template) => String(template.body_yn || "Y").trim() === "N"),
    [templates],
  )
  const templateById = useMemo(
    () => new Map(templates.map((template) => [template.heading_id, template])),
    [templates],
  )
  const selectedBodyTemplate = useMemo(
    () => (selectedTemplateId ? templateById.get(selectedTemplateId) || null : null),
    [selectedTemplateId, templateById],
  )
  const selectedAppendixTemplate = useMemo(
    () => (selectedAppendixTemplateId ? templateById.get(selectedAppendixTemplateId) || null : null),
    [selectedAppendixTemplateId, templateById],
  )
  const bodyExitTargetOptions = useMemo(
    () => buildExitCriterionTargetOptions(selectedAppendixTemplate),
    [selectedAppendixTemplate],
  )
  const appendixExitTargetOptions = useMemo(
    () => buildExitCriterionTargetOptions(selectedBodyTemplate),
    [selectedBodyTemplate],
  )
  const displayedHeadingRows = useMemo(
    () =>
      headingRows
        .map((row, originalIndex) => ({ ...row, originalIndex }))
        .sort(compareHeadingRows),
    [headingRows],
  )
  const displayedAppendixHeadingRows = useMemo(
    () =>
      appendixHeadingRows
        .map((row, originalIndex) => ({ ...row, originalIndex }))
        .sort(compareHeadingRows),
    [appendixHeadingRows],
  )

  const buildNormalizedHeadingRows = useCallback((rows: RagPreparseHeadingRow[]) => {
    const sorted = rows
      .map((row, originalIndex) => ({ ...row, originalIndex }))
      .sort(compareHeadingRows)

    const reassigned = new Map<string, number>()
    let nextDepth = 1
    sorted.forEach((row) => {
      if (!isActiveRowAction(row.action)) return
      reassigned.set(row.row_id, nextDepth)
      nextDepth += 1
    })

    return rows.map((item) =>
      reassigned.has(item.row_id)
        ? { ...item, depth: reassigned.get(item.row_id) || item.depth }
        : item,
    )
  }, [])

  const hasUnnormalizedDepths = useCallback(
    (rows: RagPreparseHeadingRow[]) => {
      const normalized = buildNormalizedHeadingRows(rows)
      return rows.some((row, idx) => row.depth !== normalized[idx]?.depth)
    },
    [buildNormalizedHeadingRows],
  )

  useEffect(() => {
    if (!bodyExitTargetOptions.some((option) => option.value === bodyExitTarget)) {
      setBodyExitTarget("")
    }
  }, [bodyExitTarget, bodyExitTargetOptions])

  useEffect(() => {
    if (!appendixExitTargetOptions.some((option) => option.value === appendixExitTarget)) {
      setAppendixExitTarget("")
    }
  }, [appendixExitTarget, appendixExitTargetOptions])

  useEffect(() => {
    if (!selectedAppendixTemplateId) {
      setBodyExitTarget("")
      setBodyExitTargetTouched(false)
      return
    }
    if (bodyExitTargetTouched) return
    if (bodyExitTarget) return
    const defaultOption = bodyExitTargetOptions[0]
    if (defaultOption?.value) {
      setBodyExitTarget(defaultOption.value)
    }
  }, [bodyExitTarget, bodyExitTargetOptions, bodyExitTargetTouched, selectedAppendixTemplateId])

  useEffect(() => {
    if (!selectedAppendixTemplateId || !selectedTemplateId) {
      setAppendixExitTarget("")
      setAppendixExitTargetTouched(false)
      return
    }
    if (appendixExitTargetTouched) return
    if (appendixExitTarget) return
    const depth2Option =
      appendixExitTargetOptions.find((option) => parseExitCriterionDepth(option.value) === 2) || null
    const defaultOption = depth2Option || appendixExitTargetOptions[0] || null
    if (defaultOption?.value) {
      setAppendixExitTarget(defaultOption.value)
    }
  }, [
    appendixExitTarget,
    appendixExitTargetOptions,
    appendixExitTargetTouched,
    selectedAppendixTemplateId,
    selectedTemplateId,
  ])

  useEffect(() => {
    let ignore = false
    async function loadInitial() {
      try {
        const headingOptions = await getRagHeadings()
        if (ignore) return
        setTemplates(headingOptions)
        if (headingOptions.length && !selectedTemplateId) {
          const defaultBodyTemplate = headingOptions.find(
            (template) => String(template.body_yn || "Y").trim() !== "N",
          )
          setSelectedTemplateId(defaultBodyTemplate?.heading_id || "")
        }
        if (rerenderFileId) {
          const detail = await getRagFileDetail(rerenderFileId)
          if (ignore) return
          if (detail.item) {
            setFileName(detail.item.file_name || "")
            setFormatType(detail.item.format_type || "")
            setDocName(detail.item.doc_name || "")
            setFileId(detail.item.file_id || "")
            setDocCat(detail.item.doc_cat || "")
            setDocVersion(detail.item.doc_version?.toFixed(1) || "1.0")
            setPublicationDate(detail.item.publication_date || "")
            setDocNumber(detail.item.doc_number || "")
            setDocManager(detail.item.doc_manager || "")
            setSchemaNote(normalizeSchemaNote(detail.item.schema_note))
            setSelectedTemplateId(detail.item.ref_heading_id || "")
            setSelectedAppendixTemplateId(detail.item.ref_appendix_id || "")
            const parsedBodyExitTarget = parseExitCriteriaSelection(detail.item.body_exit_criteria)
            const parsedAppendixExitTarget = parseExitCriteriaSelection(detail.item.appendix_exit_criteria)
            setBodyExitTarget(parsedBodyExitTarget)
            setAppendixExitTarget(parsedAppendixExitTarget)
            setBodyExitTargetTouched(true)
            setAppendixExitTargetTouched(true)
          }
          const detailHeadingSchema = detail.runtime_heading_schema || detail.heading_schema
          const detailAppendixSchema = detail.runtime_appendix_schema || detail.appendix_schema
          setHierarchyType(String((detailHeadingSchema as { hierarchy_type?: unknown })?.hierarchy_type || ""))
          setAppendixHierarchyType(String((detailAppendixSchema as { hierarchy_type?: unknown })?.hierarchy_type || ""))
          setHeadingRows(
            Array.isArray((detailHeadingSchema as { levels?: unknown })?.levels)
              ? (((detailHeadingSchema as { levels: Array<Record<string, unknown>> }).levels || []).map((level, idx) => ({
                  row_id: `existing-${idx + 1}`,
                  depth: Number(level.depth || idx + 1),
                  rule_id: String(level.rule_id || "") || null,
                  notation: String(level.notation || ""),
                  display_notation: resolveDisplayNotation(
                    String(level.notation_display || ""),
                    String(level.notation || ""),
                  ),
                  occurrence_count: 0,
                  matched_samples: [],
                  action: "유지",
                  pattern: String(level.pattern || ""),
                  rule_type: String(level.rule_type || "") || null,
                  rule_options:
                    level.rule_options && typeof level.rule_options === "object"
                      ? (level.rule_options as Record<string, unknown>)
                      : null,
                  location: String(level.location || "paragraph"),
                  name: String(level.name || "") || null,
                  is_new: false,
                })))
              : [],
          )
          setAppendixHeadingRows(
            Array.isArray((detailAppendixSchema as { levels?: unknown })?.levels)
              ? (((detailAppendixSchema as { levels: Array<Record<string, unknown>> }).levels || []).map((level, idx) => ({
                  row_id: `appendix-existing-${idx + 1}`,
                  depth: Number(level.depth || idx + 1),
                  rule_id: String(level.rule_id || "") || null,
                  notation: String(level.notation || ""),
                  display_notation: resolveDisplayNotation(
                    String(level.notation_display || ""),
                    String(level.notation || ""),
                  ),
                  occurrence_count: 0,
                  matched_samples: [],
                  action: "유지",
                  pattern: String(level.pattern || ""),
                  rule_type: String(level.rule_type || "") || null,
                  rule_options:
                    level.rule_options && typeof level.rule_options === "object"
                      ? (level.rule_options as Record<string, unknown>)
                      : null,
                  location: String(level.location || "paragraph"),
                  name: String(level.name || "") || null,
                  is_new: false,
                })))
              : [],
          )
        }
      } catch (e) {
        if (!ignore) {
          setError(e instanceof Error ? e.message : RAG_ADMIN_CONNECTION_ERROR_MESSAGE)
        }
      }
    }
    void loadInitial()
    return () => {
      ignore = true
    }
  }, [rerenderFileId])

  const applyPreparse = useCallback((data: Awaited<ReturnType<typeof preparseRagDocument>>) => {
    setTemplates(data.templates || [])
    setSelectedTemplateId(data.ref_heading_id)
    setSelectedAppendixTemplateId(data.ref_appendix_id || "")
    setFileName(data.file_name || "")
    setFormatType(data.format_type || "")
    setDocName(data.doc_name || "")
    setFileId(data.file_id || "")
    setDocCat(data.doc_cat || "")
    setDocVersion(Number(data.doc_version || 1).toFixed(1))
    setPublicationDate(data.publication_date || "")
    setDocNumber(data.doc_number || "")
    setDocManager(data.doc_manager || "")
    setSchemaNote(normalizeSchemaNote(data.schema_note))
    setHierarchyType(String((data.heading_schema as { hierarchy_type?: unknown })?.hierarchy_type || ""))
    setAppendixHierarchyType(String((data.appendix_schema as { hierarchy_type?: unknown })?.hierarchy_type || ""))
    setHeadingRows(
      (data.heading_rows || []).map((row) => ({
        ...row,
        display_notation: resolveDisplayNotation(row.display_notation, row.notation),
        action: normalizeRowAction(row.action, !!row.is_new),
      })),
    )
    setAppendixHeadingRows(
      (data.appendix_heading_rows || []).map((row) => ({
        ...row,
        display_notation: resolveDisplayNotation(row.display_notation, row.notation),
        action: row.action === "유지" ? "유지" : "제외",
      })),
    )
    setPreviewBlocks(data.preview_blocks || [])
  }, [])

  useEffect(() => {
    const added = uniqueNotationList(
      headingRows
        .filter((row) => row.is_new && row.action === "신규")
        .map((row) => row.display_notation || row.notation),
    )
    const deleted = uniqueNotationList(
      headingRows
        .filter((row) => !row.is_new && row.action === "제외")
        .map((row) => row.display_notation || row.notation),
    )
    setSchemaNote(buildSchemaNote(added, deleted))
  }, [headingRows])

  useEffect(() => {
    const deleted = appendixHeadingRows
      .filter((row) => row.action === "제외")
      .map((row) => row.display_notation || row.notation)
    setAppendixSchemaNote(`삭제: ${deleted.join(", ") || "없음"}`)
  }, [appendixHeadingRows])

  const runPreparse = useCallback(async () => {
    if (!selectedFile) {
      setError("먼저 파일을 선택해 주세요.")
      return
    }
    if (!selectedTemplateId) {
      setError("Heading Template 을 선택해 주세요.")
      return
    }
    setError("")
    setPreparsing(true)
    try {
      const parsedBodyExitCriteria = buildExitCriteriaValue("appendix", bodyExitTarget)
      const parsedAppendixExitCriteria = buildExitCriteriaValue("main", appendixExitTarget)
      const data = await preparseRagDocument(
        selectedFile,
        selectedTemplateId,
        selectedAppendixTemplateId || undefined,
        {
          bodyExitCriteria: parsedBodyExitCriteria,
          appendixExitCriteria: parsedAppendixExitCriteria,
        },
      )
      applyPreparse(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : RAG_ADMIN_CONNECTION_ERROR_MESSAGE)
    } finally {
      setPreparsing(false)
    }
  }, [appendixExitTarget, applyPreparse, bodyExitTarget, selectedAppendixTemplateId, selectedFile, selectedTemplateId])

  const onFileSelected = (file: File | null) => {
    if (!file) return
    setError("")
    if (!hasSupportedSuffix(file.name)) {
      setError(`지원하지 않는 형식입니다: ${file.name}.\n${ACCEPTED_SUFFIXES.join(", ")} 만 업로드해 주세요.`)
      return
    }
    setSelectedFile(file)
    setFileName(file.name)
  }

  const onInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    onFileSelected(e.target.files?.[0] || null)
    e.target.value = ""
  }

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(false)
    onFileSelected(e.dataTransfer?.files?.[0] || null)
  }

  const performSave = useCallback(async (rowsToSave: RagPreparseHeadingRow[]) => {
    if (!selectedFile) {
      setSaveError("등록할 파일을 먼저 선택해 주세요.")
      return
    }
    if (!fileId.trim() || !docName.trim()) {
      setSaveError("Pre-Parsing 을 먼저 실행하고 문서명/파일ID를 확인해 주세요.")
      return
    }
    const versionNum = Number(docVersion)
    if (!Number.isFinite(versionNum) || versionNum <= 0) {
      setSaveError("문서버전 값이 올바르지 않습니다.")
      return
    }
    const parsedSchema: Record<string, unknown> = {
      hierarchy_type: hierarchyType || selectedTemplateId || "custom",
      levels: rowsToSave
        .filter((row) => (!row.is_new && row.action === "유지") || (row.is_new && row.action === "신규"))
        .sort((a, b) => a.depth - b.depth || a.notation.localeCompare(b.notation))
        .map((row) => {
          const level: Record<string, unknown> = {
            depth: row.depth,
            notation: row.notation,
            location: row.location || "paragraph",
          }
          if (row.rule_id) level.rule_id = row.rule_id
          if (row.name) level.name = row.name
          if (row.rule_id) {
            if (row.rule_options) {
              level.rule_options = row.rule_options
            }
          } else if (row.rule_type) {
            level.rule_type = row.rule_type
            if (row.rule_options) {
              level.rule_options = row.rule_options
            }
          } else if (row.pattern) {
            level.pattern = row.pattern
          }
          return level
        }),
    }
    const parsedAppendixSchema: Record<string, unknown> | null =
      selectedAppendixTemplateId || appendixHeadingRows.length
        ? {
            hierarchy_type: appendixHierarchyType || selectedAppendixTemplateId || "appendix",
            levels: appendixHeadingRows
              .filter((row) => row.action === "유지")
              .sort((a, b) => a.depth - b.depth || a.notation.localeCompare(b.notation))
              .map((row) => {
                const level: Record<string, unknown> = {
                  depth: row.depth,
                  notation: row.notation,
                  location: row.location || "paragraph",
                }
                if (row.rule_id) level.rule_id = row.rule_id
                if (row.name) level.name = row.name
                if (row.rule_id) {
                  if (row.rule_options) {
                    level.rule_options = row.rule_options
                  }
                } else if (row.rule_type) {
                  level.rule_type = row.rule_type
                  if (row.rule_options) {
                    level.rule_options = row.rule_options
                  }
                } else if (row.pattern) {
                  level.pattern = row.pattern
                }
                return level
              }),
          }
        : null
    const parsedBodyExitCriteria = buildExitCriteriaValue("appendix", bodyExitTarget)
    const parsedAppendixExitCriteria = buildExitCriteriaValue("main", appendixExitTarget)

    setSaveError("")
    setRegistering(true)
    try {
      await registerRagDocument({
        file: selectedFile,
        file_id: fileId.trim(),
        file_name: fileName.trim() || selectedFile.name,
        format_type: formatType.trim(),
        doc_name: docName.trim(),
        doc_cat: docCat.trim() || "기타문서",
        doc_version: versionNum,
        publication_date: publicationDate || null,
        doc_number: docNumber.trim() || null,
        doc_manager: docManager.trim() || null,
        ref_heading_id: selectedTemplateId || null,
        ref_appendix_id: selectedAppendixTemplateId || null,
        body_exit_criteria: parsedBodyExitCriteria,
        appendix_exit_criteria: parsedAppendixExitCriteria,
        heading_schema: parsedSchema,
        appendix_schema: parsedAppendixSchema,
        schema_note: schemaNote.trim() || null,
      })
      router.push("/rag")
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : RAG_ADMIN_CONNECTION_ERROR_MESSAGE)
    } finally {
      setRegistering(false)
    }
  }, [
    docCat,
    docName,
    docVersion,
    docNumber,
    formatType,
    fileId,
    docManager,
    fileName,
    publicationDate,
    router,
    schemaNote,
    appendixHeadingRows,
    appendixExitTarget,
    appendixHierarchyType,
    bodyExitTarget,
    selectedFile,
    selectedTemplateId,
    selectedAppendixTemplateId,
    hierarchyType,
  ])

  const onSave = useCallback(async () => {
    if (hasUnnormalizedDepths(headingRows)) {
      setNormalizeConfirmOpen(true)
      return
    }
    await performSave(headingRows)
  }, [hasUnnormalizedDepths, headingRows, performSave])

  const openSampleDialog = useCallback((row: RagPreparseHeadingRow) => {
    setSampleDialogRow(row)
    setSampleDialogMessage(
      row.occurrence_count > 0 ? "" : "해당 단계 목차가 발견되지 않았습니다.",
    )
    setSampleDialogOpen(true)
  }, [])

  const normalizeDepths = useCallback(() => {
    setHeadingRows((items) => buildNormalizedHeadingRows(items))
  }, [buildNormalizedHeadingRows])

  return (
    <div>
      <PageHeader
        title={rerenderFileId ? "RAG 재등록" : "RAG 파일 등록"}
        sub="파일 업로드 → Pre-Parsing → heading_schema 확정 순서로 등록합니다."
        backHref="/rag"
      />

      <Card>
        <CardHead title="1. 파일 선택 및 Pre-Parsing" sub="문서와 기본 Heading Template 을 선택해 등록 초안을 제안받습니다." />
        <CardBody>
          <input ref={fileInputRef} type="file" accept={ACCEPT_ATTR} style={{ display: "none" }} onChange={onInputChange} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 280px 280px 160px", columnGap: 12, rowGap: 16, alignItems: "start" }}>
            <div
              onDrop={onDrop}
              onDragOver={(e) => {
                e.preventDefault()
                if (!dragging) setDragging(true)
              }}
              onDragLeave={(e) => {
                e.preventDefault()
                setDragging(false)
              }}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              style={{
                minHeight: 164,
                border: `2px dashed ${dragging ? "var(--accent, #3b82f6)" : "var(--line)"}`,
                borderRadius: 12,
                padding: "18px 20px",
                background: dragging ? "rgba(59,130,246,0.05)" : "var(--bg-subtle, #fafafa)",
                display: "flex",
                alignItems: "center",
                gap: 12,
                cursor: "pointer",
                gridRow: "1 / span 2",
              }}
            >
              <Upload size={22} />
              <div>
                <div style={{ fontWeight: 600 }}>{selectedFile?.name || "파일을 끌어놓거나 클릭해서 선택"}</div>
                <div className="muted" style={{ fontSize: 13 }}>{ACCEPTED_SUFFIXES.join(", ")} / 최대 30MB</div>
              </div>
            </div>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span>Main Heading Template</span>
              <select value={selectedTemplateId} onChange={(e) => setSelectedTemplateId(e.target.value)} style={inputStyle}>
                <option value="">선택없음</option>
                {bodyTemplates.map((template) => (
                  <option key={template.heading_id} value={template.heading_id}>
                    {template.heading_name}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span>Appendix Template</span>
              <select
                value={selectedAppendixTemplateId}
                onChange={(e) => setSelectedAppendixTemplateId(e.target.value)}
                style={inputStyle}
              >
                <option value="">선택없음</option>
                {appendixTemplates.map((template) => (
                  <option key={template.heading_id} value={template.heading_id}>
                    {template.heading_name}
                  </option>
                ))}
              </select>
            </label>
            <Btn variant="primary" onClick={() => void runPreparse()} disabled={preparsing || !selectedFile || !selectedTemplateId} icon={preparsing ? <Loader2 size={16} className="spin" /> : <DatabaseZap size={16} />}>
              {preparsing ? "분석 중..." : "Pre-Parsing"}
            </Btn>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span>Main Exit Criteria</span>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>상대방 특정 목차를 만났을 때</div>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span>Appendix 목차</span>
                <select
                  value={bodyExitTarget}
                  onChange={(e) => {
                    setBodyExitTarget(e.target.value)
                    setBodyExitTargetTouched(true)
                  }}
                  style={inputStyle}
                  disabled={!selectedAppendixTemplateId || bodyExitMode !== "matched_heading"}
                >
                  <option value="">{selectedAppendixTemplateId ? "선택없음" : "Appendix Template 먼저 선택"}</option>
                  {bodyExitTargetOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span>Appendix Exit Criteria</span>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>상대방 특정 목차를 만났을 때</div>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span>Main 목차</span>
                <select
                  value={appendixExitTarget}
                  onChange={(e) => {
                    setAppendixExitTarget(e.target.value)
                    setAppendixExitTargetTouched(true)
                  }}
                  style={inputStyle}
                  disabled={!selectedTemplateId || appendixExitMode !== "matched_heading"}
                >
                  <option value="">{selectedTemplateId ? "선택없음" : "Main Heading Template 먼저 선택"}</option>
                  {appendixExitTargetOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          {error && (
            <div className="alert alert-error" style={{ marginTop: 16, whiteSpace: "pre-line" }}>
              오류: {error}
            </div>
          )}
        </CardBody>
      </Card>

      {draftReady && (
        <>
          <Card>
            <CardHead
              title="2. RAG 파일 등록정보 검토"
              sub="제안된 메타정보를 수정/확정한 뒤 파일 메타정보를 등록합니다."
              action={<Btn onClick={() => router.push("/rag")}>목록으로</Btn>}
            />
            <CardBody>
              {isRerenderMode && (
                <div className="alert alert-notice" style={{ marginBottom: 16, lineHeight: 1.6 }}>
                  문서명 및 파일ID는 변경할 수 없습니다. 새로운 파일을 등록하시려면
                  {" "}
                  <strong>RAG관리 -&gt; RAG 파일 등록</strong>
                  {" "}
                  버튼을 누르세요.
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "3fr 1fr", gap: 16 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  파일명
                  <input value={fileName} readOnly style={{ ...inputStyle, background: "var(--bg-subtle, #fafafa)", color: "var(--muted)" }} />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  파일형식
                  <input value={formatType} onChange={(e) => setFormatType(e.target.value)} style={inputStyle} />
                </label>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "3fr 1fr", gap: 16, marginTop: 16 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  문서명
                  <input
                    value={docName}
                    onChange={(e) => setDocName(e.target.value)}
                    readOnly={isRerenderMode}
                    style={isRerenderMode ? { ...inputStyle, background: "var(--bg-subtle, #fafafa)", color: "var(--muted)" } : inputStyle}
                  />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  문서구분
                  <input value={docCat} onChange={(e) => setDocCat(e.target.value)} style={inputStyle} />
                </label>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "3fr 1fr", gap: 16, marginTop: 16 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  파일ID
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      value={fileId}
                      onChange={(e) => setFileId(e.target.value)}
                      readOnly={isRerenderMode}
                      style={isRerenderMode ? { ...inputStyle, width: "100%", background: "var(--bg-subtle, #fafafa)", color: "var(--muted)" } : { ...inputStyle, width: "100%" }}
                    />
                    {!isRerenderMode && (
                      <Btn
                        size="sm"
                        variant="outline"
                        onClick={() => setFileId(slugifyFileId(docName))}
                      >
                        문서명 반영
                      </Btn>
                    )}
                  </div>
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  문서버전
                  <input value={docVersion} onChange={(e) => setDocVersion(e.target.value)} style={inputStyle} />
                </label>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 16, marginTop: 16 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  공개일자
                  <input type="date" value={publicationDate} onChange={(e) => setPublicationDate(e.target.value)} style={inputStyle} />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  문서번호
                  <input value={docNumber} onChange={(e) => setDocNumber(e.target.value)} style={inputStyle} />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  담당기관/담당자
                  <input value={docManager} onChange={(e) => setDocManager(e.target.value)} style={inputStyle} />
                </label>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 16 }}>
                <span>목차 구조</span>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>
                  각 단계를 클릭하여 확인
                </div>
                <div className="table-wrap">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span>단계</span>
                            <Btn size="sm" variant="outline" onClick={normalizeDepths}>
                              단계 재정렬
                            </Btn>
                          </div>
                        </th>
                        <th>표기</th>
                        <th>규칙</th>
                        <th>출현횟수</th>
                        <th>처리방안</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedHeadingRows.map((row) => (
                        <tr
                          key={row.row_id}
                          style={
                            isInactiveRowAction(row.action)
                              ? {
                                  background: "var(--bg-subtle, #f3f4f6)",
                                  color: "var(--muted)",
                                }
                              : undefined
                          }
                        >
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <input
                                type="number"
                                min={1}
                                value={row.depth}
                                onChange={(e) =>
                                  setHeadingRows((items) =>
                                    items.map((item) =>
                                      item.row_id === row.row_id
                                        ? { ...item, depth: Math.max(1, Number(e.target.value || 1)) }
                                        : item,
                                    ),
                                  )
                                }
                                disabled={isInactiveRowAction(row.action)}
                                style={{
                                  ...inputStyle,
                                  height: 36,
                                  width: 90,
                                  background: isInactiveRowAction(row.action) ? "#f3f4f6" : "#fff",
                                  color: isInactiveRowAction(row.action) ? "var(--muted)" : "inherit",
                                }}
                              />
                              {isActiveRowAction(row.action) ? (
                                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                  <button
                                    type="button"
                                    aria-label="단계 올리기"
                                    onClick={() =>
                                      setHeadingRows((items) =>
                                        items.map((item) =>
                                          item.row_id === row.row_id
                                            ? { ...item, depth: Math.max(1, item.depth - 1) }
                                            : item,
                                        ),
                                      )
                                    }
                                    style={{
                                      width: 24,
                                      height: 16,
                                      borderRadius: 6,
                                      border: "1px solid var(--line)",
                                      background: "#fff",
                                      fontSize: 10,
                                      lineHeight: 1,
                                      cursor: "pointer",
                                    }}
                                  >
                                    ▲
                                  </button>
                                  <button
                                    type="button"
                                    aria-label="단계 내리기"
                                    onClick={() =>
                                      setHeadingRows((items) =>
                                        items.map((item) =>
                                          item.row_id === row.row_id
                                            ? { ...item, depth: item.depth + 1 }
                                            : item,
                                        ),
                                      )
                                    }
                                    style={{
                                      width: 24,
                                      height: 16,
                                      borderRadius: 6,
                                      border: "1px solid var(--line)",
                                      background: "#fff",
                                      fontSize: 10,
                                      lineHeight: 1,
                                      cursor: "pointer",
                                    }}
                                  >
                                    ▼
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          </td>
                          <td className="cell-mono">{row.display_notation || row.notation}</td>
                          <td className="cell-mono" style={{ fontSize: 12, color: "var(--muted)" }}>
                            {row.rule_id || (row.rule_type ? `custom:${row.rule_type}` : "custom")}
                          </td>
                          <td>
                            <button
                              type="button"
                              onClick={() => openSampleDialog(row)}
                              style={{
                                display: "block",
                                width: "100%",
                                textAlign: "left",
                                border: "none",
                                background: "transparent",
                                padding: 0,
                                cursor: "pointer",
                                color: "inherit",
                              }}
                            >
                              <div>{row.occurrence_count}</div>
                            </button>
                          </td>
                          <td>
                            <select
                              value={row.action}
                              onChange={(e) =>
                                setHeadingRows((items) =>
                                  items.map((item) =>
                                    item.row_id === row.row_id ? { ...item, action: e.target.value } : item,
                                  ),
                                )
                              }
                              style={{ ...inputStyle, height: 36, width: 120 }}
                            >
                              {(row.is_new ? ["신규", "무시"] : ["유지", "제외"]).map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {(selectedAppendixTemplateId || displayedAppendixHeadingRows.length > 0) && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 18 }}>
                  <span>Appendix 목차 구조</span>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>
                    appendix 는 신규 자동 추가 없이 유지/제외만 검토합니다.
                  </div>
                  <div className="table-wrap">
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th>단계</th>
                          <th>표기</th>
                          <th>규칙</th>
                          <th>출현횟수</th>
                          <th>처리방안</th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayedAppendixHeadingRows.length ? (
                          displayedAppendixHeadingRows.map((row) => (
                            <tr
                              key={row.row_id}
                              style={
                                isInactiveRowAction(row.action)
                                  ? {
                                      background: "var(--bg-subtle, #f3f4f6)",
                                      color: "var(--muted)",
                                    }
                                  : undefined
                              }
                            >
                              <td>
                                <input
                                  type="number"
                                  min={1}
                                  value={row.depth}
                                  onChange={(e) =>
                                    setAppendixHeadingRows((items) =>
                                      items.map((item) =>
                                        item.row_id === row.row_id
                                          ? { ...item, depth: Math.max(1, Number(e.target.value || 1)) }
                                          : item,
                                      ),
                                    )
                                  }
                                  disabled={isInactiveRowAction(row.action)}
                                  style={{
                                    ...inputStyle,
                                    height: 36,
                                    width: 90,
                                    background: isInactiveRowAction(row.action) ? "#f3f4f6" : "#fff",
                                    color: isInactiveRowAction(row.action) ? "var(--muted)" : "inherit",
                                  }}
                                />
                              </td>
                              <td className="cell-mono">{row.display_notation || row.notation}</td>
                              <td className="cell-mono" style={{ fontSize: 12, color: "var(--muted)" }}>
                                {row.rule_id || (row.rule_type ? `custom:${row.rule_type}` : "custom")}
                              </td>
                              <td>
                                <button
                                  type="button"
                                  onClick={() => openSampleDialog(row)}
                                  style={{
                                    display: "block",
                                    width: "100%",
                                    textAlign: "left",
                                    border: "none",
                                    background: "transparent",
                                    padding: 0,
                                    cursor: "pointer",
                                    color: "inherit",
                                  }}
                                >
                                  <div>{row.occurrence_count}</div>
                                </button>
                              </td>
                              <td>
                                <select
                                  value={row.action}
                                  onChange={(e) =>
                                    setAppendixHeadingRows((items) =>
                                      items.map((item) =>
                                        item.row_id === row.row_id ? { ...item, action: e.target.value } : item,
                                      ),
                                    )
                                  }
                                  style={{ ...inputStyle, height: 36, width: 120 }}
                                >
                                  {["유지", "제외"].map((option) => (
                                    <option key={option} value={option}>
                                      {option}
                                    </option>
                                  ))}
                                </select>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={5} className="muted">표시할 appendix 목차가 없습니다.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 16, marginTop: 16, alignItems: "end" }}>
                <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                    본문 변경 내역
                    <input
                      value={formatSchemaNoteDisplay(schemaNote)}
                      readOnly
                      style={{ ...inputStyle, background: "var(--bg-subtle, #fafafa)", color: "var(--muted)" }}
                    />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                    appendix 삭제 내역
                    <input
                      value={appendixSchemaNote}
                      readOnly
                      style={{ ...inputStyle, background: "var(--bg-subtle, #fafafa)", color: "var(--muted)" }}
                    />
                  </label>
                </div>
                <div style={{ display: "flex", alignItems: "flex-end", minHeight: 44 }}>
                  <Btn variant="primary" onClick={() => void onSave()} disabled={registering || !selectedFile} icon={registering ? <Loader2 size={16} className="spin" /> : <DatabaseZap size={16} />}>
                    {registering ? "등록 중..." : rerenderFileId ? "RAG 파일 변경 반영" : "RAG 파일 등록"}
                  </Btn>
                </div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHead title="3. 초기 파싱 미리보기" sub="초기 추출 블록 일부입니다. 등록 시에는 파일 메타정보와 목차 구조만 저장합니다." />
            <CardBody>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 320, overflowY: "auto" }}>
                {previewBlocks.map((block, idx) => (
                  <div key={idx} style={{ padding: "10px 14px", borderRadius: 8, background: "var(--bg-subtle, #fafafa)", border: "1px solid var(--line)" }}>
                    {block.title && <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 4 }}>{block.title}</div>}
                    <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6, fontSize: 13 }}>{block.text}</div>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        </>
      )}

      <Modal
        open={sampleDialogOpen}
        title={sampleDialogRow ? `${sampleDialogRow.display_notation || sampleDialogRow.notation} 대상 목록` : "대상 목록"}
        onClose={() => {
          setSampleDialogOpen(false)
          setSampleDialogRow(null)
          setSampleDialogMessage("")
        }}
        footer={(
          <Btn
            variant="outline"
            onClick={() => {
              setSampleDialogOpen(false)
              setSampleDialogRow(null)
              setSampleDialogMessage("")
            }}
          >
            닫기
          </Btn>
        )}
        width="760px"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="muted" style={{ fontSize: 12 }}>
            대상 목록은 최대 20개까지만 표시됩니다.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 480, overflowY: "auto" }}>
          {sampleDialogRow?.matched_samples?.length ? (
            sampleDialogRow.matched_samples.map((sample, idx) => (
              <div
                key={`${sample}-${idx}`}
                style={{
                  padding: "10px 14px",
                  borderRadius: 8,
                  background: "var(--bg-subtle, #fafafa)",
                  border: "1px solid var(--line)",
                  whiteSpace: "pre-wrap",
                  lineHeight: 1.6,
                }}
              >
                {sample}
              </div>
            ))
          ) : sampleDialogMessage ? (
            <div className="muted">{sampleDialogMessage}</div>
          ) : (
            <div className="muted">표시할 대상 목록이 없습니다.</div>
          )}
          </div>
        </div>
      </Modal>

      <Modal
        open={normalizeConfirmOpen}
        title="목차 단계를 재정렬하시겠습니까"
        onClose={() => setNormalizeConfirmOpen(false)}
        footer={(
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Btn
              variant="primary"
              onClick={() => {
                const normalized = buildNormalizedHeadingRows(headingRows)
                setHeadingRows(normalized)
                setNormalizeConfirmOpen(false)
                void performSave(normalized)
              }}
            >
              확인
            </Btn>
            <Btn variant="outline" onClick={() => setNormalizeConfirmOpen(false)}>
              취소
            </Btn>
          </div>
        )}
        width="480px"
      >
        <div className="muted">
          현재 목차 단계 번호가 연속적으로 정리되어 있지 않습니다. 단계 번호를 다시 정렬한 뒤 등록합니다.
        </div>
      </Modal>

      <style jsx>{`
        :global(.spin) {
          animation: spin 0.9s linear infinite;
        }
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  )
}
