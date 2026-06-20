# 요구사항 ↔ 테스트 매핑

> 본 문서는 [0602_저탄마을_요구사항정의서_latest_screen_based_star.xlsx](./0602_저탄마을_요구사항정의서_latest_screen_based_star.xlsx) 의 각 요구사항이 어떤 테스트로 검증되는지 양방향으로 추적합니다.
>
> **읽는 방법**: 평가자가 "이 요구사항이 검증되었나?" 를 확인하려면 §1 (요구사항 → 테스트), 개발자가 "이 테스트가 어느 요구사항을 다루나?" 를 확인하려면 §2 (테스트 → 요구사항) 표를 보세요.

---

## 1. 요구사항 → 테스트 (정방향)

각 요구사항이 검증되는 테스트 위치와 PASS 조건. 코드근거는 [요구사항정의서 엑셀](./0602_저탄마을_요구사항정의서_latest_screen_based_star.xlsx) 의 "코드근거" 칼럼과 동일합니다.

### 1.1 농민 앱 (APP) — 시연 핵심 경로

| 요구사항 ID | 기능명 | 검증 테스트 | PASS 조건 (정량) |
|---|---|---|---|
| REQ_APP_003 | 오늘 할 일 조회 | `test_l1_smoke.py::test_l1_2_demo_farmer_today_todo_present` | `GET /todo/today?farmer_id=ys.kim` → status 200, body 의 todo 개수 ≥ 1 |
| REQ_APP_003 | (보호) AI 가 todo 만들지 않음 | `test_l2_invariants.py::test_l2_todo_today_unknown_farmer_no_ai_fallback` | 존재하지 않는 `farmer_id` 호출 → status 200, body == [] |
| REQ_APP_004 | 날씨 위젯 | (수동 — backend `/weather/today` 응답 시각 검증) | 수동 시연 직전 점검 |
| REQ_APP_005 | To-do 기록하기 (일지 작성) | `test_l3_e2e.py::test_l3_e2e_2_farmer_diary_visible_to_chief_and_delete` | `POST /diary` → status 201, 응답에 `diary_id` 발급, `/admin/summary.total_diaries` +1 |
| REQ_APP_006 | To-do 사진 등록 | `test_l3_e2e_extra.py::test_l3_e2e_6_evidence_upload_multipart_full_flow` | `POST /evidence/upload` multipart → status 201, `image_url` 채워짐, status=`needs_review` (자동 확정 X) |
| REQ_APP_007 | 재촬영 필요 증빙 확인 | `test_l4_compliance.py::test_l4_retake_required_triggers_notification` | `PATCH /evidence/{id} {status:retake_required}` → notification +1 (content_cd=RETAKE) |
| REQ_APP_008 | 알림 목록/읽음 처리 | (수동 — endpoint 동작은 시연 시 확인) | 수동 |
| REQ_APP_009 | 도우미 관계 승인 | `test_l3_e2e_extra.py::test_l3_e2e_4_helper_pair_assign_list_revoke` (이장 PoV) | `POST /admin/farm-helpers` → `farm_helper` row +1, `real_end_date` IS NULL |
| REQ_APP_011 | 영농일지 목록 조회 | `test_l1_smoke.py` 와 e2e diary 흐름이 함께 보장 | `GET /diary?farmer_id=ys.kim` → status 200, list |
| REQ_APP_013 | 일지 상세 조회 + 연결 증빙 | `test_l3_e2e.py::test_l3_e2e_2_farmer_diary_visible_to_chief_and_delete` | `GET /diary/{id}` → status 200, `work_detail` 정확 |
| REQ_APP_014 | 영농일지 직접 작성/저장 | 동일 (e2e diary 흐름) | 동일 |
| REQ_APP_015 | 대화형 영농일지 작성 (음성) | `test_l3_e2e_extra.py::test_l3_e2e_5_voice_session_start` + `5b_voice_session_finalize` | start 응답에 `session_id` + finalize 후 status=`ready_to_save` + `journal` INSERT 0 |
| REQ_APP_015 | (보호) AI 5종 fallback | `test_l5_ai_fallback.py` (11 tests) | OPENAI_API_KEY 빈값 / 호출 실패 mock 시 각 모듈이 `source="fallback"` 반환 |
| REQ_APP_019 | 사업 PDF 다운로드 | `test_l4_compliance.py::test_l4_report_pdf_endpoint_returns_pdf_bytes` | `GET /reports/project-pdf` → content-type `application/pdf`, body 가 `%PDF-` 시작, 1KB 이상 |
| REQ_APP_021 | 사진/증빙 업로드 (워터마크 포함) | `test_l4_compliance.py::test_l4_watermark_*` (7 tests) | EXIF 추출 정확, 워터마크 텍스트 규칙(농가명·촬영시각 항상, GPS(0,0) 표시 X), 결과 JPEG 헤더 + 픽셀 변경 |

