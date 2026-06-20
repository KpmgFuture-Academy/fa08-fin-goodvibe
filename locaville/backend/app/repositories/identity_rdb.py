"""
신 스키마용 신원/매핑 어댑터.

화면/API 입력의 자유 형식 `farmer_id` 를 새 스키마 키(user_no, amo_regno)로 변환합니다.
새 스키마 경로:
    user_master.login_id | user_master.farmer_regno | user_master.user_no
        └─> user_master.user_no
            └─> farmer.user_no = user_master.user_no
                └─> farmer.amo_regno  (한 농가)
                    └─> group_member.amo_regno
                        └─> group_member.group_no

서호마을 시드 기준 그룹은 group_no = 100001 하나뿐이라 group 해석은 단순합니다.
이 함수들은 모두 DB 연결 실패 시 None / 빈 리스트를 반환합니다.
"""
from __future__ import annotations

from typing import Any

from locaville.dbcom import fetch_all, fetch_one


def resolve_user_record(farmer_id: str) -> dict[str, Any] | None:
    """자유 형식 farmer_id 로 user_master 행을 찾습니다.

    매칭 대상: login_id / farmer_regno / user_no(문자열) / amo_regno(farmer 테이블 경유)
    Returns: {user_no, user_name, login_id, farmer_regno, amo_regno} 또는 None.

    2026-05-26 마이그레이션: user_master.farmer_no → farmer_regno 컬럼 이름 변경.
    또한 신/구 시드가 한 DB에 공존할 때(같은 login_id 가 중복) 결정적으로 새 시드 행을
    돌려주도록 `ville_id` 우선 + `user_no` 오름차순으로 정렬한다.
    """
    if not farmer_id:
        return None
    numeric_user_no: int | None = None
    if farmer_id.isdigit():
        try:
            numeric_user_no = int(farmer_id)
        except ValueError:
            numeric_user_no = None
    # numeric_user_no 가 None 이면 user_no 비교 절을 아예 빼서 untyped-NULL 파라미터를
    # integer 컬럼과 비교하지 않게 한다. (PostgreSQL/psycopg 가 untyped NULL 의 type 을
    # 추론하지 못해 쿼리 전체가 에러나고, 호출부의 except 가 그걸 silent 하게 swallow 하던
    # 버그였음.)
    if numeric_user_no is not None:
        sql = """
            SELECT
                um.user_no,
                um.user_name,
                um.login_id,
                um.farmer_regno,
                f.amo_regno,
                f.ville_id
            FROM user_master um
            LEFT JOIN farmer f ON f.user_no = um.user_no
            WHERE
                um.login_id = %s
                OR um.farmer_regno = %s
                OR um.user_no = %s
                OR f.amo_regno = %s
            ORDER BY (f.ville_id IS NULL OR f.ville_id = '') ASC, um.user_no ASC
            LIMIT 1
        """
        params = [farmer_id, farmer_id, numeric_user_no, farmer_id]
    else:
        sql = """
            SELECT
                um.user_no,
                um.user_name,
                um.login_id,
                um.farmer_regno,
                f.amo_regno,
                f.ville_id
            FROM user_master um
            LEFT JOIN farmer f ON f.user_no = um.user_no
            WHERE
                um.login_id = %s
                OR um.farmer_regno = %s
                OR f.amo_regno = %s
            ORDER BY (f.ville_id IS NULL OR f.ville_id = '') ASC, um.user_no ASC
            LIMIT 1
        """
        params = [farmer_id, farmer_id, farmer_id]
    try:
        row = fetch_one(sql, params)
        return dict(row) if row else None
    except Exception:
        return None


def resolve_user_no(farmer_id: str) -> int | None:
    """자유 형식 farmer_id 를 user_master.user_no (INT) 로만 정규화.

    매칭 없거나 변환 실패 시 None.
    """
    rec = resolve_user_record(farmer_id)
    if rec and rec.get("user_no") is not None:
        try:
            return int(rec["user_no"])
        except Exception:
            return None
    return None


def resolve_amo_regno(farmer_id: str) -> str | None:
    """자유 형식 farmer_id 를 farmer.amo_regno (농가 단위 식별자) 로만 정규화.

    user_master.user_no 는 있지만 farmer 매핑이 없는 사용자(예: 이장 등)는 None.
    """
    rec = resolve_user_record(farmer_id)
    if rec and rec.get("amo_regno"):
        return str(rec["amo_regno"])
    return None


