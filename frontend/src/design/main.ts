import { getSession, loadAppData, logOut, setSessionToken } from '../api';
import type { AppData, AuthSession } from '../types';
import { mountAccountScreen } from './settings';
import { CHAT_ENABLED } from '../lib/features';
import { afterLogin, loginForCurrentPage } from './navigation';
import './responsive.css';
import './responsive-records.css';
import {
  contentRegion,
  installNavigation,
  isServiceScreen,
  loadLayout,
  navigateTo,
  screenName,
  sectionFor,
} from './screen-router';

const page = screenName(new URL(location.href));
document.body.dataset.screen = page;
const publicPage = ['index', 'login', 'signup', 'home-guest', 'welcome'].includes(page);
const authPage = page === 'login' || page === 'signup';
const sessionChannel =
  typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('trylog-session');
sessionChannel?.addEventListener('message', () => location.reload());
window.addEventListener('trylog-auth-changed', () => sessionChannel?.postMessage('changed'));
window.addEventListener('trylog-session-expired', () => location.replace('login.html'));
window.addEventListener('pageshow', (event) => {
  if (event.persisted) location.reload();
});

function notificationsFor(data: AppData | null) {
  return (data?.experiments ?? [])
    .filter((item) => item.status === 'READY')
    .map((item) => ({
      href: 'record.html?id=' + encodeURIComponent(item.id),
      icon: 'calendar',
      unread: true,
      title: item.title,
      body: '시도 결과를 확인할 수 있어요.',
      time: item.checkDate,
    }));
}

async function header(session: AuthSession | null, data: AppData | null) {
  const notifications = notificationsFor(data);
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
  // The same header also serves routes reached from the full-screen conversation.
  const fullChat = document.body.dataset.ai === 'off';
  if (fullChat) delete document.body.dataset.ai;
  await import('../../design-final/assets/js/app.js');
  if (fullChat) document.body.dataset.ai = 'off';
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
              location.replace('welcome.html');
            })
            .catch((error: Error) => window.App.toast(error.message));
        },
      });
    },
    true,
  );
}

function selectSection(nav: string) {
  const bar = document.querySelector<HTMLElement>('header[data-topbar]')!;
  for (const link of bar.querySelectorAll<HTMLAnchorElement>('nav a, a.menu-item')) {
    const active = screenName(new URL(link.href)) === nav;
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
    if (link.matches('nav a')) {
      link.classList.toggle('border-brand', active);
      link.classList.toggle('border-transparent', !active);
      link.firstElementChild!.classList.toggle('text-brand-text', active);
      link.firstElementChild!.classList.toggle('text-heading', !active);
    } else {
      link.classList.toggle('text-brand-text', active);
      link.classList.toggle('font-semibold', active);
    }
  }
}

function refreshNotifications(data: AppData) {
  const bar = document.querySelector<HTMLElement>('header[data-topbar]')!;
  const previous = window.TRYLOG.notifications;
  const read = new Set(previous.filter((item) => !item.unread).map((item) => item.href));
  const next = notificationsFor(data).map((item) => ({ ...item, unread: !read.has(item.href) }));
  if (JSON.stringify(next) !== JSON.stringify(previous)) {
    window.TRYLOG.notifications = next;
    bar.querySelector<HTMLElement>('[data-popover="notif"]')!.innerHTML = window.App.notifPanel();
    bar.querySelector<HTMLElement>('[data-unread-dot]')!.hidden = !next.some((item) => item.unread);
  }
}

async function mountScreen(
  name: string,
  session: AuthSession,
  data: AppData | null,
  signal: AbortSignal,
) {
  const main = document.querySelector<HTMLElement>('main')!;
  if (['login', 'signup'].includes(name)) {
    const { mountAuth } = await import('./auth');
    signal.throwIfAborted();
    await mountAuth(name, session);
  } else if (
    ['home', 'home-guest', 'welcome', 'explore', 'idea', 'forecast', 'baseline'].includes(name)
  ) {
    const { mountDashboard } = await import('./dashboard');
    signal.throwIfAborted();
    await mountDashboard(name, data, signal);
  } else if (data) {
    if (name === 'ai') {
      const { mountChat } = await import('./chat');
      signal.throwIfAborted();
      await mountChat(main, false, data, signal);
    } else if (name === 'store' || name === 'settings') {
      await mountAccountScreen(name, session, data, signal);
    } else {
      const { mountRecords } = await import('./records');
      signal.throwIfAborted();
      await mountRecords(name, data, signal);
    }
  }
  signal.throwIfAborted();
  main.hidden = false;
  const toggle = document.querySelector<HTMLButtonElement>('header [data-ai-toggle]');
  if (!toggle) return;
  if (name === 'ai' || !CHAT_ENABLED) {
    toggle.removeAttribute('aria-controls');
    toggle.removeAttribute('aria-expanded');
    toggle.ariaLabel = 'AI 대화';
    toggle.classList.toggle('text-heading', name === 'ai');
    toggle.addEventListener(
      'click',
      () => {
        if (name === 'ai') main.querySelector<HTMLElement>('[data-chat-input]')?.focus();
        else navigateTo('ai.html');
      },
      { signal },
    );
    return;
  }
  const { mountChat } = await import('./chat');
  signal.throwIfAborted();
  const host = document.createElement('div');
  document.body.append(host);
  contentRegion(document).classList.add('ai-shift');
  signal.addEventListener(
    'abort',
    () => {
      host.remove();
      document.body.classList.remove('ai-open');
    },
    { once: true },
  );
  await mountChat(host, true, data, signal);
}

