from __future__ import annotations

from pydantic import BaseModel, Field


class AILLMCompareRequest(BaseModel):
    menu_key: str = Field(min_length=1)
    input_text: str = Field(min_length=1)
    context: str = Field(default="")
    output_format: str = Field(default="text")
    max_chars: int = Field(default=120, ge=1, le=1000)


class AILLMCompareResult(BaseModel):
    request_id: str
    selected_model: str
    used_model: str
    output_text: str = Field(default="")
    latency_ms: int = Field(default=0, ge=0)
    prompt_tokens: int = Field(default=0, ge=0)
    completion_tokens: int = Field(default=0, ge=0)
    total_tokens: int = Field(default=0, ge=0)
    error: str | None = None


class AILLMCompareResponse(BaseModel):
    compare_group_id: str
    menu_key: str
    input_text: str
    results: list[AILLMCompareResult] = Field(default_factory=list)


class AILLMCompareSelectionRequest(BaseModel):
    compare_group_id: str = Field(min_length=1)
    request_id: str = Field(min_length=1)
    selected: bool = True
    memo: str = Field(default="")


class AILLMCompareSelectionResponse(BaseModel):
    ok: bool = True
    compare_group_id: str
    request_id: str
    selected: bool
    memo: str = Field(default="")
