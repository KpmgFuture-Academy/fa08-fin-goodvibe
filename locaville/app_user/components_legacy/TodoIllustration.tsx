"use client";

/** todo 카드 안의 손그림 톤 일러스트 — lucide 아이콘 대신 작은 캐릭터.
 *  트랙터 인터스티셜과 같은 톤 (둥근 면 채움 + 부드러운 컬러 + 두꺼운 선 없음).
 *
 *  kind 후보:
 *    - "photo"  : 사진 찍어주세요 — 빨간 카메라
 *    - "water"  : 물 관리 — 푸른 물방울 + 잎
 *    - "sprout" : 작물 관리 — 떡잎 새싹
 *    - "note"   : 영농일지 기록 — 노트북 + 연필
 *    - "alert"  : 그 외 — 따뜻한 종/느낌표
 */

export type TodoIllustrationKind =
  | "photo"
  | "water"
  | "sprout"
  | "note"
  | "alert"
  | "receipt"   // 영수증 (RCT)
  | "certificate"; // 이수증 (EDU)

export function TodoIllustration({
  kind,
  size = 44,
}: {
  kind: TodoIllustrationKind;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 56 56"
      fill="none"
      aria-hidden
    >
      {kind === "photo" && (
        <g>
          {/* 셔터 상단 */}
          <rect x="20" y="13" width="16" height="6" rx="2" fill="#c93f33" />
          {/* 본체 */}
          <rect x="8" y="18" width="40" height="28" rx="6" fill="#e85d4f" />
          {/* 본체 하이라이트 */}
          <rect x="8" y="18" width="40" height="6" rx="6" fill="#ff7d6e" opacity="0.65" />
          {/* 렌즈 외곽 */}
          <circle cx="28" cy="33" r="10" fill="#2f3933" />
          {/* 렌즈 내부 */}
          <circle cx="28" cy="33" r="7" fill="#ffd24d" />
          <circle cx="28" cy="33" r="3.5" fill="#fff8d6" />
          {/* 작은 셔터 버튼 */}
          <circle cx="42" cy="22" r="2" fill="#ffe57a" />
        </g>
      )}

      {kind === "water" && (
        <g>
          {/* 물방울 */}
          <path
            d="M28 8 C 32 14, 40 22, 40 32 C 40 40, 34 46, 28 46 C 22 46, 16 40, 16 32 C 16 22, 24 14, 28 8 Z"
            fill="#5da9dd"
          />
          {/* 하이라이트 */}
          <path d="M22 24 C 24 22, 26 22, 26 26" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.7" />
          {/* 아래 작은 잎 (논물 느낌) */}
          <path d="M14 46 C 18 42, 22 42, 26 46" stroke="#4d8d6a" strokeWidth="2.5" strokeLinecap="round" fill="none" />
          <path d="M30 46 C 34 42, 38 42, 42 46" stroke="#4d8d6a" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        </g>
      )}

      {kind === "sprout" && (
        <g>
          {/* 흙 */}
          <ellipse cx="28" cy="46" rx="16" ry="4" fill="#8b6b3f" opacity="0.45" />
          {/* 줄기 */}
          <path d="M28 44 L 28 24" stroke="#3d7a5a" strokeWidth="3.5" strokeLinecap="round" />
          {/* 왼쪽 잎 */}
          <path d="M28 30 C 18 28, 14 20, 18 16 C 22 18, 28 24, 28 30 Z" fill="#5da97a" />
          {/* 오른쪽 잎 */}
          <path d="M28 26 C 38 24, 42 16, 38 12 C 34 14, 28 20, 28 26 Z" fill="#6fb88c" />
        </g>
      )}

      {kind === "note" && (
        <g>
          {/* 노트 본체 */}
          <rect x="11" y="11" width="30" height="38" rx="4" fill="#faf6ea" stroke="#3d7a5a" strokeWidth="2.5" />
          {/* 위 노란 띠 */}
          <rect x="11" y="11" width="30" height="7" rx="4" fill="#ffd24d" />
          {/* 줄들 */}
          <line x1="17" y1="26" x2="35" y2="26" stroke="#a8b8a3" strokeWidth="2" strokeLinecap="round" />
          <line x1="17" y1="32" x2="35" y2="32" stroke="#a8b8a3" strokeWidth="2" strokeLinecap="round" />
          <line x1="17" y1="38" x2="30" y2="38" stroke="#a8b8a3" strokeWidth="2" strokeLinecap="round" />
          {/* 연필 */}
          <g transform="rotate(35 42 38)">
            <rect x="40" y="20" width="4" height="22" rx="1" fill="#ffb35c" />
            <rect x="40" y="42" width="4" height="3" fill="#2f3933" />
            <path d="M40 20 L 42 17 L 44 20 Z" fill="#e89a3b" />
          </g>
        </g>
      )}

      {kind === "receipt" && (
        <g>
          {/* 종이 본체 — 약간 기울어진 직사각형 */}
          <g transform="rotate(-4 28 28)">
            <rect x="13" y="9" width="30" height="40" rx="2" fill="#ffffff" stroke="#7a5634" strokeWidth="1.5" />
            {/* 아래쪽 톱니 (영수증 느낌) */}
            <path
              d="M13,49 L17,46 L21,49 L25,46 L29,49 L33,46 L37,49 L41,46 L43,49 L43,52 L13,52 Z"
              fill="#ffffff"
              stroke="#7a5634"
              strokeWidth="1.5"
            />
            {/* 상단 가게명 자리 */}
            <rect x="17" y="14" width="22" height="3" rx="1" fill="#2f3933" />
            {/* 줄 항목들 */}
            <line x1="17" y1="22" x2="35" y2="22" stroke="#a8a8a8" strokeWidth="1.2" />
            <line x1="17" y1="27" x2="33" y2="27" stroke="#a8a8a8" strokeWidth="1.2" />
            <line x1="17" y1="32" x2="37" y2="32" stroke="#a8a8a8" strokeWidth="1.2" />
            {/* 합계 — 점선 위 굵은 줄 */}
            <line x1="17" y1="38" x2="39" y2="38" stroke="#7a5634" strokeWidth="1.2" strokeDasharray="1.5 1.5" />
            <text x="17" y="44" fontSize="6" fontWeight="700" fill="#2f3933">₩</text>
            <rect x="24" y="40" width="14" height="3" rx="1" fill="#2f3933" />
          </g>
        </g>
      )}

      {kind === "certificate" && (
        <g>
          {/* 액자 외곽 (가로 직사각형) */}
          <rect x="6" y="11" width="44" height="34" rx="2" fill="#fff7df" stroke="#c89a3a" strokeWidth="1.8" />
          {/* 내부 액자 (이중 테두리) */}
          <rect x="9" y="14" width="38" height="28" rx="1" fill="#ffffff" stroke="#c89a3a" strokeWidth="0.8" />
          {/* 위 메달 — 황금 + 별 */}
          <circle cx="28" cy="20" r="4" fill="#ffd24d" stroke="#c89a3a" strokeWidth="0.8" />
          <path
            d="M28,17.5 L28.9,19.4 L31,19.7 L29.5,21.2 L29.8,23.3 L28,22.3 L26.2,23.3 L26.5,21.2 L25,19.7 L27.1,19.4 Z"
            fill="#c89a3a"
          />
          {/* 리본 — 양쪽 V */}
          <path d="M25,23 L24,28 L26.5,26.5 Z" fill="#c93f33" />
          <path d="M31,23 L32,28 L29.5,26.5 Z" fill="#c93f33" />
          {/* 줄들 — 본문 자리 */}
          <line x1="15" y1="32" x2="41" y2="32" stroke="#c89a3a" strokeWidth="0.8" />
          <line x1="18" y1="36" x2="38" y2="36" stroke="#c89a3a" strokeWidth="0.8" />
          <line x1="20" y1="40" x2="36" y2="40" stroke="#c89a3a" strokeWidth="0.8" />
        </g>
      )}

      {kind === "alert" && (
        <g>
          {/* 종 본체 */}
          <path
            d="M28 10 C 36 10, 40 18, 40 28 L 42 38 L 14 38 L 16 28 C 16 18, 20 10, 28 10 Z"
            fill="#ffd24d"
          />
          <path d="M28 10 C 36 10, 40 18, 40 28" stroke="#e89a3b" strokeWidth="2" fill="none" />
          {/* 종 입구 */}
          <ellipse cx="28" cy="40" rx="14" ry="3" fill="#e89a3b" />
          {/* 종 추 */}
          <circle cx="28" cy="46" r="3.5" fill="#2f3933" />
          {/* 손잡이 */}
          <rect x="26" y="6" width="4" height="5" rx="1.5" fill="#2f3933" />
        </g>
      )}
    </svg>
  );
}

