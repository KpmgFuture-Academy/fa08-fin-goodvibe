/** 증빙 서비스 — 사진 업로드 + 메타 저장 + 누락 증빙 조회 + Vision 후보 요청 등의 통합 진입점. */
import { getApiBaseUrl, getDataSource } from "./data-source";
import { getEvidenceRepository } from "./evidence-repository";
import type { EvidenceListParams } from "./evidence-repository";
import type { EvidenceMissingStatus, EvidenceRecord, EvidenceUploadInput, EvidenceUploadResult } from "./evidence-types";
import { SAMPLE_PROJECT_CONTEXT, SAMPLE_USER_CONTEXT } from "./sample-user-context";

const SAMPLE_CONTEXT = {
  todo_id: "todo_001",
  prj_id: SAMPLE_PROJECT_CONTEXT.prj_id,
  project_id: SAMPLE_PROJECT_CONTEXT.project_id,
  activity_id: "",
  farmer_id: SAMPLE_USER_CONTEXT.farmer_id,
  parcel_no: "1",
  field_id: "",
};

export function buildMockEvidenceRecord(evidenceId = "evidence_mock_001"): EvidenceRecord {
  const now = new Date().toISOString();

  return {
    evidence_id: evidenceId,
    ...SAMPLE_CONTEXT,
    activity_type: "중간 물떼기",
    evidence_type: "MID_DRAINAGE_START",
    confirmed_label: "MID_DRAINAGE_START",
    image_url: "/mock/evidence_mock_001.jpg",
    storage_path: "mock/evidence_mock_001.jpg",
    original_image_path: "/mock/evidence_mock_001.jpg",
    captured_at: now,
    status: "confirmed",
    user_message: "중간 물떼기 시작 증빙사진이 연결되었습니다.",
    created_at: now,
    updated_at: now,
  };
}

export async function ensureMockEvidenceRecord() {
  const repository = getEvidenceRepository();
  const existing = await repository.getEvidenceRecordById("evidence_mock_001");
  if (existing) return { status: "success" as const, record: existing };

  return repository.saveEvidenceRecord(buildMockEvidenceRecord());
}

export async function listEvidenceRecords(params?: EvidenceListParams) {
  // In local mode we keep one mock record so evidence-linked UI can still be demoed.
  const records = await getEvidenceRepository().listEvidenceRecords(params);
  if (records.length === 0 && getDataSource() === "local") {
    const seeded = await ensureMockEvidenceRecord();
    const seededRecords = seeded.status === "success" ? [seeded.record] : [];
    if (!params) return seededRecords;
    return seededRecords.filter((record) => {
      if (params.farmer_id && record.farmer_id !== params.farmer_id) return false;
      if (params.prj_id && record.prj_id !== params.prj_id && record.project_id !== params.prj_id) return false;
      if (params.project_id && record.project_id !== params.project_id && record.prj_id !== params.project_id) return false;
      return true;
    });
  }

  return records.sort((a, b) => b.captured_at.localeCompare(a.captured_at));
}

export function saveEvidenceRecord(record: EvidenceRecord) {
  return getEvidenceRepository().saveEvidenceRecord(record);
}

export function getEvidenceById(evidenceId: string) {
  return getEvidenceRepository().getEvidenceRecordById(evidenceId);
}

export async function getEvidenceRecordsByIds(evidenceIds: string[]) {
  const records = await Promise.all(evidenceIds.map(async (evidenceId) => ({
    evidence_id: evidenceId,
    record: await getEvidenceById(evidenceId),
  })));
  return records;
}

function createClientEvidenceId() {
  const randomId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  return `evidence_${randomId}`;
}

function extractErrorMessage(payload: unknown): string {
  if (typeof payload === "string" && payload.trim() !== "") return payload;
  if (payload && typeof payload === "object" && "detail" in payload) {
    const detail = (payload as { detail: unknown }).detail;
    if (typeof detail === "string" && detail.trim() !== "") return detail;
    // FastAPI 422 — detail 이 array<{loc, msg, type}>. 첫 항목의 msg + loc 노출.
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0] as { msg?: string; loc?: unknown };
      const loc = Array.isArray(first?.loc) ? first.loc.join(".") : "";
      const msg = typeof first?.msg === "string" ? first.msg : "validation error";
      return loc ? `[${loc}] ${msg}` : msg;
    }
  }
  return "사진 증빙 업로드에 실패했습니다.";
}

