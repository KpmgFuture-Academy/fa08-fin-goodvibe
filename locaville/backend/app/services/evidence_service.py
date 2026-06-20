"""증빙(evidence) 서비스 레이어.

라우터(``/evidence``, ``/evidence/upload``)와 저장소 사이를 매개하며 다음을 담당:

  - STORAGE_MODE 분기 (rdb vs json 저장소). RDB 의 mysql/postgres 는 ``DB_SOURCE`` 가 결정.
  - 사진 파일 업로드 → 원본/워터마크 두 경로 저장 (Pillow)
  - 활동 유형별 필수 증빙 종류 매핑 (`get_required_evidence_types`)
  - 누락 증빙 계산 (`get_evidence_missing_status`) — ``GET /evidence/missing``
  - PATCH(이장님 검토) 시 status/confirmed_label/user_message 갱신

이장님의 검토 상태(``status``)는 신 스키마 evidence 테이블의 ``raw_json.status``
JSON 필드에 보관됩니다.
"""
from __future__ import annotations

import os
from datetime import datetime
from io import BytesIO
from pathlib import Path
from uuid import uuid4

from app.repositories.evidence_rdb import (
    EvidenceMySQLConflictError,
    create_evidence_mysql,
    get_evidence_by_id_mysql,
    list_evidence_mysql,
    update_evidence_mysql,
)
from app.repositories.evidence_file import get_evidence, list_evidence, save_evidence
from app.schemas.evidence import EvidenceCreate, EvidenceRecord, EvidenceUpdate
from app.services.image_quality import check_image_quality, quality_message

try:
    from PIL import Image, ImageDraw, ImageFont, ImageOps
except ImportError:  # pragma: no cover
    Image = ImageDraw = ImageFont = ImageOps = None

ALLOWED_UPLOAD_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024
EVIDENCE_UPLOAD_ROOT = Path(__file__).resolve().parents[2] / "uploads" / "evidence"
EVIDENCE_UPLOAD_ORIGINAL_DIR = EVIDENCE_UPLOAD_ROOT / "original"
EVIDENCE_UPLOAD_WATERMARKED_DIR = EVIDENCE_UPLOAD_ROOT / "watermarked"
MID_DRAINAGE = "중간 물떼기"
AWD = "논물 얕게 걸러대기"
BIOCHAR = "바이오차 투입"
AUTUMN_TILLAGE = "가을갈이"
WASTE_COLLECTION_ACTIVITY = "폐기물 처리"
FONT_CANDIDATE_PATHS = [
    # Windows (한글: 맑은 고딕). 한글이 깨지지 않도록 가장 먼저 시도.
    "C:/Windows/Fonts/malgun.ttf",
    "C:/Windows/Fonts/malgunbd.ttf",
    "C:/Windows/Fonts/gulim.ttc",
    "C:/Windows/Fonts/batang.ttc",
    # macOS
    "/System/Library/Fonts/AppleSDGothicNeo.ttc",
    "/System/Library/Fonts/Supplemental/AppleGothic.ttf",
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    # Linux
    "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
]

LABEL_DISPLAY_NAMES = {
    "MID_DRAINAGE_START": "중간 물떼기 시작",
    "MID_DRAINAGE_END": "중간 물떼기 종료",
    "AWD_DRY_FIELD": "마른 논바닥",
    "BIOCHAR_BAG": "바이오차 포대",
    "BIOCHAR_SPREADING": "바이오차 투입",
    "BIOCHAR_INVOICE": "바이오차 구입증빙",
    "AUTUMN_TILLAGE_BEFORE": "가을갈이 전",
    "AUTUMN_TILLAGE_AFTER": "가을갈이 후",
    "WASTE_COLLECTION": "폐기물 수거",
}


class EvidenceRepositoryError(Exception):
    pass


class EvidenceInputError(Exception):
    """업로드 입력 데이터 문제 (알 수 없는 farmer_id, 필지 매핑 실패 등).

    DB/서버 장애(``EvidenceRepositoryError`` → 503)와 구분하기 위한 타입.
    라우터가 400 으로 매핑하고 사유 메시지를 그대로 사용자에게 노출합니다.
    """
    pass


class EvidenceConflictError(Exception):
    pass


class WatermarkGenerationError(Exception):
    pass


def _storage_mode() -> str:
    """저장소 모드 (rdb/json). 옛 ``DATA_SOURCE=mysql|postgres`` 도 'rdb' 로 매핑."""
    mode = os.getenv("STORAGE_MODE", "").strip().lower()
    if mode:
        return mode
    legacy = os.getenv("DATA_SOURCE", "json").strip().lower()
    return "rdb" if legacy in ("mysql", "postgres", "rdb") else legacy


def _resolve_farmer_display_name(farmer_id: str) -> str:
    """farmer_id(login_id/user_no/amo_regno 등) → 표시용 이름(예: 김영수).

    워터마크에 'ys.kim' 같은 로그인ID 대신 실제 이름을 보여주기 위함.
    rdb 모드에서만 해석하며, 실패하거나 json 모드면 farmer_id 를 그대로 사용.
    """
    if _storage_mode() == "rdb":
        try:
            from app.repositories.identity_rdb import resolve_user_record

            rec = resolve_user_record(farmer_id)
            if rec and rec.get("user_name"):
                return str(rec["user_name"]).strip()
        except Exception:  # noqa: BLE001
            pass
    return farmer_id or "-"


