export type City = "МСК" | "СПБ" | "сообщения";
export type DailyRecordCity = City | "Все";
export type Metric = "Лиды" | "Квалы" | "Продажи";
export type PlanByCity = Record<City, Record<Metric, number>>;
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
  comment?: string;
}

export interface MonthConfig {
  monthKey: string;
  label: string;
  year: number;
  monthIndex: number;
  daysInMonth: number;
  plan: Record<Metric, number>;
  plansByCity?: PlanByCity;
  status?: "active" | "closed";
}

export interface DailyValueUpdate {
  date: string;
  city: City;
  metric: Metric;
  plan?: number;
  fact?: number;
  forecast?: number;
  comment?: string;
}

export type DailyFactDraft = PlanByCity;
export type SavedDailyValues = DailyRecord[];

export interface WeeklyAggregates {
  week: number;
  startDate: string;
  endDate: string;
  totals: Record<Metric, { plan: number; fact: number; forecast: number }>;
}

export interface MonthlyAggregates {
  monthKey: string;
  totals: Record<Metric, { plan: number; fact: number; forecast: number }>;
}

export interface CreateMonthPayload {
  year: number;
  monthIndex: number;
  plansByCity: PlanByCity;
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
  description: string;
}

export interface WeekSummary {
  week: number;
  startDate: string;
  endDate: string;
  totals: Record<Metric, { plan: number; fact: number; forecast: number }>;
  open: number;
  high: number;
  low: number;
  close: number;
  events: EventItem[];
}
