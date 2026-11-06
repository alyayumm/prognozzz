/** Independent monthly source counts for the demand comparison. External workbooks are read only. */
const DEMAND_OUTCOMES_SHEET = 'Demand_Outcomes_Monthly';
const DEMAND_OUTCOMES_INDEX_PROPERTY = 'DEMAND_OUTCOMES_CACHE_INDEX';
const DEMAND_OUTCOMES_HEADERS = ['generation', 'sourceKey', 'sourceSpreadsheetId', 'sourceSheetId', 'sourceSheetName', 'month', 'city', 'metric', 'count', 'sourceRow', 'sourceColumn', 'readAt', 'schemaVersion'];
const DEMAND_OUTCOMES_MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const DEMAND_OUTCOMES_SOURCES = [
  { key: 'sales', spreadsheetId: '18AsqW5bhWTTsMYKqWH73AC335llbGlggSA0tGRUEkyw', sheetName: 'Договоры', sheetId: 1815158623 },
  { key: 'losses', spreadsheetId: '1h0cg9NzgfhN_THJBrelCWeMEYMGCqbSoBMFpVAM01-M', sheetName: 'Сводка по месяцам', sheetId: 104 },
];
const DEMAND_OUTCOMES_LOSS_BREAKDOWN = { sheetName: 'Распределение потока', sheetId: 105 };

function demandOutcomesNow_() { return new Date(); }

/** Public reads do not create sheets, change properties, or persist source data. */
function getDemandOutcomes_() {
  return demandOutcomesSnapshot_(DEMAND_OUTCOMES_SOURCES.map(demandOutcomesReadSource_));
}

/** The dispatcher requires the report password before calling this action. */
function syncDemandOutcomes_() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) throw demandOutcomesSafeError_('Сравнение спроса: обновление уже выполняется. Попробуйте позже.');
  try {
    const results = DEMAND_OUTCOMES_SOURCES.map(demandOutcomesReadSource_);
    const fresh = results.filter((result) => result.info.status === 'ready');
    if (fresh.length) demandOutcomesWriteCache_(fresh);
    return demandOutcomesSnapshot_(results);
  } catch (error) {
    throw demandOutcomesSafeError_(error && error.demandOutcomesSafe ? error.message : 'Сравнение спроса: не удалось сохранить обновление. Последние подтверждённые срезы доступны при повторном чтении.');
  } finally {
    lock.releaseLock();
  }
}

function demandOutcomesReadSource_(source) {
  let records;
  try {
    const warnings = [];
    const spreadsheet = SpreadsheetApp.openById(source.spreadsheetId);
    const sheet = demandOutcomesVerifiedSheet_(spreadsheet, source.sheetName, source.sheetId);
    records = source.key === 'sales'
      ? demandOutcomesReadSales_(sheet)
      : demandOutcomesReadLosses_(spreadsheet, sheet, warnings);
    records = demandOutcomesValidateRecords_(records, source);
    const readAt = demandOutcomesNow_().toISOString();
    return { source: source, records: records, info: demandOutcomesSourceInfo_(source, records, 'ready', readAt, warnings) };
  } catch (error) {
    const label = source.key === 'sales' ? 'Договоры' : 'Сливы';
    const message = error && error.demandOutcomesSafe ? error.message : label + ': исходная таблица временно недоступна. Проверьте доступ аккаунта отчёта к источнику.';
    try {
      const cached = demandOutcomesReadCache_(source);
      if (cached) return { source: source, records: cached.records, info: demandOutcomesSourceInfo_(source, cached.records, 'cached', cached.readAt, (cached.warnings || []).concat([message, label + ': показана последняя подтверждённая загрузка этого источника.'])) };
    } catch (ignore) { /* Invalid or unavailable cache must never masquerade as a successful source read. */ }
    return { source: source, records: [], info: demandOutcomesSourceInfo_(source, [], 'error', '', [message, label + ': подтверждённого сохранённого среза пока нет.']) };
  }
}

function demandOutcomesVerifiedSheet_(spreadsheet, name, id) {
  const sheet = spreadsheet.getSheetByName(name);
  if (!sheet || Number(sheet.getSheetId()) !== id) throw demandOutcomesSafeError_('Сравнение спроса: изменились листы исходной таблицы. Сохранённые данные не заменены.');
  return sheet;
}

