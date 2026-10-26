import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

const source = readFileSync(new URL('../apps-script/AppsScript.gs', import.meta.url), 'utf8');
const config = {
  monthKey: '2026-10', monthYear: 2026, monthIndex: 9,
  periodMode: 'custom', periodStart: '2026-10-01', periodEnd: '2026-10-25',
  managers: [], restrictManagers: false,
};
const dictionaries = {
  users: { 1: 'Менеджер', 2: 'РОП' },
  pipelines: { 4535038: 'МСК АШ', 4535035: 'СПБ АШ', 9: 'АШ Сообщения' },
  statuses: { '4535038:142': 'Успешно реализовано', '4535035:142': 'Успешно реализовано' },
};

function formatDate(date, timeZone, pattern) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: timeZone === 'GMT' ? 'UTC' : timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).map(part => [part.type, part.value]));
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  if (pattern === 'yyyy-MM-dd HH:mm:ss') return `${day} ${parts.hour}:${parts.minute}:${parts.second}`;
  if (pattern === 'yyyy-MM-dd') return day;
  throw new Error(`Unexpected date format: ${pattern}`);
}

function parseDate(value, timeZone, pattern) {
  assert.equal(pattern, 'yyyy-MM-dd HH:mm:ss');
  assert.ok(['Europe/Moscow', 'GMT', 'UTC'].includes(timeZone), timeZone);
  return new Date(value.replace(' ', 'T') + (timeZone === 'Europe/Moscow' ? '+03:00' : 'Z'));
}

const globals = {
  Utilities: { formatDate, parseDate },
  Session: { getScriptTimeZone: () => 'Europe/Moscow' },
};

function loadApi(extra = {}, overrides = '') {
  return runInNewContext(`${source}\n${overrides}\n({
    facts: (...args) => salesAmoSalesFacts_(...args),
    cached: salesAmoLeadFromCachedRecord_, record: amoCrmLeadRecord_,
    dealCount: salesAmoDealCount_, normalize: salesNormalizeAmoLead_,
    department: salesReadAmoDepartmentData_, sync: syncAmoCrmMainReportFacts_,
    fetchByDate: fetchAmoCrmLeadsByDateField_, readCached: salesReadCachedAmoLeadsForMonth_
  });`, { ...globals, ...extra });
}

const api = loadApi();
const unix = iso => Date.parse(iso) / 1000;
const field = (field_name, value) => ({ field_name, values: [{ value }] });

function lead(overrides = {}) {
  return {
    id: 1, pipeline_id: 4535038, pipeline_name: 'МСК АШ',
    status_id: 142, status_name: 'Успешно реализовано',
    responsible_user_id: 1, responsible_user_name: 'Менеджер', price: 75000,
    created_at: unix('2026-09-15T12:00:00Z'), closed_at: unix('2026-10-10T12:00:00Z'),
    custom_fields_values: [], ...overrides,
  };
}

function record(overrides = {}) {
  return {
    leadId: '1', pipelineId: '4535038', pipelineName: 'МСК АШ',
    statusId: '142', statusName: 'Успешно реализовано', stageName: 'Успешно реализовано',
    responsibleUserName: 'РОП', managerName: 'РОП', city: 'МСК',
    createdAt: '2026-09-15 12:00:00', closedAt: '2026-10-10 12:00:00',
    createdDate: '2026-09-15', closedDate: '2026-10-10',
    isQualified: 'TRUE', isWon: 'TRUE', category: 'B', budget: 75000,
    ...overrides,
  };
}

test('successful message-type leads count as sales in city pipelines, while the messages pipeline stays separate', () => {
  const message = lead({ custom_fields_values: [field('Тип лида', 'Сообщение')] });
  assert.equal(api.normalize(message, dictionaries, config).exclude, true);
  const sale = api.facts(message, dictionaries, config);
  assert.equal(sale.city, 'МСК');
  assert.equal(sale.closedInMonth, true);
  assert.equal(api.facts(lead({ pipeline_id: 4535035, pipeline_name: 'СПБ АШ',
    custom_fields_values: [field('Тип лида', 'Сообщение')] }), dictionaries, config).city, 'СПБ');
  assert.equal(api.facts(lead({ pipeline_id: 9, pipeline_name: 'АШ Сообщения' }), dictionaries, config), null);
});

test('sales include ROP, both technical owners, and ordinary managers', () => {
  for (const owner of ['РОП', 'Технический', 'Системный', 'Менеджер']) {
    const sale = api.facts(lead({ responsible_user_name: owner }), dictionaries, config);
    assert.ok(sale, owner);
    assert.equal(sale.manager, owner);
    assert.equal(sale.budget, 75000);
  }
});

