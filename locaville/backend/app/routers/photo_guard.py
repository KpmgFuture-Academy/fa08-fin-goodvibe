"""``/photo-guard/*`` 라우터 — 사진 가이드 (PhotoGuardOverlay) 전용.

농가가 증빙 사진 찍은 직후 frontend 가 호출 → 야외/농경지 분류 결과로
"OK / 다시 찍기" 안내. 본 evidence upload 와 별개의 가벼운 사전 검사.
"""
from __future__ import annotations

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.services.ai_service import AIServiceError
from app.services.photo_guard_service import analyze_photo_environment, coach_photo


router = APIRouter(prefix="/photo-guard", tags=["photo-guard"])


MAX_BYTES = 8 * 1024 * 1024  # 8MB


@router.post("/check")
async def post_photo_guard_check(
    file: UploadFile = File(...),
    evidence_type: str | None = Form(None),
) -> dict:
    """사진 1장 → Vision LLM 분류. evidence_type 별 schema 분기.
      - PIC*  : {kind:'photo', is_outdoor, is_field, label, reason}
      - RCT*  : {kind:'receipt', is_receipt, is_farm_related, vendor, amount, items, purchased_at, label, reason}
      - EDU   : {kind:'certificate', is_certificate, is_farm_related, issuer, title, issued_at, label, reason}
    """
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="이미지 파일만 업로드 가능")
    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="빈 파일")
    if len(image_bytes) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="파일이 너무 큽니다 (8MB 이하)")
    try:
        result = analyze_photo_environment(
            image_bytes,
            content_type=file.content_type,
            evidence_type=evidence_type,
        )
    except AIServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    return result


@router.post("/coach")
async def post_photo_guard_coach(
    file: UploadFile = File(...),
    evidence_type: str | None = Form(None),
    job_cd: str | None = Form(None),
) -> dict:
    """라이브 카메라 frame → 짧은 한국어 코칭 메시지.

    PhotoLiveCoachOverlay 가 3초마다 호출. 응답이 짧고 액션형이라
    detail=low + max_tokens=80 으로 비용·지연 최소화.

    (job_cd, evidence_type) 조합으로 시행지침 9p 표의 정확 기준을 prompt 에 주입 —
    같은 PIC2 도 R0008 이면 "중간 물떼기 시작", RD001 이면 "바이오차 포대" 등.

    응답: {kind, status: ok|adjust|wait, message, can_capture}
    """
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="이미지 파일만 업로드 가능")
    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="빈 파일")
    if len(image_bytes) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="파일이 너무 큽니다 (8MB 이하)")
    try:
        result = coach_photo(
            image_bytes,
            content_type=file.content_type,
            evidence_type=evidence_type,
            job_cd=job_cd,
        )
    except AIServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    return result
