const AMO_MONTH_RUN_PREFIX = 'AMOCRM_MONTH_REFRESH_RUN_';
const AMO_MONTH_ACTIVE_PREFIX = 'AMOCRM_MONTH_REFRESH_ACTIVE_';
const AMO_MONTH_SNAPSHOTS = 'AMOCRM_CONFIRMED_MONTH_SNAPSHOTS';

/** Protected, resumable full-month import. Stages never publish canonical daily facts. */
function syncAmoCrmMonth_(payload) {
  const request = payload || {};
  if (request.phase === 'status') return amoMonthRefreshPublic_(amoMonthRefreshLoad_(request));
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) throw new Error('Обновление amoCRM уже выполняется. Проверьте статус текущего этапа.');
  try {
    if (request.phase === 'begin') return amoMonthRefreshBegin_(request);
    const run = amoMonthRefreshLoad_(request);
    if (run.result) return run.result;
    if (request.phase === 'stage') return amoMonthRefreshStage_(run, request);
    if (request.phase === 'finalize') return amoMonthRefreshFinalize_(run);
    throw new Error('Неизвестная фаза обновления месяца.');
  } finally {
    lock.releaseLock();
  }
}

function amoMonthRefreshRange_(monthKey) {
  if (!/^\d{4}-\d{2}$/.test(String(monthKey || ''))) throw new Error('Некорректный месяц обновления.');
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7));
  if (year < 2000 || month < 1 || month > 12) throw new Error('Некорректный месяц обновления.');
  const today = Utilities.formatDate(new Date(), 'Europe/Moscow', 'yyyy-MM-dd');
  if (monthKey >= today.slice(0, 7)) throw new Error('Полная загрузка доступна только для завершённого месяца.');
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { monthKey: monthKey, fromDate: monthKey + '-01', toDate: monthKey + '-' + lastDay };
}

function amoMonthRefreshSave_(run) {
  PropertiesService.getScriptProperties().setProperty(AMO_MONTH_RUN_PREFIX + run.runId, JSON.stringify(run));
}

function amoMonthRefreshBegin_(request) {
  const range = amoMonthRefreshRange_(request.monthKey);
  const properties = PropertiesService.getScriptProperties();
  const activeId = properties.getProperty(AMO_MONTH_ACTIVE_PREFIX + range.monthKey);
  if (activeId) {
    const active = JSON.parse(properties.getProperty(AMO_MONTH_RUN_PREFIX + activeId) || 'null');
    if (active && !active.result) return amoMonthRefreshPublic_(active);
  }
  const run = Object.assign({}, range, {
    runId: Utilities.getUuid(), startedAt: new Date().toISOString(), completedDays: [], stages: {}, activeStage: null,
  });
  amoMonthRefreshSave_(run);
  properties.setProperty(AMO_MONTH_ACTIVE_PREFIX + run.monthKey, run.runId);
  return amoMonthRefreshPublic_(run);
}

function amoMonthRefreshLoad_(request) {
  if (!/^[A-Za-z0-9-]{1,100}$/.test(String(request.runId || ''))) throw new Error('Не указан запуск обновления.');
  const properties = PropertiesService.getScriptProperties();
  const run = JSON.parse(properties.getProperty(AMO_MONTH_RUN_PREFIX + request.runId) || 'null');
  if (!run || (request.monthKey && request.monthKey !== run.monthKey)) throw new Error('Запуск обновления не найден.');
  if (!run.result && properties.getProperty(AMO_MONTH_ACTIVE_PREFIX + run.monthKey) !== run.runId) {
    throw new Error('Этот запуск обновления больше не активен.');
  }
  return run;
}

function amoMonthRefreshPublic_(run) {
  return {
    runId: run.runId, monthKey: run.monthKey, fromDate: run.fromDate, toDate: run.toDate,
    startedAt: run.startedAt, completedDays: run.completedDays.slice(), isFinalized: Boolean(run.result),
    status: run.result ? 'success' : run.activeStage ? 'running' : 'staging',
    activeStage: run.activeStage, result: run.result || null,
  };
}

