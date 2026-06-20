"""``/user-ville/*`` 라우터 — 현재 사용자/마을 컨텍스트 전용 API."""
from __future__ import annotations

from fastapi import APIRouter

from app.repositories.identity_rdb import resolve_user_no
from app.repositories.user_ville_rdb import (
    DEFAULT_CHIEF_USER_NO,
    get_current_user_ville_info,
)


router = APIRouter(prefix="/user-ville", tags=["user-ville"])


@router.get("/current-user")
def get_current_user(farmer_id: str | None = None) -> dict:
    """현재 사용자 + 마을 컨텍스트.

    `farmer_id` (login_id / amo_regno / farmer_regno / user_no 어떤 형태든) 가 들어오면
    그 농가 기준으로 조회. 비면 기본 chief 사용자 (이장님 화면 호환).
    """
    if farmer_id:
        user_no = resolve_user_no(farmer_id)
        if user_no is not None:
            return get_current_user_ville_info(user_no=user_no)
    return get_current_user_ville_info(user_no=DEFAULT_CHIEF_USER_NO)
