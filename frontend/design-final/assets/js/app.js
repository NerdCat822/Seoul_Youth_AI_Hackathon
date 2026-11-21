/* Trylog 공통 스크립트: 상단바 · 알림 · 사용자 메뉴 · 모달 · 토스트 · 칩/탭 · 카드 렌더러 */
(function () {
  const D = window.TRYLOG;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (name, size = 20, cls = '') =>
    `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${(window.ICONS || {})[name] || ''}</svg>`;
  const won = n => n.toLocaleString('ko-KR');
  const params = new URLSearchParams(location.search);

  /* ---------- 상단바 ---------- */
  const NAV = [['home', '홈', 'home.html'], ['explore', '탐색', 'explore.html'], ['records', '내 기록', 'records.html'], ['calendar', '달력', 'calendar.html']];

  function topBar() {
    const host = $('[data-topbar]');
    if (!host) return;
    const guest = host.dataset.topbar === 'guest';
    const minimal = host.dataset.topbar === 'minimal';
    const active = document.body.dataset.nav || '';
    // 로그인 전(guest · minimal)은 로그인 전 홈(welcome.html)으로, 로그인 후는 내 가게 홈으로
    const homeHref = guest || minimal ? 'welcome.html' : 'home.html';
    const tabs = minimal ? '' : `<nav class="absolute left-1/2 top-4 flex -translate-x-1/2 gap-2" aria-label="주요 메뉴">${NAV.map(([k, l, h]) =>
      `<a href="${guest && k === 'home' ? homeHref : h}" class="block border-b-2 pb-1.5 ${active === k ? 'border-brand' : 'border-transparent'}" ${active === k ? 'aria-current="page"' : ''}>
         <span class="block rounded-lg px-4 py-[9px] text-base font-medium leading-6 hover:bg-surface-2 ${active === k ? 'text-brand-text' : 'text-heading'}">${l}</span></a>`).join('')}</nav>`;
    const unread = D.notifications.filter(n => n.unread).length;
    const right = minimal ? '' : guest
      ? `<div class="flex items-center gap-4">${chatBtn()}<a href="login.html" class="btn btn-sm bg-heading text-white hover:bg-black">로그인</a></div>`
      : `<div class="flex items-center gap-6">
          <div class="flex items-center gap-3">
            ${chatBtn()}
            <div class="relative">
              <button type="button" class="icon-btn relative h-8 w-8 text-[#9ea3ad] hover:text-heading" data-pop="notif" aria-haspopup="true" aria-expanded="false" aria-label="알림">
                ${icon('bell', 24)}<span data-unread-dot class="absolute right-1 top-1 h-2 w-2 rounded-full bg-error ring-2 ring-white" ${unread ? '' : 'hidden'}></span>
              </button>
              <div class="popover right-[-24px] top-11 w-[400px] p-2" data-popover="notif" hidden>${notifPanel()}</div>
            </div>
          </div>
          <div class="relative">
            <button type="button" class="flex items-center gap-2 rounded-xl py-1 pl-1 pr-2 hover:bg-surface-2" data-pop="user" aria-haspopup="true" aria-expanded="false">
              <span class="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-[#e5e7eb] text-white">${icon('user', 16)}</span>
              <span class="text-sm font-medium">${esc(D.store.name)}</span>${icon('chevron-down', 18, 'text-sub')}
            </button>
            <div class="popover right-0 top-12 w-[258px] p-2" data-popover="user" hidden>
              <div class="flex items-center gap-3 px-3 py-3">
                <span class="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-[#e5e7eb] text-white">${icon('user', 16)}</span>
                <span><span class="block text-[15px] font-semibold">${esc(D.store.name)}</span><span class="block text-[13px] text-body">${esc(D.store.email)}</span></span>
              </div>
              <div class="divider my-1"></div>
              <a class="menu-item ${active === 'store' ? 'font-semibold text-brand-text' : ''}" href="store.html">${icon('store', 16)} 내 가게</a>
              <a class="menu-item ${active === 'settings' ? 'font-semibold text-brand-text' : ''}" href="settings.html">${icon('settings', 16)} 설정</a>
              <div class="divider my-1"></div>
              <button type="button" class="menu-item" data-action="logout">${icon('logout', 16)} 로그아웃</button>
            </div>
          </div>
        </div>`;
    host.className = 'sticky top-0 z-30 bg-white/95 backdrop-blur';
    host.innerHTML = `<div class="relative flex h-16 items-center gap-2 px-14">
        <a href="${homeHref}" aria-label="trylog 홈"><img src="assets/img/logo.svg" alt="trylog" width="92" height="28" class="h-7 w-[92px]"></a>
        <div class="flex-1"></div>${tabs}${right}</div>`;
  }

  // AI 대화 버튼: 오른쪽 분할 패널을 열고 닫음 (패널이 없는 ai.html에서는 전체 화면 대화로 이동)
  function chatBtn() {
    if (document.body.dataset.ai === 'off') return `<a href="ai.html" class="icon-btn h-8 w-8 text-heading" aria-label="AI 대화" aria-current="page">${icon('chat', 24)}</a>`;
    return `<div class="relative"><button type="button" class="icon-btn h-8 w-8 text-[#9ea3ad] hover:text-heading" data-ai-toggle aria-controls="ai-panel" aria-expanded="false" aria-label="AI 대화 열기·닫기" title="AI 대화">${icon('chat', 24)}</button>
      <span class="ai-tip" role="status" data-ai-tip hidden>여기서 언제든 대화를 다시 시작할 수 있어요</span></div>`;
  }

  function notifPanel() {
    return `<div class="flex items-center justify-between px-3 pb-1 pt-2">
        <p class="text-base font-semibold">알림</p>
        <button type="button" class="rounded-lg px-2 py-1 text-[13px] font-medium text-sub hover:bg-surface-2" data-action="read-all">모두 읽음처리</button>
      </div>
      <ul data-notif-list>${D.notifications.map(n => `
        <li><a href="${n.href}" class="flex gap-3 rounded-xl px-3 py-4 hover:bg-surface-2">
          <span class="relative mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-full border border-line-light ${n.unread ? 'text-brand' : 'text-dim'}">${icon(n.icon, 16)}
            <span data-dot class="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-error" ${n.unread ? '' : 'hidden'}></span></span>
          <span class="min-w-0"><span class="block text-[15px] font-semibold ${n.unread ? 'text-heading' : 'text-sub'}">${esc(n.title)}</span>
            <span class="mt-1 block text-[13px] ${n.unread ? 'text-body' : 'text-sub'}">${esc(n.body)}</span>
            <span class="mt-2 block text-[13px] text-dim">${esc(n.time)}</span></span>
        </a></li>`).join('')}</ul>`;
  }

  /* ---------- 팝오버 (알림 · 사용자 메뉴 · 첨부 메뉴) ---------- */
  function closePopovers(except) {
    $$('[data-popover]').forEach(p => { if (p !== except) p.hidden = true; });
    $$('[data-pop]').forEach(b => { if (!except || b.dataset.pop !== except.dataset.popover) b.setAttribute('aria-expanded', 'false'); });
  }
  document.addEventListener('click', e => {
    const trigger = e.target.closest('[data-pop]');
    if (trigger) {
      const pop = $(`[data-popover="${trigger.dataset.pop}"]`);
      const open = pop.hidden;
      closePopovers(open ? pop : null);
      pop.hidden = !open; trigger.setAttribute('aria-expanded', String(open));
      return;
    }
    if (!e.target.closest('[data-popover]')) closePopovers();
    const act = e.target.closest('[data-action]');
    if (!act) return;
    if (act.dataset.action === 'read-all') {
      D.notifications.forEach(n => (n.unread = false));
      $$('[data-dot],[data-unread-dot]').forEach(d => (d.hidden = true));
      $$('[data-notif-list] .text-heading').forEach(t => t.classList.replace('text-heading', 'text-sub'));
      toast('알림을 모두 읽음 처리했어요.');
    }
    if (act.dataset.action === 'logout') { closePopovers(); confirmLogout(); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closePopovers(); closeModal(); } });

  /* ---------- 모달 ---------- */
  let modalEl = null, lastFocus = null;
  function openModal({ title, body = '', confirm = '확인', cancel = '취소', tone = 'primary', disabledUntil = null, onConfirm }) {
    closeModal(); lastFocus = document.activeElement;
    modalEl = document.createElement('div');
    modalEl.className = 'modal-backdrop';
    modalEl.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="m-title">
        <h2 id="m-title" class="text-base font-semibold">${title}</h2>
        <div class="mt-2 text-base leading-6 text-sub">${body}</div>
        <div class="mt-6 flex justify-end gap-2">
          <button type="button" class="btn btn-lg btn-neutral text-sm font-semibold" data-m="cancel">${cancel}</button>
          <button type="button" class="btn btn-lg ${tone === 'danger' ? 'btn-danger' : 'btn-primary'} text-sm font-semibold" data-m="ok" ${disabledUntil ? 'disabled' : ''}>${confirm}</button>
        </div></div>`;
    document.body.appendChild(modalEl);
    const ok = $('[data-m="ok"]', modalEl);
    if (disabledUntil) { const cb = $(disabledUntil, modalEl); cb.addEventListener('change', () => (ok.disabled = !cb.checked)); }
    modalEl.addEventListener('click', e => { if (e.target === modalEl || e.target.closest('[data-m="cancel"]')) closeModal(); });
    ok.addEventListener('click', () => { const root = modalEl; closeModal(); onConfirm && onConfirm(root); });
    (disabledUntil ? $(disabledUntil, modalEl) : $('[data-m="cancel"]', modalEl)).focus();
  }
  function closeModal() { if (modalEl) { modalEl.remove(); modalEl = null; lastFocus && lastFocus.focus && lastFocus.focus(); } }
  function confirmLogout() {
    openModal({ title: '로그아웃할까요?', body: '다시 로그인하면 기록과 판매 자료를 그대로 볼 수 있어요.', confirm: '로그아웃',
      onConfirm: () => (location.href = 'welcome.html?toast=' + encodeURIComponent('로그아웃했어요.')) });
  }

  /* ---------- 토스트 ---------- */
  let toastEl, toastT;
  function toast(msg) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'toast'; toastEl.setAttribute('role', 'status'); document.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.classList.add('is-on');
    clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('is-on'), 2400);
  }
  // 다른 페이지에서 넘어온 안내 (?toast=)
  if (params.get('toast')) setTimeout(() => toast(params.get('toast')), 150);

  /* ---------- 칩 그룹 (단일/복수 선택) ---------- */
  document.addEventListener('click', e => {
    const chip = e.target.closest('[data-chip-group] .chip');
    if (!chip) return;
    const group = chip.closest('[data-chip-group]');
    if (group.dataset.chipGroup === 'single') {
      $$('.chip', group).forEach(c => c.setAttribute('aria-pressed', String(c === chip)));
    } else {
      chip.setAttribute('aria-pressed', String(chip.getAttribute('aria-pressed') !== 'true'));
    }
    group.dispatchEvent(new CustomEvent('chipchange', { bubbles: true }));
  });

  /* ---------- 카드 렌더러 ---------- */
  const ideaMeta = i => `비용 ${i.cost} · ${i.ease} · ${i.weeks}주`;
  function ideaCard(i, { compact = false } = {}) {
    const c = D.categories[i.cat];
    return `<a href="idea.html?id=${i.id}" class="idea-card">
      ${compact ? '' : `<img class="thumb ${c.img}" src="${i.img}" alt="${esc(i.title)} 예시 이미지" loading="lazy" width="380" height="160">`}
      <div class="body"><span class="cat ${c.cls} self-start">${c.label}</span>
        <p class="mt-3 text-base font-semibold leading-6">${esc(i.title)}</p>
        <p class="text-sm leading-5 text-sub">${esc(i.desc)}</p>
        <p class="mt-1 text-[13px] font-medium text-sub">${ideaMeta(i)}</p></div></a>`;
  }
  const badge = s => `<span class="badge ${D.statusClass[s]}">${D.statusLabel[s]}</span>`;

  // <span data-icon="name" data-size="18"> 를 아이콘으로 채움 (span의 색·여백 클래스는 그대로 유지)
  function hydrateIcons(root = document) {
    $$('[data-icon]', root).forEach(el => { el.innerHTML = icon(el.dataset.icon, +(el.dataset.size || 18)); el.classList.add('inline-flex', 'shrink-0'); el.removeAttribute('data-icon'); });
  }

  window.App = { $, $$, esc, icon, hydrateIcons, won, params, toast, openModal, closeModal, ideaCard, ideaMeta, badge, notifPanel };
  topBar();
})();
