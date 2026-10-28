import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/leadConversion.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const { buildLeadConversionReport, sortLeadConversionRows, conversionRate, leadConversionRefreshRange, groupLeadConversionSource, LEAD_CONVERSION_VISIBLE_SOURCES } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

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
    ['2ГИС', ['2gis', '2gis_msk', 'spb_2gis_all', '2ГИС', '2dqc', ':utm:2dqc', 'utm:2dqc']],
    ['Директ', ['geoadv_direct', 'direct8', 'direct9', 'direct17', 'yandex.direct', 'Яндекс Директ', 'Директ']],
    ['Сайт', ['SEO', 'google / organic', 'yandex / organic', 'yandex', ':utm:yandex', 'site', 'сайт', 'Визиты с сайтов', 'referals', 'referrals']],
    ['Справочники', ['yell.ru', ':utm:yell.ru', 'spravker', ':utm:spravker', 'autoschool-firmika.ru', ':autoschool-firmika.ru', ':utm:autoschool-firmika.ru', 'jsprav', 'jsprav.ru', ':utm:jsprav', ':utm:jsprav.ru']],
    ['Нейросети', ['perplexity', ':utm:perplexity', 'chatgpt.com', ':utm:chatgpt.com']],
    ['Инстаграм', ['ig', ':utm:ig', 'utm:ig']],
    ['Прямые визиты', ['Прямые\u00a0визиты', 'Direct visits', 'Direct traffic', 'Direct visits/traffic']],
    ['Мессенджеры', ['Telegram', 'WhatsApp', 'Viber', 'messengers', 'Мессенджеры', 'tg', 'wa']],
    ['ВКонтакте', ['VK', 'msk_vk', 'ВКонтакте']],
    ['Рек/кешбэк', ['кешбэк', 'cashback', 'Рек/кешбэк']],
    ['Прочие / Нераспознанное', ['ad', 'google', 'direct', '42', '169', 'unknown', 'nosource', 'unverified_channel']],
  ]);
  for (const [expected, inputs] of cases) for (const input of inputs) assert.equal(groupLeadConversionSource(input), expected, input);
});

