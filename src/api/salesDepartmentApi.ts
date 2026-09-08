import { callReportApi } from "./reportApi";

const salesDepartmentSpreadsheetId = "1ptVO-e34DEMKxwriTFFg1hzZLjFhwuWvBqq8Gn5WemI";
const dakoroPlanSpreadsheetId = "1AabnCG2SckbpbrOAhh2J45eLXEqNEvbma1UNMTFetr4";

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
] as const;

export type SalesDayPoint = {
  key: string;
  label: string;
  weekday: string;
  totalTraffic: number;
  mskTraffic: number;
  spbTraffic: number;
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

const staticPsMetricsByManager: Record<string, ManagerPsMetrics> = {
  "Руднев Денис": { vipDeals: 1, distantDeals: 0, paidDeals: 1, orderCount: 2, revenue: 118490, abDeals: 0 },
  "Драбо Максим": { vipDeals: 0, distantDeals: 0, paidDeals: 0, orderCount: 0, revenue: 0, abDeals: 0 },
  "Борисова Алена": { vipDeals: 4, distantDeals: 0, paidDeals: 2, orderCount: 11, revenue: 642980, abDeals: 2 },
  "Шевелев Иван": { vipDeals: 2, distantDeals: 0, paidDeals: 3, orderCount: 4, revenue: 224500, abDeals: 0 },
  "Садовников Алексей": { vipDeals: 2, distantDeals: 0, paidDeals: 2, orderCount: 11, revenue: 491490, abDeals: 4 },
  "Сергеева Софья": { vipDeals: 0, distantDeals: 0, paidDeals: 0, orderCount: 3, revenue: 184000, abDeals: 0 },
  "Смирнов Никита": { vipDeals: 1, distantDeals: 0, paidDeals: 0, orderCount: 2, revenue: 122500, abDeals: 0 },
  "Антиповский Евгений": { vipDeals: 3, distantDeals: 0, paidDeals: 5, orderCount: 10, revenue: 455990, abDeals: 0 },
};

const monthKey = "2026-09";
const monthLabel = "Сентябрь 2026";
const monthYear = 2026;
const monthIndex = 8;

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

export async function loadSalesDepartmentSnapshot(): Promise<SalesDepartmentSnapshot> {
  const serviceSnapshot = await loadSalesDepartmentServiceSnapshot();
  if (serviceSnapshot) return applySalesDepartmentPsSnapshot(serviceSnapshot);

  return applySalesDepartmentPsSnapshot(await loadSalesDepartmentGvizSnapshot());
}

async function loadSalesDepartmentServiceSnapshot(): Promise<SalesDepartmentSnapshot | null> {
  try {
    return await withTimeout(
      callReportApi<SalesDepartmentSnapshot>("getSalesDepartmentDashboard", { monthKey }),
      16000,
      "Sales department Apps Script timeout",
    );
  } catch {
    return null;
  }
}

async function loadSalesDepartmentGvizSnapshot(): Promise<SalesDepartmentSnapshot> {
  const warnings: string[] = [];
  const planResult = await settle(loadGvizRange(dakoroPlanSpreadsheetId, "Лист1", "A1:J20", 22000));
  const planByManager = planResult.ok ? parsePlanSheet(planResult.value) : new Map<string, ManagerPlan>();
  let planLabel = "Планы менеджеров";

  if (!planResult.ok) {
    warnings.push("План менеджеров не загрузился, часть план-факт показателей временно пустая.");
  } else {
    planLabel = readCell(planResult.value.rows[0], 0) || planLabel;
  }

  const dynamicsResults = await Promise.all(
    dynamicsRanges.map((config) =>
      settle(loadGvizRange(salesDepartmentSpreadsheetId, "Динамика", config.range, 30000)),
    ),
  );
  const dynamicsByManager = new Map<string, Map<string, string>>();

  dynamicsResults.forEach((result, index) => {
    if (!result.ok) {
      warnings.push(`Не загрузился фрагмент динамики ${dynamicsRanges[index].range}.`);
      return;
    }
    mergeDynamicsRange(dynamicsByManager, result.value, dynamicsRanges[index]);
  });

  const [dailyResult, psResult] = await Promise.all([
    settle(loadGvizRange(salesDepartmentSpreadsheetId, "Динамика по дням", "A1:Q12", 24000)),
    settle(loadGvizQuery(salesDepartmentSpreadsheetId, "Выгрузка PS", "select P,S,W,Z,AA,AD,AK,AL,AM,AN,AP limit 1500", 28000)),
  ]);

  const daily = dailyResult.ok ? parseDailySheet(dailyResult.value) : [];
  if (!dailyResult.ok) warnings.push("Дневная динамика не загрузилась, линейный прогноз посчитан по текущему факту.");

  const psByManager = psResult.ok ? parsePsSheet(psResult.value) : new Map<string, ManagerPsMetrics>();
  if (!psResult.ok) warnings.push("Выгрузка PS не успела загрузиться: VIP, дистант и средний чек показаны только там, где есть данные динамики.");

  const workingDaysInMonth = countWorkingDaysInMonth(monthYear, monthIndex);
  const latestActualDate = getLatestActualDate(daily);
  const workingDaysPassed = Math.max(1, latestActualDate ? countWorkingDaysUntil(monthYear, monthIndex, latestActualDate) : daily.filter((day) => day.totalTraffic > 0 || day.totalDeals > 0).length || 1);
  const activeCalendarDays = daily.filter((day) => day.totalTraffic > 0 || day.totalDeals > 0).length;

  const managers = dakoroManagers.map((name) => {
    const plan = planByManager.get(name) ?? emptyPlan();
    const dynamic = dynamicsByManager.get(name) ?? new Map<string, string>();
    const ps = psByManager.get(name);
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
      vipDeals: ps ? ps.vipDeals : null,
      distantDeals: ps ? ps.distantDeals : null,
      paidDeals: ps ? ps.paidDeals : null,
      orderCount,
      avgCheck: revenue !== null && orderCount && orderCount > 0 ? revenue / orderCount : null,
      revenue,
      linearDealsForecast: linearForecast(factDeals, workingDaysPassed, workingDaysInMonth),
      linearQualifiedForecast: linearForecast(factQualified, workingDaysPassed, workingDaysInMonth),
    };
  });

  return {
    rop: "Дакоро",
    monthKey,
    monthLabel,
    planLabel,
    latestActualDate,
    workingDaysPassed,
    workingDaysInMonth,
    activeCalendarDays,
    managers,
    daily,
    totals: buildTotals(managers),
    warnings,
    sourceLinks: {
      dynamics: `https://docs.google.com/spreadsheets/d/${salesDepartmentSpreadsheetId}/edit#gid=2045376562`,
      plans: `https://docs.google.com/spreadsheets/d/${dakoroPlanSpreadsheetId}/edit#gid=0`,
    },
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

function applySalesDepartmentPsSnapshot(snapshot: SalesDepartmentSnapshot): SalesDepartmentSnapshot {
  if (snapshot.monthKey !== monthKey) return snapshot;

  const managers = snapshot.managers.map((manager) => {
    const fallback = staticPsMetricsByManager[manager.name];
    if (!fallback) return manager;

    const orderCount = manager.orderCount ?? fallback.orderCount;
    const revenue = manager.revenue ?? fallback.revenue;

    return {
      ...manager,
      vipDeals: manager.vipDeals ?? fallback.vipDeals,
      distantDeals: manager.distantDeals ?? fallback.distantDeals,
      paidDeals: manager.paidDeals ?? fallback.paidDeals,
      orderCount,
      revenue,
      abDeals: Math.max(manager.abDeals, fallback.abDeals),
      avgCheck: revenue !== null && orderCount && orderCount > 0 ? revenue / orderCount : manager.avgCheck,
    };
  });

  const warnings = snapshot.warnings
    .filter((warning) => !warning.includes("Выгрузка PS") && !warning.includes("VIP, дистант"))
    .concat("VIP, дистант, выручка и средний чек добавлены из PS-снимка от 08.09.2026.");

  return {
    ...snapshot,
    managers,
    totals: buildTotals(managers),
    warnings,
  };
}

function parsePlanSheet(table: GvizTable): Map<string, ManagerPlan> {
  const rows = rowsToMatrix(table);
  const managerRow = rows.find((row) => normalizeLabel(row[0]) === normalizeLabel("Менеджеры")) ?? [];
  const rowMap = new Map(rows.map((row) => [normalizeLabel(row[0]), row]));

  return new Map(
    dakoroManagers.map((name) => {
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

function mergeDynamicsRange(target: Map<string, Map<string, string>>, table: GvizTable, config: DynamicsRangeConfig) {
  const rows = table.rows;
  config.names.forEach((managerName, columnIndex) => {
    const metrics = target.get(managerName) ?? new Map<string, string>();
    dynamicsRowLabels.forEach((label, rowIndex) => {
      if (!label) return;
      metrics.set(label, readCell(rows[rowIndex], columnIndex));
    });
    target.set(managerName, metrics);
  });
}

function parseDailySheet(table: GvizTable): SalesDayPoint[] {
  const rows = rowsToMatrix(table);
  const dateRow = findMatrixRow(rows, "Дата");
  const weekdayRow = findMatrixRow(rows, "День недели");
  const trafficMskRow = findMatrixRow(rows, "Обращения МСК");
  const trafficSpbRow = findMatrixRow(rows, "Обращения СПБ");
  const trafficTotalRow = findMatrixRow(rows, "Итого Обращения");
  const dealsMskRow = findMatrixRow(rows, "Договоры МСК");
  const dealsSpbRow = findMatrixRow(rows, "Договоры СПБ");
  const dealsTotalRow = findMatrixRow(rows, "Итого Договоры");

  if (!dateRow.length) return [];

  return dateRow.slice(1).map((label, offset) => {
    const column = offset + 1;
    const normalizedDate = parseDayLabel(label);
    return {
      key: normalizedDate || `${monthKey}-${String(column).padStart(2, "0")}`,
      label: label || String(column).padStart(2, "0"),
      weekday: weekdayRow[column] || "",
      totalTraffic: toNumber(trafficTotalRow[column]) || toNumber(trafficMskRow[column]) + toNumber(trafficSpbRow[column]),
      mskTraffic: toNumber(trafficMskRow[column]),
      spbTraffic: toNumber(trafficSpbRow[column]),
      totalDeals: toNumber(dealsTotalRow[column]) || toNumber(dealsMskRow[column]) + toNumber(dealsSpbRow[column]),
      mskDeals: toNumber(dealsMskRow[column]),
      spbDeals: toNumber(dealsSpbRow[column]),
    };
  }).filter((day) => day.label);
}

function parsePsSheet(table: GvizTable): Map<string, ManagerPsMetrics> {
  const result = new Map<string, ManagerPsMetrics>();

  table.rows.forEach((row) => {
    const abFlag = readCell(row, 0);
    const manager = readCell(row, 2);
    const createdAt = readCell(row, 3);
    const paymentDate = readCell(row, 4);
    const price = toNumber(readCell(row, 5));
    const tariff = `${readCell(row, 6)} ${readCell(row, 7)}`;
    const distant = readCell(row, 8);
    const count = toNumber(readCell(row, 9)) || 1;
    const contract = readCell(row, 10);
    const managerName = dakoroManagers.find((name) => managerMatches(manager, name));

    if (!managerName || !isDateInMonth(createdAt, monthKey) || !hasContract(contract)) return;

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
    if (isTruthy(distant)) item.distantDeals += count;
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

function parseDayLabel(label: string): string | null {
  const match = label.match(/^(\d{1,2})\.(\d{1,2})/);
  if (!match) return null;
  return `${monthYear}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
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
  return normalized === "true" || normalized === "истина" || normalized === "да" || normalized === "1";
}

function isVipTariff(value: string): boolean {
  const normalized = normalizeText(value);
  return normalized.includes("вип") || normalized.includes("vip") || normalized.includes("расшир");
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
