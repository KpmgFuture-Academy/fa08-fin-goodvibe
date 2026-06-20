"""``/evidence`` 라우터 — 증빙 목록/단건/신규/업로드/검토 PATCH.

핵심: ``POST /evidence/upload`` 는 multipart/form-data 로 파일 + 메타를 함께 받음.
PATCH 는 이장님 검토 흐름(``status='confirmed'`` 또는 ``'retake_required'``).
"""
from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, Query, Request, UploadFile, status as http_status

from app.repositories.evidence_rdb import EvidenceMySQLConflictError
from app.schemas.evidence import (
    EvidenceCreate,
    EvidenceListResponse,
    EvidenceMissingResponse,
    EvidenceRecord,
    EvidenceUpdate,
)
from app.services.evidence_service import (
    ALLOWED_UPLOAD_EXTENSIONS,
    EvidenceConflictError,
    EvidenceInputError,
    EvidenceRepositoryError,
    MAX_UPLOAD_SIZE_BYTES,
    create_evidence_record,
    create_uploaded_evidence_record,
    get_evidence_missing_status,
    get_evidence_record,
    list_evidence_records,
    list_evidence_records_filtered,
    update_evidence_record,
)


router = APIRouter(prefix="/evidence", tags=["evidence"])


@router.get("", response_model=EvidenceListResponse)
def get_evidence_list(
    farmer_id: str | None = None,
    status: str | None = None,
    evidence_type: str | None = None,
    confirmed_label: str | None = None,
    activity_type: str | None = None,
    activity_id: str | None = None,
    job_cd: str | None = None,
    group_no: int | None = None,
    field_id: str | None = None,
    parcel_no: str | None = None,
    project_id: str | None = None,
    prj_id: str | None = None,
    limit: int = Query(default=100, ge=1, le=100),
) -> EvidenceListResponse:
    # 증빙 목록 조회 API입니다.
    # 쿼리 파라미터가 있으면 해당 조건으로 좁혀서 반환합니다.
    try:
        if all(
            value is None
            for value in [
                farmer_id,
                status,
                evidence_type,
                confirmed_label,
                activity_type,
                activity_id,
                job_cd,
                group_no,
                field_id,
                parcel_no,
                project_id,
                prj_id,
            ]
        ):
            return EvidenceListResponse(items=list_evidence_records()[:limit])
        return EvidenceListResponse(
            items=list_evidence_records_filtered(
                farmer_id=farmer_id,
                status=status,
                evidence_type=evidence_type,
                confirmed_label=confirmed_label,
                activity_type=activity_type,
                activity_id=activity_id,
                job_cd=job_cd,
                group_no=group_no,
                field_id=field_id,
                parcel_no=parcel_no,
                project_id=project_id,
                prj_id=prj_id,
                limit=limit,
            )
        )
    except EvidenceRepositoryError as exc:
        raise HTTPException(status_code=http_status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc


@router.get("/missing", response_model=EvidenceMissingResponse)
def get_missing_evidence(
    activity_type: str,
    farmer_id: str | None = None,
    field_id: str | None = None,
    parcel_no: str | None = None,
    project_id: str | None = None,
    prj_id: str | None = None,
) -> EvidenceMissingResponse:
    # 활동별 필수 증빙 대비, 현재 빠진 증빙이 무엇인지 계산해서 내려줍니다.
    return EvidenceMissingResponse.model_validate(
        get_evidence_missing_status(
            activity_type=activity_type,
            farmer_id=farmer_id,
            field_id=field_id,
            parcel_no=parcel_no,
            project_id=project_id,
            prj_id=prj_id,
        )
    )


@router.post("/upload", response_model=EvidenceRecord, status_code=http_status.HTTP_201_CREATED)
async def upload_evidence(
    request: Request,
    file: UploadFile | None = File(default=None),
    farmer_id: str = Form(..., min_length=1),
    group_no: int | None = Form(default=None),
    field_id: str = Form(default=""),
    parcel_no: str = Form(default=""),
    prj_id: str = Form(default=""),
    project_id: str = Form(default=""),
    todo_id: str = Form(default=""),
    activity_id: str = Form(default=""),
    job_cd: str = Form(default=""),
    activity_type: str = Form(...),
    evidence_type: str = Form(...),
    confirmed_label: str = Form(default=""),
    status_value: str = Form(default="needs_review", alias="status"),
    user_message: str = Form(default=""),
    # GPS 는 빈 문자열도 허용해야 하므로 str 로 받고 아래에서 안전 파싱 (빈/비정상 → None).
    gps_lat: str = Form(default=""),
    gps_long: str = Form(default=""),
) -> EvidenceRecord:
    # 사진 파일 업로드 + 증빙 레코드 생성을 한 번에 처리합니다.
    # 파일 확장자/용량 검증 후 uploads 폴더에 저장합니다.
    if file is None:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="업로드할 이미지 파일이 없습니다.")

    extension = Path(file.filename or "").suffix.lower()
    if extension not in ALLOWED_UPLOAD_EXTENSIONS:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="허용되지 않는 파일 형식입니다. jpg, jpeg, png, webp만 업로드할 수 있습니다.",
        )

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="업로드할 이미지 파일이 없습니다.")
    if len(file_bytes) > MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="10MB 이하 이미지 파일만 업로드할 수 있습니다.")

    def _parse_coord(value: str) -> float | None:
        try:
            return float(value) if str(value).strip() != "" else None
        except (TypeError, ValueError):
            return None

    try:
        return create_uploaded_evidence_record(
            file_bytes=file_bytes,
            extension=extension,
            base_url=str(request.base_url).rstrip("/"),
            todo_id=todo_id,
            prj_id=prj_id,
            project_id=project_id,
            activity_id=activity_id,
            farmer_id=farmer_id,
            group_no=group_no,
            parcel_no=parcel_no,
            field_id=field_id,
            activity_type=activity_type,
            job_cd=job_cd,
            evidence_type=evidence_type,
            confirmed_label=confirmed_label,
            status=status_value,
            user_message=user_message,
            gps_lat=_parse_coord(gps_lat),
            gps_long=_parse_coord(gps_long),
        )
    except EvidenceInputError as exc:
        # 알 수 없는 farmer_id 등 입력 데이터 문제 — 사유를 그대로 노출 (400).
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except EvidenceMySQLConflictError as exc:
        raise HTTPException(status_code=http_status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except EvidenceRepositoryError as exc:
        raise HTTPException(status_code=http_status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc


@router.get("/{evidence_id}", response_model=EvidenceRecord)
def get_evidence(evidence_id: str) -> EvidenceRecord:
    # 증빙 단건 상세 조회입니다.
    try:
        record = get_evidence_record(evidence_id)
    except EvidenceRepositoryError as exc:
        raise HTTPException(status_code=http_status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    if not record:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Evidence not found")
    return record


@router.post("", response_model=EvidenceRecord, status_code=http_status.HTTP_201_CREATED)
def post_evidence(payload: EvidenceCreate) -> EvidenceRecord:
    # 파일 업로드 없이 증빙 메타만 직접 생성할 때 사용하는 API입니다.
    try:
        return create_evidence_record(payload)
    except (EvidenceConflictError, EvidenceMySQLConflictError) as exc:
        raise HTTPException(status_code=http_status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except EvidenceRepositoryError as exc:
        raise HTTPException(status_code=http_status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc


@router.patch("/{evidence_id}", response_model=EvidenceRecord)
def patch_evidence(evidence_id: str, payload: EvidenceUpdate) -> EvidenceRecord:
    # 이장님 검토용 상태 변경 API입니다.
    # status/confirmed_label/user_message 같은 일부 필드만 수정합니다.
    try:
        record = update_evidence_record(evidence_id, payload)
    except EvidenceRepositoryError as exc:
        raise HTTPException(status_code=http_status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    if not record:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Evidence not found")
    return record
