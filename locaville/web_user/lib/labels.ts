// 사용자 화면에 노출되는 raw 코드값을 한국어 라벨로 변환합니다.
// 매핑이 없는 코드값은 깨져 보이지 않게 안전한 fallback 텍스트를 반환합니다.

const EVIDENCE_TYPE_LABELS: Record<string, string> = {
  AWD_DRY_FIELD: "논물얕게걸러대기 증빙 사진",
  MID_DRAINAGE_START: "중간 물떼기 시작 사진",
  MID_DRAINAGE_END: "중간 물떼기 종료 사진",
  BIOCHAR_BAG: "바이오차 포대 사진",
  BIOCHAR_SPREADING: "바이오차 살포 사진",
  BIOCHAR_INVOICE: "바이오차 영수증",
  AUTUMN_TILLAGE_BEFORE: "가을 경운 전 사진",
  AUTUMN_TILLAGE_AFTER: "가을 경운 후 사진",
  WASTE_COLLECTION: "영농폐기물 수거 사진",
  UNCLEAR_OR_INVALID: "확인 어려운 사진",
}

// 짧은 활동 라벨 (Hero 카드, 모달 부제 등)
const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  WATER_DN: "중간 물떼기",
  SHALLOW: "논물얕게걸러대기",
  BIOCHAR: "바이오차 투입",
  FALL_TILLAGE: "가을 경운",
  WASTE: "영농폐기물 처리",
}

/**
 * 증빙 코드를 사용자용 한국어 라벨로 변환합니다.
 *
 * 우선순위:
 *  1) `confirmed_label` 이 한국어 등 사용자 친화적 텍스트면 그대로
 *  2) `evidence_type` 코드의 매핑
 *  3) 매핑이 없을 때는 코드를 그대로 (마지막 폴백)
 */
export function labelEvidence(opts: {
  confirmedLabel?: string | null
  evidenceType?: string | null
}): string {
  const conf = (opts.confirmedLabel ?? "").trim()
  if (conf && !isRawCode(conf)) return conf
  const evt = (opts.evidenceType ?? "").trim()
  if (evt && EVIDENCE_TYPE_LABELS[evt]) return EVIDENCE_TYPE_LABELS[evt]
  if (conf) return conf // confirmed_label이 코드처럼 보여도 비어있는 것보단 낫다
  if (evt) return prettyFromCode(evt)
  return "증빙 사진"
}

/**
 * 활동 유형 텍스트를 한국어로 정리합니다.
 * activity_type 컬럼이 "중간 물떼기"처럼 이미 한국어면 그대로,
 * "WATER_DN"처럼 코드면 매핑된 한글로 변환합니다.
 */
export function labelActivityType(value: string | null | undefined): string {
  const v = (value ?? "").trim()
  if (!v) return ""
  if (isRawCode(v) && ACTIVITY_TYPE_LABELS[v]) return ACTIVITY_TYPE_LABELS[v]
  return v
}

// "MID_DRAINAGE_START" 같은 패턴이면 raw code로 간주
function isRawCode(value: string): boolean {
  return /^[A-Z][A-Z0-9_]+$/.test(value)
}

// 한글 조사용: 마지막 글자에 받침(종성)이 있는지 확인합니다.
function hasJongseong(text: string): boolean {
  if (!text) return false
  const code = text.codePointAt(text.length - 1)
  if (code == null) return false
  if (code < 0xac00 || code > 0xd7a3) return false
  return (code - 0xac00) % 28 !== 0
}

/** 주격 조사 (이/가) */
export function subjectParticle(text: string): "이" | "가" {
  return hasJongseong(text) ? "이" : "가"
}

// 매핑이 없는 코드를 그래도 보기 좋게: 언더바 → 공백, 첫 글자만 대문자
function prettyFromCode(code: string): string {
  return code
    .toLowerCase()
    .split("_")
    .map((s) => (s ? s[0].toUpperCase() + s.slice(1) : s))
    .join(" ")
}
