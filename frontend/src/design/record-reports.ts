import { API_BASE, ApiError, compareSales, getSession, request } from '../api';
import { addDays, formatDate } from '../lib/dates';
import type { AppData, Experiment, SalesReport } from '../types';
import { daysBetween, el, notice, recordUrl, ui } from './record-ui';
import { navigateTo } from './screen-router';

const fmt = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 });
const uploadResultKey = 'trylog.design.uploadResult';

function errorMessage(error: unknown) {
  if (error instanceof ApiError) return Object.values(error.fieldErrors).join(' ') || error.message;
  return error instanceof Error ? error.message : '판매 자료를 비교하지 못했어요.';
}

function period(start: string, end: string) {
  return formatDate(start) + ' ~ ' + formatDate(end);
}

function upload(r: Experiment, data: AppData, signal: AbortSignal) {
  const { esc, icon, toast } = ui();
  el('main h1 + p').textContent = r.title + ' · 결과 확인일 ' + formatDate(r.checkDate, true);
  const before = addDays(r.startDate, -14);
  const days = Math.min(14, daysBetween(r.startDate, r.endDate) + 1);
  const last = addDays(r.startDate, days - 1);
  const terms = Array.from(document.querySelectorAll<HTMLElement>('[data-step="1"] dd'));
  terms[0].innerHTML =
    esc(period(before, addDays(before, days - 1))) +
    ` <span class="text-sub">(${days}일)</span><span class="mt-1 block text-sm font-normal text-sub">변경 후와 같은 길이로 비교해요</span>`;
  terms[1].textContent = period(r.startDate, last) + ` (${days}일)`;
  terms[2].textContent =
    'base_date · receipt_id · store_id · menu2_cd · price · quantity · is_refunded';
  terms[3].textContent = '엑셀(XLSX) · CSV';
  el('[data-drop] p:nth-of-type(2)').textContent =
    'CSV 또는 XLSX 파일 하나를 올릴 수 있어요. (최대 5MB)';
  el<HTMLAnchorElement>('[data-step="1"] a.btn-ghost').href = recordUrl('record', r.id);
  const select = document.createElement('select');
  select.className = 'input mt-2';
  select.id = 'report-menu-code';
  select.innerHTML =
    '<option value="">비교할 메뉴를 선택해 주세요</option>' +
    data.menus
      .map((m) => `<option value="${esc(m.menuCode)}">${esc(m.menuName)}</option>`)
      .join('');
  const selected = new URLSearchParams(location.search).get('targetMenuCode') || r.targetMenuCode;
  if (data.menus.some((m) => m.menuCode === selected)) select.value = selected!;
  const controls = document.createElement('div');
  controls.className = 'mt-5';
  controls.innerHTML = '<label class="label text-sm" for="report-menu-code">비교 메뉴</label>';
  controls.append(select);
  const database = document.createElement('button');
  database.type = 'button';
  database.className = 'btn btn-lg btn-neutral mt-4';
  database.textContent = 'DB 주문으로 비교';
  controls.append(database);
  el('[data-drop]').before(controls);
  const message = document.createElement('p');
  message.className = 'field-error mt-3';
  message.setAttribute('role', 'status');
  el('[data-step="2"]').after(message);
  const chosenMenu = () => {
    if (!select.value) {
      message.textContent = '비교할 가게 메뉴를 선택해 주세요.';
      showStep(1);
      select.focus();
      return '';
    }
    return select.value;
  };
  database.onclick = () => {
    const menu = chosenMenu();
    if (menu) navigateTo(recordUrl('result', r.id, { source: 'db', targetMenuCode: menu }));
  };
  el('[data-sample]').onclick = () => {
    if (data.menus.length < 2) {
      message.textContent = '예시 주문을 만들려면 가게 메뉴가 두 개 이상 필요해요.';
      toast(message.textContent);
      return;
    }
    const menu = chosenMenu();
    if (!menu) return;
    location.assign(
      API_BASE +
        '/experiments/' +
        encodeURIComponent(r.id) +
        '/sample.csv?' +
        new URLSearchParams({ targetMenuCode: menu }),
    );
  };
  function how(source: string) {
    const steps = [
      source === 'app'
        ? '배달 앱 사장님 사이트에서 정산 → 주문 내역으로 이동해요.'
        : 'POS 관리자 화면에서 매출 → 메뉴별 매출로 이동해요. (기기마다 메뉴 이름이 다를 수 있어요)',
      `기간을 ${period(before, last)}로 설정해요.`,
      '샘플 양식과 같은 열로 CSV 또는 XLSX 파일을 올려 주세요.',
    ];
    el('[data-howto]').innerHTML = steps
      .map(
        (t, i) =>
          `<li class="flex gap-3"><span class="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-brand-weak text-[13px] font-semibold text-brand-text">${i + 1}</span><span class="text-[15px]">${esc(t)}</span></li>`,
      )
      .join('');
    document
      .querySelectorAll<HTMLElement>('[data-src-k]')
      .forEach((b) => b.setAttribute('aria-selected', String(b.dataset.srcK === source)));
  }
  el('[data-src]').onclick = (event) => {
    const tab = (event.target as HTMLElement).closest<HTMLElement>('[data-src-k]');
    if (tab) how(tab.dataset.srcK!);
  };
  how('pos');
  let file: File | null = null,
    busy = false;
  function showStep(n: number) {
    document
      .querySelectorAll<HTMLElement>('[data-step]')
      .forEach((s) => (s.hidden = Number(s.dataset.step) !== n));
    document.querySelectorAll<HTMLElement>('[data-stepn]').forEach((s) => {
      const i = Number(s.dataset.stepn);
      s.classList.toggle('is-current', i === n);
      s.classList.toggle('is-done', i < n);
      s.querySelector<HTMLElement>('.num')!.innerHTML = i < n ? icon('check', 14) : String(i);
    });
  }
  function choose(files: FileList | null) {
    if (!files?.length || busy) return;
    if (
      files.length !== 1 ||
      !/\.(csv|xlsx)$/i.test(files[0].name) ||
      !files[0].size ||
      files[0].size > 5 * 1024 * 1024
    ) {
      message.textContent = '5MB 이하의 CSV 또는 XLSX 파일 하나를 선택해 주세요.';
      return;
    }
    file = files[0];
    message.textContent = '';
    fileList();
    showStep(2);
  }
  function fileList() {
    el<HTMLButtonElement>('[data-next]').disabled = !file;
    el<HTMLButtonElement>('[data-show]').disabled = !file;
    el('[data-warn]').hidden = true;
    el('[data-files]').innerHTML = file
      ? `<li class="flex items-center gap-3 py-3.5"><span class="text-sub">${icon('file-excel', 20)}</span><span class="flex-1 truncate text-sm text-body">${esc(file.name)}</span><span class="text-[13px] font-medium text-brand">선택됨</span><button type="button" class="icon-btn h-7 w-7 text-sub" aria-label="선택한 파일 지우기" data-remove-upload>${icon('close', 16)}</button></li>`
      : '<li class="py-6 text-center text-sm text-sub">올린 파일이 없어요.</li>';
    el('[data-checks]').innerHTML = file
      ? '<li class="flex items-start gap-3 py-4"><span class="text-[15px] font-medium text-body">결과 보기를 누르면 변경 전후 주문 내역을 확인해요.</span></li>'
      : '';
  }
  el('[data-files]').onclick = (event) => {
    if (!busy && (event.target as HTMLElement).closest('[data-remove-upload]')) {
      file = null;
      fileList();
    }
  };
  document.querySelectorAll<HTMLInputElement>('[data-input]').forEach((input) => {
    input.multiple = false;
    input.accept = '.xlsx,.csv';
    input.onchange = () => {
      choose(input.files);
      input.value = '';
    };
  });
  const drop = el('[data-drop]');
  drop.ondragover = (event) => {
    event.preventDefault();
    drop.classList.add('border-brand');
  };
  drop.ondragleave = () => drop.classList.remove('border-brand');
  drop.ondrop = (event) => {
    event.preventDefault();
    drop.classList.remove('border-brand');
    choose(event.dataTransfer?.files || null);
  };
  el('[data-next]').onclick = () => showStep(2);
  el('[data-prev]').onclick = () => {
    if (!busy) showStep(1);
  };
  el('[data-show]').onclick = async () => {
    if (!file || busy) return;
    const menu = chosenMenu();
    if (!menu) return;
    busy = true;
    const button = el<HTMLButtonElement>('[data-show]');
    button.disabled = true;
    message.textContent = '';
    try {
      // Keep only the computed summary for the transition; remove it when the result screen reads it.
      const owner = await getSession(signal);
      if (!owner.authenticated || owner.storeId !== r.storeId)
        throw new Error('다시 로그인해 주세요.');
      const report = await compareSales(r.id, file, menu);
      if (signal.aborted) return;
      const ticket = crypto.randomUUID();
      sessionStorage.setItem(
        uploadResultKey,
        JSON.stringify({ id: r.id, loginId: owner.loginId, storeId: r.storeId, ticket, report }),
      );
      navigateTo(recordUrl('result', r.id, { source: 'upload', ticket }));
    } catch (error) {
      if (signal.aborted) return;
      message.textContent = errorMessage(error);
      toast(message.textContent);
    } finally {
      busy = false;
      button.disabled = !file;
    }
  };
  fileList();
  showStep(1);
}

