# 트라이로그 실행 안내

React에서 **내 기록 → 확인할 차례인 시도 → 전후 주문 비교하기 → DB 주문으로 비교**를 선택한다. 결과 화면에서 같은 가게의 7일 예상 매출로 이동할 수 있다. 홈과 달력에 표시하는 오늘은 서버의 서울 날짜다.

## PostgreSQL 연결

서버의 환경에 `DB_PASSWORD`를 주입한다. 공유 DB 점검은 앱을 실행할 서버 또는 DB에 접근 가능한 기존 터널에서 한다.

| 변수 | 기본값 | 용도 |
| --- | --- | --- |
| `DB_HOST`, `DB_PORT` | `localhost`, `5432` | PostgreSQL 서버에서 직접 실행할 때의 주소. 앱 컨테이너에서는 `postgres-db` 사용 |
| `DB_NAME`, `DB_USER` | `hgkim_postgresql`, `nerdcat822` | DB와 접속 역할 |
| `DB_PASSWORD` | 환경에서 주입 | 서버 프로세스가 사용할 비밀번호 |
| `TRYLOG_STORE_ID` | `1` | 조회·등록 대상 가게 |
| `TRYLOG_DEMO_DATE` | 서울 현재 날짜 | 과거 시연일을 재현할 때만 지정 |
| `TRYLOG_ALLOW_WRITES` | `false` | 격리 DB에서 등록을 시험할 때 `true`로 지정. 역할에 시도 INSERT 권한 필요 |
| `TRYLOG_API_ORIGIN` | `http://127.0.0.1:8080` | Vite 서버에서 접근할 API 주소 |

스키마는 `seoul_youth_ai_hackathon`이다. 서버의 psql에서 다음 점검을 먼저 실행할 수 있다. 트랜잭션은 읽기 전용이며 마지막에 롤백한다. 카탈로그·열·키·뷰·권한과 가게별 메뉴·시도·주문 행 수, 유효 영업일 범위를 출력한다. 집계 오류가 나면 앞선 객체·권한 출력과 대조한다.

```sh
# backend/ 에서 실행
: "${DB_PASSWORD:?서버 환경에 DB_PASSWORD가 필요합니다}"
PGPASSWORD="$DB_PASSWORD" psql -X -v ON_ERROR_STOP=1 \
  -h "${DB_HOST:-localhost}" -p "${DB_PORT:-5432}" \
  -U "${DB_USER:-nerdcat822}" -d "${DB_NAME:-hgkim_postgresql}" \
  -f ops/inspect-schema.sql
```

## 실행

Java 17과 Node 22.12 이상을 준비한다. Windows에서는 `backend/`에서 아래 명령을 실행한다. Linux에서는 `sh gradlew`를 쓸 수 있다.

```powershell
if ([string]::IsNullOrWhiteSpace($env:DB_PASSWORD)) { throw '서버 환경에 DB_PASSWORD가 필요합니다.' }
.\gradlew.bat clean build
java -jar build/libs/trylog-backend-0.0.1-SNAPSHOT.jar
```

기존 Docker 네트워크에서 API 컨테이너를 띄울 때는 같은 JAR를 먼저 빌드하고 `backend/`에서 `docker compose config --quiet`, `docker compose up -d api`를 실행한다. 제공된 Compose는 기존 `shared-network`에 읽기 전용 서비스 모드의 API 하나를 연결한다. 브라우저에서 원격 API에 접근하려면 팀의 기존 터널을 이용한다.

별도 터미널에서 `frontend/`로 이동한다.

```sh
npm ci
npm run build
npm run format:check
npm run dev
```

개발 화면은 `http://127.0.0.1:5173`, 빌드 결과는 `npm run preview`를 실행한 후 `http://127.0.0.1:4173`에서 열린다. 두 모드 모두 같은 출처의 `/api` 요청을 Spring으로 전달한다.

## API

모든 경로의 접두사는 `/api/v1`이다. 비교 구간은 시작일부터 최대 14일과 그보다 14일 앞선 같은 길이의 기간이다. 유효한 영수증은 가게·영업일·영수증 번호로 구분한다. 매출은 거래 당시 단가와 수량의 곱을 합산한다.

| 메서드 | 경로 | 동작 |
| --- | --- | --- |
| GET | `/health`, `/ready` | 프로세스 생존, DB 이름·스키마·서비스 열과 읽기 권한 검사. DB 준비 실패는 503 |
| GET | `/overview`, `/menus` | 선택 가게 정보·쓰기 가능 여부 및 메뉴 목록 |
| GET | `/experiments`, `/experiments/{id}` | 선택 가게의 시도 목록·상세. 다른 가게의 ID는 404 |
| POST | `/experiments` | 제목·분류·행동·메뉴·기간·메모를 검증한 뒤 등록. 재전송은 같은 UUID의 `Idempotency-Key` 사용 |
| GET | `/experiments/{id}/report/preview` | 저장된 메뉴 또는 `?targetMenuCode=...`로 DB 주문 집계 |
| POST | `/experiments/{id}/report/from-db` | `{}` 또는 `{"targetMenuCode":"..."}`로 DB 비교 |
| POST | `/experiments/{id}/report` | multipart `file`, `targetMenuCode`로 CSV·단일 시트 XLSX 비교 |
| GET | `/experiments/{id}/report`, `/experiments/{id}/sample.csv` | 영구 보고서 조회(현 DDL에서는 404), 현재 가게·기간에 맞춘 합성 CSV |
| GET | `/demo/forecast` | 가게별 유효 일매출에서 가장 최근 영업일 다음 날부터 7일. 완전한 저장 예측 회차 또는 4주 같은 요일 평균. 이력 부족은 `INSUFFICIENT_DATA`와 누락 날짜 |
| GET | `/cases` | 가상으로 구성한 동네 사례 6개 |

