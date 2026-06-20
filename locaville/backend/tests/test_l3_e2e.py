"""L3 E2E — 3-앱 사용자 흐름 통합 검증 (30분).

저탄마을 4-Level 테스트의 Level 3 — TestClient 시퀀스 + DB 검증.
실제 데이터 INSERT/UPDATE/DELETE 가 일어나므로 시드가 들어있는 DB 에서 실행.

3개 e2e 시퀀스:
  E2E-1 농민 evidence → 이장 화면 노출 → 이장 confirm → soft delete
  E2E-2 농민 diary    → 이장 화면 노출 →                 soft delete
  E2E-3 관리자 사업 → 활동 → Job 등록 → catalog 반영 → cleanup

각 테스트는 try/finally 로 만든 row 를 정리 — 실행 후 시드에 흔적 남지 않음.

실행:
    cd locaville/backend
    .\\.venv\\Scripts\\python -m pytest tests/test_l3_e2e.py -v
"""
from __future__ import annotations

import os
from datetime import datetime

import pytest
from fastapi.testclient import TestClient


DB_AVAILABLE = bool(
    os.getenv("DATABASE_URL")
    or os.getenv("DB_URL")
    or os.getenv("DB_HOST")
)
pytestmark = pytest.mark.skipif(
    not DB_AVAILABLE,
    reason="L3 e2e 는 실 DB INSERT/PATCH/DELETE 가 목적 — DB env 필요",
)


DEMO_FARMER = "ys.kim"
TEST_MARKER = "[L3-e2e-smoke]"


@pytest.fixture(scope="module")
def client() -> TestClient:
    from app.main import app

    return TestClient(app, raise_server_exceptions=False)


# ============================================================
# E2E-1 — 농민 evidence → 이장 화면 노출 → 이장 confirm → soft delete
# ============================================================


def test_l3_e2e_1_farmer_evidence_visible_to_chief_and_confirm(
    client: TestClient,
) -> None:
    """저탄마을 3-앱 일관성 핵심:
    농민이 증빙 1건 등록하면 이장 대시보드 recent_evidence 에 즉시 보이고,
    이장이 status 변경하면 detail 단건 조회에도 반영된다."""

    # 1. baseline
    before = client.get("/admin/summary").json()
    before_total = before.get("total_evidence", 0)

    # 2. 농민 evidence 1건 INSERT (파일 없이 메타만)
    body = {
        "farmer_id": DEMO_FARMER,
        "activity_type": "L3-smoke",
        "evidence_type": "L3_E2E_DUMMY",
        "captured_at": datetime.now().isoformat(),
        "user_message": TEST_MARKER,
        "status": "needs_review",
    }
    r = client.post("/evidence", json=body)
    assert r.status_code in (200, 201), f"POST /evidence 실패: {r.status_code} {r.text}"
    evidence = r.json()
    evidence_id = evidence["evidence_id"]
    assert evidence["status"] == "needs_review"

    try:
        # 3. 이장 대시보드 데이터에 즉시 노출
        after = client.get("/admin/summary").json()
        assert after["total_evidence"] == before_total + 1, (
            f"total_evidence 증가 0 — recent_evidence list refresh 의심 "
            f"(before={before_total}, after={after['total_evidence']})"
        )
        recent_ids = {e.get("evidence_id") for e in after.get("recent_evidence", [])}
        assert evidence_id in recent_ids, (
            f"새 evidence_id={evidence_id} 가 recent_evidence 목록에 없음 — "
            f"이장 화면이 새 사진을 못 볼 위험"
        )

        # 4. 이장 검토 — status confirmed 로 PATCH
        r = client.patch(f"/evidence/{evidence_id}", json={"status": "confirmed"})
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "confirmed"

        # 5. 단건 조회 — 농민/이장 양쪽 화면에서 confirmed 로 보임
        r = client.get(f"/evidence/{evidence_id}")
        assert r.status_code == 200
        assert r.json()["status"] == "confirmed"

    finally:
        # 6. cleanup — soft delete (DB row 의 deleted_dt 만 세팅)
        client.delete(f"/admin/evidence/{evidence_id}")


# ============================================================
# E2E-2 — 농민 diary → 이장 화면 노출 → soft delete
# ============================================================


