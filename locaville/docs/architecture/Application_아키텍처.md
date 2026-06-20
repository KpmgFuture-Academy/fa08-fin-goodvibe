# Application 아키텍처

> 현재 시점 기준 (2026-06-19).  
> 기준: 각 프론트의 `app/**/page.tsx`, 관련 `components/*`, `lib/*.ts`, backend `app/main.py`, `routers/*.py`, `services/*.py`, `repositories/*.py`.  
> 주의: 한 프론트 route 가 여러 backend route 를 함께 호출할 수 있다.  
> `app_user` 는 SPA 이므로 URL route 와 내부 화면(screen state)을 함께 적음.

---

## 1. 전체 흐름도

### 1.1 Front-to-Back 계층 흐름

```text
[Frontend]
Page
  ↓
Shell
  ↓
Container / Context
  ↓
Backend 호출 (lib/*.ts)
  ↓
[Backend]
Main
  ↓
Router
  ↓
Service
  ↓
Repository
```

### 1.2 계층별 역할

- `page` : 각 URL 경로의 진입 화면으로, 어떤 화면을 띄울지 결정하고 필요한 Shell 또는 화면 컴포넌트를 연결하는 계층
- `shell` : 여러 페이지가 공통으로 사용하는 화면 틀로, header·sidebar·main 영역 같은 공통 레이아웃을 구성하는 계층
- `container` : 화면에 필요한 데이터를 조회하고 상태와 이벤트를 관리하며, 하위 컴포넌트에 어떤 데이터를 줄지 조정하는 계층
- `context` : 여러 컴포넌트가 함께 써야 하는 사용자, 마을, 설정 같은 공통 정보를 공유하는 계층
- `backend 호출` : 프론트엔드에서 `lib/*.ts` 등을 통해 HTTP 요청으로 백엔드 API를 호출하는 단계
- `main` : FastAPI 앱의 시작점으로, 전체 앱 설정과 router 등록을 담당하는 진입 모듈
- `router` : URL 요청을 받아 적절한 service 함수로 연결하고 request/response를 처리하는 계층
- `service` : 실제 업무 규칙과 처리 흐름을 담당하며, repository 호출이나 외부 API 연계를 조합하는 계층
- `repository` : 데이터베이스 조회·저장·수정·삭제를 담당하는 데이터 접근 계층

### 1.3 해석 기준

- `web_admin`, `web_user` 는 `page.tsx` 자체가 컨테이너 역할을 함께 수행하는 경우가 많다.
- `app_user` 는 `[app/page.tsx](/d:/Project/good-vibe/locaville/app_user/app/page.tsx)` -> `[LocavilleAppContainer.tsx](/d:/Project/good-vibe/locaville/app_user/components/LocavilleAppContainer.tsx)` -> `[LocavilleApp.tsx](/d:/Project/good-vibe/locaville/app_user/components/LocavilleApp.tsx)` 흐름이 비교적 명확하다.
- `Context` 는 컨테이너를 대체하는 계층이 아니라, 컨테이너나 Shell 이 준비한 공통 데이터를 여러 컴포넌트에 공유하는 구조로 해석한다.

---

## 2. Front-to-Back Routes

### 2.1 `web_admin`

