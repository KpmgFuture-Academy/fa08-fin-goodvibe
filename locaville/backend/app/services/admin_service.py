"""이장님 대시보드 (``/admin/*``) 서비스 레이어.

v0_chief 가 호출하는 두 endpoint 의 응답을 만듭니다:
  - ``GET /admin/summary``      → 마을 요약 (vw_jeotan_farmer_summary 기반)
  - ``GET /admin/todo-status``  → todo 진행 상태 + 누락 증빙 (todo_service + evidence 매칭)

신 스키마(view) 의 컬럼을 기존 v0_chief 가 기대하는 dict 모양으로 어댑팅합니다.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Any

from app.repositories import admin_view_rdb as views_repo
from app.repositories.diary_rdb import count_diaries_since, soft_delete_diary_mysql
from app.repositories.evidence_rdb import (
    count_evidence_since,
    fetch_recent_originals,
    soft_delete_evidence_mysql,
)
from app.repositories.notification_rdb import insert_notification
from app.services.evidence_service import get_required_evidence_types
from app.services.todo_service import list_today_todos, _is_same_todo_context
from app.services.diary_service import list_diary_records as _legacy_list_diaries
from app.services.evidence_service import list_evidence_records as _legacy_list_evidence


# ============================================================
# /admin/summary  ← 신 스키마 view 기반
# ============================================================
#
# 응답 키는 기존 v0_chief 계약을 그대로 유지합니다:
#   total_diaries, total_evidence, total_farmers,
#   diaries_by_farmer[], evidence_by_status{}, recent_diaries[], recent_evidence[]
#
# 차이점:
#   - "farmer_id" 자리에 새 스키마의 amo_regno 가 들어갑니다.
#     (한 농가 = 한 amo_regno. 기존 프론트는 farmer_id 를 opaque 문자열로 다루므로 호환됨.)
#   - "farmer_name" 자리에 amo_name 이 들어가고, 없으면 user_name 으로 폴백.
#   - diaries_by_farmer 에 `amo_regno`, `user_no`, `user_name`, `ville_name`,
#     `parcel_count`, `rice_area`, `todo_count`, `done_todo_count`,
#     `delayed_todo_count`, `todo_completion_rate` 등 추가 optional 필드 노출.
#   - evidence_by_status 는 evidence.raw_json.$.status 기반 — INSERT 가 status 를
#     raw_json 에 넣어 두는 경우에만 채워집니다.

def _iso(value: Any) -> str | None:
    """date/datetime → ISO 문자열. None 은 그대로 None."""
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def _diary_id_for(user_no: int | None, job_date: Any, exec_no: int | None) -> str:
    """API diary_id 합성: {user_no}-{yyyymmdd}-{exec_no}.

    하나라도 없으면 빈 문자열을 반환 (응답이 깨지지 않게).
    """
    if user_no is None or job_date is None or exec_no is None:
        return ""
    if isinstance(job_date, (date, datetime)):
        d = job_date.strftime("%Y%m%d")
    else:
        d = str(job_date).replace("-", "")
    return f"{user_no}-{d}-{exec_no}"


def _evidence_id_for(
    user_no: int | None,
    job_date: Any,
    exec_no: int | None,
    seq_no: int | None,
) -> str:
    """4-key evidence_id 합성. parent 3-key 가 비어있으면 빈 문자열."""
    base = _diary_id_for(user_no, job_date, exec_no)
    if not base or seq_no is None:
        return base
    return f"{base}-{seq_no}"


def _status_from_journal(job_cmpl_yn: str | None) -> str:
    """journal.job_cmpl_yn (Y/N) → 화면용 status. 'Y'=saved, 그 외=created."""
    if (job_cmpl_yn or "").upper() == "Y":
        return "saved"
    return "created"


def _status_from_evidence_raw(raw_json: Any) -> str:
    """evidence.raw_json.$.status 가 있으면 그 값, 없으면 'needs_review'."""
    if isinstance(raw_json, dict):
        s = raw_json.get("status")
        if isinstance(s, str) and s:
            return s
    return "needs_review"


def _farmer_summary_row_to_dict(row: dict) -> dict:
    """vw_jeotan_farmer_summary row → diaries_by_farmer 항목."""
    amo_regno = row.get("amo_regno") or ""
    amo_name = row.get("amo_name") or ""
    user_name = row.get("user_name") or ""
    return {
        # 기존 프론트 필드 (호환)
        "farmer_id": amo_regno,
        "farmer_name": amo_name or user_name,
        "diary_count": int(row.get("journal_count") or 0),
        "evidence_count": int(row.get("evidence_count") or 0),
        "latest_work_date": None,  # latest_work_dates 맵으로 나중에 채움
        # 신 스키마 optional 필드 (프론트가 점진적으로 인지)
        "amo_regno": amo_regno,
        "amo_name": amo_name,
        "user_no": row.get("user_no"),
        "user_name": user_name,
        # 가입상태 코드 (user_master.status_cd) — ACT(가입완료) / INV(초대발송) / PEND(가입대기).
        # frontend 가 이 값을 보고 화면 라벨(가입대기/초대발송/가입완료) 결정.
        "status_cd": row.get("status_cd") or "",
        "ville_name": row.get("ville_name") or "",
        "phone": row.get("phone_no") or "",
        "address": row.get("home_addr_1") or "",
        "address_detail": row.get("home_addr_2") or "",
        "zip_cd": row.get("zip_cd") or "",
        "parcel_count": int(row.get("parcel_count") or 0),
        "rice_area": float(row.get("rice_area") or 0),
        "todo_count": int(row.get("todo_count") or 0),
        "done_todo_count": int(row.get("done_todo_count") or 0),
        "delayed_todo_count": int(row.get("delayed_todo_count") or 0),
        "todo_completion_rate": float(row.get("todo_completion_rate") or 0),
    }


def _journal_evidence_row_to_diary(row: dict) -> dict:
    """vw_jeotan_journal_evidence row → recent_diaries 항목 (AdminDiaryItem 호환)."""
    user_no = row.get("user_no")
    exec_no = row.get("exec_no")
    job_date = row.get("job_date")
    amo_regno = row.get("amo_regno") or ""
    amo_name = row.get("amo_name") or ""
    user_name = row.get("user_name") or ""
    return {
        # 기존 프론트 필드
        "diary_id": _diary_id_for(user_no, job_date, exec_no),
        "farmer_id": amo_regno,
        "farmer_name": amo_name or user_name,
        "work_date": _iso(job_date) or "",
        "crop_name": "",  # 새 스키마 journal 에는 crop 컬럼이 없음
        "work_stage": row.get("job_name") or "",
        "work_stage_detail": row.get("activity_name") or "",
        "work_detail": row.get("exec_desc") or "",
        "status": _status_from_journal(row.get("job_cmpl_yn")),
        "linked_evidence_ids": [],
        "created_at": None,
        "updated_at": None,
        # 신 스키마 optional 필드
        "user_no": user_no,
        "user_name": user_name,
        "amo_regno": amo_regno,
        "amo_name": amo_name,
        "exec_no": exec_no,
        "job_cd": row.get("job_cd") or "",
        "input_type_cd": row.get("input_type_cd") or "",
        "prj_id": row.get("prj_id") or "",
        "project_id": row.get("prj_id") or "",
        "prj_name": row.get("prj_name") or "",
        "activity_id": row.get("activity_id") or "",
        "activity_name": row.get("activity_name") or "",
        "parcel_no": row.get("parcel_no"),
        "parcel_regno": row.get("parcel_regno") or "",
        "evidence_count": int(row.get("evidence_count") or 0),
        # 영농일지가 어느 단체 활동인지 — prj_journal.group_no + ville_group.group_name JOIN.
        # residents 화면의 참여단체 탭이 진짜 group_name 으로 표시하는데 사용.
        "group_no": row.get("group_no"),
        "group_name": row.get("group_name") or "",
    }


def _evidence_row_to_dict(row: dict) -> dict:
    """`evidence` 직접 조회 row → recent_evidence 항목 (AdminEvidenceItem 호환)."""
    user_no = row.get("user_no")
    job_date = row.get("job_date")
    exec_no = row.get("exec_no")
    seq_no = row.get("seq_no")
    amo_regno = row.get("amo_regno") or ""
    amo_name = row.get("amo_name") or ""
    user_name = row.get("user_name") or ""
    raw_json = row.get("raw_json") or {}
    if isinstance(raw_json, str):
        # pymysql JSON 컬럼은 dict 로 오지만, 안전망.
        try:
            import json as _json
            raw_json = _json.loads(raw_json)
        except Exception:
            raw_json = {}
    return {
        # 기존 프론트 필드
        "evidence_id": _evidence_id_for(user_no, job_date, exec_no, seq_no),
        "farmer_id": amo_regno,
        "farmer_name": amo_name or user_name,
        "activity_type": (raw_json.get("activity_type") if isinstance(raw_json, dict) else None) or "",
        "evidence_type": (raw_json.get("evidence_type") if isinstance(raw_json, dict) else None)
            or row.get("evid_cd")
            or "",
        "confirmed_label": row.get("ai_label") or "",
        "status": _status_from_evidence_raw(raw_json),
        "user_message": (raw_json.get("user_message") if isinstance(raw_json, dict) else "") or "",
        "captured_at": _iso(row.get("capture_dt")) or "",
        "created_at": _iso(row.get("reg_dt")),
        "updated_at": _iso(row.get("mod_dt")),
        # image_url 은 새 스키마에 별도 컬럼이 없음. file_path 그대로 노출.
        "image_url": row.get("file_path") or "",
        "storage_path": row.get("file_path") or "",
        # 신 스키마 optional 필드
        "user_no": user_no,
        "exec_no": exec_no,
        "seq_no": seq_no,
        "amo_regno": amo_regno,
        "amo_name": amo_name,
        "evid_cd": row.get("evid_cd") or "",
    }


def get_admin_summary() -> dict:
    """저탄마을 이장님 대시보드 1차 화면 요약.

    신 스키마 view 기반:
      - vw_jeotan_farmer_summary → diaries_by_farmer + totals
      - vw_jeotan_journal_evidence (LIMIT 5) → recent_diaries
      - evidence 테이블 직접 조회 (LIMIT 5) → recent_evidence
      - latest_work_date 는 journal MAX(job_date) 별도 조회
      - evidence_by_status 는 raw_json.$.status 기반 (INSERT 가 채우는 경우만 표시)
    """
    farmer_rows = views_repo.fetch_farmer_summary()
    latest_dates = views_repo.fetch_latest_work_dates()
    evidence_by_status = views_repo.fetch_evidence_status_counts()
    recent_journal_rows = views_repo.fetch_journal_evidence(limit=5)
    recent_evidence_rows = views_repo.fetch_recent_evidence(limit=5)

    diaries_by_farmer: list[dict] = []
    total_diaries = 0
    total_evidence = 0
    total_farmers = 0

    for row in farmer_rows:
        item = _farmer_summary_row_to_dict(row)
        amo = item["amo_regno"]
        if amo and amo in latest_dates:
            item["latest_work_date"] = latest_dates[amo]
        diaries_by_farmer.append(item)
        total_diaries += item["diary_count"]
        total_evidence += item["evidence_count"]
        if item["diary_count"] > 0 or item["evidence_count"] > 0:
            total_farmers += 1

    diaries_by_farmer.sort(
        key=lambda x: (x["diary_count"], x["evidence_count"]),
        reverse=True,
    )

    recent_diaries = [_journal_evidence_row_to_diary(r) for r in recent_journal_rows]
    recent_evidence = [_evidence_row_to_dict(r) for r in recent_evidence_rows]

    return {
        "total_diaries": total_diaries,
        "total_evidence": total_evidence,
        "total_farmers": total_farmers,
        "diaries_by_farmer": diaries_by_farmer,
        "evidence_by_status": evidence_by_status,
        "recent_diaries": recent_diaries,
        "recent_evidence": recent_evidence,
    }


# ============================================================
# /admin/todo-status  ← 이후 step 에서 view 로 마이그레이션 예정
# ============================================================

def get_admin_todo_status(
    *,
    farmer_id: str | None = None,
    group_no: int | None = None,
    prj_id: str | None = None,
    activity_id: str | None = None,
) -> dict:
    """이장님 대시보드 todo 표 데이터. 농가별 todo + 제출 증빙 매칭 + 누락 항목 계산.

    ``items[]`` 의 각 행은 한 todo 한 행 + 그 todo 에 매칭되는 evidence 의 종류 집합 +
    누락된 evidence 종류. ``applied_filters`` 로 caller 의 필터가 반영됐는지 응답에 echo.
    """
    todos = list_today_todos(
        farmer_id=farmer_id,
        group_no=group_no,
        prj_id=prj_id,
        activity_id=activity_id,
    )
    try:
        evidence = _legacy_list_evidence()
    except Exception:
        # 신 스키마 전환 도중에는 evidence 레거시 호출이 실패할 수 있음 — 빈 배열로 안전 폴백.
        evidence = []

    items: list[dict] = []
    for todo in todos:
        # evidence 매칭은 todo 의 amo_regno 와 evidence 의 farmer_id(=amo_regno) 를 일치시켜
        # 농가가 다른 todo 에 다른 농가 evidence 가 잡히지 않게 한다.
        # evidence_rdb._row_to_record 가 "farmer_id": amo_regno 로 채워주므로 record_amo_regno
        # 인자로 그대로 전달.
        linked_evidence = [
            ev
            for ev in evidence
            if _is_same_todo_context(
                todo=todo,
                farmer_id=farmer_id,
                record_todo_id=getattr(ev, "todo_id", None),
                record_farmer_id=getattr(ev, "farmer_id", None),
                record_amo_regno=getattr(ev, "farmer_id", None),
                record_prj_id=getattr(ev, "prj_id", None),
                record_project_id=getattr(ev, "project_id", None),
                record_activity_id=getattr(ev, "activity_id", None),
                record_job_cd=getattr(ev, "job_cd", None),
            )
        ]
        submitted_evidence_types = sorted(
            {
                item.evidence_type
                for item in linked_evidence
                if getattr(item, "evidence_type", None)
            }
        )
        required_evidence_types = list(
            todo.required_evidence_types or get_required_evidence_types(todo.activity_name or "")
        )
        missing_evidence_types = [code for code in required_evidence_types if code not in submitted_evidence_types]

        # 카드/표가 농가별로 분리되도록 todo 의 amo_regno / amo_name 을 우선 채움.
        # filter 로 들어온 farmer_id 가 있고 todo 에 amo_regno 가 없을 때만 filter 값을 echo.
        row_farmer_id = (todo.amo_regno or farmer_id or "").strip()
        row_farmer_name = (todo.amo_name or todo.user_name or "").strip()

        items.append(
            {
                "farmer_id": row_farmer_id,
                "farmer_name": row_farmer_name,
                "todo_id": todo.todo_id,
                "todo_title": todo.todo_title,
                "group_no": todo.group_no,
                "prj_id": todo.prj_id,
                # project_id는 프론트 호환용 alias이며 현재는 prj_id와 동일값입니다.
                "project_id": todo.project_id or todo.prj_id,
                "activity_id": todo.activity_id,
                "job_cd": todo.job_cd,
                "activity_name": todo.activity_name,
                "job_name": todo.job_name,
                "required_evidence_types": required_evidence_types,
                "submitted_evidence_types": submitted_evidence_types,
                "missing_evidence_types": missing_evidence_types,
                "computed_status": todo.computed_status or todo.status,
                "due_date": todo.due_date.isoformat() if todo.due_date else None,
            }
        )

    return {
        "items": items,
        "applied_filters": {
            "farmer_id": farmer_id,
            "group_no": group_no,
            "prj_id": prj_id,
            "activity_id": activity_id,
        },
    }


# 일부 import 가 unused 처럼 보이지 않게 — 다음 step 에서 사용 예정.
_ = _legacy_list_diaries


# ============================================================
# 이장님 soft delete — 잘못 기록된 일지/사진 숨김
# ============================================================
#
# 이장님이 마을 농가의 기록을 검토하다 "잘못 작성됨 / 잘못 찍힘" 으로 판단하면
# 삭제 버튼을 누름. DB row 는 남기고 deleted_dt 만 세팅 → 운영자가 복구 가능.
# S3 사진 파일은 그대로 유지 — 별도 cleanup job 으로 정리 예정.


def delete_diary(diary_id: str) -> dict:
    """일지 단건 soft delete. 매칭 row 가 없으면 404 의미로 found=False 반환.

    삭제 성공 시 해당 농가에게 친숙한 톤의 알림 1건 자동 INSERT.
    """
    # 삭제 전에 farmer_id / work_date 확보 — soft_delete 는 영향 row 수만 반환하므로.
    pre = _fetch_diary_meta_for_notify(diary_id)
    deleted = soft_delete_diary_mysql(diary_id)
    if deleted and pre:
        _try_notify_record_deleted(
            kind="diary",
            farmer_id=pre.get("farmer_id", ""),
            date_str=pre.get("work_date", ""),
        )
    return {"diary_id": diary_id, "deleted": deleted}


def delete_evidence(evidence_id: str) -> dict:
    """증빙 단건 soft delete. 매칭 row 가 없으면 found=False 반환.

    삭제 성공 시 해당 농가에게 친숙한 톤의 알림 1건 자동 INSERT.
    """
    pre = _fetch_evidence_meta_for_notify(evidence_id)
    deleted = soft_delete_evidence_mysql(evidence_id)
    if deleted and pre:
        _try_notify_record_deleted(
            kind="evidence",
            farmer_id=pre.get("farmer_id", ""),
            date_str=pre.get("captured_at", ""),
        )
    return {"evidence_id": evidence_id, "deleted": deleted}


# ---------- helpers for delete-time notification ----------

def _fetch_diary_meta_for_notify(diary_id: str) -> dict[str, Any] | None:
    """diary_id 로 farmer_id (amo_regno) + work_date 추출. 실패 시 None."""
    try:
        # diary_id 형식: "{user_no}-{YYYYMMDD}-{exec_no}" — 첫 1~2 segment 가 row 식별.
        from locaville.dbcom import fetch_one
        parts = (diary_id or "").split("-")
        if len(parts) < 2:
            return None
        user_no = int(parts[0])
        job_date_raw = parts[1]
        # job_date 가 YYYYMMDD 인 경우 date 객체로
        from datetime import datetime as _dt
        job_date = _dt.strptime(job_date_raw, "%Y%m%d").date() if len(job_date_raw) == 8 else None
        row = fetch_one(
            """
            SELECT j.user_no, j.job_date, f.amo_regno
            FROM journal j
            LEFT JOIN farmer f ON f.user_no = j.user_no
            WHERE j.user_no = %s AND j.job_date = %s
            LIMIT 1
            """,
            [user_no, job_date],
        )
        if not row:
            return None
        return {
            "farmer_id": str(row.get("amo_regno") or ""),
            "work_date": str(row.get("job_date") or ""),
        }
    except Exception:  # noqa: BLE001
        return None


def _fetch_evidence_meta_for_notify(evidence_id: str) -> dict[str, Any] | None:
    """evidence_id 로 farmer_id + capture 일자 추출. 실패 시 None."""
    try:
        from locaville.dbcom import fetch_one
        parts = (evidence_id or "").split("-")
        if len(parts) < 2:
            return None
        user_no = int(parts[0])
        job_date_raw = parts[1]
        from datetime import datetime as _dt
        job_date = _dt.strptime(job_date_raw, "%Y%m%d").date() if len(job_date_raw) == 8 else None
        row = fetch_one(
            """
            SELECT e.user_no, e.job_date, e.capture_dt, f.amo_regno
            FROM evidence e
            LEFT JOIN farmer f ON f.user_no = e.user_no
            WHERE e.user_no = %s AND e.job_date = %s
            LIMIT 1
            """,
            [user_no, job_date],
        )
        if not row:
            return None
        capture = row.get("capture_dt") or row.get("job_date")
        return {
            "farmer_id": str(row.get("amo_regno") or ""),
            "captured_at": capture.isoformat() if hasattr(capture, "isoformat") else str(capture or ""),
        }
    except Exception:  # noqa: BLE001
        return None


def _try_notify_record_deleted(*, kind: str, farmer_id: str, date_str: str) -> None:
    """이장님이 일지/증빙을 정리(삭제)했을 때 농가에게 알림 1건.
    실패는 swallow — 삭제 자체는 성공해야 하므로."""
    if not farmer_id:
        return
    try:
        from app.repositories.identity_rdb import resolve_user_no
        from app.repositories.notification_rdb import insert_notification

        user_no = resolve_user_no(farmer_id)
        if user_no is None:
            return

        # 날짜 짧게 표시 ("6월 1일")
        nice_date = _format_korean_short_date(date_str)
        when = f"{nice_date} " if nice_date else ""

        # content_cd 는 VARCHAR(8) 이라 짧게.
        if kind == "diary":
            title = "일지 한 건이 정리됐어요"
            body = f"이장님이 {when}일지를 지웠어요. 혹시 잘못 적었다면 다시 적어 올려 주세요."
            content_cd = "DIA_DEL"
            action_url = "/journal"
        else:
            title = "사진 한 장이 정리됐어요"
            body = f"이장님이 {when}사진을 지웠어요. 필요하면 다시 한 장 찍어 올려 주세요."
            content_cd = "EVID_DEL"
            action_url = "/evidence"

        insert_notification(
            user_no=user_no,
            sender_cd="C",  # Chief
            content_cd=content_cd,
            title=title,
            content=body,
            action_url=action_url,
            related_no=None,
            reg_no=None,
        )
    except Exception:  # noqa: BLE001
        pass


def _format_korean_short_date(value: str) -> str:
    """'2026-06-01' 또는 '20260601' 등 → '6월 1일'. 실패 시 빈 문자열."""
    if not value:
        return ""
    try:
        from datetime import datetime as _dt
        text = str(value).strip()
        # ISO 'YYYY-MM-DD' 또는 datetime ISO
        candidate = text.split("T")[0].split(" ")[0]
        if len(candidate) == 10 and candidate[4] == "-":
            d = _dt.strptime(candidate, "%Y-%m-%d").date()
        elif len(candidate) == 8 and candidate.isdigit():
            d = _dt.strptime(candidate, "%Y%m%d").date()
        else:
            return ""
        return f"{d.month}월 {d.day}일"
    except Exception:  # noqa: BLE001
        return ""


# ============================================================
# 사이드바 "새 항목" 배지 — 이장님이 마지막 방문 이후 등록된 건수
# ============================================================

def _parse_since(value: str | None) -> datetime | None:
    """ISO 8601 문자열을 datetime 으로 파싱. tz/Z 가 붙어도 처리."""
    if not value:
        return None
    text = value.strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    # DB 컬럼이 naive 라 비교 안정성을 위해 tzinfo 제거.
    if parsed.tzinfo is not None:
        parsed = parsed.replace(tzinfo=None)
    return parsed


def get_new_counts(*, since_diary: str | None, since_evidence: str | None) -> dict:
    """사이드바 배지용 — since 시각 이후 등록된 일지/증빙 개수.

    각 since 가 다른 이유: 일지/증빙 각각 마지막 방문 시각이 다름.
    since 가 비면 해당 항목 count = 0 (배지 안 보임).
    """
    diary_count = count_diaries_since(_parse_since(since_diary))
    evidence_count = count_evidence_since(_parse_since(since_evidence))
    return {
        "diaries": diary_count,
        "evidence": evidence_count,
    }


# ============================================================
# /admin/recent-evidence  ← 마을 현황 갤러리 (워터마크 없는 원본)
# ============================================================

def get_recent_evidence(limit: int = 6) -> dict:
    """대시보드 갤러리 — 최근 등록된 증빙 사진 N장 (원본 경로).

    image_url 컬럼은 워터마크 적용본일 수 있어 raw_json.original_image_path 우선.
    fs 모드 path 는 frontend 가 `${API_BASE_URL}/${path}` 로 조립.
    """
    rows = fetch_recent_originals(limit=max(1, min(20, limit)))
    items: list[dict] = []
    for r in rows:
        items.append({
            "evidence_id": r["evidence_id"],
            "farmer_id": r["amo_regno"],
            "farmer_name": r["farmer_name"],
            "job_cd": r["job_cd"],
            "job_name": r.get("job_name") or "",
            "prj_id": r.get("prj_id") or "",
            "prj_name": r.get("prj_name") or "",
            "activity_id": r.get("activity_id") or "",
            "activity_name": r.get("activity_name") or "",
            "biz_name": r.get("biz_name") or "",
            "captured_at": _iso(r.get("reg_dt")),
            "image_path": r["original_path"],  # http:// 절대 URL 또는 'uploads/...' 상대 경로
            "needs_chief_verification": bool(r.get("needs_chief_verification") or False),
            "todo_match_reason": r.get("todo_match_reason") or "",
            "receipt_ocr": r.get("receipt_ocr") or {},
        })
    return {"items": items}


# ============================================================
# /admin/laggard-farmers  ← 최근 7일 미이행 todo top N
# ============================================================

def _is_unfulfilled(item: dict) -> bool:
    """todo 1건이 '미이행' 상태인지 판정.

    rule:
      - computed_status 가 '완료' / 'done' / 'completed' 가 아님, OR
      - missing_evidence_types 가 1개 이상 (사진/문서 빠짐).
    """
    status = (item.get("computed_status") or "").strip().lower()
    done_labels = {"완료", "done", "completed", "finished"}
    if status not in done_labels:
        return True
    if (item.get("missing_evidence_types") or []):
        return True
    return False


def get_laggard_farmers(*, days: int = 7, top_n: int = 5) -> dict:
    """최근 N일 안에 마감(또는 마감 임박) 인 todo 중 미이행이 많은 농가 top N.

    days 가 0/None 이면 전체 todo 대상.
    """
    snap = get_admin_todo_status()
    items = snap.get("items") or []
    today = date.today()
    cutoff_low = today.toordinal() - max(0, days)
    cutoff_high = today.toordinal() + max(0, days)

    by_farmer: dict[str, dict[str, Any]] = {}
    for it in items:
        if not _is_unfulfilled(it):
            continue
        # due_date 7일 윈도우 필터 (앞으로 7일 / 지난 7일 둘 다 포함).
        if days:
            due_str = it.get("due_date")
            if due_str:
                try:
                    d = date.fromisoformat(due_str[:10])
                    if not (cutoff_low <= d.toordinal() <= cutoff_high):
                        continue
                except ValueError:
                    pass  # 파싱 실패는 통과 — over-filter 보다 over-include.

        fid = (it.get("farmer_id") or "").strip()
        if not fid:
            continue
        slot = by_farmer.setdefault(fid, {
            "farmer_id": fid,
            "farmer_name": (it.get("farmer_name") or "").strip(),
            "unfulfilled_count": 0,
            "sample_todos": [],
        })
        slot["unfulfilled_count"] += 1
        if len(slot["sample_todos"]) < 3:
            slot["sample_todos"].append({
                "todo_id": it.get("todo_id"),
                "todo_title": it.get("todo_title") or it.get("activity_name"),
                "due_date": it.get("due_date"),
            })

    ranked = sorted(by_farmer.values(), key=lambda x: -x["unfulfilled_count"])
    return {
        "window_days": days,
        "items": ranked[:max(1, top_n)],
    }


# ============================================================
# /admin/laggard-farmers/{farmer_id}/notify  ← notification INSERT
# ============================================================

class NotifyTargetNotFound(RuntimeError):
    """알림 대상 farmer 의 user_no 를 찾지 못함 → 404."""


def _resolve_user_no_by_amo(amo_regno: str) -> int | None:
    from locaville.dbcom import fetch_all
    rows = fetch_all(
        "SELECT user_no FROM farmer WHERE amo_regno = %s LIMIT 1",
        [str(amo_regno).strip()],
    )
    return int(rows[0]["user_no"]) if rows else None


def send_laggard_notification(
    *,
    farmer_id: str,
    title: str | None = None,
    message: str | None = None,
    sender_user_no: int | None = None,
) -> dict:
    """누락 농가에게 manual 알림 1건 INSERT.

    notification 테이블 (DBA 신설) 에 row 추가. action_url 은 농가 앱 영농일지로.
    """
    user_no = _resolve_user_no_by_amo(farmer_id)
    if user_no is None:
        raise NotifyTargetNotFound(f"농가({farmer_id}) 의 user_no 를 찾을 수 없음")

    notice_no = insert_notification(
        user_no=user_no,
        sender_cd="C",          # Chief
        content_cd="MANUAL",    # 이장님이 직접 보낸 알림
        title=(title or "이장님이 활동 점검 안내를 보냈어요").strip()[:120],
        content=(message or "최근 7일간 미이행 항목이 있어요. 영농일지에서 확인 부탁드립니다.").strip()[:500],
        action_url="/diary",
        related_no=None,
        reg_no=sender_user_no,
    )
    return {
        "notice_no": notice_no,
        "farmer_id": farmer_id,
        "user_no": user_no,
        "sent": True,
    }


# ============================================================
# /admin/ai-recommendation  ← 날씨+주간+todo 묶어 RAG 1-2줄 추천
# ============================================================

def get_ai_recommendation() -> dict:
    """대시보드 "오늘의 마을 소식" — 3-4줄 LLM 요약.

    날씨(주간 예보) + 농진청 주간정보 + 진행중 todo 묶어 3-4줄로 풀어 작성.
    줄마다 다른 측면 (이번주 날씨/농진청 주간 안내/마을 todo + 권장 조치).
    실패 시 fallback 다중 줄.

    2026-06: ``advice`` 테이블 캐시 우선 — 같은 날 두 번째 호출부터 즉시 응답.
    캐시 miss 시 기존 실시간 로직(RAG+LLM) 으로 생성 후 advice 테이블에 INSERT.
    """
    import os
    from datetime import date as _date

    from app.repositories import advice_rdb
    from app.services.admin_weather_service import get_admin_agri_weather
    from app.services.farm_info_service import get_weekly_farm_info
    from app.services.ai_service import chat_with_rag, AIServiceError

    # 1) 캐시 hit — 같은 날 두 번째 호출부터 즉시.
    chief_user_no = int(os.getenv("DEFAULT_CHIEF_USER_NO", "10000001"))
    today = _date.today()
    try:
        cached = advice_rdb.get_today_advice(
            user_no=chief_user_no, advice_date=today, ville_chief=True,
        )
        if cached and cached.get("content"):
            rationale = cached.get("rationale") or {}
            return {
                "recommendation": cached["content"],
                "sample_evidence": rationale.get("sample_evidence") or [],
                "context": {
                    "rain_days": rationale.get("rain_days") or [],
                    "upcoming_todos": rationale.get("upcoming_todos") or [],
                },
            }
    except Exception:  # noqa: BLE001
        pass  # 캐시 실패는 무시하고 실시간 생성으로 폴백

    weather = get_admin_agri_weather()
    weekly = get_weekly_farm_info()
    todo_snap = get_admin_todo_status()

    # 미이행 todo 상위 3개만 prompt 에 노출 (token 절약).
    upcoming = [it for it in (todo_snap.get("items") or []) if _is_unfulfilled(it)][:3]

    # 주간 예보를 짧게 요약 (월~일 / 강수 또는 기온 강조).
    weekly_fc = weather.get("weeklyForecast") or []
    rain_days = [d.get("day_of_week") for d in weekly_fc if (d.get("pop_max") or 0) >= 60]

    context_lines = [
        f"이번주 강수 확률 60% 이상인 날: {', '.join(rain_days) if rain_days else '없음'}",
        f"농진청 주간정보 요약: {(weekly.get('summary') or weekly.get('description') or '')[:200]}",
        "진행중 미이행 todo: " + ", ".join(
            f"{it.get('farmer_name','')}({it.get('todo_title') or it.get('activity_name')})"
            for it in upcoming
        ) if upcoming else "진행중 미이행 todo: 없음",
    ]
    prompt = (
        "당신은 마을 이장님을 돕는 영농 비서입니다. 아래 이번주 마을 상황을 보고, "
        "이장님께 '오늘의 마을 소식' 안내를 한국어로 자연스럽게 3-4줄 작성하세요.\n"
        "각 줄은 서로 다른 측면을 다루세요:\n"
        "  · 1줄: 이번 주 날씨 (강수/기온) 요약 + 농작업 관점 시사점\n"
        "  · 2줄: 농진청 주간 안내 핵심 요지 (있으면)\n"
        "  · 3줄: 마을 미이행 todo 중 가장 챙길 것 + 권장 조치\n"
        "  · 4줄(선택): 이장님께 한 마디 격려/주의\n"
        "각 줄은 '\\n' 으로 구분. 머리말·마크다운·번호 매기기 금지. 60대 농민도 알기 쉬운 자연스러운 한국어.\n\n"
        + "\n".join(f"- {line}" for line in context_lines)
    )

    # 샘플 사진 — 가장 최근 evidence 1장.
    samples = (get_recent_evidence(limit=2).get("items") or [])

    try:
        ai = chat_with_rag(question=prompt, farmer_id="", context={}, messages=None)
        text = (getattr(ai, "answer", None) or "").strip()
    except AIServiceError:
        text = ""
    except Exception:
        text = ""

    if not text:
        text = (
            "이번 주 날씨와 일정을 한 번 살펴보세요.\n"
            "농진청 주간 안내도 확인하면 좋아요.\n"
            "마을에서 미이행 활동이 있다면 농가에 알림을 보내 챙겨주세요."
        )

    result = {
        "recommendation": text,
        "sample_evidence": samples,
        "context": {
            "rain_days": rain_days,
            "upcoming_todos": upcoming,
        },
    }

    # 캐시 INSERT — 다음 호출은 즉시 SELECT 응답. 실패해도 응답은 정상 반환.
    try:
        advice_rdb.upsert_advice(
            user_no=chief_user_no,
            advice_date=today,
            content=text,
            rationale={
                "sample_evidence": samples,
                "rain_days": rain_days,
                "upcoming_todos": upcoming,
                "gen_cd": "LLM",
                "source": "admin_ai_recommendation_v1",
            },
            action_url=None,
            ville_chief=True,
        )
    except Exception:  # noqa: BLE001
        pass

    return result


# ============================================================
# /admin/projects/{prj_id}/members  ← 사업 참여 농가 (전화 포함)
# /admin/village-groups/{group_no}/members  ← 마을 단체 멤버
# ============================================================

def _mask_phone(phone: str | None) -> str:
    """전화번호 중간 4자리 마스킹. 형식이 어긋나면 그대로 반환.

    예: "010-1234-5678" → "010-****-5678"
        "01012345678"   → "010****5678"
    """
    if not phone:
        return ""
    raw = phone.strip()
    if not raw:
        return ""
    if "-" in raw:
        parts = raw.split("-")
        if len(parts) >= 3:
            parts[1] = "*" * len(parts[1])
            return "-".join(parts)
        return raw
    digits = raw
    if len(digits) >= 8:
        return digits[:3] + "*" * (len(digits) - 7) + digits[-4:]
    return raw


def get_project_members(prj_id: str) -> dict:
    """사업 참여 농가 목록 — act_grp 기준. ProgramsScreen detail 의 members 영역에 매핑.

    각 item 의 필드:
      farmer_id (=amo_regno), amo_regno, farmer_name (=amo_name 폴백 user_name),
      user_no, user_name, phone, phone_masked, group_no, group_name, is_leader.

    is_leader 는 ville_group.chief_no == amo_family.chief_no 일치 여부.
    여러 단체에 동시 등록된 농가는 첫 번째 단체만 노출 (act_grp DISTINCT).
    """
    rows = views_repo.fetch_project_members(prj_id)
    items: list[dict] = []
    for r in rows:
        amo_regno = str(r.get("amo_regno") or "").strip()
        if not amo_regno:
            continue
        amo_name = (r.get("amo_name") or "").strip()
        user_name = (r.get("user_name") or "").strip()
        phone = r.get("phone_no") or ""
        items.append({
            "farmer_id": amo_regno,
            "amo_regno": amo_regno,
            "farmer_name": amo_name or user_name or amo_regno,
            "user_no": r.get("user_no"),
            "user_name": user_name,
            "phone": phone,
            "phone_masked": _mask_phone(phone),
            "group_no": r.get("group_no"),
            "group_name": r.get("group_name") or "",
            "is_leader": False,  # 사업 단위에는 별도 리더 개념 없음 — 단체 리더는 group endpoint 에서.
        })
    return {"items": items}


def get_village_group_members(group_no: int) -> dict:
    """마을 단체 멤버 목록 — group_member.active_yn='Y' 기준.

    각 item 의 필드:
      farmer_id (=amo_regno), amo_regno, farmer_name, user_no, user_name,
      phone, phone_masked, is_leader (단체장 여부).
    """
    rows = views_repo.fetch_village_group_members(group_no)
    items: list[dict] = []
    for r in rows:
        amo_regno = str(r.get("amo_regno") or "").strip()
        if not amo_regno:
            continue
        amo_name = (r.get("amo_name") or "").strip()
        user_name = (r.get("user_name") or "").strip()
        phone = r.get("phone_no") or ""
        items.append({
            "farmer_id": amo_regno,
            "amo_regno": amo_regno,
            "farmer_name": amo_name or user_name or amo_regno,
            "user_no": r.get("user_no"),
            "user_name": user_name,
            "phone": phone,
            "phone_masked": _mask_phone(phone),
            "is_leader": str(r.get("is_leader") or "").upper() == "Y",
        })
    return {"items": items}