function demandOutcomesReadSales_(sheet) {
  const blocks = [
    { city: 'МСК', title: 'москва', startRow: 1, values: sheet.getRange('A1:M8').getValues() },
    { city: 'СПБ', title: 'питер', startRow: 11, values: sheet.getRange('A11:M18').getValues() },
  ];
  const records = [];
  blocks.forEach((block) => {
    if (block.values.length !== 8 || demandOutcomesText_(block.values[0][0]) !== block.title
      || DEMAND_OUTCOMES_MONTHS.some((month, index) => demandOutcomesText_(block.values[0][index + 1]) !== month)) {
      throw demandOutcomesSafeError_('Договоры: изменилась структура месячных таблиц Москвы и СПб. Сохранённые данные не заменены.');
    }
    block.values.slice(1).forEach((row, index) => {
      // These bounded, verified blocks contain exactly 2020–2026. A shifted layout needs explicit remapping.
      const year = demandOutcomesCount_(row[0]);
      if (year !== 2020 + index) throw demandOutcomesSafeError_('Договоры: изменилось расположение годов в исходном листе. Сохранённые данные не заменены.');
      let lastKnown = 0;
      const counts = DEMAND_OUTCOMES_MONTHS.map((month, monthIndex) => {
        const value = demandOutcomesOptionalCount_(row[monthIndex + 1]);
        if (value !== null) lastKnown = monthIndex + 1;
        return value;
      });
      if (!lastKnown || (year < 2026 && lastKnown !== 12) || counts.slice(0, lastKnown).some((count) => count === null)) {
        throw demandOutcomesSafeError_('Договоры: в месячной истории есть пропуски или пустой год. Сохранённые данные не заменены.');
      }
      counts.forEach((count, monthIndex) => {
        if (count === null) return;
        records.push({ month: year + '-' + String(monthIndex + 1).padStart(2, '0'), city: block.city, metric: 'sales', count: count,
          sourceRow: block.startRow + index + 1, sourceColumn: String.fromCharCode(66 + monthIndex) });
      });
    });
  });
  const moscow = records.filter((record) => record.city === 'МСК').map((record) => record.month).join('|');
  const petersburg = records.filter((record) => record.city === 'СПБ').map((record) => record.month).join('|');
  if (moscow !== petersburg) throw demandOutcomesSafeError_('Договоры: Москва и СПб содержат разные месяцы. Сохранённые данные не заменены.');
  return records;
}

function demandOutcomesReadLosses_(spreadsheet, sheet, warnings) {
  const periodSheet = demandOutcomesVerifiedSheet_(spreadsheet, 'Лист1', 0);
  const anchor = demandOutcomesText_(periodSheet.getRange('A1').getValues()[0][0]);
  const period = /^анализ сливов\s*\|\s*([а-яё]+)\s+(20\d{2})\s*[—–-]\s*([а-яё]+)\s+(20\d{2})$/.exec(anchor);
  if (!period || period[1] !== 'ноябрь' || Number(period[2]) !== 2025 || DEMAND_OUTCOMES_MONTHS.indexOf(period[3]) < 0 || Number(period[4]) !== 2026) {
    throw demandOutcomesSafeError_('Сливы: не подтверждён исходный период с ноября 2025 года. Сохранённые данные не заменены.');
  }
  const values = sheet.getRange('A1:F14').getValues();
  const headers = ['месяц', 'заявки', 'договоры', 'сливы', 'конверсия', 'доля сливов'];
  if (values.length !== 14 || headers.some((header, index) => demandOutcomesText_(values[0][index]) !== header)
    || demandOutcomesText_(values[13][0]) !== 'среднее / итог') {
    throw demandOutcomesSafeError_('Сливы: изменилась структура месячной сводки. Сохранённые данные не заменены.');
  }
  const records = [];
  const totals = [0, 0, 0];
  let sawBlank = false;
  values.slice(1, 13).forEach((row, index) => {
    const monthIndex = (10 + index) % 12;
    const year = index < 2 ? 2025 : 2026;
    if (demandOutcomesText_(row[0]) !== DEMAND_OUTCOMES_MONTHS[monthIndex]) throw demandOutcomesSafeError_('Сливы: нарушена последовательность месяцев. Сохранённые данные не заменены.');
    const counts = [1, 2, 3].map((column) => demandOutcomesOptionalCount_(row[column]));
    if (counts.every((count) => count === null)) { sawBlank = true; return; }
    if (sawBlank || counts.some((count) => count === null) || counts[0] - counts[1] !== counts[2]) {
      throw demandOutcomesSafeError_('Сливы: заявки, договоры и сливы не согласованы либо в истории есть пропуск. Сохранённые данные не заменены.');
    }
    counts.forEach((count, column) => { totals[column] += count; });
    records.push({ month: year + '-' + String(monthIndex + 1).padStart(2, '0'), city: 'Все', metric: 'losses', count: counts[2], sourceRow: index + 2, sourceColumn: 'D' });
  });
  if (!records.length || totals.some((total, index) => demandOutcomesCount_(values[13][index + 1]) !== total)) {
    throw demandOutcomesSafeError_('Сливы: история пуста или итог не совпадает с месячными значениями. Сохранённые данные не заменены.');
  }
  return records.concat(demandOutcomesReadCityLosses_(spreadsheet, records, warnings));
}

