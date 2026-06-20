"""``/demo/*`` 라우터 — JSON 모드 시연 데이터 초기화/주입/상태 확인 (v0_chief 의 시연 도구)."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from locaville.dbcom import execute, fetch_one

from app.repositories.identity_rdb import resolve_amo_regno
from app.services.demo_service import get_demo_status, reset_demo_data, seed_demo_data


router = APIRouter(prefix="/demo", tags=["demo"])


@router.post("/reset")
def post_demo_reset() -> dict[str, object]:
    # 시연 전 초기화 버튼에서 호출합니다.
    # diary/evidence 테스트 데이터를 비우는 용도입니다.
    return reset_demo_data()


@router.post("/seed")
def post_demo_seed() -> dict[str, object]:
    # 시연용 샘플 레코드를 빠르게 넣는 API입니다.
    return seed_demo_data()


@router.get("/status")
def get_status() -> dict[str, object]:
    # 현재 시연 데이터가 들어있는지 상태만 확인합니다.
    return get_demo_status()


class SeedParcelGpsRequest(BaseModel):
    farmer_id: str = Field(..., description="login_id / amo_regno / user_no / farmer_regno 어느 것이든")
    lat: float
    lng: float
    parcel_no: int | None = Field(None, description="없으면 농가의 첫 필지(MIN(parcel_no)) UPDATE")


@router.post("/seed-parcel-gps")
def post_seed_parcel_gps(payload: SeedParcelGpsRequest) -> dict[str, object]:
    """시연용 — 현재 위치(browser GPS)를 농가 필지의 좌표로 등록.
    PhotoGuardOverlay 거리 검증 테스트 시 본인 위치를 농가 논으로 박는 데 사용.

    데모 전용. 운영 환경에서는 disable 필요 (예: ENV 변수 가드).
    """
    amo_regno = resolve_amo_regno(payload.farmer_id)
    if not amo_regno:
        raise HTTPException(status_code=404, detail=f"농가({payload.farmer_id}) 매칭 실패")

    if payload.parcel_no is None:
        row = fetch_one(
            "SELECT MIN(parcel_no) AS pn FROM parcel WHERE amo_regno = %s",
            [amo_regno],
        )
        target_parcel_no = row and row.get("pn")
        if target_parcel_no is None:
            raise HTTPException(status_code=404, detail="해당 농가에 필지가 없습니다")
    else:
        target_parcel_no = int(payload.parcel_no)

    execute(
        "UPDATE parcel SET gps_lat = %s, gps_long = %s, mod_dt = NOW() "
        "WHERE amo_regno = %s AND parcel_no = %s",
        [payload.lat, payload.lng, amo_regno, target_parcel_no],
    )

    return {
        "amo_regno": amo_regno,
        "parcel_no": int(target_parcel_no),
        "gps_lat": payload.lat,
        "gps_long": payload.lng,
        "ok": True,
    }
