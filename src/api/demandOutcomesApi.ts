import { callReportApi } from "./reportApi";

export type DemandOutcomeMetric = "sales" | "losses";
export type DemandOutcomeCity = "МСК" | "СПБ" | "Все";

export interface DemandOutcomeRecord {
  month: string;
  city: DemandOutcomeCity;
  metric: DemandOutcomeMetric;
  count: number;
  sourceRow: number;
  sourceColumn: string;
}

export interface DemandOutcomeSource {
  key: DemandOutcomeMetric;
  url: string;
  sheetName: string;
  sheetId: number;
  status: "ready" | "cached" | "error";
  readAt: string;
  fromMonth: string;
  toMonth: string;
  warnings: string[];
  breakdown?: {
    url: string;
    sheetName: string;
    sheetId: number;
    fromMonth: string;
    toMonth: string;
  };
}

export interface DemandOutcomeSnapshot {
  records: DemandOutcomeRecord[];
  sources: DemandOutcomeSource[];
  status: "ready" | "partial" | "error";
  warnings: string[];
}

let pendingSnapshot: Promise<DemandOutcomeSnapshot> | null = null;

function validateSnapshot(value: DemandOutcomeSnapshot): DemandOutcomeSnapshot {
  const validWarnings = (warnings: unknown): warnings is string[] => Array.isArray(warnings) && warnings.every((warning) => typeof warning === "string");
  const validMonth = (month: string) => /^20\d{2}-(0[1-9]|1[0-2])$/.test(month);
  const validBreakdown = (source: DemandOutcomeSource) => !source.breakdown || (source.key === "losses"
    && source.breakdown.url === "https://docs.google.com/spreadsheets/d/1h0cg9NzgfhN_THJBrelCWeMEYMGCqbSoBMFpVAM01-M/edit?gid=105"
    && source.breakdown.sheetName === "Распределение потока" && source.breakdown.sheetId === 105
    && validMonth(source.breakdown.fromMonth) && validMonth(source.breakdown.toMonth) && source.breakdown.fromMonth <= source.breakdown.toMonth);
  if (!value || !Array.isArray(value.records) || !Array.isArray(value.sources)
    || !["ready", "partial", "error"].includes(value.status) || !validWarnings(value.warnings)
    || value.records.some((row) => !row || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(row.month)
      || !Number.isSafeInteger(row.count) || row.count < 0 || !Number.isSafeInteger(row.sourceRow) || row.sourceRow < 2
      || (row.metric === "sales" ? !["МСК", "СПБ"].includes(row.city) || !/^[B-M]$/.test(row.sourceColumn) || row.sourceRow > 18
        : row.metric !== "losses" || (row.city === "Все" ? row.sourceColumn !== "D" || row.sourceRow > 13
          : !["МСК", "СПБ"].includes(row.city) || row.sourceColumn !== (row.city === "МСК" ? "G" : "I") || row.sourceRow < 16 || row.sourceRow > 27)))
    || value.sources.length !== 2 || new Set(value.sources.map((source) => source?.key)).size !== 2
    || value.sources.some((source) => !source || !["sales", "losses"].includes(source.key)
      || !["ready", "cached", "error"].includes(source.status) || !validWarnings(source.warnings)
      || typeof source.sheetName !== "string" || typeof source.readAt !== "string"
      || typeof source.fromMonth !== "string" || typeof source.toMonth !== "string" || !validBreakdown(source)
      || source.url !== (source.key === "sales"
        ? "https://docs.google.com/spreadsheets/d/18AsqW5bhWTTsMYKqWH73AC335llbGlggSA0tGRUEkyw/edit?gid=1815158623"
        : "https://docs.google.com/spreadsheets/d/1h0cg9NzgfhN_THJBrelCWeMEYMGCqbSoBMFpVAM01-M/edit?gid=104"))) {
    throw new Error("Таблицы продаж и сливов вернули данные неизвестного формата. Последняя успешная загрузка сохранена.");
  }
  return value;
}

export function loadDemandOutcomes(): Promise<DemandOutcomeSnapshot> {
  if (pendingSnapshot) return pendingSnapshot;
  const request = callReportApi<DemandOutcomeSnapshot>("getDemandOutcomes").then(validateSnapshot).finally(() => {
    if (pendingSnapshot === request) pendingSnapshot = null;
  });
  pendingSnapshot = request;
  return request;
}

export function refreshDemandOutcomes(password: string): Promise<DemandOutcomeSnapshot> {
  return callReportApi<DemandOutcomeSnapshot>("syncDemandOutcomes", {}, password).then(validateSnapshot);
}
