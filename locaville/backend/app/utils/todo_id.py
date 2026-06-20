from __future__ import annotations

# todo_id 생성 규칙의 유일한 출처(single source of truth)입니다.
#
# 신 스키마 (prj_todo_list) 의 PK 는
#   (group_no, amo_regno, prj_id, activity_id, job_seq)
# 입니다. todo_id 는 이중 사람이 읽기 좋은 형식으로 합성됩니다.
#
# 새 형식: {amo_regno}-{prj_id}-{activity_id}-{job_seq}
#   예) AMOJT002-PRJ2026LC-ACT_WATER-1
#
# (구) 형식: {group_no}-{prj_id}-{activity_id}-{job_cd}
#   - 새 스키마에서는 같은 (prj_id, activity_id, job_cd) 쌍이 한 농가 안에서
#     여러 job_seq 로 등장하지 않으므로 (cd → seq) 변경의 충돌 위험은 없습니다.
#   - 기존 저장된 todo_id 가 있는 환경에서는 호환을 위해 `build_todo_id_legacy()` 를
#     보조로 둡니다 (Step 3 이후 deprecate 예정).


def build_todo_id(
    amo_regno: str | None,
    prj_id: str | None,
    activity_id: str | None,
    job_seq: int | str | None,
) -> str:
    """신 스키마 todo_id 합성.

    형식: {amo_regno}-{prj_id}-{activity_id}-{job_seq}
    None / 빈 값은 빈 문자열로 처리합니다. 구분자는 `-` 고정.
    """
    safe_amo = (amo_regno or "").strip()
    safe_prj = (prj_id or "").strip()
    safe_activity = (activity_id or "").strip()
    safe_seq = str(job_seq) if job_seq is not None else ""
    return f"{safe_amo}-{safe_prj}-{safe_activity}-{safe_seq}"


def build_todo_id_legacy(
    group_no: int | str | None,
    prj_id: str | None,
    activity_id: str | None,
    job_cd: str | None,
) -> str:
    """(구) todo_id 합성 — 기존 코드 호환용. 새 코드에서는 build_todo_id() 사용.

    형식: {group_no}-{prj_id}-{activity_id}-{job_cd}
    """
    safe_group = str(group_no) if group_no is not None else ""
    safe_prj = (prj_id or "").strip()
    safe_activity = (activity_id or "").strip()
    safe_job = (job_cd or "").strip()
    return f"{safe_group}-{safe_prj}-{safe_activity}-{safe_job}"
