# Data Flow Contract

This document fixes the backend contract between MySQL To-dos and the current diary/evidence API flow.

## Current Ownership Boundary

- To-do source of truth: MySQL/RDB tables read through `GET /todos` and `GET /todos/today`.
- Diary source of truth:
  - `DATA_SOURCE=json`: JSON repository behind `POST /diaries` and `GET /diaries`
  - `DATA_SOURCE=mysql`: MySQL `journal` table behind `POST /diaries` and `GET /diaries`
- Evidence source of truth:
  - `DATA_SOURCE=json`: JSON repository behind `POST /evidence`, `POST /evidence/upload`, `GET /evidence`, and `GET /evidence/{evidence_id}`
  - `DATA_SOURCE=mysql`: MySQL `evidence` table behind the same API contract
- MySQL remains read-only for To-do calculation. Diary and evidence writes are allowed only through backend repositories when `DATA_SOURCE=mysql`.
- OpenAI/RAG helper APIs are backend-only and do not participate in MySQL To-do calculation.
- RAG is limited to local-document Q&A and must not be connected to `/todos`, `/todos/today`, or `computed_status`.

## To-do to Journal Link

A diary is considered linked to a To-do when either:
- `diary.todo_id == todo.todo_id`, or
- the backend can reconstruct the same `todo_id` from `diary.group_no`, `diary.prj_id/project_id`, `diary.activity_id`, and `diary.job_cd`, or
- the context tuple matches: `prj_id/project_id + activity_id + job_cd`, with compatible `farmer_id` when provided.

Frontend write rule:
- When a diary is created from a To-do, send `todo_id`, `group_no`, `prj_id`, `project_id`, `activity_id`, and `job_cd` when available.
- Keep `field_id` and `parcel_no` on the diary payload for farmer-facing display and evidence matching.

## diary_id to MySQL Composite Key Mapping

Frontend and API still use a single `diary_id`, but MySQL `journal` uses a composite key that includes `exec_id`.

Rules:
- API `diary_id` is the logical diary identifier returned to the frontend.
- MySQL `exec_id` is the physical storage identifier.
- If `diary_id` fits the MySQL `exec_id` length limit, store it directly as `exec_id`.
- If `diary_id` is longer, generate a deterministic shortened `exec_id` and preserve the original ID in `ai_result_json.api_diary_id`.
- `GET /diaries/{diary_id}` must resolve both direct `exec_id` matches and `ai_result_json.api_diary_id` matches.

This keeps the frontend contract stable without changing the MySQL schema.

## To-do to Evidence Link

Evidence is considered linked to a To-do by the same context rules:
- exact `evidence.todo_id`, or
- reconstructed `todo_id`, or
- matching `prj_id/project_id + activity_id + job_cd`, with compatible `farmer_id` when provided.

Frontend write rule:
- Photo upload from a To-do should send `todo_id`, `group_no`, `prj_id`, `project_id`, `activity_id`, `job_cd`, `field_id`, and `parcel_no`.
- `evidence_type` must remain the backend code value such as `MID_DRAINAGE_START`, even if the UI shows a Korean label.

## evidence_id to MySQL Composite Key Mapping

Frontend and API still use a single `evidence_id`, but MySQL `evidence` uses a composite key including `exec_id` and `seq_no`.

Rules:
- API `evidence_id` is the logical evidence identifier returned to the frontend.
- MySQL `exec_id` is the physical storage identifier.
- If `evidence_id` fits the MySQL `exec_id` length limit, store it directly as `exec_id`.
- If `evidence_id` is longer, generate a deterministic shortened `exec_id` and preserve the original ID in `raw_json.api_evidence_id`.
- `raw_json.evidence_id` is also kept for compatibility and direct debugging.
- `seq_no` is `1` in this phase because one API evidence record maps to one physical evidence row.
- `job_date` is derived from `captured_at`.
- `GET /evidence/{evidence_id}` must resolve both direct `exec_id` matches and raw JSON logical-ID matches.

## computed_status Calculation

`computed_status` is calculated at read time for To-do API responses. It is never written to MySQL.

Rules:
- If the To-do has `required_evidence_types`:
  - `completed`: all required evidence types have been submitted in linked evidence records.
  - `in_progress`: at least one required evidence type has been submitted, or at least one linked diary exists.
  - `pending`: no linked diary/evidence progress exists.
- If the To-do has no `required_evidence_types`:
  - `in_progress`: any linked diary or evidence exists.
  - `pending`: no linked diary/evidence exists.

