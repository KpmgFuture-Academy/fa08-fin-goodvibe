"""이장님 대시보드 `농업기상` 카드 응답 빌더 (`/admin/agri-weather`).

frontend `AdminAgriWeather` 형식에 맞춰 다음을 반환합니다:
  - 현재 시점 관측치 (기온/습도/강수량/풍속) — 기상청 단기예보 가장 가까운 시점
  - 마을·관측지점 메타 (마을 정보는 user-ville/current-user 의 village)
  - weeklyForecast 7일치 (단기예보 +0~+2일 실데이터, +3~+6일은 단기 마지막 값으로 보간)

데이터 source:
  - 기상청 단기예보 (`weather_service.fetch_short_forecast_raw`) — DATA_GO_KR_SERVICEKEY
  - 마을 정보 (`user_ville_rdb.get_current_user_ville_info`)

graceful degradation:
  - 단기예보 실패 → fallback (isFallback=True) 응답으로 화면이 비지 않게.
"""
from __future__ import annotations

import logging
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta
from typing import Any

from app.repositories.user_ville_rdb import DEFAULT_CHIEF_USER_NO, get_current_user_ville_info
from app.services.weather_service import (
    aggregate_daily,
    fetch_current_weather,
    fetch_mid_forecast,
    fetch_short_forecast_raw,
)


# 중기예보 지역코드 매핑. 마을 ville_id 기반.
# - land_reg_id: 광역시도 코드 (육상/하늘상태)
# - ta_reg_id: 시·군 단위 지점번호 (기온)
# 향후 ville 테이블에 mid_land_code / mid_ta_code 컬럼 추가 시 동적 매핑으로 교체.
_MID_REG_BY_VILLE: dict[str, dict[str, str]] = {
    # 저탄선도마을 = 전남 고흥
    "LOCAVILLE01": {"land": "11F20000", "ta": "21F20801"},
}
_MID_REG_DEFAULT = {"land": "11F20000", "ta": "21F20801"}  # 전남 광주/고흥 기본

logger = logging.getLogger(__name__)


# SKY/PTY 코드 → frontend 가 해석할 라벨. (frontend 도 자체 매핑 가능하지만 backend 가
# 한 곳에서 의미 부여하는 게 일관성 좋음.)
SKY_LABEL = {"1": "맑음", "3": "구름많음", "4": "흐림"}
PTY_LABEL = {"0": "없음", "1": "비", "2": "비/눈", "3": "눈", "4": "소나기"}


def _ville_blocks(user_no: int | None) -> tuple[dict[str, Any], dict[str, Any], int | None, int | None]:
    """마을 정보 + (nx, ny) 반환. 실패 시 기본값."""
    try:
        info = get_current_user_ville_info(user_no=user_no or DEFAULT_CHIEF_USER_NO)
        village = info.get("village") or {}
        addr_1 = (village.get("addr_1") or "").strip()
        addr_2 = (village.get("addr_2") or "").strip()
        addr_full = f"{addr_1} {addr_2}".strip()
        return (
            {
                "name": village.get("ville_name") or "마을",
                "address": addr_full or "",
            },
            {
                # 관측지점은 일단 마을과 동일 표기 (향후 RDA 농업기상 관측지점 master 매핑).
                "code": str(village.get("ville_id") or "-"),
                "name": f"{village.get('ville_name') or '마을'} 인근 관측지점",
                "address": addr_full or "",
            },
            village.get("nx"),
            village.get("ny"),
        )
    except Exception:  # noqa: BLE001
        return (
            {"name": "마을", "address": ""},
            {"code": "-", "name": "기본 관측지점", "address": ""},
            None,
            None,
        )


def _mid_text_to_codes(sky_text: str) -> tuple[str, str]:
    """중기예보 'wf' 텍스트 (예: '맑음', '구름많음', '구름많고 비') → (sky, pty) 코드.

    중기예보는 단기예보처럼 1/3/4 같은 코드가 아니라 한국어 텍스트로만 옴.
    frontend 가 단기와 같은 아이콘 로직 쓰도록 동일 코드로 정규화.
    """
    text = (sky_text or "").strip()
    pty = "0"
    if "비/눈" in text or "진눈깨비" in text:
        pty = "2"
    elif "비" in text:
        pty = "1"
    elif "눈" in text:
        pty = "3"
    elif "소나기" in text:
        pty = "4"

    if "흐림" in text or "흐리고" in text:
        sky = "4"
    elif "구름많" in text:
        sky = "3"
    else:
        sky = "1"
    return sky, pty


