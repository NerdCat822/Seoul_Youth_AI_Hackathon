# 검증 기록

## 2026-11-18 서비스명 변경 (가늠 → 트라이로그)

- 서비스명을 트라이로그(영문 trylog)로 바꿨다. 백엔드 패키지 `kr.trylog`, 메인 클래스 `TrylogApplication`, 결과물 `trylog-backend`, 설정 키 `trylog.store-name`(환경변수 `TRYLOG_STORE_NAME`), 프런트 패키지 `trylog-frontend`.
- WSL(Linux), JDK 21에서 `sh gradlew --no-daemon clean build`: `BUILD SUCCESSFUL`. JUnit 테스트 11개(통합 8, 서비스 3) 실패·오류·건너뜀 0개. `build/libs/trylog-backend-0.0.1-SNAPSHOT.jar` 생성. Linux에서 Wrapper 실행을 확인한 첫 기록이다.
- 생성 JAR를 8080에서 실행해 `/api/v1/overview`가 `storeName` `우리동네 분식`(바뀐 설정 키의 기본값)을 반환함을 확인했다.
- 프런트 `npm ci`, `npm run build`(tsc + vite build) 성공. `npm run format:check` 통과.
- `vite preview`(4173)와 위 JAR를 함께 실행해 320px·390px에서 홈, 사례 목록, 사례 상세(뒤로 버튼 있음), 장사 기록의 머리글을 확인했다. 가로 넘침 없음, 브랜드 "트라이로그"와 가게 칩이 겹치지 않음(320px 사례 상세에서 간격 35px), 머리글 높이 64px 유지. 확인 후 두 서버를 종료했다.
- 시도 등록·조회 등 브라우저 전체 흐름은 이번에 다시 검증하지 않았다.
- 아래 2026-11-13 기록의 이름(`ganum-backend` 등)은 당시 결과 그대로 둔다.

## 2026-11-13 실행 안내 문서 보완

- `README.md`에 로컬 Gradle 기준의 준비·실행·종료·빌드·환경설정·문제 해결 절차를 정리했다.
- 명령과 포트를 `frontend/package.json`, `frontend/vite.config.ts`, `backend/build.gradle`, `backend/src/main/resources/application.yml`과 대조했다. 현재 설치된 Vite의 preview 프록시 상속 동작도 소스에서 확인했다.
- README 내부 파일 링크와 코드 블록 구성을 확인했다. 문서만 변경했으므로 이번 작업에서는 빌드·테스트·서버 기동을 다시 실행하지 않았다. 아래 항목은 앞선 작업에서 실제 수행한 검증 이력이다.

## 2026-11-13 Gradle 전환 (현재 빌드)

- 사용자 요청에 따라 Maven 구성에서 Gradle 8.14.7 Wrapper + Groovy DSL로 전환했다. Spring Boot 3.5.16 및 Java 17 호환 코드를 유지했다.
- 최종 Wrapper에서 `gradlew.bat --version`으로 Gradle 8.14.7 / JDK 19 실행을 확인했다.
- `gradlew.bat --gradle-user-home ../.gradle-user-home --no-daemon --console=plain clean build`: 종료 코드 0, `BUILD SUCCESSFUL`. 격리 환경의 캐시 쓰기 제한 때문에 검증 캐시만 프로젝트 내부의 git 제외 경로를 사용했다.
- JUnit 테스트 11개(통합 8, 서비스 3)가 모두 실행되어 실패·오류·건너뜀 0개.
- 실행 JAR `backend/build/libs/ganum-backend-0.0.1-SNAPSHOT.jar` 생성 확인.
- Gradle 배포본 SHA-256을 Wrapper에 고정했고, 생성된 Wrapper JAR도 Gradle 공식 8.14.7 체크섬과 일치함을 확인했다.
- 생성 JAR를 별도 8081 포트에서 실행해 health, overview, 가상 사례 6개, 시도 등록·조회 및 확인일 계산을 실제 HTTP로 검증했다. 해당 임시 서버만 종료했으며 기존 8080 미리보기는 재시작하지 않았다.
- 소스/API 동작을 수정하지 않아 프런트 빌드·브라우저 전체 검증은 이번 전환에서 반복하지 않았다. 아래 초기 검증은 이전 이력이다.
- macOS/Linux Wrapper 실행은 미검증이다.

## 2026-11-13 기초 구성 (Maven 사용 당시 이력)

환경: Windows, Node.js 22.12.0, npm 10.9.0, JDK 19(Java 17 target), Maven 3.9.11, Edge headless / Playwright.

### 실행한 검증

- `npm run format:check`: 통과.
- `npm run build`: TypeScript 검사와 Vite 프로덕션 빌드 통과.
- 백엔드 `mvn -Dmaven.repo.local=../.m2/repository -B -ntp package`: 테스트 11개 통과, 실행 JAR 생성.
- `mvnw.cmd --version`: Wrapper의 Maven 3.9.11 실행 확인.
- 실행 JAR의 실제 HTTP `/health`: `UP`. `/overview`: 서울 날짜, 가게명, MEMORY 확인. `/cases`: 6개 예시 및 집계 합계 확인.
- 브라우저에서 실제 Spring API를 사용해 필수 제목·역전 날짜 오류, 시도 등록, 새로고침 후 유지, 종료일+1 확인일 검증.
- 달력 시작일/확인일 일정, 내 기록, 사례 무료·카테고리·난이도 필터, 사례에서 폼 값 채우기, 브라우저 뒤로 가기 확인.
- 별도 가상 결과의 비중 36.25%와 실제 기록과 무관하다는 표시 확인.
- 320px / 390px / 1440px에서 홈·달력·기록·사례·등록·결과 예시의 가로 넘침 없음.
- 모바일 홈·등록·달력 및 데스크톱 홈 스크린샷 시각 확인.
- API 요청 실패를 브라우저에서 강제로 재현하여 오류 안내 확인. 실패 모의 해제 후 재시도로 실제 API 복구 확인.
- 위 브라우저 검증 중 JavaScript 런타임 오류 0건.
- 검증용으로 만든 시도만 있는 서버를 재시작해 `/experiments`가 빈 배열 `[]`로 초기화되는 것을 실제 HTTP로 확인했다. 미리보기는 빈 기록 상태로 준비했다.

백엔드 자동 테스트는 등록/조회, 날짜 범위·순서, 문자열·enum 입력, 404/405/415, 상태 전환 경계, 가상 사례 합계, 새 메모리 저장소의 빈 상태를 검증한다. API 계약은 `docs/api.md`를 따른다.

브라우저 확인은 로컬 작업 중 실행한 통합 스모크 검증이며 별도 CI 브라우저 테스트 구성은 아직 없다. 임시 실행 스크립트와 스크린샷은 git에서 제외되는 `tmp/`에 보관한다.

### 미검증 및 후속 범위

- macOS/Linux의 실행, 실물 모바일 기기 및 다른 브라우저.
- DB 영속성, 사용자 인증, AI/음성, 실제 업로드·분석, 배포 환경(미구현).
- 서버 재시작 전후 실제 사용 기록의 영속성은 제공하지 않는다. 메모리 저장 방식이다.
