import { callReportApi } from "./reportApi";

const salesDepartmentSpreadsheetId = "1ptVO-e34DEMKxwriTFFg1hzZLjFhwuWvBqq8Gn5WemI";
const dakoroPlanSpreadsheetId = "1AabnCG2SckbpbrOAhh2J45eLXEqNEvbma1UNMTFetr4";
const salesDepartmentCachePrefix = "rectop-sales-department-snapshot-v8:";
const salesDepartmentCacheTtlMs = 1000 * 60 * 10;
const gvizTimeouts = {
  plan: 9000,
  dynamics: 12000,
  daily: 12000,
  ps: 14000,
  special: 14000,
  service: 10000,
};

export const salesDepartmentRops = ["Дакоро", "Гурьянов", "Саркисов"] as const;
export type SalesDepartmentRop = (typeof salesDepartmentRops)[number];

export const dakoroManagers = [
  "Руднев Денис",
  "Драбо Максим",
  "Борисова Алена",
  "Шевелев Иван",
  "Садовников Алексей",
  "Сергеева Софья",
  "Смирнов Никита",
  "Антиповский Евгений",
  "Алавердян Армен",
  "Ищечкин Артем",
] as const;

export type SalesDayPoint = {
  key: string;
  label: string;
  weekday: string;
  totalTraffic: number;
  mskTraffic: number;
  spbTraffic: number;
  totalQualified: number;
  mskQualified: number;
  spbQualified: number;
  totalDeals: number;
  mskDeals: number;
  spbDeals: number;
};

export type SalesManagerMetrics = {
  name: string;
  displayName: string;
  planTraffic: number;
  planQualified: number;
  planDeals: number;
  planVip: number;
  planDistant: number;
  totalTraffic: number;
  factQualified: number;
  forecastQualified: number;
  siteRequests: number;
  calls: number;
  quizRequests: number;
  applications: number;
  factDeals: number;
  forecastDeals: number;
  lagDeals: number;
  abDeals: number;
  sheetFactCompletion: number | null;
  sheetForecastCompletion: number | null;
  planConversion: number | null;
  factConversion: number | null;
  totalConversion: number | null;
  applicationsToDeals: number | null;
  mskTraffic: number;
  spbTraffic: number;
  mskQualified: number;
  spbQualified: number;
  mskDeals: number;
  spbDeals: number;
  mskConversion: number | null;
  spbConversion: number | null;
  vipDeals: number | null;
  distantDeals: number | null;
  paidDeals: number | null;
  orderCount: number | null;
  avgCheck: number | null;
  revenue: number | null;
  linearDealsForecast: number;
  linearQualifiedForecast: number;
};

export type SalesDepartmentTotals = {
  planTraffic: number;
  planQualified: number;
  planDeals: number;
  planVip: number;
  planDistant: number;
  totalTraffic: number;
  factQualified: number;
  forecastQualified: number;
  factDeals: number;
  forecastDeals: number;
  abDeals: number;
  vipDeals: number | null;
  distantDeals: number | null;
  paidDeals: number | null;
  orderCount: number | null;
  revenue: number | null;
  avgCheck: number | null;
  conversionToQualified: number | null;
  conversionToDeals: number | null;
  dealPlanCompletion: number;
  linearDealsForecast: number;
};

export type SalesDepartmentSnapshot = {
  rop: SalesDepartmentRop;
  monthKey: string;
  monthLabel: string;
  planLabel: string;
  latestActualDate: string | null;
  workingDaysPassed: number;
  workingDaysInMonth: number;
  activeCalendarDays: number;
  managers: SalesManagerMetrics[];
  daily: SalesDayPoint[];
  totals: SalesDepartmentTotals;
  warnings: string[];
  sourceLinks: {
    dynamics: string;
    plans: string;
  };
};

type GvizCell = { v?: string | number | boolean | null; f?: string | null } | null;
type GvizRow = { c?: GvizCell[] | null };
type GvizTable = { rows: GvizRow[] };
type GvizResponse = {
  status?: string;
  table?: GvizTable;
  errors?: Array<{ detailed_message?: string; message?: string }>;
};
type DynamicsRangeConfig = {
  range: string;
  names: readonly string[];
};
type ManagerPlan = {
  planTraffic: number;
  planQualified: number;
  planDeals: number;
  planVip: number;
  planDistant: number;
};
type ManagerPsMetrics = {
  vipDeals: number;
  distantDeals: number;
  paidDeals: number;
  orderCount: number;
  revenue: number;
  abDeals: number;
};

export class SalesDepartmentLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SalesDepartmentLoadError";
  }
}
type ManagerSpecialMetrics = {
  vipDeals?: number;
  distantDeals?: number;
};
type SalesMonthContext = {
  monthKey: string;
  monthLabel: string;
  monthYear: number;
  monthIndex: number;
};
type CachedSalesDepartmentSnapshot = {
  savedAt: number;
  snapshot: SalesDepartmentSnapshot;
};

const defaultSalesDepartmentMonthKey = "2026-09";
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
] as const;

