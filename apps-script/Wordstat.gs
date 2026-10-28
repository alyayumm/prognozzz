// Wordstat credentials live only in Script Properties. Public responses contain demand data only.
const WORDSTAT_DEMAND_HEADERS = ['id', 'month', 'city', 'regionId', 'count', 'share', 'updatedAt'];
const WORDSTAT_DEMAND_SHEET = 'Wordstat_Demand';
const WORDSTAT_SOURCE_SPREADSHEET_ID = '1lBIgNVVyg7fT7j_rjVybfxUMBZ74NiuWDfPm3BZsIAY';
const WORDSTAT_HISTORY_SHEET = 'История спроса';
const WORDSTAT_HISTORY_HEADERS = ['Месяц', 'Город', 'Поисковая фраза', 'Запросов за месяц', 'Обновлено (МСК)'];

function wordstatSourceType_() {
  return String(PropertiesService.getScriptProperties().getProperty('WORDSTAT_SOURCE_TYPE') || '').trim().toLowerCase() === 'api' ? 'api' : 'sheet';
}

function wordstatNow_() {
  return new Date();
}

function wordstatPeriod_() {
  const currentMonth = Utilities.formatDate(wordstatNow_(), 'Europe/Moscow', 'yyyy-MM');
  const year = Number(currentMonth.slice(0, 4));
  const monthIndex = Number(currentMonth.slice(5, 7)) - 1;
  const previousEnd = new Date(Date.UTC(year, monthIndex, 0)).toISOString().slice(0, 10);
  return {
    fromDate: (year - 4) + '-01-01T00:00:00Z',
    toDate: previousEnd + 'T00:00:00Z',
    latestAvailableMonth: previousEnd.slice(0, 7),
  };
}

function wordstatCredentials_() {
  const properties = PropertiesService.getScriptProperties();
  return {
    apiKey: String(properties.getProperty('WORDSTAT_API_KEY') || '').trim(),
    folderId: String(properties.getProperty('WORDSTAT_FOLDER_ID') || '').trim(),
  };
}

function getWordstatDemand_() {
  if (wordstatSourceType_() === 'sheet') return wordstatSheetDemand_(false);
  const credentials = wordstatCredentials_();
  const configured = Boolean(credentials.apiKey && credentials.folderId);
  const period = wordstatPeriod_();
  let records = [];
  try {
    records = wordstatReadApiRecords_(period.latestAvailableMonth);
  } catch (error) {
    return wordstatSnapshot_(records, configured, period, ['Wordstat: не удалось прочитать сохранённые данные.'], true);
  }
  if (!configured) return wordstatSnapshot_(records, false, period, [], false);

  const properties = PropertiesService.getScriptProperties();
  const previousError = String(properties.getProperty('WORDSTAT_LAST_ERROR') || '');
  const attemptedAt = Date.parse(properties.getProperty('WORDSTAT_LAST_ATTEMPT_AT') || '');
  const backingOff = previousError && Number.isFinite(attemptedAt) && wordstatNow_().getTime() - attemptedAt < 3600000;
  if (wordstatNeedsRefresh_(records, period) && !backingOff) {
    try {
      return wordstatRefresh_(credentials, period, false);
    } catch (error) {
      return wordstatSnapshot_(records, true, period, [String(error.message)], true);
    }
  }
  return wordstatSnapshot_(records, true, period, previousError ? [previousError] : [], Boolean(previousError));
}

function syncWordstatDemand_() {
  if (wordstatSourceType_() === 'sheet') return wordstatSheetDemand_(true);
  const credentials = wordstatCredentials_();
  if (!credentials.apiKey || !credentials.folderId) {
    throw new Error('Wordstat: сначала подключите Яндекс Облако — задайте API-ключ и ID каталога в настройках сервера.');
  }
  return wordstatRefresh_(credentials, wordstatPeriod_(), true);
}

