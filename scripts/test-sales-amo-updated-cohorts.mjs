import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

const source = readFileSync(new URL('../apps-script/AppsScript.gs', import.meta.url), 'utf8');
const traffic = readFileSync(new URL('../apps-script/AmoTrafficSales.gs', import.meta.url), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const unix = value => Date.parse(value) / 1000;
const dictionaries = {
  pipelines: { 4535038: 'МСК АШ', 4535035: 'СПБ АШ', 9: 'АШ Сообщения' },
  users: { 1: 'Менеджер' },
  statuses: { '4535038:142': 'Успешно реализовано', '4535038:143': 'Закрыто и не реализовано', '4535038:41892613': 'Брифинг' },
};
const globals = {
  Session: { getScriptTimeZone: () => 'Europe/Moscow' },
  Utilities: {
    formatDate: date => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(date),
    parseDate: value => new Date(value.replace(' ', 'T') + '+03:00'),
  },
};

test('updated native deals are included once even when creation and closing are outside the refresh period', () => {
  const calls = [];
  const reopened = { id: 1, status_id: 41892613, pipeline_id: 4535038,
    created_at: unix('2026-10-31T10:00:00Z'), closed_at: 0, updated_at: unix('2026-11-05T10:00:00Z') };
  const fetch = runInNewContext(`${source}
    fetchAmoCrmLeadsByDateField_ = (from, to, field, pipeline, maxPages) => readRows(from, to, field, pipeline, maxPages);
    salesFetchAmoLeadsForDateRange_;
  `, {
    ...globals,
    readRows: (from, to, field, pipeline, maxPages) => {
      calls.push({ from, to, field, pipeline, maxPages });
      return pipeline === '4535038' && field === 'updated_at' ? [reopened, reopened] : [];
    },
  });
  const result = fetch('2026-11-05', '2026-11-05', [], dictionaries);
  assert.equal(result.length, 1);
  assert.equal(result[0].closed_at, 0);
  assert.equal(result[0].status_id, 41892613);
  assert.deepEqual(calls.filter(call => call.field === 'updated_at').map(call => call.pipeline).sort(), ['4535035', '4535038']);
  assert.ok(calls.every(call => call.from === '2026-11-05' && call.to === '2026-11-05' && call.maxPages === 80));
});

for (const status of [143, 41892613]) test(`November refresh removes reopened status ${status} from an October arrival cohort`, () => {
  const id = '2026-10-31-МСК-Продажи';
  let daily = [{ id, date: '2026-10-31', month: '2026-10', city: 'МСК', channel: 'Город', metric: 'Продажи',
    fact: 4, paidSales: 4, trafficSales: 2, plan: 30, forecast: 31, recommendations: 0, comment: 'ПС' }];
  let cache = [{ id: 'amocrm-lead-1', leadId: '1', pipelineId: '4535038', pipelineName: 'МСК АШ', city: 'МСК',
    statusId: '142', statusName: 'Успешно реализовано', createdDate: '2026-10-31', createdAt: '2026-10-31T10:00:00Z', category: 'A+B' }];
  const reopened = { id: 1, pipeline_id: 4535038, status_id: status, responsible_user_id: 1,
    created_at: unix('2026-10-31T10:00:00Z'), closed_at: 0, updated_at: unix('2026-11-05T10:00:00Z'),
    custom_fields_values: [{ field_name: 'Категория', values: [{ value: 'A+B' }] }] };
  const sync = runInNewContext(`${source}\n${traffic}
    ensureAmoCrmRawLeadSheet_ = () => {};
    readMainPsSalesSnapshot_ = () => ({source: 'PS'});
    salesFetchAmoDictionaries_ = () => dict;
    fetchAmoCrmLeadsByDateField_ = (from, to, field, pipeline) => pipeline === '4535038' && field === 'updated_at' ? [fresh] : [];
    readObjects_ = () => readDaily();
    readAmoCrmRawLeadObjectsFast_ = () => readCache();
    upsertRowsById_ = (sheet, headers, rows) => persist(sheet, rows);
    rebuildWeeklySummary_ = () => {};
    syncMainPsSales_ = () => ({updated: 0, sales: {count: 0}, months: [], warnings: []});
    logAmoCrmSync_ = () => {};
    syncAmoCrmLeads_;
  `, {
    ...globals, dict: dictionaries, fresh: reopened,
    readDaily: () => daily, readCache: () => cache,
    persist: (sheet, rows) => {
      if (sheet === 'AmoCRM_Raw_Leads') cache = plain(rows);
      else if (sheet === 'Data_Daily') {
        const byId = new Map(daily.map(row => [row.id, row]));
        for (const row of plain(rows)) byId.set(row.id, row);
        daily = [...byId.values()];
      } else throw new Error(`Unexpected sheet ${sheet}`);
      return { updated: rows.length };
    },
  });
  sync({ fromDate: '2026-11-05', toDate: '2026-11-05' });
  const previousCohort = daily.find(row => row.id === id);
  assert.equal(previousCohort.trafficSales, 0);
  assert.equal(previousCohort.paidSales, 4);
  assert.equal(previousCohort.fact, 4);
  assert.equal(previousCohort.plan, 30);
  assert.equal(previousCohort.forecast, 31);
  assert.equal(String(cache[0].statusId), String(status));
});

test('a failed updated-date fetch aborts before raw cache or main report writes', () => {
  let writes = 0;
  const sync = runInNewContext(`${source}
    readMainPsSalesSnapshot_ = () => ({source: 'PS'});
    ensureAmoCrmRawLeadSheet_ = () => {};
    salesFetchAmoDictionaries_ = () => dict;
    fetchAmoCrmLeadsByDateField_ = (from, to, field) => {
      if (field === 'updated_at') throw new Error('incomplete updated page 503');
      return [{id: 1}];
    };
    upsertRowsById_ = () => write();
    syncAmoCrmLeads_;
  `, { ...globals, dict: dictionaries, write: () => { writes++; throw new Error('must not write'); } });
  assert.throws(() => sync({ fromDate: '2026-11-05', toDate: '2026-11-05' }), /incomplete updated page 503/);
  assert.equal(writes, 0);
});

test('updated-date pagination uses inclusive Moscow midnight boundaries and rejects an incomplete page', () => {
  const requests = [];
  const read = runInNewContext(`${source}
    fetchAmoCrmEndpoint_ = (path, params) => inspect(params);
    fetchAmoCrmLeadsByDateField_;
  `, { ...globals, inspect: params => {
    requests.push(plain(params));
    if (params.page === 1) return { _embedded: { leads: [{id: 1}] }, _links: {next: {href: 'next'}} };
    throw new Error('HTTP 503');
  } });
  assert.throws(() => read('2026-11-05', '2026-11-05', 'updated_at', '4535038', 80, []), /503/);
  assert.equal(requests[0]['filter[updated_at][from]'], unix('2026-11-04T21:00:00Z'));
  assert.equal(requests[0]['filter[updated_at][to]'], unix('2026-11-05T20:59:59Z'));
  assert.equal(requests[0]['filter[pipeline_id]'], '4535038');
  assert.equal(requests[0].with, 'loss_reason');
  assert.equal(requests.length, 2);
});
