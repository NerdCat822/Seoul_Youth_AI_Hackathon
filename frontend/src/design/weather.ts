import { request } from '../api';

export interface DailyWeather {
  date: string;
  averageTempC: number | null;
  precipitationMm: number | null;
  forecast: boolean;
}

const amount = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 });

export function loadWeather(from: string, to: string, signal: AbortSignal) {
  const params = new URLSearchParams({ from, to });
  return request<DailyWeather[]>('/weather/daily?' + params, { signal });
}

export function weatherLabel(day?: DailyWeather) {
  const parts = [];
  if (day?.averageTempC != null && Number.isFinite(day.averageTempC))
    parts.push('평균 ' + amount.format(day.averageTempC) + '°C');
  if (
    day?.precipitationMm != null &&
    Number.isFinite(day.precipitationMm) &&
    day.precipitationMm >= 0
  )
    parts.push('강수 ' + amount.format(day.precipitationMm) + 'mm');
  return parts.join('\n');
}

export function weatherTitle(day?: DailyWeather) {
  const label = weatherLabel(day);
  return day && label ? (day.forecast ? '예보' : '관측') + ' · ' + label.replace('\n', ', ') : '';
}

export function weatherIcon(day?: DailyWeather) {
  if (!day) return '';
  let glyph: string;
  if (
    day.precipitationMm != null &&
    Number.isFinite(day.precipitationMm) &&
    day.precipitationMm >= 0
  ) {
    // The source measures precipitation but does not identify sky conditions or precipitation type.
    glyph = '<path d="M12 2c-2.1 3.7-7 8.9-7 13a7 7 0 0 0 14 0c0-4.1-4.9-9.3-7-13Z"/>';
    if (day.precipitationMm === 0) glyph += '<path d="m3 3 18 18"/>';
  } else if (day.averageTempC != null && Number.isFinite(day.averageTempC)) {
    glyph = '<path d="M9 14.3V5a3 3 0 0 1 6 0v9.3a5 5 0 1 1-6 0Z"/><path d="M12 8v9"/>';
  } else {
    return '';
  }
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${glyph}</svg>`;
}
