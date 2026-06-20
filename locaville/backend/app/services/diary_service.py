"""영농일지 서비스 레이어.

라우터(``/diary``)와 저장소 사이에서 `STORAGE_MODE` 분기, dict→Pydantic 변환,
필터 적용 등을 담당합니다. rdb 모드면 ``diary_rdb`` 가, 그 외는
JSON 파일(`diary_file`)이 사용됩니다. RDB 가 mysql/postgres 중 어느 것이냐는
``DB_SOURCE`` 가 결정하고, repository 는 `dbcom` 을 통해 추상화됩니다.
"""
from __future__ import annotations

import os
from datetime import datetime

from app.repositories.diary_rdb import (
    DiaryMySQLConflictError,
    _status_to_job_cmpl_yn,
    create_diary_mysql,
    get_diary_by_id_mysql,
    list_diaries_mysql,
)
from app.repositories.diary_file import get_diary, list_diaries, save_diary
from app.schemas.diary import DiaryCreate, DiaryRecord


class DiaryRepositoryError(Exception):
    """저장소 호출 실패를 라우터까지 전달하기 위한 통합 예외."""


def _storage_mode() -> str:
    """저장소 모드 (rdb/json). 옛 ``DATA_SOURCE=mysql|postgres`` 도 'rdb' 로 매핑."""
    mode = os.getenv("STORAGE_MODE", "").strip().lower()
    if mode:
        return mode
    legacy = os.getenv("DATA_SOURCE", "json").strip().lower()
    return "rdb" if legacy in ("mysql", "postgres", "rdb") else legacy


def _to_record(raw: dict) -> DiaryRecord | None:
    """저장소 dict 를 ``DiaryRecord`` Pydantic 으로 변환. 검증 실패 시 None."""
    try:
        return DiaryRecord.model_validate(raw)
    except Exception:
        return None


def _list_raw_diaries(
    *,
    farmer_id: str | None = None,
    status: str | None = None,
    work_date: str | None = None,
    prj_id: str | None = None,
    project_id: str | None = None,
    activity_id: str | None = None,
    job_cd: str | None = None,
    group_no: int | None = None,
    parcel_no: str | None = None,
    field_id: str | None = None,
    limit: int = 100,
) -> list[dict]:
    """저장소 모드 분기 후 일지 dict 목록을 가져옴. rdb 는 view 기반 (vw_jeotan_journal_evidence)."""
    if _storage_mode() == "rdb":
        return list_diaries_mysql(
            farmer_id=farmer_id,
            status=status,
            work_date=work_date,
            prj_id=prj_id,
            project_id=project_id,
            activity_id=activity_id,
            job_cd=job_cd,
            group_no=group_no,
            parcel_no=parcel_no,
            field_id=field_id,
            limit=limit,
        )
    return list_diaries()


def _get_raw_diary(diary_id: str) -> dict | None:
    """저장소 모드 분기 후 일지 한 건 (dict)."""
    if _storage_mode() == "rdb":
        return get_diary_by_id_mysql(diary_id)
    return get_diary(diary_id)


def list_diary_records(limit: int = 100) -> list[DiaryRecord]:
    """무필터 일지 목록. updated_at / created_at / work_date 역순으로 최대 limit 개."""
    records: list[DiaryRecord] = []
    try:
        for raw in _list_raw_diaries(limit=limit):
            if isinstance(raw, dict):
                record = _to_record(raw)
                if record:
                    records.append(record)
    except Exception as exc:  # noqa: BLE001
        raise DiaryRepositoryError("Failed to load diary records") from exc
    return sorted(records, key=lambda item: (item.updated_at, item.created_at, item.work_date), reverse=True)[: max(1, min(limit, 100))]


