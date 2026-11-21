import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { getSession, request, saveChatExchange, sendChat } from '../api';
import { VoiceInput } from '../components/VoiceInput';
import { addDays, formatDate } from '../lib/dates';
import { CHAT_ENABLED } from '../lib/features';
import { difficulties, statuses } from '../lib/labels';
import { onSpeakingChange, speak, stopSpeaking, unlockAudio } from '../lib/speech';
import type {
  AgentChatResponse,
  AppData,
  ChatCard,
  ChatConversation,
  ChatSession,
  Experiment,
  NeighborhoodCase,
} from '../types';
import { prepareCase, type CasePhoto } from './case-preparation';
import { bindChatPanel, renderChatPanel } from './chat-panel';
import './inputs.css';

const chipCategories = {
  MENU: ['메뉴·가격', 'cat-menu'],
  OPERATION: ['매장 운영', 'cat-store'],
  MARKETING: ['배달·홍보', 'cat-delivery'],
};

const topicPrompts = new Map([
  ['free', '비용 없이 손님을 늘리고 싶어요.'],
  ['review', '리뷰 답글을 어떻게 달면 좋을까요?'],
  ['lunch', '점심시간에 손님이 줄었어요.'],
  ['price', '최근 메뉴 가격을 바꿨어요.'],
]);

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '잠시 뒤 다시 시도해 주세요.';
}

function cardsFor(reply: AgentChatResponse): ChatCard[] {
  return reply.ideas.map((idea) => ({
    caseId: idea.id,
    category: idea.category,
    title: idea.title,
    summary: idea.reason || idea.summary,
    meta: [
      '비용 ' + idea.cost.toLocaleString('ko-KR') + '원',
      difficulties[idea.difficulty],
      idea.durationDays % 7 ? idea.durationDays + '일' : idea.durationDays / 7 + '주',
    ].join(' · '),
  }));
}

type DraftCard = {
  title: string;
  change: string;
  period: string;
  result: string;
  compare: string;
  saved: boolean;
};

// Pass an unsent draft across the same document when the panel expands.
let expandedDraft: { href: string; text: string; photo?: CasePhoto } | undefined;

function snapshot(reply: AgentChatResponse): DraftCard | null {
  const draft = reply.draft;
  if (!draft) return null;
  // Spring calculates the result date as the day after the experiment ends.
  return {
    title: draft.title,
    change: draft.notes,
    period: draft.startDate + ' ~ ' + draft.endDate,
    result: reply.experiment?.checkDate || addDays(draft.endDate, 1),
    compare: [reply.extra.targetMenuName, reply.extra.metric].filter(Boolean).join(' · '),
    saved: reply.status === 'SAVED',
  };
}

