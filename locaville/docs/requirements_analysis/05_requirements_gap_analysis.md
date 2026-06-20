# 05. 요구사항 정합성 검토

## 분석 기준

- 기존 요구사항 정의서: `0602_저탄마을_요구사항정의서.xlsx`
- 비교 문서: `01_repository_structure.md`, `02_backend_api_inventory.md`, `03_app_user_requirements_candidates.md`, `04_web_user_requirements_candidates.md`
- 대상 시트: `굿바이브요구사항정의서`
- 기존 요구사항 수: 120개
- 엑셀 원본은 읽기 전용으로만 확인했고 수정하지 않음
- `.env` 파일은 읽지 않았고 민감한 설정값은 포함하지 않음

## ID 체계 확인

- WEB 기능: `REQ_WM0_*` ~ `REQ_WM6_*`
- WEB 비기능: `REQ_WG_*`
- APP 기능: `REQ_AM0_*` ~ `REQ_AM5_*`
- APP 비기능: `REQ_AMG_*`
- 신규 ID는 기존 체계 뒤에 이어서 제안함
- 단, 실제 엑셀 반영 전 기획자 확인필요

## 1. 기존 요구사항 검토표

| 기존 요구사항ID | APP/WEB | 기능명 | 현재 분류 | 판단 근거 | 관련 코드/분석문서 | 수정 방향 |
|---|---|---|---|---|---|---|
| REQ_WM0_001 | WEB | 이장님 가입 토큰 생성 및 가입링크 전송 | 보류/미구현 | WEB 가입 토큰/가입링크 발송 화면과 API 호출 근거 없음 | 04 문서 관리자 로그인 | WEB 가입 플로우 구현 전까지 보류 |
| REQ_WM0_002 | WEB | 가입링크 유효성 조회 | 보류/미구현 | 가입 URL 토큰 검증 화면/endpoint 연결 확인 안 됨 | 04 문서 관리자 로그인 | 가입 링크 기능 필요 여부 재검토 |
| REQ_WM0_003 | WEB | 외부 본인인증 요청 | 보류/미구현 | 외부 본인인증 API 연동 근거 없음 | 04 문서 관리자 로그인 | 외부 인증 범위 확정 필요 |
| REQ_WM0_004 | WEB | 본인인증 결과 저장 및 가입정보 입력 조회 | 보류/미구현 | 인증 결과 저장/가입정보 입력 화면 없음 | 04 문서 관리자 로그인 | 가입 플로우 재정의 |
| REQ_WM0_005 | WEB | 이장님 계정 등록 | 보류/미구현 | backend 로그인은 있으나 WEB 계정 등록 화면 없음 | `backend/app/routers/admin.py` | 관리자 계정 생성 경로 확인 필요 |
| REQ_WM0_006 | WEB | 본인인증 실패 처리 | 보류/미구현 | 본인인증 자체가 확인되지 않음 | 04 문서 | 인증 도입 시 예외 요구사항 유지 |
| REQ_WM0_007 | WEB | 이장님 WEB화면 이동 | 수정 필요 | `/`에서 `/dashboard` 이동은 있으나 로그인 성공 기반 이동은 아님 | `web_user/app/page.tsx`, 04 문서 | 로그인 전제 제거 또는 인증 구현 후 수정 |
| REQ_WM0_008 | WEB | APP 이동 경로 제공 | 보류/미구현 | WEB에서 APP 이동 경로 제공 근거 없음 | 04 문서 | 현재 서비스 방향상 삭제후보 검토 |
| REQ_WM1_001 | WEB | 전체 주민 수 조회 | 유지 | 주민 목록에서 전체/미가입 수 계산 확인 | `VillageResidentsPage.tsx`, 04 문서 | 현행 코드 기준 유지 |
| REQ_WM1_002 | WEB | 등록 주민 수 조회 | 수정 필요 | 가입/초대/대기 상태는 `status_cd` 기반이나 APP 연동 표현은 부정확 | `VillageResidentsPage.tsx`, 04 문서 | 가입 주민/미가입 주민 수로 설명 수정 |
| REQ_WM1_003 | WEB | 사업별 이행률 조회 | 유지 | 사업별 todo status 기반 완료율 계산 확인 | `projects/page.tsx`, 04 문서 | 유지 |
| REQ_WM1_004 | WEB | 미완료 이행항목 조회 | 유지 | 미이행/누락 todo 요약 확인 | `dashboard/page.tsx`, 04 문서 | 유지 |
| REQ_WM1_005 | WEB | 주민 기본정보 조회 | 유지 | summary 기반 주민 목록과 상세 확인 | `VillageResidentsPage.tsx`, 04 문서 | 유지 |
| REQ_WM1_006 | WEB | 관리자 RAG 챗봇 질문 및 근거 조회 | 수정 필요 | 챗봇 stream은 구현됨. 근거 문서 표시 범위는 화면상 제한적 | `HelpChat.tsx`, `admin-api.ts`, 04 문서 | streaming 챗봇 중심으로 설명 수정 |
| REQ_WM2_001 | WEB | 주민별 가입정보 조회 | 유지 | `status_cd` 기반 가입완료/초대발송/가입대기 표시 | `VillageResidentsPage.tsx`, 04 문서 | 유지 |
| REQ_WM2_002 | WEB | 주민별 상세정보 조회 | 유지 | 주민 상세에서 필지/사업/일지 조회 확인 | `ResidentDetailPage.tsx`, 04 문서 | 유지 |
| REQ_WM2_003 | WEB | 농가·필지 관계 관리 | 수정 필요 | 필지 조회는 있으나 관계 관리 저장 기능은 확인 안 됨 | `farmer-api.ts`, 04 문서 | 필지 조회로 축소 또는 관리 API 추가 |
| REQ_WM2_004 | WEB | 주민 정보 수정 | 수정 필요 | API client는 있으나 상세 화면은 local state 수정 중심 | `ResidentDetailPage.tsx`, 04 문서 | `PATCH /admin/residents/{amo_regno}` 화면 연결 필요 |
| REQ_WM2_005 | WEB | 주민 정보 삭제 | 보류/미구현 | WEB 화면/Backend delete endpoint 없음 | 04 문서 | 삭제 또는 비활성화 정책 정의 필요 |
| REQ_WM2_006 | WEB | 주민 개별 등록 | 유지 | 주민 추가 modal에서 `POST /admin/residents` 호출 | `VillageResidentsPage.tsx`, 04 문서 | 유지 |
| REQ_WM2_007 | WEB | 주민 가입링크 발송 | 수정 필요 | 실제 SMS/링크 발송보다 초대 상태 저장 중심 | `ResidentListTable.tsx`, 04 문서 | “초대 상태 저장/재발송 요청”으로 수정 |
| REQ_WM3_001 | WEB | 참여 사업 등록 | 유지 | 참여 단체 등록 API 확인 | `engage/[prj_id]/page.tsx`, 04 문서 | 유지 |
| REQ_WM3_002 | WEB | 참여 사업 저장 | 유지 | 단체/활동별 농가 등록 저장 확인 | `engage-project-api.ts`, 04 문서 | 유지 |
| REQ_WM3_003 | WEB | 추가 사업 목록 조회 | 유지 | `GET /project`, `GET /ville-project` 목록 확인 | `project/page.tsx`, 04 문서 | 유지 |
| REQ_WM3_004 | WEB | 사업별 이행통계 조회 | 유지 | 사업별 todo status 조회/집계 확인 | `projects/[id]/page.tsx`, 04 문서 | 유지 |
| REQ_WM3_005 | WEB | 마을 제출 패키지 ZIP 생성 | 보류/미구현 | ZIP 생성/다운로드 코드 근거 없음 | 04 문서 | PDF/리포트 요구와 구분 필요 |
| REQ_WM3_006 | WEB | 사업 일정 규칙 템플릿 관리 | 수정 필요 | 활동 기간/보조금 관리와 To-do 생성은 있으나 규칙 템플릿 UI는 없음 | `project/[prj_id]/page.tsx`, 04 문서 | 활동 일정 관리로 수정 또는 템플릿 기능 추가 |
| REQ_WM3_007 | WEB | 농가별 To-do 자동 생성 및 재계산 | 유지 | `POST /engage/projects/{prj_id}/todos/create` 확인 | `engage/[prj_id]/page.tsx`, 04 문서 | 유지 |
| REQ_WM3_008 | WEB | 사업별 이행현황 그래프 조회 | 유지 | progress bar/pivot table 확인 | `ProjectProgress.tsx`, 04 문서 | 유지 |
| REQ_WM3_009 | WEB | 사업별 주민 이행현황 조회 | 유지 | 사업 상세에서 농가별 이행 pivot 확인 | `projects/[id]/page.tsx`, 04 문서 | 유지 |
| REQ_WM3_010 | WEB | 사업 진행상태 조회 | 유지 | 사업 목록/상세 이행 상태 표시 확인 | `projects/page.tsx`, 04 문서 | 유지 |
| REQ_WM3_011 | WEB | 참여 사업 수정 | 유지 | project/activity 수정 API 확인 | `project/[prj_id]/page.tsx`, 04 문서 | 유지 |
| REQ_WM3_012 | WEB | 참여 사업 삭제 | 보류/미구현 | 프로젝트 삭제 화면/호출 확인 안 됨 | 04 문서 | 삭제 정책 필요 |
| REQ_WM4_001 | WEB | 영농일지 검색 및 필터링 | 유지 | farmer/status/date 필터 확인 | `journal/page.tsx`, 04 문서 | 유지 |
| REQ_WM4_002 | WEB | 주민별 영농일지 목록 조회 | 유지 | 주민 상세 일지 목록 조회 확인 | `ResidentDetailPage.tsx`, 04 문서 | 유지 |
| REQ_WM4_003 | WEB | 영농일지 상세정보 조회 | 유지 | 상세 패널/모달 확인 | `journal/page.tsx`, `FarmingLogDetailModal.tsx` | 유지 |
| REQ_WM4_004 | WEB | 사진 증빙 상세 조회 및 검토 상태 관리 | 유지 | 증빙 상세, 확인 완료, 재촬영 요청 확인 | `evidence/page.tsx`, `ReviewNeededCard.tsx` | 유지 |
| REQ_WM4_005 | WEB | 영수증 OCR 결과 조회 및 보정 요청 | 보류/미구현 | OCR 결과 조회/보정 화면 없음 | 02, 04 문서 | OCR 요구 보류 |
| REQ_WM5_001 | WEB | 마을 정보 등록 | 보류/미구현 | 주소검색은 있으나 마을 등록 화면/저장 없음 | `AddressSearchPanel.tsx`, 04 문서 | 마을 관리 범위 재검토 |
| REQ_WM5_002 | WEB | 마을 정보 저장 | 보류/미구현 | 마을 저장 API/화면 없음 | 04 문서 | 보류 |
| REQ_WM5_003 | WEB | 마을 정보 조회 | 수정 필요 | Shell에서 현재 사용자/마을 context 조회만 확인 | `Shell.tsx`, 04 문서 | “현재 마을 context 조회”로 축소 |
| REQ_WM5_004 | WEB | 마을 정보 수정 | 보류/미구현 | 마을 수정 화면 없음 | 04 문서 | 보류 |
| REQ_WM5_005 | WEB | 단체 정보 등록 | 수정 필요 | 사업 참여 단체 등록은 있으나 단체 master 등록은 아님 | `engage/[prj_id]/page.tsx`, 04 문서 | 참여 단체 등록으로 표현 수정 |
| REQ_WM5_006 | WEB | 단체 정보 저장 | 수정 필요 | 참여사업 단체 저장 API는 확인됨 | `engage-project-api.ts`, 04 문서 | 단체 master와 참여 단체 구분 |
| REQ_WM5_007 | WEB | 단체 정보 조회 | 수정 필요 | farmer-groups/business-management 조회는 있으나 단체 관리 화면과 다름 | `farmer-groups-api.ts`, 04 문서 | “농가 그룹/사업 참여 현황 조회”로 수정 |
| REQ_WM5_008 | WEB | 단체 정보 수정 | 보류/미구현 | 단체 master 수정 화면 없음 | 04 문서 | 보류 |
| REQ_WM5_009 | WEB | 단체 정보 삭제 | 보류/미구현 | 단체 삭제 기능 없음 | 04 문서 | 보류 |
| REQ_WM6_001 | WEB | 개인정보 수정 전 비밀번호 확인 | 보류/미구현 | 설정/프로필 화면 연결 없음 | 04 문서 | 관리자 프로필 화면 필요 |
| REQ_WM6_002 | WEB | 이장님 개인정보 수정 | 보류/미구현 | Backend profile API는 있으나 WEB 호출 없음 | `admin.py`, 04 문서 | 화면 연결 필요 |
| REQ_WM6_003 | WEB | 누락 농가 알림 발송 | 수정 필요 | 미이행 농가 notification 생성은 구현. SMS 발송은 확인 안 됨 | `dashboard/page.tsx`, 04 문서 | SMS 표현 제거 또는 별도 연동으로 분리 |
| REQ_WM6_004 | WEB | 마을 이행 리포트 생성 및 다운로드 | 보류/미구현 | WEB 리포트 다운로드 호출 없음 | 04 문서 | APP PDF/WEB ZIP과 분리 필요 |
| REQ_WG_001 | WEB | 관리자 권한 제어 | 확인필요 | Backend 로그인은 있으나 WEB 세션/권한 적용 확인 안 됨 | 04 문서 | 인증/권한 설계 확인 필요 |
| REQ_WG_002 | WEB | 개인정보 암호화 저장 | 확인필요 | 코드 분석만으로 저장 암호화 전반 판단 어려움 | 02, 04 문서 | DB/운영 보안 확인 필요 |
| REQ_WG_003 | WEB | 대시보드 조회 성능 관리 | 확인필요 | 병렬 조회/fallback은 있으나 성능 기준 테스트 없음 | `dashboard/page.tsx`, 04 문서 | 성능 기준 수립 필요 |
| REQ_WG_004 | WEB | 중복 등록 방지 | 확인필요 | 일부 backend duplicate 처리 가능성 있으나 화면 기준 불명확 | 02, 04 문서 | 중복 정책 확인 필요 |
| REQ_WG_005 | WEB | 관리자 작업 이력 저장 | 확인필요 | 작업 로그 저장 확인 안 됨 | 02, 04 문서 | 로그 요구사항 유지, 구현 확인 필요 |
| REQ_WG_006 | WEB | 외부 연동 장애 대응 | 유지 | 주요 API 실패/로딩/빈 데이터 처리 확인 | 04 문서 | 유지, 외부 API별 fallback 명시 |
| REQ_WG_007 | WEB | AI·RAG 근거 표시 및 판단 제한 | 수정 필요 | AI 챗봇/추천은 있으나 근거 표시 범위 제한적 | `HelpChat.tsx`, 04 문서 | 근거 표시 수준 수정 |
| REQ_WG_008 | WEB | 일정 재계산 데이터 정합성 관리 | 수정 필요 | To-do 생성은 있으나 수동 캘린더는 localStorage | `FarmingCalendarSection.tsx`, 04 문서 | 서버 일정 저장/재계산 분리 |
| REQ_WG_009 | WEB | 증빙 파일 보관 및 접근 제어 | 확인필요 | 파일 저장 구조는 있으나 접근 제어 확인 어려움 | 02, 04 문서 | 운영 파일 정책 확인 필요 |
| REQ_AM0_001 | APP | 초대 URL 조회 | 보류/미구현 | APP 가입 초대 URL 처리 화면/호출 확인 안 됨 | 03 문서 | APP 가입 플로우 보류 |
| REQ_AM0_002 | APP | 외부 본인인증 요청 | 보류/미구현 | APP 외부 본인인증 연동 없음 | 03 문서 | 보류 |
| REQ_AM0_003 | APP | 비밀번호 등록 | 보류/미구현 | 비밀번호 등록 화면/DB 저장 확인 안 됨 | 03 문서 | 보류 |
| REQ_AM0_004 | APP | 농업인 가입 완료 처리 | 보류/미구현 | 가입 완료 처리 확인 안 됨 | 03 문서 | 보류 |
| REQ_AM0_005 | APP | 앱실행 시작화면 | 유지 | Splash/LoginSelect/ManualLogin 화면 확인 | `LocavilleApp.tsx`, 03 문서 | 유지 |
| REQ_AM0_006 | APP | 농업인 로그인 처리 | 수정 필요 | 로그인 화면은 있으나 실제 인증 API 연동 없음 | `ManualLoginScreen.tsx`, 03 문서 | “수동 진입/샘플 로그인”으로 수정 또는 인증 구현 |
| REQ_AM1_001 | APP | 현재 위치 날씨 조회 | 수정 필요 | 날씨 위젯은 구현됐으나 현재 위치 GPS가 아니라 ville/crop 기준 | `WeatherWidget.tsx`, 03 문서 | “마을 기준 오늘 날씨 조회”로 수정 |
| REQ_AM1_002 | APP | 날짜별 TO-DO LIST | 유지 | 홈/일지에서 `/todo/today` 기반 선택일 todo 조회 | `HomeScreen.tsx`, `JournalScreen.tsx`, 03 문서 | 유지 |
| REQ_AM1_003 | APP | 음성 입력 시작 | 유지 | 마이크/MediaRecorder/VAD/STT 흐름 확인 | `VoiceInputScreen.tsx`, 03 문서 | 유지 |
| REQ_AM1_004 | APP | 음성 텍스트 변환 결과 조회 | 유지 | `/ai/stt` 호출 확인 | `ai-service.ts`, 03 문서 | 유지 |
| REQ_AM1_005 | APP | 대화형 영농기록 저장 | 유지 | voice session finalize 후 `/diary` 저장 확인 | `VoiceInputScreen.tsx`, 03 문서 | 유지 |
| REQ_AM1_006 | APP | 누락 항목 쉬운 문장 및 TTS 안내 | 유지 | `/ai/tts`, voice question/fallback 확인 | `VoiceInputScreen.tsx`, 03 문서 | 유지 |
| REQ_AM1_007 | APP | 영농활동 텍스트 입력 | 유지 | 직접입력 화면 확인 | `ManualInputScreen.tsx`, 03 문서 | 유지 |
| REQ_AM1_008 | APP | 직접입력 영농기록 저장 | 유지 | `POST /diary` 저장 확인 | `diary-service.ts`, 03 문서 | 유지 |
| REQ_AM1_009 | APP | 사진 증빙 촬영 | 유지 | file input camera capture, preview 확인 | `PhotoInputScreen.tsx`, 03 문서 | 유지 |
| REQ_AM1_010 | APP | 사진 품질 검증 및 재촬영 안내 | 보류/미구현 | OpenCV/품질검증 구현 근거 없음 | 03 문서 | 품질검증 요구 보류 |
| REQ_AM1_011 | APP | 워터마크 및 AI 후보 라벨 생성 | 보류/미구현 | Vision API client는 있으나 화면 사용/워터마크 없음 | `ai-service.ts`, 03 문서 | 별도 기능으로 재정의 |
| REQ_AM1_012 | APP | 영수증 이미지 등록 및 OCR 확인 | 보류/미구현 | OCR 확인 화면/연동 없음 | 03 문서 | 보류 |
| REQ_AM1_013 | APP | 사진 증빙 저장 및 라벨 확정 | 수정 필요 | 업로드는 구현, 라벨 확정/To-do context 반영은 제한적 | `PhotoInputScreen.tsx`, 03 문서 | “사진 증빙 업로드” 중심으로 수정 |
| REQ_AM2_001 | APP | 주간 To-do 목록 조회 | 수정 필요 | 주간 UI는 있으나 주간 범위 API가 아니라 선택일 `/todo/today` 중심 | `JournalScreen.tsx`, 03 문서 | 선택일/주간 UI로 수정 |
| REQ_AM2_002 | APP | 사업별 To-do 목록 조회 | 보류/미구현 | APP 사업 상세에서 사업별 To-do 조회 근거 없음 | 03 문서 | 필요 시 추가 API 연결 |
| REQ_AM2_003 | APP | 완료한 일 목록 조회 | 유지 | 완료 todo/일지 목록 표시 확인 | `JournalScreen.tsx`, 03 문서 | 유지 |
| REQ_AM2_004 | APP | 일별 영농기록 상세 조회 | 유지 | 일지 상세 및 연결 증빙 조회 확인 | `JournalDetailScreen.tsx`, 03 문서 | 유지 |
| REQ_AM2_005 | APP | 영농기록 수정 | 보류/미구현 | 일지 수정 화면/API 호출 없음 | 03 문서 | 보류 |
| REQ_AM2_006 | APP | 사진 증빙 재촬영 및 수정 | 수정 필요 | 재촬영 필요 알림과 사진 등록은 있으나 기존 증빙 수정 흐름은 없음 | `HomeScreen.tsx`, `PhotoInputScreen.tsx`, 03 문서 | 재촬영 등록 흐름으로 수정 |
| REQ_AM2_007 | APP | 수정 영농기록 저장 | 보류/미구현 | 수정 저장 API 연결 없음 | 03 문서 | 보류 |
| REQ_AM2_008 | APP | 영농기록 추가 화면 이동 | 유지 | 기록 추가가 홈/입력 화면으로 이동 | `JournalScreen.tsx`, 03 문서 | 유지 |
| REQ_AM2_009 | APP | 네트워크 오류 시 영농기록 임시저장 | 확인필요 | localStorage 모드는 있으나 네트워크 오류 임시저장 요구와 동일한지 불명확 | `diary-repository.ts`, 03 문서 | 임시저장 정책 확인 필요 |
| REQ_AM3_001 | APP | 참여 사업 목록 조회 | 유지 | `/ville-project` 사업 목록 확인 | `BusinessScreen.tsx`, 03 문서 | 유지 |
| REQ_AM3_002 | APP | 사업별 이행 상세 조회 | 유지 | 사업 상세, 증빙 목록, 활동 표시 확인 | `BusinessDetailScreen.tsx`, 03 문서 | 유지 |
| REQ_AM3_003 | APP | 체크리스트 매칭 결과 조회 | 수정 필요 | computed/missing evidence는 있으나 Rule Engine 체크리스트는 없음 | 03 문서 | To-do/evidence 상태 안내로 수정 |
| REQ_AM3_004 | APP | 남은 증빙 및 다음 할 일 안내 조회 | 수정 필요 | 재촬영 알림/증빙 목록은 있으나 명시적 남은 증빙 안내는 제한적 | 03 문서 | 누락 증빙 API 사용 여부 확인 |
| REQ_AM3_005 | APP | 사업기록 추가 화면 이동 | 유지 | 사업 상세/홈에서 사진 등록 이동 확인 | 03 문서 | 유지 |
| REQ_AM3_006 | APP | 사업기록 PDF 다운로드 | 유지 | `/reports/project-pdf` 다운로드 확인 | `BusinessDetailScreen.tsx`, 03 문서 | 유지 |
| REQ_AM3_007 | APP | 최종 제출 데이터 요약 조회 | 보류/미구현 | 최종 제출 요약 화면/API 확인 안 됨 | 03 문서 | 보류 |
| REQ_AM4_001 | APP | FAQ 목록 조회 | 수정 필요 | 도움말 quick question은 있으나 DB FAQ 조회 없음 | `HelpScreen.tsx`, 03 문서 | 고정 quick question/도움말로 수정 |
| REQ_AM4_002 | APP | RAG 챗봇 질문 및 답변 조회 | 유지 | `/ai/chat/stream` 도움말 확인 | `HelpScreen.tsx`, 03 문서 | 유지 |
| REQ_AM4_003 | APP | RAG 답변 근거 문서 표시 | 수정 필요 | 답변은 표시되나 근거 문서 표시 범위 불명확 | `HelpScreen.tsx`, 03 문서 | 근거 표시 요구 축소 또는 UI 추가 |
| REQ_AM5_001 | APP | 내 정보 조회 | 유지 | `/user-ville/current-user`, 사업 목록 조회 확인 | `SettingsScreen.tsx`, 03 문서 | 유지 |
| REQ_AM5_002 | APP | 내 정보 수정 화면 이동 | 유지 | 설정 편집 UI 확인 | `SettingsScreen.tsx`, 03 문서 | 유지 |
| REQ_AM5_003 | APP | 정보수정 전 비밀번호 확인 | 수정 필요 | 비밀번호 모달은 있으나 backend 검증 없음 | `SettingsScreen.tsx`, 03 문서 | local UI 또는 API 검증으로 명확화 |
| REQ_AM5_004 | APP | 내 정보 수정 | 수정 필요 | 화면 local 편집 중심, 저장 API 없음 | `SettingsScreen.tsx`, 03 문서 | 저장 API 필요 |
| REQ_AM5_005 | APP | 내 정보 저장 | 보류/미구현 | 실제 저장 호출 확인 안 됨 | 03 문서 | 보류 |
| REQ_AM5_006 | APP | 알림 설정 관리 | 수정 필요 | toggle UI는 local state, backend 저장 없음 | `SettingsScreen.tsx`, 03 문서 | local 설정 또는 저장 API로 수정 |
| REQ_AM5_007 | APP | 로그아웃 처리 | 보류/미구현 | 인증/로그아웃 API 연동 없음 | 03 문서 | 인증 구현 후 정의 |
| REQ_AM5_008 | APP | 약관 문서 조회 | 수정 필요 | 약관/정책 모달은 hardcoded, DB 조회 없음 | `SettingsScreen.tsx`, 03 문서 | 정적 문서 표시로 수정 |
| REQ_AMG_001 | APP | APP 로그인 보안 관리 | 확인필요 | APP 인증 자체가 미연동 | 03 문서 | 인증 설계 후 재검토 |
| REQ_AMG_002 | APP | 개인정보 및 위치정보 보호 | 확인필요 | GPS 수집은 있으나 보호 정책은 코드만으로 판단 어려움 | `PhotoInputScreen.tsx`, 03 문서 | 운영 보안 정책 확인 |
| REQ_AMG_003 | APP | 고령 사용자 사용성 지원 | 유지 | 큰 CTA, 음성/사진 중심 UX 확인 | 03 문서 | 유지 |
| REQ_AMG_004 | APP | 모바일 터치 접근성 관리 | 유지 | 모바일 PWA형 화면/큰 버튼 확인 | 03 문서 | 유지 |
| REQ_AMG_005 | APP | 사진 증빙 파일 제한 관리 | 유지 | accept 타입 제한 확인 | `PhotoInputScreen.tsx`, 03 문서 | 유지 |
| REQ_AMG_006 | APP | 위치정보 수집 실패 처리 | 유지 | GPS 미지원/거부 상태 안내 확인 | `PhotoInputScreen.tsx`, 03 문서 | 유지 |
| REQ_AMG_007 | APP | 사진 저장 성능 관리 | 확인필요 | 업로드 상태는 있으나 성능 기준 없음 | 03 문서 | 성능 기준 수립 필요 |
| REQ_AMG_008 | APP | 증빙 회차 중복 방지 | 확인필요 | 중복 방지 정책 코드상 판단 어려움 | 02, 03 문서 | DB/서비스 정책 확인 필요 |
| REQ_AMG_009 | APP | 농업인 활동 이력 저장 | 확인필요 | 일지/증빙 저장은 있으나 활동 로그DB는 확인 안 됨 | 03 문서 | 로그 요구 분리 |
| REQ_AMG_010 | APP | APP 외부 연동 장애 대응 | 유지 | STT/TTS/AI/weather 실패 fallback 확인 | 03 문서 | 유지 |
| REQ_AMG_011 | APP | AI 후보 결과 사용자 확정 필수 | 수정 필요 | 음성 저장 전 확인은 있으나 Vision 후보 확정은 미사용 | `VoiceInputScreen.tsx`, 03 문서 | 음성 draft 확인과 Vision 확정 분리 |
| REQ_AMG_012 | APP | 사진 원본·워터마크본 분리 저장 | 보류/미구현 | 워터마크본 분리 저장 확인 안 됨 | 02, 03 문서 | 보류 |
| REQ_AMG_013 | APP | 필수값 보완 요청 상태 관리 | 유지 | 직접입력 검증/업로드 오류/음성 fallback 확인 | 03 문서 | 유지 |
| REQ_AMG_014 | APP | RAG 근거 없는 답변 제한 | 수정 필요 | 챗봇 fallback/stream은 있으나 근거 제한 정책 표시 불명확 | `HelpScreen.tsx`, 03 문서 | 답변 제약 UI/정책 확인 필요 |

