import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

const source = readFileSync(new URL('../apps-script/AppsScript.gs', import.meta.url), 'utf8');

function cachedSheet(headers, values) {
  const reads = [];
  const sheet = {
    getLastRow: () => values.length + 1,
    getLastColumn: () => headers.length,
    getRange(row, column, height, width) {
      reads.push({ row, column, height, width });
      return { getValues: () => row === 1 ? [headers.slice(column - 1, column - 1 + width)]
        : values.slice(row - 2, row - 2 + height).map(value => value.slice(column - 1, column - 1 + width)) };
    },
  };
  const api = runInNewContext(`${source}\n({ read: readAmoCrmRawLeadObjectsFast_, headers: HEADERS.AmoCRM_Raw_Leads });`, {
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => sheet }) },
  });
  return { ...api, reads };
}

test('the CRM cache is read in two data blocks without JSON or contact payloads', () => {
  const headers = runInNewContext(`${source}\nHEADERS.AmoCRM_Raw_Leads;`);
  const values = headers.map(header => ({ id: 'row-1', leadId: '101', createdAt: '2026-09-01',
    isQualified: false, category: 'A+B', lossReasonName: 'дубль целевой',
    contactIds: 'private contacts', customFieldsJson: 'large JSON', rawJson: 'large JSON' })[header] ?? '');
  const { read, reads } = cachedSheet(headers, [values, headers.map(() => '')]);
  const rows = read();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].leadId, '101');
  assert.equal(rows[0].isQualified, false);
  assert.equal(rows[0].category, 'A+B');
  assert.equal(rows[0].lossReasonName, 'дубль целевой');
  const dataReads = reads.filter(r => r.row > 1);
  assert.equal(dataReads.length, 2);
  for (const range of dataReads) {
    const selected = headers.slice(range.column - 1, range.column - 1 + range.width);
    assert.ok(!selected.some(header => ['contactIds', 'customFieldsJson', 'rawJson'].includes(header)));
  }
});

test('missing and reordered CRM columns keep their names and empty defaults', () => {
  const { read } = cachedSheet(['rawJson', 'leadId', 'isWon', 'unused', 'createdAt'], [
    ['large JSON', '202', false, 'ignored', '2026-09-02'],
  ]);
  const rows = read();
  assert.equal(rows[0].leadId, '202');
  assert.equal(rows[0].createdAt, '2026-09-02');
  assert.equal(rows[0].isWon, false);
  assert.equal(rows[0].category, '');
});

test('team and department aggregates share one read of the report-period CRM leads', () => {
  const result = runInNewContext(`${source}
    let reads = 0;
    const cachedLeads = [{ id: 'cached-lead' }];
    const usedLeads = [];
    salesReadDepartmentPlan_ = () => ({ planByManager: {}, managerNames: [], planLabel: 'Plan' });
    salesStaticPlanByManager_ = () => ({});
    salesUniqueManagers_ = () => [];
    salesReadCachedAmoLeadsForMonth_ = () => { reads++; return cachedLeads; };
    salesReadAmoDepartmentData_ = (config, warnings, leads) => {
      usedLeads.push(leads);
      return { byManager: {}, daily: [] };
    };
    salesReadManualDeals_ = () => ({ byManager: {}, actualByManager: {}, byDate: {}, actualByDate: {} });
    salesReadManagerSources_ = () => ({});
    getAmoCrmStatus_ = () => ({ apiDomain: '' });
    const snapshot = getSalesDepartmentDashboard_({ monthKey: '2026-09' });
    ({ reads, calls: usedLeads.length, shared: usedLeads.every(leads => leads === cachedLeads), monthKey: snapshot.monthKey });
  `, {
    Session: { getScriptTimeZone: () => 'Europe/Moscow' },
    Utilities: { formatDate: date => date.toISOString().slice(0, 10) },
  });
  assert.equal(result.monthKey, '2026-09');
  assert.equal(result.reads, 1);
  assert.equal(result.calls, 2);
  assert.equal(result.shared, true);
});
