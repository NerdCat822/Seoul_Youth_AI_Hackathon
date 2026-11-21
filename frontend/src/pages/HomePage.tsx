import { useState } from 'react';
import type { AppData, NeighborhoodCase } from '../types';
import { Icon } from '../components/Icon';
import { ExperimentList } from '../components/ExperimentList';
import { asDate, formatDate } from '../lib/dates';
import { categories } from '../lib/labels';
import { CalendarPage } from './CalendarPage';
import { useQuery } from '../lib/useQuery';

function WeeklyOutlook() {
  const { data, error } = useQuery<{ status: string; days: { date: string; expected: number }[] }>(
    '/demo/forecast',
  );
  const days = data?.days ?? [];
  const peak = Math.max(1, ...days.map((day) => day.expected));
  return (
    <a className="forecast-entry" href="#/forecast">
      <div className="forecast-symbol">
        <Icon name="chart" />
      </div>
      <div className="outlook-body">
        <strong>7일 예상 매출</strong>
        <p>
          {error
            ? '전망을 불러오지 못했어요. 상세에서 다시 확인해주세요.'
            : !data
              ? '일매출을 확인하고 있어요…'
              : days.length
                ? `${formatDate(days[0].date)} ~ ${formatDate(days[days.length - 1].date)} · 총 ${days.reduce((sum, day) => sum + day.expected, 0).toLocaleString('ko-KR')}원 예상`
                : '전망을 계산할 일매출 이력이 부족해요.'}
        </p>
        {days.length > 0 && (
          <div className="outlook-week" aria-hidden="true">
            {days.map((day) => (
              <div key={day.date}>
                <span>
                  <i style={{ height: `${(day.expected / peak) * 100}%` }} />
                </span>
                <small>
                  {asDate(day.date).toLocaleDateString('ko-KR', {
                    weekday: 'short',
                    timeZone: 'UTC',
                  })}
                </small>
              </div>
            ))}
          </div>
        )}
      </div>
      <Icon name="arrow" size={17} />
    </a>
  );
}

function Ideas({
  title,
  cases,
  free,
}: {
  title: string;
  cases: NeighborhoodCase[];
  free?: boolean;
}) {
  return (
    <section className="home-group">
      <div className="section-title">
        <h2>{title}</h2>
        <a href={free ? '#/cases?free=true' : '#/cases'}>
          모두 보기 <Icon name="arrow" size={14} />
        </a>
      </div>
      <div className="idea-grid">
        {cases.slice(0, 3).map((item) => (
          <a className="idea-tile" key={item.id} href={'#/cases/' + item.id}>
            <div className="idea-meta">
              <span>{categories[item.category]}</span>
              <strong>
                {free ? '0원' : item.difficulty === 'EASY' ? '바로 가능' : item.durationDays + '일'}
              </strong>
            </div>
            <h3>{item.title}</h3>
            <p>{item.summary}</p>
            <span className="idea-next">
              가상 사례 보기 <Icon name="arrow" size={14} />
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}

export function HomePage({ data }: { data: AppData }) {
  const [text, setText] = useState('');
  const ready = data.experiments
    .filter((item) => item.status === 'READY')
    .sort((first, second) => second.checkDate.localeCompare(first.checkDate));
  const ongoing = data.experiments.filter(
    (item) => item.status === 'IN_PROGRESS' || item.status === 'PLANNED',
  );
  const firstVisit = data.experiments.length === 0;
  const free = data.cases.filter((item) => item.cost === 0);
  const easy = data.cases.filter((item) => item.difficulty === 'EASY');
  const freeIdeas = [
    ...free.filter((item) => !easy.includes(item)),
    ...free.filter((item) => easy.includes(item)),
  ];
  return (
    <>
      <header className="home-heading">
        <div>
          {data.overview.upjongNm && (
            <dl className="store-upjong">
              <dt>업종</dt>
              <dd>{data.overview.upjongNm}</dd>
            </dl>
          )}
          <h1>
            {firstVisit
              ? '오늘 바로 해볼 수 있는 일부터 시작해 보세요'
              : data.overview.storeName + ' 사장님, 안녕하세요'}
          </h1>
          <p>
            {firstVisit
              ? '돈 들이지 않고, 지금 가게에서 바로 할 수 있는 방법을 모았어요.'
              : formatDate(data.overview.today, true) +
                ' · 우리 가게의 기록과 확인 일정을 살펴보세요.'}
          </p>
        </div>
        {!firstVisit && (
          <a className="button compact" href="#/new">
            <Icon name="plus" size={16} />새 기록
          </a>
        )}
      </header>
      {firstVisit ? (
        <>
          <aside className="sample-strip">
            <span className="sample-strip-icon">
              <Icon name="note" />
            </span>
            <div>
              <strong>{data.overview.storeName}의 첫 기록을 남겨보세요</strong>
              <p>메뉴나 운영 방식을 바꾼 날짜를 남겨두면 전후 주문을 비교할 수 있어요.</p>
              <a className="text-action" href="#/forecast">
                우리 가게의 7일 매출 전망
              </a>
            </div>
            <a className="button compact secondary" href="#/new">
              첫 기록 남기기
            </a>
          </aside>
          <Ideas title="오늘 바로 시작할 수 있는 일" cases={easy} />
          <Ideas title="0원으로 할 수 있는 일" cases={freeIdeas} free />
        </>
      ) : (
        <>
          {ready.length > 0 && (
            <section className="due-section">
              <div className="section-title">
                <h2>
                  확인할 결과 <span>{ready.length}</span>
                </h2>
                {ready.length > 3 && <a href="#/records">모두 보기</a>}
              </div>
              {ready.slice(0, 3).map((item) => (
                <a key={item.id} href={'#/experiments/' + item.id + '/upload'}>
                  <span>
                    <strong>{item.title}</strong>
                    <small>{formatDate(item.checkDate)} 결과 확인일</small>
                  </span>
                  <b>
                    결과 확인 <Icon name="arrow" size={14} />
                  </b>
                </a>
              ))}
            </section>
          )}
          <WeeklyOutlook />
          <div className="dashboard-grid">
            <section className="card">
              <div className="section-title">
                <h2>진행 중인 기록</h2>
                <a href="#/records">
                  내 기록 <Icon name="arrow" size={14} />
                </a>
              </div>
              {ongoing.length ? (
                <ExperimentList experiments={ongoing.slice(0, 3)} />
              ) : (
                <p>진행 중인 기록이 없어요.</p>
              )}
            </section>
            <section className="card">
              <div className="section-title">
                <h2>결과 확인 일정</h2>
                <a href="#/calendar">
                  달력 보기 <Icon name="arrow" size={14} />
                </a>
              </div>
              <CalendarPage today={data.overview.today} experiments={data.experiments} embedded />
            </section>
          </div>
          <Ideas title="동네 가게 아이디어" cases={easy} />
        </>
      )}
      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          if (text.trim())
            window.location.hash = '/new?' + new URLSearchParams({ text: text.trim() });
        }}
      >
        <label htmlFor="home-idea">우리 가게에서 바꾼 일이 있나요?</label>
        <div>
          <input
            id="home-idea"
            maxLength={500}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="예: 지난 14일간 점심 세트에 추천 표시를 붙였어요"
          />
          <button className="button compact" disabled={!text.trim()}>
            기록 초안 열기
          </button>
        </div>
        <a href="#/new" className="text-action">
          직접 기록하기 <Icon name="arrow" size={12} />
        </a>
      </form>
    </>
  );
}
