from __future__ import annotations

from typing import Any

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

from app.schemas.project import (
    ProjectActivityCreateRequest,
    ProjectActivityCreateResponse,
    ProjectActivityDeleteResponse,
    ProjectBaseBusinessListResponse,
    ProjectActivityUpdateRequest,
    ProjectActivityUpdateResponse,
    ProjectCreateRequest,
    ProjectCreateResponse,
    ProjectFromRagActivityResponse,
    ProjectFromRagActivityRuleRequest,
    ProjectFromRagActivityRuleResponse,
    ProjectFromRagBasicRequest,
    ProjectFromRagBasicResponse,
    ProjectJobCreateRequest,
    ProjectJobCreateResponse,
    ProjectJobDeleteResponse,
    ProjectJobUpdateRequest,
    ProjectJobUpdateResponse,
    ProjectDetailResponse,
    ProjectDeleteResponse,
    ProjectJobSetupResponse,
    ProjectListResponse,
    ProjectUpdateRequest,
    ProjectUpdateResponse,
)
from app.services.admin_project_draft_service import build_project_draft
from app.services.document_ingest_service import (
    DocumentIngestError,
    SUPPORTED_SUFFIXES,
    ingest_document,
)
from app.services.project_from_rag_service import (
    build_project_activities_from_rag,
    build_project_activity_rule_from_rag,
    build_project_basic_from_rag,
)
from app.services.project_service import (
    create_project,
    create_project_activity,
    create_project_job,
    delete_project_activity,
    delete_project,
    delete_project_job,
    get_project_detail,
    get_project_job_setup,
    list_base_businesses,
    list_projects,
    update_project_info,
    update_project_activity,
    update_project_job,
)


router = APIRouter(prefix="/project", tags=["project"])


@router.get("", response_model=ProjectListResponse)
def get_projects() -> dict:
    return list_projects()


@router.get("/base-businesses", response_model=ProjectBaseBusinessListResponse)
def get_base_businesses() -> dict:
    return list_base_businesses()


@router.post("", response_model=ProjectCreateResponse)
def post_project(payload: ProjectCreateRequest) -> dict:
    """사업 신규 등록. prj_id / biz_id 는 backend 가 자동 생성."""
    return create_project(payload.model_dump(mode="json"))


@router.post("/from-rag/basic", response_model=ProjectFromRagBasicResponse)
def post_project_from_rag_basic(payload: ProjectFromRagBasicRequest) -> dict:
    return build_project_basic_from_rag(payload.rag_file_id)


@router.post("/{prj_id}/from-rag/activity", response_model=ProjectFromRagActivityResponse)
def post_project_from_rag_activity(prj_id: str) -> dict:
    return build_project_activities_from_rag(prj_id)


@router.post(
    "/{prj_id}/from-rag/activity-rule",
    response_model=ProjectFromRagActivityRuleResponse,
)
def post_project_from_rag_activity_rule(
    prj_id: str,
    payload: ProjectFromRagActivityRuleRequest,
) -> dict:
    return build_project_activity_rule_from_rag(prj_id, payload.model_dump())


