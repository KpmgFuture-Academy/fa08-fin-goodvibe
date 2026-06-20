# docs
# → 같은 문맥의 짧은 문서 병합
# → chunk 생성
# → 저품질 chunk 제거
# → 중복 제거

import re
from copy import deepcopy

from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter


# --------------------------
# merge / chunk helpers
# --------------------------
def strip_context_prefix(text):
    """입력: 문자열 / 출력: prefix 제거 문자열 / 기능: '[문맥] ...' prefix가 있으면 본문만 반환."""
    text = (text or "").strip()

    if text.startswith("[context]") or text.startswith("[문맥]"):
        parts = text.split("\n\n", 1)

        if len(parts) == 2:
            return parts[1].strip()

    return text


def build_context_prefix(metadata):
    """입력: Document metadata / 출력: context prefix 문자열 / 기능: heading_path와 table_caption을 chunk 앞에 붙일 prefix로 생성."""
    parts = []

    heading_path = metadata.get("heading_path")
    table_caption = metadata.get("table_caption")

    if heading_path:
        parts.append(f"[context] {heading_path}")

    if table_caption:
        parts.append(table_caption)

    return "\n".join(parts).strip()


def attach_context_prefix(doc):
    prefix = build_context_prefix(doc.metadata or {})
    content = strip_context_prefix(doc.page_content or "")

    if not prefix:
        return doc

    return Document(
        page_content=f"{prefix}\n\n{content}" if content else prefix,
        metadata=deepcopy(doc.metadata),
    )


def is_same_or_child_heading(prev_heading, current_heading):
    """입력: 이전 heading, 현재 heading / 출력: bool / 기능: 같은 heading이거나 현재 heading이 이전 heading의 하위인지 확인."""
    prev_heading = prev_heading or ""
    current_heading = current_heading or ""

    if prev_heading == current_heading:
        return True

    if prev_heading and current_heading.startswith(prev_heading + " > "):
        return True

    return False

def top_heading(heading_path):
    """입력: heading_path / 출력: 최상위 heading / 기능: 큰 장 단위 병합 기준 추출."""
    return (heading_path or "").split(" > ", 1)[0]


def merge_documents_by_context(docs, max_merged_chars=780):
    """입력: Document list, 최대 병합 길이 / 출력: 병합된 Document list / 기능: 같은 문맥의 paragraph/box_text를 일정 길이까지 병합."""
    merged = []
    # non_merge_types = {"table", "table_row"}
    non_merge_types = {"table",}

    for doc in docs:
        content = (doc.page_content or "").strip()

        if not content:
            continue

        current = Document(
            page_content=content,
            metadata=deepcopy(doc.metadata),
        )

        if current.metadata.get("type") in non_merge_types:
            merged.append(current)
            continue

        if not merged:
            merged.append(current)
            continue

        prev = merged[-1]

        if prev.metadata.get("type") in non_merge_types:
            merged.append(current)
            continue

        prev_content = (prev.page_content or "").strip()
        append_content = strip_context_prefix(content)

        # same_context = (
        #     prev.metadata.get("section") == current.metadata.get("section")
        #     and prev.metadata.get("heading_path") == current.metadata.get("heading_path")
        #     and prev.metadata.get("type") == current.metadata.get("type")
        # )

        same_context = (
            prev.metadata.get("section") == current.metadata.get("section")
            and prev.metadata.get("type") == current.metadata.get("type")
            and current.metadata.get("type") in ("paragraph", "box_text", "table_row")
            and is_same_or_child_heading(
                prev.metadata.get("heading_path"),
                current.metadata.get("heading_path"),
            )
        )

        # same_context = (
        #     prev.metadata.get("section") == current.metadata.get("section")
        #     and prev.metadata.get("type") == current.metadata.get("type")
        #     and current.metadata.get("type") in ("paragraph", "box_text")
        #     and top_heading(prev.metadata.get("heading_path")) == top_heading(current.metadata.get("heading_path"))
        # )

        can_merge = (
            same_context
            and len(prev_content) + len(append_content) + 1 <= max_merged_chars
        )

        if can_merge:
            prev.page_content = prev_content + "\n" + append_content
            prev.metadata["merged_count"] = prev.metadata.get("merged_count", 1) + 1
            prev.metadata["merged_block_start"] = prev.metadata.get(
                "merged_block_start",
                prev.metadata.get("block_index"),
            )
            prev.metadata["merged_block_end"] = current.metadata.get("block_index")
        else:
            merged.append(current)

    return merged


