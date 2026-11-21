import { request } from '../api';
import { addDays, asDate, formatDate } from '../lib/dates';
import type { AppData, Experiment } from '../types';
import { loadActualSales } from './daily-sales';
import { daysBetween, recordUrl } from './record-ui';
import { loadWeather, weatherIcon, weatherLabel, weatherTitle, type DailyWeather } from './weather';
import './home-week.css';

interface DailySales {
  date: string;
  expected: number | null;
}
const amount = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 });
const weekday = new Intl.DateTimeFormat('ko-KR', { weekday: 'short', timeZone: 'UTC' });

export function upcomingDates(today: string) {
  return Array.from({ length: 7 }, (_, index) => addDays(today, index + 1));
}

export async function loadWeekSales(dates: string[], signal: AbortSignal): Promise<DailySales[]> {
  const rows = await request<DailySales[]>('/forecast/week', { signal });
  const amounts = new Map(rows.map((row) => [row.date, row.expected]));
  return dates.map((date) => {
    const value = amounts.get(date);
    return { date, expected: value != null && Number.isFinite(value) ? value : null };
  });
}

const laneColors = ['#155dfc', '#e17100', '#00b8db', '#ad46ff'];
type WeekItem = { record: Experiment; first: number; last: number; color: string; check: boolean };

function weekLanes(records: Experiment[], dates: string[]) {
  const { esc, icon } = window.App;
  const items: WeekItem[] = [];
  for (const [index, record] of records.entries()) {
    const color = laneColors[index % laneColors.length];
    if (record.startDate <= dates[6] && record.endDate >= dates[0]) {
      items.push({
        record,
        first: Math.max(0, daysBetween(dates[0], record.startDate)),
        last: Math.min(6, daysBetween(dates[0], record.endDate)),
        color,
        check: false,
      });
    }
    const check = dates.indexOf(record.checkDate);
    if (check >= 0) items.push({ record, first: check, last: check, color, check: true });
  }
  items.sort((a, b) => a.first - b.first || Number(a.check) - Number(b.check));
  const endOfLane: number[] = [];
  return items
    .map(({ record, first, last, color, check }) => {
      let row = endOfLane.findIndex((end) => end < first);
      if (row === -1) row = endOfLane.length;
      endOfLane[row] = last;
      const href = recordUrl(
        check && (record.status === 'READY' || record.status === 'COMPLETED') ? 'result' : 'record',
        record.id,
      );
      const label = check ? '결과 확인 · ' + record.title : record.title;
      const accessible = check
        ? formatDate(record.checkDate) + ' ' + label
        : label + ' · ' + formatDate(record.startDate) + ' ~ ' + formatDate(record.endDate);
      const continuation =
        !check && record.endDate > dates[6]
          ? `<span class="ml-auto flex-none" style="color:${color}" aria-label="다음 주로 이어짐">${icon('chevron-right', 16)}</span>`
          : '';
      return `<a href="${esc(href)}" class="week-lane ${check ? 'week-check' : ''}" style="grid-column:${first + 1}/${last + 2};grid-row:${row + 1};--lane-color:${color};background:${check ? '#00aa72' : color + '1f'}" title="${esc(accessible)}" aria-label="${esc(accessible)}">${check ? icon('check', 14) : '<i></i>'}<span class="truncate">${esc(label)}</span>${continuation}</a>`;
    })
    .join('');
}

function dayTasks(date: string, records: Experiment[]) {
  const { esc } = window.App;
  const links: string[] = [];
  for (const record of records) {
    if (record.status === 'COMPLETED') continue;
    const stages = [];
    if (record.startDate === date && record.endDate === date) stages.push('시작·마무리');
    else if (record.startDate === date) stages.push('시작');
    else if (record.endDate === date) stages.push('마무리');
    else if (record.startDate < date && record.endDate > date) stages.push('진행');
    if (record.checkDate === date) stages.push('결과 확인');
    for (const stage of stages) {
      const href = recordUrl(
        stage === '결과 확인' && record.status === 'READY' ? 'result' : 'record',
        record.id,
      );
      links.push(`<li><a href="${esc(href)}">${stage} · ${esc(record.title)}</a></li>`);
    }
  }
  if (!links.length) return '할 일 없음';
  const extra =
    links.length > 1
      ? `<details><summary>${links.length - 1}개 더 보기</summary><ul>${links.slice(1).join('')}</ul></details>`
      : '';
  return `<ul>${links[0]}</ul>${extra}`;
}

