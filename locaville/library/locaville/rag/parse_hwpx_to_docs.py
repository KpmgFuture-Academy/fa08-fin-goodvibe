import re
import zipfile
from copy import deepcopy

import lxml.etree as ET
from langchain_core.documents import Document

# --------------------------
# XML / text helpers
# --------------------------
def localname(node):
    """입력: XML node / 출력: namespace 제거된 tag명 / 기능: HWPX namespace와 무관하게 태그 비교."""
    return ET.QName(node).localname


def get_attr(node, name, default=None):
    """입력: XML node, 속성명 / 출력: 속성값 / 기능: namespace가 붙은 속성도 local name 기준으로 조회."""
    for key, value in node.attrib.items():
        if key.split("}")[-1] == name:
            return value
    return default


def get_int_attr(node, name, default=1):
    """입력: XML node, 속성명 / 출력: int 속성값 / 기능: colSpan, rowSpan 같은 숫자 속성 안전 조회."""
    try:
        return int(get_attr(node, name))
    except (TypeError, ValueError):
        return default


def normalize_text(text):
    """입력: 문자열 / 출력: 정규화 문자열 / 기능: 줄별 과다 공백 제거, 빈 줄 제거."""
    lines = [" ".join(line.split()) for line in (text or "").splitlines()]
    return "\n".join(line for line in lines if line.strip()).strip()


def get_section_files(zip_file):
    """입력: ZipFile / 출력: 정렬된 section xml 목록 / 기능: Contents/sectionN.xml을 번호순 정렬."""
    def sort_key(path):
        match = re.search(r"section(\d+)\.xml$", path)
        return int(match.group(1)) if match else 999999

    return sorted(
        [
            name for name in zip_file.namelist()
            if re.match(r"^Contents/section\d+\.xml$", name)
        ],
        key=sort_key,
    )


def is_inside_table(node):
    """입력: XML node / 출력: bool / 기능: 현재 node가 table 내부에 있는지 확인."""
    return any(localname(parent) in ("tbl", "table") for parent in node.iterancestors())


# --------------------------
# font helpers
# --------------------------
def font_height_to_pt(height):
    """입력: HWPX height 값 / 출력: pt(float) / 기능: 1800 같은 HWPX 글자 크기를 18pt로 변환."""
    try:
        height = int(height)
    except (TypeError, ValueError):
        return None

    return height / 100 if height > 100 else float(height)


def extract_charpr_font_sizes(zip_file):
    """입력: ZipFile / 출력: {charPr id: pt} / 기능: header.xml에서 글자 스타일별 크기 추출."""
    charpr_sizes = {}
    parser = ET.XMLParser(resolve_entities=False, no_network=True, recover=True, huge_tree=True)

    for header_file in [name for name in zip_file.namelist() if name.lower().endswith("header.xml")]:
        tree = ET.fromstring(zip_file.read(header_file), parser=parser)

        for node in tree.iter():
            if localname(node) != "charPr":
                continue

            charpr_id = get_attr(node, "id")
            size_pt = font_height_to_pt(get_attr(node, "height"))

            if charpr_id is not None and size_pt is not None:
                charpr_sizes[str(charpr_id)] = size_pt

    return charpr_sizes


def table_has_font_size_at_least(table_elem, charpr_sizes, min_pt=18):
    """입력: table XML node, 글자크기 map, 최소 pt / 출력: bool / 기능: 표 내부 최대 글자 크기 기준 제목성 표 판정."""
    max_size = None

    for node in table_elem.iter():
        charpr_ref = get_attr(node, "charPrIDRef")
        direct_height = get_attr(node, "height")

        if charpr_ref is not None and str(charpr_ref) in charpr_sizes:
            size = charpr_sizes[str(charpr_ref)]
            max_size = size if max_size is None else max(max_size, size)

        if direct_height is not None:
            size = font_height_to_pt(direct_height)
            if size is not None:
                max_size = size if max_size is None else max(max_size, size)

    return max_size is not None and max_size >= min_pt


