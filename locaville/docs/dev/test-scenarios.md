# 저탄마을 테스트 시나리오

[요구사항 표](./0602_저탄마을_요구사항정의서_latest_screen_based_star.xlsx) 의 각 항목에 대응하는 테스트 시나리오. 요구사항↔테스트 양방향 매핑은 [test-requirement-mapping.md](./test-requirement-mapping.md), 시점별 실행 결과는 [test-results/](./test-results/).

---

## 1. 읽는 순서

- 평가·심사: §2 → §3.1 → §6
- 신규 개발자 인수: §4 의 담당 영역 (농민 앱 / 이장 / 관리자)
- QA: §5 운영 명령

---

## 2. 테스트 설계의 출발점

저탄마을은 정부 저탄소 농축산물 인증 사업의 영농일지·증빙 사진·이장 검토·정부 제출 PDF 흐름을 모바일과 웹으로 묶은 서비스입니다. 사용자는 셋입니다 — **농민**(폰으로 사진과 음성으로 기록), **이장**(마을 단위 검토와 재촬영 요청), **관리자**(시행령 읽고 사업 등록).

테스트는 이 셋이 같은 데이터를 일관되게 보고 정부 제출 자료가 도메인 규정에 맞게 만들어지는 것을 보호합니다. 짤 때 지킨 원칙 셋:

1. **요구사항 기준** — 모든 테스트는 [요구사항 표](./0602_저탄마을_요구사항정의서_latest_screen_based_star.xlsx) 의 한 항목 (REQ_APP_*, REQ_WEB_*, REQ_COMMON_*) 또는 횡단 invariant (AGENTS.md §5 의 5대 원칙) 를 검증한다.
2. **PASS/FAIL 의 정량성** — HTTP status, response body 키, DB row 증감, 정규식 매칭처럼 다시 측정 가능한 조건만 쓴다.
3. **시드 데이터에 흔적 X** — 매 라운드 끝나면 만든 데이터를 다시 정리해, 매일 시연 직전 돌릴 수 있게 한다.

검증 영역의 이름은 "농민 앱 핵심 경로", "정부 제출 자료 정확성" 처럼 도메인 의미가 드러나는 한국어로 표기한다.

---

## 3. 테스트 시나리오 한눈에

### 3.1 어떤 검증 영역이 있는가

| 검증 영역 | 무엇을 보호하는가 | 대응 요구사항 카테고리 | 자동 비율 | 매 시연 / 매 PR / 정기 |
|---|---|---|---|---|
| 농민 앱 핵심 경로 | 홈·일지·사진·음성·사업 화면이 빈 카드 없이 동작 | REQ_APP_003 / 005 / 006 / 013 / 014 / 019 / 021 | 자동 | 매 시연, 매 commit |
| 이장 대시보드와 마을 운영 | 마을 현황·증빙 검토·재촬영 요청·도우미 페어가 정상 | REQ_WEB_001 / 005 / 020 / 022–024 | 자동 | 매 commit |
| 관리자 사업 생애주기 | 사업 등록 → 활동·Job 등록 → 시행령 자동 청킹·todo 초안 | REQ_WEB_031 / 032 / 034 / 036 / 037 | 자동 + 일부 수동 | 새 기능 머지 후 |
| 데이터·보안 원칙 (AGENTS.md §5) | AI 가 todo 만들지 않음, evidence type 자동 확정 X, farmer_id 단일성, Secrets 분리, 음성 자동 저장 X | 전체 횡단 | 자동 | 매 PR, 매 배포 |
| 정부 인증 컴플라이언스 | 워터마크·EXIF·시간 순서·GPS-농지 거리·PDF 리포트 | REQ_APP_019 / 021, REQ_WEB_005 도메인 본질 | 자동 80% + 수동 20% | 시연 리허설, 정기 |
| AI 모듈 안전망 | 음성/사진/RAG/advice 가 OpenAI 가 꺼져도 graceful | REQ_APP_015 보호, REQ_COMMON_005 | 자동 | 매 배포 전 |
| 시니어 가독성 | 60–80대 농민이 화면을 어렵지 않게 쓰는지 | 전체 횡단 (AGENTS.md §5) | 자동 50% + 수동 50% | 분기별, 시연 리허설 |
| 응답 속도 | endpoint latency·payload·pgvector 검색 | 전체 | 보류 (Render starter plan) | `L7_RUN=1` 시 |

