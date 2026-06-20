# 저탄마을 / Locaville

| 프로젝트 목표 | 저탄소 농업 프로그램의 영농일지, 증빙자료, 오늘 할 일, 이장님 검토 흐름을 하나의 시연 서비스로 연결 |
|--------------|------------------------------------------------------------------------------------------------|
| 프로젝트 성격 | 농업인 모바일 앱 + 이장님 단일 페이지 대시보드 + 관리자 웹 + FastAPI 공통 백엔드 |
| 주요 사용자 | 농업인(60-80대 대상), 이장님, 관리자 |

---

## 1. 시스템 구성

![시스템 구성도](<material_for_readme/아키텍쳐.drawio.png>)

농업인 앱(`app_user`), 이장님 대시보드(`web_user`), 관리자 대시보드(`web_admin`)는 각각의
Next.js 서버에서 동작하고, 공통 FastAPI 백엔드를 통해 PostgreSQL `locaville` DB와
파일 저장소(`backend/uploads`, `backend/outputs`)에 접근합니다.

OpenAI(Chat / Vision / STT / TTS), Kakao Local API(역지오코딩), 기상청 단기예보 API,
농촌진흥청 농사로 API 등 외부 API 는 백엔드에서만 호출하며, 프론트엔드는 비밀키를
보관하지 않습니다.

---

## 2. ERD

![ERD](<material_for_readme/스크린샷 2026-05-26 142148.png>)

핵심 도메인은 **사용자/마을(`user_master`, `farmer`, `village`, `ville_group`,
`group_member`)** → **사업/활동(`project`, `prj_group`, `prj_activity`, `prj_todo_list`)** →
**기록(`journal`, `evidence`, `prj_journal`)** → **도우미/알림(`farm_helper_pair`,
`notification`)** 의 4계층입니다.

`journal`/`evidence` 는 `(user_no, job_date, exec_no[, seq_no])` 복합 PK,
`parcel` 은 `(amo_regno, parcel_no)` 복합 PK이며, 화면에서 쓰는 `diary_id` /
`evidence_id` / `todo_id` 는 이 PK 들을 `-` 로 이어붙인 문자열입니다.

---

## 3. 기술 스택

| 구분 | 기술 |
|------|------|
| **Backend** | FastAPI, Python, Uvicorn, psycopg (PostgreSQL) |
| **App (농업인)** | Next.js 16, React 19, TypeScript 5.7, Turbopack |
| **Web (이장님 / 관리자)** | Next.js 16, React 19, TypeScript 5.7 |
| **Database** | PostgreSQL `locaville` DB |
| **AI** | OpenAI API (Chat / Vision / STT / TTS) — 영농일지 초안, 증빙 가이드, 라이브 사진 코칭, advice 멘트 생성, 음성 |
| **RAG** | Chroma / LangChain (정책 문서 Q&A 전용) |
| **Image** | Pillow 워터마크 + OpenCV(Laplacian) 품질 검사 |
| **Geo** | Kakao Local API → Nominatim 폴백 |
| **Weather** | 기상청 단기예보 API (TMX/TMN/TMP/POP/PTY) |
| **Report** | ReportLab 기반 프로젝트 PDF 생성 |

---

## 4. 전체 파일 구조

