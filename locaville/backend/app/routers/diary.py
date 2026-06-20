"""``/diary`` 라우터 — 영농일지 GET 목록/단건, POST 신규 저장.

신 스키마에서는 diary_id 가 ``{user_no}-{yyyymmdd}-{exec_no}`` 형식. 라우터는 단지
서비스 호출과 예외→HTTP 코드 변환을 담당하고 비즈니스 로직은 ``diary_service`` 에.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, status as http_status

from app.repositories.diary_rdb import DiaryMySQLConflictError
from app.schemas.diary import DiaryCreate, DiaryListResponse, DiaryRecord
from app.services.diary_service import (
    DiaryRepositoryError,
    create_diary_record,
    get_diary_record,
    list_diary_records,
    list_diary_records_filtered,
)


router = APIRouter(prefix="/diary", tags=["diary"])


@router.get("", response_model=DiaryListResponse)
def get_diaries(
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
    limit: int = Query(default=100, ge=1, le=100),
) -> DiaryListResponse:
    try:
        if all(
            value is None
            for value in [farmer_id, status, work_date, prj_id, project_id, activity_id, job_cd, group_no, parcel_no, field_id]
        ):
            return DiaryListResponse(items=list_diary_records(limit=limit))
        return DiaryListResponse(
            items=list_diary_records_filtered(
                farmer_id=farmer_id,
                status=status,
                work_date=work_date,
                prj_id=prj_id,
                project_id=project_id,
                activity_id=activity_id,
                job_cd=job_cd,
                group_no=group_no,
                parcel_no=parcel_no,
                field_id=field_id,
                limit=limit,
            )
        )
    except DiaryRepositoryError as exc:
        raise HTTPException(status_code=http_status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc


@router.get("/{diary_id}", response_model=DiaryRecord)
def get_diary(diary_id: str) -> DiaryRecord:
    try:
        record = get_diary_record(diary_id)
    except DiaryRepositoryError as exc:
        raise HTTPException(status_code=http_status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    if not record:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Diary not found")
    return record


@router.post("", response_model=DiaryRecord, status_code=http_status.HTTP_201_CREATED)
def post_diary(payload: DiaryCreate) -> DiaryRecord:
    try:
        return create_diary_record(payload)
    except DiaryMySQLConflictError as exc:
        raise HTTPException(status_code=http_status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except DiaryRepositoryError as exc:
        raise HTTPException(status_code=http_status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
