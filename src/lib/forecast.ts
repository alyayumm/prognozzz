import type { Metric } from "../types";
import type { MetricTotals } from "./metrics";

export function getForecastLabel(isClosedMonth: boolean) {
  return isClosedMonth ? "месяц завершен" : "прогноз Optima";
}

export function getForecastValue(totals: MetricTotals[Metric], isClosedMonth: boolean) {
  return isClosedMonth ? null : totals.forecast;
}
