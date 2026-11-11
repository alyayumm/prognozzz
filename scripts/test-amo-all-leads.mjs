import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

const main = readFileSync(new URL('../apps-script/AppsScript.gs', import.meta.url), 'utf8');
const traffic = readFileSync(new URL('../apps-script/AmoTrafficSales.gs', import.meta.url), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const unix = iso => Date.parse(iso) / 1000;
const field = (field_name, value) => ({ field_name, values: [{ value }] });
const config = { monthKey: '2026-10', monthYear: 2026, monthIndex: 9, managers: [], restrictManagers: false };
const dictionaries = {
  users: { 1: 'Менеджер', 10549050: 'Багранская', 12326414: 'Егорова' },
  pipelines: { 4535038: 'МСК АШ', 4535035: 'СПБ АШ', 9: 'АШ Сообщения' },
  statuses: { '4535038:41892613': 'Брифинг', '4535035:41892613': 'Брифинг',
    '4535038:142': 'Успешно реализовано', '4535038:143': 'Закрыто и не реализовано' },
};
const globals = {
  Session: { getScriptTimeZone: () => 'Europe/Moscow' },
  Utilities: { formatDate: (date, zone, pattern) => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone: zone === 'GMT' ? 'UTC' : zone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(date).map(part => [part.type, part.value]));
    const day = `${parts.year}-${parts.month}-${parts.day}`;
    return pattern === 'yyyy-MM-dd HH:mm:ss' ? `${day} ${parts.hour}:${parts.minute}:${parts.second}` : day;
  } },
};
function fresh(overrides = {}) {
  return { id: 1, pipeline_id: 4535038, pipeline_name: 'МСК АШ', status_id: 41892613,
    status_name: 'Брифинг', responsible_user_id: 1, responsible_user_name: 'Менеджер',
    created_at: unix('2026-10-01T12:00:00Z'), custom_fields_values: [], ...overrides };
}
function raw(id, overrides = {}) {
  return { leadId: String(id), pipelineId: '4535038', pipelineName: 'МСК АШ', city: 'МСК',
    statusId: '41892613', stageName: 'Брифинг', responsibleUserId: '1',
    responsibleUserName: 'Менеджер', managerName: 'Менеджер', createdDate: '2026-10-01',
    createdAt: '2026-10-01 12:00:00', updatedAt: '2026-11-09 12:00:00',
    source: 'Яндекс Директ', ...overrides };
}
function fixture(cache = [], existing = []) {
  let saved = existing;
  const api = runInNewContext(`${main}\n${traffic}
    readObjects_ = () => readSaved();
    readAmoCrmRawLeadObjectsFast_ = () => cache;
    upsertRowsById_ = (sheet, headers, rows) => { writeSaved(rows); return {updated: rows.length}; };
    rebuildWeeklySummary_ = () => {};
    ({ leadFacts: (...args) => salesAmoLeadFacts_(...args), normalize: salesNormalizeAmoLead_,
       cached: salesAmoLeadFromCachedRecord_, record: amoCrmLeadRecord_,
       counts: (...args) => salesAmoTrafficCounts_(...args), sync: syncAmoCrmMainReportFacts_,
       department: salesReadAmoDepartmentData_, snapshot: readMainAmoTrafficSalesSnapshot_, sum: sum_ });`, {
    ...globals, cache, readSaved: () => saved, writeSaved: rows => { saved = plain(rows); },
  });
  return { api, saved: () => saved };
}

