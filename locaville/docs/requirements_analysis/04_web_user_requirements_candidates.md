# 04. WEB 관리자 요구사항 후보 분석

## 분석 범위

- 분석 대상: `locaville/web_user`, `locaville/backend`
- 사용자 기준: 이장님, 마을 관리자, 운영 관리자가 PC 또는 웹 화면에서 수행하는 행동
- 제외 범위: APP 사용자 기능 분석 및 요구사항 정의서 엑셀 수정
- 보안 기준: `.env` 파일은 읽지 않았고, 민감한 설정값은 포함하지 않음

## WEB 구조 요약

- 진입/레이아웃: `locaville/web_user/app/page.tsx`, `locaville/web_user/app/layout.tsx`, `locaville/web_user/components/Shell.tsx`
- 주요 페이지: `app/dashboard`, `app/residents`, `app/projects`, `app/project`, `app/engage`, `app/journal`, `app/evidence`, `app/farm-helpers`
- 공통 UI: `components/Sidebar.tsx`, `components/Header.tsx`, `components/help/HelpFloatingButton.tsx`
- API client: `lib/admin-api.ts`, `lib/project-admin-api.ts`, `lib/engage-project-api.ts`, `lib/projects.ts`, `lib/ville-project-api.ts`, `lib/farmer-api.ts`, `lib/user-village-context-api.ts`
- Backend router: `backend/app/routers/admin.py`, `project.py`, `engage.py`, `business_management.py`, `diary.py`, `evidence.py`, `ai.py`, `farmer.py`, `user_ville.py`, `ville_project.py`

## Backend 연동 요약

| WEB 파일/서비스 | 호출 함수명 | Endpoint | Backend router | 응답 데이터 사용 위치 |
|---|---|---|---|---|
| `lib/admin-api.ts` | `getAdminSummary` | `GET /admin/summary` | `backend/app/routers/admin.py` | 주민 목록, 농가별 일지/증빙/가입 상태 요약 |
| `lib/admin-api.ts` | `getAdminTodoStatus` | `GET /admin/todo-status` | `backend/app/routers/admin.py` | 대시보드, 사업별 이행률, 주민별 이행 상태, 캘린더 |
| `lib/admin-api.ts` | `getAdminAgriWeather` | `GET /admin/agri-weather` | `backend/app/routers/admin.py` | `Shell` 상단 주간 날씨 strip |
| `lib/admin-api.ts` | `getAdminWeeklyFarmInfo` | `GET /admin/weekly-farm-info` | `backend/app/routers/admin.py` | API client는 있으나 현재 WEB 화면 직접 호출 근거는 확인되지 않음 |
| `lib/admin-api.ts` | `listAdminDiaries` | `GET /diary` | `backend/app/routers/diary.py` | 영농일지 목록, 주민 상세 일지 |
| `lib/admin-api.ts` | `deleteDiary` | `DELETE /admin/diaries/{diary_id}` | `backend/app/routers/admin.py` | 관리자 영농일지 삭제 |
| `lib/admin-api.ts` | `listAdminEvidence` | `GET /evidence` | `backend/app/routers/evidence.py` | 증빙자료 목록, 주민 상세 증빙, 검토 필요 카드 |
| `lib/admin-api.ts` | `getEvidenceById` | `GET /evidence/{evidence_id}` | `backend/app/routers/evidence.py` | 영농일지 상세 패널의 연결 증빙 |
| `lib/admin-api.ts` | `patchEvidenceStatus` | `PATCH /evidence/{evidence_id}` | `backend/app/routers/evidence.py` | 증빙 확인 완료/재촬영 요청 |
| `lib/admin-api.ts` | `deleteEvidence` | `DELETE /admin/evidence/{evidence_id}` | `backend/app/routers/admin.py` | 관리자 증빙 삭제 |
| `lib/admin-api.ts` | `createResident` | `POST /admin/residents` | `backend/app/routers/admin.py` | 주민 추가 |
| `lib/admin-api.ts` | `updateResident` | `PATCH /admin/residents/{amo_regno}` | `backend/app/routers/admin.py` | API client는 있으나 현재 상세 화면은 local state 수정 중심 |
| `lib/admin-api.ts` | `inviteResident` | `POST /admin/residents/{amo_regno}/invite` | `backend/app/routers/admin.py` | 주민 목록 초대/재발송 버튼 |
| `components/residents/AddressSearchPanel.tsx` | `runSearch` | `GET /admin/address-search` | `backend/app/routers/admin.py` | 주민 추가/수정 모달 주소 선택 |
| `lib/projects.ts` | `fetchVillageProjects` | `GET /ville-project` | `backend/app/routers/ville_project.py` | 진행중인 사업 목록/상세 |
| `lib/project-admin-api.ts` | `getProjectAdminList`, `getProjectAdminDetail` | `GET /project`, `GET /project/{prj_id}` | `backend/app/routers/project.py` | 사업관리 목록/상세 |
| `lib/project-admin-api.ts` | `updateProjectInfo`, `updateProjectActivity`, `createProjectActivity` | `PATCH /project/{prj_id}`, `PATCH /project/{prj_id}/activities/{activity_id}`, `POST /project/{prj_id}/activities` | `backend/app/routers/project.py` | 사업 기본정보 수정, 활동 추가/수정 |
| `lib/engage-project-api.ts` | `getEngageProjects`, `getEngageProjectDetail` | `GET /engage/projects`, `GET /engage/projects/{prj_id}` | `backend/app/routers/engage.py` | 참여사업 등록 화면 |
| `lib/engage-project-api.ts` | `registerEngageProjectGroup`, `registerEngageProjectActivities` | `POST /engage/projects/{prj_id}/register`, `POST /engage/projects/{prj_id}/activities/register` | `backend/app/routers/engage.py` | 사업별 단체/활동별 농가 참여 등록 |
| `lib/engage-project-api.ts` | `getEngageProjectTodos`, `createEngageProjectTodos` | `GET /engage/projects/{prj_id}/todos`, `POST /engage/projects/{prj_id}/todos/create` | `backend/app/routers/engage.py` | 농가별 To-do 리스트 조회/생성 |
| `lib/admin-api.ts` | `askHelpStream`, `askHelp`, `requestEvidenceGuide`, `fetchTtsAudio` | `POST /ai/chat/stream`, `POST /ai/chat`, `POST /ai/evidence-guide`, `POST /ai/tts` | `backend/app/routers/ai.py` | 도움말 챗봇, 안내문 다듬기, AI 추천 읽어주기 |
| `lib/admin-api.ts` | `getRecentEvidence`, `getLaggardFarmers`, `notifyLaggardFarmer`, `getAiRecommendation` | `GET /admin/recent-evidence`, `GET /admin/laggard-farmers`, `POST /admin/laggard-farmers/{farmer_id}/notify`, `GET /admin/ai-recommendation` | `backend/app/routers/admin.py` | 대시보드 사진 갤러리, 미이행 농가, 알림 발송, AI 추천 |
| `lib/admin-api.ts` | `listFarmHelpers`, `assignFarmHelper`, `revokeFarmHelper` | `GET /admin/farm-helpers`, `POST /admin/farm-helpers`, `DELETE /admin/farm-helpers/{helper_user_no}/{help_seq}` | `backend/app/routers/admin.py` | 기록 도우미 배정/해제 |
| `lib/user-village-context-api.ts` | `getCurrentUserVillageInfo` | `GET /user-ville/current-user` | `backend/app/routers/user_ville.py` | Shell 마을/사용자 context, 사업 목록 조회 조건 |
| `lib/farmer-api.ts` | `getFarmerParcels` | `GET /farmer/{farmer_id}/parcels` | `backend/app/routers/farmer.py` | 주민 상세 필지/작물 표시 |