function wordstatRefresh_(credentials, period, force) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) throw new Error('Wordstat: обновление уже выполняется. Попробуйте позже.');
  const properties = PropertiesService.getScriptProperties();
  try {
    const existing = wordstatReadApiRecords_(period.latestAvailableMonth);
    // A competing reader may have failed while this execution was waiting for the lock.
    const previousError = String(properties.getProperty('WORDSTAT_LAST_ERROR') || '');
    const attemptedAt = Date.parse(properties.getProperty('WORDSTAT_LAST_ATTEMPT_AT') || '');
    if (!force && previousError && Number.isFinite(attemptedAt) && wordstatNow_().getTime() - attemptedAt < 3600000) {
      return wordstatSnapshot_(existing, true, period, [previousError], true);
    }
    if (!force && !wordstatNeedsRefresh_(existing, period)) {
      return wordstatSnapshot_(existing, true, period, [], false);
    }
    properties.setProperty('WORDSTAT_LAST_ATTEMPT_AT', wordstatNow_().toISOString());
    const updatedAt = wordstatNow_().toISOString();
    // Do not write either city until both complete provider responses have been validated.
    const moscow = wordstatFetchCity_(credentials, period, 'МСК', '213', updatedAt);
    const petersburg = wordstatFetchCity_(credentials, period, 'СПБ', '2', updatedAt);
    const byId = {};
    existing.concat(moscow, petersburg).forEach(function(record) {
      byId[record.city + ':' + record.month] = record;
    });
    const records = Object.keys(byId).map(function(id) { return byId[id]; });
    records.sort(wordstatRecordOrder_);
    // Invalidate provenance first so a failed write/final marker cannot expose mixed-source data.
    properties.setProperty('WORDSTAT_DEMAND_CACHE_SOURCE', 'updating');
    wordstatWriteRecords_(records);
    properties.setProperty('WORDSTAT_DEMAND_CACHE_SOURCE', 'api');
    properties.setProperty('WORDSTAT_LAST_SYNCED_AT', updatedAt);
    properties.deleteProperty('WORDSTAT_LAST_ERROR');
    return wordstatSnapshot_(records, true, period, [], false);
  } catch (error) {
    const message = error && error.wordstatSafe ? error.message : 'Wordstat: не удалось завершить обновление. Проверьте подключение и повторите позже.';
    properties.setProperty('WORDSTAT_LAST_ERROR', message);
    throw new Error(message);
  } finally {
    lock.releaseLock();
  }
}

function wordstatNeedsRefresh_(records, period) {
  return ['МСК', 'СПБ'].some(function(city) {
    return !records.some(function(record) { return record.city === city && record.month === period.latestAvailableMonth; });
  });
}

function wordstatSnapshot_(records, configured, period, warnings, failed, sourceInfo) {
  let lastSyncedAt = '';
  records.forEach(function(record) {
    if (record.updatedAt > lastSyncedAt) lastSyncedAt = record.updatedAt;
  });
  return {
    phrase: 'автошкола',
    records: records,
    configured: configured,
    connectionMessage: failed
      ? (warnings[0] || 'Wordstat: не удалось обновить данные. Сохранённая история не изменена.')
      : sourceInfo && sourceInfo.source === 'sheet'
        ? 'Источник — лист «История спроса». Отчёт читает обновлённую выгрузку при открытии вкладки.'
      : configured
        ? 'Яндекс Wordstat подключён. Данные обновляются после завершения месяца.'
        : 'Для загрузки спроса подключите Яндекс Облако: API-ключ Search API и ID каталога.',
    latestAvailableMonth: period.latestAvailableMonth,
    lastSyncedAt: lastSyncedAt,
    status: !configured ? 'not_configured' : failed ? 'error' : records.length ? 'ready' : 'empty',
    warnings: warnings,
    source: sourceInfo && sourceInfo.source || 'api',
    sourceUrl: sourceInfo && sourceInfo.sourceUrl || 'https://wordstat.yandex.ru/',
  };
}

