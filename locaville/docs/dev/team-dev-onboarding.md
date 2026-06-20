# 팀 개발 온보딩

> 처음 합류한 팀원이 1시간 안에 첫 commit 까지 가도록.

---

## 1. 첫 30분 — 환경 설정

1. [`env-setup-guide.md`](./env-setup-guide.md) 따라 backend + frontend 띄우기.
2. `http://localhost:3000` (농업인 앱) / `http://localhost:3001` (이장님) 둘 다 뜨면 통과.
3. `http://localhost:8000/docs` 에서 Swagger 로 `GET /todo/today?farmer_id=kimys68` 호출 → 김영수의 오늘 할 일 list 확인.

---

## 2. 다음 30분 — 데모 컨텍스트 이해

| 키 | 값 |
|---|---|
| **데모 마을** | `LOCALVILLE01` 서호마을 |
| **데모 그룹** | `1000000102` 서호마을작목반 |
| **데모 사업** | `KK26A001` 2026 저탄소 농업 프로그램 시범사업 |
| **대표 농업인** | `farmer_id=kimys68` (김영수) |
| **도우미 데모** | 박정호 (recipient) / 김영수 (helper) |

폰 시뮬레이션:
- 농업인 앱 `http://localhost:3000` → splash → "카카오톡으로 로그인" → 자동 김영수 진입.
- `loginSelect` 에서 직접 로그인 → 다른 `farmer_id` (예: `parkjh63` 박정호) 입력 → 그 농가 화면.

---

## 3. 리포지토리 구조 한눈에

```
good-vibe/
├── AGENTS.md                               ← AI agent 인수인계
└── locaville/
    ├── backend/                            FastAPI + psycopg
    ├── app_user/                           농업인 앱 (Next.js 16)
    ├── web_user/                           이장님 대시보드
    ├── web_admin/                          관리자 (사업 정책)
    ├── library/                            Python 공용 (locaville package)
    └── docs/                               운영 문서
```

**핵심**: `backend` 는 `library/locaville` 에 의존. 즉 `pip install -e locaville/library` 가 필수.

---

## 4. 자주 만지는 파일들

| 파일 | 언제 |
|---|---|
| `backend/app/routers/` | 새 API endpoint 추가 |
| `backend/app/services/` | 비즈니스 로직 |
| `backend/app/repositories/` | DB CRUD (raw SQL + dbcom) |
| `backend/app/schemas/` | Pydantic 요청/응답 모델 |
| `app_user/components/LocavilleApp.tsx` | 앱 화면 라우팅 + 도우미 모드 |
| `app_user/components/HomeScreen.tsx` | 홈 화면 (advice + todo + 자유 기록 + 도우미) |
| `web_user/app/dashboard/page.tsx` | 이장님 운영판 |
| `library/locaville/dbcom.py` | DB 분기 + execute/fetch/transaction |

---

## 5. 핵심 패턴

### Backend 새 endpoint 추가
1. `routers/foo.py` 에 endpoint 정의 (FastAPI APIRouter).
2. `main.py` 에 `app.include_router(foo.router)` 추가.
3. `services/foo_service.py` 에 비즈니스 로직.
4. `repositories/foo_rdb.py` 에 DB 호출 (`from locaville.dbcom import ...`).
5. `schemas/foo.py` 에 Pydantic 모델.

### Frontend 새 API 호출
1. `lib/foo-service.ts` 에 fetch 클라이언트 (`process.env.NEXT_PUBLIC_API_BASE_URL`).
2. 응답 타입은 `lib/foo-types.ts` 에 정의.

### DB 스키마 변경
1. `docs/spec/{feature}-table-spec.md` 에 변경 명세 작성.
2. DBA 협의 후 실제 적용.
3. backend 의 view / SQL alias 정리.

---

## 6. 운영 원칙 (반드시)

1. **자동 commit 금지** — 사용자가 명시 요청한 경우만 `git commit`.
2. **DB 직접 INSERT/UPDATE/DELETE/ALTER 금지** — backend 어댑터 경유.
3. **Secrets backend only** — `OPENAI_API_KEY`, `KAKAO_REST_API_KEY`, `DATA_GO_KR_SERVICEKEY`, `NONGSARO_API_KEY`, `DB_PASSWORD` 는 `NEXT_PUBLIC_*` 으로 절대 노출 X.
4. **60-80대 시니어 UI** — 본문 ≥ 15px, 버튼 높이 ≥ 56px, 카드 사이 gap ≥ 16px.
5. **AI 는 advisory** — 영농일지/증빙/To-do 의 권위는 DB.

---

## 7. 자주 묻는 질문

**Q. 농업인 앱이 SPA 인데 왜 next.js?**
A. 화면 라우팅은 `LocavilleApp.tsx` 의 state. next.js 는 SSR/PWA 인프라(폰 카메라/위치 권한, font, public assets) 활용.

**Q. dbcom 이 외부 패키지인 이유?**
A. RAG / 스토리지 / DB 클라이언트가 다른 프로젝트에서도 재사용. `library/locaville/` 가 공용 코어.

**Q. 라이브 카메라 코칭이 폰에서 안 켜져요.**
A. `getUserMedia` 는 secure context (HTTPS 또는 localhost) 만. LAN IP HTTP 는 brower 정책상 차단. 배포 (Vercel) 환경에서만 작동.

**Q. todo 가 안 떠요.**
A. `prj_todo_list` 가 비었을 가능성. `POST /demo/seed` 호출 또는 `POST /engage/projects/{prj_id}/todos/create` 로 생성.

---

## 8. 첫 commit 까지

1. 작은 task 잡기 (예: dev-status 한 줄 추가, 코멘트 보강, UI 라벨 한국어 다듬기).
2. 코드 변경.
3. `pnpm exec tsc --noEmit` (frontend) / `python -m compileall app` (backend) 로 검증.
4. 사용자가 commit 요청하면 그때 commit. **자동 commit 금지**.

---

## 9. 더 자세히

- 백엔드 구조: [`../architecture/Backend_아키텍처_구성안.md`](../architecture/Backend_아키텍처_구성안.md)
- 사업 흐름: [`../business/사업_기본흐름.md`](../business/사업_기본흐름.md)
- DBMS 가이드: [`../database/DBMS_중립코드_작성_수정_가이드.md`](../database/DBMS_중립코드_작성_수정_가이드.md)
- 시연 흐름: [`../demo/demo-runbook.md`](../demo/demo-runbook.md)
- 현재 알려진 제약: [`./known-limitations.md`](./known-limitations.md)
