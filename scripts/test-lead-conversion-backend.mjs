import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

const source = ['SchoolRegistry.gs', 'LeadConversion.gs'].map(file => readFileSync(new URL('../apps-script/' + file, import.meta.url), 'utf8')).join('\n');
const plain = value => JSON.parse(JSON.stringify(value));
const headers = ['id', 'date', 'city', 'brand', 'domain', 'source', 'visits', 'leads', 'rawSource', 'updatedAt', 'utmCampaign', 'utmMedium', 'schoolId'];
const dateRange = (start, end) => {
  const days = [];
  for (let d = new Date(`${start}T00:00:00Z`); d <= new Date(`${end}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) days.push(d.toISOString().slice(0, 10));
  return days;
};
const row = (host = 'autodrive.msk.ru', channel = 'direct1', visits = 10, leads = 2, title = 'Яндекс.Директ') => ({
  dimensions: { host: { value: host }, marker_level_1: { value: channel, title } },
  metrics: { visits: { value: visits }, leads: { value: leads } },
});
const report = (start = '2026-10-01', end = '2026-10-02', rows = [row()]) => ({ status: 'success', data: dateRange(start, end).map(date => ({
  dateFrom: `${date}T00:00:00+0300`, dateTo: `${date}T23:59:59+0300`, items: rows,
})) });
const cacheRow = (date = '2026-09-30') => [`${date}:old`, date, 'МСК', 'Автодрайв', 'autodrive.msk.ru', 'SEO', 20, 3, 'seo', '2026-10-01T10:00:00Z'];

function fixture({ values = [], properties = { ROISTAT_API_KEY: 'secret-key' }, response = report(), transportError = false, locked = false } = {}) {
  const props = { ...properties }, requests = [], writes = [];
  let cells = plain(values), hasSheet = values.length > 0, released = 0, stateWrites = 0;
  const sheet = {
    getLastRow: () => cells.length, getLastColumn: () => Math.max(headers.length, ...cells.map(r => r.length)),
    getMaxRows: () => 10000, getMaxColumns: () => 26,
    getRange: (r, c, h, w) => ({
      getValues: () => Array.from({ length: h }, (_, i) => Array.from({ length: w }, (_, j) => cells[r - 1 + i]?.[c - 1 + j] ?? '')),
      setValues: next => {
        assert.ok(requests.length, 'no cache writes before provider response'); writes.push(plain(next));
        for (let i = 0; i < next.length; i++) { cells[r - 1 + i] ||= []; for (let j = 0; j < next[i].length; j++) {
          const value = next[i][j];
          cells[r - 1 + i][c - 1 + j] = typeof value === 'string' && value.startsWith("'") ? value.slice(1) : value;
        } }
      },
    }),
    setFrozenRows: () => {}, insertRowsAfter: () => {}, insertColumnsAfter: () => {},
  };
  const api = runInNewContext(`${source}\n({get:getLeadConversion_,sync:syncLeadConversion_});`, {
    CONFIG: { roistatApiKeyProperty: 'ROISTAT_API_KEY' },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: key => props[key] || null,
      setProperty: (key, value) => { props[key] = value; stateWrites++; },
    }) },
    getWeeklyReportSpreadsheet_: () => ({ getSheetByName: name => { assert.equal(name, 'Lead_Conversion_Daily'); return hasSheet ? sheet : null; }, insertSheet: name => { assert.equal(name, 'Lead_Conversion_Daily'); hasSheet = true; return sheet; } }),
    fetchRoistatEndpoint_: (method, payload) => { assert.equal(method, 'analytics/data'); requests.push(plain(payload)); if (transportError) throw Error('secret-key should never be exposed'); return plain(response); },
    eachDateInRange_: dateRange,
    canonicalRoistatBrand_: domain => domain.includes('autodrive') ? 'Автодрайв' : domain.includes('izidrive') ? 'Изи Драйв' : domain.includes('hermes') ? 'Гермес' : domain,
    LockService: { getScriptLock: () => ({ tryLock: () => !locked, releaseLock: () => { released++; } }) },
  });
  return { api, requests, writes, props, values: () => cells, releases: () => released, stateWrites: () => stateWrites };
}

test('public snapshot without credentials is an honest read with no writes or provider calls', () => {
  const f = fixture({ properties: {} });
  const data = plain(f.api.get({ monthKey: '2026-10' }));
  assert.equal(data.configured, false); assert.deepEqual(data.records, []); assert.equal(data.coverage, null);
  assert.equal(f.requests.length, 0); assert.equal(f.writes.length, 0);
  assert.throws(() => f.api.sync({ fromDate: '2026-10-01', toDate: '2026-10-02' }), /Roistat/);
});

test('sync fetches visits and leads together at native source+host grain and Moscow days without CRM filters', () => {
  const f = fixture();
  const data = plain(f.api.sync({ fromDate: '2026-10-01', toDate: '2026-10-02' }));
  assert.deepEqual(f.requests[0], { dimensions: ['host', 'marker_level_1', 'utm_campaign', 'utm_medium'], metrics: ['visits', 'leads'], interval: '1d', period: { from: '2026-10-01T00:00:00+0300', to: '2026-10-02T23:59:59+0300' } });
  assert.equal(data.records.length, 2); assert.equal(data.records[0].city, 'МСК'); assert.equal(data.records[0].brand, 'АвтоДрайв_МСК');
  assert.equal(data.records[0].source, 'Яндекс.Директ'); assert.equal(data.records[0].visits, 10); assert.equal(data.records[0].leads, 2);
  assert.deepEqual(data.coverage, { fromDate: '2026-10-01', toDate: '2026-10-02' });
  assert.equal(f.releases(), 1); assert.equal(f.stateWrites(), 1);
});

test('zero rows and empty confirmed days count toward coverage while unknown source/domain rows remain intact', () => {
  const data = report(); data.data[1].items = [];
  data.data[0].items = [row('', 'unknown', 12, 3, 'Нераспознанное'), row('izidrive.ru', 'telegram', 0, 1, 'Telegram'), row('hermesrf-spb.ru', '', 4, 0, 'Прямые визиты')];
  const f = fixture({ response: data });
  const result = plain(f.api.sync({ fromDate: '2026-10-01', toDate: '2026-10-02' }));
  assert.deepEqual(result.coverage, { fromDate: '2026-10-01', toDate: '2026-10-02' });
  assert.equal(result.records.length, 3);
  assert.equal(result.records.find(r => r.source === 'Нераспознанное').city, 'Не определён');
  assert.equal(result.records.find(r => r.source === 'Telegram').city, 'Не определён');
  assert.equal(result.records.find(r => r.domain === 'hermesrf-spb.ru').city, 'СПБ');
  assert.equal(result.records.reduce((sum, r) => sum + r.visits, 0), 16);
  assert.equal(result.records.reduce((sum, r) => sum + r.leads, 0), 4);
  assert.ok(result.warnings.some(w => /распредел/i.test(w)));
});

test('provider source text beginning with equals stays literal in Sheets and round-trips unchanged', () => {
  const f = fixture({ response: report('2026-10-01', '2026-10-02', [row('autodrive.msk.ru', '=raw', 10, 2, '=1+1')]) });
  const result = plain(f.api.sync({ fromDate: '2026-10-01', toDate: '2026-10-02' }));
  assert.equal(f.writes[0][1][headers.indexOf('source')], "'=1+1");
  assert.equal(f.writes[0][1][headers.indexOf('rawSource')], "'=raw");
  assert.equal(result.records[0].source, '=1+1');
  assert.equal(result.records[0].rawSource, '=raw');
});

test('numeric-looking source labels remain text and older coerced cache cells normalize to strings', () => {
  const data = report('2026-10-01', '2026-10-02', [row('autodrive.msk.ru', '00123', 10, 2, '00123')]);
  const f = fixture({ response: data });
  const result = plain(f.api.sync({ fromDate: '2026-10-01', toDate: '2026-10-02' }));
  assert.equal(f.writes[0][1][headers.indexOf('source')], "'00123");
  assert.equal(result.records[0].source, '00123');
  const cached = cacheRow();
  cached[headers.indexOf('source')] = 582830582830;
  cached[headers.indexOf('rawSource')] = 582830582830;
  const older = plain(fixture({ values: [headers, cached] }).api.get({ monthKey: '2026-09' }));
  assert.equal(older.records[0].source, '582830582830');
  assert.equal(older.records[0].rawSource, '582830582830');
});

test('partial, malformed, missing-metric or failed provider responses preserve all saved rows and coverage', () => {
  const bad = [];
  const partial = report(); partial.data.pop(); bad.push(partial);
  const noLeads = report(); delete noLeads.data[0].items[0].metrics.leads; bad.push(noLeads);
  const malformed = report(); malformed.data[0].items[0].metrics.visits.value = 'bad'; bad.push(malformed);
  const negative = report(); negative.data[0].items[0].metrics.leads.value = -1; bad.push(negative);
  const shifted = report(); shifted.data[0].dateFrom = '2026-09-30T00:00:00+0300'; bad.push(shifted);
  const noEnd = report(); delete noEnd.data[0].dateTo; bad.push(noEnd);
  const badEnd = report(); badEnd.data[0].dateTo = 'invalid'; bad.push(badEnd);
  const totalsMismatch = report(); totalsMismatch.data[0].mean = { metrics: { visits: { value: 1000 }, leads: { value: 2 } } }; bad.push(totalsMismatch);
  for (const response of bad) {
    const old = [headers, cacheRow()];
    const f = fixture({ values: old, response });
    assert.throws(() => f.api.sync({ fromDate: '2026-10-01', toDate: '2026-10-02' }));
    assert.deepEqual(f.values(), old); assert.equal(f.writes.length, 0); assert.equal(f.stateWrites(), 0);
  }
  const f = fixture({ transportError: true });
  assert.throws(() => f.api.sync({ fromDate: '2026-10-01', toDate: '2026-10-02' }), error => !error.message.includes('secret-key'));
  assert.equal(f.writes.length, 0);
});

test('replacement clears stale requested rows in one batch while preserving other periods and no other service sheets', () => {
  const old = [headers, cacheRow(), cacheRow('2026-10-01'), cacheRow('2026-11-01')];
  const f = fixture({ values: old, response: report('2026-10-01', '2026-10-02', []) });
  const result = plain(f.api.sync({ fromDate: '2026-10-01', toDate: '2026-10-02' }));
  assert.deepEqual(result.records, []); assert.deepEqual(result.coverage, { fromDate: '2026-10-01', toDate: '2026-10-02' });
  assert.equal(f.writes.length, 1);
  const nonempty = f.values().slice(1).filter(r => r.some(x => x !== ''));
  assert.deepEqual(nonempty.map(r => r[1]), ['2026-09-30', '2026-11-01']);
});

test('cache headers may move; adjacent sync ranges merge but gaps never produce false continuous coverage', () => {
  const props = { ROISTAT_API_KEY: 'secret-key', LEAD_CONVERSION_STATE: JSON.stringify({ '2026-10': { ranges: [{ fromDate: '2026-10-01', toDate: '2026-10-02' }], updatedAt: 'old', warnings: [] } }) };
  const f = fixture({ properties: props, values: [headers, cacheRow('2026-10-01')], response: report('2026-10-03', '2026-10-04') });
  const result = plain(f.api.sync({ fromDate: '2026-10-03', toDate: '2026-10-04' }));
  assert.deepEqual(result.coverage, { fromDate: '2026-10-01', toDate: '2026-10-04' });
  const g = fixture({ properties: props, response: report('2026-10-10', '2026-10-10') });
  const gap = plain(g.api.sync({ fromDate: '2026-10-10', toDate: '2026-10-10' }));
  assert.equal(gap.coverage, null); assert.ok(gap.warnings.some(w => /разрыв/i.test(w)));
  const reversed = [...headers].reverse();
  const rowValues = [...cacheRow('2026-10-01'), '', '', ''];
  const h = fixture({ values: [reversed, [...rowValues].reverse()], properties: props });
  assert.equal(h.api.get({ monthKey: '2026-10' }).records[0].visits, 20);
});

test('nested provider totals are not added to leaf values and UTC interval boundaries become Moscow dates', () => {
  const data = report('2026-10-01', '2026-10-01');
  data.data[0].dateFrom = '2026-09-30T21:00:00+0000'; data.data[0].dateTo = '2026-10-01T20:59:59+0000';
  data.data[0].items = [{ dimensions: { host: { value: 'autodrive.msk.ru' } }, metrics: { visits: { value: 15 }, leads: { value: 3 } }, items: [row('autodrive.msk.ru'), row('autodrive.msk.ru', 'seo', 5, 1, 'SEO')] }];
  const f = fixture({ response: data });
  const result = plain(f.api.sync({ fromDate: '2026-10-01', toDate: '2026-10-01' }));
  assert.equal(result.records.reduce((n, r) => n + r.visits, 0), 15);
  assert.equal(result.records.reduce((n, r) => n + r.leads, 0), 3);
  assert.ok(result.records.every(r => r.date === '2026-10-01'));
});

test('invalid dates, excessive range and busy lock stop before provider or cache writes', () => {
  for (const payload of [{ fromDate: '2026-02-31', toDate: '2026-03-01' }, { fromDate: '2026-11-01', toDate: '2026-10-01' }, { fromDate: '2026-01-01', toDate: '2026-10-01' }]) {
    const f = fixture(); assert.throws(() => f.api.sync(payload)); assert.equal(f.requests.length, 0); assert.equal(f.writes.length, 0);
  }
  const f = fixture({ locked: true }); assert.throws(() => f.api.sync({ fromDate: '2026-10-01', toDate: '2026-10-02' }));
  assert.equal(f.requests.length, 0); assert.equal(f.writes.length, 0);
});

test('a daily interval may end at the next exclusive Moscow midnight', () => {
  const response = report('2026-10-01', '2026-10-01'); response.data[0].dateTo = '2026-10-02T00:00:00+0300';
  const f = fixture({ response });
  assert.deepEqual(plain(f.api.sync({ fromDate: '2026-10-01', toDate: '2026-10-01' }).coverage), { fromDate: '2026-10-01', toDate: '2026-10-01' });
});

test('city mapping uses explicit hostname labels or verified sites and never confuses Tomsk or Omsk with Moscow', () => {
  const cases = [
    ['tomsk.ru', 'Не определён'], ['omsk.ru', 'Не определён'], ['омск.рф', 'Не определён'],
    ['izidrive.ru', 'Не определён'], ['hermes-mos.ru', 'МСК'], ['newbrandmsk.ru', 'Не определён'],
    ['autodrive.msk.ru', 'МСК'], ['izidrive.msk.ru', 'МСК'], ['rulevoy-msk.ru', 'МСК'],
    ['avtoshkola-flagmanmsk.ru', 'МСК'], ['avtomotospb.ru', 'СПБ'], ['hermesrf-spb.ru', 'СПБ'], ['академика-спб.рф', 'СПБ'],
  ];
  const f = fixture({ response: report('2026-10-01', '2026-10-01', cases.map(([host]) => row(host))) });
  const records = f.api.sync({ fromDate: '2026-10-01', toDate: '2026-10-01' }).records;
  for (const [domain, city] of cases) assert.equal(records.find(record => record.domain === domain).city, city, domain);
});

test('observed Cyrillic and landing aliases join their exact registered school without cross-city merging', () => {
  const domains = ['автошкола-автодрайв.москва', 'автодрайв.спб.рф', 'autodrive-school-ru.creatium.site'];
  const f = fixture({ response: report('2026-10-01', '2026-10-01', domains.map(domain => row(domain))) });
  const records = f.api.sync({ fromDate: '2026-10-01', toDate: '2026-10-01' }).records;
  assert.equal(records.find(r => r.domain === domains[0]).schoolId, '949581');
  assert.ok(records.filter(r => r.domain !== domains[0]).every(r => r.schoolId === '949579' && r.city === 'СПБ'));
});

test('registry separates same-name schools and binds exact UTM campaign+city on shared or missing hosts', () => {
  const input = (domain, campaign, medium, visits = 10) => {
    const item = row(domain, 'ya', visits, 2, 'ya');
    item.dimensions.utm_campaign = { value: campaign };
    item.dimensions.utm_medium = { value: medium };
    return item;
  };
  const rows = [
    input('autodrive.msk.ru', '', ''), input('autodrive-school.ru', '', ''),
    input('izidrive.ru', 'izidrive', 'msk', 20), input('izidrive.ru', 'izidrive', 'spb', 30),
    input('izidrive.ru', 'izidrive', 'cpc', 40), input('', 'avtoshkola-yaguarspb', 'spb'),
    input('avtoshkola-yaguarmsk.ru', '', ''), input('hermes-mos.ru', 'hermesrf-spb', 'spb'),
    input('autodrive-school.ru', 'autodrive-school', 'msk'),
    input('autodrive.msk.ru', 'autodrive-school', 'spb'),
  ];
  const f = fixture({ response: report('2026-10-01', '2026-10-01', rows) });
  const data = plain(f.api.sync({ fromDate: '2026-10-01', toDate: '2026-10-01' }));
  assert.equal(data.records.length, rows.length, 'same-host UTM city rows must not collapse');
  assert.equal(data.records.reduce((n, r) => n + r.visits, 0), 160);
  assert.equal(data.records.reduce((n, r) => n + r.leads, 0), 20);
  const school = (id) => data.records.find(r => r.schoolId === id);
  assert.equal(school('949581').city, 'МСК'); assert.equal(school('949579').city, 'СПБ');
  assert.equal(school('949795').visits, 20); assert.equal(school('949793').visits, 30);
  assert.equal(school('949765').city, 'СПБ'); assert.equal(school('949649').city, 'МСК');
  assert.equal(school('949767').domain, 'hermes-mos.ru');
  assert.equal(data.records.find(r => r.utmMedium === 'cpc').city, 'Не определён');
  assert.equal(data.records.find(r => r.utmCampaign === 'autodrive-school').city, 'Не определён');
  assert.equal(data.records.find(r => r.domain === 'autodrive.msk.ru' && r.utmMedium === 'spb').city, 'Не определён');
});

test('old ten-column caches are enriched read-only from registry without calling Roistat', () => {
  const oldHeaders = headers.slice(0, 10);
  const old = cacheRow('2026-10-01'); old[2] = 'Не определён'; old[4] = 'autodrive-school.ru';
  const f = fixture({ values: [oldHeaders, old] });
  const result = plain(f.api.get({ monthKey: '2026-10' }));
  assert.equal(result.records[0].city, 'СПБ'); assert.equal(result.records[0].brand, 'АвтоДрайв_СПб');
  assert.equal(result.records[0].schoolId, '949579'); assert.equal(result.records[0].visits, 20);
  assert.equal(f.writes.length, 0); assert.equal(f.requests.length, 0);
});

test('public conversion reads skip unrelated setup and shared sync always requires the report password', () => {
  const modules = ['AppsScript.gs', 'Wordstat.gs', 'PsSales.gs'].map(file => readFileSync(new URL('../apps-script/' + file, import.meta.url), 'utf8')).join('\n');
  const api = runInNewContext(`${modules}\n${source}\n
    let syncs = 0;
    ensureServiceSheets_ = () => { throw new Error('Unrelated setup must not run'); };
    verifyPassword_ = password => password === 'allowed';
    jsonResponse = value => value;
    getLeadConversion_ = () => ({ records: [], configured: true });
    syncLeadConversion_ = () => { syncs++; return { updated: 1 }; };
    ({ request: body => doPost({ postData: { contents: JSON.stringify(body) } }), syncs: () => syncs });
  `);
  assert.equal(api.request({ action: 'getLeadConversion', payload: { monthKey: '2026-10' } }).ok, true);
  assert.equal(api.request({ action: 'syncLeadConversion' }).ok, false);
  assert.equal(api.syncs(), 0);
  assert.equal(api.request({ action: 'syncLeadConversion', password: 'allowed' }).ok, true);
  assert.equal(api.syncs(), 1);
});
