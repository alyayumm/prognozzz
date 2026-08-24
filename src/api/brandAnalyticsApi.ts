export type BrandCity = "МСК" | "СПБ";

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
  budget: number;
  leadToQualified: number;
  qualifiedToSales: number;
  cpl: number;
  cpql: number;
  saleCost: number;
  roas: number | null;
  avgCheck: number;
  monthly: BrandMonthlyPoint[];
};

const brandSpreadsheetId = "1sV1GFMn_Nag1xZQcSSypb57-0i5KtgCJbPgo95rO8oo";
const brandSheets: BrandCity[] = ["МСК", "СПБ"];
const monthLabels = ["Апрель", "Май", "Июнь", "Июль"];

type GvizCell = { v?: string | number | null; f?: string | null } | null;
type GvizRow = { c?: GvizCell[] | null };
type GvizTable = { rows: GvizRow[] };
type GvizResponse = {
  status?: string;
  table?: GvizTable;
  errors?: Array<{ detailed_message?: string; message?: string }>;
};

export async function loadBrandAnalyticsSnapshot(): Promise<BrandAnalyticsRecord[]> {
  const tables = await Promise.all(
    brandSheets.map(async (city) => ({
      city,
      table: await loadBrandGvizSheet(city),
    })),
  );

  return tables.flatMap(({ city, table }) => parseBrandSheet(table, city));
}

function loadBrandGvizSheet(sheetName: string): Promise<GvizTable> {
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
      `https://docs.google.com/spreadsheets/d/${brandSpreadsheetId}/gviz/tq?` +
      `tqx=out:json;responseHandler:${callbackName}&sheet=${encodeURIComponent(sheetName)}&tq=${encodeURIComponent("select *")}&_=${Date.now()}`;
    document.head.appendChild(script);
  });
}

function parseBrandSheet(table: GvizTable, fallbackCity: BrandCity): BrandAnalyticsRecord[] {
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
      budget: toNumber(readCell(row, 7)),
      leadToQualified: toNumber(readCell(row, 8)),
      qualifiedToSales: toNumber(readCell(row, 9)),
      cpl: toNumber(readCell(row, 10)),
      cpql: toNumber(readCell(row, 11)),
      saleCost: toNumber(readCell(row, 12)),
      roas: toNullableNumber(readCell(row, 13)),
      avgCheck: toNumber(readCell(row, 14)),
      monthly,
    }];
  });
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
