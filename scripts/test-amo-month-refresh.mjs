import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

const main = readFileSync(new URL('../apps-script/AppsScript.gs', import.meta.url), 'utf8');
const month = readFileSync(new URL('../apps-script/AmoMonthRefresh.gs', import.meta.url), 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));
const now = '2026-11-11T09:00:00.000Z';
class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } }
const dictionary = { users: { 1: 'Менеджер', 2: 'Системный', 3: 'Технический', 10304986: 'РОП' },
  pipelines: { 4535038: 'МСК АШ', 4535035: 'СПБ АШ' },
  statuses: { '4535038:41892613': 'Брифинг', '4535038:142': 'Успешно реализовано', '4535035:41892613': 'Брифинг' } };
const lead = (id, instant, extra = {}) => ({ id, pipeline_id: 4535038, status_id: 41892613,
  responsible_user_id: 1, created_at: Date.parse(instant) / 1000, custom_fields_values: [], ...extra });
const legacy = (id, extra = {}) => ({ id: `amocrm-lead-${id}`, leadId: String(id), pipelineId: '4535038',
  pipelineName: 'МСК АШ', statusId: '41892613', stageName: 'Брифинг', city: 'МСК',
  responsibleUserId: '1', responsibleUserName: 'Менеджер', createdAt: '2026-10-01 09:00:00',
  createdDate: '2026-10-01', syncedAt: '2026-11-09T00:00:00Z', ...extra });
function formatDate(date, zone, pattern) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: zone === 'GMT' ? 'UTC' : zone,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .formatToParts(date).map(part => [part.type, part.value]));
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  return pattern === 'yyyy-MM-dd HH:mm:ss' ? `${day} ${parts.hour}:${parts.minute}:${parts.second}` : day;
}
function fixture(records = [], saved = [], incoming = [], http = { status: 200, body: '{}' }, dict = dictionary) {
  let raw = records; let daily = copy(saved); let fetches = 0; let dailyWrites = 0; let summaries = 0;
  const properties = new Map();
  const api = runInNewContext(`${main}\n${month}
    const originalPageReader = fetchAmoCrmLeadsByDateField_;
    amoMonthRefreshDictionaries_ = () => dict;
    fetchAmoCrmLeadsByDateField_ = (from,to,field,pipeline,max,warnings,options) => readLeads(from,to,field,pipeline,options);
    ensureAmoCrmRawLeadSheet_ = () => {};
    readAmoCrmRawLeadObjectsFast_ = () => amoMonthRefreshFilterCachedRecords_(readRaw());
    readObjects_ = () => readDaily();
    upsertRowsById_ = (sheet,headers,rows) => persist(sheet,rows);
    rebuildWeeklySummary_ = () => rebuilt();
    ({ refresh: syncAmoCrmMonth_, read: readAmoCrmRawLeadObjectsFast_, endpoint: fetchAmoCrmEndpoint_, pages: originalPageReader });`, {
    Date: FixedDate, dict,
    Utilities: { getUuid: () => '11111111-1111-4111-8111-111111111111', formatDate, parseDate: text => new Date(text.replace(' ', 'T') + '+03:00') },
    Session: { getScriptTimeZone: () => 'Europe/Moscow' },
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => properties.get(key) ?? null,
      setProperty: (key, value) => { properties.set(key, value); } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    UrlFetchApp: { fetch: () => ({ getResponseCode: () => http.status, getContentText: () => http.body }) },
    readRaw: () => raw, readDaily: () => daily, rebuilt: () => { summaries++; },
    readLeads: (from, to, field, pipeline, options) => {
      fetches++; assert.equal(field, 'created_at'); assert.equal(options.strictLeadList, true);
      if (typeof incoming === 'function') return incoming();
      return incoming.filter(item => String(item.pipeline_id) === pipeline
        && formatDate(new Date(item.created_at * 1000), 'Europe/Moscow', 'yyyy-MM-dd') >= from
        && formatDate(new Date(item.created_at * 1000), 'Europe/Moscow', 'yyyy-MM-dd') <= to);
    },
    persist: (sheet, rows) => {
      const target = sheet === 'AmoCRM_Raw_Leads' ? raw : daily;
      if (sheet !== 'AmoCRM_Raw_Leads') dailyWrites++;
      const byId = new Map(target.map(row => [row.id, row]));
      for (const row of rows) byId.set(row.id, row);
      if (sheet === 'AmoCRM_Raw_Leads') raw = [...byId.values()]; else daily = [...byId.values()];
      return { updated: rows.length };
    },
  });
  return { api, properties, daily: () => daily, raw: () => raw, append: row => { raw.push(row); },
    stats: () => ({ fetches, dailyWrites, summaries }) };
}
function begin(f) { return f.api.refresh({ phase: 'begin', monthKey: '2026-10' }); }
function fill(f, run) {
  for (let day = 1; day <= 31; day += 2) f.api.refresh({ phase: 'stage', runId: run.runId,
    fromDate: `2026-10-${String(day).padStart(2, '0')}`, toDate: `2026-10-${String(Math.min(day + 1, 31)).padStart(2, '0')}` });
}

