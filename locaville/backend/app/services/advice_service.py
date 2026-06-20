"""advice 생성 / 조회 오케스트레이션.

흐름:
  1) 컨텍스트 수집 (날씨 / todo / 일지 상태 / helper 등)
  2) 룰 매칭 → scenario_cd + fields + fallback_template
  3) LLM 으로 표현 변형 (실패 시 fallback)
  4) advice 테이블 upsert
  5) 화면 응답용 dict 반환
"""
from __future__ import annotations

from datetime import date as _date
from typing import Any

from app.repositories import advice_rdb
from app.repositories.farmer_rdb import list_parcels_by_farmer
from app.repositories.farm_helper_rdb import get_active_or_pending_for_helper, get_active_or_pending_for_recipient
from app.repositories.identity_rdb import resolve_user_record
from app.repositories.todo_rdb import _fetch_todo_board_rows
from app.repositories.user_ville_rdb import get_user_farmer_info, get_village_info
from app.services.advice_llm import compose_advice_text
from app.services.advice_rules import AdviceContext, RuleMatch, match_chief_rule, match_farmer_rule


# ============================================================
# Context 수집
# ============================================================

def _fetch_weather_for_ville(ville_id: str) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    """weather-service 호출 — 실패 시 (None, None).
    weather_service.fetch_current_weather 는 nx/ny/address 만 받으므로 village 조회 후 전달.
    응답: {sky, pty, tmp, pop, fcst_date, ...}.
    """
    try:
        from app.services.weather_service import fetch_current_weather  # type: ignore
        from app.repositories.user_ville_rdb import get_village_info

        village = get_village_info(ville_id) if ville_id else None
        nx = village.get("nx") if village else None
        ny = village.get("ny") if village else None
        addr1 = (village.get("addr_1") or "").strip() if village else ""
        addr2 = (village.get("addr_2") or "").strip() if village else ""
        addr = (f"{addr1} {addr2}".strip()) or None

        today = fetch_current_weather(
            crop_cd="rice",
            village_nx=nx,
            village_ny=ny,
            village_address=addr,
            cache_key=ville_id or None,
        )
        # 에러 응답 (error 키 있음) 도 None 처리
        if today and today.get("error"):
            print(f"[advice] weather error: {today.get('error')}")
            return None, None
        return today, None
    except Exception as e:  # noqa: BLE001
        print(f"[advice] weather fetch failed: {e}")
        return None, None


def _fetch_last_diary_date(user_no: int) -> str | None:
    """가장 최근 영농일지 작성일."""
    try:
        from locaville.dbcom import fetch_one
        row = fetch_one(
            "SELECT MAX(job_date) AS d FROM journal WHERE user_no = %s AND deleted_dt IS NULL",
            [user_no],
        )
        d = (row or {}).get("d")
        if d:
            return d.isoformat() if hasattr(d, "isoformat") else str(d)
    except Exception:  # noqa: BLE001
        pass
    return None


def _fetch_pending_retake(amo_regno: str) -> int:
    """미처리 재촬영 요청 개수 (evidence.status = 'retake_required')."""
    try:
        from locaville.dbcom import fetch_one
        row = fetch_one(
            "SELECT COUNT(*) AS c FROM evidence "
            "WHERE amo_regno = %s AND deleted_dt IS NULL "
            "  AND raw_json::text LIKE '%%retake_required%%'",
            [amo_regno],
        )
        return int((row or {}).get("c") or 0)
    except Exception:  # noqa: BLE001
        return 0