test('all-lead facts include every stage, native owner, source and city lead type independently of qualification', () => {
  const { api } = fixture();
  for (const stage of ['Брифинг', 'На проверку', 'Неразобранное', 'Недозвоны', 'Отложенный спрос',
    'Иностранные права', 'Закрыто и не реализовано', '']) {
    for (const owner of ['Менеджер', 'РОП', 'Технический', 'Системный']) {
      for (const type of ['Звонок', 'Заявка', 'Сообщение', '']) {
        const item = fresh({ status_name: stage, responsible_user_name: owner,
          source_name: 'РЕК/КЭШБЕК', custom_fields_values: [field('Тип лида', type)] });
        const named = { ...dictionaries, users: { ...dictionaries.users, 1: owner },
          statuses: { ...dictionaries.statuses, '4535038:41892613': stage } };
        for (const version of [item, api.cached(api.record(item, named))]) {
          const fact = api.leadFacts(version, dictionaries, config);
          assert.ok(fact, `${stage}/${owner}/${type}`);
          assert.equal(fact.city, 'МСК');
          assert.equal(fact.createdDate, '2026-10-01');
          assert.equal(fact.createdInMonth, true);
          assert.equal(fact.leadType, type === 'Звонок' ? 'call' : 'application');
        }
      }
    }
  }
});

test('only the two native owner IDs exclude leads; names and custom owners cannot change that decision', () => {
  const { api } = fixture();
  for (const id of [10549050, 12326414]) {
    for (const owner of ['Менеджер', 'Системный', 'Технический', '']) {
      const item = fresh({ responsible_user_id: id, responsible_user_name: owner,
        custom_fields_values: [field('Ответственный', 'Менеджер')] });
      for (const version of [item, api.cached(api.record(item, dictionaries))]) {
        assert.equal(api.leadFacts(version, dictionaries, config), null, `${id}/${owner}`);
        assert.equal(api.normalize(version, dictionaries, config).isQualified, true,
          'lead-only owner exclusions must not change qualification');
      }
    }
  }
  for (const name of ['Багранская', 'Егорова']) {
    assert.ok(api.leadFacts(fresh({ responsible_user_id: 1, responsible_user_name: name }), dictionaries, config));
    assert.ok(api.leadFacts(fresh({ custom_fields_values: [field('Ответственный', name)] }), dictionaries, config));
  }
});

test('Chat exclusion requires native closed-lost status and exact reason ID or a missing-ID exact name fallback', () => {
  const { api } = fixture();
  const excluded = [
    fresh({ status_id: 143, status_name: 'Закрыто и не реализовано', loss_reason_id: 23625702 }),
    fresh({ status_id: 143, status_name: 'Закрыто и не реализовано', loss_reason: { name: '  ЧАТ  ' } }),
  ];
  const included = [
    fresh({ status_id: 41892613, loss_reason_id: 23625702 }),
    fresh({ status_id: 142, status_name: 'Успешно реализовано', loss_reason_id: 23625702 }),
    fresh({ status_id: 143, loss_reason_id: 999, loss_reason: { name: 'Чат' } }),
    fresh({ status_id: 143, loss_reason: { name: 'Чат целевой' } }),
    fresh({ status_id: 143, status_name: 'Закрыто и не реализовано (Чат позже)' }),
  ];
  for (const item of excluded) for (const version of [item, api.cached(api.record(item, dictionaries))]) {
    assert.equal(api.leadFacts(version, dictionaries, config), null,
      JSON.stringify({ item, cached: version.cachedNormalized }));
  }
  for (const version of [fresh({ status_id: 143, status_name: 'Закрыто и не реализовано (Чат)' }),
    api.cached(raw('legacy-chat', { statusId: '143', stageName: 'Закрыто и не реализовано (Чат)' }))]) {
    assert.equal(api.leadFacts(version, dictionaries, config), null,
      'legacy stage suffix is an exact fallback when separate reason fields are absent');
  }
  for (const item of included) for (const version of [item, api.cached(api.record(item, dictionaries))]) {
    assert.ok(api.leadFacts(version, dictionaries, config));
  }
  for (const cached of [
    raw('legacy-chat-name', { statusId: '', stageName: 'Закрыто и не реализовано', lossReasonName: 'Чат' }),
    raw('legacy-chat-stage', { statusId: '', stageName: 'Закрыто и не реализовано (Чат)' }),
  ]) assert.equal(api.leadFacts(api.cached(cached), dictionaries, config), null);
  for (const statusId of ['41892613', '142']) {
    const reopened = raw('reopened', { statusId, stageName: 'Закрыто и не реализовано (Чат)',
      lossReasonId: '23625702', lossReasonName: 'Чат', excludeReason: 'closedLostChat' });
    assert.ok(api.leadFacts(api.cached(reopened), dictionaries, config));
  }
});

