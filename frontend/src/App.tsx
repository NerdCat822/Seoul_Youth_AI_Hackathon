import { useEffect, useRef, useState } from 'react';
import { loadAppData } from './api';
import type { AppData, Experiment, SalesReport } from './types';
import { useQuery } from './lib/useQuery';
import { Icon } from './components/Icon';
import { HomePage } from './pages/HomePage';
import { CalendarPage } from './pages/CalendarPage';
import { RecordsPage } from './pages/RecordsPage';
import { CaseDetailPage, CasesPage } from './pages/CasesPage';
import { ExperimentDetailPage, ExperimentFormPage } from './pages/ExperimentPage';
import { SamplePage } from './pages/SamplePage';
import { ReportPage, ReportResult, UploadPage } from './pages/ReportPage';
import { ForecastPage } from './pages/ForecastPage';

function useRoute() {
  const [route, setRoute] = useState(window.location.hash.slice(1) || '/');
  useEffect(() => {
    const update = () => setRoute(window.location.hash.slice(1) || '/');
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  const [pathname, search = ''] = route.split('?');
  return { route, pathname, params: new URLSearchParams(search) };
}

export function App() {
  const { route, pathname, params } = useRoute();
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState('');
  const mainRef = useRef<HTMLElement>(null);
  const [showAlerts, setShowAlerts] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    loadAppData(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : '자료를 불러오지 못했어요.');
      });
    return () => controller.abort();
  }, [attempt]);
  useEffect(() => {
    window.scrollTo(0, 0);
    setShowAlerts(false);
    mainRef.current?.focus({ preventScroll: true });
  }, [route]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const activeTab = pathname.startsWith('/cases')
    ? 'ideas'
    : ['/', '/forecast'].includes(pathname)
      ? 'home'
      : 'records';
  const due = data?.experiments.filter((item) => item.status === 'READY') ?? [];
  const experimentId = pathname.split('/')[2];
  const backPath = pathname.startsWith('/cases/')
    ? '/cases'
    : pathname === '/forecast'
      ? '/'
      : pathname.endsWith('/report') || pathname.endsWith('/upload')
        ? `/experiments/${experimentId}`
        : '/records';
  const isMain = ['/', '/calendar', '/records', '/cases'].includes(pathname);
  function created(experiment: Experiment) {
    setData(
      (current) => current && { ...current, experiments: [experiment, ...current.experiments] },
    );
    setNotice('시도를 저장했어요. 달력에도 함께 표시했어요.');
    window.location.hash = `/experiments/${encodeURIComponent(experiment.id)}`;
  }
  const [filePreview, setFilePreview] = useState<{ id: string; report: SalesReport } | null>(null);
  function compared(id: string, report: SalesReport) {
    if (report.source === 'UPLOAD' && !report.persisted) setFilePreview({ id, report });
    if (!report.persisted) return;
    setData(
      (current) =>
        current && {
          ...current,
          experiments: current.experiments.map((item) =>
            item.id === id ? { ...item, status: 'COMPLETED' } : item,
          ),
        },
    );
  }
  let page;
  if (!data)
    page = error ? (
      <section className="connection-state" role="alert">
        <div className="empty-icon">
          <Icon name="note" size={30} />
        </div>
        <h1>자료를 불러오지 못했어요</h1>
        <p>{error}</p>
        <button className="button" onClick={() => setAttempt((value) => value + 1)}>
          다시 불러오기
        </button>
      </section>
    ) : (
      <div className="connection-state" role="status">
        <span className="spinner" />
        <p>우리 가게 기록을 불러오고 있어요…</p>
      </div>
    );
  else if (pathname === '/') page = <HomePage data={data} />;
  else if (pathname === '/forecast') page = <ForecastPage />;
  else if (pathname === '/calendar')
    page = <CalendarPage today={data.overview.today} experiments={data.experiments} />;
  else if (pathname === '/records') page = <RecordsPage experiments={data.experiments} />;
  else if (pathname === '/cases')
    page = <CasesPage cases={data.cases} freeOnly={params.get('free') === 'true'} />;
  else if (pathname === '/new')
    page = (
      <ExperimentFormPage
        key={route}
        today={data.overview.today}
        menus={data.menus}
        writeEnabled={data.overview.writeEnabled}
        seed={data.cases.find((item) => item.id === params.get('case'))}
        draft={params.get('text') ?? undefined}
        previous={data.experiments.find((item) => item.id === params.get('from'))}
        onCreated={created}
      />
    );
  else if (pathname === '/sample') page = <SamplePage />;
  else if (pathname.startsWith('/cases/')) {
    const item = data.cases.find((item) => `/cases/${encodeURIComponent(item.id)}` === pathname);
    page = item ? <CaseDetailPage item={item} /> : <NotFound />;
  } else if (pathname.startsWith('/experiments/')) {
    page = (
      <ExperimentRoute
        key={route}
        id={experimentId}
        path={pathname}
        params={params}
        data={data}
        filePreview={filePreview}
        onCompared={compared}
      />
    );
  } else page = <NotFound />;
  return (
    <div className="workspace">
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          mainRef.current?.focus();
        }}
      >
        본문으로 건너뛰기
      </a>
      <div className="phone">
        <header className="app-header">
          <div className="header-leading">
            {!isMain && (
              <a className="icon-button back-link" href={`#${backPath}`} aria-label="이전 단계로">
                <Icon name="back" size={20} />
              </a>
            )}
            <a className="brand" href="#/" aria-label="트라이로그 홈">
              트라이로그
              <span className="brand-dot" />
            </a>
          </div>
          <div className="header-tools">
            <div className="notification">
              <button
                type="button"
                className="icon-button"
                aria-label="알림"
                aria-expanded={showAlerts}
                onClick={() => setShowAlerts(!showAlerts)}
              >
                <Icon name="bell" />
                {due.length > 0 && <i />}
              </button>
              {showAlerts && (
                <section className="alert-panel">
                  <h2>알림</h2>
                  {due.length ? (
                    due.map((item) => (
                      <a key={item.id} href={`#/experiments/${item.id}/upload`}>
                        {item.title}
                        <small>전후 주문을 비교할 수 있어요.</small>
                      </a>
                    ))
                  ) : (
                    <p>지금 확인할 결과가 없어요.</p>
                  )}
                </section>
              )}
            </div>
            <span className="store-chip">
              <Icon name="pin" size={14} />
              {data?.overview.storeName ?? '우리 가게'}
            </span>
          </div>
        </header>
        <main
          id="main-content"
          className={`screen ${pathname === '/' ? 'home-screen' : ''}`}
          ref={mainRef}
          tabIndex={-1}
        >
          {page}
        </main>
        <nav className="app-nav" aria-label="주 메뉴">
          <a className="side-brand" href="#/" aria-label="트라이로그 홈">
            <i aria-hidden="true">✓</i>Trylog
          </a>
          {(
            [
              { id: 'home', path: '/', label: '홈', icon: 'home' },
              { id: 'ideas', path: '/cases', label: '아이디어', icon: 'idea' },
              { id: 'records', path: '/records', label: '내 기록', icon: 'note' },
            ] as const
          ).map((tab) => (
            <a
              key={tab.id}
              href={`#${tab.path}`}
              aria-current={activeTab === tab.id ? 'page' : undefined}
            >
              <Icon name={tab.icon} />
              <span>{tab.label}</span>
            </a>
          ))}
        </nav>
        <div className={`toast ${notice ? 'visible' : ''}`} role="status">
          {notice}
        </div>
      </div>
    </div>
  );
}

