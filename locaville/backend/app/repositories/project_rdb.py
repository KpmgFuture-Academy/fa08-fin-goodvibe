"""마을·그룹의 참여 사업/활동 목록 조회 저장소."""
from __future__ import annotations

import json
from decimal import Decimal, InvalidOperation
from typing import Any

from locaville.dbcom import execute, executemany, fetch_all, fetch_one


DISPLAY_SUBSIDY_MULTIPLIER = Decimal("10000")


def _normalize_subsidy_value(value: Any) -> Decimal | None:
    if value is None:
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return None


def _to_display_subsidy(value: Any) -> float:
    subsidy = _normalize_subsidy_value(value)
    if subsidy is None:
        return 0
    return float(subsidy * DISPLAY_SUBSIDY_MULTIPLIER)


def _normalize_json_object(value: Any) -> dict[str, Any] | None:
    if value is None:
        return None
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            return None
        return parsed if isinstance(parsed, dict) else None
    return None


def list_projects_with_activities(
    group_no: int | None = None,
    ville_id: str | None = None,
    farmer_id: str | None = None,
) -> list[dict[str, Any]]:
    """그룹(또는 마을·농가)이 등록된 사업 목록을 활동과 함께 반환합니다."""
    farmer_group_nos: list[int] = []
    if farmer_id and group_no is None:
        from app.repositories.identity_rdb import resolve_group_nos_by_farmer_id

        farmer_group_nos = resolve_group_nos_by_farmer_id(farmer_id) or []

    where: list[str] = []
    params: list[Any] = []
    if group_no is not None:
        where.append("pg.group_no = %s")
        params.append(int(group_no))
    elif farmer_group_nos:
        placeholders = ",".join(["%s"] * len(farmer_group_nos))
        where.append(f"pg.group_no IN ({placeholders})")
        params.extend(int(item) for item in farmer_group_nos)
    if ville_id:
        where.append("pg.ville_id = %s")
        params.append(ville_id)
    if not where:
        return []

    proj_sql = f"""
        SELECT
            p.prj_id,
            p.prj_name,
            p.exec_year,
            pm.biz_name,
            pg.group_no,
            pg.ville_id,
            vg.group_name
        FROM prj_grp pg
        JOIN project p ON p.prj_id = pg.prj_id
        LEFT JOIN program_master pm ON pm.biz_id = p.biz_id
        LEFT JOIN ville_group vg ON vg.group_no = pg.group_no
        WHERE {' AND '.join(where)}
        ORDER BY p.exec_year DESC, p.prj_id
    """
    projects = fetch_all(proj_sql, params) or []
    if not projects:
        return []

    prj_ids = [project["prj_id"] for project in projects]
    placeholders = ",".join(["%s"] * len(prj_ids))
    act_sql = f"""
        SELECT prj_id, activity_id, activity_name, est_start_date, est_end_date
        FROM prj_activity
        WHERE prj_id IN ({placeholders})
        ORDER BY prj_id, activity_id
    """
    activities = fetch_all(act_sql, prj_ids) or []
    by_prj: dict[str, list[dict[str, Any]]] = {}
    for activity in activities:
        by_prj.setdefault(str(activity["prj_id"]), []).append(
            {
                "activity_id": activity["activity_id"],
                "activity_name": activity["activity_name"],
                "start_date": activity["est_start_date"].isoformat() if activity.get("est_start_date") else None,
                "end_date": activity["est_end_date"].isoformat() if activity.get("est_end_date") else None,
            }
        )

    items: list[dict[str, Any]] = []
    for project in projects:
        items.append(
            {
                "prj_id": project["prj_id"],
                "project_id": project["prj_id"],
                "prj_name": project.get("prj_name") or "",
                "exec_year": project.get("exec_year"),
                "biz_name": project.get("biz_name") or "",
                "group_no": int(project["group_no"]) if project.get("group_no") is not None else None,
                "group_name": project.get("group_name") or "",
                "ville_id": project.get("ville_id") or "",
                "activities": by_prj.get(str(project["prj_id"]), []),
            }
        )
    return items


