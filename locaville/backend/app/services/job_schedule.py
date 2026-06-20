"""작업 스케줄 룰 — anchor / after / choice 세 종류.

농촌진흥청 표준 일정과 농가 융통성을 같이 반영합니다.

  - anchor: 농가가 시점 결정 (모내기 R0005, 가을갈이 RD002 등).
  - after:  anchor 기준 상대 일자. anchor 일지 저장 시 후속 todo 의 est_*_date 를 UPDATE.
  - choice: 두 개 이상의 시즌 윈도우 중 농가가 선택. **활성 윈도우 안에서만 처리함에 노출**.
            농가가 봄 안 했으면 가을 윈도우 진입 시 자동으로 다시 보임.

DB 자산:
  - farm_job.start_mmdd / end_mmdd 가 작업 제철 윈도우(MMDD) 를 이미 보유.
    여기 룰은 그 위의 비즈니스 정책 (어느 작업이 어디에 종속되는지) 만 인코딩.
  - prj_todo_list.est_start_date / est_end_date 는 그대로 두고, 현재 시점 기준
    "노출 가능한지" 만 lazy 계산 — 매 read 시 DB UPDATE 안 함.
"""
from __future__ import annotations

from datetime import date
from typing import Literal, TypedDict


class _AnchorRule(TypedDict, total=False):
    type: Literal["anchor"]
    season: tuple[str, str]  # ("MMDD", "MMDD") — 보통 윈도우 안내용


class _AfterRule(TypedDict, total=False):
    type: Literal["after"]
    of: str            # predecessor job_cd
    days: tuple[int, int]  # (min, max) — anchor 일자 + days


class _ChoiceOption(TypedDict, total=False):
    label: str
    season: tuple[str, str]   # ("MMDD", "MMDD")
    must_before: str          # 이 윈도우는 이 job 전이어야 함
    must_after: str


class _ChoiceRule(TypedDict, total=False):
    type: Literal["choice"]
    options: list[_ChoiceOption]


# 농촌진흥청 표준 (조정 가능). 초기 시드는 보수적으로 R-series 와 RD001 만.
JOB_SCHEDULE: dict[str, _AnchorRule | _AfterRule | _ChoiceRule] = {
    # ── Anchor ────────────────────────────────────────────
    "R0005": {"type": "anchor", "season": ("0510", "0610")},  # 모내기

    # ── After (모내기 기준 상대일) ─────────────────────────
    "R0006": {"type": "after", "of": "R0005", "days": (1, 7)},      # 초기 물관리
    "R0008": {"type": "after", "of": "R0005", "days": (30, 45)},    # 중간 물떼기
    "R0010": {"type": "after", "of": "R0005", "days": (90, 100)},   # 논물 빼기
    "R0011": {"type": "after", "of": "R0005", "days": (110, 130)},  # 수확

    # ── Choice (시즌 윈도우 중 선택) ───────────────────────
    # 바이오차 — 봄(모내기 전) 또는 가을(수확 후) 중 농가 선택.
    "RD001": {
        "type": "choice",
        "options": [
            {
                "label": "봄(모내기 전)",
                "season": ("0301", "0510"),
                "must_before": "R0005",
            },
            {
                "label": "가을(수확 후)",
                "season": ("0810", "0915"),
                "must_after": "R0011",
                "must_before": "RD002",
            },
        ],
    },

    # ── After (수확 기준) ─────────────────────────────────
    "RD002": {"type": "after", "of": "R0011", "days": (10, 30)},    # 가을갈이
}


def _mmdd_to_date(mmdd: str, year: int) -> date:
    """'0301' + 2026 → date(2026, 3, 1)."""
    return date(year, int(mmdd[:2]), int(mmdd[2:]))


def resolve_active_window(job_cd: str, today: date) -> tuple[date, date] | None:
    """choice 타입 작업의 **현재 활성 윈도우** 반환. 활성 없으면 None.

    예: 바이오차(RD001), today=2026-04-15
        → 봄 윈도우(3/1~5/10) 안이므로 (2026-03-01, 2026-05-10) 반환.
    예: today=2026-06-20 (봄 끝, 가을 시작 전)
        → None (처리함에 노출 X).
    예: today=2026-08-25 → 가을 윈도우 반환.

    choice 타입이 아니면 항상 None.
    """
    rule = JOB_SCHEDULE.get(job_cd)
    if not rule or rule.get("type") != "choice":
        return None
    for option in rule.get("options", []):
        start_mmdd, end_mmdd = option["season"]
        start = _mmdd_to_date(start_mmdd, today.year)
        end = _mmdd_to_date(end_mmdd, today.year)
        if start <= today <= end:
            return (start, end)
    return None


def is_visible_in_inbox(job_cd: str, today: date) -> bool:
    """이 todo 를 농가/이장 처리함에 노출할지 결정.

    - choice 타입: 활성 윈도우 안일 때만 노출 (그 외엔 숨김 — 봄에서 가을 사이 공백 기간).
    - 그 외(anchor / after / 미정의): 항상 노출 (기존 동작 유지).
    """
    rule = JOB_SCHEDULE.get(job_cd)
    if not rule:
        return True
    if rule.get("type") == "choice":
        return resolve_active_window(job_cd, today) is not None
    return True


def is_choice_type(job_cd: str) -> bool:
    """frontend 가 "봄/가을 선택" UI 를 띄울지 판단할 때 사용."""
    rule = JOB_SCHEDULE.get(job_cd)
    return bool(rule and rule.get("type") == "choice")


def get_choice_options(job_cd: str) -> list[_ChoiceOption]:
    """choice 타입의 선택지 목록. 그 외는 빈 배열."""
    rule = JOB_SCHEDULE.get(job_cd)
    if not rule or rule.get("type") != "choice":
        return []
    return list(rule.get("options", []))


def shift_after_anchor(job_cd: str, anchor_date: date) -> tuple[date, date] | None:
    """after 타입의 (est_start_date, est_end_date) 를 anchor 기준으로 계산.

    예: shift_after_anchor("R0008", date(2026, 5, 25))
        → (2026-06-24, 2026-07-09)  # 모내기 + 30~45일
    after 타입 아니면 None.
    """
    from datetime import timedelta
    rule = JOB_SCHEDULE.get(job_cd)
    if not rule or rule.get("type") != "after":
        return None
    days_min, days_max = rule["days"]  # type: ignore[typeddict-item]
    return (anchor_date + timedelta(days=days_min), anchor_date + timedelta(days=days_max))


def anchor_for(job_cd: str) -> str | None:
    """이 작업이 after 타입이면 predecessor job_cd 반환, 아니면 None."""
    rule = JOB_SCHEDULE.get(job_cd)
    if rule and rule.get("type") == "after":
        return rule.get("of")
    return None
