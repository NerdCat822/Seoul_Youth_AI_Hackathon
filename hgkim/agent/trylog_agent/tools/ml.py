"""서재원의 예측 코드 호출과 시도 ID 맞추기.

`jaewon/ml`의 코드는 고치지 않고 같은 프로세스에서 불러 쓴다.
모델을 읽지 못하면 예측 경로만 빼고 서버는 계속 뜬다.
"""
from __future__ import annotations

import csv
import logging
import os
import re
import sys
from datetime import date
from functools import lru_cache
from pathlib import Path

from ..settings import get_settings
from . import login

log = logging.getLogger("trylog.ml")
MSG_NO_SAMPLE = "이 시도는 표본 자료에 없어 예상 매출을 계산할 수 없어요."
_MENU_CODE_RE = re.compile(r"메뉴\s*코드\s*[:：]?\s*([A-Za-z]\d{3,})")
_state: dict = {"tried": False, "ready": False, "error": None, "pipeline": None, "app": None}


def init_ml() -> bool:
    """서재원 코드를 불러오고 모델 파일을 읽는다. 성공하면 True."""
    if _state["tried"]:
        return _state["ready"]
    _state["tried"] = True
    settings = get_settings()
    if not settings.ml_enabled:
        _state["error"] = "DISABLED"
        return False
    if not (settings.ml_dir / "app" / "ml_pipeline.py").is_file():
        _state["error"] = "ML_CODE_NOT_FOUND"
        return False
    # 서재원 코드는 불러올 때 환경변수를 읽는다. 먼저 넣어 둔다.
    os.environ.setdefault("DATA_SOURCE", "csv")
    os.environ.setdefault("CSV_DIR", str(settings.csv_dir))
    if str(settings.ml_dir) not in sys.path:
        sys.path.insert(0, str(settings.ml_dir))
    try:
        from app import main as ml_main          # 서재원 패키지 이름이 app이다.
        from app import ml_pipeline as pipeline

        pipeline.load_model_artifact()
    except Exception as exc:  # 모델 버전 불일치, 파일 없음 등 무엇이든 예측만 끈다.
        _state["error"] = type(exc).__name__
        log.warning("ML 코드를 불러오지 못했습니다: %s", type(exc).__name__)
        return False
    _state.update(ready=True, pipeline=pipeline, app=ml_main.app)
    return True


def ml_ready() -> bool:
    return bool(_state["ready"])


def ml_error() -> str | None:
    return _state["error"]


def ml_router():
    return _state["app"].router if _state["app"] is not None else None


def base_today() -> str | None:
    return getattr(_state["pipeline"], "BASE_TODAY_STR", None) if _state["ready"] else None


def forecast(ml_experiment_id: str) -> dict:
    """표본 시도 ID로 서재원의 시도 예측을 부른다."""
    if not _state["ready"]:
        raise RuntimeError("ML_NOT_READY")
    return _state["pipeline"].run_experiment_forecast(experiment_id=ml_experiment_id)


@lru_cache(maxsize=4)
def _sample_rows(csv_dir: str) -> tuple[dict, ...]:
    path = Path(csv_dir) / "3_experiments.csv"
    if not path.is_file():
        return ()
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return tuple(dict(row) for row in csv.DictReader(handle))


def sample_experiments(store_id: int | None = None) -> list[dict]:
    """`3_experiments.csv`의 표본 시도. 가게를 주지 않으면 로그인한 가게(없으면 설정값) 것을 돌려준다."""
    settings = get_settings()
    sid = str(login.current_store_id() if store_id is None else store_id)
    return [row for row in _sample_rows(str(settings.csv_dir)) if str(row.get("store_id", "")).strip() == sid]


def menu_code_in_notes(notes: str | None) -> str | None:
    m = _MENU_CODE_RE.search(notes or "")
    return m.group(1).upper() if m else None


def match_sample_experiment(spring_experiment: dict) -> dict | None:
    """Spring 시도와 같은 표본 시도를 찾는다. 하나로 정해지지 않으면 None.

    임시 규칙: 시작일·종료일이 같고, 메모의 '메뉴 코드'가 대상 메뉴와 같아야 한다.
    """
    start, end = spring_experiment.get("startDate"), spring_experiment.get("endDate")
    if not start or not end:
        return None
    rows = sample_experiments()
    by_id = [r for r in rows if r.get("id") == spring_experiment.get("id")]
    if len(by_id) == 1:
        return by_id[0]
    same_period = [r for r in rows if r.get("start_date") == start and r.get("end_date") == end]
    code = spring_experiment.get("targetMenuCode") or menu_code_in_notes(spring_experiment.get("notes"))
    if code:
        found = [r for r in same_period if (r.get("target_menu2_cd") or "").strip() == code]
    else:
        category = spring_experiment.get("category")
        found = [r for r in same_period if not (r.get("target_menu2_cd") or "").strip() and r.get("expm_category") == category]
    return found[0] if len(found) == 1 else None


def overlapping_samples(start: str, end: str, exclude_id: str | None = None) -> list[dict]:
    """표본 자료에서 같은 기간에 겹친 다른 시도. 서재원 코드의 겹침 규칙과 같다."""
    try:
        s, e = date.fromisoformat(start), date.fromisoformat(end)
    except (TypeError, ValueError):
        return []
    found = []
    for row in sample_experiments():
        if exclude_id and row.get("id") == exclude_id:
            continue
        try:
            rs, re_ = date.fromisoformat(row["start_date"]), date.fromisoformat(row["end_date"])
        except (KeyError, ValueError):
            continue
        if rs <= e and re_ >= s:
            found.append({"id": row.get("id"), "title": row.get("title"), "startDate": row["start_date"], "endDate": row["end_date"]})
    return found
