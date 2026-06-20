from __future__ import annotations

import importlib
import os
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator, Literal, Sequence, cast

from .utilities import load_backend_env


DEFAULT_CONNECT_TIMEOUT = 5
DEFAULT_CHARSET = "utf8mb4"
DEFAULT_PG_POOL_MAX = 4 # 2026.06.15 크기 조정 8 => 4
DBSource = Literal["mysql", "postgres"]


class DBConfigError(RuntimeError):
    """DB 접속 설정이 올바르지 않을 때 발생합니다."""


class DBExecutionError(RuntimeError):
    """SQL 실행 중 오류를 감싸서 전달합니다."""

def get_db_source() -> DBSource:
    """환경 변수에서 사용할 DBMS 종류를 읽어옵니다."""
    load_backend_env()

    normalized_source = os.getenv("DB_SOURCE", "mysql").strip().lower()
    if normalized_source not in {"mysql", "postgres"}:
        raise DBConfigError(f"지원하지 않는 DB_SOURCE 값입니다: {normalized_source!r}")
    return cast(DBSource, normalized_source)


def _get_mysql_modules() -> tuple[Any, Any]:
    try:
        pymysql = importlib.import_module("pymysql")
        dict_cursor = importlib.import_module("pymysql.cursors").DictCursor
    except ImportError as exc:
        raise DBConfigError("MySQL 연결용 라이브러리 `pymysql` 을 불러오지 못했습니다.") from exc
    return pymysql, dict_cursor


def _get_postgres_modules() -> tuple[Any, Any]:
    try:
        psycopg = importlib.import_module("psycopg")
        dict_row = importlib.import_module("psycopg.rows").dict_row
    except ImportError as exc:
        raise DBConfigError("PostgreSQL 연결용 라이브러리 `psycopg` 를 불러오지 못했습니다.") from exc
    return psycopg, dict_row


def get_db_config() -> dict[str, Any]:
    """환경 변수에서 현재 DB_SOURCE 에 맞는 접속 설정을 읽어옵니다."""
    load_backend_env()
    db_source = get_db_source()

    if db_source == "postgres":
        db_url = os.getenv("DB_URL", "").strip()
        if not db_url:
            raise DBConfigError("DB_URL 값이 비어 있습니다.")

        return {
            "conninfo": db_url,
            "connect_timeout": DEFAULT_CONNECT_TIMEOUT,
            "autocommit": False,
        }

    host = os.getenv("DB_HOST", "127.0.0.1").strip()
    port_raw = os.getenv("DB_PORT", "3306").strip()
    database = os.getenv("DB_NAME", "locaville").strip()
    user = os.getenv("DB_USER", "root").strip()
    password = os.getenv("DB_PASSWORD", "1234")

    if not host:
        raise DBConfigError("DB_HOST 값이 비어 있습니다.")
    if not database:
        raise DBConfigError("DB_NAME 값이 비어 있습니다.")
    if not user:
        raise DBConfigError("DB_USER 값이 비어 있습니다.")

    try:
        port = int(port_raw)
    except ValueError as exc:
        raise DBConfigError(f"DB_PORT 값이 올바른 숫자가 아닙니다: {port_raw!r}") from exc

    _, dict_cursor = _get_mysql_modules()

    return {
        "host": host,
        "port": port,
        "user": user,
        "password": password,
        "database": database,
        "charset": DEFAULT_CHARSET,
        "cursorclass": dict_cursor,
        "autocommit": False,
        "connect_timeout": DEFAULT_CONNECT_TIMEOUT,
    }


def _get_db_error_class(db_source: DBSource) -> type[BaseException]:
    if db_source == "postgres":
        psycopg, _ = _get_postgres_modules()
        return psycopg.Error

    pymysql, _ = _get_mysql_modules()
    return pymysql.MySQLError


def connect(**overrides: Any) -> Any:
    """현재 DB_SOURCE 에 맞는 연결 객체를 생성합니다."""
    config = get_db_config()
    config.update(overrides)
    db_source = get_db_source()

    conn = None # 연결 객체가 할당되기 전에 예외가 발생할 수 있으므로 초기화합니다.

    try:
        if db_source == "postgres":
            psycopg, dict_row = _get_postgres_modules()
            config.setdefault("row_factory", dict_row)

            conn = psycopg.connect(**config)
            return conn

        pymysql, dict_cursor = _get_mysql_modules()
        config.setdefault("cursorclass", dict_cursor)
        conn = pymysql.connect(**config)
        return conn
    
    except _get_db_error_class(db_source) as exc:
        dbms_name = "PostgreSQL" if db_source == "postgres" else "MySQL"
        raise DBExecutionError(f"{dbms_name} 연결에 실패했습니다: {exc}") from exc


