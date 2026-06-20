"""Phase F — baseline 10개 쿼리 검증.

Supabase pgvector 로 교체된 RAG 검색의 품질 + 응답 시간 측정.
각 쿼리에 대해 top-3 결과의 path/score/snippet 첫 줄을 출력.
"""
from __future__ import annotations

import os
import sys
import time
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from dotenv import load_dotenv
load_dotenv(BACKEND_DIR / ".env", override=False)

from app.services.rag_service import retrieve_relevant_snippets  # noqa: E402


BASELINE_QUERIES: list[tuple[str, str]] = [
    ("중간 물떼기 활동 단가는 얼마인가요?", "지원대상 활동 / 단가표"),
    ("바이오차 투입 증빙 사진 기준이 어떻게 되나요?", "바이오차 증빙방법"),
    ("가을갈이 이행 기준은?", "가을갈이 활동 기준"),
    ("저탄소 농업 사업 참여 절차를 알려주세요", "사업참여 단계"),
    ("사업대상자 선정 우선순위는 어떻게 되나요?", "선정 점수 / 우선 선정"),
    ("논물 얕게 걸러대기는 몇 회 해야 하나요?", "AWD 4회 + 4일 간격"),
    ("사업 포기 신청은 어떻게 하나요?", "사업포기 절차"),
    ("농업법인 자격 요건은?", "지원자격 / 농업법인 / 생산자단체"),
    ("활동비 지급 시기는 언제인가요?", "활동비 지급 시기"),
    ("바이오차 영수증은 어떤 형식이어야 하나요?", "세금계산서 / 납품 서류"),
]


def main() -> int:
    total_time = 0.0
    print("=" * 80)
    print(f"Phase F — baseline {len(BASELINE_QUERIES)} 쿼리 검증")
    print(f"RAG_USE_PGVECTOR={os.getenv('RAG_USE_PGVECTOR', '(default=1)')}")
    print("=" * 80)
    print()

    for i, (query, expected) in enumerate(BASELINE_QUERIES, 1):
        print(f"[{i}/{len(BASELINE_QUERIES)}] {query}")
        print(f"     기대: {expected}")

        t0 = time.perf_counter()
        try:
            results = retrieve_relevant_snippets(query, limit=3)
        except Exception as e:
            print(f"     [ERR] {type(e).__name__}: {e}")
            print()
            continue
        dt = time.perf_counter() - t0
        total_time += dt

        print(f"     응답 시간: {dt*1000:.0f} ms  / top-{len(results)}")
        for rank, r in enumerate(results, 1):
            path = (r.get("path") or "")[:110]
            snippet_first = (r.get("snippet") or "").split("\n")[0][:80]
            print(f"       {rank}. score {r['score']:>4}  {path}")
            print(f"          → {snippet_first}")
        print()

    print("=" * 80)
    print(f"평균 응답 시간: {total_time / len(BASELINE_QUERIES) * 1000:.0f} ms")
    print(f"전체 응답 시간: {total_time:.1f} s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
