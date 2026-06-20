"""RAG 파일 관리용 pre-parse / 등록 서비스."""
from __future__ import annotations

import json
import os
import re
import tempfile
import unicodedata
from dataclasses import asdict
from datetime import date
from pathlib import Path
from typing import Any

from fastapi import HTTPException
from locaville.dbcom import DBExecutionError, transaction
from locaville.rag.hwpx_heading_parser import (
    HwpxHeadingParser,
    HwpxParsingError,
    ParsedBlock,
    build_heading_rows as parser_build_heading_rows,
    extract_blocks,
    iter_raw_block_lines as parser_iter_raw_block_lines,
    preview_preparse_lines as parser_preview_preparse_lines,
    split_preparse_lines_by_domain as parser_split_preparse_lines_by_domain,
)
from locaville.storage_client import LocavilleStorageClient
from locaville.utilities import load_backend_env, randomize_filename

from app.repositories import rag_rdb

SUPPORTED_SUFFIXES = (".pdf", ".docx", ".hwpx", ".md")
FILE_FORMAT_LABELS = {
    ".hwpx": "한글",
    ".pdf": "PDF",
    ".docx": "MS워드",
    ".md": "마크다운",
}
DEFAULT_RAG_USER_NO = int(os.getenv("DEFAULT_CHIEF_USER_NO", "10000001"))
MAX_MATCHED_SAMPLE_ITEMS = 20
class RagRegisterError(Exception):
    """RAG 등록 실패."""


def _get_current_user_no() -> int:
    return DEFAULT_RAG_USER_NO


def _normalize_rag_storage_key(file_path: str) -> str:
    return str(file_path or "").strip().lstrip("/")


def _upload_rag_source_file(file_name: str, content: bytes) -> str:
    load_backend_env()
    bucket_name = os.getenv("BUCKET_DOCUMENT")
    if not bucket_name:
        raise HTTPException(status_code=500, detail="BUCKET_DOCUMENT 환경 변수가 설정되지 않았습니다.")

    upload_filename = randomize_filename(file_name)
    normalized_filename = str(upload_filename or "").strip().lstrip("/")
    if not normalized_filename:
        raise HTTPException(status_code=500, detail="RAG 원본 파일 key 생성에 실패했습니다.")
    storage_key = f"rag/{normalized_filename}"
    suffix = Path(file_name or "").suffix or ".bin"

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
        temp_file.write(content)
        temp_path = temp_file.name

    try:
        storage_client = LocavilleStorageClient(bucket_name=bucket_name)
        response = storage_client.upload_file(
            source_filepath=temp_path,
            remote_dir="rag",
            remote_filename=upload_filename,
        )
        if response is None:
            raise HTTPException(status_code=500, detail="RAG 원본 파일 업로드에 실패했습니다.")
    finally:
        try:
            os.remove(temp_path)
        except OSError:
            pass

    return storage_key


def _delete_rag_source_file(file_path: str | None) -> None:
    storage_key = _normalize_rag_storage_key(str(file_path or ""))
    if not storage_key:
        return

    load_backend_env()
    bucket_name = os.getenv("BUCKET_DOCUMENT")
    if not bucket_name:
        return

    try:
        storage_client = LocavilleStorageClient(bucket_name=bucket_name)
        storage_client.delete_file(storage_key)
    except Exception:
        # DB 삭제 성공을 우선하고, 원본 파일 정리는 best-effort 로 처리한다.
        pass


def list_rag_headings() -> list[dict[str, Any]]:
    return rag_rdb.list_rag_headings(active_only=True)


def list_rag_files() -> dict[str, list[dict[str, Any]]]:
    return {"items": [_to_public_rag_file_item(item) for item in rag_rdb.list_rag_files()]}


def get_rag_file_detail(file_id: str) -> dict[str, Any]:
    item = rag_rdb.get_rag_file(file_id)
    if not item:
        raise LookupError(f"rag file not found: {file_id}")
    raw_heading_schema = item.get("heading_schema") or {}
    raw_appendix_schema = item.get("appendix_schema") or {}
    runtime_heading_schema = (
        resolve_heading_schema_for_runtime(raw_heading_schema)
        if isinstance(raw_heading_schema, dict)
        else {}
    )
    runtime_appendix_schema = (
        resolve_heading_schema_for_runtime(raw_appendix_schema)
        if isinstance(raw_appendix_schema, dict)
        else {}
    )
    return {
        "item": _to_public_rag_file_item(item),
        "heading_schema": raw_heading_schema,
        "appendix_schema": raw_appendix_schema,
        "runtime_heading_schema": runtime_heading_schema,
        "runtime_appendix_schema": runtime_appendix_schema,
        "templates": list_rag_headings(),
    }


def list_rag_vector_record_page(file_id: str, *, offset: int = 0, limit: int = 50) -> dict[str, Any]:
    item = rag_rdb.get_rag_file(file_id)
    if not item:
        raise LookupError(f"rag file not found: {file_id}")

    safe_offset = max(0, int(offset))
    safe_limit = max(1, min(int(limit), 50))
    total_count = int(item.get("vector_count") or 0)
    records = rag_rdb.list_rag_vector_records(file_id, offset=safe_offset, limit=safe_limit)
    next_offset = safe_offset + len(records)

    return {
        "file_id": file_id,
        "offset": safe_offset,
        "limit": safe_limit,
        "total_count": total_count,
        "has_more": next_offset < total_count,
        "records": records,
    }


def delete_rag_document(file_id: str) -> dict[str, Any]:
    item = rag_rdb.get_rag_file(file_id)
    if not item:
        raise LookupError(f"rag file not found: {file_id}")

    deleted_vector_count = 0
    try:
        with transaction() as conn:
            deleted_vector_count = rag_rdb.delete_rag_vectors(file_id=file_id, connection=conn)
            deleted_file_count = rag_rdb.delete_rag_file(file_id=file_id, connection=conn)
            if deleted_file_count < 1:
                raise LookupError(f"rag file not found: {file_id}")
    except DBExecutionError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except LookupError:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"RAG 삭제 실패: {exc}") from exc

    _delete_rag_source_file(item.get("file_path"))

    return {
        "ok": True,
        "file_id": file_id,
        "deleted_vector_count": int(deleted_vector_count or 0),
        "embedding_deleted": bool((item.get("embedding_yn") or "").strip() == "Y"),
    }