## 요구사항 후보 표

| 구분 | 화면/기능 | 관리자 행동 | 시스템 처리 | Backend 연동 | 코드 근거 | 요구사항 후보 | 구현상태 | 우선순위 제안 |
|---|---|---|---|---|---|---|---|---|
| 관리자 진입 | 기본 진입/라우팅 | 관리자가 WEB에 접속한다 | `/` 접속 시 `/dashboard`로 redirect, Shell/Sidebar/Header 렌더링 | Shell에서 `GET /user-ville/current-user`, `GET /admin/agri-weather` | `app/page.tsx`, `components/Shell.tsx`, `components/Header.tsx`, `components/Sidebar.tsx` | [입력] WEB 접속<br>[처리] 대시보드로 이동, 마을/사용자 context와 주간 날씨 로딩<br>[출력] 관리자 레이아웃, 메뉴, 상단 날씨<br>[예외] context 실패 시 미설정 문구 표시<br>[연동] WEB / User Ville API / Agri-weather API<br>[근거] `Shell.tsx`, `page.tsx` | 구현 | 높음 |
| 관리자 로그인 | 로그인/인증 | 관리자가 계정으로 로그인한다 | Backend에는 로그인 API가 있으나 WEB 로그인 화면/호출 근거는 확인되지 않음 | Backend `POST /admin/login`만 확인 | `backend/app/routers/admin.py`, WEB 호출 근거 없음 | [입력] 관리자 ID, 비밀번호<br>[처리] 인증 검증, 세션 또는 토큰 발급 필요<br>[출력] 로그인 성공 후 대시보드 이동<br>[예외] 인증 실패/권한 없음<br>[연동] 필요 시 WEB / Admin Login API<br>[근거] WEB 화면 근거 없음 | 부분구현 | 높음 |
| 마을 대시보드 | 마을 현황 | 관리자가 마을의 할 일, 증빙, 미이행, 추천을 확인 | Todo 상태, 최근 증빙, 미이행 농가, AI 추천을 병렬 조회하고 대시보드 지표로 가공 | `GET /admin/todo-status`, `GET /admin/recent-evidence`, `GET /admin/laggard-farmers`, `GET /admin/ai-recommendation` | `app/dashboard/page.tsx`, `lib/admin-api.ts` | [입력] 새로고침<br>[처리] 대시보드 데이터 조회, 진행/미이행/최근 사진/AI 추천 계산<br>[출력] 마을 현황 카드, 최근 사진, 미이행 농가, 추천 문구<br>[예외] 일부 API 실패 시 fallback 빈 배열, 오류 alert<br>[연동] WEB / Admin API / AI API<br>[근거] `dashboard/page.tsx` | 구현 | 높음 |
| 주민 통계 | 전체/가입/미가입 주민 수 | 관리자가 주민 수와 가입 상태를 확인 | `summary.diaries_by_farmer`와 `status_cd`를 주민 목록으로 변환하고 전체/미가입 수 계산 | `GET /admin/summary`, `GET /admin/todo-status` | `components/residents/VillageResidentsPage.tsx`, `lib/admin-types.ts`, `backend/app/services/admin_service.py` | [입력] 주민 화면 진입<br>[처리] 주민 summary 조회, 가입완료/초대발송/가입대기 라벨 계산<br>[출력] 전체 주민 수, 미가입 수, 주민별 가입 상태<br>[예외] backend 실패 시 샘플 데이터 표시<br>[연동] WEB / Admin Summary API / DB view<br>[근거] `VillageResidentsPage.tsx` | 구현 | 높음 |
| 오늘 할 일 요약 | 대시보드 할 일 요약 | 관리자가 오늘/이번 주 할 일 현황을 확인 | Todo 상태를 기준으로 active activity, 마감, 상태 통계를 계산 | `GET /admin/todo-status` | `app/dashboard/page.tsx`, `components/dashboard/UpcomingActivities.tsx`, `components/dashboard/MissingSummary.tsx` | [입력] 대시보드 진입<br>[처리] todo status 조회 및 상태별 집계<br>[출력] 오늘/이번 주 할 일, 작업 상태 요약<br>[예외] 조회 실패 시 빈 목록 처리<br>[연동] WEB / Admin Todo Status API<br>[근거] `dashboard/page.tsx` | 구현 | 높음 |
| 미완료/지연 요약 | 미이행 농가 | 관리자가 최근 미이행 농가를 확인하고 알림을 보낸다 | 최근 기간 미이행 농가 목록 조회, 알림 발송 API 호출 | `GET /admin/laggard-farmers`, `POST /admin/laggard-farmers/{farmer_id}/notify` | `app/dashboard/page.tsx`, `components/dashboard/UnsubmittedFarmersCard.tsx`, `lib/admin-api.ts` | [입력] 미이행 농가 알림 버튼<br>[처리] 미이행 목록 조회, 선택 농가에 알림 생성<br>[출력] 미이행 농가 카드, 알림 발송 상태<br>[예외] 발송 실패 시 오류 상태 유지<br>[연동] WEB / Admin Notification API / DB notification<br>[근거] `dashboard/page.tsx` | 구현 | 높음 |
| 사업별 이행률 | 진행중인 사업 | 관리자가 사업별 이행률과 상태를 확인 | 마을 사업 목록 조회 후 사업별 todo status를 조회하여 완료율 계산 | `GET /ville-project`, `GET /admin/todo-status?prj_id=...` | `app/projects/page.tsx`, `app/projects/[id]/page.tsx`, `components/dashboard/ProjectProgress.tsx`, `lib/projects.ts` | [입력] 사업 목록/상세 진입<br>[처리] 사업 목록과 사업별 todo 상태 조회, 완료율 계산<br>[출력] 사업 카드, 사업별 이행률, 상세 표<br>[예외] 로딩/오류/사업 없음 상태 표시<br>[연동] WEB / Ville Project API / Admin Todo Status API<br>[근거] `projects/page.tsx`, `projects/[id]/page.tsx` | 구현 | 높음 |
| 사업별 그래프/차트 | 대시보드/사업 그래프 | 관리자가 사업별 현황을 시각적으로 비교한다 | 카드, progress bar, pivot table 중심의 시각화 제공 | `GET /admin/todo-status`, `GET /ville-project` | `components/dashboard/ProjectProgress.tsx`, `components/ui/Bar.tsx`, `app/projects/[id]/page.tsx` | [입력] 사업 선택<br>[처리] 이행률/상태 계산<br>[출력] 진행률 bar, 사업별 현황 표<br>[예외] 데이터 없음 메시지<br>[연동] WEB / Admin Todo Status API<br>[근거] `ProjectProgress.tsx`, `Bar.tsx` | 구현 | 중간 |
| 주민 목록 | 주민 목록/검색 | 관리자가 주민 목록을 검색하고 상세로 이동 | summary와 todo status를 결합해 주민 목록 생성, 이름 검색 적용 | `GET /admin/summary`, `GET /admin/todo-status` | `components/residents/VillageResidentsPage.tsx`, `components/residents/ResidentListTable.tsx` | [입력] 검색어, 주민 선택<br>[처리] 주민 목록 조회/검색/상세 state 전환<br>[출력] 주민 표, 가입 상태, 초대 버튼, 상세 이동<br>[예외] backend 실패 시 샘플 표시<br>[연동] WEB / Admin Summary API / Admin Todo Status API<br>[근거] `VillageResidentsPage.tsx` | 구현 | 높음 |
| 주민 상세 | 주민 상세 | 관리자가 주민의 기본정보, 필지, 참여사업, 일지를 확인 | 필지/참여사업/영농일지를 조회하고 탭별로 표시 | `GET /farmer/{farmer_id}/parcels`, `GET /ville-project?farmer_id=...`, `GET /diary?farmer_id=...` | `components/residents/ResidentDetailPage.tsx`, `lib/farmer-api.ts`, `lib/ville-project-api.ts`, `lib/admin-api.ts` | [입력] 주민 선택, 탭 선택, 기간 선택<br>[처리] 주민 관련 필지/사업/일지 조회 및 기간 필터<br>[출력] 주민 상세 카드, 참여사업, 영농일지 표<br>[예외] 일부 조회 실패 시 샘플/오류 문구 표시<br>[연동] WEB / Farmer API / Ville Project API / Diary API<br>[근거] `ResidentDetailPage.tsx` | 구현 | 높음 |
| 주민 추가 | 주민 등록 | 관리자가 주민 정보를 입력해 등록한다 | 주민 추가 모달 입력값을 backend 등록 API로 전송 후 목록 새로고침 | `POST /admin/residents` | `components/residents/VillageResidentsPage.tsx`, `components/residents/ResidentAddModal.tsx`, `lib/admin-api.ts` | [입력] 이름, 연락처, 주소, 필지/작물<br>[처리] 주민 등록 요청, 성공 후 목록 재조회<br>[출력] 등록된 주민 목록 반영<br>[예외] 등록 실패 alert<br>[연동] WEB / Admin Residents API / DB<br>[근거] `VillageResidentsPage.tsx`, `ResidentAddModal.tsx` | 구현 | 높음 |
| 주민 수정 | 주민 정보 수정 | 관리자가 주민 상세에서 정보를 수정한다 | 상세 화면의 수정 모달은 local state만 갱신; API client는 있으나 화면 연결은 확인되지 않음 | API client: `PATCH /admin/residents/{amo_regno}` | `components/residents/ResidentDetailPage.tsx`, `lib/admin-api.ts` | [입력] 수정할 이름/연락처/주소<br>[처리] 현재 화면은 local state 반영, 실제 저장 API 연결 필요<br>[출력] 화면 내 수정값 표시<br>[예외] 저장 실패 처리 필요<br>[연동] 필요 시 WEB / Admin Residents PATCH API<br>[근거] `ResidentDetailPage.tsx` | 부분구현 | 높음 |
| 주민 삭제 | 주민 삭제 | 관리자가 주민을 삭제한다 | WEB 화면 또는 Backend delete endpoint 근거 확인되지 않음 | 없음 | 코드 근거 없음 | [입력] 삭제 대상 주민<br>[처리] 삭제 확인 및 DB 삭제/비활성화 필요<br>[출력] 목록에서 제거 또는 상태 변경<br>[예외] 삭제 실패/권한 오류<br>[연동] 필요 시 WEB / Admin Residents Delete API<br>[근거] 코드 근거 없음 | 미구현 | 중간 |
| 주민 초대 | 초대/가입링크 발송 | 관리자가 주민에게 초대 또는 재발송을 수행한다 | amoRegno가 있는 주민에 대해 invite API 호출, 샘플 주민은 alert만 표시 | `POST /admin/residents/{amo_regno}/invite` | `components/residents/ResidentListTable.tsx`, `lib/admin-api.ts` | [입력] 초대발송/재발송 버튼<br>[처리] 주민 초대 상태 저장<br>[출력] 초대 저장 alert, 가입 상태 라벨<br>[예외] 초대 실패 alert<br>[연동] WEB / Admin Invite API / DB status<br>[근거] `ResidentListTable.tsx` | 구현 | 높음 |
| 사업관리 | 사업관리 목록 | 관리자가 정부/마을 사업 목록을 확인한다 | 프로젝트 목록 API 호출, 테이블 표시, 상세 이동 | `GET /project` | `app/project/page.tsx`, `lib/project-admin-api.ts` | [입력] 사업관리 페이지 진입<br>[처리] 프로젝트 목록 조회<br>[출력] 프로젝트 목록, 상세/등록 버튼<br>[예외] 로딩/오류/빈 목록 표시<br>[연동] WEB / Project API<br>[근거] `project/page.tsx` | 구현 | 중간 |
| 사업 추가 | 프로젝트 신규 등록 | 관리자가 새 프로젝트를 등록한다 | `/project/new` 페이지는 헤더만 있고 실제 입력/저장 흐름은 확인되지 않음 | Backend job/activity create는 일부 있으나 프로젝트 생성 화면/호출 없음 | `app/project/new/page.tsx`, `backend/app/routers/project.py` | [입력] 프로젝트명, 연도, 공고일 등<br>[처리] 신규 프로젝트 생성 필요<br>[출력] 생성 완료 후 상세/목록 이동<br>[예외] 필수값/중복/저장 실패<br>[연동] 필요 시 WEB / Project Create API<br>[근거] `project/new/page.tsx` | 미구현 | 중간 |
| 사업 수정/상세 | 프로젝트 상세/활동 관리 | 관리자가 사업 기본정보와 활동을 수정하거나 활동을 추가한다 | 프로젝트 상세 조회, 기본정보 수정, 활동 추가/수정 API 호출 | `GET /project/{prj_id}`, `PATCH /project/{prj_id}`, `PATCH /project/{prj_id}/activities/{activity_id}`, `POST /project/{prj_id}/activities` | `app/project/[prj_id]/page.tsx`, `lib/project-admin-api.ts` | [입력] 사업명, 연도, 공고일, 활동명, 기간, 보조금, 필지 코드<br>[처리] 입력 검증, project/activity 저장, 재조회<br>[출력] 저장 완료 안내, 상세 정보 갱신<br>[예외] 검증 실패 dialog, API 실패 dialog<br>[연동] WEB / Project API / DB<br>[근거] `project/[prj_id]/page.tsx` | 구현 | 높음 |
| 사업별 참여 주민 관리 | 사업 참여 단체/농가 등록 | 관리자가 사업에 단체를 등록하고 활동별 농가/필지를 선택한다 | 참여사업 상세 조회, 단체 등록, 활동별 농가 등록/수정 | `GET /engage/projects/{prj_id}`, `POST /engage/projects/{prj_id}/register`, `GET /engage/projects/{prj_id}/activities`, `POST /engage/projects/{prj_id}/activities/register` | `app/engage/page.tsx`, `app/engage/[prj_id]/page.tsx`, `lib/engage-project-api.ts` | [입력] 사업, 단체, 활동, 농가, 필지 선택<br>[처리] 참여 단체/활동별 농가 등록 또는 수정<br>[출력] 참여 현황, 등록 결과 안내<br>[예외] 저장 실패 오류 표시<br>[연동] WEB / Engage API / DB<br>[근거] `engage/[prj_id]/page.tsx` | 구현 | 높음 |
| 사업별 이행 현황 | 농가별 To-do 생성/조회 | 관리자가 사업별 농가 To-do를 생성하거나 조회한다 | 참여 등록 후 To-do 생성 API 또는 조회 API 호출 | `GET /engage/projects/{prj_id}/todos`, `POST /engage/projects/{prj_id}/todos/create` | `app/engage/[prj_id]/page.tsx`, `lib/engage-project-api.ts` | [입력] To-do 생성/조회 버튼<br>[처리] 농가별 To-do 생성 또는 기존 목록 조회<br>[출력] To-do 리스트 모달, 생성 건수 안내<br>[예외] 처리 실패 오류 표시<br>[연동] WEB / Engage Todo API / DB<br>[근거] `engage/[prj_id]/page.tsx` | 구현 | 높음 |
| 영농일지 확인 | 관리자 일지 목록 | 관리자가 영농일지를 필터링하고 확인한다 | farmer/status/work_date 필터로 일지 목록 조회, 상세 패널 표시 | `GET /diary`, `DELETE /admin/diaries/{diary_id}` | `app/journal/page.tsx`, `lib/admin-api.ts` | [입력] 농가 ID, 상태, 작업일, 삭제 버튼<br>[처리] 일지 조회, 선택 상세 표시, 삭제 요청<br>[출력] 일지 목록/상세 패널/삭제 상태<br>[예외] 로딩/오류/삭제 실패 표시<br>[연동] WEB / Diary API / Admin Delete API<br>[근거] `journal/page.tsx` | 구현 | 높음 |
| 영농일지 상세 패널 | 일지 상세/사진 | 관리자가 주민 상세에서 일지 내용을 열어 연결 증빙을 확인한다 | linked evidence id로 증빙 조회, 상세 모달 표시 | `GET /evidence/{evidence_id}` | `components/residents/FarmingLogDetailModal.tsx`, `lib/admin-api.ts` | [입력] 일지 선택<br>[처리] 일지 상세와 연결 증빙 조회<br>[출력] 작업 상세, 등록자, 증빙 사진<br>[예외] 사진 조회 실패 메시지<br>[연동] WEB / Evidence API<br>[근거] `FarmingLogDetailModal.tsx` | 구현 | 중간 |
| 사진/증빙 확인 | 증빙자료 목록/상세 | 관리자가 증빙자료를 필터링하고 상세 확인/삭제한다 | evidence 목록 조회, 선택 상세 표시, 관리자 삭제 API 호출 | `GET /evidence`, `DELETE /admin/evidence/{evidence_id}` | `app/evidence/page.tsx`, `lib/admin-api.ts` | [입력] 농가 ID, 상태, 검토 필요 필터, 삭제 버튼<br>[처리] 증빙 목록 조회, 상세 선택, 삭제 요청<br>[출력] 증빙 표, 상세 패널, 이미지, 삭제 상태<br>[예외] 로딩/오류/삭제 실패 표시<br>[연동] WEB / Evidence API / Admin Delete API<br>[근거] `evidence/page.tsx` | 구현 | 높음 |
| 증빙 검토 | 확인 완료/재촬영 요청 | 관리자가 검토 필요 증빙을 확인 완료하거나 재촬영 요청한다 | PATCH로 status와 user_message 업데이트 | `PATCH /evidence/{evidence_id}` | `components/dashboard/ReviewNeededCard.tsx`, `components/dashboard/RetakeRequestModal.tsx`, `lib/admin-api.ts` | [입력] 확인 완료 버튼, 재촬영 요청 메시지<br>[처리] 증빙 상태 변경, 성공 후 목록 새로고침<br>[출력] 성공 상태, 검토 목록 갱신<br>[예외] 상태 저장 실패 alert/error<br>[연동] WEB / Evidence Patch API / DB<br>[근거] `ReviewNeededCard.tsx` | 구현 | 높음 |
| 관리자 캘린더 | 월별 영농 캘린더 | 관리자가 월별 일정과 To-do를 확인한다 | todo status를 calendar event로 변환하고 월 그리드에 표시 | `GET /admin/todo-status` | `components/dashboard/FarmingCalendarSection.tsx`, `app/dashboard/page.tsx` | [입력] 월 이동, 필터 선택, 일정 선택<br>[처리] To-do 기반 event 생성, 필터 적용, 상세 표시<br>[출력] 월별 캘린더, 우선순위/상세 패널<br>[예외] todo에 due date가 없으면 제외<br>[연동] WEB / Admin Todo Status API<br>[근거] `FarmingCalendarSection.tsx` | 구현 | 중간 |
| 날짜별 일정 추가 | 수동 일정 추가/삭제 | 관리자가 날짜별 일정을 직접 추가한다 | 수동 일정은 `localStorage`에 저장되고 backend 연동은 없음 | 없음 | `components/dashboard/FarmingCalendarSection.tsx` | [입력] 일정 제목, 날짜, 유형, 메모<br>[처리] localStorage에 수동 일정 저장/삭제<br>[출력] 캘린더에 수동 일정 표시<br>[예외] 브라우저 저장 실패 가능성 처리 필요<br>[연동] 현재 WEB localStorage만 사용, 향후 Calendar API 필요<br>[근거] `FarmingCalendarSection.tsx` | 부분구현 | 중간 |
| 농사날씨/농업기상 | 상단 주간 날씨 | 관리자가 모든 화면에서 주간 날씨를 확인한다 | Shell에서 농업기상 API를 호출하고 Header에 forecast 표시 | `GET /admin/agri-weather` | `components/Shell.tsx`, `components/Header.tsx`, `lib/admin-api.ts` | [입력] 페이지 진입<br>[처리] 농업기상/주간 forecast 조회<br>[출력] 상단 주간 날씨 strip<br>[예외] 실패 시 날씨 strip 빈 상태<br>[연동] WEB / Admin Agri Weather API / 외부 기상 API Backend<br>[근거] `Shell.tsx`, `Header.tsx` | 구현 | 중간 |
| 주간 농사정보 | 주간 농사정보 | 관리자가 주간 농사정보를 확인한다 | Backend/API client는 있으나 화면에서 `getAdminWeeklyFarmInfo` 직접 호출은 확인되지 않음. 대시보드 문구/AI 추천에 관련 표현은 있음 | API client: `GET /admin/weekly-farm-info` | `lib/admin-api.ts`, `app/dashboard/page.tsx` | [입력] 주간 농사정보 확인<br>[처리] 주간 농사정보 조회 및 화면 표시 필요<br>[출력] 주간 작업 안내/주의사항<br>[예외] 자료 없음/조회 실패<br>[연동] 필요 시 WEB / Weekly Farm Info API<br>[근거] 화면 직접 호출 근거 없음 | 부분구현 | 중간 |
| 주소검색 | 주소 검색/선택 | 관리자가 주민 추가/수정 시 주소를 검색한다 | 주소 검색 panel에서 query를 backend proxy로 요청하고 결과 선택 | `GET /admin/address-search?query=...` | `components/residents/AddressSearchPanel.tsx`, `components/residents/ResidentAddModal.tsx` | [입력] 주소 키워드, 주소 선택<br>[처리] 주소 검색 API 호출, 결과 mapping<br>[출력] 도로명/지번/우편번호 결과<br>[예외] 검색 실패/빈 결과 메시지<br>[연동] WEB / Admin Address Search API / 외부 주소 API Backend<br>[근거] `AddressSearchPanel.tsx` | 구현 | 중간 |
| 문의/챗봇 | 도움말 챗봇 | 관리자가 모든 페이지에서 도움말 버튼으로 질문한다 | floating button으로 HelpChat을 열고 AI chat stream 요청 | `POST /ai/chat/stream`, `POST /ai/chat` | `components/help/HelpFloatingButton.tsx`, `components/help/HelpChat.tsx`, `lib/admin-api.ts` | [입력] 질문 텍스트, 빠른 질문<br>[처리] 도움말 대화 stream 요청<br>[출력] 챗봇 답변, 로딩 상태<br>[예외] API 오류 시 오류 답변<br>[연동] WEB / AI Chat API / RAG 후보<br>[근거] `HelpChat.tsx` | 구현 | 중간 |
| 문의 안내문 | AI 안내문 다듬기 | 관리자가 미제출/증빙 안내 문구를 다듬는다 | 안내문 모달에서 evidence guide API 호출 후 문구 수정 가능 | `POST /ai/evidence-guide` | `components/dashboard/NoticeTemplateModal.tsx`, `lib/admin-api.ts` | [입력] 활동 유형, 누락 증빙 유형, 안내 문구<br>[처리] AI 안내문 생성/다듬기<br>[출력] 수정 가능한 안내 문구<br>[예외] AI 실패 시 기존 문구 유지 필요<br>[연동] WEB / AI Evidence Guide API<br>[근거] `NoticeTemplateModal.tsx` | 구현 | 낮음 |
| 도우미 | 기록 도우미 관리 | 관리자가 도우미와 도움 받는 주민을 배정/해제한다 | 도우미 목록, 주민 목록 조회 후 배정/해제 API 호출 | `GET /admin/farm-helpers`, `POST /admin/farm-helpers`, `DELETE /admin/farm-helpers/{helper_user_no}/{help_seq}`, `GET /admin/summary` | `app/farm-helpers/page.tsx`, `lib/admin-api.ts` | [입력] 도우미, 대상 주민, 종료 예정일<br>[처리] 도우미 관계 생성/해제<br>[출력] 도우미 목록, 승인 상태 chip<br>[예외] 배정/해제 실패 오류<br>[연동] WEB / Admin Farm Helper API / DB<br>[근거] `farm-helpers/page.tsx` | 구현 | 중간 |
| 설정 | 관리자 설정/프로필 | 관리자가 설정 또는 프로필을 수정한다 | Sidebar의 글자 크게 보기 localStorage 토글과 Header 로그아웃 버튼은 있으나 관리자 프로필 설정 화면은 확인되지 않음 | Backend `GET/PATCH /admin/profile/{admin_no}`는 존재하나 WEB 호출 없음 | `components/Sidebar.tsx`, `components/Header.tsx`, `backend/app/routers/admin.py` | [입력] 글자 크게 보기, 로그아웃, 프로필 수정 정보<br>[처리] 현재 글자 크기만 localStorage 저장, 프로필/로그아웃 연동 필요<br>[출력] UI 글자 크기 변경<br>[예외] 설정 저장 실패 처리 필요<br>[연동] 현재 WEB localStorage, 필요 시 Admin Profile API<br>[근거] `Sidebar.tsx`, `Header.tsx` | 부분구현 | 중간 |
| API 실패/로딩/빈 데이터 | 상태 처리 | 관리자가 데이터 조회 실패 상황을 확인한다 | 주요 페이지에서 loading/error/empty state를 표시하고 일부 API는 빈 배열 fallback | 여러 API | `dashboard/page.tsx`, `residents/VillageResidentsPage.tsx`, `journal/page.tsx`, `evidence/page.tsx`, `projects/page.tsx`, `project/[prj_id]/page.tsx`, `engage/[prj_id]/page.tsx` | [입력] 페이지 진입, 새로고침, 저장 버튼<br>[처리] 로딩 상태, 오류 상태, 빈 데이터 상태 처리<br>[출력] loading 문구, alert, EmptyState, fallback 샘플<br>[예외] backend 연결 실패 시 일부 화면 샘플 표시<br>[연동] WEB / Backend API 전반<br>[근거] 각 page loading/error state | 구현 | 높음 |
| PC 관리자 UX | PC 업무형 UI | 관리자가 반복 업무를 PC에서 빠르게 처리한다 | Sidebar, PageHeader, dense table, detail panel, modal, progress bar, badge, 큰 글자 토글 제공 | 기능별 API와 간접 연동 | `components/Sidebar.tsx`, `components/ui/*`, `app/*/page.tsx` | [입력] 메뉴 선택, 필터, 표 행, 모달 입력<br>[처리] 업무별 화면 전환, 상세/목록 병행, 상태 badge 표시<br>[출력] PC 관리자용 표/카드/모달/필터 UI<br>[예외] 좁은 화면/긴 텍스트 대응은 추가 확인 필요<br>[연동] WEB UI / Backend API 전반<br>[근거] `Sidebar.tsx`, `ui/*`, 주요 page | 구현 | 중간 |