```text
locaville/
│
├── backend/                              # FastAPI 공통 백엔드
│   ├── README.md                         # 백엔드 상세 실행/계약 문서
│   ├── requirements.txt                  # Python 의존성
│   ├── app/
│   │   ├── main.py                       # FastAPI 앱 진입점, CORS, uploads static mount
│   │   │
│   │   ├── routers/                      # REST API 라우터
│   │   │   ├── health.py                 # GET /health
│   │   │   ├── diary.py                  # 영농일지 조회/저장
│   │   │   ├── evidence.py               # 증빙자료 조회/업로드/상태 변경
│   │   │   ├── todo.py                   # 오늘 할 일 + computed_status
│   │   │   ├── project.py                # 사업 + 활동 목록
│   │   │   ├── farmer.py                 # 농가 필지, advice (`/farmer/{id}/advice/today`)
│   │   │   ├── farm_job.py               # 작업(job_cd) 카탈로그
│   │   │   ├── ville_project.py          # 마을 단위 사업 조회
│   │   │   ├── weather.py                # 기상청 단기예보 + 마을 좌표
│   │   │   ├── engage.py                 # 사업 참여(농가 등록·활동 선택·To-do 생성)
│   │   │   ├── user_ville.py             # 현재 로그인 사용자/마을 컨텍스트
│   │   │   ├── photo_guard.py            # 사진 가이드 (`/check`) + 라이브 코칭 (`/coach`)
│   │   │   ├── business_management.py    # 이장님 사업 관리
│   │   │   ├── village.py                # 마을 단위 관리자
│   │   │   ├── admin.py                  # 이장님 요약/상태 API
│   │   │   ├── demo.py                   # 시연 데이터 생성/초기화/GPS seed
│   │   │   ├── ai.py                     # AI 채팅, STT/TTS, 음성 세션
│   │   │   └── report.py                 # 프로젝트 리포트 preview/PDF
│   │   │
│   │   ├── services/                     # 비즈니스 로직
│   │   │   ├── diary_service.py          # 영농일지 저장/조회
│   │   │   ├── evidence_service.py       # 증빙 저장/조회/워터마크
│   │   │   ├── todo_service.py           # To-do 조회 + computed_status
│   │   │   ├── project_service.py        # 사업 조회
│   │   │   ├── engage_service.py         # 사업 참여 등록
│   │   │   ├── business_management_service.py # 이장님 사업 관리 로직
│   │   │   ├── village_service.py        # 마을 관리자 로직
│   │   │   ├── admin_service.py          # 관리자 대시보드 집계
│   │   │   ├── admin_auth_service.py     # 관리자 인증
│   │   │   ├── admin_profile_service.py  # 관리자 프로필
│   │   │   ├── admin_resident_service.py # 관리자 주민 조회
│   │   │   ├── admin_weather_service.py  # 관리자 날씨 fetch
│   │   │   ├── demo_service.py           # demo seed / reset
│   │   │   ├── ai_service.py             # OpenAI Chat / Vision / STT / TTS 공통
│   │   │   ├── photo_guard_service.py    # 사진 분류 (`analyze_photo_environment`) +
│   │   │   │                             # 라이브 코칭 (`coach_photo`) — PIC/RCT/EDU 분기
│   │   │   ├── advice_service.py         # "오늘 한마디" 캐시 + 멘트 생성
│   │   │   ├── advice_rules.py           # 시나리오 매칭 룰
│   │   │   ├── advice_llm.py             # 룰 결과 → 자연스러운 한국어 한 줄로
│   │   │   ├── weather_service.py        # 기상청 단기예보 fetch + 요약
│   │   │   ├── farm_helper_service.py    # 도우미 짝(pair) 관리, 동의 흐름
│   │   │   ├── farm_info_service.py      # 농촌진흥청 정보 fetch
│   │   │   ├── geocode_service.py        # GPS → 한국 주소
│   │   │   ├── geocoding_service.py      # 보조 geocoder
│   │   │   ├── kakao_address_service.py  # Kakao Local API 어댑터
│   │   │   ├── payment_service.py        # 정산 (개발 중)
│   │   │   ├── rag_service.py            # 정책 문서 Q&A
│   │   │   ├── hwpx_ingest_service.py    # HWPX → Chroma ingest
│   │   │   ├── report_service.py         # 프로젝트 리포트 생성
│   │   │   └── image_quality.py          # Laplacian 흐림도 검사
│   │   │
│   │   ├── repositories/                 # 저장소 계층 (psycopg + dbcom)
│   │   │   ├── diary_rdb.py              # journal/prj_journal INSERT/SELECT
│   │   │   ├── evidence_rdb.py           # evidence INSERT/SELECT
│   │   │   ├── todo_rdb.py               # prj_todo_list 조회
│   │   │   ├── farmer_rdb.py             # 농가/필지 조회
│   │   │   ├── identity_rdb.py           # farmer_id → user_no/amo_regno/group_no
│   │   │   └── ...
│   │   │
│   │   ├── schemas/                      # Pydantic 요청/응답 모델
│   │   ├── utils/
│   │   └── ...
│   │
│   ├── uploads/evidence/                 # 증빙 이미지(original/watermarked)
│   ├── outputs/reports/                  # PDF 리포트
│   ├── rag_sources/                      # HWPX 정책 문서 ingest 결과
│   ├── scripts/                          # smoke test, cleanup, HWPX ingest, todo 정규화 등
│   └── docs/                             # API/data-flow/RAG 문서
│
├── app_user/                             # 농업인 모바일 앱 (구 v0_farmer)
│   ├── app/
│   │   ├── layout.tsx                    # Next.js root layout
│   │   ├── page.tsx                      # LocavilleApp dynamic ssr:false 진입
│   │   └── dev/seed-here/page.tsx        # 시연 GPS seed 등록 (개발용)
│   │
│   ├── components/                       # 모두 평탄. prefix 디렉토리 X.
│   │   ├── LocavilleApp.tsx              # SPA 화면 라우팅 + 키프-얼라이브 + 도우미 모드
│   │   ├── SplashScreen.tsx              # 시작 화면 (자동 2초)
│   │   ├── LoginSelectScreen.tsx         # 로그인 방식 선택 (카카오 / 직접)
│   │   ├── ManualLoginScreen.tsx         # 직접 로그인 (데모용, 비밀번호 미검증)
│   │   ├── HomeScreen.tsx                # 오늘 할 일 + advice + 자유 기록 + 도우미 카드
│   │   ├── HomeLoadingScreen.tsx         # 홈 진입 시 새싹 트랜지션 (2.2초)
│   │   ├── JournalScreen.tsx             # 영농일지 목록
│   │   ├── JournalDetailScreen.tsx       # 영농일지 상세
│   │   ├── BusinessScreen.tsx            # 참여 사업 목록
│   │   ├── BusinessDetailScreen.tsx      # 사업 상세 + 활동 + 증빙 + PDF
│   │   ├── ManualInputScreen.tsx         # 영농일지 단일 진입점 (마이크 STT + 사진 첨부 + 작업/필지)
│   │   ├── PhotoInputScreen.tsx          # to-do 사진 등록 (라이브 코칭 진입)
│   │   ├── PhotoLiveCoachOverlay.tsx     # 라이브 카메라 + 2초 Vision 코칭 (Gemini flash-lite) + Chirp 3 HD TTS prefetch 캐시
│   │   ├── HelpScreen.tsx                # 도움말 (쉬운 모드 EasyChatCard + 표준 모드 ChatHelp, RAG + STT)
│   │   ├── SettingsScreen.tsx            # 설정
│   │   ├── SaveCompleteScreen.tsx        # 저장 완료
│   │   ├── CompletionModal.tsx           # 기록/사진 완료 팝업 (시니어 톤)
│   │   ├── TodoIllustration.tsx          # todo 카드 일러스트 + evidence kind 매핑
│   │   ├── TodoSkeleton.tsx              # 로딩 스켈레톤
│   │   ├── TodoPhotoGuideModal.tsx       # todo 클릭 시 사진 가이드 안내
│   │   ├── WeatherWidget.tsx             # 헤더 날씨 (현재 + tmx/tmn)
│   │   ├── NotificationPanel.tsx         # 우상단 알림 패널
│   │   ├── NotificationActionPromptModal.tsx # 알림 클릭 후 후속 액션 confirm
│   │   ├── HelperConsentModal.tsx        # 도우미 동의 모달
│   │   └── HelperModeTransitionScreen.tsx # 도우미 모드 전환 풀스크린 (트랙터 2.5초)
│   │
│   ├── lib/                              # 프론트 데이터/도메인 로직
│   │   ├── data-source.ts                # API/local 모드 분기
│   │   ├── sample-user-context.ts        # 데모 사용자 (farmer_id 만)
│   │   ├── helper-mode-context.ts        # 도우미 모드 Context Provider
│   │   ├── todo-service.ts               # /todo/today, /todo
│   │   ├── todo-display.ts               # todo 카드 표시 메시지 빌더
│   │   ├── diary-service.ts              # /diary 저장/조회
│   │   ├── diary-types.ts                # diary 타입
│   │   ├── diary-repository.ts           # API/local 어댑터
│   │   ├── evidence-service.ts           # /evidence/upload 등
│   │   ├── evidence-types.ts             # evidence 타입
│   │   ├── evidence-repository.ts        # API/local 어댑터
│   │   ├── parcel-service.ts             # /farmer/{id}/parcels + 캐시
│   │   ├── parcel-reference.ts           # 텍스트/ID → 필지 추론
│   │   ├── farm-job-service.ts           # /farm-job/list + 카테고리 그룹화
│   │   ├── farm-reference.ts             # 작업 alias seed
│   │   ├── farm-helper-service.ts        # 도우미 pair 조회/동의/토글
│   │   ├── advice-service.ts             # /farmer/{id}/advice/today
│   │   ├── photo-coach-service.ts        # /photo-guard/coach (라이브 frame POST)
│   │   ├── geolocation-service.ts        # navigator.geolocation 래퍼
│   │   ├── notification-service.ts       # /notification, 읽음 처리
│   │   ├── ai-service.ts                 # /ai/chat, /ai/stt, /ai/tts
│   │   ├── tts-service.ts                # 브라우저 speechSynthesis 폴백
│   │   ├── business-service.ts           # /project 클라이언트
│   │   ├── display-labels.ts             # 코드 → 한국어 라벨
│   │   └── ...
│   │
│   ├── public/ + styles/
│   └── next.config.mjs                   # allowedDevOrigins 등
│
├── web_user/                             # 이장님 단일 페이지 대시보드 (구 v0_chief)
│   ├── app/                              # Next.js app router (단일 page 위주)
│   ├── components/                       # 대시보드 카드, 표, 모달
│   └── lib/                              # admin-api 등
│
├── web_admin/                            # 관리자(상위) 대시보드 — 신규
│   ├── app/                              # 마을/사업 정책 관리
│   ├── components/
│   └── lib/
│
├── library/                              # 공용 Python 패키지 (`locaville` package — dbcom, rag 등)
│   ├── pyproject.toml                    # editable install: pip install -e locaville/library
│   └── locaville/
│       ├── dbcom.py                      # DB 연결 + execute/fetch_one/fetch_all/transaction
│       ├── rag/                          # RAG 공용 (chunk_documents, hwpx parser)
│       ├── storage_client.py             # Supabase Object Storage 클라이언트
│       ├── remote_store.py
│       └── utilities.py
│
├── docs/                                 # 프로젝트 운영 문서 (카테고리별 정리)
│   ├── architecture/                     # 시스템/백엔드 아키텍처
│   ├── database/                         # DB 스키마, view, refactoring 가이드
│   ├── business/                         # 사업 흐름 / 사업참여 / 일지연계
│   ├── spec/                             # 기능 사양 (advice, farmer-helper, notification)
│   ├── dev/                              # dev-status, env-setup, onboarding, limitations
│   ├── demo/                             # 시연 runbook / scenario / checklist
│   ├── prompts/                          # 개발용 prompt 파일들
│   ├── guidelines/                       # 정부 시행지침 원본 hwpx/hwp + RAG 추출본
│   ├── design-system/                    # 디자인 토큰
│   └── images/                           # 문서 첨부 이미지
└── material_for_readme/                  # README 첨부 이미지
    ├── 아키텍쳐.drawio.png
    └── 스크린샷 2026-05-26 142148.png
```

