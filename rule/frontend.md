# 프런트엔드

- `frontend/src/main.tsx` → `App.tsx`: React 시작점, hash 라우팅, 서버 데이터 로딩과 공통 레이아웃.
- `frontend/src/pages/`: 홈, 달력, 내 기록, 가상 동네 사례/상세, 시도 등록/상세, 가상 결과 예시.
- `frontend/src/components/`: 아이콘·일러스트·목록·제목 공통 요소.
- `frontend/src/api.ts`, `types.ts`: `/api/v1` 계약 타입과 fetch. 요청 10초 제한, 실패 표시, 명시적 재시도. 로컬 fallback 없음.
- `frontend/src/lib/`: UTC 날짜 연산 및 표시용 한글 명칭. 오늘은 서버 Asia/Seoul 값 사용.
- `frontend/vite.config.ts`: 개발 주소 `127.0.0.1:5173`, `/api` → `127.0.0.1:8080` proxy.
- 실행은 `README.md` 기준: `frontend/`에서 최초 `npm ci` 후 `npm run dev`. 빌드 후 `npm run preview`는 4173 포트이며 현재 Vite는 API proxy를 상속한다.
- 스타일은 첨부 목업의 네이비·블루 모바일 구성과 하단 3탭을 따른다. 외부 글꼴/이미지 의존성 없음.
- 등록 폼은 사용자 입력/서버 필드 오류를 표시하고 중복 제출을 막는다. 기록 저장소는 서버 메모리이며 재시작 시 초기화됨을 화면에 알린다.
- AI·음성·실제 통계·판매자료 업로드·분석은 미구현. 가상 결과 예시는 저장된 시도와 분리하며 42/100→58/160의 비중을 코드로 계산한다.

## 검증
- 2026-11-13 `npm run build` 성공: TypeScript 검사 및 Vite 프로덕션 번들 생성.
- 2026-11-13 `npm run format:check` 성공. Prettier 3.10.1 고정, `npm run format`으로 소스/설정 서식 유지.
- 2026-11-13 `npm run dev` 실행 확인. 이후 실제 브라우저 접근이 가능한 로컬 서버로 기동하여 등록·새로고침·달력·사례 필터·오류 재시도를 통합 검증했다. 320/390/1440px 가로 넘침과 런타임 오류 없음. 상세는 `docs/verification.md`.
