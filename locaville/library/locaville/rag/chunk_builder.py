from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

from .document_models import HeadingNode, ParsedSegment


MIN_CHUNK_CHARS = 350
TARGET_CHUNK_CHARS = 750


@dataclass
class RagChunk:
    """임베딩 직전 vector row 의 원본 chunk 표현."""

    chunk_id: str
    file_id: str
    heading_path: str
    chunk_loc: str
    content: str
    source_order_start: int
    source_order_end: int
    block_type: str = "paragraph"
    location: str = "paragraph"
    metadata: dict[str, object] = field(default_factory=dict)


def _chunk_weight(segment: ParsedSegment) -> int:
    return len(segment.content) + max(20, len(segment.heading_path))


def _normalize_content(text: str) -> str:
    return " ".join((text or "").split()).strip()


def _is_separator_only(text: str) -> bool:
    normalized = _normalize_content(text)
    if not normalized:
        return True
    return bool(re.fullmatch(r"[-=_.~·•ㆍ―─━]{5,}", normalized))


def _is_short_trailer(text: str) -> bool:
    normalized = _normalize_content(text)
    if not normalized:
        return False
    if re.fullmatch(r"\d{4}년\s+\d{1,2}월\s+\d{1,2}일", normalized):
        return True
    if len(normalized) <= 12 and re.fullmatch(r"[가-힣A-Za-z0-9\s]+", normalized):
        return True
    return False


def _is_short_chunk_text(text: str, max_len: int = 180) -> bool:
    normalized = _normalize_content(text)
    return bool(normalized) and len(normalized) <= max_len


def _title_heading_path(nodes: list[HeadingNode]) -> str:
    return " > ".join(node.text for node in nodes if node.kind == "title" and node.text.strip())


def _normalize_heading_path_part(text: str) -> str:
    return _normalize_content(text)


def _combine_heading_paths(title_path: str, structural_path: str) -> str:
    title_parts = [part.strip() for part in title_path.split(" > ") if part.strip()]
    structural_parts = [part.strip() for part in structural_path.split(" > ") if part.strip()]
    if not title_parts:
        return " > ".join(structural_parts)
    if not structural_parts:
        return " > ".join(title_parts)

    normalized_structural = [_normalize_heading_path_part(part) for part in structural_parts]
    overlap_len = 0
    for idx, title_part in enumerate(title_parts):
        remaining_title = title_parts[idx:]
        normalized_remaining = [_normalize_heading_path_part(part) for part in remaining_title]
        if len(normalized_remaining) > len(normalized_structural):
            continue
        if normalized_remaining == normalized_structural[-len(normalized_remaining):]:
            overlap_len = len(normalized_remaining)
            title_parts = title_parts[:idx]
            break

    combined_parts = [*title_parts, *structural_parts]
    deduped_parts: list[str] = []
    for part in combined_parts:
        normalized = _normalize_heading_path_part(part)
        if deduped_parts and _normalize_heading_path_part(deduped_parts[-1]) == normalized:
            continue
        deduped_parts.append(part)
    return " > ".join(deduped_parts)


def _structural_nodes(nodes: list[HeadingNode]) -> list[HeadingNode]:
    return [node for node in nodes if node.kind != "title" and node.text.strip()]


def _is_sentence_style_structural_node(node: HeadingNode) -> bool:
    if node.rule_type != "symbol":
        return False
    notation = _normalize_content(node.notation or "")
    text = _normalize_content(node.text or "")
    return bool(notation and text and notation != text)


def _structural_group_key(nodes: list[HeadingNode]) -> str:
    parts: list[str] = []
    for node in _structural_nodes(nodes):
        parts.append(f"{node.depth}:{node.rule_type}:{node.notation}:{node.text}")
    return " > ".join(parts)


def _primary_structural_group_key(nodes: list[HeadingNode]) -> str:
    for node in _structural_nodes(nodes):
        return f"{node.depth}:{node.rule_type}:{node.notation}:{node.text}"
    return ""


def _max_heading_depth(nodes: list[HeadingNode]) -> int:
    depths = [int(node.depth or 0) for node in nodes if isinstance(node, HeadingNode)]
    return max(depths, default=0)


def _title_nodes(nodes: list[HeadingNode]) -> list[HeadingNode]:
    return [node for node in nodes if isinstance(node, HeadingNode) and node.kind == "title" and node.text.strip()]


def _title_prefix_key(nodes: list[HeadingNode], max_depth: int | None = None) -> str:
    parts: list[str] = []
    for node in _title_nodes(nodes):
        depth = int(node.depth or 0)
        if max_depth is not None and depth > max_depth:
            continue
        parts.append(f"{depth}:{node.text.strip()}")
    return " > ".join(parts)


def _same_title_prefix(left_nodes: list[HeadingNode], right_nodes: list[HeadingNode], max_depth: int | None = None) -> bool:
    left_key = _title_prefix_key(left_nodes, max_depth=max_depth)
    right_key = _title_prefix_key(right_nodes, max_depth=max_depth)
    return bool(left_key and right_key and left_key == right_key)


def _top_title_key(nodes: list[HeadingNode]) -> str:
    for node in _title_nodes(nodes):
        return f"{int(node.depth or 0)}:{node.text.strip()}"
    return ""


