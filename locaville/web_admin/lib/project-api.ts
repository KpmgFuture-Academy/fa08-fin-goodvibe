import type {
  ProjectBaseBusinessListResponse,
  ProjectAdminDetailResponse,
  ProjectJobSetupResponse,
  ProjectAdminListResponse,
  ProjectActivityUpdatePayload,
  ProjectJobUpsertPayload,
  ProjectCreatePayload,
  ProjectCreateResponse,
  ProjectDraftFromDocumentResponse,
  ProjectFromRagActivityResponse,
  ProjectFromRagActivityRulePayload,
  ProjectFromRagActivityRuleResponse,
  ProjectFromRagBasicPayload,
  ProjectFromRagBasicResponse,
} from "@/lib/project-types"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000"

export const PROJECT_ADMIN_CONNECTION_ERROR_MESSAGE =
  "백엔드에 연결할 수 없습니다. FastAPI 서버 실행 상태를 확인해 주세요."

function buildUrl(path: string): string {
  return new URL(path, API_BASE_URL).toString()
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, {
      ...init,
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
    })
  } catch {
    throw new Error(PROJECT_ADMIN_CONNECTION_ERROR_MESSAGE)
  }

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`API ${response.status}: ${text || response.statusText}`)
  }

  return (await response.json()) as T
}

export async function getProjectAdminList(): Promise<ProjectAdminListResponse> {
  return requestJson<ProjectAdminListResponse>(buildUrl("/project"))
}

export async function getProjectAdminDetail(prjId: string): Promise<ProjectAdminDetailResponse> {
  return requestJson<ProjectAdminDetailResponse>(buildUrl(`/project/${encodeURIComponent(prjId)}`))
}

export async function getProjectJobSetup(
  prjId: string,
  activityId: string,
): Promise<ProjectJobSetupResponse> {
  return requestJson<ProjectJobSetupResponse>(
    buildUrl(`/project/${encodeURIComponent(prjId)}/activities/${encodeURIComponent(activityId)}/job-setup`),
  )
}

export async function getProjectBaseBusinesses(): Promise<ProjectBaseBusinessListResponse> {
  return requestJson<ProjectBaseBusinessListResponse>(buildUrl("/project/base-businesses"))
}