test('city pipelines include message types while the separate messages and unknown pipelines stay excluded', () => {
  const { api } = fixture();
  for (const [pipelineId, pipeline, city] of [[4535038, 'МСК АШ', 'МСК'], [4535035, 'СПБ АШ', 'СПБ']]) {
    const item = fresh({ pipeline_id: pipelineId, pipeline_name: pipeline,
      custom_fields_values: [field('Тип лида', 'Сообщение')] });
    const cached = api.record(item, dictionaries);
    cached.city = ''; cached.excludeReason = 'messagesType';
    for (const version of [item, api.cached(cached)]) {
      assert.equal(api.leadFacts(version, dictionaries, config).city, city);
      assert.equal(api.normalize(version, dictionaries, config).exclude, true);
    }
  }
  for (const item of [fresh({ pipeline_id: 9, pipeline_name: 'АШ Сообщения' }),
    fresh({ pipeline_id: 10, pipeline_name: 'Другая воронка' })]) {
    assert.equal(api.leadFacts(item, dictionaries, config), null);
    const cached = api.record(item, dictionaries);
    cached.city = 'МСК';
    assert.equal(api.leadFacts(api.cached(cached), dictionaries, config), null,
      'stale cached city cannot turn another pipeline into city leads');
  }
});

test('native Moscow creation overrides custom and stale cached cohorts for leads and qualification', () => {
  const { api } = fixture();
  const custom = fresh({ created_at: unix('2026-09-15T12:00:00Z'),
    updated_at: unix('2026-10-12T12:00:00Z'), closed_at: unix('2026-10-20T12:00:00Z'),
    custom_fields_values: [field('Дата создания', '03.10.2026')] });
  for (const version of [custom, api.cached(api.record(custom, dictionaries))]) {
    assert.equal(api.leadFacts(version, dictionaries, config).createdDate, '2026-09-15');
    assert.equal(api.leadFacts(version, dictionaries, config).createdInMonth, false);
    assert.equal(api.normalize(version, dictionaries, config).createdDate, '2026-09-15');
  }
  assert.equal(api.record(custom, dictionaries).createdDate, '2026-09-15');
  const stale = api.cached(raw('stale', { createdDate: '2026-09-15' }));
  stale.cachedNormalized.createdDate = '2026-09-15';
  assert.equal(api.normalize(stale, dictionaries, config).createdDate, '2026-10-01');
  assert.equal(api.leadFacts(stale, dictionaries, config).createdDate, '2026-10-01');
  for (const [instant, date, inside] of [
    ['2026-09-30T20:59:59Z', '2026-09-30', false],
    ['2026-09-30T21:00:00Z', '2026-10-01', true],
    ['2026-10-31T20:59:59Z', '2026-10-31', true],
    ['2026-10-31T21:00:00Z', '2026-11-01', false],
  ]) {
    const item = fresh({ created_at: unix(instant) });
    for (const version of [item, api.cached(api.record(item, dictionaries))]) {
      const facts = api.leadFacts(version, dictionaries, config);
      assert.equal(facts.createdDate, date);
      assert.equal(facts.createdInMonth, inside);
      assert.equal(api.normalize(version, dictionaries, config).createdDate, date);
      assert.equal(api.normalize(version, dictionaries, config).createdInMonth, inside);
    }
  }
});

