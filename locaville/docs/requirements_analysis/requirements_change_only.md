# 요구사항 변경 필요 항목만 요약

- 비교 기준: `0602_저탄마을_요구사항정의서.xlsx` 원본 요구사항명과 `locaville/docs/requirements_analysis/current_features_summary.md`
- 작성 범위: 기존 요구사항 전체 재작성 제외, 변경이 필요한 항목만 정리
- 주의: 엑셀은 수정하지 않음, `.env` 및 민감정보는 읽거나 포함하지 않음

## 1. 신규 추가

| APP/WEB 구분 | 기능명 | 변경유형 | 변경해야 하는 이유 | 요구사항 문구 초안 | 코드 근거 파일 |
|---|---|---|---|---|---|
| APP | 홈 오늘 할 일 조회 및 computed_status 표시 | 신규 추가 | 기존 APP 요구사항은 날짜/주간 To-do 중심이고, 현재 홈 첫 화면의 오늘 할 일 API 연동과 computed_status 표시가 명확히 분리되어 있지 않음 | 농업인은 홈 화면에서 오늘 해야 할 작업 목록과 `pending`, `in_progress`, `completed` 상태를 확인할 수 있어야 한다. | `locaville/app_user/components/HomeScreen.tsx`, `locaville/app_user/lib/todo-service.ts`, `locaville/backend/app/routers/todo.py` |
| APP | 재촬영 필요 증빙 알림 | 신규 추가 | 현재 홈에서 재촬영 필요 증빙을 조회해 사진 등록 흐름으로 연결하지만 기존 요구사항에는 별도 항목이 없음 | 농업인은 홈 화면에서 재촬영이 필요한 증빙을 확인하고 해당 증빙의 사진 등록 화면으로 이동할 수 있어야 한다. | `locaville/app_user/components/HomeScreen.tsx`, `locaville/app_user/components/PhotoInputScreen.tsx`, `locaville/backend/app/routers/evidence.py` |
| APP | 저장 완료 결과 표시 | 신규 추가 | 현재 저장 완료 화면에서 입력 방식과 증빙 연결 여부를 표시하지만 기존 요구사항에는 완료 결과 화면 요구가 약함 | 농업인은 영농일지 또는 증빙 저장 후 저장 완료 화면에서 저장 결과, 입력 방식, 증빙 연결 여부를 확인할 수 있어야 한다. | `locaville/app_user/components/SaveCompleteScreen.tsx`, `locaville/app_user/components/LocavilleApp.tsx` |
| APP | 알림 목록 및 읽음 처리 | 신규 추가 | 농업인 알림 API와 화면이 구현되어 있으나 기존 APP 요구사항에 알림 조회/읽음 처리가 없음 | 농업인은 알림 목록과 미읽음 건수를 조회하고 개별 또는 전체 알림을 읽음 처리할 수 있어야 한다. | `locaville/app_user/components/NotificationPanel.tsx`, `locaville/app_user/lib/notification-service.ts`, `locaville/backend/app/routers/farmer.py` |
| APP | 도우미 동의/승인 | 신규 추가 | 농작업 도우미 승인 흐름이 APP과 Backend에 구현되어 있으나 기존 요구사항에 없음 | 농업인은 현재 요청된 도우미 권한을 확인하고 도우미 활동을 승인할 수 있어야 한다. | `locaville/app_user/components/HelperConsentModal.tsx`, `locaville/app_user/lib/farm-helper-service.ts`, `locaville/backend/app/routers/farmer.py` |
| APP | 사업 PDF 다운로드 | 신규 추가 | 기존에는 사업기록 PDF 정도로 표현되어 있으나 현재는 사업 상세 화면에서 리포트 PDF를 다운로드함 | 농업인은 참여 사업 상세 화면에서 사업 관련 PDF 자료를 다운로드할 수 있어야 한다. | `locaville/app_user/components/BusinessDetailScreen.tsx`, `locaville/backend/app/routers/report.py`, `locaville/backend/app/services/report_service.py` |
| WEB | 신규 일지/증빙 메뉴 배지 | 신규 추가 | Sidebar에서 새 일지/증빙 건수를 표시하는 API 연동이 구현되어 있으나 기존 요구사항에 없음 | 관리자는 사이드바에서 마지막 확인 이후 새로 등록된 영농일지와 증빙 건수를 배지로 확인할 수 있어야 한다. | `locaville/web_user/components/Sidebar.tsx`, `locaville/web_user/lib/sidebar-badges.ts`, `locaville/backend/app/routers/admin.py` |
| WEB | 영농일지 삭제 | 신규 추가 | 관리자 일지 삭제 API와 client가 구현되어 있으나 기존 WEB 요구사항에는 검색/조회 중심으로만 정의됨 | 관리자는 필요 시 선택한 영농일지를 삭제할 수 있어야 한다. | `locaville/web_user/app/journal/page.tsx`, `locaville/web_user/lib/admin-api.ts`, `locaville/backend/app/routers/admin.py` |
| WEB | 사업참여 등록 및 활동/To-do 생성 | 신규 추가 | `engage` 화면과 Backend API가 구현되어 있으나 기존 사업 요구사항과 별도 관리 흐름으로 분리되어 있지 않음 | 관리자는 사업참여 목록을 조회하고, 사업 참여 등록, 활동 등록, 사업별 To-do 생성을 수행할 수 있어야 한다. | `locaville/web_user/app/engage/page.tsx`, `locaville/web_user/app/engage/[prj_id]/page.tsx`, `locaville/backend/app/routers/engage.py` |
| WEB | 농작업 도우미 관리 | 신규 추가 | 도우미 등록/조회/삭제 API와 화면이 구현되어 있으나 기존 WEB 요구사항에 없음 | 관리자는 농작업 도우미를 등록, 조회, 삭제하고 농업인별 도우미 관계를 관리할 수 있어야 한다. | `locaville/web_user/app/farm-helpers/page.tsx`, `locaville/web_user/lib/admin-api.ts`, `locaville/backend/app/services/farm_helper_service.py` |
| WEB | 농업인 단체관리 현황 조회 | 신규 추가 | 기존 단체 정보 CRUD와 현재 구현된 사업/농업인 단체 현황 조회 기능의 성격이 다름 | 관리자는 농업인 단체와 사업 관리 현황을 조회할 수 있어야 한다. | `locaville/web_user/app/farmer-groups/page.tsx`, `locaville/web_user/lib/farmer-groups-api.ts`, `locaville/backend/app/routers/business_management.py` |
| WEB | Backend health check | 신규 추가 | 운영/개발 확인용 Backend 상태 점검 API가 구현되어 있으나 요구사항에 없음 | 운영자는 Backend와 DB 연결 상태를 확인할 수 있는 health check API를 사용할 수 있어야 한다. | `locaville/backend/app/routers/health.py`, `locaville/backend/app/repositories/health_rdb.py` |
| WEB | 시연 데이터 생성/초기화 | 신규 추가 | demo seed/reset/status API가 구현되어 있으나 요구사항에 내부 시연 기능으로 분리되어 있지 않음 | 관리자는 시연 환경에서 샘플 데이터를 생성, 초기화하고 현재 상태를 확인할 수 있어야 한다. | `locaville/web_user/lib/admin-api.ts`, `locaville/backend/app/routers/demo.py`, `locaville/backend/app/services/demo_service.py` |

