# 트라이로그 에이전트 서버 (FastAPI + LangGraph)

사장님의 한마디를 시도 초안으로 바꾸고, 대화로 고치고, 확인을 받은 뒤 Spring에 저장한다. 결과 보고서의 숫자로 설명문도 쓴다. 서재원의 매출 예측 경로(`/api/v1/ml/...`)를 같은 프로세스에서 함께 제공한다.

- 포트: 이 서버 **7500**, Spring **7000** (`TRYLOG_SPRING_URL`로 바꾼다)
- LLM: `claude-sonnet-5-5`. 키가 없거나 호출이 실패하면 규칙 기반 경로로 답한다(`source`가 `RULES`).
- 필요한 것: Python 3.11, 저장소 루트의 `ml/`(서재원의 예측 코드·모델, Git에 있음)과 `ml/data/`(샘플 CSV 8개, Git에 없음).

## 실행

프로젝트 루트의 `.env`에 `ANTHROPIC_API_KEY=...` 한 줄을 둔다. `.env`는 Git에 올리지 않는다.

```bash
cd agent
python3.11 -m venv .venv
./.venv/bin/python -m pip install -r requirements.txt
./.venv/bin/python -m uvicorn trylog_agent.main:app --host 127.0.0.1 --port 7500
```

- 상태: `http://127.0.0.1:7500/api/v1/agent/health`
- API 문서: `http://127.0.0.1:7500/docs`

화면에서 부를 때는 Vite 프록시가 `/api/v1/agent`, `/api/v1/ml`을 이 서버(7500)로, 나머지 `/api`를 Spring(7000)으로 보낸다. `frontend/vite.config.ts`에 들어 있다. 주소를 바꿀 때는 `TRYLOG_AGENT_ORIGIN`, `TRYLOG_API_ORIGIN`을 쓴다.

### Docker로 띄우기

`deploy/compose.yaml`이 Spring(`trylog-api`, 7000)과 이 서버(`trylog-agent`, 7500)를 같은 Docker 네트워크에 띄우고 서로 연결한다. 이미지는 이 폴더의 `Dockerfile`로 만든다. `ml/`과 `ml/data/`는 이미지에 넣지 않고 띄울 때 붙인다.

```bash
cd deploy
DB_PASSWORD="$(docker exec postgres-db printenv POSTGRES_PASSWORD)" docker compose up -d --build
curl http://127.0.0.1:7500/api/v1/agent/health
```

Docker에서는 이 저장소의 Spring에 맞춰 `TRYLOG_SPRING_URL=http://trylog-api:7000`, `TRYLOG_SPRING_FIELDS=7`, `TRYLOG_REPORT_PREVIEW=1`로 띄운다. 이 구성에서는 Spring의 시도 등록이 열려 있어(`TRYLOG_ALLOW_WRITES` 기본 `true`) 대화에서 "저장"하면 DB에 등록된다. 닫으려면 `TRYLOG_ALLOW_WRITES=false`를 함께 넘긴다. 두 포트는 서버 안(`127.0.0.1`)에서만 열린다.

## 경로

| 메서드와 경로 | 하는 일 |
| --- | --- |
| GET `/api/v1/agent/health` | LLM, Spring, 예측 모델의 상태와 날짜 일치 여부 |
| POST `/api/v1/agent/draft` `{"text"}` | 한마디 → 초안 (대화 상태 없음) |
| POST `/api/v1/agent/chat` `{"threadId","message"}` | 대화로 초안 만들기 → 수정 → "저장" |
| POST `/api/v1/agent/experiments/{id}/explain` | 보고서 숫자로 결과 설명과 다음 시도 제안 |
| GET `/api/v1/agent/experiments/{id}/forecast` | Spring 시도를 표본 시도에 맞춰 예측 조회 |
| POST `/api/v1/agent/stt` multipart `audio` | 녹음한 말을 한국어 글로 바꿈 → `{"text","model","elapsedMs"}` |
| `/api/v1/ml/...` | 서재원의 예측 경로 5개 |

`health`를 뺀 에이전트 경로는 로그인한 가게만 쓸 수 있다. 화면이 보낸 세션 쿠키와 `X-CSRF-TOKEN`을 Spring 호출에 그대로 넘겨, Spring이 그 가게의 요청으로 처리한다. 대상 메뉴도 로그인한 가게의 메뉴(Spring `/menus`)에서 찾는다. 로그인하지 않은 요청은 401이다.

