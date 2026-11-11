/** Read-only, protected-route comparison with the user's amoCRM filters. */
function amoQualificationFilterAudit_(request) {
  const spec = amoFilterAuditSpec_((request || {}).filterSpec);
  try {
    return amoFilterAuditAggregate_(spec, amoFilterAuditSnapshot_(spec));
  } catch (ignore) {
    // Provider errors can contain lead data; never echo their bodies or warnings.
    throw new Error('Не удалось выполнить полный аудит фильтров amoCRM. Данные отчёта не изменены.');
  }
}

/** Private in-memory snapshot; never return this object from a route. */
function amoFilterAuditSnapshot_(spec) {
    const dictionaries = amoMonthRefreshDictionaries_();
    const pipelineIds = ['4535035', '4535038', '9926210', '9926246'];
    if (!dictionaries || !dictionaries.users || !dictionaries.pipelines || !dictionaries.statuses) throw new Error();
    const byId = {};
    pipelineIds.forEach((pipelineId) => {
      if (typeof dictionaries.pipelines[pipelineId] !== 'string' || !dictionaries.pipelines[pipelineId].trim()
        || !Object.keys(dictionaries.statuses).some((key) => key.indexOf(pipelineId + ':') === 0)) throw new Error();
      const rows = fetchAmoCrmLeadsByDateField_(spec.fromDate, spec.toDate, 'created_at', pipelineId, 80, [], { strictLeadList: true });
      if (!Array.isArray(rows)) throw new Error();
      rows.forEach((lead) => {
        const id = lead && amoFilterAuditId_(lead.id);
        const status = lead && amoFilterAuditId_(lead.status_id);
        const owner = lead && amoFilterAuditId_(lead.responsible_user_id);
        const date = lead && salesAmoNativeCreatedDate_(lead.created_at);
        if (!id || !status || !owner || String(lead.pipeline_id) !== pipelineId || !date
          || date < spec.fromDate || date > spec.toDate
          || !dictionaries.statuses[pipelineId + ':' + status] || !dictionaries.users[owner]
          || (byId[id] && String(byId[id].pipeline_id) !== pipelineId)) throw new Error();
        byId[id] = lead;
      });
    });
    return { dictionaries: dictionaries, byId: byId };
}

function amoFilterAuditAggregate_(spec, snapshot) {
    const dictionaries = snapshot.dictionaries;
    const byId = snapshot.byId;
    const pipelineIds = ['4535035', '4535038', '9926210', '9926246'];
    const pipelines = pipelineIds.map((id) => Object.assign({ id: id, name: dictionaries.pipelines[id],
      city: salesAmoCity_(dictionaries.pipelines[id]) }, amoFilterAuditCounts_()));
    const totals = amoFilterAuditCounts_();
    const config = { periodMode: 'custom', periodStart: spec.fromDate, periodEnd: spec.toDate };
    const dailyQualified = [];
    const dailyByKey = {};
    eachDateInRange_(spec.fromDate, spec.toDate).forEach((date) => {
      ['МСК', 'СПБ'].forEach((city) => {
        const row = { date: date, city: city, qualified: 0 };
        dailyQualified.push(row);
        dailyByKey[date + '|' + city] = row;
      });
    });
    Object.keys(byId).forEach((id) => {
      const lead = byId[id];
      const pipelineId = String(lead.pipeline_id);
      const status = String(lead.status_id);
      const owner = String(lead.responsible_user_id);
      const open = Boolean(spec.open.pipelineStatuses[pipelineId]
        && spec.open.pipelineStatuses[pipelineId].indexOf(status) >= 0 && spec.open.owners.indexOf(owner) >= 0);
      const closed = Boolean(spec.closedTarget.pipelineStatuses[pipelineId]
        && spec.closedTarget.pipelineStatuses[pipelineId].indexOf(status) >= 0
        && spec.closedTarget.owners.indexOf(owner) >= 0
        && spec.closedTarget.lossReasonIds.indexOf(String(lead.loss_reason_id || '')) >= 0);
      const normalized = salesNormalizeAmoLead_(Object.assign({}, lead, {
        pipeline_name: dictionaries.pipelines[pipelineId], status_name: dictionaries.statuses[pipelineId + ':' + status],
        responsible_user_name: dictionaries.users[owner],
      }), dictionaries, config);
      const counts = salesAmoTrafficCounts_(normalized, null);
      if ((open || closed) && counts.qualified) {
        const day = dailyByKey[salesAmoNativeCreatedDate_(lead.created_at) + '|' + normalized.city];
        if (!day) throw new Error();
        day.qualified += counts.qualified;
      }
      const pipeline = pipelines.find((item) => item.id === pipelineId);
      [pipeline, totals].forEach((target) => {
        target.uniqueCohortCount++;
        target.openFilterCount += open ? 1 : 0;
        target.closedFilterCount += closed ? 1 : 0;
        target.reportOpCohortCount += counts.qualified;
        target.reportOmCohortCount += counts.omQualified;
        if (open || closed) {
          target.matchingReportOp += counts.qualified;
          target.matchingOm += counts.omQualified;
          if (!counts.qualified && !counts.omQualified) {
            const reason = amoFilterAuditExclusion_(normalized);
            target.excludedByReason[reason] = (target.excludedByReason[reason] || 0) + 1;
          }
        } else {
          target.extraReportOpOutsideFilters += counts.qualified;
          target.extraOmOutsideFilters += counts.omQualified;
        }
      });
    });
    if (dailyQualified.reduce((sum, row) => sum + row.qualified, 0) !== totals.matchingReportOp) throw new Error();
    return { status: 'success', fromDate: spec.fromDate, toDate: spec.toDate, dateField: 'created_at',
      pipelines: pipelines, totals: totals, dailyQualified: dailyQualified };
}

