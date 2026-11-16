import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {test} from 'node:test';

const main = readFileSync(new URL('../apps-script/AppsScript.gs', import.meta.url), 'utf8');
const traffic = readFileSync(new URL('../apps-script/AmoTrafficSales.gs', import.meta.url), 'utf8');
const unix = value => Date.parse(value) / 1000;
const plain = value => JSON.parse(JSON.stringify(value));
const field = (field_name, value) => ({field_name, values: [{value}]});
const all = {periodMode: 'all'};
const dictionaries = {users: {}, pipelines: {4535038: 'МСК АШ', 4535035: 'СПБ АШ'}, statuses: {}};
const before = '2026-11-14T20:59:59Z';
const after = '2026-11-14T21:00:00Z';
const referralOwnerId = 12800146;

function formatDate(date, zone, pattern) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: zone === 'GMT' ? 'UTC' : zone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).map(part => [part.type, part.value]));
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  return pattern === 'yyyy-MM-dd HH:mm:ss' ? `${day} ${parts.hour}:${parts.minute}:${parts.second}` : day;
}

function fixture(cache = []) {
  let saved = [];
  const api = runInNewContext(`${main}\n${traffic}
    readObjects_ = () => [];
    readAmoCrmRawLeadObjectsFast_ = () => cache;
    upsertRowsById_ = (sheet, headers, rows) => { writeSaved(rows); return {updated: rows.length}; };
    rebuildWeeklySummary_ = () => {};
    ({normalize: salesNormalizeAmoLead_, cached: salesAmoLeadFromCachedRecord_, record: amoCrmLeadRecord_,
      lead: salesAmoLeadFacts_, counts: salesAmoTrafficCounts_, department: salesReadAmoDepartmentData_,
      sync: syncAmoCrmMainReportFacts_, sale: salesAmoSalesFacts_, saleCount: salesAmoDealCount_});`, {
    Utilities: {formatDate}, Session: {getScriptTimeZone: () => 'Europe/Moscow'}, cache,
    writeSaved: rows => {saved = plain(rows);},
  });
  return {api, saved: () => saved};
}

function fresh(instant = after, overrides = {}) {
  return {id: '1', pipeline_id: 4535038, pipeline_name: 'МСК АШ', status_id: 41892613,
    status_name: 'Брифинг', responsible_user_id: referralOwnerId, responsible_user_name: 'Отдел продаж',
    source_name: 'Яндекс Директ', created_at: unix(instant), closed_at: unix('2026-11-16T12:00:00Z'),
    custom_fields_values: [], ...overrides};
}
function raw(instant = after, overrides = {}) {
  return {leadId: '1', pipelineId: '4535038', pipelineName: 'МСК АШ', city: 'МСК',
    statusId: '41892613', stageName: 'Брифинг', responsibleUserId: String(referralOwnerId),
    responsibleUserName: 'Отдел продаж', managerName: 'Отдел продаж', source: 'Яндекс Директ',
    createdAt: instant.replace('T', ' ').replace('Z', ''), createdDate: '2026-11-01',
    closedAt: '2026-11-16 12:00:00', isQualified: 'TRUE', isOmQualified: 'FALSE', isReferral: 'FALSE',
    ...overrides};
}
function facts(api, lead, named = dictionaries) {
  return api.counts(api.normalize(lead, named, all), api.lead(lead, named, all));
}
function assertCounts(api, lead, qualified, omQualified = 0, named = dictionaries) {
  assert.deepEqual(plain(facts(api, lead, named)), {leads: 1, qualified, omQualified, omLeads: 0});
}

test('native referral owner name fallback stops qualification exactly at Moscow 15 November midnight, in fresh and cached paths', () => {
  const {api} = fixture();
  for (const [instant, expectedDate, qualified] of [[before, '2026-11-14', 1], [after, '2026-11-15', 0]]) {
    for (const owner of ['Отдел продаж', 'РЕК/КЭШБЕК', 'РЕК/КЕШБЕК']) {
      for (const lead of [fresh(instant, {responsible_user_id: 900, responsible_user_name: owner}),
        api.cached(raw(instant, {responsibleUserId: '900', responsibleUserName: owner, managerName: owner}))]) {
        assert.equal(api.normalize(lead, dictionaries, all).createdDate, expectedDate);
        assertCounts(api, lead, qualified);
      }
    }
  }
});