## 2. 신규 요구사항 후보표

| APP/WEB | 신규 요구사항ID 제안 | 기능명 | 상세설명 요약 | 서비스연동 | 우선순위 | 개발여부 | 코드 근거 |
|---|---|---|---|---|---|---|---|
| APP | REQ_AM1_014 | 홈 재촬영 필요 증빙 알림 | 농업인은 홈에서 재촬영 필요 증빙을 확인하고 사진 등록으로 이동할 수 있어야 한다. | APP / Evidence API | S3 | 구현 | `HomeScreen.tsx`, `GET /evidence`, 03 문서 |
| APP | REQ_AM1_015 | To-do 사진 촬영 가이드 | 농업인은 To-do 카드에서 작업별 사진 촬영 안내를 확인할 수 있어야 한다. | APP | S4 | 구현 | `TodoPhotoGuideModal.tsx`, 03 문서 |
| APP | REQ_AM2_010 | 저장 완료 결과 화면 | 농업인은 일지 저장 후 입력 방식과 저장 결과를 확인하고 홈/일지로 이동할 수 있어야 한다. | APP | S3 | 구현 | `SaveCompleteScreen.tsx`, 03 문서 |
| APP | REQ_AM3_008 | 사업별 증빙 목록 확인 | 농업인은 사업 상세에서 해당 사업의 증빙자료 목록을 확인할 수 있어야 한다. | APP / Evidence API | S3 | 구현 | `BusinessDetailScreen.tsx`, 03 문서 |
| APP | REQ_AM4_004 | 도움말 스트리밍 답변 표시 | 농업인은 도움말 질문에 대해 streaming 방식으로 답변을 확인할 수 있어야 한다. | APP / AI Chat Stream API | S3 | 구현 | `HelpScreen.tsx`, `ai-service.ts` |
| APP | REQ_AM5_009 | 농가 도우미 모드 | 도우미 관계가 있는 사용자는 동의 후 상대 농가 기준으로 기록을 도와줄 수 있어야 한다. | APP / Farmer Helper API | S3 | 구현 | `LocavilleApp.tsx`, `farm-helper-service.ts` |
| APP | REQ_AM5_010 | 알림 목록 및 읽음 처리 | 농업인은 알림 목록과 미확인 수를 확인하고 읽음 처리할 수 있어야 한다. | APP / Notification API | S3 | 구현 | `NotificationPanel.tsx`, `notification-service.ts` |
| WEB | REQ_WM1_007 | 최근 증빙 갤러리 | 관리자는 대시보드에서 최근 등록된 증빙 사진을 확인할 수 있어야 한다. | WEB / Admin Recent Evidence API | S3 | 구현 | `dashboard/page.tsx`, `GET /admin/recent-evidence` |
| WEB | REQ_WM1_008 | 미이행 농가 알림 생성 | 관리자는 미이행 농가에 알림을 생성할 수 있어야 한다. | WEB / Admin Notification API | S3 | 구현 | `notifyLaggardFarmer`, 04 문서 |
| WEB | REQ_WM1_009 | 관리자 월별 영농 캘린더 | 관리자는 To-do 기반 월별 영농 캘린더를 확인할 수 있어야 한다. | WEB / Admin Todo Status API | S3 | 구현 | `FarmingCalendarSection.tsx` |
| WEB | REQ_WM1_010 | 관리자 수동 일정 임시 추가 | 관리자는 캘린더에 수동 일정을 추가하고 삭제할 수 있어야 한다. 현재는 localStorage 임시 저장이다. | WEB localStorage | S4 | 부분구현 | `FarmingCalendarSection.tsx` |
| WEB | REQ_WM1_011 | 상단 농업기상/주간 날씨 | 관리자는 모든 WEB 화면 상단에서 주간 날씨를 확인할 수 있어야 한다. | WEB / Admin Agri Weather API | S3 | 구현 | `Shell.tsx`, `Header.tsx` |
| WEB | REQ_WM1_012 | AI 추천 읽어주기 | 관리자는 대시보드 AI 추천 문구를 음성으로 들을 수 있어야 한다. | WEB / AI TTS API | S4 | 구현 | `dashboard/page.tsx`, `fetchTtsAudio` |
| WEB | REQ_WM4_006 | 영농일지 관리자 삭제 | 관리자는 잘못 기록된 영농일지를 삭제할 수 있어야 한다. | WEB / Admin Diary Delete API | S3 | 구현 | `journal/page.tsx`, `DELETE /admin/diaries/{diary_id}` |
| WEB | REQ_WM4_007 | 증빙자료 관리자 삭제 | 관리자는 부적절한 증빙자료를 삭제할 수 있어야 한다. | WEB / Admin Evidence Delete API | S3 | 구현 | `evidence/page.tsx`, `DELETE /admin/evidence/{evidence_id}` |
| WEB | REQ_WM4_008 | 증빙 재촬영 요청 | 관리자는 검토 필요 증빙에 재촬영 요청 메시지를 남길 수 있어야 한다. | WEB / Evidence Patch API | S3 | 구현 | `ReviewNeededCard.tsx` |
| WEB | REQ_WM6_005 | 기록 도우미 배정/해제 | 관리자는 도우미와 도움 받는 주민을 배정하거나 해제할 수 있어야 한다. | WEB / Admin Farm Helper API | S3 | 구현 | `farm-helpers/page.tsx` |
| WEB | REQ_WM6_006 | 신규 일지/증빙 메뉴 배지 | 관리자는 마지막 확인 이후 새 일지/증빙 건수를 사이드바 배지로 확인할 수 있어야 한다. | WEB / Admin New Counts API | S4 | 구현 | `Sidebar.tsx`, `GET /admin/new-counts` |

