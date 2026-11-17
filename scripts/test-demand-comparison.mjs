import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createReportModelLoader } from './helpers/report-model.mjs';

const { buildDemandComparison, buildDemandComparisonAnnualSummary, pearsonCorrelation, preserveDemandOutcomeSources } = createReportModelLoader()('src/lib/demandComparison.ts');
const now = new Date('2026-11-06T10:00:00+03:00');
const demand = (month, count, city = 'МСК') => ({ month, count, city, regionId: '', share: null, updatedAt: '2026-11-01T00:00:00Z' });
const outcome = (month, count, metric = 'sales', city = 'МСК') => ({ month, count, metric, city, sourceRow: 1, sourceColumn: 'B' });
const model = (d, o, extra = {}) => buildDemandComparison(d, o, { city: 'МСК', year: 2026, mode: 'yoy', now, ...extra });

test('SPB exam groups preserve sparse months and cannot become an all-city or Moscow total', () => {
  const groups = [outcome('2025-06', 270, 'examGroups', 'СПБ'), outcome('2026-06', 262, 'examGroups', 'СПБ'),
    outcome('2026-08', 0, 'examGroups', 'СПБ'), outcome('2026-10', 339, 'examGroups', 'СПБ'), outcome('2026-11', 145, 'examGroups', 'СПБ')];
  const result = model([], groups, { city: 'СПБ' });
  assert.equal(result.months[5].examGroups, 262);
  assert.equal(result.months[5].previousExamGroups, 270);
  assert.ok(Math.abs(result.months[5].examGroupsYoY - (262 / 270 - 1)) < 1e-12);
  assert.equal(result.months[6].examGroups, null);
  assert.equal(result.months[7].examGroups, 0);
  assert.equal(result.months[9].examGroups, 339);
  assert.equal(result.months[10].examGroups, null, 'unfinished November is excluded');
  const annual = buildDemandComparisonAnnualSummary(result.months);
  assert.equal(annual.examGroups.months, 3);
  assert.equal(annual.examGroups.average, 601 / 3);
  assert.equal(annual.examGroupsYoY.months, 1);
  for (const city of ['Все', 'МСК']) assert.ok(model([], groups, { city }).months.every(row => row.examGroups === null));
});

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

test('city loss observations remain isolated and the explicit all-city summary is authoritative', () => {
  const records = [outcome('2026-01', 90, 'losses', 'МСК'), outcome('2026-01', 75, 'losses', 'СПБ'), outcome('2026-01', 174, 'losses', 'Все')];
  assert.equal(model([], records).months[0].losses, 90);
  assert.equal(model([], records, {city: 'СПБ'}).months[0].losses, 75);
  assert.equal(model([], records, {city: 'Все'}).months[0].losses, 174, 'do not replace the source total with the city sum of 165');
  assert.equal(model([], records.filter(row => row.city !== 'Все'), {city: 'Все'}).months[0].losses, null, 'city rows cannot invent a missing all-city observation');
  assert.equal(model([], records.filter(row => row.city !== 'МСК')).months[0].losses, null, 'do not infer a missing city by subtracting from All');
});

test('shorter city history preserves an unknown September beside a known all-city September', () => {
  const records = [outcome('2025-11', 52, 'losses', 'МСК'), outcome('2026-08', 0, 'losses', 'МСК'), outcome('2026-09', 31, 'losses', 'Все')];
  const moscow = model([], records);
  assert.equal(moscow.months[7].losses, 0, 'the observed zero extends city coverage');
  assert.equal(moscow.months[8].losses, null);
  assert.deepEqual(moscow.lossCoverage.selected, {months: ['2025-11', '2026-08'], fromMonth: '2025-11', toMonth: '2026-08'});
  assert.equal(moscow.lossCoverage.all.toMonth, '2026-09');
  assert.equal(model([], records, {city: 'Все'}).months[8].losses, 31);
  const legacy = model([], records.filter(row => row.city === 'Все'));
  assert.deepEqual(legacy.lossCoverage.selected, {months: [], fromMonth: '', toMonth: ''}, 'legacy All-only snapshots expose no city coverage');
});