def _build_weekly_forecast(
    daily_short: list[dict[str, Any]],
    mid: dict[int, dict[str, Any]],
    days: int = 7,
) -> list[dict[str, Any]]:
    """단기예보 (+0~+2일) + 중기예보 (+3~+10일) → 7일 forecast.

    중기예보 fetch 실패 시 단기 마지막 값을 carry-forward (is_extrapolated=True).
    """
    WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"]
    today = date.today()
    by_short_date: dict[str, dict[str, Any]] = {row["fcst_date"]: row for row in daily_short}
    last_short: dict[str, Any] | None = None

    result: list[dict[str, Any]] = []
    for offset in range(days):
        d = today + timedelta(days=offset)
        d_str = d.strftime("%Y%m%d")

        actual = by_short_date.get(d_str)
        if actual is not None:
            # 단기예보 실데이터
            last_short = actual
            row = {
                "fcst_date": d_str,
                "tmp_max": actual.get("tmp_max"),
                "tmp_min": actual.get("tmp_min"),
                "sky": actual.get("sky") or "1",
                "pty": actual.get("pty") or "0",
                "pop_max": actual.get("pop_max"),
            }
            is_ext = False
        elif offset in mid and mid[offset]:
            # 중기예보 실데이터 (텍스트 → 코드 변환).
            # 기상청 정책상 중기예보 기온은 +5일부터 제공 → +3, +4 일은 sky/pop 만 있고
            # 기온은 None. 그 경우 단기 마지막 값으로 부드럽게 보충 (carry-forward).
            m = mid[offset]
            sky, pty = _mid_text_to_codes(m.get("sky_text") or "")
            tmp_max = m.get("tmp_max")
            tmp_min = m.get("tmp_min")
            tmp_filled = False
            if tmp_max is None and last_short is not None:
                tmp_max = last_short.get("tmp_max")
                tmp_filled = True
            if tmp_min is None and last_short is not None:
                tmp_min = last_short.get("tmp_min")
                tmp_filled = True
            row = {
                "fcst_date": d_str,
                "tmp_max": tmp_max,
                "tmp_min": tmp_min,
                "sky": sky,
                "pty": pty,
                "pop_max": m.get("pop_max"),
            }
            # sky/pop 은 중기 진짜 데이터 → 기본은 is_extrapolated=False, 기온만 carry 한 경우만 true.
            is_ext = tmp_filled
        elif last_short is not None:
            # 단기·중기 모두 부족 → 단기 마지막 값 carry-forward
            row = {
                "fcst_date": d_str,
                "tmp_max": last_short.get("tmp_max"),
                "tmp_min": last_short.get("tmp_min"),
                "sky": last_short.get("sky") or "1",
                "pty": last_short.get("pty") or "0",
                "pop_max": last_short.get("pop_max"),
            }
            is_ext = True
        else:
            # 전부 비어 있음 → 안전 기본값
            row = {
                "fcst_date": d_str,
                "tmp_max": 24, "tmp_min": 16,
                "sky": "1", "pty": "0", "pop_max": 0,
            }
            is_ext = True

        result.append({
            **row,
            "day_of_week": WEEKDAYS[d.weekday()],
            "sky_label": SKY_LABEL.get(str(row["sky"]) or "1", "맑음"),
            "pty_label": PTY_LABEL.get(str(row["pty"]) or "0", "없음"),
            "is_extrapolated": is_ext,
        })
    return result


_AGRI_CACHE: dict[int | None, tuple[float, dict[str, Any]]] = {}
_AGRI_CACHE_TTL_SEC = 300.0  # 5분 — 외부 API 3개 직렬 호출이 7~8초 걸려서 dashboard timeout 에 걸림


def get_admin_agri_weather(*, user_no: int | None = None) -> dict[str, Any]:
    """대시보드 농업기상 카드 데이터.

    실패 시에도 isFallback=True 로 화면 그림. error 키에 사유.
    user_no 별 5분 in-memory cache — 첫 호출만 느리고 이후는 즉시.
    """
    now = time.monotonic()
    cached = _AGRI_CACHE.get(user_no)
    if cached and (now - cached[0]) < _AGRI_CACHE_TTL_SEC:
        return cached[1]

    village, station, nx, ny = _ville_blocks(user_no)
    cache_key = f"village:{station.get('code')}"
    ville_code = str(station.get("code") or "")
    mid_reg = _MID_REG_BY_VILLE.get(ville_code, _MID_REG_DEFAULT)

    # 외부 API 3개 (현재 날씨 + 단기예보 raw + 중기예보) 병렬 호출. 직렬은 7~8s, 병렬은 가장 느린 1개만큼만.
    with ThreadPoolExecutor(max_workers=3) as ex:
        fut_current = ex.submit(
            fetch_current_weather,
            village_nx=nx, village_ny=ny, village_address=village.get("address"), cache_key=cache_key,
        )
        fut_raw = ex.submit(
            fetch_short_forecast_raw,
            village_nx=nx, village_ny=ny, village_address=village.get("address"), cache_key=cache_key,
        )
        fut_mid = ex.submit(fetch_mid_forecast, land_reg_id=mid_reg["land"], ta_reg_id=mid_reg["ta"])
        current = fut_current.result()
        raw = fut_raw.result()
        mid = fut_mid.result()

    has_current = "error" not in current
    daily = aggregate_daily(raw.get("items") or []) if "error" not in raw else []

    weekly = _build_weekly_forecast(daily, mid)

    if has_current:
        weather_block = {
            "temperature": str(current.get("tmp") or "—"),
            "humidity": str(current.get("reh") or "—"),
            "rainfall": "0" if (current.get("pty") or "0") == "0" else "—",  # pty=0 → 강수없음
            # 단기예보 WSD (m/s) — _summarize 에서 추출됨.
            "windSpeed": str(current.get("wsd") or "—"),
        }
        observed_at = ""
        d, t = current.get("fcst_date"), current.get("fcst_time")
        if d and t and len(d) == 8 and len(t) >= 4:
            observed_at = f"{d[:4]}-{d[4:6]}-{d[6:8]} {t[:2]}:{t[2:4]}"
    else:
        weather_block = {"temperature": "—", "humidity": "—", "rainfall": "—", "windSpeed": "—"}
        observed_at = ""

    result = {
        "source": "기상청 동네예보 (단기예보) + RDA 농업기상 매핑",
        "village": village,
        "station": station,
        "observedAt": observed_at,
        "weather": weather_block,
        "guideLines": [],
        "weeklyForecast": weekly,
        "isFallback": not has_current,
        "fallbackReason": current.get("error") if not has_current else None,
    }
    # 정상 응답일 때만 캐싱 — 외부 API 일시 실패 결과까지 5분간 굳히지 않기 위함.
    if has_current:
        _AGRI_CACHE[user_no] = (now, result)
    return result
