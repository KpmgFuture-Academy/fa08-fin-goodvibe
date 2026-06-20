# 02. Backend API Inventory

작성일: 2026-06-02

분석 대상: `locaville/backend`

주의: 실제 `.env` 파일과 요구사항 정의서 엑셀은 열지 않았다. DB/외부 API/Supabase 관련 실제 설정값은 포함하지 않았다.

## Backend API Inventory

| 기능영역 | Method | Endpoint | Router 파일 | Service/Repository | Request | Response | 구현상태 | 요구사항 반영 포인트 |
|---|---:|---|---|---|---|---|---|---|
| health check | GET | `/health` | `app/routers/health.py` | `app.repositories.health_rdb.check_db_connection`, `library/locaville/dbcom.py` | 없음 | `{status, service, storage_mode, db}` | 구현 | 서버 상태와 RDB 연결 상태를 확인하는 운영/개발용 health API. DB 상세 접속정보는 응답하지 않는 구조. |
| AI RAG chat stream | POST | `/ai/chat/stream` | `app/routers/ai.py` | `app.services.ai_service.chat_with_rag_stream`, `rag_service` | `AIChatRequest` | SSE `token/final/done/error` | 구현 | APP/WEB 도움말 또는 정책 질의에 사용할 수 있는 streaming AI API. 실패 시 error event 반환. |
| AI RAG chat | POST | `/ai/chat` | `app/routers/ai.py` | `app.services.ai_service.chat_with_rag` | `AIChatRequest`: `question`, `messages`, `farmer_id`, `context` | `AIChatResponse`: `answer`, `source_type`, `used_context` | 구현 | 정책 문서 RAG 기반 질의응답. OpenAI/RAG 실패 시 fallback 응답 구조가 있음. |
| AI 영농일지 초안 | POST | `/ai/journal-draft` | `app/routers/ai.py` | `app.services.ai_service.generate_journal_draft` | `text`, `selected_todo` | `draft`, `needs_confirmation` | 구현 | APP 음성/텍스트 입력 후 저장 전 확인 카드에 연결 가능한 초안 생성 API. 자동 저장은 아님. |
| AI 증빙 안내 | POST | `/ai/evidence-guide` | `app/routers/ai.py` | `app.services.ai_service.generate_evidence_guide` | `activity_type`, `missing_evidence_types` | `{message}` | 구현 | 누락 증빙 안내 문구 생성 API. APP 사진 등록 가이드와 연결 가능. |
| 정책 일정 계산 | POST | `/ai/policy/calc` | `app/routers/ai.py` | `app.services.ai_service.calculate_policy_date` | `question`, `activity`, `farmer_context` | `answer`, `source_type`, `used_context` | 구현 | 정책 문서 기반 일정/기간 계산 보조 API. 요구사항에 AI 정책 보조 기능으로 추가 가능. |
| 정책 규칙 추출 | POST | `/ai/policy/rule` | `app/routers/ai.py` | `app.services.ai_service.extract_policy_schedule_rule` | `task_name`, `question` | `rule`, `raw_answer`, `source_type`, `used_context` | 구현 | 작업 일정 규칙을 JSON 형태로 추출하는 보조 API. 실제 todo 자동생성 검증 흐름은 별도 확인 필요. |
| 정책 요약 | POST | `/ai/policy/summary` | `app/routers/ai.py` | `app.services.ai_service.summarize_policy_document` | `activity`, `max_chars` | `summary`, `source_files`, `chunk_count`, `source_type` | 구현 | 정책 문서 요약 기능. WEB 안내/추천 영역과 연결 가능. |
| AI 사진 증빙 라벨 후보 | POST | `/ai/vision/evidence-label` | `app/routers/ai.py` | `app.services.ai_service.suggest_evidence_label_from_image` | `evidence_id`, `image_url`, `activity_type`, `activity_id`, `expected_evidence_types` | `suggested_label`, `candidates`, `user_message`, `needs_confirmation` | 구현 | 사진 증빙 유형 후보 제안. 자동 확정이 아니라 사용자/관리자 확인 필요 구조. |
| STT | POST | `/ai/stt` | `app/routers/ai.py` | `app.services.ai_service.transcribe_audio_file` | multipart `file`, `language` | `text`, `source`, `error_message` | 구현 | APP 음성 입력용 STT. 실패 시 fallback source와 오류 메시지 반환. |
| TTS | POST | `/ai/tts` | `app/routers/ai.py` | `app.services.ai_service.synthesize_speech_bytes` | `AITTSRequest`: `text`, `voice` | audio stream, 실패 시 204 | 구현 | APP/WEB 음성 안내용 TTS. 응답은 JSON이 아니라 `audio/mpeg` stream. |
| 음성 영농일지 세션 시작 | POST | `/ai/voice/session/start` | `app/routers/ai.py` | `app.services.ai_service.start_voice_session` | `farmer_id`, `selected_todo` | `session_id`, `status`, `question`, `known_slots`, `draft`, `missing_slots` | 구현 | APP 대화형 영농일지 입력 시작 API. in-memory 세션 기반. |
| 음성 영농일지 세션 응답 | POST | `/ai/voice/session/reply` | `app/routers/ai.py` | `app.services.ai_service.reply_voice_session` | `session_id`, `text` | 세션 진행 상태와 draft | 구현 | APP 대화형 입력 중간 응답 처리. |
| 음성 영농일지 세션 확정 | POST | `/ai/voice/session/finalize` | `app/routers/ai.py` | `app.services.ai_service.finalize_voice_session` | `session_id`, `confirmed_draft` | `manual_input` | 구현 | 저장 전 수동 입력 payload 형태로 변환. 실제 저장은 `/diary` 호출 필요. |
| diaries 목록 | GET | `/diary` | `app/routers/diary.py` | `app.services.diary_service`, `app.repositories.diary_rdb`, `diary_file` | query: `farmer_id`, `status`, `work_date`, `prj_id/project_id`, `activity_id`, `job_cd`, `group_no`, `parcel_no/field_id`, `limit` | `DiaryListResponse`: `items[]` | 구현 | APP/WEB 영농일지 목록 조회. RDB 모드와 JSON 모드 분기. |
| diary detail | GET | `/diary/{diary_id}` | `app/routers/diary.py` | `app.services.diary_service.get_diary_record` | path `diary_id` | `DiaryRecord` | 구현 | 영농일지 상세 조회. 없으면 404, 저장소 오류는 503. |
| diary 생성 | POST | `/diary` | `app/routers/diary.py` | `app.services.diary_service.create_diary_record`, `diary_rdb.create_diary_mysql` | `DiaryCreate` body | `DiaryRecord` | 구현 | APP 직접/음성 입력 저장 API. RDB 모드에서는 `journal` 및 프로젝트 연결 테이블 저장 로직 존재. |
| evidence 목록 | GET | `/evidence` | `app/routers/evidence.py` | `app.services.evidence_service`, `app.repositories.evidence_rdb`, `evidence_file` | query: `farmer_id`, `status`, `evidence_type`, `confirmed_label`, `activity_type`, `activity_id`, `job_cd`, `group_no`, `field_id/parcel_no`, `project_id/prj_id`, `limit` | `EvidenceListResponse`: `items[]` | 구현 | APP/WEB 증빙자료 목록 조회. RDB/JSON 저장소 분기. |
| 누락 증빙 계산 | GET | `/evidence/missing` | `app/routers/evidence.py` | `app.services.evidence_service.get_evidence_missing_status` | query: `activity_type`, `farmer_id`, `field_id/parcel_no`, `project_id/prj_id` | `required/submitted/missing_evidence_types`, counts, `completion_status`, `user_message` | 구현 | APP 사진 등록 가이드와 todo 완료 판단에 연결 가능한 누락 증빙 계산 API. |
| 파일 업로드 | POST | `/evidence/upload` | `app/routers/evidence.py` | `app.services.evidence_service.create_uploaded_evidence_record`, `evidence_storage`, `image_quality`, `geocode_service`, `ai_service` | multipart `file` + `farmer_id`, `activity_type`, `evidence_type`, todo/project/activity/parcel/GPS/status 관련 form fields | `EvidenceRecord` | 구현 | 사진/증빙 업로드 핵심 API. 확장자/용량 검증, 원본/워터마크 저장, 이미지 품질 검사, 선택적 Vision/OCR, GPS 주소 변환, DB 저장. |
| evidence detail | GET | `/evidence/{evidence_id}` | `app/routers/evidence.py` | `app.services.evidence_service.get_evidence_record` | path `evidence_id` | `EvidenceRecord` | 구현 | 증빙자료 상세 조회. 없으면 404. |
| evidence 메타 생성 | POST | `/evidence` | `app/routers/evidence.py` | `app.services.evidence_service.create_evidence_record` | `EvidenceCreate` body | `EvidenceRecord` | 구현 | 파일 업로드 없이 증빙 메타만 생성하는 API. 일반 APP 사진 흐름은 `/evidence/upload`가 더 중요. |
| evidence 상태 변경 | PATCH | `/evidence/{evidence_id}` | `app/routers/evidence.py` | `app.services.evidence_service.update_evidence_record`, `notification_rdb` | `EvidenceUpdate`: `status`, `confirmed_label`, `user_message` | `EvidenceRecord` | 구현 | WEB 관리자 검토 상태 변경. `retake_required` 전환 시 농업인 알림 insert 시도. |
| todos 목록 | GET | `/todo` | `app/routers/todo.py` | `app.services.todo_service`, `app.repositories.todo_rdb`, `diary_service`, `evidence_service` | query: `farmer_id`, `group_no`, `prj_id`, `activity_id`, `date` | `TodoListResponse`: `items[]` | 구현 | RDB의 todo board 조회 후 diary/evidence 제출 여부로 `computed_status` 계산. JSON 모드는 빈 목록 fallback. |
| today todos | GET | `/todo/today` | `app/routers/todo.py` | `app.services.todo_service.list_today_todos` | query: `farmer_id`, `group_no`, `prj_id`, `activity_id`, `date` | `TodoListResponse`: `items[]` | 구현 | APP 홈의 오늘 할 일 API. 날짜 미전달 시 서버 기준 오늘. |
| admin login | POST | `/admin/login` | `app/routers/admin.py` | `app.services.admin_auth_service.authenticate_admin` | `login_id` + 인증값 | `{ok, admin}` | 구현 | WEB 관리자 로그인 API. 인증 실패 401, DB 오류 500. |
| admin profile 조회 | GET | `/admin/profile/{admin_no}` | `app/routers/admin.py` | `app.services.admin_profile_service.get_admin_profile` | path `admin_no` | `{admin}` | 구현 | 관리자 프로필 조회. 없으면 404. |
| admin profile 수정 | PATCH | `/admin/profile/{admin_no}` | `app/routers/admin.py` | `app.services.admin_profile_service.update_admin_profile` | 전화/이메일/인증값 변경 body | `{ok, admin}` | 구현 | 관리자 정보 수정. 인증값은 해시 저장 로직이 service에 있음. |
| admin summary | GET | `/admin/summary` | `app/routers/admin.py` | `app.services.admin_service.get_admin_summary`, `admin_view_rdb`, `diary_rdb`, `evidence_rdb` | 없음 | totals, `diaries_by_farmer`, `evidence_by_status`, `recent_diaries`, `recent_evidence` | 구현 | WEB 대시보드 요약 핵심 API. view 기반 집계와 최근 목록 제공. |
| admin todo status | GET | `/admin/todo-status` | `app/routers/admin.py` | `app.services.admin_service.get_admin_todo_status`, `todo_service`, `evidence_service` | query: `farmer_id`, `group_no`, `prj_id/project_id`, `activity_id` | `{items, applied_filters}` | 구현 | WEB 농가별/작업별 todo 진행률 및 누락 증빙 현황 API. |
| diary delete | DELETE | `/admin/diaries/{diary_id}` | `app/routers/admin.py` | `app.services.admin_service.delete_diary`, `diary_rdb.soft_delete_diary_mysql`, `notification_rdb` | path `diary_id` | `{diary_id, deleted}` | 구현 | WEB에서 잘못된 영농일지 soft delete. 삭제 성공 시 농업인 알림 시도. |
| admin new counts | GET | `/admin/new-counts` | `app/routers/admin.py` | `app.services.admin_service.get_new_counts`, `diary_rdb.count_diaries_since`, `evidence_rdb.count_evidence_since` | query: `since_diary`, `since_evidence` | `{diaries, evidence}` | 구현 | WEB 사이드바/배지 신규 건수 표시 후보 API. |
| residents 생성 | POST | `/admin/residents` | `app/routers/admin.py` | `app.services.admin_resident_service.create_resident`, `admin_resident_rdb` | 주민/연락처/주소/필지/그룹 관련 dict body | 생성된 주민/사용자/마을 상태 dict | 구현 | WEB 주민/농가 등록 API. 트랜잭션 기반 insert. |
| residents 수정 | PATCH | `/admin/residents/{amo_regno}` | `app/routers/admin.py` | `app.services.admin_resident_service.update_resident`, `admin_resident_rdb` | path `amo_regno`, 수정 dict body | 수정 결과 dict | 구현 | WEB 주민 기본정보 수정. 없으면 404. |
| resident invite | POST | `/admin/residents/{amo_regno}/invite` | `app/routers/admin.py` | `app.services.admin_resident_service.invite_resident`, `admin_resident_rdb` | path `amo_regno` | 초대 상태 dict | 구현 | 사용자 상태를 초대 상태로 변경하는 API. 실제 SMS 발송 코드는 확인되지 않음. |
| payments | GET | `/admin/payments` | `app/routers/admin.py` | `app.services.payment_service.get_admin_payments`, `locaville.dbcom.fetch_all` | 없음 | 농가별 지급액/활동 breakdown/총액 dict | 구현 | WEB 지급/보조금 집계 API. 최근 커밋에서 화면 삭제 이력이 있으므로 요구사항에는 삭제후보 또는 백엔드 잔존 API로 표시 필요. |
| agri-weather | GET | `/admin/agri-weather` | `app/routers/admin.py` | `app.services.admin_weather_service`, `weather_service`, `user_ville_rdb` | 없음 | 마을/관측소/현재 기상/7일 forecast/fallback flag | 구현 | WEB 대시보드 농업기상 카드. 공공 기상 API 실패 시 fallback 응답. |
| weekly farm info | GET | `/admin/weekly-farm-info` | `app/routers/admin.py` | `app.services.farm_info_service`, `user_ville_rdb`, 선택적 LLM | 없음 | `period`, `source`, `village`, `matchedCrops`, `items[]` | 구현 | WEB 주간농사정보 카드. 외부 농사정보 API/PDF/LLM 시도 후 시즌 정적 데이터 fallback. |
| address search | GET | `/admin/address-search` | `app/routers/admin.py` | `app.services.kakao_address_service.search_address` | query: `query`, `size` | `{items: [{id, road_address, jibun_address, zip_code}]}` | 구현 | WEB 주민 주소 검색용 backend proxy. 외부 주소 API 실패 시 502, 설정 없음 503. |
| recent evidence gallery | GET | `/admin/recent-evidence` | `app/routers/admin.py` | `app.services.admin_service.get_recent_evidence`, `evidence_rdb.fetch_recent_originals` | query: `limit` | `{items[]}` | 구현 | WEB 마을 현황 갤러리용 최근 원본 증빙 이미지 조회. |
| laggard farmers | GET | `/admin/laggard-farmers` | `app/routers/admin.py` | `app.services.admin_service.get_laggard_farmers` | query: `days`, `top_n` | `{window_days, items[]}` | 구현 | WEB 미이행 농가 top 목록. `admin/todo-status` 결과 기반 계산. |
| laggard notify | POST | `/admin/laggard-farmers/{farmer_id}/notify` | `app/routers/admin.py` | `app.services.admin_service.send_laggard_notification`, `notification_rdb` | path `farmer_id`, body `title`, `message`, `sender_user_no` | `{notice_no, farmer_id, user_no, sent}` | 구현 | WEB 미이행 농가 알림 발송. DB notification insert. |
| dashboard AI recommendation | GET | `/admin/ai-recommendation` | `app/routers/admin.py` | `app.services.admin_service.get_ai_recommendation`, weather/farm info/todo/RAG | 없음 | `{recommendation, sample_evidence, context}` | 구현 | WEB 대시보드 상단 추천 문구. AI 실패 시 fallback 문장. |
| farm helper 배정 | POST | `/admin/farm-helpers` | `app/routers/admin.py` | `app.services.farm_helper_service.assign_helper_pair`, `farm_helper_rdb`, `notification_rdb` | `helper_user_no`, `recipient_user_no`, `est_end_date`, `chief_user_no` | 배정 결과 dict | 구현 | WEB 기록 도우미 배정 및 알림. |
| farm helper 목록 | GET | `/admin/farm-helpers` | `app/routers/admin.py` | `app.repositories.farm_helper_rdb.list_for_village` | query `ville_id` | `{items[]}` | 구현 | WEB 마을별 도우미 관계 조회. |
| farm helper 해제 | DELETE | `/admin/farm-helpers/{helper_user_no}/{help_seq}` | `app/routers/admin.py` | `app.services.farm_helper_service.revoke_helper_pair` | path, optional `chief_user_no` | 해제 결과 dict | 구현 | WEB 도우미 관계 종료 처리. |
| evidence delete | DELETE | `/admin/evidence/{evidence_id}` | `app/routers/admin.py` | `app.services.admin_service.delete_evidence`, `evidence_rdb.soft_delete_evidence_mysql`, `notification_rdb` | path `evidence_id` | `{evidence_id, deleted}` | 구현 | WEB에서 잘못된 증빙자료 soft delete. 파일 자체 삭제가 아니라 DB soft delete 중심. |
| 사업참여 프로젝트 목록 | GET | `/engage/projects` | `app/routers/engage.py` | `app.services.engage_service`, `engage_rdb` | 없음 | 프로젝트 목록 dict | 구현 | WEB 사업참여 화면 API. |
| 사업참여 프로젝트 상세 | GET | `/engage/projects/{prj_id}` | `app/routers/engage.py` | `app.services.engage_service.get_engage_project_register_view` | path `prj_id` | 프로젝트/마을 그룹 정보 dict | 구현 | WEB 사업참여 상세/등록 화면. |
| 사업참여 그룹 등록 | POST | `/engage/projects/{prj_id}/register` | `app/routers/engage.py` | `app.services.engage_service.register_engage_group` | path `prj_id`, body `group_no` | 등록 결과 dict | 구현 | WEB 선택 그룹을 사업 참여 단체로 등록. |
| 사업참여 활동 조회 | GET | `/engage/projects/{prj_id}/activities` | `app/routers/engage.py` | `app.services.engage_service.get_engage_activity_view` | path `prj_id` | 활동/참여 농가 데이터 dict | 구현 | WEB 활동별 농가 등록/조회 화면. |
| 사업참여 활동 농가 등록 | POST | `/engage/projects/{prj_id}/activities/register` | `app/routers/engage.py` | `app.services.engage_service.register_engage_activity_members` | `activity_id`, `selections[{amo_regno, parcel_nos}]` | 등록 결과 dict | 구현 | WEB 활동별 참여 농가/필지 등록. |
| 사업참여 todo 조회 | GET | `/engage/projects/{prj_id}/todos` | `app/routers/engage.py` | `app.services.engage_service.get_engage_todo_view` | path `prj_id` | todo 생성/조회 화면 데이터 dict | 구현 | WEB 사업별 todo 확인 화면. |
| 사업참여 todo 생성 | POST | `/engage/projects/{prj_id}/todos/create` | `app/routers/engage.py` | `app.services.engage_service.create_engage_todo_list` | path `prj_id` | 생성 결과 dict | 구현 | 참여 농가/활동/작업 기준 `prj_todo_list` 생성. |
| project 목록 | GET | `/project` | `app/routers/project.py` | `app.services.project_service`, `project_rdb` | 없음 | `ProjectListResponse` | 구현 | WEB 프로젝트 관리 목록. |
| project 상세 | GET | `/project/{prj_id}` | `app/routers/project.py` | `app.services.project_service.get_project_detail` | path `prj_id` | `ProjectDetailResponse`: project, parcel options, jobs, job options, exec options | 구현 | WEB 프로젝트 상세/수정 화면. |
| project 수정 | PATCH | `/project/{prj_id}` | `app/routers/project.py` | `app.services.project_service.update_project_info` | `ProjectUpdateRequest` | `{ok, prj_id}` | 구현 | WEB 프로젝트 기본정보 수정. |
| project activity 수정 | PATCH | `/project/{prj_id}/activities/{activity_id}` | `app/routers/project.py` | `app.services.project_service.update_project_activity` | `ProjectActivityUpdateRequest` | `{ok, prj_id, activity_id}` | 구현 | WEB 프로젝트 활동 수정. |
| project activity 생성 | POST | `/project/{prj_id}/activities` | `app/routers/project.py` | `app.services.project_service.create_project_activity` | `ProjectActivityCreateRequest` | `{ok, prj_id, activity_id}` | 구현 | WEB 프로젝트 활동 추가. |
| project job 생성 | POST | `/project/{prj_id}/activities/{activity_id}/jobs` | `app/routers/project.py` | `app.services.project_service.create_project_job` | `ProjectJobCreateRequest` | `{ok, prj_id, activity_id, job_seq}` | 구현 | WEB 프로젝트 작업 추가. |
| project job 수정 | PATCH | `/project/{prj_id}/activities/{activity_id}/jobs/{job_seq}` | `app/routers/project.py` | `app.services.project_service.update_project_job` | `ProjectJobUpdateRequest` | `{ok, prj_id, activity_id, job_seq}` | 구현 | WEB 프로젝트 작업 수정. |
| project job 삭제 | DELETE | `/project/{prj_id}/activities/{activity_id}/jobs/{job_seq}` | `app/routers/project.py` | `app.services.project_service.delete_project_job` | path | `{ok, prj_id, activity_id, job_seq}` | 구현 | WEB 프로젝트 작업 삭제. |
| farmer parcels | GET | `/farmer/{farmer_id}/parcels` | `app/routers/farmer.py` | `app.repositories.farmer_rdb.list_parcels_by_farmer`, `identity_rdb` | path `farmer_id` | `{items[]}` | 구현 | APP 농가 보유 필지 선택 API. `farmer_id`는 여러 식별자 형태 허용. |
| farmer notifications | GET | `/farmer/{farmer_id}/notifications` | `app/routers/farmer.py` | `identity_rdb`, `notification_rdb.fetch_recent` | path `farmer_id`, query `limit` | `{items[]}` | 구현 | APP 알림 목록. user_no 해석 실패 시 404. |
| farmer unread count | GET | `/farmer/{farmer_id}/notifications/unread-count` | `app/routers/farmer.py` | `notification_rdb.fetch_unread_count` | path `farmer_id` | `{count}` | 구현 | APP 알림 배지. |
| farmer notification read | PATCH | `/farmer/{farmer_id}/notifications/{notice_no}/read` | `app/routers/farmer.py` | `notification_rdb.mark_read` | path | `{notice_no, read}` | 구현 | APP 개별 알림 읽음 처리. |
| farmer notifications read-all | POST | `/farmer/{farmer_id}/notifications/read-all` | `app/routers/farmer.py` | `notification_rdb.mark_all_read` | path `farmer_id` | `{updated}` | 구현 | APP 전체 알림 읽음 처리. |
| farmer current helper | GET | `/farmer/{farmer_id}/farm-helpers/current` | `app/routers/farmer.py` | `farm_helper_service.get_current_helper_role` | path `farmer_id` | helper/recipient/none 역할 dict | 구현 | APP 기록 도우미 현재 역할 조회. |
| farmer helper approve | POST | `/farmer/{farmer_id}/farm-helpers/{helper_user_no}/{help_seq}/approve` | `app/routers/farmer.py` | `farm_helper_service.approve_pair` | path | 승인 결과 dict | 구현 | APP 도우미 동의 처리. 권한 불일치 403. |
| demo reset | POST | `/demo/reset` | `app/routers/demo.py` | `app.services.demo_service`, `json_store`, `diary_file`, `evidence_file` | 없음 | `{ok/status...}` dict | 구현 | JSON demo 데이터 초기화. RDB 전체 초기화가 아니라 JSON 데모 중심. |
| demo seed | POST | `/demo/seed` | `app/routers/demo.py` | `app.services.demo_service` | 없음 | `{ok/status...}` dict | 구현 | JSON 데모 데이터 주입. |
| demo status | GET | `/demo/status` | `app/routers/demo.py` | `app.services.demo_service` | 없음 | 데모 데이터 상태 dict | 구현 | 시연 데이터 존재 여부 확인. |
| weather today | GET | `/weather/today` | `app/routers/weather.py` | `app.services.weather_service.fetch_current_weather`, `user_ville_rdb` | query `ville_id`, `crop_cd` | 현재 날씨 dict 또는 error 포함 dict | 구현 | APP 날씨 위젯 후보 API. 마을 좌표/주소 기반 외부 기상 API 호출. |
| ville project 목록 | GET | `/ville-project` | `app/routers/ville_project.py` | `app.repositories.project_rdb.list_projects_with_activities` | query `group_no`, `ville_id`, `farmer_id` | `{items[]}` | 구현 | APP/WEB 마을·그룹·농가별 참여 사업 및 활동 목록. |
| current user village | GET | `/user-ville/current-user` | `app/routers/user_ville.py` | `identity_rdb.resolve_user_no`, `user_ville_rdb.get_current_user_ville_info` | optional query `farmer_id` | 사용자/마을 context dict | 구현 | APP/WEB 현재 사용자와 마을 컨텍스트 조회. |
| farm job list | GET | `/farm-job/list` | `app/routers/farm_job.py` | `locaville.dbcom.fetch_all` | 없음 | `{items: [{job_cd, job_name}]}` | 구현 | APP 직접 입력 작업 종류 선택용 DB master 조회. |
| business management | GET | `/business-management/admin` | `app/routers/business_management.py` | `app.services.business_management_service`, `business_management_rdb` | query `group_no`, `prj_id` | `businesses/entities/participations/taskAssignments` dict | 구현 | WEB 농업인/단체 관리 화면용 집계 API. |
| project report preview | GET | `/reports/project-preview` | `app/routers/report.py` | `app.services.report_service.build_project_report_data` | query `farmer_id`, `prj_id/project_id`, `include_images` | 보고서 preview JSON | 구현 | 사업별 제출/정산용 보고서 데이터 preview. |
| project report PDF | GET | `/reports/project-pdf` | `app/routers/report.py` | `app.services.report_service.generate_project_pdf` | query `farmer_id`, `prj_id/project_id`, `include_images` | PDF `FileResponse` | 구현 | 사업별 PDF 보고서 생성/다운로드. PDF 생성 실패 503/500. |

