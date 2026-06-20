/** 작업종류 마스터 — backend `/farm-job/list` 클라이언트.
 *  ManualInputScreen 의 "작업 종류" chips 가 하드코딩 대신 DB 마스터를 따름.
 *
 *  추가: job_cd → 카테고리 매핑. 한 화면에 20+ 개 chip 이 평면 나열되면 고령 사용자가
 *  찾기 어려워, 단계/성격별 6개 카테고리로 그룹화해 표시.
 */
import { getApiBaseUrl } from "./data-source";

export type FarmJobOption = {
  job_cd: string;
  job_name: string;
  /** 제철 윈도우 시작 (MMDD, 예 "0625"). 미설정이면 null/undefined → 상시 작업. */
  start_mmdd?: string | null;
  /** 제철 윈도우 마감 (MMDD). 미설정이면 null/undefined → 상시 작업. */
  end_mmdd?: string | null;
};

let cached: FarmJobOption[] | null = null;

export async function fetchFarmJobOptions(): Promise<FarmJobOption[]> {
  if (cached) return cached;
  const url = new URL("/farm-job/list", getApiBaseUrl());
  try {
    const resp = await fetch(url.toString(), { cache: "no-store" });
    if (!resp.ok) return [];
    const data = (await resp.json()) as { items?: FarmJobOption[] };
    cached = data.items || [];
    return cached;
  } catch {
    return [];
  }
}

// ============================================================
// 제철 윈도우 — start_mmdd ~ end_mmdd (MMDD).
// "직접 입력하기" 가 이맘때 작업을 우선 노출하는 데 사용.
// ============================================================

/** 윈도우가 설정 안 된(상시) 작업인지. start/end 둘 중 하나라도 4자리가 아니면 상시. */
export function isJobYearRound(job: FarmJobOption): boolean {
  const s = (job.start_mmdd || "").trim();
  const e = (job.end_mmdd || "").trim();
  return s.length !== 4 || e.length !== 4;
}

/** 오늘(MMDD)이 작업의 제철 윈도우 안인지. start>end 면 연말 넘김(예 1101~0228).
 *  윈도우 미설정(상시) 작업은 false 반환 — 상시 여부는 isJobYearRound 로 따로 판단. */
export function isJobInSeason(job: FarmJobOption, todayMmdd: string): boolean {
  if (isJobYearRound(job) || todayMmdd.length !== 4) return false;
  const s = (job.start_mmdd || "").trim();
  const e = (job.end_mmdd || "").trim();
  if (s <= e) return todayMmdd >= s && todayMmdd <= e; // 일반 윈도우
  return todayMmdd >= s || todayMmdd <= e;             // 연말 넘김
}

// ============================================================
// 카테고리 — 농사 단계/성격별로 6개 그룹.
// 새 job_cd 가 추가되면 자동 "기타" 로 분류 (매핑 안 됨).
// ============================================================

export type JobCategoryKey =
  | "prepare"   // 준비·이앙 (볍씨~모내기)
  | "water"     // 물·생육 관리 (초기물~논물빼기)
  | "harvest"   // 수확·저장
  | "fertilize" // 시비·방제
  | "check"     // 점검·교육·자재
  | "carbon"    // 저탄소·공동
  | "other";    // 매핑 안 된 새 코드 fallback

const JOB_CATEGORY: Record<string, JobCategoryKey> = {
  // 준비·이앙
  R0001: "prepare", // 볍씨 소독 및 싹틔우기
  R0002: "prepare", // 못자리 설치 및 육묘
  R0003: "prepare", // 논갈이
  R0004: "prepare", // 논둑 다지기
  R0005: "prepare", // 모내기
  // 물·생육 관리
  R0006: "water",   // 초기 물 관리
  R0007: "water",   // 초기 제초
  R0008: "water",   // 중간 물떼기
  R0009: "water",   // 논물 얕게 걸러대기
  R0010: "water",   // 논물 빼기
  // 수확·저장
  R0011: "harvest", // 벼 수확 및 탈곡
  R0012: "harvest", // 벼 건조 및 보관
  // 시비·방제
  A0001: "fertilize", // 비료 주기
  A0002: "fertilize", // 거름 주기
  A0003: "fertilize", // 병해충 방제(농약)
  A0004: "fertilize", // 병해충 방제(기타)
  // 점검·교육·자재
  A0005: "check",   // 영농폐기물 수거
  A0006: "check",   // 작물 생육 점검
  AE001: "check",   // 공익증진 교육 이수
  AP001: "check",   // 농자재 구입
  // 저탄소·공동
  RD001: "carbon",  // 바이오차 투입
  RD002: "carbon",  // 가을갈이
  V0001: "carbon",  // 마을 공동활동
};

export const JOB_CATEGORY_LABELS: Record<JobCategoryKey, string> = {
  prepare: "준비·이앙",
  water: "물·생육 관리",
  harvest: "수확·저장",
  fertilize: "시비·방제",
  check: "점검·교육·자재",
  carbon: "저탄소·공동",
  other: "기타",
};

