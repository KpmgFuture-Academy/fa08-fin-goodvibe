# 01. Repository Structure Analysis

작성일: 2026-06-02

## 현재 브랜치

- 현재 브랜치: `main`
- HEAD: `6a7e0b8 (HEAD -> main, origin/main, origin/HEAD) passwd 기준 백엔드 통합 및 대시보드 개선`
- 분석 시작 시 `git status --short` 결과: 변경 파일 없음
- 문서 생성 후 `git status --short` 결과: `?? locaville/docs/requirements_analysis/`

## 최근 커밋 요약

최근 30개 커밋 기준으로 요구사항 분석에 영향을 줄 수 있는 흐름은 다음과 같다.

- `6a7e0b8` passwd 기준 백엔드 통합 및 대시보드 개선
- `a3c3b36` web_admin 프로젝트 관리 화면 개발 - 2
- `61c3eda`, `def3f3b` 지급 관리 삭제
- `03ea979` 리팩토링 후 pnpm 관련 업데이트
- `02daeb6` 패키지 명 변경
- `c6df1ab` `v0_farmer` -> `app_user`, `v0_chief` -> `web_user` 디렉토리 개명
- `72748b4` user_ville view 컬럼 fix + v0_farmer 컴포넌트 평탄화
- `4d247aa` 마을 현황 redesign + 알림/기록 도우미 시스템 + 고령 UX 개선
- `0e10991` web_admin 화면 분리
- `1f15d5c` 이장님 기능 업데이트
- `df24444` 대시보드 작업 연동
- `250b446` v0_farmer 모바일 톤 통일 및 backend 농가 컨텍스트 연동

참고: 현재 요구사항 분석 대상은 `locaville/backend`, `locaville/app_user`, `locaville/web_user`이다. 과거 명칭인 `v0_farmer`, `v0_chief`도 저장소에 남아 있으나, 최근 커밋에서 현재 명칭으로 개명된 이력이 확인된다.

## 분석 대상 폴더 구조

### Backend: `locaville/backend`

주요 구조:

- `app/main.py`: FastAPI 앱 생성 및 라우터 등록
- `app/routers/`: API 라우터
- `app/services/`: 업무 로직
- `app/repositories/`: RDB, 파일 저장소, JSON 저장소 접근 계층
- `app/schemas/`: Pydantic 응답/요청 스키마
- `app/utils/`: 공통 유틸리티
- `app/core/`, `app/queries/`: DB 및 쿼리 관련 보조 구조로 보임
- `data/`: JSON 기반 로컬 데이터 파일
- `uploads/`: 업로드 파일 저장 경로
- `rag_sources/`: RAG 원천/청크 자료
- `scripts/`: 수집, 스모크 테스트, 정리 스크립트
- `docs/`: 백엔드 API/데이터 흐름 문서

등록된 주요 라우터:

- `health`, `ai`, `diary`, `evidence`, `admin`, `engage`, `project`, `user_ville`, `demo`, `todo`, `report`, `ville_project`, `weather`, `farm_job`, `business_management`, `farmer`

라우터 파일 위치:

- `locaville/backend/app/routers/health.py`
- `locaville/backend/app/routers/ai.py`
- `locaville/backend/app/routers/diary.py`
- `locaville/backend/app/routers/evidence.py`
- `locaville/backend/app/routers/admin.py`
- `locaville/backend/app/routers/engage.py`
- `locaville/backend/app/routers/project.py`
- `locaville/backend/app/routers/user_ville.py`
- `locaville/backend/app/routers/demo.py`
- `locaville/backend/app/routers/todo.py`
- `locaville/backend/app/routers/report.py`
- `locaville/backend/app/routers/ville_project.py`
- `locaville/backend/app/routers/weather.py`
- `locaville/backend/app/routers/farm_job.py`
- `locaville/backend/app/routers/business_management.py`
- `locaville/backend/app/routers/farmer.py`

타입/스키마 정의 위치:

- `locaville/backend/app/schemas/ai.py`
- `locaville/backend/app/schemas/diary.py`
- `locaville/backend/app/schemas/evidence.py`
- `locaville/backend/app/schemas/engage.py`
- `locaville/backend/app/schemas/project.py`
- `locaville/backend/app/schemas/todo.py`

### App 사용자 화면: `locaville/app_user`

Next.js App Router 기반 모바일/PWA 성격의 사용자 앱으로 보인다.

주요 구조:

- `app/`: Next.js 라우터
- `components/`: 화면 단위 컴포넌트
- `lib/`: API 호출, 저장소, 타입, 표시 로직, 도메인 서비스
- `public/`: 로고, 날씨 아이콘, VAD 모델 파일
- `styles/`: 전역 스타일

