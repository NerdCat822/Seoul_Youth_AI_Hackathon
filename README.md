# 가늠 · 사장님의 작은 장사 비서

첨부 목업과 해커톤 기획서를 바탕으로 만든 React / Spring Boot 프로젝트 기초입니다.
DB 없이 실행하며, 가게에서 바꿔볼 일을 등록하고 달력과 장사 기록에서 확인할 수 있습니다.

## 폴더 구조

```text
frontend/          React + TypeScript + Vite
backend/           Spring Boot + Gradle (Java 17 호환)
docs/api.md        프런트·백 공통 API 계약
docs/scope.md      구현 범위와 후속 개발 항목
rule/              작업 규칙, 결정, 교훈, 소스 역할
AGENTS.md          에이전트 작업 지침
```

## 실행 전 준비

아래 명령은 **Windows PowerShell + 로컬에 설치한 Gradle** 기준입니다. 예시의 저장소 경로는 `D:\src\Seoul_Youth_AI_Hackathon`이며, 다른 위치에 내려받았다면 해당 경로로 바꿔주세요.

| 도구 | 프로젝트 기준 |
| --- | --- |
| Node.js / npm | Node.js 22.12.0, npm 10.9.0으로 검증 |
| JDK | Java 17 호환 소스. 빌드·실행 검증에는 JDK 19 사용 |
| Gradle | 검증 버전 8.14.7. 로컬 설치 Gradle을 기본으로 사용 |

JDK에는 `javac`가 포함되어 있어야 합니다. `JAVA_HOME`은 JDK 설치 폴더를 가리키고, JDK와 Gradle의 `bin` 폴더는 `PATH`에 등록되어 있어야 합니다. 설치 또는 환경변수를 변경한 뒤에는 터미널을 새로 열어주세요.

```powershell
node --version
npm --version
java -version
javac -version
gradle --version
```

`gradle --version`에 표시되는 JVM도 확인합니다. Java 코드의 호환 버전과 Gradle 자체를 실행할 수 있는 JDK 버전은 구분되므로, 다른 조합을 사용한다면 해당 Gradle의 Java 지원 범위를 확인하세요.

DB, API 키, 클라우드 계정, 별도 `.env` 파일은 필요하지 않습니다. 최초 실행에는 npm 및 Gradle 의존성을 내려받을 네트워크가 필요합니다.

