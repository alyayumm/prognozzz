// City sales follow the order-count formulas in «Динамика»: A+B adds one unit.
// Read only the four scalar columns needed for this metric; no customer data.
function readMainPsSalesSnapshot_(fromDate, toDate) {
  const range = psSalesRange_({ fromDate: fromDate, toDate: toDate });
  const spreadsheet = SpreadsheetApp.openById(SALES_DEPARTMENT_CONFIG.dynamicsSpreadsheetId);
  const sheet = spreadsheet.getSheetByName(SALES_DEPARTMENT_CONFIG.psSheet);
  if (!sheet || sheet.getLastRow() < 2) throw new Error('ПС: выгрузка заказов отсутствует или пуста. Сохранённые продажи не изменены.');
  const lastRow = sheet.getLastRow();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const keys = headers.map(psSalesHeaderKey_);
  const column = (aliases, label) => {
    const wanted = aliases.map(psSalesHeaderKey_);
    const found = [];
    keys.forEach((key, index) => { if (wanted.indexOf(key) >= 0) found.push(index); });
    if (found.length !== 1) throw new Error('ПС: не удалось однозначно определить столбец «' + label + '». Сохранённые продажи не изменены.');
    return sheet.getRange(2, found[0] + 1, lastRow - 1, 1).getDisplayValues();
  };
  const orderIds = column(['Номер заказа'], 'Номер заказа');
  const cities = column(['Город'], 'Город');
  const createdDates = column(['Дата создания'], 'Дата создания');
  const doubleFlags = column(['A+B', 'А+Б', 'А+В'], 'A+B');
  const orders = Object.create(null);
  const warnings = [];
  let duplicateCount = 0;
  let accepted = 0;

  for (let index = 0; index < lastRow - 1; index += 1) {
    const city = psSalesCity_(cities[index] && cities[index][0]);
    if (!city) continue;
    const orderId = String(orderIds[index] && orderIds[index][0] || '').trim();
    const date = psSalesDate_(createdDates[index] && createdDates[index][0]);
    const doubleDeal = psSalesDoubleFlag_(doubleFlags[index] && doubleFlags[index][0]);
    if (!orderId || orderId === '-' || orderId === '—' || !date || doubleDeal === null) {
      throw new Error('ПС: некорректные ID, дата создания или A+B в строке ' + (index + 2) + '. Сохранённые продажи не изменены.');
    }
    const signature = city + '|' + date + '|' + doubleDeal;
    if (orders[orderId]) {
      if (orders[orderId].signature !== signature) throw new Error('ПС: конфликт повторяющегося заказа. Сохранённые продажи не изменены.');
      duplicateCount += 1;
      continue;
    }
    orders[orderId] = { date: date, city: city, doubleDeal: doubleDeal, signature: signature };
    accepted += 1;
  }
  if (!accepted) throw new Error('ПС: выгрузка не содержит корректных заказов Москвы или СПб. Сохранённые продажи не изменены.');
  if (duplicateCount) warnings.push('ПС: повторяющиеся строки заказов учтены однократно: ' + duplicateCount + '.');

  const result = { source: 'PS', fromDate: range.fromDate, toDate: range.toDate, byDay: {}, coverageByMonth: {}, deals: 0, doubleDeals: 0, count: 0, warnings: warnings };
  Object.keys(orders).forEach((orderId) => {
    const order = orders[orderId];
    const month = order.date.slice(0, 7);
    if (month >= range.fromDate.slice(0, 7) && month <= range.toDate.slice(0, 7)) {
      const coverage = result.coverageByMonth[month];
      if (!coverage || order.date > coverage.toDate) result.coverageByMonth[month] = { fromDate: month + '-01', toDate: order.date };
    }
    if (order.date < range.fromDate || order.date > range.toDate) return;
    const byCity = result.byDay[order.date] || (result.byDay[order.date] = {});
    const day = byCity[order.city] || (byCity[order.city] = { deals: 0, doubleDeals: 0, count: 0 });
    const extra = order.doubleDeal ? 1 : 0;
    day.deals += 1;
    day.doubleDeals += extra;
    day.count += 1 + extra;
    result.deals += 1;
    result.doubleDeals += extra;
    result.count += 1 + extra;
  });
  const requestedMonths = {};
  eachDateInRange_(range.fromDate, range.toDate).forEach((date) => { requestedMonths[date.slice(0, 7)] = true; });
  Object.keys(requestedMonths).forEach((month) => {
    if (!result.coverageByMonth[month]) warnings.push('ПС: в выгрузке нет данных за ' + month + '; сохранённые продажи этого месяца оставлены без изменений.');
  });
  return result;
}

