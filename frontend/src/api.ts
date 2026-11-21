import type {
  AppData,
  Experiment,
  ExperimentInput,
  Menu,
  NeighborhoodCase,
  Overview,
  SalesReport,
} from './types';

export class ApiError extends Error {
  constructor(
    message: string,
    public fieldErrors: Record<string, string> = {},
  ) {
    super(message);
  }
}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      ...options,
      headers: {
        Accept: 'application/json',
        ...(typeof options.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
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
    throw new ApiError(
      body?.message ?? '요청을 처리하지 못했어요. 다시 시도해주세요.',
      body?.fieldErrors ?? {},
    );
  }
  return response.json() as Promise<T>;
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