def test_l3_e2e_2_farmer_diary_visible_to_chief_and_delete(
    client: TestClient,
) -> None:
    """농민이 영농일지 1건 작성하면 이장 대시보드 recent_diaries 에 즉시 보임."""

    before = client.get("/admin/summary").json()
    before_total = before.get("total_diaries", 0)

    body = {
        "farmer_id": DEMO_FARMER,
        "worker_name": "김영수",
        "work_date": "2026-06-05",
        "field_id": "smoke-field",
        "crop_name": "벼",
        "work_stage": "L3-smoke",
        "work_detail": f"{TEST_MARKER} 일지 e2e 검증",
    }
    r = client.post("/diary", json=body)
    assert r.status_code in (200, 201), f"POST /diary 실패: {r.status_code} {r.text}"
    diary = r.json()
    diary_id = diary["diary_id"]

    try:
        after = client.get("/admin/summary").json()
        assert after["total_diaries"] == before_total + 1
        recent_ids = {d.get("diary_id") for d in after.get("recent_diaries", [])}
        assert diary_id in recent_ids, (
            f"새 diary_id={diary_id} 가 recent_diaries 에 없음"
        )

        # 단건 조회 정합성
        r = client.get(f"/diary/{diary_id}")
        assert r.status_code == 200
        assert r.json()["work_detail"].startswith(TEST_MARKER)
    finally:
        client.delete(f"/admin/diaries/{diary_id}")


# ============================================================
# E2E-3 — 관리자 사업 생애주기: 사업 → 활동 → Job → catalog 반영 → cleanup
# ============================================================


def test_l3_e2e_3_project_activity_job_chain(client: TestClient) -> None:
    """관리자 흐름: POST /project → POST .../activities → POST .../jobs →
    GET /project/{id} 에 활동 + Job 반영 → cleanup."""

    # 1. 사업 등록
    r = client.post("/project", json={"prj_name": f"{TEST_MARKER} 사업"})
    assert r.status_code == 200, r.text
    body = r.json()
    pid = body["prj_id"]
    bid = body["biz_id"]
    assert pid.startswith("PRJ") and bid.startswith("BIZ")

    activity_id = "ACT_L3SMK"
    created_job_seq: int | None = None

    try:
        # 2. 활동 등록
        r = client.post(
            f"/project/{pid}/activities",
            json={
                "activity_id": activity_id,
                "activity_name": f"{TEST_MARKER} 활동",
                "est_start_date": "2026-06-01",
                "est_end_date": "2026-06-30",
                "subsidy_amt_display": 0,
                "parcel_codes": [],
            },
        )
        assert r.status_code in (200, 201), f"활동 등록 실패: {r.status_code} {r.text}"

        # 3. 시드의 farm_job code 1개 가져와 Job 등록
        farm_jobs = client.get("/farm-job/list")
        assert farm_jobs.status_code == 200, farm_jobs.text
        fj_body = farm_jobs.json()
        fj_items = (
            fj_body.get("items")
            if isinstance(fj_body, dict)
            else (fj_body if isinstance(fj_body, list) else [])
        )
        if fj_items:
            job_cd = fj_items[0].get("job_cd") or fj_items[0].get("code")
            if job_cd:
                r = client.post(
                    f"/project/{pid}/activities/{activity_id}/jobs",
                    json={
                        "job_cd": job_cd,
                        "mandatory_yn": False,
                        "evidence_yn": False,
                    },
                )
                assert r.status_code in (200, 201), (
                    f"Job 등록 실패: {r.status_code} {r.text}"
                )
                created_job_seq = r.json().get("job_seq")
                assert isinstance(created_job_seq, int) and created_job_seq >= 1

        # 4. detail 응답에 새 활동 보임
        r = client.get(f"/project/{pid}")
        assert r.status_code == 200, r.text
        det = r.json()
        proj = det.get("project") or {}
        assert proj.get("activity_count", 0) >= 1, (
            f"activity_count 0 — 활동 등록 후 detail 에 반영 안됨"
        )

        # 5. catalog list 새로고침에도 보임 (GET /project)
        r = client.get("/project")
        assert r.status_code == 200
        ids = {i.get("prj_id") for i in r.json().get("items") or []}
        assert pid in ids

    finally:
        # 6. cleanup — Job → activity 는 별도 DELETE endpoint 가 있고, project/program_master 는 직접 SQL
        try:
            if created_job_seq is not None:
                client.delete(
                    f"/project/{pid}/activities/{activity_id}/jobs/{created_job_seq}"
                )
        except Exception:  # noqa: BLE001
            pass
        try:
            from locaville.dbcom import execute, transaction

            with transaction() as conn:
                execute(
                    "DELETE FROM prj_activity WHERE prj_id = %s",
                    [pid],
                    connection=conn,
                    commit=False,
                )
                execute(
                    "DELETE FROM prj_act_parcel WHERE prj_id = %s",
                    [pid],
                    connection=conn,
                    commit=False,
                )
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
            # cleanup 실패는 테스트 PASS 영향 X — 운영자가 수동 정리
            pass
