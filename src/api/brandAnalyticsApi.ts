import { importedBrandAliases, importedBrandBranches } from "../data/importedBrandBranches";
import { callReportApi } from "./reportApi";
import type { BrandAlias, BrandBranchWeekly, BrandCity, BrandPerformanceWeekly, MetrikaBrandSourceDaily } from "../types";

export type { BrandCity } from "../types";

export type BrandMonthlyPoint = {
  month: string;
  sales: number;
  roas: number | null;
};

export type BrandAnalyticsRecord = {
  id: string;
  brand: string;
  domain: string;
  city: BrandCity;
  leads: number;
  qualified: number;
  sales: number;
  revenue: number;
  actualRevenue: number;
  budget: number;
  leadToQualified: number;
  qualifiedToSales: number;
  cpl: number;
  cpql: number;
  saleCost: number;
  roas: number | null;
  roasFact: number | null;
  avgCheck: number;
  monthly: BrandMonthlyPoint[];
};

export type BrandAnalyticsBundle = {
  records: BrandAnalyticsRecord[];
  performance: BrandPerformanceWeekly[];
  branches: BrandBranchWeekly[];
  aliases: BrandAlias[];
  budgets: BrandBudgetMonthly[];
  receivables: RevenueReceivableMonthly[];
  metrika: MetrikaBrandSourceDaily[];
};

const brandSpreadsheetId = "1sV1GFMn_Nag1xZQcSSypb57-0i5KtgCJbPgo95rO8oo";
const drrBudgetSpreadsheetId = "1tl-e_HAxxgGv24l19GaKaVz_6NYDuLqEwQH5esjER3o";
const receivablesSpreadsheetId = "1ptVO-e34DEMKxwriTFFg1hzZLjFhwuWvBqq8Gn5WemI";
const receivablesPsSheet = "Выгрузка PS";
const legacyReceivablesSpreadsheetId = "1jCRGGd0HyTj-8RM6IE1Dolh0tNt_DebknhNXgvVOZ3M";
const legacyReceivablesSummarySheet = "Август Итог";
const legacyBrandSheets: BrandCity[] = ["МСК", "СПБ"];
const brandServiceSheets = {
  performance: "Brand_Performance_Weekly",
  branches: "Brand_Branches_Weekly",
  aliases: "Brand_Aliases",
};
const drrBudgetSheets: Array<{ sheet: string; city: BrandCity; monthKey: string }> = [
  { sheet: "МСК ЯНВАРЬ", city: "МСК", monthKey: "2026-01" },
  { sheet: "СПБ ЯНВАРЬ", city: "СПБ", monthKey: "2026-01" },
  { sheet: "МСК ФЕВРАЛЬ 26", city: "МСК", monthKey: "2026-02" },
  { sheet: "СПБ ФЕВРАЛЬ 26", city: "СПБ", monthKey: "2026-02" },
  { sheet: "МСК МАРТ 26", city: "МСК", monthKey: "2026-03" },
  { sheet: "СПБ МАРТ 26", city: "СПБ", monthKey: "2026-03" },
  { sheet: "МСК АПРЕЛЬ 26", city: "МСК", monthKey: "2026-04" },
  { sheet: "СПБ АПРЕЛЬ 26", city: "СПБ", monthKey: "2026-04" },
  { sheet: "МСК МАЙ 26", city: "МСК", monthKey: "2026-05" },
  { sheet: "СПБ МАЙ 26", city: "СПБ", monthKey: "2026-05" },
  { sheet: "МСК ИЮНЬ 26 ", city: "МСК", monthKey: "2026-06" },
  { sheet: "СПБ ИЮНЬ 26", city: "СПБ", monthKey: "2026-06" },
  { sheet: "МСК ИЮЛЬ 26", city: "МСК", monthKey: "2026-07" },
  { sheet: "СПБ ИЮЛЬ 26", city: "СПБ", monthKey: "2026-07" },
  { sheet: "МСК АВГУСТ 26", city: "МСК", monthKey: "2026-08" },
  { sheet: "СПБ АВГУСТ 26", city: "СПБ", monthKey: "2026-08" },
  { sheet: "МСК СЕНТЯБРЬ", city: "МСК", monthKey: "2026-09" },
  { sheet: "СПБ СЕНТЯБРЬ", city: "СПБ", monthKey: "2026-09" },
];
const monthLabels = ["Апрель", "Май", "Июнь", "Июль"];
const monthKeysByLabel: Record<string, string> = {
  Апрель: "2026-04",
  Май: "2026-05",
  Июнь: "2026-06",
  Июль: "2026-07",
};

type GvizCell = { v?: string | number | null; f?: string | null } | null;
type GvizColumn = { id?: string | null; label?: string | null; type?: string | null };
type GvizRow = { c?: GvizCell[] | null };
type GvizTable = { cols?: GvizColumn[]; rows: GvizRow[] };
type GvizResponse = {
  status?: string;
  table?: GvizTable;
  errors?: Array<{ detailed_message?: string; message?: string }>;
};
type BrandServiceDashboard = {
  performance?: Array<Record<string, unknown>>;
  branches?: Array<Record<string, unknown>>;
  aliases?: Array<Record<string, unknown>>;
  budgets?: Array<Record<string, unknown>>;
  receivables?: Array<Record<string, unknown>>;
  metrika?: Array<Record<string, unknown>>;
};

export type BrandBudgetMonthly = {
  monthKey: string;
  city: BrandCity;
  brand: string;
  source: string;
  budget: number;
};

export type RevenueReceivableMonthly = {
  monthKey: string;
  label: string;
  city?: BrandCity | null;
  debtAmount: number;
  returnedAmount: number;
  badAmount: number;
  outstandingAmount: number;
  debtCount: number;
  badCount: number;
};

