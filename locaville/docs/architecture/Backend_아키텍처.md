# Backend 아키텍처 구성

> 현재 시점 기준 (2026-06-16). `locaville/graphify-out` 와 실제 `backend/` 디렉터리 구성을 대조해 갱신함.  
> Backend stack: FastAPI + psycopg + PostgreSQL, 공용 DB 액세스는 `library/locaville/dbcom.py`.

---

## 1. 한눈에 보는 구조

```text
locaville/backend/
├── app/
│   ├── main.py                 FastAPI 진입점, CORS, lifespan, uploads mount
│   ├── routers/                HTTP endpoint 정의
│   ├── schemas/                Pydantic 요청/응답 모델
│   ├── services/               비즈니스 로직, AI, 외부 API 연동
│   ├── repositories/          DB/file/storage 접근 어댑터
│   ├── prompts/                LLM prompt 자원
│   └── utils/                  공용 유틸 (`todo_id.py`)
├── jobs/                       배치성 실행 엔트리
├── scripts/                    운영/ingest/검증 스크립트
├── tests/                      계층별 테스트
├── tools/                      수동 실행 도구
├── rag_sources/                정책 원문 / chunk 입력
├── uploads/                    업로드 파일 서빙 경로
├── outputs/                    생성 산출물
├── data/                       로컬 JSON 샘플/보조 데이터
└── README.md                   백엔드 실행/운영 문서
```

핵심 원칙:

- HTTP 진입은 `routers`
- 실제 업무 규칙은 `services`
- DB/file/storage I/O 는 `repositories`
- DB 접속 구현은 `repositories` 가 아니라 `locaville.dbcom` 에 집중

---

## 2. 요청 처리 흐름

```text
[Client]
   ↓
app/main.py
   FastAPI 생성
   CORS 설정
   /uploads static mount
   startup prewarm / shutdown pool close
   ↓
app/routers/*.py
   prefix, endpoint, schema 연결
   ↓
app/services/*.py
   도메인 규칙, AI 호출, 외부 API 호출, 조합 로직
   ↓
app/repositories/*.py
   PostgreSQL / file / Supabase storage 접근
   ↓
library/locaville/dbcom.py
   execute, fetch_one, fetch_all, transaction
   DB_SOURCE 분기(postgres/mysql)
```

`main.py` 기준 현재 런타임 특징:

- `lifespan` 시작 시 `admin_weather_service`, `farm_info_service` 캐시 prewarm
- 종료 시 `locaville.dbcom.close_pg_pool()` 호출
- `/uploads` 를 정적 서빙
- `localhost`, LAN IP, `*.vercel.app`, `*.onrender.com`, `ngrok`, `trycloudflare` 를 CORS 허용

---

## 3. `app/` 패키지 구성

### 3.1 routers

현재 `main.py` 에 등록된 라우터는 아래와 같음.

| 파일 | prefix | 역할 |
|---|---|---|
| `health.py` | 없음 (`/health` 등 직접 정의) | 서버/DB 상태 확인 |
| `ai.py` | `/ai` | chat, stream, STT, TTS, policy, evidence guide |
| `diary.py` | `/diary` | 영농일지 등록/조회 |
| `evidence.py` | `/evidence` | 증빙 업로드/조회/검토 |
| `admin.py` | `/admin` | 이장님 대시보드, recent evidence, helper, 비교/운영 조회 |
| `engage.py` | `/engage` | 사업 참여 등록/조회 |
| `project.py` | `/project` | 사업/활동/정책 초안 관련 엔드포인트 |
| `rag.py` | `/rag` | 문서/RAG 관리, 청크/헤딩 관련 API |
| `user_ville.py` | `/user-ville` | 현재 사용자-마을 컨텍스트 |
| `village.py` | `/village` | 마을 관리자 관점 데이터 |
| `demo.py` | `/demo` | 시연 데이터 seed/reset |
| `todo.py` | `/todo` | 오늘 할 일, 상태 계산 |
| `report.py` | `/reports` | 리포트/PDF 생성 |
| `ville_project.py` | `/ville-project` | 마을-사업 연결 데이터 |
| `weather.py` | `/weather` | 기상/농업 날씨 |
| `farm_job.py` | `/farm-job` | 작업 코드/카탈로그 |
| `business_management.py` | `/business-management` | 사업 운영 관리 |
| `farmer.py` | `/farmer` | 농업인/필지/오늘 한마디 |
| `photo_guard.py` | `/photo-guard` | 단발 검수, 라이브 코칭 |

주의:

- 과거 문서의 `/user-village`, `/village-admin`, `/report` 표기는 현재 코드와 다름
- 현재 실제 prefix 는 각각 `/user-ville`, `/village`, `/reports`

