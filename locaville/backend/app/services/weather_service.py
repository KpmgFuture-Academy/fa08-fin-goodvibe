"""기상청 동네예보(단기예보) API 래퍼 — v0_farmer 홈 화면 날씨 위젯용.

공공데이터포털(data.go.kr)의 ``VilageFcstInfoService_2.0/getVilageFcst`` 호출:
  - .env 의 DATA_GO_KR_SERVICEKEY 사용
  - 기본 위치는 농가가 속한 마을(서호마을) 의 격자좌표 (시연용 하드코딩)
  - 가장 가까운 발표 시각의 예보 1건만 추출해 농가 화면용 dict 로 정리

응답 카테고리 의미:
  - TMP : 기온 (°C)
  - SKY : 하늘상태 (1 맑음 / 3 구름많음 / 4 흐림)
  - PTY : 강수형태 (0 없음 / 1 비 / 2 비·눈 / 3 눈 / 4 소나기)
  - POP : 강수확률 (%)
  - REH : 습도 (%)
"""
from __future__ import annotations

import json
import os
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta
from typing import Any

from app.repositories.weather_rdb import list_weather_rows

# data.go.kr 의 단기예보 endpoint 는 활용신청 시점에 따라 v1 / v2.0 + http / https
# 중 어느 조합으로 활성화돼 있는지 다름. 첫 시도가 401/403 이면 fallback 순회.
KMA_ENDPOINTS = [
    "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst",
    "http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst",
    "https://apis.data.go.kr/1360000/VilageFcstInfoService/getVilageFcst",
    "http://apis.data.go.kr/1360000/VilageFcstInfoService/getVilageFcst",
]

# 동네예보 발표 시각 (3시간 간격, 시분 형식)
BASE_TIMES = [200, 500, 800, 1100, 1400, 1700, 2000, 2300]

# 격자 변환 실패 시 사용할 default — 서울 종로구.
DEFAULT_GRID: tuple[int, int] = (60, 127)

# 작물 → 농업주산지 격자 (추후 농촌진흥청 표준 주산지로 확장).
CROP_PRIMARY_REGION: dict[str, tuple[int, int]] = {
    "rice": (62, 110),  # 충남 부여 일대 (대표 쌀 주산지)
}

# 마을 주소 → 격자좌표 in-memory 캐시 (Kakao API 반복 호출 회피).
# 백엔드 재기동 시 초기화. 프로덕션은 Redis/디스크 캐시로 교체 권장.
_grid_cache: dict[str, tuple[int, int]] = {}


def _latest_base(now: datetime | None = None) -> tuple[str, str]:
    """가장 최근에 발표된 base_date, base_time 계산.

    동네예보는 발표 시각 후 약 10~15분 뒤 조회 가능. 안전하게 15분 지연 적용.
    자정~02:15 사이엔 전날 23시 발표를 사용.
    """
    current = (now or datetime.now()) - timedelta(minutes=15)
    hhmm = current.hour * 100 + current.minute
    candidates = [b for b in BASE_TIMES if b <= hhmm]
    if candidates:
        base = max(candidates)
        base_date = current.strftime("%Y%m%d")
    else:
        # 새벽 02:15 이전 → 전날 23시 발표
        yesterday = current - timedelta(days=1)
        base = 2300
        base_date = yesterday.strftime("%Y%m%d")
    return base_date, f"{base:04d}"


def _resolve_grid(
    *,
    crop_cd: str | None = None,
    village_nx: int | None = None,
    village_ny: int | None = None,
    village_address: str | None = None,
    cache_key: str | None = None,
) -> tuple[int, int]:
    """위치 우선순위:
       1. 작물 주산지 (crop_cd)
       2. village 테이블의 nx/ny (사전 등록)
       3. village 주소 → Kakao geocoding → LCC 격자 변환 (cache)
       4. default
    """
    if crop_cd:
        grid = CROP_PRIMARY_REGION.get(crop_cd.lower())
        if grid:
            return grid

    if village_nx is not None and village_ny is not None:
        return (int(village_nx), int(village_ny))

    if village_address:
        if cache_key and cache_key in _grid_cache:
            return _grid_cache[cache_key]
        # 지연 import — geocoding_service 가 weather_service 보다 의존성 가벼움.
        from app.services.geocoding_service import address_to_grid
        grid = address_to_grid(village_address)
        if grid:
            if cache_key:
                _grid_cache[cache_key] = grid
            return grid

    return DEFAULT_GRID


