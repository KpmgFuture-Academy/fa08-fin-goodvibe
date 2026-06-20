# Frontend 아키텍처 구성

> 현재 시점 기준 (2026-06-16). `locaville/graphify-out` 와 실제 `app_user`, `web_user`, `web_admin` 구성을 대조해 작성함.  
> Frontend stack: Next.js 16 + React 19 + TypeScript 5.7.  
> 범위: `app_user`(농업인), `web_user`(이장님), `web_admin`(관리자) 통합 관점 + 개별 기능 관점.

---

## 1. 한눈에 보는 전체 구조

```text
locaville/
├── app_user/    농업인 모바일 웹앱
├── web_user/    이장님 운영 대시보드
└── web_admin/   관리자 웹
```

세 프론트의 공통점:

- 모두 Next.js App Router 기반
- 모두 `NEXT_PUBLIC_API_BASE_URL` 을 통해 FastAPI backend 호출
- 화면 렌더링은 프론트 각자 담당, 데이터 권위는 backend/DB 에 둠
- 공통 Python/TS shared package 없이 각 앱이 자신의 `lib/` API 래퍼를 가짐

세 프론트의 차이:

- `app_user` 는 **SPA(Single Page Application)형 단일 앱 셸** 중심
- `web_user` 는 **멀티페이지 운영 콘솔** 중심
- `web_admin` 는 **로그인 세션 기반 관리툴** 중심

설명:

- `SPA(Single Page Application)` 는 페이지를 새로고침하며 여러 HTML 페이지를 이동하는 방식보다, 하나의 앱 화면 안에서 상태를 바꿔 여러 화면처럼 동작하는 구조를 뜻한다.
- `로그인 세션 기반 관리툴` 은 관리자가 먼저 로그인해 세션을 만든 뒤, 그 인증 상태를 기준으로 프로젝트/RAG/마을/날씨 같은 관리 화면을 사용하는 구조를 뜻한다.

---

## 2. 통합 관점 아키텍처

프론트엔드 3개 앱은 구조 디테일은 다르지만, 큰 틀에서는 아래 흐름을 공유한다.

```text
페이지(page.tsx)
  ↓
Shell
  ↓
컨테이너 / 화면 조립 계층
  ↓
라이브러리(lib/*.ts)
  ↓
backend API
```

이 흐름은 물리적으로도 비슷한 디렉터리 배치를 가진다.

```text
<frontend-app>/
├── app/          Next.js route 디렉터리
├── components/   화면/셸/컨테이너/UI 컴포넌트
└── lib/          API 호출, 타입, 가공 로직
```

즉, `app`, `components`, `lib` 는 보통 **동일한 레벨의 최상위 디렉터리**로 놓여 있고,
역할을 나눠 갖는다.

물리 구성 기준으로 보면:

- `app/`
  - URL 경로별 폴더를 둔다
  - 각 경로 안에 `page.tsx`, 필요 시 `layout.tsx` 가 있다
  - 예:
    - `web_admin/app/project/page.tsx`
    - `web_user/app/dashboard/page.tsx`
    - `app_user/app/page.tsx`

- `components/`
  - `app/page.tsx` 가 직접 모든 화면을 만들지 않고, 실제 화면 구성은 이 폴더로 내려보낸다
  - 컨테이너, 셸, 화면 컴포넌트, 공통 UI 가 여기에 있다
  - 예:
    - `app_user/components/LocavilleAppContainer.tsx`
    - `app_user/components/LocavilleApp.tsx`
    - `web_user/components/Shell.tsx`
    - `web_admin/components/Shell.tsx`

- `lib/`
  - backend 호출 함수와 타입, 화면용 가공 함수를 둔다
  - `components` 나 `page.tsx` 가 직접 `fetch` 를 흩뿌리지 않게 받쳐주는 계층이다
  - 예:
    - `app_user/lib/todo-service.ts`
    - `web_user/lib/admin-api.ts`
    - `web_admin/lib/project-api.ts`

각 계층의 역할:

| 계층 | 역할 |
|---|---|
| `페이지` | route 진입점, 화면 배치, 어떤 컴포넌트를 보여줄지 결정 |
| `Shell` | 앱 공통 레이아웃, 헤더/사이드바/본문 영역, 전역 context/설정 연결 |
| `컨테이너` | 데이터 로딩 시작, 여러 API 결과 조합, 로딩/에러/권한/세션/컨텍스트 연결 |
| `라이브러리` | backend 호출, 타입 정의, 응답 정규화, 화면용 가공 로직 제공 |

조금 더 풀어 쓰면:

- `페이지`:
  - 사용자가 실제로 접근하는 URL 진입점
  - 화면 레이아웃과 주요 컴포넌트 조합을 담당
  - 물리적으로는 주로 `app/**/page.tsx`
  - 예: `app/project/page.tsx`, `app/dashboard/page.tsx`