### 1.2 이장 대시보드 + 관리자 (WEB) — 마을 운영

| 요구사항 ID | 기능명 | 검증 테스트 | PASS 조건 |
|---|---|---|---|
| REQ_WEB_001 | 마을 현황 요약 조회 | `test_l1_smoke.py::test_l1_3_chief_dashboard_summary_present` | `GET /admin/summary` → status 200, `total_farmers ≥ 1`, `diaries_by_farmer`/`recent_diaries`/`recent_evidence` 3 키 list 형태 |
| REQ_WEB_005 | 검토 필요 증빙 처리 / 재촬영 요청 | `test_l4_compliance.py::test_l4_retake_required_triggers_notification` | `PATCH /evidence/{id} {status:retake_required, user_message}` → status 200, 농민 user_no 의 `notification` +1 (sender_cd=C, content_cd=RETAKE) |
| REQ_WEB_010 | 주민 추가 | (현재 자동 미적용) | 수동 |
| REQ_WEB_020 | 증빙 상태 변경 | `test_l3_e2e.py::test_l3_e2e_1_farmer_evidence_visible_to_chief_and_confirm` | `PATCH /evidence/{id} {status:confirmed}` → status 200, 단건 GET 에 confirmed 반영 |
| REQ_WEB_022 | 도움 관계 조회 | `test_l3_e2e_extra.py::test_l3_e2e_4_helper_pair_assign_list_revoke` 안에 포함 | `GET /admin/farm-helpers?ville_id=LOCAVILLE01` → 방금 배정 페어 포함 |
| REQ_WEB_023 | 도우미 새로 지정 | 동일 | `POST /admin/farm-helpers` → 201 + `help_seq` 발급 |
| REQ_WEB_024 | 도우미 관계 해제 | 동일 | `DELETE /admin/farm-helpers/{helper}/{seq}` → 200, `real_end_date` NOT NULL |
| REQ_WEB_031 | 프로젝트 목록 조회 | `test_l1_smoke.py::test_l1_4_seed_project_catalog_contains_demo` | `GET /project` → 시드 `KK26A001` 포함 |
| REQ_WEB_032 | 신규 프로젝트 화면 (사업 등록) | `test_l1_smoke.py::test_l1_5_create_project_minimal_roundtrip` + `test_l3_e2e.py::test_l3_e2e_3_project_activity_job_chain` | `POST /project {prj_name}` → 새 `PRJ_xxx`/`BIZ_xxx` 발급, `GET /project/{id}` 단건 응답 정확, cleanup SQL 후 잔여 0 |
| REQ_WEB_033 | 프로젝트 기본정보 수정 | (현재 자동 미적용 — `PATCH /project/{id}`) | 수동 |
| REQ_WEB_034 | 활동 등록/수정 | `test_l3_e2e.py::test_l3_e2e_3_project_activity_job_chain` | `POST /project/{id}/activities` → 201, detail 의 `activity_count ≥ 1` |
| REQ_WEB_036 | 시행령 자동 청킹·인덱싱 + 사업 메타 자동 추출 | (수동 e2e — 실 시행령 파일 업로드 필요) | 수동. 단위 검증으로 청크 helper 동작 확인 |
| REQ_WEB_037 | 시행령 todo 초안 자동 생성 + 규칙 편집 | 동일 (수동 e2e) | 수동. `ProjectTodoDraftRule` 의 한국어 키 매핑 회귀 보호는 frontend typecheck 로 강제 |

### 1.3 공통 (COMMON)

| 요구사항 ID | 기능명 | 검증 테스트 | PASS 조건 |
|---|---|---|---|
| REQ_COMMON_005 | 도움말 챗봇 열기/닫기 | `test_l5_ai_fallback.py::test_l5_chat_rag_zero_hit_returns_fallback_source` | RAG 검색 0 hit → `source_type="fallback"`, answer 비지 않음 (안내 톤) |

### 1.4 비기능 / 횡단 (요구사항 ID 가 아닌 시스템 전체 invariant)