---

## 5. 파일 간 연계 구조

### 5-1. 백엔드 계층 구조

```text
[HTTP 요청]
    ↓
backend/app/main.py
    FastAPI 앱, CORS, /uploads static mount, 라우터 등록
    ↓
backend/app/routers/*.py
    엔드포인트, 요청 검증, 응답 모델 연결
    ↓
backend/app/services/*.py    ◀── 비즈니스 로직 (advice / photo_guard / weather / helper 등)
    ↓
backend/app/repositories/*.py
    psycopg 기반 RDB 어댑터 (dbcom.execute / fetch_one / fetch_all / transaction)
    ↓
[PostgreSQL locaville DB] + [backend/uploads/] + [backend/outputs/]
```

### 5-2. 농업인 앱 호출 흐름

```text
[농업인 폰 브라우저]
    ↓
app_user/app/page.tsx  (LocavilleApp dynamic ssr:false)
    ↓
components/LocavilleApp.tsx
    화면 상태 + keep-alive (홈/일지/사업/도움말/설정) + 도우미 모드 토글
    ↓
HomeScreen / ManualInputScreen (영농일지 단일 진입점) / PhotoInputScreen (to-do 사진) / JournalScreen / ...
    ↓
app_user/lib/*-service.ts
    API 호출, 로컬 폴백, 화면용 데이터 가공
    ↓
NEXT_PUBLIC_API_BASE_URL
    ↓
[FastAPI backend]
```