### 3.2 schemas

`schemas/` 는 라우터와 서비스 사이의 입출력 계약을 담당한다.

| 파일 | 용도 |
|---|---|
| `ai.py` | AI 요청/응답 모델 |
| `diary.py` | 영농일지 모델 |
| `engage.py` | 참여 등록 모델 |
| `evidence.py` | 증빙 모델 |
| `llm_compare.py` | LLM 비교/평가용 모델 |
| `project.py` | 사업/활동/정책 관련 모델 |
| `rag.py` | RAG 문서/헤딩/질의 모델 |
| `todo.py` | 할 일/상태 모델 |

### 3.3 services

서비스는 단일 거대 파일이 아니라 기능군별로 분화되어 있다.

#### 도메인 서비스

- `diary_service.py`
- `evidence_service.py`
- `todo_service.py`
- `project_service.py`
- `engage_service.py`
- `business_management_service.py`
- `village_service.py`
- `admin_service.py`
- `farm_helper_service.py`
- `advice_service.py`

#### 관리자/운영 보조 서비스

- `admin_auth_service.py`
- `admin_profile_service.py`
- `admin_project_draft_service.py`
- `admin_resident_service.py`
- `admin_weather_service.py`
- `farm_info_service.py`
- `weather_batch_service.py`

#### AI / RAG / 문서 처리

- `ai_service.py`
- `photo_guard_service.py`
- `advice_llm.py`
- `advice_rules.py`
- `rag_service.py`
- `rag_embedding_service.py`
- `rag_file_service.py`
- `supabase_rag_service.py`
- `document_ingest_service.py`
- `hwpx_ingest_service.py`
- `project_draft_extraction_service.py`
- `project_from_rag_service.py`

#### 외부 API / 미디어 / 계산 보조

- `weather_service.py`
- `geocode_service.py`
- `geocoding_service.py`
- `kakao_address_service.py`
- `image_quality.py`
- `job_schedule.py`
- `payment_service.py`
- `report_service.py`
- `demo_service.py`

메모:

- `geocode_service.py` 와 `geocoding_service.py` 가 공존하므로, 새 기능 추가 시 어느 쪽이 현재 호출 경로인지 먼저 확인 필요
- RAG 는 `rag_service.py` 단독이 아니라 ingest/embedding/file/Supabase 적재 서비스까지 분리된 상태
- 활동 등록 제안과 작업 등록 초안 생성은 이제 `project_from_rag_service.py` 가 담당하며, `prj_activity.description` 과 `prj_activity.activity_rule` 을 함께 해석하는 backend-first 구조로 정리되었다

### 3.4 repositories

저장소 계층도 RDB 전용만 있는 구조가 아니다.

#### RDB 어댑터

- `admin_resident_rdb.py`
- `admin_view_rdb.py`
- `advice_rdb.py`
- `business_management_rdb.py`
- `diary_rdb.py`
- `engage_rdb.py`
- `evidence_rdb.py`
- `farm_helper_rdb.py`
- `farmer_rdb.py`
- `health_rdb.py`
- `identity_rdb.py`
- `notification_rdb.py`
- `project_rdb.py`
- `rag_rdb.py`
- `todo_rdb.py`
- `user_ville_rdb.py`
- `village_rdb.py`
- `weather_rdb.py`

#### 파일 / 스토리지 / 로컬 캐시

- `diary_file.py`
- `evidence_file.py`
- `evidence_storage.py`
- `json_store.py`

Repository 계층 공통 원칙:

```python
from locaville.dbcom import execute, fetch_all, fetch_one, transaction
```

- DB SQL 실행은 `locaville.dbcom` 을 통해서만 처리
- `identity_rdb.py` 가 `farmer_id` 정규화의 중심축
- 증빙은 DB row + 파일 저장소(`evidence_storage.py`)가 함께 동작

### 3.5 prompts / utils

- `prompts/`
  - LLM system prompt, 비교 프롬프트 등 텍스트 자원을 보관하는 디렉터리
- `prompts/project_from_rag/activity_rule_system.txt`
  - 활동설명과 `farm_job` 목록만으로 활동규칙 JSON을 생성하는 전용 시스템 프롬프트
- `prompts/project_from_rag/activity_rule_user.txt`
  - 활동명, 활동설명, 작업목록을 주입하는 사용자 프롬프트 템플릿
- `utils/todo_id.py`
  - `todo_id` 파싱/조립 같은 공통 계산 유틸

---

## 4. 백엔드 바깥의 실행 보조 구조

### jobs