### 3.2 테스트 파일 분포

| 파일 | 검증 영역 | 테스트 수 (스프린트 4 종료 기준) |
|---|---|---|
| [tests/test_l1_smoke.py](../../backend/tests/test_l1_smoke.py) | 농민 앱·이장·관리자 핵심 경로 작동 | 6 |
| [tests/test_l2_invariants.py](../../backend/tests/test_l2_invariants.py) | 데이터·보안 원칙 (AGENTS.md §5) | 10 |
| [tests/test_l3_e2e.py](../../backend/tests/test_l3_e2e.py) | 3-앱 데이터 일관성 e2e (사업 생애주기 포함) | 3 |
| [tests/test_l3_e2e_extra.py](../../backend/tests/test_l3_e2e_extra.py) | 도우미 모드 + 음성 흐름 + 사진 multipart | 4 |
| [tests/test_l4_compliance.py](../../backend/tests/test_l4_compliance.py) | 정부 인증 컴플라이언스 (워터마크/EXIF/GPS/PDF/재촬영) | 17 (+1 xfail) |
| [tests/test_l5_ai_fallback.py](../../backend/tests/test_l5_ai_fallback.py) | AI 모듈 5종 graceful degradation | 11 |
| [tests/test_l6_senior_ux.py](../../backend/tests/test_l6_senior_ux.py) | 시니어 가독성 (CSS 정적 분석) | 11 |
| [web_user/tests-e2e/l6_senior_ux.spec.ts](../../web_user/tests-e2e/l6_senior_ux.spec.ts) | 시니어 가독성 (Playwright 실 렌더 — install 보류) | 4 sample |
| [tests/test_l7_performance.py](../../backend/tests/test_l7_performance.py) | 응답 속도 (보류) | 9 |

> 파일명 prefix 가 `test_l1_` ~ `test_l7_` 로 되어 있지만, 본 문서에서는 의미가 드러나는 검증 영역 이름으로 부릅니다. 파일명은 과거 호환을 위해 그대로 둡니다.

---

## 4. 도메인별 검증 시나리오

각 시나리오는 다음 4종 정보로 구성됩니다.

- **무엇을 보장하는가** — 도메인 가치
- **대응 요구사항** — 정의서 ID
- **PASS 조건** — HTTP/DB/응답 키 수준의 정량 조건
- **FAIL 트리거** — 어떤 상황에서 실패가 떨어지는지

### 4.1 농민 앱 핵심 경로

#### 4.1.1 홈 화면이 빈 카드 없이 보이는가

| 항목 | 내용 |
|---|---|
| 보장 | 농민이 앱을 처음 켰을 때 오늘 할 일 카드가 비어 있지 않다 |
| 대응 요구사항 | REQ_APP_003 |
| PASS 조건 | `GET /todo/today?farmer_id=ys.kim` → status 200 + body 의 todo 개수 ≥ 1 |
| FAIL 트리거 | status 4xx/5xx, 또는 응답이 빈 list (시드 누락 시) |
| 테스트 | `test_l1_smoke.py::test_l1_2_demo_farmer_today_todo_present` |

#### 4.1.2 농민이 사진 1장을 올리면 이장 화면에 즉시 보이는가

| 항목 | 내용 |
|---|---|
| 보장 | 3-앱 데이터 일관성. 사진 multipart 업로드 → 워터마크 합성 → DB 저장 → 이장 대시보드 노출이 한 흐름으로 끝남 |
| 대응 요구사항 | REQ_APP_006, REQ_APP_021 |
| PASS 조건 | `POST /evidence/upload` (multipart, .jpg) → status 201 + `evidence_id` 발급 + `image_url` 채워짐 + `status="needs_review"` (자동 확정 X) + `GET /admin/summary.recent_evidence` 에 evidence_id 포함 |
| FAIL 트리거 | status≠201, image_url 빈 값, status가 confirmed 로 자동 확정, recent_evidence list 에 누락 |
| cleanup | `DELETE /admin/evidence/{id}` (soft delete) — 시드 흔적 0 보장 |
| 테스트 | `test_l3_e2e_extra.py::test_l3_e2e_6_evidence_upload_multipart_full_flow` |