## 2. 기존 항목 수정

| APP/WEB 구분 | 기능명 | 변경유형 | 변경해야 하는 이유 | 요구사항 문구 초안 | 코드 근거 파일 |
|---|---|---|---|---|---|
| APP | 농업인 로그인 처리 | 기존 항목 수정 | 실제 인증 API 연동이 아니라 샘플/수동 진입 화면 중심으로 구현됨 | 농업인은 샘플 또는 수동 선택 화면을 통해 앱에 진입할 수 있으며, 실제 인증 연동은 별도 구현 대상으로 관리한다. | `locaville/app_user/components/LoginSelectScreen.tsx`, `locaville/app_user/components/ManualLoginScreen.tsx` |
| APP | 현재 위치 날씨 조회 | 기존 항목 수정 | 현재 구현은 GPS 현재 위치가 아니라 Backend `/weather/today` 기반의 마을/작물 기준 날씨 조회임 | 농업인은 홈 화면에서 마을 또는 작물 기준 오늘 날씨 정보를 확인할 수 있어야 한다. | `locaville/app_user/components/WeatherWidget.tsx`, `locaville/app_user/lib/weather-service.ts`, `locaville/backend/app/routers/weather.py` |
| APP | 주간 To-do 목록 조회 | 기존 항목 수정 | 별도 주간 API가 아니라 선택일/오늘 할 일 API와 화면 UI 중심으로 구현됨 | 농업인은 선택한 날짜 또는 오늘 기준 To-do 목록을 확인할 수 있어야 하며, 주간 전용 조회는 별도 확장으로 관리한다. | `locaville/app_user/components/JournalScreen.tsx`, `locaville/app_user/lib/todo-service.ts` |
| APP | 대화형 영농기록 저장 | 기존 항목 수정 | STT/TTS와 voice session API 기반 대화형 입력이 실제 구현되어 있어 기존 설명을 최신 API 기준으로 바꿔야 함 | 농업인은 음성 녹음, STT 변환, AI 질문 응답, 최종 확인을 거쳐 영농일지를 저장할 수 있어야 한다. | `locaville/app_user/components/VoiceInputScreen.tsx`, `locaville/app_user/lib/ai-service.ts`, `locaville/backend/app/routers/ai.py` |
| APP | 사진 증빙 저장 및 라벨 확정 | 기존 항목 수정 | 사진 업로드는 구현됐지만 워터마크/AI 후보 라벨 확정/GPS 전제는 코드 근거가 제한적임 | 농업인은 사진 파일을 선택하거나 촬영하여 증빙으로 업로드하고 저장 결과를 확인할 수 있어야 한다. | `locaville/app_user/components/PhotoInputScreen.tsx`, `locaville/app_user/lib/evidence-service.ts`, `locaville/backend/app/routers/evidence.py` |
| APP | 참여 사업 목록 조회 | 기존 항목 수정 | 기존 요구사항은 DB/WEB 표현이 강하지만 현재 APP은 Backend `/project` 연동으로 사업 목록을 조회함 | 농업인은 APP에서 참여 또는 진행 중인 사업 목록을 Backend API로 조회할 수 있어야 한다. | `locaville/app_user/components/BusinessScreen.tsx`, `locaville/app_user/lib/business-service.ts`, `locaville/backend/app/routers/project.py` |
| APP | RAG 챗봇 질문 및 답변 조회 | 기존 항목 수정 | FAQ DB 조회가 아니라 고정 질문과 AI/RAG 채팅 API 중심으로 구현됨 | 농업인은 도움말 화면에서 고정 질문을 선택하거나 직접 질문하여 AI/RAG 답변을 받을 수 있어야 한다. | `locaville/app_user/components/HelpScreen.tsx`, `locaville/app_user/lib/ai-service.ts`, `locaville/backend/app/routers/ai.py` |
| APP | 내 정보/설정 | 기존 항목 수정 | 설정 화면은 있으나 내 정보 저장, 로그아웃, 알림 설정 저장 API 연동은 확인되지 않음 | 농업인은 설정 화면에서 내 정보와 앱 설정을 확인할 수 있으며, 서버 저장 기능은 별도 구현 대상으로 관리한다. | `locaville/app_user/components/SettingsScreen.tsx` |
| WEB | 이장님 WEB화면 이동 | 기존 항목 수정 | `/`에서 대시보드 이동은 있으나 로그인 성공 기반 이동으로 보기 어려움 | 관리자는 웹 진입 시 대시보드로 이동할 수 있으며, 실제 로그인 성공 후 이동 처리는 인증 구현 범위로 분리한다. | `locaville/web_user/app/page.tsx`, `locaville/web_user/app/dashboard/page.tsx` |
| WEB | 관리자 RAG 챗봇 질문 및 근거 조회 | 기존 항목 수정 | 현재 구현은 스트리밍 AI/RAG 챗봇 중심이고 근거 문서 표시 수준은 제한적임 | 관리자는 도움말 챗봇에서 사업·증빙 관련 질문을 입력하고 AI/RAG 기반 답변을 받을 수 있어야 한다. | `locaville/web_user/components/help/HelpChat.tsx`, `locaville/web_user/lib/admin-api.ts`, `locaville/backend/app/routers/ai.py` |
| WEB | 주민 가입링크 발송 | 기존 항목 수정 | 실제 SMS 발송보다 초대 API 호출과 상태 처리 중심으로 구현됨 | 관리자는 주민 목록에서 미가입 주민에게 초대 처리를 요청하고 처리 결과를 확인할 수 있어야 한다. | `locaville/web_user/components/residents/ResidentListTable.tsx`, `locaville/web_user/lib/admin-api.ts`, `locaville/backend/app/routers/admin.py` |
| WEB | 주민 정보 수정 | 기존 항목 수정 | Backend/API client는 있으나 화면 저장 흐름이 제한적임 | 관리자는 주민 상세 화면에서 주민 정보를 수정할 수 있어야 하며, 실제 저장 연동 범위는 부분구현으로 관리한다. | `locaville/web_user/components/residents/ResidentDetailPage.tsx`, `locaville/web_user/lib/admin-api.ts`, `locaville/backend/app/services/admin_resident_service.py` |
| WEB | 사진 증빙 상세 조회 및 검토 상태 관리 | 기존 항목 수정 | 현재 검토 상태 변경, 재촬영 요청, 상세 조회가 구현되어 있어 상태값과 처리 범위를 최신화해야 함 | 관리자는 증빙 목록과 상세를 조회하고 증빙 상태를 검토완료, 검토필요, 재촬영요청 등으로 변경할 수 있어야 한다. | `locaville/web_user/app/evidence/page.tsx`, `locaville/web_user/components/dashboard/RetakeRequestModal.tsx`, `locaville/backend/app/routers/evidence.py` |
| WEB | 사업 일정 규칙 템플릿 관리 | 기존 항목 수정 | 템플릿 관리가 아니라 사업/활동 일정과 To-do 생성 중심으로 구현됨 | 관리자는 사업별 활동을 등록·수정하고 활동 기준으로 To-do 생성을 요청할 수 있어야 한다. | `locaville/web_user/app/project/[prj_id]/page.tsx`, `locaville/backend/app/routers/project.py`, `locaville/backend/app/routers/engage.py` |
| WEB | 관리자 캘린더 | 기존 항목 수정 | 월별 캘린더는 있지만 날짜별 직접 추가 일정은 서버 저장이 아니라 localStorage 중심임 | 관리자는 월별 캘린더에서 사업/To-do 일정을 확인할 수 있으며, 직접 추가 일정은 로컬 저장 또는 별도 서버 저장 기능으로 구분한다. | `locaville/web_user/components/dashboard/FarmingCalendarSection.tsx` |
| WEB | 마을 정보 조회 | 기존 항목 수정 | 마을 정보 CRUD가 아니라 현재 사용자/마을 context 조회와 주소검색 일부가 구현됨 | 관리자는 현재 사용자와 마을 context 정보를 조회하고 주소검색을 통해 행정구역 정보를 확인할 수 있어야 한다. | `locaville/web_user/components/Shell.tsx`, `locaville/web_user/components/CurrentUserVillageContext.tsx`, `locaville/web_user/components/residents/AddressSearchPanel.tsx` |
| WEB | 단체 정보 조회 | 기존 항목 수정 | 단체 master CRUD가 아니라 농업인 단체/사업관리 현황 조회 기능으로 구현됨 | 관리자는 농업인 단체와 사업관리 현황을 조회할 수 있어야 한다. | `locaville/web_user/app/farmer-groups/page.tsx`, `locaville/backend/app/routers/business_management.py` |
| WEB | 누락 농가 알림 발송 | 기존 항목 수정 | SMS 발송 근거는 없고 Backend notification 생성/notify API 중심으로 구현됨 | 관리자는 미이행 농가를 확인하고 알림 생성 또는 안내 요청을 처리할 수 있어야 한다. | `locaville/web_user/app/dashboard/page.tsx`, `locaville/backend/app/routers/admin.py`, `locaville/backend/app/repositories/notification_rdb.py` |

