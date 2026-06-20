# 최신 코드 기준 단위테스트 대상 논리 검토

입력 파일: `locaville/docs/test_design/latest_code_unit_test_target_classification.md`

검토 기준: 단위테스트 대상 분류표에서 단위테스트 범위를 벗어나거나, 구현상태/테스트가능여부가 충돌하거나, 브라우저 권한/사용자 흐름/여러 API 연계가 섞인 항목을 별도로 표시했다. 원본 분류표는 수정하지 않았다.

## 논리 검토 결과표

정상 항목은 본 표에서 생략하고, 수정 또는 확인이 필요한 항목만 정리했다.

| 기능ID | 구분 | 기능명 | 논리검토결과 | 오류유형 | 검토의견 | 수정권장 | 관련 코드/API |
|---|---|---|---|---|---|---|---|
| LCU_BACK_API_021 | Backend | AI 채팅/stream endpoint | 확인필요 | 여러 API/stream 범위 혼합 | 일반 `POST /ai/chat`은 API 단위테스트가 가능하지만, `POST /ai/chat/stream`은 streaming 응답 제너레이터와 클라이언트 수신 처리가 섞일 수 있다. 단위테스트에서는 stream 생성/오류 fallback만 검증하고 화면 수신 흐름은 통합테스트로 분리하는 것이 적절하다. | 수정 | locaville/backend/app/routers/ai.py, POST /ai/chat, POST /ai/chat/stream |
| LCU_BACK_API_025 | Backend | STT/TTS/Voice session endpoint | 테스트유형변경필요 | 음성/세션 흐름 혼합 | Backend API 응답 검증은 단위테스트 가능하지만 STT 업로드, TTS 바이너리 응답, voice session start/reply/finalize는 여러 단계의 대화 흐름을 전제한다. 한 행에서 전체 흐름을 단위테스트로 보면 범위가 넓다. API별 단위테스트와 대화 흐름 통합테스트로 분리해야 한다. | 수정 | locaville/backend/app/routers/ai.py, POST /ai/stt, POST /ai/tts, POST /ai/voice/session/* |
| LCU_BACK_API_026 | Backend | 사진 사전검사/라이브 코칭 endpoint | 확인필요 | 브라우저 카메라 흐름 혼합 가능 | Backend의 파일 입력, 이미지 품질/vision fallback은 단위테스트 가능하다. 다만 라이브 코칭은 APP에서 카메라 권한, 주기적 캡처, 음성 안내와 결합되므로 API 단위테스트와 화면/E2E 테스트 범위를 명확히 분리해야 한다. | 수정 | locaville/backend/app/routers/photo_guard.py, POST /photo-guard/check, POST /photo-guard/coach |
| LCU_BACK_API_031 | Backend | 사업 리포트 preview/PDF endpoint | 테스트유형변경필요 | 다운로드 범위 혼합 | preview 데이터 생성은 단위테스트 가능하지만 PDF 다운로드 동작은 브라우저 다운로드/파일 응답 확인 성격이 강하다. Backend 단위테스트는 응답 상태, 헤더, 오류 처리, 데이터 생성으로 제한하고 다운로드 UX는 통합/E2E로 분리해야 한다. | 수정 | locaville/backend/app/routers/report.py, GET /reports/project-preview, GET /reports/project-pdf |
| LCU_BACK_SVC_014 | Backend | 사업 리포트 데이터/PDF 생성 service | 확인필요 | 외부 렌더링/파일 생성 범위 혼합 | 리포트 데이터 가공과 상태 라벨은 단위테스트 가능하다. PDF 렌더링 엔진, 폰트, 파일 생성 결과까지 단위테스트로 강하게 기대하면 환경 의존성이 커진다. 렌더링은 스냅샷/통합 또는 수동 확인 범위로 분리하는 것이 안전하다. | 수정 | locaville/backend/app/services/report_service.py |
| LCU_APP_UNIT_007 | APP | AI/RAG/STT/TTS/voice API client | 확인필요 | 브라우저 음성 처리 혼합 가능 | fetch client의 request/response/fallback은 단위테스트 가능하다. 그러나 STT 녹음, TTS 재생, stream 수신 UI까지 포함하면 통합/E2E 성격이 된다. API client 함수와 브라우저 음성 제어를 별도 테스트 대상으로 분리해야 한다. | 수정 | locaville/app_user/lib/ai-service.ts, POST /ai/* |
| LCU_APP_UNIT_008 | APP | 사진 코칭 API client | 확인필요 | 카메라/파일 흐름 혼합 가능 | `photo-coach-service`의 FormData 구성과 API 실패 처리는 단위테스트 가능하다. 카메라 캡처, 주기적 프레임 전송, 음성 코칭은 단위테스트 범위를 넘으므로 통합/E2E/수동 테스트로 분리해야 한다. | 수정 | locaville/app_user/lib/photo-coach-service.ts, POST /photo-guard/coach |
| LCU_APP_UNIT_012 | APP | 영농일지 목록/작성/완료 렌더링 상태 | 확인필요 | 화면 흐름 혼합 가능 | 목록, 입력 validation, 저장 중 표시 같은 컴포넌트 상태는 단위테스트 가능하다. 하지만 작성 후 저장 완료 화면 이동과 목록 갱신까지 한 번에 검증하면 사용자 흐름 테스트가 된다. 컴포넌트 단위와 저장 흐름 통합테스트를 분리해야 한다. | 수정 | locaville/app_user/components/JournalScreen.tsx, ManualInputScreen.tsx, SaveCompleteScreen.tsx |
| LCU_APP_UNIT_013 | APP | 사진 등록/가드/코칭 UI 상태 | 범위오류 | 카메라 권한/라이브 코칭 | `PhotoInputScreen`, `PhotoLiveCoachOverlay`는 파일 선택, 카메라 권한, getUserMedia, 주기적 코칭, 음성 안내가 결합된다. 단위테스트는 순수 상태 표시/버튼 disabled/오류 메시지 정도로 제한하고 카메라 권한과 라이브 흐름은 E2E/수동 테스트로 이동해야 한다. | E2E/수동테스트로 이동 | locaville/app_user/components/PhotoInputScreen.tsx, PhotoGuardOverlay.tsx, PhotoLiveCoachOverlay.tsx |
| LCU_APP_UNIT_015 | APP | 대화형 영농일지 UI 상태/텍스트 분류 로직 | 범위오류 | 녹음/음성 재생/다단계 대화 | `VoiceInputScreen`은 MediaRecorder, STT, TTS, 대화 세션, 저장까지 여러 기능이 이어진다. 순수 텍스트 분류 함수와 화면 상태는 단위테스트 가능하지만 전체 대화형 작성은 단위테스트가 아니라 통합/E2E 시나리오가 적절하다. | 통합테스트로 이동 | locaville/app_user/components/VoiceInputScreen.tsx, POST /ai/stt, POST /ai/tts, POST /ai/voice/session/* |
| LCU_APP_UNIT_016 | APP | 사업/설정/도움말 화면 렌더링 상태 | 확인필요 | 여러 화면/책임 혼합 | 사업 목록/상세, 설정 화면, 도움말 채팅이 한 항목에 묶여 있다. 각 컴포넌트 렌더링은 단위테스트 가능하지만 `POST /ai/chat` stream fallback이나 사업 상세 이동까지 함께 검증하면 통합 성격이 된다. 화면별로 분리하는 것이 적절하다. | 수정 | locaville/app_user/components/BusinessScreen.tsx, BusinessDetailScreen.tsx, SettingsScreen.tsx, HelpScreen.tsx |
| LCU_WEB_UNIT_003 | WEB | 주민 목록/상세 상태 렌더링 | 확인필요 | 화면 상태와 저장 API 혼합 | 검색/필터/상세 탭 렌더링은 WEB 컴포넌트 단위테스트로 적절하다. 주민 추가/수정 후 목록 갱신까지 포함하면 통합 흐름이므로 API client mock 단위와 사용자 흐름 통합테스트를 분리해야 한다. | 수정 | locaville/web_user/components/residents/VillageResidentsPage.tsx, ResidentAddModal.tsx, PATCH /admin/residents |
| LCU_WEB_UNIT_005 | WEB | 캘린더/안내문구/AI 추천 UI | 확인필요 | localStorage/AI/clipboard 책임 혼합 | 캘린더 localStorage 일정은 프론트 단위테스트 가능하지만, 안내문구 복사와 AI 추천은 clipboard/외부 API/mock fallback이 섞인다. localStorage를 서버 저장처럼 검증하지 않도록 테스트 범위를 분리해야 한다. | 수정 | locaville/web_user/components/dashboard/FarmingCalendarSection.tsx, NoticeTemplateModal.tsx, ActiveActivityCard.tsx |
| LCU_WEB_UNIT_006 | WEB | 진행 사업/프로젝트 관리 API client와 UI | 확인필요 | API client와 페이지 흐름 혼합 | project API client 함수는 단위테스트 가능하고, form state도 컴포넌트 단위로 가능하다. 다만 프로젝트 상세 조회 후 활동/작업 등록/수정/삭제와 화면 갱신은 여러 API가 이어지는 관리자 흐름이므로 통합테스트로 별도 분리해야 한다. | 수정 | locaville/web_user/lib/project-admin-api.ts, app/projects/[id]/page.tsx, app/project/[prj_id]/page.tsx |
| LCU_WEB_UNIT_007 | WEB | 사업참여 등록/활동/To-do refresh UI/API client | 확인필요 | 여러 API 연계 흐름 | API client의 개별 함수는 단위테스트 가능하다. 사업 참여 등록, 활동 등록, To-do 생성, refresh-preview/refresh는 순차적인 운영 흐름이므로 한 단위테스트 항목으로 묶으면 범위가 넓다. 개별 client 단위와 관리자 통합 흐름을 분리해야 한다. | 수정 | locaville/web_user/lib/engage-project-api.ts, app/engage/[prj_id]/page.tsx |
| LCU_WEB_UNIT_009 | WEB | 도움말 챗봇 UI/API client | 확인필요 | stream/외부 AI 혼합 | open/close 상태와 메시지 렌더링은 단위테스트 가능하다. stream 수신, fallback API 전환, 외부 AI 실패 처리는 mock 단위와 통합 시나리오를 나눠야 하며 실제 AI 성공을 전제로 하면 안 된다. | 수정 | locaville/web_user/components/help/HelpFloatingButton.tsx, HelpChat.tsx, POST /ai/chat, POST /ai/chat/stream |
| LCU_WEB_N_001 | WEB | 브라우저 다운로드/음성 듣기/클립보드 | 정상 | 이미 단위테스트 제외 처리됨 | 다운로드, 오디오 재생, clipboard는 원본 분류표에서 단위테스트대상 `N`으로 표시되어 있어 검토 기준과 맞다. 다만 통합/E2E/수동 테스트 후보로 별도 관리하면 된다. | 유지 | locaville/web_user/lib/admin-api.ts, dashboard components |

## 요약

* 전체 검토 항목 수: 99
* 정상으로 판단한 항목 수: 84
* 별도 체크 항목 수: 17
* 논리오류 수: 0
* 범위오류 수: 2
* 구현상태충돌 수: 0
* 화면기준불일치 수: 0
* 테스트유형변경필요 수: 2
* 확인필요 수: 12

## 우선 조치 권장

* `LCU_APP_UNIT_013`, `LCU_APP_UNIT_015`는 카메라/음성/대화 흐름이 포함되어 단위테스트 범위를 가장 쉽게 넘을 수 있으므로 먼저 분리한다.
* `LCU_BACK_API_025`, `LCU_WEB_UNIT_007`, `LCU_WEB_UNIT_006`은 여러 API가 이어지는 흐름을 개별 단위테스트와 통합테스트로 나눠야 한다.
* localStorage 기반 기능은 서버 저장 성공을 기대하지 않도록 `LCU_WEB_UNIT_005`의 테스트 목적을 명확히 제한한다.