def update_rag_file_basic_info(
    file_id: str,
    *,
    doc_cat: str,
    doc_version: float,
    publication_date: str | None,
    doc_number: str | None,
    doc_manager: str | None,
) -> dict[str, Any]:
    item = rag_rdb.get_rag_file(file_id)
    if not item:
        raise LookupError(f"rag file not found: {file_id}")

    normalized_doc_cat = str(doc_cat or "").strip()
    if not normalized_doc_cat:
        raise HTTPException(status_code=400, detail="문서구분은 비워둘 수 없습니다.")

    try:
        normalized_doc_version = float(doc_version)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="문서버전 값이 올바르지 않습니다.") from exc
    if normalized_doc_version <= 0:
        raise HTTPException(status_code=400, detail="문서버전 값이 올바르지 않습니다.")

    normalized_publication_date = str(publication_date or "").strip() or None
    normalized_doc_number = str(doc_number or "").strip() or None
    normalized_doc_manager = str(doc_manager or "").strip() or None
    user_no = _get_current_user_no()

    try:
        with transaction() as conn:
            updated = rag_rdb.update_rag_file_basic_info(
                file_id=file_id,
                doc_cat=normalized_doc_cat,
                doc_version=normalized_doc_version,
                publication_date=normalized_publication_date,
                doc_number=normalized_doc_number,
                doc_manager=normalized_doc_manager,
                user_no=user_no,
                connection=conn,
            )
            if updated < 1:
                raise LookupError(f"rag file not found: {file_id}")
    except DBExecutionError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {"ok": True, "file_id": file_id}


def _to_public_rag_file_item(item: dict[str, Any]) -> dict[str, Any]:
    return {
        key: value
        for key, value in item.items()
        if key not in {"file_path", "heading_schema", "appendix_schema"}
    }


def get_rag_original_file_local_path(file_id: str) -> tuple[str, str]:
    item = rag_rdb.get_rag_file(file_id)
    if not item:
        raise LookupError(f"rag file not found: {file_id}")

    storage_key = _normalize_rag_storage_key(str(item.get("file_path") or ""))
    if not storage_key:
        raise LookupError("원본문서 경로가 등록되지 않았습니다.")

    load_backend_env()
    bucket_name = os.getenv("BUCKET_DOCUMENT")
    if not bucket_name:
        raise HTTPException(status_code=500, detail="BUCKET_DOCUMENT 환경 변수가 설정되지 않았습니다.")

    suffix = Path(storage_key).suffix or Path(str(item.get("file_name") or "")).suffix or ".bin"
    local_dir = os.path.join(tempfile.gettempdir(), "locaville_rag")
    local_filename = f"{file_id}{suffix}"

    storage_client = LocavilleStorageClient(bucket_name=bucket_name)
    storage_client.download_file(
        source_path=storage_key,
        local_dir=local_dir,
        local_filename=local_filename,
    )

    local_path = os.path.join(local_dir, local_filename)
    if not os.path.exists(local_path):
        raise HTTPException(status_code=500, detail="원본문서 다운로드에 실패했습니다.")

    return local_path, local_filename


def _extract_markdown_blocks(content: bytes, filename: str) -> list[ParsedBlock]:
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError:
        text = content.decode("utf-8", errors="ignore")
    blocks: list[ParsedBlock] = []
    current_heading = ""
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("#"):
            current_heading = stripped.lstrip("#").strip()
            continue
        blocks.append(ParsedBlock(title=current_heading, text=stripped, section=filename))
    if not blocks:
        raise HwpxParsingError(f"{filename} 에서 파싱 가능한 텍스트를 찾지 못했어요.")
    return blocks


def _extract_blocks_for_rag(filename: str, content: bytes) -> list[ParsedBlock]:
    suffix = Path(filename).suffix.lower()
    if suffix == ".md":
        return _extract_markdown_blocks(content, filename)
    return extract_blocks(filename, content)


def _preview_blocks(blocks: list[ParsedBlock], limit: int = 10) -> list[dict[str, Any]]:
    return [asdict(block) for block in blocks[:limit]]


def _collect_text_samples(items: list[Any], limit: int = 20) -> list[str]:
    samples: list[str] = []
    for item in items[:limit]:
        if isinstance(item, dict):
            text = _normalize_spaces(str(item.get("text") or ""))
            if text:
                samples.append(text)
            continue
        if isinstance(item, ParsedBlock):
            text = _normalize_spaces(f"{item.title or ''} {item.text or ''}")
            if text:
                samples.append(text)
    return samples


def _normalize_spaces(text: str) -> str:
    return " ".join((text or "").split()).strip()


def _strip_invisible_chars(text: str) -> str:
    return "".join(
        ch
        for ch in (text or "")
        if unicodedata.category(ch) not in {"Cf", "Cc", "Cs"}
    )


def _normalize_sample_key(text: str) -> str:
    normalized = unicodedata.normalize("NFKC", _strip_invisible_chars(text))
    normalized = re.sub(r"\s*\|\s*", " ", normalized)
    normalized = re.sub(r"^([IVXLCDM]+)(?=[A-Za-z가-힣])", r"\1 ", normalized)
    normalized = re.sub(r"^([ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩⅪⅫ]+)(?=[A-Za-z가-힣])", r"\1 ", normalized)
    normalized = re.sub(r"^([0-9]+[.)]?)(?=[A-Za-z가-힣])", r"\1 ", normalized)
    return _normalize_spaces(normalized)


def _normalize_heading_display_text(text: str) -> str:
    normalized = _strip_invisible_chars(text)
    normalized = re.sub(r"\s*\|\s*", " ", normalized)
    normalized = re.sub(r"^([IVXLCDM]+)(?=[A-Za-z가-힣])", r"\1 ", normalized)
    normalized = re.sub(r"^([ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩⅪⅫ]+)(?=[A-Za-z가-힣])", r"\1 ", normalized)
    normalized = re.sub(r"^([0-9]+[.)]?)(?=[A-Za-z가-힣])", r"\1 ", normalized)
    normalized = re.sub(r"^([가-힣][.)])(?=[A-Za-z가-힣])", r"\1 ", normalized)
    return _normalize_spaces(normalized)


def _normalize_sample_compare_key(text: str) -> str:
    return re.sub(r"\s+", "", _normalize_sample_key(text))


def _normalize_single_row_table_heading_text(item: dict[str, Any], text: str) -> str:
    source_location = _normalize_source_location(item.get("location") or "paragraph")
    row_count = item.get("row_count")
    if source_location == "table" and row_count == 1:
        return _normalize_spaces(re.sub(r"\s*\|\s*", " ", _strip_invisible_chars(text)))
    return _strip_invisible_chars(str(text or "")).strip()


def _append_unique_sample(samples: list[str], text: str, *, limit: int = MAX_MATCHED_SAMPLE_ITEMS) -> bool:
    normalized = _normalize_sample_compare_key(text)
    if not normalized:
        return False
    if any(_normalize_sample_compare_key(existing) == normalized for existing in samples):
        return False
    if len(samples) < limit:
        display_text = _normalize_heading_display_text(text) if _looks_like_generic_heading_text(text) else text
        samples.append(display_text)
    return True


