"""신 스키마(`vw_jeotan_journal_evidence` + `journal`/`prj_journal` 직접) 기반 일지 repository.

기존 호출처 호환을 위해 다음 이름들은 그대로 유지합니다:
  - DiaryMySQLConflictError
  - _status_to_job_cmpl_yn / _job_cmpl_yn_to_status
  - _parse_ai_result_json / _build_ai_result_json
  - list_diaries_mysql / get_diary_by_id_mysql / create_diary_mysql

조회 경로는 `vw_jeotan_journal_evidence` 한 번으로 모두 해결합니다.
저장 경로는 journal + prj_journal 두 테이블 동시 INSERT.
"""
from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from locaville.dbcom import DBExecutionError, execute, fetch_all, transaction

from app.repositories.identity_rdb import (
    resolve_amo_regno,
    resolve_group_nos_for_amo,
    resolve_parcel_no_int,
    resolve_user_no,
    resolve_user_record,
    next_exec_no,
)
from app.utils.todo_id import build_todo_id


class DiaryMySQLConflictError(Exception):
    pass


# ============================================================
# 기존 호출처(diary_service)가 import 하던 헬퍼들 — 호환 유지
# ============================================================

def _parse_ai_result_json(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str) and value.strip():
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            return {}
    return {}


def _status_to_job_cmpl_yn(status_value: str | None) -> str:
    normalized = (status_value or "").strip().lower()
    if normalized in {"pending", "draft", "in_progress"}:
        return "N"
    return "Y"


def _job_cmpl_yn_to_status(job_cmpl_yn: Any, fallback: str = "saved") -> str:
    normalized = str(job_cmpl_yn or "").strip().upper()
    if normalized == "N":
        return "in_progress"
    if normalized == "Y":
        return "saved"
    return fallback


def _build_ai_result_json(record: dict[str, Any]) -> dict[str, Any]:
    """journal.ai_result_json 에 보관할 API 사이드 메타데이터.

    신 스키마에는 worker_name/crop_name/field_address 등이 없으므로 여기에 보관합니다.
    Step 5 INSERT 시 사용.
    """
    return {
        "api_diary_id": record.get("diary_id", ""),
        "todo_id": record.get("todo_id", ""),
        "project_id": record.get("project_id", ""),
        "prj_id": record.get("prj_id", ""),
        "farmer_name": record.get("farmer_name", ""),
        "worker_name": record.get("worker_name", ""),
        "field_id": record.get("field_id", ""),
        "parcel_regno": record.get("parcel_regno", ""),
        "field_address": record.get("field_address", ""),
        "crop_name": record.get("crop_name", ""),
        "activity_id": record.get("activity_id", ""),
        "job_cd": record.get("job_cd", ""),
        "work_stage": record.get("work_stage", ""),
        "work_stage_detail": record.get("work_stage_detail", ""),
        "work_detail": record.get("work_detail", ""),
        "linked_evidence_ids": record.get("linked_evidence_ids", []),
        "status": record.get("status", "saved"),
        # STT 학습 메타 — 음성으로 입력한 경우 STT 원본 / 추천된 job_cd 보존.
        "voice_text": record.get("voice_text", ""),
        "voice_audio_url": record.get("voice_audio_url", ""),
        "voice_predicted_job_cd": record.get("voice_predicted_job_cd", ""),
    }


# ============================================================
# diary_id 합성/파싱
# ============================================================
#  형식: {user_no}-{yyyymmdd}-{exec_no}  예) "1000000101-20260521-1"
#  Step 5 의 INSERT 도 동일 합성식을 사용해서 API 가 그대로 라운드트립 됩니다.

def _compose_diary_id(user_no: int | None, job_date: Any, exec_no: int | None) -> str:
    """journal 의 3중키를 `{user_no}-{yyyymmdd}-{exec_no}` 문자열로 합성.

    하나라도 None 이면 빈 문자열을 돌려줘서 응답 매핑이 깨지지 않게 함.
    """
    if user_no is None or job_date is None or exec_no is None:
        return ""
    if hasattr(job_date, "strftime"):
        d = job_date.strftime("%Y%m%d")
    else:
        d = str(job_date).replace("-", "")
    return f"{user_no}-{d}-{exec_no}"


