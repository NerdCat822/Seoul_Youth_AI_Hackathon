# 음성 입력(STT) API 사용법

사장님이 말한 녹음 파일을 받아 한국어 글로 바꿔 주는 API입니다. 에이전트 서버(FastAPI, 포트 7500)에 있습니다.

- 브랜치: `hgkim` (커밋 `3fc554f`). 아직 `main`과 운영 서버에는 없습니다.
- 전사 모델: OpenAI `gpt-4o-mini-transcribe` (한국어로 고정)
- 화면은 만들지 않았습니다. 녹음과 업로드는 화면 쪽에서 붙여야 합니다.

## 한눈에 보기

```
POST /api/v1/agent/stt
Content-Type: multipart/form-data
Cookie: JSESSIONID=...        ← 로그인한 세션

audio=<녹음 파일>
```

```json
200 OK
{ "text": "오늘부터 이 주 동안 쌀떡볶이에 사장님 추천 스티커를 붙였어요.", "model": "gpt-4o-mini-transcribe", "elapsedMs": 900 }
```

## 주소

| 부르는 곳 | 주소 |
| --- | --- |
| 서버 안에서 직접 | `http://127.0.0.1:7500/api/v1/agent/stt` |
| 로컬 화면 개발 (Vite 5173) | `/api/v1/agent/stt` → Vite 프록시가 7500으로 보냄 |
| 공개 주소 (운영 반영 후) | `https://hgkim-mini-pc.taild27e83.ts.net/try-log/api/v1/agent/stt` |

## 로그인

로그인한 가게만 쓸 수 있습니다(호출마다 OpenAI 요금이 듭니다).

- Spring 로그인(`POST /api/v1/auth/login`)으로 받은 세션 쿠키 `JSESSIONID`를 함께 보내면 됩니다.
- 에이전트가 그 쿠키로 Spring에 로그인 상태를 물어보고, 로그인하지 않았으면 401을 돌려줍니다.
- 화면에서 같은 주소로 부르면 브라우저가 쿠키를 알아서 붙입니다. 별도 처리가 필요 없습니다.
- `X-CSRF-TOKEN`은 이 경로에서 확인하지 않지만, 보내도 문제없습니다. 프런트의 `request()`는 POST에 자동으로 붙입니다.

## 요청

| 항목 | 값 |
| --- | --- |
| 형식 | `multipart/form-data` |
| 필드 이름 | `audio` (하나) |
| 파일 형식 | webm, ogg, mp4, m4a, mp3, wav |
| 최대 크기 | 5MB (대략 1분) |

- **형식 구분**: 파일 이름이 아니라 그 파트의 `Content-Type`으로 구분합니다.
  - 받는 값: `audio/webm`, `audio/ogg`, `audio/mp4`, `audio/m4a`, `audio/x-m4a`, `audio/aac`, `audio/mpeg`, `audio/mp3`, `audio/wav`, `audio/x-wav`, `audio/wave`, `video/webm`
  - `audio/webm;codecs=opus`처럼 뒤에 붙은 값은 무시합니다.
- **브라우저 녹음 형식**: Chrome·Edge·Firefox의 `MediaRecorder`는 `audio/webm`, Safari는 `audio/mp4`로 녹음합니다. 둘 다 그대로 보내면 됩니다.
- **메뉴 이름 힌트**: 로그인한 가게의 메뉴 이름을 서버가 전사 힌트로 함께 보냅니다. 메뉴 이름을 더 정확히 받아 적습니다. 따로 보낼 것은 없습니다.

## 응답

| 필드 | 설명 |
| --- | --- |
| `text` | 전사한 글. 앞뒤 공백은 지웁니다. 소리가 없으면 빈 문자열일 수 있습니다 |
| `model` | 사용한 전사 모델 |
| `elapsedMs` | OpenAI 전사에 걸린 시간(밀리초) |

받은 `text`를 그대로 `POST /api/v1/agent/chat`의 `message`로 보내면 말로 대화할 수 있습니다. 사장님이 보내기 전에 고칠 수 있도록 입력창에 먼저 채워 주는 방식을 권합니다.

## 오류

오류 응답의 본문은 다른 API와 같습니다.

```json
{ "code": "VALIDATION_ERROR", "message": "녹음된 소리가 없어요. 다시 말씀해 주세요.", "fieldErrors": {} }
```

`message`는 사장님께 그대로 보여 줘도 되는 문장입니다. OpenAI가 보낸 원문은 싣지 않습니다.

| 상태 | `code` | 언제 |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | `audio` 필드가 없음(`fieldErrors.audio`), 빈 녹음, 지원하지 않는 형식, OpenAI가 알아듣지 못함 |
| 401 | `UNAUTHENTICATED` | 로그인하지 않음 |
| 413 | `VALIDATION_ERROR` | 5MB 초과 |
| 502 | `UPSTREAM_ERROR` | OpenAI 오류·연결 실패, 또는 Spring에 로그인을 확인할 수 없음 |
| 503 | `STT_UNAVAILABLE` | 서버에 OpenAI 키가 없음 |
| 503 | `STT_BUSY` | OpenAI 요청 한도 초과. 잠시 뒤 다시 시도 |

## 예시

### curl

로그인한 세션 쿠키 값을 넣어 부릅니다. 쿠키 값은 브라우저 개발자 도구(Application → Cookies)에서 `JSESSIONID`를 복사해도 됩니다.

```bash
curl -X POST http://127.0.0.1:7500/api/v1/agent/stt \
  -H "Cookie: JSESSIONID=<세션 값>" \
  -F "audio=@voice.webm;type=audio/webm"
```

