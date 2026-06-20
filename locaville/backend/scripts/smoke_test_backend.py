"""Locaville backend 스모크 테스트 — 신 스키마(locaville_jeotan_seed_v2_parcel_int.sql) 기준.

전제:
  - 4개 SQL 파일(0_LocaVille → patch → code_data → seed_v2) 이 적용된 MySQL 이 실행 중
  - 백엔드가 STORAGE_MODE=rdb 로 떠 있음 (DB_SOURCE 가 mysql/postgres 결정)
  - 시드 사용자 ys.kim (login_id, user_no=1000000101, amo_regno=AMOJT002, group_no=10001) 사용

신 ID 포맷:
  - diary_id    = {user_no}-{yyyymmdd}-{exec_no}        (예: 1000000101-20260601-1)
  - evidence_id = {user_no}-{yyyymmdd}-{exec_no}-{seq_no} (예: 1000000101-20260601-1-1)

스모크 작성/수정 시 주의:
  - parcel_no 는 INT 또는 parcel_regno("JT-RPA-002") 둘 다 허용 (backend 가 자동 정규화)
  - 스모크가 잘못된 farmer_id 를 보내면 ValueError 가 잡혀 400/422 로 응답되어야 함
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timedelta
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


def request_json(
    base_url: str,
    method: str,
    path: str,
    payload: dict | None = None,
    query: dict | None = None,
) -> dict:
    url = base_url.rstrip("/") + path
    if query:
        url += "?" + urlencode(query)

    data = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"

    req = Request(url, data=data, headers=headers, method=method)
    try:
        with urlopen(req, timeout=10) as response:
            body = response.read().decode("utf-8")
            return json.loads(body) if body else {}
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{method} {path} failed with HTTP {exc.code}: {detail}") from exc
    except URLError as exc:
        raise RuntimeError(f"{method} {path} failed: {exc.reason}") from exc


def require_fields(name: str, payload: dict, fields: list[str]) -> None:
    missing = [field for field in fields if field not in payload]
    if missing:
        raise RuntimeError(f"{name} response missing fields: {', '.join(missing)}")


def require_equal(name: str, actual: object, expected: object) -> None:
    if actual != expected:
        raise RuntimeError(f"{name} mismatch: expected {expected!r}, got {actual!r}")


def require_id_format(name: str, value: object, parts: int) -> None:
    if not isinstance(value, str):
        raise RuntimeError(f"{name} expected str, got {type(value).__name__}: {value!r}")
    chunks = value.split("-")
    if len(chunks) != parts:
        raise RuntimeError(
            f"{name} expected {parts}-part dash-separated id, got {value!r} ({len(chunks)} parts)"
        )
    # 첫 번째는 user_no(int), 두 번째는 yyyymmdd, 나머지는 int.
    if not chunks[0].isdigit():
        raise RuntimeError(f"{name} first segment must be user_no integer: {value!r}")
    if not re.fullmatch(r"\d{8}", chunks[1]):
        raise RuntimeError(f"{name} second segment must be yyyymmdd: {value!r}")
    for ch in chunks[2:]:
        if not ch.isdigit():
            raise RuntimeError(f"{name} trailing segments must be ints: {value!r}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Locaville backend smoke test (new schema).")
    parser.add_argument("--base-url", default="http://127.0.0.1:8000", help="Backend base URL.")
    args = parser.parse_args()
    base_url = args.base_url.rstrip("/")

    # 시연 시드 기준 상수.
    farmer_id = "ys.kim"  # login_id (identity_rdb 가 user_no=1000000101, amo_regno=AMOJT002 로 해석)
    expected_amo_regno = "AMOJT002"
    expected_user_no = 1000000101
    group_no = 10001
    prj_id = "PRJ2026LC"
    activity_id = "ACT_WATER"
    job_cd = "J001"
    job_seq = 1
    todo_id = f"{expected_amo_regno}-{prj_id}-{activity_id}-{job_seq}"
    # 스모크용 work_date 는 미래로 옮겨 시드 데이터와 겹치지 않게.
    work_date = (datetime.now().date() + timedelta(days=30)).isoformat()
    parcel_regno = "JT-RPA-002"  # 시드: AMOJT002 의 3번 논, parcel_no=11003
    activity_type = "중간 물떼기"
    evidence_type = "MID_DRAINAGE_START"

    print(f"Smoke testing backend at {base_url}")
    print(f"  farmer_id={farmer_id} (→ amo_regno={expected_amo_regno}, user_no={expected_user_no})")
    print(f"  work_date={work_date} (future-shifted to avoid seed collision)")

    # ---- 1. /health ----
    health = request_json(base_url, "GET", "/health")
    require_fields("health", health, ["status", "service", "storage_mode", "db"])
    print(f"ok 1 /health storage_mode={health.get('storage_mode')}")
    if health.get("storage_mode") == "rdb":
        db = health.get("db") or {}
        if db.get("status") != "ok":
            raise RuntimeError(
                f"DB health failed in STORAGE_MODE=rdb mode: db={db!r}"
            )
        print(f"ok 2 db health (source={db.get('source')})")

    # ---- 2. /todo/today ----
    try:
        todos = request_json(
            base_url, "GET", "/todo/today", query={"farmer_id": farmer_id, "prj_id": prj_id}
        )
        require_fields("todos/today", todos, ["items"])
        if not isinstance(todos["items"], list):
            raise RuntimeError("/todo/today items must be a list")
        print(f"ok 3 /todo/today items={len(todos['items'])}")
    except Exception as exc:
        print(f"warn 3 /todo/today failed but continuing: {exc}")

    # ---- 3. POST /diary (todo 컨텍스트 동반) ----
    diary_payload = {
        "todo_id": todo_id,
        "prj_id": prj_id,
        "project_id": prj_id,
        "group_no": group_no,
        "farmer_id": farmer_id,
        "farmer_name": "김영수",
        "worker_name": "김영수",
        "work_date": work_date,
        "field_id": parcel_regno,
        "parcel_no": parcel_regno,
        "field_address": "저탄마을 3번 논",
        "crop_name": "벼",
        "activity_id": activity_id,
        "job_cd": job_cd,
        "job_seq": job_seq,
        "work_stage": "중간 물떼기",
        "work_stage_detail": "물떼기 시작",
        "work_detail": "smoke test diary on new schema",
        "linked_evidence_ids": [],
        "status": "saved",
        "input_type_cd": "MAN",
    }
    diary = request_json(base_url, "POST", "/diary", payload=diary_payload)
    require_fields("POST /diary", diary, ["diary_id", "farmer_id", "work_date"])
    require_id_format("POST /diary diary_id", diary.get("diary_id"), parts=3)
    require_equal("POST /diary farmer_id", diary.get("farmer_id"), expected_amo_regno)
    require_equal("POST /diary prj_id", diary.get("prj_id"), prj_id)
    require_equal("POST /diary activity_id", diary.get("activity_id"), activity_id)
    require_equal("POST /diary job_cd", diary.get("job_cd"), job_cd)
    diary_id = diary["diary_id"]
    print(f"ok 4 /diary diary_id={diary_id}")

    # ---- 4. GET /diary/{diary_id} (라운드트립) ----
    diary_detail = request_json(base_url, "GET", f"/diary/{diary_id}")
    require_fields("GET /diary/{diary_id}", diary_detail, ["diary_id", "farmer_id"])
    require_equal("GET /diary/{diary_id} diary_id", diary_detail.get("diary_id"), diary_id)
    require_equal("GET /diary/{diary_id} prj_id", diary_detail.get("prj_id"), prj_id)
    print("ok 5 /diary/{diary_id}")

    # ---- 5. POST /evidence (같은 work_date 의 사진 1) ----
    evidence_payload = {
        "todo_id": todo_id,
        "group_no": group_no,
        "prj_id": prj_id,
        "project_id": prj_id,
        "activity_id": activity_id,
        "job_cd": job_cd,
        "farmer_id": farmer_id,
        "parcel_no": parcel_regno,
        "parcel_regno": parcel_regno,
        "field_id": parcel_regno,
        "activity_type": activity_type,
        "evidence_type": evidence_type,
        "confirmed_label": evidence_type,
        "image_url": "http://localhost/smoke/evidence_start.jpg",
        "storage_path": "uploads/evidence/smoke_start.jpg",
        "original_image_path": "/tmp/smoke_start.jpg",
        "captured_at": f"{work_date}T08:00:00",
        "status": "needs_review",
        "user_message": "smoke test evidence #1",
    }
    evidence = request_json(base_url, "POST", "/evidence", payload=evidence_payload)
    require_fields("POST /evidence", evidence, ["evidence_id", "farmer_id", "status"])
    require_id_format("POST /evidence evidence_id", evidence.get("evidence_id"), parts=4)
    require_equal("POST /evidence farmer_id", evidence.get("farmer_id"), expected_amo_regno)
    require_equal("POST /evidence status", evidence.get("status"), "needs_review")
    require_equal("POST /evidence evidence_type", evidence.get("evidence_type"), evidence_type)
    evidence_id = evidence["evidence_id"]
    # diary 의 exec_no 와 같은 exec_no 를 재사용해야 함 (parent journal 자동 매칭).
    diary_parts = diary_id.split("-")
    ev_parts = evidence_id.split("-")
    require_equal(
        "evidence.exec_no should match parent diary.exec_no",
        ev_parts[2],
        diary_parts[2],
    )
    print(f"ok 6 /evidence evidence_id={evidence_id}")

    # ---- 6. GET /evidence/{evidence_id} ----
    evidence_detail = request_json(base_url, "GET", f"/evidence/{evidence_id}")
    require_fields("GET /evidence/{id}", evidence_detail, ["evidence_id", "status"])
    require_equal("GET /evidence/{id} evidence_id", evidence_detail.get("evidence_id"), evidence_id)
    require_equal("GET /evidence/{id} status", evidence_detail.get("status"), "needs_review")
    print("ok 7 /evidence/{evidence_id}")

    # ---- 7. PATCH /evidence/{id} (이장님 검토 완료) ----
    patched = request_json(
        base_url,
        "PATCH",
        f"/evidence/{evidence_id}",
        payload={"status": "confirmed", "confirmed_label": evidence_type},
    )
    require_equal("PATCH /evidence status", patched.get("status"), "confirmed")
    print("ok 8 /evidence/{id} PATCH confirmed")

    # ---- 8. /evidence/missing ----
    missing = request_json(
        base_url,
        "GET",
        "/evidence/missing",
        query={
            "activity_type": activity_type,
            "farmer_id": farmer_id,
            "parcel_no": parcel_regno,
            "prj_id": prj_id,
        },
    )
    require_fields(
        "evidence/missing",
        missing,
        ["activity_type", "required_evidence_types", "submitted_evidence_types", "completion_status"],
    )
    print(
        f"ok 9 /evidence/missing required={len(missing.get('required_evidence_types') or [])} "
        f"submitted={len(missing.get('submitted_evidence_types') or [])}"
    )

    # ---- 9. /admin/summary ----
    summary = request_json(base_url, "GET", "/admin/summary")
    require_fields(
        "admin/summary",
        summary,
        ["total_diaries", "total_evidence", "total_farmers", "diaries_by_farmer"],
    )
    farmers = summary.get("diaries_by_farmer") or []
    if not isinstance(farmers, list):
        raise RuntimeError("/admin/summary diaries_by_farmer must be a list")
    # 신 응답은 farmer_id 에 amo_regno 를 담음
    me = next((f for f in farmers if f.get("farmer_id") == expected_amo_regno), None)
    if me is None:
        raise RuntimeError(
            f"/admin/summary: expected amo_regno={expected_amo_regno} in diaries_by_farmer; "
            f"got {[f.get('farmer_id') for f in farmers]}"
        )
    print(
        f"ok 10 /admin/summary AMOJT002: diary={me.get('diary_count')} "
        f"evidence={me.get('evidence_count')} todo={me.get('todo_count')}"
    )

    # ---- 10. /admin/todo-status (사업별) ----
    try:
        ts = request_json(base_url, "GET", "/admin/todo-status", query={"prj_id": prj_id})
        require_fields("admin/todo-status", ts, ["items"])
        print(f"ok 11 /admin/todo-status?prj_id={prj_id} items={len(ts['items'])}")
    except Exception as exc:
        print(f"warn 11 /admin/todo-status failed: {exc}")

    print(
        "\nSmoke test PASSED. Created records:\n"
        f"  diary    = {diary_id}\n"
        f"  evidence = {evidence_id}\n"
        "MySQL mode does NOT auto-delete inserted rows."
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"Smoke test failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
