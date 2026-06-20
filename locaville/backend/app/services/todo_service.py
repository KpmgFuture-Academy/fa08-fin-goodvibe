"""To-do 서비스 레이어.

``GET /todo`` / ``GET /todo/today`` 를 위해 prj_todo_list 행을 가져와 일지·증빙
제출 여부를 합쳐 ``computed_status`` 를 계산합니다.

  - STORAGE_MODE=rdb → ``todo_rdb.list_todos_mysql`` (view 기반)
  - 그 외 → 빈 목록 (json 모드는 todo 마스터를 보유하지 않음)

``_is_same_todo_context`` 는 한 todo 와 한 record(diary/evidence) 가 같은 작업을
가리키는지 판정하는 매칭 규칙 — 신/구 todo_id 형식 둘 다 처리.
"""
from __future__ import annotations

import os
from datetime import date

from app.repositories.todo_rdb import (
    list_todos_mysql,
    resolve_group_nos_by_farmer_id,
)
from app.repositories.identity_rdb import resolve_amo_regno
from app.schemas.todo import TodoRecord
from app.services.diary_service import list_diary_records
from app.services.evidence_service import list_evidence_records
from app.utils.todo_id import build_todo_id, build_todo_id_legacy


def _storage_mode() -> str:
    """저장소 모드 (rdb/json). 옛 ``DATA_SOURCE=mysql|postgres`` 도 'rdb' 로 매핑."""
    mode = os.getenv("STORAGE_MODE", "").strip().lower()
    if mode:
        return mode
    legacy = os.getenv("DATA_SOURCE", "json").strip().lower()
    return "rdb" if legacy in ("mysql", "postgres", "rdb") else legacy


def _fallback_todos() -> list[TodoRecord]:
    """DB 연결 실패 또는 mysql 모드 비활성 시 안전한 빈 목록."""
    return []


def _is_same_todo_context(
    *,
    todo: TodoRecord,
    farmer_id: str | None,
    record_todo_id: str | None,
    record_farmer_id: str | None,
    record_prj_id: str | None,
    record_project_id: str | None,
    record_activity_id: str | None,
    record_job_cd: str | None,
    record_amo_regno: str | None = None,
    record_job_seq: int | None = None,
) -> bool:
    # 같은 To-do인지 매칭합니다.
    # 1순위: record_todo_id 직접 비교.
    # 2순위: 신 형식 (amo_regno, prj_id, activity_id, job_seq) 재구성.
    # 3순위: 구 형식 (group_no, prj_id, activity_id, job_cd) 재구성.
    # 4순위: prj/activity/job 조합 직접 비교.
    if record_todo_id and record_todo_id == todo.todo_id:
        return True

    record_prj = record_prj_id or record_project_id or ""

    # 신 형식: record 가 amo_regno 와 job_seq 까지 가지고 있을 때
    if record_amo_regno and record_prj and record_activity_id and record_job_seq is not None:
        rec_new = build_todo_id(record_amo_regno, record_prj, record_activity_id, record_job_seq)
        if rec_new == todo.todo_id:
            return True

    # 구 형식: 기존 evidence/diary record 호환
    if record_prj and record_activity_id and record_job_cd:
        rec_legacy = build_todo_id_legacy(
            todo.group_no, record_prj, record_activity_id, record_job_cd
        )
        if rec_legacy == todo.todo_id:
            return True

    if farmer_id and record_farmer_id and record_farmer_id != farmer_id:
        return False
    # 농가 무관 매칭 방지: record 의 amo_regno 와 todo 의 amo_regno 가 둘 다 있으면
    # 일치해야 한다. (evidence_rdb 가 evidence.farmer_id 에 amo_regno 를 채워 보내므로
    # admin_service 는 record_amo_regno=ev.farmer_id 로 호출한다.)
    if record_amo_regno and todo.amo_regno and record_amo_regno != todo.amo_regno:
        return False
    todo_prj = todo.prj_id or todo.project_id or ""
    return (
        bool(record_prj)
        and bool(todo_prj)
        and record_prj == todo_prj
        and (record_activity_id or "") == todo.activity_id
        and (record_job_cd or "") == todo.job_cd
    )