function wordstatSheetDemand_(persist) {
  const period = wordstatPeriod_();
  let info = { source: 'sheet', sourceUrl: 'https://docs.google.com/spreadsheets/d/' + WORDSTAT_SOURCE_SPREADSHEET_ID + '/edit' };
  let spreadsheetId = '';
  try {
    spreadsheetId = String(PropertiesService.getScriptProperties().getProperty('WORDSTAT_SOURCE_SPREADSHEET_ID') || WORDSTAT_SOURCE_SPREADSHEET_ID).trim();
    if (!/^[a-zA-Z0-9_-]{20,120}$/.test(spreadsheetId)) throw wordstatSafeError_('Wordstat: некорректная настройка таблицы спроса. Сохранённая история не изменена.');
    info = { source: 'sheet', sourceUrl: 'https://docs.google.com/spreadsheets/d/' + spreadsheetId + '/edit' };
    // The user updates this source through its own extension; reading never calls Yandex API.
    const records = wordstatReadHistorySheet_(spreadsheetId, period.latestAvailableMonth);
    if (persist) {
      const lock = LockService.getScriptLock();
      if (!lock.tryLock(1000)) throw wordstatSafeError_('Wordstat: обновление уже выполняется. Попробуйте позже.');
      try {
        // Both city series have been validated before changing the shared cache.
        PropertiesService.getScriptProperties().setProperty('WORDSTAT_DEMAND_CACHE_SOURCE', 'updating');
        wordstatWriteRecords_(records);
        PropertiesService.getScriptProperties().setProperty('WORDSTAT_DEMAND_CACHE_SOURCE', 'sheet:' + spreadsheetId);
      } finally {
        lock.releaseLock();
      }
    }
    return wordstatSnapshot_(records, true, period, [], false, info);
  } catch (error) {
    const message = error && error.wordstatSafe ? error.message : 'Wordstat: не удалось прочитать таблицу спроса. Сохранённая история не изменена.';
    if (persist) throw wordstatSafeError_(message);
    let cached = [];
    const cacheSource = PropertiesService.getScriptProperties().getProperty('WORDSTAT_DEMAND_CACHE_SOURCE');
    if (/^[a-zA-Z0-9_-]{20,120}$/.test(spreadsheetId) && cacheSource === 'sheet:' + spreadsheetId) {
      try { cached = wordstatReadRecords_(period.latestAvailableMonth); } catch (ignore) {}
    }
    return wordstatSnapshot_(cached, true, period, [message], true, info);
  }
}

function wordstatReadHistorySheet_(spreadsheetId, latestAvailableMonth) {
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const sheet = spreadsheet.getSheetByName(WORDSTAT_HISTORY_SHEET);
  const rowCount = sheet ? sheet.getLastRow() : 0;
  if (rowCount < 2 || rowCount > 1000) throw wordstatSafeError_('Wordstat: лист «История спроса» пуст или имеет неподдерживаемый размер. Сохранённая история не изменена.');
  const values = sheet.getRange(1, 1, rowCount, 5).getValues();
  const headers = values.shift().map((value) => String(value || '').replace(/\s+/g, ' ').trim());
  const columns = WORDSTAT_HISTORY_HEADERS.map((header) => headers.indexOf(header));
  if (columns.some((column) => column < 0) || new Set(headers).size !== 5) throw wordstatSafeError_('Wordstat: изменились заголовки листа «История спроса». Сохранённая история не изменена.');
  const byMonthCity = Object.create(null);
  const monthsByCity = { 'МСК': Object.create(null), 'СПБ': Object.create(null) };
  values.forEach((row, index) => {
    if (row.every((value) => value === '' || value === null)) return;
    const month = wordstatHistoryMonth_(row[columns[0]]);
    const cityText = String(row[columns[1]] || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const city = ['москва', 'мск'].indexOf(cityText) >= 0 ? 'МСК' : ['санкт-петербург', 'санкт петербург', 'спб'].indexOf(cityText) >= 0 ? 'СПБ' : '';
    const phrase = String(row[columns[2]] || '').trim().toLowerCase();
    if (!month || !city || phrase !== 'автошкола') throw wordstatSafeError_('Wordstat: неверный месяц, город или поисковая фраза в строке ' + (index + 2) + '. Сохранённая история не изменена.');
    // Current/future months can be unfinished in the source and stay out of seasonal comparisons.
    if (month > latestAvailableMonth) return;
    const rawCount = row[columns[3]];
    const count = wordstatCount_(typeof rawCount === 'string' ? rawCount.replace(/[\s\u00a0\u202f]+/g, '') : rawCount);
    const updatedAt = wordstatHistoryTimestamp_(row[columns[4]]);
    if (count === null || !updatedAt) throw wordstatSafeError_('Wordstat: неверная частотность или время обновления в строке ' + (index + 2) + '. Сохранённая история не изменена.');
    const key = city + ':' + month;
    const previous = byMonthCity[key];
    if (previous && previous.count !== count) throw wordstatSafeError_('Wordstat: в истории есть противоречивые значения города и месяца. Сохранённая история не изменена.');
    if (!previous || updatedAt > previous.updatedAt) byMonthCity[key] = { month: month, city: city, regionId: city === 'МСК' ? '213' : '2', count: count, share: null, updatedAt: updatedAt };
    monthsByCity[city][month] = true;
  });
  const moscowMonths = Object.keys(monthsByCity['МСК']).sort();
  const petersburgMonths = Object.keys(monthsByCity['СПБ']).sort();
  if (!moscowMonths.length || moscowMonths.join('|') !== petersburgMonths.join('|')) throw wordstatSafeError_('Wordstat: история Москвы и Санкт-Петербурга должна содержать одинаковые месяцы. Сохранённая история не изменена.');
  return Object.keys(byMonthCity).map((key) => byMonthCity[key]).sort(wordstatRecordOrder_);
}

function wordstatHistoryMonth_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]') return Number.isFinite(value.getTime()) ? Utilities.formatDate(value, 'Europe/Moscow', 'yyyy-MM') : '';
  const text = String(value || '').trim();
  const ru = /^(0[1-9]|1[0-2])\.([1-9]\d{3})$/.exec(text);
  if (ru) return ru[2] + '-' + ru[1];
  return /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(text) ? text : '';
}