const dynamicsRowLabels = [
  "Менеджеры",
  "Обращения всего",
  "Обращения целевые",
  "Заявки с сайта",
  "Звонки",
  "Симакин и квизы",
  "",
  "Доля целевых от всего",
  "План обращения",
  "Факт обращения",
  "Прогноз обращения",
  "План договоры",
  "Факт Договоры",
  "Прогноз Шт",
  "Отставание",
  "Факт, %",
  "Прогноз, %",
  "A+B",
  "План конверсия",
  "Факт коверсия",
  "Заявки",
  "Доля договоров от заявок",
  "Доля заявок от целевых",
  "Договоры в мес.",
  "Доля договоров в мес. от договоров",
  "Факт конверсия из всего",
  "План обращения  целевые МСК",
  "Факт обращения всего МСК",
  "Факт обращения целевые МСК",
  "План обращения целевые СПБ",
  "Факт обращения всего СПБ",
  "Факт обращения целевые СПБ",
  "План договоры МСК",
  "Факт договоры МСК",
  "План  договоры СПБ",
  "Факт  договоры СПБ",
  "План Конверсия МСК",
] as const;

const dynamicsRanges: DynamicsRangeConfig[] = [
  { range: "D2:D38", names: ["Руднев Денис"] },
  { range: "G2:H38", names: ["Смирнов Никита", "Сергеева Софья"] },
  { range: "N2:N38", names: ["Драбо Максим"] },
  { range: "S2:S38", names: ["Садовников Алексей"] },
  { range: "V2:V38", names: ["Борисова Алена"] },
  { range: "X2:X38", names: ["Антиповский Евгений"] },
  { range: "Z2:Z38", names: ["Шевелев Иван"] },
];

export async function loadSalesDepartmentSnapshot(
  requestedMonthKey = defaultSalesDepartmentMonthKey,
  options: { forceFresh?: boolean; allowStaleFallback?: boolean } = {},
): Promise<SalesDepartmentSnapshot> {
  const context = getSalesMonthContext(requestedMonthKey);
  const allowStaleFallback = options.allowStaleFallback ?? false;
  const cachedSnapshot = allowStaleFallback ? readCachedSalesDepartmentSnapshot(context) : null;

  if (options.forceFresh) {
    const gvizSnapshot = await loadSalesDepartmentGvizSnapshot(context);
    if (isUsableSalesDepartmentSnapshot(gvizSnapshot)) {
      const liveSnapshot = withSalesDepartmentFactDate(gvizSnapshot, context);
      return isCompleteSalesDepartmentSnapshot(liveSnapshot)
        ? cacheSalesDepartmentSnapshot(liveSnapshot)
        : liveSnapshot;
    }

    const serviceSnapshot = await loadSalesDepartmentServiceSnapshot(context);
    if (serviceSnapshot && isUsableSalesDepartmentSnapshot(serviceSnapshot) && !isStaleSalesDepartmentSnapshot(serviceSnapshot, context)) {
      const liveSnapshot = withSalesDepartmentFactDate(serviceSnapshot, context);
      return isCompleteSalesDepartmentSnapshot(liveSnapshot)
        ? cacheSalesDepartmentSnapshot(liveSnapshot)
        : liveSnapshot;
    }

    if (serviceSnapshot && isStaleSalesDepartmentSnapshot(serviceSnapshot, context)) {
      throw new SalesDepartmentLoadError("Apps Script возвращает старый снимок отдела продаж. Нужно развернуть свежую версию Weekly Report API.");
    }

    if (allowStaleFallback && cachedSnapshot) {
      return withSalesDepartmentWarning(
        withSalesDepartmentFactDate(cachedSnapshot, context),
        "Живые таблицы не успели ответить, показан последний сохраненный снимок.",
      );
    }

    throw new SalesDepartmentLoadError("Свежие данные отдела продаж не загрузились из Google Sheets.");
  }

  const gvizSnapshot = await loadSalesDepartmentGvizSnapshot(context);
  if (isUsableSalesDepartmentSnapshot(gvizSnapshot)) {
    const liveSnapshot = withSalesDepartmentFactDate(gvizSnapshot, context);
    return isCompleteSalesDepartmentSnapshot(liveSnapshot)
      ? cacheSalesDepartmentSnapshot(liveSnapshot)
      : liveSnapshot;
  }

  const serviceSnapshot = await loadSalesDepartmentServiceSnapshot(context);
  if (serviceSnapshot && isUsableSalesDepartmentSnapshot(serviceSnapshot) && !isStaleSalesDepartmentSnapshot(serviceSnapshot, context)) {
    const liveSnapshot = withSalesDepartmentFactDate(serviceSnapshot, context);
    return isCompleteSalesDepartmentSnapshot(liveSnapshot)
      ? cacheSalesDepartmentSnapshot(liveSnapshot)
      : liveSnapshot;
  }

  if (allowStaleFallback && cachedSnapshot) {
    return withSalesDepartmentWarning(
      withSalesDepartmentFactDate(cachedSnapshot, context),
      "Живые таблицы не успели ответить, показан последний сохраненный снимок.",
    );
  }

  if (serviceSnapshot) {
    return {
      ...withSalesDepartmentFactDate(serviceSnapshot, context),
      warnings: [
        ...serviceSnapshot.warnings,
        "Прямое чтение Google Sheets не вернуло данные, показан Apps Script-снимок.",
      ],
    };
  }

  if (allowStaleFallback) return gvizSnapshot;

  throw new Error("Свежие данные отдела продаж не загрузились из Google Sheets.");
}

export function getCachedSalesDepartmentSnapshot(requestedMonthKey = defaultSalesDepartmentMonthKey): SalesDepartmentSnapshot | null {
  return readCachedSalesDepartmentSnapshot(getSalesMonthContext(requestedMonthKey));
}