# ── 연결 풀 (postgres 전용, 호환성 우선) ───────────────────────────────
# 쿼리마다 새 연결(TCP+TLS+인증 핸드셰이크)을 여는 대신, 미리 열어둔 연결 몇 개를
# 빌려 쓰고 반납한다. Render(싱가포르)↔Supabase(서울) 같은 원격 DB 에서 지연을 크게 줄인다.
#
# 호환성 원칙 — SQL 은 표준 그대로, 바뀌는 건 '연결 관리'뿐:
#   · postgres 가 아니면(mysql/그 외) 풀을 아예 쓰지 않고 기존 connect-per-query 로 동작.
#   · psycopg_pool 미설치 / 풀 생성 실패 → 영구 폴백(기존 동작).
#   · 풀에서 빌리기 실패(고갈/타임아웃) → 그 호출만 직접 연결로 폴백(절대 죽지 않음).
#   · 비상 스위치 DB_POOL_ENABLED=0.
_PG_POOL: Any | None = None
_PG_POOL_FAILED = False


def _pooling_enabled() -> bool:
    return os.getenv("DB_POOL_ENABLED", "1").strip().lower() not in ("0", "false", "no", "off", "")


def _get_pg_pool() -> Any | None:
    """postgres 전용 연결 풀 싱글톤. 만들 수 없으면 None → 호출부가 폴백."""
    global _PG_POOL, _PG_POOL_FAILED
    if _PG_POOL is not None:
        return _PG_POOL
    if _PG_POOL_FAILED:
        return None
    try:
        import logging

        from psycopg_pool import ConnectionPool

        # 읽기(autocommit=False)는 반납 시 psycopg_pool 이 자동 롤백하며 매 쿼리 WARNING 을 남긴다.
        # 동작은 정상(트랜잭션 정리)이므로 해당 로거만 ERROR 이상으로 낮춰 로그 소음을 막는다.
        logging.getLogger("psycopg.pool").setLevel(logging.ERROR)

        _, dict_row = _get_postgres_modules()
        conninfo = get_db_config()["conninfo"]
        pool_max = min(
            int(os.getenv("DB_POOL_MAX", str(DEFAULT_PG_POOL_MAX)) or str(DEFAULT_PG_POOL_MAX)),
            DEFAULT_PG_POOL_MAX,
        )
        pool_min = min(int(os.getenv("DB_POOL_MIN", "1") or "1"), pool_max)
        pool = ConnectionPool(
            conninfo,
            min_size=pool_min,
            max_size=pool_max,
            max_idle=float(os.getenv("DB_POOL_MAX_IDLE", "300") or "300"),
            timeout=float(os.getenv("DB_POOL_TIMEOUT", "10") or "10"),
            kwargs={
                "row_factory": dict_row,
                "autocommit": False,
                "connect_timeout": DEFAULT_CONNECT_TIMEOUT,
            },
            # 빌려주기 전 가벼운 점검으로 서버가 끊은 죽은 연결을 거른다(핸드셰이크보다 훨씬 쌈).
            check=ConnectionPool.check_connection,
            name="locaville-pg",
            open=False,
        )
        pool.open()  # 백그라운드로 연결 채움 — DB 가 잠깐 느려도 startup 을 막지 않음
        _PG_POOL = pool
        return _PG_POOL
    except Exception:
        _PG_POOL_FAILED = True  # 미설치/실패 → 기존 동작으로 영구 폴백
        return None


def close_pg_pool() -> None:
    """PostgreSQL 연결 풀이 있으면 닫고 해제합니다."""
    global _PG_POOL
    if _PG_POOL is None:
        return

    try:
        _PG_POOL.close()
    except Exception:
        pass
    finally:
        _PG_POOL = None


def _should_pool(overrides: dict[str, Any]) -> bool:
    """이 호출에 풀을 쓸지 — postgres + 풀링 ON + overrides 없음 일 때만."""
    if overrides or not _pooling_enabled():
        return False
    try:
        return get_db_source() == "postgres"
    except Exception:
        return False


@contextmanager
def get_connection(**overrides: Any) -> Iterator[Any]:
    """with 블록에서 사용할 DB 연결 컨텍스트 매니저.

    postgres + 풀링 ON(기본) 이면 연결 풀에서 빌려 쓰고 반납한다. 그 외(mysql/다른 DB /
    overrides / 풀 미사용·실패)는 기존처럼 매번 새 연결을 열고 닫는다. 어느 경로든 SQL·커밋
    계약은 동일하다(커밋은 호출부; 미커밋 트랜잭션은 반납/종료 시 정리).
    """
    pool = _get_pg_pool() if _should_pool(overrides) else None

    conn = None
    from_pool = False
    if pool is not None:
        try:
            conn = pool.getconn()
            from_pool = True
        except Exception:
            conn = None  # 풀 고갈/타임아웃 → 이 호출만 직접 연결로 폴백

    if conn is None:
        conn = connect(**overrides)

    try:
        yield conn
    except Exception:
        if from_pool:
            try:
                conn.rollback()
            except Exception:
                pass
        raise
    finally:
        if from_pool:
            pool.putconn(conn)
        else:
            conn.close()


