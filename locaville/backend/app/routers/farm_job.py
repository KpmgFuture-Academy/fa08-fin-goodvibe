"""``/farm-job/*`` 라우터 — 작업종류 마스터 (farm_job 테이블) 조회.

v0_farmer 의 "직접 입력하기" 화면에서 작업종류 선택지를 하드코딩하지 않고
DB 마스터를 그대로 받아 표시하기 위함.
"""
from __future__ import annotations

from fastapi import APIRouter

from locaville.dbcom import fetch_all


router = APIRouter(prefix="/farm-job", tags=["farm-job"])


@router.get("/list")
def list_farm_jobs() -> dict:
    """전체 작업종류 목록 (활성 코드만).

    응답: { "items": [{ "job_cd": "R0008", "job_name": "중간물떼기",
                        "start_mmdd": "0625", "end_mmdd": "0710" }, ...] }
    job_name 이 NULL 인 경우 job_cd 자체를 라벨로 사용 (호출 측 fallback).
    start_mmdd/end_mmdd 는 작업 제철 윈도우(MMDD). 미설정이면 null →
    호출 측이 '상시 작업'(항상 노출)으로 취급.
    """
    rows = fetch_all(
        """
        SELECT job_cd, job_name, start_mmdd, end_mmdd
        FROM farm_job
        WHERE job_cd IS NOT NULL
        ORDER BY job_cd
        """,
    ) or []
    items = []
    for r in rows:
        code = (r.get("job_cd") or "").strip()
        if not code:
            continue
        items.append(
            {
                "job_cd": code,
                "job_name": (r.get("job_name") or "").strip(),
                # CHAR(4) 공백 패딩 제거. 빈 값이면 null (윈도우 미설정 = 상시).
                "start_mmdd": (r.get("start_mmdd") or "").strip() or None,
                "end_mmdd": (r.get("end_mmdd") or "").strip() or None,
            }
        )
    return {"items": items}