- `Shell`:
  - 여러 페이지를 공통으로 감싸는 상위 레이아웃
  - 헤더, 사이드바, 본문 영역, 필요 시 푸터, 공통 context, 세션/초기 prefetch 연결을 담당
  - 물리적으로는 주로 `components/Shell.tsx`, 그리고 `app/layout.tsx` 에서 연결
  - 예: `web_user/components/Shell.tsx`, `web_admin/components/Shell.tsx`

- `컨테이너`:
  - 페이지에서 바로 모든 fetch를 하지 않도록 중간에서 데이터 흐름을 정리
  - 여러 API를 병렬 호출하거나, context/session/cache를 붙이거나, 화면 전환 상태를 관리
  - 물리적으로는 `components/` 안의 `*Container.tsx`, `Shell.tsx`, 혹은 `lib/`의 조립용 hook 으로 존재
  - 예: `LocavilleAppContainer.tsx`, `Shell.tsx`, `useLocavilleData.ts`

- `라이브러리`:
  - `fetch`, `requestJson`, 타입, 응답 가공 함수가 모인 계층
  - backend endpoint 변경 시 가장 먼저 영향받는 곳
  - 물리적으로는 `lib/*.ts`
  - 예: `todo-service.ts`, `admin-api.ts`, `project-api.ts`

`Shell`과 `컨테이너`의 차이:

| 항목 | Shell | 컨테이너 |
|---|---|---|
| 주 역할 | 공통 레이아웃과 전역 연결 | 데이터 조립과 상태 연결 |
| 관심사 | 헤더, 사이드바, 본문, 푸터 같은 공통 영역 배치와 전역 context, 세션 | fetch 시작, 여러 API 조합, 로딩/에러, 화면 주입 |
| 공용 범위 | 여러 페이지 공용인 경우가 많음 | 앱 전체 공용일 수도, 특정 화면 전용일 수도 있음 |
| 대표 위치 | `components/Shell.tsx`, `app/layout.tsx` | `*Container.tsx`, 조립용 hook, page 내부 로직 |

정리:

- `Shell`은 여러 페이지가 공통으로 쓰는 “화면 틀”에 가깝다
- `컨테이너`는 공통일 수도 있지만, 본질적으로는 “데이터 연결 계층”이다

`Shell` 아래의 대표 화면 영역:

| 영역 | 역할 |
|---|---|
| `Header` | 상단 고정 바. 페이지 제목, 날짜, 사용자명, 알림, 설정, 새로고침 같은 공통 액션 |
| `Sidebar` | 좌측/측면 메뉴. 주요 페이지 이동, 현재 위치 표시, 배지, 앱 단위 탐색 |
| `Main` / `Content` | 실제 각 `page.tsx` 의 내용이 렌더되는 본문 영역 |
| `Footer` | 하단 공통 정보/액션 영역. 이 프로젝트에서는 강한 공통 footer 는 두드러지지 않지만, 필요 시 Shell 하위 공통 영역으로 둘 수 있음 |

이 프로젝트 기준 예시:

- `web_user/components/Shell.tsx`
  - `Sidebar`
  - `Header`
  - `<main id="lvb-main-content" className="lvb-content">`
- `web_admin/components/Shell.tsx`
  - `Sidebar`
  - `Header`
  - `<main className="shell-content">`

즉, `Shell`은 단순히 “감싸는 컴포넌트”가 아니라,
공통 화면 영역을 배치하고 각 `page.tsx` 가 들어갈 자리를 만드는 상위 레이아웃이다.

`page`와의 매핑 관계:

- `page.tsx` 는 URL 진입점이다
- `page.tsx` 가 직접 화면을 다 만들 수도 있고, `Shell` 또는 `컨테이너`로 위임할 수도 있다
- `Shell`은 보통 `layout.tsx` 를 통해 여러 `page.tsx`를 공통으로 감싼다
- `컨테이너`는 특정 `page.tsx` 하나와 1:1로 연결될 수도 있고, 앱 전체를 감싸는 대표 컨테이너일 수도 있다

대표 매핑 예시:

```text
web_user
app/layout.tsx
  └─ Shell.tsx
      └─ 여러 app/**/page.tsx 공통 감싸기

web_admin
app/layout.tsx
  └─ Shell.tsx
      └─ 여러 app/**/page.tsx 공통 감싸기

app_user
app/page.tsx
  └─ LocavilleAppContainer.tsx
      └─ LocavilleApp.tsx
          └─ 내부 화면 상태(home, journal, photoInput...)로 전환
```

즉, 이 프로젝트에서의 관계는 대체로 다음처럼 볼 수 있다.