test('custom creation, closing and stale cached dates cannot move a lead across the native effective boundary', () => {
  const {api} = fixture();
  for (const [instant, otherDate, qualified] of [[before, '2026-11-16', 1], [after, '2026-11-01', 0]]) {
    const custom = fresh(instant, {custom_fields_values: [field('Дата создания', otherDate)],
      closed_at: unix(`${otherDate}T12:00:00Z`)});
    const stale = api.cached(raw(instant, {createdDate: otherDate}));
    stale.cachedNormalized.createdDate = otherDate;
    for (const lead of [custom, stale]) assertCounts(api, lead, qualified);
  }
});

test('cached referral eligibility is re-evaluated even when the old cache says it is ordinary qualified traffic', () => {
  const {api} = fixture();
  const cached = api.cached(raw(after));
  cached.cachedNormalized.isReferral = false;
  cached.cachedNormalized.isQualified = true;
  assertCounts(api, cached, 0);
  assert.equal(api.normalize(cached, dictionaries, all).isReferral, true);
});

test('native responsible name from user dictionary identifies referrals when the API omits the name', () => {
  const {api} = fixture();
  for (const owner of ['Отдел продаж', 'РЕК/КЭШБЕК', 'РЕК/КЕШБЕК']) {
    const named = {...dictionaries, users: {900: owner}};
    for (const [instant, qualified] of [[before, 1], [after, 0]]) {
      for (const lead of [fresh(instant, {responsible_user_id: 900, responsible_user_name: ''}),
        api.cached(raw(instant, {responsibleUserId: '900', responsibleUserName: '', managerName: 'Менеджер'}))]) {
        assertCounts(api, lead, qualified, 0, named);
      }
    }
  }
});

test('the stable referral owner ID survives a CRM account rename, without rewriting earlier cohorts', () => {
  const {api} = fixture();
  for (const [instant, qualified] of [[before, 1], [after, 0]]) {
    for (const name of ['', 'Служебный аккаунт переименован']) {
      for (const lead of [fresh(instant, {responsible_user_name: name}),
        api.cached(raw(instant, {responsibleUserName: name, managerName: 'Менеджер'}))]) {
        assertCounts(api, lead, qualified);
      }
    }
  }
});

test('a custom manager label never turns an ordinary native owner into the referral service account', () => {
  const {api} = fixture();
  for (const custom of ['Отдел продаж', 'РЕК/КЭШБЕК']) {
    for (const lead of [fresh(after, {responsible_user_id: 1, responsible_user_name: 'Менеджер',
      custom_fields_values: [field('Ответственный', custom)]}),
      api.cached(raw(after, {responsibleUserId: '1', responsibleUserName: 'Менеджер', managerName: custom}))]) {
      assertCounts(api, lead, 1);
    }
  }
});

test('System and dismissed employees remain eligible OP, while ROP and Technical remain OM after 15 November', () => {
  const {api} = fixture();
  for (const [id, name, op, om] of [[3804994, 'Системный', 1, 0], [77, 'Уволенные сотрудники', 1, 0],
    [10304986, 'РОП', 0, 1], [13194846, 'Технический', 0, 1]]) {
    for (const lead of [fresh(after, {responsible_user_id: id, responsible_user_name: name}),
      api.cached(raw(after, {responsibleUserId: String(id), responsibleUserName: name, managerName: name}))]) {
      assertCounts(api, lead, op, om);
    }
    for (const lead of [fresh(after, {responsible_user_id: id, responsible_user_name: name,
      status_id: 73650530, status_name: 'На проверку'}),
      api.cached(raw(after, {responsibleUserId: String(id), responsibleUserName: name,
        statusId: '73650530', stageName: 'На проверку'}))]) assertCounts(api, lead, 0);
  }
});

test('Technical account renamed to dismissed employees changes OM to OP only for cohorts from 15 November', () => {
  const {api} = fixture();
  for (const [instant, op, om] of [[before, 0, 1], [after, 1, 0]]) {
    for (const lead of [fresh(instant, {responsible_user_id: 13194846, responsible_user_name: 'Уволенные сотрудники'}),
      api.cached(raw(instant, {responsibleUserId: '13194846', responsibleUserName: 'Уволенные сотрудники'}))]) {
      assertCounts(api, lead, op, om);
    }
  }
});

