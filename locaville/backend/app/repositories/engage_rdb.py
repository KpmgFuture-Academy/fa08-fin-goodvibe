"""사업참여 화면용 관계형 DB 저장소."""
from __future__ import annotations

from typing import Any

from locaville.dbcom import execute, executemany, fetch_all, fetch_one


def get_project_summary_with_engage_status(ville_id: str, exec_year: int) -> list[dict[str, Any]]:
    sql = """
        SELECT
            p.prj_id,
            pm.biz_name,
            p.prj_name,
            p.post_date,
            p.issuer,
            CASE
                WHEN EXISTS (
                    SELECT 1
                    FROM prj_grp pg
                    WHERE pg.prj_id = p.prj_id
                      AND pg.ville_id = %s
                ) THEN '참여중'
                ELSE '참여등록'
            END AS engage_yn
        FROM project p
        LEFT JOIN program_master pm
            ON pm.biz_id = p.biz_id
        WHERE p.exec_year = %s
        ORDER BY p.post_date DESC, p.prj_id
    """
    return fetch_all(sql, [ville_id, exec_year]) or []


def get_project(prj_id: str) -> dict[str, Any] | None:
    return fetch_one("SELECT prj_id FROM project WHERE prj_id = %s LIMIT 1", [prj_id])


def get_project_with_engage_group(prj_id: str, ville_id: str) -> dict[str, Any] | None:
    sql = """
        SELECT
            p.prj_id,
            pm.biz_name,
            p.prj_name,
            p.post_date,
            p.issuer,
            p.exec_year,
            pg.group_no AS engage_group_no,
            vg.group_name AS engage_group_name,
            CASE
                WHEN pg.group_no IS NOT NULL THEN '참여중'
                ELSE '참여등록'
            END AS engage_yn
        FROM project p
        LEFT JOIN program_master pm
            ON pm.biz_id = p.biz_id
        LEFT JOIN prj_grp pg
            ON pg.prj_id = p.prj_id
           AND pg.ville_id = %s
        LEFT JOIN ville_group vg
            ON vg.group_no = pg.group_no
        WHERE p.prj_id = %s
        LIMIT 1
    """
    return fetch_one(sql, [ville_id, prj_id])


def list_ville_groups(ville_id: str) -> list[dict[str, Any]]:
    sql = """
        SELECT
            vg.group_no,
            vg.group_name,
            vg.group_type_cd,
            cd.code_name AS group_type,
            vg.chief_no,
            um.user_name AS chief_name
        FROM ville_group vg
        LEFT JOIN code_detail cd
            ON cd.grp_cd = 'AGRIGRUP'
           AND cd.code = vg.group_type_cd
        LEFT JOIN user_master um
            ON um.user_no = vg.chief_no
        WHERE vg.ville_id = %s
        ORDER BY vg.group_name, vg.group_no
    """
    return fetch_all(sql, [ville_id]) or []


def get_ville_group(group_no: int, ville_id: str) -> dict[str, Any] | None:
    sql = """
        SELECT
            vg.group_no,
            vg.group_name,
            vg.chief_no,
            vg.ville_id,
            cd.code_name AS group_type,
            um.user_name AS chief_name
        FROM ville_group vg
        LEFT JOIN code_detail cd
            ON cd.grp_cd = 'AGRIGRUP'
           AND cd.code = vg.group_type_cd
        LEFT JOIN user_master um
            ON um.user_no = vg.chief_no
        WHERE vg.group_no = %s
          AND vg.ville_id = %s
        LIMIT 1
    """
    return fetch_one(sql, [group_no, ville_id])


def get_project_group_for_ville(prj_id: str, ville_id: str) -> dict[str, Any] | None:
    sql = """
        SELECT group_no
        FROM prj_grp
        WHERE prj_id = %s
          AND ville_id = %s
        LIMIT 1
    """
    return fetch_one(sql, [prj_id, ville_id])


