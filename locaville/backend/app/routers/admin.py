"""``/admin/*`` 라우터 — 이장님 대시보드(v0_chief) 가 호출하는 admin 전용 API."""
from __future__ import annotations

from datetime import date as _date

from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, status as http_status

from app.repositories import farm_helper_rdb as fh_repo
from app.services.admin_auth_service import AdminLoginError, authenticate_admin
from app.services.admin_profile_service import (
    AdminProfileError,
    get_admin_profile,
    update_admin_profile,
)
from app.services.admin_service import (
    NotifyTargetNotFound,
    delete_diary,
    delete_evidence,
    get_admin_summary,
    get_admin_todo_status,
    get_ai_recommendation,
    get_laggard_farmers,
    get_new_counts,
    get_project_members,
    get_recent_evidence,
    get_village_group_members,
    send_laggard_notification,
)
from app.services.farm_helper_service import (
    HelperAssignmentError,
    HelperNotFoundError,
    assign_helper_pair,
    revoke_helper_pair,
)
from app.services.admin_resident_service import (
    AdminResidentInputError,
    create_resident,
    invite_resident,
    update_resident,
)
from app.services.admin_weather_service import get_admin_agri_weather
from app.services.farm_info_service import get_weekly_farm_info
from app.services.kakao_address_service import KakaoConfigError, search_address
from app.services.payment_service import get_admin_payments


router = APIRouter(prefix="/admin", tags=["admin"])


class AdminLoginRequest(BaseModel):
    login_id: str
    password: str


class AdminProfileUpdateRequest(BaseModel):
    phone_no: str | None = None
    email: str | None = None
    password: str | None = None


@router.post("/login")
def login_admin(payload: AdminLoginRequest) -> dict:
    """admin 테이블 기반 로그인 검증. 성공 시 관리자 기본 정보를 반환합니다."""
    try:
        admin_info = authenticate_admin(
            login_id=payload.login_id,
            password=payload.password,
        )
    except AdminLoginError as exc:
        raise HTTPException(
            status_code=http_status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        ) from exc
    except RuntimeError as exc:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc
    return {"ok": True, "admin": admin_info}


@router.get("/profile/{admin_no}")
def get_admin_profile_endpoint(admin_no: int) -> dict:
    """현재 관리자 정보 조회."""
    try:
        profile = get_admin_profile(admin_no=admin_no)
    except AdminProfileError as exc:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    if profile is None:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail=f"관리자를 찾을 수 없습니다: {admin_no}",
        )
    return {"admin": profile}


@router.patch("/profile/{admin_no}")
def update_admin_profile_endpoint(admin_no: int, payload: AdminProfileUpdateRequest) -> dict:
    """현재 관리자 정보 수정. 비밀번호는 bcrypt 해시 후 저장."""
    try:
        profile = update_admin_profile(
            admin_no=admin_no,
            phone_no=payload.phone_no,
            email=payload.email,
            password=payload.password,
        )
    except AdminProfileError as exc:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    if profile is None:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail=f"관리자를 찾을 수 없습니다: {admin_no}",
        )
    return {"ok": True, "admin": profile}


@router.get("/summary")
def get_summary() -> dict:
    # 대시보드 첫 화면 요약 데이터 API입니다.
    # 총 일지/총 증빙/농가별 집계/최근 목록을 한 번에 내려줍니다.
    return get_admin_summary()


@router.get("/todo-status")
def get_todo_status(
    farmer_id: str | None = None,
    group_no: int | None = None,
    prj_id: str | None = None,
    project_id: str | None = None,
    activity_id: str | None = None,
) -> dict:
    # Farmer-level todo/evidence progress snapshot for chief dashboard.
    # project_id는 prj_id의 프론트 alias로 허용합니다. (prj_id 우선)
    effective_prj_id = prj_id if prj_id else project_id
    return get_admin_todo_status(
        farmer_id=farmer_id,
        group_no=group_no,
        prj_id=effective_prj_id,
        activity_id=activity_id,
    )


@router.delete("/diaries/{diary_id}")
def delete_diary_endpoint(diary_id: str) -> dict:
    """일지 soft delete — 이장님이 잘못 기록됐다고 판단한 일지를 숨김.

    실제 DB row 는 남기고 deleted_dt 만 세팅 → 운영자가 복구 가능.
    매칭 row 가 없으면 404.
    """
    result = delete_diary(diary_id)
    if not result.get("deleted"):
        raise HTTPException(status_code=404, detail=f"일지를 찾을 수 없습니다: {diary_id}")
    return result