- `web_user`, `web_admin`
  - `page.tsx` 들이 `Shell` 아래에서 동작
  - 각 페이지는 필요 시 직접 `lib`를 호출하거나 하위 컴포넌트로 전달
- `app_user`
  - `page.tsx` 가 대표 `컨테이너`를 호출
  - 그 컨테이너가 앱 전체 데이터를 조립해 내부 SPA 셸로 넘김

대표적인 공통 흐름 예시:

```text
page.tsx
  └─ 화면 진입
      └─ layout.tsx / Shell
          └─ container
              └─ lib/*.ts
                  └─ fetch("/api...")
```

호출 구조를 간략히 정리하면:

- `페이지`는 어떤 화면을 열지 결정한다
- `Shell`은 공통 레이아웃과 전역 상태를 감싼다
- `컨테이너`는 필요한 데이터를 모아 하위 화면에 주입한다
- `라이브러리`는 실제 backend API 호출과 응답 가공을 수행한다

주의:

- 모든 앱이 항상 `페이지 -> Shell -> 컨테이너 -> 라이브러리`를 정확히 같은 형태로 따르지는 않는다
- `web_user`, `web_admin`는 `Shell` 비중이 크고
- `app_user`는 `컨테이너(LocavilleAppContainer)` 비중이 더 크다

### 2.1 시스템 연결 구조

```text
[농업인] app_user
   └─ 영농일지 / 사진 / todo / 도움말 / 도우미 모드

[이장님] web_user
   └─ 처리함 / 주민 / 사업 / 일정 / 증빙 검토 / 도우미 연결

[관리자] web_admin
   └─ 프로젝트 / RAG / 마을 / 날씨 / 프로필

        ↓ 공통
각 앱의 lib/*.ts API client
        ↓
NEXT_PUBLIC_API_BASE_URL
        ↓
FastAPI backend
        ↓
PostgreSQL / uploads / AI / 외부 API
```

앱별 기능 축:

#### `app_user`

- 영농일지
- 사진 증빙 / 라이브 코칭
- 오늘 할 일
- 도움말
- 도우미 모드

#### `web_user`

- 처리함
- 주민
- 사업
- 일정
- 증빙 검토
- 도우미 연결

#### `web_admin`

- 프로젝트
- RAG
- 마을
- 날씨
- 프로필

앱별 소스 흐름:

### `app_user` 흐름

`app_user` 는 route 가 얇고, 내부 SPA 셸이 실제 화면 전환을 담당한다.

```text
app/page.tsx
  └─ components/LocavilleAppContainer.tsx
      └─ lib/use-locaville-data.ts
          ├─ lib/todo-service.ts
          ├─ lib/parcel-service.ts
          ├─ lib/diary-service.ts
          ├─ lib/evidence-service.ts
          ├─ lib/business-service.ts
          ├─ lib/notification-service.ts
          ├─ lib/weather-service.ts
          └─ lib/farm-helper-service.ts
              ↓
          components/LocavilleApp.tsx
              └─ HomeScreen / ManualInputScreen / PhotoInputScreen / HelpScreen ...
```

대표 페이지 예시:

- 앱 진입:
  - `app/page.tsx`
  - `LocavilleAppContainer.tsx`
  - `useLocavilleData.ts`
- 오늘 할 일 예시:
  - `useLocavilleData.ts` → `todo-service.ts` → `GET /todo/today`
- 라이브 코칭 예시:
  - `PhotoInputScreen.tsx` → `PhotoLiveCoachOverlay.tsx` → `photo-coach-service.ts` → `POST /photo-guard/coach`

### `web_user` 흐름

`web_user` 는 App Router 페이지 위에 Shell/Context/캐시 계층이 얹힌 운영 콘솔이다.

```text
app/layout.tsx
  └─ components/Shell.tsx
      ├─ components/CurrentUserVillageContext.tsx
      ├─ lib/user-village-context-api.ts
      ├─ lib/chief-resources.ts
      └─ page children
          └─ app/<route>/page.tsx
              └─ lib/admin-api.ts / lib/farmer-api.ts / lib/projects.ts / lib/engage-project-api.ts
                  ↓
              components/dashboard/* / components/residents/* / components/chief/*
```

대표 페이지 예시:

- 처리함 예시:
  - `app/dashboard/page.tsx`
  - `lib/chief-resources.ts`
  - `lib/admin-api.ts`
  - `components/chief/ChiefDashboard.tsx`
- 주민 페이지 예시:
  - `app/residents/page.tsx`
  - `lib/admin-api.ts`
  - `lib/farmer-api.ts`
  - `components/chief/VillageScreen.tsx`

### `web_admin` 흐름

`web_admin` 는 로그인 후 각 관리 페이지가 자신의 전용 API 모듈을 호출하는 구조다.

