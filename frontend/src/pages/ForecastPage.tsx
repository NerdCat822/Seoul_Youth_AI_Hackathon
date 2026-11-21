import { useState } from 'react';
import { PageHeading } from '../components/PageHeading';
import { asDate, formatDate } from '../lib/dates';
import { useQuery } from '../lib/useQuery';
import './forecast.css';

export interface Forecast {
  status: 'READY' | 'INSUFFICIENT_DATA';
  storeName: string;
  source: 'DATABASE_PREDICTIONS' | 'DB_HISTORY';
  dataThrough: string | null;
  model: string | null;
  rangeMethod: string | null;
  missingDates: string[];
  candidate: {
    model: string;
    mae: number | null;
    wape: number | null;
    errorRadius: number;
    days: { date: string; expected: number }[];
  } | null;
  historical: {
    startDate: string;
    endDate: string;
    actual: number;
    expected: number;
    difference: number;
  } | null;
  validation: {
    startDate: string;
    endDate: string;
    days: number;
    mae: number | null;
    wape: number | null;
    baselineMae: number | null;
    baselineWape: number | null;
  } | null;
  days: { date: string; expected: number; lower: number | null; upper: number | null }[];
}

const won = (amount: number) => amount.toLocaleString('ko-KR') + '원';
const weekday = new Intl.DateTimeFormat('ko-KR', { weekday: 'short', timeZone: 'UTC' });

export function ForecastPage() {
  const { data, error, retry } = useQuery<Forecast>('/demo/forecast');
  const [selected, setSelected] = useState(0);
  const [useCandidate, setUseCandidate] = useState(false);
  if (error)
    return (
      <section className="card" role="alert">
        <h1>전망을 불러오지 못했어요</h1>
        <p>{error}</p>
        <button className="button" onClick={retry}>
          다시 불러오기
        </button>
      </section>
    );
  if (!data) return <p role="status">예상 매출을 불러오고 있어요…</p>;
  const { candidate, validation, historical } = data;
  const source = data.source === 'DB_HISTORY' ? '가게 일매출 이력' : '가게의 저장된 예측';
  const days =
    useCandidate && candidate
      ? candidate.days.map(({ date, expected }) => ({
          date,
          expected,
          lower: Math.max(0, expected - candidate.errorRadius),
          upper: expected + candidate.errorRadius,
        }))
      : data.days;
  const day = days[selected];
  const peak = Math.max(...days.map((item) => item.upper ?? item.expected), 1);
  return (
    <div className="forecast-page">
      <PageHeading title="7일 예상 매출">
        {data.storeName} · {source}
        {data.dataThrough && ` · ${data.dataThrough} 영업 마감 기준`}
      </PageHeading>
      {data.status === 'INSUFFICIENT_DATA' || !day ? (
        <section className="card">
          <h2>전망에 필요한 일매출이 부족해요</h2>
          <p>
            {data.dataThrough
              ? '다음 7일을 계산하려면 각 날짜의 7·14·21·28일 전 매출이 필요해요.'
              : '조회할 수 있는 영업일 매출이 아직 없어요.'}
          </p>
          {!!data.missingDates.length && <p>필요한 날짜 · {data.missingDates.join(', ')}</p>}
        </section>
      ) : (
        <>
          <section className="card forecast-panel">
            <h2>{formatDate(days[0].date)}부터 한 주간</h2>
            {candidate ? (
              <label className="forecast-method">
                예측 방법
                <select
                  value={useCandidate ? 'candidate' : 'primary'}
                  onChange={(e) => setUseCandidate(e.target.value === 'candidate')}
                >
                  <option value="primary">{data.model}</option>
                  <option value="candidate">{candidate.model}</option>
                </select>
              </label>
            ) : (
              <p>{data.model}</p>
            )}
            <p className="forecast-total">
              {won(days.reduce((total, item) => total + item.expected, 0))}
            </p>
            <p>요일을 선택하면 그날의 예상 매출을 볼 수 있어요.</p>
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
              {day.lower != null && day.upper != null && (
                <span>
                  참고 범위 {won(day.lower)} ~ {won(day.upper)}
                </span>
              )}
            </div>
            {data.rangeMethod && <p className="small-note">{data.rangeMethod}</p>}
          </section>
          {historical && (
            <section className="card forecast-panel">
              <h2>지난 시도 기간의 매출</h2>
              <p>
                {historical.startDate} ~ {historical.endDate}
              </p>
              <dl className="metadata">
                <div>
                  <dt>시도 시작 전 예상</dt>
                  <dd>{won(historical.expected)}</dd>
                </div>
                <div>
                  <dt>기간 중 실제 매출</dt>
                  <dd>{won(historical.actual)}</dd>
                </div>
                <div>
                  <dt>예상과의 차이</dt>
                  <dd>
                    {historical.difference > 0 ? '+' : ''}
                    {won(historical.difference)}
                  </dd>
                </div>
              </dl>
              <p className="small-note">시작 전 4주간 같은 요일의 매출로 계산한 예상값이에요.</p>
            </section>
          )}
          {validation && (
            <section className="card forecast-panel">
              <h2>예측 오차</h2>
              <p>
                {validation.startDate} ~ {validation.endDate} · {validation.days}일 검증
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
                  {[
                    { model: data.model, mae: validation.mae, wape: validation.wape },
                    ...(candidate ? [candidate] : []),
                    {
                      model: '직전 주 같은 요일',
                      mae: validation.baselineMae,
                      wape: validation.baselineWape,
                    },
                  ].map((row) => (
                    <tr key={row.model}>
                      <th scope="row">{row.model}</th>
                      <td>{row.mae != null ? won(row.mae) : '미확인'}</td>
                      <td>{row.wape != null ? row.wape + '%' : '미확인'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}
      <a className="button secondary" href="#/">
        홈으로 돌아가기
      </a>
    </div>
  );
}