function amoMonthRefreshStage_(run, request) {
  const from = String(request.fromDate || '');
  const to = String(request.toDate || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)
    || from < run.fromDate || to > run.toDate || from > to) throw new Error('Этап должен находиться внутри выбранного месяца.');
  const days = eachDateInRange_(from, to);
  if (!days.length || days.length > 2 || days[0] !== from || days[days.length - 1] !== to) {
    throw new Error('Один этап должен содержать один или два календарных дня.');
  }
  const key = from + '|' + to;
  if (run.stages[key]) return { runId: run.runId, fromDate: from, toDate: to, status: 'staged',
    rows: run.stages[key].rows, completedDays: run.completedDays.slice() };
  if (days.every((day) => run.completedDays.indexOf(day) >= 0)) {
    return { runId: run.runId, fromDate: from, toDate: to, status: 'staged', rows: 0, completedDays: run.completedDays.slice() };
  }
  run.activeStage = { fromDate: from, toDate: to };
  amoMonthRefreshSave_(run);
  try {
    const dictionaries = amoMonthRefreshDictionaries_();
    const pipelineIds = salesTargetPipelineIds_(dictionaries);
    const cities = pipelineIds.map((id) => salesAmoCity_(dictionaries.pipelines[id]));
    if (cities.indexOf('МСК') < 0 || cities.indexOf('СПБ') < 0) throw new Error('Не найдены обе городские воронки amoCRM.');
    const byId = {};
    const warnings = [];
    pipelineIds.forEach((pipelineId) => {
      const rows = fetchAmoCrmLeadsByDateField_(from, to, 'created_at', pipelineId, 80, warnings, { strictLeadList: true });
      rows.forEach((lead) => {
        const date = salesAmoNativeCreatedDate_(lead.created_at);
        if (!lead.id || date < from || date > to || String(lead.pipeline_id) !== String(pipelineId)
          || !dictionaries.statuses[String(pipelineId) + ':' + String(lead.status_id)]
          || !dictionaries.users[String(lead.responsible_user_id || '')]) {
          throw new Error('amoCRM вернула некорректный состав этапа.');
        }
        byId[String(lead.id)] = lead;
      });
    });
    const records = Object.keys(byId).map((id) => amoCrmLeadRecord_(byId[id], dictionaries));
    ensureAmoCrmRawLeadSheet_();
    const written = records.length ? upsertRowsById_(CONFIG.sheets.amoCrmRawLeads, HEADERS.AmoCRM_Raw_Leads, records, amoCrmLeadRow_) : { updated: 0 };
    run.completedDays = unique_(run.completedDays.concat(days)).sort();
    run.activeStage = null;
    const result = { runId: run.runId, fromDate: from, toDate: to, status: 'staged', rows: written.updated, completedDays: run.completedDays.slice() };
    run.stages[key] = { rows: written.updated };
    amoMonthRefreshSave_(run);
    return result;
  } catch (error) {
    run.activeStage = null;
    amoMonthRefreshSave_(run);
    throw error;
  }
}

/** A full snapshot cannot infer Technical owners from a silently failed users dictionary. */
function amoMonthRefreshDictionaries_() {
  const users = {};
  for (let page = 1; page <= 20; page++) {
    const response = fetchAmoCrmEndpoint_('/api/v4/users', { limit: 250, page: page });
    const rows = response && response._embedded && response._embedded.users;
    if (!Array.isArray(rows)) throw new Error('amoCRM: не удалось проверить справочник ответственных.');
    rows.forEach((user) => {
      if (!user.id || !user.name) throw new Error('amoCRM: неполный справочник ответственных.');
      users[String(user.id)] = user.name;
    });
    if (!response._links || !response._links.next) break;
    if (page === 20) throw new Error('amoCRM: справочник ответственных получен не полностью.');
  }
  if (!Object.keys(users).length) throw new Error('amoCRM: справочник ответственных пустой.');
  const response = fetchAmoCrmEndpoint_('/api/v4/leads/pipelines', { limit: 250 });
  const rows = response && response._embedded && response._embedded.pipelines;
  if (!Array.isArray(rows) || !rows.length || (response._links && response._links.next)) {
    throw new Error('amoCRM: справочник воронок получен не полностью.');
  }
  const pipelines = {};
  const statuses = {};
  rows.forEach((pipeline) => {
    const stages = pipeline._embedded && pipeline._embedded.statuses;
    if (!pipeline.id || !pipeline.name || !Array.isArray(stages)) throw new Error('amoCRM: неполный справочник этапов.');
    pipelines[String(pipeline.id)] = pipeline.name;
    stages.forEach((stage) => {
      if (!stage.id || !stage.name) throw new Error('amoCRM: неполный справочник этапов.');
      statuses[pipeline.id + ':' + stage.id] = stage.name;
    });
  });
  return { users: users, pipelines: pipelines, statuses: statuses };
}

