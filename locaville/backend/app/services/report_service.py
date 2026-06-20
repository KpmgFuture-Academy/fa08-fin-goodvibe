"""사업별 PDF 리포트 생성 서비스.

``GET /reports/project-preview`` (JSON) 와 ``GET /reports/project-pdf`` 의 본체.
todo + 영농일지 + 증빙을 한 농가·한 사업 단위로 모아 PDF (ReportLab) 로 묶어
"제출용 산출물" 을 만듭니다. 한국어 폰트는 OS 별 후보 경로에서 자동 탐지.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from app.schemas.diary import DiaryRecord
from app.schemas.evidence import EvidenceRecord
from app.schemas.todo import TodoRecord
from app.services.diary_service import list_diary_records_filtered
from app.services.evidence_service import list_evidence_records_filtered
from app.services.todo_service import list_todos

REPORT_OUTPUT_DIR = Path(__file__).resolve().parents[2] / "outputs" / "reports"
BACKEND_ROOT_DIR = Path(__file__).resolve().parents[2]

# repo 에 번들된 한글 폰트 (OFL 라이선스 NanumGothic). 시스템 폰트가 없는
# 배포 환경(Render python runtime 등)에서도 항상 한글이 렌더링되도록 1순위로 둔다.
_BUNDLED_FONT_DIR = Path(__file__).resolve().parents[1] / "assets" / "fonts"

FONT_CANDIDATES = [
    # 1순위: repo 번들 — OS 무관하게 항상 존재. 산출물 외형도 환경별로 동일해짐.
    (
        "NanumGothic",
        str(_BUNDLED_FONT_DIR / "NanumGothic-Regular.ttf"),
        str(_BUNDLED_FONT_DIR / "NanumGothic-Bold.ttf"),
    ),
    # 이하: 시스템 폰트 fallback (번들 파일이 누락된 경우 대비)
    ("malgun", "C:/Windows/Fonts/malgun.ttf", "C:/Windows/Fonts/malgunbd.ttf"),
    ("AppleGothic", "/System/Library/Fonts/Supplemental/AppleGothic.ttf", None),
    ("AppleSDGothicNeo", "/System/Library/Fonts/AppleSDGothicNeo.ttc", None),
    ("NotoSansCJK", "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc", None),
    ("NotoSansCJK", "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc", None),
    ("NanumGothicSys", "/usr/share/fonts/truetype/nanum/NanumGothic.ttf", "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf"),
]


def _project_value(prj_id: str | None, project_id: str | None) -> str:
    if prj_id and prj_id.strip():
        return prj_id.strip()
    if project_id and project_id.strip():
        return project_id.strip()
    return ""


def _parse_prj_id_from_todo_id(todo_id: str | None) -> str:
    value = (todo_id or "").strip()
    if not value:
        return ""
    parts = value.split("-")
    if len(parts) >= 4:
        return parts[1].strip()
    return ""


def _record_matches_project(*, requested_project_key: str, prj_id: str | None, project_id: str | None, todo_id: str | None) -> bool:
    target = requested_project_key.strip()
    if not target:
        return False
    candidates = [
        (prj_id or "").strip(),
        (project_id or "").strip(),
        _parse_prj_id_from_todo_id(todo_id),
    ]
    return target in [item for item in candidates if item]


def _status_summary(todos: list[TodoRecord]) -> dict[str, int]:
    summary = {"total": len(todos), "pending": 0, "in_progress": 0, "completed": 0}
    for todo in todos:
        key = (todo.computed_status or todo.status or "pending").strip().lower()
        if key not in {"pending", "in_progress", "completed"}:
            key = "pending"
        summary[key] += 1
    return summary


def _infer_farmer_name(farmer_id: str, diaries: list[DiaryRecord]) -> str:
    for diary in diaries:
        if diary.farmer_name and diary.farmer_name.strip():
            return diary.farmer_name.strip()
    return farmer_id


def _infer_group_no(todos: list[TodoRecord], diaries: list[DiaryRecord], evidence: list[EvidenceRecord]) -> int | None:
    for todo in todos:
        if todo.group_no is not None:
            return todo.group_no
    for diary in diaries:
        if diary.group_no is not None:
            return diary.group_no
    for item in evidence:
        if item.group_no is not None:
            return item.group_no
    return None


def _infer_project_name(project_key: str, todos: list[TodoRecord]) -> str:
    for todo in todos:
        if todo.activity_name and todo.activity_name.strip():
            return todo.activity_name.strip()
    return f"사업 {project_key}" if project_key else "사업 정보 없음"


def _lookup_project_meta(farmer_id: str, project_key: str) -> dict[str, Any]:
    """실제 사업 메타(사업명·그룹명·그룹번호)를 prj_grp/project/ville_group 에서 조회.

    todo 의 activity_name(활동명) 이 아닌 진짜 사업명/소속 그룹명을 쓰기 위함.
    조회 실패(RDB off 등) 시 빈 dict 를 돌려 호출부가 기존 추론으로 폴백한다.
    """
    if not project_key:
        return {}
    try:
        from app.repositories.project_rdb import list_projects_with_activities

        projects = list_projects_with_activities(farmer_id=farmer_id) or []
    except Exception:  # noqa: BLE001
        return {}
    for project in projects:
        if str(project.get("prj_id") or "").strip() == project_key:
            return {
                "prj_name": (project.get("prj_name") or "").strip(),
                "biz_name": (project.get("biz_name") or "").strip(),
                "group_name": (project.get("group_name") or "").strip(),
                "group_no": project.get("group_no"),
                "ville_id": (project.get("ville_id") or "").strip(),
            }
    return {}


# 기상청 코드 → 한글 (admin_weather_service 와 동일 기준).
_SKY_LABEL = {"1": "맑음", "3": "구름많음", "4": "흐림"}
_PTY_LABEL = {"1": "비", "2": "비/눈", "3": "눈", "4": "소나기"}


def _summarize_day_weather(rows: list[dict[str, Any]]) -> str:
    """하루치 시간대별 예보 행들을 한 줄 요약으로. 예: '맑음 19~26°'."""
    temps: list[float] = []
    skies: list[str] = []
    ptys: list[str] = []
    for row in rows:
        tmp = row.get("tmp")
        if tmp is not None:
            try:
                temps.append(float(tmp))
            except (TypeError, ValueError):
                pass
        sky = str(row.get("sky") or "").strip()
        if sky:
            skies.append(sky)
        pty = str(row.get("pty") or "").strip()
        if pty and pty != "0":
            ptys.append(pty)

    if ptys:  # 강수가 있으면 강수 표기 우선
        code = max(set(ptys), key=ptys.count)
        label = _PTY_LABEL.get(code, "")
    elif skies:
        code = max(set(skies), key=skies.count)
        label = _SKY_LABEL.get(code, "")
    else:
        label = ""

    temp_str = ""
    if temps:
        lo, hi = min(temps), max(temps)
        temp_str = f"{hi:.0f}°" if (hi - lo) < 1 else f"{lo:.0f}~{hi:.0f}°"

    return " ".join(part for part in (label, temp_str) if part).strip()


def _diary_weather_map(ville_id: str, diaries: list[dict[str, Any]]) -> dict[str, str]:
    """일지 날짜 범위의 일별 날씨 요약 {YYYY-MM-DD: '맑음 19~26°'}.

    weather 테이블(배치 적재 예보)에서 마을 격자 기준으로 조회.
    데이터 없는 날짜는 키가 빠지고, 호출부는 '-' 로 표시한다.
    """
    if not ville_id or not diaries:
        return {}
    iso_dates = sorted({(d.get("work_date") or "")[:10] for d in diaries if d.get("work_date")})
    if not iso_dates:
        return {}
    try:
        from app.repositories.user_ville_rdb import get_village_info
        from app.services.weather_service import fetch_hourly_weather_from_db

        vinfo = get_village_info(ville_id) or {}
        addr = f"{(vinfo.get('addr_1') or '').strip()} {(vinfo.get('addr_2') or '').strip()}".strip() or None
        lo = date.fromisoformat(iso_dates[0])
        hi = date.fromisoformat(iso_dates[-1]) + timedelta(days=1)
        result = fetch_hourly_weather_from_db(
            village_nx=vinfo.get("nx"),
            village_ny=vinfo.get("ny"),
            village_address=addr,
            cache_key=ville_id,
            start_date=lo,
            end_date=hi,
            limit=1000,
        )
    except Exception:  # noqa: BLE001
        return {}

    by_date: dict[str, list[dict[str, Any]]] = {}
    for item in result.get("items", []) or []:
        ymd = str(item.get("fcst_date") or "")
        if len(ymd) == 8:
            by_date.setdefault(ymd, []).append(item)

    out: dict[str, str] = {}
    for ymd, rows in by_date.items():
        summary = _summarize_day_weather(rows)
        if summary:
            out[f"{ymd[:4]}-{ymd[4:6]}-{ymd[6:8]}"] = summary
    return out


def build_project_report_data(*, farmer_id: str, prj_id: str | None = None, project_id: str | None = None) -> dict[str, Any]:
    project_key = _project_value(prj_id, project_id)
    if not project_key:
        raise ValueError("prj_id or project_id is required")

    todos = list_todos(farmer_id=farmer_id, prj_id=project_key)
    all_diaries = list_diary_records_filtered(farmer_id=farmer_id, limit=100)
    all_evidence = list_evidence_records_filtered(farmer_id=farmer_id, limit=100)

    diaries = [
        item
        for item in all_diaries
        if _record_matches_project(
            requested_project_key=project_key,
            prj_id=item.prj_id,
            project_id=item.project_id,
            todo_id=item.todo_id,
        )
    ]
    evidence = [
        item
        for item in all_evidence
        if _record_matches_project(
            requested_project_key=project_key,
            prj_id=item.prj_id,
            project_id=item.project_id,
            todo_id=item.todo_id,
        )
    ]

    # 실제 사업 메타(사업명/그룹명) 우선. 없으면 todo 기반 추론으로 폴백.
    meta = _lookup_project_meta(farmer_id, project_key)
    project_name = meta.get("prj_name") or meta.get("biz_name") or _infer_project_name(project_key, todos)
    group_no = meta.get("group_no")
    if group_no is None:
        group_no = _infer_group_no(todos, diaries, evidence)

    diary_items = [
        {
            "diary_id": item.diary_id,
            "work_date": item.work_date.isoformat(),
            "work_detail": item.work_detail,
            "work_stage": getattr(item, "work_stage", ""),
            "input_type_cd": item.input_type_cd,
            "parcel_no": item.parcel_no,
            "field_id": item.field_id,
            "linked_evidence_ids": item.linked_evidence_ids,
        }
        for item in diaries
    ]
    # 기록한 날의 날씨를 일지마다 붙인다(데이터 없으면 빈 문자열).
    weather_map = _diary_weather_map(meta.get("ville_id") or "", diary_items)
    for entry in diary_items:
        entry["weather"] = weather_map.get((entry.get("work_date") or "")[:10], "")

    report = {
        "report_title": "저탄마을 사업 이행 리포트",
        "generated_at": datetime.now().isoformat(),
        "farmer_id": farmer_id,
        "farmer_name": _infer_farmer_name(farmer_id, diaries),
        "group_no": group_no,
        "group_name": meta.get("group_name") or "",
        "prj_id": project_key,
        "project_id": project_key,
        "project_name": project_name,
        "todo_summary": _status_summary(todos),
        "todos": [
            {
                "todo_title": item.todo_title,
                "activity_name": item.activity_name,
                "job_name": item.job_name,
                "status": item.status,
                "computed_status": item.computed_status,
                "required_evidence_types": item.required_evidence_types,
                "due_date": item.due_date.isoformat() if item.due_date else None,
            }
            for item in todos
        ],
        "diaries": diary_items,
        "evidence": [
            {
                "evidence_id": item.evidence_id,
                "evidence_type": item.evidence_type,
                "status": item.status,
                "image_url": item.image_url,
                "storage_path": item.storage_path,
                "original_image_path": item.original_image_path,
                "captured_at": item.captured_at.isoformat() if item.captured_at else None,
                "user_message": item.user_message,
                "activity_id": item.activity_id,
                "job_cd": item.job_cd,
            }
            for item in evidence
        ],
    }
    if report["todo_summary"]["total"] == 0 and len(report["diaries"]) == 0 and len(report["evidence"]) == 0:
        report["warning"] = f"No records found for prj_id={project_key}. Check project id mapping."
    return report


def _resolve_image_path(image_url: str | None, storage_path: str | None) -> Path | None:
    if storage_path:
        candidate = BACKEND_ROOT_DIR / storage_path.lstrip("/")
        if candidate.exists() and candidate.is_file():
            return candidate

    if not image_url:
        return None

    parsed = urlparse(image_url)
    path = parsed.path if parsed.scheme else image_url
    if "/uploads/" not in path:
        return None
    rel = path.split("/uploads/", 1)[1]
    candidate = BACKEND_ROOT_DIR / "uploads" / rel
    if candidate.exists() and candidate.is_file():
        return candidate
    return None


def _evidence_image_source(image_url: str | None, storage_path: str | None) -> "str | bytes | None":
    """ReportLab Image 에 넘길 이미지 소스를 돌려준다.

    1) 로컬 파일(업로드 디렉터리/storage_path) 이면 경로(str).
    2) 원격 http(s) URL(예: Supabase Storage) 이면 내려받아 raw bytes.
    실패 시 None — 호출부가 "이미지 없음" 으로 표시한다.
    """
    local = _resolve_image_path(image_url, storage_path)
    if local is not None:
        return str(local)

    url = (image_url or "").strip()
    if not url.lower().startswith(("http://", "https://")):
        return None
    try:
        from urllib.request import Request, urlopen

        req = Request(url, headers={"User-Agent": "locaville-report/1.0"})
        with urlopen(req, timeout=10) as resp:  # noqa: S310 (공개 증빙 URL)
            if getattr(resp, "status", 200) >= 400:
                return None
            data = resp.read()
        return data or None
    except Exception:  # noqa: BLE001
        return None


_STATUS_LABEL = {
    "completed": "확인 완료",
    "confirmed": "확인 완료",
    "in_progress": "검토 필요",
    "needs_review": "검토 필요",
    "retake_required": "재촬영 필요",
    "pending": "대기",
    "created": "대기",
    "saved": "저장됨",
}


def _status_label(status: str) -> str:
    return _STATUS_LABEL.get((status or "").lower(), status or "대기")


_INPUT_LABEL = {
    "VOICE": "음성",  # 신 시드 표준 (varchar(8))
    "MANUAL": "직접",
    "voice_chat": "음성",  # 옛 표기 호환
    "voice": "음성",
    "voice_ch": "음성",  # voice_chat 잘려있던 옛 값 호환
    "manual": "직접",
    "manual_chat": "직접",
    "img": "사진",
    "photo": "사진",
}


def _input_method_label(code: str) -> str:
    return _INPUT_LABEL.get((code or "").lower(), code or "-")


def _short_id(value: str | None, head: int = 8) -> str:
    v = (value or "").strip()
    if len(v) <= head + 4:
        return v or "-"
    return f"{v[:head]}…"


def _short_iso(value: str | None) -> str:
    v = (value or "").strip()
    if not v:
        return "-"
    if "T" in v:
        date, time = v.split("T", 1)
        return f"{date} {time[:5]}"
    return v


_FONT_REGISTERED: tuple[str, str, str] | None = None


def _register_fonts() -> tuple[str, str, bool]:
    """한국어 폰트를 한 번만 등록하고 (regular, bold, ok) 를 돌려준다."""
    global _FONT_REGISTERED
    if _FONT_REGISTERED is not None:
        regular, bold, _ = _FONT_REGISTERED
        return regular, bold, regular != "Helvetica"

    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    for name, regular_path, bold_path in FONT_CANDIDATES:
        if not regular_path or not Path(regular_path).exists():
            continue
        try:
            pdfmetrics.registerFont(TTFont(name, regular_path))
            bold_name = name
            if bold_path and Path(bold_path).exists():
                bold_name = f"{name}-Bold"
                pdfmetrics.registerFont(TTFont(bold_name, bold_path))
            _FONT_REGISTERED = (name, bold_name, regular_path)
            return name, bold_name, True
        except Exception:  # noqa: BLE001
            continue

    _FONT_REGISTERED = ("Helvetica", "Helvetica-Bold", "")
    return "Helvetica", "Helvetica-Bold", False


# ============================================================
#  PDF generation (Platypus)
# ============================================================

# 디자인 토큰 — 한 곳에서만 바꾸면 전체에 반영.
_COLOR_PRIMARY = "#1f7a4d"      # 짙은 녹색 (타이틀/헤더)
_COLOR_ACCENT = "#f0f7f1"       # 옅은 녹색 배경
_COLOR_BORDER = "#d8dee2"
_COLOR_TEXT = "#1c1f23"
_COLOR_MUTED = "#5b6770"
_COLOR_PENDING = "#9aa3ac"
_COLOR_PROGRESS = "#d97706"
_COLOR_COMPLETED = "#1f7a4d"
_COLOR_TABLE_HEAD_BG = "#1f7a4d"
_COLOR_TABLE_HEAD_TEXT = "#ffffff"
_COLOR_TABLE_ALT = "#f7faf8"


def _styles(font_regular: str, font_bold: str):
    """Platypus ParagraphStyle 모음."""
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.enums import TA_LEFT
    from reportlab.lib.colors import HexColor

    return {
        "title": ParagraphStyle(
            "Title",
            fontName=font_bold,
            fontSize=20,
            leading=24,
            textColor=HexColor(_COLOR_PRIMARY),
            spaceAfter=2,
        ),
        "subtitle": ParagraphStyle(
            "Subtitle",
            fontName=font_regular,
            fontSize=10,
            leading=14,
            textColor=HexColor(_COLOR_MUTED),
            spaceAfter=12,
        ),
        "h2": ParagraphStyle(
            "H2",
            fontName=font_bold,
            fontSize=13,
            leading=18,
            textColor=HexColor(_COLOR_PRIMARY),
            spaceBefore=10,
            spaceAfter=6,
        ),
        "meta_label": ParagraphStyle(
            "MetaLabel",
            fontName=font_regular,
            fontSize=9,
            leading=12,
            textColor=HexColor(_COLOR_MUTED),
        ),
        "meta_value": ParagraphStyle(
            "MetaValue",
            fontName=font_bold,
            fontSize=11,
            leading=14,
            textColor=HexColor(_COLOR_TEXT),
        ),
        "body": ParagraphStyle(
            "Body",
            fontName=font_regular,
            fontSize=9.5,
            leading=13,
            textColor=HexColor(_COLOR_TEXT),
            alignment=TA_LEFT,
        ),
        "body_muted": ParagraphStyle(
            "BodyMuted",
            fontName=font_regular,
            fontSize=9,
            leading=12,
            textColor=HexColor(_COLOR_MUTED),
        ),
        "tag_pending": ParagraphStyle(
            "TagPending",
            fontName=font_bold,
            fontSize=9,
            leading=12,
            textColor=HexColor("#ffffff"),
            backColor=HexColor(_COLOR_PENDING),
            alignment=TA_LEFT,
        ),
        "tag_progress": ParagraphStyle(
            "TagProgress",
            fontName=font_bold,
            fontSize=9,
            leading=12,
            textColor=HexColor("#ffffff"),
            backColor=HexColor(_COLOR_PROGRESS),
        ),
        "tag_completed": ParagraphStyle(
            "TagCompleted",
            fontName=font_bold,
            fontSize=9,
            leading=12,
            textColor=HexColor("#ffffff"),
            backColor=HexColor(_COLOR_COMPLETED),
        ),
        "footer": ParagraphStyle(
            "Footer",
            fontName=font_regular,
            fontSize=8,
            leading=10,
            textColor=HexColor(_COLOR_MUTED),
        ),
    }


def _status_chip(label: str, key: str, styles) -> str:
    """배경색이 다른 상태 칩 — Paragraph 안에 inline HTML 로 그린다."""
    color = {
        "completed": _COLOR_COMPLETED,
        "in_progress": _COLOR_PROGRESS,
        "pending": _COLOR_PENDING,
    }.get(key, _COLOR_PENDING)
    return (
        f'<font color="#ffffff" backColor="{color}">'
        f'&nbsp;{label}&nbsp;'
        f'</font>'
    )


def _build_header_block(report_data: dict[str, Any], styles):
    from reportlab.lib.colors import HexColor
    from reportlab.platypus import Paragraph, Table, TableStyle, Spacer

    farmer_name = report_data.get("farmer_name") or "-"
    farmer_id = report_data.get("farmer_id") or "-"
    project_name = report_data.get("project_name") or "-"
    prj_id = report_data.get("prj_id") or "-"
    group_no = report_data.get("group_no")
    group_name = (report_data.get("group_name") or "").strip()
    generated = _short_iso(report_data.get("generated_at"))

    title = Paragraph(report_data.get("report_title", "저탄마을 사업 이행 리포트"), styles["title"])
    subtitle = Paragraph(f"생성일시 · {generated}", styles["subtitle"])

    # 메타 정보 카드 (2x2 grid).
    def cell(label: str, value: str):
        return [
            Paragraph(label, styles["meta_label"]),
            Paragraph(value, styles["meta_value"]),
        ]

    # 소속 — 그룹명 우선, 없으면 그룹번호, 그마저 없으면 정보 없음.
    group_label = group_name or (f"그룹 {group_no}" if group_no else "그룹 정보 없음")
    meta_table = Table(
        [
            [cell("농업인", f"{farmer_name} <font size='8' color='{_COLOR_MUTED}'>({farmer_id})</font>"),
             cell("사업", f"{project_name} <font size='8' color='{_COLOR_MUTED}'>[{prj_id}]</font>")],
            [cell("소속", group_label),
             cell("리포트 기준일", generated.split(" ")[0] if generated and generated != "-" else "-")],
        ],
        colWidths=[260, 240],
        rowHeights=[36, 36],
    )
    meta_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), HexColor(_COLOR_ACCENT)),
        ("BOX", (0, 0), (-1, -1), 0.5, HexColor(_COLOR_BORDER)),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, HexColor(_COLOR_BORDER)),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))

    return [title, subtitle, meta_table, Spacer(1, 14)]


def _build_diary_block(report_data: dict[str, Any], styles):
    from reportlab.lib.colors import HexColor
    from reportlab.platypus import Paragraph, Table, TableStyle, Spacer

    diaries = report_data.get("diaries", []) or []
    heading = Paragraph(f"영농일지 ({len(diaries)}건)", styles["h2"])

    if not diaries:
        return [heading, Paragraph("등록된 영농일지가 없습니다.", styles["body_muted"]), Spacer(1, 10)]

    header = [
        Paragraph('<font color="#ffffff"><b>일자</b></font>', styles["body"]),
        Paragraph('<font color="#ffffff"><b>날씨</b></font>', styles["body"]),
        Paragraph('<font color="#ffffff"><b>입력</b></font>', styles["body"]),
        Paragraph('<font color="#ffffff"><b>작업 단계</b></font>', styles["body"]),
        Paragraph('<font color="#ffffff"><b>작업 내용</b></font>', styles["body"]),
    ]
    rows = [header]
    for item in diaries[:50]:
        work_date = _short_iso(item.get("work_date")).split(" ")[0]
        weather = (item.get("weather") or "").strip() or "-"
        input_label = _input_method_label(item.get("input_type_cd") or "")
        stage = item.get("work_stage") or "-"
        detail = (item.get("work_detail") or "-").replace("\n", " ")
        rows.append([
            Paragraph(work_date, styles["body"]),
            Paragraph(weather, styles["body"]),
            Paragraph(input_label, styles["body"]),
            Paragraph(stage, styles["body"]),
            Paragraph(detail, styles["body"]),
        ])

    table = Table(rows, colWidths=[56, 76, 34, 78, 256], repeatRows=1)
    style = TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), HexColor(_COLOR_TABLE_HEAD_BG)),
        ("TEXTCOLOR", (0, 0), (-1, 0), HexColor(_COLOR_TABLE_HEAD_TEXT)),
        ("BOX", (0, 0), (-1, -1), 0.5, HexColor(_COLOR_BORDER)),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, HexColor(_COLOR_BORDER)),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ])
    # 짝수 행 배경.
    for idx in range(2, len(rows), 2):
        style.add("BACKGROUND", (0, idx), (-1, idx), HexColor(_COLOR_TABLE_ALT))
    table.setStyle(style)
    return [heading, table, Spacer(1, 14)]


def _build_evidence_block(
    report_data: dict[str, Any],
    styles,
    *,
    include_images: bool,
):
    from reportlab.lib.colors import HexColor
    from reportlab.lib.utils import ImageReader
    from reportlab.platypus import Paragraph, Table, TableStyle, Spacer, Image

    items = report_data.get("evidence", []) or []
    heading = Paragraph(f"증빙자료 ({len(items)}건)", styles["h2"])

    if not items:
        return [heading, Paragraph("등록된 증빙자료가 없습니다.", styles["body_muted"]), Spacer(1, 10)]

    flowables = [heading]
    for item in items[:30]:
        evidence_id = _short_id(item.get("evidence_id") or "", 16)
        evidence_type = item.get("evidence_type") or "-"
        status_key = (item.get("status") or "").lower()
        status_label = _status_label(item.get("status") or "")
        captured = _short_iso(item.get("captured_at"))
        message = (item.get("user_message") or "").strip() or "-"

        # 상태 칩 — 색상 구분.
        chip_color = {
            "completed": _COLOR_COMPLETED,
            "confirmed": _COLOR_COMPLETED,
            "in_progress": _COLOR_PROGRESS,
            "needs_review": _COLOR_PROGRESS,
            "retake_required": "#c0392b",
        }.get(status_key, _COLOR_PENDING)

        # 좌측 — 이미지(있으면), 우측 — 메타 정보 표.
        left_cell: Any = ""
        if include_images:
            from io import BytesIO

            img_src = _evidence_image_source(item.get("image_url"), item.get("storage_path"))
            if img_src is not None:
                try:
                    # 검증용/임베드용 소스를 분리 — BytesIO 를 공유하면 위치가 소진된다.
                    ImageReader(img_src if isinstance(img_src, str) else BytesIO(img_src))  # validate
                    img_arg = img_src if isinstance(img_src, str) else BytesIO(img_src)
                    left_cell = Image(img_arg, width=120, height=90, kind="proportional")
                except Exception:  # noqa: BLE001
                    left_cell = Paragraph("이미지 불러오기 실패", styles["body_muted"])
            else:
                left_cell = Paragraph("이미지 없음", styles["body_muted"])
        else:
            left_cell = Paragraph("-", styles["body_muted"])

        chip_html = (
            f'<font color="#ffffff" backColor="{chip_color}" size="9">'
            f'&nbsp;&nbsp;{status_label}&nbsp;&nbsp;</font>'
        )
        meta_rows = [
            [Paragraph("증빙 ID", styles["meta_label"]), Paragraph(evidence_id, styles["body"])],
            [Paragraph("유형", styles["meta_label"]), Paragraph(evidence_type, styles["body"])],
            [Paragraph("상태", styles["meta_label"]), Paragraph(chip_html, styles["body"])],
            [Paragraph("촬영일", styles["meta_label"]), Paragraph(captured, styles["body"])],
            [Paragraph("메시지", styles["meta_label"]), Paragraph(message, styles["body"])],
        ]
        meta_table = Table(meta_rows, colWidths=[55, 305])
        meta_table.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 2),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ]))

        card = Table([[left_cell, meta_table]], colWidths=[130, 370])
        card.setStyle(TableStyle([
            ("BOX", (0, 0), (-1, -1), 0.5, HexColor(_COLOR_BORDER)),
            ("BACKGROUND", (0, 0), (-1, -1), "#ffffff"),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ]))
        flowables.append(card)
        flowables.append(Spacer(1, 8))

    return flowables


def _make_footer(canvas_obj, doc, font_name: str, generated_at: str):
    from reportlab.lib.colors import HexColor

    canvas_obj.saveState()
    canvas_obj.setFont(font_name, 8)
    canvas_obj.setFillColor(HexColor(_COLOR_MUTED))
    # 하단 가로선.
    canvas_obj.setStrokeColor(HexColor(_COLOR_BORDER))
    canvas_obj.setLineWidth(0.3)
    canvas_obj.line(36, 30, doc.pagesize[0] - 36, 30)
    # 좌측: 생성 시각, 우측: 페이지.
    canvas_obj.drawString(36, 18, f"Generated at {generated_at}")
    page_text = f"{canvas_obj.getPageNumber()} 쪽"
    canvas_obj.drawRightString(doc.pagesize[0] - 36, 18, page_text)
    canvas_obj.restoreState()


def generate_project_pdf(report_data: dict[str, Any], *, include_images: bool = True) -> Path:
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.platypus import SimpleDocTemplate
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError("reportlab is required to generate project pdf reports") from exc

    REPORT_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    file_name = f"report_{report_data['farmer_id']}_{report_data['prj_id']}_{ts}.pdf"
    output_path = REPORT_OUTPUT_DIR / file_name

    font_regular, font_bold, ok = _register_fonts()
    styles = _styles(font_regular, font_bold)

    doc = SimpleDocTemplate(
        str(output_path),
        pagesize=A4,
        leftMargin=48,
        rightMargin=48,
        topMargin=42,
        bottomMargin=42,
        title=report_data.get("report_title", "저탄마을 사업 이행 리포트"),
        author="Locaville",
    )

    story: list[Any] = []
    story.extend(_build_header_block(report_data, styles))
    if not ok:
        from reportlab.platypus import Paragraph as P
        story.append(P("한글 폰트를 찾지 못해 기본 폰트를 사용했습니다.", styles["body_muted"]))
    # '할 일 진행 요약' 섹션은 제외(요청). 영농일지 + 증빙자료만 묶는다.
    story.extend(_build_diary_block(report_data, styles))
    story.extend(_build_evidence_block(report_data, styles, include_images=include_images))

    generated_at = _short_iso(report_data.get("generated_at"))

    def on_page(canvas_obj, doc):
        _make_footer(canvas_obj, doc, font_regular, generated_at)

    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
    return output_path