/** todo 의 메타에서 일러스트 종류 추론.
 *  우선순위: required_evidence_types (RCT/EDU) > job_cd / 작업명 키워드 > photo fallback.
 */
export function pickTodoIllustration(input: {
  needPhoto: boolean;
  jobName?: string;
  activityName?: string;
  jobCd?: string;
  requiredEvidenceTypes?: string[];
}): TodoIllustrationKind {
  // 1) 증빙 타입이 명시되어 있으면 우선 사용
  const evid = (input.requiredEvidenceTypes || []).map((s) => (s || "").toUpperCase());
  if (evid.some((e) => e.startsWith("RCT"))) return "receipt";
  if (evid.includes("EDU")) return "certificate";

  // 2) 일반 사진은 작업명 키워드로 더 구체적으로
  if (input.needPhoto) return "photo";
  const text = `${input.jobName || ""} ${input.activityName || ""} ${input.jobCd || ""}`;
  if (/물|관수|배수|논물/.test(text)) return "water";
  if (/파종|이앙|모종|새싹|작물|시비|비료/.test(text)) return "sprout";
  if (/일지|기록|보고/.test(text)) return "note";
  return "note";
}

/** todo 의 메타에서 "필요한 증빙" 의 사용자 친화 라벨/문구 추출.
 *  evidence_type 의 첫 번째 코드를 기준.
 */
