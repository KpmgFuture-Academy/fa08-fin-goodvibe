/** v0_farmer 의 todo (오늘의 할 일) API 클라이언트 — backend `/todo`, `/todo/today` 래퍼. */
export type TodoItemApi = {
  todo_id: string;
  group_no: number;
  prj_id: string;
  project_id?: string;
  activity_id: string;
  job_cd: string;
  todo_title: string;
  activity_name: string;
  job_name: string;
  required_evidence_types?: string[];
  parcel_no?: string;
  field_id?: string;
  due_date: string | null;
  start_date: string | null;
  status: "pending" | "in_progress" | "completed" | string;
  computed_status?: "pending" | "in_progress" | "completed" | string;
  remark: string;
};

type TodoListResponse = {
  items: TodoItemApi[];
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toStringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function toOptionalString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function toNullableString(value: unknown) {
  if (typeof value === "string") return value;
  if (value === null) return null;
  return null;
}

function toNumberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function normalizeTodoItem(value: unknown): TodoItemApi | null {
  if (!isRecordObject(value)) return null;

  const todoId = toStringValue(value.todo_id);
  const activityName = toStringValue(value.activity_name);
  const jobName = toStringValue(value.job_name);

  if (!todoId || !activityName) return null;

  return {
    todo_id: todoId,
    group_no: toNumberValue(value.group_no),
    prj_id: toStringValue(value.prj_id) || toStringValue(value.project_id),
    project_id: toStringValue(value.project_id) || toStringValue(value.prj_id),
    activity_id: toStringValue(value.activity_id),
    job_cd: toStringValue(value.job_cd),
    todo_title: toStringValue(value.todo_title) || activityName,
    activity_name: activityName,
    job_name: jobName || activityName,
    required_evidence_types: Array.isArray(value.required_evidence_types)
      ? value.required_evidence_types.filter((item): item is string => typeof item === "string")
      : [],
    parcel_no: toOptionalString(value.parcel_no),
    field_id: toOptionalString(value.field_id),
    due_date: toNullableString(value.due_date),
    start_date: toNullableString(value.start_date),
    status: toStringValue(value.status) || "pending",
    computed_status: toOptionalString(value.computed_status) || toStringValue(value.status) || "pending",
    remark: toStringValue(value.remark) || jobName || activityName,
  };
}

export async function getTodayTodos(params?: {
  farmer_id?: string;
  group_no?: number;
  prj_id?: string;
  activity_id?: string;
  date?: string;
}): Promise<TodoItemApi[]> {
  // Todo API is optional in demos, so any failure returns [] instead of throwing.
  const url = new URL("/todo/today", API_BASE_URL);
  if (params?.farmer_id) url.searchParams.set("farmer_id", params.farmer_id);
  if (params?.group_no != null) url.searchParams.set("group_no", String(params.group_no));
  if (params?.prj_id) url.searchParams.set("prj_id", params.prj_id);
  if (params?.activity_id) url.searchParams.set("activity_id", params.activity_id);
  if (params?.date) url.searchParams.set("date", params.date);

  try {
    const response = await fetch(url.toString(), { cache: "no-store" });
    if (!response.ok) return [];
    const data = (await response.json()) as Partial<TodoListResponse>;
    if (!Array.isArray(data.items)) return [];
    return data.items.map(normalizeTodoItem).filter((item): item is TodoItemApi => item !== null);
  } catch {
    return [];
  }
}

// ====================================================================
// Choice 타입 todo (예: 바이오차 RD001) — 시즌 선택
// ====================================================================

/** backend JOB_SCHEDULE 의 choice 룰 — frontend 만의 거울. 룰 추가는 backend 와 같이. */
export const CHOICE_JOBS: Record<string, { label: string }[]> = {
  RD001: [
    { label: "봄(모내기 전)" },
    { label: "가을(수확 후)" },
  ],
}

export function isChoiceJob(jobCd: string): boolean {
  return Boolean(jobCd && CHOICE_JOBS[jobCd])
}

export function choiceOptionsFor(jobCd: string): { label: string }[] {
  return CHOICE_JOBS[jobCd] || []
}

export async function chooseTodoWindow(payload: {
  farmer_id: string
  prj_id: string
  job_cd: string
  chosen_label: string
}): Promise<{ ok: boolean; est_start_date: string; est_end_date: string } | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/todo/window-choice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    if (!res.ok) return null
    const data = await res.json()
    return { ok: true, est_start_date: data.est_start_date, est_end_date: data.est_end_date }
  } catch {
    return null
  }
}
