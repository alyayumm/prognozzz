import type { DailyRecord, EventItem, Metric, WeekSummary } from "../types";
import { getWeekOfMonth } from "./date";

const metrics: Metric[] = ["Лиды", "Квалы", "Продажи"];

export function buildWeeklySummary(records: DailyRecord[], events: EventItem[]): WeekSummary[] {
  const weeks = new Map<number, DailyRecord[]>();
  records.forEach((record) => {
    const week = getWeekOfMonth(record.date);
    weeks.set(week, [...(weeks.get(week) ?? []), record]);
  });

  return [...weeks.entries()]
    .sort(([a], [b]) => a - b)
    .map(([week, weekRecords]) => {
      const dates = [...new Set(weekRecords.map((record) => record.date))].sort();
      const totals = metrics.reduce<WeekSummary["totals"]>((acc, metric) => {
        const metricRecords = weekRecords.filter((record) => record.metric === metric);
        acc[metric] = {
          plan: sum(metricRecords, "plan"),
          fact: sum(metricRecords, "fact"),
          forecast: sum(metricRecords, "forecast"),
        };
        return acc;
      }, {} as WeekSummary["totals"]);

      const dailyLeadTotals = dates.map((date) =>
        sum(
          weekRecords.filter((record) => record.date === date && record.metric === "Лиды"),
          "fact",
        ),
      );

      return {
        week,
        startDate: dates[0],
        endDate: dates[dates.length - 1],
        totals,
        open: dailyLeadTotals[0] ?? 0,
        high: Math.max(...dailyLeadTotals, 0),
        low: Math.min(...dailyLeadTotals.filter(Boolean), dailyLeadTotals[0] ?? 0),
        close: dailyLeadTotals[dailyLeadTotals.length - 1] ?? 0,
        events: events.filter((event) => dateRangesOverlap(dates[0], dates[dates.length - 1], event.startDate, event.endDate)),
      };
    });
}

function sum(records: DailyRecord[], key: "plan" | "fact" | "forecast"): number {
  return records.reduce((total, record) => total + record[key], 0);
}

function dateRangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}
