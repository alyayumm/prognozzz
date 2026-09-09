const CONFIG = {
  passwordProperty: 'WEEKLY_REPORT_PASSWORD',
  roistatApiKeyProperty: 'ROISTAT_API_KEY',
  roistatProjectProperty: 'ROISTAT_PROJECT_ID',
  roistatDefaultProjectId: '301351',
  yandexMetrikaCounterIdProperty: 'YANDEX_METRIKA_COUNTER_ID',
  yandexMetrikaTokenProperty: 'YANDEX_METRIKA_TOKEN',
  yandexMetrikaGoalIdProperty: 'YANDEX_METRIKA_GOAL_ID',
  yandexMetrikaAttributionProperty: 'YANDEX_METRIKA_ATTRIBUTION',
  sheets: {
    daily: 'Data_Daily',
    months: 'Month_Config',
    plans: 'Month_Plans',
    weekly: 'Weekly_Summary',
    events: 'Event_Map',
    coefficients: 'Forecast_Coefficients',
    brandPerformance: 'Brand_Performance_Weekly',
    brandBranches: 'Brand_Branches_Weekly',
    brandAliases: 'Brand_Aliases',
    roistatSyncLog: 'Roistat_Sync_Log',
    roistatFields: 'Roistat_Fields',
    metrikaDaily: 'Yandex_Metrika_Daily',
  },
};

const SALES_DEPARTMENT_CONFIG = {
  dynamicsSpreadsheetId: '1ptVO-e34DEMKxwriTFFg1hzZLjFhwuWvBqq8Gn5WemI',
  planSpreadsheetId: '1AabnCG2SckbpbrOAhh2J45eLXEqNEvbma1UNMTFetr4',
  monthKey: '2026-09',
  monthLabel: 'Сентябрь 2026',
  monthYear: 2026,
  monthIndex: 8,
  rop: 'Дакоро',
  dynamicsSheet: 'Динамика',
  dailySheet: 'Динамика по дням',
  psSheet: 'Выгрузка PS',
  planSheet: 'Лист1',
  managers: [
    'Руднев Денис',
    'Драбо Максим',
    'Борисова Алена',
    'Шевелев Иван',
    'Садовников Алексей',
    'Сергеева Софья',
    'Смирнов Никита',
    'Антиповский Евгений',
  ],
  dynamicsRowLabels: [
    'Менеджеры',
    'Обращения всего',
    'Обращения целевые',
    'Заявки с сайта',
    'Звонки',
    'Симакин и квизы',
    '',
    'Доля целевых от всего',
    'План обращения',
    'Факт обращения',
    'Прогноз обращения',
    'План договоры',
    'Факт Договоры',
    'Прогноз Шт',
    'Отставание',
    'Факт, %',
    'Прогноз, %',
    'A+B',
    'План конверсия',
    'Факт коверсия',
    'Заявки',
    'Доля договоров от заявок',
    'Доля заявок от целевых',
    'Договоры в мес.',
    'Доля договоров в мес. от договоров',
    'Факт конверсия из всего',
    'План обращения  целевые МСК',
    'Факт обращения всего МСК',
    'Факт обращения целевые МСК',
    'План обращения целевые СПБ',
    'Факт обращения всего СПБ',
    'Факт обращения целевые СПБ',
    'План договоры МСК',
    'Факт договоры МСК',
    'План  договоры СПБ',
    'Факт  договоры СПБ',
    'План Конверсия МСК',
  ],
  dynamicsRanges: [
    { range: 'D2:D38', names: ['Руднев Денис'] },
    { range: 'G2:H38', names: ['Смирнов Никита', 'Сергеева Софья'] },
    { range: 'N2:N38', names: ['Драбо Максим'] },
    { range: 'S2:S38', names: ['Садовников Алексей'] },
    { range: 'V2:V38', names: ['Борисова Алена'] },
    { range: 'X2:X38', names: ['Антиповский Евгений'] },
    { range: 'Z2:Z38', names: ['Шевелев Иван'] },
  ],
};

const SALES_DEPARTMENT_STATIC_PLAN_LABEL = 'Планы Дакоро Сентябрь';

const SALES_DEPARTMENT_STATIC_MANAGER_PLANS = [
  { planTraffic: 11, planQualified: 5, planDeals: 2, planVip: 0, planDistant: 1 },
  { planTraffic: 279, planQualified: 127, planDeals: 50, planVip: 12, planDistant: 32 },
  { planTraffic: 359, planQualified: 163, planDeals: 64, planVip: 16, planDistant: 42 },
  { planTraffic: 359, planQualified: 163, planDeals: 64, planVip: 16, planDistant: 42 },
  { planTraffic: 158, planQualified: 73, planDeals: 27, planVip: 7, planDistant: 17 },
  { planTraffic: 158, planQualified: 73, planDeals: 27, planVip: 7, planDistant: 17 },
  { planTraffic: 121, planQualified: 56, planDeals: 18, planVip: 5, planDistant: 12 },
  { planTraffic: 121, planQualified: 56, planDeals: 18, planVip: 5, planDistant: 12 },
];

const SALES_DEPARTMENT_STATIC_PS_METRICS = {
  'Руднев Денис': { vipDeals: 1, distantDeals: 0, paidDeals: 1, orderCount: 2, revenue: 118490, abDeals: 0 },
  'Драбо Максим': { vipDeals: 0, distantDeals: 0, paidDeals: 0, orderCount: 0, revenue: 0, abDeals: 0 },
  'Борисова Алена': { vipDeals: 4, distantDeals: 0, paidDeals: 2, orderCount: 11, revenue: 642980, abDeals: 2 },
  'Шевелев Иван': { vipDeals: 2, distantDeals: 0, paidDeals: 3, orderCount: 4, revenue: 224500, abDeals: 0 },
  'Садовников Алексей': { vipDeals: 2, distantDeals: 0, paidDeals: 2, orderCount: 11, revenue: 491490, abDeals: 4 },
  'Сергеева Софья': { vipDeals: 0, distantDeals: 0, paidDeals: 0, orderCount: 3, revenue: 184000, abDeals: 0 },
  'Смирнов Никита': { vipDeals: 1, distantDeals: 0, paidDeals: 0, orderCount: 2, revenue: 122500, abDeals: 0 },
  'Антиповский Евгений': { vipDeals: 3, distantDeals: 0, paidDeals: 5, orderCount: 10, revenue: 455990, abDeals: 0 },
};

const SALES_DEPARTMENT_STATIC_DYNAMICS_TEXT = {
  'D2:D38': '0\n0\n0\n0\n0\n\n#DIV/0!\n159\n0\n0\n62\n2\n9\n60\n3,20%\n14%\n0\n38,00%\n#DIV/0!\n0\n#DIV/0!\n#DIV/0!\n0\n0,00%\n#DIV/0!\n98\n0\n0\n61\n0\n0\n43\n2\n20\n0\n43,50%',
  'G2:H38': '38\t25\n21\t15\n11\t6\n17\t16\n2\t3\n\t\n55,26%\t60,00%\n54\t71\n21\t15\n90\t64\n18\t26\n4\t3\n17\t13\n14\t23\n22,71%\t11,40%\n97%\t49%\n0\t0\n31,50%\t36,00%\n19,05%\t20,00%\n6\t10\n66,67%\t30,00%\n28,57%\t66,67%\n4\t3\n100,00%\t100,00%\n10,53%\t12,00%\n33\t43\n0\t13\n8\t5\n21\t28\n0\t12\n13\t10\n12\t18\n1\t0\n6\t9\n3\t3\n36,50%\t41,00%',
  'N2:N38': '6\n4\n0\n6\n0\n\n66,67%\n122\n4\n17\n48\n0\n0\n48\n0,00%\n0%\n0\n38,00%\n0,00%\n0\n#DIV/0!\n0,00%\n0\n#DIV/0!\n0,00%\n75\n2\n2\n47\n4\n2\n33\n0\n15\n0\n43,50%',
  'S2:S38': '56\n31\n0\n0\n0\n\n55,36%\n71\n31\n133\n26\n13\n56\n13\n49,41%\n212%\n2\n36,00%\n41,94%\n16\n81,25%\n51,61%\n9\n69,23%\n23,21%\n43\n26\n15\n28\n30\n16\n18\n6\n9\n7\n41,00%',
  'V2:V38': '44\n26\n23\n21\n0\n\n59,09%\n159\n26\n111\n62\n12\n51\n50\n19,21%\n82%\n1\n38,00%\n46,15%\n11\n109,09%\n42,31%\n9\n75,00%\n27,27%\n98\n33\n17\n61\n11\n9\n43\n5\n20\n7\n43,50%',
  'X2:X38': '40\n26\n6\n31\n0\n\n65,00%\n54\n26\n111\n18\n9\n39\n9\n50,51%\n216%\n0\n32,00%\n34,62%\n12\n75,00%\n46,15%\n9\n100,00%\n22,50%\n33\n19\n14\n21\n21\n12\n12\n8\n6\n1\n36,50%',
  'Z2:Z38': '29\n12\n8\n20\n0\n\n41,38%\n159\n12\n51\n62\n4\n17\n58\n6,40%\n27%\n0\n38,00%\n33,33%\n5\n80,00%\n41,67%\n3\n75,00%\n13,79%\n98\n10\n5\n61\n19\n7\n43\n3\n20\n1\n43,50%',
};

const HEADERS = {
  Data_Daily: [
    'id',
    'date',
    'month',
    'week',
    'city',
    'channel',
    'metric',
    'plan',
    'fact',
    'forecast',
    'comment',
    'updatedAt',
    'recommendations',
    'omQualified',
  ],
  Month_Config: [
    'monthKey',
    'label',
    'year',
    'monthIndex',
    'daysInMonth',
    'status',
    'createdAt',
  ],
  Month_Plans: [
    'monthKey',
    'city',
    'metric',
    'plan',
    'updatedAt',
  ],
  Weekly_Summary: [
    'monthKey',
    'week',
    'startDate',
    'endDate',
    'metric',
    'plan',
    'fact',
    'omQualified',
    'forecast',
    'open',
    'low',
    'close',
    'high',
    'events',
    'updatedAt',
  ],
  Event_Map: [
    'id',
    'startDate',
    'endDate',
    'title',
    'type',
    'group',
    'source',
    'expectedEffect',
    'actualEffect',
    'importance',
    'city',
    'metric',
    'description',
    'updatedAt',
    'leadSource',
  ],
  Forecast_Coefficients: [
    'city',
    'metric',
    'weekday',
    'coefficient',
    'updatedAt',
  ],
  Brand_Performance_Weekly: [
    'id',
    'weekStart',
    'monthKey',
    'city',
    'brand',
    'domain',
    'source',
    'leads',
    'qualified',
    'sales',
    'revenue',
    'budget',
    'roas',
    'roasFact',
    'cpl',
    'cpql',
    'saleCost',
    'avgCheck',
    'updatedAt',
    'actualRevenue',
  ],
  Brand_Branches_Weekly: [
    'id',
    'weekStart',
    'monthKey',
    'city',
    'platform',
    'brand',
    'rawBrand',
    'branches',
    'updatedAt',
  ],
  Brand_Aliases: [
    'raw',
    'brand',
    'updatedAt',
  ],
  Roistat_Sync_Log: [
    'id',
    'kind',
    'fromDate',
    'toDate',
    'status',
    'message',
    'sourceRows',
    'brandRows',
    'skippedRows',
    'updatedAt',
  ],
  Roistat_Fields: [
    'kind',
    'name',
    'title',
    'updatedAt',
  ],
  Yandex_Metrika_Daily: [
    'id',
    'date',
    'monthKey',
    'city',
    'brand',
    'domain',
    'source',
    'trafficSource',
    'utmSource',
    'visits',
    'users',
    'pageviews',
    'bounceRate',
    'avgVisitDuration',
    'goalVisits',
    'goalRate',
    'updatedAt',
    'comment',
  ],
};

const FORECAST_CITIES = ['МСК', 'СПБ', 'сообщения'];
const FORECAST_METRICS = ['Лиды', 'Квалы', 'Продажи'];
const FORECAST_WEEKDAYS = [
  { key: 'mon', label: 'ПН', dayIndex: 1, defaultValue: 1.121 },
  { key: 'tue', label: 'ВТ', dayIndex: 2, defaultValue: 1.19 },
  { key: 'wed', label: 'СР', dayIndex: 3, defaultValue: 1.123 },
  { key: 'thu', label: 'ЧТ', dayIndex: 4, defaultValue: 1.063 },
  { key: 'fri', label: 'ПТ', dayIndex: 5, defaultValue: 0.883 },
  { key: 'sat', label: 'СБ', dayIndex: 6, defaultValue: 0.795 },
  { key: 'sun', label: 'ВС', dayIndex: 0, defaultValue: 0.825 },
];

function doPost(e) {
  try {
    const request = JSON.parse(e.postData.contents || '{}');
    const action = request.action;
    const payload = request.payload || {};

    if (action === 'verifyPassword') {
      return jsonResponse({ ok: true, data: verifyPassword_(request.password) });
    }

    const externalReadActions = ['getSalesDepartmentDashboard'];
    if (externalReadActions.indexOf(action) < 0) {
      ensureServiceSheets_();
    }

    const routes = {
      getMonths: getMonths_,
      getMonthData: getMonthData_,
      createMonth: createMonth_,
      upsertDailyValues: upsertDailyValues_,
      getWeeklySummary: getWeeklySummary_,
      upsertEvent: upsertEvent_,
      deleteEvent: deleteEvent_,
      getForecastCoefficients: getForecastCoefficients_,
      updateForecastCoefficients: updateForecastCoefficients_,
      getBrandDashboard: getBrandDashboard_,
      getBrandPerformance: getBrandPerformance_,
      getBrandBranches: getBrandBranches_,
      getBrandAliases: getBrandAliases_,
      getSalesDepartmentDashboard: getSalesDepartmentDashboard_,
      upsertBrandPerformance: upsertBrandPerformance_,
      upsertBrandBranches: upsertBrandBranches_,
      getRoistatSyncStatus: getRoistatSyncStatus_,
      syncRoistatSources: syncRoistatSources_,
      syncRoistatBrands: syncRoistatBrands_,
      getRoistatFields: getRoistatFields_,
      refreshRoistatFields: refreshRoistatFields_,
      setRoistatRecommendedFields: setRoistatRecommendedFields_,
      getYandexMetrikaSyncStatus: getYandexMetrikaSyncStatus_,
      getMetrikaBrandSources: getMetrikaBrandSources_,
      syncYandexMetrikaBrandSources: syncYandexMetrikaBrandSources_,
    };

    if (!routes[action]) {
      throw new Error('Неизвестное действие: ' + action);
    }

    const writeActions = ['createMonth', 'upsertDailyValues', 'upsertEvent', 'deleteEvent', 'updateForecastCoefficients', 'upsertBrandPerformance', 'upsertBrandBranches', 'syncRoistatSources', 'syncRoistatBrands', 'refreshRoistatFields', 'setRoistatRecommendedFields', 'syncYandexMetrikaBrandSources'];
    if (writeActions.indexOf(action) >= 0 && !verifyPassword_(request.password)) {
      throw new Error('Неверный пароль админки');
    }

    return jsonResponse({ ok: true, data: routes[action](payload) });
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message || String(error) });
  }
}

