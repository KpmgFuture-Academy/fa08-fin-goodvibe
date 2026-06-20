"""L7 Performance — 핵심 endpoint latency / 무거운 쿼리 / pgvector 검색 응답 시간.

저탄마을 4-Level 의 L7. AGENTS.md §9 의 Render free plan cold start 30초 대응, 시연 중
느린 화면 점검, DB N+1 의심 사례 감지.

자동 검증 항목:
  L7.1 핵심 endpoint 첫 응답 latency (warm) — 시연 환경 baseline
  L7.2 catalog/list endpoint payload 적정 크기 — N+1 쿼리 의심 감지
  L7.3 pgvector 검색 latency (RAG retrieve) — 임베딩 + HNSW 응답 시간
  L7.4 PDF 리포트 생성 latency — 무거운 산출물

각 임계값은 매 시연 직전 baseline 으로 회귀 감지 목적. 절대값보다는 추세.

실행:
    cd locaville/backend
    .\\.venv\\Scripts\\python -m pytest tests/test_l7_performance.py -v -s
"""
from __future__ import annotations

import os
import time

import pytest


DB_AVAILABLE = bool(
    os.getenv("DATABASE_URL")
    or os.getenv("DB_URL")
    or os.getenv("DB_HOST")
)

# 2026-06-05 — Render starter plan 으로 업그레이드되어 cold start 30초 우려 해소.
# 시연 환경의 latency 회귀 감지는 당분간 보류. 다시 free plan 으로 내려가거나
# 사용자 폭증 / DB 마이그 등으로 응답 지연이 의심될 때 이 skip 해제하고 실행.
# 환경변수 `L7_RUN=1` 을 주면 강제 실행 (회귀 의심 시 즉석 점검용).
_FORCE_RUN_L7 = os.getenv("L7_RUN", "").strip() == "1"
pytestmark = [
    pytest.mark.skipif(
        not DB_AVAILABLE,
        reason="L7 은 실 DB endpoint latency 측정 — DB env 필요",
    ),
    pytest.mark.skipif(
        not _FORCE_RUN_L7,
        reason="Render starter plan 으로 cold start 우려 해소 (2026-06-05). "
               "강제 실행은 L7_RUN=1 환경변수.",
    ),
]


@pytest.fixture(scope="module")
def client():
    from fastapi.testclient import TestClient

    from app.main import app

    c = TestClient(app, raise_server_exceptions=False)
    # warm-up — startup events + DB connection pool 채우기
    c.get("/health")
    return c


def _measure(fn) -> float:
    """단순 timing — 모듈 안에서 datetime/time 만 사용 (다른 모듈 영향 X)."""
    t0 = time.perf_counter()
    result = fn()
    elapsed = time.perf_counter() - t0
    return elapsed, result


# ============================================================
# L7.1 — 핵심 endpoint 응답 latency baseline
# ============================================================


@pytest.mark.parametrize(
    "method,path,params,limit_sec",
    [
        ("GET", "/health", {}, 0.5),
        ("GET", "/project", {}, 2.0),                                     # catalog
        ("GET", "/todo/today", {"farmer_id": "ys.kim"}, 3.0),
        ("GET", "/admin/summary", {}, 5.0),                               # 가장 무거운 대시보드 집계
        ("GET", "/admin/laggard-farmers", {}, 3.0),
    ],
)
def test_l7_1_endpoint_warm_latency(client, method, path, params, limit_sec) -> None:
    """warm 상태 (startup 이후 ≥1회 호출) 의 핵심 endpoint latency 가 임계값 이내.

    임계값은 시연 환경 (Render free plan) 의 합리적 baseline. 회귀 감지 목적이라
    절대값 의미 < 추세 의미. 임계값을 N배 초과하면 N+1 쿼리 / 외부 호출 의심.
    """
    elapsed, response = _measure(lambda: client.request(method, path, params=params))
    assert response.status_code in (200, 404), response.text
    print(f"\n[L7.1] {method} {path} → {elapsed * 1000:.0f}ms (limit {limit_sec * 1000:.0f}ms)")
    assert elapsed < limit_sec, (
        f"{method} {path} latency {elapsed:.2f}s > {limit_sec}s — 회귀 의심"
    )


