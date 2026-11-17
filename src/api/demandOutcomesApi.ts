import { callReportApi } from "./reportApi";

export type DemandOutcomeMetric = "sales" | "losses" | "examGroups";
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
  const sourceUrls: Record<DemandOutcomeMetric, string> = {
    sales: "https://docs.google.com/spreadsheets/d/18AsqW5bhWTTsMYKqWH73AC335llbGlggSA0tGRUEkyw/edit?gid=1815158623",
    losses: "https://docs.google.com/spreadsheets/d/1h0cg9NzgfhN_THJBrelCWeMEYMGCqbSoBMFpVAM01-M/edit?gid=104",
    examGroups: "https://docs.google.com/spreadsheets/d/1ZPbHfKN6smZKKRqPa-pqjYqf1U9pzUi1YLYhy_5wsnQ/edit?gid=522389953",
  };
  const validRecord = (row: DemandOutcomeRecord) => {
    if (!row || !validMonth(row.month) || !Number.isSafeInteger(row.count) || row.count < 0
      || !Number.isSafeInteger(row.sourceRow) || row.sourceRow < 2) return false;
    if (row.metric === "sales") return ["МСК", "СПБ"].includes(row.city) && /^[B-M]$/.test(row.sourceColumn) && row.sourceRow <= 18;
    if (row.metric === "examGroups") return row.city === "СПБ" && row.sourceRow === 2 && /^(?:[D-Z]|A[A-W])$/.test(row.sourceColumn);
    return row.metric === "losses" && (row.city === "Все" ? row.sourceColumn === "D" && row.sourceRow <= 13
      : ["МСК", "СПБ"].includes(row.city) && row.sourceColumn === (row.city === "МСК" ? "G" : "I") && row.sourceRow >= 16 && row.sourceRow <= 27);
  };
  if (!value || !Array.isArray(value.records) || !Array.isArray(value.sources)
    || !["ready", "partial", "error"].includes(value.status) || !validWarnings(value.warnings)
    || value.records.some((row) => !validRecord(row) || !value.sources.some((source) => source?.key === row.metric))
    || ![2, 3].includes(value.sources.length) || new Set(value.sources.map((source) => source?.key)).size !== value.sources.length
    || !["sales", "losses"].every((key) => value.sources.some((source) => source?.key === key))
    || value.sources.some((source) => !source || !["sales", "losses", "examGroups"].includes(source.key)
      || !["ready", "cached", "error"].includes(source.status) || !validWarnings(source.warnings)
      || typeof source.sheetName !== "string" || typeof source.readAt !== "string"
      || typeof source.fromMonth !== "string" || typeof source.toMonth !== "string" || !validBreakdown(source)
      || source.url !== sourceUrls[source.key]
      || (source.key === "examGroups" && (source.sheetName !== "СВОД" || source.sheetId !== 522389953)))) {
    throw new Error("Таблицы сравнения спроса вернули данные неизвестного формата. Последняя успешная загрузка сохранена.");
  }
  return value;
}

export function loadDemandOutcomes(): Promise<DemandOutcomeSnapshot> {
  if (pendingSnapshot) return pendingSnapshot;
  const request = callReportApi<DemandOutcomeSnapshot>("getDemandOutcomes", { includeExamGroups: true }).then(validateSnapshot).finally(() => {
    if (pendingSnapshot === request) pendingSnapshot = null;
  });
  pendingSnapshot = request;
  return request;
}

export function refreshDemandOutcomes(password: string): Promise<DemandOutcomeSnapshot> {
  return callReportApi<DemandOutcomeSnapshot>("syncDemandOutcomes", { includeExamGroups: true }, password).then(validateSnapshot);
}
