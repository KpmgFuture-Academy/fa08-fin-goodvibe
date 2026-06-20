"""영농일지(diary) API Pydantic 모델.

화면(v0_farmer/v0_chief)과 백엔드 사이의 JSON 계약을 정의합니다.
신 스키마에서는 다음과 같이 매핑됩니다:

  - ``farmer_id``: ``user_master.login_id`` / ``farmer_no`` / ``user_no`` / ``amo_regno``
    어느 값이든 backend 가 ``user_no`` 와 ``amo_regno`` 로 해석합니다.
  - ``diary_id``: 신 ID 포맷 ``{user_no}-{yyyymmdd}-{exec_no}``
  - ``parcel_no``: ``parcel.parcel_no`` (INT) 또는 ``parcel.parcel_regno`` (사람 코드)
    어느 형태로 보내도 backend 가 INT 로 정규화해서 저장합니다.
"""
from __future__ import annotations

from datetime import date, datetime
from uuid import uuid4

from pydantic import BaseModel, Field


class DiaryBase(BaseModel):
    """일지 생성·조회 공통 필드.

    Required 필드: ``farmer_id``, ``worker_name``, ``work_date``, ``field_id``,
    ``crop_name``, ``work_stage``, ``work_detail``.
    나머지는 옵션이며 빈 문자열 / None 폴백을 가집니다.
    """
    todo_id: str = Field(default="")
    project_id: str = Field(default="")
    prj_id: str = Field(default="")
    group_no: int | None = None
    # 일지가 어느 단체 활동인지 (ville_group.group_name). schema 변경 없는 derive.
    # backend 가 prj_journal.group_no → ville_group JOIN 으로 채움.
    group_name: str = Field(default="")
    # farmer_id 가 비어 있으면 422 로 거절 (silent fallback 금지).
    farmer_id: str = Field(..., min_length=1)
    farmer_name: str = Field(default="")
    worker_name: str
    work_date: date
    field_id: str
    parcel_no: str = Field(default="")
    field_address: str = Field(default="")
    crop_name: str
    activity_id: str = Field(default="")
    job_cd: str = Field(default="")
    work_stage: str
    work_stage_detail: str = Field(default="")
    work_detail: str
    linked_evidence_ids: list[str] = Field(default_factory=list)
    status: str = Field(default="saved")
    input_type_cd: str = Field(default="")
    # ── STT 학습용 메타 (raw_json 에 보존) ─────────────────────────
    # voice_text: Returnzero/Whisper 가 인식한 원본 텍스트(사용자 검증 전).
    # voice_audio_url: (선택) Supabase Storage 에 보관된 음성 파일 URL.
    # voice_predicted_job_cd: 유사도 매칭이 추천한 job_cd. 사용자가 그대로 두면 "동의" → 학습 데이터.
    voice_text: str = Field(default="")
    voice_audio_url: str = Field(default="")
    voice_predicted_job_cd: str = Field(default="")


class DiaryCreate(DiaryBase):
    """``POST /diary`` 요청 body. diary_id 는 옵션이며 없으면 backend 가 합성."""
    diary_id: str | None = None


class DiaryRecord(DiaryBase):
    """``GET /diary`` 응답 항목. diary_id / created_at / updated_at 이 필수."""
    # 신 ID 포맷이 표준이지만, JSON 모드 호환을 위해 default factory 유지.
    diary_id: str = Field(default_factory=lambda: f"diary_{uuid4().hex}")
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)


class DiaryListResponse(BaseModel):
    """``GET /diary`` 응답 wrapper. items 는 0개 이상."""
    items: list[DiaryRecord]