@router.get("/new-counts")
def get_new_counts_endpoint(
    since_diary: str | None = None,
    since_evidence: str | None = None,
) -> dict:
    """사이드바 "새 항목" 배지용 — since 시각 이후 등록된 일지/증빙 개수.

    클라이언트가 localStorage 에 저장한 "마지막 방문 시각" 을 ISO 문자열로 전달.
    응답: {"diaries": N, "evidence": M}.
    """
    return get_new_counts(since_diary=since_diary, since_evidence=since_evidence)


@router.post("/residents", status_code=http_status.HTTP_201_CREATED)
def create_resident_endpoint(payload: dict) -> dict:
    """이장님 주민추가 — amo_family + user_master(placeholder) + parcel(N) + group_member(옵션) INSERT.

    한 트랜잭션 안에 모두 INSERT (한 단계 실패하면 전체 rollback).
    request body 는 frontend ResidentAddModal payload 그대로:
      {name, phone, address, addressDetail, parcelCrops:[...], groupNo?, villeId?}
    응답: {amo_regno, user_no, ville_id, status_cd, name, phone}.
    """
    try:
        return create_resident(payload)
    except AdminResidentInputError as exc:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001 — DB 오류는 500
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"주민 등록 실패: {exc}",
        ) from exc


@router.patch("/residents/{amo_regno}")
def update_resident_endpoint(amo_regno: str, payload: dict) -> dict:
    """주민 기본 정보 수정 — amo_family + user_master (chief_no) 동기화.

    body 의 들어온 필드만 PATCH (None 은 무시). 매칭 없으면 404.
    필지/단체 변경은 별도 endpoint 추가 시.
    """
    try:
        result = update_resident(amo_regno, payload)
    except AdminResidentInputError as exc:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"주민 수정 실패: {exc}",
        ) from exc
    if result is None:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail=f"주민을 찾을 수 없습니다: {amo_regno}",
        )
    return result


@router.post("/residents/{amo_regno}/invite")
def invite_resident_endpoint(amo_regno: str) -> dict:
    """주민에게 초대 표시 — user_master.status_cd 를 'INV' 로 (실 SMS 발송 X, 시스템 기록만).

    재발송도 같은 endpoint 사용. 매칭 없으면 404.
    """
    try:
        result = invite_resident(amo_regno)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"초대 실패: {exc}",
        ) from exc
    if result is None:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail=f"주민을 찾을 수 없습니다: {amo_regno}",
        )
    return result


@router.get("/payments")
def get_payments_endpoint() -> dict:
    """이장님 회계 — 농가별 지급액 + 활동 breakdown + 마을 총액.

    완료된(prj_todo_list.job_progress='END') 활동만 집계.
    단가는 backend `payment_service.SUBSIDY_BY_JOB_CD` (시행문서 기반).
    면적은 parcel.parcel_area (m²) → ha 변환.
    """
    return get_admin_payments()


@router.get("/agri-weather")
def get_agri_weather_endpoint() -> dict:
    """대시보드 '농업기상' 카드 — 현재 관측치 + 7일 forecast.

    기상청 단기예보 (+0~+2일) + carry-forward 보간 (+3~+6일). 실패 시 isFallback=True.
    """
    return get_admin_agri_weather()


@router.get("/weekly-farm-info")
def get_weekly_farm_info_endpoint() -> dict:
    """이장님 대시보드 '이번주 농사정보' 카드 데이터.

    1차: 농촌진흥청 농사로 weekFarmInfo API → PDF → OpenAI LLM 요약.
    2차: 위 어느 단계든 실패 시 시즌(월) 정적 큐레이션 dict.
    캐시: 마을·작목별 7일 in-memory (주 1회 발행 주기 맞춤).
    """
    return get_weekly_farm_info()


