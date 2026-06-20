import json, re

from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate

DEFAULT_PERSIST_DIRECTORY = r"./database/chroma_hwpx_db"
DEFAULT_COLLECTION_NAME = "hwpx_documents"
DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small"
DEFAULT_LLM_MODEL ="gpt-4o-mini"


# --------------------------
# 검색
# --------------------------
def format_docs_for_context(docs_with_scores):
    """입력: [(Document, score)] / 출력: RAG context 문자열 / 기능: 검색 근거를 LLM이 읽기 좋은 형태로 변환."""
    context_blocks = []

    for idx, (doc, score) in enumerate(docs_with_scores, start=1):
        metadata = doc.metadata or {}

        position = metadata.get("position", "")
        section = metadata.get("section", "")
        block_index = metadata.get("block_index", "")
        doc_type = metadata.get("type", "")
        heading_path = metadata.get("heading_path", "")
        table_caption = metadata.get("table_caption", "")
        content = (doc.page_content or "").strip()

        context_blocks.append(
            "\n".join(
                [
                    f"[근거 {idx}]",
                    f"score: {score:.6f}" if isinstance(score, (int, float)) else f"score: {score}",
                    f"position: {position}",
                    f"section: {section}",
                    f"block_index: {block_index}",
                    f"type: {doc_type}",
                    f"heading_path: {heading_path}",
                    f"table_caption: {table_caption}",
                    "",
                    content,
                ]
            )
        )

    return "\n\n".join(context_blocks)



def parse_json_response(text):
    """입력: LLM 응답 문자열 / 출력: dict / 기능: JSON 단독 또는 코드블록 JSON을 안전하게 파싱."""
    text = (text or "").strip()

    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return {
            "raw_answer": text,
            "parse_error": "JSON 파싱 실패",
        }


def run_hwpx_rag(
    query,
    vectorstore,
    prompt,
    k=5,
    llm_model="gpt-4o-mini",
    extra_inputs=None,
    output_parser=None,
):
    """입력: query, vectorstore, prompt, 검색/LLM 옵션, 추가 입력, 출력 파서 / 출력: answer와 sources / 기능: HWPX RAG 검색과 LLM 실행을 공통 처리."""
    docs_with_scores = vectorstore.similarity_search_with_score(query, k=k)

    context = format_docs_for_context(docs_with_scores)

    llm = ChatOpenAI(
        model=llm_model,
        temperature=0,
    )

    inputs = {
        "query": query,
        "context": context,
    }

    if extra_inputs:
        inputs.update(extra_inputs)

    response = (prompt | llm).invoke(inputs)
    answer = response.content

    if output_parser:
        answer = output_parser(answer)

    return {
        "answer": answer,
        "sources": docs_with_scores,
    }

#
#   Prompts
#
answer_prompt = ChatPromptTemplate.from_messages(
    [
        (
            "system",
            """너는 HWPX 문서를 기반으로 답변하는 RAG assistant다.

규칙:
- 반드시 제공된 [근거] 안의 내용만 사용해서 답변한다.
- 답변과 가장 근접한 근거를 우선으로 한다.
- 유사도가 낮은 근거만 있을 경우 답변 앞에 '[연관도 낮음]'을 붙인다.
- 숫자, 기간, 조건이 근거에 있으면 반드시 포함한다.
- 근거에 없는 내용은 추측하지 말고 "문서에서 확인되지 않습니다"라고 답한다.
- 답변에는 관련 position을 함께 표시한다.
- 표 내용이 근거라면 표의 내용을 자연어로 요약한다.
- 한국어로 간결하고 명확하게 답변한다."""
        ),
        (
            "human",
            """질문:
{query}

문서 근거:
{context}

위 근거를 바탕으로 답변해줘."""
        ),
    ]
)


calculation_prompt = ChatPromptTemplate.from_messages(
    [
        (
            "system",
            """너는 HWPX 문서를 근거로 규칙을 추출하고 날짜를 산정하는 RAG assistant다.

규칙:
- 반드시 제공된 [근거] 안의 내용만 업무 규칙으로 사용한다.
- 문서 근거에서 기간 산정 기준을 먼저 추출하여 적용한다.
- 사용자가 제공한 특정 작업 및 일자가 있으면 이에 맞는 업무 규칙을 최우선으로 한다.
- 특정 작업일 기준 며칠 전/후 등의 선행 작업 정보가 있으면 우선 활용한다.
- 날짜 계산은 양력 달력을 기준으로 수행한다.
- 하루, 이틀, 2주, 한 달 같은 표현은 숫자로 정규화하여 계산한다.
- '약 한 달 후'는 문서에 별도 정의가 없으면 30일 후로 계산한다.
- '2주 이상'은 최소 14일로 계산한다.
- '30일 이내'는 최대 30일로 계산한다.
- 특정 일자가 아닌 일자 범위인 경우, 가장 빠른 날짜와 가장 늦은 날짜를 함께 산정한다.
- 근거에 없는 업무 규칙은 만들지 않는다.
- 답변에는 근거 문구와 position을 함께 표시한다.
- 한국어로 간결하고 명확하게 답변한다.

답변 형식:
1. 문서에서 추출한 산정 기준
2. 날짜 계산
3. 최종 답변"""
        ),
        (
            "human",
            """질문:
{query}

문서 근거:
{context}

위 문서 근거에서 산정 로직을 추출한 뒤, 사용자가 제시한 날짜에 적용해서 답변해줘."""
        ),
    ]
)


