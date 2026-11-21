"""환경변수 읽기.

키와 주소는 환경변수로만 받는다. 저장소 루트의 `.env`가 있으면 읽되,
이미 설정된 환경변수는 덮어쓰지 않는다. 값은 어디에도 출력하지 않는다.
"""
from __future__ import annotations

import os
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

PACKAGE_DIR = Path(__file__).resolve().parent
AGENT_DIR = PACKAGE_DIR.parent


def _find_repo_root() -> Path:
    for parent in PACKAGE_DIR.parents:
        if (parent / ".git").exists() or (parent / "HACKATHON_PLAN.md").exists():
            return parent
    return AGENT_DIR.parent


REPO_ROOT = _find_repo_root()


def load_env_files() -> list[str]:
    """`.env` 파일의 `이름=값` 줄을 환경변수로 올린다. 읽은 파일 경로만 돌려준다."""
    loaded = []
    for path in (AGENT_DIR / ".env", REPO_ROOT / ".env"):
        if not path.is_file():
            continue
        for raw in path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            if line.startswith("export "):
                line = line[len("export "):]
            name, value = line.split("=", 1)
            name, value = name.strip(), value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "'\"":
                value = value[1:-1]
            if name and name not in os.environ:
                os.environ[name] = value
        loaded.append(str(path))
    return loaded


def _quote(value: str) -> str:
    """libpq 접속 문자열의 값 하나를 따옴표로 감싼다."""
    return "'" + value.replace("\\", "\\\\").replace("'", "\\'") + "'"


def _agent_db(schema: str) -> str | None:
    """대화 상태를 둘 Postgres 접속 문자열. 설정이 없으면 None(메모리에 둔다).

    TRYLOG_AGENT_DB_URL 이 있으면 그것을, 없으면 Spring과 같은 DB_HOST·DB_PORT·DB_NAME·DB_USER·DB_PASSWORD를 쓴다.
    테이블은 search_path 로 에이전트 스키마에 만든다.
    """
    url = os.getenv("TRYLOG_AGENT_DB_URL", "").strip()
    password = os.getenv("DB_PASSWORD", "")
    if not url and not password:
        return None
    if url:
        return url
    parts = {
        "host": os.getenv("DB_HOST", "localhost"), "port": os.getenv("DB_PORT", "5432"),
        "dbname": os.getenv("DB_NAME", "hgkim_postgresql"), "user": os.getenv("DB_USER", "nerdcat822"),
        "password": password, "connect_timeout": "5", "application_name": "trylog-agent",
        "options": f"-c search_path={schema}",
    }
    return " ".join(f"{key}={_quote(value)}" for key, value in parts.items())


def _flag(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    llm_model: str
    llm_timeout: float
    llm_effort: str
    llm_enabled: bool
    llm_fallback: bool
    llm_warmup: bool
    request_budget: float
    spring_url: str
    spring_timeout: float
    store_id: int
    forecast_source: str
    demo_date: str | None
    csv_dir: Path
    ml_dir: Path
    ml_enabled: bool
    spring_fields: int
    report_preview: bool
    require_login: bool
    agent_db_conninfo: str | None
    agent_schema: str
    chat_ttl_days: int
    stt_model: str
    stt_timeout: float
    stt_max_bytes: int
    tts_model: str
    tts_voice: str
    tts_timeout: float

    @property
    def has_llm_key(self) -> bool:
        return bool(os.getenv("ANTHROPIC_API_KEY", "").strip())


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    load_env_files()
    forecast_source = os.getenv("TRYLOG_FORECAST_SOURCE", "spring").strip().lower()
    schema = os.getenv("TRYLOG_AGENT_SCHEMA", "trylog_agent").strip().lower()
    if not re.fullmatch(r"[a-z_][a-z0-9_]{0,62}", schema):
        raise ValueError("TRYLOG_AGENT_SCHEMA 는 영문 소문자, 숫자, 밑줄만 쓸 수 있어요.")
    if forecast_source not in {"spring", "ml"}:
        forecast_source = "spring"
    return Settings(
        llm_model=os.getenv("TRYLOG_LLM_MODEL", "claude-sonnet-5-5").strip(),
        llm_timeout=float(os.getenv("TRYLOG_LLM_TIMEOUT", "8")),
        llm_effort=os.getenv("TRYLOG_LLM_EFFORT", "low").strip().lower(),
        llm_enabled=_flag("TRYLOG_LLM_ENABLED", True),
        llm_fallback=_flag("TRYLOG_LLM_FALLBACK", True),
        llm_warmup=_flag("TRYLOG_LLM_WARMUP", True),
        # 프런트의 요청 제한이 10초다. 한 요청 안의 LLM 호출을 모두 합쳐 이 시간 안에 끝낸다.
        request_budget=float(os.getenv("TRYLOG_REQUEST_BUDGET", "9")),
        spring_url=os.getenv("TRYLOG_SPRING_URL", "http://127.0.0.1:7000").rstrip("/"),
        spring_timeout=float(os.getenv("TRYLOG_SPRING_TIMEOUT", "3")),
        store_id=int(os.getenv("TRYLOG_STORE_ID", "1")),
        forecast_source=forecast_source,
        demo_date=(os.getenv("TRYLOG_DEMO_DATE") or "").strip() or None,
        csv_dir=Path(os.getenv("CSV_DIR") or (REPO_ROOT / "ml" / "data")).resolve(),
        ml_dir=Path(os.getenv("TRYLOG_ML_DIR") or (REPO_ROOT / "ml")).resolve(),
        ml_enabled=_flag("TRYLOG_ML_ENABLED", True),
        # 아래 둘은 Spring 쪽 계약이 달라졌을 때만 켜는 선택 설정이다. 기본값은 AGENT_API_PLAN.md 그대로다.
        spring_fields=7 if os.getenv("TRYLOG_SPRING_FIELDS", "5").strip() == "7" else 5,
        report_preview=_flag("TRYLOG_REPORT_PREVIEW", False),
        # 공개 주소에 여는 배포에서는 켠다. Spring에 로그인을 확인할 수 없으면 요청을 받지 않는다.
        require_login=_flag("TRYLOG_REQUIRE_LOGIN", False),
        # 멀티턴 대화 상태(LangGraph 체크포인트)를 둘 곳. trylog_agent/memory.py 참고
        agent_db_conninfo=_agent_db(schema),
        agent_schema=schema,
        chat_ttl_days=int(os.getenv("TRYLOG_CHAT_TTL_DAYS", "30")),
        # 음성 입력(OpenAI 음성 전사). 키는 OPENAI_API_KEY 환경변수로만 받는다.
        stt_model=os.getenv("TRYLOG_STT_MODEL", "gpt-4o-mini-transcribe").strip(),
        stt_timeout=float(os.getenv("TRYLOG_STT_TIMEOUT", "20")),
        stt_max_bytes=int(os.getenv("TRYLOG_STT_MAX_BYTES", str(5 * 1024 * 1024))),
        # 답을 소리로 읽기(OpenAI 음성 합성). 같은 OPENAI_API_KEY 를 쓴다.
        tts_model=os.getenv("TRYLOG_TTS_MODEL", "gpt-4o-mini-tts").strip(),
        tts_voice=os.getenv("TRYLOG_TTS_VOICE", "coral").strip(),
        tts_timeout=float(os.getenv("TRYLOG_TTS_TIMEOUT", "20")),
    )