### 5-3. 이장님 대시보드 호출 흐름

```text
[이장님 브라우저]
    ↓
web_user/app/...
    ↓
web_user/lib/admin-api.ts
    ↓
NEXT_PUBLIC_API_BASE_URL → [FastAPI backend]
```

### 5-4. 라이브 사진 코칭 흐름

```text
PhotoInputScreen 진입
    ↓
PhotoLiveCoachOverlay mount
    navigator.mediaDevices.getUserMedia({video: environment})  ← HTTPS 또는 localhost 만
    정적 안내 6종 prefetchChirp(text) ← mp3 blob URL 캐시
    ↓
2초마다 video → 중앙 65% crop → 640x480 다운샘플 → JPEG (q=0.5)
    ↓ (LLM 호출 inflight 가드 + 응답 await 전에 다음 tick 미리 예약 — 병렬)
POST /photo-guard/coach (multipart, evidence_type, job_cd)
    ↓
photo_guard_service.coach_photo
    PIC / RCT / EDU 별 한국어 코칭 프롬프트
    Gemini 2.5-flash-lite (OpenAI 호환, max_tokens=200, thinking off)
    ↓
{status: ok|adjust|wait, message}
    ↓
maybeSpeak(message)
    Cache hit → mp3 0ms 재생
    Cache miss → POST /ai/tts → Google Chirp 3 HD Kore mp3 → 캐시 저장 + 재생
    ↓
ok 3연속 → 폴링 정지 (sigDiff > 10 = 카메라 움직임 감지 시 재개)
    ↓
사용자 셔터 → 풀해상도 캡처 → file → PhotoInputScreen.handleUpload
    ↓
POST /evidence/upload
    → classify_and_extract_evidence (영수증 OCR vendor/amount/items/date)
    → judge_todo_match (Gemini 2.5-flash) + 영수증 vendor 룰 매칭
    → needs_chief_verification 판정 → journal + prj_journal + evidence INSERT
```