function demandOutcomesLossMonth_(index) {
  return (index < 2 ? 2025 : 2026) + '-' + String((10 + index) % 12 + 1).padStart(2, '0');
}

function demandOutcomesMonthLabel_(month) {
  const label = DEMAND_OUTCOMES_MONTHS[Number(month.slice(5)) - 1];
  return label[0].toUpperCase() + label.slice(1) + ' ' + month.slice(0, 4);
}

/** The city cells are authoritative counts; discrepancies are never redistributed. */
function demandOutcomesReadCityLosses_(spreadsheet, commonRecords, warnings) {
  const sheet = demandOutcomesVerifiedSheet_(spreadsheet, DEMAND_OUTCOMES_LOSS_BREAKDOWN.sheetName, DEMAND_OUTCOMES_LOSS_BREAKDOWN.sheetId);
  const values = sheet.getRange('A15:O27').getValues();
  const headers = ['месяц', 'всего заявок', 'москва: заявки', 'доля москвы', 'спб: заявки', 'доля спб', 'москва: сливы', 'слив москвы', 'спб: сливы', 'слив спб', 'общие сливы', 'общий % сливов', 'вклад москвы в общий слив', 'вклад спб в общий слив', 'расхождение заявок'];
  if (values.length !== 13 || headers.some((header, index) => demandOutcomesText_(values[0][index]) !== header)) {
    throw demandOutcomesSafeError_('Сливы: изменилась структура распределения по городам. Сохранённые данные не заменены.');
  }
  const commonByMonth = {};
  commonRecords.forEach((record) => { commonByMonth[record.month] = record.count; });
  const records = [];
  let sawBlank = false;
  values.slice(1).forEach((row, index) => {
    const month = demandOutcomesLossMonth_(index);
    const label = demandOutcomesText_(row[0]);
    if (label && label !== DEMAND_OUTCOMES_MONTHS[(10 + index) % 12]) {
      throw demandOutcomesSafeError_('Сливы: нарушена последовательность месяцев в распределении по городам. Сохранённые данные не заменены.');
    }
    // A missing trailing month is unknown, including a month label with no numeric cells.
    if (row.slice(1).every((cell) => cell === '' || cell === null || cell === undefined)) { sawBlank = true; return; }
    const counts = [6, 8, 10].map((column) => demandOutcomesOptionalCount_(row[column]));
    if (!label || sawBlank || counts.some((count) => count === null) || commonByMonth[month] === undefined || counts[2] !== commonByMonth[month]
      || counts[0] + counts[1] > counts[2]) {
      throw demandOutcomesSafeError_('Сливы: городские значения неполны, превышают общий итог или не совпадают со сводкой. Сохранённые данные не заменены.');
    }
    const applications = [1, 2, 4].map((column) => demandOutcomesCount_(row[column]));
    const cityApplications = applications[1] + applications[2];
    if (cityApplications !== applications[0]) warnings.push(demandOutcomesMonthLabel_(month) + ': сумма заявок городов ' + cityApplications + ', общий итог ' + applications[0] + '; расхождение ' + Math.abs(cityApplications - applications[0]) + '. Значения сливов сохранены без перераспределения.');
    records.push({ month: month, city: 'МСК', metric: 'losses', count: counts[0], sourceRow: index + 16, sourceColumn: 'G' });
    records.push({ month: month, city: 'СПБ', metric: 'losses', count: counts[1], sourceRow: index + 16, sourceColumn: 'I' });
  });
  if (!records.length) throw demandOutcomesSafeError_('Сливы: распределение по городам пустое. Сохранённые данные не заменены.');
  return records;
}