test('begin rejects current/future/invalid months and incomplete finalization cannot write facts', () => {
  const f = fixture();
  for (const monthKey of ['2026-11', '2026-12', '2026-13']) assert.throws(() => f.api.refresh({ phase: 'begin', monthKey }));
  const run = begin(f);
  assert.throws(() => f.api.refresh({ phase: 'stage', runId: run.runId, fromDate: '2026-10-01', toDate: '2026-10-03' }), /два/);
  assert.throws(() => f.api.refresh({ phase: 'stage', runId: run.runId, fromDate: '2026-09-30', toDate: '2026-10-01' }), /внутри/);
  assert.throws(() => f.api.refresh({ phase: 'finalize', runId: run.runId }), /не полностью/);
  assert.equal(f.stats().dailyWrites, 0);
});

test('empty complete chunks are observed, status is safe, stage and final retries are idempotent', () => {
  const f = fixture(); const run = begin(f);
  const request = { phase: 'stage', runId: run.runId, fromDate: '2026-10-01', toDate: '2026-10-02' };
  const first = f.api.refresh(request);
  assert.equal(first.rows, 0); assert.equal(first.completedDays.length, 2);
  const calls = f.stats().fetches;
  assert.deepEqual(copy(f.api.refresh(request)), copy(first)); assert.equal(f.stats().fetches, calls);
  assert.equal(f.stats().dailyWrites, 0);
  fill(f, run);
  const status = f.api.refresh({ phase: 'status', runId: run.runId });
  assert.equal(status.completedDays.length, 31); assert.equal(status.isFinalized, false);
  assert.ok(Buffer.byteLength(f.properties.get(`AMOCRM_MONTH_REFRESH_RUN_${run.runId}`), 'utf8') < 9000);
  const result = f.api.refresh({ phase: 'finalize', runId: run.runId });
  const writes = f.stats().dailyWrites;
  assert.deepEqual(copy(f.api.refresh({ phase: 'finalize', runId: run.runId })), copy(result));
  assert.equal(f.stats().dailyWrites, writes); assert.equal(f.stats().summaries, 1);
  assert.equal(f.api.refresh({ phase: 'status', runId: run.runId }).isFinalized, true);
  assert.ok(Buffer.byteLength(f.properties.get(`AMOCRM_MONTH_REFRESH_RUN_${run.runId}`), 'utf8') < 9000);
});

