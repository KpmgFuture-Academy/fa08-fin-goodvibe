# 다이어그램 추론·가정 목록

작성: 2026-06-12. 모든 다이어그램은 코드 기준으로 작성했고, 코드에서 직접 확인되지 않았거나 요청 프롬프트와 다르게 그린 부분만 아래에 기록한다.

## 요청 프롬프트와 다르게 그린 것 (코드가 우선)

- **라이브 코칭 루프는 3초가 아니라 2초** — `app_user/components/PhotoLiveCoachOverlay.tsx` 의 `POLL_INTERVAL_MS = 2000`, 변화 없으면 `MAX_POLL_INTERVAL_MS = 4000` 까지 적응 증가. (요청문의 "3초 루프" 는 구버전 값.)
- **todo_id 신 형식은 `{amo_regno}-{prj_id}-{activity_id}-{job_seq}`** — `backend/app/utils/todo_id.py` `build_todo_id()` 가 single source of truth. 요청문의 `group_no × prj_id × activity_id × job_seq` 는 `build_todo_id_legacy()` (구 형식, deprecate 예정). AGENTS.md §7 의 표도 구 형식 기준이라 코드와 불일치.
- **Vision 코칭 모델은 OpenAI 가 아니라 Gemini** — 라이브 폴링 `gemini-2.5-flash-lite`, 촬영후 판정 `gemini-2.5-flash` (`ai_service._get_coach_client_and_model`). OpenAI 는 영수증 OCR(`classify_and_extract_evidence`, gpt-4.1-mini)과 RAG 챗에 사용.
- **TTS 는 Google Cloud Chirp 3 HD Kore** (`ai_service.synthesize_speech_bytes`) — OpenAI TTS 는 제거됨.
- **STT 는 Returnzero `sommers` 기본** + OpenAI Whisper 폴백 (`STT_PROVIDER` env 분기).

## 코드에서 직접 확인 못 해 추론한 것

- **`ville_group` 테이블** — `engage_rdb.py` 의 `vg.group_name` JOIN alias 와 시드의 `group_no=100001 (저탄소농법선도반)` 으로 존재·구조를 추론. DDL 미확인.
- **ER 의 컬럼 타입** — repositories 의 INSERT/SELECT 와 시드 SQL 파라미터에서 추론 (int/string/date/json). 실제 DDL (VARCHAR 길이, NOT NULL 등) 미확인. 특히 `user_master` 의 `phone_no/zip_cd/addr/email/auth_key/passwd` 가 NOT NULL 인 것은 시드 실행 에러로 확인됨.
- **ER 의 `prj_journal → prj_todo_list` "완료 판정 근거" 관계** — FK 가 아니라 `computed_status` 계산 시 (prj_id, activity_id, job_seq) 매칭으로 판정하는 논리적 관계 (`todo_service.py`).
- **`journal ||--o{ evidence`** — 물리 FK 없음. `(user_no, job_date, exec_no)` 3중키 공유로 연결되는 논리적 관계 (`evidence_rdb.fetch_recent_originals` 의 JOIN 패턴).
- **rag_chunks 테이블 명** — `RAG_DB_TABLE` env 기본값과 `rag_service._retrieve_from_pgvector` 의 폴백 문자열 `"rag_chunks"` 에서 확인. ER 다이어그램에는 핵심 업무 테이블만 싣고 rag_chunks 는 ⑤ RAG 다이어그램에만 표시.
- **배포 토폴로지의 web_admin 로컬(미배포)** — 요청 지시를 따름. (메모리 기록엔 "Vercel × 3" 도 있어 과거에 배포했을 가능성 있음 — 현 시점 기준은 요청 지시 우선.)
- **GitHub → Vercel/Render "push → 자동 배포"** — 저장소에 CI 설정 파일이 없어 플랫폼 기본 Git 연동으로 추정.

## 단순화 (의도적 생략)

- ER 에서 `advice` 테이블 (이장님 오늘 한마디 캐시), `rag_heading`/`rag_heading_rule` (RAG 보조), `act_grp_parcel` (act_grp 의 필지 상세) 은 가독성을 위해 생략.
- 아키텍처 ①의 라우터 19종은 대표 7개만 표기.
- 코칭 시퀀스 ②의 ok-3연속 정지/움직임 재개 로직은 Note 한 줄로 요약 (상세는 `PhotoLiveCoachOverlay.tsx`).
