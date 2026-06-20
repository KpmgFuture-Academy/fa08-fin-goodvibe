"""주간 농사정보 (이장님 대시보드 `이번주 농사정보` 카드) 서비스.

frontend (`v0_chief`) 가 호출하는 `GET /admin/weekly-farm-info` 의 응답을 생성합니다.

데이터 source 우선순위:
  1) 농촌진흥청 농사로 OpenAPI `weekFarmInfoList` → 최신호 PDF 다운로드 → pypdf 텍스트 추출 →
     OpenAI LLM 으로 마을·작목 컨텍스트 기반 5~7줄 bullet 요약. (1차)
  2) 외부 API / PDF / LLM 어느 단계든 실패 시 → 시즌(월) 기반 정적 큐레이션 dict
     (`_SEASONAL_ITEMS`) 로 fallback. 화면이 비지 않게 보장.

caching:
  - 주간농사정보는 주 1회 발행 → 모듈 메모리 캐시(7일 TTL) 사용.
  - dev/single-process 기준. multi-worker prod 면 Redis 등으로 승격 필요 (TBD).

key:
  - `NONGSARO_API_KEY` (backend .env). frontend 노출 금지 — 이 service 가 backend proxy.
  - `OPENAI_API_KEY` 는 ai_service 의 helper 재사용.
"""
from __future__ import annotations

import logging
import os
import re
import time
import urllib.request
import xml.etree.ElementTree as ET
from datetime import date, timedelta
from pathlib import Path
from typing import Any

from app.repositories.user_ville_rdb import DEFAULT_CHIEF_USER_NO, get_current_user_ville_info

logger = logging.getLogger(__name__)


# ============================================================
# 시즌 기반 정적 fallback (외부 API / LLM 실패 시)
# ============================================================

_SEASONAL_ITEMS: dict[tuple[int, ...], list[dict[str, Any]]] = {
    (3, 4): [
        {
            "category": "춘파 준비",
            "summary": "춘파 작물 파종 + 봄갈이 준비 시기입니다.",
            "lines": [
                "본격적인 영농 시작 전 토양 정비를 마무리하세요.",
                "기상 변화에 주의해 파종 시기를 결정하세요.",
                "녹비작물 (호밀, 자운영) 의 적기 압살을 진행합니다.",
            ],
            "linkedTodo": None,
        }
    ],
    (5, 6): [
        {
            "category": "벼 논물관리",
            "summary": "호남 해안지 기준 중만생종 모내기 적기에 해당합니다.",
            "lines": [
                "중만생종 모내기 적기: 6.1~6.7",
                "중생종 모내기 적기: 6.9~6.15",
                "조생종 모내기 적기: 6.15~6.21",
                "모내기 때는 2~3cm 정도로 담수하세요.",
                "모낸 직후 7~10일간 5~7cm 깊이로 수위를 조절하세요.",
            ],
            "linkedTodo": None,
        }
    ],
    (7, 8): [
        {
            "category": "벼 중간물떼기",
            "summary": "중만생종 출수 30~40일 전 (7월 중하순) 중간 물떼기 시기입니다.",
            "lines": [
                "중간 물떼기는 7~10일간 시행합니다.",
                "논 바닥에 미세한 균열이 생길 정도가 적당합니다.",
                "물떼기 후 다시 담수하여 출수 20일 전까지 관리합니다.",
                "메탄 발생량 감소 → 저탄소농업 직접 효과로 이어집니다.",
            ],
            "linkedTodo": None,
        }
    ],
    (9, 10): [
        {
            "category": "벼 출수·등숙기",
            "summary": "출수 후 등숙기 — 적절한 수분 관리가 중요한 시기입니다.",
            "lines": [
                "출수 전후 10일은 5~7cm 물 깊이를 유지하세요.",
                "출수 후 30일경부터 점진적으로 물을 빼주세요.",
                "수확 7~10일 전에는 완전 낙수 합니다.",
            ],
            "linkedTodo": None,
        }
    ],
    (11, 12, 1, 2): [
        {
            "category": "동절기 관리",
            "summary": "수확 후 동절기 — 가을갈이 적기입니다.",
            "lines": [
                "가을갈이는 11월 중순까지 마무리하세요.",
                "볏짚은 잘게 잘라 골고루 펴서 분해를 촉진합니다.",
                "녹비작물 (호밀, 자운영) 파종 가능 시기입니다.",
            ],
            "linkedTodo": None,
        }
    ],
}


