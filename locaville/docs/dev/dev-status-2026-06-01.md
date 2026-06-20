# 저탄마을 개발 현황 종합 brief — 2026-06-01

> 다른 LLM 세션에 컨텍스트를 이어주기 위한 한 장짜리 종합 brief.
> 프로젝트 전체 history + 최근 큰 변경 + 현재 상태 + pending 을 모두 담음.
> 새 대화 시작 시 이 파일 전체를 첨부/paste.

---

## 1. 프로젝트 한 줄

**저탄마을 (Locaville)** — 한국 저탄소·친환경 농업 사업 참여 마을을 위한 **영농 기록 & 컴플라이언스** 앱.

> 핵심 문제의식: 고령 농가가 영농일지·증빙사진을 빠뜨려서 사업 제출/심사에서 불이익 받음. 앱이 "오늘 / 언제까지 / 사진? 음성?" 을 명확히 답해주고, 이장님이 마을 단위로 검토 가능해야 함.

**대상 사용자**: 고령 농가 (50~70대) + 이장님 (마을 대표).

---

## 2. 기술 스택 & 아키텍처

```
c:\Users\Admin\good-vibe\
└── locaville/
    ├── backend/     FastAPI + PostgreSQL (Supabase/Render), port 8000
    ├── v0_farmer/   Next.js 16 + Tailwind v4, 농가 모바일, port 3000
    ├── v0_chief/    Next.js 16 + vanilla CSS, 이장님 데스크탑, port 3001
    └── docs/        spec, architecture, dev-status
```

- **Backend**: FastAPI 0.115 + uvicorn + psycopg + `library/locaville/dbcom.py` 추상화 (`fetch_all/execute/transaction`, psycopg paramstyle — `%` 는 `%%` escape)
- **DB**: 원래 MySQL → **PostgreSQL (Supabase)** 이관 완료 (commit `3a243948`)
- **AI**:
  - 텍스트/RAG/vision: **OpenAI `gpt-4.1-mini`** (Responses + Chat Completions). RAG 는 Supabase pgvector + `text-embedding-3-large`.
  - 라이브 카메라 코칭: **Gemini `2.5-flash-lite`** (OpenAI 호환 endpoint, max_tokens 200, thinking off)
  - 촬영 후 to-do 일치 판정: **Gemini `2.5-flash`**
  - STT: **Returnzero `sommers` ko** (기본) + OpenAI Whisper (`gpt-4o-mini-transcribe`) 폴백, `STT_PROVIDER` env 분기
  - TTS: **Google Cloud Chirp 3 HD (`ko-KR-Chirp3-HD-Kore`, speakingRate 0.9)** mp3 stream
- **외부 API**: 기상청 단기/중기예보 (data.go.kr), 농촌진흥청 nongsaro weekFarmInfo (PDF + pypdf), Kakao Local 주소검색, Supabase Storage
- **Inter-service**: frontend → backend `NEXT_PUBLIC_API_BASE_URL` (`http://localhost:8000`), `fetch()` + `cache: "no-store"`, 인증 layer 없음 (MVP)

---

## 3. 데이터 모델 핵심

