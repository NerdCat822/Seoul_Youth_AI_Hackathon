from typing import Optional
import math
import os
from datetime import date, timedelta
from functools import lru_cache
import joblib
import numpy as np
import pandas as pd
import lightgbm as lgb
from sqlalchemy import create_engine, text

DATA_SOURCE = os.getenv("DATA_SOURCE", "csv").lower()
CSV_DIR = os.getenv("CSV_DIR", r"C:\Users\NICE\Downloads\test")
DB_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg2://ganum_user:ganum_password@127.0.0.1:5432/ganum",
)
engine = create_engine(DB_URL) if DATA_SOURCE == "db" else None

BASE_TODAY_STR = "2026-11-21"
FEATURE_COLS = [
    "day_of_week",
    "is_weekend",
    "is_holiday",
    "avg_temp",
    "is_rain",
    "lag_7",
    "lag_14",
    "rolling_mean_7",
]
MODEL_VERSION = "lgbm_ganum_v1.2"
MODEL_PATH = os.getenv(
    "MODEL_PATH",
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "models", "ganum_lgbm.joblib"),
)


@lru_cache(maxsize=1)
def load_model_artifact() -> dict:
    # train_save_model.py가 저장한 모델 묶음을 한 번만 읽어 둔다. API는 학습하지 않고 이 모델만 쓴다.
    if not os.path.exists(MODEL_PATH):
        raise FileNotFoundError(f"모델 파일을 찾을 수 없습니다: {MODEL_PATH}")
    artifact = joblib.load(MODEL_PATH)
    if list(artifact["featureCols"]) != FEATURE_COLS:
        raise RuntimeError(
            "모델 파일의 입력 변수 구성이 FEATURE_COLS와 다릅니다. train_save_model.py로 다시 저장해 주세요."
        )
    return artifact


def _select_saved_model(store_id: int, experiment_id: Optional[str] = None) -> dict:
    # 시도 전용 모델이 있으면 그것을, 없으면 가게 모델을 쓴다.
    artifact = load_model_artifact()
    saved = artifact["experimentModels"].get(experiment_id) if experiment_id else None
    if saved is None:
        saved = artifact["storeModels"].get(int(store_id))
    if saved is None:
        raise KeyError(f"가게({store_id})의 학습된 모델이 모델 파일에 없어요.")
    return saved


def _read_csv_checked(filename: str) -> pd.DataFrame:
    path = os.path.join(CSV_DIR, filename)
    if not os.path.exists(path):
        raise FileNotFoundError(f"CSV 파일을 찾을 수 없습니다: {path}")
    return pd.read_csv(path)


def _load_tables_from_csv() -> dict[str, pd.DataFrame]:
    stores = _read_csv_checked("1_stores.csv")
    menus = _read_csv_checked("2_menus.csv")
    exps = _read_csv_checked("3_experiments.csv")
    pos = _read_csv_checked("4_pos_orders.csv")
    weather = _read_csv_checked("5_external_weather.csv")
    ingre = _read_csv_checked("6_ingredients.csv")
    recipes = _read_csv_checked("7_menu_recipes.csv")
    inv = _read_csv_checked("8_store_inventory.csv")

    exps["start_date"] = pd.to_datetime(exps["start_date"]).dt.date
    exps["end_date"] = pd.to_datetime(exps["end_date"]).dt.date
    pos["base_date"] = pd.to_datetime(pos["base_date"]).dt.date
    weather["feature_date"] = pd.to_datetime(weather["feature_date"]).dt.date

    return {
        "stores": stores,
        "menus": menus,
        "experiments": exps,
        "pos_orders": pos,
        "weather": weather,
        "ingredients": ingre,
        "recipes": recipes,
        "inventory": inv,
    }


