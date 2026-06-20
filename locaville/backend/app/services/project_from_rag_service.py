from __future__ import annotations

import json
import os
import re
from datetime import date, timedelta
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

from fastapi import HTTPException

from app.repositories import project_rdb, rag_rdb
from app.services.ai_service import AIServiceError, _extract_first_json_object, _run_text_response
from app.services.project_draft_extraction_service import extract_project_basic

try:
    from langchain_core.prompts import ChatPromptTemplate
    from langchain_openai import ChatOpenAI
except ImportError:  # pragma: no cover
    ChatPromptTemplate = None
    ChatOpenAI = None


_PROMPT_DIR = Path(__file__).resolve().parent.parent / "prompts" / "project_from_rag"
_CONFIG_DIR = Path(__file__).resolve().parent.parent / "config"


_BASIC_CONTEXT_KEYWORDS = (
    "사업명",
    "프로젝트명",
    "공고명",
    "사업개요",
    "개요",
    "목적",
    "공고일",
    "공고일자",
    "게시일",
    "시행년도",
    "시행연도",
    "기간",
    "발주기관",
    "주관기관",
    "공고기관",
    "시행기관",
)

_ACTIVITY_CONTEXT_KEYWORDS = (
    "활동",
    "작업",
    "실시",
    "수행",
    "증빙",
    "영농일지",
    "사진",
    "기록",
    "살포",
    "수거",
    "투입",
    "물떼기",
    "모내기",
    "방제",
)

_ACTIVITY_TABLE_KEYWORDS = (
    "활동",
    "활동명",
    "작업",
    "작업명",
    "단가",
    "지원",
    "지원단가",
    "지원대상 활동",
    "활동별 지원",
    "원/ha",
    "만원/ha",
    "ha당",
)

_PRICE_PATTERNS = (
    (re.compile(r"(?P<amount>\d[\d,]*(?:\.\d+)?)\s*만원\s*/?\s*ha"), 10000),
    (re.compile(r"(?P<amount>\d[\d,]*(?:\.\d+)?)\s*원\s*/?\s*ha"), 1),
    (re.compile(r"(?P<amount>\d[\d,]*(?:\.\d+)?)\s*만원"), 10000),
    (re.compile(r"(?P<amount>\d[\d,]*(?:\.\d+)?)\s*원"), 1),
)

_ACTIVITY_NAME_LABEL_PATTERNS = (
    re.compile(
        r"(?:활동명|작업명)\s*[:：]\s*(?P<name>[\s\S]*?)(?=(?:\n\s*(?:활동명|작업명|주요\s*내용|단가)\s*[:：])|(?:\n\s*[-=]{3,}\s*\n)|$)"
    ),
)

_PROJECT_NAME_NOISE_PATTERNS = (
    r"\s*등록신청\s*",
    r"\s*신청공고\s*",
    r"\s*공고문\s*",
    r"(?<!상시)\s*공고\s*$",
    r"\s*모집공고\s*",
    r"\s*모집\s*",
    r"\s*접수안내\s*",
    r"\s*접수\s*",
)

_PARCEL_ALIAS_MAP_CACHE: dict[str, tuple[str, ...]] | None = None


class _SafePromptDict(dict[str, Any]):
    def __missing__(self, key: str) -> str:
        return "{" + key + "}"


def _load_prompt(name: str) -> str:
    return (_PROMPT_DIR / name).read_text(encoding="utf-8").strip()


def _render_prompt(name: str, **kwargs: Any) -> str:
    return _load_prompt(name).format_map(_SafePromptDict(**kwargs))


def _build_farm_job_list_text() -> str:
    farm_jobs = project_rdb.list_farm_job_catalog()
    if not farm_jobs:
        return "(없음)"

    lines: list[str] = []
    for job in farm_jobs:
        job_cd = str(job.get("job_cd") or "").strip()
        job_name = str(job.get("job_name") or "").strip()
        if not job_cd and not job_name:
            continue
        if job_cd and job_name:
            lines.append(f"- {job_cd}: {job_name}")
        else:
            lines.append(f"- {job_cd or job_name}")
    return "\n".join(lines) if lines else "(없음)"


def _load_parcel_alias_map() -> dict[str, tuple[str, ...]]:
    global _PARCEL_ALIAS_MAP_CACHE
    if _PARCEL_ALIAS_MAP_CACHE is not None:
        return _PARCEL_ALIAS_MAP_CACHE

    path = _CONFIG_DIR / "parcel_aliases.json"
    payload = json.loads(path.read_text(encoding="utf-8"))
    alias_map: dict[str, tuple[str, ...]] = {}
    if isinstance(payload, dict):
        for key, value in payload.items():
            parcel_name = str(key or "").strip()
            if not parcel_name:
                continue
            aliases = tuple(
                str(item or "").strip()
                for item in (value if isinstance(value, list) else [])
                if str(item or "").strip()
            )
            alias_map[parcel_name] = aliases if aliases else (parcel_name,)

    _PARCEL_ALIAS_MAP_CACHE = alias_map
    return alias_map


def _row_attributes(row: dict[str, Any]) -> dict[str, Any]:
    return dict(row.get("attributes") or {}) if isinstance(row.get("attributes"), dict) else {}


def _row_block_type(row: dict[str, Any]) -> str:
    return str(_row_attributes(row).get("block_type") or "").strip()


def _row_heading_path(row: dict[str, Any]) -> str:
    return str(row.get("heading_path") or "").strip()


def _row_heading_parent(row: dict[str, Any]) -> str:
    heading_path = _row_heading_path(row)
    if not heading_path or " > " not in heading_path:
        return heading_path
    return heading_path.rsplit(" > ", 1)[0].strip()


def _row_source_order_start(row: dict[str, Any]) -> int:
    value = _row_attributes(row).get("source_order_start")
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _row_source_order_end(row: dict[str, Any]) -> int:
    value = _row_attributes(row).get("source_order_end")
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _row_table_caption(row: dict[str, Any]) -> str:
    return str(_row_attributes(row).get("table_caption") or "").strip()


def _row_table_row_role(row: dict[str, Any]) -> str:
    return str(_row_attributes(row).get("table_row_role") or "").strip()


def _row_table_header_text(row: dict[str, Any]) -> str:
    header_row = _row_attributes(row).get("header_row")
    if isinstance(header_row, list):
        return " ".join(str(item or "").strip() for item in header_row if str(item or "").strip())
    return ""


def _row_metadata_text(row: dict[str, Any]) -> str:
    attrs = _row_attributes(row)
    parts = [
        _row_heading_path(row),
        str(attrs.get("table_caption") or ""),
        str(attrs.get("table_pattern") or ""),
        str(attrs.get("table_row_role") or ""),
        str(attrs.get("location") or ""),
        str(attrs.get("block_type") or ""),
        str(row.get("chunk_loc") or ""),
        str(row.get("content") or ""),
    ]
    return " ".join(part for part in parts if part).strip()


def _is_table_like_row(row: dict[str, Any]) -> bool:
    block_type = _row_block_type(row)
    return "table" in block_type


def _is_unit_price_heading(row: dict[str, Any]) -> bool:
    haystack = " ".join([_row_heading_path(row), _row_table_caption(row), _row_table_header_text(row), str(row.get("content") or "")])
    return any(keyword in haystack for keyword in ("단가", "활동별 지원", "지원대상 활동", "ha당", "원/ha", "만원/ha"))


def _extract_labeled_activity_name(row: dict[str, Any]) -> str | None:
    names = _extract_labeled_activity_names(row)
    return names[0] if names else None


def _normalize_activity_name(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").replace("\r", " ").replace("\n", " ")).strip()


def _normalize_multiline_text(value: Any) -> str:
    text = str(value or "").replace("\r\n", "\n").replace("\r", "\n")
    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in text.split("\n")]
    return "\n".join(lines).strip()


def _extract_activity_detail_blocks(content: str) -> list[dict[str, Any]]:
    text = str(content or "").strip()
    if not text:
        return []

    pieces = [
        piece.strip()
        for piece in re.split(r"(?=^\s*(?:활동명|작업명)\s*[:：])", text, flags=re.MULTILINE)
        if piece.strip()
    ]

    blocks: list[dict[str, Any]] = []
    for piece in pieces:
        name_match = re.search(
            r"^\s*(?:활동명|작업명)\s*[:：]\s*([\s\S]*?)(?=\n\s*(?:주요\s*내용|단가)\s*[:：]|$)",
            piece,
        )
        if not name_match:
            continue

        activity_name = _normalize_activity_name(name_match.group(1) or "")
        if not activity_name:
            continue

        main_content_match = re.search(
            r"\n\s*주요\s*내용\s*[:：]\s*([\s\S]*?)(?=\n\s*단가\s*[:：]|$)",
            piece,
        )
        main_content = (
            _normalize_multiline_text(main_content_match.group(1) or "")
            if main_content_match
            else None
        )

        blocks.append(
            {
                "activity_name": activity_name,
                "source_excerpt": piece,
                "main_content": main_content or None,
                "unit_price": _extract_price_from_text(piece),
            }
        )

    return blocks


def _is_activity_detail_block_content(content: str) -> bool:
    text = str(content or "").strip()
    if not text:
        return False
    if len(_extract_activity_detail_blocks(text)) > 0:
        return True
    return bool(
        re.search(r"(?:활동명|작업명)\s*[:：]", text)
        and re.search(r"주요\s*내용\s*[:：]", text)
    )


def _extract_labeled_activity_names(row: dict[str, Any]) -> list[str]:
    content = str(row.get("content") or "").strip()
    if not content:
        return []
    detail_blocks = _extract_activity_detail_blocks(content)
    if detail_blocks:
        return [str(block.get("activity_name") or "").strip() for block in detail_blocks if str(block.get("activity_name") or "").strip()]
    names: list[str] = []
    seen_names: set[str] = set()
    for pattern in _ACTIVITY_NAME_LABEL_PATTERNS:
        for match in pattern.finditer(content):
            name = _normalize_activity_name(match.group("name") or "")
            if not name or name in seen_names:
                continue
            seen_names.add(name)
            names.append(name)
    return names


def _header_row_has_activity_label(row: dict[str, Any]) -> bool:
    joined = _row_table_header_text(row)
    return "활동명" in joined or "작업명" in joined


def _score_activity_table_keywords(row: dict[str, Any]) -> int:
    if not _is_table_like_row(row):
        return 0

    haystack = " ".join(
        [
            _row_heading_path(row),
            _row_table_caption(row),
            _row_table_header_text(row),
            str(row.get("content") or ""),
        ]
    )
    return sum(1 for keyword in _ACTIVITY_TABLE_KEYWORDS if keyword in haystack)


def _is_activity_price_table_row(row: dict[str, Any]) -> bool:
    return _score_activity_table_keywords(row) > 0


def _heading_similarity(left: str, right: str) -> int:
    if not left or not right:
        return 0
    if left == right:
        return 3
    if left.startswith(right) or right.startswith(left):
        return 2
    left_parent = left.rsplit(" > ", 1)[0].strip() if " > " in left else left
    right_parent = right.rsplit(" > ", 1)[0].strip() if " > " in right else right
    if left_parent and left_parent == right_parent:
        return 1
    return 0


def _expand_rows_by_heading_neighbors(seed_rows: list[dict[str, Any]], all_rows: list[dict[str, Any]], *, max_neighbors: int = 2) -> list[dict[str, Any]]:
    if not seed_rows:
        return []

    selected: list[dict[str, Any]] = []
    seen_chunk_ids: set[str] = set()
    seed_heading_paths = {_row_heading_path(row) for row in seed_rows if _row_heading_path(row)}
    seed_heading_parents = {_row_heading_parent(row) for row in seed_rows if _row_heading_parent(row)}
    seed_ranges = [(_row_source_order_start(row), _row_source_order_end(row)) for row in seed_rows]

    for row in all_rows:
        chunk_id = str(row.get("chunk_id") or "").strip()
        if not chunk_id or chunk_id in seen_chunk_ids:
            continue

        heading_path = _row_heading_path(row)
        heading_parent = _row_heading_parent(row)
        source_start = _row_source_order_start(row)
        source_end = _row_source_order_end(row)

        exact_heading = heading_path and heading_path in seed_heading_paths
        parent_heading = heading_parent and heading_parent in seed_heading_parents
        near_range = any(
            (
                (source_start and abs(source_start - seed_start) <= max_neighbors)
                or (source_end and abs(source_end - seed_end) <= max_neighbors)
            )
            for seed_start, seed_end in seed_ranges
        )
        if not (exact_heading or parent_heading or near_range):
            continue

        selected.append(row)
        seen_chunk_ids.add(chunk_id)

    return selected


