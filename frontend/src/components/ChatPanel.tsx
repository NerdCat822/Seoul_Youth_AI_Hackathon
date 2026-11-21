import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { ApiError, saveChatExchange, sendChat } from '../api';
import { formatDate } from '../lib/dates';
import { categories, difficulties } from '../lib/labels';
import type { AgentChatResponse, Category, ChatCard, Experiment } from '../types';
import { Icon } from './Icon';
import { VoiceInput } from './VoiceInput';
import '../pages/chat.css';

interface PanelMessage {
  key: number;
  role: 'USER' | 'ASSISTANT';
  text: string;
  cards: ChatCard[];
  options: string[];
  notices: string[];
  /** 카드가 고를 수 있는 제안일 때. 카드를 누르면 "N번 해볼게요"를 보낸다. */
  pick?: boolean;
  /** 이 답에서 저장된 시도 */
  experimentId?: string;
  failed?: boolean;
}

const STORE_KEY = 'trylog.chat';
const MESSAGE_LIMIT = 500;
const EXAMPLES = [
  '요즘 점심시간에 손님이 줄었어',
  '오늘부터 2주 동안 쌀떡볶이에 추천 표시를 붙였어',
];
const won = new Intl.NumberFormat('ko-KR');

function restore(key: string): { threadId: string | null; messages: PanelMessage[] } {
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(key) ?? 'null');
    if (saved && Array.isArray(saved.messages))
      return {
        threadId: typeof saved.threadId === 'string' ? saved.threadId : null,
        messages: saved.messages,
      };
  } catch {
    // 저장된 값을 읽지 못하면 새 대화로 시작한다.
  }
  return { threadId: null, messages: [] };
}

/** 에이전트의 답에서 글 아래에 보여줄 카드와 선택지를 만든다. 대화 내역에도 이 모양 그대로 저장한다. */
function shown(
  reply: AgentChatResponse,
): Pick<PanelMessage, 'cards' | 'options' | 'pick' | 'experimentId'> {
  if (reply.status === 'IDEAS')
    return {
      pick: true,
      options: reply.ideas.map((_, index) => `${index + 1}번 해볼게요`),
      cards: reply.ideas.map((idea) => ({
        caseId: idea.id,
        category: idea.category,
        title: idea.title,
        summary: idea.reason || idea.summary,
        meta: [
          `비용 ${idea.cost ? `${won.format(idea.cost)}원` : '0원'}`,
          difficulties[idea.difficulty],
          idea.durationDays % 7 === 0 ? `${idea.durationDays / 7}주` : `${idea.durationDays}일`,
        ]
          .filter(Boolean)
          .join(' · '),
      })),
    };
  const draft = reply.draft;
  const cards = draft
    ? [
        {
          caseId: '',
          category: draft.category,
          title: draft.title,
          summary: [
            `${formatDate(draft.startDate)} ~ ${formatDate(draft.endDate)}`,
            reply.extra.targetMenuName,
          ]
            .filter(Boolean)
            .join(' · '),
          meta: reply.extra.metric ?? '',
        },
      ]
    : [];
  if (reply.status === 'AWAITING_CONFIRM') return { cards, options: ['저장', '취소'] };
  if (reply.status === 'SAVED') return { cards, options: [], experimentId: reply.experiment?.id };
  return { cards: reply.status === 'ASKING' ? cards : [], options: [] };
}

