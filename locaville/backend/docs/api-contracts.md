# Backend API Contracts

This document is the frontend-facing API contract for the Locaville backend. Keep request and response shapes stable before changing farmer or chief UX.

Current boundary:
- To-do calculation uses MySQL/RDB reads when `DATA_SOURCE=mysql`.
- Diary reads/writes use MySQL `journal` when `DATA_SOURCE=mysql`, and JSON fallback when `DATA_SOURCE=json`.
- Evidence uses the JSON repository when `DATA_SOURCE=json`, and the MySQL `evidence` table when `DATA_SOURCE=mysql`.
- AI helper APIs run only in the backend and must not expose the OpenAI API key to frontend code.
- RAG is allowed only for document/policy Q&A and is not used for To-do calculation.
- HWPX policy documents can be ingested into backend local RAG and surfaced only as limited chunk snippets in `used_context`.
- Do not expose `.env` values or secrets in responses, logs, docs, or smoke tests.

## Common Shapes

`TodoRecord` main fields:
- `todo_id`, `group_no`, `prj_id`, `project_id`, `activity_id`, `job_cd`
- `todo_title`, `activity_name`, `job_name`
- `required_evidence_types`, `parcel_no`, `field_id`
- `due_date`, `start_date`, `status`, `computed_status`, `remark`

`DiaryRecord` main fields:
- `diary_id`, `todo_id`, `project_id`, `prj_id`, `group_no`
- `farmer_id`, `farmer_name`, `worker_name`, `work_date`
- `field_id`, `parcel_no`, `field_address`, `crop_name`
- `activity_id`, `job_cd`, `work_stage`, `work_stage_detail`, `work_detail`
- `linked_evidence_ids`, `status`, `input_type_cd`, `created_at`, `updated_at`

`EvidenceRecord` main fields:
- `evidence_id`, `todo_id`, `group_no`, `prj_id`, `project_id`
- `activity_id`, `job_cd`, `farmer_id`, `parcel_no`, `field_id`
- `activity_type`, `evidence_type`, `confirmed_label`
- `image_url`, `storage_path`, `original_image_path`
- `captured_at`, `status`, `user_message`, `created_at`, `updated_at`

`AIChatResponse` main fields:
- `answer`, `source_type`, `used_context`

`AIJournalDraftResponse` main fields:
- `draft.work_detail`, `draft.field_label`, `draft.quantity`, `draft.job_cd`, `draft.confidence`
- `needs_confirmation`

`AIEvidenceGuideResponse` main fields:
- `message`

`AISTTResponse` main fields:
- `text`, `source`, `error_message`

`AITTSResponse` main fields:
- `audio_url`, `source`, `mime_type`, `error_message`

## GET /health

Purpose: server liveness and data-source health check.

Query/body: none.

Response fields:
- `status`: `"ok"` when the API process is alive.
- `service`: backend service name.
- `data_source`: effective data source mode.
- `mysql`: `{ "status": "disabled" }` unless `DATA_SOURCE=mysql`; in MySQL mode contains connection status without secrets.

Frontend usage:
- Dev/operator checks before opening farmer/chief apps.

Notes:
- Returns HTTP 200 even if MySQL check fails. Use the `mysql.status` field for diagnostics.
- Must not include database passwords, DSNs, or API keys.

## RAG Source Ingestion

Purpose: load local HWPX policy documents into backend RAG sources for `/ai/chat`.

Current implementation:
- Management script: `python scripts/ingest_hwpx.py --input <path-to.hwpx>`
- Output directories:
  - `rag_sources/raw_hwpx`
  - `rag_sources/parsed_text`
  - `rag_sources/chunks`

Notes:
- This is not a public frontend API yet.
- Ingested HWPX chunk metadata is searched together with markdown/txt sources.
- `used_context[].path` may include `source_file#chunk_id`.
- To-do calculation remains fully separate from RAG.

## GET /todos/today

Purpose: farmer home To-do list for a target date.