def _score_basic_context(row: dict[str, Any]) -> int:
    score = 0
    haystack = _row_metadata_text(row)
    lowered = haystack.lower()
    for keyword in _BASIC_CONTEXT_KEYWORDS:
        if keyword in haystack:
            score += 4
    if re.search(r"20\d{2}", haystack):
        score += 2
    if re.search(r"20\d{2}[./-]\s*\d{1,2}[./-]\s*\d{1,2}", haystack):
        score += 4
    if "공고" in haystack:
        score += 3
    if "issuer" in lowered:
        score += 1
    if _is_table_like_row(row):
        score += 1
    if _is_unit_price_heading(row):
        score += 1
    return score


def _score_activity_context(row: dict[str, Any]) -> int:
    score = 0
    haystack = _row_metadata_text(row)
    for keyword in _ACTIVITY_CONTEXT_KEYWORDS:
        if keyword in haystack:
            score += 4
    if "활동" in haystack or "작업" in haystack:
        score += 3
    if _is_table_like_row(row):
        score += 2
    if _row_table_row_role(row) == "data_row":
        score += 2
    if _is_unit_price_heading(row):
        score += 4
    return score


def _build_basic_context(file_row: dict[str, Any], vector_rows: list[dict[str, Any]]) -> str:
    scored_rows = sorted(vector_rows, key=_score_basic_context, reverse=True)
    seed_rows = [row for row in scored_rows[:10] if _score_basic_context(row) > 0]
    selected = _expand_rows_by_heading_neighbors(seed_rows, vector_rows, max_neighbors=2)

    lines = [
        "[문서 메타]",
        f"- file_id: {file_row.get('file_id') or ''}",
        f"- doc_name: {file_row.get('doc_name') or ''}",
        f"- file_name: {file_row.get('file_name') or ''}",
        f"- doc_cat: {file_row.get('doc_cat') or ''}",
        f"- publication_date: {file_row.get('publication_date') or ''}",
        f"- doc_number: {file_row.get('doc_number') or ''}",
        f"- doc_manager: {file_row.get('doc_manager') or ''}",
        "",
    ]

    for idx, row in enumerate(selected, start=1):
        heading_path = str(row.get("heading_path") or "").strip()
        chunk_loc = str(row.get("chunk_loc") or "").strip()
        content = str(row.get("content") or "").strip()
        if not content:
            continue
        header = f"[본문 {idx}]"
        if heading_path:
            header += f" heading={heading_path}"
        if chunk_loc:
            header += f" loc={chunk_loc}"
        lines.append(header)
        lines.append(content)
        lines.append("")

    return "\n".join(lines).strip()


def _build_activity_context(file_row: dict[str, Any], vector_rows: list[dict[str, Any]]) -> str:
    scored_rows = sorted(vector_rows, key=_score_activity_context, reverse=True)
    seed_rows = [row for row in scored_rows[:12] if _score_activity_context(row) > 0]
    selected = _expand_rows_by_heading_neighbors(seed_rows, vector_rows, max_neighbors=3)

    lines = [
        "[문서 메타]",
        f"- file_id: {file_row.get('file_id') or ''}",
        f"- doc_name: {file_row.get('doc_name') or ''}",
        f"- file_name: {file_row.get('file_name') or ''}",
        "",
    ]

    for idx, row in enumerate(selected, start=1):
        heading_path = str(row.get("heading_path") or "").strip()
        content = str(row.get("content") or "").strip()
        if not content:
            continue
        header = f"[본문 {idx}]"
        if heading_path:
            header += f" heading={heading_path}"
        lines.append(header)
        lines.append(content)
        lines.append("")

    return "\n".join(lines).strip()


def _normalize_text_for_match(value: Any) -> str:
    return re.sub(r"\s+", "", str(value or "").strip()).lower()


def _tokenize_korean_text(value: Any) -> list[str]:
    text = str(value or "").strip().lower()
    return [token for token in re.split(r"[^0-9a-zA-Z가-힣]+", text) if token]


def _mmdd_to_iso_date(mmdd: str | None, year: int | None) -> str | None:
    text = str(mmdd or "").strip()
    if not text or len(text) != 4 or not text.isdigit() or not year:
        return None
    try:
        return date(year, int(text[:2]), int(text[2:])).isoformat()
    except ValueError:
        return None


def _parse_iso_date(value: str | None) -> date | None:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        return date.fromisoformat(text)
    except ValueError:
        return None


def _extract_max_interval_days(text: str) -> int | None:
    raw_text = str(text or "").strip()
    if not raw_text:
        return None
    patterns = (
        r"최대\s*간격(?:은|은)?\s*(\d+)\s*일",
        r"최대\s*(\d+)\s*일\s*이내",
        r"간격(?:은|은)?\s*(\d+)\s*일\s*이내",
        r"(\d+)\s*일\s*이내",
    )
    for pattern in patterns:
        match = re.search(pattern, raw_text)
        if not match:
            continue
        try:
            days = int(match.group(1))
        except (TypeError, ValueError):
            continue
        if days > 0:
            return days
    return None


def _apply_schedule_context_constraints(
    *,
    main_content: str,
    est_start_date: str | None,
    est_end_date: str | None,
) -> tuple[str | None, str | None]:
    max_interval_days = _extract_max_interval_days(main_content)
    if not max_interval_days:
        return est_start_date, est_end_date

    start_date = _parse_iso_date(est_start_date)
    end_date = _parse_iso_date(est_end_date)
    if not start_date:
        return est_start_date, est_end_date

    max_end_date = start_date + timedelta(days=max_interval_days)
    if end_date is None or end_date > max_end_date:
        return est_start_date, max_end_date.isoformat()
    return est_start_date, est_end_date


def _similarity_score(left: str, right: str) -> float:
    normalized_left = _normalize_text_for_match(left)
    normalized_right = _normalize_text_for_match(right)
    if not normalized_left or not normalized_right:
        return 0.0
    if normalized_left == normalized_right:
        return 1.0

    ratio = SequenceMatcher(None, normalized_left, normalized_right).ratio()
    contains_bonus = 0.12 if normalized_left in normalized_right or normalized_right in normalized_left else 0.0

    left_tokens = set(_tokenize_korean_text(left))
    right_tokens = set(_tokenize_korean_text(right))
    token_overlap = len(left_tokens & right_tokens) / max(1, len(left_tokens | right_tokens))
    return min(1.0, ratio * 0.72 + token_overlap * 0.28 + contains_bonus)


def _suggest_schedule_from_farm_job(
    *,
    activity_name: str,
    main_content: str,
    matched_rows: list[dict[str, Any]],
    exec_year: int | None,
) -> dict[str, Any] | None:
    farm_jobs = project_rdb.list_farm_job_catalog()
    if not farm_jobs:
        return None

    context_text = " ".join(str(row.get("content") or "") for row in matched_rows if row.get("content"))
    best_item: dict[str, Any] | None = None
    best_score = 0.0

    for job in farm_jobs:
        job_name = str(job.get("job_name") or "").strip()
        if not job_name:
            continue

        score = _similarity_score(activity_name, job_name)
        if context_text:
            score += min(0.18, _similarity_score(context_text, job_name) * 0.18)
            job_desc = str(job.get("job_desc") or "").strip()
            if job_desc:
                score += min(0.12, _similarity_score(context_text, job_desc) * 0.12)

        if score > best_score:
            best_score = score
            best_item = job

    if not best_item or best_score < 0.46:
        return None

    est_start_date = _mmdd_to_iso_date(best_item.get("start_mmdd"), exec_year)
    est_end_date = _mmdd_to_iso_date(best_item.get("end_mmdd"), exec_year)
    est_start_date, est_end_date = _apply_schedule_context_constraints(
        main_content=main_content,
        est_start_date=est_start_date,
        est_end_date=est_end_date,
    )

    return {
        "job_cd": str(best_item.get("job_cd") or "").strip() or None,
        "job_name": str(best_item.get("job_name") or "").strip() or None,
        "match_score": round(best_score, 4),
        "start_mmdd": str(best_item.get("start_mmdd") or "").strip() or None,
        "end_mmdd": str(best_item.get("end_mmdd") or "").strip() or None,
        "est_start_date": est_start_date,
        "est_end_date": est_end_date,
    }


def _parcel_aliases_for_name(parcel_name: str) -> tuple[str, ...]:
    normalized = str(parcel_name or "").strip()
    aliases = _load_parcel_alias_map().get(normalized)
    if aliases:
        return aliases
    return (normalized,)


def _project_title_has_field_crop_constraint(project_name: str) -> bool:
    normalized = _normalize_text_for_match(project_name)
    return "경종" in normalized


def _apply_project_title_constraint_codes(
    project_name: str,
    selected_codes: list[str],
    parcel_options: list[dict[str, Any]],
) -> list[str]:
    if not _project_title_has_field_crop_constraint(project_name):
        return selected_codes
    allowed_names = {"논", "밭", "과수원"}
    constrained_codes: list[str] = []
    for option in parcel_options:
        code = str(option.get("code") or "").strip()
        code_name = str(option.get("code_name") or "").strip()
        if code in selected_codes and code_name in allowed_names:
            constrained_codes.append(code)
    return constrained_codes or selected_codes


def _alias_is_negated(text: str, alias: str) -> bool:
    raw_text = str(text or "")
    token = re.escape(str(alias or "").strip())
    if not raw_text or not token:
        return False
    negation_patterns = (
        rf"{token}\s*(?:을|를|은|는|이|가)?\s*제외",
        rf"{token}\s*(?:을|를|은|는|이|가)?\s*빼고",
        rf"{token}\s*(?:을|를|은|는|이|가)?\s*말고",
        rf"{token}\s*(?:을|를|은|는|이|가)?\s*아닌",
        rf"제외(?:한|하고)?\s*{token}",
        rf"빼고\s*{token}",
        rf"말고\s*{token}",
    )
    return any(re.search(pattern, raw_text) for pattern in negation_patterns)


def _alias_matches_text(text: str, alias: str) -> bool:
    raw_text = str(text or "")
    normalized_alias = _normalize_text_for_match(alias)
    normalized_text = _normalize_text_for_match(raw_text)
    if not raw_text or not normalized_alias or not normalized_text:
        return False

    # 한 글자 별칭은 오탐이 많아서 단독 토큰/구분자 경계가 있을 때만 인정한다.
    if len(normalized_alias) == 1:
        pattern = rf"(^|[^0-9A-Za-z가-힣]){re.escape(str(alias).strip())}([^0-9A-Za-z가-힣]|$)"
        return re.search(pattern, raw_text) is not None

    return normalized_alias in normalized_text


def _extract_parcel_codes_from_text(
    text: str,
    parcel_options: list[dict[str, Any]],
) -> list[str]:
    raw_text = str(text or "").strip()
    if not raw_text:
        return []
    selected_codes: list[str] = []
    for option in parcel_options:
        code = str(option.get("code") or "").strip()
        code_name = str(option.get("code_name") or "").strip()
        if not code or not code_name:
            continue
        aliases = _parcel_aliases_for_name(code_name)
        matched = any(_alias_matches_text(raw_text, alias) for alias in aliases if alias)
        negated = any(_alias_is_negated(raw_text, alias) for alias in aliases if alias)
        if matched and not negated:
            selected_codes.append(code)
    return selected_codes


