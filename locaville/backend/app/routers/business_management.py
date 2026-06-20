"""``/business-management/*`` 라우터 — 농업인 단체관리 화면(v0_chief) 전용 API.

팀장님 브랜치의 단체관리 화면을 main 으로 통합하면서 도입.
admin endpoint 만 main 에서 우선 지원 (단체관리 화면이 사용). user endpoint 는 추후.
"""
from __future__ import annotations

from fastapi import APIRouter

from app.services.business_management_service import get_admin_business_management


router = APIRouter(prefix="/business-management", tags=["business-management"])


@router.get("/admin")
def get_admin_businesses(
    group_no: int | None = None,
    prj_id: str | None = None,
) -> dict:
    """단체관리 화면용 — businesses/entities/participations/taskAssignments 4개 배열 반환.

    frontend(`farmer-groups-api.ts`) 가 이를 단체별 그룹핑/집계.
    """
    return get_admin_business_management(group_no=group_no, prj_id=prj_id)
