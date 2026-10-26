import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

const source = readFileSync(new URL('../apps-script/Wordstat.gs', import.meta.url), 'utf8');
const headers = ['id', 'month', 'city', 'regionId', 'count', 'share', 'updatedAt'];
const now = '2026-10-26T12:00:00.000Z';
const credentials = { WORDSTAT_API_KEY: 'test-secret', WORDSTAT_FOLDER_ID: 'test-folder' };
const plain = value => JSON.parse(JSON.stringify(value));

function monthlyResults(count = '123') {
  const rows = [];
  for (let year = 2022; year <= 2026; year++) {
    for (let month = 1; month <= (year === 2026 ? 9 : 12); month++) {
      rows.push({ date: `${year}-${String(month).padStart(2, '0')}-01T00:00:00Z`, count, share: '0.0123' });
    }
  }
  return { results: rows };
}

function cachedRow(month = '2026-08', city = 'МСК', count = 10) {
  return [`${city}:${month}`, month, city, city === 'МСК' ? '213' : '2', count, '', '2026-09-02T10:00:00.000Z'];
}

function fixture({ properties = credentials, rows = [], responses, lockAvailable = true } = {}) {
  const props = { ...properties };
  let values = rows.length ? [headers, ...rows] : [];
  let hasSheet = rows.length > 0;
  const requests = [];
  const writes = [];
  let releases = 0;
  const sheet = {
    getLastRow: () => values.length,
    getLastColumn: () => headers.length,
    getMaxRows: () => 1000,
    getMaxColumns: () => 26,
    getRange: (row, column, rowCount, columnCount) => ({
      getValues: () => values.slice(row - 1, row - 1 + rowCount).map(item => item.slice(column - 1, column - 1 + columnCount)),
      setValues: next => {
        writes.push(plain(next));
        for (let index = 0; index < next.length; index++) values[row - 1 + index] = Array.from(next[index]);
      },
    }),
    setFrozenRows: () => {},
  };
  const api = runInNewContext(`${source}\nwordstatNow_ = () => new Date('${now}');\n({ get: getWordstatDemand_, sync: syncWordstatDemand_ });`, {
    PropertiesService: { getScriptProperties: () => ({
      getProperty: name => props[name] ?? null,
      setProperty: (name, value) => { props[name] = String(value); },
      deleteProperty: name => { delete props[name]; },
    }) },
    getWeeklyReportSpreadsheet_: () => ({
      getSheetByName: () => hasSheet ? sheet : null,
      insertSheet: () => { hasSheet = true; return sheet; },
    }),
    LockService: { getScriptLock: () => ({ tryLock: () => typeof lockAvailable === 'function' ? lockAvailable() : lockAvailable, releaseLock: () => { releases++; } }) },
    Utilities: { formatDate: date => new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit',
    }).format(date) },
    UrlFetchApp: { fetch: (url, options) => {
      requests.push({ url, ...plain(options) });
      const response = responses?.[requests.length - 1] ?? { status: 200, body: monthlyResults() };
      if (response.error) throw new Error(response.error);
      return { getResponseCode: () => response.status, getContentText: () => typeof response.body === 'string' ? response.body : JSON.stringify(response.body) };
    } },
  });
  return { api, props, requests, writes, values: () => values, releases: () => releases };
}

test('without Cloud credentials the public read returns setup state without network calls or fabricated values', () => {
  const f = fixture({ properties: {} });
  const result = plain(f.api.get());
  assert.equal(result.status, 'not_configured');
  assert.equal(result.configured, false);
  assert.equal(result.phrase, 'автошкола');
  assert.equal(result.latestAvailableMonth, '2026-09');
  assert.deepEqual(result.records, []);
  assert.equal(f.requests.length, 0);
  assert.equal(f.writes.length, 0);
  assert.throws(() => f.api.sync(), /подключ/);
});