## 음성 입력 (STT)

다른 개발자에게 공유할 사용법은 [STT_API.md](STT_API.md)에 따로 정리했다.

`POST /api/v1/agent/stt`는 브라우저나 앱이 녹음한 짧은 말을 OpenAI 음성 전사 API(`gpt-4o-mini-transcribe`)로 한국어 글로 바꾼다. 로그인한 가게만 쓸 수 있다(요금이 든다). 화면은 만들지 않았다.

- 요청: `multipart/form-data`, 필드 이름 `audio`. 형식은 webm·ogg·mp4·m4a·mp3·wav. 파일의 `Content-Type`으로 형식을 알린다(예: `audio/webm;codecs=opus`). 5MB(약 1분) 이하.
- 응답: `{"text": "오늘부터 이 주 동안 쌀떡볶이에 사장님 추천 스티커를 붙였어요.", "model": "gpt-4o-mini-transcribe", "elapsedMs": 900}`
- 로그인한 가게의 메뉴 이름을 전사 힌트로 함께 보내 메뉴 이름을 더 정확히 받아 적는다.
- 오류: 로그인 없음 401, 빈 녹음·지원하지 않는 형식 400, 너무 큼 413, 키 없음·요청 과다 503, OpenAI 실패 502. 오류 문구에 OpenAI의 원문은 싣지 않는다.
- 받은 글을 그대로 `POST /api/v1/agent/chat`의 `message`로 보내면 말로 대화할 수 있다.

```bash
# 로그인한 세션 쿠키(JSESSIONID)가 필요하다
curl -X POST http://127.0.0.1:7500/api/v1/agent/stt -H "Cookie: JSESSIONID=..." -F "audio=@voice.webm;type=audio/webm"
```

## 테스트

```bash
./.venv/bin/python -m pytest tests -q          # 실제 LLM과 Spring을 부르지 않는다
```

`tests/fake_spring.py`는 Spring을 대신하는 테스트용 가짜 서버다. 실제 Spring이 아니다. Spring 없이 혼자 확인할 때만 7000에 띄운다.

```bash
./.venv/bin/python -m uvicorn tests.fake_spring:app --host 127.0.0.1 --port 7000
./.venv/bin/python scripts/eval_appendix_a.py  # 예시 문장 13개와 결과 설명. 실제 LLM을 부른다
```

## 환경변수

| 이름 | 기본값 | 역할 |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | 없음 | LLM 키 |
| `TRYLOG_LLM_MODEL` | `claude-sonnet-5-5` | 모델 이름 |
| `TRYLOG_LLM_TIMEOUT` | `8` | LLM 한 번 호출의 제한 시간(초) |
| `TRYLOG_LLM_WARMUP` | `1` | 서버를 띄울 때 LLM을 미리 네 번 부른다. `0`이면 건너뛴다 |
| `TRYLOG_SPRING_URL` | `http://127.0.0.1:7000` | Spring 주소 |
| `TRYLOG_SPRING_FIELDS` | `5` | 저장 요청의 필드 수. `7`이면 `actionType`, `targetMenuCode`를 함께 보낸다 |
| `TRYLOG_REPORT_PREVIEW` | `0` | `1`이면 저장된 보고서가 없을 때 `/report/preview`를 읽는다 |
| `TRYLOG_FORECAST_SOURCE` | `spring` | 설명문에 쓰는 예상 매출의 출처. `spring` 또는 `ml` |
| `OPENAI_API_KEY` | 없음 | 음성 전사 키. 없으면 `/stt`가 503 `STT_UNAVAILABLE` |
| `TRYLOG_STT_MODEL` | `gpt-4o-mini-transcribe` | 음성 전사 모델 |
| `TRYLOG_STT_TIMEOUT` | `20` | 음성 전사 한 번의 제한 시간(초) |
| `TRYLOG_STT_MAX_BYTES` | `5242880` | 받을 녹음 파일의 최대 크기(5MB). 넘으면 413 |
| `TRYLOG_REQUIRE_LOGIN` | `0` | `1`이면 Spring에 로그인을 확인할 수 없을 때 요청을 받지 않는다. 공개 주소에 여는 배포에서 켠다 |
| `CSV_DIR`, `TRYLOG_ML_DIR` | `ml/data`, `ml` | 자료와 서재원 코드의 위치 |
