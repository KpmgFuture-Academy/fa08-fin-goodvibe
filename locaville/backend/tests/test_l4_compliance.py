"""L4 Compliance — 저탄소 인증 컴플라이언스 회귀 검증.

저탄마을 4-Level 테스트의 Level 4 도메인 본질.
평가관·감사관이 확인하는 핵심 4가지:
  L4.1 시간 순서      — evidence.capture_dt ≤ reg_dt (사진 찍은 시각 ≤ 등록 시각)
  L4.2 EXIF 추출      — 갤러리 사진 EXIF DateTimeOriginal 보존 (없으면 None 폴백)
  L4.3 워터마크 줄    — 농가명·촬영시각·GPS·주소 정확. GPS 0,0 은 미캡처로 간주
  L4.4 PDF 리포트     — todo + 일지 + 증빙 묶음 정상 생성 (제출용 산출물)

실행:
    cd locaville/backend
    .\\.venv\\Scripts\\python -m pytest tests/test_l4_compliance.py -v

DB-free 테스트 (workmark/EXIF helper) 는 항상 실행.
DB-bound 테스트 (capture_dt invariant, 리포트 endpoint) 는 DB env 있을 때만.
"""
from __future__ import annotations

import os
from datetime import datetime
from io import BytesIO

import pytest


DB_AVAILABLE = bool(
    os.getenv("DATABASE_URL")
    or os.getenv("DB_URL")
    or os.getenv("DB_HOST")
)


# ============================================================
# L4.2 — EXIF 추출
# ============================================================


def _make_plain_jpeg_bytes(size: tuple[int, int] = (200, 200), color="red") -> bytes:
    """EXIF 가 없는 일반 JPEG bytes 생성."""
    from PIL import Image

    img = Image.new("RGB", size, color=color)
    buf = BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


def test_l4_exif_extraction_returns_none_for_image_without_exif() -> None:
    """EXIF 없는 사진은 None — 호출자가 upload 시각 fallback 으로 처리."""
    from app.services.evidence_service import _extract_exif_captured_at

    jpeg = _make_plain_jpeg_bytes()
    result = _extract_exif_captured_at(jpeg)
    assert result is None, f"EXIF 없는 JPEG 가 시각 반환 — silent fallback 깨짐: {result!r}"


def test_l4_exif_extraction_safe_on_garbage_input() -> None:
    """깨진 바이트 입력 — 예외 발생 X, None 반환 (업로드 흐름 막지 않음)."""
    from app.services.evidence_service import _extract_exif_captured_at

    assert _extract_exif_captured_at(b"\x00\x01\x02not-an-image") is None
    assert _extract_exif_captured_at(b"") is None


# ============================================================
# L4.3 — 워터마크 텍스트 규칙
# ============================================================


def test_l4_watermark_includes_farmer_and_captured_at() -> None:
    """워터마크 첫 두 줄 — 농가명 + 촬영시각 (감사 추적용 필수 정보)."""
    from app.services.evidence_service import _watermark_lines

    captured = datetime(2026, 6, 5, 10, 30)
    lines = _watermark_lines(
        farmer_name="김영수",
        activity_type="중간 물떼기",
        activity_id="ACT_WATER",
        evidence_type="MID_DRAINAGE_START",
        captured_at=captured,
    )
    assert any("농업인" in line and "김영수" in line for line in lines), lines
    assert any("촬영시각" in line and "2026-06-05" in line for line in lines), lines


def test_l4_watermark_omits_location_when_gps_is_zero() -> None:
    """gps (0, 0) 은 미캡처로 간주 — 위치 줄 그리지 않음 (잘못된 좌표 노출 방지)."""
    from app.services.evidence_service import _watermark_lines

    lines = _watermark_lines(
        farmer_name="김영수",
        activity_type="",
        activity_id="",
        evidence_type="",
        captured_at=datetime(2026, 6, 5),
        gps_lat=0.0,
        gps_long=0.0,
    )
    assert not any("위치" in line for line in lines), (
        f"GPS (0,0) 인데 위치 줄 표시됨 — 가짜 좌표가 워터마크에 박힘: {lines}"
    )


