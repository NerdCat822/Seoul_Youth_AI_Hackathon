import { request } from '../api';
import { asDate, formatDate, formatMonth } from '../lib/dates';
import { difficulties } from '../lib/labels';
import type { Forecast } from '../pages/ForecastPage';
import type { AppData, Experiment, NeighborhoodCase } from '../types';
import { mountChat } from './chat';
import { loadWeekSales, mountHomeWeek, upcomingDates } from './home-week';

const categoryStyle = {
  MENU: { label: '메뉴·가격', tag: 'cat-menu', image: 'bg-cat-menu-img' },
  OPERATION: { label: '매장 운영', tag: 'cat-store', image: 'bg-cat-store-img' },
  MARKETING: { label: '배달·홍보', tag: 'cat-delivery', image: 'bg-cat-delivery-img' },
};
const dayColors = ['#155dfc', '#00b8db', '#ad46ff', '#f6339a'];
const number = new Intl.NumberFormat('ko-KR');
const won = (value: number) => number.format(value) + '원';
const lengthLabel = (days: number) => (days % 7 === 0 ? days / 7 + '주' : days + '일');
function el<T extends HTMLElement = HTMLElement>(selector: string, root: ParentNode = document): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error('화면을 열지 못했어요.');
  return found;
}
const text = (selector: string, value: string) => {
  el(selector).textContent = value;
};
const dayDiff = (a: string, b: string) =>
  Math.round((asDate(a).valueOf() - asDate(b).valueOf()) / 86400000);
const dateRange = (first: string, last: string) => `${formatDate(first)} ~ ${formatDate(last)}`;
const softNote = (message: string) => `<p class="text-sm text-sub">${window.App.esc(message)}</p>`;

function caseCard(item: NeighborhoodCase, compact = false) {
  const c = categoryStyle[item.category];
  const { esc } = window.App;
  return `<a href="idea.html?id=${encodeURIComponent(item.id)}" class="idea-card">
      ${compact ? '' : `<div class="thumb ${c.image}"></div>`}
      <div class="body"><span class="cat ${c.tag} self-start">${c.label}</span>
        <p class="mt-3 text-base font-semibold leading-6">${esc(item.title)}</p>
        <p class="text-sm leading-5 text-sub">${esc(item.summary)}</p>
        <p class="mt-1 text-[13px] font-medium text-sub">비용 ${won(item.cost)} · ${difficulties[item.difficulty]} · ${lengthLabel(item.durationDays)}${item.demo ? ' · 가상 사례' : ''}</p></div></a>`;
}

function activeCard(item: Experiment, data: AppData) {
  const { esc, icon } = window.App;
  const hot = item.status === 'READY';
  const today = data.overview.today;
  const daysLeft = dayDiff(item.checkDate, today);
  const menu = data.menus.find((m) => m.menuCode === item.targetMenuCode)?.menuName;
  const progress = Math.max(
    0,
    Math.min(
      100,
      ((dayDiff(today, item.startDate) + 1) /
        Math.max(1, dayDiff(item.endDate, item.startDate) + 1)) *
        100,
    ),
  );
  return `<a href="record.html?id=${encodeURIComponent(item.id)}" class="block rounded-card bg-white p-5 transition-shadow hover:shadow-panel ${hot ? 'border-2 border-brand/60 shadow-panel' : 'border border-line-light'}">
        <div class="flex items-center justify-between"><h3 class="text-[18px] font-semibold">${esc(item.title)}</h3><span class="badge ${hot ? 'badge-check' : 'badge-progress'}">${hot ? '확인 필요' : '진행 중'}</span></div>
        <dl class="mt-4 grid grid-cols-4 gap-4">
          <div><dt class="text-[13px] text-sub">시작일</dt><dd class="mt-1 text-sm font-medium text-body">${formatDate(item.startDate)}</dd></div>
          <div><dt class="text-[13px] text-sub">종료일</dt><dd class="mt-1 text-sm font-medium text-body">${formatDate(item.endDate)}</dd></div>
          <div><dt class="text-[13px] text-sub">결과 확인일</dt><dd class="mt-1 text-sm font-medium text-body">${formatDate(item.checkDate)}
            <span class="ml-1 text-[13px] font-semibold text-brand">${daysLeft === 0 ? '오늘' : daysLeft > 0 ? daysLeft + '일 뒤' : Math.abs(daysLeft) + '일 전'}</span></dd></div>
          <div><dt class="text-[13px] text-sub">비교 항목</dt><dd class="mt-1 truncate text-sm font-medium text-body">${esc(menu ?? '메뉴 미지정')}</dd></div>
        </dl>
        <div class="mt-4 h-1.5 overflow-hidden rounded-full bg-surface"><div class="h-full rounded-full bg-brand" style="width:${progress}%"></div></div>
        ${
          hot
            ? `<p class="mt-4 flex items-center justify-between text-[15px] font-medium text-danger">변경 전후 판매 자료를 비교해 보세요.
          <span class="inline-flex items-center text-sm font-semibold text-brand-text">결과 확인하기 ${icon('chevron-right', 16)}</span></p>`
            : ''
        }
      </a>`;
}

