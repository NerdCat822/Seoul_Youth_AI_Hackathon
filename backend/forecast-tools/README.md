# 가게별 7일 매출 모델

기본 모델은 Spring에서 해당 가게의 최근 4주 같은 요일 평균을 계산한다. 대체 모델을 제공할 때는 Python 3.12에서 `pip install -r requirements.txt`로 도구를 설치한다. 아래 명령은 `backend/forecast-tools/`에서 실행한다.

```powershell
python train.py --fixture --check
python train.py --output "$env:TEMP/trylog-candidate.json"
```

첫 명령은 부록 B의 112일 집계 표본에서 주 단위로 다시 학습하고 28일 검증 지표와 다음 7개 예측을 비교한다. 둘째 명령은 서버의 `DB_PASSWORD`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `TRYLOG_STORE_ID` 설정으로 실제 가게의 일매출 뷰를 읽기 전용으로 조회한다. 휴무·누락·예보일을 제외한 연속 관측일이 57일 이상 있어야 학습할 수 있다.

각 검증 주가 시작하기 전까지의 자료로 LightGBM을 학습한다. 모델 입력은 요일과 7·14·21·28일 전 매출이다. MAE 단위는 원이고 WAPE는 %다. 실측 합이 0원이면 WAPE는 비어 있다. 7일 참고 범위의 폭은 검증 28일의 절대오차 중 80번째 백분위로 정한다.

생성한 파일 경로를 API 서버의 `TRYLOG_FORECAST_CANDIDATE`에 지정하고 다음 기동 때 읽는다. 저장 예측이 없어 요일 평균을 제공하는 경우, 가게 ID·자료 종료일·전체 일매출 SHA-256·대상일이 DB와 일치할 때만 검증된 대체 모델도 반환한다.
