"""advice 시나리오 룰 — 농가 컨텍스트(날씨/todo/일지 상태) 를 보고 매칭되는 시나리오 1개 선택.

룰은 우선순위 순. 첫 매칭이 선택됨.
각 룰의 출력: {scenario_cd, fields, action_url, fallback_template}.
LLM 은 시나리오 안의 fields 만 사용해 한 줄 자연어 생성. LLM 실패 시 fallback_template 사용.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any, Callable, Optional


@dataclass
class AdviceContext:
    """advice 생성 입력 컨텍스트."""
    user_no: int
    user_name: str = ""
    amo_regno: str = ""
    ville_id: str = ""
    crop: str = "벼"
    advice_date: date | None = None
    # 날씨 — weather-service 응답 dict 또는 None
    weather_today: dict[str, Any] | None = None
    weather_tomorrow: dict[str, Any] | None = None
    # 미완료 todo 목록 — 각 {job_cd, job_name, due_date, ...}
    open_todos: list[dict[str, Any]] = field(default_factory=list)
    # 마지막 일지 작성일 (ISO 'YYYY-MM-DD') 또는 None
    last_diary_date: str | None = None
    # 본인의 helper 역할: "none" | "helper" | "recipient"
    helper_role: str = "none"
    # 미처리 재촬영 요청 개수
    pending_retake: int = 0
    # 이장(ville_chief) advice 인지
    is_chief: bool = False
    # 마을 단위 통계 (이장 advice 에만 사용)
    village_stats: dict[str, Any] | None = None


@dataclass
class RuleMatch:
    scenario_cd: str
    fields: dict[str, Any]
    fallback_template: str   # LLM 실패 시 그대로 사용 ({...} 채워서)
    action_url: str | None = None


def _weather_brief(weather: dict[str, Any] | None) -> str:
    """날씨 한 줄 요약 — fields 에 넣어 LLM 이 자연어로 활용. 없으면 빈 문자열."""
    if not weather:
        return ""
    sky = str(weather.get("sky") or "")
    pty = str(weather.get("pty") or "0")
    tmp = weather.get("tmp")
    pop = weather.get("pop")
    sky_label = {"1": "맑음", "3": "구름 많음", "4": "흐림"}.get(sky, "")
    pty_label = {"1": "비", "2": "비/눈", "3": "눈", "4": "소나기"}.get(pty, "")
    parts: list[str] = []
    if pty_label:
        parts.append(pty_label)
    elif sky_label:
        parts.append(sky_label)
    if tmp is not None:
        parts.append(f"{tmp}도")
    if pop is not None and int(pop or 0) > 0:
        parts.append(f"강수 {pop}%")
    return ", ".join(parts)


def _enrich(fields: dict[str, Any], ctx: "AdviceContext") -> dict[str, Any]:
    """공통 컨텍스트 보강 — 모든 시나리오에 날씨 brief 자동 포함.
    LLM 이 '오늘은 구름 많고 28도예요' 같이 자연스럽게 활용할 수 있도록.
    """
    enriched = dict(fields)
    today_brief = _weather_brief(ctx.weather_today)
    tomorrow_brief = _weather_brief(ctx.weather_tomorrow)
    if today_brief:
        enriched.setdefault("weather_today", today_brief)
    if tomorrow_brief:
        enriched.setdefault("weather_tomorrow", tomorrow_brief)
    return enriched


# ============================================================
# 룰 정의 — 농가용
# ============================================================

def _has_water_todo(todos: list[dict[str, Any]]) -> dict[str, Any] | None:
    for t in todos:
        code = (t.get("job_cd") or "").upper()
        # R0006(초기 물 관리), R0008(중간 물떼기), R0009(논물 얕게 걸러대기), R0010(논물 빼기)
        if code in {"R0006", "R0008", "R0009", "R0010"}:
            return t
    return None


def _has_outdoor_todo(todos: list[dict[str, Any]]) -> dict[str, Any] | None:
    """야외 작업 — 시비/방제/제초/이앙 등. 교육·구매 제외."""
    for t in todos:
        code = (t.get("job_cd") or "").upper()
        if code.startswith("R") or code in {"A0001", "A0002", "A0003", "A0004", "A0006"}:
            return t
    return None


def _is_rainy(weather: dict[str, Any] | None, threshold: int = 70) -> bool:
    if not weather:
        return False
    pty = str(weather.get("pty") or "0")
    if pty in {"1", "2", "4"}:
        return True
    try:
        pop = int(weather.get("pop") or 0)
    except (TypeError, ValueError):
        pop = 0
    return pop >= threshold


def _is_hot(weather: dict[str, Any] | None, threshold: int = 30) -> bool:
    if not weather:
        return False
    try:
        return int(weather.get("tmp") or 0) >= threshold
    except (TypeError, ValueError):
        return False


def _days_since(iso_date: str | None, today: date) -> int | None:
    if not iso_date:
        return None
    try:
        from datetime import datetime
        d = datetime.fromisoformat(iso_date).date()
        return (today - d).days
    except (ValueError, TypeError):
        return None


# 우선순위 순 — 위에 있을수록 먼저 매칭.
def match_farmer_rule(ctx: AdviceContext) -> Optional[RuleMatch]:
    name = ctx.user_name or "어르신"
    today_brief = _weather_brief(ctx.weather_today)
    tomorrow_brief = _weather_brief(ctx.weather_tomorrow)

    # 1) 미처리 재촬영 요청 — 가장 시급
    if ctx.pending_retake > 0:
        match = RuleMatch(
            scenario_cd="RETAKE_PEND",
            fields={"name": name, "count": ctx.pending_retake},
            fallback_template=f"사진 다시 찍어달라는 요청이 {ctx.pending_retake}건 있어요. 한번 확인해 주세요.",
            action_url="/notifications",
        )
        match.fields = _enrich(match.fields, ctx)
        return match

    # 2) 내일 비 + 논물 todo
    water = _has_water_todo(ctx.open_todos)
    if _is_rainy(ctx.weather_tomorrow) and water:
        job_name = water.get("job_name") or "논물 작업"
        match = RuleMatch(
            scenario_cd="RAIN_WATER",
            fields={"name": name, "job_name": job_name},
            fallback_template=(
                f"내일 비 예보예요. {job_name} 사진은 오늘 찍어두면 좋아요."
            ),
            action_url="/todo",
        )
        match.fields = _enrich(match.fields, ctx)
        return match

    # 3) 오늘 폭염 + 야외 todo
    outdoor = _has_outdoor_todo(ctx.open_todos)
    if _is_hot(ctx.weather_today) and outdoor:
        tmp = ctx.weather_today.get("tmp") if ctx.weather_today else None
        job_name = (outdoor.get("job_name") or "야외 작업").strip()
        match = RuleMatch(
            scenario_cd="HOT_OUTDOOR",
            fields={"name": name, "tmp": tmp, "job_name": job_name},
            fallback_template=(
                f"오늘은 {tmp}도까지 올라요. 오전에 {job_name} 마치고 사진 한 장 남겨두세요."
            ),
            action_url="/todo",
        )
        match.fields = _enrich(match.fields, ctx)
        return match

    # 4) 일반 todo — 가장 흔한 케이스. 날씨 fetch 실패해도 todo 만 있으면 매칭.
    # helper 시나리오보다 우선 — helper 는 헤더 띠로 별도 표시되므로 advice 까지 가져가지 않음.
    if ctx.open_todos:
        top_todo = ctx.open_todos[0]
        job_name = (top_todo.get("job_name") or top_todo.get("activity_name") or "오늘 할 일").strip()
        match = RuleMatch(
            scenario_cd="TODAY_TODO",
            fields={
                "name": name,
                "job_name": job_name,
                "needs_photo": True,
            },
            fallback_template=(
                f"오늘은 {today_brief}예요. {job_name} 마치고 사진 한 장 남겨두세요."
                if today_brief
                else f"오늘 '{job_name}' 잊지 마세요. 사진 한 장 남겨두면 끝나요."
            ),
            action_url="/todo",
        )
        match.fields = _enrich(match.fields, ctx)
        return match

    # 5) 일지 공백 3일+
    days = _days_since(ctx.last_diary_date, ctx.advice_date or date.today())
    if days is not None and days >= 3:
        match = RuleMatch(
            scenario_cd="DIARY_IDLE",
            fields={"name": name, "days": days},
            fallback_template=f"며칠 동안 적은 일이 없네요. 오늘 한 일 한 줄 남겨보세요.",
            action_url="/journal",
        )
        match.fields = _enrich(match.fields, ctx)
        return match

    # 6) todo 없는 날 + 날씨만
    if not ctx.open_todos and today_brief:
        match = RuleMatch(
            scenario_cd="IDLE_DAY",
            fields={"name": name},
            fallback_template=f"오늘은 {today_brief}예요. 오늘 한 농사 있으시면 한 줄 남겨두세요.",
            action_url="/journal",
        )
        match.fields = _enrich(match.fields, ctx)
        return match

    # helper 시나리오는 advice 로 다루지 않음 — 헤더의 갈색 띠가 이미 helper 모드를 강조.
    # advice 까지 중복 사용하면 매번 같은 멘트 반복되어 신뢰 저하.

    # 7) 매칭 없음 — None 반환 (advice 카드 미노출)
    _ = tomorrow_brief  # silence unused
    return None


# ============================================================
# 룰 정의 — 이장용 (마을 단위)
# ============================================================

def match_chief_rule(ctx: AdviceContext) -> Optional[RuleMatch]:
    stats = ctx.village_stats or {}
    name = ctx.user_name or "이장님"

    laggard = int(stats.get("laggard_count") or 0)
    pending = int(stats.get("pending_total") or 0)

    # 1) 미입력 농가 다수
    if laggard >= 3:
        return RuleMatch(
            scenario_cd="LAGGARD_ALERT",
            fields={"name": name, "count": laggard},
            fallback_template=f"기록이 늦어진 농가가 {laggard}곳 있어요. 한 번 챙겨봐 주세요.",
            action_url="/dashboard",
        )

    # 2) 내일 비 + 마을 미완료 todo
    if _is_rainy(ctx.weather_tomorrow) and pending > 0:
        return RuleMatch(
            scenario_cd="RAIN_PEND_TODO",
            fields={"name": name, "pending": pending},
            fallback_template=f"내일 비 예보예요. 마을 미완료 todo {pending}건 — 농가들께 알려두면 좋아요.",
            action_url="/dashboard",
        )

    # 3) 오늘 폭염
    if _is_hot(ctx.weather_today):
        tmp = ctx.weather_today.get("tmp") if ctx.weather_today else None
        return RuleMatch(
            scenario_cd="HOT_VILLE",
            fields={"name": name, "tmp": tmp},
            fallback_template=f"오늘 {tmp}도까지 올라요. 농가들 야외 작업 일찍 마치도록 안내해 주세요.",
            action_url="/dashboard",
        )

    # 4) 평시 — 기본 인사
    if pending > 0:
        return RuleMatch(
            scenario_cd="PEND_DEFAULT",
            fields={"name": name, "pending": pending},
            fallback_template=f"오늘 마을 미완료 todo {pending}건이에요.",
            action_url="/dashboard",
        )

    return None


# scenario_cd → 한국어 라벨 (관리자 분석용)
SCENARIO_LABELS: dict[str, str] = {
    "RETAKE_PEND": "재촬영 대기",
    "RAIN_WATER": "내일 비 + 논물 작업",
    "HOT_OUTDOOR": "폭염 + 야외 작업",
    "TODAY_TODO": "오늘 할 일 + 오늘 날씨",
    "HELPER_TODAY": "도우미 활성",
    "RECIPIENT_TODAY": "도움 받는 중",
    "DIARY_IDLE": "일지 공백",
    "IDLE_DAY": "할 일 없는 날",
    "LAGGARD_ALERT": "미입력 농가 다수",
    "RAIN_PEND_TODO": "비 + 마을 미완료",
    "HOT_VILLE": "마을 폭염",
    "PEND_DEFAULT": "평시 안내",
}
