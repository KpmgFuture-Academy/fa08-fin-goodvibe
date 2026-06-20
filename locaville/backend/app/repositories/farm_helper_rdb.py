"""``farm_helper`` 테이블 access — 고령 농가의 기록을 다른 주민이 대신해 주는 1:1 도움 관계.

실제 schema (DBA 신설):
  helper_user_no    (PK 복합) — 도우미 user_no
  help_seq          (PK 복합) — 같은 helper 의 N번째 도움 관계 (history 관리)
  recipient_user_no            — 도움 받는 농가 user_no
  assigned_dt                  — 이장님 배정 시각
  helper_appr_dt               — helper 본인 동의 시각 (NULL = 미동의)
  recipient_appr_dt            — recipient 본인 동의 시각 (NULL = 미동의)
  est_end_date                 — 예정 종료일 (date)
  real_end_date                — 실제 종료일 (NULL = 활성)
  reg_*/mod_*                  — audit

**active** = `real_end_date IS NULL` AND `helper_appr_dt IS NOT NULL` AND `recipient_appr_dt IS NOT NULL`.
**pending** = `real_end_date IS NULL` AND (둘 중 하나라도 미동의).

1:1 규칙 (application 측 보장): 같은 helper 가 두 명을 동시 도울 수 없고,
같은 recipient 도 두 명에게 동시 도움받을 수 없음. INSERT 전 active/pending 검사.
"""
from __future__ import annotations

from datetime import date as _date
from typing import Any

from locaville.dbcom import execute, fetch_all, transaction


# ============================================================
# 조회
# ============================================================

def _row_to_pair(row: dict[str, Any]) -> dict[str, Any]:
    """row → API 응답 dict. is_active / is_pending 계산.

    amo_regno 는 frontend 가 helper mode 시 effective farmer_id 로 swap 하기 위해 함께 노출.
    """
    helper_appr = row.get("helper_appr_dt")
    recipient_appr = row.get("recipient_appr_dt")
    real_end = row.get("real_end_date")
    is_active = real_end is None and helper_appr is not None and recipient_appr is not None
    is_pending = real_end is None and not is_active
    return {
        "helper_user_no": int(row["helper_user_no"]),
        "help_seq": int(row["help_seq"]),
        "recipient_user_no": int(row["recipient_user_no"]),
        "helper_name": row.get("helper_name"),
        "recipient_name": row.get("recipient_name"),
        "helper_amo_regno": row.get("helper_amo_regno"),
        "recipient_amo_regno": row.get("recipient_amo_regno"),
        "assigned_at": row["assigned_dt"].isoformat() if row.get("assigned_dt") else None,
        "helper_approved_at": helper_appr.isoformat() if helper_appr else None,
        "recipient_approved_at": recipient_appr.isoformat() if recipient_appr else None,
        "est_end_date": row["est_end_date"].isoformat() if row.get("est_end_date") else None,
        "real_end_date": row["real_end_date"].isoformat() if row.get("real_end_date") else None,
        "is_active": is_active,
        "is_pending": is_pending,
    }


def get_active_or_pending_for_recipient(recipient_user_no: int) -> dict[str, Any] | None:
    """recipient 가 현재 도움받고 있거나 배정 대기인 1건 (real_end_date IS NULL)."""
    rows = fetch_all(
        """
        SELECT fh.*, u_h.user_name AS helper_name, u_r.user_name AS recipient_name,
               f_h.amo_regno AS helper_amo_regno, f_r.amo_regno AS recipient_amo_regno
        FROM farm_helper fh
        LEFT JOIN user_master u_h ON u_h.user_no = fh.helper_user_no
        LEFT JOIN user_master u_r ON u_r.user_no = fh.recipient_user_no
        LEFT JOIN farmer f_h ON f_h.user_no = fh.helper_user_no
        LEFT JOIN farmer f_r ON f_r.user_no = fh.recipient_user_no
        WHERE fh.recipient_user_no = %s AND fh.real_end_date IS NULL
        ORDER BY fh.assigned_dt DESC
        LIMIT 1
""",
        [recipient_user_no],
    )
    return _row_to_pair(rows[0]) if rows else None


def get_active_or_pending_for_helper(helper_user_no: int) -> dict[str, Any] | None:
    """helper 가 현재 돕고 있거나 배정 대기인 1건."""
    rows = fetch_all(
        """
        SELECT fh.*, u_h.user_name AS helper_name, u_r.user_name AS recipient_name,
               f_h.amo_regno AS helper_amo_regno, f_r.amo_regno AS recipient_amo_regno
        FROM farm_helper fh
        LEFT JOIN user_master u_h ON u_h.user_no = fh.helper_user_no
        LEFT JOIN user_master u_r ON u_r.user_no = fh.recipient_user_no
        LEFT JOIN farmer f_h ON f_h.user_no = fh.helper_user_no
        LEFT JOIN farmer f_r ON f_r.user_no = fh.recipient_user_no
        WHERE fh.helper_user_no = %s AND fh.real_end_date IS NULL
        ORDER BY fh.assigned_dt DESC
        LIMIT 1
        """,
        [helper_user_no],
    )
    return _row_to_pair(rows[0]) if rows else None


