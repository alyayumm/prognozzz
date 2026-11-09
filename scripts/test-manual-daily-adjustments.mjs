import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';
import { createReportModelLoader } from './helpers/report-model.mjs';

const root = new URL('../', import.meta.url);
const main = readFileSync(new URL('apps-script/AppsScript.gs', root), 'utf8');
const traffic = readFileSync(new URL('apps-script/AmoTrafficSales.gs', root), 'utf8');
const appSource = readFileSync(new URL('src/App.tsx', root), 'utf8');
const appTree = ts.createSourceFile('App.tsx', appSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const load = createReportModelLoader();
const metrics = load('src/lib/metrics.ts');
const report = load('src/utils/report.ts');
const ps = load('src/lib/psSales.ts');
const plain = value => JSON.parse(JSON.stringify(value));
const date = '2026-11-07';
const manualChannel = 'Ручная корректировка';
const metricNames = ['Лиды', 'Квалы', 'Продажи'];
const row = (city, metric = 'Квалы', extra = {}) => ({
  id: `${date}-${city}-${metric}`, date, city, metric, channel: 'Город',
  plan: 20, fact: 10, forecast: 22, recommendations: 0, omQualified: 0,
  comment: 'amoCRM', ...extra,
});
const manual = (city, extra = {}) => row(city, 'Квалы', {
  id: `${date}-${city}-${manualChannel}-Квалы`, channel: manualChannel,
  fact: 2, plan: 0, forecast: 0, omQualified: 0, comment: 'Подтверждённая ручная корректировка', ...extra,
});

function backend(existing = [], cache = []) {
  let saved = plain(existing);
  let headers;
  const saveRows = rows => {
    const byId = new Map(saved.map(item => [item.id, item]));
    for (const item of plain(rows)) byId.set(item.id, item);
    saved = [...byId.values()];
    return { updated: rows.length };
  };
  const fromCells = cells => Object.fromEntries(headers.map((key, index) => [key, cells[index]]));
  const sheet = {
    getRange: number => ({ setValues: values => { saved[number - 2] = fromCells(values[0]); } }),
    appendRow: values => { saved.push(fromCells(values)); },
    getLastRow: () => saved.length + 1,
  };
  const api = runInNewContext(`${main}\n${traffic}
    readObjects_ = () => readSaved();
    readAmoCrmRawLeadObjectsFast_ = () => cache;
    getWeeklyReportSpreadsheet_ = () => ({ getSheetByName: () => sheet });
    upsertRowsById_ = (name, columns, rows) => saveRows(rows);
    rebuildWeeklySummary_ = () => {};
    captureHeaders(HEADERS.Data_Daily);
    ({ id: dailyRecordId_, find: findDailyRecord_, normalize: normalizeDailyUpdate_,
       upsert: upsertDailyValues_, sync: syncAmoCrmMainReportFacts_,
       snapshot: readMainAmoTrafficSalesSnapshot_, write: syncMainAmoTrafficSales_ });`, {
    cache, sheet, readSaved: () => saved, saveRows, captureHeaders: value => { headers = plain(value); },
    Session: { getScriptTimeZone: () => 'Europe/Moscow' },
    Utilities: { formatDate: value => value.toISOString().slice(0, 10) },
  });
  return { api, saved: () => saved };
}

function frontend() {
  const names = ['findDailyRecord', 'dailyRecordKey', 'dailyRecordLookupKey', 'dailyValueLookupKey',
    'applyDailyValuesToRecords', 'mergeDailyRecord', 'prepareDailyValuesForRemote',
    'isSourceMetaRecord', 'isSourceValueRecord', 'isRoistatDirectOverlayRecord',
    'getSourceRecordCityScope', 'sourceCityFromCode',
    'forecastMetricByFactAverage', 'recordToMetricTotal', 'buildMonthEndForecast', 'getLastFactDate'];
  const code = names.map(name => {
    const node = appTree.statements.find(item => ts.isFunctionDeclaration(item) && item.name?.text === name);
    assert.ok(node, `Production function ${name} exists`);
    return node.getText(appTree);
  }).join('\n');
  const exports = {};
  runInNewContext(ts.transpileModule(`${code}\nObject.assign(exports, {${names.join(',')}});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, {
    exports, ...metrics, ...ps,
    sourceRecordCity: 'источники', sourceMetaChannelPrefix: '__source_meta__:',
    sourceCityCommentPattern: /\[SOURCE_CITY=(МСК|СПБ|Все)\]/i,
    isSuppressedLeadSource: () => false, hasRoistatSourceAttribution: () => false,
    sourceNameEquals: (left, right) => left.toLowerCase() === right.toLowerCase(),
    stripOmQualifiedFromComment: value => value, encodeOmQualifiedInComment: value => value,
    adminCities: ['МСК', 'СПБ', 'сообщения'], metrics: metricNames,
    coefficientForCityMetric: () => 1,
  });
  return exports;
}

test('manual qualification has a stable separate identity while canonical and source IDs stay compatible', () => {
  const b = backend().api;
  const f = frontend();
  for (const city of ['МСК', 'СПБ']) {
    const canonical = `${date}-${city}-Квалы`;
    assert.equal(b.id(date, city, 'Квалы', 'Город'), canonical);
    assert.equal(f.dailyRecordKey(date, city, 'Квалы', 'Город'), canonical);
    const special = b.id(date, city, 'Квалы', manualChannel);
    assert.notEqual(special, canonical);
    assert.equal(b.id(date, city, 'Квалы', manualChannel), special);
    assert.equal(f.dailyRecordKey(date, city, 'Квалы', manualChannel), special);
  }
  const sourceId = `${date}-источники-Яндекс Карты-Лиды`;
  assert.equal(b.id(date, 'источники', 'Лиды', 'Яндекс Карты'), sourceId);
  assert.equal(f.dailyRecordKey(date, 'источники', 'Лиды', 'Яндекс Карты'), sourceId);
});

test('manual creation cannot inherit canonical plans, forecasts, deductions, or OM classification', () => {
  const canonical = row('МСК', 'Квалы', { plan: 30, forecast: 31, recommendations: 3, omQualified: 7 });
  const b = backend([manual('МСК'), canonical]);
  assert.equal(b.api.find(date, 'МСК', 'Квалы').id, canonical.id);
  assert.equal(b.api.find(date, 'МСК', 'Квалы', 'Город').id, canonical.id);
  assert.equal(b.api.find(date, 'МСК', 'Квалы', manualChannel).channel, manualChannel);
  const fresh = backend([canonical]).api.normalize({ date, city: 'МСК', metric: 'Квалы', channel: manualChannel, fact: 2 });
  assert.notEqual(fresh.id, canonical.id);
  assert.equal(fresh.fact, 2);
  for (const key of ['plan', 'forecast', 'recommendations', 'omQualified']) assert.equal(fresh[key], 0, key);
  assert.equal(fresh.comment, '');
  assert.equal(fresh.trafficSales, '');
  assert.equal(fresh.paidSales, '');
  assert.throws(() => b.api.normalize({ id: canonical.id, date, city: 'МСК', metric: 'Квалы', channel: manualChannel, fact: 2 }));
});

test('repeating the same no-ID manual upsert updates one row per city and never overwrites amoCRM', () => {
  const canonical = ['МСК', 'СПБ'].map(city => row(city));
  const b = backend(canonical);
  const records = ['МСК', 'СПБ'].map(city => ({ date, city, metric: 'Квалы', channel: manualChannel, fact: 2 }));
  b.api.upsert({ records });
  b.api.upsert({ records });
  assert.equal(b.saved().length, 4);
  assert.equal(new Set(b.saved().map(item => item.id)).size, 4);
  for (const current of canonical) assert.deepEqual(b.saved().find(item => item.id === current.id), current);
  assert.equal(b.saved().filter(item => item.channel === manualChannel).reduce((sum, item) => sum + item.fact, 0), 4);
  const duplicateBatch = backend(canonical);
  duplicateBatch.api.upsert({ records: [...records, ...records] });
  assert.equal(duplicateBatch.saved().length, 4, 'retries within one batch must also stay idempotent');
});

test('ordinary frontend editing preserves both manual cities and independently scoped source/brand rows', () => {
  const f = frontend();
  const source = city => row('источники', 'Лиды', {
    id: `${date}-source-${city === 'МСК' ? 'msk' : 'spb'}-Яндекс Карты-Лиды`,
    channel: 'Яндекс Карты', fact: 9, comment: `[SOURCE_CITY=${city}]`,
  });
  const existing = [manual('МСК'), manual('СПБ'), row('МСК'), row('СПБ'), source('МСК'), source('СПБ')];
  assert.equal(f.findDailyRecord(existing, date, 'МСК', 'Квалы').channel, 'Город');
  const edited = plain(f.applyDailyValuesToRecords(existing, [{ date, city: 'МСК', metric: 'Квалы', fact: 11 }]));
  assert.equal(edited.length, existing.length);
  assert.equal(edited.find(item => item.id === row('МСК').id).fact, 11);
  for (const item of existing.filter(item => item.channel !== 'Город')) {
    assert.deepEqual(edited.find(current => current.id === item.id), item);
  }
  const repeated = plain(f.applyDailyValuesToRecords(edited, [{ date, city: 'МСК', metric: 'Квалы', channel: manualChannel, fact: 2 }]));
  assert.equal(repeated.length, existing.length);
  assert.equal(repeated.find(item => item.id === row('МСК').id).fact, 11);
});

test('frontend remote payload for a new manual row does not copy the canonical row or its OM count', () => {
  const f = frontend();
  const canonical = row('МСК', 'Квалы', { plan: 30, forecast: 31, omQualified: 7 });
  const [value] = f.prepareDailyValuesForRemote([{ date, city: 'МСК', metric: 'Квалы', channel: manualChannel, fact: 2 }], [canonical]);
  assert.equal(value.plan, 0);
  assert.equal(value.forecast, 0);
  assert.equal(value.omQualified, 0);
  assert.equal(value.comment, '');
});

test('requested amoCRM refresh and a historical cache refresh preserve the separate manual qualification rows', () => {
  const oldDate = '2026-10-31';
  const oldManual = manual('МСК', { date: oldDate, id: `${oldDate}-МСК-${manualChannel}-Квалы` });
  const oldSale = row('МСК', 'Продажи', { date: oldDate, id: `${oldDate}-МСК-Продажи`, trafficSales: 0 });
  const adjustments = [manual('МСК'), manual('СПБ'), oldManual];
  const cached = [{ leadId: 'one', city: 'МСК', pipelineName: 'МСК АШ', createdDate: oldDate,
    createdAt: `${oldDate}T12:00:00Z`, statusId: '41892613', stageName: 'Брифинг', responsibleUserName: 'Менеджер' }];
  const b = backend([...adjustments, row('МСК'), row('СПБ'), oldSale], cached);
  b.api.sync([], date, date, []);
  b.api.write(b.api.snapshot(date, date));
  for (const item of adjustments) assert.deepEqual(b.saved().find(current => current.id === item.id), item);
  assert.equal(b.saved().find(item => item.id === `${oldDate}-МСК-Квалы`).fact, 1);
  for (const city of ['МСК', 'СПБ']) assert.equal(b.saved().find(item => item.id === `${date}-${city}-Квалы`).fact, 0);
});

test('two manual qualifications per city add four to daily, weekly, and monthly totals without changing plans, leads, or sales', () => {
  const base = ['МСК', 'СПБ'].flatMap(city => metricNames.map(metric => row(city, metric)));
  const adjusted = [...base, manual('МСК'), manual('СПБ')];
  const before = metrics.buildMetricTotals(base, metricNames);
  const after = metrics.buildMetricTotals(adjusted, metricNames);
  assert.equal(after['Квалы'].fact - before['Квалы'].fact, 4);
  for (const city of ['МСК', 'СПБ']) {
    assert.equal(metrics.buildMetricTotals(adjusted.filter(item => item.city === city), metricNames)['Квалы'].fact, 12);
  }
  assert.deepEqual(after['Лиды'], before['Лиды']);
  assert.deepEqual(after['Продажи'], before['Продажи']);
  assert.equal(after['Квалы'].plan, before['Квалы'].plan);
  assert.equal(after['Квалы'].forecast, before['Квалы'].forecast);
  assert.equal(after['Квалы'].omQualified, before['Квалы'].omQualified);
  assert.equal(report.buildWeeklySummary(adjusted, [])[0].totals['Квалы'].fact, 24);
  const months = metrics.buildOverallMonths(adjusted, [], [{ monthKey: '2026-11', year: 2026, monthIndex: 10, daysInMonth: 30 }]);
  assert.equal(months[0].weeks.reduce((sum, week) => sum + week.totals['Квалы'].fact, 0), 24);
});

test('completed manual qualification joins the day once; today stays outside the projection baseline', () => {
  const f = frontend();
  const dates = [date, '2026-11-08', '2026-11-09'];
  for (const partialManualToday of [0, 100]) {
    const records = ['МСК', 'СПБ'].flatMap(city => [row(city), manual(city),
      row(city, 'Квалы', { date: dates[1], id: `${dates[1]}-${city}-Квалы`, fact: 1 }),
      manual(city, { date: dates[1], id: `${dates[1]}-${city}-${manualChannel}-Квалы`, fact: partialManualToday }),
    ]);
    const forecast = f.buildMonthEndForecast(records, dates, false, {}, dates[1]);
    assert.equal(forecast.lastFactDate, date);
    assert.equal(forecast.remainingDatesCount, 2);
    assert.equal(forecast.metrics['Квалы'].fact, 26 + 2 * partialManualToday);
    assert.equal(forecast.metrics['Квалы'].baseDaily, 24);
    assert.equal(forecast.metrics['Квалы'].projected, 72);
  }
});
