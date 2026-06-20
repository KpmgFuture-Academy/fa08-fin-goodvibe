"""Phase C — Supabase 에 RAG 테이블 + pgvector 인덱스 생성.

실행:
    cd locaville/backend
    .\.venv\Scripts\python scripts\setup_supabase_rag.py

DB_URL 은 backend/.env 의 값을 그대로 사용 (PostgreSQL pooler).
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

from dotenv import load_dotenv

# 콘솔 한글
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

BACKEND_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BACKEND_DIR / ".env", override=False)

DB_URL = os.getenv("DB_URL") or os.getenv("DATABASE_URL")
if not DB_URL:
    print("[ERR] DB_URL 환경변수 없음.")
    sys.exit(1)

import psycopg

DDL_STEPS = [
    (
        "1) pgvector extension 활성화",
        "CREATE EXTENSION IF NOT EXISTS vector;",
    ),
    (
        "2) rag_chunks 테이블 (없으면 생성)",
        """
        CREATE TABLE IF NOT EXISTS rag_chunks (
            id             TEXT PRIMARY KEY,
            source         TEXT NOT NULL,
            doc_type       TEXT,
            heading_path   TEXT,
            position       TEXT,
            page_no        INT,
            section_no     INT,
            document_date  TEXT,
            content        TEXT NOT NULL,
            embedding      VECTOR(1536) NOT NULL,
            extra          JSONB,
            created_at     TIMESTAMPTZ DEFAULT NOW()
        );
        """,
    ),
    (
        "3) HNSW 벡터 인덱스 (cosine)",
        """
        CREATE INDEX IF NOT EXISTS rag_chunks_emb_hnsw
        ON rag_chunks USING hnsw (embedding vector_cosine_ops);
        """,
    ),
    (
        "4) source B-Tree 인덱스",
        "CREATE INDEX IF NOT EXISTS rag_chunks_source_idx ON rag_chunks (source);",
    ),
    (
        "5) doc_type B-Tree 인덱스",
        "CREATE INDEX IF NOT EXISTS rag_chunks_doc_type_idx ON rag_chunks (doc_type);",
    ),
]

VERIFY_SQL = [
    (
        "extension 확인",
        "SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';",
    ),
    (
        "테이블 컬럼",
        """
        SELECT column_name, data_type, character_maximum_length
        FROM information_schema.columns
        WHERE table_name = 'rag_chunks'
        ORDER BY ordinal_position;
        """,
    ),
    (
        "인덱스 확인",
        """
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE tablename = 'rag_chunks'
        ORDER BY indexname;
        """,
    ),
    (
        "현재 row 수",
        "SELECT COUNT(*) AS rows FROM rag_chunks;",
    ),
]


def main() -> int:
    masked_url = DB_URL.replace(DB_URL.split('@')[0].split(':')[-1], '****')
    print(f"DB_URL: {masked_url}")
    print()

    with psycopg.connect(DB_URL, autocommit=True) as conn:
        with conn.cursor() as cur:
            # DDL 적용
            for label, sql in DDL_STEPS:
                print(f"[+] {label}")
                try:
                    cur.execute(sql)
                    print("    ok")
                except Exception as e:
                    print(f"    [ERR] {type(e).__name__}: {e}")
                    return 1

            print()
            print("=" * 60)
            print("검증")
            print("=" * 60)

            for label, sql in VERIFY_SQL:
                print(f"\n[?] {label}")
                cur.execute(sql)
                rows = cur.fetchall()
                if not rows:
                    print("    (no rows)")
                    continue
                for r in rows:
                    print(f"    {r}")

    print()
    print("[OK] Phase C 완료. 이제 Phase D (Chroma → Supabase migration) 진행 가능.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
