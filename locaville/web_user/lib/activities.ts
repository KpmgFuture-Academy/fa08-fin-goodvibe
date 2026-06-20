// 마을 활동(저탄소 농업 활동) 5종에 대한 정적 메타데이터.
// backend에서는 job_cd, evidence_type 같은 코드값만 내려오므로,
// 한국어 이름·설명·사진 가이드는 이 파일에서 매핑합니다.
//
// 추가/수정 시: 코드값은 backend 의 todo_mysql_repository._required_evidence_types_by_job 와
// evidence_service 의 _to_evid_cd 매핑과 일치해야 합니다.

export type ActivityCode = "WATER_DN" | "SHALLOW" | "BIOCHAR" | "FALL_TILLAGE" | "WASTE"

export type ActivityDef = {
  code: ActivityCode
  name: string
  shortGuide: string
  /** 정적 예시(모범) 사진 경로 (public/ 기준). 실제 농가 사진이 없을 때 fallback 으로 표시. */
  exampleImage?: string
  /** 미제출 농가 안내 모달의 기본 본문 (마을 단위, 농가명 미포함). */
  noticeBody: string
  evidenceTypes: string[]
  explainer: {
    what: string
    why: string
    farmerTasks: string[]
    photoTips: string[]
  }
}

export const ACTIVITIES: ActivityDef[] = [
  {
    code: "SHALLOW",
    name: "논물얕게걸러대기",
    shortGuide: "논 바닥이 보이고 물이 빠진 상태가 확인되도록 찍어주세요.",
    exampleImage: "/samples/mid-drainage.png",
    noticeBody:
      "지금은 논물얕게걸러대기 증빙 기간입니다. 정해진 기간 동안 논의 물을 얕게 대고, 논 바닥이 보이는 모습을 사진으로 등록해 주세요. 사진은 논 전체 상태가 보이게 찍어 주세요.",
    evidenceTypes: ["AWD_DRY_FIELD"],
    explainer: {
      what:
        "논에 물을 가득 채워두지 않고, 일부 기간 동안 물을 얕게 대거나 잠시 빼서 논 바닥이 살짝 드러나도록 관리하는 방법입니다.",
      why:
        "논에 물이 오래 고여 있으면 메탄가스가 많이 발생합니다. 물을 얕게 대거나 잠시 빼주면 메탄 발생량이 줄어들어 저탄소 농업 효과가 큽니다.",
      farmerTasks: [
        "정해진 기간 동안 논에 물을 얕게 대거나 잠시 빼둡니다.",
        "논 바닥이 살짝 드러난 상태에서 사진을 한 장 찍습니다.",
        "앱에서 「논물얕게걸러대기」 증빙으로 사진을 등록합니다.",
      ],
      photoTips: [
        "논 가운데가 잘 보이는 위치에서 찍습니다.",
        "논 바닥이 보이고 물이 빠진 모습이 분명히 보여야 합니다.",
        "전경 위주로 찍고, 너무 멀리서 찍지 않습니다.",
      ],
    },
  },
  {
    code: "WATER_DN",
    name: "중간 물떼기",
    shortGuide: "물떼기 시작 모습과 끝난 모습을 각각 한 장씩 찍어주세요.",
    exampleImage: "/samples/mid-drainage.png",
    noticeBody:
      "지금은 중간 물떼기 증빙 기간입니다. 물떼기 시작 사진과 종료 사진을 각각 한 장씩 등록해 주세요. 사진은 논 전체 상태가 보이게 찍어 주세요.",
    evidenceTypes: ["MID_DRAINAGE_START", "MID_DRAINAGE_END"],
    explainer: {
      what:
        "벼 농사 도중 일정 기간 동안 논의 물을 완전히 빼서 논 바닥을 말리는 작업입니다.",
      why:
        "물을 떼면 벼 뿌리가 더 깊게 자라고, 메탄가스 발생도 줄어듭니다. 저탄소 농업의 대표적인 활동입니다.",
      farmerTasks: [
        "정해진 기간에 논의 물을 모두 빼냅니다.",
        "물떼기 「시작」 시점과 「끝나는」 시점 각각 사진을 찍습니다.",
        "앱에서 「중간 물떼기 시작」, 「중간 물떼기 종료」로 각각 등록합니다.",
      ],
      photoTips: [
        "시작 사진: 논에 물이 빠지기 시작하는 모습",
        "종료 사진: 논 바닥이 갈라질 정도로 마른 모습",
        "두 장 모두 같은 논의 같은 위치에서 찍으면 좋습니다.",
      ],
    },
  },
  {
    code: "BIOCHAR",
    name: "바이오차 투입",
    shortGuide: "바이오차 포대, 살포 모습, 영수증을 모두 사진으로 남겨주세요.",
    noticeBody:
      "지금은 바이오차 투입 증빙 기간입니다. 바이오차 포대, 논·밭에 뿌리는 모습, 구입 영수증 세 가지를 모두 사진으로 등록해 주세요. 포대 사진은 상표가 잘 보이게 찍어 주세요.",
    evidenceTypes: ["BIOCHAR_BAG", "BIOCHAR_SPREADING", "BIOCHAR_INVOICE"],
    explainer: {
      what:
        "농작물 부산물이나 나무를 산소가 거의 없는 환경에서 태운 「바이오차」를 논·밭에 뿌려 흙에 섞는 작업입니다.",
      why:
        "바이오차는 탄소를 흙 속에 오래 가두는 역할을 합니다. 흙의 비옥도도 높아져 농사에 도움이 됩니다.",
      farmerTasks: [
        "구입한 바이오차 포대를 사진으로 남깁니다.",
        "논·밭에 바이오차를 뿌리는 모습을 사진으로 남깁니다.",
        "바이오차 구입 영수증·세금계산서도 사진으로 남깁니다.",
        "앱에서 「바이오차 포대」, 「바이오차 살포」, 「바이오차 영수증」 세 가지를 모두 등록합니다.",
      ],
      photoTips: [
        "포대 사진: 상표나 제품명이 보이게 찍습니다.",
        "살포 사진: 바이오차가 논·밭에 뿌려진 모습이 잘 보이게 찍습니다.",
        "영수증 사진: 글씨가 또렷이 보이도록 가까이서 찍습니다.",
      ],
    },
  },
  {
    code: "FALL_TILLAGE",
    name: "가을 경운",
    shortGuide: "경운 전과 경운 후의 같은 논·밭 사진을 한 장씩 찍어주세요.",
    noticeBody:
      "지금은 가을 경운 증빙 기간입니다. 경운 전 모습과 경운 후 모습을 같은 위치에서 한 장씩 사진으로 등록해 주세요. 두 사진을 같은 방향으로 찍어 주시면 비교가 쉽습니다.",
    evidenceTypes: ["AUTUMN_TILLAGE_BEFORE", "AUTUMN_TILLAGE_AFTER"],
    explainer: {
      what:
        "가을에 수확이 끝난 논·밭을 트랙터 등으로 갈아엎어 흙을 뒤집는 작업입니다.",
      why:
        "수확 후 남은 짚이나 줄기를 가을에 흙에 묻으면, 겨울 동안 분해되며 메탄가스 발생이 줄어듭니다.",
      farmerTasks: [
        "수확이 끝난 직후, 경운 전 모습을 사진으로 남깁니다.",
        "경운 후, 흙이 뒤집힌 모습을 사진으로 남깁니다.",
        "앱에서 「가을 경운 전」, 「가을 경운 후」로 등록합니다.",
      ],
      photoTips: [
        "두 사진을 같은 위치에서 같은 방향으로 찍으면 비교가 쉽습니다.",
        "경운 전: 짚이나 그루터기가 남아있는 모습",
        "경운 후: 흙이 뒤집혀 있는 모습",
      ],
    },
  },
  {
    code: "WASTE",
    name: "영농폐기물 처리",
    shortGuide: "폐비닐·농약병 등을 모아 수거하는 모습을 찍어주세요.",
    noticeBody:
      "지금은 영농폐기물 처리 증빙 기간입니다. 폐비닐과 농약병 등을 모아 수거 장소에 가져다 둔 모습을 사진으로 등록해 주세요. 폐기물 종류가 잘 보이도록 가까이서 찍어 주세요.",
    evidenceTypes: ["WASTE_COLLECTION"],
    explainer: {
      what:
        "농사 후 남는 폐비닐, 빈 농약병, 비료 포대 등을 모아서 지정된 수거 장소에 가져다 두는 일입니다.",
      why:
        "방치된 영농폐기물은 흙과 물을 오염시킵니다. 정해진 곳에 모아서 처리하면 마을 환경이 깨끗해집니다.",
      farmerTasks: [
        "농사 중 나온 폐비닐, 농약병, 비료 포대를 한곳에 모읍니다.",
        "마을 수거장 또는 정해진 장소로 옮깁니다.",
        "수거 전/후 모습을 사진으로 남깁니다.",
        "앱에서 「폐기물 수거」 증빙으로 등록합니다.",
      ],
      photoTips: [
        "폐기물 종류가 무엇인지 알 수 있도록 가까이서 찍습니다.",
        "수거 장소에 모인 모습이 잘 보이게 찍습니다.",
      ],
    },
  },
]