test('native closed_at determines sales dates even when custom completion and payment dates disagree', () => {
  const sale = api.facts(lead({
    closed_at: unix('2026-10-10T12:00:00Z'),
    custom_fields_values: [field('Дата завершения', '30.09.2026'), field('Дата оплаты', '01.11.2026')],
  }), dictionaries, config);
  assert.equal(sale.closedDate, '2026-10-10');
  assert.equal(sale.closedInMonth, true);
  const outside = api.facts(lead({ closed_at: unix('2026-10-26T12:00:00Z') }), dictionaries, config);
  assert.equal(outside.closedDate, '2026-10-26');
  assert.equal(outside.closedInMonth, false);
});

test('current native status and timestamp override stale cached success flags and custom closed dates', () => {
  for (const statusId of ['143', '41892613', '']) {
    const stale = api.cached(record({ statusId, stageName: 'Успешно реализовано', isWon: 'TRUE' }));
    assert.equal(api.facts(stale, dictionaries, config), null, `native status ${statusId}`);
  }
  assert.equal(api.facts(lead({ closed_at: null }), dictionaries, config), null);
  assert.equal(api.facts(api.cached(record({ closedAt: '', closedDate: '2026-10-10' })), dictionaries, config), null);
});

test('sales dates use Moscow midnight at both ends of a selected period', () => {
  const first = api.facts(lead({ closed_at: unix('2026-09-30T21:30:00Z') }), dictionaries, config);
  assert.equal(first.closedDate, '2026-10-01');
  assert.equal(first.closedInMonth, true);
  const last = api.facts(lead({ closed_at: unix('2026-10-25T20:59:59Z') }), dictionaries, config);
  assert.equal(last.closedDate, '2026-10-25');
  assert.equal(last.closedInMonth, true);
  const next = api.facts(lead({ closed_at: unix('2026-10-25T21:30:00Z') }), dictionaries, config);
  assert.equal(next.closedDate, '2026-10-26');
  assert.equal(next.closedInMonth, false);
});

test('A plus B counts as two sales and each single category counts once', () => {
  for (const category of ['А+Б', 'А+В', 'A+B', 'AB']) {
    const sale = api.facts(lead({ custom_fields_values: [field('Категория', category)] }), dictionaries, config);
    assert.equal(sale.isDoubleAB, true, category);
    assert.equal(sale.isAB, true, category);
    assert.equal(api.dealCount(sale), 2, category);
  }
  for (const category of ['А', 'Б', 'B']) {
    const sale = api.facts(lead({ custom_fields_values: [field('Категория', category)] }), dictionaries, config);
    assert.equal(sale.isDoubleAB, false, category);
    assert.equal(api.dealCount(sale), 1, category);
  }
});

test('cached message exclusions do not lose their pipeline, native close date, or A plus B category for sales', () => {
  const sale = api.facts(api.cached(record({
    city: '', excludeReason: 'messagesType', typeLabel: 'Сообщение', category: 'А+Б',
    isDoubleAB: '', isAB: '', closedDate: '2026-09-30', closedAt: '2026-09-30 21:30:00',
  })), dictionaries, config);
  assert.ok(sale);
  assert.equal(sale.city, 'МСК');
  assert.equal(sale.manager, 'РОП');
  assert.equal(sale.closedDate, '2026-10-01');
  assert.equal(sale.closedInMonth, true);
  assert.equal(api.dealCount(sale), 2);
});

test('native cached Date values are converted from their UTC instant only once', () => {
  const sale = api.facts(api.cached(record({
    closedAt: new Date('2026-10-25T20:30:00Z'), closedDate: '2026-10-25',
  })), dictionaries, config);
  assert.equal(sale.closedDate, '2026-10-25');
  assert.equal(sale.closedInMonth, true);
});

test('raw caching retains the A plus B category and multiplier on message-type exclusions', () => {
  const raw = api.record(lead({
    custom_fields_values: [field('Тип лида', 'Сообщение'), field('Категория', 'А+Б')],
  }), dictionaries);
  assert.equal(raw.excludeReason, 'messagesType');
  assert.equal(raw.category, 'А+Б');
  assert.equal(raw.isDoubleAB, 'TRUE');
  assert.equal(api.dealCount(api.facts(api.cached(raw), dictionaries, config)), 2);
});

