# 03. APP 사용자 요구사항 후보 분석

## 분석 범위

- 분석 대상: `locaville/app_user`, `locaville/backend`
- 사용자 기준: 농업인 또는 마을주민이 모바일 화면에서 수행하는 행동
- 제외 범위: `locaville/web_user` 및 요구사항 정의서 엑셀 수정
- 보안 기준: `.env` 파일은 읽지 않았고, 민감한 설정값은 포함하지 않음

## APP 구조 요약

- 진입 파일: `locaville/app_user/app/page.tsx`, `locaville/app_user/components/LocavilleApp.tsx`
- 화면 컴포넌트: `locaville/app_user/components/*Screen.tsx`
- API client/service: `locaville/app_user/lib/*-service.ts`, `locaville/app_user/lib/*-repository.ts`
- 타입 정의: `locaville/app_user/lib/*-types.ts`, 일부 service 파일 내부 type
- 데이터 소스 선택: `locaville/app_user/lib/data-source.ts`에서 local/API 모드 선택
- Backend router: `locaville/backend/app/routers/*.py`

## Backend 연동 요약

| APP 서비스/파일 | 호출 함수명 | Endpoint | Backend router | 응답 사용 위치 |
|---|---|---|---|---|
| `lib/todo-service.ts` | `getTodayTodos` | `GET /todo/today` | `backend/app/routers/todo.py` | `HomeScreen`, `JournalScreen`의 오늘 할 일/주간 선택 일자 목록 |
| `lib/diary-repository.ts` | `listDiaryRecords` | `GET /diary` | `backend/app/routers/diary.py` | `LocavilleApp`, `JournalScreen`의 영농일지 목록 |
| `lib/diary-repository.ts` | `getDiaryRecordById` | `GET /diary/{diary_id}` | `backend/app/routers/diary.py` | 일지 상세 조회 후보. 현재 상세 화면은 주로 상위 state record 사용 |
| `lib/diary-repository.ts` | `saveDiaryRecord` | `POST /diary` | `backend/app/routers/diary.py` | `ManualInputScreen`, `VoiceInputScreen` 저장 |
| `lib/evidence-repository.ts` | `listEvidenceRecords` | `GET /evidence` | `backend/app/routers/evidence.py` | `HomeScreen` 재촬영 필요 알림, `BusinessDetailScreen` 증빙 목록 |
| `lib/evidence-repository.ts` | `getEvidenceRecordById` | `GET /evidence/{evidence_id}` | `backend/app/routers/evidence.py` | `JournalDetailScreen` 연결 증빙 이미지 |
| `lib/evidence-service.ts` | `uploadEvidenceFile` | `POST /evidence/upload` | `backend/app/routers/evidence.py` | `PhotoInputScreen` 사진 증빙 업로드 |
| `lib/evidence-service.ts` | `getEvidenceMissingStatus` | `GET /evidence/missing` | `backend/app/routers/evidence.py` | 서비스 함수는 있으나 현재 화면 직접 호출 근거는 확인되지 않음 |
| `lib/business-service.ts` | `fetchFarmerProjects` | `GET /ville-project` | `backend/app/routers/ville_project.py` | `BusinessScreen`, `SettingsScreen` 참여 사업 |
| `components/BusinessDetailScreen.tsx` | `handlePDF` | `GET /reports/project-pdf` | `backend/app/routers/report.py` | 사업 상세 PDF 다운로드 |
| `lib/parcel-service.ts` | `fetchFarmerParcels` | `GET /farmer/{farmer_id}/parcels` | `backend/app/routers/farmer.py` | `ManualInputScreen`, `PhotoInputScreen`, `LocavilleApp` 필지 선택/캐시 |
| `lib/farm-job-service.ts` | `fetchFarmJobOptions` | `GET /farm-job/list` | `backend/app/routers/farm_job.py` | `ManualInputScreen` 작업 종류 선택 |
| `lib/weather-service.ts` | `fetchTodayWeather` | `GET /weather/today` | `backend/app/routers/weather.py` | `WeatherWidget`의 오늘 날씨 |
| `lib/ai-service.ts` | `streamActivityHelp` | `POST /ai/chat/stream` | `backend/app/routers/ai.py` | `HelpScreen` 도움말/챗봇 |
| `lib/ai-service.ts` | `requestOpenAiStt` | `POST /ai/stt` | `backend/app/routers/ai.py` | `VoiceInputScreen` 음성 인식 |
| `lib/ai-service.ts` | `requestOpenAiTts` | `POST /ai/tts` | `backend/app/routers/ai.py` | `VoiceInputScreen` 음성 안내 |
| `lib/ai-service.ts` | `startVoiceSession`, `replyVoiceSession`, `finalizeVoiceSession` | `POST /ai/voice/session/start`, `POST /ai/voice/session/reply`, `POST /ai/voice/session/finalize` | `backend/app/routers/ai.py` | `VoiceInputScreen` 대화형 영농일지 작성 |
| `lib/notification-service.ts` | `fetchFarmerNotifications`, `fetchFarmerUnreadCount`, `markFarmerNotificationRead`, `markAllFarmerNotificationsRead` | `GET/PATCH/POST /farmer/{farmer_id}/notifications*` | `backend/app/routers/farmer.py` | `NotificationPanel`, `LocavilleApp` 알림 뱃지/읽음 처리 |
| `lib/farm-helper-service.ts` | `fetchCurrentHelperRole`, `approveHelperPair` | `GET /farmer/{farmer_id}/farm-helpers/current`, `POST /farmer/{farmer_id}/farm-helpers/{helper_user_no}/{help_seq}/approve` | `backend/app/routers/farmer.py` | `LocavilleApp`, `HelperConsentModal`, 도우미 모드 |
| `lib/user-profile-service.ts` | `fetchCurrentUserProfile` | `GET /user-ville/current-user` | `backend/app/routers/user_ville.py` | `SettingsScreen` 내 정보/마을 정보 |

