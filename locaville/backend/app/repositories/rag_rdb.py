"""RAG 관리용 저장소."""
from __future__ import annotations

import json
from datetime import date, datetime
from typing import Any

from locaville.dbcom import execute, fetch_all, fetch_one


def _iso(value: Any) -> str | None:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return None


def _vector_literal(values: list[float]) -> str:
    return "[" + ",".join(f"{float(value):.12f}".rstrip("0").rstrip(".") for value in values) + "]"


def _normalize_chunk_loc(value: Any) -> str | None:
    raw = str(value or "").strip()
    if not raw:
        return None

    def _normalize_token(token: str) -> str:
        cleaned = token.strip()
        if not cleaned:
            return ""
        if cleaned.startswith("s") and ":" in cleaned:
            prefix, remainder = cleaned.split(":", 1)
            if prefix[1:].isdigit():
                cleaned = remainder
        if ":" in cleaned:
            cleaned = cleaned.split(":", 1)[0].strip()
        return cleaned

    def _collapse_tokens(tokens: list[str]) -> list[str]:
        collapsed: list[str] = []
        number_run: list[int] = []

        def flush_number_run() -> None:
            nonlocal number_run
            if not number_run:
                return
            if len(number_run) >= 2 and all(number_run[idx] == number_run[idx - 1] + 1 for idx in range(1, len(number_run))):
                collapsed.append(f"{number_run[0]}~{number_run[-1]}")
            else:
                collapsed.extend(str(item) for item in number_run)
            number_run = []

        for token in tokens:
            if token.isdigit():
                value = int(token)
                if not number_run or value == number_run[-1] + 1:
                    number_run.append(value)
                    continue
                flush_number_run()
                number_run.append(value)
                continue
            flush_number_run()
            collapsed.append(token)

        flush_number_run()
        return collapsed

    parts = raw.split("~")
    normalized_parts: list[str] = []
    for part in parts:
        token = _normalize_token(part)
        if token:
            normalized_parts.append(token)
    if not normalized_parts:
        return None
    return "~".join(_collapse_tokens(normalized_parts))


def list_rag_headings(*, active_only: bool = True) -> list[dict[str, Any]]:
    where = "WHERE active_yn = 'Y'" if active_only else ""
    sql = f"""
        SELECT heading_id, heading_name, heading_summary, heading_schema, body_yn, active_yn
        FROM rag_heading
        {where}
        ORDER BY heading_name, heading_id
    """
    return fetch_all(sql, []) or []


def get_rag_heading(heading_id: str) -> dict[str, Any] | None:
    return fetch_one(
        """
        SELECT heading_id, heading_name, heading_summary, heading_schema, body_yn, active_yn
        FROM rag_heading
        WHERE heading_id = %s
        LIMIT 1
        """,
        [heading_id],
    )


def get_rag_heading_rule(rule_id: str) -> dict[str, Any] | None:
    return fetch_one(
        """
        SELECT rule_id, rule_name, rule_type, notation, notation_display, pattern_text, rule_options, active_yn
        FROM rag_heading_rule
        WHERE rule_id = %s
        LIMIT 1
        """,
        [rule_id],
    )


