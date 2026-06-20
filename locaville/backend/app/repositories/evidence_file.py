"""JSON 모드 증빙 storage (``STORAGE_MODE=json`` 전용).

rdb 모드에서는 ``evidence_rdb`` 가 대신 사용됨.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

from .json_store import append_record, load_json


# backend/data/evidence.json.
DATA_PATH = Path(__file__).resolve().parents[2] / "data" / "evidence.json"


def list_evidence() -> list[dict[str, Any]]:
    """JSON 파일에서 모든 증빙을 dict 리스트로 반환."""
    records = load_json(DATA_PATH, [])
    return records if isinstance(records, list) else []


def get_evidence(evidence_id: str) -> dict[str, Any] | None:
    """evidence_id 정확 일치 한 건. 없으면 None."""
    for record in list_evidence():
        if isinstance(record, dict) and record.get("evidence_id") == evidence_id:
            return record
    return None


def save_evidence(record: dict[str, Any]) -> dict[str, Any]:
    """evidence_id upsert."""
    return append_record(DATA_PATH, record, id_key="evidence_id")
