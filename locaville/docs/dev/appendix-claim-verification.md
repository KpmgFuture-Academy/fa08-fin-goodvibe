# 발표 부록 기술 주장 ↔ 코드 대조 리포트

> 대상: `cherrima/good-vibe` 의 `locaville/` 코드베이스
> 방식: 부록 주장을 실제 소스와 1:1 대조. 판정 **✅정확 / ⚠️outdated / ❓확인불가**.
> 원칙: 코드에서 못 찾으면 "확인불가". 추측 없음.

---

## 변경 이력 (2026-06-15 적용)

최초 대조 이후, 발표 주장과 코드를 맞추기 위해 아래 3건을 **코드 수정**했습니다. 본 리포트의 해당 항목은 **수정 후 상태**로 갱신되어 있습니다.

| 변경 | 내용 | file:line |
|------|------|-----------|
| STT 기본 공급자 | OpenAI Whisper → **RTZR `sommers`(returnzero) 기본값**. 키 없으면 Whisper 폴백 | `backend/app/services/ai_service.py:1941` |
| 오늘 한마디 모델 | Solar Pro 3 → **gpt-4.1-nano** (신규 `_get_today_word_client_and_model`, `purpose="today_word"`). 카드·알림용 Solar Pro 3 셀렉터는 보존 | `ai_service.py:401`, `advice_llm.py:90-128`, `advice_service.py:239,259` |
| Render 플랜 | `plan: free` → **`plan: starter`** (상시가동) | `render.yaml:14` |

> ⚠️ **카드·알림 결합 주의:** 현재 코드에 "카드·알림 문구" **전용 생성 경로는 없음** — 오늘 한마디 텍스트가 그대로 카드/알림에 표시됨. Solar Pro 3 셀렉터(`_get_advice_client_and_model`)는 `purpose="card"/"notification"` 용으로 **보존**되어 있으나 이를 호출하는 코드는 아직 없음. 따라서 실제 화면의 한마디·카드·알림 텍스트는 지금 **모두 nano** 로 생성됨. 카드·알림을 진짜로 Solar 로 분리하려면 전용 생성 호출부를 추가해야 함.

---

## 0. 결론 요약 (TL;DR)

| # | 항목 | 판정 |
|---|------|------|
| 1 | 라이브 코칭 "3초마다 폴링" | ⚠️ **outdated** — 프레임(픽셀) 변화 기반 적응형 폴링(2~4초), 정지 조건 있음 |
| 2 | 모델 라인업 | ✅ (STT·오늘한마디는 2026-06-15 코드 정정 반영) — 도움말=mini, 요약=❓ |
| 3 | 벡터스토어 pgvector 일원화 | ⚠️ **부분** — 런타임은 pgvector, Chroma 폴백 코드·의존성 잔존(롤백용) |
| 4 | todo 합성키 `group_no-...` | ⚠️ **outdated** — 첫 필드는 `amo_regno` |
| 5 | RAG 파이프라인 | ✅ (근거-없음은 하드코딩 아닌 system-prompt grounding) |
| 6 | API 엔드포인트 | ✅ (음성일지=STT+별도 diary 2단계) |
| 7 | 인프라 | Render=starter(상시가동) ✅ · Supabase ✅ / **web_admin 미배포 ⚠️** |
| 8 | 사진 처리 | ✅ (전 항목 코드 확인) |

---

## 1. 라이브 코칭 트리거 — "3초마다 폴링"

**판정: ⚠️ outdated.** 실제 활성 컴포넌트는 **프레임 8x8 서명(픽셀) 변화 임계 기반 적응형 폴링**이며, 변화 없으면 간격을 늘리고 안정되면 **폴링을 정지**한다. "3초 고정 폴링"은 구버전(미사용 legacy) 또는 내부 문서의 잔재.

활성 경로: `PhotoInputScreen.tsx:19` → `import { PhotoLiveCoachOverlay } from "./PhotoLiveCoachOverlay"` (= `app_user/components/PhotoLiveCoachOverlay.tsx`). `components_legacy/` 의 3초 버전은 **어디서도 import되지 않음**.

