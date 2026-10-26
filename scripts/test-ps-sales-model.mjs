import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/psSales.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const psExports = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const { hasActualRecord, isPendingPsSale, psSalesFactAvailable, getPsSalesCoverage } = psExports;

const record = (date, fact, city = 'МСК', comment = '[SALES_SOURCE=PS] [PS_COVERED_TO=2026-10-25]') => ({
  date, city, metric: 'Продажи', channel: 'Город', fact, recommendations: 0, omQualified: 0, comment,
});

test('covered PS zero is an imported actual day while pending or out-of-coverage PS rows are unavailable', () => {
  assert.equal(hasActualRecord(record('2026-10-25', 0)), true);
  assert.equal(hasActualRecord(record('2026-10-26', 0, 'МСК', '[SALES_SOURCE=PS] [PS_COVERED_TO=2026-10-25] [PS_PENDING=1]')), false);
  assert.equal(hasActualRecord(record('2026-10-26', 50)), false);
  assert.equal(isPendingPsSale(record('2026-10-25', 50, 'МСК', '[SALES_SOURCE=PS] [PS_COVERED_TO=2026-10-25] [PS_PENDING=1]')), true);
});

test('daily sales require all selected PS city records to be covered; real zero remains available', () => {
  assert.equal(psSalesFactAvailable([record('2026-10-25', 0), record('2026-10-25', 0, 'СПБ')]), true);
  assert.equal(psSalesFactAvailable([record('2026-10-26', 3), record('2026-10-26', 0, 'СПБ')]), false);
  assert.equal(psSalesFactAvailable([]), true);
});

test('coverage uses the shorter city coverage and exposes the PS history span', () => {
  const rows = [
    record('2026-09-01', 0, 'МСК', ''),
    record('2026-10-01', 10),
    record('2026-10-26', 0),
    record('2026-10-01', 20, 'СПБ', '[SALES_SOURCE=PS] [PS_COVERED_TO=2026-10-24]'),
  ];
  assert.deepEqual(getPsSalesCoverage(rows), { fromDate: '2026-10-01', toDate: '2026-10-24' });
  assert.deepEqual(getPsSalesCoverage(rows.filter((row) => row.city === 'МСК')), { fromDate: '2026-10-01', toDate: '2026-10-25' });
});

test('PS-looking comments do not change source/brand, messages, or non-sale actual semantics', () => {
  for (const change of [{ city: 'источники' }, { city: 'сообщения' }, { metric: 'Квалы' }, { channel: 'SEO' }]) {
    const row = { ...record('2026-10-26', 4, 'МСК', '[SALES_SOURCE=PS] [PS_COVERED_TO=2026-10-25] [PS_PENDING=1]'), ...change };
    assert.equal(isPendingPsSale(row), false);
    assert.equal(hasActualRecord(row), true);
    assert.equal(getPsSalesCoverage([row]), null);
  }
  assert.equal(hasActualRecord(record('2026-10-25', 0, 'МСК', '')), false);
});

test('malformed coverage cannot claim an imported zero or an impossible date', () => {
  for (const date of ['2026-02-31', '2026-13-01', '2026-10-5']) {
    const row = record('2026-10-25', 0, 'МСК', `[SALES_SOURCE=PS] [PS_COVERED_TO=${date}]`);
    assert.equal(hasActualRecord(row), false);
    assert.equal(getPsSalesCoverage([row]), null);
  }
});

const metricsSource = readFileSync(new URL('../src/lib/metrics.ts', import.meta.url), 'utf8');
const metricsJs = ts.transpileModule(metricsSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const metricsExports = {};
runInNewContext(metricsJs, { exports: metricsExports, require: (name) => name === './psSales' ? psExports : {} });

test('all PS orders remain in sales even when legacy recommendation counts are retained', () => {
  assert.equal(metricsExports.netFact({ ...record('2026-10-25', 10), recommendations: 3 }), 10);
  assert.equal(metricsExports.netFact({ ...record('2026-10-25', 10, 'МСК', ''), recommendations: 3 }), 7);
});
const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const appFile = ts.createSourceFile('App.tsx', appSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const testedFunctions = ['recordToMetricTotal', 'forecastMetricByFactAverage', 'sumNullable', 'buildMetricDailyChartData', 'prepareDailyValuesForRemote'];
const functionSource = appFile.statements
  .filter((statement) => ts.isFunctionDeclaration(statement) && testedFunctions.includes(statement.name?.text))
  .map((statement) => statement.getText(appFile)).join('\n');
const appJs = ts.transpileModule(`${functionSource}\nexports.forecast = forecastMetricByFactAverage; exports.chart = buildMetricDailyChartData; exports.prepare = prepareDailyValuesForRemote;`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const app = {};
runInNewContext(appJs, {
  exports: app, ...psExports, ...metricsExports,
  adminCities: ['МСК', 'СПБ', 'сообщения'],
  coefficientForCityMetric: () => 1,
  findDailyRecord: rows => rows[0],
  encodeOmQualifiedInComment: comment => comment,
});

test('an intentional manual sales fact clears PS pending while plan-only edits retain source coverage', () => {
  const current = record('2026-10-26', 0);
  const [manual] = app.prepare([{ date: current.date, city: current.city, metric: current.metric, channel: current.channel, fact: 5 }], [current]);
  assert.equal(isPendingPsSale({ ...current, ...manual }), false);
  assert.ok(!manual.comment.includes('SALES_SOURCE=PS'));
  const [planOnly] = app.prepare([{ date: current.date, city: current.city, metric: current.metric, channel: current.channel, plan: 10 }], [current]);
  assert.ok(planOnly.comment.includes('SALES_SOURCE=PS'));
});

test('sales projection includes the covered zero day but excludes unavailable days from the daily average', () => {
  const rows = [record('2026-10-24', 10), record('2026-10-25', 0), record('2026-10-26', 0)];
  const result = app.forecast(rows, 'Продажи', ['2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27'], false, {}, 'op');
  assert.equal(result.fact, 10);
  assert.equal(result.baseDaily, 5);
  assert.equal(result.projected, 20);
});

test('daily sales curve shows zero for a covered day and a gap for the next unavailable day', () => {
  const chart = app.chart({ metric: 'sales', sourceMetric: 'Продажи', title: 'Продажи' }, [
    record('2026-10-25', 0), record('2026-10-25', 0, 'СПБ'),
    record('2026-10-26', 3), record('2026-10-26', 0, 'СПБ'),
  ], [], ['2026-10-25', '2026-10-26'], '2026-10-26', 'op');
  assert.equal(chart.points[0].fact, 0);
  assert.equal(chart.points[1].fact, null);
});
