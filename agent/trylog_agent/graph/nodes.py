"""그래프 노드 함수.

멈춤(`interrupt`)이 있는 노드는 이어갈 때 처음부터 다시 실행된다.
그래서 멈춤 앞에는 글을 만드는 일만 두고, LLM 호출과 저장은 다른 노드에서 한다.
"""
from __future__ import annotations

import re
import time
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from langchain_core.runnables import RunnableConfig
from langgraph.types import interrupt

from .. import llm
from ..settings import get_settings
from ..tools import login, ml, rules
from ..tools.dates import (
    PeriodParts, apply_period_change, fmt_md, fmt_md_w, parse_duration, parse_iso, parse_period, parse_point,
    resolve_new_period, validate_period,
)
from ..tools.guard import allowed_numbers, unknown_numbers
from ..tools.menus import Menu, find_by_code, find_menus, load_menus_csv, menus_from_spring, resolve_choice
from ..tools.spring import SpringError, SpringNotFound, SpringRejected, SpringUnavailable, get_spring
from .state import AgentState, ExplainState

MSG_CONFIRM = "이렇게 적어 둘게요. 맞으면 ‘저장’이라고, 틀린 곳이 있으면 고칠 내용을 말씀해 주세요."
MSG_GUIDE = (
    "가게에서 바꾼 일이나 해볼 일을 한 문장으로 말씀해 주세요. "
    "예: ‘오늘부터 2주 동안 쌀떡볶이에 추천 표시 붙였어’. 장사 고민을 말씀하시면 해볼 만한 일을 찾아 드려요."
)
MSG_CANCELLED = "저장하지 않았어요. 언제든 다시 말씀해 주세요."
MSG_NOT_UNDERSTOOD = "어느 부분을 바꿀지 알아듣지 못했어요. 예: ‘종료일을 12월 5일로’, ‘일주일 더’, ‘제목을 ○○로 바꿔줘’"
MSG_SPRING_DOWN = "지금은 저장할 수 없어요. 잠시 뒤 ‘저장’이라고 다시 말씀해 주세요."
MSG_ASK_TITLE = "어떤 일을 해보셨는지 한 문장으로 말씀해 주세요."
NOTES_MAX, TITLE_MAX = 500, 80


# ---------------------------------------------------------------- 공통 도우미

def remaining(config: RunnableConfig | None) -> float | None:
    """이번 요청에서 LLM에 쓸 수 있는 남은 시간(초)."""
    deadline = ((config or {}).get("configurable") or {}).get("deadline")
    return None if deadline is None else max(0.0, deadline - time.monotonic())


_MENU_TTL = 60.0
_spring_menus: dict[int, tuple[float, tuple[Menu, ...]]] = {}


def get_menus() -> tuple[Menu, ...]:
    """대상 메뉴를 찾을 목록. 로그인한 가게면 Spring이 주는 그 가게의 메뉴를, 아니면 표본 CSV를 쓴다."""
    store_id = login.logged_in_store()
    if store_id is None:
        settings = get_settings()
        return load_menus_csv(str(settings.csv_dir), settings.store_id)
    cached = _spring_menus.get(store_id)
    if cached and time.monotonic() - cached[0] < _MENU_TTL:
        return cached[1]
    try:
        menus = menus_from_spring(get_spring().menus())
    except SpringError:
        return cached[1] if cached else ()
    _spring_menus[store_id] = (time.monotonic(), menus)
    return menus


def resolve_today() -> tuple[date, str | None]:
    """오늘 날짜. Spring `/overview` → 서재원 코드의 기준일 → TRYLOG_DEMO_DATE → 서울 시계 순서로 쓴다."""
    spring_today = None
    try:
        spring_today = get_spring().overview().get("today")
    except SpringError:
        pass
    for value in (spring_today, ml.base_today(), get_settings().demo_date):
        parsed = parse_iso(value)
        if parsed:
            return parsed, spring_today if isinstance(spring_today, str) else None
    return datetime.now(ZoneInfo("Asia/Seoul")).date(), None


def compose_notes(utterances: list[str], menu_code: str | None) -> str:
    """사장님 원문과 메뉴 코드를 메모에 남긴다. Spring 제한인 500자를 넘기지 않는다."""
    tail = f" / 메뉴 코드 {menu_code}" if menu_code else ""
    body = " / ".join(u.strip() for u in utterances if u and u.strip())
    return body[: NOTES_MAX - len(tail)].rstrip() + tail


