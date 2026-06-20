from __future__ import annotations

import json
import os
import hashlib
from decimal import Decimal, InvalidOperation
from typing import Any

from fastapi import HTTPException
from locaville.dbcom import DBExecutionError, transaction

from app.repositories import project_rdb
from app.services.project_from_rag_service import build_project_job_repeat_setup


DEFAULT_PROJECT_USER_NO = int(os.getenv("DEFAULT_CHIEF_USER_NO", "10000001"))


def _get_current_user_no() -> int:
    return DEFAULT_PROJECT_USER_NO


def _build_project_hash_id(
    prj_name: str,
    issuer: str | None = None,
    exec_year: int | None = None,
) -> str:
    normalized_name = str(prj_name or "").strip()
    normalized_issuer = str(issuer or "").strip()
    if not normalized_name:
        return ""
    year_prefix = ""
    if exec_year not in (None, ""):
        try:
            year_prefix = f"{int(exec_year) % 100:02d}"
        except (TypeError, ValueError):
            year_prefix = ""
    hash_source = "||".join([normalized_name, normalized_issuer])
    hash_suffix = hashlib.sha256(hash_source.encode("utf-8")).hexdigest()[:6].upper()
    return f"{year_prefix}{hash_suffix}" if year_prefix else hash_suffix


def list_projects() -> dict[str, list[dict[str, Any]]]:
    return {"items": project_rdb.list_project_catalog()}


def list_base_businesses() -> dict[str, list[dict[str, Any]]]:
    return {"items": project_rdb.list_program_master_options()}


def _is_duplicate_conflict(exc: Exception) -> bool:
    message = str(exc).lower()
    return "duplicate" in message or "unique" in message or "conflict" in message


def _normalize_project_job_payload(
    prj_id: str,
    activity_id: str,
    payload: dict[str, Any],
    *,
    require_job_seq: bool,
) -> dict[str, Any]:
    if not project_rdb.get_project_catalog_detail(prj_id):
        raise HTTPException(status_code=404, detail="해당 프로젝트를 찾을 수 없습니다.")
    if not project_rdb.get_project_activity(prj_id, activity_id):
        raise HTTPException(status_code=404, detail="해당 활동 정보를 찾을 수 없습니다.")

    raw_job_seq = (payload or {}).get("job_seq")
    if require_job_seq:
        if raw_job_seq is None:
            raise HTTPException(status_code=400, detail="작업 순번이 필요합니다.")
        job_seq = int(raw_job_seq)
        if job_seq <= 0:
            raise HTTPException(status_code=400, detail="작업 순번은 1 이상의 숫자여야 합니다.")
    else:
        if raw_job_seq is None:
            job_seq = project_rdb.get_next_project_job_seq(prj_id, activity_id)
        else:
            job_seq = int(raw_job_seq)
            if job_seq <= 0:
                raise HTTPException(status_code=400, detail="작업 순번은 1 이상의 숫자여야 합니다.")

    job_cd = str((payload or {}).get("job_cd") or "").strip()
    if not job_cd:
        raise HTTPException(status_code=400, detail="작업코드를 선택해 주세요.")

    valid_job_codes = {
        str(item.get("job_cd") or "").strip()
        for item in project_rdb.list_farm_job_options()
        if str(item.get("job_cd") or "").strip()
    }
    if job_cd not in valid_job_codes:
        raise HTTPException(status_code=400, detail="선택한 작업코드가 올바르지 않습니다.")

    valid_exec_points = {
        str(item.get("code") or "").strip()
        for item in project_rdb.list_exec_point_code_options()
        if str(item.get("code") or "").strip()
    }
    exec_point_cd = str((payload or {}).get("exec_point_cd") or "").strip() or None
    if exec_point_cd and exec_point_cd not in valid_exec_points:
        raise HTTPException(status_code=400, detail="실행시점 값이 올바르지 않습니다.")

    ref_job_cd = str((payload or {}).get("ref_job_cd") or "").strip() or None
    if ref_job_cd and ref_job_cd not in valid_job_codes:
        raise HTTPException(status_code=400, detail="선후행작업 값이 올바르지 않습니다.")

    est_start_date = (payload or {}).get("est_start_date")
    est_end_date = (payload or {}).get("est_end_date")
    if est_start_date and est_end_date and est_start_date > est_end_date:
        raise HTTPException(status_code=400, detail="예상종료일자는 예상시작일자보다 빠를 수 없습니다.")

    start_date_rule = str((payload or {}).get("start_date_rule") or "").strip() or None
    end_date_rule = str((payload or {}).get("end_date_rule") or "").strip() or None
    mandatory_yn = "Y" if bool((payload or {}).get("mandatory_yn")) else "N"
    evidence_yn = "Y" if bool((payload or {}).get("evidence_yn")) else "N"

    return {
        "job_seq": job_seq,
        "job_cd": job_cd,
        "exec_point_cd": exec_point_cd,
        "ref_job_cd": ref_job_cd,
        "est_start_date": est_start_date,
        "start_date_rule": start_date_rule,
        "est_end_date": est_end_date,
        "end_date_rule": end_date_rule,
        "mandatory_yn": mandatory_yn,
        "evidence_yn": evidence_yn,
    }