#### 4.1.3 음성으로 일지를 적어도 사용자 확인 없이 저장되지 않는가

| 항목 | 내용 |
|---|---|
| 보장 | AGENTS.md §5 "자동 저장 금지". 음성 세션을 시작·진행·종료까지 가도 DB 에 일지 row 가 안 생긴다 |
| 대응 요구사항 | REQ_APP_015 |
| PASS 조건 | `POST /ai/voice/session/start {farmer_id}` → status 200 + `session_id` 발급, `POST .../finalize` → status 200 + `status="ready_to_save"` + `manual_input.input_type_cd="VOICE"`, **journal 테이블 row 증가 0건** |
| FAIL 트리거 | journal 증가 ≥1 (자동 저장), 또는 finalize status가 ready_to_save 아님 |
| 테스트 | `test_l3_e2e_extra.py::test_l3_e2e_5_voice_session_start_response_shape` + `_5b_voice_session_finalize_does_not_auto_save` |

#### 4.1.4 사업 PDF 리포트가 정부 제출 가능한 형식으로 만들어지는가

| 항목 | 내용 |
|---|---|
| 보장 | 농민 앱·관리자 화면에서 다운로드하는 PDF 가 깨지지 않은 PDF 파일이고 본문이 충분하다 |
| 대응 요구사항 | REQ_APP_019 |
| PASS 조건 | `GET /reports/project-pdf?farmer_id=ys.kim&prj_id=KK26A001` → status 200 + content-type `application/pdf` + body 가 `%PDF-` 4바이트로 시작 + body length ≥ 1024 |
| FAIL 트리거 | content-type이 PDF 아님 (HTML 에러 페이지 등), 헤더 누락, 크기 1KB 미만 |
| 테스트 | `test_l4_compliance.py::test_l4_report_pdf_endpoint_returns_pdf_bytes` |

### 4.2 이장 대시보드와 마을 운영

#### 4.2.1 마을 현황이 빈 화면 없이 보이는가

| 항목 | 내용 |
|---|---|
| 보장 | 이장 첫 화면이 농가/일지/증빙 카운트와 최근 항목을 정상 응답 |
| 대응 요구사항 | REQ_WEB_001 |
| PASS 조건 | `GET /admin/summary` → status 200 + `total_farmers ≥ 1` + `diaries_by_farmer`/`recent_diaries`/`recent_evidence` 3 키가 list 형태 |
| FAIL 트리거 | 키 누락, total_farmers 0 (시드 매핑 깨짐), 한 키라도 list 아님 |
| 테스트 | `test_l1_smoke.py::test_l1_3_chief_dashboard_summary_present` |

#### 4.2.2 이장이 "다시 찍어주세요" 요청하면 농민에게 알림이 가는가

| 항목 | 내용 |
|---|---|
| 보장 | 재촬영 흐름이 양방향. status 변경만 일어나지 않고 농민 화면에 알림이 자동으로 들어간다 |
| 대응 요구사항 | REQ_WEB_005, REQ_APP_007 |
| PASS 조건 | `PATCH /evidence/{id} {status:"retake_required", user_message:"..."}` → status 200 + `response.status="retake_required"` + DB `notification` 테이블에 농민 user_no 의 row +1건 (`content_cd="RETAKE"`, `sender_cd="C"`) + 최근 알림 title 에 "사진" 또는 "다시" 포함 |
| FAIL 트리거 | notification +0 (알림 미발송), title/sender_cd 다름, 또는 PATCH 자체 실패 |
| cleanup | `DELETE /admin/evidence/{id}` + 자동 발송 notification SQL 정리 |
| 테스트 | `test_l4_compliance.py::test_l4_retake_required_triggers_notification` |

#### 4.2.3 도우미 페어가 정상 배정·해제되는가

