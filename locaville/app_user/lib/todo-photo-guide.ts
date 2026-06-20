/**
 * todo 작업별 사진 가이드 — 어떤 사진을 어떻게 찍어야 하는지 안내.
 * job_cd 기준 매핑. 매칭 없으면 default 안내.
 *
 * sampleEmoji 는 정식 sample 이미지 (public/example-photos/*.jpg) 가 들어올 때까지
 * 임시 placeholder 로 사용. 추후 sampleImageSrc 필드로 교체 가능.
 */

export type TodoPhotoGuide = {
  /** 큰 안내 제목 */
  title: string;
  /** 한두 문장 짧은 설명 */
  description: string;
  /** "꼭 보여야 하는 것" 체크리스트 (불릿) */
  checkpoints: string[];
  /** 임시 시각 placeholder — 추후 실 사진으로 교체 */
  sampleEmoji: string;
  /** 그라데이션 배경 — placeholder 박스 */
  sampleBackground: string;
};

const GUIDES: Record<string, TodoPhotoGuide> = {
  // 논농사
  R0008: {
    title: "중간 물떼기",
    description: "벼 생육기 중간에 논물을 완전히 빼는 작업이에요. 논바닥이 보이게 찍어주세요.",
    checkpoints: ["논 전체가 보이게", "물이 빠진 바닥이 드러나게", "작업 시작과 끝 각 1장씩"],
    sampleEmoji: "💧",
    sampleBackground: "linear-gradient(135deg, #b3d4e6 0%, #5a8fa8 100%)",
  },
  R0009: {
    title: "논물 얕게 걸러대기",
    description: "논물을 얕게 유지하는 작업이에요. 수면이 보이는 각도로 찍어주세요.",
    checkpoints: ["수면 높이가 보이게", "벼 줄기 일부 함께", "맑은 날 촬영 권장"],
    sampleEmoji: "🌾",
    sampleBackground: "linear-gradient(135deg, #c9e3b8 0%, #6a9c4a 100%)",
  },
  R0010: {
    title: "논물 빼기",
    description: "수확 전 논물을 완전히 빼는 작업이에요. 마른 논바닥이 보이게 찍어주세요.",
    checkpoints: ["바닥이 갈라진 모습", "벼 뿌리 부근", "넓은 각도로 1장"],
    sampleEmoji: "🌾",
    sampleBackground: "linear-gradient(135deg, #d4c294 0%, #8a6f3a 100%)",
  },
  RD001: {
    title: "바이오차 투입",
    description: "바이오차를 논·밭에 살포한 모습이에요. 살포 후 흙 표면이 보이게 찍어주세요.",
    checkpoints: ["살포된 바이오차가 보이게", "투입 전·후 비교 사진", "구입 영수증도 함께"],
    sampleEmoji: "🧴",
    sampleBackground: "linear-gradient(135deg, #c4b094 0%, #6e5a3a 100%)",
  },
  RD002: {
    title: "가을갈이",
    description: "수확 후 토양을 갈아 엎는 작업이에요. 갈아엎은 흙 표면이 보이게 찍어주세요.",
    checkpoints: ["갈아엎은 흙 표면", "넓은 각도로 한 컷", "작업 전·후 비교"],
    sampleEmoji: "🚜",
    sampleBackground: "linear-gradient(135deg, #b39c7a 0%, #6a4f2a 100%)",
  },
  A0005: {
    title: "영농폐기물 수거",
    description: "폐비닐·농약 용기 등을 모은 모습이에요. 모인 폐기물이 잘 보이게 찍어주세요.",
    checkpoints: ["모은 폐기물 더미", "수거 장소(논·밭) 함께", "수거 전·후 비교"],
    sampleEmoji: "♻️",
    sampleBackground: "linear-gradient(135deg, #a8b8a4 0%, #4a6a44 100%)",
  },
  A0006: {
    title: "작물 생육 점검",
    description: "작물의 상태(생장·병해)를 보여주는 사진이에요. 작물 가까이서 찍어주세요.",
    checkpoints: ["잎·줄기가 또렷이", "특이사항 부위는 클로즈업", "맑은 날 촬영"],
    sampleEmoji: "🌱",
    sampleBackground: "linear-gradient(135deg, #c9e3b8 0%, #5a8a3a 100%)",
  },
};

const DEFAULT_GUIDE: TodoPhotoGuide = {
  title: "작업 사진",
  description: "작업 모습이 잘 보이게, 작업 시작과 끝을 1장씩 찍어주세요.",
  checkpoints: ["작업 모습이 또렷이", "넓은 각도로 한 컷", "맑은 날 촬영"],
  sampleEmoji: "📷",
  sampleBackground: "linear-gradient(135deg, #c8d0d8 0%, #6a7a8a 100%)",
};

export function getTodoPhotoGuide(jobCd?: string | null, fallbackTitle?: string | null): TodoPhotoGuide {
  const code = (jobCd || "").trim().toUpperCase();
  if (code && GUIDES[code]) return GUIDES[code];
  // job_cd 매칭 안 되면 fallback title 만 적용
  if (fallbackTitle) {
    return { ...DEFAULT_GUIDE, title: fallbackTitle };
  }
  return DEFAULT_GUIDE;
}