def test_l4_watermark_omits_location_when_gps_is_none() -> None:
    from app.services.evidence_service import _watermark_lines

    lines = _watermark_lines(
        farmer_name="김영수",
        activity_type="",
        activity_id="",
        evidence_type="",
        captured_at=datetime(2026, 6, 5),
        gps_lat=None,
        gps_long=None,
    )
    assert not any("위치" in line for line in lines)


def test_l4_watermark_includes_location_when_gps_present() -> None:
    """실제 GPS — 위치 줄에 좌표 표시 (소수점 5자리 포맷)."""
    from app.services.evidence_service import _watermark_lines

    lines = _watermark_lines(
        farmer_name="김영수",
        activity_type="",
        activity_id="",
        evidence_type="",
        captured_at=datetime(2026, 6, 5),
        gps_lat=37.56500,
        gps_long=127.12300,
    )
    loc = next((l for l in lines if "위치" in l), "")
    # 5자리 소수 — 직접 값으로 포맷 비교 (반올림 이슈 없는 값 사용)
    assert "37.56500" in loc and "127.12300" in loc, f"GPS 줄 형식 깨짐: {loc!r}"


def test_l4_watermark_includes_address_when_present() -> None:
    from app.services.evidence_service import _watermark_lines

    lines = _watermark_lines(
        farmer_name="김영수",
        activity_type="",
        activity_id="",
        evidence_type="",
        captured_at=datetime(2026, 6, 5),
        gps_lat=37.5,
        gps_long=127.0,
        address="서울시 종로구 청운효자동",
    )
    assert any("주소" in line and "종로구" in line for line in lines), lines


# ============================================================
# L4.3b — 워터마크 실제 이미지 합성 (Pillow 의존 — 결과 bytes JPEG 헤더 확인)
# ============================================================


def test_l4_watermark_save_produces_valid_jpeg_with_pixel_changes() -> None:
    """_save_watermarked_image 가 정상 JPEG 출력 + 원본 대비 픽셀 변경 (워터마크 그려짐)."""
    from app.services.evidence_service import _save_watermarked_image

    original = _make_plain_jpeg_bytes(size=(400, 400), color="white")
    out = BytesIO()
    _save_watermarked_image(
        original_bytes=original,
        output_path=out,
        extension=".jpg",
        farmer_name="김영수",
        activity_type="중간 물떼기",
        activity_id="ACT_WATER",
        evidence_type="MID_DRAINAGE_START",
        captured_at=datetime(2026, 6, 5, 10, 30),
        gps_lat=37.5,
        gps_long=127.0,
        address="서울시 종로구",
    )
    result = out.getvalue()
    assert result.startswith(b"\xff\xd8\xff"), "결과가 JPEG 헤더로 시작하지 않음"
    assert len(result) > 1000, f"결과 bytes 비정상적으로 작음: {len(result)}"
    assert result != original, "워터마크 결과가 원본과 동일 — 워터마크가 안 그려짐"


# ============================================================
# L4.1 — 시간 순서 invariant (DB)
# ============================================================


@pytest.mark.skipif(not DB_AVAILABLE, reason="DB env 없음")
def test_l4_capture_dt_le_reg_dt_invariant_for_past_photos() -> None:
    """**현재 시각 이전에 찍힌 evidence** 에서 capture_dt ≤ reg_dt 강제.

    시드의 미래 일정 placeholder (capture_dt > NOW()) 는 제외 — 의도된 데이터.
    진짜 위반: 이미 지난 시각에 찍었다고 박힌 사진인데 reg_dt 가 더 과거 = '미래 사진 위조'.
    """
    from locaville.dbcom import fetch_all

    rows = fetch_all(
        """
        SELECT capture_dt, reg_dt
        FROM evidence
        WHERE deleted_dt IS NULL
          AND capture_dt IS NOT NULL
          AND reg_dt IS NOT NULL
          AND capture_dt > reg_dt
          AND capture_dt <= NOW()
        LIMIT 5
        """,
        [],
    )
    assert not rows, (
        f"capture_dt > reg_dt 인 과거 evidence {len(rows)}건 존재 — 컴플라이언스 위반:\n  "
        + "\n  ".join(f"cap={r['capture_dt']} reg={r['reg_dt']}" for r in rows)
    )


