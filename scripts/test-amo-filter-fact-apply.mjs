import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {test} from 'node:test';

const directory = new URL('../apps-script/', import.meta.url);
const source = ['AppsScript.gs', 'AmoMonthRefresh.gs', 'AmoFilterAudit.gs', 'AmoFilterFactApply.gs']
  .map(file => readFileSync(new URL(file, directory), 'utf8')).join('\n');
const copy = value => JSON.parse(JSON.stringify(value));
const pipelines = ['4535035', '4535038', '9926210', '9926246'];
const spec = () => ({fromDate: '2026-10-01', toDate: '2026-10-31', dateField: 'created_at',
  open: {pipelineStatuses: Object.fromEntries(pipelines.map(id => [id, [11, 142]])), owners: [1, 88, 10304986]},
  closedTarget: {pipelineStatuses: {'4535035': [143], '4535038': [143]}, owners: [1, 88, 10304986],
    lossReasonIds: [13957954, 19999678, 3421768, 3421771, 3421777]}});
const dictionaries = {pipelines: {'4535035': 'СПБ АШ', '4535038': 'МСК АШ',
  '9926210': 'Дополнительная воронка А', '9926246': 'Дополнительная воронка Б'},
  users: {1: 'Менеджер', 2: 'Другой', 88: 'Технический', 10304986: 'РОП'},
  statuses: Object.fromEntries(pipelines.flatMap(id => [[`${id}:11`, 'Брифинг'],
    [`${id}:142`, 'Успешно реализовано'], [`${id}:143`, 'Закрыто и не реализовано']]))};
const freshLead = (id, overrides = {}) => ({id, pipeline_id: 4535038, status_id: 11,
  responsible_user_id: 1, created_at: Date.parse('2026-10-01T12:00:00Z') / 1000,
  updated_at: Date.parse('2026-11-10T12:00:00Z') / 1000, closed_at: 0,
  source_name: 'Яндекс Директ', custom_fields_values: [], name: 'PRIVATE_LEAD', ...overrides});
