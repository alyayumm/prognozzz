import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

const source = readFileSync(new URL('../apps-script/AppsScript.gs', import.meta.url), 'utf8');
const dictionaries = { users: { 1: 'Менеджер', 2: 'Системный' }, pipelines: {}, statuses: {} };
const config = { monthKey: '2026-10', monthYear: 2026, monthIndex: 9, managers: [], restrictManagers: false };
const globals = {
  Utilities: {
    formatDate: date => date.toISOString().slice(0, 10),
    parseDate: value => new Date(value.replace(' ', 'T') + '+03:00'),
  },
  Session: { getScriptTimeZone: () => 'Europe/Moscow' },
};
const api = runInNewContext(`${source}\n({ qualify: salesAmoIsQualified_, normalize: salesNormalizeAmoLead_, cached: salesAmoLeadFromCachedRecord_, record: amoCrmLeadRecord_, department: salesReadAmoDepartmentData_ });`, globals);
const yesFlag = [{ field_name: 'Квал Лид', values: [{ value: 'Да' }] }];
function lead(overrides = {}) {
  return { id: 1, pipeline_name: 'МСК АШ', status_name: 'Брифинг', status_id: 41892613,
    responsible_user_id: 1, created_at: Date.parse('2026-10-01T12:00:00Z') / 1000, ...overrides };
}
function record(overrides = {}) {
  return { leadId: '1', pipelineName: 'МСК АШ', statusId: '41892613', stageName: 'Брифинг', city: 'МСК',
    responsibleUserName: 'Менеджер', managerName: 'Менеджер', createdDate: '2026-10-01', isQualified: 'TRUE', ...overrides };
}

test('Dynamics excluded stages stay unqualified even with the Yes field', () => {
  for (const stage of ['Неразобранное', 'Звонки', 'Недозвоны', 'На проверку', 'В работе', 'ЯГ ЛИДЫ', 'Обзвон', 'Отложенный спрос', 'Иностранные права', '']) {
    assert.equal(api.qualify(stage, lead({ custom_fields_values: yesFlag })), false, stage);
  }
  assert.equal(api.qualify('Закрыто и не реализовано', lead({ status_id: 143, loss_reason_id: 23760226, custom_fields_values: yesFlag })), true);
  assert.equal(api.qualify('Закрыто и не реализовано', lead({ status_id: 143, loss_reason_id: 11249860, name: 'дорого' })), false);
});

test('Dynamics accepts all other stages and only its six exact loss reasons', () => {
  for (const stage of ['Брифинг', 'Недозвоны целевые', 'Назначить встречу', 'Новый этап встречи', 'Успешно реализовано']) {
    assert.equal(api.qualify(stage, lead()), true, stage);
  }
  for (const reason of ['Передумал учиться', 'Выбрали другую школу', 'Практика', 'Дорого', 'Хотят именно офлайн класс', 'Не выходит на связь ЦЕЛЕВОЙ']) {
    assert.equal(api.qualify(`Закрыто и не реализовано (${reason})`, lead({ status_id: 143 })), true, reason);
  }
  for (const id of [13957954, 19999678, 3421768, 3421771, 3421777]) {
    assert.equal(api.qualify('Закрыто и не реализовано', lead({ status_id: 143, loss_reason_id: id })), true, String(id));
  }
  assert.equal(api.qualify('Закрыто и не реализовано (Доп. Накат ЦЕЛЕВОЙ)', lead({ status_id: 143 })), false);
  assert.equal(api.qualify('Закрыто и не реализовано (Практика позже)', lead({ status_id: 143 })), false);
});

test('cached qualification is re-evaluated from the current stage and reason', () => {
  const normalized = api.normalize(api.cached(record({ stageName: 'На проверку', statusId: '73650530' })), dictionaries, config);
  assert.equal(normalized.isQualified, false);
  assert.equal(normalized.isOmQualified, false);
});

test('native CRM owner determines OM qualification for fresh and cached leads', () => {
  for (const owner of ['Технический', '  СИСТЕМНЫЙ  ']) {
    const fresh = api.normalize(lead({ responsible_user_name: owner }), dictionaries, config);
    const cached = api.normalize(api.cached(record({ responsibleUserName: owner, managerName: 'Менеджер' })), dictionaries, config);
    assert.equal(fresh.isQualified, true);
    assert.equal(fresh.isOmQualified, true);
    assert.equal(cached.isOmQualified, true);
  }
  assert.equal(api.normalize(lead({ responsible_user_id: 2 }), dictionaries, config).isOmQualified, true);
  const customOwner = [{ field_name: 'Ответственный', values: [{ value: 'Системный' }] }];
  assert.equal(api.normalize(lead({ custom_fields_values: customOwner }), dictionaries, config).isOmQualified, false);
});

test('embedded API loss reasons survive raw caching and qualify Practice', () => {
  const lossLead = lead({ status_name: 'Закрыто и не реализовано', status_id: 143, loss_reason_id: 999,
    _embedded: { loss_reason: [{ id: 999, name: 'Практика' }] } });
  const named = { ...dictionaries, pipelines: { 7: 'МСК АШ' }, statuses: { '7:143': 'Закрыто и не реализовано' } };
  const raw = api.record({ ...lossLead, pipeline_id: 7 }, named);
  assert.equal(raw.lossReasonName, 'Практика');
  assert.equal(api.normalize(api.cached(raw), dictionaries, config).isQualified, true);
});