def _guess_doc_name(blocks: list[ParsedBlock], fallback_name: str) -> str:
    return Path(fallback_name).stem[:120]


def _slugify_file_id(doc_name: str) -> str:
    normalized = unicodedata.normalize("NFKC", doc_name or "")
    base_text = normalized.strip()
    if not base_text:
        base_text = "rag_document"
    slug = re.sub(r"[^\w가-힣]+", "_", base_text, flags=re.UNICODE).strip("_").lower()
    slug = re.sub(r"_+", "_", slug)
    return (slug or "rag_document")[:64]


def _build_unique_file_id(base_slug: str) -> str:
    slug = base_slug[:64] or "rag_document"
    if not rag_rdb.file_exists(slug):
        return slug
    for idx in range(2, 1000):
        suffix = f"_{idx}"
        candidate = f"{slug[: max(1, 64 - len(suffix))]}{suffix}"
        if not rag_rdb.file_exists(candidate):
            return candidate
    raise HTTPException(status_code=409, detail="사용 가능한 file_id 를 생성하지 못했습니다.")


def _infer_doc_cat(doc_name: str) -> str:
    name = doc_name.replace(" ", "")
    if any(tok in name for tok in ("공고", "공고문", "모집")):
        return "공고문"
    if any(tok in name for tok in ("시행지침", "시행문서", "지침", "시행계획")):
        return "시행문서"
    if any(tok in name for tok in ("제안서", "제안요청", "rfp")):
        return "제안서"
    if any(tok in name for tok in ("보고서", "백서")):
        return "보고서"
    return "기타문서"


def _infer_version(items: list[Any]) -> float:
    text = "\n".join(_collect_text_samples(items, limit=20))
    patterns = (
        r"(?:ver(?:sion)?|버전)\s*[:.]?\s*([0-9]+(?:\.[0-9]+)?)",
        r"v\s*([0-9]+(?:\.[0-9]+)?)",
    )
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            try:
                return float(match.group(1))
            except ValueError:
                continue
    return 1.0


def _parse_date(parts: tuple[str, str, str]) -> str | None:
    try:
        year, month, day = (int(p) for p in parts)
        return date(year, month, day).isoformat()
    except Exception:
        return None


def _infer_publication_date(items: list[Any]) -> str | None:
    text = "\n".join(_collect_text_samples(items, limit=20))
    for pattern in (
        r"(20\d{2})[.\-/년]\s*(\d{1,2})[.\-/월]\s*(\d{1,2})",
        r"(20\d{2})(\d{2})(\d{2})",
    ):
        match = re.search(pattern, text)
        if match:
            parsed = _parse_date(match.groups())
            if parsed:
                return parsed
    return None


def _infer_doc_manager(items: list[Any]) -> str | None:
    org_pattern = re.compile(r"(전라남도|대한민국|농림축산식품부|농촌진흥청|시청|도청|군청|구청|읍사무소|면사무소|동행정복지센터|행정복지센터|농업기술센터|공사|공단|재단|협회|위원회|본부|청|부|과|팀|실)$")
    person_pattern = re.compile(r"^[가-힣]{2,4}(?:\s*(?:주무관|팀장|과장|사무관|담당자|담당))$")
    for sample in _collect_text_samples(items, limit=20):
        for raw_line in sample.splitlines():
            line = _normalize_spaces(raw_line)
            if not line:
                continue
            if len(line) > 40:
                continue
            if any(token in line for token in (":", "*", "|", "·", "(", ")", ".")):
                continue
            if org_pattern.search(line) or person_pattern.match(line):
                return line
    return ""


def _load_heading_schema(heading_id: str) -> dict[str, Any]:
    heading = rag_rdb.get_rag_heading(heading_id)
    if not heading:
        raise HTTPException(status_code=404, detail="선택한 Heading Template 을 찾을 수 없습니다.")
    schema = heading.get("heading_schema")
    if isinstance(schema, dict):
        return resolve_heading_schema_for_runtime(schema)
    raise HTTPException(status_code=500, detail="Heading Template 의 heading_schema 형식이 올바르지 않습니다.")


def _normalize_regex_pattern(pattern: str) -> str:
    value = str(pattern or "")
    if "\\\\" in value:
        value = value.replace("\\\\", "\\")
    return value


def _normalize_heading_schema(schema: dict[str, Any]) -> dict[str, Any]:
    levels = schema.get("levels")
    if not isinstance(levels, list):
        return schema

    normalized_levels: list[dict[str, Any]] = []
    changed = False
    for level in levels:
        if not isinstance(level, dict):
            normalized_levels.append(level)
            continue
        next_level = dict(level)
        pattern = next_level.get("pattern")
        if isinstance(pattern, str):
            normalized_pattern = _normalize_regex_pattern(pattern)
            if normalized_pattern != pattern:
                next_level["pattern"] = normalized_pattern
                changed = True
        normalized_levels.append(next_level)

    if not changed:
        return schema
    return {**schema, "levels": normalized_levels}


def _merge_rule_options(base: Any, override: Any) -> dict[str, Any]:
    merged: dict[str, Any] = {}
    if isinstance(base, dict):
        merged.update(base)
    if isinstance(override, dict):
        merged.update(override)
    return merged


def resolve_heading_schema_for_runtime(schema: dict[str, Any]) -> dict[str, Any]:
    normalized = _normalize_heading_schema(schema)
    levels = normalized.get("levels")
    if not isinstance(levels, list):
        return normalized

    resolved_levels: list[dict[str, Any]] = []
    for idx, level in enumerate(levels, start=1):
        if not isinstance(level, dict):
            continue

        next_level = dict(level)
        rule_id = str(next_level.get("rule_id") or "").strip()
        if not rule_id:
            resolved_levels.append(next_level)
            continue

        rule = rag_rdb.get_rag_heading_rule(rule_id)
        if not rule:
            raise HTTPException(status_code=404, detail=f"Heading rule 을 찾을 수 없습니다: {rule_id}")

        rule_type = str(rule.get("rule_type") or "").strip()
        notation = str(next_level.get("notation") or rule.get("notation") or "").strip()
        notation_display = str(next_level.get("notation_display") or rule.get("notation_display") or notation).strip()
        location = _normalize_level_location(next_level.get("location") or "paragraph")
        rule_options = _merge_rule_options(rule.get("rule_options"), next_level.get("rule_options"))
        pattern_text = str(rule.get("pattern_text") or "").strip()

        resolved_level = {
            "depth": int(next_level.get("depth") or idx),
            "location": location,
            "notation": notation,
            "notation_display": notation_display or notation,
            "rule_type": rule_type or None,
            "rule_options": rule_options or None,
        }
        if next_level.get("name") is not None:
            resolved_level["name"] = next_level.get("name")
        if pattern_text:
            resolved_level["pattern"] = pattern_text
        if rule_id:
            resolved_level["rule_id"] = rule_id

        resolved_levels.append(resolved_level)

    return {**normalized, "levels": resolved_levels}