test('native Moscow month snapshot preserves PS/plans/manual/November and filters stale absent rows permanently', () => {
  const oldSale = { id: '2026-10-31-МСК-Продажи', date: '2026-10-31', month: '2026-10', city: 'МСК',
    channel: 'Город', metric: 'Продажи', fact: 55, paidSales: 54, trafficSales: 99, plan: 30, forecast: 32, comment: 'PS', recommendations: 3 };
  const manual = { id: 'manual', date: '2026-10-01', city: 'МСК', channel: 'Ручная корректировка', metric: 'Квалы', fact: 4 };
  const november = { id: 'november', date: '2026-11-01', month: '2026-11', city: 'МСК', channel: 'Город', metric: 'Квалы', fact: 100 };
  const existingLead = { id: '2026-10-01-МСК-Лиды', date: '2026-10-01', month: '2026-10', city: 'МСК',
    channel: 'Город', metric: 'Лиды', fact: 99, plan: 30, forecast: 31, recommendations: 2, comment: 'memo' };
  const incoming = [lead(1, '2026-09-30T21:00:00Z', { custom_fields_values: [{ field_name: 'Дата создания', values: [{ value: '01.11.2026' }] }] }),
    lead(2, '2026-10-31T20:59:59Z', { status_id: 142, responsible_user_id: 10304986,
      custom_fields_values: [{ field_name: 'Категория', values: [{ value: 'А+Б' }] }] }),
    lead(3, '2026-10-15T12:00:00Z', { responsible_user_id: 3 })];
  const f = fixture([legacy(99)], [oldSale, manual, november, existingLead], incoming);
  const run = begin(f); fill(f, run);
  assert.equal(f.stats().dailyWrites, 0);
  const result = f.api.refresh({ phase: 'finalize', runId: run.runId });
  assert.deepEqual(copy(result.counts), { leads: 3, qualified: 2, omQualified: 1, trafficSales: 2 });
  assert.equal(f.daily().find(row => row.id === oldSale.id).trafficSales, 2);
  for (const key of ['fact', 'paidSales', 'plan', 'forecast', 'comment', 'recommendations']) assert.equal(f.daily().find(row => row.id === oldSale.id)[key], oldSale[key]);
  assert.deepEqual(copy(f.daily().find(row => row.id === manual.id)), manual);
  assert.deepEqual(copy(f.daily().find(row => row.id === november.id)), november);
  const currentLead = f.daily().find(row => row.id === existingLead.id);
  assert.equal(currentLead.fact, 1); assert.equal(currentLead.plan, 30); assert.equal(currentLead.recommendations, 2);
  assert.ok(currentLead.comment.includes('memo'));
  assert.equal(f.api.read().some(row => row.leadId === '99'), false);
  f.append(legacy(100, { syncedAt: '2026-11-11T10:00:00Z' }));
  assert.equal(f.api.read().some(row => row.leadId === '100'), true);
});

test('a failed complete-page fetch never confirms coverage or publishes a partial month', () => {
  const f = fixture([], [], () => { throw new Error('incomplete page'); });
  const run = begin(f);
  assert.throws(() => f.api.refresh({ phase: 'stage', runId: run.runId,
    fromDate: '2026-10-01', toDate: '2026-10-02' }), /incomplete/);
  const status = f.api.refresh({ phase: 'status', runId: run.runId });
  assert.equal(status.completedDays.length, 0); assert.equal(status.activeStage, null);
  assert.equal(f.raw().length, 0); assert.equal(f.stats().dailyWrites, 0);
});

test('cache recalculation rejects unfinished, incomplete, superseded and unconfirmed runs without writes or fetches', () => {
  const unfinished = fixture(); const pending = begin(unfinished);
  assert.throws(() => unfinished.api.refresh({ phase: 'recalculate', runId: pending.runId }), /завершён/);
  assert.equal(unfinished.stats().dailyWrites, 0);
  assert.equal(unfinished.stats().fetches, 0);
  for (const invalid of ['coverage', 'active', 'missingStamp', 'staleStamp']) {
    const f = fixture(); const run = begin(f); fill(f, run);
    f.api.refresh({ phase: 'finalize', runId: run.runId });
    const stats = f.stats();
    if (invalid === 'coverage') {
      const key = `AMOCRM_MONTH_REFRESH_RUN_${run.runId}`;
      const saved = JSON.parse(f.properties.get(key)); saved.completedDays.pop();
      f.properties.set(key, JSON.stringify(saved));
    } else if (invalid === 'active') {
      f.properties.set('AMOCRM_MONTH_REFRESH_ACTIVE_2026-10', 'another-run');
    } else if (invalid === 'missingStamp') {
      f.properties.delete('AMOCRM_CONFIRMED_MONTH_SNAPSHOTS');
    } else {
      f.properties.set('AMOCRM_CONFIRMED_MONTH_SNAPSHOTS', JSON.stringify({ '2026-10': '2026-11-11T10:00:00.000Z' }));
    }
    assert.throws(() => f.api.refresh({ phase: 'recalculate', runId: run.runId }), /полностью|последн|снимок/);
    assert.deepEqual(f.stats(), stats);
  }
});