def _compute_status(
    todo: TodoRecord,
    *,
    farmer_id: str | None,
    diaries,
    evidence,
) -> str:
    # 저장된 journal/evidence를 보고 화면용 상태를 계산합니다.
    # DB의 원본 status는 건드리지 않고 computed_status만 계산합니다.
    # diary/evidence record 의 farmer_id 에는 신 스키마에서 amo_regno 가 들어가 있어
    # (diary_rdb / evidence_rdb 의 _row_to_record 가 그렇게 채움) record_amo_regno 로 전달.
    linked_diaries = [
        diary
        for diary in diaries
        if _is_same_todo_context(
            todo=todo,
            farmer_id=farmer_id,
            record_todo_id=getattr(diary, "todo_id", None),
            record_farmer_id=getattr(diary, "farmer_id", None),
            record_amo_regno=getattr(diary, "farmer_id", None),
            record_prj_id=getattr(diary, "prj_id", None),
            record_project_id=getattr(diary, "project_id", None),
            record_activity_id=getattr(diary, "activity_id", None),
            record_job_cd=getattr(diary, "job_cd", None),
        )
    ]
    linked_evidence = [
        ev
        for ev in evidence
        if _is_same_todo_context(
            todo=todo,
            farmer_id=farmer_id,
            record_todo_id=getattr(ev, "todo_id", None),
            record_farmer_id=getattr(ev, "farmer_id", None),
            record_amo_regno=getattr(ev, "farmer_id", None),
            record_prj_id=getattr(ev, "prj_id", None),
            record_project_id=getattr(ev, "project_id", None),
            record_activity_id=getattr(ev, "activity_id", None),
            record_job_cd=getattr(ev, "job_cd", None),
        )
    ]

    required = todo.required_evidence_types or []
    submitted = {ev.evidence_type for ev in linked_evidence if ev.evidence_type}

    if required:
        if all(item in submitted for item in required):
            return "completed"
        if submitted or linked_diaries:
            return "in_progress"
        return "pending"

    if linked_diaries or linked_evidence:
        return "in_progress"
    return "pending"


def list_todos(
    *,
    farmer_id: str | None = None,
    group_no: int | None = None,
    prj_id: str | None = None,
    activity_id: str | None = None,
    target_date: date | None = None,
) -> list[TodoRecord]:
    # To-do 목록 메인 함수입니다.
    # RDB에서 읽은 뒤 computed_status를 덧붙여 프론트로 보냅니다.
    if _storage_mode() != "rdb":
        return _fallback_todos()

    resolved_group_nos: list[int] | None = None
    resolved_amo_regno: str | None = None
    if farmer_id:
        resolved_group_nos = resolve_group_nos_by_farmer_id(farmer_id)
        resolved_amo_regno = resolve_amo_regno(farmer_id)
        # group_no가 함께 전달되면 farmer 매핑 결과와 AND 조건으로 해석합니다.
        if group_no is not None:
            if group_no not in resolved_group_nos:
                return []
        # group_no가 없고 farmer_id만 있으면 farmer의 소속 group_no 목록으로 제한합니다.
        elif not resolved_group_nos:
            return []

    rows = list_todos_mysql(
        group_no=group_no,
        group_nos=resolved_group_nos if farmer_id and group_no is None else None,
        prj_id=prj_id,
        activity_id=activity_id,
        target_date=target_date,
        amo_regno=resolved_amo_regno,
    )
    if not rows:
        return _fallback_todos()
    items = [TodoRecord(**row) for row in rows]
    diaries = list_diary_records()
    evidence = list_evidence_records()
    for item in items:
        item.computed_status = _compute_status(item, farmer_id=farmer_id, diaries=diaries, evidence=evidence)

    # choice 타입(예: 바이오차 RD001) 은 활성 시즌 윈도우 안에서만 노출.
    # 봄·가을 윈도우 사이의 공백 기간엔 처리함에 안 뜬다 — 봄 못 한 농가는 8월 가을 윈도우 시작
    # 시점에 자동으로 다시 보임. 룰: app/services/job_schedule.py.
    from datetime import date as _date
    from app.services.job_schedule import is_visible_in_inbox
    today_ref = target_date or _date.today()
    items = [it for it in items if is_visible_in_inbox(it.job_cd, today_ref)]
    return items


def list_today_todos(
    *,
    farmer_id: str | None = None,
    group_no: int | None = None,
    prj_id: str | None = None,
    activity_id: str | None = None,
    target_date: date | None = None,
) -> list[TodoRecord]:
    # 오늘 날짜 기준 To-do만 보고 싶을 때 사용하는 얇은 래퍼입니다.
    base_date = target_date or date.today()
    return list_todos(
        farmer_id=farmer_id,
        group_no=group_no,
        prj_id=prj_id,
        activity_id=activity_id,
        target_date=base_date,
    )
