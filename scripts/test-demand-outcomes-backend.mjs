import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../apps-script/DemandOutcomes.gs', import.meta.url), 'utf8');
const salesId = '18AsqW5bhWTTsMYKqWH73AC335llbGlggSA0tGRUEkyw';
const lossesId = '1h0cg9NzgfhN_THJBrelCWeMEYMGCqbSoBMFpVAM01-M';
const months = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const clone = value => JSON.parse(JSON.stringify(value));

function salesBlock(city, offset) {
  return [[city, ...months], ...Array.from({ length: 7 }, (_, year) => [2020 + year,
    ...Array.from({ length: 12 }, (_, month) => year === 6 && month > 9 ? '' : offset + year * 12 + month)])];
}

function lossesBlock() {
  const labels = [...months.slice(10), ...months.slice(0, 10)];
  return [['Месяц', 'Заявки', 'Договоры', 'Сливы', 'Конверсия', 'Доля сливов'],
    ...labels.map((month, index) => index === 11 ? [month, '', '', '', '', ''] : [month, 100 + index, 70, 30 + index, 70 / (100 + index), (30 + index) / (100 + index)]),
    ['Среднее / итог', 1155, 770, 385, 770 / 1155, 385 / 1155]];
}

function fixture({ lockAvailable = true } = {}) {
  const blocks = { moscow: salesBlock('Москва', 0), petersburg: salesBlock('Питер', 100), losses: lossesBlock() };
  const props = {};
  const sourceErrors = new Set();
  const replacedSheetIds = new Map();
  const sourceReads = [], sourceWrites = [], cacheWrites = [], propertyWrites = [], lockRequests = [];
  let cacheValues = [], hasCache = false, releases = 0, serial = 0;
  let failCacheWrite = false, failPropertyWrite = false;
  let period = 'АНАЛИЗ СЛИВОВ | ноябрь 2025 — август 2026';
  const parseRange = (args, values) => {
    if (typeof args[0] !== 'string') return args;
    const match = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(args[0]);
    assert.ok(match, `Unexpected range: ${args[0]}`);
    const column = letters => [...letters].reduce((n, char) => n * 26 + char.charCodeAt(0) - 64, 0);
    const firstRow = Number(match[2]), firstColumn = column(match[1]);
    return [firstRow, firstColumn, match[4] ? Number(match[4]) - firstRow + 1 : 1, match[3] ? column(match[3]) - firstColumn + 1 : 1];
  };
  const cacheSheet = {
    getName: () => 'Demand_Outcomes_Monthly', getSheetId: () => 900,
    getLastRow: () => cacheValues.length, getLastColumn: () => Math.max(0, ...cacheValues.map(row => row.length)),
    getMaxRows: () => 10000, getMaxColumns: () => 26,
    setFrozenRows: () => {},
    getRange: (...args) => {
      const [row, column, height, width] = parseRange(args, cacheValues);
      return {
        getValues: () => Array.from({ length: height }, (_, i) => Array.from({ length: width }, (_, j) => cacheValues[row - 1 + i]?.[column - 1 + j] ?? '')),
        setValues: values => {
          if (failCacheWrite) throw Error('private-secret cache append failed');
          cacheWrites.push({ row, column, values: clone(values) });
          for (let i = 0; i < values.length; i++) {
            cacheValues[row - 1 + i] ??= [];
            for (let j = 0; j < values[i].length; j++) cacheValues[row - 1 + i][column - 1 + j] = values[i][j];
          }
        },
      };
    },
  };
  const nativeSheet = (bookId, sheetId) => ({
    getName: () => sheetId === 1815158623 ? 'Договоры' : sheetId === 104 ? 'Сводка по месяцам' : 'Лист1',
    getSheetId: () => replacedSheetIds.get(sheetId) ?? sheetId,
    getRange: (...args) => {
      const [row, column, height, width] = parseRange(args);
      const key = [bookId, sheetId, row, column, height, width].join(':');
      sourceReads.push(key);
      let values;
      if (bookId === salesId && sheetId === 1815158623 && row === 1 && column === 1 && height === 8 && width === 13) values = blocks.moscow;
      else if (bookId === salesId && sheetId === 1815158623 && row === 11 && column === 1 && height === 8 && width === 13) values = blocks.petersburg;
      else if (bookId === lossesId && sheetId === 104 && row === 1 && column === 1 && height === 14 && width === 6) values = blocks.losses;
      else if (bookId === lossesId && sheetId === 0 && row === 1 && column === 1 && height === 1 && width === 1) values = [[period]];
      else throw Error(`Unbounded or unexpected source read ${key}`);
      return { getValues: () => clone(values), getDisplayValues: () => clone(values), setValues: values => { sourceWrites.push(values); throw Error('Source sheets are read only'); } };
    },
  });
  const api = runInNewContext(`${source}\n({ get: getDemandOutcomes_, sync: syncDemandOutcomes_ });`, {
    PropertiesService: { getScriptProperties: () => ({
      getProperty: key => props[key] ?? null,
      setProperty: (key, value) => {
        if (failPropertyWrite) throw Error('private-secret property commit failed');
        propertyWrites.push([key, value]); props[key] = String(value);
      },
      deleteProperty: key => { delete props[key]; },
    }) },
    SpreadsheetApp: { flush: () => {}, openById: id => {
      assert.ok([salesId, lossesId].includes(id), 'Only the two approved sources may be read');
      if (sourceErrors.has(id)) throw Error('private-secret token=upstream-sensitive-details');
      return {
        getSheetById: sheetId => nativeSheet(id, sheetId),
        getSheetByName: name => {
          if (id === salesId) { assert.equal(name, 'Договоры'); return nativeSheet(id, 1815158623); }
          assert.ok(['Сводка по месяцам', 'Лист1'].includes(name));
          return nativeSheet(id, name === 'Лист1' ? 0 : 104);
        },
        getSheets: () => id === salesId ? [nativeSheet(id, 1815158623)] : [nativeSheet(id, 104), nativeSheet(id, 0)],
      };
    } },
    getWeeklyReportSpreadsheet_: () => ({
      getSheetByName: name => { assert.equal(name, 'Demand_Outcomes_Monthly'); return hasCache ? cacheSheet : null; },
      insertSheet: name => { assert.equal(name, 'Demand_Outcomes_Monthly'); hasCache = true; return cacheSheet; },
    }),
    LockService: { getScriptLock: () => ({ tryLock: millis => { lockRequests.push(millis); return lockAvailable; }, releaseLock: () => { releases++; } }) },
    Utilities: { getUuid: () => `fixture-generation-${++serial}`, formatDate: (date, zone, pattern) => {
      if (pattern === 'yyyy-MM') return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit' }).format(date);
      return date.toISOString();
    } },
    UrlFetchApp: { fetch: () => { throw Error('Monthly sources must be read through bounded native sheet ranges'); } },
  });
  return { api, blocks, props, sourceErrors, replacedSheetIds, sourceReads, sourceWrites, cacheWrites, propertyWrites, lockRequests,
    cache: () => clone(cacheValues), releases: () => releases,
    editCache: mutate => { mutate(cacheValues); },
    failCache: value => { failCacheWrite = value; }, failCommit: value => { failPropertyWrite = value; },
    setPeriod: value => { period = value; } };
}

