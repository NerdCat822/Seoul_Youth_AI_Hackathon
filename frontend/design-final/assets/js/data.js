/* Trylog 목업 데이터 — 시연 기준일 2026-12-03(목) */
window.TRYLOG = {
  today: '2026-12-03',
  store: {
    name: '행복분식', owner: '행복분식 사장님', email: 'example@email.com',
    address: '서울 마포구 망원로 12', menu: '떡볶이, 김밥, 튀김',
    type: '분식', modes: ['매장 식사', '포장'], region: '마포구 분식집',
  },

  /* 상태: check(확인 필요) · progress(진행 중) · planned(시작 예정) · data(자료 확인 필요) · done(완료) · stopped(중단) */
  statusLabel: { check: '확인 필요', progress: '진행 중', planned: '시작 예정', data: '자료 확인 필요', done: '완료', stopped: '중단' },
  statusClass: { check: 'badge-check', progress: 'badge-progress', planned: 'badge-planned', data: 'badge-warn', done: 'badge-done', stopped: 'badge-planned' },

  records: [
    { id: 'r1', title: '떡볶이 세트 가격 변경', status: 'check', start: '11월 19일', startFull: '11월 19일(목)', end: '12월 2일', endFull: '12월 2일(수)',
      result: '12월 3일', resultFull: '12월 3일(목)', resultNote: '오늘', compare: '세트 메뉴 주문 건수 · 매출액', compareShort: '세트 메뉴 주문 · 매출액',
      change: ['9,000원', '8,000원'], needs: '변경 전후 메뉴별 판매 자료', progress: 100, warn: '변경 전후 메뉴별 판매 자료가 필요해요',
      calStart: 19, calEndDec: 2, resultDay: 3 },
    { id: 'r2', title: '점심 메뉴 입구 안내판', status: 'progress', start: '11월 24일', end: '12월 7일', result: '12월 8일', resultNote: 'D-5',
      compare: '점심 시간대 주문 건수', change: ['안내판 없음', '입구 안내판 설치'], needs: '점심 시간대 주문 자료', progress: 71, resultDay: 8 },
    { id: 'r3', title: '배달 앱 대표 사진 교체', status: 'progress', start: '11월 30일', end: '12월 13일', result: '12월 14일', resultNote: 'D-11',
      compare: '배달 주문 건수', change: ['기존 사진', '떡볶이 클로즈업 사진'], needs: '배달 앱 주문 자료', progress: 29, resultDay: 14 },
    { id: 'r4', title: '포장 할인 스티커', status: 'planned', start: '12월 8일', end: '12월 21일', result: '12월 22일', resultNote: '',
      compare: '포장 주문 건수', change: ['할인 없음', '포장 1,000원 할인'], needs: '포장 주문 자료', progress: 0, resultDay: 22 },
    { id: 'r5', title: '리뷰 답글 정리', status: 'done', start: '10월 6일', end: '11월 2일', result: '11월 3일', resultNote: '',
      compare: '재주문 건수', change: ['답글 없음', '모든 리뷰에 답글'], needs: '재주문 자료', progress: 100 },
    { id: 'r6', title: '저녁 할인', status: 'stopped', start: '10월 13일', end: '10월 26일', result: '—', resultNote: '',
      compare: '저녁 주문 건수', change: ['정가', '저녁 10% 할인'], needs: '저녁 주문 자료', progress: 40 },
  ],

  /* 떡볶이 세트 가격 변경 결과 (변경 전 11/5~11/18, 변경 후 11/19~12/2) */
  result: {
    before: { set: 42, total: 100 }, after: { set: 58, total: 160 },
    weekly: [{ label: '변경 전 1주', v: 20 }, { label: '변경 전 2주', v: 22 }, { label: '변경 후 1주', v: 27 }, { label: '변경 후 2주', v: 31 }],
  },

  categories: {
    menu: { label: '메뉴·가격', cls: 'cat-menu', img: 'bg-cat-menu-img' },
    store: { label: '매장 운영', cls: 'cat-store', img: 'bg-cat-store-img' },
    delivery: { label: '배달·홍보', cls: 'cat-delivery', img: 'bg-cat-delivery-img' },
  },

  ideas: [
    { id: 'i1', cat: 'menu', title: '점심 세트에 추천 표시하기', desc: '점심 세트를 메뉴판 맨 위에 둬요.', cost: '0원', ease: '바로 시작', weeks: 2, free: true, rec: true },
    { id: 'i2', cat: 'store', title: '입구에 오늘의 메뉴 안내하기', desc: '지나가는 손님에게 점심 메뉴를 알려요.', cost: '0원', ease: '쉬움', weeks: 3, free: true, rec: true },
    { id: 'i3', cat: 'delivery', title: '리뷰 답글 정리하기', desc: '리뷰에 답글 달아 재주문을 늘려요.', cost: '0원', ease: '보통', weeks: 4, free: true, rec: true },
    { id: 'i4', cat: 'menu', title: '세트 메뉴 이름 바꾸기', desc: '세트 이름을 바꿔 주문을 늘려요.', cost: '0원', ease: '바로 시작', weeks: 2, free: true },
    { id: 'i5', cat: 'store', title: '점심 전 미리 주문 안내 붙이기', desc: '계산대 안내문으로 점심 회전을 높여요.', cost: '5천 원', ease: '바로 시작', weeks: 2, free: false },
    { id: 'i6', cat: 'delivery', title: '최근 리뷰에 답글 달기', desc: '리뷰에 답글 달아 재방문을 늘려요.', cost: '0원', ease: '바로 시작', weeks: 2, free: true },
    { id: 'i7', cat: 'menu', title: '계산할 때 다음 메뉴 추천하기', desc: '계산할 때 다음 메뉴를 추천해요.', cost: '0원', ease: '쉬움', weeks: 3, free: true },
    { id: 'i8', cat: 'store', title: '매장 입구에 점심 메뉴 안내하기', desc: '입구에서 점심 메뉴를 바로 보여요.', cost: '낮음', ease: '쉬움', weeks: 2, free: false },
    { id: 'i9', cat: 'delivery', title: '배달 앱 대표 사진 교체', desc: '대표 메뉴 사진을 밝고 크게 바꿔요.', cost: '낮음', ease: '쉬움', weeks: 2, free: false },
    { id: 'i10', cat: 'menu', title: '세트 구성 바꾸기', desc: '인기 메뉴와 음료로 세트를 만들어요.', cost: '0원', ease: '보통', weeks: 2, free: true },
    { id: 'i11', cat: 'store', title: '혼잡 시간 대기 안내', desc: '대기 시간을 안내해 이탈을 줄여요.', cost: '낮음', ease: '쉬움', weeks: 2, free: false },
    { id: 'i12', cat: 'delivery', title: '포장 할인 스티커 붙이기', desc: '포장 주문에 할인 스티커를 붙여요.', cost: '낮음', ease: '쉬움', weeks: 2, free: false },
  ],

  /* ID-02 상세 (i1 기준, 나머지는 같은 틀에 카드 정보로 채움) */
  ideaDetail: {
    i1: {
      lead: '메뉴판과 배달 앱에서 점심 세트를 가장 먼저 보이게 해, 점심 손님이 고민 없이 고를 수 있게 해요.',
      prep: '약 30분', compare: '점심 세트 주문 건수, 매출액',
      how: '변경 전후 2주 동안 점심 세트 주문 건수와 매출액을 비교해요.',
      todo: [
        ['메뉴판 · 배달 앱 메뉴 수정 권한', '휴대폰으로 찍어도 괜찮아요. 밝은 곳에서 위에서 찍으면 잘 보여요.'],
        ['"추천" 표시 문구 또는 스티커', '기존 메뉴판 첫 줄을 비우거나, 메뉴판 위에 A4 한 장을 붙여주세요.'],
        ['바꾸기 전 2주 판매 자료', '나중에 결과를 볼 때 필요해요. POS에서 내려받을 수 있어요.'],
      ],
      steps: [
        ['메뉴판 맨 위에 점심 세트를 배치하고 "추천"을 표시해요.', '대표 메뉴가 여러 개라면, 이번 2주 동안은 하나만 정해서 시작해보세요.'],
        ['배달 앱에서도 점심 세트를 대표 메뉴로 설정해요.', '가격은 지금 그대로 둬도 괜찮아요.'],
        ['2주 동안 다른 메뉴 변경 없이 그대로 운영해요.', '같은 기간에 다른 일을 하면 결과의 정확한 이유를 알기 어려워요.'],
      ],
      fit: ['점심 세트를 이미 운영하고 있는 가게', '점심 시간대 주문이 줄었다고 느끼는 가게'],
      peers: { base: '서울 분식집 · 하루 주문 80~150건 기준', total: 8, up: 4, same: 2, down: 1, unknown: 1 },
    },
  },

  notifications: [
    { id: 'n1', icon: 'calendar-check', title: '결과를 확인할 날이에요', body: '떡볶이 세트 가격 변경 · 2주 기록이 끝났어요.', time: '오늘 오전 9:00', unread: true, href: 'record.html?id=r1' },
    { id: 'n2', icon: 'inbox', title: '판매 자료를 올려 주세요', body: '변경 전 판매 자료가 필요해요.', time: '어제', unread: true, href: 'upload.html' },
    { id: 'n3', icon: 'calendar-check', title: '결과를 확인할 날이에요', body: '리뷰 답글 정리 · 결과를 확인할 수 있어요.', time: '11월 3일', unread: false, href: 'result.html' },
    { id: 'n4', icon: 'upload', title: '판매 자료를 올려 주세요', body: '배달 앱 대표 사진 교체 · 변경 전 주문 자료가 필요해요.', time: '10월 30일', unread: false, href: 'upload.html' },
  ],

  chats: [
    { id: 'c1', title: '점심시간 손님이 줄었어요', meta: '오늘 · 해볼 일 2개 제안', href: 'ai.html' },
    { id: 'c2', title: '떡볶이 세트 가격 변경 결과', meta: '어제 · 기록 연결됨', href: 'result.html' },
    { id: 'c3', title: '배달 앱 대표 사진 바꾸기', meta: '11월 30일 · 기록 연결됨', href: 'record.html?id=r3' },
    { id: 'c4', title: '점심 메뉴 입구 안내판', meta: '11월 24일 · 기록 연결됨', href: 'record.html?id=r2' },
    { id: 'c5', title: '비용 없이 손님 늘리는 방법', meta: '11월 21일', href: 'ai.html?topic=free' },
    { id: 'c6', title: '리뷰 답글 어떻게 달까요', meta: '11월 2일', href: 'ai.html?topic=review' },
  ],

  /* 앞으로 7일 예상매출 (12/4~12/10) */
  forecast: [
    { d: '12/4', w: '목', v: 168000 }, { d: '12/5', w: '금', v: 215000 }, { d: '12/6', w: '토', v: 248000 }, { d: '12/7', w: '일', v: 196000 },
    { d: '12/8', w: '월', v: 152000 }, { d: '12/9', w: '화', v: 171000 }, { d: '12/10', w: '수', v: 200000 },
  ],

  uploads: [
    { date: '12월 3일', file: 'POS_1120.jpg', kind: '사진', range: '11월 20일', items: '매출 · 주문 · 세트 주문' },
    { date: '11월 19일', file: '판매자료_11월.xlsx', kind: '엑셀', range: '11월 1일 ~ 11월 18일', items: '매출 · 주문 · 메뉴별' },
    { date: '11월 2일', file: '직접 입력', kind: '', range: '10월 1일 ~ 10월 31일', items: '매출' },
  ],
};
