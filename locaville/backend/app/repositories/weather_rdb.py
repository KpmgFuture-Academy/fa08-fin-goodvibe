"""기상 데이터 조회 저장소.

배치가 적재한 ``weather`` 테이블을 온라인 API 가 조회할 때 사용하는 얇은 RDB 어댑터.
"""
from __future__ import annotations

from datetime import date
from typing import Any

from locaville.dbcom import executemany, fetch_all, get_db_source


def list_weather_rows(
    *,
    w_nx: int,
    w_ny: int,
    start_date: date | None = None,
    end_date: date | None = None,
    limit: int = 72,
) -> list[dict[str, Any]]:
    """격자 좌표 기준 시간대별 weather 행을 정렬해 반환합니다."""
    where = ["w_nx = %s", "w_ny = %s"]
    params: list[Any] = [int(w_nx), int(w_ny)]

    if start_date is not None:
        where.append("w_date >= %s")
        params.append(start_date)
    if end_date is not None:
        where.append("w_date <= %s")
        params.append(end_date)

    safe_limit = max(1, min(int(limit), 240))
    sql = f"""
        SELECT
            w_nx,
            w_ny,
            w_date,
            w_hour,
            w_status,
            sky_cd,
            pty_cd,
            temperature,
            humidity,
            precip_prob,
            rain_hour,
            snow_hour,
            update_dt
        FROM weather
        WHERE {" AND ".join(where)}
        ORDER BY w_date, w_hour
        LIMIT %s
    """
    params.append(safe_limit)
    return fetch_all(sql, params) or []


def list_weather_sync_targets(ville_ids: list[str] | None = None) -> list[dict[str, Any]]:
    """배치 동기화 대상 마을/격자 목록을 반환합니다."""
    where = ["nx IS NOT NULL", "ny IS NOT NULL"]
    params: list[Any] = []
    if ville_ids:
        placeholders = ",".join(["%s"] * len(ville_ids))
        where.append(f"ville_id IN ({placeholders})")
        params.extend(ville_ids)

    sql = f"""
        SELECT
            ville_id,
            ville_name,
            addr_1,
            addr_2,
            nx,
            ny
        FROM village
        WHERE {" AND ".join(where)}
        ORDER BY ville_id
    """
    return fetch_all(sql, params) or []


def upsert_weather_rows(rows: list[dict[str, Any]]) -> int:
    """시간대별 weather 행을 PK 기준으로 등록/갱신합니다."""
    if not rows:
        return 0

    db_source = get_db_source()
    if db_source == "postgres":
        sql = """
            INSERT INTO weather (
                w_nx,
                w_ny,
                w_date,
                w_hour,
                w_status,
                sky_cd,
                pty_cd,
                temperature,
                humidity,
                precip_prob,
                rain_hour,
                snow_hour,
                update_dt,
                reg_no,
                mod_no
            ) VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
            )
            ON CONFLICT (w_nx, w_ny, w_date, w_hour)
            DO UPDATE SET
                w_status = EXCLUDED.w_status,
                sky_cd = EXCLUDED.sky_cd,
                pty_cd = EXCLUDED.pty_cd,
                temperature = EXCLUDED.temperature,
                humidity = EXCLUDED.humidity,
                precip_prob = EXCLUDED.precip_prob,
                rain_hour = EXCLUDED.rain_hour,
                snow_hour = EXCLUDED.snow_hour,
                update_dt = EXCLUDED.update_dt,
                mod_dt = CURRENT_TIMESTAMP,
                mod_no = EXCLUDED.mod_no
        """
    else:
        sql = """
            INSERT INTO weather (
                w_nx,
                w_ny,
                w_date,
                w_hour,
                w_status,
                sky_cd,
                pty_cd,
                temperature,
                humidity,
                precip_prob,
                rain_hour,
                snow_hour,
                update_dt,
                reg_no,
                mod_no
            ) VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
            )
            ON DUPLICATE KEY UPDATE
                w_status = VALUES(w_status),
                sky_cd = VALUES(sky_cd),
                pty_cd = VALUES(pty_cd),
                temperature = VALUES(temperature),
                humidity = VALUES(humidity),
                precip_prob = VALUES(precip_prob),
                rain_hour = VALUES(rain_hour),
                snow_hour = VALUES(snow_hour),
                update_dt = VALUES(update_dt),
                mod_dt = CURRENT_TIMESTAMP,
                mod_no = VALUES(mod_no)
        """

    params_list = [
        [
            int(row["w_nx"]),
            int(row["w_ny"]),
            row["w_date"],
            int(row["w_hour"]),
            row["w_status"],
            int(row["sky_cd"]),
            int(row["pty_cd"]),
            row.get("temperature"),
            row.get("humidity"),
            row.get("precip_prob"),
            row.get("rain_hour"),
            row.get("snow_hour"),
            row.get("update_dt"),
            row.get("reg_no"),
            row.get("mod_no"),
        ]
        for row in rows
    ]
    return executemany(sql, params_list)
