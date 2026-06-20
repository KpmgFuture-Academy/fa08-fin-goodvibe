from __future__ import annotations

import os

from fastapi import HTTPException
from locaville.dbcom import DBExecutionError, transaction
from locaville.rag.chunk_builder import ChunkBuilder
from locaville.rag.document_parser import DocumentParser, RagEmbeddingParseError
from locaville.rag.vector_embedder import embed_chunks

from app.repositories import rag_rdb
from app.services.rag_file_service import get_rag_original_file_local_path, resolve_heading_schema_for_runtime

DEFAULT_RAG_USER_NO = int(os.getenv("DEFAULT_CHIEF_USER_NO", "10000001"))
_PARSER = DocumentParser()
_CHUNK_BUILDER = ChunkBuilder()


def _load_original_file_bytes(file_id: str) -> tuple[dict, bytes]:
    item = rag_rdb.get_rag_file(file_id)
    if not item:
        raise LookupError(f"rag file not found: {file_id}")
    local_path, _download_name = get_rag_original_file_local_path(file_id)
    try:
        with open(local_path, "rb") as fp:
            content = fp.read()
    finally:
        try:
            os.remove(local_path)
        except OSError:
            pass
    return item, content


def run_rag_embedding(file_id: str, *, preview_only: bool = False) -> dict:
    try:
        item, content = _load_original_file_bytes(file_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    file_name = str(item.get("file_name") or "").strip()
    heading_schema = item.get("heading_schema")
    if not isinstance(heading_schema, dict):
        raise HTTPException(status_code=400, detail="heading_schema 가 등록되지 않았습니다.")
    appendix_schema = item.get("appendix_schema")
    body_exit_criteria = item.get("body_exit_criteria")
    appendix_exit_criteria = item.get("appendix_exit_criteria")
    runtime_heading_schema = resolve_heading_schema_for_runtime(heading_schema)
    runtime_appendix_schema = (
        resolve_heading_schema_for_runtime(appendix_schema)
        if isinstance(appendix_schema, dict)
        else None
    )

    try:
        segments = _PARSER.parse_document(
            file_id=file_id,
            filename=file_name,
            content=content,
            heading_schema=runtime_heading_schema,
            appendix_schema=runtime_appendix_schema,
            body_exit_criteria=body_exit_criteria if isinstance(body_exit_criteria, dict) else None,
            appendix_exit_criteria=appendix_exit_criteria if isinstance(appendix_exit_criteria, dict) else None,
        )
    except RagEmbeddingParseError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not segments:
        raise HTTPException(status_code=400, detail="임베딩할 본문 segment 를 만들지 못했습니다.")

    chunks = _CHUNK_BUILDER.build_chunks(
        file_id=file_id,
        file_name=file_name,
        segments=segments,
    )
    if not chunks:
        raise HTTPException(status_code=400, detail="임베딩할 chunk 를 만들지 못했습니다.")

    embedding_model, vectors = embed_chunks(chunks)
    rows = [rag_rdb.build_rag_vector_row(chunk=chunk, embedding=embedding) for chunk, embedding in zip(chunks, vectors)]

    inserted = 0
    if not preview_only:
        try:
            with transaction() as conn:
                # 재실행 시 이전 임베딩 개수와 무관하게 이번 결과만 남기도록 전체 교체한다.
                rag_rdb.delete_rag_vectors(file_id=file_id, connection=conn)
                inserted = rag_rdb.insert_rag_vectors(rows=rows, user_no=DEFAULT_RAG_USER_NO, connection=conn)
                rag_rdb.update_rag_file_embedding_status(
                    file_id=file_id,
                    embedding_yn="Y" if inserted > 0 else "N",
                    user_no=DEFAULT_RAG_USER_NO,
                    connection=conn,
                )
        except DBExecutionError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=500, detail=f"벡터 등록 실패: {exc}") from exc

    records = []
    for row in rows:
        content_text = str(row.get("content") or "")
        newline_count = content_text.count("\n")
        records.append(
            {
                "chunk_id": row.get("chunk_id"),
                "heading_path": row.get("heading_path"),
                "chunk_loc": row.get("chunk_loc"),
                "location": row.get("location"),
                "block_type": row.get("block_type"),
                "content": content_text,
                "content_preview": content_text[:500],
                "content_length": len(content_text),
                "newline_count": newline_count,
                "line_count": newline_count + 1 if content_text else 0,
                "source_order_start": row.get("source_order_start"),
                "source_order_end": row.get("source_order_end"),
                "metadata": row.get("attributes") or {},
            }
        )

    return {
        "ok": True,
        "file_id": file_id,
        "preview_only": preview_only,
        "embedding_model": embedding_model,
        "parsed_segment_count": len(segments),
        "chunk_count": len(chunks),
        "inserted_count": inserted,
        "records": records,
    }