# def split_markdown_table_by_rows(
#     doc,
#     max_rows_per_chunk=5,
#     max_chars_per_chunk=1600,
# ):
#     lines = [line.strip() for line in doc.page_content.splitlines() if line.strip()]

#     if len(lines) <= 2:
#         return [doc]

#     header = lines[0]
#     separator = lines[1]
#     rows = lines[2:]

#     chunks = []
#     current_rows = []

#     def make_content(row_block):
#         return "\n".join([header, separator] + row_block)

#     for row in rows:
#         candidate_rows = current_rows + [row]
#         candidate_content = make_content(candidate_rows)

#         if (
#             current_rows
#             and (
#                 len(candidate_rows) > max_rows_per_chunk
#                 or len(candidate_content) > max_chars_per_chunk
#             )
#         ):
#             chunks.append(
#                 Document(
#                     page_content=make_content(current_rows),
#                     metadata={
#                         **deepcopy(doc.metadata),
#                         "type": "table",
#                         "table_chunk_index": len(chunks) + 1,
#                     },
#                 )
#             )
#             current_rows = [row]
#         else:
#             current_rows = candidate_rows

#     if current_rows:
#         chunks.append(
#             Document(
#                 page_content=make_content(current_rows),
#                 metadata={
#                     **deepcopy(doc.metadata),
#                     "type": "table",
#                     "table_chunk_index": len(chunks) + 1,
#                 },
#             )
#         )

#     total = len(chunks)

#     for chunk in chunks:
#         chunk.metadata["table_chunk_count"] = total

#     return chunks

def is_markdown_separator_line(line):
    s = (line or "").strip()
    if not (s.startswith("|") and s.endswith("|")):
        return False

    parts = [p.strip() for p in s.strip("|").split("|")]
    if not parts:
        return False

    # 각 컬럼이 --- 또는 :---: 류인지 확인
    for p in parts:
        if not p:
            return False
        core = p.replace(":", "").replace("-", "")
        if core != "":
            return False
        if "-" not in p:
            return False
    return True


def split_markdown_table_by_rows(doc, max_rows_per_chunk=4, max_chars_per_chunk=1600):
    """
    표를 행 단위로 안정적으로 분할.
    - 헤더/구분선이 있으면 유지
    - 헤더/구분선이 없으면 컬럼1..N 헤더를 생성
    - 각 chunk마다 헤더+구분선을 반복
    - 행 수 + 글자수 기준 동시 적용
    """
    raw_lines = [line.strip() for line in (doc.page_content or "").splitlines() if line.strip()]
    if not raw_lines:
        return [doc]

    header = None
    separator = None
    rows = []

    # 1) 정상 markdown table (header + separator) 탐지
    if len(raw_lines) >= 2 and raw_lines[0].startswith("|") and is_markdown_separator_line(raw_lines[1]):
        header = raw_lines[0]
        separator = raw_lines[1]
        rows = [ln for ln in raw_lines[2:] if ln.startswith("|") and ln.endswith("|")]
    else:
        # 2) 비정상/헤더 없는 경우: table row만 추출 후 가짜 헤더 생성
        rows = [ln for ln in raw_lines if ln.startswith("|") and ln.endswith("|")]
        if not rows:
            return [doc]

        first_parts = [p.strip() for p in rows[0].strip("|").split("|")]
        col_count = len(first_parts) if first_parts else 1
        header = "| " + " | ".join([f"컬럼{i+1}" for i in range(col_count)]) + " |"
        separator = "| " + " | ".join(["---"] * col_count) + " |"

    if not rows:
        return [doc]

    def make_table_text(row_block):
        return "\n".join([header, separator] + row_block)

    chunks = []
    current_rows = []

    for row in rows:
        candidate = current_rows + [row]
        candidate_text = make_table_text(candidate)

        if current_rows and (len(candidate) > max_rows_per_chunk or len(candidate_text) > max_chars_per_chunk):
            chunks.append(
                Document(
                    page_content=make_table_text(current_rows),
                    metadata={
                        **deepcopy(doc.metadata),
                        "type": "table",
                        "table_header": header,
                        "table_separator": separator,
                        "table_chunk_index": len(chunks) + 1,
                    },
                )
            )
            current_rows = [row]
        else:
            current_rows = candidate

    if current_rows:
        chunks.append(
            Document(
                page_content=make_table_text(current_rows),
                metadata={
                    **deepcopy(doc.metadata),
                    "type": "table",
                    "table_header": header,
                    "table_separator": separator,
                    "table_chunk_index": len(chunks) + 1,
                },
            )
        )

    total = len(chunks)
    for c in chunks:
        c.metadata["table_chunk_count"] = total

    return chunks



