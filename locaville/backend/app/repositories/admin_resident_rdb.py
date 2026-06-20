"""이장님이 v0_chief 주민추가 모달에서 등록하는 농가 INSERT 트랜잭션.

한 transaction 안에 다음을 모두 INSERT:
  1) user_master  — placeholder (login_id/passwd NULL, status_cd='PEND' 가입대기)
  2) amo_family   — 가구(농가) master, chief_no = 위 user_no
  3) parcel       — 필지 N개 (parcel_no 1부터 자동 채번)
  4) group_member — (옵션) 단체 가입

amo_regno / user_no 모두 시드와 같은 형식 (정수 PK) — max + 1 로 채번.

graceful: 한 단계 실패하면 transaction rollback → 부분 INSERT 없음.
"""
from __future__ import annotations

from datetime import datetime, date
from typing import Any

from locaville.dbcom import execute, fetch_all, transaction


class ResidentInsertError(RuntimeError):
    """주민 등록 실패 — service 가 잡아서 400/409 로 변환."""


def _next_user_no() -> int:
    rows = fetch_all("SELECT COALESCE(MAX(user_no), 10000000) + 1 AS next FROM user_master", [])
    return int(rows[0]["next"]) if rows else 10000001


def _next_amo_regno() -> str:
    # amo_regno 는 character varying 이지만 시드는 정수 문자열 (예: "1110000001"). 같은 패턴 유지.
    rows = fetch_all(
        "SELECT COALESCE(MAX(amo_regno::bigint), 1110000000) + 1 AS next FROM amo_family",
        [],
    )
    return str(rows[0]["next"]) if rows else "1110000001"


