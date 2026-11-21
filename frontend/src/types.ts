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
  source: 'DATABASE' | 'UPLOAD';
  persisted: boolean;
  targetMenuCode: string;
  before: ReportPeriod;
  after: ReportPeriod;
  shareDeltaPp: number;
  excludedRefundLines: number;
  excludedUnknownRefundLines: number;
  summary: string;
}

export interface Overview {
  storeId: number;
  storeName: string;
  today: string;
  storageMode: 'POSTGRESQL';
  writeEnabled: boolean;
  demo: boolean;
}

export interface Menu {
  menuCode: string;
  menuName: string;
  unitPrice: number | null;
}

export interface ExperimentInput {
  title: string;
  category: Category;
  actionType: string;
  targetMenuCode: string | null;
  startDate: string;
  endDate: string;
  notes: string;
}

export interface Experiment extends ExperimentInput {
  id: string;
  storeId: number;
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
  menus: Menu[];
  experiments: Experiment[];
  cases: NeighborhoodCase[];
}