export const JOB_CATEGORY_ORDER: JobCategoryKey[] = [
  "prepare",
  "water",
  "harvest",
  "fertilize",
  "check",
  "carbon",
  "other",
];

export function getJobCategory(job_cd: string): JobCategoryKey {
  return JOB_CATEGORY[job_cd] || "other";
}

// ============================================================
// 필지-무관 작업 — 영농폐기물 수거, 교육 이수, 자재 구입, 마을 공동활동.
// STT 자동 추천이 이쪽으로 잡히면 필지를 자동으로 비운다 (사용자가 별도 선택 시 그대로).
// ============================================================
const PARCEL_OPTIONAL_JOBS: Set<string> = new Set([
  "A0005", // 영농폐기물 수거
  "A0006", // 작물 생육 점검 (현장이긴 하지만 어느 필지인지 모호한 보고형)
  "AE001", // 공익증진 교육 이수
  "AP001", // 농자재 구입
  "V0001", // 마을 공동활동
]);

export function isParcelOptionalJob(jobCd: string | undefined | null): boolean {
  return Boolean(jobCd && PARCEL_OPTIONAL_JOBS.has(jobCd));
}

// ============================================================
// 영수증 키워드 — backend evidence_service._RECEIPT_KEYWORDS_BY_JOB 의 거울.
// 농가 앱에서 사진 첨부 전 "이 작업은 어떤 영수증인지" 한 줄 안내로 사용.
// ============================================================
const RECEIPT_KEYWORD_HINT_BY_JOB: Record<string, string> = {
  RD001: "바이오차·탄화 관련 영수증",
  A0001: "비료·퇴비 관련 영수증",
  A0002: "거름·유박 관련 영수증",
  A0003: "농약·방제 관련 영수증",
  A0004: "방제 자재 관련 영수증",
  AE001: "교육 이수증",
  AP001: "농자재 영수증",
  R0001: "볍씨·종자 관련 영수증",
  R0002: "못자리·육묘 관련 영수증",
};

/** 작업이 영수증/증명서 첨부를 기대하는지 + 어떤 키워드를 가진 영수증인지 안내. */
export function expectedReceiptHint(jobCd: string | undefined | null): string {
  if (!jobCd) return "";
  return RECEIPT_KEYWORD_HINT_BY_JOB[jobCd] || "";
}

/** 작업 목록을 카테고리별로 그룹화. 빈 카테고리는 제외. */
export function groupJobsByCategory(
  jobs: FarmJobOption[],
): { category: JobCategoryKey; label: string; jobs: FarmJobOption[] }[] {
  const byKey = new Map<JobCategoryKey, FarmJobOption[]>();
  for (const job of jobs) {
    const key = getJobCategory(job.job_cd);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(job);
  }
  return JOB_CATEGORY_ORDER
    .filter((key) => byKey.has(key))
    .map((key) => ({
      category: key,
      label: JOB_CATEGORY_LABELS[key],
      jobs: byKey.get(key) || [],
    }));
}

// ============================================================
// 유사도 매칭 — STT 텍스트와 job_name 의 character overlap.
// "물 빼는 거 했어" → R0010 "논물 빼기" 가 상위로.
// ============================================================

/**
 * 음성 텍스트와 작업명 간 단순 유사도 점수.
 * - 공백/대소문자 정규화 후 작업명의 각 글자가 텍스트에 들어있는 개수를 셈.
 * - 외부 라이브러리 없이 시연용으로 충분. 후속에 embedding 기반(jaro-winkler 등) 으로 교체 여지.
 */
export function scoreJobBySimilarity(text: string, job: FarmJobOption): number {
  const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
  const q = norm(text);
  if (!q) return 0;
  const name = norm(job.job_name || "");
  if (!name) return 0;
  let overlap = 0;
  for (const ch of name) {
    if (q.includes(ch)) overlap += 1;
  }
  // 길이로 정규화 — 짧은 이름이 무의미하게 가산되는 걸 방지.
  return overlap / Math.max(name.length, 1);
}

/** 작업 후보를 유사도 내림차순 정렬. 동점이면 원본 순서 보존. */
export function sortJobsBySimilarity(text: string, jobs: FarmJobOption[]): FarmJobOption[] {
  if (!text.trim()) return [...jobs];
  return [...jobs]
    .map((job, idx) => ({ job, idx, score: scoreJobBySimilarity(text, job) }))
    .sort((a, b) => (b.score - a.score) || (a.idx - b.idx))
    .map((row) => row.job);
}

/** 유사도 최고 작업 1개 (점수 0 이면 null). */
export function pickBestJobBySimilarity(
  text: string,
  jobs: FarmJobOption[],
): FarmJobOption | null {
  if (!text.trim() || jobs.length === 0) return null;
  let best: { job: FarmJobOption; score: number } | null = null;
  for (const job of jobs) {
    const score = scoreJobBySimilarity(text, job);
    if (score > (best?.score ?? 0)) best = { job, score };
  }
  return best && best.score > 0.2 ? best.job : null;
}