@contextmanager
def transaction(**overrides: Any) -> Iterator[Any]:
    """성공 시 commit, 예외 시 rollback 하는 트랜잭션 컨텍스트입니다."""
    with get_connection(**overrides) as conn:
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise


def fetch_all(
    sql: str,
    params: Sequence[Any] | None = None,
    *,
    connection: Any | None = None,
) -> list[dict[str, Any]]:
    """SELECT 결과를 dict 리스트로 반환합니다."""
    query_params = list(params or [])
    db_source = get_db_source()
    db_error_class = _get_db_error_class(db_source)
    if connection is not None:
        try:
            with connection.cursor() as cursor:
                cursor.execute(sql, query_params)
                return list(cursor.fetchall())
        except db_error_class as exc:
            raise DBExecutionError(f"조회에 실패했습니다: {exc}") from exc

    with get_connection() as conn:
        try:
            with conn.cursor() as cursor:
                cursor.execute(sql, query_params)
                return list(cursor.fetchall())
        except db_error_class as exc:
            raise DBExecutionError(f"조회에 실패했습니다: {exc}") from exc


def fetch_one(
    sql: str,
    params: Sequence[Any] | None = None,
    *,
    connection: Any | None = None,
) -> dict[str, Any] | None:
    """SELECT 결과 한 건을 dict로 반환합니다."""
    rows = fetch_all(sql, params, connection=connection)
    return rows[0] if rows else None


def execute(
    sql: str,
    params: Sequence[Any] | None = None,
    *,
    connection: Any | None = None,
    commit: bool = True,
) -> int:
    """INSERT/UPDATE/DELETE 등을 실행하고 영향 받은 행 수를 반환합니다."""
    query_params = list(params or [])
    db_source = get_db_source()
    db_error_class = _get_db_error_class(db_source)

    # 외부 연결 주입: 커밋/정리는 호출부 책임 — 기존 동작 유지(호환).
    if connection is not None:
        try:
            with connection.cursor() as cursor:
                result = cursor.execute(sql, query_params)
                affected = cursor.rowcount if cursor.rowcount is not None and cursor.rowcount >= 0 else result
            return int(affected)
        except db_error_class as exc:
            raise DBExecutionError(f"SQL 실행에 실패했습니다: {exc}") from exc

    # 자체 연결: 풀에서 빌려 쓰고(또는 폴백 직접연결) 반납. commit/rollback 은 기존과 동일.
    with get_connection() as conn:
        try:
            with conn.cursor() as cursor:
                result = cursor.execute(sql, query_params)
                affected = cursor.rowcount if cursor.rowcount is not None and cursor.rowcount >= 0 else result
            if commit:
                conn.commit()
            return int(affected)
        except db_error_class as exc:
            conn.rollback()
            raise DBExecutionError(f"SQL 실행에 실패했습니다: {exc}") from exc


def executemany(
    sql: str,
    params_list: Sequence[Sequence[Any]],
    *,
    connection: Any | None = None,
    commit: bool = True,
) -> int:
    """여러 파라미터 묶음을 한 번에 실행하고 영향 받은 행 수를 반환합니다."""
    db_source = get_db_source()
    db_error_class = _get_db_error_class(db_source)

    if connection is not None:
        try:
            with connection.cursor() as cursor:
                result = cursor.executemany(sql, params_list)
                affected = cursor.rowcount if cursor.rowcount is not None and cursor.rowcount >= 0 else result
            return int(affected)
        except db_error_class as exc:
            raise DBExecutionError(f"일괄 SQL 실행에 실패했습니다: {exc}") from exc

    with get_connection() as conn:
        try:
            with conn.cursor() as cursor:
                result = cursor.executemany(sql, params_list)
                affected = cursor.rowcount if cursor.rowcount is not None and cursor.rowcount >= 0 else result
            if commit:
                conn.commit()
            return int(affected)
        except db_error_class as exc:
            conn.rollback()
            raise DBExecutionError(f"일괄 SQL 실행에 실패했습니다: {exc}") from exc


def ping() -> bool:
    """DB 연결 가능 여부를 간단히 점검합니다."""
    with get_connection() as conn:
        db_source = get_db_source()
        if db_source == "mysql":
            conn.ping(reconnect=False)
        else:
            with conn.cursor() as cursor:
                cursor.execute("SELECT 1")
                cursor.fetchone()
    return True