function serviceNavigation(session: AuthSession, initial: AbortController) {
  let view = initial;
  async function visit(url: URL, scroll: number) {
    view.abort();
    view = new AbortController();
    const { signal } = view;
    selectSection(sectionFor(url)!);
    const old = contentRegion(document);
    old.inert = true;
    old.setAttribute('aria-busy', 'true');
    window.App.closeModal();
    for (const pop of document.querySelectorAll<HTMLElement>('[data-popover]')) pop.hidden = true;
    for (const button of document.querySelectorAll('[data-pop]'))
      button.setAttribute('aria-expanded', 'false');
    try {
      const [layout, current] = await Promise.all([loadLayout(url, signal), getSession(signal)]);
      signal.throwIfAborted();
      if (!current.authenticated) {
        location.replace(loginForCurrentPage());
        return;
      }
      if (current.storeId !== session.storeId || current.loginId !== session.loginId) {
        location.reload();
        return;
      }
      setSessionToken(current.csrfToken);
      const data = await loadAppData(signal);
      signal.throwIfAborted();
      const name = screenName(url);
      const next = layout.content.cloneNode(true) as HTMLElement;
      old.replaceWith(next);
      document.body.dataset.nav = layout.nav;
      document.body.dataset.screen = name;
      document.body.dataset.ai = layout.ai;
      document.body.dataset.aiHints = layout.aiHints;
      document.title = layout.title;
      refreshNotifications(data);
      window.App.hydrateIcons(next);
      await mountScreen(name, current, data, signal);
      signal.throwIfAborted();
      const main = document.querySelector<HTMLElement>('main')!;
      if (!document.querySelector('header[data-topbar]')!.contains(document.activeElement)) {
        main.tabIndex = -1;
        main.focus({ preventScroll: true });
      }
      window.scrollTo({ top: scroll, behavior: 'instant' });
    } catch (error) {
      if (!signal.aborted) showError(error, () => void visit(url, scroll));
    }
  }
  installNavigation((url, scroll) => void visit(url, scroll));
}

async function start() {
  // The gallery is the supplied screen directory and can be opened without a store.
  if (page === 'index') {
    const main = document.querySelector<HTMLElement>('main')!;
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
    main.hidden = false;
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
    if (session.authenticated && (authPage || page === 'welcome')) {
      location.replace(authPage ? afterLogin() : 'home.html');
      return;
    }
    const data = session.authenticated ? await loadAppData() : null;
    await header(session, data);
    const initial = new AbortController();
    if (session.authenticated && isServiceScreen(new URL(location.href)))
      serviceNavigation(session, initial);
    try {
      await mountScreen(page, session, data, initial.signal);
    } catch (error) {
      if (!initial.signal.aborted) throw error;
    }
  }
}

function showError(error: unknown, retryAction: () => void) {
  const old = contentRegion(document);
  const main = document.createElement('main');
  const title = document.createElement('h1');
  title.className = 'page-title';
  title.textContent = '화면을 불러오지 못했어요';
  const message = document.createElement('p');
  message.className = 'page-desc';
  message.textContent = error instanceof Error ? error.message : '잠시 후 다시 시도해 주세요.';
  const retry = document.createElement('button');
  retry.className = 'btn btn-lg btn-primary mt-6';
  retry.textContent = '다시 불러오기';
  retry.onclick = retryAction;
  main.className = 'container-main py-12';
  main.replaceChildren(title, message, retry);
  old.replaceWith(main);
}

start().catch((error: unknown) => showError(error, () => location.reload()));
