"""신 스키마 기반 To-do 조회 (view 의존 없는 raw JOIN).

이전 버전은 `vw_jeotan_todo_board` view 를 호출했으나, 다음 이유로 코드 측
raw JOIN 으로 전환:
  - view DDL 누락 시 ``except Exception: return []`` 로 조용히 실패 → 가이드
    "충돌 무시 금지" 원칙 위반.
  - DBA / 코드 양쪽 view 동기화 부담 제거.
  - DBMS 양쪽 호환 표준 SQL 만 사용.
SQL 결과 행을 `TodoRecord` Pydantic 모델로 매핑하는 단계는 유지.
"""
from __future__ import annotations

from datetime import date
from typing import Any

from locaville.dbcom import fetch_all

from app.repositories.identity_rdb import (
    resolve_group_nos_by_farmer_id,
)
from app.utils.todo_id import build_todo_id


_TODO_BOARD_BASE_SELECT = """
    SELECT
        ptl.group_no,
        ptl.amo_regno,
        ptl.prj_id,
        ptl.activity_id,
        ptl.job_seq,
        ptl.job_cd,
        ptl.est_start_date,
        ptl.real_start_date,
        ptl.est_end_date,
        ptl.real_end_date,
        ptl.job_progress,
        ptl.remark,
        vg.group_name,
        af.amo_name,
        um.user_name,
        pr.prj_name,
        pa.activity_name,
        fj.job_name,
        cd.code_name AS job_progress_name
    FROM prj_todo_list ptl
    LEFT JOIN ville_group vg ON vg.group_no = ptl.group_no
    LEFT JOIN amo_family af ON af.amo_regno = ptl.amo_regno
    LEFT JOIN user_master um ON um.user_no = af.chief_no
    LEFT JOIN project pr ON pr.prj_id = ptl.prj_id
    LEFT JOIN prj_activity pa
        ON pa.prj_id = ptl.prj_id
       AND pa.activity_id = ptl.activity_id
    LEFT JOIN farm_job fj ON fj.job_cd = ptl.job_cd
    LEFT JOIN code_detail cd
        ON cd.grp_cd = 'PROGRESS'
       AND cd.code = ptl.job_progress
"""


def _fetch_todo_board_rows(
    *,
    amo_regno: str | None = None,
    group_no: int | None = None,
    prj_id: str | None = None,
    activity_id: str | None = None,
    job_progress: str | None = None,
    limit: int = 200,
) -> list[dict[str, Any]]:
    """prj_todo_list 기준 LEFT JOIN 으로 todo 게시판 행을 조회.

    user_name 은 ``amo_family.chief_no`` 를 따라가 농가 대표자의 사용자명.
    (1 농가 N 농민이라 임의의 농민 표시는 모호하므로 대표자로 고정.)
    표준 SQL 만 사용해 mysql/postgres 양쪽 그대로 작동.
    """
    where: list[str] = []
    params: list[Any] = []
    if amo_regno:
        where.append("ptl.amo_regno = %s")
        params.append(amo_regno)
    if group_no is not None:
        where.append("ptl.group_no = %s")
        params.append(group_no)
    if prj_id:
        where.append("ptl.prj_id = %s")
        params.append(prj_id)
    if activity_id:
        where.append("ptl.activity_id = %s")
        params.append(activity_id)
    if job_progress:
        where.append("ptl.job_progress = %s")
        params.append(job_progress)

    sql = _TODO_BOARD_BASE_SELECT
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY ptl.amo_regno, ptl.prj_id, ptl.activity_id, ptl.job_seq LIMIT %s"
    params.append(max(1, min(int(limit), 500)))

    return fetch_all(sql, params)


def _parcels_for_amo(amo_regno: str) -> list[dict[str, Any]]:
    """농가(amo_regno)가 보유한 필지 목록. 실패 시 빈 리스트."""
    if not amo_regno:
        return []
    sql = (
        "SELECT parcel_no, parcel_regno, parcel_usage AS usage, addr_2 "
        "FROM parcel WHERE amo_regno = %s ORDER BY parcel_no"
    )
    try:
        return fetch_all(sql, [amo_regno])
    except Exception:  # noqa: BLE001
        return []


def _pick_parcel_for_job(job_cd: str, parcels: list[dict[str, Any]]) -> dict[str, Any] | None:
    """to-do 의 job_cd 로 농가 필지 중 적절한 1개를 고른다.

    벼(rice) 작업(job_cd 가 R 로 시작: R0001~, RD001/RD002)은 논(parcel_usage=RPA) 필지에 매칭.
    그 외에는 농가의 첫 필지로 폴백. (현 시드 기준 단순 매핑 — 추후 활동-필지 직접 연결로 개선 가능)
    """
    if not parcels:
        return None
    code = (job_cd or "").upper()
    if code.startswith("R"):
        for parcel in parcels:
            if (parcel.get("usage") or "").upper() == "RPA":
                return parcel
    return parcels[0]


