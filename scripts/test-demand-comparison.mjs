import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createReportModelLoader } from './helpers/report-model.mjs';

const { buildDemandComparison, pearsonCorrelation, preserveDemandOutcomeSources } = createReportModelLoader()('src/lib/demandComparison.ts');
const now = new Date('2026-11-06T10:00:00+03:00');
const demand = (month, count, city = 'МСК') => ({ month, count, city, regionId: '', share: null, updatedAt: '2026-11-01T00:00:00Z' });
const outcome = (month, count, metric = 'sales', city = 'МСК') => ({ month, count, metric, city, sourceRow: 1, sourceColumn: 'B' });
const model = (d, o, extra = {}) => buildDemandComparison(d, o, { city: 'МСК', year: 2026, mode: 'yoy', now, ...extra });

test('an 18% demand decrease gives an explicit sales scenario, keeping losses separate', () => {
  const row = model([demand('2025-01', 100), demand('2026-01', 82)], [outcome('2025-01', 50), outcome('2026-01', 45), outcome('2026-01', 12, 'losses', 'Все')]).months[0];
  assert.ok(Math.abs(row.demandYoY + 0.18) < 1e-10);
  assert.equal(row.expectedSales, 41);
  assert.equal(row.salesGap, 4);
  assert.equal(row.losses, null, 'a combined-city loss count must never be assigned to Moscow');
  assert.equal(row.sales, 45);
});

test('all-cities demand and sales require both cities, while true zero remains observed', () => {
  const result = model([demand('2026-01', 82), demand('2026-02', 0), demand('2026-02', 0, 'СПБ')], [outcome('2026-01', 40), outcome('2026-02', 0), outcome('2026-02', 0, 'sales', 'СПБ'), outcome('2026-02', 9, 'losses', 'Все')], {city: 'Все'});
  assert.equal(result.months[0].demand, null);
  assert.equal(result.months[0].sales, null);
  assert.equal(result.months[1].demand, 0);
  assert.equal(result.months[1].sales, 0);
  assert.equal(result.months[1].losses, 9);
});

test('missing or zero prior values do not invent YoY or a sales scenario', () => {
  const result = model([demand('2025-01', 0), demand('2026-01', 10)], [outcome('2025-01', 0), outcome('2026-01', 4)]);
  assert.equal(result.months[0].demandYoY, null);
  assert.equal(result.months[0].salesYoY, null);
  assert.equal(result.months[0].expectedSales, null);
  assert.equal(result.months[1].sales, null);
});

test('completed Moscow months only; the UTC month boundary cannot admit an unfinished month', () => {
  const result = model([demand('2026-10', 3), demand('2026-11', 4), demand('2026-12', 5)], [outcome('2026-10', 3), outcome('2026-11', 4)], {now: new Date('2026-10-31T22:00:00Z')});
  assert.equal(result.currentMonth, '2026-11');
  assert.equal(result.months[9].demand, 3);
  assert.equal(result.months[10].demand, null);
  assert.equal(result.months[10].complete, false);
  assert.equal(result.months[11].sales, null);
  assert.equal(result.months.length, 12);
});

test('period changes use weighted aligned totals, never the mean of monthly percentages', () => {
  const result = model([demand('2025-01', 100), demand('2026-01', 200), demand('2025-02', 900), demand('2026-02', 900), demand('2026-03', 999)], [outcome('2025-01', 10), outcome('2026-01', 20), outcome('2025-02', 90), outcome('2026-02', 90), outcome('2026-03', 999)]);
  assert.deepEqual(result.salesSummary.months, ['2026-01', '2026-02']);
  assert.equal(result.salesSummary.demandCurrent, 1100);
  assert.ok(Math.abs(result.salesSummary.demandYoY - 0.1) < 1e-10);
  assert.ok(Math.abs(result.salesSummary.outcomeYoY - 0.1) < 1e-10);
  assert.ok(Math.abs(result.salesSummary.expected - 110) < 1e-10);
});

test('available loss history is visible without fabricating prior-year values', () => {
  const result = model([demand('2026-01', 100), demand('2026-01', 50, 'СПБ')], [outcome('2026-01', 12, 'losses', 'Все')], {city: 'Все'});
  assert.equal(result.months[0].losses, 12);
  assert.equal(result.months[0].previousLosses, null);
  assert.equal(result.months[0].lossesYoY, null);
  assert.equal(result.lossesSummary.months.length, 0);
  assert.equal(result.correlations.losses.n, 0);
});

test('index mode uses one positive common baseline and gaps remain gaps', () => {
  const result = model([demand('2026-01', 20), demand('2026-02', 100), demand('2026-03', 150), demand('2026-04', 200)], [outcome('2026-02', 10), outcome('2026-03', 20), outcome('2026-04', 30)], {mode: 'index'});
  assert.equal(result.indexBaseMonth, '2026-02');
  assert.equal(result.months[0].plotDemand, null);
  assert.equal(result.months[1].plotDemand, 100);
  assert.equal(result.months[2].plotDemand, 150);
  assert.equal(result.months[2].plotSales, 200);
  assert.equal(result.months[2].plotLosses, null);
  assert.equal(result.correlations.sales.n, 3);
  assert.ok(Math.abs(result.correlations.sales.r - 1) < 1e-10);
});

