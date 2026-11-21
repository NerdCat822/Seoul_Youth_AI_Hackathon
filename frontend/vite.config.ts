import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { defineConfig, type Plugin, type ViteDevServer } from 'vite';
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

const designRoot = fileURLToPath(new URL('./design-final/', import.meta.url));
const screens = readdirSync(designRoot).filter((name) => name.endsWith('.html'));

function serveApiUnderBase({ config, middlewares }: Pick<ViteDevServer, 'config' | 'middlewares'>) {
  const base = config.base;
  if (base === '/') return;
  middlewares.use((req, _res, next) => {
    if (req.url?.startsWith(base + 'api/')) req.url = '/' + req.url.slice(base.length);
    next();
  });
}

// Build the supplied markup directly. Only the prototype event handlers and fixtures
// are replaced; the gallery's inline script solely builds a static list of links.
function designScreens(): Plugin {
  return {
    name: 'trylog-design-screens',
    configureServer: serveApiUnderBase,
    configurePreviewServer: serveApiUnderBase,
    transformIndexHtml: {
      order: 'pre',
      handler(html, context) {
        // Vite resolves this public asset under the configured base for every entry page.
        html = html.replace(
          '</head>',
          '  <link rel="icon" href="/favicon.ico" type="image/x-icon">\n</head>',
        );
        if (!context.path.startsWith('/design-final/')) return html;
        const gallery = context.filename.endsWith('index.html');
        if (context.filename.endsWith('settings.html')) {
          html = html.replace(/(id="se-(?:id|pw)"[^>]*?) value="[^"]*"/g, '$1');
        }
        return html
          .replace(
            /<script\b([^>]*)>([\s\S]*?)<\/script>/gi,
            (_, attributes: string, body: string) =>
              gallery && !attributes.trim() && body.trim()
                ? `<script>document.addEventListener('trylog-gallery', () => {${body}}, {once:true});</script>`
                : '',
          )
          .replace('<main ', '<main hidden ')
          .replace('</body>', '<script type="module" src="/src/design/main.ts"></script></body>');
      },
    },
    generateBundle() {
      // The reference top bar creates this relative image dynamically.
      this.emitFile({
        type: 'asset',
        fileName: 'design-final/assets/img/logo.svg',
        source: readFileSync(resolve(designRoot, 'assets/img/logo.svg')),
      });
      this.emitFile({
        type: 'asset',
        fileName: 'assets/Pretendard-LICENSE.txt',
        source: readFileSync(resolve(designRoot, 'assets/fonts/Pretendard-LICENSE.txt')),
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), designScreens()],
  build: {
    rolldownOptions: {
      input: ['index.html', 'service.html', ...screens.map((name) => resolve(designRoot, name))],
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy,
  },
  preview: { port: 4173, strictPort: true, proxy },
});
