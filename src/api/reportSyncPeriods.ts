export type ReportSyncPeriod = { fromDate: string; toDate: string };

const dayMilliseconds = 86400000;
const maxPeriodDays = 2;

function dateTimestamp(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Дата обновления должна быть в формате ГГГГ-ММ-ДД.");
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) throw new Error("Некорректная дата обновления отчёта.");
  return timestamp;
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
