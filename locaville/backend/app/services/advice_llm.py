"""advice 표현 변형 — LLM 으로 짧은 자연어 한 줄 생성.

룰이 결정한 시나리오(scenario_cd + fields) 안에서만 자유 표현. fields 밖 정보 사용 금지.
출력 길이/금지 키워드 검증 통과 시 LLM 텍스트, 실패 시 룰 템플릿 fallback.
"""
from __future__ import annotations

import json
import re
from typing import Any

from app.services.ai_service import (
    AIServiceError,
    _get_advice_client_and_model,
    _get_today_word_client_and_model,
)


SYSTEM_PROMPT = """당신은 한국 농촌 어르신께 오늘 농사 한마디를 드리는 작은 도우미입니다.

[목표]
- 오늘 날씨 + 오늘 해야 할 일 + 행동 제안 — 이 셋이 한 문장에 자연스럽게 연결되어야 합니다.
- 일반론 (예: "건강 잘 챙기세요", "땅을 살펴보세요") 금지. 구체 행동만.

[규칙 — 절대 어김]
1. 출력 한 줄(최대 두 문장), 80자 이내, 한국어.
2. fields 안의 정보(weather, job_name, due_date 등) 만 사용 — 다른 정보 추측 금지.
3. 약품/비료/농약/살충제 종류 권장 금지.
4. "지금이 적기" 같은 시기 단언 금지.
5. 이름은 0~1번. 짧고 친근한 존댓말 ("○○님, …해요").
6. "AI", "인공지능" 같은 단어 사용 금지.
7. 마크다운/따옴표/JSON 출력 금지 — 본문 한 줄만.

[좋은 예]
- "오늘은 구름 많고 28도예요. 논물 상태 확인하고 사진 한 장 남겨두세요."
- "내일 비 와요. 논물 사진은 오늘 찍어두면 좋아요."
- "오늘은 31도까지 올라요. 오전에 일 보시고 한 줄 남겨두세요."

[나쁜 예 — 절대 X]
- "오늘도 건강 잘 챙기시고 식물 상태를 꼼꼼히 살피세요." (일반론)
- "농약은 화창한 날 뿌리는 게 좋아요." (약품 권장)
- "지금이 시비 적기예요." (시기 단언)
"""


# 금지 키워드 — output validation 시 매칭되면 fallback.
FORBIDDEN_KEYWORDS = [
    "지금이 적기",
    "지금이 적기예요",
    "꼭 뿌리세요",
    "반드시 사용하세요",
    # 일반론 (구체 행동 없음) — LLM 이 fields 무시하고 generic 출력하는 패턴
    "건강 잘 챙",
    "땅과 식물",
    "식물 상태",
    "꼼꼼히 살펴",
    "안전 운전",
    "수고하셨",
    "오늘도 좋은",
    "오늘도 화이팅",
    "활기찬 하루",
    "행복한 하루",
]
FORBIDDEN_PATTERNS = [
    re.compile(r"\d+\s*그램"),     # 약품 용량 단언
    re.compile(r"\d+\s*리터"),
    re.compile(r"\d+\s*ml"),
]


MAX_CHARS = 120


def _validate(text: str) -> str | None:
    """검증 통과 시 정리된 text, 실패 시 None."""
    if not text:
        return None
    cleaned = text.strip().strip('"').strip("'")
    if not cleaned:
        return None
    # 줄바꿈은 하나까지만
    cleaned = re.sub(r"\n{2,}", "\n", cleaned)
    if len(cleaned) > MAX_CHARS:
        return None
    for kw in FORBIDDEN_KEYWORDS:
        if kw in cleaned:
            return None
    for pat in FORBIDDEN_PATTERNS:
        if pat.search(cleaned):
            return None
    return cleaned


def compose_advice_text(
    scenario_cd: str,
    fields: dict[str, Any],
    fallback_template: str,
    *,
    purpose: str = "today_word",
) -> tuple[str, str]:
    """LLM 으로 표현 변형. 성공 시 (text, 'RULELLM'), 실패/거부 시 (fallback, 'RULE').

    fallback_template 은 fields 가 이미 채워진 완성 문장 (룰에서 f-string 으로 만들어 옴).
    purpose='today_word' 면 오늘 한마디 본문(gpt-4.1-nano),
    'card'/'notification' 면 카드·알림 문구(Solar Pro 3) 셀렉터를 사용.
    """
    try:
        if purpose == "today_word":
            # 오늘 한마디 본문은 gpt-4.1-nano (OPENAI_API_KEY 없으면 룰 fallback).
            client, model, _provider = _get_today_word_client_and_model()
        else:
            # 카드/알림 문구는 Solar Pro 3 기본 (UPSTAGE_API_KEY 없으면 OpenAI 폴백).
            client, model, _provider = _get_advice_client_and_model()
    except AIServiceError:
        # API key 없거나 SDK 미설치 — 룰 fallback
        return fallback_template, "RULE"

    user_msg = json.dumps(
        {"scenario_cd": scenario_cd, "fields": fields},
        ensure_ascii=False,
    )

    try:
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_msg},
            ],
            max_tokens=160,
            temperature=0.5,
        )
        raw = (resp.choices[0].message.content or "").strip()
    except Exception:  # noqa: BLE001
        return fallback_template, "RULE"

    validated = _validate(raw)
    if validated:
        return validated, "RULELLM"
    return fallback_template, "RULE"
