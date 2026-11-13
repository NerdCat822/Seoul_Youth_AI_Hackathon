# 경로 · 역할 · 호출 관계

- `frontend/`: React 화면 → `/api/v1` Spring API. 개발 서버는 Vite proxy 사용.
- `backend/`: Spring Controller → Service → Repository 인터페이스 → 메모리 저장소. DB 없음.
- `backend/build.gradle`, `settings.gradle`, `gradlew*`, `gradle/wrapper/`: Gradle 빌드 · 테스트 · 실행.
- `docs/api.md`: 프런트·백 공통 API 계약.
- `README.md`, `docs/scope.md`: 실행 안내 · 구현 범위.
- `docs/verification.md`: 빌드 · API · 브라우저 검증 기록.
- `rule/decisions.md`, `rule/lessons.md`: 결정과 교훈.
- `rule/frontend.md`, `rule/backend.md`: 각 소스 역할 및 검증 기록.
- Mapper XML 없음.
