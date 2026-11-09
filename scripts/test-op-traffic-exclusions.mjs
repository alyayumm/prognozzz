import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';
import { createReportModelLoader } from './helpers/report-model.mjs';

const main = readFileSync(new URL('../apps-script/AppsScript.gs', import.meta.url), 'utf8');
const traffic = readFileSync(new URL('../apps-script/AmoTrafficSales.gs', import.meta.url), 'utf8');
const globals = { Session: { getScriptTimeZone: () => 'Europe/Moscow' }, Utilities: { formatDate: date => date.toISOString().slice(0, 10) } };
const dictionaries = { users: {}, pipelines: { 1: 'МСК АШ' }, statuses: { '1:142': 'Успешно реализовано', '1:41892613': 'Брифинг' } };
const raw = (id, extra = {}) => ({ leadId: id, pipelineName: 'МСК АШ', city: 'МСК', createdDate: '2026-10-01',
  createdAt: '2026-10-01T12:00:00Z', statusId: '41892613', stageName: 'Брифинг', managerName: 'Менеджер',
  responsibleUserName: 'Менеджер', source: 'Яндекс Директ', ...extra });
function fixture(cache = [], existing = []) {
  let saved = existing;
  const api = runInNewContext(`${main}\n${traffic}
    readObjects_ = () => readSaved();
    readAmoCrmRawLeadObjectsFast_ = () => cache;
    upsertRowsById_ = (sheet, headers, rows) => { writeSaved(rows); return { updated: rows.length }; };
    rebuildWeeklySummary_ = () => {};
    ({ sync: syncAmoCrmMainReportFacts_, snapshot: readMainAmoTrafficSalesSnapshot_,
       normalize: salesNormalizeAmoLead_, cached: salesAmoLeadFromCachedRecord_, record: amoCrmLeadRecord_,
       serialize: dailyRow_, client: normalizeDailyForClient_, edit: normalizeDailyUpdate_,
       department: salesReadAmoDepartmentData_ });`, {
    ...globals, cache, readSaved: () => saved, writeSaved: rows => { saved = rows; },
  });
  return { api, saved: () => saved };
}

test('all leads include referral and OM once while qualification keeps its separate exclusions', () => {
  const regular = raw('regular');
  const referrals = raw('referral', { source: 'РЕК/КЭШБЕК' });
  const om = raw('technical', { responsibleUserName: 'Технический' });
  const both = raw('both', { source: 'РЕК/КЭШБЕК', responsibleUserName: 'Технический' });
  const targetDuplicate = raw('duplicate', { statusId: '143', stageName: 'Закрыто и не реализовано', lossReasonId: '23760226' });
  const chat = raw('chat', { statusId: '143', stageName: 'Закрыто и не реализовано', lossReasonId: '23625702' });
  const pending = raw('pending', { stageName: 'На проверку' });
  const f = fixture();
  f.api.sync([regular, referrals, om, both, targetDuplicate, chat, pending, regular], '2026-10-01', '2026-10-01', []);
  const lead = f.saved().find(row => row.city === 'МСК' && row.metric === 'Лиды');
  const qualified = f.saved().find(row => row.city === 'МСК' && row.metric === 'Квалы');
  assert.equal(lead.fact, 6);
  assert.equal(lead.omLeads, 0);
  assert.ok(lead.comment.includes('[AMO_LEADS_ALL=1]'));
  assert.equal(qualified.fact, 1);
  assert.equal(qualified.omQualified, 2);
  assert.equal(lead.recommendations, 0);
});

