"""Evaluate a seven-day candidate on one store's observed trading dates."""

import argparse
import csv
import hashlib
import json
import math
import os
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import lightgbm as lgb
import numpy as np


FIXTURES = Path(__file__).resolve().parents[1] / "src/test/resources/forecast"
HORIZON = 7
HOLDOUT = 28
LAGS = (7, 14, 21, 28)


def read_daily_sales(path):
    sales = {}
    with path.open(encoding="utf-8", newline="") as source:
        for row in csv.DictReader(source):
            day = date.fromisoformat(row["base_date"])
            if day in sales:
                raise ValueError(f"Duplicate sales date: {day}")
            sales[day] = int(row["daily_sales"])
    return sales


def read_store(store):
    import psycopg

    today = os.environ.get("TRYLOG_DEMO_DATE") or datetime.now(timezone(timedelta(hours=9))).date().isoformat()
    with psycopg.connect(host=os.environ.get("DB_HOST", "localhost"), port=os.environ.get("DB_PORT", 5432),
                         dbname=os.environ.get("DB_NAME", "hgkim_postgresql"),
                         user=os.environ.get("DB_USER", "nerdcat822"), password=os.environ["DB_PASSWORD"],
                         options="-c default_transaction_read_only=on", connect_timeout=5) as db:
        with db.cursor() as cursor:
            cursor.execute("""
                SELECT sales_date, daily_sales FROM seoul_youth_ai_hackathon.v_daily_sales_mart
                WHERE store_id = %s AND sales_date <= %s AND is_forecast IS FALSE
                  AND is_missing_or_closed IS FALSE AND daily_sales >= 0 ORDER BY sales_date
            """, (store, date.fromisoformat(today)))
            return {day: int(amount) for day, amount in cursor}


def fingerprint(sales):
    rows = (f"{day.isoformat()},{sales[day]}\n" for day in sorted(sales))
    return hashlib.sha256("".join(rows).encode("utf-8")).hexdigest()


def features(day, history):
    # For every lead (1..7) the shortest lag, seven days, is known at the cutoff.
    return [day.weekday(), *[history[day - timedelta(days=lag)] for lag in LAGS]]


def forecast_week(history):
    dates = sorted(history)
    training_dates = dates[max(LAGS):]
    features_in = np.array([features(day, history) for day in training_dates])
    targets = [history[day] for day in training_dates]
    dataset = lgb.Dataset(features_in, label=targets,
                          feature_name=["weekday", "lag7", "lag14", "lag21", "lag28"])
    params = {
        "objective": "regression_l2",
        "learning_rate": 0.05,
        "num_leaves": 4,
        "max_depth": 2,
        "min_data_in_leaf": 7,
        "min_data_in_bin": 1,
        "seed": 21,
        "num_threads": 1,
        "force_col_wise": True,
        "deterministic": True,
        "verbosity": -1,
    }
    model = lgb.train(params, dataset, num_boost_round=40)
    future = [dates[-1] + timedelta(days=lead) for lead in range(1, HORIZON + 1)]
    matrix = np.array([features(day, history) for day in future])
    predictions = model.predict(matrix, num_threads=1)
    return {day: max(0, math.floor(value + 0.5)) for day, value in zip(future, predictions)}


def metrics(errors, actual_revenue):
    return (math.floor(sum(errors) / len(errors) + 0.5),
            round(100 * sum(errors) / actual_revenue, 2) if actual_revenue else None)


def evaluate(sales):
    dates = sorted(sales)
    if len(dates) < HOLDOUT + max(LAGS) + 1 or (dates[-1] - dates[0]).days + 1 != len(dates):
        raise ValueError("At least 57 consecutive observed sales days are required for training and validation.")
    model_errors = []
    baseline_errors = []
    total = 0
    for start in range(len(dates) - HOLDOUT, len(dates), HORIZON):
        # Restrict the training targets AND all lag features to the available prefix.
        history = {day: sales[day] for day in dates[:start]}
        for day, prediction in forecast_week(history).items():
            actual = sales[day]
            total += actual
            model_errors.append(abs(actual - prediction))
            baseline_errors.append(abs(actual - history[day - timedelta(days=HORIZON)]))
    mae, wape = metrics(model_errors, total)
    print("7-day lag baseline (MAE KRW, WAPE %):", metrics(baseline_errors, total))
    print("LightGBM (MAE KRW, WAPE %):", (mae, wape))
    return {
        "model": f"LightGBM {lgb.__version__}",
        "mae": mae,
        "wape": wape,
        "errorRadius": sorted(model_errors)[math.ceil(len(model_errors) * 0.80) - 1],
        "days": [{"date": day.isoformat(), "expected": value}
                 for day, value in forecast_week(sales).items()],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fixture", action="store_true", help="Use the isolated Appendix B regression input")
    parser.add_argument("--output", type=Path, help="Local candidate JSON path")
    parser.add_argument("--check", action="store_true", help="Compare against the existing output without replacing it")
    args = parser.parse_args()
    if not args.fixture and not args.output:
        parser.error("Supply --output for a database training run.")
    store = 1 if args.fixture else int(os.environ.get("TRYLOG_STORE_ID", 1))
    sales = read_daily_sales(FIXTURES / "store1-daily-sales.csv") if args.fixture else read_store(store)
    model = evaluate(sales)
    candidate = {"storeId": store, "dataThrough": max(sales).isoformat(),
                 "historySha256": fingerprint(sales), "candidate": model}
    destination = args.output or FIXTURES / "store1-lightgbm.json"
    if args.check:
        if json.loads(destination.read_text(encoding="utf-8")) != candidate:
            raise SystemExit("Packaged result differs from the newly trained model.")
        print("Packaged result matches all metrics and seven forecast days.")
    else:
        destination.write_text(json.dumps(candidate, ensure_ascii=False, indent=2) + "\n",
                               encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
