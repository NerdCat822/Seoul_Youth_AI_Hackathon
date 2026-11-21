"""API 계약과 부록 A 문장. 오늘은 가짜 Spring이 주는 2026-11-21(토)이다.

기본은 규칙 기반 경로(LLM 없음)다. `fake_llm`을 쓰는 테스트는 가짜 LLM 응답을 받는다.
"""
import httpx
import pytest

from tests.fake_spring import DEMO_ID, compute_report
from trylog_agent import llm
from trylog_agent.tools import spring as spring_tools

API = "/api/v1/agent"


def draft(client, text):
    response = client.post(f"{API}/draft", json={"text": text})
    assert response.status_code == 200, response.text
    return response.json()


def chat(client, message, thread_id=None):
    response = client.post(f"{API}/chat", json={"threadId": thread_id, "message": message})
    assert response.status_code == 200, response.text
    return response.json()


# ------------------------------------------------------------------ 부록 A 1~7: 초안

@pytest.mark.parametrize("text,category,code,start,end", [
    ("지난 14일간 쌀떡볶이에 추천 표시 붙였어", "MENU", "A011003", "2026-11-07", "2026-11-20"),
    ("11월 7일부터 20일까지 쌀떡볶이 추천 표시", "MENU", "A011003", "2026-11-07", "2026-11-20"),
    ("오늘부터 치즈돈까스 500원 올렸어. 2주 해볼게", "MENU", "A011009", "2026-11-21", "2026-12-04"),
    ("내일부터 2주 동안 가게 앞에 입간판 세워둘 거야", "OPERATION", None, "2026-11-22", "2026-12-05"),
    ("어제부터 당근마켓에 홍보글 올렸어. 다음 주까지", "MARKETING", None, "2026-11-20", "2026-11-29"),
    ("쌀떡볶이 옆에 추천 스티커 붙였어", "MENU", "A011003", "2026-11-21", "2026-12-04"),
])
def test_appendix_a_drafts(client, text, category, code, start, end):
    body = draft(client, text)
    assert body["intent"] == "RECORD" and body["source"] == "RULES"
    assert set(body["draft"]) == {"title", "category", "startDate", "endDate", "notes"}
    assert body["draft"]["category"] == category
    assert (body["draft"]["startDate"], body["draft"]["endDate"]) == (start, end)
    assert body["extra"]["targetMenuCode"] == code
    assert text in body["draft"]["notes"]
    assert (f"메뉴 코드 {code}" in body["draft"]["notes"]) == (code is not None)
    assert body["missing"] == []


def test_draft_example_matches_plan(client):
    body = draft(client, "지난 14일간 쌀떡볶이에 추천 표시 붙였어")
    assert body["draft"]["title"] == "쌀떡볶이에 추천 표시 붙이기"
    assert body["draft"]["notes"] == "지난 14일간 쌀떡볶이에 추천 표시 붙였어 / 메뉴 코드 A011003"
    assert body["extra"] == {"targetMenuCode": "A011003", "targetMenuName": "쌀떡볶이", "actionType": "MENU_BADGE",
                             "metric": "대상 메뉴가 들어간 주문 수와 비중"}
    assert body["notices"] == ["‘지난 14일간’을 11월 7일부터 11월 20일까지로 잡았어요."]


def test_default_period_notice(client):
    assert "기간을 말하지 않아 2주로 제안했어요." in draft(client, "쌀떡볶이 옆에 추천 스티커 붙였어")["notices"]


def test_ambiguous_menu_is_asked(client):
    body = draft(client, "김밥에 추천 스티커 붙였어")
    assert body["missing"] == ["targetMenu"] and len(body["candidates"]) == 5
    first = chat(client, "김밥에 추천 스티커 붙였어")
    assert first["status"] == "ASKING" and "참치김밥" in first["reply"]
    second = chat(client, "참치김밥", first["threadId"])
    assert second["status"] == "AWAITING_CONFIRM"
    assert second["extra"]["targetMenuCode"] == "A009004" and "메뉴 코드 A009004" in second["draft"]["notes"]