def get_project_detail(prj_id: str) -> dict[str, Any]:
    project = project_rdb.get_project_catalog_detail(prj_id)
    if not project:
        raise LookupError(f"project not found: {prj_id}")
    project["activities"] = project_rdb.list_project_detail_activities(prj_id)
    project["activity_count"] = len(project["activities"])
    return {
        "project": project,
        "parcel_options": project_rdb.list_parcel_code_options(),
        "jobs": project_rdb.list_project_jobs(prj_id),
        "job_options": [],
        "exec_point_options": [],
    }


def get_project_job_setup(prj_id: str, activity_id: str) -> dict[str, Any]:
    project = project_rdb.get_project_catalog_detail(prj_id)
    if not project:
        raise LookupError(f"project not found: {prj_id}")
    activity = project_rdb.get_project_activity(prj_id, activity_id)
    if not activity:
        raise LookupError(f"activity not found: {activity_id}")
    job_options = project_rdb.list_farm_job_options()
    exec_point_options = project_rdb.list_exec_point_code_options()
    repeat_setup = build_project_job_repeat_setup(
        activity=activity,
        job_options=job_options,
        exec_point_options=exec_point_options,
    )
    return {
        "ok": True,
        "prj_id": prj_id,
        "activity_id": activity_id,
        "jobs": [job for job in project_rdb.list_project_jobs(prj_id) if str(job.get("activity_id") or "").strip() == activity_id],
        "job_options": job_options,
        "exec_point_options": exec_point_options,
        "repeat_count": int(repeat_setup.get("repeat_count") or 1),
        "repeat_job_cd": repeat_setup.get("repeat_job_cd"),
        "repeat_job_name": repeat_setup.get("repeat_job_name"),
        "repeat_job_drafts": list(repeat_setup.get("repeat_job_drafts") or []),
    }