| 항목 | 내용 |
|---|---|
| 보장 | 한 농가가 다른 농가 todo 를 대행하는 페어 관계가 양쪽 동의 흐름 안에서 만들어진다 |
| 대응 요구사항 | REQ_WEB_022, REQ_WEB_023, REQ_WEB_024 |
| PASS 조건 | `POST /admin/farm-helpers {helper, recipient, est_end_date}` → status 201 + `help_seq` 발급 + `GET /admin/farm-helpers?ville_id=LOCAVILLE01` list 에 페어 포함 + `DELETE /admin/farm-helpers/{helper}/{seq}` → 200 + DB `real_end_date` NOT NULL |
| FAIL 트리거 | help_seq 미발급, list 누락, DELETE 후에도 real_end_date NULL |
| cleanup | farm_helper row + 양쪽에 자동 발송된 HELPER_REQUEST/HELPER_END 알림 정리 |
| 테스트 | `test_l3_e2e_extra.py::test_l3_e2e_4_helper_pair_assign_list_revoke` |

### 4.3 관리자 사업 생애주기

#### 4.3.1 사업 신규 등록이 한 번에 트랜잭션으로 들어가는가

| 항목 | 내용 |
|---|---|
| 보장 | 스프린트 4에서 새로 만든 `POST /project` 가 program_master + project 두 row 를 한 transaction 으로 만들고, 실패 시 rollback |
| 대응 요구사항 | REQ_WEB_032 |
| PASS 조건 | `POST /project {prj_name}` → status 200 + 응답 `prj_id` 가 `PRJ` 로 시작 + `biz_id` 가 `BIZ` 로 시작 + `GET /project/{prj_id}` 단건 응답의 `prj_name` 정확 |
| FAIL 트리거 | prj_id/biz_id 형식 다름, 단건 GET 실패, 또는 빈 prj_name 으로 호출 시 400 거절 안 함 |
| cleanup | SQL 직접 — `DELETE FROM project / program_master WHERE ...` |
| 테스트 | `test_l1_smoke.py::test_l1_5_create_project_minimal_roundtrip` + `test_l3_e2e.py::test_l3_e2e_3_project_activity_job_chain` (사업→활동→Job 한 묶음) |

#### 4.3.2 시행령 파일을 올리면 사업 메타와 todo 초안이 자동으로 채워지는가

| 항목 | 내용 |
|---|---|
| 보장 | 정부 시행령 PDF/DOCX/HWPX 를 업로드하면 backend 가 청크 + pgvector 영구 적재 + LLM 메타·todo 추출까지 한 endpoint 로 끝낸다 |
| 대응 요구사항 | REQ_WEB_036, REQ_WEB_037 |
| PASS 조건 | `POST /project/draft-from-document` (multipart, .hwpx) → status 200 + 응답에 `ingest`/`project_draft`/`todo_drafts`/`preview_blocks` 4 키 + ingest 의 청크 수 ≥ 1 + project_draft 의 최소 3 필드 채워짐 (LLM 추출이 100% 아니므로 3 필드 기준) + todo_drafts 의 작업명 1개 이상 |
| FAIL 트리거 | endpoint 자체 실패, 청크 0, 메타 모두 빈 값 (LLM 호출 자체가 실패) |
| 현재 상태 | 단위 검증 (청크 helper / LLM 출력 파싱) 완료. **실 시행령 파일 e2e 는 수동** (다양한 시행령 포맷 의존). 단위로는 통과 |
| 테스트 | `test_l1_smoke.py` 의 `test_l1_5_create_project_minimal_roundtrip` 이 빈 사업 등록만 보장하고, 실 시행령 자동 e2e 는 다음 라운드 추가 |

### 4.4 데이터·보안 원칙 (AGENTS.md §5)

서비스 시작부터 정한 5대 원칙. 한 번이라도 깨지면 정부 감사·컴플라이언스·보안 문제로 직결.

#### 4.4.1 오늘 할 일은 항상 데이터베이스에서 온다 (AI 가 만들지 않음)

| 항목 | 내용 |
|---|---|
| 보장 | `prj_todo_list` 가 todo 의 유일한 source. AI fallback 으로 채워지면 안 됨 |
| 대응 요구사항 | REQ_APP_003 보호 |
| PASS 조건 | `GET /todo/today?farmer_id=nonexistent_user_99999` → status 200 + body == [] |
| FAIL 트리거 | 빈 list 가 아닌 응답이 옴 (AI 가 가짜로 채움 의심) |
| 테스트 | `test_l2_invariants.py::test_l2_todo_today_unknown_farmer_no_ai_fallback` |

