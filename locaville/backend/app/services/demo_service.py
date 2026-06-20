"""Legacy demo seed for the chief dashboard (STORAGE_MODE=json 모드 전용).

이 시드는 옛 JSON 데이터 소스(`backend/data/diaries.json`, `evidence.json`) 와 함께 사용되며,
신 RDB 스키마(seed v2)와는 식별자 체계가 다릅니다. 신 시연은 `STORAGE_MODE=rdb` 로 띄우고
시드 `locaville_jeotan_seed_v2_parcel_int.sql` 의 데이터를 사용하세요.

이 파일의 ``farmer_id`` (U002 / U003 / U004) 는 신 스키마의 user_master / amo_family 에
존재하지 않습니다. rdb 모드에서 새로 들어오는 저장 요청은 누락된 ``farmer_id`` 를
조용히 U002 로 대체하지 않고 ``422`` 로 거절합니다.

신 시연 기준 농가:
  - login_id = ``ys.kim`` / user_no = 1000000101 / amo_regno = AMOJT002 (김영수)
  - 그룹: group_no = 10001 (저탄반, ville_id = VILLEJT001)
  - 사업: PRJ2026LC (저탄소), PRJ2026PUB (공익직불)
"""

from __future__ import annotations

from datetime import date, datetime

from app.repositories.diary_file import DATA_PATH as DIARIES_PATH
from app.repositories.evidence_file import DATA_PATH as EVIDENCE_PATH
from app.repositories.json_store import load_json, save_json


SEED_DIARY_IDS = {
    "diary_seed_001",
    "diary_seed_002",
    "diary_seed_003",
}
SEED_EVIDENCE_IDS = {
    "evidence_seed_001",
    "evidence_seed_002",
    "evidence_seed_003",
}


def _today() -> str:
    # 시연 데이터 날짜를 오늘 기준으로 맞추기 위한 헬퍼입니다.
    return date.today().isoformat()


def _now() -> str:
    # created_at/updated_at에 넣을 현재 시각 문자열입니다.
    return datetime.now().isoformat()


def _build_seed_diaries() -> list[dict[str, object]]:
    # 시연용 일지 샘플 데이터를 구성합니다.
    today = _today()
    now = _now()
    return [
        {
            "diary_id": "diary_seed_001",
            "project_id": "demo_jeotanmaeul_2026",
            "farmer_id": "U002",
            "farmer_name": "김영수",
            "worker_name": "김영수",
            "work_date": today,
            "field_id": "JT-RICE-03",
            "field_address": "저탄마을 3번 논",
            "crop_name": "벼",
            "work_stage": "물관리",
            "work_stage_detail": "중간 물떼기 시작",
            "work_detail": "3번 논에서 중간 물떼기 시작 작업을 기록함.",
            "linked_evidence_ids": ["evidence_seed_001"],
            "status": "saved",
            "created_at": now,
            "updated_at": now,
        },
        {
            "diary_id": "diary_seed_002",
            "project_id": "demo_jeotanmaeul_2026",
            "farmer_id": "U003",
            "farmer_name": "이순자",
            "worker_name": "이순자",
            "work_date": today,
            "field_id": "JT-RICE-01",
            "field_address": "저탄마을 1번 논",
            "crop_name": "벼",
            "work_stage": "저탄소 활동",
            "work_stage_detail": "바이오차 투입",
            "work_detail": "1번 논에 바이오차 포대 투입 전 증빙을 등록함.",
            "linked_evidence_ids": ["evidence_seed_002"],
            "status": "saved",
            "created_at": now,
            "updated_at": now,
        },
        {
            "diary_id": "diary_seed_003",
            "project_id": "demo_jeotanmaeul_2026",
            "farmer_id": "U004",
            "farmer_name": "박민호",
            "worker_name": "박민호",
            "work_date": today,
            "field_id": "JT-SOY-01",
            "field_address": "저탄마을 콩밭 1구역",
            "crop_name": "콩",
            "work_stage": "폐기물 처리",
            "work_stage_detail": "폐비닐 정리",
            "work_detail": "밭 주변 폐비닐을 수거하고 정리함.",
            "linked_evidence_ids": [],
            "status": "saved",
            "created_at": now,
            "updated_at": now,
        },
    ]


