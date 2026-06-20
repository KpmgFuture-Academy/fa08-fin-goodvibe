from __future__ import annotations

import os
from abc import ABC, abstractmethod

from .chunk_builder import RagChunk
from .openai_embedder import OpenAIEmbedder


DEFAULT_EMBEDDING_PROVIDER = "openai"


class BaseVectorEmbedder(ABC):
    """Vector embedding 구현체 공통 인터페이스."""

    @abstractmethod
    def embed_chunks(self, chunks: list[RagChunk]) -> tuple[str, list[list[float]]]:
        """chunk 목록을 임베딩하고 모델명과 벡터 목록을 반환한다."""


class VectorEmbedder(BaseVectorEmbedder):
    """설정에 따라 실제 embedding 구현체를 dispatch 하는 wrapper."""

    def __init__(self) -> None:
        self._dispatchers: dict[str, BaseVectorEmbedder] = {
            "openai": OpenAIEmbedder(),
        }

    def _provider_name(self) -> str:
        return os.getenv("RAG_EMBEDDING_PROVIDER", DEFAULT_EMBEDDING_PROVIDER).strip().lower() or DEFAULT_EMBEDDING_PROVIDER

    def embed_chunks(self, chunks: list[RagChunk]) -> tuple[str, list[list[float]]]:
        provider_name = self._provider_name()
        provider = self._dispatchers.get(provider_name)
        if provider is None:
            available = ", ".join(sorted(self._dispatchers))
            raise ValueError(f"지원하지 않는 embedding provider 입니다: {provider_name} (available: {available})")
        return provider.embed_chunks(chunks)


def embed_chunks(chunks: list[RagChunk]) -> tuple[str, list[list[float]]]:
    return VectorEmbedder().embed_chunks(chunks)


__all__ = [
    "DEFAULT_EMBEDDING_PROVIDER",
    "BaseVectorEmbedder",
    "VectorEmbedder",
    "embed_chunks",
]
