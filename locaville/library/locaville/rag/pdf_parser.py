from __future__ import annotations

import io
import re
from typing import Any

from .document_models import ParsedSegment, RagEmbeddingParseError
from .hwpx_parser import (
    _build_heading_path,
    _compile_heading_levels,
    _divider_heading_should_emit_content,
    _format_chunk_loc,
    _heading_has_inline_payload,
    _match_heading_level,
    _merge_pending_heading_content,
    _normalize_text,
    _serialize_heading_nodes,
    _update_heading_stack,
)


def parse_pdf_document(
    *,
    file_id: str,
    filename: str,
    content: bytes,
    heading_schema: dict[str, Any],
    appendix_schema: dict[str, Any] | None = None,
    body_exit_criteria: dict[str, Any] | None = None,
    appendix_exit_criteria: dict[str, Any] | None = None,
) -> list[ParsedSegment]:
    del file_id, appendix_schema, body_exit_criteria, appendix_exit_criteria

    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise RagEmbeddingParseError("pypdf 모듈이 설치되지 않았습니다.") from exc

    try:
        reader = PdfReader(io.BytesIO(content))
    except Exception as exc:  # noqa: BLE001
        raise RagEmbeddingParseError(f"PDF 를 열 수 없습니다: {exc}") from exc

    compiled_levels = _compile_heading_levels(heading_schema)
    heading_stack: list[dict[str, Any]] = []
    pending_heading_stack: list[dict[str, Any]] = []
    segments: list[ParsedSegment] = []
    source_order = 0

    for page_index, page in enumerate(reader.pages, start=1):
        try:
            raw_text = page.extract_text() or ""
        except Exception:
            continue
        for para in re.split(r"\n{2,}", raw_text):
            line = _normalize_text(para)
            if not line:
                continue
            matched_level = _match_heading_level(line, "paragraph", compiled_levels)
            heading_depth = int(matched_level["depth"]) if matched_level is not None else None
            if heading_depth is not None:
                matched_rule_type = str((matched_level or {}).get("rule_type") or "")
                heading_stack = _update_heading_stack(heading_stack, heading_depth, line, rule_type=matched_rule_type)
                pending_heading_stack = [dict(item) for item in heading_stack]
                if _heading_has_inline_payload(line) or _divider_heading_should_emit_content(line, matched_rule_type):
                    source_order += 1
                    heading_path = _build_heading_path(heading_stack)
                    segments.append(
                        ParsedSegment(
                            source_order=source_order,
                            location="paragraph",
                            heading_depth=heading_stack[-1]["depth"] if heading_stack else None,
                            heading_text=heading_stack[-1]["text"] if heading_stack else "",
                            heading_path=heading_path,
                            content=_merge_pending_heading_content(line, []),
                            block_type="heading-inline",
                            chunk_loc=_format_chunk_loc("page", str(page_index), "para", str(source_order)),
                            section=f"page_{page_index}",
                            sector="main",
                            heading_nodes=_serialize_heading_nodes(heading_stack),
                        )
                    )
                    pending_heading_stack = []
                continue
            source_order += 1
            heading_path = _build_heading_path(heading_stack)
            segments.append(
                ParsedSegment(
                    source_order=source_order,
                    location="paragraph",
                    heading_depth=heading_stack[-1]["depth"] if heading_stack else None,
                    heading_text=heading_stack[-1]["text"] if heading_stack else "",
                    heading_path=heading_path,
                    content=_merge_pending_heading_content(line, pending_heading_stack),
                    block_type="paragraph",
                    chunk_loc=_format_chunk_loc("page", str(page_index), "para", str(source_order)),
                    section=f"page_{page_index}",
                    sector="main",
                    heading_nodes=_serialize_heading_nodes(heading_stack),
                )
            )
            pending_heading_stack = []
    return segments


class PdfDocumentParser:
    def parse_document(
        self,
        *,
        file_id: str,
        filename: str,
        content: bytes,
        heading_schema: dict[str, Any],
        appendix_schema: dict[str, Any] | None = None,
        body_exit_criteria: dict[str, Any] | None = None,
        appendix_exit_criteria: dict[str, Any] | None = None,
    ) -> list[ParsedSegment]:
        return parse_pdf_document(
            file_id=file_id,
            filename=filename,
            content=content,
            heading_schema=heading_schema,
            appendix_schema=appendix_schema,
            body_exit_criteria=body_exit_criteria,
            appendix_exit_criteria=appendix_exit_criteria,
        )


__all__ = [
    "PdfDocumentParser",
    "parse_pdf_document",
]