async function loadSalesDepartmentServiceSnapshot(context: SalesMonthContext): Promise<SalesDepartmentSnapshot | null> {
  try {
    return await withTimeout(
      callReportApi<SalesDepartmentSnapshot>("getSalesDepartmentDashboard", { monthKey: context.monthKey }),
      gvizTimeouts.service,
      "Sales department Apps Script timeout",
    );
  } catch {
    return null;
  }
}

async function loadSalesDepartmentGvizSnapshot(context: SalesMonthContext): Promise<SalesDepartmentSnapshot> {
  const warnings: string[] = [];
  const [planResult, dynamicsResult, dailyResult, psResult, specialResult] = await Promise.all([
    settle(loadGvizRange(dakoroPlanSpreadsheetId, "Лист1", "A1:Z20", gvizTimeouts.plan)),
    settle(loadGvizRange(salesDepartmentSpreadsheetId, "Динамика", "A1:AZ38", gvizTimeouts.dynamics)),
    settle(loadGvizRange(salesDepartmentSpreadsheetId, "Динамика по дням", "A1:AF20", gvizTimeouts.daily)),
    settle(loadGvizQuery(salesDepartmentSpreadsheetId, "Выгрузка PS", "select P,Q,R,S,T,U,V,W,X,Y,Z,AA,AB,AC,AD,AE,AF,AG,AH,AI,AJ,AK,AL,AM,AN,AO,AP limit 5000", gvizTimeouts.ps)),
    settle(loadGvizRange(salesDepartmentSpreadsheetId, "Динамика", "A3:W79", gvizTimeouts.special)),
  ]);

  const planByManager = planResult.ok ? parsePlanSheet(planResult.value) : new Map<string, ManagerPlan>();
  const planManagerNames = planResult.ok ? extractPlanManagerNames(planResult.value) : [];
  let planLabel = "Планы менеджеров";

  if (!planResult.ok) {
    warnings.push("План менеджеров не загрузился, часть план-факт показателей временно пустая.");
  } else {
    planLabel = readCell(planResult.value.rows[0], 0) || planLabel;
  }

  const dynamicsParsed = dynamicsResult.ok
    ? parseRopDynamicsSheet(dynamicsResult.value, "Дакоро")
    : { managers: [] as string[], metrics: new Map<string, Map<string, string>>() };
  const dynamicsByManager = dynamicsParsed.metrics;
  if (!dynamicsResult.ok) warnings.push("Динамика отдела продаж не загрузилась из живого листа.");

  const baseManagerNames = uniqueManagers([...planManagerNames, ...dynamicsParsed.managers, ...dakoroManagers]);

  const daily = dailyResult.ok ? parseDailySheet(dailyResult.value, context) : [];
  if (!dailyResult.ok) warnings.push("Дневная динамика не загрузилась, линейный прогноз посчитан по текущему факту.");

  const psByManager = psResult.ok ? parsePsSheet(psResult.value, context.monthKey, baseManagerNames) : new Map<string, ManagerPsMetrics>();
  if (!psResult.ok) warnings.push("Выгрузка PS не успела загрузиться: VIP, дистант и средний чек показаны только там, где есть данные динамики.");
  const specialByManager = specialResult.ok ? parseSpecialManagerTables(specialResult.value, baseManagerNames) : new Map<string, ManagerSpecialMetrics>();
  if (!specialResult.ok) warnings.push("VIP и дистанты не прочитались из мини-таблиц листа Динамика.");

  const managerNames = uniqueManagers([
    ...planManagerNames,
    ...dynamicsParsed.managers,
    ...Array.from(psByManager.keys()),
    ...Array.from(specialByManager.keys()),
    ...dakoroManagers,
  ]);

  const workingDaysInMonth = countWorkingDaysInMonth(context.monthYear, context.monthIndex);
  const latestActualDate = getCurrentMonthDateKey(context) ?? getLatestActualDate(daily);
  const workingDaysPassed = Math.max(1, latestActualDate ? countWorkingDaysUntil(context.monthYear, context.monthIndex, latestActualDate) : daily.filter((day) => day.totalTraffic > 0 || day.totalDeals > 0).length || 1);
  const activeCalendarDays = daily.filter((day) => day.totalTraffic > 0 || day.totalDeals > 0).length;

  const managers = managerNames.map((name) => {
    const plan = getManagerValue(planByManager, name) ?? emptyPlan();
    const dynamic = getManagerValue(dynamicsByManager, name) ?? new Map<string, string>();
    const ps = getManagerValue(psByManager, name);
    const special = getManagerValue(specialByManager, name);
    const factDeals = numberFromMap(dynamic, "Факт Договоры");
    const factQualified = numberFromMap(dynamic, "Факт обращения") || numberFromMap(dynamic, "Обращения целевые");
    const totalTraffic = numberFromMap(dynamic, "Обращения всего");
    const forecastDeals = numberFromMap(dynamic, "Прогноз Шт");
    const forecastQualified = numberFromMap(dynamic, "Прогноз обращения");
    const revenue = ps ? ps.revenue : null;
    const orderCount = ps ? ps.orderCount : null;

    return {
      name,
      displayName: dynamic.get("Менеджеры") || name,
      planTraffic: plan.planTraffic,
      planQualified: plan.planQualified,
      planDeals: plan.planDeals,
      planVip: plan.planVip,
      planDistant: plan.planDistant,
      totalTraffic,
      factQualified,
      forecastQualified,
      siteRequests: numberFromMap(dynamic, "Заявки с сайта"),
      calls: numberFromMap(dynamic, "Звонки"),
      quizRequests: numberFromMap(dynamic, "Симакин и квизы"),
      applications: numberFromMap(dynamic, "Заявки"),
      factDeals,
      forecastDeals,
      lagDeals: numberFromMap(dynamic, "Отставание"),
      abDeals: Math.max(numberFromMap(dynamic, "A+B"), ps?.abDeals ?? 0),
      sheetFactCompletion: nullablePercentFromMap(dynamic, "Факт, %"),
      sheetForecastCompletion: nullablePercentFromMap(dynamic, "Прогноз, %"),
      planConversion: nullablePercentFromMap(dynamic, "План конверсия") ?? percentValue(plan.planDeals, plan.planQualified),
      factConversion: nullablePercentFromMap(dynamic, "Факт коверсия") ?? percentValue(factDeals, factQualified),
      totalConversion: nullablePercentFromMap(dynamic, "Факт конверсия из всего") ?? percentValue(factDeals, totalTraffic),
      applicationsToDeals: nullablePercentFromMap(dynamic, "Доля договоров от заявок"),
      mskTraffic: numberFromMap(dynamic, "Факт обращения всего МСК"),
      spbTraffic: numberFromMap(dynamic, "Факт обращения всего СПБ"),
      mskQualified: numberFromMap(dynamic, "Факт обращения целевые МСК"),
      spbQualified: numberFromMap(dynamic, "Факт обращения целевые СПБ"),
      mskDeals: numberFromMap(dynamic, "Факт договоры МСК"),
      spbDeals: numberFromMap(dynamic, "Факт  договоры СПБ"),
      mskConversion: percentValue(numberFromMap(dynamic, "Факт договоры МСК"), numberFromMap(dynamic, "Факт обращения целевые МСК")),
      spbConversion: percentValue(numberFromMap(dynamic, "Факт  договоры СПБ"), numberFromMap(dynamic, "Факт обращения целевые СПБ")),
      vipDeals: special?.vipDeals ?? (ps ? ps.vipDeals : null),
      distantDeals: special?.distantDeals ?? (ps ? ps.distantDeals : null),
      paidDeals: ps ? ps.paidDeals : null,
      orderCount,
      avgCheck: revenue !== null && orderCount && orderCount > 0 ? revenue / orderCount : null,
      revenue,
      linearDealsForecast: linearForecast(factDeals, workingDaysPassed, workingDaysInMonth),
      linearQualifiedForecast: linearForecast(factQualified, workingDaysPassed, workingDaysInMonth),
    };
  });

  const dailyWithQualified = ensureDailyQualified(
    daily,
    sum(managers, (manager) => manager.factQualified),
    sum(managers, (manager) => manager.mskQualified),
    sum(managers, (manager) => manager.spbQualified),
  );

  return {
    rop: "Дакоро",
    monthKey: context.monthKey,
    monthLabel: context.monthLabel,
    planLabel,
    latestActualDate,
    workingDaysPassed,
    workingDaysInMonth,
    activeCalendarDays,
    managers,
    daily: dailyWithQualified,
    totals: buildTotals(managers),
    warnings,
    sourceLinks: {
      dynamics: `https://docs.google.com/spreadsheets/d/${salesDepartmentSpreadsheetId}/edit#gid=1317166314`,
      plans: `https://docs.google.com/spreadsheets/d/${dakoroPlanSpreadsheetId}/edit#gid=0`,
    },
  };
}

