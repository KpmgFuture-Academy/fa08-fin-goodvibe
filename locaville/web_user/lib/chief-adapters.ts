/**
 * nextjs_chief 프로토타입의 새 컴포넌트 props ↔ 기존 admin-api 응답 어댑터.
 *
 * 새 컴포넌트(`components/chief/*`) 는 `InboxItem`, `Farmer`, `VillagePulseData` 같은
 * 고유 타입을 받는다. 기존 admin-api 응답을 이 어댑터로 변환해 주입한다.
 */
import type {
  Farmer,
  InboxItem,
  Urgency,
} from "@/components/chief/chief-ui"
import type { VillagePulseData } from "@/components/chief/VillagePulse"
import type {
  FarmHelperPair,
  LaggardFarmerItem,
  RecentEvidenceItem,
} from "@/lib/admin-api"
import type { FarmerDiarySummary } from "@/lib/admin-types"

// ----------------------------------------------------------------------------
// 1) 농가 (Farmer) — diaries_by_farmer 한 줄을 새 Farmer 로 변환
// ----------------------------------------------------------------------------

/** 일지·증빙 진행률로 농가 상태를 추정 — HANDOFF.md 의 어휘 규칙.
 *
 * 시연 데이터 분포에 맞게 기준 완화 — 마감 지연이 핵심 신호:
 *   - 지연 0건 + 진행률 0.5↑ → 정상 (good)
 *   - 지연 1-2건 또는 진행률 0.3↑ → 지켜보는 중 (mid)
 *   - 그 외 → 확인 필요 (behind)
 */
function inferState(s: FarmerDiarySummary): Farmer["state"] {
  const rate = s.todo_completion_rate ?? null
  const delayed = s.delayed_todo_count ?? 0
  if (delayed === 0 && rate != null && rate >= 0.5) return "good"
  if (delayed <= 2 || (rate != null && rate >= 0.3)) return "mid"
  return "behind"
}

export function summaryToFarmer(s: FarmerDiarySummary): Farmer {
  const fullAddress = [s.address, s.address_detail].filter((x) => x && x.trim()).join(" ")
  return {
    id: s.farmer_id,
    name: s.amo_name || s.user_name || s.farmer_name || s.farmer_id,
    phone: s.phone || "",
    state: inferState(s),
    tone: "",
    parcels: [],
    address: fullAddress,
    note: s.delayed_todo_count
      ? `${s.delayed_todo_count}건 지연`
      : s.diary_count
        ? `최근 일지 ${s.diary_count}건`
        : "기록을 함께 남겨요",
  }
}

// ----------------------------------------------------------------------------
// 2) 처리함 항목 (InboxItem) — 3 종 소스를 합쳐 한 큐
// ----------------------------------------------------------------------------

function daysToUrgency(daysLeft: number | null | undefined): Urgency {
  if (daysLeft == null) return "soon"
  if (daysLeft < 0) return "over"
  if (daysLeft === 0) return "today"
  if (daysLeft <= 7) return "week"
  return "soon"
}

function dueText(daysLeft: number | null | undefined): string | null {
  if (daysLeft == null) return null
  if (daysLeft < 0) return `${Math.abs(daysLeft)}일 지남`
  if (daysLeft === 0) return "오늘 마감"
  return `D-${daysLeft}`
}