| 주장 | 판정 | 코드 실제 | file:line |
|------|------|-----------|-----------|
| 3초마다 폴링(고정) | ⚠️ | 기본 2000ms 시작, 첫 틱 800ms, 변화 없으면 최대 4000ms 까지 확장 | `app_user/components/PhotoLiveCoachOverlay.tsx:39-41` |
| 트리거 = 시간 주기 | ⚠️ | 트리거는 프레임 서명 차이. 직전 전송 화면과 `sigDiff < SIG_STATIC(=4)` 이면 **Vision 호출 안 하고** 간격 +2000ms | `…PhotoLiveCoachOverlay.tsx:45-52, 306-310` |
| (디바운스/상한) | ⚠️→실제 존재 | 너무 어두움(`brightness < DARK_LUMA_MIN=45`)·흔들림(`sharpness < BLUR_MIN=2.0`) 이면 **LLM 없이 로컬 안내** | `…PhotoLiveCoachOverlay.tsx:45-52, 290-304` |
| (호출 주기 상한) | ⚠️→실제 존재 | `ok` 3연속(`STABLE_OK_STREAK=3`) 후 폴링 정지, 움직임(`SIG_MOVED=10`) 감지 시에만 재개. 메시지 재발화 쿨다운 `REPEAT_SPEAK_AFTER_MS=3500` | `…PhotoLiveCoachOverlay.tsx:42, 54, 337-342` |
| 호출 엔드포인트 | ✅ | `POST /photo-guard/coach` (multipart) | `app_user/lib/photo-coach-service.ts:34` |
| (3초 버전 존재?) | 참고 | legacy 컴포넌트엔 `POLL_INTERVAL_MS=3000` 있으나 **미사용** | `app_user/components_legacy/PhotoLiveCoachOverlay.tsx:34` |

**세션당 Vision 호출 가늠:** 고정 1회/3초가 아님. 조정 중 ≈2~4초당 1회, 화면 정적/어두움/흔들림이면 0회(로컬 처리), 정상 판정 3회 후 정지. → **세션당 호출 수가 3초 고정 폴링보다 현저히 적고 가변적**.

> 참고(내부 문서도 코드와 불일치): `docs/dev/presentation-prep.md:91,130-131` 은 "3초마다"라고 적혀 있고(슬라이드 주장의 출처로 추정), `docs/architecture/멘토링_서비스_아키텍처.md:32-35` 은 "0.8초 polling"이라 적혀 있음. **둘 다 현재 코드(2~4초 적응형)와 다름.**

---

## 2. 모델 라인업

backend 단일 파일 `backend/app/services/ai_service.py` 에 기능별 모델 셀렉터가 분기되어 있다.

| 기능 (주장) | 판정 | 코드 실제 모델 문자열 | file:line |
|------|------|-----------|-----------|
| 라이브 코칭 = Gemini 2.5 Flash Lite | ✅ | `gemini-2.5-flash-lite` (`COACH_POLL_MODEL` 기본값) | `ai_service.py:362` |
| 사진 판정(to-do 일치) = Gemini 2.5 Flash | ✅ | `gemini-2.5-flash` (`TODO_MATCH_MODEL` 기본값) | `ai_service.py:375` |
| 영수증 OCR = gpt-4.1-mini Vision | ✅ | vision = `_get_vision_model_name()` → 기본 `gpt-4.1-mini` (`classify_and_extract_evidence` 에서 사용) | `ai_service.py:95, 98-99` |
| STT = RTZR sommers | ✅ (2026-06-15 수정) | **기본값을 `returnzero`(RTZR `sommers`)로 변경.** 키(`RETURNZERO_*`) 없으면 OpenAI Whisper(`gpt-4o-mini-transcribe`)로 안전 폴백 | 기본 `ai_service.py:1941` / RTZR `ai_service.py:1873` |
| TTS = Google Chirp 3 HD (`ko-KR-Chirp3-HD-Kore`) | ✅ | `GOOGLE_TTS_VOICE = "ko-KR-Chirp3-HD-Kore"`, `ko-KR`, rate 0.9 | `ai_service.py:799-801` |
| 오늘한마디 = GPT-4.1 nano | ✅ (2026-06-15 수정) | **오늘 한마디 본문을 `gpt-4.1-nano`로 변경** (신규 `_get_today_word_client_and_model`, `purpose="today_word"`). ⚠️도움말(챗)은 여전히 `gpt-4.1-mini`, "요약" 전용 모델은 ❓미발견 | `ai_service.py:401, 407` / `advice_llm.py:98-116` / `advice_service.py:239,259` |
| 카드·알림 = Solar Pro 3 | ✅ (셀렉터 보존) | Solar 셀렉터 `_get_advice_client_and_model`(기본 `solar-pro3-260323`)는 `purpose="card"/"notification"` 용으로 유지. **단 현재 호출부 없음**(위 변경 이력 ⚠️ 참조) | `ai_service.py:385-391` / `advice_llm.py:117-120` |
| 임베딩 = text-embedding-3-large (1536 vs 3072) | ✅ / **차원=1536** | `text-embedding-3-large`, **dim=1536** (native reduction, HNSW 호환). **3072 아님** | `supabase_rag_service.py:24-25` / DDL `scripts/setup_supabase_rag.py:51` (`VECTOR(1536)`) |

