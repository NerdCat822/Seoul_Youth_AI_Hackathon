import { formatDate } from '../lib/dates';
import { actions } from '../lib/labels';
import type { AppData, Experiment } from '../types';
import { daysBetween, el, notice, recordDestination, recordUrl, ui } from './record-ui';
import { mountCalendar } from './record-calendar';
import { mountConfirmation, mountReport } from './record-reports';
import { navigateTo } from './screen-router';

const keyByStatus = {
  READY: 'check',
  IN_PROGRESS: 'progress',
  PLANNED: 'planned',
  COMPLETED: 'done',
} as const;
const labels = {
  all: '전체',
  check: '확인 필요',
  progress: '진행 중',
  planned: '시작 예정',
  data: '자료 확인 필요',
  done: '완료',
  stopped: '중단',
};
type Status = keyof typeof labels;

function badge(record: Experiment) {
  const key = keyByStatus[record.status];
  return `<span class="badge badge-${key}">${labels[key]}</span>`;
}
function targetName(record: Experiment, data: AppData) {
  return data.menus.find((m) => m.menuCode === record.targetMenuCode)?.menuName || '비교 메뉴 선택';
}

function recordCard(r: Experiment, data: AppData) {
  const { esc, icon } = ui();
  const today = data.overview.today;
  const days = Math.max(1, daysBetween(r.startDate, r.endDate) + 1);
  const progress = Math.min(
    100,
    Math.max(0, Math.round(((daysBetween(r.startDate, today) + 1) * 100) / days)),
  );
  const hot = r.status === 'READY';
  const linkLabel = hot ? '결과 확인하기' : r.status === 'COMPLETED' ? '결과 보기' : '기록 보기';
  const note = {
    READY: '전후 판매 자료를 비교할 수 있어요.',
    IN_PROGRESS: `결과 확인까지 ${Math.max(0, daysBetween(today, r.checkDate))}일 남았어요.`,
    COMPLETED: '기록의 비교 결과를 확인해 보세요.',
    PLANNED: formatDate(r.startDate) + '에 시작해요.',
  }[r.status];
  const fields = [
    ['시작일', formatDate(r.startDate)],
    ['종료일', formatDate(r.endDate)],
    ['결과 확인일', formatDate(r.checkDate)],
    ['비교 항목', targetName(r, data)],
  ];
  return `<a href="${esc(recordDestination(r))}" class="flex min-w-0 flex-col rounded-card bg-white p-5 transition-shadow hover:shadow-panel ${hot ? 'border-2 border-brand/60 shadow-panel' : 'border border-line-light'}">
    <div class="flex items-start justify-between gap-3"><h2 class="text-[18px] font-semibold leading-7">${esc(r.title)}</h2><span class="flex-none">${badge(r)}</span></div>
    <dl class="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">${fields.map(([label, value]) => `<div class="min-w-0"><dt class="text-[13px] text-sub">${label}</dt><dd class="mt-1 truncate text-sm font-medium text-body" title="${esc(value)}">${esc(value)}</dd></div>`).join('')}</dl>
    <div class="mt-4 h-1.5 overflow-hidden rounded-full bg-surface" role="progressbar" aria-label="진행률" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100"><div class="h-full rounded-full bg-brand" style="width:${progress}%"></div></div>
    <div class="mt-auto flex items-center justify-between gap-3 pt-4 text-sm"><p class="${hot ? 'text-danger' : 'text-sub'}">${esc(note)}</p><span class="inline-flex flex-none items-center font-semibold text-brand-text">${linkLabel} ${icon('chevron-right', 16)}</span></div></a>`;
}