The original MySQL-derived `status` remains separate from `computed_status`.

## Evidence Missing Calculation

`GET /evidence/missing` compares activity-level required evidence types with submitted evidence records.

Inputs:
- Required: `activity_type`.
- Optional filters: `farmer_id`, `field_id`, `parcel_no`, `project_id`, `prj_id`.

Result rules:
- Required evidence types come from backend activity mapping.
- Submitted types come from filtered evidence records.
- `missing_evidence_types = required - submitted`.
- `completion_status`:
  - `UNKNOWN_ACTIVITY`: no requirement mapping exists.
  - `NOT_STARTED`: no submitted evidence types.
  - `IN_PROGRESS`: some submitted, some missing.
  - `COMPLETED`: no missing evidence types.

## todo_id Generation Rule

The single backend rule is implemented in `app/utils/todo_id.py`.

Format:

```text
{group_no}-{prj_id}-{activity_id}-{job_cd}
```

Rules:
- Separator is always `-`.
- Missing values become an empty string.
- Do not create ad hoc To-do IDs in frontend code when component fields are available.

## Field Role Definitions

`activity_id`:
- RDB activity identifier from `prj_activity`.
- Used for To-do identity and context matching.

`activity_type`:
- Human/business activity category used by evidence APIs.
- Used by `/evidence/missing` to decide required evidence types.

`job_cd`:
- RDB farm job code from `farm_job`.
- Used for To-do identity, job labeling, and required evidence mapping in the To-do repository.

`evidence_type`:
- Evidence code submitted by photo/metadata flows.
- Examples: `MID_DRAINAGE_START`, `MID_DRAINAGE_END`, `BIOCHAR_BAG`, `WASTE_COLLECTION`.
- UI may show Korean labels, but API payloads keep code values.

`field_id` and `parcel_no`:
- Farmer-facing field/parcel context and evidence matching hints.
- Still compatibility fields while full DB journal/evidence migration is deferred.

## MySQL Table to API Field Mapping

### MySQL `journal` to `DiaryRecord`

- `exec_id` -> physical storage key
- `ai_result_json.api_diary_id` -> `DiaryRecord.diary_id` when present, otherwise `exec_id`
- `farmer_id` -> `DiaryRecord.farmer_id`
- `group_no` -> `DiaryRecord.group_no`
- `job_cd` -> `DiaryRecord.job_cd`
- `job_date` -> `DiaryRecord.work_date`
- `exec_desc` -> `DiaryRecord.work_detail`
- `input_type_cd` -> `DiaryRecord.input_type_cd`
- `job_cmpl_yn` -> `DiaryRecord.status` (`Y -> saved`, `N -> draft`)
- `parcel_no` -> `DiaryRecord.parcel_no`
- `activity_id` -> `DiaryRecord.activity_id`
- `prj_id` -> `DiaryRecord.prj_id` and fallback `project_id`
- `reg_dt` -> `DiaryRecord.created_at`
- `mod_dt` -> `DiaryRecord.updated_at`
- `ai_result_json.linked_evidence_ids` -> `DiaryRecord.linked_evidence_ids`
- `ai_result_json.todo_id` -> `DiaryRecord.todo_id`
- `ai_result_json.field_id` -> `DiaryRecord.field_id`
- `ai_result_json.project_id` -> `DiaryRecord.project_id`
- `ai_result_json.work_stage` -> `DiaryRecord.work_stage`
- `ai_result_json.work_stage_detail` -> `DiaryRecord.work_stage_detail`
- `ai_result_json.farmer_name` -> `DiaryRecord.farmer_name`
- `ai_result_json.worker_name` -> `DiaryRecord.worker_name`
- `ai_result_json.field_address` -> `DiaryRecord.field_address`
- `ai_result_json.crop_name` -> `DiaryRecord.crop_name`

### API `DiaryRecord` to MySQL `journal`

- `diary_id` -> `exec_id` direct or deterministic shortened ID
- `farmer_id` -> `farmer_id`
- `group_no` -> `group_no`
- `job_cd` or `work_stage` fallback -> `job_cd`
- `work_date` -> `job_date`
- `work_detail` -> `exec_desc`
- `input_type_cd` -> `input_type_cd`
- `status` -> `job_cmpl_yn`
- `parcel_no` or `field_id` fallback -> `parcel_no`
- `activity_id` -> `activity_id`
- `prj_id` or `project_id` fallback -> `prj_id`
- `created_at` -> `reg_dt`
- `updated_at` -> `mod_dt`
- API-only fields without dedicated columns -> `ai_result_json`

