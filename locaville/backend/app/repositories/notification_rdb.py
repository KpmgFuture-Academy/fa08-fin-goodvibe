"""notification 테이블 access — DBA 가 만든 실제 schema 기준.

실제 컬럼 (spec md 와 명명이 다름):
  notice_no (PK, BIGINT, seq=seq_notice_no)
  user_no (INT)              -- 수신자 user_no. farmer/chief 공용 (farmer.user_no 와 일치)
  sender_cd (VARCHAR)        -- 'C'=chief, 'S'=system, 'F'=farmer (자유 규칙)
  content_cd (VARCHAR)       -- 알림 분류: 'MANUAL', 'RETAKE', 'INVITE', 'TODO_DUE', 'NEW_PRJ'
  title (VARCHAR)
  content (VARCHAR)
  sent_dt (TIMESTAMPTZ)
  action_url (VARCHAR)       -- 클릭 시 frontend route
  related_no (BIGINT)        -- 연관 entity 의 정수 PK (선택)
  read_dt (TIMESTAMPTZ)
  deleted_dt (TIMESTAMPTZ)   -- soft delete
  reg_dt / reg_no / mod_dt / mod_no -- audit
"""
from __future__ import annotations

from typing import Any

from locaville.dbcom import execute, fetch_all, transaction


def insert_notification(
    *,
    user_no: int,
    sender_cd: str,
    content_cd: str,
    title: str,
    content: str | None = None,
    action_url: str | None = None,
    related_no: int | None = None,
    reg_no: int | None = None,
) -> int:
    """알림 1건 INSERT. 채번된 notice_no 반환.

    `fetch_all` 만 호출하면 UPDATE/INSERT 가 commit 안 됨 → `transaction()` 으로 감쌈.
    """
    with transaction() as conn:
        rows = fetch_all(
            """
            INSERT INTO notification
              (notice_no, user_no, sender_cd, content_cd, title, content,
               sent_dt, action_url, related_no, reg_dt, reg_no)
            VALUES
              (nextval('seq_notice_no'), %s, %s, %s, %s, %s,
               now(), %s, %s, now(), %s)
            RETURNING notice_no
            """,
            [user_no, sender_cd, content_cd, title, content, action_url, related_no, reg_no],
            connection=conn,
        )
    return int(rows[0]["notice_no"])


def fetch_unread_count(user_no: int) -> int:
    rows = fetch_all(
        """
        SELECT COUNT(*) AS cnt
        FROM notification
        WHERE user_no = %s AND deleted_dt IS NULL AND read_dt IS NULL
        """,
        [user_no],
    )
    return int(rows[0]["cnt"]) if rows else 0


def fetch_recent(user_no: int, limit: int = 30) -> list[dict[str, Any]]:
    rows = fetch_all(
        """
        SELECT notice_no, sender_cd, content_cd, title, content,
               action_url, related_no, read_dt, sent_dt, reg_dt
        FROM notification
        WHERE user_no = %s AND deleted_dt IS NULL
        ORDER BY reg_dt DESC
        LIMIT %s
        """,
        [user_no, limit],
    )
    return rows or []


def mark_read(notice_no: int, mod_no: int | None = None) -> None:
    execute(
        """
        UPDATE notification
        SET read_dt = now(), mod_dt = now(), mod_no = %s
        WHERE notice_no = %s AND read_dt IS NULL
        """,
        [mod_no, notice_no],
    )


def mark_all_read(user_no: int, mod_no: int | None = None) -> int:
    """한 수신자의 안 읽은 알림을 일괄 읽음 처리. 변경된 row 수 반환."""
    with transaction() as conn:
        rows = fetch_all(
            """
            UPDATE notification
            SET read_dt = now(), mod_dt = now(), mod_no = %s
            WHERE user_no = %s AND deleted_dt IS NULL AND read_dt IS NULL
            RETURNING notice_no
            """,
            [mod_no, user_no],
            connection=conn,
        )
    return len(rows or [])
