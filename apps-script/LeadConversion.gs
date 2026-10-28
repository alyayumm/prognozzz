// This cache is independent of amoCRM qualification, PS sales and redistributed marketing reports.
const LEAD_CONVERSION_SHEET = 'Lead_Conversion_Daily';
const LEAD_CONVERSION_HEADERS = ['id', 'date', 'city', 'brand', 'domain', 'source', 'visits', 'leads', 'rawSource', 'updatedAt'];
const LEAD_CONVERSION_STATE_PROPERTY = 'LEAD_CONVERSION_STATE';

function getLeadConversion_(payload) {
  const month = leadConversionMonth_(payload && payload.monthKey);
  const configured = Boolean(PropertiesService.getScriptProperties().getProperty(CONFIG.roistatApiKeyProperty));
  let records = [], state = {}, warnings = [];
  try {
    records = leadConversionReadRecords_().filter((row) => row.date.slice(0, 7) === month);
    state = leadConversionReadState_()[month] || {};
  } catch (error) {
    warnings.push('Не удалось прочитать сохранённую конверсию. Повторите обновление отчёта.');
  }
  const ranges = leadConversionMergeRanges_(state.ranges || []);
  const coverage = ranges.length === 1 ? ranges[0] : null;
  warnings = warnings.concat(state.warnings || []);
  if (ranges.length > 1) warnings.push('В сохранённых периодах есть разрыв. Обновите месяц целиком для непрерывного покрытия.');
  if (!configured) warnings.push('Подключите Roistat для загрузки визитов и заявок.');
  return { records: records, coverage: coverage, updatedAt: String(state.updatedAt || ''), warnings: warnings, configured: configured };
}

function syncLeadConversion_(payload) {
  const range = leadConversionRange_(payload || {});
  const properties = PropertiesService.getScriptProperties();
  if (!properties.getProperty(CONFIG.roistatApiKeyProperty)) throw new Error('Roistat не подключён. Сохранённая конверсия не изменена.');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) throw new Error('Конверсия уже обновляется. Повторите позже.');
  try {
    const existing = leadConversionReadRecords_();
    const state = leadConversionReadState_();
    let response;
    try {
      response = fetchRoistatEndpoint_('analytics/data', {
        dimensions: ['host', 'marker_level_1'], metrics: ['visits', 'leads'], interval: '1d',
        period: { from: range.fromDate + 'T00:00:00+0300', to: range.toDate + 'T23:59:59+0300' },
      });
    } catch (error) {
      throw new Error('Roistat не вернул отчёт визитов и заявок. Сохранённая конверсия не изменена.');
    }
    // Validate the complete provider result before creating or changing the cache.
    const parsed = leadConversionParseReport_(response, range);
    const updatedAt = new Date().toISOString();
    const next = existing.filter((row) => row.date < range.fromDate || row.date > range.toDate)
      .concat(parsed.records.map((row) => Object.assign({}, row, { updatedAt: updatedAt })));
    next.sort((a, b) => a.id.localeCompare(b.id));
    const months = {};
    eachDateInRange_(range.fromDate, range.toDate).forEach((date) => {
      const month = date.slice(0, 7);
      const part = months[month] || (months[month] = { fromDate: date, toDate: date });
      part.toDate = date;
    });
    Object.keys(months).forEach((month) => {
      const previous = state[month] || {};
      state[month] = { ranges: leadConversionMergeRanges_((previous.ranges || []).concat([months[month]])), updatedAt: updatedAt, warnings: parsed.warnings };
    });
    leadConversionWriteRecords_(next);
    properties.setProperty(LEAD_CONVERSION_STATE_PROPERTY, JSON.stringify(state));
    const snapshot = getLeadConversion_({ monthKey: range.toDate.slice(0, 7) });
    return Object.assign(snapshot, { fromDate: range.fromDate, toDate: range.toDate, status: parsed.warnings.length ? 'warning' : 'success', updated: parsed.records.length });
  } finally {
    lock.releaseLock();
  }
}

