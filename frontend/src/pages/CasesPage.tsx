import { useState } from 'react';
import type { Category, Difficulty, NeighborhoodCase } from '../types';
import { categories, difficulties } from '../lib/labels';
import { Icon } from '../components/Icon';
import { Illustration } from '../components/Illustration';
import { PageHeading } from '../components/PageHeading';

export function CasesPage({ cases, freeOnly }: { cases: NeighborhoodCase[]; freeOnly: boolean }) {
  const [category, setCategory] = useState<Category | 'ALL'>('ALL');
  const [difficulty, setDifficulty] = useState<Difficulty | 'ALL'>('ALL');
  const filtered = cases.filter(
    (item) =>
      (category === 'ALL' || item.category === category) &&
      (difficulty === 'ALL' || item.difficulty === difficulty) &&
      (!freeOnly || item.cost === 0),
  );
  return (
    <>
      <PageHeading
        eyebrow="작게 바꾸고, 천천히 살펴봐요"
        title={freeOnly ? '0원으로 해볼 일' : '동네 가게의 시도'}
      >
        우리 가게에도 해볼 만한 일을 찾아보세요.
      </PageHeading>
      {!freeOnly && (
        <div className="view-tabs">
          <a href="#/records">내 가게</a>
          <a href="#/cases" aria-current="page">
            동네 가게
          </a>
        </div>
      )}
      <p className="demo-banner">
        <span className="tag">가상 사례</span>실제 동네 가게의 집계가 아닌 시연용 자료예요.
      </p>
      <div className="category-filters" role="group" aria-label="사례 종류">
        <button aria-pressed={category === 'ALL'} onClick={() => setCategory('ALL')}>
          전체
        </button>
        {Object.entries(categories).map(([key, label]) => (
          <button
            key={key}
            aria-pressed={category === key}
            onClick={() => setCategory(key as Category)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="difficulty-filters" role="group" aria-label="준비 정도">
        <button aria-pressed={difficulty === 'ALL'} onClick={() => setDifficulty('ALL')}>
          준비 정도 전체
        </button>
        {Object.entries(difficulties).map(([key, label]) => (
          <button
            key={key}
            aria-pressed={difficulty === key}
            onClick={() => setDifficulty(key as Difficulty)}
          >
            {label}
          </button>
        ))}
      </div>
      <label className="free-filter">
        <input
          type="checkbox"
          checked={freeOnly}
          onChange={(event) => {
            window.location.hash = event.target.checked ? '/cases?free=true' : '/cases';
          }}
        />{' '}
        비용 없이 해볼 일만 보기
      </label>
      <div className="section-title">
        <h2>
          이렇게 해봤어요{' '}
          <span className="result-count" aria-live="polite">
            {filtered.length}
          </span>
        </h2>
      </div>
      {filtered.length ? (
        <div className="case-list">
          {filtered.map((item) => (
            <a className="case-card" href={`#/cases/${encodeURIComponent(item.id)}`} key={item.id}>
              <Illustration kind={item.category} />
              <div className="card-copy">
                <span className="case-category">{categories[item.category]}</span>
                <h3>{item.title}</h3>
                <div className="case-meta">
                  <span className={`effort effort-${item.difficulty.toLowerCase()}`}>
                    {difficulties[item.difficulty]}
                  </span>
                  <span>{item.cost.toLocaleString('ko-KR')}원</span>
                </div>
                <p>가상 가게 {item.sampleSize}곳의 변화 보기</p>
              </div>
              <Icon name="arrow" size={17} />
            </a>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <h2>맞는 사례가 아직 없어요</h2>
          <p>준비 정도나 종류를 바꿔보세요.</p>
          <button
            className="button secondary"
            onClick={() => {
              setCategory('ALL');
              setDifficulty('ALL');
            }}
          >
            필터 초기화
          </button>
        </div>
      )}
    </>
  );
}

export function CaseDetailPage({ item }: { item: NeighborhoodCase }) {
  return (
    <>
      <div className="detail-art">
        <Illustration kind={item.category} />
      </div>
      <PageHeading eyebrow={`${categories[item.category]} · 가상 사례`} title={item.title}>
        {item.summary}
      </PageHeading>
      <section className="card">
        <h2>해보기 전에</h2>
        <dl className="metadata">
          <div>
            <dt>준비 정도</dt>
            <dd>{difficulties[item.difficulty]}</dd>
          </div>
          <div>
            <dt>예상 비용</dt>
            <dd>{item.cost.toLocaleString('ko-KR')}원</dd>
          </div>
          <div>
            <dt>살펴볼 기간</dt>
            <dd>{item.durationDays}일</dd>
          </div>
        </dl>
      </section>
      <section className="card">
        <span className="eyebrow">가상 자료로 보는 변화</span>
        <h2>가게마다 결과는 달랐어요</h2>
        <p>비교한 가게 {item.sampleSize}곳</p>
        <div className="outcome-bar" aria-hidden="true">
          <span style={{ flex: item.improved }} className="up" />
          <span style={{ flex: item.unchanged }} className="same" />
          <span style={{ flex: item.declined }} className="down" />
        </div>
        <div className="outcome-legend">
          <span>
            <i className="up" />
            좋아짐 <b>{item.improved}</b>
          </span>
          <span>
            <i className="same" />
            비슷함 <b>{item.unchanged}</b>
          </span>
          <span>
            <i className="down" />
            낮아짐 <b>{item.declined}</b>
          </span>
        </div>
        <p className="small-note">
          가상 관찰 예시예요. 같은 시도를 해도 우리 가게 결과는 달라질 수 있고, 시도만의 효과를
          뜻하지 않아요.
        </p>
      </section>
      <section className="tip-card">
        <span className="eyebrow">우리 가게에서 해본다면</span>
        <p>{item.tip}</p>
      </section>
      <a className="button" href={`#/new?case=${encodeURIComponent(item.id)}`}>
        이 시도 남기기 <Icon name="plus" size={18} />
      </a>
    </>
  );
}
