/** Apply one verified October cohort without changing the report's metric policy. */
function amoApplyQualificationFilterFacts_(request) {
  const spec = amoFilterAuditSpec_((request || {}).filterSpec);
  if (spec.fromDate !== '2026-10-01' || spec.toDate !== '2026-10-31'
    || Utilities.formatDate(new Date(), 'Europe/Moscow', 'yyyy-MM-dd') <= spec.toDate) {
    throw new Error('Применение доступно только для полного завершённого октября 2026 года.');
  }
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) throw new Error('Обновление amoCRM уже выполняется. Повторите после завершения.');
  let writesStarted = false;
  try {
    const snapshot = amoFilterAuditSnapshot_(spec);
    const result = amoFilterAuditAggregate_(spec, snapshot);
    if (result.pipelines.some((pipeline) => ['9926210', '9926246'].indexOf(pipeline.id) >= 0 && pipeline.uniqueCohortCount)
      || result.totals.extraReportOpOutsideFilters || result.dailyQualified.length !== 62) throw new Error();
    const fresh = {};
    Object.keys(snapshot.byId).forEach((id) => { fresh[id] = amoCrmLeadRecord_(snapshot.byId[id], snapshot.dictionaries); });
    const cached = {};
    readAmoCrmRawLeadObjectsFast_().forEach((record) => {
      if (['4535035', '4535038'].indexOf(String(record.pipelineId)) < 0) return;
      const date = salesAmoNativeCreatedDate_(salesTimestampFromCachedDate_(salesCachedDateTimeString_(record.createdAt)));
      if (date < spec.fromDate || date > spec.toDate || !date) return;
      const id = String(record.leadId || '');
      if (!id || cached[id]) throw new Error();
      cached[id] = record;
    });
    if (JSON.stringify(Object.keys(cached).sort()) !== JSON.stringify(Object.keys(fresh).sort())) throw new Error();
    if (!amoFilterFactSameDaily_(amoFilterFactReplay_(Object.keys(fresh).map((id) => fresh[id]), spec), result.dailyQualified)) throw new Error();
    const changedRaw = [];
    Object.keys(fresh).forEach((id) => {
      if (String(cached[id].id) !== fresh[id].id) throw new Error();
      if (amoFilterFactFingerprint_(cached[id]) !== amoFilterFactFingerprint_(fresh[id])) changedRaw.push(fresh[id]);
    });
    const patched = Object.keys(cached).map((id) => changedRaw.some((record) => record.leadId === id) ? fresh[id] : cached[id]);
    if (!amoFilterFactSameDaily_(amoFilterFactReplay_(patched, spec), result.dailyQualified)) throw new Error();

    const spreadsheet = getWeeklyReportSpreadsheet_();
    const rawSheet = spreadsheet.getSheetByName(CONFIG.sheets.amoCrmRawLeads);
    const dailySheet = spreadsheet.getSheetByName(CONFIG.sheets.daily);
    amoFilterFactColumn_(rawSheet, 'id');
    const rawHeaders = rawSheet.getRange(1, 1, 1, HEADERS.AmoCRM_Raw_Leads.length).getValues()[0]
      .map((value) => String(value || '').trim());
    if (JSON.stringify(rawHeaders) !== JSON.stringify(HEADERS.AmoCRM_Raw_Leads)) throw new Error();
    amoFilterFactColumn_(dailySheet, 'id');
    const factColumn = amoFilterFactColumn_(dailySheet, 'fact');
    const rawRows = readRowNumbersById_(rawSheet, HEADERS.AmoCRM_Raw_Leads);
    if (Object.keys(rawRows).some((id) => rawRows[id].length !== 1)) throw new Error();
    if (Object.keys(fresh).some((id) => !rawRows[fresh[id].id] || rawRows[fresh[id].id].length !== 1)) throw new Error();
    const dailyRows = readRowNumbersById_(dailySheet, HEADERS.Data_Daily);
    const dailyObjects = readObjects_(CONFIG.sheets.daily);
    const factWrites = result.dailyQualified.map((day) => {
      const id = dailyRecordId_(day.date, day.city, 'Квалы', 'Город');
      const matches = dailyObjects.filter((row) => String(row.id) === id);
      const slotRows = dailyObjects.filter((row) => row.date === day.date && row.city === day.city
        && row.metric === 'Квалы' && row.channel === 'Город');
      const row = matches[0];
      if (matches.length !== 1 || slotRows.length !== 1 || String(slotRows[0].id) !== id
        || !dailyRows[id] || dailyRows[id].length !== 1
        || row.date !== day.date || row.city !== day.city || row.metric !== 'Квалы'
        || row.channel !== 'Город' || String(row.month) !== '2026-10') throw new Error();
      return { rowNumber: dailyRows[id][0], fact: day.qualified,
        changed: row.fact === '' || row.fact === undefined || Number(row.fact) !== day.qualified };
    }).filter((row) => row.changed);

    // Every source, cache and target check above completes before the first write.
    if (changedRaw.length) {
      writesStarted = true;
      upsertRowsById_(CONFIG.sheets.amoCrmRawLeads, HEADERS.AmoCRM_Raw_Leads, changedRaw, amoCrmLeadRow_);
    }
    factWrites.forEach((row) => {
      writesStarted = true;
      dailySheet.getRange(row.rowNumber, factColumn, 1, 1).setValues([[row.fact]]);
    });
    // Retrying after a failed summary rebuild must repair it even if facts are current.
    writesStarted = true;
    rebuildWeeklySummary_('2026-10');
    result.apply = { updatedFactRows: factWrites.length, updatedRawRows: changedRaw.length, summaryRebuilt: true };
    return result;
  } catch (ignore) {
    throw new Error(writesStarted
      ? 'Применение не завершено. Часть данных могла обновиться; повторите полную проверку перед повторным применением.'
      : 'Применение фильтров отменено до записи: свежая когорта, кэш или строки отчёта не прошли полную проверку.');
  } finally {
    lock.releaseLock();
  }
}