async function loadReport(record: Experiment, signal: AbortSignal) {
  const query = new URLSearchParams(location.search);
  if (query.get('source') === 'upload') {
    const saved = JSON.parse(sessionStorage.getItem(uploadResultKey) || 'null');
    const owner = await getSession(signal);
    signal.throwIfAborted();
    if (
      !saved ||
      !owner.authenticated ||
      owner.storeId !== saved.storeId ||
      owner.loginId !== saved.loginId ||
      saved.id !== record.id ||
      saved.ticket !== query.get('ticket')
    ) {
      throw new Error('파일 비교 결과를 다시 보려면 파일을 선택해 주세요.');
    }
    sessionStorage.removeItem(uploadResultKey);
    return saved.report as SalesReport;
  }
  const path = '/experiments/' + encodeURIComponent(record.id) + '/report';
  if (record.status === 'COMPLETED' && !query.get('source'))
    return request<SalesReport>(path, { signal });
  const menu = query.get('targetMenuCode') || record.targetMenuCode;
  return request<SalesReport>(
    path + '/preview' + (menu ? '?' + new URLSearchParams({ targetMenuCode: menu }) : ''),
    { signal },
  );
}

function nextOptions(r: Experiment) {
  const { esc, toast } = ui();
  const opts = [
    ['keep', '현재 방식 유지', '현재 운영 방식을 계속 유지해요', '이대로 유지하기'],
    ['more', '추가로 바꿔 보기', '이 기록을 참고해 다음 기록을 만들어요', '다음 기록 만들기'],
    ['end', '종료', '이번 변화는 여기서 마무리해요', '기록 마치기'],
    ['later', '나중에 결정', '내 기록으로 돌아가요', '나중에 결정하기'],
  ];
  let selected = 'more';
  function render() {
    el('[data-options]').innerHTML = opts
      .map(
        ([
          key,
          title,
          desc,
        ]) => `<label class="flex cursor-pointer items-start gap-2 rounded-card bg-white p-5 transition-colors ${selected === key ? 'border-2 border-brand p-[19px]' : 'border border-line hover:bg-surface-2'}">
      <span class="flex-1"><span class="block text-base font-semibold">${esc(title)}</span><span class="mt-0.5 block text-sm">${esc(desc)}</span></span>
      <input type="radio" name="next" value="${key}" class="peer sr-only" ${selected === key ? 'checked' : ''}><span class="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full ${selected === key ? 'bg-brand' : 'border border-line bg-white'} peer-focus-visible:ring-2 peer-focus-visible:ring-brand/40">${selected === key ? '<i class="h-2 w-2 rounded-full bg-white"></i>' : ''}</span></label>`,
      )
      .join('');
    el('[data-next-btn]').textContent = opts.find((o) => o[0] === selected)![3];
  }
  el('[data-options]').onchange = (event) => {
    selected = (event.target as HTMLInputElement).value;
    render();
    el('input[name=next]:checked').focus();
  };
  el('[data-next]').onsubmit = (event) => {
    event.preventDefault();
    if (selected === 'more')
      navigateTo('ai.html?' + new URLSearchParams({ start: 'next', id: r.id }));
    else if (selected === 'later') navigateTo('records.html');
    else toast('후속 결정 저장은 아직 지원하지 않아요.');
  };
  render();
}

