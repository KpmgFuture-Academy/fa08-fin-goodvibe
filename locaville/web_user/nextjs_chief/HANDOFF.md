# 저탄마을 이장님 화면 — 프론트 교체 핸드오프 (web_user)

이 폴더(`nextjs_chief/`)는 디자인 확정 프로토타입(`저탄마을 이장님 화면.html`)을
실제 **`web_user/`** (이장님 데스크톱 대시보드 · Next.js + TS) 에 이식하기 위한 변환물입니다.

> 앱(`app_user`)과 동일한 분업: 여기서는 **표현(presentational) TSX + 토큰**만 제공하고,
> 데이터·라우팅·권한은 Claude Code 가 기존 `lib/admin-api.ts` 에 배선합니다.

## 핵심 IA — "처리함" 중심
기존 대시보드(`app/dashboard/page.tsx`)는 KPI·laggard·캘린더가 세로로 쌓인 운영판입니다.
이 변환물은 그걸 **하나의 "처리함(Inbox)"** 으로 모읍니다: 사진확인·알려줄일·도움연결을
한 큐에 섞고, 위에서부터 처리하면 되는 순서표로 만듭니다.

처리함 한 줄(item)의 종류(kind):
- `review` (사진 확인) — 농가가 올린 증빙 검토 → `getRecentEvidence`
- `nudge`  (알려줄 일) — 미제출/마감임박 농가 독려 → `getLaggardFarmers`
- `helper` (도움 연결) — 기록 도우미 연결/승인 → `listFarmHelpers`

→ Claude Code: 위 3개 소스를 **하나의 InboxItem[] 뷰모델로 합치고** urgency(over/today/week/soon)
순으로 정렬해 `<ProcessingInbox items={...} />` 에 주입하세요. (모델 정의는 컴포넌트 상단 타입 참고.)

## 상태 어휘 (통일 — 회귀 방지)
농가 상태는 **한 세트**로만: `정상 · 지켜보는 중 · 확인 필요 · 도우미 연결`.
- "도움 필요"(능력 판단성) 금지 → **"도우미 연결"**(기록 상태) 로.
- "스마트폰 못 다룸/익숙함" 같은 능력 프레이밍 금지 → 기록이 밀린 사실·관계·근접성으로 표현.
- urgency 색: `over`=빨강(마감 지남), `today/week`=주황, `soon`=중립.
  빨강은 마감 지남/위험에만. 재촬영 요청은 주황(`--lvb-warn`).

## 진행 현황
- [x] **Phase 0** 토큰 — `styles/locaville-chief-tokens.css`
- [x] **Phase 1** 처리함 + 액션 모달 + 마을 진행률
  — `chief-ui.tsx`(타입·프리미티브) · `ProcessingInbox.tsx` · `ChiefModals.tsx`
  · `VillagePulse.tsx` · `ChiefDashboard.tsx`(조립 골격)
- [x] **Phase 2** 마을 명단 / 사업 / 일정 / 농가 상세
  — `VillageScreen.tsx`(농가별·단체별) · `ProgramsScreen.tsx`(목록→상세+참여토글)
  · `CalendarScreen.tsx`(월 달력+마감) · `FarmerDetailScreen.tsx`

**이장님 화면(web_user) 변환 완료.** 셸/사이드바는 기존 `Shell.tsx`/`Sidebar.tsx` 재사용,
각 페이지 본문만 위 컴포넌트로 교체하세요.

## 토큰
`styles/locaville-chief-tokens.css` 의 `:root` 변수를 `web_user` 글로벌 CSS에 병합.
프로토타입의 `--lvb-*` 네이밍을 그대로 유지했습니다(기존 클래스와 충돌 없음).

## 도우미 연결 (중요 변경)
후보 추천 로직 제거 → **마을 주민 전체 명단에서 검색·선택**. 농가가 직접 신청한 건만
"신청함" 배지 + "승인하고 연결", 그 외엔 "연결 요청 보내기". 농가 동의 후 연결됨을 명시.
→ `lib/admin-api.ts` 의 `listFarmHelpers` / `createFarmHelper`(또는 동등) 에 배선.
   주민 명단은 `getVillageResidents` 류로 주입.

## 검증
TSX 는 실제 repo 에서 `tsc`/`next build` 로 최종 검증하세요. 레이아웃·문구는
프로토타입에서 시각 검증 완료.
