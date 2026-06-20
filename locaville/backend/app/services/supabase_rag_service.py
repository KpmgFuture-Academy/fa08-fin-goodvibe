"""HWPX 청크(JSON) → OpenAI 임베딩 → Supabase pgvector(rag_chunks) 적재.

`hwpx_ingest_service` 가 생성한 `rag_sources/chunks/{file}.json` 산출물을 입력으로 받아
임베딩 + Supabase INSERT 한다. Chroma 의존성 없이 동작.

핵심 결정:
- 임베딩 모델: text-embedding-3-large + dimensions=1536 (native reduction, HNSW 호환)
- batch: 50개씩 OpenAI 호출
- 청크 개선 후처리: PoC 보고서 line 202-204 의 문제 일부 fix
- INSERT 정책: ON CONFLICT (id) DO UPDATE — 재 ingest 시 자연 갱신

CLI 진입점은 `scripts/ingest_to_supabase.py`.
"""
from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any, Iterable, Iterator

from locaville.dbcom import DBExecutionError, execute, fetch_all, fetch_one, transaction

DEFAULT_EMBEDDING_MODEL = "text-embedding-3-large"
DEFAULT_EMBEDDING_DIM = 1536   # large 의 native reduction (HNSW 인덱스 호환: pgvector ≤ 2000)
DEFAULT_EMBED_BATCH = 50
DEFAULT_TABLE = "rag_chunks"

# 날짜 패턴 — heading_path 에 들어가면 의미 없는 것들. PoC 보고서 line 204.
_DATE_PATTERN = re.compile(r"^\s*\d{4}\.\s*\d{1,2}\.?\s*\d{0,2}\.?\s*$")
# 작은 라벨 표 — 16자 이하 단일 셀. PoC 보고서 line 203 일부.
_MAX_SMALL_LABEL_LEN = 16


# ============================================================
# 1. 청크 JSON 로딩
# ============================================================

def load_chunks_json(chunks_path: Path) -> list[dict[str, Any]]:
    """`rag_sources/chunks/{file}.json` 의 payload → chunk list."""
    payload = json.loads(chunks_path.read_text(encoding="utf-8"))
    chunks = payload.get("chunks") or []
    if not isinstance(chunks, list):
        raise ValueError(f"{chunks_path} 의 chunks 가 list 가 아님")
    return chunks


# ============================================================
# 2. 청크 개선 후처리 — PoC 보고서 line 202-204
# ============================================================

def _clean_heading_path(heading_path: str) -> str:
    """heading_path 에서 날짜 패턴 제거 (line 204).

    예: '2026. 1. > Ⅰ 사업 개요' → 'Ⅰ 사업 개요'
    """
    if not heading_path:
        return ""
    parts = [p.strip() for p in heading_path.split(">")]
    cleaned = [p for p in parts if p and not _DATE_PATTERN.match(p)]
    return " > ".join(cleaned)


def _is_small_label_chunk(chunk: dict[str, Any]) -> bool:
    """16자 이하 + 표/박스 타입 → 인접 chunk 에 흡수 후보."""
    text = (chunk.get("text") or "").strip()
    return len(text) <= _MAX_SMALL_LABEL_LEN