test('cache recalculation reuses the latest complete snapshot without fetching and preserves PS, plans, manual and November', () => {
  const sale = { id: '2026-10-31-МСК-Продажи', date: '2026-10-31', month: '2026-10', city: 'МСК',
    channel: 'Город', metric: 'Продажи', fact: 55, paidSales: 54, trafficSales: 99,
    plan: 30, forecast: 32, comment: 'PS', recommendations: 3 };
  const manual = { id: 'manual', date: '2026-10-01', city: 'МСК', channel: 'Ручная корректировка', metric: 'Квалы', fact: 4 };
  const november = { id: 'november', date: '2026-11-01', month: '2026-11', city: 'МСК',
    channel: 'Город', metric: 'Квалы', fact: 100, omQualified: 10, plan: 200, forecast: 190, comment: 'November' };
  const qualified = { id: '2026-10-01-МСК-Квалы', date: '2026-10-01', month: '2026-10', city: 'МСК',
    channel: 'Город', metric: 'Квалы', fact: 0, omQualified: 1, plan: 30, forecast: 31, recommendations: 2, comment: 'memo' };
  const incoming = [lead(1, '2026-10-01T09:00:00Z', { responsible_user_id: 10304986 })];
  const f = fixture([legacy(99)], [sale, manual, november, qualified], incoming);
  const run = begin(f); fill(f, run);
  f.api.refresh({ phase: 'finalize', runId: run.runId });
  // Canonical rows can still carry the previous policy; only the confirmed raw cache is authoritative.
  Object.assign(f.daily().find(row => row.id === qualified.id), { fact: 0, omQualified: 1 });
  const stats = f.stats(); const rawBefore = copy(f.raw());
  const result = f.api.refresh({ phase: 'recalculate', runId: run.runId, monthKey: '2026-10' });
  assert.deepEqual(copy(result.counts), { leads: 1, qualified: 1, omQualified: 0, trafficSales: 0 });
  assert.equal(f.stats().fetches, stats.fetches);
  assert.deepEqual(copy(f.raw()), rawBefore);
  assert.equal(f.properties.get('AMOCRM_CONFIRMED_MONTH_SNAPSHOTS'), JSON.stringify({ '2026-10': run.startedAt }));
  const currentQualified = f.daily().find(row => row.id === qualified.id);
  assert.equal(currentQualified.fact, 1); assert.equal(currentQualified.omQualified, 0);
  for (const key of ['plan', 'forecast', 'recommendations', 'comment']) assert.equal(currentQualified[key], qualified[key]);
  const currentSale = f.daily().find(row => row.id === sale.id);
  for (const key of ['fact', 'paidSales', 'plan', 'forecast', 'comment', 'recommendations']) assert.equal(currentSale[key], sale[key]);
  assert.deepEqual(copy(f.daily().find(row => row.id === manual.id)), manual);
  assert.deepEqual(copy(f.daily().find(row => row.id === november.id)), november);
  assert.equal(f.api.read().some(row => row.leadId === '99'), false);
  const after = copy(f.daily());
  assert.deepEqual(copy(f.api.refresh({ phase: 'recalculate', runId: run.runId })), copy(result));
  assert.deepEqual(copy(f.daily()), after);
  const writes = f.stats().dailyWrites;
  assert.deepEqual(copy(f.api.refresh({ phase: 'finalize', runId: run.runId })), copy(result));
  assert.equal(f.stats().dailyWrites, writes);
});

test('a confirmed empty full snapshot can be recalculated without fetching', () => {
  const f = fixture(); const run = begin(f); fill(f, run);
  f.api.refresh({ phase: 'finalize', runId: run.runId });
  const fetches = f.stats().fetches;
  const result = f.api.refresh({ phase: 'recalculate', runId: run.runId });
  assert.deepEqual(copy(result.counts), { leads: 0, qualified: 0, omQualified: 0, trafficSales: 0 });
  assert.equal(f.stats().fetches, fetches);
});

