# 저탄마을 / Locaville — AI Agent 인수인계

이 문서는 새로 합류하는 AI agent(Claude / Cursor / Copilot 등)가 5분 안에 프로젝트 맥락을 잡을 수 있도록 작성됨. 현재 시점 기준 (2026-06-04, polish 단계).

---

## 1. 한 줄 요약

저탄소 농업 프로그램의 **영농일지 · 사진 증빙 · 오늘 할 일 · 이장님 검토** 흐름을 모바일 + 웹으로 묶은 시연 서비스. 농업인은 폰 앱에서 음성/사진으로 기록하고, 이장님은 데스크톱에서 마을을 운영함.

---

## 2. 리포지토리 구조

```
good-vibe/                                  ← repo root (GitHub: cherrima/good-vibe)
├── AGENTS.md                               ← 이 파일
└── locaville/
    ├── backend/                            FastAPI + psycopg + PostgreSQL
    ├── app_user/                           Next.js 16 — 농업인 모바일 앱
    ├── web_user/                           Next.js 16 — 이장님 대시보드
    ├── web_admin/                          Next.js 16 — 관리자 (사업 정책)
    ├── library/                            Python 공용 패키지 (`locaville`)
    │   └── locaville/
    │       ├── dbcom.py                    DB execute/fetch/transaction + DBMS 분기
    │       ├── rag/                        Chroma + HWPX chunker
    │       └── storage_client.py           Supabase Object Storage
    ├── docs/                               운영 문서 (카테고리별)
    │   ├── architecture/ database/ business/ spec/
    │   └── dev/ demo/ design-system/ guidelines/
    └── readme.md                           프로젝트 readme
```

**중요**: `backend` 는 `library/` 의 `locaville` 패키지에 의존. `from locaville.dbcom import execute, fetch_all, ...` 형태로 import. 새 venv 에서 작업 시:

```powershell
cd locaville\backend
.\.venv\Scripts\python -m pip install -e ..\library
.\.venv\Scripts\python -m pip install -r requirements.txt
```

---

## 3. 기술 스택 (현재)

| 영역 | 기술 |
|------|------|
| Backend | FastAPI 0.115, Python ≥3.10, Uvicorn, **psycopg (PostgreSQL)** |
| Frontend | Next.js 16, React 19, TypeScript 5.7, Pretendard |
| DB | **PostgreSQL** `locaville` (MySQL 흔적 일부 잔존, 마이그레이션 진행 중) |
| AI | OpenAI (Chat / Vision / STT / TTS), Chroma + LangChain (RAG) |
| 외부 API | Kakao Local · 기상청 단기예보 · 농촌진흥청 농사로 |
| Storage | Supabase Object Storage (`supabase>=2.0`), 로컬 fs fallback |
| Image | Pillow 워터마크 + OpenCV(Laplacian) 블러 검사 |

---

## 4. 핵심 기능 (현재 구현)

### 농업인 앱 `app_user`
- ✦ 오늘 한마디 (advice 시스템) — 룰 매칭 + LLM 한 줄 변형 + DB 캐시 (이장님 화면용)
- 오늘 할 일 카드 (가장 임박한 1건 + "N건 더 보기")
- **라이브 카메라 코칭** (`PhotoLiveCoachOverlay`) — 2초마다 frame → 중앙 65% crop + 640x480 다운샘플 → Gemini 2.5-flash-lite (max_tokens 200) → 한국어 안내 + Chirp 3 HD Kore TTS. 정적 안내 (어둠/흔들림) 는 mount 시 prefetch 캐시로 0ms 재생. ok 안정 정지 후 sigDiff > 10 감지하면 자동 재개.
- **영농일지 단일 진입점** (`ManualInputScreen`) — voice/photo/manual 통합. 우하단 마이크 FAB → Returnzero STT → 작업/필지 자동 매칭. 사진은 단순 파일 첨부. 작업이 영수증 기반이면 "이 작업은 X 관련 영수증 기대" 힌트 표시.
- 도움말 챗 (`EasyChatCard` + RAG `/ai/chat`) — STT 마이크 + 한국어 답변
- **농사 도우미 모드** — 다른 농가 기록 대행. 트랜지션 (트랙터 2.5초) + 헤더 띠 + 데이터 prefetch
- 알림 — 재촬영 요청/도우미 초대/todo 임박 + 종 클릭 시 slide-up panel

### 이장님 대시보드 `web_user`
- "오늘 먼저 챙길 일" 우선순위 카드 (top 3 laggards, numbered list)
- KPI 4종 (오늘 사진 / 전체 남은 일정 / 이번 주 마감 / 도움 필요)
- 오늘의 운영 메모 (Hero 와 일치 확인, fallback 톤)
- 챙겨야 할 농가 리스트 (나머지)
- 농사 도와주기 연결 — helper pair 동의 흐름
- 최근 올라온 사진 (작은 썸네일)
- 마을 일정 캘린더

