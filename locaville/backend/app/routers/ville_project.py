"""``/ville-project/*`` 라우터 — 마을/그룹이 참여하는 사업 + 활동 목록.

프론트엔드(v0_chief, v0_farmer)가 사업 카드/리스트를 하드코딩하지 않고
동적으로 받아쓰기 위해 도입. 이름이 "ville-project" 인 이유: 일반어 "project" 가
다른 시스템(IT 프로젝트 등)과 혼동을 일으켜, 마을(ville) 단위 사업임을 명시.
"""
from __future__ import annotations

from fastapi import APIRouter

from app.repositories.project_rdb import list_projects_with_activities


router = APIRouter(prefix="/ville-project", tags=["ville-project"])


@router.get("")
def get_projects(
    group_no: int | None = None,
    ville_id: str | None = None,
    farmer_id: str | None = None,
) -> dict:
    """그룹/마을/농가가 등록된 사업 목록.

    쿼리 파라미터 (셋 중 하나 이상 필수):
      - group_no: 특정 ville_group 의 사업만
      - ville_id: 특정 마을의 모든 그룹 사업만
      - farmer_id: 농가가 속한 그룹의 사업만 (login_id/farmer_regno/user_no/amo_regno 모두 허용)
    """
    return {
        "items": list_projects_with_activities(
            group_no=group_no,
            ville_id=ville_id,
            farmer_id=farmer_id,
        )
    }