## 구현 확인된 Backend 기능

- FastAPI 앱 구성, CORS 설정, `/uploads` static mount
- health check 및 RDB 연결 ping
- todo/today todo 조회와 `computed_status` 계산
- 영농일지 목록/상세/생성
- 증빙자료 목록/상세/생성/상태 변경
- multipart 사진 업로드, 원본/워터마크 저장, 이미지 품질 검사
- Supabase Storage 선택 연동 및 로컬 파일 저장 fallback
- 관리자 대시보드 summary, todo status, 신규 건수
- 주민 등록/수정/초대 상태 변경
- 지급액 집계 API
- 농업기상, 주간농사정보, 주소검색 backend proxy
- 농가 필지 조회
- 알림 조회/읽음/발송
- 기록 도우미 배정/조회/해제/동의
- 프로젝트/사업참여/활동/작업 관리
- 데모 JSON 데이터 reset/seed/status
- AI RAG, 정책 요약/계산/규칙 추출, 영농일지 초안, 증빙 안내, Vision label, STT/TTS, 음성 세션
- 사업 보고서 preview/PDF 생성

## 부분구현으로 보이는 Backend 기능

- `payments`: 백엔드 API는 구현되어 있으나 최근 커밋에서 WEB 지급 관리 화면 삭제 이력이 있어 요구사항 반영 시 “백엔드 잔존 API” 또는 “삭제후보/확인필요”로 구분하는 것이 안전하다.
- `demo data`: JSON 저장소 기준 reset/seed/status로 구현되어 있다. RDB 전체 데모 초기화/주입으로 보기는 어렵다.
- `resident invite`: 사용자 상태 변경 중심으로 구현되어 있으며, 코드상 실제 외부 SMS 발송은 확인되지 않는다.
- AI 정책 규칙 추출: endpoint와 로직은 있으나 추출 결과가 실제 todo 자동 생성/검증까지 이어지는지 별도 화면/API 연결 확인이 필요하다.
- Supabase Storage: 선택적 연동 구조는 있으나, 설정이 없으면 로컬 파일 저장으로 fallback한다. 현재 환경에서 실제 활성 여부는 `.env`를 읽지 않았으므로 확인하지 않았다.