### 관리자 `web_admin`
- 마을 단위 사업/활동 관리
- 농가 등록/조회 + 사업 참여 등록
- 사업 정책 관리 (신규)

### Backend
- `POST /photo-guard/check` (단발 검수 — 영수증 OCR / 사진 분류, OpenAI Vision) / `/photo-guard/coach` (라이브 코칭, Gemini 2.5-flash-lite)
- `judge_todo_match` (촬영 후 to-do 일치 판정, Gemini 2.5-flash) + 영수증 vendor 룰 매칭 → `needs_chief_verification`
- `GET /farmer/{id}/advice/today` (오늘 한마디)
- `GET /weather/*` (기상청), `GET /admin/weekly-farm-info` (농촌진흥청)
- `GET /admin/farm-helpers` (도우미 pair) / `GET /admin/recent-evidence` (영수증 OCR 노출 포함)
- `POST /ai/chat` (RAG, gpt-4.1-mini) / `/ai/chat/stream` / `/ai/evidence-guide` / `/ai/policy/calc` / `/ai/policy/rule`
- `POST /ai/stt` (Returnzero `sommers` ko, OpenAI Whisper 폴백) / `POST /ai/tts` (Google Chirp 3 HD Kore, speakingRate 0.9)
- 영농일지 + 증빙 워터마크 + 역지오코딩
- 시연 데모 seed / reset / GPS seed

---

## 5. 운영 원칙 (반드시 지킬 것)

1. **`farmer_id` 하나로만 다님** — frontend 는 `group_no`/`amo_regno`/`user_no` 하드코딩 X. backend `identity_rdb.resolve_*` 가 정규화.
2. **DB 권위** — 영농일지 / 증빙 / To-do 의 source-of-truth 는 항상 DB. AI 는 advisory.
3. **자동 저장 금지** — 사용자가 명시 클릭한 경우만 INSERT.
4. **RAG 는 정책 Q&A 전용** — `/todo/today`, `computed_status` 계산에 사용 X.
5. **Secrets backend only** — `OPENAI_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_TTS_API_KEY`, `RETURNZERO_CLIENT_ID/SECRET`, `KAKAO_REST_API_KEY`, `DATA_GO_KR_SERVICEKEY`, `NONGSARO_API_KEY`, `DATABASE_URL` 는 절대 `NEXT_PUBLIC_*` 으로 노출 X.
6. **DB 스키마 변경은 DBA 협의** → spec 문서 작성 후 적용.
7. **60-80대 시니어 UI** — 여백 풍성히, 빡빡한 layout 금지. 본문 ≥15px, 버튼 높이 ≥56px.

---

## 6. 작업 규칙 (Codex / 기타 AI agent 공통)

1. **작업 범위는 repo 내부로 한정** — 기본 작업 루트는 현재 작업 중인 폴더 또는 그 상위의 `good-vibe` 폴더가 있는 경우 `good-vibe` 폴더로 간주. 이 범위를 벗어나는 읽기/수정은 필요성과 영향을 먼저 확인.
2. **기존 사용자 변경사항은 되돌리지 않음** — dirty worktree 가능성을 전제로 하며, 내가 만들지 않은 변경은 임의로 revert/reset 하지 않음.
3. **외부 영향 작업은 사전 확인** — 네트워크 접근, 패키지 설치, DB 변경, 배포/인프라 조작은 실행 전 짧게 승인 또는 합의 후 진행.
4. **민감정보는 노출 금지** — `.env`, API key, 토큰, 실DB 접속정보는 읽더라도 값 그대로 출력하지 말고 존재 여부/설정 상태만 요약.
5. **가능하면 직접 검증까지 수행** — 로컬에서 안전하게 확인 가능한 빌드/테스트/읽기 검증은 수행하되, 파급이 큰 명령은 먼저 설명하고 진행.

---

## 7. 신 ID 체계

| 항목 | 형식 | 예시 |
|------|------|------|
| `diary_id` | `{user_no}-{yyyymmdd}-{exec_no}` | `10000002-20260604-1` |
| `evidence_id` | `{user_no}-{yyyymmdd}-{exec_no}-{seq_no}` | `10000002-20260604-1-1` |
| `todo_id` | `{group_no}-{prj_id}-{activity_id}-{job_seq}` | `100001-KK26A001-AWT0011-1` |

---

## 8. 데모 컨텍스트

| 구분 | 값 |
|------|----|
| 마을 | `LOCALVILLE01` 서호마을 |
| 그룹 | `1000000102` 서호마을작목반 |
| 사업 | `KK26A001` 2026 저탄소 농업 프로그램 시범사업 |
| 대표 농업인 | `farmer_id=kimys68` (김영수) |
| 도우미 데모 | 박정호 (recipient) / 김영수 (helper) |