def insert_project_group(prj_id: str, ville_id: str, group_no: int, leader_no: Any, reg_no: int, connection: Any) -> int:
    sql = """
        INSERT INTO prj_grp (
            group_no, prj_id, ville_id, leader_no, apply_date, apprv_date, reg_no
        ) VALUES (%s, %s, %s, %s, CURRENT_DATE, CURRENT_DATE, %s)
    """
    return execute(sql, [group_no, prj_id, ville_id, leader_no, reg_no], connection=connection, commit=False)


def has_activity_groups(prj_id: str, group_no: int) -> bool:
    row = fetch_one(
        """
        SELECT 1 AS has_rows
        FROM act_grp
        WHERE prj_id = %s
          AND group_no = %s
        LIMIT 1
        """,
        [prj_id, group_no],
    )
    return bool(row)


def has_project_todos(prj_id: str, group_no: int) -> bool:
    row = fetch_one(
        """
        SELECT 1 AS has_rows
        FROM prj_todo_list
        WHERE prj_id = %s
          AND group_no = %s
        LIMIT 1
        """,
        [prj_id, group_no],
    )
    return bool(row)


def list_project_activities(prj_id: str) -> list[dict[str, Any]]:
    sql = """
        SELECT
            prj_id,
            activity_id,
            activity_name,
            est_start_date,
            est_end_date
        FROM prj_activity
        WHERE prj_id = %s
        ORDER BY est_start_date, activity_id
    """
    return fetch_all(sql, [prj_id]) or []


def list_group_members(group_no: int) -> list[dict[str, Any]]:
    sql = """
        SELECT
            gm.amo_regno,
            af.amo_name,
            af.chief_no,
            um.user_name AS chief_name,
            p.parcel_no,
            p.parcel_name
        FROM group_member gm
        JOIN amo_family af
            ON af.amo_regno = gm.amo_regno
        LEFT JOIN user_master um
            ON um.user_no = af.chief_no
        LEFT JOIN parcel p
            ON p.amo_regno = gm.amo_regno
        WHERE gm.group_no = %s
          AND (gm.active_yn IS NULL OR gm.active_yn = 'Y')
        ORDER BY af.amo_name, gm.amo_regno, p.parcel_no
    """
    rows = fetch_all(sql, [group_no]) or []
    grouped: dict[str, dict[str, Any]] = {}

    for row in rows:
        amo_regno = str(row.get("amo_regno") or "").strip()
        if not amo_regno:
            continue

        item = grouped.get(amo_regno)
        if item is None:
            item = {
                "amo_regno": amo_regno,
                "amo_name": row.get("amo_name"),
                "chief_no": row.get("chief_no"),
                "chief_name": row.get("chief_name"),
                "parcels": [],
            }
            grouped[amo_regno] = item

        parcel_no = row.get("parcel_no")
        if parcel_no is None:
            continue

        parcel_name = str(row.get("parcel_name") or "").strip()
        label = f"{parcel_no}. {parcel_name}" if parcel_name else f"농지 {parcel_no}"
        parcels = item["parcels"]
        if not any(parcel.get("parcel_no") == parcel_no for parcel in parcels):
            parcels.append(
                {
                    "parcel_no": int(parcel_no),
                    "parcel_name": parcel_name or None,
                    "parcel_label": label,
                }
            )

    return list(grouped.values())