def validate_draft(draft: dict | None) -> dict[str, str]:
    """Spring과 같은 규칙으로 초안을 검사한다."""
    if not draft:
        return {"title": "해볼 일을 입력해주세요."}
    errors: dict[str, str] = {}
    title = (draft.get("title") or "").strip()
    if not title:
        errors["title"] = "해볼 일을 입력해주세요."
    elif len(title) > TITLE_MAX:
        errors["title"] = "제목은 80자 이내로 입력해주세요."
    if draft.get("category") not in rules.CATEGORIES:
        errors["category"] = "분류를 선택해주세요."
    if len(draft.get("notes") or "") > NOTES_MAX:
        errors["notes"] = "메모는 500자 이내로 입력해주세요."
    errors.update(validate_period(parse_iso(draft.get("startDate")), parse_iso(draft.get("endDate"))))
    return errors


def spring_body(draft: dict, extra: dict) -> dict:
    """Spring `POST /experiments`에 보낼 본문. 기본은 다섯 필드다."""
    body = {key: draft.get(key) for key in ("title", "category", "startDate", "endDate", "notes")}
    if get_settings().spring_fields == 7:
        body["actionType"] = extra.get("actionType") or "OTHER"
        if extra.get("targetMenuCode"):
            body["targetMenuCode"] = extra["targetMenuCode"]
    return body


def _menu_extra(extra: dict, menu: Menu | None) -> dict:
    out = dict(extra)
    out["targetMenuCode"] = menu.code if menu else None
    out["targetMenuName"] = menu.name if menu else None
    out["metric"] = rules.METRIC_MENU if menu else rules.METRIC_STORE
    return out


def run_understand(text: str, today: date, menus: tuple[Menu, ...], timeout: float | None) -> tuple[dict, str]:
    """문장 이해. LLM을 한 번 부르고, 실패하면 규칙으로 넘어간다."""
    if llm.is_ready():
        try:
            result = llm.understand(text, today, [m.name for m in menus], timeout=timeout)
            return result.model_dump(), "LLM"
        except llm.LLMUnavailable:
            pass
    has_menu = find_menus(text, menus).status != "NONE"
    return rules.understand(text, has_menu), "RULES"


def build_draft(understanding: dict, utterances: list[str], today: date, menus: tuple[Menu, ...], source: str) -> dict:
    """뽑은 항목을 초안으로 바꾼다. 날짜와 메뉴 코드는 여기서 코드가 정한다."""
    text = " ".join(utterances)

    parts = parse_period(text, today)
    if parts.start is None:
        parts.start = parse_point(understanding.get("startText"), today, "start")
    if parts.end is None and parts.duration_days is None:
        parts.end = parse_point(understanding.get("endText"), today, "end")
        if parts.end is None:
            parts.duration_days = parse_duration(understanding.get("durationText") or "")
    period = resolve_new_period(parts, today)

    match = find_menus(text, menus, partial=False)
    if match.status == "NONE":
        hint = understanding.get("targetMenuText") if source == "LLM" else text
        if hint:
            match = find_menus(hint, menus, partial=True)
    menu = match.menus[0] if match.status == "ONE" else None
    missing, candidates = [], []
    if match.status == "MANY":
        missing.append("targetMenu")
        candidates = [m.as_dict() for m in match.menus]

    action = understanding.get("actionType") or rules.guess_action(text) or "OTHER"
    category = understanding.get("category") or rules.guess_category(text, menu is not None, action)
    title = (understanding.get("title") or rules.make_title(text) or "").strip()[:TITLE_MAX]
    if not title:
        missing.append("title")

    draft = {
        "title": title,
        "category": category,
        "startDate": period.start.isoformat(),
        "endDate": period.end.isoformat(),
        "notes": compose_notes(utterances, menu.code if menu else None),
    }
    extra = _menu_extra({"actionType": action}, menu)
    if understanding.get("metric") and menu is None:
        extra["metric"] = understanding["metric"]
    return {"draft": draft, "extra": extra, "missing": missing, "candidates": candidates,
            "notices": period.notices, "period_defaulted": period.defaulted}


# ---------------------------------------------------------------- 대화 그래프 노드

def load_context(state: AgentState) -> dict:
    today, _ = resolve_today()
    return {
        "today": today.isoformat(), "utterances": [state["text"]], "intent": None, "understanding": None,
        "draft": None, "extra": {}, "missing": [], "candidates": [], "notices": [], "decision": None, "answer": None,
        "experiment": None, "source": "RULES", "status": None, "reply": None, "ideas": [], "ideas_reply": None,
        "period_defaulted": False, "asked": 0, "save_failed": False,
    }


def classify_intent(state: AgentState, config: RunnableConfig) -> dict:
    """문장이 바꾼 일의 기록인지, 장사 고민인지, 그 밖인지 가른다. 항목도 같은 호출에서 함께 뽑는다."""
    today = date.fromisoformat(state["today"])
    understanding, source = run_understand(state["text"], today, get_menus(), remaining(config))
    return {"understanding": understanding, "intent": understanding["intent"], "source": source}