#### 4.4.2 음성 영농기록은 사용자 확인 없이 저장되지 않는다

§4.1.3 과 동일.

#### 4.4.3 사진의 evidence_type 은 AI 가 자동으로 확정하지 않는다

| 항목 | 내용 |
|---|---|
| 보장 | Vision 응답 schema 의 `needs_confirmation` 기본값이 True 로 강제. 영수증 단어 매칭으로 자동 확정하지도 않음 (BIOCHAR false positive 회귀 보호 6 케이스) |
| 대응 요구사항 | REQ_APP_006 보호 |
| PASS 조건 | `AIVisionEvidenceLabelResponse(suggested_label=..., user_message=...)` 로 만든 instance 의 `needs_confirmation` 가 True / 영수증 입력 `{vendor:"농협", items:["저탄소 인증 비료"]}` → `suggested_activity_type` 빈 값 (탄소 단어가 BIOCHAR 트리거 안 함) |
| FAIL 트리거 | needs_confirmation default 가 False / 광범위 단어("탄소"/"숯"/"토양개량제")만으로 BIOCHAR 매칭 / 단일 키워드 매칭이 confidence > 0.5 |
| 테스트 | `test_l2_invariants.py` 의 `test_l2_vision_schema_default_requires_confirmation` + 영수증 7 케이스 |

#### 4.4.4 농민 식별자는 farmer_id 하나만 노출된다

| 항목 | 내용 |
|---|---|
| 보장 | frontend ts/tsx 에 `group_no=숫자` 또는 `amo_regno='AMOJT'` 가 하드코딩되지 않음 (주석·데모 시드 파일은 예외 화이트리스트) |
| 대응 요구사항 | 전체 횡단 (AGENTS.md §5) |
| PASS 조건 | `app_user`, `web_user`, `web_admin` 의 .ts/.tsx 파일에서 위 패턴 매칭 0건 |
| FAIL 트리거 | 매칭 ≥ 1 (화이트리스트 외 파일에 하드코딩) |
| 테스트 | `test_l2_invariants.py::test_l2_no_hardcoded_group_no_or_amo_regno_in_frontend` |

#### 4.4.5 민감한 키는 backend `.env` 에만 있다

| 항목 | 내용 |
|---|---|
| 보장 | frontend `.env*` 파일에 `NEXT_PUBLIC_OPENAI_*` / `_DATABASE` / `_KAKAO_REST` 같은 backend 전용 키가 노출되지 않음 |
| 대응 요구사항 | 전체 횡단 |
| PASS 조건 | `app_user/.env*`, `web_user/.env*`, `web_admin/.env*` 에 정규식 매칭 0건 |
| FAIL 트리거 | 매칭 ≥ 1 |
| 테스트 | `test_l2_invariants.py::test_l2_no_forbidden_secrets_in_frontend_env` |

### 4.5 정부 인증 컴플라이언스

평가관·감사관이 보는 핵심 영역. 자동 17건 + xfail 1건.

#### 4.5.1 EXIF 시각 추출이 정확한가

| 항목 | 내용 |
|---|---|
| 보장 | 갤러리에서 1주 전 사진을 올려도 워터마크에 실 촬영 시각 (EXIF DateTimeOriginal) 이 박힌다. EXIF 없는 사진도 silent fallback 으로 시스템을 막지 않음 |
| 대응 요구사항 | REQ_APP_021 도메인 본질 |
| PASS 조건 | EXIF 0x9003 박힌 사진 → 시각 정확 추출 / EXIF 0x0132 만 있으면 그것을 fallback / EXIF 없는 JPEG → None 반환 / 깨진 bytes → 예외 없이 None |
| FAIL 트리거 | EXIF 있는데 None 반환, 또는 예외 raise (upload 흐름 차단) |
| 테스트 | `test_l4_compliance.py::test_l4_exif_*` (4 tests) |

#### 4.5.2 워터마크 텍스트 규칙이 지켜지는가