def _build_farmer_context(*, user_no: int, advice_date: _date) -> AdviceContext:
    user_info = get_user_farmer_info(user_no) or {}
    user_name = user_info.get("user_name") or ""
    amo_regno = str(user_info.get("amo_regno") or "")
    ville_id = str(user_info.get("ville_id") or "")

    weather_today, weather_tomorrow = _fetch_weather_for_ville(ville_id)

    # 미완료 todo 를 마감 임박 순으로 정렬 + 같은 활동(activity_id 또는 job_cd) 중복 제거.
    # 홈 화면의 urgentTodos 와 동일 로직 — advice 가 보여주는 작업명이 화면 todo 와 일치하게.
    todos_raw = _fetch_todo_board_rows(amo_regno=amo_regno, limit=50)

    def _due_str(r: dict[str, Any]) -> str:
        d = r.get("est_end_date")
        if d is None:
            return "9999-12-31"
        if hasattr(d, "isoformat"):
            return d.isoformat()
        return str(d)

    candidates = [
        r for r in todos_raw
        if (r.get("job_progress") or "").upper() not in {"END", "DONE", "100"}
    ]
    candidates.sort(key=_due_str)

    open_todos: list[dict[str, Any]] = []
    seen: set[str] = set()
    for r in candidates:
        key = (r.get("activity_id") or r.get("job_cd") or r.get("job_name") or "").strip()
        if key and key in seen:
            continue
        if key:
            seen.add(key)
        open_todos.append(
            {
                "job_cd": r.get("job_cd"),
                "job_name": r.get("job_name") or r.get("activity_name") or "",
                "due_date": _due_str(r),
                "job_progress": (r.get("job_progress") or "").upper(),
            }
        )

    last_diary = _fetch_last_diary_date(user_no)
    pending_retake = _fetch_pending_retake(amo_regno) if amo_regno else 0

    helper_role = "none"
    try:
        if get_active_or_pending_for_helper(user_no):
            helper_role = "helper"
        elif get_active_or_pending_for_recipient(user_no):
            helper_role = "recipient"
    except Exception:  # noqa: BLE001
        pass

    return AdviceContext(
        user_no=user_no,
        user_name=user_name,
        amo_regno=amo_regno,
        ville_id=ville_id,
        crop="벼",
        advice_date=advice_date,
        weather_today=weather_today,
        weather_tomorrow=weather_tomorrow,
        open_todos=open_todos,
        last_diary_date=last_diary,
        helper_role=helper_role,
        pending_retake=pending_retake,
        is_chief=False,
    )


def _build_chief_context(*, ville_id: str, chief_user_no: int, advice_date: _date) -> AdviceContext:
    village = get_village_info(ville_id) or {}
    chief_info = get_user_farmer_info(chief_user_no) or {}
    user_name = chief_info.get("user_name") or "이장님"

    weather_today, weather_tomorrow = _fetch_weather_for_ville(ville_id)

    # 마을 단위 통계
    try:
        from locaville.dbcom import fetch_one
        pending_row = fetch_one(
            "SELECT COUNT(*) AS c FROM prj_todo_list ptl "
            "JOIN amo_family af ON af.amo_regno = ptl.amo_regno "
            "WHERE af.ville_id = %s AND ptl.job_progress NOT IN ('END','DONE','100')",
            [ville_id],
        )
        pending_total = int((pending_row or {}).get("c") or 0)

        # laggard: 최근 7일 동안 일지 0건인 농가 수
        laggard_row = fetch_one(
            "SELECT COUNT(*) AS c FROM amo_family af "
            "WHERE af.ville_id = %s AND NOT EXISTS ( "
            "  SELECT 1 FROM journal j WHERE j.amo_regno = af.amo_regno "
            "    AND j.deleted_dt IS NULL AND j.job_date >= CURRENT_DATE - 7 "
            ")",
            [ville_id],
        )
        laggard_count = int((laggard_row or {}).get("c") or 0)
    except Exception:  # noqa: BLE001
        pending_total = 0
        laggard_count = 0

    return AdviceContext(
        user_no=chief_user_no,
        user_name=user_name,
        ville_id=ville_id,
        advice_date=advice_date,
        weather_today=weather_today,
        weather_tomorrow=weather_tomorrow,
        is_chief=True,
        village_stats={
            "pending_total": pending_total,
            "laggard_count": laggard_count,
            "ville_name": village.get("ville_name"),
        },
    )