def create_project(payload: dict[str, Any]) -> dict[str, Any]:
    """사업(program_master) + 프로젝트(project) 두 row 를 트랜잭션 안에서 INSERT.

    payload 예시 (시연단계 — 모두 optional 이나 prj_name 은 필수):
      {
        "prj_name": "2026년 저탄소 농축산물 인증 사업",
        "exec_year": 2026,
        "start_date": "2026-03-01",    # → post_date 로 매핑 (사업 공고일)
        "host_org": "농림축산식품부",   # → project.issuer 로 매핑
        "exec_org": "농산물품질관리원", # → 미저장 (시연)
        "purpose": "저탄소 농축산물 인증 …",  # → program_master.biz_overview
      }
    그 외 (target_crops, target_regions, support_conditions, budget_total_krw,
    contact, end_date) 는 별도 컬럼이 없어 무시 — RAG (pgvector) 에서 LLM 이 다시 활용.
    """
    user_no = _get_current_user_no()

    prj_name = str((payload or {}).get("prj_name") or "").strip()
    if not prj_name:
        raise HTTPException(status_code=400, detail="사업명은 비워둘 수 없습니다.")

    exec_year_raw = (payload or {}).get("exec_year")
    exec_year: int | None = None
    if exec_year_raw not in (None, ""):
        try:
            exec_year = int(exec_year_raw)
        except (TypeError, ValueError) as exc:
            raise HTTPException(status_code=400, detail="연도 값이 올바르지 않습니다.") from exc
        if exec_year < 2000 or exec_year > 2100:
            raise HTTPException(status_code=400, detail="연도 값이 올바르지 않습니다.")

    # post_date 는 사업 공고일/시행 시작일로 매핑 (둘 다 후보 — 시작일이 의미상 가까움).
    post_date = (payload or {}).get("post_date") or (payload or {}).get("start_date")

    # issuer 는 주관기관(host_org) 가 1순위, 시행기관(exec_org) 가 2순위.
    issuer_raw = (payload or {}).get("issuer") or (payload or {}).get("host_org") or (payload or {}).get("exec_org") or ""
    issuer = str(issuer_raw).strip() or None

    selected_biz_id = str((payload or {}).get("biz_id") or "").strip()
    if not selected_biz_id:
        raise HTTPException(status_code=400, detail="기반 사업(biz_id)을 먼저 선택해 주세요.")
    biz_name = str((payload or {}).get("biz_name") or prj_name).strip()
    biz_overview_raw = (payload or {}).get("purpose") or (payload or {}).get("biz_overview") or ""
    biz_overview = str(biz_overview_raw).strip() or None
    rag_file_id = str((payload or {}).get("rag_file_id") or "").strip() or None

    biz_id = selected_biz_id
    auto_generate_project_id = bool((payload or {}).get("auto_generate_project_id", True))
    requested_project_id = str((payload or {}).get("project_id") or "").strip().upper()
    if auto_generate_project_id:
        prj_id = _build_project_hash_id(prj_name, issuer=issuer, exec_year=exec_year)
    else:
        prj_id = requested_project_id

    if not prj_id:
        raise HTTPException(status_code=400, detail="프로젝트ID를 생성할 수 없습니다. 프로젝트명을 확인해 주세요.")

    try:
        with transaction() as conn:
            project_rdb.insert_project(
                prj_id=prj_id,
                prj_name=prj_name,
                exec_year=exec_year,
                biz_id=biz_id,
                post_date=post_date,
                issuer=issuer,
                rag_file_id=rag_file_id,
                reg_no=user_no,
                connection=conn,
            )
    except DBExecutionError as exc:
        if _is_duplicate_conflict(exc):
            raise HTTPException(status_code=409, detail="이미 존재하는 사업 ID입니다.") from exc
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {
        "ok": True,
        "prj_id": prj_id,
        "biz_id": biz_id,
    }