export async function loadBrandAnalyticsSnapshot(): Promise<BrandAnalyticsBundle> {
  const appsScriptSnapshot = await loadBrandServiceFromAppsScript();
  const [legacyRecords, servicePerformance, publicPerformance, serviceBranches, serviceAliases, drrBudgets, publicBudgets, receivables] = await Promise.all([
    loadLegacyBrandRecords(),
    loadOptionalBrandGvizSheet(brandServiceSheets.performance).then(parseBrandPerformanceSheet).catch(() => []),
    loadPublicBrandPerformanceCsv().catch(() => []),
    loadOptionalBrandGvizSheet(brandServiceSheets.branches).then(parseBrandBranchesSheet).catch(() => []),
    loadOptionalBrandGvizSheet(brandServiceSheets.aliases).then(parseBrandAliasesSheet).catch(() => []),
    loadDrrBudgetRows().catch(() => []),
    loadPublicBrandBudgetCsv().catch(() => []),
    loadReceivableRows().catch(() => []),
  ]);

  const appsAliases = normalizeBrandAliasObjects(appsScriptSnapshot?.aliases ?? []);
  const appsPerformance = normalizeBrandPerformanceObjects(appsScriptSnapshot?.performance ?? []);
  const appsBranches = normalizeBrandBranchObjects(appsScriptSnapshot?.branches ?? []);
  const appsBudgets = normalizeBrandBudgetObjects(appsScriptSnapshot?.budgets ?? []);
  const appsReceivables = normalizeReceivableObjects(appsScriptSnapshot?.receivables ?? []);
  const appsMetrika = normalizeMetrikaBrandSourceObjects(appsScriptSnapshot?.metrika ?? []);
  const aliases = mergeAliases(importedBrandAliases, mergeAliases(serviceAliases, appsAliases));
  const performance = appsPerformance.length ? appsPerformance : servicePerformance.length ? servicePerformance : publicPerformance;
  const budgetRows = drrBudgets.length ? drrBudgets : appsBudgets.length ? appsBudgets : publicBudgets;
  const receivableRows = combineReceivableSources(appsReceivables, receivables);
  const canonicalPerformance = performance.map((record) => ({
    ...record,
    brand: canonicalBrandName(record.brand, aliases),
    source: canonicalSourceName(record.source),
  }));
  const canonicalBudgets = budgetRows.map((record) => ({
    ...record,
    brand: canonicalBrandName(normalizeDrrBrandName(record.brand), aliases),
    source: canonicalSourceName(record.source),
  }));
  const metrika = appsMetrika.map((record) => ({
    ...record,
    brand: canonicalBrandName(record.brand, aliases),
    source: canonicalSourceName(record.source),
  }));
  const branches = appsBranches.length ? appsBranches : serviceBranches;
  return {
    records: legacyRecords.map((record) => {
      const roas = record.roas;
      return { ...record, brand: canonicalBrandName(record.brand, aliases), roasFact: roas };
    }),
    performance: applyBrandBudgets(applyActualRevenueFromReceivables(canonicalPerformance, receivableRows), canonicalBudgets),
    branches: branches.length
      ? branches.map((record) => ({
        ...record,
        brand: canonicalBrandName(record.brand, aliases),
        platform: canonicalBranchPlatform(record.platform),
      }))
      : importedBrandBranches,
    aliases,
    budgets: canonicalBudgets,
    receivables: receivableRows,
    metrika,
  };
}

async function loadBrandServiceFromAppsScript(): Promise<BrandServiceDashboard | null> {
  try {
    return await callReportApi<BrandServiceDashboard>("getBrandDashboard");
  } catch {
    return null;
  }
}

async function loadPublicBrandPerformanceCsv(): Promise<BrandPerformanceWeekly[]> {
  if (typeof fetch === "undefined") return [];
  const baseUrl = import.meta.env.BASE_URL || "./";
  const response = await fetch(`${baseUrl}data/brand-performance-weekly.csv?v=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) return [];
  const csv = await response.text();
  return normalizeBrandPerformanceObjects(parseCsvObjects(csv));
}

async function loadPublicBrandBudgetCsv(): Promise<BrandBudgetMonthly[]> {
  if (typeof fetch === "undefined") return [];
  const baseUrl = import.meta.env.BASE_URL || "./";
  const response = await fetch(`${baseUrl}data/brand-budget-monthly.csv?v=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) return [];
  const csv = await response.text();
  return normalizeBrandBudgetObjects(parseCsvObjects(csv));
}

async function loadDrrBudgetRows(): Promise<BrandBudgetMonthly[]> {
  const tables = await Promise.all(
    drrBudgetSheets.map(async (config) => {
      try {
        return {
          config,
          table: await loadGvizSheet(drrBudgetSpreadsheetId, config.sheet, "select A,E,I,K,L,M"),
        };
      } catch {
        return { config, table: { rows: [] } };
      }
    }),
  );
  return tables.flatMap(({ config, table }) => parseDrrBudgetSheet(table, config));
}

async function loadLegacyBrandRecords(): Promise<BrandAnalyticsRecord[]> {
  const tables = await Promise.all(
    legacyBrandSheets.map(async (city) => ({
      city,
      table: await loadBrandGvizSheet(city),
    })),
  );
  return tables.flatMap(({ city, table }) => parseLegacyBrandSheet(table, city));
}