def route_intent(state: AgentState) -> str:
    return {"RECORD": "extract_draft", "WORRY": "suggest_ideas"}.get(state.get("intent"), "guide")


def extract_draft(state: AgentState) -> dict:
    """뽑은 항목 가운데 초안에 쓸 것만 추린다. LLM은 다시 부르지 않는다."""
    keys = ("intent", "title", "category", "actionType", "targetMenuText", "metric", "startText", "endText", "durationText")
    understanding = state.get("understanding") or {}
    return {"understanding": {key: understanding.get(key) for key in keys}}


def normalize(state: AgentState) -> dict:
    """날짜 표현을 날짜로, 메뉴 이름을 코드로 바꾼다."""
    today = date.fromisoformat(state["today"])
    return build_draft(state["understanding"], state["utterances"], today, get_menus(), state.get("source", "RULES"))


def validate(state: AgentState) -> dict:
    missing = list(state.get("missing") or [])
    errors = validate_draft(state.get("draft"))
    if "title" in errors and "title" not in missing:
        missing.append("title")
    return {"missing": missing}


def route_validate(state: AgentState) -> str:
    return "ask_missing" if state.get("missing") else "confirm"


def ask_missing(state: AgentState) -> dict:
    """질문 하나를 만들고 멈춘다. 답이 오면 초안에 반영한다."""
    missing = state.get("missing") or []
    candidates = [Menu(c["code"], c["name"], "", c.get("price")) for c in state.get("candidates") or []]
    if "targetMenu" in missing:
        question = "어느 메뉴인가요? " + ", ".join(f"{i}. {m.name}" for i, m in enumerate(candidates, 1))
        question += " (메뉴 전체에 해당하면 ‘전체’라고 말씀해 주세요.)"
        if state.get("asked"):
            question = "잘 알아듣지 못했어요. " + question
    else:
        question = MSG_ASK_TITLE
    answer = str(interrupt({"status": "ASKING", "reply": question})).strip()

    if rules.is_cancel_word(answer):
        return {"decision": "CANCEL", "answer": answer}
    if "targetMenu" not in missing:
        # 제목이 비어 있던 경우: 답을 원래 문장에 덧붙여 다시 이해한다.
        return {"decision": None, "answer": answer, "text": f"{state['text']} {answer}".strip(),
                "utterances": [*state["utterances"], answer], "missing": []}

    choice = resolve_choice(answer, candidates)
    if choice is None:
        match = find_menus(answer, get_menus())
        choice = match.menus[0] if match.status == "ONE" else None
    rest = [item for item in missing if item != "targetMenu"]
    utterances = [*state["utterances"], answer]
    draft = dict(state["draft"])
    if isinstance(choice, Menu):
        draft["notes"] = compose_notes(utterances, choice.code)
        return {"decision": None, "answer": answer, "utterances": utterances, "draft": draft, "missing": rest,
                "candidates": [], "extra": _menu_extra(state["extra"], choice), "asked": 0}
    if choice == "NONE" or state.get("asked", 0) >= 1:
        notices = list(state.get("notices") or [])
        if choice != "NONE":
            notices.append("메뉴를 정하지 못해 대상 메뉴 없이 적었어요. 확인할 때 ‘대상 메뉴는 ○○’처럼 말씀해 주세요.")
        draft["notes"] = compose_notes(utterances, None)
        return {"decision": None, "answer": answer, "utterances": utterances, "draft": draft, "missing": rest,
                "candidates": [], "extra": _menu_extra(state["extra"], None), "notices": notices, "asked": 0}
    return {"decision": None, "answer": answer, "asked": state.get("asked", 0) + 1}


def route_ask(state: AgentState) -> str:
    if state.get("decision") == "CANCEL":
        return "cancel"
    if "targetMenu" in (state.get("missing") or []):
        return "ask_missing"
    if not (state.get("draft") or {}).get("title"):
        return "classify_intent"
    return "validate"


def confirm(state: AgentState) -> dict:
    """초안을 보여주고 멈춘다. 저장은 여기서 하지 않는다."""
    answer = str(interrupt({"status": "AWAITING_CONFIRM", "reply": MSG_CONFIRM})).strip()
    return {"decision": rules.classify_confirm(answer), "answer": answer, "notices": [], "save_failed": False}


def route_confirm(state: AgentState) -> str:
    return {"SAVE": "save", "CANCEL": "cancel"}.get(state.get("decision"), "revise")