def update_project_info(
    prj_id: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    user_no = _get_current_user_no()
    project = project_rdb.get_project_catalog_detail(prj_id)
    if not project:
        raise HTTPException(status_code=404, detail="해당 프로젝트를 찾을 수 없습니다.")
    if int(project.get("activity_count") or 0) > 0:
        raise HTTPException(status_code=400, detail="활동이 등록된 프로젝트는 기본정보를 수정할 수 없습니다.")

    prj_name = str((payload or {}).get("prj_name") or "").strip()
    if not prj_name:
        raise HTTPException(status_code=400, detail="프로젝트명은 비워둘 수 없습니다.")

    biz_id = str((payload or {}).get("biz_id") or "").strip()
    if not biz_id:
        raise HTTPException(status_code=400, detail="기반 사업을 선택해 주세요.")

    exec_year = (payload or {}).get("exec_year")
    if exec_year is not None:
        exec_year = int(exec_year)
        if exec_year < 2000 or exec_year > 2100:
            raise HTTPException(status_code=400, detail="연도 값이 올바르지 않습니다.")

    auto_generate_project_id = bool((payload or {}).get("auto_generate_project_id", True))
    requested_project_id = str((payload or {}).get("project_id") or "").strip().upper()
    next_prj_id = _build_project_hash_id(prj_name, issuer=str((payload or {}).get("issuer") or "").strip() or None, exec_year=exec_year) if auto_generate_project_id else requested_project_id
    if not next_prj_id:
        raise HTTPException(status_code=400, detail="프로젝트ID를 생성할 수 없습니다.")

    post_date = (payload or {}).get("post_date")
    issuer = str((payload or {}).get("issuer") or "").strip() or None
    rag_file_id = str((payload or {}).get("rag_file_id") or "").strip() or None

    try:
        with transaction() as conn:
            if next_prj_id == prj_id:
                project_rdb.update_project_info(
                    prj_id=prj_id,
                    prj_name=prj_name,
                    exec_year=exec_year,
                    biz_id=biz_id,
                    post_date=post_date,
                    issuer=issuer,
                    rag_file_id=rag_file_id,
                    mod_no=user_no,
                    connection=conn,
                )
            else:
                project_rdb.delete_project(prj_id, conn)
                project_rdb.insert_project(
                    prj_id=next_prj_id,
                    prj_name=prj_name,
                    exec_year=exec_year,
                    biz_id=biz_id,
                    post_date=post_date,
                    issuer=issuer,
                    rag_file_id=rag_file_id,
                    reg_no=user_no,
                    connection=conn,
                )
    except DBExecutionError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {
        "ok": True,
        "prj_id": next_prj_id,
    }


def delete_project(prj_id: str) -> dict[str, Any]:
    project = project_rdb.get_project_catalog_detail(prj_id)
    if not project:
        raise HTTPException(status_code=404, detail="해당 프로젝트를 찾을 수 없습니다.")

    if project_rdb.count_project_group_links(prj_id) > 0:
        raise HTTPException(
            status_code=400,
            detail="해당 프로젝트가 prj_grp에 등록되어 있어 삭제할 수 없습니다.",
        )

    try:
        with transaction() as conn:
            project_rdb.delete_project_jobs_by_project(prj_id, conn)
            project_rdb.delete_project_activity_parcels_by_project(prj_id, conn)
            project_rdb.delete_project_activities_by_project(prj_id, conn)
            project_rdb.delete_project(prj_id, conn)
    except DBExecutionError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {
        "ok": True,
        "prj_id": prj_id,
    }


def update_project_activity(
    prj_id: str,
    activity_id: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    user_no = _get_current_user_no()
    if not project_rdb.get_project_catalog_detail(prj_id):
        raise HTTPException(status_code=404, detail="해당 프로젝트를 찾을 수 없습니다.")
    if not project_rdb.get_project_activity(prj_id, activity_id):
        raise HTTPException(status_code=404, detail="해당 활동 정보를 찾을 수 없습니다.")

    activity_name = str((payload or {}).get("activity_name") or "").strip()
    if not activity_name:
        raise HTTPException(status_code=400, detail="활동명은 비워둘 수 없습니다.")
    raw_activity_rule = (payload or {}).get("activity_rule")
    if raw_activity_rule in (None, "", {}):
        activity_rule = None
    elif isinstance(raw_activity_rule, dict):
        activity_rule = raw_activity_rule
    elif isinstance(raw_activity_rule, str):
        try:
            parsed_rule = json.loads(raw_activity_rule)
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail="활동규칙 형식이 올바르지 않습니다.") from exc
        if not isinstance(parsed_rule, dict):
            raise HTTPException(status_code=400, detail="활동규칙 형식이 올바르지 않습니다.")
        activity_rule = parsed_rule
    else:
        raise HTTPException(status_code=400, detail="활동규칙 형식이 올바르지 않습니다.")
    description = str((payload or {}).get("description") or "").strip() or None

    est_start_date = (payload or {}).get("est_start_date")
    est_end_date = (payload or {}).get("est_end_date")
    if est_start_date and est_end_date and est_start_date > est_end_date:
        raise HTTPException(status_code=400, detail="예상종료일자는 예상시작일자보다 빠를 수 없습니다.")

    raw_subsidy_value = (payload or {}).get("subsidy_amt_display")
    try:
        subsidy_amt_display = Decimal(str(raw_subsidy_value if raw_subsidy_value is not None else 0))
    except (InvalidOperation, ValueError) as exc:
        raise HTTPException(status_code=400, detail="활동비 형식이 올바르지 않습니다.") from exc
    if subsidy_amt_display < 0:
        raise HTTPException(status_code=400, detail="활동비는 0원 이상이어야 합니다.")
    if subsidy_amt_display.quantize(Decimal("1")) != subsidy_amt_display:
        raise HTTPException(status_code=400, detail="활동비는 1원 단위 숫자로 입력해 주세요.")
    if subsidy_amt_display % Decimal("1000") != 0:
        raise HTTPException(status_code=400, detail="활동비는 1,000원 단위로 입력해 주세요.")
    subsidy_amt = (subsidy_amt_display / Decimal("10000")).quantize(Decimal("0.1"))

    raw_parcel_codes = (payload or {}).get("parcel_codes") or []
    parcel_codes = sorted({str(code).strip() for code in raw_parcel_codes if str(code).strip()})
    valid_codes = {
        str(item.get("code") or "").strip()
        for item in project_rdb.list_parcel_code_options()
    }
    invalid_codes = [code for code in parcel_codes if code not in valid_codes]
    if invalid_codes:
        raise HTTPException(status_code=400, detail="대상 농지 선택값이 올바르지 않습니다.")

    try:
        with transaction() as conn:
            project_rdb.update_project_activity_info(
                prj_id=prj_id,
                activity_id=activity_id,
                activity_name=activity_name,
                activity_rule=activity_rule,
                description=description,
                est_start_date=est_start_date,
                est_end_date=est_end_date,
                subsidy_amt=subsidy_amt,
                mod_no=user_no,
                connection=conn,
            )
            project_rdb.delete_project_activity_parcel_codes(
                prj_id=prj_id,
                activity_id=activity_id,
                grp_cd="PARCEL",
                connection=conn,
            )
            project_rdb.insert_project_activity_parcel_codes(
                prj_id=prj_id,
                activity_id=activity_id,
                grp_cd="PARCEL",
                parcel_codes=parcel_codes,
                reg_no=user_no,
                connection=conn,
            )
    except DBExecutionError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {
        "ok": True,
        "prj_id": prj_id,
        "activity_id": activity_id,
    }


def create_project_activity(
    prj_id: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    user_no = _get_current_user_no()
    if not project_rdb.get_project_catalog_detail(prj_id):
        raise HTTPException(status_code=404, detail="해당 프로젝트를 찾을 수 없습니다.")

    activity_id = str((payload or {}).get("activity_id") or "").strip()
    if not activity_id:
        raise HTTPException(status_code=400, detail="활동 ID는 비워둘 수 없습니다.")
    if project_rdb.get_project_activity(prj_id, activity_id):
        raise HTTPException(status_code=409, detail="이미 존재하는 활동 ID입니다.")

    activity_name = str((payload or {}).get("activity_name") or "").strip()
    if not activity_name:
        raise HTTPException(status_code=400, detail="활동명은 비워둘 수 없습니다.")
    raw_activity_rule = (payload or {}).get("activity_rule")
    if raw_activity_rule in (None, "", {}):
        activity_rule = None
    elif isinstance(raw_activity_rule, dict):
        activity_rule = raw_activity_rule
    elif isinstance(raw_activity_rule, str):
        try:
            parsed_rule = json.loads(raw_activity_rule)
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail="활동규칙 형식이 올바르지 않습니다.") from exc
        if not isinstance(parsed_rule, dict):
            raise HTTPException(status_code=400, detail="활동규칙 형식이 올바르지 않습니다.")
        activity_rule = parsed_rule
    else:
        raise HTTPException(status_code=400, detail="활동규칙 형식이 올바르지 않습니다.")
    description = str((payload or {}).get("description") or "").strip() or None

    est_start_date = (payload or {}).get("est_start_date")
    est_end_date = (payload or {}).get("est_end_date")
    if est_start_date and est_end_date and est_start_date > est_end_date:
        raise HTTPException(status_code=400, detail="예상종료일자는 예상시작일자보다 빠를 수 없습니다.")

    raw_subsidy_value = (payload or {}).get("subsidy_amt_display")
    try:
        subsidy_amt_display = Decimal(str(raw_subsidy_value if raw_subsidy_value is not None else 0))
    except (InvalidOperation, ValueError) as exc:
        raise HTTPException(status_code=400, detail="활동비 형식이 올바르지 않습니다.") from exc
    if subsidy_amt_display < 0:
        raise HTTPException(status_code=400, detail="활동비는 0원 이상이어야 합니다.")
    if subsidy_amt_display.quantize(Decimal("1")) != subsidy_amt_display:
        raise HTTPException(status_code=400, detail="활동비는 1원 단위 숫자로 입력해 주세요.")
    if subsidy_amt_display % Decimal("1000") != 0:
        raise HTTPException(status_code=400, detail="활동비는 1,000원 단위로 입력해 주세요.")
    subsidy_amt = (subsidy_amt_display / Decimal("10000")).quantize(Decimal("0.1"))

    raw_parcel_codes = (payload or {}).get("parcel_codes") or []
    parcel_codes = sorted({str(code).strip() for code in raw_parcel_codes if str(code).strip()})
    valid_codes = {
        str(item.get("code") or "").strip()
        for item in project_rdb.list_parcel_code_options()
    }
    invalid_codes = [code for code in parcel_codes if code not in valid_codes]
    if invalid_codes:
        raise HTTPException(status_code=400, detail="대상 농지 선택값이 올바르지 않습니다.")

    try:
        with transaction() as conn:
            project_rdb.insert_project_activity(
                prj_id=prj_id,
                activity_id=activity_id,
                activity_name=activity_name,
                activity_rule=activity_rule,
                description=description,
                est_start_date=est_start_date,
                est_end_date=est_end_date,
                subsidy_amt=subsidy_amt,
                reg_no=user_no,
                connection=conn,
            )
            project_rdb.insert_project_activity_parcel_codes(
                prj_id=prj_id,
                activity_id=activity_id,
                grp_cd="PARCEL",
                parcel_codes=parcel_codes,
                reg_no=user_no,
                connection=conn,
            )
    except DBExecutionError as exc:
        message = str(exc).lower()
        if "duplicate" in message or "unique" in message or "conflict" in message:
            raise HTTPException(status_code=409, detail="이미 존재하는 활동 ID입니다.") from exc
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {
        "ok": True,
        "prj_id": prj_id,
        "activity_id": activity_id,
    }


def delete_project_activity(
    prj_id: str,
    activity_id: str,
) -> dict[str, Any]:
    project = project_rdb.get_project_catalog_detail(prj_id)
    if not project:
        raise HTTPException(status_code=404, detail="해당 프로젝트를 찾을 수 없습니다.")
    if not project_rdb.get_project_activity(prj_id, activity_id):
        raise HTTPException(status_code=404, detail="해당 활동 정보를 찾을 수 없습니다.")

    try:
        with transaction() as conn:
            project_rdb.delete_project_jobs_by_activity(prj_id, activity_id, conn)
            project_rdb.delete_project_activity_parcel_codes(
                prj_id=prj_id,
                activity_id=activity_id,
                grp_cd="PARCEL",
                connection=conn,
            )
            project_rdb.delete_project_activity(prj_id, activity_id, conn)
    except DBExecutionError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {
        "ok": True,
        "prj_id": prj_id,
        "activity_id": activity_id,
    }


def create_project_job(
    prj_id: str,
    activity_id: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    user_no = _get_current_user_no()
    normalized = _normalize_project_job_payload(prj_id, activity_id, payload, require_job_seq=False)
    job_seq = int(normalized["job_seq"])

    if project_rdb.get_project_job(prj_id, activity_id, job_seq):
        raise HTTPException(status_code=409, detail="이미 존재하는 작업 순번입니다.")

    try:
        with transaction() as conn:
            project_rdb.insert_project_job(
                prj_id=prj_id,
                activity_id=activity_id,
                job_seq=job_seq,
                job_cd=normalized["job_cd"],
                exec_point_cd=normalized["exec_point_cd"],
                ref_job_cd=normalized["ref_job_cd"],
                est_start_date=normalized["est_start_date"],
                start_date_rule=normalized["start_date_rule"],
                est_end_date=normalized["est_end_date"],
                end_date_rule=normalized["end_date_rule"],
                mandatory_yn=normalized["mandatory_yn"],
                evidence_yn=normalized["evidence_yn"],
                reg_no=user_no,
                connection=conn,
            )
    except DBExecutionError as exc:
        if _is_duplicate_conflict(exc):
            raise HTTPException(status_code=409, detail="이미 존재하는 작업 순번입니다.") from exc
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {
        "ok": True,
        "prj_id": prj_id,
        "activity_id": activity_id,
        "job_seq": job_seq,
    }


def update_project_job(
    prj_id: str,
    activity_id: str,
    job_seq: int,
    payload: dict[str, Any],
) -> dict[str, Any]:
    user_no = _get_current_user_no()
    if not project_rdb.get_project_job(prj_id, activity_id, job_seq):
        raise HTTPException(status_code=404, detail="해당 작업 정보를 찾을 수 없습니다.")

    normalized = _normalize_project_job_payload(
        prj_id,
        activity_id,
        {
            **(payload or {}),
            "job_seq": job_seq,
        },
        require_job_seq=True,
    )

    try:
        with transaction() as conn:
            project_rdb.update_project_job(
                prj_id=prj_id,
                activity_id=activity_id,
                job_seq=job_seq,
                job_cd=normalized["job_cd"],
                exec_point_cd=normalized["exec_point_cd"],
                ref_job_cd=normalized["ref_job_cd"],
                est_start_date=normalized["est_start_date"],
                start_date_rule=normalized["start_date_rule"],
                est_end_date=normalized["est_end_date"],
                end_date_rule=normalized["end_date_rule"],
                mandatory_yn=normalized["mandatory_yn"],
                evidence_yn=normalized["evidence_yn"],
                mod_no=user_no,
                connection=conn,
            )
    except DBExecutionError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {
        "ok": True,
        "prj_id": prj_id,
        "activity_id": activity_id,
        "job_seq": job_seq,
    }


def delete_project_job(
    prj_id: str,
    activity_id: str,
    job_seq: int,
) -> dict[str, Any]:
    if not project_rdb.get_project_job(prj_id, activity_id, job_seq):
        raise HTTPException(status_code=404, detail="해당 작업 정보를 찾을 수 없습니다.")

    try:
        with transaction() as conn:
            project_rdb.delete_project_job(
                prj_id=prj_id,
                activity_id=activity_id,
                job_seq=job_seq,
                connection=conn,
            )
    except DBExecutionError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {
        "ok": True,
        "prj_id": prj_id,
        "activity_id": activity_id,
        "job_seq": job_seq,
    }