| 항목 | 내용 |
|---|---|
| 보장 | 농가명·촬영시각 줄이 항상 포함. GPS (0, 0) 인 경우 위치 줄을 그리지 않음 (가짜 좌표 노출 방지). 실 좌표는 소수점 5자리로 정확히 표시 |
| 대응 요구사항 | REQ_APP_021 도메인 본질 |
| PASS 조건 | `_watermark_lines(farmer_name="김영수", captured_at=..., gps_lat=...)` 결과의 줄 list 에 "농업인" + "김영수", "촬영시각" + 날짜 포함. GPS (0,0) 인 경우 "위치" 줄 없음. GPS (37.56500, 127.12300) 인 경우 줄에 그 좌표 포함 |
| FAIL 트리거 | 농가명 누락, 시각 누락, GPS (0,0) 인데 위치 줄 표시, 실 좌표 포맷 깨짐 |
| 테스트 | `test_l4_compliance.py::test_l4_watermark_*` (5 tests) |

#### 4.5.3 워터마크 합성 후 이미지가 정상 JPEG 인가

| 항목 | 내용 |
|---|---|
| 보장 | Pillow 가 만든 결과가 깨진 bytes 가 아니다 |
| 대응 요구사항 | REQ_APP_021 도메인 본질 |
| PASS 조건 | `_save_watermarked_image(...)` 출력 BytesIO 가 JPEG 헤더 (`\xff\xd8\xff`) 로 시작 + 1KB 이상 + 원본 대비 픽셀이 변경됨 (워터마크 실제 그려짐) |
| FAIL 트리거 | 헤더 깨짐, 결과 크기 비정상, 또는 원본과 동일 (워터마크 미적용) |
| 테스트 | `test_l4_compliance.py::test_l4_watermark_save_produces_valid_jpeg_with_pixel_changes` |

#### 4.5.4 사진 시각 위조가 차단되는가

| 항목 | 내용 |
|---|---|
| 보장 | 이미 지난 시각의 사진인데 `capture_dt` 가 `reg_dt` 보다 미래로 박힌 경우는 위조 의심. 단, 시드의 의도된 미래 일정 placeholder (`capture_dt > NOW()`) 는 정상 데이터로 인정 |
| 대응 요구사항 | REQ_APP_021 도메인 본질 |
| PASS 조건 | `SELECT COUNT(*) FROM evidence WHERE deleted_dt IS NULL AND capture_dt > reg_dt AND capture_dt <= NOW()` = 0 |
| FAIL 트리거 | 1건이라도 발견 시 (위조 의심) |
| 테스트 | `test_l4_compliance.py::test_l4_capture_dt_le_reg_dt_invariant_for_past_photos` |

#### 4.5.5 사진 GPS 가 농가 농지와 합리적 거리 안에 있는가 (현재 보류)

| 항목 | 내용 |
|---|---|
| 보장 | evidence GPS 와 같은 농가 parcel 의 GPS 거리가 2km 이내 |
| 대응 요구사항 | REQ_APP_021 도메인 본질 |
| PASS 조건 | 모든 매칭 evidence-parcel 쌍에 대해 Haversine 거리 ≤ 2000m |
| 현재 상태 | **xfail** (알려진 시드 이슈) — 시드 김영수 parcel 좌표가 서울 종로 (37.527, 127.004) 인데 evidence GPS 는 농지 실좌표. 시드 parcel 정리 후 자동 활성화 |
| 테스트 | `test_l4_compliance.py::test_l4_seed_evidence_gps_within_parcel_radius` (xfail 마커) |

#### 4.5.6 재촬영 요청 시 자동 알림이 가는가

§4.2.2 와 동일.

### 4.6 AI 모듈 안전망

OpenAI 가 멈춰도 화면이 살아있어야 한다. 5개 모듈 모두 fallback 검증.