function demandOutcomesText_(value) { return String(value === undefined || value === null ? '' : value).replace(/\s+/g, ' ').trim().toLowerCase(); }

function demandOutcomesOptionalCount_(value) {
  return value === '' || value === undefined || value === null ? null : demandOutcomesCount_(value);
}

function demandOutcomesCount_(value) {
  const text = typeof value === 'string' ? value.replace(/[\s\u00a0\u202f]/g, '') : value;
  if ((typeof text !== 'number' && (typeof text !== 'string' || !/^\d+$/.test(text))) || text === '') {
    throw demandOutcomesSafeError_('Сравнение спроса: вместо количества получено неверное значение. Сохранённые данные не заменены.');
  }
  const count = Number(text);
  if (!Number.isSafeInteger(count) || count < 0) throw demandOutcomesSafeError_('Сравнение спроса: количество должно быть целым неотрицательным числом. Сохранённые данные не заменены.');
  return count;
}

function demandOutcomesValidateRecords_(records, source) {
  const byKey = Object.create(null);
  records.forEach((record) => {
    const sourceRow = demandOutcomesCount_(record.sourceRow);
    const count = demandOutcomesCount_(record.count);
    const valid = /^20\d{2}-(0[1-9]|1[0-2])$/.test(record.month) && sourceRow >= 2
      && (source.key === 'sales'
        ? record.metric === 'sales' && (record.city === 'МСК' || record.city === 'СПБ') && /^[B-M]$/.test(record.sourceColumn) && sourceRow <= 18
        : record.metric === 'losses' && (record.city === 'Все'
          ? record.sourceColumn === 'D' && sourceRow <= 13 && record.month === demandOutcomesLossMonth_(sourceRow - 2)
          : (record.city === 'МСК' || record.city === 'СПБ') && record.sourceColumn === (record.city === 'МСК' ? 'G' : 'I')
            && sourceRow >= 16 && sourceRow <= 27 && record.month === demandOutcomesLossMonth_(sourceRow - 16)));
    if (!valid) throw demandOutcomesSafeError_('Сравнение спроса: неверный формат месячных данных источника. Сохранённые данные не заменены.');
    const key = record.month + '|' + record.city + '|' + record.metric;
    if (byKey[key] && (byKey[key].count !== count || byKey[key].sourceRow !== sourceRow || byKey[key].sourceColumn !== record.sourceColumn)) {
      throw demandOutcomesSafeError_('Сравнение спроса: источник содержит противоречивые значения месяца. Сохранённые данные не заменены.');
    }
    byKey[key] = { month: record.month, city: record.city, metric: record.metric, count: count, sourceRow: sourceRow, sourceColumn: record.sourceColumn };
  });
  const result = Object.keys(byKey).map((key) => byKey[key]).sort(demandOutcomesRecordOrder_);
  if (!result.length) throw demandOutcomesSafeError_('Сравнение спроса: источник вернул пустую историю. Сохранённые данные не заменены.');
  if (source.key === 'losses') {
    result.filter((record) => record.city !== 'Все').forEach((record) => {
      const common = byKey[record.month + '|Все|losses'];
      const other = byKey[record.month + '|' + (record.city === 'МСК' ? 'СПБ' : 'МСК') + '|losses'];
      if (!common || !other || record.count + other.count > common.count) {
        throw demandOutcomesSafeError_('Сливы: городские значения не согласованы с общим итогом. Сохранённые данные не заменены.');
      }
    });
  }
  return result;
}

