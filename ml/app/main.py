from contextlib import asynccontextmanager

import pandas as pd
from fastapi import FastAPI, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from app.ml_pipeline import (
    BASE_TODAY_STR,
    DATA_SOURCE,
    _load_tables_from_csv,
    engine,
    load_model_artifact,
    recommend_ingredient_prep,
    run_experiment_forecast,
)


@asynccontextmanager
async def lifespan(_: FastAPI):
    # 서버를 띄울 때 저장된 모델을 읽는다. 파일이 없거나 맞지 않으면 여기서 멈춘다.
    load_model_artifact()
    yield


app = FastAPI(title="가늠 ML 매출 예측 및 식자재 추천 API", version="1.2.2", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(KeyError)
async def not_found_handler(_: Request, exc: KeyError):
    return JSONResponse(status_code=404, content={"code": "NOT_FOUND", "message": str(exc).strip("'")})


@app.exception_handler(ValueError)
async def validation_error_handler(_: Request, exc: ValueError):
    return JSONResponse(status_code=400, content={"code": "VALIDATION_ERROR", "message": str(exc)})


@app.exception_handler(Exception)
async def general_error_handler(_: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"code": type(exc).__name__, "message": str(exc)},
    )


@app.get("/api/v1/ml/health")
def health():
    return {
        "status": "UP",
        "service": "ganum-ml",
        "dataSource": DATA_SOURCE,
        "baseToday": BASE_TODAY_STR,
        "modelVersion": load_model_artifact()["modelVersion"],
    }


@app.get("/api/v1/ml/stores")
def list_stores():
    if DATA_SOURCE == "csv":
        df = _load_tables_from_csv()["stores"]
        sub = df[["store_id", "store_name", "mega_nm", "cty_nm", "upjong", "open_time", "close_time"]]
        return sub.astype(object).where(pd.notna(sub), None).to_dict("records")
    with engine.connect() as conn:
        rows = conn.execute(
            text("SELECT store_id, store_name, mega_nm, cty_nm, upjong, open_time, close_time FROM stores ORDER BY store_id")
        ).mappings().all()
    return [dict(r) for r in rows]


@app.get("/api/v1/ml/experiments")
def list_experiments(store_id: int | None = Query(default=None)):
    if DATA_SOURCE == "csv":
        df = _load_tables_from_csv()["experiments"].copy()
        if store_id is not None:
            df = df[df["store_id"] == store_id]
        df["start_date"] = df["start_date"].astype(str)
        df["end_date"] = df["end_date"].astype(str)
        df = df.sort_values("start_date", ascending=False)
        return df.astype(object).where(pd.notna(df), None).to_dict("records")
    query = "SELECT id, store_id, title, expm_category, action_type, target_menu2_cd, start_date, end_date, notes FROM experiments"
    params = {"sid": store_id} if store_id is not None else {}
    if store_id is not None:
        query += " WHERE store_id = :sid"
    query += " ORDER BY start_date DESC"
    with engine.connect() as conn:
        rows = conn.execute(text(query), params).mappings().all()
    return [dict(r) for r in rows]


@app.post("/api/v1/ml/experiments/{experiment_id}/forecast")
def forecast_experiment(
    experiment_id: str,
    start_date: str | None = Query(default=None),
    end_date: str | None = Query(default=None),
):
    return run_experiment_forecast(experiment_id=experiment_id, eval_start=start_date, eval_end=end_date)


@app.get("/api/v1/ml/stores/{store_id}/ingredients/prep")
def get_ingredient_prep(
    store_id: int,
    base_date: str = Query(default=BASE_TODAY_STR),
    horizon_days: int = Query(default=7, ge=1, le=30),
):
    return recommend_ingredient_prep(store_id=store_id, base_date=base_date, horizon_days=horizon_days)