| 파일 | 역할 |
|---|---|
| `update_weather_job.py` | 날씨 배치 업데이트 엔트리 |

### scripts

주로 ingest, 정리, 검증, 데모 지원 스크립트가 모여 있다.

- `advice_batch.py`
- `analyze_chroma.py`
- `cleanup_smoke_test_data.py`
- `generate_demo_photos.py`
- `ingest_hwpx.py`
- `ingest_to_supabase.py`
- `normalize_kimys_todos.py`
- `setup_supabase_rag.py`
- `smoke_test_backend.py`
- `validate_rag_baseline.py`

### tests

테스트는 레벨 기반 명명 규칙과 API smoke 테스트를 함께 사용한다.

- `test_health_api.py`
- `test_todo_api.py`
- `test_p1_backend_api_smoke.py`
- `test_l1_smoke.py`
- `test_l2_invariants.py`
- `test_l3_e2e.py`
- `test_l3_e2e_extra.py`
- `test_l4_compliance.py`
- `test_l5_ai_fallback.py`
- `test_l6_senior_ux.py`
- `test_l7_performance.py`

### 기타 디렉터리

| 경로 | 역할 |
|---|---|
| `rag_sources/` | 정책 원문과 chunk 입력 자료 |
| `uploads/` | 사용자 업로드 이미지 정적 서빙 |
| `outputs/` | PDF/분석 산출물 |
| `tools/` | 수동 실행 도구 (`coach_eval.py`, `make_report.py` 등) |
| `data/` | 보조 JSON 데이터 |
| `docs/` | 백엔드 내부 운영 문서 |

---

## 5. 현재 구조 기준의 핵심 해석

### 5.1 이 백엔드는 단순 CRUD 서버가 아님

현재 파일 구성상 백엔드는 아래 4개 축을 함께 가진다.

1. 영농일지/증빙/할 일 도메인 API
2. 이장님/관리자 운영 API
3. AI 보조 API(STT, TTS, photo guard, advice, policy/RAG)
4. 문서 ingest / 벡터화 / 데모 / 배치 운영 도구

### 5.2 RAG 관련 코드가 앱 내부와 라이브러리 양쪽에 있음

- 앱 내부: `backend/app/services/*rag*`, `repositories/rag_rdb.py`
- 공용 라이브러리: `library/locaville/rag/*`

즉, RAG 변경은 `backend/app/services` 와 `library/locaville/rag` 를 함께 봐야 한다.

### 5.3 저장소 계층이 다중 저장소를 다룸

현재 저장 대상은 한 가지가 아니다.

- PostgreSQL
- Supabase Object Storage
- 로컬 파일시스템 (`uploads/`, JSON store)

그래서 `repositories/` 는 “SQL 전용 계층”이 아니라 “영속화 어댑터 모음”으로 이해하는 편이 맞다.

---

## 6. 수정 시 체크포인트

- 새 API 추가 시:
  - `routers/` endpoint 추가
  - 필요 시 `schemas/` 모델 추가
  - 핵심 로직은 `services/`
  - DB/file I/O 는 `repositories/`
  - `main.py` 라우터 등록 여부 확인

- DB 관련 수정 시:
  - `repositories` 에서 직접 커넥션 처리하지 말고 `locaville.dbcom` 사용
  - `farmer_id` 직접 하드코딩 대신 `identity_rdb` 경유 여부 확인

- AI/RAG 수정 시:
  - endpoint 라우터뿐 아니라 `prompts/`, ingest 스크립트, `library/locaville/rag` 영향 범위까지 확인

- 운영 문서 갱신 시:
  - 실제 파일 스냅샷은 `graphify-out/.graphify_detect.json` 으로 재검증 가능

---

## 7. 이번 갱신에서 반영한 차이

- 실제 존재하는 `schemas`, `prompts`, `utils`, `jobs`, `scripts`, `tests`, `tools` 반영
- 현재 라우터 prefix 기준으로 `/user-ville`, `/village`, `/reports` 수정
- 관리자/정책 초안/RAG 보조 서비스 파일군 반영
- repository 를 RDB 전용이 아닌 file/storage 포함 구조로 수정
- `main.py` 의 cache prewarm, uploads static mount, pool close 흐름 반영
- `project_from_rag_service.py` 를 활동 제안 전용이 아니라 활동규칙 생성과 작업등록 초안 생성까지 담당하는 서비스로 반영
- `prj_activity.description`, `prj_activity.activity_rule` 기반의 backend 정규화 책임을 반영
- 활동규칙 생성용 프롬프트(`activity_rule_system.txt`, `activity_rule_user.txt`)와 `farm_job` 목록 주입 흐름을 반영