## 3. 수정 필요 요구사항표

| 기존 요구사항ID | 기능명 | 기존 내용 문제 | 수정 제안 | 코드 근거 |
|---|---|---|---|---|
| REQ_WM0_007 | 이장님 WEB화면 이동 | 로그인 성공 기반 이동으로 되어 있으나 현재는 단순 redirect | 인증 구현 전에는 기본 진입/대시보드 redirect로 수정 | `web_user/app/page.tsx` |
| REQ_WM1_002 | 등록 주민 수 조회 | APP 연동 표현이 현재 코드와 맞지 않음 | 가입완료/초대발송/가입대기 상태 조회로 수정 | `VillageResidentsPage.tsx` |
| REQ_WM1_006 | 관리자 RAG 챗봇 질문 및 근거 조회 | 근거 표시 범위가 코드상 제한적 | streaming 도움말 챗봇으로 수정하고 근거 표시는 확인필요로 분리 | `HelpChat.tsx` |
| REQ_WM2_003 | 농가·필지 관계 관리 | 필지 조회는 있으나 관계 저장/관리 없음 | 농가 필지 조회로 축소 또는 관리 저장 API 추가 | `farmer-api.ts` |
| REQ_WM2_004 | 주민 정보 수정 | API client만 있고 화면 저장 호출 없음 | 상세 수정 모달에서 `updateResident` 호출 연결 | `ResidentDetailPage.tsx`, `admin-api.ts` |
| REQ_WM2_007 | 주민 가입링크 발송 | SMS/가입링크 실제 발송이 확인되지 않음 | 주민 초대 상태 저장으로 수정하거나 SMS 연동 추가 | `ResidentListTable.tsx` |
| REQ_WM3_006 | 사업 일정 규칙 템플릿 관리 | 템플릿 관리 기능 없음 | 사업 활동 기간/To-do 생성 규칙으로 재정의 | `project/[prj_id]/page.tsx`, `engage/[prj_id]/page.tsx` |
| REQ_WM5_003 | 마을 정보 조회 | 마을 관리 화면이 아니라 Shell context 조회임 | 현재 사용자/마을 context 조회로 수정 | `Shell.tsx` |
| REQ_WM6_003 | 누락 농가 알림 발송 | SMS 모듈이 아니라 notification 생성 중심 | 앱 알림/notification 생성으로 수정 | `dashboard/page.tsx` |
| REQ_AM1_001 | 현재 위치 날씨 조회 | GPS 현재 위치가 아니라 마을/작물 기준 날씨 | 마을 기준 오늘 날씨 조회로 수정 | `WeatherWidget.tsx` |
| REQ_AM1_013 | 사진 증빙 저장 및 라벨 확정 | 라벨 확정과 selected To-do metadata 반영이 제한적 | 사진 증빙 업로드로 축소하고 To-do 연결 보강 필요 | `PhotoInputScreen.tsx` |
| REQ_AM2_001 | 주간 To-do 목록 조회 | 주간 범위 API가 아니라 선택일 `/todo/today` 중심 | 주간 UI + 선택일 To-do 조회로 수정 | `JournalScreen.tsx` |
| REQ_AM3_003 | 체크리스트 매칭 결과 조회 | Rule Engine 근거 없음 | To-do/evidence 상태 매칭 결과로 수정 | 03 문서 |
| REQ_AM4_001 | FAQ 목록 조회 | DB FAQ 조회 없음 | 고정 빠른 질문/도움말로 수정 | `HelpScreen.tsx` |
| REQ_AM5_003 | 정보수정 전 비밀번호 확인 | backend 검증 없음 | local 확인 UI 또는 API 검증으로 분리 | `SettingsScreen.tsx` |
| REQ_AM5_004 | 내 정보 수정 | 실제 저장 API 호출 없음 | 화면 수정과 저장 기능 분리 | `SettingsScreen.tsx` |
| REQ_AMG_011 | AI 후보 결과 사용자 확정 필수 | 음성 draft 확인은 있으나 Vision 후보 확정은 미사용 | 음성 확인/사진 AI 라벨 확정을 별도 요구사항으로 분리 | `VoiceInputScreen.tsx`, `ai-service.ts` |

