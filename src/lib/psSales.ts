import type { DailyRecord } from "../types";

export function isPsSale(record: DailyRecord): boolean {
  return record.metric === "Продажи" && record.channel === "Город" &&
    (record.city === "МСК" || record.city === "СПБ") && /\[SALES_SOURCE=PS\]/.test(record.comment ?? "");
}

function coveredTo(record: DailyRecord): string | null {
  const value = record.comment?.match(/\[PS_COVERED_TO=(\d{4}-\d{2}-\d{2})\]/)?.[1];
  if (!value) return null;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value ? value : null;
}

export function isPendingPsSale(record: DailyRecord): boolean {
  if (!isPsSale(record)) return false;
  const coverage = coveredTo(record);
  return /\[PS_PENDING=1\]/.test(record.comment ?? "") || !coverage || record.date > coverage;
}

/** Imported PS zeros are real observations; unavailable dates must not lower a forecast average. */
export function hasActualRecord(record: DailyRecord): boolean {
  if (isPendingPsSale(record)) return false;
  if (isPsSale(record)) return true;
  return Number(record.fact || 0) > 0 || Number(record.recommendations || 0) > 0 || Number(record.omQualified || 0) > 0;
}

/** A total for both cities stays unavailable until both city observations are covered. */
export function psSalesFactAvailable(records: DailyRecord[]): boolean {
  return !records.some(isPendingPsSale);
}

export function getPsSalesCoverage(records: DailyRecord[]): { fromDate: string; toDate: string } | null {
  const psRecords = records.filter(isPsSale);
  const coverageByCity = new Map<string, string>();
  let fromDate = "";
  let lastDate = "";
  for (const record of psRecords) {
    const coverage = coveredTo(record);
    if (!coverage) continue;
    if (!fromDate || record.date < fromDate) fromDate = record.date;
    if (record.date > lastDate) lastDate = record.date;
    if (coverage > (coverageByCity.get(record.city) ?? "")) coverageByCity.set(record.city, coverage);
  }
  const dates = [...coverageByCity.values()].sort();
  return fromDate && dates.length ? { fromDate, toDate: dates[0] < lastDate ? dates[0] : lastDate } : null;
}
