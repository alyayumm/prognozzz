import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createReportModelLoader } from './helpers/report-model.mjs';

const { buildDemandDynamics } = createReportModelLoader()('src/lib/demandDynamics.ts');
const now = new Date('2026-11-09T10:00:00+03:00');
const demand = (month, count, city = 'МСК', updatedAt = '2026-11-01T00:00:00Z') => ({ month, count, city, regionId: '', share: null, updatedAt });
const outcome = (month, count, metric = 'sales', city = 'МСК') => ({ month, count, metric, city, sourceRow: 2, sourceColumn: 'B' });
const model = (d, o, options = {}) => buildDemandDynamics(d, o, { city: 'МСК', years: [2026], metric: 'salesRatio', now, ...options });
const point = (result, year, monthIndex = 0) => result.series.find(series => series.year === year).points[monthIndex];

test('multiple years align on twelve static month labels with sorted duplicate-free year series', () => {
  const records = [demand('2025-01', 200), demand('2026-01', 100), demand('2026-02', 50)];
  const outcomes = [outcome('2025-01', 40), outcome('2026-01', 30), outcome('2026-02', 25)];
  const result = model(records, outcomes, { years: [2026, 2025, 2026] });
  assert.deepEqual(result.series.map(series => series.year), [2025, 2026]);
  assert.deepEqual(result.availableYears, [2025, 2026]);
  for (const series of result.series) {
    assert.equal(series.points.length, 12);
    assert.deepEqual(series.points.map(row => row.label), ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек']);
    assert.equal(series.points[0].month, `${series.year}-01`);
  }
  assert.equal(point(result, 2025).value, 0.2);
  assert.equal(point(result, 2026).value, 0.3);
  assert.equal(point(result, 2026, 1).value, 0.5);
  assert.equal(point(result, 2026).sales, 30);
  assert.equal(point(result, 2026).demand, 100);
});

test('each count or ratio metric selects its own value without adding sales and losses together', () => {
  const records = [demand('2026-01', 200)];
  const outcomes = [outcome('2026-01', 50), outcome('2026-01', 30, 'losses')];
  for (const [metric, value] of [['salesRatio', 0.25], ['lossesRatio', 0.15], ['salesCount', 50], ['lossesCount', 30], ['demandCount', 200]]) {
    const row = point(model(records, outcomes, { metric }), 2026);
    assert.equal(row.value, value);
    assert.equal(row.sales, 50); assert.equal(row.losses, 30); assert.equal(row.demand, 200);
    assert.equal(row.salesRatio, 0.25); assert.equal(row.lossesRatio, 0.15);
  }
});

test('raw counts survive absent or zero demand while their ratios remain unknown', () => {
  const records = [demand('2026-02', 0)];
  const outcomes = [outcome('2026-01', 50), outcome('2026-01', 0, 'losses'), outcome('2026-02', 7), outcome('2026-02', 2, 'losses')];
  const result = model(records, outcomes);
  assert.equal(point(result, 2026).demand, null);
  assert.equal(point(result, 2026).sales, 50);
  assert.equal(point(result, 2026).losses, 0);
  assert.equal(point(result, 2026).value, null);
  assert.equal(point(result, 2026).lossesRatio, null);
  assert.equal(point(result, 2026, 1).demand, 0);
  assert.equal(point(result, 2026, 1).sales, 7);
  assert.equal(point(result, 2026, 1).salesRatio, null);
  assert.equal(point(result, 2026, 1).lossesRatio, null);
  assert.equal(point(model(records, outcomes, { metric: 'salesCount' }), 2026).value, 50);
  assert.equal(point(model(records, outcomes, { metric: 'lossesCount' }), 2026).value, 0);
  assert.equal(point(model(records, outcomes, { metric: 'demandCount' }), 2026, 1).value, 0);
});

test('observed zero numerators are real zero ratios, missing numerators stay null, and ratios are not capped', () => {
  const result = model([demand('2026-01', 100), demand('2026-02', 20), demand('2026-03', 100)],
    [outcome('2026-01', 0), outcome('2026-01', 0, 'losses'), outcome('2026-02', 25)]);
  assert.equal(point(result, 2026).salesRatio, 0);
  assert.equal(point(result, 2026).lossesRatio, 0);
  assert.equal(point(result, 2026, 1).salesRatio, 1.25);
  assert.equal(point(result, 2026, 1).lossesRatio, null);
  assert.equal(point(result, 2026, 2).salesRatio, null);
});

test('All demand and sales require both cities, while All losses use the independent published total', () => {
  const records = [demand('2026-01', 100), demand('2026-01', 50, 'СПБ'), demand('2026-02', 80)];
  const outcomes = [outcome('2026-01', 20), outcome('2026-01', 10, 'sales', 'СПБ'), outcome('2026-02', 8),
    outcome('2026-01', 90, 'losses'), outcome('2026-01', 75, 'losses', 'СПБ'), outcome('2026-01', 174, 'losses', 'Все')];
  const result = model(records, outcomes, { city: 'Все', metric: 'lossesRatio' });
  const january = point(result, 2026);
  assert.equal(january.demand, 150); assert.equal(january.sales, 30); assert.equal(january.losses, 174);
  assert.equal(january.value, 174 / 150);
  assert.equal(point(result, 2026, 1).demand, null);
  assert.equal(point(result, 2026, 1).sales, null);
  assert.equal(point(model(records, outcomes, { metric: 'lossesCount' }), 2026).value, 90);
  assert.equal(point(model(records, outcomes, { city: 'СПБ', metric: 'lossesCount' }), 2026).value, 75);
  assert.equal(point(model(records, outcomes.filter(row => row.city !== 'Все'), { city: 'Все', metric: 'lossesCount' }), 2026).value, null);
});

test('short city loss history leaves September missing beside an independently known All count', () => {
  const outcomes = [outcome('2026-08', 0, 'losses'), outcome('2026-09', 325, 'losses', 'Все')];
  const city = model([], outcomes, { metric: 'lossesCount' });
  assert.equal(point(city, 2026, 7).value, 0);
  assert.equal(point(city, 2026, 8).value, null);
  assert.equal(point(model([], outcomes, { city: 'Все', metric: 'lossesCount' }), 2026, 8).value, 325);
});

test('existing duplicate freshness and conflict rules are preserved for every selected year', () => {
  const records = [demand('2025-01', 100, 'МСК', '2026-10-01T00:00:00Z'), demand('2025-01', 200),
    demand('2026-01', 100), demand('2026-01', 200), demand('2026-02', 100)];
  const outcomes = [outcome('2025-01', 20), outcome('2026-01', 10), outcome('2026-01', 11), outcome('2026-02', 5), outcome('2026-02', 5)];
  const result = model(records, outcomes, { years: [2025, 2026] });
  assert.equal(point(result, 2025).demand, 200);
  assert.equal(point(result, 2025).value, 0.1);
  assert.equal(point(result, 2026).demand, null);
  assert.equal(point(result, 2026).sales, null);
  assert.equal(point(result, 2026, 1).sales, 5);
  assert.equal(point(result, 2026, 1).value, 0.05);
});

test('only completed Moscow months are exposed, including across the UTC month boundary', () => {
  const records = [demand('2026-11', 100), demand('2026-12', 200)];
  const outcomes = [outcome('2026-11', 10), outcome('2026-12', 20)];
  const before = model(records, outcomes, { now: new Date('2026-11-30T20:59:59Z') });
  assert.equal(point(before, 2026, 10).complete, false);
  assert.equal(point(before, 2026, 10).sales, null);
  assert.equal(point(before, 2026, 10).value, null);
  const after = model(records, outcomes, { now: new Date('2026-11-30T21:00:00Z') });
  assert.equal(point(after, 2026, 10).complete, true);
  assert.equal(point(after, 2026, 10).value, 0.1);
  assert.equal(point(after, 2026, 11).complete, false);
  assert.equal(point(after, 2026, 11).demand, null);
});

test('available years are a scoped real-data union independent of the selected series, excluding future years', () => {
  const records = [demand('2023-01', 100), demand('2026-01', 0), demand('2027-01', 100), demand('bad', 100), demand('2022-01', -1)];
  const outcomes = [outcome('2024-01', 4), outcome('2025-01', 0, 'losses'), outcome('2021-01', 1, 'losses', 'Все'), outcome('2020-01', 9, 'sales', 'СПБ')];
  const result = model(records, outcomes, { years: [] });
  assert.deepEqual(result.series, []);
  assert.deepEqual(result.availableYears, [2023, 2024, 2025, 2026]);
  assert.deepEqual(model(records, outcomes, { city: 'Все', years: [] }).availableYears, [2021]);
});

test('the pure model leaves frozen input records and selected years unchanged', () => {
  const records = Object.freeze([Object.freeze(demand('2026-01', 100))]);
  const outcomes = Object.freeze([Object.freeze(outcome('2026-01', 10))]);
  const years = Object.freeze([2026, 2025, 2026]);
  const result = model(records, outcomes, { years });
  assert.deepEqual(years, [2026, 2025, 2026]);
  assert.deepEqual(result.series.map(series => series.year), [2025, 2026]);
  assert.equal(point(result, 2026).value, 0.1);
});
