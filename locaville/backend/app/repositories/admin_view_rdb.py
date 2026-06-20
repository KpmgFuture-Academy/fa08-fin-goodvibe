"""저탄마을 관리자/요약용 RDB read repository (view 의존 없는 raw JOIN).

이전 버전은 ``vw_jeotan_farmer_summary``/``vw_jeotan_todo_board``/
``vw_jeotan_journal_evidence`` 3개 view 를 사용했지만 다음 이유로 코드 측
raw JOIN 으로 전환합니다:

  - view 가 사용하는 ``GROUP_CONCAT`` (mysql) / ``STRING_AGG`` (postgres) 함수가
    DBMS 별로 달라 단일 DDL 로 양쪽 호환 불가.
  - view DDL 누락 시 ``except Exception: return []`` 로 조용히 실패해
    가이드의 "충돌 무시 금지" 원칙을 위반.
  - DBA / 코드 양쪽에서 view 정의 동기화하는 부담 제거.

3개 함수 중 ``fetch_todo_board`` / ``fetch_journal_evidence`` 는 이미 todo_rdb /
diary_rdb 에 같은 raw JOIN 헬퍼가 있어 그쪽으로 위임합니다. ``fetch_farmer_summary``
는 농가 단위 집계라 본 모듈 자체에서 SQL 보유.

오류는 호출자(service)가 처리하도록 상위로 전파합니다 (try/except 로 가리지 않음).
"""
from __future__ import annotations

from typing import Any

from locaville.dbcom import fetch_all

# 같은 raw JOIN 을 두 곳에 중복 두지 않기 위해 헬퍼 위임.
from app.repositories.diary_rdb import _fetch_journals_with_context
from app.repositories.todo_rdb import _fetch_todo_board_rows


# ============================================================
# 농가별 요약 (구 vw_jeotan_farmer_summary 대체)
# ============================================================

_FARMER_SUMMARY_SELECT = """
    SELECT
        af.amo_regno,
        af.amo_name,
        af.chief_no AS user_no,
        um.user_name,
        um.status_cd,
        um.phone_no,
        um.zip_cd,
        um.addr_1 AS home_addr_1,
        um.addr_2 AS home_addr_2,
        v.ville_name,
        COALESCE(parcels.cnt, 0) AS parcel_count,
        COALESCE(parcels.rice, 0) AS rice_area,
        COALESCE(todos.tot, 0) AS todo_count,
        COALESCE(todos.done, 0) AS done_todo_count,
        COALESCE(todos.delayed, 0) AS delayed_todo_count,
        COALESCE(journals.cnt, 0) AS journal_count,
        COALESCE(evidences.cnt, 0) AS evidence_count
    FROM amo_family af
    LEFT JOIN village v ON v.ville_id = af.ville_id
    LEFT JOIN user_master um ON um.user_no = af.chief_no
    LEFT JOIN (
        SELECT amo_regno,
               COUNT(*) AS cnt,
               SUM(CASE WHEN parcel_usage = 'RPA' THEN parcel_area ELSE 0 END) AS rice
        FROM parcel
        GROUP BY amo_regno
    ) AS parcels ON parcels.amo_regno = af.amo_regno
    LEFT JOIN (
        SELECT amo_regno,
               COUNT(*) AS tot,
               COUNT(CASE WHEN job_progress = 'END' THEN 1 END) AS done,
               COUNT(CASE WHEN job_progress IN ('DLY','DLYS','DLYE') THEN 1 END) AS delayed
        FROM prj_todo_list
        GROUP BY amo_regno
    ) AS todos ON todos.amo_regno = af.amo_regno
    LEFT JOIN (
        SELECT amo_regno, COUNT(*) AS cnt FROM journal
        WHERE deleted_dt IS NULL
        GROUP BY amo_regno
    ) AS journals ON journals.amo_regno = af.amo_regno
    LEFT JOIN (
        SELECT amo_regno, COUNT(*) AS cnt FROM evidence
        WHERE deleted_dt IS NULL
        GROUP BY amo_regno
    ) AS evidences ON evidences.amo_regno = af.amo_regno
"""