def _list_activities_by_project_ids(prj_ids: list[str]) -> dict[str, list[dict[str, Any]]]:
    if not prj_ids:
        return {}

    placeholders = ",".join(["%s"] * len(prj_ids))
    act_sql = f"""
        SELECT prj_id, activity_id, activity_name, est_start_date, est_end_date, subsidy_amt
        FROM prj_activity
        WHERE prj_id IN ({placeholders})
        ORDER BY prj_id, activity_id
    """
    activities = fetch_all(act_sql, prj_ids) or []
    by_prj: dict[str, list[dict[str, Any]]] = {}
    for activity in activities:
        by_prj.setdefault(str(activity["prj_id"]), []).append(
            {
                "prj_id": str(activity.get("prj_id") or ""),
                "activity_id": str(activity.get("activity_id") or ""),
                "activity_name": str(activity.get("activity_name") or ""),
                "est_start_date": activity["est_start_date"].isoformat() if activity.get("est_start_date") else None,
                "est_end_date": activity["est_end_date"].isoformat() if activity.get("est_end_date") else None,
                "subsidy_amt": float(_normalize_subsidy_value(activity.get("subsidy_amt")) or 0)
                if activity.get("subsidy_amt") is not None
                else None,
                "subsidy_amt_display": _to_display_subsidy(activity.get("subsidy_amt")),
                "target_parcel_codes": [],
                "target_parcels": [],
                "target_parcel_names": None,
            }
        )
    return by_prj


def _serialize_project_row(
    row: dict[str, Any],
    activities_by_prj: dict[str, list[dict[str, Any]]],
) -> dict[str, Any]:
    prj_id = str(row.get("prj_id") or "").strip()
    activities = activities_by_prj.get(prj_id, [])
    return {
        "prj_id": prj_id,
        "project_id": prj_id,
        "prj_name": str(row.get("prj_name") or "").strip(),
        "exec_year": row.get("exec_year"),
        "biz_id": str(row.get("biz_id") or "").strip(),
        "biz_name": str(row.get("biz_name") or "").strip(),
        "post_date": row["post_date"].isoformat() if row.get("post_date") else None,
        "issuer": str(row.get("issuer") or "").strip() or None,
        "rag_file_id": str(row.get("rag_file_id") or "").strip() or None,
        "activity_count": len(activities),
        "activities": activities,
    }


def list_project_catalog() -> list[dict[str, Any]]:
    sql = """
        SELECT
            p.prj_id,
            p.prj_name,
            p.exec_year,
            p.biz_id,
            pm.biz_name,
            p.post_date,
            p.issuer,
            p.rag_file_id
        FROM project p
        LEFT JOIN program_master pm ON pm.biz_id = p.biz_id
        ORDER BY p.exec_year DESC, p.post_date DESC, p.prj_id
    """
    projects = fetch_all(sql, []) or []
    activities_by_prj = _list_activities_by_project_ids(
        [str(project.get("prj_id") or "").strip() for project in projects if project.get("prj_id")]
    )
    return [_serialize_project_row(project, activities_by_prj) for project in projects]


def get_project_catalog_detail(prj_id: str) -> dict[str, Any] | None:
    sql = """
        SELECT
            p.prj_id,
            p.prj_name,
            p.exec_year,
            p.biz_id,
            pm.biz_name,
            p.post_date,
            p.issuer,
            p.rag_file_id
        FROM project p
        LEFT JOIN program_master pm ON pm.biz_id = p.biz_id
        WHERE p.prj_id = %s
    """
    row = fetch_all(sql, [prj_id]) or []
    if not row:
        return None
    activities_by_prj = _list_activities_by_project_ids([prj_id])
    return _serialize_project_row(row[0], activities_by_prj)


