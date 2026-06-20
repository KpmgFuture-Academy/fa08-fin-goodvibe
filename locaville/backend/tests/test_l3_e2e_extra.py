"""L3 E2E 확장 — 도우미 모드 + 음성 영농기록 세션.

기존 [`test_l3_e2e.py`](./test_l3_e2e.py) 는 evidence/diary/사업 생애주기 한 바퀴를 다룬다.
본 파일은 그 위에 두 사용자 흐름:

  E2E-4 도우미 모드 — 이장이 helper-recipient 페어 배정 → list 노출 → 해제 → cleanup
  E2E-5 음성 영농기록 — start → reply → finalize 시퀀스 + journal INSERT 0 (L2 와 별개로 e2e 호흡)

실행:
    cd locaville/backend
    .\\.venv\\Scripts\\python -m pytest tests/test_l3_e2e_extra.py -v
"""
from __future__ import annotations

import os

import pytest


DB_AVAILABLE = bool(
    os.getenv("DATABASE_URL")
    or os.getenv("DB_URL")
    or os.getenv("DB_HOST")
)


# ============================================================
# E2E-4 — 도우미 모드 페어 배정 흐름
# ============================================================


@pytest.fixture(scope="module")
def client():
    if not DB_AVAILABLE:
        pytest.skip("DB env 없음 — L3 e2e 확장 skip")
    from fastapi.testclient import TestClient

    from app.main import app

    return TestClient(app, raise_server_exceptions=False)


# 시드 데모 농가 (memory: project-jeotanmaul-demo-ids)
HELPER_USER_NO = 10000002       # ys.kim 김영수 — 도우미
RECIPIENT_USER_NO = 10000001    # jh.park 박정호 — 피도움자 (이장)


def test_l3_e2e_4_helper_pair_assign_list_revoke(client) -> None:
    """이장 PoV: helper-recipient 페어 배정 → 마을 list 노출 → 해제 → cleanup.

    저탄마을 도우미 모드 핵심 — 한 농가가 다른 농가 todo 를 대행할 수 있게 양쪽 동의 흐름.
    배정/해제 시 양쪽에 자동 notification (L4 retake 와 동일 패턴).
    """
    from locaville.dbcom import execute, fetch_all, transaction

    # 0. 기존 진행중 페어가 있으면 cleanup (테스트 격리)
    with transaction() as conn:
        execute(
            """UPDATE farm_helper SET real_end_date = CURRENT_DATE
               WHERE helper_user_no = %s AND recipient_user_no = %s AND real_end_date IS NULL""",
            [HELPER_USER_NO, RECIPIENT_USER_NO],
            connection=conn,
            commit=False,
        )

    # 1. 이장이 페어 배정
    r = client.post(
        "/admin/farm-helpers",
        json={
            "helper_user_no": HELPER_USER_NO,
            "recipient_user_no": RECIPIENT_USER_NO,
            "chief_user_no": RECIPIENT_USER_NO,  # 박정호가 이장
            "est_end_date": "2026-12-31",        # 도움 종료 예정일 (필수)
        },
    )
    assert r.status_code in (200, 201), r.text

    # 응답에 help_seq 있어야 (이후 해제용)
    body = r.json()
    help_seq = body.get("help_seq")
    assert help_seq is not None, f"help_seq 없음: {body}"

    try:
        # 2. 마을 list 에 새 페어 보임
        r = client.get("/admin/farm-helpers", params={"ville_id": "LOCAVILLE01"})
        assert r.status_code == 200, r.text
        items = r.json().get("items", [])
        match = [
            it
            for it in items
            if it.get("helper_user_no") == HELPER_USER_NO
            and it.get("recipient_user_no") == RECIPIENT_USER_NO
        ]
        assert match, (
            f"방금 배정한 페어가 list 에 없음 — list 응답: {len(items)}건. "
            f"helper={HELPER_USER_NO} recipient={RECIPIENT_USER_NO}"
        )

        # 3. DB 에 farm_helper row 확인 (helper_appr_dt/recipient_appr_dt 는 NULL — 동의 대기)
        rows = fetch_all(
            """SELECT helper_appr_dt, recipient_appr_dt, real_end_date
               FROM farm_helper
               WHERE helper_user_no = %s AND help_seq = %s""",
            [HELPER_USER_NO, help_seq],
        )
        assert rows, "farm_helper row 미생성"
        assert rows[0]["real_end_date"] is None, "방금 만든 페어가 이미 종료됨"

        # 4. 이장 해제 → real_end_date = today
        r = client.delete(
            f"/admin/farm-helpers/{HELPER_USER_NO}/{help_seq}",
            params={"chief_user_no": RECIPIENT_USER_NO},
        )
        assert r.status_code == 200, r.text

        rows_after = fetch_all(
            "SELECT real_end_date FROM farm_helper WHERE helper_user_no = %s AND help_seq = %s",
            [HELPER_USER_NO, help_seq],
        )
        assert rows_after and rows_after[0]["real_end_date"] is not None, (
            "해제 후에도 real_end_date NULL — DELETE endpoint 동작 확인 필요"
        )
    finally:
        # cleanup — 만든 farm_helper row 와 자동 발송된 notification 정리
        try:
            with transaction() as conn:
                execute(
                    "DELETE FROM farm_helper WHERE helper_user_no = %s AND help_seq = %s",
                    [HELPER_USER_NO, help_seq],
                    connection=conn,
                    commit=False,
                )
                # helper 배정/해제 시 자동 알림 — 같은 시퀀스로 발송된 알림 정리
                execute(
                    """DELETE FROM notification
                       WHERE content_cd IN ('HELPER_REQUEST', 'HELPER_END')
                         AND user_no IN (%s, %s)
                         AND sent_dt > NOW() - INTERVAL '5 minutes'""",
                    [HELPER_USER_NO, RECIPIENT_USER_NO],
                    connection=conn,
                    commit=False,
                )
        except Exception:  # noqa: BLE001
            pass


