import type {
  ProjectAdminDetailResponse,
  ProjectAdminListResponse,
  ProjectActivityUpdatePayload,
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

export async function updateProjectInfo(
  prjId: string,
  payload: {
    prj_name: string
    exec_year?: number | null
    post_date?: string | null
    issuer?: string | null
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