Query:
- `farmer_id` optional.
- `group_no` optional.
- `prj_id` optional.
- `activity_id` optional.
- `date` optional `YYYY-MM-DD`; defaults to server today.

Response fields:
- `items`: array of `TodoRecord`.

Frontend usage:
- `v0_farmer` home cards and To-do context for record/photo flows.

Notes:
- Source is MySQL/RDB when `DATA_SOURCE=mysql`.
- `prj_todo_list`에는 `farmer_id` 컬럼이 없으므로, `farmer_id` 쿼리는 `user_master + group_member`를 통해 소속 `group_no`를 해석한 뒤 `prj_todo_list.group_no`로 필터링한다.
- `farmer_id`가 `user_master.login_id`, `user_master.farmer_no`, `user_master.user_no`(문자열) 중 어느 값으로 들어와도 동일 규칙으로 group을 해석한다.
- `farmer_id` 해석 결과가 없으면 HTTP 200과 함께 `items=[]`를 반환한다.
- `farmer_id`와 `group_no`가 함께 오면 AND 조건으로 처리한다. (`group_no`가 farmer 소속 group이 아니면 `items=[]`)
- `farmer_id`가 없으면 기존처럼 날짜/다른 필터 기준 조회를 유지한다.
- `computed_status` is calculated from the active diary/evidence repositories and is not written back to MySQL.
- OpenAI and RAG are not part of the To-do calculation path.

## GET /todos

Purpose: query To-do list, optionally date-filtered.

Query:
- Same as `GET /todos/today`.

Response fields:
- `items`: array of `TodoRecord`.

Frontend usage:
- Future list/search views; currently same DTO shape as today endpoint.

Notes:
- MySQL read-only.
- `farmer_id` 필터는 `prj_todo_list` 직접 컬럼이 아니라 `user_master/group_member`를 통한 `group_no` 매핑으로 적용된다.
- Empty list is a valid response when MySQL is unavailable or no rows match.

## POST /diaries

Purpose: create a farming diary record.

Body fields:
- Required: `worker_name`, `work_date`, `field_id`, `crop_name`, `work_stage`, `work_detail`.
- Optional/defaulted: `diary_id`, `project_id`, `prj_id`, `group_no`, `farmer_id`, `farmer_name`, `parcel_no`, `field_address`, `activity_id`, `job_cd`, `work_stage_detail`, `linked_evidence_ids`, `status`, `input_type_cd`.

Response fields:
- A `DiaryRecord`.

Frontend usage:
- `v0_farmer` manual and voice save flows.
- `v0_chief` summary/recent records via list endpoints.

Notes:
- Use `todo_id`, `activity_id`, `job_cd`, `prj_id/project_id`, and `group_no` when the diary came from a To-do.
- Smoke-test records must use a `smoke_test_` prefix for IDs.
- `DATA_SOURCE=mysql`:
  - stores the diary in MySQL `journal`
  - uses `exec_id` as the physical key field
  - preserves API-only fields such as `linked_evidence_ids`, `todo_id`, `field_id`, and `work_stage_detail` in `ai_result_json`
- `DATA_SOURCE=json`: keeps the existing JSON repository behavior.
- If the effective MySQL `exec_id` already exists, the API returns HTTP 409.

## GET /diaries

Purpose: list diary records.

Query:
- `farmer_id` optional.
- `status` optional.
- `work_date` optional `YYYY-MM-DD`.
- `prj_id` optional.
- `project_id` optional.
- `activity_id` optional.
- `job_cd` optional.
- `group_no` optional.
- `parcel_no` optional.
- `field_id` optional.
- `limit` optional, default `100`, max `100`.

Response fields:
- `items`: array of `DiaryRecord`.

Frontend usage:
- `v0_farmer` journal list.
- `v0_chief` recent diaries and farmer summaries.

