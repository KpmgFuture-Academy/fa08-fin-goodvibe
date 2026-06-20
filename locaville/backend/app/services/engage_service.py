"""사업참여 화면용 비즈니스 서비스."""
from __future__ import annotations

from datetime import date
from typing import Any

from fastapi import HTTPException
from locaville.dbcom import DBExecutionError, transaction

from app.repositories import engage_rdb
from app.repositories.user_ville_rdb import DEFAULT_VILLE_ID, get_current_user_ville_info


def _is_duplicate_conflict(exc: Exception) -> bool:
    message = str(exc).lower()
    return "duplicate" in message or "unique" in message or "conflict" in message


def _get_current_ville_context() -> tuple[int, str]:
    current_user_ctx = get_current_user_ville_info()
    user_no = int((((current_user_ctx.get("user") or {}).get("user_no")) or 0) or 0)
    ville_id = str(((current_user_ctx.get("village") or {}).get("ville_id")) or "").strip() or DEFAULT_VILLE_ID
    if user_no <= 0:
        raise HTTPException(status_code=400, detail="현재 사용자 정보를 확인할 수 없습니다.")
    return user_no, ville_id


def _get_engage_project(prj_id: str, ville_id: str) -> dict[str, Any]:
    project = engage_rdb.get_project_with_engage_group(prj_id, ville_id)
    if not project:
        raise HTTPException(status_code=404, detail="해당 프로젝트를 찾을 수 없습니다.")
    return project


def _require_engage_group(project: dict[str, Any]) -> int:
    group_no = int(project.get("engage_group_no") or 0)
    if group_no <= 0:
        raise HTTPException(status_code=400, detail="참여단체가 아직 등록되지 않았습니다.")
    return group_no


def list_engage_projects(exec_year: int | None = None) -> dict[str, Any]:
    current_year = exec_year if exec_year is not None else date.today().year
    current_user_ctx = get_current_user_ville_info()
    ville_id = str(((current_user_ctx.get("village") or {}).get("ville_id")) or "").strip() or DEFAULT_VILLE_ID
    return {
        "items": engage_rdb.get_project_summary_with_engage_status(ville_id, current_year),
        "exec_year": current_year,
        "ville_id": ville_id,
    }


def get_engage_project_register_view(prj_id: str) -> dict[str, Any]:
    user_no, ville_id = _get_current_ville_context()
    project = _get_engage_project(prj_id, ville_id)
    groups = engage_rdb.list_ville_groups(ville_id)
    engage_group_no = int(project.get("engage_group_no") or 0)
    project["activity_group_exists"] = bool(
        engage_group_no and engage_rdb.has_activity_groups(prj_id, engage_group_no)
    )
    project["todo_list_exists"] = bool(
        engage_group_no and engage_rdb.has_project_todos(prj_id, engage_group_no)
    )
    return {
        "project": project,
        "groups": groups,
        "ville_id": ville_id,
        "user_no": user_no,
    }


def register_engage_group(prj_id: str, group_no: int) -> dict[str, Any]:
    user_no, ville_id = _get_current_ville_context()
    if not engage_rdb.get_project(prj_id):
        raise HTTPException(status_code=404, detail="해당 프로젝트를 찾을 수 없습니다.")

    group = engage_rdb.get_ville_group(group_no, ville_id)
    if not group:
        raise HTTPException(status_code=404, detail="등록 가능한 단체를 찾을 수 없습니다.")

    if engage_rdb.get_project_group_for_ville(prj_id, ville_id):
        raise HTTPException(status_code=409, detail="이미 이 마을의 참여 단체가 등록되어 있습니다.")

    try:
        with transaction() as conn:
            engage_rdb.insert_project_group(
                prj_id=prj_id,
                ville_id=ville_id,
                group_no=group_no,
                leader_no=group.get("chief_no"),
                reg_no=user_no,
                connection=conn,
            )
    except DBExecutionError as exc:
        if _is_duplicate_conflict(exc):
            raise HTTPException(status_code=409, detail="이미 등록된 참여 단체입니다.") from exc
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {
        "ok": True,
        "prj_id": prj_id,
        "ville_id": ville_id,
        "group": group,
    }