test('confirmed website, directory and AI labels leave unknown without changing city totals or weighted conversion', () => {
  const input = [
    record('ya', 100, 5, { source: 'yandex' }),
    record('dir1', 40, 2, { source: 'yell.ru' }),
    record('dir2', 60, 1, { source: 'spravker', rawSource: ':utm:spravker' }),
    record('ai1', 30, 3, { source: 'chatgpt.com', rawSource: ':utm:chatgpt.com' }),
    record('ai2', 70, 1, { source: 'perplexity', city: 'СПБ' }),
    record('unknown-city', 20, 2, { source: ':utm:perplexity', city: 'Не определён' }),
    record('still-unknown', 10, 1, { source: 'ad' }),
    record('firmika', 10, 1, { source: ':autoschool-firmika.ru' }),
    record('jsprav', 10, 1, { source: 'jsprav.ru', rawSource: ':utm:jsprav' }),
    record('instagram', 20, 2, { source: 'ig' }),
    record('2gis-typo', 30, 3, { source: '2dqc', rawSource: 'utm:2dqc' }),
  ];
  const report = buildLeadConversionReport(input, filters);
  assert.equal(report.totals.visits, 380); assert.equal(report.totals.leads, 20);
  for (const dimension of ['bySource', 'byBrand', 'byBrandSource']) {
    assert.equal(report[dimension].reduce((n, row) => n + row.visits, 0), 380);
    assert.equal(report[dimension].reduce((n, row) => n + row.leads, 0), 20);
  }
  const directories = report.bySource.find(row => row.label === 'Справочники');
  assert.equal(directories.visits, 120); assert.equal(directories.leads, 5);
  assert.equal(directories.conversionRate, 5 / 120 * 100);
  assert.equal(report.bySource.find(row => row.label === 'Инстаграм').leads, 2);
  assert.equal(report.bySource.find(row => row.label === '2ГИС').leads, 3);
  const neural = report.bySource.find(row => row.label === 'Нейросети');
  assert.equal(neural.visits, 100); assert.equal(neural.leads, 4); assert.equal(neural.conversionRate, 4);
  assert.ok(neural.sourceLabels.includes(':utm:chatgpt.com'));
  assert.deepEqual(report.bySource.find(row => row.label === 'Прочие / Нераспознанное').sourceLabels, ['ad']);
  assert.equal(report.unknownCity.bySource[0].label, 'Нейросети');
  assert.equal(report.unknownCity.totals.visits, 20);
  const selected = report.options.sources.find(option => option.label === 'Нейросети').value;
  assert.equal(buildLeadConversionReport(input, { ...filters, source: selected }).totals.leads, 4);
  assert.equal(groupLeadConversionSource('yandex', 'direct8'), 'Директ');
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

const limitedSourceRows = [
  record('maps-a', 100, 10, { brand: 'Школа А', source: 'ya' }),
  record('maps-b', 900, 9, { brand: 'Школа А', source: 'ykart_msk' }),
  record('site-a', 200, 10, { brand: 'Школа А', source: 'SEO' }),
  record('direct-b', 50, 2, { brand: 'Школа Б', source: 'direct8', city: 'СПБ' }),
  record('hidden-known', 10000, 500, { brand: 'Скрытый бренд', source: 'Прямые визиты' }),
  record('visible-unknown', 80, 4, { brand: 'Без города', source: 'go', city: 'Не определён' }),
  record('hidden-unknown', 400, 60, { brand: 'Скрытый без города', source: 'Telegram', city: 'Не определён' }),
];

test('five-source visibility removes hidden channels before every KPI, option and known/unknown-city grouping', () => {
  assert.deepEqual(LEAD_CONVERSION_VISIBLE_SOURCES, ['Яндекс Карты', '2ГИС', 'Гугл Карты', 'Сайт', 'Директ']);
  const report = buildLeadConversionReport(limitedSourceRows, { ...filters, visibleSources: LEAD_CONVERSION_VISIBLE_SOURCES });
  assert.equal(report.totals.visits, 1250);
  assert.equal(report.totals.leads, 31);
  assert.equal(report.totals.recordCount, 4);
  assert.deepEqual(report.bySource.map((row) => row.label).sort(), ['Яндекс Карты', 'Сайт', 'Директ'].sort());
  assert.deepEqual(report.options.sources.map((option) => option.label).sort(), ['Яндекс Карты', 'Гугл Карты', 'Сайт', 'Директ'].sort());
  assert.ok(report.options.brands.every((option) => !option.label.includes('Скрытый')));
  for (const dimension of ['bySource', 'byBrand', 'byBrandSource']) {
    assert.equal(report[dimension].reduce((sum, row) => sum + row.visits, 0), 1250);
    assert.equal(report[dimension].reduce((sum, row) => sum + row.leads, 0), 31);
    assert.ok(report[dimension].every((row) => !row.label.includes('Скрытый')));
    assert.equal(report.unknownCity[dimension].reduce((sum, row) => sum + row.visits, 0), 80);
    assert.equal(report.unknownCity[dimension].reduce((sum, row) => sum + row.leads, 0), 4);
    assert.ok(report.unknownCity[dimension].every((row) => !row.label.includes('Скрытый')));
  }
  assert.equal(report.cityCoverage.visitsShare, 1250 / 1330 * 100);
  assert.equal(report.cityCoverage.leadsShare, 31 / 35 * 100);
  const original = buildLeadConversionReport(limitedSourceRows, filters);
  assert.equal(original.totals.visits, 11250);
  assert.equal(original.unknownCity.totals.visits, 480);
});

test('visible-source filtering composes with city and selected-source filters without leaking hidden rows', () => {
  const visible = { ...filters, visibleSources: LEAD_CONVERSION_VISIBLE_SOURCES };
  const report = buildLeadConversionReport(limitedSourceRows, visible);
  const maps = report.options.sources.find((option) => option.label === 'Яндекс Карты').value;
  const selected = buildLeadConversionReport(limitedSourceRows, { ...visible, source: maps });
  assert.equal(selected.totals.visits, 1000);
  assert.equal(selected.totals.leads, 19);
  assert.equal(selected.unknownCity.totals.visits, 0);
  const petersburg = buildLeadConversionReport(limitedSourceRows, { ...visible, scope: 'СПБ' });
  assert.equal(petersburg.totals.visits, 50);
  assert.equal(petersburg.totals.leads, 2);
  assert.equal(petersburg.unknownCity.totals.visits, 80);
  const excludedSource = buildLeadConversionReport(limitedSourceRows, { ...visible, source: JSON.stringify('Мессенджеры') });
  assert.equal(excludedSource.totals.visits, 0);
  assert.equal(excludedSource.unknownCity.totals.leads, 0);
});

test('visible brand source children sum to each brand total with conversion weighted by visits', () => {
  const report = buildLeadConversionReport(limitedSourceRows, { ...filters, visibleSources: LEAD_CONVERSION_VISIBLE_SOURCES });
  for (const bucket of [report, report.unknownCity]) for (const brand of bucket.byBrand) {
    const children = bucket.byBrandSource.filter((row) => row.brand === brand.label);
    const visits = children.reduce((sum, row) => sum + row.visits, 0);
    const leads = children.reduce((sum, row) => sum + row.leads, 0);
    assert.equal(visits, brand.visits);
    assert.equal(leads, brand.leads);
    assert.equal(brand.conversionRate, leads / visits * 100);
  }
  const brand = report.byBrand.find((row) => row.label === 'Школа А · МСК');
  assert.equal(brand.visits, 1200);
  assert.equal(brand.leads, 29);
  assert.equal(brand.conversionRate, 29 / 1200 * 100);
  const empty = buildLeadConversionReport(limitedSourceRows, { ...filters, visibleSources: [] });
  assert.equal(empty.totals.visits, 0);
  assert.equal(empty.totals.conversionRate, null);
  assert.equal(empty.unknownCity.totals.visits, 0);
  assert.deepEqual(empty.options, { brands: [], sources: [] });
  assert.equal(empty.cityCoverage.visitsShare, null);
});

test('refresh ranges end at the selected month end or today and future months cannot be imported', () => {
  assert.deepEqual(leadConversionRefreshRange('2026-10', '2026-10-28'), { fromDate: '2026-10-01', toDate: '2026-10-28' });
  assert.deepEqual(leadConversionRefreshRange('2026-09', '2026-10-28'), { fromDate: '2026-09-01', toDate: '2026-09-30' });
  assert.deepEqual(leadConversionRefreshRange('2024-02', '2026-10-28'), { fromDate: '2024-02-01', toDate: '2024-02-29' });
  assert.equal(leadConversionRefreshRange('2026-11', '2026-10-28'), null);
  assert.equal(leadConversionRefreshRange('2026-13', '2026-10-28'), null);
});
