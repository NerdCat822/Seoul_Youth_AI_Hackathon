// 주소창에는 시도·대화의 ID를 보이지 않는다.
//
// 화면 안의 링크는 '#/experiments/{id}/upload'처럼 ID를 담고 있다. 그 주소로 이동하면 곧바로
// ID가 든 경로를 브라우저 방문 기록의 상태(history.state)에 넣고, 주소는 '#/experiment/upload'로 바꾼다.
// 앱은 계속 ID가 든 경로로 화면을 고른다. 새로고침과 뒤로·앞으로 가기에서는 방문 기록에서 경로를 되찾는다.
// 감춘 주소만 복사해 새로 열면 어떤 기록인지 알 수 없으므로, 목록에서 다시 고르도록 안내한다.

const hidden = [
  { withId: /^\/experiments\/[^/?]+/, masked: '/experiment' },
  { withId: /^\/chats\/[^/?]+/, masked: '/chat' },
];

function mask(route: string): string | null {
  for (const rule of hidden) {
    const found = rule.withId.exec(route);
    if (found) return rule.masked + route.slice(found[0].length);
  }
  return null;
}

/** 주소가 ID를 감춘 형태이면 그 종류의 목록 경로를, 아니면 null을 돌려준다. */
export function maskedListPath(pathname: string): string | null {
  if (pathname === '/experiment' || pathname.startsWith('/experiment/')) return '/records';
  if (pathname === '/chat' || pathname.startsWith('/chat/')) return '/chats';
  return null;
}

/** 지금 보여줄 경로(ID 포함)를 돌려준다. 주소창에 ID가 보이면 감춘다. */
export function readRoute(): string {
  const shown = window.location.hash.slice(1) || '/';
  const masked = mask(shown);
  if (masked !== null) {
    window.history.replaceState({ ...window.history.state, trylogRoute: shown }, '', `#${masked}`);
    return shown;
  }
  const saved: unknown = window.history.state?.trylogRoute;
  return typeof saved === 'string' && mask(saved) === shown ? saved : shown;
}