function leadConversionParseReport_(response, range) {
  if (!response || (response.status && response.status !== 'success') || !Array.isArray(response.data)) {
    throw new Error('Roistat: неверный формат отчёта. Сохранённая конверсия не изменена.');
  }
  const dates = Object.create(null), records = Object.create(null);
  response.data.forEach((section) => {
    const start = Date.parse(String(section.dateFrom || ''));
    const end = Date.parse(String(section.dateTo || ''));
    const date = Number.isFinite(start) ? new Date(start + 10800000).toISOString().slice(0, 10) : '';
    const midnight = Date.parse(date + 'T00:00:00+03:00');
    if (!date || date < range.fromDate || date > range.toDate || dates[date] || !Array.isArray(section.items)
      || start !== midnight || !Number.isFinite(end) || end < start + 86399000 || end > start + 86400000) {
      throw new Error('Roistat: неполные или неверные дневные интервалы. Сохранённая конверсия не изменена.');
    }
    dates[date] = true;
    const totals = { visits: 0, leads: 0 };
    const collect = (items, inherited) => {
      items.forEach((item) => {
        if (!item || typeof item !== 'object') throw new Error('Roistat: повреждённая строка конверсии.');
        const dimensions = Object.assign({}, inherited, leadConversionSection_(item.dimensions, ['host', 'marker_level_1']));
        const children = Array.isArray(item.items) && item.items.length ? item.items : Array.isArray(item.children) && item.children.length ? item.children : null;
        if (children) { collect(children, dimensions); return; }
        const metrics = leadConversionSection_(item.metrics, ['visits', 'leads']);
        const visits = leadConversionCount_(metrics.visits), leads = leadConversionCount_(metrics.leads);
        if (!Object.prototype.hasOwnProperty.call(dimensions, 'host') || !Object.prototype.hasOwnProperty.call(dimensions, 'marker_level_1')) {
          throw new Error('Roistat: не вернул группировки домена и источника. Сохранённая конверсия не изменена.');
        }
        const domain = leadConversionDomain_(leadConversionCellValue_(dimensions.host));
        const channel = dimensions.marker_level_1;
        const rawSource = String(leadConversionCellValue_(channel) || '');
        const title = channel && typeof channel === 'object' ? String(channel.title || '') : '';
        const source = title.trim() || rawSource.trim() || 'Не определён';
        const id = 'lc:' + date + ':' + encodeURIComponent(domain) + ':' + encodeURIComponent(rawSource || source);
        const record = records[id] || (records[id] = {
          id: id, date: date, city: leadConversionCity_(domain),
          brand: domain ? canonicalRoistatBrand_(domain, '') || 'Не определён' : 'Не определён',
          domain: domain, source: source, rawSource: rawSource, visits: 0, leads: 0,
        });
        record.visits += visits; record.leads += leads;
        totals.visits += visits; totals.leads += leads;
      });
    };
    collect(section.items, {});
    if (section.mean && section.mean.metrics) {
      const reported = leadConversionSection_(section.mean.metrics, ['visits', 'leads']);
      ['visits', 'leads'].forEach((metric) => {
        if (reported[metric] !== undefined && leadConversionCount_(reported[metric]) !== totals[metric]) {
          throw new Error('Roistat: сумма строк не совпала с итогом ' + metric + '. Сохранённая конверсия не изменена.');
        }
      });
    }
  });
  if (eachDateInRange_(range.fromDate, range.toDate).some((date) => !dates[date])) {
    throw new Error('Roistat: вернул не все запрошенные дни. Сохранённая конверсия не изменена.');
  }
  const rows = Object.keys(records).map((key) => records[key]);
  rows.forEach((row) => { leadConversionCount_(row.visits); leadConversionCount_(row.leads); });
  const unknownCities = rows.filter((row) => row.city === 'Не определён').length;
  const warnings = ['Источники и нераспознанные заявки сохранены как в Roistat, без пропорционального распределения.'];
  if (unknownCities) warnings.push('У ' + unknownCities + ' строк город не определён по домену; они не добавлены одновременно в Москву и СПб.');
  return { records: rows, warnings: warnings };
}

function leadConversionSection_(section, order) {
  if (!section || typeof section !== 'object') return {};
  if (!Array.isArray(section)) return section;
  const result = {};
  section.forEach((cell, index) => {
    const key = cell && typeof cell === 'object' ? cell.name || cell.metric_name || cell.dimension_name || cell.key || order[index] : order[index];
    if (key) result[key] = cell;
  });
  return result;
}

function leadConversionCellValue_(cell) {
  if (cell && typeof cell === 'object') return cell.value !== undefined ? cell.value : cell.v !== undefined ? cell.v : cell.title !== undefined ? cell.title : '';
  return cell;
}

function leadConversionCount_(cell) {
  const value = leadConversionCellValue_(cell);
  if (value === undefined || value === null || String(value).trim() === '') throw new Error('Roistat: отсутствует визит или заявка. Сохранённая конверсия не изменена.');
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error('Roistat: неверное число визитов или заявок. Сохранённая конверсия не изменена.');
  return number;
}