def _bool_option(options: dict[str, Any], key: str, default: bool) -> bool:
    value = options.get(key)
    if value is None:
        return default
    return bool(value)


def _int_option(options: dict[str, Any], key: str, default: int) -> int:
    value = options.get(key)
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return parsed if parsed > 0 else default


def _nonneg_int_option(options: dict[str, Any], key: str) -> int | None:
    value = options.get(key)
    if value is None:
        return None
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed >= 0 else None


def _get_rule_options(level: dict[str, Any]) -> dict[str, Any]:
    options = level.get("rule_options")
    return options if isinstance(options, dict) else {}


def _space_pattern(max_spaces: int | None, *, default_unbounded: str) -> str:
    if max_spaces is None:
        return default_unbounded
    return rf"[ \t]{{0,{max_spaces}}}"


def _prefix_with_spacing(options: dict[str, Any]) -> str:
    leading_space_max = _nonneg_int_option(options, "leading_space_max")
    if leading_space_max is not None:
        return r"^" + _space_pattern(leading_space_max, default_unbounded=r"[ \t]*")
    return r"^\s*" if _bool_option(options, "allow_leading_space", True) else r"^"


def _suffix_with_spacing(options: dict[str, Any]) -> str:
    trailing_space_max = _nonneg_int_option(options, "trailing_space_max")
    if trailing_space_max is not None:
        spacing = _space_pattern(trailing_space_max, default_unbounded=r"[ \t]*")
        return spacing + r"$"
    return r"(?:\s+|$)" if _bool_option(options, "require_space_or_eol", True) else ""


def _title_text_suffix(options: dict[str, Any]) -> str:
    trailing_space_max = _nonneg_int_option(options, "trailing_space_max")
    spacing = _space_pattern(trailing_space_max, default_unbounded=r"\s*")
    if _bool_option(options, "require_text_after_marker", True):
        return spacing + r"(?=.*[가-힣A-Za-z]).+$"
    return _suffix_with_spacing(options)


def _trailing_dot_mode(options: dict[str, Any], notation: str, *, default_optional: bool = False) -> str:
    explicit = str(options.get("trailing_dot") or "").strip().lower()
    if explicit in {"required", "forbidden", "either"}:
        return explicit
    if " / " in notation:
        return "either"
    if default_optional:
        return "either"
    return "required" if notation.strip().endswith(".") else "forbidden"


def _roman_marker_pattern(roman_range: str, mode: str) -> str:
    base = rf"(?:[{roman_range}]|[IVXLCDM]+)"
    if mode == "forbidden":
        return base
    if mode == "either":
        return base + r"(?:\.)?"
    return base + r"\."


def _compile_level_pattern(level: dict[str, Any]) -> str:
    rule_type = str(level.get("rule_type") or "").strip()
    options = _get_rule_options(level)
    notation = str(level.get("notation") or "").strip()

    if rule_type == "numeric_dot":
        segments = _int_option(options, "segments", 1)
        if segments <= 1:
            mode = _trailing_dot_mode(
                options,
                notation,
                default_optional=_bool_option(options, "allow_missing_terminal_dot", False),
            )
            if mode == "forbidden":
                body = r"[0-9]+"
            elif mode == "either":
                body = r"[0-9]+(?:\.)?"
            else:
                body = r"[0-9]+\."
        else:
            body = r"\.".join([r"[0-9]+"] * segments)
            mode = _trailing_dot_mode(
                options,
                notation,
                default_optional=_bool_option(options, "allow_trailing_dot", True),
            )
            if mode == "required":
                body += r"\."
            elif mode == "either":
                body += r"\.?"
        return _prefix_with_spacing(options) + body + _title_text_suffix(options)

    if rule_type == "korean_letter_dot":
        letter_range = str(options.get("letter_range") or "가-히")
        mode = _trailing_dot_mode(options, notation)
        if mode == "forbidden":
            body = f"[{letter_range}]"
        elif mode == "either":
            body = f"[{letter_range}](?:\\.)?"
        else:
            body = f"[{letter_range}]\\."
        return _prefix_with_spacing(options) + body + _title_text_suffix(options)

    if rule_type == "roman":
        roman_range = str(options.get("roman_range") or "ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ")
        mode = _trailing_dot_mode(options, notation, default_optional=True)
        body = _roman_marker_pattern(roman_range, mode)
        return _prefix_with_spacing(options) + body + _title_text_suffix(options)

    if rule_type == "numeric_paren":
        return _prefix_with_spacing(options) + r"[0-9]+\)" + _title_text_suffix(options)

    if rule_type == "korean_letter_paren":
        letter_range = str(options.get("letter_range") or "가-히")
        return _prefix_with_spacing(options) + f"[{letter_range}]\\)" + _title_text_suffix(options)

    if rule_type == "circled_number":
        return _prefix_with_spacing(options) + r"[\u2460-\u2473]" + _title_text_suffix(options)

    if rule_type == "circled_korean":
        return _prefix_with_spacing(options) + r"[\u3260-\u326F]" + _title_text_suffix(options)

    if rule_type == "paren_numeric":
        return _prefix_with_spacing(options) + r"\([0-9]+\)" + _title_text_suffix(options)

    if rule_type == "paren_korean":
        letter_range = str(options.get("letter_range") or "가-히")
        return _prefix_with_spacing(options) + f"\\([{letter_range}]\\)" + _title_text_suffix(options)

    if rule_type == "legal_article":
        body = r"제[0-9]+조"
        if _bool_option(options, "allow_sub_article", True):
            body += r"(?:의[0-9]+)?"
        if _bool_option(options, "allow_title_paren", True):
            body += r"(?:\s*\([^\)]+\))?"
        return _prefix_with_spacing(options) + body + _title_text_suffix(options)

    if rule_type == "symbol":
        symbols = options.get("symbols")
        if isinstance(symbols, list):
            text = "".join(str(symbol) for symbol in symbols if str(symbol))
        else:
            text = str(symbols or level.get("notation") or "")
        if text:
            return _prefix_with_spacing(options) + f"[{re.escape(text)}]" + _title_text_suffix(options)

    pattern = level.get("pattern")
    if isinstance(pattern, str):
        return _normalize_regex_pattern(pattern)
    return ""


def _normalize_level_location(value: Any) -> str:
    text = str(value or "").strip().lower()
    if text in {"paragraph", "table", "both"}:
        return text
    return "paragraph"


def _normalize_source_location(value: Any) -> str:
    text = str(value or "").strip().lower()
    if text in {"table", "table-cell"}:
        return "table"
    return "paragraph"


