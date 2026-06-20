from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.services.village_service import (
    get_village_detail,
    list_villages,
)


router = APIRouter(prefix="/village", tags=["village"])


@router.get("")
def get_villages() -> dict:
    return list_villages()


@router.get("/{ville_id}")
def get_village(ville_id: str) -> dict:
    try:
        return get_village_detail(ville_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