| front-end 구분 | frontend route | 주요 page / entry | backend route |
|---|---|---|---|
| `web_admin` | `/` | `web_admin/app/page.tsx` | `POST /admin/login` |
| `web_admin` | `/project` | `web_admin/app/project/page.tsx` | `GET /project` |
| `web_admin` | `/project/new` | `web_admin/app/project/new/page.tsx` | `GET /project/base-businesses`, `POST /project`, `POST /project/from-rag/basic`, `POST /project/draft-from-document`, `GET /rag`, `GET /rag/{file_id}` |
| `web_admin` | `/project/[prj_id]` | `web_admin/app/project/[prj_id]/page.tsx` | `GET /project/{prj_id}`, `PATCH /project/{prj_id}`, `POST /project/{prj_id}/activities`, `PATCH /project/{prj_id}/activities/{activity_id}`, `POST /project/{prj_id}/activities/{activity_id}/jobs`, `PATCH /project/{prj_id}/activities/{activity_id}/jobs/{job_seq}`, `DELETE /project/{prj_id}/activities/{activity_id}/jobs/{job_seq}`, `POST /project/{prj_id}/from-rag/activity`, `POST /project/{prj_id}/from-rag/activity-rule`, `POST /project/{prj_id}/activities/{activity_id}/job-setup`, `GET /rag`, `GET /rag/{file_id}` |
| `web_admin` | `/rag` | `web_admin/app/rag/page.tsx` | `GET /rag`, `GET /rag/{file_id}/original` |
| `web_admin` | `/rag/new` | `web_admin/app/rag/new/page.tsx` | `POST /rag/pre-parse`, `POST /rag/register`, `GET /rag/headings`, `GET /rag/{file_id}` |
| `web_admin` | `/rag/[file_id]` | `web_admin/app/rag/[file_id]/page.tsx` | `GET /rag/{file_id}`, `PATCH /rag/{file_id}`, `GET /rag/{file_id}/vectors`, `POST /rag/{file_id}/embedding`, `DELETE /rag/{file_id}`, `GET /rag/{file_id}/original` |
| `web_admin` | `/village` | `web_admin/app/village/page.tsx` | `GET /village` |
| `web_admin` | `/village/[ville_id]` | `web_admin/app/village/[ville_id]/page.tsx` | `GET /village/{ville_id}` |
| `web_admin` | `/weather` | `web_admin/app/weather/page.tsx` | `GET /village`, `GET /weather/today`, `GET /weather/hourly`, `POST /weather/sync` |
| `web_admin` | `/profile` | `web_admin/app/profile/page.tsx` | `GET /admin/profile/{admin_no}`, `PATCH /admin/profile/{admin_no}` |

메모:

- `web_admin/components/Shell.tsx` 는 route 공통으로 local session 을 검사한다.
- 따라서 실제 각 page 진입 전 `admin-auth-storage.ts` 기반 인증 체크가 선행된다.
- 프로젝트 상세 화면에서는 활동 제안, 활동규칙 생성, 작업등록 초안 생성을 모두 `/project/[prj_id]` 한 화면에서 수행하지만, 실제 규칙 판단은 backend 가 담당한다.

### 2.2 `web_user`

