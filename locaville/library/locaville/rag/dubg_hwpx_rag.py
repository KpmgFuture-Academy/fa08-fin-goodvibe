"""
HWPX RAG Debug Utilities

이 파일은 운영 파이프라인이 아니라 테스트/디버깅 전용 유틸리티 모음이다.
parse_hwpx(), merge_and_chunk_docs(), vectorstore 검색 결과가 의도대로 동작하는지 확인할 때 사용한다.

전제:
- parse_hwpx(file_path)
- merge_and_chunk_docs(docs, ...)
- search_hwpx(query, vectorstore, ...)
같은 운영 함수들이 별도 모듈에 정의되어 있어야 한다.
"""

# --------------------------
# 기본 출력 유틸
# --------------------------
def preview_text(text, max_chars=500):
    """입력: 문자열, 최대 길이 / 출력: 미리보기 문자열 / 기능: 긴 텍스트를 로그용으로 잘라 표시."""
    text = text or ""
    return text[:max_chars]


def print_doc(doc, index=None, max_chars=1000):
    """입력: Document, index, 최대 출력 길이 / 출력: 콘솔 출력 / 기능: Document의 핵심 metadata와 본문을 확인."""
    prefix = f"[{index}]" if index is not None else "[doc]"

    print(f"\n{prefix}")
    print("type:", doc.metadata.get("type"))
    print("position:", doc.metadata.get("position"))
    print("section:", doc.metadata.get("section"))
    print("block_index:", doc.metadata.get("block_index"))
    print("heading:", doc.metadata.get("heading_path"))
    print("caption:", doc.metadata.get("table_caption"))
    print("length:", len(doc.page_content or ""))
    print("----- content -----")
    print(preview_text(doc.page_content, max_chars))
    print("-------------------")


# --------------------------
# parse 결과 확인
# --------------------------
def debug_parsed_docs(docs, keywords=None, max_chars=1000):
    """입력: parse_hwpx 결과 docs, 키워드 목록 / 출력: 콘솔 출력 / 기능: 파싱된 원본 Document 중 특정 키워드 포함 문서 확인."""
    if keywords is None:
        keywords = []

    for i, doc in enumerate(docs):
        text = doc.page_content or ""

        if not keywords or any(keyword in text for keyword in keywords):
            print_doc(doc, index=i, max_chars=max_chars)


def debug_heading_docs(docs, keyword, max_chars=800):
    """입력: docs, heading/text 검색어 / 출력: 콘솔 출력 / 기능: 특정 heading이 metadata나 본문에 반영되었는지 확인."""
    for i, doc in enumerate(docs):
        heading = doc.metadata.get("heading_path", "")
        text = doc.page_content or ""

        if keyword in heading or keyword in text:
            print_doc(doc, index=i, max_chars=max_chars)


def debug_table_docs(docs, keywords=None, max_chars=1500):
    """입력: docs, 키워드 목록 / 출력: 콘솔 출력 / 기능: table/table_row 문서가 제대로 생성되었는지 확인."""
    if keywords is None:
        keywords = []

    for i, doc in enumerate(docs):
        if doc.metadata.get("type") not in ("table", "table_row"):
            continue

        text = doc.page_content or ""

        if not keywords or any(keyword in text for keyword in keywords):
            print_doc(doc, index=i, max_chars=max_chars)


def debug_caption_docs(docs, caption, max_chars=1500):
    """입력: docs, caption 문자열 / 출력: 콘솔 출력 / 기능: 특정 표 caption이 표 본문과 연결되었는지 확인."""
    for i, doc in enumerate(docs):
        text = doc.page_content or ""

        if doc.metadata.get("table_caption") == caption or caption in text:
            print_doc(doc, index=i, max_chars=max_chars)


# --------------------------
# 파이프라인 단계별 유실 확인
# --------------------------
def debug_pipeline_counts(file_path, parse_hwpx, merge_and_chunk_docs, caption=None):
    """입력: file_path, parse/chunk 함수, 선택 caption / 출력: docs/chunks와 단계별 로그 / 기능: 파싱→청킹 과정에서 특정 표/문서 유실 여부 확인."""
    docs = parse_hwpx(file_path)
    print("\nparse docs:", len(docs))

    if caption:
        print(f"\n[parse caption check] {caption}")
        debug_caption_docs(docs, caption)

    chunks = merge_and_chunk_docs(docs)
    print("\nchunks:", len(chunks))

    if caption:
        print(f"\n[chunk caption check] {caption}")
        debug_caption_docs(chunks, caption)

    return docs, chunks


def count_duplicate_documents(docs):
    """입력: Document list / 출력: 중복 개수 / 기능: content/type/position/chunk_index 기준 완전 중복 수 확인."""
    seen = set()
    duplicated = 0

    for doc in docs:
        key = (
            (doc.page_content or "").strip(),
            doc.metadata.get("type"),
            doc.metadata.get("position"),
            doc.metadata.get("chunk_index"),
        )

        if key in seen:
            duplicated += 1
        else:
            seen.add(key)

    return duplicated