def test_ambiguous_menu_gives_up_after_two_tries(client):
    first = chat(client, "김밥에 추천 스티커 붙였어")
    again = chat(client, "글쎄", first["threadId"])
    assert again["status"] == "ASKING" and again["reply"].startswith("잘 알아듣지 못했어요.")
    done = chat(client, "모르겠어", first["threadId"])
    assert done["status"] == "AWAITING_CONFIRM" and done["extra"]["targetMenuCode"] is None


def test_worry_and_other_have_no_draft(client):
    worry = draft(client, "요즘 화요일 점심이 한산해. 할인 말고 뭐 해볼까?")
    assert worry["intent"] == "WORRY" and worry["draft"] is None
    other = draft(client, "오늘 날씨 어때?")
    assert other["intent"] == "OTHER" and other["draft"] is None


# ------------------------------------------------------------------ 부록 A 8~11: 대화와 저장

def test_revise_then_save_once(client, spring):
    first = chat(client, "오늘부터 치즈돈까스 500원 올렸어. 2주 해볼게")
    tid = first["threadId"]
    assert first["status"] == "AWAITING_CONFIRM" and first["draft"]["endDate"] == "2026-12-04"
    assert spring.state.posts == []

    revised = chat(client, "일주일 더 할게", tid)                      # 8번
    assert revised["status"] == "AWAITING_CONFIRM" and revised["draft"]["endDate"] == "2026-12-11"
    assert spring.state.posts == []

    saved = chat(client, "저장", tid)                                 # 9번
    assert saved["status"] == "SAVED"
    assert saved["experiment"]["status"] == "IN_PROGRESS" and saved["experiment"]["checkDate"] == "2026-12-12"
    assert len(spring.state.posts) == 1
    assert set(spring.state.posts[0]) == {"title", "category", "startDate", "endDate", "notes"}
    assert spring.state.posts[0]["endDate"] == "2026-12-11"

    again = chat(client, "저장", tid)                                 # 10번
    assert again["status"] == "SAVED" and again["experiment"]["id"] == saved["experiment"]["id"]
    assert len(spring.state.posts) == 1
    assert len(spring.state.experiments) == 2                         # 시연 기록 1건 + 방금 저장한 1건


def test_invalid_revision_is_not_applied(client, spring):
    first = chat(client, "지난 14일간 쌀떡볶이에 추천 표시 붙였어")
    bad = chat(client, "종료일을 11월 5일로 해줘", first["threadId"])   # 11번
    assert bad["status"] == "AWAITING_CONFIRM"
    assert "종료일은 시작일과 같거나 이후여야 해요." in bad["notices"]
    assert bad["draft"]["endDate"] == "2026-11-20" and spring.state.posts == []


def test_cancel_and_threads_do_not_mix(client, spring):
    a = chat(client, "오늘부터 치즈돈까스 500원 올렸어. 2주 해볼게")
    b = chat(client, "내일부터 2주 동안 가게 앞에 입간판 세워둘 거야")
    assert a["threadId"] != b["threadId"]
    b2 = chat(client, "제목을 입간판 세우기로 바꿔줘", b["threadId"])
    assert b2["draft"]["title"] == "입간판 세우기"
    a2 = chat(client, "취소", a["threadId"])
    assert a2["status"] == "CANCELLED" and a2["draft"] is None
    b3 = chat(client, "응 저장해줘", b["threadId"])
    assert b3["status"] == "SAVED" and b3["experiment"]["title"] == "입간판 세우기"
    assert b3["experiment"]["status"] == "PLANNED" and len(spring.state.posts) == 1


def test_unknown_thread_starts_new_conversation(client):
    body = chat(client, "저장", "no-such-thread")
    assert body["status"] == "GUIDE" and body["threadId"] != "no-such-thread"


def test_spring_rejection_is_passed_to_owner(client, spring, monkeypatch):
    first = chat(client, "오늘부터 치즈돈까스 500원 올렸어. 2주 해볼게")

    def reject(self, body):
        raise spring_tools.SpringRejected(400, {"code": "VALIDATION_ERROR", "message": "입력 내용을 확인해주세요.",
                                                "fieldErrors": {"title": "같은 제목의 시도가 이미 있어요."}})
    monkeypatch.setattr(spring_tools.SpringClient, "create_experiment", reject)
    failed = chat(client, "저장", first["threadId"])
    assert failed["status"] == "AWAITING_CONFIRM" and failed["notices"] == ["같은 제목의 시도가 이미 있어요."]
    monkeypatch.undo()
    monkeypatch.setattr(llm, "is_ready", lambda: False)
    assert chat(client, "저장", first["threadId"])["status"] == "SAVED"