function parseCsvObjects(csv: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];
    if (quoted) {
      if (char === "\"" && next === "\"") {
        cell += "\"";
        index += 1;
      } else if (char === "\"") {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === "\"") {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  const headers = (rows.shift() ?? []).map((header) => header.replace(/^\uFEFF/, "").trim());
  return rows.flatMap((values) => {
    if (!values.some((value) => value.trim())) return [];
    const object: Record<string, string> = {};
    headers.forEach((header, index) => {
      object[header] = values[index] ?? "";
    });
    return [object];
  });
}

function loadOptionalBrandGvizSheet(sheetName: string): Promise<GvizTable> {
  return loadBrandGvizSheet(sheetName);
}

function loadBrandGvizSheet(sheetName: string): Promise<GvizTable> {
  return loadGvizSheet(brandSpreadsheetId, sheetName);
}

function loadGvizSheet(spreadsheetId: string, sheetName: string, query = "select *"): Promise<GvizTable> {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("Browser document is not available"));
      return;
    }

    const callbackName = `__brandAnalyticsSheet_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error(`Google Sheet timeout: ${sheetName}`));
    }, 20000);

    function cleanup() {
      window.clearTimeout(timeoutId);
      script.remove();
      delete (window as unknown as Record<string, unknown>)[callbackName];
    }

    (window as unknown as Record<string, (response: GvizResponse) => void>)[callbackName] = (response) => {
      cleanup();
      if (response.status !== "ok" || !response.table) {
        const message = response.errors?.[0]?.detailed_message ?? response.errors?.[0]?.message ?? `Google Sheet error: ${sheetName}`;
        reject(new Error(message));
        return;
      }
      resolve(response.table);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error(`Cannot load Google Sheet: ${sheetName}`));
    };
    script.src =
      `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?` +
      `tqx=out:json;responseHandler:${callbackName}&sheet=${encodeURIComponent(sheetName)}&tq=${encodeURIComponent(query)}&_=${Date.now()}`;
    document.head.appendChild(script);
  });
}

function parseLegacyBrandSheet(table: GvizTable, fallbackCity: BrandCity): BrandAnalyticsRecord[] {
  const headerIndex = table.rows.findIndex((row) => {
    const first = readCell(row, 0).toLowerCase();
    const second = readCell(row, 1).toLowerCase();
    return first === "бренд" && second === "домен";
  });
  if (headerIndex < 0) return [];

  return table.rows.slice(headerIndex + 1).flatMap((row) => {
    const rawBrand = readCell(row, 0);
    const rawDomain = readCell(row, 1);
    if (!rawBrand && !rawDomain) return [];

    const brand = normalizeBrandName(rawBrand, rawDomain);
    const domain = rawDomain || inferDomainFromBrand(brand);
    const city = normalizeBrandCity(readCell(row, 2)) ?? fallbackCity;
    const roas = toNullableNumber(readCell(row, 13));
    const monthly = monthLabels.map((month, index) => ({
      month,
      sales: toNumber(readCell(row, 15 + index)),
      roas: toNullableNumber(readCell(row, 19 + index)),
    }));

    return [{
      id: `${city}-${brand}-${domain}`.toLowerCase(),
      brand,
      domain,
      city,
      leads: toNumber(readCell(row, 3)),
      qualified: toNumber(readCell(row, 4)),
      sales: toNumber(readCell(row, 5)),
      revenue: toNumber(readCell(row, 6)),
      actualRevenue: toNumber(readCell(row, 6)),
      budget: toNumber(readCell(row, 7)),
      leadToQualified: toNumber(readCell(row, 8)),
      qualifiedToSales: toNumber(readCell(row, 9)),
      cpl: toNumber(readCell(row, 10)),
      cpql: toNumber(readCell(row, 11)),
      saleCost: toNumber(readCell(row, 12)),
      roas,
      roasFact: roas,
      avgCheck: toNumber(readCell(row, 14)),
      monthly,
    }];
  });
}

function parseBrandPerformanceSheet(table: GvizTable): BrandPerformanceWeekly[] {
  return normalizeBrandPerformanceObjects(rowsToObjects(table));
}

function normalizeBrandPerformanceObjects(rows: Array<Record<string, unknown>>): BrandPerformanceWeekly[] {
  return rows.flatMap((row) => {
    const weekStart = normalizeDate(row.weekStart || row.week || row.date || row["неделя"]);
    const brand = stringValue(row.brand || row["бренд"]);
    const city = normalizeBrandCity(stringValue(row.city || row["город"]));
    if (!weekStart || !brand || !city) return [];

    const leads = toNumber(stringValue(row.leads || row["лиды"]));
    const qualified = toNumber(stringValue(row.qualified || row["квал"] || row["квалы"]));
    const sales = toNumber(stringValue(row.sales || row["продажи"]));
    const revenue = toNumber(stringValue(row.revenue || row["выручка"]));
    const actualRevenueFromRow = toNumber(stringValue(
      row.actualRevenue
      || row.factRevenue
      || row["факт выручка"]
      || row["факт. выручка"]
      || row["выручка факт"]
      || row["фактическая выручка"],
    ));
    const actualRevenue = actualRevenueFromRow > 0 || revenue <= 0 ? actualRevenueFromRow : revenue;
    const budget = toNumber(stringValue(row.budget || row["бюджет"]));
    const roas = toNullableNumber(stringValue(row.roas || row["roas"])) ?? (budget > 0 ? revenue / budget : null);
    const roasFact = toNullableNumber(stringValue(row.roasFact || row["roas факт"] || row["ROAS факт"])) ?? (budget > 0 ? actualRevenue / budget : roas);
    const source = canonicalSourceName(stringValue(row.source || row["источник"]) || "Все источники");
    const id = stringValue(row.id) || `${weekStart}-${city}-${brand}-${source}`;

    return [{
      id,
      weekStart,
      monthKey: stringValue(row.monthKey || row.month || row["месяц"]) || weekStart.slice(0, 7),
      city,
      brand,
      domain: stringValue(row.domain || row["домен"]) || inferDomainFromBrand(brand),
      source,
      leads,
      qualified,
      sales,
      revenue,
      actualRevenue,
      budget,
      roas,
      roasFact,
      cpl: toNumber(stringValue(row.cpl || row["cpl"] || row["цена лида"])) || (leads > 0 ? budget / leads : 0),
      cpql: toNumber(stringValue(row.cpql || row["cpql"] || row["цена квала"])) || (qualified > 0 ? budget / qualified : 0),
      saleCost: toNumber(stringValue(row.saleCost || row["цена продажи"])) || (sales > 0 ? budget / sales : 0),
      avgCheck: toNumber(stringValue(row.avgCheck || row["средний чек"])) || (sales > 0 ? revenue / sales : 0),
    }];
  });
}

function parseBrandBranchesSheet(table: GvizTable): BrandBranchWeekly[] {
  return normalizeBrandBranchObjects(rowsToObjects(table));
}

function normalizeBrandBranchObjects(rows: Array<Record<string, unknown>>): BrandBranchWeekly[] {
  return rows.flatMap((row) => {
    const weekStart = normalizeDate(row.weekStart || row.week || row.date || row["неделя"]);
    const brand = stringValue(row.brand || row["бренд"]);
    const city = normalizeBrandCity(stringValue(row.city || row["город"]));
    if (!weekStart || !brand || !city) return [];

    const platform = canonicalBranchPlatform(stringValue(row.platform || row["площадка"] || row["источник"]));
    const rawBrand = stringValue(row.rawBrand || row["исходный бренд"]) || brand;
    return [{
      id: stringValue(row.id) || `${weekStart}-${city}-${platform}-${brand}-${rawBrand}`.toLowerCase(),
      weekStart,
      monthKey: stringValue(row.monthKey || row.month || row["месяц"]) || weekStart.slice(0, 7),
      city,
      platform,
      brand,
      rawBrand,
      branches: toNumber(stringValue(row.branches || row["филиалы"] || row["количество филиалов"])),
    }];
  });
}

function parseBrandAliasesSheet(table: GvizTable): BrandAlias[] {
  return normalizeBrandAliasObjects(rowsToObjects(table));
}

function parseDrrBudgetSheet(
  table: GvizTable,
  config: { city: BrandCity; monthKey: string },
): BrandBudgetMonthly[] {
  const output: BrandBudgetMonthly[] = [];
  let activeBrand = "";

  table.rows.forEach((row) => {
    const rawBrand = normalizeDrrBrandName(readCell(row, 0));
    const hasNamedBrand = Boolean(rawBrand);
    if (hasNamedBrand) activeBrand = isDrrHeaderOrTotal(rawBrand) ? "" : rawBrand;

    const brand = hasNamedBrand ? activeBrand : activeBrand;
    if (!brand || isDrrHeaderOrTotal(brand)) return;

    const yandexBudget = toNumber(readCell(row, 1));
    const twoGisBudget = toNumber(readCell(row, 2));
    const otherSource = canonicalDrrOtherSource(readCell(row, 3));
    const otherBudget = toNumber(readCell(row, 4));
    const totalBudget = toNumber(readCell(row, 5));
    const budgetRows: BrandBudgetMonthly[] = [];

    if (!hasNamedBrand && !yandexBudget && !twoGisBudget && !otherBudget && !totalBudget) {
      activeBrand = "";
      return;
    }
    if (!hasNamedBrand && (twoGisBudget > 0 || otherBudget > 0 || totalBudget > 0)) {
      activeBrand = "";
      return;
    }

    if (yandexBudget > 0) {
      budgetRows.push({ monthKey: config.monthKey, city: config.city, brand, source: "Яндекс Карты", budget: yandexBudget });
    }
    if (twoGisBudget > 0) {
      budgetRows.push({ monthKey: config.monthKey, city: config.city, brand, source: "2ГИС", budget: twoGisBudget });
    }
    if (otherBudget > 0) {
      budgetRows.push({ monthKey: config.monthKey, city: config.city, brand, source: otherSource, budget: otherBudget });
    }

    const sourceBudgetTotal = budgetRows.reduce((sum, item) => sum + item.budget, 0);
    if (totalBudget > sourceBudgetTotal + 1) {
      budgetRows.push({ monthKey: config.monthKey, city: config.city, brand, source: "Другие", budget: totalBudget - sourceBudgetTotal });
    }

    output.push(...budgetRows);
  });
  return output;
}

async function loadReceivableRows(): Promise<RevenueReceivableMonthly[]> {
  const liveRows = await loadGvizSheet(
    receivablesSpreadsheetId,
    receivablesPsSheet,
    "select S,Z,AD,AH where S is not null",
  )
    .then(parseReceivablePsSheet)
    .catch(() => []);

  if (liveRows.length) return liveRows;

  return loadGvizSheet(
    legacyReceivablesSpreadsheetId,
    legacyReceivablesSummarySheet,
    "select B,C,D,E,F,G,H,I,J,K",
  ).then(parseReceivableMonthlySheet);
}

function parseReceivablePsSheet(table: GvizTable): RevenueReceivableMonthly[] {
  const objectRows = normalizeReceivableObjects(rowsToObjects(table));
  if (objectRows.length) return objectRows;

  const byMonthCity = new Map<string, RevenueReceivableMonthly>();

  table.rows.forEach((row) => {
    const city = normalizeBrandCity(readCell(row, 0));
    const date = normalizeDate(readCell(row, 1));
    const monthKey = date.slice(0, 7);
    const revenue = toNumber(readCell(row, 2));
    const theoryDebt = toNumber(readCell(row, 3));

    if (!city || !monthKey || !date) return;

    const key = `${monthKey}|${city}`;
    const item = byMonthCity.get(key) ?? {
      monthKey,
      city,
      label: `${monthKey} ${city}`,
      debtAmount: 0,
      returnedAmount: 0,
      badAmount: 0,
      outstandingAmount: 0,
      debtCount: 0,
      badCount: 0,
    };

    item.debtAmount += theoryDebt;
    item.outstandingAmount += theoryDebt;
    if (theoryDebt > 0) item.debtCount += 1;
    if (revenue <= 0 && theoryDebt > 0) item.badCount += 1;
    byMonthCity.set(key, item);
  });

  return [...byMonthCity.values()]
    .map((item) => ({
      ...item,
      debtAmount: roundMoney(item.debtAmount),
      outstandingAmount: roundMoney(item.outstandingAmount),
    }))
    .sort((a, b) => `${a.monthKey}|${a.city ?? ""}`.localeCompare(`${b.monthKey}|${b.city ?? ""}`));
}

function parseReceivableMonthlySheet(table: GvizTable): RevenueReceivableMonthly[] {
  const monthIndexByName: Record<string, number> = {
    январь: 1,
    февраль: 2,
    март: 3,
    апрель: 4,
    май: 5,
    июнь: 6,
    июль: 7,
    август: 8,
    сентябрь: 9,
    октябрь: 10,
    ноябрь: 11,
    декабрь: 12,
  };
  const byMonth = new Map<string, RevenueReceivableMonthly>();
  let lastMonthKey = "";

  table.rows.forEach((row) => {
    const label = readCell(row, 0).trim();
    const labelKey = label.toLowerCase().replace(/ё/g, "е");
    if (!label || labelKey.includes("итого")) return;

    const monthIndex = monthIndexByName[labelKey];
    if (!monthIndex) return;

    const date = parseRuDate(readCell(row, 1));
    let year = date ? (date.month < monthIndex ? date.year - 1 : date.year) : 0;
    if (!year && lastMonthKey) {
      const [lastYear, lastMonth] = lastMonthKey.split("-").map(Number);
      year = monthIndex > lastMonth ? lastYear : lastYear + 1;
    }
    if (!year) return;

    const monthKey = `${year}-${String(monthIndex).padStart(2, "0")}`;
    const badAmount = toNumber(readCell(row, 8));
    const outstandingAmount = toNumber(readCell(row, 9));
    const debtAmount = toNumber(readCell(row, 5)) || badAmount + outstandingAmount;

    byMonth.set(monthKey, {
      monthKey,
      label,
      debtAmount,
      returnedAmount: toNumber(readCell(row, 6)),
      badAmount,
      outstandingAmount,
      debtCount: toNumber(readCell(row, 3)),
      badCount: toNumber(readCell(row, 7)),
    });
    lastMonthKey = monthKey;
  });

  return [...byMonth.values()].sort((a, b) => a.monthKey.localeCompare(b.monthKey));
}

function parseRuDate(value: string): { day: number; month: number; year: number } | null {
  const match = value.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (!match) return null;
  return {
    day: Number(match[1]),
    month: Number(match[2]),
    year: Number(match[3]),
  };
}

function applyActualRevenueFromReceivables(
  performance: BrandPerformanceWeekly[],
  receivables: RevenueReceivableMonthly[],
): BrandPerformanceWeekly[] {
  const receivableByMonthCity = new Map<string, RevenueReceivableMonthly>();
  const receivableByMonth = new Map<string, RevenueReceivableMonthly>();
  receivables.forEach((row) => {
    if (row.city) {
      const key = `${row.monthKey}|${row.city}`;
      const existing = receivableByMonthCity.get(key);
      receivableByMonthCity.set(key, mergeReceivableRows(existing, row));
      return;
    }
    const existing = receivableByMonth.get(row.monthKey);
    receivableByMonth.set(row.monthKey, mergeReceivableRows(existing, row));
  });

  const revenueByMonth = new Map<string, number>();
  const revenueByMonthCity = new Map<string, number>();
  performance.forEach((row) => {
    revenueByMonth.set(row.monthKey, (revenueByMonth.get(row.monthKey) ?? 0) + Math.max(0, row.revenue));
    revenueByMonthCity.set(
      `${row.monthKey}|${row.city}`,
      (revenueByMonthCity.get(`${row.monthKey}|${row.city}`) ?? 0) + Math.max(0, row.revenue),
    );
  });

  return performance.map((row) => {
    const cityKey = `${row.monthKey}|${row.city}`;
    const cityReceivable = receivableByMonthCity.get(cityKey);
    const receivable = cityReceivable ?? receivableByMonth.get(row.monthKey);
    const monthRevenue = cityReceivable
      ? revenueByMonthCity.get(cityKey) ?? 0
      : revenueByMonth.get(row.monthKey) ?? 0;
    const baseActualRevenue = Number.isFinite(row.actualRevenue) ? row.actualRevenue : row.revenue;
    if (!receivable || monthRevenue <= 0 || row.revenue <= 0) {
      return { ...row, actualRevenue: Math.max(0, baseActualRevenue) };
    }

    const debtShare = receivable.debtAmount * (row.revenue / monthRevenue);
    const actualRevenue = Math.max(0, row.revenue - debtShare);
    return { ...row, actualRevenue: roundMoney(actualRevenue) };
  });
}

function mergeReceivableRows(
  left: RevenueReceivableMonthly | undefined,
  right: RevenueReceivableMonthly,
): RevenueReceivableMonthly {
  if (!left) return { ...right };
  return {
    ...left,
    debtAmount: left.debtAmount + right.debtAmount,
    returnedAmount: left.returnedAmount + right.returnedAmount,
    badAmount: left.badAmount + right.badAmount,
    outstandingAmount: left.outstandingAmount + right.outstandingAmount,
    debtCount: left.debtCount + right.debtCount,
    badCount: left.badCount + right.badCount,
  };
}

function combineReceivableSources(
  appsRows: RevenueReceivableMonthly[],
  sheetRows: RevenueReceivableMonthly[],
): RevenueReceivableMonthly[] {
  const byKey = new Map<string, RevenueReceivableMonthly>();
  appsRows.forEach((row) => {
    byKey.set(`${row.monthKey}|${row.city ?? ""}`, { ...row });
  });
  sheetRows.forEach((row) => {
    byKey.set(`${row.monthKey}|${row.city ?? ""}`, { ...row });
  });
  return [...byKey.values()]
    .sort((a, b) => `${a.monthKey}|${a.city ?? ""}`.localeCompare(`${b.monthKey}|${b.city ?? ""}`));
}

function normalizeReceivableObjects(rows: Array<Record<string, unknown>>): RevenueReceivableMonthly[] {
  return rows.flatMap((row) => {
    const date = normalizeDate(readObjectField(row, ["date", "дата", "дата создания", "создан", "создана"]));
    const monthKey = stringValue(readObjectField(row, ["monthKey", "month", "месяц"])) || date.slice(0, 7);
    const city = normalizeBrandCity(stringValue(readObjectField(row, ["city", "город", "воронка", "направление"])));
    const debtAmount = toNumber(stringValue(readObjectField(row, [
      "debtAmount",
      "задолженность по теории",
      "сумма задолженности по теории",
      "задолженность",
    ])));
    const revenue = toNumber(stringValue(readObjectField(row, [
      "revenue",
      "выручка",
      "потенциальная выручка",
      "сумма продажи",
    ])));
    if (!monthKey || debtAmount <= 0) return [];
    return [{
      monthKey,
      city,
      label: stringValue(readObjectField(row, ["label", "период"])) || `${monthKey}${city ? ` ${city}` : ""}`,
      debtAmount,
      returnedAmount: toNumber(stringValue(readObjectField(row, ["returnedAmount", "возврат"]))),
      badAmount: toNumber(stringValue(readObjectField(row, ["badAmount", "плохая задолженность"]))),
      outstandingAmount: toNumber(stringValue(readObjectField(row, [
        "outstandingAmount",
        "остаток",
        "задолженность по теории",
        "сумма задолженности по теории",
      ]))) || debtAmount,
      debtCount: toNumber(stringValue(readObjectField(row, ["debtCount", "количество"]))) || (debtAmount > 0 ? 1 : 0),
      badCount: toNumber(stringValue(readObjectField(row, ["badCount", "плохих"]))) || (revenue <= 0 && debtAmount > 0 ? 1 : 0),
    }];
  });
}

function normalizeBrandAliasObjects(rows: Array<Record<string, unknown>>): BrandAlias[] {
  return rows.flatMap((row) => {
    const raw = stringValue(row.raw || row.alias || row["алиас"] || row["исходное название"]);
    const brand = stringValue(row.brand || row["бренд"] || row.canonical || row["единое название"]);
    return raw && brand ? [{ raw, brand }] : [];
  });
}

function normalizeBrandBudgetObjects(rows: Array<Record<string, unknown>>): BrandBudgetMonthly[] {
  return rows.flatMap((row) => {
    const city = normalizeBrandCity(stringValue(row.city || row["город"]));
    const monthKey = stringValue(row.monthKey || row.month || row["месяц"]);
    const brand = normalizeDrrBrandName(stringValue(row.brand || row["бренд"]));
    const source = canonicalSourceName(stringValue(row.source || row["источник"]) || "Другая реклама");
    const budget = toNumber(stringValue(row.budget || row["бюджет"] || row["расход"]));
    if (!city || !monthKey || !brand || budget <= 0) return [];
    return [{ monthKey, city, brand, source, budget }];
  });
}

function normalizeMetrikaBrandSourceObjects(rows: Array<Record<string, unknown>>): MetrikaBrandSourceDaily[] {
  return rows.flatMap((row) => {
    const date = normalizeDate(row.date || row["дата"]);
    const monthKey = stringValue(row.monthKey || row.month || row["месяц"]) || date.slice(0, 7);
    const brand = stringValue(row.brand || row["бренд"]) || "Без бренда";
    const source = canonicalSourceName(stringValue(row.source || row["источник"]) || "Неизвестно");
    if (!date || !monthKey || !brand || !source) return [];

    return [{
      id: stringValue(row.id) || `${date}-${stringValue(row.city || row["город"])}-${brand}-${source}`,
      date,
      monthKey,
      city: normalizeMetrikaCity(stringValue(row.city || row["город"])),
      brand,
      domain: stringValue(row.domain || row["домен"]),
      source,
      trafficSource: stringValue(row.trafficSource || row["тип трафика"]),
      utmSource: stringValue(row.utmSource || row["utm source"]),
      visits: toNumber(stringValue(row.visits || row["визиты"])),
      users: toNumber(stringValue(row.users || row["пользователи"])),
      pageviews: toNumber(stringValue(row.pageviews || row["просмотры"])),
      bounceRate: toNumber(stringValue(row.bounceRate || row["отказы"])),
      avgVisitDuration: toNumber(stringValue(row.avgVisitDuration || row["среднее время"])),
      goalVisits: toNumber(stringValue(row.goalVisits || row["цели"])),
      goalRate: toNumber(stringValue(row.goalRate || row["конверсия цели"])),
      comment: stringValue(row.comment || row["комментарий"]),
      updatedAt: stringValue(row.updatedAt || row["обновлено"]),
    }];
  });
}

function normalizeMetrikaCity(value: string): BrandCity | "Все" {
  return normalizeBrandCity(value) ?? "Все";
}

function rowsToObjects(table: GvizTable): Array<Record<string, string>> {
  const columnHeaders = (table.cols ?? []).map((column) => normalizeHeader(column.label || column.id || ""));
  if (columnHeaders.some(Boolean)) {
    return table.rows.flatMap((row) => {
      const values = rowToValues(row);
      if (!values.some(Boolean)) return [];
      const object: Record<string, string> = {};
      columnHeaders.forEach((header, index) => {
        if (!header) return;
        object[header] = values[index] ?? "";
      });
      return [object];
    });
  }

  const headerIndex = table.rows.findIndex((row) => rowToValues(row).some(Boolean));
  if (headerIndex < 0) return [];
  const headers = rowToValues(table.rows[headerIndex]).map(normalizeHeader);
  return table.rows.slice(headerIndex + 1).flatMap((row) => {
    const values = rowToValues(row);
    if (!values.some(Boolean)) return [];
    const object: Record<string, string> = {};
    headers.forEach((header, index) => {
      if (!header) return;
      object[header] = values[index] ?? "";
    });
    return [object];
  });
}

function rowToValues(row: GvizRow | undefined): string[] {
  return Array.from({ length: row?.c?.length ?? 0 }, (_, index) => readCell(row, index));
}

function normalizeHeader(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function readObjectField(row: Record<string, unknown>, candidates: string[]): unknown {
  for (const candidate of candidates) {
    if (row[candidate] !== undefined) return row[candidate];
  }

  const normalizedCandidates = candidates.map(normalizeHeaderKey);
  const entry = Object.entries(row).find(([key]) => {
    const normalizedKey = normalizeHeaderKey(key);
    return normalizedCandidates.some((candidate) => normalizedKey === candidate || normalizedKey.includes(candidate));
  });
  return entry?.[1];
}

function normalizeHeaderKey(value: string): string {
  return normalizeHeader(value)
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/g, "");
}

function readCell(row: GvizRow | undefined, index: number): string {
  const cell = row?.c?.[index];
  const value = cell?.f ?? cell?.v ?? "";
  return String(value).trim();
}

function normalizeBrandName(brand: string, domain: string): string {
  const cleanBrand = brand.trim();
  if (cleanBrand) return cleanBrand;
  return domain
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split(/[/.]/)[0]
    .replace(/[-_]+/g, " ")
    .trim() || "Без бренда";
}

function inferDomainFromBrand(brand: string): string {
  return brand.toLowerCase().replace(/\s+/g, "-");
}

function normalizeBrandCity(value: string): BrandCity | null {
  const normalized = value.toLowerCase();
  if (normalized.includes("мск") || normalized.includes("москва")) return "МСК";
  if (normalized.includes("спб") || normalized.includes("петербург")) return "СПБ";
  return null;
}

function mergeAliases(first: BrandAlias[], second: BrandAlias[]): BrandAlias[] {
  const map = new Map<string, BrandAlias>();
  [...first, ...second].forEach((alias) => {
    const raw = normalizeBrandKey(alias.raw);
    if (!raw || !alias.brand) return;
    map.set(raw, alias);
  });
  return [...map.values()];
}

function canonicalBrandName(value: string, aliases: BrandAlias[]): string {
  const clean = stringValue(value);
  const key = normalizeBrandKey(clean);
  return aliases.find((alias) => normalizeBrandKey(alias.raw) === key)?.brand ?? clean;
}

function normalizeBrandKey(value: string): string {
  return value.trim().toLowerCase().replace(/ё/g, "е").replace(/[-_.]+/g, " ").replace(/\s+/g, " ");
}

function normalizeDrrBrandName(value: string): string {
  const clean = stringValue(value)
    .replace(/\s+/g, " ")
    .replace(/[_-]+/g, " ")
    .replace(/^(МСК|СПБ)\s+/i, "")
    .replace(/\s+(МСК|СПБ|СПб)$/i, "")
    .trim();
  if (!clean) return "";
  const domain = clean.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
  if (domain === "изи-драйв.рф") return "изи-драйв.рф";

  const compact = normalizeBrandKey(clean).replace(/\s+/g, "");
  const aliases: Array<[string[], string]> = [
    [["изидрайв", "изидрайвспб", "изи драйв"], "Изи Драйв"],
    [["автодрайв", "авто драйв"], "АвтоДрайв"],
    [["hermes", "гермес"], "Гермес"],
    [["поразаруль", "пора за руль", "нампопути"], "Пора за руль"],
    [["рулевой"], "Рулевой"],
    [["топгир", "topgir", "topgear"], "ТопГир"],
    [["автоправо"], "АвтоПраво"],
    [["автотест"], "АвтоТест"],
    [["автопутьалонсо", "алонсо"], "Алонсо"],
    [["автосити"], "АвтоСити"],
    [["autoland"], "Автолэнд"],
    [["dreamавто", "дримавто"], "Dream Auto"],
  ];
  const matched = aliases.find(([keys]) => keys.some((key) => compact === key.replace(/\s+/g, "")));
  return matched?.[1] ?? clean;
}

function isDrrHeaderOrTotal(value: string): boolean {
  const key = normalizeBrandKey(value);
  return key === "бренд" || key === "всего" || key.includes("итого") || key.includes("сумма");
}

function canonicalBranchPlatform(value: string): BrandBranchWeekly["platform"] {
  const normalized = value.toLowerCase();
  if (normalized.includes("2") || normalized.includes("гис") || normalized.includes("gis")) return "2ГИС";
  if (normalized.includes("google") || normalized.includes("гугл")) return "Google Карты";
  return "Яндекс Карты";
}

function canonicalSourceName(value: string): string {
  const normalized = stringValue(value);
  const lower = normalized.toLowerCase();
  const domain = lower.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
  if (lower.includes("unknown") || lower.includes("undefined") || lower.includes("неизвест")) return "Неизвестно";
  if (domain === "изи-драйв.рф" || lower.includes("директ")) return "Директ";
  if (lower === "сайт" || lower === "сайты" || lower === "site" || lower === "sites" || lower.includes("seo")) return "SEO";
  if (lower.includes("2gis") || lower.includes("2гис") || lower.includes("2 гис") || lower.includes("link.2gis")) return "2ГИС";
  if (lower.includes("google") || lower.includes("гугл") || lower.includes("gkart") || /(^|[:_\s-])go($|[:_\s-])/.test(lower)) return "Гугл Карты";
  if (
    lower.includes("ykart")
    || lower.includes("ykar")
    || /(^|[:_\s-])yk($|[:_\s-])/.test(lower)
    || /(^|[:_\s-])ya($|[:_\s-])/.test(lower)
    || lower.includes("geoadv_maps")
  ) return "Яндекс Карты";
  if (lower.includes("яндекс") && lower.includes("карт")) return "Яндекс Карты";
  if (lower.includes("прям")) return "Прямые визиты";
  if (
    lower === "основные"
    || lower === "другое"
    || lower === "другие"
    || lower === "другая реклама"
    || lower === "другие источники"
    || lower === "другой источник"
    || lower.includes("other")
  ) return "Другие";
  return normalized || "Все источники";
}

function canonicalDrrOtherSource(value: string): string {
  const lower = stringValue(value).toLowerCase();
  if (lower.includes("директ")) return "Директ";
  if (lower.includes("кеш") || lower.includes("cashback")) return "Рек/кешбэк";
  return "Другие";
}

function applyBrandBudgets(
  performance: BrandPerformanceWeekly[],
  budgets: BrandBudgetMonthly[],
): BrandPerformanceWeekly[] {
  if (!budgets.length) return performance.map((row) => recalculateBrandBudgetKpis(row, false));

  const normalizedBudgets = mergeBrandBudgets(budgets);
  const budgetByPeriodSource = new Map<string, number>();
  const budgetByPeriodTotal = new Map<string, number>();
  normalizedBudgets.forEach((budget) => {
    const periodKey = brandBudgetPeriodKey(budget);
    budgetByPeriodTotal.set(periodKey, (budgetByPeriodTotal.get(periodKey) ?? 0) + budget.budget);
    const sourceKey = `${periodKey}|${budget.source}`;
    budgetByPeriodSource.set(sourceKey, (budgetByPeriodSource.get(sourceKey) ?? 0) + budget.budget);
  });

  const rowsByPeriodSource = new Map<string, BrandPerformanceWeekly[]>();
  performance.forEach((row) => {
    const key = `${brandBudgetPeriodKey(row)}|${row.source}`;
    rowsByPeriodSource.set(key, [...(rowsByPeriodSource.get(key) ?? []), row]);
  });

  const output: BrandPerformanceWeekly[] = [];
  rowsByPeriodSource.forEach((rows, key) => {
    const [monthKey, city, brandKey] = key.split("|");
    const periodKey = [monthKey, city, brandKey].join("|");
    const sourceBudget = key.endsWith("|Все источники") ? budgetByPeriodTotal.get(periodKey) : budgetByPeriodSource.get(key);
    const budgetToApply = sourceBudget ?? 0;
    output.push(...allocateBudgetAcrossRows(rows, budgetToApply));
  });

  normalizedBudgets.forEach((budget) => {
    const sourceKey = `${brandBudgetPeriodKey(budget)}|${budget.source}`;
    if (rowsByPeriodSource.has(sourceKey)) return;
    const hasBrandRows = performance.some((row) => brandBudgetPeriodKey(row) === brandBudgetPeriodKey(budget));
    if (!hasBrandRows) return;
    output.push(recalculateBrandBudgetKpis({
      id: `drr-budget-${budget.monthKey}-${budget.city}-${normalizeBrandKey(budget.brand)}-${normalizeBrandKey(budget.source)}`,
      weekStart: `${budget.monthKey}-01`,
      monthKey: budget.monthKey,
      city: budget.city,
      brand: budget.brand,
      domain: inferDomainFromBrand(budget.brand),
      source: budget.source,
      leads: 0,
      qualified: 0,
      sales: 0,
      revenue: 0,
      actualRevenue: 0,
      budget: budget.budget,
      roas: null,
      roasFact: null,
      cpl: 0,
      cpql: 0,
      saleCost: 0,
      avgCheck: 0,
    }, true));
  });

  return output.sort((a, b) => (
    a.weekStart.localeCompare(b.weekStart)
    || a.city.localeCompare(b.city, "ru")
    || a.brand.localeCompare(b.brand, "ru")
    || a.source.localeCompare(b.source, "ru")
  ));
}

function mergeBrandBudgets(budgets: BrandBudgetMonthly[]): BrandBudgetMonthly[] {
  const map = new Map<string, BrandBudgetMonthly>();
  budgets.forEach((budget) => {
    if (!budget.budget || !Number.isFinite(budget.budget)) return;
    const normalized = {
      ...budget,
      brand: normalizeDrrBrandName(budget.brand),
      source: canonicalSourceName(budget.source),
    };
    const key = `${brandBudgetPeriodKey(normalized)}|${normalized.source}`;
    const existing = map.get(key);
    if (existing) existing.budget += normalized.budget;
    else map.set(key, { ...normalized });
  });
  return [...map.values()];
}

function allocateBudgetAcrossRows(rows: BrandPerformanceWeekly[], budget: number | null): BrandPerformanceWeekly[] {
  if (budget === null) return rows.map((row) => recalculateBrandBudgetKpis(row, false));
  const weights = rows.map((row) => row.sales || row.qualified || row.leads || 1);
  const totalWeight = weights.reduce((sum, value) => sum + value, 0) || rows.length || 1;
  return rows.map((row, index) => recalculateBrandBudgetKpis({
    ...row,
    budget: budget * (weights[index] / totalWeight),
  }, true));
}

function recalculateBrandBudgetKpis(row: BrandPerformanceWeekly, forceDrrBudget: boolean): BrandPerformanceWeekly {
  const budget = Number.isFinite(row.budget) ? row.budget : 0;
  const actualRevenue = Number.isFinite(row.actualRevenue) ? Math.max(0, row.actualRevenue) : Math.max(0, row.revenue);
  const roas = budget > 0 ? row.revenue / budget : (forceDrrBudget ? null : row.roas);
  const roasFact = budget > 0 ? actualRevenue / budget : (forceDrrBudget ? null : row.roasFact);
  return {
    ...row,
    budget,
    actualRevenue,
    roas,
    roasFact,
    cpl: row.leads > 0 && budget > 0 ? budget / row.leads : 0,
    cpql: row.qualified > 0 && budget > 0 ? budget / row.qualified : 0,
    saleCost: row.sales > 0 && budget > 0 ? budget / row.sales : 0,
    avgCheck: row.sales > 0 ? row.revenue / row.sales : row.avgCheck,
  };
}

function brandBudgetPeriodKey(value: Pick<BrandBudgetMonthly, "monthKey" | "city" | "brand">): string {
  return [value.monthKey, value.city, normalizeBrandKey(value.brand).replace(/\s+/g, "")].join("|");
}

function normalizeDate(value: unknown): string {
  const string = stringValue(value);
  const iso = string.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const ru = string.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (ru) return `${ru[3]}-${ru[2].padStart(2, "0")}-${ru[1].padStart(2, "0")}`;
  return "";
}

function stringValue(value: unknown): string {
  return String(value ?? "").trim();
}

function toNumber(value: string): number {
  if (!value) return 0;
  const normalized = value
    .replace(/\s|\u00a0/g, "")
    .replace("%", "")
    .replace("₽", "")
    .replace("x", "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNullableNumber(value: string): number | null {
  if (!value.trim() || value.trim() === "-") return null;
  return toNumber(value);
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function legacyBrandRecordsToPerformance(records: BrandAnalyticsRecord[]): BrandPerformanceWeekly[] {
  return records.flatMap((record) => {
    const salesTotal = record.monthly.reduce((sum, point) => sum + point.sales, 0);
    return record.monthly.flatMap((point) => {
      const monthKey = monthKeysByLabel[point.month];
      if (!monthKey || point.sales <= 0) return [];
      const ratio = salesTotal > 0 ? point.sales / salesTotal : 0;
      const weekStart = `${monthKey}-01`;
      return [{
        id: `${record.id}-${monthKey}-legacy`,
        weekStart,
        monthKey,
        city: record.city,
        brand: record.brand,
        domain: record.domain,
        source: "Все источники",
        leads: Math.round(record.leads * ratio),
        qualified: Math.round(record.qualified * ratio),
        sales: point.sales,
        revenue: Math.round(record.revenue * ratio),
        actualRevenue: Math.round(record.actualRevenue * ratio),
        budget: Math.round(record.budget * ratio),
        roas: point.roas,
        roasFact: point.roas,
        cpl: record.cpl,
        cpql: record.cpql,
        saleCost: record.saleCost,
        avgCheck: record.avgCheck,
      }];
    });
  });
}
