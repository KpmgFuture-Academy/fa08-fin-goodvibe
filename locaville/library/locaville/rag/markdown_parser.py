from __future__ import annotations

from typing import Any

from .document_models import ParsedSegment
from .hwpx_parser import (
    _build_heading_path,
    _compile_heading_levels,
    _divider_heading_should_emit_content,
    _extract_markdown_heading,
    _format_chunk_loc,
    _heading_has_inline_payload,
    _match_heading_level,
    _merge_pending_heading_content,
    _normalize_text,
    _serialize_heading_nodes,
    _update_heading_stack,
)


def parse_markdown_document(
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
        text = content.decode("utf-8")
    except UnicodeDecodeError:
        text = content.decode("utf-8", errors="ignore")

    compiled_levels = _compile_heading_levels(heading_schema)
    heading_stack: list[dict[str, Any]] = []
    pending_heading_stack: list[dict[str, Any]] = []
    segments: list[ParsedSegment] = []
    source_order = 0

    for raw_line in text.splitlines():
        line = _normalize_text(raw_line)
        if not line:
            continue
        md_heading = _extract_markdown_heading(line)
        heading_depth: int | None = None
        heading_text = ""
        matched_level = None
        if md_heading:
            heading_depth, heading_text = md_heading
        else:
            matched_level = _match_heading_level(line, "paragraph", compiled_levels)
            if matched_level is not None:
                heading_depth = int(matched_level["depth"])
                heading_text = line

        if heading_depth is not None:
            matched_rule_type = str((matched_level or {}).get("rule_type") or "")
            heading_stack = _update_heading_stack(
                heading_stack,
                heading_depth,
                heading_text,
                rule_type=matched_rule_type,
            )
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
                        chunk_loc=_format_chunk_loc("line", str(source_order)),
                        section=filename,
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
                chunk_loc=_format_chunk_loc("line", str(source_order)),
                section=filename,
                sector="main",
                heading_nodes=_serialize_heading_nodes(heading_stack),
            )
        )
        pending_heading_stack = []
    return segments


class MarkdownDocumentParser:
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
        return parse_markdown_document(
            file_id=file_id,
            filename=filename,
            content=content,
            heading_schema=heading_schema,
            appendix_schema=appendix_schema,
            body_exit_criteria=body_exit_criteria,
            appendix_exit_criteria=appendix_exit_criteria,
        )


__all__ = [
    "MarkdownDocumentParser",
    "parse_markdown_document",
]