test('CRM refresh requests loss reason names so classification also works for new reason IDs', () => {
  let requested;
  const fetchLeads = runInNewContext(`${source}
    fetchAmoCrmEndpoint_ = (path, params) => { inspectRequest(params); return { _embedded: { leads: [] } }; };
    fetchAmoCrmLeadsByDateField_;
  `, { ...globals, inspectRequest: params => { requested = params; } });
  fetchLeads('2026-10-01', '2026-10-26', 'created_at', '4535038', 80, []);
  assert.ok(requested.with.split(',').includes('loss_reason'));
});

test('department OP qualification excludes technical owners without treating them as refusals', () => {
  const leads = [record(), record({ leadId: '2', responsibleUserName: 'Системный', managerName: 'Системный' }),
    record({ leadId: '3', responsibleUserName: 'Технический', managerName: 'Технический' })].map(api.cached);
  const result = api.department(config, [], leads);
  assert.equal(result.daily[0].totalQualified, 1);
  assert.equal(result.byManager['Системный'].factQualified, 0);
  assert.equal(result.byManager['Технический'].refusalLeads, 0);
});

test('main import splits OP and OM once, preserves plans and keeps A+B sales counting', () => {
  let saved = [{ id: '2026-10-01-МСК-Город-Квалы', plan: 40, forecast: 44, recommendations: 2 }];
  const context = runInNewContext(`${source}\n({ sync: syncAmoCrmMainReportFacts_, id: dailyRecordId_ });`, {
    ...globals,
  });
  // Replace only persistence so normalization and aggregation run together.
  const sync = runInNewContext(`${source}
    readObjects_ = () => readSaved();
    upsertRowsById_ = (sheet, headers, rows) => { writeSaved(rows); return { updated: rows.length }; };
    rebuildWeeklySummary_ = () => {};
    syncAmoCrmMainReportFacts_;
  `, { ...globals, readSaved: () => saved, writeSaved: rows => { saved = rows; } });
  saved[0].id = context.id('2026-10-01', 'МСК', 'Квалы', 'Город');
  const records = [record(), record({ leadId: '2', responsibleUserName: 'Системный' }),
    record({ leadId: '3', responsibleUserName: 'Технический' }),
    record({ leadId: '4', stageName: 'На проверку', statusId: '73650530' }),
    record({ leadId: '5', createdDate: '2026-09-15', stageName: 'Успешно реализовано', statusId: '142', closedDate: '2026-10-01', closedAt: '2026-10-01 12:00:00', isWon: 'TRUE', category: 'А+В' })];
  for (let run = 0; run < 2; run++) {
    sync(records, '2026-10-01', '2026-10-01', []);
    const qualified = saved.find(row => row.metric === 'Квалы' && row.city === 'МСК');
    assert.equal(qualified.fact, 1);
    assert.equal(qualified.omQualified, 2);
    assert.equal(qualified.plan, 40);
    assert.equal(qualified.forecast, 44);
    assert.equal(qualified.recommendations, 2);
    assert.equal(saved.find(row => row.metric === 'Лиды' && row.city === 'МСК').fact, 4);
    assert.equal(saved.find(row => row.metric === 'Продажи' && row.city === 'МСК').fact, 2);
  }
});

test('all successful sales include ROP and technical owners, regardless of the creation month', () => {
  const records = [
    record({ leadId: 'rop', responsibleUserName: 'РОП', managerName: 'РОП', category: 'А+Б' }),
    record({ leadId: 'technical', responsibleUserName: 'Технический', managerName: 'Технический', category: 'A+B' }),
    record({ leadId: 'system', responsibleUserName: 'Системный', managerName: 'Системный', category: 'B' }),
  ].map(row => ({ ...row, createdDate: '2026-09-15', closedDate: '2026-10-01', closedAt: '2026-10-01 12:00:00', stageName: 'Успешно реализовано', statusId: '142', isWon: 'TRUE' }));
  const department = api.department(config, [], records.map(api.cached));
  assert.equal(department.daily[0].totalTraffic, 0);
  assert.equal(department.daily[0].totalDeals, 5);
  assert.equal(department.byManager['РОП'].factDeals, 2);
  assert.equal(department.byManager['Технический'].factDeals, 2);
  assert.equal(department.byManager['Системный'].factDeals, 1);

  let daily;
  const sync = runInNewContext(`${source}
    readObjects_ = () => [];
    upsertRowsById_ = (sheet, headers, rows) => { saveRows(rows); return { updated: rows.length }; };
    rebuildWeeklySummary_ = () => {};
    syncAmoCrmMainReportFacts_;
  `, { ...globals, saveRows: rows => { daily = rows; } });
  sync(records, '2026-10-01', '2026-10-01', []);
  assert.equal(daily.find(row => row.metric === 'Продажи' && row.city === 'МСК').fact, 5);
});
