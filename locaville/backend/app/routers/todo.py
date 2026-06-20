"""``/todo`` 라우터 — 농가용 (v0_farmer) 오늘의 할 일 / 전체 to-do 조회.

읽기 전용 + choice 타입 todo 의 시즌 선택 1개 (POST /todo/window-choice).
"""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.schemas.todo import TodoListResponse
from app.services.todo_service import list_today_todos, list_todos
from app.services.job_schedule import get_choice_options, is_choice_type


router = APIRouter(prefix="/todo", tags=["todo"])


@router.get("", response_model=TodoListResponse)
def get_todos(
    farmer_id: str | None = None,
    group_no: int | None = None,
    prj_id: str | None = None,
    activity_id: str | None = None,
    date_value: date | None = Query(default=None, alias="date"),
) -> TodoListResponse:
    # To-do 목록 조회 API입니다.
    # 기본은 읽기 전용이며, MySQL에서 가져온 할 일을 프론트 친화 DTO로 반환합니다.
    items = list_todos(
        farmer_id=farmer_id,
        group_no=group_no,
        prj_id=prj_id,
        activity_id=activity_id,
        target_date=date_value,
    )
    return TodoListResponse(items=items)


@router.get("/today", response_model=TodoListResponse)
def get_today_todos(
    farmer_id: str | None = None,
    group_no: int | None = None,
    prj_id: str | None = None,
    activity_id: str | None = None,
    date_value: date | None = Query(default=None, alias="date"),
) -> TodoListResponse:
    # 오늘 기준 To-do 조회 API입니다.
    # date가 없으면 서버 기준 오늘 날짜로 계산합니다.
    items = list_today_todos(
        farmer_id=farmer_id,
        group_no=group_no,
        prj_id=prj_id,
        activity_id=activity_id,
        target_date=date_value,
    )
    return TodoListResponse(items=items)


# ====================================================================
# Choice 타입 todo 의 시즌 선택 (예: 바이오차 봄/가을)
# ====================================================================

class WindowChoiceRequest(BaseModel):
    farmer_id: str
    prj_id: str
    job_cd: str
    chosen_label: str  # JOB_SCHEDULE 의 option.label 과 일치 (예: "봄(모내기 전)")


class WindowChoiceResponse(BaseModel):
    ok: bool
    job_cd: str
    chosen_label: str
    est_start_date: str
    est_end_date: str
    updated_rows: int


@router.post("/window-choice", response_model=WindowChoiceResponse)
def choose_window(payload: WindowChoiceRequest) -> WindowChoiceResponse:
    """choice 타입 todo (예: 바이오차 RD001) 의 시즌을 농가가 선택.

    선택한 option 의 season(MMDD) 으로 prj_todo_list.est_*_date 를 현재 년도 기준 UPDATE.
    UPDATE 가 적용된 row 가 없어도 200 — 일부 농가가 해당 사업 미참여인 정상 케이스 포함.
    """
    from datetime import date as _date
    from app.repositories.identity_rdb import resolve_amo_regno
    from locaville.dbcom import execute

    if not is_choice_type(payload.job_cd):
        raise HTTPException(
            status_code=400,
            detail=f"job_cd={payload.job_cd} 는 시즌 선택 가능한 작업이 아닙니다.",
        )
    options = get_choice_options(payload.job_cd)
    option = next((o for o in options if o.get("label") == payload.chosen_label), None)
    if not option:
        raise HTTPException(
            status_code=400,
            detail=f"chosen_label='{payload.chosen_label}' 는 알 수 없는 선택지입니다.",
        )

    amo_regno = resolve_amo_regno(payload.farmer_id)
    if not amo_regno:
        raise HTTPException(status_code=404, detail=f"농가({payload.farmer_id}) 식별 실패")

    season = option.get("season")
    if not season:
        raise HTTPException(status_code=500, detail="선택지에 season 정의가 없습니다.")
    start_mmdd, end_mmdd = season  # type: ignore[misc]
    year = _date.today().year
    new_start = _date(year, int(start_mmdd[:2]), int(start_mmdd[2:]))
    new_end = _date(year, int(end_mmdd[:2]), int(end_mmdd[2:]))

    updated = execute(
        """
        UPDATE prj_todo_list
           SET est_start_date = %s,
               est_end_date = %s,
               mod_dt = NOW()
         WHERE amo_regno = %s
           AND prj_id = %s
           AND job_cd = %s
        """,
        [new_start, new_end, amo_regno, payload.prj_id.strip(), payload.job_cd.strip()],
    )
    return WindowChoiceResponse(
        ok=True,
        job_cd=payload.job_cd,
        chosen_label=payload.chosen_label,
        est_start_date=new_start.isoformat(),
        est_end_date=new_end.isoformat(),
        updated_rows=int(updated or 0),
    )