# ============================================================
# L4.4 — PDF 리포트 (DB + ReportLab)
# ============================================================


@pytest.fixture(scope="module")
def report_client():
    if not DB_AVAILABLE:
        pytest.skip("DB env 없음 — 리포트 endpoint 검증 skip")
    from fastapi.testclient import TestClient

    from app.main import app

    return TestClient(app, raise_server_exceptions=False)


def test_l4_report_preview_has_required_blocks(report_client) -> None:
    """`/reports/project-preview` 응답에 todo/일지/증빙 블록 + 농가 식별 필드 포함."""
    r = report_client.get(
        "/reports/project-preview",
        params={"farmer_id": "ys.kim", "prj_id": "KK26A001"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    required_keys = {
        "farmer_id",
        "farmer_name",
        "prj_id",
        "project_name",
        "todos",
        "diaries",
        "evidence",
        "todo_summary",
    }
    missing = required_keys - set(body.keys())
    assert not missing, f"리포트 dict 에 keys 누락: {missing}. 실제: {sorted(body)}"
    assert body["farmer_id"] == "ys.kim"
    assert body["prj_id"] == "KK26A001"


def test_l4_report_pdf_endpoint_returns_pdf_bytes(report_client) -> None:
    """`/reports/project-pdf` 응답이 application/pdf + %PDF- 헤더로 시작."""
    r = report_client.get(
        "/reports/project-pdf",
        params={
            "farmer_id": "ys.kim",
            "prj_id": "KK26A001",
            "include_images": False,  # 이미지 fetch 부담 줄여 빠르게
        },
    )
    assert r.status_code == 200, r.text
    content_type = r.headers.get("content-type", "")
    assert "application/pdf" in content_type, f"content-type 비PDF: {content_type}"
    body = r.content
    assert body.startswith(b"%PDF-"), (
        f"PDF 헤더 누락 — 파일 깨짐 또는 다른 포맷: 첫 8바이트={body[:8]!r}"
    )
    assert len(body) > 1000, f"PDF bytes 비정상적으로 작음: {len(body)}"


def test_l4_report_preview_400_for_missing_prj_id(report_client) -> None:
    """prj_id / project_id 둘 다 비면 400 — 사업 컨텍스트 없는 리포트 거절."""
    r = report_client.get(
        "/reports/project-preview",
        params={"farmer_id": "ys.kim"},
    )
    assert r.status_code in (400, 422), r.text


# ============================================================
# L4.5 — EXIF DateTimeOriginal 박힌 이미지 추출 검증 (monkeypatch)
# ============================================================


def test_l4_exif_extraction_reads_datetime_original_when_present(monkeypatch) -> None:
    """EXIF 0x9003 (DateTimeOriginal) 박힌 사진 — 그 시각이 정확히 추출.

    핸드폰 사진이 갤러리 통해 늦게 업로드돼도 실제 촬영 시각이 워터마크에 들어감.
    piexif 없이도 PIL Image.getexif() 를 dict-like mock 으로 검증.
    """
    from PIL import Image

    from app.services import evidence_service

    class _FakeExif(dict):
        pass

    fake_exif = _FakeExif({0x9003: "2026:06:01 10:30:00"})

    class _FakeImage:
        def getexif(self):
            return fake_exif

    monkeypatch.setattr(
        Image, "open", lambda *a, **k: _FakeImage()
    )

    result = evidence_service._extract_exif_captured_at(b"\xff\xd8\xff\xd9any-bytes")
    assert result is not None, "EXIF 0x9003 박혀있는데 None 반환"
    assert result.year == 2026 and result.month == 6 and result.day == 1
    assert result.hour == 10 and result.minute == 30


def test_l4_exif_extraction_fallback_to_modify_datetime(monkeypatch) -> None:
    """EXIF DateTimeOriginal 없고 0x0132 (수정시각) 만 있으면 그것을 fallback 으로 사용."""
    from PIL import Image

    from app.services import evidence_service

    class _FakeImage:
        def getexif(self):
            return {0x0132: "2026:06:02 12:00:00"}  # DateTime, DateTimeOriginal 없음

    monkeypatch.setattr(Image, "open", lambda *a, **k: _FakeImage())

    result = evidence_service._extract_exif_captured_at(b"\xff\xd8\xff\xd9any")
    assert result is not None
    assert result.month == 6 and result.day == 2


# ============================================================
# L4.6 — GPS-parcel 거리 invariant (Haversine)
# ============================================================


def _haversine_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """두 GPS 좌표 사이의 거리 (m) — Haversine 공식.

    test 안에서만 사용. backend 가 거리 계산 함수가 없어서 여기서 직접.
    """
    import math

    R = 6_371_000  # 지구 반지름 m
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlmb / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def test_l4_haversine_self_distance_zero() -> None:
    """같은 좌표 두 번 — 거리 0."""
    assert _haversine_meters(37.5, 127.0, 37.5, 127.0) < 0.01


def test_l4_haversine_seoul_busan_around_325km() -> None:
    """서울 (37.5665, 126.9780) ↔ 부산 (35.1796, 129.0756) ≈ 325km."""
    d = _haversine_meters(37.5665, 126.9780, 35.1796, 129.0756)
    assert 320_000 < d < 330_000, f"서울-부산 직선 거리 {d:.0f}m, 기대 320-330km"


@pytest.mark.skipif(not DB_AVAILABLE, reason="DB env 없음")
@pytest.mark.xfail(
    reason=(
        "2026-06-05 발견: 시드의 김영수(1110000002) parcel 좌표가 서울 종로(37.527, 127.004) 로 "
        "박혀있는데 evidence GPS 는 전라남도/충남 농지 실좌표 (34.61/35.95). "
        "parcel 시드가 placeholder — 시드 정리 후 xfail 제거 예정."
    ),
)
def test_l4_seed_evidence_gps_within_parcel_radius() -> None:
    """시드 evidence 의 GPS 가 같은 농가 parcel 의 GPS 와 합리적 거리 (≤ 2km).

    농지 정확 폴리곤 매칭은 PostGIS 도입 시 강화. 지금은 거리만 sanity.
    의도된 미래 placeholder (capture_dt > NOW()) 도 GPS 는 정확해야 한다.
    """
    from locaville.dbcom import fetch_all

    rows = fetch_all(
        """
        SELECT e.exec_no, e.seq_no, e.amo_regno,
               e.gps_lat AS e_lat, e.gps_long AS e_lng,
               p.gps_lat AS p_lat, p.gps_long AS p_lng
        FROM evidence e
        JOIN parcel p ON p.amo_regno = e.amo_regno
        WHERE e.deleted_dt IS NULL
          AND e.gps_lat IS NOT NULL AND e.gps_long IS NOT NULL
          AND p.gps_lat IS NOT NULL AND p.gps_long IS NOT NULL
          AND e.gps_lat != 0 AND p.gps_lat != 0
        LIMIT 20
        """,
        [],
    )
    if not rows:
        pytest.skip("시드에 GPS 가 있는 evidence/parcel 매칭 0건 — 검증 대상 없음")

    far_offenders = []
    for r in rows:
        d = _haversine_meters(
            float(r["e_lat"]), float(r["e_lng"]),
            float(r["p_lat"]), float(r["p_lng"]),
        )
        if d > 2_000:
            far_offenders.append(
                f"amo={r['amo_regno']} evidence({r['e_lat']},{r['e_lng']}) "
                f"vs parcel({r['p_lat']},{r['p_lng']}) = {d:.0f}m"
            )
    assert not far_offenders, (
        "시드 evidence 의 GPS 가 농가 parcel 에서 2km 초과 — 위치 데이터 정합성 문제:\n  "
        + "\n  ".join(far_offenders)
    )


# ============================================================
# L4.7 — 재촬영 요청 흐름 (이장님 PATCH → notification 자동 INSERT)
# ============================================================


@pytest.fixture(scope="module")
def retake_client():
    if not DB_AVAILABLE:
        pytest.skip("DB env 없음 — 재촬영 흐름 검증 skip")
    from fastapi.testclient import TestClient

    from app.main import app

    return TestClient(app, raise_server_exceptions=False)


def test_l4_retake_required_triggers_notification(retake_client) -> None:
    """이장이 evidence status='retake_required' 로 PATCH → 농민 notification 자동 INSERT.

    저탄소 인증 컴플라이언스의 재촬영 요청 흐름. AGENTS.md §5 의 advisory only 와 정합 —
    이장님이 검토 결과로 명시 요청한 경우에만 알림.
    """
    from datetime import datetime

    from locaville.dbcom import fetch_all

    # 1. 농민 evidence 1건 생성 (테스트용)
    body = {
        "farmer_id": "ys.kim",
        "activity_type": "L4-retake-smoke",
        "evidence_type": "L4_RETAKE_DUMMY",
        "captured_at": datetime.now().isoformat(),
        "user_message": "[L4-retake-smoke]",
        "status": "needs_review",
    }
    r = retake_client.post("/evidence", json=body)
    assert r.status_code in (200, 201), r.text
    evidence_id = r.json()["evidence_id"]

    try:
        # 2. baseline — 김영수 (user_no=10000002) notification 개수
        before = fetch_all(
            "SELECT COUNT(*) AS n FROM notification WHERE user_no = 10000002 AND content_cd = 'RETAKE' AND deleted_dt IS NULL",
            [],
        )
        before_n = int(before[0]["n"])

        # 3. 이장 PATCH — status = retake_required
        r = retake_client.patch(
            f"/evidence/{evidence_id}",
            json={"status": "retake_required", "user_message": "필지 표지판이 잘 안 보여요. 다시 찍어주세요."},
        )
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "retake_required"

        # 4. notification 1건 증가 확인
        after = fetch_all(
            "SELECT COUNT(*) AS n FROM notification WHERE user_no = 10000002 AND content_cd = 'RETAKE' AND deleted_dt IS NULL",
            [],
        )
        after_n = int(after[0]["n"])
        assert after_n == before_n + 1, (
            f"retake_required 로 PATCH 했는데 notification 미증가 "
            f"(before={before_n}, after={after_n}) — _try_notify_retake 동작 확인 필요"
        )

        # 5. 가장 최근 notification 의 title/content 확인 (정확한 메시지가 농민에게 가는지)
        latest = fetch_all(
            "SELECT title, content, sender_cd FROM notification WHERE user_no = 10000002 AND content_cd = 'RETAKE' ORDER BY sent_dt DESC LIMIT 1",
            [],
        )
        assert latest, "방금 만든 notification 조회 실패"
        assert "사진" in latest[0]["title"] or "다시" in latest[0]["title"]
        assert latest[0]["sender_cd"] == "C"  # Chief

    finally:
        # cleanup evidence + 위에서 만든 notification
        retake_client.delete(f"/admin/evidence/{evidence_id}")
        try:
            from locaville.dbcom import execute, transaction

            with transaction() as conn:
                execute(
                    "DELETE FROM notification WHERE user_no = 10000002 AND content_cd = 'RETAKE' AND content LIKE %s",
                    ["%필지 표지판이 잘 안 보여요%"],
                    connection=conn,
                    commit=False,
                )
        except Exception:  # noqa: BLE001
            pass