const read = f => clone(f.api.get());
const series = (result, metric) => result.records.filter(record => record.metric === metric);
const sourceState = (result, key) => result.sources.find(item => item.key === key);
const attemptSync = f => { try { return clone(f.api.sync()); } catch (error) { return { error: String(error) }; } };

test('public reads use only approved bounded source ranges and never write cache or source workbooks', () => {
  const f = fixture();
  const result = read(f);
  assert.equal(result.status, 'ready');
  assert.equal(result.records.length, 175);
  assert.equal(f.sourceReads.length, 4);
  assert.equal(f.cacheWrites.length, 0);
  assert.equal(f.propertyWrites.length, 0);
  assert.equal(f.sourceWrites.length, 0);
  assert.equal(f.lockRequests.length, 0, 'Public reads must not acquire a writer lock');
  assert.equal(result.sources.length, 2);
  for (const item of result.sources) {
    assert.equal(item.status, 'ready');
    assert.ok(item.readAt);
    assert.ok(item.sheetId === 1815158623 || item.sheetId === 104);
    assert.ok(item.url.includes('/spreadsheets/d/'));
  }
});

test('sales preserve historical years, genuine zeroes, provenance and blank future months', () => {
  const f = fixture();
  const result = read(f);
  const sales = series(result, 'sales');
  assert.equal(sales.length, 164);
  assert.deepEqual([...new Set(sales.map(row => row.city))].sort(), ['МСК', 'СПБ']);
  assert.equal(sales.find(row => row.month === '2020-01' && row.city === 'МСК').count, 0);
  assert.equal(sales.find(row => row.month === '2026-10' && row.city === 'МСК').sourceRow, 8);
  assert.equal(sales.find(row => row.month === '2026-10' && row.city === 'СПБ').sourceRow, 18);
  assert.equal(sales.find(row => row.month === '2026-10' && row.city === 'СПБ').sourceColumn, 'K');
  assert.equal(sales.some(row => row.month > '2026-10'), false);
  assert.equal(sales.filter(row => row.month.startsWith('2025-')).length, 24);
  assert.equal(sourceState(result, 'sales').fromMonth, '2020-01');
  assert.equal(sourceState(result, 'sales').toMonth, '2026-10');
});

