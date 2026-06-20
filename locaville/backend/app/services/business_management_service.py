"""단체관리 화면 서비스.

raw todo rows 를 frontend(`farmer-groups-api.ts`) 가 기대하는 응답 형태로 가공:
  {
    "source": "mysql"|"empty",
    "businesses":     [{ id, name, start, end, status, type, description }],
    "entities":       [{ id, kind, name, group, phone, status }],
    "participations": [{ businessId, entityId, status }],
    "taskAssignments":[{ businessId, entityId, taskId, status, due }],
  }

팀장님 브랜치의 service 를 main 호환 (다른 mysql_repository 의존 제거) 으로 정리.
diary/evidence cross-check (보완요청 status) 는 simpler 시작 — 모든 entity 를 "참여중" 으로.
시연 단계에서 status 세분화가 필요해지면 enrich.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime
from typing import Any

from app.repositories.business_management_rdb import list_business_todo_rows


# ============================================================
# 날짜/문자 유틸
# ============================================================

def _safe_date(value: Any) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str) and value.strip():
        try:
            return date.fromisoformat(value[:10])
        except ValueError:
            return None
    return None


def _date_text(value: Any) -> str:
    parsed = _safe_date(value)
    return parsed.isoformat() if parsed else "-"


def _project_start(rows: list[dict[str, Any]]) -> str:
    dates = [
        item
        for row in rows
        for item in [_safe_date(row.get("est_start_date")) or _safe_date(row.get("activity_start_date"))]
        if item
    ]
    return min(dates).isoformat() if dates else "-"


def _project_end(rows: list[dict[str, Any]]) -> str:
    dates = [
        item
        for row in rows
        for item in [_safe_date(row.get("est_end_date")) or _safe_date(row.get("activity_end_date"))]
        if item
    ]
    return max(dates).isoformat() if dates else "-"


# ============================================================
# 라벨 헬퍼
# ============================================================

def _project_name(row: dict[str, Any]) -> str:
    return str(row.get("prj_name") or row.get("biz_name") or row.get("prj_id") or "사업")


def _project_description(row: dict[str, Any]) -> str:
    return str(row.get("biz_overview") or f"{_project_name(row)} 참여 과업을 관리합니다.")


def _business_type(row: dict[str, Any]) -> str:
    return str(row.get("biz_name") or row.get("biz_id") or "사업")


def _activity_name(row: dict[str, Any]) -> str:
    return str(row.get("activity_name") or "").strip() or "활동"


def _job_name(row: dict[str, Any]) -> str:
    return str(row.get("job_name") or row.get("job_cd") or "작업")


def _job_description(row: dict[str, Any]) -> str:
    return str(row.get("job_desc") or row.get("remark") or "").strip() or f"{_job_name(row)} 과업입니다."


# ============================================================
# admin endpoint — 단체관리 화면 응답
# ============================================================

def get_admin_business_management(
    *,
    group_no: int | None = None,
    prj_id: str | None = None,
) -> dict[str, Any]:
    """단체관리 화면용 응답.

    frontend(`farmer-groups-api.ts`) 가 단체별 그룹핑/통계 계산을 수행하므로
    여기서는 raw 4개 배열(businesses, entities, participations, taskAssignments) 만 만들어 반환.
    """
    rows = list_business_todo_rows(group_no=group_no, prj_id=prj_id)

    # 사업·농가 별로 행 그룹핑. farmer_id = login_id 우선, 없으면 amo_regno fallback.
    rows_by_project: dict[str, list[dict[str, Any]]] = defaultdict(list)
    rows_by_farmer: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        pid = str(row.get("prj_id") or "")
        fid = str(row.get("login_id") or row.get("amo_regno") or "")
        # 각 row 에 정규화된 farmer_id 를 부착해 아래 entities/participations 에서 재사용.
        row["farmer_id"] = fid
        if pid:
            rows_by_project[pid].append(row)
        if fid:
            rows_by_farmer[fid].append(row)

    # businesses — 사업 단위
    businesses: list[dict[str, Any]] = []
    for project_id, project_rows in rows_by_project.items():
        first_row = project_rows[0]
        businesses.append(
            {
                "id": project_id,
                "name": _project_name(first_row),
                "start": _project_start(project_rows),
                "end": _project_end(project_rows),
                "status": "진행중",
                "description": _project_description(first_row),
                "type": _business_type(first_row),
            }
        )

    # entities — 농가 단위. `group` 필드에 단체명(ville_group.group_name) 들어감.
    entities: list[dict[str, str]] = []
    for farmer_id, farmer_rows in rows_by_farmer.items():
        first_row = farmer_rows[0]
        # 이름: user_master.user_name → amo_family.amo_name → farmer_id 순서로 fallback.
        name = (
            first_row.get("farmer_name")
            or first_row.get("farmer_name_fallback")
            or farmer_id
        )
        entities.append(
            {
                "id": farmer_id,
                "kind": "개인",
                "name": str(name),
                "group": str(first_row.get("entity_name") or "-"),
                "phone": str(first_row.get("phone_no") or "-"),
                "status": "참여중",
            }
        )

    # participations — 농가 × 사업 (중복 제거)
    seen_participations: set[tuple[str, str]] = set()
    participations: list[dict[str, str]] = []
    for row in rows:
        business_id = str(row.get("prj_id") or "")
        farmer_id = str(row.get("farmer_id") or "")
        if not business_id or not farmer_id:
            continue
        key = (business_id, farmer_id)
        if key in seen_participations:
            continue
        seen_participations.add(key)
        participations.append(
            {
                "businessId": business_id,
                "entityId": farmer_id,
                "status": "참여중",
            }
        )

    # taskAssignments — 농가 × 사업 × 작업 (cross product 한 줄 그대로)
    task_assignments: list[dict[str, str]] = []
    for row in rows:
        business_id = str(row.get("prj_id") or "")
        farmer_id = str(row.get("farmer_id") or "")
        job_cd = str(row.get("job_cd") or "")
        if not (business_id and farmer_id and job_cd):
            continue
        task_assignments.append(
            {
                "businessId": business_id,
                "entityId": farmer_id,
                "taskId": job_cd,
                "status": str(row.get("job_progress") or "진행중"),
                "due": _date_text(row.get("est_end_date")),
            }
        )

    return {
        "source": "mysql" if rows else "empty",
        "businesses": businesses,
        "entities": entities,
        "participations": participations,
        "taskAssignments": task_assignments,
    }