def _items_for_month(month: int) -> list[dict[str, Any]]:
    for months, items in _SEASONAL_ITEMS.items():
        if month in months:
            return items
    return []


# ============================================================
# 마을 컨텍스트 + 주차 라벨
# ============================================================

def _week_period_label(today: date) -> str:
    monday = today - timedelta(days=today.weekday())
    sunday = monday + timedelta(days=6)
    if monday.month == sunday.month:
        return f"{monday.year}.{monday.month}.{monday.day}.~{sunday.day}."
    return f"{monday.year}.{monday.month}.{monday.day}.~{sunday.month}.{sunday.day}."


def _ville_block(user_no: int | None) -> dict[str, Any]:
    """user-ville 컨텍스트에서 마을 정보 한 블록. 실패 시 기본값."""
    try:
        info = get_current_user_ville_info(user_no=user_no or DEFAULT_CHIEF_USER_NO)
        village = info.get("village") or {}
        addr_1 = (village.get("addr_1") or "").strip()
        addr_2 = (village.get("addr_2") or "").strip()
        return {
            "name": village.get("ville_name") or "마을",
            "address": (f"{addr_1} {addr_2}".strip()) or "",
            # region/zone master 미도입 → 일단 호남 해안지 hardcode.
            "region": "호남",
            "zone": "해안지",
        }
    except Exception:  # noqa: BLE001
        return {"name": "마을", "address": "", "region": "호남", "zone": "해안지"}


# ============================================================
# 외부 API + PDF + LLM (1차 데이터 소스)
# ============================================================

_NONGSARO_BASE_URL = "http://api.nongsaro.go.kr/service/weekFarmInfo/weekFarmInfoList"


def _fetch_latest_pdf_metadata() -> dict[str, str] | None:
    """nongsaro weekFarmInfoList 최신호 1건 metadata. 실패 시 None."""
    api_key = os.getenv("NONGSARO_API_KEY", "").strip()
    if not api_key:
        return None
    try:
        url = f"{_NONGSARO_BASE_URL}?apiKey={api_key}&numOfRows=1"
        with urllib.request.urlopen(url, timeout=10) as resp:  # noqa: S310
            xml_text = resp.read().decode("utf-8")
        root = ET.fromstring(xml_text)
        result_code = (root.findtext("./header/resultCode") or "").strip()
        if result_code != "00":
            logger.warning("nongsaro weekFarmInfo resultCode=%s", result_code)
            return None
        item = root.find("./body/items/item")
        if item is None:
            return None
        subject = (item.findtext("subject") or "").strip()
        reg_dt = (item.findtext("regDt") or "").strip()
        urls = (item.findtext("downUrlList") or "").split("|")
        names = (item.findtext("fileName") or "").split("|")
        pdf_url, file_name = "", ""
        for url_str, name in zip(urls, names):
            if name.lower().endswith(".pdf"):
                pdf_url, file_name = url_str.strip(), name.strip()
                break
        if not pdf_url and urls:
            pdf_url, file_name = urls[-1].strip(), (names[-1].strip() if names else "")
        return {"subject": subject, "regDt": reg_dt, "pdf_url": pdf_url, "file_name": file_name}
    except Exception as exc:  # noqa: BLE001 — 외부 API 실패는 fallback 유도.
        logger.warning("nongsaro weekFarmInfo metadata fetch failed: %s", exc)
        return None


def _download_pdf_text(pdf_url: str) -> str | None:
    """PDF 다운 + pypdf 텍스트 추출. 실패 시 None."""
    try:
        from pypdf import PdfReader  # 지역 import — 미설치 환경에서도 fallback 가능
        req = urllib.request.Request(pdf_url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=20) as resp:  # noqa: S310
            pdf_bytes = resp.read()
        tmp_dir = Path(os.environ.get("TEMP") or os.environ.get("TMPDIR") or "/tmp")
        tmp_path = tmp_dir / "_weekfarm.pdf"
        tmp_path.write_bytes(pdf_bytes)
        reader = PdfReader(str(tmp_path))
        return "\n".join(p.extract_text() or "" for p in reader.pages)
    except Exception as exc:  # noqa: BLE001
        logger.warning("weekFarmInfo PDF text extract failed: %s", exc)
        return None