# ------------------------------------------------------------------ 부록 A 12~13: 고민과 안내

def test_worry_gets_ideas_and_pick_becomes_draft(client, spring):
    ideas = chat(client, "요즘 화요일 점심이 한산해. 할인 말고 뭐 해볼까?")       # 12번
    assert ideas["status"] == "IDEAS" and 1 <= len(ideas["ideas"]) <= 2
    assert all(idea["demo"] for idea in ideas["ideas"])
    picked = chat(client, "1번 해볼게", ideas["threadId"])
    assert picked["status"] == "AWAITING_CONFIRM"
    assert picked["draft"]["title"] == ideas["ideas"][0]["title"]
    assert (picked["draft"]["startDate"], picked["draft"]["endDate"]) == ("2026-11-21", "2026-12-04")
    assert chat(client, "저장", ideas["threadId"])["status"] == "SAVED" and len(spring.state.posts) == 1


def test_other_gets_guide(client):
    body = chat(client, "오늘 날씨 어때?")                                      # 13번
    assert body["status"] == "GUIDE" and body["draft"] is None and "한 문장" in body["reply"]


# ------------------------------------------------------------------ LLM 경로(가짜 응답)와 실패 대비

def test_llm_path_uses_code_for_dates_and_menu(client, fake_llm):
    fake_llm["Understanding"] = {"intent": "RECORD", "title": "치즈돈까스 가격 500원 올리기", "category": "MENU",
                                 "actionType": "PRICE_CHANGE", "targetMenuText": "치즈돈까스", "metric": None,
                                 "startText": "오늘", "endText": None, "durationText": "2주"}
    body = draft(client, "오늘부터 치즈돈까스 500원 올렸어. 2주 해볼게")
    assert body["source"] == "LLM" and body["draft"]["title"] == "치즈돈까스 가격 500원 올리기"
    assert (body["draft"]["startDate"], body["draft"]["endDate"]) == ("2026-11-21", "2026-12-04")
    assert body["extra"]["targetMenuCode"] == "A011009" and body["extra"]["actionType"] == "PRICE_CHANGE"
    assert len(fake_llm["calls"]) == 1                                # 분류와 추출을 한 번의 호출로 한다


def test_llm_expression_fills_what_rules_cannot_read(client, fake_llm):
    fake_llm["Understanding"] = {"intent": "RECORD", "title": "쌀떡볶이에 추천 표시 붙이기", "category": "MENU",
                                 "actionType": "MENU_BADGE", "targetMenuText": "쌀떡볶이", "metric": None,
                                 "startText": "다음 주 월요일", "endText": "12월 25일", "durationText": None}
    body = draft(client, "담주 월욜부터 크리스마스까지 쌀떡볶이에 추천 표시 붙일게")
    assert (body["draft"]["startDate"], body["draft"]["endDate"]) == ("2026-11-23", "2026-12-25")


@pytest.mark.parametrize("reason", ["TIMEOUT", "REFUSAL", "AUTH", "RATE_LIMIT"])
def test_llm_failure_falls_back_to_rules(client, fake_llm, reason):
    fake_llm["Understanding"] = llm.LLMUnavailable(reason)
    body = draft(client, "지난 14일간 쌀떡볶이에 추천 표시 붙였어")
    assert body["source"] == "RULES" and body["extra"]["targetMenuCode"] == "A011003"
    assert (body["draft"]["startDate"], body["draft"]["endDate"]) == ("2026-11-07", "2026-11-20")


def test_llm_revision(client, fake_llm):
    fake_llm["Understanding"] = llm.LLMUnavailable("TIMEOUT")
    first = chat(client, "오늘부터 치즈돈까스 500원 올렸어. 2주 해볼게")
    fake_llm["Revision"] = {"understood": True, "title": None, "category": None, "actionType": None,
                            "targetMenuText": "라볶이", "removeTargetMenu": False, "startText": None, "endText": None,
                            "durationText": None, "extendText": None}
    revised = chat(client, "아 그거 라볶이였어", first["threadId"])
    assert revised["extra"]["targetMenuCode"] == "A011004" and revised["source"] == "LLM"
    fake_llm["Revision"] = {"understood": False, "title": None, "category": None, "actionType": None,
                            "targetMenuText": None, "removeTargetMenu": False, "startText": None, "endText": None,
                            "durationText": None, "extendText": None}
    unclear = chat(client, "음 그게 아닌데", first["threadId"])
    assert unclear["status"] == "AWAITING_CONFIRM" and "알아듣지 못했어요" in unclear["notices"][0]


