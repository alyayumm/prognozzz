const CONFIG = {
  passwordProperty: 'WEEKLY_REPORT_PASSWORD',
  sheets: {
    daily: 'Data_Daily',
    months: 'Month_Config',
    weekly: 'Weekly_Summary',
    events: 'Event_Map',
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
  ],
  Month_Config: [
    'monthKey',
    'label',
    'year',
    'monthIndex',
    'daysInMonth',
    'planLeads',
    'planQualified',
    'planSales',
    'createdAt',
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
    'expectedEffect',
    'actualEffect',
    'importance',
    'city',
    'metric',
    'description',
    'updatedAt',
  ],
};

function doPost(e) {
  try {
    const request = JSON.parse(e.postData.contents || '{}');
    const action = request.action;
    const payload = request.payload || {};

    if (action === 'verifyPassword') {
      return jsonResponse({ ok: true, data: verifyPassword_(request.password) });
    }

    if (!verifyPassword_(request.password)) {
      throw new Error('Неверный пароль админки');
    }

    ensureServiceSheets_();

    const routes = {
      getMonths: getMonths_,
      getMonthData: getMonthData_,
      createMonth: createMonth_,
      upsertDailyValues: upsertDailyValues_,
      getWeeklySummary: getWeeklySummary_,
      upsertEvent: upsertEvent_,
    };

    if (!routes[action]) {
      throw new Error('Неизвестное действие: ' + action);
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
  return readObjects_(CONFIG.sheets.months);
}

function getMonthData_(payload) {
  const monthKey = payload.monthKey;
  return {
    config: readObjects_(CONFIG.sheets.months).find((row) => row.monthKey === monthKey) || null,
    records: readObjects_(CONFIG.sheets.daily).filter((row) => row.month === monthKey),
    events: readObjects_(CONFIG.sheets.events).filter((event) => {
      return String(event.startDate).slice(0, 7) <= monthKey && String(event.endDate).slice(0, 7) >= monthKey;
    }),
  };
}

function createMonth_(payload) {
  const year = Number(payload.year);
  const monthIndex = Number(payload.monthIndex);
  const monthKey = year + '-' + String(monthIndex + 1).padStart(2, '0');
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const label = payload.label || monthKey;
  const monthsSheet = SpreadsheetApp.getActive().getSheetByName(CONFIG.sheets.months);
  const existing = readObjects_(CONFIG.sheets.months).some((row) => row.monthKey === monthKey);

  if (!existing) {
    monthsSheet.appendRow([
      monthKey,
      label,
      year,
      monthIndex,
      daysInMonth,
      Number(payload.planLeads || 0),
      Number(payload.planQualified || 0),
      Number(payload.planSales || 0),
      new Date(),
    ]);
  }

  return { monthKey, label, year, monthIndex, daysInMonth };
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
    validateDailyRecord_(record);
    const values = dailyRow_(record);
    if (rowById[record.id]) {
      sheet.getRange(rowById[record.id], 1, 1, values.length).setValues([values]);
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
      Math.min.apply(null, dailyTotals.filter(Boolean)),
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
  ];
}

function eventRow_(event) {
  return [
    event.id || Utilities.getUuid(),
    event.startDate,
    event.endDate,
    event.title,
    event.type,
    event.expectedEffect,
    event.actualEffect,
    Number(event.importance || 2),
    event.city || 'все',
    event.metric || 'все',
    event.description || '',
    new Date(),
  ];
}

function validateDailyRecord_(record) {
  ['id', 'date', 'city', 'metric'].forEach((field) => {
    if (!record[field]) throw new Error('Нет поля дневной записи: ' + field);
  });
  ['plan', 'fact', 'forecast'].forEach((field) => {
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