function amoMonthRefreshFinalize_(run) {
  const days = eachDateInRange_(run.fromDate, run.toDate);
  if (!days.every((day) => run.completedDays.indexOf(day) >= 0)) throw new Error('Месяц загружен не полностью. Завершите все этапы.');
  const started = Date.parse(run.startedAt);
  const records = readAmoCrmRawLeadObjectsFast_().filter((record) => {
    const date = salesAmoCachedCreatedDate_(record);
    return date >= run.fromDate && date <= run.toDate && amoMonthRefreshSyncedAt_(record.syncedAt) >= started;
  });
  const current = {};
  readObjects_(CONFIG.sheets.daily).forEach((row) => { current[String(row.id)] = row; });
  const byCity = { 'МСК': { leads: 0, qualified: 0, omQualified: 0, trafficSales: 0 }, 'СПБ': { leads: 0, qualified: 0, omQualified: 0, trafficSales: 0 } };
  const sales = {};
  const config = { periodMode: 'custom', periodStart: run.fromDate, periodEnd: run.toDate, monthKey: run.monthKey };
  const uniqueRecords = {};
  records.forEach((record) => { if (record.leadId) uniqueRecords[String(record.leadId)] = record; });
  Object.keys(uniqueRecords).forEach((id) => {
    const lead = salesAmoLeadFromCachedRecord_(uniqueRecords[id]);
    const normalized = salesNormalizeAmoLead_(lead, { users: {}, pipelines: {}, statuses: {} }, config);
    const facts = salesAmoLeadFacts_(lead, { users: {}, pipelines: {}, statuses: {} }, config);
    const counts = salesAmoTrafficCounts_(normalized, facts);
    if (facts) byCity[facts.city].leads += counts.leads;
    if (normalized && !normalized.exclude && byCity[normalized.city]) {
      byCity[normalized.city].qualified += counts.qualified;
      byCity[normalized.city].omQualified += counts.omQualified;
    }
    const city = salesAmoCity_(lead.pipeline_name);
    if (String(lead.status_id) === '142' && byCity[city]) {
      const count = salesAmoDealCount_(lead.cachedNormalized);
      const key = lead.cachedNormalized.createdDate + '|' + city;
      sales[key] = (sales[key] || 0) + count;
      byCity[city].trafficSales += count;
    }
  });
  const warnings = [];
  const main = syncAmoCrmMainReportFacts_(Object.keys(uniqueRecords).map((id) => uniqueRecords[id]), run.fromDate, run.toDate, warnings, { deferSummary: true });
  const trafficRows = [];
  days.forEach((date) => ['МСК', 'СПБ'].forEach((city) => {
    const id = dailyRecordId_(date, city, 'Продажи', 'Город');
    trafficRows.push(Object.assign({ id: id, date: date, month: run.monthKey, week: weekOfMonth_(date), city: city,
      channel: 'Город', metric: 'Продажи', plan: 0, forecast: 0, fact: 0, recommendations: 0, omQualified: 0,
      comment: '', paidSales: '' }, current[id] || {}, { trafficSales: sales[date + '|' + city] || 0 }));
  }));
  const traffic = upsertRowsById_(CONFIG.sheets.daily, HEADERS.Data_Daily, trafficRows, dailyRow_);
  rebuildWeeklySummary_(run.monthKey);
  const properties = PropertiesService.getScriptProperties();
  const stamps = JSON.parse(properties.getProperty(AMO_MONTH_SNAPSHOTS) || '{}');
  stamps[run.monthKey] = run.startedAt;
  properties.setProperty(AMO_MONTH_SNAPSHOTS, JSON.stringify(stamps));
  const counts = { leads: 0, qualified: 0, omQualified: 0, trafficSales: 0 };
  Object.keys(byCity).forEach((city) => Object.keys(counts).forEach((metric) => { counts[metric] += byCity[city][metric]; }));
  run.result = { runId: run.runId, monthKey: run.monthKey, fromDate: run.fromDate, toDate: run.toDate,
    status: 'success', rows: main.updated + traffic.updated, counts: counts, byCity: byCity,
    message: 'Месяц полностью пересчитан по штатной дате создания amoCRM. Оплаты ПС, планы и ручные поправки сохранены.' };
  amoMonthRefreshSave_(run);
  return run.result;
}

function amoMonthRefreshSyncedAt_(value) {
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(String(value || ''));
  return Number.isFinite(timestamp) ? timestamp : -Infinity;
}

/** Do not resurrect old rows absent from a confirmed complete month snapshot. */
function amoMonthRefreshFilterCachedRecords_(records) {
  const stamps = JSON.parse(PropertiesService.getScriptProperties().getProperty(AMO_MONTH_SNAPSHOTS) || '{}');
  return records.filter((record) => {
    const month = String(salesAmoCachedCreatedDate_(record) || '').slice(0, 7);
    return !stamps[month] || amoMonthRefreshSyncedAt_(record.syncedAt) >= Date.parse(stamps[month]);
  });
}
