import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { API_BASE, ApiError, compareDatabase, compareSales } from '../api';
import { PageHeading } from '../components/PageHeading';
import { addDays } from '../lib/dates';
import { useQuery } from '../lib/useQuery';
import type { Experiment, Menu, SalesReport } from '../types';

const integer = new Intl.NumberFormat('ko-KR');
const percent = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 });

export function UploadPage({
  experiment,
  menus,
  writeEnabled,
  initialMenu,
  initialFile = false,
  onCompared,
}: {
  experiment: Experiment;
  menus: Menu[];
  writeEnabled: boolean;
  initialMenu?: string | null;
  initialFile?: boolean;
  onCompared: (id: string, report: SalesReport) => void;
}) {
  const preferredMenu = initialMenu || experiment.targetMenuCode;
  const [menu, setMenu] = useState(
    menus.some((item) => item.menuCode === preferredMenu) ? preferredMenu! : '',
  );
  const [fileMode, setFileMode] = useState(initialFile);
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const path = `/experiments/${encodeURIComponent(experiment.id)}`;
  const end = [experiment.endDate, addDays(experiment.startDate, 13)].sort()[0];
  const menuQuery = new URLSearchParams({ targetMenuCode: menu });

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    const issues: Record<string, string> = {};
    if (!menu) issues.targetMenuCode = '비교할 메뉴를 선택해주세요.';
    if (fileMode && !file) issues.file = '비교할 파일을 선택해주세요.';
    if (fileMode && file && (!/\.(csv|xlsx)$/i.test(file.name) || file.size > 5 * 1024 * 1024))
      issues.file = '5MB 이하의 CSV 또는 XLSX 파일을 선택해주세요.';
    setErrors(issues);
    setMessage('');
    if (Object.keys(issues).length) return;
    if (!fileMode && !writeEnabled) {
      window.location.hash = `${path}/report?source=db&${menuQuery}`;
      return;
    }
    pending.current = true;
    setBusy(true);
    try {
      const result =
        fileMode && file
          ? await compareSales(experiment.id, file, menu)
          : await compareDatabase(experiment.id, menu);
      if (!active.current) return;
      onCompared(experiment.id, result);
      window.location.hash = result.persisted
        ? path + '/report'
        : `${path}/report?source=${result.source === 'UPLOAD' ? 'upload' : 'db'}&${menuQuery}`;
    } catch (error) {
      if (!active.current) return;
      setMessage(error instanceof Error ? error.message : '비교하지 못했어요. 다시 시도해주세요.');
      if (error instanceof ApiError) setErrors(error.fieldErrors);
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }
  return (
    <>
      <PageHeading eyebrow={experiment.title} title="전후 주문 비교">
        변경 전과 후, 이 메뉴를 고른 주문의 비중을 비교해요.
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
        <p>시작일부터 최대 14일을 2주 앞선 같은 요일과 비교해요.</p>
      </section>
      <form onSubmit={submit} className="card upload-form" noValidate>
        <h2>비교할 주문과 메뉴</h2>
        <fieldset className="source-choice" disabled={busy}>
          <legend>주문 자료</legend>
          {(['db', 'file'] as const).map((source) => (
            <label key={source}>
              <input
                type="radio"
                name="source"
                value={source}
                checked={source === 'file' ? fileMode : !fileMode}
                onChange={() => {
                  setFileMode(source === 'file');
                  setFile(null);
                  setErrors({});
                  setMessage('');
                }}
              />
              {source === 'db' ? '가게에 저장된 POS 주문' : '파일 업로드'}
            </label>
          ))}
        </fieldset>
        <div className="form-field">
          <label htmlFor="target-menu">대상 메뉴</label>
          <select
            id="target-menu"
            required
            disabled={busy || !menus.length}
            value={menu}
            onChange={(event) => {
              setMenu(event.target.value);
              setErrors({});
              setMessage('');
            }}
            aria-invalid={!!errors.targetMenuCode}
            aria-describedby={errors.targetMenuCode ? 'menu-error' : undefined}
          >
            <option value="">
              {menus.length ? '메뉴를 선택해주세요' : '등록된 메뉴가 없어요'}
            </option>
            {menus.map((item) => (
              <option key={item.menuCode} value={item.menuCode}>
                {item.menuName} ({item.menuCode})
              </option>
            ))}
          </select>
          {errors.targetMenuCode && (
            <span id="menu-error" role="alert" className="field-error">
              {errors.targetMenuCode}
            </span>
          )}
        </div>
        {fileMode && (
          <>
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
            <details className="file-format">
              <summary>파일 양식과 예시</summary>
              <p>같은 가게의 두 기간을 한 파일에 담아주세요. 필요한 열은 다음과 같아요.</p>
              <p>
                <code>base_date, receipt_id, store_id, menu2_cd, price, quantity, is_refunded</code>
              </p>
              {menu && menus.length > 1 ? (
                <a
                  className="text-action"
                  download
                  href={`${API_BASE}${path}/sample.csv?${menuQuery}`}
                >
                  선택한 메뉴의 가상 예시 CSV 내려받기
                </a>
              ) : (
                <p>가상 예시에는 가게 메뉴 두 개와 대상 메뉴 선택이 필요해요.</p>
              )}
              {experiment.storeId === 1 &&
                menu === 'A011003' &&
                experiment.startDate === '2026-11-07' &&
                end === '2026-11-20' && (
                  <p>
                    <a
                      className="text-action"
                      href={`${import.meta.env.BASE_URL}examples/store1-demo.csv`}
                      download
                    >
                      표본 일별 집계로 구성한 시연 주문 CSV
                    </a>
                  </p>
                )}
            </details>
          </>
        )}
        {message && (
          <p role="alert" className="form-error">
            {message}
          </p>
        )}
        {Object.entries(errors)
          .filter(([name]) => !['file', 'targetMenuCode'].includes(name))
          .map(([name, detail]) => (
            <p key={name} role="alert" className="field-error">
              {detail}
            </p>
          ))}
        <button className="button" disabled={busy || !menus.length} type="submit">
          {busy ? '주문을 비교하고 있어요…' : fileMode ? '파일로 비교' : 'DB 주문으로 비교'}
        </button>
      </form>
    </>
  );
}

