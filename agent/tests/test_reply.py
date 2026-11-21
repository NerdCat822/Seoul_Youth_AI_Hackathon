"""답 문장을 LLM이 직접 쓰는지, 쓸 수 없을 때 기본 문장으로 돌아가는지."""
from __future__ import annotations

import json

from trylog_agent import llm

API = "/api/v1/agent/chat"


def chat(client, message, thread_id=None):
    response = client.post(API, json={"message": message, "threadId": thread_id})
    assert response.status_code == 200, response.text
    return response.json()


def last_reply_request(fake_llm) -> dict:
    calls = [c for c in fake_llm["calls"] if c["schema"] == "Reply"]
    assert calls, "답 문장을 LLM에 맡기지 않았다"
    return json.loads(calls[-1]["user"].split("자료:\n", 1)[1])


def test_small_talk_gets_a_reply_written_by_the_llm(client, fake_llm):
    fake_llm["Reply"] = {"reply": "안녕하세요, 사장님! 요즘 가게에서 바꿔 본 일이나 고민이 있으면 편하게 말씀해 주세요."}
    body = chat(client, "안녕하세요?")
    assert body["status"] == "GUIDE"
    assert body["reply"] == fake_llm["Reply"]["reply"] and body["source"] == "LLM"
    sent = last_reply_request(fake_llm)
    assert sent["단계"] == "GUIDE" and sent["사장님 말"] == "안녕하세요?" and sent["꼭 전할 내용"]


def test_each_turn_sees_the_recent_conversation(client, fake_llm):
    fake_llm["Reply"] = lambda user: {"reply": "네, 사장님. 편하게 말씀해 주세요."}
    first = chat(client, "안녕하세요?")
    chat(client, "넌 똑같은 말만 하니?", first["threadId"])
    history = last_reply_request(fake_llm)["지난 대화"]
    assert history == ["사장님: 안녕하세요?", "비서: 네, 사장님. 편하게 말씀해 주세요."]


def test_a_reply_with_numbers_that_are_not_in_the_facts_is_not_used(client, fake_llm):
    fake_llm["Reply"] = {"reply": "이 방법이면 매출이 30% 오를 거예요!"}
    body = chat(client, "안녕하세요?")
    assert "30" not in body["reply"] and "한 문장" in body["reply"]      # 기본 안내 문장
    assert body["source"] == "RULES"


def test_falls_back_to_the_base_sentence_when_the_llm_fails(client, fake_llm):
    fake_llm["Reply"] = llm.LLMUnavailable("TIMEOUT")
    body = chat(client, "안녕하세요?")
    assert body["status"] == "GUIDE" and "한 문장" in body["reply"] and body["source"] == "RULES"


def test_confirm_step_gets_the_draft_facts_and_may_use_its_dates(client, fake_llm):
    fake_llm["Reply"] = lambda user: {"reply": "쌀떡볶이 추천 표시를 2주 동안 해 보시는 거죠? 맞으면 저장이라고 말씀해 주세요."}
    body = chat(client, "오늘부터 쌀떡볶이에 추천 표시 붙였어")
    assert body["status"] == "AWAITING_CONFIRM"
    sent = last_reply_request(fake_llm)
    assert sent["초안"]["제목"] and sent["초안"]["기간(일)"] == 14
    assert body["reply"].startswith("쌀떡볶이 추천 표시를 2주") and body["source"] == "LLM"
