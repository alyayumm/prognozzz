const MONTHLY_QUALIFICATION_ADJUSTMENT_PREFIX = 'MONTHLY_QUALIFICATION_ADJUSTMENT_';

/** A user-authorized month-level total, independent of lead imports and daily facts. */
function setMonthlyReferralOverride_(request) {
  if (request.monthKey !== '2026-10') throw new Error('Корректировка доступна только для октября 2026 года.');
  const today = Utilities.formatDate(new Date(), 'Europe/Moscow', 'yyyy-MM-dd');
  if (request.monthKey >= today.slice(0, 7)) throw new Error('Корректировка доступна только для завершённого месяца.');
  if (!monthlyReferralCountsValid_(request.targetReferrals, request.baselineReferrals)) {
    throw new Error('Количество рекомендаций должно быть безопасным целым числом; итог не может быть меньше исходного значения.');
  }
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) throw new Error('Обновление уже выполняется. Повторите позже.');
  try {
    const existing = readMonthlyQualificationAdjustment_(request.monthKey);
    if (existing && existing.targetReferrals === request.targetReferrals
      && existing.baselineReferrals === request.baselineReferrals) {
      return {monthKey: request.monthKey, qualificationAdjustment: existing};
    }
    const adjustment = {
      kind: 'referralOverride', targetReferrals: request.targetReferrals,
      baselineReferrals: request.baselineReferrals,
      deduction: request.targetReferrals - request.baselineReferrals,
      scope: 'Все', updatedAt: new Date().toISOString(),
    };
    PropertiesService.getScriptProperties().setProperty(
      MONTHLY_QUALIFICATION_ADJUSTMENT_PREFIX + request.monthKey, JSON.stringify(adjustment));
    return {monthKey: request.monthKey, qualificationAdjustment: adjustment};
  } finally {
    lock.releaseLock();
  }
}

function monthlyReferralCountsValid_(target, baseline) {
  return Number.isSafeInteger(target) && Number.isSafeInteger(baseline)
    && baseline >= 0 && target >= baseline;
}

/** Corrupt active metadata must fail the request rather than restore an unadjusted total. */
function readMonthlyQualificationAdjustment_(monthKey) {
  if (monthKey !== '2026-10') return undefined;
  const raw = PropertiesService.getScriptProperties().getProperty(MONTHLY_QUALIFICATION_ADJUSTMENT_PREFIX + monthKey);
  if (raw === null || raw === undefined) return undefined;
  let value;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    throw new Error('Сохранённая корректировка КВАЛ повреждена. Последний успешный отчёт нужно сохранить.');
  }
  if (!value || Array.isArray(value) || value.kind !== 'referralOverride' || value.scope !== 'Все'
    || !monthlyReferralCountsValid_(value.targetReferrals, value.baselineReferrals)
    || value.deduction !== value.targetReferrals - value.baselineReferrals
    || typeof value.updatedAt !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.updatedAt)
    || !Number.isFinite(Date.parse(value.updatedAt))
    || new Date(value.updatedAt).toISOString() !== value.updatedAt) {
    throw new Error('Сохранённая корректировка КВАЛ некорректна. Последний успешный отчёт нужно сохранить.');
  }
  return {kind: value.kind, targetReferrals: value.targetReferrals, baselineReferrals: value.baselineReferrals,
    deduction: value.deduction, scope: value.scope, updatedAt: value.updatedAt};
}