function wordstatHistoryTimestamp_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]') return Number.isFinite(value.getTime()) ? value.toISOString() : '';
  const match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(value || '').trim());
  if (!match) return '';
  const local = match[3] + '-' + match[2].padStart(2, '0') + '-' + match[1].padStart(2, '0') + 'T' + match[4].padStart(2, '0') + ':' + match[5] + ':' + (match[6] || '00');
  const date = new Date(local + '+03:00');
  return Number.isFinite(date.getTime()) && new Date(date.getTime() + 10800000).toISOString().slice(0, 19) === local ? date.toISOString() : '';
}

function wordstatReadApiRecords_(latestAvailableMonth) {
  const cacheSource = PropertiesService.getScriptProperties().getProperty('WORDSTAT_DEMAND_CACHE_SOURCE');
  // Unmarked legacy caches belonged to the original API implementation.
  if (cacheSource && cacheSource !== 'api') return [];
  return wordstatReadRecords_(latestAvailableMonth);
}

function wordstatFetchCity_(credentials, period, city, regionId, updatedAt) {
  let response;
  try {
    response = UrlFetchApp.fetch('https://searchapi.api.cloud.yandex.net/v2/wordstat/dynamics', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Api-key ' + credentials.apiKey },
      muteHttpExceptions: true,
      followRedirects: false,
      payload: JSON.stringify({
        phrase: 'автошкола',
        period: 'PERIOD_MONTHLY',
        regions: [regionId],
        devices: ['DEVICE_ALL'],
        folderId: credentials.folderId,
        fromDate: period.fromDate,
        toDate: period.toDate,
      }),
    });
  } catch (error) {
    throw wordstatSafeError_('Wordstat: сервис временно недоступен. Сохранённая история не изменена.');
  }
  const code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    // Never echo upstream bodies: they may include credentials or diagnostic request details.
    throw wordstatSafeError_('Wordstat: сервис вернул ошибку HTTP ' + code + '. Проверьте подключение и повторите обновление позже.');
  }
  let body;
  try {
    body = JSON.parse(response.getContentText());
  } catch (error) {
    throw wordstatSafeError_('Wordstat: сервис вернул некорректные данные. Сохранённая история не изменена.');
  }
  if (!body || !Array.isArray(body.results) || !body.results.length) {
    throw wordstatSafeError_('Wordstat: сервис вернул пустую историю для ' + city + '. Сохранённая история не изменена.');
  }
  const byMonth = {};
  const records = body.results.map(function(item) {
    const date = item && typeof item.date === 'string' ? item.date : '';
    const month = date.slice(0, 7);
    const validDate = /^\d{4}-\d{2}-01T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(date) && Number.isFinite(Date.parse(date));
    const count = wordstatCount_(item && item.count);
    const share = wordstatShare_(item && item.share);
    if (!validDate || month < period.fromDate.slice(0, 7) || month > period.latestAvailableMonth || byMonth[month] || count === null || share === undefined) {
      throw wordstatSafeError_('Wordstat: неполная или некорректная история для ' + city + '. Сохранённая история не изменена.');
    }
    byMonth[month] = true;
    return { month: month, city: city, regionId: regionId, count: count, share: share, updatedAt: updatedAt };
  });
  let month = period.fromDate.slice(0, 7);
  while (month <= period.latestAvailableMonth) {
    if (!byMonth[month]) throw wordstatSafeError_('Wordstat: в истории для ' + city + ' пропущен месяц. Сохранённая история не изменена.');
    const year = Number(month.slice(0, 4));
    const nextMonth = Number(month.slice(5, 7)) + 1;
    month = nextMonth > 12 ? (year + 1) + '-01' : year + '-' + String(nextMonth).padStart(2, '0');
  }
  return records;
}