async function result(r: Experiment, data: AppData, signal: AbortSignal) {
  let report: SalesReport;
  try {
    report = await loadReport(r, signal);
  } catch (error) {
    if (signal.aborted) return;
    notice(errorMessage(error), recordUrl('upload', r.id), '판매 자료 다시 선택');
    return;
  }
  signal.throwIfAborted();
  const { before, after } = report;
  const { esc } = ui();
  const name =
    data.menus.find((m) => m.menuCode === report.targetMenuCode)?.menuName || report.targetMenuCode;
  el('main h1').textContent = r.title + ' 결과';
  document.title = r.title + ' 결과 · trylog';
  el('main header .badge').textContent = report.persisted ? '완료' : '비교 결과';
  const meta = document.querySelectorAll<HTMLElement>('main header dd');
  meta[0].textContent = period(before.startDate, before.endDate);
  meta[1].textContent = period(after.startDate, after.endDate);
  meta[2].textContent = r.notes || r.title;
  const stats: [string, number, number, string, string][] = [
    [name + ' 주문', before.targetOrders, after.targetOrders, '건', '건'],
    ['전체 주문', before.totalOrders, after.totalOrders, '건', '건'],
    ['전체 주문 중 ' + name + ' 비중', before.sharePct, after.sharePct, '%', '%p'],
  ];
  el('[data-stats]').innerHTML = stats
    .map(
      ([
        label,
        old,
        value,
        unit,
        deltaUnit,
      ]) => `<div class="card-strong flex flex-col gap-3 p-5"><p class="text-[15px] font-medium text-body">${esc(label)}</p>
    <div class="flex items-end justify-between"><p class="flex items-end gap-0.5"><b class="text-2xl font-bold leading-7">${fmt.format(value)}</b><span class="pb-0.5 text-sm font-medium">${unit}</span></p><span class="text-sm font-medium ${value >= old ? 'text-up' : 'text-down'}">${value >= old ? '+' : '−'}${fmt.format(Math.abs(value - old))}${deltaUnit}</span></div><div class="divider"></div><p class="text-sm text-sub">변경 전 ${fmt.format(old)}${unit}</p></div>`,
    )
    .join('');
  el('[data-summary]').previousElementSibling!.textContent = '결과 요약';
  el('[data-summary]').textContent = report.summary;
  el('section.note li').textContent =
    `· 변경 전후 같은 길이(${daysBetween(after.startDate, after.endDate) + 1}일)를 비교했어요.`;
  // The reporting API supplies two complete periods, not weekly points.
  const chart = el('[data-bars]').closest('section')!;
  el<HTMLAnchorElement>('a[href="baseline.html"]').href = recordUrl('baseline', r.id);
  chart.querySelector('h2')!.textContent = name + ' 주문';
  chart.querySelector('.text-xs')!.lastChild!.textContent = '메뉴 주문(건)';
  const highest = Math.max(1, before.targetOrders, after.targetOrders);
  const step = Math.max(1, Math.ceil(highest / 5)),
    max = step * 5;
  el('[data-yaxis]').innerHTML = Array.from(
    { length: 6 },
    (_, i) => `<span class="leading-none">${fmt.format((5 - i) * step)}</span>`,
  ).join('');
  const bars = [
    ['변경 전', before.targetOrders],
    ['변경 후', after.targetOrders],
  ] as const;
  el('[data-bars]').innerHTML =
    Array.from(
      { length: 5 },
      (_, i) =>
        `<span class="pointer-events-none absolute inset-x-0 border-t border-dashed border-line-light" style="top:${i * 20}%"></span>`,
    ).join('') +
    '<span class="absolute inset-x-0 bottom-0 border-t border-line"></span>' +
    bars
      .map(
        ([l, v]) =>
          `<div class="bar-col relative z-10" title="${l} ${fmt.format(v)}건"><div class="bar" style="height:${(v / max) * 100}%"></div></div>`,
      )
      .join('');
  el('[data-xaxis]').innerHTML = bars
    .map(
      ([l]) => `<span class="flex-1 py-3 text-center text-[13px] font-medium text-sub">${l}</span>`,
    )
    .join('');
  nextOptions(r);
}