function miniCalendar(data: AppData) {
  const today = data.overview.today;
  const month = today.slice(0, 7);
  const first = asDate(month + '-01');
  const count = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const rows = data.experiments.filter(
    (r) => r.startDate <= month + '-' + count && r.endDate >= month + '-01',
  );
  const grid = el('[data-mini-cal]');
  const header = grid.closest('section')!;
  el('h2', header).textContent = formatMonth(month);
  grid.previousElementSibling!.innerHTML = Array.from(
    '일월화수목금토',
    (d) => `<span class="py-2">${d}</span>`,
  ).join('');
  let markup = '<span></span>'.repeat(first.getUTCDay());
  for (let day = 1; day <= count; day++) {
    const date = month + '-' + String(day).padStart(2, '0');
    const dots = rows
      .map((r, i) =>
        date >= r.startDate && date <= r.endDate
          ? `<i class="h-1 w-1 rounded-full" style="background:${dayColors[i % dayColors.length]}"></i>`
          : '',
      )
      .join('');
    markup += `<a href="calendar.html" class="flex h-12 flex-col items-center justify-center gap-1 rounded-xl hover:bg-surface-2" aria-label="${formatDate(date)}${date === today ? ' 오늘' : ''}"><span class="flex h-7 w-7 items-center justify-center rounded-full text-sm ${date === today ? 'bg-info font-bold text-white' : 'text-body'}">${day}</span><span class="flex h-1 gap-0.5">${dots}</span></a>`;
  }
  grid.innerHTML = markup;
  el('[data-mini-legend]').innerHTML = rows
    .map(
      (r, i) =>
        `<li class="flex items-center gap-2"><i class="h-2 w-2 rounded-full" style="background:${dayColors[i % dayColors.length]}"></i>${window.App.esc(r.title)} · ${dateRange(r.startDate, r.endDate)}</li>`,
    )
    .join('');
}

function home(data: AppData, signal: AbortSignal) {
  const { overview, experiments } = data;
  const title = el('main h1');
  title.parentElement!.parentElement!.classList.add('home-records-heading');
  const heading = document.createElement('h2');
  heading.className = 'section-title';
  heading.textContent = overview.storeName + ' 기록 현황';
  title.replaceWith(heading);
  mountHomeWeek(el('[data-fc-total]').closest('section')!, data, signal);
  const count = (status: Experiment['status']) =>
    experiments.filter((e) => e.status === status).length;
  text('[data-greet]', `결과를 확인할 기록이 ${count('READY')}건 있어요.`);
  const stats = [
    ['진행 중', count('IN_PROGRESS'), 'progress'],
    ['결과 확인 필요', count('READY'), 'check'],
    ['확인 완료', count('COMPLETED'), 'done'],
    ['전체 기록', experiments.length, 'all'],
  ];
  el('[data-summary]').innerHTML = stats
    .map(
      ([label, n, s], i) =>
        `<a href="records.html?status=${s}" class="group block ${i ? 'border-l border-line-light pl-8' : ''}"><p class="text-sm font-medium text-sub">${label}</p><p class="mt-2 text-2xl font-bold text-brand-strong group-hover:underline">${n}건</p></a>`,
    )
    .join('');
  const active = experiments.filter((e) => e.status === 'READY' || e.status === 'IN_PROGRESS');
  el('[data-active-records]').innerHTML =
    active.map((e) => activeCard(e, data)).join('') || softNote('진행 중인 기록이 없어요.');
  miniCalendar(data);
  el('[data-ideas]').innerHTML =
    data.cases
      .slice(0, 3)
      .map((i) => caseCard(i, true))
      .join('') || softNote('표시할 동네 사례가 없어요.');
}