def _required_evidence_types_by_job(job_cd: str) -> list[str]:
    """job_cd 별 필수 증빙 타입 매핑.

    표준 evid_cd (code_detail grp_cd='EVIDENCE') 코드 사용:
      - PIC  = 대표 작업 사진     PIC1 = 완료 사진
      - PIC2 = 시작 사진          PIC3 = 작업 중 사진
      - RCT  = 영수증류 (RCT1~5 = 세부 영수증)
      - EDU  = 교육 이수증        DST = 시용 사진
    신 시드(R0001~R0012 / RD001/002 / A0001~ ) 와 옛 식별자(WATER_DN, J001~) 양쪽 지원.
    매핑이 없으면 빈 배열.
    """
    mapping = {
        # 신 시드 farm_job — 논농사(R series)
        "R0005": ["PIC"],                  # 모내기
        "R0006": ["PIC"],                  # 초기 물 관리
        "R0008": ["MID_DRAINAGE_START", "MID_DRAINAGE_END"],  # 중간 물떼기 — 2회(시작/완료)
        # 논물 얕게 걸러대기(AWD) — 작기 중 4회 마른 논바닥 촬영.
        "R0009": ["AWD_DRY_FIELD_ROUND_1", "AWD_DRY_FIELD_ROUND_2", "AWD_DRY_FIELD_ROUND_3", "AWD_DRY_FIELD_ROUND_4"],
        "R0010": ["PIC1"],                 # 논물 빼기
        "R0011": ["PIC1"],                 # 벼 수확 및 탈곡
        # 신 시드 farm_job — 논밭(RD series)
        "RD001": ["BIOCHAR_BAG", "BIOCHAR_SPREADING"],  # 바이오차 투입 — 사진 2회(포대/투입). 영수증은 별도.
        "RD002": ["PIC2", "PIC1"],         # 가을갈이 — 전/후
        # 신 시드 farm_job — 농사일반(A series)
        "A0001": ["PIC1"],                 # 비료 주기
        "A0002": ["PIC1"],                 # 거름 주기
        "A0003": ["PIC1"],                 # 병해충 방제(농약)
        "A0004": ["PIC1"],                 # 병해충 방제(기타)
        "A0005": ["PIC1"],                 # 영농폐기물 수거
        "A0006": ["PIC"],                  # 작물 생육 점검
        # 신 시드 — 교육·구매
        "AE001": ["EDU"],                  # 공익증진 교육 이수
        "AP001": ["RCT"],                  # 농자재 구입
        # 옛 식별자 호환 — v0_farmer 등 기존 호출
        "WATER_DN": ["MID_DRAINAGE_START", "MID_DRAINAGE_END"],
        "SHALLOW": ["AWD_DRY_FIELD_ROUND_1", "AWD_DRY_FIELD_ROUND_2", "AWD_DRY_FIELD_ROUND_3", "AWD_DRY_FIELD_ROUND_4"],
        "BIOCHAR": ["BIOCHAR_BAG", "BIOCHAR_SPREADING"],
        "FALL_TILLAGE": ["PIC2", "PIC1"],
        "WASTE": ["PIC1"],
        "J001": ["PIC2", "PIC1"],
        "J002": ["PIC2"],
        "J003": ["PIC2", "PIC1"],
        "J005": ["PIC1"],
        "J006": ["PIC1"],
        "J007": ["PIC1"],
        "J009": ["EDU"],
        "J010": ["PIC"],
        "J011": ["RCT"],
    }
    return mapping.get((job_cd or "").upper(), [])


def _build_title(activity_name: str | None, job_name: str | None) -> str:
    activity = (activity_name or "").strip()
    job = (job_name or "").strip()
    if activity and job:
        return f"{activity} - {job}"
    return activity or job or "할 일"


def _status_from_view(row: dict[str, Any]) -> str:
    """vw_jeotan_todo_board.job_progress (PROGRESS code) → 화면용 상태.

    PRE → pending, ING → in_progress, END → completed, DLY/HLD/ABT → delayed/halted/aborted
    """
    progress = (row.get("job_progress") or "").upper()
    if progress in {"END", "DONE", "COMPLETED", "100"}:
        return "completed"
    if progress in {"ING", "IN_PROGRESS"}:
        return "in_progress"
    if progress in {"DLY", "DLYS", "DLYE"}:
        return "delayed"
    if progress in {"HLD", "ABT"}:
        return "halted"
    return "pending"


