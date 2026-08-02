import type { City, DailyRecord, Metric, MonthConfig, PlanByCity } from "../types";

const spreadsheetId = "1aVrYGhV3j1ZTB9KCPnETXTLRafekprmrBbLPolIwZ-s";
const sourceYear = 2026;
const sourceSheets: Array<{ sheetName: string; city: City }> = [
  { sheetName: "МОСКВА", city: "МСК" },
  { sheetName: "санкт-петербург", city: "СПБ" },
];
const messagesSheetName = "СООБЩЕНИЯ";
const serviceSheets = {
  daily: "Data_Daily",
  months: "Month_Config",
  plans: "Month_Plans",
};
const metricLabels: Metric[] = ["Лиды", "Квалы", "Продажи"];
const cityLabels: City[] = ["МСК", "СПБ", "сообщения"];
const planCityLabels: Array<Extract<City, "МСК" | "СПБ">> = ["МСК", "СПБ"];
const monthNames = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];
const monthNameToIndex = new Map(
  monthNames.map((name, index) => [name.toLowerCase(), index] as const),
);

type GvizCell = { v?: string | number | null; f?: string | null } | null;
type GvizRow = { c?: GvizCell[] | null };
type GvizTable = {
  cols: Array<{ label?: string | null }>;
  rows: GvizRow[];
};
type GvizResponse = {
  status?: string;
  table?: GvizTable;
  errors?: Array<{ detailed_message?: string; message?: string }>;
};

type DateColumn = {
  index: number;
  date: string;
  monthKey: string;
};

export type PublicSheetSnapshot = {
  records: DailyRecord[];
  monthConfigs: MonthConfig[];
  latestActualDate: string | null;
};

export async function loadPublicSheetSnapshot(fallbackMonthConfigs: MonthConfig[]): Promise<PublicSheetSnapshot> {
  try {
    const serviceSnapshot = await loadServiceSheetSnapshot(fallbackMonthConfigs);
    if (serviceSnapshot.monthConfigs.length && serviceSnapshot.records.length) {
      return serviceSnapshot;
    }
  } catch {
    // If service sheets are not published yet, keep the old city-sheet import path alive.
  }

  const cityTables = await Promise.all(
    sourceSheets.map(async (source) => ({
      ...source,
      table: await loadGvizSheet(source.sheetName),
    })),
  );
  const messagesTable = await loadGvizSheet(messagesSheetName);

  const records = [
    ...cityTables.flatMap((source) => parseCitySheet(source.table, source.city)),
    ...parseMessagesSheet(messagesTable),
  ];
  const latestActualDate = getLatestActualDate(records);

  return {
    records,
    monthConfigs: buildMonthConfigs(records, fallbackMonthConfigs),
    latestActualDate,
  };
}

async function loadServiceSheetSnapshot(fallbackMonthConfigs: MonthConfig[]): Promise<PublicSheetSnapshot> {
  const [monthTable, planTable, dailyTable] = await Promise.all([
    loadGvizSheet(serviceSheets.months),
    loadGvizSheet(serviceSheets.plans),
    loadGvizSheet(serviceSheets.daily),
  ]);
  const planRows = rowsToObjects(planTable);
  const records = parseServiceDailySheet(dailyTable);
  const monthConfigs = parseServiceMonthConfigs(monthTable, planRows, fallbackMonthConfigs);

  return {
    records,
    monthConfigs,
    latestActualDate: getLatestActualDate(records),
  };
}

function loadGvizSheet(sheetName: string): Promise<GvizTable> {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("Browser document is not available"));
      return;
    }

    const callbackName = `__weeklyReportSheet_${Date.now()}_${Math.random().toString(36).slice(2)}`;
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
      `tqx=out:json;responseHandler:${callbackName}&sheet=${encodeURIComponent(sheetName)}&tq=${encodeURIComponent("select *")}&_=${Date.now()}`;
    document.head.appendChild(script);
  });
}