_TITLE_CHANGE_RE = re.compile(r"제목\S?\s*[‘'\"“]?(.+?)[’'\"”]?\s*(?:으로|로)\s*(?:바꿔|해|변경|수정|고쳐)")
_CATEGORY_CHANGE_RE = re.compile(r"(?:분류|종류|카테고리)\S?\s*(메뉴|운영|홍보|마케팅)")
_MENU_CHANGE_RE = re.compile(r"메뉴|말고|아니|바꿔|변경")
_MENU_REMOVE_RE = re.compile(r"(?:대상\s*)?메뉴\S?\s*(?:빼|없애|지워|없이)")


def revise(state: AgentState, config: RunnableConfig) -> dict:
    """수정 문장에서 바꿀 항목과 값을 뽑아 초안에 반영한다. 규칙을 먼저 쓰고, 모르면 LLM에 묻는다."""
    text = state.get("answer") or ""
    today = date.fromisoformat(state["today"])
    menus = get_menus()
    old_draft, old_extra = dict(state["draft"]), dict(state["extra"])
    draft, extra = dict(old_draft), dict(old_extra)
    start, end = parse_iso(draft["startDate"]), parse_iso(draft["endDate"])
    source = state.get("source", "RULES")
    changes: list[str] = []
    notices: list[str] = []

    parts = parse_period(text, today, month_ref=end)
    title_m, cat_m = _TITLE_CHANGE_RE.search(text), _CATEGORY_CHANGE_RE.search(text)
    new_title = title_m.group(1).strip() if title_m else None
    new_category = {"메뉴": "MENU", "운영": "OPERATION", "홍보": "MARKETING", "마케팅": "MARKETING"}[cat_m.group(1)] if cat_m else None
    menu_hint, remove_menu = None, bool(_MENU_REMOVE_RE.search(text))
    if not remove_menu and _MENU_CHANGE_RE.search(text):
        named = [m for m in find_menus(text, menus, partial=False).menus if m.code != extra.get("targetMenuCode")]
        if len(named) == 1:
            menu_hint = named[0].name

    if parts.empty and not (new_title or new_category or menu_hint or remove_menu):
        try:
            rev = llm.revise(text, old_draft, today, [m.name for m in menus], timeout=remaining(config))
        except llm.LLMUnavailable:
            rev = None
        if rev is not None and rev.understood:
            source = "LLM"
            parts = PeriodParts(
                start=parse_point(rev.startText, today, "start"),
                end=parse_point(rev.endText, today, "end"),
                duration_days=parse_duration(rev.durationText or ""),
                extend_days=parse_period(rev.extendText or "", today).extend_days,
            )
            new_title, new_category = rev.title, rev.category
            menu_hint, remove_menu = rev.targetMenuText, rev.removeTargetMenu
            if rev.actionType:
                extra["actionType"] = rev.actionType

    if not parts.empty:
        new_start, new_end = apply_period_change(parts, start, end, end_defaulted=state.get("period_defaulted", False))
        if (new_start, new_end) != (start, end):
            draft["startDate"], draft["endDate"] = new_start.isoformat(), new_end.isoformat()
            changes.append(f"기간을 {fmt_md_w(new_start)}부터 {fmt_md_w(new_end)}까지로 바꿨어요.")
    if new_title and new_title.strip() != draft["title"]:
        draft["title"] = new_title.strip()[:TITLE_MAX]
        changes.append(f"제목을 ‘{draft['title']}’로 바꿨어요.")
    if new_category and new_category != draft["category"]:
        draft["category"] = new_category
        changes.append(f"분류를 {rules.CATEGORY_LABEL[new_category]}(으)로 바꿨어요.")
    if remove_menu and extra.get("targetMenuCode"):
        extra = _menu_extra(extra, None)
        changes.append("대상 메뉴를 뺐어요.")
    elif menu_hint:
        match = find_menus(menu_hint, menus)
        if match.status == "ONE" and match.menus[0].code != extra.get("targetMenuCode"):
            extra = _menu_extra(extra, match.menus[0])
            changes.append(f"대상 메뉴를 {match.menus[0].name}(으)로 바꿨어요.")
        elif match.status == "MANY":
            notices.append("어느 메뉴인지 정하지 못했어요. " + ", ".join(m.name for m in match.menus) + " 중에서 다시 말씀해 주세요.")
        elif match.status == "NONE":
            notices.append(f"메뉴판에서 ‘{menu_hint}’을(를) 찾지 못했어요.")
    draft["notes"] = compose_notes(state["utterances"], extra.get("targetMenuCode"))

    if not changes:
        return {"notices": notices or [MSG_NOT_UNDERSTOOD], "decision": None}
    errors = validate_draft(draft)
    if errors:
        # 잘못된 수정은 반영하지 않고 이유만 알린다.
        return {"draft": old_draft, "extra": old_extra, "decision": None,
                "notices": [*errors.values(), "초안은 그대로 두었어요."]}
    dates_changed = (draft["startDate"], draft["endDate"]) != (old_draft["startDate"], old_draft["endDate"])
    return {"draft": draft, "extra": extra, "notices": changes + notices, "source": source, "decision": None,
            "period_defaulted": False if dates_changed else state.get("period_defaulted", False)}


