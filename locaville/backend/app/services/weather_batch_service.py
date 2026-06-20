"""기상 데이터 배치 적재 서비스.

기상청 단기예보(raw) 응답을 시간대별 weather 행으로 정규화해 DB 에 upsert 합니다.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Any

from app.repositories.weather_rdb import list_weather_sync_targets, upsert_weather_rows
from app.services.weather_service import fetch_short_forecast_raw


def _parse_float(value: Any) -> float | None:
    try:
        return float(value) if value is not None and str(value).strip() != "" else None
    except (TypeError, ValueError):
        return None


def _parse_int(value: Any) -> int | None:
    try:
        return int(float(value)) if value is not None and str(value).strip() != "" else None
    except (TypeError, ValueError):
        return None


def _normalize_precip_text(value: Any) -> str | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    if raw in {"강수없음", "적설없음"}:
        return "0"
    return raw


def _status_text(sky_code: Any, pty_code: Any) -> str:
    pty = str(pty_code or "0").strip()
    if pty == "1":
        return "비"
    if pty == "2":
        return "비/눈"
    if pty == "3":
        return "눈"
    if pty == "4":
        return "소나기"

    sky = str(sky_code or "").strip()
    return {
        "1": "맑음",
        "3": "구름많음",
        "4": "흐림",
    }.get(sky, "-")


def build_weather_records_from_items(
    *,
    items: list[dict[str, Any]],
    nx: int,
    ny: int,
    update_dt: datetime | None = None,
    actor_no: int | None = None,
) -> list[dict[str, Any]]:
    """기상청 raw items 를 weather 테이블 행 목록으로 변환합니다."""
    by_slot: dict[tuple[str, str], dict[str, Any]] = {}
    for item in items:
        fcst_date = str(item.get("fcstDate") or "").strip()
        fcst_time = str(item.get("fcstTime") or "").strip()
        category = str(item.get("category") or "").strip()
        if not fcst_date or not fcst_time or not category:
            continue
        slot = by_slot.setdefault((fcst_date, fcst_time), {})
        slot[category] = item.get("fcstValue")

    touched_at = update_dt or datetime.now()
    records: list[dict[str, Any]] = []
    for (fcst_date, fcst_time), values in sorted(by_slot.items()):
        try:
            target_date = datetime.strptime(fcst_date, "%Y%m%d").date()
            target_hour = int(fcst_time[:2])
        except ValueError:
            continue

        sky_cd = _parse_int(values.get("SKY")) or 0
        pty_cd = _parse_int(values.get("PTY")) or 0
        records.append(
            {
                "w_nx": int(nx),
                "w_ny": int(ny),
                "w_date": target_date,
                "w_hour": target_hour,
                "w_status": _status_text(sky_cd, pty_cd),
                "sky_cd": sky_cd,
                "pty_cd": pty_cd,
                "temperature": _parse_float(values.get("TMP")),
                "humidity": _parse_int(values.get("REH")),
                "precip_prob": _parse_int(values.get("POP")),
                "rain_hour": _normalize_precip_text(values.get("PCP")),
                "snow_hour": _normalize_precip_text(values.get("SNO")),
                "update_dt": touched_at,
                "reg_no": actor_no,
                "mod_no": actor_no,
            }
        )
    return records


def build_weather_dataframe(records: list[dict[str, Any]]) -> Any:
    """선택적으로 pandas DataFrame 을 구성합니다.

    backend 런타임 의존성에는 pandas 가 없어서, 실제로 필요할 때만 호출하는 보조 함수입니다.
    """
    import pandas as pd  # type: ignore

    rows = [
        {
            "w_nx": row["w_nx"],
            "w_ny": row["w_ny"],
            "w_date": row["w_date"],
            "w_hour": row["w_hour"],
            "w_status": row["w_status"],
            "sky_cd": row["sky_cd"],
            "pty_cd": row["pty_cd"],
            "temperature": row["temperature"],
            "humidity": row["humidity"],
            "precip_prob": row["precip_prob"],
            "rain_hour": row["rain_hour"],
            "snow_hour": row["snow_hour"],
            "update_dt": row["update_dt"],
        }
        for row in records
    ]
    return pd.DataFrame(rows)


def sync_weather_for_target(
    *,
    nx: int,
    ny: int,
    ville_id: str | None = None,
    village_address: str | None = None,
    cache_key: str | None = None,
    actor_no: int | None = None,
) -> dict[str, Any]:
    """단일 격자 대상의 기상 예보를 조회해 DB 에 upsert 합니다."""
    live = fetch_short_forecast_raw(
        village_nx=nx,
        village_ny=ny,
        village_address=village_address,
        cache_key=cache_key or ville_id,
    )
    if live.get("error"):
        return {
            "ville_id": ville_id,
            "nx": nx,
            "ny": ny,
            "ok": False,
            "error": live.get("error"),
            "saved_count": 0,
        }

    items = list(live.get("items") or [])
    records = build_weather_records_from_items(
        items=items,
        nx=nx,
        ny=ny,
        update_dt=datetime.now(),
        actor_no=actor_no,
    )
    saved_count = upsert_weather_rows(records)
    return {
        "ville_id": ville_id,
        "nx": nx,
        "ny": ny,
        "ok": True,
        "saved_count": saved_count,
        "record_count": len(records),
        "base_date": live.get("base_date"),
        "base_time": live.get("base_time"),
    }


def _dedupe_targets_by_grid(targets: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """마을 목록을 격자(nx, ny) 기준으로 중복 제거합니다.

    같은 격자를 공유하는 여러 마을은 첫 번째 대표 마을로 1회만 조회하되,
    결과에는 어떤 마을들이 같은 격자를 썼는지 함께 남깁니다.
    """
    deduped: dict[tuple[int, int], dict[str, Any]] = {}
    for target in targets:
        nx = int(target.get("nx") or 0)
        ny = int(target.get("ny") or 0)
        key = (nx, ny)
        ville_id = str(target.get("ville_id") or "").strip()
        ville_name = str(target.get("ville_name") or "").strip()
        if key not in deduped:
            item = dict(target)
            item["related_ville_ids"] = [ville_id] if ville_id else []
            item["related_ville_names"] = [ville_name] if ville_name else []
            deduped[key] = item
            continue

        existing = deduped[key]
        if ville_id and ville_id not in existing["related_ville_ids"]:
            existing["related_ville_ids"].append(ville_id)
        if ville_name and ville_name not in existing["related_ville_names"]:
            existing["related_ville_names"].append(ville_name)
    return list(deduped.values())


def sync_weather_for_villages(
    *,
    ville_ids: list[str] | None = None,
    actor_no: int | None = None,
) -> dict[str, Any]:
    """마을 목록 기준으로 weather 테이블을 일괄 동기화합니다.

    - `ville_ids` 가 주어지면 해당 마을들만 대상
    - 비어 있으면 전체 마을 대상
    - 실제 기상청 호출은 중복 격자(nx, ny)를 제거한 뒤 1회씩만 수행
    """
    raw_targets = list_weather_sync_targets(ville_ids)
    targets = _dedupe_targets_by_grid(raw_targets)
    results: list[dict[str, Any]] = []
    for target in targets:
        addr1 = str(target.get("addr_1") or "").strip()
        addr2 = str(target.get("addr_2") or "").strip()
        result = sync_weather_for_target(
            nx=int(target.get("nx") or 0),
            ny=int(target.get("ny") or 0),
            ville_id=str(target.get("ville_id") or "").strip() or None,
            village_address=f"{addr1} {addr2}".strip() or None,
            cache_key=str(target.get("ville_id") or "").strip() or None,
            actor_no=actor_no,
        )
        result["related_ville_ids"] = list(target.get("related_ville_ids") or [])
        result["related_ville_names"] = list(target.get("related_ville_names") or [])
        results.append(result)

    ok_count = sum(1 for result in results if result.get("ok"))
    saved_count = sum(int(result.get("saved_count") or 0) for result in results)
    return {
        "target_count": len(raw_targets),
        "unique_grid_count": len(targets),
        "ok_count": ok_count,
        "failed_count": len(targets) - ok_count,
        "saved_count": saved_count,
        "results": results,
    }
