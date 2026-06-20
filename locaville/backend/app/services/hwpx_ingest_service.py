"""HWPX 정책 문서 → RAG 청크 인덱싱 서비스.

HWPX (한컴오피스 워드 파일) 를 압축 풀어서 XML 단락을 추출하고, RAG 검색에 적합한
청크로 나누어 ``rag_sources/chunks/`` 에 JSONL 로 저장합니다. ``scripts/ingest_hwpx.py``
스크립트가 이 모듈을 호출하는 진입점.

생성 산출물:
  - ``raw_hwpx/{filename}.hwpx``: 원본 보존
  - ``parsed_text/{filename}.txt``: 단락 단위 일반 텍스트 (디버그용)
  - ``chunks/{filename}.jsonl``: RAG 임베딩 대상 (rag_service 가 읽음)

This is not yet a frontend-facing API; admin script only.
"""
from __future__ import annotations

import json
import html
import re
import shutil
import sys
import zipfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET


BACKEND_DIR = Path(__file__).resolve().parents[2]
WORKSPACE_DIR = Path(__file__).resolve().parents[4]
LIBRARY_DIR = WORKSPACE_DIR / "library"
RAG_SOURCES_DIR = BACKEND_DIR / "rag_sources"
RAW_HWPX_DIR = RAG_SOURCES_DIR / "raw_hwpx"
PARSED_TEXT_DIR = RAG_SOURCES_DIR / "parsed_text"
CHUNKS_DIR = RAG_SOURCES_DIR / "chunks"
MAX_HWPX_BYTES = 50 * 1024 * 1024


class HWPXIngestError(Exception):
    """HWPX 인덱싱 실패. 스크립트가 stderr 로 메시지 노출 후 종료."""


@dataclass
class ParsedBlock:
    title: str
    text: str
    section: str = ""


def ensure_rag_source_dirs() -> None:
    RAW_HWPX_DIR.mkdir(parents=True, exist_ok=True)
    PARSED_TEXT_DIR.mkdir(parents=True, exist_ok=True)
    CHUNKS_DIR.mkdir(parents=True, exist_ok=True)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _localname(tag: str) -> str:
    return tag.split("}", 1)[-1] if "}" in tag else tag


def _sort_section_key(path: str) -> int:
    match = re.search(r"section(\d+)\.xml$", path)
    return int(match.group(1)) if match else 999999


def _normalize_text(text: str) -> str:
    lines = [" ".join(line.split()) for line in (text or "").splitlines()]
    return "\n".join(line for line in lines if line.strip()).strip()


def _is_probable_heading(text: str) -> bool:
    text = (text or "").strip()
    if not text or len(text) > 120:
        return False
    patterns = [
        r"^[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]\s+.+",
        r"^[IVX]+\s+.+",
        r"^제\s*\d+\s*[장절관조]\b",
        r"^\d+\.\s+",
        r"^[가-힣]\.\s+",
        r"^[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]\s*",
        r"^[□■◇◆]\s*",
        r"^[○●]\s*",
    ]
    return any(re.match(pattern, text) for pattern in patterns)


def _extract_paragraph_text(node: ET.Element) -> str:
    parts: list[str] = []
    for child in node.iter():
        name = _localname(child.tag)
        if name == "t" and child.text:
            parts.append(child.text)
        elif name in {"lineBreak", "break"}:
            parts.append("\n")
        elif name == "tab":
            parts.append("\t")
        if child is not node and child.tail:
            parts.append(child.tail)
    return _normalize_text("".join(parts))


def _extract_paragraph_text_from_xml(xml_text: str) -> str:
    working = re.sub(r"<[^>]+:(lineBreak|break)\b[^>]*/?>", "\n", xml_text)
    working = re.sub(r"<[^>]+:tab\b[^>]*/?>", "\t", working)
    text_parts = re.findall(r"<[^>]+:t\b[^>]*>(.*?)</[^>]+:t>", working, flags=re.DOTALL)
    if text_parts:
        return _normalize_text(html.unescape("".join(text_parts)))

    stripped = re.sub(r"<[^>]+>", " ", working)
    return _normalize_text(html.unescape(stripped))


