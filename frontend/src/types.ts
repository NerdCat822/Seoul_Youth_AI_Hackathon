export type Category = 'MENU' | 'OPERATION' | 'MARKETING';
export type Difficulty = 'EASY' | 'PREPARE' | 'PLAN';
export type ExperimentStatus = 'PLANNED' | 'IN_PROGRESS' | 'READY' | 'COMPLETED';

export interface ReportPeriod {
  startDate: string;
  endDate: string;
  targetOrders: number;
  totalOrders: number;
  sharePct: number;
  sales: number;
}

export interface SalesReport {
  targetMenuCode: string;
  before: ReportPeriod;
  after: ReportPeriod;
  shareDeltaPp: number;
  excludedRefundLines: number;
  summary: string;
}

export interface Overview {
  storeName: string;
  today: string;
  storageMode: 'MEMORY';
  demo: boolean;
}

export interface ExperimentInput {
  title: string;
  category: Category;
  startDate: string;
  endDate: string;
  notes: string;
}

export interface Experiment extends ExperimentInput {
  id: string;
  checkDate: string;
  status: ExperimentStatus;
}

export interface NeighborhoodCase {
  id: string;
  title: string;
  category: Category;
  difficulty: Difficulty;
  cost: number;
  durationDays: number;
  summary: string;
  tip: string;
  sampleSize: number;
  improved: number;
  unchanged: number;
  declined: number;
  demo: boolean;
}

export interface AppData {
  overview: Overview;
  experiments: Experiment[];
  cases: NeighborhoodCase[];
}
