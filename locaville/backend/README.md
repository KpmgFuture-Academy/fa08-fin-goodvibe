# 저탄마을 Backend

FastAPI 기반 저탄마을 백엔드입니다. 현재는 혼합 저장 구조를 사용합니다.

- `DATA_SOURCE=json`: 영농일지/증빙/오늘 할 일 모두 기존 JSON/API 흐름
- `DATA_SOURCE=mysql`: 오늘 할 일은 MySQL 읽기, 영농일지는 MySQL `journal` 저장/조회, 증빙 메타데이터는 MySQL `evidence` 저장/조회


## Frontend 명령 표준

- 팀 표준은 pnpm 직접 실행입니다.
- corepack 기반 pnpm ... 명령은 사용하지 않습니다.
- pnpm 미설치 시 
pm install -g pnpm으로 설치합니다.


## 설치

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
```

또는 전역 Python 환경에서:

```powershell
python -m pip install -r requirements.txt
```

## 실행

```powershell
.\.venv\Scripts\python -m uvicorn app.main:app --reload
```

또는:

```powershell
python -m uvicorn app.main:app --reload
```

## Backend 우선 검증

프론트 UX를 수정하기 전에 backend API 계약이 살아있는지 먼저 확인합니다.

1. 백엔드 실행:

```powershell
python -m uvicorn app.main:app --reload
```

2. 앱 문법 확인:

```powershell
python -m compileall app
```

3. smoke test 실행:

```powershell
python scripts/smoke_test_backend.py --base-url http://127.0.0.1:8000
```

smoke test는 `GET /health`, `GET /todos/today`, `POST /diaries`, `GET /diaries/{diary_id}`, `POST /evidence`, `GET /evidence/{evidence_id}`, `GET /evidence/missing`, `GET /admin/summary`를 확인합니다. 테스트 생성 데이터는 `smoke_test_` 접두사를 사용하며 기존 데이터는 삭제하지 않습니다.

`DATA_SOURCE=mysql`일 때 smoke test는 MySQL `journal`, `evidence`에 테스트 row를 남길 수 있습니다. 생성되는 `diary_id`, `evidence_id`, `todo_id`는 모두 `smoke_test_` 접두사를 사용하므로 직접 조회로 구분할 수 있으며, 자동 MySQL cleanup은 하지 않습니다.

4. smoke test 데이터만 정리:

```powershell
python scripts/cleanup_smoke_test_data.py
```

cleanup 스크립트는 `data/diaries.json`, `data/evidence.json`에서 `smoke_test_` 접두사의 `diary_id`/`evidence_id`만 제거합니다. 일반 demo seed 데이터와 실제 업로드 데이터는 삭제하지 않으며, 남은 diary의 `linked_evidence_ids` 안에 있는 `smoke_test_` 참조도 함께 정리합니다. MySQL mode에서 생성된 row는 삭제하지 않습니다.

MySQL 연결이 의심될 때는 먼저 아래만 확인합니다.

```powershell
curl http://127.0.0.1:8000/health
```

`DATA_SOURCE=mysql`일 때도 `/health`는 HTTP 200을 유지합니다. MySQL 연결 상태는 응답의 `mysql.status` 필드로 확인하며, 응답에는 `.env` 값이나 비밀번호가 포함되면 안 됩니다.

`DATA_SOURCE=mysql` 상태에서 영농일지 저장/조회만 먼저 검증하려면:

```powershell
python -m compileall app
curl http://127.0.0.1:8000/health
curl "http://127.0.0.1:8000/diaries"
```

## HWPX RAG Ingest

문서 기반 `/ai/chat`에 HWPX 정책 문서를 포함하려면 먼저 ingest를 실행합니다.

```powershell
python scripts/ingest_hwpx.py --input ../../docs/2026년 저탄소농업 프로그램 시범사업(경종) 사업시행지침(시행용).hwpx
```

생성물:

- `rag_sources/raw_hwpx`: 원본 HWPX 보관
- `rag_sources/parsed_text`: 추출 텍스트
- `rag_sources/chunks`: 검색용 chunk metadata

설명:

- backend는 조원 라이브러리의 HWPX 파싱/청킹 코드를 import할 수 있으면 우선 사용합니다.
- import가 어려운 환경에서는 backend의 fallback parser/chunker로 ingest를 계속 진행합니다.
- `/ai/chat`은 HWPX chunk snippet만 `used_context`에 제한적으로 포함하며, 원문 전체를 응답에 그대로 노출하지 않습니다.
- RAG는 문서/정책 Q&A 전용이며, `/todos`, `/todos/today`, `computed_status`에는 사용하지 않습니다.

## 저장소

현재 저장 경계는 다음과 같습니다.

- `data/diaries.json`: `DATA_SOURCE=json`일 때 영농일지 저장소
- `data/evidence.json`: `DATA_SOURCE=json`일 때 증빙 저장소
- MySQL `journal` 테이블: `DATA_SOURCE=mysql`일 때 영농일지 저장/조회 경로
- MySQL `evidence` 테이블: `DATA_SOURCE=mysql`일 때 증빙 메타데이터 저장/조회 경로
- `uploads/evidence/original`: 업로드 원본 이미지 보관
- `uploads/evidence/watermarked`: 워터마크가 입혀진 이미지 보관

주의:

- To-do는 `DATA_SOURCE=mysql`일 때 MySQL 읽기 전용입니다.
- MySQL 스키마 변경 없이 기존 `journal` 복합 PK 구조에 맞춰 저장합니다.
- 증빙 업로드 API의 멀티파트 요청/파일 저장 경로는 유지하고, 이번 단계에서는 metadata 저장소만 `DATA_SOURCE`에 따라 전환합니다.
- 증빙 업로드 시 원본 이미지는 보존하고, 응답의 기본 `image_url`은 워터마크 이미지로 내려갑니다.
- `original_image_path`는 원본 상대 경로를 보존합니다.
- GPS 검증은 아직 구현하지 않았습니다.

### diary_id 와 exec_id 매핑

프론트 API는 단일 `diary_id`를 사용하지만, MySQL `journal`은 `exec_id`를 포함한 복합 PK 구조입니다.

저장 규칙:

- `diary_id` 길이가 MySQL `exec_id` 제한 이하이면 그대로 `exec_id`로 저장
- 더 길면 축약 `exec_id`를 생성해 저장
- 원본 `diary_id`는 `ai_result_json.api_diary_id`에 함께 보존

조회 규칙:

- `GET /diaries/{diary_id}`는 `exec_id`와 `ai_result_json.api_diary_id`를 모두 기준으로 조회
- API 응답의 `diary_id`는 가능하면 원본 프론트 `diary_id`를 유지

### linked_evidence_ids 보존 방식

MySQL `journal` 테이블에는 `linked_evidence_ids` 전용 컬럼이 없으므로 아래 JSON 필드에 임시 보존합니다.

- `ai_result_json.linked_evidence_ids`
- `ai_result_json.todo_id`
- `ai_result_json.field_id`
- `ai_result_json.project_id`
- `ai_result_json.work_stage`
- `ai_result_json.work_stage_detail`

### evidence_id 와 exec_id 매핑

프론트 API는 단일 `evidence_id`를 사용하지만, MySQL `evidence`는 `exec_id`를 포함한 복합 PK 구조입니다.

저장 규칙:

- `evidence_id` 길이가 MySQL `exec_id` 제한 이하이면 그대로 `exec_id`로 저장
- 더 길면 축약 `exec_id`를 생성해 저장
- 원본 `evidence_id`는 `raw_json.api_evidence_id`와 `raw_json.evidence_id`에 함께 보존
- `seq_no`는 이번 단계에서 기본값 `1`을 사용
- `job_date`는 `captured_at` 날짜를 사용
- `evid_cd` 컬럼 길이 제약 때문에 전체 `evidence_type` 원본은 `raw_json.evidence_type`에 보존하고, 컬럼에는 8자 축약값을 저장

조회 규칙:

- `GET /evidence/{evidence_id}`는 `exec_id`, `raw_json.api_evidence_id`, `raw_json.evidence_id`를 모두 기준으로 조회
- API 응답의 `evidence_id`는 원본 프론트 `evidence_id`를 유지

## 데모 사용자와 신 스키마 식별자

`DATA_SOURCE=mysql` 모드 기준, **시드 `locaville_jeotan_seed_v2_parcel_int.sql`** 의 데모 농가는 다음과 같습니다.

| user_no | login_id | user_name | amo_regno | 역할 |
|---|---|---|---|---|
| 1000000001 | `jh.park` | 박정호 | AMOJT001 | 이장 |
| **1000000101** | **`ys.kim`** | **김영수** | **AMOJT002** | **농가 (v0_farmer 기준 데모)** |
| 1000000102 | `sj.lee` | 이순자 | AMOJT003 | 농가 |
| 1000000103 | `mh.choi` | 최민호 | AMOJT004 | 농가 |
| 1000000104 | `jh.pak` | 박지현 | AMOJT005 | 농가 |
| 1000000105 | `ts.jung` | 정태석 | AMOJT006 | 농가 |
| 1000000106 | `mk.oh` | 오미경 | AMOJT007 | 농가 |
| 1000000107 | `sc.han` | 한석철 | AMOJT008 | 농가 |

마을·그룹·사업:
- `ville_id = VILLEJT001` (저탄마을), `group_no = 10001` (저탄반)
- `PRJ2026LC` (2026 저탄소 농업 프로그램), `PRJ2026PUB` (2026 공익직불제)

필지: `parcel.parcel_no` 는 **INT (11001~11013)**, 사람이 읽는 코드는 `parcel.parcel_regno` (예: `JT-RPA-002`). API 입력은 둘 다 받습니다 (backend 가 INT 로 정규화).

`farmer_id` 파라미터/필드: `login_id`(`ys.kim`) / `farmer_no`(`FARM-JT-0101`) / `user_no`(`1000000101`) / `amo_regno`(`AMOJT002`) 어느 형태도 받습니다 (`identity_repository` 가 자동 해석).

신 API ID 포맷:
- `diary_id` = `{user_no}-{yyyymmdd}-{exec_no}` (예: `1000000101-20260521-1`)
- `evidence_id` = `{user_no}-{yyyymmdd}-{exec_no}-{seq_no}` (예: `1000000101-20260521-1-1`)
- `todo_id` = `{amo_regno}-{prj_id}-{activity_id}-{job_seq}` (예: `AMOJT002-PRJ2026LC-ACT_WATER-1`)

저장성 API(`POST /diaries`, `POST /evidence`, `POST /evidence/upload`)는 `farmer_id` 누락 시 `422`로 거절합니다 (silent fallback 없음). 또한 옛 식별자(`U002`, `FIELD001`, `PARCEL003`, `carbon_rice_2026`, `prj_2026_demo` 등)는 가능한 한 신 ID 로 정규화되지만, **새 호출은 신 ID 만 사용**하시기 바랍니다. JSON 모드(`DATA_SOURCE=json`)는 마이그레이션 이전 호환용 시드만 가지고 있어 신 시연에 적합하지 않습니다.

## API 목록

- `GET /health`
- `GET /diary` (`POST` 도 동일 경로)
- `GET /diary/{diary_id}`
- `GET /evidence` · `GET /evidence/missing` · `GET /evidence/{evidence_id}`
- `POST /evidence` · `POST /evidence/upload` · `PATCH /evidence/{evidence_id}`
- `POST /photo-guard/check` (영수증 OCR / 사진 분류, OpenAI vision)
- `POST /photo-guard/coach` (라이브 카메라 코칭, Gemini 2.5-flash-lite)
- `POST /ai/chat` · `POST /ai/chat/stream` (RAG, gpt-4.1-mini)
- `POST /ai/evidence-guide` (알림 안내문 다듬기)
- `POST /ai/policy/calc` · `POST /ai/policy/rule` (정책 문서 RAG 기반 계산/추출)
- `POST /ai/stt` (Returnzero `sommers` ko, OpenAI Whisper 폴백)
- `POST /ai/tts` (Google Chirp 3 HD Kore, speakingRate 0.9, audio/mpeg stream)
- `GET /admin/summary` · `GET /admin/recent-evidence` (영수증 OCR 포함) · `GET /admin/ai-recommendation` · `GET /admin/weekly-farm-info`
- `GET /farmer/{id}/advice/today` (오늘 한마디)
- `GET /reports/project-preview` · `GET /reports/project-pdf`
- `POST /demo/reset` · `POST /demo/seed` · `GET /demo/status`

> 제거됨 (단일 진입점 통합 후 호출처 없음): `/ai/journal-draft`, `/ai/voice/session/{start,reply,finalize}`, `/ai/vision/evidence-label`, `/ai/policy/summary`.

## Project Report PDF

- `GET /reports/project-preview?farmer_id=<id>&prj_id=<id>`
  - Returns report JSON payload before rendering PDF.
- `GET /reports/project-pdf?farmer_id=<id>&prj_id=<id>&include_images=true`
  - Returns `application/pdf` as attachment.
  - Output files are also saved under `outputs/reports`.

Notes:
- Report generation reuses existing To-do/Diary/Evidence services (no DB schema change).
- Evidence thumbnails use watermarked image paths when available.
- If image files are missing, PDF generation continues and marks the row as missing image.
- Korean text rendering uses system fonts in this priority:
  - Windows: `Malgun Gothic`
  - macOS: `AppleGothic`, `Apple SD Gothic Neo`
  - Linux: `Noto Sans CJK`, `NanumGothic`
- If no Korean font is available, the PDF falls back to a base font and adds a fallback notice line.

## API 계약

### GET /diaries

Query Parameters (모두 optional):

- `farmer_id`
- `status`
- `work_date` (`YYYY-MM-DD`)
- `project_id`

규칙:

- query 없음: 전체 반환
- query 있음: 해당 조건 필터 반환
- 여러 query: AND 조건

예시:

```bash
curl "http://127.0.0.1:8000/diaries?farmer_id=ys.kim"
curl "http://127.0.0.1:8000/diaries?status=saved"
curl "http://127.0.0.1:8000/diaries?work_date=2026-05-15"
```

### GET /evidence

Query Parameters (모두 optional):

- `farmer_id`
- `status`
- `evidence_type`
- `confirmed_label`
- `activity_type`
- `activity_id`
- `job_cd`
- `group_no`
- `field_id`
- `parcel_no`
- `project_id`
- `prj_id`
- `limit` 기본 `100`, 최대 `100`

규칙:

- query 없음: 전체 반환
- query 있음: 해당 조건 필터 반환
- 여러 query: AND 조건

예시:

```bash
curl "http://127.0.0.1:8000/evidence?farmer_id=ys.kim"
curl "http://127.0.0.1:8000/evidence?status=confirmed"
curl "http://127.0.0.1:8000/evidence?activity_type=%EC%A4%91%EA%B0%84%20%EB%AC%BC%EB%96%BC%EA%B8%B0"
curl "http://127.0.0.1:8000/evidence?job_cd=J001&group_no=1"
```

### GET /evidence/missing

활동유형별 필수 증빙과 현재 제출된 증빙을 비교해 누락 상태를 계산합니다.

Query Parameters:

- `activity_type` (required)
- `farmer_id`
- `field_id`
- `parcel_no`
- `project_id`
- `prj_id`

예시:

```bash
curl "http://127.0.0.1:8000/evidence/missing?farmer_id=ys.kim&activity_type=%EC%A4%91%EA%B0%84%20%EB%AC%BC%EB%96%BC%EA%B8%B0&prj_id=PRJ2026LC"
curl "http://127.0.0.1:8000/evidence/missing?farmer_id=ys.kim&activity_type=%EB%B0%94%EC%9D%B4%EC%98%A4%EC%B0%A8%20%ED%88%AC%EC%9E%85&prj_id=PRJ2026LC"
```

예시 응답:

```json
{
  "activity_type": "중간 물떼기",
  "required_evidence_types": ["MID_DRAINAGE_START", "MID_DRAINAGE_END"],
  "submitted_evidence_types": ["MID_DRAINAGE_START"],
  "missing_evidence_types": ["MID_DRAINAGE_END"],
  "required_evidence_count": 2,
  "submitted_evidence_count": 1,
  "completion_status": "IN_PROGRESS",
  "user_message": "남은 증빙: 중간 물떼기 종료"
}
```

지원 `activity_type`:

- `중간 물떼기`
- `논물 얕게 걸러대기`
- `바이오차 투입`
- `가을갈이`
- `폐기물 처리`

`completion_status`:

- `NOT_STARTED`: 아직 제출한 증빙이 없습니다.
- `IN_PROGRESS`: 아직 남은 증빙이 있습니다.
- `COMPLETED`: 필요한 증빙이 모두 제출되었습니다.
- `UNKNOWN_ACTIVITY`: 활동 유형을 확인해 주세요.

`required_evidence_types` 설명:

- `중간 물떼기`: `MID_DRAINAGE_START`, `MID_DRAINAGE_END`
- `논물 얕게 걸러대기`: `AWD_DRY_FIELD_ROUND_1` ~ `AWD_DRY_FIELD_ROUND_4`
- `바이오차 투입`: `BIOCHAR_BAG`, `BIOCHAR_SPREADING`, `BIOCHAR_INVOICE`
- `가을갈이`: `AUTUMN_TILLAGE_BEFORE`, `AUTUMN_TILLAGE_AFTER`
- `폐기물 처리`: `WASTE_COLLECTION`

참고:

- 현재 AWD 회차 계산은 MVP 단순화 상태입니다.
- `AWD_DRY_FIELD` 업로드가 들어오면 우선 1회차 제출로 간주합니다.
- 추후 `evidence_round` 또는 별도 회차 필드로 정교화가 필요합니다.

### POST /ai/chat

문서 기반 제도/사업/서비스 Q&A용 API입니다.

특징:

- local RAG를 사용합니다.
- RAG 문서 소스는 `backend/docs`, `backend/README.md`, 루트 `docs`, 루트 `README.md`, `프로젝트헌장.txt`입니다.
- To-do 산정에는 사용하지 않습니다.
- 문서를 찾지 못하면 fallback 안내를 반환합니다.

예시 요청:

```json
{
  "question": "중간 물떼기 증빙은 뭐가 필요해?",
  "farmer_id": "ys.kim",
  "context": {
    "prj_id": "PRJ2026LC",
    "activity_id": "ACT_WATER",
    "activity_type": "중간 물떼기"
  }
}
```

예시 응답:

```json
{
  "answer": "...",
  "source_type": "rag",
  "used_context": []
}
```

### POST /ai/evidence-guide

누락 증빙 기준으로 농업인에게 쉬운 안내문을 만드는 API입니다.

특징:

- RAG를 사용하지 않습니다.
- 기본 규칙 문장을 먼저 만들고, OpenAI API가 있으면 더 자연스럽게 다듬을 수 있습니다.
- OpenAI API가 없어도 규칙 기반 안내문은 반환합니다.

### POST /ai/stt

음성 파일 → 텍스트. **Returnzero (Vito) `sommers` 한국어 모델이 기본 제공자**이며, 미설정/실패 시 OpenAI Whisper (`gpt-4o-mini-transcribe`) 로 폴백합니다.

특징:

- `STT_PROVIDER=returnzero|openai` 환경 변수로 분기 (dev 기본 `returnzero`).
- 모든 키 (`RETURNZERO_CLIENT_ID/SECRET`, `OPENAI_API_KEY`) 는 backend `.env` 만 보유.
- 지원 포맷: `webm`, `wav`, `mp3`, `m4a`. 파일 크기 25MB.
- 호출 실패 시 `source="fallback"` 응답을 반환해 프론트가 브라우저 STT 또는 직접 입력으로 폴백할 수 있습니다.

호출처: `ManualInputScreen` 마이크 FAB, `EasyChatCard` 도움말 챗.

### POST /ai/tts

텍스트 → 음성 mp3 **stream**. **Google Cloud Text-to-Speech Chirp 3 HD (`ko-KR-Chirp3-HD-Kore`, `speakingRate=0.9`)** 가 backend 안에서 호출됩니다.

특징:

- 응답은 `audio/mpeg` StreamingResponse — frontend 는 `response.blob()` → `URL.createObjectURL` 로 `<audio>` 에 연결.
- `GOOGLE_TTS_API_KEY` 미설정/실패 시 `204 No Content` 반환 → 프론트가 브라우저 `speechSynthesis` 로 폴백.
- 텍스트 길이 한도 1600자 (Google TTS 5000 byte 제한 대비 안전 마진).
- 디스크 저장 X — bytes 만 stream.

호출처: 라이브 카메라 코칭 안내 발화 + prefetch 캐시, 이장님 대시보드 "오늘 한마디 들어보기".

### POST /evidence/upload

MVP 시연용 로컬 파일 업로드 API입니다. 업로드된 이미지는 아래처럼 두 경로로 저장됩니다.

- `backend/uploads/evidence/original/{filename}`: 원본 이미지
- `backend/uploads/evidence/watermarked/{filename}`: 워터마크 이미지

브라우저에서는 `/uploads/...` 정적 경로로 접근할 수 있습니다.

현재 동작:

- 원본 이미지는 항상 보존합니다.
- 응답의 기본 `image_url`과 `storage_path`는 워터마크 이미지를 가리킵니다.
- `original_image_path`는 원본 상대 경로를 보존합니다.
- 워터마크 생성이 실패하면 원본 저장은 유지하고, `image_url`은 원본 이미지로 fallback 됩니다.
- `DATA_SOURCE=mysql`이면 업로드 후 생성되는 evidence metadata는 MySQL `evidence` 테이블에 저장됩니다.
- GPS 검증은 아직 구현하지 않았습니다.

허용 형식:

- `jpg`
- `jpeg`
- `png`
- `webp`

제한:

- 10MB 이하
- 원본 파일명은 저장하지 않고 `evidence_id` 기반 파일명으로 저장

multipart/form-data 필드:

- `file`
- `farmer_id`
- `field_id`
- `parcel_no`
- `prj_id`
- `project_id`
- `todo_id`
- `activity_id`
- `activity_type`
- `evidence_type`
- `confirmed_label`
- `status`
- `user_message`

예시:

```bash
curl -X POST "http://127.0.0.1:8000/evidence/upload" \
  -F "file=@./sample.jpg" \
  -F "farmer_id=ys.kim" \
  -F "field_id=JT-RPA-002" \
  -F "prj_id=PRJ2026LC" \
  -F "activity_id=ACT_WATER" \
  -F "job_cd=J001" \
  -F "todo_id=AMOJT002-PRJ2026LC-ACT_WATER-1" \
  -F "activity_type=중간 물떼기" \
  -F "evidence_type=MID_DRAINAGE_START" \
  -F "status=needs_review" \
  -F "user_message=사진 증빙이 업로드되었습니다."
