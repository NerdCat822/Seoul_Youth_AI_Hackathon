"""FastAPI 앱.

에이전트 경로 `/api/v1/agent/...`와 서재원의 예측 경로 `/api/v1/ml/...`를 한 프로세스에서 제공한다.
실행: uvicorn trylog_agent.main:app --host 127.0.0.1 --port 7500
"""
from __future__ import annotations

import logging
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import llm
from .graph.nodes import resolve_today
from .routes import router
from .schemas import ApiError
from .settings import get_settings
from .tools import ml

log = logging.getLogger("trylog")
ML_PREFIX = "/api/v1/ml"
LOCAL_ORIGINS = [f"http://{host}:{port}" for host in ("127.0.0.1", "localhost") for port in (5173, 4173)]


def _error(status: int, code: str, message: str, field_errors: dict | None = None) -> JSONResponse:
    return JSONResponse(status_code=status, content={"code": code, "message": message, "fieldErrors": field_errors or {}})


@asynccontextmanager
async def lifespan(_: FastAPI):
    # 첫 LLM 호출이 느리므로 서버가 뜰 때 뒤에서 미리 불러 둔다. TRYLOG_LLM_WARMUP=0이면 건너뛴다.
    if get_settings().llm_warmup and llm.is_ready():
        threading.Thread(target=lambda: llm.warm_up(resolve_today()[0]), daemon=True).start()
    yield


def create_app() -> FastAPI:
    get_settings()
    app = FastAPI(title="트라이로그 에이전트 API", version="0.1.0", lifespan=lifespan)
    app.add_middleware(CORSMiddleware, allow_origins=LOCAL_ORIGINS, allow_methods=["*"], allow_headers=["*"])
    app.include_router(router)

    # 서재원 앱의 경로를 포함한다. 모델을 읽지 못하면 예측 경로만 빼고 띄운다.
    if ml.init_ml():
        app.include_router(ml.ml_router())
    else:
        log.warning("예측 경로(%s)를 빼고 시작합니다: %s", ML_PREFIX, ml.ml_error())

    @app.exception_handler(ApiError)
    async def api_error(_: Request, exc: ApiError):
        return _error(exc.status, exc.code, exc.message, exc.field_errors)

    @app.exception_handler(RequestValidationError)
    async def request_invalid(_: Request, exc: RequestValidationError):
        fields = {str(err["loc"][-1]): "값을 확인해주세요." for err in exc.errors() if err.get("loc")}
        return _error(400, "VALIDATION_ERROR", "입력 내용을 확인해주세요.", fields)

    @app.exception_handler(StarletteHTTPException)
    async def http_error(_: Request, exc: StarletteHTTPException):
        if exc.status_code == 404:
            return _error(404, "NOT_FOUND", "요청한 경로를 찾을 수 없어요.")
        code = "VALIDATION_ERROR" if exc.status_code < 500 else "INTERNAL_ERROR"
        return _error(exc.status_code, code, str(exc.detail))

    # 포함한 앱의 오류 처리기는 따라오지 않는다. 서재원 경로의 404·400 규칙을 여기서 다시 맞춘다.
    @app.exception_handler(KeyError)
    async def key_error(request: Request, exc: KeyError):
        if request.url.path.startswith(ML_PREFIX):
            return _error(404, "NOT_FOUND", str(exc).strip("'\""))
        log.exception("처리하지 못한 오류")
        return _error(500, "INTERNAL_ERROR", "서버에서 문제가 생겼어요. 잠시 뒤 다시 시도해 주세요.")

    @app.exception_handler(ValueError)
    async def value_error(request: Request, exc: ValueError):
        if request.url.path.startswith(ML_PREFIX):
            return _error(400, "VALIDATION_ERROR", str(exc))
        log.exception("처리하지 못한 오류")
        return _error(500, "INTERNAL_ERROR", "서버에서 문제가 생겼어요. 잠시 뒤 다시 시도해 주세요.")

    @app.exception_handler(Exception)
    async def unknown_error(_: Request, exc: Exception):
        log.exception("처리하지 못한 오류")
        return _error(500, "INTERNAL_ERROR", "서버에서 문제가 생겼어요. 잠시 뒤 다시 시도해 주세요.")

    return app


app = create_app()