### PostgreSQL 주요 테이블 (DBA 관리, app 측은 read 중심 + 일부 write)
- **`user_master`** — user_no(PK, int), user_name, login_id, phone_no, addr_*, status_cd
- **`farmer`** — user_no, **amo_regno** (varchar PK), ville_id, farmer_regno
- **`amo_family`** — 농가 master (chief_no = 해당 농가 user_no)
- **`ville`**, **`ville_group`**, **`group_member`** — 마을·그룹 매핑
- **`prj_*`** — `prj` (사업), `prj_activity` (활동), `prj_todo_list` (todo source-of-truth), `prj_journal` (사업별 일지)
- **`journal`** — PK exec_id, `ai_result_json` BLOB (api_diary_id, linked_evidence_ids 등)
- **`evidence`** — composite key (user_no/job_date/exec_no/seq_no), `raw_json` BLOB (api_evidence_id, image_url, original_image_path, activity_type, evidence_type, status, parcel_no 등). **image_url 컬럼 없음** — `file_path` + raw_json 으로 derive.
- **`parcel`** — parcel_no(int 11001~), parcel_regno (varchar 사람코드 'JT-RPA-001'). 표시=regno, 조인=int.
- **`farm_job`** — job_cd → job_name 룩업
- **`common_code`** — code 룩업
- **`notification`** — DBA 신설 (2026-05-31). columns: `notice_no(PK)/user_no/sender_cd/content_cd/title/content/sent_dt/action_url/related_no/read_dt/deleted_dt/reg_*/mod_*`, sequence `seq_notice_no`. spec md 와 컬럼명 다르니 주의.

### Todo / Evidence 규칙
- `todo_id` = `{group_no}-{prj_id}-{activity_id}-{job_cd}` (backend `app/utils/todo_id.py`)
- farmer_id → group_no 는 `user_master` + `group_member` 조인 (prj_todo_list 에 직접 없음)
- Evidence requirement by job_cd:
  - `WATER_DN` → MID_DRAINAGE_START, MID_DRAINAGE_END
  - `SHALLOW` → AWD_DRY_FIELD
  - `BIOCHAR` → BIOCHAR_BAG, BIOCHAR_SPREADING, BIOCHAR_INVOICE
  - `FALL_TILLAGE` → AUTUMN_TILLAGE_BEFORE/AFTER
  - `WASTE` → WASTE_COLLECTION

### Status vocabularies
- Todo: `pending` / `in_progress` / `completed`
- Evidence: `needs_review` / `confirmed` / `manual_review_required` / `retake_required`

### 시연 데이터 (`locaville_jeotan_seed_v2_parcel_int.sql`)
- 마을: **`VILLEJT001`** (저탄선도마을, 전남 고흥) — frontend display 시 station code `LOCAVILLE01` 도 같이 사용
- 그룹: **`group_no=10001`** (저탄반)
- 사업: **`PRJ2026LC`** (저탄소 농업), **`PRJ2026PUB`** (공익직불)
- 이장: 박정호 (`jh.park` / user_no=1000000001 / amo_regno=AMOJT001)
- 농가 7명 (김영수, 이순자, 최민호, 박지현, 정태석, 오미경, 한석철)
- 김영수 = `ys.kim` / 1000000101 / AMOJT002 — v0_farmer 데모 user
- ⚠️ **옛 `kimys68`/`U002`/`PRJ000001`/`prj_2026_demo`/`group_no=1000000102` 는 폐기됨**. 일부 옛 코드/메모리에 남아있을 수 있으니 마주치면 새 ID 로 교체.

---

## 4. Backend API 카탈로그

### `/health`
- `GET /health` — 서버 + DB ping

### `/admin/*` (이장님 대시보드)
- `GET  /admin/summary` — 마을 총계, 농가별, 최근 5건, 상태별
- `GET  /admin/todo-status` — 농가별 todo 진척 + 누락 증빙. filter: farmer_id/group_no/prj_id/project_id/activity_id
- `GET  /admin/new-counts` — 사이드바 배지 (마지막 방문 이후 신규 일지/증빙)
- `POST /admin/residents` — 농가 등록 (user_master + amo_family + parcel + group_member 트랜잭션)
- `PATCH /admin/residents/{amo_regno}` — 농가 정보 수정
- `POST /admin/residents/{amo_regno}/invite` — 초대 발송
- `GET  /admin/payments` — 농가별 지급액 + 활동 breakdown (job_cd 별 단가 + parcel 면적 ha 환산)
- `GET  /admin/agri-weather` — 기상청 단기+중기 예보 통합 (현재값 + 7일 forecast). **외부 API 3개 ThreadPoolExecutor 병렬 + 5분 in-memory cache.** startup prewarm.
- `GET  /admin/weekly-farm-info` — 농촌진흥청 nongsaro PDF → OpenAI LLM 요약. 7일 in-memory cache. startup prewarm.
- `GET  /admin/address-search` — Kakao Local 주소 검색 proxy
- `GET  /admin/recent-evidence?limit=6` — **워터마크 없는 원본** 사진 N장 (마을 현황 갤러리용)
- `GET  /admin/laggard-farmers?days=7&top_n=5` — 최근 N일 미이행 todo 많은 농가 top N
- `POST /admin/laggard-farmers/{farmer_id}/notify` — `notification` 테이블 INSERT (manual 알림)
- `GET  /admin/ai-recommendation` — 날씨+주간+todo 묶음 RAG 1-2줄 추천 + 샘플 evidence
- `DELETE /admin/diaries/{diary_id}`, `DELETE /admin/evidence/{evidence_id}` — soft delete

