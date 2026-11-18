# 트라이로그 기초 API 계약

Base URL: `/api/v1`. JSON UTF-8. 인증 없는 로컬 개발용이며 단일 가상 가게를 사용한다.
DB/외부 서비스 연결 없음. 시도는 서버 메모리에만 보관되어 재시작 시 지워진다. 사례는 가상 예시다.
날짜: `YYYY-MM-DD`, 오늘 기준: Asia/Seoul. 응답은 envelope 없이 객체/배열을 반환한다.

## GET /overview
```json
{"storeName":"우리동네 분식","today":"2026-11-13","storageMode":"MEMORY","demo":true}
```

## GET /experiments
최근 등록순 `Experiment[]`. 최초 실행은 빈 배열.

## POST /experiments
요청:
```json
{"title":"점심 세트 추천 표시 붙이기","category":"MENU","startDate":"2026-11-13","endDate":"2026-11-26","notes":"메뉴판에 추천 표시 하나 붙이기"}
```
`title`: trim 후 1~80자. `category`: MENU / OPERATION / MARKETING.
`startDate`, `endDate`: 필수, 2000-01-01~2100-12-31. 시작일 ≤ 종료일. `notes`: 선택, 최대 500자.
응답 201 + Location: `/api/v1/experiments/{id}`.

Experiment:
```json
{"id":"UUID","title":"점심 세트 추천 표시 붙이기","category":"MENU","startDate":"2026-11-13","endDate":"2026-11-26","checkDate":"2026-11-27","notes":"메뉴판에 추천 표시 하나 붙이기","status":"IN_PROGRESS"}
```
checkDate = endDate + 1일. status = 시작 전 PLANNED / 진행 중 IN_PROGRESS / checkDate부터 READY.
분석·완료 처리는 아직 제공하지 않는다.

## GET /experiments/{id}
단일 Experiment. 없는 ID는 404.

## GET /cases
가상 동네 사례 배열. 필터링은 프런트에서 수행한다.
```json
[{"id":"menu-badge","title":"점심 세트에 추천 표시 붙이기","category":"MENU","difficulty":"EASY","cost":0,"durationDays":14,"summary":"메뉴를 고르기 쉽게 추천 표시를 붙였어요.","tip":"한 번에 한 가지만 바꿔보세요.","sampleSize":12,"improved":7,"unchanged":3,"declined":2,"demo":true}]
```
`difficulty`: EASY / PREPARE / PLAN. cost 원 단위, 0 이상. improved + unchanged + declined = sampleSize.
관찰 예시이며 개선 효과나 인과관계를 보장하지 않는다.

## GET /health
```json
{"status":"UP"}
```

## 오류
400: 입력 오류, 잘못된 JSON/enum/date(숫자 enum도 거절). 404: 없는 시도/경로.
405: 지원하지 않는 HTTP 메서드. 415: 지원하지 않는 Content-Type. 500: 일반 서버 오류.
```json
{"code":"VALIDATION_ERROR","message":"입력 내용을 확인해주세요.","fieldErrors":{"title":"제목을 입력해주세요."}}
```
`fieldErrors`는 필드별 문자열 객체이며 관련 없는 오류는 빈 객체. 화면은 message와 fieldErrors를 표시한다.
오류 code는 입력 오류 `VALIDATION_ERROR`, 찾을 수 없음 `NOT_FOUND`, 프레임워크 요청 오류(405/415 등) `REQUEST_ERROR`, 예기치 못한 서버 오류 `INTERNAL_ERROR`다.
