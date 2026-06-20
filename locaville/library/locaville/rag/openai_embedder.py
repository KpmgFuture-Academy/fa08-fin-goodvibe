from __future__ import annotations

import os

from fastapi import HTTPException

from .chunk_builder import RagChunk

try:
    from langchain_openai import OpenAIEmbeddings
except ImportError:  # pragma: no cover
    OpenAIEmbeddings = None


DEFAULT_EMBEDDING_MODEL = "text-embedding-3-large"
DEFAULT_EMBEDDING_DIMENSIONS = 1536


class OpenAIEmbedder:
    """OpenAI 기반 vector embedding 구현체."""

    def _embedding_model_name(self) -> str:
        return os.getenv("RAG_EMBEDDING_MODEL", DEFAULT_EMBEDDING_MODEL).strip() or DEFAULT_EMBEDDING_MODEL

    def _embedding_dimensions(self) -> int:
        raw = os.getenv("RAG_EMBEDDING_DIMENSIONS", str(DEFAULT_EMBEDDING_DIMENSIONS)).strip()
        try:
            parsed = int(raw)
        except ValueError:
            return DEFAULT_EMBEDDING_DIMENSIONS
        return parsed if parsed > 0 else DEFAULT_EMBEDDING_DIMENSIONS

    def embed_chunks(self, chunks: list[RagChunk]) -> tuple[str, list[list[float]]]:
        if not chunks:
            return self._embedding_model_name(), []
        if OpenAIEmbeddings is None:
            raise HTTPException(status_code=500, detail="langchain-openai 모듈이 설치되지 않았습니다.")
        try:
            client = OpenAIEmbeddings(
                model=self._embedding_model_name(),
                dimensions=self._embedding_dimensions(),
            )
            vectors = client.embed_documents([chunk.content for chunk in chunks])
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=500, detail=f"벡터 임베딩 생성 실패: {exc}") from exc
        return self._embedding_model_name(), vectors


def embed_chunks(chunks: list[RagChunk]) -> tuple[str, list[list[float]]]:
    return OpenAIEmbedder().embed_chunks(chunks)


__all__ = [
    "DEFAULT_EMBEDDING_DIMENSIONS",
    "DEFAULT_EMBEDDING_MODEL",
    "OpenAIEmbedder",
    "embed_chunks",
]
