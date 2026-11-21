"""대화 상태를 어디에 둘지 정한다.

DB 접속 설정(DB_PASSWORD 또는 TRYLOG_AGENT_DB_URL)이 있으면 Postgres에, 없으면 서버 메모리에 둔다.
Postgres에 두면 에이전트를 다시 띄워도, 여러 개 띄워도 대화가 이어진다.

- LangGraph 체크포인트(checkpoints, checkpoint_blobs, checkpoint_writes, checkpoint_migrations):
  대화가 어느 단계에 멈춰 있는지(초안, 질문, 확인 대기)
- conversations: 대화가 어느 가게의 것인지. 다른 가게는 이어 쓸 수 없다
- conversation_turns: 주고받은 말. 답 문장을 쓸 때 최근 대화로 보여 준다

모든 테이블은 업무 테이블과 섞이지 않게 별도 스키마(TRYLOG_AGENT_SCHEMA, 기본 trylog_agent)에 둔다.
오래된 대화(TRYLOG_CHAT_TTL_DAYS, 기본 30일 동안 말이 없던 대화)는 서버를 띄울 때와 새 대화 100개마다 지운다.
"""
from __future__ import annotations

import logging
import threading
from collections import OrderedDict, deque
from typing import Protocol

from langgraph.checkpoint.memory import InMemorySaver

from .settings import get_settings

log = logging.getLogger("trylog.memory")
MAX_MEMORY_THREADS = 300       # 메모리에 둘 때 기억할 대화 수
EXPIRE_EVERY = 100             # 새 대화가 이만큼 생길 때마다 오래된 대화를 지운다


class MemoryUnavailable(Exception):
    """대화 저장소에 연결하지 못했다."""


class Conversations(Protocol):
    def owner(self, thread_id: str) -> int | None: ...
    def claim(self, thread_id: str, store_id: int) -> None: ...
    def history(self, thread_id: str, turns: int) -> list[str]: ...
    def append(self, thread_id: str, owner_text: str, answer_text: str) -> None: ...
    def expire(self) -> list[str]: ...


class MemoryConversations:
    """서버 메모리. 개발과 테스트용이다. 다시 띄우면 사라진다."""

    def __init__(self) -> None:
        self._owners: "OrderedDict[str, int]" = OrderedDict()
        self._turns: dict[str, deque[tuple[str, str]]] = {}
        self._lock = threading.Lock()

    def owner(self, thread_id: str) -> int | None:
        with self._lock:
            return self._owners.get(thread_id)

    def claim(self, thread_id: str, store_id: int) -> None:
        with self._lock:
            self._owners.setdefault(thread_id, store_id)

    def history(self, thread_id: str, turns: int) -> list[str]:
        with self._lock:
            recent = list(self._turns.get(thread_id) or [])[-turns:]
        return [line for owner, answer in recent for line in (f"사장님: {owner}", f"비서: {answer}")]

    def append(self, thread_id: str, owner_text: str, answer_text: str) -> None:
        with self._lock:
            self._turns.setdefault(thread_id, deque(maxlen=20)).append((owner_text, answer_text))
            if thread_id in self._owners:
                self._owners.move_to_end(thread_id)

    def expire(self) -> list[str]:
        with self._lock:
            gone = []
            while len(self._owners) > MAX_MEMORY_THREADS:
                thread_id, _ = self._owners.popitem(last=False)
                self._turns.pop(thread_id, None)
                gone.append(thread_id)
            return gone


