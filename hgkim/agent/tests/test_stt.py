"""음성 전사 경로(/api/v1/agent/stt). 실제 OpenAI는 부르지 않고 가짜 응답을 쓴다."""
from __future__ import annotations

import dataclasses

import httpx
import pytest
from fastapi.testclient import TestClient

from tests.test_login import COOKIE, connect, login_spring
from trylog_agent import routes
from trylog_agent.settings import get_settings
from trylog_agent.tools import stt

URL = "/api/v1/agent/stt"
SIGNED_IN = {"Cookie": COOKIE, "X-CSRF-TOKEN": "token"}


@pytest.fixture
def openai(monkeypatch):
    """가짜 OpenAI. 받은 요청을 `calls`에 남기고, `reply`로 응답을 바꿀 수 있다."""
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    state = {"calls": [], "reply": httpx.Response(200, json={"text": " 오늘부터 매운국수에 추천 표시를 붙였어요. "})}

    def handler(request: httpx.Request) -> httpx.Response:
        state["calls"].append(request)
        return state["reply"]

    stt.set_client(httpx.Client(transport=httpx.MockTransport(handler)))
    yield state
    stt.set_client(None)


def upload(client: TestClient, data: bytes = b"\x1aE\xdf\xa3 fake webm", content_type: str = "audio/webm;codecs=opus",
           headers: dict | None = None):
    return client.post(URL, headers=SIGNED_IN if headers is None else headers,
                       files={"audio": ("voice.webm", data, content_type)})


def test_transcribes_korean_speech_with_the_stores_menu_names_as_a_hint(openai):
    response = upload(connect(login_spring()))
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["text"] == "오늘부터 매운국수에 추천 표시를 붙였어요."
    assert body["model"] == get_settings().stt_model and body["elapsedMs"] >= 0

    sent = openai["calls"][0]
    assert sent.url == httpx.URL(stt.API_URL)
    assert sent.headers["authorization"] == "Bearer test-key"
    form = sent.content.decode("utf-8", "replace")
    assert 'name="language"\r\n\r\nko' in form
    assert f'name="model"\r\n\r\n{get_settings().stt_model}' in form
    assert "가게 메뉴: 매운국수" in form                     # 로그인한 가게의 메뉴를 힌트로 보냈다
    assert 'filename="voice.webm"' in form


def test_needs_a_login_and_does_not_call_openai_without_one(openai):
    response = upload(connect(login_spring()), headers={})
    assert response.status_code == 401 and response.json()["code"] == "UNAUTHENTICATED"
    assert openai["calls"] == []


@pytest.mark.parametrize("data, content_type, status", [
    (b"", "audio/webm", 400),                      # 빈 녹음
    (b"%PDF-1.7", "application/pdf", 400),         # 소리가 아닌 파일
])
def test_rejects_unusable_uploads_before_calling_openai(openai, data, content_type, status):
    response = upload(connect(login_spring()), data=data, content_type=content_type)
    assert response.status_code == status and response.json()["code"] == "VALIDATION_ERROR"
    assert openai["calls"] == []


def test_rejects_recordings_over_the_size_limit(openai, monkeypatch):
    small = dataclasses.replace(get_settings(), stt_max_bytes=10)
    monkeypatch.setattr(routes, "get_settings", lambda: small)
    monkeypatch.setattr(stt, "get_settings", lambda: small)
    response = upload(connect(login_spring()), data=b"x" * 11)
    assert response.status_code == 413
    assert openai["calls"] == []


def test_reports_upstream_problems_without_leaking_details(openai):
    client = connect(login_spring())
    openai["reply"] = httpx.Response(429, json={"error": {"message": "Rate limit reached for org-secret"}})
    busy = upload(client)
    assert busy.status_code == 503 and busy.json()["code"] == "STT_BUSY" and "org-secret" not in busy.text
    openai["reply"] = httpx.Response(500, text="boom")
    down = upload(client)
    assert down.status_code == 502 and down.json()["code"] == "UPSTREAM_ERROR"


def test_is_unavailable_without_an_openai_key(openai, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY")
    response = upload(connect(login_spring()))
    assert response.status_code == 503 and response.json()["code"] == "STT_UNAVAILABLE"
    assert openai["calls"] == []


def test_menu_hint_is_short_and_has_no_duplicates():
    assert stt.menu_prompt([]) is None
    assert stt.menu_prompt(["쌀떡볶이", "쌀떡볶이", " 치즈돈까스 "]) == "가게 메뉴: 쌀떡볶이, 치즈돈까스"
    assert len(stt.menu_prompt([f"메뉴{i:03d}" for i in range(500)])) <= stt.PROMPT_MAX
