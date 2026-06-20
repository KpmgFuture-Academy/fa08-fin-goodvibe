"""CLI — chunks JSON → OpenAI 임베딩 → Supabase rag_chunks 적재.

Usage:
    # 단일 파일
    .\.venv\Scripts\python scripts\ingest_to_supabase.py \
        --file rag_sources/chunks/시행지침.json

    # rag_sources/chunks/ 전체
    .\.venv\Scripts\python scripts\ingest_to_supabase.py --all

    # dry-run (chunk 수만 보고, OpenAI / Supabase 호출 안 함)
    .\.venv\Scripts\python scripts\ingest_to_supabase.py --all --dry-run

    # 기존 데이터 모두 삭제 후 ingest (재 ingest)
    .\.venv\Scripts\python scripts\ingest_to_supabase.py --all --truncate

    # 현재 Supabase 상태만 보기
    .\.venv\Scripts\python scripts\ingest_to_supabase.py --stats
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

# 콘솔 한글
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

# backend root → sys.path
BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from dotenv import load_dotenv
load_dotenv(BACKEND_DIR / ".env", override=False)

from app.services.supabase_rag_service import (  # noqa: E402
    DEFAULT_EMBED_BATCH,
    ingest_chunks_file,
    stats,
    truncate_table,
)

CHUNKS_DIR = BACKEND_DIR / "rag_sources" / "chunks"


def discover_chunks_files() -> list[Path]:
    if not CHUNKS_DIR.exists():
        return []
    return sorted(CHUNKS_DIR.glob("*.json"))


def cmd_stats() -> int:
    s = stats()
    print(f"table: {s['table']}")
    print(f"total chunks: {s['total']}")
    print()
    print("=== source 별 ===")
    for row in s["by_source"]:
        print(f"  {row['c']:>5}  {row['source']}")
    print()
    print("=== doc_type 별 ===")
    for row in s["by_doc_type"]:
        print(f"  {row['c']:>5}  {row['doc_type']}")
    return 0


def cmd_truncate() -> int:
    before = truncate_table()
    print(f"[!] TRUNCATE 완료 — 옛 {before} chunk 삭제")
    return 0


def cmd_ingest(
    files: list[Path],
    *,
    batch_size: int,
    dry_run: bool,
    improve: bool,
) -> int:
    if not files:
        print("[!] 처리할 파일 없음 (--file 지정 또는 --all 사용)")
        return 1

    print(f"=== ingest {'(DRY-RUN)' if dry_run else ''} ===")
    print(f"batch_size: {batch_size}")
    print(f"improve_chunks: {improve}")
    print(f"files: {len(files)}")
    print()

    total_raw = 0
    total_improved = 0
    total_inserted = 0

    for fp in files:
        print(f"[+] {fp.name}")
        try:
            result = ingest_chunks_file(
                fp,
                batch_size=batch_size,
                dry_run=dry_run,
                improve=improve,
            )
        except Exception as e:
            print(f"    [ERR] {type(e).__name__}: {e}")
            continue

        print(f"    raw chunks      : {result['raw_chunks']}")
        if improve:
            print(f"    improved chunks : {result['improved_chunks']}")
        if dry_run:
            print(f"    inserted        : (dry-run)")
        else:
            print(f"    inserted        : {result['inserted']}")

        total_raw += result["raw_chunks"]
        total_improved += result["improved_chunks"]
        total_inserted += result["inserted"]

    print()
    print("=" * 60)
    print(f"전체 raw           : {total_raw}")
    print(f"개선 후            : {total_improved}")
    if dry_run:
        print(f"insert (dry-run)   : 0")
    else:
        print(f"INSERT/UPDATE      : {total_inserted}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="chunks JSON → Supabase rag_chunks ingest CLI")
    parser.add_argument("--file", action="append", default=[],
                        help="처리할 chunks JSON 경로. 여러 번 가능.")
    parser.add_argument("--all", action="store_true",
                        help="rag_sources/chunks/*.json 전체 처리")
    parser.add_argument("--batch", type=int, default=DEFAULT_EMBED_BATCH,
                        help=f"OpenAI 임베딩 batch 크기 (default {DEFAULT_EMBED_BATCH})")
    parser.add_argument("--dry-run", action="store_true",
                        help="OpenAI / Supabase 호출 안 함. chunk 수만 보고.")
    parser.add_argument("--no-improve", action="store_true",
                        help="청크 개선 후처리 skip")
    parser.add_argument("--truncate", action="store_true",
                        help="ingest 전에 rag_chunks 전체 삭제")
    parser.add_argument("--stats", action="store_true",
                        help="현재 Supabase 상태만 보고 종료")

    args = parser.parse_args()

    if args.stats:
        return cmd_stats()

    if args.truncate and not args.dry_run:
        cmd_truncate()
        print()

    files: list[Path] = []
    if args.all:
        files.extend(discover_chunks_files())
    for f in args.file:
        files.append(Path(f).resolve())

    return cmd_ingest(
        files,
        batch_size=args.batch,
        dry_run=args.dry_run,
        improve=not args.no_improve,
    )


if __name__ == "__main__":
    sys.exit(main())
