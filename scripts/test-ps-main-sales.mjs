import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

const source = readFileSync(new URL('../apps-script/PsSales.gs', import.meta.url), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const headers = Array(43).fill('');
Object.assign(headers, { 15: 'A+B', 18: 'Номер\n заказа', 19: 'Город', 23: 'Офисный\n менеджер', 26: 'Дата\n создания', 40: 'Кол-во', 42: 'Договор' });
const order = (id, city, date, ab = false, extra = {}) => {
  const row = Array(43).fill('');
  Object.assign(row, { 15: String(ab).toUpperCase(), 18: id, 19: city, 23: 'Любой ответственный', 26: date, 40: '2', 42: 'Договоров нет', ...extra });
  return row;
};
const dateRange = (start, end) => {
  const days = [];
  for (let d = new Date(`${start}T00:00:00Z`); d <= new Date(`${end}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) days.push(d.toISOString().slice(0, 10));
  return days;
};
const idFor = (date, city, metric, channel) => `${date}|${city}|${metric}|${channel}`;

function fixture({ rows = [], heading = headers, existing = [], broken = false } = {}) {
  const reads = [], writes = [], rebuilt = [];
  const sheet = {
    getLastRow: () => rows.length + 1,
    getLastColumn: () => heading.length,
    getRange: (row, col, height, width) => ({ getDisplayValues: () => {
      reads.push([row, col, height, width]);
      return [heading, ...rows].slice(row - 1, row - 1 + height).map(r => Array.from({ length: width }, (_, i) => r[col - 1 + i] ?? ''));
    } }),
  };
  const api = runInNewContext(`${source}\n({read:readMainPsSalesSnapshot_,sync:syncMainPsSales_});`, {
    SALES_DEPARTMENT_CONFIG: { dynamicsSpreadsheetId: 'reference', psSheet: 'Выгрузка PS' },
    CONFIG: { sheets: { daily: 'Data_Daily' } }, HEADERS: { Data_Daily: [] },
    SpreadsheetApp: { openById: id => {
      assert.equal(id, 'reference');
      if (broken) throw new Error('transport failure');
      return { getSheetByName: name => { assert.equal(name, 'Выгрузка PS'); return sheet; } };
    } },
    readObjects_: sheetName => { assert.equal(sheetName, 'Data_Daily'); return existing; },
    dailyRecordId_: idFor, dailyRow_: value => value,
    weekOfMonth_: date => Math.ceil(Number(date.slice(-2)) / 7),
    eachDateInRange_: dateRange,
    upsertRowsById_: (sheetName, columns, records) => { writes.push(...plain(records)); return { updated: records.length }; },
    rebuildWeeklySummary_: month => rebuilt.push(month),
  });
  return { api, reads, writes, rebuilt };
}

test('PS follows Dynamics: each order is one, A+B is two, without quantity, contract, payment or owner filters', () => {
  const f = fixture({ rows: [order('1', 'Москва', '01.10.2026 11:20'), order('2', 'Санкт-Петербург', '25.10.2026 23:59', true)] });
  const result = plain(f.api.read('2026-10-01', '2026-10-25'));
  assert.equal(result.deals, 2); assert.equal(result.doubleDeals, 1); assert.equal(result.count, 3);
  assert.deepEqual(result.byDay['2026-10-25']['СПБ'], { deals: 1, doubleDeals: 1, count: 2 });
  assert.deepEqual(result.coverageByMonth, { '2026-10': { fromDate: '2026-10-01', toDate: '2026-10-25' } });
  assert.deepEqual(f.reads.filter(r => r[0] > 1).map(r => [r[1], r[3]]).sort((a, b) => a[0] - b[0]), [[16, 1], [19, 1], [20, 1], [27, 1]]);
  assert.equal(f.writes.length, 0);
});

test('header mapping survives moved columns and ignores other cities; requested period totals stay bounded', () => {
  const f = fixture({ heading: ['Дата создания', 'A+B', 'Город', 'Номер заказа'], rows: [
    ['01.10.2026 00:00', 'FALSE', 'МСК', '1'], ['25.10.2026 15:00', 'TRUE', 'СПБ', '2'],
    ['invalid', 'invalid', 'Казань', ''], ['30.09.2026 18:00', 'FALSE', 'Москва', '3'],
  ] });
  const result = plain(f.api.read('2026-10-20', '2026-10-25'));
  assert.equal(result.count, 2); assert.equal(result.deals, 1);
  assert.equal(Object.keys(result.byDay).length, 1);
  assert.equal(result.coverageByMonth['2026-10'].fromDate, '2026-10-01');
});

test('exact repeated orders deduplicate with warning and conflicts reject before writes', () => {
  const repeated = order('1', 'Москва', '25.10.2026 10:00', true);
  const f = fixture({ rows: [repeated, repeated] });
  const result = plain(f.api.read('2026-10-01', '2026-10-26'));
  assert.equal(result.count, 2); assert.ok(result.warnings.length);
  for (const conflict of [order('1', 'Москва', '24.10.2026'), order('1', 'СПБ', '25.10.2026', true)]) {
    const c = fixture({ rows: [repeated, conflict] });
    assert.throws(() => c.api.sync({ fromDate: '2026-10-01', toDate: '2026-10-26' }), /дубл|повтор|конфликт/i);
    assert.equal(c.writes.length, 0);
  }
});

test('missing or malformed source fails before writes', () => {
  const cases = [
    {}, { broken: true }, { heading: ['wrong'], rows: [['x']] },
    { rows: [order('', 'Москва', '25.10.2026')] },
    { rows: [order('1', 'Москва', '31.02.2026')] },
    { rows: [order('1', 'Москва', '25.10.2026', 'unknown')] },
  ];
  for (const setup of cases) {
    const f = fixture(setup);
    assert.throws(() => f.api.sync({ fromDate: '2026-10-01', toDate: '2026-10-26' }));
    assert.equal(f.writes.length, 0);
  }
});

test('sync replaces only city sales, preserves plans/forecast/recommendations, distinguishes zero and pending, rebuilds month', () => {
  const current = { id: idFor('2026-10-25', 'МСК', 'Продажи', 'Город'), date: '2026-10-25', city: 'МСК', metric: 'Продажи', channel: 'Город', fact: 99, plan: 11, forecast: 12, recommendations: 3, comment: 'ручная заметка' };
  const f = fixture({ existing: [current], rows: [order('1', 'Москва', '25.10.2026', true)] });
  const result = plain(f.api.sync({ fromDate: '2026-10-24', toDate: '2026-10-26' }));
  assert.equal(result.source, 'PS'); assert.equal(result.updated, 16); assert.equal(result.sales.count, 2);
  assert.ok(f.writes.every(r => r.metric === 'Продажи' && r.channel === 'Город' && ['МСК', 'СПБ'].includes(r.city)));
  const saved = f.writes.find(r => r.id === current.id);
  assert.equal(saved.fact, 2); assert.equal(saved.plan, 11); assert.equal(saved.forecast, 12); assert.equal(saved.recommendations, 3);
  assert.match(saved.comment, /ручная заметка/); assert.match(saved.comment, /\[SALES_SOURCE=PS\]/);
  const zero = f.writes.find(r => r.date === '2026-10-24');
  assert.equal(zero.fact, 0); assert.doesNotMatch(zero.comment, /PS_PENDING/);
  const pending = f.writes.filter(r => r.date === '2026-10-26');
  assert.equal(pending.length, 2); assert.ok(pending.every(r => r.fact === 0 && r.comment.includes('[PS_PENDING=1]')));
  assert.deepEqual(f.rebuilt, ['2026-10']);
});

test('absent months preserve legacy sales rather than writing unsupported zeros', () => {
  const f = fixture({ rows: [order('1', 'Москва', '25.10.2026')] });
  const result = plain(f.api.sync({ fromDate: '2026-09-29', toDate: '2026-10-02' }));
  assert.equal(result.sales.count, 0);
  assert.equal(result.updated, 16);
  assert.ok(f.writes.every(r => r.date.startsWith('2026-10')));
  assert.ok(result.warnings.some(w => w.includes('2026-09')));
});

test('invalid ranges reject before reads or writes', () => {
  for (const input of [{ fromDate: '2026-10-26', toDate: '2026-10-01' }, { fromDate: '2026-02-31', toDate: '2026-03-02' }, {}]) {
    const f = fixture({ rows: [order('1', 'Москва', '25.10.2026')] });
    assert.throws(() => f.api.sync(input));
    assert.equal(f.reads.length, 0); assert.equal(f.writes.length, 0);
  }
});

test('a refreshed coverage removes the pending marker and retains deliberate zero forecasts', () => {
  const current = { id: idFor('2026-10-26', 'СПБ', 'Продажи', 'Город'), plan: 8, forecast: 0, recommendations: 2,
    comment: 'заметка [SALES_SOURCE=PS] [PS_COVERED_FROM=2026-10-01] [PS_COVERED_TO=2026-10-25] [PS_PENDING=1]' };
  const f = fixture({ existing: [current], rows: [order('1', 'СПБ', '26.10.2026 10:00', true)] });
  f.api.sync({ fromDate: '2026-10-26', toDate: '2026-10-26' });
  const saved = f.writes.find(row => row.id === current.id);
  assert.equal(saved.fact, 2); assert.equal(saved.forecast, 0); assert.equal(saved.recommendations, 2);
  assert.doesNotMatch(saved.comment, /PS_PENDING/);
  assert.match(saved.comment, /\[PS_COVERED_TO=2026-10-26\]/);
  assert.equal((saved.comment.match(/SALES_SOURCE/g) || []).length, 1);
});

test('all uncovered days through month end become pending, including legacy rows outside the requested range', () => {
  const existing = ['2026-10-27', '2026-10-31', '2026-11-01'].map(date => ({
    id: idFor(date, 'МСК', 'Продажи', 'Город'), date, city: 'МСК', metric: 'Продажи', channel: 'Город',
    fact: 5, plan: 7, forecast: 8, recommendations: 2, comment: 'заметка',
  }));
  const f = fixture({ existing, rows: [order('1', 'Москва', '01.10.2026'), order('2', 'СПБ', '25.10.2026', true)] });
  const result = plain(f.api.sync({ fromDate: '2026-10-01', toDate: '2026-10-26' }));
  assert.equal(result.updated, 62);
  assert.equal(result.sales.count, 3);
  const future = f.writes.filter(row => row.date > '2026-10-25');
  assert.equal(future.length, 12);
  assert.ok(future.every(row => row.fact === 0 && row.comment.includes('[PS_PENDING=1]')));
  for (const date of ['2026-10-27', '2026-10-31']) {
    const saved = f.writes.find(row => row.date === date && row.city === 'МСК');
    assert.equal(saved.plan, 7); assert.equal(saved.forecast, 8); assert.equal(saved.recommendations, 2);
    assert.match(saved.comment, /заметка/);
  }
  const realZero = f.writes.find(row => row.date === '2026-10-11' && row.city === 'МСК');
  assert.equal(realZero.fact, 0); assert.doesNotMatch(realZero.comment, /PS_PENDING/);
  assert.ok(f.writes.every(row => row.date.startsWith('2026-10')));
});

test('a partial request leaves covered days outside its range untouched while clearing uncovered future days', () => {
  const f = fixture({ rows: [order('1', 'Москва', '25.10.2026')] });
  f.api.sync({ fromDate: '2026-10-10', toDate: '2026-10-11' });
  assert.deepEqual([...new Set(f.writes.map(row => row.date))], [
    '2026-10-10', '2026-10-11', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31',
  ]);
});
