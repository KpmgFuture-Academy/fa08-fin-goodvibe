import { getDiaryRepository } from "./diary-repository";
import { resolveTodoId } from "./todo-id";
import type { DiaryRecord, DiaryValidationResult, ManualDiaryInput } from "./diary-types";
import { SAMPLE_PROJECT_CONTEXT, SAMPLE_USER_CONTEXT } from "./sample-user-context";

const SAMPLE_CONTEXT = {
  todo_id: "todo_manual_001",
  project_id: SAMPLE_PROJECT_CONTEXT.project_id,
  farmer_id: SAMPLE_USER_CONTEXT.farmer_id,
  farmer_name: SAMPLE_USER_CONTEXT.farmer_name,
  worker_name: SAMPLE_USER_CONTEXT.worker_name,
};

function createDiaryId() {
  const randomId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  return `diary_${randomId}`;
}

function parseEvidenceIds(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatDateInput(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function getDefaultWorkDate() {
  return formatDateInput(new Date());
}

// 현 시드(저탄선도마을 / amo_regno=1110000002 김영수) 기본 필지: parcel_no=1 (1번 논).
// 현 schema 의 parcel PK 는 (amo_regno, parcel_no) 복합키. parcel_regno 는 공식 지번이라
// 사람이 식별하기 어려워 field_id 는 비우고 parcel_no(짧은 정수)만 보낸다.
const DEFAULT_FIELD_ID = "";
const DEFAULT_PARCEL_NO = "1";

function inferFieldMeta(input: ManualDiaryInput) {
  if (input.field_id || input.parcel_no) {
    return {
      field_id: input.field_id || DEFAULT_FIELD_ID,
      parcel_no: input.parcel_no || "",
      field_address: input.field || "",
    };
  }

  const fieldText = (input.field || "").toLowerCase();
  // 시드 매핑: 김영수의 두 필지 (1110000002)
  //   "1번 논" / "벼논" / "벼" / "작은 논" → parcel_no 1 (RPA, 4310㎡)
  //   "고추" / "밭"                          → parcel_no 2 (DFA, 710㎡, 작은 편)
  if (fieldText.includes("고추") || fieldText.includes("밭")) {
    return {
      field_id: "",
      parcel_no: "2",
      field_address: "2번 밭 (고추)",
    };
  }

  if (
    fieldText.includes("1") ||
    fieldText.includes("일") ||
    fieldText.includes("벼") ||
    fieldText.includes("논") ||
    fieldText.includes("작은") ||
    fieldText.includes("큰")
  ) {
    return {
      field_id: "",
      parcel_no: "1",
      field_address: "1번 논 (벼)",
    };
  }

  return {
    field_id: DEFAULT_FIELD_ID,
    parcel_no: DEFAULT_PARCEL_NO,
    field_address: input.field || "1번 논 (벼)",
  };
}

function inferWorkMeta(work: string) {
  const normalized = work.trim();
  if (!normalized) {
    return { work_stage: "기타", work_stage_detail: "기타" };
  }
  return { work_stage: normalized, work_stage_detail: normalized };
}

function blankRecord(): DiaryRecord {
  const now = new Date().toISOString();

  return {
    diary_id: createDiaryId(),
    todo_id: "",
    project_id: "",
    prj_id: "",
    group_no: undefined,
    farmer_id: "",
    farmer_name: "",
    worker_name: "",
    work_date: "",
    field_id: "",
    parcel_no: "",
    field_address: "",
    latitude: "",
    longitude: "",
    weather_source: "",
    weather_status: "",
    temperature_avg_c: "",
    temperature_max_c: "",
    temperature_min_c: "",
    precipitation_mm: "",
    humidity_avg_percent: "",
    sunshine_duration_hours: "",
    weather_summary: "",
    crop_name: "",
    variety_name: "",
    cultivation_area_ha: "",
    fertilizer_type: "",
    fertilizer_product_name: "",
    fertilizer_purchase_place: "",
    fertilizer_use_date: "",
    fertilizer_amount_per_area: "",
    pesticide_name: "",
    pesticide_purchase_place: "",
    pesticide_use_date: "",
    pesticide_amount: "",
    pesticide_dilution_ratio: "",
    seedling_type: "",
    seedling_purchase_place: "",
    seedling_purchase_amount: "",
    activity_id: "",
    job_cd: "",
    work_stage: "",
    work_stage_detail: "",
    work_detail: "",
    harvest_amount: "",
    sales_place: "",
    sales_date: "",
    sales_amount_krw: "",
    before_photo_evidence_id: "",
    during_photo_evidence_id: "",
    after_photo_evidence_id: "",
    linked_evidence_ids: [],
    selected_activity_type: "",
    activity_selection: {},
    material_selection: {},
    photo_link_option: "",
    ai_autofill_used: false,
    ai_autofill_model: "",
    ai_autofill_source: "",
    ai_autofill_suggestions: {},
    ai_autofill_applied_fields: [],
    status: "saved",
    created_at: now,
    updated_at: now,
    input_method: "manual",
    input_type_cd: "",
    voice_text: "",
    voice_audio_url: "",
    voice_predicted_job_cd: "",
  };
}

export function buildManualDiaryRecord(input: ManualDiaryInput): DiaryRecord {
  const field = inferFieldMeta(input);
  const work = inferWorkMeta(input.work);
  const linkedEvidenceIds = parseEvidenceIds(input.linkedEvidenceText);
  const now = new Date().toISOString();
  const workDate = input.workDate || getDefaultWorkDate();

  return {
    ...blankRecord(),
    ...SAMPLE_CONTEXT,
    // 기록 도우미 모드면 input.farmer_id 가 recipient 의 amo_regno — SAMPLE_CONTEXT 의 본인 ID 를 덮어씀.
    farmer_id: input.farmer_id || SAMPLE_CONTEXT.farmer_id,
    todo_id: resolveTodoId({
      todo_id: input.todo_id,
      group_no: input.group_no,
      prj_id: input.prj_id,
      activity_id: input.activity_id,
      job_cd: input.job_cd,
    }),
    project_id: input.project_id || input.prj_id || SAMPLE_CONTEXT.project_id,
    prj_id: input.prj_id || "",
    group_no: input.group_no,
    work_date: workDate,
    field_id: field.field_id,
    parcel_no: field.parcel_no,
    field_address: field.field_address,
    crop_name: input.cropName || "벼",
    activity_id: input.activity_id || "",
    job_cd: input.job_cd || "",
    work_stage: work.work_stage,
    work_stage_detail: work.work_stage_detail,
    work_detail: input.workDetail || `${input.field}에서 ${input.work} 작업 기록`,
    linked_evidence_ids: linkedEvidenceIds,
    during_photo_evidence_id: linkedEvidenceIds[0] ?? "",
    selected_activity_type: input.work,
    activity_selection: {
      selected_activity_type: input.work,
      field_label: input.field,
      todo_id: input.todo_id || "",
      activity_id: input.activity_id || "",
      job_cd: input.job_cd || "",
    },
    photo_link_option: linkedEvidenceIds.length > 0 ? "linked" : "",
    created_at: now,
    updated_at: now,
    input_method: input.input_type === "voice" ? "voice" : "manual",
    input_type_cd: input.input_type_cd || input.input_type || "manual",
    voice_text: input.voice_text || "",
    voice_audio_url: input.voice_audio_url || "",
    voice_predicted_job_cd: input.voice_predicted_job_cd || "",
  };
}

export function validateDiaryRequiredFields(record: DiaryRecord): DiaryValidationResult {
  const missingFields: string[] = [];
  const requiredMap: Array<[keyof DiaryRecord, string]> = [
    ["work_date", "작업일"],
    ["worker_name", "작업자"],
    ["crop_name", "작물명"],
    ["work_stage", "작업단계"],
    ["work_detail", "상세 작업내용"],
  ];

  for (const [key, label] of requiredMap) {
    if (record[key] === "" || record[key] == null) missingFields.push(label);
  }

  // 위치는 선택 사항 — 교육·자재 구입처럼 필지와 무관한 작업이 있어 비어 있어도 통과.

  const isValid = missingFields.length === 0;
  return {
    is_valid: isValid,
    missing_fields: missingFields,
    message: isValid ? "필수 항목을 모두 입력했습니다." : "누락된 필수 항목이 있습니다.",
  };
}

export async function saveManualDiaryRecord(input: ManualDiaryInput) {
  const record = buildManualDiaryRecord(input);
  const validation = validateDiaryRequiredFields(record);

  if (!validation.is_valid) {
    return { status: "failed" as const, record, validation, message: validation.message };
  }

  const saved = await getDiaryRepository().saveDiaryRecord(record);
  if (saved.status === "failed") {
    return { status: "failed" as const, record, validation, message: saved.message };
  }

  return {
    status: "success" as const,
    record: saved.record,
    validation,
  };
}

export async function listDiaryRecords() {
  const records = await getDiaryRepository().listDiaryRecords({ farmer_id: SAMPLE_USER_CONTEXT.farmer_id });
  return records.sort((a, b) => {
    const dateOrder = b.work_date.localeCompare(a.work_date);
    if (dateOrder !== 0) return dateOrder;
    return b.created_at.localeCompare(a.created_at);
  });
}

export async function getDiaryRecordById(diaryId: string) {
  return getDiaryRepository().getDiaryRecordById(diaryId);
}

export function formatDiaryDate(record: DiaryRecord) {
  const date = new Date(`${record.work_date}T00:00:00`);
  if (Number.isNaN(date.getTime())) return record.work_date;
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
}
