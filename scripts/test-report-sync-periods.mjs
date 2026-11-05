import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/api/reportSyncPeriods.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { buildReportSyncPeriods } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

test('single days and exact two-day periods retain inclusive boundaries', () => {
  assert.deepEqual(buildReportSyncPeriods('2026-10-01', '2026-10-01'), [{ fromDate: '2026-10-01', toDate: '2026-10-01' }]);
  assert.deepEqual(buildReportSyncPeriods('2026-10-01', '2026-10-02'), [{ fromDate: '2026-10-01', toDate: '2026-10-02' }]);
  assert.deepEqual(buildReportSyncPeriods('2026-10-01', '2026-10-05'), [
    { fromDate: '2026-10-01', toDate: '2026-10-02' },
    { fromDate: '2026-10-03', toDate: '2026-10-04' },
    { fromDate: '2026-10-05', toDate: '2026-10-05' },
  ]);
});

test('a complete month becomes consecutive bounded intervals with no missing or duplicated dates', () => {
  const periods = buildReportSyncPeriods('2026-10-01', '2026-10-31');
  assert.equal(periods.length, 16);
  assert.deepEqual(periods[0], { fromDate: '2026-10-01', toDate: '2026-10-02' });
  assert.deepEqual(periods.at(-1), { fromDate: '2026-10-31', toDate: '2026-10-31' });
  const dates = periods.flatMap((period) => {
    const result = [];
    for (let date = Date.parse(`${period.fromDate}T00:00:00Z`); date <= Date.parse(`${period.toDate}T00:00:00Z`); date += 86400000) result.push(new Date(date).toISOString().slice(0, 10));
    assert.ok(result.length <= 2);
    return result;
  });
  assert.equal(dates.length, 31);
  assert.equal(new Set(dates).size, 31);
  assert.deepEqual(dates, Array.from({ length: 31 }, (_, index) => `2026-10-${String(index + 1).padStart(2, '0')}`));
});

test('leap days, year boundaries and daylight-saving changes use calendar dates consistently', () => {
  assert.deepEqual(buildReportSyncPeriods('2024-02-27', '2024-03-05'), [
    { fromDate: '2024-02-27', toDate: '2024-02-28' }, { fromDate: '2024-02-29', toDate: '2024-03-01' },
    { fromDate: '2024-03-02', toDate: '2024-03-03' }, { fromDate: '2024-03-04', toDate: '2024-03-05' },
  ]);
  assert.deepEqual(buildReportSyncPeriods('2026-12-29', '2027-01-06'), [
    { fromDate: '2026-12-29', toDate: '2026-12-30' }, { fromDate: '2026-12-31', toDate: '2027-01-01' },
    { fromDate: '2027-01-02', toDate: '2027-01-03' }, { fromDate: '2027-01-04', toDate: '2027-01-05' },
    { fromDate: '2027-01-06', toDate: '2027-01-06' },
  ]);
  assert.deepEqual(buildReportSyncPeriods('2026-03-25', '2026-03-31'), [
    { fromDate: '2026-03-25', toDate: '2026-03-26' }, { fromDate: '2026-03-27', toDate: '2026-03-28' },
    { fromDate: '2026-03-29', toDate: '2026-03-30' }, { fromDate: '2026-03-31', toDate: '2026-03-31' },
  ]);
});

test('invalid, incomplete and reversed ranges are rejected before any import', () => {
  for (const [from, to] of [
    ['2026-10-02', '2026-10-01'], ['2026-02-29', '2026-03-01'], ['2024-02-30', '2024-03-01'],
    ['2026-13-01', '2026-13-03'], ['2026-10-1', '2026-10-02'], ['', '2026-10-02'],
    ['2026-10-01T00:00:00Z', '2026-10-02'], ['2026-10-01', 'not-a-date'],
  ]) assert.throws(() => buildReportSyncPeriods(from, to), /дат|период/i);
});