def debug_merge_blockers(docs, limit=200):
    prev = None

    for i, doc in enumerate(docs[:limit]):
        if prev is None:
            prev = doc
            continue

        prev_type = prev.metadata.get("type")
        cur_type = doc.metadata.get("type")

        same_section = prev.metadata.get("section") == doc.metadata.get("section")
        same_type = prev_type == cur_type
        same_heading = prev.metadata.get("heading_path") == doc.metadata.get("heading_path")
        child_heading = is_same_or_child_heading(
            prev.metadata.get("heading_path"),
            doc.metadata.get("heading_path"),
        )

        print(
            f"{i:03d}",
            "prev_type:", prev_type,
            "cur_type:", cur_type,
            "same_section:", same_section,
            "same_type:", same_type,
            "same_heading:", same_heading,
            "same_or_child:", child_heading,
            "prev_len:", len(prev.page_content or ""),
            "cur_len:", len(doc.page_content or ""),
        )

        prev = doc

def debug_duplicate_documents(docs, max_print=20):
    """입력: Document list / 출력: 콘솔 출력 / 기능: 중복 Document의 key와 일부 본문을 확인."""
    seen = {}
    printed = 0

    for i, doc in enumerate(docs):
        key = (
            (doc.page_content or "").strip(),
            doc.metadata.get("type"),
            doc.metadata.get("position"),
            doc.metadata.get("chunk_index"),
        )

        if key in seen:
            print("\n[DUPLICATE]")
            print("first_index:", seen[key])
            print("duplicate_index:", i)
            print("type:", doc.metadata.get("type"))
            print("position:", doc.metadata.get("position"))
            print("chunk_index:", doc.metadata.get("chunk_index"))
            print(preview_text(doc.page_content, 500))

            printed += 1

            if printed >= max_print:
                break
        else:
            seen[key] = i


# --------------------------
# 검색 결과 확인
# --------------------------
def debug_search_results(vectorstore, query, k=10, max_chars=1500):
    """입력: vectorstore, query, k / 출력: 검색 결과와 score / 기능: LLM 전달 전 검색 근거 품질 확인."""
    results = vectorstore.similarity_search_with_score(query, k=k)

    print("===== RAG SEARCH DEBUG =====")

    for i, (doc, score) in enumerate(results, start=1):
        print(f"\n[근거 {i}]")
        print("score:", score)
        print("type:", doc.metadata.get("type"))
        print("position:", doc.metadata.get("position"))
        print("section:", doc.metadata.get("section"))
        print("block_index:", doc.metadata.get("block_index"))
        print("heading:", doc.metadata.get("heading_path"))
        print("caption:", doc.metadata.get("table_caption"))
        print("content_length:", len(doc.page_content or ""))
        print("repr:", repr(preview_text(doc.page_content, max_chars)))
        print("----- content -----")
        print(preview_text(doc.page_content, max_chars))
        print("-------------------")

    return results


def debug_search_with_search_hwpx(search_hwpx, vectorstore, query, k=10, fetch_k=40, max_chars=1500):
    """입력: search_hwpx 함수, vectorstore, query / 출력: 필터 적용 검색 결과 / 기능: 운영 검색 함수 결과를 직접 확인."""
    results = search_hwpx(
        query=query,
        vectorstore=vectorstore,
        k=k,
        fetch_k=fetch_k,
    )

    print("===== SEARCH_HWPX DEBUG =====")

    for i, (doc, score) in enumerate(results, start=1):
        print(f"\n[근거 {i}]")
        print("score:", score)
        print("type:", doc.metadata.get("type"))
        print("position:", doc.metadata.get("position"))
        print("heading:", doc.metadata.get("heading_path"))
        print("caption:", doc.metadata.get("table_caption"))
        print("content_length:", len(doc.page_content or ""))
        print("----- content -----")
        print(preview_text(doc.page_content, max_chars))
        print("-------------------")

    return results


# --------------------------
# 편의용 시나리오
# --------------------------
def debug_middle_drainage_pipeline(file_path, parse_hwpx, merge_and_chunk_docs):
    """입력: file_path, parse/chunk 함수 / 출력: 관련 docs/chunks 출력 / 기능: 중간 물떼기 표와 규칙 추출에 필요한 근거가 잘 남았는지 확인."""
    keywords = [
        "중간 물떼기",
        "모내기",
        "용수공급",
        "배수물꼬",
        "2주 이상",
        "30일 이내",
        "증빙사진",
    ]

    docs = parse_hwpx(file_path)
    chunks = merge_and_chunk_docs(docs)

    print("\n===== PARSED DOCS: 중간 물떼기 =====")
    debug_parsed_docs(docs, keywords=keywords, max_chars=1500)

    print("\n===== CHUNKS: 중간 물떼기 =====")
    debug_parsed_docs(chunks, keywords=keywords, max_chars=1500)

    print("\nparsed docs:", len(docs))
    print("chunks:", len(chunks))
    print("duplicate chunks:", count_duplicate_documents(chunks))

    return docs, chunks


""" 사용 예시

from debug_hwpx_rag import debug_search_results, debug_middle_drainage_pipeline

docs, chunks = debug_middle_drainage_pipeline(
    file_path=file_path,
    parse_hwpx=parse_hwpx,
    merge_and_chunk_docs=merge_and_chunk_docs,
)

results = debug_search_results(
    vectorstore=vectorstore,
    query="중간 물떼기 모내기 이후 약 한달 후 2주 이상 30일 이내",
    k=10,
)

"""