```

예시 응답 (신 ID 포맷):

```json
{
  "evidence_id": "1000000101-20260521-1-1",
  "todo_id": "AMOJT002-PRJ2026LC-ACT_WATER-1",
  "prj_id": "PRJ2026LC",
  "project_id": "PRJ2026LC",
  "activity_id": "ACT_WATER",
  "job_cd": "J001",
  "farmer_id": "AMOJT002",
  "user_no": 1000000101,
  "user_name": "김영수",
  "amo_regno": "AMOJT002",
  "amo_name": "김영수 농가",
  "exec_no": 1,
  "seq_no": 1,
  "parcel_no": "11003",
  "parcel_regno": "JT-RPA-002",
  "field_id": "JT-RPA-002",
  "activity_type": "중간 물떼기",
  "evidence_type": "MID_DRAINAGE_START",
  "confirmed_label": "MID_DRAINAGE_START",
  "image_url": "http://localhost:8000/uploads/evidence/evidence_xxx.jpg",
  "storage_path": "uploads/evidence/evidence_xxx.jpg",
  "original_image_path": "uploads/evidence/original/evidence_xxx.jpg",
  "captured_at": "2026-05-21T08:42:00",
  "status": "needs_review",
  "user_message": "사진 증빙이 업로드되었습니다.",
  "created_at": "2026-05-21T08:42:01",
  "updated_at": "2026-05-21T08:42:01"
}
```

현재는 MVP용 로컬 파일 저장 방식이며, 운영 단계에서는 Supabase Storage 또는 S3 기반 저장소로 교체 예정입니다.

### PATCH /evidence/{evidence_id}

Request Body (수정 가능 필드만 반영):

```json
{
  "status": "confirmed",
  "confirmed_label": "MID_DRAINAGE_START",
  "user_message": "이장님 확인 완료"
}
```

동작:

- `evidence_id` 미존재: `404`
- 수정 가능한 필드만 업데이트
- `updated_at` 갱신
- 전체 레코드 반환

### GET /admin/summary

Response Shape:

```json
{
  "total_diaries": 0,
  "total_evidence": 0,
  "total_farmers": 0,
  "diaries_by_farmer": [
    {
      "farmer_id": "AMOJT002",
      "farmer_name": "김영수 농가",
      "diary_count": 4,
      "evidence_count": 3,
      "latest_work_date": "2026-05-21",
      "amo_regno": "AMOJT002",
      "amo_name": "김영수 농가",
      "user_no": 1000000101,
      "user_name": "김영수",
      "ville_name": "저탄마을",
      "parcel_count": 2,
      "todo_count": 7,
      "done_todo_count": 4,
      "delayed_todo_count": 0,
      "todo_completion_rate": 57.1
    }
  ],
  "evidence_by_status": {
    "confirmed": 3,
    "needs_review": 1,
    "retake_required": 1
  },
  "recent_diaries": [],
  "recent_evidence": []
}
```

집계 기준:

- `total_diaries`: 전체 일지 수
- `total_evidence`: 전체 증빙 수
- `total_farmers`: diary/evidence에 등장한 `farmer_id` 유니크 수
- `diaries_by_farmer`: farmer별 일지 수, 증빙 수, 최근 작업일
- `evidence_by_status`: 증빙 status별 개수
- `recent_diaries`: `created_at` 최신순 최대 5개
- `recent_evidence`: `created_at` 최신순 최대 5개

## CORS

현재 개발 허용 origin:

- `http://localhost:3000`
- `http://127.0.0.1:3000`
- `http://localhost:3001`
- `http://127.0.0.1:3001`

