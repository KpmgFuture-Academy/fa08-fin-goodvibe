import type { AdminSession } from "@/lib/admin-auth-storage"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000"

export const ADMIN_AUTH_CONNECTION_ERROR_MESSAGE =
  "백엔드에 연결할 수 없습니다. FastAPI 서버 실행 상태를 확인해 주세요."

function buildUrl(path: string): string {
  return new URL(path, API_BASE_URL).toString()
}

function normalizeAdminSession(data: unknown): AdminSession {
  const root = (data && typeof data === "object" ? data : {}) as Record<string, unknown>
  const candidates: Array<Record<string, unknown>> = []

  if (root.admin && typeof root.admin === "object") {
    candidates.push(root.admin as Record<string, unknown>)
  }
  if (root.data && typeof root.data === "object") {
    candidates.push(root.data as Record<string, unknown>)
  }
  if (root.adminInfo && typeof root.adminInfo === "object") {
    candidates.push(root.adminInfo as Record<string, unknown>)
  }
  candidates.push(root)

  for (const candidate of candidates) {
    const loginId = typeof candidate.login_id === "string" ? candidate.login_id.trim() : ""
    if (!loginId) continue
    return {
      admin_no:
        typeof candidate.admin_no === "number"
          ? candidate.admin_no
          : typeof candidate.admin_no === "string" && candidate.admin_no.trim()
            ? Number(candidate.admin_no)
            : null,
      login_id: loginId,
      name:
        typeof candidate.name === "string" && candidate.name.trim()
          ? candidate.name.trim()
          : loginId,
      status_cd: typeof candidate.status_cd === "string" ? candidate.status_cd : "",
    }
  }

  throw new Error("로그인 응답 형식을 해석하지 못했습니다.")
}

export async function loginAdmin(
  payload: { login_id: string; password: string },
): Promise<AdminSession> {
  let response: Response
  try {
    response = await fetch(buildUrl("/admin/login"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    })
  } catch {
    throw new Error(ADMIN_AUTH_CONNECTION_ERROR_MESSAGE)
  }

  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new Error(data?.detail || "로그인에 실패했습니다.")
  }

  const data = (await response.json()) as unknown
  return normalizeAdminSession(data)
}
