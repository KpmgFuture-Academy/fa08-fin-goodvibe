import json
from pathlib import Path

import chromadb
from chromadb.errors import NotFoundError
from langchain_chroma import Chroma
from langchain_core.documents import Document
from langchain_openai import OpenAIEmbeddings

from .parse_hwpx_to_docs import parse_hwpx
from .chunk_documents import merge_and_chunk_docs


DEFAULT_PERSIST_DIRECTORY = r"./database/chroma_hwpx_db"
DEFAULT_COLLECTION_NAME = "hwpx_documents"
DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small"


def create_hwpx_embeddings(model=DEFAULT_EMBEDDING_MODEL):
    """입력: embedding model명 / 출력: OpenAIEmbeddings 객체 / 기능: HWPX RAG용 embedding 모델 생성."""
    return OpenAIEmbeddings(model=model)


def normalize_persist_directory(persist_directory):
    """입력: str 또는 Path / 출력: str 경로 / 기능: Chroma가 사용할 저장 경로를 문자열로 정규화."""
    return str(Path(persist_directory))


def reset_chroma_collection(
    persist_directory=DEFAULT_PERSIST_DIRECTORY,
    collection_name=DEFAULT_COLLECTION_NAME,
):
    """입력: Chroma 저장 경로, collection명 / 출력: 없음 / 기능: 지정 collection의 기존 embedding 데이터를 삭제."""
    persist_directory = normalize_persist_directory(persist_directory)
    client = chromadb.PersistentClient(path=persist_directory)

    try:
        client.delete_collection(collection_name)
    except NotFoundError:
        pass


def sanitize_metadata_value(value):
    """입력: metadata 값 / 출력: Chroma 저장 가능 값 / 기능: None/list/dict 등을 str/int/float/bool 호환 형태로 변환."""
    if value is None:
        return ""

    if isinstance(value, (str, int, float, bool)):
        return value

    if isinstance(value, (list, dict)):
        return json.dumps(value, ensure_ascii=False)

    return str(value)


def sanitize_documents_for_vectorstore(docs):
    """입력: Document list / 출력: metadata 정리된 Document list / 기능: Chroma metadata 타입 오류 방지."""
    sanitized = []

    for doc in docs:
        metadata = {
            str(key): sanitize_metadata_value(value)
            for key, value in doc.metadata.items()
        }

        sanitized.append(
            Document(
                page_content=doc.page_content or "",
                metadata=metadata,
            )
        )

    return sanitized


def build_hwpx_vectorstore(
    chunks,
    embeddings=None,
    persist_directory=DEFAULT_PERSIST_DIRECTORY,
    collection_name=DEFAULT_COLLECTION_NAME,
    reset_collection=True,
):
    """입력: chunk Document list, embeddings, 저장 경로, collection명 / 출력: Chroma vectorstore / 기능: chunk를 embedding하여 Chroma에 저장."""
    if not chunks:
        raise ValueError("chunks가 비어 있어 vectorstore를 생성할 수 없습니다.")

    persist_directory = normalize_persist_directory(persist_directory)

    if embeddings is None:
        embeddings = create_hwpx_embeddings()

    if reset_collection:
        reset_chroma_collection(
            persist_directory=persist_directory,
            collection_name=collection_name,
        )

    safe_chunks = sanitize_documents_for_vectorstore(chunks)

    return Chroma.from_documents(
        documents=safe_chunks,
        embedding=embeddings,
        persist_directory=persist_directory,
        collection_name=collection_name,
    )


def load_hwpx_vectorstore(
    persist_directory=DEFAULT_PERSIST_DIRECTORY,
    embeddings=None,
    collection_name=DEFAULT_COLLECTION_NAME,
):
    """입력: embeddings, 저장 경로, collection명 / 출력: Chroma vectorstore / 기능: 기존 Chroma collection을 검색용으로 로드."""
    persist_directory = normalize_persist_directory(persist_directory)

    if embeddings is None:
        embeddings = create_hwpx_embeddings()

    return Chroma(
        persist_directory=persist_directory,
        collection_name=collection_name,
        embedding_function=embeddings,
    )

# --------------------------
# Indexing
# --------------------------
def index_hwpx_to_vectorstore(
    file_path,
    embeddings,
    persist_directory=DEFAULT_PERSIST_DIRECTORY,
    collection_name=DEFAULT_COLLECTION_NAME,
    reset_collection=True,
    max_merged_chars=780,
    chunk_size=800,
    chunk_overlap=120,
    table_chunk_size=1600,
    table_chunk_overlap=180,
):
    """입력: HWPX 파일 경로, embeddings, Chroma 저장 옵션 / 출력: Chroma vectorstore / 기능: HWPX 파싱→병합/청킹→임베딩→Chroma 저장."""
    if embeddings is None:
        embeddings = OpenAIEmbeddings(model="text-embedding-3-small")

    docs = parse_hwpx(file_path)

    print(f"분해된 Document 수: {len(docs)}")

    chunks = merge_and_chunk_docs(
        docs,
        max_merged_chars=max_merged_chars,
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        # table_chunk_size=table_chunk_size,
        # table_chunk_overlap=table_chunk_overlap,
    )

    vectorstore = build_hwpx_vectorstore(
        chunks=chunks,
        embeddings=embeddings,
        persist_directory=persist_directory,
        collection_name=collection_name,
        reset_collection=reset_collection,
    )

    print(f"Chunk 수: {len(chunks)}")

    return vectorstore