## 3. 구현 확인 필요

| APP/WEB 구분 | 기능명 | 변경유형 | 변경해야 하는 이유 | 요구사항 문구 초안 | 코드 근거 파일 |
|---|---|---|---|---|---|
| APP | 누락 증빙 상태 조회 | 구현 확인 필요 | Backend API client는 있으나 APP 화면에서 명확한 사용자 플로우로 노출되는 범위가 제한적임 | 농업인은 누락된 증빙 항목을 확인할 수 있어야 하며, 화면 노출 범위는 추가 확인 후 확정한다. | `locaville/app_user/lib/evidence-service.ts`, `locaville/backend/app/routers/evidence.py` |
| APP | 사진 품질 검증 및 재촬영 안내 | 구현 확인 필요 | 재촬영 필요 상태 표시는 있으나 OpenCV 기반 품질 검증은 코드 근거가 부족함 | 농업인은 재촬영 요청 사유를 확인할 수 있어야 하며, 자동 품질 검증은 별도 구현 여부를 확인한다. | `locaville/app_user/components/HomeScreen.tsx`, `locaville/app_user/components/PhotoInputScreen.tsx` |
| APP | RAG 답변 근거 문서 표시 | 구현 확인 필요 | 채팅은 구현되어 있으나 근거 문서명/근거 본문 표시 수준은 화면에서 제한적으로 확인됨 | 농업인은 AI/RAG 답변과 함께 가능한 경우 관련 근거 정보를 확인할 수 있어야 한다. | `locaville/app_user/components/HelpScreen.tsx`, `locaville/backend/app/services/rag_service.py` |
| APP | 내 정보 저장/로그아웃 | 구현 확인 필요 | 설정 화면은 있으나 서버 저장과 실제 로그아웃 API 연결이 확인되지 않음 | 농업인은 내 정보를 수정·저장하고 로그아웃할 수 있어야 하며, 서버 연동 여부를 확인한다. | `locaville/app_user/components/SettingsScreen.tsx` |
| WEB | 증빙 삭제 | 구현 확인 필요 | Backend/API client는 있으나 실제 화면 버튼/사용자 플로우 연결 확인이 제한적임 | 관리자는 필요 시 증빙자료를 삭제할 수 있어야 하며, 화면 제공 여부와 권한 조건을 확인한다. | `locaville/web_user/lib/admin-api.ts`, `locaville/backend/app/routers/admin.py` |
| WEB | 프로젝트 신규 등록 | 구현 확인 필요 | 신규 등록 화면은 있으나 저장 API 연결이 없음 | 관리자는 신규 프로젝트 정보를 입력하고 저장할 수 있어야 하며, 저장 API 연결 여부를 확인한다. | `locaville/web_user/app/project/new/page.tsx` |
| WEB | 주간 농사정보 화면 표시 | 구현 확인 필요 | Backend와 API client는 있으나 화면에서 표시되는 근거가 제한적임 | 관리자는 주간 농사정보를 조회할 수 있어야 하며, 화면 표시 위치와 사용자 흐름을 확정한다. | `locaville/web_user/lib/admin-api.ts`, `locaville/backend/app/routers/admin.py`, `locaville/backend/app/services/admin_weather_service.py` |
| WEB | 시연 데이터 생성/초기화 화면 | 구현 확인 필요 | Backend와 API client는 있으나 전용 화면 노출 여부가 명확하지 않음 | 관리자는 시연 데이터 생성, 초기화, 상태 확인 기능을 사용할 수 있어야 하며, 운영 화면 노출 여부를 확인한다. | `locaville/web_user/lib/admin-api.ts`, `locaville/backend/app/routers/demo.py` |
| WEB | 관리자 개인정보 수정 | 구현 확인 필요 | Backend profile API는 있으나 WEB 설정/프로필 화면 연결이 확인되지 않음 | 관리자는 개인정보를 조회·수정할 수 있어야 하며, 화면 및 저장 연동 구현 여부를 확인한다. | `locaville/backend/app/routers/admin.py`, `locaville/backend/app/services/admin_profile_service.py` |

