import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {test} from 'node:test';

const directory = new URL('../apps-script/', import.meta.url);
const source = readdirSync(directory).filter(name => name.endsWith('.gs'))
  .map(name => readFileSync(new URL(name, directory), 'utf8')).join('\n');
const propertyKey = 'MONTHLY_QUALIFICATION_ADJUSTMENT_2026-10';
const copy = value => JSON.parse(JSON.stringify(value));
const payload = (overrides = {}) => ({phase: 'setReferralOverride', monthKey: '2026-10',
  targetReferrals: 56, baselineReferrals: 31, ...overrides});
const saved = (overrides = {}) => ({kind: 'referralOverride', targetReferrals: 56,
  baselineReferrals: 31, deduction: 25, scope: 'Все', updatedAt: '2026-11-11T13:00:00.000Z', ...overrides});

function fixture(options = {}) {
  const properties = new Map(options.properties || []);
  const state = {reads: [], writes: [], locks: 0, releases: 0};
  const forbidden = () => {throw new Error('Unexpected source, sheet or fact access');};
  const api = runInNewContext(`${source}
    ensureServiceSheets_ = upsertRowsById_ = rebuildWeeklySummary_ = forbidden;
    readObjects_ = readConfiguredSheet;
    fetchAmoCrmEndpoint_ = fetchAmoCrmLeadsByDateField_ = forbidden;
    verifyPassword_ = password => password === 'test-pass';
    jsonResponse = value => value;
    ({post: doPost, refresh: syncAmoCrmMonth_, read: typeof readMonthlyQualificationAdjustment_ === 'function'
      ? readMonthlyQualificationAdjustment_ : undefined, decorate: decorateMonthConfig_});`, {
    forbidden,
    readConfiguredSheet: options.readObjects || forbidden,
    Utilities: {formatDate: () => options.today || '2026-11-11'},
    PropertiesService: {getScriptProperties: () => ({
      getProperty: key => {state.reads.push(key); return properties.get(key) ?? null;},
      setProperty: (key, value) => {state.writes.push({key, value}); properties.set(key, value);},
    })},
    LockService: {getScriptLock: () => ({
      tryLock: () => {state.locks++; return options.lockAvailable !== false;},
      releaseLock: () => {state.releases++;},
    })},
    SpreadsheetApp: new Proxy({}, {get: forbidden}),
    UrlFetchApp: new Proxy({}, {get: forbidden}),
  });
  return {api, state, properties};
}