def _location_matches(level_location: str, source_location: str) -> bool:
    normalized_level = _normalize_level_location(level_location)
    normalized_source = _normalize_source_location(source_location)
    return normalized_level == "both" or normalized_level == normalized_source


_SYMBOL_CANDIDATE_RE = re.compile(r"^\s*([①-⑳㉮-㉻❍○●⊙■□▣◇◆▶▷☞·•◦◉◈▪▫◾◽◼◻◯❑])(?:\s+|$)")
_GENERIC_HEADING_PREFIX_RE = re.compile(
    r"^\s*(?:"
    r"[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩⅪⅫIVXLCDM]+(?:\s+|$)"
    r"|[0-9]+[.)]?(?:\s+|$)"
    r"|[가-힣][.)](?:\s+|$)"
    r"|\([가-힣]\)(?:\s+|$)"
    r"|[①-⑳㉮-㉻❍○●⊙■□▣◇◆▶▷☞※·•◦◉◈▪▫◾◽◼◻◯❑](?:\s+|$)"
    r")"
)


def _iter_raw_block_lines(blocks: list[ParsedBlock]) -> list[dict[str, str]]:
    return parser_iter_raw_block_lines(blocks)


def _iter_block_lines(blocks: list[ParsedBlock]) -> list[dict[str, str]]:
    return parser_iter_raw_block_lines(blocks)


def _flatten_preparse_table_row(row: list[str]) -> str:
    return _normalize_spaces(" ".join(cell for cell in row if _normalize_spaces(cell)))


def _looks_like_generic_heading_text(text: str) -> bool:
    normalized = _normalize_sample_key(text)
    if not normalized:
        return False
    return bool(_GENERIC_HEADING_PREFIX_RE.match(normalized))


def _extract_hwpx_preparse_lines(content: bytes) -> list[dict[str, Any]]:
    lines: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    seen_heading_keys: set[str] = set()

    def append_once(value: str, *, location: str, row_count: int | None = None, cell_count: int | None = None) -> None:
        normalized = _normalize_spaces(value)
        normalized_location = _normalize_source_location(location)
        key = (normalized, normalized_location)
        heading_key = _normalize_sample_key(normalized)
        if (
            normalized
            and heading_key
            and _looks_like_generic_heading_text(normalized)
            and heading_key in seen_heading_keys
        ):
            return
        if not normalized or key in seen:
            return
        seen.add(key)
        if heading_key and _looks_like_generic_heading_text(normalized):
            seen_heading_keys.add(heading_key)
        item: dict[str, Any] = {"text": normalized, "location": normalized_location}
        if row_count is not None:
            item["row_count"] = row_count
        if cell_count is not None:
            item["cell_count"] = cell_count
        if row_count == 1 and cell_count == 1:
            item["is_box"] = True
        lines.append(item)

    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        section_files = sorted(
            [name for name in archive.namelist() if re.match(r"^Contents/section\d+\.xml$", name)],
            key=lambda path: int(re.search(r"section(\d+)\.xml$", path).group(1)) if re.search(r"section(\d+)\.xml$", path) else 999999,
        )
        for section_name in section_files:
            xml_text = archive.read(section_name).decode("utf-8", errors="ignore")
            try:
                root = ET.fromstring(xml_text)
            except ET.ParseError:
                xml_text_without_tables = re.sub(
                    r"<[^>]+:tbl\b.*?</[^>]+:tbl>",
                    "",
                    xml_text,
                    flags=re.DOTALL,
                )
                paragraph_blocks = re.findall(
                    r"<[^>]+:p\b.*?</[^>]+:p>",
                    xml_text_without_tables,
                    flags=re.DOTALL,
                )
                for paragraph_xml in paragraph_blocks:
                    text = _extract_paragraph_text_from_xml(paragraph_xml)
                    if text:
                        append_once(text, location="paragraph")
                continue

            parent_map = {child: parent for parent in root.iter() for child in parent}
            for node in root.iter():
                local_name = _localname(node.tag)
                if local_name == "tbl":
                    matrix: list[list[str]] = []
                    for child in node.iter():
                        if _localname(child.tag) != "tr":
                            continue
                        row_cells: list[str] = []
                        for grandchild in child:
                            if _localname(grandchild.tag) != "tc":
                                continue
                            cell_text = _normalize_spaces(_extract_paragraph_text(grandchild))
                            if cell_text:
                                row_cells.append(cell_text)
                        if row_cells:
                            matrix.append(row_cells)
                    if len(matrix) == 1:
                        cell_count = len(matrix[0])
                        flattened = _flatten_preparse_table_row(matrix[0])
                        if flattened:
                            append_once(flattened, location="table", row_count=1, cell_count=cell_count)
                    continue
                if local_name != "p":
                    continue

                current = parent_map.get(node)
                in_table = False
                while current is not None:
                    if _localname(current.tag) == "tbl":
                        in_table = True
                        break
                    current = parent_map.get(current)
                if in_table:
                    continue

                text = _normalize_spaces(_extract_paragraph_text(node))
                if text:
                    append_once(text, location="paragraph")
    return lines


def _strip_heading_marker(level: dict[str, Any], line: str) -> str:
    text = (line or "").lstrip()
    rule_type = str(level.get("rule_type") or "").strip()
    options = _get_rule_options(level)
    notation = str(level.get("notation") or "").strip()

    if rule_type == "numeric_dot":
        segments = _int_option(options, "segments", 1)
        if segments <= 1:
            mode = _trailing_dot_mode(
                options,
                notation,
                default_optional=_bool_option(options, "allow_missing_terminal_dot", False),
            )
            if mode == "forbidden":
                marker = re.compile(r"^[0-9]+")
            elif mode == "either":
                marker = re.compile(r"^[0-9]+(?:\.)?")
            else:
                marker = re.compile(r"^[0-9]+\.")
        else:
            body = r"\.".join([r"[0-9]+"] * segments)
            mode = _trailing_dot_mode(
                options,
                notation,
                default_optional=_bool_option(options, "allow_trailing_dot", True),
            )
            if mode == "required":
                marker = re.compile(rf"^{body}\.")
            elif mode == "either":
                marker = re.compile(rf"^{body}\.?")
            else:
                marker = re.compile(rf"^{body}")
    elif rule_type == "korean_letter_dot":
        letter_range = str(options.get("letter_range") or "가-히")
        mode = _trailing_dot_mode(options, notation)
        if mode == "forbidden":
            marker = re.compile(rf"^[{letter_range}]")
        elif mode == "either":
            marker = re.compile(rf"^[{letter_range}](?:\.)?")
        else:
            marker = re.compile(rf"^[{letter_range}]\.")
    elif rule_type == "roman":
        roman_range = str(options.get("roman_range") or "ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ")
        mode = _trailing_dot_mode(options, notation, default_optional=True)
        marker = re.compile(r"^" + _roman_marker_pattern(roman_range, mode))
    elif rule_type == "numeric_paren":
        marker = re.compile(r"^[0-9]+\)")
    elif rule_type == "korean_letter_paren":
        letter_range = str(options.get("letter_range") or "가-히")
        marker = re.compile(rf"^[{letter_range}]\)")
    elif rule_type == "circled_number":
        marker = re.compile(r"^[\u2460-\u2473]")
    elif rule_type == "circled_korean":
        marker = re.compile(r"^[\u3260-\u326F]")
    elif rule_type == "paren_numeric":
        marker = re.compile(r"^\([0-9]+\)")
    elif rule_type == "paren_korean":
        letter_range = str(options.get("letter_range") or "가-히")
        marker = re.compile(rf"^\([{letter_range}]\)")
    elif rule_type == "legal_article":
        marker = re.compile(r"^제[0-9]+조(?:의[0-9]+)?(?:\s*\([^\)]+\))?")
    else:
        return text

    match = marker.match(text)
    if not match:
        return text
    return text[match.end():].strip()


