import type { Category, Difficulty, ExperimentStatus } from '../types';

export const categories: Record<Category, string> = {
  MENU: '메뉴·가격',
  OPERATION: '가게 운영',
  MARKETING: '홍보·판매',
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
};