### `/diary` (영농일지)
- `GET /diary`, `GET /diary/{id}`, `POST /diary` (필수 farmer_id, 누락 시 422)

### `/evidence` (증빙)
- `GET /evidence` (다중 filter), `GET /evidence/missing`, `GET /evidence/{id}`
- `POST /evidence/upload` — multipart 이미지 (≤10MB), 원본 + Pillow 워터마크 저장. EXIF DateTimeOriginal → captured_at. 재촬영 시 같은 parcel_no 의 이전 retake_required 자동 close.
- `POST /evidence` — 메타데이터만
- `PATCH /evidence/{id}` — 이장님 검토 (status, confirmed_label, user_message)

### `/ai/*` (AI advisory only)
- `POST /ai/chat` — RAG (HWPX 정책 문서), multi-turn `messages`. 농민 친화 톤, 인용 마커 제거됨. `gpt-4.1-mini`.
- `POST /ai/chat/stream` — SSE (token / final / done / error)
- `POST /ai/evidence-guide` — 누락 증빙 친근 가이드 (이장님 알림 안내문 다듬기에서 사용)
- `POST /ai/policy/calc`, `/ai/policy/rule` — 정책 문서 기반 일정/규칙 추출 (사업 todo 자동 생성에서 사용)
- `POST /ai/stt` — webm/wav/mp3/m4a ≤25MB. **Returnzero `sommers` ko** 기본, OpenAI Whisper 폴백. 실패 시 source/error_message 로 client 가 Web Speech 폴백.
- `POST /ai/tts` — text → mp3 byte stream (StreamingResponse). **Google Chirp 3 HD `ko-KR-Chirp3-HD-Kore`, speakingRate 0.9**. 키 없거나 실패 시 204 → frontend 가 `speechSynthesis` 폴백.

> **제거됨 (단일 진입점 통합 후 호출처 0)**: `/ai/journal-draft`, `/ai/voice/session/{start,reply,finalize}` + `VOICE_SESSIONS`, `/ai/vision/evidence-label`, `/ai/policy/summary`.

### `/reports`
- `GET /reports/project-preview` — JSON
- `GET /reports/project-pdf` — ReportLab PDF. Korean fonts: Malgun (Win) / AppleGothic (mac) / NotoSansCJK (Linux)

### `/demo` (시연용)
- `POST /demo/reset`, `POST /demo/seed`, `GET /demo/status`

### `/engage`, `/project`, `/business-management`, `/user-ville`, `/todos`, `/farm-job`, `/farmer` — 사업참여/프로젝트/단체관리/사용자컨텍스트 등

---

## 5. Frontend 구조