| front-end 구분 | frontend route | 주요 page / entry | backend route |
|---|---|---|---|
| `web_user` | `/` | `web_user/app/page.tsx` | 직접 API 호출 없음, `/dashboard` redirect |
| `web_user` | `/dashboard` | `web_user/app/dashboard/page.tsx` | `GET /admin/summary`, `GET /admin/todo-status`, `GET /admin/recent-evidence`, `GET /admin/laggard-farmers`, `GET /admin/farm-helpers`, `GET /admin/ai-recommendation`, `PATCH /evidence/{evidence_id}`, `POST /admin/laggard-farmers/{farmer_id}/notify`, `POST /admin/farm-helpers`, `GET /admin/agri-weather` |
| `web_user` | `/residents` | `web_user/app/residents/page.tsx` | `GET /admin/summary`, `GET /admin/todo-status`, `GET /village/{ville_id}`, `GET /admin/village-groups/{group_no}/members`, `GET /farmer/{farmer_id}/parcels`, `POST /admin/residents`, `POST /admin/laggard-farmers/{farmer_id}/notify` |
| `web_user` | `/residents/[id]` | `web_user/app/residents/[id]/page.tsx` | `GET /admin/summary`, `GET /diary`, `GET /evidence`, `GET /farmer/{farmer_id}/parcels`, `PATCH /admin/residents/{amo_regno}` |
| `web_user` | `/projects` | `web_user/app/projects/page.tsx` | `GET /ville-project`, `GET /project`, `GET /admin/projects/{prj_id}/members` |
| `web_user` | `/projects/[id]` | `web_user/app/projects/[id]/page.tsx` | `GET /project/{prj_id}`, `GET /admin/projects/{prj_id}/members`, `GET /ville-project` |
| `web_user` | `/project` | `web_user/app/project/page.tsx` | `GET /project` |
| `web_user` | `/project/new` | `web_user/app/project/new/page.tsx` | `POST /project`, `GET /project/base-businesses` |
| `web_user` | `/project/[prj_id]` | `web_user/app/project/[prj_id]/page.tsx` | `GET /project/{prj_id}`, `PATCH /project/{prj_id}`, `POST /project/{prj_id}/activities`, `PATCH /project/{prj_id}/activities/{activity_id}` |
| `web_user` | `/engage` | `web_user/app/engage/page.tsx` | `GET /engage/projects` |
| `web_user` | `/engage/[prj_id]` | `web_user/app/engage/[prj_id]/page.tsx` | `GET /engage/projects/{prj_id}`, `POST /engage/projects/{prj_id}/register`, `GET /engage/projects/{prj_id}/activities`, `POST /engage/projects/{prj_id}/activities/register`, `GET /engage/projects/{prj_id}/todos`, `POST /engage/projects/{prj_id}/todos/create`, `GET /engage/projects/{prj_id}/todos/refresh-preview`, `POST /engage/projects/{prj_id}/todos/refresh` |
| `web_user` | `/evidence` | `web_user/app/evidence/page.tsx` | `GET /evidence`, `GET /evidence/{evidence_id}`, `PATCH /evidence/{evidence_id}` |
| `web_user` | `/journal` | `web_user/app/journal/page.tsx` | `GET /diary`, `GET /diary/{diary_id}`, `DELETE /admin/diaries/{diary_id}` |
| `web_user` | `/farm-helpers` | `web_user/app/farm-helpers/page.tsx` | `GET /admin/farm-helpers`, `POST /admin/farm-helpers`, `DELETE /admin/farm-helpers/{helper_user_no}/{help_seq}` |
| `web_user` | `/farmer-groups` | `web_user/app/farmer-groups/page.tsx` | `GET /business-management/admin` |
| `web_user` | `/calendar` | `web_user/app/calendar/page.tsx` | `GET /admin/todo-status`, `GET /admin/agri-weather` |
| `web_user` | `/llm-test` | `web_user/app/llm-test/page.tsx` | `POST /ai/llm-compare`, `POST /ai/llm-compare/select` |

공통 선행 호출:

| front-end 구분 | frontend route | 주요 page / entry | backend route |
|---|---|---|---|
| `web_user` | 공통 | `web_user/app/layout.tsx` -> `components/Shell.tsx` | `GET /user-ville/current-user`, `GET /admin/agri-weather` |

메모:

- `web_user` 는 `chief-resources.ts` / `chief-cache.ts` 로 `/dashboard`, `/residents` 등 여러 화면이 같은 backend route 를 공유한다.
- 따라서 표에는 “페이지에서 직접 쓰는 route”와 “Shell이 공통으로 선행 호출하는 route”를 분리했다.

### 2.3 `app_user`

`app_user` 는 URL route 가 적고 내부 screen 상태로 화면을 전환한다.

#### 2.3.1 URL route 기준

| front-end 구분 | frontend route | 주요 page / entry | backend route |
|---|---|---|---|
| `app_user` | `/` | `app_user/app/page.tsx` -> `LocavilleAppContainer.tsx` | `GET /todo/today`, `GET /farmer/{farmer_id}/parcels`, `GET /diary`, `GET /evidence`, `GET /ville-project`, `GET /farm-job/list`, `GET /farmer/{farmer_id}/notifications`, `GET /weather/today`, `GET /farmer/{farmer_id}/farm-helpers/current`, `GET /user-ville/current-user` |
| `app_user` | `/dev/seed-here` | `app_user/app/dev/seed-here/page.tsx` | `POST /demo/seed-parcel-gps` |

