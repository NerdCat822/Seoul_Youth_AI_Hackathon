import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 에이전트 서버(FastAPI, 7500)의 두 경로를 Spring(7000)보다 먼저 적는다. 먼저 맞는 줄로 보낸다.
const agent = {
  target: process.env.TRYLOG_AGENT_ORIGIN || 'http://127.0.0.1:7500',
  changeOrigin: true,
};
const proxy = {
  '/api/v1/agent': agent,
  '/api/v1/ml': agent,
  '/api': { target: process.env.TRYLOG_API_ORIGIN || 'http://127.0.0.1:7000', changeOrigin: true },
};

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy,
  },
  preview: { port: 4173, strictPort: true, proxy },
});