def update_project_info(
    prj_id: str,
    prj_name: str,
    exec_year: int | None,
    biz_id: str,
    post_date: Any,
    issuer: str | None,
    rag_file_id: str | None,
    mod_no: int,
    connection: Any,
) -> int:
    sql = """
        UPDATE project
        SET prj_name = %s,
            exec_year = %s,
            biz_id = %s,
            post_date = %s,
            issuer = %s,
            rag_file_id = %s,
            mod_dt = CURRENT_TIMESTAMP,
            mod_no = %s
        WHERE prj_id = %s
    """
    return execute(
        sql,
        [prj_name, exec_year, biz_id, post_date, issuer, rag_file_id, mod_no, prj_id],
        connection=connection,
        commit=False,
    )


def delete_project(prj_id: str, connection: Any) -> int:
    return execute(
        """
        DELETE FROM project
        WHERE prj_id = %s
        """,
        [prj_id],
        connection=connection,
        commit=False,
    )


def count_project_group_links(prj_id: str) -> int:
    row = fetch_one(
        """
        SELECT COUNT(*) AS link_count
        FROM prj_grp
        WHERE prj_id = %s
        """,
        [prj_id],
    ) or {}
    return int(row.get("link_count") or 0)


def delete_project_jobs_by_project(prj_id: str, connection: Any) -> int:
    return execute(
        """
        DELETE FROM prj_job
        WHERE prj_id = %s
        """,
        [prj_id],
        connection=connection,
        commit=False,
    )


def delete_project_activity_parcels_by_project(prj_id: str, connection: Any) -> int:
    return execute(
        """
        DELETE FROM prj_act_parcel
        WHERE prj_id = %s
        """,
        [prj_id],
        connection=connection,
        commit=False,
    )


def delete_project_activities_by_project(prj_id: str, connection: Any) -> int:
    return execute(
        """
        DELETE FROM prj_activity
        WHERE prj_id = %s
        """,
        [prj_id],
        connection=connection,
        commit=False,
    )


def list_project_detail_activities(prj_id: str) -> list[dict[str, Any]]:
    sql = """
        SELECT
            pa.prj_id,
            pa.activity_id,
            pa.activity_name,
            pa.activity_rule,
            pa.description,
            pa.est_start_date,
            pa.est_end_date,
            pa.subsidy_amt,
            pap.code,
            cd.code_name
        FROM prj_activity pa
        LEFT JOIN prj_act_parcel pap
            ON pap.prj_id = pa.prj_id
           AND pap.activity_id = pa.activity_id
           AND pap.grp_cd = %s
        LEFT JOIN code_detail cd
            ON cd.grp_cd = pap.grp_cd
           AND cd.code = pap.code
        WHERE pa.prj_id = %s
        ORDER BY pa.activity_id, cd.sort_order, pap.code
    """
    rows = fetch_all(sql, ["PARCEL", prj_id]) or []
    if not rows:
        return []

    by_activity: dict[str, dict[str, Any]] = {}
    for row in rows:
        activity_id = str(row.get("activity_id") or "").strip()
        if not activity_id:
            continue
        item = by_activity.get(activity_id)
        if item is None:
            subsidy_amt = _normalize_subsidy_value(row.get("subsidy_amt"))
            item = {
                "prj_id": str(row.get("prj_id") or "").strip(),
                "activity_id": activity_id,
                "activity_name": str(row.get("activity_name") or "").strip(),
                "activity_rule": _normalize_json_object(row.get("activity_rule")),
                "description": str(row.get("description") or "").strip() or None,
                "est_start_date": row["est_start_date"].isoformat() if row.get("est_start_date") else None,
                "est_end_date": row["est_end_date"].isoformat() if row.get("est_end_date") else None,
                "subsidy_amt": float(subsidy_amt or 0) if subsidy_amt is not None else None,
                "subsidy_amt_display": _to_display_subsidy(subsidy_amt),
                "source_flag": "db_registered",
                "target_parcel_codes": [],
                "target_parcels": [],
                "target_parcel_names": None,
            }
            by_activity[activity_id] = item

        code = str(row.get("code") or "").strip()
        if code and code not in item["target_parcel_codes"]:
            item["target_parcel_codes"].append(code)
        code_name = str(row.get("code_name") or "").strip()
        if code_name and code_name not in item["target_parcels"]:
            item["target_parcels"].append(code_name)

    items = list(by_activity.values())
    for item in items:
        item["target_parcel_names"] = ", ".join(item["target_parcels"]) if item["target_parcels"] else None
    return items


