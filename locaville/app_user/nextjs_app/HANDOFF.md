# 저탄마을 농가앱 — 프론트 교체 핸드오프

이 폴더(`nextjs_app/`)는 디자인 확정된 프로토타입(`저탄마을 농가앱.html`)을
실제 `app_user` (Next.js + TypeScript + Tailwind) 에 이식하기 위한 변환물입니다.

## 분업
- **디자인(여기서 제공)**: 화면별 표현(presentational) TSX 컴포넌트 + 디자인 토큰.
- **연결(Claude Code가 수행)**: 기존 `lib/` 서비스·`LocavilleApp.tsx` 라우팅·권한/인증·도우미 모드 배선.

## 진행 현황 (앱부터)
- [x] **Phase 0** 디자인 토큰 — `styles/locaville-tokens.css`
- [x] **Phase 1** 홈 (쉬운 화면) — `components/HomeScreen.tsx`
- [x] Phase 1 홈 (표준 화면 목록) — `components/StandardHomeList.tsx`
- [x] Phase 1 모드 선택 — `components/ModeChooser.tsx`
- [x] **Phase 2** 사진/음성/직접 입력 + 완료
  — `PhotoInputScreen.tsx` · `VoiceInputScreen.tsx` · `ManualInputScreen.tsx`
  · `CompletionModal.tsx` · `SaveCompleteScreen.tsx`
- [x] **Phase 3** 영농일지/사업 — `JournalScreen.tsx` · `JournalDetailScreen.tsx` · `BusinessScreens.tsx`
- [x] **Phase 4** 알림/설정/도움말/로그인/도우미
  — `NotificationPanel.tsx`(+`HelperModeTransition`) · `SettingsScreen.tsx` · `HelpScreen.tsx` · `LoginSelectScreen.tsx`

**앱(app_user) 화면 변환 완료.** 다음: `LocavilleApp.tsx` 셸(라우팅·상단바·하단탭·모드 분기)
조립 + 각 컴포넌트를 `lib/` 서비스에 연결(Claude Code).

## 토큰 적용
`styles/locaville-tokens.css` 의 `:root` 변수와 a11y 규칙을 기존
`app/globals.css` 에 병합. 컴포넌트는 arbitrary value 로 참조합니다:
`className="bg-[var(--lv-bg)] text-[color:var(--lv-ink)]"`.
(원하면 Tailwind theme 에 `colors.lv.*` 로 등록해 `bg-lv-bg` 형태로 바꿔도 됩니다.)

## 컴포넌트 계약 (HomeScreen 예시)
기존 `getTodayTodos` 의 `TodoItemApi` 를 그대로 사용합니다. props:
- `todos: TodoItemApi[]` — 미완료, due_date 오름차순.
- `retake: RetakeRequest | null` — evidence 재촬영 요청 1건.
- `parcels: ParcelRef[]` — 필지 라벨.
- `simple: boolean` — `isSimpleMode()`.
- `navigate / onTodoAction / onToggleHelperMode` — 기존 시그니처와 동일.

각 컴포넌트 하단의 "Claude Code 연결 가이드" 주석에 어떤 `lib/` 함수에
물리는지 적어두었습니다.

## 디자인 원칙 (회귀 방지 체크리스트)
- 한 화면 = 주요 행동 1개. "오늘 할 일" 카드가 중심.
- 본문 ≥18px / 제목 ≥24px / 주요 버튼 높이 ≥56px(쉬운 84px).
- 색 + 문구로 상태 표시(색만 금지). 화면 확대 허용(maximum-scale 금지).
- 행정용어 금지 → 생활형 문구("사진 찍고 완료하기", "말로 남겨도 괜찮아요").
- 재촬영은 빨강 아님 → 주황/갈색(`--lv-warn`). 빨강은 삭제/위험 전용.
- AI 자동확정 없음. 저장·확정은 사용자, 검토는 이장님.

## 검증 메모
TSX 는 실제 repo 에서 `tsc`/`next build` 로 최종 검증하세요.

## 셸 + 로딩
- `components/LocavilleApp.tsx` — 라우팅·상단바·하단탭(모드별 3/4)·도우미 띠·알림·로딩 게이트.
  `<LocavilleApp data={...} loading={...} />` 형태로 data 주입.
- `components/HomeLoadingScreen.tsx` — 원본 새싹 일러스트 유지 + 토큰 정렬 + reduced-motion.
  **고정 2.2초 타이머 제거** → 셸이 data 로딩 동안만 표시(최대 2.5초 cap).
(이 변환물은 디자인 확정 HTML 프로토타입과 1:1 대응이며, 레이아웃·문구는
프로토타입에서 이미 시각 검증되었습니다.)