## Demo API

발표나 팀 공유 전에 JSON 데이터를 빠르게 정리하거나 시연용 데이터를 주입할 수 있습니다.

### POST /demo/reset

영농일지와 증빙 JSON 파일을 모두 빈 배열로 초기화합니다.

예시 응답:

```json
{
  "status": "success",
  "message": "Demo data reset completed",
  "diaries_count": 0,
  "evidence_count": 0
}
```

### POST /demo/seed

저탄마을 시연용 영농일지 3건과 증빙 3건을 upsert합니다.

규칙:

- 기존 전체 데이터를 지우지 않음
- 같은 `diary_id` 또는 `evidence_id`의 seed 데이터가 이미 있으면 갱신
- seed가 없으면 새로 추가

예시 응답:

```json
{
  "status": "success",
  "message": "Demo seed completed",
  "created_diaries": 3,
  "updated_diaries": 0,
  "created_evidence": 3,
  "updated_evidence": 0
}
```

### GET /demo/status

현재 JSON 저장소 상태와 seed 데이터 존재 여부를 확인합니다.

예시 응답:

```json
{
  "diaries_count": 3,
  "evidence_count": 3,
  "seed_exists": true
}
```

### 빠른 테스트 예시

```bash
curl -X POST "http://127.0.0.1:8000/demo/reset"
curl "http://127.0.0.1:8000/demo/status"
curl -X POST "http://127.0.0.1:8000/demo/seed"
curl "http://127.0.0.1:8000/demo/status"
curl "http://127.0.0.1:8000/admin/summary"
```

## 데이터 딕셔너리 / ERD 매핑 메모

- `evidence_id`: 현재 `EVIDENCE` PK 성격의 식별자
- `farmer_id`: `USER_MASTER` / `GROUP_MEMBER` 계열 농업인 식별자
- `field_id`: 현재 POC 필지 식별자, 추후 `PARCEL.parcel_no` 중심으로 정리 필요
- `parcel_no`: 데이터 딕셔너리 기준 필지 식별자 후보
- `project_id`: 현재 POC 프로젝트 식별자, 추후 `prj_id` 중심으로 정리 필요
- `prj_id`: ERD의 프로젝트 식별자 후보
- `activity_id`: 추후 `PRJ_ACTIVITY.activity_id`와 매핑 가능한 필드
- `activity_type`: 현재 화면 활동명, 추후 `PRJ_ACTIVITY` 또는 `FARM_JOB` 코드와 매핑 필요
- `evidence_type`: 증빙 유형 CODE 성격
- `status`: 증빙 상태 CODE 성격
- `storage_path`: 추후 Storage 전환을 고려한 파일 경로
- `original_image_path`: 현재 로컬 서버 내부 파일 경로


