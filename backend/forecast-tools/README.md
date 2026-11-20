# 시연용 LightGBM 매출 전망 재현

Spring API는 빌드에 포함된 학습 결과를 읽는다. 아래 명령은 모델을 다시 학습해 배포된 수치와 비교하려는 팀원을 위한 것이다.

## 학습과 평가

- 입력은 `../src/main/resources/forecast/store1-daily-sales.csv`다. 제공된 주문에서 지니네김밥의 환불 행을 제외하고, 영업일별로 거래 당시 단가와 수량의 곱을 더했다. 2026년 8월 1일부터 11월 20일까지 112일이 이어진다.
- 예측값은 하루 총매출(원)이다. 입력 특성은 월요일을 0으로 둔 요일과 7·14·21·28일 전 매출이다. 첫 28일은 지연 특성을 만드는 데 쓴다.
- 검증 주의 시작일은 10월 24일, 10월 31일, 11월 7일, 11월 14일이다. 각 주 시작 전날까지 공개된 자료로만 학습하고 다음 7일을 한꺼번에 예측한다. 주별 학습 행 수는 56·63·70·77개다. 검증 오차를 보고 모델 설정을 조정하는 과정은 두지 않았다.
- 단순 기준선은 7일 전 실제 매출이다. 같은 28일의 절대오차 합을 검증 일수로 나누면 MAE(원), 실제 매출 합으로 나누고 100을 곱하면 WAPE(%)다. 최종 7일 전망은 11월 20일까지의 학습 행 84개로 다시 학습한다.
- 모델은 LightGBM 회귀 트리 40개, 최대 깊이 2, 학습률 0.05로 고정했다. 오차는 제공된 가게 한 곳의 시연자료에서 측정했으며, 가게나 기간을 바꾸면 달라질 수 있다.

## 실행

Python 3.12 환경에서 `backend/forecast-tools`로 이동한다. Windows PowerShell에서는 아래 순서로 실행한다.

```powershell
$forecastEnv = Join-Path $env:TEMP "trylog-forecast"
python -m venv $forecastEnv
$forecastPython = Join-Path $forecastEnv "Scripts/python.exe"
& $forecastPython -m pip install -r requirements.txt
& $forecastPython train.py --check
```

리눅스에서는 임시 가상환경의 `bin/python`으로 같은 명령을 실행한다. `--check`는 기준선 오차를 출력한 뒤 LightGBM을 다시 학습해 패키징된 MAE·WAPE, 참고 범위의 폭, 날짜별 예측값 일곱 개를 비교한다. 참고 범위는 28일의 절대오차를 작은 순서로 정렬해 23번째 오차(80번째 백분위)를 예상 매출에서 빼고 더해 구한다. 하한은 0원이다. 수치를 갱신할 때는 `train.py`를 인자 없이 실행하고 새 JSON을 포함해 Spring JAR을 빌드한다. 화면에서 같은 표본으로 계산한 LightGBM과 최근 4주 같은 요일 평균의 전망을 전환할 수 있다.
