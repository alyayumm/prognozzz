import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {test} from 'node:test';

const source = readFileSync(new URL('../apps-script/AppsScript.gs', import.meta.url), 'utf8');
const dictionaries = {users: {1: 'Менеджер', 88: 'Технический', 99: 'Системный'},
  pipelines: {4535038: 'МСК АШ', 4535035: 'СПБ АШ', 9: 'АШ Сообщения'},
  statuses: {'4535038:11': 'Брифинг', '4535038:12': 'На проверку',
    '4535038:142': 'Успешно реализовано', '4535038:143': 'Закрыто и не реализовано'}};
const config = {monthKey: '2026-10', monthYear: 2026, monthIndex: 9, managers: [], restrictManagers: false};
const formatDate = (date, zone, pattern) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {timeZone: zone === 'GMT' ? 'UTC' : zone,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'})
    .formatToParts(date).map(part => [part.type, part.value]));
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  return pattern === 'yyyy-MM-dd HH:mm:ss' ? `${day} ${parts.hour}:${parts.minute}:${parts.second}` : day;
};
const api = runInNewContext(`${source}\n({normalize: salesNormalizeAmoLead_, cached: salesAmoLeadFromCachedRecord_,
  record: amoCrmLeadRecord_, department: salesReadAmoDepartmentData_});`, {
  Utilities: {formatDate}, Session: {getScriptTimeZone: () => 'Europe/Moscow'},
});
const field = (field_name, value) => ({field_name, values: [{value}]});
const fresh = (overrides = {}) => {
  const lead = {id: 1, pipeline_id: 4535038, status_id: 11, responsible_user_id: 1,
    created_at: Date.parse('2026-10-04T12:00:00Z') / 1000,
    custom_fields_values: [field('Тип обращения', 'Сообщение')], ...overrides};
  return {pipeline_name: dictionaries.pipelines[lead.pipeline_id],
    status_name: dictionaries.statuses[`${lead.pipeline_id}:${lead.status_id}`], ...lead};
};
const legacy = (overrides = {}) => ({leadId: '1', pipelineId: '4535038', pipelineName: 'МСК АШ',
  statusId: '11', stageName: 'Брифинг', city: '', excludeReason: 'messagesType',
  responsibleUserId: '1', responsibleUserName: 'Менеджер', managerName: 'Менеджер',
  createdAt: '2026-10-04 12:00:00', createdDate: '2026-10-04', typeLabel: 'Сообщение',
  isQualified: '', ...overrides});
const total = (result, key) => result.daily.reduce((sum, row) => sum + row[key], 0);

test('won message contact types in either API field stay out of qualification while A+B sales remain separate', () => {
  for (const fieldName of ['Тип обращения', 'Тип лида']) {
    const lead = fresh({status_id: 142, closed_at: Date.parse('2026-10-10T12:00:00Z') / 1000,
      custom_fields_values: [field(fieldName, 'Сообщение'), field('Категория', 'А+Б')]});
    for (const candidate of [lead, api.cached(api.record(lead, dictionaries))]) {
      const normalized = api.normalize(candidate, dictionaries, config);
      assert.equal(normalized.exclude, true, `${fieldName}: even won message contact is excluded`);
      assert.equal(normalized.excludeReason, 'messagesType');
      const result = api.department(config, [], [candidate]);
      assert.equal(total(result, 'totalQualified'), 0);
      assert.equal(total(result, 'totalTraffic'), 1);
      assert.equal(total(result, 'totalDeals'), 2);
    }
  }
});

test('won legacy messagesType cache rows stay excluded for ordinary, Technical and System owners', () => {
  for (const owner of [1, 88, 99]) {
    for (const typeLabel of ['Сообщение', '']) {
      const candidate = api.cached(legacy({statusId: '142', stageName: 'Успешно реализовано',
        responsibleUserId: String(owner), responsibleUserName: dictionaries.users[owner],
        managerName: dictionaries.users[owner], typeLabel}));
      const normalized = api.normalize(candidate, dictionaries, config);
      assert.equal(normalized.exclude, true);
      assert.equal(normalized.excludeReason, 'messagesType');
      assert.equal(total(api.department(config, [], [candidate]), 'totalQualified'), 0);
    }
  }
});

test('won referral messages are excluded once without producing negative qualification or removing arrivals', () => {
  for (const candidate of [fresh({status_id: 142, source_name: 'РЕК/КЭШБЕК'}),
    api.cached(legacy({statusId: '142', stageName: 'Успешно реализовано', source: 'РЕК/КЭШБЕК'}))]) {
    const normalized = api.normalize(candidate, dictionaries, config);
    assert.equal(normalized.exclude, true);
    const result = api.department(config, [], [candidate]);
    assert.equal(total(result, 'totalQualified'), 0);
    assert.equal(total(result, 'totalTraffic'), 1);
  }
});

test('an ordinary won A+B lead still supplies one qualification and two independent sales', () => {
  const lead = fresh({status_id: 142, closed_at: Date.parse('2026-10-10T12:00:00Z') / 1000,
    custom_fields_values: [field('Категория', 'А+Б')]});
  for (const candidate of [lead, api.cached(api.record(lead, dictionaries))]) {
    const result = api.department(config, [], [candidate]);
    assert.equal(total(result, 'totalQualified'), 1);
    assert.equal(total(result, 'totalDeals'), 2);
    assert.equal(total(result, 'totalTraffic'), 1);
  }
});

test('open and closed-lost message contacts never qualify, including target refusals and a stale won stage name', () => {
  for (const changes of [{status_id: 11}, {status_id: 12},
    {status_id: 143, loss_reason_id: 3421768}, {status_id: 143, loss_reason_id: 999},
    {status_id: 11, status_name: 'Успешно реализовано'}]) {
    const lead = fresh(changes);
    const old = legacy({statusId: String(lead.status_id), stageName: lead.status_name,
      isWon: 'TRUE', isQualified: 'TRUE', lossReasonId: String(lead.loss_reason_id || '')});
    for (const candidate of [lead, api.cached(old),
      api.cached({...old, excludeReason: '', city: 'МСК'}),
      api.cached({...old, typeLabel: '', excludeReason: 'messagesType'})]) {
      assert.equal(api.normalize(candidate, dictionaries, config).exclude, true);
      assert.equal(total(api.department(config, [], [candidate]), 'totalQualified'), 0);
    }
  }
});

test('closed lost Chat stays excluded for fresh and formerly message-excluded cached leads', () => {
  for (const candidate of [fresh({status_id: 143, loss_reason_id: 23625702}),
    api.cached(legacy({statusId: '143', stageName: 'Закрыто и не реализовано', lossReasonId: '23625702'}))]) {
    const normalized = api.normalize(candidate, dictionaries, config);
    assert.equal(normalized.exclude, true);
    assert.equal(normalized.excludeReason, 'closedLostChat');
    const result = api.department(config, [], [candidate]);
    assert.equal(total(result, 'totalTraffic'), 0);
    assert.equal(total(result, 'totalQualified'), 0);
  }
});

test('contact type policy does not admit separate Messages pipelines or unknown cities from old cache', () => {
  for (const candidate of [fresh({pipeline_id: 9}),
    api.cached(legacy({pipelineId: '9', pipelineName: 'АШ Сообщения'})),
    api.cached(legacy({pipelineId: '10', pipelineName: 'Другая воронка'}))]) {
    assert.equal(api.normalize(candidate, dictionaries, config).exclude, true);
  }
});
