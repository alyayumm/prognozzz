import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

const main = readFileSync(new URL('../apps-script/AppsScript.gs', import.meta.url), 'utf8');
const traffic = readFileSync(new URL('../apps-script/AmoTrafficSales.gs', import.meta.url), 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));
const unix = value => Date.parse(value) / 1000;
const dictionaries = { users: {}, pipelines: { 1: 'МСК АШ' }, statuses: {} };
function formatDate(date, zone, pattern) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: zone === 'GMT' ? 'UTC' : zone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).map(part => [part.type, part.value]));
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  return pattern === 'yyyy-MM-dd HH:mm:ss' ? `${day} ${parts.hour}:${parts.minute}:${parts.second}` : day;
}
function fixture(cache = [], existing = []) {
  let saved = existing;
  const api = runInNewContext(`${main}\n${traffic}
    readObjects_ = () => readSaved();
    readAmoCrmRawLeadObjectsFast_ = () => cache;
    upsertRowsById_ = (sheet, headers, rows) => { writeSaved(rows); return {updated: rows.length}; };
    rebuildWeeklySummary_ = () => {};
    ({normalize: salesNormalizeAmoLead_, cached: salesAmoLeadFromCachedRecord_,
      record: amoCrmLeadRecord_, sync: syncAmoCrmMainReportFacts_, snapshot: readMainAmoTrafficSalesSnapshot_,
      department: salesReadAmoDepartmentData_, sales: salesAmoSalesFacts_, dealCount: salesAmoDealCount_,
      omOwner: salesAmoIsOmOwner_, omRefusal: salesAmoIsOmRefusal_});`, {
    Utilities: {formatDate}, Session: {getScriptTimeZone: () => 'Europe/Moscow'}, cache,
    readSaved: () => saved, writeSaved: rows => { saved = copy(rows); },
  });
  return {api, saved: () => saved};
}
const all = {periodMode: 'all'};
const report = month => ({monthKey: `2026-${month}`, monthYear: 2026, monthIndex: Number(month) - 1,
  managers: [], restrictManagers: false});
const fresh = (instant, overrides = {}) => ({id: 1, pipeline_id: 1, pipeline_name: 'МСК АШ',
  status_id: 41892613, status_name: 'Брифинг', responsible_user_id: 10304986,
  responsible_user_name: 'РОП', created_at: unix(instant), closed_at: unix('2026-11-02T12:00:00Z'),
  custom_fields_values: [], ...overrides});
const raw = (instant, overrides = {}) => ({leadId: '1', pipelineId: '1', pipelineName: 'МСК АШ', city: 'МСК',
  statusId: '41892613', stageName: 'Брифинг', responsibleUserId: '10304986', responsibleUserName: 'РОП',
  managerName: 'РОП', createdAt: instant.replace('T', ' ').replace('Z', ''), createdDate: '2026-11-20',
  closedAt: '2026-11-02 12:00:00', isQualified: 'TRUE', isOmQualified: 'TRUE', ...overrides});

test('ROP qualification switches OP to OM at native Moscow November midnight in fresh and cached paths', () => {
  const {api} = fixture();
  const cases = [
    [{status_id: 41892613, status_name: 'Брифинг'}, {statusId: '41892613', stageName: 'Брифинг'}, true, false],
    [{status_id: 142, status_name: 'Успешно реализовано'}, {statusId: '142', stageName: 'Успешно реализовано'}, true, false],
    [{status_id: 143, status_name: 'Закрыто и не реализовано', loss_reason_id: 3421768},
      {statusId: '143', stageName: 'Закрыто и не реализовано', lossReasonId: '3421768'}, true, false],
    // Existing native ROP reason-ID eligibility must survive a renamed label in October.
    [{status_id: 143, status_name: 'Закрыто и не реализовано', loss_reason_id: 3421768, loss_reason: {name: 'Переименовано'}},
      {statusId: '143', stageName: 'Закрыто и не реализовано', lossReasonId: '3421768', lossReasonName: 'Переименовано'}, true, false],
    [{status_id: 143, status_name: 'Закрыто и не реализовано', loss_reason_id: 999, loss_reason: {name: 'Практика'}},
      {statusId: '143', stageName: 'Закрыто и не реализовано', lossReasonId: '999', lossReasonName: 'Практика'}, true, false],
    [{status_id: 143, status_name: 'Закрыто и не реализовано', loss_reason_id: 23760226},
      {statusId: '143', stageName: 'Закрыто и не реализовано', lossReasonId: '23760226'}, true, true],
    [{status_id: 143, status_name: 'Закрыто и не реализовано', loss_reason_id: 11249860, loss_reason: {name: 'Дубль'}},
      {statusId: '143', stageName: 'Закрыто и не реализовано', lossReasonId: '11249860', lossReasonName: 'Дубль'}, false, false],
    [{status_id: 73650530, status_name: 'На проверку'}, {statusId: '73650530', stageName: 'На проверку'}, false, false],
  ];
  for (const [instant, isNovember] of [['2026-10-31T20:59:59Z', false], ['2026-10-31T21:00:00Z', true]]) {
    for (const [native, cached, qualified, duplicate] of cases) {
      for (const lead of [fresh(instant, native), api.cached(raw(instant, cached))]) {
        const actual = api.normalize(lead, dictionaries, all);
        assert.equal(actual.createdDate, isNovember ? '2026-11-01' : '2026-10-31');
        assert.equal(actual.isQualified, qualified);
        assert.equal(actual.isOmQualified, qualified && (duplicate || isNovember));
      }
    }
  }
});