def _apply_general_parcel_heuristics(
    *,
    project_name: str,
    activity_name: str,
    main_content: str,
    selected_codes: list[str],
    parcel_options: list[dict[str, Any]],
    allow_generic_expansion: bool,
) -> list[str]:
    next_codes = list(selected_codes)
    if not allow_generic_expansion:
        return next_codes
    context_only_text = f"{main_content} {activity_name}".strip()
    normalized_general = _normalize_text_for_match(context_only_text)
    if (
        any(keyword in normalized_general for keyword in ("논밭", "작물재배", "재배전필지", "농경지", "경작지"))
        and not any(
            str(option.get("code_name") or "").strip() in {"과수원", "축사", "산림"}
            for option in parcel_options
            if str(option.get("code") or "").strip() in next_codes
        )
    ):
        for option in parcel_options:
            code = str(option.get("code") or "").strip()
            code_name = str(option.get("code_name") or "").strip()
            if code_name in {"논", "밭"} and code not in next_codes:
                next_codes.append(code)
    return _apply_project_title_constraint_codes(project_name, next_codes, parcel_options)


def _needs_semantic_parcel_inference(main_content: str, activity_name: str) -> bool:
    text = _normalize_text_for_match(f"{activity_name} {main_content}")
    return any(
        keyword in text
        for keyword in (
            "관계없이",
            "가능한농지",
            "경작가능한농지",
            "경운가능한농지",
            "농지전반",
            "모든농지",
            "재배품목과관계없이",
            "지목과관계없이",
        )
    )


def _infer_broad_field_crop_codes_from_text(
    *,
    project_name: str,
    main_content: str,
    parcel_options: list[dict[str, Any]],
) -> list[str]:
    normalized_text = _normalize_text_for_match(main_content)
    if not normalized_text:
        return []

    has_relationless_phrase = any(
        keyword in normalized_text
        for keyword in (
            "지목재배품목과관계없이",
            "재배품목과관계없이",
            "지목과관계없이",
            "품목과관계없이",
        )
    )
    has_broad_farmland_phrase = any(
        keyword in normalized_text
        for keyword in (
            "경운가능한농지",
            "경작가능한농지",
            "가능한농지",
            "농지",
        )
    )
    if not (has_relationless_phrase and has_broad_farmland_phrase):
        return []

    selected_codes: list[str] = []
    for option in parcel_options:
        code = str(option.get("code") or "").strip()
        code_name = str(option.get("code_name") or "").strip()
        if code_name in {"논", "밭", "과수원"} and code:
            selected_codes.append(code)

    return _apply_project_title_constraint_codes(project_name, selected_codes, parcel_options)


def _detect_parcel_codes_rule_based(
    *,
    project_name: str,
    activity_name: str,
    main_content: str,
    matched_rows: list[dict[str, Any]],
    parcel_options: list[dict[str, Any]],
) -> dict[str, Any]:
    main_content_candidates = _extract_parcel_codes_from_text(main_content, parcel_options)
    broad_field_crop_codes = _infer_broad_field_crop_codes_from_text(
        project_name=project_name,
        main_content=main_content,
        parcel_options=parcel_options,
    )
    if broad_field_crop_codes:
        for code in broad_field_crop_codes:
            if code not in main_content_candidates:
                main_content_candidates.append(code)
    if main_content_candidates:
        return {
            "selected_codes": _apply_general_parcel_heuristics(
                project_name=project_name,
                activity_name=activity_name,
                main_content=main_content,
                selected_codes=main_content_candidates,
                parcel_options=parcel_options,
                allow_generic_expansion=False,
            ),
            "source_scope": "main_content",
        }

    full_rag_text = " ".join(str(row.get("content") or "") for row in matched_rows if row.get("content"))
    rag_candidates = _extract_parcel_codes_from_text(full_rag_text, parcel_options)
    rag_candidates = _apply_general_parcel_heuristics(
        project_name=project_name,
        activity_name=activity_name,
        main_content=main_content,
        selected_codes=rag_candidates,
        parcel_options=parcel_options,
        allow_generic_expansion=not bool(rag_candidates),
    )
    return {
        "selected_codes": rag_candidates,
        "source_scope": "full_rag" if rag_candidates else "none",
    }


def _llm_select_parcel_codes(
    *,
    project_name: str,
    activity_name: str,
    main_content: str,
    context_text: str,
    parcel_options: list[dict[str, Any]],
    rule_candidate_codes: list[str],
    source_scope: str,
) -> list[str]:
    if ChatOpenAI is None or ChatPromptTemplate is None:
        return rule_candidate_codes

    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        return rule_candidate_codes

    candidate_labels = [
        {
            "code": str(option.get("code") or "").strip(),
            "code_name": str(option.get("code_name") or "").strip(),
        }
        for option in parcel_options
        if str(option.get("code") or "").strip() and str(option.get("code_name") or "").strip()
    ]
    if not candidate_labels:
        return rule_candidate_codes

    prompt = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                _load_prompt("parcel_suggestion_system.txt"),
            ),
            (
                "human",
                """프로젝트명: {project_name}
활동명: {activity_name}
주요 내용: {main_content}
판정 범위: {source_scope}
RAG 추가 문맥:
{context_text}

농지 후보:
{parcel_options_json}

규칙 기반 1차 후보:
{rule_candidates_json}

JSON만 반환해줘.""",
            ),
        ]
    )

    try:
        llm = ChatOpenAI(
            api_key=api_key,
            model=os.getenv("OPENAI_MODEL", "gpt-4.1-mini").strip() or "gpt-4.1-mini",
            temperature=0,
        )
        response = (prompt | llm).invoke(
            {
                "project_name": project_name,
                "activity_name": activity_name,
                "main_content": main_content,
                "source_scope": source_scope,
                "context_text": context_text,
                "parcel_options_json": json.dumps(candidate_labels, ensure_ascii=False),
                "rule_candidates_json": json.dumps(rule_candidate_codes, ensure_ascii=False),
            }
        )
        parsed = json.loads(str(getattr(response, "content", "") or "").strip())
        selected_codes = [
            str(code).strip()
            for code in (parsed.get("selected_codes") or [])
            if str(code).strip()
        ]
        valid_codes = {item["code"] for item in candidate_labels}
        filtered = [code for code in selected_codes if code in valid_codes]
        return filtered or rule_candidate_codes
    except Exception:  # noqa: BLE001
        return rule_candidate_codes


def _llm_infer_parcel_codes_from_semantics(
    *,
    project_name: str,
    activity_name: str,
    main_content: str,
    context_text: str,
    parcel_options: list[dict[str, Any]],
) -> list[str]:
    if ChatOpenAI is None or ChatPromptTemplate is None:
        return []
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        return []

    candidate_labels = [
        {
            "code": str(option.get("code") or "").strip(),
            "code_name": str(option.get("code_name") or "").strip(),
        }
        for option in parcel_options
        if str(option.get("code") or "").strip() and str(option.get("code_name") or "").strip()
    ]
    if not candidate_labels:
        return []

    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", _load_prompt("parcel_inference_system.txt")),
            (
                "human",
                """프로젝트명: {project_name}
활동명: {activity_name}
주요 내용: {main_content}
추가 문맥:
{context_text}

농지 후보:
{parcel_options_json}

JSON만 반환해줘.""",
            ),
        ]
    )
    try:
        llm = ChatOpenAI(
            api_key=api_key,
            model=os.getenv("OPENAI_MODEL", "gpt-4.1-mini").strip() or "gpt-4.1-mini",
            temperature=0,
        )
        response = (prompt | llm).invoke(
            {
                "project_name": project_name,
                "activity_name": activity_name,
                "main_content": main_content,
                "context_text": context_text,
                "parcel_options_json": json.dumps(candidate_labels, ensure_ascii=False),
            }
        )
        parsed = json.loads(str(getattr(response, "content", "") or "").strip())
        selected_codes = [
            str(code).strip()
            for code in (parsed.get("selected_codes") or [])
            if str(code).strip()
        ]
        valid_codes = {item["code"] for item in candidate_labels}
        filtered = [code for code in selected_codes if code in valid_codes]
        return filtered
    except Exception:  # noqa: BLE001
        return []


def _llm_validate_selected_parcels(
    *,
    project_name: str,
    activity_name: str,
    main_content: str,
    context_text: str,
    parcel_options: list[dict[str, Any]],
    selected_codes: list[str],
) -> list[str]:
    if not selected_codes:
        return []
    if ChatOpenAI is None or ChatPromptTemplate is None:
        return selected_codes

    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        return selected_codes

    candidate_labels = [
        {
            "code": str(option.get("code") or "").strip(),
            "code_name": str(option.get("code_name") or "").strip(),
        }
        for option in parcel_options
        if str(option.get("code") or "").strip() in selected_codes
    ]
    if not candidate_labels:
        return selected_codes

    prompt = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                _load_prompt("parcel_validation_system.txt"),
            ),
            (
                "human",
                """프로젝트명: {project_name}
활동명: {activity_name}
주요 내용: {main_content}
추가 문맥:
{context_text}

검토할 농지 후보:
{selected_candidates_json}

JSON만 반환해줘.""",
            ),
        ]
    )

    try:
        llm = ChatOpenAI(
            api_key=api_key,
            model=os.getenv("OPENAI_MODEL", "gpt-4.1-mini").strip() or "gpt-4.1-mini",
            temperature=0,
        )
        response = (prompt | llm).invoke(
            {
                "project_name": project_name,
                "activity_name": activity_name,
                "main_content": main_content,
                "context_text": context_text,
                "selected_candidates_json": json.dumps(candidate_labels, ensure_ascii=False),
            }
        )
        parsed = json.loads(str(getattr(response, "content", "") or "").strip())
        confirmed_codes = [
            str(code).strip()
            for code in (parsed.get("confirmed_codes") or [])
            if str(code).strip()
        ]
        valid_codes = {item["code"] for item in candidate_labels}
        filtered = [code for code in confirmed_codes if code in valid_codes]
        return filtered or selected_codes
    except Exception:  # noqa: BLE001
        return selected_codes


def _suggest_parcel_codes(
    *,
    project_name: str,
    activity_name: str,
    main_content: str,
    matched_rows: list[dict[str, Any]],
) -> dict[str, Any]:
    parcel_options = project_rdb.list_parcel_code_options()
    rule_based = _detect_parcel_codes_rule_based(
        project_name=project_name,
        activity_name=activity_name,
        main_content=main_content,
        matched_rows=matched_rows,
        parcel_options=parcel_options,
    )
    rule_candidate_codes = list(rule_based.get("selected_codes") or [])
    source_scope = str(rule_based.get("source_scope") or "none")
    if source_scope == "main_content":
        llm_context_text = main_content
    else:
        llm_context_text = "\n\n".join(
            str(row.get("content") or "").strip()
            for row in matched_rows[:8]
            if str(row.get("content") or "").strip()
        )
    if not rule_candidate_codes and _needs_semantic_parcel_inference(main_content, activity_name):
        semantic_codes = _llm_infer_parcel_codes_from_semantics(
            project_name=project_name,
            activity_name=activity_name,
            main_content=main_content,
            context_text=llm_context_text,
            parcel_options=parcel_options,
        )
        rule_candidate_codes = _apply_project_title_constraint_codes(
            project_name,
            semantic_codes,
            parcel_options,
        )
        if rule_candidate_codes:
            source_scope = "semantic_inference"
    selected_codes = _llm_select_parcel_codes(
        project_name=project_name,
        activity_name=activity_name,
        main_content=main_content,
        context_text=llm_context_text,
        parcel_options=parcel_options,
        rule_candidate_codes=rule_candidate_codes,
        source_scope=source_scope,
    )
    confirmed_codes = _llm_validate_selected_parcels(
        project_name=project_name,
        activity_name=activity_name,
        main_content=main_content,
        context_text=llm_context_text,
        parcel_options=parcel_options,
        selected_codes=_apply_project_title_constraint_codes(project_name, selected_codes, parcel_options),
    )
    code_name_map = {
        str(option.get("code") or "").strip(): str(option.get("code_name") or "").strip()
        for option in parcel_options
    }
    return {
        "selected_codes": confirmed_codes,
        "selected_names": [code_name_map[code] for code in confirmed_codes if code in code_name_map],
        "rule_candidate_codes": rule_candidate_codes,
        "source_scope": source_scope,
    }