export function ChatPanel({
  loginId,
  storeId,
  open,
  onClose,
  onNavigate,
  onSaved,
}: {
  loginId: string | null;
  storeId: number;
  open: boolean;
  onClose: () => void;
  /** 대화창 안의 링크로 다른 화면에 갈 때 */
  onNavigate: () => void;
  onSaved: (experiment: Experiment) => void;
}) {
  const chatKey = loginId ? `${STORE_KEY}.${storeId}.${loginId}` : null;
  const [initial] = useState(() => (chatKey ? restore(chatKey) : { threadId: null, messages: [] }));
  const [threadId, setThreadId] = useState(initial.threadId);
  const [messages, setMessages] = useState(initial.messages);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const draftLength = Array.from(input.trim()).length;
  const busy = sending || voiceBusy;
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const nextKey = useRef(initial.messages.reduce((max, item) => Math.max(max, item.key), 0) + 1);

  const addTranscript = useCallback((text: string) => {
    setInput((current) => current + (current && !/\s$/.test(current) ? ' ' : '') + text);
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!chatKey) return;
    try {
      window.sessionStorage.setItem(chatKey, JSON.stringify({ threadId, messages }));
    } catch {
      // 저장 공간을 쓸 수 없어도 대화는 계속한다.
    }
  }, [chatKey, threadId, messages]);
  useEffect(() => {
    const box = scrollRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [messages, sending, open]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy || Array.from(message).length > MESSAGE_LIMIT) return;
    setInput('');
    setSending(true);
    const title = (messages.find((item) => item.role === 'USER')?.text ?? message).slice(0, 80);
    setMessages((current) => [
      ...current,
      { key: nextKey.current++, role: 'USER', text: message, cards: [], options: [], notices: [] },
    ]);
    try {
      const reply = await sendChat(threadId, message);
      const extras = shown(reply);
      // 제안은 카드로 보여주므로 답 글의 번호 목록은 뺀다.
      const replyText =
        reply.status === 'IDEAS'
          ? reply.reply
              .split('\n')
              .filter((line) => !/^\d+\.\s/.test(line))
              .join('\n')
          : reply.reply;
      setThreadId(reply.threadId);
      setMessages((current) => [
        ...current,
        {
          key: nextKey.current++,
          role: 'ASSISTANT',
          text: replyText,
          notices: reply.notices,
          ...extras,
        },
      ]);
      if (reply.status === 'SAVED' && reply.experiment) onSaved(reply.experiment);
      // 대화 내역에 남긴다. 저장에 실패해도 대화는 이어간다.
      saveChatExchange(reply.threadId, {
        title,
        experimentId: reply.experiment?.id ?? null,
        messages: [
          { role: 'USER', content: message, payload: null },
          {
            role: 'ASSISTANT',
            content: [replyText, ...reply.notices].filter(Boolean).join('\n'),
            payload:
              extras.cards.length || extras.options.length
                ? { cards: extras.cards, options: extras.options }
                : null,
          },
        ],
      }).catch(() => undefined);
    } catch (reason) {
      setMessages((current) => [
        ...current,
        {
          key: nextKey.current++,
          role: 'ASSISTANT',
          text:
            reason instanceof ApiError
              ? reason.message
              : '지금은 답하기 어려워요. 잠시 뒤 다시 말씀해 주세요.',
          cards: [],
          options: [],
          notices: [],
          failed: true,
        },
      ]);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void send(input);
  }
  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // 한글 조합 중의 Enter는 글자를 확정하는 키다. 조합이 끝난 Enter만 보낸다.
    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing &&
      event.nativeEvent.keyCode !== 229
    ) {
      event.preventDefault();
      void send(input);
    }
  }
  function startOver() {
    setThreadId(null);
    setMessages([]);
    inputRef.current?.focus();
  }

  const last = messages.length - 1;
  return (
    <aside className="chat-panel" aria-label="AI 비서와 대화" hidden={!open}>
      <header className="chat-panel-head">
        <a className="icon-button" href="#/chats" aria-label="지난 대화 보기" onClick={onNavigate}>
          <Icon name="menu" size={20} />
        </a>
        <h2>대화</h2>
        <button type="button" className="chat-collapse" onClick={onClose}>
          작게보기
          <Icon name="collapse" size={14} />
        </button>
      </header>
      <div className="chat-scroll" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="chat-row chat-assistant">
            <span className="chat-avatar" aria-hidden="true">
              <Icon name="spark" size={16} />
            </span>
            <div className="chat-body">
              <p className="chat-text">
                가게에서 바꾼 일이나 요즘 고민을 말씀해 주세요. 기록으로 남기고, 해볼 만한 일도
                찾아드려요.
              </p>
              <div className="chat-options">
                {EXAMPLES.map((example) => (
                  <button
                    type="button"
                    className="chat-chip"
                    key={example}
                    disabled={busy}
                    onClick={() => void send(example)}
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <ol className="chat-log" role="log" aria-live="polite" aria-label="대화 내용">
            {messages.map((message, index) => {
              const mine = message.role === 'USER';
              const live = index === last && !busy;
              return (
                <li
                  className={`chat-row ${mine ? 'chat-user' : 'chat-assistant'}`}
                  key={message.key}
                >
                  {!mine && (
                    <span className="chat-avatar" aria-hidden="true">
                      <Icon name="spark" size={16} />
                    </span>
                  )}
                  <div className="chat-body">
                    <span className="chat-sr">{mine ? '사장님' : '트라이로그'}</span>
                    {message.text && (
                      <p className={`chat-text ${message.failed ? 'chat-failed' : ''}`}>
                        {message.text}
                      </p>
                    )}
                    {message.notices.map((notice, noticeIndex) => (
                      <p className="chat-notice" key={noticeIndex}>
                        {notice}
                      </p>
                    ))}
                    {message.cards.length > 0 && (
                      <div className={`chat-cards ${message.pick ? 'chat-pick' : ''}`}>
                        {message.cards.map((card, cardIndex) => {
                          const body = (
                            <>
                              {card.category && (
                                <span className={`tag chat-tag-${card.category.toLowerCase()}`}>
                                  {categories[card.category as Category] ?? card.category}
                                </span>
                              )}
                              <strong>{card.title}</strong>
                              {card.summary && <p>{card.summary}</p>}
                              {card.meta && <small>{card.meta}</small>}
                            </>
                          );
                          return message.pick ? (
                            <button
                              type="button"
                              className="chat-card"
                              key={cardIndex}
                              disabled={!live}
                              onClick={() => void send(`${cardIndex + 1}번 해볼게요`)}
                            >
                              {body}
                            </button>
                          ) : (
                            <div className="chat-card" key={cardIndex}>
                              {body}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {message.experimentId && (
                      <a
                        className="text-action"
                        href={`#/experiments/${encodeURIComponent(message.experimentId)}`}
                        onClick={onNavigate}
                      >
                        저장한 기록 보기
                      </a>
                    )}
                    {message.options.length > 0 && (
                      <div className="chat-options">
                        {message.options.map((option) => (
                          <button
                            type="button"
                            className="chat-chip"
                            key={option}
                            disabled={!live}
                            onClick={() => void send(option)}
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        {sending && (
          <p className="chat-typing" role="status">
            답을 준비하고 있어요…
          </p>
        )}
      </div>
      <form className="chat-input" onSubmit={submit}>
        <label className="chat-sr" htmlFor="chat-message">
          AI 비서에게 보낼 말
        </label>
        <textarea
          id="chat-message"
          ref={inputRef}
          rows={2}
          maxLength={input.length > MESSAGE_LIMIT ? undefined : MESSAGE_LIMIT}
          aria-invalid={draftLength > MESSAGE_LIMIT || undefined}
          aria-describedby={draftLength > MESSAGE_LIMIT ? 'chat-message-limit' : undefined}
          placeholder="이어서 이야기해 주세요."
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={keyDown}
        />
        {draftLength > MESSAGE_LIMIT && (
          <p className="chat-notice" role="status" id="chat-message-limit">
            현재 {draftLength}자예요. 보낼 내용을 {MESSAGE_LIMIT}자 이내로 줄여 주세요.
          </p>
        )}
        <div className="chat-input-tools">
          {messages.length > 0 ? (
            <button type="button" className="chat-reset" onClick={startOver} disabled={busy}>
              <Icon name="plus" size={16} />새 대화
            </button>
          ) : (
            <span />
          )}
          {open && (
            <VoiceInput
              disabled={sending}
              onTranscript={addTranscript}
              onBusyChange={setVoiceBusy}
            />
          )}
          <button
            type="submit"
            className="chat-round chat-send"
            disabled={busy || !draftLength || draftLength > MESSAGE_LIMIT}
            aria-label="보내기"
          >
            <Icon name="send" size={18} />
          </button>
        </div>
      </form>
    </aside>
  );
}
