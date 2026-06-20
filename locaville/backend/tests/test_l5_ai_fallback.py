"""L5 AI Fallback — 5개 AI 모듈 graceful degradation 검증.

저탄마을 4-Level 테스트의 Level 5. AI 모듈이 환경 변화에 graceful 한지:
  - OPENAI_API_KEY 부재 / 빈 값
  - OpenAI SDK 호출 실패 / 네트워크 다운
  - RAG 검색 0 hit

각 모듈은 backend 가 죽지 않고 안전한 fallback 응답 + 명확한 source/error_message
마커를 반환해야 한다 (frontend 가 폴백 분기 처리 가능).

검증 모듈 5종:
  L5.1 Vision   (classify_and_extract_evidence)
  L5.2 STT      (transcribe_audio_file)
  L5.3 TTS      (synthesize_speech_bytes / synthesize_speech)
  L5.4 Chat RAG (chat_with_rag) — 검색 0 hit
  L5.5 advice   (compose_advice_text — LLM 실패 → rule fallback)

실행:
    cd locaville/backend
    .\\.venv\\Scripts\\python -m pytest tests/test_l5_ai_fallback.py -v

모두 DB-free + OpenAI 호출 X — monkeypatch 로 OPENAI_API_KEY 빈 값 시뮬레이션.
"""
from __future__ import annotations

import pytest


# ============================================================
# L5.1 Vision — OPENAI_API_KEY 빈 값 시 안전한 unknown 반환
# ============================================================


def test_l5_vision_no_api_key_returns_safe_unknown(monkeypatch) -> None:
    """OPENAI_API_KEY 비면 classify_and_extract_evidence 가 unknown 안전 반환.

    backend 다운 X, 업로드 흐름 막지 않음, frontend 가 fallback 분기로 사용자에게
    직접 선택 요구 가능.
    """
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    # _load_env_file_if_needed 가 .env 다시 로드 못 하게 차단
    from app.services import ai_service

    monkeypatch.setattr(ai_service, "_load_env_file_if_needed", lambda: None)

    out = ai_service.classify_and_extract_evidence(
        file_bytes=b"\xff\xd8\xff\xd9",  # dummy JPEG
        extension=".jpg",
    )
    assert out["classification"] == "unknown"
    assert out["source"] == "fallback"
    assert out["receipt"] is None
    assert out["suggested_evidence_type"] == ""
    assert out["suggested_activity_type"] == ""


def test_l5_vision_empty_file_safe_return() -> None:
    """빈 file_bytes — key 와 무관하게 안전 unknown 반환 (입력 검증)."""
    from app.services.ai_service import classify_and_extract_evidence

    out = classify_and_extract_evidence(file_bytes=b"", extension=".jpg")
    assert out["classification"] == "unknown"
    assert out["source"] == "fallback"


# ============================================================
# L5.2 STT — 음성 → 텍스트 fallback
# ============================================================


def test_l5_stt_no_api_key_returns_fallback(monkeypatch) -> None:
    """OPENAI_API_KEY 비면 STT 가 빈 text + source=fallback + error_message.

    frontend 는 이걸 받고 브라우저 Web Speech API 로 자동 폴백.
    """
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    from app.services import ai_service

    monkeypatch.setattr(ai_service, "_load_env_file_if_needed", lambda: None)

    # 유효한 mp3 magic (ID3 또는 0xFFFB 프레임) 으로 입력 검증 통과
    fake_audio = b"ID3\x04\x00\x00\x00\x00\x00\x00" + b"\x00" * 100
    out = ai_service.transcribe_audio_file(
        file_bytes=fake_audio,
        filename="test.mp3",
        language="ko",
    )
    assert out.source == "fallback"
    assert out.text == ""
    assert out.error_message != ""


def test_l5_stt_openai_failure_falls_back(monkeypatch) -> None:
    """OpenAI 호출 실패 (network/timeout/모델오류) 시도 fallback 으로 흡수."""
    from app.services import ai_service

    monkeypatch.setenv("OPENAI_API_KEY", "fake-key-for-test")

    class _FailingClient:
        class audio:
            class transcriptions:
                @staticmethod
                def create(**_kwargs):
                    raise RuntimeError("simulated network error")

    monkeypatch.setattr(ai_service, "_get_openai_client", lambda: _FailingClient())

    fake_audio = b"ID3\x04\x00\x00\x00\x00\x00\x00" + b"\x00" * 100
    out = ai_service.transcribe_audio_file(
        file_bytes=fake_audio,
        filename="test.mp3",
        language="ko",
    )
    assert out.source == "fallback"
    assert out.text == ""


# ============================================================
# L5.3 TTS — 텍스트 → 음성 fallback
# ============================================================


def test_l5_tts_no_api_key_returns_empty_bytes(monkeypatch) -> None:
    """GOOGLE_TTS_API_KEY 비면 synthesize_speech_bytes 가 (b'', 'fallback')."""
    monkeypatch.delenv("GOOGLE_TTS_API_KEY", raising=False)
    from app.services import ai_service

    monkeypatch.setattr(ai_service, "_load_env_file_if_needed", lambda: None)

    audio, mime = ai_service.synthesize_speech_bytes(text="안녕하세요")
    assert audio == b""
    assert mime == "fallback"