# --------------------------
# heading helpers
# --------------------------
def is_date_like_text(text):
    """입력: 문자열 / 출력: bool / 기능: '2026. 1.' 같은 문서 날짜 감지."""
    return bool(re.match(r"^\d{4}\.\s*\d{1,2}\.?$", (text or "").strip()))


def is_section_banner_text(text):
    """입력: 문자열 / 출력: bool / 기능: 'Ⅰ 사업 개요' 같은 로마자 장 제목 감지."""
    text = (text or "").strip()
    return bool(re.match(r"^[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]\s+.+", text) or re.match(r"^[IVX]+\s+.+", text))


def is_probable_heading(text):
    """입력: 문자열 / 출력: bool / 기능: 문단이 제목인지 패턴 기반 판정."""
    text = (text or "").strip()

    if not text or is_date_like_text(text) or len(text) > 100:
        return False

    if is_section_banner_text(text):
        return True

    patterns = [
        r"^제\s*\d+\s*[장절관조]\b",
        r"^\d+\.\s+",
        r"^[가-힣]\.\s+",
        r"^[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]\s*",
        r"^[□■◇◆]\s*",
        r"^[○●]\s*",
    ]

    return any(re.match(pattern, text) for pattern in patterns)


def heading_level(text):
    """입력: 제목 문자열 / 출력: heading level(int) / 기능: heading stack 갱신용 제목 위계 산정."""
    text = (text or "").strip()

    if is_section_banner_text(text):
        return 1
    if re.match(r"^제\s*\d+\s*장\b", text):
        return 1
    if re.match(r"^제\s*\d+\s*[절관]\b", text):
        return 2
    if re.match(r"^\d+\.\s+", text):
        return 3
    if re.match(r"^[□■◇◆]\s*", text):
        return 4
    if re.match(r"^[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]\s*", text):
        return 5
    if re.match(r"^[가-힣]\.\s+", text):
        return 6
    if re.match(r"^[○●]\s*", text):
        return 6

    return 9

def update_heading_stack(heading_stack, heading_text):
    """입력: 기존 heading_stack, 새 제목 / 출력: 갱신된 stack / 기능: 같은/하위 제목 제거 후 새 제목 추가."""
    level = heading_level(heading_text)
    next_stack = [item for item in heading_stack if item["level"] < level]
    next_stack.append({"level": level, "text": heading_text.strip()})
    return next_stack


def get_heading_path(heading_stack):
    """입력: heading_stack / 출력: '상위 > 하위' 문자열 / 기능: 현재 문맥 경로 생성."""
    return " > ".join(item["text"] for item in heading_stack)


def append_label_to_current_heading(heading_stack, label):
    """입력: heading_stack, 라벨 / 출력: 갱신된 stack / 기능: '① 검증 (지자체, 한국농어촌공사)' 형태로 라벨 병합."""
    if not heading_stack or not label:
        return heading_stack

    current = heading_stack[-1]["text"]

    if current.endswith(")") and "(" in current:
        prefix, suffix = current.rsplit("(", 1)
        labels = [item.strip() for item in suffix.rstrip(")").split(",") if item.strip()]

        if label not in labels:
            labels.append(label)

        heading_stack[-1]["text"] = f"{prefix.strip()} ({', '.join(labels)})"
    else:
        heading_stack[-1]["text"] = f"{current} ({label})"

    return heading_stack


# --------------------------
# paragraph extraction
# --------------------------
def extract_text_from_para(p):
    """입력: paragraph XML node / 출력: 문단 텍스트 / 기능: 일반 문단 텍스트 추출, 표 내부 텍스트 제외."""
    parts = []

    for node in p.iter():
        if node is not p and is_inside_table(node):
            continue

        tag = localname(node)

        if tag == "t" and node.text:
            parts.append(node.text)
        elif tag == "lineBreak":
            parts.append("\n")
        elif tag == "tab":
            parts.append("\t")

        if node.tail:
            parts.append(node.tail)

    return normalize_text("".join(parts))


