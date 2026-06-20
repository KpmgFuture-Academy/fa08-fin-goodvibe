"""신 스키마 기반 증빙(`evidence`) repository.

조회: `evidence` 테이블 + `amo_family` + `user_master` + `prj_journal` + `journal` + `parcel` JOIN.
   (view 도 있지만 view 는 journal 단위로 GROUP_CONCAT 한 결과라 evidence 행 단위 조회에는 부적합)

기존 호출처 호환을 위해 다음 이름들은 그대로 유지합니다:
  - EvidenceMySQLConflictError
  - _parse_raw_json / _build_raw_json
  - _normalize_datetime / _normalize_decimal / _fit_text / _to_evid_cd
  - list_evidence_mysql / get_evidence_by_id_mysql
  - create_evidence_mysql / update_evidence_mysql  (Step 5 에서 재작성. 지금은 NotImplementedError.)
"""
from __future__ import annotations

import json
from datetime import date, datetime
from typing import Any

from locaville.dbcom import DBExecutionError, execute, fetch_all, fetch_one, transaction

from app.repositories.identity_rdb import (
    resolve_amo_regno,
    resolve_group_nos_for_amo,
    resolve_parcel_no_int,
    resolve_user_no,
    resolve_user_record,
    next_seq_no,
)


class EvidenceMySQLConflictError(Exception):
    pass


# ============================================================
# 기존 호출처가 import 하던 헬퍼들 — 호환 유지
# ============================================================

def _parse_raw_json(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str) and value.strip():
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            return {}
    return {}


def _fit_text(value: Any, max_len: int) -> str:
    text = str(value or "").strip()
    return text[:max_len]


def _try_fix_mojibake(value: Any) -> Any:
    """문자열이 한국어 mojibake (CP949/EUC-KR 또는 UTF-8 바이트가 Latin-1 로 잘못 decode) 면 복구.
    안전: 복구 결과에 한글이 등장하지 않으면 원본 유지.

    예: '³í¹°°ü¸®' (CP949 으로 인코딩된 '논물관리' 가 Latin-1 로 decode 됨) → '논물관리'
    """
    if not isinstance(value, str) or not value:
        return value
    if any("가" <= c <= "힣" for c in value):
        return value  # 이미 정상
    if not any(0x80 <= ord(c) <= 0xFF for c in value):
        return value  # 8-bit 문자 없음 → mojibake 아님
    try:
        raw = value.encode("latin-1")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return value
    # 후보 인코딩 둘 다 시도 (CP949 우선 — 한국어 환경 잦은 케이스)
    for enc in ("cp949", "utf-8"):
        try:
            repaired = raw.decode(enc)
        except (UnicodeDecodeError, UnicodeError):
            continue
        if any("가" <= c <= "힣" for c in repaired):
            return repaired
    return value


