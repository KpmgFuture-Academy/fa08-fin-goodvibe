"""Kakao Local API + 기상청 동네예보 격자 변환 헬퍼.

농가 화면 날씨 위젯은 마을의 (nx, ny) 격자 좌표가 필요한데, village 테이블에
미리 등록된 경우와 주소만 있는 경우 두 가지를 모두 지원하기 위해:

  1) Kakao Local API 로 주소 → 위경도 (lat, lon) 얻기
  2) 위경도 → 기상청 LCC 격자 (nx, ny) 변환 (표준 공식)

둘 다 외부 호출 / 수치 계산이라 호출 측에서 한 번 변환 후 캐시 권장.
"""
from __future__ import annotations

import json
import math
import os
import urllib.parse
import urllib.request

# ============================================================
# Kakao 주소 → 위경도
# ============================================================

KAKAO_GEOCODE_ENDPOINT = "https://dapi.kakao.com/v2/local/search/address.json"


def geocode_address(address: str) -> tuple[float, float] | None:
    """주소 문자열 → (위도, 경도). 실패/매칭 없음 시 None.

    Kakao Local API 응답:
      documents[0].x = 경도(lon), documents[0].y = 위도(lat)
    """
    key = os.getenv("KAKAO_REST_API_KEY", "").strip()
    if not key or not address or not address.strip():
        return None

    url = f"{KAKAO_GEOCODE_ENDPOINT}?query={urllib.parse.quote(address.strip())}"
    request = urllib.request.Request(url, headers={"Authorization": f"KakaoAK {key}"})
    try:
        with urllib.request.urlopen(request, timeout=8) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except Exception:  # noqa: BLE001 — 외부 API 실패는 silent
        return None

    documents = payload.get("documents") or []
    if not documents:
        return None
    first = documents[0]
    try:
        return float(first["y"]), float(first["x"])
    except (KeyError, TypeError, ValueError):
        return None


# ============================================================
# 위경도 → 기상청 동네예보 격자 (LCC)
# ============================================================
#
# 기상청 단기예보 격자 표준 변환 — Lambert Conformal Conic projection.
# 공식 출처: 기상청 동네예보 발표 자료(2021 기준). 파라미터는 변경 없음.

_RE = 6371.00877  # 지구 반경 (km)
_GRID = 5.0       # 격자 간격 (km)
_SLAT1 = 30.0     # 표준위도 1
_SLAT2 = 60.0     # 표준위도 2
_OLON = 126.0     # 기준점 경도
_OLAT = 38.0      # 기준점 위도
_XO = 43          # 기준점 X 격자
_YO = 136         # 기준점 Y 격자


def latlon_to_grid(lat: float, lon: float) -> tuple[int, int]:
    """위경도(WGS84) → 기상청 LCC 격자 (nx, ny). 정수 반올림."""
    deg_rad = math.pi / 180.0
    re = _RE / _GRID
    slat1 = _SLAT1 * deg_rad
    slat2 = _SLAT2 * deg_rad
    olon = _OLON * deg_rad
    olat = _OLAT * deg_rad

    sn = math.tan(math.pi * 0.25 + slat2 * 0.5) / math.tan(math.pi * 0.25 + slat1 * 0.5)
    sn = math.log(math.cos(slat1) / math.cos(slat2)) / math.log(sn)
    sf = math.tan(math.pi * 0.25 + slat1 * 0.5)
    sf = (sf ** sn) * math.cos(slat1) / sn
    ro = math.tan(math.pi * 0.25 + olat * 0.5)
    ro = re * sf / (ro ** sn)

    ra = math.tan(math.pi * 0.25 + lat * deg_rad * 0.5)
    ra = re * sf / (ra ** sn)
    theta = lon * deg_rad - olon
    if theta > math.pi:
        theta -= 2.0 * math.pi
    if theta < -math.pi:
        theta += 2.0 * math.pi
    theta *= sn

    nx = int(ra * math.sin(theta) + _XO + 0.5)
    ny = int(ro - ra * math.cos(theta) + _YO + 0.5)
    return nx, ny


def address_to_grid(address: str) -> tuple[int, int] | None:
    """주소 한 번에 격자좌표로. Kakao 호출 + 격자 변환을 묶어서."""
    latlon = geocode_address(address)
    if not latlon:
        return None
    return latlon_to_grid(*latlon)
