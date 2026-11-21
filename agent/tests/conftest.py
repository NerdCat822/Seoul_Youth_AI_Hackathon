"""테스트 공통 준비.

실제 LLM은 부르지 않는다. 기본은 규칙 기반 경로이고, `fake_llm`을 쓰는 테스트만 가짜 응답을 받는다.
Spring은 `tests/fake_spring.py`의 가짜 서버를 프로세스 안에서 붙인다.
"""
from __future__ import annotations

import os

os.environ["TRYLOG_LLM_WARMUP"] = "0"   # 테스트에서는 실제 LLM을 부르지 않는다.

import pytest  # noqa: E402
from fastapi.testclient import TestClient

from tests.fake_spring import create_fake_spring
from trylog_agent import llm, reply, routes
from trylog_agent.graph.build import reset_graphs
from trylog_agent.main import app
from trylog_agent.tools import spring as spring_tools


@pytest.fixture(autouse=True)
def _isolate(monkeypatch):
    """테스트마다 대화 상태를 비우고, 실제 LLM 호출을 막는다."""
    reset_graphs()
    routes._threads.clear()
    reply._history.clear()
    monkeypatch.setattr(llm, "is_ready", lambda: False)
    yield
    spring_tools.set_spring(None)


@pytest.fixture
def spring():
    fake = create_fake_spring()
    spring_tools.set_spring(spring_tools.SpringClient("http://fake-spring", client=TestClient(fake)))
    return fake


@pytest.fixture
def client(spring):
    return TestClient(app)


@pytest.fixture
def fake_llm(monkeypatch):
    """`llm.parse`를 가짜로 바꾼다. `answers[스키마 이름]`에 값이나 예외, 함수를 넣어 쓴다."""
    answers: dict = {}
    calls: list = []

    def parse(schema, *, system, user, timeout=None):
        calls.append({"schema": schema.__name__, "user": user, "timeout": timeout})
        answer = answers.get(schema.__name__)
        if callable(answer):
            answer = answer(user)
        if answer is None:
            raise llm.LLMUnavailable("NO_FAKE_ANSWER")
        if isinstance(answer, Exception):
            raise answer
        return schema.model_validate(answer)

    monkeypatch.setattr(llm, "is_ready", lambda: True)
    monkeypatch.setattr(llm, "parse", parse)
    answers["calls"] = calls
    return answers
