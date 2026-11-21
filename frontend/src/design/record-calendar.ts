import { request } from '../api';
import { addDays, asDate, formatDate, formatMonth, shiftMonth } from '../lib/dates';
import type { AppData } from '../types';
import { loadWeekSales, upcomingDates, weatherLabel, type DailyWeather } from './home-week';
import { daysBetween, el, recordDestination, ui } from './record-ui';

const colors = ['#155dfc', '#00a2b8', '#8e51ff', '#e17100', '#00a63e', '#6a7282'];
const won = new Intl.NumberFormat('ko-KR');

export function mountCalendar(data: AppData, signal: AbortSignal) {
  const { esc, icon } = ui();
  const today = data.overview.today;
  let month = today.slice(0, 7);
  const select = el<HTMLSelectElement>('[data-month]');
  const grid = el('[data-grid]');
  const scroller = grid.closest<HTMLElement>('.overflow-x-auto')!;
  scroller.tabIndex = 0;
  scroller.setAttribute('role', 'region');
  scroller.setAttribute('aria-label', '월별 달력');
  const agenda = document.createElement('section');
  agenda.className = 'calendar-agenda';
  scroller.after(agenda);
  const weather = new Map<string, DailyWeather>();
  const forecasts = new Map<string, number | null>();
  el('[data-weekdays]').innerHTML = [...'일월화수목금토']
    .map((d) => `<span class="px-3 py-3">${d}</span>`)
    .join('');

  function showReadings() {
    for (const cell of grid.querySelectorAll<HTMLElement>('[data-weather-date]')) {
      const day = weather.get(cell.dataset.weatherDate!);
      const label = weatherLabel(day);
      cell.title = label.replaceAll('\n', ', ');
      cell.setAttribute('aria-label', label);
      cell.innerHTML = '';
      if (day && label) {
        if (day.precipitationMm != null && day.precipitationMm > 0)
          cell.innerHTML = icon('rain', 16);
        if (day.averageTempC != null)
          cell.append(
            document.createTextNode(
              `${day.averageTempC.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}°`,
            ),
          );
        else if (day.precipitationMm != null)
          cell.append(document.createTextNode(won.format(day.precipitationMm) + 'mm'));
      }
    }
    for (const cell of grid.querySelectorAll<HTMLElement>('[data-sales-date]')) {
      const value = forecasts.get(cell.dataset.salesDate!);
      cell.innerHTML =
        value == null
          ? '<span class="text-muted">—</span>'
          : `<span class="text-sub">예상</span><span class="font-semibold text-brand-strong">${won.format(value)}원</span>`;
      cell.title = value == null ? '일별 매출 자료 없음' : '예상 매출 ' + won.format(value) + '원';
    }
  }

  function render() {
    // Center the range again after navigation so earlier and later years remain reachable.
    const months = new Set(Array.from({ length: 25 }, (_, i) => shiftMonth(month, i - 12)));
    months.add(today.slice(0, 7));
    for (const r of data.experiments) {
      for (const date of [r.startDate, r.endDate, r.checkDate]) months.add(date.slice(0, 7));
    }
    select.innerHTML = [...months]
      .sort()
      .map((m) => `<option value="${esc(m)}">${esc(formatMonth(m))}</option>`)
      .join('');
    select.value = month;
    const first = month + '-01';
    const last = addDays(shiftMonth(month, 1) + '-01', -1);
    const start = addDays(first, -asDate(first).getUTCDay());
    const weeks = Math.ceil((daysBetween(start, last) + 1) / 7);
    const sections: string[] = [];
    for (let w = 0; w < weeks; w++) {
      const dates = Array.from({ length: 7 }, (_, i) => addDays(start, w * 7 + i));
      const cellClass = (date: string, i: number) =>
        [
          i ? 'border-l border-line-light' : '',
          date.startsWith(month) ? '' : 'bg-surface-2/60',
        ].join(' ');
      const head = dates
        .map(
          (
            date,
            i,
          ) => `<div class="flex items-center justify-between px-3 pt-2.5 ${cellClass(date, i)}">
        <time datetime="${date}" aria-label="${esc(formatDate(date, true))}" ${date === today ? 'aria-current="date"' : ''} class="inline-flex h-7 min-w-[28px] items-center justify-center rounded-full px-1 text-[13px] font-medium ${date === today ? 'bg-brand font-semibold text-white' : date.startsWith(month) ? 'text-body' : 'text-muted'}">${Number(date.slice(-2))}</time>
        <span class="inline-flex items-center text-[13px] text-sub" data-weather-date="${date}"></span></div>`,
        )
        .join('');
      const lanes: string[] = [];
      for (const [i, r] of data.experiments.entries()) {
        const color = colors[i % colors.length];
        const href = esc(recordDestination(r));
        if (r.startDate <= dates[6] && r.endDate >= dates[0]) {
          const from = Math.max(0, daysBetween(dates[0], r.startDate));
          const to = Math.min(6, daysBetween(dates[0], r.endDate));
          lanes.push(
            `<a href="${href}" title="${esc(r.title)} · ${r.startDate} ~ ${r.endDate}" class="mx-1 flex h-6 min-w-0 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-body hover:brightness-95" style="grid-column:${from + 1}/${to + 2};background:${color}14"><i class="h-1.5 w-1.5 flex-none rounded-full" style="background:${color}"></i><span class="truncate">${esc(r.title)}${r.startDate < dates[0] ? ' (이어짐)' : ''}</span></a>`,
          );
        }
        const check = dates.indexOf(r.checkDate);
        if (check >= 0)
          lanes.push(
            `<a href="${href}" class="mx-1 flex h-6 min-w-0 items-center gap-1 rounded-md px-2 text-[13px] font-semibold text-white hover:brightness-95" style="grid-column:${check + 1}/span 1;background:${color}" title="결과 확인 · ${esc(r.title)}">${icon('check', 14)}<span class="truncate">결과 확인 · ${esc(r.title)}</span></a>`,
          );
      }
      const back = dates.map((date, i) => `<span class="${cellClass(date, i)}"></span>`).join('');
      const foot = dates
        .map(
          (date, i) =>
            `<div class="flex items-center justify-between px-3 py-2 text-[13px] ${cellClass(date, i)}" data-sales-date="${date}"></div>`,
        )
        .join('');
      sections.push(`<div class="border-t border-line-light"><div class="grid grid-cols-7">${head}</div>
        <div class="relative min-h-[84px]"><div class="pointer-events-none absolute inset-0 grid grid-cols-7">${back}</div><div class="relative grid grid-cols-7 gap-y-1 py-2">${lanes.join('')}</div></div>
        <div class="grid grid-cols-7 border-t border-dashed border-line-light">${foot}</div></div>`);
    }
    grid.innerHTML = sections.join('');
    showReadings();
    const items = data.experiments.filter(
      (r) =>
        (r.startDate <= last && r.endDate >= first) ||
        (r.checkDate >= first && r.checkDate <= last),
    );
    agenda.hidden = items.length === 0;
    agenda.innerHTML = `<h2 class="section-title">${esc(formatMonth(month))} 기록</h2><ul>${items.map((r) => `<li><a href="${esc(recordDestination(r))}"><strong>${esc(r.title)}</strong><span>${formatDate(r.startDate)} ~ ${formatDate(r.endDate)} · 결과 확인 ${formatDate(r.checkDate)}</span></a></li>`).join('')}</ul>`;
  }
  select.onchange = () => {
    month = select.value;
    render();
  };
  el('[data-today]').onclick = () => {
    month = today.slice(0, 7);
    render();
  };
  render();
  void Promise.allSettled([
    loadWeekSales(upcomingDates(today), signal),
    request<DailyWeather[]>('/weather/week', { signal }),
  ]).then(([sales, forecast]) => {
    if (signal.aborted) return;
    if (sales.status === 'fulfilled')
      for (const d of sales.value) forecasts.set(d.date, d.expected);
    if (forecast.status === 'fulfilled') for (const d of forecast.value) weather.set(d.date, d);
    showReadings();
  });
}