def test_spring_down(client):
    transport = httpx.MockTransport(lambda request: (_ for _ in ()).throw(httpx.ConnectError("down")))
    spring_tools.set_spring(spring_tools.SpringClient("http://down", client=httpx.Client(transport=transport, base_url="http://down")))
    health = client.get(f"{API}/health").json()
    assert health["status"] == "UP" and health["springToday"] is None and health["dateMatch"] is False
    body = draft(client, "지난 14일간 쌀떡볶이에 추천 표시 붙였어")     # 오늘 날짜는 서재원 코드의 기준일로 대신한다
    assert (body["draft"]["startDate"], body["draft"]["endDate"]) == ("2026-11-07", "2026-11-20")
    first = chat(client, "오늘부터 치즈돈까스 500원 올렸어. 2주 해볼게")
    failed = chat(client, "저장", first["threadId"])
    assert failed["status"] == "AWAITING_CONFIRM" and "저장할 수 없어요" in failed["notices"][0]
    assert client.post(f"{API}/experiments/{DEMO_ID}/explain").status_code == 502
    assert client.get(f"{API}/experiments/{DEMO_ID}/forecast").json()["code"] == "UPSTREAM_ERROR"


# ------------------------------------------------------------------ 계약: health, 오류 형식, 서재원 경로

def test_health_and_date_match(client, spring):
    health = client.get(f"{API}/health").json()
    assert health["status"] == "UP" and health["service"] == "trylog-agent"
    assert health["springToday"] == "2026-11-21" and health["mlBaseToday"] == "2026-11-21" and health["dateMatch"] is True
    spring.state.today = "2026-11-22"
    assert client.get(f"{API}/health").json()["dateMatch"] is False


def test_error_format(client):
    empty = client.post(f"{API}/draft", json={"text": "  "})
    assert empty.status_code == 400
    assert empty.json() == {"code": "VALIDATION_ERROR", "message": "입력 내용을 확인해주세요.",
                            "fieldErrors": {"text": "문장을 입력해주세요."}}
    assert client.post(f"{API}/chat", json={"message": ""}).json()["fieldErrors"] == {"message": "문장을 입력해주세요."}
    assert client.post(f"{API}/draft", json={"text": 3}).json()["code"] == "VALIDATION_ERROR"
    missing = client.get("/api/v1/agent/nothing")
    assert missing.status_code == 404 and missing.json()["code"] == "NOT_FOUND"


def test_ml_routes_are_served(client):
    assert client.get("/api/v1/ml/health").json()["baseToday"] == "2026-11-21"
    forecast = client.post("/api/v1/ml/experiments/11111111-1111-1111-1111-111111111111/forecast").json()
    share = forecast["menuShareComparison"]
    assert (share["beforeTargetOrders"], share["beforeTotalOrders"]) == (42, 615)
    assert (share["afterTargetOrders"], share["afterTotalOrders"]) == (137, 714)
    unknown = client.post("/api/v1/ml/experiments/no-such-id/forecast")
    assert unknown.status_code == 404 and unknown.json()["code"] == "NOT_FOUND"
    bad = client.post("/api/v1/ml/experiments/11111111-1111-1111-1111-111111111111/forecast",
                      params={"start_date": "2026-11-20", "end_date": "2026-11-07"})
    assert bad.status_code == 400 and bad.json()["code"] == "VALIDATION_ERROR"


def test_forecast_maps_spring_experiment_to_sample(client, spring):
    body = client.get(f"{API}/experiments/{DEMO_ID}/forecast").json()
    assert body["matchedMlExperimentId"] == "11111111-1111-1111-1111-111111111111"
    assert body["summary"]["actualTotalSales"] == 9329700
    saved = chat(client, "저장", chat(client, "내일부터 2주 동안 가게 앞에 입간판 세워둘 거야")["threadId"])
    missing = client.get(f"{API}/experiments/{saved['experiment']['id']}/forecast")
    assert missing.status_code == 404
    assert missing.json()["message"] == "이 시도는 표본 자료에 없어 예상 매출을 계산할 수 없어요."