Notes:
- Multiple query parameters are AND filters.
- `DATA_SOURCE=mysql` returns the same `DiaryRecord` shape by mapping MySQL `journal` rows back into the API contract.
- `DATA_SOURCE=mysql` pushes supported filters into SQL `WHERE` using parameter binding.
- Field mapping at query time:
  - `work_date -> job_date`
  - `status -> job_cmpl_yn`
  - `prj_id/project_id -> prj_id`
  - `field_id/parcel_no -> parcel_no`
  - `activity_id -> activity_id`
  - `job_cd -> job_cd`
  - `group_no -> group_no`
  - `farmer_id -> farmer_id`
- Sorting is newest-first: `mod_dt DESC, reg_dt DESC, job_date DESC`.

## GET /diaries/{diary_id}

Purpose: get a single diary record.

Path:
- `diary_id`.

Response fields:
- A `DiaryRecord`.

Frontend usage:
- `v0_farmer` journal detail.

Notes:
- Returns 404 when the record is not found.
- `DATA_SOURCE=mysql` accepts the frontend `diary_id` and resolves both:
  - direct `exec_id` matches
  - `ai_result_json.api_diary_id` matches for long IDs that were shortened for MySQL storage

## POST /evidence

Purpose: create evidence metadata without file upload.

Body fields:
- Required: `activity_type`, `evidence_type`, `captured_at`.
- Optional/defaulted: `evidence_id`, `todo_id`, `group_no`, `prj_id`, `project_id`, `activity_id`, `job_cd`, `farmer_id`, `parcel_no`, `field_id`, `confirmed_label`, `image_url`, `storage_path`, `original_image_path`, `status`, `user_message`.

Response fields:
- An `EvidenceRecord`.

Frontend usage:
- Smoke tests and metadata-only demo flows.

Notes:
- Prefer `POST /evidence/upload` for real photo evidence.
- Smoke-test records must use a `smoke_test_` prefix for IDs.
- `DATA_SOURCE=mysql`:
  - stores evidence metadata in MySQL `evidence`
  - maps logical `evidence_id` to physical `exec_id`
  - stores the full frontend `evidence_type` in `raw_json.evidence_type`; the physical `evid_cd` column uses an 8-character value because of the current schema limit
  - preserves API-only fields such as `todo_id`, `project_id`, `activity_id`, `field_id`, `status`, `image_url`, and `storage_path` in `raw_json`
- `DATA_SOURCE=json`: keeps the existing JSON repository behavior.
- If the effective MySQL `evidence_id/exec_id` already exists, the API returns HTTP 409.

## POST /evidence/upload

Purpose: upload an image file and create an evidence record.

Body:
- `multipart/form-data`.
- File field: `file`.
- Form fields: `farmer_id`, `group_no`, `field_id`, `parcel_no`, `prj_id`, `project_id`, `todo_id`, `activity_id`, `job_cd`, `activity_type`, `evidence_type`, `confirmed_label`, `status`, `user_message`.

Response fields:
- An `EvidenceRecord` with `image_url`, `storage_path`, and `original_image_path`.

Frontend usage:
- `v0_farmer` photo upload flow.
- `v0_farmer` diary linking after upload.

Notes:
- Allowed extensions: `.jpg`, `.jpeg`, `.png`, `.webp`.
- Max upload size: 10 MB.
- Original files are stored under `uploads/evidence/original/{filename}`.

## GET /reports/project-preview

Purpose: build report payload for one farmer + one project before PDF render.

Query:
- `farmer_id` required.
- `prj_id` optional when `project_id` is given.
- `project_id` optional when `prj_id` is given.
- `include_images` optional, default `true`.

Response fields:
- `report_title`, `generated_at`, `farmer_id`, `farmer_name`, `group_no`
- `prj_id`, `project_id`, `project_name`
- `todo_summary` (`total`, `pending`, `in_progress`, `completed`)
- `todos[]`, `diaries[]`, `evidence[]`

Notes:
- Mapping key is project context (`prj_id`/`project_id`) + `farmer_id`.
- Reuses existing todo/diary/evidence repositories and contracts.

## GET /reports/project-pdf

Purpose: generate and download project report PDF.