| 영역 | 검증 테스트 | PASS 조건 | 근거 |
|---|---|---|---|
| AI 영수증 자동 분류 false positive | `test_l2_invariants.py::test_l2_receipt_*` (6 tests) | "탄소"·"숯"·"토양개량제" 단어 → BIOCHAR 자동 분류 안 함. 단일 매칭 → confidence ≤ 0.5 + evidence_type 빈 값 | REQ_APP_006 보호 (AI advisory only) |
| Vision schema 자동 확정 차단 | `test_l2_invariants.py::test_l2_vision_schema_default_requires_confirmation` | `AIVisionEvidenceLabelResponse.needs_confirmation` 기본값 True | REQ_APP_006 보호 |
| farmer_id 단일성 | `test_l2_invariants.py::test_l2_no_hardcoded_group_no_or_amo_regno_in_frontend` | frontend ts/tsx 에 `group_no=숫자` / `amo_regno='AMOJT'` 하드코딩 없음 (주석·데모 파일 제외) | AGENTS.md §5 |
| Secrets backend-only | `test_l2_invariants.py::test_l2_no_forbidden_secrets_in_frontend_env` | frontend `.env*` 에 `NEXT_PUBLIC_OPENAI/DATABASE/KAKAO_REST/...` 없음 | AGENTS.md §5 |
| evidence 시간 위조 차단 | `test_l4_compliance.py::test_l4_capture_dt_le_reg_dt_invariant_for_past_photos` | `capture_dt > reg_dt AND capture_dt <= NOW()` 인 evidence row 0 | REQ_APP_021 도메인 본질 |
| GPS-농지 거리 | `test_l4_compliance.py::test_l4_seed_evidence_gps_within_parcel_radius` (현재 xfail) | evidence GPS 와 같은 농가 parcel GPS 거리 ≤ 2km | REQ_APP_021 도메인 본질. 시드 parcel 정리 후 활성화 |
| 시니어 가독성 (CSS 정적) | `test_l6_senior_ux.py` (11 tests) | 농민 앱 baseline ≥17px, 이장 ≥15px, 큰 글자 모드 정의, `.btn-lg` font ≥17px, `--bg`+`--ink` 토큰 존재 | AGENTS.md §5 (시니어 UI) |
| 시니어 가독성 (실 렌더) | `web_user/tests-e2e/l6_senior_ux.spec.ts` (4 sample, Playwright skeleton) | body 폰트, 큰 글자 toggle 후 증가, 버튼 높이, 색대비 WCAG AA ≥4.5:1 | 동일 |
| 응답 속도 (보류) | `test_l7_performance.py` (`L7_RUN=1` 시 실행) | endpoint warm latency, payload, pgvector retrieve, PDF 생성 | Render starter plan 으로 cold start 해소 |

---

## 2. 테스트 → 요구사항 (역방향)

각 테스트 파일이 어떤 요구사항을 다루는지. 매 PR 시 어느 요구사항 회귀가 보호되는지 확인용.

| 테스트 파일 | 다루는 요구사항 |
|---|---|
| `test_l1_smoke.py` | REQ_APP_003, REQ_WEB_001, REQ_WEB_031, **REQ_WEB_032** |
| `test_l2_invariants.py` | REQ_APP_003 (보호), REQ_APP_006 (AI advisory 보호), AGENTS.md §5 (farmer_id 단일성·Secrets) |
| `test_l3_e2e.py` | REQ_APP_005, REQ_APP_006, REQ_APP_013, REQ_APP_014, REQ_WEB_020, REQ_WEB_032, REQ_WEB_034 |
| `test_l3_e2e_extra.py` | REQ_APP_009, REQ_APP_015, REQ_APP_021, REQ_WEB_022, REQ_WEB_023, REQ_WEB_024 |
| `test_l4_compliance.py` | REQ_APP_019, REQ_APP_021, REQ_WEB_005 |
| `test_l5_ai_fallback.py` | REQ_APP_015 (보호), REQ_COMMON_005 |
| `test_l6_senior_ux.py` | AGENTS.md §5 (시니어 가독성 가이드) — 공통 요구사항 |
| `test_l7_performance.py` | (보류 — `L7_RUN=1` 시) |

---

## 3. 검증 커버리지 요약 (2026-06-05 기준)

요구사항 표 총 67건 (5건 갱신 + 2건 신규 포함). 자동 회귀 보호:

| 카테고리 | 자동 검증 직접 매핑 | 자동 검증 간접 보호 (invariant) | 수동/시연 검증 | 미적용 |
|---|---|---|---|---|
| 농민 앱 (REQ_APP_*) | 7건 | 11건 | 4건 | 2건 |
| 이장·관리자 (REQ_WEB_*) | 7건 | 0건 | 22건 | 8건 |
| 공통 (REQ_COMMON_*) | 1건 | 5건 | 0건 | 0건 |
| **합계** | **15건** | **16건** | **26건** | **10건** |

S1 (최우선) 요구사항은 100% 자동 검증 또는 횡단 invariant 보호 안에 들어가도록 정렬됐습니다. S4 (화면만 구현) 요구사항은 자동 검증 대상에서 제외됩니다.

---

## 4. 매핑 갱신 운영 규칙

- **요구사항 추가 시**: 엑셀에 새 REQ_ID 박은 후, 본 문서의 §1 표에 해당 행을 추가하고 테스트 위치를 명시. 테스트가 없으면 "수동" 또는 "(예정)" 라벨.
- **새 테스트 추가 시**: 본 문서의 §2 표에 어떤 REQ 를 다루는지 추가.
- **요구사항 우선순위/개발여부 변경 시**: 엑셀 + 본 문서의 §3 카운트 둘 다 갱신.

본 문서가 정확해야 평가자가 "어떤 요구사항이 어떻게 검증되었나" 를 단번에 확인할 수 있습니다.