def improve_chunks(chunks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """청크 개선 후처리:
    1. heading_path 정리 (날짜 패턴 제거)
    2. 작은 라벨 청크 + 다음 본문 청크 merge
    """
    if not chunks:
        return []

    # 1) heading_path 정리
    for c in chunks:
        if "title" in c:
            c["title"] = _clean_heading_path(c["title"])

    # 2) 작은 라벨 청크 흡수 — i 가 small + i+1 이 본문 이면 합침
    improved: list[dict[str, Any]] = []
    i = 0
    while i < len(chunks):
        cur = chunks[i]
        if i + 1 < len(chunks) and _is_small_label_chunk(cur):
            nxt = chunks[i + 1]
            # 같은 source 이고 다음이 본문 (라벨 아님) 일 때만 merge
            if cur.get("source_file") == nxt.get("source_file") and not _is_small_label_chunk(nxt):
                merged_text = f"{cur.get('text', '').strip()}\n{nxt.get('text', '').strip()}".strip()
                merged = {**nxt, "text": merged_text}
                # title 우선순위: nxt 의 title 유지 (더 정확한 컨텍스트)
                improved.append(merged)
                i += 2
                continue
        improved.append(cur)
        i += 1
    return improved


# ============================================================
# 3. 임베딩 생성 (OpenAI text-embedding-3-large, dim=1536)
# ============================================================

def _get_embeddings_client():
    """langchain_openai OpenAIEmbeddings — dimensions 명시로 native reduction."""
    try:
        from langchain_openai import OpenAIEmbeddings
    except ImportError as e:
        raise RuntimeError("langchain-openai 패키지가 설치되어 있어야 함.") from e
    model = os.getenv("RAG_EMBEDDING_MODEL", DEFAULT_EMBEDDING_MODEL).strip() or DEFAULT_EMBEDDING_MODEL
    dim = int(os.getenv("RAG_EMBEDDING_DIM", str(DEFAULT_EMBEDDING_DIM)))
    return OpenAIEmbeddings(model=model, dimensions=dim)


def _batched(items: list[Any], size: int) -> Iterator[list[Any]]:
    for i in range(0, len(items), size):
        yield items[i : i + size]


def embed_texts(texts: list[str], batch_size: int = DEFAULT_EMBED_BATCH) -> list[list[float]]:
    """텍스트 list → 임베딩 vector list. batch 로 OpenAI 호출."""
    embeddings = _get_embeddings_client()
    vectors: list[list[float]] = []
    for batch in _batched(texts, batch_size):
        batch_vecs = embeddings.embed_documents(batch)
        vectors.extend(batch_vecs)
    return vectors


# ============================================================
# 4. metadata 변환 — Chroma 26개 → Supabase 컬럼 9개 + JSONB extra
# ============================================================

def chunk_to_row(chunk: dict[str, Any], embedding: list[float]) -> dict[str, Any]:
    """chunk JSON + embedding → INSERT 용 row dict.

    컬럼: id, source, doc_type, heading_path, position, document_date, content, embedding, extra
    """
    source_file = chunk.get("source_file") or ""
    source = Path(source_file).stem if source_file else "unknown"

    # 옛 chunks JSON 의 필드 매핑
    extra: dict[str, Any] = {}
    if chunk.get("title"):
        extra["heading_or_caption"] = chunk["title"]

    return {
        "id": chunk["chunk_id"],
        "source": source,
        "doc_type": chunk.get("type") or "paragraph",
        "heading_path": chunk.get("title") or "",   # cleaned 된 title
        "position": chunk.get("position") or "",
        "document_date": chunk.get("document_date") or "",
        "content": chunk.get("text", "").strip(),
        "embedding": embedding,
        "extra": extra,
    }


# ============================================================
# 5. Supabase INSERT (ON CONFLICT DO UPDATE)
# ============================================================

def _resolve_table() -> str:
    return os.getenv("RAG_DB_TABLE", DEFAULT_TABLE).strip() or DEFAULT_TABLE


def insert_rows(rows: list[dict[str, Any]]) -> int:
    """rows list → Supabase rag_chunks INSERT. ON CONFLICT 시 갱신.

    반환: INSERT/UPDATE 처리된 row 수.
    """
    if not rows:
        return 0

    table = _resolve_table()
    sql = f"""
        INSERT INTO {table}
            (id, source, doc_type, heading_path, position, document_date,
             content, embedding, extra)
        VALUES
            (%s, %s, %s, %s, %s, %s, %s, %s::vector, %s::jsonb)
        ON CONFLICT (id) DO UPDATE SET
            source        = EXCLUDED.source,
            doc_type      = EXCLUDED.doc_type,
            heading_path  = EXCLUDED.heading_path,
            position      = EXCLUDED.position,
            document_date = EXCLUDED.document_date,
            content       = EXCLUDED.content,
            embedding     = EXCLUDED.embedding,
            extra         = EXCLUDED.extra
    """

    inserted = 0
    with transaction() as conn:
        for r in rows:
            try:
                execute(
                    sql,
                    [
                        r["id"],
                        r["source"],
                        r["doc_type"],
                        r["heading_path"],
                        r["position"],
                        r["document_date"],
                        r["content"],
                        r["embedding"],   # pgvector 가 list[float] 받음
                        json.dumps(r["extra"], ensure_ascii=False),
                    ],
                    connection=conn,
                    commit=False,
                )
                inserted += 1
            except DBExecutionError as exc:
                raise RuntimeError(f"INSERT 실패 id={r['id']} — {exc}") from exc
    return inserted


# ============================================================
# 6. End-to-end: chunks JSON → embed → Supabase
# ============================================================

def ingest_chunks_file(
    chunks_path: Path,
    *,
    batch_size: int = DEFAULT_EMBED_BATCH,
    dry_run: bool = False,
    improve: bool = True,
) -> dict[str, Any]:
    """한 chunks JSON 파일을 통째로 Supabase 에 적재.

    Returns: {file, raw_chunks, improved_chunks, inserted, dry_run}
    """
    raw_chunks = load_chunks_json(chunks_path)
    chunks = improve_chunks(raw_chunks) if improve else raw_chunks

    if dry_run:
        return {
            "file": chunks_path.name,
            "raw_chunks": len(raw_chunks),
            "improved_chunks": len(chunks),
            "inserted": 0,
            "dry_run": True,
        }

    if not chunks:
        return {
            "file": chunks_path.name,
            "raw_chunks": len(raw_chunks),
            "improved_chunks": 0,
            "inserted": 0,
            "dry_run": False,
        }

    # 1) 임베딩 batch 생성
    texts = [c.get("text", "") for c in chunks]
    vectors = embed_texts(texts, batch_size=batch_size)

    # 2) row 변환
    rows = [chunk_to_row(c, v) for c, v in zip(chunks, vectors)]

    # 3) INSERT
    inserted = insert_rows(rows)

    return {
        "file": chunks_path.name,
        "raw_chunks": len(raw_chunks),
        "improved_chunks": len(chunks),
        "inserted": inserted,
        "dry_run": False,
    }


def stats() -> dict[str, Any]:
    """현재 Supabase rag_chunks 의 상태."""
    table = _resolve_table()
    total = fetch_one(f"SELECT COUNT(*) AS c FROM {table};")["c"]
    by_source = fetch_all(
        f"SELECT source, COUNT(*) AS c FROM {table} GROUP BY source ORDER BY c DESC;"
    )
    by_doc_type = fetch_all(
        f"SELECT doc_type, COUNT(*) AS c FROM {table} GROUP BY doc_type ORDER BY c DESC;"
    )
    return {
        "table": table,
        "total": total,
        "by_source": [dict(r) for r in by_source],
        "by_doc_type": [dict(r) for r in by_doc_type],
    }


def truncate_table() -> int:
    """rag_chunks 전체 삭제 (재 ingest 전 초기화).

    Returns: 삭제 직전 row 수.
    """
    table = _resolve_table()
    before = fetch_one(f"SELECT COUNT(*) AS c FROM {table};")["c"]
    execute(f"TRUNCATE TABLE {table};")
    return before