# ------------------------------------------------------------------ 결과 설명과 숫자 대조

def test_fake_spring_report_matches_documented_numbers():
    from datetime import date
    report = compute_report(date(2026, 11, 7), date(2026, 11, 20), "A011003")
    assert (report["before"]["targetOrders"], report["before"]["totalOrders"]) == (42, 615)
    assert (report["after"]["targetOrders"], report["after"]["totalOrders"]) == (137, 714)
    assert (report["before"]["sharePct"], report["after"]["sharePct"], report["shareDeltaPp"]) == (6.83, 19.19, 12.36)
    assert (report["before"]["sales"], report["after"]["sales"], report["excludedRefundLines"]) == (8162800, 9329700, 29)


def test_explain_without_report_is_404(client):
    response = client.post(f"{API}/experiments/{DEMO_ID}/explain")
    assert response.status_code == 404 and response.json()["code"] == "NOT_FOUND"
    assert client.post(f"{API}/experiments/no-such-id/explain").status_code == 404


def _make_report(spring):
    from fastapi.testclient import TestClient
    assert TestClient(spring).post(f"/api/v1/experiments/{DEMO_ID}/report").status_code == 200


def test_explain_rules_path(client, spring):
    _make_report(spring)
    body = client.post(f"{API}/experiments/{DEMO_ID}/explain").json()
    assert body["source"] == "RULES" and body["fallbackUsed"] is False
    for piece in ("쌀떡볶이", "42건", "137건", "6.83%", "19.19%", "12.36%p", "다른 시도 2건"):
        assert piece in body["explanation"]
    assert body["numbers"]["overlappingExperiments"] == 2 and body["numbers"]["shareDeltaPp"] == 12.36
    assert body["numbers"]["expectedSales"] == 9032900 and body["numbers"]["salesDifference"] == 296800
    assert body["numbersSource"] == {"report": "spring", "overlaps": "ml", "forecast": "spring"}
    assert body["nextSuggestion"]


GOOD = {"explanation": "쌀떡볶이가 들어간 주문이 42건에서 137건으로 늘었고, 비중도 6.83%에서 19.19%로 12.36%p 올랐어요. "
                       "다만 같은 기간에 다른 시도 2건이 겹쳐 있어서 추천 표시 때문이라고 단정하기는 어려워요.",
        "nextSuggestion": "추천 표시는 그대로 두고 설명 문구 한 줄만 바꿔 보면 어떨까요?"}
BAD = {"explanation": "쌀떡볶이 주문이 3배 넘게 늘어 140건이 됐어요.", "nextSuggestion": "가격을 500원 내려 보세요."}


def test_explain_llm_text_passes_guard(client, spring, fake_llm):
    _make_report(spring)
    fake_llm["Explanation"] = GOOD
    body = client.post(f"{API}/experiments/{DEMO_ID}/explain").json()
    assert body["source"] == "LLM" and body["fallbackUsed"] is False and body["explanation"] == GOOD["explanation"]
    assert "9,032,900원" in fake_llm["calls"][0]["user"]              # 숫자는 코드가 계산해 넘겨준다


def test_explain_retries_once_then_uses_spring_summary(client, spring, fake_llm):
    _make_report(spring)
    answers = iter([BAD, GOOD])
    fake_llm["Explanation"] = lambda user: next(answers)
    retried = client.post(f"{API}/experiments/{DEMO_ID}/explain").json()
    assert retried["source"] == "LLM" and retried["explanation"] == GOOD["explanation"]
    assert len(fake_llm["calls"]) == 2 and "140" in fake_llm["calls"][1]["user"]

    fake_llm["Explanation"] = BAD                                     # 두 번 다 틀린 숫자
    fallen = client.post(f"{API}/experiments/{DEMO_ID}/explain").json()
    assert fallen["fallbackUsed"] is True and fallen["source"] == "RULES"
    assert fallen["explanation"] == spring.state.reports[DEMO_ID]["summary"]
    assert "140" not in fallen["explanation"] and "500" not in fallen["nextSuggestion"]