### 5-5. To-do 산정 흐름

```text
PostgreSQL prj_todo_list
    원본 To-do 일정
        ↓
farm_job / prj_activity / parcel
    작업명, 활동명, 필지 정보 조인
        ↓
identity_rdb
    farmer_id(login_id/farmer_regno/user_no/amo_regno) → user_no/amo_regno/group_no
        ↓
todo_rdb
    농가의 group_no 동적 resolve, 필지 매칭
        ↓
todo_service.computed_status
    현재 journal/evidence 상태로 pending/in_progress/completed 계산
        ↓
GET /todo/today
        ↓
HomeScreen 의 urgentTodos
```

### 5-6. advice (오늘 한마디) 흐름

```text
HomeScreen 진입
    ↓
GET /farmer/{id}/advice/today
    ↓
advice_service._build_farmer_context
    open_todos (due_date asc + activity_id dedup) + weather (마을 ville_id → nx/ny)
    + evidences (최근 N건) + helper-role 등
        ↓
advice_rules
    시나리오 매칭 (TODAY_TODO / EVIDENCE_RETAKE / 기타) — 룰 1순위
        ↓
advice_llm
    매칭된 시나리오 + 컨텍스트 → 80자 이내 한 줄 한국어 (system prompt 강화, 금지 키워드 11개)
        ↓
DB upsert 캐시 (date 단위)
        ↓
HomeScreen 의 "✦ 오늘 한마디"
```

### 5-7. 도우미 모드 흐름

```text
홈 화면의 "농사 도와주기" 카드
    ↓
"도와주러 가기" 토글  → handleToggleHelperMode(true)
    helperModeOn = true 즉시 → effectiveFarmerIdForApp 변경 → recipient 데이터 fetch
    동시에 HelperModeTransitionScreen("enter") 풀스크린 트랙터 애니메이션 2.5초
    ↓
헤더 띠 "OO 도와드리는 중" + recipient 의 todo/사진/일지 fetch
    ↓
helper 가 사진 / 일지 기록 — backend 에 recipient 의 user_no 로 저장
    ↓
"도움 마치기" → handleToggleHelperMode(false)
    helperModeOn = false 즉시 → 내 농가 데이터 fetch
    HelperModeTransitionScreen("leave") 트랙터 반대 방향 2.5초 (그 사이 데이터 prefetch 완료)
    ↓
fully loaded 내 홈 화면
```

---

## 6. 주요 기능

### Backend

- `GET /health` 로 서버와 DB 연결 상태 확인
- 영농일지 생성/조회 (`journal` + `prj_journal` 동시 INSERT)
- 증빙자료 생성/조회/업로드/상태 변경 (워터마크 + GPS + 역지오코딩 주소)
- 오늘 할 일 및 To-do `computed_status` 동적 계산
- 마을/그룹/농가 단위 사업 + 활동 + 참여 등록
- 농가별 필지 (parcel) 조회
- 현재 로그인 사용자/마을 컨텍스트
- **사진 가이드** (`/photo-guard/check`) — 단발 Vision 검수 (PIC / RCT / EDU 분기)
- **사진 라이브 코칭** (`/photo-guard/coach`) — 3초 폴링 짧은 한국어 코칭 (신규)
- **advice (오늘 한마디)** — 룰 매칭 + LLM 표현 변형 + DB 캐시 (`/farmer/{id}/advice/today`)
- **기상청 날씨** — 단기예보 + 마을 좌표 (`/weather/...`)
- **도우미 모드** — helper/recipient pair 동의 흐름, 활동 토글
- **알림 시스템** — `notification` 테이블 + content_cd 별 후속 액션 분기 (RETAKE / MANUAL / HLP_INV / TODO_DUE 등)
- AI 채팅, STT/TTS, 음성 세션
- 프로젝트 리포트 preview / PDF 생성
- 시연 데이터 생성/초기화 + 폰 GPS seed

