"""L1 Smoke — 시연 직전 핵심 기능 작동 검증 (5분).

저탄마을 4-Level 테스트 시나리오의 Level 1.
- backend health 정상
- 시드 사업 (PRJ2026LC) catalog 에 보임
- 데모 농가 (ys.kim) 의 오늘 할 일 1건 이상 (농민 앱 홈 빈 카드 방지)
- 이장님 대시보드 데이터 (group_no=10001) 정상

실행:
    cd locaville/backend
    .\\.venv\\Scripts\\python -m pytest tests/test_l1_smoke.py -v

DB env (DATABASE_URL / DB_HOST) 가 없으면 module 전체 skip — L1 은 실 DB 데이터를 검증하는 게 핵심.
"""
from __future__ import annotations

import os

import pytest
from fastapi.testclient import TestClient

DB_AVAILABLE = bool(
    os.getenv("DATABASE_URL")
    or os.getenv("DB_URL")
    or os.getenv("DB_HOST")
)
pytestmark = pytest.mark.skipif(
    not DB_AVAILABLE,
    reason="L1 smoke 는 실 DB 시드 검증이 목적 — DATABASE_URL/DB_URL/DB_HOST 필요",
)


@pytest.fixture(scope="module")
def client() -> TestClient:
    from app.main import app

    return TestClient(app, raise_server_exceptions=False)


# ---------------------------------------------------------------------
# L1.1 backend health
# ---------------------------------------------------------------------


def test_l1_1_health_ok(client: TestClient) -> None:
    r = client.get("/health")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("status") == "ok", body


# ---------------------------------------------------------------------
# L1.4 시드 사업 catalog
# ---------------------------------------------------------------------


def test_l1_4_seed_project_catalog_contains_demo(client: TestClient) -> None:
    """관리자 첫 화면 — AGENTS.md §7 의 시드 사업 KK26A001 가 보임."""
    r = client.get("/project")
    assert r.status_code == 200, r.text
    items = r.json().get("items") or []
    ids = {i.get("prj_id") for i in items}
    assert "KK26A001" in ids, (
        f"KK26A001 (2026 저탄소 농업 프로그램 시범사업) 누락 — "
        f"POST /demo/seed 다시 호출. 현재 catalog: {sorted(ids)}"
    )


# ---------------------------------------------------------------------
# L1.2 데모 농가 오늘 할 일 — 농민 앱 홈 빈 카드 방지
# ---------------------------------------------------------------------


def test_l1_2_demo_farmer_today_todo_present(client: TestClient) -> None:
    """ys.kim (데모 농가) 의 오늘 할 일이 1건 이상."""
    r = client.get("/todo/today", params={"farmer_id": "ys.kim"})
    assert r.status_code == 200, r.text
    body = r.json()
    items = body if isinstance(body, list) else (body.get("items") or [])
    assert len(items) >= 1, (
        "ys.kim 의 오늘 할 일 0건 — 농민 앱 홈 카드가 빈 화면일 위험. "
        "POST /demo/seed 또는 normalize_kimys_todos.py 확인"
    )


# ---------------------------------------------------------------------
# L1.3 이장님 대시보드 데이터
# ---------------------------------------------------------------------


def test_l1_3_chief_dashboard_summary_present(client: TestClient) -> None:
    """이장 대시보드 첫 화면 데이터 — /admin/summary 가 KPI + 농가집계 + 최근목록 반환."""
    r = client.get("/admin/summary")
    assert r.status_code == 200, r.text
    body = r.json()
    assert isinstance(body, dict)
    # admin_service.get_admin_summary 응답 keys 검증 — 빈 카드 회귀 방지
    required_keys = {"total_farmers", "diaries_by_farmer", "recent_diaries", "recent_evidence"}
    missing = required_keys - set(body.keys())
    assert not missing, f"summary 응답에 keys 누락: {missing}. 실제 keys: {sorted(body)}"
    assert body["total_farmers"] >= 1, (
        f"마을 농가 0건 — 시드 누락 또는 group 매핑 오류 (POST /demo/seed). "
        f"total_farmers={body['total_farmers']}"
    )
    # KPI 카드 데이터 — 빈 list 라도 응답 형태는 유지되어야 함 (frontend null safe)
    assert isinstance(body["diaries_by_farmer"], list)
    assert isinstance(body["recent_diaries"], list)
    assert isinstance(body["recent_evidence"], list)


def test_l1_3b_chief_laggard_farmers_present(client: TestClient) -> None:
    """이장 대시보드 "오늘 먼저 챙길 일" 카드용 — /admin/laggard-farmers 응답 정상."""
    r = client.get("/admin/laggard-farmers")
    if r.status_code == 404:
        pytest.skip("/admin/laggard-farmers endpoint 없음")
    assert r.status_code == 200, r.text
    body = r.json()
    # 응답 schema 가 list 또는 {items} dict 둘 다 가능 — 둘 다 처리
    items = body if isinstance(body, list) else (body.get("items") or body.get("farmers") or [])
    # laggard 0 건은 정상일 수도 있으니 (모든 농가가 잘 따라잡고 있는 경우), 응답 형식만 검증
    assert isinstance(items, list), f"laggard-farmers 응답이 list 형태가 아님: {type(items)}"


# ---------------------------------------------------------------------
# L1.5 POST /project 신규 등록 흐름 (어제오늘 작업 회귀)
# ---------------------------------------------------------------------


def test_l1_5_create_project_minimal_roundtrip(client: TestClient) -> None:
    """POST /project → 새 prj_id 발급 → GET /project/{id} 정상 → cleanup."""
    r = client.post("/project", json={"prj_name": "[L1-smoke] 임시 사업"})
    assert r.status_code == 200, r.text
    body = r.json()
    pid = body.get("prj_id")
    bid = body.get("biz_id")
    assert pid and pid.startswith("PRJ"), body
    assert bid and bid.startswith("BIZ"), body

    try:
        det = client.get(f"/project/{pid}")
        assert det.status_code == 200, det.text
        proj = det.json().get("project") or {}
        assert proj.get("prj_name", "").startswith("[L1-smoke]")
    finally:
        # cleanup — DB 에 테스트 row 남기지 않음
        try:
            from locaville.dbcom import execute, transaction

            with transaction() as conn:
                execute(
                    "DELETE FROM project WHERE prj_id = %s",
                    [pid],
                    connection=conn,
                    commit=False,
                )
                execute(
                    "DELETE FROM program_master WHERE biz_id = %s",
                    [bid],
                    connection=conn,
                    commit=False,
                )
        except Exception:  # noqa: BLE001
            # cleanup 실패해도 테스트 자체는 PASS — 운영자가 수동 정리
            pass