# def chunk_documents(docs, chunk_size=800, chunk_overlap=120, table_chunk_size=1600, table_chunk_overlap=180):
def chunk_documents(docs, chunk_size=800, chunk_overlap=120):
    """입력: Document list, chunk 크기 옵션 / 출력: chunk Document list / 기능: metadata context를 각 chunk 앞에 붙이고 본문을 분할."""

    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=["\n\n", "\n", ". ", " ", ""],
    )

    chunked_docs = []

    for doc in docs:
        doc_type = doc.metadata.get("type")

        if doc_type == "table":
            chunked_docs.extend(
                attach_context_prefix(chunk)
                for chunk in split_markdown_table_by_rows(doc, max_rows_per_chunk=5)
            )
            continue

        if doc_type in ("box_text", "table_row"):
            chunked_docs.append(attach_context_prefix(doc))
            continue

        split_docs = text_splitter.split_documents([doc])

        for chunk_idx, chunk in enumerate(split_docs, start=1):
            chunk.metadata = {
                **deepcopy(doc.metadata),
                "chunk_index": chunk_idx,
                "chunk_count": len(split_docs),
            }
            chunked_docs.append(attach_context_prefix(chunk))

    return chunked_docs



def is_reference_only_text(text):
    """입력: 문자열 / 출력: bool / 기능: '[참고6] 참조'처럼 근거 가치가 낮은 참조 전용 문장 판정."""
    text = (text or "").strip()

    if not text:
        return False

    patterns = [
        r"^※\s*.+참조\.?$",
        r"^※\s*.+참고\s*\d+.+참조\.?$",
        r"^※\s*.+\[참고\s*\d+\].*참조\.?$",
        r"^\*?\s*자세한 사항은 .+ 참조\.?$",
        r"^.+\[참고\s*\d+\]\s*참조\.?$",
        r"^.+\[참고\s*\d+\].*$",
        r"^.+붙임\s*\d+.+참조\.?$",
    ]

    return any(re.match(pattern, text) for pattern in patterns)


def is_low_value_document(doc):
    """입력: Document / 출력: bool / 기능: 너무 짧거나 참조-only인 chunk 제거 대상 판정."""
    text = (doc.page_content or "").strip()

    if not text:
        return True

    doc_type = doc.metadata.get("type")
    body = strip_context_prefix(text)

    if doc_type in ("table", "table_row"):
        return False

    if len(body) < 30:
        return True

    if is_reference_only_text(body):
        return True

    return False


def filter_and_dedupe_docs(docs):
    """입력: Document list / 출력: 필터링 및 중복 제거된 Document list / 기능: 저품질 chunk 제거 후 동일 chunk 중복 제거."""
    seen = set()
    result = []

    for doc in docs:
        if is_low_value_document(doc):
            continue

        key = (
            (doc.page_content or "").strip(),
            doc.metadata.get("type"),
            doc.metadata.get("position"),
            doc.metadata.get("chunk_index"),
        )

        if key in seen:
            continue

        seen.add(key)
        result.append(doc)

    return result


# --------------------------
# main merge + chunk function
# --------------------------
def merge_and_chunk_docs(
    docs,
    max_merged_chars=780,
    chunk_size=800,
    chunk_overlap=120,
):
    """입력: parse_hwpx 결과 Document list / 출력: 최종 chunk list / 기능: 병합, 청킹, 저품질 제거, 중복 제거를 한 번에 수행."""
    merged_docs = merge_documents_by_context(
        docs,
        max_merged_chars=max_merged_chars,
    )

    print("\n수행 함수 : merge_documents_by_context()")
    print(f"합병 후 Document 수: {len(merged_docs)}")
    
    chunks = chunk_documents(
        merged_docs,
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
    )

    print("\n수행 함수 : chunk_documents()")
    print(f"생성된 Chunk 수: {len(chunks)}")

    chunks = filter_and_dedupe_docs(chunks)

    print("\n수행 함수 : filter_and_dedupe_docs()")
    print(f"최종 Chunk 수: {len(chunks)}")

    return chunks