function amoFilterAuditCounts_() {
  return { uniqueCohortCount: 0, openFilterCount: 0, closedFilterCount: 0, matchingReportOp: 0, matchingOm: 0,
    reportOpCohortCount: 0, reportOmCohortCount: 0, extraReportOpOutsideFilters: 0, extraOmOutsideFilters: 0,
    excludedByReason: {} };
}

function amoFilterAuditExclusion_(normalized) {
  if (normalized && normalized.exclude) {
    const allowed = ['messagesType', 'messagesPipeline', 'noCity', 'closedLostChat'];
    return allowed.indexOf(normalized.excludeReason) >= 0 ? normalized.excludeReason : 'otherExcluded';
  }
  return normalized && normalized.isReferral ? 'referralCashback' : 'notQualifiedStageOrReason';
}

function amoFilterAuditId_(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  const text = String(value || '');
  return /^[1-9]\d{0,14}$/.test(text) && Number.isSafeInteger(Number(text)) ? text : '';
}

function amoFilterAuditSpec_(raw) {
  const invalid = () => { throw new Error('Некорректный фильтр сверки amoCRM.'); };
  if (!raw || typeof raw !== 'object' || raw.dateField !== 'created_at') return invalid();
  const date = (value) => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return invalid();
    const parsed = new Date(value + 'T00:00:00Z');
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return invalid();
    return parsed.getTime();
  };
  const from = date(raw.fromDate);
  const to = date(raw.toDate);
  if (to < from || (to - from) / 86400000 >= 31) return invalid();
  const ids = (values, max) => {
    if (!Array.isArray(values) || !values.length || values.length > max) return invalid();
    const result = values.map(amoFilterAuditId_);
    if (result.some((value) => !value)) return invalid();
    return unique_(result);
  };
  const allowed = ['4535035', '4535038', '9926210', '9926246'];
  const group = (value, closed) => {
    if (!value || !value.pipelineStatuses || typeof value.pipelineStatuses !== 'object'
      || Array.isArray(value.pipelineStatuses)) return invalid();
    const keys = Object.keys(value.pipelineStatuses);
    if (!keys.length || keys.some((key) => allowed.indexOf(key) < 0)
      || (!closed && keys.length !== allowed.length)) return invalid();
    const statuses = {};
    keys.forEach((key) => {
      statuses[key] = ids(value.pipelineStatuses[key], 100);
      if (statuses[key].some((status) => closed ? status !== '143' : status === '143')) return invalid();
    });
    const result = { pipelineStatuses: statuses, owners: ids(value.owners, 250) };
    if (closed) result.lossReasonIds = ids(value.lossReasonIds, 100);
    return result;
  };
  return { fromDate: raw.fromDate, toDate: raw.toDate, open: group(raw.open, false), closedTarget: group(raw.closedTarget, true) };
}