**핵심 메모 (2026-06-15 수정 반영)**
- **STT:** 최초 대조 시점엔 기본이 OpenAI였으나, **요청에 따라 기본값을 `returnzero`(RTZR `sommers`)로 변경** (`ai_service.py:1941`). 키 없으면 Whisper 폴백.
- **"오늘 한마디":** **요청에 따라 `gpt-4.1-nano`로 변경** (신규 `_get_today_word_client_and_model`). 카드·알림은 Solar Pro 3 셀렉터를 보존하되 **현재 별도 호출부가 없어** 실제로는 한마디=카드=알림이 모두 nano 본문을 공유함(상단 변경 이력 ⚠️).
- **"요약" 전용 모델:** ❓ **확인불가** — 별도의 요약 전용 모델 문자열을 찾지 못함(요약류 텍스트는 기본 OpenAI 텍스트 경로 `gpt-4.1-mini` 로 추정되나 명시적 "summary" 셀렉터 없음). 도움말(챗)도 `gpt-4.1-mini` 유지 — nano 아님.

---

## 3. 벡터 스토어 — pgvector 일원화 / Chroma 잔존

**판정: ⚠️ 부분 정확.** 런타임 검색 경로는 pgvector(Supabase)로 일원화(기본 ON). 단, **ChromaDB 코드·의존성·롤백 폴백이 의도적으로 잔존**한다 → "완전 일원화/제거"는 아님.

| 주장 | 판정 | 코드 실제 | file:line |
|------|------|-----------|-----------|
| pgvector(Supabase)로 일원화 | ✅(런타임) | `_retrieve_from_pgvector` 가 1차, `RAG_USE_PGVECTOR` 기본 `"1"` | `rag_service.py:304-393, 578-587` |
| Chroma 잔존 없음 | ⚠️ **잔존함** | 폴백 `_retrieve_from_chroma` / `_load_chroma_vectorstore` 활성 | `rag_service.py:282-301, 396-486` |
| (라이브러리 코드) | ⚠️ | `import chromadb` 등 그대로 | `library/locaville/rag/hwpx_vectorstore.py:4-6` , `hwpx_rag_query.py` |
| (의존성) | ⚠️ | `chromadb`, `langchain-chroma` 여전히 선언 (단 `backend/requirements.txt` 는 제거됨) | `library/requirements-streamlit.txt:11-12` |
| (롤백 스위치) | 참고 | `RAG_USE_PGVECTOR=0` 으로 옛 Chroma 강제 가능 | `rag_service.py:579-580` |
| 분석/마이그 스크립트 | 참고 | `backend/scripts/analyze_chroma.py` 잔존 | `scripts/analyze_chroma.py` |

> 즉 "production 트래픽은 pgvector"는 맞지만, **"Chroma 흔적이 코드에서 사라졌다"는 과장**. 문서상 2주 안정화 후 정리 예정인 롤백 윈도우 상태.

---

## 4. todo 합성키 포맷

**판정: ⚠️ outdated.** 첫 필드가 `group_no` 가 아니라 **`amo_regno`**.

| 주장 | 판정 | 코드 실제 | file:line |
|------|------|-----------|-----------|
| `group_no-prj_id-activity_id-job_seq` | ⚠️ | **`{amo_regno}-{prj_id}-{activity_id}-{job_seq}`** (구분자 `-` 고정, 4필드) | `backend/app/utils/todo_id.py:19-34` |
| (DTO 문서) | 근거 | "화면용 `todo_id` = `{amo_regno}-{prj_id}-{activity_id}-{job_seq}`" | `backend/app/schemas/todo.py` 도크스트링 |
| (파싱) | 근거 | `todo_id.split("-")` 후 `parts[0]=amo_regno` 버리고 prj/activity/seq 사용 | `backend/app/repositories/diary_rdb.py:554-581` |

