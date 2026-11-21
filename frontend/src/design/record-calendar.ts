import { addDays, asDate, formatDate, formatMonth, shiftMonth } from '../lib/dates';
import type { AppData } from '../types';
import { loadActualSales } from './daily-sales';
import { loadWeekSales, upcomingDates } from './home-week';
import { daysBetween, el, recordDestination, ui } from './record-ui';
import { loadWeather, weatherIcon, weatherTitle, type DailyWeather } from './weather';

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
  let actuals: Map<string, number> | undefined;
  let actualsFailed = false;
  let monthRequest: AbortController | undefined;
  el('[data-weekdays]').innerHTML = [...'일월화수목금토']
    .map((d) => `<span class="px-3 py-3">${d}</span>`)
    .join('');

  function showReadings() {
    for (const cell of grid.querySelectorAll<HTMLElement>('[data-weather-date]')) {
      const day = weather.get(cell.dataset.weatherDate!);
      const label = weatherTitle(day);
      cell.title = label;
      if (label) cell.setAttribute('aria-label', label);
      else cell.removeAttribute('aria-label');
      cell.innerHTML = weatherIcon(day);
      if (day && label) {
        if (day.averageTempC != null && Number.isFinite(day.averageTempC))
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
      const date = cell.dataset.salesDate!;
      const historical = date <= today;
      const value = historical ? actuals?.get(date) : forecasts.get(date);
      const label = historical ? '매출' : '예상 매출';
      if (value != null) {
        cell.innerHTML = `<span class="text-sub">${label}</span><span class="font-semibold text-brand-strong">${won.format(value)}원</span>`;
        cell.title = label + ' ' + won.format(value) + '원';
      } else {
        let status = label + ' 자료 없음';
        if (historical && actualsFailed) status = '매출 조회 실패';
        else if (historical && !actuals) status = '매출 조회 중';
        cell.innerHTML = `<span class="text-muted">${historical && !actuals ? status : '—'}</span>`;
        cell.title = status;
      }
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
        <span class="inline-flex items-center gap-1 text-[13px] text-sub" data-weather-date="${date}"></span></div>`,
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
    monthRequest?.abort();
    monthRequest = new AbortController();
    const requestSignal = AbortSignal.any([signal, monthRequest.signal]);
    const end = addDays(start, weeks * 7 - 1);
    actuals = undefined;
    actualsFailed = false;
    weather.clear();
    showReadings();
    if (start <= today) {
      void loadActualSales(start, end < today ? end : today, requestSignal)
        .then((rows) => {
          if (requestSignal.aborted) return;
          actuals = rows;
          showReadings();
        })
        .catch(() => {
          if (requestSignal.aborted) return;
          actualsFailed = true;
          showReadings();
        });
    }
    void loadWeather(start, end, requestSignal)
      .then((rows) => {
        if (requestSignal.aborted) return;
        for (const row of rows) weather.set(row.date, row);
        showReadings();
      })
      .catch(() => {
        // Weather is optional. Sales and records can still be shown for this month.
      });
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
  void loadWeekSales(upcomingDates(today), signal)
    .then((rows) => {
      if (signal.aborted) return;
      for (const row of rows) forecasts.set(row.date, row.expected);
      showReadings();
    })
    .catch(() => {});
}
