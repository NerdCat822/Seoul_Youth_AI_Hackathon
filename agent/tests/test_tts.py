"""답 읽기 경로(/api/v1/agent/tts). 실제 OpenAI는 부르지 않고 가짜 응답을 쓴다."""
from __future__ import annotations

import json

import httpx
import pytest

from tests.test_login import COOKIE, connect, login_spring
from trylog_agent.settings import get_settings
from trylog_agent.tools import tts

URL = "/api/v1/agent/tts"
SIGNED_IN = {"Cookie": COOKIE, "X-CSRF-TOKEN": "token"}
MP3 = b"ID3\x04\x00fake-mp3"


@pytest.fixture
def openai(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    state = {"calls": [], "reply": httpx.Response(200, content=MP3, headers={"Content-Type": "audio/mpeg"})}

    def handler(request: httpx.Request) -> httpx.Response:
        state["calls"].append(request)
        return state["reply"]

    tts.set_client(httpx.Client(transport=httpx.MockTransport(handler)))
    yield state
    tts.set_client(None)


def test_reads_the_reply_aloud_as_mp3(openai):
    response = connect(login_spring()).post(URL, headers=SIGNED_IN, json={"text": "이렇게 적어 둘게요.\n맞으면 ‘저장’이라고 말씀해 주세요."})
    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == "audio/mpeg" and response.content == MP3
    assert response.headers["cache-control"] == "no-store"
    sent = json.loads(openai["calls"][0].content)
    assert openai["calls"][0].headers["authorization"] == "Bearer test-key"
    assert sent["model"] == get_settings().tts_model and sent["voice"] == get_settings().tts_voice
    assert sent["response_format"] == "mp3" and sent["instructions"]
    assert sent["input"] == "이렇게 적어 둘게요. 맞으면 저장이라고 말씀해 주세요."   # 줄바꿈과 따옴표를 덜어 냈다


def test_needs_a_login_and_does_not_call_openai_without_one(openai):
    response = connect(login_spring()).post(URL, json={"text": "안녕하세요"})
    assert response.status_code == 401 and response.json()["code"] == "UNAUTHENTICATED"
    assert openai["calls"] == []


@pytest.mark.parametrize("text", [None, "", "  \n ", "가" * (tts.TEXT_MAX + 1)])
def test_rejects_empty_or_too_long_text_before_calling_openai(openai, text):
    response = connect(login_spring()).post(URL, headers=SIGNED_IN, json={"text": text})
    assert response.status_code == 400 and response.json()["code"] == "VALIDATION_ERROR"
    assert openai["calls"] == []


def test_reports_upstream_problems_without_leaking_details(openai):
    client = connect(login_spring())
    openai["reply"] = httpx.Response(429, json={"error": {"message": "Rate limit reached for org-secret"}})
    busy = client.post(URL, headers=SIGNED_IN, json={"text": "안녕하세요"})
    assert busy.status_code == 503 and busy.json()["code"] == "TTS_BUSY" and "org-secret" not in busy.text
    openai["reply"] = httpx.Response(500, text="boom")
    assert client.post(URL, headers=SIGNED_IN, json={"text": "안녕하세요"}).status_code == 502


def test_is_unavailable_without_an_openai_key(openai, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY")
    response = connect(login_spring()).post(URL, headers=SIGNED_IN, json={"text": "안녕하세요"})
    assert response.status_code == 503 and response.json()["code"] == "TTS_UNAVAILABLE"
    assert openai["calls"] == []