test('referral owner exclusions preserve all leads and two A+B sales on won stages', () => {
  const {api} = fixture();
  const won = fresh(after, {status_id: 142, status_name: 'Успешно реализовано',
    custom_fields_values: [field('Категория', 'А+Б')]});
  const old = api.cached(raw(after, {statusId: '142', stageName: 'Успешно реализовано', category: 'А+Б'}));
  const november = {monthKey: '2026-11', monthYear: 2026, monthIndex: 10, managers: [], restrictManagers: false};
  for (const lead of [won, old]) {
    assertCounts(api, lead, 0);
    assert.equal(api.saleCount(api.sale(lead, dictionaries, all)), 2);
    const department = api.department(november, [], [lead]);
    assert.equal(department.daily.reduce((sum, row) => sum + row.totalTraffic, 0), 1);
    assert.equal(department.daily.reduce((sum, row) => sum + row.totalQualified, 0), 0);
    assert.equal(department.daily.reduce((sum, row) => sum + row.totalDeals, 0), 2);
  }
});

test('message types remain fully excluded, even won System or dismissed-employee A+B deals', () => {
  const {api} = fixture();
  for (const [id, name] of [[99, 'Системный'], [77, 'Уволенные сотрудники'], [referralOwnerId, 'Отдел продаж']]) {
    const won = fresh(after, {responsible_user_id: id, responsible_user_name: name,
      status_id: 142, status_name: 'Успешно реализовано',
      custom_fields_values: [field('Тип обращения', 'Сообщение'), field('Категория', 'А+Б')]});
    const old = api.cached(raw(after, {responsibleUserId: String(id), responsibleUserName: name,
      statusId: '142', stageName: 'Успешно реализовано', typeLabel: 'Сообщение', category: 'А+Б'}));
    for (const lead of [won, old]) {
      assertCounts(api, lead, 0);
      assert.equal(api.saleCount(api.sale(lead, dictionaries, all)), 2);
    }
  }
});

test('target duplicates stay OM for ordinary owners and remain unqualified for referral owners', () => {
  const {api} = fixture();
  for (const [id, name, om] of [[1, 'Менеджер', 1], [99, 'Системный', 1],
    [77, 'Уволенные сотрудники', 1], [10304986, 'РОП', 1], [referralOwnerId, 'Отдел продаж', 0]]) {
    for (const lead of [fresh(after, {responsible_user_id: id, responsible_user_name: name,
      status_id: 143, status_name: 'Закрыто и не реализовано', loss_reason_id: 23760226}),
      api.cached(raw(after, {responsibleUserId: String(id), responsibleUserName: name,
        statusId: '143', stageName: 'Закрыто и не реализовано', lossReasonId: '23760226'}))]) {
      assertCounts(api, lead, 0, om);
    }
  }
});

test('historical cohorts retain their owner policy and explicit referral sources still never qualify', () => {
  const {api} = fixture();
  for (const [instant, ropOp, ropOm] of [['2026-10-20T12:00:00Z', 1, 0], ['2026-11-01T12:00:00Z', 0, 1],
    [before, 0, 1], [after, 0, 1]]) {
    assertCounts(api, fresh(instant, {responsible_user_id: 10304986, responsible_user_name: 'РОП'}), ropOp, ropOm);
    assertCounts(api, fresh(instant, {responsible_user_id: 1, responsible_user_name: 'Менеджер', source_name: 'РЕК/КЭШБЕК'}), 0);
  }
  for (const instant of ['2026-10-20T12:00:00Z', '2026-11-01T12:00:00Z', before]) {
    for (const lead of [fresh(instant), api.cached(raw(instant))]) assertCounts(api, lead, 1);
  }
});

test('daily fact import assigns native-boundary rows correctly, preserving leads while separating OP and OM', () => {
  const rows = [
    raw(before, {leadId: 'before'}), raw(after, {leadId: 'referral'}),
    raw(after, {leadId: 'system', responsibleUserId: '99', responsibleUserName: 'Системный'}),
    raw(after, {leadId: 'dismissed', responsibleUserId: '77', responsibleUserName: 'Уволенные сотрудники'}),
    raw(after, {leadId: 'rop', responsibleUserId: '10304986', responsibleUserName: 'РОП'}),
    raw(after, {leadId: 'duplicate', responsibleUserId: '1', responsibleUserName: 'Менеджер',
      statusId: '143', stageName: 'Закрыто и не реализовано', lossReasonId: '23760226'}),
  ];
  const f = fixture(rows);
  f.api.sync(rows, '2026-11-14', '2026-11-15', []);
  const get = (date, metric) => f.saved().find(row => row.city === 'МСК' && row.date === date && row.metric === metric);
  assert.equal(get('2026-11-14', 'Лиды').fact, 1);
  assert.equal(get('2026-11-14', 'Квалы').fact, 1);
  assert.equal(get('2026-11-15', 'Лиды').fact, 5);
  assert.equal(get('2026-11-15', 'Квалы').fact, 2);
  assert.equal(get('2026-11-15', 'Квалы').omQualified, 2);
});
