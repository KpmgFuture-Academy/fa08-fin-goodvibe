"""AI 기능 통합 서비스 (``/ai/*`` 라우터 본체).

이 모듈은 OpenAI/Returnzero API 호출의 유일한 진입점입니다. **API key 는 backend 안에만** —
프론트엔드는 절대 직접 호출하지 않고 backend 의 ``/ai/*`` 를 거칩니다.

지원 기능:
  - chat (RAG): ``chat_with_rag`` — HWPX 정책 문서 RAG Q&A
  - evidence-guide: ``generate_evidence_guide`` — 누락 증빙 안내 문구 생성
  - policy/calc · policy/rule: 정책 문서 근거 일정·규칙 추출
  - vision evidence 분류·OCR: ``classify_and_extract_evidence`` (사진 업로드 자동 호출)
  - stt: ``transcribe_audio_file`` — OpenAI Whisper / Returnzero 분기
  - tts: ``synthesize_speech_bytes`` — Google Cloud TTS Chirp 3 HD (Kore, 한국어)

모든 OpenAI 호출은 실패해도 ``AIServiceError`` 를 던지거나 안전한 fallback 응답을
돌려줘서 화면이 깨지지 않게 합니다.
"""
from __future__ import annotations

import base64
import csv
import mimetypes
import json
import os
import re
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from app.schemas.llm_compare import (
    AILLMCompareRequest,
    AILLMCompareResponse,
    AILLMCompareResult,
    AILLMCompareSelectionRequest,
    AILLMCompareSelectionResponse,
)
from app.schemas.ai import (
    AIChatResponse,
    AIEvidenceGuideResponse,
    AIPolicyCalcResponse,
    AIPolicyRuleBody,
    AIPolicyRuleResponse,
    AISTTResponse,
    AITTSResponse,
    AIUsedContext,
)
from locaville.dbcom import fetch_all

from app.services.evidence_service import display_evidence_type
from app.services.rag_service import retrieve_relevant_snippets

try:
    from openai import OpenAI
except ImportError:  # pragma: no cover
    OpenAI = None

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover
    load_dotenv = None

_ENV_FILE_LOADED = False


class AIServiceError(Exception):
    """AI 서비스 호출 실패. ``status_code`` 는 라우터가 그대로 HTTP 응답으로 사용 (기본 503)."""

    def __init__(self, message: str, status_code: int = 503):
        super().__init__(message)
        self.status_code = status_code


def _load_env_file_if_needed() -> None:
    global _ENV_FILE_LOADED
    if load_dotenv is None or _ENV_FILE_LOADED:
        return
    env_path = Path(__file__).resolve().parents[2] / ".env"
    if env_path.exists():
        load_dotenv(env_path, override=False)
    _ENV_FILE_LOADED = True


def _get_openai_client():
    _load_env_file_if_needed()
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise AIServiceError("OPENAI_API_KEY is not configured on the backend.", status_code=503)
    if OpenAI is None:
        raise AIServiceError("OpenAI SDK is not installed on the backend.", status_code=503)
    return OpenAI(api_key=api_key)


def _get_model_name() -> str:
    return os.getenv("OPENAI_MODEL", "gpt-4.1-mini").strip() or "gpt-4.1-mini"


def _get_vision_model_name() -> str:
    return os.getenv("OPENAI_VISION_MODEL", _get_model_name()).strip() or _get_model_name()


# ── Gemini (사진 코칭 폴링 / 촬영후 To-do 일치 판정) — OpenAI 호환 엔드포인트 ──
# 라이브 폴링은 flash-lite(저가), 촬영 후 판정은 flash(정확). RAG·vision-label·STT·TTS 등
# 기존 Responses 경로는 _get_openai_client 를 그대로 써서 OpenAI 유지 — 여기서만 분기.
GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"
UPSTAGE_BASE_URL = "https://api.upstage.ai/v1/solar"
LLM_COMPARE_MODEL_SPECS = (
    {"selected_model": "solar-pro-3", "request_model": "solar-pro3-260323", "provider": "upstage"},
    {"selected_model": "gpt-4.1-nano", "request_model": "gpt-4.1-nano", "provider": "openai"},
    {"selected_model": "gemini-2.5-flash-lite", "request_model": "gemini-2.5-flash-lite", "provider": "gemini"},
)
LLM_COMPARE_CSV_HEADERS = [
    "compare_group_id",
    "request_id",
    "menu_key",
    "input_text",
    "selected_model",
    "used_model",
    "output_text",
    "latency_ms",
    "prompt_tokens",
    "completion_tokens",
    "total_tokens",
    "error",
    "selected",
    "memo",
    "created_at",
]
LLM_COMPARE_SELECTION_CSV_HEADERS = [
    "compare_group_id",
    "request_id",
    "selected",
    "memo",
    "created_at",
]


def _gemini_client():
    _load_env_file_if_needed()
    key = os.getenv("GEMINI_API_KEY", "").strip()
    if not key:
        raise AIServiceError("GEMINI_API_KEY is not configured on the backend.", status_code=503)
    if OpenAI is None:
        raise AIServiceError("OpenAI SDK is not installed on the backend.", status_code=503)
    base_url = os.getenv("GEMINI_BASE_URL", GEMINI_BASE_URL).strip() or GEMINI_BASE_URL
    return OpenAI(api_key=key, base_url=base_url)


def _upstage_client():
    _load_env_file_if_needed()
    key = os.getenv("UPSTAGE_API_KEY", "").strip()
    if not key:
        raise AIServiceError("UPSTAGE_API_KEY is not configured on the backend.", status_code=503)
    if OpenAI is None:
        raise AIServiceError("OpenAI SDK is not installed on the backend.", status_code=503)
    base_url = os.getenv("UPSTAGE_BASE_URL", UPSTAGE_BASE_URL).strip() or UPSTAGE_BASE_URL
    return OpenAI(api_key=key, base_url=base_url)


def _llm_compare_data_dir() -> Path:
    path = os.getenv("LLM_COMPARE_OUTPUT_DIR", "").strip()
    if path:
        return Path(path)
    return Path(__file__).resolve().parents[2] / "data" / "llm_compare"


def _llm_compare_enabled() -> bool:
    _load_env_file_if_needed()
    return (
        os.getenv("LLM_COMPARE_ENABLED", "").strip().lower() == "true"
        or os.getenv("NEXT_PUBLIC_LLM_TEST_MODE", "").strip().lower() == "true"
    )


def _append_csv_row(path: Path, headers: list[str], row: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    write_header = not path.exists()
    with path.open("a", newline="", encoding="utf-8") as fp:
        writer = csv.DictWriter(fp, fieldnames=headers)
        if write_header:
            writer.writeheader()
        writer.writerow({key: row.get(key, "") for key in headers})


def _usage_value(usage: Any, *names: str) -> int:
    if not usage:
        return 0
    for name in names:
        value = getattr(usage, name, None)
        if value is None and isinstance(usage, dict):
            value = usage.get(name)
        if value is not None:
            try:
                return int(value)
            except (TypeError, ValueError):
                return 0
    return 0


def _extract_chat_completion_text(response: Any) -> str:
    choices = getattr(response, "choices", None) or []
    if not choices:
        return ""
    message = getattr(choices[0], "message", None)
    content = getattr(message, "content", "") if message is not None else ""
    return str(content or "").strip()


def _compare_client_for_provider(provider: str):
    if provider == "gemini":
        return _gemini_client()
    if provider == "upstage":
        return _upstage_client()
    return _get_openai_client()


def _build_llm_compare_messages(payload: AILLMCompareRequest) -> list[dict[str, str]]:
    format_hint = "한 문단의 자연스러운 한국어 텍스트"
    if payload.output_format.strip().lower() == "json":
        format_hint = "JSON 객체"
    system_prompt = (
        "너는 저탄소 농업 서비스 Locaville의 UX 문구 비교 실험용 모델이다. "
        "60-80대 농업인과 이장님이 바로 이해할 수 있게 짧고 구체적으로 답한다. "
        "과장하지 말고, 사용자가 바로 할 수 있는 행동이 드러나게 쓴다."
    )
    user_prompt = (
        f"메뉴 키: {payload.menu_key}\n"
        f"출력 형식: {format_hint}\n"
        f"최대 글자 수: {payload.max_chars}자\n"
        f"맥락: {payload.context or '없음'}\n\n"
        f"입력:\n{payload.input_text}\n\n"
        "위 입력을 서비스 화면에 넣을 최종 문구로 다듬어줘."
    )
    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]


def _run_llm_compare_one(
    *,
    payload: AILLMCompareRequest,
    compare_group_id: str,
    spec: dict[str, str],
) -> AILLMCompareResult:
    selected_model = spec["selected_model"]
    request_model = spec["request_model"]
    provider = spec["provider"]
    request_id = f"{compare_group_id}-{selected_model}"
    started = time.perf_counter()
    try:
        client = _compare_client_for_provider(provider)
        response = client.chat.completions.create(
            model=request_model,
            messages=_build_llm_compare_messages(payload),
            temperature=0.2,
            max_tokens=max(64, min(1200, payload.max_chars * 3)),
        )
        latency_ms = int((time.perf_counter() - started) * 1000)
        usage = getattr(response, "usage", None)
        prompt_tokens = _usage_value(usage, "prompt_tokens", "input_tokens")
        completion_tokens = _usage_value(usage, "completion_tokens", "output_tokens")
        total_tokens = _usage_value(usage, "total_tokens")
        if not total_tokens:
            total_tokens = prompt_tokens + completion_tokens
        used_model = str(getattr(response, "model", "") or request_model)
        return AILLMCompareResult(
            request_id=request_id,
            selected_model=selected_model,
            used_model=used_model,
            output_text=_extract_chat_completion_text(response),
            latency_ms=latency_ms,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total_tokens,
            error=None,
        )
    except Exception as exc:  # noqa: BLE001
        latency_ms = int((time.perf_counter() - started) * 1000)
        return AILLMCompareResult(
            request_id=request_id,
            selected_model=selected_model,
            used_model=request_model,
            output_text="",
            latency_ms=latency_ms,
            prompt_tokens=0,
            completion_tokens=0,
            total_tokens=0,
            error=str(exc),
        )


def compare_llm_outputs(payload: AILLMCompareRequest) -> AILLMCompareResponse:
    if not _llm_compare_enabled():
        raise AIServiceError("LLM compare mode is disabled on this backend.", status_code=403)
    compare_group_id = f"llmcmp-{datetime.now().strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:8]}"
    results = [
        _run_llm_compare_one(payload=payload, compare_group_id=compare_group_id, spec=spec)
        for spec in LLM_COMPARE_MODEL_SPECS
    ]
    created_at = datetime.now().isoformat(timespec="seconds")
    csv_path = _llm_compare_data_dir() / "llm_compare_results.csv"
    for result in results:
        _append_csv_row(
            csv_path,
            LLM_COMPARE_CSV_HEADERS,
            {
                "compare_group_id": compare_group_id,
                "request_id": result.request_id,
                "menu_key": payload.menu_key,
                "input_text": payload.input_text,
                "selected_model": result.selected_model,
                "used_model": result.used_model,
                "output_text": result.output_text,
                "latency_ms": result.latency_ms,
                "prompt_tokens": result.prompt_tokens,
                "completion_tokens": result.completion_tokens,
                "total_tokens": result.total_tokens,
                "error": result.error or "",
                "selected": "",
                "memo": "",
                "created_at": created_at,
            },
        )
    return AILLMCompareResponse(
        compare_group_id=compare_group_id,
        menu_key=payload.menu_key,
        input_text=payload.input_text,
        results=results,
    )


