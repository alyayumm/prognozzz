import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/api/reportSyncPeriods.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { buildReportSyncPeriods, getMainReportSyncFromDate } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

function confirmedRecords(through = 12) {
  return Array.from({ length: through }, (_, index) => `2026-11-${String(index + 1).padStart(2, '0')}`)
    .flatMap(date => ['МСК', 'СПБ'].flatMap(city => [
      { date, city, channel: 'Город', metric: 'Лиды', fact: 0, comment: 'amoCRM [AMO_LEADS_ALL=1]' },
      { date, city, channel: 'Город', metric: 'Квалы', fact: 0 },
      { date, city, channel: 'Город', metric: 'Продажи', fact: 0, trafficSales: 0 },
    ]));
}

test('current-month catch-up rechecks the latest confirmed day before loading missing dates', () => {
  assert.equal(getMainReportSyncFromDate('2026-11', '2026-11-16', confirmedRecords(), '2026-11-16'), '2026-11-12');
});

test('a lagging city or an earlier hole cannot be hidden by a later confirmed day', () => {
  const cityBehind = confirmedRecords().filter(record => !(record.city === 'СПБ' && record.date > '2026-11-10'));
  assert.equal(getMainReportSyncFromDate('2026-11', '2026-11-16', cityBehind, '2026-11-16'), '2026-11-10');
  const hole = confirmedRecords(16).filter(record => !(record.city === 'МСК' && record.date === '2026-11-05' && record.metric === 'Квалы'));
  assert.equal(getMainReportSyncFromDate('2026-11', '2026-11-16', hole, '2026-11-16'), '2026-11-04');
});

test('planned rows, manual facts and source rows never confirm city imports', () => {
  const planned = confirmedRecords(16).map(record => ({ ...record, comment: '' }));
  const otherChannels = confirmedRecords(16).flatMap(record => [
    { ...record, channel: 'Ручная корректировка' }, { ...record, channel: 'Источник', city: 'источники' },
  ]);
  assert.equal(getMainReportSyncFromDate('2026-11', '2026-11-16', [...planned, ...otherChannels], '2026-11-16'), '2026-11-01');
  assert.equal(getMainReportSyncFromDate('2026-11', '2026-11-16', [], '2026-11-16'), '2026-11-01');
});

test('missing qualification or blank traffic sales remains unconfirmed but imported zeros are valid', () => {
  for (const invalid of [undefined, '', null, NaN, -1]) {
    const records = confirmedRecords(16).map(record => record.date === '2026-11-08' && record.city === 'СПБ' && record.metric === 'Продажи'
      ? { ...record, trafficSales: invalid } : record);
    assert.equal(getMainReportSyncFromDate('2026-11', '2026-11-16', records, '2026-11-16'), '2026-11-07');
  }
  const missingFact = confirmedRecords(16).map(record => record.date === '2026-11-08' && record.city === 'МСК' && record.metric === 'Квалы'
    ? { ...record, fact: undefined } : record);
  assert.equal(getMainReportSyncFromDate('2026-11', '2026-11-16', missingFact, '2026-11-16'), '2026-11-07');
});

test('today is always refreshed and the last complete day is rechecked even when all rows exist', () => {
  assert.equal(getMainReportSyncFromDate('2026-11', '2026-11-16', confirmedRecords(16), '2026-11-16'), '2026-11-15');
  assert.equal(getMainReportSyncFromDate('2026-11', '2026-11-01', confirmedRecords(), '2026-11-01'), '2026-11-01');
});

test('a closed-month main refresh keeps the complete month instead of applying catch-up', () => {
  const october = confirmedRecords(16).map(record => ({ ...record, date: record.date.replace('2026-11', '2026-10') }));
  assert.equal(getMainReportSyncFromDate('2026-10', '2026-10-31', october, '2026-11-16'), '2026-10-01');
});

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
let mainRefreshExpression;
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'syncAmoCrmLeads') syncDeclaration = node.getText(appTree);
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'getSalesDepartmentSyncToDate') syncEndDeclaration = node.getText(appTree);
  if (ts.isJsxAttribute(node) && node.name.getText(appTree) === 'onRefreshAmo' && node.initializer && ts.isJsxExpression(node.initializer)) mainRefreshExpression = node.initializer.expression.getText(appTree);
  ts.forEachChild(node, visit);
}
visit(appTree);

