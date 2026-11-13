# 프로젝트 작업 규칙

작업 시작 전에 `rule/` 아래 파일을 읽고 작업 종료 시 관련 파일을 갱신한다.

1. 제안 전에 `rule/decisions.md`를 확인한다. 기각된 주제는 새 근거 없이 재제안하지 않는다.
2. 코드 또는 구조 변경 후 해당 rule 파일을 같은 턴에 업데이트한다.
3. `rule/dining-status.md`는 경로, 역할, 호출 관계만 짧게 유지한다.
4. Mapper XML의 API·화면 매핑 헤더 주석이 있으면 코드와 동기화한다.
5. `rule/lessons.md`를 따른다. 검증은 실제 실행 결과와 미검증 범위를 구분해 보고한다.

소스는 `frontend/`(React)와 `backend/`(Spring Boot)로 분리한다. DB는 후속 작업으로 남겨둔다.