function records(data: AppData) {
  const { esc } = ui();
  const columns = Array.from(el('[data-table]').querySelectorAll('th')).slice(2);
  const params = new URLSearchParams(location.search);
  const filter = params.get('status');
  let current: Status = filter && Object.hasOwn(labels, filter) ? (filter as Status) : 'all';
  let preference: string | null = params.get('view');
  if (!preference) {
    try {
      preference = localStorage.getItem('trylog.recordsView');
    } catch {
      /* Storage may be unavailable in private browsing. */
    }
  }
  let view = preference === 'card' ? 'card' : 'list';
  const render = () => {
    const filtered = data.experiments.filter(
      (r) => current === 'all' || keyByStatus[r.status] === current,
    );
    el('[data-status-tabs]').innerHTML = Object.entries(labels)
      .map(([code, name]) => {
        const count =
          code === 'all'
            ? data.experiments.length
            : data.experiments.filter((r) => keyByStatus[r.status] === code).length;
        return `<button type="button" role="tab" class="filter-tab" aria-selected="${current === code}" data-s="${code}">${name} <span class="count">${count}</span></button>`;
      })
      .join('');
    el('[data-table] tbody').innerHTML = filtered
      .map(
        (r) => `<tr tabindex="0" data-href="${esc(recordDestination(r))}">
      <td class="text-[15px] font-semibold text-heading">${esc(r.title)}</td><td>${badge(r)}</td>
      ${[
        formatDate(r.startDate),
        formatDate(r.endDate),
        formatDate(r.checkDate),
        targetName(r, data),
      ]
        .map(
          (value, index) =>
            `<td><span class="record-field-label" aria-hidden="true">${esc(columns[index].textContent)}</span>${esc(value)}</td>`,
        )
        .join('')}</tr>`,
      )
      .join('');
    el('[data-cards]').innerHTML = filtered.map((r) => recordCard(r, data)).join('');
    el('[data-table]').parentElement!.hidden = !filtered.length || view !== 'list';
    el('[data-cards]').hidden = !filtered.length || view !== 'card';
    el('[data-empty]').hidden = !!filtered.length;
    for (const button of document.querySelectorAll<HTMLButtonElement>('[data-view]')) {
      button.setAttribute('aria-pressed', String(button.dataset.view === view));
    }
    if (current === 'all') params.delete('status');
    else params.set('status', current);
    if (view === 'list') params.delete('view');
    else params.set('view', view);
    history.replaceState(history.state, '', 'records.html' + (params.size ? '?' + params : ''));
  };
  el('[data-view-toggle]').onclick = (event) => {
    const selected = (event.target as HTMLElement).closest<HTMLElement>('[data-view]')?.dataset
      .view;
    if (selected !== 'card' && selected !== 'list') return;
    view = selected;
    try {
      localStorage.setItem('trylog.recordsView', selected);
    } catch {
      /* The current selection still works without storage. */
    }
    render();
  };
  el('[data-status-tabs]').onclick = (event) => {
    const code = (event.target as HTMLElement).closest<HTMLElement>('[data-s]')?.dataset.s;
    if (code && Object.hasOwn(labels, code)) {
      current = code as Status;
      render();
      el(`[data-s="${code}"]`).focus();
    }
  };
  const open = (event: Event) => {
    const url = (event.target as HTMLElement).closest<HTMLElement>('tr[data-href]')?.dataset.href;
    if (url) navigateTo(url);
  };
  el('[data-table]').onclick = open;
  el('[data-table]').onkeydown = (event) => {
    if (event.key === 'Enter') open(event);
  };
  render();
}

