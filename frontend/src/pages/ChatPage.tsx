import { Fragment } from 'react';
import { Icon } from '../components/Icon';
import { PageHeading } from '../components/PageHeading';
import { categories } from '../lib/labels';
import { useQuery } from '../lib/useQuery';
import type { Category, ChatCard, ChatConversation, ChatSession, NeighborhoodCase } from '../types';
import './chat.css';

// 대화 시각은 서버가 UTC로 내려준다. 가게 기준인 서울 시간으로 보여준다.
const day = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  month: 'long',
  day: 'numeric',
  weekday: 'short',
});
const time = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  hour: 'numeric',
  minute: '2-digit',
});

// payload는 형식이 자유로운 JSON이다. 화면에 그릴 수 있는 선택지와 제안 카드만 골라낸다.
function extras(payload: unknown): { options: string[]; cards: ChatCard[] } {
  const value = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const text = (item: unknown) => (typeof item === 'string' ? item : '');
  const options = Array.isArray(value.options) ? value.options.map(text).filter(Boolean) : [];
  const cards = (Array.isArray(value.cards) ? value.cards : [])
    .filter((card): card is Record<string, unknown> => !!card && typeof card === 'object')
    .map((card) => ({
      caseId: text(card.caseId),
      category: text(card.category),
      title: text(card.title),
      summary: text(card.summary),
      meta: text(card.meta),
    }))
    .filter((card) => card.title);
  return { options, cards };
}

function LoadError({ message, retry }: { message: string; retry: () => void }) {
  return (
    <section className="card" role="alert">
      <h2>대화 내역을 열지 못했어요</h2>
      <p>{message}</p>
      <button className="button" onClick={retry}>
        다시 불러오기
      </button>
    </section>
  );
}

export function ChatListPage() {
  const { data: sessions, error, retry } = useQuery<ChatSession[]>('/chats');
  return (
    <div className="chat-page">
      <PageHeading title="내 기록">AI 비서와 나눈 대화를 다시 볼 수 있어요.</PageHeading>
      <div className="view-tabs">
        <a href="#/records">내 가게</a>
        <a href="#/calendar">달력으로 보기</a>
        <a href="#/chats" aria-current="page">
          대화 내역
        </a>
      </div>
      {error ? (
        <LoadError message={error} retry={retry} />
      ) : !sessions ? (
        <p role="status">대화 내역을 불러오고 있어요…</p>
      ) : sessions.length === 0 ? (
        <section className="empty-state">
          <div className="empty-icon">
            <Icon name="chat" size={30} />
          </div>
          <h2>아직 저장된 대화가 없어요</h2>
          <p>AI 비서와 대화를 나누면 여기에 차례로 쌓여요.</p>
        </section>
      ) : (
        <>
          <div className="section-title">
            <h2>지난 대화</h2>
            <span>{sessions.length}개</span>
          </div>
          <div className="experiment-list">
            {sessions.map((session) => (
              <a
                className="experiment-card"
                key={session.id}
                href={`#/chats/${encodeURIComponent(session.id)}`}
              >
                <div className="record-icon">
                  <Icon name="chat" />
                </div>
                <div className="card-copy">
                  <h3>{session.title || '제목 없는 대화'}</h3>
                  {session.preview && <p className="chat-preview">{session.preview}</p>}
                  <p>
                    {day.format(new Date(session.lastMessageAt))} · 메시지 {session.messageCount}개
                  </p>
                </div>
                <Icon name="arrow" size={17} />
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function ChatDetailPage({ id, cases }: { id: string; cases: NeighborhoodCase[] }) {
  const { data, error, retry } = useQuery<ChatConversation>(`/chats/${encodeURIComponent(id)}`);
  if (error)
    return (
      <div className="chat-page">
        <LoadError message={error} retry={retry} />
        <a className="text-action" href="#/chats">
          대화 내역으로 돌아가기
        </a>
      </div>
    );
  if (!data) return <p role="status">대화를 불러오고 있어요…</p>;
  const { session, messages } = data;
  return (
    <div className="chat-page">
      <PageHeading eyebrow="대화 내역" title={session.title || '제목 없는 대화'}>
        {day.format(new Date(session.createdAt))} · 메시지 {session.messageCount}개
      </PageHeading>
      {session.experimentId && (
        <a
          className="chat-related"
          href={`#/experiments/${encodeURIComponent(session.experimentId)}`}
        >
          <span>
            <small>이 대화에서 다룬 시도</small>
            <strong>{session.experimentTitle ?? '시도 보기'}</strong>
          </span>
          <Icon name="arrow" size={17} />
        </a>
      )}
      {messages.length === 0 ? (
        <p className="small-note">이 대화에는 저장된 메시지가 없어요.</p>
      ) : (
        <ol className="chat-log" aria-label="대화 내용">
          {messages.map((message, index) => {
            const at = new Date(message.createdAt);
            const dayLabel = day.format(at);
            const previous = messages[index - 1];
            const newDay = !previous || day.format(new Date(previous.createdAt)) !== dayLabel;
            const mine = message.role === 'USER';
            const { options, cards } = extras(message.payload);
            return (
              <Fragment key={message.id}>
                {newDay && (
                  <li className="chat-day">
                    <span>{dayLabel}</span>
                  </li>
                )}
                <li className={`chat-row ${mine ? 'chat-user' : 'chat-assistant'}`}>
                  {!mine && (
                    <span className="chat-avatar" aria-hidden="true">
                      <Icon name="spark" size={16} />
                    </span>
                  )}
                  <div className="chat-body">
                    <span className="chat-sr">{mine ? '사장님' : '트라이로그'}</span>
                    {message.content && <p className="chat-text">{message.content}</p>}
                    {cards.length > 0 && (
                      <div className="chat-cards">
                        {cards.map((card, cardIndex) => {
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
                          return cases.some((item) => item.id === card.caseId) ? (
                            <a
                              className="chat-card"
                              key={cardIndex}
                              href={`#/cases/${encodeURIComponent(card.caseId)}`}
                            >
                              {body}
                            </a>
                          ) : (
                            <div className="chat-card" key={cardIndex}>
                              {body}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {options.length > 0 && (
                      <ul className="chat-options" aria-label="이때 보여드린 선택지">
                        {options.map((option, optionIndex) => (
                          <li key={optionIndex}>{option}</li>
                        ))}
                      </ul>
                    )}
                    <time dateTime={message.createdAt}>{time.format(at)}</time>
                  </div>
                </li>
              </Fragment>
            );
          })}
        </ol>
      )}
      <p className="small-note">
        저장된 대화를 다시 보는 화면이에요. 여기서 대화를 이어갈 수는 없어요.
      </p>
    </div>
  );
}