function getSalesMonthContext(requestedMonthKey: string): SalesMonthContext {
  const match = String(requestedMonthKey || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return getSalesMonthContext(defaultSalesDepartmentMonthKey);
  const monthYear = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (!Number.isFinite(monthYear) || monthIndex < 0 || monthIndex > 11) return getSalesMonthContext(defaultSalesDepartmentMonthKey);
  return {
    monthKey: `${monthYear}-${String(monthIndex + 1).padStart(2, "0")}`,
    monthLabel: `${monthNames[monthIndex]} ${monthYear}`,
    monthYear,
    monthIndex,
  };
}

function isUsableSalesDepartmentSnapshot(snapshot: SalesDepartmentSnapshot): boolean {
  return snapshot.totals.totalTraffic > 0
    || snapshot.totals.factQualified > 0
    || snapshot.totals.factDeals > 0
    || snapshot.daily.some((day) => day.totalTraffic > 0 || day.totalDeals > 0)
    || snapshot.managers.some((manager) => manager.totalTraffic > 0 || manager.factQualified > 0 || manager.factDeals > 0);
}

function isCompleteSalesDepartmentSnapshot(snapshot: SalesDepartmentSnapshot): boolean {
  const blockingWarningParts = [
    "План менеджеров не загрузился",
    "Динамика отдела продаж не загрузилась",
    "Выгрузка PS не успела",
    "VIP и дистанты не прочитались",
    "резервный снимок",
    "сохраненный снимок",
    "встроенный снимок",
  ];
  return !snapshot.warnings.some((warning) => blockingWarningParts.some((part) => warning.includes(part)));
}

function isStaleSalesDepartmentSnapshot(snapshot: SalesDepartmentSnapshot, context: SalesMonthContext): boolean {
  return snapshot.monthKey !== context.monthKey
    || snapshot.monthLabel !== context.monthLabel
    || snapshot.warnings.some((warning) => warning.includes("08.09.2026") || warning.includes("быстрого снимка"));
}

function getCurrentMonthDateKey(context: SalesMonthContext): string | null {
  const today = new Date();
  const todayMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

  if (todayMonthKey === context.monthKey) {
    return `${context.monthKey}-${String(today.getDate()).padStart(2, "0")}`;
  }

  if (todayMonthKey > context.monthKey) {
    const lastDay = new Date(context.monthYear, context.monthIndex + 1, 0).getDate();
    return `${context.monthKey}-${String(lastDay).padStart(2, "0")}`;
  }

  return null;
}

function withSalesDepartmentFactDate(snapshot: SalesDepartmentSnapshot, context: SalesMonthContext): SalesDepartmentSnapshot {
  const latestActualDate = getCurrentMonthDateKey(context) ?? snapshot.latestActualDate;
  if (!latestActualDate) return snapshot;

  return {
    ...snapshot,
    latestActualDate,
    workingDaysPassed: Math.max(1, countWorkingDaysUntil(context.monthYear, context.monthIndex, latestActualDate)),
  };
}

function readCachedSalesDepartmentSnapshot(context: SalesMonthContext): SalesDepartmentSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(getSalesDepartmentCacheKey(context.monthKey));
    if (!raw) return null;

    const cached = JSON.parse(raw) as CachedSalesDepartmentSnapshot;
    if (!cached?.snapshot || cached.snapshot.monthKey !== context.monthKey) return null;
    if (Date.now() - cached.savedAt > salesDepartmentCacheTtlMs) return null;
    if (!isUsableSalesDepartmentSnapshot(cached.snapshot)) return null;

    return cached.snapshot;
  } catch {
    return null;
  }
}

