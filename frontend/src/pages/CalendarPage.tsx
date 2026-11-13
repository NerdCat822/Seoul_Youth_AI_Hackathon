import { useState } from 'react';
import type { Experiment } from '../types';
import { asDate, formatDate, formatMonth, shiftMonth } from '../lib/dates';
import { PageHeading } from '../components/PageHeading';
import { Icon } from '../components/Icon';

export function CalendarPage({ today, experiments }: { today: string; experiments: Experiment[] }) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState(today);
  const firstDay = asDate(`${month}-01`).getUTCDay();
  const count = new Date(
    Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0),
  ).getUTCDate();
  const events = experiments.flatMap((item) => [
    { date: item.startDate, kind: 'start', label: '시도 시작', experiment: item },
    { date: item.checkDate, kind: 'check', label: '결과 확인', experiment: item },
  ]);
  const agenda = events.filter((event) => event.date === selected);
  function moveMonth(delta: number) {
    const next = shiftMonth(month, delta);
    setMonth(next);
    setSelected(`${next}-01`);
  }
  return (
    <>
      <PageHeading eyebrow="잊지 않도록 한곳에" title="우리 가게 달력">
        시작한 날과 다시 살펴볼 날을 확인해요.
      </PageHeading>
      <div className="calendar-panel">
        <div className="month-header">
          <h2>{formatMonth(month)}</h2>
          <button
            className="today-button"
            onClick={() => {
              setMonth(today.slice(0, 7));
              setSelected(today);
            }}
          >
            오늘
          </button>
          <button
            className="icon-button"
            aria-label="이전 달"
            disabled={month <= '2000-01'}
            onClick={() => moveMonth(-1)}
          >
            <Icon name="back" size={20} />
          </button>
          <button
            className="icon-button"
            aria-label="다음 달"
            disabled={month >= '2101-01'}
            onClick={() => moveMonth(1)}
          >
            <Icon name="arrow" size={20} />
          </button>
        </div>
        <div className="calendar-grid">
          {['일', '월', '화', '수', '목', '금', '토'].map((day, index) => (
            <span className={`weekday ${index === 0 ? 'sunday' : ''}`} key={day}>
              {day}
            </span>
          ))}
          {Array.from({ length: firstDay }, (_, index) => (
            <span key={`empty-${index}`} />
          ))}
          {Array.from({ length: count }, (_, index) => {
            const day = `${month}-${String(index + 1).padStart(2, '0')}`;
            const dayEvents = events.filter((event) => event.date === day);
            return (
              <button
                key={day}
                className={`calendar-day ${day === today ? 'is-today' : ''}`}
                aria-pressed={selected === day}
                aria-label={`${formatDate(day, true)}${day === today ? ', 오늘' : ''}${dayEvents.length ? `, 일정 ${dayEvents.length}개` : ''}`}
                onClick={() => setSelected(day)}
              >
                <span>{index + 1}</span>
                <span className="calendar-dots" aria-hidden="true">
                  {dayEvents.some((event) => event.kind === 'start') && (
                    <i className="event-start" />
                  )}
                  {dayEvents.some((event) => event.kind === 'check') && (
                    <i className="event-check" />
                  )}
                </span>
              </button>
            );
          })}
        </div>
        <div className="calendar-legend">
          <span>
            <i className="event-start" />
            시도 시작
          </span>
          <span>
            <i className="event-check" />
            결과 확인
          </span>
        </div>
      </div>
      <section className="agenda" aria-live="polite">
        <div className="section-title">
          <h2>{formatDate(selected, true)}</h2>
          <span>{agenda.length}개의 일정</span>
        </div>
        {agenda.length ? (
          agenda.map((event) => (
            <a
              className="agenda-item"
              href={`#/experiments/${encodeURIComponent(event.experiment.id)}`}
              key={`${event.kind}-${event.experiment.id}`}
            >
              <div>
                <span className={`event-label event-label-${event.kind}`}>{event.label}</span>
                <h3>{event.experiment.title}</h3>
              </div>
              <Icon name="arrow" size={18} />
            </a>
          ))
        ) : (
          <div className="agenda-empty">
            <Icon name="calendar" size={27} />
            <p>이날은 등록된 일정이 없어요.</p>
          </div>
        )}
      </section>
      <a className="button secondary" href="#/new">
        <Icon name="plus" size={18} /> 새로운 시도 남기기
      </a>
    </>
  );
}
