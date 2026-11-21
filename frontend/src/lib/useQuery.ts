import { useEffect, useState } from 'react';
import { ApiError, request } from '../api';

export function useQuery<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    setData(null);
    request<T>(path, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        const detail = reason instanceof ApiError ? Object.values(reason.fieldErrors) : [];
        setError(
          [reason instanceof Error ? reason.message : '자료를 불러오지 못했어요.', ...detail].join(
            ' ',
          ),
        );
      });
    return () => controller.abort();
  }, [path, attempt]);
  return { data, error, retry: () => setAttempt((value) => value + 1) };
}