test('native date overrides custom, cached and closing dates while legacy native owner fallback follows cohort date', () => {
  const {api} = fixture();
  for (const [instant, expected] of [['2026-10-31T20:59:59Z', false], ['2026-10-31T21:00:00Z', true]]) {
    const conflictingCustom = [{field_name: 'Дата создания', values: [{value: expected ? '01.10.2026' : '20.11.2026'}]}];
    const leads = [fresh(instant, {custom_fields_values: conflictingCustom}),
      api.cached(raw(instant, {createdDate: expected ? '2026-10-01' : '2026-11-20'})),
      api.cached(raw(instant, {createdAt: new Date(instant), createdDate: expected ? '2026-10-01' : '2026-11-20'}))];
    for (const lead of leads) assert.equal(api.normalize(lead, dictionaries, all).isOmQualified, expected);
  }
  for (const [date, expected] of [['2026-10-31', false], ['2026-11-01', true]]) {
    const legacy = api.cached(raw('', {createdAt: '', createdDate: date, responsibleUserId: '', responsibleUserName: 'РОП'}));
    assert.equal(api.normalize(legacy, dictionaries, all).isOmQualified, expected);
    const customManager = api.cached(raw('', {createdAt: '', createdDate: date,
      responsibleUserId: '1', responsibleUserName: 'Менеджер', managerName: 'РОП'}));
    assert.equal(api.normalize(customManager, dictionaries, all).isOmQualified, false);
  }
});

test('Technical remains OM and System remains OP on both sides of the date boundary', () => {
  const {api} = fixture();
  for (const instant of ['2026-10-31T20:59:59Z', '2026-10-31T21:00:00Z']) {
    for (const [owner, expected] of [['Технический', true], ['Системный', false]]) {
      for (const lead of [fresh(instant, {responsible_user_id: 1, responsible_user_name: owner}),
        api.cached(raw(instant, {responsibleUserId: '1', responsibleUserName: owner, managerName: owner}))]) {
        assert.equal(api.normalize(lead, dictionaries, all).isOmQualified, expected);
      }
    }
  }
});

test('main, department and historical cohorts change October ROP qualification only and preserve leads and all A+B sales', () => {
  const records = ['10', '11'].flatMap(month => [
    raw(`2026-${month}-01T12:00:00Z`, {leadId: `${month}-won`, statusId: '142', stageName: 'Успешно реализовано', category: 'А+Б'}),
    raw(`2026-${month}-01T12:00:00Z`, {leadId: `${month}-briefing`}),
    raw(`2026-${month}-01T12:00:00Z`, {leadId: `${month}-refusal`, statusId: '143', stageName: 'Закрыто и не реализовано', lossReasonId: '3421768', lossReasonName: 'Дорого'}),
    raw(`2026-${month}-01T12:00:00Z`, {leadId: `${month}-duplicate`, statusId: '143', stageName: 'Закрыто и не реализовано', lossReasonId: '23760226'}),
  ]);
  const f = fixture(records);
  f.api.sync(records, '2026-10-01', '2026-11-01', []);
  for (const [month, op, om] of [['10', 3, 1], ['11', 0, 4]]) {
    const date = `2026-${month}-01`;
    const qualification = f.saved().find(row => row.city === 'МСК' && row.date === date && row.metric === 'Квалы');
    assert.equal(qualification.fact, op); assert.equal(qualification.omQualified, om);
    assert.equal(f.saved().find(row => row.city === 'МСК' && row.date === date && row.metric === 'Лиды').fact, 4);
    const department = f.api.department(report(month), [], records.map(f.api.cached));
    assert.equal(department.daily[0].totalQualified, op);
    assert.equal(department.daily.reduce((sum, row) => sum + row.totalDeals, 0), month === '11' ? 4 : 0);
  }
  const existing = ['10', '11'].flatMap(month => ['Лиды', 'Квалы', 'Продажи'].map(metric => ({
    id: `2026-${month}-01-МСК-${metric}`, date: `2026-${month}-01`, city: 'МСК', channel: 'Город', metric,
    fact: metric === 'Лиды' ? 4 : metric === 'Квалы' ? 0 : 50, omQualified: metric === 'Квалы' ? 4 : '',
    omLeads: 0, trafficSales: metric === 'Продажи' ? 2 : '', paidSales: metric === 'Продажи' ? 50 : '',
    plan: 20, forecast: 22, comment: metric === 'Лиды' ? '[AMO_LEADS_ALL=1]' : 'memo',
  })));
  const snapshot = fixture(records, existing).api.snapshot('2026-11-02', '2026-11-02');
  const changed = snapshot.rows.find(row => row.id === '2026-10-01-МСК-Квалы');
  assert.equal(changed.fact, 3); assert.equal(changed.omQualified, 1);
  assert.equal(changed.plan, 20); assert.equal(changed.forecast, 22); assert.equal(changed.comment, 'memo');
  assert.equal(snapshot.rows.some(row => row.id === '2026-11-01-МСК-Квалы'), false);
  for (const sale of existing.filter(row => row.metric === 'Продажи')) {
    assert.equal(snapshot.rows.some(row => row.id === sale.id), false);
  }
});