## 구현 확인된 WEB 기능

- 대시보드 마을 현황, 사업별 진행률, 최근 증빙, 미이행 농가, AI 추천
- 주민 목록/검색/상세/추가/초대
- 주민 상세의 필지, 참여사업, 영농일지 확인
- 진행중인 사업 목록/상세와 사업별 이행률 확인
- 사업관리 목록/상세, 사업 기본정보 수정, 활동 추가/수정
- 참여사업 단체 등록, 활동별 농가 참여 등록, 농가별 To-do 생성/조회
- 영농일지 목록/상세 패널/삭제
- 증빙자료 목록/상세/검토 상태 변경/삭제
- 관리자 월별 캘린더와 To-do 기반 일정 표시
- 주소검색
- 도움말 챗봇, AI 안내문 다듬기, TTS 읽어주기
- 도우미 배정/해제
- API 실패/로딩/빈 데이터 처리

## 부분구현으로 보이는 WEB 기능

- 관리자 로그인은 backend API만 있고 WEB 로그인 화면/호출이 확인되지 않음
- 주민 수정은 화면 local state 수정 중심이며 `PATCH /admin/residents/{amo_regno}` 연결은 확인되지 않음
- 날짜별 수동 일정은 localStorage 저장이며 backend 일정 저장 API가 없음
- 주간 농사정보는 backend/API client가 있으나 현재 화면 직접 호출 근거가 확인되지 않음
- 설정은 글자 크게 보기 local 토글 중심이며 관리자 프로필/로그아웃 API 연동은 확인되지 않음