export async function mountChat(
  host: HTMLElement,
  compact: boolean,
  data: AppData,
  signal: AbortSignal,
) {
  const { esc, icon, toast } = window.App;
  if (!CHAT_ENABLED) {
    if (compact) host.hidden = true;
    else
      host.innerHTML =
        '<p class="note">이 서버에서는 AI 대화가 꺼져 있어요.</p><a class="btn btn-lg btn-primary mt-5" href="../service.html#/new">새 기록 작성</a>';
    return;
  }
  const panel = compact ? renderChatPanel(host) : host;
  for (const link of panel.querySelectorAll<HTMLAnchorElement>(
    'a[href="upload.html?type=photo"]',
  )) {
    link.href = 'confirm.html';
  }
  const find = <T extends HTMLElement = HTMLElement>(selector: string) =>
    panel.querySelector<T>(selector)!;
  const log = find('[data-chat-log]'),
    form = find<HTMLFormElement>('[data-chat-form]');
  const input = find<HTMLInputElement>('[data-chat-input]'),
    sendButton = find<HTMLButtonElement>('.send-btn');
  const empty = find('[data-chat-empty]');
  const params = new URLSearchParams(location.search);
  let threadId: string | null = null,
    title = '',
    busy = false,
    voiceBusy = false;
  let activeKey: string | null = null;
  let userInteracted = false;
  let currentActions: HTMLElement | null = null;
  let caseController: AbortController | undefined;
  let photo: CasePhoto | undefined;
  function showCase(idea: NeighborhoodCase, existing?: CasePhoto) {
    caseController?.abort();
    caseController = new AbortController();
    photo = existing;
    if (empty) empty.hidden = true;
    panel.querySelector('[data-case-preparation]')?.remove();
    log.append(
      prepareCase(
        idea,
        data.menus,
        existing,
        (selection, message) => {
          photo = selection;
          if (message) {
            input.value = message;
            updateSend();
          }
        },
        AbortSignal.any([signal, caseController.signal]),
      ),
    );
  }
  log.setAttribute('role', 'log');
  log.setAttribute('aria-live', 'polite');
  input.maxLength = 500;
  function updateSend() {
    sendButton.disabled = busy || voiceBusy || Array.from(input.value.trim()).length > 500;
  }
  function remember(id: string) {
    if (signal.aborted) return;
    const expand = panel.querySelector<HTMLAnchorElement>('[data-panel-expand]');
    if (expand) expand.href = 'ai.html?thread=' + encodeURIComponent(id);
    if (activeKey) {
      try {
        sessionStorage.setItem(activeKey, id);
      } catch {
        /* Private browsing. */
      }
    }
    if (!compact && params.get('thread') !== id) {
      const url = new URL(location.href);
      url.search = new URLSearchParams({ thread: id }).toString();
      history.replaceState(history.state, '', url);
    }
  }
  function scrollLog() {
    const scroller = log.closest<HTMLElement>('[data-chat-scroll]');
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
    else log.lastElementChild?.scrollIntoView({ block: 'nearest' });
  }
  function append(role: 'ASSISTANT' | 'USER', text: string, html = '') {
    if (empty) empty.hidden = true;
    const node = document.createElement(role === 'USER' ? 'p' : 'div');
    node.className = role === 'USER' ? 'bubble-user' : 'flex gap-3';
    if (role === 'USER') node.textContent = text;
    else
      node.innerHTML = `<span class="ai-avatar">${icon('sparkling', 18)}</span><div class="min-w-0 flex-1"><div class="whitespace-pre-line pt-1 text-base leading-6 text-body">${esc(text)}</div>${html}</div>`;
    log.append(node);
    scrollLog();
    return node;
  }
  function renderCards(cards: ChatCard[], interactive: boolean) {
    if (!cards.length) return '';
    return (
      '<div class="mt-4 grid grid-cols-2 gap-3">' +
      cards
        .map((card, i) => {
          const category = chipCategories[card.category as keyof typeof chipCategories];
          const liveCase = data.cases.find((item) => item.id === card.caseId);
          return `<div class="rounded-card border border-line bg-white ${compact ? 'p-4' : 'p-5'}">
        ${category ? `<span class="cat ${category[1]}">${category[0]}</span>` : ''}
        <p class="mt-3 ${compact ? 'text-sm' : 'text-base'} font-semibold">${esc(card.title)}</p>
        <p class="mt-1 ${compact ? 'text-[13px]' : 'text-sm'} text-sub">${esc(card.summary)}</p><p class="mt-1 text-[13px] font-medium text-sub">${esc(card.meta)}</p>
        <div class="mt-4 flex items-center justify-between gap-2">
        ${liveCase ? `<a href="idea.html?id=${encodeURIComponent(liveCase.id)}" class="btn btn-sm btn-neutral">자세히 보기</a>` : ''}
        ${interactive && card.caseId ? `<button type="button" class="btn btn-sm bg-brand-weak text-brand-text hover:bg-brand-soft" data-say="${i + 1}번 해볼게요">시도해보기</button>` : ''}
        </div></div>`;
        })
        .join('') +
      '</div>'
    );
  }
  function confirmActions() {
    return '<div class="mt-4 flex justify-end gap-2"><button type="button" class="btn btn-sm btn-neutral" data-say="취소">취소</button><button type="button" class="btn btn-xl btn-primary" data-say="저장">이대로 시도해보기</button></div>';
  }
  function savedCard(record: Experiment) {
    const badge = {
      PLANNED: 'planned',
      IN_PROGRESS: 'progress',
      READY: 'check',
      COMPLETED: 'done',
    }[record.status];
    return `<a href="record.html?id=${encodeURIComponent(record.id)}" class="mt-4 flex items-center justify-between rounded-card border border-line bg-white px-5 py-4 hover:bg-surface-2">
      <span class="flex items-center gap-3"><span class="text-base font-semibold">${esc(record.title)}</span>
        <span class="text-sm text-sub">${formatDate(record.startDate)} ~ ${formatDate(record.endDate)}</span></span>
      <span class="badge badge-${badge}">${statuses[record.status]}</span></a>
      <section class="mt-4 rounded-card border border-line-light bg-white p-5">
        <h3 class="text-[18px] font-bold">기록했어요</h3><div class="divider my-4"></div>
        <p class="text-[15px] leading-6">${formatDate(record.checkDate, true)}부터 결과를 확인할 수 있어요.</p>
        <div class="mt-4 rounded-xl bg-surface-2 p-5"><p class="text-base font-semibold">준비할 자료</p>
        <p class="mt-3 text-sm">가게의 변경 전후 주문 자료로 결과를 비교할 수 있어요.</p></div>
      </section>`;
  }
  function draftCard(draft: DraftCard, confirm: boolean) {
    const rows = [
      ['title', '기록명', draft.title],
      ['change', '변경 내용', draft.change],
      ['period', '진행 기간', draft.period],
      ['result', '결과 확인일', draft.result],
      ['compare', '비교 항목', draft.compare || '—'],
      ['needs', '필요한 자료', '변경 전후 판매 자료'],
    ];
    return `<section class="mt-4 rounded-card border border-line bg-white p-5" data-record-card>
      <div class="flex items-center justify-between"><h3 class="text-[18px] font-bold">기록 내용 확인</h3><span class="text-sm font-medium text-sub">${draft.saved ? '저장됨' : '저장 전'}</span></div>
      <dl class="mt-4 divide-y divide-line-light">${rows
        .map(
          ([key, label, value]) =>
            `<div class="grid grid-cols-[112px_1fr_auto] items-start gap-3 py-3.5" data-row="${key}">
        <dt class="text-[15px] font-semibold">${label}</dt><dd class="text-[15px] font-medium"><span data-val>${esc(value)}</span></dd>
        <button type="button" class="text-[15px] font-medium text-sub hover:text-heading" ${confirm && (key === 'title' || key === 'period') ? 'data-revise' : 'disabled title="직접 수정할 수 없는 항목이에요."'}>수정하기</button></div>`,
        )
        .join('')}
      <div class="grid grid-cols-[112px_1fr_auto] items-center gap-3 py-3.5">
        <dt class="text-[15px] font-semibold">첨부 자료 <span class="font-normal text-sub">(선택)</span></dt>
        <dd class="text-[15px] text-sub">없음</dd><button type="button" disabled title="대화 초안에 파일 첨부를 지원하지 않아요." class="btn btn-sm bg-brand-weak text-brand-text">${icon('add', 16)} 파일 추가</button>
      </div></dl>${confirm ? confirmActions() : ''}</section>`;
  }
  // 말로 한 질문. 녹음이 끝나 마이크가 놓이면 바로 보내고, 답은 소리로 읽는다.
  let spoken: string | null = null;
  const speaking = document.createElement('div');
  speaking.className = 'voice-feedback design-speaking';
  speaking.hidden = true;
  speaking.innerHTML =
    '<span role="status">답을 소리로 읽고 있어요.</span><button type="button">그만 듣기</button>';
  speaking.querySelector('button')!.onclick = () => stopSpeaking();
  const unsubscribe = onSpeakingChange((value) => {
    speaking.hidden = !value;
  });
  signal.addEventListener('abort', unsubscribe, { once: true });
  async function send(text: string, voice = false) {
    stopSpeaking();
    const message = text.trim();
    if (!message || busy || voiceBusy) return;
    if (Array.from(message).length > 500) {
      toast('보낼 내용을 500자 이내로 줄여 주세요.');
      return;
    }
    userInteracted = true;
    busy = true;
    panel
      .querySelectorAll<HTMLInputElement | HTMLButtonElement>(
        '[data-case-preparation] :is(input,button)',
      )
      .forEach((el) => {
        el.disabled = true;
      });
    updateSend();
    updateVoice();
    input.value = '';
    panel.querySelector('[data-hints]')?.remove();
    currentActions
      ?.querySelectorAll<HTMLButtonElement>('[data-say], [data-revise]')
      .forEach((b) => {
        b.disabled = true;
      });
    if (!title) title = message.slice(0, 80);
    append('USER', message);
    const waiting = append('ASSISTANT', '');
    waiting.innerHTML = `<span class="ai-avatar">${icon('sparkling', 18)}</span><span class="sr-only">답을 준비하고 있어요</span><span class="mt-2 flex gap-1" aria-hidden="true">${'<span class="h-1.5 w-1.5 animate-bounce rounded-full bg-dim"></span>'.repeat(3)}</span>`;
    try {
      const reply = await sendChat(threadId, message);
      threadId = reply.threadId;
      remember(threadId);
      waiting.remove();
      const cards = cardsFor(reply);
      const confirm = reply.status === 'AWAITING_CONFIRM';
      const options = confirm ? ['저장', '취소'] : [];
      const draft = snapshot(reply);
      let actions =
        renderCards(cards, true) +
        (draft ? draftCard(draft, confirm) : confirm ? confirmActions() : '');
      if (reply.experiment) actions += savedCard(reply.experiment);
      const content = [reply.reply, ...reply.notices].filter(Boolean).join('\n');
      currentActions = append('ASSISTANT', content, actions);
      if (voice && !signal.aborted && open) {
        // 카드는 눈으로만 보이므로 제안 제목을 번호와 함께 읽는다.
        const picks = cards.map((card, index) => `${index + 1}번, ${card.title}.`);
        speak([content, ...picks].join('\n')).catch(() => undefined);
      }
      const payload =
        draft || cards.length || options.length || reply.experiment
          ? { cards, options, draft, experimentId: reply.experiment?.id }
          : null;
      try {
        await saveChatExchange(threadId, {
          title,
          experimentId: reply.experiment?.id ?? null,
          messages: [
            { role: 'USER', content: message, payload: null },
            {
              role: 'ASSISTANT',
              content,
              payload,
            },
          ],
        });
      } catch {
        if (!signal.aborted) toast('대화 내역을 저장하지 못했어요.');
      }
    } catch (error) {
      if (signal.aborted) return;
      waiting.remove();
      append('ASSISTANT', errorMessage(error));
      if (voice) speak(errorMessage(error)).catch(() => undefined);
      currentActions
        ?.querySelectorAll<HTMLButtonElement>('[data-say], [data-revise]')
        .forEach((b) => {
          b.disabled = false;
        });
    } finally {
      busy = false;
      if (!signal.aborted) {
        updateSend();
        updateVoice();
        input.focus();
      }
    }
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void send(input.value);
  });
  input.addEventListener('input', updateSend);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.isComposing || event.keyCode === 229))
      event.preventDefault();
  });
  panel.addEventListener('click', (event) => {
    const edit = (event.target as Element).closest<HTMLButtonElement>('[data-revise]');
    if (edit && !busy && !voiceBusy) {
      const row = edit.closest<HTMLElement>('[data-row]')!;
      const label = row.querySelector('dt')!.textContent!;
      const val = row.querySelector<HTMLElement>('[data-val]')!;
      const field = val.querySelector('input');
      if (!field) {
        const entry = document.createElement('input');
        entry.className = 'input input-sm';
        entry.setAttribute('aria-label', label);
        entry.value = val.textContent || '';
        val.replaceChildren(entry);
        entry.focus();
        edit.textContent = '완료';
      } else if (field.value.trim()) {
        void send(
          row.dataset.row === 'title'
            ? `제목을 ${field.value.trim()}으로 바꿔 주세요.`
            : `기간을 ${field.value.trim()}로 바꿔 주세요.`,
        );
      }
      return;
    }
    const el = (event.target as Element).closest<HTMLElement>('[data-say],[data-hint]');
    if (el) void send(el.dataset.say || el.textContent || '');
  });
  const mic = form.querySelector<HTMLButtonElement>('[data-mic]')!;
  const micMount = document.createElement('span');
  micMount.className = 'design-mic';
  let voiceRoot: Root | null = null;
  const microphoneIcon = createElement('span', {
    'aria-hidden': true,
    dangerouslySetInnerHTML: { __html: icon('mic', 18) },
  });
  function updateVoice() {
    if (!voiceRoot) return;
    voiceRoot.render(
      createElement(VoiceInput, {
        disabled: busy,
        buttonClassName: 'round-btn',
        microphoneIcon,
        onBusyChange(value) {
          voiceBusy = value;
          if (value) {
            // 마이크를 누르면 읽던 답을 멈춘다. 누른 순간에 소리 재생 권한도 얻어 둔다(휴대폰 브라우저).
            stopSpeaking();
            unlockAudio();
          }
          updateSend();
          if (!value && spoken !== null) {
            // 말이 끝나 녹음이 마치면 바로 보낸다. 입력창에 써 둔 글이 있으면 앞에 붙인다.
            const message = [input.value.trim(), spoken].filter(Boolean).join(' ');
            spoken = null;
            void send(message, true);
          }
        },
        onTranscript(text) {
          spoken = text;
        },
      }),
    );
  }
  function mountVoice(open: boolean) {
    if (!open) stopSpeaking();
    if (open && !voiceRoot) {
      voiceRoot = createRoot(micMount);
      updateVoice();
    } else if (!open && voiceRoot) {
      voiceRoot.unmount();
      voiceRoot = null;
    }
  }
  mic.replaceWith(micMount);
  form.append(speaking);
  panel.querySelectorAll<HTMLButtonElement>('[data-mic]').forEach((button) => {
    button.onclick = () => {
      micMount.querySelector('button')?.click();
    };
  });
  let open = true;
  if (compact) {
    const list = find('[data-chat-list]'),
      items = find('[data-list-items]'),
      search = find<HTMLInputElement>('[data-list-search]');
    function showList(show: boolean) {
      list.hidden = !show;
      find('[data-panel-list]').setAttribute('aria-expanded', String(show));
      find('[data-panel-title]').textContent = show ? '대화 목록' : '대화';
    }
    const expand = find<HTMLAnchorElement>('[data-panel-expand]');
    expand.addEventListener('click', (event) => {
      if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
        expandedDraft = { href: expand.href, text: input.value, photo };
      }
    });
    bindChatPanel(
      panel,
      signal,
      (visible) => {
        open = visible;
        mountVoice(open);
      },
      (id) => {
        const idea = data.cases.find((item) => item.id === id);
        if (!idea) return;
        if (busy || voiceBusy) return toast('진행 중인 대화가 끝나면 다시 시도해 주세요.');
        userInteracted = true;
        threadId = null;
        title = '';
        currentActions = null;
        log.replaceChildren();
        empty.hidden = false;
        showList(false);
        input.value = idea.title + ' 해볼게요.';
        showCase(idea);
        expand.href = 'ai.html?idea=' + encodeURIComponent(id);
        input.focus();
      },
    );
    let sessions: ChatSession[] = [];
    function filter() {
      const q = search.value.trim();
      items.innerHTML =
        sessions
          .filter((s) => (s.title || '').includes(q))
          .map(
            (s) =>
              `<li><a href="ai.html?thread=${encodeURIComponent(s.id)}" class="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-surface-2"><span class="ai-avatar">${icon('sparkling', 16)}</span><span><span class="block text-sm font-semibold">${esc(s.title || '대화')}</span><span class="block text-[13px] text-sub">${esc(s.preview || '')}</span></span></a></li>`,
          )
          .join('') || '<li class="py-6 text-center text-sm text-sub">검색 결과가 없어요.</li>';
    }
    search.oninput = filter;
    find('[data-panel-list]').onclick = async () => {
      showList(Boolean(list.hidden));
      if (!list.hidden) {
        try {
          sessions = await request<ChatSession[]>('/chats', { signal });
          filter();
        } catch (e) {
          items.textContent = errorMessage(e);
        }
      }
    };
  } else mountVoice(true);
  signal.addEventListener('abort', () => mountVoice(false), { once: true });
  window.addEventListener('pagehide', () => mountVoice(false), { signal });
  window.addEventListener(
    'pageshow',
    (e) => {
      if (e.persisted) mountVoice(open);
    },
    { signal },
  );

  const mode = params.get('start');
  const idea = data.cases.find((item) => item.id === params.get('idea'));
  const previous =
    mode === 'next' ? data.experiments.find((item) => item.id === params.get('id')) : undefined;
  const topic = params.get('topic');
  const fresh = !compact && (mode || idea || topic);
  if (fresh) {
    input.value = idea
      ? idea.title + ' 해볼게요.'
      : previous
        ? previous.title + ' 다음으로 해볼 일을 추천해 주세요.'
        : mode === 'record'
          ? ''
          : (topicPrompts.get(topic ?? '') ?? '');
  }
  if (!compact) {
    const carried = expandedDraft?.href === location.href ? expandedDraft : undefined;
    expandedDraft = undefined;
    if (idea) showCase(idea, carried?.photo);
    if (carried) input.value = carried.text;
  }
  try {
    const session = await getSession(signal);
    signal.throwIfAborted();
    if (session.loginId)
      activeKey = `trylog.design.thread.${data.overview.storeId}.${session.loginId}`;
    const saved =
      params.get('thread') || (!fresh && activeKey ? sessionStorage.getItem(activeKey) : null);
    if (saved && !userInteracted) {
      const history = await request<ChatConversation>('/chats/' + encodeURIComponent(saved), {
        signal,
      });
      if (userInteracted || signal.aborted) return;
      threadId = history.session.id;
      title = history.session.title;
      history.messages.forEach((message, index) => {
        const active = index === history.messages.length - 1 && message.role === 'ASSISTANT';
        const payload = message.payload as {
          cards?: ChatCard[];
          options?: string[];
          draft?: DraftCard;
          experimentId?: string;
        } | null;
        const confirm =
          active && Array.isArray(payload?.options) && payload.options.includes('저장');
        const cards = Array.isArray(payload?.cards)
          ? payload.cards.filter((c) => typeof c?.title === 'string')
          : [];
        const html =
          renderCards(cards, active) +
          (typeof payload?.draft?.title === 'string'
            ? draftCard(payload.draft, confirm)
            : confirm
              ? confirmActions()
              : '');
        const record = data.experiments.find(
          (item) =>
            item.id === (payload?.experimentId || (active ? history.session.experimentId : null)),
        );
        const node = append(
          message.role,
          message.content,
          html + (record ? savedCard(record) : ''),
        );
        if (active) currentActions = node;
      });
      if (history.messages.length) panel.querySelector('[data-hints]')?.remove();
      remember(threadId);
    }
  } catch (error) {
    if (signal.aborted) return;
    if (params.has('thread')) append('ASSISTANT', errorMessage(error));
  }
  if (!compact && !log.childElementCount) {
    append(
      'ASSISTANT',
      mode === 'record'
        ? '가게에서 바꾼 일을 이야기해 주세요.'
        : '해본 일이나 고민을 바로 남길 수 있어요',
    );
  }
}