function leadConversionDomain_(value) {
  const host = String(value || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[\/?#]/)[0].replace(/:\d+$/, '');
  return /^(?:[a-zа-яё0-9-]+\.)+[a-zа-яё0-9-]+$/i.test(host) ? host : '';
}

function leadConversionCity_(domain) {
  // Concatenated labels are allowed only for these observed city-specific sites.
  const known = { 'avtomotospb.ru': 'СПБ', 'yspexspb.ru': 'СПБ', 'avtoshkola-flagmanmsk.ru': 'МСК' };
  if (Object.prototype.hasOwnProperty.call(known, domain)) return known[domain];
  if (/(?:^|[.-])(?:spb|спб|петербург)(?:[.-]|$)/i.test(domain)) return 'СПБ';
  if (/(?:^|[.-])(?:msk|moscow|москва|мск)(?:[.-]|$)/i.test(domain)) return 'МСК';
  return 'Не определён';
}

function leadConversionReadRecords_() {
  const sheet = getWeeklyReportSpreadsheet_().getSheetByName(LEAD_CONVERSION_SHEET);
  if (!sheet || sheet.getLastRow() < 1) return [];
  const values = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
  const headers = values[0].map((value) => String(value || '').trim());
  if (LEAD_CONVERSION_HEADERS.some((header) => headers.indexOf(header) < 0)) throw new Error('Некорректные заголовки кэша конверсии.');
  const columns = Object.create(null);
  LEAD_CONVERSION_HEADERS.forEach((header) => { columns[header] = headers.indexOf(header); });
  return values.slice(1).filter((row) => row.some((value) => value !== '' && value !== null)).map((row) => {
    const record = {};
    LEAD_CONVERSION_HEADERS.forEach((header) => { record[header] = row[columns[header]]; });
    ['id', 'brand', 'domain', 'source', 'rawSource'].forEach((key) => { record[key] = String(record[key] === undefined || record[key] === null ? '' : record[key]); });
    record.date = leadConversionDate_(record.date);
    if (!record.date || !record.id) throw new Error('Некорректная дата или ID кэша конверсии.');
    record.visits = leadConversionCount_(record.visits); record.leads = leadConversionCount_(record.leads);
    record.city = ['МСК', 'СПБ'].indexOf(record.city) >= 0 ? record.city : 'Не определён';
    return record;
  });
}

function leadConversionWriteRecords_(records) {
  const spreadsheet = getWeeklyReportSpreadsheet_();
  let sheet = spreadsheet.getSheetByName(LEAD_CONVERSION_SHEET);
  if (!sheet) sheet = spreadsheet.insertSheet(LEAD_CONVERSION_SHEET);
  const oldRows = sheet.getLastRow();
  const values = [LEAD_CONVERSION_HEADERS].concat(records.map((record) => LEAD_CONVERSION_HEADERS.map((key) => {
    const value = record[key] === undefined ? '' : record[key];
    // Keep provider labels and dates literal; Sheets otherwise also coerces numeric labels.
    return typeof value === 'string' ? "'" + value : value;
  })));
  while (values.length < oldRows) values.push(LEAD_CONVERSION_HEADERS.map(() => ''));
  if (values.length > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), values.length - sheet.getMaxRows());
  if (LEAD_CONVERSION_HEADERS.length > sheet.getMaxColumns()) sheet.insertColumnsAfter(sheet.getMaxColumns(), LEAD_CONVERSION_HEADERS.length - sheet.getMaxColumns());
  // One rectangular write replaces rows and clears the stale tail together.
  sheet.getRange(1, 1, values.length, LEAD_CONVERSION_HEADERS.length).setValues(values);
  sheet.setFrozenRows(1);
}

function leadConversionReadState_() {
  const text = PropertiesService.getScriptProperties().getProperty(LEAD_CONVERSION_STATE_PROPERTY);
  if (!text) return {};
  const state = JSON.parse(text);
  if (!state || typeof state !== 'object' || Array.isArray(state)) throw new Error('Некорректное состояние покрытия конверсии.');
  return state;
}

function leadConversionMergeRanges_(ranges) {
  const sorted = ranges.map((range) => {
    const fromDate = leadConversionDate_(range.fromDate), toDate = leadConversionDate_(range.toDate);
    if (!fromDate || !toDate || fromDate > toDate) throw new Error('Некорректные интервалы покрытия конверсии.');
    return { fromDate: fromDate, toDate: toDate };
  }).sort((a, b) => a.fromDate.localeCompare(b.fromDate));
  const merged = [];
  sorted.forEach((range) => {
    const last = merged[merged.length - 1];
    const nextDay = last ? new Date(Date.parse(last.toDate + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10) : '';
    if (last && range.fromDate <= nextDay) { if (range.toDate > last.toDate) last.toDate = range.toDate; }
    else merged.push(range);
  });
  return merged;
}

function leadConversionRange_(payload) {
  const fromDate = leadConversionDate_(payload.fromDate), toDate = leadConversionDate_(payload.toDate);
  if (!fromDate || !toDate || fromDate > toDate) throw new Error('Конверсия: укажите корректный период.');
  if ((Date.parse(toDate) - Date.parse(fromDate)) / 86400000 >= 62) throw new Error('Конверсия: выберите не более 62 дней за один импорт.');
  return { fromDate: fromDate, toDate: toDate };
}

function leadConversionMonth_(value) {
  const month = String(value || new Date(Date.now() + 10800000).toISOString().slice(0, 7));
  if (!/^\d{4}-\d{2}$/.test(month) || !leadConversionDate_(month + '-01')) throw new Error('Конверсия: некорректный месяц.');
  return month;
}

function leadConversionDate_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]') return isNaN(value.getTime()) ? '' : new Date(value.getTime() + 10800000).toISOString().slice(0, 10);
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return '';
  const date = new Date(text + 'T00:00:00Z');
  return !isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text ? text : '';
}
