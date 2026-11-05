/** Two independent clocks: amoCRM successes belong to the lead's arrival cohort. */
function readMainAmoTrafficSalesSnapshot_(fromDate, toDate) {
  const dates = eachDateInRange_(fromDate, toDate);
  const currentById = {};
  const targets = {};
  readObjects_(CONFIG.sheets.daily).forEach((row) => {
    currentById[String(row.id || '')] = row;
    if (row.metric === 'Продажи' && (row.city === 'МСК' || row.city === 'СПБ')
      && optionalSalesCount_(row.trafficSales) !== '') {
      targets[String(row.date) + '|' + row.city] = { date: String(row.date), city: row.city, count: 0 };
    }
  });
  const previousTargets = Object.keys(targets).length;
  dates.forEach((date) => ['МСК', 'СПБ'].forEach((city) => {
    targets[date + '|' + city] = { date: date, city: city, count: 0 };
  }));

  // Previously confirmed cohorts must change when an older lead closes in a new month.
  // Reading the complete scalar cache avoids replacing a cohort with only this refresh's successes.
  const cachedRecords = readAmoCrmRawLeadObjectsFast_();
  if (previousTargets && !cachedRecords.length) {
    throw new Error('amoCRM: полный кэш пустой; сохранённые продажи от трафика не изменены.');
  }
  const byLead = {};
  const historicalFacts = {};
  Object.keys(targets).forEach((key) => {
    const target = targets[key];
    if (target.date < fromDate || target.date > toDate) historicalFacts[key] = { leads: 0, qualified: 0, omQualified: 0 };
  });
  cachedRecords.forEach((record) => {
    const id = String(record.leadId || '').trim();
    if (id) byLead[id] = record;
  });
  Object.keys(byLead).forEach((id) => {
    const record = byLead[id];
    const lead = salesAmoLeadFromCachedRecord_(record);
    if (!lead) return;
    const normalized = salesNormalizeAmoLead_(lead, { users: {}, pipelines: {}, statuses: {} }, { periodMode: 'all' });
    const oldFacts = normalized && historicalFacts[normalized.createdDate + '|' + normalized.city];
    if (oldFacts && !normalized.exclude) {
      oldFacts.leads += 1;
      if (normalized.isQualified) {
        if (normalized.isOmQualified) oldFacts.omQualified += 1;
        else oldFacts.qualified += 1;
      }
    }
    if (String(record.statusId || '').trim() !== '142') return;
    const city = salesAmoCity_(lead.pipeline_name || (lead.cachedNormalized || {}).pipeline);
    const date = (lead.cachedNormalized || {}).createdDate;
    const target = targets[date + '|' + city];
    if (!target) return;
    target.count += salesAmoDealCount_(lead.cachedNormalized);
  });

  const byCity = { 'МСК': 0, 'СПБ': 0 };
  const rows = Object.keys(targets).sort().map((key) => {
    const target = targets[key];
    const id = dailyRecordId_(target.date, target.city, 'Продажи', 'Город');
    const current = currentById[id] || {};
    if (target.date >= fromDate && target.date <= toDate) byCity[target.city] += target.count;
    return Object.assign({}, current, {
      id: id, date: target.date, month: target.date.slice(0, 7), week: weekOfMonth_(target.date),
      city: target.city, channel: 'Город', metric: 'Продажи',
      plan: Number(current.plan || 0), fact: Number(current.fact || 0),
      forecast: current.forecast !== undefined && current.forecast !== '' ? Number(current.forecast) : Number(current.plan || 0),
      recommendations: Number(current.recommendations || 0), omQualified: 0,
      comment: current.comment || '', trafficSales: target.count,
      paidSales: optionalSalesCount_(current.paidSales),
    });
  });
  const historicalMonths = {};
  Object.keys(historicalFacts).forEach((key) => {
    const target = targets[key];
    const facts = historicalFacts[key];
    ['Лиды', 'Квалы'].forEach((metric) => {
      const id = dailyRecordId_(target.date, target.city, metric, 'Город');
      const current = currentById[id] || {};
      const fact = metric === 'Лиды' ? facts.leads : facts.qualified;
      const omQualified = metric === 'Квалы' ? facts.omQualified : 0;
      if (current.id && Number(current.fact || 0) === fact && Number(current.omQualified || 0) === omQualified) return;
      rows.push(Object.assign({}, current, {
        id: id, date: target.date, month: target.date.slice(0, 7), week: weekOfMonth_(target.date),
        city: target.city, channel: 'Город', metric: metric, fact: fact, omQualified: omQualified,
        plan: Number(current.plan || 0), forecast: current.forecast !== undefined && current.forecast !== '' ? Number(current.forecast) : Number(current.plan || 0),
        comment: current.comment || 'amoCRM', recommendations: Number(current.recommendations || 0),
      }));
      historicalMonths[target.date.slice(0, 7)] = true;
    });
  });
  return { rows: rows, fromDate: fromDate, toDate: toDate, byCity: byCity, count: byCity['МСК'] + byCity['СПБ'], historicalMonths: Object.keys(historicalMonths).sort() };
}

function syncMainAmoTrafficSales_(snapshot) {
  const rows = snapshot.rows || [];
  const result = rows.length ? upsertRowsById_(CONFIG.sheets.daily, HEADERS.Data_Daily, rows, dailyRow_) : { updated: 0 };
  (snapshot.historicalMonths || []).forEach(rebuildWeeklySummary_);
  return { updated: result.updated, count: snapshot.count, byCity: snapshot.byCity, months: snapshot.historicalMonths || [] };
}

/** Blank means unavailable; zero is an observed count. */
function optionalSalesCount_(value) {
  if (value === undefined || value === null || String(value).trim() === '') return '';
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('Некорректное сохранённое число продаж.');
  return count;
}