Query:
- `farmer_id` required.
- `prj_id` or `project_id` required.
- `include_images` optional, default `true`.

Response:
- `application/pdf` with `Content-Disposition: attachment; filename=...`

Notes:
- File is generated under `backend/outputs/reports`.
- Watermarked evidence images are inserted when available.
- Missing images do not fail the whole PDF generation.
- Watermarked files are stored under `uploads/evidence/watermarked/{filename}`.
- `image_url` and `storage_path` point to the watermarked file by default.
- `original_image_path` points to the preserved original file path inside backend storage.
- If watermark generation fails, the original file is still saved and `image_url` falls back to that original image.
- Uploaded files are served from the `/uploads/...` static path.
- This phase does not change the multipart API request shape.
- When `DATA_SOURCE=mysql`, the uploaded file metadata is stored in MySQL `evidence` after the file is saved.
- GPS validation is not implemented yet in the upload path.

## GET /evidence

Purpose: list evidence records.

Query:
- `farmer_id`, `status`, `evidence_type`, `confirmed_label`, `activity_type`, `activity_id`, `job_cd`, `group_no`, `field_id`, `parcel_no`, `project_id`, `prj_id` are optional.
- `limit` optional, default `100`, max `100`.

Response fields:
- `items`: array of `EvidenceRecord`.

Frontend usage:
- `v0_farmer` evidence linking and detail views.
- `v0_chief` evidence review lists and summaries.

Notes:
- Multiple query parameters are AND filters.
- `DATA_SOURCE=mysql` returns the same `EvidenceRecord` shape by mapping MySQL `evidence` rows back into the API contract.
- `DATA_SOURCE=mysql` pushes supported filters into SQL `WHERE` for `farmer_id`, `evidence_type`, `confirmed_label`, `job_cd`, `group_no`.
- `status`, `activity_type`, `activity_id`, `project_id`, `prj_id`, `field_id`, and `parcel_no` are preserved in `raw_json` and filtered after row mapping in Python for this phase.
- Sorting is newest-first: `mod_dt DESC, reg_dt DESC, capture_dt DESC`.

## GET /evidence/{evidence_id}

Purpose: get a single evidence record.

Path:
- `evidence_id`.

Response fields:
- An `EvidenceRecord`.

Frontend usage:
- `v0_farmer` recent-upload card and detail views.
- `v0_chief` evidence detail and review flows.

Notes:
- Returns 404 when the record is not found.
- `DATA_SOURCE=mysql` accepts the frontend `evidence_id` and resolves all of:
  - direct `exec_id` matches
  - `raw_json.api_evidence_id` matches
  - `raw_json.evidence_id` matches

## GET /evidence/missing

Purpose: calculate required vs submitted evidence types for an activity.

Query:
- Required: `activity_type`.
- Optional: `farmer_id`, `field_id`, `parcel_no`, `project_id`, `prj_id`.

Response fields:
- `activity_type`
- `required_evidence_types`
- `submitted_evidence_types`
- `missing_evidence_types`
- `required_evidence_count`
- `submitted_evidence_count`
- `completion_status`: `NOT_STARTED`, `IN_PROGRESS`, `COMPLETED`, or `UNKNOWN_ACTIVITY`.
- `user_message`

Frontend usage:
- `v0_farmer` evidence progress hints.
- `v0_chief` review completeness indicators.

Notes:
- Matching uses evidence records filtered by the query context.
- Unknown activity types return HTTP 200 with `completion_status=UNKNOWN_ACTIVITY`.

## GET /admin/summary

Purpose: chief dashboard aggregate summary.

Query/body: none.

Response fields:
- `total_diaries`, `total_evidence`, `total_farmers`, `needs_review_evidence`.
- Farmer-level summaries and recent diary/evidence lists.

Frontend usage:
- `v0_chief` dashboard overview.

Notes:
- Aggregates current JSON/API diary and evidence stores.

## POST /ai/chat

Purpose: answer policy/service/document questions using local-document RAG.