## 요구사항 후보 표

| 구분 | 화면/기능 | 사용자 행동 | 시스템 처리 | Backend 연동 | 코드 근거 | 요구사항 후보 | 구현상태 | 우선순위 제안 |
|---|---|---|---|---|---|---|---|---|
| APP 진입 | Splash/Login/Home 진입 | 사용자가 앱을 열고 로그인 선택 후 홈으로 이동 | `LocavilleApp`이 화면 state를 전환하고, 홈 진입 시 일지/필지/알림/도우미 정보를 초기 로딩 | 홈 데이터 일부: `/diary`, `/farmer/{id}/parcels`, `/farmer/{id}/notifications/unread-count`, `/farmer/{id}/farm-helpers/current` | `app/page.tsx`, `components/LocavilleApp.tsx`, `components/SplashScreen.tsx`, `components/LoginSelectScreen.tsx`, `components/ManualLoginScreen.tsx` | [입력] 로그인 방식 또는 수동 로그인 정보<br>[처리] 앱 화면 진입, 기본 사용자 context 설정, 홈 데이터 초기 조회<br>[출력] 홈 화면, 알림 수, 도우미 상태<br>[예외] 조회 실패 시 빈 목록/기본 상태 유지<br>[연동] APP 화면 state, Backend 알림/필지/도우미 API<br>[근거] `LocavilleApp.tsx` | 부분구현 | 높음 |
| 홈 | 홈 화면 | 사용자가 오늘 할 일, 날씨, 재촬영 필요 알림을 확인 | 오늘 할 일과 증빙 상태를 조회하고, 날씨 위젯 표시 | `GET /todo/today`, `GET /evidence`, `GET /weather/today` | `components/HomeScreen.tsx`, `components/WeatherWidget.tsx`, `lib/todo-service.ts`, `lib/evidence-service.ts`, `lib/weather-service.ts` | [입력] 사용자 식별자<br>[처리] 오늘 할 일, 재촬영 필요 증빙, 날씨를 조회<br>[출력] 긴급 할 일 카드, 빠른 입력 버튼, 날씨 카드<br>[예외] 로딩 skeleton, 실패 시 빈 목록/날씨 오류 문구<br>[연동] APP / Todo API / Evidence API / Weather API<br>[근거] `HomeScreen.tsx`, `WeatherWidget.tsx` | 구현 | 높음 |
| 오늘 할 일 | 오늘 할 일 확인 | 사용자가 홈에서 오늘 해야 할 작업을 확인 | `computed_status` 우선 표시, 미완료 할 일 정렬 및 중복 제거 | `GET /todo/today?farmer_id=...` | `components/HomeScreen.tsx`, `lib/todo-service.ts`, `backend/app/routers/todo.py` | [입력] farmer_id, 선택 일자 후보<br>[처리] 오늘 할 일 조회, 상태/마감일 기준 정렬<br>[출력] 할 일 제목, 상태, 작업 안내, 기록/사진 행동 버튼<br>[예외] API 실패 시 빈 목록 처리<br>[연동] APP / `/todo/today` / MySQL 기반 To-do 조회 로직<br>[근거] `HomeScreen.tsx`, `todo-service.ts` | 구현 | 높음 |
| To-do 목록 | To-do 목록 | 사용자가 해야 할 작업 목록을 본다 | 현재 APP은 `/todo/today` 기반으로 오늘/선택일 목록만 표시 | `GET /todo/today`; 전체 `GET /todo` 서비스 호출은 APP에서 확인되지 않음 | `components/HomeScreen.tsx`, `components/JournalScreen.tsx`, `lib/todo-service.ts` | [입력] farmer_id, date<br>[처리] 오늘 또는 선택일 To-do 조회<br>[출력] 진행중/완료 작업 목록<br>[예외] 실패 시 빈 목록 표시<br>[연동] APP / `/todo/today`<br>[근거] `JournalScreen.tsx` | 부분구현 | 높음 |
| 이번 주 일정 | 주간 일정 | 사용자가 주간 날짜를 넘기며 일자별 기록/할 일을 확인 | 주간 날짜 UI를 만들고 선택일 기준 일지/오늘 할 일을 필터링 | `GET /todo/today`, `GET /diary` | `components/JournalScreen.tsx`, `lib/todo-service.ts`, `lib/diary-service.ts` | [입력] 주간 이전/다음 버튼, 날짜 선택<br>[처리] 선택 날짜 기준 일지 필터링, To-do 조회<br>[출력] 선택일 기록과 작업 목록<br>[예외] 로딩 skeleton, 빈 데이터 메시지<br>[연동] APP / Diary API / Todo API<br>[근거] `JournalScreen.tsx` | 부분구현 | 중간 |
| 월별 캘린더 | 월별/영농 캘린더 | 사용자가 월별 달력에서 작업/일지를 확인 | 코드상 월별 달력 UI나 월 범위 조회 로직 확인되지 않음 | 없음 | `components/JournalScreen.tsx`에는 주간 UI만 확인 | [입력] 월 이동, 날짜 선택<br>[처리] 월별 작업/일지 집계<br>[출력] 월간 캘린더와 일자별 상태<br>[예외] 빈 월/조회 실패 처리<br>[연동] 필요 시 Todo/Diary 월 범위 API<br>[근거] 코드 근거 없음 | 미구현 | 중간 |
| 영농일지 목록 | 영농일지 목록 | 사용자가 일지 탭에서 작성 기록을 확인 | 상위 앱에서 일지 목록을 조회하고 날짜별 필터링 | `GET /diary?farmer_id=...` | `components/LocavilleApp.tsx`, `components/JournalScreen.tsx`, `lib/diary-repository.ts` | [입력] farmer_id, 선택 날짜<br>[처리] 일지 목록 조회 및 날짜별 필터<br>[출력] 일지 카드, 입력 방식 배지, 상세 이동<br>[예외] 조회 실패 시 빈 목록 유지<br>[연동] APP / `/diary`<br>[근거] `JournalScreen.tsx`, `diary-repository.ts` | 구현 | 높음 |
| 영농일지 작성 | 직접 입력 | 사용자가 필지, 작업 종류, 작업 내용을 입력하고 저장 | 작업 종류/필지를 조회하고, 입력값 검증 후 일지 저장 | `GET /farm-job/list`, `GET /farmer/{id}/parcels`, `POST /diary` | `components/ManualInputScreen.tsx`, `lib/farm-job-service.ts`, `lib/parcel-service.ts`, `lib/diary-service.ts` | [입력] 필지, 작업 종류, 작업 내용, 작업일<br>[처리] 필수값 검증, selected To-do context 반영, DiaryRecord 생성/저장<br>[출력] 저장 완료 모달, 저장 결과 화면<br>[예외] 필수값 누락/저장 실패 메시지<br>[연동] APP / Farm Job API / Parcel API / Diary API<br>[근거] `ManualInputScreen.tsx` | 구현 | 높음 |
| 영농일지 작성 | 음성 대화형 입력 | 사용자가 마이크로 작업 내용을 말하고 확인 후 저장 | 음성 세션 시작, STT/TTS, 대화 응답, 최종 draft를 수동 입력 구조로 변환하여 저장 | `POST /ai/voice/session/*`, `POST /ai/stt`, `POST /ai/tts`, `POST /diary` | `components/VoiceInputScreen.tsx`, `lib/ai-service.ts`, `lib/diary-service.ts` | [입력] 음성, 확인 선택, selected To-do<br>[처리] 음성 인식/질문/답변/최종 확인, 일지 저장<br>[출력] 확인 카드, 저장 완료, 사진 촬영 제안<br>[예외] 마이크 권한 실패, STT/TTS 실패, 음성 세션 실패 시 fallback 안내<br>[연동] APP / AI API / Diary API<br>[근거] `VoiceInputScreen.tsx`, `ai-service.ts` | 구현 | 높음 |
| 영농일지 상세 | 일지 상세 | 사용자가 작성한 일지를 눌러 상세와 연결 사진을 확인 | 선택된 일지 record를 표시하고 연결 증빙 ID별 이미지 조회 | `GET /evidence/{evidence_id}` | `components/JournalDetailScreen.tsx`, `lib/evidence-service.ts`, `lib/evidence-repository.ts` | [입력] diary_id 또는 선택 record<br>[처리] 일지 상세 표시, linked_evidence_ids 조회<br>[출력] 작업 내용, 필지/작업 정보, 연결 증빙 이미지<br>[예외] 증빙 조회 실패 시 사진 없음 상태 표시<br>[연동] APP / Evidence API<br>[근거] `JournalDetailScreen.tsx` | 구현 | 높음 |
| 사진 촬영/첨부 | 사진 선택/촬영 | 사용자가 카메라 또는 파일에서 사진을 선택 | 모바일 카메라 capture 속성, 이미지 미리보기, GPS 수집, 필지 선택 | 업로드 전 단계는 브라우저 API, 필지 조회는 `GET /farmer/{id}/parcels` | `components/PhotoInputScreen.tsx`, `lib/parcel-service.ts` | [입력] 이미지 파일, 필지 선택, 위치 권한<br>[처리] 파일 타입 제한, 미리보기, GPS 좌표 수집<br>[출력] 선택 사진, 위치 상태, 필지 선택 UI<br>[예외] 위치 미지원/거부 안내, 사진 미선택 오류<br>[연동] APP / Browser File API / Geolocation / Parcel API<br>[근거] `PhotoInputScreen.tsx` | 구현 | 높음 |
| 증빙 등록 | 사진 증빙 업로드 | 사용자가 사진 증빙을 등록한다 | FormData로 파일과 메타데이터를 전송하고 업로드 결과를 카드로 표시 | `POST /evidence/upload` | `components/PhotoInputScreen.tsx`, `lib/evidence-service.ts`, `backend/app/routers/evidence.py` | [입력] 사진 파일, farmer_id, project/activity/job/parcel/GPS 메타데이터<br>[처리] API 모드에서 multipart 업로드, local 모드에서는 메타데이터만 저장<br>[출력] 업로드 성공 모달, 방금 등록한 증빙 카드<br>[예외] API 모드 아님, 파일 없음, 업로드 실패 메시지<br>[연동] APP / Evidence Upload API / 파일 저장소<br>[근거] `PhotoInputScreen.tsx`, `evidence-service.ts` | 부분구현 | 높음 |
| 증빙-To-do 연결 | To-do에서 사진 등록 | 사용자가 To-do 카드에서 사진 등록을 누른다 | selectedTodo가 화면 prop으로 전달되지만 업로드 payload에는 고정 todo_id와 일반 활동명이 사용됨 | `POST /evidence/upload` | `components/HomeScreen.tsx`, `components/PhotoInputScreen.tsx` | [입력] 선택한 To-do, 사진<br>[처리] 선택 To-do context를 증빙 메타데이터에 반영해야 함<br>[출력] 해당 To-do와 연결된 증빙<br>[예외] To-do context 누락 시 사용자에게 확인 필요<br>[연동] APP / Todo context / Evidence Upload API<br>[근거] `PhotoInputScreen.tsx`의 `selectedTodo` prop과 `todo_photo_001` payload | 부분구현 | 높음 |
| 저장 완료 | 저장 완료 결과 | 사용자가 저장 완료 후 홈 또는 일지로 이동 | 저장 완료 화면에 입력 방식, 저장 정보, 연결 증빙 여부 표시 | 직접 API 호출 없음. 저장은 이전 화면에서 수행 | `components/SaveCompleteScreen.tsx`, `components/CompletionModal.tsx` | [입력] savedRecord, inputMethod<br>[처리] 저장 결과 요약 구성<br>[출력] 완료 메시지, 입력 방식 배지, 홈/일지 이동 버튼<br>[예외] savedRecord 없을 때 기본 fallback record 표시<br>[연동] APP 화면 state<br>[근거] `SaveCompleteScreen.tsx` | 구현 | 중간 |
| 참여 중인 사업 | 사업 목록 | 사용자가 참여 중인 사업을 확인 | farmer_id로 사업 목록과 활동 목록을 조회 | `GET /ville-project?farmer_id=...` | `components/BusinessScreen.tsx`, `lib/business-service.ts`, `backend/app/routers/ville_project.py` | [입력] farmer_id<br>[처리] 참여 사업 목록 조회<br>[출력] 사업명, 연도, 그룹, 활동 개수, 상세 이동<br>[예외] 로딩/빈 사업 상태 표시<br>[연동] APP / Ville Project API<br>[근거] `BusinessScreen.tsx`, `business-service.ts` | 구현 | 높음 |
| 사업 상세 | 사업 상세/활동/증빙 | 사용자가 사업을 눌러 활동과 증빙을 확인 | 목록에서 선택된 사업 object를 상세에 전달하고, 필요 시 해당 사업 증빙 조회 | `GET /evidence?farmer_id=...&prj_id=...` | `components/BusinessDetailScreen.tsx`, `lib/evidence-service.ts` | [입력] 선택 사업, 증빙 보기 토글<br>[처리] 사업 활동 표시, 사업 키 기준 증빙 필터링<br>[출력] 활동 기간, 증빙 목록, 빈 증빙 안내<br>[예외] 사업 정보 없음, 증빙 조회 실패 toast/상태<br>[연동] APP / Evidence API<br>[근거] `BusinessDetailScreen.tsx` | 구현 | 중간 |
| 자료 다운로드 | PDF 다운로드 | 사용자가 사업 상세에서 PDF를 내려받는다 | 프로젝트 report PDF endpoint를 호출해 blob 다운로드 | `GET /reports/project-pdf?farmer_id=...&prj_id=...` | `components/BusinessDetailScreen.tsx`, `backend/app/routers/report.py` | [입력] farmer_id, prj_id 또는 project_id<br>[처리] PDF 생성 API 호출, blob URL 생성 후 다운로드 트리거<br>[출력] PDF 파일 다운로드, 완료 toast<br>[예외] 요청 실패 시 실패 toast<br>[연동] APP / Reports API<br>[근거] `BusinessDetailScreen.tsx` | 구현 | 중간 |
| 내 정보 | 설정/내 정보 | 사용자가 내 정보, 마을 정보, 참여 사업을 확인 | 사용자/마을 profile과 참여 사업을 조회해 표시 | `GET /user-ville/current-user`, `GET /ville-project` | `components/SettingsScreen.tsx`, `lib/user-profile-service.ts`, `lib/business-service.ts` | [입력] farmer_id<br>[처리] 사용자/마을/사업 정보 조회<br>[출력] 이름, 연락처, 주소, 마을, 참여 사업 수<br>[예외] 조회 실패 시 기본/로딩 문구 표시<br>[연동] APP / User Ville API / Ville Project API<br>[근거] `SettingsScreen.tsx` | 구현 | 중간 |
| 내 정보 수정 | 설정 편집 | 사용자가 비밀번호 확인 후 연락처/주소 등을 수정하려 한다 | 비밀번호 모달과 편집 UI 상태는 있으나 Backend 저장 호출은 확인되지 않음 | 없음 | `components/SettingsScreen.tsx` | [입력] 비밀번호, 수정할 개인정보<br>[처리] 본인 확인 및 수정 저장 필요<br>[출력] 수정 완료/실패 안내<br>[예외] 비밀번호 오류, 저장 실패<br>[연동] 필요 시 User Profile Update API<br>[근거] `SettingsScreen.tsx` | 부분구현 | 중간 |
| 도움말 | 도움말/챗봇 | 사용자가 질문을 입력하거나 빠른 질문을 선택 | 대화 thread를 streaming API로 보내고 답변 토큰을 화면에 누적 | `POST /ai/chat/stream` | `components/HelpScreen.tsx`, `lib/ai-service.ts`, `backend/app/routers/ai.py` | [입력] 질문 텍스트, 빠른 질문 선택<br>[처리] 도움말 대화 stream 요청, 응답 누적 표시<br>[출력] 도움말 답변, 타이핑 상태<br>[예외] API 오류 시 오류 답변/기본 안내<br>[연동] APP / AI Chat Stream API / RAG 후보<br>[근거] `HelpScreen.tsx`, `ai-service.ts` | 구현 | 높음 |
| 도우미 기능 | 농가 도우미 모드 | 도우미 또는 도움 받는 사용자가 동의하고 상대 농가 기준으로 기록한다 | 현재 role/pair 조회, 동의 처리, helper mode on 시 effective farmer_id 전환 | `GET /farmer/{id}/farm-helpers/current`, `POST /farmer/{id}/farm-helpers/{helper_user_no}/{help_seq}/approve` | `components/LocavilleApp.tsx`, `components/HelperConsentModal.tsx`, `lib/farm-helper-service.ts` | [입력] 동의 버튼, 도우미 모드 시작/종료<br>[처리] 도우미 관계 조회/승인, 대상 farmer_id 전환<br>[출력] 도우미 배너, 동의 모달, 대상 농가 기준 화면<br>[예외] 동의 실패 alert, 관계 없음 기본 상태<br>[연동] APP / Farmer Helper API<br>[근거] `LocavilleApp.tsx`, `farm-helper-service.ts` | 구현 | 중간 |
| 알림 | 알림 패널 | 사용자가 알림을 열고 읽음 처리 | 알림 목록/미확인 수 조회, 개별/전체 읽음 처리 | `GET /farmer/{id}/notifications`, `GET /farmer/{id}/notifications/unread-count`, `PATCH /farmer/{id}/notifications/{notice_no}/read`, `POST /farmer/{id}/notifications/read-all` | `components/NotificationPanel.tsx`, `components/LocavilleApp.tsx`, `lib/notification-service.ts` | [입력] 알림 열기, 알림 선택, 모두 읽음<br>[처리] 알림 조회 및 읽음 처리<br>[출력] 알림 목록, 미확인 배지<br>[예외] 조회 실패 시 빈 목록/기본 수치<br>[연동] APP / Farmer Notification API<br>[근거] `NotificationPanel.tsx`, `notification-service.ts` | 구현 | 중간 |
| 농사날씨/농업기상 | 오늘 날씨 | 사용자가 홈에서 날씨를 확인 | 마을/작물 기준 오늘 날씨를 조회하고 아이콘/온도/강수확률 표시 | `GET /weather/today` | `components/WeatherWidget.tsx`, `lib/weather-service.ts`, `backend/app/routers/weather.py` | [입력] ville_id, crop_cd<br>[처리] 오늘 날씨 조회 및 상태 라벨 변환<br>[출력] 날씨 아이콘, 온도, 강수확률, 습도<br>[예외] 로딩, 알 수 없음, 오류 문구<br>[연동] APP / Weather API / 기상 API 연계 Backend<br>[근거] `WeatherWidget.tsx` | 구현 | 중간 |
| 농업기상 상세 | 농업기상 정보 | 사용자가 농업기상 상세 정보를 확인 | APP에서 `/admin/agri-weather` 직접 호출 또는 농업기상 상세 화면 근거는 확인되지 않음 | Backend에는 `GET /admin/agri-weather` 존재하나 APP 호출 없음 | `backend/app/routers/admin.py`, APP 호출 근거 없음 | [입력] 지역/작물 선택<br>[처리] 농업기상 상세 조회<br>[출력] 농업 작업에 맞춘 기상 정보<br>[예외] API 실패/자료 없음<br>[연동] 필요 시 APP / Agri-weather API<br>[근거] APP 코드 근거 없음 | 미구현 | 낮음 |
| 주간 농사정보 | 주간 농사정보 | 사용자가 이번 주 농사 정보를 확인 | APP 화면/서비스 호출 근거는 확인되지 않음 | Backend에는 `GET /admin/weekly-farm-info` 존재하나 APP 호출 없음 | `backend/app/routers/admin.py`, APP 호출 근거 없음 | [입력] 작물/지역/주차<br>[처리] 주간 농사정보 조회<br>[출력] 주간 작업 안내, 주의사항<br>[예외] 자료 없음/조회 실패<br>[연동] 필요 시 APP / Weekly Farm Info API<br>[근거] APP 코드 근거 없음 | 미구현 | 낮음 |
| API 실패/로딩/빈 데이터 | 로딩/오류 UX | 사용자가 네트워크 실패 상황에서도 앱을 사용 | 서비스에서 실패를 빈 배열/null/error 객체로 낮추고 화면에서 skeleton/빈 상태/오류 문구 표시 | 여러 API | `HomeScreen.tsx`, `JournalScreen.tsx`, `BusinessScreen.tsx`, `BusinessDetailScreen.tsx`, `WeatherWidget.tsx`, `ManualInputScreen.tsx`, `PhotoInputScreen.tsx`, `HelpScreen.tsx` | [입력] API 호출 트리거<br>[처리] 로딩 상태, 실패 catch, 빈 데이터 처리<br>[출력] skeleton, 빈 메시지, toast/error 안내<br>[예외] 저장/업로드 실패는 명시 메시지<br>[연동] APP 전반 / Backend API 전반<br>[근거] 화면별 loading/error state | 구현 | 높음 |
| 고령 농업인 UX | 접근성/사용성 | 사용자가 큰 버튼, 음성, 사진 중심으로 쉽게 기록 | 빠른 CTA, 음성 입력, 카메라 자동 진입, 단순 하단 nav, 도우미 모드, 확인 모달 제공 | 기능별 API와 간접 연동 | `HomeScreen.tsx`, `VoiceInputScreen.tsx`, `PhotoInputScreen.tsx`, `SaveCompleteScreen.tsx`, `HelperConsentModal.tsx` | [입력] 큰 버튼, 음성, 사진, 확인 선택<br>[처리] 단순 단계 흐름, 저장 전/후 확인, 도움 받기 모드<br>[출력] 큰 글자/버튼, 명확한 상태 문구, 완료 안내<br>[예외] 권한/실패 시 쉬운 안내<br>[연동] APP UI / AI API / Evidence API / Helper API<br>[근거] 관련 화면 컴포넌트 | 부분구현 | 높음 |