## 코드상 확인이 어려운 기능

- 실제 운영 DB에 어떤 DBMS가 활성화되어 있는지: 코드상 MySQL/PostgreSQL 선택 구조가 있으나 `.env`를 읽지 않아 현재 활성값은 확인하지 않았다.
- 외부 공공데이터/농업기상/주소검색 API의 실제 호출 성공 여부: endpoint와 fallback 로직은 있으나 실제 키/네트워크 상태는 확인하지 않았다.
- Supabase Storage 실제 업로드 성공 여부: SDK와 선택적 upload 로직은 있으나 실제 접속정보 확인은 하지 않았다.
- OpenAI 기반 STT/TTS/Vision/RAG 실제 성공 여부: 코드상 fallback은 있으나 실제 API 설정은 확인하지 않았다.
- RDB 테이블/view의 현재 스키마와 실제 데이터 품질: 코드상 SQL 접근은 확인했지만 DB 질의는 수행하지 않았다.

## 요구사항 정의서에 반드시 추가해야 할 Backend 연동 기능

- APP 오늘 할 일: `/todo/today`, `/todo`, `computed_status`
- APP 영농일지 저장/조회: `/diary`, `/diary/{diary_id}`
- APP 사진 증빙 업로드/조회: `/evidence/upload`, `/evidence`, `/evidence/{evidence_id}`, `/evidence/missing`
- APP 음성/AI 입력: `/ai/stt`, `/ai/tts`, `/ai/journal-draft`, `/ai/voice/session/*`
- APP 농가 컨텍스트/필지/작업 master: `/user-ville/current-user`, `/farmer/{farmer_id}/parcels`, `/farm-job/list`, `/ville-project`
- APP 알림/기록 도우미: `/farmer/{farmer_id}/notifications*`, `/farmer/{farmer_id}/farm-helpers/current`, `/farmer/{farmer_id}/farm-helpers/{helper_user_no}/{help_seq}/approve`
- WEB 대시보드: `/admin/summary`, `/admin/todo-status`, `/admin/new-counts`, `/admin/recent-evidence`, `/admin/laggard-farmers`, `/admin/ai-recommendation`
- WEB 증빙 검토/삭제: `/evidence`, `/evidence/{evidence_id}`, `/admin/evidence/{evidence_id}`
- WEB 영농일지 관리/삭제: `/diary`, `/diary/{diary_id}`, `/admin/diaries/{diary_id}`
- WEB 주민 관리: `/admin/residents`, `/admin/residents/{amo_regno}`, `/admin/residents/{amo_regno}/invite`, `/admin/address-search`
- WEB 사업/프로젝트 관리: `/project*`, `/engage*`, `/business-management/admin`, `/reports/project-preview`, `/reports/project-pdf`
- WEB 농업 정보: `/admin/agri-weather`, `/admin/weekly-farm-info`

