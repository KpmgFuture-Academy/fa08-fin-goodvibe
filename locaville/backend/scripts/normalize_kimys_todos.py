"""김영수 (amo_regno=1110000002) 의 prj_todo_list 마감일을 한국 벼 농사 표준 일정으로 정리.

원본 시드의 부자연스러운 일자 fix:
  - R0009 논물 얕게 걸러대기: 7/15, 8/31, 9/15 → 8/5, 8/15, 8/25 (출수기 전후)
  - AP001 농자재 구입:        9/30        → 6/30 (작기 초기)
  - RD001 바이오차 투입:       9/30        → 11/10 (가을갈이 직전)

R0008 중간 물떼기는 이미 completed 라 그대로.

사용:
  cd locaville/backend
  python -m scripts.normalize_kimys_todos
"""
from __future__ import annotations

import sys
from pathlib import Path

# Windows PowerShell 의 cp949 콘솔이 유니코드 못 출력 — utf-8 강제
try:
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
except Exception:  # noqa: BLE001
    pass

# backend 루트를 sys.path 에 추가 — app/locaville import 가능
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


AMO_REGNO = "1110000002"  # 김영수


UPDATES: list[tuple[str, str, str, str]] = [
    # (job_cd, from_date, to_date, 설명)
    ("R0009", "2026-07-15", "2026-08-05", "논물 얕게 걸러대기 1회차 — 출수기 시작"),
    ("R0009", "2026-08-31", "2026-08-15", "논물 얕게 걸러대기 2회차 — 출수기 중"),
    ("R0009", "2026-09-15", "2026-08-25", "논물 얕게 걸러대기 3회차 — 출수기 말"),
]


def run() -> dict:
    from locaville.dbcom import execute, fetch_all

    print(f"== 김영수 (amo_regno={AMO_REGNO}) todo 정리 시작 ==\n")

    # Before 상태
    before = fetch_all(
        "SELECT job_cd, job_progress, est_end_date FROM prj_todo_list "
        "WHERE amo_regno = %s ORDER BY est_end_date, job_cd",
        [AMO_REGNO],
    ) or []
    print(f"[Before] {len(before)} rows")
    for r in before:
        print(f"  {r.get('job_cd')} | {r.get('job_progress')} | {r.get('est_end_date')}")
    print()

    # 1) 특정 (job_cd, est_end_date) 매칭 UPDATE
    for job_cd, from_date, to_date, note in UPDATES:
        execute(
            "UPDATE prj_todo_list SET est_end_date = %s "
            "WHERE amo_regno = %s AND job_cd = %s AND est_end_date = %s",
            [to_date, AMO_REGNO, job_cd, from_date],
        )
        print(f"  ✓ {job_cd} {from_date} → {to_date}  ({note})")

    # 2) AP001 농자재 구입 — 9/30 → 6/30 (작기 초기). 전체 row.
    execute(
        "UPDATE prj_todo_list SET est_end_date = %s "
        "WHERE amo_regno = %s AND job_cd = %s",
        ["2026-06-30", AMO_REGNO, "AP001"],
    )
    print("  ✓ AP001 → 2026-06-30  (농자재 구입 — 작기 초기)")

    # 3) RD001 바이오차 투입 — 9/30 → 11/10 (가을갈이 직전). 전체 row.
    execute(
        "UPDATE prj_todo_list SET est_end_date = %s "
        "WHERE amo_regno = %s AND job_cd = %s",
        ["2026-11-10", AMO_REGNO, "RD001"],
    )
    print("  ✓ RD001 → 2026-11-10  (바이오차 투입 — 가을갈이 직전)")

    print()

    # After 상태
    after = fetch_all(
        "SELECT job_cd, job_progress, est_end_date FROM prj_todo_list "
        "WHERE amo_regno = %s ORDER BY est_end_date, job_cd",
        [AMO_REGNO],
    ) or []
    print(f"[After]  {len(after)} rows")
    for r in after:
        print(f"  {r.get('job_cd')} | {r.get('job_progress')} | {r.get('est_end_date')}")

    return {"before": len(before), "after": len(after)}


if __name__ == "__main__":
    try:
        result = run()
        print(f"\n완료. {result}")
    except Exception as exc:  # noqa: BLE001
        print(f"실패: {exc}", file=sys.stderr)
        raise
