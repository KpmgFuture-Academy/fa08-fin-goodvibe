"""``/engage/*`` 라우터 — 사업참여 화면 전용 API."""
from __future__ import annotations

from fastapi import APIRouter

from app.services.engage_service import (
    get_engage_todo_refresh_preview,
    get_engage_activity_view,
    get_engage_project_register_view,
    get_engage_todo_view,
    list_engage_projects,
    create_engage_todo_list,
    refresh_engage_todo_list,
    register_engage_activity_members,
    register_engage_group,
)
from app.schemas.engage import EngageActivityMembersRegisterRequest, EngageGroupRegisterRequest


router = APIRouter(prefix="/engage", tags=["engage"])


@router.get("/projects")
def get_engage_projects() -> dict:
    # 사업참여 화면의 공고 사업 목록 + 현재 마을 참여 여부입니다.
    return list_engage_projects()


@router.get("/projects/{prj_id}")
def get_engage_project_detail(prj_id: str) -> dict:
    # 사업참여 상세/등록 화면에 필요한 프로젝트 기본 정보 + 마을 단체 목록입니다.
    return get_engage_project_register_view(prj_id)


@router.post("/projects/{prj_id}/register")
def post_engage_project_register(prj_id: str, payload: EngageGroupRegisterRequest) -> dict:
    # 선택한 마을 단체를 현재 프로젝트의 참여 단체로 등록합니다.
    return register_engage_group(prj_id, payload.group_no)


@router.get("/projects/{prj_id}/activities")
def get_engage_project_activities(prj_id: str) -> dict:
    # 활동별 농가 등록/조회 화면용 데이터입니다.
    return get_engage_activity_view(prj_id)


@router.post("/projects/{prj_id}/activities/register")
def post_engage_project_activities_register(
    prj_id: str,
    payload: EngageActivityMembersRegisterRequest,
) -> dict:
    # 선택한 활동에 대해 참여 농가와 농지를 act_grp / act_grp_parcel에 등록합니다.
    return register_engage_activity_members(
        prj_id,
        payload.activity_id,
        [selection.model_dump() for selection in payload.selections],
    )


@router.get("/projects/{prj_id}/todos")
def get_engage_project_todos(prj_id: str) -> dict:
    # 활동별 To-do 리스트 조회 팝업용 데이터입니다.
    return get_engage_todo_view(prj_id)


@router.post("/projects/{prj_id}/todos/create")
def post_engage_project_todos_create(prj_id: str) -> dict:
    # act_grp x act_grp_parcel x prj_job 기준으로 parcel_no 가 포함된 prj_todo_list 를 생성합니다.
    return create_engage_todo_list(prj_id)


@router.get("/projects/{prj_id}/todos/refresh-preview")
def get_engage_project_todos_refresh_preview(prj_id: str) -> dict:
    # 현재 prj_todo_list 와 act_grp x act_grp_parcel x prj_job 기준 대상의 차이를 비교합니다.
    return get_engage_todo_refresh_preview(prj_id)


@router.post("/projects/{prj_id}/todos/refresh")
def post_engage_project_todos_refresh(prj_id: str) -> dict:
    # 비교 결과 기준으로 prj_todo_list 의 추가/삭제 대상을 반영합니다.
    return refresh_engage_todo_list(prj_id)
