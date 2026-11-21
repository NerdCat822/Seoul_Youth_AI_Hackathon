export type Category = 'MENU' | 'OPERATION' | 'MARKETING';
export type Difficulty = 'EASY' | 'PREPARE' | 'PLAN';
export type ExperimentStatus = 'PLANNED' | 'IN_PROGRESS' | 'READY' | 'COMPLETED';

export interface AuthSession {
  authenticated: boolean;
  storeId: number | null;
  storeName: string | null;
  signupEnabled: boolean;
  csrfToken: string;
}

export interface StoreAddress {
  postalCode: string;
  address: string;
  megaCd: string;
  megaNm: string;
  ctyCd: string;
  ctyNm: string;
}

export interface Upjong {
  upjongCd: string;
  upjongNm: string;
}

export interface SignupInput extends StoreAddress {
  loginId: string;
  password: string;
  storeName: string;
  upjong: string;
  addressDetail: string;
  openTime?: string;
  closeTime?: string;
  openedDate?: string;
  closedWeekdays?: number[];
}

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
  upjongCd: string | null;
  upjongNm: string | null;
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

export interface ChatSession {
  id: string;
  title: string;
  experimentId: string | null;
  experimentTitle: string | null;
  createdAt: string;
  lastMessageAt: string;
  messageCount: number;
  preview: string | null;
}

export interface ChatMessage {
  id: number;
  role: 'USER' | 'ASSISTANT';
  content: string;
  payload: unknown;
  createdAt: string;
}

// 메시지 payload 안의 제안 카드. 그때 화면에 보여 준 내용을 그대로 담는다.
export interface ChatCard {
  caseId: string;
  category: string;
  title: string;
  summary: string;
  meta: string;
}

export interface ChatConversation {
  session: ChatSession;
  messages: ChatMessage[];
}

// 에이전트 서버(/api/v1/agent/chat)의 응답
export interface AgentIdea {
  id: string;
  title: string;
  category: Category;
  difficulty: Difficulty;
  cost: number;
  durationDays: number;
  summary: string;
  reason: string;
}

export interface AgentChatResponse {
  threadId: string;
  status: 'ASKING' | 'AWAITING_CONFIRM' | 'IDEAS' | 'SAVED' | 'CANCELLED' | 'GUIDE';
  reply: string;
  draft: {
    title: string;
    category: Category;
    startDate: string;
    endDate: string;
    notes: string;
  } | null;
  extra: {
    targetMenuCode?: string | null;
    targetMenuName?: string | null;
    actionType?: string | null;
    metric?: string | null;
  };
  notices: string[];
  experiment: Experiment | null;
  ideas: AgentIdea[];
  source: 'LLM' | 'RULES';
}

// 대화 내역에 한 번 주고받은 말을 남길 때 보내는 본문
export interface ChatExchange {
  title: string;
  experimentId: string | null;
  messages: {
    role: 'USER' | 'ASSISTANT';
    content: string;
    payload: { cards: ChatCard[]; options: string[] } | null;
  }[];
}

export interface AppData {
  overview: Overview;
  menus: Menu[];
  experiments: Experiment[];
  cases: NeighborhoodCase[];
}