def _read_hwpx_paragraph_blocks(file_path: Path) -> list[ParsedBlock]:
    blocks: list[ParsedBlock] = []
    current_heading = ""

    with zipfile.ZipFile(file_path) as archive:
        section_files = sorted(
            [name for name in archive.namelist() if re.match(r"^Contents/section\d+\.xml$", name)],
            key=_sort_section_key,
        )
        if not section_files:
            raise HWPXIngestError("HWPX section XML을 찾지 못했습니다.")

        for section_name in section_files:
            xml_text = archive.read(section_name).decode("utf-8", errors="ignore")
            paragraph_blocks = re.findall(
                r"<[^>]+:p\b.*?</[^>]+:p>",
                xml_text,
                flags=re.DOTALL,
            )
            for paragraph_xml in paragraph_blocks:
                text = _extract_paragraph_text_from_xml(paragraph_xml)
                if not text:
                    continue
                if _is_probable_heading(text):
                    current_heading = text
                    continue
                blocks.append(
                    ParsedBlock(
                        title=current_heading,
                        text=text,
                        section=section_name,
                    )
                )
    return blocks


def _chunk_parsed_blocks(
    blocks: list[ParsedBlock],
    *,
    source_file: str,
    chunk_size: int = 800,
) -> list[dict[str, str]]:
    chunks: list[dict[str, str]] = []
    current_title = ""
    current_parts: list[str] = []
    current_sections: list[str] = []

    def flush() -> None:
        nonlocal current_title, current_parts, current_sections
        text = "\n".join(part for part in current_parts if part.strip()).strip()
        if not text:
            current_title = ""
            current_parts = []
            current_sections = []
            return
        chunk_id = f"{Path(source_file).stem}-{len(chunks) + 1:04d}"
        chunks.append(
            {
                "source_file": source_file,
                "chunk_id": chunk_id,
                "title": current_title,
                "section": current_sections[0] if current_sections else "",
                "text": text,
            }
        )
        current_title = ""
        current_parts = []
        current_sections = []

    for block in blocks:
        block_title = (block.title or "").strip()
        block_text = (block.text or "").strip()
        if not block_text:
            continue
        block_body = f"{block_title}\n{block_text}".strip() if block_title else block_text
        current_body = "\n".join(current_parts).strip()
        title_changed = bool(current_parts and block_title and block_title != current_title)
        exceeds_size = bool(current_body and len(current_body) + len(block_body) + 2 > chunk_size)
        if title_changed or exceeds_size:
            flush()
        if not current_parts:
            current_title = block_title
        current_parts.append(block_text)
        if block.section:
            current_sections.append(block.section)
    flush()
    return chunks


def _serialize_library_docs(parsed_docs: list[Any], source_file: str) -> list[ParsedBlock]:
    blocks: list[ParsedBlock] = []
    for doc in parsed_docs:
        text = _normalize_text(getattr(doc, "page_content", "") or "")
        metadata = getattr(doc, "metadata", {}) or {}
        if not text:
            continue
        blocks.append(
            ParsedBlock(
                title=str(metadata.get("heading_path") or metadata.get("table_caption") or ""),
                text=text,
                section=str(metadata.get("section") or ""),
            )
        )
    if not blocks:
        raise HWPXIngestError(f"{source_file}에서 파싱 가능한 텍스트를 찾지 못했습니다.")
    return blocks


def _load_library_hwpx_tools() -> tuple[Any | None, Any | None]:
    if str(LIBRARY_DIR) not in sys.path:
        sys.path.insert(0, str(LIBRARY_DIR))
    try:
        from locaville.rag.chunk_documents import merge_and_chunk_docs
        from locaville.rag.parse_hwpx_to_docs import parse_hwpx
    except Exception:
        return None, None
    return parse_hwpx, merge_and_chunk_docs