const field = (field_name, value) => ({field_name, values: [{value}]});
const baseFresh = () => [
  freshLead(101, {created_at: Date.parse('2026-09-30T21:00:00Z') / 1000}),
  freshLead(102, {source_name: 'РЕК/КЭШБЕК'}),
  freshLead(103, {responsible_user_id: 88}),
  freshLead(104, {pipeline_id: 4535035, status_id: 142,
    created_at: Date.parse('2026-10-31T20:59:59Z') / 1000,
    closed_at: Date.parse('2026-11-02T12:00:00Z') / 1000,
    custom_fields_values: [field('Категория', 'А+Б')]}),
];
const canonicalDaily = () => Array.from({length: 31}, (_, day) => ['МСК', 'СПБ'].map(city => {
  const date = `2026-10-${String(day + 1).padStart(2, '0')}`;
  return {id: `${date}-${city}-Квалы`, date, month: '2026-10', week: 1, city, channel: 'Город', metric: 'Квалы',
    fact: 77, omQualified: 7, plan: 20, forecast: 22, recommendations: 2, comment: 'preserved memo'};
})).flat();
const protectedDaily = () => [
  {id: '2026-10-01-МСК-Лиды', date: '2026-10-01', month: '2026-10', city: 'МСК', channel: 'Город', metric: 'Лиды', fact: 31, omLeads: 2},
  {id: '2026-10-01-МСК-Продажи', date: '2026-10-01', month: '2026-10', city: 'МСК', channel: 'Город', metric: 'Продажи', fact: 5, paidSales: 5, trafficSales: 4},
  {id: '2026-10-01-МСК-Ручная корректировка-Квалы', date: '2026-10-01', city: 'МСК', channel: 'Ручная корректировка', metric: 'Квалы', fact: 4},
  {id: '2026-11-01-МСК-Квалы', date: '2026-11-01', month: '2026-11', city: 'МСК', channel: 'Город', metric: 'Квалы', fact: 91, omQualified: 8, plan: 100},
];
function formatDate(date, zone, pattern) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {timeZone: zone === 'GMT' ? 'UTC' : zone,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'})
    .formatToParts(date).map(part => [part.type, part.value]));
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  return pattern === 'yyyy-MM-dd HH:mm:ss' ? `${day} ${parts.hour}:${parts.minute}:${parts.second}` : day;
}
function fixture(options = {}) {
  const fresh = options.fresh || baseFresh();
  const state = {raw: [], daily: copy(options.daily || [...canonicalDaily(), ...protectedDaily()]),
    rawWrites: [], cellWrites: [], summaries: [], fetches: []};
  let headers;
  const sheet = name => ({name,
    getLastRow: () => (name === 'AmoCRM_Raw_Leads' ? state.raw : state.daily).length + 1,
    getLastColumn: () => headers[name].length,
    getRange: (row, column, count = 1, width = 1) => ({
      getValues: () => Array.from({length: count}, (_, offset) => {
        const values = row + offset === 1 ? headers[name]
          : headers[name].map(key => ((name === 'AmoCRM_Raw_Leads' ? state.raw : state.daily)[row + offset - 2] || {})[key] ?? '');
        return values.slice(column - 1, column - 1 + width);
      }),
      setValues: values => {
        assert.equal(name, 'Data_Daily', 'raw changes must use the validated raw upsert');
        assert.equal(column, headers.Data_Daily.indexOf('fact') + 1, 'only the fact column may change');
        assert.equal(count, 1); assert.equal(width, 1); assert.equal(values.length, 1); assert.equal(values[0].length, 1);
        state.cellWrites.push({row, column, value: values[0][0]});
        state.daily[row - 2].fact = values[0][0];
      },
    }),
  });
  const sheets = {AmoCRM_Raw_Leads: sheet('AmoCRM_Raw_Leads'), Data_Daily: sheet('Data_Daily')};
  const forbidden = new Proxy({}, {get() {throw new Error('Unexpected service access');}});
  const api = runInNewContext(`${source}
    amoMonthRefreshDictionaries_ = () => dictionary;
    fetchAmoCrmLeadsByDateField_ = (...args) => readFresh(...args);
    readAmoCrmRawLeadObjectsFast_ = () => copyRaw();
    readObjects_ = name => readSaved(name);
    getWeeklyReportSpreadsheet_ = () => ({getSheetByName: name => sheets[name]});
    upsertRowsById_ = (name, columns, rows, mapper) => saveRaw(name, columns, rows, mapper);
    rebuildWeeklySummary_ = month => summarize(month);
    ({apply: amoApplyQualificationFilterFacts_, audit: amoQualificationFilterAudit_, record: amoCrmLeadRecord_,
      cached: salesAmoLeadFromCachedRecord_, department: salesReadAmoDepartmentData_, headers: HEADERS});`, {
    dictionary: dictionaries, sheets, Utilities: {formatDate}, Session: {getScriptTimeZone: () => 'Europe/Moscow'},
    PropertiesService: forbidden, SpreadsheetApp: forbidden, Logger: forbidden, console: forbidden,
    LockService: {getScriptLock: () => ({tryLock: () => true, releaseLock() {}})},
    copyRaw: () => copy(state.raw), readSaved: name => {assert.equal(name, 'Data_Daily'); return copy(state.daily);},
    readFresh: (from, to, dateField, pipeline, maxPages, warnings, strict) => {
      state.fetches.push(pipeline); assert.equal(dateField, 'created_at'); assert.equal(strict.strictLeadList, true);
      return copy(fresh.filter(lead => String(lead.pipeline_id) === pipeline));
    },
    saveRaw: (name, columns, rows, mapper) => {
      assert.equal(name, 'AmoCRM_Raw_Leads');
      state.rawWrites.push(copy(rows));
      const byId = new Map(state.raw.map(record => [record.id, record]));
      rows.forEach(record => {assert.equal(mapper(record).length, columns.length); byId.set(record.id, copy(record));});
      state.raw = [...byId.values()]; return {updated: rows.length};
    },
    summarize: month => {state.summaries.push(month); options.onSummary?.();},
  });
  headers = copy(api.headers);
  options.mutateHeaders?.(headers);
  state.raw = copy(fresh.filter(lead => ['4535035', '4535038'].includes(String(lead.pipeline_id)))
    .map(lead => api.record(lead, dictionaries)));
  const stale = state.raw.find(record => record.leadId === '102');
  if (stale) {stale.source = 'Яндекс Директ'; stale.updatedAt = '2026-11-01 12:00:00';}
  state.raw.push(copy(api.record(freshLead(201, {created_at: Date.parse('2026-11-01T12:00:00Z') / 1000}), dictionaries)));
  options.mutateRaw?.(state.raw, api);
  return {api, state, apply: filterSpec => copy(api.apply({filterSpec: filterSpec || spec()}))};
}
const noWrites = state => {assert.equal(state.rawWrites.length, 0); assert.equal(state.cellWrites.length, 0); assert.equal(state.summaries.length, 0);};

