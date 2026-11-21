import type { NeighborhoodCase } from '../types';
import menuRecommend from './case-thumbnails/01-menu-recommend.gif';
import menuDescription from './case-thumbnails/02-menu-description.gif';
import menuPhoto from './case-thumbnails/03-menu-photo.gif';
import takeoutSign from './case-thumbnails/04-takeout-sign.gif';
import prepOrder from './case-thumbnails/05-prep-order.gif';
import storeProfile from './case-thumbnails/06-store-profile.gif';

type PublicCase = Pick<
  NeighborhoodCase,
  'id' | 'title' | 'summary' | 'category' | 'difficulty' | 'cost'
> & {
  thumbnail: string;
};

// Public editorial previews for the welcome page. Signed-in screens use /cases
// for the case content and use only the thumbnail from this list.
export const publicCases: PublicCase[] = [
  {
    id: 'menu-badge',
    title: '점심 세트에 추천 표시 붙이기',
    summary: '점심 세트 메뉴판에 추천 별을 붙여요.',
    category: 'MENU',
    difficulty: 'EASY',
    cost: 0,
    thumbnail: menuRecommend,
  },
  {
    id: 'menu-description',
    title: '세트 메뉴 설명을 알기 쉽게 바꾸기',
    summary: '메뉴판에 세트 구성 설명을 덧붙여요.',
    category: 'MENU',
    difficulty: 'EASY',
    cost: 0,
    thumbnail: menuDescription,
  },
  {
    id: 'menu-photo',
    title: '메뉴 사진을 잘 보이는 곳에 두기',
    summary: '세트 사진을 메뉴판 첫 장에 배치해요.',
    category: 'MENU',
    difficulty: 'PREPARE',
    cost: 5000,
    thumbnail: menuPhoto,
  },
  {
    id: 'pickup-sign',
    title: '포장 주문 안내를 입구에 놓기',
    summary: '가게 입구에 포장 안내판을 놓아요.',
    category: 'OPERATION',
    difficulty: 'PREPARE',
    cost: 0,
    thumbnail: takeoutSign,
  },
  {
    id: 'quiet-hours',
    title: '한산한 시간에 준비 순서 바꾸기',
    summary: '재료 준비 트레이의 순서를 바꿔요.',
    category: 'OPERATION',
    difficulty: 'PLAN',
    cost: 0,
    thumbnail: prepOrder,
  },
  {
    id: 'shop-intro',
    title: '가게 소개에 대표 메뉴 한 줄 더하기',
    summary: '휴대폰 속 가게 소개에 대표 메뉴를 추가해요.',
    category: 'MARKETING',
    difficulty: 'EASY',
    cost: 0,
    thumbnail: storeProfile,
  },
];

export const thumbnailByCaseId = new Map(publicCases.map((item) => [item.id, item.thumbnail]));
