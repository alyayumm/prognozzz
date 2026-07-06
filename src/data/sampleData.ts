import type { City, DailyRecord, EventItem, Metric, MonthConfig } from "../types";

export const cities: City[] = ["МСК", "СПБ", "сообщения"];
export const metrics: Metric[] = ["Лиды", "Квалы", "Продажи"];

export const monthConfigs: MonthConfig[] = [
  {
    monthKey: "2026-04",
    label: "Апрель 2026",
    year: 2026,
    monthIndex: 3,
    daysInMonth: 30,
    plan: {
      Лиды: 4360,
      Квалы: 2110,
      Продажи: 760,
    },
  },
  {
    monthKey: "2026-05",
    label: "Май 2026",
    year: 2026,
    monthIndex: 4,
    daysInMonth: 31,
    plan: {
      Лиды: 5070,
      Квалы: 2490,
      Продажи: 890,
    },
  },
  {
    monthKey: "2026-06",
    label: "Июнь 2026",
    year: 2026,
    monthIndex: 5,
    daysInMonth: 30,
    plan: {
      Лиды: 4680,
      Квалы: 2290,
      Продажи: 820,
    },
  },
  {
    monthKey: "2026-07",
    label: "Июль 2026",
    year: 2026,
    monthIndex: 6,
    daysInMonth: 31,
    plan: {
      Лиды: 4889,
      Квалы: 2410,
      Продажи: 859,
    },
  },
];

export const monthConfig: MonthConfig = monthConfigs[monthConfigs.length - 1];

export function createMonthConfig(year: number, monthIndex: number, plan: Record<Metric, number>): MonthConfig {
  const monthKey = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
  const monthName = new Intl.DateTimeFormat("ru-RU", { month: "long" })
    .format(new Date(year, monthIndex, 1))
    .replace(/^./, (char) => char.toUpperCase());

  return {
    monthKey,
    label: `${monthName} ${year}`,
    year,
    monthIndex,
    daysInMonth: new Date(year, monthIndex + 1, 0).getDate(),
    plan,
  };
}

const julyConfig: MonthConfig = {
  monthKey: "2026-07",
  label: "Июль 2026",
  year: 2026,
  monthIndex: 6,
  daysInMonth: 31,
  plan: {
    Лиды: 4889,
    Квалы: 2410,
    Продажи: 859,
  },
};

const cityShare: Record<City, number> = {
  МСК: 0.52,
  СПБ: 0.38,
  сообщения: 0.1,
};

const metricBase: Record<Metric, number> = {
  Лиды: 158,
  Квалы: 78,
  Продажи: 28,
};

const weekdayFactor = [0.82, 1.12, 1.18, 1.08, 1.04, 0.86, 0.72];

export function buildSeedRecords(): DailyRecord[] {
  return monthConfigs.flatMap((config, monthIndex) => buildRecordsForMonth(config, monthIndex));
}

export function buildRecordsForMonth(config: MonthConfig, monthOffset = 0): DailyRecord[] {
  const records: DailyRecord[] = [];

  for (let day = 1; day <= config.daysInMonth; day += 1) {
    const date = new Date(Date.UTC(config.year, config.monthIndex, day));
    const weekday = date.getUTCDay();
    metrics.forEach((metric) => {
      cities.forEach((city) => {
        const monthPlanFactor = config.plan[metric] / julyConfig.plan[metric];
        const base = metricBase[metric] * cityShare[city] * weekdayFactor[weekday] * monthPlanFactor;
        const pulse = Math.sin((day + monthOffset * 2) / 2.6) * 0.1 + Math.cos((day + monthOffset) / 5.2) * 0.07;
        const eventLift = config.monthKey === "2026-07" && day >= 15 && day <= 18 && metric !== "Продажи" ? -0.16 : 0;
        const plan = Math.round(base);
        const fact = Math.max(0, Math.round(base * (1 + pulse + eventLift)));
        const forecast = Math.round(base * (1 + pulse * 0.6 + 0.04));
        records.push({
          id: `${date.toISOString().slice(0, 10)}-${city}-${metric}`,
          date: date.toISOString().slice(0, 10),
          city,
          channel: city === "сообщения" ? "Сообщения" : "Город",
          metric,
          plan,
          fact,
          forecast,
          comment: "",
        });
      });
    });
  }

  return records;
}

export const seedEvents: EventItem[] = [
  {
    id: "evt-1",
    startDate: "2026-07-03",
    endDate: "2026-07-05",
    title: "Праздничный трафик",
    type: "праздники",
    group: "external",
    source: "manual",
    expectedEffect: "неизвестно",
    actualEffect: "положительный",
    importance: 2,
    city: "все",
    metric: "Лиды",
    description: "Рост обращений в начале месяца, особенно по верхней части воронки.",
  },
  {
    id: "evt-2",
    startDate: "2026-07-15",
    endDate: "2026-07-18",
    title: "Перенастройка рекламы",
    type: "рекламные изменения",
    group: "internal",
    source: "manual",
    expectedEffect: "положительный",
    actualEffect: "негативный",
    importance: 3,
    city: "СПБ",
    metric: "Квалы",
    description: "Период просадки качества после смены кампаний.",
  },
  {
    id: "evt-3",
    startDate: "2026-07-24",
    endDate: "2026-07-24",
    title: "Акция конкурента",
    type: "конкуренты",
    group: "external",
    source: "manual",
    expectedEffect: "негативный",
    actualEffect: "неизвестно",
    importance: 2,
    city: "МСК",
    metric: "Продажи",
    description: "Нужно проверить влияние на продажи в конце недели.",
  },
];