## 보고서 보존에 필요한 차이

제공된 DDL은 시도와 주문을 보존한다. 계산 결과를 보존할 스냅샷 테이블과 시도 완료 플래그는 없다. DB·파일 비교 모두 성공 시 `persisted:false`를 반환하고 시도는 `READY`를 유지한다. DB 미리보기는 새로고침하면 해당 메뉴로 다시 집계한다. 파일 미리보기를 새로고침하면 파일을 다시 선택할 수 있다.

영구 보존에는 가게·시도별 최근 성공 결과 하나를 식별하는 키, 메뉴·출처·비교 기간·계산 버전·결과·저장 시각, 그리고 저장 권한이 필요하다. 성공 결과를 단일 트랜잭션으로 교체하고 해당 행의 존재로 완료 상태를 판정할 수 있다. 현재 앱에서 스키마 초기화는 꺼져 있다.

오프라인 대체 모델 학습과 표본 회귀 실행법은 [매출 모델 안내](forecast-tools/README.md)에 있다.

## 2026-11-21 실행 검증

Windows의 격리 PostgreSQL 16.4에 제공된 DDL과 가게별 CSV를 적재했다. 읽기 전용 점검에서 객체 10개(테이블 9개·뷰 1개), 열 77개와 제약 19개를 조회했다. 테스트 역할은 스키마 USAGE, 테이블·뷰 SELECT와 시도 테이블 INSERT 권한을 가진 일반 역할이었다. 등록 검증 전의 자료 범위는 다음과 같다.

| 가게 | 메뉴 | 시도 | POS 행 | 관측 영업일 |
| --- | ---: | ---: | ---: | --- |
| 지니네김밥 | 24 | 6 | 8,303 | 8월 1일~11월 20일, 112일 |
| 지니버거 | 40 | 5 | 6,959 | 같은 기간 112일 |
| 지니임실치즈피자 | 15 | 4 | 4,885 | 같은 기간 112일 |

- React 프로덕션 번들 → Vite 프록시 → Spring → PostgreSQL 경로로 지니네김밥 기존 시도의 쌀떡볶이(`A011003`)를 열었다. 파일 없이 10월 24일~11월 6일 42/615건·8,162,800원, 11월 7일~20일 137/714건·9,329,700원을 확인했다. 차이는 +12.36%p, 제외한 환불은 29행이었다. 별도로 영수증별 소계를 만든 SQL과 결과가 일치했고 새로고침 후에도 같은 수치가 나왔다.
- 같은 주문 2,069행으로 DB·CSV·XLSX 비교 수치가 일치했다. 잘못된 파일은 400, 저장 스냅샷 조회는 404를 반환했다. 재조회한 시도 상태는 `READY`였다.
- 11월 21일~27일 요일 평균 전망은 첫날 740,025원, 주간 합계 4,373,125원이었다. 7개 값을 원주문에서 따로 계산해 대조했다. 저장 예측의 가게·회차 분리, 누락 날짜, 이력 0일을 별도 격리 DB에서 검증했다.
- 격리 DB에서 동시 등록 재시도 두 건은 같은 ID 한 건을 만들었다. Spring 재기동 후 동일 ID·메뉴·내용을 조회했다. 이어서 PostgreSQL도 재기동해 같은 ID와 POS·전망 수치를 확인했다. 다른 가게 시도는 404, 잘못된 메뉴·역전 날짜는 400, 읽기 전용 모드의 등록은 403을 반환했다. DB 미연결 시 health는 200, ready와 서비스 조회는 503이었다.
- 제출 대상 소스의 독립 복사본에서 Java 17·Gradle 8.14.7 `clean build`(테스트 12개), Node 24.22.3·npm 11.21.3 `npm ci`, 빌드·서식 검사가 통과했다. Chrome의 320·390·1440px에서 격리 DB에 연결해 기존 시도 열기·비교·새로고침·전망·뒤로 가기를 확인했다. 각 너비에서 API 요청 18개가 모두 GET이었고 가로 넘침과 런타임 오류는 없었다. 빈 가게·자료 부족·조회 오류 재시도 화면은 별도 모의 API로도 검증했다.

공유 서버의 실제 행·권한과 그 서버에서의 Docker API 기동은 미검증이다. Compose 설정은 `config --quiet`로 검사했다. 공유 DB에 대한 초기화·시드·쓰기 실행은 0회다.