function guest(data: AppData | null) {
  const entries = data?.cases ?? [];
  const none = data ? '표시할 사례가 없어요.' : '로그인하면 동네 사례를 확인할 수 있어요.';
  el('[data-today]').innerHTML =
    entries
      .filter((c) => c.difficulty === 'EASY')
      .slice(0, 3)
      .map((c) => caseCard(c))
      .join('') || softNote(none);
  el('[data-free]').innerHTML =
    entries
      .filter((c) => c.cost === 0)
      .slice(0, 3)
      .map((c) => caseCard(c))
      .join('') || softNote(none);
  text('main .mt-20 section:last-child p', data ? `동네 가게 사례 ${entries.length}가지` : none);
  const action = el<HTMLAnchorElement>('a[href="forecast.html?state=empty"]');
  action.href = 'forecast.html';
  action.innerHTML = `예상매출 보기 ${window.App.icon('chevron-right', 16)}`;
  if (data) {
    el<HTMLAnchorElement>('main a[href="signup.html"]').href = 'store.html';
    el('main a[href="store.html"]').textContent = '가게 정보 보기';
  }
}

function explore(data: AppData) {
  const list = data.cases;
  const tabs = [['all', '전체'], ...Object.entries(categoryStyle).map(([k, c]) => [k, c.label])];
  let current = 'all';
  let free = new URLSearchParams(location.search).get('free') === '1';
  const section = el('[data-rec-section]');
  el('h2', section).textContent = data.overview.storeName + '에 맞는 추천';
  el('p', section).textContent = '가게별 맞춤 추천은 아직 제공되지 않아요.';
  const controls = el('[data-cat-tabs]');
  const onlyFree = el('button[data-free]');
  function render() {
    const items = list.filter(
      (i) => (current === 'all' || i.category === current) && (!free || !i.cost),
    );
    controls.innerHTML = tabs
      .map(
        ([k, l]) =>
          `<button type="button" role="tab" class="filter-tab" aria-selected="${k === current}" data-cat="${k}">${l} <span class="count">${list.filter((i) => (k === 'all' || i.category === k) && (!free || !i.cost)).length}</span></button>`,
      )
      .join('');
    el('[data-all]').innerHTML = items.map((i) => caseCard(i)).join('');
    el('[data-empty]').hidden = items.length > 0;
    onlyFree.setAttribute('aria-pressed', String(free));
  }
  controls.addEventListener('click', (event) => {
    const tab = (event.target as Element).closest<HTMLElement>('[data-cat]');
    if (tab) {
      current = tab.dataset.cat!;
      render();
    }
  });
  onlyFree.addEventListener('click', () => {
    free = !free;
    render();
  });
  render();
}

