"""농가 단위 조회 저장소."""
from __future__ import annotations

from typing import Any

from locaville.dbcom import fetch_all

from app.repositories.identity_rdb import resolve_amo_regno


def list_parcels_by_farmer(farmer_id: str) -> list[dict[str, Any]]:
    """농가가 보유한 필지 목록을 반환합니다.

    `usage_label` 컬럼은 `code_detail`(grp_cd='PARCEL') JOIN 으로 한글 이름을 함께 노출.
    (예: parcel_usage='RPA' → usage_label='논'). frontend 가 raw 코드 대신 사람이 읽는 라벨을 바로 사용.
    매핑이 없으면 빈 문자열 — frontend 는 raw `parcel_usage` 로 폴백.
    """
    amo_regno = resolve_amo_regno(farmer_id)
    if not amo_regno:
        return []
    # 2026-06: parcel.gps_lat / gps_long (NUMERIC(8,5), NULL 허용) 추가 — PhotoGuardOverlay
    # 가 촬영 위치와 등록 필지 거리를 계산할 때 사용.
    sql = (
        "SELECT p.parcel_no, p.parcel_regno, p.parcel_name, p.parcel_usage, p.addr_1, p.addr_2, p.parcel_area, "
        "       p.gps_lat, p.gps_long, "
        "       cd.code_name AS usage_label "
        "FROM parcel p "
        "LEFT JOIN code_detail cd ON cd.grp_cd = 'PARCEL' AND cd.code = p.parcel_usage "
        "WHERE p.amo_regno = %s ORDER BY p.parcel_no"
    )
    rows = fetch_all(sql, [amo_regno]) or []
    return [
        {
            "parcel_no": str(row.get("parcel_no") or ""),
            "parcel_regno": row.get("parcel_regno") or "",
            # 필지 고유 이름(예: '앞논'). frontend 가 'N번 RPA' 대신 이 이름/usage_label 을 표시.
            "parcel_name": row.get("parcel_name") or "",
            "usage": row.get("parcel_usage") or "",
            "parcel_usage": row.get("parcel_usage") or "",
            "usage_label": row.get("usage_label") or "",
            "addr_1": row.get("addr_1") or "",
            "addr_2": row.get("addr_2") or "",
            "area": row.get("parcel_area"),
            "parcel_area": row.get("parcel_area"),
            # GPS 좌표 — float 정규화. NULL 이면 그대로 None → frontend 가 거리 검증 skip.
            "gps_lat": float(row["gps_lat"]) if row.get("gps_lat") is not None else None,
            "gps_long": float(row["gps_long"]) if row.get("gps_long") is not None else None,
        }
        for row in rows
    ]
