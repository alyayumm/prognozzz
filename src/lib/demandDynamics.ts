import type { DemandOutcomeRecord } from "../api/demandOutcomesApi";
import type { WordstatDemandRecord } from "../api/wordstatApi";
import { buildDemandComparison, moscowCurrentMonth, type DemandComparisonCity, type DemandComparisonMonth } from "./demandComparison";
import { MONTH_LABELS } from "./wordstatDemand";

export type DemandDynamicsMetric = "salesRatio" | "lossesRatio" | "salesCount" | "lossesCount" | "demandCount";

export interface DemandDynamicsPoint {
  month: string;
  label: string;
  complete: boolean;
  demand: number | null;
  sales: number | null;
  losses: number | null;
  salesRatio: number | null;
  lossesRatio: number | null;
  value: number | null;
}

export interface DemandDynamicsSeries {
  year: number;
  points: DemandDynamicsPoint[];
  totals: DemandDynamicsYearTotals;
}

export interface DemandDynamicsTotal {
  value: number | null;
  months: string[];
}

export interface DemandDynamicsRatioTotal extends DemandDynamicsTotal {
  numerator: number | null;
  denominator: number | null;
}

export interface DemandDynamicsYearTotals {
  demand: DemandDynamicsTotal;
  sales: DemandDynamicsTotal;
  losses: DemandDynamicsTotal;
  salesRatio: DemandDynamicsRatioTotal;
  lossesRatio: DemandDynamicsRatioTotal;
}

function ratio(numerator: number | null, denominator: number | null): number | null {
  return numerator === null || denominator === null || denominator <= 0 ? null : numerator / denominator;
}

/** Describe the actual observed months without making gaps look like a continuous period. */
export function formatDemandDynamicsCoverage(months: readonly string[]): string {
  const observed = [...new Set(months.filter((month) => /^\d{4}-(0[1-9]|1[0-2])$/.test(month)))].sort();
  if (!observed.length) return "Нет данных · 0 мес.";
  const years = new Set(observed.map((month) => month.slice(0, 4)));
  if (years.size > 1) return `${observed.map((month) => `${MONTH_LABELS[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`).join(", ")} · ${observed.length} мес.`;
  if (observed.length === 12) return "Весь год · 12 мес.";
  const indices = observed.map((month) => Number(month.slice(5)) - 1);
  const groups: number[][] = [];
  for (const index of indices) {
    const previous = groups[groups.length - 1];
    if (previous && previous[previous.length - 1] + 1 === index) previous.push(index);
    else groups.push([index]);
  }
  const period = groups.map((group) => group.length === 1 ? MONTH_LABELS[group[0]] : `${MONTH_LABELS[group[0]]}–${MONTH_LABELS[group[group.length - 1]]}`).join(", ");
  return `${period} · ${observed.length} мес.`;
}

function summarizeYear(points: readonly DemandDynamicsPoint[]): DemandDynamicsYearTotals {
  const completed = points.filter((point) => point.complete);
  const total = (key: "demand" | "sales" | "losses"): DemandDynamicsTotal => {
    const observed = completed.filter((point) => point[key] !== null);
    return { value: observed.length ? observed.reduce((sum, point) => sum + (point[key] as number), 0) : null, months: observed.map((point) => point.month) };
  };
  const ratioTotal = (key: "sales" | "losses"): DemandDynamicsRatioTotal => {
    // Known zero demand belongs to the overlap even though its monthly ratio is undefined.
    const aligned = completed.filter((point) => point[key] !== null && point.demand !== null);
    const numerator = aligned.length ? aligned.reduce((sum, point) => sum + (point[key] as number), 0) : null;
    const denominator = aligned.length ? aligned.reduce((sum, point) => sum + (point.demand as number), 0) : null;
    return { value: ratio(numerator, denominator), numerator, denominator, months: aligned.map((point) => point.month) };
  };
  return { demand: total("demand"), sales: total("sales"), losses: total("losses"), salesRatio: ratioTotal("sales"), lossesRatio: ratioTotal("losses") };
}

/** Compare calendar years using the same city, source and missing-data rules as the monthly comparison. */
export function buildDemandDynamics(
  demandRecords: readonly WordstatDemandRecord[],
  outcomeRecords: readonly DemandOutcomeRecord[],
  options: { city: DemandComparisonCity; years: readonly number[]; metric: DemandDynamicsMetric; now?: Date },
): { series: DemandDynamicsSeries[]; availableYears: number[] } {
  const now = options.now ?? new Date();
  const currentYear = Number(moscowCurrentMonth(now).slice(0, 4));
  const validYear = (year: number) => Number.isInteger(year) && year >= 1000 && year <= 9999;
  const monthsByYear = new Map<number, DemandComparisonMonth[]>();
  const monthsFor = (year: number): DemandComparisonMonth[] => {
    let months = monthsByYear.get(year);
    if (!months) {
      months = buildDemandComparison(demandRecords, outcomeRecords, { city: options.city, year, mode: "yoy", now }).months;
      monthsByYear.set(year, months);
    }
    return months;
  };
  const candidateYears = new Set<number>();
  for (const record of [...demandRecords, ...outcomeRecords]) {
    const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(record.month);
    if (!match || !Number.isSafeInteger(record.count) || record.count < 0) continue;
    const year = Number(match[1]);
    if (validYear(year) && year <= currentYear) candidateYears.add(year);
  }
  const availableYears = [...candidateYears].sort((a, b) => a - b).filter((year) => monthsFor(year)
    .some((row) => row.demand !== null || row.sales !== null || row.losses !== null));
  const years = [...new Set(options.years.filter(validYear))].sort((a, b) => a - b);
  const series = years.map((year): DemandDynamicsSeries => {
    const points = monthsFor(year).map((row): DemandDynamicsPoint => {
      const salesRatio = ratio(row.sales, row.demand);
      const lossesRatio = ratio(row.losses, row.demand);
      const values: Record<DemandDynamicsMetric, number | null> = {
        salesRatio, lossesRatio, salesCount: row.sales, lossesCount: row.losses, demandCount: row.demand,
      };
      return {
        month: row.month, label: row.label, complete: row.complete,
        demand: row.demand, sales: row.sales, losses: row.losses,
        salesRatio, lossesRatio, value: values[options.metric],
      };
    });
    return { year, points, totals: summarizeYear(points) };
  });
  return { series, availableYears };
}