export function ReportPage({
  experiment,
  menus,
  previewMenu,
}: {
  experiment: Experiment;
  menus: Menu[];
  previewMenu: string | null;
}) {
  const base = `/experiments/${encodeURIComponent(experiment.id)}`;
  const params = new URLSearchParams({ targetMenuCode: previewMenu || '' });
  const {
    data: report,
    error,
    retry,
  } = useQuery<SalesReport>(base + '/report' + (previewMenu !== null ? '/preview?' + params : ''));
  if (error)
    return (
      <section className="connection-state" role="alert">
        <h1>주문을 비교할 수 없어요</h1>
        <p>{error}</p>
        <button className="button" onClick={retry}>
          다시 불러오기
        </button>
        <a className="button secondary spaced" href={`#${base}/upload?${params}`}>
          메뉴·자료 다시 선택
        </a>
      </section>
    );
  if (!report)
    return (
      <p className="connection-state" role="status">
        비교 결과를 불러오고 있어요…
      </p>
    );
  return <ReportResult experiment={experiment} menus={menus} report={report} />;
}

export function ReportResult({
  experiment,
  menus,
  report,
}: {
  experiment: Experiment;
  menus: Menu[];
  report: SalesReport;
}) {
  const menu = menus.find((item) => item.menuCode === report.targetMenuCode);

  const { before, after } = report;
  return (
    <>
      <PageHeading eyebrow={experiment.title} title="시도 결과">
        {menu?.menuName || report.targetMenuCode} ·{' '}
        {report.source === 'DATABASE' ? '가게 POS 주문' : '업로드한 판매 자료'} ·{' '}
        {report.persisted ? '저장된 보고서' : '미리보기'}
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
          {report.excludedUnknownRefundLines > 0 && (
            <div>
              <dt>환불 여부 미확인 행</dt>
              <dd>{report.excludedUnknownRefundLines}개 제외</dd>
            </div>
          )}
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
        <a
          className="button secondary"
          href={`#/experiments/${encodeURIComponent(experiment.id)}/upload?${new URLSearchParams({ targetMenuCode: report.targetMenuCode })}`}
        >
          다시 비교하기
        </a>
      </div>
      <a className="text-action" href="#/forecast">
        우리 가게의 7일 예상 매출 보기
      </a>
    </>
  );
}
