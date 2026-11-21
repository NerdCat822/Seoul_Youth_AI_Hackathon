import { useEffect, useRef, useState } from 'react';
import { getSession, loadAppData, logOut, setSessionToken } from './api';
import type { AppData, AuthSession, Experiment, SalesReport } from './types';
import { CHAT_ENABLED } from './lib/features';
import { maskedListPath, readRoute } from './lib/route';
import { useQuery } from './lib/useQuery';
import { ChatPanel } from './components/ChatPanel';
import { Icon } from './components/Icon';
import { HomePage } from './pages/HomePage';
import { CalendarPage } from './pages/CalendarPage';
import { RecordsPage } from './pages/RecordsPage';
import { CaseDetailPage, CasesPage } from './pages/CasesPage';
import { ExperimentDetailPage, ExperimentFormPage } from './pages/ExperimentPage';
import { SamplePage } from './pages/SamplePage';
import { ReportPage, ReportResult, UploadPage } from './pages/ReportPage';
import { ForecastPage } from './pages/ForecastPage';
import { AuthPage } from './pages/AuthPage';
import { ChatDetailPage, ChatListPage } from './pages/ChatPage';

function useRoute() {
  const [route, setRoute] = useState(readRoute);
  useEffect(() => {
    const update = () => setRoute(readRoute());
    // 주소가 같은 두 화면(ID를 감춘 서로 다른 시도) 사이를 오갈 때는 hashchange 없이 popstate만 온다.
    window.addEventListener('hashchange', update);
    window.addEventListener('popstate', update);
    return () => {
      window.removeEventListener('hashchange', update);
      window.removeEventListener('popstate', update);
    };
  }, []);
  const [pathname, search = ''] = route.split('?');
  return { route, pathname, params: new URLSearchParams(search) };
}

export function App() {
  const { pathname } = useRoute();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const channel = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    const reset = () => {
      setSessionToken('');
      setSession(null);
      setError('');
      setAttempt((n) => n + 1);
    };
    const refreshed = (event: Event) => setSession((event as CustomEvent<AuthSession>).detail);
    const otherTabChanged = () => {
      window.location.replace('#/');
      reset();
    };
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) reset();
    };
    const relay =
      typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('trylog-session');
    channel.current = relay;
    relay?.addEventListener('message', otherTabChanged);
    window.addEventListener('trylog-session-refreshed', refreshed);
    window.addEventListener('trylog-session-expired', reset);
    window.addEventListener('pageshow', restore);
    return () => {
      window.removeEventListener('pageshow', restore);
      window.removeEventListener('trylog-session-refreshed', refreshed);
      window.removeEventListener('trylog-session-expired', reset);
      relay?.close();
      channel.current = null;
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    getSession(controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setSessionToken(result.csrfToken);
        setSession(result);
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : '로그인 상태를 확인하지 못했어요.');
      });
    return () => controller.abort();
  }, [attempt]);

  function changeSession(next: AuthSession) {
    setSessionToken(next.csrfToken);
    setSession(next);
    window.location.replace(next.authenticated ? '#/' : '#/login');
    channel.current?.postMessage('changed');
  }
  if (!session)
    return (
      <main className="auth-shell">
        <section className="auth-card" aria-live="polite">
          {error ? (
            <>
              <h1>서버에 연결하지 못했어요</h1>
              <p>{error}</p>
              <button className="button" onClick={() => setAttempt((n) => n + 1)}>
                다시 불러오기
              </button>
            </>
          ) : (
            <p role="status">로그인 상태를 확인하고 있어요…</p>
          )}
        </section>
      </main>
    );
  if (!session.authenticated)
    return (
      <AuthPage
        key={pathname === '/signup' ? 'signup' : 'login'}
        signup={pathname === '/signup'}
        signupEnabled={session.signupEnabled}
        onAuthenticated={changeSession}
      />
    );
  return (
    <StoreApp
      key={session.loginId ?? session.storeId}
      session={session}
      onSessionChanged={changeSession}
    />
  );
}