function syncMainPsSales_(payload, snapshot) {
  const range = psSalesRange_(payload || {});
  const source = snapshot || readMainPsSalesSnapshot_(range.fromDate, range.toDate);
  if (!source || !source.byDay || !source.coverageByMonth) throw new Error('ПС: неполный результат чтения. Сохранённые продажи не изменены.');
  const warnings = (source.warnings || []).slice();
  const currentById = {};
  readObjects_(CONFIG.sheets.daily).forEach((row) => { currentById[String(row.id || '')] = row; });
  const rows = [];
  const rebuilt = {};
  const missing = {};
  const requestedDates = eachDateInRange_(range.fromDate, range.toDate);
  const datesToWrite = Object.create(null);
  const requestedMonths = Object.create(null);
  requestedDates.forEach((date) => { datesToWrite[date] = true; requestedMonths[date.slice(0, 7)] = true; });
  Object.keys(requestedMonths).forEach((month) => {
    const coverage = source.coverageByMonth[month];
    if (!coverage) return;
    if (!psSalesDate_(coverage.fromDate) || !psSalesDate_(coverage.toDate) || coverage.fromDate > coverage.toDate
      || coverage.fromDate.slice(0, 7) !== month || coverage.toDate.slice(0, 7) !== month) {
      throw new Error('ПС: некорректный период покрытия. Сохранённые продажи не изменены.');
    }
    // Future cells must carry pending markers even beyond the refresh window,
    // otherwise legacy amoCRM zeros look like confirmed PS facts in the UI.
    const monthEnd = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
    eachDateInRange_(coverage.toDate, monthEnd).forEach((date) => {
      if (date > coverage.toDate) datesToWrite[date] = true;
    });
  });
  let pendingDays = 0;
  Object.keys(datesToWrite).sort().forEach((date) => {
    const month = date.slice(0, 7);
    const coverage = source.coverageByMonth[month];
    if (!coverage) { missing[month] = true; return; }
    const pending = date < coverage.fromDate || date > coverage.toDate;
    if (pending) pendingDays += 1;
    ['МСК', 'СПБ'].forEach((city) => {
      const id = dailyRecordId_(date, city, 'Продажи', 'Город');
      const current = currentById[id] || {};
      const day = source.byDay[date] && source.byDay[date][city];
      const fact = pending || !day ? 0 : Number(day.count);
      if (!Number.isSafeInteger(fact) || fact < 0) throw new Error('ПС: некорректное число продаж. Сохранённые продажи не изменены.');
      const userComment = String(current.comment || '').replace(/\[(?:SALES_SOURCE|PS_COVERED_FROM|PS_COVERED_TO|PS_PENDING)=[^\]]*\]/g, '').trim();
      const marker = '[SALES_SOURCE=PS] [PS_COVERED_FROM=' + coverage.fromDate + '] [PS_COVERED_TO=' + coverage.toDate + ']' + (pending ? ' [PS_PENDING=1]' : '');
      rows.push({
        id: id, date: date, month: month, week: weekOfMonth_(date), city: city, channel: 'Город', metric: 'Продажи',
        plan: Number(current.plan || 0), fact: fact,
        forecast: current.forecast !== undefined && current.forecast !== '' ? Number(current.forecast || 0) : Number(current.plan || 0),
        comment: (userComment && userComment !== 'amoCRM' ? userComment + ' ' : '') + marker,
        recommendations: Number(current.recommendations || 0), omQualified: 0,
      });
    });
    rebuilt[month] = true;
  });
  Object.keys(missing).forEach((month) => {
    if (!warnings.some((warning) => String(warning).indexOf(month) >= 0)) warnings.push('ПС: в выгрузке нет данных за ' + month + '; сохранённые продажи этого месяца оставлены без изменений.');
  });
  if (pendingDays) warnings.push('ПС: за ' + pendingDays + ' дн. обновляемых месяцев выгрузка ещё не подтверждена; продажи ожидают данных ПС.');
  const updated = rows.length ? upsertRowsById_(CONFIG.sheets.daily, HEADERS.Data_Daily, rows, dailyRow_).updated : 0;
  const months = Object.keys(rebuilt).sort();
  months.forEach(rebuildWeeklySummary_);
  return {
    source: 'PS', updated: updated, months: months,
    sales: { deals: source.deals, doubleDeals: source.doubleDeals, count: source.count, byDay: source.byDay },
    coverageByMonth: source.coverageByMonth, warnings: warnings, status: warnings.length ? 'warning' : 'success',
    message: 'Продажи обновлены из ПС: ' + source.count + '. А+Б = 2; дата создания заказа.',
    fromDate: range.fromDate, toDate: range.toDate, updatedAt: new Date().toISOString(),
  };
}

function psSalesRange_(payload) {
  const fromDate = psSalesDate_(payload.fromDate || payload.from || payload.startDate || payload.date);
  const toDate = psSalesDate_(payload.toDate || payload.to || payload.endDate || payload.date || fromDate);
  if (!fromDate || !toDate || fromDate > toDate) throw new Error('ПС: передайте корректные даты начала и окончания периода.');
  return { fromDate: fromDate, toDate: toDate };
}

function psSalesDate_(value) {
  const text = String(value || '').trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T]\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?$/);
  const ru = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/);
  const date = iso ? iso[1] + '-' + iso[2] + '-' + iso[3] : ru ? ru[3] + '-' + ru[2].padStart(2, '0') + '-' + ru[1].padStart(2, '0') : '';
  if (!date) return '';
  const parsed = new Date(date + 'T00:00:00Z');
  return !isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : '';
}

function psSalesHeaderKey_(value) {
  return String(value || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, '').trim();
}

function psSalesCity_(value) {
  const text = String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (['москва', 'мск', 'moscow', 'msk'].indexOf(text) >= 0) return 'МСК';
  if (['санктпетербург', 'спб', 'spb', 'saintpetersburg', 'stpetersburg'].indexOf(text) >= 0) return 'СПБ';
  return '';
}

function psSalesDoubleFlag_(value) {
  const text = String(value === null || value === undefined ? '' : value).trim().toLowerCase();
  if (['true', 'истина', 'да', '1', '+'].indexOf(text) >= 0) return true;
  if (['', 'false', 'ложь', 'нет', '0', '-', '—'].indexOf(text) >= 0) return false;
  return null;
}
