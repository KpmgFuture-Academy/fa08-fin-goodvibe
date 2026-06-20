/** 데이터 소스 토글 (local 모킹 vs backend API) + base URL 헬퍼.
 *  `NEXT_PUBLIC_DATA_SOURCE`, `NEXT_PUBLIC_API_BASE_URL` env 로 조정. */
export type DataSource = "local" | "api";

export function getDataSource(): DataSource {
  return process.env.NEXT_PUBLIC_DATA_SOURCE === "api" ? "api" : "local";
}

export function getApiBaseUrl() {
  return process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
}