export async function uploadEvidenceFile(input: EvidenceUploadInput): Promise<EvidenceUploadResult> {
  // Local mode stores metadata only; API mode sends multipart file upload to backend.
  if (getDataSource() !== "api") {
    const now = new Date().toISOString();
    const record: EvidenceRecord = {
      evidence_id: createClientEvidenceId(),
      todo_id: input.todo_id || "",
      group_no: input.group_no,
      prj_id: input.prj_id || "",
      project_id: input.project_id || "",
      activity_id: input.activity_id || "",
      job_cd: input.job_cd || "",
      farmer_id: input.farmer_id || SAMPLE_USER_CONTEXT.farmer_id,
      parcel_no: input.parcel_no || "",
      field_id: input.field_id || "",
      activity_type: input.activity_type,
      evidence_type: input.evidence_type,
      confirmed_label: input.confirmed_label || input.evidence_type,
      image_url: "",
      storage_path: "",
      original_image_path: "",
      captured_at: now,
      status: input.status || "created",
      user_message: input.user_message || "localStorage 모드에서는 실제 파일 업로드 없이 증빙 기록만 임시 생성됩니다.",
      created_at: now,
      updated_at: now,
    };
    const saved = await saveEvidenceRecord(record);
    if (saved.status === "failed") {
      return { status: "failed", message: saved.message };
    }
    return {
      status: "success",
      record: saved.record,
      message: "localStorage 모드에서는 실제 파일 업로드 없이 증빙 기록만 임시 생성되었습니다.",
    };
  }

  const formData = new FormData();
  formData.set("file", input.file);
  formData.set("todo_id", input.todo_id || "");
  // group_no 는 backend 에서 int|None Form — 빈 string 은 int 파싱 실패 (422).
  // null/undefined 면 field 자체를 안 보내야 FastAPI 가 default=None 사용.
  if (input.group_no != null) formData.set("group_no", String(input.group_no));
  formData.set("prj_id", input.prj_id || "");
  formData.set("project_id", input.project_id || "");
  formData.set("activity_id", input.activity_id || "");
  formData.set("job_cd", input.job_cd || "");
  formData.set("farmer_id", input.farmer_id || SAMPLE_USER_CONTEXT.farmer_id);
  formData.set("parcel_no", input.parcel_no || "");
  formData.set("field_id", input.field_id || "");
  formData.set("activity_type", input.activity_type);
  formData.set("evidence_type", input.evidence_type);
  formData.set("confirmed_label", input.confirmed_label || "");
  formData.set("status", input.status || "needs_review");
  formData.set("user_message", input.user_message || "");
  formData.set("gps_lat", input.gps_lat != null ? String(input.gps_lat) : "");
  formData.set("gps_long", input.gps_long != null ? String(input.gps_long) : "");

  try {
    const response = await fetch(`${getApiBaseUrl()}/evidence/upload`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      let errorPayload: unknown = null;
      try {
        errorPayload = await response.json();
      } catch {
        errorPayload = await response.text();
      }
      return { status: "failed", message: extractErrorMessage(errorPayload) };
    }

    const saved = await response.json();
    const record = saved as EvidenceRecord;
    return { status: "success", record, message: "사진 증빙이 업로드되었습니다." };
  } catch {
    return { status: "failed", message: "백엔드에 연결할 수 없습니다. 서버 실행 상태를 확인해 주세요." };
  }
}

export async function getEvidenceMissingStatus(params: {
  activity_type: string;
  farmer_id?: string;
  field_id?: string;
  parcel_no?: string;
  project_id?: string;
  prj_id?: string;
}): Promise<EvidenceMissingStatus> {
  // Missing-status API is backend-only logic, so fail fast outside API mode.
  if (getDataSource() !== "api") {
    throw new Error("사진 업로드는 API 모드에서 사용할 수 있습니다.");
  }

  const searchParams = new URLSearchParams();
  searchParams.set("activity_type", params.activity_type);
  if (params.farmer_id) searchParams.set("farmer_id", params.farmer_id);
  if (params.field_id) searchParams.set("field_id", params.field_id);
  if (params.parcel_no) searchParams.set("parcel_no", params.parcel_no);
  if (params.project_id) searchParams.set("project_id", params.project_id);
  if (params.prj_id) searchParams.set("prj_id", params.prj_id);

  const response = await fetch(`${getApiBaseUrl()}/evidence/missing?${searchParams.toString()}`);
  if (!response.ok) {
    throw new Error("증빙 진행 상태를 불러오지 못했습니다.");
  }

  return (await response.json()) as EvidenceMissingStatus;
}