def _list_raw_evidence(
    *,
    farmer_id: str | None = None,
    status: str | None = None,
    evidence_type: str | None = None,
    confirmed_label: str | None = None,
    activity_type: str | None = None,
    field_id: str | None = None,
    parcel_no: str | None = None,
    project_id: str | None = None,
    prj_id: str | None = None,
    activity_id: str | None = None,
    job_cd: str | None = None,
    group_no: int | None = None,
    limit: int = 100,
) -> list[dict]:
    if _storage_mode() == "rdb":
        return list_evidence_mysql(
            farmer_id=farmer_id,
            status=status,
            evidence_type=evidence_type,
            confirmed_label=confirmed_label,
            activity_type=activity_type,
            field_id=field_id,
            parcel_no=parcel_no,
            project_id=project_id,
            prj_id=prj_id,
            activity_id=activity_id,
            job_cd=job_cd,
            group_no=group_no,
            limit=limit,
        )
    return list_evidence()


def _get_raw_evidence(evidence_id: str) -> dict | None:
    if _storage_mode() == "rdb":
        return get_evidence_by_id_mysql(evidence_id)
    return get_evidence(evidence_id)


def _save_record(record: EvidenceRecord) -> dict:
    data = record.model_dump(mode="json")
    if _storage_mode() == "rdb":
        return create_evidence_mysql(data)
    return save_evidence(data)


def _update_record(record: EvidenceRecord) -> dict | None:
    data = record.model_dump(mode="json")
    if _storage_mode() == "rdb":
        return update_evidence_mysql(data)
    return save_evidence(data)


def _to_record(raw: dict) -> EvidenceRecord | None:
    # 저장소(dict)를 API 스키마(EvidenceRecord)로 안전 변환합니다.
    try:
        return EvidenceRecord.model_validate(raw)
    except Exception:
        return None


def _create_evidence_id() -> str:
    # 업로드 증빙 고유 ID 생성기입니다.
    return f"evidence_{uuid4().hex}"


def _relative_upload_path(path: Path) -> str:
    return path.relative_to(Path(__file__).resolve().parents[2]).as_posix()


def _build_upload_url(base_url: str, relative_path: str) -> str:
    return f"{base_url.rstrip('/')}/{relative_path.lstrip('/')}"


def _get_watermark_font(font_size: int) -> object:
    """주어진 크기로 한글 가능한 폰트를 로드. 후보가 모두 없으면 기본 폰트."""
    if ImageFont is None:  # pragma: no cover
        raise WatermarkGenerationError("Pillow is not installed")

    for font_path in FONT_CANDIDATE_PATHS:
        if Path(font_path).exists():
            try:
                return ImageFont.truetype(font_path, max(10, int(font_size)))
            except Exception:  # noqa: BLE001
                continue
    return ImageFont.load_default()


def _watermark_lines(
    *,
    farmer_name: str,
    activity_type: str,
    activity_id: str,
    evidence_type: str,
    captured_at: datetime,
    gps_lat: float | None = None,
    gps_long: float | None = None,
    address: str = "",
    parcel_label: str = "",
) -> list[str]:
    # 활동/증빙 줄은 사용자 요청으로 제외 (activity_type/activity_id/evidence_type 은
    # 시그니처 호환을 위해 인자로는 받되 워터마크에는 표시하지 않음).
    lines = [
        f"농업인: {farmer_name or '-'}",
        f"촬영시각: {captured_at.strftime('%Y-%m-%d %H:%M')}",
    ]
    if parcel_label:
        lines.append(f"필지: {parcel_label}")
    # GPS 좌표가 캡처된 경우에만 위치/주소 줄 추가 (0,0 은 미캡처로 간주).
    if gps_lat is not None and gps_long is not None and (gps_lat or gps_long):
        lines.append(f"위치: {float(gps_lat):.5f}, {float(gps_long):.5f}")
    if address:
        lines.append(f"주소: {address}")
    return lines


def _extract_exif_captured_at(image_bytes: bytes) -> datetime | None:
    """이미지 EXIF DateTimeOriginal 추출 — 없으면 None.

    핸드폰 카메라로 찍은 사진은 EXIF 0x9003(DateTimeOriginal) 에 촬영 시각이 들어있음.
    농가가 갤러리에서 1주 전 사진을 업로드해도 그 사진의 실제 촬영 시각을 보존.
    EXIF 없거나 파싱 실패하면 None — 호출자가 upload 시각 (datetime.now()) 으로 폴백.
    """
    if Image is None:
        return None
    try:
        img = Image.open(BytesIO(image_bytes))
        exif = img.getexif()
        if not exif:
            return None
        # 0x9003 = DateTimeOriginal, 0x0132 = DateTime (수정시각, fallback)
        raw = exif.get(0x9003) or exif.get(0x0132)
        if not raw:
            return None
        return datetime.strptime(str(raw), "%Y:%m:%d %H:%M:%S")
    except Exception:  # noqa: BLE001 — EXIF 파싱 실패는 silent fallback
        return None


