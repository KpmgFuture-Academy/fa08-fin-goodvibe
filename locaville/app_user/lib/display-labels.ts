/** 코드 → 화면 라벨 변환. job_cd / input_type_cd / activity 등을 한국어 표기로. */
import { FARM_JOBS } from "@/lib/farm-reference";
import { inferParcelLabel } from "@/lib/parcel-reference";

const EVIDENCE_TYPE_LABELS: Record<string, string> = {
  MID_DRAINAGE_START: "중간 물떼기 시작 사진",
  MID_DRAINAGE_END: "중간 물떼기 종료 사진",
  AWD_DRY_FIELD: "마른 논바닥 사진",
  AWD_DRY_FIELD_ROUND_1: "마른 논바닥 1회차 사진",
  AWD_DRY_FIELD_ROUND_2: "마른 논바닥 2회차 사진",
  AWD_DRY_FIELD_ROUND_3: "마른 논바닥 3회차 사진",
  AWD_DRY_FIELD_ROUND_4: "마른 논바닥 4회차 사진",
  BIOCHAR_BAG: "바이오차 포대 사진",
  BIOCHAR_SPREADING: "바이오차 투입 사진",
  BIOCHAR_INVOICE: "바이오차 구입 증빙",
  AUTUMN_TILLAGE_BEFORE: "가을갈이 전 사진",
  AUTUMN_TILLAGE_AFTER: "가을갈이 후 사진",
  WASTE_COLLECTION: "폐기물 수거 사진",
  OTH: "기타 증빙",
  GENERAL: "일반 증빙",
  PIC: "현장 사진",
  RCT: "영수증",
  EDU: "교육 이수증",
};

const ACTIVITY_LABELS: Record<string, string> = {
  MID_DRAINAGE: "중간 물떼기",
  AWD: "논물 얕게 걸러대기",
  AWD_DRY_FIELD: "논물 얕게 걸러대기",
  BIOCHAR: "바이오차 투입",
  AUTUMN_TILLAGE: "가을갈이",
  WASTE_COLLECTION: "폐기물 처리",
  // 활동 레벨 AI 라벨(evidence.ai_label) / suggested_activity_type / 이장앱 ActivityCode 호환.
  // 이 코드들이 화면에 raw 로 새지 않도록 한국어 매핑을 명시한다.
  BIOCHAR_APPLICATION: "바이오차 투입",
  MID_DRAINAGE_APPLICATION: "중간 물떼기",
  WATER_DN: "중간 물떼기",
  SHALLOW: "논물 얕게 걸러대기",
  FALL_TILLAGE: "가을갈이",
  WASTE: "폐기물 처리",
};

/** 시스템 코드(영문 대문자·숫자·언더스코어)인지 — 한국어 라벨과 구분해 raw 노출을 막는 데 사용. */
const isSystemCode = (v?: string | null): boolean => !!v && /^[A-Z0-9_]+$/.test(v.trim());

const STATUS_LABELS: Record<string, string> = {
  needs_review: "검토 필요",
  confirmed: "확인 완료",
  retake_required: "재촬영 필요",
  pending: "대기",
  in_progress: "진행 중",
  completed: "완료",
  created: "등록됨",
  saved: "저장 완료",
  not_started: "시작 전",
};

const COMPLETION_STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: "시작 전",
  IN_PROGRESS: "진행 중",
  COMPLETED: "완료",
  UNKNOWN_ACTIVITY: "활동 확인 필요",
};

const CONFIDENCE_LABELS: Record<string, string> = {
  low: "낮음",
  medium: "보통",
  high: "높음",
};

export function getEvidenceTypeLabel(code?: string | null) {
  if (!code) return "-";
  return EVIDENCE_TYPE_LABELS[code] || code;
}

export type EvidenceKind = "photo" | "receipt" | "certificate";