function idea(data: AppData) {
  const id = new URLSearchParams(location.search).get('id');
  const item = id ? data.cases.find((i) => i.id === id) : data.cases[0];
  const link = el<HTMLAnchorElement>('[data-try]');
  if (!item) {
    text('[data-article]', '사례를 찾을 수 없어요.');
    el('[data-peers]').hidden = true;
    link.textContent = '전체 사례 보기';
    link.href = 'explore.html';
    return;
  }
  const { esc, icon } = window.App;
  const style = categoryStyle[item.category];
  const sections = (title: string, body: string) =>
    `<section class="mt-12"><h2 class="section-title-lg">${title}</h2><div class="mt-5">${body}</div></section>`;
  const meta = [
    ['inbox', '추가 비용', won(item.cost)],
    ['time', '준비 정도', difficulties[item.difficulty]],
    ['calendar', '진행 기간', lengthLabel(item.durationDays)],
  ];
  el('[data-article]').innerHTML =
    `<div class="flex items-center gap-2 text-sm font-medium text-body"><span class="cat ${style.tag}">${style.label}</span><span>${difficulties[item.difficulty]}</span><span class="text-dim">·</span><span>추가 비용 ${won(item.cost)}</span></div><h1 class="page-title mt-4">${esc(item.title)}</h1><p class="mt-3 text-[15px] leading-6 text-body">${esc(item.summary)}</p><dl class="mt-8 space-y-3">${meta.map(([ic, key, val]) => `<div class="flex items-center gap-3 text-[15px]"><span class="text-dim">${icon(ic, 18)}</span><dt class="w-16 font-semibold">${key}</dt><dd class="font-medium">${esc(val)}</dd></div>`).join('')}</dl>${sections('적용 방법', `<ol class="space-y-5"><li class="flex gap-3"><span class="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-brand-weak text-[13px] font-bold text-brand">1</span><p class="text-[15px] font-medium leading-6">${esc(item.tip)}</p></li></ol>`)}`;
  const segments: [string, number, string][] = [
    ['늘었음', item.improved, '#155dfc'],
    ['변화 없음', item.unchanged, '#00b8db'],
    ['줄었음', item.declined, '#ad46ff'],
    [
      '판단 어려움',
      Math.max(0, item.sampleSize - item.improved - item.unchanged - item.declined),
      '#f0b100',
    ],
  ];
  el('[data-peers]').innerHTML =
    `<h2 class="text-[18px] font-bold">비슷한 가게의 변화</h2><p class="mt-1 text-sm text-sub">${item.demo ? '가상 사례 · 시연용 자료예요.' : '이 사례에 연결된 가게 집계'}</p><p class="mt-5"><b class="text-2xl font-bold">${item.sampleSize}곳 중 ${item.improved}곳</b> <span class="ml-1 text-base text-body">개선됐어요</span></p><div class="mt-4 flex h-2 gap-1">${segments
      .filter(([, n]) => n)
      .map(
        ([, n, color]) =>
          `<span class="rounded-full" style="flex:${n};background:${color}"></span>`,
      )
      .join(
        '',
      )}</div><ul class="mt-4 space-y-2">${segments.map(([label, n, color]) => `<li class="flex items-center justify-between text-sm"><span class="flex items-center gap-2 text-body"><i class="h-1.5 w-1.5 rounded-full" style="background:${color}"></i>${label}</span><span class="font-medium">${n}곳</span></li>`).join('')}</ul><div class="divider my-5"></div><p class="text-sm leading-5 text-sub">가게마다 결과가 달라요.<br>늘어난 이유를 이 일 하나로 단정할 수는 없어요.</p>`;
  link.href = 'ai.html?idea=' + encodeURIComponent(item.id);
}

function statCards(stats: string[][]) {
  const { esc } = window.App;
  el('[data-stats]').innerHTML = stats
    .map(
      ([title, value, note]) =>
        `<div class="rounded-panel border border-line bg-white p-5"><p class="text-[13px] font-medium text-sub">${esc(title)}</p><p class="mt-2 text-[30px] font-bold leading-9">${esc(value)}</p><p class="mt-3 text-[13px] font-medium text-sub">${esc(note)}</p></div>`,
    )
    .join('');
}

type ChartDay = {
  date: string;
  expected: number | null;
  lower?: number | null;
  upper?: number | null;
};
type ForecastView = Partial<Pick<Forecast, 'status' | 'dataThrough' | 'model' | 'missingDates'>> & {
  days: ChartDay[];
};

