"""대화 상태를 Postgres에 둘 때: 서버를 다시 띄워도 대화가 이어지는지.

실제 Postgres가 필요하다. TRYLOG_TEST_DB_URL(libpq 접속 문자열)을 주었을 때만 돈다.
테스트마다 임시 스키마를 만들고 끝나면 지운다. 실제 서비스 스키마는 건드리지 않는다.
"""
from __future__ import annotations

import dataclasses
import os
import uuid

import pytest

from trylog_agent import memory, routes
from trylog_agent.graph.build import reset_graphs
from trylog_agent.settings import get_settings

BASE_URL = os.getenv("TRYLOG_TEST_DB_URL", "")
pytestmark = pytest.mark.skipif(not BASE_URL, reason="TRYLOG_TEST_DB_URL 이 없어 Postgres 테스트를 건너뜀")
API = "/api/v1/agent/chat"


@pytest.fixture
def postgres_memory(monkeypatch):
    import psycopg
    from psycopg.conninfo import make_conninfo

    schema = f"test_trylog_agent_{uuid.uuid4().hex[:8]}"
    settings = dataclasses.replace(get_settings(), agent_schema=schema,
                                   agent_db_conninfo=make_conninfo(BASE_URL, options=f"-c search_path={schema}"))
    monkeypatch.setattr(memory, "get_settings", lambda: settings)
    reset_graphs()
    yield schema
    memory.close()
    with psycopg.connect(BASE_URL, autocommit=True) as conn:
        conn.execute(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE')


def restart_agent():
    """프로세스 안의 상태를 모두 버린다. 서버를 다시 띄운 것과 같다."""
    reset_graphs()
    routes._threads.clear()


def test_a_draft_survives_an_agent_restart(client, spring, postgres_memory):
    first = client.post(API, json={"message": "오늘부터 2주 동안 쌀떡볶이에 추천 표시를 붙였어"}).json()
    assert first["status"] == "AWAITING_CONFIRM"
    assert memory.kind() == "postgres"

    restart_agent()

    saved = client.post(API, json={"threadId": first["threadId"], "message": "저장"}).json()
    assert saved["threadId"] == first["threadId"]          # 같은 대화로 이어졌다
    assert saved["status"] == "SAVED" and saved["experiment"]["title"] == first["draft"]["title"]

    history = memory.conversations().history(first["threadId"], 5)
    assert history[0] == "사장님: 오늘부터 2주 동안 쌀떡볶이에 추천 표시를 붙였어" and history[-2] == "사장님: 저장"


def test_tables_live_in_the_agent_schema_only(client, spring, postgres_memory):
    import psycopg

    client.post(API, json={"message": "안녕하세요?"})
    with psycopg.connect(BASE_URL) as conn:
        tables = {row[0] for row in conn.execute(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = %s", (postgres_memory,))}
    assert {"checkpoints", "checkpoint_blobs", "checkpoint_writes", "checkpoint_migrations",
            "conversations", "conversation_turns"} <= tables


def test_another_store_cannot_continue_a_stored_conversation(client, spring, postgres_memory, monkeypatch):
    first = client.post(API, json={"message": "오늘부터 2주 동안 쌀떡볶이에 추천 표시를 붙였어"}).json()
    restart_agent()
    monkeypatch.setattr(routes.login, "current_store_id", lambda: 2)
    other = client.post(API, json={"threadId": first["threadId"], "message": "저장"}).json()
    assert other["threadId"] != first["threadId"] and other["status"] != "SAVED"