## APP 요구사항과 연결될 API 후보

- 홈 오늘 할 일: `GET /todo/today`
- 전체/필터 todo: `GET /todo`
- 할 일 기반 사업/활동 선택: `GET /ville-project`, `GET /farm-job/list`
- 현재 사용자/마을 context: `GET /user-ville/current-user`
- 필지 선택: `GET /farmer/{farmer_id}/parcels`
- 영농일지 목록/상세/저장: `GET /diary`, `GET /diary/{diary_id}`, `POST /diary`
- 사진 증빙 등록/조회/누락 확인: `POST /evidence/upload`, `GET /evidence`, `GET /evidence/{evidence_id}`, `GET /evidence/missing`
- 음성 대화형 입력: `POST /ai/stt`, `POST /ai/tts`, `POST /ai/journal-draft`, `POST /ai/voice/session/start`, `POST /ai/voice/session/reply`, `POST /ai/voice/session/finalize`
- 날씨 위젯: `GET /weather/today`
- 알림: `GET /farmer/{farmer_id}/notifications`, `GET /farmer/{farmer_id}/notifications/unread-count`, 읽음 처리 endpoints
- 기록 도우미: `GET /farmer/{farmer_id}/farm-helpers/current`, `POST /farmer/{farmer_id}/farm-helpers/{helper_user_no}/{help_seq}/approve`

