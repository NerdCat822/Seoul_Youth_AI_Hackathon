"""Train and evaluate the offline LightGBM candidate for the single-store demo."""

import argparse
import csv
import json
import math
from datetime import date, timedelta
from pathlib import Path

import lightgbm as lgb
import numpy as np


RESOURCES = Path(__file__).resolve().parents[1] / "src/main/resources/forecast"
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
    dates = sorted(sales)
    if not dates or (dates[-1] - dates[0]).days + 1 != len(dates):
        raise ValueError("Daily sales must cover consecutive calendar dates.")
    return sales


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
            round(100 * sum(errors) / actual_revenue, 2))


def evaluate(sales):
    dates = sorted(sales)
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
    parser.add_argument("--check", action="store_true", help="Compare with the packaged result")
    args = parser.parse_args()
    candidate = evaluate(read_daily_sales(RESOURCES / "store1-daily-sales.csv"))
    destination = RESOURCES / "store1-lightgbm.json"
    if args.check:
        if json.loads(destination.read_text(encoding="utf-8")) != candidate:
            raise SystemExit("Packaged result differs from the newly trained model.")
        print("Packaged result matches all metrics and seven forecast days.")
    else:
        destination.write_text(json.dumps(candidate, ensure_ascii=False, indent=2) + "\n",
                               encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