def save(state: AgentState) -> dict:
    """Spring에 저장한다. 이미 저장한 대화에서는 다시 저장하지 않는다."""
    if state.get("experiment"):
        return {"status": "SAVED", "save_failed": False}
    try:
        experiment = get_spring().create_experiment(spring_body(state["draft"], state.get("extra") or {}))
    except SpringRejected as exc:
        return {"save_failed": True, "notices": list(exc.field_errors.values()) or [exc.message]}
    except SpringError:
        return {"save_failed": True, "notices": [MSG_SPRING_DOWN]}
    check = parse_iso(experiment.get("checkDate"))
    reply = f"저장했어요. {fmt_md_w(check)}에 결과를 확인할 수 있어요." if check else "저장했어요."
    return {"experiment": experiment, "status": "SAVED", "reply": reply, "notices": [], "save_failed": False}


def route_save(state: AgentState) -> str:
    return "confirm" if state.get("save_failed") else "end"


def cancel(state: AgentState) -> dict:
    return {"status": "CANCELLED", "reply": MSG_CANCELLED, "notices": []}


def guide(state: AgentState) -> dict:
    return {"status": "GUIDE", "reply": MSG_GUIDE, "draft": None, "notices": []}


def _rule_ideas(text: str, cases: list[dict]) -> list[dict]:
    """LLM 없이 사례를 고른다. 사장님이 '말고'라고 한 방법은 빼고, 돈이 들지 않고 쉬운 것부터 고른다."""
    banned = re.findall(r"([가-힣]{2,})\s*말고", text)
    pool = [c for c in cases if not any(word in f"{c.get('title', '')}{c.get('summary', '')}" for word in banned)] or cases
    order = {"EASY": 0, "PREPARE": 1, "PLAN": 2}
    pool = sorted(pool, key=lambda c: (c.get("cost") or 0, order.get(c.get("difficulty"), 3)))
    return [{"case": c, "reason": c.get("summary") or ""} for c in pool[:2]]


def suggest_ideas(state: AgentState, config: RunnableConfig) -> dict:
    """가상 사례 가운데 고민에 맞는 것을 최대 2개 고른다. 사례에 적힌 숫자만 쓴다."""
    try:
        cases = get_spring().cases()
    except SpringError:
        cases = []
    if not cases:
        return {"status": "GUIDE", "ideas": [], "notices": [],
                "reply": "지금은 사례를 불러올 수 없어요. 해보고 싶은 일을 한 문장으로 말씀해 주시면 기록해 드릴게요."}
    by_id = {str(c.get("id")): c for c in cases}
    picks, source = [], "RULES"
    if llm.is_ready():
        try:
            result = llm.pick_ideas(state["text"], cases, timeout=remaining(config))
            for pick in result.picks[:2]:
                case = by_id.get(str(pick.caseId))
                if case is None or any(p["case"] is case for p in picks):
                    continue
                reason = pick.reason.strip()
                if not reason or unknown_numbers(reason, allowed_numbers(case.values())):
                    reason = case.get("summary") or ""
                picks.append({"case": case, "reason": reason})
            source = "LLM"
        except llm.LLMUnavailable:
            picks = []
    if not picks:
        picks, source = _rule_ideas(state["text"], cases), "RULES"
    ideas = [{
        "id": p["case"].get("id"), "title": p["case"].get("title"), "category": p["case"].get("category"),
        "difficulty": p["case"].get("difficulty"), "cost": p["case"].get("cost"),
        "durationDays": p["case"].get("durationDays"), "summary": p["case"].get("summary"), "reason": p["reason"],
        "demo": True,
    } for p in picks]
    lines = [f"{i}. {idea['title']} — {idea['reason']}" for i, idea in enumerate(ideas, 1)]
    reply = "이런 시도는 어떠세요?\n" + "\n".join(lines) + "\n해보고 싶은 번호를 말씀해 주세요. (다른 가게를 가정한 가상 사례예요.)"
    return {"ideas": ideas, "ideas_reply": reply, "source": source, "status": None, "notices": []}


def route_ideas(state: AgentState) -> str:
    return "await_idea" if state.get("ideas") else "end"