test('apply accepts only the complete October native-creation period before any mutation', () => {
  for (const overrides of [{fromDate: '2026-10-02'}, {toDate: '2026-10-30'},
    {fromDate: '2026-11-01', toDate: '2026-11-30'}, {dateField: 'closed_at'}]) {
    const f = fixture(); assert.throws(() => f.apply({...spec(), ...overrides})); noWrites(f.state);
  }
});

test('a missing or extra native October city ID and an additional-pipeline cohort abort without writes', () => {
  const variations = [
    {mutateRaw: raw => raw.splice(raw.findIndex(record => record.leadId === '102'), 1)},
    {mutateRaw: (raw, api) => raw.push(copy(api.record(freshLead(999), dictionaries)))},
    {fresh: [...baseFresh(), freshLead(301, {pipeline_id: 9926210})]},
    {fresh: [...baseFresh(), freshLead(302, {pipeline_id: 9926246})]},
    {fresh: [...baseFresh(), freshLead(303, {responsible_user_id: 2})]},
  ];
  for (const variation of variations) {
    const f = fixture(variation); assert.throws(() => f.apply()); noWrites(f.state);
  }
});

test('every one of the 62 canonical qualification rows and every cached ID must be unique before raw or fact writes', () => {
  const missing = [...canonicalDaily(), ...protectedDaily()]; missing.splice(20, 1);
  const duplicate = [...canonicalDaily(), ...protectedDaily(), copy(canonicalDaily()[20])];
  for (const variation of [{daily: missing}, {daily: duplicate},
    {mutateRaw: raw => raw.push(copy(raw[0]))}, {mutateRaw: raw => raw.push(copy(raw.at(-1)))}]) {
    const f = fixture(variation); assert.throws(() => f.apply()); noWrites(f.state);
  }
});

test('reordered raw columns and a second canonical daily identity abort before any source or fact mutation', () => {
  const alias = [...canonicalDaily(), ...protectedDaily(), {...canonicalDaily()[20], id: 'legacy-alias'}];
  const swapRawColumns = headers => {
    const raw = headers.AmoCRM_Raw_Leads;
    const source = raw.indexOf('source'); const type = raw.indexOf('typeLabel');
    [raw[source], raw[type]] = [raw[type], raw[source]];
  };
  for (const variation of [{daily: alias}, {mutateHeaders: swapRawColumns}]) {
    const f = fixture(variation); assert.throws(() => f.apply()); noWrites(f.state);
  }
});

test('applying fresh source and timestamp changes patches only changed raw rows and fact cells while preserving all other inputs', () => {
  const f = fixture(); const beforeRaw = copy(f.state.raw); const beforeDaily = copy(f.state.daily);
  const result = f.apply(); assert.ok(result);
  assert.equal(f.state.rawWrites.flat().length, 1);
  assert.equal(f.state.rawWrites[0][0].leadId, '102');
  const changed = f.state.raw.find(record => record.leadId === '102');
  assert.equal(changed.source, 'РЕК/КЭШБЕК'); assert.equal(changed.updatedAt, '2026-11-10 12:00:00');
  for (const previous of beforeRaw.filter(record => record.leadId !== '102')) {
    assert.deepEqual(f.state.raw.find(record => record.id === previous.id), previous);
  }
  assert.equal(f.state.cellWrites.length, 62);
  for (const previous of beforeDaily) {
    const actual = f.state.daily.find(record => record.id === previous.id);
    const canonical = previous.month === '2026-10' && previous.channel === 'Город' && previous.metric === 'Квалы';
    if (!canonical) {assert.deepEqual(actual, previous); continue;}
    const expected = (previous.date === '2026-10-01' && previous.city === 'МСК')
      || (previous.date === '2026-10-31' && previous.city === 'СПБ') ? 1 : 0;
    assert.deepEqual(actual, {...previous, fact: expected});
  }
  const config = {monthKey: '2026-10', monthYear: 2026, monthIndex: 9, managers: [], restrictManagers: false};
  const replay = f.api.department(config, [], f.state.raw.map(f.api.cached));
  const daily = f.state.daily.filter(row => row.month === '2026-10' && row.channel === 'Город' && row.metric === 'Квалы');
  for (const row of daily) {
    const day = replay.daily.find(day => day.key === row.date);
    assert.equal(row.fact, row.city === 'МСК' ? day.mskQualified : day.spbQualified);
  }
  assert.equal(replay.daily.reduce((sum, day) => sum + day.totalQualified, 0), 2);
  const returned = JSON.stringify(result); assert.ok(!/PRIVATE_LEAD|custom_fields_values|responsible_user/.test(returned));
});