### 농업인 앱 `app_user`

- 오늘 할 일 카드 (가장 임박한 1건 + "N건 더 보기")
- ✦ AI 오늘 한마디 (advice)
- 자유 기록 — `ManualInputScreen` 단일 진입점 (마이크 STT + 사진 첨부 + 작업/필지)
- **라이브 카메라 코칭** (PhotoLiveCoachOverlay) — 중앙 65% crop + 다운샘플 + Chirp 3 HD TTS (prefetch 캐시)
  - "조금 더 가까이 가 주세요" / "잘 보여요, 찍어 주세요" / "조금만 가만히 들고 계세요"
  - PIC / RCT (영수증) / EDU (이수증) 별 분기
- 손으로 직접 적기 화면에서도 사진 첨부 가능 (linked_evidence_ids 자동 연결)
- 영농일지 목록/상세
- 참여 사업 목록/상세 + 증빙 + PDF
- 도움말 챗 (RAG 정책 문서 Q&A + STT/TTS + 키보드 위 입력바 자동 조정)
- 농사 도우미 모드 — 다른 농가 기록 대행 (트랙터 트랜지션 + 헤더 띠 + 데이터 prefetch)
- 알림 — 재촬영 요청, 도우미 초대, todo 임박 등 즉시 액션 분기
- 시연 GPS seed 페이지 (`/dev/seed-here`)

### 이장님 웹 `web_user`

- 단일 페이지 대시보드 — 영농일지/증빙 검토 + 농가 현황
- 증빙자료 상태 변경 (confirmed / retake_required)
- 활동별 모범 사진 폴백
- 사업 참여 등록 흐름
- 고령 친화 폰트/레이아웃 (Pretendard)

### 관리자 웹 `web_admin`

- 마을 단위 사업/활동 관리
- 농가 등록/조회
- 사업 정책 관리 (신규)

---

## 7. API 목록 (주요 발췌)

| Method | Endpoint | 설명 |
|--------|----------|------|
| `GET` | `/health` | 서버 + DB 상태 |
| `GET` | `/diary` / `/diary/{id}` | 영농일지 목록/상세 |
| `POST` | `/diary` | 영농일지 생성 |
| `GET` | `/evidence` / `/{id}` | 증빙자료 목록/상세 |
| `GET` | `/evidence/missing` | 미제출/누락 증빙 요약 |
| `POST` | `/evidence/upload` | 증빙 이미지 업로드 (+워터마크) |
| `PATCH` | `/evidence/{id}` | 증빙 상태 변경 |
| `GET` | `/todo` / `/todo/today` | To-do 목록 + 오늘 할 일 |
| `GET` | `/project` | 사업 + 활동 목록 |
| `GET` | `/ville-project/...` | 마을 단위 사업 |
| `GET` | `/farmer/{id}/parcels` | 농가 필지 목록 |
| `GET` | `/farmer/{id}/advice/today` | 오늘 한마디 (캐시 + 강제 새로고침 `?force=true`) |
| `GET` | `/farm-job/list` | 작업 카탈로그 |
| `GET` | `/user-village/me` | 현재 사용자/마을 컨텍스트 |
| `GET` | `/weather/...` | 기상청 단기예보 |
| `POST` | `/photo-guard/check` | 사진 단발 검수 (PIC/RCT/EDU) |
| `POST` | `/photo-guard/coach` | 라이브 카메라 코칭 frame (신규) |
| `GET/POST` | `/engage/...` | 사업 참여 등록 흐름 |
| `GET/POST` | `/business-management/...` | 이장님 사업 관리 |
| `GET/POST` | `/village/...` | 마을 관리자 |
| `GET` | `/admin/summary` | 이장님 대시보드 요약 |
| `POST` | `/ai/chat` | RAG 채팅 (도움말) |
| `POST` | `/ai/stt` / `/ai/tts` | STT / TTS |
| `POST` | `/demo/reset` / `/demo/seed` / `/demo/seed-parcel-gps` | 시연 데이터 |
| `GET` | `/report/project-preview` / `/project-pdf` | 프로젝트 리포트 |