function setupWeeklyReportService() {
  ensureServiceSheets_();
}

function setWeeklyReportPassword(password) {
  PropertiesService.getScriptProperties().setProperty(CONFIG.passwordProperty, password);
}

function authorizeRoistatOnce() {
  refreshRoistatFields_();
}

function setRoistatRecommendedFieldsOnce() {
  return setRoistatRecommendedFields_();
}

function setYandexMetrikaCredentials(counterId, token, goalId) {
  const properties = PropertiesService.getScriptProperties();
  properties.setProperty(CONFIG.yandexMetrikaCounterIdProperty, String(counterId || '').trim());
  properties.setProperty(CONFIG.yandexMetrikaTokenProperty, String(token || '').trim());
  if (goalId !== undefined && goalId !== null && String(goalId).trim()) {
    properties.setProperty(CONFIG.yandexMetrikaGoalIdProperty, String(goalId).trim());
  }
  return getYandexMetrikaSyncStatus_();
}

function setYandexMetrikaCredentialsOnce() {
  return setYandexMetrikaCredentials('COUNTER_ID', 'OAUTH_TOKEN', '');
}

function setRoistatRecommendedFields_() {
  PropertiesService.getScriptProperties().setProperties({
    ROISTAT_METRIC_QUALIFIED: 'custom_18',
    ROISTAT_METRIC_SALES: 'payment_sales',
    ROISTAT_METRIC_REVENUE: 'payment_revenue',
    ROISTAT_METRIC_BUDGET: 'marketing_cost',
    ROISTAT_DIMENSION_SOURCE: 'custom_dimension_1',
    ROISTAT_DIMENSION_DOMAIN: 'custom_dimension_3',
    ROISTAT_DIMENSION_CITY: 'custom_dimension_6',
    ROISTAT_DIMENSION_LEAD_TYPE: 'order_field_21',
  });
  refreshRoistatFields_();
  return {
    message: 'Рекомендуемые поля Roistat сохранены.',
  };
}

function verifyPassword_(password) {
  const stored = PropertiesService.getScriptProperties().getProperty(CONFIG.passwordProperty);
  if (!stored) return true;
  return String(password || '') === stored;
}

function ensureServiceSheets_() {
  const ss = SpreadsheetApp.getActive();
  Object.keys(CONFIG.sheets).forEach((key) => {
    const title = CONFIG.sheets[key];
    let sheet = ss.getSheetByName(title);
    if (!sheet) {
      sheet = ss.insertSheet(title);
    }
    const headers = HEADERS[title];
    const current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    if (current.join('|') !== headers.join('|')) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
      sheet.autoResizeColumns(1, headers.length);
    }
  });
  formatServiceSheetKeys_();
}

function formatServiceSheetKeys_() {
  const ss = SpreadsheetApp.getActive();
  [
    { sheet: CONFIG.sheets.months, column: 1 },
    { sheet: CONFIG.sheets.plans, column: 1 },
    { sheet: CONFIG.sheets.daily, column: 3 },
    { sheet: CONFIG.sheets.weekly, column: 1 },
    { sheet: CONFIG.sheets.brandPerformance, column: 2 },
    { sheet: CONFIG.sheets.brandPerformance, column: 3 },
    { sheet: CONFIG.sheets.brandBranches, column: 2 },
    { sheet: CONFIG.sheets.brandBranches, column: 3 },
    { sheet: CONFIG.sheets.roistatSyncLog, column: 3 },
    { sheet: CONFIG.sheets.roistatSyncLog, column: 4 },
    { sheet: CONFIG.sheets.metrikaDaily, column: 2 },
    { sheet: CONFIG.sheets.metrikaDaily, column: 3 },
  ].forEach((entry) => {
    const sheet = ss.getSheetByName(entry.sheet);
    if (!sheet) return;
    sheet.getRange(1, entry.column, Math.max(sheet.getMaxRows(), 1), 1).setNumberFormat('@');
  });
}

function getMonths_() {
  const plans = readObjects_(CONFIG.sheets.plans);
  return readObjects_(CONFIG.sheets.months).map((month) => decorateMonthConfig_(month, plans));
}

function getMonthData_(payload) {
  const monthKey = normalizeMonthKey_(payload.monthKey);
  const plans = readObjects_(CONFIG.sheets.plans);
  return {
    config: decorateMonthConfig_(readObjects_(CONFIG.sheets.months).find((row) => row.monthKey === monthKey) || null, plans),
    records: readObjects_(CONFIG.sheets.daily).filter((row) => row.month === monthKey).map(normalizeDailyForClient_),
    events: readObjects_(CONFIG.sheets.events).filter((event) => {
      return String(event.startDate).slice(0, 7) <= monthKey && String(event.endDate).slice(0, 7) >= monthKey;
    }).map(normalizeEventForClient_),
  };
}

function getBrandDashboard_() {
  return {
    performance: getBrandPerformance_(),
    branches: getBrandBranches_(),
    aliases: getBrandAliases_(),
    metrika: getMetrikaBrandSources_(),
  };
}

function getBrandPerformance_() {
  return readObjects_(CONFIG.sheets.brandPerformance);
}

function getBrandBranches_() {
  return readObjects_(CONFIG.sheets.brandBranches);
}

function getBrandAliases_() {
  return readObjects_(CONFIG.sheets.brandAliases);
}

function getSalesDepartmentDashboard_(payload) {
  const config = SALES_DEPARTMENT_CONFIG;
  const warnings = [];

  const planByManager = salesStaticPlanByManager_();
  const dynamicsByManager = salesReadStaticDynamicsByManager_();
  const daily = [];
  const psByManager = salesStaticPsByManager_();
  const workingDaysInMonth = salesCountWorkingDaysInMonth_(config.monthYear, config.monthIndex);
  const latestActualDate = salesCurrentMonthDateKey_(config);
  const workingDaysPassed = Math.max(
    1,
    latestActualDate
      ? salesCountWorkingDaysUntil_(config.monthYear, config.monthIndex, latestActualDate)
      : 1,
  );
  const activeCalendarDays = workingDaysPassed;

  warnings.push('Данные отдела продаж загружены из быстрого снимка "Динамика" и "Выгрузка PS" от 08.09.2026, потому что исходная таблица долго отдает формульные диапазоны.');
  warnings.push('Дневная динамика временно не читается сервером: лист отвечает слишком долго. Основные показатели взяты из "Динамика".');

  const managers = config.managers.map((name) => {
    const plan = planByManager[name] || salesEmptyPlan_();
    const dynamic = dynamicsByManager[name] || {};
    const ps = psByManager[name] || null;
    const factDeals = salesNumber_(dynamic['Факт Договоры']);
    const factQualified = salesNumber_(dynamic['Факт обращения']) || salesNumber_(dynamic['Обращения целевые']);
    const totalTraffic = salesNumber_(dynamic['Обращения всего']);
    const forecastDeals = salesNumber_(dynamic['Прогноз Шт']);
    const forecastQualified = salesNumber_(dynamic['Прогноз обращения']);
    const revenue = ps ? ps.revenue : null;
    const orderCount = ps ? ps.orderCount : null;

    return {
      name: name,
      displayName: dynamic['Менеджеры'] || name,
      planTraffic: plan.planTraffic,
      planQualified: plan.planQualified,
      planDeals: plan.planDeals,
      planVip: plan.planVip,
      planDistant: plan.planDistant,
      totalTraffic: totalTraffic,
      factQualified: factQualified,
      forecastQualified: forecastQualified,
      siteRequests: salesNumber_(dynamic['Заявки с сайта']),
      calls: salesNumber_(dynamic['Звонки']),
      quizRequests: salesNumber_(dynamic['Симакин и квизы']),
      applications: salesNumber_(dynamic['Заявки']),
      factDeals: factDeals,
      forecastDeals: forecastDeals,
      lagDeals: salesNumber_(dynamic['Отставание']),
      abDeals: Math.max(salesNumber_(dynamic['A+B']), ps ? ps.abDeals : 0),
      sheetFactCompletion: salesNullablePercent_(dynamic['Факт, %']),
      sheetForecastCompletion: salesNullablePercent_(dynamic['Прогноз, %']),
      planConversion: salesNullablePercent_(dynamic['План конверсия']) || salesPercent_(plan.planDeals, plan.planQualified),
      factConversion: salesNullablePercent_(dynamic['Факт коверсия']) || salesPercent_(factDeals, factQualified),
      totalConversion: salesNullablePercent_(dynamic['Факт конверсия из всего']) || salesPercent_(factDeals, totalTraffic),
      applicationsToDeals: salesNullablePercent_(dynamic['Доля договоров от заявок']),
      mskTraffic: salesNumber_(dynamic['Факт обращения всего МСК']),
      spbTraffic: salesNumber_(dynamic['Факт обращения всего СПБ']),
      mskQualified: salesNumber_(dynamic['Факт обращения целевые МСК']),
      spbQualified: salesNumber_(dynamic['Факт обращения целевые СПБ']),
      mskDeals: salesNumber_(dynamic['Факт договоры МСК']),
      spbDeals: salesNumber_(dynamic['Факт  договоры СПБ']),
      mskConversion: salesPercent_(salesNumber_(dynamic['Факт договоры МСК']), salesNumber_(dynamic['Факт обращения целевые МСК'])),
      spbConversion: salesPercent_(salesNumber_(dynamic['Факт  договоры СПБ']), salesNumber_(dynamic['Факт обращения целевые СПБ'])),
      vipDeals: ps ? ps.vipDeals : null,
      distantDeals: ps ? ps.distantDeals : null,
      paidDeals: ps ? ps.paidDeals : null,
      orderCount: orderCount,
      avgCheck: revenue !== null && orderCount ? revenue / orderCount : null,
      revenue: revenue,
      linearDealsForecast: salesLinearForecast_(factDeals, workingDaysPassed, workingDaysInMonth),
      linearQualifiedForecast: salesLinearForecast_(factQualified, workingDaysPassed, workingDaysInMonth),
    };
  });

  return {
    rop: config.rop,
    monthKey: config.monthKey,
    monthLabel: config.monthLabel,
    planLabel: SALES_DEPARTMENT_STATIC_PLAN_LABEL,
    latestActualDate: latestActualDate,
    workingDaysPassed: workingDaysPassed,
    workingDaysInMonth: workingDaysInMonth,
    activeCalendarDays: activeCalendarDays,
    managers: managers,
    daily: daily,
    totals: salesBuildTotals_(managers),
    warnings: warnings,
    sourceLinks: {
      dynamics: 'https://docs.google.com/spreadsheets/d/' + config.dynamicsSpreadsheetId + '/edit#gid=2045376562',
      plans: 'https://docs.google.com/spreadsheets/d/' + config.planSpreadsheetId + '/edit#gid=0',
    },
  };
}

function salesReadDisplayRange_(sheet, range) {
  if (!sheet) return [];
  return sheet.getRange(range).getDisplayValues();
}

function salesStaticPlanByManager_() {
  const result = {};
  SALES_DEPARTMENT_CONFIG.managers.forEach((name, index) => {
    result[name] = SALES_DEPARTMENT_STATIC_MANAGER_PLANS[index] || salesEmptyPlan_();
  });
  return result;
}

function salesStaticPsByManager_() {
  const result = {};
  SALES_DEPARTMENT_CONFIG.managers.forEach((name) => {
    const shortName = name.split(' ').slice(0, 2).join(' ');
    result[name] = SALES_DEPARTMENT_STATIC_PS_METRICS[shortName] || {
      vipDeals: 0,
      distantDeals: 0,
      paidDeals: 0,
      orderCount: 0,
      revenue: 0,
      abDeals: 0,
    };
  });
  return result;
}

function salesReadStaticDynamicsByManager_() {
  const result = {};
  SALES_DEPARTMENT_CONFIG.dynamicsRanges.forEach((config) => {
    const values = salesParseStaticMatrix_(SALES_DEPARTMENT_STATIC_DYNAMICS_TEXT[config.range]);
    config.names.forEach((managerName, columnIndex) => {
      const metrics = result[managerName] || {};
      SALES_DEPARTMENT_CONFIG.dynamicsRowLabels.forEach((label, rowIndex) => {
        if (!label) return;
        metrics[label] = rowIndex === 0
          ? managerName
          : values[rowIndex - 1] && values[rowIndex - 1][columnIndex]
            ? values[rowIndex - 1][columnIndex]
            : '';
      });
      result[managerName] = metrics;
    });
  });
  return result;
}

function salesParseStaticMatrix_(text) {
  return String(text || '').split('\n').map((row) => row.split('\t'));
}

function salesReadDynamicsByManager_(sheet, warnings) {
  const result = {};
  if (!sheet) return result;
  SALES_DEPARTMENT_CONFIG.dynamicsRanges.forEach((config) => {
    try {
      const values = sheet.getRange(config.range).getDisplayValues();
      config.names.forEach((managerName, columnIndex) => {
        const metrics = result[managerName] || {};
        SALES_DEPARTMENT_CONFIG.dynamicsRowLabels.forEach((label, rowIndex) => {
          if (!label) return;
          metrics[label] = values[rowIndex] && values[rowIndex][columnIndex] ? values[rowIndex][columnIndex] : '';
        });
        result[managerName] = metrics;
      });
    } catch (error) {
      warnings.push('Не прочитан фрагмент динамики ' + config.range + '.');
    }
  });
  return result;
}

function salesParsePlanSheet_(rows) {
  const result = {};
  const managerRow = rows.find((row) => salesNormalizeLabel_(row[0]) === salesNormalizeLabel_('Менеджеры')) || [];
  const rowMap = {};
  rows.forEach((row) => {
    rowMap[salesNormalizeLabel_(row[0])] = row;
  });
  SALES_DEPARTMENT_CONFIG.managers.forEach((name) => {
    const columnIndex = managerRow.findIndex((value) => salesManagerMatches_(value, name));
    const readPlan = (label) => salesNumber_((rowMap[salesNormalizeLabel_(label)] || [])[columnIndex]);
    result[name] = {
      planTraffic: readPlan('Обращения Общие'),
      planQualified: readPlan('Общие Квал'),
      planDeals: readPlan('Общий План Договоры'),
      planVip: readPlan('ВИП'),
      planDistant: readPlan('Дистанты'),
    };
  });
  return result;
}

