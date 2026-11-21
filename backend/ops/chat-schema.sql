-- 트라이로그 채팅 내역: 사장님과 AI 비서가 주고받은 말을 보관한다.
-- 실행: psql -X -v ON_ERROR_STOP=1 -f ops/chat-schema.sql   (여러 번 실행해도 된다)
--
-- 저장하는 쪽(채팅 화면·AI 에이전트)이 지킬 것
--   1. 대화를 시작할 때 chat_sessions 에 한 행을 넣는다. id 는 UUID.
--   2. 말이 오갈 때마다 chat_messages 에 한 행씩 넣는다. role 은 USER(사장님) / ASSISTANT(AI) / SYSTEM(화면에 안 보이는 지시문).
--   3. 글 이외의 내용은 payload(JSON)에 넣는다. 없으면 비워 둔다. 화면은 아래 두 키를 그린다.
--        "options": ["네, 운영하고 있어요", "아니요"]          AI가 답 아래에 보여 준 선택지
--        "cards":   [{"caseId": "menu-badge", "category": "MENU", "title": "...", "summary": "...", "meta": "비용 0원 · 2주"}]
--                                                              AI가 제안한 해볼 일. 그때 보여 준 내용을 그대로 담는다
--      그 밖의 키(사용한 모델, 첨부 등)는 자유롭게 더해도 된다. 화면은 모르는 키를 건너뛴다.
--   4. 시각은 넣지 않으면 저장 시각이 들어간다. 대화방의 마지막 대화 시각은 메시지에서 계산하므로 따로 고치지 않는다.
BEGIN;
SET LOCAL search_path = seoul_youth_ai_hackathon;

-- 11. 대화방: 가게별 대화 한 묶음
CREATE TABLE IF NOT EXISTS chat_sessions (
    id VARCHAR(36) PRIMARY KEY,                                              -- UUID
    store_id INT NOT NULL REFERENCES stores(store_id),
    title VARCHAR(120) NOT NULL DEFAULT '',                                  -- 목록에 보일 제목 (보통 첫 질문)
    experiment_id VARCHAR(36) REFERENCES experiments(id) ON DELETE SET NULL, -- 특정 시도에 관한 대화일 때만
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP                -- 대화를 시작한 시각
);

-- 12. 메시지: 대화방 안에서 한 번 한 말
CREATE TABLE IF NOT EXISTS chat_messages (
    message_id BIGSERIAL PRIMARY KEY,                                        -- 같은 대화방에서는 작을수록 먼저 한 말
    session_id VARCHAR(36) NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('USER', 'ASSISTANT', 'SYSTEM')),
    content TEXT NOT NULL,                                                   -- 화면에 보이는 글
    payload JSONB,                                                           -- 글 이외의 내용. 형식은 자유
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP                -- 말한 시각
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_store ON chat_sessions (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages (session_id, message_id);
COMMIT;