## 4. 보류/미구현 요구사항표

| 기존 요구사항ID | 기능명 | 미구현 판단 근거 | 향후 처리 제안 |
|---|---|---|---|
| REQ_WM0_001~REQ_WM0_006 | WEB 가입/본인인증 전체 | WEB 가입 토큰, 외부 본인인증, 계정 등록 화면/호출 없음 | 관리자 가입 플로우 유지 여부 결정 |
| REQ_WM0_008 | APP 이동 경로 제공 | WEB에서 APP 이동 제공 근거 없음 | 현재 서비스 방향과 맞지 않으면 삭제후보 |
| REQ_WM2_005 | 주민 정보 삭제 | 화면/API 없음 | 삭제 대신 비활성화 정책 검토 |
| REQ_WM3_005 | 마을 제출 패키지 ZIP 생성 | ZIP 생성 API/WEB 호출 없음 | PDF 리포트와 구분해 보류 |
| REQ_WM3_012 | 참여 사업 삭제 | 사업 삭제 화면/호출 없음 | 삭제 권한/정책 확정 필요 |
| REQ_WM4_005 | 영수증 OCR 결과 조회 및 보정 요청 | OCR 화면/연동 없음 | OCR 기능 필요성 재검토 |
| REQ_WM5_001~REQ_WM5_009 | 마을/단체 master 관리 | 현재는 context 조회, 주소검색, 참여 단체 등록 위주 | 마을/단체 관리 별도 모듈 필요 여부 확인 |
| REQ_WM6_001~REQ_WM6_002 | 관리자 개인정보 수정 | Backend profile API는 있으나 WEB 화면/호출 없음 | 설정 화면 추가 시 구현 |
| REQ_WM6_004 | 마을 이행 리포트 생성 및 다운로드 | WEB 다운로드 호출 없음 | 리포트 산출물 범위 결정 |
| REQ_AM0_001~REQ_AM0_004 | APP 가입/본인인증 | APP 가입/인증 플로우 없음 | APP 인증 정책 확정 후 재작성 |
| REQ_AM0_006 | 농업인 로그인 처리 | 로그인 화면은 있으나 실제 인증 API 없음 | 샘플 진입인지 실인증인지 결정 |
| REQ_AM1_010 | 사진 품질 검증 및 재촬영 안내 | OpenCV/품질검증 근거 없음 | 품질검증 도입 여부 결정 |
| REQ_AM1_011 | 워터마크 및 AI 후보 라벨 생성 | Vision client는 있으나 화면 사용/워터마크 없음 | AI 라벨/워터마크 범위 분리 |
| REQ_AM1_012 | 영수증 이미지 등록 및 OCR 확인 | OCR 연동 없음 | 영수증 요구 보류 |
| REQ_AM2_002 | 사업별 To-do 목록 조회 | APP 사업 상세에서 To-do 조회 없음 | 사업 상세 To-do API 연결 검토 |
| REQ_AM2_005~REQ_AM2_007 | 영농기록 수정/수정저장 | 일지 수정 화면/API 없음 | 수정 기능 필요 시 추가 구현 |
| REQ_AM3_007 | 최종 제출 데이터 요약 조회 | 최종 제출 요약 화면/API 없음 | 제출 프로세스 정의 필요 |
| REQ_AM5_005 | 내 정보 저장 | 실제 저장 호출 없음 | User profile update API 필요 |
| REQ_AM5_007 | 로그아웃 처리 | 인증/로그아웃 API 없음 | 인증 구현 후 정의 |
| REQ_AMG_012 | 사진 원본·워터마크본 분리 저장 | 워터마크본 저장 확인 안 됨 | 파일 저장 정책 확정 |