/** 가장 임박한 마감일까지 남은 일수 — sample_todos 의 due_date 중 가장 빠른 것. */
function nearestDaysLeft(sampleTodos: LaggardFarmerItem["sample_todos"]): number | null {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const list = sampleTodos
    .map((t) => (t.due_date ? new Date(t.due_date) : null))
    .filter((d): d is Date => d != null && !Number.isNaN(d.getTime()))
  if (list.length === 0) return null
  const earliest = list.reduce((a, b) => (a < b ? a : b))
  earliest.setHours(0, 0, 0, 0)
  return Math.round((earliest.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

/** 사진 확인 (review) — RecentEvidenceItem 한 줄.
 *
 * 자연어 제목 우선순위: activity_name > job_name > "사진".
 * projTag 는 biz_name (없으면 prj_name) 으로 채워 카드 상단에 사업 칩 표시.
 */
export function evidenceToInbox(
  e: RecentEvidenceItem,
  resolveImg: (path: string) => string,
): InboxItem {
  const farmer: Farmer = {
    id: e.farmer_id,
    name: e.farmer_name || e.farmer_id,
    phone: "",
    state: "good",
    tone: "",
    parcels: [],
  }
  const label =
    e.activity_name?.trim() ||
    e.job_name?.trim() ||
    e.job_cd ||
    "사진"
  const bizTag = (e.biz_name || e.prj_name || "").trim()
  return {
    id: `review:${e.evidence_id}`,
    kind: "review",
    urgency: "today",
    farmer,
    projTag: bizTag ? { label: bizTag, tone: "neutral" } : null,
    title: `${label} 사진을 확인해 주세요`,
    sub: e.captured_at ? `방금 올라온 사진 · 확인하면 처리 완료` : undefined,
    dueText: null,
    evidence: {
      id: e.evidence_id,
      // RecentEvidenceItem 에는 품질 정보가 없어 기본 ok 로 둔다. 흐릿 판정은
      // 별도 status=needs_review API 로 보강하거나 화면에서 사용자가 직접 판단.
      quality: "ok",
      label,
      when: e.captured_at || "",
      img: e.image_path ? resolveImg(e.image_path) : "",
      // 촬영 후 AI To-do 일치 판정 — 확신 낮으면 "AI 확신 낮음" 뱃지.
      needsChiefVerification: e.needs_chief_verification ?? false,
      matchReason: e.todo_match_reason || undefined,
      receiptOcr: e.receipt_ocr || undefined,
    },
  }
}

/** 알려줄 일 (nudge) — laggard 농가 한 줄. */
export function laggardToInbox(l: LaggardFarmerItem): InboxItem {
  const daysLeft = nearestDaysLeft(l.sample_todos)
  const firstTitle = l.sample_todos[0]?.todo_title?.trim() || ""
  const headline = firstTitle
    ? `${firstTitle} 증빙이 아직 없어요`
    : `${l.unfulfilled_count}건 기록을 부탁드려요`
  const subParts: string[] = []
  if (daysLeft != null) {
    if (daysLeft < 0) subParts.push(`마감이 ${Math.abs(daysLeft)}일 지났습니다`)
    else if (daysLeft === 0) subParts.push("오늘이 마감입니다")
    else subParts.push(`마감 ${daysLeft}일 남음`)
  }
  subParts.push(`미제출 ${l.unfulfilled_count}건`)
  const farmer: Farmer = {
    id: l.farmer_id,
    name: l.farmer_name || l.farmer_id,
    phone: "",
    state: daysLeft != null && daysLeft < 0 ? "behind" : "mid",
    tone: "",
    parcels: [],
  }
  return {
    id: `nudge:${l.farmer_id}`,
    kind: "nudge",
    urgency: daysToUrgency(daysLeft),
    farmer,
    projTag: null,
    title: headline,
    sub: subParts.join(" · "),
    dueText: dueText(daysLeft),
    evidence: null,
  }
}

/** 도움 연결 (helper) — pending 관계 한 줄. */
export function helperPairToInbox(p: FarmHelperPair): InboxItem | null {
  // 양쪽 동의 대기 (is_pending) 만 처리함에 표시. is_active 면 이미 연결된 상태.
  if (!p.is_pending || p.is_active) return null
  const recipientName = p.recipient_name || `농가 ${p.recipient_user_no}`
  const farmer: Farmer = {
    id: String(p.recipient_user_no),
    name: recipientName,
    phone: "",
    state: "help",
    tone: "",
    parcels: [],
    note: p.helper_name ? `${p.helper_name} 도우미 연결 대기` : "도우미를 찾아 주세요",
  }
  return {
    id: `helper:${p.helper_user_no}-${p.help_seq}`,
    kind: "helper",
    urgency: "today",
    farmer,
    projTag: null,
    title: p.helper_name
      ? `${p.helper_name} 도우미 연결을 마무리할까요?`
      : "도우미 연결이 필요해요",
    sub: undefined,
    dueText: null,
    evidence: null,
  }
}

/** 두 소스(사진 확인 + 알려줄 일)를 합쳐 urgency 순 정렬한 처리함 생성.
 *
 * 도우미 연결은 처리함에서 자동 제안하지 않는다 — 이장님이 농가 상세에서 직접
 * 판단해 누르는 흐름. system 이 "도우미 연결을 마무리할까요?" 라고 강요하지 않게.
 * helpers 인자는 시그니처 호환 위해 유지하지만 무시.
 */
// 처리함(Inbox)에 모을 최근 항목 상한 — 사이드바 배지와 대시보드 본문이 반드시 같은 수를
// 쓰도록 공유한다. (예전엔 사이드바가 20/10, 본문이 6/5 로 달라 배지 15 vs 본문 7 처럼 어긋났음.)
export const INBOX_EVIDENCE_LIMIT = 6
export const INBOX_LAGGARD_LIMIT = 5

export function buildInbox({
  evidence,
  laggards,
  helpers: _helpers,
  resolveImg,
}: {
  evidence: RecentEvidenceItem[]
  laggards: LaggardFarmerItem[]
  helpers: FarmHelperPair[]
  resolveImg: (path: string) => string
}): InboxItem[] {
  const items: InboxItem[] = []
  for (const e of evidence) items.push(evidenceToInbox(e, resolveImg))
  for (const l of laggards) items.push(laggardToInbox(l))
  const rank: Record<Urgency, number> = { over: 0, today: 1, week: 2, soon: 3 }
  return items.sort((a, b) => rank[a.urgency] - rank[b.urgency])
}

// ----------------------------------------------------------------------------
// 3) 마을 진행률 (VillagePulseData)
// ----------------------------------------------------------------------------

export function buildVillagePulse(
  farmers: FarmerDiarySummary[],
  projects: { name: string; pct: number }[] = [],
): VillagePulseData {
  let onTrack = 0
  let watch = 0
  let behind = 0
  for (const f of farmers) {
    const s = inferState(f)
    if (s === "good") onTrack += 1
    else if (s === "mid") watch += 1
    else behind += 1
  }
  return {
    totalFarmers: farmers.length,
    onTrack,
    watch,
    behind,
    projects,
  }
}

// ----------------------------------------------------------------------------
// 4) 문자 기본 문구 — Nudge 모달 defaultText
// ----------------------------------------------------------------------------

export function defaultNudgeText(item: InboxItem): string {
  const name = item.farmer.name
  if (item.kind === "review") {
    return `${name}님, 올려주신 사진을 확인했어요. 추가로 부탁드릴 부분이 있어요.`
  }
  if (item.kind === "helper") {
    return `${name}님, 기록 도우미 연결을 도와드리려고 해요. 잠깐 통화 가능하실까요?`
  }
  return `${name}님, ${item.title}. 시간 되실 때 챙겨주세요. 어려운 부분 있으면 이장에게 알려주세요.`
}
