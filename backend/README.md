# 트라이로그 실행 안내

React에서 **회원가입 → 업종 선택 → 주소 검색 → 가입 → 홈**으로 이동한다. 가입한 계정은 선택한 업종의 기존 가게에 연결된다. 기존 시도가 있는 가게에서는 **내 기록 → 확인할 차례인 시도 → 전후 주문 비교하기 → DB 주문으로 비교**를 선택한다. 홈과 달력의 오늘은 서버의 서울 날짜다.

## 가게 회원가입 준비

이번 변경은 [004 가게 로그인 계정 분리 SQL](ops/migrations/004-store-login-accounts.sql) 한 파일에 들어 있다. 원본 서비스 DDL 또는 이전 회원가입 스키마(001~003)가 적용된 DB에서 실행할 수 있다. `seoul_youth_ai_hackathon.stores`에는 아래 업종에 해당하는 가게 1·2·3번이 미리 있어야 한다.

| 가입 업종 | 업종 코드 | 연결되는 `store_id` |
| --- | --- | ---: |
| 분식 | `Q0001` | 1 |
| 버거-패스트푸드 | `Q0002` | 2 |
| 피자 | `Q0003` | 3 |

DB 소유자로 대상 DB에 연결한 psql에서 `backend/`를 기준으로 실행한다. 앱이 별도 DB 역할을 쓴다면 실행할 세션의 `trylog.service_role`에 해당 역할명을 지정한다. 예를 들어 psql을 띄운 환경의 `DB_USER`가 **앱 역할**이면 아래 첫 두 줄로 전달할 수 있다.

```text
\getenv app_role DB_USER
SET trylog.service_role = :'app_role';
\i ops/migrations/004-store-login-accounts.sql
```

서버는 `upjongs.store_id`에서 대표 가게 번호를 찾아 `store_accounts.store_id`에 저장한다. 여러 계정이 같은 가게의 메뉴·주문·시도·저장된 대화를 공유한다. 가입한 사람의 가게 이름과 주소, 영업 정보는 계정별로 저장한다. 로그인 아이디는 대소문자를 구분하지 않으며 비밀번호는 PBKDF2-HMAC-SHA256 해시로 저장한다.

004는 기존 로그인 아이디와 비밀번호 해시를 이관한 뒤 `stores.login_id`, `stores.password_hash`, `stores.postal_code`를 삭제한다. 기존 계정의 업종이 세 업종 중 하나라면 해당 대표 가게에 연결한다. 기존 주문과 시도는 원래 가게 번호에 남으므로, 예를 들어 이전 가게 10번 계정이 분식 가게 1번에 연결되면 로그인 후에는 1번의 자료가 보인다. 지원하지 않는 업종의 기존 계정이 있거나 대표 가게의 업종이 다르면 SQL이 전체 변경을 롤백한다. 오류에 나온 가게의 업종 배정을 확인한 다음 재실행한다.

가입을 제공할 환경에서는 `TRYLOG_ALLOW_WRITES=true`로 서버를 실행한다. 앱 역할에는 스키마 USAGE, 서비스 데이터 SELECT, `upjongs` SELECT, `store_accounts` SELECT·INSERT 권한이 필요하다. 시도 등록에는 `experiments` INSERT 권한도 필요하다. 운영에서는 HTTPS로 접속하고 TLS를 종료하는 프록시 뒤에서는 세션 쿠키에 `Secure`가 적용되도록 `SERVER_SERVLET_SESSION_COOKIE_SECURE=true`를 설정한다.

회원가입 필수 항목은 로그인 아이디, 비밀번호, 가게 이름, 업종, 가게 주소, 상세 주소다. 개업일, 영업 시작·종료 시간, 정기 휴무일은 선택 사항이다. 비워 둔 날짜와 시간은 `NULL`로 저장한다.