def _parse_diary_id(diary_id: str) -> tuple[int, str, int] | None:
    """`{user_no}-{yyyymmdd}-{exec_no}` 파싱.

    실패 시 None. 구 형식 (UUID hex 등) 도 None — 구 형식은 신 스키마에서 매칭 불가.
    """
    if not diary_id:
        return None
    parts = diary_id.split("-")
    if len(parts) < 3:
        return None
    try:
        user_no = int(parts[0])
        ymd = parts[1]
        exec_no = int(parts[2])
    except ValueError:
        return None
    if len(ymd) != 8 or not ymd.isdigit():
        return None
    job_date = f"{ymd[0:4]}-{ymd[4:6]}-{ymd[6:8]}"
    return (user_no, job_date, exec_no)


# ============================================================
# view row → DiaryRecord 호환 dict
# ============================================================

def _map_view_row_to_diary(row: dict[str, Any]) -> dict[str, Any]:
    """vw_jeotan_journal_evidence row → DiaryRecord 호환 dict.

    DiaryRecord 의 required 필드(worker_name/field_id/crop_name/work_stage/work_detail) 는
    view 가 직접 제공하지 않는 경우가 있어 안전한 빈 값으로 채웁니다.
    """
    user_no = row.get("user_no")
    job_date = row.get("job_date")
    exec_no = row.get("exec_no")
    amo_regno = row.get("amo_regno") or ""
    amo_name = row.get("amo_name") or ""
    user_name = row.get("user_name") or ""
    job_name = row.get("job_name") or ""
    activity_name = row.get("activity_name") or ""
    prj_id = row.get("prj_id") or ""
    activity_id = row.get("activity_id") or ""
    job_cd = row.get("job_cd") or ""
    job_seq = row.get("job_seq")
    parcel_no_int = row.get("parcel_no")
    parcel_regno = row.get("parcel_regno") or ""

    todo_id = ""
    if amo_regno and prj_id and activity_id and job_seq is not None:
        todo_id = build_todo_id(amo_regno, prj_id, activity_id, job_seq)

    return {
        # 식별자
        "diary_id": _compose_diary_id(user_no, job_date, exec_no),
        "todo_id": todo_id,
        "project_id": prj_id,
        "prj_id": prj_id,
        # prj_journal + ville_group JOIN 으로 일지가 어느 단체 활동인지 노출.
        # residents 화면의 참여단체 탭이 실제 group_name 으로 표시하는 데 사용.
        "group_no": row.get("group_no"),
        "group_name": row.get("group_name") or "",
        # journal 복합 PK 원본값 — evidence 가 parent journal exec_no 를 찾을 때 필요.
        "user_no": user_no,
        "job_date": job_date,
        "exec_no": exec_no,
        "amo_regno": amo_regno,
        # 농가/사용자
        "farmer_id": amo_regno,
        "farmer_name": amo_name or user_name,
        "worker_name": user_name or amo_name,
        # 작업
        "work_date": job_date,
        "field_id": parcel_regno or (str(parcel_no_int) if parcel_no_int is not None else ""),
        "parcel_no": str(parcel_no_int) if parcel_no_int is not None else "",
        "parcel_regno": parcel_regno,
        "field_address": "",  # view 가 노출하지 않음
        "crop_name": "",  # 신 스키마 journal 에는 crop 컬럼이 없음
        "activity_id": activity_id,
        "job_cd": job_cd,
        "work_stage": job_name,
        "work_stage_detail": activity_name,
        "work_detail": row.get("exec_desc") or "",
        # 메타
        "linked_evidence_ids": _evidence_ids_from_view(row, user_no, job_date, exec_no),
        "status": _job_cmpl_yn_to_status(row.get("job_cmpl_yn")),
        "input_type_cd": row.get("input_type_cd") or "",
        "created_at": datetime.now(),  # view 가 reg_dt 를 안 노출 — Step 5 에서 view 수정 또는 별도 쿼리로 보강
        "updated_at": datetime.now(),
    }


def _evidence_ids_from_view(
    row: dict[str, Any],
    user_no: int | None,
    job_date: Any,
    exec_no: int | None,
) -> list[str]:
    """view.evidence_files (GROUP_CONCAT) 갯수를 보고 evidence_id 1..N 을 합성.

    view 는 evidence 의 seq_no 를 보존하지 않으므로 정확한 seq_no 매칭은 불가.
    이 함수는 화면 표시용 ID 후보를 만들 뿐, 실제 단건 조회는 evidence_id 직접 파싱으로 합니다.
    """
    if user_no is None or job_date is None or exec_no is None:
        return []
    count = int(row.get("evidence_count") or 0)
    if count <= 0:
        return []
    base = _compose_diary_id(user_no, job_date, exec_no)
    return [f"{base}-{i}" for i in range(1, count + 1)]


