"""저탄마을 backend FastAPI 진입점.

CORS, 정적 파일(uploads), 라우터를 한 번에 묶어서 프론트(v0_farmer / v0_chief)가 호출할
API 서버를 구성합니다. uvicorn 으로 띄울 때 이 모듈의 ``app`` 객체를 기동합니다.

  python -m uvicorn app.main:app --reload
"""
from __future__ import annotations

import threading
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.routers import (
    admin,
    ai,
    business_management,
    diary,
    demo,
    engage,
    evidence,
    farm_job,
    farmer,
    health,
    photo_guard,
    project,
    rag,
    report,
    todo,
    user_ville,
    village,
    ville_project,
    weather,
)


# .env 를 가장 먼저 로드. override=False 라 이미 OS 에 설정된 환경 변수는 우선 유지.
load_dotenv(Path(__file__).resolve().parents[1] / ".env", override=False)

# 업로드된 사진 등을 static 으로 서빙하기 위한 디렉토리. 없으면 자동 생성.
UPLOADS_DIR = Path(__file__).resolve().parents[1] / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)


def _prewarm_caches() -> None:
    """background thread 로 무거운 외부 API 캐시를 미리 채움.

    실패는 무시 — 캐시는 정상 응답에만 들어가므로 다음 호출 때 다시 시도됨.
    """
    from app.services.admin_weather_service import get_admin_agri_weather
    from app.services.farm_info_service import get_weekly_farm_info

    def _warm() -> None:
        try:
            get_admin_agri_weather(user_no=None)
        except Exception:
            pass
        try:
            get_weekly_farm_info()
        except Exception:
            pass

    threading.Thread(target=_warm, daemon=True).start()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # [Startup 영역] 서버 기동 시 실행
    _prewarm_caches()

    yield

    # [Shutdown 영역] 서버 종료 시 실행
    from locaville.dbcom import close_pg_pool

    close_pg_pool()


# FastAPI 인스턴스는 한 번만 생성해야 middleware/router 등록이 유지된다.
app = FastAPI(title="Jeotanmaeul Backend", version="0.1.0", lifespan=lifespan)

# app_user(3000) 와 web_user(3001) / web_admin(3002) 가 다른 origin 이라 CORS 필수.
# allow_origins  — dev 시 localhost 고정 origin
# allow_origin_regex — LAN IP(192.168.*, 172.16-31.*, 10.*) :3000/3001/3002 (폰 LAN 접속)
#                    + Vercel production/preview 도메인 (*.vercel.app)
#                    + Render 자체 도메인 (*.onrender.com — health check, 직접 호출)
#                    + ngrok / cloudflared 터널 (시연 HTTPS 우회용)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "http://localhost:3002",
        "http://127.0.0.1:3002",
        # Windows 의 reserved port range (2914-3113) 때문에 3000/3001 이 막힐 때 대안 포트.
        "http://localhost:4000",
        "http://127.0.0.1:4000",
        "http://localhost:4001",
        "http://127.0.0.1:4001",
        "http://localhost:4002",
        "http://127.0.0.1:4002",
    ],
    allow_origin_regex=(
        r"(http://("
        r"192\.168\.\d{1,3}\.\d{1,3}"
        r"|172\.(1[6-9]|2[0-9]|3[01])\.\d{1,3}\.\d{1,3}"
        r"|10\.\d{1,3}\.\d{1,3}\.\d{1,3}"
        r"):(3000|3001|3002|4000|4001|4002)"
        r"|https://([a-z0-9-]+\.)*vercel\.app"
        r"|https://([a-z0-9-]+\.)*onrender\.com"
        r"|https://[a-z0-9-]+\.ngrok-free\.app"
        r"|https://[a-z0-9-]+\.trycloudflare\.com"
        r")"
    ),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 업로드된 사진을 `/uploads/...` 경로로 서빙. 프론트의 image_url 이 이 경로를 가리킴.
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")

# 라우터 등록. 각 라우터는 자체 prefix 를 가짐 (/admin, /diary, /evidence, /ai, ...).
app.include_router(health.router)
app.include_router(ai.router)
app.include_router(diary.router)
app.include_router(evidence.router)
app.include_router(admin.router)
app.include_router(engage.router)
app.include_router(project.router)
app.include_router(rag.router)
app.include_router(user_ville.router)
app.include_router(village.router)
app.include_router(demo.router)
app.include_router(todo.router)
app.include_router(report.router)
app.include_router(ville_project.router)
app.include_router(weather.router)
app.include_router(farm_job.router)
app.include_router(business_management.router)
app.include_router(farmer.router)
app.include_router(photo_guard.router)
