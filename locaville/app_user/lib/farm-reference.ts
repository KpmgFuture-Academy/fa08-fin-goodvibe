/** 농작업·필지의 정적 정의 + 텍스트 → 작업/필지 추론 헬퍼.
 *
 *  PARCELS 는 voice/manual 텍스트 alias 매칭용 seed 입니다 — display_name/aliases 는 UX 메타.
 *  실제 농가별 필지 권위 데이터(parcel_no/parcel_regno/usage/주소)는 backend
 *  `/farmer/{id}/parcels` 가 제공하고, `lib/parcel-service.ts` 의 모듈 캐시에 담깁니다.
 *  ID 기반 매칭(`parcel-reference.ts`)은 캐시 우선, 빈 캐시일 때만 이 seed 로 폴백합니다. */
export type FarmJob = {
  job_cd: string;
  work_stage: string;
  aliases: string[];
};

export type ParcelRef = {
  /** 사용자 표시·요청 전송용 식별자. 새 DB의 parcel.parcel_regno 와 동일. */
  field_id: string;
  /** parcel.parcel_no (INT) 의 문자열 표현. backend 가 INT 로 정규화. */
  parcel_no: string;
  /** parcel.parcel_regno — 사람이 읽는 필지 코드. */
  parcel_regno: string;
  display_name: string;
  aliases: string[];
};

export const FARM_JOBS: FarmJob[] = [
  { job_cd: "FERTILIZATION", work_stage: "비료 사용", aliases: ["비료", "비료 줬", "거름"] },
  { job_cd: "PEST_CONTROL", work_stage: "병해충 방제", aliases: ["농약", "방제", "소독"] },
  { job_cd: "IRRIGATION", work_stage: "물 관리", aliases: ["물", "물대기", "관수"] },
  { job_cd: "GENERAL", work_stage: "기타 작업", aliases: ["기타", "작업"] },
];

// 현 시드(저탄선도마을 / amo_regno=1110000002 김영수) 필지 기준.
// parcel.parcel_no 는 (amo_regno, parcel_no) 복합키. parcel_regno 는 공식 지번 코드라 사람이
// 식별하기 어려워 field_id 는 비워두고 parcel_no(짧은 정수)만 보낸다 — backend 가 정규화.
export const PARCELS: ParcelRef[] = [
  {
    field_id: "",
    parcel_no: "1",
    parcel_regno: "4677031099-1-0108-0000",
    display_name: "1번 논 (벼)",
    aliases: ["벼논", "1번", "1번 논", "일번", "벼", "rpa", "rice", "3번 논"],
  },
  {
    field_id: "",
    parcel_no: "2",
    parcel_regno: "4677031099-1-0230-0004",
    display_name: "2번 밭 (고추)",
    aliases: ["고추밭", "고추", "밭", "2번", "이번", "dfa"],
  },
];

export function inferFarmJob(text: string): FarmJob | null {
  const normalized = text.trim().toLowerCase();
  for (const job of FARM_JOBS) {
    if (job.aliases.some((alias) => normalized.includes(alias.toLowerCase()))) {
      return job;
    }
  }
  return null;
}

export function inferParcel(text: string): ParcelRef | null {
  const normalized = text.trim().toLowerCase();
  for (const parcel of PARCELS) {
    if (parcel.aliases.some((alias) => normalized.includes(alias.toLowerCase()))) {
      return parcel;
    }
  }
  return null;
}