# ============================================================
# 생성 (배치/실시간 공용)
# ============================================================

def _rationale_from_match(match: RuleMatch, ctx: AdviceContext, gen_cd: str) -> dict[str, Any]:
    return {
        "scenario_cd": match.scenario_cd,
        "fields": match.fields,
        "gen_cd": gen_cd,
        "weather_today": ctx.weather_today,
        "weather_tomorrow": ctx.weather_tomorrow,
        "open_todo_count": len(ctx.open_todos),
        "last_diary_date": ctx.last_diary_date,
        "helper_role": ctx.helper_role,
        "village_stats": ctx.village_stats,
    }


def generate_for_farmer(*, user_no: int, advice_date: _date | None = None) -> dict[str, Any] | None:
    """농가 advice 생성 — 룰 매칭 → LLM → upsert. 매칭 없으면 None."""
    advice_date = advice_date or _date.today()
    ctx = _build_farmer_context(user_no=user_no, advice_date=advice_date)
    match = match_farmer_rule(ctx)
    if not match:
        return None
    text, gen_cd = compose_advice_text(
        match.scenario_cd, match.fields, match.fallback_template, purpose="today_word"
    )
    advice_rdb.upsert_advice(
        user_no=user_no,
        advice_date=advice_date,
        content=text,
        rationale=_rationale_from_match(match, ctx, gen_cd),
        action_url=match.action_url,
        ville_chief=False,
    )
    return advice_rdb.get_today_advice(user_no=user_no, advice_date=advice_date, ville_chief=False)


def generate_for_chief(*, ville_id: str, chief_user_no: int, advice_date: _date | None = None) -> dict[str, Any] | None:
    advice_date = advice_date or _date.today()
    ctx = _build_chief_context(ville_id=ville_id, chief_user_no=chief_user_no, advice_date=advice_date)
    match = match_chief_rule(ctx)
    if not match:
        return None
    text, gen_cd = compose_advice_text(
        match.scenario_cd, match.fields, match.fallback_template, purpose="today_word"
    )
    advice_rdb.upsert_advice(
        user_no=chief_user_no,
        advice_date=advice_date,
        content=text,
        rationale=_rationale_from_match(match, ctx, gen_cd),
        action_url=match.action_url,
        ville_chief=True,
    )
    return advice_rdb.get_today_advice(user_no=chief_user_no, advice_date=advice_date, ville_chief=True)


# ============================================================
# 화면 응답용 — 캐시 우선, 없으면 즉시 생성
# ============================================================

def get_today_for_farmer(*, farmer_id: str, force: bool = False) -> dict[str, Any] | None:
    """app_user 홈 화면용. 캐시 있으면 그대로, 없으면 즉시 생성 (rule+llm).
    force=True 면 캐시 무시하고 재생성 — 룰/프롬프트 변경 후 강제 갱신용.
    """
    rec = resolve_user_record(farmer_id)
    if not rec or rec.get("user_no") is None:
        return None
    user_no = int(rec["user_no"])
    today = _date.today()
    if not force:
        cached = advice_rdb.get_today_advice(user_no=user_no, advice_date=today, ville_chief=False)
        if cached:
            return cached
    return generate_for_farmer(user_no=user_no, advice_date=today)


def get_today_for_chief(*, chief_user_no: int, ville_id: str) -> dict[str, Any] | None:
    """web_user 대시보드용. 캐시 있으면 그대로, 없으면 즉시 생성."""
    today = _date.today()
    cached = advice_rdb.get_today_advice(user_no=chief_user_no, advice_date=today, ville_chief=True)
    if cached:
        return cached
    return generate_for_chief(ville_id=ville_id, chief_user_no=chief_user_no, advice_date=today)
