"""``/weather/*`` 라우터 — 농가 화면용 날씨 위젯 API.

기상청 동네예보 (단기예보) 를 호출해 현재 시각 인접 예보를 한 줄로 반환.
ville_id 가 들어오면 village 테이블에서 nx/ny 또는 주소를 조회해 정확한 격자 사용.
"""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Query

from app.repositories.user_ville_rdb import get_village_info
from app.services.weather_batch_service import sync_weather_for_villages
from app.services.weather_service import (
    fetch_current_weather,
    fetch_current_weather_from_db,
    fetch_hourly_weather_from_db,
)


router = APIRouter(prefix="/weather", tags=["weather"])


def _resolve_village_context(ville_id: str | None) -> dict[str, str | int | None]:
    """ville_id 로 weather 서비스 공통 위치 인자를 구성합니다."""
    village_nx: int | None = None
    village_ny: int | None = None
    village_address: str | None = None
    cache_key: str | None = None

    if ville_id:
        village = get_village_info(ville_id)
        if village:
            village_nx = village.get("nx")
            village_ny = village.get("ny")
            addr1 = (village.get("addr_1") or "").strip()
            addr2 = (village.get("addr_2") or "").strip()
            village_address = f"{addr1} {addr2}".strip() or None
            cache_key = ville_id

    return {
        "village_nx": village_nx,
        "village_ny": village_ny,
        "village_address": village_address,
        "cache_key": cache_key,
    }


@router.get("/today")
def get_today_weather(
    ville_id: str | None = None,
    crop_cd: str | None = None,
    source: str = Query(default="auto", pattern="^(auto|db|live)$"),
) -> dict:
    """현재 시각 인접 1건의 단기예보.

    쿼리:
      - ville_id: 마을 코드 → village.nx/ny 또는 addr 로 격자 해석
      - crop_cd: 작물 코드 (예: rice → 농업주산지 격자가 ville 보다 우선)
      - source: ``auto``(기본, DB 우선 후 live fallback) / ``db`` / ``live``

    응답: {tmp, sky, pty, pop, reh, fcst_date, fcst_time, nx, ny}
    실패 시 error 키 포함.
    """
    village_ctx = _resolve_village_context(ville_id)

    if source == "db":
        return fetch_current_weather_from_db(
            crop_cd=crop_cd,
            village_nx=village_ctx["village_nx"],
            village_ny=village_ctx["village_ny"],
            village_address=village_ctx["village_address"],
            cache_key=village_ctx["cache_key"],
        )

    if source == "live":
        return fetch_current_weather(
            crop_cd=crop_cd,
            village_nx=village_ctx["village_nx"],
            village_ny=village_ctx["village_ny"],
            village_address=village_ctx["village_address"],
            cache_key=village_ctx["cache_key"],
        )

    db_result = fetch_current_weather_from_db(
        crop_cd=crop_cd,
        village_nx=village_ctx["village_nx"],
        village_ny=village_ctx["village_ny"],
        village_address=village_ctx["village_address"],
        cache_key=village_ctx["cache_key"],
    )
    if not db_result.get("error"):
        return db_result

    live_result = fetch_current_weather(
        crop_cd=crop_cd,
        village_nx=village_ctx["village_nx"],
        village_ny=village_ctx["village_ny"],
        village_address=village_ctx["village_address"],
        cache_key=village_ctx["cache_key"],
    )
    live_result.setdefault("fallback_from", "db")
    return live_result


@router.get("/hourly")
def get_hourly_weather(
    ville_id: str | None = None,
    crop_cd: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    limit: int = Query(default=48, ge=1, le=240),
) -> dict:
    """배치 적재된 시간대별 기상 데이터를 조회합니다."""
    village_ctx = _resolve_village_context(ville_id)
    return fetch_hourly_weather_from_db(
        crop_cd=crop_cd,
        village_nx=village_ctx["village_nx"],
        village_ny=village_ctx["village_ny"],
        village_address=village_ctx["village_address"],
        cache_key=village_ctx["cache_key"],
        start_date=start_date,
        end_date=end_date,
        limit=limit,
    )


@router.post("/sync")
def sync_weather(
    ville_id: str | None = None,
    actor_no: int | None = None,
) -> dict:
    """선택한 마을(또는 전체 마을)의 기상청 예보를 읽어 weather 테이블에 upsert 합니다."""
    ville_ids = [ville_id] if ville_id else None
    return sync_weather_for_villages(
        ville_ids=ville_ids,
        actor_no=actor_no,
    )
