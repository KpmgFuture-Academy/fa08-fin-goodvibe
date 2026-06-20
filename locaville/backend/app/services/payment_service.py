"""이장님 회계/지급 관리 — 사업 완료 농가에게 지급할 금액 자동 집계.

계산식:
  농가별 지급액 = Σ (활동별 단가/ha × 활동 적용 면적/ha)

데이터 source:
  - prj_todo_list: 농가별 활동 list + job_progress (END 만 완료로 집계)
  - parcel: 농가별 필지 면적 (m² → ha 변환: / 10000)
  - SUBSIDY_BY_JOB_CD: 시행문서 단가표 (frontend lib/project-subsidy.ts 와 동기화)

향후 DBA `subsidy_master` 테이블 도입 시 이 dict 를 그대로 backend → DB lookup 으로 교체.
"""
from __future__ import annotations

from typing import Any

from locaville.dbcom import fetch_all


# 활동(job_cd) → 천원 단위 헥타르당 단가. 2026 저탄소농업 시범사업 경종 상반기 기준.
# frontend `lib/project-subsidy.ts` 와 동일한 source. 동기화 필요.
SUBSIDY_BY_JOB_CD: dict[str, dict[str, Any]] = {
    "R0008": {"label": "중간 물떼기", "per_ha_thousand_won": 150},
    "R0009": {"label": "논물 얕게 걸러대기", "per_ha_thousand_won": 160},
    "RD001": {"label": "바이오차 투입", "per_ha_thousand_won": 364},
    "RD002": {"label": "가을갈이", "per_ha_thousand_won": 460},
}

# 활동명 keyword fallback (job_cd 모를 때).
SUBSIDY_BY_KEYWORD: list[tuple[str, str]] = [
    ("중간 물떼기", "R0008"),
    ("중간물떼기", "R0008"),
    ("논물 얕게 걸러대기", "R0009"),
    ("논물얕게걸러대기", "R0009"),
    ("바이오차", "RD001"),
    ("가을갈이", "RD002"),
]


def _lookup_job_cd(job_cd: str, activity_name: str) -> str | None:
    """job_cd 우선, 없으면 activity_name keyword 로 fallback 매핑."""
    if job_cd and job_cd.strip().upper() in SUBSIDY_BY_JOB_CD:
        return job_cd.strip().upper()
    name = activity_name or ""
    for keyword, code in SUBSIDY_BY_KEYWORD:
        if keyword in name:
            return code
    return None


def _list_all_todo_rows() -> list[dict[str, Any]]:
    """모든 활동 list + 필지 면적 JOIN.

    job_progress 무관 — 완료 판단은 호출자가 admin_service.get_admin_todo_status() 의
    `computed_status='completed'` 로 더 정확히 함 (evidence 매칭 기반).
    """
    sql = """
        SELECT
            t.amo_regno,
            af.amo_name,
            um.user_name,
            t.prj_id,
            pr.prj_name,
            t.activity_id,
            pa.activity_name,
            t.job_cd,
            fj.job_name,
            t.parcel_no,
            t.job_progress,
            p.parcel_area AS area
        FROM prj_todo_list t
        LEFT JOIN amo_family af ON af.amo_regno = t.amo_regno
        LEFT JOIN user_master um ON um.user_no = af.chief_no
        LEFT JOIN project pr ON pr.prj_id = t.prj_id
        LEFT JOIN prj_activity pa ON pa.prj_id = t.prj_id AND pa.activity_id = t.activity_id
        LEFT JOIN farm_job fj ON fj.job_cd = t.job_cd
        LEFT JOIN parcel p ON p.amo_regno = t.amo_regno AND p.parcel_no = t.parcel_no
        ORDER BY t.amo_regno, t.prj_id
    """
    return fetch_all(sql, [])


def get_admin_payments() -> dict[str, Any]:
    """이장님 회계 화면용 — 농가별 지급액 + 활동 breakdown + 마을 총액.

    응답:
      {
        "village_total_won": 12345000,
        "farmer_count": 8,
        "farmers": [
          {
            "amo_regno": "1110000002",
            "amo_name": "김영수 씨",
            "user_name": "김영수",
            "total_won": 1234000,
            "items": [
              {
                "prj_name": "...", "activity_name": "...", "job_name": "...",
                "parcel_no": "1", "area_m2": 4310.0, "area_ha": 0.431,
                "per_ha_thousand_won": 150, "amount_won": 64650
              }, ...
            ]
          }, ...
        ]
      }
    """
    rows = _list_all_todo_rows()

    # admin_service.get_admin_todo_status() 가 evidence 매칭으로 computed_status 계산.
    # 그 결과의 (farmer_id, prj_id, activity_id) 키 → 'completed' 여부 매핑.
    from app.services.admin_service import get_admin_todo_status
    status_resp = get_admin_todo_status()
    completed_keys: set[tuple[str, str, str]] = set()
    for item in status_resp.get("items", []):
        if (item.get("computed_status") or "").lower() != "completed":
            continue
        completed_keys.add((
            (item.get("farmer_id") or "").strip(),
            (item.get("prj_id") or "").strip(),
            (item.get("activity_id") or "").strip(),
        ))

    by_farmer: dict[str, dict[str, Any]] = {}
    village_total = 0

    for row in rows:
        amo_regno = row.get("amo_regno") or ""
        if not amo_regno:
            continue

        # 완료 여부 — computed_status='completed' 인 (농가, 사업, 활동) 만 집계.
        row_key = (amo_regno, (row.get("prj_id") or "").strip(), (row.get("activity_id") or "").strip())
        if row_key not in completed_keys:
            continue

        # 단가 lookup
        matched_code = _lookup_job_cd(row.get("job_cd") or "", row.get("activity_name") or "")
        subsidy = SUBSIDY_BY_JOB_CD.get(matched_code) if matched_code else None
        if not subsidy:
            continue  # 단가표에 없는 활동은 집계 X

        per_ha_kw = int(subsidy["per_ha_thousand_won"])
        # 면적 (m² → ha). 없으면 0 → 지급액 0.
        area_m2_raw = row.get("area")
        area_m2 = float(area_m2_raw) if area_m2_raw is not None else 0.0
        area_ha = round(area_m2 / 10000, 4)
        amount_won = int(round(per_ha_kw * 1000 * area_ha))

        farmer = by_farmer.setdefault(amo_regno, {
            "amo_regno": amo_regno,
            "amo_name": row.get("amo_name") or "",
            "user_name": row.get("user_name") or "",
            "total_won": 0,
            "items": [],
        })
        farmer["items"].append({
            "prj_id": row.get("prj_id") or "",
            "prj_name": row.get("prj_name") or "",
            "activity_id": row.get("activity_id") or "",
            "activity_name": row.get("activity_name") or row.get("job_name") or "",
            "job_cd": matched_code,
            "job_name": row.get("job_name") or subsidy["label"],
            "parcel_no": str(row.get("parcel_no")) if row.get("parcel_no") is not None else "",
            "area_m2": area_m2,
            "area_ha": area_ha,
            "per_ha_thousand_won": per_ha_kw,
            "amount_won": amount_won,
        })
        farmer["total_won"] += amount_won
        village_total += amount_won

    farmers_list = sorted(by_farmer.values(), key=lambda f: f["total_won"], reverse=True)
    return {
        "village_total_won": village_total,
        "farmer_count": len(farmers_list),
        "farmers": farmers_list,
    }