def await_idea(state: AgentState) -> dict:
    """제안을 보여주고 멈춘다. 사장님이 고르면 그 사례로 초안을 만든다."""
    ideas = state.get("ideas") or []
    answer = str(interrupt({"status": "IDEAS", "reply": state.get("ideas_reply")})).strip()
    if rules.is_cancel_word(answer):
        return {"decision": "CANCEL", "answer": answer}
    picked = None
    m = re.search(r"(\d)\s*번?|(첫|두)\s*번째", answer)
    if m:
        index = int(m.group(1)) if m.group(1) else {"첫": 1, "두": 2}[m.group(2)]
        picked = ideas[index - 1] if 1 <= index <= len(ideas) else None
    if picked is None:
        named = [i for i in ideas if i.get("title") and (i["title"] in answer or answer in i["title"]) and len(answer) >= 2]
        picked = named[0] if len(named) == 1 else None
    if picked is None and len(ideas) == 1 and rules.is_save_word(answer):
        picked = ideas[0]
    if picked is None:
        # 고르지 않고 새로 말한 문장은 처음부터 다시 이해한다.
        return {"decision": None, "answer": answer, "text": answer, "utterances": [answer], "ideas": []}

    today = date.fromisoformat(state["today"])
    days = picked.get("durationDays") if isinstance(picked.get("durationDays"), int) and picked["durationDays"] > 0 else 14
    title = str(picked.get("title") or "")[:TITLE_MAX]
    action = rules.guess_action(title) or "OTHER"
    category = picked.get("category") if picked.get("category") in rules.CATEGORIES else rules.guess_category(title, False, action)
    utterances = [*state["utterances"], f"가상 사례 참고: {title}"]
    draft = {
        "title": title, "category": category, "startDate": today.isoformat(),
        "endDate": (today + timedelta(days=days - 1)).isoformat(), "notes": compose_notes(utterances, None),
    }
    return {"decision": "PICK", "answer": answer, "utterances": utterances, "draft": draft, "missing": [],
            "extra": _menu_extra({"actionType": action}, None), "period_defaulted": True,
            "notices": [f"사례에 적힌 대로 오늘부터 {days}일로 잡았어요."]}


def route_idea_answer(state: AgentState) -> str:
    return {"CANCEL": "cancel", "PICK": "validate"}.get(state.get("decision"), "classify_intent")


# ---------------------------------------------------------------- 결과 설명 그래프 노드

def _won(value) -> str:
    return f"{int(value):,}원"


def _signed(value, unit: str) -> str:
    return f"{'+' if value >= 0 else '−'}{abs(value):,}{unit}" if isinstance(value, int) else f"{'+' if value >= 0 else '−'}{abs(value):.2f}{unit}"


def _josa(word: str, with_final: str, without_final: str) -> str:
    last = word[-1:] if word else ""
    has_final = "가" <= last <= "힣" and (ord(last) - ord("가")) % 28 != 0
    return with_final if has_final else without_final