def get_engage_activity_view(prj_id: str) -> dict[str, Any]:
    user_no, ville_id = _get_current_ville_context()
    project = _get_engage_project(prj_id, ville_id)
    group_no = _require_engage_group(project)
    activities = engage_rdb.list_project_activities(prj_id)
    members = engage_rdb.list_group_members(group_no)
    participations = engage_rdb.list_activity_participations(prj_id, group_no)
    project["activity_group_exists"] = bool(participations)
    project["todo_list_exists"] = bool(engage_rdb.has_project_todos(prj_id, group_no))
    return {
        "project": project,
        "engage_group": {
            "group_no": group_no,
            "group_name": project.get("engage_group_name"),
        },
        "activities": activities,
        "members": members,
        "participations": participations,
        "ville_id": ville_id,
        "user_no": user_no,
    }


def register_engage_activity_members(
    prj_id: str,
    activity_id: str,
    selections: list[dict[str, Any]],
) -> dict[str, Any]:
    user_no, ville_id = _get_current_ville_context()
    project = _get_engage_project(prj_id, ville_id)
    group_no = _require_engage_group(project)

    if not engage_rdb.get_project_activity(prj_id, activity_id):
        raise HTTPException(status_code=404, detail="프로젝트 활동 정보를 찾을 수 없습니다.")

    normalized_map: dict[str, list[int]] = {}
    for item in selections:
        amo_regno = str((item or {}).get("amo_regno") or "").strip()
        if not amo_regno:
            continue
        raw_parcel_nos = (item or {}).get("parcel_nos") or []
        parcel_nos = sorted({int(parcel_no) for parcel_no in raw_parcel_nos if int(parcel_no) > 0})
        if parcel_nos:
            normalized_map[amo_regno] = parcel_nos

    normalized_amo_regnos = sorted(normalized_map.keys())
    current_amo_regnos = engage_rdb.list_activity_member_regnos(group_no, prj_id, activity_id)
    to_add = [amo_regno for amo_regno in normalized_amo_regnos if amo_regno not in current_amo_regnos]
    to_delete = [amo_regno for amo_regno in current_amo_regnos if amo_regno not in normalized_amo_regnos]

    if not to_add and not to_delete:
        current_valid_map = engage_rdb.list_activity_member_parcel_map(group_no, prj_id, activity_id)
        current_selection_map = {
            amo_regno: sorted(current_valid_map.get(amo_regno) or [])
            for amo_regno in normalized_amo_regnos
        }
        if current_selection_map == normalized_map:
            return {
                "ok": True,
                "prj_id": prj_id,
                "group_no": group_no,
                "activity_id": activity_id,
                "inserted_count": 0,
                "deleted_count": 0,
                "selected_count": len(normalized_amo_regnos),
            }

    valid_amo_regnos = engage_rdb.list_valid_group_member_regnos(group_no, normalized_amo_regnos)
    if normalized_amo_regnos and sorted(valid_amo_regnos) != normalized_amo_regnos:
        raise HTTPException(status_code=400, detail="선택한 참여자 중 현재 단체 소속이 아닌 항목이 있습니다.")

    valid_parcel_map = engage_rdb.list_valid_member_parcels(normalized_amo_regnos)
    for amo_regno, parcel_nos in normalized_map.items():
        valid_parcel_nos = set(valid_parcel_map.get(amo_regno) or [])
        if not valid_parcel_nos:
            raise HTTPException(status_code=400, detail=f"{amo_regno} 농업경영체의 농지 정보를 찾을 수 없습니다.")
        if any(parcel_no not in valid_parcel_nos for parcel_no in parcel_nos):
            raise HTTPException(status_code=400, detail=f"{amo_regno} 농업경영체의 선택 농지 정보가 올바르지 않습니다.")

    inserted = 0
    deleted = 0
    all_target_amo_regnos = sorted({*current_amo_regnos, *normalized_amo_regnos})
    parcel_selection_pairs = [
        (amo_regno, parcel_no)
        for amo_regno in normalized_amo_regnos
        for parcel_no in normalized_map.get(amo_regno, [])
    ]
    try:
        with transaction() as conn:
            if all_target_amo_regnos:
                engage_rdb.delete_activity_member_parcels(
                    group_no=group_no,
                    prj_id=prj_id,
                    activity_id=activity_id,
                    amo_regnos=all_target_amo_regnos,
                    connection=conn,
                )
            if to_delete:
                deleted = engage_rdb.delete_activity_members(
                    group_no=group_no,
                    prj_id=prj_id,
                    activity_id=activity_id,
                    amo_regnos=to_delete,
                    connection=conn,
                )
            if to_add:
                inserted = engage_rdb.insert_activity_members(
                    group_no=group_no,
                    prj_id=prj_id,
                    activity_id=activity_id,
                    amo_regnos=to_add,
                    reg_no=user_no,
                    connection=conn,
                )
            if parcel_selection_pairs:
                engage_rdb.insert_activity_member_parcels(
                    group_no=group_no,
                    prj_id=prj_id,
                    activity_id=activity_id,
                    parcel_selections=parcel_selection_pairs,
                    reg_no=user_no,
                    connection=conn,
                )
    except DBExecutionError as exc:
        if _is_duplicate_conflict(exc):
            raise HTTPException(status_code=409, detail="이미 등록된 참여자 정보가 포함되어 있습니다.") from exc
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {
        "ok": True,
        "prj_id": prj_id,
        "group_no": group_no,
        "activity_id": activity_id,
        "inserted_count": inserted,
        "deleted_count": deleted,
        "selected_count": len(normalized_amo_regnos),
    }


