"use client"

import { useEffect, useMemo, useState } from "react"

import {
  askHelp,
  getAdminWeeklyFarmInfo,
  getAiRecommendation,
  getLaggardFarmers,
  type AiRecommendation,
  type AskHelpResponse,
  type LaggardFarmerItem,
} from "@/lib/admin-api"
import type { AdminWeeklyFarmInfo } from "@/lib/admin-types"
import {
  buildDashboardAlertCompareInput,
  buildHelpChatCompareInput,
  buildTodayAdviceCompareInput,
  buildWeeklyFarmInfoCompareInput,
  type LlmCompareInput,
} from "@/lib/llm-compare-inputs"
import LlmComparePanel from "@/components/dashboard/LlmComparePanel"

const LLM_TEST_MODE_ENABLED = process.env.NEXT_PUBLIC_LLM_TEST_MODE === "true"

export default function LlmTestPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [laggards, setLaggards] = useState<LaggardFarmerItem[]>([])
  const [recommendation, setRecommendation] = useState<AiRecommendation | null>(null)
  const [weeklyInfo, setWeeklyInfo] = useState<AdminWeeklyFarmInfo | null>(null)
  const [helpAnswer, setHelpAnswer] = useState<AskHelpResponse | null>(null)

  useEffect(() => {
    if (!LLM_TEST_MODE_ENABLED) return
    let mounted = true

    async function load() {
      setLoading(true)
      setError("")
      try {
        const [laggardsData, recommendationData, weeklyInfoData, helpAnswerData] =
          await Promise.all([
            getLaggardFarmers(7, 3).catch(() => []),
            getAiRecommendation().catch(() => null),
            getAdminWeeklyFarmInfo().catch(() => null),
            askHelp("논물관리 중간 물떼기 사진은 언제까지 올려야 하나요?").catch(() => null),
          ])

        if (!mounted) return
        setLaggards(laggardsData)
        setRecommendation(recommendationData)
        setWeeklyInfo(weeklyInfoData)
        setHelpAnswer(helpAnswerData)
      } catch (err) {
        if (!mounted) return
        setError(err instanceof Error ? err.message : "LLM 테스트 데이터를 불러오지 못했어요.")
      } finally {
        if (mounted) setLoading(false)
      }
    }

    void load()
    return () => {
      mounted = false
    }
  }, [])

  const sections = useMemo<LlmCompareInput[]>(
    () => [
      buildDashboardAlertCompareInput(laggards),
      buildTodayAdviceCompareInput(recommendation),
      buildWeeklyFarmInfoCompareInput(weeklyInfo),
      buildHelpChatCompareInput(helpAnswer),
    ],
    [laggards, recommendation, weeklyInfo, helpAnswer],
  )

  if (!LLM_TEST_MODE_ENABLED) {
    return (
      <div style={{ padding: 24 }}>
        <div className="alert alert-notice">
          LLM 테스트 모드는 꺼져 있습니다. <code>NEXT_PUBLIC_LLM_TEST_MODE=true</code> 로 켠 뒤 다시 열어주세요.
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, paddingBottom: 32 }}>
      <section
        style={{
          padding: 24,
          borderRadius: 8,
          background: "#fcfaf3",
          border: "1px solid var(--lvb-line)",
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 900, color: "var(--lvb-warn-ink)", marginBottom: 8 }}>
          테스트 모드
        </div>
        <h1 style={{ margin: 0, fontSize: 32, lineHeight: 1.2, color: "var(--lvb-ink)" }}>
          메뉴별 LLM 비교 테스트
        </h1>
        <p style={{ margin: "10px 0 0", fontSize: 16, lineHeight: 1.6, color: "var(--lvb-ink-soft)" }}>
          도움말, 오늘의 한마디, 주간 농사정보, 대시보드 알림에 대해 세 모델의 출력과 토큰 사용량을 비교합니다.
        </p>
      </section>

      {loading && (
        <div className="alert alert-notice">
          메뉴별 테스트 입력을 불러오는 중입니다...
        </div>
      )}

      {error && (
        <div className="alert alert-error">
          오류: {error}
        </div>
      )}

      {sections.map((section) => (
        <section
          key={section.menuKey}
          style={{
            padding: 20,
            borderRadius: 8,
            background: "#fff",
            border: "1px solid var(--lvb-line)",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 24, fontWeight: 900, color: "var(--lvb-ink)" }}>
              {section.title}
            </div>
            <div style={{ fontSize: 15, lineHeight: 1.6, color: "var(--lvb-ink-soft)" }}>
              {section.description}
            </div>
          </div>
          <LlmComparePanel
            menuKey={section.menuKey}
            inputLabel={section.inputLabel}
            inputText={section.inputText}
            context={section.context}
            maxChars={section.maxChars}
            currentOutputLabel={section.currentOutputLabel}
            currentOutputText={section.currentOutputText}
          />
        </section>
      ))}
    </div>
  )
}
