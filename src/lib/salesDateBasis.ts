import type { DailyRecord, SalesDateBasis } from "../types";

export function isCitySale(record: DailyRecord): boolean {
  return record.metric === "Продажи" && record.channel === "Город" && (record.city === "МСК" || record.city === "СПБ");
}

export function optionalSalesCount(value: unknown): number | undefined {
  if (value === undefined || value === null || String(value).trim() === "") return undefined;
  const number = Number(String(value).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

export function selectedSalesCount(record: DailyRecord): number | undefined {
  if (!record.salesDateBasis || !isCitySale(record)) return undefined;
  return optionalSalesCount(record.salesDateBasis === "traffic" ? record.trafficSales : record.paidSales);
}

export function selectSalesDateBasis(records: DailyRecord[], basis: SalesDateBasis): DailyRecord[] {
  return records.map((record) => !isCitySale(record) ? record : {
    ...record,
    salesDateBasis: basis,
    fact: optionalSalesCount(basis === "traffic" ? record.trafficSales : record.paidSales) ?? 0,
  });
}

export function salesDateBasisLabel(basis: SalesDateBasis): string {
  return basis === "traffic" ? "Продажи от трафика · amoCRM" : "Продажи по оплате · ПС";
}

/** Unknown future dates do not invalidate MTD; an observed date needs every selected city. */
export function selectedSalesFactsAvailable(records: DailyRecord[]): boolean {
  const selected = records.filter((record) => isCitySale(record) && record.salesDateBasis);
  const cities = [...new Set(selected.map((record) => record.city))];
  const observedDates = [...new Set(selected.filter((record) => selectedSalesCount(record) !== undefined).map((record) => record.date))];
  return observedDates.length > 0 && observedDates.every((date) => cities.every((city) => {
    const day = selected.filter((record) => record.date === date && record.city === city);
    return day.length > 0 && day.every((record) => selectedSalesCount(record) !== undefined);
  }));
}

export function getSelectedSalesCoverage(records: DailyRecord[]): { fromDate: string; toDate: string } | null {
  const selected = records.filter((record) => isCitySale(record) && record.salesDateBasis);
  if (!selected.length) return null;
  if (!selectedSalesFactsAvailable(selected)) return null;
  const cities = [...new Set(selected.map((record) => record.city))];
  const ranges = cities.map((city) => selected.filter((record) => record.city === city && selectedSalesCount(record) !== undefined).map((record) => record.date).sort());
  if (ranges.some((dates) => !dates.length)) return null;
  const starts = ranges.map((dates) => dates[0]).sort();
  const fromDate = starts[starts.length - 1];
  const toDate = ranges.map((dates) => dates[dates.length - 1]).sort()[0];
  return fromDate <= toDate ? { fromDate, toDate } : null;
}

export function salesSourceLabel(records: DailyRecord[], showRange = false): string | null {
  const basis = records.find((record) => isCitySale(record) && record.salesDateBasis)?.salesDateBasis;
  if (!basis) return null;
  const coverage = getSelectedSalesCoverage(records);
  const range = coverage ? showRange ? `${coverage.fromDate}–${coverage.toDate}` : `по ${coverage.toDate}` : "нет загруженных данных";
  return `${salesDateBasisLabel(basis)} · ${range}`;
}
