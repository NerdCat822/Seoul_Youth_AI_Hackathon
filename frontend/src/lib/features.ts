// 오른쪽 대화창은 에이전트 서버(/api/v1/agent)를 부른다.
// 그 경로를 열지 않은 배포에서는 빌드할 때 VITE_TRYLOG_CHAT=0 을 주어 끈다.
export const CHAT_ENABLED = import.meta.env.VITE_TRYLOG_CHAT !== '0';