**가게 주소**에 동 이름, 도로명 또는 지번을 두 글자 이상 입력하면 도로명주소와 지번주소가 짝으로 표시된다. 예를 들어 `영등포구 여의동`을 입력하면 행정동이 여의동인 건물의 도로명주소와 법정동인 여의도동의 지번을 함께 볼 수 있다. **주소 더 보기**로 다음 10건을 펼칠 수 있다. 주소를 선택하면 시도·시군구 이름과 코드가 가입 정보에 반영되고 상세 주소로 이동한다.

기본 검색은 키 없이 동작한다. 서버에 포함한 자료는 2026년 11월 9일 기준 서울 전역과 전주 여의동 일대의 도로명·지번 조합 525,312건이다. 자료를 갱신할 때는 우정사업본부에서 지역별 주소 DB ZIP을 받아 Python 3.11 이상으로 `python backend/ops/build-address-directory.py <ZIP경로>`를 실행한 뒤 서버를 다시 빌드한다. [우정사업본부 지역별 주소 DB](https://www.epost.go.kr/search/zipcode/areacdAddressDown.jsp)

전국 주소도 같은 추천 목록에서 검색하려면 도로명주소 검색 API 승인키를 서버 환경 변수 `JUSO_API_KEY`에 주입한다. 별도 배포용 Compose 파일로 실행한다면 해당 파일의 `api.environment`에도 이 변수를 전달한다. [행정안전부 도로명주소 검색 API](https://www.data.go.kr/data/15057017/openapi.do)

## PostgreSQL 연결

서버의 환경에 `DB_PASSWORD`를 주입한다. 공유 DB 점검은 앱을 실행할 서버 또는 DB에 접근 가능한 기존 터널에서 한다.

| 변수 | 기본값 | 용도 |
| --- | --- | --- |
| `DB_HOST`, `DB_PORT` | `localhost`, `5432` | PostgreSQL 서버에서 직접 실행할 때의 주소. 앱 컨테이너에서는 `postgres-db` 사용 |
| `DB_NAME`, `DB_USER` | `hgkim_postgresql`, `nerdcat822` | DB와 접속 역할 |
| `DB_PASSWORD` | 환경에서 주입 | 서버 프로세스가 사용할 비밀번호 |
| `JUSO_API_KEY` | 선택 | 전국 도로명주소 검색 API의 서버용 승인키 |
| `TRYLOG_DEMO_DATE` | 서울 현재 날짜 | 과거 시연일을 재현할 때만 지정 |
| `TRYLOG_ALLOW_WRITES` | `false` | 가입·시도 등록 활성화. 로그인한 가게의 번호는 서버 세션에서 결정 |
| `SERVER_PORT` | `7000` | Spring이 듣는 포트. 에이전트 서버(7500)가 이 주소로 Spring을 부른다 |
| `TRYLOG_API_ORIGIN` | `http://127.0.0.1:7000` | Vite 서버에서 접근할 API 주소 |
| `TRYLOG_AGENT_ORIGIN` | `http://127.0.0.1:7500` | Vite 서버에서 접근할 에이전트 서버(`/api/v1/agent`, `/api/v1/ml`) 주소 |

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

기존 Docker 네트워크에서 API 컨테이너를 띄울 때는 같은 JAR를 먼저 빌드하고 `backend/`에서 `docker compose config --quiet`, `docker compose up -d api`를 실행한다. Compose는 기존 `shared-network`에 API 하나를 연결하며 `TRYLOG_ALLOW_WRITES` 환경값을 따른다. 브라우저에서 원격 API에 접근하려면 팀의 기존 터널을 이용한다.

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

브라우저는 먼저 `GET /auth/session`에서 세션 상태와 CSRF 토큰을 받고 POST 요청에는 `X-CSRF-TOKEN`을 보낸다. 로그인·가입·로그아웃 후에는 응답에 담긴 새 토큰을 사용한다. 가게 데이터 API는 로그인한 세션의 `store_id`로 조회한다.

| 메서드 | 경로 | 동작 |
| --- | --- | --- |
| GET | `/auth/session` | 로그인 여부·현재 로그인 아이디·연결된 가게 번호·계정의 가게 이름·가입 가능 여부·CSRF 토큰 |
| GET | `/upjongs` | 로그인 전에도 조회 가능한 업종 목록. `upjongs` 배열에 `upjongCd`, `upjongNm`을 표시 순서대로 반환 |
| GET | `/addresses/search?q=여의동` | 가입 화면의 주소 검색. `suggestions`에 도로명·지번·우편번호·시도/시군구 이름과 코드를 반환. `hasMore`가 참이면 다음 `page`(첫 페이지는 1)와 첫 응답의 `coverage`(`local` 또는 `national`)로 이어서 조회 |
| POST | `/auth/signup` | 선택한 업종 코드(`upjong`)의 가게에 새 계정을 연결하고 로그인. `openedDate`, `openTime`, `closeTime`, `closedWeekdays`는 각각 생략 가능. 미등록 업종은 400, 중복 ID는 409 |
| POST | `/auth/login`, `/auth/logout` | 세션 로그인 및 로그아웃 |
| GET | `/health`, `/ready` | 프로세스 생존, DB 이름·스키마·서비스 열과 읽기 권한 검사. DB 준비 실패는 503 |
| GET | `/overview`, `/menus` | 현재 가게의 정보(업종 코드 `upjongCd`·표시 이름 `upjongNm` 포함)와 쓰기 가능 여부, 메뉴 목록 |
| GET | `/experiments`, `/experiments/{id}` | 선택 가게의 시도 목록·상세. 다른 가게의 ID는 404 |
| POST | `/experiments` | 제목·분류·행동·메뉴·기간·메모를 검증한 뒤 등록. 재전송은 같은 UUID의 `Idempotency-Key` 사용 |
| GET | `/experiments/{id}/report/preview` | 저장된 메뉴 또는 `?targetMenuCode=...`로 DB 주문 집계 |
| POST | `/experiments/{id}/report/from-db` | `{}` 또는 `{"targetMenuCode":"..."}`로 DB 비교 |
| POST | `/experiments/{id}/report` | multipart `file`, `targetMenuCode`로 CSV·단일 시트 XLSX 비교 |
| GET | `/experiments/{id}/report`, `/experiments/{id}/sample.csv` | 영구 보고서 조회(현 DDL에서는 404), 현재 가게·기간에 맞춘 합성 CSV |
| GET | `/demo/forecast` | 가게별 유효 일매출에서 가장 최근 영업일 다음 날부터 7일. 완전한 저장 예측 회차 또는 4주 같은 요일 평균. 이력 부족은 `INSUFFICIENT_DATA`와 누락 날짜 |
| GET | `/forecast/week` | 서비스 기준 내일부터 7일간의 가게별 예상 매출(원). 같은 회차의 7일 저장 예측을 우선하고, 없으면 날짜별로 최근 4주 같은 요일의 매출을 평균한다. 필요한 영업일이 빠진 날짜의 `expected`는 `null`이다. |
| GET | `/weather/week` | 같은 7일 중 `external_daily_features`에 예보로 저장한 날짜의 평균기온(°C)과 강수량(mm). 날짜별 공통 자료로, 가게별 관측소 구분은 없다. |
| GET | `/cases` | 가상으로 구성한 동네 사례 6개 |
| GET | `/chats`, `/chats/{id}` | 선택 가게의 저장된 대화 목록(최근 대화순), 대화 한 건의 메시지(말한 순서). 다른 가게의 ID는 404 |

## 대화 내역

AI 비서와 주고받은 말은 `chat_sessions`(대화방)와 `chat_messages`(메시지) 두 테이블에 보관한다. 제공된 DDL에는 없는 테이블이므로 `ops/chat-schema.sql`을 한 번 실행해 만든다. 저장하는 쪽이 지킬 규칙은 그 파일 머리말에 있다. `ops/chat-sample.sql`은 화면 확인용 예시 대화 2건을 넣는다.

```sh
# backend/ 에서 실행. 접속 변수는 위의 점검 명령과 같다.
PGPASSWORD="$DB_PASSWORD" psql -X -v ON_ERROR_STOP=1 -h "${DB_HOST:-localhost}" -U "${DB_USER:-nerdcat822}" \
  -d "${DB_NAME:-hgkim_postgresql}" -f ops/chat-schema.sql
```

API는 조회만 한다. `role`이 `SYSTEM`인 메시지는 모델 지시문이므로 응답에서 뺀다. `payload`(JSONB)는 저장된 그대로 JSON으로 내려준다. 화면은 그 안의 `options`(답 아래 선택지)와 `cards`(제안한 해볼 일)를 그린다. 시각은 UTC ISO-8601이고 화면에서 서울 시간으로 바꿔 보여준다. 두 테이블이 없는 DB에서는 이 경로만 503을 반환하고 `/ready`와 다른 기능은 영향을 받지 않는다. React에서는 **내 기록 → 대화 내역**에서 본다.

## 보고서 보존에 필요한 차이

제공된 DDL은 시도와 주문을 보존한다. 계산 결과를 보존할 스냅샷 테이블과 시도 완료 플래그는 없다. DB·파일 비교 모두 성공 시 `persisted:false`를 반환하고 시도는 `READY`를 유지한다. DB 미리보기는 새로고침하면 해당 메뉴로 다시 집계한다. 파일 미리보기를 새로고침하면 파일을 다시 선택할 수 있다.

영구 보존에는 가게·시도별 최근 성공 결과 하나를 식별하는 키, 메뉴·출처·비교 기간·계산 버전·결과·저장 시각, 그리고 저장 권한이 필요하다. 성공 결과를 단일 트랜잭션으로 교체하고 해당 행의 존재로 완료 상태를 판정할 수 있다. 현재 앱에서 스키마 초기화는 꺼져 있다.

오프라인 대체 모델 학습과 표본 회귀 실행법은 [매출 모델 안내](forecast-tools/README.md)에 있다.

## 계정 분리 전 업종 선택 검증 기록

격리 PostgreSQL과 Chrome에서 CSV의 8개 코드·이름·순서를 API 및 가입 칩과 대조했다. ‘버거·패스트푸드’를 선택해 가입한 가게의 `stores.upjong`은 `Q0002`였고, 새로고침과 재로그인 후에도 홈에 ‘버거·패스트푸드’가 표시됐다. 빈 업종·미등록 코드·업종명을 직접 보낸 가입 요청은 모두 400을 반환했다. 기존 ‘분식’은 `Q0001`로 전환됐고, CSV에 없는 기존 업종명은 보존됐다. 공유 DB 반영은 배포 단계에 남아 있다.

## 2026-11-21 계정 분리 전 회원가입 검증 기록

격리 PostgreSQL 16.4에서 기존 가게 번호를 보존한 채 마이그레이션을 적용했다. Chrome에서 카카오 지번 주소를 선택한 뒤 세종 도로명주소로 바꿔 가입했다. 발급된 `store_id`의 행에서 우편번호 `30145`, 시군구 코드 `36110`, 상세주소, 영업시간과 휴무일이 화면 입력과 일치했다. 새 가게의 빈 기록, 새로고침, 로그아웃, 대문자로 입력한 아이디의 재로그인을 확인했다.

별도 계정으로 다른 가게의 시도에 접근하면 404를 반환했고, 중복 아이디는 409를 반환했다. 서버 재기동 후에도 같은 아이디로 로그인했다. 백엔드 테스트 16개와 프런트엔드 빌드·서식 검사를 통과했다. 공유 DB 마이그레이션과 운영 배포는 실행하지 않았다.

## 2026-11-21 회원가입 도입 전의 주문·전망 검증

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