### 화면 (React, 이 저장소의 `api.ts` 기준)

API 호출 함수입니다. `request()`가 배포 경로(`/try-log/`), 쿠키, CSRF 토큰을 처리합니다. `FormData`를 넘기면 브라우저가 multipart 머리글을 붙입니다.

```ts
export interface SttResult {
  text: string;
  model: string;
  elapsedMs: number;
}

export function transcribe(audio: Blob): Promise<SttResult> {
  const body = new FormData();
  body.append('audio', audio, 'voice');
  return request<SttResult>('/agent/stt', { method: 'POST', body });
}
```

녹음은 브라우저의 `MediaRecorder`로 합니다. 마이크는 HTTPS 주소나 `localhost`에서만 열립니다.

```ts
async function recordOnce(seconds = 10): Promise<Blob> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = new MediaRecorder(stream);
  const parts: Blob[] = [];
  recorder.ondataavailable = (event) => parts.push(event.data);
  const stopped = new Promise((resolve) => (recorder.onstop = resolve));
  recorder.start();
  setTimeout(() => recorder.stop(), seconds * 1000); // 실제 화면에서는 버튼으로 멈춘다
  await stopped;
  stream.getTracks().forEach((track) => track.stop()); // 마이크 표시등을 끈다
  return new Blob(parts, { type: recorder.mimeType });
}

const { text } = await transcribe(await recordOnce());
```

- `request()`는 10초가 지나면 요청을 끊습니다. 보통 1~2초 안에 끝나지만, 녹음은 1분 안으로 받는 것이 안전합니다.

## 상태 확인

`GET /api/v1/agent/health` 응답의 `sttReady`가 `true`면 쓸 수 있습니다. `sttModel`은 사용할 모델입니다. 로그인 없이 부를 수 있습니다.

## 서버 설정

| 환경변수 | 기본값 | 설명 |
| --- | --- | --- |
| `OPENAI_API_KEY` | 없음 | 저장소 루트 `.env`에 둡니다. Git에는 올라가지 않습니다 |
| `TRYLOG_STT_MODEL` | `gpt-4o-mini-transcribe` | 전사 모델 |
| `TRYLOG_STT_TIMEOUT` | `20` | OpenAI 한 번 호출의 제한 시간(초) |
| `TRYLOG_STT_MAX_BYTES` | `5242880` | 받을 녹음의 최대 크기(바이트) |

- **Docker**: `deploy/compose.yaml`의 에이전트가 루트 `.env`를 읽습니다.
- **업로드 한도**: 공개 주소로 부를 때는 nginx 두 곳을 거칩니다. 게이트웨이(`/try-log/`)와 화면 서버(`/api/v1/agent/`) 모두 6MB로 맞춰 두었습니다.

## 확인한 것 (2026-11-21)

- 단위 테스트 8개를 추가했습니다(`tests/test_stt.py`). 실제 OpenAI는 부르지 않습니다. 에이전트 전체 테스트 77개가 통과했습니다.
- 운영과 분리한 임시 컨테이너에서 실제 OpenAI로 전사해 봤습니다. 넣은 문장은 "오늘부터 이 주 동안 쌀떡볶이에 사장님 추천 스티커를 붙였어요."입니다.

  | 형식 | 결과 | 걸린 시간 |
  | --- | --- | --- |
  | mp3 | 원문과 같음 | 0.9초 |
  | wav | 원문과 같음 | 1.3초 |
  | Chrome이 녹음한 webm | "쌀 떡볶이"로 띄어 쓴 것 말고는 같음 | 1.7초 |

- 로그인 없이 부르면 401인 것을 확인했습니다.
- Safari 녹음(`audio/mp4`)과 실제 사람 목소리는 아직 시험하지 않았습니다.

## 답 읽기(TTS)와 대화창의 음성 대화

에이전트의 답을 소리로 들려주는 API도 있습니다. STT와 같은 OpenAI 키를 씁니다.

```
POST /api/v1/agent/tts
Content-Type: application/json
Cookie: JSESSIONID=...

{ "text": "이렇게 적어 둘게요. 맞으면 저장이라고 말씀해 주세요." }
```

- 응답: `audio/mpeg`(mp3) 바이트. 모델 `gpt-4o-mini-tts`, 목소리 `coral`
- 글은 1000자 이하. 줄바꿈과 따옴표 같은 화면용 기호는 덜어 내고 읽습니다
- 오류는 STT와 같은 형식입니다(401, 400 `VALIDATION_ERROR`, 503 `TTS_UNAVAILABLE`·`TTS_BUSY`, 502 `UPSTREAM_ERROR`)
- 화면에서는 `api.ts`의 `synthesizeSpeech(text)`가 Blob으로 받습니다

대화창(`ChatPanel`)은 두 API를 이어 씁니다.

1. 마이크를 한 번 누르면 녹음을 시작합니다.
2. 말을 시작한 뒤 1초 동안 조용하면 말이 끝난 것으로 보고 녹음을 마칩니다(`VoiceInput`의 `SILENCE_MS`). 8초 동안 말소리가 없으면 그만둡니다.
3. 전사한 글을 바로 에이전트에 보냅니다(`/agent/chat`).
4. 에이전트의 답을 `/agent/tts`로 받아 소리로 읽습니다. 제안 카드가 있으면 "1번, …"처럼 카드 제목도 읽습니다.
5. 읽는 중에 마이크를 다시 누르거나 "그만 듣기"를 누르면 읽기를 멈춥니다.
