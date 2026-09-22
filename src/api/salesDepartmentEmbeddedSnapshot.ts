import type {
  SalesDayPoint,
  SalesDepartmentSnapshot,
  SalesDepartmentTotals,
  SalesManagerMetrics,
} from "./salesDepartmentApi";

type EmbeddedManager = Omit<SalesManagerMetrics, "linearDealsForecast" | "linearQualifiedForecast">;

const planByManager: Record<string, Pick<SalesManagerMetrics, "planTraffic" | "planQualified" | "planDeals" | "planVip" | "planDistant">> = {
  "Руднев Денис": { planTraffic: 11, planQualified: 5, planDeals: 2, planVip: 0, planDistant: 1 },
  "Драбо Максим": { planTraffic: 279, planQualified: 127, planDeals: 50, planVip: 12, planDistant: 32 },
  "Борисова Алена": { planTraffic: 359, planQualified: 163, planDeals: 64, planVip: 16, planDistant: 42 },
  "Шевелев Иван": { planTraffic: 359, planQualified: 163, planDeals: 64, planVip: 16, planDistant: 42 },
  "Садовников Алексей": { planTraffic: 158, planQualified: 73, planDeals: 27, planVip: 7, planDistant: 17 },
  "Сергеева Софья": { planTraffic: 158, planQualified: 73, planDeals: 27, planVip: 7, planDistant: 17 },
  "Смирнов Никита": { planTraffic: 121, planQualified: 56, planDeals: 18, planVip: 5, planDistant: 12 },
  "Антиповский Евгений": { planTraffic: 121, planQualified: 56, planDeals: 18, planVip: 5, planDistant: 12 },
};

const embeddedManagers: EmbeddedManager[] = [
  manager("Руднев Денис", "Руднев Денис Романович", 0, 8, 0, 0, 0, 0, 0, 2, 3, 60, 0, 3.2, 5, 38, null, null, null, 0, 0, 0, 0, 2, 0),
  manager("Драбо Максим", "Драбо Максим", 115, 56, 80, 30, 76, 9, 27, 17, 24, 31, 0, 35.49, 51, 38, 30.36, 14.78, 62.96, 71, 44, 37, 19, 11, 6),
  manager("Борисова Алена", "Борисова Алена Романовна", 145, 86, 123, 73, 71, 1, 46, 38, 54, 24, 2, 60.84, 87, 38, 44.19, 26.21, 82.61, 104, 41, 55, 31, 23, 15),
  manager("Шевелев Иван", "Шевелев Иван Сергеевич", 114, 45, 64, 27, 86, 3, 21, 15, 21, 47, 0, 24.02, 34, 38, 33.33, 13.16, 71.43, 53, 61, 23, 22, 8, 7),
  manager("Садовников Алексей", "Садовников Алексей Дмитриевич", 120, 66, 94, 0, 0, 0, 28, 26, 37, 0, 3, 98.82, 141, 36, 39.39, 21.67, 92.86, 65, 55, 37, 29, 13, 13),
  manager("Сергеева Софья", "Сергеева Софья Сергеевна", 98, 42, 60, 29, 51, 11, 29, 17, 24, 9, 0, 64.61, 92, 36, 40.48, 17.35, 58.62, 67, 31, 28, 14, 10, 7),
  manager("Смирнов Никита", "Смирнов Никита Алексеевич", 83, 49, 70, 24, 43, 3, 16, 8, 11, 10, 0, 45.43, 65, 31.5, 16.33, 9.64, 50, 0, 0, 23, 26, 3, 5),
  manager("Антиповский Евгений", "Антиповский Евгений Олегович", 153, 81, 116, 26, 117, 6, 33, 22, 31, -4, 0, 123.46, 176, 32, 27.16, 14.38, 66.67, 85, 68, 48, 33, 18, 4),
];