```text
app/page.tsx
  └─ 로그인
      └─ lib/admin-auth-api.ts
          └─ lib/admin-auth-storage.ts

app/layout.tsx
  └─ components/Shell.tsx
      └─ 인증 확인 후 page children
          └─ app/<route>/page.tsx
              └─ lib/project-api.ts / lib/rag-api.ts / lib/village-api.ts / lib/weather-admin-api.ts
                  ↓
              components/ui/* + route 전용 화면
```

대표 페이지 예시:

- 프로젝트 목록 예시:
  - `app/project/page.tsx`
  - `lib/project-api.ts`
  - `GET /project`
- 마을 목록 예시:
  - `app/village/page.tsx`
  - `lib/village-api.ts`
  - `GET /village`

특정 페이지 예시를 한 줄로 요약하면:

```text
web_admin/app/project/page.tsx
  └─ getProjectAdminList()
      └─ web_admin/lib/project-api.ts
          └─ GET /project

web_user/app/residents/page.tsx
  └─ getVillageDetail(), getVillageGroupMembers(), createResident()
      └─ web_user/lib/admin-api.ts, web_user/lib/farmer-api.ts
          └─ GET /village/{ville_id}, GET /admin/village-groups/{group_no}/members, POST /admin/residents

app_user/components/PhotoLiveCoachOverlay.tsx
  └─ coach API 호출
      └─ app_user/lib/photo-coach-service.ts
          └─ POST /photo-guard/coach
```

### 2.2 프론트별 역할 분리

| 앱 | 사용자 | UI 성격 | 상태 구조 |
|---|---|---|---|
| `app_user` | 농업인 | 모바일 단일 앱 경험 | 로컬 UI 상태 + 컨테이너 훅 조립 |
| `web_user` | 이장님 | 데스크톱 운영 대시보드 | Shell + Context + 탭 간 캐시 |
| `web_admin` | 관리자 | CRUD/운영형 관리도구 | 로그인 세션 + 페이지별 fetch |

### 2.3 공통 패턴

- `app/`:
  - Next.js route entry
- `components/`:
  - 표현/레이아웃/UI 단위
- `lib/`:
  - API client, 타입, 가공 로직, 캐시/상태 보조

공통적으로 “페이지가 직접 모든 fetch 를 하지 않고” `lib/` 함수로 backend 계약을 감싼다.

---

## 3. 저장소 관점 구조

```text
Frontend
├── app_user/
│   ├── app/                Next.js 진입점은 얇고, 실제 화면은 components 중심
│   ├── components/         SPA 화면 단위
│   ├── components_legacy/  구 버전 보존
│   ├── lib/                데이터 조립 / API / 브라우저 연동
│   └── public/             아이콘, weather 아이콘, VAD 자산
│
├── web_user/
│   ├── app/                페이지 라우트
│   ├── components/         Shell, dashboard, residents, chief UI
│   ├── lib/                admin-api, 프로젝트/주민/대시보드 가공
│   ├── nextjs_chief/       구 chief 구현 자산
│   └── tests-e2e/          Playwright E2E
│
└── web_admin/
    ├── app/                로그인/프로젝트/RAG/마을/날씨/프로필
    ├── components/         Shell, Header, Sidebar, 공통 UI
    └── lib/                admin auth, project, rag, village, weather API
```

---

## 4. 공통 설계 원칙

### 4.1 Backend-first 데이터 구조

- 프론트는 DB 키를 직접 계산하지 않고 backend 응답을 신뢰
- `farmer_id` 중심 조회 원칙을 프론트도 유지
- 비즈니스 판정은 프론트가 아니라 backend 결과를 표시하는 역할에 집중

### 4.1-1. 프론트-백엔드 데이터 교환 방식

프론트 page/component 와 backend 서버는 주로 **HTTP + JSON** 방식으로 데이터를 주고받는다.

기본 구조:

```text
page.tsx / component
  ↓
lib/*.ts API client
  ↓
fetch(...)
  ↓
backend endpoint
  ↓
JSON response
```

핵심 특징:

- 실제 교환 포맷:
  - 대부분 `JSON`
- 프론트 내부 타입 표현:
  - `class`보다 `type`, `interface` 중심
- 호출 방식:
  - `fetch`
  - 공통 래퍼 예: `requestJson<T>()`

예시:

- `app_user/lib/todo-service.ts`
  - `/todo/today` 호출
  - JSON 응답을 `TodoItemApi` 형태로 정규화
- `web_user/lib/admin-api.ts`
  - `requestJson<T>()` 로 여러 `/admin/*` 응답을 타입화
- `web_admin/lib/project-api.ts`
  - `/project` 응답을 `ProjectAdminListResponse` 같은 타입으로 받음