> 보충: DB PK 는 **5필드** `(group_no, amo_regno, prj_id, activity_id, job_seq)` 지만, 화면용 합성키는 `group_no` 를 빼고 `amo_regno` 부터 4필드만 결합. 주장은 "첫 필드"를 `group_no` 로 잘못 적은 것.

---

## 5. RAG 파이프라인

| 항목 | 판정 | 코드 실제 | file:line |
|------|------|-----------|-----------|
| 임베딩 차원 | ✅ | 1536 (text-embedding-3-large native reduction) | `supabase_rag_service.py:25` / DDL `scripts/setup_supabase_rag.py:51` |
| 청킹 | ✅ | `RecursiveCharacterTextSplitter`, **chunk_size=800 / overlap=120 (char 기준)**, separators `["\n\n","\n",". "," ",""]`, 사전 병합 max 780자 + heading 컨텍스트 prefix | `library/locaville/rag/chunk_documents.py:326-330, 432-437` |
| (backend ingest 폴백 청커) | ✅ | heading 기반 `_chunk_parsed_blocks(chunk_size=800)` | `backend/app/services/hwpx_ingest_service.py:153-203` |
| 검색 top-k | ✅ | 기본 `limit=4`, 상한 12; `fetch_k=min(30, max(limit*2~3, limit+6))`; **MMR λ=0.7** 재정렬 + 활동/금액 boost | `rag_service.py:413, 419-422, 209-211` |
| "문서에서 확인되지 않습니다" 근거-없음 처리 | ✅(동작) / ⚠️(문구) | 별도 하드코딩 검사 아님 — **system-prompt grounding**. 규칙(1) "제공된 근거 안의 내용만", 규칙(3) "근거에 없으면 '…시행 문서에서 확인이 안 돼요…'". 계산 변형엔 "모르면 '문서에서 확인되지 않아요'". snippet 0개 시 폴백 "도움말 화면에서 자세한 안내를…" | `ai_service.py:1206-1225(특히 1214)`, `~1449`, `1187-1191/1310` |

> 정확한 문자열 `"문서에서 확인되지 않습니다"` 는 **리터럴로는 없음**. 가장 근접한 구현은 위 system-prompt 문구들(`확인이 안 돼요` / `문서에서 확인되지 않아요`)과 무근거 시 폴백 메시지. → 근거-없음 처리는 **존재하나 프롬프트 주도**.

---

## 6. API 엔드포인트 (FastAPI, `backend/app/routers/`)

| 기능 | 판정 | 실제 라우트 | file:line |
|------|------|-----------|-----------|
| 코칭 | ✅ | `POST /photo-guard/coach` (`post_photo_guard_coach`) | `routers/photo_guard.py:48` |
| 증빙 업로드 | ✅ | `POST /evidence/upload` (`upload_evidence`, 201) | `routers/evidence.py:119` |
| 음성 일지 | ✅(주의) | `POST /ai/stt` (`post_ai_stt`) — **음성→텍스트만**. 일지 저장은 별도 `POST /diary` (2단계) | `routers/ai.py:161` |
| 챗 | ✅ | `POST /ai/chat` (`post_ai_chat`) + 스트리밍 `POST /ai/chat/stream` | `routers/ai.py:92, 54` |

> 라우터 prefix 는 `app/main.py:131-149` 의 `include_router` 에서 마운트. (전체 19개 라우터)

---

## 7. 인프라

| 주장 | 판정 | 코드 실제 | file:line |
|------|------|-----------|-----------|
| Render 상시가동 | ✅ (2026-06-15 수정) | `plan: starter` 로 변경 → 15분 idle sleep 없이 **상시가동**, cold start 제거 ($7/mo) | `render.yaml:14` |
| Supabase = pgvector + Storage | ✅ | RAG `RAG_USE_PGVECTOR="1"`; Storage 버킷 `SUPABASE_STORAGE_BUCKET=evidence`, `storage.from_(bucket)` 업/다운로드 | `render.yaml:53-64` / `backend/app/repositories/evidence_storage.py:91,112,122` |
| web_admin 배포됨 | ⚠️ **미배포** | `render.yaml` 에 web_admin 서비스 **없음**(배포 대상은 `locaville-backend` 뿐). 코드는 완성(12 페이지·로그인·project API 연동)이나 Render 정의 부재 | `render.yaml` (web_admin 미언급) / `web_admin/package.json`, `web_admin/app/*` |