# ============================================================
# 조회 — view 없이 raw JOIN + evidence 2-step fetch
# ============================================================
#
# 이전에는 ``admin_view_rdb.fetch_journal_evidence`` 가 호출하는 view
# ``vw_jeotan_journal_evidence`` 를 사용했으나, 다음 이유로 코드 측 raw JOIN 으로
# 전환합니다:
#   1) view 가 사용하는 ``GROUP_CONCAT`` (mysql) / ``STRING_AGG`` (postgres) 함수가
#      DBMS 별로 달라 단일 DDL 로 양쪽 호환 불가.
#   2) view DDL 누락 시 ``except Exception: return []`` 로 조용히 실패해
#      가이드의 "충돌 무시 금지" 원칙 위반.
#   3) view 동기화 부담 (DBA 따로, 코드 따로) 제거.
# evidence 집계는 일지 fetch 후 별도 SELECT 로 한 번 더 (2-step) 호출. 페이지당
# 50~100 건 규모에서 비용 부담 없음.


_JOURNAL_BASE_SELECT = """
    SELECT
        j.user_no,
        j.job_date,
        j.exec_no,
        j.job_cd,
        j.exec_desc,
        j.amo_regno,
        j.ai_result_json,
        j.input_type_cd,
        j.job_cmpl_yn,
        j.parcel_no,
        af.amo_name,
        um.user_name,
        fj.job_name,
        p.parcel_regno,
        pj.prj_id,
        pj.activity_id,
        pj.job_seq,
        pj.group_no,
        pr.prj_name,
        pa.activity_name,
        vg.group_name,
        j.reg_dt
    FROM journal j
    LEFT JOIN amo_family af ON af.amo_regno = j.amo_regno
    LEFT JOIN user_master um ON um.user_no = j.user_no
    LEFT JOIN farm_job fj ON fj.job_cd = j.job_cd
    LEFT JOIN parcel p ON p.amo_regno = j.amo_regno AND p.parcel_no = j.parcel_no
    LEFT JOIN prj_journal pj
        ON pj.user_no = j.user_no
       AND pj.job_date = j.job_date
       AND pj.exec_no = j.exec_no
    LEFT JOIN project pr ON pr.prj_id = pj.prj_id
    LEFT JOIN prj_activity pa
        ON pa.prj_id = pj.prj_id
       AND pa.activity_id = pj.activity_id
    LEFT JOIN ville_group vg ON vg.group_no = pj.group_no
"""