def list_parcel_code_options() -> list[dict[str, Any]]:
    sql = """
        SELECT code, code_name
        FROM code_detail
        WHERE grp_cd = %s
        ORDER BY sort_order, code
    """
    return fetch_all(sql, ["PARCEL"]) or []


def list_exec_point_code_options() -> list[dict[str, Any]]:
    sql = """
        SELECT code, code_name
        FROM code_detail
        WHERE grp_cd = %s
        ORDER BY sort_order, code
    """
    return fetch_all(sql, ["EXECTIME"]) or []


def list_farm_job_options() -> list[dict[str, Any]]:
    sql = """
        SELECT job_cd, job_name
        FROM farm_job
        WHERE job_cd IS NOT NULL
        ORDER BY job_cd
    """
    return fetch_all(sql, []) or []


def list_farm_job_catalog() -> list[dict[str, Any]]:
    sql = """
        SELECT
            job_cd,
            job_name,
            job_desc,
            job_cat,
            start_mmdd,
            end_mmdd
        FROM farm_job
        WHERE job_cd IS NOT NULL
        ORDER BY job_cd
    """
    return fetch_all(sql, []) or []


def list_project_jobs(prj_id: str) -> list[dict[str, Any]]:
    sql = """
        SELECT
            pj.prj_id,
            pj.activity_id,
            pa.activity_name,
            pj.job_seq,
            pj.job_cd,
            fj.job_name,
            pj.exec_point_cd,
            exec_cd.code_name AS exec_point_name,
            pj.ref_job_cd,
            ref_fj.job_name AS ref_job_name,
            pj.est_start_date,
            pj.start_date_rule,
            pj.est_end_date,
            pj.end_date_rule,
            pj.mandatory_yn,
            pj.evidence_yn
        FROM prj_job pj
        LEFT JOIN prj_activity pa
            ON pa.prj_id = pj.prj_id
           AND pa.activity_id = pj.activity_id
        LEFT JOIN farm_job fj
            ON fj.job_cd = pj.job_cd
        LEFT JOIN farm_job ref_fj
            ON ref_fj.job_cd = pj.ref_job_cd
        LEFT JOIN code_detail exec_cd
            ON exec_cd.code = pj.exec_point_cd
           AND exec_cd.grp_cd = 'EXECTIME'
        WHERE pj.prj_id = %s
        ORDER BY pa.activity_name, pj.activity_id, pj.job_seq
    """
    rows = fetch_all(sql, [prj_id]) or []
    activity_parcel_map = {
        str(item.get("activity_id") or "").strip(): {
            "target_parcel_codes": list(item.get("target_parcel_codes") or []),
            "target_parcels": list(item.get("target_parcels") or []),
            "target_parcel_names": item.get("target_parcel_names"),
        }
        for item in list_project_detail_activities(prj_id)
        if str(item.get("activity_id") or "").strip()
    }
    items: list[dict[str, Any]] = []
    for row in rows:
        activity_id = str(row.get("activity_id") or "").strip()
        parcel_meta = activity_parcel_map.get(
            activity_id,
            {
                "target_parcel_codes": [],
                "target_parcels": [],
                "target_parcel_names": None,
            },
        )
        items.append(
            {
                "prj_id": str(row.get("prj_id") or "").strip(),
                "activity_id": activity_id,
                "activity_name": str(row.get("activity_name") or "").strip(),
                "job_seq": int(row.get("job_seq") or 0),
                "job_cd": str(row.get("job_cd") or "").strip(),
                "job_name": str(row.get("job_name") or "").strip() or None,
                "exec_point_cd": str(row.get("exec_point_cd") or "").strip() or None,
                "exec_point_name": str(row.get("exec_point_name") or "").strip() or None,
                "ref_job_cd": str(row.get("ref_job_cd") or "").strip() or None,
                "ref_job_name": str(row.get("ref_job_name") or "").strip() or None,
                "est_start_date": row["est_start_date"].isoformat() if row.get("est_start_date") else None,
                "start_date_rule": str(row.get("start_date_rule") or "").strip() or None,
                "est_end_date": row["est_end_date"].isoformat() if row.get("est_end_date") else None,
                "end_date_rule": str(row.get("end_date_rule") or "").strip() or None,
                "mandatory_yn": str(row.get("mandatory_yn") or "").strip() or None,
                "evidence_yn": str(row.get("evidence_yn") or "").strip() or None,
                "target_parcel_codes": parcel_meta["target_parcel_codes"],
                "target_parcels": parcel_meta["target_parcels"],
                "target_parcel_names": parcel_meta["target_parcel_names"],
            }
        )
    return items


