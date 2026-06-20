const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000"

export type AdminProfile = {
  admin_no: number | null
  login_id: string
  name: string
  phone_no: string
  email: string
  status_cd?: string
}

export const ADMIN_PROFILE_CONNECTION_ERROR_MESSAGE =
  "백엔드에 연결할 수 없습니다. FastAPI 서버 실행 상태를 확인해 주세요."

function buildUrl(path: string): string {
  return new URL(path, API_BASE_URL).toString()
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
    throw new Error(ADMIN_PROFILE_CONNECTION_ERROR_MESSAGE)
  }

  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new Error(data?.detail || "관리자 정보를 처리하지 못했습니다.")
  }

  return (await response.json()) as T
}

export async function getAdminProfile(adminNo: number): Promise<AdminProfile> {
  const data = await requestJson<{ admin: AdminProfile }>(buildUrl(`/admin/profile/${adminNo}`))
  return data.admin
}

export async function updateAdminProfile(
  adminNo: number,
  payload: {
    phone_no?: string
    email?: string
    password?: string
  },
): Promise<AdminProfile> {
  const data = await requestJson<{ ok: boolean; admin: AdminProfile }>(
    buildUrl(`/admin/profile/${adminNo}`),
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  )
  return data.admin
}
