# 경로 · 역할 · 호출 관계

- `frontend/`: React 화면 → `/api/v1` Spring API. 개발 서버는 Vite proxy 사용.
- `backend/`: Spring Controller → Service → Repository 인터페이스 → 메모리 저장소. DB 없음.
- `backend/build.gradle`, `settings.gradle`, `gradlew*`, `gradle/wrapper/`: Gradle 빌드 · 테스트 · 실행.
- `docs/api.md`: 프런트·백 공통 API 계약.
- `README.md`, `docs/scope.md`: 실행 안내 · 구현 범위.
- `docs/verification.md`: 빌드 · API · 브라우저 검증 기록.
- `docs/erd.md`, `docs/pipeline.md`, `docs/user-flow.md`: DB · 데이터 처리 · 화면 이동 설계안(Mermaid). 미구현 초안이며 DB 도입 결정은 `rule/decisions.md` 기준.
- `docs/diagrams/`: 위 설계안의 그림(SVG 원본, PNG). 손으로 배치한 그림이며 문서 안의 Mermaid와 내용이 같다.
- `docs/trylog-wbs.xlsx`: WBS(작업 44개, 담당·협업·단계), 역할 분담, 단계별 날짜 입력 시트.
- `docs/tools/erd.py`, `docs/tools/pipeline.py`, `docs/tools/render.cjs`: ERD · 파이프라인 그림(SVG)과 설계 문서 PDF를 만드는 스크립트. puppeteer와 marked가 설치된 node_modules 경로를 인자로 받는다.
- `docs/pdf/`: 제출용 PDF. 각 설계안 문서의 본문에 `docs/diagrams/` 그림을 넣어 만든다.
- `tmp/원본-보관/`: 서비스명 변경 전 사용자 원본(기획서 PDF, 목업 HTML) 사본. git 제외.
- `rule/decisions.md`, `rule/lessons.md`: 결정과 교훈.
- `rule/frontend.md`, `rule/backend.md`: 각 소스 역할 및 검증 기록.
- Mapper XML 없음.