export async function mountReport(page: string, r: Experiment, data: AppData, signal: AbortSignal) {
  if (page === 'upload') return upload(r, data, signal);
  if (page === 'result') return result(r, data, signal);
}

export function mountConfirmation(r?: Experiment) {
  const manual = new URLSearchParams(location.search).get('mode') === 'manual';
  el('[data-title]').textContent = manual
    ? '판매 자료 숫자 직접 입력'
    : '올린 자료의 숫자를 확인해 주세요';
  el('[data-desc]').textContent = manual
    ? '직접 입력한 숫자를 저장하는 기능은 아직 지원하지 않아요.'
    : '사진을 읽고 숫자를 확인하는 기능은 아직 지원하지 않아요.';
  const { icon } = ui();
  el('[data-photo-card]').hidden = manual;
  if (manual) el('[data-grid]').classList.remove('grid-cols-[auto_1fr]');
  el('[data-photo-name]').textContent = '판매 자료';
  el('[data-photo-page]').textContent = '—';
  el('[data-receipt]').textContent = '표시할 사진이 없어요.';
  el('[data-day-title]').textContent = r ? formatDate(r.startDate, true) : '입력할 날짜';
  el('[data-day-pos]').textContent = '—';
  for (const b of document.querySelectorAll<HTMLButtonElement>(
    '[data-day], [data-zoom], [data-photo]',
  )) {
    b.disabled = true;
    if (b.dataset.day)
      b.innerHTML = icon(b.dataset.day === '-1' ? 'chevron-left' : 'chevron-right', 18);
  }
  el('[data-fields]').innerHTML = [
    ['sales', '매출액', '원'],
    ['total', '전체 주문', '건'],
    ['menu', '메뉴 주문', '건'],
  ]
    .map(
      ([key, label, unit]) =>
        `<div><label class="text-sm font-semibold" for="confirm-${key}">${label}</label><div class="relative mt-2"><input class="input input-sm pr-10" id="confirm-${key}" placeholder="숫자 입력" disabled><span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm">${unit}</span></div></div>`,
    )
    .join('');
  el('[data-ratio]').previousElementSibling!.textContent = '메뉴 주문 비중';
  el('[data-ratio]').textContent = '—';
  el<HTMLFormElement>('[data-form]').onsubmit = (event) => event.preventDefault();
  el<HTMLButtonElement>('[data-save]').disabled = true;
  const back = el<HTMLAnchorElement>('main a[href^="result.html"]');
  back.href = r ? recordUrl('upload', r.id) : 'upload.html';
  back.textContent = '판매 자료 선택으로 돌아가기';
}