def list_rag_files() -> list[dict[str, Any]]:
    sql = """
        SELECT
            rf.file_id,
            rf.file_name,
            rf.file_path,
            rf.format_type,
            rf.doc_name,
            rf.doc_cat,
            rf.doc_version,
            rf.publication_date,
            rf.doc_number,
            rf.doc_manager,
            rf.embedding_yn,
            rf.ref_heading_id,
            rf.ref_appendix_id,
            rf.body_exit_criteria,
            rf.appendix_exit_criteria,
            rf.schema_note,
            rf.reg_dt,
            rf.mod_dt,
            COUNT(rv.chunk_id) AS vector_count
        FROM rag_file rf
        LEFT JOIN rag_vector rv ON rv.file_id = rf.file_id
        GROUP BY
            rf.file_id, rf.file_name, rf.file_path, rf.format_type, rf.doc_name, rf.doc_cat,
            rf.doc_version, rf.publication_date, rf.doc_manager, rf.embedding_yn, rf.ref_heading_id, rf.ref_appendix_id,
            rf.body_exit_criteria, rf.appendix_exit_criteria, rf.doc_number, rf.schema_note, rf.reg_dt, rf.mod_dt
        ORDER BY COALESCE(rf.mod_dt, rf.reg_dt) DESC, rf.file_id
    """
    rows = fetch_all(sql, []) or []
    items: list[dict[str, Any]] = []
    for row in rows:
        items.append({
            "file_id": str(row.get("file_id") or "").strip(),
            "file_name": str(row.get("file_name") or "").strip(),
            "file_path": str(row.get("file_path") or "").strip() or None,
            "format_type": str(row.get("format_type") or "").strip(),
            "doc_name": str(row.get("doc_name") or "").strip(),
            "doc_cat": str(row.get("doc_cat") or "").strip(),
            "doc_version": float(row.get("doc_version") or 1.0),
            "publication_date": _iso(row.get("publication_date")),
            "doc_number": str(row.get("doc_number") or "").strip() or None,
            "doc_manager": str(row.get("doc_manager") or "").strip() or None,
            "embedding_yn": str(row.get("embedding_yn") or "").strip() or None,
            "ref_heading_id": str(row.get("ref_heading_id") or "").strip() or None,
            "ref_appendix_id": str(row.get("ref_appendix_id") or "").strip() or None,
            "body_exit_criteria": row.get("body_exit_criteria") or None,
            "appendix_exit_criteria": row.get("appendix_exit_criteria") or None,
            "schema_note": str(row.get("schema_note") or "").strip() or None,
            "vector_count": int(row.get("vector_count") or 0),
            "reg_dt": _iso(row.get("reg_dt")),
            "mod_dt": _iso(row.get("mod_dt")),
        })
    return items


def get_rag_file(file_id: str) -> dict[str, Any] | None:
    row = fetch_one(
        """
        SELECT
            rf.file_id,
            rf.file_name,
            rf.file_path,
            rf.format_type,
            rf.doc_name,
            rf.doc_cat,
            rf.doc_version,
            rf.publication_date,
            rf.doc_number,
            rf.doc_manager,
            rf.embedding_yn,
            rf.ref_heading_id,
            rf.ref_appendix_id,
            rf.heading_schema,
            rf.appendix_schema,
            rf.body_exit_criteria,
            rf.appendix_exit_criteria,
            rf.schema_note,
            rf.reg_dt,
            rf.mod_dt,
            (
                SELECT COUNT(*)
                FROM rag_vector rv
                WHERE rv.file_id = rf.file_id
            ) AS vector_count
        FROM rag_file rf
        WHERE rf.file_id = %s
        LIMIT 1
        """,
        [file_id],
    )
    if not row:
        return None
    return {
        "file_id": str(row.get("file_id") or "").strip(),
        "file_name": str(row.get("file_name") or "").strip(),
        "file_path": str(row.get("file_path") or "").strip() or None,
        "format_type": str(row.get("format_type") or "").strip(),
        "doc_name": str(row.get("doc_name") or "").strip(),
        "doc_cat": str(row.get("doc_cat") or "").strip(),
        "doc_version": float(row.get("doc_version") or 1.0),
        "publication_date": _iso(row.get("publication_date")),
        "doc_number": str(row.get("doc_number") or "").strip() or None,
        "doc_manager": str(row.get("doc_manager") or "").strip() or None,
        "embedding_yn": str(row.get("embedding_yn") or "").strip() or None,
        "ref_heading_id": str(row.get("ref_heading_id") or "").strip() or None,
        "ref_appendix_id": str(row.get("ref_appendix_id") or "").strip() or None,
        "heading_schema": row.get("heading_schema") or None,
        "appendix_schema": row.get("appendix_schema") or None,
        "body_exit_criteria": row.get("body_exit_criteria") or None,
        "appendix_exit_criteria": row.get("appendix_exit_criteria") or None,
        "schema_note": str(row.get("schema_note") or "").strip() or None,
        "vector_count": int(row.get("vector_count") or 0),
        "reg_dt": _iso(row.get("reg_dt")),
        "mod_dt": _iso(row.get("mod_dt")),
    }


