from __future__ import annotations

from typing import Any

from locaville.dbcom import fetch_all, fetch_one


def list_village_catalog() -> list[dict[str, Any]]:
    sql = """
        SELECT
            v.ville_id,
            v.ville_name,
            v.addr_1,
            v.addr_2,
            v.zip_cd,
            v.phone_no,
            v.chief_no,
            chief.user_name AS chief_name,
            COALESCE(res.resident_count, 0) AS resident_count,
            COALESCE(grp.group_count, 0) AS group_count
        FROM village v
        LEFT JOIN user_master chief
            ON chief.user_no = v.chief_no
        LEFT JOIN (
            SELECT
                ville_id,
                COUNT(DISTINCT user_no) AS resident_count
            FROM farmer
            GROUP BY ville_id
        ) res
            ON res.ville_id = v.ville_id
        LEFT JOIN (
            SELECT
                ville_id,
                COUNT(DISTINCT group_no) AS group_count
            FROM ville_group
            GROUP BY ville_id
        ) grp
            ON grp.ville_id = v.ville_id
        ORDER BY v.ville_name ASC, v.ville_id ASC
    """
    return fetch_all(sql, []) or []


def get_village_detail(ville_id: str) -> dict[str, Any] | None:
    sql = """
        SELECT
            v.ville_id,
            v.ville_name,
            v.chief_no,
            chief.user_name AS chief_name,
            v.zip_cd,
            v.addr_1,
            v.addr_2,
            v.phone_no,
            v.nx,
            v.ny,
            v.reg_dt,
            v.reg_no,
            v.mod_dt,
            v.mod_no,
            COALESCE(res.resident_count, 0) AS resident_count,
            COALESCE(grp.group_count, 0) AS group_count,
            COALESCE(fam.family_count, 0) AS family_count
        FROM village v
        LEFT JOIN user_master chief
            ON chief.user_no = v.chief_no
        LEFT JOIN (
            SELECT
                ville_id,
                COUNT(DISTINCT user_no) AS resident_count
            FROM farmer
            GROUP BY ville_id
        ) res
            ON res.ville_id = v.ville_id
        LEFT JOIN (
            SELECT
                ville_id,
                COUNT(DISTINCT group_no) AS group_count
            FROM ville_group
            GROUP BY ville_id
        ) grp
            ON grp.ville_id = v.ville_id
        LEFT JOIN (
            SELECT
                ville_id,
                COUNT(DISTINCT amo_regno) AS family_count
            FROM amo_family
            GROUP BY ville_id
        ) fam
            ON fam.ville_id = v.ville_id
        WHERE v.ville_id = %s
        LIMIT 1
    """
    return fetch_one(sql, [ville_id])


def list_village_groups(ville_id: str) -> list[dict[str, Any]]:
    sql = """
        SELECT
            vg.group_no,
            vg.group_name,
            vg.group_type_cd,
            cd.code_name AS group_type,
            vg.group_regno,
            vg.chief_no,
            chief.user_name AS chief_name,
            vg.zip_cd,
            vg.addr_1,
            vg.addr_2,
            vg.phone_no,
            vg.reg_dt,
            vg.reg_no,
            vg.mod_dt,
            vg.mod_no
        FROM ville_group vg
        LEFT JOIN user_master chief
            ON chief.user_no = vg.chief_no
        LEFT JOIN code_detail cd
            ON cd.grp_cd = 'AGRIGRUP'
           AND cd.code = vg.group_type_cd
        WHERE vg.ville_id = %s
        ORDER BY vg.group_name ASC, vg.group_no ASC
    """
    return fetch_all(sql, [ville_id]) or []


def list_village_amo_family_members(ville_id: str) -> list[dict[str, Any]]:
    sql = """
        SELECT
            a.amo_regno,
            a.ville_id,
            a.amo_name,
            a.chief_no,
            chief.user_name AS chief_name,
            a.zip_cd,
            a.addr_1,
            a.addr_2,
            a.phone_no,
            a.co_regno,
            a.tax_regno,
            a.reg_dt,
            a.reg_no,
            a.mod_dt,
            a.mod_no,
            f.user_no AS member_user_no,
            f.farmer_regno AS member_farmer_regno,
            member.user_name AS member_user_name,
            member.login_id AS member_login_id,
            member.phone_no AS member_phone_no,
            member.status_cd AS member_status_cd,
            stat_cd.code_name AS member_status_name
        FROM amo_family a
        LEFT JOIN user_master chief
            ON chief.user_no = a.chief_no
        LEFT JOIN farmer f
            ON f.amo_regno = a.amo_regno
        LEFT JOIN user_master member
            ON member.user_no = f.user_no
        LEFT JOIN code_detail stat_cd
            ON stat_cd.grp_cd = 'USERSTAT'
           AND stat_cd.code = member.status_cd
        WHERE a.ville_id = %s
        ORDER BY a.amo_name ASC, a.amo_regno ASC, member.user_name ASC, f.user_no ASC
    """
    return fetch_all(sql, [ville_id]) or []