def _save_watermarked_image(
    *,
    original_bytes: bytes,
    output_path: "Path | BytesIO",
    extension: str,
    farmer_name: str,
    activity_type: str,
    activity_id: str,
    evidence_type: str,
    captured_at: datetime,
    gps_lat: float | None = None,
    gps_long: float | None = None,
    address: str = "",
    parcel_label: str = "",
) -> None:
    if Image is None or ImageDraw is None or ImageFont is None or ImageOps is None:
        raise WatermarkGenerationError("Pillow is not installed")

    try:
        image = Image.open(BytesIO(original_bytes))
        image = ImageOps.exif_transpose(image)
        base_image = image.convert("RGBA")
        overlay = Image.new("RGBA", base_image.size, (0, 0, 0, 0))
        draw = ImageDraw.Draw(overlay)
        lines = _watermark_lines(
            farmer_name=farmer_name,
            activity_type=activity_type,
            activity_id=activity_id,
            evidence_type=evidence_type,
            captured_at=captured_at,
            gps_lat=gps_lat,
            gps_long=gps_long,
            address=address,
            parcel_label=parcel_label,
        )

        margin = max(12, min(28, base_image.width // 40))
        # 워터마크 글자 영역이 사진의 1/4(높이) 와 가로 폭을 넘지 않도록 폰트 크기를 맞춘다.
        max_block_height = base_image.height // 4
        max_block_width = base_image.width - margin * 2

        def _measure(size: int):
            font = _get_watermark_font(size)
            stroke = max(1, size // 14)  # 가독성용 외곽선
            spacing = max(2, size // 5)
            heights: list[int] = []
            widest = 0
            for line in lines:
                bbox = draw.textbbox((0, 0), line, font=font, stroke_width=stroke)
                heights.append(bbox[3] - bbox[1])
                widest = max(widest, bbox[2] - bbox[0])
            block_h = sum(heights) + spacing * max(0, len(lines) - 1)
            return font, stroke, spacing, heights, block_h, widest

        # 사진 폭 기준 상한 크기에서 1씩 줄여가며 1/4(높이)·가로폭에 들어가는 가장 큰 크기 선택.
        size_upper = max(12, min(40, base_image.width // 22))
        font = None
        for size in range(size_upper, 9, -1):
            font, stroke, spacing, line_heights, block_h, block_w = _measure(size)
            if block_h <= max_block_height and block_w <= max_block_width:
                break
        if font is None:  # pragma: no cover (lines 가 비는 경우 방어)
            font, stroke, spacing, line_heights, block_h, block_w = _measure(12)

        # 반투명 배경 박스 없이(투명) 좌하단에 글자만 올림. 흰 글자 + 검은 외곽선으로 가독성 확보.
        x0 = margin
        y0 = max(margin, base_image.height - block_h - margin)

        cursor_y = y0
        for index, line in enumerate(lines):
            draw.text(
                (x0, cursor_y),
                line,
                font=font,
                fill=(255, 255, 255, 255),
                stroke_width=stroke,
                stroke_fill=(0, 0, 0, 255),
            )
            cursor_y += line_heights[index] + spacing

        result = Image.alpha_composite(base_image, overlay)
        # Path 인 경우만 디렉토리 보장. BytesIO 면 메모리라 skip.
        if isinstance(output_path, Path):
            output_path.parent.mkdir(parents=True, exist_ok=True)

        normalized_extension = extension.lower()
        save_kwargs: dict[str, object] = {}
        if normalized_extension in {".jpg", ".jpeg"}:
            result = result.convert("RGB")
            save_format = "JPEG"
            save_kwargs["quality"] = 92
        elif normalized_extension == ".png":
            save_format = "PNG"
        elif normalized_extension == ".webp":
            save_format = "WEBP"
            save_kwargs["quality"] = 92
        else:
            result = result.convert("RGB")
            save_format = "JPEG"
            save_kwargs["quality"] = 92
        result.save(output_path, format=save_format, **save_kwargs)
    except WatermarkGenerationError:
        raise
    except Exception as exc:  # noqa: BLE001
        raise WatermarkGenerationError("Failed to generate watermarked evidence image") from exc


def display_evidence_type(evidence_type: str) -> str:
    """코드형 증빙 타입 (`MID_DRAINAGE_START` 등) 을 화면용 한국어 라벨로 변환."""
    if evidence_type.startswith("AWD_DRY_FIELD_ROUND_"):
        return f"마른 논바닥 {evidence_type.rsplit('_', 1)[-1]}회차"
    return LABEL_DISPLAY_NAMES.get(evidence_type, evidence_type)


# ============================================================
# 영수증 vendor/items 가 to-do job_cd 에 어울리는지 검증할 키워드.
# 빈 list 면 "어떤 영수증이든 OK" (검증 패스). dict 에 없으면 검증 X.
# 키워드 매칭 안 되면 needs_chief_verification = True 로 이장님 확인 유도.
# ============================================================
_RECEIPT_KEYWORDS_BY_JOB: dict[str, list[str]] = {
    "RD001": ["바이오차", "biochar", "탄화", "탄소"],          # 바이오차 투입
    "A0001": ["비료", "퇴비", "복합", "요소"],                  # 비료 주기
    "A0002": ["거름", "퇴비", "유박", "유기"],                  # 거름 주기
    "A0003": ["농약", "살충", "살균", "방제", "제초"],          # 병해충 방제(농약)
    "A0004": ["방제", "포충", "유인", "트랩"],                  # 병해충 방제(기타)
    "AP001": [],                                                 # 농자재 구입 — 어떤 영수증이든 OK
    "AE001": ["교육", "이수", "수강", "강의"],                  # 공익증진 교육 이수
    "R0001": ["볍씨", "종자", "씨앗"],                          # 볍씨 소독
    "R0002": ["못자리", "육묘", "모"],                          # 못자리/육묘
}


def get_required_evidence_types(activity_type: str) -> list[str]:
    """활동 유형별 필수 증빙 종류 (`/evidence/missing` 계산 베이스)."""
    if activity_type == MID_DRAINAGE:
        return ["MID_DRAINAGE_START", "MID_DRAINAGE_END"]
    if activity_type == AWD:
        return [
            "AWD_DRY_FIELD_ROUND_1",
            "AWD_DRY_FIELD_ROUND_2",
            "AWD_DRY_FIELD_ROUND_3",
            "AWD_DRY_FIELD_ROUND_4",
        ]
    if activity_type == BIOCHAR:
        return ["BIOCHAR_BAG", "BIOCHAR_SPREADING", "BIOCHAR_INVOICE"]
    if activity_type == AUTUMN_TILLAGE:
        return ["AUTUMN_TILLAGE_BEFORE", "AUTUMN_TILLAGE_AFTER"]
    if activity_type == WASTE_COLLECTION_ACTIVITY:
        return ["WASTE_COLLECTION"]
    return []


def _normalize_submitted_evidence_type(record: EvidenceRecord) -> str:
    # 저장된 증빙을 비교 가능한 코드로 정규화합니다.
    evidence_type = record.evidence_type or record.confirmed_label
    if record.activity_type == AWD and evidence_type == "AWD_DRY_FIELD":
        # TODO: AWD 회차 정보가 아직 없어서 MVP에서는 첫 제출을 ROUND_1로 간주한다.
        return "AWD_DRY_FIELD_ROUND_1"
    return evidence_type


def list_evidence_records() -> list[EvidenceRecord]:
    """무필터 증빙 목록 (최신순). 라우터의 `GET /evidence` 폴백 + 다른 services 가 사용."""
    records = []
    try:
        for raw in _list_raw_evidence(limit=100):
            if isinstance(raw, dict):
                record = _to_record(raw)
                if record:
                    records.append(record)
    except Exception as exc:  # noqa: BLE001
        raise EvidenceRepositoryError("Failed to load evidence records") from exc
    return sorted(records, key=lambda item: (item.updated_at, item.created_at, item.captured_at), reverse=True)


def list_evidence_records_filtered(
    farmer_id: str | None = None,
    status: str | None = None,
    evidence_type: str | None = None,
    confirmed_label: str | None = None,
    activity_type: str | None = None,
    field_id: str | None = None,
    parcel_no: str | None = None,
    project_id: str | None = None,
    prj_id: str | None = None,
    activity_id: str | None = None,
    job_cd: str | None = None,
    group_no: int | None = None,
    limit: int = 100,
) -> list[EvidenceRecord]:
    """``GET /evidence?...`` 필터 종합. AND 조건. mysql 은 SQL WHERE / json 은 Python 필터."""
    safe_limit = max(1, min(limit, 100))
    if _storage_mode() == "rdb":
        records: list[EvidenceRecord] = []
        try:
            for raw in _list_raw_evidence(
                farmer_id=farmer_id,
                status=status,
                evidence_type=evidence_type,
                confirmed_label=confirmed_label,
                activity_type=activity_type,
                field_id=field_id,
                parcel_no=parcel_no,
                project_id=project_id,
                prj_id=prj_id,
                activity_id=activity_id,
                job_cd=job_cd,
                group_no=group_no,
                limit=safe_limit,
            ):
                if isinstance(raw, dict):
                    record = _to_record(raw)
                    if record:
                        records.append(record)
        except Exception as exc:  # noqa: BLE001
            raise EvidenceRepositoryError("Failed to load evidence records") from exc
        return records

    records = list_evidence_records()
    if farmer_id is not None:
        records = [record for record in records if record.farmer_id == farmer_id]
    if status is not None:
        records = [record for record in records if record.status == status]
    if evidence_type is not None:
        records = [record for record in records if record.evidence_type == evidence_type]
    if confirmed_label is not None:
        records = [record for record in records if record.confirmed_label == confirmed_label]
    if activity_type is not None:
        records = [record for record in records if record.activity_type == activity_type]
    if field_id is not None:
        records = [record for record in records if record.field_id == field_id]
    if parcel_no is not None:
        records = [record for record in records if record.parcel_no == parcel_no]
    if project_id is not None:
        records = [record for record in records if record.project_id == project_id]
    if prj_id is not None:
        records = [record for record in records if record.prj_id == prj_id]
    if activity_id is not None:
        records = [record for record in records if record.activity_id == activity_id]
    if job_cd is not None:
        records = [record for record in records if record.job_cd == job_cd]
    if group_no is not None:
        records = [record for record in records if record.group_no == group_no]
    return records[:safe_limit]


def get_evidence_record(evidence_id: str) -> EvidenceRecord | None:
    """evidence_id 단건 조회. 형식 오류/매칭 없음 → None (라우터가 404)."""
    try:
        raw = _get_raw_evidence(evidence_id)
        return _to_record(raw) if raw else None
    except Exception as exc:  # noqa: BLE001
        raise EvidenceRepositoryError("Failed to load the evidence record") from exc


def create_evidence_record(payload: EvidenceCreate) -> EvidenceRecord:
    """파일 업로드 없는 메타데이터만의 증빙 생성 (스모크 테스트 / 외부 시스템 동기화 용).

    실제 사진 업로드는 ``create_uploaded_evidence_record`` 사용. 중복 ID 시
    ``EvidenceConflictError`` / mysql 충돌 시 ``EvidenceMySQLConflictError``.
    """
    now = datetime.now()
    data = payload.model_dump(exclude={"evidence_id"})
    if payload.evidence_id:
        data["evidence_id"] = payload.evidence_id
    record = EvidenceRecord(
        **data,
        created_at=now,
        updated_at=now,
    )
    try:
        existing = get_evidence_record(record.evidence_id)
        if existing:
            raise EvidenceConflictError(f"Duplicate evidence_id/exec_id: {record.evidence_id}")
        saved = _save_record(record)
        return EvidenceRecord.model_validate(saved)
    except (EvidenceConflictError, EvidenceMySQLConflictError):
        raise
    except Exception as exc:  # noqa: BLE001
        raise EvidenceRepositoryError("Failed to create evidence record") from exc


def create_uploaded_evidence_record(
    *,
    file_bytes: bytes,
    extension: str,
    base_url: str,
    farmer_id: str,
    todo_id: str = "",
    group_no: int | None = None,
    prj_id: str = "",
    project_id: str = "",
    activity_id: str = "",
    job_cd: str = "",
    parcel_no: str = "",
    field_id: str = "",
    activity_type: str,
    evidence_type: str,
    confirmed_label: str = "",
    status: str = "needs_review",
    user_message: str = "",
    gps_lat: float | None = None,
    gps_long: float | None = None,
) -> EvidenceRecord:
    """``POST /evidence/upload`` 의 본체 — 파일 저장 + 자동 분석 + 메타 INSERT.

    흐름:
      1) ``uploads/evidence/original/`` 에 원본 저장
      2) **품질 검사 (OpenCV/numpy): 블러·밝기·해상도** — 영수증·사진 둘 다
      3) **영수증 vs 현장사진 분류 + (영수증이면) OCR 필드 추출 (OpenAI Vision)**
      4) ``uploads/evidence/watermarked/`` 에 워터마크 버전 생성 (Pillow). 실패해도 원본
         경로로 image_url 폴백.
      5) DB 저장 (rdb 모드는 parent journal 자동 매칭/생성 + evidence INSERT).
         분석 결과(classification/image_quality/receipt_ocr)는 raw_json 에 보존.

    2)·3) 은 라이브러리/키가 없으면 안전하게 건너뛰며 업로드 자체를 막지 않습니다.
    """
    upload_now = datetime.now()
    # 핸드폰 카메라 EXIF DateTimeOriginal 우선 — 농가가 갤러리에서 1주 전 사진을 올려도
    # 실제 촬영 시각이 워터마크에 정확히 들어감. EXIF 없으면 업로드 시각 fallback.
    exif_captured = _extract_exif_captured_at(file_bytes)
    captured_at = exif_captured or upload_now
    now = upload_now  # created_at / updated_at 등은 그대로 서버 시각.
    # 필지 라벨 — 워터마크에 "필지: 1번" 또는 "필지: 4677031099-1-0108-0000" 표시.
    parcel_label = (parcel_no or "").strip()
    if parcel_label and not parcel_label.endswith("번"):
        try:
            parcel_label = f"{int(parcel_label)}번"
        except ValueError:
            pass  # parcel_regno 같은 긴 코드는 그대로 표시.
    if not parcel_label and field_id:
        parcel_label = field_id.strip()
    evidence_id = _create_evidence_id()
    safe_extension = extension if extension in ALLOWED_UPLOAD_EXTENSIONS else ".jpg"
    filename = f"{evidence_id}{safe_extension}"

    # Supabase Storage 키 활성 시 원격, 아니면 로컬 fs (점진 이행 — 키 없는 dev 환경 호환).
    from app.repositories import evidence_storage as _storage

    use_supabase = _storage.is_supabase_enabled()
    original_path: Path | None = None  # fs 모드에서만 사용
    if not use_supabase:
        EVIDENCE_UPLOAD_ORIGINAL_DIR.mkdir(parents=True, exist_ok=True)
        EVIDENCE_UPLOAD_WATERMARKED_DIR.mkdir(parents=True, exist_ok=True)
        original_path = EVIDENCE_UPLOAD_ORIGINAL_DIR / filename
        original_path.write_bytes(file_bytes)

    # --- 2) 품질 검사 (영수증·사진 공통) ---
    quality = check_image_quality(file_bytes)

    # --- 3) 영수증/사진 분류 + 영수증 OCR (OpenAI Vision) ---
    #    ai_service ↔ evidence_service 순환 import 회피를 위해 lazy import.
    classification = "unknown"
    receipt_ocr: dict = {}
    classify_result: dict = {}
    try:
        from app.services.ai_service import classify_and_extract_evidence

        classify_result = classify_and_extract_evidence(
            file_bytes=file_bytes,
            extension=safe_extension,
            activity_type=activity_type,
            expected_evidence_types=[evidence_type] if evidence_type else None,
        )
        classification = classify_result.get("classification", "unknown")
        if classification == "receipt":
            receipt_ocr = classify_result.get("receipt") or {}
    except Exception:  # noqa: BLE001
        # 분류 실패는 업로드를 막지 않음 — 기존 흐름 그대로 진행.
        classification = "unknown"
        classify_result = {}

    # --- 3c) 촬영 후 To-do 일치 판정 (사진류 + To-do 있을 때만). 실패해도 업로드 안 막음. ---
    #     라이브 폴링(코칭)은 관대한 안내, 여기가 진짜 O/X. 확신 낮으면 이장님 확인 유도.
    todo_match = ""
    todo_match_confidence = 0.0
    todo_match_reason = ""
    needs_chief_verification = False
    _ev_up = (evidence_type or "").upper()
    _is_doc = (
        classification == "receipt"
        or _ev_up.startswith("RCT")
        or _ev_up in ("EDU", "BIOCHAR_INVOICE")
    )
    _has_todo = bool((job_cd or "").strip()) or bool((activity_type or "").strip())
    if not _is_doc and _has_todo:
        try:
            from app.services.photo_guard_service import judge_todo_match

            verdict = judge_todo_match(
                file_bytes,
                content_type=("image/png" if safe_extension.lower() == ".png" else "image/jpeg"),
                job_cd=job_cd,
                job_name=activity_type,
                activity_name=activity_type,
                evidence_type=evidence_type,
                required_evidence_types=[evidence_type] if evidence_type else None,
            )
            todo_match = str(verdict.get("match") or "")
            todo_match_confidence = float(verdict.get("confidence") or 0.0)
            todo_match_reason = str(verdict.get("reason") or "")
            _thr = float(os.getenv("TODO_MATCH_CONF_THRESHOLD", "0.55") or "0.55")
            needs_chief_verification = (
                todo_match in ("UNCERTAIN", "X") or todo_match_confidence < _thr
            )
        except Exception:  # noqa: BLE001
            todo_match, todo_match_confidence, todo_match_reason = "", 0.0, ""
            needs_chief_verification = False

    # --- 3d) 영수증 vendor/items vs to-do job_cd 룰 매칭 ---
    #     judge_todo_match 은 영수증 대상 X (위 _is_doc 분기로 skip 됨). 그래서 룰로 보완.
    #     vendor 또는 items 에 그 작업에 기대되는 키워드가 없으면 needs_chief_verification = true.
    #     사용자가 잘못된 todo 에 영수증을 첨부한 케이스 (예: 농산품 영수증을 바이오차 todo 에) 잡음.
    if classification == "receipt" and receipt_ocr and (job_cd or "").strip():
        keywords = _RECEIPT_KEYWORDS_BY_JOB.get((job_cd or "").upper(), None)
        if keywords is not None and keywords:
            vendor_txt = str(receipt_ocr.get("vendor") or "")
            items_raw = receipt_ocr.get("items") or []
            items_txt = (
                " ".join(str(x) for x in items_raw) if isinstance(items_raw, list) else str(items_raw)
            )
            haystack = f"{vendor_txt} {items_txt}".lower()
            if not any(kw.lower() in haystack for kw in keywords):
                needs_chief_verification = True
                if not todo_match_reason:
                    todo_match_reason = (
                        f"영수증에 '{', '.join(keywords[:3])}' 관련 내용이 보이지 않습니다."
                    )

    # --- 3b) GPS → 대략적 주소 역지오코딩 (무료 Nominatim, 실패해도 무시) ---
    address = ""
    if gps_lat is not None and gps_long is not None and (gps_lat or gps_long):
        try:
            from app.services.geocode_service import reverse_geocode

            address = reverse_geocode(gps_lat, gps_long)
        except Exception:  # noqa: BLE001
            address = ""

    # 1) 원본 위치/URL 결정
    if use_supabase:
        original_key = f"original/{filename}"
        try:
            result = _storage.upload_bytes(key=original_key, data=file_bytes)
            original_image_path = result["public_url"]  # full URL — evidence_rdb 가 그대로 image_url 로 노출
        except Exception:  # noqa: BLE001 — 업로드 실패 시 후속 흐름 위해 빈 path
            original_image_path = ""
    else:
        # original_path 는 fs 모드에서만 있음 (위 블록 보장)
        assert original_path is not None
        original_image_path = _relative_upload_path(original_path)
    storage_path = original_image_path
    image_url = original_image_path if use_supabase else _build_upload_url(base_url, storage_path)

    # 워터마크에는 로그인ID(ys.kim) 대신 실제 이름(김영수) 을 표시.
    farmer_name = _resolve_farmer_display_name(farmer_id)

    try:
        if use_supabase:
            # 메모리 buffer 에 합성 → Supabase 업로드
            buffer = BytesIO()
            _save_watermarked_image(
                original_bytes=file_bytes,
                output_path=buffer,
                extension=safe_extension,
                farmer_name=farmer_name,
                activity_type=activity_type,
                activity_id=activity_id,
                evidence_type=evidence_type,
                captured_at=captured_at,
                gps_lat=gps_lat,
                gps_long=gps_long,
                address=address,
                parcel_label=parcel_label,
            )
            wm_key = f"watermarked/{filename}"
            wm_result = _storage.upload_bytes(key=wm_key, data=buffer.getvalue())
            storage_path = wm_result["public_url"]
            image_url = wm_result["public_url"]
        else:
            watermarked_path = EVIDENCE_UPLOAD_WATERMARKED_DIR / filename
            _save_watermarked_image(
                original_bytes=file_bytes,
                output_path=watermarked_path,
                extension=safe_extension,
                farmer_name=farmer_name,
                activity_type=activity_type,
                activity_id=activity_id,
                evidence_type=evidence_type,
                captured_at=captured_at,
                gps_lat=gps_lat,
                gps_long=gps_long,
                address=address,
                parcel_label=parcel_label,
            )
            storage_path = _relative_upload_path(watermarked_path)
            image_url = _build_upload_url(base_url, storage_path)
    except WatermarkGenerationError:
        # 워터마크 실패 시 원본으로 폴백 (Supabase/fs 양쪽 동일)
        storage_path = original_image_path
        image_url = original_image_path if use_supabase else _build_upload_url(base_url, storage_path)

    message = user_message or "사진 증빙이 업로드되었습니다."
    # 품질이 낮으면 안내 문구를 덧붙임 (업로드는 막지 않고 참고만).
    if not quality.get("passed", True):
        warn = quality_message(quality)
        if warn:
            message = f"{message} (참고: {warn})"

    record = EvidenceRecord(
        evidence_id=evidence_id,
        todo_id=todo_id,
        group_no=group_no,
        prj_id=prj_id,
        # TODO: project_id는 현재 프론트 호환용이며, 추후 prj_id 중심으로 정리 필요.
        project_id=project_id,
        activity_id=activity_id,
        job_cd=job_cd,
        farmer_id=farmer_id,
        parcel_no=parcel_no,
        field_id=field_id,
        activity_type=activity_type,
        evidence_type=evidence_type,
        confirmed_label=confirmed_label or evidence_type,
        image_url=image_url,
        storage_path=storage_path,
        original_image_path=original_image_path,
        captured_at=captured_at,
        status=status,
        user_message=message,
        # 자동 분석 결과 — 화면이 "영수증으로 인식됨 + 추출 내용" 을 보여주고 사용자가 확정.
        # AI 는 후보만 제시하며 evidence_type 을 자동 확정하지 않음.
        classification=classification,
        image_quality=quality,
        receipt_ocr=receipt_ocr,
        # 영수증 OCR → 활동 추천 (rule-based). 매칭 없거나 영수증 아니면 모두 빈 값.
        # 모두 optional 필드라 backwards-compatible — 예전 응답을 쓰는 클라이언트도 안 깨짐.
        suggested_activity_type=str(classify_result.get("suggested_activity_type") or ""),
        suggested_activity_label=str(classify_result.get("suggested_activity_label") or ""),
        suggested_evidence_type=str(classify_result.get("suggested_evidence_type") or ""),
        suggested_reason=str(classify_result.get("suggested_reason") or ""),
        suggested_confidence=float(classify_result.get("suggested_confidence") or 0.0),
        # 촬영 후 To-do 일치 판정 (gemini-2.5-flash). 사진류 + To-do 있을 때만 채워짐.
        todo_match=todo_match,
        todo_match_confidence=todo_match_confidence,
        todo_match_reason=todo_match_reason,
        needs_chief_verification=needs_chief_verification,
        # GPS 좌표 + 역지오코딩 주소 (없으면 None/"" → DB 는 0.0 으로 보관)
        gps_lat=gps_lat,
        gps_long=gps_long,
        address=address,
        created_at=now,
        updated_at=now,
    )
    try:
        saved = _save_record(record)
        # 같은 농가 + 같은 필지의 옛 retake_required evidence 들을 자동 정리.
        # 농가가 재촬영해서 새 사진 올리면 이장님이 요청했던 옛 알림이 자동으로 사라짐.
        # 실패해도 새 evidence 저장 자체엔 영향 없음 (silent).
        if _storage_mode() == "rdb" and parcel_no:
            try:
                from app.repositories.evidence_rdb import close_pending_retakes
                from app.repositories.identity_rdb import resolve_amo_regno
                amo_regno = resolve_amo_regno(farmer_id)
                if amo_regno:
                    close_pending_retakes(
                        amo_regno=amo_regno,
                        parcel_no=parcel_no,
                        exclude_evidence_id=evidence_id,
                    )
            except Exception:  # noqa: BLE001 — cleanup 실패는 silent
                pass
        return EvidenceRecord.model_validate(saved)
    except EvidenceMySQLConflictError:
        raise
    except ValueError as exc:
        # 신원/필지 등 입력 데이터 문제 (예: 신 스키마에 없는 farmer_id).
        # 사유를 그대로 전달해 화면이 "왜 실패했는지" 보여줄 수 있게 한다.
        raise EvidenceInputError(str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        # 예상 못한 오류는 원인을 메시지에 포함해 진단 가능하게 한다.
        raise EvidenceRepositoryError(f"증빙 저장에 실패했습니다: {exc}") from exc


def update_evidence_record(evidence_id: str, payload: EvidenceUpdate) -> EvidenceRecord | None:
    """이장님 검토 PATCH — status / confirmed_label / user_message 만 부분 수정.

    payload 의 ``None`` 필드는 무시 (기존값 유지). 매칭 없으면 None → 라우터 404.
    status 가 'retake_required' 로 바뀌면 해당 농가에게 notification 1건 자동 INSERT.
    """
    try:
        existing = get_evidence_record(evidence_id)
        if not existing:
            return None

        updates = payload.model_dump(exclude_unset=True, exclude_none=True)
        prev_status = (existing.status or "").strip()
        new_status = (updates.get("status") or prev_status).strip()
        user_message = updates.get("user_message") or existing.user_message or ""

        merged = existing.model_dump()
        merged.update(updates)
        merged["updated_at"] = datetime.now()
        record = EvidenceRecord.model_validate(merged)
        saved = _update_record(record)
        result = EvidenceRecord.model_validate(saved) if saved else None

        # 재촬영 요청 자동 알림 — confirmed → retake 또는 needs_review → retake 전이 시 1건 INSERT.
        if (
            result is not None
            and new_status == "retake_required"
            and prev_status != "retake_required"
        ):
            _try_notify_retake(record=result, user_message=user_message)

        return result
    except Exception as exc:  # noqa: BLE001
        raise EvidenceRepositoryError("Failed to update evidence record") from exc


def _try_notify_retake(*, record: EvidenceRecord, user_message: str) -> None:
    """재촬영 요청을 notification 테이블에 기록. 실패는 무시 (PATCH 자체는 성공)."""
    try:
        from app.repositories.identity_rdb import resolve_user_no
        from app.repositories.notification_rdb import insert_notification

        farmer_id = (record.farmer_id or "").strip()
        if not farmer_id:
            return
        user_no = resolve_user_no(farmer_id)
        if user_no is None:
            return

        body = (user_message or "").strip() or "사진을 다시 한 번 찍어 올려주세요."
        insert_notification(
            user_no=user_no,
            sender_cd="C",  # Chief
            content_cd="RETAKE",
            title="이장님이 사진을 다시 찍어 달라고 했어요",
            content=body[:500],
            action_url=f"/journal/{record.evidence_id}" if record.evidence_id else None,
            related_no=None,
            reg_no=None,
        )
    except Exception:  # noqa: BLE001
        # 알림 실패가 evidence PATCH 자체를 막지 않도록 swallow.
        pass


def get_evidence_missing_status(
    *,
    activity_type: str,
    farmer_id: str | None = None,
    field_id: str | None = None,
    parcel_no: str | None = None,
    project_id: str | None = None,
    prj_id: str | None = None,
) -> dict[str, object]:
    """``GET /evidence/missing`` — 활동 유형 + 농가/필지 컨텍스트의 누락 증빙 계산.

    응답에는 required/submitted/missing 종류 리스트 + 갯수 + completion_status
    (NOT_STARTED/IN_PROGRESS/COMPLETED/UNKNOWN_ACTIVITY) + 친근한 안내 메시지 포함.
    """
    required_evidence_types = get_required_evidence_types(activity_type)

    if not required_evidence_types:
        return {
            "activity_type": activity_type,
            "required_evidence_types": [],
            "submitted_evidence_types": [],
            "missing_evidence_types": [],
            "required_evidence_count": 0,
            "submitted_evidence_count": 0,
            "completion_status": "UNKNOWN_ACTIVITY",
            "user_message": "활동 유형을 확인해 주세요.",
        }

    records = list_evidence_records_filtered(
        farmer_id=farmer_id,
        activity_type=activity_type,
        field_id=field_id,
        parcel_no=parcel_no,
        project_id=project_id,
        prj_id=prj_id,
    )
    submitted_evidence_types: list[str] = []
    for record in records:
        normalized = _normalize_submitted_evidence_type(record)
        if normalized and normalized not in submitted_evidence_types:
            submitted_evidence_types.append(normalized)

    missing_evidence_types = [
        evidence_type for evidence_type in required_evidence_types
        if evidence_type not in submitted_evidence_types
    ]
    submitted_evidence_count = len(submitted_evidence_types)
    required_evidence_count = len(required_evidence_types)

    if submitted_evidence_count == 0:
        completion_status = "NOT_STARTED"
        user_message = "아직 제출한 증빙이 없습니다."
    elif missing_evidence_types:
        completion_status = "IN_PROGRESS"
        missing_text = ", ".join(display_evidence_type(item) for item in missing_evidence_types)
        user_message = f"남은 증빙: {missing_text}"
    else:
        completion_status = "COMPLETED"
        user_message = "필요한 증빙이 모두 제출되었습니다."

    return {
        "activity_type": activity_type,
        "required_evidence_types": required_evidence_types,
        "submitted_evidence_types": submitted_evidence_types,
        "missing_evidence_types": missing_evidence_types,
        "required_evidence_count": required_evidence_count,
        "submitted_evidence_count": submitted_evidence_count,
        "completion_status": completion_status,
        "user_message": user_message,
    }