def save_llm_compare_selection(
    payload: AILLMCompareSelectionRequest,
) -> AILLMCompareSelectionResponse:
    if not _llm_compare_enabled():
        raise AIServiceError("LLM compare mode is disabled on this backend.", status_code=403)
    _append_csv_row(
        _llm_compare_data_dir() / "llm_compare_selections.csv",
        LLM_COMPARE_SELECTION_CSV_HEADERS,
        {
            "compare_group_id": payload.compare_group_id,
            "request_id": payload.request_id,
            "selected": payload.selected,
            "memo": payload.memo,
            "created_at": datetime.now().isoformat(timespec="seconds"),
        },
    )
    return AILLMCompareSelectionResponse(
        compare_group_id=payload.compare_group_id,
        request_id=payload.request_id,
        selected=payload.selected,
        memo=payload.memo,
    )


def _get_coach_client_and_model() -> tuple[Any, str, str]:
    """라이브 코칭 폴링용 (client, model, provider). 기본 gemini-2.5-flash-lite.

    GEMINI_API_KEY 가 없으면 OpenAI vision 모델로 폴백(키 없는 개발 환경 안전)."""
    _load_env_file_if_needed()
    model = os.getenv("COACH_POLL_MODEL", "gemini-2.5-flash-lite").strip() or "gemini-2.5-flash-lite"
    provider = (
        os.getenv("COACH_POLL_PROVIDER", "").strip()
        or ("gemini" if model.startswith("gemini") else "openai")
    )
    if provider == "gemini" and os.getenv("GEMINI_API_KEY", "").strip():
        return _gemini_client(), model, "gemini"
    return _get_openai_client(), _get_vision_model_name(), "openai"


def _get_verdict_client_and_model() -> tuple[Any, str, str]:
    """촬영 후 To-do 일치 판정용 (client, model, provider). 기본 gemini-2.5-flash."""
    _load_env_file_if_needed()
    model = os.getenv("TODO_MATCH_MODEL", "gemini-2.5-flash").strip() or "gemini-2.5-flash"
    provider = (
        os.getenv("TODO_MATCH_PROVIDER", "").strip()
        or ("gemini" if model.startswith("gemini") else "openai")
    )
    if provider == "gemini" and os.getenv("GEMINI_API_KEY", "").strip():
        return _gemini_client(), model, "gemini"
    return _get_openai_client(), _get_vision_model_name(), "openai"


def _get_advice_client_and_model() -> tuple[Any, str, str]:
    """오늘 농사 한마디(카드/알림 문구)용 (client, model, provider). 기본 solar-pro-3.

    Solar Pro 3 가 짧고 압박감 있는 알림 문구에 강해 카드/알림 경로에만 분기.
    UPSTAGE_API_KEY 가 없으면 OpenAI 텍스트 모델로 폴백(키 없는 개발 환경 안전)."""
    _load_env_file_if_needed()
    model = os.getenv("ADVICE_MODEL", "solar-pro3-260323").strip() or "solar-pro3-260323"
    provider = (
        os.getenv("ADVICE_PROVIDER", "").strip()
        or ("upstage" if model.startswith("solar") else "openai")
    )
    if provider == "upstage" and os.getenv("UPSTAGE_API_KEY", "").strip():
        return _upstage_client(), model, "upstage"
    return _get_openai_client(), _get_model_name(), "openai"


def _get_today_word_client_and_model() -> tuple[Any, str, str]:
    """오늘 농사 한마디 본문 생성용 (client, model, provider). 기본 gpt-4.1-nano (OpenAI).

    카드·알림 문구용 _get_advice_client_and_model(Solar Pro 3) 와 분리한 경로 —
    한마디 본문은 nano 로 생성. OPENAI_API_KEY 없으면 호출부에서 룰 fallback."""
    _load_env_file_if_needed()
    model = os.getenv("TODAY_WORD_MODEL", "gpt-4.1-nano").strip() or "gpt-4.1-nano"
    return _get_openai_client(), model, "openai"


def _run_text_response(*, system_prompt: str, user_prompt: str, model: str | None = None) -> str:
    client = _get_openai_client()
    try:
        response = client.responses.create(
            model=(str(model or "").strip() or _get_model_name()),
            input=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        )
        text = (getattr(response, "output_text", "") or "").strip()
        if not text:
            raise AIServiceError("OpenAI returned an empty response.", status_code=502)
        return text
    except AIServiceError:
        raise
    except Exception as exc:  # noqa: BLE001
        raise AIServiceError("OpenAI request failed on the backend.", status_code=502) from exc


def stream_text_response_messages(
    *,
    system_prompt: str,
    messages: list[dict[str, str]],
    final_user_addendum: str = "",
):
    """Streaming variant of `_run_text_response_messages` — yields raw token chunks.

    OpenAI Responses API 의 `stream=True` 사용. 각 chunk 는 text delta (str).
    호출자가 SSE/StreamingResponse 로 frontend 에 전달.
    """
    client = _get_openai_client()
    payload: list[dict[str, str]] = [{"role": "system", "content": system_prompt}]
    last_user_idx = -1
    if messages:
        for i in range(len(messages) - 1, -1, -1):
            if (messages[i].get("role") or "") == "user":
                last_user_idx = i
                break
        for i, m in enumerate(messages):
            role = (m.get("role") or "").strip()
            if role not in ("user", "assistant"):
                continue
            content = (m.get("content") or "").strip()
            if i == last_user_idx and final_user_addendum:
                content = f"{content}\n\n{final_user_addendum}"
            payload.append({"role": role, "content": content})
    elif final_user_addendum:
        payload.append({"role": "user", "content": final_user_addendum})

    try:
        with client.responses.stream(model=_get_model_name(), input=payload) as stream:
            for event in stream:
                # responses.stream 의 event 종류 — ResponseTextDeltaEvent 에 .delta 가 토큰 텍스트
                delta = getattr(event, "delta", None)
                if isinstance(delta, str) and delta:
                    yield delta
    except Exception as exc:  # noqa: BLE001
        raise AIServiceError("OpenAI stream failed on the backend.", status_code=502) from exc


def _run_text_response_messages(
    *,
    system_prompt: str,
    messages: list[dict[str, str]],
    final_user_addendum: str = "",
) -> str:
    """Multi-turn: system + 기존 대화 thread + (마지막 user 에 snippet 등 보충) 한 번에 전달.

    `messages` 는 user / assistant 가 번갈아 나오는 history. `final_user_addendum` 이 있으면
    마지막 user 메시지 뒤에 덧붙여 (예: RAG 근거) 같은 turn 안에 보냄.
    """
    client = _get_openai_client()
    # input 조립
    payload: list[dict[str, str]] = [{"role": "system", "content": system_prompt}]
    if not messages:
        return _run_text_response(system_prompt=system_prompt, user_prompt=final_user_addendum)
    # 마지막 user 메시지에 addendum 합치기
    last_user_idx = -1
    for i in range(len(messages) - 1, -1, -1):
        if (messages[i].get("role") or "") == "user":
            last_user_idx = i
            break
    for i, m in enumerate(messages):
        role = (m.get("role") or "").strip()
        if role not in ("user", "assistant"):
            continue
        content = (m.get("content") or "").strip()
        if i == last_user_idx and final_user_addendum:
            content = f"{content}\n\n{final_user_addendum}"
        payload.append({"role": role, "content": content})

    try:
        response = client.responses.create(model=_get_model_name(), input=payload)
        text = (getattr(response, "output_text", "") or "").strip()
        if not text:
            raise AIServiceError("OpenAI returned an empty response.", status_code=502)
        return text
    except AIServiceError:
        raise
    except Exception as exc:  # noqa: BLE001
        raise AIServiceError("OpenAI request failed on the backend.", status_code=502) from exc


def _extract_first_json_object(text: str) -> dict[str, Any]:
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end < start:
        raise ValueError("JSON object not found in model output")
    parsed = json.loads(text[start : end + 1])
    if not isinstance(parsed, dict):
        raise ValueError("Parsed JSON is not an object")
    return parsed