def _summarize(items: list[dict[str, Any]]) -> dict[str, Any]:
    """응답 items 에서 가장 가까운 fcst 시각의 5개 카테고리 추출 + 오늘자 최고/최저 기온.

    tmx/tmn:
      - TMX/TMN 카테고리가 있으면 그 값 (기상청 정식 최고/최저)
      - 없으면 같은 fcstDate 안의 TMP 시간별 max/min 으로 추정
    """
    if not items:
        return {"error": "예보 데이터가 비어있어요"}
    earliest = min((it.get("fcstDate", ""), it.get("fcstTime", "")) for it in items)
    near = [
        it for it in items
        if (it.get("fcstDate", ""), it.get("fcstTime", "")) == earliest
    ]
    summary = {it.get("category"): it.get("fcstValue") for it in near}

    # 오늘자 (earliest 날짜) TMX/TMN 추출
    today_date = earliest[0]
    same_day = [it for it in items if it.get("fcstDate") == today_date]

    def _to_float(v: Any) -> float | None:
        try:
            return float(v) if v is not None else None
        except (TypeError, ValueError):
            return None

    tmx_vals = [_to_float(it.get("fcstValue")) for it in same_day if it.get("category") == "TMX"]
    tmn_vals = [_to_float(it.get("fcstValue")) for it in same_day if it.get("category") == "TMN"]
    tmp_vals = [_to_float(it.get("fcstValue")) for it in same_day if it.get("category") == "TMP"]
    tmx_vals = [v for v in tmx_vals if v is not None]
    tmn_vals = [v for v in tmn_vals if v is not None]
    tmp_vals = [v for v in tmp_vals if v is not None]

    tmx = tmx_vals[0] if tmx_vals else (max(tmp_vals) if tmp_vals else None)
    tmn = tmn_vals[0] if tmn_vals else (min(tmp_vals) if tmp_vals else None)

    return {
        "fcst_date": earliest[0],
        "fcst_time": earliest[1],
        "tmp": summary.get("TMP"),
        "tmx": tmx,
        "tmn": tmn,
        "sky": summary.get("SKY"),
        "pty": summary.get("PTY"),
        "pop": summary.get("POP"),
        "reh": summary.get("REH"),
        # 단기예보 WSD (m/s) 풍속. 농업기상 카드의 windSpeed 필드용.
        "wsd": summary.get("WSD"),
    }


def fetch_current_weather(
    *,
    crop_cd: str | None = None,
    village_nx: int | None = None,
    village_ny: int | None = None,
    village_address: str | None = None,
    cache_key: str | None = None,
) -> dict[str, Any]:
    """기상청 단기예보 호출 → 현재 시각 인접 예보 1건 반환.

    위치 인자 우선순위 (`_resolve_grid` 참조):
      crop_cd → village_nx/ny → village_address (Kakao geocoding) → default.
    실패 시 dict 에 "error" 키. 호출 측은 fallback UI 표시.
    """
    service_key = (
        os.getenv("WEATHER_SERVICEKEY", "").strip()
        or os.getenv("DATA_GO_KR_SERVICEKEY", "").strip()
    )
    if not service_key:
        return {"error": "기상청 API 키가 설정되지 않았어요"}

    nx, ny = _resolve_grid(
        crop_cd=crop_cd,
        village_nx=village_nx,
        village_ny=village_ny,
        village_address=village_address,
        cache_key=cache_key,
    )
    base_date, base_time = _latest_base()

    params = {
        "serviceKey": service_key,
        "numOfRows": "200",
        "pageNo": "1",
        "dataType": "JSON",
        "base_date": base_date,
        "base_time": base_time,
        "nx": str(nx),
        "ny": str(ny),
    }
    # serviceKey 는 이미 URL-encoded 일 수도 있어 doseq 처리 후 encoding 보존.
    query = urllib.parse.urlencode(params, safe="%")
    last_error: Exception | None = None
    payload: dict[str, Any] | None = None
    for base in KMA_ENDPOINTS:
        url = f"{base}?{query}"
        try:
            with urllib.request.urlopen(url, timeout=8) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
            # 일부 응답은 200 이지만 resultCode != "00" 인 SERVICE_KEY 에러를 포함.
            # 그런 경우 다음 endpoint 시도.
            header = (payload.get("response") or {}).get("header") or {}
            if header.get("resultCode") == "00":
                break
            last_error = Exception(
                f"{header.get('resultCode')}: {header.get('resultMsg')}"
            )
            payload = None
        except Exception as exc:  # noqa: BLE001 — 외부 API 실패는 silent fallback
            last_error = exc
            payload = None
    if payload is None:
        return {"error": f"기상청 호출 실패: {last_error}", "nx": nx, "ny": ny}

    body = (payload.get("response") or {}).get("body") or {}
    items = ((body.get("items") or {}).get("item")) or []
    result = _summarize(items)
    result["nx"] = nx
    result["ny"] = ny
    return result


