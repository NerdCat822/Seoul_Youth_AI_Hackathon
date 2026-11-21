"""`/api/v1/agent/*` 경로."""
from __future__ import annotations

import threading
import time
import uuid
from collections import OrderedDict

from fastapi import APIRouter
from langgraph.types import Command

from . import llm
from .graph.build import chat_graph, draft_graph, explain_graph
from .schemas import ApiError, ChatRequest, ChatResponse, DraftRequest, DraftResponse, ExplainResponse, HealthResponse
from .settings import get_settings
from .tools import ml, rules
from .tools.spring import SpringError, SpringNotFound, get_spring

router = APIRouter(prefix="/api/v1/agent", tags=["agent"])

TEXT_MAX = 500
MAX_THREADS = 300
_threads: "OrderedDict[str, threading.Lock]" = OrderedDict()
_threads_guard = threading.Lock()


def _clean(value: str | None, field: str) -> str:
    text = (value or "").strip()
    if not text:
        raise ApiError(400, "VALIDATION_ERROR", "입력 내용을 확인해주세요.", {field: "문장을 입력해주세요."})
    if len(text) > TEXT_MAX:
        raise ApiError(400, "VALIDATION_ERROR", "입력 내용을 확인해주세요.", {field: "문장은 500자 이내로 입력해주세요."})
    return text


def _config(thread_id: str | None = None) -> dict:
    configurable = {"deadline": time.monotonic() + get_settings().request_budget}
    if thread_id:
        configurable["thread_id"] = thread_id
    return {"configurable": configurable}


def _thread_lock(thread_id: str | None) -> tuple[str, threading.Lock]:
    """아는 대화면 그 대화의 잠금을, 없거나 모르는 값이면 새 대화를 돌려준다."""
    with _threads_guard:
        if thread_id and thread_id in _threads:
            _threads.move_to_end(thread_id)
            return thread_id, _threads[thread_id]
        new_id = str(uuid.uuid4())
        _threads[new_id] = threading.Lock()
        while len(_threads) > MAX_THREADS:
            old_id, _ = _threads.popitem(last=False)
            saver = chat_graph().checkpointer
            if hasattr(saver, "delete_thread"):
                saver.delete_thread(old_id)
        return new_id, _threads[new_id]


@router.get("/health", response_model=HealthResponse)
def health() -> dict:
    settings = get_settings()
    spring_today = None
    try:
        spring_today = get_spring().overview().get("today")
    except SpringError:
        pass
    ml_today = ml.base_today()
    return {
        "status": "UP", "service": "trylog-agent",
        "llmReady": llm.is_ready(), "llmModel": settings.llm_model, "llmLastError": llm.last_status().get("reason"),
        "llmWarmedUp": llm.warmed_up(),
        "springToday": spring_today, "mlReady": ml.ml_ready(), "mlBaseToday": ml_today,
        "dateMatch": bool(spring_today) and spring_today == ml_today,
    }


@router.post("/draft", response_model=DraftResponse)
def draft(body: DraftRequest) -> dict:
    """한마디를 시도 초안으로 바꾼다. 대화 상태를 만들지 않는다."""
    text = _clean(body.text, "text")
    state = draft_graph().invoke({"text": text}, _config())
    is_record = state.get("intent") == "RECORD"
    return {
        "source": state.get("source", "RULES"), "intent": state.get("intent") or "OTHER",
        "draft": state.get("draft") if is_record else None,
        "extra": state.get("extra") or {}, "notices": state.get("notices") or [],
        "missing": state.get("missing") or [], "candidates": state.get("candidates") or [],
    }


@router.post("/chat", response_model=ChatResponse)
def chat(body: ChatRequest) -> dict:
    """대화로 초안을 만들고, 고치고, 확인을 받은 뒤 저장한다."""
    message = _clean(body.message, "message")
    thread_id, lock = _thread_lock((body.threadId or "").strip() or None)
    graph = chat_graph()
    with lock:
        config = _config(thread_id)
        snapshot = graph.get_state(config)
        values = snapshot.values or {}
        if snapshot.next:
            result = graph.invoke(Command(resume=message), config)
        elif values.get("status") == "SAVED" and rules.is_save_word(message):
            # 이미 저장한 대화에서 다시 '저장'이라고 하면 Spring을 다시 부르지 않는다.
            return _response(thread_id, "SAVED", "이미 저장했어요.", values)
        elif rules.is_save_word(message) or rules.is_cancel_word(message):
            return _response(thread_id, "GUIDE", "저장할 초안이 아직 없어요. 먼저 해본 일을 한 문장으로 말씀해 주세요.",
                             {"source": "RULES"})
        else:
            result = graph.invoke({"text": message}, config)
        values = graph.get_state(config).values or {}
    interrupts = result.get("__interrupt__") or []
    if interrupts:
        payload = interrupts[0].value or {}
        return _response(thread_id, payload.get("status", "ASKING"), payload.get("reply") or "", values)
    return _response(thread_id, values.get("status") or "GUIDE", values.get("reply") or "", values)


def _response(thread_id: str, status: str, reply: str, values: dict) -> dict:
    return {
        "threadId": thread_id, "status": status, "reply": reply,
        "draft": values.get("draft") if status in {"ASKING", "AWAITING_CONFIRM", "SAVED"} else None,
        "extra": values.get("extra") or {}, "notices": values.get("notices") or [],
        "experiment": values.get("experiment"),
        "ideas": (values.get("ideas") or []) if status == "IDEAS" else [],
        "source": values.get("source") or "RULES",
    }


@router.post("/experiments/{experiment_id}/explain", response_model=ExplainResponse)
def explain(experiment_id: str) -> dict:
    """보고서의 숫자로 결과 설명과 다음 시도 제안을 쓴다."""
    state = explain_graph().invoke({"experiment_id": experiment_id}, _config())
    if state.get("error"):
        error = state["error"]
        raise ApiError(error["status"], error["code"], error["message"])
    return {
        "experimentId": experiment_id, "source": state.get("source", "RULES"),
        "explanation": state.get("explanation") or "", "nextSuggestion": state.get("next_suggestion") or "",
        "numbers": state.get("numbers") or {}, "numbersSource": state.get("numbers_source") or {},
        "fallbackUsed": bool(state.get("fallback_used")),
    }


@router.get("/experiments/{experiment_id}/forecast")
def forecast(experiment_id: str) -> dict:
    """Spring 시도를 표본 시도에 맞춰 서재원의 예측을 돌려준다."""
    try:
        experiment = get_spring().get_experiment(experiment_id)
    except SpringNotFound:
        raise ApiError(404, "NOT_FOUND", "시도를 찾을 수 없어요.") from None
    except SpringError:
        raise ApiError(502, "UPSTREAM_ERROR", "Spring 서버가 응답하지 않아요.") from None
    sample = ml.match_sample_experiment(experiment)
    if sample is None:
        raise ApiError(404, "NOT_FOUND", ml.MSG_NO_SAMPLE)
    if not ml.ml_ready():
        raise ApiError(502, "UPSTREAM_ERROR", "예측 모델을 불러오지 못했어요.")
    result = dict(ml.forecast(sample["id"]))
    result["matchedMlExperimentId"] = sample["id"]
    return result