라우터/페이지 파일 위치:

- `locaville/app_user/app/layout.tsx`
- `locaville/app_user/app/page.tsx`
- `locaville/app_user/app/globals.css`

컴포넌트 폴더 위치:

- `locaville/app_user/components/`

주요 화면 컴포넌트:

- `LocavilleApp.tsx`
- `HomeScreen.tsx`
- `BusinessScreen.tsx`
- `BusinessDetailScreen.tsx`
- `JournalScreen.tsx`
- `JournalDetailScreen.tsx`
- `ManualInputScreen.tsx`
- `PhotoInputScreen.tsx`
- `VoiceInputScreen.tsx`
- `SaveCompleteScreen.tsx`
- `NotificationPanel.tsx`
- `HelpScreen.tsx`
- `SettingsScreen.tsx`

API client 또는 fetch 호출 파일 위치:

- `locaville/app_user/lib/data-source.ts`
- `locaville/app_user/lib/ai-service.ts`
- `locaville/app_user/lib/business-service.ts`
- `locaville/app_user/lib/diary-repository.ts`
- `locaville/app_user/lib/evidence-repository.ts`
- `locaville/app_user/lib/evidence-service.ts`
- `locaville/app_user/lib/farm-helper-service.ts`
- `locaville/app_user/lib/farm-job-service.ts`
- `locaville/app_user/lib/notification-service.ts`
- `locaville/app_user/lib/parcel-service.ts`
- `locaville/app_user/lib/todo-service.ts`
- `locaville/app_user/lib/user-profile-service.ts`
- `locaville/app_user/lib/weather-service.ts`
- `locaville/app_user/components/BusinessDetailScreen.tsx`

타입 정의 파일 위치:

- `locaville/app_user/lib/diary-types.ts`
- `locaville/app_user/lib/evidence-types.ts`
- 기타 도메인별 타입은 서비스 파일 내부에 함께 정의된 것으로 보인다.

### Web 사용자 화면: `locaville/web_user`

Next.js App Router 기반 이장님/웹 사용자 대시보드로 보인다.

주요 구조:

- `app/`: Next.js 라우터 및 페이지
- `components/`: 공통 레이아웃, 대시보드, 주민, 도움말, UI 컴포넌트
- `lib/`: API client, 타입, 표시/계산 유틸리티
- `public/`: 샘플 이미지

라우터/페이지 파일 위치:

- `locaville/web_user/app/page.tsx`
- `locaville/web_user/app/layout.tsx`
- `locaville/web_user/app/dashboard/page.tsx`
- `locaville/web_user/app/engage/page.tsx`
- `locaville/web_user/app/engage/[prj_id]/page.tsx`
- `locaville/web_user/app/evidence/page.tsx`
- `locaville/web_user/app/farm-helpers/page.tsx`
- `locaville/web_user/app/farmer-groups/page.tsx`
- `locaville/web_user/app/journal/page.tsx`
- `locaville/web_user/app/project/page.tsx`
- `locaville/web_user/app/project/[prj_id]/page.tsx`
- `locaville/web_user/app/project/new/page.tsx`
- `locaville/web_user/app/projects/page.tsx`
- `locaville/web_user/app/projects/[id]/page.tsx`
- `locaville/web_user/app/residents/page.tsx`
- `locaville/web_user/app/residents/[id]/page.tsx`

컴포넌트 폴더 위치:

- `locaville/web_user/components/`
- `locaville/web_user/components/dashboard/`
- `locaville/web_user/components/residents/`
- `locaville/web_user/components/help/`
- `locaville/web_user/components/ui/`

API client 또는 fetch 호출 파일 위치:

- `locaville/web_user/lib/admin-api.ts`
- `locaville/web_user/lib/engage-project-api.ts`
- `locaville/web_user/lib/farmer-api.ts`
- `locaville/web_user/lib/farmer-groups-api.ts`
- `locaville/web_user/lib/project-admin-api.ts`
- `locaville/web_user/lib/projects.ts`
- `locaville/web_user/lib/user-village-context-api.ts`
- `locaville/web_user/lib/ville-project-api.ts`
- `locaville/web_user/lib/image-url.ts`
- `locaville/web_user/components/residents/AddressSearchPanel.tsx`

타입 정의 파일 위치:

- `locaville/web_user/lib/admin-types.ts`
- `locaville/web_user/lib/engage-project-types.ts`
- `locaville/web_user/lib/farmer-groups-types.ts`
- `locaville/web_user/lib/project-admin-types.ts`
- `locaville/web_user/lib/residents-types.ts`
- `locaville/web_user/lib/user-village-context-types.ts`

## 최근 변경 파일 목록

최근 15개 커밋 중 분석 대상 폴더에서 변경된 파일은 다음과 같다.

### `6a7e0b8` passwd 기준 백엔드 통합 및 대시보드 개선

- `locaville/web_user/app/dashboard/page.tsx`
- `locaville/web_user/app/globals.css`
- `locaville/web_user/components/dashboard/FarmingCalendarSection.tsx`
- `locaville/web_user/components/residents/ResidentDetailPage.tsx`
- `locaville/web_user/components/residents/ResidentListTable.tsx`
- `locaville/web_user/components/residents/VillageResidentsPage.tsx`
- `locaville/web_user/lib/user-village-context-types.ts`

### `a3c3b36` web_admin 프로젝트 관리 화면 개발 - 2

- `locaville/backend/app/repositories/admin_resident_rdb.py`
- `locaville/backend/app/repositories/project_rdb.py`
- `locaville/backend/app/repositories/user_ville_rdb.py`
- `locaville/backend/app/routers/project.py`
- `locaville/backend/app/schemas/project.py`
- `locaville/backend/app/services/project_service.py`

### `61c3eda` 지급 관리 삭제

- `locaville/app_user/components/NotificationPanel.tsx`
- `locaville/backend/app/repositories/evidence_rdb.py`
- `locaville/backend/app/services/admin_service.py`
- `locaville/backend/app/services/farm_helper_service.py`
- `locaville/web_user/components/Sidebar.tsx`
- `locaville/web_user/lib/admin-api.ts`

### `def3f3b` 지급 관리 삭제

- `locaville/web_user/app/payments/page.tsx`

### `03ea979` 리팩토링 후 pnpm 관련 업데이트

- `locaville/app_user/package.json`
- `locaville/app_user/pnpm-workspace.yaml`

### `02daeb6` 패키지 명 변경

- `locaville/app_user/package.json`
- `locaville/web_user/package.json`

### `c6df1ab` 디렉토리 개명

- `locaville/app_user/**`
- `locaville/web_user/**`

### `72748b4` user_ville view 컬럼 fix + 컴포넌트 평탄화

- `locaville/backend/app/repositories/user_ville_rdb.py`

### `4d247aa` 마을 현황 redesign + 알림/기록 도우미 시스템 + 고령 UX 개선

- `locaville/backend/app/main.py`
- `locaville/backend/app/repositories/evidence_rdb.py`
- `locaville/backend/app/repositories/farm_helper_rdb.py`
- `locaville/backend/app/repositories/notification_rdb.py`
- `locaville/backend/app/routers/admin.py`
- `locaville/backend/app/routers/ai.py`
- `locaville/backend/app/routers/farmer.py`
- `locaville/backend/app/schemas/ai.py`
- `locaville/backend/app/services/admin_service.py`
- `locaville/backend/app/services/admin_weather_service.py`
- `locaville/backend/app/services/ai_service.py`
- `locaville/backend/app/services/evidence_service.py`
- `locaville/backend/app/services/farm_helper_service.py`

### `0e10991` web_admin 화면 분리

- `locaville/backend/app/main.py`
- `locaville/backend/app/routers/admin.py`
- `locaville/backend/app/services/admin_auth_service.py`
- `locaville/backend/app/services/admin_profile_service.py`
- `locaville/backend/requirements.txt`

### `1f15d5c` 이장님 기능 업데이트

- `locaville/backend/app/repositories/admin_resident_rdb.py`
- `locaville/backend/app/repositories/admin_view_rdb.py`
- `locaville/backend/app/repositories/diary_rdb.py`
- `locaville/backend/app/repositories/evidence_rdb.py`
- `locaville/backend/app/repositories/farmer_rdb.py`
- `locaville/backend/app/routers/admin.py`
- `locaville/backend/app/schemas/diary.py`
- `locaville/backend/app/services/admin_resident_service.py`
- `locaville/backend/app/services/admin_service.py`
- `locaville/backend/app/services/admin_weather_service.py`
- `locaville/backend/app/services/evidence_service.py`
- `locaville/backend/app/services/farm_info_service.py`
- `locaville/backend/app/services/payment_service.py`
- `locaville/backend/app/services/weather_service.py`

### `df24444` 대시보드 작업 연동