function cacheSalesDepartmentSnapshot(snapshot: SalesDepartmentSnapshot): SalesDepartmentSnapshot {
  if (typeof window === "undefined" || !isUsableSalesDepartmentSnapshot(snapshot)) return snapshot;
  try {
    const cached: CachedSalesDepartmentSnapshot = {
      savedAt: Date.now(),
      snapshot,
    };
    window.localStorage.setItem(getSalesDepartmentCacheKey(snapshot.monthKey), JSON.stringify(cached));
  } catch {
    // Cache is a speed boost only; storage failures must not break the report.
  }
  return snapshot;
}

function getSalesDepartmentCacheKey(monthKey: string): string {
  return `${salesDepartmentCachePrefix}${monthKey}`;
}

function withSalesDepartmentWarning(snapshot: SalesDepartmentSnapshot, warning: string): SalesDepartmentSnapshot {
  return {
    ...snapshot,
    warnings: snapshot.warnings.includes(warning) ? snapshot.warnings : [...snapshot.warnings, warning],
  };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    promise
      .then((value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      });
  });
}

function loadGvizRange(spreadsheetId: string, sheetName: string, range: string, timeoutMs: number): Promise<GvizTable> {
  return loadGviz(spreadsheetId, sheetName, { range, timeoutMs });
}

function loadGvizQuery(spreadsheetId: string, sheetName: string, query: string, timeoutMs: number): Promise<GvizTable> {
  return loadGviz(spreadsheetId, sheetName, { query, timeoutMs });
}

function loadGviz(
  spreadsheetId: string,
  sheetName: string,
  options: { range?: string; query?: string; timeoutMs: number },
): Promise<GvizTable> {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("Browser document is not available"));
      return;
    }

    const callbackName = `__salesDepartmentSheet_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error(`Google Sheet timeout: ${sheetName}`));
    }, options.timeoutMs);

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

    const params = new URLSearchParams({
      tqx: `out:json;responseHandler:${callbackName}`,
      sheet: sheetName,
      _: String(Date.now()),
    });
    if (options.range) {
      params.set("range", options.range);
      params.set("headers", "0");
    }
    if (options.query) params.set("tq", options.query);

    script.src = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?${params.toString()}`;
    document.head.appendChild(script);
  });
}

function parsePlanSheet(table: GvizTable): Map<string, ManagerPlan> {
  const rows = rowsToMatrix(table);
  const managerRow = rows.find((row) => normalizeLabel(row[0]) === normalizeLabel("Менеджеры")) ?? [];
  const rowMap = new Map(rows.map((row) => [normalizeLabel(row[0]), row]));
  const managerNames = extractPlanManagerNames(table);

  return new Map(
    managerNames.map((name) => {
      const columnIndex = managerRow.findIndex((value) => managerMatches(value, name));
      const readPlan = (label: string) => toNumber(rowMap.get(normalizeLabel(label))?.[columnIndex]);
      return [
        name,
        {
          planTraffic: readPlan("Обращения Общие"),
          planQualified: readPlan("Общие Квал"),
          planDeals: readPlan("Общий План Договоры"),
          planVip: readPlan("ВИП"),
          planDistant: readPlan("Дистанты"),
        },
      ];
    }),
  );
}

function extractPlanManagerNames(table: GvizTable): string[] {
  const rows = rowsToMatrix(table);
  const managerRow = rows.find((row) => normalizeLabel(row[0]) === normalizeLabel("Менеджеры")) ?? [];
  const names = managerRow
    .slice(1)
    .map((value) => value.trim())
    .filter((value) => value && !normalizeLabel(value).includes(normalizeLabel("Итого")));
  return uniqueManagers(names.length ? names : [...dakoroManagers]);
}