즉, 서버와 프론트가 주고받는 실제 데이터는 JSON이고,
프론트는 그 JSON 구조를 TypeScript `type/interface` 로 다룬다고 보면 된다.

예외적으로 사용하는 교환 방식:

- 파일 업로드:
  - `multipart/form-data`
  - 예: 이미지 업로드, 문서 업로드
- 바이너리 응답:
  - `Blob`
  - 예: TTS 오디오, 파일 다운로드
- 스트리밍 응답:
  - SSE 또는 stream reader
  - 예: `/ai/chat/stream`
- URL 파라미터:
  - query string, path parameter
  - 예: `farmer_id`, `ville_id`, `prj_id`

### 4.2 앱별 `lib/` 분리

공용 프론트 패키지가 없기 때문에 각 앱은 같은 backend 를 보더라도 별도 래퍼를 가진다.

- `app_user/lib/todo-service.ts`
- `web_user/lib/admin-api.ts`
- `web_admin/lib/project-api.ts`

즉, backend endpoint 변경 시 세 앱을 각각 확인해야 한다.

### 4.3 고령 친화 UI 대응

특히 `app_user`, `web_user` 는 시니어 대상이므로 다음 성격이 구조에 반영된다.

- 큰 버튼
- 단일 목적 화면
- 단계적 전환
- 명시적 확인 모달
- 데이터 로딩을 숨기는 셸/전환 화면

---

## 5. `app_user` 아키텍처

### 5.1 성격

`app_user` 는 Next.js 위에 얹은 **모바일 SPA 셸**이다.

- `app/page.tsx` 는 거의 비어 있음
- 실제 앱 라우팅은 `components/LocavilleApp.tsx`
- 데이터 주입은 `components/LocavilleAppContainer.tsx` + `lib/use-locaville-data.ts`
- SSR 보다는 client-only 동작을 우선

### 5.2 진입 구조

```text
app/page.tsx
  └─ dynamic(() => LocavilleAppContainer, { ssr: false })
      └─ useLocavilleData()
          └─ LocavilleApp
              └─ 내부 screen state 로 화면 전환
```

핵심 파일:

| 파일 | 역할 |
|---|---|
| `app/page.tsx` | client-only 앱 로더 |
| `components/LocavilleAppContainer.tsx` | 데이터 컨테이너, 알림/도우미/모드 영속화 연결 |
| `components/LocavilleApp.tsx` | 실제 앱 셸, 화면 전환 상태 보유 |
| `lib/use-locaville-data.ts` | 여러 backend 응답을 `LocavilleData` 로 조립 |
| `lib/locaville-view-model.ts` | backend 응답을 화면형 모델로 변환 |

### 5.3 화면 구조

실제 route 는 적지만, 앱 내부 화면은 많다.

| 내부 화면 | 대표 파일 | 역할 |
|---|---|---|
| 홈 | `HomeScreen.tsx` | 오늘 할 일, 재촬영, 도움, 알림 진입 |
| 표준 홈 리스트 | `StandardHomeList.tsx` | 표준 모드용 홈 |
| 사진 등록 | `PhotoInputScreen.tsx` | todo 기반 사진 촬영/업로드 |
| 라이브 코칭 | `PhotoLiveCoachOverlay.tsx` | 카메라 프리뷰 + 코칭 음성 |
| 수기/음성 입력 | `ManualInputScreen.tsx` | 영농일지 단일 진입점 |
| 저장 완료 | `SaveCompleteScreen.tsx` | 완료 피드백 |
| 영농일지 목록/상세 | `JournalScreen.tsx`, `JournalDetailScreen.tsx` | 기록 열람 |
| 사업 | `BusinessScreens.tsx` | 참여 사업/활동/증빙 확인 |
| 도움말 | `HelpScreen.tsx` | RAG 챗 |
| 설정 | `SettingsScreen.tsx` | 기기/알림/표시 설정 |
| 로그인/모드선택 | `LoginSelectScreen.tsx`, `ManualLoginScreen.tsx`, `ModeChooser.tsx` | 진입 제어 |

### 5.4 상태 구조

`LocavilleApp.tsx` 가 UI 상태를 직접 들고 있다.

- `screen`
- `tab`
- `uiMode`
- `selectedTodo`
- `selectedDiary`
- `selectedBusiness`
- `notifOpen`
- `helperOn`
- `transition`

즉, `app_user` 는 “페이지 라우팅 기반 앱”보다 “상태 머신 기반 앱”에 가깝다.

### 5.5 데이터 조립 방식

`use-locaville-data.ts` 는 여러 API를 병렬로 호출한 뒤 하나의 `LocavilleData` 로 합친다.

호출 예:

- `getTodayTodos`
- `fetchFarmerParcels`
- `listDiaryRecords`
- `listEvidenceRecords`
- `fetchFarmerProjects`
- `fetchFarmJobOptions`
- `fetchFarmerNotifications`
- `fetchTodayWeather`
- `fetchCurrentHelperRole`
- `fetchCurrentUserProfile`

특징:

- `Promise.allSettled` 사용
- 일부 API 실패를 swallow 하여 앱 전체가 깨지지 않게 처리
- 빈 데이터 기본값을 적극 사용
- 도우미 모드일 때 `effectiveFarmerId` 만 바꿔 recipient 데이터로 재조회

### 5.6 기능 관점 분류

#### 영농일지/증빙

- `diary-service.ts`
- `evidence-service.ts`
- `evidence-repository.ts`
- `photo-coach-service.ts`
- `todo-photo-guide.ts`

#### 홈/할 일/알림

- `todo-service.ts`
- `notification-service.ts`
- `advice-service.ts`
- `weather-service.ts`

#### 도우미 모드

- `farm-helper-service.ts`
- `helper-mode-context.tsx`
- `HelperModeTransitionScreen.tsx`
- `HelperConsentModal.tsx`

#### 브라우저/기기 기능

- `geolocation-service.ts`
- `device-motion-service.ts`
- `tts-service.ts`

### 5.7 현재 구조 해석

- Next.js 이지만 실제 경험은 네이티브형 단일 앱에 가깝다
- route 보다 component state 가 구조의 중심
- backend 응답을 앱용 view model 로 변환하는 계층이 중요하다
- `components_legacy/` 는 과거 UI 잔존물이라 신규 수정 시 현재 `components/` 우선 확인이 필요하다

---

## 6. `web_user` 아키텍처

### 6.1 성격

`web_user` 는 이장님용 **멀티페이지 운영 콘솔**이다.

- 좌측 사이드바 + 상단 헤더 + 본문 구조
- route 별 페이지 분리
- 공용 컨텍스트와 캐시를 통해 탭 전환 비용 감소
- “처리함” 중심 UI와 운영 도구가 공존

### 6.2 진입 구조

```text
app/layout.tsx
  └─ Shell
      ├─ CurrentUserVillageProvider
      ├─ SettingsProvider
      ├─ Sidebar
      ├─ Header
      └─ page children
```

핵심 파일:

| 파일 | 역할 |
|---|---|
| `app/layout.tsx` | 전체 웹 셸 부착 |
| `components/Shell.tsx` | village context 로드, weather prefetch, chief prefetch |
| `components/CurrentUserVillageContext.tsx` | 현재 사용자/마을 컨텍스트 |
| `components/Sidebar.tsx` | 좌측 내비게이션 + 배지 |
| `components/Header.tsx` | 페이지명, 날씨, 설정, 새로고침 |

### 6.3 페이지 구조

현재 주요 route:

| 경로 | 역할 |
|---|---|
| `/dashboard` | 처리함 중심 이장님 메인 |
| `/residents` | 주민 목록 |
| `/residents/[id]` | 주민 상세 |
| `/projects` | 진행 사업 목록 |
| `/projects/[id]` | 사업 상세 |
| `/project` | 사업 관리 화면 |
| `/project/[prj_id]` | 사업 상세 편집 |
| `/project/new` | 사업 신규 |
| `/engage` | 사업 참여 |
| `/engage/[prj_id]` | 참여 상세/등록 |
| `/evidence` | 증빙 검토 |
| `/journal` | 일지 조회 |
| `/farm-helpers` | 도우미 연결 |
| `/farmer-groups` | 단체 관리 |
| `/calendar` | 일정 |
| `/llm-test` | 비교/실험성 화면 |

루트 `/` 는 `/dashboard` 로 즉시 redirect 된다.

### 6.4 데이터 구조

`web_user` 는 페이지별 fetch 외에도 공용 캐시 레이어가 있다.

핵심 파일:

- `lib/admin-api.ts`
- `lib/chief-cache.ts`
- `lib/chief-resources.ts`
- `lib/chief-adapters.ts`

구조:

```text
page
  └─ useCachedResource(...)
      └─ chiefRes.* fetcher
          └─ admin-api.ts
              └─ backend
```

`Shell.tsx` 는 접속 시 `prefetchChiefAll()` 로 주요 데이터를 미리 받아두고,
`dashboard` 는 이를 재사용한다.

### 6.5 기능 관점 분류

#### 처리함 / 운영 메인

- `app/dashboard/page.tsx`
- `components/chief/*`
- `components/dashboard/*`
- `lib/chief-adapters.ts`
- `lib/dashboard-activity.ts`

#### 주민/마을

- `components/residents/*`
- `lib/farmer-api.ts`
- `lib/user-village-context-api.ts`

#### 사업/참여