function forecast(f: ForecastView) {
  const ready = f.status !== 'INSUFFICIENT_DATA' && f.days.length > 0;
  const empty = el('[data-state="empty"]');
  const filled = el('[data-state="ready"]');
  empty.hidden = ready;
  filled.hidden = !ready;
  for (const a of document.querySelectorAll<HTMLAnchorElement>('a[href="upload.html"]')) {
    a.addEventListener('click', (event) => {
      event.preventDefault();
      window.App.toast('가게 전체의 일별 매출을 등록하는 기능은 아직 제공되지 않아요.');
    });
  }
  const through = f.dataThrough ? formatDate(f.dataThrough) + '까지 저장한 판매 자료 기준' : '';
  if (!ready) {
    text('[data-sub]', through);
    el('[role="progressbar"]', empty).hidden = true;
    el('p.mt-3', empty).textContent = f.missingDates?.length
      ? '자료가 필요한 날짜 · ' + f.missingDates.map((d) => formatDate(d)).join(', ')
      : '전망에 필요한 일매출 이력이 부족해요.';
    el('ul', empty).lastElementChild!.textContent =
      '· 전망 계산에는 가게에 저장된 일매출을 사용해요.';
    return;
  }
  const days = f.days;
  const range = dateRange(days[0].date, days.at(-1)!.date);
  text('[data-sub]', [range, through].filter(Boolean).join(' · '));
  const known = days.filter((day): day is ChartDay & { expected: number } => day.expected !== null);
  const complete = known.length === 7;
  const peak = Math.max(1, ...known.map((day) => day.expected));
  el('[data-stats]').hidden = !complete;
  el('p.mt-8', filled).textContent = complete
    ? (f.model ?? '가게 판매 자료를 기준으로 계산한 전망이에요.')
    : `7일 중 ${known.length}일의 예상 매출 자료가 있어요.`;
  if (complete) {
    const total = known.reduce((sum, day) => sum + day.expected, 0);
    const top = known.reduce((best, day) => (day.expected > best.expected ? day : best));
    statCards([
      ['7일 합계', won(total), range],
      ['하루 평균', won(Math.round(total / days.length)), days.length + '일 평균'],
      ['가장 많은 날', formatDate(top.date, true), won(top.expected)],
    ]);
  }
  el('[data-bars]').innerHTML = days
    .map((d) => {
      const label = d.expected === null ? '예측 자료 없음' : won(d.expected);
      const title =
        d.lower != null && d.upper != null
          ? '참고 범위 ' + won(d.lower) + ' ~ ' + won(d.upper)
          : label;
      return `<div class="flex h-full flex-1 flex-col items-center justify-end gap-2 px-5" role="img" aria-label="${formatDate(d.date, true)} 예상 매출 ${label}" data-date="${formatDate(d.date, true)}" style="--sales-ratio:${((d.expected ?? 0) / peak) * 100}%" title="${title}"><span class="text-[13px] font-medium text-sub">${d.expected === null ? label : number.format(d.expected)}</span><div class="forecast-bar w-full max-w-[64px] rounded-t-md bg-brand"></div></div>`;
    })
    .join('');
  el('[data-xaxis]').innerHTML = days
    .map(
      (d) =>
        `<span class="flex-1 text-center text-[13px] font-medium text-sub">${formatDate(d.date, true)}</span>`,
    )
    .join('');
}

function baseline(f: Forecast, data: AppData) {
  const ret = el<HTMLAnchorElement>('a[href="result.html"]');
  const id = new URLSearchParams(location.search).get('id');
  ret.href = id ? 'result.html?id=' + encodeURIComponent(id) : 'forecast.html';
  if (!id) ret.textContent = '예상매출로 돌아가기';
  const history = f.historical;
  const record = id ? data.experiments.find((r) => r.id === id) : null;
  const matches =
    !id ||
    (record &&
      history &&
      record.startDate === history.startDate &&
      record.endDate === history.endDate);
  const box = el('[data-chart]').closest('section')!;
  el('h1').textContent = '과거 매출 기준선';
  text('main p.mt-8', '기준선과의 차이는 관찰값이며 시도 때문이라고 단정하지 않아요.');
  if (!history || !matches) {
    text('main p.mt-3', '이 기간의 매출 기준선 자료가 없어요.');
    box.hidden = true;
    return;
  }
  const { startDate, endDate, actual, expected, difference } = history;
  const range = dateRange(startDate, endDate);
  text('main p.mt-3', range + ' · 시도 기간 매출을 같은 기간의 기준선과 비교해요.');
  statCards([
    ['시도 기간 실제 매출', won(actual), range],
    ['같은 기간 기준선', won(expected), '시도 전 자료로 계산'],
    ['차이', (difference > 0 ? '+' : '') + won(difference), '시도 기간 관찰값'],
  ]);
  text(
    '[data-chart]',
    '이 기간의 일별 실제 매출과 기준선을 함께 조회하는 기능은 아직 제공되지 않아요.',
  );
}

export async function mountDashboard(page: string, data: AppData | null, signal: AbortSignal) {
  if (page === 'home-guest') {
    guest(data);
    await mountChat(el('[data-ai-host]'), true, data, signal);
  } else if (data) {
    switch (page) {
      case 'home':
        home(data, signal);
        await mountChat(el('[data-ai-host]'), true, data, signal);
        break;
      case 'explore':
        explore(data);
        break;
      case 'idea':
        idea(data);
        break;
      case 'forecast':
      case 'baseline': {
        if (
          page === 'forecast' &&
          new URLSearchParams(location.search).get('week') === 'upcoming'
        ) {
          const days = await loadWeekSales(upcomingDates(data.overview.today), signal);
          signal.throwIfAborted();
          forecast({ days });
          break;
        }
        const values = await request<Forecast>('/demo/forecast', { signal });
        signal.throwIfAborted();
        if (page === 'forecast') forecast(values);
        else baseline(values, data);
        break;
      }
    }
  }
  if (!signal.aborted) window.App.hydrateIcons();
}
