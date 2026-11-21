# Trylog PC 웹 (HTML + Tailwind + JS)

Figma `Trylog_Design / 01_design` 페이지를 실제 코드로 옮긴 정적 웹입니다. 빌드 없이 `index.html`을 브라우저로 열면 바로 동작합니다. 시연 기준일은 2026년 12월 3일(목)이고, 모든 데이터는 `assets/js/data.js`의 목업입니다.

## 화면

| 파일 | Figma | 들어 있는 상태·동작 |
|---|---|---|
| `login.html` | ON-02 | 빈 값 검증 |
| `signup.html` | ON-03 | 계정 정보 → 가게 정보 → 가입 완료 (스텝, 칩 선택, 필수값 검증) |
| `home-guest.html` | HM-01 | 첫 방문 홈 + AI 대화 패널 |
| `home.html` | HM-02 | 기록 요약, 예상매출, 진행 중인 기록, 미니 달력, AI 대화 패널(대화 목록·검색·작게보기) |
| `ai.html` | AI-00~05, AI-01-A | 고민 상담 → 해볼 일 제안 → 시도해보기 → 기록 확인(항목별 수정) → 저장 완료, 첨부 메뉴 |
| `explore.html` / `idea.html` | ID-01 / ID-02 | 분야 탭·0원 필터 / 사례 상세 |
| `records.html` / `calendar.html` | RC-01 / RC-02 | 상태 필터 / 월 이동·오늘 이동 |
| `record.html` / `record-edit.html` | RC-03 / RC-04 | 상태별 안내, 결과 확인일 변경, 중단·삭제 / 날짜 검증, 비교 항목, 첨부 |
| `upload.html` | RC-05 (+자료 부족) | 파일 선택·끌어 놓기, 자료 확인, 자료 부족 경고, 샘플 양식 CSV 내려받기 |
| `confirm.html` | RC-06 | 사진 숫자 확인(자리 수 오류 고치기, 세트 ≤ 전체 검증), `?mode=manual` 직접 입력 |
| `result.html` | RC-07·08 | 결과 요약·차트, 다음에 해볼 일(선택에 따라 버튼 문구·이동이 바뀜) |
| `forecast.html` / `baseline.html` | FC-02·01 / FC-03 | `?state=empty`로 자료 부족 상태 |
| `store.html` / `settings.html` | ST-01·02 / SE-01·02 | 가게 정보 저장, 판매 자료 삭제 / 로그아웃·회원 탈퇴 확인창, 데이터 CSV 내려받기 |

공통: 상단 탭바, 알림 패널(모두 읽음), 사용자 메뉴, 모달, 토스트 — `assets/js/app.js`

## 구조

```
assets/css/style.css   ← 빌드 결과 (직접 수정하지 않음)
assets/js/app.js       ← 공통 UI
assets/js/ai-chat.js   ← AI 대화 시나리오 · 홈 패널
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
- **반응형**: 1680px 미만에서는 홈의 AI 패널이 오른쪽 아래 "AI 대화" 버튼으로 접혀요.