## 구현 확인된 APP 기능

- 홈 화면에서 오늘 할 일, 날씨, 재촬영 필요 증빙, 빠른 기록 버튼 표시
- 오늘 할 일 조회: `GET /todo/today`
- 영농일지 목록/직접 작성/음성 작성/상세 조회 흐름
- 사진 선택/촬영, GPS 수집, 증빙 업로드: `POST /evidence/upload`
- 참여 사업 목록과 사업 상세 내 증빙 목록 확인
- 사업별 PDF 다운로드: `GET /reports/project-pdf`
- 도움말/챗봇 streaming 답변: `POST /ai/chat/stream`
- STT/TTS/대화형 영농일지 작성 API 연동
- 알림 목록/미확인 수/읽음 처리
- 도우미 관계 조회/동의/도우미 모드 전환
- 내 정보/마을 정보 조회

## 부분구현으로 보이는 APP 기능

- 로그인은 화면 전환 중심이며 실제 인증 API 연동 근거는 확인되지 않음
- To-do 목록은 전체 목록보다 오늘/선택일 중심으로 구현됨
- 주간 일정은 주간 날짜 UI와 일지 필터링은 있으나 주간 범위 To-do 조회는 확인되지 않음
- 증빙 업로드는 가능하지만 `PhotoInputScreen`에서 선택 To-do context가 업로드 payload에 충분히 반영되지 않는 부분이 있음
- 내 정보 수정은 편집/비밀번호 UI는 있으나 저장 API 호출은 확인되지 않음
- 고령 농업인 UX는 주요 흐름에 반영되어 있으나 접근성 기준, 폰트 확대 설정, 음성 안내 설정 같은 명시적 비기능 설정은 제한적임