def get_project_activity(prj_id: str, activity_id: str) -> dict[str, Any] | None:
    sql = """
        SELECT prj_id, activity_id, activity_name, activity_rule, description
        FROM prj_activity
        WHERE prj_id = %s
          AND activity_id = %s
        LIMIT 1
    """
    row = fetch_one(sql, [prj_id, activity_id])
    if not row:
        return None
    item = dict(row)
    item["activity_rule"] = _normalize_json_object(row.get("activity_rule"))
    return item


def insert_project_activity(
    prj_id: str,
    activity_id: str,
    activity_name: str,
    activity_rule: dict[str, Any] | None,
    description: str | None,
    est_start_date: Any,
    est_end_date: Any,
    subsidy_amt: Decimal,
    reg_no: int,
    connection: Any,
) -> int:
    sql = """
        INSERT INTO prj_activity (
            activity_id, prj_id, activity_name, activity_rule, description, est_start_date, est_end_date, subsidy_amt, reg_no
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
    """
    return execute(
        sql,
        [
            activity_id,
            prj_id,
            activity_name,
            json.dumps(activity_rule, ensure_ascii=False) if activity_rule is not None else None,
            description,
            est_start_date,
            est_end_date,
            subsidy_amt,
            reg_no,
        ],
        connection=connection,
        commit=False,
    )


def update_project_activity_info(
    prj_id: str,
    activity_id: str,
    activity_name: str,
    activity_rule: dict[str, Any] | None,
    description: str | None,
    est_start_date: Any,
    est_end_date: Any,
    subsidy_amt: Decimal,
    mod_no: int,
    connection: Any,
) -> int:
    sql = """
        UPDATE prj_activity
        SET activity_name = %s,
            activity_rule = %s,
            description = %s,
            est_start_date = %s,
            est_end_date = %s,
            subsidy_amt = %s,
            mod_dt = CURRENT_TIMESTAMP,
            mod_no = %s
        WHERE prj_id = %s
          AND activity_id = %s
    """
    return execute(
        sql,
        [
            activity_name,
            json.dumps(activity_rule, ensure_ascii=False) if activity_rule is not None else None,
            description,
            est_start_date,
            est_end_date,
            subsidy_amt,
            mod_no,
            prj_id,
            activity_id,
        ],
        connection=connection,
        commit=False,
    )


def delete_project_activity_parcel_codes(
    prj_id: str,
    activity_id: str,
    grp_cd: str,
    connection: Any,
) -> int:
    sql = """
        DELETE FROM prj_act_parcel
        WHERE prj_id = %s
          AND activity_id = %s
          AND grp_cd = %s
    """
    return execute(sql, [prj_id, activity_id, grp_cd], connection=connection, commit=False)