### v0_chief (이장님 데스크탑, port 3001)
**5개 + 보조 메뉴**:
- `/dashboard` → **마을 현황** (← 핵심, 최근 전면 redesign)
- `/residents` → 마을 주민 (CRUD: createResident / updateResident / inviteResident)
- `/projects` → 진행중인 사업
- `/journal` → 영농일지 (배지: 새 항목 카운트)
- `/evidence` → 증빙사진 (배지)
- `/payments` → 지급 관리 (자동 집계, completed 만)
- `/farmer-groups`, `/project`, `/engage` — 단체/프로젝트/사업참여 관리

**핵심 컴포넌트**:
- `app/dashboard/page.tsx` — 마을 현황 메인 (위에서 아래: 진척률 띠 → 미니스탯 4 → Hero/AI 페어 → 다음 활동 타임라인 → 갤러리+누락농가)
- `components/Shell.tsx` — RootLayout. `currentUserVillageInfo` fetch + `agri-weather` fetch → Header 에 전달
- `components/Header.tsx` — 날짜 + **주간 날씨 strip** + 알림/로그아웃 (마을명·이장님 제거됨)
- `components/Sidebar.tsx` — 메뉴 + 마을 정보 + **"글자 크게 보기" 토글** + 마을 관리자 표시
- `components/help/HelpChat.tsx` + `HelpFloatingButton.tsx` — RAG 챗봇 우하단 floating (typewriter 점진 출력)
- `components/residents/*` — VillageResidentsPage, ResidentDetailPage, ResidentAddModal
- `lib/admin-api.ts` — 모든 wrapper (15개+). `resolveImageUrl` 헬퍼.
- `lib/admin-types.ts` — AdminSummary, AdminTodoStatusItem, AdminEvidenceItem, AdminAgriWeather, AdminWeeklyFarmInfo, …

### v0_farmer (농가 모바일, port 3000)
**Single-page app** — `app/page.tsx` → `JeotanmaeulApp.tsx` 가 화면 state 라우팅 (URL 라우팅 X).

**Screens**:
- SplashScreen → LoginSelectScreen / ManualLoginScreen
- HomeScreen — 오늘 할 일, 메인 메뉴
- JournalScreen → JournalDetailScreen
- BusinessScreen → BusinessDetailScreen — 사업별 evidence/diary rollup + PDF
- **PhotoInputScreen** — to-do 사진 촬영 (PhotoLiveCoachOverlay 라이브 코칭 진입)
- **ManualInputScreen** — 영농일지 단일 진입점 (마이크 STT + 사진 첨부 + 작업/필지 자동 매칭)
- SaveCompleteScreen
- HelpScreen — 쉬운 모드 EasyChatCard (STT + RAG) / 표준 모드 ChatHelp
- SettingsScreen

**`lib/`**: ai-service (RAG/STT/TTS wrapper), tts-service (Chirp prefetch 캐시), todo-service, diary-service, evidence-service, farm-job-service (영수증 키워드 hint 포함), sample-user-context, parcel-reference, farm-reference

> **삭제됨**: VoiceInputScreen, use-voice-conversation.ts, photo-coach-service 의 일부 wrapper, vision-labels.ts

---

## 6. 절대 규칙 / 컨벤션

- **No auto-commit** — 사용자가 명시 요청 없는 한 `git commit` 금지
- **Secrets backend only** — `KAKAO_REST_API_KEY` / `DATA_GO_KR_SERVICEKEY` / `NONGSARO_API_KEY` / `OPENAI_API_KEY` / DB password 는 backend `.env` 전용. frontend 노출 금지.
- **To-do source = RDB**, AI/RAG 가 todo 만들면 안 됨 (`prj_todo_list` 가 source of truth)
- **Vision AI 는 evidence-type 후보만 제안**, 자동 confirm 금지
- **음성 영농기록 = 자동 저장 금지** — 사용자가 confirm 한 finalize 만 일지 저장
- **STT/TTS = OpenAI 우선, 실패 시 브라우저 Web Speech 폴백**
- **DBA gating** — 신규 테이블/컬럼은 spec md 먼저 작성 후 DBA 승인. 직접 DDL 실행 금지.
- **PDF report = 사업의 todos + diaries + evidence 번들**

