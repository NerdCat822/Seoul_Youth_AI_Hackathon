// Only service screens sharing the authenticated top bar can use this document.
const sections = new Map([
  ['home', 'home'],
  ['home-guest', 'home'],
  ['forecast', 'home'],
  ['ai', 'home'],
  ['explore', 'explore'],
  ['idea', 'explore'],
  ['records', 'records'],
  ['record', 'records'],
  ['record-edit', 'records'],
  ['upload', 'records'],
  ['confirm', 'records'],
  ['result', 'records'],
  ['baseline', 'records'],
  ['calendar', 'calendar'],
  ['store', 'store'],
  ['settings', 'settings'],
]);
const directory = new URL('.', location.href);

export function screenName(url: URL) {
  return (
    url.pathname
      .split('/')
      .pop()
      ?.replace(/\.html$/, '') || 'index'
  );
}

export function sectionFor(url: URL) {
  return sections.get(screenName(url));
}

export function isServiceScreen(url: URL) {
  return (
    url.origin === directory.origin &&
    new URL('.', url).href === directory.href &&
    url.pathname.endsWith('.html') &&
    !url.hash &&
    sectionFor(url) !== undefined
  );
}

export function contentRegion(doc: Document) {
  const region = doc.querySelector('main')?.closest<HTMLElement>('body > *');
  if (!region) throw new Error('화면 본문을 찾지 못했어요.');
  return region;
}

function template(doc: Document) {
  return {
    title: doc.title,
    nav: doc.body.dataset.nav ?? '',
    ai: doc.body.dataset.ai ?? '',
    aiHints: doc.body.dataset.aiHints ?? '',
    content: document.importNode(contentRegion(doc), true),
  };
}

// Cache only the original layout. Form values, API responses and React roots belong to their view.
const layouts = new Map([[location.pathname, template(document)]]);
export async function loadLayout(url: URL, signal: AbortSignal) {
  const cached = layouts.get(url.pathname);
  if (cached) return cached;
  const response = await fetch(url.pathname, { signal });
  if (!response.ok) throw new Error('화면을 불러오지 못했어요. 다시 시도해 주세요.');
  const layout = template(new DOMParser().parseFromString(await response.text(), 'text/html'));
  layouts.set(url.pathname, layout);
  return layout;
}

let push: ((url: URL) => void) | undefined;
export function navigateTo(href: string) {
  const url = new URL(href, location.href);
  if (push && isServiceScreen(url)) push(url);
  else location.assign(url.href);
}

export function installNavigation(visit: (url: URL, scroll: number) => void) {
  const positions = new Map<number, number>();
  let entry = Date.now();
  let lastEntry = entry;
  history.replaceState({ ...history.state, trylogEntry: entry }, '');
  history.scrollRestoration = 'manual';

  function open(url: URL) {
    if (url.href === location.href) return;
    positions.set(entry, window.scrollY);
    entry = ++lastEntry;
    history.pushState({ trylogEntry: entry }, '', url);
    visit(url, 0);
  }
  push = open;
  document.addEventListener('click', (event) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.shiftKey ||
      !(event.target instanceof Element)
    )
      return;
    const link = event.target.closest<HTMLAnchorElement>('a[href]');
    if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
    const url = new URL(link.href);
    if (!isServiceScreen(url)) return;
    event.preventDefault();
    open(url);
  });
  window.addEventListener('popstate', (event) => {
    const url = new URL(location.href);
    if (!isServiceScreen(url)) {
      location.reload();
      return;
    }
    positions.set(entry, window.scrollY);
    entry = event.state?.trylogEntry ?? ++lastEntry;
    visit(url, positions.get(entry) ?? 0);
  });
}