/**
 * required_evidence_types 코드로 증빙 종류 판별.
 *   RCT / *INVOICE* / *RECEIPT*  → "receipt"(영수증)
 *   *EDU*                        → "certificate"(이수증)
 *   그 외(PIC·MID_DRAINAGE·BIOCHAR·AWD … 사실상 전부) → "photo"(현장 사진)
 * 증빙 코드는 영문이라, 예전의 /photo|사진/ 정규식 판정은 항상 빗나갔다.
 */
export function getEvidenceKind(types?: string[] | null): EvidenceKind {
  if (!types || types.length === 0) return "photo";
  const t = (types[0] || "").toUpperCase();
  if (t.includes("EDU")) return "certificate";
  if (t === "RCT" || t.includes("RCT") || t.includes("INVOICE") || t.includes("RECEIPT")) return "receipt";
  return "photo";
}

/** 증빙 종류별 행동 라벨 — 버튼/가이드 문구. */
export function getEvidenceActionLabel(kind: EvidenceKind): { button: string; guide: string; short: string } {
  if (kind === "receipt") return { button: "영수증 올리기", guide: "구매한 농자재 영수증을 찍어주세요. 글자가 보이게 가까이 찍으면 좋아요.", short: "영수증" };
  if (kind === "certificate") return { button: "이수증 올리기", guide: "교육 이수증이 잘 보이게 찍거나 사진을 골라주세요", short: "이수증" };
  return { button: "사진 찍고 완료하기", guide: "작업한 곳이 잘 보이게 찍어주세요", short: "사진" };
}

export function getActivityLabel(activityId?: string | null, fallback?: string | null) {
  if (fallback && fallback.trim()) return fallback;
  if (!activityId) return "-";
  return ACTIVITY_LABELS[activityId] || activityId;
}

/**
 * 증빙 카드의 "연결된 작업" 표기용 — activity_id / evidence_type 양쪽을 한국어로 시도.
 *   1. activity_id 가 ACTIVITY_LABELS 에 매핑되면 사용 (예: MID_DRAINAGE → "중간 물떼기")
 *   2. evidence_type 이 EVIDENCE_TYPE_LABELS 에 매핑되면 사용
 *      (예: MID_DRAINAGE_END → "중간 물떼기 종료 사진")
 *   3. 한국어로 보이는 값이 있으면 그대로
 *   4. 모두 시스템 코드면 "기타 작업"
 */
export function describeActivityKorean(activityId?: string | null, evidenceType?: string | null): string {
  if (activityId && ACTIVITY_LABELS[activityId]) return ACTIVITY_LABELS[activityId];
  if (evidenceType && EVIDENCE_TYPE_LABELS[evidenceType]) return EVIDENCE_TYPE_LABELS[evidenceType];
  // 시스템 코드 아닌 한국어/일반 텍스트면 그대로
  const isCode = (v?: string | null) => !!v && /^[A-Z0-9_]+$/.test(v);
  if (evidenceType && !isCode(evidenceType)) return evidenceType;
  if (activityId && !isCode(activityId)) return activityId;
  return "기타 작업";
}

export function getJobCodeLabel(jobCd?: string | null, fallback?: string | null) {
  // 1) job_cd 가 마스터에 있으면 항상 한국어 work_stage (최우선).
  if (jobCd) {
    const matched = FARM_JOBS.find((item) => item.job_cd === jobCd);
    if (matched?.work_stage) return matched.work_stage;
  }
  // 2) fallback — 코드면 한국어로 변환, 변환 못 한 시스템 코드(BIOCHAR_APPLICATION 등)는
  //    절대 그대로 노출하지 않는다. 사람이 읽을 수 있는 텍스트면 그대로 사용.
  const fb = (fallback || "").trim();
  if (fb) {
    if (ACTIVITY_LABELS[fb]) return ACTIVITY_LABELS[fb];
    if (EVIDENCE_TYPE_LABELS[fb]) return EVIDENCE_TYPE_LABELS[fb];
    if (!isSystemCode(fb)) return fb;
  }
  // 3) job_cd 가 코드가 아니면 그대로, 그래도 없으면 안전 라벨(코드 누출 방지).
  if (jobCd && !isSystemCode(jobCd)) return jobCd;
  return "작업";
}