def collect_numbers(state: ExplainState) -> dict:
    """Spring 보고서와 겹친 시도 목록을 모은다. 숫자는 모두 여기서 정해진다."""
    settings, spring = get_settings(), get_spring()
    experiment_id = state["experiment_id"]
    try:
        experiment = spring.get_experiment(experiment_id)
    except SpringNotFound:
        return {"error": {"status": 404, "code": "NOT_FOUND", "message": "시도를 찾을 수 없어요."}}
    except SpringError:
        return {"error": {"status": 502, "code": "UPSTREAM_ERROR", "message": "Spring 서버가 응답하지 않아요."}}
    try:
        try:
            report = spring.get_report(experiment_id)
        except SpringNotFound:
            if not settings.report_preview:
                raise
            report = spring.get_report_preview(experiment_id)
    except (SpringNotFound, SpringRejected):
        return {"error": {"status": 404, "code": "NOT_FOUND",
                          "message": "아직 결과 보고서가 없어요. 판매 자료를 올린 뒤 다시 시도해 주세요."}}
    except SpringError:
        return {"error": {"status": 502, "code": "UPSTREAM_ERROR", "message": "Spring 서버가 응답하지 않아요."}}

    before, after = report.get("before") or {}, report.get("after") or {}
    start, end = experiment.get("startDate"), experiment.get("endDate")
    sample = ml.match_sample_experiment(experiment)
    numbers_source = {"report": "spring", "overlaps": None, "forecast": None}
    overlaps: list[dict] = []
    if sample is not None:
        overlaps = ml.overlapping_samples(start, end, exclude_id=sample.get("id"))
        numbers_source["overlaps"] = "ml"
    else:
        try:
            for other in spring.list_experiments():
                if other.get("id") == experiment_id:
                    continue
                if (other.get("startDate") or "9999") <= (end or "") and (other.get("endDate") or "") >= (start or "9999"):
                    overlaps.append({"id": other.get("id"), "title": other.get("title")})
            numbers_source["overlaps"] = "spring"
        except SpringError:
            overlaps = []

    numbers = {
        "beforeTargetOrders": before.get("targetOrders"), "afterTargetOrders": after.get("targetOrders"),
        "beforeTotalOrders": before.get("totalOrders"), "afterTotalOrders": after.get("totalOrders"),
        "beforeSharePct": before.get("sharePct"), "afterSharePct": after.get("sharePct"),
        "shareDeltaPp": report.get("shareDeltaPp"),
        "beforeSales": before.get("sales"), "afterSales": after.get("sales"),
        "excludedRefundLines": report.get("excludedRefundLines"),
        "overlappingExperiments": len(overlaps),
    }

    # 평소 예상 대비 매출은 한 출처의 숫자만 쓴다.
    forecast = None
    if settings.forecast_source == "spring":
        try:
            hist = spring.demo_forecast().get("historical") or {}
            if hist.get("startDate") == start and hist.get("endDate") == end:
                forecast = {"actual": hist.get("actual"), "expected": hist.get("expected"), "difference": hist.get("difference")}
        except SpringError:
            forecast = None
    elif sample is not None and ml.ml_ready():
        try:
            summary = ml.forecast(sample["id"]).get("summary") or {}
            if summary.get("confirmedDays"):
                forecast = {"actual": summary.get("actualTotalSales"), "expected": summary.get("confirmedExpectedSales"),
                            "difference": summary.get("diffAmount")}
        except Exception:
            forecast = None
    if forecast and all(isinstance(forecast[k], (int, float)) for k in ("actual", "expected", "difference")):
        numbers.update(actualSales=forecast["actual"], expectedSales=forecast["expected"], salesDifference=forecast["difference"])
        numbers_source["forecast"] = settings.forecast_source
    else:
        forecast = None

    menu = find_by_code(report.get("targetMenuCode") or ml.menu_code_in_notes(experiment.get("notes")), get_menus())
    facts: dict = {
        "시도": {"제목": experiment.get("title"), "기간": f"{start} ~ {end}", "대상 메뉴": menu.name if menu else None},
        "변경 전": _period_facts(before),
        "변경 후": _period_facts(after),
        "주문 비중 변화": _delta_words(report.get("shareDeltaPp")),
        "같은 기간에 겹친 다른 시도": {"건수": f"{len(overlaps)}건", "제목": [o.get("title") for o in overlaps]},
    }
    if forecast:
        facts["평소 예상 대비 매출"] = {"실제": _won(forecast["actual"]), "예상": _won(forecast["expected"]),
                                  "차이": _signed(int(forecast["difference"]), "원")}
    s, e = parse_iso(start), parse_iso(end)
    if s and e:
        facts["시도"]["기간 길이"] = f"{(e - s).days + 1}일"
    allowed = sorted(allowed_numbers([_flatten(facts), *[v for v in numbers.values()]]))
    return {
        "experiment": experiment, "report": report, "numbers": numbers, "numbers_source": numbers_source,
        "facts": facts, "allowed": allowed, "overlap_titles": [str(o.get("title")) for o in overlaps],
        "menu_name": menu.name if menu else None,
        "action_type": (sample or {}).get("action_type") or rules.guess_action(str(experiment.get("title") or "")),
        "attempts": 0, "feedback": None, "fallback_used": False, "error": None,
    }


def _delta_words(delta) -> str | None:
    if not isinstance(delta, (int, float)):
        return None
    return f"{abs(delta)}%p {'올랐음' if delta > 0 else '내렸음' if delta < 0 else '변화 없음'}"


def _period_facts(side: dict) -> dict:
    out = {"기간": f"{side.get('startDate')} ~ {side.get('endDate')}"}
    if isinstance(side.get("targetOrders"), int):
        out["대상 메뉴가 들어간 주문"] = f"{side['targetOrders']}건"
    if isinstance(side.get("totalOrders"), int):
        out["전체 주문"] = f"{side['totalOrders']}건"
    if isinstance(side.get("sharePct"), (int, float)):
        out["주문 비중"] = f"{side['sharePct']}%"
    if isinstance(side.get("sales"), (int, float)):
        out["매출"] = _won(side["sales"])
    return out


def _flatten(value) -> str:
    if isinstance(value, dict):
        return " ".join(_flatten(v) for v in value.values())
    if isinstance(value, (list, tuple)):
        return " ".join(_flatten(v) for v in value)
    return "" if value is None else str(value)