def list_activity_participations(prj_id: str, group_no: int) -> list[dict[str, Any]]:
    sql = """
        SELECT
            ag.group_no,
            ag.amo_regno,
            ag.prj_id,
            ag.activity_id,
            ag.start_date,
            ag.end_date,
            ag.act_progress,
            ag.remark,
            ap.parcel_no,
            p.parcel_name
        FROM act_grp ag
        LEFT JOIN act_grp_parcel ap
            ON ap.group_no = ag.group_no
           AND ap.amo_regno = ag.amo_regno
           AND ap.prj_id = ag.prj_id
           AND ap.activity_id = ag.activity_id
        LEFT JOIN parcel p
            ON p.amo_regno = ap.amo_regno
           AND p.parcel_no = ap.parcel_no
        WHERE ag.prj_id = %s
          AND ag.group_no = %s
        ORDER BY ag.activity_id, ag.amo_regno, ap.parcel_no
    """
    rows = fetch_all(sql, [prj_id, group_no]) or []
    grouped: dict[tuple[Any, ...], dict[str, Any]] = {}

    for row in rows:
        key = (
            row.get("group_no"),
            row.get("amo_regno"),
            row.get("prj_id"),
            row.get("activity_id"),
        )
        item = grouped.get(key)
        if item is None:
            item = {
                "group_no": row.get("group_no"),
                "amo_regno": row.get("amo_regno"),
                "prj_id": row.get("prj_id"),
                "activity_id": row.get("activity_id"),
                "start_date": row.get("start_date"),
                "end_date": row.get("end_date"),
                "act_progress": row.get("act_progress"),
                "remark": row.get("remark"),
                "parcel_nos": [],
                "parcel_labels": [],
            }
            grouped[key] = item

        parcel_no = row.get("parcel_no")
        if parcel_no is None:
            continue

        parcel_name = str(row.get("parcel_name") or "").strip()
        if parcel_name:
            label = f"{parcel_no}. {parcel_name}"
        else:
            label = f"농지 {parcel_no}"

        labels = item["parcel_labels"]
        if label not in labels:
            labels.append(label)
        parcel_nos = item["parcel_nos"]
        parcel_no_int = int(parcel_no)
        if parcel_no_int not in parcel_nos:
            parcel_nos.append(parcel_no_int)

    result: list[dict[str, Any]] = []
    for item in grouped.values():
        item["parcel_nos"] = sorted(item.get("parcel_nos") or [])
        labels = item.get("parcel_labels") or []
        item["parcel_labels"] = " | ".join(labels) if labels else None
        result.append(item)
    return result


def get_project_activity(prj_id: str, activity_id: str) -> dict[str, Any] | None:
    sql = """
        SELECT activity_id, activity_name
        FROM prj_activity
        WHERE prj_id = %s
          AND activity_id = %s
        LIMIT 1
    """
    return fetch_one(sql, [prj_id, activity_id])


def list_activity_member_regnos(group_no: int, prj_id: str, activity_id: str) -> list[str]:
    rows = fetch_all(
        """
        SELECT amo_regno
        FROM act_grp
        WHERE group_no = %s
          AND prj_id = %s
          AND activity_id = %s
        """,
        [group_no, prj_id, activity_id],
    ) or []
    return sorted({str(row.get("amo_regno") or "").strip() for row in rows if str(row.get("amo_regno") or "").strip()})


def list_activity_member_parcel_map(group_no: int, prj_id: str, activity_id: str) -> dict[str, list[int]]:
    rows = fetch_all(
        """
        SELECT amo_regno, parcel_no
        FROM act_grp_parcel
        WHERE group_no = %s
          AND prj_id = %s
          AND activity_id = %s
        ORDER BY amo_regno, parcel_no
        """,
        [group_no, prj_id, activity_id],
    ) or []
    result: dict[str, list[int]] = {}
    for row in rows:
        amo_regno = str(row.get("amo_regno") or "").strip()
        parcel_no = row.get("parcel_no")
        if not amo_regno or parcel_no is None:
            continue
        result.setdefault(amo_regno, []).append(int(parcel_no))
    return result


def list_valid_group_member_regnos(group_no: int, amo_regnos: list[str]) -> list[str]:
    if not amo_regnos:
        return []
    placeholders = ", ".join(["%s"] * len(amo_regnos))
    sql = f"""
        SELECT gm.amo_regno
        FROM group_member gm
        WHERE gm.group_no = %s
          AND gm.amo_regno IN ({placeholders})
          AND (gm.active_yn IS NULL OR gm.active_yn = 'Y')
    """
    rows = fetch_all(sql, [group_no, *amo_regnos]) or []
    return [str(row.get("amo_regno") or "").strip() for row in rows if row.get("amo_regno")]