def get_engage_todo_view(prj_id: str) -> dict[str, Any]:
    user_no, ville_id = _get_current_ville_context()
    project = _get_engage_project(prj_id, ville_id)
    group_no = _require_engage_group(project)
    items = engage_rdb.list_engage_todo_items(prj_id, group_no)
    todo_list_exists = bool(items)
    project["todo_list_exists"] = todo_list_exists
    return {
        "ok": True,
        "project": project,
        "engage_group": {
            "group_no": group_no,
            "group_name": project.get("engage_group_name"),
        },
        "todo_list_exists": todo_list_exists,
        "created_count": 0,
        "items": items,
        "ville_id": ville_id,
        "user_no": user_no,
    }


def _todo_item_key(item: dict[str, Any]) -> tuple[int, str, str, int, int]:
    return (
        int(item.get("group_no") or 0),
        str(item.get("amo_regno") or "").strip(),
        str(item.get("activity_id") or "").strip(),
        int(item.get("parcel_no") or 0),
        int(item.get("job_seq") or 0),
    )


def get_engage_todo_refresh_preview(prj_id: str) -> dict[str, Any]:
    user_no, ville_id = _get_current_ville_context()
    project = _get_engage_project(prj_id, ville_id)
    group_no = _require_engage_group(project)
    existing_items = engage_rdb.list_engage_todo_items(prj_id, group_no)
    source_items = engage_rdb.list_todo_source_items(prj_id, group_no)

    existing_map = {_todo_item_key(item): item for item in existing_items}
    source_map = {_todo_item_key(item): item for item in source_items}

    to_add = [source_map[key] for key in source_map.keys() - existing_map.keys()]
    to_delete = [existing_map[key] for key in existing_map.keys() - source_map.keys()]

    return {
        "ok": True,
        "project": project,
        "engage_group": {
            "group_no": group_no,
            "group_name": project.get("engage_group_name"),
        },
        "todo_list_exists": bool(existing_items),
        "items": existing_items,
        "to_add": sorted(to_add, key=_todo_item_key),
        "to_delete": sorted(to_delete, key=_todo_item_key),
        "add_count": len(to_add),
        "delete_count": len(to_delete),
        "has_changes": bool(to_add or to_delete),
        "ville_id": ville_id,
        "user_no": user_no,
    }