@router.get("/address-search")
def address_search_endpoint(query: str, size: int = 10) -> dict:
    """Kakao Local 주소 검색 proxy — frontend AddressSearchPanel 용.

    KAKAO_REST_API_KEY 는 backend .env 에서만 보관 (클라이언트 노출 금지).
    빈 query 면 빈 items 즉시 반환. Kakao 호출 실패 시 502 로 응답.
    """
    try:
        items = search_address(query, size=size)
    except KakaoConfigError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001 — 외부 API 실패는 502 로 변환
        raise HTTPException(status_code=502, detail=f"Kakao 주소 검색 실패: {exc}") from exc
    return {"items": items}


@router.get("/recent-evidence")
def get_recent_evidence_endpoint(limit: int = 6) -> dict:
    """마을 현황 갤러리 — 최근 증빙 사진 N장 (워터마크 없는 원본)."""
    return get_recent_evidence(limit=limit)


@router.get("/laggard-farmers")
def get_laggard_farmers_endpoint(days: int = 7, top_n: int = 5) -> dict:
    """누락 농가 — 최근 N일 미이행 todo 가 많은 top N."""
    return get_laggard_farmers(days=days, top_n=top_n)


class _NotifyLaggardBody(BaseModel):
    title: str | None = None
    message: str | None = None
    sender_user_no: int | None = None


@router.post("/laggard-farmers/{farmer_id}/notify")
def notify_laggard_endpoint(farmer_id: str, body: _NotifyLaggardBody | None = None) -> dict:
    """누락 농가에게 알림 1건 INSERT (notification 테이블)."""
    payload = body or _NotifyLaggardBody()
    try:
        return send_laggard_notification(
            farmer_id=farmer_id,
            title=payload.title,
            message=payload.message,
            sender_user_no=payload.sender_user_no,
        )
    except NotifyTargetNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/ai-recommendation")
def get_ai_recommendation_endpoint() -> dict:
    """대시보드 상단 1-2줄 추천 (날씨+주간+todo 묶음 RAG)."""
    return get_ai_recommendation()


# ============================================================
# 기록 도우미 (farm_helper) — 이장님 권한
# ============================================================

class _AssignHelperBody(BaseModel):
    helper_user_no: int
    recipient_user_no: int
    est_end_date: _date
    chief_user_no: int | None = None


@router.post("/farm-helpers", status_code=http_status.HTTP_201_CREATED)
def post_assign_helper(body: _AssignHelperBody) -> dict:
    """이장님 — helper-recipient 도움 관계 배정. 양쪽에 동의 요청 알림 자동 발송."""
    try:
        return assign_helper_pair(
            helper_user_no=body.helper_user_no,
            recipient_user_no=body.recipient_user_no,
            est_end_date=body.est_end_date,
            chief_user_no=body.chief_user_no,
        )
    except HelperAssignmentError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/farm-helpers")
def list_farm_helpers(ville_id: str) -> dict:
    """마을의 진행중(active+pending) 도움 관계 전체."""
    return {"items": fh_repo.list_for_village(ville_id)}


@router.delete("/farm-helpers/{helper_user_no}/{help_seq}")
def delete_farm_helper(helper_user_no: int, help_seq: int, chief_user_no: int | None = None) -> dict:
    """이장님 해제 — real_end_date = today. 양쪽에 종료 알림."""
    try:
        return revoke_helper_pair(
            helper_user_no=helper_user_no, help_seq=help_seq, chief_user_no=chief_user_no
        )
    except HelperNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/projects/{prj_id}/members")
def get_project_members_endpoint(prj_id: str) -> dict:
    """사업 참여 농가 — act_grp 기준. 사업 상세의 멤버 영역에 사용."""
    return get_project_members(prj_id)


@router.get("/village-groups/{group_no}/members")
def get_village_group_members_endpoint(group_no: int) -> dict:
    """마을 단체 멤버 — group_member.active_yn='Y' 기준. 단체 카드 칩에 사용."""
    return get_village_group_members(group_no)


@router.delete("/evidence/{evidence_id}")
def delete_evidence_endpoint(evidence_id: str) -> dict:
    """증빙 사진 soft delete — 이장님이 잘못 찍었다고 판단한 사진을 숨김.

    DB row 의 deleted_dt 만 세팅. S3 파일은 그대로 유지 (cleanup job 별도).
    매칭 row 가 없으면 404.
    """
    result = delete_evidence(evidence_id)
    if not result.get("deleted"):
        raise HTTPException(status_code=404, detail=f"증빙을 찾을 수 없습니다: {evidence_id}")
    return result