def _build_seed_evidence() -> list[dict[str, object]]:
    # 시연용 증빙 샘플 데이터를 구성합니다.
    now = _now()
    return [
        {
            "evidence_id": "evidence_seed_001",
            "todo_id": "",
            "project_id": "demo_jeotanmaeul_2026",
            "farmer_id": "U002",
            "field_id": "JT-RICE-03",
            "activity_type": "중간 물떼기",
            "evidence_type": "MID_DRAINAGE_START",
            "confirmed_label": "MID_DRAINAGE_START",
            "image_url": "",
            "captured_at": now,
            "status": "confirmed",
            "user_message": "중간 물떼기 시작 증빙사진이 확인되었습니다.",
            "created_at": now,
            "updated_at": now,
        },
        {
            "evidence_id": "evidence_seed_002",
            "todo_id": "",
            "project_id": "demo_jeotanmaeul_2026",
            "farmer_id": "U003",
            "field_id": "JT-RICE-01",
            "activity_type": "바이오차 투입",
            "evidence_type": "BIOCHAR_BAG",
            "confirmed_label": "BIOCHAR_BAG",
            "image_url": "",
            "captured_at": now,
            "status": "needs_review",
            "user_message": "바이오차 포대 증빙 확인이 필요합니다.",
            "created_at": now,
            "updated_at": now,
        },
        {
            "evidence_id": "evidence_seed_003",
            "todo_id": "",
            "project_id": "demo_jeotanmaeul_2026",
            "farmer_id": "U004",
            "field_id": "JT-SOY-01",
            "activity_type": "폐기물 처리",
            "evidence_type": "WASTE_COLLECTION",
            "confirmed_label": "",
            "image_url": "",
            "captured_at": now,
            "status": "needs_review",
            "user_message": "폐기물 처리 증빙 검토가 필요합니다.",
            "created_at": now,
            "updated_at": now,
        },
    ]


def _upsert_records(
    path,
    records: list[dict[str, object]],
    id_key: str,
) -> tuple[int, int]:
    # 같은 ID가 있으면 업데이트, 없으면 생성하는 공통 유틸입니다.
    existing = load_json(path, [])
    if not isinstance(existing, list):
        existing = []

    index_by_id = {
        item.get(id_key): idx
        for idx, item in enumerate(existing)
        if isinstance(item, dict) and item.get(id_key)
    }

    created = 0
    updated = 0
    for record in records:
        record_id = record[id_key]
        if record_id in index_by_id:
            original = existing[index_by_id[record_id]]
            if isinstance(original, dict) and original.get("created_at"):
                record["created_at"] = original["created_at"]
            existing[index_by_id[record_id]] = record
            updated += 1
        else:
            existing.append(record)
            created += 1

    save_json(path, existing)
    return created, updated


def reset_demo_data() -> dict[str, object]:
    """``POST /demo/reset`` — JSON 모드 diary/evidence 저장 파일을 빈 배열로 초기화.

    mysql 모드 데이터는 손대지 않습니다. 시연 직전 깨끗한 상태로 돌리기 위한 용도.
    """
    save_json(DIARIES_PATH, [])
    save_json(EVIDENCE_PATH, [])
    return {
        "status": "success",
        "message": "Demo data reset completed",
        "diaries_count": 0,
        "evidence_count": 0,
    }


def seed_demo_data() -> dict[str, object]:
    """``POST /demo/seed`` — JSON 모드 저장소에 legacy 시드 샘플 데이터를 채움.

    같은 diary_id/evidence_id 가 이미 있으면 upsert (덮어쓰기). mysql 모드는 영향 X.
    """
    created_diaries, updated_diaries = _upsert_records(
        DIARIES_PATH,
        _build_seed_diaries(),
        "diary_id",
    )
    created_evidence, updated_evidence = _upsert_records(
        EVIDENCE_PATH,
        _build_seed_evidence(),
        "evidence_id",
    )
    return {
        "status": "success",
        "message": "Demo seed completed",
        "created_diaries": created_diaries,
        "updated_diaries": updated_diaries,
        "created_evidence": created_evidence,
        "updated_evidence": updated_evidence,
    }


def get_demo_status() -> dict[str, object]:
    """``GET /demo/status`` — 현재 JSON 저장소의 diary/evidence 갯수 + seed 존재 여부."""
    diaries = load_json(DIARIES_PATH, [])
    evidence = load_json(EVIDENCE_PATH, [])
    diary_ids = {
        item.get("diary_id")
        for item in diaries
        if isinstance(item, dict) and item.get("diary_id")
    }
    evidence_ids = {
        item.get("evidence_id")
        for item in evidence
        if isinstance(item, dict) and item.get("evidence_id")
    }
    return {
        "diaries_count": len(diaries) if isinstance(diaries, list) else 0,
        "evidence_count": len(evidence) if isinstance(evidence, list) else 0,
        "seed_exists": bool(diary_ids & SEED_DIARY_IDS or evidence_ids & SEED_EVIDENCE_IDS),
    }