def extract_text_from_para_in_cell(p):
    """입력: table cell 내부 paragraph / 출력: 문단 텍스트 / 기능: 셀 내부 문단 단위 보존."""
    parts = []

    for node in p.iter():
        tag = localname(node)

        if tag == "t" and node.text:
            parts.append(node.text)
        elif tag == "lineBreak":
            parts.append("\n")
        elif tag == "tab":
            parts.append("\t")

        if node.tail:
            parts.append(node.tail)

    return normalize_text("".join(parts))


# --------------------------
# table extraction / formatting
# --------------------------
def extract_text_from_cell(tc):
    """입력: table cell XML node / 출력: 셀 텍스트 / 기능: 셀 내부 여러 문단을 줄바꿈으로 보존."""
    para_texts = []

    for node in tc.iter():
        if localname(node) != "p":
            continue

        text = extract_text_from_para_in_cell(node)

        if text:
            para_texts.append(text)

    if para_texts:
        return "\n".join(para_texts)

    parts = []

    for node in tc.iter():
        tag = localname(node)

        if tag == "t" and node.text:
            parts.append(node.text)
        elif tag in ("lineBreak", "tab"):
            parts.append(" ")

        if node.tail:
            parts.append(node.tail)

    return normalize_text("".join(parts))


def normalize_table_width(table):
    """입력: 2차원 table list / 출력: 열 수가 맞춰진 table / 기능: Markdown 변환 및 row 문서 생성 안정화."""
    if not table:
        return table

    max_cols = max(len(row) for row in table)
    return [row + [""] * (max_cols - len(row)) for row in table]