def delete_project_jobs_by_activity(
    prj_id: str,
    activity_id: str,
    connection: Any,
) -> int:
    sql = """
        DELETE FROM prj_job
        WHERE prj_id = %s
          AND activity_id = %s
    """
    return execute(sql, [prj_id, activity_id], connection=connection, commit=False)


def delete_project_activity(
    prj_id: str,
    activity_id: str,
    connection: Any,
) -> int:
    sql = """
        DELETE FROM prj_activity
        WHERE prj_id = %s
          AND activity_id = %s
    """
    return execute(sql, [prj_id, activity_id], connection=connection, commit=False)


def insert_project_activity_parcel_codes(
    prj_id: str,
    activity_id: str,
    grp_cd: str,
    parcel_codes: list[str],
    reg_no: int,
    connection: Any,
) -> int:
    if not parcel_codes:
        return 0
    params_list = [[prj_id, activity_id, code, grp_cd, reg_no] for code in parcel_codes]
    sql = """
        INSERT INTO prj_act_parcel (
            prj_id, activity_id, code, grp_cd, reg_no
        ) VALUES (%s, %s, %s, %s, %s)
    """
    return executemany(sql, params_list, connection=connection, commit=False)


def get_project_job(prj_id: str, activity_id: str, job_seq: int) -> dict[str, Any] | None:
    sql = """
        SELECT prj_id, activity_id, job_seq, job_cd
        FROM prj_job
        WHERE prj_id = %s
          AND activity_id = %s
          AND job_seq = %s
        LIMIT 1
    """
    return fetch_one(sql, [prj_id, activity_id, job_seq])


def get_next_project_job_seq(prj_id: str, activity_id: str) -> int:
    row = fetch_one(
        """
        SELECT COALESCE(MAX(job_seq), 0) + 1 AS next_job_seq
        FROM prj_job
        WHERE prj_id = %s
          AND activity_id = %s
        """,
        [prj_id, activity_id],
    ) or {}
    return int(row.get("next_job_seq") or 1)


def insert_project_job(
    prj_id: str,
    activity_id: str,
    job_seq: int,
    job_cd: str,
    exec_point_cd: str | None,
    ref_job_cd: str | None,
    est_start_date: Any,
    start_date_rule: str | None,
    est_end_date: Any,
    end_date_rule: str | None,
    mandatory_yn: str | None,
    evidence_yn: str | None,
    reg_no: int,
    connection: Any,
) -> int:
    sql = """
        INSERT INTO prj_job (
            prj_id,
            activity_id,
            job_seq,
            job_cd,
            exec_point_cd,
            ref_job_cd,
            start_date_rule,
            end_date_rule,
            est_start_date,
            est_end_date,
            mandatory_yn,
            evidence_yn,
            reg_no
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """
    return execute(
        sql,
        [
            prj_id,
            activity_id,
            job_seq,
            job_cd,
            exec_point_cd,
            ref_job_cd,
            start_date_rule,
            end_date_rule,
            est_start_date,
            est_end_date,
            mandatory_yn,
            evidence_yn,
            reg_no,
        ],
        connection=connection,
        commit=False,
    )


def update_project_job(
    prj_id: str,
    activity_id: str,
    job_seq: int,
    job_cd: str,
    exec_point_cd: str | None,
    ref_job_cd: str | None,
    est_start_date: Any,
    start_date_rule: str | None,
    est_end_date: Any,
    end_date_rule: str | None,
    mandatory_yn: str | None,
    evidence_yn: str | None,
    mod_no: int,
    connection: Any,
) -> int:
    sql = """
        UPDATE prj_job
        SET job_cd = %s,
            exec_point_cd = %s,
            ref_job_cd = %s,
            start_date_rule = %s,
            end_date_rule = %s,
            est_start_date = %s,
            est_end_date = %s,
            mandatory_yn = %s,
            evidence_yn = %s,
            mod_dt = CURRENT_TIMESTAMP,
            mod_no = %s
        WHERE prj_id = %s
          AND activity_id = %s
          AND job_seq = %s
    """
    return execute(
        sql,
        [
            job_cd,
            exec_point_cd,
            ref_job_cd,
            start_date_rule,
            end_date_rule,
            est_start_date,
            est_end_date,
            mandatory_yn,
            evidence_yn,
            mod_no,
            prj_id,
            activity_id,
            job_seq,
        ],
        connection=connection,
        commit=False,
    )


