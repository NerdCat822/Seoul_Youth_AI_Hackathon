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
    mainRef.current?.focus({ preventScroll: true });
  }, [route]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const activeTab =
    pathname === '/calendar'
      ? 'calendar'
      : pathname === '/records' ||
          pathname.startsWith('/cases') ||
          pathname.startsWith('/experiments') ||
          pathname === '/sample'
        ? 'records'
        : 'home';
  const isMain = ['/', '/calendar', '/records', '/cases'].includes(pathname);
  function created(experiment: Experiment) {
    setData(
      (current) => current && { ...current, experiments: [experiment, ...current.experiments] },
    );
    setNotice('시도를 저장했어요. 달력에도 함께 표시했어요.');
    window.location.hash = `/experiments/${encodeURIComponent(experiment.id)}`;
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
        onCreated={created}
      />
    );
  else if (pathname === '/sample') page = <SamplePage />;
  else if (pathname.startsWith('/cases/')) {
    const item = data.cases.find((item) => `/cases/${encodeURIComponent(item.id)}` === pathname);
    page = item ? <CaseDetailPage item={item} /> : <NotFound />;
  } else if (pathname.startsWith('/experiments/')) {
    const item = data.experiments.find(
      (item) => `/experiments/${encodeURIComponent(item.id)}` === pathname,
    );
    page = item ? <ExperimentDetailPage experiment={item} /> : <NotFound />;
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
              <a
                className="icon-button back-link"
                href={pathname.startsWith('/cases/') ? '#/cases' : '#/records'}
                aria-label={pathname.startsWith('/cases/') ? '사례 목록으로' : '장사 기록으로'}
              >
                <Icon name="back" size={20} />
              </a>
            )}
            <a className="brand" href="#/" aria-label="트라이로그 홈">
              트라이로그
              <span className="brand-dot" />
            </a>
          </div>
          <span className="store-chip">
            <Icon name="pin" size={14} />
            {data?.overview.storeName ?? '우리 가게'}
          </span>
        </header>
        <main id="main-content" className="screen" ref={mainRef} tabIndex={-1}>
          {page}
        </main>
        <footer className="storage-note">
          <span className="dev-dot" />
          개발 버전 · 서버 재시작 시 기록이 초기화돼요.
        </footer>
        <nav className="app-nav" aria-label="주 메뉴">
          {(
            [
              { id: 'home', path: '/', label: '홈', icon: 'home' },
              { id: 'calendar', path: '/calendar', label: '달력', icon: 'calendar' },
              { id: 'records', path: '/records', label: '장사 기록', icon: 'chart' },
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
      <p className="desktop-caption">
        트라이로그 <span>작은 시도를, 더 나은 내일로.</span>
      </p>
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