def is_probable_header_row(row):
    """첫 행이 진짜 헤더인지 판정."""
    cells = [normalize_text(c) for c in row]
    non_empty = [c for c in cells if c]

    if len(non_empty) < 2:
        return False

    # 너무 긴 설명문/불릿 위주면 헤더 아님
    long_cell_count = sum(1 for c in non_empty if len(c) >= 40)
    bullet_like_count = sum(1 for c in non_empty if c.startswith(("○", "◦", "-", "*", "※")))
    if long_cell_count >= max(1, len(non_empty) // 2):
        return False
    if bullet_like_count >= max(1, len(non_empty) // 2):
        return False

    return True

def table_cell_to_markdown_text(cell):
    """입력: 셀 텍스트 / 출력: Markdown table 셀 텍스트 / 기능: 셀 내부 줄바꿈과 파이프 문자를 안전하게 변환."""
    text = normalize_text(cell)

    if not text:
        return ""

    return text.replace("|", "\\|").replace("\n", "<br>")


def table_to_markdown(table):
    """입력: 2차원 table list / 출력: Markdown table 문자열 / 기능: 실제 데이터 표를 RAG 친화 형식으로 변환."""
    table = normalize_table_width(table)

    if not table:
        return ""

    # 1) 첫 행이 헤더면 그대로 사용
    # 2) 아니면 Col1..ColN 가짜 헤더 생성
    use_first_row_as_header = is_probable_header_row(table[0])

    if use_first_row_as_header:
        header_row = table[0]
        body_rows = table[1:]
    else:
        col_count = len(table[0])
        header_row = [f"컬럼{i+1}" for i in range(col_count)]
        body_rows = table

    md = []
    md.append("| " + " | ".join(table_cell_to_markdown_text(c) for c in header_row) + " |")
    md.append("| " + " | ".join(["---"] * len(header_row)) + " |")

    for row in body_rows:
        md.append("| " + " | ".join(table_cell_to_markdown_text(c) for c in row) + " |")

    # for i, row in enumerate(table):
    #     escaped = [table_cell_to_markdown_text(cell) for cell in row]
    #     md.append("| " + " | ".join(escaped) + " |")

    #     if i == 0:
    #         md.append("| " + " | ".join(["---"] * len(row)) + " |")

    return "\n".join(md)


def format_box_text(text):
    """입력: 1셀 긴 표 텍스트 / 출력: 본문형 텍스트 / 기능: 강조 박스 안 문단을 bullet 형태로 정리."""
    lines = [line.strip() for line in (text or "").splitlines() if line.strip()]

    if len(lines) <= 1:
        return (text or "").strip()

    formatted = []

    for line in lines:
        if line.startswith(("-", "○", "❍", "①", "②", "③", "④", "⑤", "□", "", "*", "※")):
            formatted.append(line)
        else:
            formatted.append(f"- {line}")

    return "\n".join(formatted)


# --------------------------
# table classification
# --------------------------
def is_table_caption(text):
    """입력: 문자열 / 출력: bool / 기능: '《 지원대상 활동 및 단가 》' 같은 표 제목 감지."""
    text = (text or "").strip()
    patterns = [r"^《.+》$", r"^<.+>$", r"^\[표\s*\d*.*\]$", r"^표\s*\d+[\.\-)]?\s*.+"]
    return any(re.match(pattern, text) for pattern in patterns)


def get_banner_heading_from_table(table):
    """입력: table list / 출력: heading 문자열 또는 '' / 기능: '| Ⅰ | 사업 개요 |' 같은 2컬럼 배너 표를 제목으로 변환."""
    if not table or len(table) != 1:
        return ""

    row = [normalize_text(cell) for cell in table[0] if normalize_text(cell)]
    roman_pattern = r"^[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+$|^[IVX]+$"

    if len(row) == 2:
        marker, title = row

        if re.match(roman_pattern, marker) and title and len(title) <= 80:
            return f"{marker} {title}"

    if len(row) == 1 and re.match(r"^[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩIVX]+\s+.+", row[0]):
        return row[0]

    return ""

def count_non_empty_cells(table):
    """입력: 2차원 table list / 출력: 비어있지 않은 셀 개수 / 기능: 표 크기 및 단일 셀 판정."""
    return sum(1 for row in table for cell in row if (cell or "").strip())


def get_cell_span(tc, name, default=1):
    """입력: tc node, colSpan/rowSpan / 출력: 병합 크기 / 기능: tc 또는 cellSpan 자식에서 병합 정보 조회."""
    value = get_attr(tc, name)

    if value is not None:
        try:
            return int(value)
        except ValueError:
            return default

    for child in tc.iterchildren():
        if localname(child) == "cellSpan":
            value = get_attr(child, name)

            if value is not None:
                try:
                    return int(value)
                except ValueError:
                    return default

    return default


# def is_single_cell_table(table):
#     """입력: table list / 출력: bool / 기능: 비어있지 않은 셀이 1개인지 확인."""
#     return count_non_empty_cells(table) == 1


# def get_single_cell_text(table):
#     """입력: table list / 출력: 단일 셀 텍스트 / 기능: 단일 라벨/제목/박스 표의 텍스트 추출."""
#     for row in table:
#         for cell in row:
#             text = normalize_text(cell)

#             if text:
#                 return text

#     return ""

def is_single_cell_table(table):
    """비어있지 않은 셀이 딱 1개인 경우만 단일 박스로 간주."""
    if not table: return False
    
    # 텍스트가 있는 셀이 총 몇 개인지 계산
    non_empty_count = sum(1 for row in table for cell in row if (cell or "").strip())
    
    # 셀이 딱 하나만 채워져 있다면 단일 박스로 보고 텍스트화함
    return non_empty_count == 1


# def get_single_cell_text(table):
    """
    단일 셀(박스) 표에서 텍스트를 추출하되, 
    혹시라도 여러 칸에 분산되어 있을 모든 내용을 합쳐서 반환합니다.
    """
    all_contents = []
    for row in table:
        for cell in row:
            text = (cell or "").strip()
            if text:
                all_contents.append(text)

    # 첫 번째 것만 찾고 끝내지(return) 말고, 다 찾아서 합칩니다.
    return "\n".join(all_contents) 

def get_single_cell_text(table):
    """입력: table list / 출력: 단일 셀·병합 셀 텍스트 / 기능: 반복된 병합셀 텍스트를 중복 제거해 반환."""
    texts = []

    for row in table:
        for cell in row:
            text = normalize_text(cell)

            if text and text not in texts:
                texts.append(text)

    return "\n".join(texts)


def is_single_cell_table(table):
    if not table:
        return False

    texts = [
        normalize_text(cell)
        for row in table
        for cell in row
        if normalize_text(cell)
    ]

    return len(set(texts)) == 1


def is_single_label_table(table, max_chars=16):
    """입력: table list, 최대 글자수 / 출력: bool / 기능: '지자체' 같은 짧은 라벨 표 판정."""
    cells = [normalize_text(cell) for row in table for cell in row if normalize_text(cell)]
    return len(cells) == 1 and len(cells[0]) <= max_chars


def is_title_like_box_text(text):
    """입력: 문자열 / 출력: bool / 기능: 표지/큰 제목성 1셀 박스인지 판정."""
    text = normalize_text(text)

    if not text or is_date_like_text(text) or len(text) < 12:
        return False

    keywords = ["사업시행지침", "시행지침", "개정안", "사업계획", "사업 개요", "프로그램", "시범사업"]

    if any(keyword in text for keyword in keywords):
        return True

    lines = [line.strip() for line in text.splitlines() if line.strip()]

    return (
        1 <= len(lines) <= 3
        and len(text) <= 120
        and not text.startswith(("○", "❍", "-", "*", "※"))
    )


def should_attach_small_table_to_previous_doc(docs, table, heading_path, caption_text):
    """입력: docs, table, heading, caption / 출력: bool / 기능: caption 없는 작은 표를 직전 문서에 붙일지 판단."""
    if not docs or caption_text:
        return False

    if len(table) > 6 or count_non_empty_cells(table) > 20:
        return False

    if len(table_to_markdown(table)) > 700:
        return False

    prev = docs[-1]

    return (
        prev.metadata.get("heading_path") == heading_path
        and prev.metadata.get("type") in ("paragraph", "box_text")
    )


def get_direct_trs(table_elem):
    return [
        node for node in table_elem.iterchildren()
        if localname(node) == "tr"
    ]



def is_inside_nested_table_before_tc(node, tc):
    """입력: node, 기준 tc / 출력: bool / 기능: 현재 tc 안의 중첩표 내부 노드인지 판정."""
    for parent in node.iterancestors():
        if parent is tc:
            return False

        if localname(parent) in ("tbl", "table"):
            return True

    return False

def extract_text_from_cell_with_nested(tc):
    """입력: table cell XML node / 출력: 셀 텍스트 / 기능: 셀 내부 여러 문단은 한 셀로 묶고, 중첩표는 중복 없이 처리."""
    parts = []

    for node in tc.iter():
        if node is tc:
            continue

        tag = localname(node)

        if tag == "p":
            if is_inside_nested_table_before_tc(node, tc):
                continue

            text = extract_text_from_para_in_cell(node)

            if text:
                parts.append(text)

        elif tag in ("tbl", "table"):
            if is_inside_nested_table_before_tc(node, tc):
                continue

            nested = extract_table(node)

            if not nested:
                continue

            if is_single_cell_table(nested):
                parts.append(format_box_text(get_single_cell_text(nested)))
            else:
                parts.append("[중첩표]\n" + table_to_markdown(nested))

    return dedup_multiline(normalize_text("\n".join(parts)))



# 
# row 시작 시 rowSpan 먼저 반영 (컬럼 밀림 방지)
# tc 처리 중간에도 rowSpan 체크
# rowSpan 정보를 “컬럼 위치 기준”으로 유지
# 
def extract_table(table_elem):
    """입력: table XML node / 출력: 2차원 table list / 기능: rowSpan/colSpan을 반영해 표 추출."""
    grid = []
    row_spans = {}  # {col_idx: {"text": str, "remaining": int}}

    trs = [node for node in table_elem.iterchildren() if localname(node) == "tr"]

    for tr in trs:
        row = []
        col_idx = 0
        tcs = [node for node in tr.iterchildren() if localname(node) == "tc"]
        tc_idx = 0

        while tc_idx < len(tcs) or col_idx in row_spans:
            if col_idx in row_spans:
                info = row_spans[col_idx]
                row.append(info["text"])
                info["remaining"] -= 1

                if info["remaining"] <= 0:
                    del row_spans[col_idx]

                col_idx += 1
                continue

            if tc_idx >= len(tcs):
                break

            tc = tcs[tc_idx]
            tc_idx += 1

            cell_text = extract_text_from_cell_with_nested(tc)
            col_span = get_cell_span(tc, "colSpan", 1)
            row_span = get_cell_span(tc, "rowSpan", 1)

            for offset in range(col_span):
                curr_col = col_idx + offset

                # RAG용 표에서는 병합된 모든 칸에 같은 텍스트를 채워야 행/열 의미가 덜 깨집니다.
                # 핵심: 가로 병합은 첫 칸만 텍스트, 나머지는 빈칸
                value = cell_text if offset == 0 else ""
                row.append(value)

                if row_span > 1:
                    row_spans[curr_col] = {
                        "text": cell_text,
                        "remaining": row_span - 1,
                    }

            col_idx += col_span

        if any((cell or "").strip() for cell in row):
            grid.append(row)

    return normalize_table_width(grid)



def dedup_multiline(text):
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    deduped = []

    for l in lines:
        if not deduped or deduped[-1] != l:
            deduped.append(l)

    return "\n".join(deduped)


# --------------------------
# table row documents
# --------------------------
def table_to_row_documents(table, base_metadata, heading_path, table_caption):
    """입력: table, base metadata, heading, caption / 출력: row Document list / 기능: 표를 행 단위 검색 문서로 추가 생성."""
    table = normalize_table_width(table)

    if len(table) < 2:
        return []

    headers = [normalize_text(cell) for cell in table[0]]
    row_docs = []

    for row_idx, row in enumerate(table[1:], start=1):
        pairs = []

        for col_idx, cell in enumerate(row):
            cell_text = normalize_text(cell)

            if not cell_text:
                continue

            header = headers[col_idx] if col_idx < len(headers) and headers[col_idx] else f"컬럼{col_idx + 1}"
            pairs.append(f"{header}: {cell_text}")

        if not pairs:
            continue

        row_docs.append(
            Document(
                page_content="\n".join(pairs),
                metadata={
                    **deepcopy(base_metadata),
                    "type": "table_row",
                    "heading_path": heading_path,
                    "table_caption": table_caption,
                    "table_row_index": row_idx,
                    "table_rows": len(table),
                    "table_cells": count_non_empty_cells(table),
                },
            )
        )

    return row_docs


# --------------------------
# main parser
# --------------------------
def parse_hwpx(file_path, include_heading_docs=False, include_table_row_docs=True):
    """입력: HWPX 경로 / 출력: LangChain Document list / 기능: HWPX 문단·표를 문맥 기반 RAG 문서로 파싱."""
    docs = []
    parser = ET.XMLParser(resolve_entities=False, no_network=True, recover=True, huge_tree=True)

    with zipfile.ZipFile(file_path, "r") as z:
        section_files = get_section_files(z)
        charpr_sizes = extract_charpr_font_sizes(z)

        print(f"\nsection 개수: {len(section_files)}")

        for section_idx, sec_file in enumerate(section_files):
            tree = ET.fromstring(z.read(sec_file), parser=parser)

            block_idx = 0
            para_count = 0
            table_count = 0
            heading_stack = []
            pending_table_caption = None
            document_date = ""

            for elem in tree.iter():
                tag = localname(elem)

                if tag == "p" and is_inside_table(elem):
                    continue

                if tag not in ("p", "tbl", "table"):
                    continue

                base_metadata = {
                    "section": section_idx,
                    "section_file": sec_file,
                    "block_index": block_idx,
                    "document_date": document_date,
                }

                if tag == "p":
                    text = extract_text_from_para(elem)

                    if not text:
                        block_idx += 1
                        continue

                    if is_date_like_text(text):
                        document_date = text
                        para_count += 1
                        block_idx += 1
                        continue

                    if is_table_caption(text):
                        pending_table_caption = {"text": text, "block_index": block_idx}
                        para_count += 1
                        block_idx += 1
                        continue

                    is_heading = is_probable_heading(text)

                    if is_heading:
                        heading_stack = update_heading_stack(heading_stack, text)

                    heading_path = get_heading_path(heading_stack)

                    if is_heading and not include_heading_docs:
                        para_count += 1
                        block_idx += 1
                        continue

                    docs.append(
                        Document(
                            page_content=text,
                            metadata={
                                **base_metadata,
                                "type": "paragraph",
                                "is_heading": is_heading,
                                "heading_path": heading_path,
                            },
                        )
                    )

                    para_count += 1
                    block_idx += 1
                    continue

                table = extract_table(elem)

                if not table:
                    block_idx += 1
                    continue

                banner_heading = get_banner_heading_from_table(table)

                if banner_heading:
                    heading_stack = update_heading_stack(heading_stack, banner_heading)
                    table_count += 1
                    block_idx += 1
                    continue

                heading_path = get_heading_path(heading_stack)
                caption_text = ""
                content = ""
                doc_type = "table"

                if is_single_cell_table(table):
                    single_text = get_single_cell_text(table)

                    if (
                        is_title_like_box_text(single_text)
                        and table_has_font_size_at_least(elem, charpr_sizes, min_pt=18)
                    ):
                        heading_stack = update_heading_stack(heading_stack, single_text)
                        table_count += 1
                        block_idx += 1
                        continue

                if is_single_label_table(table, max_chars=16):
                    label = get_single_cell_text(table)

                    if heading_stack:
                        heading_stack = append_label_to_current_heading(heading_stack, label)

                    table_count += 1
                    block_idx += 1
                    continue

                if is_single_cell_table(table):
                    content = format_box_text(get_single_cell_text(table))
                    doc_type = "box_text"
                else:
                    content = table_to_markdown(table)
                    doc_type = "table"

                if pending_table_caption:
                    caption_text = pending_table_caption.get("text", "")
                    pending_table_caption = None

                table_metadata = {
                    **base_metadata,
                    "type": doc_type,
                    "heading_path": heading_path,
                    "table_caption": caption_text,
                    "table_rows": len(table),
                    "table_cells": count_non_empty_cells(table),
                }

                if (
                    doc_type == "table"
                    and should_attach_small_table_to_previous_doc(
                        docs=docs,
                        table=table,
                        heading_path=heading_path,
                        caption_text=caption_text,
                    )
                ):
                    docs[-1].page_content = (
                        docs[-1].page_content.rstrip()
                        + "\n\n[표]\n"
                        + table_to_markdown(table)
                    )
                    docs[-1].metadata["attached_table_count"] = (
                        docs[-1].metadata.get("attached_table_count", 0) + 1
                    )

                    table_count += 1
                    block_idx += 1
                    continue

                if content:
                    docs.append(Document(page_content=content, metadata=table_metadata))

                    if include_table_row_docs and doc_type == "table" and caption_text and len(table) >= 3 :
                        docs.extend(
                            table_to_row_documents(
                                table=table,
                                base_metadata=base_metadata,
                                heading_path=heading_path,
                                table_caption=caption_text,
                            )
                        )

                    table_count += 1

                block_idx += 1

            print(f"section {section_idx} → p{para_count}, t{table_count}")

    total_sources = len(docs)

    for source_order, doc in enumerate(docs, start=1):
        doc.metadata["source_order"] = source_order
        doc.metadata["total_sources"] = total_sources
        doc.metadata["position"] = f"{source_order}/{total_sources}"

    return docs