- `lib/projects.ts`
- `lib/project-api.ts`
- `lib/engage-project-api.ts`
- `lib/ville-project-api.ts`

#### 공통 운영 보조

- `lib/admin-api.ts`
- `lib/progress.ts`
- `lib/sidebar-badges.ts`
- `lib/labels.ts`

### 6.6 현재 구조 해석

- `web_user` 는 route 기반이지만, 실제 핵심 UX는 `Shell` 아래에서 공용 상태를 공유하는 콘솔형 구조다
- `admin-api.ts` 하나에 많은 backend 호출이 모여 있어 변경 영향 범위가 넓다
- `nextjs_chief/` 는 과거 chief 구현 보존 폴더이므로 신규 수정 대상은 보통 `app/`, `components/`, `lib/`

---

## 7. `web_admin` 아키텍처

### 7.1 성격

`web_admin` 는 상위 관리자용 **세션 기반 관리 도구**다.

- 로그인 페이지가 분리되어 있음
- 로그인 후 Shell 진입
- 프로젝트/RAG/마을/날씨 관리처럼 CRUD형 관리 화면 비중이 큼

### 7.2 진입 구조

```text
app/page.tsx
  └─ 로그인 화면

app/layout.tsx
  └─ Shell
      ├─ localStorage admin session 확인
      ├─ 미인증 시 "/" 이동
      ├─ Sidebar
      ├─ Header
      └─ page children
```

핵심 파일:

| 파일 | 역할 |
|---|---|
| `app/page.tsx` | 로그인 |
| `components/Shell.tsx` | 인증 게이트 + 공통 셸 |
| `lib/admin-auth-api.ts` | 로그인 API |
| `lib/admin-auth-storage.ts` | 브라우저 세션 저장 |

### 7.3 메뉴 구조

`Sidebar.tsx` 기준 현재 정보구조:

- `/project` 프로젝트 관리
- `/rag` RAG 관리
- `/village` 마을관리
- `/weather` 날씨정보 관리
- `/profile` 정보수정

### 7.4 페이지 구조

| 경로 | 역할 |
|---|---|
| `/` | 로그인 |
| `/project` | 프로젝트 목록 |
| `/project/new` | 프로젝트 신규 등록 |
| `/project/[prj_id]` | 프로젝트 상세/수정 |
| `/rag` | RAG 목록 |
| `/rag/new` | RAG 신규 |
| `/rag/[file_id]` | RAG 상세 |
| `/village` | 마을 목록 |
| `/village/[ville_id]` | 마을 상세 |
| `/weather` | 날씨 정보 관리 |
| `/profile` | 관리자 프로필 |

메모:

- `web_admin/app/project/[prj_id]/page.tsx` 는 단순 상세 페이지를 넘어 활동 제안, 활동규칙 확인, 작업관리 팝업, 작업등록(RAG/수기) 모달까지 함께 관리하는 프로젝트 운영 허브 역할을 한다.

### 7.5 데이터 구조

`web_admin` 는 `web_user` 보다 단순한 페이지별 fetch 패턴이다.

대표 API 모듈:

- `project-api.ts`
- `rag-api.ts`
- `village-api.ts`
- `weather-admin-api.ts`
- `admin-profile-api.ts`

즉, `web_admin` 는 “공용 캐시 콘솔” 보다는 “업무별 화면 + 전용 API 모듈” 구조에 가깝다.

추가 메모:

- 최근 프로젝트 상세 화면은 `project-api.ts` 비중이 크게 늘었고, 활동규칙 생성과 작업 초안 계산도 별도 프론트 계산 대신 backend API 결과를 표시하는 구조로 이동했다.
- 작업등록 팝업은 상위 활동의 `description`, `activity_rule`, `activity_id`, `prj_id` 와 `farm_job` 목록만으로 초기 화면을 구성하도록 정리되고 있다.

### 7.6 기능 관점 분류

#### 인증/세션

- `admin-auth-api.ts`
- `admin-auth-storage.ts`
- `app/page.tsx`
- `components/Shell.tsx`

#### 프로젝트 관리

- `app/project/*`
- `lib/project-api.ts`
- `lib/project-types.ts`
- 활동 상세/수정, 활동 제안, 활동규칙 생성, 작업관리 팝업, 작업등록(RAG/수기) 흐름이 모두 이 구간에 모여 있다

#### RAG 관리

- `app/rag/*`
- `lib/rag-api.ts`
- `lib/rag-types.ts`

#### 마을/날씨 관리

- `app/village/*`
- `lib/village-api.ts`
- `app/weather/page.tsx`
- `lib/weather-admin-api.ts`

### 7.7 현재 구조 해석

