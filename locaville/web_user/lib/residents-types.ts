/**
 * 마을주민 (residents) 화면 전용 타입.
 *
 * sunnypark 통합 시 컴포넌트 파일 내부에 흩어져 있던 타입들을 main 컨벤션
 * (`admin-types.ts`, `engage-project-types.ts`) 에 맞춰 한 곳으로 모았습니다.
 *
 * - `Resident` / `ParcelCrop` — 주민 목록·상세·추가/수정 모달이 공통으로 사용.
 * - `FarmingLog` — 영농일지 표 + 일지 상세 모달에서 사용.
 * - `AddressItem` — 주소 검색 패널이 부모에게 반환하는 형식.
 */

/** 필지 1개 + 거기서 키우는 작물 1종. ResidentAddModal 의 동적 행. */
export type ParcelCrop = {
  parcelName: string
  crop: string
}

/** 주민(농가) 1명. backend `FarmerDiarySummary` 를 화면 형태로 어댑팅한 것. */
export type Resident = {
  id: number
  name: string
  phone: string
  signupStatus: "가입대기" | "초대발송" | "가입완료"
  statusAction?: "초대발송" | "재발송"
  project: string
  group: string
  recentRecord?: string
  missingItems?: number
  address?: string
  addressDetail?: string
  parcels?: string[]
  crop?: string
  projects?: string[]
  groups?: string[]
  crops?: string[]
  parcelCrops?: ParcelCrop[]
  // backend 연동용 식별자 (있으면 ResidentDetailPage 가 실제 영농일지·필지를 fetch)
  amoRegno?: string
  villeName?: string
}

/**
 * 영농일지 1건 (화면 표시 형태). backend `AdminDiaryItem` 을 `diaryToFarmingLog`
 * 로 변환해서 만듭니다.
 */
export type FarmingLog = {
  id: string
  datetime: string
  taskName?: string
  farmerNote?: string
  photoCount: number
  projectName?: string
  groupName?: string
  isMissing?: boolean
  hasDetail?: boolean
  author?: string
  // 일지에 연결된 증빙 사진 id 목록 — FarmingLogDetailModal 이 1건 fetch 해 사진 표시.
  evidenceIds?: string[]
  // 일지가 작성된 필지 주소/번호 — 사진 메타 표시용.
  fieldAddress?: string
  parcelNo?: string
}

/** AddressSearchPanel 이 부모(ResidentAddModal)에게 돌려주는 주소 1건. */
export type AddressItem = {
  id: string
  roadAddress: string
  jibunAddress: string
  zipCode: string
}