function salesParseDailySheet_(rows) {
  const dateRow = salesFindRow_(rows, 'Дата');
  const weekdayRow = salesFindRow_(rows, 'День недели');
  const trafficMskRow = salesFindRow_(rows, 'Обращения МСК');
  const trafficSpbRow = salesFindRow_(rows, 'Обращения СПБ');
  const trafficTotalRow = salesFindRow_(rows, 'Итого Обращения');
  const dealsMskRow = salesFindRow_(rows, 'Договоры МСК');
  const dealsSpbRow = salesFindRow_(rows, 'Договоры СПБ');
  const dealsTotalRow = salesFindRow_(rows, 'Итого Договоры');
  if (!dateRow.length) return [];

  return dateRow.slice(1).map((label, offset) => {
    const column = offset + 1;
    const normalizedDate = salesParseDayLabel_(label);
    const mskTraffic = salesNumber_(trafficMskRow[column]);
    const spbTraffic = salesNumber_(trafficSpbRow[column]);
    const mskDeals = salesNumber_(dealsMskRow[column]);
    const spbDeals = salesNumber_(dealsSpbRow[column]);
    return {
      key: normalizedDate || SALES_DEPARTMENT_CONFIG.monthKey + '-' + String(column).padStart(2, '0'),
      label: label || String(column).padStart(2, '0'),
      weekday: weekdayRow[column] || '',
      totalTraffic: salesNumber_(trafficTotalRow[column]) || mskTraffic + spbTraffic,
      mskTraffic: mskTraffic,
      spbTraffic: spbTraffic,
      totalDeals: salesNumber_(dealsTotalRow[column]) || mskDeals + spbDeals,
      mskDeals: mskDeals,
      spbDeals: spbDeals,
    };
  }).filter((day) => day.label);
}

function salesParsePsSheet_(sheet, monthKey) {
  const result = {};
  if (!sheet) return result;
  const lastRow = Math.min(Math.max(sheet.getLastRow(), 1), 1500);
  if (lastRow < 2) return result;
  const rows = sheet.getRange(2, 16, lastRow - 1, 27).getDisplayValues();
  rows.forEach((row) => {
    const abFlag = row[0];
    const manager = row[7];
    const createdAt = row[10];
    const paymentDate = row[11];
    const price = salesNumber_(row[14]);
    const tariff = String(row[21] || '') + ' ' + String(row[22] || '');
    const distant = row[23];
    const count = salesNumber_(row[24]) || 1;
    const contract = row[26];
    const managerName = SALES_DEPARTMENT_CONFIG.managers.find((name) => salesManagerMatches_(manager, name));

    if (!managerName || !salesIsDateInMonth_(createdAt, monthKey) || !salesHasContract_(contract)) return;

    const item = result[managerName] || {
      vipDeals: 0,
      distantDeals: 0,
      paidDeals: 0,
      orderCount: 0,
      revenue: 0,
      abDeals: 0,
    };
    item.orderCount += count;
    item.revenue += price;
    if (salesIsTruthy_(abFlag)) item.abDeals += count;
    if (salesIsVipTariff_(tariff)) item.vipDeals += count;
    if (salesIsTruthy_(distant)) item.distantDeals += count;
    if (paymentDate && paymentDate !== '-' && paymentDate !== '—') item.paidDeals += count;
    result[managerName] = item;
  });
  return result;
}

function salesBuildTotals_(managers) {
  const vipDeals = salesSumNullable_(managers, (manager) => manager.vipDeals);
  const distantDeals = salesSumNullable_(managers, (manager) => manager.distantDeals);
  const paidDeals = salesSumNullable_(managers, (manager) => manager.paidDeals);
  const orderCount = salesSumNullable_(managers, (manager) => manager.orderCount);
  const revenue = salesSumNullable_(managers, (manager) => manager.revenue);
  const factDeals = salesSum_(managers, (manager) => manager.factDeals);
  const totalTraffic = salesSum_(managers, (manager) => manager.totalTraffic);
  const factQualified = salesSum_(managers, (manager) => manager.factQualified);
  const planDeals = salesSum_(managers, (manager) => manager.planDeals);

  return {
    planTraffic: salesSum_(managers, (manager) => manager.planTraffic),
    planQualified: salesSum_(managers, (manager) => manager.planQualified),
    planDeals: planDeals,
    planVip: salesSum_(managers, (manager) => manager.planVip),
    planDistant: salesSum_(managers, (manager) => manager.planDistant),
    totalTraffic: totalTraffic,
    factQualified: factQualified,
    forecastQualified: salesSum_(managers, (manager) => manager.forecastQualified),
    factDeals: factDeals,
    forecastDeals: salesSum_(managers, (manager) => manager.forecastDeals),
    abDeals: salesSum_(managers, (manager) => manager.abDeals),
    vipDeals: vipDeals,
    distantDeals: distantDeals,
    paidDeals: paidDeals,
    orderCount: orderCount,
    revenue: revenue,
    avgCheck: revenue !== null && orderCount ? revenue / orderCount : null,
    conversionToQualified: salesPercent_(factQualified, totalTraffic),
    conversionToDeals: salesPercent_(factDeals, factQualified),
    dealPlanCompletion: Math.round(salesPercent_(factDeals, planDeals) || 0),
    linearDealsForecast: salesSum_(managers, (manager) => manager.linearDealsForecast),
  };
}

function salesFindRow_(rows, label) {
  return rows.find((row) => salesNormalizeLabel_(row[0]) === salesNormalizeLabel_(label)) || [];
}