export async function createProject(
  payload: ProjectCreatePayload,
): Promise<ProjectCreateResponse> {
  return requestJson<ProjectCreateResponse>(buildUrl("/project"), {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export async function suggestProjectBasicFromRag(
  payload: ProjectFromRagBasicPayload,
): Promise<ProjectFromRagBasicResponse> {
  return requestJson<ProjectFromRagBasicResponse>(buildUrl("/project/from-rag/basic"), {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export async function suggestProjectActivitiesFromRag(
  prjId: string,
): Promise<ProjectFromRagActivityResponse> {
  return requestJson<ProjectFromRagActivityResponse>(
    buildUrl(`/project/${encodeURIComponent(prjId)}/from-rag/activity`),
    {
      method: "POST",
    },
  )
}

export async function suggestProjectActivityRuleFromRag(
  prjId: string,
  payload: ProjectFromRagActivityRulePayload,
): Promise<ProjectFromRagActivityRuleResponse> {
  return requestJson<ProjectFromRagActivityRuleResponse>(
    buildUrl(`/project/${encodeURIComponent(prjId)}/from-rag/activity-rule`),
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  )
}

export async function updateProjectInfo(
  prjId: string,
  payload: {
    project_id?: string | null
    auto_generate_project_id?: boolean
    prj_name: string
    biz_id: string
    exec_year?: number | null
    post_date?: string | null
    issuer?: string | null
    rag_file_id?: string | null
  },
): Promise<{ ok: boolean; prj_id: string }> {
  return requestJson<{ ok: boolean; prj_id: string }>(
    buildUrl(`/project/${encodeURIComponent(prjId)}`),
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  )
}

export async function deleteProjectInfo(
  prjId: string,
): Promise<{ ok: boolean; prj_id: string }> {
  return requestJson<{ ok: boolean; prj_id: string }>(
    buildUrl(`/project/${encodeURIComponent(prjId)}`),
    {
      method: "DELETE",
    },
  )
}

export async function updateProjectActivity(
  prjId: string,
  activityId: string,
  payload: ProjectActivityUpdatePayload,
): Promise<{ ok: boolean; prj_id: string; activity_id: string }> {
  return requestJson<{ ok: boolean; prj_id: string; activity_id: string }>(
    buildUrl(`/project/${encodeURIComponent(prjId)}/activities/${encodeURIComponent(activityId)}`),
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  )
}

export async function createProjectActivity(
  prjId: string,
  payload: ProjectActivityUpdatePayload & { activity_id: string },
): Promise<{ ok: boolean; prj_id: string; activity_id: string }> {
  return requestJson<{ ok: boolean; prj_id: string; activity_id: string }>(
    buildUrl(`/project/${encodeURIComponent(prjId)}/activities`),
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  )
}

export async function deleteProjectActivity(
  prjId: string,
  activityId: string,
): Promise<{ ok: boolean; prj_id: string; activity_id: string }> {
  return requestJson<{ ok: boolean; prj_id: string; activity_id: string }>(
    buildUrl(`/project/${encodeURIComponent(prjId)}/activities/${encodeURIComponent(activityId)}`),
    {
      method: "DELETE",
    },
  )
}

export async function createProjectJob(
  prjId: string,
  activityId: string,
  payload: ProjectJobUpsertPayload,
): Promise<{ ok: boolean; prj_id: string; activity_id: string; job_seq: number }> {
  return requestJson<{ ok: boolean; prj_id: string; activity_id: string; job_seq: number }>(
    buildUrl(`/project/${encodeURIComponent(prjId)}/activities/${encodeURIComponent(activityId)}/jobs`),
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  )
}

export async function updateProjectJob(
  prjId: string,
  activityId: string,
  jobSeq: number,
  payload: ProjectJobUpsertPayload,
): Promise<{ ok: boolean; prj_id: string; activity_id: string; job_seq: number }> {
  return requestJson<{ ok: boolean; prj_id: string; activity_id: string; job_seq: number }>(
    buildUrl(`/project/${encodeURIComponent(prjId)}/activities/${encodeURIComponent(activityId)}/jobs/${jobSeq}`),
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  )
}

export async function deleteProjectJob(
  prjId: string,
  activityId: string,
  jobSeq: number,
): Promise<{ ok: boolean; prj_id: string; activity_id: string; job_seq: number }> {
  return requestJson<{ ok: boolean; prj_id: string; activity_id: string; job_seq: number }>(
    buildUrl(`/project/${encodeURIComponent(prjId)}/activities/${encodeURIComponent(activityId)}/jobs/${jobSeq}`),
    {
      method: "DELETE",
    },
  )
}

// ============================================================
// 사업 시행령 자동 초안 — multipart 업로드 (.pdf / .docx / .hwpx)
// ============================================================

export async function uploadProjectDraftDocument(
  file: File,
): Promise<ProjectDraftFromDocumentResponse> {
  const form = new FormData()
  form.append("file", file)
  let response: Response
  try {
    response = await fetch(buildUrl("/project/draft-from-document"), {
      method: "POST",
      body: form,
      cache: "no-store",
    })
  } catch {
    throw new Error(PROJECT_ADMIN_CONNECTION_ERROR_MESSAGE)
  }
  if (!response.ok) {
    let detail = response.statusText
    try {
      const j = (await response.json()) as { detail?: string }
      if (j?.detail) detail = j.detail
    } catch {
      try {
        detail = await response.text()
      } catch {
        // keep
      }
    }
    throw new Error(`API ${response.status}: ${detail}`)
  }
  return (await response.json()) as ProjectDraftFromDocumentResponse
}