def list_diary_records_filtered(
    farmer_id: str | None = None,
    status: str | None = None,
    work_date: str | None = None,
    prj_id: str | None = None,
    project_id: str | None = None,
    activity_id: str | None = None,
    job_cd: str | None = None,
    group_no: int | None = None,
    parcel_no: str | None = None,
    field_id: str | None = None,
    limit: int = 100,
) -> list[DiaryRecord]:
    """``GET /diary?...`` 쿼리 필터 종합. mysql 은 SQL WHERE 로, json 은 Python 필터.

    여러 필터가 동시에 들어오면 AND 조건. parcel_no 와 field_id 는 같은 의미.
    """
    safe_limit = max(1, min(limit, 100))
    if _storage_mode() == "rdb":
        records: list[DiaryRecord] = []
        try:
            for raw in _list_raw_diaries(
                farmer_id=farmer_id,
                status=status,
                work_date=work_date,
                prj_id=prj_id,
                project_id=project_id,
                activity_id=activity_id,
                job_cd=job_cd,
                group_no=group_no,
                parcel_no=parcel_no,
                field_id=field_id,
                limit=safe_limit,
            ):
                if isinstance(raw, dict):
                    record = _to_record(raw)
                    if record:
                        records.append(record)
        except Exception as exc:  # noqa: BLE001
            raise DiaryRepositoryError("Failed to load diary records") from exc
        return records

    records = list_diary_records(limit=safe_limit)
    if farmer_id is not None:
        records = [record for record in records if record.farmer_id == farmer_id]
    if status is not None:
        status_flag = _status_to_job_cmpl_yn(status)
        records = [
            record
            for record in records
            if _status_to_job_cmpl_yn(record.status) == status_flag
        ]
    if work_date is not None:
        records = [record for record in records if record.work_date.isoformat() == work_date]
    effective_prj_id = prj_id if prj_id is not None else project_id
    if effective_prj_id is not None:
        records = [record for record in records if (record.prj_id or record.project_id) == effective_prj_id]
    if project_id is not None:
        records = [record for record in records if record.project_id == project_id]
    if activity_id is not None:
        records = [record for record in records if record.activity_id == activity_id]
    if job_cd is not None:
        records = [record for record in records if record.job_cd == job_cd]
    if group_no is not None:
        records = [record for record in records if record.group_no == group_no]
    effective_parcel_no = parcel_no if parcel_no is not None else field_id
    if effective_parcel_no is not None:
        records = [
            record
            for record in records
            if (record.parcel_no or record.field_id) == effective_parcel_no
        ]
    return records[:safe_limit]


def get_diary_record(diary_id: str) -> DiaryRecord | None:
    """diary_id 단건 조회. 형식 불일치/매칭 없음 → None (라우터가 404 매핑)."""
    try:
        raw = _get_raw_diary(diary_id)
        return _to_record(raw) if raw else None
    except Exception as exc:  # noqa: BLE001
        raise DiaryRepositoryError("Failed to load the diary record") from exc


def _reschedule_after_anchor(record: DiaryRecord) -> None:
    """anchor 타입 작업(예: 모내기 R0005) 일지 저장 시, 같은 농가·같은 사업의
    후속 after 타입 todo 들의 est_*_date 를 농가 실제 작업일 기준으로 갱신.

    조용히 실패 — 일정 갱신은 부가 기능이라 일지 저장 자체를 깨면 안 됨.
    """
    try:
        from app.services.job_schedule import JOB_SCHEDULE, shift_after_anchor
        from app.repositories.identity_rdb import resolve_amo_regno
        from locaville.dbcom import execute

        rule = JOB_SCHEDULE.get(record.job_cd or "")
        if not rule or rule.get("type") != "anchor":
            return
        after_jobs = [
            cd for cd, r in JOB_SCHEDULE.items()
            if r.get("type") == "after" and r.get("of") == record.job_cd
        ]
        if not after_jobs:
            return
        amo_regno = resolve_amo_regno(record.farmer_id)
        prj_id = (record.prj_id or "").strip()
        if not amo_regno or not prj_id:
            return

        for job_cd in after_jobs:
            shifted = shift_after_anchor(job_cd, record.work_date)
            if not shifted:
                continue
            new_start, new_end = shifted
            execute(
                """
                UPDATE prj_todo_list
                   SET est_start_date = %s,
                       est_end_date = %s,
                       mod_dt = NOW()
                 WHERE amo_regno = %s
                   AND prj_id = %s
                   AND job_cd = %s
                """,
                [new_start, new_end, amo_regno, prj_id, job_cd],
            )
    except Exception:  # noqa: BLE001
        # 일정 재계산 실패는 일지 저장에 영향 X. 로그만 (운영 단계에서 추가).
        pass


def create_diary_record(payload: DiaryCreate) -> DiaryRecord:
    """일지 한 건 저장. mysql 모드는 journal + (사업이면) prj_journal 동반 INSERT.

    중복 키 충돌 시 ``DiaryMySQLConflictError`` 가 그대로 라우터까지 전파되어
    409 로 응답되도록 합니다.

    저장 후 anchor 타입 작업이면 후속 todo 의 est_*_date 를 자동 갱신
    (예: 모내기 → 중간물떼기/논물빼기/수확 일정이 농가 실제 모내기일 기준으로 재배치).
    """
    now = datetime.now()
    data = payload.model_dump(exclude={"diary_id"})
    if payload.diary_id:
        data["diary_id"] = payload.diary_id
    record = DiaryRecord(
        **data,
        created_at=now,
        updated_at=now,
    )
    try:
        if _storage_mode() == "rdb":
            saved = create_diary_mysql(record.model_dump(mode="json"))
        else:
            saved = save_diary(record.model_dump(mode="json"))
        saved_record = DiaryRecord.model_validate(saved)
        # anchor 일지면 후속 todo 일정 갱신.
        _reschedule_after_anchor(saved_record)
        return saved_record
    except DiaryMySQLConflictError:
        raise
    except Exception as exc:  # noqa: BLE001
        raise DiaryRepositoryError("Failed to create diary record") from exc
