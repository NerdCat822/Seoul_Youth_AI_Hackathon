"""`/api/v1/agent/*` 경로."""
from __future__ import annotations

import threading
import time
import uuid
from collections import OrderedDict

from fastapi import APIRouter, Depends, File, Request, UploadFile
from fastapi.responses import Response
from fastapi.concurrency import run_in_threadpool
from langgraph.types import Command

from . import llm
from .graph.build import chat_graph, draft_graph, explain_graph
from .graph.nodes import get_menus
from .schemas import (ApiError, ChatRequest, ChatResponse, DraftRequest, DraftResponse, ExplainResponse, HealthResponse,
                      SttResponse, TtsRequest)
from .settings import get_settings
from .tools import login, ml, rules, stt, tts
from .tools.spring import SpringError, SpringNotFound, get_spring

router = APIRouter(prefix="/api/v1/agent", tags=["agent"])

TEXT_MAX = 500
MAX_THREADS = 300
_threads: "OrderedDict[str, threading.Lock]" = OrderedDict()
_thread_stores: dict[str, int] = {}   # 대화가 어느 가게의 것인지. 다른 가게는 이어 쓸 수 없다.
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


async def login_context(request: Request) -> None:
    """화면이 보낸 세션 쿠키와 CSRF 토큰을 이 요청의 Spring 호출에 넘기도록 적어 둔다."""
    headers = {}
    if request.headers.get("cookie"):
        headers["Cookie"] = request.headers["cookie"]
    if request.headers.get("x-csrf-token"):
        headers["X-CSRF-TOKEN"] = request.headers["x-csrf-token"]
    login.forward(headers)
    login.set_store(None)


async def require_login(request: Request) -> None:
    """로그인한 가게만 쓰게 한다. LLM을 부르는 경로와 가게 자료를 읽는 경로에 건다.

    Spring에 세션을 물어 확인한다. Spring이 로그인하지 않았다고 답하면 항상 401이다.
    Spring에 물어볼 수 없을 때(꺼져 있거나 로그인 기능이 없는 서버)는 설정을 따른다.
    `TRYLOG_REQUIRE_LOGIN=1`이면 받지 않고, 아니면 혼자 개발할 때처럼 통과시킨다.
    """
    await login_context(request)
    try:
        session = await run_in_threadpool(get_spring().session)
    except SpringError:
        if get_settings().require_login:
            raise ApiError(502, "UPSTREAM_ERROR", "로그인을 확인할 수 없어요. 잠시 뒤 다시 시도해 주세요.") from None
        return
    if not session.get("authenticated") or session.get("storeId") is None:
        raise ApiError(401, "UNAUTHENTICATED", "로그인이 필요해요.")
    login.set_store(int(session["storeId"]))


def _thread_lock(thread_id: str | None) -> tuple[str, threading.Lock]:
    """아는 대화면 그 대화의 잠금을, 없거나 모르는 값이거나 다른 가게의 대화면 새 대화를 돌려준다."""
    store_id = login.current_store_id()
    with _threads_guard:
        if thread_id and thread_id in _threads and _thread_stores.get(thread_id) == store_id:
            _threads.move_to_end(thread_id)
            return thread_id, _threads[thread_id]
        new_id = str(uuid.uuid4())
        _threads[new_id] = threading.Lock()
        _thread_stores[new_id] = store_id
        while len(_threads) > MAX_THREADS:
            old_id, _ = _threads.popitem(last=False)
            _thread_stores.pop(old_id, None)
            saver = chat_graph().checkpointer
            if hasattr(saver, "delete_thread"):
                saver.delete_thread(old_id)
        return new_id, _threads[new_id]


@router.get("/health", response_model=HealthResponse, dependencies=[Depends(login_context)])
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
        "sttReady": stt.is_ready(), "sttModel": settings.stt_model,
        "ttsReady": tts.is_ready(), "ttsModel": settings.tts_model, "ttsVoice": settings.tts_voice,
    }


@router.post("/stt", response_model=SttResponse, dependencies=[Depends(require_login)])
async def speech_to_text(audio: UploadFile = File(...)) -> dict:
    """녹음한 말을 글로 바꾼다. 로그인한 가게만 쓸 수 있다(OpenAI 요금이 든다)."""
    limit = get_settings().stt_max_bytes
    data = await audio.read(limit + 1)
    # 메뉴 이름을 힌트로 준다. 메뉴를 못 읽어도 전사는 한다.
    try:
        names = [menu.name for menu in await run_in_threadpool(get_menus)]
    except Exception:  # noqa: BLE001
        names = []
    try:
        result = await run_in_threadpool(stt.transcribe, data, audio.content_type, stt.menu_prompt(names))
    except stt.SttError as error:
        raise ApiError(error.status, error.code, error.message) from None
    return {"text": result.text, "model": result.model, "elapsedMs": result.elapsed_ms}


@router.post("/tts", dependencies=[Depends(require_login)], response_class=Response,
             responses={200: {"content": {"audio/mpeg": {}}, "description": "읽은 소리(mp3)"}})
async def text_to_speech(body: TtsRequest) -> Response:
    """글을 소리(mp3)로 바꾼다. 로그인한 가게만 쓸 수 있다(OpenAI 요금이 든다)."""
    try:
        speech = await run_in_threadpool(tts.synthesize, body.text)
    except tts.TtsError as error:
        raise ApiError(error.status, error.code, error.message) from None
    return Response(content=speech.audio, media_type=speech.media_type,
                    headers={"Cache-Control": "no-store", "X-Elapsed-Ms": str(speech.elapsed_ms)})


@router.post("/draft", response_model=DraftResponse, dependencies=[Depends(require_login)])
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


@router.post("/chat", response_model=ChatResponse, dependencies=[Depends(require_login)])
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


@router.post("/experiments/{experiment_id}/explain", response_model=ExplainResponse,
             dependencies=[Depends(require_login)])
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


@router.get("/experiments/{experiment_id}/forecast", dependencies=[Depends(require_login)])
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
