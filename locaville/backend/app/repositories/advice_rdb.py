"""``advice`` 테이블 CRUD — 농가/이장 통합 advice 캐시.

스키마 (단일 테이블 + ville_chief_yn flag):
  advice_no       BIGINT PK auto
  user_no         INTEGER NOT NULL  -- 농가/이장 user_no
  advice_date     DATE NOT NULL
  ville_chief_yn  CHAR(1) NOT NULL DEFAULT 'N'  -- 'Y' = 이장(마을 단위), 'N' = 농가
  content         VARCHAR(512) NOT NULL
  rationale       JSONB NOT NULL                 -- {scenario_cd, fields, weather, todos, ...}
  action_url      VARCHAR(512) NULL
  reg_dt/no, mod_dt/no
"""
from __future__ import annotations

import json
from datetime import date
from typing import Any

from locaville.dbcom import execute, fetch_all, fetch_one, transaction


def _row_to_dict(row: dict[str, Any] | None) -> dict[str, Any] | None:
    if not row:
        return None
    rationale = row.get("rationale")
    if isinstance(rationale, str):
        try:
            rationale = json.loads(rationale)
        except (json.JSONDecodeError, TypeError):
            rationale = {}
    return {
        "advice_no": int(row["advice_no"]) if row.get("advice_no") is not None else None,
        "user_no": int(row["user_no"]) if row.get("user_no") is not None else None,
        "advice_date": row.get("advice_date").isoformat() if row.get("advice_date") else None,
        "ville_chief_yn": row.get("ville_chief_yn") or "N",
        "content": row.get("content") or "",
        "rationale": rationale or {},
        "action_url": row.get("action_url"),
        "reg_dt": row["reg_dt"].isoformat() if row.get("reg_dt") else None,
    }


def get_today_advice(
    *,
    user_no: int,
    advice_date: date,
    ville_chief: bool = False,
) -> dict[str, Any] | None:
    """오늘자 advice 단건 조회. 없으면 None."""
    flag = "Y" if ville_chief else "N"
    row = fetch_one(
        "SELECT advice_no, user_no, advice_date, ville_chief_yn, content, rationale, action_url, reg_dt "
        "FROM advice "
        "WHERE user_no = %s AND advice_date = %s AND ville_chief_yn = %s "
        "ORDER BY advice_no DESC LIMIT 1",
        [user_no, advice_date, flag],
    )
    return _row_to_dict(row)


def upsert_advice(
    *,
    user_no: int,
    advice_date: date,
    content: str,
    rationale: dict[str, Any],
    action_url: str | None = None,
    ville_chief: bool = False,
    reg_no: int | None = None,
) -> int:
    """같은 (user_no, advice_date, ville_chief_yn) row 가 있으면 UPDATE, 없으면 INSERT.

    UNIQUE 제약이 없을 수 있어 (user_no, advice_date, ville_chief_yn) 로 먼저 SELECT → 분기.
    트랜잭션 안에서 처리해 동시 호출 시 한 row 만 INSERT 보장.
    """
    flag = "Y" if ville_chief else "N"
    rationale_json = json.dumps(rationale, ensure_ascii=False)

    with transaction() as conn:
        existing = fetch_one(
            "SELECT advice_no FROM advice "
            "WHERE user_no = %s AND advice_date = %s AND ville_chief_yn = %s "
            "FOR UPDATE",
            [user_no, advice_date, flag],
            connection=conn,
        )
        if existing:
            advice_no = int(existing["advice_no"])
            execute(
                "UPDATE advice SET content = %s, rationale = %s::jsonb, action_url = %s, "
                "       mod_dt = NOW(), mod_no = %s "
                "WHERE advice_no = %s",
                [content, rationale_json, action_url, reg_no, advice_no],
                connection=conn,
                commit=False,
            )
            return advice_no

        row = fetch_one(
            "INSERT INTO advice (user_no, advice_date, ville_chief_yn, content, rationale, action_url, reg_no) "
            "VALUES (%s, %s, %s, %s, %s::jsonb, %s, %s) RETURNING advice_no",
            [user_no, advice_date, flag, content, rationale_json, action_url, reg_no],
            connection=conn,
        )
        return int(row["advice_no"]) if row else 0


def delete_older_than(days: int = 30) -> int:
    """N일 이전 advice row 삭제. 보관 정책 cron 용."""
    sql = "DELETE FROM advice WHERE advice_date < (CURRENT_DATE - %s::int)"
    execute(sql, [int(days)])
    return 0  # rowcount 추적은 dbcom 추가 변경 필요 — MVP 는 무시


def list_recent_for_user(*, user_no: int, limit: int = 7) -> list[dict[str, Any]]:
    """단일 사용자의 최근 N일치 advice — 분석/디버그용."""
    rows = fetch_all(
        "SELECT advice_no, user_no, advice_date, ville_chief_yn, content, rationale, action_url, reg_dt "
        "FROM advice WHERE user_no = %s "
        "ORDER BY advice_date DESC, advice_no DESC LIMIT %s",
        [user_no, int(limit)],
    ) or []
    return [r for r in (_row_to_dict(r) for r in rows) if r is not None]