## 코드상 확인이 어려운 기능

- 실제 관리자 세션/권한/로그아웃 처리
- 주민 삭제 또는 비활성화 처리
- 프로젝트 자체 신규 생성 API와 WEB 저장 흐름
- 주간 농사정보를 독립 카드로 표시하는 화면
- 날짜별 수동 일정의 서버 영속화
- 초대가 실제 SMS/카카오/가입 링크 발송까지 수행되는지 여부. 코드상 현재는 초대 상태 저장 중심으로 보임

## 요구사항 정의서에 추가할 WEB 요구사항 후보

- 관리자는 마을 대시보드에서 사업 이행률, 미이행 농가, 검토 필요 증빙, 최근 증빙을 확인할 수 있어야 한다.
- 관리자는 주민 목록에서 가입 상태를 확인하고, 주민을 추가하거나 초대 상태를 저장할 수 있어야 한다.
- 관리자는 주민 상세에서 필지, 참여사업, 영농일지, 증빙 정보를 확인할 수 있어야 한다.
- 관리자는 사업별 이행률과 농가별 To-do 이행 현황을 확인할 수 있어야 한다.
- 관리자는 사업별 참여 단체와 활동별 참여 농가/필지를 등록할 수 있어야 한다.
- 관리자는 영농일지와 증빙자료를 검토하고 잘못된 기록을 삭제할 수 있어야 한다.
- 관리자는 증빙자료를 확인 완료 또는 재촬영 요청 상태로 변경할 수 있어야 한다.
- 관리자는 월별 캘린더에서 To-do 기반 일정을 확인하고, 수동 일정을 임시 추가할 수 있어야 한다.
- 관리자는 주소검색을 통해 주민 등록 주소를 선택할 수 있어야 한다.
- 관리자는 도움말 챗봇과 AI 안내문 다듬기 기능을 사용할 수 있어야 한다.
- 관리자는 기록 도우미를 배정하거나 해제할 수 있어야 한다.

## 다음 단계에서 집중 분석해야 할 파일

- `locaville/web_user/components/residents/ResidentDetailPage.tsx`: 주민 수정 API 연결 필요 여부
- `locaville/web_user/components/dashboard/FarmingCalendarSection.tsx`: 수동 일정 서버 저장 요구사항 분리
- `locaville/web_user/app/project/new/page.tsx`: 프로젝트 신규 등록 기능 구현 여부
- `locaville/web_user/app/dashboard/page.tsx`: 주간 농사정보 독립 표시 여부
- `locaville/web_user/components/Header.tsx`: 로그아웃/세션 처리 요구사항
- `locaville/backend/app/routers/admin.py`: 로그인, 프로필, 주민, 농업기상, 주간농사정보 API와 WEB 연결 범위

