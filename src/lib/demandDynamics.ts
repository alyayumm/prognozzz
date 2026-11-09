import type { DemandOutcomeRecord } from "../api/demandOutcomesApi";
import type { WordstatDemandRecord } from "../api/wordstatApi";
import { buildDemandComparison, moscowCurrentMonth, type DemandComparisonCity, type DemandComparisonMonth } from "./demandComparison";

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
}

function ratio(numerator: number | null, denominator: number | null): number | null {
  return numerator === null || denominator === null || denominator <= 0 ? null : numerator / denominator;
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
  const series = years.map((year): DemandDynamicsSeries => ({
    year,
    points: monthsFor(year).map((row): DemandDynamicsPoint => {
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
    }),
  }));
  return { series, availableYears };
}
