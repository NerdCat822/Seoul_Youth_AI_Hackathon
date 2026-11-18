# 백엔드

- 기준: Java 17 호환 소스, Spring Boot 3.5.16, Gradle + Groovy DSL. 검증 버전은 8.14.7이며 해당 Wrapper도 유지한다. API 계약은 `docs/api.md`.
- 사용자 선호: 로컬에 직접 설치한 Gradle을 기본으로 사용한다. `backend/`에서 `gradle bootRun`으로 실행, `gradle clean build`로 테스트·패키징. Wrapper는 선택적으로 사용한다.
- 실행 준비, 두 터미널의 실행·종료 순서, JAR 실행, 환경변수 및 오류 해결은 루트 `README.md`의 실행 안내를 기준으로 한다.
- `backend/build.gradle`, `settings.gradle`: Boot BOM 의존성, Java 17 release, JUnit Platform 및 실행 JAR 설정.
- `backend/src/main/java/kr/trylog/experiment`: Controller → Service → Repository → InMemory 구현.
- `overview`: 오늘(Asia/Seoul), 가게명, 메모리 저장 안내, health.
- `neighborhood`: 가상 동네 사례 6개. 실제 상점 데이터·AI 추천 아님.
- `shared`: 입력 오류 400, 없는 시도 404, 일반 오류 500 응답. Spring HTTP 오류(405/415 등)는 상태와 헤더를 보존한다.
- Jackson: 알 수 없는 필드와 숫자 enum(숫자 문자열 포함)은 거절한다.
- DB, ORM, 인증, AI, 업로드·분석 미구현. 메모리 기록은 서버 재시작 시 초기화.
- 기본 주소 `127.0.0.1:8080`. `SERVER_ADDRESS`, `SERVER_PORT`, `TRYLOG_STORE_NAME`으로 변경.
- Mapper XML 없음. DB 도입 시 Repository 구현 교체와 API/검증 갱신.
- 초기 Maven 빌드의 테스트 11개 통과 이력은 `docs/verification.md`에 보존한다. 현재 빌드 명령과 결과물 경로는 Gradle 기준이다.
- 2026-11-13 Gradle 8.14.7 Wrapper `clean build` 종료 코드 0. 테스트 11개 통과, `build/libs/ganum-backend-0.0.1-SNAPSHOT.jar` 생성 및 별도 8081 포트의 실제 API 등록·조회 검증 완료. macOS/Linux Wrapper 실행은 미검증.
- 실행 JAR을 로컬 8080에서 기동하고 실제 HTTP health `UP`, overview 서울 날짜 및 MEMORY 확인. 브라우저 등록·조회 통합 검증 및 서버 재시작 후 빈 배열 `[]` 확인. 상세는 `docs/verification.md`.
- 2026-11-18 서비스명 변경: 패키지 `kr.trylog`, 메인 클래스 `TrylogApplication`, 결과물 `trylog-backend-0.0.1-SNAPSHOT.jar`, 설정 키 `trylog.store-name`. 위 2026-11-13 기록의 이름은 당시 그대로다.
- 2026-11-18 WSL(Linux), JDK 21에서 `sh gradlew --no-daemon clean build` 성공. 테스트 11개 통과. JAR 실행 후 overview의 가게명 기본값 확인. 상세는 `docs/verification.md`.
