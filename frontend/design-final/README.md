# Trylog PC 웹 (HTML + Tailwind + JS)

Figma `Trylog_Design / 01_design` 페이지를 실제 코드로 옮긴 정적 웹입니다. 빌드 없이 `index.html`을 브라우저로 열면 바로 동작합니다. 시연 기준일은 2026년 12월 3일(목)이고, 모든 데이터는 `assets/js/data.js`의 목업입니다.

## 화면

| 파일 | Figma | 들어 있는 상태·동작 |
|---|---|---|
| `login.html` | ON-02 | 빈 값 검증 |
| `signup.html` | ON-03 | 계정 정보 → 가게 정보 → 가입 완료 (스텝, 칩 선택, 필수값 검증) |
| `welcome.html` | HM-01 (배너, 189:1648) | 로그인 전 홈 — 배너(이미지 자리), 추천 일, AI 패널(가운데 추천 문장) |
| `home-guest.html` | HM-01 | 첫 방문 홈 + AI 대화 패널 |
| `home.html` | HM-02 | 진행 중인 기록(항목 구분선·확인 필요 강조), 미니 달력, 기록 요약, 동네 사례 |
| `ai.html` | AI-00~05, AI-01-A | 고민 상담 → 해볼 일 제안 → 시도해보기 → 기록 확인(항목별 수정) → 저장 완료, 첨부 메뉴 |
| `explore.html` / `idea.html` | ID-01 / ID-02 | 분야 탭·0원 필터 / 사례 상세 |
| `records.html` / `calendar.html` | RC-01 / RC-02 | 상태 필터, 목록·카드 보기 전환(`?view=card`, 마지막 선택 기억) / 월 이동·오늘 이동 |
| `record.html` / `record-edit.html` | RC-03 / RC-04 | 상태별 안내, 결과 확인일 변경, 중단·삭제 / 날짜 검증, 비교 항목, 첨부 |
| `upload.html` | RC-05 (+자료 부족) | 파일 선택·끌어 놓기, 자료 확인, 자료 부족 경고, 샘플 양식 CSV 내려받기 |
| `confirm.html` | RC-06 | 사진 숫자 확인(자리 수 오류 고치기, 세트 ≤ 전체 검증), `?mode=manual` 직접 입력 |
| `result.html` | RC-07·08 | 결과 요약·차트, 다음에 해볼 일(선택에 따라 버튼 문구·이동이 바뀜) |
| `forecast.html` / `baseline.html` | FC-02·01 / FC-03 | `?state=empty`로 자료 부족 상태 |
| `store.html` / `settings.html` | ST-01·02 / SE-01·02 | 가게 정보 저장, 판매 자료 삭제 / 로그아웃·회원 탈퇴 확인창, 데이터 CSV 내려받기 |

공통: 상단 탭바, 알림 패널(모두 읽음), 사용자 메뉴, 모달, 토스트 — `assets/js/app.js`

오른쪽 분할 AI 패널(모든 화면): 상단바 대화 아이콘으로 열고 닫아요. 열리면 오른쪽에서 밀려 들어오고 본문이 왼쪽으로 비켜 화면을 나눠 써요(1280px 미만은 본문 위에 띄움). 닫으면 대화 아이콘 아래에 "여기서 언제든 대화를 다시 시작할 수 있어요" 안내가 떠요. 열림 상태는 탭 안에서 유지돼요. 홈 3종은 처음부터 열려 있고, `body[data-ai]`로 화면별 기본값을 정해요. ID-02 "우리 가게에서 해보기" → 패널이 열리며 사진 올리기 → (메뉴·가격이면) 대표 메뉴 고르기 → 기록 확인 → 저장으로 이어져요.

이미지 자리(Figma `image area`): 사례 카드 썸네일 `assets/img/ideas/i*.svg`, 로그인 전 배너 `assets/img/banner.svg`는 자리표시 이미지예요. 같은 이름으로 실제 사진을 넣으면 바로 바뀌어요. 메뉴판 예시 사진은 `assets/img/menu-board.png`(Figma 200:11099)예요.

## 구조

```
assets/css/style.css   ← 빌드 결과 (직접 수정하지 않음)
assets/js/app.js       ← 공통 UI
assets/js/ai-chat.js   ← AI 대화 시나리오 · 오른쪽 분할 패널(window.TrylogAI)
assets/js/data.js      ← 목업 데이터
assets/js/icons.js     ← Remix Icon 경로 (tools/build-icons.py로 생성)
assets/fonts/          ← Pretendard Variable (SIL OFL 1.1)
src/input.css          ← Tailwind 입력 + 컴포넌트 클래스(.btn, .card, .chip, .badge …)
tailwind.config.js     ← 디자인 토큰 (Figma 변수 기준)
```

## 스타일 수정

```bash
npm install
npm run build    # 한 번 빌드
npm run watch    # 수정할 때마다 자동 빌드
```

## Figma와 다르게 정한 부분

- **상단바 통일**: 일부 화면의 햄버거 상단바 대신 모든 화면에 탭 상단바를 썼어요.
- **브레드크럼 없음**: 모든 화면에서 뺐어요.
- **숫자 정합성**: RC-07 세트 메뉴 주문 증감 +60건 → +16건(58−42). 홈 요약은 기록 목록과 맞춰 진행 중 2 · 결과 확인 필요 1 · 확인 완료 1 · 전체 6건.
- **RC-05 작업 중 문구 정리**: 드롭존 버튼 "파일 선택", 변경 전 기간 11월 5일~18일, 파일 형식 "엑셀(XLSX·CSV) · PDF · 사진".
- **다음에 해볼 일**: 고른 항목에 따라 버튼이 "이대로 유지하기 / 다음 기록 만들기 / 기록 마치기 / 나중에 결정하기"로 바뀌어요.
- **상태 배지**: 확인 필요(파랑) · 진행 중(연파랑) · 시작 예정/중단(회색) · 완료(초록)로 화면 간 통일.
- **로그인 전 홈**: 로그인 전에는 로고·홈 탭이 `welcome.html`로 가고, 로그아웃·탈퇴 후에도 이 화면으로 돌아와요.
- **반응형**: 1280px 이상은 화면 분할, 미만은 AI 패널이 본문 위에 떠요. 1600px 미만에서 패널을 열면 홈의 미니 달력은 숨겨요.
