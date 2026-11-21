"""그래프 조립과 대화 상태 저장소.

대화 하나는 `thread_id` 하나다. 상태는 memory.checkpointer()에 둔다.
DB 설정이 있으면 Postgres(재시작해도 이어짐), 없으면 서버 메모리다.
"""
from __future__ import annotations

from functools import lru_cache

from langgraph.graph import END, START, StateGraph

from .. import memory
from . import nodes
from .state import AgentState, ExplainState


@lru_cache(maxsize=1)
def chat_graph():
    """한마디 → 초안 → 확인 → 저장. 확인과 질문 단계에서 멈췄다가 이어간다."""
    g = StateGraph(AgentState)
    for name in ("load_context", "classify_intent", "extract_draft", "normalize", "validate", "ask_missing",
                 "confirm", "revise", "save", "cancel", "guide", "suggest_ideas", "await_idea"):
        g.add_node(name, getattr(nodes, name))
    g.add_edge(START, "load_context")
    g.add_edge("load_context", "classify_intent")
    g.add_conditional_edges("classify_intent", nodes.route_intent,
                            {"extract_draft": "extract_draft", "suggest_ideas": "suggest_ideas", "guide": "guide"})
    g.add_edge("extract_draft", "normalize")
    g.add_edge("normalize", "validate")
    g.add_conditional_edges("validate", nodes.route_validate, {"ask_missing": "ask_missing", "confirm": "confirm"})
    g.add_conditional_edges("ask_missing", nodes.route_ask,
                            {"cancel": "cancel", "ask_missing": "ask_missing", "classify_intent": "classify_intent",
                             "validate": "validate"})
    g.add_conditional_edges("confirm", nodes.route_confirm, {"save": "save", "revise": "revise", "cancel": "cancel"})
    g.add_edge("revise", "validate")
    g.add_conditional_edges("save", nodes.route_save, {"confirm": "confirm", "end": END})
    g.add_conditional_edges("suggest_ideas", nodes.route_ideas, {"await_idea": "await_idea", "end": END})
    g.add_conditional_edges("await_idea", nodes.route_idea_answer,
                            {"cancel": "cancel", "validate": "validate", "classify_intent": "classify_intent"})
    g.add_edge("cancel", END)
    g.add_edge("guide", END)
    return g.compile(checkpointer=memory.checkpointer())


@lru_cache(maxsize=1)
def draft_graph():
    """대화 상태를 만들지 않는 한 번짜리 초안. 멈춤도 저장도 없다."""
    g = StateGraph(AgentState)
    for name in ("load_context", "classify_intent", "extract_draft", "normalize", "validate"):
        g.add_node(name, getattr(nodes, name))
    g.add_edge(START, "load_context")
    g.add_edge("load_context", "classify_intent")
    g.add_conditional_edges("classify_intent", lambda s: "extract_draft" if s.get("intent") == "RECORD" else "end",
                            {"extract_draft": "extract_draft", "end": END})
    g.add_edge("extract_draft", "normalize")
    g.add_edge("normalize", "validate")
    g.add_edge("validate", END)
    return g.compile()


@lru_cache(maxsize=1)
def explain_graph():
    """결과 설명: 숫자 모으기 → 설명 쓰기 → 숫자 대조."""
    g = StateGraph(ExplainState)
    for name in ("collect_numbers", "write_explanation", "check_numbers"):
        g.add_node(name, getattr(nodes, name))
    g.add_edge(START, "collect_numbers")
    g.add_conditional_edges("collect_numbers", nodes.route_collect, {"write_explanation": "write_explanation", "end": END})
    g.add_edge("write_explanation", "check_numbers")
    g.add_conditional_edges("check_numbers", nodes.route_check, {"write_explanation": "write_explanation", "end": END})
    return g.compile()


def reset_graphs() -> None:
    """테스트에서 대화 상태를 비운다."""
    memory.reset()
    chat_graph.cache_clear()
    draft_graph.cache_clear()
    explain_graph.cache_clear()
