"""L2 Invariant — AGENTS.md §5 5대 원칙 회귀 검증 (10분).

저탄마을 4-Level 테스트 시나리오의 Level 2. 깨지면 컴플라이언스 / 보안 위반 직결.

검증 영역:
  L2.1 To-do source = RDB (DB-bound — DATABASE_URL 있을 때만)
  L2.3 AI advisory only — Vision needs_confirmation + BIOCHAR 영수증 자동확정 X
  L2.4 farmer_id 단일성 — frontend 에 group_no/amo_regno 직접 노출 X
  L2.5 Secrets backend only — frontend .env 에 backend-only secret 노출 X

실행:
    cd locaville/backend
    .\\.venv\\Scripts\\python -m pytest tests/test_l2_invariants.py -v
"""
from __future__ import annotations

import os
import re
from pathlib import Path

import pytest


BACKEND_ROOT = Path(__file__).resolve().parents[1]
LOCAVILLE_ROOT = BACKEND_ROOT.parent

DB_AVAILABLE = bool(
    os.getenv("DATABASE_URL")
    or os.getenv("DB_URL")
    or os.getenv("DB_HOST")
)


# =====================================================================
# L2.3a Vision advisory — 영수증 BIOCHAR false positive 회귀 방지
# (2026-06-05 키워드 좁히기 + confidence 보수화의 회귀 보호)
# =====================================================================


def _infer():
    """lazy import — module collection 시점에 service import 부담 줄임."""
    from app.services.ai_service import _infer_activity_from_receipt

    return _infer_activity_from_receipt


def test_l2_receipt_carbon_word_no_false_positive() -> None:
    """일반 영수증의 '저탄소' 마크 단어가 BIOCHAR 로 자동 분류되면 안 됨."""
    out = _infer()({"vendor": "농협하나로", "items": ["저탄소 인증 비료 20kg"]})
    assert out["suggested_activity_type"] == "", (
        f"'탄소' 단어만으로 BIOCHAR 매칭 → false positive. 결과: {out}"
    )


def test_l2_receipt_charcoal_word_no_false_positive() -> None:
    out = _infer()({"vendor": "숯불구이맛집", "items": ["참숯 1박스"]})
    assert out["suggested_activity_type"] == ""


def test_l2_receipt_soil_amendment_word_no_false_positive() -> None:
    out = _infer()({"vendor": "농자재마트", "items": ["석회질 토양개량제"]})
    assert out["suggested_activity_type"] == ""


def test_l2_receipt_biochar_weak_match_low_confidence() -> None:
    """단일 키워드 매칭 → low confidence + evidence_type 자동매핑 차단."""
    out = _infer()({"vendor": "바이오차 농자재", "items": ["바이오차 50kg"]})
    assert out["suggested_activity_type"] == "BIOCHAR"
    assert out["suggested_confidence"] <= 0.5, (
        f"low confidence (1개 매칭) 기대 ≤ 0.5, 실제 {out['suggested_confidence']}"
    )
    assert out["suggested_evidence_type"] == "", (
        "low confidence 일 때는 evidence_type 자동매핑 금지 (사용자 확인 강제)"
    )


def test_l2_receipt_biochar_strong_match_auto_invoice() -> None:
    """3개 키워드 매칭 → high confidence + BIOCHAR_INVOICE 자동매핑."""
    out = _infer()(
        {
            "vendor": "바이오차 농자재",
            "items": ["바이오차 50kg", "왕겨숯 10kg", "biochar invoice"],
        }
    )
    assert out["suggested_activity_type"] == "BIOCHAR"
    assert out["suggested_confidence"] >= 0.8
    assert out["suggested_evidence_type"] == "BIOCHAR_INVOICE"


def test_l2_receipt_other_activity_unaffected() -> None:
    """BIOCHAR 키워드 변경이 WASTE 등 다른 활동에 영향 없음."""
    out = _infer()({"vendor": "수거장", "items": ["폐비닐 30kg"]})
    assert out["suggested_activity_type"] == "WASTE"


# =====================================================================
# L2.3b Vision schema — needs_confirmation default True
# =====================================================================


def test_l2_vision_schema_default_requires_confirmation() -> None:
    """Pydantic schema 가 needs_confirmation 기본값 True — 자동확정 차단."""
    from app.schemas.ai import AIVisionEvidenceLabelResponse

    resp = AIVisionEvidenceLabelResponse(
        suggested_label="X",
        user_message="",
    )
    assert resp.needs_confirmation is True, (
        "Vision 응답 schema 의 needs_confirmation 기본값이 False 이면 "
        "frontend 가 자동확정할 위험 — AGENTS.md §5 위반"
    )


# =====================================================================
# L2.5 Secrets backend only — frontend .env 에 backend-only secret 없음
# =====================================================================