def _block_family(block_type: str) -> str:
    normalized = (block_type or "").strip()
    if normalized in {"paragraph", "heading-inline"}:
        return "text"
    if normalized in {"table", "table-row", "table-single-row"}:
        return "table"
    return normalized or "paragraph"


def _main_depth2_group_key(nodes: list[HeadingNode]) -> str:
    parts: list[str] = []
    for node in nodes:
        if not isinstance(node, HeadingNode):
            continue
        depth = int(node.depth or 0)
        text = (node.text or "").strip()
        if depth <= 2 and text:
            parts.append(f"{depth}:{node.kind}:{text}")
    return " > ".join(parts)


def _main_depth3_group_key(nodes: list[HeadingNode]) -> str:
    parts: list[str] = []
    for node in nodes:
        if not isinstance(node, HeadingNode):
            continue
        depth = int(node.depth or 0)
        text = (node.text or "").strip()
        if depth <= 3 and text:
            parts.append(f"{depth}:{node.kind}:{text}")
    return " > ".join(parts)


def _appendix_depth1_group_key(nodes: list[HeadingNode]) -> str:
    parts: list[str] = []
    for node in nodes:
        if not isinstance(node, HeadingNode):
            continue
        depth = int(node.depth or 0)
        text = (node.text or "").strip()
        if depth <= 1 and text:
            parts.append(f"{depth}:{node.kind}:{text}")
    return " > ".join(parts)


def _appendix_depth2_group_key(nodes: list[HeadingNode]) -> str:
    parts: list[str] = []
    for node in nodes:
        if not isinstance(node, HeadingNode):
            continue
        depth = int(node.depth or 0)
        text = (node.text or "").strip()
        if depth <= 2 and text:
            parts.append(f"{depth}:{node.kind}:{text}")
    return " > ".join(parts)


def _heading_node_signature(node: HeadingNode) -> tuple[int, str, str, str, str]:
    return (
        int(node.depth or 0),
        str(node.kind or ""),
        str(node.rule_type or ""),
        str(node.notation or ""),
        str(node.text or ""),
    )


def _common_heading_nodes(segments: list[ParsedSegment]) -> list[HeadingNode]:
    if not segments:
        return []

    first_nodes = [node for node in segments[0].heading_nodes if isinstance(node, HeadingNode)]
    common: list[HeadingNode] = []

    for idx, first_node in enumerate(first_nodes):
        signature = _heading_node_signature(first_node)
        if any(
            len(segment.heading_nodes) <= idx
            or not isinstance(segment.heading_nodes[idx], HeadingNode)
            or _heading_node_signature(segment.heading_nodes[idx]) != signature
            for segment in segments[1:]
        ):
            break
        common.append(first_node)
    return common


def _should_merge_main_deep_segments(current_segments: list[ParsedSegment], segment: ParsedSegment) -> bool:
    if not current_segments:
        return False

    current = current_segments[0]
    current_sector = str(getattr(current, "sector", "") or (current.metadata or {}).get("sector") or "main").strip() or "main"
    next_sector = str(getattr(segment, "sector", "") or (segment.metadata or {}).get("sector") or "main").strip() or "main"
    if current_sector != "main" or next_sector != "main":
        return False

    current_depth = _max_heading_depth(current.heading_nodes)
    next_depth = _max_heading_depth(segment.heading_nodes)
    if current_depth < 3 or next_depth < 3:
        return False

    current_group = _main_depth2_group_key(current.heading_nodes)
    next_group = _main_depth2_group_key(segment.heading_nodes)
    if not current_group or current_group != next_group:
        return False

    current_depth3_group = _main_depth3_group_key(current.heading_nodes)
    next_depth3_group = _main_depth3_group_key(segment.heading_nodes)
    if not current_depth3_group or current_depth3_group != next_depth3_group:
        return False

    return True


def _same_main_depth3_subtree(current_segments: list[ParsedSegment], segment: ParsedSegment) -> bool:
    if not current_segments:
        return False
    current = current_segments[0]
    current_sector = str(getattr(current, "sector", "") or (current.metadata or {}).get("sector") or "main").strip() or "main"
    next_sector = str(getattr(segment, "sector", "") or (segment.metadata or {}).get("sector") or "main").strip() or "main"
    if current_sector != "main" or next_sector != "main":
        return False
    current_group = _main_depth3_group_key(current.heading_nodes)
    next_group = _main_depth3_group_key(segment.heading_nodes)
    return bool(current_group and current_group == next_group)


def _should_merge_appendix_segments(current_segments: list[ParsedSegment], segment: ParsedSegment) -> bool:
    if not current_segments:
        return False

    current = current_segments[0]
    current_sector = str(getattr(current, "sector", "") or (current.metadata or {}).get("sector") or "main").strip() or "main"
    next_sector = str(getattr(segment, "sector", "") or (segment.metadata or {}).get("sector") or "main").strip() or "main"
    if current_sector != "appendix" or next_sector != "appendix":
        return False

    current_depth = _max_heading_depth(current.heading_nodes)
    next_depth = _max_heading_depth(segment.heading_nodes)
    if current_depth < 2 or next_depth < 2:
        return False

    current_group = _appendix_depth1_group_key(current.heading_nodes)
    next_group = _appendix_depth1_group_key(segment.heading_nodes)
    if not current_group or current_group != next_group:
        return False

    return True


