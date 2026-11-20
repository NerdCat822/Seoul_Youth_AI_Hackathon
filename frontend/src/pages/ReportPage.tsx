import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, compareSales, getReport } from '../api';
import { PageHeading } from '../components/PageHeading';
import { addDays } from '../lib/dates';
import type { Experiment, SalesReport } from '../types';

const integer = new Intl.NumberFormat('ko-KR');
const percent = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 });

export function UploadPage({
  experiment,
  onCompared,
}: {
  experiment: Experiment;
  onCompared: (id: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [menu, setMenu] = useState('');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const path = `/experiments/${encodeURIComponent(experiment.id)}`;
  const end = [experiment.endDate, addDays(experiment.startDate, 13)].sort()[0];

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    const issues: Record<string, string> = {};
    if (!file) issues.file = '비교할 파일을 선택해주세요.';
    else if (!/\.(csv|xlsx)$/i.test(file.name) || file.size > 5 * 1024 * 1024)
      issues.file = '5MB 이하의 CSV 또는 XLSX 파일을 선택해주세요.';
    if (!menu.trim()) issues.targetMenuCode = '메뉴 코드를 입력해주세요.';
    setErrors(issues);
    setMessage('');
    if (!file || Object.keys(issues).length) return;
    pending.current = true;
    setBusy(true);
    try {
      await compareSales(experiment.id, file, menu.trim());
      onCompared(experiment.id);
      if (window.location.hash === `#${path}/upload`) window.location.hash = `${path}/report`;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '비교하지 못했어요. 다시 시도해주세요.');
      if (error instanceof ApiError) setErrors(error.fieldErrors);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading eyebrow={experiment.title} title="판매 자료 올리기">
        같은 요일의 판매 자료를 비교해 메뉴가 얼마나 자주 선택됐는지 확인해요.
      </PageHeading>
      <section className="card">
        <h2>비교할 기간</h2>
        <dl className="metadata">
          <div>
            <dt>변경 전</dt>
            <dd>
              {addDays(experiment.startDate, -14)} ~ {addDays(end, -14)}
            </dd>
          </div>
          <div>
            <dt>변경 후</dt>
            <dd>
              {experiment.startDate} ~ {end}
            </dd>
          </div>
        </dl>
        <p>
          한 가게의 두 기간을 같은 파일에 담아주세요. 변경 후 최대 14일과 그보다 2주 앞선 기간을
          비교해요.
        </p>
      </section>
      <form onSubmit={submit} className="card upload-form" noValidate>
        <h2>파일과 비교할 메뉴 확인</h2>
        <div className="form-field">
          <label htmlFor="pos-file">
            판매 자료 <span>UTF-8 CSV 또는 단일 시트 XLSX · 최대 5MB</span>
          </label>
          <input
            id="pos-file"
            type="file"
            accept=".csv,.xlsx"
            disabled={busy}
            aria-invalid={!!errors.file}
            aria-describedby={errors.file ? 'file-error' : undefined}
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setErrors({});
              setMessage('');
            }}
          />
          {errors.file && (
            <span role="alert" id="file-error" className="field-error">
              {errors.file}
            </span>
          )}
        </div>
        <div className="form-field">
          <label htmlFor="target-menu">메뉴 코드</label>
          <input
            id="target-menu"
            value={menu}
            disabled={busy}
            onChange={(event) => {
              setMenu(event.target.value);
              setErrors((current) => ({ ...current, targetMenuCode: '' }));
            }}
            placeholder="판매 자료의 menu2_cd 값"
            aria-invalid={!!errors.targetMenuCode}
            aria-describedby={errors.targetMenuCode ? 'menu-error' : undefined}
          />
          {errors.targetMenuCode && (
            <span role="alert" id="menu-error" className="field-error">
              {errors.targetMenuCode}
            </span>
          )}
        </div>
        <details className="file-format">
          <summary>파일에 필요한 열 보기</summary>
          <p>
            <code>base_date, receipt_id, store_id, menu2_cd, price, quantity, is_refunded</code>
          </p>
          <p>
            영업일, 영수증, 가게, 메뉴 코드, 단가, 수량, 환불 여부 순으로 예시 파일에서 형식을
            확인할 수 있어요.
          </p>
        </details>
        {message && (
          <p className="form-error" role="alert">
            {message}
          </p>
        )}
        {errors.checkDate && (
          <p className="field-error" role="alert">
            {errors.checkDate}
          </p>
        )}
        <button className="button" type="submit" disabled={busy}>
          {busy ? '주문을 비교하고 있어요…' : '비교하고 결과 저장'}
        </button>
      </form>
      <aside className="tip-card">
        <h2>자료 없이 먼저 해보려면</h2>
        <p>
          이 기록의 날짜에 맞춘 가상 주문 파일을 내려받아 위에서 선택하세요. 메뉴 코드에는{' '}
          <strong>MENU01</strong>을 입력하면 돼요.
        </p>
        <a className="text-action" href={`/api/v1${path}/sample.csv`} download>
          예시 CSV 내려받기 ↓
        </a>
        {experiment.startDate === '2026-11-07' && end === '2026-11-20' && (
          <p>
            이 기간에는 표본 가게 파일도 사용할 수 있어요. 메뉴 코드는 <strong>A011003</strong>
            이에요.{' '}
            <a className="text-action" href="/examples/store1-pos.csv" download>
              표본 가게 CSV 내려받기 ↓
            </a>
          </p>
        )}
      </aside>
    </>
  );
}