test('loss months cross the explicit 2025–2026 year boundary and omit totals and unreported October', () => {
  const result = read(fixture());
  const losses = series(result, 'losses');
  assert.equal(losses.length, 11);
  assert.equal(losses.find(row => row.month === '2025-11').count, 30);
  assert.equal(losses.find(row => row.month === '2025-12').sourceRow, 3);
  assert.equal(losses.find(row => row.month === '2026-01').sourceRow, 4);
  assert.equal(losses.find(row => row.month === '2026-09').sourceColumn, 'D');
  assert.equal(losses.every(row => row.city === 'Все'), true);
  assert.equal(losses.some(row => row.month === '2026-10'), false);
  assert.equal(losses.some(row => row.count === 385), false);
});

test('blank monthly cells stay unknown while native numeric zero is reported for either metric', () => {
  const f = fixture();
  for (const block of [f.blocks.moscow, f.blocks.petersburg]) block[7][10] = '';
  f.blocks.losses[2] = ['Декабрь', 70, 70, 0, 1, 0];
  f.blocks.losses[13][1] -= 31;
  f.blocks.losses[13][3] -= 31;
  const result = read(f);
  assert.equal(series(result, 'sales').some(row => row.month === '2026-10'), false);
  assert.equal(series(result, 'losses').find(row => row.month === '2025-12').count, 0);
});

for (const [label, alter] of [
  ['wrong city', f => { f.blocks.moscow[0][0] = 'Москва и область'; }],
  ['reordered month headers', f => { [f.blocks.moscow[0][1], f.blocks.moscow[0][2]] = [f.blocks.moscow[0][2], f.blocks.moscow[0][1]]; }],
  ['duplicate year', f => { f.blocks.moscow[2][0] = 2020; }],
  ['conflicting city year', f => { f.blocks.petersburg[7][0] = 2027; }],
  ['negative count', f => { f.blocks.moscow[1][1] = -1; }],
  ['fractional count', f => { f.blocks.moscow[1][1] = 1.25; }],
  ['unsafe integer', f => { f.blocks.moscow[1][1] = '9007199254740993'; }],
  ['spreadsheet error cell', f => { f.blocks.moscow[1][1] = '#VALUE!'; }],
]) {
  test(`invalid sales ${label} cannot poison the independent losses series or its confirmed cache`, () => {
    const f = fixture();
    f.api.sync();
    alter(f);
    const result = read(f);
    assert.notEqual(result.status, 'ready');
    assert.equal(sourceState(result, 'sales').status, 'cached');
    assert.equal(series(result, 'sales').length, 164);
    assert.equal(series(result, 'losses').length, 11);
    assert.equal(sourceState(result, 'losses').status, 'ready');
  });
}