def _is_heading_like_line(level: dict[str, Any], line: str) -> bool:
    rule_type = str(level.get("rule_type") or "").strip()
    if rule_type not in {"numeric_dot", "korean_letter_dot", "roman", "numeric_paren", "korean_letter_paren", "legal_article"}:
        return True

    remainder = _strip_heading_marker(level, line)
    if not remainder:
        return False
    if remainder[0].isdigit():
        return False
    if len(remainder) > 80:
        return False
    return bool(re.search(r"[가-힣A-Za-z]", remainder))


def _is_heading_like_symbol_candidate(text: str) -> bool:
    line = (text or "").strip()
    match = _SYMBOL_CANDIDATE_RE.match(line)
    if not match:
        return False

    remainder = line[match.end():].strip()
    if not remainder:
        return False
    if remainder[0].isdigit():
        return False
    if len(remainder) > 80:
        return False
    if not re.search(r"[가-힣A-Za-z]", remainder):
        return False
    return True


def _fallback_match_existing(
    text: str,
    location: str,
    *,
    is_box_table: bool = False,
    existing_matchers: list[tuple[dict[str, Any], str, re.Pattern[str]]],
) -> tuple[dict[str, Any], str, re.Pattern[str]] | None:
    line = (text or "").strip()
    if not line:
        return None

    candidates: list[tuple[dict[str, Any], str, re.Pattern[str]]] = []
    checks = [
        (r"^\s*(?:[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]|[IVXLCDM]+)\s*[\.．。]?\s+(.+)$", "roman"),
        (r"^\s*[가-힣]\s*[\.．。]\s*(.+)$", "korean_letter_dot"),
        (r"^\s*[가-힣]\s*\)\s*(.+)$", "korean_letter_paren"),
        (r"^\s*[0-9]+\s*[\.．。]\s+(.+)$", "numeric_dot"),
        (r"^\s*[0-9]+\s*\)\s*(.+)$", "numeric_paren"),
    ]

    for pattern, rule_type in checks:
        match = re.match(pattern, line)
        if not match:
            continue
        remainder = (match.group(1) or "").strip()
        if not remainder or not re.search(r"[가-힣A-Za-z]", remainder):
            continue
        if remainder[0].isdigit():
            continue
        for level, row_id, compiled in existing_matchers:
            if is_box_table and _normalize_level_location(level.get("location") or "paragraph") == "paragraph":
                continue
            if not _location_matches(str(level.get("location") or "paragraph"), location):
                continue
            if str(level.get("rule_type") or "").strip() == rule_type:
                candidates.append((level, row_id, compiled))
        if candidates:
            return candidates[0]
    return None


def _fallback_match_existing_symbol_only(
    text: str,
    location: str,
    *,
    is_box_table: bool = False,
    existing_matchers: list[tuple[dict[str, Any], str, re.Pattern[str]]],
) -> tuple[dict[str, Any], str, re.Pattern[str]] | None:
    line = (text or "").strip()
    if not line:
        return None

    match = _SYMBOL_CANDIDATE_RE.match(line)
    if not match:
        return None
    symbol = match.group(1)

    for level, row_id, compiled in existing_matchers:
        if is_box_table and _normalize_level_location(level.get("location") or "paragraph") == "paragraph":
            continue
        if not _location_matches(str(level.get("location") or "paragraph"), location):
            continue
        rule_type = str(level.get("rule_type") or "").strip()
        notation = str(level.get("notation") or "").strip()
        rule_options = _get_rule_options(level)

        if rule_type == "circled_number" and re.match(r"[①-⑳]", symbol):
            return level, row_id, compiled
        if rule_type == "circled_korean" and re.match(r"[㉮-㉻]", symbol):
            return level, row_id, compiled
        if rule_type == "symbol":
            symbols = rule_options.get("symbols")
            allowed_symbols = (
                {str(value) for value in symbols if str(value)}
                if isinstance(symbols, list)
                else ({notation} if notation else set())
            )
            if symbol in allowed_symbols:
                return level, row_id, compiled
    return None


def _matches_appendix_title_table(level: dict[str, Any], item: dict[str, Any]) -> bool:
    source_location = _normalize_source_location(item.get("location") or "paragraph")
    if source_location != "table":
        return False

    options = _get_rule_options(level)
    text = _normalize_single_row_table_heading_text(item, str(item.get("text") or ""))
    if not text:
        return False

    row_count = item.get("row_count")
    cell_count = item.get("cell_count")
    if _bool_option(options, "single_row_table_only", True) and row_count not in {None, 1}:
        return False

    required_cell_count = options.get("require_cell_count")
    try:
        expected_cell_count = int(required_cell_count) if required_cell_count is not None else None
    except (TypeError, ValueError):
        expected_cell_count = None
    if expected_cell_count is not None and cell_count not in {None, expected_cell_count}:
        return False

    keywords = options.get("keywords")
    keyword_group = "|".join(
        re.escape(str(keyword).strip())
        for keyword in keywords
        if str(keyword).strip()
    ) if isinstance(keywords, list) else ""
    if not keyword_group:
        keyword_group = r"참고|첨부"

    title_min_length = _int_option(options, "title_cell_min_length", 2)
    if _bool_option(options, "left_cell_number_required", True):
        pattern = rf"^\s*(?:{keyword_group})\s*\d+\s*(?:\||\s)\s*(.+)$"
    else:
        pattern = rf"^\s*(?:{keyword_group})\s*(?:\||\s)\s*(.+)$"

    match = re.match(pattern, text)
    if not match:
        return False
    title_text = _normalize_spaces(match.group(1) or "")
    return len(title_text) >= title_min_length