def list_valid_member_parcels(amo_regnos: list[str]) -> dict[str, list[int]]:
    if not amo_regnos:
        return {}
    placeholders = ", ".join(["%s"] * len(amo_regnos))
    sql = f"""
        SELECT amo_regno, parcel_no
        FROM parcel
        WHERE amo_regno IN ({placeholders})
        ORDER BY amo_regno, parcel_no
    """
    rows = fetch_all(sql, amo_regnos) or []
    result: dict[str, list[int]] = {}
    for row in rows:
        amo_regno = str(row.get("amo_regno") or "").strip()
        parcel_no = row.get("parcel_no")
        if not amo_regno or parcel_no is None:
            continue
        result.setdefault(amo_regno, []).append(int(parcel_no))
    return result


def insert_activity_members(
    group_no: int,
    prj_id: str,
    activity_id: str,
    amo_regnos: list[str],
    reg_no: int,
    connection: Any,
) -> int:
    if not amo_regnos:
        return 0
    params_list = [[group_no, amo_regno, prj_id, activity_id, reg_no] for amo_regno in amo_regnos]
    sql = """
        INSERT INTO act_grp (
            group_no, amo_regno, prj_id, activity_id, reg_no
        ) VALUES (%s, %s, %s, %s, %s)
    """
    return executemany(sql, params_list, connection=connection, commit=False)


def insert_activity_member_parcels(
    group_no: int,
    prj_id: str,
    activity_id: str,
    parcel_selections: list[tuple[str, int]],
    reg_no: int,
    connection: Any,
) -> int:
    if not parcel_selections:
        return 0
    params_list = [
        [group_no, amo_regno, prj_id, activity_id, parcel_no, reg_no]
        for amo_regno, parcel_no in parcel_selections
    ]
    sql = """
        INSERT INTO act_grp_parcel (
            group_no, amo_regno, prj_id, activity_id, parcel_no, reg_no
        ) VALUES (%s, %s, %s, %s, %s, %s)
    """
    return executemany(sql, params_list, connection=connection, commit=False)


def delete_activity_members(
    group_no: int,
    prj_id: str,
    activity_id: str,
    amo_regnos: list[str],
    connection: Any,
) -> int:
    if not amo_regnos:
        return 0
    placeholders = ", ".join(["%s"] * len(amo_regnos))
    sql = f"""
        DELETE FROM act_grp
        WHERE group_no = %s
          AND prj_id = %s
          AND activity_id = %s
          AND amo_regno IN ({placeholders})
    """
    return execute(sql, [group_no, prj_id, activity_id, *amo_regnos], connection=connection, commit=False)


def delete_activity_member_parcels(
    group_no: int,
    prj_id: str,
    activity_id: str,
    amo_regnos: list[str],
    connection: Any,
) -> int:
    if not amo_regnos:
        return 0
    placeholders = ", ".join(["%s"] * len(amo_regnos))
    sql = f"""
        DELETE FROM act_grp_parcel
        WHERE group_no = %s
          AND prj_id = %s
          AND activity_id = %s
          AND amo_regno IN ({placeholders})
    """
    return execute(sql, [group_no, prj_id, activity_id, *amo_regnos], connection=connection, commit=False)


def list_engage_todo_items(prj_id: str, group_no: int) -> list[dict[str, Any]]:
    sql = """
        SELECT
            ptl.group_no,
            ptl.amo_regno,
            af.amo_name,
            af.chief_no AS leader_no,
            um.user_name AS leader_name,
            ptl.activity_id,
            pa.activity_name,
            ptl.parcel_no,
            p.parcel_name,
            ptl.job_seq,
            ptl.job_cd,
            fj.job_name,
            ptl.est_start_date,
            ptl.est_end_date
        FROM prj_todo_list ptl
        LEFT JOIN amo_family af
            ON af.amo_regno = ptl.amo_regno
        LEFT JOIN user_master um
            ON um.user_no = af.chief_no
        LEFT JOIN prj_activity pa
            ON pa.prj_id = ptl.prj_id
           AND pa.activity_id = ptl.activity_id
        LEFT JOIN parcel p
            ON p.amo_regno = ptl.amo_regno
           AND p.parcel_no = ptl.parcel_no
        LEFT JOIN farm_job fj
            ON fj.job_cd = ptl.job_cd
        WHERE ptl.prj_id = %s
          AND ptl.group_no = %s
        ORDER BY ptl.amo_regno, ptl.activity_id, ptl.parcel_no, ptl.job_seq
    """
    return fetch_all(sql, [prj_id, group_no]) or []