def resolve_group_nos_for_amo(amo_regno: str) -> list[int]:
    """amo_regno 가 속한 group_no 목록 (active_yn='Y' 만)."""
    if not amo_regno:
        return []
    sql = """
        SELECT DISTINCT group_no
        FROM group_member
        WHERE amo_regno = %s
          AND (active_yn IS NULL OR active_yn = 'Y')
        ORDER BY group_no
    """
    try:
        rows = fetch_all(sql, [amo_regno])
        return [int(r["group_no"]) for r in rows if r.get("group_no") is not None]
    except Exception:
        return []


def resolve_group_nos_by_farmer_id(farmer_id: str) -> list[int]:
    """기존 todo_rdb.resolve_group_nos_by_farmer_id 의 신 스키마 대응판."""
    amo = resolve_amo_regno(farmer_id)
    if not amo:
        return []
    return resolve_group_nos_for_amo(amo)


# Legacy 식별자 → 신 시드 parcel_regno 폴백 매핑.
# v0_farmer 와 외부 호출자(스크립트, 옛 캐시 등) 가 옛 코드로 호출하면 신 필지로 흡수.
# 신 코드는 새로 만들지 말 것 (방어선만).
_LEGACY_PARCEL_REGNO_MAP: dict[str, str] = {
    "FIELD001": "JT-RPA-002",
    "FIELD002": "JT-DFA-002",
    "FIELD003": "JT-RPA-002",
    "PARCEL001": "JT-RPA-002",
    "PARCEL002": "JT-DFA-002",
    "PARCEL003": "JT-DFA-002",
}


def resolve_parcel_no_int(value: int | str | None) -> int | None:
    """입력으로 들어온 parcel 식별자를 parcel.parcel_no(INT) 로 정규화.

    우선순위:
      1) 순수 숫자 (INT 또는 "11003" 같은 문자열) → INT 캐스트
      2) 'JT-RPA-001' 같은 parcel_regno → parcel 테이블 조회
      3) FIELD001 / PARCEL003 등 legacy 식별자 → _LEGACY_PARCEL_REGNO_MAP 으로
         새 parcel_regno 로 변환 후 다시 DB 조회
      4) 매칭 실패 → None
    """
    if value is None:
        return None
    s = str(value).strip()
    if not s:
        return None

    # 1) 순수 숫자
    if s.lstrip("-").isdigit():
        try:
            return int(s)
        except Exception:
            return None

    # 2) parcel_regno 직접 조회 (대소문자 일치 가정 — 시드는 대문자)
    candidate_regno = s
    # 2-bis) legacy 알리아스면 신 parcel_regno 로 교체 후 진행
    upper = s.upper()
    if upper in _LEGACY_PARCEL_REGNO_MAP:
        candidate_regno = _LEGACY_PARCEL_REGNO_MAP[upper]

    sql = "SELECT parcel_no FROM parcel WHERE parcel_regno = %s LIMIT 1"
    try:
        row = fetch_one(sql, [candidate_regno])
        if row and row.get("parcel_no") is not None:
            return int(row["parcel_no"])
        return None
    except Exception:
        return None


def next_exec_no(user_no: int, job_date: str) -> int:
    """journal.exec_no 의 다음 값 채번: 같은 (user_no, job_date) 안에서 MAX+1.

    트랜잭션/락은 INSERT 호출 측에서 처리. 동시성 충돌은 INSERT 시 IntegrityError 로
    감지되며 호출 측에서 한 번 재시도하는 패턴을 권장합니다.
    """
    sql = """
        SELECT COALESCE(MAX(exec_no), 0) AS max_no
        FROM journal
        WHERE user_no = %s AND job_date = %s
    """
    try:
        row = fetch_one(sql, [user_no, job_date])
        return int((row or {}).get("max_no") or 0) + 1
    except Exception:
        return 1


def next_seq_no(user_no: int, job_date: str, exec_no: int) -> int:
    """evidence.seq_no 의 다음 값 채번: 같은 (user_no, job_date, exec_no) 안에서 MAX+1."""
    sql = """
        SELECT COALESCE(MAX(seq_no), 0) AS max_seq
        FROM evidence
        WHERE user_no = %s AND job_date = %s AND exec_no = %s
    """
    try:
        row = fetch_one(sql, [user_no, job_date, exec_no])
        return int((row or {}).get("max_seq") or 0) + 1
    except Exception:
        return 1
