export type City = "МСК" | "СПБ" | "сообщения";
export type SourceRecordCity = "источники";
export type DailyRecordCity = City | "Все" | SourceRecordCity;
export type Metric = "Лиды" | "Квалы" | "Продажи";
export type PlanByCity = Record<City, Record<Metric, number>>;
export type WeekdayCoefficientKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export type ForecastCoefficients = Record<City, Record<Metric, Record<WeekdayCoefficientKey, number>>>;
export type Effect = "положительный" | "негативный" | "неизвестно";
export type EventGroup = "internal" | "external";
export type EventSource = "manual" | "google_sheets" | "system";
export type EventCity = City | "все" | "МСК + СПБ";
export type EventType =
  | "рекламные изменения"
  | "сезонность"
  | "праздники"
  | "техработы"
  | "конкуренты"
  | "продуктовые изменения"
  | "прочее";

export interface DailyRecord {
  id: string;
  date: string;
  city: DailyRecordCity;
  channel: string;
  metric: Metric;
  plan: number;
  fact: number;
  forecast: number;
  recommendations: number;
  omQualified: number;
  comment?: string;
  updatedAt?: string;
}

export interface MonthConfig {
  monthKey: string;
  label: string;
  year: number;
  monthIndex: number;
  daysInMonth: number;
  plan: Record<Metric, number>;
  plansByCity?: PlanByCity;
  dailyAverageByCity?: PlanByCity;
  status?: "active" | "closed";
}

export interface DailyValueUpdate {
  id?: string;
  date: string;
  city: DailyRecordCity;
  channel?: string;
  metric: Metric;
  plan?: number;
  fact?: number;
  forecast?: number;
  recommendations?: number;
  omQualified?: number;
  comment?: string;
}

export type DailyFactDraft = PlanByCity;
export type SavedDailyValues = DailyRecord[];

export interface WeeklyAggregates {
  week: number;
  startDate: string;
  endDate: string;
  totals: Record<Metric, { plan: number; fact: number; forecast: number; recommendations: number; omQualified: number }>;
}

export interface MonthlyAggregates {
  monthKey: string;
  totals: Record<Metric, { plan: number; fact: number; forecast: number; recommendations: number; omQualified: number }>;
}

export interface CreateMonthPayload {
  year: number;
  monthIndex: number;
  plansByCity: PlanByCity;
  dailyAverageByCity?: PlanByCity;
}

export interface EventItem {
  id: string;
  startDate: string;
  endDate: string;
  title: string;
  type: EventType;
  group: EventGroup;
  source: EventSource;
  expectedEffect: Effect;
  actualEffect: Effect;
  importance: 1 | 2 | 3;
  city: EventCity;
  metric: Metric | "все";
  leadSource?: string;
  description: string;
}

export interface WeekSummary {
  week: number;
  startDate: string;
  endDate: string;
  totals: Record<Metric, { plan: number; fact: number; forecast: number; recommendations: number; omQualified: number }>;
  open: number;
  high: number;
  low: number;
  close: number;
  events: EventItem[];
}

export type BrandCity = Extract<City, "МСК" | "СПБ">;
export type BrandBranchPlatform = "Яндекс Карты" | "Google Карты" | "2ГИС";

export interface BrandPerformanceWeekly {
  id: string;
  weekStart: string;
  monthKey: string;
  city: BrandCity;
  brand: string;
  domain: string;
  source: string;
  leads: number;
  qualified: number;
  sales: number;
  revenue: number;
  budget: number;
  roas: number | null;
  cpl: number;
  cpql: number;
  saleCost: number;
  avgCheck: number;
}

export interface BrandBranchWeekly {
  id: string;
  weekStart: string;
  monthKey: string;
  city: BrandCity;
  platform: BrandBranchPlatform;
  brand: string;
  rawBrand: string;
  branches: number;
}

export interface BrandAlias {
  raw: string;
  brand: string;
}

export interface BrandEvent {
  id: string;
  brand: string;
  city: BrandCity | "Все";
  weekStart: string;
  metric: string;
  direction: "рост" | "падение";
  percent: number;
}
