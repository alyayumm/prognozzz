import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

const main = readFileSync(new URL('../apps-script/AppsScript.gs', import.meta.url), 'utf8');
const traffic = readFileSync(new URL('../apps-script/AmoTrafficSales.gs', import.meta.url), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const lead = (id, date, overrides = {}) => ({
  leadId: id, createdDate: date, createdAt: `${date}T08:00:00Z`,
  closedAt: '2026-11-05T08:00:00Z', statusId: '142', statusName: 'Успешно реализовано',
  pipelineName: 'МСК АШ', city: 'МСК', responsibleUserId: '10304986',
  category: 'B', ...overrides,
});
const sale = (date, city = 'МСК', extra = {}) => ({
  id: `${date}-${city}-Продажи`, date, city, channel: 'Город', metric: 'Продажи',
  plan: 20, forecast: 22, fact: 81, paidSales: 30, recommendations: 3, comment: 'сохранено', ...extra,
});
function fixture(records, existing = []) {
  const writes = [];
  const api = runInNewContext(`${main}\n${traffic}
    readObjects_ = () => saved;
    readAmoCrmRawLeadObjectsFast_ = () => cache;
    upsertRowsById_ = (sheet, headers, rows, mapRow) => {
      capture(rows, rows.map(mapRow)); return {updated: rows.length};
    };
    rebuildWeeklySummary_ = () => {};
    ({read: readMainAmoTrafficSalesSnapshot_, write: syncMainAmoTrafficSales_,
      normalize: normalizeDailyUpdate_, client: normalizeDailyForClient_, serialize: dailyRow_});`, {
    saved: existing, cache: records,
    capture: (rows, cells) => writes.push({ rows: plain(rows), cells: plain(cells) }),
    Session: { getScriptTimeZone: () => 'Europe/Moscow' },
    Utilities: { formatDate: date => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(date) },
  });
  return { api, writes };
}

test('traffic sales belong to arrival, including later successful sales and A+B for every owner', () => {
  const f = fixture([
    lead('1', '2026-10-31', { category: 'A+B', closedAt: '2026-11-05T08:00:00Z' }),
    lead('2', '2026-11-01', { closedAt: '', responsibleUserId: 'technical', typeLabel: 'Сообщение' }),
    lead('3', '2026-11-01', { pipelineName: 'СПБ АШ', city: 'СПБ' }),
    lead('4', '2026-11-01', { statusId: '143', statusName: 'Закрыто и не реализовано' }),
    lead('5', '2026-11-01', { pipelineName: 'АШ Сообщения', city: '' }),
  ]);
  const snapshot = f.api.read('2026-10-31', '2026-11-01');
  assert.deepEqual(plain(snapshot.byCity), { 'МСК': 3, 'СПБ': 1 });
  assert.equal(snapshot.rows.find(row => row.date === '2026-10-31' && row.city === 'МСК').trafficSales, 2);
  assert.equal(snapshot.rows.find(row => row.date === '2026-11-01' && row.city === 'МСК').trafficSales, 1);
  assert.equal(f.writes.length, 0);
});

test('refreshing November recomputes confirmed October cohorts from the complete cache', () => {
  const previous = sale('2026-10-31', 'МСК', { trafficSales: 0 });
  const f = fixture([
    lead('old', '2026-10-31', { category: 'A+B' }),
    lead('other', '2026-11-01'),
    lead('unknown-history', '2026-09-01'),
  ], [previous]);
  const snapshot = f.api.read('2026-11-01', '2026-11-01');
  assert.equal(snapshot.rows.filter(row => row.metric === 'Продажи').length, 3);
  assert.equal(snapshot.rows.find(row => row.id === previous.id).trafficSales, 2);
  assert.equal(snapshot.count, 1);
  assert.ok(!snapshot.rows.some(row => row.date === '2026-09-01'));
  f.api.write(snapshot);
  const saved = f.writes[0].rows.find(row => row.id === previous.id);
  for (const key of ['fact', 'paidSales', 'plan', 'forecast', 'comment', 'recommendations']) assert.equal(saved[key], previous[key]);
  assert.equal(f.writes[0].cells.find(row => row[0] === previous.id)[14], 2);
  assert.equal(f.writes[0].cells.find(row => row[0] === previous.id)[15], 30);
  const historicalQualified = f.writes[0].rows.find(row => row.date === previous.date && row.metric === 'Квалы');
  assert.equal(historicalQualified.fact, 1);
  assert.deepEqual(plain(snapshot.historicalMonths), ['2026-10']);
});

test('zero is confirmed only inside imported cohorts; unavailable paid history stays blank', () => {
  const f = fixture([], [sale('2026-10-31', 'МСК', { trafficSales: '', paidSales: '' })]);
  const snapshot = f.api.read('2026-11-01', '2026-11-02');
  assert.equal(snapshot.rows.length, 4);
  assert.ok(snapshot.rows.every(row => row.trafficSales === 0 && row.paidSales === ''));
  assert.equal(snapshot.count, 0);
});

test('an unavailable or empty full cache cannot erase previously confirmed cohorts', () => {
  const f = fixture([], [sale('2026-10-31', 'МСК', { trafficSales: 2 })]);
  assert.throws(() => f.api.read('2026-11-01', '2026-11-02'), /кэш пустой/);
  assert.equal(f.writes.length, 0);
});

test('cached duplicates count each native deal once and native status overrides stale success flags', () => {
  const item = lead('1', '2026-11-01', { category: 'A+B' });
  const f = fixture([item, item, lead('2', '2026-11-01', { statusId: '143', isWon: 'TRUE' })]);
  assert.equal(f.api.read('2026-11-01', '2026-11-01').count, 2);
});

test('daily API round-trip preserves derived sales through manual plan edits and keeps missing distinct from zero', () => {
  const row = sale('2026-11-01', 'МСК', { trafficSales: 0, paidSales: 30 });
  const f = fixture([], [row]);
  const edited = f.api.normalize({ date: row.date, city: row.city, metric: row.metric, plan: 25, trafficSales: 999, paidSales: 999 });
  assert.equal(edited.plan, 25);
  assert.equal(edited.trafficSales, 0);
  assert.equal(edited.paidSales, 30);
  assert.equal(f.api.client(edited).trafficSales, 0);
  assert.equal(f.api.client(sale(row.date, row.city, { paidSales: '' })).paidSales, undefined);
});