def _same_appendix_depth2_subtree(current_segments: list[ParsedSegment], segment: ParsedSegment) -> bool:
    if not current_segments:
        return False
    current = current_segments[0]
    current_sector = str(getattr(current, "sector", "") or (current.metadata or {}).get("sector") or "main").strip() or "main"
    next_sector = str(getattr(segment, "sector", "") or (segment.metadata or {}).get("sector") or "main").strip() or "main"
    if current_sector != "appendix" or next_sector != "appendix":
        return False
    current_group = _appendix_depth2_group_key(current.heading_nodes)
    next_group = _appendix_depth2_group_key(segment.heading_nodes)
    return bool(current_group and current_group == next_group)


def _render_structural_path(
    nodes: list[HeadingNode],
    *,
    sentence_mode: str = "full",
    content: str = "",
) -> str:
    structural_nodes = _structural_nodes(nodes)
    normalized_content = _normalize_content(content)
    rendered: list[str] = []
    for idx, node in enumerate(structural_nodes):
        is_last = idx == len(structural_nodes) - 1
        if _is_sentence_style_structural_node(node):
            node_text = _normalize_content(node.text or "")
            if node_text and node_text in normalized_content:
                rendered.append(node.notation or node.text)
                continue
        if idx == 0 and _is_sentence_style_structural_node(node):
            if sentence_mode == "omit":
                continue
            if sentence_mode == "symbol":
                rendered.append(node.notation or node.text)
                continue
        if node.rule_type == "symbol":
            rendered.append(node.text if is_last else (node.notation or node.text))
            continue
        rendered.append(node.text)
    return " > ".join(part for part in rendered if part.strip())


def _render_title_lines(nodes: list[HeadingNode]) -> list[str]:
    return [node.text for node in nodes if node.kind == "title" and node.text.strip()]


def _prepend_unique_lines(prefix_lines: list[str], body: str) -> str:
    body_lines = [line.strip() for line in (body or "").splitlines() if line.strip()]
    normalized_body = [_normalize_content(line) for line in body_lines]

    deduped_prefix: list[str] = []
    for line in prefix_lines:
        normalized = _normalize_content(line)
        if not normalized:
            continue
        if normalized_body and (
            normalized == normalized_body[0]
            or normalized.startswith(normalized_body[0])
            or normalized_body[0].startswith(normalized)
        ):
            continue
        deduped_prefix.append(line.strip())

    merged = [line for line in deduped_prefix if line]
    merged.extend(body_lines)
    return "\n".join(merged).strip()


def _strip_table_overlap_from_paragraph(content: str, header_row: list[str]) -> str:
    text = (content or "").strip()
    headers = [_normalize_content(item) for item in header_row if _normalize_content(item)]
    if not text or not headers:
        return text
    header_pattern = r"\s*".join(re.escape(item) for item in headers)
    match = re.search(header_pattern, text)
    if not match:
        return text
    trimmed = text[:match.start()].rstrip()
    return trimmed or text


def _strip_table_row_overlap(content: str, row_chunk_content: str) -> str:
    text = (content or "").strip()
    first_line = next((line.strip() for line in (row_chunk_content or "").splitlines() if line.strip()), "")
    if not text or not first_line:
        return text
    if ":" in first_line:
        first_line = first_line.split(":", 1)[1].strip()
    if not first_line:
        return text
    match = re.search(re.escape(first_line), text)
    if not match:
        return text
    trimmed = text[:match.start()].rstrip()
    return trimmed or text


def _strip_at_first_table_signal(content: str, header_row: list[str], row_chunk_content: str) -> str:
    text = (content or "").strip()
    if not text:
        return text

    body_start = text.find("\n")
    if body_start < 0:
        return text
    head = text[:body_start].rstrip()
    tail = text[body_start + 1 :].lstrip()
    if not tail:
        return text

    candidates: list[str] = []
    for item in header_row:
        normalized = _normalize_content(str(item))
        if normalized:
            candidates.append(normalized)

    for line in (row_chunk_content or "").splitlines():
        cleaned = line.strip()
        if not cleaned:
            continue
        if ":" in cleaned:
            cleaned = cleaned.split(":", 1)[1].strip()
        cleaned = _normalize_content(cleaned)
        if cleaned:
            candidates.append(cleaned)
            break

    best_index: int | None = None
    for candidate in candidates:
        match = re.search(re.escape(candidate), tail)
        if not match:
            continue
        if best_index is None or match.start() < best_index:
            best_index = match.start()

    if best_index is None:
        return text
    trimmed_tail = tail[:best_index].rstrip()
    trimmed = "\n".join(part for part in [head, trimmed_tail] if part).strip()
    return trimmed or text


def _incremental_title_lines(nodes: list[HeadingNode], last_seen_by_depth: dict[int, str]) -> list[str]:
    incremental: list[str] = []
    for node in nodes:
        if node.kind != "title" or not node.text.strip():
            continue
        previous = last_seen_by_depth.get(node.depth, "")
        if previous != node.text:
            incremental.append(node.text)
    return incremental