---

## 7. 최근 큰 변경 history (마일스톤 순)

### Phase 1 — MVP 기능 확장
- 초기: 농가 mvp, 음성 인식, 영농일지/증빙 분리 (`5b156ace` ~ `fdf9c58d`)
- 백앤드 프론트 통합 시연 (`069205eb`)
- 사진 업로드 + 활동별 증빙 누락 계산 (`fdf9c58d`)
- 이장님 대시보드 영농일지 누락 항목 확인 (`3b00f81f`)

### Phase 2 — PostgreSQL 이관 & 리팩토링
- DBMS 중립화 + 아키텍처 문서 (`755410a4`, `b7dc1aba`)
- PostgreSQL 이관 + 전반 리팩토링 (`3a243948`)
- RAG 성능 개선 (`f1ae42d3`)
- Supabase 이관 — 사진 증빙 (`a04c56d9`)

### Phase 3 — 농민 친화 톤 / RAG 보강
- RAG 단가표 retrieval 보강 + 답변 단위·종결 정리 (`455bd2aa`)
- chat_with_rag 답변 농민 친화 톤 + 인용 마커 제거 (`1a291f8e`)
- Prompt 서비스 개발 가이드 (`84d52817`)

### Phase 4 — 시드 v2 (parcel_int) 적용
- 새 시드 적용으로 옛 ID 폐기 (`kimys68`/`U002`/`PRJ000001` 등)
- `vw_jeotan_farmer_summary`, `vw_jeotan_todo_board` view 활용
- parcel_no INT 전환 + parcel_regno 사람코드

### Phase 5 — 사업참여 / 단체 / 프로젝트 관리
- 사업참여 메뉴 + 초기화면 (`8c8ba9d0`)
- 참여 프로젝트 활동별 농가 등록 + 농가별 TODO 생성 (`b5f14ea6`)
- v0_farmer 모바일 톤 통일 + backend 농가 컨텍스트 연동 (`250b4461`)
- 프로젝트 관리 화면 + backend (`e6afc93a`)
- 홈화면 탭바 업데이트 (`bf0f9daa`)
- 대시보드 순선님 동현님 작업 연동 (`df244443`)
- 이장님 기능 업데이트 (`1f15d5c1`)

### Phase 6 — 이번 세션 (2026-06-01) — 본문 아래에 상세

---

## 8. 이번 세션 (2026-06-01) 핵심 변경

### 8-1) v0_chief 마을 현황 전면 redesign (`app/dashboard/page.tsx`, 600+ lines)
**옛 구조** (sunnypark dashboard): 농업기상 + 주간정보 + 알림 + 프로그램 탭 + todo 카드
**새 구조** (위→아래):
1. **마을 진척률 띠** — "이번주 마을 활동 N%" + progress bar + 가장 부지런한 농가 chip
2. **오늘 한눈에 미니 스탯 4개** — 오늘 사진 / 진행중 활동 / 이번주 마감 / 챙겨야 할 농가 (각 카드 클릭 → 해당 페이지)
3. **Hero ↔ AI 한 줄 조언** (1.7 : 1 grid paired card)
   - Hero 좌측 200px 사진 + 우측 텍스트, "지금은 [활동] 증빙 기간이에요"
   - AI 카드 우상단 **"들어보기" TTS 버튼**, 카드 하단 "지금 챙길 농가" chip (→ 농가 페이지)
4. **다음에 챙길 활동 타임라인** — 가로 4개 카드, `[지금] [다음] [3번째] [4번째]`, 마감일 빠른 순, 상단 색띠로 시급성
5. **최근 마을 사진 갤러리 (3/4) + 챙겨야 할 농가 (1/4)** — 갤러리 hover 사진 확대 + 농가명 overlay