for (const [label, alter] of [
  ['missing period anchor', f => { f.setPeriod('Нет периода'); }],
  ['ambiguous period year', f => { f.setPeriod('АНАЛИЗ СЛИВОВ | ноябрь — август'); }],
  ['wrong headers', f => { f.blocks.losses[0][3] = 'Выручка'; }],
  ['reordered months', f => { [f.blocks.losses[2][0], f.blocks.losses[3][0]] = [f.blocks.losses[3][0], f.blocks.losses[2][0]]; }],
  ['applications less than contracts', f => { f.blocks.losses[1][1] = 60; }],
  ['conflicting loss count', f => { f.blocks.losses[1][3] = 999; }],
  ['partial monthly row', f => { f.blocks.losses[1][2] = ''; }],
]) {
  test(`invalid losses ${label} cannot replace its successful snapshot or change sales`, () => {
    const f = fixture();
    f.api.sync();
    alter(f);
    const result = read(f);
    assert.notEqual(result.status, 'ready');
    assert.equal(sourceState(result, 'losses').status, 'cached');
    assert.equal(series(result, 'losses').length, 11);
    assert.equal(series(result, 'sales').length, 164);
    assert.equal(sourceState(result, 'sales').status, 'ready');
  });
}

test('explicit sync commits source snapshots under a bounded writer lock and public reads observe source changes', () => {
  const f = fixture();
  const synced = clone(f.api.sync());
  assert.equal(synced.status, 'ready');
  assert.ok(f.cacheWrites.length > 0);
  assert.deepEqual(f.lockRequests, [1000]);
  assert.equal(f.releases(), 1);
  assert.ok(f.props.DEMAND_OUTCOMES_CACHE_INDEX);
  const writes = f.cacheWrites.length, commits = f.propertyWrites.length;
  f.blocks.moscow[7][10] = 777;
  assert.equal(series(read(f), 'sales').find(row => row.month === '2026-10' && row.city === 'МСК').count, 777);
  assert.equal(f.cacheWrites.length, writes);
  assert.equal(f.propertyWrites.length, commits);
  assert.equal(f.sourceWrites.length, 0);
});

test('a failed source reuses only its last committed generation while successful source data continues to refresh', () => {
  const f = fixture();
  f.api.sync();
  f.sourceErrors.add(salesId);
  f.blocks.losses[1][1] = 101;
  f.blocks.losses[1][3] = 31;
  f.blocks.losses[13][1] += 1;
  f.blocks.losses[13][3] += 1;
  const result = clone(f.api.sync());
  assert.equal(sourceState(result, 'sales').status, 'cached');
  assert.equal(sourceState(result, 'losses').status, 'ready');
  assert.equal(series(result, 'sales').find(row => row.month === '2020-01' && row.city === 'МСК').count, 0);
  assert.equal(series(result, 'losses').find(row => row.month === '2025-11').count, 31);
  f.sourceErrors.add(lossesId);
  const cached = read(f);
  assert.equal(series(cached, 'losses').find(row => row.month === '2025-11').count, 31);
  assert.equal(JSON.stringify(cached).includes('private-secret'), false);
  assert.equal(JSON.stringify(cached).includes('upstream-sensitive-details'), false);
});

test('unavailable sources without a committed cache return explicit errors rather than made-up zeroes', () => {
  const f = fixture();
  f.sourceErrors.add(salesId);
  f.sourceErrors.add(lossesId);
  const result = read(f);
  assert.equal(result.status, 'error');
  assert.deepEqual(result.records, []);
  assert.equal(result.sources.every(item => item.status === 'error'), true);
  assert.equal(f.cacheWrites.length, 0);
  assert.equal(JSON.stringify(result).includes('private-secret'), false);
});