export const ACTIVITY_BY_CODE: Record<ActivityCode, ActivityDef> = ACTIVITIES.reduce(
  (acc, a) => {
    acc[a.code] = a
    return acc
  },
  {} as Record<ActivityCode, ActivityDef>,
)

// evidence_type → activity code 역매핑
export const ACTIVITY_BY_EVIDENCE_TYPE: Record<string, ActivityCode> = (() => {
  const map: Record<string, ActivityCode> = {}
  for (const a of ACTIVITIES) {
    for (const t of a.evidenceTypes) map[t] = a.code
  }
  return map
})()

export function activityFromJobCd(jobCd: string | null | undefined): ActivityDef | undefined {
  if (!jobCd) return undefined
  const code = jobCd.toUpperCase() as ActivityCode
  return ACTIVITY_BY_CODE[code]
}

export function activityFromEvidenceType(
  evidenceType: string | null | undefined,
): ActivityDef | undefined {
  if (!evidenceType) return undefined
  const code = ACTIVITY_BY_EVIDENCE_TYPE[evidenceType]
  return code ? ACTIVITY_BY_CODE[code] : undefined
}

// 마을 단위 안내 문구 (모달의 기본 본문)
// 활동별 noticeBody에 기한 안내가 있으면 끼워넣고 끝에 마을명을 붙입니다.
export function buildGroupNoticeMessage({
  activity,
  dueLabel,
  villageName = "서호마을",
}: {
  activity: ActivityDef
  dueLabel?: string | null
  villageName?: string
}): string {
  const lines: string[] = []
  lines.push(activity.noticeBody)
  if (dueLabel) {
    lines.push("")
    lines.push(`기한: ${dueLabel}까지`)
  }
  lines.push("")
  lines.push(`- ${villageName} 이장 -`)
  return lines.join("\n")
}
