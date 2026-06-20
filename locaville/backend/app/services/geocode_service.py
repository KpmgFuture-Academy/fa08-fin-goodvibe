"""GPS 좌표 → 대략적 주소 역지오코딩.

우선순위:
  1) 카카오 로컬 API (coord2regioncode) — 국내 주소 정확도 우수. ``KAKAO_REST_API_KEY`` 필요.
  2) 카카오 실패/키 없음 시 OpenStreetMap Nominatim (무료, 키 불필요) 로 폴백.

공통 원칙:
  - 어떤 경우에도 예외를 올리지 않고, 실패하면 빈 문자열("")을 반환한다(업로드를 막지 않음).
  - "대략적인 주소" 목적이라 도/시·군/읍·면·동 수준으로 간결하게 합친다.
  - 키 등 비밀값은 backend 환경변수(.env)에서만 읽는다. (프론트/소스에 하드코딩 금지)
"""
from __future__ import annotations

import json
import os
import urllib.parse
import urllib.request

_TIMEOUT_SEC = 4.0

# --- 카카오 로컬 ---
_KAKAO_REGION_URL = "https://dapi.kakao.com/v2/local/geo/coord2regioncode.json"

# --- Nominatim (폴백) ---
_NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse"
# Nominatim 사용 정책: 앱을 식별하는 User-Agent 필수.
_USER_AGENT = "locaville-jeotanmaeul/1.0 (evidence reverse-geocoding)"


def _kakao_reverse(lat: float, lon: float) -> str:
    """카카오 로컬 coord2regioncode 로 시도/시군구/읍면동 주소를 만든다. 실패하면 ""."""
    key = os.getenv("KAKAO_REST_API_KEY", "").strip()
    if not key:
        return ""
    try:
        # 카카오는 x=경도(lon), y=위도(lat) 순서.
        query = urllib.parse.urlencode({"x": f"{lon:.6f}", "y": f"{lat:.6f}"})
        req = urllib.request.Request(
            f"{_KAKAO_REGION_URL}?{query}",
            headers={"Authorization": f"KakaoAK {key}"},
        )
        with urllib.request.urlopen(req, timeout=_TIMEOUT_SEC) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        docs = payload.get("documents") or []
        if not docs:
            return ""
        # 법정동(region_type='B') 우선, 없으면 첫 번째(행정동).
        doc = next((d for d in docs if d.get("region_type") == "B"), docs[0])
        parts = [
            doc.get("region_1depth_name"),  # 시·도
            doc.get("region_2depth_name"),  # 시·군·구
            doc.get("region_3depth_name"),  # 읍·면·동
        ]
        out: list[str] = []
        for value in parts:
            v = str(value or "").strip()
            if v and v not in out:
                out.append(v)
        return " ".join(out).strip()
    except Exception:  # noqa: BLE001
        return ""


def _nominatim_compact(payload: dict) -> str:
    """Nominatim 응답에서 도/시·군/읍·면·동 수준의 간결한 한국어 주소."""
    addr = payload.get("address") or {}
    province = addr.get("province") or addr.get("state") or ""
    city = addr.get("city") or addr.get("county") or addr.get("town") or ""
    town = (
        addr.get("town")
        or addr.get("village")
        or addr.get("borough")
        or addr.get("suburb")
        or addr.get("neighbourhood")
        or addr.get("quarter")
        or ""
    )
    parts: list[str] = []
    for value in (province, city, town):
        v = str(value).strip()
        if v and v not in parts:
            parts.append(v)
    compact = " ".join(parts).strip()
    if compact:
        return compact
    return str(payload.get("display_name") or "").strip()


def _nominatim_reverse(lat: float, lon: float) -> str:
    """OpenStreetMap Nominatim 역지오코딩 (폴백). 실패하면 ""."""
    try:
        query = urllib.parse.urlencode(
            {
                "lat": f"{lat:.6f}",
                "lon": f"{lon:.6f}",
                "format": "json",
                "zoom": "14",  # 읍·면·동 수준
                "accept-language": "ko",
            }
        )
        req = urllib.request.Request(
            f"{_NOMINATIM_URL}?{query}",
            headers={"User-Agent": _USER_AGENT, "Accept": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=_TIMEOUT_SEC) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        if isinstance(payload, dict):
            return _nominatim_compact(payload)
        return ""
    except Exception:  # noqa: BLE001
        return ""


def reverse_geocode(lat: float | None, lon: float | None) -> str:
    """위도/경도 → 대략적 한국어 주소. 카카오 우선, 실패 시 Nominatim. 모두 실패하면 ""."""
    try:
        if lat is None or lon is None:
            return ""
        latf = float(lat)
        lonf = float(lon)
        # 0,0 (좌표 미캡처) 은 호출하지 않음.
        if latf == 0.0 and lonf == 0.0:
            return ""
    except (TypeError, ValueError):
        return ""

    addr = _kakao_reverse(latf, lonf)
    if addr:
        return addr
    return _nominatim_reverse(latf, lonf)
