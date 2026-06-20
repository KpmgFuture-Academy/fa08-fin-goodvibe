"""To-do 항목 (``/todo/*``, ``/admin/todo-status``) API Pydantic 모델.

신 스키마에서는 ``vw_jeotan_todo_board`` 가 prj_todo_list + 활동/작업 마스터를 합쳐서
사람이 읽기 좋은 view 로 제공합니다. 이 모델은 view 행을 화면용 DTO 로 매핑한 결과.

To-do PK 매핑:
  - 신 스키마 prj_todo_list PK = ``(group_no, amo_regno, prj_id, activity_id, job_seq)``
  - 화면용 ``todo_id`` = ``{amo_regno}-{prj_id}-{activity_id}-{job_seq}``
"""
from __future__ import annotations

from datetime import date

from pydantic import BaseModel


class TodoRecord(BaseModel):
    """To-do 한 항목 (한 농가의 한 사업·활동·작업).

    ``status`` 는 DB의 ``job_progress`` 그대로, ``computed_status`` 는 일지/증빙 제출
    여부를 고려한 화면용 파생 상태 (todo_service._compute_status).
    """
    todo_id: str
    group_no: int
    prj_id: str
    project_id: str | None = None  # prj_id 의 프론트 호환 alias
    activity_id: str
    job_cd: str
    todo_title: str
    activity_name: str = ""
    job_name: str = ""
    # job_cd 에 매핑된 필수 증빙 종류 (예: WATER_DN → [MID_DRAINAGE_START, MID_DRAINAGE_END]).
    required_evidence_types: list[str] = []
    parcel_no: str | None = None
    field_id: str | None = None  # 옛 호환 — 추후 parcel_no INT 중심으로 정리
    due_date: date | None = None
    start_date: date | None = None
    # DB 의 job_progress 그대로 (PRE/ING/END/DLY...).
    status: str
    # 일지·증빙 제출 여부 종합한 파생 상태 (pending / in_progress / completed / delayed).
    computed_status: str = "pending"
    remark: str = ""

    # 신 스키마 (vw_jeotan_todo_board) 노출용 optional 필드. 기존 화면 호환 유지.
    amo_regno: str | None = None
    amo_name: str | None = None
    user_name: str | None = None
    group_name: str | None = None
    prj_name: str | None = None
    job_seq: int | None = None
    # PROGRESS 코드의 한국어 라벨 (code_detail JOIN).
    job_progress_name: str | None = None
    real_start_date: date | None = None
    real_end_date: date | None = None


class TodoListResponse(BaseModel):
    """``GET /todo`` 응답 wrapper."""
    items: list[TodoRecord]
