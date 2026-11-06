import type { DemandOutcomeRecord, DemandOutcomeSnapshot } from "../api/demandOutcomesApi";
import type { WordstatDemandRecord } from "../api/wordstatApi";
import { buildDemandYearSeries, MONTH_LABELS } from "./wordstatDemand";

export type DemandComparisonCity = "Все" | "МСК" | "СПБ";
export type DemandComparisonMode = "yoy" | "index";
type Count = number | null;

export interface DemandComparisonMonth {
  month: string;
  label: string;
  complete: boolean;
  demand: Count;
  previousDemand: Count;
  sales: Count;
  previousSales: Count;
  losses: Count;
  previousLosses: Count;
  demandYoY: Count;
  salesYoY: Count;
  lossesYoY: Count;
  expectedSales: Count;
  salesGap: Count;
  plotDemand: Count;
  plotSales: Count;
  plotLosses: Count;
}

export interface AlignedDemandSummary {
  months: string[];
  demandCurrent: Count;
  demandPrevious: Count;
  outcomeCurrent: Count;
  outcomePrevious: Count;
  demandYoY: Count;
  outcomeYoY: Count;
  expected: Count;
  gap: Count;
}

export type Correlation = { n: number; r: number | null };

/** Keep each last successful source independently when a later read fails. */
export function preserveDemandOutcomeSources(previous: DemandOutcomeSnapshot | null, next: DemandOutcomeSnapshot): DemandOutcomeSnapshot {
  if (!previous) return next;
  let records = [...next.records];
  const fallbackWarnings: string[] = [];
  const sources = next.sources.map((source) => {
    const priorSource = previous.sources.find((item) => item.key === source.key && item.status !== "error");
    const priorRecords = previous.records.filter((record) => record.metric === source.key);
    if (!priorSource || !priorRecords.length) return source;
    const priorTimestamp = Date.parse(priorSource.readAt);
    const nextTimestamp = Date.parse(source.readAt);
    const olderCache = source.status === "cached" && Number.isFinite(priorTimestamp) && (!Number.isFinite(nextTimestamp) || priorTimestamp > nextTimestamp);
    if (source.status !== "error" && !olderCache) return source;
    const warning = `${source.key === "sales" ? "Продажи" : "Сливы"}: ${olderCache ? "серверный кеш старее; сохранена более свежая последняя успешная выгрузка" : "источник сейчас недоступен; показана последняя успешная выгрузка"}.`;
    fallbackWarnings.push(warning);
    records = [...records.filter((record) => record.metric !== source.key), ...priorRecords];
    return { ...priorSource, status: "cached" as const, warnings: [...new Set([...priorSource.warnings, ...source.warnings, warning])] };
  });
  if (!fallbackWarnings.length) return next;
  return {
    ...next, records, sources, status: "partial",
    warnings: [...new Set([...next.warnings, ...fallbackWarnings])],
  };
}

