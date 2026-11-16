import type { DailyRecord } from "../types";

export type ReportSyncPeriod = { fromDate: string; toDate: string };

const dayMilliseconds = 86400000;
const maxPeriodDays = 2;

function dateTimestamp(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Дата обновления должна быть в формате ГГГГ-ММ-ДД.");
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) throw new Error("Некорректная дата обновления отчёта.");
  return timestamp;
}

/** Catch up the current month and recheck its last contiguous completed day. */
export function getMainReportSyncFromDate(monthKey: string, toDate: string, records: DailyRecord[], todayIso: string): string {
  const firstDate = `${monthKey}-01`;
  if (monthKey !== todayIso.slice(0, 7)) return firstDate;

  const start = dateTimestamp(firstDate);
  const end = dateTimestamp(toDate);
  const today = dateTimestamp(todayIso);
  const confirmed = new Map<string, number>();
  const isCount = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
  for (const record of records) {
    if (record.channel !== "Город" || (record.city !== "МСК" && record.city !== "СПБ") || record.date < firstDate || record.date > toDate) continue;
    const key = `${record.date}|${record.city}`;
    let bit = 0;
    if (record.metric === "Лиды" && isCount(record.fact) && (record.comment ?? "").includes("[AMO_LEADS_ALL=1]")) bit = 1;
    if (record.metric === "Квалы" && isCount(record.fact)) bit = 2;
    if (record.metric === "Продажи" && isCount(record.trafficSales)) bit = 4;
    confirmed.set(key, (confirmed.get(key) ?? 0) | bit);
  }

  let fromDate = firstDate;
  for (let cursor = start; cursor <= end && cursor < today; cursor += dayMilliseconds) {
    const date = new Date(cursor).toISOString().slice(0, 10);
    if (!["МСК", "СПБ"].every(city => confirmed.get(`${date}|${city}`) === 7)) break;
    fromDate = date;
  }
  return fromDate;
}

/** Two calendar days bound each amoCRM import, including its updated-deal stream. */
export function buildReportSyncPeriods(fromDate: string, toDate: string): ReportSyncPeriod[] {
  const start = dateTimestamp(fromDate);
  const end = dateTimestamp(toDate);
  if (start > end) throw new Error("Начало периода обновления позже его окончания.");
  const periods: ReportSyncPeriod[] = [];
  for (let cursor = start; cursor <= end;) {
    const periodEnd = Math.min(cursor + (maxPeriodDays - 1) * dayMilliseconds, end);
    periods.push({ fromDate: new Date(cursor).toISOString().slice(0, 10), toDate: new Date(periodEnd).toISOString().slice(0, 10) });
    cursor = periodEnd + dayMilliseconds;
  }
  return periods;
}
