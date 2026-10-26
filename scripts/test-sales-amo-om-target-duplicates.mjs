import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../apps-script/AppsScript.gs', import.meta.url), 'utf8');
const globals = {
  Utilities: { formatDate: date => date.toISOString().slice(0, 10) },
  Session: { getScriptTimeZone: () => 'Europe/Moscow' },
};
const dictionaries = { users: { 1: 'Менеджер', 2: 'Системный' }, pipelines: {}, statuses: {} };
const config = { monthKey: '2026-10', monthYear: 2026, monthIndex: 9, managers: [], restrictManagers: false };
const api = runInNewContext(`${source}\n({ normalize: salesNormalizeAmoLead_, cached: salesAmoLeadFromCachedRecord_, department: salesReadAmoDepartmentData_ });`, globals);

function fresh(overrides = {}) {
  return {
    id: 1, pipeline_name: 'МСК АШ', status_name: 'Закрыто и не реализовано', status_id: 143,
    responsible_user_id: 1, created_at: Date.parse('2026-10-04T12:00:00Z') / 1000,
    loss_reason_id: 23760226, loss_reason: { name: 'дубль целевой' }, ...overrides,
  };
}

function cached(overrides = {}) {
  return {
    leadId: '1', pipelineName: 'МСК АШ', stageName: 'Закрыто и не реализовано', statusId: '143',
    city: 'МСК', responsibleUserName: 'Менеджер', managerName: 'Менеджер',
    createdDate: '2026-10-04', closedDate: '2026-10-26', isQualified: '',
    lossReasonId: '23760226', lossReasonName: 'дубль целевой', ...overrides,
  };
}

test('target duplicate reason 23760226 belongs to OM for every native owner', () => {
  for (const owner of ['Менеджер', 'РОП', 'Технический', 'Системный']) {
    for (const lead of [fresh({ responsible_user_name: owner }),
      api.cached(cached({ responsibleUserName: owner, managerName: owner }))]) {
      const actual = api.normalize(lead, dictionaries, config);
      assert.equal(actual.isQualified, true, `${owner}: target qualification`);
      assert.equal(actual.isOmQualified, true, `${owner}: OM only`);
      assert.equal(actual.isNotQualifiedYet, false);
      assert.equal(actual.createdDate, '2026-10-04');
    }
  }
});

test('target duplicate ID works without a cached name and overrides renamed reason labels', () => {
  for (const name of ['', 'Дубли целевые', 'Дубль ЦЕЛЕВОЙ']) {
    const actual = api.normalize(api.cached(cached({ lossReasonName: name })), dictionaries, config);
    assert.equal(actual.isQualified, true);
    assert.equal(actual.isOmQualified, true);
  }
});

test('exact target duplicate names are used only when the reason ID is missing', () => {
  for (const lead of [fresh({ loss_reason_id: '', loss_reason: { name: 'Дубль ЦЕЛЕВОЙ' } }),
    api.cached(cached({ lossReasonId: '', lossReasonName: 'Дубль ЦЕЛЕВОЙ' }))]) {
    const actual = api.normalize(lead, dictionaries, config);
    assert.equal(actual.isQualified, true);
    assert.equal(actual.isOmQualified, true);
  }
  for (const reason of ['Дубль', 'Дубль ЦЕЛЕВОЙ позже', 'Дубли целевые']) {
    const actual = api.normalize(fresh({ loss_reason_id: '', loss_reason: { name: reason } }), dictionaries, config);
    assert.equal(actual.isQualified, false, reason);
  }
  const wrongId = api.normalize(fresh({ loss_reason_id: 11249860,
    loss_reason: { name: 'Дубль ЦЕЛЕВОЙ' } }), dictionaries, config);
  assert.equal(wrongId.isQualified, false);
  assert.equal(wrongId.isOmQualified, false);
});

test('the five target refusal reasons on native ROP 10304986 qualify only for OM', () => {
  for (const reason of [13957954, 19999678, 3421768, 3421771, 3421777]) {
    for (const lead of [fresh({ responsible_user_id: 10304986, responsible_user_name: 'РОП',
      loss_reason_id: reason, loss_reason: null }),
    api.cached(cached({ responsibleUserId: '10304986', responsibleUserName: 'РОП',
      lossReasonId: String(reason), lossReasonName: '' }))]) {
      const actual = api.normalize(lead, dictionaries, config);
      assert.equal(actual.isQualified, true, String(reason));
      assert.equal(actual.isOmQualified, true, String(reason));
    }
    const regular = api.normalize(fresh({ loss_reason_id: reason, loss_reason: null }), dictionaries, config);
    assert.equal(regular.isQualified, true);
    assert.equal(regular.isOmQualified, false);
  }
});

