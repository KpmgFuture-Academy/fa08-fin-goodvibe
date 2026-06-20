"""이장님 주민추가/수정/초대 서비스 (admin 측 write endpoint).

read 는 기존 `admin_service.get_admin_summary` 의 `diaries_by_farmer` 가 담당.
write 만 여기 분리:
  - create_resident: amo_family + user_master placeholder + parcel(N) + group_member(옵션)
  - (TODO step 2) update_resident: 일부 컬럼 PATCH
  - (TODO step 3) invite_resident: status_cd 변경 (실 SMS X)

frontend 가 보내는 ResidentAddModal 의 payload 모양을 그대로 받음:
  name, phone, address, addressDetail, group, project, parcelCrops[]
"""
from __future__ import annotations

from typing import Any

from app.repositories.admin_resident_rdb import (
    ResidentInsertError,
    insert_resident,
    mark_resident_invited,
    update_resident_basic,
)
from app.repositories.user_ville_rdb import DEFAULT_CHIEF_USER_NO, get_current_user_ville_info


class AdminResidentInputError(ValueError):
    """입력 검증 실패. router 가 400 으로 변환."""


def _resolve_ville_id(input_ville_id: str | None, requester_user_no: int | None) -> str:
    """payload 에 명시된 ville_id 우선, 없으면 현재 사용자 (이장님) 의 마을."""
    if input_ville_id:
        return str(input_ville_id).strip()
    info = get_current_user_ville_info(user_no=requester_user_no or DEFAULT_CHIEF_USER_NO)
    village = info.get("village") or {}
    return str(village.get("ville_id") or "").strip()


# v0_chief ResidentAddModal 의 parcelCrops → backend parcel dict 변환.
# crop (한국어 작물명) → parcel_usage 코드 매핑. backend code_detail(grp_cd='PARCEL') 의 inverse.
_CROP_TO_USAGE: dict[str, str] = {
    "벼": "RPA",
    "논": "RPA",
    "밭": "DFA",
    "콩": "DFA",
    "고추": "DFA",
    "양파": "DFA",
    "마늘": "DFA",
    "과수원": "ORC",
    "임야": "LST",
    "시설": "FRT",
}


def _crop_to_usage(crop: str) -> str:
    """frontend 의 한국어 crop → backend parcel_usage 코드. 모르는 작물은 DFA(밭) 기본."""
    key = (crop or "").strip()
    return _CROP_TO_USAGE.get(key, "DFA")


def create_resident(payload: dict[str, Any], *, requester_user_no: int | None = None) -> dict[str, Any]:
    """ResidentAddModal payload → DB INSERT.

    payload 필드 (frontend 와 일치):
      - name (str, required)
      - phone (str, required)
      - address (str), addressDetail (str)
      - villeId (str, optional) — 없으면 현재 사용자 마을
      - groupNo (int, optional) — 단체 가입
      - parcelCrops: [{parcelName, crop}, ...] — parcel_area 0 으로 일단 INSERT (수정은 PATCH 별도)
    """
    name = str(payload.get("name") or "").strip()
    phone = str(payload.get("phone") or "").strip()
    if not name or not phone:
        raise AdminResidentInputError("이름과 휴대폰번호는 필수입니다.")

    ville_id = _resolve_ville_id(payload.get("villeId"), requester_user_no)
    if not ville_id:
        raise AdminResidentInputError("마을 컨텍스트를 해석할 수 없습니다 (ville_id).")

    # parcelCrops → parcel dict 변환
    parcel_rows: list[dict[str, Any]] = []
    for raw in payload.get("parcelCrops") or []:
        parcel_name = str(raw.get("parcelName") or "").strip()
        crop = str(raw.get("crop") or "").strip()
        if not parcel_name and not crop:
            continue
        parcel_rows.append({
            "parcel_name": parcel_name or None,
            "parcel_usage": _crop_to_usage(crop),
            "parcel_area": 0,  # 면적은 PATCH 별도. 일단 0 으로 INSERT (NOT NULL).
            "addr_2": parcel_name or None,  # "1번 논" 같은 사용자 친화 이름을 addr_2 에 백업.
        })

    group_no_raw = payload.get("groupNo")
    group_no = int(group_no_raw) if group_no_raw not in (None, "", 0) else None

    try:
        result = insert_resident(
            name=name,
            phone=phone,
            ville_id=ville_id,
            address=str(payload.get("address") or "").strip() or "—",
            address_detail=str(payload.get("addressDetail") or "").strip(),
            zip_cd=str(payload.get("zipCd") or "00000").strip() or "00000",
            parcels=parcel_rows,
            group_no=group_no,
            reg_user_no=requester_user_no,
        )
    except ResidentInsertError as exc:
        raise AdminResidentInputError(str(exc)) from exc

    return {
        "amo_regno": result["amo_regno"],
        "user_no": result["user_no"],
        "ville_id": result["ville_id"],
        "status_cd": result["status_cd"],
        "name": name,
        "phone": phone,
    }


def update_resident(
    amo_regno: str,
    payload: dict[str, Any],
    *,
    requester_user_no: int | None = None,
) -> dict[str, Any] | None:
    """주민 기본 정보 PATCH.

    payload 의 들어온 필드만 변경 (None 은 무시 — 빈 문자열은 명시적 빈값으로 간주).
    매칭 row 없으면 None → router 가 404.
    필지/단체 변경은 이번 단계 X (별도 endpoint 추가 시).
    """
    name = payload.get("name")
    phone = payload.get("phone")
    address = payload.get("address")
    address_detail = payload.get("addressDetail")
    zip_cd = payload.get("zipCd")

    # 빈 문자열 trim — 사용자가 의도적으로 비웠을 수도 (예: addr_2 제거)
    def _coerce(value: Any) -> str | None:
        if value is None:
            return None
        text = str(value).strip()
        return text  # 빈 문자열도 그대로 전달 (NULL 화 의도)

    # 필수 검증 — name/phone 은 빈 값 금지 (있는 경우만).
    if name is not None and not str(name).strip():
        raise AdminResidentInputError("이름은 빈 값으로 변경할 수 없습니다.")
    if phone is not None and not str(phone).strip():
        raise AdminResidentInputError("휴대폰번호는 빈 값으로 변경할 수 없습니다.")

    result = update_resident_basic(
        amo_regno=amo_regno,
        name=_coerce(name),
        phone=_coerce(phone),
        address=_coerce(address),
        address_detail=_coerce(address_detail),
        zip_cd=_coerce(zip_cd),
        mod_user_no=requester_user_no,
    )
    if not result:
        return None
    return {"amo_regno": result["amo_regno"], "updated": True}


def invite_resident(
    amo_regno: str,
    *,
    requester_user_no: int | None = None,
) -> dict[str, Any] | None:
    """주민에게 초대 표시 — user_master.status_cd 를 'INV' 로.

    실 SMS 발송은 X (별도 인프라). 시스템 기록만.
    매칭 row 없으면 None → router 404.
    """
    result = mark_resident_invited(amo_regno=amo_regno, mod_user_no=requester_user_no)
    if not result:
        return None
    return result