test('referral source survives fresh and cached normalization, metadata survives and source changes are re-evaluated', () => {
  const f = fixture();
  const fresh = { id: 42, pipeline_id: 1, status_id: 142, source_name: 'РЕК/КЭШБЕК',
    responsible_user_name: 'Менеджер', created_at: Date.parse('2026-10-01T12:00:00Z') / 1000,
    custom_fields_values: [{ field_name: 'Категория', values: [{ value: 'А+Б' }] }] };
  const saved = f.api.record(fresh, dictionaries);
  const normalized = f.api.normalize(f.api.cached(saved), dictionaries, { periodMode: 'all' });
  assert.equal(f.api.normalize({ ...fresh, pipeline_name: 'МСК АШ', status_name: 'Успешно реализовано' }, dictionaries, { periodMode: 'all' }).isReferral, true);
  assert.equal(f.api.normalize({ ...fresh, source_name: '', pipeline_name: 'МСК АШ', status_name: 'Успешно реализовано',
    custom_fields_values: [{ field_name: 'Источник', values: [{ value: 'РЕК/КЭШБЕК' }] }] }, dictionaries, { periodMode: 'all' }).isReferral, true);
  assert.equal(normalized.isReferral, true);
  assert.equal(normalized.isWon, true);
  assert.equal(normalized.isDoubleAB, true);
  assert.equal(normalized.category, 'А+Б');
  assert.equal(normalized.createdDate, '2026-10-01');
  const changed = f.api.normalize(f.api.cached({ ...saved, source: 'Яндекс Директ' }), dictionaries, { periodMode: 'all' });
  assert.equal(changed.isReferral, false);
  for (const source of ['РЕК/КЭШБЕК', ' рек / кешбек ', 'Рек/кешбэк']) {
    assert.equal(f.api.normalize(f.api.cached(raw('x', { source })), dictionaries, { periodMode: 'all' }).isReferral, true);
  }
  for (const source of ['Внешняя реклама', 'Яндекс Директ', 'РЕК/КЭШБЕК позже', '']) {
    assert.equal(f.api.normalize(f.api.cached(raw('x', { source })), dictionaries, { periodMode: 'all' }).isReferral, false);
  }
});

test('historical cache recalculation applies exclusions while all won sales and user inputs stay intact', () => {
  const date = '2026-10-01';
  const sale = { id: `${date}-МСК-Продажи`, date, city: 'МСК', channel: 'Город', metric: 'Продажи', trafficSales: 2, paidSales: 5, fact: 5 };
  const previousLead = { id: `${date}-МСК-Лиды`, date, city: 'МСК', channel: 'Город', metric: 'Лиды', fact: 4, recommendations: 1, plan: 30, forecast: 31, comment: 'заметка' };
  const f = fixture([raw('regular'), raw('referral', { source: 'РЕК/КЭШБЕК', statusId: '142', category: 'А+Б' }),
    raw('om', { responsibleUserName: 'Технический' }), raw('both', { source: 'РЕК/КЭШБЕК', responsibleUserName: 'Технический' })], [sale, previousLead]);
  const snapshot = f.api.snapshot('2026-11-01', '2026-11-01');
  const lead = snapshot.rows.find(row => row.id === previousLead.id);
  const qualified = snapshot.rows.find(row => row.metric === 'Квалы' && row.city === 'МСК' && row.date === date);
  assert.equal(lead.fact, 4); assert.equal(lead.omLeads, 0);
  assert.equal(qualified.fact, 1); assert.equal(qualified.omQualified, 1);
  for (const key of ['recommendations', 'plan', 'forecast']) assert.equal(lead[key], previousLead[key]);
  assert.ok(lead.comment.includes(previousLead.comment));
  assert.ok(lead.comment.includes('[AMO_LEADS_ALL=1]'));
  assert.equal(snapshot.rows.some(row => row.id === sale.id), false, 'unchanged two-count A+B sale is retained');
});

test('department all-lead traffic includes referral and technical leads while qualification stays separate', () => {
  const f = fixture();
  const leads = [raw('regular'), raw('referral', { source: 'РЕК/КЭШБЕК', statusId: '142', category: 'А+Б', closedAt: '2026-10-01T15:00:00Z' }),
    raw('technical', { responsibleUserName: 'Технический', statusId: '142', closedAt: '2026-10-01T15:00:00Z' })].map(f.api.cached);
  const report = f.api.department({ monthKey: '2026-10', monthYear: 2026, monthIndex: 9, managers: [], restrictManagers: false }, [], leads);
  assert.equal(report.daily[0].totalTraffic, 3);
  assert.equal(report.daily[0].totalQualified, 1);
  assert.equal(report.daily[0].totalDeals, 3);
});

