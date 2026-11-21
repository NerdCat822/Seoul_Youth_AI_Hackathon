"""요청·응답 모델."""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class ApiError(Exception):
    """`{"code","message","fieldErrors"}` 형식으로 나가는 오류."""

    def __init__(self, status: int, code: str, message: str, field_errors: dict | None = None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.field_errors = field_errors or {}


class ErrorResponse(BaseModel):
    code: str
    message: str
    fieldErrors: dict[str, str] = Field(default_factory=dict)


class DraftRequest(BaseModel):
    text: Optional[str] = None


class ChatRequest(BaseModel):
    threadId: Optional[str] = None
    message: Optional[str] = None


class DraftFields(BaseModel):
    """Spring `POST /experiments`에 그대로 보낼 다섯 필드."""

    title: str
    category: Literal["MENU", "OPERATION", "MARKETING"]
    startDate: str
    endDate: str
    notes: str


class Extra(BaseModel):
    targetMenuCode: Optional[str] = None
    targetMenuName: Optional[str] = None
    actionType: Optional[str] = None
    metric: Optional[str] = None


class DraftResponse(BaseModel):
    source: Literal["LLM", "RULES"]
    intent: Literal["RECORD", "WORRY", "OTHER"]
    draft: Optional[DraftFields] = None
    extra: Extra = Field(default_factory=Extra)
    notices: list[str] = Field(default_factory=list)
    missing: list[str] = Field(default_factory=list)
    candidates: list[dict[str, Any]] = Field(default_factory=list)


class ChatResponse(BaseModel):
    threadId: str
    status: Literal["ASKING", "AWAITING_CONFIRM", "IDEAS", "SAVED", "CANCELLED", "GUIDE"]
    reply: str
    draft: Optional[DraftFields] = None
    extra: Extra = Field(default_factory=Extra)
    notices: list[str] = Field(default_factory=list)
    experiment: Optional[dict[str, Any]] = None
    ideas: list[dict[str, Any]] = Field(default_factory=list)
    source: Literal["LLM", "RULES"]


class ExplainResponse(BaseModel):
    experimentId: str
    source: Literal["LLM", "RULES"]
    explanation: str
    nextSuggestion: str
    numbers: dict[str, Any]
    numbersSource: dict[str, Optional[str]]
    fallbackUsed: bool


class HealthResponse(BaseModel):
    status: str
    service: str
    llmReady: bool
    llmModel: str
    llmLastError: Optional[str] = None
    llmWarmedUp: bool = False
    springToday: Optional[str] = None
    mlReady: bool
    mlBaseToday: Optional[str] = None
    dateMatch: bool