def _load_blocks_with_preferred_parser(file_path: Path) -> tuple[list[ParsedBlock], str]:
    parse_hwpx, _merge_and_chunk_docs = _load_library_hwpx_tools()
    if parse_hwpx is not None:
        try:
            parsed_docs = parse_hwpx(file_path)
            return _serialize_library_docs(parsed_docs, file_path.name), "library"
        except Exception:
            pass
    return _read_hwpx_paragraph_blocks(file_path), "fallback"


def _build_chunks_with_preferred_chunker(file_path: Path, blocks: list[ParsedBlock]) -> tuple[list[dict[str, str]], str]:
    parse_hwpx, merge_and_chunk_docs = _load_library_hwpx_tools()
    if parse_hwpx is not None and merge_and_chunk_docs is not None:
        try:
            parsed_docs = parse_hwpx(file_path)
            library_chunks = merge_and_chunk_docs(parsed_docs)
            serialized: list[dict[str, str]] = []
            for idx, chunk in enumerate(library_chunks, start=1):
                content = _normalize_text(getattr(chunk, "page_content", "") or "")
                metadata = getattr(chunk, "metadata", {}) or {}
                if not content:
                    continue
                serialized.append(
                    {
                        "source_file": file_path.name,
                        "chunk_id": f"{file_path.stem}-{idx:04d}",
                        "title": str(metadata.get("heading_path") or metadata.get("table_caption") or ""),
                        "section": str(metadata.get("section") or ""),
                        "text": content,
                    }
                )
            if serialized:
                return serialized, "library"
        except Exception:
            pass
    return _chunk_parsed_blocks(blocks, source_file=file_path.name), "fallback"


def ingest_hwpx_file(input_path: str | Path) -> dict[str, Any]:
    """HWPX 한 파일을 인덱싱해서 raw + parsed_text + chunks 세 산출물을 만듭니다.

    파일 크기 > 50MB 또는 비-HWPX 확장자면 ``HWPXIngestError``.
    """
    ensure_rag_source_dirs()
    source_path = Path(input_path).expanduser().resolve()
    if not source_path.exists():
        raise HWPXIngestError(f"HWPX 파일을 찾지 못했습니다: {source_path}")
    if source_path.suffix.lower() != ".hwpx":
        raise HWPXIngestError("입력 파일은 .hwpx 형식이어야 합니다.")
    if source_path.stat().st_size > MAX_HWPX_BYTES:
        raise HWPXIngestError("HWPX 파일이 너무 큽니다. 50MB 이하 파일만 ingest할 수 있습니다.")

    managed_raw_path = RAW_HWPX_DIR / source_path.name
    if source_path != managed_raw_path:
        shutil.copy2(source_path, managed_raw_path)

    try:
        blocks, parser_name = _load_blocks_with_preferred_parser(managed_raw_path)
        chunks, chunker_name = _build_chunks_with_preferred_chunker(managed_raw_path, blocks)
    except zipfile.BadZipFile as exc:
        raise HWPXIngestError("유효한 HWPX zip 구조가 아닙니다.") from exc

    if not chunks:
        raise HWPXIngestError("생성된 chunk가 없습니다. 문서 형식을 확인해 주세요.")

    parsed_text_path = PARSED_TEXT_DIR / f"{managed_raw_path.stem}.txt"
    chunk_path = CHUNKS_DIR / f"{managed_raw_path.stem}.json"

    parsed_text = "\n\n".join(
        (
            f"[{block.title}]\n{block.text}".strip()
            if block.title
            else block.text
        )
        for block in blocks
        if block.text.strip()
    ).strip()
    parsed_text_path.write_text(parsed_text, encoding="utf-8")

    payload = {
        "source_file": managed_raw_path.name,
        "source_path": managed_raw_path.as_posix(),
        "parsed_at": _utc_now_iso(),
        "parser": parser_name,
        "chunker": chunker_name,
        "chunk_count": len(chunks),
        "chunks": chunks,
    }
    chunk_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    return {
        "source_file": managed_raw_path.name,
        "managed_raw_path": managed_raw_path.as_posix(),
        "parsed_text_path": parsed_text_path.as_posix(),
        "chunk_path": chunk_path.as_posix(),
        "parser": parser_name,
        "chunker": chunker_name,
        "chunk_count": len(chunks),
    }
