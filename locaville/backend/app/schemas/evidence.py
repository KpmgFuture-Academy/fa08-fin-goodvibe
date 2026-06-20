"""증빙(evidence) API Pydantic 모델.

신 스키마 매핑:
  - ``evidence_id``: ``{user_no}-{yyyymmdd}-{exec_no}-{seq_no}`` (4-part)
  - ``parcel_no``: INT 또는 parcel_regno 어느 형태든 허용
  - ``evidence_type``: 화면에서 사용하는 의미 코드 (MID_DRAINAGE_START 등) —
    backend 가 ``raw_json`` 에 보존하고 ``evid_cd`` 는 카테고리 코드(PIC1/RCT5 등)로 매핑
  - ``status``: ``raw_json.$.status`` 에 보관. PATCH 후 검토 상태 (needs_review/confirmed 등)
"""
from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, Field


class EvidenceBase(BaseModel):
    """증빙 생성·조회 공통 필드.

    Required 필드: ``farmer_id``, ``activity_type``, ``evidence_type``, ``captured_at``.
    parent journal 은 같은 (user_no, job_date, exec_no) 의 journal 행. 없으면 backend 가
    placeholder journal 을 자동 생성.
    """
    todo_id: str = Field(default="")
    group_no: int | None = None
    prj_id: str = Field(default="")
    project_id: str = Field(default="")
    activity_id: str = Field(default="")
    job_cd: str = Field(default="")
    farmer_id: str = Field(..., min_length=1)
    parcel_no: str = Field(default="")
    # field_id 는 옛 호환용 별칭이며 backend 는 parcel_no / parcel_regno 둘 다 받음.
    # 추후 PARCEL.parcel_no INT 중심으로 정리 예정.
    field_id: str = Field(default="")
    activity_type: str
    evidence_type: str
    confirmed_label: str = Field(default="")
    image_url: str = Field(default="")
    storage_path: str = Field(default="")
    original_image_path: str = Field(default="")
    captured_at: datetime
    status: str = Field(default="confirmed")
    user_message: str = Field(default="")

    # 사진 업로드 자동 분석 결과 (모두 optional, raw_json 에 보존됨).
    #   classification: "receipt" | "field_photo" | "unknown"
    #   image_quality : {engine, passed, blur_score, brightness, width, height, issues[]}
    #   receipt_ocr   : {vendor, amount, date, items[]}  — 영수증일 때만
    classification: str = Field(default="")
    image_quality: dict[str, Any] = Field(default_factory=dict)
    receipt_ocr: dict[str, Any] = Field(default_factory=dict)

    # 영수증 OCR → 활동 자동 추천 (rule-based, raw_json 에 보존).
    # AI 가 후보만 제시하며 evidence_type 을 자동 확정하지 않는다.
    #   suggested_activity_type  : "BIOCHAR" | "WASTE" | ... (v0_chief ActivityCode), 매칭 없으면 ""
    #   suggested_activity_label : 화면용 한국어 표시 (예: "바이오차 투입")
    #   suggested_evidence_type  : 추천 evidence_type 코드 (예: "BIOCHAR_INVOICE"), 없으면 ""
    #   suggested_reason         : 추천 사유 (사용자 표시용 짧은 한국어)
    #   suggested_confidence     : 0.0~1.0 — 매칭 키워드 개수에 따라 가산
    suggested_activity_type: str = Field(default="")
    suggested_activity_label: str = Field(default="")
    suggested_evidence_type: str = Field(default="")
    suggested_reason: str = Field(default="")
    suggested_confidence: float = Field(default=0.0)

    # 촬영 후 To-do 일치 판정 (gemini-2.5-flash, raw_json 에 보존). 사진류 + To-do 있을 때만 채워짐.
    #   todo_match               : "O" | "UNCERTAIN" | "X" | "" — 이 사진이 그 작업 증빙으로 맞는지
    #   todo_match_confidence    : 0.0~1.0
    #   todo_match_reason        : 판정 사유 (짧은 한국어, 농가/이장님 표시용)
    #   needs_chief_verification : 확신 낮음/불일치 → 이장님이 꼭 확인 (제출은 막지 않음)
    todo_match: str = Field(default="")
    todo_match_confidence: float = Field(default=0.0)
    todo_match_reason: str = Field(default="")
    needs_chief_verification: bool = Field(default=False)

    # 촬영 위치 (브라우저 geolocation). 없으면 None → DB 는 0.0 으로 보관.
    #   address: gps_lat/long 을 무료 역지오코딩(Nominatim)한 대략적 주소.
    gps_lat: float | None = None
    gps_long: float | None = None
    address: str = Field(default="")


class EvidenceCreate(EvidenceBase):
    """``POST /evidence`` 요청 body. evidence_id 는 옵션 (backend 가 합성)."""
    evidence_id: str | None = None


class EvidenceUpdate(BaseModel):
    """``PATCH /evidence/{id}`` 요청 body. 이장님 검토 흐름에 사용.

    모든 필드 옵션. 들어온 필드만 갱신.
    """
    status: str | None = None
    confirmed_label: str | None = None
    user_message: str | None = None


class EvidenceRecord(EvidenceBase):
    """``GET /evidence`` 응답 항목."""
    evidence_id: str = Field(default_factory=lambda: f"evidence_{uuid4().hex}")
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)


class EvidenceListResponse(BaseModel):
    """``GET /evidence`` 응답 wrapper."""
    items: list[EvidenceRecord]


class EvidenceMissingResponse(BaseModel):
    """``GET /evidence/missing`` 응답.

    활동 유형에 필요한 증빙 종류와 현재 제출 상태를 비교해서 누락 항목을 알려줍니다.
    """
    activity_type: str
    required_evidence_types: list[str]
    submitted_evidence_types: list[str]
    missing_evidence_types: list[str]
    required_evidence_count: int
    submitted_evidence_count: int
    completion_status: str
    user_message: str
