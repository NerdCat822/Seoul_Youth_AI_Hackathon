"""그래프 상태."""
from __future__ import annotations

from typing import TypedDict


class AgentState(TypedDict, total=False):
    text: str                 # 이번에 이해할 사장님 문장
    utterances: list[str]     # 초안을 만드는 데 쓴 사장님 문장들(메모에 남긴다)
    today: str                # 오늘(서울), YYYY-MM-DD
    intent: str               # RECORD, WORRY, OTHER
    understanding: dict       # LLM 또는 규칙이 뽑은 항목
    draft: dict | None        # Spring에 그대로 보낼 다섯 필드
    extra: dict               # targetMenuCode, targetMenuName, actionType, metric
    missing: list[str]        # 비어 있거나 여러 뜻으로 읽히는 항목
    candidates: list[dict]    # 대상 메뉴 후보
    notices: list[str]        # 사장님께 알릴 해석
    decision: str | None      # SAVE, REVISE, CANCEL
    answer: str | None        # 멈춘 단계에서 받은 답
    experiment: dict | None   # 저장 뒤 Spring이 돌려준 시도
    source: str               # LLM 또는 RULES
    status: str | None        # 끝난 대화의 상태: SAVED, CANCELLED, GUIDE
    reply: str | None
    ideas: list[dict]         # 고민에 제안한 가상 사례
    ideas_reply: str | None
    period_defaulted: bool    # 종료일이 '2주 제안'으로 정해졌는지
    asked: int                # 같은 질문을 되물은 횟수
    save_failed: bool


class ExplainState(TypedDict, total=False):
    experiment_id: str
    experiment: dict
    report: dict
    numbers: dict
    numbers_source: dict
    facts: dict
    allowed: list[str]
    overlap_titles: list[str]
    menu_name: str | None
    action_type: str | None
    explanation: str
    next_suggestion: str
    source: str
    fallback_used: bool
    attempts: int
    feedback: str | None
    passed: bool
    error: dict | None