const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const appTree = ts.createSourceFile('App.tsx', appSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let syncDeclaration;
let syncEndDeclaration;
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'syncAmoCrmLeads') syncDeclaration = node.getText(appTree);
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'getSalesDepartmentSyncToDate') syncEndDeclaration = node.getText(appTree);
  ts.forEachChild(node, visit);
}
visit(appTree);
const syncJs = ts.transpileModule(syncDeclaration, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function harness(api, refresh = async () => {}) {
  const messages = [];
  const loading = [];
  const sync = runInNewContext(`${syncJs};syncAmoCrmLeads;`, {
    apiConfigured: true, writePassword: 'test-password', buildReportSyncPeriods,
    formatDay: (value) => `${value.slice(8, 10)}.${value.slice(5, 7)}`,
    setIsSavingDaily: (value) => loading.push(value), setSavedMessage: (value) => messages.push(value),
    callReportApi: api, refreshMainReportSnapshot: refresh, getErrorMessage: (error) => error.message,
  });
  return { sync, messages, loading };
}

test('the actual refresh waits for each interval, keeps credentials and reads the report once after all writes', async () => {
  let releaseFirst;
  const firstFinished = new Promise((resolve) => { releaseFirst = resolve; });
  const calls = [];
  const h = harness(async (action, period, password) => {
    calls.push({ action, ...period, password });
    if (calls.length === 1) await firstFinished;
    return { status: 'success', message: `PS coverage through ${period.toDate}`, warnings: [] };
  }, async () => calls.push('read'));
  const result = h.sync('2026-10-01', '2026-10-05');
  assert.equal(calls.length, 1);
  releaseFirst();
  await result;
  assert.deepEqual(calls, [
    { action: 'syncAmoCrmLeads', fromDate: '2026-10-01', toDate: '2026-10-02', password: 'test-password' },
    { action: 'syncAmoCrmLeads', fromDate: '2026-10-03', toDate: '2026-10-04', password: 'test-password' },
    { action: 'syncAmoCrmLeads', fromDate: '2026-10-05', toDate: '2026-10-05', password: 'test-password' }, 'read',
  ]);
  assert.match(h.messages.at(-1), /01\.10.*05\.10/);
  assert.match(h.messages.at(-1), /PS coverage through 2026-10-05/);
  assert.ok(h.messages.some((message) => message.includes('2/3')));
  assert.deepEqual(h.loading, [true, false]);
});

test('a failed interval stops subsequent writes, rereads partial saved facts, and names the failed interval', async () => {
  const calls = [];
  const h = harness(async (_, period) => {
    calls.push(period.fromDate);
    if (period.fromDate === '2026-10-03') throw new Error('server timeout');
    return { status: 'warning', message: 'PS coverage through 2026-10-02', warnings: ['PS data only through 02.10'] };
  }, async () => calls.push('read'));
  await assert.rejects(h.sync('2026-10-01', '2026-10-21'), /server timeout/);
  assert.deepEqual(calls, ['2026-10-01', '2026-10-03', 'read']);
  assert.match(h.messages.at(-1), /03\.10.*04\.10/);
  assert.match(h.messages.at(-1), /останов|не заверш/i);
  assert.match(h.messages.at(-1), /PS data only through 02\.10/);
  assert.doesNotMatch(h.messages.at(-1), /за 01\.10.*21\.10 обновлён/);
  assert.deepEqual(h.loading, [true, false]);
});

test('server error results stop the refresh and a failed post-write read cannot claim complete success', async () => {
  let writes = 0;
  let reads = 0;
  const h = harness(async () => { writes += 1; return { status: 'error', message: 'provider error' }; }, async () => { reads += 1; });
  await assert.rejects(h.sync('2026-10-01', '2026-10-16'), /provider error/);
  assert.equal(writes, 1);
  assert.equal(reads, 1);
  const readFail = harness(async () => ({ status: 'warning', message: 'PS coverage through 2026-10-07', warnings: ['retained warning'] }), async () => { throw new Error('snapshot unavailable'); });
  await assert.rejects(readFail.sync('2026-10-01', '2026-10-07'), /snapshot unavailable/);
  assert.match(readFail.messages.at(-1), /сохранен|сохранён/i);
  assert.match(readFail.messages.at(-1), /snapshot unavailable/);
  assert.match(readFail.messages.at(-1), /retained warning/);
});

test('the final notice retains actual warning results while omitting informational warnings from successful periods', async () => {
  const h = harness(async (_, period) => period.fromDate === '2026-10-01'
    ? { status: 'warning', message: 'PS coverage is partial', warnings: ['Actual PS coverage warning'] }
    : { status: 'success', message: 'PS coverage through 2026-10-14', warnings: ['Informational page count and qualification policy'] });
  await h.sync('2026-10-01', '2026-10-14');
  assert.match(h.messages.at(-1), /Actual PS coverage warning/);
  assert.match(h.messages.at(-1), /PS coverage through 2026-10-14/);
  assert.doesNotMatch(h.messages.at(-1), /Informational page count/);
});

test('the refresh-button period stops on Moscow today, covers a closed month and excludes a future month', async () => {
  const js = ts.transpileModule(syncEndDeclaration, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const syncEnd = runInNewContext(`${js}; getSalesDepartmentSyncToDate;`, { getTodayIso: () => '2026-11-05' });
  const current = syncEnd({ monthKey: '2026-11', daysInMonth: 30 });
  assert.equal(current, '2026-11-05');
  assert.equal(syncEnd({ monthKey: '2026-10', daysInMonth: 31 }), '2026-10-31');
  assert.equal(syncEnd({ monthKey: '2026-12', daysInMonth: 31 }), null);
  const calls = [];
  await harness(async (_, period) => { calls.push(period); return { status: 'success' }; }).sync('2026-11-01', current);
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    { fromDate: '2026-11-01', toDate: '2026-11-02' },
    { fromDate: '2026-11-03', toDate: '2026-11-04' },
    { fromDate: '2026-11-05', toDate: '2026-11-05' },
  ]);
});
