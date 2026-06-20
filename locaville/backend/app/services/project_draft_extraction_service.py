from __future__ import annotations

from pathlib import Path
from typing import Any

from app.services.ai_service import AIServiceError, _extract_first_json_object, _run_text_response


_PROMPT_DIR = Path(__file__).resolve().parent.parent / "prompts" / "project_from_rag"


def _load_prompt(name: str) -> str:
    return (_PROMPT_DIR / name).read_text(encoding="utf-8").strip()


def _normalize_date_text(value: Any) -> str | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    normalized = raw.replace(".", "-").replace("/", "-")
    parts = [part.strip() for part in normalized.split("-") if part.strip()]
    if len(parts) != 3:
        return None
    year, month, day = parts
    if not (year.isdigit() and month.isdigit() and day.isdigit()):
        return None
    return f"{int(year):04d}-{int(month):02d}-{int(day):02d}"


def extract_project_basic(context_text: str) -> dict[str, Any]:
    if not context_text.strip():
        return {}

    try:
        raw = _run_text_response(
            system_prompt=_load_prompt("basic_system.txt"),
            user_prompt=(
                "아래 문서 메타와 본문을 바탕으로 프로젝트 기본정보를 추출해라.\n\n"
                f"{context_text}\n\n"
                "JSON만 출력."
            ),
        )
    except AIServiceError:
        return {}
    except Exception:
        return {}

    try:
        parsed = _extract_first_json_object(raw)
    except Exception:
        return {}

    exec_year_raw = parsed.get("exec_year")
    exec_year: int | None = None
    if exec_year_raw not in (None, ""):
        try:
            exec_year = int(exec_year_raw)
        except (TypeError, ValueError):
            exec_year = None

    return {
        "prj_name": str(parsed.get("prj_name") or "").strip() or None,
        "issuer": str(parsed.get("issuer") or "").strip() or None,
        "exec_year": exec_year,
        "post_date": _normalize_date_text(parsed.get("post_date")),
    }


def extract_project_activity_names(context_text: str) -> list[str]:
    if not context_text.strip():
        return []

    try:
        raw = _run_text_response(
            system_prompt=_load_prompt("activity_list_system.txt"),
            user_prompt=(
                "아래 문서 메타와 본문을 바탕으로 프로젝트 활동 또는 작업 후보를 추출해라.\n\n"
                f"{context_text}\n\n"
                "JSON만 출력."
            ),
        )
    except AIServiceError:
        return []
    except Exception:
        return []

    try:
        parsed = _extract_first_json_object(raw)
    except Exception:
        return []

    items = parsed.get("activity_names") if isinstance(parsed, dict) else []
    if not isinstance(items, list):
        return []

    out: list[str] = []
    seen: set[str] = set()
    for item in items:
        text = str(item or "").strip()
        if not text or text in seen:
            continue
        out.append(text)
        seen.add(text)
    return out[:12]