function ExperimentRoute({
  id,
  path,
  params,
  data,
  filePreview,
  onCompared,
}: {
  id: string;
  path: string;
  params: URLSearchParams;
  data: AppData;
  filePreview: { id: string; report: SalesReport } | null;
  onCompared: (id: string, report: SalesReport) => void;
}) {
  const base = `/experiments/${id}`;
  const { data: experiment, error, retry } = useQuery<Experiment>(base);
  if (error)
    return (
      <section className="card" role="alert">
        <h1>기록을 열지 못했어요</h1>
        <p>{error}</p>
        <button className="button" onClick={retry}>
          다시 불러오기
        </button>
        <a className="text-action" href="#/records">
          내 기록으로 돌아가기
        </a>
      </section>
    );
  if (!experiment) return <p role="status">가게 기록을 불러오고 있어요…</p>;
  const comparable = experiment.status === 'READY' || experiment.status === 'COMPLETED';
  if (path === base || (!comparable && [base + '/upload', base + '/report'].includes(path)))
    return <ExperimentDetailPage experiment={experiment} menus={data.menus} />;
  if (path === base + '/upload')
    return (
      <UploadPage
        experiment={experiment}
        menus={data.menus}
        writeEnabled={data.overview.writeEnabled}
        onCompared={onCompared}
        initialMenu={params.get('targetMenuCode')}
        initialFile={params.get('source') === 'upload'}
      />
    );
  if (path !== base + '/report') return <NotFound />;
  const menu = params.get('targetMenuCode') || experiment.targetMenuCode || '';
  if (params.get('source') === 'upload') {
    if (filePreview?.id === experiment.id && filePreview.report.targetMenuCode === menu)
      return (
        <ReportResult report={filePreview.report} experiment={experiment} menus={data.menus} />
      );
    return (
      <section className="card">
        <h1>파일을 다시 선택해주세요</h1>
        <p>이 파일의 비교 결과는 미리보기로만 제공돼요.</p>
        <a
          href={`#${base}/upload?${new URLSearchParams({ source: 'upload', targetMenuCode: menu })}`}
          className="button"
        >
          파일 다시 선택
        </a>
      </section>
    );
  }
  const preview = params.get('source') === 'db' || experiment.status !== 'COMPLETED';
  if (preview && !menu)
    return (
      <UploadPage
        experiment={experiment}
        menus={data.menus}
        writeEnabled={data.overview.writeEnabled}
        onCompared={onCompared}
      />
    );
  return (
    <ReportPage experiment={experiment} menus={data.menus} previewMenu={preview ? menu : null} />
  );
}

function NotFound() {
  return (
    <section className="empty-state">
      <h1>기록을 찾을 수 없어요</h1>
      <p>주소를 확인하거나 내 가게의 기록 목록에서 다시 선택해주세요.</p>
      <a className="button" href="#/">
        홈으로 돌아가기
      </a>
    </section>
  );
}
