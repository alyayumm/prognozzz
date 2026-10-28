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
  sourceLabels: string[];
  domains: string[];
  brandCount: number;
  sourceCount: number;
};
export type LeadConversionFilters = { monthKey: string; scope: LeadConversionScope; brand: string; source: string };
type PreparedRecord = LeadConversionRecord & { brand: string; source: string; sourceLabels: string[] };

const unknownBrand = "Бренд не определён";
const unknownSource = "Источник не определён";
const otherSources = "Прочие / Нераспознанное";
const compareLabel = (a: string, b: string) => a.localeCompare(b, "ru");
const dimensionKey = (value: string) => JSON.stringify(value);

function classifySource(value: string): string | null {
  const text = value.replace(/\u00a0/g, " ").trim().toLocaleLowerCase("ru-RU").replace(/^:utm:/, "").replace(/:u:/g, "_");
  if (/^прямые\s+визиты$|^direct\s+(?:visits|traffic)(?:\s*\/\s*traffic)?$/.test(text)) return "Прямые визиты";
  if (/^geoadv_direct$|^direct\d+$|^yandex[\s._-]*direct(?:$|[\s/_-])|^яндекс[\s._-]*директ(?:$|[\s/_-])|^директ$/.test(text)) return "Директ";
  if (/^(?:2gis|2гис)|(?:^|[\s_./-])(?:2gis|2гис)(?:$|[\s_./-])/.test(text)) return "2ГИС";
  if (/^(?:ya|yk)$|(?:^|[_\s/.-])(?:ykart|ykar)|^geoadv_.*(?:maps|organization_list)|^(?:яндекс\s*карты|yandex\s*maps)$/.test(text)) return "Яндекс Карты";
  if (/^go$|(?:^|[_\s/.-])(?:gkart|gmaps)|^(?:google\s*maps|гугл\s*карты)$/.test(text)) return "Гугл Карты";
  if (/^(?:yell\.ru|spravker)$/.test(text)) return "Справочники";
  if (/^(?:perplexity|chatgpt\.com)$/.test(text)) return "Нейросети";
  if (/(?:^|[\s/_-])organic(?:$|[\s/_-])|^seo(?:$|[\s/_.-])|^(?:site|сайт|yandex)$|^визиты\s+с\s+сайтов$|^ref(?:erals|errals|erral)$/.test(text)) return "Сайт";
  if (/^(?:tg|wa)$|telegram|whatsapp|viber|messengers|мессенджер/.test(text)) return "Мессенджеры";
  if (/^vk$|_vk$|^vk\.com(?:\/|$)|^вконтакте$|^vkontakte$/.test(text)) return "ВКонтакте";
  if (/cashback|к[еэ]шб[еэ]к/.test(text)) return "Рек/кешбэк";
  return null;
}

/** Prefer the audited provider code when a display name hides it behind a brand. */
export function groupLeadConversionSource(source: unknown, rawSource?: unknown): string {
  return classifySource(String(rawSource ?? "")) ?? classifySource(String(source ?? "")) ?? otherSources;
}

function brandWithCity(value: unknown, city: LeadConversionRecord["city"]): string {
  const label = String(value ?? "").trim() || unknownBrand;
  if (label === unknownBrand) return label;
  const brand = label
    .replace(/^(?:мск|спб)(?=$|[\s_.·,|/()[\]–—-])[\s_.·,|/()[\]–—-]*/i, "")
    .replace(/[\s_.·,|/()[\]–—-]+(?:мск|спб)[\s_.·,|/()[\]–—-]*$/i, "")
    .trim();
  return brand ? `${brand} · ${city === "МСК" || city === "СПБ" ? city : "город не определён"}` : unknownBrand;
}

function validDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === date;
}

/** Group audited channels while preserving the provider labels and every observation. */
function prepare(record: LeadConversionRecord): PreparedRecord | null {
  if (!validDate(record.date) || !Number.isFinite(record.visits) || !Number.isFinite(record.leads) || record.visits < 0 || record.leads < 0) return null;
  const sourceLabel = String(record.source ?? "").trim() || unknownSource;
  const rawSource = String(record.rawSource ?? "").trim();
  return { ...record, brand: brandWithCity(record.brand, record.city), source: groupLeadConversionSource(sourceLabel, rawSource), rawSource, sourceLabels: [...new Set([sourceLabel, rawSource].filter(Boolean))], domain: String(record.domain ?? "").trim() };
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
    sourceLabels: [...new Set(rows.flatMap((row) => row.sourceLabels))].sort(compareLabel),
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