function detail(r: Experiment, data: AppData) {
  const { esc, icon, toast } = ui();
  document.title = r.title + ' · trylog';
  el('[data-title]').textContent = r.title;
  el('[data-badge]').innerHTML = badge(r);
  const start = formatDate(r.startDate),
    end = formatDate(r.endDate),
    check = formatDate(r.checkDate);
  el('[data-started]').textContent = start + ' 기록 시작';
  el<HTMLAnchorElement>('[data-edit-link]').href = recordUrl('record-edit', r.id);
  const hot = r.status === 'READY' || r.status === 'COMPLETED';
  const hero = el('[data-hero]');
  hero.classList.add(
    ...(hot
      ? ['border-brand/60', 'bg-gradient-to-br', 'from-[#fffff4]', 'via-[#edfbe2]', 'to-[#e6fbfa]']
      : ['border-line-light', 'bg-white']),
  );
  const headers = {
    READY: ['결과를 확인할 수 있어요', '변경 전후 메뉴별 판매 자료를 준비해 결과를 확인해 보세요.'],
    COMPLETED: ['결과 확인을 마쳤어요', '시도 결과와 다음에 해볼 일을 확인해 보세요.'],
    IN_PROGRESS: [
      `결과 확인일까지 ${daysBetween(data.overview.today, r.checkDate)}일 남았어요`,
      `${end}까지 지금처럼 운영해 주세요. ${check}에 결과를 확인할 수 있어요.`,
    ],
    PLANNED: [start + '에 시작해요', '시작일 전에 바꾸기 전 판매 자료를 미리 준비해 주세요.'],
  };
  const [title, body] = headers[r.status];
  hero.innerHTML = `<div><h2 class="section-title-lg">${esc(title)}</h2><p class="mt-2 text-sm text-body">${esc(body)}</p></div><div class="flex flex-none gap-2">
    ${r.status !== 'COMPLETED' ? '<button type="button" class="btn btn-lg btn-neutral" data-change-date>결과 확인일 변경</button>' : ''}
    ${hot ? `<a class="btn btn-lg btn-primary" href="${esc(recordUrl(r.status === 'READY' ? 'upload' : 'result', r.id))}">${r.status === 'READY' ? '결과 확인하기' : '결과 보기'} ${icon('chevron-right', 18)}</a>` : ''}</div>`;
  const rows = [
    ['pencil', '변경 내용', r.notes || actions[r.actionType] || r.title],
    ['calendar', '진행 기간', start + ' ~ ' + end],
    ['calendar-check', '결과 확인일', check],
    ['file-list', '비교 항목', targetName(r, data)],
    ['inbox', '필요한 자료', '메뉴별 주문 내역'],
    ['lightbulb', '연결된 사례', '—'],
  ];
  el('[data-kv]').innerHTML = rows
    .map(
      ([ic, key, value]) =>
        `<div class="flex gap-3 py-4"><span class="mt-0.5 text-dim">${icon(ic, 18)}</span><dt class="w-[88px] flex-none text-[15px] font-semibold">${key}</dt><dd class="text-[15px] font-medium">${esc(value)}</dd></div>`,
    )
    .join('');
  const steps = [
    ['기록 시작', start],
    ['가게에서 운영', start + ' ~ ' + end],
    ['결과 확인', check],
    ['다음에 해볼 일', '결과 확인 후'],
  ];
  const active = { PLANNED: 0, IN_PROGRESS: 1, READY: 2, COMPLETED: 3 }[r.status];
  el('[data-timeline]').innerHTML = steps
    .map(
      ([t, s], n) => `<li class="relative flex gap-3 pb-6 last:pb-0">
    ${n < 3 ? `<span class="absolute left-[7px] top-5 h-[calc(100%-12px)] w-px ${n < active ? 'bg-brand/40' : 'bg-line'}"></span>` : ''}
    <span class="relative mt-1 flex h-[15px] w-[15px] flex-none items-center justify-center rounded-full ${n < active ? 'bg-brand text-white' : n === active ? 'border-2 border-brand bg-white' : 'border-2 border-line bg-white'}">${n < active ? icon('check', 11) : ''}</span>
    <div><p class="text-[15px] ${n === active ? 'font-semibold text-brand-strong' : n < active ? 'font-medium' : 'font-medium text-muted'}">${t}</p><p class="mt-0.5 text-[13px] font-medium text-sub">${s}</p></div></li>`,
    )
    .join('');
  document.querySelector<HTMLElement>('[data-change-date]')?.addEventListener('click', () =>
    ui().openModal({
      title: '결과 확인일 변경',
      confirm: '변경하기',
      body: `<p>결과 확인일 변경은 아직 지원하지 않아요.</p><input type="date" class="input mt-4 text-heading" aria-label="결과 확인일" value="${esc(r.checkDate)}" disabled>`,
      onConfirm: () => toast('결과 확인일 변경은 아직 지원하지 않아요.'),
    }),
  );
  el('[data-delete]').onclick = () =>
    ui().openModal({
      title: '기록을 삭제할까요?',
      body: '기록 삭제는 아직 지원하지 않아요.',
      confirm: '삭제하기',
      tone: 'danger',
      onConfirm: () => toast('기록 삭제는 아직 지원하지 않아요.'),
    });
  el('[data-stop]').onclick = () =>
    ui().openModal({
      title: '기록을 중단할까요?',
      body: '기록 중단은 아직 지원하지 않아요.',
      confirm: '중단하기',
      onConfirm: () => toast('기록 중단은 아직 지원하지 않아요.'),
    });
}

