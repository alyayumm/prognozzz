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
const testedFunctions = ['recordToMetricTotal', 'buildMonthEndForecast', 'forecastMetricByFactAverage', 'getLastFactDate', 'getTodayIso', 'sumNullable', 'buildMetricDailyChartData', 'prepareDailyValuesForRemote'];
const functionSource = appFile.statements
  .filter((statement) => ts.isFunctionDeclaration(statement) && testedFunctions.includes(statement.name?.text))
  .map((statement) => statement.getText(appFile)).join('\n');
const appJs = ts.transpileModule(`${functionSource}\nexports.forecast = forecastMetricByFactAverage; exports.monthForecast = buildMonthEndForecast; exports.today = getTodayIso; exports.chart = buildMetricDailyChartData; exports.prepare = prepareDailyValuesForRemote;`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const app = {};
runInNewContext(appJs, {
  exports: app, ...psExports, ...metricsExports,
  adminCities: ['МСК', 'СПБ', 'сообщения'],
  metrics: ['Лиды', 'Квалы', 'Продажи'],
  total: (rows, key) => rows.reduce((sum, row) => sum + (row[key] ?? 0), 0),
  percent: (value, plan) => plan ? value / plan * 100 : 0,
  coefficientForCityMetric: (city, metric, date, coefficients) => coefficients[city]?.[date] ?? 1,
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
  const result = app.forecast(rows, 'Продажи', ['2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27'], false, {}, 'op', '2026-10-26');
  assert.equal(result.fact, 10);
  assert.equal(result.baseDaily, 5);
  assert.equal(result.projected, 20);
});

test('today stays visible in facts but cannot lower or inflate the month projection', () => {
  const dates = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'];
  for (const metric of ['Лиды', 'Квалы', 'Продажи']) {
    for (const partialToday of [0, 1, 100]) {
      const rows = [10, 10, partialToday, 0].map((fact, index) => ({
        ...record(dates[index], fact, 'МСК', '[SALES_SOURCE=PS] [PS_COVERED_TO=2026-11-03]'), metric,
      }));
      const result = app.forecast(rows, metric, dates, false, {}, 'op', '2026-11-03');
      assert.equal(result.fact, 20 + partialToday);
      assert.equal(result.baseDaily, 10);
      assert.equal(result.projected, 40);
    }
  }
});

test('forecast coefficients use completed observations separately for both cities and OP/marketing', () => {
  const dates = ['2026-11-01', '2026-11-02', '2026-11-03'];
  const rows = [
    { ...record(dates[0], 20, 'МСК', ''), metric: 'Квалы', omQualified: 10 },
    { ...record(dates[1], 1, 'МСК', ''), metric: 'Квалы', omQualified: 1 },
    { ...record(dates[0], 5, 'СПБ', ''), metric: 'Квалы', omQualified: 5 },
    { ...record(dates[1], 1, 'СПБ', ''), metric: 'Квалы', omQualified: 1 },
  ];
  const coefficients = { 'МСК': { [dates[0]]: 2, [dates[1]]: 1, [dates[2]]: 1 } };
  assert.equal(app.forecast(rows, 'Квалы', dates, false, coefficients, 'op', dates[1]).projected, 55);
  assert.equal(app.forecast(rows, 'Квалы', dates, false, coefficients, 'marketing', dates[1]).projected, 90);
});

test('first-day partial facts retain the monthly plan until a completed observation exists', () => {
  const dates = ['2026-11-01', '2026-11-02'];
  const rows = [{ ...record(dates[0], 1, 'МСК', '[SALES_SOURCE=PS] [PS_COVERED_TO=2026-11-01]'), plan: 0 }];
  const result = app.monthForecast(rows, dates, false, {}, dates[0], { 'Лиды': 0, 'Квалы': 0, 'Продажи': 100 });
  assert.equal(result.metrics['Продажи'].fact, 1);
  assert.equal(result.metrics['Продажи'].projected, 100);
  assert.equal(result.lastFactDate, null);
  assert.equal(result.remainingDatesCount, 2);
});

test('a covered completed zero is a real baseline; today and pending days stay in the projection', () => {
  const dates = ['2026-10-25', '2026-10-26', '2026-10-27'];
  const result = app.monthForecast([record(dates[0], 0), record(dates[1], 1)], dates, false, {}, dates[1], { 'Лиды': 0, 'Квалы': 0, 'Продажи': 100 });
  assert.equal(result.metrics['Продажи'].fact, 0);
  assert.equal(result.metrics['Продажи'].projected, 0);
  assert.equal(result.lastFactDate, dates[0]);
  assert.equal(result.remainingDatesCount, 2);
});

test('at the next Moscow day the previous day joins the baseline, and closed months keep all facts', () => {
  const dates = ['2026-11-01', '2026-11-02', '2026-11-03'];
  const rows = [10, 20, 1].map((fact, index) => record(dates[index], fact, 'МСК', '[SALES_SOURCE=PS] [PS_COVERED_TO=2026-11-03]'));
  assert.equal(app.forecast(rows, 'Продажи', dates, false, {}, 'op', dates[1]).projected, 30);
  assert.equal(app.forecast(rows, 'Продажи', dates, false, {}, 'op', dates[2]).projected, 45);
  const closed = app.forecast(rows, 'Продажи', dates, true, {}, 'op', dates[2]);
  assert.equal(closed.fact, 31);
  assert.equal(closed.projected, 31);
});

test('report date changes at Moscow midnight regardless of the viewer timezone', () => {
  assert.equal(app.today(new Date('2026-11-04T20:59:59Z')), '2026-11-04');
  assert.equal(app.today(new Date('2026-11-04T21:00:00Z')), '2026-11-05');
  assert.equal(app.today(new Date('2026-12-31T21:00:00Z')), '2027-01-01');
});

test('daily sales curve shows zero for a covered day and a gap for the next unavailable day', () => {
  const chart = app.chart({ metric: 'sales', sourceMetric: 'Продажи', title: 'Продажи' }, [
    record('2026-10-25', 0), record('2026-10-25', 0, 'СПБ'),
    record('2026-10-26', 3), record('2026-10-26', 0, 'СПБ'),
  ], [], ['2026-10-25', '2026-10-26'], '2026-10-26', 'op');
  assert.equal(chart.points[0].fact, 0);
  assert.equal(chart.points[1].fact, null);
});