def fetch_farmer_summary(
    *,
    amo_regno: str | None = None,
) -> list[dict[str, Any]]:
    """저탄마을 농가별 요약 한 줄씩 반환.

    각 row 의 컬럼:
      amo_regno, amo_name, user_no(=chief_no), user_name, ville_name,
      parcel_count, rice_area (논 면적 합계),
      todo_count, done_todo_count, delayed_todo_count,
      journal_count, evidence_count, todo_completion_rate

    ``todo_completion_rate`` (0~1 비율) 는 SQL CAST/DIVIDE 의 DBMS 별 차이를
    회피하기 위해 Python 단에서 계산.
    """
    where: list[str] = []
    params: list[Any] = []
    if amo_regno:
        where.append("af.amo_regno = %s")
        params.append(amo_regno)
    sql = _FARMER_SUMMARY_SELECT
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY af.amo_regno"

    rows = fetch_all(sql, params)
    for r in rows:
        tot = int(r.get("todo_count") or 0)
        done = int(r.get("done_todo_count") or 0)
        r["todo_completion_rate"] = (done / tot) if tot else 0
    return rows


# ============================================================
# 할 일 게시판 (구 vw_jeotan_todo_board 대체)
# ============================================================

def fetch_todo_board(
    *,
    amo_regno: str | None = None,
    group_no: int | None = None,
    prj_id: str | None = None,
    activity_id: str | None = None,
    job_progress: str | None = None,
    limit: int = 200,
) -> list[dict[str, Any]]:
    """저탄마을 todo board — todo_rdb 의 raw JOIN 헬퍼에 위임.

    노출 컬럼: group_no, group_name, amo_regno, amo_name, user_name,
              prj_id, prj_name, activity_id, activity_name,
              job_seq, job_cd, job_name,
              est_start_date, real_start_date, est_end_date, real_end_date,
              job_progress, job_progress_name, remark
    """
    return _fetch_todo_board_rows(
        amo_regno=amo_regno,
        group_no=group_no,
        prj_id=prj_id,
        activity_id=activity_id,
        job_progress=job_progress,
        limit=limit,
    )


# ============================================================
# 영농일지 + 증빙 통합 (구 vw_jeotan_journal_evidence 대체)
# ============================================================

