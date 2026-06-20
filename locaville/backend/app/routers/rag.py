from __future__ import annotations

import json
import os
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse

from app.schemas.rag import (
    RagDeleteResponse,
    RagEmbeddingResponse,
    RagFileDetailResponse,
    RagFileBasicInfoUpdateRequest,
    RagFileBasicInfoUpdateResponse,
    RagFileListResponse,
    RagHeadingOption,
    RagPreparseResponse,
    RagRegisterResponse,
    RagVectorRecordPageResponse,
)
from app.services.rag_embedding_service import run_rag_embedding
from app.services.rag_file_service import (
    SUPPORTED_SUFFIXES,
    delete_rag_document,
    get_rag_file_detail,
    list_rag_files,
    list_rag_headings,
    list_rag_vector_record_page,
    preparse_rag_document,
    get_rag_original_file_local_path,
    register_rag_document,
    update_rag_file_basic_info,
)

router = APIRouter(prefix="/rag", tags=["rag"])


def _safe_remove_file(path: str) -> None:
    try:
        if path and os.path.exists(path):
            os.remove(path)
    except OSError:
        pass


@router.get("", response_model=RagFileListResponse)
def get_rag_files() -> dict:
    return list_rag_files()


@router.get("/headings", response_model=list[RagHeadingOption])
def get_rag_headings() -> list[dict]:
    return list_rag_headings()


@router.get("/{file_id}", response_model=RagFileDetailResponse)
def get_rag_file(file_id: str) -> dict:
    try:
        return get_rag_file_detail(file_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.patch("/{file_id}", response_model=RagFileBasicInfoUpdateResponse)
def patch_rag_file(file_id: str, payload: RagFileBasicInfoUpdateRequest) -> dict:
    try:
        return update_rag_file_basic_info(file_id, **payload.model_dump())
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.delete("/{file_id}", response_model=RagDeleteResponse)
def delete_rag_file_endpoint(file_id: str) -> dict:
    try:
        return delete_rag_document(file_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/{file_id}/vectors", response_model=RagVectorRecordPageResponse)
def get_rag_vector_records(
    file_id: str,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=50),
) -> dict:
    try:
        return list_rag_vector_record_page(file_id, offset=offset, limit=limit)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/{file_id}/original")
def get_rag_file_original(file_id: str, background_tasks: BackgroundTasks) -> FileResponse:
    try:
        local_path, download_name = get_rag_original_file_local_path(file_id)
        background_tasks.add_task(_safe_remove_file, local_path)
        return FileResponse(path=local_path, filename=download_name)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/pre-parse", response_model=RagPreparseResponse)
async def post_rag_preparse(
    file: UploadFile = File(...),
    ref_heading_id: str = Form(...),
    ref_appendix_id: str | None = Form(None),
    body_exit_criteria: str | None = Form(None),
    appendix_exit_criteria: str | None = Form(None),
) -> dict:
    filename = file.filename or "uploaded"
    suffix = Path(filename).suffix.lower() if "." in filename else ""
    if suffix not in SUPPORTED_SUFFIXES:
        raise HTTPException(
            status_code=400,
            detail=f"지원하지 않는 형식입니다: {suffix or '확장자 없음'}. {', '.join(SUPPORTED_SUFFIXES)} 만 가능합니다.",
        )
    try:
        content = await file.read()
    finally:
        await file.close()
    parsed_body_exit_criteria: dict | None = None
    if body_exit_criteria:
        try:
            loaded_body_exit = json.loads(body_exit_criteria)
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail=f"body_exit_criteria JSON 형식이 올바르지 않습니다: {exc}") from exc
        if isinstance(loaded_body_exit, dict):
            parsed_body_exit_criteria = loaded_body_exit
    parsed_appendix_exit_criteria: dict | None = None
    if appendix_exit_criteria:
        try:
            loaded_appendix_exit = json.loads(appendix_exit_criteria)
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail=f"appendix_exit_criteria JSON 형식이 올바르지 않습니다: {exc}") from exc
        if isinstance(loaded_appendix_exit, dict):
            parsed_appendix_exit_criteria = loaded_appendix_exit
    return preparse_rag_document(
        filename=filename,
        content=content,
        ref_heading_id=ref_heading_id,
        ref_appendix_id=ref_appendix_id,
        body_exit_criteria=parsed_body_exit_criteria,
        appendix_exit_criteria=parsed_appendix_exit_criteria,
    )


@router.post("/register", response_model=RagRegisterResponse)
async def post_rag_register(
    file: UploadFile = File(...),
    file_id: str = Form(...),
    file_name: str = Form(...),
    format_type: str = Form(...),
    doc_name: str = Form(...),
    doc_cat: str = Form(...),
    doc_version: float = Form(...),
    publication_date: str | None = Form(None),
    doc_number: str | None = Form(None),
    doc_manager: str | None = Form(None),
    ref_heading_id: str | None = Form(None),
    ref_appendix_id: str | None = Form(None),
    body_exit_criteria: str | None = Form(None),
    appendix_exit_criteria: str | None = Form(None),
    heading_schema: str = Form(...),
    appendix_schema: str | None = Form(None),
    schema_note: str | None = Form(None),
) -> dict:
    try:
        content = await file.read()
    finally:
        await file.close()
    try:
        parsed_schema = json.loads(heading_schema)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"heading_schema JSON 형식이 올바르지 않습니다: {exc}") from exc
    parsed_appendix_schema: dict | None = None
    if appendix_schema:
        try:
            loaded_appendix_schema = json.loads(appendix_schema)
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail=f"appendix_schema JSON 형식이 올바르지 않습니다: {exc}") from exc
        if isinstance(loaded_appendix_schema, dict):
            parsed_appendix_schema = loaded_appendix_schema
    parsed_body_exit_criteria: dict | None = None
    if body_exit_criteria:
        try:
            loaded_body_exit = json.loads(body_exit_criteria)
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail=f"body_exit_criteria JSON 형식이 올바르지 않습니다: {exc}") from exc
        if isinstance(loaded_body_exit, dict):
            parsed_body_exit_criteria = loaded_body_exit
    parsed_appendix_exit_criteria: dict | None = None
    if appendix_exit_criteria:
        try:
            loaded_appendix_exit = json.loads(appendix_exit_criteria)
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail=f"appendix_exit_criteria JSON 형식이 올바르지 않습니다: {exc}") from exc
        if isinstance(loaded_appendix_exit, dict):
            parsed_appendix_exit_criteria = loaded_appendix_exit
    return register_rag_document(
        filename=file.filename or file_name or "uploaded",
        content=content,
        file_id=file_id,
        file_name=file_name,
        format_type=format_type,
        doc_name=doc_name,
        doc_cat=doc_cat,
        doc_version=doc_version,
        publication_date=publication_date,
        doc_number=doc_number,
        doc_manager=doc_manager,
        ref_heading_id=ref_heading_id,
        ref_appendix_id=ref_appendix_id,
        body_exit_criteria=parsed_body_exit_criteria,
        appendix_exit_criteria=parsed_appendix_exit_criteria,
        heading_schema=parsed_schema,
        appendix_schema=parsed_appendix_schema,
        schema_note=schema_note,
    )


@router.post("/{file_id}/embedding", response_model=RagEmbeddingResponse)
def post_rag_embedding(file_id: str, db_update: bool = Query(True)) -> dict:
    return run_rag_embedding(file_id, preview_only=not db_update)
