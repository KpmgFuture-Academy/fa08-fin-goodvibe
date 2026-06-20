"""Kakao Local 주소 검색 proxy.

frontend (v0_chief) 의 AddressSearchPanel 이 사용자가 입력한 주소 키워드를 보내면
Kakao Local `/v2/local/search/address.json` 로 위임 — backend 에서 KAKAO_REST_API_KEY 를
header 에 실어 호출. (key 가 클라이언트로 노출되지 않게 backend proxy 형태)

응답을 frontend 가 바로 쓸 수 있는 단순 dict 배열로 정규화:
  { id, road_address, jibun_address, zip_code }
"""
from __future__ import annotations

import os
import urllib.parse
import urllib.request
import json

_KAKAO_SEARCH_URL = "https://dapi.kakao.com/v2/local/search/address.json"


class KakaoConfigError(RuntimeError):
    """KAKAO_REST_API_KEY 가 환경에 설정되지 않은 경우."""


def search_address(query: str, *, size: int = 10) -> list[dict]:
    """주소 키워드 → 후보 리스트.

    빈 query 는 빈 리스트로 즉시 반환 (Kakao 호출 절약).
    Kakao 401/403/5xx 는 그대로 전파해 호출자가 HTTPException 으로 변환.
    """
    query = (query or "").strip()
    if not query:
        return []

    key = os.getenv("KAKAO_REST_API_KEY", "").strip()
    if not key:
        raise KakaoConfigError("KAKAO_REST_API_KEY 가 backend .env 에 설정되어 있지 않습니다.")

    qs = urllib.parse.urlencode({"query": query, "size": max(1, min(size, 30))})
    req = urllib.request.Request(
        f"{_KAKAO_SEARCH_URL}?{qs}",
        headers={"Authorization": f"KakaoAK {key}"},
    )
    with urllib.request.urlopen(req, timeout=8) as response:  # noqa: S310 — 외부 API 호출
        body = response.read().decode("utf-8")
    payload = json.loads(body)
    documents = payload.get("documents") or []

    items: list[dict] = []
    for index, doc in enumerate(documents):
        road = doc.get("road_address") or {}
        jibun = doc.get("address") or {}
        items.append(
            {
                "id": f"kakao-{index}-{doc.get('x','')}-{doc.get('y','')}",
                "road_address": road.get("address_name") or "",
                "jibun_address": jibun.get("address_name") or doc.get("address_name") or "",
                "zip_code": road.get("zone_no") or "",
            }
        )
    return items
