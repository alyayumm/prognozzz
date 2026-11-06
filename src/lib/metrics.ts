import type { City, DailyRecord, EventItem, Metric, MetricAggregate, MonthConfig, WeekSummary } from "../types";
import { getMonthDates } from "../utils/date";
import { buildWeeklySummary } from "../utils/report";
import { hasActualRecord, isPendingPsSale, isPsSale } from "./psSales";
import { isCitySale, selectedSalesCount, selectedSalesFactsAvailable } from "./salesDateBasis";

export type ReportScope = "Все" | "МСК" | "СПБ";
export type TrafficMode = "op" | "marketing";
export type MetricTotal = MetricAggregate;
export type MetricTotals = Record<Metric, MetricTotal>;
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
      recommendations: total(metricRecords, "recommendations"),
      omQualified: total(metricRecords, "omQualified"),
      omLeads: total(metricRecords, "omLeads"),
      ...selectedSalesAvailability(metricRecords),
    };
    return acc;
  }, {} as MetricTotals);
}

export function buildOverallMonths(records: DailyRecord[], events: EventItem[], months: MonthConfig[]) {
  const uniqueMonths = [...new Map(months.map((month) => [month.monthKey, month])).values()];
  const reportRecords = filterRecordsByScope(records, "Все");

  return uniqueMonths
    .map((month) => {
      const monthRecords = reportRecords.filter((record) => record.date.startsWith(month.monthKey));
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

export function buildConversions(totals: MetricTotals, trafficMode: TrafficMode = "op") {
  const opLeads = totals["Лиды"]?.fact ?? 0;
  const omLeads = totals["Лиды"]?.omLeads ?? 0;
  const marketingLeads = opLeads + omLeads;
  const leads = trafficMode === "marketing" ? marketingLeads : opLeads;
  const opQualified = totals["Квалы"]?.fact ?? 0;
  const omQualified = totals["Квалы"]?.omQualified ?? 0;
  const marketingQualified = opQualified + omQualified;
  const qualified = trafficMode === "marketing" ? marketingQualified : opQualified;
  const sales = totals["Продажи"]?.fact ?? 0;

  return {
    salesAvailable: totals["Продажи"]?.factAvailable !== false,
    salesDateBasis: totals["Продажи"]?.salesDateBasis,
    leadToQualified: percent(qualified, leads),
    qualifiedToSale: percent(sales, qualified),
    leadToSale: percent(sales, leads),
    opLeadToQualified: percent(opQualified, opLeads),
    marketingLeadToQualified: percent(marketingQualified, marketingLeads),
    opQualified,
    marketingQualified,
    omQualified,
    opLeads,
    marketingLeads,
    omLeads,
  };
}

export function applyTrafficModeToTotals(totals: MetricTotals, trafficMode: TrafficMode): MetricTotals {
  return Object.fromEntries(
    Object.entries(totals).map(([metric, item]) => [
      metric,
      metricTotalForTraffic(metric as Metric, item, trafficMode),
    ]),
  ) as MetricTotals;
}

export function metricTotalForTraffic(metric: Metric, totalValue: MetricTotal, trafficMode: TrafficMode): MetricTotal {
  if (trafficMode !== "marketing" || (metric !== "Квалы" && metric !== "Лиды")) return totalValue;
  return {
    ...totalValue,
    fact: totalValue.fact + (metric === "Квалы" ? totalValue.omQualified : totalValue.omLeads ?? 0),
  };
}

export function metricFactForTraffic(metric: Metric, totalValue: MetricTotal, trafficMode: TrafficMode): number {
  return metricTotalForTraffic(metric, totalValue, trafficMode).fact;
}

export function trafficModeLabel(trafficMode: TrafficMode): string {
  return trafficMode === "marketing" ? "Трафик маркетинг" : "Трафик ОП";
}

export function getPeriodStatus(totals: MetricTotals) {
  const deviations = Object.values(totals)
    .filter((item) => item.forecast > 0)
    .map((item) => ((item.fact - item.forecast) / item.forecast) * 100);

  if (!deviations.length) {
    return { label: "", tone: "neutral" as const };
  }

  const minDeviation = Math.min(...deviations);
  const maxDeviation = Math.max(...deviations);

  if (minDeviation < -5) {
    return { label: "сильное отклонение", tone: "danger" as const };
  }

  if (maxDeviation > 5) {
    return { label: "сильное отклонение", tone: "good" as const };
  }

  return { label: "", tone: "neutral" as const };
}

export function getRecordsPeriodStatus(records: DailyRecord[], trafficMode: TrafficMode = "op") {
  // A partial month must be compared with the forecast for the same imported dates.
  const lastFactByCityMonth = new Map<string, string>();
  const periodKey = (record: DailyRecord) => `${record.city}|${record.date.slice(0, 7)}`;
  for (const record of records) {
    if (hasActualRecord(record)) {
      const key = periodKey(record);
      if (record.date > (lastFactByCityMonth.get(key) ?? "")) lastFactByCityMonth.set(key, record.date);
    }
  }
  const comparableRecords = records.filter((record) => !isPendingPsSale(record) && record.date <= (lastFactByCityMonth.get(periodKey(record)) ?? ""));
  const metricKeys = [...new Set(records.map((record) => record.metric))];
  return getPeriodStatus(applyTrafficModeToTotals(buildMetricTotals(comparableRecords, metricKeys), trafficMode));
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

export function total(records: DailyRecord[], key: "plan" | "fact" | "forecast" | "recommendations" | "omQualified" | "omLeads"): number {
  return records.reduce((sum, record) => sum + recordMetricValue(record, key), 0);
}

export function netFact(record: DailyRecord): number {
  if (record.salesDateBasis && isCitySale(record)) return selectedSalesCount(record) ?? 0;
  if (isPendingPsSale(record)) return 0;
  if (isPsSale(record)) return Math.max(0, Number(record.fact || 0));
  return Math.max(0, Number(record.fact || 0) - recommendationValue(record));
}

export function selectedSalesAvailability(records: DailyRecord[]): Pick<MetricAggregate, "factAvailable" | "salesDateBasis" | "salesObservationPresent"> {
  const selected = records.filter((record) => record.salesDateBasis && isCitySale(record));
  if (!selected.length) return {};
  return { factAvailable: selectedSalesFactsAvailable(selected), salesDateBasis: selected[0].salesDateBasis, salesObservationPresent: selected.some(hasActualRecord) };
}

export function recommendationValue(record: DailyRecord): number {
  return Math.max(0, Number(record.recommendations || 0));
}

export function omQualifiedValue(record: DailyRecord): number {
  return record.metric === "Квалы" ? Math.max(0, Number(record.omQualified || 0)) : 0;
}

export function omLeadsValue(record: DailyRecord): number {
  return record.metric === "Лиды" ? Math.max(0, Number(record.omLeads || 0)) : 0;
}

function recordMetricValue(record: DailyRecord, key: "plan" | "fact" | "forecast" | "recommendations" | "omQualified" | "omLeads"): number {
  if (key === "fact") return netFact(record);
  if (key === "recommendations") return recommendationValue(record);
  if (key === "omQualified") return omQualifiedValue(record);
  if (key === "omLeads") return omLeadsValue(record);
  return Number(record[key] || 0);
}

export function dateRangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

function getMonthEndIso(dateIso: string): string {
  const [year, month] = dateIso.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}