def _row_to_todo_dict(row: dict[str, Any], parcels: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    """vw_jeotan_todo_board row → TodoRecord 호환 dict."""
    amo_regno = (row.get("amo_regno") or "").strip()
    prj_id = (row.get("prj_id") or "").strip()
    activity_id = (row.get("activity_id") or "").strip()
    job_cd = (row.get("job_cd") or "").strip()
    job_seq = row.get("job_seq")
    activity_name = row.get("activity_name") or ""
    job_name = row.get("job_name") or ""
    status_code = _status_from_view(row)

    # to-do 에 필지(field_id/parcel_no) 부착 — 음성으로 "필지" 를 말하면 후보 매칭이 되도록.
    parcel = _pick_parcel_for_job(job_cd, parcels or [])
    parcel_no_val = str(parcel["parcel_no"]) if parcel and parcel.get("parcel_no") is not None else None
    parcel_regno_val = (parcel.get("parcel_regno") if parcel else None) or None

    return {
        "todo_id": build_todo_id(amo_regno, prj_id, activity_id, job_seq),
        "group_no": int(row.get("group_no") or 0),
        "prj_id": prj_id,
        "project_id": prj_id,  # 프론트 호환 alias
        "activity_id": activity_id,
        "job_cd": job_cd,
        "todo_title": _build_title(activity_name, job_name),
        "activity_name": activity_name,
        "job_name": job_name,
        "required_evidence_types": _required_evidence_types_by_job(job_cd),
        "parcel_no": parcel_no_val,
        "field_id": parcel_regno_val,
        "due_date": row.get("est_end_date"),
        "start_date": row.get("est_start_date"),
        "status": status_code,
        "remark": row.get("remark") or "",
        # 신 스키마 optional 필드
        "amo_regno": amo_regno or None,
        "amo_name": row.get("amo_name") or None,
        "user_name": row.get("user_name") or None,
        "group_name": row.get("group_name") or None,
        "prj_name": row.get("prj_name") or None,
        "job_seq": int(job_seq) if job_seq is not None else None,
        "job_progress_name": row.get("job_progress_name") or None,
        "real_start_date": row.get("real_start_date"),
        "real_end_date": row.get("real_end_date"),
    }


def list_todos_mysql(
    *,
    group_no: int | None = None,
    group_nos: list[int] | None = None,
    prj_id: str | None = None,
    activity_id: str | None = None,
    target_date: date | None = None,
    amo_regno: str | None = None,
) -> list[dict[str, Any]]:
    """view 기반 todo 조회.

    필터:
      - amo_regno: 특정 농가의 todo 만
      - group_no / group_nos: 명시되면 그 그룹으로 좁힘. 없으면 모든 마을/그룹.
      - prj_id / activity_id: view 컬럼 직접 필터
      - target_date: est_end_date 가 오늘 이전인 todo 만 제외 (Python 후처리)
    """
    # group_nos 가 명시된 경우 첫 번째 값을 사용 (현재 view 는 단일 group_no 만 받음).
    effective_group_no = group_no
    if effective_group_no is None and group_nos:
        effective_group_no = group_nos[0]

    rows = _fetch_todo_board_rows(
        amo_regno=amo_regno,
        group_no=effective_group_no,
        prj_id=prj_id,
        activity_id=activity_id,
        limit=500,
    )

    if target_date is not None:
        # "오늘의 할 일" 의미: 이미 끝난(est_end_date < target_date) 할 일만 제외하고,
        # 진행 중 + 곧 시작될 할 일은 모두 노출. (시작이 미래여도 데모/안내용으로 보여줌)
        def in_range(row: dict[str, Any]) -> bool:
            est_end = row.get("est_end_date")
            if est_end is not None and est_end < target_date:
                return False
            return True
        rows = [r for r in rows if in_range(r)]

    # 행에 등장하는 농가별 필지를 한 번씩만 조회해 매핑.
    parcels_by_amo: dict[str, list[dict[str, Any]]] = {}
    for r in rows:
        amo = (r.get("amo_regno") or "").strip()
        if amo and amo not in parcels_by_amo:
            parcels_by_amo[amo] = _parcels_for_amo(amo)

    todos = [_row_to_todo_dict(r, parcels_by_amo.get((r.get("amo_regno") or "").strip(), [])) for r in rows]

    # todo_id(amo+prj+activity+job_seq)는 설계상 유일 — 시드 중복 INSERT 나 JOIN 팬아웃이
    # 있어도 API 가 같은 todo 를 두 번 반환하지 않도록 첫 행만 유지.
    seen_ids: set[str] = set()
    deduped: list[dict[str, Any]] = []
    for t in todos:
        tid = t["todo_id"]
        if tid in seen_ids:
            continue
        seen_ids.add(tid)
        deduped.append(t)
    return deduped


# 기존 todo_service 가 import 하던 이름을 그대로 유지 (identity_rdb 로 위임)
__all__ = [
    "list_todos_mysql",
    "resolve_group_nos_by_farmer_id",
    "_required_evidence_types_by_job",
]