def _amount_to_int(value: Any) -> int | None:
    """'30,000원' / '30000' / 30000 등을 정수로. 실패 시 None."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        try:
            return int(value)
        except Exception:
            return None
    digits = re.sub(r"[^\d]", "", str(value))
    return int(digits) if digits else None


def _mime_for_extension(extension: str) -> str:
    ext = (extension or "").lower().lstrip(".")
    if ext == "png":
        return "image/png"
    if ext == "webp":
        return "image/webp"
    return "image/jpeg"


# 영수증 OCR 텍스트에서 저탄소 활동 코드를 추론하기 위한 키워드 매핑.
# 코드값은 v0_chief/lib/activities.ts ActivityCode 와 동일해야 대시보드/리포트와 정합.
# 위쪽이 우선순위가 높다 — 같은 영수증에 여러 키워드가 섞여 있어도 위쪽이 먼저 매칭됨.
#
# 키워드는 **specific** 해야 한다. "탄소"(저탄소 인증·탄소중립 마크), "숯"(숯불·활성탄),
# "탄화"(탄화수소), "토양개량제"(광의 분류 — 석회·규산질 비료 포함) 같은 폭넓은 단어는
# 일반 영수증에 흔히 등장해 false positive 의 원인이 되므로 사용 금지.
_RECEIPT_ACTIVITY_KEYWORDS: list[tuple[str, str, list[str]]] = [
    # (activity_code, korean_label, keywords)
    ("BIOCHAR", "바이오차 투입", ["바이오차", "바이오 차", "biochar", "왕겨숯", "탄화왕겨"]),
    (
        "WASTE",
        "영농폐기물 처리",
        ["폐비닐", "폐농약병", "농약병", "영농폐기물", "영농 폐기물", "폐기물 수거", "수거장"],
    ),
    (
        "FALL_TILLAGE",
        "가을 경운",
        ["경운", "트랙터 작업", "갈아엎", "쟁기"],
    ),
    # SHALLOW/WATER_DN 은 영수증 발생이 드물지만 자재(논물 조절 자재) 명세가 잡힐 수 있어 포함.
    ("WATER_DN", "중간 물떼기", ["중간 물떼기", "중간물떼기", "물떼기"]),
    ("SHALLOW", "논물 얕게 걸러대기", ["얕게 걸러", "얕게 대기"]),
]


def _infer_activity_from_receipt(
    receipt: dict[str, Any] | None,
    user_message: str = "",
    activity_type_hint: str = "",
) -> dict[str, Any]:
    """영수증 OCR 결과(vendor/items)에서 저탄소 활동 코드를 추론한다.

    매칭 규칙은 rule-based (OpenAI 추가 호출 없음). 추론 실패 시 빈 결과를 안전 반환.

    Returns:
      {
        "suggested_activity_type": "BIOCHAR" | "" (매칭 없음 시 빈 문자열),
        "suggested_evidence_type": "BIOCHAR_INVOICE" | "" (영수증은 항상 INVOICE 계열로 기본 매핑),
        "suggested_reason": "영수증 품목에 '바이오차' 키워드 포함" | "...",
        "suggested_confidence": 0.0~1.0,
        "suggested_activity_label": "바이오차 투입" | "",
      }
    """
    result = {
        "suggested_activity_type": "",
        "suggested_evidence_type": "",
        "suggested_reason": "",
        "suggested_confidence": 0.0,
        "suggested_activity_label": "",
    }
    candidates: list[str] = []
    if receipt and isinstance(receipt, dict):
        vendor = str(receipt.get("vendor") or "").strip()
        if vendor:
            candidates.append(vendor)
        items = receipt.get("items") or []
        if isinstance(items, list):
            candidates.extend(str(x) for x in items if x)
    if user_message:
        candidates.append(str(user_message))
    if activity_type_hint:
        candidates.append(str(activity_type_hint))

    if not candidates:
        return result

    haystack = " ".join(candidates).lower()
    for code, label, keywords in _RECEIPT_ACTIVITY_KEYWORDS:
        matched = [k for k in keywords if k.lower() in haystack]
        if not matched:
            continue
        # 매칭된 키워드 개수에 따라 confidence 가중치.
        # 1개만 매칭된 경우는 BIOCHAR 같은 false positive 위험이 높으므로 보수적으로 낮게.
        if len(matched) >= 3:
            confidence = 0.85
        elif len(matched) == 2:
            confidence = 0.65
        else:
            confidence = 0.45
        # 활동 힌트가 일치하면 confidence 추가 가산.
        if activity_type_hint and label in activity_type_hint:
            confidence = min(0.95, confidence + 0.1)

        # 영수증의 기본 증빙 유형 — 현 시드에서 영수증은 BIOCHAR_INVOICE 만 정식 코드.
        # 다른 활동(WASTE/FALL_TILLAGE 등) 은 별도 영수증 코드가 없어 빈 문자열로 두고
        # 프론트가 사용자에게 확정을 요청한다.
        # low-confidence (1개 매칭만) 인 경우엔 evidence_type 도 자동 매핑 안 함 — 사용자가 직접 골라야 안전.
        if confidence < 0.55:
            evidence_type = ""
        else:
            evidence_type = "BIOCHAR_INVOICE" if code == "BIOCHAR" else ""

        joined = ", ".join(matched[:3])
        if confidence < 0.55:
            reason = (
                f"영수증에 '{joined}' 단어가 보이긴 하는데 확신이 어려워요. "
                f"실제 활동이 '{label}' 이 맞는지 확인해 주세요."
            )
        else:
            reason = f"영수증 정보에 '{joined}' 키워드가 포함되어 있어요."

        result.update(
            {
                "suggested_activity_type": code,
                "suggested_evidence_type": evidence_type,
                "suggested_reason": reason,
                "suggested_confidence": round(confidence, 2),
                "suggested_activity_label": label,
            }
        )
        return result

    # 매칭 키워드 없음 — 영수증이지만 어느 활동인지 판단 어려움.
    result["suggested_reason"] = "영수증으로 인식했지만 어느 활동의 증빙인지 확정하기 어려워요."
    return result


def classify_and_extract_evidence(
    *,
    file_bytes: bytes,
    extension: str = ".jpg",
    activity_type: str = "",
    expected_evidence_types: list[str] | None = None,
) -> dict[str, Any]:
    """업로드된 사진을 영수증(receipt) vs 현장사진(field_photo) 으로 1차 분류하고,
    영수증이면 OpenAI Vision 으로 상호/금액/날짜/품목을 추출한다.

    파일 바이트를 base64 data URL 로 만들어 Vision 에 한 번 호출 — 업로드 직후
    image_url 이 아직 없어도 동작한다.

    안전성:
      - OPENAI_API_KEY 없으면 classification='unknown' 안전 반환 (업로드 막지 않음)
      - 호출/파싱 실패도 모두 흡수해서 'unknown' 반환

    반환 dict:
      classification          : "receipt" | "field_photo" | "unknown"
      confidence              : "low" | "medium" | "high"
      receipt                 : {vendor, amount(int|None), date, items[]} | None
      suggested_evidence_type : 영수증이면 BIOCHAR_INVOICE 등, 사진이면 후보 코드 또는 ""
      user_message            : 농가용 한국어 안내
      source                  : "openai" | "fallback"
    """
    result: dict[str, Any] = {
        "classification": "unknown",
        "confidence": "low",
        "receipt": None,
        "suggested_evidence_type": "",
        # 영수증 OCR → 활동 추천 결과 (rule-based). receipt 분기에서 채워지고, 그 외엔 빈 값.
        "suggested_activity_type": "",
        "suggested_activity_label": "",
        "suggested_reason": "",
        "suggested_confidence": 0.0,
        "user_message": "",
        "source": "fallback",
    }
    if not file_bytes:
        return result
    if not os.getenv("OPENAI_API_KEY", "").strip():
        # 키가 없으면 분류 건너뜀 — 업로드는 정상 진행, 기존 로직 사용.
        return result

    expected = [
        t for t in (expected_evidence_types or [])
        if isinstance(t, str) and t
    ]
    try:
        mime = _mime_for_extension(extension)
        encoded = base64.b64encode(file_bytes).decode("ascii")
        data_url = f"data:{mime};base64,{encoded}"

        system_prompt = (
            "너는 농업 저탄소 사업 증빙 사진 분류기다. 주어진 이미지를 다음 둘 중 하나로 분류하라: "
            "(1) receipt — 영수증/구매내역서/세금계산서/거래명세서 같은 '문서/종이' 증빙. "
            "(2) field_photo — 논·밭·작업 현장이나 농자재를 찍은 '현장 사진'. "
            "영수증이면 상호명(vendor), 총액(amount, 숫자만), 날짜(date, YYYY-MM-DD), 품목(items 배열)을 최대한 추출하라. "
            "반드시 아래 JSON 객체 하나만 출력하라(설명 금지): "
            '{"classification":"receipt|field_photo","confidence":"low|medium|high",'
            '"receipt":{"vendor":"","amount":0,"date":"","items":[]},'
            '"suggested_evidence_type":"","user_message":""}. '
            "field_photo 이면 receipt 는 null 로 두어라."
        )
        hint = f"활동 유형: {activity_type}\n" if activity_type else ""
        if expected:
            hint += f"이 활동에서 기대되는 증빙 유형 코드: {', '.join(expected)}\n"
        user_prompt = (
            f"{hint}이 이미지를 분류하고, 영수증이면 항목을 추출해 JSON 으로만 답하라."
        )

        client = _get_openai_client()
        response = client.responses.create(
            model=_get_vision_model_name(),
            input=[
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": [
                        {"type": "input_text", "text": user_prompt},
                        {"type": "input_image", "image_url": data_url},
                    ],
                },
            ],
        )
        text = (getattr(response, "output_text", "") or "").strip()
        parsed = _extract_first_json_object(text)

        classification = str(parsed.get("classification") or "").strip().lower()
        if classification not in {"receipt", "field_photo"}:
            classification = "field_photo"
        result["classification"] = classification
        result["confidence"] = str(parsed.get("confidence") or "low").strip().lower()
        result["source"] = "openai"
        result["user_message"] = str(parsed.get("user_message") or "")

        if classification == "receipt":
            raw_receipt = parsed.get("receipt") or {}
            if isinstance(raw_receipt, dict):
                items = raw_receipt.get("items") or []
                result["receipt"] = {
                    "vendor": str(raw_receipt.get("vendor") or ""),
                    "amount": _amount_to_int(raw_receipt.get("amount")),
                    "date": str(raw_receipt.get("date") or ""),
                    "items": [str(x) for x in items][:20] if isinstance(items, list) else [],
                }
            # rule-based 로 vendor/items 텍스트에서 활동 코드 추론 → 화면에 "추천" 카드.
            inferred = _infer_activity_from_receipt(
                result["receipt"],
                user_message=str(parsed.get("user_message") or ""),
                activity_type_hint=activity_type,
            )
            result["suggested_activity_type"] = inferred["suggested_activity_type"]
            result["suggested_activity_label"] = inferred["suggested_activity_label"]
            result["suggested_reason"] = inferred["suggested_reason"]
            result["suggested_confidence"] = inferred["suggested_confidence"]
            # 영수증 evidence_type: rule 매칭 우선, Vision 응답 차순위, 둘 다 없으면 빈 문자열
            # (예전엔 항상 BIOCHAR_INVOICE 하드코딩 → 비-바이오차 영수증도 잘못 매핑됐었음).
            result["suggested_evidence_type"] = (
                inferred["suggested_evidence_type"]
                or str(parsed.get("suggested_evidence_type") or "").strip()
            )
        else:
            result["suggested_evidence_type"] = str(
                parsed.get("suggested_evidence_type") or ""
            ).strip()
            result["suggested_activity_type"] = ""
            result["suggested_activity_label"] = ""
            result["suggested_reason"] = ""
            result["suggested_confidence"] = 0.0
        return result
    except Exception:  # noqa: BLE001
        # 분류 실패는 업로드를 막지 않는다 — 안전한 unknown 반환.
        return result


STT_MAX_AUDIO_BYTES = 25 * 1024 * 1024
STT_ALLOWED_EXTENSIONS = {".webm", ".wav", ".mp3", ".m4a"}
DEFAULT_STT_MODEL = "gpt-4o-mini-transcribe"

# ── Google Cloud Text-to-Speech 설정 ──
# Chirp 3 HD (Kore) — 한국어 고품질 음성. 속도 0.9 로 시니어 친화.
GOOGLE_TTS_URL = "https://texttospeech.googleapis.com/v1/text:synthesize"
GOOGLE_TTS_LANGUAGE_CODE = "ko-KR"
GOOGLE_TTS_VOICE = "ko-KR-Chirp3-HD-Kore"
GOOGLE_TTS_SPEAKING_RATE = 0.9


def _stt_fallback_response(message: str = "음성 인식을 완료하지 못했습니다. 직접 입력해 주세요.") -> AISTTResponse:
    return AISTTResponse(text="", source="fallback", error_message=message)


def _tts_fallback_response(message: str = "음성 안내를 생성하지 못했습니다. 기본 음성으로 진행해 주세요.") -> AITTSResponse:
    return AITTSResponse(audio_url="", source="fallback", mime_type="audio/mpeg", error_message=message)


def _get_stt_model_name() -> str:
    return os.getenv("OPENAI_STT_MODEL", DEFAULT_STT_MODEL).strip() or DEFAULT_STT_MODEL


def _get_google_tts_api_key() -> str:
    _load_env_file_if_needed()
    return os.getenv("GOOGLE_TTS_API_KEY", "").strip()


def _validate_audio_upload(filename: str, file_bytes: bytes) -> str:
    extension = Path(filename or "").suffix.lower()
    if extension not in STT_ALLOWED_EXTENSIONS:
        raise AIServiceError("지원하지 않는 음성 파일 형식입니다. webm, wav, mp3, m4a 파일만 업로드해 주세요.", status_code=400)
    if not file_bytes:
        raise AIServiceError("비어 있는 음성 파일은 처리할 수 없습니다.", status_code=400)
    if len(file_bytes) > STT_MAX_AUDIO_BYTES:
        raise AIServiceError("음성 파일이 너무 큽니다. 25MB 이하 파일을 사용해 주세요.", status_code=400)
    return extension


def _build_evidence_guide_message(activity_type: str, missing_evidence_types: list[str]) -> str:
    if not missing_evidence_types:
        return f"{activity_type} 증빙은 현재 기준으로 모두 제출되었습니다. 저장 전에 사진과 작업 내용을 다시 확인해 주세요."
    labels = [display_evidence_type(item) for item in missing_evidence_types]
    if len(labels) == 1:
        return f"{labels[0]} 사진이 아직 필요합니다. 작업이 보이게 밝은 곳에서 한 장 이상 촬영해 주세요."
    joined = ", ".join(labels)
    return f"{activity_type} 관련 증빙이 아직 부족합니다. 다음 항목을 준비해 주세요: {joined}."


def generate_evidence_guide(activity_type: str, missing_evidence_types: list[str]) -> AIEvidenceGuideResponse:
    """누락 증빙 안내 문구 생성. 규칙 기반 메시지를 OpenAI 가 자연스럽게 다듬음.

    OpenAI key 없으면 규칙 기반 그대로 반환 (Hard fail 하지 않음).
    """
    base_message = _build_evidence_guide_message(activity_type, missing_evidence_types)
    if not os.getenv("OPENAI_API_KEY", "").strip():
        _load_env_file_if_needed()
    if not os.getenv("OPENAI_API_KEY", "").strip():
        return AIEvidenceGuideResponse(message=base_message)

    try:
        refined = _run_text_response(
            system_prompt=(
                "너는 농업인에게 쉬운 한국어로 짧은 증빙 안내문을 써주는 도우미다. "
                "반드시 2문장 이하로 답하고, 자동 저장이나 제출 완료를 단정하지 마라."
            ),
            user_prompt=(
                f"활동 유형: {activity_type}\n"
                f"누락 증빙: {json.dumps(missing_evidence_types, ensure_ascii=False)}\n"
                f"기본 안내문: {base_message}"
            ),
        )
        return AIEvidenceGuideResponse(message=refined)
    except AIServiceError:
        return AIEvidenceGuideResponse(message=base_message)


def _light_clean_answer(answer: str) -> str:
    """답변에서 마크다운만 가볍게 제거하고 길이는 보존. 다단계 답변용."""
    text = (answer or "").strip()
    if not text:
        return text
    text = re.sub(r"```[\s\S]*?```", " ", text)
    text = re.sub(r"\*{1,2}", "", text)
    text = re.sub(r"\s{2,}", " ", text)
    return text.strip()


def _compact_human_answer(answer: str) -> str:
    text = (answer or "").strip()
    if not text:
        return text

    # Remove markdown/code-block style output.
    text = re.sub(r"```[\s\S]*?```", " ", text)
    text = re.sub(r"\*{1,2}", "", text)
    text = re.sub(r"^\s*[-?]\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"\s{2,}", " ", text)
    text = re.sub(r"\n{2,}", "\n", text)

    # chat 답변은 system prompt 가 길이 룰을 가지고 있어 자체 조절됨.
    # 후처리는 LLM 출력이 비정상적으로 긴 경우의 안전망 역할만 — 마지막 문장이 잘리지 않도록
    # sentence 단위 cap 만 적용 (글자수 hard-cut 은 한 문장 중간을 자르는 부작용 있음).
    sentence_parts = re.split(r"(?<=[.!?])\s+", text)
    sentence_parts = [part.strip() for part in sentence_parts if part.strip()]
    if len(sentence_parts) > 6:
        text = " ".join(sentence_parts[:6])
    elif sentence_parts:
        text = " ".join(sentence_parts)

    return text.strip()


# ── 날짜 계산 의도 자동 감지 (Phase 2-C+) ──
# 사용자가 채팅에서 "5월 27일 모내기 했어. 중간 물떼기 며칠?" 같이 구체적 날짜를 묻는 경우,
# 일반 chat 보다 정밀한 /ai/policy/calc 흐름으로 자동 라우팅한다.

_CHAT_DATE_PATTERN = re.compile(r"(\d{1,2})\s*월\s*(\d{1,2})\s*일")
# 참조 활동(이미 한 작업) → farmer_context 키 이름
_CHAT_REFERENCE_TASKS: list[tuple[str, list[str]]] = [
    ("모내기 날짜", ["모내기", "모 심", "모심"]),
    ("파종 날짜", ["파종", "씨 뿌"]),
    ("선정 날짜", ["선정", "선정일"]),
    ("수확 날짜", ["수확", "추수"]),
]
# 일정 묻는 대상 활동 (관련 키워드)
_CHAT_TARGET_ACTIVITIES: list[tuple[str, list[str]]] = [
    ("중간 물떼기", ["중간 물떼기", "중간물떼기", "물떼기"]),
    ("논물 얕게 걸러대기", ["논물 얕게", "얕게 걸러"]),
    ("바이오차 투입", ["바이오차 투입", "바이오차"]),
    ("가을 경운", ["가을 경운", "가을갈이"]),
    ("영농폐기물 처리", ["영농폐기물", "영농 폐기물"]),
]
# 일정·날짜 묻는 의도를 시사하는 표현
_CHAT_SCHEDULE_HINTS = ("며칠", "언제", "날짜", "일정", "시작", "종료", "끝", "몇 일")


def _detect_chat_date_calc_intent(question: str) -> tuple[str, dict[str, str]] | None:
    """질문이 'X월 Y일에 ref-task 했어. target-activity 언제?' 패턴인지 감지.

    Returns: (target_activity, farmer_context) 또는 None.
    """
    if not question:
        return None
    # 1) 날짜 추출
    m = _CHAT_DATE_PATTERN.search(question)
    if not m:
        return None
    try:
        month, day = int(m.group(1)), int(m.group(2))
        if not (1 <= month <= 12 and 1 <= day <= 31):
            return None
    except ValueError:
        return None

    # 2) 참조 task(이미 한 작업) 매칭
    ref_key = ""
    for task_key, aliases in _CHAT_REFERENCE_TASKS:
        if any(alias in question for alias in aliases):
            ref_key = task_key
            break
    if not ref_key:
        return None

    # 3) 일정 묻는 의도 확인
    if not any(hint in question for hint in _CHAT_SCHEDULE_HINTS):
        return None

    # 4) 대상 활동 매칭 (참조 task 와 다른 활동이어야 함)
    target_activity = ""
    for activity, aliases in _CHAT_TARGET_ACTIVITIES:
        if any(alias.replace(" ", "") in question.replace(" ", "") for alias in aliases):
            # ref_key 가 이미 이 활동이면 의미 없음 (예: "모내기 모내기 언제")
            if activity in ref_key:
                continue
            target_activity = activity
            break
    if not target_activity:
        return None

    # 5) farmer_context 구성 — 현재 시점 연도 사용
    year = datetime.now().year
    iso_date = f"{year}-{month:02d}-{day:02d}"
    return target_activity, {ref_key: iso_date}


def _split_sentences_for_display(text: str) -> str:
    """RAG / 도움말 답변을 화면 가독성 위해 문장별 빈 줄 (\\n\\n) 로 분리.

    - 한·영 문장 종결 부호 (`.`, `!`, `?`) + 공백 → `\\n\\n` 교체
    - 직전 글자가 숫자/영문이면 약어·소수점 오인 위험 → split 안 함
      (예: "10.5km" "3.14", "U.S.A." 등 보호)
    - 다음 글자가 한글/대문자 시작일 때만 새 문장으로 판단 (lookahead)
    - 이미 줄바꿈 있는 경우는 보존 — `\\n\\n` 가 연속되어도 한 번만 유지

    frontend (v0_chief HelpChat / v0_farmer HelpScreen) 의 메시지 본문이 모두
    `whitespace: pre-wrap` 이라 backend 가 채운 `\\n` 이 그대로 렌더됨.
    """
    if not text:
        return text
    # 1) 종결 부호 + 공백 → 빈 줄 (직전이 숫자/영문이 아닐 때만)
    out = re.sub(r"(?<![0-9A-Za-z])([.!?])\s+(?=[가-힣A-Z])", r"\1\n\n", text)
    # 2) 줄바꿈이 3개 이상 연속이면 2개로 정규화
    out = re.sub(r"\n{3,}", "\n\n", out)
    return out.strip()


def _extract_final_calc_answer(answer: str) -> str:
    """calc 3단계 답변에서 '3. 최종 답변' 부분만 추출. 채팅 UX 용 (1문장~2문장)."""
    if not answer:
        return answer
    # "3. 최종 답변" / "3) 최종 답변" 등 다양한 변형 수용
    m = re.search(r"3[\.\)\s]+최종\s*답변\s*[:\-]?\s*\n?(.+)", answer, re.DOTALL)
    if m:
        final = m.group(1).strip()
        # 중간에 다음 섹션 (4. ...) 으로 잘려있을 수 있음
        final = re.split(r"\n\s*4[\.\)]", final)[0].strip()
        if final:
            return final
    return answer


def _humanize_money(text: str) -> str:
    """답변의 'N천원/ha', 'N천원/㎡' 표기를 한국식 친숙한 만원·원 단위로 변환.

    시행문서는 '150천원/ha' 처럼 천원 단위로 적어 두지만, 농가는 '15만원/ha' 쪽이 직관적.
    LLM 이 천원 표기를 그대로 옮긴 경우의 후처리 — 본문의 면적단위는 보존 (/ha, /㎡, /m2).
    변환 규칙:
      - 끝자리 0 인 N → 'N//10 만원/ha'  (예: 150→15만원, 460→46만원)
      - 끝자리 != 0 인 N → 'N//10 만 N%10 천원/ha'  (예: 364→36만 4천원)
      - 10 미만 N → 변환 안 함 (5천원/㎡ 같은 케이스 보존)
    """
    if not text:
        return text

    def _replace(match: "re.Match[str]") -> str:
        n = int(match.group(1))
        unit = match.group(2).replace(" ", "")
        if n < 10:
            return match.group(0)
        man = n // 10
        thousand = n % 10
        if thousand == 0:
            return f"{man}만원{unit}"
        return f"{man}만 {thousand}천원{unit}"

    return re.sub(r"(\d+)\s*천원\s*(/\s*(?:ha|㎡|m2))", _replace, text)


def _strip_trailing_ellipsis(text: str) -> str:
    """답변 끝의 '...', '…', '..' 같은 미완 표시 제거 (안전망).

    system prompt 가 말줄임표 금지를 명시하지만 LLM 이 못 지킬 때 대비.
    제거 후 마지막에 종결 부호가 없으면 자연스럽게 마침표 추가.
    """
    if not text:
        return text
    cleaned = re.sub(r"\s*[.…]{2,}\s*$", "", text.rstrip())
    cleaned = re.sub(r"\s*…\s*$", "", cleaned)
    if cleaned and not re.search(r"[.!?]$", cleaned):
        cleaned = cleaned + "."
    return cleaned


def _strip_evidence_markers(text: str) -> str:
    """채팅 답변에서 '[근거 N]', '(근거)', '출처: ...' 인용 표시 제거.

    농가가 보는 답변에 RAG 메타 인용이 섞이면 가독성이 떨어진다.
    _strip_position_markers 가 position 만 잘라낸 뒤에 호출되어 잔여 인용을 정리.
    """
    if not text:
        return text
    # 1) "[근거 N]" / "(근거 N)" / "(근거)" 통째로 제거
    text = re.sub(r"\s*[\(\[]\s*근거[\s\d,，~/\-]*[\)\]]", "", text)
    # 2) "근거 N에 따르면", "근거에서는" 같은 부사구 제거 (뒤 문장은 살림)
    text = re.sub(r"근거\s*\d*\s*(에\s*따르면|에서(는)?)\s*", "", text)
    # 3) "출처: ..." 한 줄 전체 제거
    text = re.sub(r"^\s*출처\s*[:：].*$", "", text, flags=re.MULTILINE)
    # 4) 공백·구두점 정리
    text = re.sub(r"\s{2,}", " ", text)
    text = re.sub(r"\s+([.,!?])", r"\1", text)
    return text.strip()


def _strip_position_markers(text: str) -> str:
    """채팅 UX 용으로 답변에서 'position=...' 디버그 마커 제거.

    백엔드 calc/rule endpoint 응답에는 디버그/감사용 position 이 유용하지만,
    농가가 보는 채팅 답변에는 어수선하기만 함. 다양한 변형 흡수:
      - "(position=206/313)"
      - "(position=206~207/313)"
      - "(position: 206)"
      - "(position 206, 207)"
      - "(근거 1, position=15/36)"
      - "(근거 1, position: 206)"
      - "[position=206/313]"
    """
    if not text:
        return text
    # 1) "(근거 N, position=...)" 통째로 제거
    text = re.sub(
        r"\s*[\(\[]\s*근거\s*[\d,，~/\s\-]+[,，]?\s*position[=:\s]*[\d~/,\s\-]+[\)\]]",
        "",
        text,
    )
    # 2) "(position=...)" / "[position=...]" 통째로 제거
    text = re.sub(
        r"\s*[\(\[]\s*position[=:\s]+[\d~/,\s\-]+[\)\]]",
        "",
        text,
    )
    # 3) 괄호 없이 노출된 "position=206/313" 도 제거 (가끔 모델이 괄호 빼고 쓰는 경우)
    text = re.sub(r"\s*[,，]?\s*position[=:\s]+[\d~/,\s\-]+", "", text)
    # 4) 빈 괄호 ("()", "[]") 제거 + 공백 정리
    text = re.sub(r"\s*[\(\[]\s*[\)\]]", "", text)
    text = re.sub(r"\s{2,}", " ", text)
    text = re.sub(r"\s+([.,!?])", r"\1", text)
    return text.strip()


def chat_with_rag(
    question: str = "",
    farmer_id: str = "",
    context: dict[str, str] | None = None,
    messages: list[dict[str, str]] | None = None,
) -> AIChatResponse:
    """``POST /ai/chat`` — RAG 정책 문서 Q&A. Multi-turn 지원.

    - `messages` 가 있으면 그 thread 전체를 LLM context 로 사용 (대화 reference 가능).
      마지막 user 메시지가 retrieve 의 검색어.
    - `messages` 가 없으면 기존 `question` 단일 입력 호환.
    rag_service 가 검색한 청크를 system prompt 컨텍스트로 넣어 OpenAI 답변 생성.
    검색 실패/키 없음 시 ``source_type='fallback'`` 의 안내 답변 반환.

    Phase 1 개선 (2026-05-28):
      - 깨진 한국어 prompt 모두 복원 (이전엔 ASCII '?' 만 가서 모델이 의미 파악 불가)
      - retrieve limit 4 → 8 로 확대 (노트북 답변 prompt 기본 k=8)
      - snippet context 에 path 외에 score/heading_path/position/type 메타 추가
        (LLM 이 어디서 가져온 정보인지 인용 가능)
      - system prompt 를 PoC 노트북 answer_prompt 와 같은 규칙으로 강화
        (근거 안 내용만 사용, 숫자/기간/조건 보존, 모르면 모른다 답하기, position 명시)

    Phase 2-C+ (2026-05-28):
      - 사용자가 'X월 Y일에 모내기 했어. 중간 물떼기 며칠?' 같이 구체적 날짜를 묻는 경우
        자동 감지해서 더 정밀한 ``calculate_policy_date`` 로 내부 라우팅.
        결과의 '3. 최종 답변' 만 추출해 채팅 UX 에 맞게 짧게 응답.
    """
    # multi-turn: messages 가 있으면 마지막 user 메시지를 검색어/question 으로 사용.
    # cap = 마지막 6턴 (input token 비용 제어).
    thread: list[dict[str, str]] = []
    if messages:
        capped = messages[-6:]
        thread = [
            {"role": (m.get("role") or "").strip(), "content": (m.get("content") or "")}
            for m in capped
            if (m.get("role") or "") in ("user", "assistant")
        ]
        for m in reversed(thread):
            if m["role"] == "user" and m["content"].strip():
                question = m["content"].strip()
                break

    # 날짜 계산 의도 감지 — "5월 27일 모내기. 중간 물떼기 언제?" 같은 패턴.
    intent = _detect_chat_date_calc_intent(question)
    if intent is not None:
        target_activity, auto_context = intent
        # 사용자가 명시한 context 가 있으면 우선, 자동 추출 context 는 보충용.
        merged_context = {**auto_context, **(context or {})}
        try:
            calc_response = calculate_policy_date(
                question=question,
                activity=target_activity,
                farmer_context=merged_context,
            )
            # 채팅 UX 에 맞게 3단계 답변 중 '최종 답변' 만 추출 + position 마커 제거.
            final_only = _extract_final_calc_answer(calc_response.answer)
            cleaned = _strip_position_markers(final_only or calc_response.answer)
            return AIChatResponse(
                answer=cleaned,
                source_type=calc_response.source_type,
                used_context=calc_response.used_context,
            )
        except AIServiceError:
            # calc 실패하면 일반 chat 으로 폴백.
            pass

    context = context or {}
    extra_terms = [farmer_id, *(context.values())]
    snippets = retrieve_relevant_snippets(question, extra_terms=extra_terms, limit=8)
    used_context = [AIUsedContext(**item) for item in snippets]

    if not snippets:
        return AIChatResponse(
            answer=(
                "관련 정책 문서를 찾지 못했어요. 질문을 조금 더 구체적으로 다시 해주시거나, "
                "도움말 화면에서 자세한 안내를 확인해 주세요."
            ),
            source_type="fallback",
            used_context=[],
        )

    # snippet context 블록 — LLM 이 인용·신뢰도 판단 가능하도록 메타 풍부화.
    context_blocks: list[str] = []
    for idx, item in enumerate(snippets, start=1):
        meta_parts = [f"[근거 {idx}]"]
        if "score" in item and isinstance(item["score"], (int, float)):
            meta_parts.append(f"score: {item['score']}")
        path = str(item.get("path") or "")
        if path:
            meta_parts.append(f"출처: {path}")
        context_blocks.append("\n".join(meta_parts) + "\n\n" + str(item.get("snippet") or "").strip())
    snippet_text = "\n\n".join(context_blocks)

    rag_system_prompt = (
                "너는 마을 농업기술센터 직원이야. 농민 분이 정책·사업에 대해 물어보면, "
                "어려운 행정 용어 없이 친근한 존댓말로 한 호흡에 답해 드려.\n\n"
                "규칙:\n"
                "(1) 제공된 근거 안의 내용만 사용해. 추측이나 일반 상식으로 채우지 마.\n"
                "(2) 숫자·기간·면적·금액·증빙 회수는 그대로 보존하고, 단위(원/㎡, ha, 회 등)도 정확히 옮겨.\n"
                "    특히 근거에 단가표가 있으면 (예: '중간 물떼기 150천원/ha', '바이오차 364천원/ha') "
                "활동별 단가를 빠짐없이 자연어 문장으로 옮겨 줘. '천원'·'만원' 표기는 그대로 유지.\n"
                "(3) 근거에 없으면 '이 부분은 시행 문서에서 확인이 안 돼요. 담당자에게 문의해 보세요'처럼 솔직히 답해.\n"
                "(4) 행정 용어는 풀어쓰기:\n"
                "    '시범사업' → '이번 사업', '대상자' → '참여하시는 분',\n"
                "    '사업비' → '지원금', '재분배' → '정산해서 나눠드림',\n"
                "    '이행' → '수행', '면적별 단가' → '면적에 따른 단가'.\n"
                "(5) 답변 본문에 '[근거 N]', '(근거 N)', '출처:', 'position=' 같은 인용·메타 표시 절대 쓰지 마.\n"
                "(6) 표나 항목 나열보다는 자연스러운 한 호흡의 문장으로.\n"
                "(7) 따뜻한 존댓말, 3~5문장 내외. 길이보다는 자연스러운 마무리 우선.\n"
                "(8) 답변은 반드시 마침표(.) 또는 종결어미('해요','드려요','됩니다','참고해 주세요' 등)로 끝낼 것. "
                "'...', '…' 같은 말줄임표나 미완 문장으로 절대 끝맺지 마. 글자 수에 못 맞춰도 문장은 끝까지 쓸 것.\n"
                "(9) 각 문장을 별도 줄에 작성해. 한 문장이 끝나면 줄바꿈을 넣어 화면에서 읽기 편하게."
    )
    rag_user_addendum = (
        f"추가 컨텍스트(JSON):\n{json.dumps(context, ensure_ascii=False)}\n\n"
        "문서 근거:\n"
        f"{snippet_text}\n\n"
        "위 근거를 바탕으로 답변해 줘."
    )

    try:
        if thread:
            # multi-turn: 기존 대화 + 마지막 user 메시지에 snippet 보충
            answer = _run_text_response_messages(
                system_prompt=rag_system_prompt,
                messages=thread,
                final_user_addendum=rag_user_addendum,
            )
        else:
            answer = _run_text_response(
                system_prompt=rag_system_prompt,
                user_prompt=f"질문:\n{question}\n\n{rag_user_addendum}",
            )
        answer = _compact_human_answer(answer)
        answer = _strip_position_markers(answer)
        answer = _strip_evidence_markers(answer)
        answer = _humanize_money(answer)
        answer = _strip_trailing_ellipsis(answer)
        # 화면 가독성 — 문장마다 빈 줄 (v0_chief/v0_farmer 도움말 둘 다 적용).
        answer = _split_sentences_for_display(answer)

        return AIChatResponse(answer=answer, source_type="rag", used_context=used_context)
    except AIServiceError as exc:
        if exc.status_code == 503 and "OPENAI_API_KEY" in str(exc):
            raise
        fallback = _compact_human_answer(" ".join(item.snippet for item in used_context[:2]))
        if not fallback:
            fallback = "답변을 생성하는 중에 문제가 있었어요. 잠시 후 다시 시도해 주세요."
        fallback = _split_sentences_for_display(fallback)
        return AIChatResponse(answer=fallback, source_type="fallback", used_context=used_context)


def chat_with_rag_stream(
    question: str = "",
    farmer_id: str = "",
    context: dict[str, str] | None = None,
    messages: list[dict[str, str]] | None = None,
):
    """Streaming variant of `chat_with_rag` — yields SSE-friendly events.

    Yields tuples of (event_name, data_dict). 호출자가 SSE 형식으로 serialize.
    Events:
      - ("token", {"text": "토큰"})  — 토큰 도착 (반복)
      - ("final", {"answer": "후처리된 최종 답변", "source_type": "rag",
                   "used_context": [...]})  — 후처리 끝난 답변 (frontend 가 replace)
      - ("done", {})  — 종료 신호
      - ("error", {"detail": "..."})  — 에러 (mid-stream)
    """
    # multi-turn 정규화 (chat_with_rag 와 같은 로직)
    thread: list[dict[str, str]] = []
    if messages:
        capped = messages[-6:]
        thread = [
            {"role": (m.get("role") or "").strip(), "content": (m.get("content") or "")}
            for m in capped
            if (m.get("role") or "") in ("user", "assistant")
        ]
        for m in reversed(thread):
            if m["role"] == "user" and m["content"].strip():
                question = m["content"].strip()
                break

    context = context or {}
    extra_terms = [farmer_id, *(context.values())]

    try:
        snippets = retrieve_relevant_snippets(question, extra_terms=extra_terms, limit=8)
    except Exception as exc:  # noqa: BLE001
        yield ("error", {"detail": f"RAG 검색 실패: {exc}"})
        yield ("done", {})
        return

    used_context = [AIUsedContext(**item) for item in snippets]

    if not snippets:
        fallback_answer = (
            "관련 정책 문서를 찾지 못했어요. 질문을 조금 더 구체적으로 다시 해주시거나, "
            "도움말 화면에서 자세한 안내를 확인해 주세요."
        )
        yield ("token", {"text": fallback_answer})
        yield ("final", {
            "answer": fallback_answer,
            "source_type": "fallback",
            "used_context": [c.model_dump() for c in []],
        })
        yield ("done", {})
        return

    # snippet context 블록 — 같은 로직
    context_blocks: list[str] = []
    for idx, item in enumerate(snippets, start=1):
        meta_parts = [f"[근거 {idx}]"]
        if "score" in item and isinstance(item["score"], (int, float)):
            meta_parts.append(f"score: {item['score']}")
        path = str(item.get("path") or "")
        if path:
            meta_parts.append(f"출처: {path}")
        context_blocks.append("\n".join(meta_parts) + "\n\n" + str(item.get("snippet") or "").strip())
    snippet_text = "\n\n".join(context_blocks)

    rag_system_prompt = (
        "너는 마을 농업기술센터 직원이야. 농민 분이 정책·사업에 대해 물어보면, "
        "어려운 행정 용어 없이 친근한 존댓말로 한 호흡에 답해 드려.\n\n"
        "규칙:\n"
        "(1) 제공된 근거 안의 내용만 사용해. 추측이나 일반 상식으로 채우지 마.\n"
        "(2) 숫자·금액·단위는 정확히 옮겨.\n"
        "(3) 행정 용어는 쉽게 풀어쓰기.\n"
        "(4) [근거 N], 출처: 같은 메타 표시 절대 쓰지 마.\n"
        "(5) 자연스러운 한국어 존댓말, 3~5문장.\n"
        "(6) 마침표 또는 종결어미로 끝맺기. 말줄임표 X.\n"
        "(7) 각 문장을 별도 줄에 작성. 한 문장 끝나면 빈 줄 한 개."
    )
    rag_user_addendum = (
        f"추가 컨텍스트(JSON):\n{json.dumps(context, ensure_ascii=False)}\n\n"
        "문서 근거:\n"
        f"{snippet_text}\n\n"
        "위 근거를 바탕으로 답변해 줘."
    )

    if not thread:
        thread = [{"role": "user", "content": question}]

    # streaming
    accumulated: list[str] = []
    try:
        for delta in stream_text_response_messages(
            system_prompt=rag_system_prompt,
            messages=thread,
            final_user_addendum=rag_user_addendum,
        ):
            accumulated.append(delta)
            yield ("token", {"text": delta})
    except AIServiceError as exc:
        yield ("error", {"detail": str(exc)})
        yield ("done", {})
        return

    raw_answer = "".join(accumulated)
    # 후처리 — final event 에 깔끔한 버전 한 번 더 전달 (frontend 가 replace).
    final_answer = raw_answer
    final_answer = _compact_human_answer(final_answer)
    final_answer = _strip_position_markers(final_answer)
    final_answer = _strip_evidence_markers(final_answer)
    final_answer = _humanize_money(final_answer)
    final_answer = _strip_trailing_ellipsis(final_answer)
    final_answer = _split_sentences_for_display(final_answer)

    yield ("final", {
        "answer": final_answer,
        "source_type": "rag",
        "used_context": [c.model_dump() for c in used_context],
    })
    yield ("done", {})


def calculate_policy_date(
    *,
    question: str,
    activity: str = "",
    farmer_context: dict[str, str] | None = None,
) -> AIPolicyCalcResponse:
    """``POST /ai/policy/calc`` — 정책 문서 근거로 날짜·기간 계산.

    노트북 `answer_hwpx_calculation_question` 의 calculation_prompt 를 backend 에 이식.
    `chat_with_rag` 와 동일한 retrieval (Chroma → JSON → 마크다운 fallback) 를 쓰지만:
      - 검색 k 를 더 크게 (8 → 12) 가져와 계산 근거 다양성 ↑
      - system prompt 가 날짜 계산 규칙 ("약 한 달=30일", "2주 이상=14일") 명시
      - 응답 형식 강제: "1. 산정 기준 → 2. 날짜 계산 → 3. 최종 답변"

    Args:
      question: 사용자 질문 — 예 "6월 1일 모내기 했는데 중간 물떼기 언제?"
      activity: 관련 활동명 — 검색 단서 ("중간 물떼기")
      farmer_context: 농가별 컨텍스트 — 예 {"모내기 날짜": "2026-06-01"}
    """
    farmer_context = farmer_context or {}
    # 검색에 활동명 + 컨텍스트 값들도 함께 활용
    extra_terms: list[str] = []
    if activity:
        extra_terms.append(activity)
    extra_terms.extend(str(v) for v in farmer_context.values() if v)
    snippets = retrieve_relevant_snippets(question, extra_terms=extra_terms, limit=12)
    used_context = [AIUsedContext(**item) for item in snippets]

    if not snippets:
        return AIPolicyCalcResponse(
            answer=(
                "정책 문서에서 관련 일정 규칙을 찾지 못했어요. "
                "활동명을 정확히 알려주시거나(예: '중간 물떼기'), 담당 기관에 문의해 주세요."
            ),
            source_type="fallback",
            used_context=[],
        )

    # snippet context — chat_with_rag 와 동일 포맷.
    context_blocks: list[str] = []
    for idx, item in enumerate(snippets, start=1):
        meta_parts = [f"[근거 {idx}]"]
        if "score" in item and isinstance(item["score"], (int, float)):
            meta_parts.append(f"score: {item['score']}")
        path = str(item.get("path") or "")
        if path:
            meta_parts.append(f"출처: {path}")
        context_blocks.append("\n".join(meta_parts) + "\n\n" + str(item.get("snippet") or "").strip())
    snippet_text = "\n\n".join(context_blocks)

    try:
        answer = _run_text_response(
            system_prompt=(
                "너는 저탄소 농업 정책 문서를 근거로 일정·날짜를 계산하는 RAG 도우미야. "
                "규칙: "
                "(1) 반드시 제공된 [근거] 안의 업무 규칙만 사용해. 추측·일반 상식 금지. "
                "(2) 사용자가 농가 컨텍스트(예: '모내기 날짜: 2026-06-01')를 제공하면 그 일자를 기준으로 계산해. "
                "(3) 날짜 계산은 양력 달력 기준. "
                "(4) 표현 정규화: '약 한 달 후' → 30일 후, '2주 이상' → 최소 14일, '30일 이내' → 최대 30일, "
                "'한 달 이내' → 30일 이내. "
                "(5) 시작일/종료일이 범위면 가장 빠른 날짜와 가장 늦은 날짜를 함께 산정. "
                "(6) 근거에 없는 업무 규칙은 만들지 마. 모르면 '문서에서 확인되지 않아요'. "
                "(7) 답변 안에 근거 문구와 position 을 함께 표시 (예: '...라고 명시되어 있어요 (position=15/36)'). "
                "(8) 한국어로 간결·명확하게.\n\n"
                "답변 형식 (반드시 이 3단계로 작성):\n"
                "1. 문서에서 추출한 산정 기준\n"
                "2. 날짜 계산\n"
                "3. 최종 답변"
            ),
            user_prompt=(
                f"질문:\n{question}\n\n"
                f"관련 활동: {activity or '(미지정)'}\n\n"
                f"농가 컨텍스트(JSON):\n{json.dumps(farmer_context, ensure_ascii=False)}\n\n"
                "문서 근거:\n"
                f"{snippet_text}\n\n"
                "위 근거에서 산정 로직을 추출한 뒤, 농가 컨텍스트의 일자에 적용해서 답해 줘."
            ),
        )
        # calculation 답변은 3단계 구조라 chat 처럼 첫 3문장만 자르면 안 됨. light cleaning 만 적용.
        answer = _light_clean_answer(answer)
        return AIPolicyCalcResponse(answer=answer, source_type="rag", used_context=used_context)
    except AIServiceError as exc:
        if exc.status_code == 503 and "OPENAI_API_KEY" in str(exc):
            raise
        fallback = _light_clean_answer(" ".join(item.snippet for item in used_context[:2]))
        if not fallback:
            fallback = "일정 계산 중에 문제가 있었어요. 잠시 후 다시 시도해 주세요."
        return AIPolicyCalcResponse(answer=fallback, source_type="fallback", used_context=used_context)


def extract_policy_schedule_rule(
    *,
    task_name: str,
    question: str = "",
) -> AIPolicyRuleResponse:
    """``POST /ai/policy/rule`` — 작업 일정 규칙을 JSON 으로 추출.

    노트북 `extract_work_schedule_rule` 의 schedule_rule_prompt 를 backend 에 이식.
    백엔드가 정책 문서에서 작업별 규칙(시작·종료 조건, 증빙)을 구조화해서 꺼내,
    todo 자동 생성·검증·이장님 화면 등에서 재사용할 수 있게 한다.

    Args:
      task_name: 추출 대상 작업명 — 예 "중간 물떼기", "바이오차 투입"
      question: 자유 형식 추가 요청 (생략 시 task_name 으로 자동 구성)
    """
    final_question = question.strip() or f"{task_name} 작업의 시작일·종료일 규칙과 증빙조건을 추출해줘."
    snippets = retrieve_relevant_snippets(final_question, extra_terms=[task_name], limit=10)
    used_context = [AIUsedContext(**item) for item in snippets]

    if not snippets:
        return AIPolicyRuleResponse(
            rule=None,
            raw_answer="",
            source_type="fallback",
            used_context=[],
        )

    # snippet context — calc 와 동일 포맷.
    context_blocks: list[str] = []
    for idx, item in enumerate(snippets, start=1):
        meta_parts = [f"[근거 {idx}]"]
        if "score" in item and isinstance(item["score"], (int, float)):
            meta_parts.append(f"score: {item['score']}")
        path = str(item.get("path") or "")
        if path:
            meta_parts.append(f"출처: {path}")
        context_blocks.append("\n".join(meta_parts) + "\n\n" + str(item.get("snippet") or "").strip())
    snippet_text = "\n\n".join(context_blocks)

    try:
        raw = _run_text_response(
            system_prompt=(
                "너는 농업 사업지침 문서에서 작업 일정 산정 규칙과 증빙조건을 추출하는 RAG 도우미야. "
                "규칙: "
                "(1) 반드시 제공된 [근거] 안의 내용만 사용해. "
                "(2) 근거에 없는 선행작업·날짜·기간·조건은 만들지 마. "
                "(3) 사용자가 묻는 작업명과 직접 관련된 규칙만 추출해. "
                "(4) 그룹ID 와 작업ID 는 항상 빈 문자열로 둬. "
                "(5) '약 한 달 후' → 30일 후, '2주 이상' → 최소경과일수 14일, '30일 이내' → 최대경과일수 30일로 정규화. "
                "(6) 시작일과 종료일 기준이 서로 다르면 각각 별도로 작성. "
                "(7) 종료일 기준이 본 작업의 시작일이면 기준을 '시작일' 로 작성. "
                "(8) 증빙회수는 근거에 명시된 숫자가 있을 때만 숫자로, 없으면 null. "
                "(9) 증빙방법은 문서에 명시된 증빙 관련 조건을 배열로. "
                "(10) 출처에는 근거의 position 값을 사용. "
                "(11) 답변은 반드시 지정된 JSON 형식만 출력. 설명·마크다운·주석 금지.\n\n"
                "출력 JSON 형식:\n"
                "{\n"
                '  "그룹ID": "",\n'
                '  "작업ID": "",\n'
                '  "작업명": "",\n'
                '  "선행작업": [],\n'
                '  "시작일": {\n'
                '    "기준": "", "전후": "", "경과일수": null,\n'
                '    "최소경과일수": null, "최대경과일수": null,\n'
                '    "근거": "", "출처": ""\n'
                "  },\n"
                '  "종료일": {\n'
                '    "기준": "", "전후": "", "경과일수": null,\n'
                '    "최소경과일수": null, "최대경과일수": null,\n'
                '    "근거": "", "출처": ""\n'
                "  },\n"
                '  "증빙조건": {\n'
                '    "증빙회수": null, "증빙방법": [], "기타": ""\n'
                "  }\n"
                "}"
            ),
            user_prompt=(
                f"추출 대상 작업명:\n{task_name}\n\n"
                f"사용자 요청:\n{final_question}\n\n"
                "문서 근거:\n"
                f"{snippet_text}\n\n"
                "위 근거에서 작업 일정 산정 규칙과 증빙조건을 추출해라. JSON 만 출력."
            ),
        )
        # JSON 만 출력하라고 했지만 가끔 코드블록으로 감싸기도 함 → 안전 파싱.
        parsed: dict[str, Any] = {}
        try:
            parsed = _extract_first_json_object(raw)
        except Exception:  # noqa: BLE001
            parsed = {}

        if not parsed:
            return AIPolicyRuleResponse(
                rule=None,
                raw_answer=raw,
                source_type="rag",
                used_context=used_context,
            )

        # Pydantic 으로 정규화 — 누락 키는 default 로 채워짐.
        # 작업명이 비어 있으면 task_name 으로 채워서 응답 일관성 유지.
        if not parsed.get("작업명"):
            parsed["작업명"] = task_name
        try:
            rule = AIPolicyRuleBody.model_validate(parsed)
        except Exception:  # noqa: BLE001
            return AIPolicyRuleResponse(
                rule=None,
                raw_answer=raw,
                source_type="rag",
                used_context=used_context,
            )
        return AIPolicyRuleResponse(
            rule=rule,
            raw_answer="",
            source_type="rag",
            used_context=used_context,
        )
    except AIServiceError as exc:
        if exc.status_code == 503 and "OPENAI_API_KEY" in str(exc):
            raise
        return AIPolicyRuleResponse(
            rule=None,
            raw_answer="",
            source_type="fallback",
            used_context=used_context,
        )


_STT_FARMING_PROMPT_KO = (
    "한국어 농업 영농일지 음성 기록입니다. 자주 등장하는 단어: "
    "모내기, 파종, 김매기, 물대기, 비료, 거름, 농약, 방제, 소독, 수확, 추수, "
    "바이오차, 중간 물떼기, 논물 얕게 걸러대기, 가을 경운, 영농폐기물 처리, "
    "벼, 고추, 콩, 마늘, 양파, "
    "벼논, 고추밭, 3번 논, 4번 논, 앞 논, 뒷 논, "
    "한 포대, 두 포대, 세 포대, 한 자루, "
    "오전, 오후, 아침, 저녁, 오늘, 어제."
)


# Whisper prompt 가 leak 됐는지 휴리스틱 검사 — 짧은 transcript 가 prompt 의 핵심 명사
# (특히 BIOCHAR 처럼 빈도가 높은 단어)와 거의 일치하면 leak 으로 의심하고 prompt 없이 재시도.
_STT_PROMPT_LEAK_HINTS = ("바이오차 투입", "중간 물떼기를 시작", "한 포대 뿌")


def _looks_like_prompt_leak(text: str) -> bool:
    """transcript 가 prompt 의 특정 문구를 거의 그대로 포함하고 있으면 leak 으로 본다."""
    t = (text or "").strip()
    if not t:
        return False
    return any(hint in t for hint in _STT_PROMPT_LEAK_HINTS)


def _get_stt_prompt(language: str) -> str:
    """언어에 맞는 도메인 어휘 힌트.

    기본 OFF — gpt-4o-transcribe 는 한국어 native 정확도가 높아 prompt 가 short
    발화에서 환각을 유발하는 부작용이 더 큼. ``OPENAI_STT_PROMPT_ENABLED=1`` 일 때만 적용.
    """
    if (language or "").strip().lower().startswith("ko"):
        if os.getenv("OPENAI_STT_PROMPT_ENABLED", "").strip() == "1":
            return _STT_FARMING_PROMPT_KO
    return ""


# transcript 가 들어오면 명백한 도메인 어휘 오인식만 안전하게 교정.
# 너무 공격적이면 무관한 단어까지 바꿔버리니, **분명히 가까운 mishearing 만** 등록.
# (key=잘못 들린 표현, value=올바른 표현) — 둘 다 한국어 정규화 후 substring 비교.
_STT_FUZZY_FIXES: list[tuple[str, str]] = [
    # 바이오차 mishearings (단독 단어 일 때만 — 다른 단어의 부분 매칭 피하려고 패턴 신중)
    ("여차 뿌", "바이오차 뿌"),
    ("여차 투입", "바이오차 투입"),
    ("바이오자", "바이오차"),
    ("바이오 자", "바이오차"),
    ("비요차", "바이오차"),
    ("바이오 차", "바이오차"),  # 띄어쓰기 합치기
    # 중간 물떼기
    ("중간물 떼기", "중간 물떼기"),
    ("중간 물 떼기", "중간 물떼기"),
    # (논물 떼기 변형은 아래 _STT_FUZZY_REGEX_FIXES 의 통합 정규식이 처리)
    # 필지/포대 — 자주 들리는 변형
    ("3번 빌지", "3번 필지"),
    ("3번 미지", "3번 필지"),
    ("3번에 빌지", "3번 필지"),
    ("한 포 대", "한 포대"),
    ("두 포 대", "두 포대"),
]


# 정규식 기반 fuzzy 보정 — 숫자 등 placeholder 가 필요한 패턴용.
# 너무 일반적인 패턴이면 부작용 크니, **농업/필지 컨텍스트가 명백할 때만** 등록.
_STT_FUZZY_REGEX_FIXES: list[tuple[str, str]] = [
    # "N번도 내서" / "N번도 돼서" / "N번도 해서" → "N번 논에서"
    # Whisper 가 "삼번 논에서" 를 자주 이렇게 잘못 들음. 농업 컨텍스트라 거의 무조건 mishearing.
    (r"(\d+번)도\s*(?:내서|돼서|해서)", r"\1 논에서"),
    # "N번 도 내서" — 띄어쓰기 변형
    (r"(\d+번)\s*도\s*(?:내서|돼서|해서)", r"\1 논에서"),
    # "N번 내서" 단독 (조사 누락)
    (r"(\d+번)\s+내서\b", r"\1 논에서"),
    # "N번노래에서" / "N번 노래에서" → "N번 논에서"
    # "논"의 ㄴ 종성이 "에서"와 합쳐져 "노래에서" 로 들리는 패턴. 농업 컨텍스트라 안전.
    (r"(\d+번)\s*노래에서", r"\1 논에서"),
    (r"(\d+번)\s*노래에\b", r"\1 논에"),
    # "N번 노레/노래" (조사 없이 단독) — 다음 단어가 작업 관련일 때만 안전하게.
    (r"(\d+번)\s*노래(?=\s*(?:물|논|밭|에))", r"\1 논"),
    # "N번 노에서" (vowel 누락) → "N번 논에서"
    (r"(\d+번)\s*노에서", r"\1 논에서"),
    # "N번 논애서" (모음 mishearing) → "N번 논에서"
    (r"(\d+번)\s*논애서", r"\1 논에서"),
    # "N번 눈에서" / "N번 눈에" / "N번눈" → "N번 논..." — "논"이 "눈"으로 들리는 흔한 패턴
    # 농업 컨텍스트라 "눈"이 진짜 단어로 등장할 가능성은 거의 없어 안전.
    (r"(\d+번)\s*눈(?=에서|에\b|\s*(?:물|논|밭))", r"\1 논"),
    # "N번 놈" / "N번놈" / "N번놈에서" → "N번 논" — "놈"은 농업 컨텍스트에서 거의 무조건 mishearing
    # word boundary 만으로는 "놈에서" 처럼 한글 조사 뒤를 못 잡아서 lookahead 명시.
    (r"(\d+번)\s*놈(?=에서|에\b|\s|$|[,.\!?])", r"\1 논"),
    # "N번놀" / "N번 놀" → "N번 논" (종성 mishearing — 다음에 농업 키워드 올 때만)
    (r"(\d+번)\s*놀(?=에서|에\b|\s*(?:물|논|밭))", r"\1 논"),

    # ── 논물 떼기 종합 보정 — 흩어진 모든 변형을 한 정규식으로 통합 ──
    # 시작: "눈물" 또는 "논물" (자주 "논"→"눈"으로 들림)
    # 동사 stem: 떼/때/대 (ㄷ/ㄸ 자음 + ㅔ/ㅐ 모음 헷갈림) + 됐/땠/되었/뗐 (과거형) +
    #            뗀/땐/된 (관형형) + 되 (어간만)
    # 어미: 기/게/어/었/네/다/고/면/서/요 (활용 어미)
    #
    # "논물 떼기" / "눈물 대기" / "눈물 떼고" / "눈물 떼면" 같은 모든 변형 처리.
    # 결과는 항상 "논물 떼기" 로 정규화 (활용형 어미는 정보 손실 가능하지만 시연 안정성 우선).
    (
        r"(?:눈|논)물\s*(?:떼|때|대|뗐|땠|됐|되었|뗀|땐|된)(?:기|게|어|었|네|다|고|면|서|요)",
        "논물 떼기",
    ),
    # "되게" / "되기" — "되" 어간 + "게/기" 어미 (다른 변형보다 짧아 별도 처리)
    (r"(?:눈|논)물\s*되(?:게|기)", "논물 떼기"),

    # ── 바이오차 종합 보정 — "바이오차" 의 모든 변형을 한 정규식으로 ──
    # "바이오" + [차/자/챠/짜] / "바이 오" + [...] / "비요" + [차/자] / "바요" + [차/자]
    # 끝에 한글 단어가 안 와야(lookahead) 함 — "바이오자전거" 같은 거 매칭 방지.
    (r"바이\s*오?\s*[차자챠짜](?![가-힣])", "바이오차"),
    (r"비요\s*[차자챠짜](?![가-힣])", "바이오차"),
    (r"바요\s*[차자챠짜](?![가-힣])", "바이오차"),
    # "여차 뿌리/투입" — 명확한 컨텍스트만 (단독 "여차" 는 위험)
    (r"여\s*차\s*(?=뿌리|뿌렸|투입|살포)", "바이오차 "),

    # ── 모내기 종합 보정 ──
    # 모내기 / 모네기 (모음 변형) / 모냉기 (자음 추가) / 못내기 (자음 변형)
    (r"모[내네냉]기", "모내기"),
    (r"못\s*내기", "모내기"),

    # ── 가을 경운 종합 보정 ──
    # 가을/갈/깔 + 경운/경원/경원도/경원지 → "가을 경운"
    # 짧은 "갈경운" 도 흡수.
    (r"(?:가을|갈|깔)\s*경(?:운|원)(?![가-힣])", "가을 경운"),

    # ── 영농폐기물 종합 보정 ──
    # 영농/영놈/영등 + (선택) 띄어쓰기 + 폐 + 기/지/이 + 물
    # "영놈 폐기물" / "영농 폐지물" / "영등 폐이물" 등.
    (r"(?:영농|영놈|영등|영동)\s*폐\s*[기지이]\s*물", "영농폐기물"),

    # ── 중간 물떼기 종합 보정 ──
    # 중간/잠간/장간/잘깐/중감 + 물 + [떼/때/대] + 어미
    (
        r"(?:중간|잠간|장간|잘깐|중감)\s*물\s*(?:떼|때|대|뗐|땠|됐|뗀|땐)(?:기|게|어|었|다|고|면)?",
        "중간 물떼기",
    ),

    # ── 농약 방제 종합 보정 ──
    # 농약/농양 + 방제/방재 (모음 변형) — 정상적 "방재"(disaster prevention) 잘 안 쓰임
    (r"(?:농약|농양)\s*(?:방제|방재|방재해|방저)", "농약 방제"),

    # ── 비료 단독 mishearing ──
    # 비뇨 → 비료 (자주 mishearing). "비료" 자체는 짧아 위험하지만 "비뇨"는 농업과 무관.
    (r"\b비뇨\b", "비료"),
    # "비효" → 비료 (자음 변형)
    (r"(?<![가-힣])비효(?![가-힣])", "비료"),
]


# ── 사투리(방언) → 표준어 best-effort 보정 ──
# 한계: Whisper 가 사투리 발화를 1차로 표준어로 잘못 들으면 사후 보정은 못 잡음.
# 그래서 "사투리 그대로 transcribe 됐을 때만" 보정. 1:1 매핑 명확한 것만 등록.
_STT_DIALECT_FIXES: list[tuple[str, str]] = [
    # 전라도 — "혔/헸" → "했" 은 아래 regex 가 한 번에 처리
    # "그라고" / "그라믄" / "그래갖고"
    ("그라고", "그리고"),
    ("그라믄", "그러면"),
    ("그래갖고", "그래서"),
    ("했당께", "했어"),
    ("했당가", "했어"),
    ("했어라", "했어"),
    # 경상도
    ("쪼매", "조금"),
    ("쪼끔", "조금"),
    ("쪼만큼", "조금"),
    ("어무이", "어머니"),
    # 농사 도메인 사투리
    ("논둑이", "논두렁이"),
    ("논둑에", "논두렁에"),
    # 작업 동사 사투리/방언 변형
    ("뿌려뿟다", "뿌렸다"),
    ("뿌리뿟어", "뿌렸어"),
    ("줘뿟어", "줬어"),
    ("심거놨어", "심었어"),
]


# 사투리 정규식 — 글자 패턴 일반화 (전라도/충청도 "혔" → "했")
_STT_DIALECT_REGEX_FIXES: list[tuple[str, str]] = [
    # "혔X" / "헸X" → "했X" — 전라도/충청도 ㅕ ↔ ㅐ 변형
    # "혔어", "혔다", "혔지", "혔는데", "혔구나" 등 모두 흡수.
    # "혔/헸" 단독은 표준어에 없어 안전.
    (r"(?<![가-힣])[혔헸](?=[가-힣])", "했"),
    # "허네" / "허지" / "허다" → "하네" / "하지" / "한다" — 전라도 ㅏ ↔ ㅓ
    # 다만 "허리", "허기" 같은 정상 단어와 충돌해서 어미만 안전하게 처리.
    (r"(?<![가-힣])허(?=네|지|다|는데|것)", "하"),
    # 경상도 "마이" — 부사 위치(공백·문장 시작)에서만 "많이"
    (r"(?:^|\s)마이(?=\s|$)", " 많이"),
]


def _apply_stt_fuzzy_fixes(text: str) -> str:
    """transcript 에 등록된 안전한 오인식 표현이 있으면 올바른 표현으로 교체.

    적용 순서:
      1) literal mishearing 보정 (_STT_FUZZY_FIXES)
      2) regex mishearing 보정 (_STT_FUZZY_REGEX_FIXES) — 활동·필지 변형
      3) 사투리 literal 보정 (_STT_DIALECT_FIXES)
      4) 사투리 regex 보정 (_STT_DIALECT_REGEX_FIXES)
    """
    fixed = text
    for wrong, right in _STT_FUZZY_FIXES:
        if wrong in fixed:
            fixed = fixed.replace(wrong, right)
    for pattern, replacement in _STT_FUZZY_REGEX_FIXES:
        fixed = re.sub(pattern, replacement, fixed)
    for wrong, right in _STT_DIALECT_FIXES:
        if wrong in fixed:
            fixed = fixed.replace(wrong, right)
    for pattern, replacement in _STT_DIALECT_REGEX_FIXES:
        fixed = re.sub(pattern, replacement, fixed)
    return fixed


# ── Returnzero (RTZR/Vito) — 한국어 STT 분기 ──
# 기본 STT 공급자 — 한국어 농촌 도메인 인식률이 좋아 STT_PROVIDER 미설정 시 기본값으로 사용.
# 자격증명(RETURNZERO_CLIENT_ID/SECRET) 미설정 시 OpenAI Whisper 로 안전 폴백.
_RETURNZERO_BASE = "https://openapi.vito.ai"
_RETURNZERO_TOKEN_CACHE: dict[str, Any] = {"token": "", "expires_at": 0.0}


def _get_returnzero_credentials() -> tuple[str, str]:
    _load_env_file_if_needed()
    cid = os.getenv("RETURNZERO_CLIENT_ID", "").strip()
    secret = os.getenv("RETURNZERO_CLIENT_SECRET", "").strip()
    return cid, secret


def _get_returnzero_token() -> str:
    """access_token 받기 — expires_at 까지 모듈 레벨 캐시."""
    import time as _time
    cached = _RETURNZERO_TOKEN_CACHE.get("token", "")
    expires_at = float(_RETURNZERO_TOKEN_CACHE.get("expires_at") or 0.0)
    if cached and _time.time() < expires_at - 30:
        return cached
    cid, secret = _get_returnzero_credentials()
    if not cid or not secret:
        return ""
    try:
        import httpx
        with httpx.Client(timeout=10.0) as client:
            resp = client.post(
                f"{_RETURNZERO_BASE}/v1/authenticate",
                data={"client_id": cid, "client_secret": secret},
            )
        if resp.status_code != 200:
            return ""
        payload = resp.json()
        token = str(payload.get("access_token") or "").strip()
        exp = payload.get("expires_at")
        try:
            expires_at = float(exp) if exp is not None else _time.time() + 21600
        except (TypeError, ValueError):
            expires_at = _time.time() + 21600
        _RETURNZERO_TOKEN_CACHE["token"] = token
        _RETURNZERO_TOKEN_CACHE["expires_at"] = expires_at
        return token
    except Exception:  # noqa: BLE001
        return ""


def _transcribe_with_returnzero(*, file_bytes: bytes, filename: str, language: str = "ko") -> AISTTResponse:
    """Returnzero 음성 인식 — submit + polling."""
    import time as _time
    token = _get_returnzero_token()
    if not token:
        return _stt_fallback_response("Returnzero 인증에 실패했어요. 잠시 후 다시 시도해 주세요.")
    mime = mimetypes.guess_type(filename)[0] or "application/octet-stream"
    config = {
        "model_name": "sommers",
        "language": (language or "ko").strip() or "ko",
        "domain": "GENERAL",
    }
    try:
        import httpx
        with httpx.Client(timeout=60.0) as client:
            resp = client.post(
                f"{_RETURNZERO_BASE}/v1/transcribe",
                headers={"Authorization": f"bearer {token}"},
                files={"file": (filename, file_bytes, mime)},
                data={"config": json.dumps(config)},
            )
            if resp.status_code not in (200, 201):
                return _stt_fallback_response("Returnzero 전송이 실패했어요.")
            transcribe_id = str(resp.json().get("id") or "").strip()
            if not transcribe_id:
                return _stt_fallback_response("Returnzero 응답을 이해하지 못했어요.")
            # polling — 최대 ~45s
            text = ""
            for _ in range(30):
                _time.sleep(1.5)
                poll = client.get(
                    f"{_RETURNZERO_BASE}/v1/transcribe/{transcribe_id}",
                    headers={"Authorization": f"bearer {token}"},
                )
                if poll.status_code != 200:
                    continue
                body = poll.json()
                status = str(body.get("status") or "").lower()
                if status == "completed":
                    utterances = (body.get("results") or {}).get("utterances") or []
                    text = " ".join(
                        str(u.get("msg") or "").strip() for u in utterances if u.get("msg")
                    ).strip()
                    break
                if status in {"failed", "error"}:
                    return _stt_fallback_response("Returnzero 변환이 실패했어요.")
        if not text:
            return _stt_fallback_response()
        # 사투리/오인식 보정은 OpenAI 흐름과 동일 적용.
        text = _apply_stt_fuzzy_fixes(text)
        return AISTTResponse(text=text, source="returnzero_stt", error_message="")
    except Exception:  # noqa: BLE001
        return _stt_fallback_response()


def transcribe_audio_file(*, file_bytes: bytes, filename: str, language: str = "ko") -> AISTTResponse:
    """``POST /ai/stt`` — 오디오 → 텍스트.

    기본 Returnzero(RTZR/Vito, ``sommers`` 모델). ``STT_PROVIDER=openai`` 면 OpenAI Whisper.
    Whisper 의 ``prompt`` 로 농업·저탄소 어휘 hint → 도메인 단어 인식률 ↑.

    실패 시 ``source='fallback'`` + ``error_message`` 로 응답해 프론트가 브라우저
    Web Speech API 로 자동 폴백 가능. 지원 확장자/용량 제한은 라우터에서 검증.
    """
    _validate_audio_upload(filename, file_bytes)
    provider = (os.getenv("STT_PROVIDER", "").strip().lower() or "returnzero")
    if provider == "returnzero":
        cid, secret = _get_returnzero_credentials()
        if cid and secret:
            return _transcribe_with_returnzero(file_bytes=file_bytes, filename=filename, language=language)
        # 키 미설정 → OpenAI 폴백
    if not os.getenv("OPENAI_API_KEY", "").strip():
        _load_env_file_if_needed()
    if not os.getenv("OPENAI_API_KEY", "").strip():
        return _stt_fallback_response()

    client = _get_openai_client()
    lang_norm = (language or "ko").strip() or "ko"
    stt_prompt = _get_stt_prompt(lang_norm)
    mime = mimetypes.guess_type(filename)[0] or "application/octet-stream"
    base_kwargs: dict[str, Any] = {
        "model": _get_stt_model_name(),
        "language": lang_norm,
        "response_format": "text",
        # temperature=0 으로 디코딩을 결정적으로 — 모델이 prompt 패턴으로 sampling 하는 것을 줄임.
        "temperature": 0,
    }

    def _transcribe(use_prompt: bool) -> str:
        kwargs = dict(base_kwargs)
        kwargs["file"] = (filename, file_bytes, mime)
        if use_prompt and stt_prompt:
            kwargs["prompt"] = stt_prompt
        transcript = client.audio.transcriptions.create(**kwargs)
        return str(transcript or "").strip()

    try:
        text = _transcribe(use_prompt=True)
        # 짧은/잡음 발화에서 prompt 가 leak 된 흔적이 보이면 prompt 없이 재시도.
        # 두 번째 호출은 도메인 힌트 없이 — 환각 가능성을 낮춤. 두 비용 합쳐도 ~$0.012/분.
        if _looks_like_prompt_leak(text):
            try:
                retry_text = _transcribe(use_prompt=False)
                if retry_text and not _looks_like_prompt_leak(retry_text):
                    text = retry_text
            except Exception:  # noqa: BLE001
                # 재시도 실패 시 첫 결과 그대로 사용.
                pass
        # 등록된 안전한 오인식 표현만 자동 교정 (예: '여차 뿌' → '바이오차 뿌').
        text = _apply_stt_fuzzy_fixes(text)
        if not text:
            return _stt_fallback_response()
        return AISTTResponse(text=text, source="openai_stt", error_message="")
    except AIServiceError:
        raise
    except Exception:
        return _stt_fallback_response()


def synthesize_speech_bytes(*, text: str, voice: str = "default") -> tuple[bytes, str]:
    """``POST /ai/tts`` 서비스 본체 — 텍스트 → mp3 bytes (Google Chirp 3 HD Kore, 한국어).

    한국어 전용. ``voice`` 인자는 호환을 위해 유지하지만 무시 (항상 Kore).
    Returns:
        (audio_bytes, mime_type). 실패 시 빈 bytes + 'fallback' 마커.
    Raises:
        AIServiceError: 입력 검증 실패 (텍스트 없음 / 너무 김).
    """
    cleaned_text = (text or "").strip()
    if not cleaned_text:
        raise AIServiceError("TTS 변환용 텍스트가 비어 있습니다.", status_code=400)
    # Google Cloud TTS 의 byte 한도(5000) 보다 보수적으로. 한국어는 1글자 ~ 3 bytes 라 약 1600자.
    if len(cleaned_text) > 1600:
        raise AIServiceError("TTS 텍스트가 너무 깁니다. 1600자 이하로 줄여 주세요.", status_code=400)

    api_key = _get_google_tts_api_key()
    if not api_key:
        return b"", "fallback"

    try:
        import httpx
        with httpx.Client(timeout=30.0) as client:
            resp = client.post(
                f"{GOOGLE_TTS_URL}?key={api_key}",
                json={
                    "input": {"text": cleaned_text},
                    "voice": {
                        "languageCode": GOOGLE_TTS_LANGUAGE_CODE,
                        "name": GOOGLE_TTS_VOICE,
                    },
                    "audioConfig": {
                        "audioEncoding": "MP3",
                        "speakingRate": GOOGLE_TTS_SPEAKING_RATE,
                    },
                },
            )
        if resp.status_code != 200:
            return b"", "fallback"
        payload = resp.json()
        audio_b64 = str(payload.get("audioContent") or "").strip()
        if not audio_b64:
            return b"", "fallback"
        audio_bytes = base64.b64decode(audio_b64)
        if not audio_bytes:
            return b"", "fallback"
        return audio_bytes, "audio/mpeg"
    except AIServiceError:
        raise
    except Exception:  # noqa: BLE001
        return b"", "fallback"


def synthesize_speech(*, text: str, voice: str = "default") -> AITTSResponse:
    """이전 시그니처 호환 — bytes 가 아닌 metadata 응답만. 테스트 fallback 검증 등에서 사용.

    실제 음성 데이터를 받는 호출은 ``synthesize_speech_bytes`` + router stream 사용.
    """
    audio, mime = synthesize_speech_bytes(text=text, voice=voice)
    if not audio:
        return _tts_fallback_response()
    return AITTSResponse(audio_url="", source="google_tts", mime_type=mime, error_message="")
