"""사업 시행령 문서 → 사업 등록 초안 (메타 + todo 리스트) 자동 생성.

1) document_ingest_service.ingest_document() 가 만든 청크를 받는다.
2) LLM #1 — 사업 메타 (사업명/시행기간/대상작물/지원조건/예산/문의처 등) 를 JSON 으로 추출.
3) LLM #2 — 시행령에 등장하는 작업명 list 를 뽑아내고, 각 작업에 대해
   ai_service.extract_policy_schedule_rule() 을 호출해 일정·증빙 규칙까지 JSON 화.
4) 응답에 { project_draft, todo_drafts } 형태로 묶어 반환.

설계 결정:
  - 청크가 많으면 LLM 토큰이 폭주 → 메타 추출은 "앞쪽 N개 청크" + "사업 개요·목적·대상·기간 키워드 매칭 청크" 만 컨텍스트.
  - todo 작업명 추출은 청크 전체 텍스트 중 일부 + 한국어 농작업 어휘 휴리스틱.
  - 각 작업명의 일정 규칙은 이미 검증된 extract_policy_schedule_rule (RAG) 재사용 — DB 에 막 들어간 청크가 즉시 검색됨.

이건 시연/MVP 단계 함수다. 실제 서비스에서는 LLM 호출 비용을 더 면밀히 제어해야 함.
"""
from __future__ import annotations

import json
import re
from typing import Any

from app.schemas.ai import AIPolicyRuleResponse
from app.services.ai_service import (
    AIServiceError,
    _extract_first_json_object,
    _run_text_response,
    extract_policy_schedule_rule,
)


# ============================================================
# 1) 사업 메타 — LLM JSON 추출
# ============================================================

PROJECT_META_SYSTEM_PROMPT = (
    "너는 정부·지자체 농업 사업 시행령(또는 사업 안내문서) 에서 사업 등록에 필요한 메타데이터를 "
    "JSON 으로 정확히 추출하는 도우미다. 규칙:\n"
    "(1) 반드시 제공된 [본문] 안의 내용만 사용해. 추측·창작 금지.\n"
    "(2) 본문에 없는 항목은 null 또는 빈 문자열로 둬.\n"
    "(3) 기간은 'YYYY-MM-DD' 형식. 본문이 '2026.3.1' 처럼 적었어도 '2026-03-01' 로 정규화.\n"
    "(4) 예산은 숫자만 (단위: 원). '12억' → 1200000000. 알 수 없으면 null.\n"
    "(5) 대상작물·대상지역은 본문에 명시된 항목만 배열로.\n"
    "(6) 응답은 JSON 한 덩어리만. 머리말·마크다운·코드블록 금지.\n\n"
    "출력 JSON:\n"
    "{\n"
    '  "project_name": "",          // 사업명 (필수)\n'
    '  "project_year": null,         // 시행연도 (정수)\n'
    '  "start_date": null,           // YYYY-MM-DD\n'
    '  "end_date": null,             // YYYY-MM-DD\n'
    '  "host_org": "",               // 주관 기관 (예: 농림축산식품부)\n'
    '  "exec_org": "",               // 시행 기관 (예: 지자체·농산물품질관리원)\n'
    '  "purpose": "",                // 사업 목적 (1-2문장)\n'
    '  "target_crops": [],           // 대상 작물 배열\n'
    '  "target_regions": [],         // 대상 지역 배열\n'
    '  "support_conditions": [],     // 지원 자격 조건 (각 항목 한 줄)\n'
    '  "budget_total_krw": null,     // 총 예산 (원)\n'
    '  "contact": ""                 // 문의처 (전화/이메일)\n'
    "}"
)


