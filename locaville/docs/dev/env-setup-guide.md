# 개발 환경 설정 가이드

> 새 머신에서 처음 작업 시작. 또는 의존성 / env 갱신 시 참고.

---

## 1. 사전 요구사항

- **Python** ≥ 3.10
- **Node.js** ≥ 20 (Next.js 16 의 요구사항)
- **pnpm** (npm 대신 권장)
- **PostgreSQL** 클라이언트 (또는 Docker 로 띄울 수 있는 환경)
- **Git** + GitHub 접근 (`cherrima/good-vibe`)

---

## 2. 클론 + 기본 구조 확인

```powershell
git clone https://github.com/cherrima/good-vibe.git
cd good-vibe

# 확인
ls locaville/    # backend, app_user, web_user, web_admin, library, docs
```

---

## 3. Backend 설정

```powershell
cd locaville\backend
python -m venv .venv
.\.venv\Scripts\python -m pip install --upgrade pip

# 핵심: library/ 의 locaville 패키지를 editable install
.\.venv\Scripts\python -m pip install -e ..\library

# backend 의존성
.\.venv\Scripts\python -m pip install -r requirements.txt
```

**검증**:
```powershell
.\.venv\Scripts\python -c "from locaville.dbcom import execute; print('OK')"
```

### `.env` 작성

`locaville/backend/.env` 파일 생성:

```env
# DB (PostgreSQL — 운영 기본)
DATABASE_URL=<your-postgres-connection-string>
# (또는 분리형)
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=locaville
DB_USER=postgres
DB_PASSWORD=<your-db-password>
DATA_SOURCE=postgres

# OpenAI (Chat / Vision / STT / TTS)
OPENAI_API_KEY=sk-...

# 외부 API
KAKAO_REST_API_KEY=<kakao-rest-api-key>     # 역지오코딩
DATA_GO_KR_SERVICEKEY=<data.go.kr-key>      # 기상청 단기예보
NONGSARO_API_KEY=<nongsaro-key>             # 농촌진흥청 농사로 (필요 시)

# Object Storage (선택)
SUPABASE_URL=<supabase-url>
SUPABASE_KEY=<supabase-anon-key>

# 데모 기본값 (선택)
DEFAULT_CHIEF_USER_NO=10000001
DEFAULT_VILLE_ID=LOCALVILLE01
```

### 실행

```powershell
.\.venv\Scripts\python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

- `http://localhost:8000/health` 가 200 + DB ping OK 면 성공.

---

## 4. Frontend 설정

각 디렉토리 (app_user, web_user, web_admin) 동일 패턴.

```powershell
cd locaville\app_user
pnpm install
```

### `.env.local` 작성

각 프런트 디렉토리에:

**`app_user/.env.local`**:
```env
NEXT_PUBLIC_DATA_SOURCE=api
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

**`web_user/.env.local`** / **`web_admin/.env.local`**:
```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

### 실행

```powershell
# 농업인 앱 (port 3000)
cd locaville\app_user; pnpm dev

# 이장님 (port 3001)
cd locaville\web_user; pnpm dev -- -p 3001

# 관리자 (port 3002)
cd locaville\web_admin; pnpm dev -- -p 3002
```

폰 LAN 노출:
```powershell
pnpm dev -H 0.0.0.0 -p 3001
```
+ `next.config.mjs` 의 `allowedDevOrigins` 에 LAN IP 추가.

---

## 5. 데모 데이터 주입

backend 가 떠 있는 상태에서:

```powershell
curl -X POST http://localhost:8000/demo/seed
curl -X POST http://localhost:8000/demo/reset   # 초기화
curl http://localhost:8000/demo/status
```

또는 brower 에서 `http://localhost:8000/docs` (FastAPI Swagger) 로.

---

## 6. 자주 보는 오류

| 증상 | 원인 / 해결 |
|---|---|
| `ModuleNotFoundError: No module named 'locaville'` | `pip install -e locaville/library` 안 함. `pip show locaville` 로 확인. |
| `connection refused` to PostgreSQL | DATABASE_URL 의 host/port/credentials 확인. Docker 면 컨테이너 실행 확인. |
| `OPENAI_API_KEY missing` | `.env` 파일 누락 or 이름 오타. backend root 의 `.env` 위치. |
| `getUserMedia` 카메라 안 켜짐 (폰 LAN) | HTTPS 또는 localhost 만 가능. Vercel 배포 환경 또는 ngrok 터널 필요. |
| Frontend 가 404 — `NEXT_PUBLIC_API_BASE_URL` 안 됨 | `.env.local` 위치는 각 frontend 디렉토리. dev server 재시작 필요. |
| 폰에서 hot reload 안 됨 | `allowedDevOrigins` 에 폰 접속 IP 추가 (next.config.mjs). |
| Render cold start ~30s | Free plan 의 sleep. 시연 직전 한 번 깨우기. |

---

## 7. Render 배포 시 빠른 체크

배포 시 `library/` 가 외부 패키지 위치라 다음 build command 필요:

```
Build Command:
  pip install -e locaville/library && pip install -r locaville/backend/requirements.txt

Start Command:
  cd locaville/backend && uvicorn app.main:app --host 0.0.0.0 --port $PORT

Root Directory: (비워둠)
```

CORS — backend `app/main.py` 의 `allow_origins` 에 Vercel URL 추가 필수.

자세한 검증 명령은 [`demo-runbook.md`](../demo/demo-runbook.md) 참고.