test('correlation uses matching plotted months and refuses tiny or constant samples', () => {
  assert.deepEqual(pearsonCorrelation([[1, 1], [2, 3]]), {n: 2, r: null});
  assert.deepEqual(pearsonCorrelation([[1, 1], [1, 2], [1, 3]]), {n: 3, r: null});
  assert.equal(pearsonCorrelation([[1, 3], [2, 2], [3, 1]]).r, -1);
  const result = model([demand('2025-01', 100), demand('2026-01', 110), demand('2025-02', 100), demand('2026-02', 120), demand('2025-03', 100), demand('2026-03', 130)], [outcome('2025-01', 10), outcome('2026-01', 11), outcome('2025-03', 10), outcome('2026-03', 13)]);
  assert.equal(result.correlations.sales.n, 2);
  assert.equal(result.correlations.sales.r, null);
});

test('conflicting duplicate observations become unknown rather than summed or arbitrarily chosen', () => {
  const result = model([demand('2026-01', 10), demand('2026-01', 20)], [outcome('2026-01', 1), outcome('2026-01', 2), outcome('2026-02', 4), outcome('2026-02', 4)]);
  assert.equal(result.months[0].demand, null);
  assert.equal(result.months[0].sales, null);
  assert.equal(result.months[1].sales, 4);
});

const source = (key, extra = {}) => ({key, url: `https://example.com/${key}`, sheetName: key, sheetId: 1, status: 'ready', readAt: '2026-11-05T00:00:00Z', fromMonth: '2026-01', toMonth: '2026-09', warnings: [], ...extra});
const snapshot = (records, sources, status = 'ready') => ({records, sources, status, warnings: []});

test('a partial source failure after a successful GET preserves only its prior rows and provenance', () => {
  const previous = snapshot([outcome('2026-01', 45), outcome('2026-01', 12, 'losses', 'Все')], [source('sales'), source('losses')]);
  const next = snapshot([outcome('2026-01', 15, 'losses', 'Все')], [source('sales', {status: 'error', readAt: '', fromMonth: '', toMonth: '', warnings: ['No access']}), source('losses', {readAt: '2026-11-06T00:00:00Z'})], 'partial');
  const result = preserveDemandOutcomeSources(previous, next);
  assert.equal(result.records.find(row => row.metric === 'sales').count, 45);
  assert.equal(result.records.find(row => row.metric === 'losses').count, 15);
  assert.equal(result.sources.find(row => row.key === 'sales').status, 'cached');
  assert.equal(result.sources.find(row => row.key === 'sales').readAt, previous.sources[0].readAt);
  assert.equal(result.sources.find(row => row.key === 'sales').fromMonth, '2026-01');
  assert.equal(result.sources.find(row => row.key === 'losses').status, 'ready');
  assert.equal(result.sources.find(row => row.key === 'losses').readAt, '2026-11-06T00:00:00Z');
  assert.equal(result.status, 'partial');
  assert.ok(result.sources[0].warnings.some(warning => warning.includes('No access')));
  assert.ok(result.warnings.some(warning => warning.includes('последняя успешная')));
  assert.equal(previous.records.find(row => row.metric === 'losses').count, 12, 'do not mutate the previous snapshot');
  assert.equal(next.records.length, 1, 'do not mutate the failed response');
});

test('full source failure keeps both successful histories as cached and never calls the result ready', () => {
  const previous = snapshot([outcome('2026-01', 45), outcome('2026-01', 12, 'losses', 'Все')], [source('sales'), source('losses')]);
  const failed = snapshot([], [source('sales', {status: 'error'}), source('losses', {status: 'error'})], 'error');
  const result = preserveDemandOutcomeSources(previous, failed);
  assert.equal(result.records.length, 2);
  assert.deepEqual(result.sources.map(item => item.status), ['cached', 'cached']);
  assert.equal(result.status, 'partial');
  assert.equal(result.warnings.length, 2);
  assert.deepEqual(preserveDemandOutcomeSources(null, failed), failed, 'a first failed read invents no cache');
});

test('an older server cache cannot replace a newer successful public read', () => {
  const previous = snapshot([outcome('2026-01', 45), outcome('2026-01', 12, 'losses', 'Все')], [source('sales', {readAt: '2026-11-06T00:00:00Z'}), source('losses')]);
  const next = snapshot([outcome('2026-01', 40), outcome('2026-01', 15, 'losses', 'Все')], [source('sales', {status: 'cached', readAt: '2026-11-01T00:00:00Z', warnings: ['Source failed; server cache returned']}), source('losses', {readAt: '2026-11-07T00:00:00Z'})], 'partial');
  const result = preserveDemandOutcomeSources(previous, next);
  assert.equal(result.records.find(row => row.metric === 'sales').count, 45);
  assert.equal(result.sources[0].readAt, '2026-11-06T00:00:00Z');
  assert.equal(result.sources[0].status, 'cached');
  assert.ok(result.sources[0].warnings.includes('Source failed; server cache returned'));
  assert.ok(result.warnings.some(warning => warning.includes('более свежая')));
  assert.equal(result.records.find(row => row.metric === 'losses').count, 15);
  assert.equal(result.sources[1].status, 'ready');
  assert.equal(result.status, 'partial');
  const readyNext = {...next, sources: next.sources.map(item => ({...item, status: 'ready'})), status: 'ready'};
  assert.equal(preserveDemandOutcomeSources(previous, readyNext).records.find(row => row.metric === 'sales').count, 40, 'a fresh successful response is authoritative regardless of timestamp');
});