function StoreApp({
  session,
  onSessionChanged,
}: {
  session: AuthSession;
  onSessionChanged: (session: AuthSession) => void;
}) {
  const { route, pathname, params } = useRoute();
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState('');
  const mainRef = useRef<HTMLElement>(null);
  // 넓은 화면에서는 대화창을 오른쪽에 펼쳐 두고, 좁은 화면에서는 버튼으로 연다.
  const [chatOpen, setChatOpen] = useState(() => {
    try {
      const saved = window.sessionStorage.getItem('trylog.chat.open');
      if (saved) return saved === 'true';
    } catch {
      // 저장 공간을 못 쓰면 화면 너비로 정한다.
    }
    return window.matchMedia('(min-width: 1180px)').matches;
  });
  function showChat(open: boolean) {
    setChatOpen(open);
    try {
      window.sessionStorage.setItem('trylog.chat.open', String(open));
    } catch {
      // 다음에 다시 열 때의 기본값만 달라진다.
    }
  }
  const [showAlerts, setShowAlerts] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const logoutPending = useRef(false);
  async function leaveStore() {
    if (logoutPending.current) return;
    logoutPending.current = true;
    setLeaving(true);
    try {
      onSessionChanged(await logOut());
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : '로그아웃하지 못했어요.');
    } finally {
      logoutPending.current = false;
      setLeaving(false);
    }
  }
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
    : pathname.startsWith('/chats/')
      ? '/chats'
      : pathname === '/forecast'
        ? '/'
        : pathname.endsWith('/report') || pathname.endsWith('/upload')
          ? `/experiments/${experimentId}`
          : '/records';
  const isMain = ['/', '/calendar', '/records', '/cases', '/chats'].includes(pathname);
  function created(experiment: Experiment) {
    setData(
      (current) => current && { ...current, experiments: [experiment, ...current.experiments] },
    );
    setNotice('시도를 저장했어요. 달력에도 함께 표시했어요.');
    window.location.hash = `/experiments/${encodeURIComponent(experiment.id)}`;
  }
  function savedInChat(experiment: Experiment) {
    setData(
      (current) =>
        current &&
        (current.experiments.some((item) => item.id === experiment.id)
          ? current
          : { ...current, experiments: [experiment, ...current.experiments] }),
    );
    setNotice('대화에서 시도를 저장했어요. 달력에도 함께 표시했어요.');
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
  else if (['/', '/login', '/signup'].includes(pathname)) page = <HomePage data={data} />;
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
  else if (pathname === '/chats') page = <ChatListPage />;
  else if (pathname.startsWith('/chats/'))
    page = (
      <ChatDetailPage
        key={route}
        id={decodeURIComponent(pathname.slice('/chats/'.length))}
        cases={data.cases}
      />
    );
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
  } else if (maskedListPath(pathname)) page = <Reselect listPath={maskedListPath(pathname)!} />;
  else page = <NotFound />;
  return (
    <div className={`workspace ${CHAT_ENABLED && chatOpen ? 'chat-open' : ''}`}>
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
              {session.storeName}
            </span>
            <button className="logout-button" onClick={leaveStore} disabled={leaving}>
              {leaving ? '로그아웃 중' : '로그아웃'}
            </button>
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
      {CHAT_ENABLED && data && (
        <>
          <ChatPanel
            loginId={session.loginId}
            storeId={session.storeId ?? 0}
            open={chatOpen}
            onClose={() => showChat(false)}
            onNavigate={() => {
              // 좁은 화면에서는 대화창이 화면을 덮으므로, 다른 화면으로 갈 때 접는다.
              if (!window.matchMedia('(min-width: 1180px)').matches) showChat(false);
            }}
            onSaved={savedInChat}
          />
          {!chatOpen && (
            <button type="button" className="chat-fab" onClick={() => showChat(true)}>
              <Icon name="chat" size={20} />
              대화
            </button>
          )}
        </>
      )}
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

// 주소에 ID가 없어서 어떤 기록인지 알 수 없을 때(감춘 주소를 복사해 새로 연 경우).
function Reselect({ listPath }: { listPath: string }) {
  return (
    <section className="empty-state">
      <h1>다시 선택해주세요</h1>
      <p>이 주소만으로는 어떤 기록인지 알 수 없어요. 목록에서 다시 골라주세요.</p>
      <a className="button" href={`#${listPath}`}>
        목록으로 가기
      </a>
    </section>
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
