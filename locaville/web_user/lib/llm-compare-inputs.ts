import type {
  AiRecommendation,
  AskHelpResponse,
  LaggardFarmerItem,
} from "@/lib/admin-api"
import type { AdminWeeklyFarmInfo } from "@/lib/admin-types"

export type LlmCompareInput = {
  menuKey: "dashboard_alert" | "today_advice" | "weekly_farm_info" | "help_chat"
  title: string
  description: string
  inputLabel: string
  inputText: string
  context: string
  maxChars: number
  currentOutputLabel?: string
  currentOutputText?: string
}

export function buildDashboardAlertCompareInput(
  laggards: LaggardFarmerItem[],
): LlmCompareInput {
  const top = laggards[0]
  const firstTodo = top?.sample_todos?.[0]?.todo_title?.trim() || "중간 물떼기"
  const farmerName = top?.farmer_name || "박영수"
  const inputText = top
    ? `${farmerName} 농가의 ${firstTodo} 관련 사진이 미첨부 상태입니다.`
    : "박영수 농가의 중간 물떼기 종료 사진이 미첨부 상태입니다."
  const context = top
    ? `미이행 건수 ${top.unfulfilled_count}건, 첫 작업명: ${firstTodo}`
    : "대시보드 알림 카드 테스트"
  return {
    menuKey: "dashboard_alert",
    title: "대시보드 알림",
    description: "누락 알림 문구를 비교합니다.",
    inputLabel: "원본 알림 문구",
    inputText,
    context,
    maxChars: 120,
    currentOutputLabel: "현재 카드 문구",
    currentOutputText: inputText,
  }
}

export function buildTodayAdviceCompareInput(
  recommendation: AiRecommendation | null,
): LlmCompareInput {
  const inputText =
    recommendation?.recommendation?.trim() ||
    "오늘은 마을 농가 기록 상태를 한 번 살펴봐 주세요."
  const rainDays = recommendation?.context?.rain_days?.join(", ") || "없음"
  const todoCount = Array.isArray(recommendation?.context?.upcoming_todos)
    ? recommendation.context.upcoming_todos.length
    : 0
  return {
    menuKey: "today_advice",
    title: "오늘의 한마디",
    description: "운영 메모의 톤과 압축 정도를 비교합니다.",
    inputLabel: "비교용 초안 문구",
    inputText,
    context: `예보 비요일: ${rainDays}; 예정 작업 수: ${todoCount}`,
    maxChars: 120,
    currentOutputLabel: "현재 화면 메시지",
    currentOutputText: inputText,
  }
}

export function buildWeeklyFarmInfoCompareInput(
  info: AdminWeeklyFarmInfo | null,
): LlmCompareInput {
  const lines = (info?.items || [])
    .slice(0, 3)
    .flatMap((item) => [item.summary, ...item.lines.slice(0, 2)])
    .filter(Boolean)
  const inputText =
    lines.join(" ") ||
    "이번 주는 비가 적고 기온 변동이 큽니다. 논물관리와 병해충 예찰을 꾸준히 해주세요."
  const villageName = info?.village?.name || "저탄서호마을"
  const period = info?.period || "이번 주"
  const crops = info?.matchedCrops?.join(", ") || "벼"
  return {
    menuKey: "weekly_farm_info",
    title: "주간 농사정보",
    description: "주간 농사정보 요약 결과를 비교합니다.",
    inputLabel: "비교용 원문 요약",
    inputText,
    context: `마을: ${villageName}; 기간: ${period}; 작목: ${crops}`,
    maxChars: 220,
    currentOutputLabel: "현재 화면 메시지",
    currentOutputText: inputText,
  }
}

export function buildHelpChatCompareInput(
  answer: AskHelpResponse | null,
): LlmCompareInput {
  const question = "논물관리 중간 물떼기 사진은 언제까지 올려야 하나요?"
  const context = answer?.answer?.trim()
    ? `현재 기본 답변: ${answer.answer}`
    : "현재 기본 답변을 불러오지 못하면 질문 자체만 기준으로 답변을 비교합니다."
  return {
    menuKey: "help_chat",
    title: "도움말",
    description: "도움말 질문 답변을 비교합니다.",
    inputLabel: "도움말 질문",
    inputText: question,
    context,
    maxChars: 240,
    currentOutputLabel: "현재 기본 답변",
    currentOutputText:
      answer?.answer?.trim() ||
      "아직 기본 답변을 불러오지 못했습니다. 비교 실행으로 모델별 답변을 확인해 주세요.",
  }
}