def _text_contains_all_tokens(content: str, text: str) -> bool:
    tokens = [token for token in re.split(r"\s+", str(text or "").strip()) if token]
    if not tokens:
        return False
    return all(token.lower() in content.lower() for token in tokens)


def _extract_price_from_text(content: str) -> dict[str, Any] | None:
    for pattern, multiplier in _PRICE_PATTERNS:
        match = pattern.search(content)
        if not match:
            continue
        digits = str(match.group("amount") or "").replace(",", "").strip()
        try:
            base_amount = float(digits)
        except ValueError:
            continue
        amount = int(round(base_amount * multiplier))
        return {
            "amount": amount,
            "raw_text": match.group(0),
        }
    return None


def _extract_activity_detail_from_content(content: str, target_activity_name: str) -> dict[str, Any]:
    normalized_target_name = _normalize_text_for_match(target_activity_name)
    if not normalized_target_name:
        return {}

    for block in _extract_activity_detail_blocks(str(content or "")):
        if _normalize_text_for_match(block.get("activity_name")) != normalized_target_name:
            continue
        return block

    return {}


def _extract_price_for_job(job_name: str, matched_rows: list[dict[str, Any]]) -> dict[str, Any] | None:
    normalized_job_name = _normalize_text_for_match(job_name)
    table_candidates: list[dict[str, Any]] = []
    text_candidates: list[dict[str, Any]] = []

    for row in matched_rows:
        content = str(row.get("content") or "").strip()
        if not content:
            continue
        normalized_content = _normalize_text_for_match(content)
        if normalized_job_name and normalized_job_name not in normalized_content and not _text_contains_all_tokens(content, job_name):
            continue
        price = _extract_price_from_text(content)
        if not price:
            continue
        candidate = {
            "amount": price["amount"],
            "raw_text": price["raw_text"],
            "content": content,
            "heading_path": row.get("heading_path"),
            "table_caption": _row_table_caption(row),
            "table_row_role": _row_table_row_role(row),
            "labeled_activity_name": _extract_labeled_activity_name(row),
        }
        if _is_table_like_row(row):
            table_candidates.append(candidate)
        else:
            text_candidates.append(candidate)

    table_candidates.sort(
        key=lambda item: (
            1 if any(keyword in str(item.get("table_caption") or "") for keyword in _ACTIVITY_TABLE_KEYWORDS) else 0,
            1 if any(keyword in str(item.get("table_caption") or "") for keyword in ("단가", "지원대상 활동", "활동별 지원")) else 0,
            1 if str(item.get("table_row_role") or "") == "data_row" else 0,
            int(item.get("amount") or 0),
        ),
        reverse=True,
    )
    if table_candidates:
        return table_candidates[0]
    if text_candidates:
        return text_candidates[0]
    return None


def _build_rag_activity_label(job_name: str, matched_rows: list[dict[str, Any]]) -> str:
    for row in matched_rows:
        labeled_names = _extract_labeled_activity_names(row)
        if labeled_names:
            return labeled_names[0]

    normalized_job_name = _normalize_text_for_match(job_name)
    for row in matched_rows:
        content = str(row.get("content") or "").strip()
        if not content:
            continue
        if normalized_job_name and normalized_job_name in _normalize_text_for_match(content):
            if _is_table_like_row(row):
                parts = [part.strip() for part in re.split(r"\||/|,|\n", content) if part.strip()]
                for part in parts:
                    if normalized_job_name in _normalize_text_for_match(part):
                        return part
            return job_name
    return job_name


def _score_job_against_row(job: dict[str, Any], row: dict[str, Any]) -> int:
    job_name = str(job.get("job_name") or "").strip()
    job_desc = str(job.get("job_desc") or "").strip()
    if not job_name:
        return 0

    content = str(row.get("content") or "").strip()
    if not content:
        return 0

    normalized_content = _normalize_text_for_match(content)
    normalized_job_name = _normalize_text_for_match(job_name)
    metadata_text = _row_metadata_text(row)
    score = 0
    labeled_activity_name = _extract_labeled_activity_name(row)
    normalized_labeled_name = _normalize_text_for_match(labeled_activity_name)

    if normalized_job_name and normalized_job_name in normalized_content:
        score += 20
    elif _text_contains_all_tokens(content, job_name):
        score += 10

    if normalized_job_name and normalized_labeled_name:
        if normalized_job_name == normalized_labeled_name:
            score += 40
        elif normalized_job_name in normalized_labeled_name or normalized_labeled_name in normalized_job_name:
            score += 18

    if labeled_activity_name and _is_table_like_row(row):
        score += 10
    if _header_row_has_activity_label(row):
        score += 8

    heading_bonus = _heading_similarity(_row_heading_path(row), job_name)
    if heading_bonus:
        score += heading_bonus * 3

    table_caption = _row_table_caption(row)
    if table_caption and _text_contains_all_tokens(table_caption, job_name):
        score += 8

    if job_desc:
        desc_tokens = [token for token in re.split(r"[\s,/()\[\]-]+", job_desc) if len(token) >= 2]
        score += min(6, sum(1 for token in desc_tokens if token.lower() in metadata_text.lower()))

    if _is_table_like_row(row):
        score += 2
    if _row_table_row_role(row) == "data_row":
        score += 3
    if _is_unit_price_heading(row):
        score += 4

    if _extract_price_from_text(content):
        score += 2

    return score


def _count_exact_labeled_matches(job_name: str, rows: list[dict[str, Any]]) -> int:
    normalized_job_name = _normalize_text_for_match(job_name)
    if not normalized_job_name:
        return 0

    count = 0
    for row in rows:
        labeled_names = _extract_labeled_activity_names(row)
        if any(_normalize_text_for_match(name) == normalized_job_name for name in labeled_names):
            count += 1
    return count


def _count_activity_header_rows(rows: list[dict[str, Any]]) -> int:
    return sum(1 for row in rows if _header_row_has_activity_label(row))


def _build_heading_context_lines(rows: list[dict[str, Any]], heading_path: str | None) -> list[str]:
    normalized_heading = str(heading_path or "").strip()
    filtered_rows = rows
    if normalized_heading:
        same_section_rows = [
            row
            for row in rows
            if _row_heading_path(row) == normalized_heading
            or _row_heading_path(row).startswith(f"{normalized_heading} > ")
        ]
        if same_section_rows:
            filtered_rows = same_section_rows

    ordered_rows = sorted(
        filtered_rows,
        key=lambda row: (
            _row_source_order_start(row),
            _row_source_order_end(row),
            str(row.get("chunk_id") or ""),
        ),
    )

    lines: list[str] = []
    seen_contents: set[str] = set()
    for row in ordered_rows:
        content = str(row.get("content") or "").strip()
        if not content or content in seen_contents:
            continue
        if normalized_heading and content == normalized_heading:
            continue
        if _is_table_like_row(row):
            continue
        if _is_activity_detail_block_content(content):
            continue
        seen_contents.add(content)
        lines.append(content)
    return lines


def _split_description_sentences(text: str) -> list[str]:
    normalized = str(text or "").strip()
    if not normalized:
        return []
    pieces = re.split(r"\n+", normalized)
    return [piece.strip() for piece in pieces if piece.strip()]


def _is_relevant_activity_sentence(sentence: str, activity_name: str) -> bool:
    normalized_sentence = _normalize_text_for_match(sentence)
    normalized_activity_name = _normalize_text_for_match(activity_name)
    if not normalized_sentence or not normalized_activity_name:
        return False
    if normalized_activity_name in normalized_sentence:
        return True

    sentence_tokens = set(_tokenize_korean_text(sentence))
    activity_tokens = set(_tokenize_korean_text(activity_name))
    if activity_tokens and sentence_tokens.intersection(activity_tokens):
        return True

    return _similarity_score(sentence, activity_name) >= 0.52


def _is_relevant_supplement_line(
    sentence: str,
    activity_name: str,
    main_content: str,
) -> bool:
    if _is_relevant_activity_sentence(sentence, activity_name):
        return True

    normalized_sentence = _normalize_text_for_match(sentence)
    normalized_main_content = _normalize_text_for_match(main_content)
    if not normalized_sentence or not normalized_main_content:
        return False
    if normalized_sentence in normalized_main_content or normalized_main_content in normalized_sentence:
        return True

    sentence_tokens = set(_tokenize_korean_text(sentence))
    main_content_tokens = {
        token
        for token in _tokenize_korean_text(main_content)
        if len(token) >= 2
    }
    if sentence_tokens and main_content_tokens and len(sentence_tokens.intersection(main_content_tokens)) >= 2:
        return True

    return _similarity_score(sentence, main_content) >= 0.42


def _is_activity_metadata_line(sentence: str, activity_name: str) -> bool:
    normalized_sentence = str(sentence or "").strip()
    if not normalized_sentence:
        return False
    matched = re.match(r"^(?:활동명|작업명)\s*[:：]\s*(.+)$", normalized_sentence)
    if not matched:
        return False
    labeled_name = _normalize_text_for_match(matched.group(1))
    normalized_activity_name = _normalize_text_for_match(activity_name)
    return bool(labeled_name and normalized_activity_name and labeled_name == normalized_activity_name)


def _strip_description_label(sentence: str) -> str:
    normalized_sentence = str(sentence or "").strip()
    if not normalized_sentence:
        return ""
    return re.sub(r"^(?:주요\s*내용|활동명|작업명)\s*[:：]\s*", "", normalized_sentence).strip()


def _build_activity_description_suggestion(
    activity_name: str,
    main_content: str,
    source_excerpt: str | None,
    heading_context_lines: list[str] | None,
) -> str | None:
    candidates: list[str] = []
    seen_sentences: set[str] = set()
    normalized_main_content = _normalize_text_for_match(_strip_description_label(main_content))

    def add_sentence(text: str, *, require_relevance: bool) -> None:
        for sentence in _split_description_sentences(text):
            normalized_sentence = _normalize_text_for_match(sentence)
            normalized_sentence_without_label = _normalize_text_for_match(_strip_description_label(sentence))
            if not normalized_sentence or normalized_sentence in seen_sentences:
                continue
            if _is_activity_metadata_line(sentence, activity_name):
                continue
            if (
                normalized_main_content
                and normalized_sentence_without_label
                and normalized_sentence_without_label == normalized_main_content
            ):
                continue
            if require_relevance and not _is_relevant_supplement_line(sentence, activity_name, main_content):
                continue
            seen_sentences.add(normalized_sentence)
            candidates.append(sentence)

    add_sentence(main_content, require_relevance=False)
    for line in heading_context_lines or []:
        add_sentence(line, require_relevance=True)

    if not candidates:
        return str(main_content or "").strip() or None
    return "\n".join(candidates).strip() or None


def _empty_activity_rule(activity_name: str) -> dict[str, Any]:
    return {
        "활동명": activity_name,
        "시작일": {},
        "종료일": {},
        "증빙조건": {},
    }


def _extract_evidence_basis_line(*texts: Any) -> str:
    for text in texts:
        if isinstance(text, (list, tuple)):
            iterable = [str(item or "").strip() for item in text if str(item or "").strip()]
        else:
            iterable = [str(text or "").strip()]
        for item in iterable:
            if not item:
                continue
            for line in item.splitlines():
                stripped = line.strip()
                if "(증빙방법)" in stripped or "증빙방법" in stripped:
                    return stripped
    return ""


def _normalize_rule_reference_job_name(reference_job: str) -> str:
    candidate = str(reference_job or "").strip()
    if not candidate:
        return ""
    if candidate in {"본활동", "시작일", "종료일"}:
        return candidate

    normalized_candidate = _normalize_text_for_match(candidate)
    for job in project_rdb.list_farm_job_catalog():
        job_cd = str(job.get("job_cd") or "").strip()
        job_name = str(job.get("job_name") or "").strip()
        if not job_name:
            continue
        if candidate == job_cd:
            return job_name
        if normalized_candidate and normalized_candidate == _normalize_text_for_match(job_name):
            return job_name
    return candidate