function demandOutcomesSourceInfo_(source, records, status, readAt, warnings) {
  const months = records.map((record) => record.month).sort();
  const info = { key: source.key, url: 'https://docs.google.com/spreadsheets/d/' + source.spreadsheetId + '/edit?gid=' + source.sheetId,
    sheetName: source.sheetName, sheetId: source.sheetId, status: status, readAt: readAt,
    fromMonth: months[0] || '', toMonth: months[months.length - 1] || '', warnings: warnings.slice() };
  const cityRecords = source.key === 'losses' ? records.filter((record) => record.city !== 'Все') : [];
  if (cityRecords.length) {
    const cityMonths = cityRecords.map((record) => record.month).sort();
    info.breakdown = { url: 'https://docs.google.com/spreadsheets/d/' + source.spreadsheetId + '/edit?gid=' + DEMAND_OUTCOMES_LOSS_BREAKDOWN.sheetId,
      sheetName: DEMAND_OUTCOMES_LOSS_BREAKDOWN.sheetName, sheetId: DEMAND_OUTCOMES_LOSS_BREAKDOWN.sheetId,
      fromMonth: cityMonths[0], toMonth: cityMonths[cityMonths.length - 1] };
    records.filter((record) => record.city === 'Все').forEach((common) => {
      const cities = cityRecords.filter((record) => record.month === common.month);
      if (cities.length !== 2) return;
      const citySum = cities[0].count + cities[1].count;
      if (citySum < common.count) info.warnings.push(demandOutcomesMonthLabel_(common.month) + ': сумма сливов городов ' + citySum + ', общий итог ' + common.count + '; расхождение ' + (common.count - citySum) + '. Разница не распределяется.');
    });
  }
  info.warnings = Array.from(new Set(info.warnings));
  return info;
}

function demandOutcomesSnapshot_(results) {
  const records = [].concat.apply([], results.map((result) => result.records)).sort(demandOutcomesRecordOrder_);
  const sources = results.map((result) => result.info);
  return { records: records, sources: sources, status: sources.every((source) => source.status === 'ready') ? 'ready' : records.length ? 'partial' : 'error',
    warnings: [].concat.apply([], sources.map((source) => source.warnings)) };
}

function demandOutcomesRecordOrder_(left, right) { return left.metric.localeCompare(right.metric) || left.month.localeCompare(right.month) || left.city.localeCompare(right.city); }

