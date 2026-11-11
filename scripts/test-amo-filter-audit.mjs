import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {test} from 'node:test';

const directory = new URL('../apps-script/', import.meta.url);
const source = ['AppsScript.gs', 'AmoMonthRefresh.gs', 'AmoFilterAudit.gs'].map(file => readFileSync(new URL(file, directory), 'utf8')).join('\n');
const copy = value => JSON.parse(JSON.stringify(value));
const ids = ['4535035', '4535038', '9926210', '9926246'];
const spec = () => ({fromDate: '2026-10-01', toDate: '2026-10-31', dateField: 'created_at',
  open: {pipelineStatuses: Object.fromEntries(ids.map(id => [id, [142, 11]])), owners: [1, 88, 99, 10304986]},
  closedTarget: {pipelineStatuses: {'4535035': [143], '4535038': [143]}, owners: [1, 88, 99, 10304986],
    lossReasonIds: [13957954, 19999678, 3421768, 3421771, 3421777]}});
const dictionaries = {pipelines: {'4535035': 'СПБ АШ', '4535038': 'МСК АШ', '9926210': 'Дополнительная воронка А', '9926246': 'Дополнительная воронка Б'},
  users: {1: 'Менеджер', 2: 'Другой', 88: 'Технический', 99: 'Системный', 10304986: 'РОП'},
  statuses: Object.fromEntries(ids.flatMap(id => [[`${id}:142`, 'Успешно реализовано'], [`${id}:143`, 'Закрыто и не реализовано'],
    [`${id}:11`, 'Брифинг'], [`${id}:12`, 'На проверку']]))};
const lead = (id, pipeline = '4535038', overrides = {}) => ({id, pipeline_id: Number(pipeline), status_id: 11,
  responsible_user_id: 1, created_at: Date.parse('2026-10-04T12:00:00Z') / 1000, custom_fields_values: [], ...overrides});
const field = (field_name, value) => ({field_name, values: [{value}]});
function formatDate(date, zone, pattern) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {timeZone: zone === 'GMT' ? 'UTC' : zone,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'})
    .formatToParts(date).map(part => [part.type, part.value]));
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  return pattern === 'yyyy-MM-dd HH:mm:ss' ? `${day} ${parts.hour}:${parts.minute}:${parts.second}` : day;
}
function fixture(rows = [], dictionary = dictionaries, error = null) {
  const calls = []; let normalizations = 0; let dictionaryReads = 0;
  const forbidden = new Proxy({}, {get() { throw new Error('Unexpected external read/write'); }});
  const audit = runInNewContext(`${source}
    amoMonthRefreshDictionaries_ = () => readDictionary();
    fetchAmoCrmLeadsByDateField_ = (...args) => readLeads(...args);
    const originalNormalize = salesNormalizeAmoLead_;
    salesNormalizeAmoLead_ = (...args) => { normalized(); return originalNormalize(...args); };
    amoQualificationFilterAudit_;`, {
    Utilities: {formatDate}, Session: {getScriptTimeZone: () => 'Europe/Moscow'},
    PropertiesService: forbidden, SpreadsheetApp: forbidden, LockService: forbidden, Logger: forbidden, console: forbidden,
    readDictionary: () => { dictionaryReads++; if (dictionary instanceof Error) throw dictionary; return dictionary; },
    normalized: () => { normalizations++; },
    readLeads: (from, to, fieldName, pipeline, maxPages, warnings, options) => {
      calls.push({from, to, fieldName, pipeline, maxPages, warnings, options});
      if (error) throw error;
      return typeof rows === 'function' ? rows(pipeline) : rows.filter(row => String(row.pipeline_id) === pipeline);
    },
  });
  return {audit: filterSpec => copy(audit({filterSpec})), calls, stats: () => ({normalizations, dictionaryReads})};
}

