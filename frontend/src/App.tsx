import { useEffect, useRef, useState } from 'react';
import { loadAppData } from './api';
import type { AppData, Experiment } from './types';
import { Icon } from './components/Icon';
import { HomePage } from './pages/HomePage';
import { CalendarPage } from './pages/CalendarPage';
import { RecordsPage } from './pages/RecordsPage';
import { CaseDetailPage, CasesPage } from './pages/CasesPage';
import { ExperimentDetailPage, ExperimentFormPage } from './pages/ExperimentPage';
import { SamplePage } from './pages/SamplePage';
import { ReportPage, UploadPage } from './pages/ReportPage';
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
  function compared(id: string) {
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
    const item = data.experiments.find((item) => encodeURIComponent(item.id) === experimentId);
    if (!item) page = <NotFound />;
    else if (pathname === `/experiments/${experimentId}`)
      page = <ExperimentDetailPage experiment={item} />;
    else if (
      pathname === `/experiments/${experimentId}/upload` &&
      ['READY', 'COMPLETED'].includes(item.status)
    )
      page = <UploadPage key={item.id} experiment={item} onCompared={compared} />;
    else if (pathname === `/experiments/${experimentId}/report` && item.status === 'COMPLETED')
      page = <ReportPage key={item.id} experiment={item} />;
    else if (
      pathname === `/experiments/${experimentId}/report` ||
      pathname === `/experiments/${experimentId}/upload`
    )
      page = <ExperimentDetailPage experiment={item} />;
    else page = <NotFound />;
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
                        <small>판매 자료를 올릴 차례예요.</small>
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
        <footer className="storage-note">
          <span className="dev-dot" />
          개발 버전 · 서버 재시작 시 기록이 초기화돼요.
        </footer>
        <nav className={`app-nav ${isMain ? '' : 'detail-navigation'}`} aria-label="주 메뉴">
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

function NotFound() {
  return (
    <section className="empty-state">
      <h1>기록을 찾을 수 없어요</h1>
      <p>주소를 확인해주세요. 서버를 다시 시작했다면 임시 기록이 지워졌을 수 있어요.</p>
      <a className="button" href="#/">
        홈으로 돌아가기
      </a>
    </section>
  );
}
