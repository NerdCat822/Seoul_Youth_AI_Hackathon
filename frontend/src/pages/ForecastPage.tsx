import { useEffect, useState } from 'react';
import { request } from '../api';
import { PageHeading } from '../components/PageHeading';
import { asDate, formatDate } from '../lib/dates';
import './forecast.css';

interface Forecast {
  storeName: string;
  source: string;
  dataThrough: string;
  model: string;
  rangeMethod: string;
  candidate: {
    model: string;
    mae: number;
    wape: number;
    errorRadius: number;
    days: { date: string; expected: number }[];
  };
  historical: {
    startDate: string;
    endDate: string;
    actual: number;
    expected: number;
    difference: number;
  };
  validation: {
    startDate: string;
    endDate: string;
    days: number;
    mae: number;
    wape: number;
    baselineMae: number;
    baselineWape: number;
  };
  days: { date: string; expected: number; lower: number; upper: number }[];
}

const won = (amount: number) => amount.toLocaleString('ko-KR') + '원';
const weekday = new Intl.DateTimeFormat('ko-KR', { weekday: 'short', timeZone: 'UTC' });

export function ForecastPage() {
  const [data, setData] = useState<Forecast | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState(0);
  const [method, setMethod] = useState<'ml' | 'weekday'>('ml');
  useEffect(() => {
    const controller = new AbortController();
    request<Forecast>('/demo/forecast', { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((reason: Error) => {
        if (!controller.signal.aborted) setError(reason.message);
      });
    return () => controller.abort();
  }, [attempt]);

  if (error) {
    return (
      <section className="card" role="alert">
        <h1>전망을 불러오지 못했어요</h1>
        <p>{error}</p>
        <button
          className="button"
          onClick={() => {
            setError('');
            setAttempt(attempt + 1);
          }}
        >
          다시 불러오기
        </button>
      </section>
    );
  }
  if (!data) return <p role="status">예상 매출을 불러오고 있어요…</p>;
  const days =
    method === 'ml'
      ? data.candidate.days.map(({ date, expected }) => ({
          date,
          expected,
          lower: Math.max(0, expected - data.candidate.errorRadius),
          upper: expected + data.candidate.errorRadius,
        }))
      : data.days;
  const day = days[selected];
  const validation = data.validation;
  const peak = Math.max(...days.map((item) => item.upper), 1);
  return (
    <div className="forecast-page">
      <PageHeading title="7일 예상 매출">
        {data.storeName} 시연 자료 · {data.dataThrough} 영업 마감 기준
      </PageHeading>
      <section className="card forecast-panel">
        <h2>{formatDate(days[0].date)}부터 한 주간</h2>
        <label className="forecast-method">
          예측 방법
          <select
            value={method}
            onChange={(event) => setMethod(event.target.value === 'ml' ? 'ml' : 'weekday')}
          >
            <option value="ml">{data.candidate.model}</option>
            <option value="weekday">{data.model}</option>
          </select>
        </label>
        <p className="forecast-total">
          {won(days.reduce((total, item) => total + item.expected, 0))}
        </p>
        <p>요일을 선택하면 그날의 예상 매출과 범위를 볼 수 있어요.</p>
        <div className="forecast-bars" role="group" aria-label="날짜별 예상 매출">
          {days.map((item, index) => (
            <button
              type="button"
              key={item.date}
              aria-pressed={selected === index}
              aria-label={formatDate(item.date, true) + ' 예상 ' + won(item.expected)}
              onClick={() => setSelected(index)}
            >
              <span className="forecast-track" aria-hidden="true">
                <span
                  className="forecast-bar"
                  style={{ height: (100 * item.expected) / peak + '%' }}
                />
              </span>
              <span>{weekday.format(asDate(item.date))}</span>
            </button>
          ))}
        </div>
        <div className="forecast-reading" aria-live="polite">
          <strong>
            {formatDate(day.date, true)} 예상 {won(day.expected)}
          </strong>
          <span>
            참고 범위 {won(day.lower)} ~ {won(day.upper)}
          </span>
        </div>
        <p className="small-note">{data.rangeMethod}</p>
      </section>
      <section className="card forecast-panel">
        <h2>추천 표시를 붙인 2주의 매출</h2>
        <p>
          {data.storeName} 시연 사례 · {formatDate(data.historical.startDate)} ~{' '}
          {formatDate(data.historical.endDate)}
        </p>
        <dl className="metadata">
          <div>
            <dt>시도 시작 전 예상</dt>
            <dd>{won(data.historical.expected)}</dd>
          </div>
          <div>
            <dt>기간 중 실제 매출</dt>
            <dd>{won(data.historical.actual)}</dd>
          </div>
          <div>
            <dt>예상과의 차이</dt>
            <dd>
              {data.historical.difference > 0 ? '+' : ''}
              {won(data.historical.difference)}
            </dd>
          </div>
        </dl>
        <p className="small-note">
          시작 전 4주간 같은 요일의 매출로 예상했어요. 이 기간에는 김밥 세트 구성과 돈까스 가격도
          달라졌어요.
        </p>
      </section>
      <section className="card forecast-panel">
        <h2>평소 매출로 얼마나 맞혔나요?</h2>
        <p>
          {formatDate(validation.startDate)}부터 {formatDate(validation.endDate)}까지{' '}
          {validation.days}일 동안, 각 주가 시작되기 전에 구한 예상값을 실제 매출과 비교했어요.
        </p>
        <table className="forecast-validation">
          <thead>
            <tr>
              <th scope="col">계산 방법</th>
              <th scope="col">하루 평균 오차</th>
              <th scope="col">전체 매출 대비 오차</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">{data.model}</th>
              <td>{won(validation.mae)}</td>
              <td>{validation.wape}%</td>
            </tr>
            <tr>
              <th scope="row">{data.candidate.model}</th>
              <td>{won(data.candidate.mae)}</td>
              <td>{data.candidate.wape}%</td>
            </tr>
            <tr>
              <th scope="row">직전 주 같은 요일</th>
              <td>{won(validation.baselineMae)}</td>
              <td>{validation.baselineWape}%</td>
            </tr>
          </tbody>
        </table>
        <p className="small-note">{data.source}</p>
      </section>
      <a className="button secondary" href="#/">
        홈으로 돌아가기
      </a>
    </div>
  );
}