test('all four exact CRM filters are counted once with the existing report policy and aggregate-only output', () => {
  const rows = [lead(8100001, '4535038', {responsible_user_id: 10304986}),
    lead(8100002, '4535038', {responsible_user_id: 10304986, status_id: 142, custom_fields_values: [field('Категория', 'А+Б')]}),
    lead(8100003, '4535038', {source_name: 'РЕК/КЭШБЕК'}),
    lead(8100004, '4535038', {status_id: 142, custom_fields_values: [field('Тип лида', 'Сообщение')]}),
    lead(8100005, '4535038', {status_id: 143, loss_reason_id: 3421768, loss_reason: {name: 'Дорого'}}),
    lead(8100006, '4535038', {status_id: 143, loss_reason_id: 23760226}),
    lead(8100007, '4535038', {status_id: 12}),
    lead(8100008, '4535038', {responsible_user_id: 2}),
    lead(8100009, '4535038', {status_id: 143, loss_reason_id: 999, loss_reason: {name: 'Практика'}}),
    lead(8100010, '4535035', {responsible_user_id: 88}), lead(8100011, '4535035', {responsible_user_id: 99}),
    lead(8100012, '4535035', {status_id: 143, loss_reason_id: 3421768, loss_reason: {name: 'Дубль'}}),
    lead(8100013, '4535035', {status_id: 143, loss_reason_id: 23625702}),
    lead(8100014, '9926210'), lead(8100015, '9926246', {status_id: 142})];
  rows.push(copy(rows[0]));
  for (const row of rows) { row.name = 'PRIVATE_LEAD'; row.responsible_user_name = 'PRIVATE_OWNER'; row.contacts = 'PRIVATE_CONTACT'; }
  const f = fixture(rows); const result = f.audit(spec());
  assert.equal(result.pipelines.length, 4);
  assert.deepEqual(f.calls.map(call => call.pipeline).sort(), ids.slice().sort());
  for (const call of f.calls) {
    assert.equal(call.from, '2026-10-01'); assert.equal(call.to, '2026-10-31');
    assert.equal(call.fieldName, 'created_at'); assert.equal(call.maxPages, 80);
    assert.equal(call.options.strictLeadList, true); assert.ok(Array.isArray(call.warnings));
  }
  assert.deepEqual(result.totals, {uniqueCohortCount: 15, openFilterCount: 8, closedFilterCount: 2,
    matchingReportOp: 4, matchingOm: 1, reportOpCohortCount: 6, reportOmCohortCount: 2,
    extraReportOpOutsideFilters: 2, extraOmOutsideFilters: 1,
    excludedByReason: {referralCashback: 1, messagesType: 1, noCity: 2, notQualifiedStageOrReason: 1}});
  assert.equal(f.stats().normalizations, 15);
  assert.equal(f.stats().dictionaryReads, 1);
  assert.equal(result.dailyQualified.length, 62);
  assert.equal(result.dailyQualified.reduce((sum, row) => sum + row.qualified, 0), result.totals.matchingReportOp);
  assert.equal(result.dailyQualified.find(row => row.date === '2026-10-04' && row.city === 'МСК').qualified, 3);
  assert.equal(result.dailyQualified.find(row => row.date === '2026-10-04' && row.city === 'СПБ').qualified, 1);
  const serialized = JSON.stringify(result);
  for (const privateValue of ['PRIVATE_LEAD', 'PRIVATE_OWNER', 'PRIVATE_CONTACT', '8100001', 'custom_fields_values', 'responsible_user', 'access_token']) assert.ok(!serialized.includes(privateValue));
});

test('filter shape, numeric bounds, disjoint status groups and native real dates validate before any fetch', () => {
  const invalid = [undefined, {...spec(), dateField: 'updated_at'}, {...spec(), fromDate: '2026-10-32'},
    {...spec(), toDate: '2026-11-01'}, {...spec(), fromDate: '2026-11-01', toDate: '2026-10-01'}];
  const missing = spec(); delete missing.open.pipelineStatuses['9926246']; invalid.push(missing);
  const unknown = spec(); unknown.open.pipelineStatuses['999'] = [11]; invalid.push(unknown);
  const overlap = spec(); overlap.open.pipelineStatuses['4535038'].push(143); invalid.push(overlap);
  const owner = spec(); owner.open.owners = ['1.5']; invalid.push(owner);
  const tooMany = spec(); tooMany.open.owners = Array.from({length: 251}, (_, index) => index + 1); invalid.push(tooMany);
  for (const input of invalid) {
    const f = fixture(); assert.throws(() => f.audit(input), /фильтр|период|даты/i);
    assert.equal(f.calls.length, 0); assert.equal(f.stats().dictionaryReads, 0);
  }
});

test('both ordinary and referral won messages are excluded once from qualification', () => {
  const messageFields = [field('Тип обращения', 'Сообщение'), field('Категория', 'А+Б')];
  const result = fixture([lead(1, '4535038', {status_id: 142, custom_fields_values: messageFields}),
    lead(2, '4535038', {status_id: 142, source_name: 'РЕК/КЭШБЕК', custom_fields_values: messageFields})]).audit(spec());
  assert.equal(result.totals.openFilterCount, 2);
  assert.equal(result.totals.matchingReportOp, 0);
  assert.equal(result.totals.excludedByReason.referralCashback, undefined);
  assert.equal(result.totals.excludedByReason.messagesType, 2);
  assert.equal(result.dailyQualified.reduce((sum, row) => sum + row.qualified, 0), 0);
});

test('message types in the exact filters stay excluded for won, open and target-lost statuses', () => {
  const fields = [field('Тип обращения', 'Сообщение')];
  const result = fixture([lead(1, '4535038', {status_id: 142, custom_fields_values: fields}),
    lead(2, '4535038', {custom_fields_values: fields}),
    lead(3, '4535038', {status_id: 143, loss_reason_id: 3421768, custom_fields_values: fields})]).audit(spec());
  assert.equal(result.totals.openFilterCount, 2);
  assert.equal(result.totals.closedFilterCount, 1);
  assert.equal(result.totals.matchingReportOp, 0);
  assert.equal(result.totals.excludedByReason.messagesType, 3);
  assert.equal(result.dailyQualified.reduce((sum, row) => sum + row.qualified, 0), 0);
});