function parseRopDynamicsSheet(table: GvizTable, ropName: string): { managers: string[]; metrics: Map<string, Map<string, string>> } {
  const rows = rowsToMatrix(table);
  const ropRow = findMatrixRow(rows, "РОП");
  const managerRow = findMatrixRow(rows, "Менеджеры");
  const metrics = new Map<string, Map<string, string>>();
  const startColumn = ropRow.findIndex((value) => normalizeText(value).includes(normalizeText(ropName)));
  if (startColumn < 0 || !managerRow.length) return { managers: [], metrics };

  let endColumn = ropRow.findIndex((value, index) => index > startColumn && Boolean(normalizeText(value)));
  if (endColumn < 0) endColumn = managerRow.length;

  const managers: string[] = [];
  for (let columnIndex = startColumn; columnIndex < endColumn; columnIndex += 1) {
    const managerName = managerRow[columnIndex]?.trim();
    if (!managerName || normalizeLabel(managerName).includes(normalizeLabel("Итого"))) continue;

    const managerMetrics = new Map<string, string>();
    dynamicsRowLabels.forEach((label) => {
      if (!label) return;
      const row = findMatrixRow(rows, label);
      managerMetrics.set(label, row[columnIndex] ?? "");
    });
    managerMetrics.set("Менеджеры", managerName);
    metrics.set(managerName, managerMetrics);
    managers.push(managerName);
  }

  return { managers: uniqueManagers(managers), metrics };
}

function parseSpecialManagerTables(table: GvizTable, managerNames: readonly string[]): Map<string, ManagerSpecialMetrics> {
  const rows = rowsToMatrix(table);
  const result = new Map<string, ManagerSpecialMetrics>();
  const headerRow = (rows[0] ?? []).slice(13, 23);
  const resolvedManagers = uniqueManagers([
    ...managerNames,
    ...headerRow.filter((value) => value && !normalizeLabel(value).includes(normalizeLabel("Итого"))),
  ]);

  applySpecialSheetRowMetric(rows, headerRow, resolvedManagers, 63, 68, "Итого", "vipDeals", result);
  applySpecialSheetRowMetric(rows, headerRow, resolvedManagers, 74, 79, "Итого", "distantDeals", result);

  return result;
}

function applySpecialSheetRowMetric(
  rows: string[][],
  headerRow: string[],
  managerNames: readonly string[],
  labelStartRow: number,
  labelEndRow: number,
  valueLabel: string,
  field: keyof ManagerSpecialMetrics,
  result: Map<string, ManagerSpecialMetrics>,
) {
  let rowIndex = -1;
  for (let sheetRow = labelStartRow; sheetRow <= labelEndRow; sheetRow += 1) {
    const candidateIndex = sheetRow - 3;
    if (normalizeLabel(rows[candidateIndex]?.[0] ?? "") === normalizeLabel(valueLabel)) {
      rowIndex = candidateIndex;
      break;
    }
  }
  if (rowIndex < 0 && normalizeLabel(valueLabel) === normalizeLabel("Итого")) rowIndex = labelStartRow - 3;

  const valueRow = rows[rowIndex]?.slice(13, 23);
  if (!valueRow) return;

  managerNames.forEach((managerName) => {
    const columnIndex = headerRow.findIndex((value) => managerMatches(value, managerName));
    if (columnIndex < 0) return;
    const current = result.get(managerName) ?? {};
    current[field] = toNumber(valueRow[columnIndex]);
    result.set(managerName, current);
  });
}

function uniqueManagers(names: readonly string[]): string[] {
  const result: string[] = [];
  names.forEach((name) => {
    const trimmed = String(name || "").trim();
    if (!trimmed) return;
    if (result.some((existing) => managerMatches(existing, trimmed))) return;
    result.push(trimmed);
  });
  return result;
}

function getManagerValue<T>(map: Map<string, T>, managerName: string): T | undefined {
  if (map.has(managerName)) return map.get(managerName);
  return Array.from(map.entries()).find(([name]) => managerMatches(name, managerName))?.[1];
}

function parseDailySheet(table: GvizTable, context: SalesMonthContext): SalesDayPoint[] {
  const rows = rowsToMatrix(table);
  const dateRow = findMatrixRow(rows, "Дата");
  const weekdayRow = findMatrixRow(rows, "День недели");
  const trafficMskRow = findMatrixRow(rows, "Обращения МСК");
  const trafficSpbRow = findMatrixRow(rows, "Обращения СПБ");
  const trafficTotalRow = findMatrixRow(rows, "Итого Обращения");
  const qualifiedMskRow = findMatrixRow(rows, "Квалы МСК");
  const qualifiedSpbRow = findMatrixRow(rows, "Квалы СПБ");
  const qualifiedTotalRow = findMatrixRow(rows, "Итого Квалы");
  const dealsMskRow = findMatrixRow(rows, "Договоры МСК");
  const dealsSpbRow = findMatrixRow(rows, "Договоры СПБ");
  const dealsTotalRow = findMatrixRow(rows, "Итого Договоры");

  if (!dateRow.length) return [];

  return dateRow.slice(1).map((label, offset) => {
    const column = offset + 1;
    const normalizedDate = parseDayLabel(label, context);
    return {
      key: normalizedDate || `${context.monthKey}-${String(column).padStart(2, "0")}`,
      label: label || String(column).padStart(2, "0"),
      weekday: weekdayRow[column] || "",
      totalTraffic: toNumber(trafficTotalRow[column]) || toNumber(trafficMskRow[column]) + toNumber(trafficSpbRow[column]),
      mskTraffic: toNumber(trafficMskRow[column]),
      spbTraffic: toNumber(trafficSpbRow[column]),
      totalQualified: toNumber(qualifiedTotalRow[column]) || toNumber(qualifiedMskRow[column]) + toNumber(qualifiedSpbRow[column]),
      mskQualified: toNumber(qualifiedMskRow[column]),
      spbQualified: toNumber(qualifiedSpbRow[column]),
      totalDeals: toNumber(dealsTotalRow[column]) || toNumber(dealsMskRow[column]) + toNumber(dealsSpbRow[column]),
      mskDeals: toNumber(dealsMskRow[column]),
      spbDeals: toNumber(dealsSpbRow[column]),
    };
  }).filter((day) => day.label);
}

