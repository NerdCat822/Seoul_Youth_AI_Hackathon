import { loginForPage } from './navigation';
import panelMarkup from './chat-panel.html?raw';

export function renderChatPanel(host: HTMLElement) {
  host.innerHTML = panelMarkup;
  window.App.hydrateIcons(host);
  return host.querySelector<HTMLElement>('[data-ai-panel]')!;
}

export function mountGuestChatPanel(host: HTMLElement, signal: AbortSignal) {
  const panel = renderChatPanel(host);
  bindChatPanel(panel, signal);
  const input = panel.querySelector<HTMLInputElement>('[data-chat-input]')!;
  const compose = document.createElement('a');
  compose.href = loginForPage('ai.html');
  compose.className = 'block w-full text-base text-muted';
  compose.textContent = input.placeholder;
  compose.ariaLabel = '로그인하고 AI 대화 시작하기';
  compose.dataset.chatInput = '';
  input.previousElementSibling?.remove();
  input.replaceWith(compose);
  panel.addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button');
    if (!button || button.hasAttribute('data-ai-close')) return;
    event.preventDefault();
    const topic = button.dataset.hint;
    location.assign(loginForPage(topic ? 'ai.html?' + new URLSearchParams({ topic }) : 'ai.html'));
  });
  panel.querySelector('form')!.onsubmit = (event) => {
    event.preventDefault();
    location.assign(loginForPage('ai.html'));
  };
}

export function bindChatPanel(
  panel: HTMLElement,
  signal: AbortSignal,
  onVisibility?: (open: boolean) => void,
  selectIdea?: (id: string) => void,
) {
  const trigger = document.querySelector<HTMLElement>('header [data-ai-toggle]')!;
  const toggle = trigger instanceof HTMLButtonElement ? trigger : null;
  const tip = document.querySelector<HTMLElement>('header [data-ai-tip]')!;
  const input = panel.querySelector<HTMLInputElement>('[data-chat-input]')!;
  const hints = panel.querySelector<HTMLElement>('[data-hints]')!;
  const hintMode = document.body.dataset.aiHints;
  if (hintMode === 'center') {
    hints.className = 'mt-12 flex flex-col items-center gap-3';
    panel.querySelector('[data-chat-empty]')!.append(hints);
    input.placeholder = '고민을 입력해주세요';
  } else if (hintMode !== 'bottom') hints.remove();

  let preference: string | null = null;
  const key = 'trylog.aiPanel';
  try {
    preference = sessionStorage.getItem(key);
  } catch {
    // Storage can be unavailable in a private window.
  }
  const wide = matchMedia('(min-width: 1280px)');
  const defaultOpen = () => document.body.dataset.ai === 'open' && wide.matches;
  let open = false;
  let timer: number | undefined;
  if (toggle) {
    toggle.ariaLabel = 'AI 대화 열기·닫기';
    toggle.setAttribute('aria-controls', panel.id);
  }
  function display(next: boolean, userAction = false) {
    open = next;
    panel.inert = !open;
    panel.setAttribute('aria-hidden', String(!open));
    document.body.classList.toggle('ai-open', open);
    toggle?.setAttribute('aria-expanded', String(open));
    toggle?.classList.toggle('text-heading', open);
    onVisibility?.(open);
    clearTimeout(timer);
    tip.classList.remove('is-on');
    tip.hidden = true;
    if (!userAction) return;
    preference = open ? 'open' : 'closed';
    try {
      sessionStorage.setItem(key, preference);
    } catch {
      // The controls still work for this view.
    }
    if (open) input.focus({ preventScroll: true });
    else {
      trigger.focus({ preventScroll: true });
      tip.hidden = false;
      tip.classList.add('is-on');
      timer = window.setTimeout(() => {
        tip.hidden = true;
      }, 3200);
    }
  }
  toggle?.addEventListener('click', () => display(!open, true), { signal });
  panel.querySelector('[data-ai-close]')!.addEventListener('click', () => display(false, true));
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') display(false, true);
  });
  if (selectIdea)
    document.addEventListener(
      'trylog-open-chat',
      (event) => {
        display(true, true);
        const id = (event as CustomEvent<{ ideaId: string }>).detail.ideaId;
        selectIdea(id);
      },
      { signal },
    );
  wide.addEventListener(
    'change',
    () => {
      if (preference === null) display(defaultOpen());
    },
    { signal },
  );
  signal.addEventListener(
    'abort',
    () => {
      clearTimeout(timer);
      tip.hidden = true;
      toggle?.setAttribute('aria-expanded', 'false');
    },
    { once: true },
  );
  display(preference === null ? defaultOpen() : preference === 'open');
}