`prj_todo_list`:
- `group_no` -> `TodoRecord.group_no`
- `prj_id` -> `TodoRecord.prj_id` and current-compatible `project_id`
- `activity_id` -> `TodoRecord.activity_id`
- `job_cd` -> `TodoRecord.job_cd`
- `est_start_date` -> `TodoRecord.start_date`
- `est_end_date` -> `TodoRecord.due_date`
- `real_start_date`, `job_progress` -> base `status`
- `remark` -> `TodoRecord.remark`

`prj_activity`:
- `activity_name` -> `TodoRecord.activity_name`

`farm_job`:
- `job_name` -> `TodoRecord.job_name`

Derived To-do fields:
- `todo_id` -> `build_todo_id(group_no, prj_id, activity_id, job_cd)`
- `todo_title` -> activity/job display title
- `required_evidence_types` -> backend mapping by `job_cd`
- `computed_status` -> linked diary/evidence calculation against the active diary repository plus the current evidence repository

To-do farmer filter rule:
- `prj_todo_list`에는 `farmer_id`가 없으므로 `/todos`와 `/todos/today`의 `farmer_id` 필터는 직접 적용하지 않는다.
- 먼저 `user_master`에서 farmer 식별자(`login_id` / `farmer_no` / `user_no`)를 찾고, `group_member`로 소속 `group_no` 목록을 구한다.
- 그 다음 `prj_todo_list.group_no IN (...)`으로 조회를 제한한다.
- 매핑된 group이 없으면 결과는 빈 배열이다.

Currently not fully migrated:
- `linked_evidence_ids`, `todo_id`, `field_id`, `project_id`, `work_stage`, and similar API-only diary fields are temporarily preserved in `journal.ai_result_json`.

### MySQL `evidence` to `EvidenceRecord`

- `exec_id` -> physical storage key
- `raw_json.api_evidence_id` -> `EvidenceRecord.evidence_id` when present, otherwise `raw_json.evidence_id`, otherwise `exec_id`
- `farmer_id` -> `EvidenceRecord.farmer_id`
- `group_no` -> `EvidenceRecord.group_no`
- `job_cd` -> `EvidenceRecord.job_cd`
- `capture_dt` -> `EvidenceRecord.captured_at`
- `ai_label` -> `EvidenceRecord.confirmed_label`
- `evid_cd` -> `EvidenceRecord.evidence_type` fallback
- `file_path` -> `EvidenceRecord.image_url` or `storage_path` fallback when raw JSON value is absent
- `reg_dt` -> `EvidenceRecord.created_at`
- `mod_dt` -> `EvidenceRecord.updated_at`
- `raw_json.todo_id` -> `EvidenceRecord.todo_id`
- `raw_json.project_id` -> `EvidenceRecord.project_id`
- `raw_json.prj_id` -> `EvidenceRecord.prj_id`
- `raw_json.activity_id` -> `EvidenceRecord.activity_id`
- `raw_json.field_id` -> `EvidenceRecord.field_id`
- `raw_json.parcel_no` -> `EvidenceRecord.parcel_no`
- `raw_json.activity_type` -> `EvidenceRecord.activity_type`
- `raw_json.evidence_type` -> `EvidenceRecord.evidence_type`
- `raw_json.status` -> `EvidenceRecord.status`
- `raw_json.user_message` -> `EvidenceRecord.user_message`
- `raw_json.image_url` -> `EvidenceRecord.image_url`
- `raw_json.storage_path` -> `EvidenceRecord.storage_path`
- `raw_json.original_image_path` -> `EvidenceRecord.original_image_path`

### API `EvidenceRecord` to MySQL `evidence`

- `evidence_id` -> `exec_id` direct or deterministic shortened ID
- `farmer_id` -> `farmer_id`
- `group_no` -> `group_no`
- `job_cd` -> `job_cd`
- `captured_at` -> `capture_dt` and `job_date`
- `confirmed_label` -> `ai_label`
- `evidence_type` -> `evid_cd`
- full `evidence_type` -> `raw_json.evidence_type`
- `image_url` or `storage_path` -> `file_path`
- `created_at` -> `reg_dt`
- `updated_at` -> `mod_dt`
- API-only fields without dedicated columns -> `raw_json`