| 모듈 | 1차 | fallback | PASS 조건 | 테스트 |
|---|---|---|---|---|
| 사진 분류 (Vision) | OpenAI Vision | `classification="unknown"` + `source="fallback"` 안전 반환 | `OPENAI_API_KEY` 빈값 + `_load_env_file_if_needed` mock 후 `classify_and_extract_evidence(file_bytes, extension)` 호출 → 위 dict 반환 | `test_l5_ai_fallback.py::test_l5_vision_*` (2) |
| 음성 인식 (STT) | OpenAI Whisper | `AISTTResponse(text="", source="fallback", error_message=...)` | key 빈값 + 호출 실패 mock 두 케이스 모두 fallback 응답 | `test_l5_ai_fallback.py::test_l5_stt_*` (2) |
| 음성 합성 (TTS) | OpenAI gpt-4o-mini-tts | `(b"", "fallback")` 또는 `AITTSResponse(source="fallback")`. **단 빈 텍스트는 silent fallback X — 명확한 400 raise** | key 빈값, 호출 실패, 빈 입력 세 케이스 다 의도대로 | `test_l5_ai_fallback.py::test_l5_tts_*` (4) |
| 정책 문서 Q&A (RAG) | pgvector + LLM | `source_type="fallback"` + 안내 톤 (사실 단언 X) | RAG 검색 0 hit mock + key 빈값 → 응답 source_type=fallback, answer 비지 않음 | `test_l5_ai_fallback.py::test_l5_chat_rag_zero_hit_returns_fallback_source` |
| 오늘 한마디 (advice) | LLM 표현 변형 | `(fallback_template, "RULE")` — 룰 한 줄 그대로 | key 빈값 / SDK 호출 실패 두 케이스 모두 fallback_template 그대로 반환 + gen_cd="RULE" | `test_l5_ai_fallback.py::test_l5_advice_*` (2) |

### 4.7 시니어 가독성

농민 60–80대 대상이므로 두 갈래 검증.

#### 4.7.1 CSS 정적 분석 (backend pytest, 자동 11건)

| 항목 | PASS 조건 | 발견된 이슈 |
|---|---|---|
| 농민 앱 baseline 폰트 | `html { font-size }` ≥ 17px | 현재 17px ✓ |
| 이장 baseline | `body { font-size }` 또는 `var(--font-base)` 추적 ≥ 15px | 현재 19px ✓ |
| 관리자 baseline | 같은 방식 ≥ 14px | 현재 18px ✓ |
| 큰 글자 모드 정의 | `body[data-large-text]` 룰 존재 + baseline 보다 큰 폰트 | 농민 18/26px, 이장 18px ✓ |
| 버튼 시스템 | `.btn-sm/-md/-lg` 셋 다 정의 | 이장·관리자 모두 ✓ |
| `.btn-lg` 가독성 | font-size ≥ 17px | 19px ✓. **다만 실 렌더 높이 약 49px — 시연 폰 권장 56px 미달, 디자인 검토 권장** |
| 색 토큰 | `--bg` + `--text`/`--ink` 정의 | 3 앱 모두 ✓ |

테스트: `test_l6_senior_ux.py` (11 tests).

#### 4.7.2 Playwright 실 렌더 (frontend e2e, skeleton 4 sample)

| 항목 | PASS 조건 | 비고 |
|---|---|---|
| body 폰트 (실 픽셀) | computed font-size ≥ 15px | skeleton |
| 큰 글자 toggle 동작 | localStorage 적용 후 body 폰트 > baseline | skeleton |
| primary 버튼 실 높이 | offsetHeight ≥ 40px (시니어 권장 56px 까지 강화 예정) | skeleton |
| 색 대비 WCAG AA | computed color vs background 대비 ≥ 4.5:1 | skeleton |

위치: [`web_user/tests-e2e/l6_senior_ux.spec.ts`](../../web_user/tests-e2e/l6_senior_ux.spec.ts). **install 보류** (chromium ~150MB).

---

## 5. 운영 명령

| 시점 | 권장 검증 영역 | 명령 |
|---|---|---|
| 매 commit | 농민 앱 핵심 경로 + 데이터·보안 원칙 | `pytest tests/test_l1_smoke.py tests/test_l2_invariants.py -v` |
| 매 PR | + AI fallback + 시니어 가독성 (DB 무관) | `pytest tests/test_l1_smoke.py tests/test_l2_invariants.py tests/test_l5_ai_fallback.py tests/test_l6_senior_ux.py -v` |
| 매 머지 후 | 전체 (L7 제외) | `pytest tests/ -v` |
| 시연 직전 | 매 commit 명령 + 수동 폰 점검 | (위) |
| 분기별 | 전체 + L4·L6 수동 영역 (워터마크/PDF 시각 검토, 색대비, Playwright) | (위) + 수동 |
| 응답 지연 의심 시 | + L7 강제 | `L7_RUN=1 pytest tests/test_l7_performance.py -v` |

