import { getSession, loadAppData, logOut, setSessionToken } from '../api';
import type { AppData, AuthSession } from '../types';
import { mountAccountScreen } from './settings';
import { afterLogin, loginForCurrentPage } from './navigation';

const page =
  location.pathname
    .split('/')
    .pop()
    ?.replace(/\.html$/, '') || 'index';
const main = document.querySelector<HTMLElement>('main')!;
const publicPage = ['index', 'login', 'signup', 'home-guest'].includes(page);
const authPage = page === 'login' || page === 'signup';
const sessionChannel =
  typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('trylog-session');
sessionChannel?.addEventListener('message', () => location.reload());
window.addEventListener('trylog-auth-changed', () => sessionChannel?.postMessage('changed'));
window.addEventListener('trylog-session-expired', () => location.replace('login.html'));
window.addEventListener('pageshow', (event) => {
  if (event.persisted) location.reload();
});

async function header(session: AuthSession | null, data: AppData | null) {
  const notifications = (data?.experiments ?? [])
    .filter((item) => item.status === 'READY')
    .map((item) => ({
      href: 'record.html?id=' + encodeURIComponent(item.id),
      icon: 'calendar',
      unread: true,
      title: item.title,
      body: '시도 결과를 확인할 수 있어요.',
      time: item.checkDate,
    }));
  Object.assign(window, {
    TRYLOG: {
      store: { name: session?.storeName ?? '', email: session?.loginId ?? '' },
      notifications,
      statusLabel: {
        check: '확인 필요',
        progress: '진행 중',
        planned: '시작 예정',
        data: '자료 확인 필요',
        done: '완료',
        stopped: '중단',
      },
      statusClass: {
        check: 'badge-check',
        progress: 'badge-progress',
        planned: 'badge-planned',
        data: 'badge-warn',
        done: 'badge-done',
        stopped: 'badge-planned',
      },
      categories: {
        menu: { label: '메뉴·가격', cls: 'cat-menu', img: 'bg-cat-menu-img' },
        store: { label: '매장 운영', cls: 'cat-store', img: 'bg-cat-store-img' },
        delivery: { label: '배달·홍보', cls: 'cat-delivery', img: 'bg-cat-delivery-img' },
      },
    },
  });
  if (session?.authenticated && page === 'home-guest')
    document.querySelector<HTMLElement>('header')!.dataset.topbar = '';
  await import('../../design-final/assets/js/icons.js');
  await import('../../design-final/assets/js/app.js');
  window.App.hydrateIcons();

  document.addEventListener(
    'click',
    (event) => {
      if (
        !(event.target instanceof Element) ||
        !event.target.closest('[data-action="logout"], [data-logout]')
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      window.App.openModal({
        title: '로그아웃할까요?',
        body: '다시 로그인하면 기록과 판매 자료를 그대로 볼 수 있어요.',
        confirm: '로그아웃',
        onConfirm: () => {
          void logOut()
            .then(() => {
              sessionChannel?.postMessage('changed');
              location.replace('login.html');
            })
            .catch((error: Error) => window.App.toast(error.message));
        },
      });
    },
    true,
  );
}

async function start() {
  // The gallery is the supplied screen directory and can be opened without a store.
  if (page === 'index') {
    const session = await getSession().catch(() => null);
    const data = session?.authenticated ? await loadAppData().catch(() => null) : null;
    await header(session, data);
    document.dispatchEvent(new Event('trylog-gallery'));
    // The design directory uses r1/i1 as example identifiers. Resolve via real lists.
    for (const link of main.querySelectorAll<HTMLAnchorElement>('a[href]')) {
      const target = new URL(link.href);
      if (!/\/(idea|record|record-edit|upload|confirm|result)\.html$/.test(target.pathname))
        continue;
      target.searchParams.delete('id');
      const item = target.pathname.endsWith('/idea.html')
        ? data?.cases[0]
        : (data?.experiments.find((record) => record.status === 'READY') ?? data?.experiments[0]);
      if (item) target.searchParams.set('id', item.id);
      link.href = target.href;
    }
  } else {
    const session = await getSession();
    setSessionToken(session.csrfToken);
    window.addEventListener('trylog-session-refreshed', (event) => {
      const current = (event as CustomEvent<AuthSession>).detail;
      if (
        session.authenticated !== current.authenticated ||
        session.loginId !== current.loginId ||
        session.storeId !== current.storeId
      )
        location.reload();
    });
    if (!session.authenticated && !publicPage) {
      location.replace(loginForCurrentPage());
      return;
    }
    if (session.authenticated && authPage) {
      location.replace(afterLogin());
      return;
    }
    const data = session.authenticated ? await loadAppData() : null;
    await header(session, data);
    if (authPage) {
      await (await import('./auth')).mountAuth(page, session);
    } else if (['home', 'home-guest', 'explore', 'idea', 'forecast', 'baseline'].includes(page)) {
      await (await import('./dashboard')).mountDashboard(page, data);
    } else if (data) {
      if (page === 'ai') {
        await (await import('./chat')).mountChat(main, false, data);
      } else if (page === 'store' || page === 'settings') {
        await mountAccountScreen(page, session, data);
      } else {
        await (await import('./records')).mountRecords(page, data);
      }
    }
  }
  main.hidden = false;
}

start().catch((error: unknown) => {
  const title = document.createElement('h1');
  title.className = 'page-title';
  title.textContent = '화면을 불러오지 못했어요';
  const message = document.createElement('p');
  message.className = 'page-desc';
  message.textContent = error instanceof Error ? error.message : '잠시 후 다시 시도해 주세요.';
  const retry = document.createElement('button');
  retry.className = 'btn btn-lg btn-primary mt-6';
  retry.textContent = '다시 불러오기';
  retry.onclick = () => location.reload();
  main.className = 'container-main py-12';
  main.replaceChildren(title, message, retry);
  main.hidden = false;
});