> 정정: 백엔드는 Render **starter(상시가동)** 로 정의됨(수정 후). 프론트(app_user/web_user/web_admin)는 render.yaml 에 없음 → 별도 배포(예: Vercel)이거나 미배포. **"web_admin 배포됨"을 단언하면 코드와 어긋남**(render.yaml 미언급).

---

## 8. 사진 처리

| 주장 | 판정 | 코드 실제 | file:line |
|------|------|-----------|-----------|
| 워터마크 합성 | ✅ | **Pillow**(`PIL ImageDraw`)로 RGBA 오버레이 합성 | `backend/app/services/evidence_service.py:34, 265-369` |
| 워터마크 내용 | ✅ | 농업인명 · **촬영시각**(`YYYY-MM-DD HH:MM`) · 필지 · **GPS**(소수 5자리) · 주소(역지오코딩) | `evidence_service.py:214-239` |
| GPS 저장 | ✅ | DB 컬럼 `gps_lat/gps_long` (INSERT). **EXIF엔 미기록**, 워터마크 텍스트엔 표기 | `backend/app/repositories/evidence_rdb.py:329-330, 823-849` |
| 촬영시각 저장 | ✅ | DB `capture_dt`. EXIF `DateTimeOriginal(0x9003)` 우선, 없으면 업로드 시각 | `evidence_rdb.py:331` / `evidence_service.py:242-262, 585-586` |
| 원본/워터마크 분리 | ✅ | `uploads/evidence/original/` vs `uploads/evidence/watermarked/` 별도 저장 | `evidence_service.py:40-42, 607-759` |
| 품질검증 OpenCV | ✅ | 서버측 `image_quality.py`: **cv2 Laplacian variance**(blur<80), 밝기 mean<45, 해상도<512x384. cv2 미존재 시 numpy+Pillow 폴백. 업로드 파이프라인에서 호출 | `backend/app/services/image_quality.py:27, 76-119` / 호출 `evidence_service.py:613` |
| (클라이언트 미러) | 참고 | 카메라 TS 컴포넌트도 밝기/선명도 로컬 체크(서버 임계 미러) | `app_user/components/PhotoLiveCoachOverlay.tsx:49-50` |

---

## 9. 부록 ↔ 코드 불일치 추가 발견 (8개 외)

| # | 추가 발견 | 코드 실제 | file:line |
|---|-----------|-----------|-----------|
| A | **임베딩 모델 기본값 불일치** | 활성 pgvector 경로(`supabase_rag_service`)는 `text-embedding-3-large`(1536). 그러나 Chroma 폴백용 `rag_service` 의 `DEFAULT_EMBEDDING_MODEL` 은 `text-embedding-3-small`. 폴백 발동 시 인덱스(large)와 쿼리(small) 임베딩 공간이 달라질 위험 | `rag_service.py:32` vs `supabase_rag_service.py:24` |
| B | **내부 문서끼리도 코칭 주기 상충** | `presentation-prep.md`="3초", 아키텍처 문서="0.8초", 실제 코드="2~4초 적응형" — 세 값이 모두 다름 | `docs/dev/presentation-prep.md:91` / `docs/architecture/멘토링_서비스_아키텍처.md:32-35` |
| C | **"음성 일지" 단일 엔드포인트 아님** | `/ai/stt`(전사) + `/diary`(저장) 2단계. 슬라이드가 "음성 일지 API" 단일로 표현하면 단순화 오류 | `routers/ai.py:161` , `routers/diary.py` |
| D | **gpt-4.1-nano 의 실체** | (최초) LLM 비교 실험 스펙에만 등장. **(2026-06-15 수정 후) 오늘 한마디 본문의 런타임 모델로 채택** | `ai_service.py:109`(compare) / `ai_service.py:401,407`(today_word) |

---

### 판정 근거 메모
- 최초 대조는 코드 미수정 상태에서 수행. 이후 **2026-06-15 에 STT 기본값·오늘 한마디 모델·Render 플랜 3건을 코드 수정**(상단 "변경 이력" 참조)했고, 해당 항목 file:line 은 수정 후 워킹트리 기준.
- ❓확인불가로 둔 항목: (2)의 "요약 전용 모델" — 명시 문자열 미발견.