def _update_seen_title_lines(nodes: list[HeadingNode], last_seen_by_depth: dict[int, str]) -> None:
    title_depths = [node.depth for node in nodes if node.kind == "title" and node.text.strip()]
    if not title_depths:
        return
    max_depth = max(title_depths)
    for depth in list(last_seen_by_depth.keys()):
        if depth > max_depth:
            del last_seen_by_depth[depth]
    for node in nodes:
        if node.kind != "title" or not node.text.strip():
            continue
        last_seen_by_depth[node.depth] = node.text


def _is_cover_standalone_segment(segment: ParsedSegment) -> bool:
    text = (segment.content or "").strip()
    if not text:
        return False
    if segment.block_type in {"table", "table-row"}:
        return True
    if segment.block_type == "heading-inline":
        return segment.source_order <= 3
    # 아직 실제 heading_path 가 열리지 않은 표지 영역의 앞부분 짧은 문단만 독립 유지.
    # 날짜/기관명까지 전부 분리되지 않도록 문서 초반 몇 줄로 한정한다.
    if not (segment.heading_path or "").strip():
        return segment.source_order <= 3 and len(text) <= 140
    return False


def _representative_block_type(segments: list[ParsedSegment]) -> str:
    block_types = [segment.block_type for segment in segments if (segment.block_type or "").strip()]
    if not block_types:
        return "paragraph"
    if any(block_type == "table-row" for block_type in block_types):
        return "table-row"
    if any(block_type == "table" for block_type in block_types):
        return "table"
    if any(block_type == "paragraph" for block_type in block_types):
        return "paragraph"
    return block_types[0]


def _representative_location(segments: list[ParsedSegment]) -> str:
    locations = [segment.location for segment in segments if (segment.location or "").strip()]
    if not locations:
        return "paragraph"
    if any(location == "paragraph" for location in locations):
        return "paragraph"
    return locations[0]


def _merge_segment_metadata(segments: list[ParsedSegment]) -> dict[str, object]:
    merged: dict[str, object] = {}
    for segment in segments:
        for key, value in (segment.metadata or {}).items():
            if value is None or value == "":
                continue
            if key not in merged:
                merged[key] = value
                continue
            if merged[key] == value:
                continue
            if isinstance(merged[key], list) and isinstance(value, list):
                existing = [item for item in merged[key] if item is not None]
                for item in value:
                    if item not in existing:
                        existing.append(item)
                merged[key] = existing
    return merged


def _same_table_segment_cluster(left: ParsedSegment, right: ParsedSegment) -> bool:
    if (left.block_type or "").strip() != "table-row" or (right.block_type or "").strip() != "table-row":
        return False
    if (left.heading_path or "").strip() != (right.heading_path or "").strip():
        return False
    if (left.section or "").strip() != (right.section or "").strip():
        return False
    left_header = (left.metadata or {}).get("header_row")
    right_header = (right.metadata or {}).get("header_row")
    return isinstance(left_header, list) and isinstance(right_header, list) and left_header == right_header


def _is_hard_chunk_boundary(current_segments: list[ParsedSegment], segment: ParsedSegment) -> bool:
    if not current_segments:
        return False

    current = current_segments[0]
    current_sector = str(getattr(current, "sector", "") or (current.metadata or {}).get("sector") or "main").strip() or "main"
    next_sector = str(getattr(segment, "sector", "") or (segment.metadata or {}).get("sector") or "main").strip() or "main"
    if current_sector != next_sector:
        return True

    if _is_cover_standalone_segment(current) or _is_cover_standalone_segment(segment):
        return True

    current_family = _block_family(current.block_type)
    next_family = _block_family(segment.block_type)
    if current_family != next_family:
        return True

    current_top_title = _top_title_key(current.heading_nodes)
    next_top_title = _top_title_key(segment.heading_nodes)
    if current_top_title and next_top_title and current_top_title != next_top_title:
        return True

    if current_family == "table" and current.block_type == "table-row" and segment.block_type == "table-row":
        return not _same_table_segment_cluster(current_segments[-1], segment)

    return False


def _merge_score(current_segments: list[ParsedSegment], segment: ParsedSegment) -> int:
    if not current_segments:
        return 0

    current = current_segments[0]
    current_last = current_segments[-1]
    current_heading = (current.heading_path or "").strip()
    next_heading = (segment.heading_path or "").strip()
    current_primary_structural = _primary_structural_group_key(current.heading_nodes)
    next_primary_structural = _primary_structural_group_key(segment.heading_nodes)
    current_structural = _structural_group_key(current.heading_nodes)
    next_structural = _structural_group_key(segment.heading_nodes)
    current_family = _block_family(current.block_type)
    next_family = _block_family(segment.block_type)

    score = 0

    if current_family == next_family:
        score += 1
    if current_heading and next_heading and current_heading == next_heading:
        score += 3
    if current_primary_structural and current_primary_structural == next_primary_structural:
        score += 4
    if current_structural and current_structural == next_structural:
        score += 2
    if _same_title_prefix(current.heading_nodes, segment.heading_nodes, max_depth=1):
        score += 3
    if _same_title_prefix(current.heading_nodes, segment.heading_nodes, max_depth=2):
        score += 2

    current_depth = _max_heading_depth(current.heading_nodes)
    next_depth = _max_heading_depth(segment.heading_nodes)
    if current_depth and next_depth and abs(current_depth - next_depth) <= 1:
        score += 1

    if current_family == "table" and next_family == "table":
        if _same_table_segment_cluster(current_last, segment):
            score += 5
        else:
            score -= 4

    if current_heading and next_heading and current_heading != next_heading:
        score -= 2
    if current_primary_structural and next_primary_structural and current_primary_structural != next_primary_structural:
        score -= 1

    return score