function amoFilterFactColumn_(sheet, name) {
  if (!sheet || sheet.getLastColumn() < 1) throw new Error();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map((value) => String(value || '').trim());
  if (headers.filter((value) => value === name).length !== 1) throw new Error();
  return headers.indexOf(name) + 1;
}

function amoFilterFactFingerprint_(record) {
  const timestamps = ['createdAt', 'updatedAt', 'closedAt'].map((field) =>
    salesTimestampFromCachedDate_(salesCachedDateTimeString_(record[field])) || 0);
  const text = ['pipelineId', 'pipelineName', 'statusId', 'statusName', 'responsibleUserId', 'responsibleUserName',
    'city', 'managerName', 'stageName', 'typeLabel', 'leadType', 'createdDate', 'closedDate',
    'excludeReason', 'source', 'lossReasonId', 'lossReasonName', 'category'].map((field) =>
    field === 'createdDate' || field === 'closedDate' ? salesCachedDateOnlyString_(record[field]) : String(record[field] || ''));
  const flags = ['isQualified', 'isNotQualifiedYet', 'isWon', 'isDoubleAB'].map((field) => salesParseBoolean_(record[field]));
  return JSON.stringify([timestamps, text, flags]);
}

function amoFilterFactReplay_(records, spec) {
  const days = [];
  const byDay = {};
  eachDateInRange_(spec.fromDate, spec.toDate).forEach((date) => ['МСК', 'СПБ'].forEach((city) => {
    const row = { date: date, city: city, qualified: 0 }; days.push(row); byDay[date + '|' + city] = row;
  }));
  const config = { periodMode: 'custom', periodStart: spec.fromDate, periodEnd: spec.toDate };
  records.forEach((record) => {
    const lead = salesAmoLeadFromCachedRecord_(record);
    if (!lead) throw new Error();
    const normalized = salesNormalizeAmoLead_(lead, { users: {}, pipelines: {}, statuses: {} }, config);
    const counts = salesAmoTrafficCounts_(normalized, null);
    if (!counts.qualified) return;
    const day = byDay[normalized.createdDate + '|' + normalized.city];
    if (!day) throw new Error();
    day.qualified += counts.qualified;
  });
  return days;
}

function amoFilterFactSameDaily_(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