def _build_meta_context(chunks: list[dict[str, Any]], max_chunks: int = 20) -> str:
    """사업 메타 추출용 컨텍스트 — 앞쪽 청크 + 키워드 매칭 청크 우선.

    시행령 문서의 메타 정보는 보통 앞쪽 (개요/목적/대상/기간) 에 몰려 있어서
    앞쪽 우선 + '사업명/기간/대상/예산/문의' 단어가 든 청크를 보충.
    """
    keyword_re = re.compile(r"사업\s*명|시행\s*기간|기간|대상|예산|문의|목적|개요|지원\s*자격")
    head = chunks[: max(8, max_chunks // 2)]
    matched: list[dict[str, Any]] = []
    seen_ids: set[str] = {c.get("chunk_id", "") for c in head}
    for c in chunks[len(head):]:
        if len(matched) + len(head) >= max_chunks:
            break
        text = c.get("text", "") or ""
        if keyword_re.search(text) and c.get("chunk_id") not in seen_ids:
            matched.append(c)
            seen_ids.add(c.get("chunk_id", ""))

    blocks: list[str] = []
    for idx, c in enumerate(head + matched, start=1):
        title = (c.get("title") or "").strip()
        text = (c.get("text") or "").strip()
        if not text:
            continue
        head_line = f"[본문 {idx}]"
        if title:
            head_line += f" {title}"
        blocks.append(head_line + "\n" + text)
    return "\n\n".join(blocks)


def extract_project_meta(chunks: list[dict[str, Any]]) -> dict[str, Any]:
    """청크 list → 사업 메타 JSON 추출.

    Returns dict (extract 실패 시 빈 dict).
    """
    if not chunks:
        return {}

    context = _build_meta_context(chunks)
    if not context.strip():
        return {}

    try:
        raw = _run_text_response(
            system_prompt=PROJECT_META_SYSTEM_PROMPT,
            user_prompt=(
                "아래 본문에서 사업 등록 메타데이터를 JSON 으로 추출해라.\n\n"
                f"{context}\n\n"
                "JSON 만 출력."
            ),
        )
    except AIServiceError:
        return {}
    except Exception:  # noqa: BLE001
        return {}

    try:
        parsed = _extract_first_json_object(raw)
    except Exception:  # noqa: BLE001
        return {}
    return parsed or {}


# ============================================================
# 2) todo 작업명 추출 — LLM
# ============================================================

TODO_NAMES_SYSTEM_PROMPT = (
    "너는 농업 사업 시행령에서 '농가가 수행해야 할 작업' 의 명칭을 추출하는 도우미다. 규칙:\n"
    "(1) 반드시 본문에 명시된 작업만. 추측 금지.\n"
    "(2) 일반적인 '농작업' (예: 모내기·중간 물떼기·바이오차 살포·폐비닐 수거·영농일지 작성 등) 중 "
    "이 시행령이 인증·증빙·의무 행위로 지정한 것만.\n"
    "(3) 너무 일반적이거나 막연한 명사 (예: '농업', '관리') 는 제외.\n"
    "(4) 응답은 JSON 한 덩어리만. 코드블록·머리말 금지.\n\n"
    "출력 JSON:\n"
    "{\n"
    '  "task_names": []   // 작업명 배열, 한국어 1-15자, 최대 12개\n'
    "}"
)


def _build_todo_context(chunks: list[dict[str, Any]], max_chunks: int = 30) -> str:
    """작업명 추출용 — 청크 전체에서 작업 행동 어휘가 든 청크 우선."""
    action_keywords = (
        "작업", "활동", "조치", "실시", "수행", "수거", "살포", "투입",
        "기록", "촬영", "관리", "준수", "이행", "보고", "증빙", "사진",
        "물떼기", "비료", "퇴비", "바이오차", "농약", "방제", "모내기",
    )
    pattern = re.compile("|".join(re.escape(k) for k in action_keywords))
    matched: list[dict[str, Any]] = []
    for c in chunks:
        if len(matched) >= max_chunks:
            break
        text = c.get("text", "") or ""
        if pattern.search(text):
            matched.append(c)
    blocks: list[str] = []
    for idx, c in enumerate(matched, start=1):
        text = (c.get("text") or "").strip()
        if text:
            blocks.append(f"[본문 {idx}] {text}")
    return "\n\n".join(blocks)


def extract_todo_names(chunks: list[dict[str, Any]]) -> list[str]:
    """청크 list → 농가 작업명 list."""
    if not chunks:
        return []
    context = _build_todo_context(chunks)
    if not context.strip():
        return []

    try:
        raw = _run_text_response(
            system_prompt=TODO_NAMES_SYSTEM_PROMPT,
            user_prompt=(
                "아래 본문에서 농가가 수행해야 할 작업 명칭을 JSON 으로 추출해라.\n\n"
                f"{context}\n\n"
                "JSON 만 출력."
            ),
        )
    except AIServiceError:
        return []
    except Exception:  # noqa: BLE001
        return []

    try:
        parsed = _extract_first_json_object(raw)
    except Exception:  # noqa: BLE001
        return []
    names = parsed.get("task_names") if isinstance(parsed, dict) else []
    if not isinstance(names, list):
        return []
    out: list[str] = []
    seen: set[str] = set()
    for n in names:
        s = (str(n) or "").strip()
        if 1 <= len(s) <= 15 and s not in seen:
            out.append(s)
            seen.add(s)
    return out[:12]


# ============================================================
# 3) 사업 등록 초안 — 전체 묶음
# ============================================================

def build_project_draft(chunks: list[dict[str, Any]]) -> dict[str, Any]:
    """청크 list → { project_draft, todo_drafts } 묶음.

    todo_drafts 각 항목은 작업명 + extract_policy_schedule_rule 결과 (rule, used_context).
    rule 추출 실패한 작업은 task_name 만 채워서 반환 (사용자가 frontend 에서 직접 보정).
    """
    project_draft = extract_project_meta(chunks)
    task_names = extract_todo_names(chunks)

    todo_drafts: list[dict[str, Any]] = []
    for name in task_names:
        try:
            rule_resp: AIPolicyRuleResponse = extract_policy_schedule_rule(task_name=name)
            rule_dict = (
                rule_resp.rule.model_dump(by_alias=True) if rule_resp.rule else None
            )
            todo_drafts.append({
                "task_name": name,
                "rule": rule_dict,
                "source_type": rule_resp.source_type,
            })
        except Exception:  # noqa: BLE001
            todo_drafts.append({
                "task_name": name,
                "rule": None,
                "source_type": "error",
            })

    return {
        "project_draft": project_draft,
        "todo_drafts": todo_drafts,
    }
