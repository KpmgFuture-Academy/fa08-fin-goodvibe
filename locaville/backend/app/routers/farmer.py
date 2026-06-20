"""``/farmer/*`` 라우터 — 농가 단위 조회(필지·알림 등).

프론트엔드(v0_farmer)에서 사용. `farmer_id` path param 은 login_id /
farmer_regno / user_no / amo_regno 무엇이든 받아 backend 가 정규화.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.repositories.farmer_rdb import list_parcels_by_farmer
from app.repositories.identity_rdb import resolve_user_no
from app.repositories.notification_rdb import (
    fetch_recent,
    fetch_unread_count,
    mark_all_read,
    mark_read,
)
from app.services.advice_service import get_today_for_farmer as get_today_advice_for_farmer
from app.services.farm_helper_service import (
    HelperForbiddenError,
    HelperNotFoundError,
    approve_pair,
    get_current_helper_role,
)


router = APIRouter(prefix="/farmer", tags=["farmer"])


@router.get("/{farmer_id}/parcels")
def get_farmer_parcels(farmer_id: str) -> dict:
    """농가가 보유한 필지 목록.

    경로 파라미터 `farmer_id` 는 login_id / farmer_regno / user_no / amo_regno
    어떤 형태도 허용.
    """
    return {"items": list_parcels_by_farmer(farmer_id)}


# ============================================================
# 알림 (notification 테이블) — 농가가 수신한 알림 조회/읽음
# ============================================================

def _require_user_no(farmer_id: str) -> int:
    user_no = resolve_user_no(farmer_id)
    if user_no is None:
        raise HTTPException(status_code=404, detail=f"농가({farmer_id})의 user_no 를 찾을 수 없음")
    return user_no


@router.get("/{farmer_id}/notifications")
def get_farmer_notifications(farmer_id: str, limit: int = 30) -> dict:
    """농가가 받은 알림 최근 N건. read_dt NULL = 안 읽음."""
    user_no = _require_user_no(farmer_id)
    rows = fetch_recent(user_no=user_no, limit=max(1, min(100, limit)))
    # ISO 직렬화 + 가벼운 응답.
    items = [
        {
            "notice_no": int(r["notice_no"]),
            "sender_cd": r.get("sender_cd"),
            "content_cd": r.get("content_cd"),
            "title": r.get("title"),
            "content": r.get("content"),
            "action_url": r.get("action_url"),
            "related_no": r.get("related_no"),
            "read_at": r["read_dt"].isoformat() if r.get("read_dt") else None,
            "sent_at": r["sent_dt"].isoformat() if r.get("sent_dt") else None,
            "reg_at": r["reg_dt"].isoformat() if r.get("reg_dt") else None,
        }
        for r in rows
    ]
    return {"items": items}


@router.get("/{farmer_id}/notifications/unread-count")
def get_farmer_unread_count(farmer_id: str) -> dict:
    """헤더 종 아이콘 배지용 — 안 읽은 알림 개수."""
    user_no = _require_user_no(farmer_id)
    return {"count": fetch_unread_count(user_no=user_no)}


@router.patch("/{farmer_id}/notifications/{notice_no}/read")
def patch_farmer_notification_read(farmer_id: str, notice_no: int) -> dict:
    """단건 읽음 처리. 본인 알림이 아니면 변경 0건이라 표시상 무영향."""
    user_no = _require_user_no(farmer_id)
    mark_read(notice_no=notice_no, mod_no=user_no)
    return {"notice_no": notice_no, "read": True}


@router.post("/{farmer_id}/notifications/read-all")
def post_farmer_notification_read_all(farmer_id: str) -> dict:
    """이 농가의 안 읽은 모든 알림을 일괄 읽음 처리."""
    user_no = _require_user_no(farmer_id)
    updated = mark_all_read(user_no=user_no, mod_no=user_no)
    return {"updated": updated}


# ============================================================
# 기록 도우미 (farm_helper) — 농가 본인 입장
# ============================================================

@router.get("/{farmer_id}/farm-helpers/current")
def get_current_helper(farmer_id: str) -> dict:
    """현재 사용자가 helper / recipient / none 중 어떤 역할인지 + 상대방 정보."""
    user_no = _require_user_no(farmer_id)
    return get_current_helper_role(user_no=user_no)


@router.post("/{farmer_id}/farm-helpers/{helper_user_no}/{help_seq}/approve")
def post_approve_helper(farmer_id: str, helper_user_no: int, help_seq: int) -> dict:
    """본인(helper 또는 recipient)이 자신의 동의 처리. 본인이 아니면 403."""
    user_no = _require_user_no(farmer_id)
    try:
        return approve_pair(helper_user_no=helper_user_no, help_seq=help_seq, user_no=user_no)
    except HelperNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except HelperForbiddenError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


# ============================================================
# 농가별 오늘의 한마디 (advice 캐시 — rule + llm)
# ============================================================

@router.get("/{farmer_id}/advice/today")
def get_farmer_advice_today(farmer_id: str, force: bool = False) -> dict:
    """오늘자 농가 advice (캐시 우선, 없으면 즉시 생성).
    ``?force=true`` 로 캐시 무시하고 재생성 가능 — 룰/프롬프트 변경 검증용.
    결과 없으면 ``{"advice": null}`` — frontend 가 카드 미렌더.
    """
    advice = get_today_advice_for_farmer(farmer_id=farmer_id, force=force)
    return {"advice": advice}
