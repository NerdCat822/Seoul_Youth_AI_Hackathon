import type {
  AgentChatResponse,
  AppData,
  AuthSession,
  ChatExchange,
  ChatSession,
  Experiment,
  ExperimentInput,
  Menu,
  NeighborhoodCase,
  Overview,
  SalesReport,
  SignupInput,
} from './types';

let csrfToken = '';

export function setSessionToken(token: string) {
  csrfToken = token;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public fieldErrors: Record<string, string> = {},
    public status = 0,
  ) {
    super(message);
  }
}

// 배포 경로(Vite base)를 따라간다. 기본값 '/'에서는 '/api/v1', '/try-log/'로 빌드하면 '/try-log/api/v1'.
export const API_BASE = `${import.meta.env.BASE_URL}api/v1`;

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  const token = csrfToken;
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  if (typeof options.body === 'string') headers.set('Content-Type', 'application/json');
  if (options.method && !['GET', 'HEAD', 'OPTIONS'].includes(options.method.toUpperCase())) {
    headers.set('X-CSRF-TOKEN', token);
  }
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      credentials: 'same-origin',
      cache: 'no-store',
      headers,
      signal: options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(10000)])
        : AbortSignal.timeout(10000),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError('서버에 연결하지 못했어요. 잠시 후 다시 시도해주세요.');
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    if (response.status === 401 && !path.startsWith('/auth/') && token === csrfToken) {
      window.dispatchEvent(new Event('trylog-session-expired'));
    }
    if (
      response.status === 403 &&
      body?.code === 'CSRF_INVALID' &&
      token === csrfToken &&
      path !== '/auth/session'
    ) {
      const current = await getSession(options.signal ?? undefined);
      if (token === csrfToken) {
        setSessionToken(current.csrfToken);
        window.dispatchEvent(new CustomEvent('trylog-session-refreshed', { detail: current }));
      }
      throw new ApiError(
        '로그인 상태를 다시 확인했어요. 입력 내용을 확인하고 한 번 더 시도해주세요.',
        {},
        403,
      );
    }
    throw new ApiError(
      body?.message ?? '요청을 처리하지 못했어요. 다시 시도해주세요.',
      body?.fieldErrors ?? {},
      response.status,
    );
  }
  return response.json() as Promise<T>;
}

export function getSession(signal?: AbortSignal): Promise<AuthSession> {
  return request<AuthSession>('/auth/session', { signal });
}
export function logIn(loginId: string, password: string) {
  return request<AuthSession>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ loginId, password }),
  });
}
export function signUp(input: SignupInput) {
  return request<AuthSession>('/auth/signup', { method: 'POST', body: JSON.stringify(input) });
}
export function logOut() {
  return request<AuthSession>('/auth/logout', { method: 'POST', body: '{}' });
}

export async function loadAppData(signal?: AbortSignal): Promise<AppData> {
  const [overview, menus, experiments, cases] = await Promise.all([
    request<Overview>('/overview', { signal }),
    request<Menu[]>('/menus', { signal }),
    request<Experiment[]>('/experiments', { signal }),
    request<NeighborhoodCase[]>('/cases', { signal }),
  ]);
  return { overview, menus, experiments, cases };
}

export function createExperiment(input: ExperimentInput, key: string): Promise<Experiment> {
  return request<Experiment>('/experiments', {
    method: 'POST',
    body: JSON.stringify(input),
    headers: { 'Idempotency-Key': key },
  });
}

/** 에이전트 서버에 한마디를 보낸다. threadId가 없으면 새 대화가 시작된다. */
export function sendChat(threadId: string | null, message: string): Promise<AgentChatResponse> {
  return request<AgentChatResponse>('/agent/chat', {
    method: 'POST',
    body: JSON.stringify({ threadId, message }),
  });
}

/** 주고받은 말을 대화 내역(DB)에 남긴다. */
export function saveChatExchange(threadId: string, exchange: ChatExchange): Promise<ChatSession> {
  return request<ChatSession>(`/chats/${encodeURIComponent(threadId)}/messages`, {
    method: 'POST',
    body: JSON.stringify(exchange),
  });
}

export function compareDatabase(id: string, targetMenuCode: string): Promise<SalesReport> {
  return request<SalesReport>(`/experiments/${encodeURIComponent(id)}/report/from-db`, {
    method: 'POST',
    body: JSON.stringify({ targetMenuCode }),
  });
}

export function compareSales(id: string, file: File, targetMenuCode: string): Promise<SalesReport> {
  const body = new FormData();
  body.append('file', file);
  body.append('targetMenuCode', targetMenuCode);
  return request<SalesReport>(`/experiments/${encodeURIComponent(id)}/report`, {
    method: 'POST',
    body,
  });
}