## WEB 요구사항과 연결될 API 후보

- 대시보드 요약: `GET /admin/summary`
- todo 진행/누락 증빙: `GET /admin/todo-status`
- 신규 항목 배지: `GET /admin/new-counts`
- 최근 증빙 갤러리: `GET /admin/recent-evidence`
- 미이행 농가/알림: `GET /admin/laggard-farmers`, `POST /admin/laggard-farmers/{farmer_id}/notify`
- AI 추천: `GET /admin/ai-recommendation`
- 농업기상/주간농사정보: `GET /admin/agri-weather`, `GET /admin/weekly-farm-info`
- 영농일지 관리: `GET /diary`, `GET /diary/{diary_id}`, `DELETE /admin/diaries/{diary_id}`
- 증빙 관리: `GET /evidence`, `PATCH /evidence/{evidence_id}`, `DELETE /admin/evidence/{evidence_id}`
- 주민/농가 관리: `POST /admin/residents`, `PATCH /admin/residents/{amo_regno}`, `POST /admin/residents/{amo_regno}/invite`, `GET /admin/address-search`
- 프로젝트 관리: `GET/PATCH /project`, project activity/job endpoints
- 사업 참여 관리: `GET/POST /engage/*`
- 단체/사업 관리: `GET /business-management/admin`
- 지급 관리: `GET /admin/payments`는 API 구현은 있으나 화면 삭제 이력 때문에 요구사항 상태 확인 필요
- 보고서: `GET /reports/project-preview`, `GET /reports/project-pdf`

