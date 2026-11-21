"""모델을 다시 학습해서 ml/models/ganum_lgbm.joblib 로 저장한다.

API와 에이전트는 이 파일만 읽고 요청 때 학습하지 않는다. CSV나 BASE_TODAY_STR, 특징이 바뀌면 이 스크립트를 다시 돌린다.

    cd ml && python -m app.train_save_model          # CSV_DIR 기본값: ml/data
"""
from app import ml_pipeline as mp


def main() -> None:
    mp.save_model_artifact()
    mp.load_model_artifact.cache_clear()
    artifact = mp.load_model_artifact()        # 저장한 파일이 코드와 맞는지 다시 읽어 확인한다
    print(f"저장: {mp.MODEL_PATH} ({artifact['modelVersion']}, 기준일 {artifact['baseToday']})")
    for sid, entry in artifact["storeModels"].items():
        print(f"  가게 {sid}: MAE={entry['modelMae']:,}원, WAPE={entry['modelWape']}%, 오차범위=±{entry['bandMargin']:,}원")
    print(f"  시도별 모델 {len(artifact['experimentModels'])}개")


if __name__ == "__main__":
    main()