def _extract_min_duration_days(text: str) -> int | None:
    raw_text = str(text or "").strip()
    if not raw_text:
        return None

    repeat_interval_match = re.search(r"(\d+)\s*회\s*[\[\(]\s*최소\s*(\d+)\s*일\s*간격\s*[\]\)]", raw_text)
    if repeat_interval_match:
        try:
            repeat_count = int(repeat_interval_match.group(1))
            interval_days = int(repeat_interval_match.group(2))
        except (TypeError, ValueError):
            repeat_count = 0
            interval_days = 0
        if repeat_count > 1 and interval_days > 0:
            return (repeat_count - 1) * interval_days

    week_match = re.search(r"(\d+)\s*주\s*이상", raw_text)
    if week_match:
        try:
            weeks = int(week_match.group(1))
        except (TypeError, ValueError):
            weeks = 0
        if weeks > 0:
            return weeks * 7

    day_match = re.search(r"(\d+)\s*일\s*이상", raw_text)
    if day_match:
        try:
            days = int(day_match.group(1))
        except (TypeError, ValueError):
            days = 0
        if days > 0:
            return days
    return None


def _derive_unregistered_reference_job_from_basis(
    *,
    basis_text: str,
    activity_name: str,
) -> str:
    raw_basis = str(basis_text or "").strip()
    if not raw_basis:
        return ""

    patterns = (
        r"([가-힣A-Za-z0-9\s]+?)\s*이전시기",
        r"([가-힣A-Za-z0-9\s]+?)\s*이전",
        r"([가-힣A-Za-z0-9\s]+?)\s*이후시기",
        r"([가-힣A-Za-z0-9\s]+?)\s*이후",
    )
    normalized_activity_name = _normalize_text_for_match(activity_name)
    for pattern in patterns:
        matched = re.search(pattern, raw_basis)
        if not matched:
            continue
        candidate = str(matched.group(1) or "").strip()
        candidate = re.sub(r"\s*(종료일|시작일|시점)\s*$", "", candidate).strip()
        if not candidate:
            continue
        if _normalize_text_for_match(candidate) == normalized_activity_name:
            continue
        normalized_candidate = _normalize_text_for_match(candidate)
        for job in project_rdb.list_farm_job_catalog():
            job_name = str(job.get("job_name") or "").strip()
            if job_name and normalized_candidate == _normalize_text_for_match(job_name):
                return job_name
        return f"{candidate}(미등록)"
    return ""


def _derive_direction_from_basis(basis_text: str) -> str:
    raw_basis = str(basis_text or "").strip()
    if not raw_basis:
        return ""
    if "이전시기" in raw_basis or re.search(r"\s이전\b", raw_basis):
        return "시작 전"
    if "이후시기" in raw_basis or re.search(r"\s이후\b", raw_basis):
        return "완료 후"
    return ""


def _normalize_activity_date_rule(date_rule: Any, *, activity_name: str) -> dict[str, Any]:
    if not isinstance(date_rule, dict):
        return {}

    reference_job = _normalize_rule_reference_job_name(str(date_rule.get("기준작업") or "").strip())
    if not reference_job:
        return {}

    basis_text = str(date_rule.get("근거") or "").strip()
    derived_unregistered_reference = ""
    if reference_job in {"본활동", "시작일"}:
        derived_unregistered_reference = _derive_unregistered_reference_job_from_basis(
            basis_text=basis_text,
            activity_name=activity_name,
        )
        if derived_unregistered_reference:
            reference_job = derived_unregistered_reference

    before_after = str(date_rule.get("전후") or "").strip()
    if reference_job == "본활동":
        before_after = "시작 후"
    elif derived_unregistered_reference:
        before_after = _derive_direction_from_basis(basis_text) or before_after
    elif not before_after:
        before_after = "완료 후"

    normalized_rule = {
        "기준작업": reference_job,
        "전후": before_after,
        "경과일수": date_rule.get("경과일수"),
        "최소경과일수": date_rule.get("최소경과일수"),
        "최대경과일수": date_rule.get("최대경과일수"),
        "근거": basis_text,
    }
    return normalized_rule


def _normalize_activity_evidence_rule(
    evidence_rule: Any,
    *,
    evidence_basis_line: str,
) -> dict[str, Any]:
    evidence = dict(evidence_rule) if isinstance(evidence_rule, dict) else {}
    if evidence_basis_line:
        evidence["근거"] = evidence_basis_line
        if not str(evidence.get("증빙방법") or "").strip():
            evidence["증빙방법"] = evidence_basis_line.replace("(증빙방법)", "").replace("증빙방법", "").strip(" :")

    method_text = str(evidence.get("증빙방법") or "").strip()
    basis_text = str(evidence.get("근거") or "").strip()
    raw_count = evidence.get("증빙회수")
    normalized_count: int | None = None
    try:
        if raw_count not in (None, ""):
            normalized_count = max(1, int(raw_count))
    except (TypeError, ValueError):
        normalized_count = None

    if (method_text or basis_text) and normalized_count is None:
        normalized_count = 1

    if not method_text and not basis_text and normalized_count is None:
        return {}

    return {
        "증빙회수": normalized_count,
        "증빙방법": method_text,
        "근거": basis_text,
    }


def _normalize_activity_rule_json(
    activity_name: str,
    main_content: str,
    activity_description: str,
    source_excerpt: str,
    heading_context_lines: list[str] | None,
    parsed: dict[str, Any] | None,
) -> dict[str, Any]:
    rule = dict(parsed or {})
    start_date = _normalize_activity_date_rule(rule.get("시작일"), activity_name=activity_name)
    end_date = _normalize_activity_date_rule(rule.get("종료일"), activity_name=activity_name)
    min_duration_days = _extract_min_duration_days(activity_description or main_content or source_excerpt)
    end_reference_job = str(end_date.get("기준작업") or "").strip()
    if (
        min_duration_days is not None
        and end_reference_job in {"본활동", "시작일", activity_name}
        and end_date.get("경과일수") in (None, "")
        and end_date.get("최소경과일수") in (None, "")
    ):
        end_date["최소경과일수"] = min_duration_days
    evidence_basis_line = _extract_evidence_basis_line(
        main_content,
        activity_description,
        source_excerpt,
        heading_context_lines or [],
    )
    evidence = _normalize_activity_evidence_rule(
        rule.get("증빙조건"),
        evidence_basis_line=evidence_basis_line,
    )
    return {
        "활동명": str(rule.get("활동명") or activity_name).strip() or activity_name,
        "시작일": start_date,
        "종료일": end_date,
        "증빙조건": evidence,
    }


def _infer_activity_rule_with_llm(
    *,
    activity_name: str,
    main_content: str,
    activity_description: str,
    source_excerpt: str,
    heading_context_lines: list[str] | None = None,
) -> dict[str, Any]:
    heading_context_lines = [str(line or "").strip() for line in (heading_context_lines or []) if str(line or "").strip()]
    farm_job_list = _build_farm_job_list_text()
    try:
        raw = _run_text_response(
            system_prompt=_load_prompt("activity_rule_system.txt"),
            user_prompt=_render_prompt(
                "activity_rule_user.txt",
                activity_name=activity_name,
                main_content=main_content or "(없음)",
                activity_description=activity_description or "(없음)",
                farm_job_list=farm_job_list,
                source_excerpt=source_excerpt or "(없음)",
                heading_context_text="\n".join(heading_context_lines) if heading_context_lines else "(없음)",
            ),
        )
        parsed = _extract_first_json_object(raw)
        if isinstance(parsed, dict):
            return _normalize_activity_rule_json(
                activity_name,
                main_content,
                activity_description,
                source_excerpt,
                heading_context_lines,
                parsed,
            )
    except (AIServiceError, ValueError, TypeError):
        pass
    return _empty_activity_rule(activity_name)


def infer_activity_rule_from_activity_text(
    *,
    activity_name: str,
    activity_description: str | None = None,
    main_content: str | None = None,
    source_excerpt: str | None = None,
    heading_context_lines: list[str] | None = None,
) -> dict[str, Any]:
    normalized_activity_name = _normalize_activity_name(str(activity_name or "").strip())
    if not normalized_activity_name:
        return _empty_activity_rule("")

    normalized_description = str(activity_description or "").strip()
    normalized_main_content = str(main_content or "").strip() or normalized_description
    normalized_source_excerpt = str(source_excerpt or "").strip() or normalized_description or normalized_main_content
    normalized_heading_context_lines = [
        str(line or "").strip() for line in (heading_context_lines or []) if str(line or "").strip()
    ]

    if not normalized_main_content and not normalized_description and not normalized_source_excerpt:
        return _empty_activity_rule(normalized_activity_name)

    inferred = _infer_activity_rule_with_llm(
        activity_name=normalized_activity_name,
        main_content=normalized_main_content,
        activity_description=normalized_description or normalized_main_content,
        source_excerpt=normalized_source_excerpt,
        heading_context_lines=normalized_heading_context_lines,
    )

    normalized_rule = _normalize_activity_rule_json(
        normalized_activity_name,
        normalized_main_content,
        normalized_description or normalized_main_content,
        normalized_source_excerpt,
        normalized_heading_context_lines,
        inferred,
    )
    if not normalized_rule.get("활동명"):
        normalized_rule["활동명"] = normalized_activity_name
    return normalized_rule


def _score_labeled_activity_row(row: dict[str, Any]) -> int:
    labeled_names = _extract_labeled_activity_names(row)
    if not labeled_names:
        return 0

    score = 30
    if _is_table_like_row(row):
        score += 12
    if _row_table_row_role(row) == "data_row":
        score += 8
    if _header_row_has_activity_label(row):
        score += 10
    score += _score_activity_table_keywords(row) * 3
    if _is_unit_price_heading(row):
        score += 6
    score += _score_activity_context(row)
    return score