Vite의 Node 요구사항은 [공식 시작 가이드](https://vite.dev/guide/)를, Spring Boot 3.5의 Java 요구사항은 [공식 시스템 요구사항](https://docs.spring.io/spring-boot/3.5/system-requirements.html)을 참고하세요.

## 개발 서버 실행

**터미널 두 개를 따로 열어** 백엔드와 프런트엔드를 각각 실행합니다. 서버가 실행되면 터미널은 명령 입력 대기 상태로 돌아오지 않으며, 사용 중에는 두 터미널을 계속 열어둡니다.

### 1. 터미널 A: 백엔드 실행

```powershell
Set-Location 'D:\src\Seoul_Youth_AI_Hackathon\backend'
gradle bootRun
```

서버가 시작되면 [백엔드 상태 확인](http://127.0.0.1:8080/api/v1/health)을 엽니다. 정상 응답은 다음과 같습니다.

```json
{"status":"UP"}
```

### 2. 터미널 B: 프런트엔드 실행

```powershell
Set-Location 'D:\src\Seoul_Youth_AI_Hackathon\frontend'
npm ci
npm run dev
```

`npm ci`는 처음 설치하거나 `package-lock.json`이 바뀐 뒤 실행합니다. 의존성이 이미 설치되어 있다면 이후에는 같은 폴더에서 `npm run dev`만 실행하면 됩니다.

### 3. 브라우저 접속

| 용도 | 주소 |
| --- | --- |
| 가늠 화면 | [http://127.0.0.1:5173](http://127.0.0.1:5173) |
| 백엔드 상태 | [http://127.0.0.1:8080/api/v1/health](http://127.0.0.1:8080/api/v1/health) |
| 가게 정보 | [http://127.0.0.1:8080/api/v1/overview](http://127.0.0.1:8080/api/v1/overview) |

화면의 `/api` 요청은 Vite 프록시를 거쳐 백엔드의 `127.0.0.1:8080`으로 전달됩니다. 프런트엔드만 켜면 가게 정보를 불러올 수 없으므로 두 서버를 함께 실행해주세요.

### 종료 및 다시 실행

각 서버를 실행한 터미널에서 `Ctrl+C`를 눌러 종료합니다. 다시 시작할 때는 터미널 A에서 `gradle bootRun`, 터미널 B에서 `npm run dev`를 실행합니다.

백엔드가 종료되면 메모리의 시도 기록도 사라집니다. 백엔드를 다시 실행한 뒤 브라우저도 새로고침해 서버의 현재 기록을 불러오세요.

## 확인해볼 흐름

1. 홈에서 무료 아이디어를 살펴봅니다.
2. 해볼 일, 시작일, 종료일을 입력해 시도를 저장합니다.
3. 내 기록에서 저장한 시도를 확인합니다.
4. 달력에서 시작일과 결과 확인일(종료 다음 날)을 확인합니다.
5. 가상 동네 사례와 결과 예시를 탐색합니다.

시도 기록은 **백엔드 메모리에 임시 보관**됩니다. 브라우저 새로고침 후에는 조회할 수 있지만 **백엔드 재시작 시 사라집니다**. 로그인 없는 단일 가상 가게의 로컬 개발용이며, 동네 사례 및 결과 예시는 모두 가상 데이터입니다.

## 빌드와 테스트

개발 서버가 실행 중이면 각 터미널에서 `Ctrl+C`로 종료한 뒤 아래 명령을 실행합니다.

백엔드 테스트 및 실행 JAR 생성:

```powershell
Set-Location 'D:\src\Seoul_Youth_AI_Hackathon\backend'
gradle clean build
```

- 테스트만 실행: 같은 폴더에서 `gradle test`
- 테스트 결과: `backend/build/reports/tests/test/index.html`
- 실행 JAR: `backend/build/libs/ganum-backend-0.0.1-SNAPSHOT.jar`

프런트엔드 서식 검사 및 프로덕션 빌드:

```powershell
Set-Location 'D:\src\Seoul_Youth_AI_Hackathon\frontend'
npm run format:check
npm run build
```

프런트 빌드 결과는 `frontend/dist/`에 생성됩니다. 실제로 수행한 검증 결과와 미검증 범위는 [검증 기록](docs/verification.md)에 정리했습니다.

## 빌드한 결과 실행하기 (선택)

개발 중에는 위의 `gradle bootRun`과 `npm run dev`를 사용하면 됩니다. 빌드 결과를 확인하려면 빌드를 완료한 뒤 아래 순서로 실행합니다.

먼저 기존 백엔드를 종료해 8080 포트의 중복 사용을 피하고, 터미널 A에서 JAR를 실행합니다.

```powershell
Set-Location 'D:\src\Seoul_Youth_AI_Hackathon\backend'
java -jar .\build\libs\ganum-backend-0.0.1-SNAPSHOT.jar
```

터미널 B에서 프런트 빌드 미리보기를 실행합니다. 아직 `npm run dev`가 실행 중이라면 먼저 `Ctrl+C`로 종료해주세요.

```powershell
Set-Location 'D:\src\Seoul_Youth_AI_Hackathon\frontend'
npm run preview
```

[http://127.0.0.1:4173](http://127.0.0.1:4173)에서 확인합니다. 현재 Vite 버전의 preview는 개발 서버의 API 프록시 설정을 상속하므로 백엔드도 함께 실행되어 있어야 합니다. preview는 로컬 빌드 확인용입니다.

별도 서버에 배포할 때는 정적 서버에서 `/api`를 백엔드로 전달하도록 설정해야 합니다. `dist` 파일 자체에는 Vite의 프록시 기능이 포함되지 않습니다.

## 환경 설정

기본값으로 실행할 때는 추가 설정이 필요하지 않습니다. 백엔드는 다음 환경변수를 읽습니다.

| 환경변수 | 기본값 | 역할 |
| --- | --- | --- |
| `SERVER_ADDRESS` | `127.0.0.1` | 백엔드가 요청을 받을 주소 |
| `SERVER_PORT` | `8080` | 백엔드 포트 |
| `GANUM_STORE_NAME` | `우리동네 분식` | 화면에 표시할 가게 이름 |

가게 이름을 바꾸려면 백엔드를 실행할 PowerShell에서 설정합니다.

```powershell
Set-Location 'D:\src\Seoul_Youth_AI_Hackathon\backend'
$env:GANUM_STORE_NAME = '우리동네 카페'
gradle bootRun
```

이 설정은 해당 터미널 세션에 적용됩니다. 기본값으로 되돌리려면 서버를 종료하고 `Remove-Item Env:GANUM_STORE_NAME`을 실행한 뒤 서버를 다시 시작합니다.

백엔드 포트를 바꾸면 [frontend/vite.config.ts](frontend/vite.config.ts)의 `server.proxy['/api'].target`도 같은 포트로 맞추고 프런트 개발 서버를 다시 시작해야 합니다.

## 자주 발생하는 실행 문제

| 증상 | 확인 및 해결 |
| --- | --- |
| `gradle` 명령을 찾을 수 없음 | 로컬 Gradle 설치와 `bin` 폴더의 PATH 등록을 확인한 뒤 새 터미널에서 `gradle --version` 실행 |
| Java를 찾을 수 없거나 버전 오류 | `JAVA_HOME`, `java -version`, `javac -version`, `gradle --version`의 JVM 확인 |
| PowerShell에서 `npm.ps1` 실행이 차단됨 | 같은 폴더에서 `npm.cmd ci`, `npm.cmd run dev`처럼 `npm.cmd`로 실행 |
| `package.json` 또는 Gradle 프로젝트를 찾지 못함 | npm 명령은 `frontend/`, Gradle 명령은 `backend/`에서 실행했는지 확인 |
| 화면에서 자료를 불러오지 못함 / 프록시 연결 오류 | 백엔드 health가 `UP`인지 확인한 뒤 화면의 재시도 버튼 클릭. 포트를 변경했다면 프록시 주소 확인 |
| 8080 또는 5173 포트가 이미 사용 중 | 이전 서버나 미리보기가 실행 중인지 확인하고 해당 서버를 정상 종료. Vite는 다른 포트로 자동 이동하지 않음 |
| 의존성 다운로드 실패 | 네트워크와 회사 프록시 등 접속 환경을 확인하고 다시 실행. 최초 실행에는 외부 패키지 저장소 접속 필요 |
| 재시작 후 기록이 없어짐 | 현재는 DB 없는 메모리 저장 방식이므로 정상 동작 |

사용 중인 포트는 별도 PowerShell에서 확인할 수 있습니다.

```powershell
Get-NetTCPConnection -State Listen -LocalPort 8080,5173 -ErrorAction SilentlyContinue |
  Select-Object LocalAddress, LocalPort, OwningProcess
```

## Wrapper로 실행하기 (선택)

기본 안내는 로컬 Gradle 기준입니다. 프로젝트에 포함된 Gradle 8.14.7을 사용하고 싶다면 `backend/`에서 다음 명령을 사용할 수 있습니다.

| 작업 | Windows PowerShell | macOS/Linux |
| --- | --- | --- |
| 실행 | `.\gradlew.bat bootRun` | `sh gradlew bootRun` |
| 빌드·테스트 | `.\gradlew.bat clean build` | `sh gradlew clean build` |

Wrapper는 로컬 Gradle의 설치 버전과 별도로 고정된 버전을 사용합니다. macOS/Linux의 실행 예시는 제공하지만 이 환경에서는 검증하지 않았습니다.

## 다음 개발 시

`rule/`의 결정을 먼저 확인하세요. DB를 붙일 때는 Repository 인터페이스의 메모리 구현을 DB 구현으로 교체하고, 마이그레이션 및 영속성 검증을 추가합니다. AI·업로드·실제 통계 등은 [구현 범위](docs/scope.md)에 구분해 두었습니다.