def _same_table_cluster(left: RagChunk, right: RagChunk) -> bool:
    if left.block_type != "table-row" or right.block_type != "table-row":
        return False
    if left.heading_path != right.heading_path:
        return False
    if str(left.metadata.get("section") or "") != str(right.metadata.get("section") or ""):
        return False
    left_header = left.metadata.get("header_row")
    right_header = right.metadata.get("header_row")
    return isinstance(left_header, list) and isinstance(right_header, list) and left_header == right_header


def _propagate_table_captions(chunks: list[RagChunk]) -> None:
    active_caption = ""
    active_position = ""
    active_anchor: RagChunk | None = None

    for chunk in chunks:
        if chunk.block_type != "table-row":
            active_caption = ""
            active_position = ""
            active_anchor = None
            continue

        table_caption = str(chunk.metadata.get("table_caption") or "").strip()
        if table_caption:
            active_caption = table_caption
            active_position = str(chunk.metadata.get("table_caption_position") or "").strip()
            active_anchor = chunk
            continue

        if active_anchor is None or not active_caption:
            continue
        if not _same_table_cluster(active_anchor, chunk):
            active_caption = ""
            active_position = ""
            active_anchor = None
            continue

        chunk.metadata["table_caption"] = active_caption
        if active_position:
            chunk.metadata["table_caption_position"] = active_position


def _merge_table_row_chunks(chunks: list[RagChunk], *, file_id: str, max_chars: int) -> list[RagChunk]:
    if not chunks:
        return []

    merged: list[RagChunk] = []
    current: RagChunk | None = None
    row_separator = "\n---\n"

    def flush_current() -> None:
        nonlocal current
        if current is not None:
            merged.append(current)
            current = None

    for chunk in chunks:
        if current is None:
            current = chunk
            continue

        same_cluster = _same_table_cluster(current, chunk)
        combined_len = len((current.content or "").strip()) + len(row_separator) + len((chunk.content or "").strip())
        if same_cluster and combined_len <= max_chars:
            current.content = row_separator.join(part for part in [current.content.strip(), chunk.content.strip()] if part).strip()
            current.chunk_loc = (
                f"{current.chunk_loc}~{chunk.chunk_loc}"
                if current.chunk_loc != chunk.chunk_loc
                else current.chunk_loc
            )
            current.source_order_end = chunk.source_order_end
            current.metadata["segment_count"] = int(current.metadata.get("segment_count") or 1) + int(chunk.metadata.get("segment_count") or 1)
            current.metadata["source_order_end"] = chunk.source_order_end
            current.metadata["chunk_loc"] = current.chunk_loc
            continue

        flush_current()
        current = chunk

    flush_current()

    for idx, chunk in enumerate(merged, start=1):
        chunk.chunk_id = f"{file_id}-{idx:04d}"
    return merged


def _split_long_text_with_overlap(text: str, *, max_chars: int, overlap_chars: int = 40) -> list[str]:
    normalized = (text or "").strip()
    if not normalized:
        return []
    if len(normalized) <= max_chars:
        return [normalized]

    sentence_parts = [
        part.strip()
        for part in re.split(r"(?<=[.!?。])\s+|(?<=다\.)\s+|(?<=요\.)\s+", normalized)
        if part.strip()
    ]
    if len(sentence_parts) <= 1:
        sentence_parts = [part.strip() for part in re.split(r"(?<=[,;:])\s+|\s+", normalized) if part.strip()]
    if len(sentence_parts) <= 1:
        windows: list[str] = []
        start = 0
        step = max(1, max_chars - overlap_chars)
        while start < len(normalized):
            end = min(len(normalized), start + max_chars)
            windows.append(normalized[start:end].strip())
            if end >= len(normalized):
                break
            start += step
        return [window for window in windows if window]

    chunks: list[str] = []
    current = ""
    for part in sentence_parts:
        candidate = f"{current} {part}".strip() if current else part
        if current and len(candidate) > max_chars:
            chunks.append(current)
            overlap = current[-overlap_chars:].strip() if overlap_chars > 0 else ""
            current = f"{overlap} {part}".strip() if overlap else part
            continue
        current = candidate
    if current:
        chunks.append(current)
    return [chunk for chunk in chunks if chunk]


