interface CaseGuide {
  lead: string;
  prep: string;
  compare: string;
  how: string;
  todo: [string, string][];
  steps: [string, string][];
  fit: string[];
}

// Text from design-final/assets/js/data.js, ideaDetail.i1 (the lunch-set recommendation).
export const menuBadgeGuide: CaseGuide = {
  lead: '메뉴판과 배달 앱에서 점심 세트를 가장 먼저 보이게 해, 점심 손님이 고민 없이 고를 수 있게 해요.',
  prep: '약 30분',
  compare: '점심 세트 주문 건수, 매출액',
  how: '변경 전후 2주 동안 점심 세트 주문 건수와 매출액을 비교해요.',
  todo: [
    [
      '메뉴판 · 배달 앱 메뉴 수정 권한',
      '휴대폰으로 찍어도 괜찮아요. 밝은 곳에서 위에서 찍으면 잘 보여요.',
    ],
    [
      '"추천" 표시 문구 또는 스티커',
      '기존 메뉴판 첫 줄을 비우거나, 메뉴판 위에 A4 한 장을 붙여주세요.',
    ],
    ['바꾸기 전 2주 판매 자료', '나중에 결과를 볼 때 필요해요. POS에서 내려받을 수 있어요.'],
  ],
  steps: [
    [
      '메뉴판 맨 위에 점심 세트를 배치하고 "추천"을 표시해요.',
      '대표 메뉴가 여러 개라면, 이번 2주 동안은 하나만 정해서 시작해보세요.',
    ],
    ['배달 앱에서도 점심 세트를 대표 메뉴로 설정해요.', '가격은 지금 그대로 둬도 괜찮아요.'],
    [
      '2주 동안 다른 메뉴 변경 없이 그대로 운영해요.',
      '같은 기간에 다른 일을 하면 결과의 정확한 이유를 알기 어려워요.',
    ],
  ],
  fit: ['점심 세트를 이미 운영하고 있는 가게', '점심 시간대 주문이 줄었다고 느끼는 가게'],
};
