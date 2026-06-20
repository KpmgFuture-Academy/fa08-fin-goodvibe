from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class HeadingNode:
    """문서 heading stack 의 1개 노드."""

    depth: int
    text: str
    kind: str = "title"
    rule_type: str = ""
    notation: str = ""


@dataclass
class ParsedSegment:
    """파서가 생성한 임베딩 전 단계의 공통 segment 표현."""

    source_order: int
    location: str
    heading_depth: int | None
    heading_text: str
    heading_path: str
    content: str
    block_type: str = "paragraph"
    chunk_loc: str = ""
    section: str = ""
    sector: str = "main"
    metadata: dict[str, Any] = field(default_factory=dict)
    heading_nodes: list[HeadingNode] = field(default_factory=list)


class RagEmbeddingParseError(Exception):
    """Raised when a RAG source file cannot be parsed for embedding."""

