import type {
  EngageActivityRegisterResponse,
  EngageActivityViewResponse,
  EngageProjectDetailResponse,
  EngageProjectListResponse,
  EngageProjectRegisterResponse,
  EngageTodoRefreshPreviewResponse,
  EngageTodoRefreshResponse,
  EngageTodoViewResponse,
} from "@/lib/engage-project-types"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000"

export const ENGAGE_PROJECT_CONNECTION_ERROR_MESSAGE =
  "백엔드에 연결할 수 없습니다. FastAPI 서버 실행 상태를 확인해 주세요."

function buildUrl(path: string, query?: Record<string, string | undefined>): string {
  const url = new URL(path, API_BASE_URL)
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value && value.trim() !== "") {
        url.searchParams.set(key, value)
      }
    }
  }
  return url.toString()
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
      cache: "no-store",
    })
  } catch {
    throw new Error(ENGAGE_PROJECT_CONNECTION_ERROR_MESSAGE)
  }

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`API ${response.status}: ${text || response.statusText}`)
  }

  return (await response.json()) as T
}

export async function getEngageProjects(): Promise<EngageProjectListResponse> {
  return requestJson<EngageProjectListResponse>(buildUrl("/engage/projects"))
}

export async function getEngageProjectDetail(prjId: string): Promise<EngageProjectDetailResponse> {
  return requestJson<EngageProjectDetailResponse>(buildUrl(`/engage/projects/${encodeURIComponent(prjId)}`))
}

export async function registerEngageProjectGroup(
  prjId: string,
  groupNo: number,
): Promise<EngageProjectRegisterResponse> {
  return requestJson<EngageProjectRegisterResponse>(buildUrl(`/engage/projects/${encodeURIComponent(prjId)}/register`), {
    method: "POST",
    body: JSON.stringify({ group_no: groupNo }),
  })
}

export async function getEngageProjectActivities(prjId: string): Promise<EngageActivityViewResponse> {
  return requestJson<EngageActivityViewResponse>(
    buildUrl(`/engage/projects/${encodeURIComponent(prjId)}/activities`),
  )
}

export async function registerEngageProjectActivities(
  prjId: string,
  payload: { activity_id: string; selections: Array<{ amo_regno: string; parcel_nos: number[] }> },
): Promise<EngageActivityRegisterResponse> {
  return requestJson<EngageActivityRegisterResponse>(
    buildUrl(`/engage/projects/${encodeURIComponent(prjId)}/activities/register`),
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  )
}

export async function getEngageProjectTodos(prjId: string): Promise<EngageTodoViewResponse> {
  return requestJson<EngageTodoViewResponse>(
    buildUrl(`/engage/projects/${encodeURIComponent(prjId)}/todos`),
  )
}

export async function createEngageProjectTodos(prjId: string): Promise<EngageTodoViewResponse> {
  return requestJson<EngageTodoViewResponse>(
    buildUrl(`/engage/projects/${encodeURIComponent(prjId)}/todos/create`),
    {
      method: "POST",
    },
  )
}

export async function getEngageProjectTodoRefreshPreview(
  prjId: string,
): Promise<EngageTodoRefreshPreviewResponse> {
  return requestJson<EngageTodoRefreshPreviewResponse>(
    buildUrl(`/engage/projects/${encodeURIComponent(prjId)}/todos/refresh-preview`),
  )
}

export async function refreshEngageProjectTodos(prjId: string): Promise<EngageTodoRefreshResponse> {
  return requestJson<EngageTodoRefreshResponse>(
    buildUrl(`/engage/projects/${encodeURIComponent(prjId)}/todos/refresh`),
    {
      method: "POST",
    },
  )
}