def test_l5_tts_legacy_wrapper_returns_fallback_response(monkeypatch) -> None:
    """synthesize_speech 호환 wrapper — key 없으면 AITTSResponse(source='fallback')."""
    monkeypatch.delenv("GOOGLE_TTS_API_KEY", raising=False)
    from app.services import ai_service

    monkeypatch.setattr(ai_service, "_load_env_file_if_needed", lambda: None)

    resp = ai_service.synthesize_speech(text="안녕하세요")
    assert resp.source == "fallback"
    assert resp.audio_url == ""
    assert resp.error_message != ""


def test_l5_tts_google_failure_falls_back(monkeypatch) -> None:
    """Google TTS 호출 실패(비정상 status) → empty bytes + 'fallback' (예외 노출 안 함)."""
    from app.services import ai_service

    monkeypatch.setenv("GOOGLE_TTS_API_KEY", "fake-key-for-test")

    class _FailingResp:
        status_code = 500
        def json(self):
            return {}

    class _FailingClient:
        def __enter__(self):
            return self
        def __exit__(self, *_a):
            return False
        def post(self, *_a, **_kw):
            return _FailingResp()

    import httpx as _httpx
    monkeypatch.setattr(_httpx, "Client", lambda *_a, **_kw: _FailingClient())

    audio, mime = ai_service.synthesize_speech_bytes(text="안녕하세요")
    assert audio == b""
    assert mime == "fallback"


def test_l5_tts_empty_text_raises_400(monkeypatch) -> None:
    """빈 텍스트는 fallback 이 아니라 명확한 400 (입력 검증) — silent fallback 금지."""
    from app.services import ai_service
    from app.services.ai_service import AIServiceError

    with pytest.raises(AIServiceError):
        ai_service.synthesize_speech_bytes(text="")
    with pytest.raises(AIServiceError):
        ai_service.synthesize_speech_bytes(text="   ")


# ============================================================
# L5.4 Chat (RAG) — 검색 0 hit 시 source_type='fallback'
# ============================================================


def test_l5_chat_rag_zero_hit_returns_fallback_source(monkeypatch) -> None:
    """RAG retrieve 가 0 hit (관련 청크 없음) 이면 source_type='fallback'.

    fact 단언 X, 농가용 "확인이 필요해요" 톤. 모르는 질문에 LLM 이 사실 만들지 않음.
    """
    from app.services import ai_service

    # retrieve 0 hit 시뮬레이션 — ai_service 가 import 한 retrieve_relevant_snippets mock
    monkeypatch.setattr(
        ai_service,
        "retrieve_relevant_snippets",
        lambda *a, **k: [],
    )
    # OPENAI key 없는 환경처럼 — LLM 호출 자체 차단
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setattr(ai_service, "_load_env_file_if_needed", lambda: None)

    resp = ai_service.chat_with_rag(question="모르는 질문 abc xyz 12345")
    assert resp.source_type == "fallback"
    # 결과 텍스트는 사실 단언 아닌 안내 톤이어야 함
    assert resp.answer  # 빈 응답은 안 됨


# ============================================================
# L5.5 advice — LLM 실패 시 룰 기반 fallback
# ============================================================


def test_l5_advice_no_api_key_returns_rule_fallback(monkeypatch) -> None:
    """OPENAI_API_KEY 비면 compose_advice_text 가 (fallback_template, 'RULE') 반환.

    "오늘 한마디" 가 빈 화면이 되지 않음. 룰 기반 문구 그대로 사용자에게 표시.
    """
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    # conftest 의 .env auto-load + ai_service 의 _load_env_file_if_needed 가 빈 값을 다시
    # 채워넣지 못하게 차단 — 정말로 OPENAI_API_KEY 없는 환경 시뮬레이션.
    from app.services import ai_service

    monkeypatch.setattr(ai_service, "_load_env_file_if_needed", lambda: None)

    from app.services.advice_llm import compose_advice_text

    text, gen_cd = compose_advice_text(
        scenario_cd="SCN_TEST",
        fields={"farmer_name": "김영수"},
        fallback_template="오늘은 중간 물떼기 적기예요.",
    )
    assert text == "오늘은 중간 물떼기 적기예요."
    assert gen_cd == "RULE"


def test_l5_advice_llm_failure_falls_back_to_rule(monkeypatch) -> None:
    """OpenAI 호출 자체가 실패해도 룰 기반 fallback 으로 흡수."""
    monkeypatch.setenv("OPENAI_API_KEY", "fake-key-for-test")

    from app.services import advice_llm

    # 내부 OpenAI client 호출 시점에 예외 발생시키기 — 가장 일반적 진입점 둘 다 차단
    # (모듈 구조 변경에도 견디려고 OpenAI / openai.OpenAI 둘 다 patch 시도)
    class _FailingClient:
        class chat:
            class completions:
                @staticmethod
                def create(**_kwargs):
                    raise RuntimeError("simulated llm failure")

        class responses:
            @staticmethod
            def create(**_kwargs):
                raise RuntimeError("simulated responses failure")

    # advice_llm 가 사용하는 client getter 가 무엇이든 — 모두 실패 client 로 교체
    for attr in ("_get_openai_client", "get_openai_client"):
        if hasattr(advice_llm, attr):
            monkeypatch.setattr(advice_llm, attr, lambda: _FailingClient())

    text, gen_cd = advice_llm.compose_advice_text(
        scenario_cd="SCN_TEST",
        fields={"farmer_name": "김영수"},
        fallback_template="오늘은 중간 물떼기 적기예요.",
    )
    # 실패해도 어떻게든 fallback_template 반환 (silent fallback)
    assert text == "오늘은 중간 물떼기 적기예요."
    assert gen_cd == "RULE"