export function mountHomeWeek(section: HTMLElement, data: AppData, signal: AbortSignal) {
  const { icon } = window.App;
  const today = data.overview.today;
  const upcoming = upcomingDates(today);
  const sunday = addDays(today, -asDate(today).getUTCDay());
  const current = Array.from({ length: 7 }, (_, i) => addDays(sunday, i));
  let dates = current;
  type SalesState = Map<string, number | null> | 'loading' | 'failed';
  let actualSales: SalesState = 'loading';
  let forecastSales: SalesState | undefined;
  let weather: Map<string, DailyWeather> | undefined;
  let weatherFailed = false;
  section.dataset.weekSummary = '';
  section.classList.add('week-summary');
  const heading = section.querySelector<HTMLElement>('#h-week')!;
  const range = heading.nextElementSibling!;
  const calendar = section.querySelector<HTMLAnchorElement>('a[href="calendar.html"]')!;
  calendar.innerHTML = `달력 보기 ${icon('chevron-right', 16)}`;
  const switcher = document.createElement('button');
  switcher.type = 'button';
  switcher.className = 'btn btn-sm btn-neutral';
  const options = document.createElement('div');
  options.className = 'week-options';
  calendar.before(options);
  options.append(switcher, calendar);
  const grid = section.querySelector<HTMLElement>('[data-week-head]')!.parentElement!;
  const head = grid.querySelector<HTMLElement>('[data-week-head]')!;
  const columns = grid.querySelector<HTMLElement>('[data-week-cols]')!;
  const lanes = grid.querySelector<HTMLElement>('[data-week-lanes]')!;
  grid.className = 'relative week-days';
  grid.id = 'week-days';
  const scroller = document.createElement('div');
  scroller.className = 'week-scroll';
  scroller.setAttribute('role', 'region');
  scroller.setAttribute('aria-label', '날짜별 매출, 날씨와 할 일');
  grid.before(scroller);
  scroller.append(grid);
  const toolbar = document.createElement('div');
  toolbar.className = 'week-tools';
  toolbar.innerHTML = `<p data-week-total></p>
    <div class="week-arrows" hidden><button class="icon-btn" type="button" aria-label="이전 날짜" aria-controls="week-days">${icon('chevron-left', 16)}</button><button class="icon-btn" type="button" aria-label="다음 날짜" aria-controls="week-days">${icon('chevron-right', 16)}</button></div>`;
  scroller.before(toolbar);
  const total = toolbar.querySelector<HTMLElement>('[data-week-total]')!;
  const arrows = toolbar.querySelector<HTMLElement>('.week-arrows')!;
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
      left: (direction * head.clientWidth) / 7,
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
  }
  back.onclick = () => move(-1);
  next.onclick = () => move(1);
  scroller.addEventListener('scroll', updateArrows, { passive: true, signal });
  const observer = new ResizeObserver(updateArrows);
  observer.observe(scroller);
  signal.addEventListener('abort', () => observer.disconnect(), { once: true });

  function readings() {
    const isCurrent = dates === current;
    const sales = isCurrent ? actualSales : forecastSales;
    let sum = 0,
      count = 0;
    for (const cell of head.querySelectorAll<HTMLElement>('[data-week-date]')) {
      const date = cell.dataset.weekDate!;
      const value = sales instanceof Map ? sales.get(date) : undefined;
      const target = cell.querySelector<HTMLElement>('[data-week-sales]')!;
      target.classList.toggle('week-amount', value != null);
      if (value != null) {
        sum += value;
        count++;
      }
      if (value != null) target.textContent = amount.format(value) + '원';
      else if (isCurrent && date > today) target.textContent = '집계 전';
      else if (sales === 'failed') target.textContent = '조회 실패';
      else if (sales instanceof Map)
        target.textContent = isCurrent ? '매출 자료 없음' : '예측 자료 없음';
      else target.textContent = '조회 중';
      const day = weather?.get(date);
      const label = weatherLabel(day);
      const wx = cell.querySelector<HTMLElement>('[data-week-weather]')!;
      wx.textContent =
        label || (weatherFailed ? '조회 실패' : weather ? '날씨 자료 없음' : '조회 중');
      wx.title = weatherTitle(day);
      const weatherMark = cell.querySelector<HTMLElement>('[data-weather-icon]')!;
      weatherMark.innerHTML = weatherIcon(day);
      weatherMark.title = wx.title;
    }
    if (isCurrent && count > 0) {
      total.innerHTML = `이번 주 매출 · ${count}일 집계 <strong>${amount.format(sum)}원</strong>`;
    } else {
      total.innerHTML =
        count === 7 ? `7일 예상 매출 합계 <strong>${amount.format(sum)}원</strong>` : '';
    }
  }
  function render() {
    heading.textContent = dates === upcoming ? '다음 7일' : '이번 주';
    switcher.textContent = dates === upcoming ? '이번 주 보기' : '다음 7일 보기';
    range.textContent = formatDate(dates[0], true) + ' ~ ' + formatDate(dates[6], true);
    columns.innerHTML = dates
      .map(
        (date, i) =>
          `<span class="${i ? 'border-l border-line-light' : ''} ${date === today ? 'rounded-xl bg-brand-weak/60' : ''}"></span>`,
      )
      .join('');
    head.innerHTML = dates
      .map((date) => {
        const value = asDate(date);
        return `<div class="week-day" data-week-date="${date}"><div class="flex items-center justify-between">
        <time datetime="${date}" aria-label="${formatDate(date, true)}" ${date === today ? 'aria-current="date"' : ''}><b>${value.getUTCDate()}</b> ${weekday.format(value)}</time><span class="text-dim" aria-hidden="true" data-weather-icon></span></div>
        <dl><dt>${dates === current ? '매출' : '예상 매출'}</dt><dd data-week-sales></dd><dt>날씨</dt><dd data-week-weather></dd><dt class="sr-only">할 일</dt><dd class="week-tasks" data-week-tasks>${dayTasks(date, data.experiments)}</dd></dl></div>`;
      })
      .join('');
    lanes.innerHTML = weekLanes(data.experiments, dates);
    readings();
    updateArrows();
  }
  switcher.onclick = () => {
    dates = dates === upcoming ? current : upcoming;
    if (dates === upcoming && (forecastSales === undefined || forecastSales === 'failed')) {
      forecastSales = 'loading';
      void loadWeekSales(upcoming, signal)
        .then((rows) => {
          if (signal.aborted) return;
          forecastSales = new Map(rows.map((row) => [row.date, row.expected]));
          readings();
        })
        .catch(() => {
          if (signal.aborted) return;
          forecastSales = 'failed';
          readings();
        });
    }
    scroller.scrollLeft = 0;
    render();
  };
  render();
  void loadActualSales(current[0], today, signal)
    .then((rows) => {
      if (signal.aborted) return;
      actualSales = rows;
      readings();
    })
    .catch(() => {
      if (!signal.aborted) {
        actualSales = 'failed';
        readings();
      }
    });
  void loadWeather(current[0], upcoming[6], signal)
    .then((rows) => {
      if (signal.aborted) return;
      weather = new Map(rows.map((row) => [row.date, row]));
      readings();
    })
    .catch(() => {
      if (!signal.aborted) {
        weatherFailed = true;
        readings();
      }
    });
}