DB 환경변수 (`DB_URL` / `DATABASE_URL` / `DB_HOST`) 없는 환경에서는 DB-bound 테스트가 자동 skip 되고, DB-free 테스트만 실행됩니다 (CI 빠른 모드).

```powershell
cd C:\Users\Admin\good-vibe\locaville\backend
.\.venv\Scripts\python -m pytest tests/ -v
```

Playwright 활성화 시:
```powershell
cd C:\Users\Admin\good-vibe\locaville\web_user
pnpm install -D @playwright/test          # 1회만 (~150MB chromium 다운로드)
pnpm exec playwright install chromium
pnpm exec playwright test
```

---

## 6. 자동화 안 한 영역 (수동·시연 리허설)

투명성을 위해 적습니다.

- **PDF 시각 검토** — `%PDF-` 헤더와 본문 크기까지 자동입니다. 한글 폰트 정상 렌더, 사진 자연스러운 배치, 페이지 footer 는 사람이 직접 확인.
- **시연 폰 실 렌더** — Playwright device emulation 과 실 iPhone 14·Galaxy S22 의 렌더가 미세하게 다를 수 있어, 시연 직전 직접 폰으로 확인.
- **카메라 라이브 코칭 작동** — HTTPS Vercel 환경에서만 동작. LAN HTTP 시연은 file input 폴백.
- **시행령 자동 등록 e2e** — REQ_WEB_036/037 의 실 시행령 파일 (정부24/data.go.kr) 업로드는 다양한 포맷 의존이라 수동으로 시연 리허설에 포함.
- **GPS-농지 폴리곤 매칭** — 현재 Haversine 거리만 자동. 정확한 폴리곤 매칭은 PostGIS 도입 후 강화.
- **색약 시뮬레이션** — Chrome DevTools → Rendering → Emulate vision deficiencies 로 사람이 한 번 둘러봐야 잡힘.

---

## 7. 운영 원칙 (본 문서·매핑 표·엑셀의 동기화)

- **요구사항 추가 시** — 엑셀의 "요구사항정의서" + "Traceability" 두 sheet 에 동시 추가. 본 문서 §4 에 해당 시나리오 절을 추가하고, [매핑 표](./test-requirement-mapping.md) §1 에도 행 추가.
- **새 테스트 추가 시** — 매핑 표 §2 에 어떤 REQ 를 다루는지 추가. 본 문서 §3.2 의 카운트 갱신.
- **요구사항 우선순위·개발여부 변경 시** — 엑셀 + 매핑 표 §3 카운트 둘 다 갱신.
- **시점별 실행 결과** — [test-results/YYYY-MM-DD.md](./test-results/) 신규 파일. 본 문서는 갱신하지 않음 (정의서 역할 유지).

---

## 8. 관련 문서

- [`0602_저탄마을_요구사항정의서_latest_screen_based_star.xlsx`](./0602_저탄마을_요구사항정의서_latest_screen_based_star.xlsx) — 본 시나리오의 출발점
- [`test-requirement-mapping.md`](./test-requirement-mapping.md) — 요구사항 ↔ 테스트 양방향 매핑 표
- [`test-l6-playwright-guide.md`](./test-l6-playwright-guide.md) — Playwright setup + 추가 시나리오 작성 가이드
- [`test-results/`](./test-results/) — 시점별 실행 결과 스냅샷
- [`AGENTS.md`](../../../AGENTS.md) — 프로젝트 운영 원칙 (§5 의 5대 원칙은 본 문서 §4.4 의 근거)
- [`docs/demo/demo-runbook.md`](../demo/demo-runbook.md) — 시연 직전 체크리스트 (본 문서 §5 의 매 시연 명령과 함께 사용)
