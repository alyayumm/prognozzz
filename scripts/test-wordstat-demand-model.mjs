import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/wordstatDemand.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const { MONTH_LABELS, buildDemandYearSeries } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

// Synthetic test fixtures only; these are not Wordstat statistics.
const record = (month, count, city = 'МСК', updatedAt = '2026-10-26T09:00:00Z') => ({
  month, count, city, updatedAt,
  regionId: city === 'МСК' ? '213' : '2',
  share: null,
});

test('calendar stays January through December with a fixed slot for each month', () => {
  assert.deepEqual(MONTH_LABELS, ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек']);
  assert.deepEqual(buildDemandYearSeries([record('2025-12', 12), record('2025-01', 1)], 'МСК'), [
    { year: 2025, values: [1, null, null, null, null, null, null, null, null, null, null, 12] },
  ]);
});

test('years ascend while real zero remains distinct from missing data', () => {
  const actual = buildDemandYearSeries([record('2026-03', 30), record('2024-02', 0)], 'МСК');
  assert.deepEqual(actual.map(({ year }) => year), [2024, 2026]);
  assert.equal(actual[0].values.length, 12);
  assert.equal(actual[0].values[0], null);
  assert.equal(actual[0].values[1], 0);
  assert.equal(actual[1].values[2], 30);
});

test('city series exclude other cities and do not create empty years from them', () => {
  const records = [record('2024-01', 11), record('2025-01', 22, 'СПБ'), record('2024-01', 33, 'СПБ')];
  assert.deepEqual(buildDemandYearSeries(records, 'МСК').map(({ year, values }) => [year, values[0]]), [[2024, 11]]);
  assert.deepEqual(buildDemandYearSeries(records, 'СПБ').map(({ year, values }) => [year, values[0]]), [[2024, 33], [2025, 22]]);
  assert.deepEqual(buildDemandYearSeries([], 'МСК'), []);
});

test('duplicate months choose the latest valid timestamp rather than arrival order', () => {
  const records = [
    record('2026-01', 30, 'МСК', '2026-10-26T12:00:00+03:00'),
    record('2026-01', 20, 'МСК', '2026-10-26T08:30:00Z'),
    record('2026-01', 90, 'МСК', 'not-a-date'),
    record('2026-01', 80, 'МСК', ''),
  ];
  assert.equal(buildDemandYearSeries(records, 'МСК')[0].values[0], 30);
  assert.deepEqual(buildDemandYearSeries(records, 'МСК'), buildDemandYearSeries([...records].reverse(), 'МСК'));
});

test('conflicting counts with equal or invalid timestamps leave a gap deterministically', () => {
  for (const updatedAt of ['2026-10-26T09:00:00Z', 'invalid']) {
    const records = [record('2026-01', 10, 'МСК', updatedAt), record('2026-01', 20, 'МСК', updatedAt), record('2026-01', 20, 'МСК', updatedAt)];
    assert.equal(buildDemandYearSeries(records, 'МСК')[0].values[0], null);
    assert.deepEqual(buildDemandYearSeries(records, 'МСК'), buildDemandYearSeries([...records].reverse(), 'МСК'));
  }
});

test('identical duplicate counts merge and a newer observation resolves an older conflict', () => {
  const earlier = '2026-10-25T09:00:00Z';
  assert.equal(buildDemandYearSeries([record('2026-01', 0), record('2026-01', 0)], 'МСК')[0].values[0], 0);
  const records = [record('2026-01', 10, 'МСК', earlier), record('2026-01', 20, 'МСК', earlier), record('2026-01', 15)];
  assert.equal(buildDemandYearSeries(records, 'МСК')[0].values[0], 15);
  assert.deepEqual(buildDemandYearSeries(records, 'МСК'), buildDemandYearSeries([...records].reverse(), 'МСК'));
});

test('invalid months and nonnegative unsafe or nonnumeric counts never enter the chart', () => {
  const records = [
    ...['2026-00', '2026-13', '2026-1', '26-01', '2026-01-01', ' 2026-01', '2026-01 ', '0000-01', null]
      .map((month) => record(month, 5)),
    ...[-1, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, '15', null, undefined]
      .map((count) => record('2025-01', count)),
    record('2026-01', 7),
    record('2026-01', NaN, 'МСК', '2026-10-27T09:00:00Z'),
  ];
  assert.deepEqual(buildDemandYearSeries(records, 'МСК').map(({ year, values }) => [year, values[0]]), [[2026, 7]]);
});

test('the pure model retains supplied future years and never mutates input records', () => {
  const records = Object.freeze([Object.freeze(record('2099-11', 11)), Object.freeze(record('2024-02', 2))]);
  const actual = buildDemandYearSeries(records, 'МСК');
  assert.deepEqual(actual.map(({ year }) => year), [2024, 2099]);
  assert.equal(actual[1].values[10], 11);
  assert.equal(records[0].month, '2099-11');
});