def _normalize_datetime(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value
    if isinstance(value, date):
        return datetime.combine(value, datetime.min.time())
    if isinstance(value, str) and value.strip():
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return datetime.now()
    return datetime.now()


def _normalize_decimal(value: Any, default: float = 0.0) -> float:
    try:
        if value in {"", None}:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _to_evid_cd(value: Any) -> str:
    """입력 evidence_type 을 evid_cd (VARCHAR 8) 로 매핑.

    신 스키마는 code_detail.grp_cd='EVIDENCE' 의 값 (PIC1/PIC2/PIC3/RCT/RCT1..RCT5/EQP/DST/OTH 등)
    을 기대합니다. 호출 측이 'BIOCHAR_BAG' 같은 활동 의미 코드를 보내면 PIC1 으로 매핑하고,
    영수증 의미면 RCT5 로 매핑합니다.
    """
    raw = (str(value or "")).strip().upper()
    if not raw:
        return "OTH"
    # 이미 카테고리 코드면 그대로
    if raw in {"PIC", "PIC1", "PIC2", "PIC3", "RCT", "RCT1", "RCT2", "RCT3", "RCT4", "RCT5",
               "EQP", "DST", "OTH"}:
        return raw[:8]
    if "INVOICE" in raw or "RECEIPT" in raw:
        return "RCT5"
    if "BEFORE" in raw or "START" in raw:
        return "PIC2"  # 작업 전
    if "AFTER" in raw or "END" in raw:
        return "PIC1"  # 작업 완료
    if "BAG" in raw or "SPREADING" in raw or "FIELD" in raw or "DRY" in raw or "COLLECTION" in raw or "TILLAGE" in raw or "DRAINAGE" in raw:
        return "PIC1"
    return "OTH"


def _build_raw_json(record: dict[str, Any]) -> dict[str, Any]:
    """evidence.raw_json 에 보관할 API 사이드 메타데이터."""
    return {
        "api_evidence_id": record.get("evidence_id", ""),
        "evidence_id": record.get("evidence_id", ""),
        "todo_id": record.get("todo_id", ""),
        "project_id": record.get("project_id", ""),
        "prj_id": record.get("prj_id", ""),
        "activity_id": record.get("activity_id", ""),
        "field_id": record.get("field_id", ""),
        "parcel_no": record.get("parcel_no", ""),
        "parcel_regno": record.get("parcel_regno", ""),
        "activity_type": record.get("activity_type", ""),
        "evidence_type": record.get("evidence_type", ""),
        "status": record.get("status", "needs_review"),
        "user_message": record.get("user_message", ""),
        "image_url": record.get("image_url", ""),
        "storage_path": record.get("storage_path", ""),
        "original_image_path": record.get("original_image_path", ""),
        # 사진 업로드 자동 분석 결과 (영수증/사진 분류 + 품질검사 + 영수증 OCR)
        "classification": record.get("classification", ""),
        "image_quality": record.get("image_quality", {}) or {},
        "receipt_ocr": record.get("receipt_ocr", {}) or {},
        # 영수증 OCR → 활동 추천 (rule-based). 매칭 없거나 영수증 아니면 모두 빈 값.
        "suggested_activity_type": record.get("suggested_activity_type", "") or "",
        "suggested_activity_label": record.get("suggested_activity_label", "") or "",
        "suggested_evidence_type": record.get("suggested_evidence_type", "") or "",
        "suggested_reason": record.get("suggested_reason", "") or "",
        "suggested_confidence": float(record.get("suggested_confidence") or 0.0),
        # GPS 역지오코딩 주소 (좌표 자체는 evidence.gps_lat/gps_long 컬럼에 저장)
        "address": record.get("address", "") or "",
        # 촬영 후 To-do 일치 판정 (사진류 + To-do 있을 때만 채워짐)
        "todo_match": record.get("todo_match", "") or "",
        "todo_match_confidence": float(record.get("todo_match_confidence") or 0.0),
        "todo_match_reason": record.get("todo_match_reason", "") or "",
        "needs_chief_verification": bool(record.get("needs_chief_verification") or False),
    }


# ============================================================
# evidence_id 합성/파싱
# ============================================================
#  형식: {user_no}-{yyyymmdd}-{exec_no}-{seq_no}
#  예) "1000000101-20260521-1-1"

def _compose_evidence_id(
    user_no: int | None,
    job_date: Any,
    exec_no: int | None,
    seq_no: int | None,
) -> str:
    """evidence 의 4중키를 `{user_no}-{yyyymmdd}-{exec_no}-{seq_no}` 문자열로 합성."""
    if user_no is None or job_date is None or exec_no is None or seq_no is None:
        return ""
    if hasattr(job_date, "strftime"):
        d = job_date.strftime("%Y%m%d")
    else:
        d = str(job_date).replace("-", "")
    return f"{user_no}-{d}-{exec_no}-{seq_no}"


def _parse_evidence_id(evidence_id: str) -> tuple[int, str, int, int] | None:
    """`{user_no}-{yyyymmdd}-{exec_no}-{seq_no}` 문자열을 4-tuple 로 파싱.

    형식 불일치(구 UUID hex 형태 포함) 시 None. 호출 측은 404 로 매핑.
    """
    if not evidence_id:
        return None
    parts = evidence_id.split("-")
    if len(parts) < 4:
        return None
    try:
        user_no = int(parts[0])
        ymd = parts[1]
        exec_no = int(parts[2])
        seq_no = int(parts[3])
    except ValueError:
        return None
    if len(ymd) != 8 or not ymd.isdigit():
        return None
    job_date = f"{ymd[0:4]}-{ymd[4:6]}-{ymd[6:8]}"
    return (user_no, job_date, exec_no, seq_no)


# ============================================================
# row → EvidenceRecord 호환 dict
# ============================================================

def _map_row_to_evidence(row: dict[str, Any]) -> dict[str, Any]:
    """`evidence` 행 (+ JOIN 컬럼들) → EvidenceRecord 호환 dict."""
    extra = _parse_raw_json(row.get("raw_json"))
    user_no = row.get("user_no")
    job_date = row.get("job_date")
    exec_no = row.get("exec_no")
    seq_no = row.get("seq_no")
    amo_regno = row.get("amo_regno") or ""
    amo_name = row.get("amo_name") or ""
    user_name = row.get("user_name") or ""

    # JOIN 으로 가져온 사업/필지 정보 (prj_journal + journal + parcel)
    prj_id = row.get("prj_id") or extra.get("prj_id") or ""
    activity_id = row.get("activity_id") or extra.get("activity_id") or ""
    job_cd = row.get("job_cd") or extra.get("job_cd") or ""
    job_seq = row.get("job_seq")
    # evidence 테이블에는 parcel_no 컬럼이 없음 → JOIN(=row) 에서도 None.
    # 업로드 시 raw_json.parcel_no 에 저장되므로 그 값을 우선 사용 (없으면 row → "").
    parcel_no_int = row.get("parcel_no") or extra.get("parcel_no") or None
    parcel_regno = row.get("parcel_regno") or extra.get("parcel_regno") or ""

    captured_at = row.get("capture_dt") or row.get("reg_dt") or datetime.now()
    file_path = row.get("file_path") or ""

    # image_url 정책:
    #   - raw_json.image_url 이 있으면 그대로 (업로드 시 채워진 절대 URL)
    #   - 없으면 file_path 가 backend uploads(/uploads/...) 또는 http(s) 절대 URL 일 때만 노출
    #   - 시드의 `/sample/...` 같은 더미 경로는 image_url 비움 — frontend 가 placeholder 처리
    raw_image_url = extra.get("image_url", "") or ""
    if raw_image_url:
        image_url = raw_image_url
    elif file_path.startswith(("/uploads/", "http://", "https://")):
        image_url = file_path
    elif file_path.startswith("uploads/"):
        image_url = "/" + file_path
    else:
        image_url = ""

    return {
        # 식별자
        "evidence_id": _compose_evidence_id(user_no, job_date, exec_no, seq_no),
        "todo_id": extra.get("todo_id", ""),
        "group_no": int(row.get("group_no") or 0) or None,
        "prj_id": prj_id,
        "project_id": prj_id,
        "activity_id": activity_id,
        "job_cd": job_cd,
        # 농가
        "farmer_id": amo_regno,
        "farmer_name": amo_name or user_name,
        # 필지
        "parcel_no": str(parcel_no_int) if parcel_no_int is not None else "",
        "parcel_regno": parcel_regno,
        "field_id": parcel_regno or (str(parcel_no_int) if parcel_no_int is not None else ""),
        # 활동/증빙 — 한국어 mojibake (UTF-8 → Latin-1 잘못 decode) 자동 복구.
        "activity_type": _try_fix_mojibake(extra.get("activity_type", "")) or row.get("ai_label") or "",
        "evidence_type": extra.get("evidence_type", "") or row.get("evid_cd") or "",
        "confirmed_label": row.get("ai_label") or extra.get("evidence_type", ""),
        # 이미지/경로 — image_url 은 위 정책 적용. file_path/storage_path 는 원본 보존.
        "image_url": image_url,
        "storage_path": extra.get("storage_path", "") or file_path,
        "original_image_path": extra.get("original_image_path", "") or file_path,
        # 시각/상태
        "captured_at": _normalize_datetime(captured_at),
        "status": extra.get("status", "needs_review"),
        "user_message": extra.get("user_message", ""),
        # 자동 분석 결과 복원
        "classification": extra.get("classification", ""),
        "image_quality": extra.get("image_quality", {}) or {},
        "receipt_ocr": extra.get("receipt_ocr", {}) or {},
        # 영수증 → 활동 추천 결과 복원 (raw_json 에서)
        "suggested_activity_type": extra.get("suggested_activity_type", "") or "",
        "suggested_activity_label": extra.get("suggested_activity_label", "") or "",
        "suggested_evidence_type": extra.get("suggested_evidence_type", "") or "",
        "suggested_reason": extra.get("suggested_reason", "") or "",
        "suggested_confidence": float(extra.get("suggested_confidence") or 0.0),
        # GPS 좌표(컬럼) + 주소(raw_json) 복원
        "gps_lat": float(row.get("gps_lat")) if row.get("gps_lat") is not None else None,
        "gps_long": float(row.get("gps_long")) if row.get("gps_long") is not None else None,
        "address": extra.get("address", ""),
        # 촬영 후 To-do 일치 판정 복원
        "todo_match": extra.get("todo_match", "") or "",
        "todo_match_confidence": float(extra.get("todo_match_confidence") or 0.0),
        "todo_match_reason": extra.get("todo_match_reason", "") or "",
        "needs_chief_verification": bool(extra.get("needs_chief_verification") or False),
        "created_at": row.get("reg_dt") or datetime.now(),
        "updated_at": row.get("mod_dt") or row.get("reg_dt") or datetime.now(),
        # 신 스키마 optional
        "user_no": user_no,
        "user_name": user_name,
        "amo_regno": amo_regno,
        "amo_name": amo_name,
        "exec_no": exec_no,
        "seq_no": seq_no,
        "job_seq": job_seq,
        "evid_cd": row.get("evid_cd") or "",
    }


# ============================================================
# SQL 조립 — evidence + JOIN
# ============================================================

_BASE_SELECT = """
    SELECT
        e.group_no,
        e.amo_regno,
        e.user_no,
        e.seq_no,
        e.job_date,
        e.exec_no,
        e.gps_lat,
        e.gps_long,
        e.capture_dt,
        e.ai_label,
        e.evid_cd,
        e.file_path,
        e.raw_json,
        e.reg_dt,
        e.mod_dt,
        af.amo_name,
        um.user_name,
        pj.prj_id,
        pj.activity_id,
        pj.job_cd,
        pj.job_seq,
        j.parcel_no,
        p.parcel_regno
    FROM evidence e
    LEFT JOIN amo_family af ON af.amo_regno = e.amo_regno
    LEFT JOIN user_master um ON um.user_no = e.user_no
    LEFT JOIN prj_journal pj
        ON pj.user_no = e.user_no
       AND pj.job_date = e.job_date
       AND pj.exec_no = e.exec_no
    LEFT JOIN journal j
        ON j.user_no = e.user_no
       AND j.job_date = e.job_date
       AND j.exec_no = e.exec_no
    LEFT JOIN parcel p
        ON p.amo_regno = j.amo_regno
       AND p.parcel_no = j.parcel_no
"""


# ============================================================
# 조회 함수
# ============================================================

def list_evidence_mysql(
    *,
    farmer_id: str | None = None,
    status: str | None = None,
    evidence_type: str | None = None,
    confirmed_label: str | None = None,
    activity_type: str | None = None,
    activity_id: str | None = None,
    job_cd: str | None = None,
    group_no: int | None = None,
    field_id: str | None = None,
    parcel_no: str | None = None,
    project_id: str | None = None,
    prj_id: str | None = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    """evidence 목록 조회. JSON repo 와 같은 시그니처. 마을/접두사 필터 없음 — 호출 측이 좁힘.

    이장님이 soft-delete 한 증빙은 항상 숨김 (deleted_dt IS NULL).
    """
    where: list[str] = ["e.deleted_dt IS NULL"]
    params: list[Any] = []
    if group_no is not None:
        where.append("e.group_no = %s")
        params.append(int(group_no))

    if farmer_id:
        amo = resolve_amo_regno(farmer_id)
        uno = resolve_user_no(farmer_id) if not amo else None
        if amo:
            where.append("e.amo_regno = %s")
            params.append(amo)
        elif uno is not None:
            where.append("e.user_no = %s")
            params.append(uno)
        else:
            return []
    if activity_id:
        where.append("pj.activity_id = %s")
        params.append(activity_id)
    if job_cd:
        where.append("pj.job_cd = %s")
        params.append(job_cd)
    effective_prj_id = prj_id or project_id
    if effective_prj_id:
        where.append("pj.prj_id = %s")
        params.append(effective_prj_id)
    if confirmed_label:
        where.append("e.ai_label = %s")
        params.append(confirmed_label)
    if parcel_no:
        # 숫자면 INT 비교, 아니면 parcel_regno 비교
        s = str(parcel_no).strip()
        if s.lstrip("-").isdigit():
            where.append("j.parcel_no = %s")
            params.append(int(s))
        else:
            where.append("p.parcel_regno = %s")
            params.append(s)
    if field_id and not parcel_no:
        s = str(field_id).strip()
        if s.lstrip("-").isdigit():
            where.append("j.parcel_no = %s")
            params.append(int(s))
        else:
            where.append("p.parcel_regno = %s")
            params.append(s)

    sql = _BASE_SELECT + ((" WHERE " + " AND ".join(where)) if where else "")
    sql += " ORDER BY e.reg_dt DESC, e.job_date DESC, e.exec_no DESC, e.seq_no DESC"
    sql += " LIMIT %s"
    params.append(max(1, min(limit, 200)))

    try:
        rows = fetch_all(sql, params)
        items = [_map_row_to_evidence(r) for r in rows]
        if evidence_type:
            items = [item for item in items if (item.get("evidence_type") or "") == evidence_type]
        if status:
            items = [item for item in items if (item.get("status") or "") == status]
        if activity_type:
            items = [item for item in items if (item.get("activity_type") or "") == activity_type]
        return items
    except Exception:
        return []


def get_evidence_by_id_mysql(evidence_id: str) -> dict[str, Any] | None:
    """4-part evidence_id 로 단건 조회. 매칭 행이 없으면 None (호출 측은 404 처리)."""
    parsed = _parse_evidence_id(evidence_id)
    if not parsed:
        return None
    user_no, job_date, exec_no, seq_no = parsed
    sql = (
        _BASE_SELECT
        + " WHERE e.user_no = %s AND e.job_date = %s AND e.exec_no = %s AND e.seq_no = %s"
        + " LIMIT 1"
    )
    try:
        row = fetch_one(sql, [user_no, job_date, exec_no, seq_no])
        return _map_row_to_evidence(row) if row else None
    except Exception:
        return None


def count_evidence_since(since_dt: datetime | None) -> int:
    """이장님 사이드바 배지용 — since_dt 이후 등록된 (삭제 안 된) 증빙 개수.

    since_dt 가 None 이면 0 반환.
    """
    if since_dt is None:
        return 0
    sql = """
        SELECT COUNT(*) AS cnt
        FROM evidence
        WHERE deleted_dt IS NULL
          AND reg_dt > %s
    """
    rows = fetch_all(sql, [since_dt])
    if not rows:
        return 0
    return int(rows[0].get("cnt") or 0)


def fetch_recent_originals(limit: int = 6) -> list[dict[str, Any]]:
    """대시보드 갤러리용 — 최근 등록된 evidence N건, **원본(워터마크 없음) 경로** 위주.

    반환 row 의 dict 필드:
      - evidence_id (str)
      - amo_regno (str), farmer_name (str)
      - job_cd (str), job_name (str)
      - prj_id (str), prj_name (str)
      - activity_id (str), activity_name (str)
      - biz_name (str)
      - reg_dt (datetime)
      - original_path (str)   -- raw_json.original_image_path > 없으면 raw_json.image_url
    image_url 컬럼은 워터마크 적용본일 수 있어 우선순위 X.

    prj_journal/farm_job/prj_activity/project/program_master JOIN 으로 한글 라벨까지
    한 번에 가져옴 — 처리함의 자연어 제목("중간 물떼기 확인이 필요해요") 표시용.
    """
    sql = """
        SELECT e.user_no, e.amo_regno, e.job_date, e.exec_no, e.seq_no,
               e.file_path, e.raw_json, e.reg_dt,
               u.user_name AS farmer_name,
               pj.prj_id, pj.activity_id, pj.job_cd,
               fj.job_name,
               pa.activity_name,
               p.prj_name,
               pm.biz_name
        FROM evidence e
        LEFT JOIN farmer f ON f.amo_regno = e.amo_regno
        LEFT JOIN user_master u ON u.user_no = f.user_no
        LEFT JOIN prj_journal pj
            ON pj.user_no = e.user_no
           AND pj.job_date = e.job_date
           AND pj.exec_no = e.exec_no
        LEFT JOIN farm_job fj
            ON fj.job_cd = pj.job_cd
        LEFT JOIN prj_activity pa
            ON pa.prj_id = pj.prj_id
           AND pa.activity_id = pj.activity_id
        LEFT JOIN project p
            ON p.prj_id = pj.prj_id
        LEFT JOIN program_master pm
            ON pm.biz_id = p.biz_id
        WHERE e.deleted_dt IS NULL
        ORDER BY e.reg_dt DESC
        LIMIT %s
    """
    rows = fetch_all(sql, [limit])
    out: list[dict[str, Any]] = []
    for row in rows or []:
        extra = _parse_raw_json(row.get("raw_json"))
        # 원본 우선순위: raw_json.original_image_path > raw_json.image_url > file_path
        original = (extra.get("original_image_path") or "").strip()
        if not original:
            original = (extra.get("image_url") or "").strip()
        if not original:
            original = (row.get("file_path") or "").strip()
        # JOIN 값이 비면 raw_json 폴백.
        job_cd = str(row.get("job_cd") or extra.get("job_cd") or "")
        prj_id = str(row.get("prj_id") or extra.get("prj_id") or "")
        activity_id = str(row.get("activity_id") or extra.get("activity_id") or "")
        out.append({
            "evidence_id": _compose_evidence_id(
                row.get("user_no"), row.get("job_date"), row.get("exec_no"), row.get("seq_no")
            ),
            "amo_regno": str(row.get("amo_regno") or ""),
            "farmer_name": str(row.get("farmer_name") or ""),
            "job_cd": job_cd,
            "job_name": str(row.get("job_name") or ""),
            "prj_id": prj_id,
            "prj_name": str(row.get("prj_name") or ""),
            "activity_id": activity_id,
            "activity_name": str(row.get("activity_name") or ""),
            "biz_name": str(row.get("biz_name") or ""),
            "reg_dt": row.get("reg_dt"),
            "original_path": original,
            # 촬영 후 To-do 일치 판정 — 이장님 처리함 "AI 확신 낮음" 뱃지용.
            "needs_chief_verification": bool(extra.get("needs_chief_verification") or False),
            "todo_match_reason": str(extra.get("todo_match_reason") or ""),
            # 영수증 OCR 결과 — 이장님이 영수증 내용을 즉시 검증할 수 있게 (vendor/amount/items/date).
            # 영수증이 아니면 빈 dict. evidence.raw_json.receipt_ocr 그대로 흘림.
            "receipt_ocr": extra.get("receipt_ocr") or {},
        })
    return out


def soft_delete_evidence_mysql(evidence_id: str) -> bool:
    """이장님 검토 결과 잘못된 증빙 사진을 숨김 처리. evidence.deleted_dt = NOW().

    S3 객체는 그대로 유지 — 추후 cleanup job 으로 정리 예정.
    반환: 1건 이상 UPDATE 되면 True.
    """
    parsed = _parse_evidence_id(evidence_id)
    if not parsed:
        return False
    user_no, job_date, exec_no, seq_no = parsed
    sql = """
        UPDATE evidence
           SET deleted_dt = %s
         WHERE user_no = %s
           AND job_date = %s
           AND exec_no = %s
           AND seq_no = %s
           AND deleted_dt IS NULL
    """
    affected = execute(sql, [datetime.now(), user_no, job_date, exec_no, seq_no])
    return bool(affected)


def close_pending_retakes(
    *,
    amo_regno: str,
    parcel_no: str,
    exclude_evidence_id: str = "",
) -> int:
    """같은 농가(`amo_regno`) + 같은 필지(`parcel_no`) 의 retake_required evidence 들을
    'superseded' 로 자동 정리.

    농가가 같은 필지에 새 사진을 올리면 이장님이 요청한 옛 재촬영 알림은 자동 사라짐.
    raw_json.status 만 갱신 (다른 컬럼은 손대지 않음). evidence 의 status 컬럼이 raw_json
    안에 있어 postgres jsonb_set 사용.

    `exclude_evidence_id` 가 주어지면 그 evidence (방금 막 INSERT 한 것) 는 정리 대상에서 제외.

    매칭 조건:
      - raw_json.parcel_no == parcel_no (문자열 일치)
      - raw_json.status == 'retake_required'
      - amo_regno 일치
      - 자기 자신 제외 (raw_json.api_evidence_id != exclude)
      - deleted_dt IS NULL (이미 삭제된 row 는 손대지 않음)

    Returns: 갱신된 row 수.
    """
    if not amo_regno or not parcel_no:
        return 0
    sql = """
        UPDATE evidence
        SET raw_json = jsonb_set(raw_json, '{status}', '"superseded"'),
            mod_dt = %s
        WHERE amo_regno = %s
          AND deleted_dt IS NULL
          AND raw_json ->> 'status' = 'retake_required'
          AND raw_json ->> 'parcel_no' = %s
          AND (%s = '' OR (raw_json ->> 'api_evidence_id') != %s)
    """
    affected = execute(
        sql,
        [datetime.now(), amo_regno, str(parcel_no), exclude_evidence_id, exclude_evidence_id],
    )
    return int(affected or 0)


# ============================================================
# 저장 — 신 스키마 INSERT
# ============================================================

def _normalize_job_date_str(value: Any) -> str:
    if value is None:
        return ""
    if hasattr(value, "isoformat"):
        s = value.isoformat()
    else:
        s = str(value).strip()
    if "T" in s:
        s = s.split("T", 1)[0]
    return s[:10]


def _find_latest_journal_exec_no(user_no: int, job_date_str: str) -> int | None:
    """같은 (user_no, job_date) 의 가장 최근 journal exec_no. 없으면 None."""
    sql = """
        SELECT MAX(exec_no) AS m
        FROM journal
        WHERE user_no = %s AND job_date = %s
    """
    try:
        row = fetch_one(sql, [user_no, job_date_str])
        m = (row or {}).get("m")
        return int(m) if m is not None else None
    except Exception:
        return None


def _resolve_or_create_parent_journal(
    record: dict[str, Any],
    user_no: int,
    amo_regno: str,
    job_date_str: str,
) -> int:
    """evidence 가 묶일 journal 행의 exec_no 를 결정합니다.

    우선순위:
      1) record.exec_no 명시
      2) record.parent_diary_id (또는 diary_id) 가 신 형식이면 파싱
      3) 같은 (user_no, job_date) 에 journal 행이 이미 있으면 가장 최근 exec_no
      4) 없으면 placeholder journal 자동 생성 (사진 컨텍스트로 work_detail 채움)
    """
    # 1) 명시
    exec_no_input = record.get("exec_no")
    if exec_no_input not in (None, ""):
        try:
            return int(exec_no_input)
        except (TypeError, ValueError):
            pass

    # 2) parent diary_id 파싱
    parent = record.get("parent_diary_id") or record.get("diary_id")
    if parent and isinstance(parent, str):
        parts = parent.split("-")
        if len(parts) >= 3:
            try:
                _, _, p_exec = int(parts[0]), parts[1], int(parts[2])
                return p_exec
            except ValueError:
                pass

    # 3) 가장 최근 journal exec_no 재사용
    latest = _find_latest_journal_exec_no(user_no, job_date_str)
    if latest is not None:
        return latest

    # 4) placeholder journal 자동 생성
    #    diary_rdb 의 create_diary_mysql 을 lazy import 로 호출 (순환 회피)
    from app.repositories.diary_rdb import create_diary_mysql

    placeholder = {
        "farmer_id": record.get("farmer_id"),
        "amo_regno": amo_regno,
        "worker_name": record.get("worker_name") or "",
        "work_date": job_date_str,
        "field_id": record.get("field_id") or record.get("parcel_no") or record.get("parcel_regno"),
        "parcel_no": record.get("parcel_no"),
        "parcel_regno": record.get("parcel_regno"),
        "crop_name": record.get("crop_name") or "",
        "work_stage": record.get("activity_type") or "증빙 사진",
        "work_stage_detail": "",
        "work_detail": _fit_text(
            f"사진 증빙 자동 등록: {record.get('evidence_type') or record.get('evid_cd') or ''}".strip(),
            255,
        )
        or "사진 증빙 자동 등록",
        "job_cd": _fit_text(record.get("job_cd") or "V0001", 8),
        "activity_id": record.get("activity_id") or "",
        "prj_id": record.get("prj_id") or record.get("project_id") or "",
        "project_id": record.get("project_id") or record.get("prj_id") or "",
        "todo_id": record.get("todo_id") or "",
        "input_type_cd": _fit_text(record.get("input_type_cd") or "IMG", 8),
        "status": record.get("status") or "saved",
    }
    saved = create_diary_mysql(placeholder)
    saved_exec_no = saved.get("exec_no")
    if saved_exec_no not in (None, ""):
        try:
            return int(saved_exec_no)
        except (TypeError, ValueError):
            pass
    # exec_no 가 안 실려도 diary_id 가 있으면 거기서 파싱 (`{user_no}-{yyyymmdd}-{exec_no}`)
    saved_diary_id = saved.get("diary_id") or ""
    parts = saved_diary_id.split("-")
    if len(parts) >= 3:
        try:
            return int(parts[2])
        except ValueError:
            pass
    return 0


def create_evidence_mysql(record: dict[str, Any]) -> dict[str, Any]:
    """신 스키마 증빙 저장.

    저장 흐름:
      1) farmer_id → user_no, amo_regno 해석
      2) job_date 결정 (captured_at 우선, 없으면 work_date, 그래도 없으면 오늘)
      3) parent journal 찾기/생성 → exec_no 확보
      4) (user_no, job_date, exec_no) 내 seq_no 채번 (충돌 시 1회 재시도)
      5) evidence INSERT (gps/capture_dt 기본값 처리, evid_cd 카테고리 매핑)
      6) view 로 재조회 → EvidenceRecord 호환 dict
    """
    # ---- 1) 신원 해석 ----
    farmer_id = str(record.get("farmer_id") or "").strip()
    if not farmer_id:
        raise ValueError("farmer_id is required")
    user_rec = resolve_user_record(farmer_id)
    if not user_rec or user_rec.get("user_no") is None:
        raise ValueError(f"Unknown farmer_id: {farmer_id}")
    user_no = int(user_rec["user_no"])
    amo_regno = (
        (user_rec.get("amo_regno") or "").strip()
        or str(record.get("amo_regno") or "").strip()
    )
    if not amo_regno:
        raise ValueError(
            f"farmer_id={farmer_id} has no amo_regno mapping in farmer table"
        )

    # ---- 2) job_date 결정 ----
    job_date_str = (
        _normalize_job_date_str(record.get("captured_at"))
        or _normalize_job_date_str(record.get("work_date"))
        or _normalize_job_date_str(record.get("job_date"))
    )
    if not job_date_str:
        job_date_str = datetime.now().strftime("%Y-%m-%d")

    # ---- 3) parent journal 결정 ----
    exec_no = _resolve_or_create_parent_journal(record, user_no, amo_regno, job_date_str)
    if exec_no <= 0:
        raise ValueError(
            f"Could not determine parent journal exec_no for "
            f"user_no={user_no}, job_date={job_date_str}"
        )

    # ---- 4) seq_no 채번 + 5) evidence INSERT (1회 재시도) ----
    composed_id = ""
    seq_no = 0
    last_error: Exception | None = None
    for attempt in range(2):
        seq_no = next_seq_no(user_no, job_date_str, exec_no)
        composed_id = _compose_evidence_id(user_no, job_date_str, exec_no, seq_no)

        raw_json = _build_raw_json({**record, "evidence_id": composed_id})
        captured_at = _normalize_datetime(
            record.get("captured_at") or record.get("capture_dt")
        )
        file_path = (
            record.get("file_path")
            or record.get("storage_path")
            or record.get("image_url")
            or ""
        )

        sql = """
            INSERT INTO evidence (
                group_no, amo_regno, user_no, seq_no, job_date, exec_no,
                gps_lat, gps_long, capture_dt, ai_label, evid_cd, file_path,
                raw_json, reg_dt, reg_no
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """
        # 농가의 실제 group_no 를 group_member 에서 동적 해석. record 에 명시되면 그것이 우선.
        record_group_no = record.get("group_no")
        if record_group_no in (None, ""):
            groups = resolve_group_nos_for_amo(amo_regno)
            if not groups:
                raise ValueError(
                    f"농가({amo_regno}) 의 group_no 를 해석할 수 없어 증빙을 저장할 수 없습니다. "
                    "group_member 등록이 필요합니다."
                )
            resolved_group_no = groups[0]
        else:
            resolved_group_no = int(record_group_no)

        params = [
            resolved_group_no,
            amo_regno,
            user_no,
            seq_no,
            job_date_str,
            exec_no,
            _normalize_decimal(record.get("gps_lat"), 0.0),
            _normalize_decimal(record.get("gps_long"), 0.0),
            captured_at,
            _fit_text(
                record.get("confirmed_label")
                or record.get("ai_label")
                or record.get("evidence_type")
                or record.get("evid_cd"),
                128,
            ),
            _to_evid_cd(record.get("evidence_type") or record.get("evid_cd") or "OTH"),
            _fit_text(file_path, 255),
            json.dumps(raw_json, ensure_ascii=False, default=str),
            datetime.now(),
            user_no,
        ]
        try:
            with transaction() as conn:
                execute(sql, params, connection=conn, commit=False)
            last_error = None
            break
        except DBExecutionError as exc:
            last_error = exc
            if attempt == 0 and "duplicate" in str(exc).lower():
                continue
            raise EvidenceMySQLConflictError(
                f"Duplicate evidence key (user_no={user_no}, job_date={job_date_str}, "
                f"exec_no={exec_no}, seq_no={seq_no})"
            ) from exc

    if last_error is not None:
        raise EvidenceMySQLConflictError(
            f"Failed to allocate seq_no for ({user_no}, {job_date_str}, {exec_no})"
        ) from last_error

    # ---- 6) 응답 ----
    saved = get_evidence_by_id_mysql(composed_id)
    if saved:
        return saved
    return {
        "evidence_id": composed_id,
        "todo_id": str(record.get("todo_id") or ""),
        "group_no": resolved_group_no,
        "prj_id": str(record.get("prj_id") or record.get("project_id") or ""),
        "project_id": str(record.get("prj_id") or record.get("project_id") or ""),
        "activity_id": str(record.get("activity_id") or ""),
        "job_cd": str(record.get("job_cd") or ""),
        "farmer_id": amo_regno,
        "farmer_name": user_rec.get("user_name") or "",
        "parcel_no": str(record.get("parcel_no") or ""),
        "parcel_regno": str(record.get("parcel_regno") or ""),
        "field_id": str(record.get("field_id") or ""),
        "activity_type": str(record.get("activity_type") or ""),
        "evidence_type": str(record.get("evidence_type") or ""),
        "confirmed_label": str(record.get("confirmed_label") or ""),
        "image_url": str(record.get("image_url") or ""),
        "storage_path": str(record.get("storage_path") or ""),
        "original_image_path": str(record.get("original_image_path") or ""),
        "captured_at": _normalize_datetime(record.get("captured_at")),
        "status": str(record.get("status") or "needs_review"),
        "user_message": str(record.get("user_message") or ""),
        "created_at": datetime.now(),
        "updated_at": datetime.now(),
        "user_no": user_no,
        "user_name": user_rec.get("user_name") or "",
        "amo_regno": amo_regno,
        "exec_no": exec_no,
        "seq_no": seq_no,
    }


def update_evidence_mysql(record: dict[str, Any]) -> dict[str, Any] | None:
    """`evidence_id` 로 식별된 행의 status / user_message / confirmed_label 만 갱신.

    PATCH /evidence/{id} 는 이장님 검토 흐름에 필수라 Step 3 단계에서 같이 살려둡니다.
    실제 컬럼: ai_label (confirmed_label), raw_json.$.status / $.user_message.
    """
    evidence_id = str(record.get("evidence_id") or "").strip()
    parsed = _parse_evidence_id(evidence_id)
    if not parsed:
        return None
    user_no, job_date, exec_no, seq_no = parsed

    # 1) 기존 raw_json 가져오기
    existing = get_evidence_by_id_mysql(evidence_id)
    if not existing:
        return None
    # raw_json 재구성 (existing 의 raw 메타 + 새 값 덮기)
    # existing 에서는 _map_row_to_evidence 결과의 평탄화된 값을 사용.
    new_raw = {
        "api_evidence_id": existing.get("evidence_id", ""),
        "evidence_id": existing.get("evidence_id", ""),
        "todo_id": existing.get("todo_id", ""),
        "project_id": existing.get("project_id", ""),
        "prj_id": existing.get("prj_id", ""),
        "activity_id": existing.get("activity_id", ""),
        "field_id": existing.get("field_id", ""),
        "parcel_no": existing.get("parcel_no", ""),
        "parcel_regno": existing.get("parcel_regno", ""),
        "activity_type": existing.get("activity_type", ""),
        "evidence_type": existing.get("evidence_type", ""),
        "status": record.get("status") or existing.get("status") or "needs_review",
        "user_message": record.get("user_message")
            if record.get("user_message") is not None
            else existing.get("user_message", ""),
        "image_url": existing.get("image_url", ""),
        "storage_path": existing.get("storage_path", ""),
        "original_image_path": existing.get("original_image_path", ""),
        # 분석 결과 보존 — PATCH(이장님 검토)가 raw_json 을 재구성하므로 기존 값을 그대로 옮겨야
        # classification/품질/추천/To-do판정 이 소실되지 않는다 (예전엔 여기서 드롭됐음).
        "classification": existing.get("classification", "") or "",
        "image_quality": existing.get("image_quality", {}) or {},
        "receipt_ocr": existing.get("receipt_ocr", {}) or {},
        "suggested_activity_type": existing.get("suggested_activity_type", "") or "",
        "suggested_activity_label": existing.get("suggested_activity_label", "") or "",
        "suggested_evidence_type": existing.get("suggested_evidence_type", "") or "",
        "suggested_reason": existing.get("suggested_reason", "") or "",
        "suggested_confidence": float(existing.get("suggested_confidence") or 0.0),
        "address": existing.get("address", "") or "",
        "todo_match": existing.get("todo_match", "") or "",
        "todo_match_confidence": float(existing.get("todo_match_confidence") or 0.0),
        "todo_match_reason": existing.get("todo_match_reason", "") or "",
        "needs_chief_verification": bool(existing.get("needs_chief_verification") or False),
    }
    new_confirmed_label = record.get("confirmed_label") or existing.get("confirmed_label", "") or ""

    sql = """
        UPDATE evidence
        SET ai_label = %s,
            raw_json = %s,
            mod_dt = %s
        WHERE user_no = %s AND job_date = %s AND exec_no = %s AND seq_no = %s
    """
    params = [
        _fit_text(new_confirmed_label, 128),
        json.dumps(new_raw, ensure_ascii=False, default=str),
        datetime.now(),
        user_no,
        job_date,
        exec_no,
        seq_no,
    ]
    try:
        with transaction() as conn:
            execute(sql, params, connection=conn, commit=False)
        return get_evidence_by_id_mysql(evidence_id)
    except Exception:
        return None