test('malformed source cohorts and missing dictionaries abort rather than returning partial counts', () => {
  const badRows = [null, {...lead(1), id: ''}, {...lead(1), id: [1]}, lead(1, '4535038', {created_at: 0}),
    lead(1, '4535038', {created_at: Date.parse('2026-09-30T20:59:59Z') / 1000}),
    lead(1, '4535038', {status_id: 999}), lead(1, '4535038', {responsible_user_id: 999})];
  for (const bad of badRows) assert.throws(() => fixture(pipeline => pipeline === '4535038' ? [bad] : []).audit(spec()), /аудит|состав/i);
  assert.throws(() => fixture(() => ({})).audit(spec()), /аудит|состав/i);
  const missingPipeline = copy(dictionaries); delete missingPipeline.pipelines['9926210'];
  assert.throws(() => fixture([], missingPipeline).audit(spec()), /аудит|справочник/i);
  assert.throws(() => fixture(pipeline => [lead(1, pipeline)], dictionaries).audit(spec()), /аудит|состав/i, 'a moving lead cannot count in two pipelines');
});

test('source errors cannot echo lead data, names, tokens or partial response warnings', () => {
  for (const f of [fixture([], new Error('PRIVATE_USER access_token=PRIVATE_TOKEN')),
    fixture([], dictionaries, new Error('PRIVATE_LEAD access_token=PRIVATE_TOKEN'))]) {
    assert.throws(() => f.audit(spec()), error => !/PRIVATE|access_token/.test(error.message) && /аудит/i.test(error.message));
  }
});

test('ROP cohort cutoff, allowed refusal IDs, duplicates and A+B qualification reuse the current native policy', () => {
  const cases = [['2026-10-31T20:59:59Z', 1], ['2026-10-31T21:00:00Z', 10]];
  const rows = cases.flatMap(([instant, id]) => [lead(id, '4535038', {responsible_user_id: 10304986, status_id: 142,
    created_at: Date.parse(instant) / 1000, custom_fields_values: [field('Категория', 'А+Б'), field('Дата создания', '20.11.2026')]}),
    lead(id + 1, '4535038', {responsible_user_id: 10304986, status_id: 143, loss_reason_id: 3421768, created_at: Date.parse(instant) / 1000}),
    lead(id + 2, '4535038', {responsible_user_id: 10304986, status_id: 143, loss_reason_id: 23760226, created_at: Date.parse(instant) / 1000})]);
  const filterSpec = {...spec(), fromDate: '2026-10-31', toDate: '2026-11-01'};
  const result = fixture(rows).audit(filterSpec);
  assert.equal(result.totals.uniqueCohortCount, 6);
  assert.equal(result.totals.matchingReportOp, 2); assert.equal(result.totals.matchingOm, 2);
  assert.equal(result.totals.extraOmOutsideFilters, 2);
  assert.equal(result.totals.openFilterCount, 2); assert.equal(result.totals.closedFilterCount, 2);
});

test('daily qualification uses native Moscow creation boundaries, exact filters and zero-filled city coverage', () => {
  const rows = [lead(101, '4535038', {created_at: Date.parse('2026-09-30T21:00:00Z') / 1000,
    custom_fields_values: [field('Дата создания', '31.10.2026')]}),
    lead(102, '4535035', {created_at: Date.parse('2026-10-31T20:59:59Z') / 1000, responsible_user_id: 10304986}),
    lead(103, '9926210'), lead(104, '4535038', {responsible_user_id: 2}),
    lead(105, '4535038', {source_name: 'РЕК/КЭШБЕК'}),
    lead(106, '4535035', {custom_fields_values: [field('Тип лида', 'Сообщение')]})];
  const result = fixture(rows).audit(spec());
  assert.equal(result.dailyQualified.length, 62);
  assert.equal(new Set(result.dailyQualified.map(row => `${row.date}|${row.city}`)).size, 62);
  assert.equal(result.dailyQualified.reduce((sum, row) => sum + row.qualified, 0), 2);
  assert.equal(result.totals.matchingReportOp, 2);
  assert.equal(result.dailyQualified.find(row => row.date === '2026-10-01' && row.city === 'МСК').qualified, 1);
  assert.equal(result.dailyQualified.find(row => row.date === '2026-10-31' && row.city === 'СПБ').qualified, 1);
  for (const row of result.dailyQualified.filter(row => row.date === '2026-10-02')) assert.equal(row.qualified, 0);
  assert.ok(result.dailyQualified.every(row => Object.keys(row).sort().join(',') === 'city,date,qualified'));
});

test('a fully observed empty month supplies all 62 deliberate zero qualification values', () => {
  const result = fixture().audit(spec());
  assert.equal(result.dailyQualified.length, 62);
  assert.ok(result.dailyQualified.every(row => row.qualified === 0));
  assert.deepEqual(result.dailyQualified[0], {date: '2026-10-01', city: 'МСК', qualified: 0});
  assert.deepEqual(result.dailyQualified[61], {date: '2026-10-31', city: 'СПБ', qualified: 0});
});
