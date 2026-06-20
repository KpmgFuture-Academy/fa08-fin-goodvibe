"""advice 배치 — 매일 새벽 cron 진입점.

기능:
  1) 모든 active 농가에 대해 advice 생성 (룰 + LLM → upsert)
  2) 모든 마을에 대해 이장 advice 생성 (chief_no 있는 마을만)
  3) 30일 이전 advice row cleanup

사용:
  cd locaville/backend
  python -m scripts.advice_batch            # 오늘자
  python -m scripts.advice_batch --date 2026-06-03

운영 cron 예 (매일 05:00 KST):
  0 5 * * *  cd /app/backend && /usr/bin/python -m scripts.advice_batch >> /var/log/advice_batch.log 2>&1
"""
from __future__ import annotations

import argparse
import sys
import time
from datetime import date
from pathlib import Path

# scripts 가 backend 의 sibling 이라 app 경로 보강
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def _list_active_farmers() -> list[dict]:
    """user_master.status_cd='ACT' + farmer 매핑 있는 농가."""
    from locaville.dbcom import fetch_all

    sql = (
        "SELECT um.user_no, um.user_name "
        "FROM user_master um "
        "JOIN farmer f ON f.user_no = um.user_no "
        "WHERE um.status_cd = 'ACT'"
    )
    return fetch_all(sql, []) or []


def _list_villes() -> list[dict]:
    """village 테이블 모든 row."""
    from locaville.dbcom import fetch_all

    sql = "SELECT ville_id, chief_no, ville_name FROM village"
    return fetch_all(sql, []) or []


def run(advice_date: date | None = None) -> dict:
    """배치 본체. 각 단계별 통계 dict 반환."""
    from app.repositories import advice_rdb
    from app.services.advice_service import generate_for_chief, generate_for_farmer

    advice_date = advice_date or date.today()

    farmers = _list_active_farmers()
    villes = _list_villes()

    started = time.time()
    farmer_ok = 0
    farmer_skip = 0
    farmer_err = 0
    for f in farmers:
        user_no = int(f.get("user_no") or 0)
        if not user_no:
            farmer_skip += 1
            continue
        try:
            result = generate_for_farmer(user_no=user_no, advice_date=advice_date)
            if result:
                farmer_ok += 1
            else:
                farmer_skip += 1  # 룰 매칭 안 됨
        except Exception as exc:  # noqa: BLE001
            farmer_err += 1
            print(f"[farmer] user_no={user_no} 실패: {exc}", file=sys.stderr)

    chief_ok = 0
    chief_skip = 0
    chief_err = 0
    for v in villes:
        ville_id = (v.get("ville_id") or "").strip()
        chief_no = v.get("chief_no")
        if not ville_id or not chief_no:
            chief_skip += 1
            continue
        try:
            result = generate_for_chief(
                ville_id=ville_id,
                chief_user_no=int(chief_no),
                advice_date=advice_date,
            )
            if result:
                chief_ok += 1
            else:
                chief_skip += 1
        except Exception as exc:  # noqa: BLE001
            chief_err += 1
            print(f"[chief] ville_id={ville_id} 실패: {exc}", file=sys.stderr)

    # 30일 이전 cleanup
    try:
        advice_rdb.delete_older_than(30)
    except Exception as exc:  # noqa: BLE001
        print(f"[cleanup] 실패: {exc}", file=sys.stderr)

    elapsed = round(time.time() - started, 2)
    return {
        "advice_date": advice_date.isoformat(),
        "elapsed_s": elapsed,
        "farmers": {
            "total": len(farmers),
            "ok": farmer_ok,
            "skip": farmer_skip,
            "err": farmer_err,
        },
        "villes": {
            "total": len(villes),
            "ok": chief_ok,
            "skip": chief_skip,
            "err": chief_err,
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="advice 배치")
    parser.add_argument("--date", help="YYYY-MM-DD (기본: 오늘)")
    args = parser.parse_args()

    target_date: date | None = None
    if args.date:
        try:
            target_date = date.fromisoformat(args.date)
        except ValueError:
            print(f"잘못된 날짜 형식: {args.date}", file=sys.stderr)
            return 2

    result = run(target_date)
    print(result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