function parsePsSheet(table: GvizTable, expectedMonthKey: string, managerNames: readonly string[]): Map<string, ManagerPsMetrics> {
  const result = new Map<string, ManagerPsMetrics>();

  table.rows.forEach((row) => {
    const abFlag = readCell(row, 0);
    const manager = readCell(row, 7);
    const createdAt = readCell(row, 10);
    const paymentDate = readCell(row, 11);
    const price = toNumber(readCell(row, 14));
    const rowText = readRowText(row);
    const tariff = `${readCell(row, 21)} ${readCell(row, 22)} ${rowText}`;
    const distant = `${readCell(row, 23)} ${rowText}`;
    const count = toNumber(readCell(row, 24)) || 1;
    const contract = readCell(row, 26);
    const managerName = managerNames.find((name) => managerMatches(manager, name));

    if (!managerName || !isDateInMonth(createdAt, expectedMonthKey) || !hasContract(contract)) return;

    const item = result.get(managerName) ?? {
      vipDeals: 0,
      distantDeals: 0,
      paidDeals: 0,
      orderCount: 0,
      revenue: 0,
      abDeals: 0,
    };
    item.orderCount += count;
    item.revenue += price;
    if (isTruthy(abFlag)) item.abDeals += count;
    if (isVipTariff(tariff)) item.vipDeals += count;
    if (isDistantDeal(distant)) item.distantDeals += count;
    if (paymentDate && paymentDate !== "-" && paymentDate !== "—") item.paidDeals += count;
    result.set(managerName, item);
  });

  return result;
}

function buildTotals(managers: SalesManagerMetrics[]): SalesDepartmentTotals {
  const vipDeals = sumNullable(managers, (manager) => manager.vipDeals);
  const distantDeals = sumNullable(managers, (manager) => manager.distantDeals);
  const paidDeals = sumNullable(managers, (manager) => manager.paidDeals);
  const orderCount = sumNullable(managers, (manager) => manager.orderCount);
  const revenue = sumNullable(managers, (manager) => manager.revenue);
  const factDeals = sum(managers, (manager) => manager.factDeals);
  const totalTraffic = sum(managers, (manager) => manager.totalTraffic);
  const factQualified = sum(managers, (manager) => manager.factQualified);
  const planDeals = sum(managers, (manager) => manager.planDeals);

  return {
    planTraffic: sum(managers, (manager) => manager.planTraffic),
    planQualified: sum(managers, (manager) => manager.planQualified),
    planDeals,
    planVip: sum(managers, (manager) => manager.planVip),
    planDistant: sum(managers, (manager) => manager.planDistant),
    totalTraffic,
    factQualified,
    forecastQualified: sum(managers, (manager) => manager.forecastQualified),
    factDeals,
    forecastDeals: sum(managers, (manager) => manager.forecastDeals),
    abDeals: sum(managers, (manager) => manager.abDeals),
    vipDeals,
    distantDeals,
    paidDeals,
    orderCount,
    revenue,
    avgCheck: revenue !== null && orderCount && orderCount > 0 ? revenue / orderCount : null,
    conversionToQualified: percentValue(factQualified, totalTraffic),
    conversionToDeals: percentValue(factDeals, factQualified),
    dealPlanCompletion: Math.round(percentValue(factDeals, planDeals) ?? 0),
    linearDealsForecast: sum(managers, (manager) => manager.linearDealsForecast),
  };
}

function ensureDailyQualified(
  days: SalesDayPoint[],
  totalQualified: number,
  mskQualified: number,
  spbQualified: number,
): SalesDayPoint[] {
  if (!days.length) return days;
  if (sum(days, (day) => day.totalQualified) > 0) return days;

  const totalDistribution = distributeByWeights(totalQualified, days.map((day) => day.totalTraffic));
  const mskDistribution = distributeByWeights(mskQualified, days.map((day) => day.mskTraffic));
  const spbDistribution = distributeByWeights(spbQualified, days.map((day) => day.spbTraffic));

  return days.map((day, index) => ({
    ...day,
    totalQualified: totalDistribution[index] ?? 0,
    mskQualified: mskDistribution[index] ?? 0,
    spbQualified: spbDistribution[index] ?? 0,
  }));
}

function distributeByWeights(total: number, weights: number[]): number[] {
  const target = Math.max(0, Math.round(total));
  const weightSum = weights.reduce((totalWeight, value) => totalWeight + Math.max(0, value), 0);
  if (!target || !weightSum) return weights.map(() => 0);

  const raw = weights.map((weight, index) => {
    const value = (Math.max(0, weight) / weightSum) * target;
    return { index, floor: Math.floor(value), remainder: value - Math.floor(value) };
  });
  let left = target - raw.reduce((totalValue, item) => totalValue + item.floor, 0);
  raw
    .sort((a, b) => b.remainder - a.remainder)
    .forEach((item) => {
      if (left <= 0) return;
      item.floor += 1;
      left -= 1;
    });

  return raw.sort((a, b) => a.index - b.index).map((item) => item.floor);
}

