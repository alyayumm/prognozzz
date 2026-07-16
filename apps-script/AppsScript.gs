const CONFIG = {
  passwordProperty: 'WEEKLY_REPORT_PASSWORD',
  sheets: {
    daily: 'Data_Daily',
    months: 'Month_Config',
    plans: 'Month_Plans',
    weekly: 'Weekly_Summary',
    events: 'Event_Map',
    coefficients: 'Forecast_Coefficients',
  },
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
  ],
  Forecast_Coefficients: [
    'city',
    'metric',
    'weekday',
    'coefficient',
    'updatedAt',
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

    ensureServiceSheets_();

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
    };

    if (!routes[action]) {
      throw new Error('Неизвестное действие: ' + action);
    }

    const writeActions = ['createMonth', 'upsertDailyValues', 'upsertEvent', 'deleteEvent', 'updateForecastCoefficients'];
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
}

function getMonths_() {
  const plans = readObjects_(CONFIG.sheets.plans);
  return readObjects_(CONFIG.sheets.months).map((month) => decorateMonthConfig_(month, plans));
}

function getMonthData_(payload) {
  const monthKey = payload.monthKey;
  const plans = readObjects_(CONFIG.sheets.plans);
  return {
    config: decorateMonthConfig_(readObjects_(CONFIG.sheets.months).find((row) => row.monthKey === monthKey) || null, plans),
    records: readObjects_(CONFIG.sheets.daily).filter((row) => row.month === monthKey).map(normalizeDailyForClient_),
    events: readObjects_(CONFIG.sheets.events).filter((event) => {
      return String(event.startDate).slice(0, 7) <= monthKey && String(event.endDate).slice(0, 7) >= monthKey;
    }).map(normalizeEventForClient_),
  };
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
      return object;
    });
}

function dailyRow_(record) {
  return [
    record.id,
    record.date,
    record.month || String(record.date).slice(0, 7),
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
  ];
}

function eventRow_(event) {
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
    event.description || '',
    new Date(),
  ];
}

function decorateMonthConfig_(month, plans) {
  if (!month) return null;
  const monthPlans = plans.filter((row) => row.monthKey === month.monthKey);
  const plansByCity = plansByCityFromRows_(monthPlans);
  return {
    monthKey: month.monthKey,
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
  const current = findDailyRecord_(date, city, metric);
  return {
    id: record.id || date + '-' + city + '-' + metric,
    date: date,
    month: record.month || String(date).slice(0, 7),
    week: record.week || weekOfMonth_(date),
    city: city,
    channel: record.channel || (city === 'сообщения' ? 'Сообщения' : 'Город'),
    metric: metric,
    plan: record.plan !== undefined ? record.plan : (current ? current.plan : 0),
    fact: record.fact !== undefined ? record.fact : (current ? current.fact : 0),
    forecast: record.forecast !== undefined ? record.forecast : (current ? current.forecast : 0),
    comment: record.comment !== undefined ? record.comment : (current ? current.comment : ''),
    recommendations: record.recommendations !== undefined ? record.recommendations : (current ? current.recommendations : 0),
  };
}

function findDailyRecord_(date, city, metric) {
  return readObjects_(CONFIG.sheets.daily).find((row) => row.date === date && row.city === city && row.metric === metric);
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
    description: event.description || '',
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

function eventGroupByType_(type) {
  return ['рекламные изменения', 'техработы', 'продуктовые изменения', 'прочее'].indexOf(type) >= 0 ? 'internal' : 'external';
}

function validateDailyRecord_(record) {
  ['id', 'date', 'city', 'metric'].forEach((field) => {
    if (!record[field]) throw new Error('Нет поля дневной записи: ' + field);
  });
  ['plan', 'fact', 'forecast', 'recommendations'].forEach((field) => {
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
  return rows.reduce((total, row) => total + Number(row[field] || 0), 0);
}

function unique_(values) {
  return values.filter((value, index) => values.indexOf(value) === index);
}

function rangesOverlap_(aStart, aEnd, bStart, bEnd) {
  return String(aStart) <= String(bEnd) && String(bStart) <= String(aEnd);
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
