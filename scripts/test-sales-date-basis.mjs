import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createReportModelLoader } from './helpers/report-model.mjs';

const load = createReportModelLoader();
const basis = load('src/lib/salesDateBasis.ts');
const metrics = load('src/lib/metrics.ts');
const ps = load('src/lib/psSales.ts');
const report = load('src/utils/report.ts');
const insights = load('src/lib/insights.ts');
const sale = (date, extra = {}) => ({ id: date, date, city: 'МСК', channel: 'Город', metric: 'Продажи', plan: 10, forecast: 10, fact: 99, recommendations: 5, omQualified: 0, ...extra });

test('selecting a date basis changes city sales only and never mutates raw payment facts', () => {
  const raw = [sale('2026-11-01', {trafficSales: 3, paidSales: 2}), sale('2026-11-01', {city: 'сообщения'}), sale('2026-11-01', {city: 'источники'}), sale('2026-11-01', {metric: 'Квалы'})];
  const traffic = basis.selectSalesDateBasis(raw, 'traffic');
  const payment = basis.selectSalesDateBasis(raw, 'payment');
  assert.equal(traffic[0].fact, 3);
  assert.equal(payment[0].fact, 2);
  assert.equal(raw[0].fact, 99);
  assert.equal(raw[0].salesDateBasis, undefined);
  for (let index = 1; index < raw.length; index++) assert.equal(traffic[index], raw[index]);
  assert.equal(metrics.netFact(traffic[0]), 3);
  assert.equal(metrics.netFact(payment[0]), 2);
});

test('missing date-basis history remains unavailable while an explicit zero is a confirmed observation', () => {
  for (const selected of ['traffic', 'payment']) {
    const key = selected === 'traffic' ? 'trafficSales' : 'paidSales';
    const [unknown] = basis.selectSalesDateBasis([sale('2026-11-01')], selected);
    const [zero] = basis.selectSalesDateBasis([sale('2026-11-01', {[key]: 0})], selected);
    assert.equal(ps.hasActualRecord(unknown), false);
    assert.equal(ps.psSalesFactAvailable([unknown]), false);
    assert.equal(metrics.buildMetricTotals([unknown], ['Продажи'])['Продажи'].factAvailable, false);
    assert.equal(ps.hasActualRecord(zero), true);
    assert.equal(ps.psSalesFactAvailable([zero]), true);
    assert.equal(metrics.buildMetricTotals([zero], ['Продажи'])['Продажи'].factAvailable, true);
    assert.equal(metrics.netFact(zero), 0);
  }
  for (const value of ['', undefined, null, 'not a count', -1]) assert.equal(basis.optionalSalesCount(value), undefined);
  assert.equal(basis.optionalSalesCount('0'), 0);
});

test('monthly and weekly totals and conversion use the chosen date perspective', () => {
  const raw = [sale('2026-11-01', {trafficSales: 3, paidSales: 1}), sale('2026-11-02', {trafficSales: 0, paidSales: 4}), sale('2026-11-01', {metric:'Лиды', fact:20, recommendations:0}), sale('2026-11-01', {metric:'Квалы', fact:10, recommendations:0})];
  for (const [selected, expected] of [['traffic', 3], ['payment', 5]]) {
    const rows = basis.selectSalesDateBasis(raw, selected);
    const totals = metrics.buildMetricTotals(rows, ['Лиды', 'Квалы', 'Продажи']);
    assert.equal(totals['Продажи'].fact, expected);
    assert.equal(metrics.buildConversions(totals).qualifiedToSale, expected * 10);
    assert.equal(metrics.buildConversions(totals).salesDateBasis, selected);
    assert.equal(report.buildWeeklySummary(rows, []).reduce((sum, week) => sum + week.totals['Продажи'].fact, 0), expected);
  }
  const unavailable = metrics.buildMetricTotals(basis.selectSalesDateBasis([sale('2026-10-01')], 'payment'), ['Продажи']);
  assert.equal(metrics.buildConversions(unavailable).salesAvailable, false);
});