def list_for_village(ville_id: str) -> list[dict[str, Any]]:
    """마을의 현재 진행중(active+pending) 도움 관계 전체. 이장님 화면용.

    helper / recipient 둘 다 같은 ville 의 농가일 때만 매칭. (이장님은 자기 마을만 관리)
    """
    rows = fetch_all(
        """
        SELECT fh.*, u_h.user_name AS helper_name, u_r.user_name AS recipient_name,
               f_h.amo_regno AS helper_amo_regno, f_r.amo_regno AS recipient_amo_regno
        FROM farm_helper fh
        LEFT JOIN user_master u_h ON u_h.user_no = fh.helper_user_no
        LEFT JOIN user_master u_r ON u_r.user_no = fh.recipient_user_no
        LEFT JOIN farmer f_h ON f_h.user_no = fh.helper_user_no
        LEFT JOIN farmer f_r ON f_r.user_no = fh.recipient_user_no
        WHERE fh.real_end_date IS NULL
          AND (f_h.ville_id = %s OR f_r.ville_id = %s)
        ORDER BY fh.assigned_dt DESC
""",
        [ville_id, ville_id],
    )
    return [_row_to_pair(r) for r in (rows or [])]


def get_pair(helper_user_no: int, help_seq: int) -> dict[str, Any] | None:
    rows = fetch_all(
        """
        SELECT fh.*, u_h.user_name AS helper_name, u_r.user_name AS recipient_name,
               f_h.amo_regno AS helper_amo_regno, f_r.amo_regno AS recipient_amo_regno
        FROM farm_helper fh
        LEFT JOIN user_master u_h ON u_h.user_no = fh.helper_user_no
        LEFT JOIN user_master u_r ON u_r.user_no = fh.recipient_user_no
        LEFT JOIN farmer f_h ON f_h.user_no = fh.helper_user_no
        LEFT JOIN farmer f_r ON f_r.user_no = fh.recipient_user_no
        WHERE fh.helper_user_no = %s AND fh.help_seq = %s
""",
        [helper_user_no, help_seq],
    )
    return _row_to_pair(rows[0]) if rows else None


# ============================================================
# 변경
# ============================================================

def _next_help_seq(helper_user_no: int) -> int:
    rows = fetch_all(
        "SELECT COALESCE(MAX(help_seq), 0) + 1 AS next FROM farm_helper WHERE helper_user_no = %s",
        [helper_user_no],
    )
    return int(rows[0]["next"]) if rows else 1


def insert_assignment(
    *,
    helper_user_no: int,
    recipient_user_no: int,
    est_end_date: _date,
    reg_no: int | None = None,
) -> int:
    """새 도움 관계 row INSERT. 양쪽 동의는 별도 endpoint 로. 채번된 help_seq 반환.

    호출 전에 service 가 1:1 위반 여부 검증할 책임을 가짐.
    """
    help_seq = _next_help_seq(helper_user_no)
    execute(
        """
        INSERT INTO farm_helper
          (helper_user_no, help_seq, recipient_user_no, assigned_dt,
           est_end_date, reg_dt, reg_no)
        VALUES (%s, %s, %s, now(), %s, now(), %s)
        """,
        [helper_user_no, help_seq, recipient_user_no, est_end_date, reg_no],
    )
    return help_seq


def approve_by_helper(*, helper_user_no: int, help_seq: int, mod_no: int | None = None) -> bool:
    """helper 본인 동의 — helper_appr_dt = now. 이미 동의한 경우 무효 (변경 0).

    `fetch_all` 단독 호출은 commit 이 안 돼서 UPDATE 효과가 사라짐. `transaction()` 으로 감싸야 함.
    """
    with transaction() as conn:
        rows = fetch_all(
            """
            UPDATE farm_helper
            SET helper_appr_dt = now(), mod_dt = now(), mod_no = %s
            WHERE helper_user_no = %s AND help_seq = %s
              AND helper_appr_dt IS NULL AND real_end_date IS NULL
            RETURNING helper_user_no
            """,
            [mod_no, helper_user_no, help_seq],
            connection=conn,
        )
    return bool(rows)


def approve_by_recipient(*, helper_user_no: int, help_seq: int, mod_no: int | None = None) -> bool:
    with transaction() as conn:
        rows = fetch_all(
            """
            UPDATE farm_helper
            SET recipient_appr_dt = now(), mod_dt = now(), mod_no = %s
            WHERE helper_user_no = %s AND help_seq = %s
              AND recipient_appr_dt IS NULL AND real_end_date IS NULL
            RETURNING helper_user_no
            """,
            [mod_no, helper_user_no, help_seq],
            connection=conn,
        )
    return bool(rows)


def revoke_pair(*, helper_user_no: int, help_seq: int, mod_no: int | None = None) -> bool:
    """이장님이 도움 관계 해제 — real_end_date = today. 이미 해제됐으면 변경 0."""
    with transaction() as conn:
        rows = fetch_all(
            """
            UPDATE farm_helper
            SET real_end_date = CURRENT_DATE, mod_dt = now(), mod_no = %s
            WHERE helper_user_no = %s AND help_seq = %s AND real_end_date IS NULL
            RETURNING helper_user_no
            """,
            [mod_no, helper_user_no, help_seq],
            connection=conn,
        )
    return bool(rows)