(전체 라우터/엔드포인트는 `backend/app/routers/` 참고)

---

## 8. 실행 방법

### 8-1. Backend 실행

```powershell
cd locaville/backend
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
.\.venv\Scripts\python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

bash:

```bash
cd locaville/backend
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 8-2. 농업인 앱 실행 (app_user)

```bash
cd locaville/app_user
pnpm install
pnpm dev
```

기본 개발 서버 `http://localhost:3000`. 폰에서 LAN 접속 시 `next.config.mjs` 의
`allowedDevOrigins` 에 LAN IP 추가 필요. **라이브 카메라 (getUserMedia) 는 HTTPS
또는 localhost 에서만 작동** — 폰 LAN 시연 시 카메라 안 켜짐, 배포(HTTPS) 또는
Chrome flag/터널 필요.

### 8-3. 이장님 대시보드 실행 (web_user)

```bash
cd locaville/web_user
pnpm install
pnpm dev -- -p 3001
```

### 8-4. 관리자 대시보드 실행 (web_admin)

```bash
cd locaville/web_admin
pnpm install
pnpm dev -- -p 3002
```

백엔드 CORS 는 dev origin 3000/3001/3002 를 허용합니다.

---

## 9. 환경변수

### Backend `.env`

```env
OPENAI_API_KEY=<your-openai-api-key>
KAKAO_REST_API_KEY=<your-kakao-rest-api-key>
DATA_GO_KR_SERVICEKEY=<your-data-go-kr-service-key>   # 기상청 단기예보
NONGSARO_API_KEY=<your-nongsaro-api-key>              # 농촌진흥청 농사로

# PostgreSQL
DATABASE_URL=<your-postgres-connection-string>
# (또는 분리형)
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=locaville
DB_USER=postgres
DB_PASSWORD=<your-db-password>

DATA_SOURCE=postgres

# (선택) 데모 기본값
DEFAULT_CHIEF_USER_NO=10000001
DEFAULT_VILLE_ID=LOCALVILLE01
```

### App `.env.local` (`app_user`)