def list_todo_source_rows(prj_id: str, group_no: int) -> list[dict[str, Any]]:
    sql = """
        SELECT
            ag.group_no,
            ag.amo_regno,
            ag.prj_id,
            ag.activity_id,
            ap.parcel_no,
            pj.job_seq,
            pj.job_cd,
            pj.est_start_date,
            pj.est_end_date
        FROM act_grp ag
        JOIN act_grp_parcel ap
            ON ap.group_no = ag.group_no
           AND ap.amo_regno = ag.amo_regno
           AND ap.prj_id = ag.prj_id
           AND ap.activity_id = ag.activity_id
        JOIN prj_job pj
            ON pj.prj_id = ag.prj_id
           AND pj.activity_id = ag.activity_id
        WHERE ag.prj_id = %s
          AND ag.group_no = %s
        ORDER BY ag.amo_regno, ag.activity_id, ap.parcel_no, pj.job_seq
    """
    return fetch_all(sql, [prj_id, group_no]) or []


def list_todo_source_items(prj_id: str, group_no: int) -> list[dict[str, Any]]:
    sql = """
        SELECT
            ag.group_no,
            ag.amo_regno,
            af.amo_name,
            af.chief_no AS leader_no,
            um.user_name AS leader_name,
            ag.activity_id,
            pa.activity_name,
            ap.parcel_no,
            p.parcel_name,
            pj.job_seq,
            pj.job_cd,
            fj.job_name,
            pj.est_start_date,
            pj.est_end_date
        FROM act_grp ag
        JOIN act_grp_parcel ap
            ON ap.group_no = ag.group_no
           AND ap.amo_regno = ag.amo_regno
           AND ap.prj_id = ag.prj_id
           AND ap.activity_id = ag.activity_id
        JOIN prj_job pj
            ON pj.prj_id = ag.prj_id
           AND pj.activity_id = ag.activity_id
        LEFT JOIN amo_family af
            ON af.amo_regno = ag.amo_regno
        LEFT JOIN user_master um
            ON um.user_no = af.chief_no
        LEFT JOIN prj_activity pa
            ON pa.prj_id = ag.prj_id
           AND pa.activity_id = ag.activity_id
        LEFT JOIN parcel p
            ON p.amo_regno = ag.amo_regno
           AND p.parcel_no = ap.parcel_no
        LEFT JOIN farm_job fj
            ON fj.job_cd = pj.job_cd
        WHERE ag.prj_id = %s
          AND ag.group_no = %s
        ORDER BY ag.amo_regno, ag.activity_id, ap.parcel_no, pj.job_seq
    """
    return fetch_all(sql, [prj_id, group_no]) or []


def insert_todo_rows(params_list: list[list[Any]], connection: Any) -> int:
    if not params_list:
        return 0
    sql = """
        INSERT INTO prj_todo_list (
            group_no,
            amo_regno,
            prj_id,
            activity_id,
            parcel_no,
            job_seq,
            job_cd,
            est_start_date,
            est_end_date,
            reg_no
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """
    return executemany(sql, params_list, connection=connection, commit=False)


def delete_todo_rows(params_list: list[list[Any]], connection: Any) -> int:
    if not params_list:
        return 0
    sql = """
        DELETE FROM prj_todo_list
        WHERE group_no = %s
          AND amo_regno = %s
          AND prj_id = %s
          AND activity_id = %s
          AND parcel_no = %s
          AND job_seq = %s
    """
    return executemany(sql, params_list, connection=connection, commit=False)
