"""스모크 테스트가 JSON 모드에서 남긴 더미 데이터를 정리하는 스크립트.

``DATA_SOURCE=json`` 모드에서 ``scripts/smoke_test_backend.py`` 가 만든 ``smoke_test_``
prefix 의 diary/evidence 항목만 골라 삭제합니다. mysql 모드는 영향 X.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any


SMOKE_PREFIX = "smoke_test_"
BACKEND_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BACKEND_DIR / "data"
DIARIES_PATH = DATA_DIR / "diaries.json"
EVIDENCE_PATH = DATA_DIR / "evidence.json"


def load_records(path: Path) -> list[dict[str, Any]]:
    if not path.exists() or path.stat().st_size == 0:
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        raise RuntimeError(f"Invalid JSON: {path}")
    if not isinstance(data, list):
        raise RuntimeError(f"Expected JSON array: {path}")
    return [item for item in data if isinstance(item, dict)]


def save_records(path: Path, records: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(records, ensure_ascii=False, indent=2, default=str) + "\n", encoding="utf-8")


def starts_with_smoke(value: Any) -> bool:
    return isinstance(value, str) and value.startswith(SMOKE_PREFIX)


def cleanup() -> dict[str, int]:
    diaries = load_records(DIARIES_PATH)
    evidence = load_records(EVIDENCE_PATH)

    kept_evidence = [record for record in evidence if not starts_with_smoke(record.get("evidence_id"))]
    removed_evidence_count = len(evidence) - len(kept_evidence)

    kept_diaries: list[dict[str, Any]] = []
    removed_diaries_count = 0
    cleaned_link_refs = 0

    for record in diaries:
        if starts_with_smoke(record.get("diary_id")):
            removed_diaries_count += 1
            continue

        linked_ids = record.get("linked_evidence_ids")
        if isinstance(linked_ids, list):
            cleaned_ids = [item for item in linked_ids if not starts_with_smoke(item)]
            cleaned_link_refs += len(linked_ids) - len(cleaned_ids)
            record = {**record, "linked_evidence_ids": cleaned_ids}
        kept_diaries.append(record)

    save_records(DIARIES_PATH, kept_diaries)
    save_records(EVIDENCE_PATH, kept_evidence)

    return {
        "removed_diaries": removed_diaries_count,
        "removed_evidence": removed_evidence_count,
        "cleaned_linked_evidence_refs": cleaned_link_refs,
        "remaining_diaries": len(kept_diaries),
        "remaining_evidence": len(kept_evidence),
    }


def main() -> int:
    result = cleanup()
    print(f"Removed diaries: {result['removed_diaries']}")
    print(f"Removed evidence: {result['removed_evidence']}")
    print(f"Cleaned linked evidence refs: {result['cleaned_linked_evidence_refs']}")
    print(f"Remaining diaries: {result['remaining_diaries']}")
    print(f"Remaining evidence: {result['remaining_evidence']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