test('historical September and October cohorts include all leads and keep System/Technical qualification split', () => {
  const dates = ['2026-09-30', '2026-10-01'];
  const existing = dates.flatMap(date => [
    { id: `${date}-МСК-Продажи`, date, city: 'МСК', channel: 'Город', metric: 'Продажи', trafficSales: 0, paidSales: 5, fact: 5 },
    { id: `${date}-МСК-Лиды`, date, city: 'МСК', channel: 'Город', metric: 'Лиды', fact: 0, omLeads: 2, plan: 30, recommendations: 1, comment: 'заметка' },
    { id: `${date}-МСК-Квалы`, date, city: 'МСК', channel: 'Город', metric: 'Квалы', fact: 0, omQualified: 2, plan: 20, forecast: 22 },
  ]);
  const cache = dates.flatMap(date => ['Системный', 'Технический'].map(owner => raw(`${date}-${owner}`, {
    createdDate: date, updatedAt: '2026-11-09T12:00:00Z', responsibleUserName: owner,
  })));
  const snapshot = fixture(cache, existing).api.snapshot('2026-11-01', '2026-11-09');
  for (const date of dates) {
    const lead = snapshot.rows.find(row => row.date === date && row.city === 'МСК' && row.metric === 'Лиды');
    const qualified = snapshot.rows.find(row => row.date === date && row.city === 'МСК' && row.metric === 'Квалы');
    assert.equal(lead.fact, 2);
    assert.equal(lead.omLeads, 0);
    assert.equal(lead.plan, 30);
    assert.equal(lead.recommendations, 1);
    assert.ok(lead.comment.includes('заметка'));
    assert.ok(lead.comment.includes('[AMO_LEADS_ALL=1]'));
    assert.equal(qualified.fact, 1);
    assert.equal(qualified.omQualified, 1);
    assert.equal(qualified.fact + qualified.omQualified, 2);
    assert.equal(qualified.plan, 20);
    assert.equal(qualified.forecast, 22);
    assert.equal(snapshot.rows.some(row => row.date === date && row.city === 'МСК' && row.metric === 'Продажи'), false);
  }
});

test('derived OM leads survive storage and plan edits but cannot be overwritten by stale clients', () => {
  const row = { id: '2026-10-01-МСК-Лиды', date: '2026-10-01', city: 'МСК', channel: 'Город', metric: 'Лиды', fact: 4, omLeads: 3, plan: 20 };
  const f = fixture([], [row]);
  assert.equal(f.api.serialize(row)[16], 3);
  const updated = f.api.edit({ ...row, plan: 30, omLeads: 999 });
  assert.equal(updated.omLeads, 3);
  assert.equal(f.api.client(updated).omLeads, 3);
  assert.equal(f.api.client({ ...row, omLeads: '' }).omLeads, undefined);
  assert.equal(f.api.serialize({ ...row, metric: 'Квалы' })[16], '');
});

