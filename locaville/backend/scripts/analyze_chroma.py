"""Chroma 청크 + metadata 분포 분석.

Phase A 의 일부. Supabase pgvector 이관 전에 옛 데이터 상태 파악.

실행:
    cd locaville/backend
    .\.venv\Scripts\python scripts\analyze_chroma.py
"""
from __future__ import annotations

import json
import os
import sys
from collections import Counter
from pathlib import Path

# repo root 의 database/chroma_* 위치 추정 (backend 의 4개 위로).
BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_DIR.parents[1]

# rag_service 의 default 확인을 위해 import.
sys.path.insert(0, str(BACKEND_DIR))
from app.services.rag_service import _resolve_vectorstore_dir, _collection_name, _embedding_model_name  # noqa: E402

# console 인코딩 강제 utf-8
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

# Chroma 위치 — env 가 없으면 default. database/chroma_hwpx_db 가 실제 위치 후보.
CANDIDATES = [
    _resolve_vectorstore_dir(),
    REPO_ROOT / "database" / "chroma_hwpx_db",
    REPO_ROOT / "database" / "chroma_agri_db",
]

print("=" * 60)
print("Chroma 분석")
print("=" * 60)
print(f"Embedding model: {_embedding_model_name()}")
print(f"Default collection name: {_collection_name()}")
print()
print("후보 디렉토리:")
for c in CANDIDATES:
    exists = c.exists()
    has_sqlite = (c / "chroma.sqlite3").exists() if exists else False
    print(f"  {'✓' if has_sqlite else ' '} {c}  (exists={exists})")

# 실제 사용할 디렉토리 — chroma.sqlite3 가 있는 것 우선
target_dir = next((c for c in CANDIDATES if (c / "chroma.sqlite3").exists()), None)
if target_dir is None:
    print("\n[ERR] chroma.sqlite3 가 있는 디렉토리를 찾지 못함.")
    sys.exit(1)

print(f"\n분석 대상: {target_dir}")

# Chroma 열기 — collection 목록 + 각 collection 의 stats
try:
    import chromadb
except ImportError:
    print("[ERR] chromadb 가 install 안 됨. pip install chromadb 후 재실행.")
    sys.exit(1)

client = chromadb.PersistentClient(path=str(target_dir))
collections = client.list_collections()
print(f"\nCollection 수: {len(collections)}")
for c in collections:
    print(f"  - {c.name}  (count={c.count()})")

if not collections:
    print("[INFO] collection 없음.")
    sys.exit(0)

# 가장 큰 collection 분석
target_coll = max(collections, key=lambda c: c.count())
print(f"\n분석 대상 collection: {target_coll.name}  ({target_coll.count()} 청크)")
print("-" * 60)

# 모든 chunk get (embeddings 포함하면 시간 + 메모리 많이 듬, 일단 metadata + document 만)
data = target_coll.get(include=["metadatas", "documents"])
ids = data.get("ids", [])
mets = data.get("metadatas", [])
docs = data.get("documents", [])

print(f"총 청크 수: {len(ids)}")

# 청크 길이 통계 (글자 수, 토큰 근사)
lengths_chars = [len(d or "") for d in docs]
if lengths_chars:
    print(f"청크 길이 (글자수):")
    print(f"  최소 / 평균 / 최대: {min(lengths_chars)} / {sum(lengths_chars) // len(lengths_chars)} / {max(lengths_chars)}")
    # 분위수
    sorted_l = sorted(lengths_chars)
    n = len(sorted_l)
    print(f"  분위수 25/50/75/95: {sorted_l[n // 4]} / {sorted_l[n // 2]} / {sorted_l[3 * n // 4]} / {sorted_l[min(n - 1, int(n * 0.95))]}")

# metadata 필드 분포
print(f"\nmetadata 필드 사용:")
field_counter = Counter()
for m in mets:
    if m:
        for k in m.keys():
            field_counter[k] += 1
for field, count in field_counter.most_common():
    pct = 100 * count / len(mets) if mets else 0
    print(f"  {field}: {count} ({pct:.1f}%)")

# 각 metadata 필드의 값 분포 (상위 5개씩)
print(f"\nmetadata 값 분포 (상위 5개):")
for field in field_counter.keys():
    vals = [str(m.get(field, "")) for m in mets if m]
    val_counter = Counter(vals)
    print(f"  [{field}]")
    for val, count in val_counter.most_common(5):
        display = val if len(val) < 60 else val[:60] + "..."
        print(f"    {count:>5}× {display}")

# source 별 청크 수
print(f"\nsource 별 청크 수:")
src_counter = Counter()
for m in mets:
    if not m:
        continue
    src = m.get("source") or m.get("source_file") or m.get("path") or "(unknown)"
    src_counter[src] += 1
for src, count in src_counter.most_common(10):
    src_display = src if len(src) < 70 else src[:70] + "..."
    print(f"  {count:>5}× {src_display}")

# sample 청크 3개 (첫 / 중간 / 마지막)
print(f"\nsample 청크 3개:")
sample_indices = [0, len(ids) // 2, len(ids) - 1] if len(ids) >= 3 else list(range(len(ids)))
for i in sample_indices:
    print(f"\n  [{i}] id={ids[i]}")
    print(f"  metadata={mets[i]}")
    content_preview = (docs[i] or "")[:200].replace("\n", " ")
    print(f"  content (200자): {content_preview}{'...' if len(docs[i] or '') > 200 else ''}")

# 결과 JSON 으로 dump (재현 가능)
out_path = BACKEND_DIR / "scripts" / "chroma_analysis_output.json"
summary = {
    "collection_name": target_coll.name,
    "total_chunks": len(ids),
    "embedding_model": _embedding_model_name(),
    "length_stats_chars": {
        "min": min(lengths_chars) if lengths_chars else 0,
        "avg": sum(lengths_chars) // len(lengths_chars) if lengths_chars else 0,
        "max": max(lengths_chars) if lengths_chars else 0,
    },
    "metadata_fields": dict(field_counter),
    "source_breakdown": dict(src_counter),
}
out_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"\n[+] summary JSON: {out_path}")