def _build_mart_from_csv(tables: dict[str, pd.DataFrame], store_id: int, max_date: date) -> pd.DataFrame:
    pos = tables["pos_orders"]
    weather = tables["weather"]

    valid_pos = pos[(pos["store_id"] == store_id) & (pos["is_refunded"] == False)].copy()
    valid_pos["line_total"] = valid_pos["price"] * valid_pos["quantity"]
    daily_agg = (
        valid_pos.groupby("base_date")
        .agg(
            total_orders=("receipt_id", "nunique"),
            total_items_sold=("quantity", "sum"),
            daily_sales=("line_total", "sum"),
        )
        .reset_index()
        .rename(columns={"base_date": "sales_date"})
    )

    mart = weather[weather["feature_date"] <= max_date].rename(columns={"feature_date": "sales_date"}).merge(
        daily_agg, on="sales_date", how="left"
    )
    mart["store_id"] = store_id
    mart["is_rain"] = (mart["precipitation"] > 0).astype(int)
    mart["is_missing_or_closed"] = mart["daily_sales"].isna() & (mart["is_forecast"] == False)
    mart["total_orders"] = mart["total_orders"].fillna(0).astype(int)
    mart["total_items_sold"] = mart["total_items_sold"].fillna(0).astype(int)
    mart["daily_sales"] = mart["daily_sales"].fillna(0).astype(int)
    return mart.sort_values("sales_date").reset_index(drop=True)


def calc_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> tuple[int, float]:
    mae = int(round(float(np.mean(np.abs(y_true - y_pred)))))
    denom = float(np.sum(y_true))
    wape = round(float(np.sum(np.abs(y_true - y_pred)) / denom * 100), 2) if denom > 0 else 0.0
    return mae, wape


def build_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.sort_values("sales_date").copy()
    df["day_of_week"] = df["day_of_week"].astype(int)
    df["is_weekend"] = df["is_weekend"].astype(int)
    df["is_holiday"] = df["is_holiday"].astype(int)
    df["lag_7"] = df["daily_sales"].shift(7)
    df["lag_14"] = df["daily_sales"].shift(14)
    df["rolling_mean_7"] = df["daily_sales"].shift(1).rolling(7, min_periods=3).mean()
    return df