function parseCitySheet(table: GvizTable, city: City): DailyRecord[] {
  const columns = getDateColumns(table);
  const rowsByMetric = new Map<Metric, { plan?: GvizRow; fact?: GvizRow }>();

  table.rows.forEach((row) => {
    const rowType = readCell(row, 0).toUpperCase();
    const metric = normalizeMetric(readCell(row, 2));
    if (!metric) return;

    const entry = rowsByMetric.get(metric) ?? {};
    if (rowType === "OPTIMA") entry.plan = row;
    if (rowType === "FACT") entry.fact = row;
    rowsByMetric.set(metric, entry);
  });

  return metricLabels.flatMap((metric) => {
    const rows = rowsByMetric.get(metric);
    return columns.map((column) => {
      const plan = toNumber(rows?.plan ? readCell(rows.plan, column.index) : "");
      const fact = toNumber(rows?.fact ? readCell(rows.fact, column.index) : "");
      return buildRecord(column.date, city, metric, plan, fact);
    });
  });
}

function parseMessagesSheet(table: GvizTable): DailyRecord[] {
  const columns = getDateColumns(table);
  const aggregate = new Map<string, Record<Metric, number>>();

  columns.forEach((column) => {
    aggregate.set(column.date, { Лиды: 0, Квалы: 0, Продажи: 0 });
  });

  table.rows.slice(1).forEach((row) => {
    const metric = normalizeMetric(readCell(row, 2));
    if (!metric) return;

    columns.forEach((column) => {
      const current = aggregate.get(column.date);
      if (!current) return;
      current[metric] += toNumber(readCell(row, column.index));
    });
  });

  return columns.flatMap((column) => {
    const values = aggregate.get(column.date) ?? { Лиды: 0, Квалы: 0, Продажи: 0 };
    return metricLabels.map((metric) => buildRecord(column.date, "сообщения", metric, 0, values[metric]));
  });
}

function buildRecord(date: string, city: City, metric: Metric, plan: number, fact: number): DailyRecord {
  return {
    id: `${date}-${city}-${metric}`,
    date,
    city,
    channel: city === "сообщения" ? "Сообщения" : "Город",
    metric,
    plan,
    fact,
    forecast: 0,
    recommendations: 0,
    omQualified: 0,
    comment: "",
  };
}

function getDateColumns(table: GvizTable): DateColumn[] {
  const dateRow = table.rows[0];
  if (!dateRow) return [];

  return table.cols
    .map((column, index) => {
      if (index < 3) return null;
      const date = buildDateIso(readCell(dateRow, index), column.label ?? "");
      if (!date) return null;
      return { index, date, monthKey: date.slice(0, 7) };
    })
    .filter((column): column is DateColumn => Boolean(column));
}

