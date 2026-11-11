import type { MonthConfig } from "../types";
import type { MetricTotals, ReportScope } from "./metrics";

/** An unallocated monthly correction must never change a city's daily facts. */
export function monthlyQualificationDeduction(config: MonthConfig | null | undefined, scope: ReportScope): number {
  if (scope !== "Все" || config?.monthKey !== "2026-10") return 0;
  const adjustment = config.qualificationAdjustment;
  if (!adjustment || adjustment.kind !== "referralOverride" || adjustment.scope !== "Все") return 0;
  const { targetReferrals, baselineReferrals, deduction } = adjustment;
  if (![targetReferrals, baselineReferrals, deduction].every((value) => Number.isSafeInteger(value) && value >= 0)
    || deduction !== targetReferrals - baselineReferrals) return 0;
  return deduction;
}

/** Derive the month total once from unchanged saved facts; do not feed adjusted totals back in. */
export function applyMonthlyQualificationAdjustment(totals: MetricTotals, config: MonthConfig | null | undefined, scope: ReportScope): MetricTotals {
  const deduction = monthlyQualificationDeduction(config, scope);
  if (!deduction) return totals;
  return {
    ...totals,
    "Квалы": { ...totals["Квалы"], fact: Math.max(0, totals["Квалы"].fact - deduction) },
  };
}