def _train_and_validate(pre_df: pd.DataFrame) -> tuple[lgb.LGBMRegressor, int, float, int, float, int]:
    valid_df = pre_df[(pre_df["is_missing_or_closed"] == False) & (pre_df["is_forecast"] == False)].copy()
    feat_df = build_features(valid_df).dropna(subset=["lag_7", "lag_14", "rolling_mean_7"])

    if len(feat_df) < 21:
        raise ValueError("학습에 필요한 과거 영업일 데이터가 부족합니다 (최소 35일 이상 필요).")

    val_window = min(14, max(7, len(feat_df) // 5))
    train_set = feat_df.iloc[:-val_window]
    val_set = feat_df.iloc[-val_window:]

    X_train = train_set[FEATURE_COLS].to_numpy(dtype=float)
    y_train = train_set["daily_sales"].to_numpy(dtype=float)
    X_val = val_set[FEATURE_COLS].to_numpy(dtype=float)
    y_val = val_set["daily_sales"].to_numpy(dtype=float)

    baseline_mae, baseline_wape = calc_metrics(y_val, val_set["lag_7"].to_numpy(dtype=float))

    params = {
        "objective": "regression",
        "metric": "mae",
        "learning_rate": 0.08,
        "num_leaves": 15,
        "min_data_in_leaf": 4,
        "verbose": -1,
        "random_state": 42,
    }
    val_model = lgb.LGBMRegressor(**params, n_estimators=80)
    val_model.fit(X_train, y_train)
    val_preds = val_model.predict(X_val)

    model_mae, model_wape = calc_metrics(y_val, val_preds)
    residual_std = float(np.std(y_val - val_preds))
    band_margin = max(int(round(residual_std * 1.28, -3)), 20000)

    full_model = lgb.LGBMRegressor(**params, n_estimators=100)
    full_model.fit(feat_df[FEATURE_COLS].to_numpy(dtype=float), feat_df["daily_sales"].to_numpy(dtype=float))

    return full_model, model_mae, model_wape, baseline_mae, baseline_wape, band_margin


def _recursive_predict(
    model: lgb.LGBMRegressor, history_df: pd.DataFrame, target_dates: list[date]
) -> dict[date, int]:
    sim_df = history_df.sort_values("sales_date").copy()
    sim_df["baseline_series"] = sim_df["daily_sales"].astype(float)
    first_target = min(target_dates)
    sim_df.loc[sim_df["sales_date"] >= first_target, "baseline_series"] = np.nan

    preds: dict[date, int] = {}
    for d in sorted(target_dates):
        idx = sim_df.index[sim_df["sales_date"] == d][0]
        lag7_s = sim_df.loc[sim_df["sales_date"] == (d - timedelta(days=7)), "baseline_series"]
        lag14_s = sim_df.loc[sim_df["sales_date"] == (d - timedelta(days=14)), "baseline_series"]
        roll7_s = sim_df[(sim_df["sales_date"] < d) & (sim_df["sales_date"] >= d - timedelta(days=7))][
            "baseline_series"
        ]

        fallback = float(sim_df[sim_df["sales_date"] < first_target]["daily_sales"].mean())
        lag7_val = float(lag7_s.values[0]) if len(lag7_s) and not pd.isna(lag7_s.values[0]) else fallback
        lag14_val = float(lag14_s.values[0]) if len(lag14_s) and not pd.isna(lag14_s.values[0]) else lag7_val
        roll7_val = float(roll7_s.mean()) if len(roll7_s) and not pd.isna(roll7_s.mean()) else lag7_val

        x_row = np.array(
            [[
                float(sim_df.loc[idx, "day_of_week"]),
                float(sim_df.loc[idx, "is_weekend"]),
                float(sim_df.loc[idx, "is_holiday"]),
                float(sim_df.loc[idx, "avg_temp"]),
                float(sim_df.loc[idx, "is_rain"]),
                lag7_val,
                lag14_val,
                roll7_val,
            ]],
            dtype=float,
        )
        pred_val = max(0, int(round(float(model.predict(x_row)[0]), -3)))
        sim_df.loc[idx, "baseline_series"] = float(pred_val)
        preds[d] = pred_val

    return preds


def run_experiment_forecast(
    experiment_id: str, eval_start: Optional[str] = None, eval_end: Optional[str] = None
) -> dict:
    base_today = pd.to_datetime(BASE_TODAY_STR).date()

    if DATA_SOURCE == "csv":
        tables = _load_tables_from_csv()
        exp_df = tables["experiments"]
        matched = exp_df[exp_df["id"] == experiment_id]
        if matched.empty:
            raise KeyError(f"시도({experiment_id})를 찾을 수 없어요.")
        exp = matched.iloc[0].to_dict()
        store_id = int(exp["store_id"])
        store_name = str(tables["stores"].loc[tables["stores"]["store_id"] == store_id, "store_name"].values[0])
        tgt_m2c = str(exp["target_menu2_cd"]) if pd.notna(exp["target_menu2_cd"]) else None
        tgt_menu_nm = (
            str(tables["menus"].loc[tables["menus"]["menu2_cd"] == tgt_m2c, "menu2_nm"].values[0]) if tgt_m2c else None
        )
        exp_start, exp_end = exp["start_date"], exp["end_date"]

        pos = tables["pos_orders"]
        s_date = pd.to_datetime(eval_start).date() if eval_start else exp_start
        e_date = pd.to_datetime(eval_end).date() if eval_end else exp_end
        if s_date > e_date:
            raise ValueError("비교 시작일은 종료일보다 늦을 수 없습니다.")

        ov_df = exp_df[
            (exp_df["store_id"] == store_id)
            & (exp_df["id"] != experiment_id)
            & (exp_df["start_date"] <= e_date)
            & (exp_df["end_date"] >= s_date)
        ]
        overlaps = ov_df.to_dict("records")
        df_mart = _build_mart_from_csv(tables, store_id, e_date)

        menu_share_comparison = None
        if tgt_m2c and exp_start < base_today:
            confirmed_end = min(e_date, base_today - timedelta(days=1))
            window_days = (confirmed_end - exp_start).days + 1
            b_start = exp_start - timedelta(days=window_days)
            b_end = exp_start - timedelta(days=1)
            sub_pos = pos[(pos["store_id"] == store_id) & (pos["is_refunded"] == False)]
            b_pos = sub_pos[(sub_pos["base_date"] >= b_start) & (sub_pos["base_date"] <= b_end)]
            a_pos = sub_pos[(sub_pos["base_date"] >= exp_start) & (sub_pos["base_date"] <= confirmed_end)]
            b_tot = int(b_pos["receipt_id"].nunique())
            b_tgt = int(b_pos[b_pos["menu2_cd"] == tgt_m2c]["receipt_id"].nunique())
            a_tot = int(a_pos["receipt_id"].nunique())
            a_tgt = int(a_pos[a_pos["menu2_cd"] == tgt_m2c]["receipt_id"].nunique())
            menu_share_comparison = {
                "targetMenuCode": tgt_m2c,
                "targetMenuName": tgt_menu_nm,
                "beforePeriod": {"startDate": str(b_start), "endDate": str(b_end)},
                "afterPeriod": {"startDate": str(exp_start), "endDate": str(confirmed_end)},
                "beforeTotalOrders": b_tot,
                "beforeTargetOrders": b_tgt,
                "beforeSharePct": round(b_tgt / b_tot * 100, 2) if b_tot > 0 else 0.0,
                "afterTotalOrders": a_tot,
                "afterTargetOrders": a_tgt,
                "afterSharePct": round(a_tgt / a_tot * 100, 2) if a_tot > 0 else 0.0,
            }
    else:
        with engine.connect() as conn:
            exp = conn.execute(
                text("""
                    SELECT e.*, s.store_name, m.menu2_nm AS target_menu_nm
                    FROM experiments e
                    JOIN stores s ON e.store_id = s.store_id
                    LEFT JOIN menus m ON e.target_menu2_cd = m.menu2_cd
                    WHERE e.id = :eid
                """),
                {"eid": experiment_id},
            ).mappings().first()
            if not exp:
                raise KeyError(f"시도({experiment_id})를 찾을 수 없어요.")

            store_id = int(exp["store_id"])
            store_name = str(exp["store_name"])
            tgt_m2c = exp["target_menu2_cd"]
            exp_start, exp_end = exp["start_date"], exp["end_date"]

            s_date = pd.to_datetime(eval_start).date() if eval_start else exp_start
            e_date = pd.to_datetime(eval_end).date() if eval_end else exp_end
            if s_date > e_date:
                raise ValueError("비교 시작일은 종료일보다 늦을 수 없습니다.")

            overlaps = [
                dict(r)
                for r in conn.execute(
                    text("""
                        SELECT id, title, expm_category, action_type, start_date, end_date
                        FROM experiments
                        WHERE store_id = :sid AND id <> :eid AND start_date <= :ed AND end_date >= :sd
                    """),
                    {"sid": store_id, "eid": experiment_id, "sd": s_date, "ed": e_date},
                ).mappings().all()
            ]
            df_mart = pd.read_sql(
                text("SELECT * FROM v_daily_sales_mart WHERE store_id = :sid AND sales_date <= :ed ORDER BY sales_date"),
                conn,
                params={"sid": store_id, "ed": e_date},
            )
            df_mart["sales_date"] = pd.to_datetime(df_mart["sales_date"]).dt.date

            menu_share_comparison = None
            if tgt_m2c and exp_start < base_today:
                confirmed_end = min(e_date, base_today - timedelta(days=1))
                window_days = (confirmed_end - exp_start).days + 1
                b_start = exp_start - timedelta(days=window_days)
                b_end = exp_start - timedelta(days=1)
                sr = conn.execute(
                    text("""
                        SELECT
                            COUNT(DISTINCT CASE WHEN base_date BETWEEN :bs AND :be THEN receipt_id END) AS b_tot,
                            COUNT(DISTINCT CASE WHEN base_date BETWEEN :bs AND :be AND menu2_cd = :m2c THEN receipt_id END) AS b_tgt,
                            COUNT(DISTINCT CASE WHEN base_date BETWEEN :as_d AND :ae_d THEN receipt_id END) AS a_tot,
                            COUNT(DISTINCT CASE WHEN base_date BETWEEN :as_d AND :ae_d AND menu2_cd = :m2c THEN receipt_id END) AS a_tgt
                        FROM pos_orders WHERE store_id = :sid AND is_refunded = FALSE
                    """),
                    {"sid": store_id, "m2c": tgt_m2c, "bs": b_start, "be": b_end, "as_d": exp_start, "ae_d": confirmed_end},
                ).mappings().first()
                b_tot, b_tgt, a_tot, a_tgt = int(sr["b_tot"] or 0), int(sr["b_tgt"] or 0), int(sr["a_tot"] or 0), int(sr["a_tgt"] or 0)
                menu_share_comparison = {
                    "targetMenuCode": tgt_m2c,
                    "targetMenuName": exp["target_menu_nm"],
                    "beforePeriod": {"startDate": str(b_start), "endDate": str(b_end)},
                    "afterPeriod": {"startDate": str(exp_start), "endDate": str(confirmed_end)},
                    "beforeTotalOrders": b_tot,
                    "beforeTargetOrders": b_tgt,
                    "beforeSharePct": round(b_tgt / b_tot * 100, 2) if b_tot > 0 else 0.0,
                    "afterTotalOrders": a_tot,
                    "afterTargetOrders": a_tgt,
                    "afterSharePct": round(a_tgt / a_tot * 100, 2) if a_tot > 0 else 0.0,
                }

    # 시행 전 확정 영업일(오늘 이전)로 미리 학습해 저장한 모델 사용 (요청 시 재학습하지 않음)
    train_cutoff = min(exp_start, base_today)
    saved = _select_saved_model(store_id, experiment_id)
    full_model = saved["model"]
    model_mae, model_wape = saved["modelMae"], saved["modelWape"]
    baseline_mae, baseline_wape = saved["baselineMae"], saved["baselineWape"]
    band_margin = saved["bandMargin"]
    model_version = load_model_artifact()["modelVersion"]

    sim_dates = df_mart[df_mart["sales_date"] >= train_cutoff]["sales_date"].tolist()
    pred_map = _recursive_predict(full_model, df_mart, sim_dates)

    eval_df = df_mart[(df_mart["sales_date"] >= s_date) & (df_mart["sales_date"] <= e_date)].copy()
    missing_days_count = int(eval_df["is_missing_or_closed"].sum())

    daily_list = []
    for _, r in eval_df.iterrows():
        d = r["sales_date"]
        is_future = d >= base_today or bool(r["is_forecast"])
        exp_val = int(pred_map[d])
        act_val = None if is_future else int(r["daily_sales"])
        daily_list.append(
            {
                "date": str(d),
                "dayLabel": f"{d.day}일",
                "actualSales": act_val,
                "expectedSales": exp_val,
                "expectedLower": max(0, exp_val - band_margin),
                "expectedUpper": exp_val + band_margin,
                "isForecastDate": is_future,
                "isMissingOrClosed": bool(r["is_missing_or_closed"]),
            }
        )

    if DATA_SOURCE == "db" and engine is not None:
        with engine.begin() as conn:
            conn.execute(text("DELETE FROM ml_predictions WHERE experiment_id = :eid"), {"eid": experiment_id})
            for item in daily_list:
                conn.execute(
                    text("""
                        INSERT INTO ml_predictions (
                            experiment_id, target_date, expected_sales, expected_lower, expected_upper,
                            model_version, val_mae, val_wape
                        ) VALUES (:eid, :dt, :exp, :low, :high, :ver, :mae, :wape)
                    """),
                    {
                        "eid": experiment_id,
                        "dt": item["date"],
                        "exp": item["expectedSales"],
                        "low": item["expectedLower"],
                        "high": item["expectedUpper"],
                        "ver": model_version,
                        "mae": model_mae,
                        "wape": model_wape,
                    },
                )

    confirmed_items = [x for x in daily_list if x["actualSales"] is not None]
    future_items = [x for x in daily_list if x["actualSales"] is None]

    total_expected = sum(x["expectedSales"] for x in daily_list)
    confirmed_actual_sum = sum(x["actualSales"] for x in confirmed_items)
    confirmed_expected_sum = sum(x["expectedSales"] for x in confirmed_items)
    future_expected_sum = sum(x["expectedSales"] for x in future_items)

    if len(confirmed_items) == 0:
        # ① 오늘 시작 또는 예정된 시도 (전부 미래 날짜)
        diff_amt = None
        exp_man = round(future_expected_sum / 10000)
        headline = f"앞으로 {len(future_items)}일간 평소 흐름 예상 매출은 약 {exp_man}만 원이에요"
    elif len(future_items) > 0:
        # ② 현재 진행 중인 시도 (과거 확정 + 미래 잔여)
        diff_amt = confirmed_actual_sum - confirmed_expected_sum
        diff_man = round(diff_amt / 10000)
        rem_man = round(future_expected_sum / 10000)
        headline = (
            f"진행 중이에요! 지금까지({len(confirmed_items)}일간) 평소 예상보다 "
            f"{abs(diff_man)}만 원 {'더' if diff_amt >= 0 else '덜'} 팔렸어요 (남은 기간 예상 {rem_man}만 원)"
        )
    else:
        # ③ 기간 종료 완료 (전부 과거 확정)
        diff_amt = confirmed_actual_sum - confirmed_expected_sum
        diff_man = round(diff_amt / 10000)
        headline = f"평소 예상보다 {abs(diff_man)}만 원 {'더' if diff_amt >= 0 else '덜'} 팔렸어요"

    return {
        "experimentId": experiment_id,
        "storeId": store_id,
        "storeName": store_name,
        "title": str(exp["title"]),
        "expmCategory": str(exp["expm_category"]),
        "actionType": str(exp["action_type"]),
        "period": {"startDate": str(s_date), "endDate": str(e_date)},
        "summary": {
            "confirmedDays": len(confirmed_items),
            "remainingDays": len(future_items),
            "actualTotalSales": confirmed_actual_sum if len(confirmed_items) > 0 else None,
            "expectedTotalSales": total_expected,
            "confirmedExpectedSales": confirmed_expected_sum if len(confirmed_items) > 0 else None,
            "futureExpectedSales": future_expected_sum if len(future_items) > 0 else None,
            "diffAmount": diff_amt,
            "headline": headline,
        },
        "dailyComparison": daily_list,
        "menuShareComparison": menu_share_comparison,
        "dataQuality": {
            "missingOrClosedDays": missing_days_count,
            "overlappingExperiments": [
                {
                    "id": str(o["id"]),
                    "title": str(o["title"]),
                    "expmCategory": str(o["expm_category"]),
                    "actionType": str(o["action_type"]),
                    "startDate": str(o["start_date"]),
                    "endDate": str(o["end_date"]),
                }
                for o in overlaps
            ],
        },
        "modelMeta": {
            "dataSource": DATA_SOURCE,
            "modelVersion": model_version,
            "baselineMethod": "직전 주 같은 요일 예측",
            "validationMetrics": {
                "modelMae": model_mae,
                "modelWape": model_wape,
                "baselineMae": baseline_mae,
                "baselineWape": baseline_wape,
            },
            "uncertaintyNote": "예측 오차와 다른 시도의 겹침이 있을 수 있어 예상과의 차이만으로 시도의 효과를 확정하지 않습니다.",
        },
    }


def recommend_ingredient_prep(
    store_id: int, base_date: str = BASE_TODAY_STR, horizon_days: int = 7
) -> dict:
    b_date = pd.to_datetime(base_date).date()
    target_end = b_date + timedelta(days=horizon_days - 1)

    if DATA_SOURCE == "csv":
        tables = _load_tables_from_csv()
        st_df = tables["stores"]
        matched_st = st_df[st_df["store_id"] == store_id]
        if matched_st.empty:
            raise KeyError(f"가게({store_id})를 찾을 수 없어요.")
        store_name = str(matched_st.iloc[0]["store_name"])
        df_mart = _build_mart_from_csv(tables, store_id, target_end)

        pos = tables["pos_orders"]
        valid_pos = pos[
            (pos["store_id"] == store_id)
            & (pos["is_refunded"] == False)
            & (pos["base_date"] >= b_date - timedelta(days=28))
            & (pos["base_date"] < b_date)
        ].copy()
        valid_pos["line_total"] = valid_pos["price"] * valid_pos["quantity"]
        m_sales_map = valid_pos.groupby("menu2_cd")["line_total"].sum().to_dict()

        s1_menus = tables["menus"][tables["menus"]["store_id"] == store_id]
        menu_share_rows = [
            {
                "menu2_cd": str(r["menu2_cd"]),
                "menu2_nm": str(r["menu2_nm"]),
                "unit_price": int(r["unit_price"]),
                "menu_sales": int(m_sales_map.get(r["menu2_cd"], 0)),
            }
            for _, r in s1_menus.iterrows()
        ]

        merged = (
            tables["recipes"]
            .merge(s1_menus[["menu2_cd"]], on="menu2_cd")
            .merge(tables["ingredients"], on="ingre_cd")
            .merge(tables["inventory"][tables["inventory"]["store_id"] == store_id], on="ingre_cd", how="left")
        )
        merged["current_stock"] = merged["current_stock"].fillna(0.0)
        merged["incoming_stock"] = merged["incoming_stock"].fillna(0.0)
        recipe_inv_rows = merged.to_dict("records")
    else:
        with engine.connect() as conn:
            store = conn.execute(
                text("SELECT store_id, store_name FROM stores WHERE store_id = :sid"), {"sid": store_id}
            ).mappings().first()
            if not store:
                raise KeyError(f"가게({store_id})를 찾을 수 없어요.")
            store_name = str(store["store_name"])

            df_mart = pd.read_sql(
                text("SELECT * FROM v_daily_sales_mart WHERE store_id = :sid AND sales_date <= :te ORDER BY sales_date"),
                conn,
                params={"sid": store_id, "te": target_end},
            )
            df_mart["sales_date"] = pd.to_datetime(df_mart["sales_date"]).dt.date

            menu_share_rows = [
                dict(r)
                for r in conn.execute(
                    text("""
                        SELECT m.menu2_cd, m.menu2_nm, m.unit_price, COALESCE(SUM(p.price * p.quantity), 0) AS menu_sales
                        FROM menus m
                        LEFT JOIN pos_orders p
                            ON m.menu2_cd = p.menu2_cd AND p.is_refunded = FALSE
                            AND p.base_date BETWEEN :hs AND :he
                        WHERE m.store_id = :sid
                        GROUP BY m.menu2_cd, m.menu2_nm, m.unit_price
                    """),
                    {"sid": store_id, "hs": b_date - timedelta(days=28), "he": b_date - timedelta(days=1)},
                ).mappings().all()
            ]
            recipe_inv_rows = [
                dict(r)
                for r in conn.execute(
                    text("""
                        SELECT i.ingre_cd, i.ingre_nm, i.unit, i.pack_size, i.pack_unit_nm,
                               mr.menu2_cd, mr.required_qty,
                               COALESCE(inv.current_stock, 0) AS current_stock,
                               COALESCE(inv.incoming_stock, 0) AS incoming_stock
                        FROM ingredients i
                        JOIN menu_recipes mr ON i.ingre_cd = mr.ingre_cd
                        JOIN menus m ON mr.menu2_cd = m.menu2_cd
                        LEFT JOIN store_inventory inv ON inv.store_id = :sid AND inv.ingre_cd = i.ingre_cd
                        WHERE m.store_id = :sid
                    """),
                    {"sid": store_id},
                ).mappings().all()
            ]

    future_dates = df_mart[
        (df_mart["sales_date"] >= b_date) & (df_mart["sales_date"] <= target_end)
    ]["sales_date"].tolist()

    if len(future_dates) < horizon_days:
        raise ValueError(f"향후 {horizon_days}일 날씨 예보 데이터가 부족합니다.")

    saved = _select_saved_model(store_id)
    full_model, model_mae, model_wape = saved["model"], saved["modelMae"], saved["modelWape"]
    future_preds = _recursive_predict(full_model, df_mart, future_dates)
    predicted_period_sales = sum(future_preds.values())

    total_hist_menu_sales = sum(int(r["menu_sales"]) for r in menu_share_rows)
    menu_count = max(len(menu_share_rows), 1)
    expected_menu_qty = {
        r["menu2_cd"]: (
            predicted_period_sales
            * (float(r["menu_sales"]) / total_hist_menu_sales if total_hist_menu_sales > 0 else 1.0 / menu_count)
        )
        / float(r["unit_price"])
        for r in menu_share_rows
    }

    ingre_agg: dict[str, dict] = {}
    for r in recipe_inv_rows:
        ic = str(r["ingre_cd"])
        if ic not in ingre_agg:
            ingre_agg[ic] = {
                "ingreCode": ic,
                "ingreName": str(r["ingre_nm"]),
                "unit": str(r["unit"]),
                "packSize": int(r["pack_size"]),
                "packUnitName": str(r["pack_unit_nm"]),
                "currentStock": float(r["current_stock"]),
                "incomingStock": float(r["incoming_stock"]),
                "expectedUsage": 0.0,
            }
        ingre_agg[ic]["expectedUsage"] += expected_menu_qty.get(str(r["menu2_cd"]), 0.0) * float(r["required_qty"])

    recommendations = []
    for item in ingre_agg.values():
        exp_use = round(item["expectedUsage"], 1)
        net_needed = max(0.0, round(exp_use - item["currentStock"] - item["incomingStock"], 1))
        packs_needed = int(math.ceil(net_needed / item["packSize"])) if net_needed > 0 else 0
        order_qty = packs_needed * item["packSize"]
        recommendations.append(
            {
                "ingreCode": item["ingreCode"],
                "ingreName": item["ingreName"],
                "unit": item["unit"],
                "packSize": item["packSize"],
                "packUnitName": item["packUnitName"],
                "expectedUsage": exp_use,
                "currentStock": item["currentStock"],
                "incomingStock": item["incomingStock"],
                "netNeededQty": net_needed,
                "recommendedPacks": packs_needed,
                "recommendedOrderQty": order_qty,
                "estimatedSurplusQty": round(order_qty - net_needed, 1) if packs_needed > 0 else 0.0,
                "headline": (
                    f"{item['ingreName']}, {packs_needed}{item['packUnitName']}을 더 준비해볼까요?"
                    if packs_needed > 0
                    else f"{item['ingreName']}은 현재 재고로 충분해요"
                ),
            }
        )

    return {
        "storeId": store_id,
        "storeName": store_name,
        "baseDate": str(b_date),
        "horizonDays": horizon_days,
        "forecastPeriod": {"startDate": str(min(future_dates)), "endDate": str(max(future_dates))},
        "predictedTotalSales": predicted_period_sales,
        "dailyForecast": [{"date": str(d), "expectedSales": s} for d, s in sorted(future_preds.items())],
        "modelMeta": {
            "dataSource": DATA_SOURCE,
            "modelVersion": load_model_artifact()["modelVersion"],
            "valMae": model_mae,
            "valWape": model_wape,
        },
        "recommendations": recommendations,
    }