def _split_oversized_table_row_chunk(chunk: RagChunk, *, max_chars: int) -> list[RagChunk]:
    content = (chunk.content or "").strip()
    if chunk.block_type != "table-row" or len(content) <= max_chars:
        return [chunk]

    lines = [line.strip() for line in content.splitlines() if line.strip()]
    if not lines:
        return [chunk]

    parts: list[str] = []
    current_lines: list[str] = []
    current_len = 0

    def flush_lines() -> None:
        nonlocal current_lines, current_len
        if current_lines:
            parts.append("\n".join(current_lines).strip())
            current_lines = []
            current_len = 0

    for line in lines:
        if len(line) > max_chars:
            flush_lines()
            parts.extend(_split_long_text_with_overlap(line, max_chars=max_chars))
            continue

        projected = current_len + (1 if current_lines else 0) + len(line)
        if current_lines and projected > max_chars:
            flush_lines()
        current_lines.append(line)
        current_len = len("\n".join(current_lines))

    flush_lines()

    if len(parts) <= 1:
        return [chunk]

    split_chunks: list[RagChunk] = []
    for idx, part in enumerate(parts, start=1):
        next_chunk = RagChunk(
            chunk_id=chunk.chunk_id,
            file_id=chunk.file_id,
            heading_path=chunk.heading_path,
            chunk_loc=f"{chunk.chunk_loc}:part{idx}",
            content=part,
            source_order_start=chunk.source_order_start,
            source_order_end=chunk.source_order_end,
            block_type=chunk.block_type,
            location=chunk.location,
            metadata={**chunk.metadata, "chunk_part": idx, "chunk_part_count": len(parts)},
        )
        split_chunks.append(next_chunk)
    return split_chunks


def _split_oversized_table_row_chunks(chunks: list[RagChunk], *, file_id: str, max_chars: int) -> list[RagChunk]:
    if not chunks:
        return []

    split_chunks: list[RagChunk] = []
    for chunk in chunks:
        split_chunks.extend(_split_oversized_table_row_chunk(chunk, max_chars=max_chars))

    for idx, chunk in enumerate(split_chunks, start=1):
        chunk.chunk_id = f"{file_id}-{idx:04d}"
    return split_chunks


def _split_oversized_text_chunk(chunk: RagChunk, *, max_chars: int) -> list[RagChunk]:
    content = (chunk.content or "").strip()
    if chunk.block_type not in {"paragraph", "heading-inline"} or len(content) <= max_chars:
        return [chunk]

    parts = _split_long_text_with_overlap(content, max_chars=max_chars)
    if len(parts) <= 1:
        return [chunk]

    split_chunks: list[RagChunk] = []
    for idx, part in enumerate(parts, start=1):
        next_chunk = RagChunk(
            chunk_id=chunk.chunk_id,
            file_id=chunk.file_id,
            heading_path=chunk.heading_path,
            chunk_loc=f"{chunk.chunk_loc}:part{idx}",
            content=part,
            source_order_start=chunk.source_order_start,
            source_order_end=chunk.source_order_end,
            block_type=chunk.block_type,
            location=chunk.location,
            metadata={**chunk.metadata, "chunk_part": idx, "chunk_part_count": len(parts)},
        )
        split_chunks.append(next_chunk)
    return split_chunks


def _split_oversized_text_chunks(chunks: list[RagChunk], *, file_id: str, max_chars: int) -> list[RagChunk]:
    if not chunks:
        return []

    split_chunks: list[RagChunk] = []
    for chunk in chunks:
        split_chunks.extend(_split_oversized_text_chunk(chunk, max_chars=max_chars))

    for idx, chunk in enumerate(split_chunks, start=1):
        chunk.chunk_id = f"{file_id}-{idx:04d}"
    return split_chunks


