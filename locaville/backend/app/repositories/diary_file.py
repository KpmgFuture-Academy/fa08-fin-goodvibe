"""JSON 모드 영농일지 storage (``STORAGE_MODE=json`` 전용).

rdb 모드에서는 ``diary_rdb`` 가 대신 사용됨. 이 파일은 옛 시연
호환과 로컬 개발용. 신 시연·운영은 rdb 모드 사용 권장.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

from .json_store import append_record, load_json


# backend/data/diaries.json — 마이그레이션 이후 빈 배열로 정리됨.
DATA_PATH = Path(__file__).resolve().parents[2] / "data" / "diaries.json"


def list_diaries() -> list[dict[str, Any]]:
    """JSON 파일에서 모든 일지를 dict 리스트로 반환."""
    records = load_json(DATA_PATH, [])
    return records if isinstance(records, list) else []


def get_diary(diary_id: str) -> dict[str, Any] | None:
    """diary_id 정확 일치 한 건. 없으면 None."""
    for record in list_diaries():
        if isinstance(record, dict) and record.get("diary_id") == diary_id:
            return record
    return None


def save_diary(record: dict[str, Any]) -> dict[str, Any]:
    """diary_id upsert. 같은 ID 있으면 덮어쓰고 없으면 추가."""
    return append_record(DATA_PATH, record, id_key="diary_id")