/**
 * 작업명을 행동형으로 — 고령 사용자가 "무엇을 해야 하는지"를 명사가 아닌 행동으로 읽도록.
 * 예: "바이오차" / "바이오차 투입" → "바이오차 뿌리기". 이미 행동형이면 그대로.
 */
export function getJobActionLabel(jobName?: string | null): string {
  const name = (jobName || "").trim();
  if (!name) return "작업";
  if (name.includes("바이오차")) return "바이오차 뿌리기";
  if (name === "비료 사용") return "비료 주기";
  if (name === "폐기물 처리") return "폐기물 치우기";
  return name;
}

/**
 * 재촬영 사유 표시 문구 — 이장님 프리셋 중 "다른 활동 사진…" 같은 추상 사유를
 * 해당 작업 기준의 구체 문장으로 풀어쓴다(표시 전용, 저장값은 그대로).
 * 흐림/날짜·장소 등 이미 구체적인 사유는 손대지 않는다.
 */
const RETAKE_UNCLEAR_BY_ACTIVITY: Array<{ match: RegExp; message: string }> = [
  { match: /BIOCHAR|바이오차/i, message: "바이오차를 뿌린 모습이 잘 보이지 않아요." },
  { match: /AWD|SHALLOW|걸러대기/i, message: "논물이 빠진 모습이 잘 보이지 않아요." },
  { match: /DRAIN|WATER_DN|물떼기/i, message: "물을 뗀 논의 모습이 잘 보이지 않아요." },
  { match: /FERT|비료/i, message: "비료를 준 모습이 잘 보이지 않아요." },
  { match: /TILLAGE|갈이/i, message: "갈아엎은 흙이 잘 보이지 않아요." },
];
const VAGUE_RETAKE_PATTERNS = [/다른\s*활동/, /활동\s*내용이\s*사진에\s*안\s*보여/];

export function refineRetakeMessage(raw?: string | null, jobCd?: string | null, jobName?: string | null): string {
  const msg = (raw || "").trim();
  const concrete = () => {
    const key = `${jobCd || ""} ${jobName || ""}`;
    return RETAKE_UNCLEAR_BY_ACTIVITY.find((r) => r.match.test(key))?.message || "작업하신 모습이 잘 보이지 않아요.";
  };
  if (!msg) return concrete();
  if (VAGUE_RETAKE_PATTERNS.some((p) => p.test(msg))) return concrete();
  return msg;
}

export function getStatusLabel(status?: string | null) {
  if (!status) return "확인 필요";
  return STATUS_LABELS[status.toLowerCase()] || status;
}

export function getCompletionStatusLabel(status?: string | null) {
  if (!status) return "확인 필요";
  return COMPLETION_STATUS_LABELS[status] || getStatusLabel(status);
}

export function getConfidenceLabel(confidence?: string | null) {
  if (!confidence) return "";
  return CONFIDENCE_LABELS[confidence.toLowerCase()] || confidence;
}

/** 업로드 자동 분류(classification) → 농가용 한 줄 안내 문구. */
export function getClassificationLabel(classification?: string | null) {
  switch ((classification || "").toLowerCase()) {
    case "receipt":
      return "영수증으로 보여요";
    case "field_photo":
      return "현장 작업 사진으로 보여요";
    default:
      return "사진을 등록했어요";
  }
}

export function getParcelDisplayLabel(input?: {
  field_id?: string | null;
  parcel_no?: string | null;
  text?: string | null;
  fallback?: string | null;
}) {
  const inferred = inferParcelLabel({
    field_id: input?.field_id || "",
    parcel_no: input?.parcel_no || "",
    text: input?.text || "",
  });
  if (inferred?.label) return inferred.label;
  return input?.fallback || input?.parcel_no || input?.field_id || "-";
}