def _matches_level_for_preparse(
    level: dict[str, Any],
    item: dict[str, Any],
    *,
    restrict_box_main_reentry: bool = False,
) -> bool:
    source_location = _normalize_source_location(item.get("location") or "paragraph")
    level_location = str(level.get("location") or "paragraph")

    if restrict_box_main_reentry and bool(item.get("is_box")) and source_location == "table":
        if _normalize_level_location(level_location) == "paragraph":
            return False

    if not _location_matches(level_location, source_location):
        return False

    rule_type = str(level.get("rule_type") or "").strip()
    text = _normalize_single_row_table_heading_text(item, str(item.get("text") or ""))
    if not text:
        return False

    if rule_type == "appendix_title_table":
        return _matches_appendix_title_table(level, item)

    pattern = _compile_level_pattern(level)
    if not pattern:
        return False
    try:
        compiled = re.compile(pattern)
    except re.error:
        return False
    return bool(compiled.match(text) and _is_heading_like_line(level, text))


def _is_symbolic_reentry_level(level: dict[str, Any]) -> bool:
    rule_type = str(level.get("rule_type") or "").strip().lower()
    rule_id = str(level.get("rule_id") or "").strip().lower()
    notation = str(level.get("notation") or "").strip()

    if rule_type in {"symbol", "custom:symbol"}:
        return True
    if rule_id in {"symbol", "custom:symbol"}:
        return True

    compact = re.sub(r"[\s,.\-_/|()]+", "", notation)
    if compact and not re.search(r"[0-9A-Za-z가-힣ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ①-⑳㉮-㉻]", compact):
        return True
    return False


def _matches_schema_for_preparse(
    item: dict[str, Any],
    schema: dict[str, Any] | None,
    *,
    depth: int | None = None,
    restrict_box_main_reentry: bool = False,
    exclude_symbolic_reentry_levels: bool = False,
) -> bool:
    if not isinstance(schema, dict):
        return False
    levels = schema.get("levels")
    if not isinstance(levels, list):
        return False

    for idx, raw_level in enumerate(levels, start=1):
        if not isinstance(raw_level, dict):
            continue
        level_depth = int(raw_level.get("depth") or idx)
        if depth is not None and level_depth != depth:
            continue
        if exclude_symbolic_reentry_levels and _is_symbolic_reentry_level(raw_level):
            continue
        if _matches_level_for_preparse(
            raw_level,
            item,
            restrict_box_main_reentry=restrict_box_main_reentry,
        ):
            return True
    return False


def _level_depth(level: dict[str, Any], fallback_idx: int = 0) -> int:
    return int(level.get("depth") or fallback_idx or 0)


def _find_first_matching_level(
    item: dict[str, Any],
    schema: dict[str, Any] | None,
    *,
    depth: int | None = None,
    restrict_box_main_reentry: bool = False,
    exclude_symbolic_reentry_levels: bool = False,
) -> dict[str, Any] | None:
    if not isinstance(schema, dict):
        return None
    levels = schema.get("levels")
    if not isinstance(levels, list):
        return None

    for idx, raw_level in enumerate(levels, start=1):
        if not isinstance(raw_level, dict):
            continue
        level_depth = _level_depth(raw_level, idx)
        if depth is not None and level_depth != depth:
            continue
        if exclude_symbolic_reentry_levels and _is_symbolic_reentry_level(raw_level):
            continue
        if _matches_level_for_preparse(
            raw_level,
            item,
            restrict_box_main_reentry=restrict_box_main_reentry,
        ):
            return raw_level
    return None