function rowsToMatrix(table: GvizTable): string[][] {
  return table.rows.map((row) => (row.c ?? []).map((_, index) => readCell(row, index)));
}

function findMatrixRow(rows: string[][], label: string): string[] {
  return rows.find((row) => normalizeLabel(row[0]) === normalizeLabel(label)) ?? [];
}

function readCell(row: GvizRow | undefined, index: number): string {
  const cell = row?.c?.[index] ?? null;
  if (!cell) return "";
  if (cell.f !== undefined && cell.f !== null) return String(cell.f).trim();
  if (cell.v === undefined || cell.v === null) return "";
  return String(cell.v).trim();
}

function readRowText(row: GvizRow | undefined): string {
  return (row?.c ?? [])
    .map((_, index) => readCell(row, index))
    .filter(Boolean)
    .join(" ");
}

function numberFromMap(map: Map<string, string>, label: string): number {
  return toNumber(map.get(label));
}

function nullablePercentFromMap(map: Map<string, string>, label: string): number | null {
  const value = map.get(label);
  if (!value || value.includes("#")) return null;
  return toNumber(value);
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value === null || value === undefined) return 0;
  const cleaned = String(value)
    .replace(/\s/g, "")
    .replace("%", "")
    .replace("₽", "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function percentValue(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  return (numerator / denominator) * 100;
}

function linearForecast(fact: number, passedDays: number, totalDays: number): number {
  if (!passedDays || !totalDays) return fact;
  return Math.round((fact / passedDays) * totalDays);
}

function sum<T>(items: T[], getValue: (item: T) => number): number {
  return items.reduce((total, item) => total + getValue(item), 0);
}

function sumNullable<T>(items: T[], getValue: (item: T) => number | null): number | null {
  let hasValue = false;
  const value = items.reduce((total, item) => {
    const next = getValue(item);
    if (next === null) return total;
    hasValue = true;
    return total + next;
  }, 0);
  return hasValue ? value : null;
}

function emptyPlan(): ManagerPlan {
  return {
    planTraffic: 0,
    planQualified: 0,
    planDeals: 0,
    planVip: 0,
    planDistant: 0,
  };
}

function parseDayLabel(label: string, context: SalesMonthContext): string | null {
  const match = label.match(/^(\d{1,2})\.(\d{1,2})/);
  if (!match) return null;
  return `${context.monthYear}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

function getLatestActualDate(days: SalesDayPoint[]): string | null {
  const activeDays = days.filter((day) => day.totalTraffic > 0 || day.totalDeals > 0);
  return activeDays.length ? activeDays[activeDays.length - 1].key : null;
}

function countWorkingDaysInMonth(year: number, zeroBasedMonth: number): number {
  const daysInMonth = new Date(year, zeroBasedMonth + 1, 0).getDate();
  let count = 0;
  for (let day = 1; day <= daysInMonth; day += 1) {
    if (isWorkingDay(new Date(year, zeroBasedMonth, day))) count += 1;
  }
  return count;
}

function countWorkingDaysUntil(year: number, zeroBasedMonth: number, isoDate: string): number {
  const dayLimit = Number(isoDate.slice(8, 10)) || 1;
  let count = 0;
  for (let day = 1; day <= dayLimit; day += 1) {
    if (isWorkingDay(new Date(year, zeroBasedMonth, day))) count += 1;
  }
  return count;
}

function isWorkingDay(date: Date): boolean {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

function isDateInMonth(value: string, expectedMonthKey: string): boolean {
  const match = value.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (!match) return false;
  return `${match[3]}-${match[2]}` === expectedMonthKey;
}

function hasContract(value: string): boolean {
  const normalized = normalizeText(value);
  return Boolean(normalized) && normalized.includes("договор") && !normalized.includes("нет");
}

function isTruthy(value: string): boolean {
  const normalized = normalizeText(value);
  return normalized === "true" || normalized === "истина" || normalized === "да" || normalized === "1" || normalized === "+";
}

function isVipTariff(value: string): boolean {
  const normalized = normalizeText(value);
  return normalized.includes("вип") || normalized.includes("vip") || normalized.includes("расшир");
}

function isDistantDeal(value: string): boolean {
  const normalized = normalizeText(value);
  return isTruthy(value) || normalized.includes("дист") || normalized.includes("онлайн") || normalized.includes("online");
}

function managerMatches(candidate: string, manager: string): boolean {
  const normalizedCandidate = normalizePerson(candidate);
  const normalizedManager = normalizePerson(manager);
  if (!normalizedCandidate || !normalizedManager) return false;
  return normalizedCandidate.includes(normalizedManager) || normalizedManager.includes(normalizedCandidate);
}

function normalizeLabel(value: string): string {
  return normalizeText(value).replace(/[^a-zа-я0-9%+]+/g, "");
}

function normalizePerson(value: string): string {
  return normalizeText(value).replace(/[^a-zа-я]+/g, "");
}

function normalizeText(value: string): string {
  return String(value || "").trim().toLowerCase().replace(/ё/g, "е");
}

async function settle<T>(promise: Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
  try {
    return { ok: true, value: await promise };
  } catch (error) {
    return { ok: false, error };
  }
}
