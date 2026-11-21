/* AI 대화 (홈 오른쪽 패널 · ai.html 공용) — 미리 정한 시나리오로 동작하는 목업 */
(function () {
  const { $, $$, esc, icon, toast, ideaMeta } = window.App;
  const D = window.TRYLOG;
  const idea = id => D.ideas.find(i => i.id === id);

  function Chat(root, { compact = false } = {}) {
    const log = $('[data-chat-log]', root);
    const form = $('[data-chat-form]', root);
    const input = $('[data-chat-input]', root);
    const empty = $('[data-chat-empty]', root);
    const busy = { v: false };

    const scroll = () => { const sc = log.closest('[data-chat-scroll]'); if (sc) sc.scrollTop = sc.scrollHeight; else window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); };
    const add = html => { if (empty) empty.hidden = true; log.insertAdjacentHTML('beforeend', html); scroll(); return log.lastElementChild; };
    const wait = ms => new Promise(r => setTimeout(r, ms));
    async function typing() {
      const el = add(`<div class="flex gap-3" data-typing><span class="ai-avatar">${icon('sparkling', 18)}</span>
        <span class="mt-2 flex gap-1">${'<span class="h-1.5 w-1.5 animate-bounce rounded-full bg-dim"></span>'.repeat(3)}</span></div>`);
      await wait(650); el.remove();
    }
    const user = text => add(`<p class="bubble-user">${esc(text)}</p>`);
    function ai(html, extra = '') {
      return add(`<div class="flex gap-3"><span class="ai-avatar">${icon('sparkling', 18)}</span>
        <div class="min-w-0 flex-1"><div class="pt-1 text-base leading-6 text-body">${html}</div>${extra}</div></div>`);
    }
    function chips(list) {
      return `<div class="mt-3 flex flex-wrap gap-2" data-chips>${list.map(([label, key]) =>
        `<button type="button" class="hint-chip" data-reply="${key}">${esc(label)}</button>`).join('')}</div>`;
    }
    function ideaCards(ids) {
      return `<div class="mt-4 grid grid-cols-2 gap-3">${ids.map(id => {
        const i = idea(id), c = D.categories[i.cat];
        return `<div class="rounded-card border border-line bg-white ${compact ? 'p-4' : 'p-5'}">
          <span class="cat ${c.cls}">${c.label}</span>
          <p class="mt-3 ${compact ? 'text-sm' : 'text-base'} font-semibold">${esc(i.title)}</p>
          <p class="mt-1 ${compact ? 'text-[13px]' : 'text-sm'} text-sub">${esc(i.desc)}</p>
          <p class="mt-1 text-[13px] font-medium text-sub">${ideaMeta(i)}</p>
          <div class="mt-4 flex items-center justify-between gap-2">
            <a href="idea.html?id=${i.id}" class="btn btn-sm btn-neutral">자세히 보기</a>
            <button type="button" class="btn btn-sm bg-brand-weak text-brand-text hover:bg-brand-soft" data-try="${i.id}">시도해보기</button>
          </div></div>`; }).join('')}</div>`;
    }

    /* 기록 확인 카드 (AI-03·04) */
    function recordCard(r) {
      const rows = [
        ['title', '기록명', esc(r.title)],
        ['change', '변경 내용', r.change],
        ['period', '진행 기간', esc(r.period), r.periodNote],
        ['result', '결과 확인일', esc(r.result)],
        ['compare', '비교 항목', esc(r.compare)],
        ['needs', '필요한 자료', esc(r.needs), '결과 확인일에 올려 주시면 돼요'],
      ];
      return `<section class="mt-4 rounded-card border border-line bg-white p-5" data-record-card>
        <div class="flex items-center justify-between"><h3 class="text-[18px] font-bold">기록 내용 확인</h3><span class="text-sm font-medium text-sub" data-save-state>저장 전</span></div>
        <dl class="mt-4 divide-y divide-line-light">${rows.map(([k, label, val, note]) => `
          <div class="grid grid-cols-[112px_1fr_auto] items-start gap-3 py-3.5" data-row="${k}">
            <dt class="text-[15px] font-semibold">${label}</dt>
            <dd class="text-[15px] font-medium"><span data-val>${val}</span>${note ? `<span class="mt-1 block text-sm font-normal text-sub">${esc(note)}</span>` : ''}</dd>
            <button type="button" class="text-[15px] font-medium text-sub hover:text-heading" data-edit>수정하기</button>
          </div>`).join('')}
          <div class="grid grid-cols-[112px_1fr_auto] items-center gap-3 py-3.5">
            <dt class="text-[15px] font-semibold">첨부 자료 <span class="font-normal text-sub">(선택)</span></dt>
            <dd class="text-[15px] text-sub" data-files>없음</dd>
            <label class="btn btn-sm cursor-pointer bg-brand-weak text-brand-text hover:bg-brand-soft">${icon('add', 16)} 파일 추가
              <input type="file" class="sr-only" multiple data-file-input></label>
          </div></dl>
        <div class="mt-4 flex justify-end"><button type="button" class="btn btn-xl btn-primary" data-save>이대로 시도해보기</button></div>
      </section>`;
    }

    async function confirmRecord(r, lead) {
      await typing();
      const el = ai(esc(lead), recordCard(r));
      const card = $('[data-record-card]', el);
      card.addEventListener('click', e => {
        const edit = e.target.closest('[data-edit]');
        if (edit) {
          const row = edit.closest('[data-row]'), val = $('[data-val]', row);
          if (edit.dataset.editing) {
            val.textContent = $('input', val).value || '—'; delete edit.dataset.editing; edit.textContent = '수정하기';
          } else {
            const cur = val.textContent; val.innerHTML = `<input class="input input-sm" value="${esc(cur)}">`;
            $('input', val).focus(); edit.dataset.editing = '1'; edit.textContent = '완료';
          }
        }
        if (e.target.closest('[data-save]')) save(card, r);
      });
      $('[data-file-input]', card).addEventListener('change', e => {
        const names = [...e.target.files].map(f => f.name);
        $('[data-files]', card).textContent = names.length ? names.join(', ') : '없음';
        $('[data-files]', card).classList.toggle('text-heading', !!names.length);
      });
    }

    async function save(card, r) {
      $$('button, input', card).forEach(b => (b.disabled = true));
      $('[data-save]', card).remove();
      $('[data-save-state]', card).textContent = '저장됨';
      await typing();
      ai('', `<a href="record.html?id=${r.id || 'r1'}" class="mt-0 flex items-center justify-between rounded-card border border-line bg-white px-5 py-4 hover:bg-surface-2">
          <span class="flex items-center gap-3"><span class="text-base font-semibold">${esc(r.title)}</span><span class="text-sm text-sub">${esc(r.periodShort)}</span></span>
          <span class="badge badge-progress">진행 중</span></a>`);
      await typing();
      ai('', `<section class="rounded-card border border-line-light bg-white p-5">
          <h3 class="text-[18px] font-bold">기록했어요</h3><div class="divider my-4"></div>
          <p class="text-[15px] leading-6">${esc(r.result)}에 결과를 확인할 수 있어요.<br>아래 판매 자료를 준비해 주세요.</p>
          <div class="mt-4 rounded-xl bg-surface-2 p-5"><p class="text-base font-semibold">준비할 자료</p>
            <ul class="mt-3 space-y-2 text-sm">${r.prep.map(([k, v]) => `<li class="flex gap-2"><span class="text-dim">•</span>${k ? `<span>${esc(k)}</span><b class="font-semibold">${esc(v)}</b>` : `<span>${v}</span>`}</li>`).join('')}</ul></div>
        </section>`);
      toast('기록을 저장했어요.');
    }

    /* ---------- 시나리오 ---------- */
    const recordFromIdea = i => ({
      id: 'new', title: i.title, change: esc(i.desc), period: '12월 3일(목) ~ 12월 16일(수)', periodShort: '12월 3일 ~ 12월 16일',
      periodNote: `"${i.weeks}주"를 실제 날짜로 바꿨어요`, result: '12월 17일(목)', compare: i.cat === 'delivery' ? '배달 주문 건수' : '관련 메뉴 주문 건수 · 매출액',
      needs: '변경 전후 메뉴별 판매 자료', prep: [['변경 전', '11월 19일 ~ 12월 2일'], ['변경 후', '12월 3일 ~ 12월 16일'], ['', '<b class="font-semibold">메뉴별 판매 수량 · 매출액</b>이 있는 주문 데이터']],
    });
    const tteokbokki = {
      id: 'r1', title: '떡볶이 세트 가격 변경', change: '9,000원 <span class="text-dim">→</span> <b class="font-semibold text-brand">8,000원</b>',
      period: '11월 19일(목) ~ 12월 2일(수)', periodShort: '11월 19일 ~ 12월 2일', periodNote: '"오늘부터 2주"를 실제 날짜로 바꿨어요',
      result: '12월 3일(목)', compare: '세트 메뉴 주문 건수 · 매출액', needs: '변경 전후 메뉴별 판매 자료',
      prep: [['변경 전', '11월 5일 ~ 11월 18일'], ['변경 후', '11월 19일 ~ 12월 2일'], ['', '<b class="font-semibold">메뉴별 판매 수량 · 매출액</b>이 있는 주문 데이터']],
    };

    const flows = {
      async lunch(first = '요즘 점심시간에 손님이 줄었어.') {
        user(first); await typing();
        ai('현재 점심 세트 메뉴를 운영하고 계신가요?', chips([['네, 운영하고 있어요', 'yes'], ['아니요', 'no'], ['잘 모르겠어요', 'idk']]));
      },
      async yes() { user('응, 운영하고 있어.'); await this.ideas(['i1', 'i8'], '추가 비용 없이 적용할 수 있는 방법을 찾아봤어요.'); },
      async no() { user('아니, 운영 안 해.'); await this.ideas(['i10', 'i2'], '점심 세트를 새로 만들거나, 입구에서 점심 메뉴를 알리는 방법이 있어요.'); },
      async idk() { user('잘 모르겠어.'); await this.ideas(['i2', 'i1'], '부담 없이 바로 해볼 수 있는 방법부터 골라봤어요.'); },
      async more() { user('다른 해볼 일 보여줘.'); await this.ideas(['i7', 'i4'], '메뉴 쪽에서 해볼 수 있는 방법도 있어요.'); },
      async paid() { user('비용이 들어도 괜찮아.'); await this.ideas(['i5', 'i11'], '조금의 비용으로 점심 회전을 높이는 방법이에요.'); },
      async ideas(ids, lead) {
        await typing();
        ai(esc(lead), ideaCards(ids) + `<p class="mt-3 text-sm text-sub">효과는 가게마다 달라요. 적용한 내용을 기록해 두면 전후 결과로 확인할 수 있어요.</p>`
          + chips([['다른 해볼 일 보기', 'more'], ['비용이 들어도 괜찮아요', 'paid']]));
      },
      async tryIdea(id) {
        const i = idea(id); user(`${i.title} 해볼게.`);
        await confirmRecord(recordFromIdea(i), `기록할 내용을 정리했어요. 오늘부터 ${i.weeks}주 동안 진행하는 것으로 이해했어요. 날짜가 맞는지 확인해 주세요.`);
      },
      async record(text = '오늘부터 2주 동안 떡볶이 세트를 9,000원에서 8,000원으로 내려 볼게.') {
        user(text);
        await confirmRecord(tteokbokki, '기록할 내용을 정리했어요. "오늘부터 2주"를 11월 19일 ~ 12월 2일로 이해했어요. 날짜가 맞는지 확인해 주세요.');
      },
      async next() {
        await typing();
        ai('떡볶이 세트 가격 변경 결과를 참고해 다음에 해볼 일을 골라봤어요. 세트 주문은 늘었지만 비중이 줄었으니, 세트가 먼저 눈에 띄게 하는 방법이 좋아요.',
          ideaCards(['i1', 'i4']));
      },
      async free(text) {
        user(text);
        if (/(내려|올려|바꿨|바꿔|바꿀|해볼게|시작|붙였|붙일)/.test(text)) {
          const r = { ...recordFromIdea({ title: text.slice(0, 20), desc: text, weeks: 2, cat: 'menu' }), title: text.replace(/[.!]$/, '').slice(0, 24) };
          return confirmRecord(r, '말씀하신 내용을 기록으로 정리했어요. 확인 후 저장해 주세요.');
        }
        await this.ideas(['i1', 'i2'], '말씀하신 고민에 맞춰 바로 해볼 수 있는 방법을 찾아봤어요.');
      },
    };

    root.addEventListener('click', e => {
      const reply = e.target.closest('[data-reply]');
      if (reply && !busy.v) {
        reply.closest('[data-chips]').querySelectorAll('button').forEach(b => (b.disabled = true));
        reply.classList.add('border-brand/50', 'bg-brand-weak', 'text-brand-text');
        run(() => flows[reply.dataset.reply]());
      }
      const tri = e.target.closest('[data-try]');
      if (tri && !busy.v) run(() => flows.tryIdea(tri.dataset.try));
      const hint = e.target.closest('[data-hint]');
      if (hint && !busy.v) run(() => hint.dataset.hint === 'price' ? flows.record('최근에 떡볶이 세트 가격을 9,000원에서 8,000원으로 내렸어.') :
        hint.dataset.hint === 'free' ? flows.free(hint.textContent.trim()) : flows.lunch(hint.textContent.trim().replace('줄었어요', '줄었어.')));
    });
    form && form.addEventListener('submit', e => {
      e.preventDefault(); const t = input.value.trim(); if (!t || busy.v) return;
      input.value = ''; run(() => flows.free(t));
    });
    async function run(fn) { busy.v = true; try { await fn(); } finally { busy.v = false; } }
    return { flows, run };
  }
  window.TrylogChat = Chat;

  /* ---------- 홈 오른쪽 AI 대화 패널 ---------- */
  function mountPanel(host, { hints = true } = {}) {
    host.innerHTML = `
      <aside data-ai-panel class="flex flex-col overflow-hidden rounded-panel border border-line-light bg-white shadow-panel" aria-label="AI 대화">
        <div class="flex h-20 flex-none items-center justify-between px-6">
          <button type="button" class="icon-btn" data-panel-list aria-label="대화 목록">${icon('menu', 24)}</button>
          <h2 class="text-[18px] font-bold" data-panel-title>대화</h2>
          <button type="button" class="btn btn-lg btn-neutral gap-1.5" data-panel-min>작게보기 ${icon('collapse', 16)}</button>
        </div>
        <div class="relative min-h-0 flex-1">
          <div class="absolute inset-0 overflow-y-auto px-6 pb-4" data-chat-scroll>
            <div class="flex min-h-full flex-col">
              <div class="m-auto flex flex-col items-center py-10 text-center" data-chat-empty>
                <p class="text-[18px] font-bold">해본 일이나 고민을 바로 남길 수 있어요</p>
                <p class="mt-2 text-base text-sub">새로운 방법을 찾고, 기록하고, 달라진 결과를 확인해 보세요.</p>
                <button type="button" class="mt-14 flex h-20 w-20 items-center justify-center rounded-full border border-line bg-white shadow-panel hover:bg-surface-2" data-mic aria-label="음성으로 말하기">${icon('mic', 32)}</button>
              </div>
              <div class="space-y-6 pt-2" data-chat-log></div>
            </div>
          </div>
          <div class="absolute inset-0 overflow-y-auto bg-white px-6" data-chat-list hidden>
            <div class="relative"><span class="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sub">${icon('search', 18)}</span>
              <input class="input h-12 border-0 bg-surface pl-11" placeholder="검색어를 입력해주세요" data-list-search aria-label="대화 검색"></div>
            <ul class="mt-6 space-y-1" data-list-items></ul>
          </div>
        </div>
        <div class="flex-none px-6 pb-6">
          ${hints ? `<div class="mb-6 flex flex-wrap gap-2" data-hints>
            <button type="button" class="hint-chip" data-hint="lunch">점심시간에 손님이 줄었어요</button>
            <button type="button" class="hint-chip" data-hint="free">비용 없이 고객을 늘리고 싶어요</button>
            <button type="button" class="hint-chip" data-hint="price">최근 메뉴 가격을 바꿨어요</button></div>` : ''}
          <form class="composer" data-chat-form>
            <label class="sr-only" for="panel-input">AI에게 말하기</label>
            <input id="panel-input" class="w-full border-0 bg-transparent p-0 text-base placeholder:text-muted focus:outline-none" placeholder="이어서 이야기해 주세요." data-chat-input autocomplete="off">
            <div class="mt-4 flex items-center justify-between">
              <a href="upload.html" class="round-btn" aria-label="자료 첨부">${icon('add', 22)}</a>
              <span class="flex gap-2"><button type="button" class="round-btn" data-mic aria-label="음성 입력">${icon('mic', 18)}</button>
                <button class="send-btn" aria-label="보내기">${icon('arrow-up', 18)}</button></span>
            </div>
          </form>
        </div>
      </aside>
      <button type="button" class="fixed bottom-8 right-8 z-30 flex h-14 items-center gap-2 rounded-full bg-heading px-5 text-[15px] font-semibold text-white shadow-pop hover:bg-black" data-ai-fab hidden>${icon('sparkling', 20)} AI 대화</button>`;

    const panel = $('[data-ai-panel]', host), fab = $('[data-ai-fab]', host);
    const chat = Chat(panel, { compact: true });
    const list = $('[data-chat-list]', panel), items = $('[data-list-items]', panel);
    const renderList = q => {
      items.innerHTML = D.chats.filter(c => !q || c.title.includes(q)).map(c => `<li><a href="${c.href}" class="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-surface-2">
        <span class="ai-avatar">${icon('sparkling', 16)}</span><span><span class="block text-sm font-semibold">${esc(c.title)}</span>
        <span class="block text-[13px] text-sub">${esc(c.meta)}</span></span></a></li>`).join('') || '<li class="py-6 text-center text-sm text-sub">검색 결과가 없어요.</li>';
    };
    renderList('');
    $('[data-list-search]', panel).addEventListener('input', e => renderList(e.target.value.trim()));
    $('[data-panel-list]', panel).addEventListener('click', () => {
      list.hidden = !list.hidden;
      $('[data-panel-title]', panel).textContent = list.hidden ? '대화' : '대화 목록';
    });
    $$('[data-mic]', panel).forEach(b => b.addEventListener('click', () => toast('음성 입력은 준비 중이에요. 아래 문장을 눌러 시작해 보세요.')));
    panel.addEventListener('click', e => { if (e.target.closest('[data-hint]')) { const h = $('[data-hints]', panel); h && h.remove(); } });

    // 넓은 화면: 오른쪽에 고정 · 좁은 화면: 버튼으로 여닫는 서랍
    const wide = matchMedia('(min-width: 1680px)');
    let open = wide.matches;
    const base = panel.className;
    function layout() {
      panel.hidden = !open; fab.hidden = open;
      host.style.width = wide.matches && open ? '552px' : '0px';
      panel.className = base + (wide.matches ? ' sticky top-20 h-[calc(100vh-112px)] w-[552px]'
        : ' fixed right-6 top-20 bottom-6 z-40 w-[552px] max-w-[calc(100vw-48px)] shadow-pop');
    }
    $('[data-panel-min]', panel).addEventListener('click', () => { open = false; layout(); });
    fab.addEventListener('click', () => { open = true; layout(); $('[data-chat-input]', panel).focus(); });
    wide.addEventListener('change', () => { open = wide.matches; layout(); });
    layout();
    return chat;
  }
  window.mountAiPanel = mountPanel;
})();
