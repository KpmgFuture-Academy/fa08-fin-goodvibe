"""현재 사용자/마을 컨텍스트 조회 저장소."""
from __future__ import annotations

import os
from typing import Any

from locaville.dbcom import fetch_one


DEFAULT_CHIEF_USER_NO = int(os.getenv("DEFAULT_CHIEF_USER_NO", "10000001"))
DEFAULT_VILLE_ID = os.getenv("DEFAULT_VILLE_ID", "LOCAVILLE01")


def get_user_farmer_info(user_no: int = DEFAULT_CHIEF_USER_NO) -> dict[str, Any] | None:
    """`user_full_view`에서 사용자/농가 정보를 한 건 조회합니다."""
    sql = """
        SELECT
            user_no,
            user_name,
            amo_regno,
            ville_id,
            farmer_regno,
            login_id,
            phone_no,
            zip_cd,
            addr_1,
            addr_2,
            auth_key,
            email,
            status_cd,
            passwd
        FROM user_full_view
        WHERE user_no = %s
        LIMIT 1
    """
    return fetch_one(sql, [user_no])


def get_village_info(ville_id: str = DEFAULT_VILLE_ID) -> dict[str, Any] | None:
    """`village` 테이블에서 마을 정보를 한 건 조회합니다."""
    sql = """
        SELECT
            ville_id,
            ville_name,
            chief_no,
            zip_cd,
            addr_1,
            addr_2,
            phone_no,
            nx,
            ny
        FROM village
        WHERE ville_id = %s
        LIMIT 1
    """
    return fetch_one(sql, [ville_id])


def get_current_user_ville_info(
    user_no: int = DEFAULT_CHIEF_USER_NO,
    default_ville_id: str = DEFAULT_VILLE_ID,
) -> dict[str, Any]:
    """현재 로그인 사용자와 마을 정보를 함께 반환합니다."""
    user_info = get_user_farmer_info(user_no)
    ville_id = str((user_info or {}).get("ville_id") or "").strip() or default_ville_id
    village_info = get_village_info(ville_id)
    return {
        "user": user_info,
        "village": village_info,
    }