## 저장소, 외부 연동, fallback 정리

- DB 연결: `library/locaville/dbcom.py`에서 MySQL/PostgreSQL 선택형 연결을 제공한다. backend repository들은 `fetch_all`, `fetch_one`, `execute`, `transaction`을 통해 접근한다.
- RDB/JSON fallback: `diary_service`, `evidence_service`는 저장소 모드에 따라 RDB 또는 JSON 파일 저장소를 사용한다. `todo_service`는 RDB가 아니면 빈 목록을 반환한다.
- 파일 저장: `POST /evidence/upload`는 로컬 `uploads/evidence/original`, `uploads/evidence/watermarked` 저장을 지원하고, FastAPI가 `/uploads`로 정적 서빙한다.
- Supabase Storage: `evidence_storage.py`에 선택적 업로드 모듈이 있으며, 설정 또는 SDK가 없으면 로컬 파일 저장으로 fallback한다.
- 공공데이터/농업기상: `weather_service`, `admin_weather_service`가 외부 기상 데이터를 호출하고, 실패 시 error/fallback 응답을 반환한다.
- 주간농사정보: `farm_info_service`가 외부 농사정보 API/PDF/LLM 요약을 시도하고, 실패 시 시즌 정적 데이터로 fallback한다.
- 주소검색: `kakao_address_service`가 외부 주소검색 API backend proxy 역할을 하며, 설정 없음 503, 외부 API 실패 502로 변환한다.
- AI/OpenAI: `ai_service`는 RAG, STT, TTS, Vision, 정책 보조 기능을 제공하며, 여러 기능에서 fallback 응답을 반환하도록 설계되어 있다.

## 오류 처리 방식 요약

- Router에서 `HTTPException`으로 400/401/403/404/409/500/502/503을 명시적으로 변환한다.
- 조회 대상 없음: 주로 404.
- 중복/충돌: diary/evidence/project job 일부에서 409.
- 사용자 입력 오류: 주민 등록/수정, evidence upload, project validation 등에서 400.
- 저장소/DB 오류: diary/evidence/report 일부에서 503 또는 500.
- 외부 주소검색 실패: 설정 없음 503, 외부 호출 실패 502.
- AI service 오류: `AIServiceError.status_code`를 그대로 HTTP status로 매핑.
- 일부 부가 동작 실패는 본 요청 성공을 막지 않도록 swallow한다. 예: evidence retake 알림, delete 알림, 업로드 중 분석/주소 변환 일부.