def _extract_rag_activity_suggestions(vector_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    relevant_table_rows = [row for row in vector_rows if _is_activity_price_table_row(row)]
    source_rows = relevant_table_rows or vector_rows

    grouped_rows: dict[str, list[dict[str, Any]]] = {}
    activity_names: dict[str, str] = {}

    for row in source_rows:
        activity_names_in_row = _extract_labeled_activity_names(row)
        if not activity_names_in_row:
            continue
        for activity_name in activity_names_in_row:
            normalized_name = _normalize_text_for_match(activity_name)
            if not normalized_name:
                continue
            grouped_rows.setdefault(normalized_name, []).append(row)
            activity_names.setdefault(normalized_name, activity_name)

    suggestions: list[dict[str, Any]] = []
    for normalized_name, rows in grouped_rows.items():
        expanded_rows = _expand_rows_by_heading_neighbors(rows, source_rows, max_neighbors=2)
        if not expanded_rows:
            expanded_rows = rows

        ranked_rows = sorted(expanded_rows, key=_score_labeled_activity_row, reverse=True)
        primary_row = ranked_rows[0]
        activity_detail = _extract_activity_detail_from_content(
            str(primary_row.get("content") or ""),
            activity_names[normalized_name],
        )
        price_info = activity_detail.get("unit_price") or _extract_price_for_job(activity_names[normalized_name], expanded_rows)
        match_score = sum(_score_labeled_activity_row(row) for row in rows)
        activity_header_count = _count_activity_header_rows(expanded_rows)
        exact_label_match_count = len(rows)
        match_score += activity_header_count * 5
        match_score += sum(1 for row in expanded_rows if _is_unit_price_heading(row))

        suggestions.append(
            {
                "activity_name": activity_names[normalized_name],
                "match_score": match_score,
                "exact_label_match_count": exact_label_match_count,
                "activity_header_count": activity_header_count,
                "source_excerpt": str(primary_row.get("content") or "").strip() or None,
                "focused_excerpt": activity_detail.get("source_excerpt"),
                "main_content": activity_detail.get("main_content"),
                "heading_path": _row_heading_path(primary_row) or None,
                "matched_rows": expanded_rows,
                "price_info": price_info,
            }
        )

    suggestions.sort(
        key=lambda item: (
            int(item.get("exact_label_match_count") or 0),
            int(item.get("activity_header_count") or 0),
            int(item.get("match_score") or 0),
        ),
        reverse=True,
    )
    return suggestions[:12]


def _match_farm_jobs_to_rag_rows(vector_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    farm_jobs = project_rdb.list_farm_job_catalog()
    matched: list[dict[str, Any]] = []

    for job in farm_jobs:
        row_matches: list[dict[str, Any]] = []
        total_score = 0
        for row in vector_rows:
            score = _score_job_against_row(job, row)
            if score <= 0:
                continue
            row_matches.append(row)
            total_score += score

        if not row_matches:
            continue

        row_matches = _expand_rows_by_heading_neighbors(row_matches, vector_rows, max_neighbors=2)
        exact_label_match_count = _count_exact_labeled_matches(str(job.get("job_name") or ""), row_matches)
        activity_header_count = _count_activity_header_rows(row_matches)
        total_score += exact_label_match_count * 50
        total_score += activity_header_count * 5
        total_score += sum(1 for row in row_matches if _is_unit_price_heading(row))

        price_info = _extract_price_for_job(str(job.get("job_name") or ""), row_matches)
        matched.append(
            {
                "job_cd": str(job.get("job_cd") or "").strip(),
                "job_name": str(job.get("job_name") or "").strip(),
                "job_desc": str(job.get("job_desc") or "").strip() or None,
                "job_cat": str(job.get("job_cat") or "").strip() or None,
                "start_mmdd": str(job.get("start_mmdd") or "").strip() or None,
                "end_mmdd": str(job.get("end_mmdd") or "").strip() or None,
                "match_score": total_score,
                "exact_label_match_count": exact_label_match_count,
                "activity_header_count": activity_header_count,
                "matched_rows": row_matches,
                "activity_name": _build_rag_activity_label(str(job.get("job_name") or ""), row_matches),
                "price_info": price_info,
            }
        )

    matched.sort(
        key=lambda item: (
            int(item.get("exact_label_match_count") or 0),
            int(item.get("activity_header_count") or 0),
            int(item.get("match_score") or 0),
        ),
        reverse=True,
    )
    return matched[:12]


def _normalize_project_name(value: Any) -> str | None:
    name = str(value or "").strip()
    if not name:
        return None
    normalized = name
    for pattern in _PROJECT_NAME_NOISE_PATTERNS:
        normalized = re.sub(pattern, " ", normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip(" -_/")
    return normalized or None


def _normalize_basic_result(file_row: dict[str, Any], extracted: dict[str, Any]) -> dict[str, Any]:
    publication_date = str(file_row.get("publication_date") or "").strip() or None
    post_date = extracted.get("post_date") or publication_date

    exec_year = extracted.get("exec_year")
    if exec_year is None and post_date:
        match = re.match(r"^(\d{4})-", post_date)
        if match:
            exec_year = int(match.group(1))

    doc_name = _normalize_project_name(file_row.get("doc_name"))
    issuer = extracted.get("issuer") or str(file_row.get("doc_manager") or "").strip() or None

    return {
        "prj_name": _normalize_project_name(extracted.get("prj_name")) or doc_name,
        "issuer": issuer,
        "exec_year": exec_year,
        "post_date": post_date,
    }


def build_project_basic_from_rag(file_id: str) -> dict[str, Any]:
    normalized_file_id = str(file_id or "").strip()
    if not normalized_file_id:
        raise HTTPException(status_code=400, detail="rag_file_id가 필요합니다.")

    file_row = rag_rdb.get_rag_file(normalized_file_id)
    if not file_row:
        raise HTTPException(status_code=404, detail="선택한 RAG 파일을 찾을 수 없습니다.")

    vector_rows = rag_rdb.list_rag_vector_contents_for_file(normalized_file_id, limit=200)
    if not vector_rows:
        raise HTTPException(status_code=400, detail="선택한 RAG 파일에 검색 가능한 본문이 없습니다.")

    context_text = _build_basic_context(file_row, vector_rows)
    extracted = extract_project_basic(context_text)
    suggested = _normalize_basic_result(file_row, extracted)

    return {
        "ok": True,
        "rag_file_id": normalized_file_id,
        "suggested": suggested,
    }


def build_project_activities_from_rag(prj_id: str) -> dict[str, Any]:
    project = project_rdb.get_project_catalog_detail(prj_id)
    if not project:
        raise HTTPException(status_code=404, detail="프로젝트를 찾을 수 없습니다.")

    rag_file_id = str(project.get("rag_file_id") or "").strip()
    if not rag_file_id:
        raise HTTPException(status_code=400, detail="이 프로젝트에는 연결된 RAG 파일이 없습니다.")

    file_row = rag_rdb.get_rag_file(rag_file_id)
    if not file_row:
        raise HTTPException(status_code=404, detail="연결된 RAG 파일을 찾을 수 없습니다.")

    vector_rows = rag_rdb.list_rag_vector_contents_for_file(rag_file_id, limit=240)
    if not vector_rows:
        raise HTTPException(status_code=400, detail="연결된 RAG 파일에 검색 가능한 본문이 없습니다.")

    matched_activities = _extract_rag_activity_suggestions(vector_rows)

    suggestions: list[dict[str, Any]] = []
    for index, activity_match in enumerate(matched_activities, start=1):
        activity_name = str(activity_match.get("activity_name") or "").strip()
        activity_name = _normalize_activity_name(activity_name)
        price_info = activity_match.get("price_info")
        matched_rows = list(activity_match.get("matched_rows") or [])
        main_content = str(activity_match.get("main_content") or "").strip()
        heading_path = str(activity_match.get("heading_path") or "").strip() or None
        schedule_suggestion = _suggest_schedule_from_farm_job(
            activity_name=activity_name,
            main_content=main_content,
            matched_rows=matched_rows,
            exec_year=int(project.get("exec_year")) if project.get("exec_year") not in (None, "") else None,
        )
        parcel_suggestion = _suggest_parcel_codes(
            project_name=str(project.get("prj_name") or "").strip(),
            activity_name=activity_name,
            main_content=main_content,
            matched_rows=matched_rows,
        )
        heading_context_lines = _build_heading_context_lines(
            vector_rows,
            heading_path,
        )
        description_suggestion = _build_activity_description_suggestion(
            activity_name=activity_name,
            main_content=main_content,
            source_excerpt=activity_match.get("focused_excerpt") or activity_match.get("source_excerpt"),
            heading_context_lines=heading_context_lines,
        )

        detail_payload = {
            "activity_name": activity_name,
            "heading_path": heading_path,
            "source_excerpt": activity_match.get("focused_excerpt") or activity_match.get("source_excerpt"),
            "main_content": main_content or None,
            "description_suggestion": description_suggestion,
            "heading_context_lines": heading_context_lines,
            "unit_price": {
                "amount": price_info.get("amount"),
                "raw_text": price_info.get("raw_text"),
                "source_excerpt": activity_match.get("focused_excerpt") or price_info.get("content"),
                "heading_path": price_info.get("heading_path"),
                "priority": "table_first",
            }
            if isinstance(price_info, dict)
            else None,
            "schedule_suggestion": schedule_suggestion,
            "parcel_suggestion": parcel_suggestion,
            "source_type": "rag",
        }
        suggestions.append(
            {
                "suggestion_id": f"RAG-ACT-{index:02d}",
                "activity_name": activity_name,
                "source_flag": "rag_suggested",
                "source_type": "rag",
                "detail_text": json.dumps(detail_payload, ensure_ascii=False, indent=2),
                "match_score": int(activity_match.get("match_score") or 0),
                "exact_label_match_count": int(activity_match.get("exact_label_match_count") or 0),
                "activity_header_count": int(activity_match.get("activity_header_count") or 0),
            }
        )

    return {
        "ok": True,
        "prj_id": prj_id,
        "rag_file_id": rag_file_id,
        "items": suggestions,
    }


def build_project_activity_rule_from_rag(prj_id: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    project = project_rdb.get_project_catalog_detail(prj_id)
    if not project:
        raise HTTPException(status_code=404, detail="프로젝트를 찾을 수 없습니다.")

    data = payload or {}
    activity_name = _normalize_activity_name(str(data.get("activity_name") or "").strip())
    if not activity_name:
        raise HTTPException(status_code=400, detail="활동명이 필요합니다.")

    description = str(data.get("description") or "").strip()
    if not description:
        raise HTTPException(status_code=400, detail="활동 설명이 필요합니다.")

    activity_rule_suggestion = infer_activity_rule_from_activity_text(
        activity_name=activity_name,
        activity_description=description,
        main_content=description,
        source_excerpt=description,
        heading_context_lines=None,
    )

    return {
        "ok": True,
        "prj_id": prj_id,
        "activity_rule_suggestion": activity_rule_suggestion,
    }


def _fallback_repeat_count_from_text(text: str) -> tuple[int, str | None]:
    normalized = str(text or "").strip()
    if not normalized:
        return 1, None

    patterns = (
        r"증빙사진\s*(\d+)\s*회",
        r"사진\s*(\d+)\s*회\s*제출",
        r"증빙\s*(\d+)\s*회",
        r"(\d+)\s*회\s*제출",
        r"시작\s*[·\-~및/ ]\s*종료일.*사진",
        r"시작일.*종료일.*사진",
    )
    for pattern in patterns:
        matched = re.search(pattern, normalized)
        if not matched:
            continue
        if matched.groups():
            return max(1, min(10, int(matched.group(1)))), matched.group(0)
        return 2, matched.group(0)
    return 1, None


def _select_activity_match_for_registered_activity(
    activity_name: str,
    matches: list[dict[str, Any]],
) -> dict[str, Any] | None:
    normalized_target = _normalize_activity_name(activity_name)
    if not normalized_target:
        return None

    ranked = sorted(
        matches,
        key=lambda item: (
            _similarity_score(normalized_target, str(item.get("activity_name") or "")),
            int(item.get("exact_label_match_count") or 0),
            int(item.get("activity_header_count") or 0),
            int(item.get("match_score") or 0),
        ),
        reverse=True,
    )
    best = ranked[0] if ranked else None
    if not best:
        return None
    if _similarity_score(normalized_target, str(best.get("activity_name") or "")) < 0.45:
        return None
    return best


def _score_registered_activity_row(row: dict[str, Any], activity_name: str) -> int:
    normalized_target = _normalize_text_for_match(activity_name)
    if not normalized_target:
        return 0

    content = str(row.get("content") or "").strip()
    heading_path = _row_heading_path(row)
    table_caption = _row_table_caption(row)
    table_header = _row_table_header_text(row)
    labeled_name = _extract_labeled_activity_name(row) or ""
    metadata_text = " ".join(part for part in [heading_path, table_caption, table_header, content] if part).strip()

    score = 0
    if labeled_name:
        score += int(_similarity_score(activity_name, labeled_name) * 140)
        if _normalize_text_for_match(labeled_name) == normalized_target:
            score += 60
    if metadata_text:
        score += int(_similarity_score(activity_name, metadata_text) * 90)
    if normalized_target in _normalize_text_for_match(metadata_text):
        score += 35
    if _text_contains_all_tokens(metadata_text, activity_name):
        score += 24
    if _is_activity_detail_block_content(content):
        score += 16
    if _header_row_has_activity_label(row):
        score += 14
    if _score_activity_table_keywords(row) > 0:
        score += _score_activity_table_keywords(row) * 3
    if _is_table_like_row(row):
        score += 6
    return score


def _build_table_context_lines(
    rows: list[dict[str, Any]],
    heading_path: str | None,
    activity_name: str,
) -> list[str]:
    normalized_heading = str(heading_path or "").strip()
    filtered_rows = rows
    if normalized_heading:
        same_section_rows = [
            row
            for row in rows
            if _row_heading_path(row) == normalized_heading
            or _row_heading_path(row).startswith(f"{normalized_heading} > ")
        ]
        if same_section_rows:
            filtered_rows = same_section_rows

    relevant_rows = sorted(
        filtered_rows,
        key=lambda row: (
            _score_registered_activity_row(row, activity_name),
            _row_source_order_start(row),
            _row_source_order_end(row),
        ),
        reverse=True,
    )

    lines: list[str] = []
    seen_contents: set[str] = set()
    for row in relevant_rows:
        if not _is_table_like_row(row):
            continue
        content = str(row.get("content") or "").strip()
        if not content or content in seen_contents:
            continue
        if _score_registered_activity_row(row, activity_name) <= 0:
            continue
        seen_contents.add(content)
        caption = _row_table_caption(row)
        header = _row_table_header_text(row)
        prefix_parts = [part for part in [caption, header] if part]
        if prefix_parts:
            lines.append(f"{' / '.join(prefix_parts)} :: {content}")
        else:
            lines.append(content)
        if len(lines) >= 6:
            break
    return lines


def _build_registered_activity_context(
    activity_name: str,
    vector_rows: list[dict[str, Any]],
) -> dict[str, Any] | None:
    matched_activities = _extract_rag_activity_suggestions(vector_rows)
    selected_match = _select_activity_match_for_registered_activity(activity_name, matched_activities)
    if selected_match:
        heading_path = str(selected_match.get("heading_path") or "").strip() or None
        matched_rows = list(selected_match.get("matched_rows") or [])
        return {
            "activity_name": activity_name,
            "heading_path": heading_path,
            "matched_rows": matched_rows,
            "main_content": str(selected_match.get("main_content") or "").strip() or None,
            "source_excerpt": str(selected_match.get("focused_excerpt") or selected_match.get("source_excerpt") or "").strip() or None,
            "heading_context_lines": _build_heading_context_lines(matched_rows or vector_rows, heading_path),
            "table_context_lines": _build_table_context_lines(matched_rows or vector_rows, heading_path, activity_name),
            "context_source": "matched_activity_suggestion",
        }

    scored_rows = [
        (row, _score_registered_activity_row(row, activity_name))
        for row in vector_rows
    ]
    candidate_rows = [row for row, score in scored_rows if score > 0]
    if not candidate_rows:
        return None

    ranked_seed_rows = [
        row
        for row, _score in sorted(
            scored_rows,
            key=lambda item: item[1],
            reverse=True,
        )
        if _score > 0
    ][:8]
    expanded_rows = _expand_rows_by_heading_neighbors(ranked_seed_rows, vector_rows, max_neighbors=3) or ranked_seed_rows
    primary_row = ranked_seed_rows[0]
    heading_path = _row_heading_path(primary_row) or None

    detail_blocks: list[dict[str, Any]] = []
    for row in expanded_rows:
        extracted = _extract_activity_detail_from_content(str(row.get("content") or ""), activity_name)
        if extracted:
            detail_blocks.append(extracted)

    main_content = next((str(item.get("main_content") or "").strip() for item in detail_blocks if str(item.get("main_content") or "").strip()), "")
    source_excerpt = next((str(item.get("source_excerpt") or "").strip() for item in detail_blocks if str(item.get("source_excerpt") or "").strip()), "")
    if not source_excerpt:
        source_excerpt = str(primary_row.get("content") or "").strip()

    heading_context_lines = _build_heading_context_lines(expanded_rows, heading_path)
    table_context_lines = _build_table_context_lines(expanded_rows, heading_path, activity_name)

    return {
        "activity_name": activity_name,
        "heading_path": heading_path,
        "matched_rows": expanded_rows,
        "main_content": main_content or None,
        "source_excerpt": source_excerpt or None,
        "heading_context_lines": heading_context_lines,
        "table_context_lines": table_context_lines,
        "context_source": "row_pipeline_fallback",
    }


def _infer_repeat_count_with_llm(
    *,
    activity_name: str,
    main_content: str,
    source_excerpt: str,
    heading_path: str | None = None,
    heading_context_lines: list[str] | None = None,
    table_context_lines: list[str] | None = None,
) -> tuple[int, str | None, str | None, str]:
    heading_context_lines = [str(line or "").strip() for line in (heading_context_lines or []) if str(line or "").strip()]
    table_context_lines = [str(line or "").strip() for line in (table_context_lines or []) if str(line or "").strip()]
    fallback_count, fallback_basis = _fallback_repeat_count_from_text(
        "\n".join([main_content, source_excerpt, *heading_context_lines, *table_context_lines])
    )
    prompt_source = source_excerpt.strip() or main_content.strip() or "\n".join(heading_context_lines) or "\n".join(table_context_lines)
    if not prompt_source:
        return fallback_count, fallback_basis, "주요 내용을 찾지 못해 기본값을 사용했습니다.", "fallback"

    try:
        raw = _run_text_response(
            system_prompt=(
                "너는 저탄소 농업 사업관리 문서에서 작업 반복회수를 추정하는 도우미다. "
                "반드시 제공된 활동명과 문서 근거만 사용한다. "
                "규칙: "
                "(1) 먼저 해당 활동의 '주요 내용'을 1순위로 읽고 판단한다. "
                "(2) 주요 내용이 부족하면 같은 heading_path 아래 본문과 활동 헤더를 가진 표 내용을 보조 근거로 사용한다. "
                "(3) 명시된 숫자가 있으면 그 숫자를 우선한다. "
                "(4) '시작/종료일 사진', '시작과 종료 시점 증빙'처럼 두 시점을 모두 요구하면 2회로 본다. "
                "(5) 반복 증빙 횟수가 명시되지 않으면 기본값은 1회다. "
                "(6) 1~10 사이 정수만 반환한다. "
                "(7) evidence_basis 는 실제 판단에 직접 쓴 문장이나 표 문구를 짧게 적는다. "
                "(8) 출력은 JSON만 허용한다.\n\n"
                '출력 형식: {"repeat_count": 1, "evidence_basis": "", "reason": ""}'
            ),
            user_prompt=(
                f"활동명: {activity_name}\n\n"
                f"heading_path: {heading_path or '(없음)'}\n\n"
                f"주요 내용:\n{main_content or '(없음)'}\n\n"
                f"상세 발췌:\n{source_excerpt or '(없음)'}\n\n"
                f"같은 섹션 본문:\n{chr(10).join(heading_context_lines) if heading_context_lines else '(없음)'}\n\n"
                f"같은 섹션 표 정보:\n{chr(10).join(table_context_lines) if table_context_lines else '(없음)'}\n\n"
                "위 근거만 사용해 작업 반복회수를 추정해라. 주요 내용이 있으면 그것을 가장 우선해서 판단해라."
            ),
        )
        parsed = _extract_first_json_object(raw)
        repeat_count = int(parsed.get("repeat_count") or fallback_count)
        repeat_count = max(1, min(10, repeat_count))
        evidence_basis = str(parsed.get("evidence_basis") or "").strip() or fallback_basis
        reason = str(parsed.get("reason") or "").strip() or None
        return repeat_count, evidence_basis, reason, "llm"
    except (AIServiceError, ValueError, TypeError):
        return fallback_count, fallback_basis, "LLM 추정에 실패해 문구 규칙으로 기본 회수를 채웠습니다.", "fallback"


def _suggest_reference_job_from_context(
    *,
    activity_name: str,
    main_content: str,
    source_excerpt: str,
    heading_context_lines: list[str] | None = None,
    table_context_lines: list[str] | None = None,
) -> dict[str, Any] | None:
    farm_jobs = project_rdb.list_farm_job_catalog()
    if not farm_jobs:
        return None

    heading_context_lines = [str(line or "").strip() for line in (heading_context_lines or []) if str(line or "").strip()]
    table_context_lines = [str(line or "").strip() for line in (table_context_lines or []) if str(line or "").strip()]
    primary_match = _suggest_schedule_from_farm_job(
        activity_name=activity_name,
        main_content=main_content,
        matched_rows=[{"content": source_excerpt}] if source_excerpt else [],
        exec_year=None,
    )
    primary_job_cd = str(primary_match.get("job_cd") or "").strip() if isinstance(primary_match, dict) else ""
    normalized_activity_name = _normalize_text_for_match(activity_name)

    best_item: dict[str, Any] | None = None
    best_score = 0.0
    best_basis = ""

    for job in farm_jobs:
        job_cd = str(job.get("job_cd") or "").strip()
        job_name = str(job.get("job_name") or "").strip()
        job_desc = str(job.get("job_desc") or "").strip()
        if not job_cd or not job_name:
            continue
        if primary_job_cd and job_cd == primary_job_cd:
            continue
        if _normalize_text_for_match(job_name) == normalized_activity_name:
            continue

        score = 0.0
        basis = ""
        normalized_job_name = _normalize_text_for_match(job_name)

        if main_content:
            normalized_main = _normalize_text_for_match(main_content)
            if normalized_job_name and normalized_job_name in normalized_main:
                score += 1.2
                basis = job_name
            elif _text_contains_all_tokens(main_content, job_name):
                score += 1.0
                basis = job_name
            score += min(0.35, _similarity_score(main_content, job_name) * 0.35)
            if job_desc:
                score += min(0.18, _similarity_score(main_content, job_desc) * 0.18)
            if _is_parallel_activity_line(main_content):
                score -= 0.45

        if source_excerpt and not basis:
            normalized_excerpt = _normalize_text_for_match(source_excerpt)
            if normalized_job_name and normalized_job_name in normalized_excerpt:
                score += 0.8
                basis = job_name
            elif _text_contains_all_tokens(source_excerpt, job_name):
                score += 0.65
                basis = job_name
        if source_excerpt and _is_parallel_activity_line(source_excerpt):
            score -= 0.3

        for line in heading_context_lines:
            if normalized_job_name and normalized_job_name in _normalize_text_for_match(line):
                score += 0.16 if not _is_parallel_activity_line(line) else 0.03
                if not basis:
                    basis = line
                break

        for line in table_context_lines:
            if normalized_job_name and normalized_job_name in _normalize_text_for_match(line):
                score += 0.12 if not _is_parallel_activity_line(line) else 0.02
                if not basis:
                    basis = line
                break

        if any(keyword in main_content for keyword in ("이후", "후", "다음", "선행")):
            score += 0.04

        if score > best_score:
            best_score = score
            best_item = job
            best_basis = basis or _find_reference_job_basis_text(
                job_name=job_name,
                job_desc=job_desc,
                main_content=main_content,
                source_excerpt=source_excerpt,
                heading_context_lines=heading_context_lines,
                table_context_lines=table_context_lines,
            ) or job_name

    if not best_item or best_score < 0.62:
        return None

    return {
        "job_cd": str(best_item.get("job_cd") or "").strip() or None,
        "job_name": str(best_item.get("job_name") or "").strip() or None,
        "basis": best_basis or None,
        "match_score": round(best_score, 4),
    }


def _extract_keyword_sentences(text: str, keywords: tuple[str, ...]) -> str:
    normalized_text = str(text or "").strip()
    if not normalized_text:
        return ""
    sentences = [
        sentence.strip()
        for sentence in re.split(r"(?<=[.!?])\s+|\n+", normalized_text)
        if sentence.strip()
    ]
    matched = [sentence for sentence in sentences if any(keyword in sentence for keyword in keywords)]
    return "\n".join(matched).strip()


def _is_parallel_activity_line(text: str) -> bool:
    normalized = str(text or "").strip()
    if not normalized:
        return False
    return any(
        keyword in normalized
        for keyword in (
            "병행",
            "단일활동 신청은 불가능",
            "단일 활동 신청은 불가능",
            "2개의 활동",
            "두 개의 활동",
            "중복 참여 불가",
        )
    )


def _find_reference_job_basis_text(
    *,
    job_name: str,
    job_desc: str,
    main_content: str,
    source_excerpt: str,
    heading_context_lines: list[str],
    table_context_lines: list[str],
) -> str:
    candidates = [
        str(main_content or "").strip(),
        str(source_excerpt or "").strip(),
        *[str(line or "").strip() for line in heading_context_lines if str(line or "").strip()],
        *[str(line or "").strip() for line in table_context_lines if str(line or "").strip()],
    ]
    normalized_job_name = _normalize_text_for_match(job_name)
    desc_tokens = [token for token in re.split(r"[^0-9a-zA-Z가-힣]+", str(job_desc or "")) if len(token) >= 2]
    job_tokens = [token for token in re.split(r"[^0-9a-zA-Z가-힣]+", str(job_name or "")) if len(token) >= 2]

    for candidate in candidates:
        normalized_candidate = _normalize_text_for_match(candidate)
        if normalized_job_name and normalized_job_name in normalized_candidate:
            return candidate
        if _text_contains_all_tokens(candidate, job_name):
            return candidate
        if desc_tokens and sum(1 for token in desc_tokens if token in candidate) >= min(2, len(desc_tokens)):
            return candidate
        if job_tokens and sum(1 for token in job_tokens if token in candidate) >= min(2, len(job_tokens)):
            return candidate

    return str(main_content or "").strip() or str(source_excerpt or "").strip() or ""


def _normalize_activity_rule_section(value: Any) -> dict[str, Any]:
    return dict(value) if isinstance(value, dict) else {}


def _extract_repeat_count_from_activity_rule(activity_rule: dict[str, Any] | None) -> tuple[int | None, str | None]:
    rule = dict(activity_rule or {})
    evidence = _normalize_activity_rule_section(rule.get("증빙조건"))
    raw_count = evidence.get("증빙회수")
    try:
        repeat_count = int(raw_count)
    except (TypeError, ValueError):
        return None, None
    if repeat_count <= 0:
        return None, None
    basis = str(evidence.get("근거") or evidence.get("증빙방법") or "").strip() or None
    return max(1, min(10, repeat_count)), basis


def _match_farm_job_from_rule_reference(
    reference_job_name: str,
    *,
    basis: str | None = None,
    activity_name: str = "",
) -> dict[str, Any] | None:
    candidate_name = str(reference_job_name or "").strip()
    if not candidate_name:
        return None
    normalized_candidate = _normalize_text_for_match(candidate_name)
    if normalized_candidate in {"", "본활동", "시작일", "종료일"}:
        return None

    farm_jobs = project_rdb.list_farm_job_catalog()
    if not farm_jobs:
        return None

    best_item: dict[str, Any] | None = None
    best_score = 0.0
    for job in farm_jobs:
        job_cd = str(job.get("job_cd") or "").strip()
        job_name = str(job.get("job_name") or "").strip()
        if not job_cd or not job_name:
            continue
        normalized_job_name = _normalize_text_for_match(job_name)
        score = 0.0
        if normalized_job_name == normalized_candidate:
            score += 1.4
        elif normalized_candidate in normalized_job_name or normalized_job_name in normalized_candidate:
            score += 1.05
        elif _text_contains_all_tokens(job_name, candidate_name) or _text_contains_all_tokens(candidate_name, job_name):
            score += 0.95
        else:
            score += _similarity_score(candidate_name, job_name)

        if activity_name:
            score -= min(0.3, _similarity_score(activity_name, job_name) * 0.3)

        if score > best_score:
            best_score = score
            best_item = job

    if not best_item or best_score < 0.72:
        return None

    return {
        "job_cd": str(best_item.get("job_cd") or "").strip() or None,
        "job_name": str(best_item.get("job_name") or "").strip() or None,
        "basis": basis or candidate_name,
        "match_score": round(best_score, 4),
    }


def _extract_reference_jobs_from_activity_rule(
    activity_rule: dict[str, Any] | None,
    *,
    activity_name: str,
) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    rule = dict(activity_rule or {})
    start_rule = _normalize_activity_rule_section(rule.get("시작일"))
    end_rule = _normalize_activity_rule_section(rule.get("종료일"))

    start_reference = _match_farm_job_from_rule_reference(
        str(start_rule.get("기준작업") or "").strip(),
        basis=str(start_rule.get("근거") or "").strip() or None,
        activity_name=activity_name,
    )
    end_reference = _match_farm_job_from_rule_reference(
        str(end_rule.get("기준작업") or "").strip(),
        basis=str(end_rule.get("근거") or "").strip() or None,
        activity_name=activity_name,
    )
    return start_reference, end_reference


def _get_activity_rule_condition(date_rule: dict[str, Any]) -> str:
    reference_job = str(date_rule.get("기준작업") or "").strip()
    direction = str(date_rule.get("전후") or "").strip()
    if re.search(r"완료|종료|END", direction, flags=re.IGNORECASE) or re.search(r"완료|종료", reference_job):
        return "END"
    if re.search(r"시작|개시|START", direction, flags=re.IGNORECASE) or re.search(r"시작|개시", reference_job):
        return "START"
    if re.search(r"후|이후", direction):
        return "END"
    if re.search(r"전|이전", direction):
        return "START"
    return "END"


def _to_activity_rule_offset(value: Any) -> int | None:
    try:
        number_value = int(value)
    except (TypeError, ValueError):
        return None
    return number_value


def _resolve_repeat_rule_range(date_rule: dict[str, Any]) -> tuple[int, int | None]:
    elapsed_days = _to_activity_rule_offset(date_rule.get("경과일수"))
    min_elapsed_days = _to_activity_rule_offset(date_rule.get("최소경과일수"))
    max_elapsed_days = _to_activity_rule_offset(date_rule.get("최대경과일수"))

    if elapsed_days is not None:
        return elapsed_days, None
    if min_elapsed_days is not None and max_elapsed_days is not None:
        return min_elapsed_days, None if min_elapsed_days == max_elapsed_days else max_elapsed_days
    if min_elapsed_days is not None:
        return min_elapsed_days, None
    if max_elapsed_days is not None:
        return max_elapsed_days, None
    return 0, None


def _find_exec_point_code(exec_point_options: list[dict[str, Any]], keyword: str, fallback: str) -> str:
    fallback_upper = str(fallback or "").strip().upper()
    for option in exec_point_options:
        code_name = str(option.get("code_name") or "").strip()
        code = str(option.get("code") or "").strip()
        if keyword in code_name or code.upper() == fallback_upper:
            return code or fallback
    return fallback


def _build_repeat_rule_json(rule: dict[str, Any]) -> str:
    return json.dumps(rule, ensure_ascii=False, separators=(",", ":"))


def _match_farm_job_option_by_activity_name(
    activity_name: str,
    job_options: list[dict[str, Any]],
) -> dict[str, Any] | None:
    normalized_activity_name = _normalize_text_for_match(activity_name)
    if not normalized_activity_name:
        return None

    for option in job_options:
        normalized_job_name = _normalize_text_for_match(option.get("job_name") or option.get("job_cd") or "")
        if normalized_job_name == normalized_activity_name:
            return option

    for option in job_options:
        normalized_job_name = _normalize_text_for_match(option.get("job_name") or option.get("job_cd") or "")
        if normalized_job_name and (
            normalized_job_name in normalized_activity_name or normalized_activity_name in normalized_job_name
        ):
            return option
    return None


def build_project_job_repeat_setup(
    *,
    activity: dict[str, Any],
    job_options: list[dict[str, Any]],
    exec_point_options: list[dict[str, Any]],
) -> dict[str, Any]:
    activity_name = str(activity.get("activity_name") or "").strip()
    activity_rule = dict(activity.get("activity_rule") or {}) if isinstance(activity.get("activity_rule"), dict) else {}
    repeat_count, _evidence_basis = _extract_repeat_count_from_activity_rule(activity_rule)
    final_repeat_count = repeat_count if repeat_count is not None else 1

    selected_job = _match_farm_job_option_by_activity_name(activity_name, job_options)
    start_rule = _normalize_activity_rule_section(activity_rule.get("시작일"))
    end_rule = _normalize_activity_rule_section(activity_rule.get("종료일"))
    start_rule_base_job = str(start_rule.get("기준작업") or "").strip()
    end_rule_base_job = str(end_rule.get("기준작업") or "").strip()
    start_reference, end_reference = _extract_reference_jobs_from_activity_rule(
        activity_rule,
        activity_name=activity_name,
    )
    start_offset, start_end_offset = _resolve_repeat_rule_range(start_rule)
    end_offset, end_end_offset = _resolve_repeat_rule_range(end_rule)

    start_exec_point = _find_exec_point_code(exec_point_options, "시작", "START")
    mid_exec_point = _find_exec_point_code(exec_point_options, "중간", "MID")
    end_exec_point = _find_exec_point_code(exec_point_options, "종료", "END")

    drafts: list[dict[str, Any]] = []
    for index in range(final_repeat_count):
        is_first = index == 0
        is_last = final_repeat_count > 1 and index == final_repeat_count - 1
        exec_point_cd = start_exec_point if is_first else end_exec_point if is_last else mid_exec_point

        ref_job_code_query = ""
        ref_job_cd = ""
        start_date_rule = ""
        end_date_rule = ""

        if is_first:
            ref_job_code_query = str(start_reference.get("job_name") or start_reference.get("job_cd") or "").strip() if isinstance(start_reference, dict) else ""
            ref_job_cd = str(start_reference.get("job_cd") or "").strip() if isinstance(start_reference, dict) else ""
            if ref_job_cd:
                start_date_rule = _build_repeat_rule_json(
                    {
                        "ref": "REF",
                        "condition": _get_activity_rule_condition(start_rule),
                        "offset": start_offset,
                    }
                )
                if start_end_offset is not None:
                    end_date_rule = _build_repeat_rule_json(
                        {
                            "ref": "REF",
                            "condition": _get_activity_rule_condition(start_rule),
                            "offset": start_end_offset,
                        }
                    )
        elif is_last:
            ref_job_code_query = str(end_reference.get("job_name") or end_reference.get("job_cd") or "").strip() if isinstance(end_reference, dict) else ""
            ref_job_cd = str(end_reference.get("job_cd") or "").strip() if isinstance(end_reference, dict) else ""
            end_rule_is_self_anchor = end_rule_base_job in {"본활동", "시작일"} or end_rule_base_job == activity_name
            if ref_job_cd:
                start_date_rule = _build_repeat_rule_json(
                    {
                        "ref": "REF",
                        "condition": _get_activity_rule_condition(end_rule),
                        "offset": end_offset,
                    }
                )
                if end_end_offset is not None:
                    end_date_rule = _build_repeat_rule_json(
                        {
                            "ref": "REF",
                            "condition": _get_activity_rule_condition(end_rule),
                            "offset": end_end_offset,
                        }
                    )
            elif end_rule_is_self_anchor:
                start_date_rule = _build_repeat_rule_json(
                    {
                        "ref": "THIS",
                        "seq": "PRE",
                        "offset": end_offset,
                    }
                )
                if end_end_offset is not None:
                    end_date_rule = _build_repeat_rule_json(
                        {
                            "ref": "THIS",
                            "seq": "PRE",
                            "offset": end_end_offset,
                        }
                    )

        drafts.append(
            {
                "exec_point_cd": exec_point_cd,
                "ref_job_code_query": ref_job_code_query or None,
                "ref_job_cd": ref_job_cd or None,
                "est_start_date": str(activity.get("est_start_date") or "").strip() or None,
                "start_date_rule": start_date_rule or None,
                "est_end_date": str(activity.get("est_end_date") or "").strip() or None,
                "end_date_rule": end_date_rule or None,
                "mandatory": True,
                "evidence": True,
            }
        )

    return {
        "repeat_count": final_repeat_count,
        "repeat_job_cd": str(selected_job.get("job_cd") or "").strip() or None if isinstance(selected_job, dict) else None,
        "repeat_job_name": str(selected_job.get("job_name") or selected_job.get("job_cd") or "").strip() or None if isinstance(selected_job, dict) else None,
        "repeat_job_drafts": drafts,
    }