export type TodoEvidenceKind = "photo" | "receipt" | "certificate" | "photo_seq";

export function pickTodoEvidenceKind(requiredEvidenceTypes?: string[]): TodoEvidenceKind {
  const evid = (requiredEvidenceTypes || []).map((s) => (s || "").toUpperCase());
  if (evid.some((e) => e.startsWith("RCT"))) return "receipt";
  if (evid.includes("EDU")) return "certificate";
  // PIC2 + PIC1 같이 시작/완료 두 장 필요한 경우
  if (evid.filter((e) => e.startsWith("PIC")).length >= 2) return "photo_seq";
  return "photo";
}

/** evidence kind → 사용자 안내 문구. */
export const TODO_EVIDENCE_LABEL: Record<TodoEvidenceKind, {
  ctaText: string;
  subText: string;
  chipText: string;
}> = {
  photo: {
    ctaText: "사진 찍고 완료하기",
    subText: "사진 한 장만 찍어주세요.",
    chipText: "오늘 할 일",
  },
  photo_seq: {
    ctaText: "사진 찍고 완료하기",
    subText: "작업 시작 / 완료 사진 한 장씩 찍어주세요.",
    chipText: "오늘 할 일",
  },
  receipt: {
    ctaText: "영수증 찍고 완료하기",
    subText: "구입한 영수증 한 장만 찍어주세요.",
    chipText: "오늘 할 일",
  },
  certificate: {
    ctaText: "이수증 찍고 완료하기",
    subText: "교육 이수증 한 장만 찍어주세요.",
    chipText: "오늘 할 일",
  },
};
