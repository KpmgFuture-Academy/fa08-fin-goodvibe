/** 영농일지 저장소 어댑터. local 모드는 localStorage, api 모드는 backend `/diary` 호출. */
import { getApiBaseUrl, getDataSource } from "./data-source";
import type { DiaryRecord } from "./diary-types";
import { resolveTodoId } from "./todo-id";

const STORAGE_KEY = "jeotanmaeul.diary_records.v1";
const REQUIRED_STRING_FIELDS: Array<keyof DiaryRecord> = [
  "diary_id",
  "farmer_id",
  "worker_name",
  "work_date",
  "field_id",
  "crop_name",
  "work_stage",
  "work_detail",
  "created_at",
  "updated_at",
];

export type DiaryStorageResult =
  | { status: "success"; record: DiaryRecord }
  | { status: "failed"; record: DiaryRecord; message: string };

export type DiaryListParams = {
  farmer_id?: string;
};

export interface DiaryRepository {
  listDiaryRecords(params?: DiaryListParams): Promise<DiaryRecord[]>;
  getDiaryRecordById(diaryId: string): Promise<DiaryRecord | null>;
  saveDiaryRecord(record: DiaryRecord): Promise<DiaryStorageResult>;
}

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isDiaryRecord(value: unknown): value is DiaryRecord {
  if (!isRecordObject(value)) return false;

  for (const field of REQUIRED_STRING_FIELDS) {
    if (typeof value[field] !== "string" || value[field] === "") return false;
  }

  return Array.isArray(value.linked_evidence_ids) && value.linked_evidence_ids.every((item) => typeof item === "string");
}

function toStringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function toNumberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function normalizeDiaryRecord(value: unknown): DiaryRecord | null {
  if (!isRecordObject(value)) return null;

  const farmerName = toStringValue(value.farmer_name);
  const workerName = toStringValue(value.worker_name) || farmerName || "농업인";
  const workStage = toStringValue(value.work_stage) || toStringValue(value.work_stage_detail) || "기타";
  const workDetail = toStringValue(value.work_detail) || toStringValue(value.work_stage_detail) || workStage;
  const createdAt = toStringValue(value.created_at) || toStringValue(value.updated_at);
  const updatedAt = toStringValue(value.updated_at) || toStringValue(value.created_at);

  const normalizedTodoId = resolveTodoId({
    todo_id: toStringValue(value.todo_id),
    group_no: toNumberValue(value.group_no),
    prj_id: toStringValue(value.prj_id) || toStringValue(value.project_id),
    activity_id: toStringValue(value.activity_id),
    job_cd: toStringValue(value.job_cd),
  });

  const record: DiaryRecord = {
    diary_id: toStringValue(value.diary_id),
    todo_id: normalizedTodoId,
    project_id: toStringValue(value.project_id) || toStringValue(value.prj_id),
    prj_id: toStringValue(value.prj_id),
    group_no: toNumberValue(value.group_no),
    farmer_id: toStringValue(value.farmer_id),
    farmer_name: farmerName,
    worker_name: workerName,
    work_date: toStringValue(value.work_date),
    field_id: toStringValue(value.field_id),
    parcel_no: toStringValue(value.parcel_no),
    field_address: toStringValue(value.field_address),
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
    crop_name: toStringValue(value.crop_name) || "벼",
    activity_id: toStringValue(value.activity_id),
    job_cd: toStringValue(value.job_cd),
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
    work_stage: workStage,
    work_stage_detail: toStringValue(value.work_stage_detail),
    work_detail: workDetail,
    harvest_amount: "",
    sales_place: "",
    sales_date: "",
    sales_amount_krw: "",
    before_photo_evidence_id: "",
    during_photo_evidence_id: "",
    after_photo_evidence_id: "",
    linked_evidence_ids: Array.isArray(value.linked_evidence_ids)
      ? value.linked_evidence_ids.filter((item): item is string => typeof item === "string")
      : [],
    selected_activity_type: "",
    activity_selection: {},
    material_selection: {},
    photo_link_option: "",
    ai_autofill_used: false,
    ai_autofill_model: "",
    ai_autofill_source: "",
    ai_autofill_suggestions: {},
    ai_autofill_applied_fields: [],
    status: toStringValue(value.status) || "saved",
    created_at: createdAt,
    updated_at: updatedAt,
    input_method:
      value.input_method === "voice" || value.input_method === "photo" || value.input_method === "manual"
        ? value.input_method
        : toStringValue(value.input_type_cd).includes("voice")
        ? "voice"
        : "manual",
    input_type_cd: toStringValue(value.input_type_cd) || toStringValue(value.input_method),
  };

  return isDiaryRecord(record) ? record : null;
}

