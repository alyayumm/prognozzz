import type { City, DailyRecord, EventItem, Metric, MonthConfig, WeekSummary } from "../types";
import { getMonthDates } from "../utils/date";
import { buildWeeklySummary } from "../utils/report";

export type ReportScope = "Все" | "МСК" | "СПБ";
export type MetricTotals = Record<Metric, { plan: number; fact: number; forecast: number }>;
export type ConversionKey = "leadToQualified" | "qualifiedToSale" | "leadToSale";

export const reportCities: City[] = ["МСК", "СПБ"];
export const reportScopes: ReportScope[] = ["Все", "МСК", "СПБ"];

export function filterRecordsByScope(records: DailyRecord[], scope: ReportScope): DailyRecord[] {
  if (scope === "Все") {
    const cityKeys = new Set(records.filter((record) => reportCities.includes(record.city as City)).map((record) => `${record.date}|${record.metric}`));
    return records.filter((record) => {
      const key = `${record.date}|${record.metric}`;
      return reportCities.includes(record.city as City) || (record.city === "Все" && !cityKeys.has(key));
    });
  }

  return records.filter((record) => {
    return record.city === scope;
  });
}

export function filterEventsByScope(events: EventItem[], scope: ReportScope): EventItem[] {
  if (scope === "Все") return events.filter((event) => event.city !== "сообщения");
  return events.filter((event) => event.city === "все" || event.city === "МСК + СПБ" || event.city === scope);
}

export function filterEventsForRange(events: EventItem[], startDate?: string, endDate?: string): EventItem[] {
  if (!startDate || !endDate) return [];
  return events.filter((event) => dateRangesOverlap(startDate, endDate, event.startDate, event.endDate));
}

export function buildMetricTotals(records: DailyRecord[], metrics: Metric[]): MetricTotals {
  return metrics.reduce<MetricTotals>((acc, metric) => {
    const metricRecords = records.filter((record) => record.metric === metric);
    acc[metric] = {
      plan: total(metricRecords, "plan"),
      fact: total(metricRecords, "fact"),
      forecast: total(metricRecords, "forecast"),
    };
    return acc;
  }, {} as MetricTotals);
}

export function buildOverallMonths(records: DailyRecord[], events: EventItem[], months: MonthConfig[]) {
  return months
    .map((month) => {
      const monthRecords = records.filter((record) => record.date.startsWith(month.monthKey));
      const monthDates = getMonthDates(month.year, month.monthIndex, month.daysInMonth);
      return {
        config: month,
        dates: monthDates,
        events: filterEventsForRange(events, monthDates[0], monthDates[monthDates.length - 1]),
        weeks: buildWeeklySummary(monthRecords, events),
      };
    })
    .filter((month) => month.weeks.length > 0);
}

export function buildConversions(totals: MetricTotals) {
  const leads = totals["Лиды"]?.fact ?? 0;
  const qualified = totals["Квалы"]?.fact ?? 0;
  const sales = totals["Продажи"]?.fact ?? 0;

  return {
    leadToQualified: percent(qualified, leads),
    qualifiedToSale: percent(sales, qualified),
    leadToSale: percent(sales, leads),
  };
}

export function getPeriodStatus(totals: MetricTotals) {
  const deviations = Object.values(totals)
    .filter((item) => item.plan > 0)
    .map((item) => ((item.fact - item.plan) / item.plan) * 100);

  if (!deviations.length) {
    return { label: "", tone: "neutral" as const };
  }

  const minDeviation = Math.min(...deviations);
  const maxDeviation = Math.max(...deviations);

  if (minDeviation <= -5) {
    return { label: "сильное отклонение", tone: "danger" as const };
  }

  if (maxDeviation >= 5) {
    return { label: "сильное отклонение", tone: "good" as const };
  }

  return { label: "", tone: "neutral" as const };
}

export function getMonthTiming(monthDates: string[], todayIso: string) {
  if (!monthDates.length) return { passed: 0, left: 0, isClosed: false };

  const isClosed = isDateInClosedMonth(monthDates[0], todayIso);
  if (isClosed) return { passed: monthDates.length, left: 0, isClosed };

  const passed = monthDates.filter((date) => date <= todayIso).length;
  return {
    passed: Math.min(Math.max(passed, 0), monthDates.length),
    left: Math.max(monthDates.length - passed, 0),
    isClosed,
  };
}

export function shouldShowForecastForWeek(week: WeekSummary, todayIso: string): boolean {
  return !isDateInClosedMonth(week.startDate, todayIso) && week.endDate >= todayIso;
}

export function isDateInClosedMonth(dateIso: string, todayIso: string): boolean {
  return getMonthEndIso(dateIso) < todayIso;
}

export function percent(value: number, base: number): number {
  if (!base) return 0;
  return Math.round((value / base) * 100);
}

export function total(records: DailyRecord[], key: "plan" | "fact" | "forecast"): number {
  return records.reduce((sum, record) => sum + record[key], 0);
}

export function dateRangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

function getMonthEndIso(dateIso: string): string {
  const [year, month] = dateIso.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}