_FORBIDDEN_PUBLIC_PREFIXES = (
    "NEXT_PUBLIC_OPENAI",
    "NEXT_PUBLIC_DATABASE",
    "NEXT_PUBLIC_DB_PASSWORD",
    "NEXT_PUBLIC_KAKAO_REST",        # 카카오 REST key 는 server-side only
    "NEXT_PUBLIC_NONGSARO",
    "NEXT_PUBLIC_DATA_GO_KR",
    "NEXT_PUBLIC_SUPABASE_SERVICE",   # service-role key — anon 은 OK
)


def _iter_frontend_env_files() -> list[Path]:
    out: list[Path] = []
    for app_dir in ("app_user", "web_user", "web_admin"):
        d = LOCAVILLE_ROOT / app_dir
        if not d.exists():
            continue
        for name in (".env.local", ".env", ".env.production", ".env.development"):
            f = d / name
            if f.exists():
                out.append(f)
    return out


def test_l2_no_forbidden_secrets_in_frontend_env() -> None:
    bad: list[str] = []
    for env_file in _iter_frontend_env_files():
        text = env_file.read_text(encoding="utf-8", errors="ignore")
        for line in text.splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                continue
            key = stripped.split("=", 1)[0].strip()
            for forbidden in _FORBIDDEN_PUBLIC_PREFIXES:
                if key.startswith(forbidden):
                    bad.append(
                        f"{env_file.relative_to(LOCAVILLE_ROOT)}: {key}"
                    )
    assert not bad, (
        "frontend .env 에 backend-only secret 노출:\n  " + "\n  ".join(bad)
    )


# =====================================================================
# L2.4 farmer_id 단일성 — frontend 에 group_no/amo_regno 직접 노출 X
# =====================================================================

_FORBIDDEN_HARDCODE_RE = re.compile(
    r"(group_no\s*[:=]\s*\d{5,})|(amo_regno\s*[:=]\s*['\"]AMOJT)"
)

# 의도된 시드/데모 매핑은 예외 — 파일명 기준 화이트리스트
_ALLOWED_FILES = {
    "demo-context.ts",
    "demo-ids.ts",
    "project-id.ts",
    "sample-user-context.ts",  # 데모 user_no/group_no 매핑 (주석 안 ID 기재 포함)
}

# 주석 라인 (// 또는 * 시작) 은 invariant 검사 대상 아님 — 코드만 본다
_COMMENT_LINE_RE = re.compile(r"^\s*(//|\*|/\*)")


def _iter_frontend_source_files() -> list[Path]:
    out: list[Path] = []
    for app_dir in ("app_user", "web_user", "web_admin"):
        d = LOCAVILLE_ROOT / app_dir
        if not d.exists():
            continue
        for pattern in ("*.ts", "*.tsx"):
            for f in d.rglob(pattern):
                # node_modules / .next / 빌드 산출물 제외
                if any(part in {"node_modules", ".next", "dist", "build"} for part in f.parts):
                    continue
                if f.name in _ALLOWED_FILES:
                    continue
                out.append(f)
    return out


def test_l2_no_hardcoded_group_no_or_amo_regno_in_frontend() -> None:
    offenders: list[str] = []
    for f in _iter_frontend_source_files():
        text = f.read_text(encoding="utf-8", errors="ignore")
        for line_no, line in enumerate(text.splitlines(), start=1):
            if _COMMENT_LINE_RE.match(line):
                continue
            m = _FORBIDDEN_HARDCODE_RE.search(line)
            if m:
                offenders.append(
                    f"{f.relative_to(LOCAVILLE_ROOT)}:{line_no}: {m.group(0)}"
                )
    assert not offenders, (
        "frontend 에 group_no/amo_regno 하드코딩 발견 (farmer_id 추상화 위반):\n  "
        + "\n  ".join(offenders[:20])
    )


# =====================================================================
# L2.1 To-do source = RDB (DB-bound — DB 없으면 skip)
# =====================================================================


@pytest.mark.skipif(not DB_AVAILABLE, reason="DB env 없음 — RDB 조회 검증 skip")
def test_l2_todo_today_unknown_farmer_no_ai_fallback() -> None:
    """존재하지 않는 farmer_id 의 /todo/today 가 빈 응답 — AI 가 채우면 안 됨."""
    from fastapi.testclient import TestClient

    from app.main import app

    c = TestClient(app, raise_server_exceptions=False)
    r = c.get("/todo/today", params={"farmer_id": "nonexistent_user_99999"})
    assert r.status_code in (200, 404), r.text
    if r.status_code == 200:
        body = r.json()
        items = body if isinstance(body, list) else (body.get("items") or [])
        assert items == [], (
            "존재하지 않는 farmer 인데 todo 가 채워짐 — "
            "AI/RAG fallback 의심 (AGENTS.md §5: To-do source = RDB)"
        )