export function ReportPage({ experiment }: { experiment: Experiment }) {
  const [report, setReport] = useState<SalesReport | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    getReport(experiment.id, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setReport(data);
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : '결과를 불러오지 못했어요.');
      });
    return () => controller.abort();
  }, [experiment.id, attempt]);
  if (error)
    return (
      <section className="connection-state" role="alert">
        <h1>결과를 열지 못했어요</h1>
        <p>{error}</p>
        <button className="button" onClick={() => setAttempt((value) => value + 1)}>
          다시 불러오기
        </button>
      </section>
    );
  if (!report)
    return (
      <p className="connection-state" role="status">
        저장된 결과를 불러오고 있어요…
      </p>
    );
  const { before, after } = report;
  return (
    <>
      <PageHeading eyebrow={experiment.title} title="시도 결과">
        비교 메뉴 {report.targetMenuCode} · 판매 자료 기준
      </PageHeading>
      <section className="report-summary">
        <span>전체 주문 중 이 메뉴의 비중 변화</span>
        <strong>
          {report.shareDeltaPp > 0 ? '+' : ''}
          {percent.format(report.shareDeltaPp)}%p
        </strong>
        <p>{report.summary}</p>
      </section>
      <section className="card">
        <h2>변경 전후 비교</h2>
        <div className="share-bars">
          {(
            [
              ['변경 전', before],
              ['변경 후', after],
            ] as const
          ).map(([label, period]) => (
            <div key={label}>
              <span>{label}</span>
              <div className="share-track">
                <i style={{ width: `${period.sharePct}%` }} />
              </div>
              <b>{percent.format(period.sharePct)}%</b>
            </div>
          ))}
        </div>
        <table className="metrics-table">
          <thead>
            <tr>
              <th scope="col">항목</th>
              <th scope="col">변경 전</th>
              <th scope="col">변경 후</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">대상 메뉴 주문</th>
              <td>{integer.format(before.targetOrders)}건</td>
              <td>{integer.format(after.targetOrders)}건</td>
            </tr>
            <tr>
              <th scope="row">전체 주문</th>
              <td>{integer.format(before.totalOrders)}건</td>
              <td>{integer.format(after.totalOrders)}건</td>
            </tr>
            <tr>
              <th scope="row">매출</th>
              <td>{integer.format(before.sales)}원</td>
              <td>{integer.format(after.sales)}원</td>
            </tr>
          </tbody>
        </table>
      </section>
      <section className="card">
        <h2>비교 기준</h2>
        <dl className="metadata">
          <div>
            <dt>변경 전</dt>
            <dd>
              {before.startDate} ~ {before.endDate}
            </dd>
          </div>
          <div>
            <dt>변경 후</dt>
            <dd>
              {after.startDate} ~ {after.endDate}
            </dd>
          </div>
          <div>
            <dt>제외한 환불 행</dt>
            <dd>{report.excludedRefundLines}개</dd>
          </div>
        </dl>
        <p>
          대상 메뉴가 포함된 영수증을 한 건으로 셌어요. 날씨와 행사처럼 함께 달라진 요인도 있어
          시도의 효과를 단정하기는 어려워요.
        </p>
      </section>
      <div className="result-actions">
        <a className="button" href={`#/new?from=${encodeURIComponent(experiment.id)}`}>
          다음 시도 남기기
        </a>
        <a className="button secondary" href={`#/experiments/${experiment.id}/upload`}>
          자료 다시 올리기
        </a>
      </div>
      <a className="text-action" href="#/forecast">
        표본 가게의 실제·예상 매출 보기
      </a>
    </>
  );
}
