export function asDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

export function addDays(value: string, days: number): string {
  const date = asDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function formatDate(value: string, weekday = false): string {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
    ...(weekday ? { weekday: 'short' } : {}),
    timeZone: 'UTC',
  }).format(asDate(value));
}

export function formatMonth(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(asDate(`${value}-01`));
}

export function shiftMonth(month: string, delta: number): string {
  const date = asDate(`${month}-01`);
  date.setUTCMonth(date.getUTCMonth() + delta);
  return date.toISOString().slice(0, 7);
}
