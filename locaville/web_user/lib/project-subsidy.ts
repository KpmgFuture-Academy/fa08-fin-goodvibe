/**
 * 사업 활동별 지원금 단가 + 증빙 라벨 매핑 (하드코딩).
 *
 * 정확한 단가는 시행 문서의 단가표에서 옴 (2026 저탄소농업 시범사업 경종 상반기):
 *   - 중간 물떼기      15만원/ha
 *   - 논물 얕게 걸러대기 16만원/ha
 *   - 가을갈이         46만원/ha
 *   - 바이오차 투입    36.4만원/ha
 *
 * 향후 RDB 마스터(`subsidy_master`) 로 이관하면 이 파일은 fallback/seed 가 되고,
 * 실제 단가는 backend `/subsidy/...` 로 가져오는 구조로 바뀝니다 (TBD).
 */

export type ActivitySubsidy = {
  /** 화면 표시용 단가 라벨 (예: "15만원/ha") */
  per_ha_label: string
  /** 정량 비교용 — 천원 단위 (필요시 계산) */
  per_ha_thousand_won: number
}

/**
 * job_cd → 단가 매핑.
 * activity_id 가 아닌 job_cd 로 매핑 — backend admin/todo-status 가 job_cd 를 반환하므로.
 */
export const SUBSIDY_BY_JOB_CD: Record<string, ActivitySubsidy> = {
  // 논물관리
  R0008: { per_ha_label: "헥타르당 15만원", per_ha_thousand_won: 150 }, // 중간 물떼기
  R0009: { per_ha_label: "헥타르당 16만원", per_ha_thousand_won: 160 }, // 논물 얕게 걸러대기
  // 논밭농사
  RD001: { per_ha_label: "헥타르당 36만 4천원", per_ha_thousand_won: 364 }, // 바이오차 투입
  RD002: { per_ha_label: "헥타르당 46만원", per_ha_thousand_won: 460 }, // 가을갈이
}

/**
 * 활동명(activity_name) 의 일부 키워드로도 매핑 — backend 가 job_cd 안 주는 케이스 폴백.
 */
export const SUBSIDY_BY_ACTIVITY_KEYWORD: Array<{ match: RegExp; subsidy: ActivitySubsidy }> = [
  { match: /중간\s*물떼기/, subsidy: SUBSIDY_BY_JOB_CD.R0008 },
  { match: /논물\s*얕게\s*걸러대기/, subsidy: SUBSIDY_BY_JOB_CD.R0009 },
  { match: /바이오차/, subsidy: SUBSIDY_BY_JOB_CD.RD001 },
  { match: /가을갈이/, subsidy: SUBSIDY_BY_JOB_CD.RD002 },
]

export function getSubsidyForJob(job_cd?: string, activity_name?: string): ActivitySubsidy | null {
  if (job_cd && SUBSIDY_BY_JOB_CD[job_cd]) return SUBSIDY_BY_JOB_CD[job_cd]
  if (activity_name) {
    const hit = SUBSIDY_BY_ACTIVITY_KEYWORD.find((r) => r.match.test(activity_name))
    if (hit) return hit.subsidy
  }
  return null
}

/**
 * 증빙 코드 → 사람이 읽는 라벨 ("이런 사진을 찍어야 돼요" 안내용).
 * 시행문서의 code_detail(grp_cd='EVIDENCE') 매핑과 동일.
 */
export const EVIDENCE_LABEL_BY_CODE: Record<string, string> = {
  PIC: "대표 작업 사진",
  PIC1: "작업 완료 사진",
  PIC2: "작업 시작 사진",
  PIC3: "작업 중 사진",
  RCT: "구매·이용 영수증",
  RCT1: "현금영수증",
  RCT2: "신용카드 매출전표",
  RCT3: "현금영수증",
  RCT4: "모바일영수증",
  RCT5: "기타 거래 증빙",
  EQP: "시설·장비 설치 사진",
  DST: "구매·시용 사진",
  OTH: "기타 증빙",
  // 옛 라벨 호환 — 일부 todo 마스터에 잔존
  MID_DRAINAGE_START: "중간 물떼기 시작 사진",
  MID_DRAINAGE_END: "중간 물떼기 완료 사진",
  AWD_DRY_FIELD: "물 얕게 걸러댄 논 사진",
  BIOCHAR_BAG: "바이오차 포대 사진",
  BIOCHAR_SPREADING: "바이오차 살포 사진",
  BIOCHAR_INVOICE: "바이오차 구매 영수증",
  AUTUMN_TILLAGE_BEFORE: "가을갈이 전 사진",
  AUTUMN_TILLAGE_AFTER: "가을갈이 후 사진",
  FERTILIZER_USE: "비료 살포 사진",
  PESTICIDE_USE: "방제 사진",
  WASTE_COLLECTION: "영농폐기물 수거 사진",
  EDUCATION_CERT: "교육 이수증",
  CROP_CHECK: "작물 생육 점검 사진",
}

export function getEvidenceLabel(code: string): string {
  return EVIDENCE_LABEL_BY_CODE[code] || code
}
