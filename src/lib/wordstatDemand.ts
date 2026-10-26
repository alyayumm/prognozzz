import type { WordstatDemandRecord } from '../api/wordstatApi';

export const MONTH_LABELS = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

export function buildDemandYearSeries(
  records: readonly WordstatDemandRecord[],
  city: 'МСК' | 'СПБ',
): Array<{ year: number; values: (number | null)[] }> {
  const months = new Map<string, { count: number | null; updatedAt: number }>();

  for (const record of records) {
    if (record.city !== city || typeof record.month !== 'string') continue;
    const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(record.month);
    if (!match || Number(match[1]) === 0 || !Number.isSafeInteger(record.count) || record.count < 0) continue;

    const parsedTimestamp = Date.parse(record.updatedAt);
    const updatedAt = Number.isFinite(parsedTimestamp) ? parsedTimestamp : -Infinity;
    const previous = months.get(record.month);
    if (!previous || updatedAt > previous.updatedAt) {
      months.set(record.month, { count: record.count, updatedAt });
    } else if (updatedAt === previous.updatedAt && previous.count !== record.count) {
      // Equally fresh conflicting observations cannot establish a reliable demand value.
      previous.count = null;
    }
  }

  const years = new Map<number, (number | null)[]>();
  for (const [month, { count }] of months) {
    const year = Number(month.slice(0, 4));
    let values = years.get(year);
    if (!values) {
      values = Array<number | null>(12).fill(null);
      years.set(year, values);
    }
    values[Number(month.slice(5, 7)) - 1] = count;
  }

  return Array.from(years, ([year, values]) => ({ year, values })).sort((a, b) => a.year - b.year);
}