## 4. 삭제 또는 보류 후보

| APP/WEB 구분 | 기능명 | 변경유형 | 변경해야 하는 이유 | 요구사항 문구 초안 | 코드 근거 파일 |
|---|---|---|---|---|---|
| APP | 초대 URL 조회 | 삭제 또는 보류 후보 | APP 가입 초대 URL 처리 화면/API 호출 근거가 확인되지 않음 | APP 초대 URL 기반 가입은 현재 코드 범위에서 제외하고, 가입 정책 확정 후 재검토한다. | `locaville/app_user/components/LoginSelectScreen.tsx`, `locaville/app_user/components/ManualLoginScreen.tsx` |
| APP | 외부 본인인증 요청 | 삭제 또는 보류 후보 | 외부 본인인증 API 연동 코드가 확인되지 않음 | 외부 본인인증은 현재 MVP 요구에서 보류하고 인증 방식 확정 후 별도 요구사항으로 관리한다. | `locaville/app_user/components/ManualLoginScreen.tsx` |
| APP | 비밀번호 등록/가입 완료 처리 | 삭제 또는 보류 후보 | APP 회원가입 완료 및 비밀번호 등록 저장 흐름이 확인되지 않음 | 농업인 가입/비밀번호 등록은 실제 인증 구조 확정 전까지 보류한다. | `locaville/app_user/components/LoginSelectScreen.tsx` |
| APP | 영수증 이미지 등록 및 OCR 확인 | 삭제 또는 보류 후보 | OCR 확인 화면과 OCR API 연동 코드가 확인되지 않음 | 영수증 OCR 확인 기능은 현재 구현 범위에서 제외하고 향후 확장 요구사항으로 보류한다. | `locaville/app_user/components/PhotoInputScreen.tsx`, `locaville/backend/app/routers/evidence.py` |
| APP | 워터마크 및 AI 후보 라벨 생성 | 삭제 또는 보류 후보 | 파일 업로드는 있으나 워터마크본 분리 저장과 Vision 후보 확정 화면은 확인되지 않음 | 워터마크 및 AI 후보 라벨 확정은 현재 증빙 업로드 요구와 분리하여 보류한다. | `locaville/app_user/lib/ai-service.ts`, `locaville/app_user/lib/evidence-service.ts` |
| APP | 영농기록 수정/수정 저장 | 삭제 또는 보류 후보 | 일지 수정 화면과 수정 저장 API 호출이 확인되지 않음 | 영농기록 수정 기능은 현재 조회/신규 저장 범위에서 제외하고 보류한다. | `locaville/app_user/components/JournalDetailScreen.tsx`, `locaville/app_user/lib/diary-repository.ts` |
| APP | 최종 제출 데이터 요약 조회 | 삭제 또는 보류 후보 | APP 최종 제출 요약 화면/API 근거가 확인되지 않음 | 최종 제출 요약은 현재 APP 기능에서 제외하고 제출/리포트 정책 확정 후 재검토한다. | `locaville/app_user/components/BusinessDetailScreen.tsx` |
| WEB | 이장님 가입 토큰 생성 및 가입링크 전송 | 삭제 또는 보류 후보 | WEB 가입 토큰 생성/가입 링크 발송 화면과 API 근거가 확인되지 않음 | 이장님 가입 토큰 및 가입 링크 발송 기능은 인증 정책 확정 전까지 보류한다. | `locaville/web_user/app/page.tsx`, `locaville/backend/app/routers/admin.py` |
| WEB | 외부 본인인증 요청/결과 저장 | 삭제 또는 보류 후보 | 외부 본인인증 API와 결과 저장 플로우가 확인되지 않음 | 외부 본인인증 기능은 현재 WEB 구현 범위에서 제외하고 보류한다. | `locaville/web_user/app/page.tsx` |
| WEB | APP 이동 경로 제공 | 삭제 또는 보류 후보 | WEB에서 APP으로 이동하는 별도 경로 제공 근거가 확인되지 않음 | WEB 내 APP 이동 경로 제공은 현재 서비스 방향에서 제외하거나 보류한다. | `locaville/web_user/components/Sidebar.tsx` |
| WEB | 주민 정보 삭제 | 삭제 또는 보류 후보 | 주민 삭제 화면/API가 확인되지 않음 | 주민 삭제는 현재 구현 범위에서 제외하고 비활성화 정책 또는 삭제 정책 확정 후 재검토한다. | `locaville/web_user/components/residents/ResidentDetailPage.tsx`, `locaville/backend/app/routers/admin.py` |
| WEB | 마을 제출 패키지 ZIP 생성 | 삭제 또는 보류 후보 | ZIP 생성/다운로드 API와 WEB 호출 근거가 확인되지 않음 | 마을 제출 패키지 ZIP 생성은 현재 PDF/리포트 기능과 분리하여 보류한다. | `locaville/backend/app/routers/report.py`, `locaville/web_user/app/projects/page.tsx` |
| WEB | 참여 사업 삭제 | 삭제 또는 보류 후보 | 프로젝트 삭제 화면/호출 근거가 확인되지 않음 | 참여 사업 삭제는 현재 사업 조회/수정/활동 관리 범위에서 제외하고 삭제 정책 확정 후 재검토한다. | `locaville/web_user/app/project/[prj_id]/page.tsx`, `locaville/backend/app/routers/project.py` |
| WEB | 영수증 OCR 결과 조회 및 보정 요청 | 삭제 또는 보류 후보 | WEB OCR 결과 조회/보정 화면과 OCR API 연동 근거가 확인되지 않음 | 영수증 OCR 결과 조회 및 보정 요청은 현재 증빙 검토 기능과 분리하여 보류한다. | `locaville/web_user/app/evidence/page.tsx` |
| WEB | 마을 정보 등록/저장/수정 | 삭제 또는 보류 후보 | 주소검색과 current context는 있으나 마을 정보 CRUD 화면/API가 확인되지 않음 | 마을 정보 CRUD는 현재 구현 범위에서 제외하고 마을 관리 정책 확정 후 재검토한다. | `locaville/web_user/components/residents/AddressSearchPanel.tsx`, `locaville/web_user/components/CurrentUserVillageContext.tsx` |
| WEB | 단체 정보 등록/저장/수정/삭제 | 삭제 또는 보류 후보 | 현재 구현은 단체 master CRUD가 아니라 농업인 단체/사업 현황 조회임 | 단체 master CRUD는 현재 구현 범위에서 제외하고, 현황 조회 요구사항과 분리하여 보류한다. | `locaville/web_user/app/farmer-groups/page.tsx`, `locaville/backend/app/routers/business_management.py` |
| WEB | 마을 이행 리포트 생성 및 다운로드 | 삭제 또는 보류 후보 | WEB 리포트 다운로드 화면/API 호출 근거가 확인되지 않음 | 마을 이행 리포트 다운로드는 현재 WEB 기능에서 보류하고 리포트 산출 범위를 재정의한다. | `locaville/web_user/app/dashboard/page.tsx`, `locaville/backend/app/routers/report.py` |