test('marketing totals and conversion restore OM leads without changing manual deductions or sales', () => {
  const load = createReportModelLoader();
  const metrics = load('src/lib/metrics.ts'); const report = load('src/utils/report.ts'); const ps = load('src/lib/psSales.ts');
  const base = { date: '2026-10-01', city: 'МСК', channel: 'Город', plan: 20, forecast: 20, recommendations: 0, omQualified: 0 };
  const rows = [{ ...base, metric: 'Лиды', fact: 10, recommendations: 2, omLeads: 2 },
    { ...base, metric: 'Квалы', fact: 4, omQualified: 2 }, { ...base, metric: 'Продажи', fact: 3, trafficSales: 3, salesDateBasis: 'traffic' }];
  const totals = metrics.buildMetricTotals(rows, ['Лиды', 'Квалы', 'Продажи']);
  assert.equal(totals['Лиды'].fact, 8);
  assert.equal(totals['Лиды'].omLeads, 2);
  assert.equal(metrics.applyTrafficModeToTotals(totals, 'marketing')['Лиды'].fact, 10);
  assert.equal(metrics.buildConversions(totals, 'op').leadToQualified, 50);
  assert.equal(metrics.buildConversions(totals, 'marketing').leadToQualified, 60);
  assert.equal(metrics.buildConversions(totals, 'marketing').opLeadToQualified, 50);
  assert.equal(metrics.buildConversions(totals, 'op').marketingLeadToQualified, 60);
  assert.equal(report.buildWeeklySummary(rows, [])[0].totals['Лиды'].omLeads, 2);
  assert.equal(ps.hasActualRecord({ ...base, metric: 'Лиды', fact: 0, omLeads: 2 }), true);
  assert.equal(ps.hasActualRecord({ ...base, metric: 'Лиды', fact: 0, omLeads: 0 }), true);
  assert.equal(ps.hasActualRecord({ ...base, metric: 'Лиды', fact: 0 }), false);
});

test('historical observed zero migrates to explicit OM-lead coverage and a second refresh is idempotent', () => {
  const date = '2026-10-01';
  const sale = { id: `${date}-МСК-Продажи`, date, city: 'МСК', channel: 'Город', metric: 'Продажи', trafficSales: 0 };
  const legacy = { id: `${date}-МСК-Лиды`, date, city: 'МСК', channel: 'Город', metric: 'Лиды', fact: 0, omQualified: 0 };
  const cache = [raw('unrelated', { createdDate: '2026-09-01' })];
  const first = fixture(cache, [sale, legacy]).api.snapshot('2026-11-01', '2026-11-01');
  const migrated = first.rows.find(row => row.id === legacy.id);
  assert.equal(migrated.omLeads, 0);
  const second = fixture(cache, [sale, migrated, ...first.rows.filter(row => row.date === date && row.metric === 'Квалы')]).api.snapshot('2026-11-01', '2026-11-01');
  assert.equal(second.rows.some(row => row.id === legacy.id), false);
});

test('public sheet reads preserve OM lead counts, observed zero, and missing legacy/future coverage', () => {
  const source = readFileSync(new URL('../src/api/publicSheetApi.ts', import.meta.url), 'utf8');
  const load = createReportModelLoader(); const basis = load('src/lib/salesDateBasis.ts'); const exports = {};
  runInNewContext(`${ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText}\nexports.parseDaily = parseServiceDailySheet;`,
    { exports, require: name => name === '../lib/salesDateBasis' ? basis : {} });
  const columns = ['id', 'date', 'city', 'channel', 'metric', 'fact', 'omLeads'];
  const rows = [['known', '2026-11-01', 'МСК', 'Город', 'Лиды', 10, 2],
    ['zero', '2026-11-02', 'МСК', 'Город', 'Лиды', 0, 0],
    ['legacy', '2026-10-01', 'МСК', 'Город', 'Лиды', 10, ''],
    ['future', '2026-11-30', 'МСК', 'Город', 'Лиды', 0, ''],
    ['not-leads', '2026-11-01', 'МСК', 'Город', 'Квалы', 5, 99]];
  const parsed = exports.parseDaily({ cols: columns.map(label => ({ label })), rows: rows.map(values => ({ c: values.map(v => ({ v })) })) });
  assert.equal(parsed.find(row => row.id === 'known').omLeads, 2);
  assert.equal(parsed.find(row => row.id === 'zero').omLeads, 0);
  for (const id of ['legacy', 'future', 'not-leads']) assert.equal(parsed.find(row => row.id === id).omLeads, undefined);
});