def list_rag_vector_records(file_id: str, *, offset: int = 0, limit: int = 50) -> list[dict[str, Any]]:
    sql = """
        SELECT
            chunk_id,
            heading_path,
            chunk_loc,
            content,
            attributes
        FROM rag_vector
        WHERE file_id = %s
        ORDER BY chunk_id
        OFFSET %s
        LIMIT %s
    """
    rows = fetch_all(sql, [file_id, offset, limit]) or []
    items: list[dict[str, Any]] = []
    for row in rows:
        content_text = str(row.get("content") or "")
        newline_count = content_text.count("\n")
        attributes = dict(row.get("attributes") or {}) if isinstance(row.get("attributes"), dict) else {}
        attributes.pop("chunk_loc", None)
        attributes.pop("segment_count", None)
        items.append({
            "chunk_id": str(row.get("chunk_id") or "").strip(),
            "heading_path": str(row.get("heading_path") or "").strip() or None,
            "chunk_loc": _normalize_chunk_loc(row.get("chunk_loc")),
            "location": str(attributes.get("location") or "").strip() or None,
            "block_type": str(attributes.get("block_type") or "").strip() or None,
            "content": content_text,
            "content_preview": content_text[:500],
            "content_length": len(content_text),
            "newline_count": newline_count,
            "line_count": newline_count + 1 if content_text else 0,
            "source_order_start": attributes.get("source_order_start"),
            "source_order_end": attributes.get("source_order_end"),
            "metadata": attributes,
        })
    return items


def list_rag_vector_contents_for_file(file_id: str, *, limit: int = 200) -> list[dict[str, Any]]:
    rows = fetch_all(
        """
        SELECT
            chunk_id,
            heading_path,
            chunk_loc,
            content,
            attributes
        FROM rag_vector
        WHERE file_id = %s
        ORDER BY chunk_id
        LIMIT %s
        """,
        [file_id, limit],
    ) or []
    items: list[dict[str, Any]] = []
    for row in rows:
        attributes = dict(row.get("attributes") or {}) if isinstance(row.get("attributes"), dict) else {}
        items.append({
            "chunk_id": str(row.get("chunk_id") or "").strip(),
            "heading_path": str(row.get("heading_path") or "").strip() or None,
            "chunk_loc": _normalize_chunk_loc(row.get("chunk_loc")),
            "content": str(row.get("content") or "").strip(),
            "attributes": attributes,
        })
    return items


def file_exists(file_id: str) -> bool:
    return bool(fetch_one("SELECT file_id FROM rag_file WHERE file_id = %s LIMIT 1", [file_id]))


def upsert_rag_file(
    *,
    file_id: str,
    file_name: str,
    file_path: str | None,
    format_type: str,
    doc_name: str,
    doc_cat: str,
    doc_version: float,
    publication_date: Any,
    doc_number: str | None,
    doc_manager: str | None,
    embedding_yn: str | None,
    ref_heading_id: str | None,
    ref_appendix_id: str | None,
    body_exit_criteria: dict[str, Any] | None,
    appendix_exit_criteria: dict[str, Any] | None,
    heading_schema: dict[str, Any],
    appendix_schema: dict[str, Any] | None,
    schema_note: str | None,
    user_no: int,
    connection: Any,
) -> int:
    sql = """
        INSERT INTO rag_file (
            file_id, file_name, file_path, format_type, doc_name, doc_cat, doc_version,
            publication_date, doc_number, doc_manager, embedding_yn, ref_heading_id, ref_appendix_id, body_exit_criteria, appendix_exit_criteria, heading_schema, appendix_schema, schema_note,
            reg_dt, reg_no, mod_dt, mod_no
        ) VALUES (
            %s, %s, %s, %s, %s, %s, %s,
            %s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s::jsonb, %s::jsonb, %s,
            CURRENT_TIMESTAMP, %s, CURRENT_TIMESTAMP, %s
        )
        ON CONFLICT (file_id) DO UPDATE SET
            file_name = EXCLUDED.file_name,
            file_path = EXCLUDED.file_path,
            format_type = EXCLUDED.format_type,
            doc_name = EXCLUDED.doc_name,
            doc_cat = EXCLUDED.doc_cat,
            doc_version = EXCLUDED.doc_version,
            publication_date = EXCLUDED.publication_date,
            doc_number = EXCLUDED.doc_number,
            doc_manager = EXCLUDED.doc_manager,
            embedding_yn = EXCLUDED.embedding_yn,
            ref_heading_id = EXCLUDED.ref_heading_id,
            ref_appendix_id = EXCLUDED.ref_appendix_id,
            body_exit_criteria = EXCLUDED.body_exit_criteria,
            appendix_exit_criteria = EXCLUDED.appendix_exit_criteria,
            heading_schema = EXCLUDED.heading_schema,
            appendix_schema = EXCLUDED.appendix_schema,
            schema_note = EXCLUDED.schema_note,
            mod_dt = CURRENT_TIMESTAMP,
            mod_no = EXCLUDED.mod_no
    """
    return execute(
        sql,
        [
            file_id,
            file_name,
            file_path,
            format_type,
            doc_name,
            doc_cat,
            doc_version,
            publication_date,
            doc_number,
            doc_manager,
            embedding_yn,
            ref_heading_id,
            ref_appendix_id,
            json.dumps(body_exit_criteria, ensure_ascii=False) if body_exit_criteria is not None else None,
            json.dumps(appendix_exit_criteria, ensure_ascii=False) if appendix_exit_criteria is not None else None,
            json.dumps(heading_schema, ensure_ascii=False),
            json.dumps(appendix_schema, ensure_ascii=False) if appendix_schema is not None else None,
            schema_note,
            user_no,
            user_no,
        ],
        connection=connection,
        commit=False,
    )