def delete_project_job(
    prj_id: str,
    activity_id: str,
    job_seq: int,
    connection: Any,
) -> int:
    sql = """
        DELETE FROM prj_job
        WHERE prj_id = %s
          AND activity_id = %s
          AND job_seq = %s
    """
    return execute(sql, [prj_id, activity_id, job_seq], connection=connection, commit=False)


# ============================================================
# 사업(program_master) + 프로젝트(project) 신규 등록
# ------------------------------------------------------------
# 시연 단계 — 사업명·연도·시행기관·목적(=biz_overview) 정도만 저장. 기타 메타
# (대상작물·지역·예산·문의처 등) 는 별도 컬럼이 없어 RAG (pgvector) 에서만 보존.
# ============================================================


def get_next_prj_id() -> str:
    """가장 큰 'PRJ' 접두 ID + 1 → 6자리 zero-padded. 비어있으면 PRJ000001."""
    row = fetch_one(
        """
        SELECT prj_id
        FROM project
        WHERE prj_id LIKE 'PRJ%%'
        ORDER BY prj_id DESC
        LIMIT 1
        """,
        [],
    ) or {}
    last = str(row.get("prj_id") or "").strip()
    if last.startswith("PRJ") and last[3:].isdigit():
        return f"PRJ{int(last[3:]) + 1:06d}"
    return "PRJ000001"


def get_next_biz_id() -> str:
    """가장 큰 'BIZ' 접두 ID + 1 → 6자리. 비어있으면 BIZ000001."""
    row = fetch_one(
        """
        SELECT biz_id
        FROM program_master
        WHERE biz_id LIKE 'BIZ%%'
        ORDER BY biz_id DESC
        LIMIT 1
        """,
        [],
    ) or {}
    last = str(row.get("biz_id") or "").strip()
    if last.startswith("BIZ") and last[3:].isdigit():
        return f"BIZ{int(last[3:]) + 1:06d}"
    return "BIZ000001"


def list_program_master_options() -> list[dict[str, Any]]:
    rows = fetch_all(
        """
        SELECT biz_id, biz_name, biz_overview
        FROM program_master
        ORDER BY biz_name, biz_id
        """,
        [],
    ) or []
    return [
        {
            "biz_id": str(row.get("biz_id") or "").strip(),
            "biz_name": str(row.get("biz_name") or "").strip(),
            "biz_overview": str(row.get("biz_overview") or "").strip() or None,
        }
        for row in rows
        if str(row.get("biz_id") or "").strip() and str(row.get("biz_name") or "").strip()
    ]


def insert_program_master(
    biz_id: str,
    biz_name: str,
    biz_overview: str | None,
    reg_no: int,
    connection: Any,
) -> int:
    sql = """
        INSERT INTO program_master (
            biz_id, biz_name, biz_overview, reg_no
        ) VALUES (%s, %s, %s, %s)
    """
    return execute(
        sql,
        [biz_id, biz_name, biz_overview, reg_no],
        connection=connection,
        commit=False,
    )


def insert_project(
    prj_id: str,
    prj_name: str,
    exec_year: int | None,
    biz_id: str,
    post_date: Any,
    issuer: str | None,
    rag_file_id: str | None,
    reg_no: int,
    connection: Any,
) -> int:
    sql = """
        INSERT INTO project (
            prj_id, prj_name, exec_year, biz_id, post_date, issuer, rag_file_id, reg_no
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
    """
    return execute(
        sql,
        [prj_id, prj_name, exec_year, biz_id, post_date, issuer, rag_file_id, reg_no],
        connection=connection,
        commit=False,
    )
