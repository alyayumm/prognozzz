import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/leadConversion.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const { buildLeadConversionReport, sortLeadConversionRows, conversionRate, leadConversionRefreshRange, groupLeadConversionSource } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

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
  assert.equal(report.bySource.find((row) => row.label === 'Сайт').conversionRate, null);
  assert.equal(report.bySource.find((row) => row.label === 'Директ').conversionRate, 0);
});

test('Все totals contain Moscow and Petersburg once and keep unknown-city data separately inspectable', () => {
  const rows = [record('m', 100, 1), record('p', 200, 4, { city: 'СПБ' }), record('u', 300, 9, { city: 'Не определён', brand: 'Общий домен' })];
  const report = buildLeadConversionReport(rows, filters);
  assert.equal(report.totals.visits, 300);
  assert.equal(report.totals.leads, 5);
  assert.equal(report.unknownCity.totals.visits, 300);
  assert.equal(report.unknownCity.totals.leads, 9);
  assert.equal(report.unknownCity.byBrandSource[0].brand, 'Общий домен · город не определён');
  assert.equal(report.unknownCity.bySource[0].label, 'Сайт');
  assert.equal(report.unknownCity.bySource[0].visits, 300);
  assert.equal(report.unknownCity.byBrand[0].label, 'Общий домен · город не определён');
  assert.equal(report.unknownCity.byBrand[0].conversionRate, 3);
  assert.equal(report.cityCoverage.visitsShare, 50);
  assert.equal(report.cityCoverage.leadsShare, 5 / 14 * 100);
  assert.equal(buildLeadConversionReport(rows, { ...filters, scope: 'СПБ' }).totals.visits, 200);
  assert.equal(buildLeadConversionReport(rows, { ...filters, scope: 'СПБ' }).unknownCity.totals.visits, 300);
});

test('source grouping retains raw labels and unknown brands without redistributing visits or leads', () => {
  const report = buildLeadConversionReport([
    record('a', 100, 5, { source: 'yandex / organic' }),
    record('b', 50, 2, { source: 'SEO' }),
    record('c', 80, 3, { source: 'Мессенджеры', brand: '' }),
    record('d', 20, 1, { source: '', brand: '' }),
  ], filters);
  assert.deepEqual(report.bySource.map((row) => row.label).sort(), ['Сайт', 'Мессенджеры', 'Прочие / Нераспознанное'].sort());
  assert.equal(report.byBrand.find((row) => row.label === 'Бренд не определён').leads, 4);
  assert.equal(report.bySource.find((row) => row.label === 'Сайт').leads, 7);
  assert.deepEqual(report.bySource.find((row) => row.label === 'Сайт').sourceLabels, ['SEO', 'yandex / organic']);
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
  const brand = first.options.brands.find((option) => option.label === 'Тестовый бренд · МСК').value;
  const source = first.options.sources.find((option) => option.label === 'Сайт').value;
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
  assert.equal(report.unknownCity.byBrand[0].label, '2026 · город не определён');
  assert.equal(report.unknownCity.bySource[0].label, 'Прочие / Нераспознанное');
  assert.deepEqual(report.unknownCity.bySource[0].sourceLabels, ['42']);
  assert.deepEqual(report.unknownCity.byBrandSource[0].domains, ['120']);
  assert.equal(report.unknownCity.totals.conversionRate, 5);
});

test('table sorting keeps unavailable conversion last in either direction and does not mutate source rows', () => {
  const rows = buildLeadConversionReport([record('a', 100, 2, { source: 'SEO' }), record('b', 100, 5, { source: 'Директ' }), record('c', 0, 1, { source: 'ya' })], filters).bySource;
  const before = rows.map((row) => row.label);
  assert.deepEqual(sortLeadConversionRows(rows, 'conversionRate', 'desc').map((row) => row.label), ['Директ', 'Сайт', 'Яндекс Карты']);
  assert.deepEqual(sortLeadConversionRows(rows, 'conversionRate', 'asc').map((row) => row.label), ['Сайт', 'Директ', 'Яндекс Карты']);
  assert.deepEqual(rows.map((row) => row.label), before);
});

test('audited provider codes map to useful source groups without guessing ambiguous identifiers', () => {
  const cases = new Map([
    ['Яндекс Карты', ['ya', 'yk', 'ykart_msk', 'ykarty_spb', 'ykar2', 'Яндекс Карты', 'geoadv_maps', 'geoadv_yandex_maps', 'geoadv_organization_list', 'hermesspb_ykart_all', 'autodrivespb_ykart_all']],
    ['Гугл Карты', ['go', 'gkart_spb', 'Google Maps', 'Гугл Карты', 'izidrivespb_gkart_all', 'avtosityspb_gkart_all']],
    ['2ГИС', ['2gis', '2gis_msk', 'spb_2gis_all', '2ГИС']],
    ['Директ', ['geoadv_direct', 'direct8', 'direct9', 'direct17', 'yandex.direct', 'Яндекс Директ', 'Директ']],
    ['Сайт', ['SEO', 'google / organic', 'yandex / organic', 'site', 'сайт', 'Визиты с сайтов', 'referals', 'referrals']],
    ['Прямые визиты', ['Прямые\u00a0визиты', 'Direct visits', 'Direct traffic', 'Direct visits/traffic']],
    ['Мессенджеры', ['Telegram', 'WhatsApp', 'Viber', 'messengers', 'Мессенджеры', 'tg', 'wa']],
    ['ВКонтакте', ['VK', 'msk_vk', 'ВКонтакте']],
    ['Рек/кешбэк', ['кешбэк', 'cashback', 'Рек/кешбэк']],
    ['Прочие / Нераспознанное', ['ad', 'yandex', 'google', 'direct', '42', '169', 'unknown', 'nosource', 'unverified_channel']],
  ]);
  for (const [expected, inputs] of cases) for (const input of inputs) assert.equal(groupLeadConversionSource(input), expected, input);
});