test('city index correlation uses only its eight available months, while All can use nine', () => {
  const demands = [];
  const records = [];
  for (let index = 1; index <= 9; index += 1) {
    const month = `2026-${String(index).padStart(2, '0')}`;
    demands.push(demand(month, 100 + index * 10), demand(month, 50 + index * 5, 'СПБ'));
    records.push(outcome(month, 200 + index * 20, 'losses', 'Все'));
    if (index <= 8) records.push(outcome(month, 100 + index * 10, 'losses', 'МСК'), outcome(month, 50 + index * 5, 'losses', 'СПБ'));
  }
  const moscow = model(demands, records, {mode: 'index'});
  assert.equal(moscow.correlations.losses.n, 8);
  assert.ok(Math.abs(moscow.correlations.losses.r - 1) < 1e-10);
  assert.equal(moscow.months[8].plotLosses, null);
  assert.equal(moscow.months[8].plotDemand, 190 / 110 * 100);
  assert.equal(model(demands, records, {city: 'Все', mode: 'index'}).correlations.losses.n, 9);
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

const annualMonth = extra => ({...model([], []).months[0], ...extra});
const annualCountKeys = ['previousDemand', 'demand', 'previousSales', 'sales', 'previousLosses', 'losses', 'expectedSales', 'salesGap'];

test('annual totals and averages count observed zero and skip missing values independently', () => {
  const result = buildDemandComparisonAnnualSummary([
    annualMonth({previousDemand: 10, demand: 0, previousSales: 3, sales: 0, losses: 0, expectedSales: 0, salesGap: 0}),
    annualMonth({demand: 11, sales: 2}),
    annualMonth({previousDemand: 5, previousSales: 2, previousLosses: 0, expectedSales: 1.5, salesGap: -1.5}),
  ]);
  assert.deepEqual(result.previousDemand, {total: 15, average: 7.5, months: 2});
  assert.deepEqual(result.demand, {total: 11, average: 5.5, months: 2});
  assert.deepEqual(result.sales, {total: 2, average: 1, months: 2});
  assert.deepEqual(result.previousLosses, {total: 0, average: 0, months: 1});
  assert.deepEqual(result.losses, {total: 0, average: 0, months: 1});
  assert.deepEqual(result.expectedSales, {total: 1.5, average: 0.75, months: 2});
  assert.deepEqual(result.salesGap, {total: -1.5, average: -0.75, months: 2});
});

test('annual summaries use each series coverage but compare growth only on matching months', () => {
  const result = buildDemandComparisonAnnualSummary([
    annualMonth({previousDemand: 100, demand: 200, previousSales: 10, sales: 20, losses: 5}),
    annualMonth({previousDemand: 900, demand: 900, previousSales: 90, sales: 90, previousLosses: 5, losses: 15}),
    annualMonth({demand: 500, previousSales: 1, previousLosses: 15, losses: 25}),
    annualMonth({previousDemand: 300, sales: 7}),
  ]);
  assert.deepEqual(result.demand, {total: 1600, average: 1600 / 3, months: 3});
  assert.deepEqual(result.previousDemand, {total: 1300, average: 1300 / 3, months: 3});
  assert.deepEqual(result.sales, {total: 117, average: 39, months: 3});
  assert.equal(result.demandYoY.months, 2);
  assert.ok(Math.abs(result.demandYoY.value - 0.1) < 1e-10, 'growth is weighted by prior totals, never an average of monthly percentages');
  assert.equal(result.salesYoY.months, 2);
  assert.ok(Math.abs(result.salesYoY.value - 0.1) < 1e-10);
  assert.deepEqual(result.lossesYoY, {value: 1, months: 2});
});

test('unfinished months cannot contribute even when they contain numeric values', () => {
  const excluded = Object.fromEntries(annualCountKeys.map(key => [key, 999]));
  const result = buildDemandComparisonAnnualSummary([
    annualMonth({demand: 10, previousDemand: 20, sales: 2, previousSales: 4}),
    annualMonth({...excluded, complete: false}),
  ]);
  assert.deepEqual(result.demand, {total: 10, average: 10, months: 1});
  assert.deepEqual(result.sales, {total: 2, average: 2, months: 1});
  assert.deepEqual(result.losses, {total: null, average: null, months: 0});
  assert.deepEqual(result.demandYoY, {value: -0.5, months: 1});
});

test('annual growth preserves matched zero months but refuses a zero previous total', () => {
  const result = buildDemandComparisonAnnualSummary([
    annualMonth({previousDemand: 0, demand: 3, previousSales: 0, sales: 0, previousLosses: 0, losses: 2}),
    annualMonth({previousDemand: 0, demand: 0, previousSales: 0, sales: 4}),
  ]);
  assert.deepEqual(result.demandYoY, {value: null, months: 2});
  assert.deepEqual(result.salesYoY, {value: null, months: 2});
  assert.deepEqual(result.lossesYoY, {value: null, months: 1});
});

test('annual model and gap are sums of the displayed monthly scenarios', () => {
  const result = model(
    [demand('2025-01', 100), demand('2026-01', 200), demand('2025-02', 900), demand('2026-02', 900)],
    [outcome('2025-01', 20), outcome('2026-01', 45), outcome('2025-02', 90), outcome('2026-02', 80)],
  );
  const annual = buildDemandComparisonAnnualSummary(result.months);
  assert.deepEqual(annual.expectedSales, {total: 130, average: 65, months: 2});
  assert.deepEqual(annual.salesGap, {total: -5, average: -2.5, months: 2});
  assert.notEqual(annual.expectedSales.total, result.salesSummary.expected, 'the footer sums monthly models instead of reapplying a yearly demand ratio');
});

test('a complete twelve-month year has twelve observations and an unrounded monthly average', () => {
  const months = Array.from({length: 12}, (_, index) => annualMonth({
    ...Object.fromEntries(annualCountKeys.map(key => [key, index + 1])),
    month: `2024-${String(index + 1).padStart(2, '0')}`,
  }));
  const result = buildDemandComparisonAnnualSummary(months);
  for (const key of annualCountKeys) assert.deepEqual(result[key], {total: 78, average: 6.5, months: 12});
  for (const key of ['demandYoY', 'salesYoY', 'lossesYoY']) assert.deepEqual(result[key], {value: 0, months: 12});
});

test('an empty year stays unknown rather than manufacturing zero totals or averages', () => {
  for (const rows of [[], [annualMonth({})], [annualMonth({demand: 20, complete: false})]]) {
    const result = buildDemandComparisonAnnualSummary(rows);
    for (const key of annualCountKeys) assert.deepEqual(result[key], {total: null, average: null, months: 0});
    for (const key of ['demandYoY', 'salesYoY', 'lossesYoY']) assert.deepEqual(result[key], {value: null, months: 0});
  }
});

test('annual aggregates reject invalid counts and nonfinite values while allowing signed gaps', () => {
  const result = buildDemandComparisonAnnualSummary([
    annualMonth({previousDemand: -1, demand: Number.NaN, previousSales: Infinity, sales: -1, previousLosses: -1, losses: -Infinity, expectedSales: -1, salesGap: -5}),
    annualMonth({previousDemand: 3, demand: 6, previousSales: 2, sales: 4, previousLosses: 1, losses: 0, expectedSales: 1.5, salesGap: Infinity}),
  ]);
  assert.deepEqual(result.previousDemand, {total: 3, average: 3, months: 1});
  assert.deepEqual(result.sales, {total: 4, average: 4, months: 1});
  assert.deepEqual(result.expectedSales, {total: 1.5, average: 1.5, months: 1});
  assert.deepEqual(result.salesGap, {total: -5, average: -5, months: 1});
  assert.deepEqual(result.demandYoY, {value: 1, months: 1});
  assert.deepEqual(result.salesYoY, {value: 1, months: 1});
  assert.deepEqual(result.lossesYoY, {value: -1, months: 1});
});

const source = (key, extra = {}) => ({key, url: `https://example.com/${key}`, sheetName: key, sheetId: 1, status: 'ready', readAt: '2026-11-05T00:00:00Z', fromMonth: '2026-01', toMonth: '2026-09', warnings: [], ...extra});
const snapshot = (records, sources, status = 'ready') => ({records, sources, status, warnings: []});

test('loss source fallback retains all city and All rows together with breakdown provenance', () => {
  const breakdown = {url: 'https://example.com/city-losses', sheetName: 'Распределение потока', sheetId: 105, fromMonth: '2025-11', toMonth: '2026-08'};
  const priorLossRows = [outcome('2026-01', 174, 'losses', 'Все'), outcome('2026-01', 90, 'losses', 'МСК'), outcome('2026-01', 75, 'losses', 'СПБ')];
  const previous = snapshot([outcome('2026-01', 45), ...priorLossRows], [source('sales'), source('losses', {breakdown})]);
  const failed = snapshot([outcome('2026-01', 46)], [source('sales'), source('losses', {status: 'error', breakdown: undefined})], 'partial');
  const retained = preserveDemandOutcomeSources(previous, failed);
  assert.deepEqual(retained.records.filter(row => row.metric === 'losses'), priorLossRows);
  assert.deepEqual(retained.sources.find(row => row.key === 'losses').breakdown, breakdown);
  assert.equal(retained.records.find(row => row.metric === 'sales').count, 46, 'a loss failure cannot freeze fresh sales');
  assert.equal(retained.sources.find(row => row.key === 'losses').status, 'cached');
  const fresh = snapshot([outcome('2026-01', 47), outcome('2026-01', 180, 'losses', 'Все'), outcome('2026-01', 92, 'losses', 'МСК')], [source('sales'), source('losses', {breakdown})]);
  assert.deepEqual(preserveDemandOutcomeSources(previous, fresh).records, fresh.records, 'successful source replacement must not resurrect a removed city observation');
});

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