def rule_explanation(numbers: dict, menu_name: str | None) -> str | None:
    """LLM 없이 숫자만 끼워 넣어 쓰는 설명문."""
    b, a = numbers.get("beforeTargetOrders"), numbers.get("afterTargetOrders")
    bs, as_, delta = numbers.get("beforeSharePct"), numbers.get("afterSharePct"), numbers.get("shareDeltaPp")
    if not all(isinstance(v, (int, float)) for v in (b, a, bs, as_, delta)):
        return None
    target = menu_name or "대상 메뉴"
    orders = "늘었" if a > b else "줄었" if a < b else "그대로였"
    share = "올랐" if delta > 0 else "내렸" if delta < 0 else "그대로였"
    first = (f"{target}{_josa(target, '이', '가')} 들어간 주문이 {b}건에서 {a}건으로 {orders}고, "
             f"전체 주문에서 차지하는 비중은 {bs}%에서 {as_}%로 {abs(delta)}%p {share}어요.")
    overlaps = numbers.get("overlappingExperiments") or 0
    if overlaps:
        second = f"다만 같은 기간에 다른 시도 {overlaps}건이 겹쳐 있어서, 이 변화가 모두 이번 시도 때문이라고 보기는 어려워요."
    else:
        second = "다만 날씨나 요일 같은 다른 요인도 있을 수 있어서, 이번 시도 때문이라고 단정하기는 어려워요."
    return f"{first} {second}"


def rule_next_suggestion(action_type: str | None, menu_name: str | None) -> str:
    target = menu_name or "그 메뉴"
    return {
        "MENU_BADGE": f"추천 표시는 그대로 두고 {target} 설명 문구 한 줄만 바꿔서 같은 숫자를 다시 보면 어떨까요?",
        "PRICE_CHANGE": f"가격은 그대로 두고 {target} 옆에 추천 표시만 붙여서 같은 숫자를 다시 보면 어떨까요?",
        "SET_BUNDLE": "세트 구성은 그대로 두고 메뉴판에서 세트 자리만 위로 옮겨서 같은 숫자를 다시 보면 어떨까요?",
        "STORE_SIGNAGE": "입간판은 그대로 두고 적힌 문구 한 줄만 바꿔서 같은 숫자를 다시 보면 어떨까요?",
        "LOCAL_PROMO": "홍보는 그대로 두고 올리는 요일만 바꿔서 같은 숫자를 다시 보면 어떨까요?",
    }.get(action_type or "", "이번에 바꾼 것은 그대로 두고 한 가지만 더 바꿔서 같은 숫자를 다시 보면 어떨까요?")


def write_explanation(state: ExplainState, config: RunnableConfig) -> dict:
    """두세 문장의 설명과 다음 시도 제안 하나를 쓴다."""
    attempts = state.get("attempts", 0) + 1
    if llm.is_ready():
        try:
            result = llm.explain(state["facts"], feedback=state.get("feedback"), timeout=remaining(config))
            return {"explanation": result.explanation.strip(), "next_suggestion": result.nextSuggestion.strip(),
                    "source": "LLM", "attempts": attempts}
        except llm.LLMUnavailable:
            pass
    text = rule_explanation(state["numbers"], state.get("menu_name")) or str(state["report"].get("summary") or "")
    return {"explanation": text, "next_suggestion": rule_next_suggestion(state.get("action_type"), state.get("menu_name")),
            "source": "RULES", "attempts": 99}


def check_numbers(state: ExplainState, config: RunnableConfig) -> dict:
    """설명문의 숫자를 모두 꺼내 입력 숫자와 비교한다. 한 번 다시 쓰게 하고, 또 틀리면 대체 문구를 쓴다."""
    allowed = set(state.get("allowed") or [])
    unknown = unknown_numbers(f"{state.get('explanation', '')} {state.get('next_suggestion', '')}", allowed)
    if not unknown and state.get("explanation"):
        return {"passed": True}
    left = remaining(config)
    if state.get("source") == "LLM" and state.get("attempts", 0) < 2 and (left is None or left >= llm.MIN_CALL_SECONDS):
        return {"passed": False, "feedback": ", ".join(unknown) or "빈 글"}
    summary = str(state["report"].get("summary") or "") or rule_explanation(state["numbers"], state.get("menu_name")) or ""
    return {"passed": True, "explanation": summary, "source": "RULES", "fallback_used": True,
            "next_suggestion": rule_next_suggestion(state.get("action_type"), state.get("menu_name"))}


def route_collect(state: ExplainState) -> str:
    return "end" if state.get("error") else "write_explanation"


def route_check(state: ExplainState) -> str:
    return "end" if state.get("passed") else "write_explanation"
