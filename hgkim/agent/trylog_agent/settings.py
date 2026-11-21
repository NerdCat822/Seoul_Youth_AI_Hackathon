"""환경변수 읽기.

키와 주소는 환경변수로만 받는다. 저장소 루트의 `.env`가 있으면 읽되,
이미 설정된 환경변수는 덮어쓰지 않는다. 값은 어디에도 출력하지 않는다.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

PACKAGE_DIR = Path(__file__).resolve().parent
AGENT_DIR = PACKAGE_DIR.parent


def _find_repo_root() -> Path:
    for parent in PACKAGE_DIR.parents:
        if (parent / ".git").exists() or (parent / "HACKATHON_PLAN.md").exists():
            return parent
    return AGENT_DIR.parent.parent


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

    @property
    def has_llm_key(self) -> bool:
        return bool(os.getenv("ANTHROPIC_API_KEY", "").strip())


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    load_env_files()
    forecast_source = os.getenv("TRYLOG_FORECAST_SOURCE", "spring").strip().lower()
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
        csv_dir=Path(os.getenv("CSV_DIR") or (REPO_ROOT / "jaewon" / "data")).resolve(),
        ml_dir=Path(os.getenv("TRYLOG_ML_DIR") or (REPO_ROOT / "jaewon" / "ml")).resolve(),
        ml_enabled=_flag("TRYLOG_ML_ENABLED", True),
        # 아래 둘은 Spring 쪽 계약이 달라졌을 때만 켜는 선택 설정이다. 기본값은 AGENT_API_PLAN.md 그대로다.
        spring_fields=7 if os.getenv("TRYLOG_SPRING_FIELDS", "5").strip() == "7" else 5,
        report_preview=_flag("TRYLOG_REPORT_PREVIEW", False),
    )
