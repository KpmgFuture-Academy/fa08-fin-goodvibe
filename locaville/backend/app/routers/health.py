"""``/health`` 라우터 — 서버·DB 생존 헬스체크. dev/operator 검증 진입점."""
from __future__ import annotations

import os

from fastapi import APIRouter

from app.repositories.health_rdb import check_db_connection


router = APIRouter(tags=["health"])


def _storage_mode() -> str:
    """저장소 모드 (rdb/json). 옛 ``DATA_SOURCE=mysql|postgres`` 도 'rdb' 로 매핑."""
    mode = os.getenv("STORAGE_MODE", "").strip().lower()
    if mode:
        return mode
    legacy = os.getenv("DATA_SOURCE", "json").strip().lower()
    return "rdb" if legacy in ("mysql", "postgres", "rdb") else legacy


@router.get("/health")
def health_check() -> dict[str, object]:
    """서버 생존 + DB 연결 상태를 반환.

    - ``storage_mode``: rdb 또는 json (어디에 저장하는가)
    - ``db``: rdb 모드일 때만 dbcom.ping() 결과 (mysql/postgres 무관)
    - DB 체크 실패 시에도 HTTP 200 유지
    - secret 값 (비밀번호, full DSN) 은 절대 응답에 포함하지 않음
    """
    storage_mode = _storage_mode()
    response: dict[str, object] = {
        "status": "ok",
        "service": "jeotanmaeul-backend",
        "storage_mode": storage_mode,
    }
    if storage_mode == "rdb":
        response["db"] = check_db_connection()
    else:
        response["db"] = {"status": "disabled"}
    return response
