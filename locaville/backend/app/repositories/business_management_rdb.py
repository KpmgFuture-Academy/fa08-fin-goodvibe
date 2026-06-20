"""단체관리(농업인 단체) 화면용 raw rows 조회.

팀장님 브랜치의 `business_management_mysql_repository` 를 main 의 `dbcom` 패턴으로 포팅.
prj_todo_list 한 행 = (group_no, farmer, project, activity, job) 의 cross product 한 줄.
service 가 이 행들을 단체/사업/작업 으로 재집계.

사용 테이블: prj_todo_list, project, program_master, prj_activity, farm_job,
            ville_group, group_member, user_master, parcel
모두 main 에서 이미 사용 중이라 별도 시드 불필요.
"""
from __future__ import annotations

from typing import Any

from locaville.dbcom import fetch_all


# main(PostgreSQL) 스키마에 맞춰 정리:
#   - prj_todo_list 가 amo_regno + parcel_no 직접 보유 → group_member JOIN 불필요
#   - group_member 컬럼은 amo_regno 기준 (user_no 없음)
#   - amo_family.chief_no → user_master.user_no 로 농가 대표 정보
#   - parcel 도 amo_regno 기준 (group_no 컬럼 없음)
_BASE_SELECT = """
    SELECT
        t.group_no,
        t.prj_id,
        p.prj_name,
        p.exec_year,
        p.biz_id,
        p.issuer,
        pm.biz_name,
        pm.biz_overview,
        t.activity_id,
        a.activity_name,
        a.est_start_date AS activity_start_date,
        a.est_end_date AS activity_end_date,
        t.job_seq,
        t.job_cd,
        j.job_name,
        j.job_desc,
        j.job_cat,
        t.est_start_date,
        t.real_start_date,
        t.est_end_date,
        t.real_end_date,
        t.job_progress,
        t.remark,
        vg.group_name AS entity_name,
        vg.group_type_cd,
        vg.ville_id,
        t.amo_regno,
        af.amo_name AS farmer_name_fallback,
        um.login_id AS login_id,
        um.user_name AS farmer_name,
        um.phone_no,
        t.parcel_no,
        pc.addr_1 AS field_address
    FROM prj_todo_list t
    LEFT JOIN project p
        ON p.prj_id = t.prj_id
    LEFT JOIN program_master pm
        ON pm.biz_id = p.biz_id
    LEFT JOIN prj_activity a
        ON a.prj_id = t.prj_id
       AND a.activity_id = t.activity_id
    LEFT JOIN farm_job j
        ON j.job_cd = t.job_cd
    LEFT JOIN ville_group vg
        ON vg.group_no = t.group_no
    LEFT JOIN amo_family af
        ON af.amo_regno = t.amo_regno
    LEFT JOIN user_master um
        ON um.user_no = af.chief_no
    LEFT JOIN parcel pc
        ON pc.amo_regno = t.amo_regno
       AND pc.parcel_no = t.parcel_no
"""

_ORDER_BY = """
    ORDER BY
        t.prj_id,
        t.amo_regno,
        t.est_end_date NULLS LAST,
        t.est_end_date,
        t.activity_id,
        t.job_seq,
        t.job_cd
"""


def list_business_todo_rows(
    *,
    farmer_id: str | None = None,
    group_no: int | None = None,
    prj_id: str | None = None,
) -> list[dict[str, Any]]:
    """단체관리 화면용 raw todo 행. 농가 × 사업 × 작업 cross product 형태."""
    where: list[str] = []
    params: list[Any] = []

    if farmer_id:
        # login_id 또는 amo_regno 어떤 형태든 받기 — service 가 둘 다 farmer_id 로 사용.
        where.append("(um.login_id = %s OR t.amo_regno = %s)")
        params.extend([farmer_id, farmer_id])
    if group_no is not None:
        where.append("t.group_no = %s")
        params.append(group_no)
    if prj_id:
        where.append("t.prj_id = %s")
        params.append(prj_id)

    sql = _BASE_SELECT
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += _ORDER_BY

    return fetch_all(sql, params) or []
