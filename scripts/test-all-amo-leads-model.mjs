import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createReportModelLoader } from './helpers/report-model.mjs';

const load = createReportModelLoader();
const metrics = load('src/lib/metrics.ts');
const report = load('src/utils/report.ts');
const marker = '[AMO_LEADS_ALL=1]';
const row = (city = 'МСК', extra = {}) => ({
  id: `2026-11-07-${city}-Лиды`, date: '2026-11-07', city, channel: 'Город',
  metric: 'Лиды', plan: 30, fact: 20, forecast: 31, recommendations: 4,
  omQualified: 0, omLeads: 0, comment: `amoCRM ${marker}`, ...extra,
});

test('all-leads imported rows keep referrals in the fact even when a legacy deduction is still stored', () => {
  assert.equal(metrics.netFact(row()), 20);
  assert.equal(metrics.recommendationValue(row()), 4, 'stored history stays inspectable');
  assert.equal(metrics.netFact(row('МСК', { fact: 0 })), 0);
  assert.equal(metrics.netFact(row('МСК', { fact: -1 })), 0);
});

test('legacy lead rows retain recommendation subtraction and zero floor', () => {
  assert.equal(metrics.netFact(row('МСК', { comment: 'старый импорт' })), 16);
  assert.equal(metrics.netFact(row('МСК', { comment: '', fact: 2 })), 0);
  assert.equal(metrics.netFact(row('МСК', { comment: undefined })), 16);
});

test('the all-leads marker cannot change qualification or sale deductions', () => {
  assert.equal(metrics.netFact(row('МСК', { metric: 'Квалы' })), 16);
  assert.equal(metrics.netFact(row('МСК', { metric: 'Продажи' })), 16);
});

test('the marker changes only canonical city leads, leaving sources, messages and manual rows unchanged', () => {
  for (const extra of [{ channel: 'Директ' }, { channel: 'Ручная корректировка' },
    { city: 'Сообщения' }, { city: 'МСК', channel: 'Источник' }]) {
    assert.equal(metrics.netFact(row('МСК', extra)), 16);
    assert.equal(metrics.isAllAmoLeads(row('МСК', extra)), false);
  }
});

test('only the exact all-leads marker enables the new meaning', () => {
  for (const comment of ['[AMO_LEADS_ALL=0]', '[AMO_LEADS_ALL=10]', '[AMO_LEADS_ALL =1]',
    '[amo_leads_all=1]', '[AMO_LEADS_ALL=1', 'AMO_LEADS_ALL=1]']) {
    assert.equal(metrics.netFact(row('МСК', { comment })), 16, comment);
  }
  assert.equal(metrics.netFact(row('МСК', { comment: `заметка ${marker} обновлено` })), 20);
});

test('daily, weekly and monthly totals and conversions use all leads once in both traffic modes', () => {
  const records = ['МСК', 'СПБ'].flatMap(city => [
    row(city),
    row(city, { id: `2026-11-07-${city}-Квалы`, metric: 'Квалы', fact: 10,
      recommendations: 2, omQualified: 2, comment: 'amoCRM' }),
    row(city, { id: `2026-11-07-${city}-Продажи`, metric: 'Продажи', fact: 4,
      recommendations: 0, comment: 'amoCRM' }),
  ]);
  const metricNames = ['Лиды', 'Квалы', 'Продажи'];
  const totals = metrics.buildMetricTotals(records, metricNames);
  assert.equal(totals['Лиды'].fact, 40);
  assert.equal(totals['Лиды'].omLeads, 0);
  assert.equal(totals['Квалы'].fact, 16);
  assert.equal(metrics.applyTrafficModeToTotals(totals, 'marketing')['Лиды'].fact, 40);
  assert.equal(metrics.buildConversions(totals, 'op').leadToQualified, 40);
  assert.equal(metrics.buildConversions(totals, 'marketing').leadToQualified, 50);
  assert.equal(metrics.buildConversions(totals, 'marketing').marketingLeads, 40);
  assert.equal(metrics.buildConversions(totals, 'op').leadToSale, 20);
  assert.equal(report.buildWeeklySummary(records, [])[0].totals['Лиды'].fact, 40);
  const months = metrics.buildOverallMonths(records, [], [
    { monthKey: '2026-11', year: 2026, monthIndex: 10, daysInMonth: 30 },
  ]);
  assert.equal(months[0].weeks.reduce((sum, week) => sum + week.totals['Лиды'].fact, 0), 40);
});
