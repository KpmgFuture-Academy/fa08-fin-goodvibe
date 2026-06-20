"use client"

import { useState } from "react"

import {
  compareLlmOutputs,
  selectLlmCompareResult,
  type LlmCompareResponse,
} from "@/lib/admin-api"

const LLM_TEST_MODE_ENABLED = process.env.NEXT_PUBLIC_LLM_TEST_MODE === "true"

export default function LlmComparePanel({
  menuKey,
  inputLabel = "비교 입력",
  inputText,
  context = "",
  maxChars = 120,
  currentOutputLabel,
  currentOutputText,
}: {
  menuKey: string
  inputLabel?: string
  inputText: string
  context?: string
  maxChars?: number
  currentOutputLabel?: string
  currentOutputText?: string
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [selectionError, setSelectionError] = useState("")
  const [selectingRequestId, setSelectingRequestId] = useState("")
  const [selectedRequestId, setSelectedRequestId] = useState("")
  const [data, setData] = useState<LlmCompareResponse | null>(null)

  if (!LLM_TEST_MODE_ENABLED || !inputText.trim()) {
    return null
  }

  async function handleRun() {
    setLoading(true)
    setError("")
    setSelectionError("")
    setSelectedRequestId("")
    try {
      const response = await compareLlmOutputs({
        menu_key: menuKey,
        input_text: inputText,
        context,
        output_format: "text",
        max_chars: maxChars,
      })
      setData(response)
    } catch (err) {
      setError(err instanceof Error ? err.message : "LLM 비교 실행 중 오류가 발생했어요.")
    } finally {
      setLoading(false)
    }
  }

  async function handleSelect(requestId: string) {
    if (!data?.compare_group_id) return
    setSelectingRequestId(requestId)
    setSelectionError("")
    try {
      await selectLlmCompareResult({
        compare_group_id: data.compare_group_id,
        request_id: requestId,
        selected: true,
        memo: "",
      })
      setSelectedRequestId(requestId)
    } catch (err) {
      setSelectionError(err instanceof Error ? err.message : "선택 저장 중 오류가 발생했어요.")
    } finally {
      setSelectingRequestId("")
    }
  }

  return (
    <section
      aria-label="LLM 비교 테스트"
      style={{
        marginTop: 16,
        padding: 16,
        borderRadius: 8,
        border: "1px solid var(--lvb-line-2)",
        background: "#fffdf8",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {currentOutputText?.trim() && (
          <>
            <div style={{ fontSize: 16, fontWeight: 800, color: "var(--lvb-ink)" }}>
              {currentOutputLabel || "현재 화면 메시지"}
            </div>
            <PanelTextBox>{currentOutputText}</PanelTextBox>
          </>
        )}
        <div style={{ fontSize: 16, fontWeight: 800, color: "var(--lvb-ink)" }}>
          {inputLabel}
        </div>
        <PanelTextBox>{inputText}</PanelTextBox>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
        <button
          type="button"
          className="lvb-btn lvb-btn-outline lvb-btn-lg"
          onClick={handleRun}
          disabled={loading}
        >
          <span>{loading ? "비교 중..." : "LLM 3개 모델 비교 실행"}</span>
        </button>
        {data?.compare_group_id && (
          <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--lvb-muted)" }}>
            {data.compare_group_id}
          </span>
        )}
      </div>

      {error && (
        <div className="alert alert-error" style={{ margin: 0 }}>
          오류: {error}
        </div>
      )}

      {selectionError && (
        <div className="alert alert-error" style={{ margin: 0 }}>
          선택 저장 오류: {selectionError}
        </div>
      )}

      {data && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 12,
          }}
        >
          {data.results.map((result) => {
            const isSelected = selectedRequestId === result.request_id
            const isSelecting = selectingRequestId === result.request_id
            return (
              <article
                key={result.request_id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  padding: 14,
                  borderRadius: 8,
                  background: isSelected ? "var(--lvb-accent-soft)" : "#fff",
                  border: isSelected
                    ? "2px solid var(--lvb-accent)"
                    : "1px solid var(--lvb-line)",
                  minHeight: 320,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 900, color: "var(--lvb-muted)" }}>
                      모델명
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: "var(--lvb-ink)" }}>
                      {result.selected_model}
                    </div>
                  </div>
                  {isSelected && (
                    <span style={{ fontSize: 12.5, fontWeight: 900, color: "var(--lvb-accent)" }}>
                      선택됨
                    </span>
                  )}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                  <Field label="used_model" value={result.used_model || "-"} />
                  <Field label="output_text" value={result.output_text || "-"} multiline />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <Field label="latency_ms" value={`${result.latency_ms}`} />
                    <Field label="total_tokens" value={`${result.total_tokens}`} />
                    <Field label="prompt_tokens" value={`${result.prompt_tokens}`} />
                    <Field label="completion_tokens" value={`${result.completion_tokens}`} />
                  </div>
                  <Field label="request_id" value={result.request_id || "-"} />
                  <Field label="error" value={result.error || "-"} multiline />
                </div>

                <button
                  type="button"
                  className="lvb-btn lvb-btn-primary lvb-btn-md"
                  onClick={() => handleSelect(result.request_id)}
                  disabled={isSelecting}
                  style={{ marginTop: "auto", opacity: isSelecting ? 0.7 : 1 }}
                >
                  <span>{isSelecting ? "선택 저장 중..." : "이 결과 선택"}</span>
                </button>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

function Field({
  label,
  value,
  multiline = false,
}: {
  label: string
  value: string
  multiline?: boolean
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontSize: 12.5, fontWeight: 900, color: "var(--lvb-muted)" }}>
        {label}
      </div>
      <div
        style={{
          fontSize: multiline ? 14.5 : 14,
          lineHeight: multiline ? 1.6 : 1.45,
          color: "var(--lvb-ink-soft)",
          wordBreak: "break-word",
          whiteSpace: multiline ? "pre-wrap" : "normal",
        }}
      >
        {value}
      </div>
    </div>
  )
}

function PanelTextBox({ children }: { children: string }) {
  return (
    <div
      style={{
        padding: "12px 14px",
        borderRadius: 8,
        background: "#fff",
        border: "1px solid var(--lvb-line)",
        fontSize: 15.5,
        lineHeight: 1.65,
        color: "var(--lvb-ink-soft)",
        wordBreak: "keep-all",
        whiteSpace: "pre-wrap",
      }}
    >
      {children}
    </div>
  )
}
