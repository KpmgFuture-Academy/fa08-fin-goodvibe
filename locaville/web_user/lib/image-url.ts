/**
 * 증빙 이미지 URL 정규화.
 *
 * backend evidence.image_url 은 다음 세 가지 형태로 올 수 있음:
 *   1) "http://..." 절대 URL — 그대로 사용 가능
 *   2) "/uploads/..." backend 정적 경로 — backend host 를 prefix 로 붙여서 절대 URL 로 변환
 *   3) "/sample/..." 등 시드의 더미 경로 또는 빈 값 — backend 도 v0_chief 도 갖지 않은 자원.
 *      이 경우 화면이 404 를 호출하는 것보다 미리 빈 값을 돌려주어 placeholder 표시.
 *
 * 호출 예:
 *   const url = resolveImageUrl(item.image_url)
 *   {url ? <img src={url} ... /> : <Camera ... /> // placeholder}
 */

const BACKEND_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000"

export function resolveImageUrl(value: string | null | undefined): string {
  const raw = (value || "").trim()
  if (!raw) return ""

  // 1) 절대 URL — 그대로
  if (/^https?:\/\//i.test(raw)) return raw

  // 2) backend 정적 경로 — host prefix
  if (raw.startsWith("/uploads/")) {
    return `${BACKEND_BASE.replace(/\/$/, "")}${raw}`
  }
  // backend 가 uploads/ (앞 슬래시 없이) 만 돌려주는 경우도 보호
  if (raw.startsWith("uploads/")) {
    return `${BACKEND_BASE.replace(/\/$/, "")}/${raw}`
  }

  // 3) 알 수 없는 경로 (시드 /sample/..., 빈 placeholder 등) — placeholder 사용
  return ""
}
