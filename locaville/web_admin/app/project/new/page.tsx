"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { DatabaseZap } from "lucide-react"

import { Btn } from "@/components/ui/Btn"
import { Card, CardBody, CardHead } from "@/components/ui/Card"
import { PageHeader } from "@/components/ui/PageHeader"
import {
  createProject,
  getProjectBaseBusinesses,
  PROJECT_ADMIN_CONNECTION_ERROR_MESSAGE,
  suggestProjectBasicFromRag,
} from "@/lib/project-api"
import type { ProjectBaseBusinessItem } from "@/lib/project-types"
import { getRagFiles, RAG_ADMIN_CONNECTION_ERROR_MESSAGE } from "@/lib/rag-api"
import type { RagFileItem } from "@/lib/rag-types"

const fieldInputStyle = {
  height: 44,
  borderRadius: 10,
  border: "1px solid var(--line)",
  background: "#fff",
  padding: "0 14px",
  font: "inherit",
  fontSize: 17,
} as const

const labelStyle = {
  display: "flex",
  flexDirection: "column" as const,
  gap: 6,
  fontSize: 13,
  color: "var(--muted)",
} as const

const readonlyStyle = {
  ...fieldInputStyle,
  background: "var(--bg-subtle, #fafafa)",
  color: "var(--muted)",
} as const

const DEFAULT_EXEC_YEAR = String(new Date().getFullYear())

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