- `locaville/backend/app/main.py`
- `locaville/backend/app/repositories/admin_view_rdb.py`
- `locaville/backend/app/repositories/business_management_rdb.py`
- `locaville/backend/app/routers/admin.py`
- `locaville/backend/app/routers/business_management.py`
- `locaville/backend/app/services/admin_service.py`
- `locaville/backend/app/services/business_management_service.py`
- `locaville/backend/app/services/kakao_address_service.py`

### `250b446` 모바일 톤 통일 및 backend 농가 컨텍스트 연동

- `locaville/backend/app/main.py`
- `locaville/backend/app/routers/farm_job.py`
- `locaville/backend/app/routers/user_ville.py`
- `locaville/backend/app/routers/weather.py`
- `locaville/backend/app/services/geocoding_service.py`
- `locaville/backend/app/services/weather_service.py`

## 요구사항 분석에 중요해 보이는 파일 목록

### APP 요구사항 기준

- `locaville/backend/app/main.py`
- `locaville/backend/app/routers/diary.py`
- `locaville/backend/app/routers/evidence.py`
- `locaville/backend/app/routers/todo.py`
- `locaville/backend/app/routers/ai.py`
- `locaville/backend/app/routers/farmer.py`
- `locaville/backend/app/routers/farm_job.py`
- `locaville/backend/app/routers/user_ville.py`
- `locaville/backend/app/routers/weather.py`
- `locaville/backend/app/services/diary_service.py`
- `locaville/backend/app/services/evidence_service.py`
- `locaville/backend/app/services/todo_service.py`
- `locaville/backend/app/services/ai_service.py`
- `locaville/backend/app/repositories/diary_rdb.py`
- `locaville/backend/app/repositories/diary_file.py`
- `locaville/backend/app/repositories/evidence_rdb.py`
- `locaville/backend/app/repositories/evidence_file.py`
- `locaville/backend/app/repositories/todo_rdb.py`
- `locaville/app_user/components/LocavilleApp.tsx`
- `locaville/app_user/components/HomeScreen.tsx`
- `locaville/app_user/components/ManualInputScreen.tsx`
- `locaville/app_user/components/PhotoInputScreen.tsx`
- `locaville/app_user/components/VoiceInputScreen.tsx`
- `locaville/app_user/components/JournalScreen.tsx`
- `locaville/app_user/components/JournalDetailScreen.tsx`
- `locaville/app_user/components/BusinessScreen.tsx`
- `locaville/app_user/components/BusinessDetailScreen.tsx`
- `locaville/app_user/components/NotificationPanel.tsx`
- `locaville/app_user/lib/todo-service.ts`
- `locaville/app_user/lib/diary-service.ts`
- `locaville/app_user/lib/diary-repository.ts`
- `locaville/app_user/lib/evidence-service.ts`
- `locaville/app_user/lib/evidence-repository.ts`
- `locaville/app_user/lib/ai-service.ts`
- `locaville/app_user/lib/business-service.ts`
- `locaville/app_user/lib/farm-helper-service.ts`
- `locaville/app_user/lib/notification-service.ts`

### WEB 요구사항 기준

- `locaville/backend/app/main.py`
- `locaville/backend/app/routers/admin.py`
- `locaville/backend/app/routers/project.py`
- `locaville/backend/app/routers/engage.py`
- `locaville/backend/app/routers/business_management.py`
- `locaville/backend/app/routers/report.py`
- `locaville/backend/app/routers/evidence.py`
- `locaville/backend/app/routers/diary.py`
- `locaville/backend/app/services/admin_service.py`
- `locaville/backend/app/services/admin_resident_service.py`
- `locaville/backend/app/services/admin_auth_service.py`
- `locaville/backend/app/services/admin_profile_service.py`
- `locaville/backend/app/services/project_service.py`
- `locaville/backend/app/services/business_management_service.py`
- `locaville/backend/app/services/payment_service.py`
- `locaville/backend/app/repositories/admin_view_rdb.py`
- `locaville/backend/app/repositories/admin_resident_rdb.py`
- `locaville/backend/app/repositories/project_rdb.py`
- `locaville/backend/app/repositories/business_management_rdb.py`
- `locaville/web_user/app/dashboard/page.tsx`
- `locaville/web_user/app/journal/page.tsx`
- `locaville/web_user/app/evidence/page.tsx`
- `locaville/web_user/app/residents/page.tsx`
- `locaville/web_user/app/residents/[id]/page.tsx`
- `locaville/web_user/app/farmer-groups/page.tsx`
- `locaville/web_user/app/farm-helpers/page.tsx`
- `locaville/web_user/app/project/page.tsx`
- `locaville/web_user/app/project/[prj_id]/page.tsx`
- `locaville/web_user/app/project/new/page.tsx`
- `locaville/web_user/app/engage/page.tsx`
- `locaville/web_user/app/engage/[prj_id]/page.tsx`
- `locaville/web_user/components/dashboard/`
- `locaville/web_user/components/residents/`
- `locaville/web_user/components/Sidebar.tsx`
- `locaville/web_user/components/Shell.tsx`
- `locaville/web_user/lib/admin-api.ts`
- `locaville/web_user/lib/admin-types.ts`
- `locaville/web_user/lib/project-admin-api.ts`
- `locaville/web_user/lib/project-admin-types.ts`
- `locaville/web_user/lib/engage-project-api.ts`
- `locaville/web_user/lib/engage-project-types.ts`
- `locaville/web_user/lib/residents-types.ts`
- `locaville/web_user/lib/user-village-context-api.ts`

