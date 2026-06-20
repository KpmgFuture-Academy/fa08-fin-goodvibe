/**
 * 사이드바 "새 항목" 배지용 헬퍼.
 *
 * 이장님이 영농일지/증빙사진 페이지를 마지막으로 본 시각을 localStorage 에 저장하고,
 * 그 시각 이후 등록된 건수를 backend 에서 받아 사이드바 라벨 옆에 표시한다.
 *
 * - localStorage 키: lastSeen.diary / lastSeen.evidence (ISO 8601 문자열)
 * - 첫 방문 시 기본값: 7일 전 (그 이전 건은 "이미 본 것" 으로 간주해 배지 폭주 방지)
 * - 페이지 진입 시 갱신 → window CustomEvent("sidebar-refresh-counts") 로 Sidebar 가 refetch
 */

const KEY_DIARY = "lastSeen.diary"
const KEY_EVIDENCE = "lastSeen.evidence"

/** 첫 방문 시 기본 since — 너무 옛날 건까지 "새 항목" 으로 잡지 않도록 7일 전. */
function defaultSinceIso(): string {
  const d = new Date()
  d.setDate(d.getDate() - 7)
  return d.toISOString()
}

function readKey(key: string): string {
  if (typeof window === "undefined") return ""
  try {
    const value = window.localStorage.getItem(key)
    if (value && value.trim()) return value
    const fallback = defaultSinceIso()
    window.localStorage.setItem(key, fallback)
    return fallback
  } catch {
    return defaultSinceIso()
  }
}

export function readLastSeenDiary(): string {
  return readKey(KEY_DIARY)
}

export function readLastSeenEvidence(): string {
  return readKey(KEY_EVIDENCE)
}

/** 이장님이 영농일지 페이지를 방문했음을 기록 + 사이드바에 배지 갱신 알림. */
export function markDiarySeen(): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(KEY_DIARY, new Date().toISOString())
    window.dispatchEvent(new CustomEvent("sidebar-refresh-counts"))
  } catch {
    /* localStorage 접근 실패 — 시크릿 모드 등. 배지가 안 갱신될 뿐 다른 영향 없음 */
  }
}

/** 이장님이 증빙사진 페이지를 방문했음을 기록 + 사이드바에 배지 갱신 알림. */
export function markEvidenceSeen(): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(KEY_EVIDENCE, new Date().toISOString())
    window.dispatchEvent(new CustomEvent("sidebar-refresh-counts"))
  } catch {
    /* 무시 */
  }
}