function wordstatCount_(value) {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value))) return null;
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
}

function wordstatShare_(value) {
  if (value === undefined || value === null) return null;
  if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') return undefined;
  const share = Number(value);
  return Number.isFinite(share) && share >= 0 ? share : undefined;
}

function wordstatReadRecords_(latestAvailableMonth) {
  const sheet = getWeeklyReportSpreadsheet_().getSheetByName(WORDSTAT_DEMAND_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getRange(1, 1, sheet.getLastRow(), WORDSTAT_DEMAND_HEADERS.length).getValues();
  const headers = values.shift();
  if (headers.join('|') !== WORDSTAT_DEMAND_HEADERS.join('|')) throw new Error('Wordstat: неизвестный формат сохранённой истории.');
  const byId = {};
  values.forEach(function(row) {
    if (row.every(function(value) { return value === ''; })) return;
    const month = row[1] instanceof Date ? Utilities.formatDate(row[1], 'Europe/Moscow', 'yyyy-MM') : String(row[1]);
    const city = String(row[2]);
    const count = wordstatCount_(row[4]);
    const share = row[5] === '' ? null : wordstatShare_(row[5]);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || (city !== 'МСК' && city !== 'СПБ') || count === null || share === undefined) {
      throw new Error('Wordstat: некорректные сохранённые данные.');
    }
    if (month > latestAvailableMonth) return;
    const timestamp = row[6] instanceof Date ? row[6].toISOString() : String(row[6] || '');
    byId[city + ':' + month] = {
      month: month, city: city, regionId: city === 'МСК' ? '213' : '2',
      count: count, share: share, updatedAt: Number.isFinite(Date.parse(timestamp)) ? new Date(timestamp).toISOString() : '',
    };
  });
  return Object.keys(byId).map(function(id) { return byId[id]; }).sort(wordstatRecordOrder_);
}

function wordstatWriteRecords_(records) {
  const spreadsheet = getWeeklyReportSpreadsheet_();
  const sheet = spreadsheet.getSheetByName(WORDSTAT_DEMAND_SHEET) || spreadsheet.insertSheet(WORDSTAT_DEMAND_SHEET);
  const rows = [WORDSTAT_DEMAND_HEADERS].concat(records.map(function(record) {
    return [record.city + ':' + record.month, record.month, record.city, record.regionId, record.count, record.share === null ? '' : record.share, record.updatedAt];
  }));
  // Include trailing blank rows if a corrupt duplicate was removed, avoiding stale leftovers.
  while (rows.length < sheet.getLastRow()) rows.push(WORDSTAT_DEMAND_HEADERS.map(function() { return ''; }));
  if (rows.length > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), rows.length - sheet.getMaxRows());
  if (WORDSTAT_DEMAND_HEADERS.length > sheet.getMaxColumns()) sheet.insertColumnsAfter(sheet.getMaxColumns(), WORDSTAT_DEMAND_HEADERS.length - sheet.getMaxColumns());
  sheet.getRange(1, 1, rows.length, WORDSTAT_DEMAND_HEADERS.length).setValues(rows);
  sheet.setFrozenRows(1);
}

function wordstatRecordOrder_(a, b) {
  return a.month.localeCompare(b.month) || a.city.localeCompare(b.city);
}

function wordstatSafeError_(message) {
  const error = new Error(message);
  error.wordstatSafe = true;
  return error;
}