function edit(r: Experiment, data: AppData) {
  const { toast } = ui();
  el<HTMLInputElement>('#f-title').value = r.title;
  const notes = el<HTMLTextAreaElement>('#f-change');
  notes.value = r.notes;
  const count = () => {
    el('[data-count]').textContent = String(notes.value.length);
  };
  notes.oninput = count;
  count();
  el<HTMLInputElement>('#f-start').value = r.startDate;
  el<HTMLInputElement>('#f-end').value = r.endDate;
  el<HTMLInputElement>('#f-result').value = r.checkDate;
  el<HTMLAnchorElement>('[data-cancel]').href = recordUrl('record', r.id);
  el('[data-file]').remove();
  el('[data-compare] button').textContent =
    (data.menus.find((menu) => menu.menuCode === r.targetMenuCode)?.menuName || '메뉴') +
    ' 주문 건수';
  const pending = el('[data-date-error]');
  pending.textContent = '기록 수정과 첨부 파일 저장은 아직 지원하지 않아요.';
  pending.hidden = false;
  el<HTMLFormElement>('[data-form]').onsubmit = (event) => {
    event.preventDefault();
    toast(pending.textContent || '수정 사항을 저장할 수 없어요.');
  };
  el<HTMLInputElement>('[data-add-file]').onchange = (event) => {
    (event.target as HTMLInputElement).value = '';
    toast('기록에 첨부 파일을 저장하는 기능은 아직 지원하지 않아요.');
  };
  el('[data-compare]').addEventListener('chipchange', () => {
    el('[data-custom-input]').hidden = el('[data-custom]').getAttribute('aria-pressed') !== 'true';
  });
}

export async function mountRecords(page: string, data: AppData, signal: AbortSignal) {
  if (page === 'records') return records(data);
  if (page === 'calendar') return mountCalendar(data, signal);
  const id = new URLSearchParams(location.search).get('id');
  const record = data.experiments.find((r) => r.id === id);
  if (page === 'confirm') return mountConfirmation(record);
  if (!id) {
    if (!data.experiments.length)
      return notice('아직 작성한 기록이 없어요.', 'ai.html?start=record', '새 기록 시작');
    const { esc } = ui();
    const action = (
      {
        record: '기록 상세 보기',
        'record-edit': '기록 수정',
        result: '비교 결과 보기',
        upload: '판매 자료 선택',
      } as Record<string, string>
    )[page];
    el('main').innerHTML =
      `<section class="mx-auto w-[840px] max-w-full"><h1 class="page-title">${esc(action)}</h1>
      <form class="card-strong mt-8 p-5"><label for="choose-record" class="label">내 기록</label><select id="choose-record" class="input mt-2" required>
      <option value="">기록을 선택해 주세요</option>${data.experiments.map((item) => `<option value="${esc(item.id)}">${esc(item.title)}</option>`).join('')}</select>
      <button class="btn btn-lg btn-primary mt-5" type="submit">${esc(action)}</button></form></section>`;
    el<HTMLFormElement>('main form').onsubmit = (event) => {
      event.preventDefault();
      const selected = el<HTMLSelectElement>('#choose-record').value;
      if (data.experiments.some((item) => item.id === selected))
        navigateTo(recordUrl(page, selected));
    };
    return;
  }
  if (!record) return notice('이 기록을 찾을 수 없어요. 내 기록에서 다시 선택해 주세요.');
  if (page === 'record') return detail(record, data);
  if (page === 'record-edit') return edit(record, data);
  await mountReport(page, record, data, signal);
}
