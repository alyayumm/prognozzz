import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createReportModelLoader } from './helpers/report-model.mjs';

const load = createReportModelLoader();
const { monthlyQualificationDeduction, applyMonthlyQualificationAdjustment } = load('src/lib/monthlyQualificationAdjustment.ts');
const { applyTrafficModeToTotals } = load('src/lib/metrics.ts');

const config = (extra = {}) => ({
  monthKey: '2026-10',
  qualificationAdjustment: {
    kind: 'referralOverride', targetReferrals: 56, baselineReferrals: 31,
    deduction: 25, scope: 'Все', updatedAt: '2026-11-11T15:00:00Z',
  },
  ...extra,
});
const totals = () => ({
  'Лиды': { plan: 5000, fact: 4478, forecast: 4500, recommendations: 0, omQualified: 0 },
  'Квалы': { plan: 1800, fact: 1797, forecast: 1810, recommendations: 0, omQualified: 81 },
  'Продажи': { plan: 600, fact: 558, forecast: 560, recommendations: 0, omQualified: 0, factAvailable: true, salesDateBasis: 'traffic' },
});
const freeze = (value) => {
  Object.values(value).forEach(child => { if (child && typeof child === 'object') freeze(child); });
  return Object.freeze(value);
};

test('the approved October referral total replaces only its additional 25 qualified leads', () => {
  assert.equal(monthlyQualificationDeduction(config(), 'Все'), 25);
  assert.equal(applyMonthlyQualificationAdjustment(totals(), config(), 'Все')['Квалы'].fact, 1772);
});

test('marketing still restores the same 81 OM qualifications after the monthly OP adjustment', () => {
  const adjusted = applyMonthlyQualificationAdjustment(totals(), config(), 'Все');
  assert.equal(applyTrafficModeToTotals(adjusted, 'marketing')['Квалы'].fact, 1853);
  assert.equal(adjusted['Квалы'].omQualified, 81);
});

test('city reports retain their original fact because the monthly adjustment has no city allocation', () => {
  const input = freeze(totals());
  for (const scope of ['МСК', 'СПБ']) {
    assert.equal(monthlyQualificationDeduction(config(), scope), 0);
    assert.deepEqual(applyMonthlyQualificationAdjustment(input, config(), scope), input);
  }
});

test('November, other years, and missing month configurations cannot acquire the October adjustment', () => {
  for (const current of [undefined, null, {}, config({ monthKey: '2026-11' }), config({ monthKey: '2025-10' }), config({ monthKey: '2026-10-01' })]) {
    assert.equal(monthlyQualificationDeduction(current, 'Все'), 0);
    assert.deepEqual(applyMonthlyQualificationAdjustment(totals(), current, 'Все'), totals());
  }
});

test('invalid override metadata fails closed rather than changing shared facts', () => {
  const valid = config().qualificationAdjustment;
  const overrides = [undefined, null, {}, [], '25',
    { ...valid, kind: 'other' }, { ...valid, scope: 'МСК' },
    { ...valid, targetReferrals: '56' }, { ...valid, baselineReferrals: '31' },
    { ...valid, deduction: '25' }, { ...valid, deduction: 24 },
    { ...valid, targetReferrals: -56 }, { ...valid, baselineReferrals: -31 },
    { ...valid, targetReferrals: 56.5, deduction: 25.5 },
    { ...valid, targetReferrals: Infinity, deduction: Infinity },
    { ...valid, targetReferrals: NaN, deduction: NaN },
    { ...valid, targetReferrals: 30, deduction: -1 },
  ];
  for (const qualificationAdjustment of overrides) {
    const current = config({ qualificationAdjustment });
    assert.equal(monthlyQualificationDeduction(current, 'Все'), 0, JSON.stringify(qualificationAdjustment));
    assert.deepEqual(applyMonthlyQualificationAdjustment(totals(), current, 'Все'), totals());
  }
});

test('plans, sales, leads, OM and every other qualification field remain intact without input mutation', () => {
  const input = freeze(totals());
  const before = JSON.stringify(input);
  const adjusted = applyMonthlyQualificationAdjustment(input, freeze(config()), 'Все');
  assert.notEqual(adjusted, input);
  assert.notEqual(adjusted['Квалы'], input['Квалы']);
  assert.equal(adjusted['Лиды'], input['Лиды']);
  assert.equal(adjusted['Продажи'], input['Продажи']);
  assert.deepEqual({ ...adjusted['Квалы'], fact: input['Квалы'].fact }, input['Квалы']);
  assert.equal(JSON.stringify(input), before);
});

test('a zero additional deduction leaves the fact unchanged and deductions cannot produce negative totals', () => {
  const none = config({ qualificationAdjustment: { ...config().qualificationAdjustment, targetReferrals: 31, deduction: 0 } });
  assert.equal(monthlyQualificationDeduction(none, 'Все'), 0);
  assert.deepEqual(applyMonthlyQualificationAdjustment(totals(), none, 'Все'), totals());
  const low = totals();
  low['Квалы'].fact = 10;
  assert.equal(applyMonthlyQualificationAdjustment(low, config(), 'Все')['Квалы'].fact, 0);
});

test('recomputing from saved facts is stable while daily and weekly inputs stay unchanged', () => {
  const source = freeze({
    daily: [{ date: '2026-10-31', city: 'МСК', metric: 'Квалы', fact: 55 }],
    weeks: [{ week: 5, totals: totals() }],
    totals: totals(),
  });
  const before = JSON.stringify(source);
  const first = applyMonthlyQualificationAdjustment(source.totals, config(), 'Все');
  const refreshed = applyMonthlyQualificationAdjustment(source.totals, config(), 'Все');
  assert.equal(first['Квалы'].fact, 1772);
  assert.deepEqual(refreshed, first);
  assert.equal(JSON.stringify(source), before);
});