### 8-2) 글로벌 헤더/사이드바
- Header 에서 마을명/이장님 제거 → **주간 날씨 strip** 으로 교체 (Shell 이 `getAdminAgriWeather` fetch → prop)
- 사이드바 메뉴 "대시보드" → **"마을 현황"**
- 사이드바 하단 **"글자 크게 보기" 토글** — `body[data-large-text]` + localStorage

### 8-3) 고령 사용자 UX
- 본문 폰트 14 → **17~18px**, 핵심 숫자 26~36px / weight 800~900
- 회색 텍스트 대비 강화 (`--muted` → `--ink-soft`)
- 버튼 라벨 명확화: "안내 보내기" → **"농가에 문자로 알려주기"**, "자세히 보기" → "활동 설명 보기"
- 시간 표현 친근: "내일 · 7월 15일 (수요일) 안에 끝내야 해요" (상대 + 절대 + 요일)
- AI 조언 **TTS "들어보기"** 버튼 — `/ai/tts` (OpenAI) → blob 재생, 키 없으면 `SpeechSynthesis` (ko-KR) 폴백
- 친근 카피: "누락 농가" → **"챙겨야 할 농가"**, "최근 7일 미이행" → "지난 일주일 동안 빠진 게 많은 순"

### 8-4) backend 신규 endpoint
- `GET  /admin/recent-evidence?limit=6` — 워터마크 없는 원본
- `GET  /admin/laggard-farmers?days=7&top_n=5`
- `POST /admin/laggard-farmers/{farmer_id}/notify` — notification INSERT
- `GET  /admin/ai-recommendation` — 날씨+주간+todo RAG 묶음

### 8-5) backend 성능
- `/admin/agri-weather` — ThreadPoolExecutor 병렬 + 5분 in-memory cache (`_AGRI_CACHE`)
- `main.py` startup background prewarm (agri + weekly-farm-info)
- frontend `withTimeout` 3500 → 10000ms

### 8-6) notification 테이블 활용
- `app/repositories/notification_rdb.py` — insert_notification, fetch_unread_count, fetch_recent, mark_read
- "챙겨야 할 농가" → "알림 보내기" 클릭 → `seq_notice_no` 채번 + INSERT
- 시퀀스 + 컬럼명 spec md 와 다르니 주의 (notice_no/user_no/sender_cd/content_cd/title/content/...)

### 8-7) RAG 챗봇 typewriter
- 문제: OpenAI Responses API 가 토큰을 batch 로 보내서 progressive 안 됨
- 해결: 토큰 buffer + `setInterval(28ms)` × 1글자 = ~36자/초 (ChatGPT 비슷)
- React 18 batching 회피: `flushSync`
- v0_chief `HelpChat.tsx` + v0_farmer `HelpScreen.tsx` 동일 패턴

### 8-8) docs
- `docs/notification-table-spec.md` — DBA 협의용 (이미 신설 완료)
- `docs/farmer-helper-spec.md` — 주민 도우미 (1:1 매핑, partial unique index, mermaid 다이어그램 3종) — DBA 협의 중
- `docs/dev-status-2026-06-01.md` — 이 문서

---

## 9. WIP / 알려진 이슈