# ============================================================
# 일별 집계 (dashboard agri-weather 카드 / weather strip 용)
# ============================================================

def fetch_short_forecast_raw(
    *,
    crop_cd: str | None = None,
    village_nx: int | None = None,
    village_ny: int | None = None,
    village_address: str | None = None,
    cache_key: str | None = None,
) -> dict[str, Any]:
    """기상청 단기예보 raw items (시간별 +3일치) + 해석한 nx/ny 반환.

    `fetch_current_weather` 와 같은 endpoint/위치 로직을 공유하되, _summarize 하지 않고
    items 전체를 그대로 돌려줘 일별 집계가 가능하게 한다.

    실패 시 `{"error": ...}` 반환 (호출자 fallback 유도).
    """
    service_key = (
        os.getenv("WEATHER_SERVICEKEY", "").strip()
        or os.getenv("DATA_GO_KR_SERVICEKEY", "").strip()
    )
    if not service_key:
        return {"error": "기상청 API 키가 설정되지 않았어요"}

    nx, ny = _resolve_grid(
        crop_cd=crop_cd,
        village_nx=village_nx,
        village_ny=village_ny,
        village_address=village_address,
        cache_key=cache_key,
    )
    base_date, base_time = _latest_base()
    params = {
        "serviceKey": service_key,
        "numOfRows": "800",  # 시간×카테고리 = +3일치 모두 받기 위해 충분히 크게
        "pageNo": "1",
        "dataType": "JSON",
        "base_date": base_date,
        "base_time": base_time,
        "nx": str(nx),
        "ny": str(ny),
    }
    query = urllib.parse.urlencode(params, safe="%")
    last_error: Exception | None = None
    payload: dict[str, Any] | None = None
    for base in KMA_ENDPOINTS:
        url = f"{base}?{query}"
        try:
            with urllib.request.urlopen(url, timeout=10) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
            header = (payload.get("response") or {}).get("header") or {}
            if header.get("resultCode") == "00":
                break
            last_error = Exception(f"{header.get('resultCode')}: {header.get('resultMsg')}")
            payload = None
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            payload = None
    if payload is None:
        return {"error": f"기상청 호출 실패: {last_error}", "nx": nx, "ny": ny}

    body = (payload.get("response") or {}).get("body") or {}
    items = ((body.get("items") or {}).get("item")) or []
    return {"items": items, "nx": nx, "ny": ny, "base_date": base_date, "base_time": base_time}


