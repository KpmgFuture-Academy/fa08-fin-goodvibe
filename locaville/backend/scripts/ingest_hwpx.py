"""HWPX 정책 문서 인덱싱 CLI 스크립트.

``python scripts/ingest_hwpx.py --input <path>.hwpx`` 로 호출. 결과는
``rag_sources/{raw_hwpx,parsed_text,chunks}`` 세 곳에 저장. 청크 파일은
``rag_service`` 가 RAG Q&A 시 검색.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.services.hwpx_ingest_service import HWPXIngestError, ingest_hwpx_file


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Ingest a HWPX file into backend rag_sources.")
    parser.add_argument("--input", required=True, help="Path to a .hwpx file")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        result = ingest_hwpx_file(args.input)
    except HWPXIngestError as exc:
        print(f"[ingest_hwpx] failed: {exc}", file=sys.stderr)
        return 1

    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