test('a repeated apply is idempotent and never rewrites already-current raw rows or qualification facts', () => {
  const f = fixture(); f.apply();
  const rawWrites = f.state.rawWrites.length; const factWrites = f.state.cellWrites.length;
  const snapshot = {raw: copy(f.state.raw), daily: copy(f.state.daily)};
  f.apply();
  assert.equal(f.state.rawWrites.length, rawWrites); assert.equal(f.state.cellWrites.length, factWrites);
  assert.deepEqual(f.state.raw, snapshot.raw); assert.deepEqual(f.state.daily, snapshot.daily);
});

test('filtered fact apply removes a won message qualification saved under the earlier exception without changing November', () => {
  const f = fixture({fresh: [freshLead(101, {status_id: 142,
    custom_fields_values: [field('Тип обращения', 'Сообщение'), field('Категория', 'А+Б')]})],
  mutateRaw: raw => {
    const stale = raw.find(record => record.leadId === '101');
    stale.city = 'МСК'; stale.excludeReason = ''; stale.isQualified = 'TRUE';
  }});
  const novemberBefore = copy(f.state.daily.filter(row => row.month === '2026-11'));
  const result = f.apply();
  assert.equal(result.totals.matchingReportOp, 0);
  assert.equal(result.apply.updatedRawRows, 1);
  const migrated = f.state.raw.find(record => record.leadId === '101');
  assert.equal(migrated.excludeReason, 'messagesType');
  assert.equal(migrated.isQualified, '');
  assert.equal(migrated.isDoubleAB, 'TRUE');
  assert.equal(f.state.daily.find(row => row.date === '2026-10-01' && row.city === 'МСК' && row.channel === 'Город' && row.metric === 'Квалы').fact, 0);
  assert.deepEqual(f.state.daily.filter(row => row.month === '2026-11'), novemberBefore);
  const config = {monthKey: '2026-10', monthYear: 2026, monthIndex: 9, managers: [], restrictManagers: false};
  const replay = f.api.department(config, [], f.state.raw.map(f.api.cached));
  assert.equal(replay.daily.reduce((sum, day) => sum + day.totalQualified, 0), 0);
});

test('filtered fact apply removes an open message qualification from a cache written under the broader policy', () => {
  const f = fixture({fresh: [freshLead(101, {custom_fields_values: [field('Тип обращения', 'Сообщение')]})],
    mutateRaw: raw => {
      const stale = raw.find(record => record.leadId === '101');
      stale.city = 'МСК'; stale.excludeReason = ''; stale.isQualified = 'TRUE';
    }});
  const result = f.apply();
  assert.equal(result.totals.matchingReportOp, 0);
  assert.equal(result.apply.updatedRawRows, 1);
  const actual = f.state.raw.find(record => record.leadId === '101');
  assert.equal(actual.excludeReason, 'messagesType');
  assert.ok(f.state.daily.filter(row => row.month === '2026-10' && row.channel === 'Город' && row.metric === 'Квалы')
    .every(row => row.fact === 0));
});

test('retry repairs a failed summary even when the preceding attempt already applied every raw and fact change', () => {
  let failedOnce = false;
  const f = fixture({onSummary: () => {
    if (!failedOnce) {failedOnce = true; throw new Error('Simulated summary failure');}
  }});
  assert.throws(() => f.apply(), error => /Часть данных|не завершено/.test(error.message) && !/до записи/.test(error.message));
  assert.equal(f.state.rawWrites.flat().length, 1); assert.equal(f.state.cellWrites.length, 62);
  assert.deepEqual(f.state.summaries, ['2026-10']);
  const rawWrites = f.state.rawWrites.length; const factWrites = f.state.cellWrites.length;
  f.apply();
  assert.equal(f.state.rawWrites.length, rawWrites); assert.equal(f.state.cellWrites.length, factWrites);
  assert.deepEqual(f.state.summaries, ['2026-10', '2026-10']);
});