## 다음 단계에서 집중 분석해야 할 파일

APP 요구사항 업데이트를 위해 우선 확인할 파일:

- `locaville/app_user/components/LocavilleApp.tsx`: 앱 내 화면 전환과 상태 흐름
- `locaville/app_user/components/HomeScreen.tsx`: 오늘 할 일, 홈 기능
- `locaville/app_user/components/ManualInputScreen.tsx`: 직접 영농일지 입력
- `locaville/app_user/components/PhotoInputScreen.tsx`: 사진 증빙 등록
- `locaville/app_user/components/VoiceInputScreen.tsx`: STT/TTS 기반 대화 입력
- `locaville/app_user/components/JournalScreen.tsx`, `JournalDetailScreen.tsx`: 영농일지 목록/상세
- `locaville/app_user/lib/todo-service.ts`: 오늘 할 일 API 연동
- `locaville/app_user/lib/diary-service.ts`, `diary-repository.ts`: 영농일지 저장/조회
- `locaville/app_user/lib/evidence-service.ts`, `evidence-repository.ts`: 증빙자료 업로드/조회
- `locaville/app_user/lib/ai-service.ts`: AI, 음성, 비전 기능
- `locaville/backend/app/routers/todo.py`, `diary.py`, `evidence.py`, `ai.py`, `farmer.py`
- `locaville/backend/app/services/todo_service.py`, `diary_service.py`, `evidence_service.py`, `ai_service.py`

WEB 요구사항 업데이트를 위해 우선 확인할 파일:

- `locaville/web_user/app/dashboard/page.tsx`: 대시보드 핵심 화면
- `locaville/web_user/components/dashboard/`: 대시보드 카드/캘린더/검토/미제출 관련 UI
- `locaville/web_user/app/journal/page.tsx`: 영농일지 관리 화면
- `locaville/web_user/app/evidence/page.tsx`: 증빙자료 관리 화면
- `locaville/web_user/app/residents/page.tsx`, `residents/[id]/page.tsx`: 농가/주민 관리 화면
- `locaville/web_user/app/project/page.tsx`, `project/[prj_id]/page.tsx`, `project/new/page.tsx`: 프로젝트 관리 화면
- `locaville/web_user/app/engage/page.tsx`, `engage/[prj_id]/page.tsx`: 참여 사업/활동 관련 화면
- `locaville/web_user/app/farm-helpers/page.tsx`: 기록 도우미 관리 화면
- `locaville/web_user/lib/admin-api.ts`: 관리자 API 연동의 중심
- `locaville/web_user/lib/project-admin-api.ts`, `engage-project-api.ts`, `farmer-groups-api.ts`, `user-village-context-api.ts`
- `locaville/backend/app/routers/admin.py`, `project.py`, `engage.py`, `business_management.py`, `report.py`
- `locaville/backend/app/services/admin_service.py`, `admin_resident_service.py`, `project_service.py`, `business_management_service.py`

## 주의사항

- 이번 단계에서는 요구사항 정의서 엑셀을 수정하지 않았다.
- 실제 `.env` 파일은 읽거나 출력하지 않았다.
- 민감정보는 문서에 포함하지 않았다.
- 코드에 없는 기능을 구현 완료로 판단하지 않기 위해, 다음 단계에서는 화면 파일과 API/서비스/저장소를 함께 대조해야 한다.
- 기존 요구사항 ID는 임의 삭제하지 않고, 삭제 필요 항목은 이후 단계에서 삭제후보로 표시해야 한다.
- MySQL 관련 검증이 필요하더라도 쓰기 작업은 하지 않고 읽기 전용 분석만 수행해야 한다.