# ============================================================
# E2E-6 — 사진 업로드 multipart (워터마크 + 메타 통합 흐름)
# ============================================================
# (E2E-5 음성 영농기록 세션 테스트는 단일 진입점 통합 작업 (ManualInputScreen 마이크) 으로
#  /ai/voice/session/* 엔드포인트가 제거됨에 따라 함께 삭제됨.)


def _make_test_jpeg(size: tuple[int, int] = (320, 240), color: str = "white") -> bytes:
    from io import BytesIO

    from PIL import Image

    img = Image.new("RGB", size, color=color)
    buf = BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


def test_l3_e2e_6_evidence_upload_multipart_full_flow(client) -> None:
    """농민이 사진 1장 등록 — 시연의 가장 빈번한 행동.

    POST /evidence/upload 는 multipart 로 파일 + 메타 한 번에 받음.
    backend 가 워터마크 합성 + EXIF 추출 + DB INSERT 까지 한 흐름.
    검증:
      - 응답 201 + evidence_id 발급
      - status='needs_review' (자동 확정 X)
      - image_url 이 워터마크된 경로 가리킴
      - 이장 화면 (/admin/recent-evidence 또는 /admin/summary) 에 즉시 보임
      - soft-delete cleanup
    """
    files = {"file": ("smoke_320x240.jpg", _make_test_jpeg(), "image/jpeg")}
    data = {
        "farmer_id": "ys.kim",
        "activity_type": "중간 물떼기",
        "evidence_type": "MID_DRAINAGE_START",
        "status": "needs_review",
        "user_message": "[L3-e2e-6-upload-smoke]",
        "gps_lat": "35.9481",
        "gps_long": "126.9572",
    }
    r = client.post("/evidence/upload", files=files, data=data)
    assert r.status_code in (200, 201), f"POST /evidence/upload 실패: {r.status_code} {r.text}"

    body = r.json()
    evidence_id = body["evidence_id"]
    assert body["status"] == "needs_review", (
        "업로드 직후 status 가 confirmed/auto-set — Vision 후보만 제시 invariant 위반 의심"
    )
    assert body.get("image_url"), "image_url 누락 — 워터마크 합성 결과를 가리킬 수 없음"

    try:
        # 이장 화면 노출 (다른 e2e 와 동일 패턴)
        summary = client.get("/admin/summary").json()
        recent_ids = {e.get("evidence_id") for e in summary.get("recent_evidence", [])}
        assert evidence_id in recent_ids, (
            f"방금 업로드한 사진 ({evidence_id}) 이 이장 대시보드 최근 사진에 없음"
        )
    finally:
        client.delete(f"/admin/evidence/{evidence_id}")
