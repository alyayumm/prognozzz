import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/api/demandOutcomesApi.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const snapshot = () => ({ status: 'ready', warnings: [], records: [
  { month: '2026-01', city: 'МСК', metric: 'sales', count: 0, sourceRow: 8, sourceColumn: 'B' },
  { month: '2026-01', city: 'Все', metric: 'losses', count: 12, sourceRow: 4, sourceColumn: 'D' },
], sources: [
  { key: 'sales', url: 'https://docs.google.com/spreadsheets/d/18AsqW5bhWTTsMYKqWH73AC335llbGlggSA0tGRUEkyw/edit?gid=1815158623', sheetName: 'Договоры', sheetId: 1815158623, status: 'ready', readAt: '2026-11-06T07:00:00Z', fromMonth: '2020-01', toMonth: '2026-10', warnings: [] },
  { key: 'losses', url: 'https://docs.google.com/spreadsheets/d/1h0cg9NzgfhN_THJBrelCWeMEYMGCqbSoBMFpVAM01-M/edit?gid=104', sheetName: 'Сводка по месяцам', sheetId: 104, status: 'ready', readAt: '2026-11-06T07:00:00Z', fromMonth: '2025-11', toMonth: '2026-09', warnings: [] },
] });
function api(call) {
  const exports = {};
  runInNewContext(`(function(exports, require) {${js}\n})`, {})(exports, () => ({ callReportApi: call }));
  return exports;
}

test('demand API preserves observed zero, independent sources and source status', async () => {
  const value = snapshot();
  value.status = 'partial'; value.sources[1].status = 'cached';
  const client = api(async () => value);
  assert.equal(await client.loadDemandOutcomes(), value);
  assert.equal((await client.refreshDemandOutcomes('test')).records[0].count, 0);
});

test('bad snapshots and unsafe source destinations reject rather than replace the displayed snapshot', async () => {
  for (const change of [
    value => { value.records = null; },
    value => { value.records[0].count = -1; },
    value => { value.records[1].city = 'МСК'; },
    value => { value.sources[0].url = 'javascript:alert(1)'; },
    value => { value.sources[1] = value.sources[0]; },
  ]) {
    const value = snapshot(); change(value);
    await assert.rejects(api(async () => value).loadDemandOutcomes(), /неизвестного формата/);
  }
});

test('concurrent initial reads share one call and failed reads can be retried', async () => {
  let calls = 0;
  const client = api(async () => { calls++; if (calls === 1) throw Error('offline'); return snapshot(); });
  const first = client.loadDemandOutcomes();
  assert.equal(first, client.loadDemandOutcomes());
  await assert.rejects(first, /offline/);
  assert.equal((await client.loadDemandOutcomes()).status, 'ready');
  assert.equal(calls, 2);
});

test('city loss counts keep their separate source coordinates and cannot use another city column', async () => {
  const value = snapshot();
  value.records.push({ month: '2026-01', city: 'МСК', metric: 'losses', count: 90, sourceRow: 18, sourceColumn: 'G' },
    { month: '2026-01', city: 'СПБ', metric: 'losses', count: 75, sourceRow: 18, sourceColumn: 'I' });
  value.sources[1].breakdown = { url: 'https://docs.google.com/spreadsheets/d/1h0cg9NzgfhN_THJBrelCWeMEYMGCqbSoBMFpVAM01-M/edit?gid=105',
    sheetName: 'Распределение потока', sheetId: 105, fromMonth: '2025-11', toMonth: '2026-08' };
  assert.equal((await api(async () => value).loadDemandOutcomes()).records[2].count, 90);
  value.records[2].sourceColumn = 'I';
  await assert.rejects(api(async () => value).loadDemandOutcomes(), /неизвестного формата/);
});

test('city breakdown metadata rejects an unapproved destination', async () => {
  const value = snapshot();
  value.sources[1].breakdown = { url: 'javascript:alert(1)', sheetName: 'Распределение потока', sheetId: 105, fromMonth: '2025-11', toMonth: '2026-08' };
  await assert.rejects(api(async () => value).loadDemandOutcomes(), /неизвестного формата/);
});

const withExamGroups = () => {
  const value = snapshot();
  value.sources.push({ key: 'examGroups', url: 'https://docs.google.com/spreadsheets/d/1ZPbHfKN6smZKKRqPa-pqjYqf1U9pzUi1YLYhy_5wsnQ/edit?gid=522389953',
    sheetName: 'СВОД', sheetId: 522389953, status: 'ready', readAt: '2026-11-17T08:00:00Z', fromMonth: '2023-06', toMonth: '2026-10', warnings: [] });
  value.records.push({ month: '2026-10', city: 'СПБ', metric: 'examGroups', count: 339, sourceRow: 2, sourceColumn: 'AA' });
  return value;
};

test('new clients opt into SPB exam groups while accepting a legacy two-source backend', async () => {
  const calls = [];
  const client = api(async (...args) => { calls.push(args); return calls.length === 1 ? snapshot() : withExamGroups(); });
  assert.equal((await client.loadDemandOutcomes()).sources.length, 2);
  assert.equal((await client.refreshDemandOutcomes('test')).records.at(-1).count, 339);
  assert.equal(calls[0][1].includeExamGroups, true);
  assert.equal(calls[1][1].includeExamGroups, true);
});

test('exam groups require their approved source, aggregate start row and SPB scope', async () => {
  for (const mutate of [
    value => { value.records.at(-1).city = 'Все'; },
    value => { value.records.at(-1).city = 'МСК'; },
    value => { value.records.at(-1).sourceRow = 181; },
    value => { value.records.at(-1).sourceColumn = 'AX'; },
    value => { value.sources.at(-1).sheetId = 0; },
    value => { value.sources.at(-1).url = 'https://example.com/'; },
    value => { value.sources.pop(); },
    value => { value.sources[0] = value.sources[2]; },
  ]) {
    const value = withExamGroups(); mutate(value);
    await assert.rejects(api(async () => value).loadDemandOutcomes(), /неизвестного формата/);
  }
});