function demandOutcomesReadIndex_() {
  try {
    const value = JSON.parse(PropertiesService.getScriptProperties().getProperty(DEMAND_OUTCOMES_INDEX_PROPERTY) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch (ignore) { return {}; }
}

function demandOutcomesValidIndexEntry_(entry, source) {
  return entry && entry.version === 1 && entry.spreadsheetId === source.spreadsheetId && entry.sheetId === source.sheetId && entry.sheetName === source.sheetName
    && typeof entry.generation === 'string' && /^[a-zA-Z0-9-]{8,100}$/.test(entry.generation)
    && Number.isSafeInteger(entry.startRow) && entry.startRow >= 2 && Number.isSafeInteger(entry.rowCount) && entry.rowCount >= 1 && entry.rowCount <= 200
    && typeof entry.checksum === 'string' && typeof entry.readAt === 'string' && Number.isFinite(Date.parse(entry.readAt))
    && (entry.warnings === undefined || (Array.isArray(entry.warnings) && entry.warnings.every((warning) => typeof warning === 'string')));
}

function demandOutcomesRecordSource_(record, source) {
  return source.key === 'losses' && (record.city === 'МСК' || record.city === 'СПБ') ? DEMAND_OUTCOMES_LOSS_BREAKDOWN : source;
}

function demandOutcomesReadCache_(source) {
  const entry = demandOutcomesReadIndex_()[source.key];
  if (!demandOutcomesValidIndexEntry_(entry, source)) return null;
  const sheet = getWeeklyReportSpreadsheet_().getSheetByName(DEMAND_OUTCOMES_SHEET);
  if (!sheet || sheet.getLastRow() < entry.startRow + entry.rowCount - 1) return null;
  const headers = sheet.getRange(1, 1, 1, DEMAND_OUTCOMES_HEADERS.length).getValues()[0];
  if (headers.join('|') !== DEMAND_OUTCOMES_HEADERS.join('|')) return null;
  const rows = sheet.getRange(entry.startRow, 1, entry.rowCount, DEMAND_OUTCOMES_HEADERS.length).getValues();
  const records = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const readAt = row[11] instanceof Date ? row[11].toISOString() : String(row[11] || '');
    const rowSource = demandOutcomesRecordSource_({ city: String(row[6]) }, source);
    if (row[0] !== entry.generation || row[1] !== source.key || row[2] !== source.spreadsheetId || Number(row[3]) !== rowSource.sheetId
      || row[4] !== rowSource.sheetName || readAt !== entry.readAt || Number(row[12]) !== 1) return null;
    const month = row[5] instanceof Date ? Utilities.formatDate(row[5], 'Europe/Moscow', 'yyyy-MM') : String(row[5]);
    records.push({ month: month, city: String(row[6]), metric: String(row[7]), count: row[8], sourceRow: row[9], sourceColumn: String(row[10]) });
  }
  const validated = demandOutcomesValidateRecords_(records, source);
  if (validated.length !== entry.rowCount || demandOutcomesChecksum_(validated) !== entry.checksum) return null;
  return { records: validated, readAt: entry.readAt, warnings: entry.warnings || [] };
}

/** Append a complete generation first, then commit its index. Failed writes leave the previous generation available. */
function demandOutcomesWriteCache_(fresh) {
  const spreadsheet = getWeeklyReportSpreadsheet_();
  const sheet = spreadsheet.getSheetByName(DEMAND_OUTCOMES_SHEET) || spreadsheet.insertSheet(DEMAND_OUTCOMES_SHEET);
  const oldLastRow = sheet.getLastRow();
  if (oldLastRow) {
    const headers = sheet.getRange(1, 1, 1, DEMAND_OUTCOMES_HEADERS.length).getValues()[0];
    if (headers.join('|') !== DEMAND_OUTCOMES_HEADERS.join('|')) throw demandOutcomesSafeError_('Сравнение спроса: неизвестная структура сохранённой истории. Сохранённые данные не заменены.');
  }
  const index = demandOutcomesReadIndex_();
  const generation = Utilities.getUuid();
  let startRow = Math.max(oldLastRow + 1, 2);
  const rows = [];
  fresh.forEach((result) => {
    const source = result.source;
    result.records.forEach((record) => {
      const rowSource = demandOutcomesRecordSource_(record, source);
      rows.push([generation, source.key, source.spreadsheetId, rowSource.sheetId, rowSource.sheetName,
        record.month, record.city, record.metric, record.count, record.sourceRow, record.sourceColumn, result.info.readAt, 1]);
    });
    index[source.key] = { version: 1, spreadsheetId: source.spreadsheetId, sheetId: source.sheetId, sheetName: source.sheetName,
      generation: generation, startRow: startRow, rowCount: result.records.length, readAt: result.info.readAt, checksum: demandOutcomesChecksum_(result.records), warnings: result.info.warnings };
    startRow += result.records.length;
  });
  const firstRow = Math.max(oldLastRow + 1, 2);
  const neededRows = firstRow + rows.length - 1;
  if (neededRows > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), neededRows - sheet.getMaxRows());
  if (DEMAND_OUTCOMES_HEADERS.length > sheet.getMaxColumns()) sheet.insertColumnsAfter(sheet.getMaxColumns(), DEMAND_OUTCOMES_HEADERS.length - sheet.getMaxColumns());
  if (!oldLastRow) sheet.getRange(1, 1, 1, DEMAND_OUTCOMES_HEADERS.length).setValues([DEMAND_OUTCOMES_HEADERS]);
  sheet.getRange(firstRow, 1, rows.length, DEMAND_OUTCOMES_HEADERS.length).setValues(rows);
  // Flush the data before the atomic property commit makes this generation visible to concurrent readers.
  SpreadsheetApp.flush();
  PropertiesService.getScriptProperties().setProperty(DEMAND_OUTCOMES_INDEX_PROPERTY, JSON.stringify(index));
}

function demandOutcomesChecksum_(records) {
  const text = JSON.stringify(records.slice().sort(demandOutcomesRecordOrder_));
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(16);
}

function demandOutcomesSafeError_(message) { const error = new Error(message); error.demandOutcomesSafe = true; return error; }