def _llm_summarize(pdf_text: str, *, village_name: str, crop: str, period: str) -> list[dict[str, Any]] | None:
    """OpenAI LLM 으로 마을·작목 기반 1~2개 카테고리 요약. 실패 시 None."""
    try:
        # ai_service 의 helper 재사용 (key 로딩, client, model name).
        from app.services.ai_service import _get_openai_client, _get_model_name
        client = _get_openai_client()
        model = _get_model_name()
    except Exception as exc:  # noqa: BLE001
        logger.warning("OpenAI client unavailable: %s", exc)
        return None

    system = (
        "당신은 한국 농업인을 돕는 친근한 농업 비서입니다. "
        "주간농사정보 본문에서 특정 마을의 주작목 농가가 이번주 해야 할 일을 5~7줄 bullet 으로 요약합니다. "
        "응답은 반드시 JSON 으로만: "
        '{"items": [{"category": str, "summary": str, "lines": [str, ...]}]}. '
        "lines 는 각 35자 내외, 농가가 바로 행동할 수 있는 구체적 안내."
    )
    user = (
        f"마을: {village_name}\n작목: {crop}\n주차: {period}\n\n"
        f"=== 주간농사정보 본문 ===\n{pdf_text[:12000]}\n=== 끝 ===\n\n"
        "위 본문 중 해당 작목·시기에 맞는 내용을 1~2개 카테고리로 묶고, "
        "각 카테고리마다 농가가 이번주 해야 할 일을 5~7줄 bullet 으로 정리해주세요."
    )

    try:
        completion = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            response_format={"type": "json_object"},
            temperature=0.3,
        )
        raw = completion.choices[0].message.content or "{}"
        import json
        parsed = json.loads(raw)
        items = parsed.get("items") or []
        if not isinstance(items, list):
            return None
        cleaned: list[dict[str, Any]] = []
        for item in items:
            if not isinstance(item, dict):
                continue
            category = str(item.get("category") or "").strip()
            summary = str(item.get("summary") or "").strip()
            lines = [str(line).strip() for line in (item.get("lines") or []) if str(line).strip()]
            if not category and not lines:
                continue
            cleaned.append({
                "category": category or "이번주 할 일",
                "summary": summary,
                "lines": lines,
                "linkedTodo": None,
            })
        return cleaned or None
    except Exception as exc:  # noqa: BLE001 — LLM 실패는 fallback 유도.
        logger.warning("weekFarmInfo LLM summarize failed: %s", exc)
        return None


# ============================================================
# 캐시 + 메인 진입점
# ============================================================

_CACHE: dict[str, dict[str, Any]] = {}
_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60  # 7일 (주 1회 발행).


def _cache_key(village_name: str, crop: str) -> str:
    return f"{village_name}|{crop}"


def get_weekly_farm_info(
    *,
    user_no: int | None = None,
    today: date | None = None,
    crop: str = "벼",
) -> dict[str, Any]:
    """주간 농사정보 응답.

    1) cache hit 면 그대로 반환.
    2) nongsaro API → PDF → LLM 시도 (1차).
    3) 어느 단계든 실패 시 시즌 정적 dict 로 fallback (graceful).
    """
    today = today or date.today()
    village = _ville_block(user_no)
    period = _week_period_label(today)

    key = _cache_key(village["name"], crop)
    now_ts = time.time()
    cached = _CACHE.get(key)
    if cached and (now_ts - cached["fetched_at"]) < _CACHE_TTL_SECONDS:
        return cached["payload"]

    # 1차: 외부 API → PDF → LLM
    items: list[dict[str, Any]] | None = None
    source = "농촌진흥청 주간농사정보 (시즌 큐레이션)"
    metadata = _fetch_latest_pdf_metadata()
    if metadata and metadata.get("pdf_url"):
        pdf_text = _download_pdf_text(metadata["pdf_url"])
        if pdf_text:
            # 본문 제목에 기간이 있으면 그것을 우선 사용 (실제 발행 주차).
            subj_match = re.search(
                r"\(\s*(\d{4}\.\s*\d+\.\s*\d+\.?\s*~\s*\d+\.\s*\d+\.?)\s*\)",
                metadata.get("subject", ""),
            )
            if subj_match:
                period = subj_match.group(1).replace(" ", "")
            items = _llm_summarize(pdf_text, village_name=village["name"], crop=crop, period=period)
            if items:
                source = f"농촌진흥청 농사로 · {metadata['subject']}"

    # 2차: fallback — 시즌 정적 dict
    if not items:
        items = _items_for_month(today.month)

    payload = {
        "period": period,
        "source": source,
        "village": village,
        "matchedCrops": [crop],
        "items": items,
    }
    _CACHE[key] = {"fetched_at": now_ts, "payload": payload}
    return payload