test('credentials and provider response details never appear in public error output', () => {
  const f = fixture({ responses: [{ status: 403, body: 'test-secret test-folder upstream debug' }] });
  const result = plain(f.api.get());
  assert.equal(result.status, 'error');
  assert.match(result.warnings.join(' '), /403/);
  const output = JSON.stringify(result);
  for (const secret of ['test-secret', 'test-folder', 'upstream debug']) assert.equal(output.includes(secret), false);
});

test('automatic first load fetches both cities with monthly v2 requests and writes one complete shared snapshot', () => {
  const f = fixture();
  const result = plain(f.api.get());
  assert.equal(result.status, 'ready');
  assert.equal(result.records.length, 114);
  assert.equal(result.lastSyncedAt, now);
  assert.equal(f.requests.length, 2);
  const bodies = f.requests.map(request => JSON.parse(request.payload));
  assert.deepEqual(bodies.map(body => body.regions), [['213'], ['2']]);
  for (const [index, request] of f.requests.entries()) {
    assert.equal(request.url, 'https://searchapi.api.cloud.yandex.net/v2/wordstat/dynamics');
    assert.equal(request.headers.Authorization, 'Api-key test-secret');
    assert.equal(request.method, 'post');
    assert.equal(request.contentType, 'application/json');
    assert.deepEqual(bodies[index], {
      phrase: 'автошкола', period: 'PERIOD_MONTHLY', regions: index ? ['2'] : ['213'],
      devices: ['DEVICE_ALL'], folderId: 'test-folder',
      fromDate: '2022-01-01T00:00:00Z', toDate: '2026-09-30T00:00:00Z',
    });
  }
  assert.equal(f.writes.length, 1);
  assert.deepEqual(f.values()[0], headers);
  assert.equal(result.records.filter(row => row.city === 'МСК').length, 57);
  assert.equal(result.records.some(row => row.month >= '2026-10'), false);
  assert.equal(f.releases(), 1);
});

test('a fresh shared cache is returned without any provider request', () => {
  const f = fixture({ rows: [cachedRow('2026-09'), cachedRow('2026-09', 'СПБ')] });
  const result = plain(f.api.get());
  assert.equal(result.status, 'ready');
  assert.equal(result.records.length, 2);
  assert.equal(f.requests.length, 0);
  assert.equal(f.writes.length, 0);
});

test('a manual sync refreshes both cities but preserves history outside the fetch window', () => {
  const f = fixture({ rows: [cachedRow('2021-12'), cachedRow('2026-09'), cachedRow('2026-09', 'СПБ')] });
  const result = plain(f.api.sync());
  assert.equal(result.status, 'ready');
  assert.equal(result.records.length, 115);
  assert.equal(result.records.find(row => row.month === '2021-12').count, 10);
  assert.equal(result.records.find(row => row.month === '2026-09' && row.city === 'МСК').count, 123);
  assert.equal(new Set(f.values().slice(1).map(row => row[0])).size, 115);
});

test('a failed second city leaves both old city series intact and automatic reads back off for an hour', () => {
  const rows = [cachedRow(), cachedRow('2026-08', 'СПБ')];
  const f = fixture({ rows, responses: [{ status: 200, body: monthlyResults('999') }, { status: 503, body: 'temporary' }] });
  const first = plain(f.api.get());
  assert.equal(first.status, 'error');
  assert.match(first.connectionMessage, /HTTP 503/);
  assert.deepEqual(first.records.map(row => row.count), [10, 10]);
  assert.equal(f.writes.length, 0);
  const second = plain(f.api.get());
  assert.equal(second.status, 'error');
  assert.equal(f.requests.length, 2);
  assert.deepEqual(f.values(), [headers, ...rows]);
});

test('a prior automatic failure older than one hour can be retried', () => {
  const f = fixture({ properties: { ...credentials, WORDSTAT_LAST_ATTEMPT_AT: '2026-10-26T10:00:00.000Z', WORDSTAT_LAST_ERROR: 'Временная ошибка.' } });
  assert.equal(f.api.get().status, 'ready');
  assert.equal(f.requests.length, 2);
  assert.equal(f.props.WORDSTAT_LAST_ERROR, undefined);
});

