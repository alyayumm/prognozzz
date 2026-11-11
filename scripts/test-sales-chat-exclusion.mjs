import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

const source = readFileSync(new URL('../apps-script/AppsScript.gs', import.meta.url), 'utf8');
const config = { monthKey: '2026-11', monthYear: 2026, monthIndex: 10, managers: [], restrictManagers: false };
const dictionaries = { users: {}, pipelines: {}, statuses: {} };
const globals = {
  Utilities: { formatDate: date => date.toISOString().slice(0, 10) },
  Session: { getScriptTimeZone: () => 'Europe/Moscow' },
};
const api = runInNewContext(`${source}\n({
  normalize: salesNormalizeAmoLead_, cached: salesAmoLeadFromCachedRecord_,
  raw: amoCrmLeadRecord_, department: salesReadAmoDepartmentData_,
});`, globals);
const unix = date => Date.parse(date) / 1000;
function lead(overrides = {}) {
  return { id: 1, pipeline_id: 4535035, pipeline_name: 'СПБ АШ',
    status_id: 143, status_name: 'Закрыто и не реализовано',
    loss_reason_id: 23625702, responsible_user_name: 'Менеджер',
    created_at: unix('2026-11-02T12:00:00Z'), custom_fields_values: [], ...overrides };
}
function cachedRecord(overrides = {}) {
  return { leadId: '1', pipelineId: '4535035', pipelineName: 'СПБ АШ', city: 'СПБ',
    statusId: '143', stageName: 'Закрыто и не реализовано', lossReasonId: '23625702',
    responsibleUserName: 'Менеджер', managerName: 'Менеджер',
    createdAt: '2026-11-02 12:00:00', createdDate: '2026-11-02', ...overrides };
}

test('closed-lost Chat is excluded from both fresh and existing cached city traffic', () => {
  for (const item of [lead(), api.cached(cachedRecord())]) {
    const result = api.normalize(item, dictionaries, config);
    assert.equal(result.exclude, true);
    assert.equal(result.excludeReason, 'closedLostChat');
  }
});

test('Chat name is an exact fallback only when its reason ID is absent', () => {
  for (const item of [
    lead({ loss_reason_id: '', loss_reason: { name: '  ЧАТ  ' } }),
    lead({ loss_reason_id: '', status_name: 'Закрыто и не реализовано (Чат)' }),
    api.cached(cachedRecord({ lossReasonId: '', lossReasonName: 'Чат' })),
  ]) assert.equal(api.normalize(item, dictionaries, config).exclude, true);
  for (const item of [
    lead({ loss_reason_id: 999, loss_reason: { name: 'Чат' } }),
    lead({ loss_reason_id: '', loss_reason: { name: 'Чат целевой' } }),
    lead({ loss_reason_id: '', status_name: 'Закрыто и не реализовано (Чат позже)' }),
  ]) assert.notEqual(api.normalize(item, dictionaries, config).exclude, true);
});

test('a stale Chat reason does not exclude reopened or won leads', () => {
  for (const item of [
    lead({ status_id: 41892613, status_name: 'Брифинг' }),
    lead({ status_id: 142, status_name: 'Успешно реализовано' }),
    api.cached(cachedRecord({ statusId: '41892613', stageName: 'Брифинг', excludeReason: 'closedLostChat' })),
    api.cached(cachedRecord({ statusId: '142', stageName: 'Успешно реализовано', excludeReason: 'closedLostChat' })),
    api.cached(cachedRecord({ statusId: '41892613', stageName: 'Брифинг', city: '', excludeReason: 'closedLostChat' })),
  ]) {
    const result = api.normalize(item, dictionaries, config);
    assert.notEqual(result.exclude, true);
    assert.equal(result.isQualified, true);
    assert.notEqual(result.excludeReason, 'closedLostChat');
  }
});

test('separate message pipelines, city message types and missing cities stay excluded', () => {
  const messages = lead({ pipeline_name: 'АШ Сообщения' });
  const typed = lead({ custom_fields_values: [{ field_name: 'Тип лида', values: [{ value: 'Сообщение' }] }] });
  assert.equal(api.normalize(messages, dictionaries, config).excludeReason, 'messagesPipeline');
  assert.equal(api.normalize(typed, dictionaries, config).excludeReason, 'closedLostChat');
  assert.equal(api.normalize(lead({ pipeline_name: 'Неизвестная воронка' }), dictionaries, config).excludeReason, 'noCity');
  const cached = api.cached(cachedRecord({ excludeReason: 'messagesType' }));
  assert.equal(api.normalize(cached, dictionaries, config).excludeReason, 'closedLostChat');
});

test('won message lead types stay excluded from qualification in fresh and previously admitted cache rows', () => {
  const typed = lead({status_id: 142, status_name: 'Успешно реализовано', loss_reason_id: '',
    custom_fields_values: [{field_name: 'Тип лида', values: [{value: 'Сообщение'}]}]});
  const cached = api.cached(cachedRecord({statusId: '142', stageName: 'Успешно реализовано',
    lossReasonId: '', typeLabel: 'Сообщение', excludeReason: '', isQualified: 'TRUE'}));
  for (const candidate of [typed, cached]) {
    assert.equal(api.normalize(candidate, dictionaries, config).excludeReason, 'messagesType');
  }
});

test('Chat exclusion survives raw caching and removes leads in both main and sales-department reports', () => {
  const named = { users: {}, pipelines: { 4535035: 'СПБ АШ' }, statuses: { '4535035:143': 'Закрыто и не реализовано' } };
  const rawChat = api.raw(lead(), named);
  assert.equal(rawChat.excludeReason, 'closedLostChat');
  assert.equal(rawChat.city, 'СПБ');
  const regular = cachedRecord({ leadId: '2', statusId: '41892613', stageName: 'Брифинг', lossReasonId: '' });
  const won = cachedRecord({ leadId: '3', statusId: '142', stageName: 'Успешно реализовано',
    lossReasonId: '', closedAt: '2026-11-04 12:00:00', closedDate: '2026-11-04', category: 'A+B' });
  const records = [rawChat, regular, won];
  const department = api.department(config, [], records.map(api.cached));
  assert.equal(department.daily[1].totalTraffic, 2);
  assert.equal(department.daily[1].totalQualified, 2);
  assert.equal(department.daily[3].totalDeals, 2);
  let saved;
  const sync = runInNewContext(`${source}
    readObjects_ = () => [];
    upsertRowsById_ = (sheet, headers, rows) => { saveRows(rows); return { updated: rows.length }; };
    rebuildWeeklySummary_ = () => {};
    syncAmoCrmMainReportFacts_;
  `, { ...globals, saveRows: rows => { saved = rows; } });
  sync(records, '2026-11-02', '2026-11-04', []);
  assert.equal(saved.find(row => row.date === '2026-11-02' && row.city === 'СПБ' && row.metric === 'Лиды').fact, 2);
  assert.equal(saved.find(row => row.date === '2026-11-02' && row.city === 'СПБ' && row.metric === 'Квалы').fact, 2);
});