def fetch_journal_evidence(
    *,
    amo_regno: str | None = None,
    user_no: int | None = None,
    job_date: str | None = None,
    job_date_from: str | None = None,
    job_date_to: str | None = None,
    prj_id: str | None = None,
    job_cd: str | None = None,
    job_cmpl_yn: str | None = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    """저탄마을 영농일지 + 증빙 통합 조회 — diary_rdb 의 raw JOIN 헬퍼에 위임.

    노출 컬럼: amo_regno, amo_name, user_no, user_name,
              job_date, exec_no, job_cd, job_name, exec_desc,
              input_type_cd, job_cmpl_yn,
              parcel_no, parcel_regno,
              prj_id, prj_name, activity_id, activity_name, job_seq,
              evidence_count, evidence_types, evidence_files
    evidence_types / evidence_files 는 Python 측 집계 결과 (콤마 / ' | ' 구분).
    """
    return _fetch_journals_with_context(
        amo_regno=amo_regno,
        user_no=user_no,
        job_date=job_date,
        job_date_from=job_date_from,
        job_date_to=job_date_to,
        prj_id=prj_id,
        job_cd=job_cd,
        job_cmpl_yn=job_cmpl_yn,
        limit=limit,
    )


# ============================================================
# 보조 직접 쿼리 (view 가 아닌 evidence/journal 행 단위 조회)
# ============================================================

def fetch_recent_evidence(
    *,
    amo_regno: str | None = None,
    limit: int = 5,
) -> list[dict[str, Any]]:
    """대시보드 '최근 증빙' 카드용 — evidence 테이블에서 직접 행 단위 조회."""
    # 이장님이 soft-delete 한 증빙은 최근 목록에서도 제외.
    where: list[str] = ["e.deleted_dt IS NULL"]
    params: list[Any] = []
    if amo_regno:
        where.append("e.amo_regno = %s")
        params.append(amo_regno)
    where_clause = "WHERE " + " AND ".join(where)
    sql = f"""
        SELECT
            e.amo_regno,
            af.amo_name,
            e.user_no,
            um.user_name,
            e.seq_no,
            e.job_date,
            e.exec_no,
            e.capture_dt,
            e.ai_label,
            e.evid_cd,
            e.file_path,
            e.raw_json,
            e.reg_dt,
            e.mod_dt
        FROM evidence e
        JOIN amo_family af ON af.amo_regno = e.amo_regno
        JOIN user_master um ON um.user_no = e.user_no
        {where_clause}
        ORDER BY e.reg_dt DESC, e.job_date DESC, e.exec_no DESC, e.seq_no DESC
        LIMIT %s
    """
    params.append(max(1, min(int(limit), 50)))
    return fetch_all(sql, params)


def fetch_latest_work_dates() -> dict[str, str]:
    """농가별 가장 최근 ``job_date`` 매핑 ``{amo_regno: 'YYYY-MM-DD'}``."""
    sql = """
        SELECT amo_regno, MAX(job_date) AS latest_work_date
        FROM journal
        WHERE deleted_dt IS NULL
        GROUP BY amo_regno
    """
    rows = fetch_all(sql)
    result: dict[str, str] = {}
    for row in rows:
        amo = row.get("amo_regno")
        d = row.get("latest_work_date")
        if amo and d is not None:
            result[amo] = d.isoformat() if hasattr(d, "isoformat") else str(d)
    return result


def fetch_evidence_status_counts() -> dict[str, int]:
    """``evidence.raw_json.status`` 별 카운트 — 검토 필요 KPI 용.

    신 스키마에서 status 는 별도 컬럼이 없고 evidence.raw_json 에 보관합니다.
    ``raw_json.status`` 가 없는 행은 결과에 포함되지 않습니다.
    """
    sql = "SELECT raw_json FROM evidence WHERE raw_json IS NOT NULL AND deleted_dt IS NULL"
    rows = fetch_all(sql)
    counts: dict[str, int] = {}
    for row in rows:
        raw_json = row.get("raw_json")
        if isinstance(raw_json, str):
            try:
                import json as _json
                raw_json = _json.loads(raw_json)
            except Exception:  # noqa: BLE001 — 데이터 파싱 fallback (DB 오류와 무관)
                raw_json = {}
        if not isinstance(raw_json, dict):
            continue
        status = str(raw_json.get("status") or "").strip()
        if not status:
            continue
        counts[status] = counts.get(status, 0) + 1
    return counts


# ============================================================
# 사업 참여 농가 / 마을 단체 멤버 — 이장 대시보드 상세 화면용
# ============================================================

def fetch_project_members(prj_id: str) -> list[dict[str, Any]]:
    """사업(prj_id) 에 등록된 참여 농가 목록.

    `act_grp` 의 (group_no, amo_regno) DISTINCT 를 기준으로 농가 단위 한 줄씩.
    각 row 의 컬럼:
      amo_regno, amo_name, user_no(=chief_no), user_name, phone_no,
      group_no, group_name

    한 농가가 같은 사업에 여러 활동에 등록돼 있어도 한 줄로 합쳐서 반환.
    `prj_grp` 단계만 진행하고 `act_grp` 가 비어 있으면 결과는 빈 배열.
    """
    sql = """
        SELECT DISTINCT
            ag.amo_regno,
            af.amo_name,
            af.chief_no AS user_no,
            um.user_name,
            um.phone_no,
            ag.group_no,
            vg.group_name
        FROM act_grp ag
        LEFT JOIN amo_family af
            ON af.amo_regno = ag.amo_regno
        LEFT JOIN user_master um
            ON um.user_no = af.chief_no
        LEFT JOIN ville_group vg
            ON vg.group_no = ag.group_no
        WHERE ag.prj_id = %s
        ORDER BY af.amo_name, ag.amo_regno
    """
    return fetch_all(sql, [prj_id]) or []


def fetch_village_group_members(group_no: int) -> list[dict[str, Any]]:
    """마을 단체(group_no) 의 활동 멤버 (group_member.active_yn='Y').

    각 row 의 컬럼:
      amo_regno, amo_name, user_no(=chief_no), user_name, phone_no, is_leader

    `is_leader` 는 ville_group.chief_no 와 amo_family.chief_no 의 일치 여부.
    """
    sql = """
        SELECT
            gm.amo_regno,
            af.amo_name,
            af.chief_no AS user_no,
            um.user_name,
            um.phone_no,
            CASE WHEN vg.chief_no = af.chief_no THEN 'Y' ELSE 'N' END AS is_leader
        FROM group_member gm
        JOIN ville_group vg
            ON vg.group_no = gm.group_no
        JOIN amo_family af
            ON af.amo_regno = gm.amo_regno
        LEFT JOIN user_master um
            ON um.user_no = af.chief_no
        WHERE gm.group_no = %s
          AND (gm.active_yn IS NULL OR gm.active_yn = 'Y')
        ORDER BY af.amo_name, gm.amo_regno
    """
    return fetch_all(sql, [group_no]) or []
