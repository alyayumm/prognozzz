import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/api/publicSheetApi.ts', import.meta.url), 'utf8');
const tree = ts.createSourceFile('publicSheetApi.ts', source, ts.ScriptTarget.Latest, true);
const declaration = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'loadServiceSheetSnapshot');
const js = ts.transpileModule(declaration.getText(tree), {compilerOptions: {target: ts.ScriptTarget.ES2022}}).outputText;
const adjustment = {kind: 'referralOverride', targetReferrals: 56, baselineReferrals: 31, deduction: 25, scope: 'Все', updatedAt: '2026-11-11T14:00:00.000Z'};
const plain = value => JSON.parse(JSON.stringify(value));
function fixture(remoteMonths) {
  const requests = [];
  const read = runInNewContext(`${js}\nloadServiceSheetSnapshot;`, {
    serviceSheets: {months: 'Month_Config', plans: 'Month_Plans', daily: 'Data_Daily', events: 'Event_Map'},
    loadGvizSheet: async () => ({}), loadOptionalGvizSheet: async () => ({}),
    loadEventMapSnapshot: async () => ({events: [], available: true}),
    eventMapSpreadsheetId: 'event-map', rowsToObjects: () => [],
    parseServiceDailySheet: () => [{date: '2026-10-01', fact: 1797}],
    parseServiceMonthConfigs: () => [{monthKey: '2026-10', plan: {Квалы: 1750}}],
    parseServiceEventSheet: () => [], mergeEventMapEvents: () => [], getLatestActualDate: () => '2026-10-31',
    callReportApi: async action => {requests.push(action); if (remoteMonths instanceof Error) throw remoteMonths; return remoteMonths;},
  });
  return {read, requests};
}
test('a normal public-sheet refresh includes the saved monthly override without changing facts or plans', async () => {
  const f = fixture([{monthKey: '2026-10', qualificationAdjustment: adjustment}]);
  const snapshot = plain(await f.read([]));
  assert.deepEqual(f.requests, ['getMonths']);
  assert.deepEqual(snapshot.monthConfigs[0].qualificationAdjustment, adjustment);
  assert.equal(snapshot.records[0].fact, 1797);
  assert.equal(snapshot.monthConfigs[0].plan.Квалы, 1750);
});
test('an explicit absence of a saved override removes stale cached metadata', async () => {
  const snapshot = await fixture([{monthKey: '2026-10'}]).read([{monthKey: '2026-10', qualificationAdjustment: adjustment}]);
  assert.equal(snapshot.monthConfigs[0].qualificationAdjustment, undefined);
});
test('failed or incomplete monthly metadata rejects the refresh rather than silently dropping the override', async () => {
  for (const response of [new Error('offline'), {}, [], [{monthKey: '2026-11'}]]) {
    await assert.rejects(fixture(response).read([]));
  }
});
