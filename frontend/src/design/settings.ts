import { request } from '../api';
import { statuses } from '../lib/labels';
import type { AppData, AuthSession, Upjong } from '../types';

function exportRecords(data: AppData) {
  const rows = [
    ['기록명', '상태', '시작일', '종료일', '결과 확인일', '비교 항목'],
    ...data.experiments.map((item) => [
      item.title,
      statuses[item.status],
      item.startDate,
      item.endDate,
      item.checkDate,
      data.menus.find((menu) => menu.menuCode === item.targetMenuCode)?.menuName ?? '',
    ]),
  ];
  const csv = rows
    .map((row) =>
      row
        .map((value) => {
          const safe = /^[\s]*[=+@-]/.test(value) ? "'" + value : value;
          return '"' + safe.replaceAll('"', '""') + '"';
        })
        .join(','),
    )
    .join('\r\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'trylog_내기록.csv';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  window.App.toast('내 기록을 내려받았어요.');
}

function settings(session: AuthSession, data: AppData) {
  document.querySelector<HTMLInputElement>('#se-id')!.value = session.loginId ?? '';
  const password = document.querySelector<HTMLInputElement>('#se-pw')!;
  password.value = '';
  password.placeholder = '••••••••';
  const consent = document.querySelector<HTMLButtonElement>('[data-switch]')!;
  consent.disabled = true;
  consent.removeAttribute('aria-checked');
  consent.removeAttribute('role');
  consent.setAttribute('aria-label', '동의 상태 조회 미지원');
  consent.classList.add('opacity-50');
  consent.style.backgroundColor = '#d1d5dc';
  consent.closest('dl')!.querySelector('dd')!.textContent =
    '판매 자료 분석 동의 상태 조회와 변경은 아직 지원하지 않아요.';
  document.querySelector('[data-change-pw]')!.addEventListener('click', () => {
    window.App.openModal({
      title: '비밀번호 변경',
      confirm: '변경하기',
      body: '<input type="password" disabled class="input mt-2" placeholder="새 비밀번호 (8자 이상)" aria-label="새 비밀번호"><p class="mt-2 text-sm">비밀번호 변경 기능은 아직 연결되지 않았어요.</p>',
    });
    document.querySelector<HTMLButtonElement>('[role="dialog"] [data-m="ok"]')!.disabled = true;
  });
  document.querySelector('[data-withdraw]')!.addEventListener('click', () => {
    window.App.openModal({
      title: '정말 탈퇴할까요?',
      confirm: '탈퇴하기',
      tone: 'danger',
      body: `<p>계정 삭제 기능은 아직 연결되지 않았어요.</p>
        <ul class="mt-3 space-y-1 rounded-xl bg-surface-2 px-4 py-3 text-sm font-semibold text-heading">
          <li>· 가게 정보</li><li>· 내 기록과 시도 결과 ${data.experiments.length}건</li><li>· 올린 판매 자료</li><li>· AI 대화</li></ul>
        <label class="mt-4 flex items-center gap-2 text-sm font-semibold text-heading"><input type="checkbox" disabled class="h-[18px] w-[18px] accent-[#00aa72]"> 안내를 확인했어요</label>`,
    });
    document.querySelector<HTMLButtonElement>('[role="dialog"] [data-m="ok"]')!.disabled = true;
  });
  document.querySelector('[data-export]')!.addEventListener('click', () => exportRecords(data));
}

async function store(data: AppData, signal: AbortSignal) {
  const form = document.querySelector<HTMLFormElement>('form[data-panel="info"]')!;
  form.querySelector<HTMLInputElement>('#st-name')!.value = data.overview.storeName;
  form.querySelector<HTMLInputElement>('#st-hours')!.value = '';
  for (const field of form.querySelectorAll<HTMLInputElement>('input')) field.readOnly = true;
  const types = await request<{ upjongs: Upjong[] }>('/upjongs', { signal });
  signal.throwIfAborted();
  const [industries, modes] = form.querySelectorAll<HTMLElement>('[data-chip-group]');
  function chips(group: HTMLElement, names: string[], selected?: string) {
    group.removeAttribute('data-chip-group');
    for (const name of names) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.disabled = true;
      chip.textContent = name;
      chip.setAttribute('aria-pressed', String(name === selected));
      group.appendChild(chip);
    }
  }
  chips(
    industries,
    types.upjongs.map((item) => item.upjongNm),
    data.overview.upjongNm ?? undefined,
  );
  chips(modes, ['매장 식사', '포장', '배달']);
  const error = form.querySelector<HTMLElement>('[data-error]')!;
  error.textContent = '가게 상세정보 조회와 수정은 아직 지원하지 않아요.';
  error.hidden = false;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    window.App.toast(error.textContent!);
  });
  const sales = document.querySelector<HTMLElement>('[data-panel="data"]')!;
  for (const card of sales.querySelectorAll('.card')) {
    const [, value, caption] = card.querySelectorAll('p');
    value.textContent = '—';
    caption.textContent = '';
  }
  const cell = document.createElement('td');
  cell.colSpan = 5;
  cell.textContent = '판매 자료 업로드 이력 조회와 삭제는 아직 지원하지 않아요.';
  const row = document.createElement('tr');
  row.appendChild(cell);
  sales.querySelector('tbody')!.appendChild(row);
  sales.querySelector('p.rounded-xl')!.textContent =
    '시도별 판매 자료 비교는 내 기록에서 확인할 수 있어요.';
  sales.querySelector<HTMLAnchorElement>('a')!.href = 'upload.html';
  function select(tab: string) {
    for (const button of document.querySelectorAll<HTMLElement>('[data-tab]')) {
      const on = button.dataset.tab === tab;
      button.setAttribute('aria-selected', String(on));
      button.className =
        'text-[20px] ' + (on ? 'font-bold text-brand' : 'font-medium text-dim hover:text-sub');
    }
    for (const panel of document.querySelectorAll<HTMLElement>('[data-panel]'))
      panel.hidden = panel.dataset.panel !== tab;
    history.replaceState(history.state, '', tab === 'data' ? 'store.html?tab=data' : 'store.html');
  }
  for (const button of document.querySelectorAll<HTMLElement>('[data-tab]'))
    button.onclick = () => select(button.dataset.tab!);
  select(new URLSearchParams(location.search).get('tab') === 'data' ? 'data' : 'info');
}

export async function mountAccountScreen(
  page: string,
  session: AuthSession,
  data: AppData,
  signal: AbortSignal,
) {
  if (page === 'store') await store(data, signal);
  else settings(session, data);
}