export default function ProjectNewPage() {
  const router = useRouter()

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [loadingBaseBusinesses, setLoadingBaseBusinesses] = useState(false)
  const [baseBusinesses, setBaseBusinesses] = useState<ProjectBaseBusinessItem[]>([])
  const [selectedBizId, setSelectedBizId] = useState("")
  const [loadingRagFiles, setLoadingRagFiles] = useState(false)
  const [ragFiles, setRagFiles] = useState<RagFileItem[]>([])
  const [selectedRagFileId, setSelectedRagFileId] = useState("")
  const [suggestingFromRag, setSuggestingFromRag] = useState(false)

  // project 테이블 기준 입력
  const [prjName, setPrjName] = useState("")
  const [projectId, setProjectId] = useState("")
  const [autoGenerateProjectId, setAutoGenerateProjectId] = useState(true)
  const [execYear, setExecYear] = useState(DEFAULT_EXEC_YEAR)
  const [postDate, setPostDate] = useState("")
  const [issuer, setIssuer] = useState("")

  const selectedBaseBusiness = useMemo(
    () => baseBusinesses.find((item) => item.biz_id === selectedBizId) || null,
    [baseBusinesses, selectedBizId],
  )
  const effectiveBizName = useMemo(
    () => selectedBaseBusiness?.biz_name?.trim() || prjName.trim(),
    [prjName, selectedBaseBusiness],
  )
  const selectedRagFile = useMemo(
    () => ragFiles.find((item) => item.file_id === selectedRagFileId) || null,
    [ragFiles, selectedRagFileId],
  )

  const resetForm = useCallback(() => {
    setError("")
    setSelectedBizId("")
    setSelectedRagFileId("")
    setPrjName("")
    setProjectId("")
    setAutoGenerateProjectId(true)
    setExecYear(DEFAULT_EXEC_YEAR)
    setPostDate("")
    setIssuer("")
  }, [])

  useEffect(() => {
    let active = true
    setLoadingBaseBusinesses(true)
    getProjectBaseBusinesses()
      .then((response) => {
        if (!active) return
        setBaseBusinesses(response.items || [])
      })
      .catch((e) => {
        if (!active) return
        setError(e instanceof Error ? e.message : PROJECT_ADMIN_CONNECTION_ERROR_MESSAGE)
      })
      .finally(() => {
        if (!active) return
        setLoadingBaseBusinesses(false)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!autoGenerateProjectId) {
      return
    }

    let active = true
    buildProjectHashId(prjName, issuer, execYear)
      .then((nextId) => {
        if (!active) return
        setProjectId(nextId)
      })
      .catch(() => {
        if (!active) return
        setProjectId("")
      })

    return () => {
      active = false
    }
  }, [autoGenerateProjectId, execYear, issuer, prjName])

  useEffect(() => {
    let active = true
    setLoadingRagFiles(true)
    getRagFiles()
      .then((response) => {
        if (!active) return
        setRagFiles(response.items || [])
      })
      .catch((e) => {
        if (!active) return
        setError(e instanceof Error ? e.message : RAG_ADMIN_CONNECTION_ERROR_MESSAGE)
      })
      .finally(() => {
        if (!active) return
        setLoadingRagFiles(false)
      })
    return () => {
      active = false
    }
  }, [])

  const onSave = useCallback(async () => {
    setError("")

    const trimmedPrjName = prjName.trim()
    if (!trimmedPrjName) {
      setError("프로젝트명(prj_name)을 입력해 주세요.")
      return
    }
    if (!selectedBizId) {
      setError("기반 사업을 먼저 선택해 주세요.")
      return
    }

    const finalProjectId = autoGenerateProjectId
      ? await buildProjectHashId(trimmedPrjName, issuer, execYear)
      : projectId.trim()
    if (autoGenerateProjectId) {
      setProjectId(finalProjectId)
    }

    let execYearValue: number | null = null
    if (execYear.trim()) {
      const parsed = Number(execYear)
      if (!Number.isFinite(parsed) || parsed < 2000 || parsed > 2100) {
        setError("시행연도(exec_year)는 2000~2100 범위의 숫자로 입력해 주세요.")
        return
      }
      execYearValue = parsed
    }

    setSaving(true)
    try {
      const response = await createProject({
        prj_name: trimmedPrjName,
        project_id: finalProjectId || null,
        auto_generate_project_id: autoGenerateProjectId,
        rag_file_id: selectedRagFileId || null,
        biz_id: selectedBizId || null,
        exec_year: execYearValue,
        start_date: postDate || null,
        host_org: issuer.trim() || null,
        ...(effectiveBizName ? { biz_name: effectiveBizName } : {}),
      })

      router.push(`/project/${encodeURIComponent(response.prj_id)}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : PROJECT_ADMIN_CONNECTION_ERROR_MESSAGE)
    } finally {
      setSaving(false)
    }
  }, [autoGenerateProjectId, effectiveBizName, execYear, issuer, postDate, prjName, projectId, router, selectedBizId])

  const onSuggestFromRag = useCallback(async () => {
    if (!selectedRagFileId) {
      setError("관련 문서를 먼저 선택해 주세요.")
      return
    }

    setError("")
    setSuggestingFromRag(true)
    try {
      const response = await suggestProjectBasicFromRag({ rag_file_id: selectedRagFileId })
      const suggested = response.suggested || {}
      setPrjName((suggested.prj_name || "").trim())
      setIssuer((suggested.issuer || "").trim())
      setExecYear(
        suggested.exec_year !== null && suggested.exec_year !== undefined
          ? String(suggested.exec_year)
          : "",
      )
      setPostDate((suggested.post_date || "").trim())
    } catch (e) {
      setError(e instanceof Error ? e.message : PROJECT_ADMIN_CONNECTION_ERROR_MESSAGE)
    } finally {
      setSuggestingFromRag(false)
    }
  }, [selectedRagFileId])

  return (
    <div>
      <PageHeader
        title="프로젝트 등록"
        sub="project 테이블 컬럼 중심으로 직접 입력하는 신규 등록 화면입니다."
        backHref="/project"
        actions={
          <Btn onClick={resetForm} disabled={saving}>
            초기화
          </Btn>
        }
      />

      <Card>
        <CardHead
          title="1. 기반 사업 및 관련 문서 선택"
          sub="개별 프로젝트의 기반이 되는 정부시책 사업 및 공고문 등 관련 문서를 선택합니다."
        />
        <CardBody>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <label
              style={{
                ...labelStyle,
                minWidth: 120,
                fontSize: 16,
                color: "var(--text)",
                fontWeight: 600,
              }}
            >
              사업선택
            </label>
            <div style={{ flex: "1 1 640px", minWidth: 420 }}>
                  <select
                    value={selectedBizId}
                    onChange={(e) => setSelectedBizId(e.target.value)}
                    style={{ ...fieldInputStyle, height: 44, fontSize: 19, width: "100%" }}
                    disabled={loadingBaseBusinesses}
                  >
                <option value="">기반 사업을 선택해 주세요</option>
                {baseBusinesses.map((item) => (
                  <option key={item.biz_id} value={item.biz_id}>
                    {item.biz_name}
                  </option>
                ))}
              </select>
            </div>
            <div
              style={{
                minWidth: 120,
                height: 44,
                display: "flex",
                alignItems: "center",
                padding: "0 12px",
                borderRadius: 10,
                border: "1px solid var(--line)",
                background: "var(--bg-subtle, #fafafa)",
                color: "var(--muted)",
                fontSize: 16,
                fontFamily: "\"Fira Code\", \"JetBrains Mono\", Consolas, monospace",
                fontWeight: 600,
                letterSpacing: "0.02em",
              }}
            >
              {selectedBizId || "—"}
            </div>
          </div>

          <div
            style={{
              marginTop: 16,
              display: "flex",
              alignItems: "flex-start",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                minWidth: 120,
                fontSize: 16,
                color: "var(--text)",
                fontWeight: 600,
                lineHeight: "44px",
              }}
            >
              사업개요
            </div>
            <div
              style={{
                flex: "1 1 640px",
                minWidth: 420,
                borderRadius: 10,
                border: "1px solid var(--line)",
                background: "var(--bg-subtle, #fafafa)",
                padding: "12px 14px",
                fontSize: 14,
                lineHeight: 1.7,
                color: "var(--muted)",
                whiteSpace: "pre-wrap",
              }}
            >
              {selectedBaseBusiness?.biz_overview}
            </div>
          </div>

          <div
            style={{
              marginTop: 16,
              display: "flex",
              alignItems: "flex-start",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <div style={{ flex: "1 1 640px", minWidth: 420 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  flexWrap: "wrap",
                }}
              >
                <label
                  style={{
                    ...labelStyle,
                    minWidth: 120,
                    fontSize: 16,
                    color: "var(--text)",
                    fontWeight: 600,
                  }}
                >
                  파일선택
                </label>
                <div style={{ flex: "1 1 420px", minWidth: 280 }}>
                  <select
                    value={selectedRagFileId}
                    onChange={(e) => setSelectedRagFileId(e.target.value)}
                    style={{ ...fieldInputStyle, height: 44, fontSize: 19, width: "100%" }}
                    disabled={loadingRagFiles}
                  >
                    <option value="">관련 문서를 선택해 주세요</option>
                    {ragFiles.map((item) => (
                      <option key={item.file_id} value={item.file_id}>
                        {item.doc_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div
                style={{
                  marginTop: 12,
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 16,
                  flexWrap: "wrap",
                }}
              >
                <div
                  style={{
                    minWidth: 120,
                    fontSize: 16,
                    color: "var(--text)",
                    fontWeight: 600,
                    lineHeight: "44px",
                  }}
                >
                  파일명
                </div>
                <div
                  style={{
                    flex: "1 1 420px",
                    minWidth: 280,
                    minHeight: 44,
                    display: "flex",
                    alignItems: "center",
                    borderRadius: 10,
                    border: "1px solid var(--line)",
                    background: "var(--bg-subtle, #fafafa)",
                    padding: "0 14px",
                    fontSize: 14,
                    color: selectedRagFile?.file_name ? "var(--text)" : "var(--muted)",
                  }}
                >
                  {selectedRagFile?.file_name || "선택된 파일이 없습니다."}
                </div>
              </div>
            </div>
            <div
              style={{
                flex: "0 0 320px",
                minWidth: 280,
                display: "flex",
                flexDirection: "column",
                gap: 12,
                borderRadius: 10,
                border: "1px solid var(--line)",
                background: "#f7fbf6",
                padding: "16px 18px",
                fontSize: 14,
                lineHeight: 1.6,
                color: "#2f5d34",
              }}
            >
              <div style={{ fontWeight: 700 }}>RAG Vector로 등록된 파일만 가능합니다.</div>
              <Link href="/rag" className="btn btn-outline btn-sm" style={{ alignSelf: "flex-start" }}>
                RAG 파일목록 확인 및 등록
              </Link>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHead
          title="2. 프로젝트 정보 입력"
          action={
            <Btn
              variant="primary"
              className="project-rag-fill-btn"
              onClick={() => void onSuggestFromRag()}
              disabled={!selectedRagFileId || suggestingFromRag}
            >
              <span className="btn-icon">
                <DatabaseZap size={16} />
              </span>
              <span>{suggestingFromRag ? "RAG 검색 중..." : "RAG 파일로부터 프로젝트 등록"}</span>
            </Btn>
          }
        />
        <CardBody>
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "minmax(260px, 1.8fr) minmax(130px, 0.45fr) minmax(220px, 0.8fr) minmax(220px, 0.8fr)",
              gap: 16,
              alignItems: "end",
            }}
          >
            <label style={{ ...labelStyle, gridColumn: "1 / span 3" }}>
              프로젝트명
              <input
                value={prjName}
                onChange={(e) => setPrjName(e.target.value)}
                style={fieldInputStyle}
                placeholder="프로젝트명"
              />
            </label>

            <label style={labelStyle}>
              발주기관
              <input
                value={issuer}
                onChange={(e) => setIssuer(e.target.value)}
                style={fieldInputStyle}
                placeholder="발주기관"
              />
            </label>

            <div style={labelStyle}>
              <span>프로젝트ID</span>
              <input
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                readOnly={autoGenerateProjectId}
                disabled={autoGenerateProjectId}
                style={autoGenerateProjectId ? readonlyStyle : fieldInputStyle}
                placeholder={autoGenerateProjectId ? "프로젝트명 입력 시 자동 생성" : "프로젝트ID"}
              />
            </div>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
                color: "var(--muted)",
                minHeight: 44,
                paddingTop: 28,
                whiteSpace: "nowrap",
              }}
            >
              <input
                type="checkbox"
                checked={autoGenerateProjectId}
                onChange={(e) => setAutoGenerateProjectId(e.target.checked)}
              />
              자동생성
            </label>

            <label style={labelStyle}>
              시행년도
              <input
                type="number"
                value={execYear}
                onChange={(e) => setExecYear(e.target.value)}
                style={fieldInputStyle}
                placeholder="2026"
              />
            </label>

            <label style={labelStyle}>
              공고일자
              <input
                type="date"
                value={postDate}
                onChange={(e) => setPostDate(e.target.value)}
                style={fieldInputStyle}
              />
            </label>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHead title="저장" />
        <CardBody>
          {error && (
            <div className="alert alert-error" style={{ marginBottom: 16, whiteSpace: "pre-line" }}>
              오류: {error}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Btn onClick={resetForm} disabled={saving}>
              초기화
            </Btn>
            <Btn
              variant="primary"
              onClick={() => void onSave()}
              disabled={saving || !prjName.trim() || !selectedBizId}
            >
              {saving ? "저장 중..." : "프로젝트 등록"}
            </Btn>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