Body fields:
- Required: `question`
- Optional/defaulted: `farmer_id`, `context`

Response fields:
- `answer`
- `source_type`: `rag` or `fallback`
- `used_context`: selected local snippets used for answering

Frontend usage:
- Future farmer help assistant or FAQ support.

Notes:
- Uses only backend-local documents in this phase.
- If no relevant document snippet is found, returns a fallback 안내 response.
- If `OPENAI_API_KEY` is not configured, returns HTTP 503.
- Must not be used for `/todos`, `/todos/today`, or `computed_status`.

## POST /ai/evidence-guide

Purpose: generate a farmer-friendly evidence guidance message from current missing-evidence rules.

Body fields:
- Required: `activity_type`
- Optional/defaulted: `missing_evidence_types`

Response fields:
- `message`

Frontend usage:
- Future farmer upload guidance and missing-evidence hints.

Notes:
- Does not use RAG.
- Can return a rule-based message even when `OPENAI_API_KEY` is missing.

## POST /ai/stt

Purpose: transcribe an uploaded audio file into text. Backend dispatches to Returnzero (Vito) `sommers` model for Korean by default, with OpenAI Whisper (`gpt-4o-mini-transcribe`) as the fallback provider.

Provider switch:
- `STT_PROVIDER=returnzero` (default in dev) routes the request to Returnzero
- `STT_PROVIDER=openai` or missing Returnzero creds routes the request to OpenAI Whisper

Body:
- `multipart/form-data`
- File field: `file`
- Optional form field: `language`, default `ko`

Response fields:
- `text`
- `source`: `returnzero_stt` | `openai_stt` | `fallback`
- `error_message`

Frontend usage:
- `ManualInputScreen` 마이크 FAB (영농일지)
- `EasyChatCard` (도움말 챗봇)

Notes:
- All keys live in the backend `.env` (`RETURNZERO_CLIENT_ID/SECRET`, `OPENAI_API_KEY`).
- Supported audio types: `.webm`, `.wav`, `.mp3`, `.m4a`. Max upload size: 25 MB.
- Returnzero authentication tokens are cached in memory until `expires_at`.

## POST /ai/tts

Purpose: synthesize a short Korean spoken prompt using Google Cloud Text-to-Speech (Chirp 3 HD, voice `ko-KR-Chirp3-HD-Kore`, `speakingRate=0.9`). Returned as an `audio/mpeg` byte stream.

Body fields:
- Required: `text`
- Optional/defaulted: `voice` (currently ignored — voice is fixed to Chirp 3 HD Kore)

Response:
- `200`: `audio/mpeg` MP3 stream (frontend uses `response.blob()` → `URL.createObjectURL`)
- `204`: empty body when `GOOGLE_TTS_API_KEY` is unset or the upstream call fails (frontend falls back to browser `speechSynthesis`)

Frontend usage:
- 라이브 코칭 (`PhotoLiveCoachOverlay`) 의 안내 발화 + prefetch 캐시
- 이장님 대시보드 "오늘 한마디" 들어보기 버튼

Notes:
- Text length is capped at 1600 chars (≈ 5000 byte limit of Google TTS).
- No filesystem write — bytes are streamed directly from the backend response.

## POST /demo/reset

Purpose: clear demo diary/evidence JSON data.

Query/body: none.

Response fields:
- Demo operation status and counts.

Frontend usage:
- `v0_chief` demo reset controls.

Notes:
- Destructive for demo JSON stores. Do not use in smoke tests.
- Does not modify MySQL.

## POST /demo/seed

Purpose: seed demo diary/evidence JSON data.

Query/body: none.

Response fields:
- Demo operation status and counts.

Frontend usage:
- `v0_chief` demo seed controls.

Notes:
- Does not modify MySQL.

## GET /demo/status

Purpose: inspect demo data counts.

Query/body: none.

Response fields:
- Demo status and current diary/evidence counts.

Frontend usage:
- `v0_chief` demo controls.

Notes:
- Read-only.