# ============================================================
# L7.2 — payload 크기 sanity (N+1 / 과도한 JOIN 감지)
# ============================================================


def test_l7_2_admin_summary_payload_under_500kb(client) -> None:
    """/admin/summary 응답 < 500KB — 시드 규모에서는 크지 않아야 함.

    이를 초과하면 농가/일지/증빙 join 이 cross product 가 됐을 가능성.
    """
    r = client.get("/admin/summary")
    assert r.status_code == 200
    size = len(r.content)
    print(f"\n[L7.2] /admin/summary payload {size / 1024:.1f}KB")
    assert size < 500 * 1024, (
        f"summary payload {size / 1024:.1f}KB > 500KB — N+1 / cross join 의심"
    )


def test_l7_2_project_list_payload_under_200kb(client) -> None:
    r = client.get("/project")
    assert r.status_code == 200
    size = len(r.content)
    print(f"\n[L7.2] /project payload {size / 1024:.1f}KB")
    assert size < 200 * 1024, f"project catalog payload {size / 1024:.1f}KB > 200KB"


# ============================================================
# L7.3 — pgvector 검색 latency
# ============================================================


def test_l7_3_pgvector_retrieve_latency_under_5s() -> None:
    """RAG retrieve — 임베딩 1회 + HNSW 검색 응답 < 5초.

    OpenAI embed API 호출 포함이라 네트워크 의존. key 없으면 skip.
    """
    if not os.getenv("OPENAI_API_KEY", "").strip():
        pytest.skip("OPENAI_API_KEY 없음 — RAG 검색 실행 skip")

    from app.services.rag_service import retrieve_relevant_snippets

    elapsed, snippets = _measure(
        lambda: retrieve_relevant_snippets("중간 물떼기 기간은 얼마나 되나요?", limit=8)
    )
    print(f"\n[L7.3] pgvector retrieve → {elapsed * 1000:.0f}ms, {len(snippets)} hits")
    assert elapsed < 5.0, (
        f"pgvector 검색 latency {elapsed:.2f}s > 5s — HNSW index / 임베딩 API 점검"
    )


# ============================================================
# L7.4 — PDF 리포트 생성 latency
# ============================================================


def test_l7_4_report_pdf_generation_under_10s(client) -> None:
    """`/reports/project-pdf` 생성 < 10초.

    ReportLab + 이미지 fetch 가 포함. include_images=False 로 외부 호출 최소화.
    """
    elapsed, r = _measure(
        lambda: client.get(
            "/reports/project-pdf",
            params={"farmer_id": "ys.kim", "prj_id": "KK26A001", "include_images": False},
        )
    )
    assert r.status_code == 200, r.text
    print(f"\n[L7.4] PDF 생성 → {elapsed:.2f}s, {len(r.content) / 1024:.1f}KB")
    assert elapsed < 10.0, f"PDF 생성 latency {elapsed:.2f}s > 10s"


# ============================================================
# L7.5 — DB raw 쿼리 latency baseline
# ============================================================


def test_l7_5_evidence_recent_query_under_1s() -> None:
    """`evidence` 의 최근 N건 조회 < 1s — index 효과 확인용."""
    from locaville.dbcom import fetch_all

    elapsed, rows = _measure(
        lambda: fetch_all(
            "SELECT exec_no, seq_no, user_no, capture_dt FROM evidence "
            "WHERE deleted_dt IS NULL ORDER BY reg_dt DESC LIMIT 50",
            [],
        )
    )
    print(f"\n[L7.5] evidence 최근 50건 → {elapsed * 1000:.0f}ms, {len(rows)} rows")
    assert elapsed < 1.0, f"evidence 최근 조회 {elapsed:.2f}s > 1s — index 점검"
