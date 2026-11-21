"""사장님께 드리는 답 문장을 Claude(TRYLOG_LLM_MODEL)가 직접 쓴다.

대화의 흐름(무엇을 묻고, 무엇을 저장할지)은 그래프가 정한다. 이 모듈은 그 단계에서 '꼭 전할 내용'과
자료를 LLM에 넘겨 자연스러운 답 문장을 받는다. 숫자는 자료에 있는 것만 허용한다.
LLM을 쓸 수 없거나, 시간이 모자라거나, 자료에 없는 숫자가 나오면 그래프가 정한 기본 문장을 쓴다.
"""
from __future__ import annotations

import logging
import threading
from collections import OrderedDict, deque
from datetime import date

from . import llm
from .tools.guard import allowed_numbers, unknown_numbers

log = logging.getLogger("trylog.reply")
HISTORY_TURNS = 6          # 답을 쓸 때 함께 보여 줄 최근 대화 줄 수
MAX_THREADS = 300

# 단계마다 꼭 전할 내용. 그래프의 기본 문장은 '기본 문장'으로 함께 넘긴다.
MUST_SAY = {
    "GUIDE": ("사장님 말에 자연스럽게 답한다. 인사에는 인사로, 무엇을 하는 서비스인지 물으면 가게에서 바꾼 일을 기록해 "
              "전후 주문을 비교하고 장사 고민에는 해볼 만한 일을 찾아 준다고 짧게 말한다. "
              "마지막에는 가게에서 바꾼 일이나 요즘 장사 고민을 편하게 말해 달라고 한다."),
    "ASKING": "기본 문장의 질문을 빠뜨리지 않고 묻는다. 선택지가 있으면 그대로 말한다.",
    "AWAITING_CONFIRM": ("초안의 제목과 기간을 한 번 짚어 준다. 맞으면 '저장'이라고 말해 달라고 하고, "
                         "틀린 곳이 있으면 고칠 내용을 말해 달라고 한다."),
    "IDEAS": ("고민에 짧게 공감한 뒤, 화면의 제안 카드 가운데 해보고 싶은 번호를 말해 달라고 한다. "
              "다른 가게를 가정한 가상 사례라는 점을 밝힌다. 카드 내용을 번호 목록으로 다시 쓰지 않는다."),
    "SAVED": "기록을 저장했다고 알리고, 자료에 결과 확인일이 있으면 그날 결과를 볼 수 있다고 알려 준다.",
    "CANCELLED": "기록을 저장하지 않았다고 알리고, 언제든 다시 말해도 된다고 한다.",
}

_history: "OrderedDict[str, deque[str]]" = OrderedDict()
_guard = threading.Lock()


def remember(thread_id: str, owner: str, answer: str) -> None:
    """대화의 한 차례를 기억한다. 오래된 대화부터 잊는다."""
    with _guard:
        lines = _history.pop(thread_id, None) or deque(maxlen=HISTORY_TURNS)
        lines.extend([f"사장님: {owner}", f"비서: {answer}"])
        _history[thread_id] = lines
        while len(_history) > MAX_THREADS:
            _history.popitem(last=False)


def recent(thread_id: str) -> list[str]:
    with _guard:
        return list(_history.get(thread_id) or [])


def _days(start: str | None, end: str | None) -> list[int]:
    try:
        length = (date.fromisoformat(end) - date.fromisoformat(start)).days + 1
    except (TypeError, ValueError):
        return []
    return [length] + ([length // 7] if length % 7 == 0 else [])


def situation(status: str, base: str, message: str, values: dict, history: list[str]) -> dict:
    """LLM에 넘길 자료. 답에 쓸 수 있는 사실만 담는다."""
    data: dict = {"단계": status, "꼭 전할 내용": MUST_SAY.get(status, MUST_SAY["GUIDE"]), "기본 문장": base,
                  "사장님 말": message}
    draft = values.get("draft") if status in {"ASKING", "AWAITING_CONFIRM", "SAVED"} else None
    extra = values.get("extra") or {}
    if draft:
        data["초안"] = {"제목": draft.get("title"), "시작일": draft.get("startDate"), "종료일": draft.get("endDate"),
                      "기간(일)": (_days(draft.get("startDate"), draft.get("endDate")) or [None])[0],
                      "대상 메뉴": extra.get("targetMenuName"), "지켜볼 숫자": extra.get("metric")}
    if status == "IDEAS":
        data["화면의 제안 카드"] = [{"번호": i, "제목": idea.get("title")} for i, idea in enumerate(values.get("ideas") or [], 1)]
    experiment = values.get("experiment") or {}
    if status == "SAVED" and experiment.get("checkDate"):
        data["결과 확인일"] = experiment["checkDate"]
    notices = values.get("notices") or []
    if notices:
        data["화면에 따로 보이는 안내"] = notices
    if history:
        data["지난 대화"] = history
    return data


def write(status: str, base: str, message: str, values: dict, thread_id: str,
          timeout: float | None) -> tuple[str, str]:
    """답 문장과 출처("LLM" 또는 "RULES")를 돌려준다."""
    if not llm.is_ready():
        return base, "RULES"
    data = situation(status, base, message, values, recent(thread_id))
    draft = values.get("draft") or {}
    allowed = allowed_numbers([base, message, *data.get("지난 대화", []), *(values.get("notices") or []),
                               draft.get("startDate"), draft.get("endDate"),
                               *_days(draft.get("startDate"), draft.get("endDate")),
                               (values.get("experiment") or {}).get("checkDate"),
                               len(values.get("ideas") or []), *range(1, len(values.get("ideas") or []) + 1)])
    try:
        text = " ".join(llm.compose_reply(data, timeout=timeout).reply.split())
    except llm.LLMUnavailable as error:
        log.info("답 문장을 기본 문장으로 대신합니다: %s", error.reason)
        return base, "RULES"
    if not text or unknown_numbers(text, allowed):
        log.info("답 문장에 쓸 수 없는 내용이 있어 기본 문장을 씁니다.")
        return base, "RULES"
    return text, "LLM"
