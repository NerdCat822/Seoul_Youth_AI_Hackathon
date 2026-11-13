import type { AppData, Experiment, ExperimentInput, NeighborhoodCase, Overview } from './types';

export class ApiError extends Error {
  constructor(
    message: string,
    public fieldErrors: Record<string, string> = {},
  ) {
    super(message);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      ...options,
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
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
  const [overview, experiments, cases] = await Promise.all([
    request<Overview>('/overview', { signal }),
    request<Experiment[]>('/experiments', { signal }),
    request<NeighborhoodCase[]>('/cases', { signal }),
  ]);
  return { overview, experiments, cases };
}

export function createExperiment(input: ExperimentInput): Promise<Experiment> {
  return request<Experiment>('/experiments', { method: 'POST', body: JSON.stringify(input) });
}
