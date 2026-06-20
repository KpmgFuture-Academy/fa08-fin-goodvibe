"""JSON 파일 기반 간단한 storage 유틸.

``STORAGE_MODE=json`` 모드(마이그레이션 이전 호환용)에서 diary/evidence 가 이 모듈로
파일을 읽고 씁니다. ``STORAGE_MODE=rdb`` 에서는 사용 안 함.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def ensure_json_file(path: Path, default: Any) -> None:
    """JSON 파일이 없거나 비어 있으면 기본값으로 초기 생성합니다.

    부모 디렉토리도 함께 만듭니다. 호출 측은 이 함수 호출 후 안전하게 읽기 가능.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists() or path.stat().st_size == 0:
        save_json(path, default)


def load_json(path: Path, default: Any) -> Any:
    """JSON 읽기 공통 함수. 파일이 깨졌거나 읽기 실패 시 default 를 반환해 앱을 보호합니다.

    부수 효과: 파일이 없으면 default 로 새로 생성.
    """
    ensure_json_file(path, default)
    try:
        with path.open("r", encoding="utf-8") as file:
            return json.load(file)
    except (json.JSONDecodeError, OSError):
        return default


def save_json(path: Path, data: Any) -> None:
    """JSON 저장 공통 함수.

    한글이 깨지지 않게 ``ensure_ascii=False``, datetime 등은 ``str()`` 으로 직렬화.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as file:
        json.dump(data, file, ensure_ascii=False, indent=2, default=str)


def append_record(path: Path, record: dict[str, Any], id_key: str) -> dict[str, Any]:
    """``id_key`` 기준 upsert.

    같은 ID 의 기존 항목이 있으면 덮어쓰고, 없으면 끝에 추가. 저장된 record 를 반환.
    """
    records = load_json(path, [])
    if not isinstance(records, list):
        records = []

    record_id = record.get(id_key)
    if record_id:
        for index, item in enumerate(records):
            if isinstance(item, dict) and item.get(id_key) == record_id:
                records[index] = record
                save_json(path, records)
                return record

    records.append(record)
    save_json(path, records)
    return record