test('legacy creation dates are used only when native creation is unavailable', () => {
  const { api } = fixture();
  for (const native of [undefined, null, '', 0]) {
    const item = fresh({ created_at: native,
      custom_fields_values: [field('Дата создания', '03.10.2026')] });
    const cached = api.cached(api.record(item, dictionaries));
    for (const version of [item, cached]) {
      assert.equal(api.leadFacts(version, dictionaries, config).createdDate, '2026-10-03');
      assert.equal(api.normalize(version, dictionaries, config).createdDate, '2026-10-03');
    }
  }
  const absent = fresh({ created_at: 0 });
  assert.equal(api.leadFacts(absent, dictionaries, config), null);
  assert.equal(api.normalize(absent, dictionaries, config).createdInMonth, false);
});

test('independent traffic counts include referral, OM and message leads once and retain separate QL rules', () => {
  const { api } = fixture();
  const cases = [
    [fresh({ source_name: 'РЕК/КЭШБЕК' }), { leads: 1, qualified: 0, omQualified: 0, omLeads: 0 }],
    [fresh({ responsible_user_name: 'Технический' }), { leads: 1, qualified: 0, omQualified: 1, omLeads: 0 }],
    [fresh({ responsible_user_name: 'Системный' }), { leads: 1, qualified: 1, omQualified: 0, omLeads: 0 }],
    [fresh({ responsible_user_id: 10549050 }), { leads: 0, qualified: 1, omQualified: 0, omLeads: 0 }],
    [fresh({ custom_fields_values: [field('Тип лида', 'Сообщение')] }), { leads: 1, qualified: 0, omQualified: 0, omLeads: 0 }],
  ];
  for (const [item, expected] of cases) {
    assert.deepEqual(plain(api.counts(api.normalize(item, dictionaries, config), api.leadFacts(item, dictionaries, config))), expected);
  }
});

test('server weekly facts bypass old deductions only on marked city leads and retain manual additions', () => {
  const { api } = fixture();
  const canonical = { metric: 'Лиды', city: 'МСК', channel: 'Город', fact: 20,
    recommendations: 4, comment: 'amoCRM [AMO_LEADS_ALL=1]' };
  const manual = { metric: 'Лиды', city: 'МСК', channel: 'Ручная корректировка', fact: 2, recommendations: 0 };
  assert.equal(api.sum([canonical, manual], 'fact'), 22);
  for (const extra of [{ comment: 'legacy' }, { channel: 'Директ' }, { city: 'Сообщения' },
    { channel: 'Ручная корректировка' }, { metric: 'Квалы' }]) {
    assert.equal(api.sum([{ ...canonical, ...extra }], 'fact'), 16);
  }
});

function mixedRecords(date = '2026-10-01') {
  return [
    raw('regular', { createdDate: date }),
    raw('pending', { createdDate: date, stageName: 'На проверку', statusId: '73650530' }),
    raw('message', { createdDate: date, typeLabel: 'Сообщение', city: '', excludeReason: 'messagesType' }),
    raw('referral', { createdDate: date, source: 'РЕК/КЭШБЕК' }),
    raw('technical', { createdDate: date, responsibleUserName: 'Технический', managerName: 'Технический' }),
    raw('system', { createdDate: date, responsibleUserName: 'Системный', managerName: 'Системный' }),
    raw('excluded-won', { createdDate: date, responsibleUserId: '10549050', statusId: '142',
      stageName: 'Успешно реализовано', category: 'А+Б', closedAt: `${date} 12:00:00`, closedDate: date }),
    raw('chat', { createdDate: date, statusId: '143', stageName: 'Закрыто и не реализовано', lossReasonId: '23625702' }),
    raw('other-lost', { createdDate: date, statusId: '143', stageName: 'Закрыто и не реализовано', lossReasonId: '999' }),
    raw('messages-pipeline', { createdDate: date, pipelineId: '9', pipelineName: 'АШ Сообщения', city: '' }),
  ];
}