test('ROP target-refusal exception uses the native owner and leaves other ROP stages as OP', () => {
  const customOwner = [{ field_name: 'Ответственный', values: [{ value: 'РОП' }] }];
  const regular = api.normalize(fresh({ loss_reason_id: 3421768, loss_reason: { name: 'Дорого' },
    custom_fields_values: customOwner }), dictionaries, config);
  assert.equal(regular.isOmQualified, false);
  const rop = api.normalize(fresh({ responsible_user_id: 10304986, status_id: 41892613,
    status_name: 'Брифинг', loss_reason_id: 3421768, loss_reason: null }), dictionaries, config);
  assert.equal(rop.isQualified, true);
  assert.equal(rop.isOmQualified, false);
  const otherRefusal = api.normalize(fresh({ responsible_user_id: 10304986,
    loss_reason_id: 11249860, loss_reason: { name: 'Дубль' } }), dictionaries, config);
  assert.equal(otherRefusal.isQualified, false);
  assert.equal(otherRefusal.isOmQualified, false);
  const practice = api.normalize(fresh({ responsible_user_id: 10304986,
    loss_reason_id: 999, loss_reason: { name: 'Практика' } }), dictionaries, config);
  assert.equal(practice.isQualified, true);
  assert.equal(practice.isOmQualified, false);
  const oldRop = api.normalize(api.cached(cached({ responsibleUserId: '10304986',
    lossReasonId: '', lossReasonName: 'Дорого' })), dictionaries, config);
  assert.equal(oldRop.isQualified, true);
  assert.equal(oldRop.isOmQualified, true);
});

test('other duplicate reasons and inactive target-duplicate reasons do not gain qualification', () => {
  for (const owner of ['Менеджер', 'Технический']) {
    const actual = api.normalize(fresh({ responsible_user_name: owner,
      loss_reason_id: 11249860, loss_reason: { name: 'Дубль' } }), dictionaries, config);
    assert.equal(actual.isQualified, false);
    assert.equal(actual.isOmQualified, false);
  }
  const reopened = api.normalize(fresh({ status_id: 73650530, status_name: 'На проверку' }), dictionaries, config);
  assert.equal(reopened.isQualified, false);
  assert.equal(reopened.isOmQualified, false);
  const staleStage = api.normalize(fresh({ status_id: 142,
    responsible_user_id: 10304986 }), dictionaries, config);
  assert.equal(staleStage.isOmQualified, false);
});

test('target duplicates keep city and message qualification exclusions', () => {
  for (const lead of [fresh({ pipeline_name: 'Сообщения' }),
    fresh({ pipeline_name: 'Другая воронка' }),
    fresh({ custom_fields_values: [{ field_name: 'Тип лида', values: [{ value: 'Сообщение' }] }] }),
    api.cached(cached({ excludeReason: 'messagesType' }))]) {
    assert.equal(api.normalize(lead, dictionaries, config).exclude, true);
  }
});

test('department OP excludes target duplicates without marking them as refusals', () => {
  const records = [cached(), cached({ leadId: '2', lossReasonId: '11249860', lossReasonName: 'Дубль' }),
    cached({ leadId: '3', stageName: 'Брифинг', statusId: '41892613', lossReasonId: '', lossReasonName: '' })];
  const result = api.department(config, [], records.map(api.cached));
  assert.equal(result.daily[3].totalTraffic, 3);
  assert.equal(result.daily[3].totalQualified, 1);
  assert.equal(result.byManager['Менеджер'].factQualified, 1);
  assert.equal(result.byManager['Менеджер'].refusalLeads, 1);
});

test('department target duplicates and ROP target refusals produce zero OP qualification', () => {
  const leads = [cached(), cached({ leadId: '2', responsibleUserId: '10304986', responsibleUserName: 'РОП',
    managerName: 'РОП', lossReasonId: '3421768', lossReasonName: 'Дорого' })].map(api.cached);
  const result = api.department(config, [], leads);
  assert.equal(result.daily[3].totalQualified, 0);
  assert.equal(result.byManager['Менеджер'].factQualified, 0);
  assert.equal(result.byManager['Менеджер'].refusalLeads, 0);
  assert.equal(result.byManager['РОП'].factQualified, 0);
  assert.equal(result.byManager['РОП'].refusalLeads, 0);
});

test('main report adds target duplicates to OM on creation day and keeps the OP plan', () => {
  let saved;
  const sync = runInNewContext(`${source}
    readObjects_ = () => [{ id: dailyRecordId_('2026-10-04', 'МСК', 'Квалы', 'Город'), plan: 40 }];
    upsertRowsById_ = (sheet, headers, rows) => { saveRows(rows); return { updated: rows.length }; };
    rebuildWeeklySummary_ = () => {};
    syncAmoCrmMainReportFacts_;
  `, { ...globals, saveRows: rows => { saved = rows; } });
  const rows = [cached(), cached({ leadId: '2', responsibleUserName: 'Системный', managerName: 'Системный' }),
    cached({ leadId: '3', stageName: 'Брифинг', statusId: '41892613', lossReasonId: '', lossReasonName: '' }),
    cached({ leadId: '4', createdDate: '2026-09-30' }),
    cached({ leadId: '5', responsibleUserId: '10304986', responsibleUserName: 'РОП',
      lossReasonId: '3421768', lossReasonName: 'Дорого' })];
  sync(rows, '2026-10-04', '2026-10-04', []);
  const actual = saved.find(row => row.metric === 'Квалы' && row.city === 'МСК');
  assert.equal(actual.fact, 1);
  assert.equal(actual.omQualified, 3);
  assert.equal(actual.plan, 40);
  assert.equal(saved.find(row => row.metric === 'Лиды' && row.city === 'МСК').fact, 4);
  assert.equal(saved.find(row => row.metric === 'Продажи' && row.city === 'МСК').fact, 0);
});
