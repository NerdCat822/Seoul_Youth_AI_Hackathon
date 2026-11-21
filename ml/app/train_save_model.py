import importlib
import os
import sys
import joblib
import pandas as pd

APP_DIR = r"C:\Users\NICE\projects\Seoul_Youth_AI_Hackathon\ml\app"
ML_ROOT = r"C:\Users\NICE\projects\Seoul_Youth_AI_Hackathon\ml"
PIPELINE_PATH = os.path.join(APP_DIR, "ml_pipeline.py")
OUT_PATH = os.path.join(ML_ROOT, "models", "ganum_lgbm.joblib")

# 1. Python 3.9 호환을 위해 ml_pipeline.py의 'str | None'을 'Optional[str]'로 자동 변환
with open(PIPELINE_PATH, "r", encoding="utf-8") as f:
    code_text = f.read()

if "str | None" in code_text:
    code_text = "from typing import Optional\n" + code_text.replace("str | None", "Optional[str]")
    with open(PIPELINE_PATH, "w", encoding="utf-8") as f:
        f.write(code_text)

# 2. 확정된 ml_pipeline 불러오기
if APP_DIR not in sys.path:
    sys.path.insert(0, APP_DIR)

import ml_pipeline as mp
importlib.reload(mp)

# 3. 매장별(1~3) 및 시도별(15건) 모델 학습 및 추출
tables = mp._load_tables_from_csv()
base_today = pd.to_datetime(mp.BASE_TODAY_STR).date()

store_models = {}
for sid in (1, 2, 3):
    df_mart = mp._build_mart_from_csv(tables, sid, base_today)
    pre_df = df_mart[(df_mart["sales_date"] < base_today) & (df_mart["is_forecast"] == False)].copy()
    model, m_mae, m_wape, b_mae, b_wape, band = mp._train_and_validate(pre_df)

    store_models[sid] = {
        "model": model,
        "modelMae": m_mae,
        "modelWape": m_wape,
        "baselineMae": b_mae,
        "baselineWape": b_wape,
        "bandMargin": band,
    }
    print(f"[매장 {sid} 완료] MAE={m_mae:,}원, WAPE={m_wape}%, 오차범위=±{band:,}원")

experiment_models = {}
for _, exp in tables["experiments"].iterrows():
    eid = str(exp["id"])
    sid = int(exp["store_id"])
    train_cutoff = min(exp["start_date"], base_today)

    df_mart = mp._build_mart_from_csv(tables, sid, train_cutoff)
    pre_df = df_mart[(df_mart["sales_date"] < train_cutoff) & (df_mart["is_forecast"] == False)].copy()
    try:
        model, m_mae, m_wape, b_mae, b_wape, band = mp._train_and_validate(pre_df)
        experiment_models[eid] = {
            "storeId": sid,
            "trainCutoff": str(train_cutoff),
            "model": model,
            "modelMae": m_mae,
            "modelWape": m_wape,
            "baselineMae": b_mae,
            "baselineWape": b_wape,
            "bandMargin": band,
        }
    except ValueError:
        experiment_models[eid] = {
            "storeId": sid,
            "trainCutoff": str(train_cutoff),
            **store_models[sid],
        }

# 4. 단일 모델 파일(.joblib) 저장 및 로드 검증
artifact = {
    "modelVersion": mp.MODEL_VERSION,
    "featureCols": mp.FEATURE_COLS,
    "baseToday": mp.BASE_TODAY_STR,
    "storeModels": store_models,
    "experimentModels": experiment_models,
}

os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
joblib.dump(artifact, OUT_PATH)

loaded = joblib.load(OUT_PATH)
print(
    f"\n[모델 파일 저장 및 검증 완료] {OUT_PATH} "
    f"({os.path.getsize(OUT_PATH):,} bytes | 매장 {len(loaded['storeModels'])}개 / 실험 {len(loaded['experimentModels'])}개)"
)