test('authorized referral total stores only a shared monthly adjustment without importing or editing facts', () => {
  const f = fixture();
  const result = copy(f.api.refresh(payload()));
  assert.equal(result.monthKey, '2026-10');
  assert.deepEqual({...result.qualificationAdjustment, updatedAt: 'fixed'}, {...saved(), updatedAt: 'fixed'});
  assert.match(result.qualificationAdjustment.updatedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.equal(f.state.writes.length, 1);
  assert.equal(f.state.writes[0].key, propertyKey);
  assert.deepEqual(JSON.parse(f.properties.get(propertyKey)), result.qualificationAdjustment);
  assert.equal(f.state.locks, 1);
  assert.equal(f.state.releases, 1);
});

test('repeating the same override preserves its timestamp and cannot deduct a second time', () => {
  const f = fixture({properties: [[propertyKey, JSON.stringify(saved())]]});
  const result = copy(f.api.refresh(payload()));
  assert.deepEqual(result.qualificationAdjustment, saved());
  assert.equal(f.state.writes.length, 0);
  assert.equal(f.state.releases, 1);
});

test('an explicit replacement stores the absolute target rather than accumulating an earlier deduction', () => {
  const f = fixture({properties: [[propertyKey, JSON.stringify(saved({targetReferrals: 50, deduction: 19}))]]});
  const result = copy(f.api.refresh(payload()));
  assert.equal(result.qualificationAdjustment.deduction, 25);
  assert.equal(f.state.writes.length, 1);
});

test('override is protected by the existing password check before properties or locking are accessed', () => {
  const f = fixture();
  const request = password => f.api.post({postData: {contents: JSON.stringify({
    action: 'syncAmoCrmMonth', password, payload: payload(),
  })}});
  const rejected = request('wrong');
  assert.equal(rejected.ok, false);
  assert.match(rejected.error, /пароль/);
  assert.deepEqual(f.state, {reads: [], writes: [], locks: 0, releases: 0});
  const accepted = request('test-pass');
  assert.equal(accepted.ok, true);
  assert.equal(accepted.data.qualificationAdjustment.deduction, 25);
});

test('normal monthly metadata reads do not initialize or rewrite service sheets', () => {
  const f = fixture({properties: [[propertyKey, JSON.stringify(saved())]], readObjects: name =>
    name === 'Month_Config' ? [{monthKey: '2026-10', label: 'Октябрь 2026', year: 2026, monthIndex: 9, daysInMonth: 31}] : []});
  const response = copy(f.api.post({postData: {contents: JSON.stringify({action: 'getMonths'})}}));
  assert.equal(response.ok, true);
  assert.equal(response.data[0].qualificationAdjustment.targetReferrals, 56);
  assert.equal(f.state.writes.length, 0);
  assert.equal(f.state.locks, 0);
});

test('only a completed October 2026 and safe nonnegative integer counts are accepted before mutation', () => {
  for (const invalid of [
    {monthKey: '2026-11'}, {monthKey: '2025-10'}, {monthKey: '../2026-10'},
    {targetReferrals: '56'}, {baselineReferrals: '31'}, {targetReferrals: -1},
    {baselineReferrals: -1}, {targetReferrals: 31.5}, {baselineReferrals: NaN},
    {targetReferrals: Infinity}, {targetReferrals: Number.MAX_SAFE_INTEGER + 1},
    {baselineReferrals: 57},
  ]) {
    const f = fixture();
    assert.throws(() => f.api.refresh(payload(invalid)), /октябр|количеств|цел|значен/i);
    assert.equal(f.state.writes.length, 0);
    assert.equal(f.state.locks, 0);
  }
  const f = fixture({today: '2026-10-31'});
  assert.throws(() => f.api.refresh(payload()), /заверш/);
  assert.equal(f.state.writes.length, 0);
});

test('lock contention rejects the update without touching properties or releasing another writer lock', () => {
  const f = fixture({lockAvailable: false});
  assert.throws(() => f.api.refresh(payload()), /выполняется|позже/);
  assert.deepEqual(f.state, {reads: [], writes: [], locks: 1, releases: 0});
});

test('saved October adjustment is exposed in month config while November remains unchanged', () => {
  const f = fixture({properties: [[propertyKey, JSON.stringify(saved())]]});
  const month = monthKey => ({monthKey, label: monthKey, year: 2026, monthIndex: 9, daysInMonth: 31});
  const october = copy(f.api.decorate(month('2026-10'), []));
  assert.deepEqual(october.qualificationAdjustment, saved());
  const november = copy(f.api.decorate(month('2026-11'), []));
  assert.equal(Object.hasOwn(november, 'qualificationAdjustment'), false);
  assert.deepEqual(f.state.reads, [propertyKey]);
  assert.equal(f.state.writes.length, 0);
});

test('missing adjustment is omitted entirely from October config rather than creating a zero override', () => {
  const f = fixture();
  assert.equal(f.api.read('2026-10'), undefined);
  const config = f.api.decorate({monthKey: '2026-10', year: 2026, monthIndex: 9}, []);
  assert.equal(Object.hasOwn(config, 'qualificationAdjustment'), false);
  assert.equal(f.state.writes.length, 0);
});

test('corrupt persisted adjustment fails closed and releases the setter lock without silently resetting it', () => {
  for (const raw of ['{', 'null', '[]', '{}',
    JSON.stringify(saved({kind: 'other'})), JSON.stringify(saved({scope: 'МСК'})),
    JSON.stringify(saved({deduction: 56})), JSON.stringify(saved({targetReferrals: '56'})),
    JSON.stringify(saved({updatedAt: 'bad'})), JSON.stringify(saved({updatedAt: '2026-99-99T13:00:00.000Z'})),
  ]) {
    const f = fixture({properties: [[propertyKey, raw]]});
    assert.throws(() => f.api.read('2026-10'), /корректиров/i);
    assert.throws(() => f.api.refresh(payload()), /корректиров/i);
    assert.equal(f.state.writes.length, 0);
    assert.equal(f.state.releases, 1);
  }
});

test('standalone main script fixtures keep decorating legacy configs without loading the optional helper', () => {
  const main = readFileSync(new URL('AppsScript.gs', directory), 'utf8');
  const forbidden = () => {throw new Error('Unexpected property access');};
  const decorate = runInNewContext(`${main}\ndecorateMonthConfig_;`, {
    PropertiesService: {getScriptProperties: forbidden},
  });
  const config = decorate({monthKey: '2026-10', year: 2026, monthIndex: 9}, []);
  assert.equal(Object.hasOwn(config, 'qualificationAdjustment'), false);
});