test('selected coverage comes from the matching new fields and ignores old PS-created markers', () => {
  const rows = [sale('2026-11-01', {trafficSales:0, paidSales:2}), sale('2026-11-02', {trafficSales:1}), sale('2026-11-01', {city:'СПБ', trafficSales:0, paidSales:0}), sale('2026-11-02', {city:'СПБ', trafficSales:2})];
  assert.deepEqual(ps.getPsSalesCoverage(basis.selectSalesDateBasis(rows, 'traffic')), {fromDate:'2026-11-01', toDate:'2026-11-02'});
  assert.deepEqual(ps.getPsSalesCoverage(basis.selectSalesDateBasis(rows, 'payment')), {fromDate:'2026-11-01', toDate:'2026-11-01'});
  assert.match(basis.salesSourceLabel(basis.selectSalesDateBasis(rows, 'traffic')), /amoCRM/);
  assert.match(basis.salesSourceLabel(basis.selectSalesDateBasis([sale('2026-11-01', {comment:'[SALES_SOURCE=PS] [PS_COVERED_TO=2026-11-30]'})], 'payment')), /нет загруженных данных/);
});

const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const tree = ts.createSourceFile('App.tsx', appSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ['prepareDailyValuesForRemote', 'mergeDailyRecord', 'normalizeDailyRecord', 'dailyRecordKey', 'mergeTotals', 'FunnelOverview'];
const functions = tree.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text)).map(node => node.getText(tree)).join('\n');
const app = runInNewContext(`${ts.transpileModule(functions, {compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText}\n({prepareDailyValuesForRemote, mergeDailyRecord, normalizeDailyRecord, mergeTotals, FunnelOverview});`, {
  ...basis, ...ps, sourceRecordCity:'источники', findDailyRecord: rows => rows[0],
  React, metrics:['Лиды','Квалы','Продажи'], formatNumber:String,
  PanelHead: ({title,description}) => React.createElement('header', null, title, ' ', description),
  encodeOmQualifiedInComment: comment => comment, stripOmQualifiedFromComment: comment => comment, parseOmQualifiedFromComment: () => 0,
});
test('plan-only edits and local normalization retain both authoritative fields without persisting a selected basis', () => {
  const raw = sale('2026-11-01', {trafficSales:0, paidSales:2});
  const [prepared] = app.prepareDailyValuesForRemote([{date:raw.date, city:raw.city, metric:raw.metric, plan:20}], [raw]);
  assert.equal(prepared.trafficSales, 0);
  assert.equal(prepared.paidSales, 2);
  const merged = app.mergeDailyRecord(raw, prepared);
  assert.equal(merged.trafficSales, 0);
  assert.equal(merged.paidSales, 2);
  assert.equal(merged.fact, 99);
  assert.equal(merged.salesDateBasis, undefined);
  assert.equal(app.normalizeDailyRecord(sale(raw.date)).paidSales, undefined);
});

test('public daily parser distinguishes blank legacy columns from confirmed zero', () => {
  const source = readFileSync(new URL('../src/api/publicSheetApi.ts', import.meta.url), 'utf8');
  const exports = {};
  runInNewContext(`${ts.transpileModule(source, {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText}\nexports.parseDaily = parseServiceDailySheet;`, {exports, require: name => name === '../lib/salesDateBasis' ? basis : {}});
  const columns = ['id','date','city','channel','metric','fact','trafficSales','paidSales'];
  const table = {cols:columns.map(label=>({label})), rows:[['known','2026-11-01','МСК','Город','Продажи',99,0,2],['legacy','2026-10-01','МСК','Город','Продажи',42,'','']].map(values=>({c:values.map(v=>({v}))}))};
  const records = exports.parseDaily(table);
  assert.equal(records.find(row=>row.id==='known').trafficSales, 0);
  assert.equal(records.find(row=>row.id==='known').paidSales, 2);
  assert.equal(records.find(row=>row.id==='legacy').trafficSales, undefined);
  assert.equal(records.find(row=>row.id==='legacy').paidSales, undefined);
});