---

## 9. 자주 보는 파일들

| 위치 | 역할 |
|------|------|
| `locaville/backend/app/main.py` | FastAPI 앱 진입 + CORS + 라우터 등록 |
| `locaville/backend/app/services/` | photo_guard, advice_*, farm_helper, weather, ai 등 비즈니스 로직 |
| `locaville/backend/app/repositories/` | psycopg 기반 RDB 어댑터 (`from locaville.dbcom import ...`) |
| `locaville/app_user/components/LocavilleApp.tsx` | 농업인 앱 SPA 라우팅 + keep-alive + 도우미 모드 |
| `locaville/app_user/components/PhotoLiveCoachOverlay.tsx` | 라이브 카메라 + 2초 Vision 코칭 + Chirp 3 HD TTS (중앙 65% crop, prefetch 캐시) |
| `locaville/app_user/components/ManualInputScreen.tsx` | 영농일지 단일 진입점 (마이크 STT + 사진 첨부 + 작업/필지) |
| `locaville/app_user/lib/tts-service.ts` | Chirp 3 HD prefetch / 캐시 / 재생 |
| `locaville/backend/app/services/photo_guard_service.py` | 라이브 코칭 + 촬영후 판정 + 영수증 OCR 시스템 프롬프트 |
| `locaville/backend/app/services/ai_service.py` | RAG chat / STT (Returnzero+OpenAI 폴백) / TTS (Google Chirp) / policy |
| `locaville/backend/app/services/evidence_service.py` | 사진 업로드 흐름 + judge_todo_match + 영수증 vendor 룰 매칭 |
| `locaville/web_user/app/dashboard/page.tsx` | 이장님 운영판 |
| `locaville/library/locaville/dbcom.py` | `DB_SOURCE` (postgres/mysql) 분기 + execute/fetch/transaction |

---

## 10. 배포 메모

- **Vercel** (frontend × 3) — 자동 HTTPS. `NEXT_PUBLIC_API_BASE_URL` 설정 필요.
- **Render** (backend) — Root Directory 비움 + Build: `pip install -e locaville/library && pip install -r locaville/backend/requirements.txt` + Start: `cd locaville/backend && uvicorn app.main:app --host 0.0.0.0 --port $PORT`. Free plan 의 cold start 30s 주의.
- **DB** — Render PostgreSQL 또는 Supabase / Neon.
- **카메라 (라이브 코칭)** — `getUserMedia` 는 HTTPS 또는 localhost 만. 배포된 Vercel URL 에서만 작동.

---

## 11. 자세한 문서 위치

| 카테고리 | 내용 |
|---|---|
| `locaville/docs/architecture/` | 백엔드 계층 구조 |
| `locaville/docs/database/` | DBMS 중립 코드 가이드 |
| `locaville/docs/business/` | 사업 → 활동 → todo → 일지 흐름 |
| `locaville/docs/spec/` | advice / farmer-helper / notification 테이블 spec |
| `locaville/docs/dev/` | env-setup, onboarding, known-limitations, dev-status |
| `locaville/docs/demo/` | 시연 runbook + 시나리오 |
| `locaville/docs/design-system/` | 디자인 토큰 |
| `locaville/docs/guidelines/` | 정부 시행지침 원본 (hwpx/hwp) + RAG ingest 결과 |
| `locaville/readme.md` | 프로젝트 readme (구조 + 실행 + API) |

---

## 12. 새 agent 가 처음 묻는 질문 빠른 답

- **DB 연결은 어떻게?** → `from locaville.dbcom import execute, fetch_all, fetch_one, transaction`. 새 backend 파일에서도 같은 패턴.
- **MySQL 인가 PostgreSQL 인가?** → 운영은 **PostgreSQL**. `library/locaville/dbcom.py` 가 `DB_SOURCE` 환경변수로 분기 (`postgres` / `mysql`).
- **농업인 앱은 SPA 인가 multi-page?** → SPA. `app_user/components/LocavilleApp.tsx` 가 화면 상태로 라우팅.
- **이장님 화면은?** → `web_user/app/dashboard/page.tsx` 단일 page 위주.
- **라이브 카메라가 안 켜져요** → `getUserMedia` 는 HTTPS 또는 localhost 만 작동. LAN HTTP 시연은 file-input fallback.
- **알림이 동작 안 해요** → `notification` 테이블이 비어 있을 수 있음. `POST /demo/seed` 로 데모 데이터 주입.

---

> 이 문서가 outdated 라고 느끼면 즉시 갱신할 것. AI agent 의 첫 진입점이라 정확성이 중요함.