schedule_rule_prompt = ChatPromptTemplate.from_messages(
    [
        (
            "system",
            """너는 농업 사업지침 문서에서 작업 일정 산정 규칙과 증빙조건을 추출하는 RAG assistant다.

규칙:
- 반드시 제공된 [근거] 안의 내용만 사용한다.
- 근거에 없는 선행작업, 날짜, 기간, 조건은 만들지 않는다.
- 사용자가 묻는 작업명과 직접 관련된 규칙만 추출한다.
- 그룹ID와 작업ID는 항상 빈 문자열("")로 작성한다.
- '약 한 달 후'는 30일 후로 정규화한다.
- '2주 이상'은 최소경과일수 14일로 정규화한다.
- '30일 이내'는 최대경과일수 30일로 정규화한다.
- 시작일과 종료일 기준이 서로 다르면 각각 별도로 작성한다.
- 종료일 기준이 본 작업의 시작일이면 기준은 '시작일'로 작성한다.
- 증빙회수는 근거에 명시된 숫자가 있을 때만 숫자로 작성하고, 없으면 null로 둔다.
- 증빙방법은 문서에 명시된 증빙 관련 조건을 배열로 작성한다.
- 출처에는 근거의 position 값을 사용한다.
- 답변은 반드시 지정된 JSON 형식만 출력한다.
- 설명 문장, Markdown 코드블록, 주석을 출력하지 않는다.

출력 JSON 형식:
{{
  "그룹ID": "",
  "작업ID": "",
  "작업명": "",
  "선행작업": [],
  "시작일": {{
    "기준": "",
    "전후": "",
    "경과일수": null,
    "최소경과일수": null,
    "최대경과일수": null,
    "근거": "",
    "출처": ""
  }},
  "종료일": {{
    "기준": "",
    "전후": "",
    "경과일수": null,
    "최소경과일수": null,
    "최대경과일수": null,
    "근거": "",
    "출처": ""
  }},
  "증빙조건": {{
    "증빙회수": null,
    "증빙방법": [],
    "기타": ""
  }}
}}"""
        ),
        (
            "human",
            """추출 대상 작업명:
{task_name}

사용자 요청:
{query}

문서 근거:
{context}

위 근거에서 작업 일정 산정 규칙과 증빙조건을 추출해라."""
        ),
    ]
)


def answer_hwpx_question(query, vectorstore, k=8, llm_model="gpt-4o-mini"):
    return run_hwpx_rag(query, vectorstore, answer_prompt, k=k, llm_model=llm_model)


def answer_hwpx_calculation_question(query, vectorstore, k=15, llm_model="gpt-4o-mini"):
    return run_hwpx_rag(
        query,
        vectorstore,
        calculation_prompt,
        k=k,
        llm_model=llm_model,
    )


def extract_work_schedule_rule(query, vectorstore, k=15, llm_model="gpt-4o-mini", task_name="미지정"):
    return run_hwpx_rag(
        query,
        vectorstore,
        schedule_rule_prompt,
        k=k,
        llm_model=llm_model,
        extra_inputs={"task_name": task_name},
        output_parser=parse_json_response,
    )


#
# 문서 요약
#
def format_docs_for_summary(docs, max_chars=12000):
    """입력: Document list, 최대 문자 수 / 출력: 요약용 context 문자열 / 기능: 문서 순서대로 요약에 사용할 근거 텍스트 구성."""
    blocks = []
    total = 0

    sorted_docs = sorted(
        docs,
        key=lambda doc: (
            doc.metadata.get("source_order", 0),
            doc.metadata.get("section", 0),
            doc.metadata.get("block_index", 0),
        ),
    )

    for doc in sorted_docs:
        metadata = doc.metadata or {}
        content = (doc.page_content or "").strip()

        if not content:
            continue

        position = metadata.get("position", "")
        section = metadata.get("section", "")
        block_index = metadata.get("block_index", "")
        doc_type = metadata.get("type", "")
        heading_path = metadata.get("heading_path", "")
        table_caption = metadata.get("table_caption", "")

        block = "\n".join(
            [
                f"[position {position} / {doc_type}]",
                f"section: {section}",
                f"block_index: {block_index}",
                f"heading_path: {heading_path}",
                f"table_caption: {table_caption}",
                "",
                content,
            ]
        )

        if total + len(block) > max_chars:
            break

        blocks.append(block)
        total += len(block)

    return "\n\n".join(blocks)


def summarize_hwpx_document(
    docs,
    llm_model=DEFAULT_LLM_MODEL,
    max_chars=12000,
):
    """입력: Document list, LLM 모델명, 최대 context 길이 / 출력: 요약 문자열 / 기능: 파싱된 HWPX 문서를 순서대로 구성해 전체 요약 생성."""
    if not docs:
        return "요약할 문서 내용이 없습니다."

    context = format_docs_for_summary(
        docs,
        max_chars=max_chars,
    )

    if not context.strip():
        return "요약할 수 있는 문서 내용이 없습니다."

    prompt = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                """너는 HWPX 문서를 요약하는 assistant다.

규칙:
- 제공된 문서 내용만 근거로 요약한다.
- 문서의 목적, 사업내용, 지원대상/요건, 절차, 증빙/정산, 유의사항을 중심으로 요약한다.
- 표 내용도 자연어로 반영한다.
- 중요한 숫자, 기간, 조건은 유지한다.
- 출처가 필요한 경우 position을 함께 표시한다.
- 한국어로 간결하게 작성한다."""
            ),
            (
                "human",
                """아래 문서를 간단히 요약해줘.

문서 내용:
{context}"""
            ),
        ]
    )

    llm = ChatOpenAI(
        model=llm_model,
        temperature=0,
    )

    response = (prompt | llm).invoke(
        {
            "context": context,
        }
    )

    return response.content