def aggregate_daily(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """시간별 items → 일별 1 row 집계.

    각 날짜에 대해:
      - tmp_max / tmp_min: TMH(최고)/TMN(최저) 가 있으면 그것, 없으면 시간별 TMP 의 max/min
      - sky: 낮(12시 근접) 시점의 SKY (없으면 가장 첫 값)
      - pty: 낮 시점의 PTY (없으면 가장 첫 값)
      - pop_max: 그 날 POP 최댓값
    날짜는 fcstDate 기준 정렬.
    """
    by_date: dict[str, dict[str, list[Any]]] = {}
    for it in items:
        d = it.get("fcstDate") or ""
        t = it.get("fcstTime") or ""
        cat = it.get("category") or ""
        val = it.get("fcstValue")
        if not d:
            continue
        bucket = by_date.setdefault(d, {"tmp": [], "sky": [], "pty": [], "pop": [], "tmh": [], "tmn": []})
        if cat == "TMP":
            try: bucket["tmp"].append((t, float(val)))
            except (TypeError, ValueError): pass
        elif cat == "TMH":
            try: bucket["tmh"].append(float(val))
            except (TypeError, ValueError): pass
        elif cat == "TMN":
            try: bucket["tmn"].append(float(val))
            except (TypeError, ValueError): pass
        elif cat == "SKY":
            bucket["sky"].append((t, str(val)))
        elif cat == "PTY":
            bucket["pty"].append((t, str(val)))
        elif cat == "POP":
            try: bucket["pop"].append(int(val))
            except (TypeError, ValueError): pass

    def _midday(pairs: list[tuple[str, Any]]) -> Any | None:
        """(time, val) list 에서 12시에 가장 가까운 값."""
        if not pairs:
            return None
        def diff(p):
            try: return abs(int(p[0]) // 100 - 12)
            except Exception: return 99
        return sorted(pairs, key=diff)[0][1]

    result: list[dict[str, Any]] = []
    for d in sorted(by_date.keys()):
        b = by_date[d]
        tmp_max = max(b["tmh"]) if b["tmh"] else (max(v for _, v in b["tmp"]) if b["tmp"] else None)
        tmp_min = min(b["tmn"]) if b["tmn"] else (min(v for _, v in b["tmp"]) if b["tmp"] else None)
        result.append({
            "fcst_date": d,
            "tmp_max": round(tmp_max, 1) if tmp_max is not None else None,
            "tmp_min": round(tmp_min, 1) if tmp_min is not None else None,
            "sky": _midday(b["sky"]),
            "pty": _midday(b["pty"]),
            "pop_max": max(b["pop"]) if b["pop"] else None,
        })
    return result


# ============================================================
# 중기예보 (+3~+10일) — getMidLandFcst (육상/하늘상태) + getMidTa (기온)
# ============================================================
#
# 단기예보가 +3일까지만 제공해서 +4~+10일은 중기예보 두 API 를 같이 호출해야 함.
#   - getMidLandFcst: regId = 광역시도 코드 (예: "11F20000" 전남)
#   - getMidTa:       regId = 지점번호    (예: "21F20801" 고흥)
# 발표 시각: 매일 06시·18시 (06:00 이후 / 18:00 이후 조회 가능)

MID_LAND_ENDPOINTS = [
    "https://apis.data.go.kr/1360000/MidFcstInfoService/getMidLandFcst",
    "http://apis.data.go.kr/1360000/MidFcstInfoService/getMidLandFcst",
]
MID_TA_ENDPOINTS = [
    "https://apis.data.go.kr/1360000/MidFcstInfoService/getMidTa",
    "http://apis.data.go.kr/1360000/MidFcstInfoService/getMidTa",
]


def _mid_tmfc_candidates(now: datetime | None = None) -> list[str]:
    """발표 후보 시각 — 가장 최근부터 이전 1~2 발표까지 순회.

    중기예보는 06시·18시 발표 + 갱신까지 약 30분 지연. 발표 직후 호출 시 NO_DATA 가능 →
    fallback 으로 이전 발표 시각도 같이 후보로 둠. (호출자가 순차 시도해 첫 hit 사용.)
    안전 마진: 현재 시각에서 30분 빼고 가장 최근 발표 계산.
    """
    base_now = (now or datetime.now()) - timedelta(minutes=30)
    candidates: list[str] = []
    cursor = base_now
    for _ in range(3):  # 가장 최근 + 이전 2발표 (최대 24시간 전까지)
        if cursor.hour >= 18:
            base = cursor.replace(hour=18, minute=0, second=0, microsecond=0)
            prev = cursor.replace(hour=6, minute=0, second=0, microsecond=0)
        elif cursor.hour >= 6:
            base = cursor.replace(hour=6, minute=0, second=0, microsecond=0)
            prev = (cursor - timedelta(days=1)).replace(hour=18, minute=0, second=0, microsecond=0)
        else:
            base = (cursor - timedelta(days=1)).replace(hour=18, minute=0, second=0, microsecond=0)
            prev = (cursor - timedelta(days=1)).replace(hour=6, minute=0, second=0, microsecond=0)
        stamp = base.strftime("%Y%m%d%H%M")
        if stamp not in candidates:
            candidates.append(stamp)
        cursor = prev - timedelta(minutes=1)
    return candidates


def _mid_tmfc(now: datetime | None = None) -> str:
    """가장 최근 발표 시각 1개 — 후위 호환용 (지금은 fetch_mid_forecast 가 candidates 순회)."""
    return _mid_tmfc_candidates(now)[0]


def _kma_get_first_item(endpoints: list[str], params: dict[str, str]) -> dict[str, Any] | None:
    """공통 endpoint 순회 호출 → 첫 item 반환. NO_DATA(03)/실패 시 None."""
    query = urllib.parse.urlencode(params, safe="%")
    for base in endpoints:
        try:
            with urllib.request.urlopen(f"{base}?{query}", timeout=10) as resp:  # noqa: S310
                payload = json.loads(resp.read().decode("utf-8"))
            header = (payload.get("response") or {}).get("header") or {}
            if header.get("resultCode") != "00":
                continue
            body = (payload.get("response") or {}).get("body") or {}
            items = ((body.get("items") or {}).get("item")) or []
            if items:
                return items[0]
        except Exception:  # noqa: BLE001 — 외부 API 실패는 호출자 fallback
            continue
    return None


def _kma_get_first_item_with_tmfc_fallback(
    endpoints: list[str],
    base_params: dict[str, str],
    reg_id: str,
    tmfc_candidates: list[str],
) -> dict[str, Any] | None:
    """tmFc 후보를 순회하며 NO_DATA 면 다음 발표시각으로 자동 재시도."""
    for tmfc in tmfc_candidates:
        params = {**base_params, "tmFc": tmfc, "regId": reg_id}
        item = _kma_get_first_item(endpoints, params)
        if item:
            return item
    return None


def fetch_mid_forecast(*, land_reg_id: str, ta_reg_id: str) -> dict[str, Any]:
    """중기 육상예보 + 기온예보 → +3~+10일 일별 dict 7개 (key: day_offset 3..10).

    각 row: {sky_text, pop_max, tmp_min, tmp_max}.
    발표시각 NO_DATA 시 이전 발표로 자동 fallback. 모두 실패하면 빈 dict.
    """
    service_key = (
        os.getenv("WEATHER_SERVICEKEY", "").strip()
        or os.getenv("DATA_GO_KR_SERVICEKEY", "").strip()
    )
    if not service_key:
        return {}
    base_params = {
        "serviceKey": service_key,
        "numOfRows": "10",
        "pageNo": "1",
        "dataType": "JSON",
    }
    tmfc_candidates = _mid_tmfc_candidates()
    land = _kma_get_first_item_with_tmfc_fallback(MID_LAND_ENDPOINTS, base_params, land_reg_id, tmfc_candidates)
    ta = _kma_get_first_item_with_tmfc_fallback(MID_TA_ENDPOINTS, base_params, ta_reg_id, tmfc_candidates)
    if not land and not ta:
        return {}

    result: dict[int, dict[str, Any]] = {}
    for offset in range(3, 11):
        # 육상: wf{n}Am / wf{n}Pm (하늘상태 텍스트), rnSt{n}Am / rnSt{n}Pm (강수확률 %)
        wf_am = (land or {}).get(f"wf{offset}Am") if land else None
        wf_pm = (land or {}).get(f"wf{offset}Pm") if land else None
        rn_am = (land or {}).get(f"rnSt{offset}Am") if land else None
        rn_pm = (land or {}).get(f"rnSt{offset}Pm") if land else None
        # 8일 이후는 wf{n} (오전/오후 통합) 으로만 옴
        wf_day = (land or {}).get(f"wf{offset}") if land and offset >= 8 else None
        rn_day = (land or {}).get(f"rnSt{offset}") if land and offset >= 8 else None
        # 기온: taMin{n} / taMax{n}
        tmp_min = (ta or {}).get(f"taMin{offset}") if ta else None
        tmp_max = (ta or {}).get(f"taMax{offset}") if ta else None

        def _num(v: Any) -> float | None:
            try: return float(v) if v is not None else None
            except (TypeError, ValueError): return None

        result[offset] = {
            "sky_text": wf_pm or wf_am or wf_day or "",  # 오후 우선
            "pop_max": max(filter(lambda x: x is not None, [
                _num(rn_am), _num(rn_pm), _num(rn_day)
            ]), default=None),
            "tmp_max": _num(tmp_max),
            "tmp_min": _num(tmp_min),
        }
    return result


def resolve_weather_location(
    *,
    crop_cd: str | None = None,
    village_nx: int | None = None,
    village_ny: int | None = None,
    village_address: str | None = None,
    cache_key: str | None = None,
) -> dict[str, Any]:
    """온라인/배치 공용 위치 해석 결과를 반환합니다."""
    nx, ny = _resolve_grid(
        crop_cd=crop_cd,
        village_nx=village_nx,
        village_ny=village_ny,
        village_address=village_address,
        cache_key=cache_key,
    )
    return {"nx": nx, "ny": ny}


def _weather_row_to_api(row: dict[str, Any], *, tmx: float | None, tmn: float | None) -> dict[str, Any]:
    """weather 테이블 행을 `/weather/today` 응답 형태로 정규화합니다."""

    def _to_float(value: Any) -> float | None:
        try:
            return float(value) if value is not None else None
        except (TypeError, ValueError):
            return None

    def _to_int(value: Any) -> int | None:
        try:
            return int(value) if value is not None else None
        except (TypeError, ValueError):
            return None

    row_date = row.get("w_date")
    row_hour = _to_int(row.get("w_hour"))
    return {
        "fcst_date": row_date.strftime("%Y%m%d") if hasattr(row_date, "strftime") else str(row_date or ""),
        "fcst_time": f"{row_hour:02d}00" if row_hour is not None else None,
        "tmp": _to_float(row.get("temperature")),
        "tmx": tmx,
        "tmn": tmn,
        "sky": str(row.get("sky_cd") or ""),
        "pty": str(row.get("pty_cd") or ""),
        "pop": _to_int(row.get("precip_prob")),
        "reh": _to_int(row.get("humidity")),
        "wsd": None,
        "status": row.get("w_status") or "",
        "rain_hour": row.get("rain_hour"),
        "snow_hour": row.get("snow_hour"),
        "update_dt": row.get("update_dt"),
        "nx": _to_int(row.get("w_nx")),
        "ny": _to_int(row.get("w_ny")),
        "source": "db",
    }


def fetch_current_weather_from_db(
    *,
    crop_cd: str | None = None,
    village_nx: int | None = None,
    village_ny: int | None = None,
    village_address: str | None = None,
    cache_key: str | None = None,
    now: datetime | None = None,
) -> dict[str, Any]:
    """배치 적재된 weather 테이블에서 현재 시각과 가장 가까운 예보 1건을 반환합니다."""
    location = resolve_weather_location(
        crop_cd=crop_cd,
        village_nx=village_nx,
        village_ny=village_ny,
        village_address=village_address,
        cache_key=cache_key,
    )
    nx = int(location["nx"])
    ny = int(location["ny"])
    current = now or datetime.now()
    start_date = current.date()
    end_date = start_date + timedelta(days=1)
    rows = list_weather_rows(w_nx=nx, w_ny=ny, start_date=start_date, end_date=end_date, limit=72)
    if not rows:
        return {"error": "저장된 기상 데이터가 없어요", "nx": nx, "ny": ny, "source": "db"}

    def _row_dt(row: dict[str, Any]) -> datetime:
        row_date = row.get("w_date")
        row_hour = int(row.get("w_hour") or 0)
        if isinstance(row_date, date):
            return datetime.combine(row_date, datetime.min.time()).replace(hour=row_hour)
        return current

    future_rows = [row for row in rows if _row_dt(row) >= current]
    target = future_rows[0] if future_rows else rows[-1]
    target_date = target.get("w_date")
    same_day = [row for row in rows if row.get("w_date") == target_date]

    def _temp_values(candidates: list[dict[str, Any]]) -> list[float]:
        values: list[float] = []
        for row in candidates:
            try:
                if row.get("temperature") is not None:
                    values.append(float(row["temperature"]))
            except (TypeError, ValueError):
                continue
        return values

    temp_values = _temp_values(same_day)
    tmx = max(temp_values) if temp_values else None
    tmn = min(temp_values) if temp_values else None
    return _weather_row_to_api(target, tmx=tmx, tmn=tmn)


def fetch_hourly_weather_from_db(
    *,
    crop_cd: str | None = None,
    village_nx: int | None = None,
    village_ny: int | None = None,
    village_address: str | None = None,
    cache_key: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    limit: int = 48,
) -> dict[str, Any]:
    """배치 적재된 weather 테이블에서 시간대별 예보 목록을 반환합니다."""
    location = resolve_weather_location(
        crop_cd=crop_cd,
        village_nx=village_nx,
        village_ny=village_ny,
        village_address=village_address,
        cache_key=cache_key,
    )
    nx = int(location["nx"])
    ny = int(location["ny"])
    rows = list_weather_rows(
        w_nx=nx,
        w_ny=ny,
        start_date=start_date,
        end_date=end_date,
        limit=limit,
    )
    items = [_weather_row_to_api(row, tmx=None, tmn=None) for row in rows]
    return {
        "nx": nx,
        "ny": ny,
        "count": len(items),
        "items": items,
        "source": "db",
    }