test('creation and closing fetches use the same Moscow calendar boundaries as daily facts', () => {
  const requests = [];
  const fetchApi = loadApi({ capture: params => requests.push(params) }, `
    fetchAmoCrmEndpoint_ = (path, params) => { capture(params); return { _embedded: { leads: [] } }; };
  `);
  fetchApi.fetchByDate('2026-10-01', '2026-10-25', 'closed_at', '4535038', 80, []);
  assert.equal(requests[0]['filter[closed_at][from]'], unix('2026-09-30T21:00:00Z'));
  assert.equal(requests[0]['filter[closed_at][to]'], unix('2026-10-25T20:59:59Z'));
  fetchApi.fetchByDate('2026-10-01', '2026-10-25', 'created_at', '4535038', 80, []);
  assert.equal(requests[1]['filter[created_at][from]'], unix('2026-09-30T21:00:00Z'));
  assert.equal(requests[1]['filter[created_at][to]'], unix('2026-10-25T20:59:59Z'));
});

test('cache period selection uses the same creation date as OP qualification', () => {
  const rows = [record({
    createdAt: '2026-09-15 12:00:00', createdDate: '2026-10-03',
    updatedAt: '2026-10-20 12:00:00', closedAt: '', closedDate: '',
    stageName: 'Брифинг', statusId: '123', isWon: '',
  })];
  const cachedApi = loadApi({ cachedRows: () => rows }, 'readAmoCrmRawLeadObjectsFast_ = () => cachedRows();');
  const leads = cachedApi.readCached(config, []);
  assert.equal(leads.length, 1);
  const result = cachedApi.department(config, [], leads);
  assert.equal(result.daily.find(day => day.key === '2026-10-03').totalQualified, 1);
  assert.equal(result.daily.find(day => day.key === '2026-10-20').totalQualified, 0);
});

test('missing cached creation dates fall back to the native Moscow day, including month boundaries', () => {
  for (const createdAt of ['2026-09-30 21:30:00', new Date('2026-09-30T21:30:00Z')]) {
    const rows = [record({
      createdAt, createdDate: '', closedAt: '', closedDate: '',
      stageName: 'Брифинг', statusId: '123', isWon: '',
    })];
    const cachedApi = loadApi({ cachedRows: () => rows }, 'readAmoCrmRawLeadObjectsFast_ = () => cachedRows();');
    const leads = cachedApi.readCached(config, []);
    assert.equal(leads.length, 1);
    assert.equal(leads[0].cachedNormalized.createdDate, '2026-10-01');
    assert.equal(cachedApi.department(config, [], leads).daily[0].totalQualified, 1);
  }
});

test('cache prefilter retains October sales closed just after Moscow midnight on October first', () => {
  for (const closedAt of ['2026-09-30 21:30:00', new Date('2026-09-30T21:30:00Z')]) {
    const rows = [record({ closedAt, closedDate: '2026-10-01' })];
    const cachedApi = loadApi({ cachedRows: () => rows }, 'readAmoCrmRawLeadObjectsFast_ = () => cachedRows();');
    const result = cachedApi.readCached(config, []);
    assert.equal(result.length, 1);
    assert.equal(String(result[0].id), '1');
  }
});

test('department sales include message-type A plus B without adding those leads to traffic or OP qualification', () => {
  const message = record({
    createdAt: '2026-10-02 12:00:00', createdDate: '2026-10-02',
    city: '', excludeReason: 'messagesType', typeLabel: 'Сообщение', category: 'А+Б',
  });
  const result = api.department(config, [], [api.cached(message)]);
  const day = result.daily.find(row => row.key === '2026-10-10');
  assert.equal(day.totalDeals, 2);
  assert.equal(day.mskDeals, 2);
  assert.equal(result.byManager['РОП'].factDeals, 2);
  assert.equal(result.byManager['РОП'].totalTraffic, 0);
  assert.equal(result.byManager['РОП'].factQualified, 0);
  assert.equal(result.daily.reduce((sum, row) => sum + row.totalTraffic, 0), 0);
});

test('main sales use native dates and include message-type A plus B while preserving traffic exclusions', () => {
  let saved = [];
  const syncApi = loadApi({ saveRows: rows => { saved = rows; } }, `
    readObjects_ = () => [];
    upsertRowsById_ = (sheet, headers, rows) => { saveRows(rows); return { updated: rows.length }; };
    rebuildWeeklySummary_ = () => {};
  `);
  syncApi.sync([record({
    createdAt: '2026-10-01 12:00:00', createdDate: '2026-10-01',
    closedAt: '2026-09-30 21:30:00', closedDate: '2026-09-30',
    city: '', excludeReason: 'messagesType', typeLabel: 'Сообщение', category: 'А+Б',
  })], '2026-10-01', '2026-10-01', []);
  const metric = name => saved.find(row => row.metric === name && row.city === 'МСК');
  assert.equal(metric('Продажи').fact, 2);
  assert.equal(metric('Лиды').fact, 0);
  assert.equal(metric('Квалы').fact, 0);
  assert.equal(metric('Квалы').omQualified, 0);
});