- 관리자 앱답게 가장 전형적인 App Router + CRUD 페이지 구조
- route 와 기능 경계가 비교적 잘 맞아 떨어진다
- 인증은 backend 토큰 시스템이 아니라 local storage 세션 보조 구조이므로, 보안 강화 시 `Shell` 과 auth storage 계층이 먼저 바뀔 가능성이 크다
- 다만 프로젝트 상세 한 화면에 활동/작업 관련 상호작용이 집중되어 있어, UI 는 복합적이지만 규칙 계산 책임 자체는 backend 로 옮겨 프론트 복잡도를 낮추는 방향으로 정리 중이다

---

## 8. 세 앱의 차이를 구조로 비교

| 항목 | `app_user` | `web_user` | `web_admin` |
|---|---|---|---|
| UX 형태 | 모바일 SPA | 데스크톱 콘솔 | 관리형 CRUD |
| 라우팅 중심 | 내부 state | Next route | Next route |
| 공통 셸 | 사실상 `LocavilleApp` | `Shell` | `Shell` |
| 인증/세션 | 샘플 사용자 + 앱 상태 | 현재 사용자/마을 context | admin local session |
| 데이터 집계 | `useLocavilleData` 일괄 조립 | 캐시+페이지 fetch 혼합 | 페이지별 fetch |
| 주요 난점 | 브라우저 기능, 상태 전이 | 운영 데이터 조합, 캐시 일관성 | 세션/관리 화면 계약 유지 |

---

## 9. 백엔드 연결 관점

### 9.1 `app_user`

주요 backend 연결:

- `/todo`
- `/diary`
- `/evidence`
- `/farmer/*`
- `/weather/today`
- `/photo-guard/coach`
- `/ai/*`

### 9.2 `web_user`

주요 backend 연결:

- `/admin/*`
- `/evidence`
- `/diary`
- `/project`
- `/engage`
- `/village`
- `/user-ville`
- `/reports`
- `/ai/*`

### 9.3 `web_admin`

주요 backend 연결:

- `/admin/login`
- `/admin/profile/*`
- `/project/*`
- `/project/{prj_id}/from-rag/activity`
- `/project/{prj_id}/from-rag/activity-rule`
- `/project/{prj_id}/activities/{activity_id}/job-setup`
- `/rag/*`
- `/village/*`
- `/weather/*`

---

## 10. 현재 코드 기준 주의 포인트

- `app_user`:
  - route 수는 적지만 실제 복잡도는 `components/LocavilleApp.tsx` 에 집중
  - 새 기능 추가 시 screen state / save flow / helper mode 영향 확인 필요

- `web_user`:
  - `admin-api.ts` 와 `chief-*` 캐시 계층 영향 범위가 큼
  - 동일 데이터가 여러 카드/페이지에서 재사용되므로 invalidate 설계가 중요

- `web_admin`:
  - 인증은 local storage 세션에 의존
  - 관리 화면별 API 명세가 backend 변경에 직접 민감
  - 특히 프로젝트 상세 화면은 활동규칙 JSON 형식과 작업 초안 API 계약이 바뀌면 바로 영향받는다

- 공통:
  - 세 앱 모두 별도 shared TS package 가 없으므로, 같은 개념이라도 타입/호출이 중복될 수 있음
  - `graphify-out` 산출물은 구조 파악용 참고본이지 runtime source-of-truth 는 아님

---

## 11. 새 작업 시작 시 추천 진입점

### 농업인 앱 수정

1. `app_user/components/LocavilleApp.tsx`
2. `app_user/components/LocavilleAppContainer.tsx`
3. `app_user/lib/use-locaville-data.ts`
4. 관련 `*-service.ts`

### 이장님 웹 수정

1. `web_user/app/<route>/page.tsx`
2. `web_user/components/Shell.tsx`
3. `web_user/lib/admin-api.ts`
4. 관련 `components/chief|dashboard|residents/*`

### 관리자 웹 수정

1. `web_admin/app/<route>/page.tsx`
2. `web_admin/components/Shell.tsx`
3. 관련 `lib/*-api.ts`

---

## 12. 이번 문서의 기준

- 실제 디렉터리 스냅샷:
  - `app_user/`
  - `web_user/`
  - `web_admin/`
- 구조 참고:
  - `locaville/graphify-out/.graphify_detect.json`
- 대표 진입 파일:
  - `app_user/app/page.tsx`
  - `app_user/components/LocavilleApp.tsx`
  - `app_user/components/LocavilleAppContainer.tsx`
  - `app_user/lib/use-locaville-data.ts`
  - `web_user/app/layout.tsx`
  - `web_user/components/Shell.tsx`
  - `web_user/app/dashboard/page.tsx`
  - `web_admin/app/layout.tsx`
  - `web_admin/components/Shell.tsx`
  - `web_admin/app/page.tsx`