function loadLocalDiaryRecords(): DiaryRecord[] {
  if (!canUseStorage()) return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(normalizeDiaryRecord).filter((item): item is DiaryRecord => item !== null) : [];
  } catch {
    return [];
  }
}

function saveLocalDiaryRecords(records: DiaryRecord[]): { status: "success" } | { status: "failed"; message: string } {
  if (!canUseStorage()) {
    return { status: "failed", message: "이 브라우저에서는 임시 저장소를 사용할 수 없습니다." };
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records, null, 2));
    return { status: "success" };
  } catch {
    return { status: "failed", message: "영농일지를 저장하지 못했습니다. 브라우저 저장 공간을 확인해 주세요." };
  }
}

export const localStorageDiaryRepository: DiaryRepository = {
  async listDiaryRecords(params) {
    const records = loadLocalDiaryRecords();
    if (!params?.farmer_id) return records;
    return records.filter((record) => record.farmer_id === params.farmer_id);
  },
  async getDiaryRecordById(diaryId: string) {
    return loadLocalDiaryRecords().find((record) => record.diary_id === diaryId) ?? null;
  },
  async saveDiaryRecord(record: DiaryRecord) {
    const records = loadLocalDiaryRecords();
    const existingIndex = records.findIndex((item) => item.diary_id === record.diary_id);

    if (existingIndex >= 0) {
      records[existingIndex] = record;
    } else {
      records.push(record);
    }

    const saved = saveLocalDiaryRecords(records);
    if (saved.status === "failed") return { status: "failed", record, message: saved.message };

    return { status: "success", record };
  },
};

export const apiDiaryRepository: DiaryRepository = {
  async listDiaryRecords(params) {
    try {
      const url = new URL("/diary", `${getApiBaseUrl()}/`);
      if (params?.farmer_id) url.searchParams.set("farmer_id", params.farmer_id);
      const response = await fetch(url.toString());
      if (!response.ok) return [];
      const data: unknown = await response.json();
      if (!isRecordObject(data) || !Array.isArray(data.items)) return [];
      return data.items.map(normalizeDiaryRecord).filter((item): item is DiaryRecord => item !== null);
    } catch {
      return [];
    }
  },
  async getDiaryRecordById(diaryId: string) {
    try {
      const response = await fetch(`${getApiBaseUrl()}/diary/${encodeURIComponent(diaryId)}`);
      if (!response.ok) return null;
      return normalizeDiaryRecord(await response.json());
    } catch {
      return null;
    }
  },
  async saveDiaryRecord(record: DiaryRecord) {
    try {
      const response = await fetch(`${getApiBaseUrl()}/diary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(record),
      });

      if (!response.ok) {
        return { status: "failed", record, message: "영농일지를 API에 저장하지 못했습니다." };
      }

      const saved = normalizeDiaryRecord(await response.json());
      if (!saved) return { status: "failed", record, message: "API 응답을 영농일지 형식으로 읽지 못했습니다." };
      return { status: "success", record: saved };
    } catch {
      return { status: "failed", record, message: "백엔드에 연결할 수 없습니다. 서버 실행 상태를 확인해 주세요." };
    }
  },
};

export function getDiaryRepository() {
  return getDataSource() === "api" ? apiDiaryRepository : localStorageDiaryRepository;
}