def insert_resident(
    *,
    name: str,
    phone: str,
    ville_id: str,
    address: str,
    address_detail: str = "",
    zip_cd: str = "00000",
    parcels: list[dict[str, Any]] | None = None,
    group_no: int | None = None,
    reg_user_no: int | None = None,
) -> dict[str, Any]:
    """주민 1명 등록 트랜잭션. 생성된 amo_regno / user_no 반환.

    parcels: [{parcel_no?: int, parcel_usage?: str, parcel_area?: float, addr_2?: str, parcel_regno?: str}, ...]
      - parcel_no 없으면 1부터 자동 채번 (입력 순서대로).
    """
    if not name or not phone:
        raise ResidentInsertError("이름과 휴대폰번호는 필수입니다.")
    if not ville_id:
        raise ResidentInsertError("ville_id 가 비어 있습니다 (마을 컨텍스트 미해석).")

    user_no = _next_user_no()
    amo_regno = _next_amo_regno()
    now = datetime.now()
    reg_no = reg_user_no  # 등록한 사용자(이장님). NULL 허용.

    with transaction() as conn:
        # 1) user_master placeholder (가입 대기)
        execute(
            """
            INSERT INTO user_master (
                user_no, user_name, login_id, phone_no,
                zip_cd, addr_1, addr_2,
                auth_key, email, status_cd, passwd,
                reg_dt, reg_no
            ) VALUES (%s, %s, NULL, %s, %s, %s, %s, NULL, NULL, %s, NULL, %s, %s)
            """,
            [user_no, name, phone, zip_cd, address, address_detail, "PEND", now, reg_no],
            connection=conn,
            commit=False,
        )

        # 2) amo_family
        execute(
            """
            INSERT INTO amo_family (
                amo_regno, ville_id, amo_name, chief_no,
                zip_cd, addr_1, addr_2, phone_no,
                reg_dt, reg_no
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            [
                amo_regno, ville_id, name, user_no,
                zip_cd, address, address_detail, phone,
                now, reg_no,
            ],
            connection=conn,
            commit=False,
        )

        # 3) parcels — 입력 순서대로 1부터 채번 (parcel_no 명시되면 그것 우선)
        for index, parcel in enumerate(parcels or [], start=1):
            parcel_no = parcel.get("parcel_no") or index
            parcel_usage = str(parcel.get("parcel_usage") or parcel.get("usage") or "").strip()
            if not parcel_usage:
                continue  # 농지용도 없는 row 는 skip (UI 가 비워둔 경우)
            try:
                parcel_no_int = int(parcel_no)
            except (TypeError, ValueError):
                parcel_no_int = index
            execute(
                """
                INSERT INTO parcel (
                    amo_regno, parcel_no, parcel_name, parcel_area, parcel_usage,
                    zip_cd, addr_1, addr_2, parcel_regno,
                    reg_dt, reg_no
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                [
                    amo_regno,
                    parcel_no_int,
                    (parcel.get("parcel_name") or "").strip() or None,
                    float(parcel.get("parcel_area") or parcel.get("area") or 0),
                    parcel_usage,
                    parcel.get("zip_cd") or None,
                    parcel.get("addr_1") or None,
                    parcel.get("addr_2") or None,
                    parcel.get("parcel_regno") or None,
                    now,
                    reg_no,
                ],
                connection=conn,
                commit=False,
            )

        # 4) group_member (선택)
        if group_no:
            execute(
                """
                INSERT INTO group_member (
                    group_no, amo_regno, relation, role,
                    join_date, active_yn,
                    reg_dt, reg_no
                ) VALUES (%s, %s, NULL, %s, %s, 'Y', %s, %s)
                """,
                [int(group_no), amo_regno, "MEMBER", date.today(), now, reg_no],
                connection=conn,
                commit=False,
            )

    return {
        "amo_regno": amo_regno,
        "user_no": user_no,
        "ville_id": ville_id,
        "status_cd": "PEND",
    }


def update_resident_basic(
    *,
    amo_regno: str,
    name: str | None = None,
    phone: str | None = None,
    address: str | None = None,
    address_detail: str | None = None,
    zip_cd: str | None = None,
    mod_user_no: int | None = None,
) -> dict[str, Any]:
    """주민 기본 정보 PATCH — amo_family + 연결된 user_master (chief_no) 동기화.

    None 으로 들어온 필드는 변경하지 않음 (부분 갱신).
    필지/단체는 별도 endpoint (이번 step 에서 제외).
    매칭 row 없으면 빈 dict 반환 (router 가 404 로 변환).
    """
    rows = fetch_all(
        "SELECT amo_regno, chief_no FROM amo_family WHERE amo_regno = %s",
        [amo_regno],
    )
    if not rows:
        return {}
    chief_no = int(rows[0]["chief_no"])
    now = datetime.now()

    # amo_family 동적 UPDATE — 들어온 필드만 SET.
    family_sets: list[str] = []
    family_params: list[Any] = []
    if name is not None:
        family_sets.append("amo_name = %s"); family_params.append(name)
    if phone is not None:
        family_sets.append("phone_no = %s"); family_params.append(phone)
    if address is not None:
        family_sets.append("addr_1 = %s"); family_params.append(address)
    if address_detail is not None:
        family_sets.append("addr_2 = %s"); family_params.append(address_detail)
    if zip_cd is not None:
        family_sets.append("zip_cd = %s"); family_params.append(zip_cd)

    # user_master 동기화 — name/phone 만 (주소는 가구 단위라 user 에는 안 옮김).
    user_sets: list[str] = []
    user_params: list[Any] = []
    if name is not None:
        user_sets.append("user_name = %s"); user_params.append(name)
    if phone is not None:
        user_sets.append("phone_no = %s"); user_params.append(phone)

    with transaction() as conn:
        if family_sets:
            family_sets.extend(["mod_dt = %s", "mod_no = %s"])
            family_params.extend([now, mod_user_no, amo_regno])
            execute(
                f"UPDATE amo_family SET {', '.join(family_sets)} WHERE amo_regno = %s",
                family_params,
                connection=conn,
                commit=False,
            )
        if user_sets:
            user_sets.extend(["mod_dt = %s", "mod_no = %s"])
            user_params.extend([now, mod_user_no, chief_no])
            execute(
                f"UPDATE user_master SET {', '.join(user_sets)} WHERE user_no = %s",
                user_params,
                connection=conn,
                commit=False,
            )

    return {"amo_regno": amo_regno, "user_no": chief_no, "updated_fields": len(family_sets) + len(user_sets)}


def mark_resident_invited(
    *,
    amo_regno: str,
    mod_user_no: int | None = None,
) -> dict[str, Any]:
    """주민에게 초대 발송 표시 — user_master.status_cd 를 PEND → INV 로 변경.

    실제 SMS / 카카오 알림톡 발송은 별도 인프라 (이번 단계 X).
    이 endpoint 는 이장님이 "초대 보냈음" 을 시스템에 기록만.
    재발송도 같은 endpoint (status 가 INV 면 mod_dt 만 갱신).
    매칭 row 없으면 빈 dict 반환 (router 404).
    """
    rows = fetch_all(
        "SELECT amo_regno, chief_no FROM amo_family WHERE amo_regno = %s",
        [amo_regno],
    )
    if not rows:
        return {}
    chief_no = int(rows[0]["chief_no"])
    now = datetime.now()
    execute(
        "UPDATE user_master SET status_cd = %s, mod_dt = %s, mod_no = %s WHERE user_no = %s",
        ["INV", now, mod_user_no, chief_no],
    )
    return {"amo_regno": amo_regno, "user_no": chief_no, "status_cd": "INV", "invited_at": now.isoformat()}
