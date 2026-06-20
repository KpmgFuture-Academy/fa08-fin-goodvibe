"""``GET /health`` 응답의 ``db`` 필드를 만드는 헬스체크 모듈.

비밀값(비밀번호·DSN) 노출 금지가 핵심 원칙. 에러가 나도 예외 대신 안전한 dict 를 반환.
DBMS 종류(mysql/postgres)는 ``DB_SOURCE`` 가 결정하며, 본 모듈은 ``dbcom.ping`` 을 통해
DBMS 에 무관하게 연결 가능 여부만 확인합니다.
"""
from __future__ import annotations

import os

from locaville.dbcom import DBExecutionError, get_db_source, ping


def _get_db_safe_info() -> dict[str, object]:
    """응답에 노출 가능한 안전 정보만 반환 (DBMS 종류 + host/port/database 또는 conninfo 일부).

    postgres 의 경우 ``DB_URL`` 에 host/port 가 묻혀있어서 별도 분해하지 않고
    DB_NAME 만 노출. 비밀번호·사용자명·full DSN 은 절대 포함하지 않습니다.
    """
    info: dict[str, object] = {"source": get_db_source()}
    if info["source"] == "mysql":
        info["host"] = os.getenv("DB_HOST", "127.0.0.1")
        info["port"] = int(os.getenv("DB_PORT", "3306"))
        info["database"] = os.getenv("DB_NAME", "locaville")
    else:
        # postgres: DB_URL 안의 host/port 는 분해해서 노출하지 않음 (자격증명 인접).
        info["database"] = os.getenv("DB_NAME", "postgres")
    return info


def check_db_connection() -> dict[str, object]:
    """``ping()`` 한 줄로 DB 연결 가능 여부를 확인.

    실패해도 예외를 올리지 않고 ``{"status": "failed", "error": <safe msg>, ...}`` 를
    돌려줘서 ``/health`` 자체가 항상 200 으로 응답되도록 합니다. 비밀번호/사용자명·
    full DSN 같은 secret 은 응답에 절대 포함하지 않습니다.
    """
    info = _get_db_safe_info()
    try:
        ping()
        return {"status": "ok", **info}
    except DBExecutionError:
        return {"status": "failed", **info, "error": "DBExecutionError: connection failed"}
    except Exception as exc:  # noqa: BLE001
        return {"status": "failed", **info, "error": f"{type(exc).__name__}: connection failed"}
