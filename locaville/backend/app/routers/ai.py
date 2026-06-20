"""``/ai/*`` 라우터 — AI 기능 (RAG chat, evidence guide, policy calc/rule, STT, TTS).

backend 가 OpenAI/Returnzero API key 의 유일한 보유자. 프런트는 이 라우터를 통해서만 AI 호출.
실패 시 ``AIServiceError`` → ``status_code`` 그대로 HTTP 응답으로 매핑.
"""
from __future__ import annotations

from io import BytesIO

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status as http_status
from fastapi.responses import StreamingResponse

from app.schemas.llm_compare import (
    AILLMCompareRequest,
    AILLMCompareResponse,
    AILLMCompareSelectionRequest,
    AILLMCompareSelectionResponse,
)
from app.schemas.ai import (
    AIChatRequest,
    AIChatResponse,
    AIEvidenceGuideRequest,
    AIEvidenceGuideResponse,
    AIPolicyCalcRequest,
    AIPolicyCalcResponse,
    AIPolicyRuleRequest,
    AIPolicyRuleResponse,
    AISTTResponse,
    AITTSRequest,
)
from app.services.ai_service import (
    AIServiceError,
    calculate_policy_date,
    chat_with_rag,
    chat_with_rag_stream,
    compare_llm_outputs,
    extract_policy_schedule_rule,
    generate_evidence_guide,
    save_llm_compare_selection,
    synthesize_speech_bytes,
    transcribe_audio_file,
)


router = APIRouter(prefix="/ai", tags=["ai"])


def _sse_format(event: str, data: dict) -> str:
    """SSE 한 이벤트를 wire format 으로. data 는 JSON 직렬화."""
    import json as _json
    return f"event: {event}\ndata: {_json.dumps(data, ensure_ascii=False)}\n\n"


@router.post("/chat/stream")
def post_ai_chat_stream(payload: AIChatRequest):
    """Streaming RAG chat — SSE 로 token / final / done 이벤트.

    Events:
      - `event: token` `data: {"text": "..."}` — 토큰 도착 (반복)
      - `event: final` `data: {"answer": "후처리됨", "source_type": "rag", "used_context": [...]}`
      - `event: done`  `data: {}`
      - `event: error` `data: {"detail": "..."}`
    """
    messages_dicts = (
        [{"role": m.role, "content": m.content} for m in payload.messages]
        if payload.messages else None
    )

    def event_gen():
        try:
            for event_name, data in chat_with_rag_stream(
                payload.question,
                farmer_id=payload.farmer_id,
                context=payload.context,
                messages=messages_dicts,
            ):
                yield _sse_format(event_name, data)
        except AIServiceError as exc:
            yield _sse_format("error", {"detail": str(exc)})
            yield _sse_format("done", {})

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # nginx 가 있으면 버퍼링 막음
        },
    )


@router.post("/chat", response_model=AIChatResponse)
def post_ai_chat(payload: AIChatRequest) -> AIChatResponse:
    try:
        # multi-turn: payload.messages 있으면 그대로 전달, 없으면 question 단일 호환.
        messages_dicts = (
            [{"role": m.role, "content": m.content} for m in payload.messages]
            if payload.messages else None
        )
        return chat_with_rag(
            payload.question,
            farmer_id=payload.farmer_id,
            context=payload.context,
            messages=messages_dicts,
        )
    except AIServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@router.post("/evidence-guide", response_model=AIEvidenceGuideResponse)
def post_ai_evidence_guide(payload: AIEvidenceGuideRequest) -> AIEvidenceGuideResponse:
    try:
        return generate_evidence_guide(payload.activity_type, payload.missing_evidence_types)
    except AIServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@router.post("/llm-compare", response_model=AILLMCompareResponse)
def post_ai_llm_compare(payload: AILLMCompareRequest) -> AILLMCompareResponse:
    try:
        return compare_llm_outputs(payload)
    except AIServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@router.post("/llm-compare/select", response_model=AILLMCompareSelectionResponse)
def post_ai_llm_compare_select(
    payload: AILLMCompareSelectionRequest,
) -> AILLMCompareSelectionResponse:
    try:
        return save_llm_compare_selection(payload)
    except AIServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@router.post("/policy/calc", response_model=AIPolicyCalcResponse)
def post_ai_policy_calc(payload: AIPolicyCalcRequest) -> AIPolicyCalcResponse:
    """정책 문서 근거로 날짜·일정 계산. (예: '6월 1일 모내기 → 중간 물떼기 언제?')"""
    try:
        return calculate_policy_date(
            question=payload.question,
            activity=payload.activity,
            farmer_context=payload.farmer_context,
        )
    except AIServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@router.post("/policy/rule", response_model=AIPolicyRuleResponse)
def post_ai_policy_rule(payload: AIPolicyRuleRequest) -> AIPolicyRuleResponse:
    """작업 일정 규칙 JSON 추출. (todo 자동 생성·검증·이장님 화면 등 재사용)"""
    try:
        return extract_policy_schedule_rule(
            task_name=payload.task_name,
            question=payload.question,
        )
    except AIServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@router.post("/stt", response_model=AISTTResponse)
async def post_ai_stt(
    file: UploadFile = File(...),
    language: str = Form(default="ko"),
) -> AISTTResponse:
    try:
        file_bytes = await file.read()
        return transcribe_audio_file(
            file_bytes=file_bytes,
            filename=file.filename or "audio.webm",
            language=language,
        )
    except AIServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@router.post("/tts")
def post_ai_tts(payload: AITTSRequest):
    """텍스트 → mp3 음성 **stream** (Google Cloud TTS Chirp 3 HD Kore, 한국어).

    bytes 를 메모리에서 즉시 ``audio/mpeg`` StreamingResponse 로 전송.
    frontend 는 ``response.blob()`` → ``URL.createObjectURL`` 로 받아 ``<audio>`` 에 연결.

    실패/키 없음 시 204 No Content (응답 body 없음) — frontend 가 브라우저
    ``speechSynthesis`` 폴백.
    """
    try:
        audio_bytes, mime = synthesize_speech_bytes(text=payload.text, voice=payload.voice)
    except AIServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    if not audio_bytes:
        # OpenAI 키 없음 또는 호출 실패 — frontend 가 폴백 결정.
        return StreamingResponse(BytesIO(b""), media_type=mime, status_code=http_status.HTTP_204_NO_CONTENT)
    return StreamingResponse(
        BytesIO(audio_bytes),
        media_type=mime,
        headers={"Content-Length": str(len(audio_bytes))},
    )