test('brand labels separate the same school in Moscow and Petersburg and normalize only boundary city tokens', () => {
  const rows = [
    record('m1', 100, 10, { brand: 'АвтоДрайв_МСК', schoolId: 'm1' }),
    record('m2', 900, 9, { brand: 'МСК АвтоДрайв', schoolId: 'm1' }),
    record('p1', 200, 8, { brand: 'АвтоДрайв_СПб', city: 'СПБ', schoolId: 'p1' }),
    record('u1', 50, 1, { brand: 'ИзиДрайв', city: 'Не определён' }),
    record('inside', 30, 3, { brand: 'АвтоМСК' }),
  ];
  const report = buildLeadConversionReport(rows, filters);
  const moscow = report.byBrand.find((row) => row.label === 'АвтоДрайв · МСК');
  assert.equal(moscow.visits, 1000);
  assert.equal(moscow.leads, 19);
  assert.equal(moscow.conversionRate, 1.9);
  assert.equal(report.byBrand.find((row) => row.label === 'АвтоДрайв · СПБ').leads, 8);
  assert.ok(report.byBrand.some((row) => row.label === 'АвтоМСК · МСК'));
  assert.equal(report.unknownCity.byBrand[0].label, 'ИзиДрайв · город не определён');
  const brand = report.options.brands.find((option) => option.label === 'АвтоДрайв · СПБ').value;
  const school = buildLeadConversionReport(rows, { ...filters, brand });
  assert.equal(school.totals.visits, 200);
  assert.equal(school.totals.leads, 8);
  assert.equal(school.byBrandSource.length, 1);
});

test('raw direct codes hidden by brand display names remain paid Direct, and both original labels are inspectable', () => {
  const input = [
    record('brand8', 100, 10, { source: '[ИЗИ ДРАЙВ | Москва]', rawSource: 'direct8' }),
    record('brand9', 900, 9, { source: '[АВТО ДРАЙВ | Москва]', rawSource: 'direct9' }),
    record('directvisit', 250, 5, { source: 'Прямые\u00a0визиты' }),
  ];
  const report = buildLeadConversionReport(input, filters);
  const direct = report.bySource.find((row) => row.label === 'Директ');
  assert.equal(direct.visits, 1000);
  assert.equal(direct.leads, 19);
  assert.equal(direct.conversionRate, 1.9);
  assert.deepEqual(new Set(direct.sourceLabels), new Set(['direct8', 'direct9', '[ИЗИ ДРАЙВ | Москва]', '[АВТО ДРАЙВ | Москва]']));
  assert.equal(report.bySource.find((row) => row.label === 'Прямые визиты').visits, 250);
  assert.equal(report.totals.visits, 1250);
  const source = report.options.sources.find((option) => option.label === 'Директ').value;
  assert.equal(buildLeadConversionReport(input, { ...filters, source }).totals.leads, 19);
});

test('source grouping preserves totals and weighted rates across known/unknown city and brand-source slices', () => {
  const report = buildLeadConversionReport([
    record('m1', 100, 10, { source: 'ya' }), record('m2', 900, 9, { source: 'ykart_msk' }),
    record('s1', 250, 5, { source: 'google / organic', city: 'СПБ' }),
    record('u1', 400, 8, { source: 'go', city: 'Не определён' }),
    record('u2', 100, 7, { source: 'Google Maps', city: 'Не определён' }),
    record('u3', 50, 2, { source: '777', city: 'Не определён' }),
  ], filters);
  assert.equal(report.totals.visits, 1250);
  assert.equal(report.totals.leads, 24);
  assert.equal(report.bySource.reduce((sum, row) => sum + row.visits, 0), 1250);
  assert.equal(report.byBrandSource.reduce((sum, row) => sum + row.leads, 0), 24);
  assert.equal(report.unknownCity.bySource.reduce((sum, row) => sum + row.visits, 0), 550);
  assert.equal(report.unknownCity.byBrandSource.reduce((sum, row) => sum + row.leads, 0), 17);
  assert.equal(report.bySource.find((row) => row.label === 'Яндекс Карты').conversionRate, 1.9);
  assert.equal(report.unknownCity.bySource.find((row) => row.label === 'Гугл Карты').conversionRate, 3);
  assert.deepEqual(report.unknownCity.bySource.find((row) => row.label === 'Прочие / Нераспознанное').sourceLabels, ['777']);
});

test('refresh ranges end at the selected month end or today and future months cannot be imported', () => {
  assert.deepEqual(leadConversionRefreshRange('2026-10', '2026-10-28'), { fromDate: '2026-10-01', toDate: '2026-10-28' });
  assert.deepEqual(leadConversionRefreshRange('2026-09', '2026-10-28'), { fromDate: '2026-09-01', toDate: '2026-09-30' });
  assert.deepEqual(leadConversionRefreshRange('2024-02', '2026-10-28'), { fromDate: '2024-02-01', toDate: '2024-02-29' });
  assert.equal(leadConversionRefreshRange('2026-11', '2026-10-28'), null);
  assert.equal(leadConversionRefreshRange('2026-13', '2026-10-28'), null);
});
