import type { LeadConversionRecord } from "../api/leadConversionApi";

export type LeadConversionScope = "Все" | "МСК" | "СПБ";
export type LeadConversionSortKey = "label" | "visits" | "leads" | "conversionRate";
export type LeadConversionSortDirection = "asc" | "desc";
export type LeadConversionOption = { value: string; label: string };
export type LeadConversionTotals = { visits: number; leads: number; conversionRate: number | null; recordCount: number };
export type LeadConversionGroup = LeadConversionTotals & {
  key: string;
  label: string;
  brand: string;
  source: string;
  domains: string[];
  brandCount: number;
  sourceCount: number;
};
export type LeadConversionFilters = { monthKey: string; scope: LeadConversionScope; brand: string; source: string };
type PreparedRecord = LeadConversionRecord & { brand: string; source: string };

const unknownBrand = "Бренд не определён";
const unknownSource = "Источник не определён";
const compareLabel = (a: string, b: string) => a.localeCompare(b, "ru");
const dimensionKey = (value: string) => JSON.stringify(value);

function validDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === date;
}

/** Keep the provider's source labels; no allocation or source canonicalization is applied. */
function prepare(record: LeadConversionRecord): PreparedRecord | null {
  if (!validDate(record.date) || !Number.isFinite(record.visits) || !Number.isFinite(record.leads) || record.visits < 0 || record.leads < 0) return null;
  return { ...record, brand: String(record.brand ?? "").trim() || unknownBrand, source: String(record.source ?? "").trim() || unknownSource, domain: String(record.domain ?? "").trim() };
}

export function conversionRate(leads: number, visits: number): number | null {
  return visits > 0 ? leads / visits * 100 : null;
}

function totals(records: PreparedRecord[]): LeadConversionTotals {
  const visits = records.reduce((sum, row) => sum + row.visits, 0);
  const leads = records.reduce((sum, row) => sum + row.leads, 0);
  return { visits, leads, conversionRate: conversionRate(leads, visits), recordCount: records.length };
}

function group(records: PreparedRecord[], dimension: "source" | "brand" | "brandSource"): LeadConversionGroup[] {
  const groups = new Map<string, PreparedRecord[]>();
  for (const record of records) {
    const key = dimension === "brandSource" ? JSON.stringify([record.brand, record.source]) : dimensionKey(record[dimension]);
    const rows = groups.get(key) ?? [];
    rows.push(record);
    groups.set(key, rows);
  }
  return [...groups].map(([key, rows]) => ({
    ...totals(rows), key,
    label: dimension === "brandSource" ? `${rows[0].brand} · ${rows[0].source}` : rows[0][dimension],
    brand: dimension === "source" ? "" : rows[0].brand,
    source: dimension === "brand" ? "" : rows[0].source,
    domains: [...new Set(rows.map((row) => row.domain.trim()).filter(Boolean))].sort(compareLabel),
    brandCount: new Set(rows.map((row) => row.brand)).size,
    sourceCount: new Set(rows.map((row) => row.source)).size,
  })).sort((a, b) => b.visits - a.visits || compareLabel(a.label, b.label));
}

function options(records: PreparedRecord[], dimension: "source" | "brand"): LeadConversionOption[] {
  return [...new Set(records.map((row) => row[dimension]))].sort(compareLabel).map((label) => ({ label, value: dimensionKey(label) }));
}

export function buildLeadConversionReport(records: LeadConversionRecord[], filters: LeadConversionFilters) {
  const prepared = records.map(prepare);
  const monthRows = prepared.filter((row): row is PreparedRecord => row !== null && row.date.startsWith(`${filters.monthKey}-`));
  const matchesDimensions = (row: PreparedRecord) => (filters.brand === "all" || dimensionKey(row.brand) === filters.brand) &&
    (filters.source === "all" || dimensionKey(row.source) === filters.source);
  const knownCityRows = monthRows.filter((row) => (row.city === "МСК" || row.city === "СПБ") && matchesDimensions(row));
  const scopedRows = monthRows.filter((row) => (row.city === "МСК" || row.city === "СПБ") && (filters.scope === "Все" || row.city === filters.scope));
  const selected = scopedRows.filter(matchesDimensions);
  const unknown = monthRows.filter((row) => row.city === "Не определён" && matchesDimensions(row));
  const knownTotals = totals(knownCityRows);
  const unknownTotals = totals(unknown);
  return {
    totals: totals(selected),
    bySource: group(selected, "source"),
    byBrand: group(selected, "brand"),
    byBrandSource: group(selected, "brandSource"),
    unknownCity: { totals: unknownTotals, bySource: group(unknown, "source"), byBrand: group(unknown, "brand"), byBrandSource: group(unknown, "brandSource") },
    cityCoverage: { visitsShare: conversionRate(knownTotals.visits, knownTotals.visits + unknownTotals.visits), leadsShare: conversionRate(knownTotals.leads, knownTotals.leads + unknownTotals.leads) },
    // Unknown-city dimensions remain selectable so their full breakdown can be inspected.
    options: { brands: options(monthRows.filter((row) => row.city === "Не определён" || filters.scope === "Все" || row.city === filters.scope), "brand"), sources: options(monthRows.filter((row) => row.city === "Не определён" || filters.scope === "Все" || row.city === filters.scope), "source") },
    invalidRows: prepared.filter((row) => row === null).length,
  };
}

export function sortLeadConversionRows(rows: LeadConversionGroup[], key: LeadConversionSortKey, direction: LeadConversionSortDirection): LeadConversionGroup[] {
  return [...rows].sort((a, b) => {
    const aValue = a[key];
    const bValue = b[key];
    if (aValue === null) return bValue === null ? compareLabel(a.label, b.label) : 1;
    if (bValue === null) return -1;
    const comparison = typeof aValue === "string" && typeof bValue === "string" ? compareLabel(aValue, bValue) : Number(aValue) - Number(bValue);
    return comparison * (direction === "asc" ? 1 : -1) || compareLabel(a.label, b.label);
  });
}

export function leadConversionRefreshRange(monthKey: string, todayIso: string): { fromDate: string; toDate: string } | null {
  if (!/^\d{4}-\d{2}$/.test(monthKey) || !validDate(`${monthKey}-01`) || !validDate(todayIso)) return null;
  const fromDate = `${monthKey}-01`;
  if (fromDate > todayIso) return null;
  const [year, month] = monthKey.split("-").map(Number);
  const monthEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return { fromDate, toDate: monthEnd < todayIso ? monthEnd : todayIso };
}