test('main refresh deduplicates all leads, leaves qualification and sales intact and preserves manual metadata', () => {
  const date = '2026-10-01';
  const existing = [{ id: `${date}-МСК-Лиды`, date, city: 'МСК', channel: 'Город', metric: 'Лиды',
    plan: 30, forecast: 33, recommendations: 2, comment: 'ручная заметка', omLeads: 99 }];
  const f = fixture([], existing);
  const records = mixedRecords();
  const result = f.api.sync([...records, records[0]], date, date, []);
  const lead = f.saved().find(row => row.city === 'МСК' && row.metric === 'Лиды');
  const qualified = f.saved().find(row => row.city === 'МСК' && row.metric === 'Квалы');
  assert.equal(lead.fact, 7);
  assert.equal(lead.omLeads, 0);
  assert.equal(qualified.fact, 3, 'native excluded lead owner still qualifies for OP');
  assert.equal(qualified.omQualified, 1);
  for (const key of ['plan', 'forecast', 'recommendations']) assert.equal(lead[key], existing[0][key]);
  assert.ok(lead.comment.includes('ручная заметка'));
  assert.ok(lead.comment.includes('[AMO_LEADS_ALL=1]'));
  assert.equal(result.amoSalesAudit.count, 2, 'lead-owner exclusion cannot remove successful A+B sales');
  assert.equal(f.saved().some(row => row.metric === 'Продажи'), false, 'PS sales facts must remain authoritative');
});

test('sales department uses all-lead arrivals while excluding messages and referrals only from qualification', () => {
  const { api } = fixture();
  const result = api.department(config, [], mixedRecords().map(api.cached));
  const day = result.daily[0];
  assert.equal(day.totalTraffic, 7);
  assert.equal(day.mskTraffic, 7);
  assert.equal(day.totalQualified, 3);
  assert.equal(day.totalDeals, 2);
  const managers = Object.values(result.byManager);
  assert.equal(managers.reduce((sum, manager) => sum + manager.totalTraffic, 0), 7);
  assert.equal(managers.reduce((sum, manager) => sum + manager.factQualified, 0), 3);
  assert.equal(result.byManager['Технический'].refusalLeads, 0);
});

test('historical September and October cohorts recalculate all leads from complete cache without changing inputs or sale totals', () => {
  const dates = ['2026-09-30', '2026-10-01'];
  const existing = dates.flatMap(date => [
    { id: `${date}-МСК-Продажи`, date, city: 'МСК', channel: 'Город', metric: 'Продажи',
      trafficSales: 2, paidSales: 8, fact: 8, plan: 20, forecast: 22, comment: 'продажи сохранены' },
    { id: `${date}-МСК-Лиды`, date, city: 'МСК', channel: 'Город', metric: 'Лиды',
      fact: 2, omLeads: 3, plan: 40, forecast: 44, recommendations: 2, comment: 'ручная заметка' },
    { id: `${date}-МСК-Квалы`, date, city: 'МСК', channel: 'Город', metric: 'Квалы',
      fact: 0, omQualified: 4, plan: 30, forecast: 35 },
  ]);
  const cache = dates.flatMap(date => mixedRecords(date).map(row => ({
    ...row, createdAt: `${date} 12:00:00`, leadId: `${date}-${row.leadId}`,
  })));
  const snapshot = fixture(cache, existing).api.snapshot('2026-11-01', '2026-11-09');
  for (const date of dates) {
    const lead = snapshot.rows.find(row => row.date === date && row.city === 'МСК' && row.metric === 'Лиды');
    const qualified = snapshot.rows.find(row => row.date === date && row.city === 'МСК' && row.metric === 'Квалы');
    assert.equal(lead.fact, 7);
    assert.equal(lead.omLeads, 0);
    assert.equal(lead.plan, 40); assert.equal(lead.forecast, 44); assert.equal(lead.recommendations, 2);
    assert.ok(lead.comment.includes('ручная заметка'));
    assert.ok(lead.comment.includes('[AMO_LEADS_ALL=1]'));
    assert.equal(qualified.fact, 3); assert.equal(qualified.omQualified, 1);
    assert.equal(qualified.plan, 30); assert.equal(qualified.forecast, 35);
    assert.equal(snapshot.rows.some(row => row.date === date && row.metric === 'Продажи'), false);
  }
});