```env
NEXT_PUBLIC_DATA_SOURCE=api
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

### Web `.env.local` (`web_user`, `web_admin`)

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

주의:

- 실제 `.env` 파일은 커밋하지 않습니다.
- `OPENAI_API_KEY`, `KAKAO_REST_API_KEY`, `DATA_GO_KR_SERVICEKEY`, `NONGSARO_API_KEY`,
  `DB_PASSWORD` / `DATABASE_URL` 은 **프론트엔드에 절대 노출하지 않습니다**.
- `NEXT_PUBLIC_OPENAI_API_KEY` 같은 공개 환경변수를 만들지 않습니다.
- README 나 로그에 실제 키/비밀번호 값을 출력하지 않습니다.

---

## 10. 저장소와 데이터 경계

| 데이터 | 현재 경로 |
|--------|-----------|
| 사용자/마을 | PostgreSQL `user_master`, `farmer`, `village`, `ville_group`, `group_member` |
| 필지 | `parcel` (PK: `amo_regno`, `parcel_no`) — 컬럼명 `parcel_usage`, `parcel_area` |
| 사업/활동 | `project`, `prj_group`, `prj_activity`, `farm_job` |
| To-do 원본 | `prj_todo_list` |
| 영농일지 | `journal` + `prj_journal` (PK: `user_no`, `job_date`, `exec_no`) |
| 증빙 메타 | `evidence` (PK: `user_no`, `job_date`, `exec_no`, `seq_no`) |
| 증빙 이미지 | `backend/uploads/evidence/{original,watermarked}/` |
| 리포트 출력 | `backend/outputs/reports/` |
| 도우미 짝 | `farm_helper_pair` (helper / recipient + approved_at) |
| 알림 | `notification` (content_cd: RETAKE / MANUAL / HLP_INV / TODO_DUE 등) |
| advice 캐시 | `farmer_advice` (date 단위 upsert) |
| RAG 정책 문서 | `backend/rag_sources/` (Chroma 인덱스) |

운영 원칙:

- To-do 산정에 RAG 를 사용하지 않습니다.
- `computed_status` 는 DB 에 쓰지 않고 journal/evidence 상태로 계산합니다.
- `group_no` / `amo_regno` / `user_no` 는 프론트엔드 하드코딩 없이 `farmer_id` 로
  backend 가 동적 resolve 합니다.
- 마을·그룹·사업·필지 같은 권위 데이터는 모두 backend 가 내려주고 프론트는
  alias seed 외에는 정적 배열을 두지 않습니다.
- 증빙 업로드는 원본을 보존하고 기본 `image_url` 은 워터마크 이미지를 내려줍니다.
- AI 응답은 사용자 화면에 노출 전에 검증되며, 영농일지/증빙/To-do 의 권위 source 는 항상 DB.
- AI 자동 저장(auto-save) 금지 — 사용자가 명시적으로 누른 경우만 INSERT.

---

## 11. 검증 방법

### Backend 문법 확인

```bash
cd locaville/backend
python -m compileall app
```

### Backend smoke test

```bash
cd locaville/backend
python scripts/smoke_test_backend.py --base-url http://127.0.0.1:8000
```

### Frontend type check

```bash
cd locaville/app_user && pnpm exec tsc --noEmit
cd locaville/web_user && pnpm exec tsc --noEmit
cd locaville/web_admin && pnpm exec tsc --noEmit
```

### Frontend build

```bash
cd locaville/app_user && pnpm build
cd locaville/web_user && pnpm build
cd locaville/web_admin && pnpm build
```

---

## 12. 개발 주의사항

- DB 에 `INSERT`/`UPDATE`/`DELETE`/`ALTER`/`DROP` 을 직접 실행하지 않습니다
  (영농일지/증빙 저장은 backend 어댑터를 통해서만 일어납니다).
- 프론트엔드에는 공개 가능한 `NEXT_PUBLIC_*` 값만 둡니다.
- 증빙 업로드 API 는 원본을 보존하고 기본 `image_url` 은 워터마크 이미지를 내려줍니다.
- `/health` 응답에는 `.env` 값이나 비밀번호가 포함되면 안 됩니다.
- RAG 는 정책 문서 Q&A 전용이며 `/todo`, `/todo/today`, `computed_status` 계산에 사용하지 않습니다.
- AI 는 advisory — 영농일지/증빙/To-do 의 권위 source 는 항상 DB.
- 60-80대 농가 대상 UI 는 여백을 풍성히, 빡빡한 layout 금지.
- DB 스키마 변경은 DBA 협의 후 spec 문서 작성 → 적용.
- 신 ID 체계를 사용합니다.

신 ID 예시:

| 항목 | 형식 | 예시 |
|------|------|------|
| `diary_id` | `{user_no}-{yyyymmdd}-{exec_no}` | `10000002-20260604-1` |
| `evidence_id` | `{user_no}-{yyyymmdd}-{exec_no}-{seq_no}` | `10000002-20260604-1-1` |
| `todo_id` | `{group_no}-{prj_id}-{activity_id}-{job_seq}` | `100001-KK26A001-AWT0011-1` |

---

## 13. 데모 사용자 기준

`DATA_SOURCE=postgres` 모드의 대표 시연 컨텍스트:

| 구분 | 값 |
|------|----|
| 마을 | `LOCALVILLE01` 서호마을 |
| 그룹 | `1000000102` 서호마을작목반 |
| 사업 | `KK26A001` 2026 저탄소 농업 프로그램 시범사업 |
| 데모 프로젝트 키 | `prj_2026_demo` → `PRJ000001` |
| 농가 `amo_regno` 범위 | `1110000001` ~ `1110000008` |
| 농가 `user_no` 범위 | `10000001` ~ `10000008` |

대표 농업인 데모 사용자 (`SAMPLE_USER_CONTEXT`):

| 항목 | 값 |
|------|----|
| `farmer_id` | `kimys68` |
| `user_name` | 김영수 |

프론트엔드는 `farmer_id` 하나만 가지고 다니며, 백엔드의 `identity_rdb.resolve_*` 가
`login_id` / `farmer_regno` / `user_no` / `amo_regno` 어느 형태도 받아
`user_no` · `amo_regno` · `group_no` 로 정규화합니다.

---

## 14. 참고 문서

- `backend/README.md`: 백엔드 실행, 저장소 경계, API 계약 상세
- `backend/docs/api-contracts.md`: API 계약 문서
- `backend/docs/data-flow-contract.md`: 데이터 흐름 계약
- `backend/docs/rag-ingestion.md`: RAG/HWPX ingest 문서
- `docs/architecture/`, `docs/database/`, `docs/business/`, `docs/spec/`, `docs/dev/`, `docs/demo/`, `docs/prompts/`, `docs/guidelines/`: 도메인별 운영 문서
- `library/`: 공용 Python 패키지 (`locaville` — dbcom + rag). backend 가 editable install 로 import