def build_chunks(
    *,
    file_id: str,
    file_name: str,
    segments: list[ParsedSegment],
    max_chars: int = 1000,
) -> list[RagChunk]:
    chunks: list[RagChunk] = []
    current_segments: list[ParsedSegment] = []
    current_weight = 0

    def flush() -> None:
        nonlocal current_segments, current_weight
        if not current_segments:
            return
        chunk_index = len(chunks) + 1
        first = current_segments[0]
        last = current_segments[-1]
        heading_nodes = _common_heading_nodes(current_segments) or list(first.heading_nodes)
        content = "\n".join(segment.content for segment in current_segments if segment.content.strip()).strip()
        if not content:
            current_segments = []
            current_weight = 0
            return
        heading_path = (
            heading_nodes[-1].text
            if heading_nodes
            else (first.heading_path or first.heading_text or Path(file_name).stem)
        )
        chunk_loc = f"{first.chunk_loc}~{last.chunk_loc}" if first.chunk_loc != last.chunk_loc else first.chunk_loc
        merged_segment_metadata = _merge_segment_metadata(current_segments)
        first_sector = str(getattr(first, "sector", "") or merged_segment_metadata.get("sector") or "main")
        chunks.append(
            RagChunk(
                chunk_id=f"{file_id}-{chunk_index:04d}",
                file_id=file_id,
                heading_path=heading_path,
                chunk_loc=chunk_loc,
                content=content,
                source_order_start=first.source_order,
                source_order_end=last.source_order,
                block_type=_representative_block_type(current_segments),
                location=_representative_location(current_segments),
                metadata={
                    **merged_segment_metadata,
                    "section": first.section,
                    "sector": first_sector,
                    "segment_count": len(current_segments),
                    "source_order_start": first.source_order,
                    "source_order_end": last.source_order,
                    "heading_path": heading_path,
                    "locations": sorted({segment.location for segment in current_segments}),
                    "block_types": sorted({segment.block_type for segment in current_segments}),
                    "_heading_nodes_runtime": list(heading_nodes),
                    "title_heading_path": _title_heading_path(heading_nodes),
                    "structural_group_key": _structural_group_key(heading_nodes),
                    "_primary_structural_key_runtime": _primary_structural_group_key(heading_nodes),
                },
            )
        )
        current_segments = []
        current_weight = 0

    for segment in segments:
        if not segment.content.strip():
            continue
        if _is_separator_only(segment.content):
            continue
        segment_weight = _chunk_weight(segment)
        current_heading = current_segments[0].heading_path if current_segments else ""
        current_structural = _structural_group_key(current_segments[0].heading_nodes) if current_segments else ""
        current_primary_structural = _primary_structural_group_key(current_segments[0].heading_nodes) if current_segments else ""
        current_sector = str(getattr(current_segments[0], "sector", "") or (current_segments[0].metadata or {}).get("sector") or "main") if current_segments else ""
        next_sector = str(getattr(segment, "sector", "") or (segment.metadata or {}).get("sector") or "main")
        heading_changed = bool(current_segments and segment.heading_path != current_heading)
        structural_changed = bool(
            current_segments
            and _primary_structural_group_key(segment.heading_nodes) != current_primary_structural
        )
        projected_weight = current_weight + segment_weight
        merge_short_same_heading = bool(
            current_segments
            and segment.heading_path == current_heading
            and next_sector == current_sector
            and _primary_structural_group_key(segment.heading_nodes) == current_primary_structural
            and current_segments[0].block_type in {"paragraph", "heading-inline"}
            and segment.block_type in {"paragraph", "heading-inline"}
            and _is_short_chunk_text(current_segments[-1].content)
            and _is_short_chunk_text(segment.content)
        )
        should_attach_to_previous = bool(
            current_segments
            and segment.block_type == "paragraph"
            and current_segments[0].block_type == "paragraph"
            and segment.heading_path == current_heading
            and next_sector == current_sector
            and _primary_structural_group_key(segment.heading_nodes) == current_primary_structural
            and _is_short_trailer(segment.content)
        )
        cover_boundary = bool(
            current_segments
            and (_is_cover_standalone_segment(current_segments[0]) or _is_cover_standalone_segment(segment))
        )
        hard_boundary = _is_hard_chunk_boundary(current_segments, segment)
        merge_score = _merge_score(current_segments, segment) if current_segments else 0
        rescue_merge = bool(
            current_segments
            and not hard_boundary
            and current_weight < MIN_CHUNK_CHARS
            and projected_weight <= max_chars
            and merge_score >= 3
        )
        target_merge = bool(
            current_segments
            and not hard_boundary
            and projected_weight <= TARGET_CHUNK_CHARS
            and merge_score >= 5
        )
        max_merge = bool(
            current_segments
            and not hard_boundary
            and projected_weight <= max_chars
            and merge_score >= 8
        )
        if should_attach_to_previous:
            current_segments.append(segment)
            current_weight += segment_weight
            continue
        if merge_short_same_heading:
            current_segments.append(segment)
            current_weight += segment_weight
            continue
        if rescue_merge or target_merge or max_merge:
            current_segments.append(segment)
            current_weight += segment_weight
            continue
        if (
            heading_changed
            or structural_changed
            or hard_boundary
            or cover_boundary
            or projected_weight > max_chars
        ):
            flush()
        current_segments.append(segment)
        current_weight += segment_weight
        if _is_cover_standalone_segment(segment):
            flush()
    flush()

    structural_chunk_counts: dict[str, int] = {}
    primary_structural_chunk_counts: dict[str, int] = {}
    primary_structural_seen_counts: dict[str, int] = {}
    title_chunk_seen: set[str] = set()
    last_seen_title_by_depth_by_sector: dict[str, dict[int, str]] = {}
    for chunk in chunks:
        sector = str(chunk.metadata.get("sector") or "main").strip() or "main"
        title_path = str(chunk.metadata.get("title_heading_path") or "")
        structural_key = str(chunk.metadata.get("structural_group_key") or "")
        primary_structural_key = str(chunk.metadata.get("_primary_structural_key_runtime") or "")
        scoped_structural_key = f"{sector}|{structural_key}" if structural_key else ""
        scoped_primary_structural_key = f"{sector}|{primary_structural_key}" if primary_structural_key else ""
        nodes = chunk.metadata.get("_heading_nodes_runtime") or []
        structural_nodes = [node for node in nodes if isinstance(node, HeadingNode) and node.kind != "title" and node.text.strip()]
        if not title_path or not structural_key:
            if scoped_primary_structural_key:
                primary_structural_chunk_counts[scoped_primary_structural_key] = primary_structural_chunk_counts.get(scoped_primary_structural_key, 0) + 1
            continue
        structural_chunk_counts[scoped_structural_key] = structural_chunk_counts.get(scoped_structural_key, 0) + 1
        if scoped_primary_structural_key:
            primary_structural_chunk_counts[scoped_primary_structural_key] = primary_structural_chunk_counts.get(scoped_primary_structural_key, 0) + 1

    for idx, chunk in enumerate(chunks):
        if chunk.block_type != "table-row":
            continue
        header_row = chunk.metadata.get("header_row")
        if not isinstance(header_row, list) or not idx:
            continue
        prev_chunk = chunks[idx - 1]
        if prev_chunk.block_type != "paragraph":
            continue
        if prev_chunk.heading_path != chunk.heading_path:
            continue
        cleaned = _strip_table_overlap_from_paragraph(prev_chunk.content, [str(item) for item in header_row])
        cleaned = _strip_table_row_overlap(cleaned, chunk.content)
        cleaned = _strip_at_first_table_signal(cleaned, [str(item) for item in header_row], chunk.content)
        prev_chunk.content = cleaned

    _propagate_table_captions(chunks)
    chunks = _merge_table_row_chunks(chunks, file_id=file_id, max_chars=max_chars)
    chunks = _split_oversized_table_row_chunks(chunks, file_id=file_id, max_chars=max_chars)
    chunks = _split_oversized_text_chunks(chunks, file_id=file_id, max_chars=max_chars)

    for chunk in chunks:
        sector = str(chunk.metadata.get("sector") or "main").strip() or "main"
        last_seen_title_by_depth = last_seen_title_by_depth_by_sector.setdefault(sector, {})
        title_path = str(chunk.metadata.get("title_heading_path") or "")
        if not title_path:
            continue
        nodes = chunk.metadata.get("_heading_nodes_runtime") or []
        if not isinstance(nodes, list):
            nodes = []
        structural_key = str(chunk.metadata.get("structural_group_key") or "")
        primary_structural_key = str(chunk.metadata.get("_primary_structural_key_runtime") or "")
        scoped_title_path = f"{sector}|{title_path}"
        scoped_structural_key = f"{sector}|{structural_key}" if structural_key else ""
        scoped_primary_structural_key = f"{sector}|{primary_structural_key}" if primary_structural_key else ""
        structural_nodes = [node for node in nodes if isinstance(node, HeadingNode) and node.kind != "title" and node.text.strip()]
        first_structural = structural_nodes[0] if structural_nodes else None
        primary_count = primary_structural_chunk_counts.get(scoped_primary_structural_key, 0)
        primary_seen_index = primary_structural_seen_counts.get(scoped_primary_structural_key, 0) + 1 if scoped_primary_structural_key else 0
        if scoped_primary_structural_key:
            primary_structural_seen_counts[scoped_primary_structural_key] = primary_seen_index
        sentence_mode = "full"
        if first_structural and _is_sentence_style_structural_node(first_structural):
            chunk_content = _normalize_content(chunk.content or "")
            structural_text = _normalize_content(first_structural.text or "")
            if structural_text and structural_text in chunk_content:
                sentence_mode = "symbol"
            elif primary_count <= 1:
                sentence_mode = "omit"
            elif primary_seen_index == 1:
                sentence_mode = "omit"
            elif chunk.block_type in {"table", "table-row"}:
                sentence_mode = "symbol"
            elif len(structural_nodes) > 1:
                sentence_mode = "symbol"

        structural_path = _render_structural_path(nodes, sentence_mode=sentence_mode, content=chunk.content or "")
        if structural_path:
            chunk.heading_path = _combine_heading_paths(title_path, structural_path)
        else:
            chunk.heading_path = title_path

        table_caption = str(chunk.metadata.get("table_caption") or "").strip()
        if table_caption and chunk.block_type == "table-row":
            chunk.heading_path = f"{chunk.heading_path} > 📋 {table_caption}"

        if title_path and scoped_title_path not in title_chunk_seen:
            title_lines = _incremental_title_lines(nodes, last_seen_title_by_depth)
            if title_lines and chunk.block_type != "table-single-row":
                body = (chunk.content or "").strip()
                chunk.content = _prepend_unique_lines(title_lines, body)
            title_chunk_seen.add(scoped_title_path)
            _update_seen_title_lines(nodes, last_seen_title_by_depth)
        chunk.metadata["heading_path"] = chunk.heading_path
        chunk.metadata.pop("title_heading_path", None)
        chunk.metadata.pop("_heading_nodes_runtime", None)
        chunk.metadata.pop("_primary_structural_key_runtime", None)
    return chunks


class ChunkBuilder:
    """ParsedSegment 목록을 임베딩용 RagChunk 목록으로 변환한다."""

    def build_chunks(
        self,
        *,
        file_id: str,
        file_name: str,
        segments: list[ParsedSegment],
        max_chars: int = 1000,
    ) -> list[RagChunk]:
        """segment 목록을 heading-aware chunk 목록으로 묶는다."""
        return build_chunks(
            file_id=file_id,
            file_name=file_name,
            segments=segments,
            max_chars=max_chars,
        )


__all__ = [
    "RagChunk",
    "ChunkBuilder",
    "build_chunks",
]
