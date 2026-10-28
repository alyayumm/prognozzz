import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/leadConversion.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const { buildLeadConversionReport, sortLeadConversionRows, conversionRate, leadConversionRefreshRange } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

const record = (id, visits, leads, overrides = {}) => ({
  id, date: '2026-10-15', city: 'МСК', brand: 'Тестовый бренд', domain: 'example.test', source: 'SEO', visits, leads, ...overrides,
});
const filters = { monthKey: '2026-10', scope: 'Все', brand: 'all', source: 'all' };

test('conversion totals divide summed leads by summed visits rather than averaging row rates', () => {
  const report = buildLeadConversionReport([record('a', 100, 10), record('b', 900, 9)], filters);
  assert.equal(report.totals.visits, 1000);
  assert.equal(report.totals.leads, 19);
  assert.equal(report.totals.conversionRate, 1.9);
  assert.equal(report.bySource[0].conversionRate, 1.9);
  assert.equal(conversionRate(1, 3000), 1 / 30);
});

test('zero denominator is unavailable while imported zero leads is a valid zero conversion', () => {
  assert.equal(conversionRate(5, 0), null);
  assert.equal(conversionRate(0, 200), 0);
  const report = buildLeadConversionReport([record('a', 0, 5), record('b', 200, 0, { source: 'Директ' })], filters);
  assert.equal(report.bySource.find((row) => row.label === 'SEO').conversionRate, null);
  assert.equal(report.bySource.find((row) => row.label === 'Директ').conversionRate, 0);
});

test('Все totals contain Moscow and Petersburg once and keep unknown-city data separately inspectable', () => {
  const rows = [record('m', 100, 1), record('p', 200, 4, { city: 'СПБ' }), record('u', 300, 9, { city: 'Не определён', brand: 'Общий домен' })];
  const report = buildLeadConversionReport(rows, filters);
  assert.equal(report.totals.visits, 300);
  assert.equal(report.totals.leads, 5);
  assert.equal(report.unknownCity.totals.visits, 300);
  assert.equal(report.unknownCity.totals.leads, 9);
  assert.equal(report.unknownCity.byBrandSource[0].brand, 'Общий домен');
  assert.equal(report.unknownCity.bySource[0].label, 'SEO');
  assert.equal(report.unknownCity.bySource[0].visits, 300);
  assert.equal(report.unknownCity.byBrand[0].label, 'Общий домен');
  assert.equal(report.unknownCity.byBrand[0].conversionRate, 3);
  assert.equal(report.cityCoverage.visitsShare, 50);
  assert.equal(report.cityCoverage.leadsShare, 5 / 14 * 100);
  assert.equal(buildLeadConversionReport(rows, { ...filters, scope: 'СПБ' }).totals.visits, 200);
  assert.equal(buildLeadConversionReport(rows, { ...filters, scope: 'СПБ' }).unknownCity.totals.visits, 300);
});

test('raw source labels and unknown brand/source groups are retained without canonicalization or redistribution', () => {
  const report = buildLeadConversionReport([
    record('a', 100, 5, { source: 'yandex / organic' }),
    record('b', 50, 2, { source: 'SEO' }),
    record('c', 80, 3, { source: 'Мессенджеры', brand: '' }),
    record('d', 20, 1, { source: '', brand: '' }),
  ], filters);
  assert.deepEqual(report.bySource.map((row) => row.label).sort(), ['yandex / organic', 'SEO', 'Мессенджеры', 'Источник не определён'].sort());
  assert.equal(report.byBrand.find((row) => row.label === 'Бренд не определён').leads, 4);
  assert.equal(report.bySource.find((row) => row.label === 'SEO').leads, 2);
  assert.equal(report.totals.leads, 11);
});

test('month, city, brand and source filters apply to the same observations before grouping', () => {
  const rows = [
    record('a', 100, 5),
    record('b', 1000, 80, { date: '2026-09-30' }),
    record('c', 300, 12, { city: 'СПБ' }),
    record('d', 500, 20, { brand: 'Другой' }),
    record('e', 700, 25, { source: 'Директ' }),
  ];
  const first = buildLeadConversionReport(rows, filters);
  const brand = first.options.brands.find((option) => option.label === 'Тестовый бренд').value;
  const source = first.options.sources.find((option) => option.label === 'SEO').value;
  const report = buildLeadConversionReport(rows, { ...filters, scope: 'МСК', brand, source });
  assert.equal(report.totals.visits, 100);
  assert.equal(report.totals.leads, 5);
  assert.equal(report.byBrandSource.length, 1);
  assert.equal(report.totals.recordCount, 1);
});

test('invalid dates and negative or nonfinite counts do not masquerade as zero observations', () => {
  const rows = [record('ok', 10, 0), record('neg', -1, 3), record('inf', Infinity, 2), record('nan', 10, NaN), record('date', 100, 10, { date: '2026-10-32' })];
  const report = buildLeadConversionReport(rows, filters);
  assert.equal(report.totals.visits, 10);
  assert.equal(report.totals.recordCount, 1);
  assert.equal(report.invalidRows, 4);
});

test('numeric Google Sheets dimension cells retain their exact labels as text without crashing', () => {
  const report = buildLeadConversionReport([record('numeric', 80, 4, { brand: 2026, source: 42, domain: 120, city: 'Не определён' })], filters);
  assert.equal(report.unknownCity.byBrand[0].label, '2026');
  assert.equal(report.unknownCity.bySource[0].label, '42');
  assert.deepEqual(report.unknownCity.byBrandSource[0].domains, ['120']);
  assert.equal(report.unknownCity.totals.conversionRate, 5);
});

test('table sorting keeps unavailable conversion last in either direction and does not mutate source rows', () => {
  const rows = buildLeadConversionReport([record('a', 100, 2, { source: 'A' }), record('b', 100, 5, { source: 'B' }), record('c', 0, 1, { source: 'C' })], filters).bySource;
  const before = rows.map((row) => row.label);
  assert.deepEqual(sortLeadConversionRows(rows, 'conversionRate', 'desc').map((row) => row.label), ['B', 'A', 'C']);
  assert.deepEqual(sortLeadConversionRows(rows, 'conversionRate', 'asc').map((row) => row.label), ['A', 'B', 'C']);
  assert.deepEqual(rows.map((row) => row.label), before);
});

test('refresh ranges end at the selected month end or today and future months cannot be imported', () => {
  assert.deepEqual(leadConversionRefreshRange('2026-10', '2026-10-28'), { fromDate: '2026-10-01', toDate: '2026-10-28' });
  assert.deepEqual(leadConversionRefreshRange('2026-09', '2026-10-28'), { fromDate: '2026-09-01', toDate: '2026-09-30' });
  assert.deepEqual(leadConversionRefreshRange('2024-02', '2026-10-28'), { fromDate: '2024-02-01', toDate: '2024-02-29' });
  assert.equal(leadConversionRefreshRange('2026-11', '2026-10-28'), null);
  assert.equal(leadConversionRefreshRange('2026-13', '2026-10-28'), null);
});