@router.get("/{prj_id}", response_model=ProjectDetailResponse)
def get_project(prj_id: str) -> dict:
    try:
        return get_project_detail(prj_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get(
    "/{prj_id}/activities/{activity_id}/job-setup",
    response_model=ProjectJobSetupResponse,
)
def get_project_activity_job_setup(prj_id: str, activity_id: str) -> dict:
    try:
        return get_project_job_setup(prj_id, activity_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.patch("/{prj_id}", response_model=ProjectUpdateResponse)
def patch_project(
    prj_id: str,
    payload: ProjectUpdateRequest,
) -> dict:
    return update_project_info(prj_id, payload.model_dump())


@router.delete("/{prj_id}", response_model=ProjectDeleteResponse)
def remove_project(
    prj_id: str,
) -> dict:
    return delete_project(prj_id)


@router.patch("/{prj_id}/activities/{activity_id}", response_model=ProjectActivityUpdateResponse)
def patch_project_activity(
    prj_id: str,
    activity_id: str,
    payload: ProjectActivityUpdateRequest,
) -> dict:
    return update_project_activity(prj_id, activity_id, payload.model_dump())


@router.post("/{prj_id}/activities", response_model=ProjectActivityCreateResponse)
def post_project_activity(
    prj_id: str,
    payload: ProjectActivityCreateRequest,
) -> dict:
    return create_project_activity(prj_id, payload.model_dump())


@router.delete("/{prj_id}/activities/{activity_id}", response_model=ProjectActivityDeleteResponse)
def remove_project_activity(
    prj_id: str,
    activity_id: str,
) -> dict:
    return delete_project_activity(prj_id, activity_id)


@router.post(
    "/{prj_id}/activities/{activity_id}/jobs",
    response_model=ProjectJobCreateResponse,
)
def post_project_job(
    prj_id: str,
    activity_id: str,
    payload: ProjectJobCreateRequest,
) -> dict:
    return create_project_job(prj_id, activity_id, payload.model_dump())


@router.patch(
    "/{prj_id}/activities/{activity_id}/jobs/{job_seq}",
    response_model=ProjectJobUpdateResponse,
)
def patch_project_job(
    prj_id: str,
    activity_id: str,
    job_seq: int,
    payload: ProjectJobUpdateRequest,
) -> dict:
    return update_project_job(prj_id, activity_id, job_seq, payload.model_dump())


@router.delete(
    "/{prj_id}/activities/{activity_id}/jobs/{job_seq}",
    response_model=ProjectJobDeleteResponse,
)
def remove_project_job(
    prj_id: str,
    activity_id: str,
    job_seq: int,
) -> dict:
    return delete_project_job(prj_id, activity_id, job_seq)


# ============================================================
# 사업 시행령 (.pdf / .docx / .hwpx) → 사업 + todo 초안 자동 생성
# ------------------------------------------------------------
# 흐름: multipart 업로드 → text 추출 (PDF/DOCX/HWPX) → 청크 → Supabase pgvector
# 영구 적재 → LLM #1 (사업 메타) + LLM #2 (todo 작업명) + extract_policy_schedule_rule
# (작업별 일정 규칙) → 초안 JSON 반환. 저장은 별개 — 사용자가 frontend 에서 검수 후 직접 등록.
# ============================================================


class _DraftIngestInfo(BaseModel):
    filename: str
    file_type: str
    blocks: int
    chunks: int
    inserted: int


class ProjectDraftFromDocumentResponse(BaseModel):
    ingest: _DraftIngestInfo
    project_draft: dict[str, Any]
    todo_drafts: list[dict[str, Any]]
    preview_blocks: list[dict[str, Any]]


@router.post(
    "/draft-from-document",
    response_model=ProjectDraftFromDocumentResponse,
)
async def draft_project_from_document(
    file: UploadFile = File(..., description=".pdf / .docx / .hwpx 시행령 문서"),
) -> ProjectDraftFromDocumentResponse:
    """업로드한 사업 시행령에서 사업 등록 초안 + todo 초안 자동 생성.

    응답은 form prefill 용. 실제 사업 등록은 별도 endpoint (POST /project ...).
    """
    filename = file.filename or "uploaded"
    suffix = ("." + filename.rsplit(".", 1)[-1].lower()) if "." in filename else ""
    if suffix not in SUPPORTED_SUFFIXES:
        raise HTTPException(
            status_code=400,
            detail=f"지원하지 않는 형식입니다: {suffix or '확장자 없음'}. .pdf / .docx / .hwpx 만 가능합니다.",
        )

    try:
        content = await file.read()
    finally:
        await file.close()

    if not content:
        raise HTTPException(status_code=400, detail="빈 파일입니다.")

    try:
        ingest = ingest_document(filename=filename, content=content)
    except DocumentIngestError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"문서 인덱싱 중 오류: {exc}") from exc

    # LLM 단계 — 실패해도 ingest 결과는 반환.
    try:
        draft = build_project_draft(ingest.get("chunk_list") or [])
    except Exception:  # noqa: BLE001
        draft = {"project_draft": {}, "todo_drafts": []}

    return ProjectDraftFromDocumentResponse(
        ingest=_DraftIngestInfo(
            filename=ingest["filename"],
            file_type=ingest["file_type"],
            blocks=ingest["blocks"],
            chunks=ingest["chunks"],
            inserted=ingest["inserted"],
        ),
        project_draft=draft.get("project_draft") or {},
        todo_drafts=draft.get("todo_drafts") or [],
        preview_blocks=ingest.get("preview_blocks") or [],
    )
