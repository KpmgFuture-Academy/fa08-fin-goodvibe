"""AI 기능 (``/ai/*`` 라우터) API Pydantic 모델.

AI 는 보조 역할입니다:
  - chat: HWPX 정책 문서 RAG Q&A
  - journal-draft: 음성/텍스트 → 영농일지 초안 (자동 저장 X, 사용자 확인 후 저장)
  - evidence-guide: 누락 증빙 안내 문구 생성
  - vision/evidence-label: 사진 → 증빙 유형 후보 (자동 확정 X, 후보만 제안)
  - stt / tts: OpenAI 음성 변환 (실패 시 브라우저 Web Speech 폴백)
  - voice/session/*: 음성 대화형 영농일지 작성 (in-memory 세션, 최대 3턴)
"""
from __future__ import annotations

from pydantic import BaseModel, Field


# ============================================================
# /ai/chat — RAG 정책 문서 Q&A
# ============================================================

class AIChatMessage(BaseModel):
    """multi-turn 대화의 한 턴. `role` 은 'user' | 'assistant'."""
    role: str = Field(min_length=1)
    content: str = Field(default="")


class AIChatRequest(BaseModel):
    """``POST /ai/chat`` 요청.

    두 형태 모두 지원 (호환):
      1) 단일 질문: `{question, farmer_id?, context?}` — 기존 호출자
      2) 멀티턴: `{messages: [{role, content}, ...], farmer_id?, context?}` — 새 호출자
         마지막 user 메시지가 retrieve 의 검색어. 전체 thread 가 LLM context.
    둘 다 들어오면 messages 우선.
    """
    question: str = Field(default="")
    messages: list[AIChatMessage] = Field(default_factory=list)
    farmer_id: str = Field(default="")
    # 활동·사업 컨텍스트 (RAG 가 답변 우선순위 조정에 사용).
    context: dict[str, str] = Field(default_factory=dict)


class AIUsedContext(BaseModel):
    """답변에 사용한 문서 청크의 출처 메타데이터."""
    path: str
    snippet: str
    score: int = Field(default=0)


class AIChatResponse(BaseModel):
    """답변 + RAG 출처. ``source_type`` 은 ``rag`` 또는 ``fallback``."""
    answer: str
    source_type: str
    used_context: list[AIUsedContext] = Field(default_factory=list)


# ============================================================
# /ai/evidence-guide — 누락 증빙 안내 문구
# ============================================================

class AIEvidenceGuideRequest(BaseModel):
    """활동 유형 + 누락 증빙 종류 → 농가용 안내 문구 생성."""
    activity_type: str = Field(min_length=1)
    missing_evidence_types: list[str] = Field(default_factory=list)


class AIEvidenceGuideResponse(BaseModel):
    """규칙 기반 또는 OpenAI 다듬은 안내 문구 (한국어, 농가용)."""
    message: str


# ============================================================
# /ai/policy/calc — 정책 문서 기반 날짜·기간 계산
# ============================================================

class AIPolicyCalcRequest(BaseModel):
    """``POST /ai/policy/calc`` 요청.

    예시:
      question="중간 물떼기는 언제 시작하고 언제 종료해야 하나요?"
      activity="중간 물떼기"
      farmer_context={"모내기 날짜": "2026-06-01"}
    """
    question: str = Field(min_length=1)
    # 관련 활동 (검색 단서. 비워도 동작하지만 정확도 ↑).
    activity: str = Field(default="")
    # 농가별 컨텍스트 — 모내기 날짜, 농지 면적 등.
    farmer_context: dict[str, str] = Field(default_factory=dict)


class AIPolicyCalcResponse(BaseModel):
    """답변 + RAG 근거. 답변은 노트북 calculation_prompt 형식
    (산정 기준 → 날짜 계산 → 최종 답변)."""
    answer: str
    source_type: str
    used_context: list[AIUsedContext] = Field(default_factory=list)


# ============================================================
# /ai/policy/rule — 작업 일정 규칙 JSON 추출
# ============================================================

class AIPolicyRuleRequest(BaseModel):
    """``POST /ai/policy/rule`` 요청.

    예시:
      task_name="중간 물떼기"
      question="중간 물떼기의 시작일과 종료일 규칙을 추출해줘"
    """
    task_name: str = Field(min_length=1)
    question: str = Field(default="")  # 빈 문자열이면 task_name 으로 자동 구성


class AIPolicyRuleDateSpec(BaseModel):
    """시작일 또는 종료일 산정 규칙."""
    기준: str = Field(default="")           # 어느 작업 기준 (예: '모내기 이후', '시작일')
    전후: str = Field(default="")           # 자연어 표현 (예: '약 한달 후', '2주 이상')
    경과일수: int | None = None             # 정확한 경과일 (없으면 null)
    최소경과일수: int | None = None
    최대경과일수: int | None = None
    근거: str = Field(default="")
    출처: str = Field(default="")           # position 값


class AIPolicyRuleEvidence(BaseModel):
    """증빙 조건."""
    증빙회수: int | None = None
    증빙방법: list[str] = Field(default_factory=list)
    기타: str = Field(default="")


class AIPolicyRuleBody(BaseModel):
    """추출된 작업 일정 규칙 JSON."""
    그룹ID: str = Field(default="")
    작업ID: str = Field(default="")
    작업명: str
    선행작업: list[str] = Field(default_factory=list)
    시작일: AIPolicyRuleDateSpec = Field(default_factory=AIPolicyRuleDateSpec)
    종료일: AIPolicyRuleDateSpec = Field(default_factory=AIPolicyRuleDateSpec)
    증빙조건: AIPolicyRuleEvidence = Field(default_factory=AIPolicyRuleEvidence)


class AIPolicyRuleResponse(BaseModel):
    """JSON 규칙 + RAG 근거. 추출 실패 시 ``rule=None`` + ``raw_answer`` 에 원문."""
    rule: AIPolicyRuleBody | None = None
    raw_answer: str = Field(default="")
    source_type: str
    used_context: list[AIUsedContext] = Field(default_factory=list)


# ============================================================
# /ai/stt — Speech-to-Text
# ============================================================

class AISTTResponse(BaseModel):
    """STT 결과. OpenAI 실패 시 ``source='fallback'`` + ``error_message`` 로
    프론트가 브라우저 STT 로 폴백할 수 있게 함."""
    text: str = Field(default="")
    source: str = Field(default="fallback")
    error_message: str = Field(default="")


# ============================================================
# /ai/tts — Text-to-Speech
# ============================================================

class AITTSRequest(BaseModel):
    """질문/안내 문구를 음성 파일로 합성하기 위한 요청."""
    text: str = Field(min_length=1)
    voice: str = Field(default="default")


class AITTSResponse(BaseModel):
    """합성된 mp3 stream 의 메타 응답. 실패 시 fallback 응답으로 프론트가
    브라우저 ``speechSynthesis`` 로 폴백."""
    audio_url: str = Field(default="")
    source: str = Field(default="fallback")
    mime_type: str = Field(default="audio/mpeg")
    error_message: str = Field(default="")