## 삭제후보

| 기존 요구사항ID | APP/WEB | 기능명 | 삭제후보 사유 | 처리 제안 |
|---|---|---|---|---|
| REQ_WM0_008 | WEB | APP 이동 경로 제공 | 최신 WEB 관리자 코드에서 APP 이동 제공 흐름 없음 | 서비스 기획상 필요 없으면 삭제후보 |
| REQ_WM3_005 | WEB | 마을 제출 패키지 ZIP 생성 | 현재 코드에는 ZIP 패키지 산출물 없음. 리포트는 별도 PDF 성격 | ZIP 요구가 사라졌다면 삭제후보 |
| REQ_WM4_005 | WEB | 영수증 OCR 결과 조회 및 보정 요청 | OCR 기능은 현재 APP/WEB 주요 흐름에 없음 | 영수증 OCR 제외 시 삭제후보 |
| REQ_AM1_012 | APP | 영수증 이미지 등록 및 OCR 확인 | APP 사진 증빙 업로드는 있으나 영수증 OCR 확인 없음 | OCR 제외 시 삭제후보 |

## 기획자 확인필요

- 신규 ID는 기존 ID 체계를 따라 제안했으나, 실제 엑셀 반영 전 기획자 확인필요
- 주민 수정은 API client가 있으나 화면 저장 호출이 없어 개발여부 판단 확인필요
- 주간 농사정보는 backend/API client가 있으나 WEB 화면 직접 호출이 없어 요구사항 유지 범위 확인필요
- APP 사진 증빙의 selected To-do metadata 반영은 부분구현으로, 요구사항 반영 시 보강 필요
- 관리자/농업인 인증 플로우는 최신 코드 기준 대부분 미구현 또는 화면-only 상태이므로 유지 여부 확인필요