function buildDateIso(dayLabel: string, monthLabel: string): string | null {
  const match = dayLabel.match(/^(\d{1,2})\.(\d{1,2})$/);
  if (!match) return null;

  const day = Number(match[1]);
  const monthFromDate = Number(match[2]);
  const monthFromLabel = monthNameToIndex.get(monthLabel.trim().toLowerCase());
  const monthIndex = Number.isFinite(monthFromDate) ? monthFromDate - 1 : monthFromLabel;
  if (!Number.isFinite(day) || day < 1 || monthIndex === undefined || monthIndex < 0 || monthIndex > 11) return null;

  return `${sourceYear}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function readCell(row: GvizRow | undefined, index: number): string {
  const cell = row?.c?.[index];
  const value = cell?.f ?? cell?.v ?? "";
  return String(value).trim();
}

function rowsToObjects(table: GvizTable): Array<Record<string, string>> {
  const columnHeaders = table.cols.map((column) => String(column.label ?? "").trim());
  const hasColumnHeaders = columnHeaders.some(Boolean);
  const headerRow = hasColumnHeaders ? undefined : table.rows[0];
  if (!hasColumnHeaders && !headerRow) return [];

  const headers = hasColumnHeaders ? columnHeaders : table.cols.map((_, index) => readCell(headerRow, index));
  const rows = hasColumnHeaders ? table.rows : table.rows.slice(1);

  return rows.map((row) => {
    return headers.reduce<Record<string, string>>((acc, header, index) => {
      if (header) acc[header] = readCell(row, index);
      return acc;
    }, {});
  }).filter((row) => Object.values(row).some(Boolean));
}

function parseServiceDailySheet(table: GvizTable): DailyRecord[] {
  return rowsToObjects(table)
    .map((row) => {
      const date = normalizeDateValue(row.date);
      const city = normalizeCity(row.city);
      const metric = normalizeMetric(row.metric);
      if (!date || !city || !metric) return null;
      const comment = row.comment || "";

      const record: DailyRecord = {
        id: row.id || `${date}-${city}-${metric}`,
        date,
        city,
        channel: row.channel || (city === "сообщения" ? "Сообщения" : "Город"),
        metric,
        plan: toNumber(row.plan || ""),
        fact: toNumber(row.fact || ""),
        forecast: toNumber(row.forecast || ""),
        recommendations: toNumber(row.recommendations || ""),
        omQualified: metric === "Квалы" ? toNumber(row.omQualified || "") || parseOmQualifiedFromComment(comment) : 0,
        comment: stripOmQualifiedFromComment(comment),
        updatedAt: row.updatedAt || "",
      };
      return record;
    })
    .filter((record): record is DailyRecord => record !== null)
    .sort((a, b) => a.date.localeCompare(b.date) || a.city.localeCompare(b.city) || a.metric.localeCompare(b.metric));
}

function parseServiceMonthConfigs(
  table: GvizTable,
  planRows: Array<Record<string, string>>,
  fallbackMonthConfigs: MonthConfig[],
): MonthConfig[] {
  const fallbackMap = new Map(fallbackMonthConfigs.map((config) => [config.monthKey, config]));

  return rowsToObjects(table)
    .map((row) => {
      const year = toNumber(row.year || "");
      const monthIndex = toNumber(row.monthIndex || "");
      const monthKey = normalizeMonthKey(row.monthKey, year, monthIndex);
      if (!monthKey || !Number.isFinite(year) || !Number.isFinite(monthIndex)) return null;

      const fallback = fallbackMap.get(monthKey);
      const plansByCity = plansByCityFromServiceRows(monthKey, planRows, fallback?.plansByCity);
      const plan = mergeExplicitPlan(fallback?.plan, combineReportPlan(plansByCity));

      const config: MonthConfig = {
        monthKey,
        label: row.label || fallback?.label || `${monthNames[monthIndex]} ${year}`,
        year,
        monthIndex,
        daysInMonth: toNumber(row.daysInMonth || "") || fallback?.daysInMonth || new Date(year, monthIndex + 1, 0).getDate(),
        plan,
        plansByCity,
        dailyAverageByCity: fallback?.dailyAverageByCity,
        status: row.status === "closed" ? "closed" : "active",
      };
      return config;
    })
    .filter((config): config is MonthConfig => config !== null)
    .sort((a, b) => a.monthKey.localeCompare(b.monthKey));
}

function plansByCityFromServiceRows(
  monthKey: string,
  rows: Array<Record<string, string>>,
  fallbackPlans?: PlanByCity,
): PlanByCity {
  const plans = clonePlansByCity(fallbackPlans);

  rows.forEach((row) => {
    const rowMonthKey = normalizeMonthKey(row.monthKey);
    const city = normalizeCity(row.city);
    const metric = normalizeMetric(row.metric);
    if (!city || !metric || rowMonthKey !== monthKey) return;
    plans[city][metric] = toNumber(row.plan || "");
  });

  return plans;
}

function normalizeDateValue(value: string): string | null {
  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  const ruMatch = value.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (ruMatch) {
    return `${ruMatch[3]}-${ruMatch[2].padStart(2, "0")}-${ruMatch[1].padStart(2, "0")}`;
  }

  return null;
}

function normalizeMonthKey(value: string | undefined, year?: number, monthIndex?: number): string | null {
  const raw = String(value || "").trim();
  const isoMonth = raw.match(/^(\d{4})-(\d{2})/);
  if (isoMonth) return `${isoMonth[1]}-${isoMonth[2]}`;

  if (Number.isFinite(year) && Number.isFinite(monthIndex)) {
    return `${year}-${String(Number(monthIndex) + 1).padStart(2, "0")}`;
  }

  return null;
}

function normalizeCity(value: string): City | null {
  return cityLabels.find((city) => city.toLowerCase() === value.trim().toLowerCase()) ?? null;
}

function toNumber(value: string): number {
  const normalized = value.replace(/\s+/g, "").replace(",", ".");
  if (!normalized) return 0;
  const numberValue = Number(normalized);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function normalizeMetric(value: string): Metric | null {
  const normalized = value.trim().toUpperCase();
  if (normalized.includes("ЛИД")) return "Лиды";
  if (normalized.includes("КВАЛ")) return "Квалы";
  if (normalized.includes("ПРОДАЖ")) return "Продажи";
  return null;
}

const omQualifiedCommentPattern = /\[OM_KVAL=([\d.,]+)\]/i;

function parseOmQualifiedFromComment(comment: string): number {
  const match = comment.match(omQualifiedCommentPattern);
  if (!match) return 0;
  const value = Number(match[1].replace(",", "."));
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function stripOmQualifiedFromComment(comment: string): string {
  return comment.replace(omQualifiedCommentPattern, "").trim();
}

function buildMonthConfigs(records: DailyRecord[], fallbackMonthConfigs: MonthConfig[]): MonthConfig[] {
  const configMap = new Map(
    fallbackMonthConfigs.map((config) => [
      config.monthKey,
      {
        ...config,
        plansByCity: clonePlansByCity(config.plansByCity),
      },
    ]),
  );
  const sourcePlans = new Map<string, PlanByCity>();

  records.forEach((record) => {
    const monthKey = record.date.slice(0, 7);
    if (!configMap.has(monthKey)) {
      const date = new Date(`${record.date}T00:00:00`);
      const monthIndex = date.getMonth();
      configMap.set(monthKey, {
        monthKey,
        label: `${monthNames[monthIndex]} ${date.getFullYear()}`,
        year: date.getFullYear(),
        monthIndex,
        daysInMonth: new Date(date.getFullYear(), monthIndex + 1, 0).getDate(),
        plan: { Лиды: 0, Квалы: 0, Продажи: 0 },
        plansByCity: createEmptyPlans(),
        status: "active",
      });
    }

    if (!isPlanCity(record.city) || record.plan <= 0) return;
    const plans = sourcePlans.get(monthKey) ?? createEmptyPlans();
    plans[record.city][record.metric] += record.plan;
    sourcePlans.set(monthKey, plans);
  });

  sourcePlans.forEach((plans, monthKey) => {
    const config = configMap.get(monthKey);
    if (!config) return;
    const nextPlans = clonePlansByCity(config.plansByCity);
    planCityLabels.forEach((city) => {
      metricLabels.forEach((metric) => {
        if (plans[city][metric] > 0) nextPlans[city][metric] = plans[city][metric];
      });
    });
    config.plansByCity = nextPlans;
    config.plan = mergeExplicitPlan(config.plan, combineReportPlan(nextPlans));
    configMap.set(monthKey, config);
  });

  return [...configMap.values()].sort((a, b) => a.monthKey.localeCompare(b.monthKey));
}

function isPlanCity(city: DailyRecord["city"]): city is Extract<City, "МСК" | "СПБ"> {
  return city === "МСК" || city === "СПБ";
}

function clonePlansByCity(plansByCity?: PlanByCity): PlanByCity {
  const source = plansByCity ?? createEmptyPlans();
  return cityLabels.reduce<PlanByCity>((acc, city) => {
    acc[city] = { ...source[city] };
    return acc;
  }, {} as PlanByCity);
}

function createEmptyPlans(): PlanByCity {
  return cityLabels.reduce<PlanByCity>((acc, city) => {
    acc[city] = { Лиды: 0, Квалы: 0, Продажи: 0 };
    return acc;
  }, {} as PlanByCity);
}

function combineReportPlan(plansByCity: PlanByCity): Record<Metric, number> {
  return metricLabels.reduce<Record<Metric, number>>((acc, metric) => {
    acc[metric] = plansByCity.МСК[metric] + plansByCity.СПБ[metric];
    return acc;
  }, {} as Record<Metric, number>);
}

function mergeExplicitPlan(
  explicitPlan: Record<Metric, number> | undefined,
  combinedPlan: Record<Metric, number>,
): Record<Metric, number> {
  return metricLabels.reduce<Record<Metric, number>>((acc, metric) => {
    const value = Number(explicitPlan?.[metric]);
    acc[metric] = Number.isFinite(value) && value > 0 ? value : combinedPlan[metric];
    return acc;
  }, {} as Record<Metric, number>);
}

function getLatestActualDate(records: DailyRecord[]): string | null {
  return records.reduce<string | null>((latestDate, record) => {
    if (record.fact <= 0) return latestDate;
    if (!latestDate || record.date > latestDate) return record.date;
    return latestDate;
  }, null);
}
