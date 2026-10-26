import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

const source = readFileSync(new URL('../apps-script/AppsScript.gs', import.meta.url), 'utf8');
function integration(failPs = false) {
  const calls = [];
  const sync = runInNewContext(`${source}
    ensureAmoCrmRawLeadSheet_ = () => {};
    readMainPsSalesSnapshot_ = () => readPs();
    salesFetchAmoDictionaries_ = () => ({});
    salesFetchAmoLeadsForDateRange_ = () => { capture('amo-fetch'); return [{ id: 1 }]; };
    amoCrmLeadRecord_ = lead => lead;
    upsertRowsById_ = () => { capture('raw-write'); return { updated: 1 }; };
    syncAmoCrmMainReportFacts_ = () => { capture('qualification-write'); return {
      updated: 104, months: ['2026-10'], amoSalesAudit: { count: 999 } }; };
    syncMainPsSales_ = (payload, snapshot) => { capture(snapshot.source === 'PS' ? 'ps-write' : 'missing-snapshot');
      return { updated: 52, sales: { deals: 461, doubleDeals: 23, count: 484 },
        coverageByMonth: { '2026-10': { fromDate: '2026-10-01', toDate: '2026-10-25' } }, warnings: [] }; };
    logAmoCrmSync_ = () => {};
    syncAmoCrmLeads_;
  `, {
    Utilities: { formatDate: () => '2026-10-26' },
    capture: event => calls.push(event),
    readPs: () => { calls.push('ps-read'); if (failPs) throw new Error('PS unavailable'); return { source: 'PS' }; },
  });
  return { sync, calls };
}

test('main refresh validates PS before writes and returns PS sales instead of amo audit counts', () => {
  const { sync, calls } = integration();
  const result = sync({ fromDate: '2026-10-01', toDate: '2026-10-26' });
  assert.deepEqual(calls, ['ps-read', 'amo-fetch', 'raw-write', 'qualification-write', 'ps-write']);
  assert.equal(result.mainReportSales.count, 484);
  assert.equal(result.mainReportAmoSalesAudit.count, 999);
  assert.equal(result.salesSource, 'PS');
  assert.equal(result.mainReportRows, 156);
  assert.equal(result.salesCoverageByMonth['2026-10'].toDate, '2026-10-25');
});

test('a failed PS read preserves both saved city sales and amo qualification facts', () => {
  const { sync, calls } = integration(true);
  assert.throws(() => sync({ fromDate: '2026-10-01', toDate: '2026-10-26' }), /PS unavailable/);
  assert.deepEqual(calls, ['ps-read']);
});

test('PS refresh is protected by the same report password as other shared writes', () => {
  const modules = ['Wordstat.gs', 'PsSales.gs'].map(file => readFileSync(new URL('../apps-script/' + file, import.meta.url), 'utf8')).join('\n');
  const api = runInNewContext(`${source}\n${modules}
    let writes = 0;
    ensureServiceSheets_ = () => {};
    verifyPassword_ = password => password === 'allowed';
    jsonResponse = value => value;
    syncMainPsSales_ = () => { writes++; return { source: 'PS' }; };
    ({ request: body => doPost({ postData: { contents: JSON.stringify(body) } }), writes: () => writes });
  `);
  assert.equal(api.request({ action: 'syncPsSales' }).ok, false);
  assert.equal(api.writes(), 0);
  assert.equal(api.request({ action: 'syncPsSales', password: 'allowed' }).ok, true);
  assert.equal(api.writes(), 1);
});