test('an unavailable refresh lock returns existing data and never makes concurrent provider calls', () => {
  const f = fixture({ rows: [cachedRow()], lockAvailable: false });
  const result = plain(f.api.get());
  assert.equal(result.records.length, 1);
  assert.equal(f.requests.length, 0);
  assert.match(result.warnings.join(' '), /обнов/);
  assert.throws(() => f.api.sync(), /обнов/);
});

test('a reader waiting for the refresh lock respects an error recorded by the prior execution', () => {
  const f = fixture({ rows: [cachedRow()], lockAvailable: () => {
    f.props.WORDSTAT_LAST_ATTEMPT_AT = now;
    f.props.WORDSTAT_LAST_ERROR = 'Wordstat: временная ошибка.';
    return true;
  } });
  const result = plain(f.api.get());
  assert.equal(result.status, 'error');
  assert.equal(result.records.length, 1);
  assert.equal(f.requests.length, 0);
  assert.equal(f.releases(), 1);
});

test('zero is a valid count and an omitted share stays absent instead of being manufactured', () => {
  const body = monthlyResults('0');
  delete body.results[0].share;
  const f = fixture({ responses: [{ status: 200, body }, { status: 200, body }] });
  const result = plain(f.api.sync());
  assert.equal(result.records.every(row => row.count === 0), true);
  assert.equal(result.records.find(row => row.month === '2022-01').share, null);
});

for (const [label, alter] of [
  ['empty results', body => { body.results = []; }],
  ['missing month', body => { body.results.splice(5, 1); }],
  ['empty count', body => { body.results[0].count = ''; }],
  ['negative count', body => { body.results[0].count = '-1'; }],
  ['fractional count', body => { body.results[0].count = '1.2'; }],
  ['unsafe integer', body => { body.results[0].count = '9007199254740993'; }],
  ['invalid share', body => { body.results[0].share = 'bad'; }],
  ['duplicate month', body => { body.results[1] = { ...body.results[0] }; }],
  ['current month', body => { body.results.push({ date: '2026-10-01T00:00:00Z', count: '2' }); }],
  ['invalid date', body => { body.results[0].date = '2022-01-32T00:00:00Z'; }],
]) {
  test(`provider ${label} cannot replace previously cached history`, () => {
    const body = monthlyResults();
    alter(body);
    const f = fixture({ rows: [cachedRow()], responses: [{ status: 200, body }] });
    assert.throws(() => f.api.sync(), /Wordstat/);
    assert.equal(f.writes.length, 0);
    assert.equal(f.values()[1][4], 10);
  });
}

test('provider transport errors are sanitized and do not overwrite cache', () => {
  const f = fixture({ rows: [cachedRow()], responses: [{ error: 'Authorization Api-key test-secret' }] });
  const result = plain(f.api.get());
  assert.equal(result.status, 'error');
  assert.equal(JSON.stringify(result).includes('test-secret'), false);
  assert.equal(f.writes.length, 0);
});

test('public demand reads work independently, but forced provider refresh requires the report password', () => {
  const routerSource = readFileSync(new URL('../apps-script/AppsScript.gs', import.meta.url), 'utf8');
  const api = runInNewContext(`${routerSource}\n${source}
    let refreshes = 0;
    ensureServiceSheets_ = () => { throw new Error('Unrelated report setup must not run'); };
    verifyPassword_ = password => password === 'allowed';
    jsonResponse = value => value;
    getWordstatDemand_ = () => ({ configured: false });
    syncWordstatDemand_ = () => { refreshes++; return { status: 'ready' }; };
    ({ request: body => doPost({ postData: { contents: JSON.stringify(body) } }), refreshes: () => refreshes });
  `);
  assert.equal(api.request({ action: 'getWordstatDemand' }).data.configured, false);
  assert.equal(api.request({ action: 'syncWordstatDemand' }).ok, false);
  assert.equal(api.refreshes(), 0);
  assert.equal(api.request({ action: 'syncWordstatDemand', password: 'allowed' }).ok, true);
  assert.equal(api.refreshes(), 1);
});
