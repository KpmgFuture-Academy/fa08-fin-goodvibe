export type AdminSession = {
  admin_no: number | null
  login_id: string
  name: string
  status_cd?: string
}

const STORAGE_KEY = "web_admin.admin_session"

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

export function readAdminSession(): AdminSession | null {
  const storage = getStorage()
  if (!storage) return null
  const raw = storage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as AdminSession
    if (!parsed?.login_id) return null
    return parsed
  } catch {
    return null
  }
}

export function saveAdminSession(session: AdminSession): boolean {
  const storage = getStorage()
  if (!storage) return false
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(session))
    // 이전 localStorage 기반 세션이 남아 있으면 정리해 origin 혼선을 줄입니다.
    window.localStorage.removeItem(STORAGE_KEY)
    return true
  } catch {
    return false
  }
}

export function clearAdminSession(): void {
  const storage = getStorage()
  if (!storage) return
  try {
    storage.removeItem(STORAGE_KEY)
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore storage cleanup failure
  }
}