test('wrong source provenance cannot expose an otherwise valid committed cache', () => {
  const f = fixture();
  f.api.sync();
  const original = f.props.DEMAND_OUTCOMES_CACHE_INDEX;
  f.props.DEMAND_OUTCOMES_CACHE_INDEX = f.props.DEMAND_OUTCOMES_CACHE_INDEX.replaceAll(salesId, 'another-source-id').replaceAll(lossesId, 'another-losses-id');
  assert.notEqual(f.props.DEMAND_OUTCOMES_CACHE_INDEX, original);
  f.sourceErrors.add(salesId);
  f.sourceErrors.add(lossesId);
  const result = read(f);
  assert.deepEqual(result.records, []);
  assert.equal(result.status, 'error');
});

test('a replacement tab with the old title but a different sheet ID is rejected before values are used', () => {
  const f = fixture();
  f.replacedSheetIds.set(1815158623, 123);
  const result = read(f);
  assert.equal(sourceState(result, 'sales').status, 'error');
  assert.deepEqual(series(result, 'sales'), []);
  assert.equal(sourceState(result, 'losses').status, 'ready');
  assert.equal(f.sourceReads.some(key => key.startsWith(`${salesId}:`)), false);
});

test('an edited cached count invalidates only that source’s committed generation', () => {
  const f = fixture();
  f.api.sync();
  f.editCache(values => { values.find(row => row[1] === 'sales')[8] = 999; });
  f.sourceErrors.add(salesId);
  f.sourceErrors.add(lossesId);
  const result = read(f);
  assert.deepEqual(series(result, 'sales'), []);
  assert.equal(series(result, 'losses').length, 11);
  assert.equal(sourceState(result, 'sales').status, 'error');
  assert.equal(sourceState(result, 'losses').status, 'cached');
});

test('malformed cache index JSON is ignored without exposing orphaned rows or writing replacements', () => {
  const f = fixture();
  f.api.sync();
  const writes = f.cacheWrites.length;
  f.props.DEMAND_OUTCOMES_CACHE_INDEX = '{not-json';
  f.sourceErrors.add(salesId);
  f.sourceErrors.add(lossesId);
  assert.deepEqual(read(f).records, []);
  assert.equal(f.cacheWrites.length, writes);
});

for (const failure of ['append', 'commit']) {
  test(`failed cache ${failure} preserves previously committed generations after source values change`, () => {
    const f = fixture();
    f.api.sync();
    const priorIndex = f.props.DEMAND_OUTCOMES_CACHE_INDEX;
    f.blocks.moscow[1][1] = 555;
    f.blocks.losses[1][1] = 171;
    f.blocks.losses[1][3] = 101;
    f.blocks.losses[13][1] += 71;
    f.blocks.losses[13][3] += 71;
    if (failure === 'append') f.failCache(true); else f.failCommit(true);
    attemptSync(f);
    assert.equal(f.props.DEMAND_OUTCOMES_CACHE_INDEX, priorIndex);
    f.sourceErrors.add(salesId);
    f.sourceErrors.add(lossesId);
    const result = read(f);
    assert.equal(series(result, 'sales').find(row => row.month === '2020-01' && row.city === 'МСК').count, 0);
    assert.equal(series(result, 'losses').find(row => row.month === '2025-11').count, 30);
    assert.equal(f.releases(), 2);
    assert.equal(JSON.stringify(result).includes('private-secret'), false);
  });
}

test('a busy explicit sync never writes and does not release another execution’s lock', () => {
  const f = fixture({ lockAvailable: false });
  const result = attemptSync(f);
  assert.ok(result.error || result.status !== 'ready');
  assert.deepEqual(f.lockRequests, [1000]);
  assert.equal(f.releases(), 0);
  assert.equal(f.cacheWrites.length, 0);
  assert.equal(f.propertyWrites.length, 0);
  assert.equal(f.sourceWrites.length, 0);
});