def _fetch_journals_with_context(
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
    """journal 기준 LEFT JOIN 으로 일지 + 농가/사용자/작업/필지/프로젝트 컨텍스트 조회.

    evidence 집계 컬럼(``evidence_count``/``evidence_files``/``evidence_types``)은
    여기서 채우지 않고 ``_attach_evidence_summary`` 가 2-step 으로 별도 SELECT.
    표준 SQL 만 사용해 mysql/postgres 양쪽 그대로 작동.
    """
    # 이장님이 soft-delete 한 일지는 목록에서 항상 숨김.
    where: list[str] = ["j.deleted_dt IS NULL"]
    params: list[Any] = []
    if amo_regno:
        where.append("j.amo_regno = %s")
        params.append(amo_regno)
    if user_no is not None:
        where.append("j.user_no = %s")
        params.append(user_no)
    if job_date:
        where.append("j.job_date = %s")
        params.append(job_date)
    if job_date_from:
        where.append("j.job_date >= %s")
        params.append(job_date_from)
    if job_date_to:
        where.append("j.job_date <= %s")
        params.append(job_date_to)
    if prj_id:
        where.append("pj.prj_id = %s")
        params.append(prj_id)
    if job_cd:
        where.append("j.job_cd = %s")
        params.append(job_cd)
    if job_cmpl_yn:
        where.append("j.job_cmpl_yn = %s")
        params.append(job_cmpl_yn)

    sql = _JOURNAL_BASE_SELECT
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY j.job_date DESC, j.user_no, j.exec_no DESC LIMIT %s"
    params.append(max(1, min(int(limit), 500)))

    rows = fetch_all(sql, params)
    return _attach_evidence_summary(rows)


def _attach_evidence_summary(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """journal row 들에 대해 evidence (user_no, job_date, exec_no) 단위로 집계 정보를 부착.

    ``evidence_count`` (int), ``evidence_types`` (콤마 문자열), ``evidence_files``
    (' | ' 구분 문자열) 키를 각 행에 추가. evidence 가 없는 일지는 0/빈 문자열.

    DBMS 중립을 위해 GROUP_CONCAT/STRING_AGG 대신 Python 측 집계.
    """
    if not rows:
        return rows
    keys = [(r.get("user_no"), r.get("job_date"), r.get("exec_no")) for r in rows]
    keys = [k for k in keys if all(v is not None for v in k)]
    if not keys:
        for r in rows:
            r["evidence_count"] = 0
            r["evidence_types"] = ""
            r["evidence_files"] = ""
        return rows

    # (user_no, job_date, exec_no) IN ((..),(..),...) — mysql/postgres 둘 다 표준 지원.
    tuple_placeholders = ", ".join(["(%s, %s, %s)"] * len(keys))
    params: list[Any] = []
    for k in keys:
        params.extend(k)
    sql = f"""
        SELECT user_no, job_date, exec_no, seq_no, evid_cd, file_path
        FROM evidence
        WHERE deleted_dt IS NULL
          AND (user_no, job_date, exec_no) IN ({tuple_placeholders})
        ORDER BY user_no, job_date, exec_no, seq_no
    """
    evidences = fetch_all(sql, params)

    grouped: dict[tuple, list[dict[str, Any]]] = {}
    for ev in evidences:
        key = (ev.get("user_no"), ev.get("job_date"), ev.get("exec_no"))
        grouped.setdefault(key, []).append(ev)

    for r in rows:
        key = (r.get("user_no"), r.get("job_date"), r.get("exec_no"))
        evs = grouped.get(key, [])
        r["evidence_count"] = len(evs)
        r["evidence_types"] = ",".join(str(e.get("evid_cd") or "") for e in evs if e.get("evid_cd"))
        r["evidence_files"] = " | ".join(str(e.get("file_path") or "") for e in evs if e.get("file_path"))
    return rows


# ============================================================
# 조회 — 신 스키마
# ============================================================

def list_diaries_mysql(
    *,
    farmer_id: str | None = None,
    status: str | None = None,
    work_date: str | None = None,
    prj_id: str | None = None,
    project_id: str | None = None,
    activity_id: str | None = None,
    job_cd: str | None = None,
    group_no: int | None = None,
    parcel_no: str | None = None,
    field_id: str | None = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    """vw_jeotan_journal_evidence 에서 일지 목록 조회.

    farmer_id 는 login_id/farmer_regno/user_no/amo_regno 중 무엇이든 받아서
    user_master + farmer 경로로 amo_regno 또는 user_no 로 해석합니다.
    마을·접두사 필터는 없음 — 호출 측이 farmer_id/group_no 로 좁힘.
    """

    # farmer_id → amo_regno / user_no 해석
    amo_regno: str | None = None
    user_no: int | None = None
    if farmer_id:
        amo_regno = resolve_amo_regno(farmer_id)
        if not amo_regno:
            user_no = resolve_user_no(farmer_id)
        # 어느 쪽도 해석 안 되면 빈 결과 (다른 마을 사용자거나 미등록)
        if not amo_regno and user_no is None:
            return []

    # 프로젝트 ID alias 처리
    effective_prj_id = prj_id or project_id

    # job_cmpl_yn 으로 status 매핑
    job_cmpl_yn: str | None = None
    if status:
        job_cmpl_yn = _status_to_job_cmpl_yn(status)

    rows = _fetch_journals_with_context(
        amo_regno=amo_regno,
        user_no=user_no,
        job_date=work_date,
        prj_id=effective_prj_id,
        job_cd=job_cd,
        job_cmpl_yn=job_cmpl_yn,
        limit=limit,
    )

    # view 가 노출하지 않는 활동/필지 필터는 Python 후처리
    if activity_id:
        rows = [r for r in rows if (r.get("activity_id") or "") == activity_id]
    if parcel_no:
        # parcel_no 가 숫자/문자열 어느 쪽이든 비교
        rows = [
            r
            for r in rows
            if str(r.get("parcel_no") or "") == str(parcel_no)
            or (r.get("parcel_regno") or "") == str(parcel_no)
        ]
    if field_id and not parcel_no:
        # 구 호출 호환: field_id 도 parcel_regno 와 같게 취급
        rows = [
            r
            for r in rows
            if (r.get("parcel_regno") or "") == str(field_id)
            or str(r.get("parcel_no") or "") == str(field_id)
        ]

    return [_map_view_row_to_diary(r) for r in rows]


def get_diary_by_id_mysql(diary_id: str) -> dict[str, Any] | None:
    """`{user_no}-{yyyymmdd}-{exec_no}` 형식의 diary_id 로 단건 조회."""
    parsed = _parse_diary_id(diary_id)
    if not parsed:
        return None
    user_no, job_date, exec_no = parsed
    rows = _fetch_journals_with_context(
        user_no=user_no,
        job_date=job_date,
        limit=10,
    )
    for r in rows:
        if int(r.get("exec_no") or 0) == exec_no:
            return _map_view_row_to_diary(r)
    return None


def count_diaries_since(since_dt: datetime | None) -> int:
    """이장님 사이드바 배지용 — since_dt 이후 등록된 (삭제 안 된) 일지 개수.

    since_dt 가 None 이면 0 반환 (배지 의미 없음).
    """
    if since_dt is None:
        return 0
    sql = """
        SELECT COUNT(*) AS cnt
        FROM journal
        WHERE deleted_dt IS NULL
          AND reg_dt > %s
    """
    rows = fetch_all(sql, [since_dt])
    if not rows:
        return 0
    return int(rows[0].get("cnt") or 0)


def soft_delete_diary_mysql(diary_id: str) -> bool:
    """이장님 검토 결과 잘못된 일지를 숨김 처리. journal.deleted_dt = NOW().

    journal row 와 prj_journal row 는 PK 가 동일 (user_no, job_date, exec_no) 이므로
    JOIN 시 journal.deleted_dt IS NULL 만 체크하면 자동으로 같이 숨겨진다.
    연결된 evidence 도 함께 숨길지 여부: 현재 정책은 일지/증빙 독립 — 사용자가
    각각 따로 삭제. (한 일지에 묶인 사진이 따로 의미 있을 수 있어 신중)

    반환: 1건 이상 UPDATE 되면 True.
    """
    parsed = _parse_diary_id(diary_id)
    if not parsed:
        return False
    user_no, job_date, exec_no = parsed
    sql = """
        UPDATE journal
           SET deleted_dt = %s
         WHERE user_no = %s
           AND job_date = %s
           AND exec_no = %s
           AND deleted_dt IS NULL
    """
    affected = execute(sql, [datetime.now(), user_no, job_date, exec_no])
    return bool(affected)


# ============================================================
# 저장 — 신 스키마 INSERT (journal + 선택적 prj_journal)
# ============================================================

def _fit_text(value: Any, max_len: int) -> str:
    text = str(value or "").strip()
    return text[:max_len]


def _normalize_job_date_str(value: Any) -> str:
    """API 가 보내는 work_date 를 'YYYY-MM-DD' 문자열로 정규화."""
    if value is None:
        return ""
    if hasattr(value, "isoformat"):
        s = value.isoformat()
    else:
        s = str(value).strip()
    if "T" in s:
        s = s.split("T", 1)[0]
    return s[:10]


def _resolve_project_context(record: dict[str, Any]) -> tuple[str, str, int | None]:
    """record 에서 (prj_id, activity_id, job_seq) 를 가능한 방법으로 추출.

    1) record 의 명시 필드: prj_id / project_id, activity_id, job_seq
    2) todo_id ("{amo_regno}-{prj_id}-{activity_id}-{job_seq}") 가 있으면 파싱
    """
    prj_id = str(record.get("prj_id") or record.get("project_id") or "").strip()
    activity_id = str(record.get("activity_id") or "").strip()
    job_seq_raw = record.get("job_seq")
    job_seq: int | None
    try:
        job_seq = int(job_seq_raw) if job_seq_raw is not None and str(job_seq_raw) != "" else None
    except (TypeError, ValueError):
        job_seq = None

    if not (prj_id and activity_id and job_seq is not None):
        todo_id = str(record.get("todo_id") or "").strip()
        if todo_id:
            parts = todo_id.split("-")
            # 신 형식: amo_regno - prj_id - activity_id - job_seq (4 parts)
            if len(parts) >= 4:
                _, tp_prj, tp_activity, tp_seq = parts[0], parts[1], parts[2], parts[3]
                if not prj_id and tp_prj:
                    prj_id = tp_prj
                if not activity_id and tp_activity:
                    activity_id = tp_activity
                if job_seq is None:
                    try:
                        job_seq = int(tp_seq)
                    except ValueError:
                        pass
    return prj_id, activity_id, job_seq


def create_diary_mysql(record: dict[str, Any]) -> dict[str, Any]:
    """신 스키마 영농일지 저장.

    저장 흐름:
      1) farmer_id → user_no, amo_regno 해석 (user_master + farmer 경유)
      2) work_date → YYYY-MM-DD, parcel_no/field_id → INT FK 정규화
      3) (user_no, job_date) 내 MAX(exec_no)+1 채번 — 중복 키 발생 시 1회 재시도
      4) journal INSERT
      5) 사업/활동 컨텍스트가 있으면 같은 (user_no, job_date, exec_no) 로 prj_journal INSERT
      6) view 로 다시 조회하여 응답 dict 반환

    실패 조건:
      - farmer_id 가 user_master/farmer 에 없으면 ValueError
      - 동일 (user_no, job_date, exec_no) 가 이미 있고 재시도 후에도 충돌이면 DiaryMySQLConflictError
    """
    # ---- 1) 신원 해석 ----
    farmer_id = str(record.get("farmer_id") or "").strip()
    if not farmer_id:
        raise ValueError("farmer_id is required")
    user_rec = resolve_user_record(farmer_id)
    if not user_rec or user_rec.get("user_no") is None:
        raise ValueError(f"Unknown farmer_id: {farmer_id}")
    user_no = int(user_rec["user_no"])
    amo_regno = (
        (user_rec.get("amo_regno") or "").strip()
        or str(record.get("amo_regno") or "").strip()
    )
    if not amo_regno:
        raise ValueError(
            f"farmer_id={farmer_id} has no amo_regno mapping in farmer table"
        )

    # ---- 2) 필드 정규화 ----
    job_date_str = _normalize_job_date_str(record.get("work_date") or record.get("job_date"))
    if not job_date_str:
        raise ValueError("work_date is required")

    job_cd = _fit_text(record.get("job_cd"), 8)
    if not job_cd:
        # job_cd 가 비면 journal.job_cd(NOT NULL) 위반. 음성/직접입력처럼 to-do 없이 들어오는
        # 자유 일지는 job_cd 가 없을 수 있으므로, farm_job 마스터에 존재하는 catch-all 코드
        # 'V0001'(마을 공동활동) 로 폴백한다. (작업 상세는 work_stage/exec_desc 에 그대로 보존)
        job_cd = "V0001"

    parcel_input = record.get("parcel_no") or record.get("parcel_regno") or record.get("field_id")
    parcel_no_int = resolve_parcel_no_int(parcel_input)

    job_cmpl_yn = _status_to_job_cmpl_yn(record.get("status"))
    input_type_cd = _fit_text(record.get("input_type_cd"), 8)
    exec_desc = (record.get("work_detail") or record.get("exec_desc") or "")[:255]
    prj_id, activity_id, job_seq = _resolve_project_context(record)
    prj_group_no: int | None = None
    prj_sql = ""
    prj_params: list[Any] = []
    if prj_id and activity_id and job_seq is not None:
        prj_sql = """
            INSERT INTO prj_journal (
                group_no, amo_regno, user_no, prj_id, activity_id,
                job_seq, job_cd, job_date, exec_no, parcel_no, reg_dt, reg_no
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """
        # 농가의 실제 group_no 를 동적 해석 (record 에 명시되면 그것이 우선).
        record_group_no = record.get("group_no")
        if record_group_no in (None, ""):
            groups = resolve_group_nos_for_amo(amo_regno)
            if not groups:
                raise ValueError(
                    f"농가({amo_regno}) 의 group_no 를 해석할 수 없어 prj_journal 을 저장할 수 없습니다."
                )
            prj_group_no = groups[0]
        else:
            prj_group_no = int(record_group_no)

    # ---- 3) exec_no 채번 + 4) journal INSERT (1회 재시도) ----
    composed_diary_id = ""
    exec_no = 0
    last_error: Exception | None = None
    for attempt in range(2):
        exec_no = next_exec_no(user_no, job_date_str)
        ai_result = _build_ai_result_json(record)
        composed_diary_id = _compose_diary_id(user_no, job_date_str, exec_no)
        ai_result["api_diary_id"] = composed_diary_id

        sql = """
            INSERT INTO journal (
                amo_regno, user_no, job_cd, job_date, exec_no,
                exec_desc, ai_result_json, input_type_cd, job_cmpl_yn,
                parcel_no, reg_dt, reg_no
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """
        params = [
            amo_regno,
            user_no,
            job_cd,
            job_date_str,
            exec_no,
            exec_desc,
            json.dumps(ai_result, ensure_ascii=False, default=str),
            input_type_cd,
            job_cmpl_yn,
            parcel_no_int,
            datetime.now(),
            user_no,
        ]
        try:
            with transaction() as conn:
                execute(sql, params, connection=conn, commit=False)
                if prj_sql:
                    prj_params = [
                        prj_group_no,
                        amo_regno,
                        user_no,
                        prj_id,
                        activity_id,
                        int(job_seq),
                        job_cd,
                        job_date_str,
                        exec_no,
                        parcel_no_int,
                        datetime.now(),
                        user_no,
                    ]
                    execute(prj_sql, prj_params, connection=conn, commit=False)
            last_error = None
            break
        except DBExecutionError as exc:
            last_error = exc
            # exec_no 동시성 충돌 가능성 — 한 번만 재시도
            if attempt == 0 and "duplicate" in str(exc).lower():
                continue
            # detail 에 원본 SQL exception 의 짧은 요약을 같이 노출 — 시연 디버깅 가독성 ↑.
            cause = str(exc)[:240].replace("\n", " ")
            detail = (
                f"Duplicate diary context (user_no={user_no}, job_date={job_date_str}, exec_no={exec_no}) — {cause}"
                if "duplicate" in str(exc).lower()
                else f"Failed to save diary context (user_no={user_no}, job_date={job_date_str}, exec_no={exec_no}) — {cause}"
            )
            raise DiaryMySQLConflictError(
                detail
            ) from exc

    if last_error is not None:
        raise DiaryMySQLConflictError(
            f"Failed to allocate exec_no for (user_no={user_no}, job_date={job_date_str})"
        ) from last_error

    # ---- 6) view 로 재조회 ----
    saved = get_diary_by_id_mysql(composed_diary_id)
    if saved:
        return saved
    # view 가 즉시 반영 안 되거나 LEFT JOIN 미스 시 폴백
    return {
        "diary_id": composed_diary_id,
        "todo_id": (
            build_todo_id(amo_regno, prj_id, activity_id, job_seq)
            if prj_id and activity_id and job_seq is not None
            else ""
        ),
        "project_id": prj_id,
        "prj_id": prj_id,
        "group_no": prj_group_no,
        "farmer_id": amo_regno,
        "farmer_name": user_rec.get("user_name") or "",
        "worker_name": record.get("worker_name") or user_rec.get("user_name") or "",
        "work_date": job_date_str,
        "field_id": str(parcel_no_int) if parcel_no_int is not None else "",
        "parcel_no": str(parcel_no_int) if parcel_no_int is not None else "",
        "parcel_regno": str(record.get("parcel_regno") or ""),
        "field_address": str(record.get("field_address") or ""),
        "crop_name": str(record.get("crop_name") or ""),
        "activity_id": activity_id,
        "job_cd": job_cd,
        "work_stage": str(record.get("work_stage") or ""),
        "work_stage_detail": str(record.get("work_stage_detail") or ""),
        "work_detail": exec_desc,
        "linked_evidence_ids": [],
        "status": _job_cmpl_yn_to_status(job_cmpl_yn),
        "input_type_cd": input_type_cd,
        "created_at": datetime.now(),
        "updated_at": datetime.now(),
        "user_no": user_no,
        "user_name": user_rec.get("user_name") or "",
        "amo_regno": amo_regno,
        "exec_no": exec_no,
    }
