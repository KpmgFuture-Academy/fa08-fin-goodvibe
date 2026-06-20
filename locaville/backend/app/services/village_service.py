from __future__ import annotations

from typing import Any

from app.repositories import village_rdb


def list_villages() -> dict[str, list[dict[str, Any]]]:
    return {"items": village_rdb.list_village_catalog()}


def get_village_detail(ville_id: str) -> dict[str, Any]:
    village = village_rdb.get_village_detail(ville_id)
    if not village:
        raise LookupError(f"village not found: {ville_id}")

    groups = village_rdb.list_village_groups(ville_id)
    family_rows = village_rdb.list_village_amo_family_members(ville_id)

    families_by_regno: dict[str, dict[str, Any]] = {}
    for row in family_rows:
        amo_regno = str(row.get("amo_regno") or "").strip()
        if not amo_regno:
            continue

        family = families_by_regno.get(amo_regno)
        if not family:
            family = {
                "amo_regno": amo_regno,
                "ville_id": row.get("ville_id") or "",
                "amo_name": row.get("amo_name") or "",
                "chief_no": row.get("chief_no"),
                "chief_name": row.get("chief_name") or "",
                "zip_cd": row.get("zip_cd") or "",
                "addr_1": row.get("addr_1") or "",
                "addr_2": row.get("addr_2") or "",
                "phone_no": row.get("phone_no") or "",
                "co_regno": row.get("co_regno") or "",
                "tax_regno": row.get("tax_regno") or "",
                "reg_dt": row.get("reg_dt"),
                "reg_no": row.get("reg_no"),
                "mod_dt": row.get("mod_dt"),
                "mod_no": row.get("mod_no"),
                "farmer_count": 0,
                "members": [],
            }
            families_by_regno[amo_regno] = family

        member_user_no = row.get("member_user_no")
        if member_user_no is not None:
            family["members"].append(
                {
                    "user_no": member_user_no,
                    "user_name": row.get("member_user_name") or "",
                    "login_id": row.get("member_login_id") or "",
                    "phone_no": row.get("member_phone_no") or "",
                    "status_cd": row.get("member_status_name") or row.get("member_status_cd") or "",
                    "farmer_regno": row.get("member_farmer_regno") or "",
                }
            )

    families = list(families_by_regno.values())
    for family in families:
        family["farmer_count"] = len(family["members"])

    return {
        "village": village,
        "groups": groups,
        "families": families,
    }
