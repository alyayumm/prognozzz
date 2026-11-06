import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const tree = ts.createSourceFile('App.tsx', app, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function functions(names, context = {}) {
  const code = names.map(name => {
    const node = tree.statements.find(item => ts.isFunctionDeclaration(item) && item.name?.text === name);
    assert.ok(node, name);
    return ts.transpileModule(node.getText(tree), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  }).join('\n');
  return runInNewContext(`${code}\n({${names.join(',')}})`, context);
}
const record = { id: 'lead', date: '2026-11-01', city: 'МСК', channel: 'Город', metric: 'Лиды', plan: 30, fact: 20, forecast: 30, recommendations: 0, omQualified: 0, omLeads: 4, comment: '', updatedAt: '2026-11-06T07:00:00Z' };

test('an unrelated manual daily edit preserves the derived OM lead count in remote payload', () => {
  const { prepareDailyValuesForRemote } = functions(['prepareDailyValuesForRemote'], {
    findDailyRecord: () => record, isPsSale: () => false, encodeOmQualifiedInComment: value => value,
  });
  const [value] = prepareDailyValuesForRemote([{ date: record.date, city: record.city, metric: record.metric, plan: 31 }], [record]);
  assert.equal(value.omLeads, 4);
  assert.equal(value.plan, 31);
  assert.equal(value.omQualified, 0);
});

test('a newer shared derived OM count replaces an older local count, including observed zero', () => {
  const { mergePublicSheetRecords } = functions(['mergePublicSheetRecords', 'parseRecordUpdatedAt']);
  const [updated] = mergePublicSheetRecords([record], [{ ...record, omLeads: 0, updatedAt: '2026-11-06T08:00:00Z' }]);
  assert.equal(updated.omLeads, 0);
  const [preserved] = mergePublicSheetRecords([record], [{ ...record, omLeads: 0, updatedAt: '2026-11-06T06:00:00Z' }]);
  assert.equal(preserved.omLeads, 4);
});

test('weekly totals keep OM leads for marketing aggregation instead of losing them between views', () => {
  const { mergeTotals } = functions(['mergeTotals'], { metrics: ['Лиды'] });
  const result = mergeTotals([
    { totals: { 'Лиды': { plan: 30, fact: 20, forecast: 30, recommendations: 0, omQualified: 0, omLeads: 4 } } },
    { totals: { 'Лиды': { plan: 30, fact: 15, forecast: 30, recommendations: 0, omQualified: 0, omLeads: 3 } } },
  ]);
  assert.equal(result['Лиды'].fact, 35);
  assert.equal(result['Лиды'].omLeads, 7);
});

test('normalization preserves unknown future coverage instead of marking every planned day as observed', () => {
  const { normalizeDailyRecord } = functions(['normalizeDailyRecord'], {
    optionalSalesCount: value => value === undefined || value === '' ? undefined : Number(value),
    parseOmQualifiedFromComment: () => 0, stripOmQualifiedFromComment: value => value,
  });
  assert.equal(normalizeDailyRecord({ ...record, omLeads: undefined, date: '2026-11-30', fact: 0 }).omLeads, undefined);
  assert.equal(normalizeDailyRecord({ ...record, omLeads: 0 }).omLeads, 0);
});