def build_rag_vector_row(*, chunk: Any, embedding: list[float]) -> dict[str, Any]:
    attributes = dict(getattr(chunk, "metadata", {}) or {})
    for key in (
        "heading_path",
        "section",
        "chunk_loc",
        "segment_count",
        "_heading_nodes_runtime",
        "structural_group_key",
        "source_order_start",
        "source_order_end",
    ):
        attributes.pop(key, None)
    attributes.setdefault("location", getattr(chunk, "location", "paragraph"))
    attributes.setdefault("block_type", getattr(chunk, "block_type", "paragraph"))
    return {
        "file_id": getattr(chunk, "file_id"),
        "chunk_id": getattr(chunk, "chunk_id"),
        "heading_path": getattr(chunk, "heading_path", ""),
        "chunk_loc": _normalize_chunk_loc(getattr(chunk, "chunk_loc", "")) or "",
        "content": getattr(chunk, "content", ""),
        "embedding": embedding,
        "location": getattr(chunk, "location", "paragraph"),
        "block_type": getattr(chunk, "block_type", "paragraph"),
        "source_order_start": getattr(chunk, "source_order_start", 0),
        "source_order_end": getattr(chunk, "source_order_end", 0),
        "attributes": attributes,
    }


def delete_rag_vectors(*, file_id: str, connection: Any) -> int:
    return execute(
        "DELETE FROM rag_vector WHERE file_id = %s",
        [file_id],
        connection=connection,
        commit=False,
    )


def delete_rag_file(*, file_id: str, connection: Any) -> int:
    return execute(
        "DELETE FROM rag_file WHERE file_id = %s",
        [file_id],
        connection=connection,
        commit=False,
    )


def insert_rag_vectors(*, rows: list[dict[str, Any]], user_no: int, connection: Any) -> int:
    inserted = 0
    sql = """
        INSERT INTO rag_vector (
            file_id, chunk_id, heading_path, chunk_loc, content, embedding, attributes,
            reg_dt, reg_no, mod_dt, mod_no
        ) VALUES (
            %s, %s, %s, %s, %s, %s::vector, %s::jsonb,
            CURRENT_TIMESTAMP, %s, CURRENT_TIMESTAMP, %s
        )
    """
    for row in rows:
        inserted += execute(
            sql,
            [
                row.get("file_id"),
                row.get("chunk_id"),
                row.get("heading_path"),
                row.get("chunk_loc"),
                row.get("content"),
                _vector_literal(row.get("embedding") or []),
                json.dumps(row.get("attributes") or {}, ensure_ascii=False),
                user_no,
                user_no,
            ],
            connection=connection,
            commit=False,
        )
    return inserted


def update_rag_file_embedding_status(
    *,
    file_id: str,
    embedding_yn: str,
    user_no: int,
    connection: Any,
) -> int:
    return execute(
        """
        UPDATE rag_file
        SET embedding_yn = %s,
            mod_dt = CURRENT_TIMESTAMP,
            mod_no = %s
        WHERE file_id = %s
        """,
        [embedding_yn, user_no, file_id],
        connection=connection,
        commit=False,
    )


def update_rag_file_basic_info(
    *,
    file_id: str,
    doc_cat: str,
    doc_version: float,
    publication_date: Any,
    doc_number: str | None,
    doc_manager: str | None,
    user_no: int,
    connection: Any,
) -> int:
    return execute(
        """
        UPDATE rag_file
        SET doc_cat = %s,
            doc_version = %s,
            publication_date = %s,
            doc_number = %s,
            doc_manager = %s,
            mod_dt = CURRENT_TIMESTAMP,
            mod_no = %s
        WHERE file_id = %s
        """,
        [doc_cat, doc_version, publication_date, doc_number, doc_manager, user_no, file_id],
        connection=connection,
        commit=False,
    )