## 코드상 확인이 어려운 APP 기능

- 실제 로그인/세션/권한 처리
- 개인정보 수정 저장과 비밀번호 검증의 실제 Backend 연동
- 월별 캘린더 또는 월간 영농 캘린더
- APP에서 농업기상 상세 API 사용
- APP에서 주간 농사정보 API 사용
- 자료 다운로드가 PDF 외 첨부자료 다운로드까지 포함되는지 여부

## 요구사항 정의서에 추가할 APP 요구사항 후보

- 농업인은 홈에서 오늘 할 일, 날씨, 미확인/재촬영 증빙을 한 화면에서 확인할 수 있어야 한다.
- 농업인은 To-do 카드에서 직접 입력, 음성 입력, 사진 등록 중 하나를 선택해 기록을 시작할 수 있어야 한다.
- 농업인은 필지와 작업 종류를 선택해 영농일지를 저장할 수 있어야 한다.
- 농업인은 음성 대화로 작업 내용을 입력하고 저장 전 확인할 수 있어야 한다.
- 농업인은 모바일 카메라 또는 파일 첨부로 증빙 사진을 등록할 수 있어야 한다.
- 농업인은 작성한 영농일지 상세에서 연결된 증빙 사진을 확인할 수 있어야 한다.
- 농업인은 참여 중인 사업과 사업별 활동/증빙 현황을 확인할 수 있어야 한다.
- 농업인은 사업별 보고서 PDF를 다운로드할 수 있어야 한다.
- 농업인은 도움말/챗봇을 통해 사업 수행 및 기록 방법을 질문할 수 있어야 한다.
- 농업인은 알림을 확인하고 읽음 처리할 수 있어야 한다.
- 도우미 지정 관계가 있는 사용자는 동의 후 상대 농가 기준으로 기록을 도와줄 수 있어야 한다.

## 다음 단계에서 집중 분석해야 할 파일

- `locaville/app_user/components/PhotoInputScreen.tsx`: selected To-do context가 업로드 metadata에 반영되는지 상세 검토
- `locaville/app_user/components/SettingsScreen.tsx`: 내 정보 수정이 요구사항에 포함될 경우 Backend API 필요 여부 검토
- `locaville/app_user/components/JournalScreen.tsx`: 월별 캘린더 요구사항과 현재 주간 UI 차이 검토
- `locaville/app_user/components/HelpScreen.tsx`: 챗봇 답변 범위와 RAG/정책 문서 연결 범위 검토
- `locaville/backend/app/routers/weather.py`, `locaville/backend/app/routers/admin.py`: APP 날씨/농업기상/주간 농사정보 요구사항 분리 여부 검토