#### 2.3.2 내부 SPA 화면(screen state) 기준

| front-end 구분 | frontend route | 주요 page / entry | backend route |
|---|---|---|---|
| `app_user` | 내부 screen `home` | `components/HomeScreen.tsx` | `GET /todo/today`, `GET /farmer/{farmer_id}/notifications`, `GET /weather/today`, `GET /farmer/{farmer_id}/advice/today` |
| `app_user` | 내부 screen `manualInput` | `components/ManualInputScreen.tsx` | `POST /ai/stt`, `POST /diary`, `POST /evidence`, `GET /farm-job/list`, `GET /farmer/{farmer_id}/parcels` |
| `app_user` | 내부 screen `photoInput` | `components/PhotoInputScreen.tsx` | `POST /evidence/upload`, `GET /farmer/{farmer_id}/parcels` |
| `app_user` | 내부 screen `photo coach overlay` | `components/PhotoLiveCoachOverlay.tsx` | `POST /photo-guard/coach`, `POST /ai/tts` |
| `app_user` | 내부 screen `journal` | `components/JournalScreen.tsx` | `GET /diary`, `GET /evidence` |
| `app_user` | 내부 screen `business` | `components/BusinessScreens.tsx` | `GET /ville-project` |
| `app_user` | 내부 screen `help` | `components/HelpScreen.tsx` | `POST /ai/chat`, `POST /ai/stt`, `POST /ai/tts` |
| `app_user` | 도우미 승인 흐름 | `LocavilleAppContainer.tsx`, `HelperConsentModal.tsx` | `GET /farmer/{farmer_id}/farm-helpers/current`, `POST /farmer/{farmer_id}/farm-helpers/{helper_user_no}/{help_seq}/approve` |
| `app_user` | 알림 읽음 흐름 | `NotificationPanel.tsx` | `PATCH /farmer/{farmer_id}/notifications/{notice_no}/read`, `POST /farmer/{farmer_id}/notifications/read-all`, `GET /farmer/{farmer_id}/notifications/unread-count` |

메모:

- `app_user` 는 `page.tsx` 자체보다 `LocavilleAppContainer.tsx` 와 `useLocavilleData.ts` 가 사실상의 front-to-back entry 역할을 한다.
- 동일한 URL `/` 안에서 `screen` 상태값으로 `home`, `manualInput`, `photoInput`, `journal`, `help` 등을 전환한다.

---

## 3. 요약

### 3.1 패턴

| front-end 구분 | frontend route 성격 | backend route 성격 |
|---|---|---|
| `web_admin` | route 가 명확한 CRUD 페이지 | `/project`, `/project/*/from-rag/*`, `/project/*/job-setup`, `/rag`, `/village`, `/weather`, `/admin/profile` 중심 |
| `web_user` | route 가 명확한 운영 콘솔 | `/admin/*`, `/engage/*`, `/project/*`, `/evidence`, `/diary`, `/village` 중심 |
| `app_user` | URL route 는 적고 내부 SPA screen 전환이 많음 | `/todo`, `/farmer/*`, `/diary`, `/evidence`, `/photo-guard`, `/ai/*` 중심 |

### 3.2 읽는 방법

프론트 route 와 backend route 대응은 보통 아래 순서로 추적하면 된다.

```text
app/**/page.tsx
  ↓
components/*
  ↓
lib/*.ts
  ↓
fetch / requestJson
  ↓
backend/app/routers/*.py
```

추가 메모:

- 최근 프로젝트 관리 흐름은 `활동 제안 -> 활동 등록 -> 작업 등록(RAG/수기)` 로 이어지며, 프론트는 입력과 표시를 담당하고 활동규칙 해석은 backend 로 이동했다.
- 작업등록 화면은 상위 활동의 `description`, `activity_rule`, `farm_job` 목록만 받아 초안을 구성하고, 기존의 화면 내 디버그/RAG 탐색 책임은 제거되는 방향으로 정리되었다.