test('the actual main refresh button catches up both cities from shared records, retaining closed-month refreshes', async () => {
  const js = ts.transpileModule(`const handler = ${mainRefreshExpression}; handler;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  for (const [monthKey, expected] of [['2026-11', '2026-11-12'], ['2026-10', '2026-10-01']]) {
    const calls = [];
    const handler = runInNewContext(js, {
      mode: 'month', selectedMonthConfig: { monthKey }, currentMonthAllRecords: confirmedRecords(),
      getTodayIso: () => '2026-11-16', getMainReportSyncFromDate,
      getSalesDepartmentSyncToDate: () => monthKey === '2026-11' ? '2026-11-16' : '2026-10-31',
      syncAmoCrmLeads: async (fromDate, toDate, psFromDate) => { calls.push({ fromDate, toDate, psFromDate }); },
    });
    await handler();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].fromDate, expected);
    assert.equal(calls[0].psFromDate, monthKey === '2026-11' ? '2026-11-01' : undefined);
  }
});
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

test('current-month catch-up refreshes all month payments after the amo intervals and before the final snapshot', async () => {
  const calls = [];
  const h = harness(async (action, period, password) => {
    calls.push({ action, ...period, password });
    return action === 'syncPsSales'
      ? { status: 'warning', message: 'PS month refreshed', warnings: ['PS payments pending today'] }
      : { status: 'success', message: 'AMO interval refreshed' };
  }, async () => calls.push('read'));
  await h.sync('2026-11-12', '2026-11-15', '2026-11-01');
  assert.deepEqual(calls, [
    { action: 'syncAmoCrmLeads', fromDate: '2026-11-12', toDate: '2026-11-13', password: 'test-password' },
    { action: 'syncAmoCrmLeads', fromDate: '2026-11-14', toDate: '2026-11-15', password: 'test-password' },
    { action: 'syncPsSales', fromDate: '2026-11-01', toDate: '2026-11-15', password: 'test-password' }, 'read',
  ]);
  assert.match(h.messages.at(-1), /PS month refreshed/);
  assert.match(h.messages.at(-1), /PS payments pending today/);
});

test('an unsuccessful full-month payment refresh is named separately and rereads saved facts without retrying', async () => {
  for (const failure of ['error result', 'timeout']) {
    const calls = [];
    const h = harness(async (action, period) => {
      calls.push({ action, ...period });
      if (action === 'syncPsSales') {
        if (failure === 'timeout') throw new Error('PS timeout');
        return { status: 'error', message: 'PS unavailable' };
      }
      return { status: 'success' };
    }, async () => calls.push('read'));
    await assert.rejects(h.sync('2026-11-14', '2026-11-15', '2026-11-01'), /PS timeout|PS unavailable/);
    assert.deepEqual(calls, [
      { action: 'syncAmoCrmLeads', fromDate: '2026-11-14', toDate: '2026-11-15' },
      { action: 'syncPsSales', fromDate: '2026-11-01', toDate: '2026-11-15' }, 'read',
    ]);
    assert.match(h.messages.at(-1), /ПС.*01\.11.*15\.11/);
    assert.match(h.messages.at(-1), /не заверш|останов/);
    assert.match(h.messages.at(-1), /сохранённые данные перечитаны/);
    assert.doesNotMatch(h.messages.at(-1), /обновлён и перечитан/);
    assert.deepEqual(h.loading, [true, false]);
  }
});

test('a failed amo interval prevents the optional full-month payment refresh', async () => {
  const calls = [];
  const h = harness(async action => { calls.push(action); throw new Error('AMO timeout'); }, async () => calls.push('read'));
  await assert.rejects(h.sync('2026-11-12', '2026-11-16', '2026-11-01'), /AMO timeout/);
  assert.deepEqual(calls, ['syncAmoCrmLeads', 'read']);
});

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