export function moscowCurrentMonth(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en", { timeZone: "Europe/Moscow", year: "numeric", month: "2-digit" }).formatToParts(now);
  return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}`;
}

function change(current: Count, previous: Count): Count {
  return current === null || previous === null || previous === 0 ? null : current / previous - 1;
}

function combined(first: Count, second: Count): Count {
  return first === null || second === null ? null : first + second;
}

export function pearsonCorrelation(pairs: readonly (readonly [number, number])[]): Correlation {
  const valid = pairs.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  const n = valid.length;
  if (n < 3) return { n, r: null };
  const meanX = valid.reduce((sum, [x]) => sum + x, 0) / n;
  const meanY = valid.reduce((sum, [, y]) => sum + y, 0) / n;
  let covariance = 0;
  let varianceX = 0;
  let varianceY = 0;
  for (const [x, y] of valid) {
    covariance += (x - meanX) * (y - meanY);
    varianceX += (x - meanX) ** 2;
    varianceY += (y - meanY) ** 2;
  }
  if (!varianceX || !varianceY) return { n, r: null };
  return { n, r: Math.max(-1, Math.min(1, covariance / Math.sqrt(varianceX * varianceY))) };
}

function summarize(months: DemandComparisonMonth[], metric: "sales" | "losses"): AlignedDemandSummary {
  const previousKey = metric === "sales" ? "previousSales" : "previousLosses";
  const aligned = months.filter((row) => row.demand !== null && row.previousDemand !== null && row[metric] !== null && row[previousKey] !== null);
  const total = (key: "demand" | "previousDemand" | typeof metric | typeof previousKey): Count => aligned.length ? aligned.reduce((sum, row) => sum + (row[key] as number), 0) : null;
  const demandCurrent = total("demand");
  const demandPrevious = total("previousDemand");
  const outcomeCurrent = total(metric);
  const outcomePrevious = total(previousKey);
  const expected = demandCurrent === null || demandPrevious === null || demandPrevious === 0 || outcomePrevious === null ? null : outcomePrevious * demandCurrent / demandPrevious;
  return {
    months: aligned.map((row) => row.month), demandCurrent, demandPrevious, outcomeCurrent, outcomePrevious,
    demandYoY: change(demandCurrent, demandPrevious), outcomeYoY: change(outcomeCurrent, outcomePrevious), expected,
    gap: expected === null || outcomeCurrent === null ? null : outcomeCurrent - expected,
  };
}

export function buildDemandComparison(
  demandRecords: readonly WordstatDemandRecord[],
  outcomeRecords: readonly DemandOutcomeRecord[],
  options: { city: DemandComparisonCity; year: number; mode: DemandComparisonMode; now?: Date },
) {
  const { city, year, mode } = options;
  const currentMonth = moscowCurrentMonth(options.now);
  const demandCities = new Map(["МСК", "СПБ"].map((value) => [value, new Map<string, Count>(buildDemandYearSeries(demandRecords, value as "МСК" | "СПБ").flatMap((series) => series.values.map((count, index) => [`${series.year}-${String(index + 1).padStart(2, "0")}`, count] as const)))]));
  const outcomes = new Map<string, Count>();
  for (const record of outcomeRecords) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(record.month) || !Number.isSafeInteger(record.count) || record.count < 0) continue;
    const key = `${record.metric}|${record.city}|${record.month}`;
    if (!outcomes.has(key)) outcomes.set(key, record.count);
    else if (outcomes.get(key) !== record.count) outcomes.set(key, null);
  }
  const demandAt = (month: string): Count => city === "Все"
    ? combined(demandCities.get("МСК")?.get(month) ?? null, demandCities.get("СПБ")?.get(month) ?? null)
    : demandCities.get(city)?.get(month) ?? null;
  const outcomeAt = (metric: "sales" | "losses", month: string): Count => {
    // The all-city summary is authoritative and may differ from the city breakdown.
    if (metric === "losses") return outcomes.get(`losses|${city}|${month}`) ?? null;
    return city === "Все" ? combined(outcomes.get(`sales|МСК|${month}`) ?? null, outcomes.get(`sales|СПБ|${month}`) ?? null) : outcomes.get(`sales|${city}|${month}`) ?? null;
  };
  const lossCoverageFor = (lossCity: DemandComparisonCity) => {
    const prefix = `losses|${lossCity}|`;
    const available = [...outcomes.entries()].flatMap(([key, value]) => {
      const month = key.slice(prefix.length);
      return key.startsWith(prefix) && value !== null && month < currentMonth ? [month] : [];
    }).sort();
    return { months: available, fromMonth: available[0] ?? "", toMonth: available[available.length - 1] ?? "" };
  };
  const months: DemandComparisonMonth[] = MONTH_LABELS.map((label, index) => {
    const suffix = String(index + 1).padStart(2, "0");
    const month = `${year}-${suffix}`;
    const previous = `${year - 1}-${suffix}`;
    const complete = month < currentMonth;
    const demand = complete ? demandAt(month) : null;
    const sales = complete ? outcomeAt("sales", month) : null;
    const losses = complete ? outcomeAt("losses", month) : null;
    const previousDemand = complete ? demandAt(previous) : null;
    const previousSales = complete ? outcomeAt("sales", previous) : null;
    const previousLosses = complete ? outcomeAt("losses", previous) : null;
    const expectedSales = demand === null || previousDemand === null || previousDemand === 0 || previousSales === null ? null : previousSales * demand / previousDemand;
    return {
      month, label, complete, demand, previousDemand, sales, previousSales, losses, previousLosses,
      demandYoY: change(demand, previousDemand), salesYoY: change(sales, previousSales), lossesYoY: change(losses, previousLosses), expectedSales,
      salesGap: sales === null || expectedSales === null ? null : sales - expectedSales,
      plotDemand: null, plotSales: null, plotLosses: null,
    };
  });
  const hasSales = months.some((row) => row.sales !== null);
  const hasLosses = months.some((row) => row.losses !== null);
  const base = mode === "index" && (hasSales || hasLosses) ? months.find((row) => row.demand !== null && row.demand > 0 && (!hasSales || (row.sales !== null && row.sales > 0)) && (!hasLosses || (row.losses !== null && row.losses > 0))) : undefined;
  for (const row of months) {
    if (mode === "yoy") {
      row.plotDemand = row.demandYoY;
      row.plotSales = row.salesYoY;
      row.plotLosses = row.lossesYoY;
    } else if (base && row.month >= base.month) {
      row.plotDemand = row.demand === null ? null : row.demand / (base.demand as number) * 100;
      row.plotSales = row.sales === null || base.sales === null ? null : row.sales / base.sales * 100;
      row.plotLosses = row.losses === null || base.losses === null ? null : row.losses / base.losses * 100;
    }
  }
  const pairs = (key: "plotSales" | "plotLosses") => months.flatMap((row): [number, number][] => row.plotDemand === null || row[key] === null ? [] : [[row.plotDemand, row[key] as number]]);
  return {
    months, currentMonth, city, year, mode, indexBaseMonth: base?.month ?? null,
    lossCoverage: { selected: lossCoverageFor(city), all: lossCoverageFor("Все") },
    correlations: { sales: pearsonCorrelation(pairs("plotSales")), losses: pearsonCorrelation(pairs("plotLosses")) },
    salesSummary: summarize(months, "sales"), lossesSummary: summarize(months, "losses"),
  };
}
