/** 증빙 저장소 어댑터. local 모드는 localStorage, api 모드는 backend `/evidence`. */
import { getApiBaseUrl, getDataSource } from "./data-source";
import type { EvidenceRecord } from "./evidence-types";

const STORAGE_KEY = "jeotanmaeul.evidence_records.v1";
const REQUIRED_STRING_FIELDS: Array<keyof EvidenceRecord> = [
  "evidence_id",
  "farmer_id",
  "activity_type",
  "evidence_type",
  "captured_at",
  "status",
  "created_at",
  "updated_at",
];

export type EvidenceStorageResult =
  | { status: "success"; record: EvidenceRecord }
  | { status: "failed"; record: EvidenceRecord; message: string };

export type EvidenceListParams = {
  farmer_id?: string;
  prj_id?: string;
  project_id?: string;
};

export interface EvidenceRepository {
  listEvidenceRecords(params?: EvidenceListParams): Promise<EvidenceRecord[]>;
  getEvidenceRecordById(evidenceId: string): Promise<EvidenceRecord | null>;
  saveEvidenceRecord(record: EvidenceRecord): Promise<EvidenceStorageResult>;
}

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isEvidenceRecord(value: unknown): value is EvidenceRecord {
  if (!isRecordObject(value)) return false;

  for (const field of REQUIRED_STRING_FIELDS) {
    if (typeof value[field] !== "string" || value[field] === "") return false;
  }

  return typeof value.image_url === "string" || typeof value.original_image_path === "string";
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

function toAbsoluteAssetUrl(value: string) {
  if (!value) return "";
  if (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("blob:") || value.startsWith("data:")) {
    return value;
  }

  const normalizedPath = value.startsWith("/") ? value : `/${value}`;
  try {
    return new URL(normalizedPath, `${getApiBaseUrl()}/`).toString();
  } catch {
    return value;
  }
}

function normalizeEvidenceRecord(value: unknown): EvidenceRecord | null {
  if (!isRecordObject(value)) return null;

  const imageUrl = toStringValue(value.image_url) || toStringValue(value.original_image_path) || toStringValue(value.storage_path);

  const record: EvidenceRecord = {
    evidence_id: toStringValue(value.evidence_id),
    todo_id: toStringValue(value.todo_id),
    group_no: toNumberValue(value.group_no),
    prj_id: toStringValue(value.prj_id) || toStringValue(value.project_id),
    project_id: toStringValue(value.project_id) || toStringValue(value.prj_id),
    activity_id: toStringValue(value.activity_id),
    job_cd: toStringValue(value.job_cd),
    farmer_id: toStringValue(value.farmer_id),
    parcel_no: toStringValue(value.parcel_no),
    field_id: toStringValue(value.field_id),
    activity_type: toStringValue(value.activity_type),
    evidence_type: toStringValue(value.evidence_type),
    confirmed_label: toStringValue(value.confirmed_label),
    image_url: toAbsoluteAssetUrl(imageUrl),
    storage_path: toStringValue(value.storage_path),
    original_image_path: toStringValue(value.original_image_path),
    captured_at: toStringValue(value.captured_at) || toStringValue(value.created_at),
    status: toStringValue(value.status) || "needs_review",
    user_message: toStringValue(value.user_message),
    created_at: toStringValue(value.created_at) || toStringValue(value.captured_at),
    updated_at: toStringValue(value.updated_at) || toStringValue(value.created_at) || toStringValue(value.captured_at),
  };

  return isEvidenceRecord(record) ? record : null;
}

function loadLocalEvidenceRecords(): EvidenceRecord[] {
  if (!canUseStorage()) return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isEvidenceRecord) : [];
  } catch {
    return [];
  }
}

function saveLocalEvidenceRecords(records: EvidenceRecord[]): { status: "success" } | { status: "failed"; message: string } {
  if (!canUseStorage()) {
    return { status: "failed", message: "이 브라우저에서는 증빙 임시 저장소를 사용할 수 없습니다." };
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records, null, 2));
    return { status: "success" };
  } catch {
    return { status: "failed", message: "증빙 정보를 저장하지 못했습니다. 브라우저 저장 공간을 확인해 주세요." };
  }
}

export const localStorageEvidenceRepository: EvidenceRepository = {
  async listEvidenceRecords(params) {
    const records = loadLocalEvidenceRecords();
    if (!params) return records;
    return records.filter((record) => {
      if (params.farmer_id && record.farmer_id !== params.farmer_id) return false;
      if (params.prj_id && record.prj_id !== params.prj_id && record.project_id !== params.prj_id) return false;
      if (params.project_id && record.project_id !== params.project_id && record.prj_id !== params.project_id) return false;
      return true;
    });
  },
  async getEvidenceRecordById(evidenceId: string) {
    return loadLocalEvidenceRecords().find((record) => record.evidence_id === evidenceId) ?? null;
  },
  async saveEvidenceRecord(record: EvidenceRecord) {
    const records = loadLocalEvidenceRecords();
    const existingIndex = records.findIndex((item) => item.evidence_id === record.evidence_id);

    if (existingIndex >= 0) {
      records[existingIndex] = record;
    } else {
      records.push(record);
    }

    const saved = saveLocalEvidenceRecords(records);
    if (saved.status === "failed") return { status: "failed", record, message: saved.message };

    return { status: "success", record };
  },
};

export const apiEvidenceRepository: EvidenceRepository = {
  async listEvidenceRecords(params) {
    try {
      const url = new URL("/evidence", `${getApiBaseUrl()}/`);
      if (params?.farmer_id) url.searchParams.set("farmer_id", params.farmer_id);
      if (params?.prj_id) url.searchParams.set("prj_id", params.prj_id);
      if (params?.project_id) url.searchParams.set("project_id", params.project_id);
      const response = await fetch(url.toString());
      if (!response.ok) return [];
      const data: unknown = await response.json();
      if (!isRecordObject(data) || !Array.isArray(data.items)) return [];
      return data.items.map(normalizeEvidenceRecord).filter((item): item is EvidenceRecord => item !== null);
    } catch {
      return [];
    }
  },
  async getEvidenceRecordById(evidenceId: string) {
    try {
      const response = await fetch(`${getApiBaseUrl()}/evidence/${encodeURIComponent(evidenceId)}`);
      if (!response.ok) return null;
      return normalizeEvidenceRecord(await response.json());
    } catch {
      return null;
    }
  },
  async saveEvidenceRecord(record: EvidenceRecord) {
    try {
      const response = await fetch(`${getApiBaseUrl()}/evidence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(record),
      });

      if (!response.ok) {
        return { status: "failed", record, message: "증빙 정보를 API에 저장하지 못했습니다." };
      }

      const saved = normalizeEvidenceRecord(await response.json());
      if (!saved) return { status: "failed", record, message: "API 응답을 증빙 형식으로 읽지 못했습니다." };
      return { status: "success", record: saved };
    } catch {
      return { status: "failed", record, message: "백엔드에 연결할 수 없습니다. 서버 실행 상태를 확인해 주세요." };
    }
  },
};

export function getEvidenceRepository() {
  return getDataSource() === "api" ? apiEvidenceRepository : localStorageEvidenceRepository;
}
