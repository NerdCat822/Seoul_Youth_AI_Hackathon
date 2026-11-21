import type { Category, Difficulty, ExperimentStatus } from '../types';

export const categories: Record<Category, string> = {
  MENU: '메뉴·가격',
  OPERATION: '가게 운영',
  MARKETING: '홍보·판매',
};

export const actions: Record<string, string> = {
  MENU_BADGE: '추천 표시 붙이기',
  SET_BUNDLE: '세트 구성 바꾸기',
  PRICE_CHANGE: '가격 바꾸기',
  MENU_COPY_PHOTO: '메뉴 설명·사진 바꾸기',
  STORE_SIGNAGE: '가게 안내 바꾸기',
  HOURS_OPERATION: '운영 시간·방식 바꾸기',
  DISCOUNT_COUPON: '할인·쿠폰 제공하기',
  LOCAL_PROMO: '가게 홍보하기',
};
export const difficulties: Record<Difficulty, string> = {
  EASY: '바로 해봐요',
  PREPARE: '조금 준비해요',
  PLAN: '계획이 필요해요',
};
export const statuses: Record<ExperimentStatus, string> = {
  PLANNED: '시작 예정',
  IN_PROGRESS: '진행 중',
  READY: '확인할 차례',
  COMPLETED: '결과 확인 완료',
};