const totalTrafficByDay = [114, 89, 74, 75, 69, 46, 105, 90, 86, 82, 70, 38, 64, 112, 84, 89, 91, 56, 67, 48, 84, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const mskTrafficByDay = [67, 52, 40, 51, 42, 28, 62, 55, 50, 48, 45, 23, 37, 78, 62, 55, 54, 30, 45, 35, 53, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const spbTrafficByDay = [47, 37, 34, 24, 27, 18, 43, 35, 36, 34, 25, 15, 27, 34, 22, 34, 37, 26, 22, 13, 31, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const totalDealsByDay = [13, 22, 25, 32, 17, 19, 34, 27, 25, 26, 27, 12, 21, 36, 27, 27, 22, 21, 13, 14, 22, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const mskDealsByDay = [5, 16, 14, 22, 8, 14, 19, 24, 20, 9, 13, 4, 13, 25, 19, 18, 17, 11, 8, 10, 17, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const spbDealsByDay = [8, 6, 11, 10, 9, 5, 15, 3, 5, 17, 14, 8, 8, 11, 8, 9, 5, 10, 5, 4, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const weekdays = ["вт", "ср", "чт", "пт", "сб", "вс", "пн", "вт", "ср", "чт", "пт", "сб", "вс", "пн", "вт", "ср", "чт", "пт", "сб", "вс", "пн", "вт", "ср", "чт", "пт", "сб", "вс", "пн", "вт", "ср"];

export function buildEmbeddedSalesDepartmentSnapshot(): SalesDepartmentSnapshot {
  const managers = embeddedManagers.map((item) => ({
    ...item,
    linearDealsForecast: linearForecast(item.factDeals, 15, 22),
    linearQualifiedForecast: linearForecast(item.factQualified, 15, 22),
  }));
  const daily = totalTrafficByDay.map<SalesDayPoint>((totalTraffic, index) => {
    const day = index + 1;
    return {
      key: `2026-09-${String(day).padStart(2, "0")}`,
      label: String(day).padStart(2, "0"),
      weekday: weekdays[index] ?? "",
      totalTraffic,
      mskTraffic: mskTrafficByDay[index] ?? 0,
      spbTraffic: spbTrafficByDay[index] ?? 0,
      totalDeals: totalDealsByDay[index] ?? 0,
      mskDeals: mskDealsByDay[index] ?? 0,
      spbDeals: spbDealsByDay[index] ?? 0,
    };
  });

  return {
    rop: "Дакоро",
    monthKey: "2026-09",
    monthLabel: "Сентябрь 2026",
    planLabel: "ПЛАНЫ ИЮЛЬ 2026",
    latestActualDate: "2026-09-21",
    workingDaysPassed: 15,
    workingDaysInMonth: 22,
    activeCalendarDays: 21,
    managers,
    daily,
    totals: buildTotals(managers),
    warnings: ["Снимок отдела продаж обновлен из Google Sheets 22.09. Apps Script пока отдает старый резерв, поэтому для витрины используется свежий встроенный снимок."],
    sourceLinks: {
      dynamics: "https://docs.google.com/spreadsheets/d/1ptVO-e34DEMKxwriTFFg1hzZLjFhwuWvBqq8Gn5WemI/edit#gid=426083025",
      plans: "https://docs.google.com/spreadsheets/d/1AabnCG2SckbpbrOAhh2J45eLXEqNEvbma1UNMTFetr4/edit#gid=0",
    },
  };
}

function manager(
  name: string,
  displayName: string,
  totalTraffic: number,
  factQualified: number,
  forecastQualified: number,
  siteRequests: number,
  calls: number,
  quizRequests: number,
  applications: number,
  factDeals: number,
  forecastDeals: number,
  lagDeals: number,
  abDeals: number,
  sheetFactCompletion: number | null,
  sheetForecastCompletion: number | null,
  planConversion: number | null,
  factConversion: number | null,
  totalConversion: number | null,
  applicationsToDeals: number | null,
  mskTraffic: number,
  spbTraffic: number,
  mskQualified: number,
  spbQualified: number,
  mskDeals: number,
  spbDeals: number,
): EmbeddedManager {
  const plan = planByManager[name];
  return {
    name,
    displayName,
    ...plan,
    totalTraffic,
    factQualified,
    forecastQualified,
    siteRequests,
    calls,
    quizRequests,
    applications,
    factDeals,
    forecastDeals,
    lagDeals,
    abDeals,
    sheetFactCompletion,
    sheetForecastCompletion,
    planConversion,
    factConversion,
    totalConversion,
    applicationsToDeals,
    mskTraffic,
    spbTraffic,
    mskQualified,
    spbQualified,
    mskDeals,
    spbDeals,
    mskConversion: percentValue(mskDeals, mskQualified),
    spbConversion: percentValue(spbDeals, spbQualified),
    vipDeals: null,
    distantDeals: null,
    paidDeals: null,
    orderCount: null,
    avgCheck: null,
    revenue: null,
  };
}

function buildTotals(managers: SalesManagerMetrics[]): SalesDepartmentTotals {
  const totalTraffic = sum(managers, (manager) => manager.totalTraffic);
  const factQualified = sum(managers, (manager) => manager.factQualified);
  const factDeals = sum(managers, (manager) => manager.factDeals);
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
    vipDeals: null,
    distantDeals: null,
    paidDeals: null,
    orderCount: null,
    revenue: null,
    avgCheck: null,
    conversionToQualified: percentValue(factQualified, totalTraffic),
    conversionToDeals: percentValue(factDeals, factQualified),
    dealPlanCompletion: Math.round(percentValue(factDeals, planDeals) ?? 0),
    linearDealsForecast: sum(managers, (manager) => manager.linearDealsForecast),
  };
}

function linearForecast(fact: number, passedDays: number, totalDays: number): number {
  if (!passedDays || !totalDays) return fact;
  return Math.round((fact / passedDays) * totalDays);
}

function percentValue(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  return (numerator / denominator) * 100;
}

function sum<T>(items: T[], getValue: (item: T) => number): number {
  return items.reduce((total, item) => total + getValue(item), 0);
}
