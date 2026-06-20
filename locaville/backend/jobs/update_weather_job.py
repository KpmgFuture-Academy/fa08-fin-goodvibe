"""기상 데이터 배치 실행 진입점.

예시:
  cd locaville/backend
  python -m jobs.update_weather_job
  python -m jobs.update_weather_job --ville-id LOCAVILLE01
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def _bootstrap_library_path() -> None:
    """editable install 이 없어도 sibling library 패키지를 import 가능하게 보정."""
    backend_root = Path(__file__).resolve().parents[1]
    library_root = backend_root.parent / "library"
    library_root_str = str(library_root)
    if library_root.exists() and library_root_str not in sys.path:
        sys.path.insert(0, library_root_str)


_bootstrap_library_path()

from locaville.utilities import load_backend_env


def main() -> int:
    parser = argparse.ArgumentParser(description="weather 테이블 배치 갱신")
    parser.add_argument(
        "--ville-id",
        dest="ville_ids",
        action="append",
        default=None,
        help="동기화할 마을 ID. 여러 번 지정 가능",
    )
    parser.add_argument(
        "--actor-no",
        dest="actor_no",
        type=int,
        default=None,
        help="reg_no/mod_no 에 기록할 사용자 번호",
    )
    args = parser.parse_args()

    load_backend_env()

    from app.services.weather_batch_service import sync_weather_for_villages

    result = sync_weather_for_villages(
        ville_ids=args.ville_ids,
        actor_no=args.actor_no,
    )
    print(json.dumps(result, ensure_ascii=False, default=str, indent=2))
    return 0 if int(result.get("failed_count") or 0) == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