test('strict monthly fetch accepts native HTTP204 empty but rejects malformed HTTP200 lists', () => {
  for (const [status, body, valid] of [[204, '', true], [200, '{"_embedded":{"leads":[]}}', true],
    [200, '{}', false], [200, 'invalid-json', false], [200, '{"_embedded":{"leads":{}}}', false]]) {
    const f = fixture([], [], [], { status, body });
    f.properties.set('AMOCRM_ACCESS_TOKEN', 'test-only');
    const read = () => f.api.endpoint('/api/v4/leads', {}, { strictLeadList: true });
    if (valid) assert.deepEqual(copy(read()._embedded.leads), []);
    else assert.throws(read, /некорректный ответ/);
  }
});

test('full import dictionaries reject a missing users list instead of losing Technical owner classification', () => {
  const read = runInNewContext(`${main}\n${month}
    fetchAmoCrmEndpoint_ = () => ({});
    amoMonthRefreshDictionaries_;`, {});
  assert.throws(read, /ответственных/);
});

test('stage requires both cities and a known status before it can certify any day', () => {
  for (const f of [fixture([], [], [], undefined, { ...dictionary, pipelines: { 4535038: 'МСК АШ' } }),
    fixture([], [], [lead(7, '2026-10-01T09:00:00Z', { status_id: 999 })]),
    fixture([], [], [lead(8, '2026-10-01T09:00:00Z', { responsible_user_id: 999 })])]) {
    const run = begin(f);
    assert.throws(() => f.api.refresh({ phase: 'stage', runId: run.runId,
      fromDate: '2026-10-01', toDate: '2026-10-02' }), /воронки|состав/);
    assert.equal(f.api.refresh({ phase: 'status', runId: run.runId }).completedDays.length, 0);
    assert.equal(f.raw().length, 0);
  }
});

test('strict empty pages cannot hide a next-page link and certify an incomplete chunk', () => {
  const f = fixture([], [], [], { status: 200, body: '{"_embedded":{"leads":[]},"_links":{"next":{"href":"next"}}}' });
  f.properties.set('AMOCRM_ACCESS_TOKEN', 'test-only');
  assert.throws(() => f.api.pages('2026-10-01', '2026-10-02', 'created_at', '4535038', 80, [], { strictLeadList: true }), /продолжение/);
});

test('strict nonempty pages reject malformed continuation markers instead of silently truncating', () => {
  for (const next of [{}, { href: '' }, false, 'next']) {
    const f = fixture([], [], [], { status: 200, body: JSON.stringify({ _embedded: { leads: [{ id: 1 }] }, _links: { next } }) });
    f.properties.set('AMOCRM_ACCESS_TOKEN', 'test-only');
    assert.throws(() => f.api.pages('2026-10-01', '2026-10-02', 'created_at', '4535038', 80, [], { strictLeadList: true }), /ссылка продолжения/);
  }
});

test('the new monthly endpoint authenticates every phase before invoking its handler or setting up sheets', () => {
  const directory = new URL('../apps-script/', import.meta.url);
  const all = readdirSync(directory).filter(name => name.endsWith('.gs')).map(name => readFileSync(new URL(name, directory), 'utf8')).join('\n');
  let calls = 0;
  const post = runInNewContext(`${all}
    verifyPassword_ = password => password === 'test-pass';
    ensureServiceSheets_ = () => { throw new Error('unexpected setup'); };
    syncAmoCrmMonth_ = payload => { called(); return {status: payload.phase}; };
    jsonResponse = value => value;
    doPost;`, { called: () => { calls++; } });
  for (const phase of ['begin', 'stage', 'status', 'finalize', 'recalculate']) {
    const result = post({ postData: { contents: JSON.stringify({ action: 'syncAmoCrmMonth', password: 'wrong', payload: { phase } }) } });
    assert.equal(result.ok, false); assert.match(result.error, /пароль/);
  }
  assert.equal(calls, 0);
  assert.equal(post({ postData: { contents: JSON.stringify({ action: 'syncAmoCrmMonth', password: 'test-pass', payload: { phase: 'status' } }) } }).ok, true);
  assert.equal(calls, 1);
});