test('an observed day needs both selected cities; future dates without observations cannot invalidate MTD', () => {
  const raw = [sale('2026-11-01', {paidSales:5}), sale('2026-11-01', {city:'СПБ'}), sale('2026-11-09'), sale('2026-11-09', {city:'СПБ'})];
  const partial = basis.selectSalesDateBasis(raw, 'payment');
  assert.equal(metrics.buildMetricTotals(partial, ['Продажи'])['Продажи'].factAvailable, false);
  assert.equal(ps.psSalesFactAvailable(partial.filter(row=>row.date==='2026-11-01')), false);
  assert.equal(basis.getSelectedSalesCoverage(partial), null);
  assert.equal(app.mergeTotals(report.buildWeeklySummary(partial, []))['Продажи'].factAvailable, false);
  assert.equal(metrics.buildMetricTotals(partial.filter(row=>row.city==='МСК'), ['Продажи'])['Продажи'].factAvailable, true);
  raw[1].paidSales = 0;
  const complete = basis.selectSalesDateBasis(raw, 'payment');
  assert.equal(metrics.buildMetricTotals(complete, ['Продажи'])['Продажи'].factAvailable, true);
  assert.equal(app.mergeTotals(report.buildWeeklySummary(complete, []))['Продажи'].factAvailable, true);
  // An additional incomplete observed week must invalidate a merged month, unlike future-only weeks.
  raw.push(sale('2026-11-16', {paidSales:1}), sale('2026-11-16', {city:'СПБ'}));
  assert.equal(app.mergeTotals(report.buildWeeklySummary(basis.selectSalesDateBasis(raw, 'payment'), []))['Продажи'].factAvailable, false);
});

test('headline figures never present one city as a complete combined result', () => {
  const source = readFileSync(new URL('../src/components/SalesDateBasisPanel.tsx', import.meta.url), 'utf8');
  const exports = {};
  runInNewContext(ts.transpileModule(source, {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText, {exports, React, require:()=>basis});
  const markup = renderToStaticMarkup(React.createElement(exports.default, {records:[sale('2026-11-01',{paidSales:5}),sale('2026-11-01',{city:'СПБ'})], basis:'payment',onChange:()=>{},monthLabel:'Ноябрь'}));
  assert.equal((markup.match(/<strong>—<\/strong>/g) ?? []).length, 2);
  assert.doesNotMatch(markup, /<strong>5<\/strong>/);
});

test('payment figures do not appear as a cohort arrow in the funnel', () => {
  const rows = [sale('2026-11-01',{paidSales:2,trafficSales:2}),sale('2026-11-01',{metric:'Лиды',fact:20,recommendations:0}),sale('2026-11-01',{metric:'Квалы',fact:10,recommendations:0})];
  for (const [selected, arrows] of [['traffic',2],['payment',1]]) {
    const totals = metrics.buildMetricTotals(basis.selectSalesDateBasis(rows,selected),['Лиды','Квалы','Продажи']);
    const markup = renderToStaticMarkup(React.createElement(app.FunnelOverview,{totals,conversions:metrics.buildConversions(totals)}));
    assert.equal((markup.match(/<em>/g) ?? []).length, arrows);
    if (selected==='payment') {
      assert.match(markup,/не образуют одну когорту/);
      assert.doesNotMatch(markup,/где теряется результат/);
    }
  }
});

test('sales diagnostics require available traffic sales while lead/qualification diagnostics remain active', () => {
  const stage = (fact,plan=100) => ({fact,plan,forecast:plan,recommendations:0,omQualified:0});
  for (const sales of [{...stage(0),factAvailable:false,salesDateBasis:'traffic'},{...stage(0),factAvailable:true,salesDateBasis:'payment'}]) {
    const items = insights.buildAttentionItems({'Лиды':stage(100),'Квалы':stage(50),'Продажи':sales},[]);
    assert.equal(items.length,1);
    assert.match(items[0],/качество трафика/);
    assert.doesNotMatch(items.join(' '),/продаж/i);
  }
  const traffic = insights.buildAttentionItems({'Лиды':stage(100),'Квалы':stage(100),'Продажи':{...stage(0),factAvailable:true,salesDateBasis:'traffic'}},[]);
  assert.ok(traffic.some(item=>/Конверсия КВАЛ/.test(item)));
});