function salesNumber_(value) {
  if (typeof value === 'number') return isFinite(value) ? value : 0;
  if (typeof value === 'boolean') return value ? 1 : 0;
  const cleaned = String(value || '')
    .replace(/\s/g, '')
    .replace('%', '')
    .replace('₽', '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '');
  const parsed = Number(cleaned);
  return isFinite(parsed) ? parsed : 0;
}

function salesNullablePercent_(value) {
  if (!value || String(value).indexOf('#') >= 0) return null;
  return salesNumber_(value);
}

function salesPercent_(numerator, denominator) {
  if (!denominator) return null;
  return (numerator / denominator) * 100;
}

function salesLinearForecast_(fact, passedDays, totalDays) {
  if (!passedDays || !totalDays) return fact;
  return Math.round((fact / passedDays) * totalDays);
}

function salesSum_(items, getValue) {
  return items.reduce((total, item) => total + Number(getValue(item) || 0), 0);
}

function salesSumNullable_(items, getValue) {
  let hasValue = false;
  const value = items.reduce((total, item) => {
    const next = getValue(item);
    if (next === null || next === undefined) return total;
    hasValue = true;
    return total + Number(next || 0);
  }, 0);
  return hasValue ? value : null;
}

function salesEmptyPlan_() {
  return {
    planTraffic: 0,
    planQualified: 0,
    planDeals: 0,
    planVip: 0,
    planDistant: 0,
  };
}

function salesParseDayLabel_(label) {
  const match = String(label || '').match(/^(\d{1,2})\.(\d{1,2})/);
  if (!match) return null;
  return SALES_DEPARTMENT_CONFIG.monthYear + '-' + match[2].padStart(2, '0') + '-' + match[1].padStart(2, '0');
}

function salesCurrentMonthDateKey_(config) {
  const timezone = Session.getScriptTimeZone();
  const today = new Date();
  const todayMonth = Utilities.formatDate(today, timezone, 'yyyy-MM');
  if (todayMonth === config.monthKey) {
    return Utilities.formatDate(today, timezone, 'yyyy-MM-dd');
  }
  if (todayMonth > config.monthKey) {
    const lastDay = new Date(config.monthYear, config.monthIndex + 1, 0).getDate();
    return config.monthKey + '-' + String(lastDay).padStart(2, '0');
  }
  return null;
}

function salesLatestActualDate_(days) {
  const activeDays = days.filter((day) => day.totalTraffic > 0 || day.totalDeals > 0);
  return activeDays.length ? activeDays[activeDays.length - 1].key : null;
}

function salesCountWorkingDaysInMonth_(year, zeroBasedMonth) {
  const daysInMonth = new Date(year, zeroBasedMonth + 1, 0).getDate();
  let count = 0;
  for (let day = 1; day <= daysInMonth; day += 1) {
    if (salesIsWorkingDay_(new Date(year, zeroBasedMonth, day))) count += 1;
  }
  return count;
}

function salesCountWorkingDaysUntil_(year, zeroBasedMonth, isoDate) {
  const dayLimit = Number(String(isoDate).slice(8, 10)) || 1;
  let count = 0;
  for (let day = 1; day <= dayLimit; day += 1) {
    if (salesIsWorkingDay_(new Date(year, zeroBasedMonth, day))) count += 1;
  }
  return count;
}

function salesIsWorkingDay_(date) {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

function salesIsDateInMonth_(value, expectedMonthKey) {
  const match = String(value || '').match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (!match) return false;
  return match[3] + '-' + match[2] === expectedMonthKey;
}

function salesHasContract_(value) {
  const normalized = salesNormalizeText_(value);
  return Boolean(normalized) && normalized.indexOf('договор') >= 0 && normalized.indexOf('нет') < 0;
}

function salesIsTruthy_(value) {
  const normalized = salesNormalizeText_(value);
  return normalized === 'true' || normalized === 'истина' || normalized === 'да' || normalized === '1';
}

function salesIsVipTariff_(value) {
  const normalized = salesNormalizeText_(value);
  return normalized.indexOf('вип') >= 0 || normalized.indexOf('vip') >= 0 || normalized.indexOf('расшир') >= 0;
}

function salesManagerMatches_(candidate, manager) {
  const normalizedCandidate = salesNormalizePerson_(candidate);
  const normalizedManager = salesNormalizePerson_(manager);
  if (!normalizedCandidate || !normalizedManager) return false;
  return normalizedCandidate.indexOf(normalizedManager) >= 0 || normalizedManager.indexOf(normalizedCandidate) >= 0;
}

function salesNormalizeLabel_(value) {
  return salesNormalizeText_(value).replace(/[^a-zа-я0-9%+]+/g, '');
}

function salesNormalizePerson_(value) {
  return salesNormalizeText_(value).replace(/[^a-zа-я]+/g, '');
}

function salesNormalizeText_(value) {
  return String(value || '').trim().toLowerCase().replace(/ё/g, 'е');
}

function upsertBrandPerformance_(payload) {
  const records = Array.isArray(payload.records) ? payload.records : (Array.isArray(payload.rows) ? payload.rows : []);
  return upsertRowsById_(CONFIG.sheets.brandPerformance, HEADERS.Brand_Performance_Weekly, records, brandPerformanceRow_);
}

function upsertBrandBranches_(payload) {
  const records = Array.isArray(payload.records) ? payload.records : (Array.isArray(payload.rows) ? payload.rows : []);
  return upsertRowsById_(CONFIG.sheets.brandBranches, HEADERS.Brand_Branches_Weekly, records, brandBranchRow_);
}

function getRoistatSyncStatus_() {
  const properties = PropertiesService.getScriptProperties();
  const logs = readObjects_(CONFIG.sheets.roistatSyncLog)
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
    .slice(0, 20);

  return {
    projectId: properties.getProperty(CONFIG.roistatProjectProperty) || CONFIG.roistatDefaultProjectId,
    hasApiKey: Boolean(properties.getProperty(CONFIG.roistatApiKeyProperty)),
    logs: logs,
  };
}

function getRoistatFields_() {
  return readObjects_(CONFIG.sheets.roistatFields);
}

function getYandexMetrikaSyncStatus_() {
  const properties = PropertiesService.getScriptProperties();
  const logs = readObjects_(CONFIG.sheets.roistatSyncLog)
    .filter((row) => String(row.kind || '') === 'metrika')
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
    .slice(0, 10);

  return {
    counterId: properties.getProperty(CONFIG.yandexMetrikaCounterIdProperty) || '',
    hasToken: Boolean(properties.getProperty(CONFIG.yandexMetrikaTokenProperty)),
    hasGoalId: Boolean(properties.getProperty(CONFIG.yandexMetrikaGoalIdProperty)),
    logs: logs,
  };
}

function getMetrikaBrandSources_() {
  return readObjects_(CONFIG.sheets.metrikaDaily).map(normalizeMetrikaRecordForClient_);
}

function syncYandexMetrikaBrandSources_(payload) {
  const range = normalizeRoistatDateRange_(payload);
  const dates = eachDateInRange_(range.fromDate, range.toDate);

  if (dates.length > 62) {
    throw new Error('Метрика: выберите период до 62 дней за один импорт, чтобы не упереться в лимиты Apps Script.');
  }

  try {
    const warnings = [];
    const response = fetchYandexMetrikaStats_(range, warnings);
    const rawRows = extractYandexMetrikaRows_(response);
    const records = aggregateYandexMetrikaRows_(rawRows, warnings);
    const writeResult = replaceMetrikaRowsForRange_(records, range);
    const result = {
      kind: 'metrika',
      fromDate: range.fromDate,
      toDate: range.toDate,
      status: warnings.length || writeResult.skippedRows ? 'warning' : 'success',
      message: metrikaResultMessage_(writeResult.updated, writeResult.skippedRows, warnings),
      sourceRows: writeResult.updated,
      brandRows: 0,
      skippedRows: writeResult.skippedRows,
      updatedAt: new Date(),
    };
    logRoistatSync_(result);
    return result;
  } catch (error) {
    const result = {
      kind: 'metrika',
      fromDate: range.fromDate,
      toDate: range.toDate,
      status: 'error',
      message: yandexMetrikaUserError_(error),
      sourceRows: 0,
      brandRows: 0,
      skippedRows: 0,
      updatedAt: new Date(),
    };
    logRoistatSync_(result);
    throw new Error(result.message);
  }
}

function fetchYandexMetrikaStats_(range, warnings) {
  const properties = PropertiesService.getScriptProperties();
  const goalId = String(properties.getProperty(CONFIG.yandexMetrikaGoalIdProperty) || '').trim();
  const attribution = String(properties.getProperty(CONFIG.yandexMetrikaAttributionProperty) || 'lastsign').trim() || 'lastsign';
  const customDimensions = String(properties.getProperty('YANDEX_METRIKA_DIMENSIONS') || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const customMetrics = String(properties.getProperty('YANDEX_METRIKA_METRICS') || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  const baseMetrics = customMetrics.length
    ? customMetrics
    : ['ym:s:visits', 'ym:s:users', 'ym:s:pageviews', 'ym:s:bounceRate', 'ym:s:avgVisitDurationSeconds'];
  const metricsWithGoals = goalId
    ? baseMetrics.concat(['ym:s:goal' + goalId + 'visits', 'ym:s:goal' + goalId + 'conversionRate'])
    : baseMetrics;
  const metricSets = uniqueJson_([metricsWithGoals, baseMetrics].filter((metrics) => metrics.length));

  const detailedAttributionDimensions = [
    'ym:s:date',
    'ym:s:startURL',
    'ym:s:' + attribution + 'TrafficSource',
    'ym:s:' + attribution + 'UTMSource',
  ];
  const dimensionsSets = uniqueJson_(
    (customDimensions.length ? [customDimensions] : [])
      .concat([
        detailedAttributionDimensions,
        ['ym:s:date', 'ym:s:startURL', 'ym:s:lastTrafficSource', 'ym:s:lastUTMSource'],
        ['ym:s:date', 'ym:s:startURL'],
        ['ym:s:date'],
      ]),
  );

  const errors = [];
  for (let dimensionIndex = 0; dimensionIndex < dimensionsSets.length; dimensionIndex += 1) {
    for (let metricIndex = 0; metricIndex < metricSets.length; metricIndex += 1) {
      const dimensions = dimensionsSets[dimensionIndex];
      const metrics = metricSets[metricIndex];
      try {
        const response = fetchYandexMetrikaEndpoint_({
          ids: properties.getProperty(CONFIG.yandexMetrikaCounterIdProperty),
          date1: range.fromDate,
          date2: range.toDate,
          dimensions: dimensions.join(','),
          metrics: metrics.join(','),
          limit: 100000,
          accuracy: 'full',
          include_undefined: 'true',
          lang: 'ru',
        });
        if (dimensionIndex > 0 || metricIndex > 0) {
          warnings.push('Метрика приняла упрощенный запрос: dimensions=' + dimensions.join(', ') + '; metrics=' + metrics.join(', ') + '.');
        }
        return response;
      } catch (error) {
        errors.push(yandexMetrikaUserError_(error));
      }
    }
  }

  throw new Error(unique_(errors).slice(0, 3).join(' | '));
}

function fetchYandexMetrikaEndpoint_(params) {
  const properties = PropertiesService.getScriptProperties();
  const token = properties.getProperty(CONFIG.yandexMetrikaTokenProperty);
  const counterId = params.ids || properties.getProperty(CONFIG.yandexMetrikaCounterIdProperty);

  if (!counterId) {
    throw new Error('Не задан YANDEX_METRIKA_COUNTER_ID в Script Properties.');
  }
  if (!token) {
    throw new Error('Не задан YANDEX_METRIKA_TOKEN в Script Properties.');
  }

  const cleanedParams = Object.assign({}, params, { ids: counterId });
  const query = Object.keys(cleanedParams)
    .filter((key) => cleanedParams[key] !== undefined && cleanedParams[key] !== null && cleanedParams[key] !== '')
    .map((key) => encodeURIComponent(key) + '=' + encodeURIComponent(cleanedParams[key]))
    .join('&');
  const response = UrlFetchApp.fetch('https://api-metrika.yandex.net/stat/v1/data?' + query, {
    method: 'get',
    headers: {
      Authorization: 'OAuth ' + token,
    },
    muteHttpExceptions: true,
  });
  const status = response.getResponseCode();
  const text = response.getContentText();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch (ignore) {
    parsed = null;
  }

  if (status < 200 || status >= 300) {
    throw new Error('Yandex Metrika HTTP ' + status + ': ' + sanitizeRoistatText_(text));
  }
  if (!parsed || parsed.errors || parsed.error) {
    throw new Error('Yandex Metrika error: ' + sanitizeRoistatText_(JSON.stringify(parsed && (parsed.errors || parsed.error || parsed))));
  }
  return parsed;
}

function extractYandexMetrikaRows_(response) {
  const query = response && response.query ? response.query : {};
  const queryDimensions = metrikaList_(query.dimensions).map(metrikaDescriptorName_);
  const queryMetrics = metrikaList_(query.metrics).map(metrikaDescriptorName_);
  const data = response && Array.isArray(response.data) ? response.data : [];

  return data.map((item) => {
    const dimensions = {};
    const metrics = {};
    (item.dimensions || []).forEach((dimension, index) => {
      const key = queryDimensions[index] || 'dimension_' + index;
      dimensions[key] = metrikaDimensionValue_(dimension);
    });
    (item.metrics || []).forEach((metric, index) => {
      const key = queryMetrics[index] || 'metric_' + index;
      metrics[key] = Number(metric || 0);
    });
    return {
      dimensions: dimensions,
      metrics: metrics,
    };
  });
}

function aggregateYandexMetrikaRows_(rawRows, warnings) {
  const aggregated = {};
  let skippedRows = 0;

  rawRows.forEach((row) => {
    const date = normalizeRoistatDate_(metrikaDimensionBySuffix_(row, ':date'));
    if (!date) {
      skippedRows += 1;
      return;
    }

    const startUrl = metrikaDimensionBySuffix_(row, ':starturl');
    const trafficSource = metrikaDimensionBySuffix_(row, 'trafficsource');
    const utmSource = metrikaDimensionBySuffix_(row, 'utmsource');
    const domain = normalizeRoistatDomain_(metrikaDomainFromUrl_(startUrl));
    const city = normalizeRoistatCity_([startUrl, domain, trafficSource, utmSource].join(' ')) || 'Все';
    const brand = canonicalRoistatBrand_(domain, startUrl) || 'Без бренда';
    const source = canonicalMetrikaSource_(trafficSource, utmSource, startUrl);
    const key = [date, city, brand, domain, source].join('|');

    if (!aggregated[key]) {
      aggregated[key] = {
        id: 'metrika-' + date + '-' + citySlug_(city) + '-' + slug_(brand) + '-' + slug_(source) + '-' + slug_(domain),
        date: date,
        monthKey: String(date).slice(0, 7),
        city: city,
        brand: brand,
        domain: domain,
        source: source,
        trafficSource: trafficSource,
        utmSource: utmSource,
        visits: 0,
        users: 0,
        pageviews: 0,
        bounceWeighted: 0,
        durationWeighted: 0,
        goalVisits: 0,
        goalRateWeighted: 0,
      };
    }

    const visits = Math.max(0, metrikaMetricBySuffix_(row, 'visits'));
    const users = Math.max(0, metrikaMetricBySuffix_(row, 'users'));
    const pageviews = Math.max(0, metrikaMetricBySuffix_(row, 'pageviews'));
    const bounceRate = Math.max(0, metrikaMetricBySuffix_(row, 'bouncerate'));
    const avgVisitDuration = Math.max(0, metrikaMetricBySuffix_(row, 'avgvisitdurationseconds'));
    const goalVisits = Math.max(0, metrikaGoalVisits_(row));
    const goalRate = Math.max(0, metrikaGoalRate_(row));

    aggregated[key].visits += visits;
    aggregated[key].users += users;
    aggregated[key].pageviews += pageviews;
    aggregated[key].goalVisits += goalVisits;
    aggregated[key].bounceWeighted += bounceRate * visits;
    aggregated[key].durationWeighted += avgVisitDuration * visits;
    aggregated[key].goalRateWeighted += goalRate * visits;
  });

  if (skippedRows) warnings.push('Метрика: пропущено строк без даты ' + skippedRows + '.');

  return Object.keys(aggregated).map((key) => {
    const item = aggregated[key];
    const visits = Number(item.visits || 0);
    return {
      id: item.id,
      date: item.date,
      monthKey: item.monthKey,
      city: item.city,
      brand: item.brand,
      domain: item.domain,
      source: item.source,
      trafficSource: item.trafficSource,
      utmSource: item.utmSource,
      visits: Math.round(item.visits),
      users: Math.round(item.users),
      pageviews: Math.round(item.pageviews),
      bounceRate: visits ? roundNumber_(item.bounceWeighted / visits, 2) : 0,
      avgVisitDuration: visits ? roundNumber_(item.durationWeighted / visits, 2) : 0,
      goalVisits: Math.round(item.goalVisits),
      goalRate: visits ? roundNumber_(item.goalRateWeighted / visits, 2) : 0,
      updatedAt: new Date(),
      comment: 'Yandex Metrika API',
    };
  });
}

function replaceMetrikaRowsForRange_(records, range) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(CONFIG.sheets.metrikaDaily);
  const existing = readObjects_(CONFIG.sheets.metrikaDaily).filter((row) => {
    const date = normalizeRoistatDate_(row.date);
    return date && (date < range.fromDate || date > range.toDate);
  });
  const nextObjects = existing.concat(records.map(normalizeMetrikaRecordForClient_));

  sheet.clearContents();
  sheet.getRange(1, 1, 1, HEADERS.Yandex_Metrika_Daily.length).setValues([HEADERS.Yandex_Metrika_Daily]);
  sheet.setFrozenRows(1);
  if (nextObjects.length) {
    sheet.getRange(2, 1, nextObjects.length, HEADERS.Yandex_Metrika_Daily.length)
      .setValues(nextObjects.map(metrikaRecordRow_));
  }
  sheet.autoResizeColumns(1, HEADERS.Yandex_Metrika_Daily.length);
  formatServiceSheetKeys_();

  return {
    updated: records.length,
    skippedRows: 0,
  };
}

function metrikaRecordRow_(record) {
  return HEADERS.Yandex_Metrika_Daily.map((header) => record[header] || '');
}

function normalizeMetrikaRecordForClient_(row) {
  return {
    id: String(row.id || ''),
    date: normalizeRoistatDate_(row.date),
    monthKey: String(row.monthKey || row.month || '').slice(0, 7),
    city: normalizeRoistatCity_(row.city) || String(row.city || 'Все'),
    brand: String(row.brand || 'Без бренда'),
    domain: normalizeRoistatDomain_(row.domain),
    source: canonicalMetrikaSource_(row.source || row.trafficSource, row.utmSource, row.domain),
    trafficSource: String(row.trafficSource || ''),
    utmSource: String(row.utmSource || ''),
    visits: Math.round(Number(row.visits || 0)),
    users: Math.round(Number(row.users || 0)),
    pageviews: Math.round(Number(row.pageviews || 0)),
    bounceRate: roundNumber_(Number(row.bounceRate || 0), 2),
    avgVisitDuration: roundNumber_(Number(row.avgVisitDuration || 0), 2),
    goalVisits: Math.round(Number(row.goalVisits || 0)),
    goalRate: roundNumber_(Number(row.goalRate || 0), 2),
    updatedAt: row.updatedAt || new Date(),
    comment: String(row.comment || ''),
  };
}

function metrikaDescriptorName_(descriptor) {
  if (typeof descriptor === 'string') return descriptor;
  if (!descriptor) return '';
  return String(descriptor.name || descriptor.id || descriptor.key || '');
}

function metrikaList_(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function metrikaDimensionValue_(dimension) {
  if (dimension === null || dimension === undefined) return '';
  if (typeof dimension === 'string' || typeof dimension === 'number') return String(dimension);
  return String(dimension.name || dimension.id || dimension.value || '');
}

function metrikaDimensionBySuffix_(row, suffix) {
  const normalizedSuffix = String(suffix || '').toLowerCase().replace(/[^a-zа-я0-9]+/g, '');
  const dimensions = row.dimensions || {};
  const key = Object.keys(dimensions).find((item) => item.toLowerCase().replace(/[^a-zа-я0-9]+/g, '').indexOf(normalizedSuffix) >= 0);
  return key ? String(dimensions[key] || '') : '';
}

function metrikaMetricBySuffix_(row, suffix) {
  const normalizedSuffix = String(suffix || '').toLowerCase();
  const metrics = row.metrics || {};
  const key = Object.keys(metrics).find((item) => item.toLowerCase().indexOf(normalizedSuffix) >= 0);
  return key ? Number(metrics[key] || 0) : 0;
}

function metrikaGoalVisits_(row) {
  const metrics = row.metrics || {};
  const key = Object.keys(metrics).find((item) => /goal\d+visits/i.test(item) || /goal\d+reaches/i.test(item));
  return key ? Number(metrics[key] || 0) : 0;
}

function metrikaGoalRate_(row) {
  const metrics = row.metrics || {};
  const key = Object.keys(metrics).find((item) => /goal\d+conversionrate/i.test(item));
  return key ? Number(metrics[key] || 0) : 0;
}

function canonicalMetrikaSource_(trafficSource, utmSource, url) {
  const traffic = String(trafficSource || '').toLowerCase();
  const utm = String(utmSource || '').toLowerCase();
  const text = [traffic, utm, String(url || '').toLowerCase()].join(' ');
  const domain = normalizeRoistatDomain_(metrikaDomainFromUrl_(url));

  if (!text.trim() || traffic.indexOf('не определено') >= 0 || traffic.indexOf('undefined') >= 0 || traffic.indexOf('not set') >= 0) return 'Неизвестно';
  if (traffic.indexOf('прям') >= 0 || traffic === 'direct' || traffic.indexOf('direct traffic') >= 0) return 'Прямые визиты';
  if (domain === 'изи-драйв.рф' || traffic.indexOf('директ') >= 0 || utm.indexOf('direct') >= 0 || utm.indexOf('директ') >= 0 || text.indexOf('yandex_direct') >= 0 || text.indexOf('ydirect') >= 0) return 'Директ';
  if (text.indexOf('2gis') >= 0 || text.indexOf('2гис') >= 0 || text.indexOf('2 гис') >= 0 || text.indexOf('link.2gis') >= 0) return '2ГИС';
  if (text.indexOf('gkart') >= 0 || text.indexOf('google maps') >= 0 || text.indexOf('google') >= 0 || text.indexOf('гугл') >= 0) return 'Гугл Карты';
  if (text.indexOf('ykart') >= 0 || text.indexOf('ykar') >= 0 || text.indexOf('geoadv_maps') >= 0 || text.indexOf('яндекс карты') >= 0 || /(^|[:_\s-])ya($|[:_\s-])/.test(text)) return 'Яндекс Карты';
  if (text.indexOf('seo') >= 0 || text.indexOf('орган') >= 0 || text.indexOf('organic') >= 0 || text.indexOf('search') >= 0 || text.indexOf('поисков') >= 0) return 'SEO';
  if (text.indexOf('zoon') >= 0) return 'Zoon';
  if (text.indexOf('кеш') >= 0 || text.indexOf('кэш') >= 0 || text.indexOf('cashback') >= 0) return 'Рек/кешбэк';
  return 'Неизвестно';
}

function metrikaDomainFromUrl_(value) {
  const raw = String(value || '').trim();
  const urlMatch = raw.match(/^https?:\/\/([^/?#]+)/i);
  if (urlMatch) return urlMatch[1];
  return firstRoistatDomain_(raw);
}

function metrikaResultMessage_(updated, skippedRows, warnings) {
  const parts = ['Метрика: записано строк ' + updated];
  if (skippedRows) parts.push('пропущено строк ' + skippedRows);
  if (warnings && warnings.length) parts.push(unique_(warnings).slice(0, 3).join(' | '));
  return parts.join('. ');
}

function yandexMetrikaUserError_(error) {
  const message = sanitizeRoistatText_(error && error.message ? error.message : String(error));
  if (message.indexOf('HTTP 400') >= 0 || message.toLowerCase().indexOf('bad request') >= 0) {
    return 'Метрика вернула Bad Request: счетчик не принял часть метрик или измерений. Можно задать YANDEX_METRIKA_DIMENSIONS / YANDEX_METRIKA_METRICS в Script Properties. Детали: ' + message;
  }
  if (message.indexOf('HTTP 401') >= 0 || message.indexOf('HTTP 403') >= 0 || message.toLowerCase().indexOf('access') >= 0) {
    return 'Метрика не дала доступ. Проверьте YANDEX_METRIKA_TOKEN и доступ токена к счетчику. Детали: ' + message;
  }
  return message;
}

function refreshRoistatFields_() {
  const now = new Date();
  const metrics = normalizeRoistatDictionary_(fetchRoistatDictionary_('analytics/metrics-new'))
    .map((item) => ({
      kind: 'metric',
      name: item.name,
      title: item.title,
      updatedAt: now,
    }));
  const dimensions = normalizeRoistatDictionary_(fetchRoistatDictionary_('analytics/dimensions'))
    .map((item) => ({
      kind: 'dimension',
      name: item.name,
      title: item.title,
      updatedAt: now,
    }));
  const rows = metrics.concat(dimensions).filter((item) => item.name);
  const sheet = SpreadsheetApp.getActive().getSheetByName(CONFIG.sheets.roistatFields);
  sheet.clearContents();
  sheet.getRange(1, 1, 1, HEADERS.Roistat_Fields.length).setValues([HEADERS.Roistat_Fields]);
  sheet.setFrozenRows(1);
  if (rows.length) {
    sheet.getRange(2, 1, rows.length, HEADERS.Roistat_Fields.length)
      .setValues(rows.map((row) => HEADERS.Roistat_Fields.map((header) => row[header] || '')));
  }
  sheet.autoResizeColumns(1, HEADERS.Roistat_Fields.length);
  return {
    metrics: metrics.length,
    dimensions: dimensions.length,
    message: 'Поля Roistat обновлены: метрик ' + metrics.length + ', измерений ' + dimensions.length + '.',
  };
}

function syncRoistatSources_(payload) {
  return syncRoistatRange_(payload, 'sources');
}

function syncRoistatBrands_(payload) {
  return syncRoistatRange_(payload, 'brands');
}

function syncRoistatRange_(payload, kind) {
  const range = normalizeRoistatDateRange_(payload);
  const fields = getRoistatFieldMap_(kind);
  const dates = eachDateInRange_(range.fromDate, range.toDate);

  if (dates.length > 62) {
    throw new Error('Roistat: выберите период до 62 дней за один импорт, чтобы не упереться в лимиты Apps Script.');
  }

  try {
    const rawRows = [];
    const warnings = [].concat(fields.warnings || []);
    dates.forEach((date) => {
      const requestPayload = buildRoistatAnalyticsPayload_(fields, date, date);
      const result = fetchRoistatAnalyticsData_(requestPayload, fields, kind);
      warnings.push.apply(warnings, result.warnings || []);
      rawRows.push.apply(rawRows, extractRoistatRows_(result.response, fields, date));
    });

    const result = kind === 'brands'
      ? writeRoistatBrandRows_(rawRows, fields, range, warnings)
      : writeRoistatSourceRows_(rawRows, fields, range, warnings);
    logRoistatSync_(result);
    return result;
  } catch (error) {
    const result = {
      kind: kind,
      fromDate: range.fromDate,
      toDate: range.toDate,
      status: 'error',
      message: roistatUserError_(error),
      sourceRows: 0,
      brandRows: 0,
      skippedRows: 0,
      updatedAt: new Date(),
    };
    logRoistatSync_(result);
    throw new Error(result.message);
  }
}

function writeRoistatSourceRows_(rawRows, fields, range, warnings) {
  const aggregated = {};
  let skippedRows = 0;

  rawRows.forEach((row) => {
    const dimensionText = roistatDimensionText_(row);
    if (isRoistatMessageLead_(dimensionText)) {
      skippedRows += 1;
      return;
    }

    const date = stringifyDate_(row.syncDate || range.fromDate);
    const city = normalizeRoistatCity_(dimensionText);
    const source = canonicalRoistatSource_(dimensionText, row.dimensions[fields.domainDimension]);
    if (!city || !source || source === 'Другие') {
      skippedRows += 1;
      return;
    }

    const key = [date, city, source].join('|');
    if (!aggregated[key]) {
      aggregated[key] = {
        date: date,
        city: city,
        source: source,
        leads: 0,
        qualified: 0,
        sales: 0,
        revenue: 0,
        budget: 0,
      };
    }

    aggregated[key].leads += roistatMetricValue_(row, fields.metricMap.leads);
    aggregated[key].qualified += roistatMetricValue_(row, fields.metricMap.qualified);
    aggregated[key].sales += roistatMetricValue_(row, fields.metricMap.sales);
    aggregated[key].revenue += roistatMetricValue_(row, fields.metricMap.revenue);
    aggregated[key].budget += roistatMetricValue_(row, fields.metricMap.budget);
  });

  const records = Object.keys(aggregated).flatMap((key) => {
    const item = aggregated[key];
    const baseComment = '[SOURCE_CITY=' + item.city + '] Roistat API';
    return [
      roistatSourceDailyRecord_(item, 'Лиды', item.leads, baseComment),
      roistatSourceDailyRecord_(item, 'Квалы', item.qualified, baseComment),
      roistatSourceDailyRecord_(item, 'Продажи', item.sales, baseComment + '; выручка: ' + Math.round(item.revenue) + '; расход: ' + Math.round(item.budget)),
    ];
  });

  const upsertResult = records.length
    ? upsertRowsById_(CONFIG.sheets.daily, HEADERS.Data_Daily, records, dailyRow_)
    : { updated: 0 };
  unique_(records.map((record) => record.month)).forEach(rebuildWeeklySummary_);

  return {
    kind: 'sources',
    fromDate: range.fromDate,
    toDate: range.toDate,
    status: warnings.length || skippedRows ? 'warning' : 'success',
    message: roistatResultMessage_('источники', upsertResult.updated, skippedRows, warnings),
    sourceRows: upsertResult.updated,
    brandRows: 0,
    skippedRows: skippedRows,
    updatedAt: new Date(),
  };
}

function writeRoistatBrandRows_(rawRows, fields, range, warnings) {
  const aggregated = {};
  let skippedRows = 0;

  rawRows.forEach((row) => {
    const dimensionText = roistatDimensionText_(row);
    if (isRoistatMessageLead_(dimensionText)) {
      skippedRows += 1;
      return;
    }

    const date = stringifyDate_(row.syncDate || range.fromDate);
    const city = normalizeRoistatCity_(dimensionText);
    const domain = normalizeRoistatDomain_(row.dimensions[fields.domainDimension] || firstRoistatDomain_(dimensionText));
    const brand = canonicalRoistatBrand_(domain, dimensionText);
    const source = canonicalRoistatSource_(dimensionText, domain);
    if (!city || !brand || !source || source === 'Другие') {
      skippedRows += 1;
      return;
    }

    const weekStart = mondayOfDate_(date);
    const key = [weekStart, city, brand, source].join('|');
    if (!aggregated[key]) {
      aggregated[key] = {
        weekStart: weekStart,
        monthKey: String(weekStart).slice(0, 7),
        city: city,
        brand: brand,
        domain: domain,
        source: source,
        leads: 0,
        qualified: 0,
        sales: 0,
        revenue: 0,
        budget: 0,
      };
    }

    aggregated[key].leads += roistatMetricValue_(row, fields.metricMap.leads);
    aggregated[key].qualified += roistatMetricValue_(row, fields.metricMap.qualified);
    aggregated[key].sales += roistatMetricValue_(row, fields.metricMap.sales);
    aggregated[key].revenue += roistatMetricValue_(row, fields.metricMap.revenue);
    aggregated[key].budget += roistatMetricValue_(row, fields.metricMap.budget);
  });

  const records = Object.keys(aggregated).map((key) => {
    const item = aggregated[key];
    return {
      id: 'roistat-brand-' + item.weekStart + '-' + citySlug_(item.city) + '-' + slug_(item.brand) + '-' + slug_(item.source),
      weekStart: item.weekStart,
      monthKey: item.monthKey,
      city: item.city,
      brand: item.brand,
      domain: item.domain,
      source: item.source,
      leads: Math.round(item.leads),
      qualified: Math.round(item.qualified),
      sales: Math.round(item.sales),
      revenue: Math.round(item.revenue),
      actualRevenue: Math.round(item.revenue),
      budget: Math.round(item.budget),
    };
  });

  const upsertResult = records.length
    ? upsertRowsById_(CONFIG.sheets.brandPerformance, HEADERS.Brand_Performance_Weekly, records, brandPerformanceRow_)
    : { updated: 0 };

  return {
    kind: 'brands',
    fromDate: range.fromDate,
    toDate: range.toDate,
    status: warnings.length || skippedRows ? 'warning' : 'success',
    message: roistatResultMessage_('домены/бренды', upsertResult.updated, skippedRows, warnings),
    sourceRows: 0,
    brandRows: upsertResult.updated,
    skippedRows: skippedRows,
    updatedAt: new Date(),
  };
}

function roistatSourceDailyRecord_(item, metric, fact, comment) {
  const id = [item.date, 'source-roistat', citySlug_(item.city), slug_(item.source), slug_(metric)].join('-');
  return {
    id: id,
    date: item.date,
    month: String(item.date).slice(0, 7),
    week: weekOfMonth_(item.date),
    city: 'источники',
    channel: item.source,
    metric: metric,
    plan: 0,
    fact: Math.round(Number(fact || 0)),
    forecast: 0,
    recommendations: 0,
    omQualified: 0,
    comment: comment,
  };
}

function getRoistatFieldMap_(kind) {
  const properties = PropertiesService.getScriptProperties();
  const metricsDictionary = safeRoistatDictionary_('analytics/metrics-new');
  const dimensionsDictionary = safeRoistatDictionary_('analytics/dimensions');
  const warnings = [];

  const metricMap = {
    leads: roistatFieldOverride_('ROISTAT_METRIC_LEADS') || selectRoistatField_(metricsDictionary, ['leads', 'lead_count', 'leads_count'], ['лид', 'заявк'], 'leads'),
    qualified: roistatFieldOverride_('ROISTAT_METRIC_QUALIFIED') || selectRoistatField_(metricsDictionary, ['custom_18', 'ql', 'qualified', 'qualified_leads', 'quality_leads', 'target_leads', 'kval'], ['квал', 'целев'], 'custom_18'),
    sales: roistatFieldOverride_('ROISTAT_METRIC_SALES') || selectRoistatField_(metricsDictionary, ['payment_sales', 'custom_9', 'sales', 'new_sales', 'payment_first_sales', 'orders', 'sales_count', 'paid_orders'], ['продаж по дате оплаты', 'оплат', 'продаж', 'сделк'], 'payment_sales'),
    revenue: roistatFieldOverride_('ROISTAT_METRIC_REVENUE') || selectRoistatField_(metricsDictionary, ['payment_revenue', 'revenue', 'first_sales_revenue', 'payment_first_sales_revenue', 'income', 'profit', 'sales_revenue', 'order_revenue'], ['выруч', 'доход', 'revenue'], 'payment_revenue'),
    budget: roistatFieldOverride_('ROISTAT_METRIC_BUDGET') || selectRoistatField_(metricsDictionary, ['marketing_cost', 'cost', 'expenses', 'ad_cost', 'advertising_cost', 'budget'], ['маркетинг', 'расход', 'затрат', 'бюджет', 'cost'], 'marketing_cost'),
  };

  if (!metricMap.qualified) warnings.push('Не нашла метрику КВАЛ в справочнике Roistat. Если КВАЛ не загрузится, задайте Script Property ROISTAT_METRIC_QUALIFIED.');
  if (!metricMap.revenue) warnings.push('Не нашла метрику выручки в справочнике Roistat. Если выручка нужна, задайте Script Property ROISTAT_METRIC_REVENUE.');

  const sourceDimensions = [
    roistatDimensionOverride_('ROISTAT_DIMENSION_SOURCE') || selectRoistatField_(dimensionsDictionary, ['custom_dimension_1', 'order_field_10', 'marker_level_1', 'utm_source', 'source'], ['источник', 'реклам'], 'custom_dimension_1'),
    selectRoistatField_(dimensionsDictionary, ['marker_level_1', 'utm_source'], ['источник', 'реклам'], 'marker_level_1'),
    selectRoistatField_(dimensionsDictionary, ['marker_level_2', 'utm_medium'], ['канал', 'medium'], 'marker_level_2'),
    selectRoistatField_(dimensionsDictionary, ['marker_level_3', 'utm_campaign'], ['кампан'], 'marker_level_3'),
  ];
  const hostDimension = roistatDimensionOverride_('ROISTAT_DIMENSION_DOMAIN') || selectRoistatField_(dimensionsDictionary, ['custom_dimension_3', 'order_field_94', 'host', 'domain'], ['бренд/домен', 'домен', 'host'], 'custom_dimension_3');
  const cityDimension = roistatDimensionOverride_('ROISTAT_DIMENSION_CITY') || selectRoistatField_(dimensionsDictionary, ['order_field_2', 'custom_dimension_6', 'pipeline', 'funnel', 'project', 'city'], ['воронк', 'город', 'мск', 'спб'], 'order_field_2');
  const leadTypeDimension = roistatDimensionOverride_('ROISTAT_DIMENSION_LEAD_TYPE') || selectRoistatField_(dimensionsDictionary, ['order_field_21', 'lead_type', 'order_type', 'request_type'], ['тип лида', 'тип заявки'], 'order_field_21');

  const dimensions = unique_(
    []
      .concat(kind === 'brands' ? [hostDimension] : sourceDimensions)
      .concat(kind === 'brands' ? sourceDimensions.slice(0, 2) : [hostDimension])
      .concat([cityDimension, leadTypeDimension])
      .filter(Boolean),
  );
  const metrics = unique_(Object.keys(metricMap).map((key) => metricMap[key]).filter(Boolean));

  if (!dimensions.length) warnings.push('Не нашла измерения Roistat для источников/доменов.');
  if (!metrics.length) warnings.push('Не нашла метрики Roistat для импорта.');

  return {
    dimensions: dimensions,
    allDimensions: unique_(dimensions.concat(sourceDimensions).concat([hostDimension, cityDimension, leadTypeDimension]).filter(Boolean)),
    sourceDimensions: sourceDimensions.filter(Boolean),
    domainDimension: hostDimension,
    cityDimension: cityDimension,
    leadTypeDimension: leadTypeDimension,
    metrics: metrics,
    metricMap: metricMap,
    warnings: warnings,
    projectId: properties.getProperty(CONFIG.roistatProjectProperty) || CONFIG.roistatDefaultProjectId,
  };
}

function buildRoistatAnalyticsPayload_(fields, fromDate, toDate) {
  return {
    dimensions: fields.dimensions,
    metrics: fields.metrics,
    period: {
      from: fromDate + 'T00:00:00+0300',
      to: toDate + 'T23:59:59+0300',
    },
  };
}

function fetchRoistatAnalyticsData_(payload, fields, kind) {
  const attempts = roistatAnalyticsAttempts_(payload, fields, kind);
  const errors = [];
  for (let index = 0; index < attempts.length; index += 1) {
    const attempt = attempts[index];
    try {
      const response = fetchRoistatEndpoint_('analytics/data', attempt.payload);
      const warnings = index === 0
        ? []
        : ['Roistat отклонил полный запрос, импорт выполнен по упрощенному набору: ' + attempt.note + '. ' + roistatRequestFields_(attempt.payload)];
      return { response: response, warnings: warnings };
    } catch (error) {
      errors.push(roistatUserError_(error));
    }
  }
  throw new Error(errors.slice(0, 3).join(' | '));
}

function roistatAnalyticsAttempts_(payload, fields, kind) {
  const metricSets = [
    fields.metrics,
    unique_([fields.metricMap.leads, fields.metricMap.qualified, fields.metricMap.sales].filter(Boolean)),
    unique_([fields.metricMap.leads, fields.metricMap.sales].filter(Boolean)),
    unique_([fields.metricMap.leads].filter(Boolean)),
  ].filter((set) => set.length);

  const sourceDimension = fields.sourceDimensions[0];
  const secondSourceDimension = fields.sourceDimensions[1];
  const dimensionSets = kind === 'brands'
    ? [
        [fields.domainDimension, sourceDimension, fields.cityDimension, fields.leadTypeDimension],
        [fields.domainDimension, sourceDimension, fields.cityDimension],
        [fields.domainDimension, fields.cityDimension],
        [fields.domainDimension],
      ]
    : [
        [sourceDimension, secondSourceDimension, fields.domainDimension, fields.cityDimension, fields.leadTypeDimension],
        [sourceDimension, fields.domainDimension, fields.cityDimension],
        [sourceDimension, fields.cityDimension],
        [sourceDimension],
      ];

  const attempts = [];
  dimensionSets.forEach((dimensions, dimensionIndex) => {
    metricSets.forEach((metrics, metricIndex) => {
      const cleanedDimensions = unique_((dimensions || []).filter(Boolean));
      const cleanedMetrics = unique_((metrics || []).filter(Boolean));
      if (!cleanedDimensions.length || !cleanedMetrics.length) return;
      attempts.push({
        payload: {
          dimensions: cleanedDimensions,
          metrics: cleanedMetrics,
          period: payload.period,
        },
        note: 'вариант ' + (dimensionIndex + 1) + '/' + (metricIndex + 1),
      });
    });
  });
  return uniqueJson_(attempts);
}

function fetchRoistatEndpoint_(method, payload, httpMethod) {
  const properties = PropertiesService.getScriptProperties();
  const apiKey = properties.getProperty(CONFIG.roistatApiKeyProperty);
  const projectId = properties.getProperty(CONFIG.roistatProjectProperty) || CONFIG.roistatDefaultProjectId;
  if (!apiKey) {
    throw new Error('Не задан ROISTAT_API_KEY в Script Properties.');
  }

  const requestMethod = String(httpMethod || 'post').toLowerCase();
  const options = {
    method: requestMethod,
    headers: {
      'Api-key': apiKey,
    },
    muteHttpExceptions: true,
  };
  if (requestMethod !== 'get') {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(payload || {});
  }

  const response = UrlFetchApp.fetch('https://cloud.roistat.com/api/v1/project/' + method + '?project=' + encodeURIComponent(projectId), options);
  const status = response.getResponseCode();
  const text = response.getContentText();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch (ignore) {
    parsed = null;
  }

  if (status < 200 || status >= 300) {
    throw new Error('Roistat HTTP ' + status + ': ' + sanitizeRoistatText_(text));
  }
  if (parsed && (parsed.status === 'error' || parsed.error)) {
    throw new Error('Roistat error: ' + sanitizeRoistatText_(JSON.stringify(parsed.error || parsed)));
  }

  return parsed || {};
}

function fetchRoistatDictionary_(method) {
  try {
    return fetchRoistatEndpoint_(method, {}, 'post');
  } catch (postError) {
    try {
      return fetchRoistatEndpoint_(method, {}, 'get');
    } catch (getError) {
      throw postError;
    }
  }
}

function safeRoistatDictionary_(method) {
  try {
    return normalizeRoistatDictionary_(fetchRoistatDictionary_(method));
  } catch (ignore) {
    return [];
  }
}

function normalizeRoistatDictionary_(response) {
  const result = [];
  collectRoistatDictionaryItems_(response, result);
  return result
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const name = String(item.name || item.key || item.id || item.metric || item.dimension || item.value || '').trim();
      const title = String(item.title || item.label || item.display_name || item.name_ru || item.description || name).trim();
      if (!name) return null;
      return {
        name: name,
        title: title,
        search: (name + ' ' + title).toLowerCase(),
      };
    })
    .filter(Boolean);
}

function collectRoistatDictionaryItems_(node, result) {
  if (!node) return;
  if (Array.isArray(node)) {
    node.forEach((item) => collectRoistatDictionaryItems_(item, result));
    return;
  }
  if (typeof node !== 'object') return;
  if (node.name || node.key || node.id || node.metric || node.dimension) {
    result.push(node);
  }
  ['data', 'items', 'metrics', 'dimensions', 'list', 'fields'].forEach((key) => {
    if (node[key]) collectRoistatDictionaryItems_(node[key], result);
  });
}

function selectRoistatField_(dictionary, names, titleParts, fallback) {
  const normalizedNames = names.map((name) => String(name).toLowerCase());
  for (let index = 0; index < normalizedNames.length; index += 1) {
    const exact = dictionary.find((item) => item.name.toLowerCase() === normalizedNames[index]);
    if (exact) return exact.name;
  }

  const byTitle = dictionary.find((item) => {
    return titleParts.some((part) => item.search.indexOf(String(part).toLowerCase()) >= 0);
  });
  if (byTitle) return byTitle.name;

  return fallback;
}

function roistatFieldOverride_(name) {
  return String(PropertiesService.getScriptProperties().getProperty(name) || '').trim();
}

function roistatDimensionOverride_(name) {
  return roistatFieldOverride_(name);
}

function extractRoistatRows_(response, fields, syncDate) {
  const roots = response && response.data && response.data.items
    ? response.data.items
    : response && response.items
      ? response.items
      : Array.isArray(response && response.data)
        ? response.data
        : [];
  const rows = [];
  collectRoistatRows_(roots, {}, rows, fields, syncDate);
  return rows;
}

function collectRoistatRows_(items, inheritedDimensions, rows, fields, syncDate) {
  if (!Array.isArray(items)) return;
  items.forEach((item) => {
    if (!item || typeof item !== 'object') return;
    const dimensions = Object.assign({}, inheritedDimensions, roistatObjectFromSection_(item.dimensions, fields.allDimensions));
    fields.allDimensions.forEach((dimension) => {
      if (item[dimension] !== undefined && dimensions[dimension] === undefined) {
        dimensions[dimension] = roistatValue_(item[dimension]);
      }
    });
    const metrics = roistatObjectFromSection_(item.metrics, fields.metrics);
    fields.metrics.forEach((metric) => {
      if (item[metric] !== undefined && metrics[metric] === undefined) {
        metrics[metric] = Number(roistatValue_(item[metric]) || 0);
      }
    });

    if (Object.keys(metrics).some((metric) => Number(metrics[metric] || 0) !== 0)) {
      rows.push({
        dimensions: dimensions,
        metrics: metrics,
        syncDate: syncDate,
      });
    }

    if (Array.isArray(item.items)) collectRoistatRows_(item.items, dimensions, rows, fields, syncDate);
    if (Array.isArray(item.children)) collectRoistatRows_(item.children, dimensions, rows, fields, syncDate);
  });
}

function roistatObjectFromSection_(section, fieldOrder) {
  const result = {};
  if (!section) return result;
  if (Array.isArray(section)) {
    section.forEach((item, index) => {
      if (item && typeof item === 'object') {
        const name = roistatSectionItemName_(item, fieldOrder[index]);
        if (name) result[name] = roistatValue_(item);
      } else if (fieldOrder[index]) {
        result[fieldOrder[index]] = roistatValue_(item);
      }
    });
    return result;
  }
  if (typeof section === 'object') {
    Object.keys(section).forEach((key) => {
      result[key] = roistatValue_(section[key]);
    });
  }
  return result;
}

function roistatSectionItemName_(item, fallback) {
  const direct = item.name || item.key || item.id || item.metric_name || item.dimension_name || item.field || item.code;
  if (direct) return String(direct).trim();

  const nested = item.metric || item.dimension;
  if (nested && typeof nested === 'object') {
    return String(nested.name || nested.key || nested.id || nested.code || nested.value || fallback || '').trim();
  }

  if (nested) return String(nested).trim();
  return String(fallback || '').trim();
}

function roistatValue_(value) {
  if (value && typeof value === 'object') {
    if (value.value !== undefined) return value.value;
    if (value.v !== undefined) return value.v;
    if (value.title !== undefined) return value.title;
    if (value.name !== undefined) return value.name;
  }
  return value;
}

function roistatMetricValue_(row, metricName) {
  if (!metricName) return 0;
  const value = row.metrics[metricName];
  const numeric = Number(String(value || 0).replace(/\s/g, '').replace(',', '.'));
  return isFinite(numeric) ? numeric : 0;
}

function roistatDimensionText_(row) {
  return Object.keys(row.dimensions || {})
    .map((key) => String(row.dimensions[key] || ''))
    .filter(Boolean)
    .join(' ');
}

function normalizeRoistatDateRange_(payload) {
  const fromDate = normalizeRoistatDate_(payload.fromDate || payload.from || payload.date || payload.startDate);
  const toDate = normalizeRoistatDate_(payload.toDate || payload.to || payload.date || payload.endDate || fromDate);
  if (!fromDate || !toDate) {
    throw new Error('Не передан период Roistat.');
  }
  if (fromDate > toDate) {
    throw new Error('Дата начала Roistat позже даты окончания.');
  }
  return { fromDate: fromDate, toDate: toDate };
}

function normalizeRoistatDate_(value) {
  const raw = String(value || '').trim();
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return isoMatch[1] + '-' + isoMatch[2] + '-' + isoMatch[3];
  const ruMatch = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (ruMatch) {
    const year = ruMatch[3].length === 2 ? '20' + ruMatch[3] : ruMatch[3];
    return year + '-' + ruMatch[2].padStart(2, '0') + '-' + ruMatch[1].padStart(2, '0');
  }
  return raw.length >= 10 ? raw.slice(0, 10) : '';
}

function eachDateInRange_(fromDate, toDate) {
  const result = [];
  const current = new Date(fromDate + 'T00:00:00Z');
  const end = new Date(toDate + 'T00:00:00Z');
  while (current <= end) {
    result.push(Utilities.formatDate(current, 'GMT', 'yyyy-MM-dd'));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return result;
}

function normalizeRoistatCity_(text) {
  const lower = String(text || '').toLowerCase();
  if (lower.indexOf('спб') >= 0 || lower.indexOf('питер') >= 0 || lower.indexOf('санкт') >= 0 || lower.indexOf('spb') >= 0) return 'СПБ';
  if (lower.indexOf('мск') >= 0 || lower.indexOf('москва') >= 0 || lower.indexOf('moscow') >= 0 || lower.indexOf('msk') >= 0) return 'МСК';
  return '';
}

function isRoistatMessageLead_(text) {
  const lower = String(text || '').toLowerCase();
  return lower.indexOf('сообщ') >= 0 || lower.indexOf('message') >= 0 || lower.indexOf('msg') >= 0;
}

function canonicalRoistatSource_(text, domainValue) {
  const lower = String((domainValue || '') + ' ' + (text || '')).toLowerCase();
  const domain = normalizeRoistatDomain_(domainValue);
  if (domain === 'изи-драйв.рф' || lower.indexOf('директ') >= 0) return 'Директ';
  if (lower.indexOf('2gis') >= 0 || lower.indexOf('2гис') >= 0 || lower.indexOf('2 гис') >= 0 || lower.indexOf('link.2gis') >= 0) return '2ГИС';
  if (lower.indexOf('gkart') >= 0 || lower.indexOf('google') >= 0 || lower.indexOf('гугл') >= 0 || /(^|[:_\s-])go($|[:_\s-])/.test(lower)) return 'Гугл Карты';
  if (lower.indexOf('ykart') >= 0 || lower.indexOf('ykar') >= 0 || lower.indexOf('geoadv_maps') >= 0 || /(^|[:_\s-])yk($|[:_\s-])/.test(lower) || /(^|[:_\s-])ya($|[:_\s-])/.test(lower)) return 'Яндекс Карты';
  if (lower.indexOf('seo') >= 0 || lower.indexOf('сео') >= 0 || lower.indexOf('сайт') >= 0) return 'SEO';
  if (lower.indexOf('zoon') >= 0) return 'Zoon';
  if (lower.indexOf('прям') >= 0 || lower.indexOf('direct visits') >= 0) return 'Прямые визиты';
  if (lower.indexOf('кеш') >= 0 || lower.indexOf('кэш') >= 0 || lower.indexOf('cashback') >= 0) return 'Рек/кешбэк';
  if (lower.indexOf('друг') >= 0 || lower.indexOf('other') >= 0) return 'Другие';
  return 'Другие';
}

function canonicalRoistatBrand_(domainValue, text) {
  const domain = normalizeRoistatDomain_(domainValue);
  if (domain === 'изи-драйв.рф') return 'изи-драйв.рф';

  const lower = String((domain || '') + ' ' + (text || '')).toLowerCase();
  if (lower.indexOf('рулевой') >= 0 || lower.indexOf('rulevoi') >= 0 || lower.indexOf('rulevoy') >= 0) return 'Рулевой';
  if (lower.indexOf('автодрайв') >= 0 || lower.indexOf('autodrive') >= 0) return 'Автодрайв';
  if (lower.indexOf('изи драйв') >= 0 || lower.indexOf('изи-драйв') >= 0 || lower.indexOf('izidrive') >= 0 || lower.indexOf('easy') >= 0) return 'Изи Драйв';
  if (lower.indexOf('гермес') >= 0 || lower.indexOf('germes') >= 0 || lower.indexOf('hermes') >= 0) return 'Гермес';
  if (lower.indexOf('пора за руль') >= 0 || lower.indexOf('porazaryl') >= 0 || lower.indexOf('pora') >= 0) return 'Пора за руль';
  if (lower.indexOf('академик') >= 0 || lower.indexOf('akadem') >= 0) return 'Академик';
  if (lower.indexOf('безопасность') >= 0 || lower.indexOf('safety') >= 0) return 'Безопасность';
  if (!domain) return '';
  return beautifyDomainBrand_(domain);
}

function normalizeRoistatDomain_(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .trim();
}

function firstRoistatDomain_(text) {
  const match = String(text || '').toLowerCase().match(/[a-zа-я0-9-]+\.(?:рф|ru|com|net|org)/i);
  return match ? match[0] : '';
}

function beautifyDomainBrand_(domain) {
  return String(domain || '')
    .replace(/\.(рф|ru|com|net|org)$/i, '')
    .replace(/[-_]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function mondayOfDate_(dateIso) {
  const date = new Date(dateIso + 'T00:00:00Z');
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return Utilities.formatDate(date, 'GMT', 'yyyy-MM-dd');
}

function citySlug_(city) {
  return city === 'МСК' ? 'msk' : city === 'СПБ' ? 'spb' : 'all';
}

function slug_(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function roistatResultMessage_(label, updated, skippedRows, warnings) {
  const parts = [label + ': записано строк ' + updated];
  if (skippedRows) parts.push('пропущено строк ' + skippedRows);
  if (warnings && warnings.length) parts.push(unique_(warnings).slice(0, 3).join(' | '));
  return parts.join('. ');
}

function roistatRequestFields_(payload) {
  return 'dimensions=' + (payload.dimensions || []).join(', ') + '; metrics=' + (payload.metrics || []).join(', ');
}

function roistatUserError_(error) {
  const message = sanitizeRoistatText_(error && error.message ? error.message : String(error));
  if (message.indexOf('HTTP 400') >= 0 || message.toLowerCase().indexOf('bad request') >= 0) {
    return 'Roistat вернул Bad Request: запрос собран с полем, которого нет в проекте, или Roistat не принимает формат периода. Проверьте ROISTAT_METRIC_QUALIFIED / ROISTAT_METRIC_REVENUE / ROISTAT_DIMENSION_CITY в Script Properties. Детали: ' + message;
  }
  return message;
}

function sanitizeRoistatText_(text) {
  return String(text || '')
    .replace(/api[-_ ]?key["':=\s]+[^"',\s}]+/ig, 'api-key=***')
    .replace(/token["':=\s]+[^"',\s}]+/ig, 'token=***')
    .slice(0, 900);
}

function logRoistatSync_(result) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(CONFIG.sheets.roistatSyncLog);
  if (!sheet) return;
  sheet.appendRow([
    Utilities.getUuid(),
    result.kind,
    result.fromDate,
    result.toDate,
    result.status,
    result.message,
    Number(result.sourceRows || 0),
    Number(result.brandRows || 0),
    Number(result.skippedRows || 0),
    result.updatedAt || new Date(),
  ]);
}

function createMonth_(payload) {
  const year = Number(payload.year);
  const monthIndex = Number(payload.monthIndex);
  const monthKey = year + '-' + String(monthIndex + 1).padStart(2, '0');
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const label = payload.label || monthLabel_(year, monthIndex);
  const coefficients = getForecastCoefficients_();
  const dailyAverageByCity = normalizePlansByCity_(payload.dailyAverageByCity);
  const hasDailyAverage = hasAnyPlanValue_(dailyAverageByCity);
  const plansByCity = hasDailyAverage
    ? buildMonthlyPlansFromDailyAverage_(year, monthIndex, daysInMonth, dailyAverageByCity, coefficients)
    : normalizePlansByCity_(payload.plansByCity);
  const monthsSheet = SpreadsheetApp.getActive().getSheetByName(CONFIG.sheets.months);
  const existing = readObjects_(CONFIG.sheets.months).some((row) => row.monthKey === monthKey);

  if (!existing) {
    monthsSheet.appendRow([
      monthKey,
      label,
      year,
      monthIndex,
      daysInMonth,
      'active',
      new Date(),
    ]);
  }

  upsertMonthPlans_(monthKey, plansByCity);
  ensureDailyRowsForMonth_(monthKey, year, monthIndex, daysInMonth, plansByCity, hasDailyAverage ? dailyAverageByCity : null, coefficients);
  rebuildWeeklySummary_(monthKey);

  return {
    monthKey: monthKey,
    label: label,
    year: year,
    monthIndex: monthIndex,
    daysInMonth: daysInMonth,
    plan: reportPlan_(plansByCity),
    plansByCity: plansByCity,
    status: 'active',
  };
}

function upsertDailyValues_(payload) {
  const rows = Array.isArray(payload.records) ? payload.records : [];
  const sheet = SpreadsheetApp.getActive().getSheetByName(CONFIG.sheets.daily);
  const existing = readObjects_(CONFIG.sheets.daily);
  const rowById = {};
  existing.forEach((row, index) => {
    rowById[row.id] = index + 2;
  });

  rows.forEach((record) => {
    const normalized = normalizeDailyUpdate_(record);
    validateDailyRecord_(normalized);
    const values = dailyRow_(normalized);
    if (rowById[normalized.id]) {
      sheet.getRange(rowById[normalized.id], 1, 1, values.length).setValues([values]);
    } else {
      sheet.appendRow(values);
    }
  });

  rebuildWeeklySummary_(payload.monthKey);
  return { updated: rows.length };
}

function upsertEvent_(payload) {
  const event = payload.event || payload;
  validateEvent_(event);
  const sheet = SpreadsheetApp.getActive().getSheetByName(CONFIG.sheets.events);
  const existing = readObjects_(CONFIG.sheets.events);
  const rowIndex = existing.findIndex((row) => row.id === event.id);
  const values = eventRow_(event);
  if (rowIndex >= 0) {
    sheet.getRange(rowIndex + 2, 1, 1, values.length).setValues([values]);
  } else {
    sheet.appendRow(values);
  }
  return { id: event.id };
}

function deleteEvent_(payload) {
  const id = String(payload.id || payload.eventId || '');
  if (!id) {
    throw new Error('Не передан id события');
  }

  const sheet = SpreadsheetApp.getActive().getSheetByName(CONFIG.sheets.events);
  const existing = readObjects_(CONFIG.sheets.events);
  const rowIndex = existing.findIndex((row) => String(row.id) === id);
  if (rowIndex >= 0) {
    sheet.deleteRow(rowIndex + 2);
  }
  return { id: id, deleted: rowIndex >= 0 };
}

function getForecastCoefficients_() {
  return forecastCoefficientsFromRows_(readObjects_(CONFIG.sheets.coefficients));
}

function updateForecastCoefficients_(payload) {
  const coefficients = normalizeForecastCoefficients_(payload.coefficients || payload);
  writeForecastCoefficients_(coefficients);
  return coefficients;
}

function getWeeklySummary_(payload) {
  return readObjects_(CONFIG.sheets.weekly).filter((row) => row.monthKey === payload.monthKey);
}

function rebuildWeeklySummary_(monthKey) {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(CONFIG.sheets.weekly);
  const all = readObjects_(CONFIG.sheets.weekly).filter((row) => row.monthKey !== monthKey);
  const records = readObjects_(CONFIG.sheets.daily).filter((row) => row.month === monthKey);
  const events = readObjects_(CONFIG.sheets.events);
  const metrics = ['Лиды', 'Квалы', 'Продажи'];
  const grouped = {};

  records.forEach((record) => {
    const key = record.week + '|' + record.metric;
    if (!grouped[key]) {
      grouped[key] = { rows: [], dates: [] };
    }
    grouped[key].rows.push(record);
    grouped[key].dates.push(record.date);
  });

  const summary = Object.keys(grouped).map((key) => {
    const parts = key.split('|');
    const week = Number(parts[0]);
    const metric = parts[1];
    const rows = grouped[key].rows;
    const dates = unique_(grouped[key].dates).sort();
    const dailyTotals = dates.map((date) => {
      return sum_(rows.filter((row) => row.date === date), 'fact');
    });
    const nonZeroDailyTotals = dailyTotals.filter(Boolean);
    const weekEvents = events.filter((event) => rangesOverlap_(dates[0], dates[dates.length - 1], event.startDate, event.endDate));
    return [
      monthKey,
      week,
      dates[0],
      dates[dates.length - 1],
      metric,
      sum_(rows, 'plan'),
      sum_(rows, 'fact'),
      sum_(rows, 'omQualified'),
      sum_(rows, 'forecast'),
      dailyTotals[0] || 0,
      nonZeroDailyTotals.length ? Math.min.apply(null, nonZeroDailyTotals) : 0,
      dailyTotals[dailyTotals.length - 1] || 0,
      Math.max.apply(null, dailyTotals),
      weekEvents.map((event) => event.title).join(', '),
      new Date(),
    ];
  });

  sheet.clearContents();
  sheet.getRange(1, 1, 1, HEADERS.Weekly_Summary.length).setValues([HEADERS.Weekly_Summary]);
  const rows = all.map((row) => HEADERS.Weekly_Summary.map((header) => row[header] || ''));
  const next = rows.concat(summary);
  if (next.length) {
    sheet.getRange(2, 1, next.length, HEADERS.Weekly_Summary.length).setValues(next);
  }
}

function readObjects_(sheetName) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
  const headers = values.shift();
  return values
    .filter((row) => row.some((cell) => cell !== ''))
    .map((row) => {
      const object = {};
      headers.forEach((header, index) => {
        object[header] = row[index];
      });
      if (object.monthKey !== undefined) {
        object.monthKey = normalizeMonthKey_(object.monthKey, object.year, object.monthIndex);
      }
      if (object.month !== undefined) {
        object.month = normalizeMonthKey_(object.month);
      }
      if (object.date !== undefined) {
        object.date = stringifyDate_(object.date);
      }
      if (object.startDate !== undefined) {
        object.startDate = stringifyDate_(object.startDate);
      }
      if (object.endDate !== undefined) {
        object.endDate = stringifyDate_(object.endDate);
      }
      if (object.weekStart !== undefined) {
        object.weekStart = stringifyDate_(object.weekStart);
      }
      return object;
    });
}

function upsertRowsById_(sheetName, headers, records, mapRow) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(sheetName);
  const existing = readObjects_(sheetName);
  const rowsById = {};
  existing.forEach((row, index) => {
    const id = String(row.id || '').trim();
    if (!id) return;
    if (!rowsById[id]) rowsById[id] = [];
    rowsById[id].push(index + 2);
  });
  const duplicateRows = [];
  Object.keys(rowsById).forEach((id) => {
    const rows = rowsById[id];
    if (rows.length < 2) return;
    duplicateRows.push.apply(duplicateRows, rows.slice(1));
  });
  const rowById = {};
  if (duplicateRows.length) {
    unique_(duplicateRows).sort((a, b) => b - a).forEach((rowNumber) => sheet.deleteRow(rowNumber));
    readObjects_(sheetName).forEach((row, index) => {
      const id = String(row.id || '').trim();
      if (id) rowById[id] = index + 2;
    });
  } else {
    Object.keys(rowsById).forEach((id) => {
      rowById[id] = rowsById[id][0];
    });
  }

  records.forEach((record) => {
    const values = mapRow(record);
    const id = values[0];
    if (rowById[id]) {
      sheet.getRange(rowById[id], 1, 1, headers.length).setValues([values]);
    } else {
      sheet.appendRow(values);
    }
  });

  return { updated: records.length };
}

function dailyRow_(record) {
  return [
    record.id,
    record.date,
    normalizeMonthKey_(record.month || String(record.date).slice(0, 7)),
    record.week || weekOfMonth_(record.date),
    record.city,
    record.channel || '',
    record.metric,
    Number(record.plan || 0),
    Number(record.fact || 0),
    Number(record.forecast || 0),
    record.comment || '',
    new Date(),
    Number(record.recommendations || 0),
    record.metric === 'Квалы' ? Number(record.omQualified || 0) : 0,
  ];
}

function eventRow_(event) {
  const leadSource = normalizeLeadSource_(event.leadSource || parseLeadSourceFromDescription_(event.description || ''));
  return [
    event.id || Utilities.getUuid(),
    event.startDate,
    event.endDate,
    event.title,
    event.type,
    event.group || eventGroupByType_(event.type),
    event.source || 'manual',
    event.expectedEffect,
    event.actualEffect,
    Number(event.importance || 2),
    event.city || 'все',
    event.metric || 'все',
    stripLeadSourceFromDescription_(event.description || ''),
    new Date(),
    leadSource,
  ];
}

function brandPerformanceRow_(record) {
  const weekStart = stringifyDate_(record.weekStart);
  const monthKey = normalizeMonthKey_(record.monthKey || String(weekStart).slice(0, 7));
  const leads = Number(record.leads || 0);
  const qualified = Number(record.qualified || record.kval || record.ql || 0);
  const sales = Number(record.sales || 0);
  const revenue = Number(record.revenue || 0);
  const actualRevenue = Number(record.actualRevenue || record.factRevenue || revenue || 0);
  const budget = Number(record.budget || 0);
  const roas = Number(record.roas || (budget > 0 ? revenue / budget : 0));
  const roasFact = Number(record.roasFact || (budget > 0 ? actualRevenue / budget : 0));
  return [
    record.id || [weekStart, record.city, record.brand, record.source || 'Все источники'].join('|'),
    weekStart,
    monthKey,
    record.city,
    record.brand,
    record.domain || '',
    record.source || 'Все источники',
    leads,
    qualified,
    sales,
    revenue,
    budget,
    roas,
    roasFact,
    Number(record.cpl || (leads > 0 ? budget / leads : 0)),
    Number(record.cpql || (qualified > 0 ? budget / qualified : 0)),
    Number(record.saleCost || (sales > 0 ? budget / sales : 0)),
    Number(record.avgCheck || (sales > 0 ? revenue / sales : 0)),
    new Date(),
    actualRevenue,
  ];
}

function brandBranchRow_(record) {
  const weekStart = stringifyDate_(record.weekStart);
  const monthKey = normalizeMonthKey_(record.monthKey || String(weekStart).slice(0, 7));
  return [
    record.id || [weekStart, record.city, record.platform, record.brand].join('|'),
    weekStart,
    monthKey,
    record.city,
    record.platform,
    record.brand,
    record.rawBrand || record.brand,
    Number(record.branches || 0),
    new Date(),
  ];
}

function decorateMonthConfig_(month, plans) {
  if (!month) return null;
  const monthKey = normalizeMonthKey_(month.monthKey, month.year, month.monthIndex);
  const monthPlans = plans.filter((row) => row.monthKey === monthKey);
  const plansByCity = plansByCityFromRows_(monthPlans);
  return {
    monthKey: monthKey,
    label: month.label,
    year: Number(month.year || 0),
    monthIndex: Number(month.monthIndex || 0),
    daysInMonth: Number(month.daysInMonth || 0),
    plan: reportPlan_(plansByCity),
    plansByCity: plansByCity,
    status: month.status || 'active',
  };
}

function upsertMonthPlans_(monthKey, plansByCity) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(CONFIG.sheets.plans);
  const existing = readObjects_(CONFIG.sheets.plans);
  const rowByKey = {};
  existing.forEach((row, index) => {
    rowByKey[row.monthKey + '|' + row.city + '|' + row.metric] = index + 2;
  });

  ['МСК', 'СПБ', 'сообщения'].forEach((city) => {
    ['Лиды', 'Квалы', 'Продажи'].forEach((metric) => {
      const values = [monthKey, city, metric, Number(plansByCity[city][metric] || 0), new Date()];
      const key = monthKey + '|' + city + '|' + metric;
      if (rowByKey[key]) {
        sheet.getRange(rowByKey[key], 1, 1, values.length).setValues([values]);
      } else {
        sheet.appendRow(values);
      }
    });
  });
}

function ensureDailyRowsForMonth_(monthKey, year, monthIndex, daysInMonth, plansByCity, dailyAverageByCity, coefficients) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(CONFIG.sheets.daily);
  const existing = readObjects_(CONFIG.sheets.daily);
  const rowById = {};
  const currentById = {};
  existing.forEach((row, index) => {
    rowById[row.id] = index + 2;
    currentById[row.id] = row;
  });

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = Utilities.formatDate(new Date(year, monthIndex, day), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    ['МСК', 'СПБ', 'сообщения'].forEach((city) => {
      ['Лиды', 'Квалы', 'Продажи'].forEach((metric) => {
        const id = date + '-' + city + '-' + metric;
        const plan = dailyAverageByCity
          ? Math.round(Number(dailyAverageByCity[city][metric] || 0) * coefficientForCityMetric_(city, metric, date, coefficients))
          : distributeMonthlyPlan_(plansByCity[city][metric], day, daysInMonth);
        const current = currentById[id] || {};
        const values = dailyRow_({
          id: id,
          date: date,
          month: monthKey,
          week: weekOfMonth_(date),
          city: city,
          channel: city === 'сообщения' ? 'Сообщения' : 'Город',
          metric: metric,
          plan: plan,
          fact: current.fact || 0,
          forecast: plan,
          comment: current.comment || '',
          recommendations: current.recommendations || 0,
          omQualified: metric === 'Квалы' ? Number(current.omQualified || 0) : 0,
        });
        if (rowById[id]) {
          sheet.getRange(rowById[id], 1, 1, values.length).setValues([values]);
        } else {
          sheet.appendRow(values);
        }
      });
    });
  }
}

function normalizeDailyUpdate_(record) {
  const date = record.date;
  const city = record.city;
  const metric = record.metric;
  const channel = record.channel || defaultDailyChannel_(city);
  const current = findDailyRecord_(date, city, metric, channel);
  return {
    id: record.id || dailyRecordId_(date, city, metric, channel),
    date: date,
    month: record.month || String(date).slice(0, 7),
    week: record.week || weekOfMonth_(date),
    city: city,
    channel: channel,
    metric: metric,
    plan: record.plan !== undefined ? record.plan : (current ? current.plan : 0),
    fact: record.fact !== undefined ? record.fact : (current ? current.fact : 0),
    forecast: record.forecast !== undefined ? record.forecast : (current ? current.forecast : 0),
    comment: record.comment !== undefined ? record.comment : (current ? current.comment : ''),
    recommendations: record.recommendations !== undefined ? record.recommendations : (current ? current.recommendations : 0),
    omQualified: metric === 'Квалы' ? (record.omQualified !== undefined ? record.omQualified : (current ? current.omQualified : 0)) : 0,
  };
}

function findDailyRecord_(date, city, metric, channel) {
  return readObjects_(CONFIG.sheets.daily).find((row) => {
    if (row.date !== date || row.city !== city || row.metric !== metric) return false;
    if (city === 'источники') return String(row.channel || '') === String(channel || '');
    return true;
  });
}

function dailyRecordId_(date, city, metric, channel) {
  if (city === 'источники' && channel) {
    return date + '-' + city + '-' + channel + '-' + metric;
  }
  return date + '-' + city + '-' + metric;
}

function defaultDailyChannel_(city) {
  if (city === 'сообщения') return 'Сообщения';
  if (city === 'источники') return 'Источник';
  return 'Город';
}

function normalizeDailyForClient_(record) {
  return {
    id: record.id,
    date: stringifyDate_(record.date),
    city: record.city,
    channel: record.channel,
    metric: record.metric,
    plan: Number(record.plan || 0),
    fact: Number(record.fact || 0),
    forecast: Number(record.forecast || 0),
    recommendations: Number(record.recommendations || 0),
    omQualified: record.metric === 'Квалы' ? Number(record.omQualified || 0) : 0,
    comment: record.comment || '',
  };
}

function normalizeEventForClient_(event) {
  return {
    id: event.id,
    startDate: stringifyDate_(event.startDate),
    endDate: stringifyDate_(event.endDate),
    title: event.title,
    type: event.type,
    group: event.group || eventGroupByType_(event.type),
    source: event.source || 'google_sheets',
    expectedEffect: event.expectedEffect,
    actualEffect: event.actualEffect,
    importance: Number(event.importance || 2),
    city: event.city || 'все',
    metric: event.metric || 'все',
    leadSource: normalizeLeadSource_(event.leadSource || parseLeadSourceFromDescription_(event.description || '')),
    description: stripLeadSourceFromDescription_(event.description || ''),
  };
}

function normalizePlansByCity_(plansByCity) {
  const result = {};
  ['МСК', 'СПБ', 'сообщения'].forEach((city) => {
    result[city] = {};
    ['Лиды', 'Квалы', 'Продажи'].forEach((metric) => {
      result[city][metric] = Number(plansByCity && plansByCity[city] ? plansByCity[city][metric] || 0 : 0);
    });
  });
  return result;
}

function plansByCityFromRows_(rows) {
  const result = normalizePlansByCity_({});
  rows.forEach((row) => {
    if (result[row.city] && result[row.city][row.metric] !== undefined) {
      result[row.city][row.metric] = Number(row.plan || 0);
    }
  });
  return result;
}

function defaultForecastCoefficients_() {
  const result = {};
  FORECAST_CITIES.forEach((city) => {
    result[city] = {};
    FORECAST_METRICS.forEach((metric) => {
      result[city][metric] = {};
      FORECAST_WEEKDAYS.forEach((weekday) => {
        result[city][metric][weekday.key] = weekday.defaultValue;
      });
    });
  });
  return result;
}

function forecastCoefficientsFromRows_(rows) {
  const result = defaultForecastCoefficients_();
  rows.forEach((row) => {
    const city = row.city;
    const metric = row.metric;
    const weekday = row.weekday;
    const value = Number(row.coefficient);
    if (
      result[city] &&
      result[city][metric] &&
      result[city][metric][weekday] !== undefined &&
      isFinite(value) &&
      value >= 0
    ) {
      result[city][metric][weekday] = value;
    }
  });
  return result;
}

function normalizeForecastCoefficients_(value) {
  const result = defaultForecastCoefficients_();
  if (!value || typeof value !== 'object') return result;

  FORECAST_CITIES.forEach((city) => {
    FORECAST_METRICS.forEach((metric) => {
      FORECAST_WEEKDAYS.forEach((weekday) => {
        const raw = value[city] && value[city][metric] ? value[city][metric][weekday.key] : undefined;
        const numeric = Number(raw);
        if (isFinite(numeric) && numeric >= 0) {
          result[city][metric][weekday.key] = numeric;
        }
      });
    });
  });
  return result;
}

function writeForecastCoefficients_(coefficients) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(CONFIG.sheets.coefficients);
  const headers = HEADERS.Forecast_Coefficients;
  const rows = [];
  FORECAST_CITIES.forEach((city) => {
    FORECAST_METRICS.forEach((metric) => {
      FORECAST_WEEKDAYS.forEach((weekday) => {
        rows.push([city, metric, weekday.key, Number(coefficients[city][metric][weekday.key] || 0), new Date()]);
      });
    });
  });

  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  if (rows.length) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }
  sheet.autoResizeColumns(1, headers.length);
}

function buildMonthlyPlansFromDailyAverage_(year, monthIndex, daysInMonth, dailyAverageByCity, coefficients) {
  const result = normalizePlansByCity_({});
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = Utilities.formatDate(new Date(year, monthIndex, day), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    FORECAST_CITIES.forEach((city) => {
      FORECAST_METRICS.forEach((metric) => {
        result[city][metric] += Math.round(Number(dailyAverageByCity[city][metric] || 0) * coefficientForCityMetric_(city, metric, date, coefficients));
      });
    });
  }
  return result;
}

function hasAnyPlanValue_(plansByCity) {
  return FORECAST_CITIES.some((city) => {
    return FORECAST_METRICS.some((metric) => Number(plansByCity[city][metric] || 0) > 0);
  });
}

function coefficientForCityMetric_(city, metric, dateIso, coefficients) {
  const weekday = weekdayCoefficientKey_(dateIso);
  return Number(
    coefficients &&
    coefficients[city] &&
    coefficients[city][metric] &&
    coefficients[city][metric][weekday] !== undefined
      ? coefficients[city][metric][weekday]
      : defaultForecastCoefficients_()[city][metric][weekday],
  );
}

function weekdayCoefficientKey_(dateIso) {
  const dayIndex = new Date(dateIso + 'T00:00:00Z').getUTCDay();
  const weekday = FORECAST_WEEKDAYS.find((item) => item.dayIndex === dayIndex);
  return weekday ? weekday.key : 'mon';
}

function reportPlan_(plansByCity) {
  const plan = {};
  ['Лиды', 'Квалы', 'Продажи'].forEach((metric) => {
    plan[metric] = Number(plansByCity['МСК'][metric] || 0) + Number(plansByCity['СПБ'][metric] || 0);
  });
  return plan;
}

function distributeMonthlyPlan_(total, day, daysInMonth) {
  const safeTotal = Math.max(0, Math.round(Number(total || 0)));
  const base = Math.floor(safeTotal / daysInMonth);
  const remainder = safeTotal - base * daysInMonth;
  return base + (day <= remainder ? 1 : 0);
}

function monthLabel_(year, monthIndex) {
  const labels = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  return labels[monthIndex] + ' ' + year;
}

function stringifyDate_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(value).slice(0, 10);
}

function normalizeMonthKey_(value, year, monthIndex) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM');
  }

  const raw = String(value || '').trim();
  const isoMatch = raw.match(/^(\d{4})-(\d{2})/);
  if (isoMatch) {
    return isoMatch[1] + '-' + isoMatch[2];
  }

  const numericYear = Number(year);
  const numericMonthIndex = Number(monthIndex);
  if (isFinite(numericYear) && isFinite(numericMonthIndex)) {
    return numericYear + '-' + String(numericMonthIndex + 1).padStart(2, '0');
  }

  return raw;
}

function eventGroupByType_(type) {
  return ['рекламные изменения', 'техработы', 'продуктовые изменения', 'прочее'].indexOf(type) >= 0 ? 'internal' : 'external';
}

function normalizeLeadSource_(value) {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ');
  if (!normalized || normalized === '__none__') return '';
  if (normalized.toLowerCase() === 'другое') return 'другое';
  return normalized;
}

function parseLeadSourceFromDescription_(description) {
  const match = String(description || '').match(/\[LEAD_SOURCE=([^\]]+)\]/i);
  return match ? match[1] : '';
}

function stripLeadSourceFromDescription_(description) {
  return String(description || '').replace(/\[LEAD_SOURCE=([^\]]+)\]/i, '').trim();
}

function validateDailyRecord_(record) {
  ['id', 'date', 'city', 'metric'].forEach((field) => {
    if (!record[field]) throw new Error('Нет поля дневной записи: ' + field);
  });
  ['plan', 'fact', 'forecast', 'recommendations', 'omQualified'].forEach((field) => {
    if (Number(record[field] || 0) < 0) throw new Error('Метрика не может быть отрицательной: ' + field);
  });
}

function validateEvent_(event) {
  ['startDate', 'endDate', 'title', 'type', 'expectedEffect', 'actualEffect'].forEach((field) => {
    if (!event[field]) throw new Error('Нет поля события: ' + field);
  });
  if (event.startDate > event.endDate) throw new Error('Дата начала события позже даты окончания');
}

function weekOfMonth_(dateIso) {
  const date = new Date(dateIso);
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const firstMondayOffset = (first.getDay() + 6) % 7;
  return Math.floor((date.getDate() + firstMondayOffset - 1) / 7) + 1;
}

function sum_(rows, field) {
  if (field === 'fact') {
    return rows.reduce((total, row) => total + Math.max(0, Number(row.fact || 0) - Number(row.recommendations || 0)), 0);
  }
  if (field === 'recommendations') {
    return rows.reduce((total, row) => total + Number(row.recommendations || 0), 0);
  }
  if (field === 'omQualified') {
    return rows.reduce((total, row) => total + (row.metric === 'Квалы' ? Number(row.omQualified || 0) : 0), 0);
  }
  return rows.reduce((total, row) => total + Number(row[field] || 0), 0);
}

function unique_(values) {
  return values.filter((value, index) => values.indexOf(value) === index);
}

function roundNumber_(value, precision) {
  const multiplier = Math.pow(10, Number(precision || 0));
  return Math.round(Number(value || 0) * multiplier) / multiplier;
}

function uniqueJson_(values) {
  const seen = {};
  return values.filter((value) => {
    const key = JSON.stringify(value && value.payload ? value.payload : value);
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

function rangesOverlap_(aStart, aEnd, bStart, bEnd) {
  return String(aStart) <= String(bEnd) && String(bStart) <= String(aEnd);
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