def _iter_matching_levels_for_exit_criteria(
    criteria: dict[str, Any] | None,
    target_schema: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    if not isinstance(criteria, dict) or not isinstance(target_schema, dict):
        return []
    if str(criteria.get("mode") or "").strip() != "matched_heading":
        return []
    match = criteria.get("match")
    if not isinstance(match, dict):
        return []

    levels = target_schema.get("levels")
    if not isinstance(levels, list):
        return []

    target_depth = match.get("depth")
    target_rule_id = str(match.get("rule_id") or "").strip()
    target_notation = str(match.get("notation") or "").strip()

    matched_levels: list[dict[str, Any]] = []
    for idx, level in enumerate(levels, start=1):
        if not isinstance(level, dict):
            continue
        level_depth = int(level.get("depth") or idx)
        if target_depth is not None:
            try:
                if level_depth > int(target_depth):
                    continue
            except (TypeError, ValueError):
                continue
        if target_rule_id and str(level.get("rule_id") or "").strip() != target_rule_id:
            continue
        if target_notation and str(level.get("notation") or "").strip() != target_notation:
            continue
        matched_levels.append(level)
    return matched_levels


def _matches_exit_criteria(
    item: dict[str, Any],
    *,
    criteria: dict[str, Any] | None,
    target_schema: dict[str, Any] | None,
    restrict_box_main_reentry: bool = False,
    exclude_symbolic_reentry_levels: bool = False,
) -> bool:
    for level in _iter_matching_levels_for_exit_criteria(criteria, target_schema):
        if exclude_symbolic_reentry_levels and _is_symbolic_reentry_level(level):
            continue
        if _matches_level_for_preparse(
            level,
            item,
            restrict_box_main_reentry=restrict_box_main_reentry,
        ):
            return True
    return False


def _matches_default_appendix_exit(item: dict[str, Any], main_schema: dict[str, Any]) -> bool:
    levels = main_schema.get("levels")
    if not isinstance(levels, list):
        return False
    for idx, level in enumerate(levels, start=1):
        if not isinstance(level, dict):
            continue
        level_depth = int(level.get("depth") or idx)
        if level_depth > 2:
            continue
        if _is_symbolic_reentry_level(level):
            continue
        if _matches_level_for_preparse(level, item, restrict_box_main_reentry=True):
            return True
    return False


def _should_skip_main_preparse_item(item: dict[str, Any]) -> bool:
    source_location = _normalize_source_location(item.get("location") or "paragraph")
    if source_location != "table":
        return False
    if bool(item.get("is_box")):
        return True
    row_count = item.get("row_count")
    cell_count = item.get("cell_count")
    if row_count == 1 and isinstance(cell_count, int) and cell_count > 1:
        text = str(item.get("text") or "").strip()
        return not _looks_like_generic_heading_text(text)
    return False


def _is_single_row_table_item(item: dict[str, Any]) -> bool:
    source_location = _normalize_source_location(item.get("location") or "paragraph")
    if source_location != "table":
        return False
    return item.get("row_count") == 1


def _split_preparse_lines_by_domain(
    source_lines: list[dict[str, Any]],
    *,
    main_schema: dict[str, Any],
    appendix_schema: dict[str, Any] | None,
    body_exit_criteria: dict[str, Any] | None = None,
    appendix_exit_criteria: dict[str, Any] | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    return parser_split_preparse_lines_by_domain(
        source_lines,
        main_schema=main_schema,
        appendix_schema=appendix_schema,
        body_exit_criteria=body_exit_criteria,
        appendix_exit_criteria=appendix_exit_criteria,
    )


def _guess_symbol_depth(symbol: str) -> int:
    if symbol in {"❍", "○", "●", "⊙", "■", "□", "▣", "◇", "◆", "❑", ""}:
        return 2
    if re.match(r"[①-⑳]", symbol):
        return 5
    if re.match(r"[㉮-㉻]", symbol):
        return 6
    return 2


def _build_heading_rows(
    schema: dict[str, Any],
    *,
    raw_lines: list[dict[str, Any]] | None = None,
    allow_new_candidates: bool = True,
) -> list[dict[str, Any]]:
    return parser_build_heading_rows(
        schema,
        raw_lines=raw_lines,
        allow_new_candidates=allow_new_candidates,
    )


def preparse_rag_document(
    *,
    filename: str,
    content: bytes,
    ref_heading_id: str,
    ref_appendix_id: str | None = None,
    body_exit_criteria: dict[str, Any] | None = None,
    appendix_exit_criteria: dict[str, Any] | None = None,
) -> dict[str, Any]:
    suffix = Path(filename).suffix.lower()
    if suffix not in SUPPORTED_SUFFIXES:
        raise HTTPException(
            status_code=400,
            detail=f"지원하지 않는 형식입니다: {suffix or '확장자 없음'}. {', '.join(SUPPORTED_SUFFIXES)} 만 가능합니다.",
        )
    blocks: list[ParsedBlock] = []
    preparse_lines: list[dict[str, Any]] | None = None
    main_source_lines: list[dict[str, Any]] | None = None
    appendix_source_lines: list[dict[str, Any]] | None = None
    heading_rows: list[dict[str, Any]] | None = None
    appendix_heading_rows: list[dict[str, Any]] | None = None

    schema = _load_heading_schema(ref_heading_id)
    appendix_schema = _load_heading_schema(ref_appendix_id) if str(ref_appendix_id or "").strip() else None

    if suffix == ".hwpx":
        try:
            hwpx_result = HwpxHeadingParser(
                main_schema=schema,
                appendix_schema=appendix_schema,
                body_exit_criteria=body_exit_criteria,
                appendix_exit_criteria=appendix_exit_criteria,
            ).parse_content(content)
            preparse_lines = hwpx_result.source_lines
            main_source_lines = hwpx_result.main_source_lines
            appendix_source_lines = hwpx_result.appendix_source_lines
            heading_rows = hwpx_result.heading_rows
            appendix_heading_rows = hwpx_result.appendix_heading_rows
        except Exception:
            preparse_lines = None
    if preparse_lines is None:
        try:
            blocks = _extract_blocks_for_rag(filename, content)
        except HwpxParsingError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    doc_name = _guess_doc_name(blocks, filename)
    base_slug = _slugify_file_id(doc_name)
    file_id = _build_unique_file_id(base_slug)
    source_lines = preparse_lines if preparse_lines is not None else parser_iter_raw_block_lines(blocks)
    if main_source_lines is None or appendix_source_lines is None:
        main_source_lines, appendix_source_lines = parser_split_preparse_lines_by_domain(
            source_lines,
            main_schema=schema,
            appendix_schema=appendix_schema,
            body_exit_criteria=body_exit_criteria,
            appendix_exit_criteria=appendix_exit_criteria,
        )
    if heading_rows is None:
        heading_rows = parser_build_heading_rows(schema, raw_lines=main_source_lines)
    if appendix_heading_rows is None:
        appendix_heading_rows = (
            parser_build_heading_rows(
                appendix_schema,
                raw_lines=appendix_source_lines,
                allow_new_candidates=False,
            )
            if isinstance(appendix_schema, dict)
            else []
        )
    preview_blocks = parser_preview_preparse_lines(source_lines, limit=100) if preparse_lines is not None else _preview_blocks(blocks, limit=100)
    metadata_source: list[Any] = source_lines if preparse_lines is not None else blocks
    return {
        "file_name": filename,
        "format_type": FILE_FORMAT_LABELS.get(suffix, suffix.lstrip(".").upper()),
        "doc_name": doc_name,
        "file_id": file_id,
        "doc_cat": _infer_doc_cat(doc_name),
        "doc_version": _infer_version(metadata_source),
        "publication_date": _infer_publication_date(metadata_source),
        "doc_number": None,
        "doc_manager": _infer_doc_manager(metadata_source),
        "ref_heading_id": ref_heading_id,
        "ref_appendix_id": ref_appendix_id,
        "body_exit_criteria": body_exit_criteria,
        "appendix_exit_criteria": appendix_exit_criteria,
        "heading_schema": schema,
        "appendix_schema": appendix_schema,
        "schema_note": json.dumps({"added": [], "deleted": []}, ensure_ascii=False, indent=2),
        "heading_rows": heading_rows,
        "appendix_heading_rows": appendix_heading_rows,
        "preview_blocks": preview_blocks,
        "templates": list_rag_headings(),
    }


def register_rag_document(
    *,
    filename: str,
    content: bytes,
    file_id: str,
    file_name: str,
    format_type: str,
    doc_name: str,
    doc_cat: str,
    doc_version: float,
    publication_date: str | None,
    doc_number: str | None,
    doc_manager: str | None,
    ref_heading_id: str | None,
    ref_appendix_id: str | None,
    body_exit_criteria: dict[str, Any] | None,
    appendix_exit_criteria: dict[str, Any] | None,
    heading_schema: dict[str, Any],
    appendix_schema: dict[str, Any] | None,
    schema_note: str | None,
) -> dict[str, Any]:
    user_no = _get_current_user_no()
    if not file_id.strip():
        raise HTTPException(status_code=400, detail="file_id 는 비워둘 수 없습니다.")
    file_path = _upload_rag_source_file(file_name or filename, content)

    try:
        with transaction() as conn:
            rag_rdb.upsert_rag_file(
                file_id=file_id,
                file_name=file_name,
                file_path=file_path,
                format_type=format_type,
                doc_name=doc_name,
                doc_cat=doc_cat,
                doc_version=doc_version,
                publication_date=publication_date,
                doc_number=doc_number,
                doc_manager=doc_manager,
                embedding_yn="N",
                ref_heading_id=ref_heading_id,
                ref_appendix_id=ref_appendix_id,
                body_exit_criteria=body_exit_criteria,
                appendix_exit_criteria=appendix_exit_criteria,
                heading_schema=heading_schema,
                appendix_schema=appendix_schema,
                schema_note=schema_note,
                user_no=user_no,
                connection=conn,
            )
    except DBExecutionError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"RAG 등록 실패: {exc}") from exc

    return {
        "ok": True,
        "file_id": file_id,
    }
