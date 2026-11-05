import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

const source = readFileSync(new URL('../apps-script/AppsScript.gs', import.meta.url), 'utf8');
const traffic = readFileSync(new URL('../apps-script/AmoTrafficSales.gs', import.meta.url), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const globals = {
  Session: { getScriptTimeZone: () => 'Europe/Moscow' },
  Utilities: { formatDate: (date, zone, pattern) => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone: zone === 'GMT' ? 'UTC' : zone,
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(date).map(item => [item.type, item.value]));
    const day = `${parts.year}-${parts.month}-${parts.day}`;
    return pattern === 'yyyy-MM-dd HH:mm:ss' ? `${day} ${parts.hour}:${parts.minute}:${parts.second}` : day;
  } },
};
const cachedLead = (id, overrides = {}) => ({
  id: `amocrm-lead-${id}`, leadId: String(id), pipelineId: '4535035', pipelineName: 'СПБ АШ', city: 'СПБ',
  statusId: '142', stageName: 'Успешно реализовано', isQualified: 'TRUE', isWon: 'TRUE',
  createdAt: '2026-10-29 10:00:00', createdDate: '2026-10-30', updatedAt: '2026-11-02 10:00:00',
  closedAt: '2026-11-02 10:00:00', closedDate: '2026-11-02', category: 'B', ...overrides,
});

test('a requested custom arrival cohort includes a cached lead omitted by every native fresh-date stream', () => {
  const cache = [cachedLead(1)];
  let saved = [];
  let rawReads = 0;
  const sync = runInNewContext(`${source}\n${traffic}
    ensureAmoCrmRawLeadSheet_ = () => {};
    readMainPsSalesSnapshot_ = () => ({source: 'PS'});
    salesFetchAmoDictionaries_ = () => ({});
    salesFetchAmoLeadsForDateRange_ = () => [];
    readObjects_ = () => readDaily();
    readAmoCrmRawLeadObjectsFast_ = () => readCache();
    upsertRowsById_ = (sheet, headers, rows) => save(rows);
    rebuildWeeklySummary_ = () => {};
    syncMainPsSales_ = () => ({updated: 0, sales: {count: 0}, months: [], warnings: []});
    logAmoCrmSync_ = () => {};
    syncAmoCrmLeads_;
  `, {
    ...globals, readDaily: () => saved, readCache: () => { rawReads++; return cache; },
    save: rows => {
      const byId = new Map(saved.map(row => [row.id, row]));
      for (const row of plain(rows)) byId.set(row.id, row);
      saved = [...byId.values()]; return {updated: rows.length};
    },
  });
  const result = sync({fromDate: '2026-10-30', toDate: '2026-10-31'});
  const fact = metric => saved.find(row => row.date === '2026-10-30' && row.city === 'СПБ' && row.metric === metric);
  assert.equal(fact('Лиды').fact, 1);
  assert.equal(fact('Квалы').fact, 1);
  assert.equal(fact('Квалы').omQualified, 0);
  assert.equal(fact('Продажи').trafficSales, 1);
  assert.equal(rawReads, 1);
  assert.equal(Object.hasOwn(result, 'cohortRecords'), false);
  assert.equal(Object.hasOwn(result.mainReportTrafficSales, 'cohortRecords'), false);
});

test('arrival candidates reuse the scalar cache, keep native fallback dates and avoid normalizing unrelated history', () => {
  const cache = [
    cachedLead(1),
    cachedLead(2, {createdDate: '', createdAt: new Date('2026-10-29T21:30:00Z'), statusId: '41892613', stageName: 'Брифинг', isWon: '', closedAt: ''}),
    ...Array.from({length: 100}, (_, index) => cachedLead(100 + index, {createdDate: '2026-09-01', statusId: '41892613', stageName: 'Брифинг'})),
  ];
  const converted = [];
  let rawReads = 0;
  const read = runInNewContext(`${source}\n${traffic}
    readObjects_ = () => [];
    readAmoCrmRawLeadObjectsFast_ = () => readCache();
    const originalConverter = salesAmoLeadFromCachedRecord_;
    salesAmoLeadFromCachedRecord_ = record => { capture(record.leadId); return originalConverter(record); };
    readMainAmoTrafficSalesSnapshot_;
  `, {...globals, readCache: () => { rawReads++; return cache; }, capture: id => converted.push(id)});
  const snapshot = read('2026-10-30', '2026-10-31');
  assert.deepEqual(plain(snapshot.cohortRecords.map(row => row.leadId)).sort(), ['1', '2']);
  assert.deepEqual(converted.sort(), ['1', '2']);
  assert.equal(rawReads, 1);
});

test('fresh facts override cached duplicates while cached custom arrivals and fresh closed-date audits remain included', () => {
  const missingFromFresh = cachedLead(2);
  const staleDuplicate = cachedLead(1);
  const freshChat = cachedLead(1, {statusId: '143', stageName: 'Закрыто и не реализовано', lossReasonId: '23625702', lossReasonName: 'Чат'});
  const freshSaleOutsideCohort = cachedLead(3, {createdDate: '2026-09-01', closedAt: '2026-10-30 10:00:00', closedDate: '2026-10-30', category: 'A+B'});
  let saved = [];
  let mergedIds = [];
  const sync = runInNewContext(`${source}
    ensureAmoCrmRawLeadSheet_ = () => {};
    readMainPsSalesSnapshot_ = () => ({source: 'PS'});
    salesFetchAmoDictionaries_ = () => ({});
    salesFetchAmoLeadsForDateRange_ = () => fresh;
    amoCrmLeadRecord_ = row => row;
    upsertRowsById_ = (sheet, headers, rows) => { if (sheet === CONFIG.sheets.daily) save(rows); return {updated: rows.length}; };
    readMainAmoTrafficSalesSnapshot_ = () => ({cohortRecords: cached, rows: []});
    const originalFacts = syncAmoCrmMainReportFacts_;
    syncAmoCrmMainReportFacts_ = (records, from, to, warnings) => { capture(records); return originalFacts(records, from, to, warnings); };
    syncMainAmoTrafficSales_ = () => ({updated: 0, months: []});
    readObjects_ = () => [];
    rebuildWeeklySummary_ = () => {};
    syncMainPsSales_ = () => ({updated: 0, sales: {count: 0}, months: [], warnings: []});
    logAmoCrmSync_ = () => {};
    syncAmoCrmLeads_;
  `, {
    ...globals, fresh: [freshChat, freshSaleOutsideCohort], cached: [staleDuplicate, missingFromFresh, missingFromFresh],
    save: rows => { saved = plain(rows); }, capture: records => { mergedIds = records.map(row => row.leadId); },
  });
  const result = sync({fromDate: '2026-10-30', toDate: '2026-10-31'});
  const fact = metric => saved.find(row => row.date === '2026-10-30' && row.city === 'СПБ' && row.metric === metric).fact;
  assert.deepEqual(plain(mergedIds).sort(), ['1', '2', '3']);
  assert.equal(fact('Лиды'), 1);
  assert.equal(fact('Квалы'), 1);
  assert.equal(result.mainReportAmoSalesAudit.count, 2);
});
