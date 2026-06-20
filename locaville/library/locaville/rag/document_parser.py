from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any

from .document_models import ParsedSegment, RagEmbeddingParseError
from .docx_parser import DocxDocumentParser
from .hwpx_parser import HwpxParser
from .markdown_parser import MarkdownDocumentParser
from .pdf_parser import PdfDocumentParser


class BaseDocumentParser(ABC):
    """RAG embedding 용 문서 parser 공통 인터페이스."""

    @abstractmethod
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
        """파일 형식에 맞는 parser 를 호출해 ParsedSegment 목록을 만든다."""


class DocumentParser(BaseDocumentParser):
    """파일 확장자에 따라 실제 parser 구현체를 dispatch 하는 wrapper."""

    def __init__(self) -> None:
        self._dispatchers: dict[str, BaseDocumentParser] = {
            ".md": MarkdownDocumentParser(),
            ".docx": DocxDocumentParser(),
            ".pdf": PdfDocumentParser(),
            ".hwpx": HwpxParser(),
        }

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
        suffix = Path(filename).suffix.lower()
        parser = self._dispatchers.get(suffix)
        if parser is None:
            raise RagEmbeddingParseError(f"지원하지 않는 형식입니다: {suffix}")

        return parser.parse_document(
            file_id=file_id,
            filename=filename,
            content=content,
            heading_schema=heading_schema,
            appendix_schema=appendix_schema,
            body_exit_criteria=body_exit_criteria,
            appendix_exit_criteria=appendix_exit_criteria,
        )


__all__ = [
    "BaseDocumentParser",
    "DocumentParser",
    "ParsedSegment",
    "RagEmbeddingParseError",
]
