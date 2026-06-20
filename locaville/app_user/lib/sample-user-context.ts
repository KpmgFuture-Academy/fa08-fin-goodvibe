// 데모용 사용자 컨텍스트.
// backend `/todo`, `/diary`, `/evidence/upload` 등은 `farmer_id` 하나만 받아
// 내부에서 user_no / amo_regno / group_no 를 동적으로 resolve 합니다. 그래서
// 프론트엔드에는 더 이상 group_no / amo_regno / user_no 를 들고 다닐 필요가 없습니다.
//
// 현 시드 (저탄선도마을 / LOCAVILLE01) 기본 데모 농가 — 김영수:
//   user_no=10000002, amo_regno=1110000002, login_id=ys.kim
//   소속 그룹: group_no=100001 (저탄소농법선도반)
//   참여 사업: KK26A001 (2026년도 저탄소농업 프로그램 시범사업(경종) 상반기)
//
// 데모 로그인 흐름 (시연용):
//   - 카카오 로그인 → 항상 김영수 (resetSampleUser)
//   - 직접 로그인  → 입력한 아이디로 setSampleUser (비밀번호는 어떤 값이든 통과)
//
// backend.identity_repository 가 login_id / farmer_regno / user_no / amo_regno
// 어떤 형태든 받아 정규화하므로, 사용자가 친 ID 가 시드 농가의 어느 식별자든 동작.

const STORAGE_KEY_ID = "locaville:demo-farmer-id";
const STORAGE_KEY_NAME = "locaville:demo-farmer-name";

const DEFAULT_USER = {
  farmer_id: "1110000002",
  farmer_name: "김영수",
  worker_name: "김영수",
  ville_id: "LOCAVILLE01",
};

// 객체 reference 는 고정. 안의 필드만 in-place 로 mutate 해서, import 한 모듈들이
// 다음에 `.farmer_id` 를 읽을 때 새 값이 보이도록 한다. (page reload 직후 hydrate
// 한 값으로 시작하므로 reactive 갱신은 불필요.)
export const SAMPLE_USER_CONTEXT = { ...DEFAULT_USER };

export const SAMPLE_PROJECT_CONTEXT = {
  prj_id: "KK26A001",
  project_id: "KK26A001",
} as const;

function applyUser(id: string, name?: string) {
  const trimmedId = id.trim();
  const displayName = (name || "").trim() || trimmedId;
  SAMPLE_USER_CONTEXT.farmer_id = trimmedId;
  SAMPLE_USER_CONTEXT.farmer_name = displayName;
  SAMPLE_USER_CONTEXT.worker_name = displayName;
}

/** 직접 로그인 — 입력한 ID 로 데모 컨텍스트 교체. localStorage 에 저장 후 reload 권장. */
export function setSampleUser(input: { farmer_id: string; farmer_name?: string }) {
  applyUser(input.farmer_id, input.farmer_name);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY_ID, SAMPLE_USER_CONTEXT.farmer_id);
    if (input.farmer_name) {
      window.localStorage.setItem(STORAGE_KEY_NAME, input.farmer_name);
    } else {
      window.localStorage.removeItem(STORAGE_KEY_NAME);
    }
  }
}

/** 카카오 로그인 — 기본 김영수 데모 컨텍스트로 복귀. localStorage 에도 명시적으로 저장
 *  (값 자체로 "로그인 됨" 표시가 되어 reload 후 home 진입). */
export function resetSampleUser() {
  SAMPLE_USER_CONTEXT.farmer_id = DEFAULT_USER.farmer_id;
  SAMPLE_USER_CONTEXT.farmer_name = DEFAULT_USER.farmer_name;
  SAMPLE_USER_CONTEXT.worker_name = DEFAULT_USER.worker_name;
  SAMPLE_USER_CONTEXT.ville_id = DEFAULT_USER.ville_id;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY_ID, DEFAULT_USER.farmer_id);
    window.localStorage.setItem(STORAGE_KEY_NAME, DEFAULT_USER.farmer_name);
  }
}

/** 로그인 여부 (localStorage 에 farmer_id 가 저장돼 있는지). SSR 안전. */
export function hasSampleLogin(): boolean {
  if (typeof window === "undefined") return false;
  return !!window.localStorage.getItem(STORAGE_KEY_ID);
}

// 모듈 로드 시 localStorage 에서 hydrate — 이전 세션의 직접 로그인 ID 유지.
if (typeof window !== "undefined") {
  const savedId = window.localStorage.getItem(STORAGE_KEY_ID);
  const savedName = window.localStorage.getItem(STORAGE_KEY_NAME);
  if (savedId) applyUser(savedId, savedName || undefined);
}