class PostgresConversations:
    """Postgres. 테이블은 연결의 search_path(에이전트 스키마)에 만든다."""

    def __init__(self, pool, ttl_days: int) -> None:
        self._pool = pool
        self._ttl_days = ttl_days

    def setup(self) -> None:
        with self._pool.connection() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS conversations (
                    thread_id text PRIMARY KEY,
                    store_id integer NOT NULL,
                    created_at timestamptz NOT NULL DEFAULT now(),
                    updated_at timestamptz NOT NULL DEFAULT now()
                )""")
            conn.execute("""
                CREATE TABLE IF NOT EXISTS conversation_turns (
                    id bigserial PRIMARY KEY,
                    thread_id text NOT NULL REFERENCES conversations(thread_id) ON DELETE CASCADE,
                    owner_text text NOT NULL,
                    answer_text text NOT NULL,
                    created_at timestamptz NOT NULL DEFAULT now()
                )""")
            conn.execute("CREATE INDEX IF NOT EXISTS conversation_turns_thread_idx ON conversation_turns (thread_id, id)")
            conn.execute("CREATE INDEX IF NOT EXISTS conversations_updated_idx ON conversations (updated_at)")

    def owner(self, thread_id: str) -> int | None:
        with self._pool.connection() as conn:
            row = conn.execute("SELECT store_id FROM conversations WHERE thread_id = %s", (thread_id,)).fetchone()
        return None if row is None else int(row["store_id"])

    def claim(self, thread_id: str, store_id: int) -> None:
        with self._pool.connection() as conn:
            conn.execute("INSERT INTO conversations (thread_id, store_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                         (thread_id, store_id))

    def history(self, thread_id: str, turns: int) -> list[str]:
        with self._pool.connection() as conn:
            rows = conn.execute("""
                SELECT owner_text, answer_text FROM conversation_turns
                WHERE thread_id = %s ORDER BY id DESC LIMIT %s""", (thread_id, turns)).fetchall()
        return [line for row in reversed(rows)
                for line in (f"사장님: {row['owner_text']}", f"비서: {row['answer_text']}")]

    def append(self, thread_id: str, owner_text: str, answer_text: str) -> None:
        with self._pool.connection() as conn, conn.transaction():
            conn.execute("INSERT INTO conversation_turns (thread_id, owner_text, answer_text) VALUES (%s, %s, %s)",
                         (thread_id, owner_text, answer_text))
            conn.execute("UPDATE conversations SET updated_at = now() WHERE thread_id = %s", (thread_id,))

    def expire(self) -> list[str]:
        with self._pool.connection() as conn:
            rows = conn.execute("""
                DELETE FROM conversations WHERE updated_at < now() - make_interval(days => %s)
                RETURNING thread_id""", (self._ttl_days,)).fetchall()
        return [row["thread_id"] for row in rows]


_lock = threading.Lock()
_state: dict = {"saver": None, "conversations": None, "pool": None, "kind": None, "error": None, "claims": 0}


def init() -> None:
    """저장소를 연다. 이미 열려 있으면 그대로 둔다. Postgres에 연결하지 못하면 MemoryUnavailable."""
    with _lock:
        if _state["saver"] is not None:
            return
        settings = get_settings()
        if not settings.agent_db_conninfo:
            _state.update(saver=InMemorySaver(), conversations=MemoryConversations(), kind="memory", error=None)
            return
        try:
            from langgraph.checkpoint.postgres import PostgresSaver
            from psycopg.rows import dict_row
            from psycopg_pool import ConnectionPool

            pool = ConnectionPool(settings.agent_db_conninfo, min_size=1, max_size=5, timeout=5, open=True,
                                  kwargs={"autocommit": True, "prepare_threshold": 0, "row_factory": dict_row})
            with pool.connection() as conn:
                conn.execute(f'CREATE SCHEMA IF NOT EXISTS "{settings.agent_schema}"')
            saver = PostgresSaver(pool)
            saver.setup()
            conversations = PostgresConversations(pool, settings.chat_ttl_days)
            conversations.setup()
        except Exception as exc:  # 접속 실패, 권한 부족 등
            _state.update(kind="unavailable", error=type(exc).__name__)
            log.error("대화 저장소(Postgres)를 열지 못했습니다: %s", type(exc).__name__)
            raise MemoryUnavailable(type(exc).__name__) from None
        _state.update(saver=saver, conversations=conversations, pool=pool, kind="postgres", error=None)
    _expire()


def _ready() -> None:
    if _state["saver"] is None:
        init()


def checkpointer():
    _ready()
    return _state["saver"]


def conversations() -> Conversations:
    _ready()
    return _state["conversations"]


def kind() -> str:
    """health 에 보이는 저장소 종류: postgres, memory, unavailable(연결 실패), 아직 열지 않았으면 None."""
    return _state["kind"] or "not-initialized"


def claimed() -> None:
    """새 대화가 생길 때 부른다. 일정 수마다 오래된 대화를 지운다."""
    with _lock:
        _state["claims"] += 1
        due = _state["claims"] % EXPIRE_EVERY == 0
    if due or _state["kind"] == "memory":
        _expire()


def _expire() -> None:
    try:
        gone = _state["conversations"].expire()
        saver = _state["saver"]
        for thread_id in gone:
            saver.delete_thread(thread_id)
        if gone:
            log.info("오래된 대화 %d개를 지웠습니다.", len(gone))
    except Exception as exc:  # 정리는 실패해도 대화는 계속한다
        log.warning("오래된 대화를 지우지 못했습니다: %s", type(exc).__name__)


def close() -> None:
    """서버를 내릴 때 연결을 닫는다. 다시 부르면 새로 연다."""
    with _lock:
        pool = _state["pool"]
        _state.update(saver=None, conversations=None, pool=None, kind=None, error=None, claims=0)
    if pool is not None:
        pool.close()


def reset() -> None:
    """테스트에서 메모리 저장소를 비운다."""
    close()
