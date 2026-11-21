import { request } from '../api';
import { addDays, asDate, formatDate } from '../lib/dates';
import type { AppData, Experiment } from '../types';
import './home-week.css';

interface DailySales {
  date: string;
  expected: number | null;
}
export interface DailyWeather {
  date: string;
  averageTempC: number | null;
  precipitationMm: number | null;
}
const amount = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 });
const weekday = new Intl.DateTimeFormat('ko-KR', { weekday: 'short', timeZone: 'UTC' });
const shortDate = new Intl.DateTimeFormat('ko-KR', {
  month: 'numeric',
  day: 'numeric',
  timeZone: 'UTC',
});

export function upcomingDates(today: string) {
  return Array.from({ length: 7 }, (_, index) => addDays(today, index + 1));
}

export function weatherLabel(day?: DailyWeather) {
  const parts = [];
  if (day?.averageTempC != null && Number.isFinite(day.averageTempC))
    parts.push('평균 ' + amount.format(day.averageTempC) + '°C');
  if (day?.precipitationMm != null && Number.isFinite(day.precipitationMm))
    parts.push('강수 ' + amount.format(day.precipitationMm) + 'mm');
  return parts.join('\n');
}

export async function loadWeekSales(dates: string[], signal: AbortSignal): Promise<DailySales[]> {
  const rows = await request<DailySales[]>('/forecast/week', { signal });
  const amounts = new Map(rows.map((row) => [row.date, row.expected]));
  return dates.map((date) => {
    const value = amounts.get(date);
    return { date, expected: value != null && Number.isFinite(value) ? value : null };
  });
}

function dayTasks(date: string, records: Experiment[]) {
  const { esc } = window.App;
  const links: string[] = [];
  for (const record of records) {
    if (record.status === 'COMPLETED') continue;
    const stages: string[] = [];
    if (record.checkDate === date) stages.push('결과 확인');
    if (record.startDate === date && record.endDate === date) stages.push('시작·마무리');
    else if (record.startDate === date) stages.push('시작');
    else if (record.endDate === date) stages.push('마무리');
    else if (record.startDate < date && record.endDate > date) stages.push('진행');
    for (const stage of stages) {
      links.push(
        `<li><a href="record.html?id=${encodeURIComponent(record.id)}"><span class="week-stage">${stage}</span> ${esc(record.title)}</a></li>`,
      );
    }
  }
  if (!links.length) return '<span class="week-muted">할 일 없음</span>';
  const extra =
    links.length > 2
      ? `<details><summary>${links.length - 2}개 더 보기</summary><ul>${links.slice(2).join('')}</ul></details>`
      : '';
  return '<ul>' + links.slice(0, 2).join('') + '</ul>' + extra;
}

export function mountHomeWeek(section: HTMLElement, data: AppData, signal: AbortSignal) {
  const dates = upcomingDates(data.overview.today);
  const { icon } = window.App;
  section.className = 'card week-summary';
  section.dataset.weekSummary = '';
  section.setAttribute('aria-labelledby', 'week-title');
  section.innerHTML = `<div class="week-heading">
    <div><h1 id="week-title" class="page-title">다음 7일</h1><p class="week-range">${formatDate(dates[0], true)} – ${formatDate(dates[6], true)}</p></div>
    <a href="forecast.html?week=upcoming" class="btn btn-sm btn-neutral">매출 전망 보기 ${icon('chevron-right', 16)}</a>
  </div>
  <div class="week-tools"><p data-week-total></p><div class="week-arrows" hidden>
    <button class="icon-btn" type="button" aria-label="이전 날짜" aria-controls="week-days">${icon('chevron-left', 18)}</button>
    <button class="icon-btn" type="button" aria-label="다음 날짜" aria-controls="week-days">${icon('chevron-right', 18)}</button>
  </div></div>
  <div class="week-scroll" role="region" aria-label="날짜별 예상 매출, 날씨와 할 일">
    <ol class="week-days" id="week-days">${dates
      .map((date) => {
        const value = asDate(date);
        return `<li class="week-day" data-week-date="${date}">
        <time datetime="${date}" aria-label="${formatDate(date, true)}">${shortDate.format(value)} <span>${weekday.format(value)}</span></time>
        <dl><div class="week-money"><dt>예상 매출</dt><dd data-week-sales>조회 중</dd></div>
        <div class="week-weather"><dt>날씨</dt><dd data-week-weather>조회 중</dd></div>
        <div class="week-tasks"><dt>할 일</dt><dd data-week-tasks>${dayTasks(date, data.experiments)}</dd></div></dl>
      </li>`;
      })
      .join('')}</ol></div>`;

  const cells = Array.from(section.querySelectorAll<HTMLElement>('[data-week-date]'));
  const scroller = section.querySelector<HTMLElement>('.week-scroll')!;
  const arrows = section.querySelector<HTMLElement>('.week-arrows')!;
  const [back, next] = arrows.querySelectorAll('button');
  function updateArrows() {
    const max = scroller.scrollWidth - scroller.clientWidth;
    arrows.hidden = max <= 1;
    scroller.tabIndex = max > 1 ? 0 : -1;
    back.disabled = scroller.scrollLeft <= 1;
    next.disabled = scroller.scrollLeft >= max - 1;
  }
  function move(direction: number) {
    scroller.scrollBy({
      left: direction * cells[0].getBoundingClientRect().width,
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
  }
  back.onclick = () => move(-1);
  next.onclick = () => move(1);
  scroller.addEventListener('scroll', updateArrows, { passive: true, signal });
  const observer = new ResizeObserver(updateArrows);
  observer.observe(scroller);
  signal.addEventListener('abort', () => observer.disconnect(), { once: true });
  updateArrows();

  function unavailable(selector: string) {
    if (signal.aborted) return;
    for (const cell of cells) cell.querySelector(selector)!.textContent = '조회 실패';
  }
  void loadWeekSales(dates, signal)
    .then((days) => {
      if (signal.aborted) return;
      let count = 0,
        sum = 0;
      for (const [index, cell] of cells.entries()) {
        const value = days[index].expected;
        const target = cell.querySelector<HTMLElement>('[data-week-sales]')!;
        if (value !== null) {
          target.textContent = amount.format(value) + '원';
          target.classList.add('week-amount');
          count++;
          sum += value;
        } else target.textContent = '예측 자료 없음';
      }
      if (count === 7) {
        const total = section.querySelector<HTMLElement>('[data-week-total]')!;
        total.innerHTML = `7일 예상 매출 합계 <strong>${amount.format(sum)}원</strong>`;
      }
    })
    .catch(() => unavailable('[data-week-sales]'));
  void request<DailyWeather[]>('/weather/week', { signal })
    .then((rows) => {
      if (signal.aborted) return;
      const weather = new Map(rows.map((row) => [row.date, row]));
      for (const cell of cells) {
        const day = weather.get(cell.dataset.weekDate!);
        cell.querySelector<HTMLElement>('[data-week-weather]')!.textContent =
          weatherLabel(day) || '예보 자료 없음';
      }
    })
    .catch(() => unavailable('[data-week-weather]'));
}