- **notification.user_no 의 sender 식별** — 시연에선 frontend 가 이장님 user_no 를 모름. INSERT 시 `sender_user_no=None`. 추후 인증 layer 연결 시 해결.
- **시연 데이터 다양성 부족** — 김영수 농가만 활발. 갤러리/통계가 단조. 다른 농가들 시드 추가 필요.
- **v0_farmer 알림 수신 UI 미구현** — backend `fetch_recent(user_no)` 준비됨. 종 아이콘 panel + 읽음 처리 UI 만 추가하면 됨.
- **farmer_helper 테이블** — spec md 작성 완료, DBA 협의 중. 고고고령 농가를 다른 주민 1명이 대신 기록.
- **agri-weather 첫 cold 호출** — prewarm 후 즉시, 단 backend 재시작 직후 첫 화면은 여전히 5~6s. disk persistence cache 또는 더 빠른 한 곳 API 검토.
- **`field_id` vs `parcel_no`** — 둘 다 todo/journal/evidence 에 존재. backend README 가 field_id 는 "POC 호환용" 이라 명시. 장기적으로 parcel-centric.
- **voice session in-memory** — `VOICE_SESSIONS` (~3 turns) 백엔드 재시작 시 손실. finalize 만 일지에 저장.
- **PDF report stale-data risk** — `DATA_SOURCE` 가 mysql/json 토글 가능했으나 PG 이관 후 정리됨. 잔재 코드 있으면 제거 필요.
- **메모리 일부 stale** — `~/.claude/projects/c--Users-Admin-good-vibe/memory/` 의 architecture/backend-api 등은 MySQL 시절 기준. PostgreSQL 이관 + 새 시드 반영 안 됨. 코드 우선 확인.

---

## 10. 메모리 시스템

다음 세션 (Claude Code) 가 직접 읽을 수 있는 자동 메모리:
```
~/.claude/projects/c--Users-Admin-good-vibe/memory/
  MEMORY.md                          # index (1줄/메모리)
  project_jeotanmaul_overview.md
  project_jeotanmaul_architecture.md  ⚠ MySQL 기준 (stale)
  project_jeotanmaul_backend_api.md   ⚠ stale (recent-evidence 등 누락)
  project_jeotanmaul_db_schema.md     ⚠ MySQL 기준
  project_jeotanmaul_farmer_app.md
  project_jeotanmaul_chief_app.md     ⚠ 마을 현황 redesign 이전
  project_jeotanmaul_demo_ids.md      ✓ 시드 v2 반영
  project_jeotanmaul_dev_rules.md     ✓ 유효
  project_jeotanmaul_wip_flags.md
  feedback_no_auto_commit.md          ✓ 유효
```

ChatGPT 세션이라면 메모리 시스템 직접 읽지 못함 → 이 brief 가 그 역할.

---

## 11. 다음 후보 작업

- v0_farmer 종 아이콘 panel (notification 수신 + 읽음 처리)
- 농가 빠른 검색 (마을 현황 상단)
- 갤러리 활동별/농가별 chip 필터
- "1년 전 오늘" 회고 카드 (긍정 톤)
- farmer_helper DBA 승인 후 backend + UI 구현
- 시연 데이터 풍부화 (다른 농가들 활동 시드 SQL)
- stale 메모리 갱신 (PostgreSQL + 마을 현황 redesign 반영)

---

## 12. 코드 진입점 cheat sheet

| 하고 싶은 것 | 보기 시작할 파일 |
|---|---|
| 마을 현황 화면 손보기 | `v0_chief/app/dashboard/page.tsx` |
| 글로벌 헤더/사이드바 | `v0_chief/components/Shell.tsx`, `Header.tsx`, `Sidebar.tsx` |
| 농가 앱 화면 | `v0_farmer/components/jeotanmaeul/*.tsx` + `JeotanmaeulApp.tsx` |
| 새 admin endpoint | `backend/app/routers/admin.py` + `app/services/admin_service.py` |
| RAG 동작 손보기 | `backend/app/services/rag_service.py` + `ai_service.py` |
| DB query 추가 | `backend/app/repositories/*_rdb.py` (psycopg `%` → `%%` escape) |
| 워터마크/EXIF | `backend/app/services/evidence_service.py` |
| 기상 API | `backend/app/services/admin_weather_service.py`, `weather_service.py` |
| AI 호출 | `backend/app/services/ai_service.py` (chat_with_rag, vision, stt, tts) |
| 데모 시드 | `backend/scripts/` + `docs/locaville_jeotan_seed_v2_parcel_int.sql` |

---

**Last updated**: 2026-06-01, 이번 세션 (마을 현황 redesign + 고령 UX + notification 활용 + AI actionable)