def create_engage_todo_list(prj_id: str) -> dict[str, Any]:
    user_no, ville_id = _get_current_ville_context()
    project = _get_engage_project(prj_id, ville_id)
    group_no = _require_engage_group(project)
    existing_items = engage_rdb.list_engage_todo_items(prj_id, group_no)
    if existing_items:
        project["todo_list_exists"] = True
        return {
            "ok": True,
            "project": project,
            "engage_group": {
                "group_no": group_no,
                "group_name": project.get("engage_group_name"),
            },
            "todo_list_exists": True,
            "created_count": 0,
            "items": existing_items,
            "ville_id": ville_id,
            "user_no": user_no,
        }

    source_rows = engage_rdb.list_todo_source_rows(prj_id, group_no)
    if not source_rows:
        raise HTTPException(
            status_code=400,
            detail="활동별 참여 농가 또는 프로젝트 작업 정보가 없어 To-do 리스트를 생성할 수 없습니다.",
        )

    params_list = [
        [
            int(row.get("group_no") or 0),
            str(row.get("amo_regno") or "").strip(),
            str(row.get("prj_id") or "").strip(),
            str(row.get("activity_id") or "").strip(),
            int(row.get("parcel_no") or 0),
            int(row.get("job_seq") or 0),
            str(row.get("job_cd") or "").strip(),
            row.get("est_start_date"),
            row.get("est_end_date"),
            user_no,
        ]
        for row in source_rows
        if int(row.get("group_no") or 0) > 0
        and str(row.get("amo_regno") or "").strip()
        and str(row.get("prj_id") or "").strip()
        and str(row.get("activity_id") or "").strip()
        and int(row.get("parcel_no") or 0) > 0
        and int(row.get("job_seq") or 0) > 0
        and str(row.get("job_cd") or "").strip()
    ]
    if not params_list:
        raise HTTPException(
            status_code=400,
            detail="To-do 리스트 생성에 필요한 프로젝트 작업 정보가 올바르지 않습니다.",
        )

    try:
        with transaction() as conn:
            created_count = engage_rdb.insert_todo_rows(params_list, conn)
    except DBExecutionError as exc:
        if _is_duplicate_conflict(exc):
            raise HTTPException(status_code=409, detail="이미 생성된 To-do 항목이 포함되어 있습니다.") from exc
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    items = engage_rdb.list_engage_todo_items(prj_id, group_no)
    project["todo_list_exists"] = bool(items)
    return {
        "ok": True,
        "project": project,
        "engage_group": {
            "group_no": group_no,
            "group_name": project.get("engage_group_name"),
        },
        "todo_list_exists": bool(items),
        "created_count": created_count,
        "items": items,
        "ville_id": ville_id,
        "user_no": user_no,
    }


def refresh_engage_todo_list(prj_id: str) -> dict[str, Any]:
    user_no, ville_id = _get_current_ville_context()
    project = _get_engage_project(prj_id, ville_id)
    group_no = _require_engage_group(project)
    existing_items = engage_rdb.list_engage_todo_items(prj_id, group_no)
    source_rows = engage_rdb.list_todo_source_rows(prj_id, group_no)
    source_items = engage_rdb.list_todo_source_items(prj_id, group_no)

    existing_map = {_todo_item_key(item): item for item in existing_items}
    source_map = {_todo_item_key(item): item for item in source_items}

    add_keys = source_map.keys() - existing_map.keys()
    delete_keys = existing_map.keys() - source_map.keys()

    add_source_rows = [row for row in source_rows if _todo_item_key(row) in add_keys]
    delete_params = [
        [
            int(item.get("group_no") or 0),
            str(item.get("amo_regno") or "").strip(),
            prj_id,
            str(item.get("activity_id") or "").strip(),
            int(item.get("parcel_no") or 0),
            int(item.get("job_seq") or 0),
        ]
        for item in existing_items
        if _todo_item_key(item) in delete_keys
    ]

    add_params = [
        [
            int(row.get("group_no") or 0),
            str(row.get("amo_regno") or "").strip(),
            str(row.get("prj_id") or "").strip(),
            str(row.get("activity_id") or "").strip(),
            int(row.get("parcel_no") or 0),
            int(row.get("job_seq") or 0),
            str(row.get("job_cd") or "").strip(),
            row.get("est_start_date"),
            row.get("est_end_date"),
            user_no,
        ]
        for row in add_source_rows
        if int(row.get("group_no") or 0) > 0
        and str(row.get("amo_regno") or "").strip()
        and str(row.get("prj_id") or "").strip()
        and str(row.get("activity_id") or "").strip()
        and int(row.get("parcel_no") or 0) > 0
        and int(row.get("job_seq") or 0) > 0
        and str(row.get("job_cd") or "").strip()
    ]

    try:
        with transaction() as conn:
            deleted_count = engage_rdb.delete_todo_rows(delete_params, conn)
            created_count = engage_rdb.insert_todo_rows(add_params, conn)
    except DBExecutionError as exc:
        if _is_duplicate_conflict(exc):
            raise HTTPException(status_code=409, detail="이미 생성된 To-do 항목이 포함되어 있습니다.") from exc
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    items = engage_rdb.list_engage_todo_items(prj_id, group_no)
    project["todo_list_exists"] = bool(items)
    return {
        "ok": True,
        "project": project,
        "engage_group": {
            "group_no": group_no,
            "group_name": project.get("engage_group_name"),
        },
        "todo_list_exists": bool(items),
        "created_count": created_count,
        "deleted_count": deleted_count,
        "items": items,
        "ville_id": ville_id,
        "user_no": user_no,
    }
