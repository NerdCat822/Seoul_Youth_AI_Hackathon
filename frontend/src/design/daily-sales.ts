import { request } from '../api';

export async function loadActualSales(from: string, to: string, signal: AbortSignal) {
  const params = new URLSearchParams({ from, to });
  const rows = await request<{ date: string; actual: number }[]>('/sales/daily?' + params, {
    signal,
  });
  return new Map(rows.map(({ date, actual }) => [date, actual]));
}
