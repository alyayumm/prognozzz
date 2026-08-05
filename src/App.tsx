import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Download,
  Info,
  KeyRound,
  LayoutDashboard,
  MessageSquare,
  Plus,
  Save,
  Settings,
  Target,
  TrendingUp,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildSeedRecords,
  combineReportPlan,
  createMonthConfig,
  metrics,
  monthConfig,
  monthConfigs as seedMonthConfigs,
  seedEvents,
} from "./data/dashboardMock";
import { callReportApi, getReportApiEndpoint } from "./api/reportApi";
import { loadPublicSheetSnapshot } from "./api/publicSheetApi";
import { buildAttentionItems } from "./lib/insights";
import {
  applyTrafficModeToTotals,
  buildConversions,
  buildMetricTotals,
  buildOverallMonths,
  filterEventsByScope,
  filterEventsForRange,
  filterRecordsByScope,
  getMonthTiming,
  getPeriodStatus,
  metricFactForTraffic,
  netFact,
  omQualifiedValue,
  percent,
  recommendationValue,
  reportScopes,
  shouldShowForecastForWeek,
  total,
  type MetricTotals,
  type ReportScope,
  type TrafficMode,
} from "./lib/metrics";
import type {
  City,
  CreateMonthPayload,
  DailyRecord,
  DailyRecordCity,
  DailyValueUpdate,
  Effect,
  EventCity,
  EventGroup,
  EventItem,
  EventType,
  ForecastCoefficients,
  Metric,
  MonthConfig,
  PlanByCity,
  WeekdayCoefficientKey,
  WeekSummary,
} from "./types";
import { formatDay, getMonthDates, getWeekOfMonth, weekdayLabel } from "./utils/date";
import { buildWeeklySummary } from "./utils/report";

type Mode = "allMonths" | "month" | "monthDaily" | "week" | "sources" | "messages" | "events" | "admin";
type AdminTab = "day" | "month" | "sources" | "events" | "coefficients";
type EventGroupFilter = "all" | EventGroup;
type EventCategoryFilter = "all" | EventType;
type MonthDraft = CreateMonthPayload;
type DailyAdminMetricDraft = { fact: number; recommendations: number; omQualified: number };
type DailyAdminDraft = Record<City, Record<Metric, DailyAdminMetricDraft>>;
type SourceMetricDraft = Record<Metric, number>;
type ChartLinePoint = { x: number; y: number };
type ChartLineSegment = ChartLinePoint[];
type ChartLineRange = { top: number; height: number };
type DailyMetricKey = "leads" | "qualifiedLeads" | "sales";
type DailyForecastPoint = {
  date: string;
  dayLabel: string;
  fact: number | null;
  forecast: number | null;
  forecastMin: number | null;
  forecastMax: number | null;
  opening?: number | null;
  closing?: number | null;
  events: EventItem[];
};
type MetricDailyChartData = {
  metric: DailyMetricKey;
  sourceMetric: Metric;
  title: string;
  points: DailyForecastPoint[];
};
type MetricSummary = {
  metric: Metric;
  plan: number;
  fact: number;
  forecast: number | null;
  completion: number;
  deltaAbs: number;
  endValue: number;
  endLabel: string;
  dailyTarget: number;
  dailyLabel: string;
};
type SummaryStatus = { label: string; tone: "neutral" | "good" | "warning" | "danger" };

const storageKey = "weekly-report-local-v9";
const adminPasswordStorageKey = "weekly-report-admin-password";
const fallbackAdminPassword = "4412";
const legacyStorageKeys: string[] = [];
const legacySeedEventIds = new Set(["evt-1", "evt-2", "evt-3"]);
const effectLabels: Effect[] = ["положительный", "негативный", "неизвестно"];
const eventTypes: EventType[] = [
  "рекламные изменения",
  "сезонность",
  "праздники",
  "техработы",
  "конкуренты",
  "продуктовые изменения",
  "прочее",
];
const internalEventTypes: EventType[] = ["рекламные изменения", "техработы", "продуктовые изменения", "прочее"];
const adminCities: City[] = ["МСК", "СПБ", "сообщения"];
const cityLabels: Record<City, string> = {
  МСК: "МСК",
  СПБ: "СПБ",
  сообщения: "Сообщения",
};
const sourceRecordCity = "источники";
const sourceMetaChannelPrefix = "__source_meta__:";
const sourceMetaCommentActive = "[SOURCE_META=active]";
const sourceMetaCommentHidden = "[SOURCE_META=hidden]";
const defaultLeadSources = ["SEO", "Яндекс Карты", "2ГИС", "Гугл Карты", "Основные"];
const noLeadSourceOption = "__none__";
const otherLeadSourceOption = "другое";
const leadSourceCommentPattern = /\[LEAD_SOURCE=([^\]]+)\]/i;
const planRingItems: Array<{ metric: Metric; label: string; className: string; radius: number }> = [
  { metric: "Лиды", label: "Лиды", className: "leads", radius: 58 },
  { metric: "Квалы", label: "Квалы", className: "qualified", radius: 46 },
  { metric: "Продажи", label: "Продажи", className: "sales", radius: 34 },
];
const dailyChartMeta: Array<{ metric: DailyMetricKey; sourceMetric: Metric; title: string }> = [
  { metric: "leads", sourceMetric: "Лиды", title: "Лиды" },
  { metric: "qualifiedLeads", sourceMetric: "Квалы", title: "КВАЛ ОП" },
  { metric: "sales", sourceMetric: "Продажи", title: "Продажи" },
];
const coefficientWeekdays: Array<{ key: WeekdayCoefficientKey; label: string; dayIndex: number; defaultValue: number }> = [
  { key: "mon", label: "ПН", dayIndex: 1, defaultValue: 1.121 },
  { key: "tue", label: "ВТ", dayIndex: 2, defaultValue: 1.19 },
  { key: "wed", label: "СР", dayIndex: 3, defaultValue: 1.123 },
  { key: "thu", label: "ЧТ", dayIndex: 4, defaultValue: 1.063 },
  { key: "fri", label: "ПТ", dayIndex: 5, defaultValue: 0.883 },
  { key: "sat", label: "СБ", dayIndex: 6, defaultValue: 0.795 },
  { key: "sun", label: "ВС", dayIndex: 0, defaultValue: 0.825 },
];

export default function App() {
  const [apiEndpoint] = useState(getReportApiEndpoint);
  const apiConfigured = Boolean(apiEndpoint);
  const [initialState] = useState(loadInitialState);
  const latestRecordDateRef = useRef(getLatestActualRecordDate(initialState.records));
  const [monthConfigs, setMonthConfigs] = useState<MonthConfig[]>(initialState.monthConfigs);
  const [records, setRecords] = useState<DailyRecord[]>(initialState.records);
  const [events, setEvents] = useState<EventItem[]>(initialState.events);
  const [forecastCoefficients, setForecastCoefficients] = useState<ForecastCoefficients>(initialState.forecastCoefficients);
  const [mode, setMode] = useState<Mode>("allMonths");
  const [selectedMetric, setSelectedMetric] = useState<Metric>("Лиды");
  const [selectedMonthKey, setSelectedMonthKey] = useState(initialState.selectedMonthKey);
  const [selectedScope, setSelectedScope] = useState<ReportScope>("Все");
  const [trafficMode, setTrafficMode] = useState<TrafficMode>("op");
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [adminTab, setAdminTab] = useState<AdminTab>("day");
  const [eventGroupFilter, setEventGroupFilter] = useState<EventGroupFilter>("all");
  const [eventCategoryFilter, setEventCategoryFilter] = useState<EventCategoryFilter>("all");
  const [highlightedDailyEventId, setHighlightedDailyEventId] = useState<string | null>(null);
  const [auth, setAuth] = useState(loadAdminPassword);
  const [isSavingDaily, setIsSavingDaily] = useState(false);
  const [savedMessage, setSavedMessage] = useState(
    apiConfigured
      ? "Подключаю Google Sheets..."
      : "Локальный режим: изменения видны только в этом браузере и не обновляют общий сайт.",
  );
  const todayIso = useMemo(getTodayIso, []);
  const writePassword = auth.trim() || fallbackAdminPassword;

  useEffect(() => {
    saveAdminPassword(auth);
  }, [auth]);

  const selectedMonthConfig = useMemo(
    () => monthConfigs.find((config) => config.monthKey === selectedMonthKey) ?? monthConfigs[monthConfigs.length - 1] ?? monthConfig,
    [monthConfigs, selectedMonthKey],
  );
  const monthDates = useMemo(
    () => getMonthDates(selectedMonthConfig.year, selectedMonthConfig.monthIndex, selectedMonthConfig.daysInMonth),
    [selectedMonthConfig],
  );
  const automaticEvents = useMemo(() => buildAutomaticWeekEvents(monthConfigs), [monthConfigs]);
  const allEvents = useMemo(() => mergeEventLists(events, automaticEvents), [events, automaticEvents]);
  const currentMonthAllRecords = useMemo(
    () => records.filter((record) => record.date.startsWith(selectedMonthConfig.monthKey)),
    [records, selectedMonthConfig.monthKey],
  );
  const currentMonthSourceOptions = useMemo(
    () => getActiveLeadSources(currentMonthAllRecords),
    [currentMonthAllRecords],
  );
  const reportRecords = useMemo(() => filterRecordsByScope(records, selectedScope), [records, selectedScope]);
  const reportEvents = useMemo(() => filterEventsByScope(allEvents, selectedScope), [allEvents, selectedScope]);
  const currentMonthRecords = useMemo(
    () => reportRecords.filter((record) => record.date.startsWith(selectedMonthConfig.monthKey)),
    [reportRecords, selectedMonthConfig.monthKey],
  );
  const currentMonthEvents = useMemo(
    () => filterEventsForRange(reportEvents, monthDates[0], monthDates[monthDates.length - 1]),
    [reportEvents, monthDates],
  );
  const weeks = useMemo(
    () => applyOverallPlanOverrideToWeeks(
      buildWeeklySummary(currentMonthRecords, currentMonthEvents),
      selectedMonthConfig,
      selectedScope,
    ),
    [currentMonthRecords, currentMonthEvents, selectedMonthConfig, selectedScope],
  );
  const safeSelectedWeek = weeks.some((week) => week.week === selectedWeek) ? selectedWeek : weeks[0]?.week ?? 1;
  const activeWeek = weeks.find((week) => week.week === safeSelectedWeek) ?? weeks[0];
  const activeWeekDates = useMemo(
    () => monthDates.filter((date) => getWeekOfMonth(date) === safeSelectedWeek),
    [monthDates, safeSelectedWeek],
  );
  const activeWeekEvents = useMemo(
    () => activeWeek ? filterEventsForRange(reportEvents, activeWeek.startDate, activeWeek.endDate) : [],
    [activeWeek, reportEvents],
  );
  const metricTotals = useMemo(() => mergeTotals(weeks), [weeks]);
  const displayMetricTotals = useMemo(() => applyTrafficModeToTotals(metricTotals, trafficMode), [metricTotals, trafficMode]);
  const conversions = useMemo(() => buildConversions(metricTotals, trafficMode), [metricTotals, trafficMode]);
  const periodStatus = useMemo(() => getPeriodStatus(displayMetricTotals), [displayMetricTotals]);
  const monthTiming = useMemo(() => getMonthTiming(monthDates, todayIso), [monthDates, todayIso]);
  const allMonths = useMemo(
    () => buildOverallMonths(reportRecords, reportEvents, monthConfigs).map((month) => ({
      ...month,
      weeks: applyOverallPlanOverrideToWeeks(month.weeks, month.config, selectedScope),
    })),
    [reportRecords, reportEvents, monthConfigs, selectedScope],
  );
  const visibleEvents = useMemo(() => {
    if (mode === "week") return activeWeekEvents;
    if (mode === "month" || mode === "monthDaily") return currentMonthEvents;
    return reportEvents;
  }, [activeWeekEvents, currentMonthEvents, mode, reportEvents]);
  const pageCopy = getPageCopy(mode);

  useEffect(() => {
    saveLocalState({ monthConfigs, records, events, selectedMonthKey, forecastCoefficients });
  }, [monthConfigs, records, events, selectedMonthKey, forecastCoefficients]);

  useEffect(() => {
    latestRecordDateRef.current = getLatestActualRecordDate(records);
  }, [records]);

  useEffect(() => {
    let cancelled = false;

    async function loadFromPublicSheet() {
      try {
        const snapshot = await loadPublicSheetSnapshot(seedMonthConfigs);
        if (cancelled || !snapshot.records.length) return;

        setMonthConfigs(dedupeMonthConfigs(snapshot.monthConfigs.map(normalizeMonthConfig)));
        setRecords(mergePublicSheetRecords([], snapshot.records));
        if (snapshot.eventsLoaded) {
          setEvents(snapshot.events.map(normalizeEvent).filter((event) => event.source !== "system"));
        }
        latestRecordDateRef.current = snapshot.latestActualDate;
        setSavedMessage(
          snapshot.latestActualDate
            ? `Данные загружены напрямую из Google Sheets. Последний FACT: ${formatDay(snapshot.latestActualDate)}.`
            : "Данные загружены напрямую из Google Sheets.",
        );
      } catch (error) {
        if (!cancelled) {
          setSavedMessage(`Google-таблица пока не загрузилась напрямую: ${getErrorMessage(error)}. Показываю опубликованный снимок.`);
        }
      }
    }

    loadFromPublicSheet();
    const timer = window.setInterval(loadFromPublicSheet, 5 * 60 * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadForecastCoefficients() {
      try {
        const remoteCoefficients = await callReportApi<unknown>("getForecastCoefficients");
        if (!cancelled) {
          setForecastCoefficients(normalizeForecastCoefficients(remoteCoefficients));
        }
      } catch {
        // Коэффициенты не должны ломать общий отчет, если Apps Script пока старой версии.
      }
    }

    loadForecastCoefficients();
    return () => {
      cancelled = true;
    };
  }, []);

  function selectMonth(monthKey: string) {
    const config = monthConfigs.find((item) => item.monthKey === monthKey);
    if (!config) return;
    setSelectedMonthKey(monthKey);
    setSelectedWeek(1);
  }

  function openCreateMonth() {
    setAdminTab("month");
    setMode("admin");
  }

  function printCurrentPage() {
    window.print();
  }

  function mergeDailyValues(values: DailyValueUpdate[]) {
    const nextRecords = applyDailyValuesToRecords(records, values);
    setRecords(nextRecords);
    return nextRecords;
  }

  async function ensureRemoteMonth(monthKey: string, password: string) {
    const config = monthConfigs.find((item) => item.monthKey === monthKey);
    if (!config) return;

    const dailyAverageByCity = clonePlansByCity(config.dailyAverageByCity ?? estimateDailyAverageByCity(config, forecastCoefficients));
    const plansByCity = clonePlansByCity(
      config.plansByCity ?? buildMonthlyPlansFromDailyAverage(config.year, config.monthIndex, dailyAverageByCity, forecastCoefficients),
    );

    await callReportApi(
      "createMonth",
      {
        year: config.year,
        monthIndex: config.monthIndex,
        plansByCity,
        dailyAverageByCity,
      },
      password,
    );
  }

  async function persistDailyValues(values: DailyValueUpdate[], _localMessage: string) {
    const preparedValues = prepareDailyValuesForRemote(values, records);
    const hasInvalidValue = validateDailyValueUpdates(preparedValues);

    if (hasInvalidValue) {
      setSavedMessage("Не удалось сохранить данные. Проверьте подключение или формат значений.");
      return;
    }

    const sanitized = preparedValues.map(sanitizeDailyValueUpdate);

    if (!apiConfigured) {
      const nextRecords = mergeDailyValues(sanitized);
      const aggregateIssue = validateAggregates(nextRecords);
      setSavedMessage(aggregateIssue ?? "Сохранено только в этом браузере. У других людей не обновится, пока не подключен Apps Script.");
      return;
    }

    if (!writePassword) {
      setSavedMessage("Не удалось сохранить данные: нет пароля админки.");
      return;
    }

    setIsSavingDaily(true);
    setSavedMessage("Сохраняю день в Google Sheets...");
    try {
      const monthKey = sanitized[0]?.date.slice(0, 7);
      if (monthKey) {
        await ensureRemoteMonth(monthKey, writePassword);
      }
      await callReportApi("upsertDailyValues", { monthKey, records: sanitized }, writePassword);
      mergeDailyValues(sanitized);
      if (monthKey) {
        await verifySharedDailySave(sanitized);
      }

      setSavedMessage("Сохранено в общую Google-таблицу. Данные будут видны с любого компьютера.");
    } catch (error) {
      setSavedMessage(`Не удалось сохранить данные. Проверьте подключение или формат значений. ${getErrorMessage(error)}`);
    } finally {
      setIsSavingDaily(false);
    }
  }

  function updateDailyValues(values: DailyValueUpdate[], message = "День обновлен.") {
    return persistDailyValues(values, message);
  }

  function addEvent(event: EventItem) {
    const normalizedEvent = normalizeEvent(event);
    const isUpdate = events.some((item) => item.id === normalizedEvent.id);
    setEvents((current) => [normalizedEvent, ...current.filter((item) => item.id !== normalizedEvent.id)].sort(sortEvents));
    if (!apiConfigured) {
      setSavedMessage(isUpdate ? "Событие обновлено только в этом браузере." : "Событие добавлено только в этом браузере. Общий сайт не обновится без Apps Script.");
      return;
    }
    if (!writePassword) {
      setSavedMessage(isUpdate ? "Событие обновлено локально. Для записи в Google Sheets введите пароль админки." : "Событие добавлено локально. Для записи в Google Sheets введите пароль админки.");
      return;
    }
    ensureRemoteMonth(normalizedEvent.startDate.slice(0, 7), writePassword)
      .then(() => callReportApi("upsertEvent", { event: serializeEventForRemote(normalizedEvent) }, writePassword))
      .then(() => setSavedMessage(isUpdate ? "Событие обновлено в Google Sheets." : "Событие добавлено и сохранено в Google Sheets."))
      .catch((error) => setSavedMessage(`Событие локально сохранено, но Sheets вернул ошибку: ${getErrorMessage(error)}.`));
  }

  function deleteEvent(eventId: string) {
    const event = events.find((item) => item.id === eventId);
    if (!event || event.source === "system") return;

    setEvents((current) => current.filter((item) => item.id !== eventId));
    if (!apiConfigured) {
      setSavedMessage("Событие удалено только в этом браузере.");
      return;
    }
    if (!writePassword) {
      setSavedMessage("Событие удалено локально. Для удаления в Google Sheets введите пароль админки.");
      return;
    }
    callReportApi("deleteEvent", { id: eventId }, writePassword)
      .then(() => setSavedMessage("Событие удалено из Google Sheets."))
      .catch((error) => setSavedMessage(`Событие удалено локально, но Sheets вернул ошибку: ${getErrorMessage(error)}.`));
  }

  function updateForecastCoefficient(city: City, metric: Metric, weekday: WeekdayCoefficientKey, value: number) {
    setForecastCoefficients((current) => ({
      ...current,
      [city]: {
        ...current[city],
        [metric]: {
          ...current[city][metric],
          [weekday]: Math.max(0, Number(value) || 0),
        },
      },
    }));
  }

  async function persistForecastCoefficients() {
    if (!apiConfigured) {
      setSavedMessage("Коэффициенты сохранены только в этом браузере. Общий сайт не обновится без Apps Script.");
      return;
    }
    if (!writePassword) {
      setSavedMessage("Коэффициенты изменены локально. Для записи в Google Sheets введите пароль админки.");
      return;
    }

    try {
      await callReportApi("updateForecastCoefficients", { coefficients: forecastCoefficients }, writePassword);
      setSavedMessage("Коэффициенты прогноза сохранены в Google Sheets.");
    } catch (error) {
      setSavedMessage(`Коэффициенты изменены локально, но Sheets вернул ошибку: ${getErrorMessage(error)}.`);
    }
  }

  function createMonthFromPanel(draft: MonthDraft) {
    const dailyAverageByCity = clonePlansByCity(draft.dailyAverageByCity ?? estimateDailyAverageByCity(selectedMonthConfig, forecastCoefficients));
    const monthlyPlansByCity = buildMonthlyPlansFromDailyAverage(draft.year, draft.monthIndex, dailyAverageByCity, forecastCoefficients);
    const nextConfig = {
      ...createMonthConfig(draft.year, draft.monthIndex, combineReportPlan(monthlyPlansByCity), monthlyPlansByCity),
      dailyAverageByCity,
    };
    const exists = monthConfigs.some((config) => config.monthKey === nextConfig.monthKey);

    if (!exists) {
      setMonthConfigs((current) => [...current, nextConfig].sort((a, b) => a.monthKey.localeCompare(b.monthKey)));
      setRecords((current) => [...current, ...buildWeightedPlanRecordsForMonth(nextConfig, dailyAverageByCity, forecastCoefficients)]);
    }

    setSelectedMonthKey(nextConfig.monthKey);
    setSelectedWeek(1);
    setMode("admin");

    if (!apiConfigured) {
      setSavedMessage(exists ? `${nextConfig.label} уже есть, месяц открыт в панели.` : `${nextConfig.label} добавлен только в этом браузере. Общий сайт не обновится без Apps Script.`);
      return;
    }
    if (!writePassword) {
      setSavedMessage(`${nextConfig.label} подготовлен локально. Для создания в Google Sheets введите пароль админки.`);
      return;
    }

    callReportApi("createMonth", { ...draft, plansByCity: monthlyPlansByCity, dailyAverageByCity }, writePassword)
      .then(() => setSavedMessage(exists ? `${nextConfig.label} открыт в админке.` : `${nextConfig.label} создан в Google Sheets.`))
      .catch((error) => setSavedMessage(`${nextConfig.label} локально подготовлен, но Sheets вернул ошибку: ${getErrorMessage(error)}.`));
  }

  return (
    <div className="app-shell">
      <Sidebar
        mode={mode}
        setMode={setMode}
        auth={auth}
        setAuth={setAuth}
        writePassword={writePassword}
        apiConfigured={apiConfigured}
      />

      <main className="workspace">
        <Topbar
          title={pageCopy.title}
          subtitle={pageCopy.subtitle}
          monthConfigs={monthConfigs}
          selectedMonthKey={selectedMonthKey}
          selectedScope={selectedScope}
          trafficMode={trafficMode}
          todayIso={todayIso}
          selectMonth={selectMonth}
          setSelectedScope={setSelectedScope}
          setTrafficMode={setTrafficMode}
          onCreateMonth={openCreateMonth}
          onExport={printCurrentPage}
        />

        <section className="notice">
          <CheckCircle2 size={18} />
          {savedMessage}
        </section>

        <div className={mode === "events" || mode === "messages" || mode === "sources" || mode === "admin" ? "content-single" : "content-grid"}>
          <section className="main-panel">
            {mode === "allMonths" && (
              <AllMonthsDashboard
                months={allMonths}
                selectedMetric={selectedMetric}
                setSelectedMetric={setSelectedMetric}
                selectedScope={selectedScope}
                trafficMode={trafficMode}
                todayIso={todayIso}
                events={reportEvents}
              />
            )}
            {mode === "month" && (
              <MonthDashboard
                config={selectedMonthConfig}
                totals={displayMetricTotals}
                conversions={conversions}
                weeks={weeks}
                events={currentMonthEvents}
                monthDates={monthDates}
                monthTiming={monthTiming}
                status={periodStatus}
                selectedScope={selectedScope}
                trafficMode={trafficMode}
                todayIso={todayIso}
                months={monthConfigs}
                selectedMonthKey={selectedMonthKey}
                selectMonth={selectMonth}
                onCreateMonth={createMonthFromPanel}
                records={currentMonthRecords}
                forecastCoefficients={forecastCoefficients}
              />
            )}
            {mode === "monthDaily" && (
              <MonthDailyDashboard
                config={selectedMonthConfig}
                totals={displayMetricTotals}
                records={currentMonthRecords}
                events={currentMonthEvents}
                monthDates={monthDates}
                monthTiming={monthTiming}
                selectedScope={selectedScope}
                trafficMode={trafficMode}
                todayIso={todayIso}
                highlightedEventId={highlightedDailyEventId}
              />
            )}
            {mode === "week" && activeWeek && (
              <WeekDashboard
                weeks={weeks}
                selectedWeek={safeSelectedWeek}
                setSelectedWeek={setSelectedWeek}
                week={activeWeek}
                dates={activeWeekDates}
                records={currentMonthRecords}
                events={activeWeekEvents}
                selectedScope={selectedScope}
                trafficMode={trafficMode}
              />
            )}
            {mode === "messages" && (
              <MessagesDashboard records={records} selectedMonthKey={selectedMonthKey} />
            )}
            {mode === "sources" && (
              <SourcesDashboard
                records={currentMonthAllRecords}
                events={currentMonthEvents}
                selectedMonthConfig={selectedMonthConfig}
              />
            )}
            {mode === "events" && (
              <EventsDashboard
                dates={monthDates}
                events={allEvents}
                sourceOptions={currentMonthSourceOptions}
                selectedScope={selectedScope}
                groupFilter={eventGroupFilter}
                setGroupFilter={setEventGroupFilter}
                categoryFilter={eventCategoryFilter}
                setCategoryFilter={setEventCategoryFilter}
                onAdd={addEvent}
                onDelete={deleteEvent}
              />
            )}
            {mode === "admin" && (
              <AdminDashboard
                dates={monthDates}
                months={monthConfigs}
                selectedMonthKey={selectedMonthKey}
                selectedMonthConfig={selectedMonthConfig}
                records={currentMonthAllRecords}
                events={currentMonthEvents}
                sourceOptions={currentMonthSourceOptions}
                todayIso={todayIso}
                selectMonth={selectMonth}
                onCreateMonth={createMonthFromPanel}
                onSaveDailyValues={updateDailyValues}
                isSavingDaily={isSavingDaily}
                onAddEvent={addEvent}
                onDeleteEvent={deleteEvent}
                forecastCoefficients={forecastCoefficients}
                onUpdateForecastCoefficient={updateForecastCoefficient}
                onSaveForecastCoefficients={persistForecastCoefficients}
                tab={adminTab}
                setTab={setAdminTab}
              />
            )}
          </section>

          {mode === "monthDaily" && (
            <MonthDailyEventsPanel
              events={currentMonthEvents}
              highlightedEventId={highlightedDailyEventId}
              onHover={setHighlightedDailyEventId}
            />
          )}

          {mode !== "events" && mode !== "messages" && mode !== "admin" && mode !== "monthDaily" && (
            <EventsPanel
              title={mode === "week" ? "События недели" : mode === "month" ? "События месяца" : "События периода"}
              events={visibleEvents}
              onDelete={deleteEvent}
            />
          )}
        </div>
      </main>
    </div>
  );
}

function Sidebar({
  mode,
  setMode,
  auth,
  setAuth,
  writePassword,
  apiConfigured,
}: {
  mode: Mode;
  setMode: (mode: Mode) => void;
  auth: string;
  setAuth: (value: string) => void;
  writePassword: string;
  apiConfigured: boolean;
}) {
  const items: Array<{ mode: Mode; label: string; icon: React.ReactNode }> = [
    { mode: "allMonths", label: "Все месяцы", icon: <BarChart3 /> },
    { mode: "month", label: "Обзор месяца", icon: <LayoutDashboard /> },
    { mode: "monthDaily", label: "Месяц по дням", icon: <TrendingUp /> },
    { mode: "week", label: "Неделя", icon: <CalendarDays /> },
    { mode: "admin", label: "Админка", icon: <Save /> },
    { mode: "sources", label: "Источники", icon: <Target /> },
    { mode: "messages", label: "Сообщения", icon: <MessageSquare /> },
    { mode: "events", label: "События", icon: <TriangleAlert /> },
  ];

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-logo">
          <img src="./assets/rectop-logo.png" alt="RECTOP" />
        </div>
        <span>Weekly Report System</span>
      </div>

      <nav>
        {items.map((item) => (
          <button
            key={item.mode}
            className={mode === item.mode ? "nav-button active" : "nav-button"}
            onClick={() => setMode(item.mode)}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </nav>

      <div className="sidebar-card">
        <div className="sidebar-card-title">
          <KeyRound size={16} />
          Доступ
        </div>
        <input
          value={auth}
          onChange={(event) => setAuth(event.target.value)}
          type="password"
          placeholder="Пароль админки"
        />
        <span className={apiConfigured ? (writePassword ? "status good" : "status muted") : "status warning"}>
          {!apiConfigured
            ? "Только этот браузер: общий сайт не обновится"
            : writePassword
              ? "Общая запись включена"
              : "Google Sheets подключен, нужен пароль"}
        </span>
      </div>

      <button className="ghost-button" type="button" onClick={() => setMode("admin")}>
        <Settings size={16} />
        Настройки
      </button>
    </aside>
  );
}

function Topbar({
  title,
  subtitle,
  monthConfigs,
  selectedMonthKey,
  selectedScope,
  trafficMode,
  todayIso,
  selectMonth,
  setSelectedScope,
  setTrafficMode,
  onCreateMonth,
  onExport,
}: {
  title: string;
  subtitle: string;
  monthConfigs: MonthConfig[];
  selectedMonthKey: string;
  selectedScope: ReportScope;
  trafficMode: TrafficMode;
  todayIso: string;
  selectMonth: (monthKey: string) => void;
  setSelectedScope: (scope: ReportScope) => void;
  setTrafficMode: (mode: TrafficMode) => void;
  onCreateMonth: () => void;
  onExport: () => void;
}) {
  return (
    <header className="topbar">
      <div>
        <div className="system-label"><i /> RECTOP VISUAL SYSTEM</div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>

      <div className="topbar-actions">
        <label className="month-select-wrap">
          <select value={selectedMonthKey} onChange={(event) => selectMonth(event.target.value)}>
            {monthConfigs.map((config) => (
              <option key={config.monthKey} value={config.monthKey}>{config.label}</option>
            ))}
          </select>
          <ChevronDown size={16} />
        </label>
        <CityToggle value={selectedScope} onChange={setSelectedScope} />
        <TrafficToggle value={trafficMode} onChange={setTrafficMode} />
        <span className="updated-pill">обновлено {formatDay(todayIso)}</span>
        <button className="select-button" type="button" onClick={onExport}>
          <Download size={16} />
          Экспорт
        </button>
        <button className="primary-button" type="button" onClick={onCreateMonth}>
          <Plus size={16} />
          Создать месяц
        </button>
      </div>
    </header>
  );
}

function CityToggle({ value, onChange }: { value: ReportScope; onChange: (value: ReportScope) => void }) {
  return (
    <div className="city-toggle" aria-label="Город">
      {reportScopes.map((scope) => (
        <button key={scope} className={value === scope ? "selected" : ""} onClick={() => onChange(scope)} type="button">
          {scope}
        </button>
      ))}
    </div>
  );
}

function AllMonthsDashboard({
  months,
  selectedMetric,
  setSelectedMetric,
  selectedScope,
  trafficMode,
  todayIso,
  events,
}: {
  months: Array<{ config: MonthConfig; dates: string[]; events: EventItem[]; weeks: WeekSummary[] }>;
  selectedMetric: Metric;
  setSelectedMetric: (metric: Metric) => void;
  selectedScope: ReportScope;
  trafficMode: TrafficMode;
  todayIso: string;
  events: EventItem[];
}) {
  const rawTotals = mergeTotals(months.flatMap((month) => month.weeks));
  const totals = applyTrafficModeToTotals(rawTotals, trafficMode);
  const status = getPeriodStatus(totals);
  const insights = buildAttentionItems(totals, events);
  const worstMonth = pickMonthByCompletion(months, "worst", trafficMode);
  const monthRange = getMonthRangeLabel(months);

  return (
    <div className="page-stack">
      <ExecutiveSummary
        status={status}
        eyebrow=""
        title="Динамика по месяцам"
        subtitle="Сравнение план-факт и прогноза Optima по месяцам"
        facts={[
          `Город: ${selectedScope === "Все" ? "МСК + СПБ" : selectedScope}`,
          `Режим: ${trafficMode === "marketing" ? "маркетинговый КВАЛ" : "КВАЛ ОП"}`,
          `Период: ${monthRange}`,
          `Зона риска: ${worstMonth}`,
          `Событий в периоде: ${events.length}`,
        ]}
      />

      <div className="weekly-sync-grid dashboard-weekly-grid">
        {metrics.map((metric) => (
          <MetricMonthCard key={metric} metric={metric} months={months} trafficMode={trafficMode} />
        ))}
      </div>

      <section className="analytics-panel">
        <PanelHead
          title="Недельная лента всех месяцев"
          description="Факт показан синими столбиками, прогноз Optima - пунктирной линией."
        >
          <MetricSelect value={selectedMetric} onChange={setSelectedMetric} />
        </PanelHead>
        <ContinuousDashboardChart months={months} metric={selectedMetric} todayIso={todayIso} trafficMode={trafficMode} />
      </section>

      <MonthMatrix months={months} trafficMode={trafficMode} />
      <InsightPanel items={insights} />
    </div>
  );
}

function MonthDashboard({
  config,
  totals,
  conversions,
  weeks,
  events,
  monthDates,
  monthTiming,
  status,
  selectedScope,
  trafficMode,
  todayIso,
  months,
  selectedMonthKey,
  selectMonth,
  onCreateMonth,
  records,
  forecastCoefficients,
}: {
  config: MonthConfig;
  totals: MetricTotals;
  conversions: ReturnType<typeof buildConversions>;
  weeks: WeekSummary[];
  events: EventItem[];
  monthDates: string[];
  monthTiming: ReturnType<typeof getMonthTiming>;
  status: ReturnType<typeof getPeriodStatus>;
  selectedScope: ReportScope;
  trafficMode: TrafficMode;
  todayIso: string;
  months: MonthConfig[];
  selectedMonthKey: string;
  selectMonth: (monthKey: string) => void;
  onCreateMonth: (draft: MonthDraft) => void;
  records: DailyRecord[];
  forecastCoefficients: ForecastCoefficients;
}) {
  const monthForecast = buildMonthEndForecast(
    records,
    monthDates,
    monthTiming.isClosed,
    forecastCoefficients,
    selectedScope === "Все" ? config.plan : undefined,
    trafficMode,
  );
  const summaries = metrics.map((metric) =>
    buildMetricSummary(metric, totals[metric], monthDates, todayIso, monthTiming.isClosed, monthForecast.metrics[metric].projected),
  );
  const insights = buildAttentionItems(totals, events);

  return (
    <div className="page-stack">
      <ExecutiveSummary
        status={status}
        eyebrow={config.label}
        title={monthTiming.isClosed ? "Месяц завершен" : "Месяц в работе"}
        facts={[
          `Прошло дней: ${monthTiming.passed}`,
          `Осталось дней: ${monthTiming.left}`,
          `Город: ${selectedScope === "Все" ? "МСК + СПБ" : selectedScope}`,
          `Режим: ${trafficMode === "marketing" ? "маркетинговый КВАЛ" : "КВАЛ ОП"}`,
          `Событий: ${events.length}`,
        ]}
      />

      <MetricKpiStrip totals={totals} isClosedMonth={monthTiming.isClosed} summaries={summaries} trafficMode={trafficMode} />
      <MonthEndForecastPanel projection={monthForecast} trafficMode={trafficMode} />
      <PlanCompletionWidget totals={totals} periodLabel="План месяца" trafficMode={trafficMode} />
      <RecommendationWeekPanel weeks={weeks} />

      <ConversionCards conversions={conversions} trafficMode={trafficMode} />

      <section className="analytics-panel">
        <PanelHead
          title="Динамика по неделям"
          description="Три графика используют одну шкалу: факт по столбикам, прогноз Optima пунктиром и события под неделями."
        />
        <div className="weekly-sync-grid">
          {metrics.map((metric) => (
            <MetricWeekCard
              key={metric}
              metric={metric}
              weeks={weeks}
              todayIso={todayIso}
              trafficMode={trafficMode}
            />
          ))}
        </div>
      </section>

      <PlanNeedGrid summaries={summaries} />
      <InsightPanel items={insights} />
    </div>
  );
}

function TrafficToggle({ value, onChange }: { value: TrafficMode; onChange: (value: TrafficMode) => void }) {
  const options: Array<{ value: TrafficMode; label: string }> = [
    { value: "op", label: "Трафик ОП" },
    { value: "marketing", label: "Трафик маркетинг" },
  ];

  return (
    <div className="city-toggle traffic-toggle" aria-label="Режим трафика">
      {options.map((option) => (
        <button
          key={option.value}
          className={value === option.value ? "selected" : ""}
          onClick={() => onChange(option.value)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function MonthDailyDashboard({
  config,
  totals,
  records,
  events,
  monthDates,
  monthTiming,
  selectedScope,
  trafficMode,
  todayIso,
  highlightedEventId,
}: {
  config: MonthConfig;
  totals: MetricTotals;
  records: DailyRecord[];
  events: EventItem[];
  monthDates: string[];
  monthTiming: ReturnType<typeof getMonthTiming>;
  selectedScope: ReportScope;
  trafficMode: TrafficMode;
  todayIso: string;
  highlightedEventId: string | null;
}) {
  const dailyCharts = dailyChartMeta.map((meta) => buildMetricDailyChartData(meta, records, events, monthDates, todayIso, trafficMode));
  const summaries = metrics.map((metric) => buildMetricSummary(metric, totals[metric], monthDates, todayIso, monthTiming.isClosed));
  const status = getPeriodStatus(totals);

  return (
    <div className="page-stack month-daily-dashboard">
      <ExecutiveSummary
        status={status}
        eyebrow={`${config.label} · ${selectedScope === "Все" ? "МСК + СПБ" : selectedScope} · обновлено ${formatDay(todayIso)}`}
        title="Факт и прогноз по дням выбранного месяца"
        subtitle="Дневная динамика факта, прогнозный коридор Optima и события по датам."
        facts={[
          `Дней в месяце: ${monthDates.length}`,
          `Прошло дней: ${monthTiming.passed}`,
          `Режим: ${trafficMode === "marketing" ? "маркетинговый КВАЛ" : "КВАЛ ОП"}`,
          `Событий месяца: ${events.length}`,
          monthTiming.isClosed ? "Месяц завершен" : `Осталось дней: ${monthTiming.left}`,
        ]}
      />

      <section className="daily-kpi-summary" aria-label="Краткие показатели месяца по дням">
        {summaries.map((summary) => (
          <article key={summary.metric} className="daily-kpi-card">
            <span>{summary.metric === "Квалы" ? (trafficMode === "marketing" ? "КВАЛ маркетинг" : "КВАЛ ОП") : summary.metric}</span>
            <strong>{formatNumber(summary.fact)}</strong>
            <div>
              <small>Optima {summary.forecast === null ? "скрыт" : formatNumber(summary.forecast)}</small>
              <small>{summary.completion}% плана</small>
            </div>
            <em className={summary.deltaAbs >= 0 ? "positive" : "negative"}>
              {summary.deltaAbs >= 0 ? "+" : ""}{formatNumber(summary.deltaAbs)} к плану
            </em>
          </article>
        ))}
      </section>

      <section className="daily-charts-stack">
        {dailyCharts.map((chart) => (
          <DailyForecastChart key={chart.metric} data={chart} highlightedEventId={highlightedEventId} />
        ))}
      </section>
    </div>
  );
}

function DailyForecastChart({
  data,
  highlightedEventId,
}: {
  data: MetricDailyChartData;
  highlightedEventId: string | null;
}) {
  const chartWidth = Math.max(900, data.points.length * 46 + 84);
  const svgHeight = 336;
  const plot = { left: 54, right: 24, top: 28, height: 226, bottom: 50 };
  const plotWidth = chartWidth - plot.left - plot.right;
  const xForIndex = (index: number) => plot.left + (data.points.length <= 1 ? plotWidth / 2 : (plotWidth / (data.points.length - 1)) * index);
  const numericValues = data.points.flatMap((point) => [
    point.fact ?? 0,
    point.forecast ?? 0,
    point.forecastMin ?? 0,
    point.forecastMax ?? 0,
  ]);
  const chartMax = getNiceAxisMax(Math.max(...numericValues, 1) * 1.12);
  const yForValue = (value: number) => plot.top + plot.height - (Math.max(value, 0) / chartMax) * plot.height;
  const axisLabels = getAxisLabels(chartMax);
  const forecastMinPaths = buildDailyPathSegments(data.points, (point, index) =>
    point.forecastMin === null ? null : { x: xForIndex(index), y: yForValue(point.forecastMin) },
  );
  const forecastMaxPaths = buildDailyPathSegments(data.points, (point, index) =>
    point.forecastMax === null ? null : { x: xForIndex(index), y: yForValue(point.forecastMax) },
  );
  const factPaths = buildDailyPathSegments(data.points, (point, index) =>
    point.fact === null ? null : { x: xForIndex(index), y: yForValue(point.fact) },
  );
  const corridorPaths = buildDailyAreaSegments(data.points, (point, index) => {
    if (point.forecastMin === null || point.forecastMax === null) return null;
    return {
      x: xForIndex(index),
      minY: yForValue(point.forecastMin),
      maxY: yForValue(point.forecastMax),
    };
  });
  const chartEvents = uniqueEvents(data.points.flatMap((point) => point.events));
  const eventRanges = chartEvents
    .map((event) => getEventRangeOnDailyChart(event, data.points, xForIndex))
    .filter((range): range is { event: EventItem; x: number; width: number } => Boolean(range));

  return (
    <article className="daily-forecast-card">
      <div className="daily-chart-head">
        <div>
          <span className="chart-eyebrow">график по дням</span>
          <h2>{data.title}</h2>
        </div>
        <div className="daily-chart-legend">
          <span><i className="legend-dot fact" /> Факт</span>
          <span><i className="legend-line optima" /> Границы Optima</span>
          <span><i className="legend-corridor" /> Коридор</span>
        </div>
      </div>

      <div className="daily-chart-scroll">
        <div className="daily-chart-inner" style={{ minWidth: `${chartWidth}px` }}>
          <svg viewBox={`0 0 ${chartWidth} ${svgHeight}`} aria-hidden="true">
            {axisLabels.map((label) => {
              const y = yForValue(label);
              return (
                <g key={label} className="daily-grid-line">
                  <line x1={plot.left} x2={chartWidth - plot.right} y1={y} y2={y} />
                  <text x={plot.left - 12} y={y + 4}>{formatNumber(label)}</text>
                </g>
              );
            })}

            {eventRanges.map((range) => (
              <rect
                key={range.event.id}
                className={`daily-event-range ${effectClass(range.event.actualEffect)} ${highlightedEventId === range.event.id ? "highlighted" : ""}`}
                x={range.x}
                y={plot.top}
                width={range.width}
                height={plot.height}
                rx="8"
              />
            ))}

            {corridorPaths.map((path, index) => <path key={index} className="daily-corridor-area" d={path} />)}
            {forecastMinPaths.map((path, index) => <path key={`min-${index}`} className="daily-forecast-boundary" d={path} />)}
            {forecastMaxPaths.map((path, index) => <path key={`max-${index}`} className="daily-forecast-boundary" d={path} />)}
            {factPaths.map((path, index) => <path key={`fact-${index}`} className="daily-fact-line" d={path} />)}

            {data.points.map((point, index) => {
              const x = xForIndex(index);
              return (
                <g key={point.date}>
                  {point.fact !== null && <circle className="daily-fact-point" cx={x} cy={yForValue(point.fact)} r="4.2" />}
                  <text className="daily-x-label" x={x} y={svgHeight - 18}>{point.dayLabel}</text>
                </g>
              );
            })}
          </svg>

          <div className="daily-hit-layer" aria-hidden="true">
            {data.points.map((point, index) => {
              const x = xForIndex(index);
              return (
                <div
                  key={point.date}
                  className="daily-point-hit"
                  style={{ left: `${x - 18}px` }}
                  data-tooltip={dailyPointTooltip(point)}
                >
                  <span className="daily-event-markers">
                    {point.events.slice(0, 3).map((event) => (
                      <i
                        key={event.id}
                        className={`${effectClass(event.actualEffect)} ${highlightedEventId === event.id ? "highlighted" : ""}`}
                      />
                    ))}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </article>
  );
}

function WeekDashboard({
  weeks,
  selectedWeek,
  setSelectedWeek,
  week,
  dates,
  records,
  events,
  selectedScope,
  trafficMode,
}: {
  weeks: WeekSummary[];
  selectedWeek: number;
  setSelectedWeek: (week: number) => void;
  week: WeekSummary;
  dates: string[];
  records: DailyRecord[];
  events: EventItem[];
  selectedScope: ReportScope;
  trafficMode: TrafficMode;
}) {
  const totals = applyTrafficModeToTotals(week.totals, trafficMode);
  const conversions = buildConversions(week.totals, trafficMode);
  const status = getPeriodStatus(totals);
  const insights = buildAttentionItems(totals, events);

  return (
    <div className="page-stack">
      <ExecutiveSummary
        status={status}
        eyebrow={`${week.week} неделя · ${formatDay(week.startDate)} - ${formatDay(week.endDate)}`}
        title="Где внутри недели началось отклонение"
        facts={[
          `Город: ${selectedScope === "Все" ? "МСК + СПБ" : selectedScope}`,
          `Режим: ${trafficMode === "marketing" ? "маркетинговый КВАЛ" : "КВАЛ ОП"}`,
          `Дней в неделе: ${dates.length}`,
          `Событий: ${events.length}`,
          `Лид → квал: ${conversions.leadToQualified}%`,
        ]}
      />

      <div className="week-selector-row">
        <label>
          Неделя
          <select value={selectedWeek} onChange={(event) => setSelectedWeek(Number(event.target.value))}>
            {weeks.map((item) => (
              <option key={item.week} value={item.week}>
                {item.week} неделя · {formatDay(item.startDate)} - {formatDay(item.endDate)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <MetricKpiStrip totals={totals} isClosedMonth trafficMode={trafficMode} />
      <PlanCompletionWidget totals={totals} periodLabel="План недели" trafficMode={trafficMode} />

      <div className="dashboard-two-cols">
        <DailyWeekEditor dates={dates} records={records} trafficMode={trafficMode} />
        <ConversionCards conversions={conversions} trafficMode={trafficMode} />
      </div>

      <InsightPanel items={insights} />
    </div>
  );
}

function MessagesDashboard({ records, selectedMonthKey }: { records: DailyRecord[]; selectedMonthKey: string }) {
  const messageRecords = records.filter((record) => record.city === "сообщения" && record.date.startsWith(selectedMonthKey));
  const totals = buildMetricTotals(messageRecords, metrics);
  return (
    <div className="page-stack">
      <ExecutiveSummary
        status={getPeriodStatus(totals)}
        eyebrow="Отдельная логика сообщений"
        title="Сообщения"
        facts={["План", "Факт", "Прогноз Optima", "Динамика"]}
      />
      <MetricKpiStrip totals={totals} isClosedMonth={false} />
      <section className="messages-placeholder">
        <div className="placeholder-icon"><MessageSquare size={28} /></div>
        <h2>Панель сообщений подготовлена</h2>
        <p>Данные сообщений вынесены отдельно от лидов. Подробные поля и связь с продажами добавим после следующего ТЗ.</p>
      </section>
    </div>
  );
}

function SourcesDashboard({
  records,
  events,
  selectedMonthConfig,
}: {
  records: DailyRecord[];
  events: EventItem[];
  selectedMonthConfig: MonthConfig;
}) {
  const activeSources = useMemo(() => getActiveLeadSources(records), [records]);
  const sourceTotals = useMemo(() => activeSources.map((source) => ({
    source,
    totals: getSourceMetricTotals(records, source),
  })), [activeSources, records]);
  const sourceTotalsMax = useMemo(
    () => Math.max(1, ...sourceTotals.flatMap((item) => metrics.map((metric) => item.totals[metric]))),
    [sourceTotals],
  );
  const summaryTotals = metrics.reduce<Record<Metric, number>>((acc, metric) => {
    acc[metric] = sourceTotals.reduce((sum, item) => sum + item.totals[metric], 0);
    return acc;
  }, {} as Record<Metric, number>);
  const sourceEvents = events.filter((event) => Boolean(normalizeSourceName(event.leadSource ?? "")));
  const strongestMetric = metrics.reduce((best, metric) => (summaryTotals[metric] > summaryTotals[best] ? metric : best), "Лиды" as Metric);
  const strongestSource = sourceTotals
    .map((item) => ({ source: item.source, value: item.totals[strongestMetric] }))
    .sort((a, b) => b.value - a.value)[0];

  return (
    <div className="page-stack sources-dashboard">
      <ExecutiveSummary
        status={{ label: "отдельный слой", tone: "good" }}
        eyebrow={selectedMonthConfig.label}
        title="Дашборд источников"
        facts={[
          "Отдельно от МСК + СПБ",
          "Отдельно от сообщений",
          `Источников: ${activeSources.length}`,
          `Событий с источником: ${sourceEvents.length}`,
        ]}
      />

      <section className="source-kpi-strip">
        {metrics.map((metric) => (
          <article key={metric}>
            <span>{metric === "Квалы" ? "КВАЛ" : metric}</span>
            <strong>{formatNumber(summaryTotals[metric])}</strong>
            <small>итог по активным источникам месяца</small>
          </article>
        ))}
      </section>

      <section className="analytics-panel source-dashboard-panel">
        <PanelHead
          title="Разрез по метрикам"
          description="Для каждого показателя видно, какой источник дает основной вклад в выбранном месяце."
        />
        <div className="source-dashboard-grid">
          {metrics.map((metric) => (
            <SourceMetricBreakdownCard
              key={metric}
              metric={metric}
              sourceTotals={sourceTotals}
            />
          ))}
        </div>
      </section>

      <section className="analytics-panel">
        <PanelHead
          title="Итоги по источникам"
          description={strongestSource?.value ? `Самый сильный источник по ${strongestMetric.toLowerCase()}: ${strongestSource.source}.` : "Пока нет FACT по источникам за выбранный месяц."}
        />
        <div className="source-summary-grid">
          {sourceTotals.map((item) => (
            <article key={item.source} className="source-summary-card">
              <strong>{item.source}</strong>
              <div>
                {metrics.map((metric) => (
                  <span key={metric}>
                    <small>{metric === "Квалы" ? "КВАЛ" : metric}</small>
                    <b>{formatNumber(item.totals[metric])}</b>
                    <i className="source-mini-bar" aria-hidden="true">
                      <em style={{ width: `${Math.round((item.totals[metric] / sourceTotalsMax) * 100)}%` }} />
                    </i>
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="analytics-panel source-events-panel">
        <PanelHead title="События, привязанные к источникам" description="Показываем только события, где заполнено необязательное поле источника." />
        <div className="source-event-list">
          {sourceEvents.length === 0 && <p className="empty-state">Событий с привязкой к источнику пока нет.</p>}
          {sourceEvents.map((event) => <EventCard key={event.id} event={event} />)}
        </div>
      </section>
    </div>
  );
}

function SourceMetricBreakdownCard({
  metric,
  sourceTotals,
}: {
  metric: Metric;
  sourceTotals: Array<{ source: string; totals: Record<Metric, number> }>;
}) {
  const rows = [...sourceTotals].sort((a, b) => b.totals[metric] - a.totals[metric]);
  const metricMax = Math.max(1, ...rows.map((item) => item.totals[metric]));
  const totalValue = rows.reduce((sum, item) => sum + item.totals[metric], 0);

  return (
    <article className="source-breakdown-card">
      <div className="source-breakdown-head">
        <span>{metric === "Квалы" ? "КВАЛ" : metric}</span>
        <strong>{formatNumber(totalValue)}</strong>
      </div>
      <div className="source-breakdown-list">
        {rows.map((item) => {
          const value = item.totals[metric];
          const width = Math.round((value / metricMax) * 100);
          return (
            <div className="source-breakdown-row" key={item.source}>
              <span>{item.source}</span>
              <i aria-hidden="true"><em style={{ width: `${width}%` }} /></i>
              <strong>{formatNumber(value)}</strong>
            </div>
          );
        })}
      </div>
    </article>
  );
}

function SourceAdminPanel({
  records,
  selectedMonthConfig,
  monthDates,
  onSaveDailyValues,
  isSavingDaily,
}: {
  records: DailyRecord[];
  selectedMonthConfig: MonthConfig;
  monthDates: string[];
  onSaveDailyValues: (values: DailyValueUpdate[], message?: string) => Promise<void>;
  isSavingDaily: boolean;
}) {
  const firstDate = monthDates[0] ?? `${selectedMonthConfig.monthKey}-01`;
  const [selectedDate, setSelectedDate] = useState(firstDate);
  const [newSourceName, setNewSourceName] = useState("");
  const activeSources = useMemo(() => getActiveLeadSources(records), [records]);
  const [draft, setDraft] = useState<Record<string, SourceMetricDraft>>(() => createSourceDraft(records, selectedDate, activeSources));

  useEffect(() => {
    if (!monthDates.includes(selectedDate)) {
      setSelectedDate(firstDate);
    }
  }, [firstDate, monthDates, selectedDate]);

  useEffect(() => {
    setDraft(createSourceDraft(records, selectedDate, activeSources));
  }, [activeSources, records, selectedDate]);

  function updateSourceValue(source: string, metric: Metric, value: number) {
    setDraft((current) => ({
      ...current,
      [source]: {
        ...(current[source] ?? emptySourceMetricDraft()),
        [metric]: Math.max(0, Number(value) || 0),
      },
    }));
  }

  async function saveSourceDay() {
    const values = activeSources.flatMap((source) =>
      metrics.map((metric) => sourceDailyUpdate(selectedDate, source, metric, draft[source]?.[metric] ?? 0)),
    );
    await onSaveDailyValues(values, `Источники за ${formatDay(selectedDate)} сохранены.`);
  }

  async function addSource() {
    const source = normalizeSourceName(newSourceName);
    if (!source || activeSources.some((item) => sourceNameEquals(item, source))) return;
    await onSaveDailyValues([sourceMetaUpdate(firstDate, source, true)], `Источник ${source} добавлен.`);
    setNewSourceName("");
  }

  async function hideSource(source: string) {
    if (defaultLeadSources.some((item) => sourceNameEquals(item, source))) return;
    await onSaveDailyValues([sourceMetaUpdate(firstDate, source, false)], `Источник ${source} скрыт.`);
  }

  return (
    <section className="analytics-panel source-editor-panel">
      <PanelHead
        title="Источники"
        description="Ввод лидов, КВАЛ и продаж по каналам привлечения. Эти данные не смешиваются с городами и сообщениями."
      />
      <div className="source-toolbar">
        <label>
          Дата
          <select value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)}>
            {monthDates.map((date) => (
              <option key={date} value={date}>{formatDay(date)} · {weekdayLabel(date)}</option>
            ))}
          </select>
        </label>
        <div className="source-add">
          <input
            type="text"
            value={newSourceName}
            onChange={(event) => setNewSourceName(event.target.value)}
            placeholder="Новый источник"
            aria-label="Новый источник"
          />
          <button className="select-button" type="button" onClick={addSource} disabled={!normalizeSourceName(newSourceName) || isSavingDaily}>
            <Plus size={16} />
            Добавить
          </button>
        </div>
      </div>

      <div className="source-table">
        <div className="source-row source-head">
          <span>Источник</span>
          {metrics.map((metric) => <span key={metric}>{metric === "Квалы" ? "КВАЛ" : metric}</span>)}
          <span>Действие</span>
        </div>
        {activeSources.map((source) => (
          <div className="source-row" key={source}>
            <strong>{source}</strong>
            {metrics.map((metric) => (
              <label className="compact-input" key={metric}>
                <input
                  type="number"
                  min="0"
                  value={draft[source]?.[metric] ?? 0}
                  onChange={(event) => updateSourceValue(source, metric, Number(event.target.value))}
                  aria-label={`${source} ${metric}`}
                />
              </label>
            ))}
            <button
              className="icon-button"
              type="button"
              onClick={() => hideSource(source)}
              disabled={defaultLeadSources.some((item) => sourceNameEquals(item, source)) || isSavingDaily}
              aria-label={`Скрыть источник ${source}`}
              title={defaultLeadSources.some((item) => sourceNameEquals(item, source)) ? "Базовый источник остается в списке" : "Скрыть источник"}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>

      <button className="primary-button source-save" type="button" onClick={saveSourceDay} disabled={isSavingDaily || !activeSources.length}>
        <Save size={16} />
        {isSavingDaily ? "Сохраняю..." : "Сохранить источники"}
      </button>
    </section>
  );
}

function EventsDashboard({
  dates,
  events,
  sourceOptions,
  selectedScope,
  groupFilter,
  setGroupFilter,
  categoryFilter,
  setCategoryFilter,
  onAdd,
  onDelete,
}: {
  dates: string[];
  events: EventItem[];
  sourceOptions: string[];
  selectedScope: ReportScope;
  groupFilter: EventGroupFilter;
  setGroupFilter: (value: EventGroupFilter) => void;
  categoryFilter: EventCategoryFilter;
  setCategoryFilter: (value: EventCategoryFilter) => void;
  onAdd: (event: EventItem) => void;
  onDelete: (eventId: string) => void;
}) {
  const [selectedDate, setSelectedDate] = useState(dates[0] ?? getTodayIso());
  const [editingEvent, setEditingEvent] = useState<EventItem | null>(null);
  const scopedEvents = filterEventsByScope(events, selectedScope);
  const filteredEvents = scopedEvents.filter((event) => {
    const groupMatch = groupFilter === "all" || event.group === groupFilter;
    const categoryMatch = categoryFilter === "all" || event.type === categoryFilter;
    return groupMatch && categoryMatch;
  });
  const selectedDayEvents = filteredEvents.filter((event) => event.startDate <= selectedDate && selectedDate <= event.endDate);

  useEffect(() => {
    if (!dates.length || dates.includes(selectedDate)) return;
    setSelectedDate(dates[0]);
  }, [dates, selectedDate]);

  return (
    <div className="page-stack">
      <ExecutiveSummary
        status={{ label: "карта факторов", tone: "good" }}
        eyebrow="События не доказывают причину, а показывают совпадения по датам"
        title="Карта событий"
        facts={[
          `Всего событий: ${filteredEvents.length}`,
          `Город: ${selectedScope === "Все" ? "МСК + СПБ" : selectedScope}`,
          "Дата или период",
          "Внутренние и внешние факторы",
        ]}
      />

      <section className="event-filter-panel">
        <label>
          Тип
          <select value={groupFilter} onChange={(event) => setGroupFilter(event.target.value as EventGroupFilter)}>
            <option value="all">все</option>
            <option value="internal">внутренние</option>
            <option value="external">внешние</option>
          </select>
        </label>
        <label>
          Категория
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as EventCategoryFilter)}>
            <option value="all">все категории</option>
            {eventTypes.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </label>
      </section>

      <div className="events-layout">
        <div className="event-calendar-column">
          <EventCalendar dates={dates} events={filteredEvents} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
          <SelectedDayEvents selectedDate={selectedDate} events={selectedDayEvents} onDelete={onDelete} onEdit={setEditingEvent} />
        </div>
        <EventForm
          dates={dates}
          selectedDate={selectedDate}
          sourceOptions={sourceOptions}
          editingEvent={editingEvent}
          onCancelEdit={() => setEditingEvent(null)}
          onSave={(event) => {
            onAdd(event);
            setEditingEvent(null);
          }}
        />
      </div>
    </div>
  );
}

function ExecutiveSummary({
  status,
  eyebrow,
  title,
  subtitle,
  facts,
}: {
  status: SummaryStatus;
  eyebrow: string;
  title: string;
  subtitle?: string;
  facts: string[];
}) {
  return (
    <section className={`executive-summary ${status.tone}`}>
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {status.label && <strong>{status.label}</strong>}
      <div className="summary-facts">
        {facts.map((fact) => <span key={fact}>{fact}</span>)}
      </div>
    </section>
  );
}

function MetricKpiStrip({
  totals,
  isClosedMonth,
  summaries,
  trafficMode = "op",
}: {
  totals: MetricTotals;
  isClosedMonth: boolean;
  summaries?: MetricSummary[];
  trafficMode?: TrafficMode;
}) {
  return (
    <section className="kpi-strip">
      {metrics.map((metric) => {
        const item = totals[metric];
        const summary = summaries?.find((entry) => entry.metric === metric);
        const completion = summary?.completion ?? percent(item.fact, item.plan);
        const deltaAbs = item.fact - item.plan;
        const forecastValue = summary?.forecast ?? (isClosedMonth ? null : item.forecast);
        return (
          <article key={metric} className="kpi">
            <span>{metric === "Квалы" ? (trafficMode === "marketing" ? "КВАЛ маркетинг" : "КВАЛ ОП") : metric}</span>
            <strong>{formatNumber(item.fact)}</strong>
            <div className="kpi-row">
              <small>План {formatNumber(item.plan)}</small>
              <small>{completion}%</small>
            </div>
            <div className="progress"><i style={{ width: `${Math.min(completion, 130)}%` }} /></div>
            <div className="kpi-foot">
              <small>{deltaAbs >= 0 ? "+" : ""}{formatNumber(deltaAbs)} к плану</small>
              <small>{forecastValue === null ? "прогноз скрыт" : `Optima ${formatNumber(forecastValue)}`}</small>
            </div>
          </article>
        );
      })}
    </section>
  );
}

function MonthEndForecastPanel({
  projection,
  trafficMode = "op",
}: {
  projection: ReturnType<typeof buildMonthEndForecast>;
  trafficMode?: TrafficMode;
}) {
  return (
    <section className="month-end-forecast-panel">
      <PanelHead
        title="Прогноз на конец месяца"
        description="FACT пересчитывается в средний базовый день, дальше будущие дни умножаются на свои коэффициенты."
      />
      <div className="forecast-meta-row">
        <span>{projection.isClosed ? "Месяц завершен: показываем итоговый факт" : `FACT внесен до: ${projection.lastFactDate ? formatDay(projection.lastFactDate) : "нет факта"}`}</span>
        <span>{projection.isClosed ? "Оставшихся дней нет" : `Осталось дней в расчете: ${projection.remainingDatesCount}`}</span>
      </div>
      <div className="month-end-forecast-grid">
        {metrics.map((metric) => {
          const item = projection.metrics[metric];
          return (
            <article key={metric}>
              <span>{metric === "Квалы" ? (trafficMode === "marketing" ? "КВАЛ маркетинг" : "КВАЛ ОП") : metric}</span>
              <strong>{formatNumber(item.projected)}</strong>
              <div className="forecast-progress">
                <i style={{ width: `${Math.min(item.completion, 130)}%` }} />
              </div>
              <div>
                <small>Факт сейчас: {formatNumber(item.fact)}</small>
                <small>Средний день: {formatNumber(item.baseDaily)}</small>
                <small>План: {formatNumber(item.plan)}</small>
              </div>
              <em className={item.delta >= 0 ? "positive" : "negative"}>
                {item.completion}% · {item.delta >= 0 ? "+" : ""}{formatNumber(item.delta)} к плану
              </em>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function PlanCompletionWidget({
  totals,
  periodLabel,
  trafficMode = "op",
}: {
  totals: MetricTotals;
  periodLabel: string;
  trafficMode?: TrafficMode;
}) {
  const averageCompletion = Math.round(
    planRingItems.reduce((sum, item) => sum + percent(totals[item.metric].fact, totals[item.metric].plan), 0) / planRingItems.length,
  );

  return (
    <section className="plan-completion-card">
      <div className="plan-completion-head">
        <div>
          <span>{periodLabel}</span>
          <h2>Выполнение плана</h2>
        </div>
        <strong>{averageCompletion}%</strong>
      </div>

      <div className="plan-completion-body">
        <div className="plan-rings" aria-label="Выполнение плана по лидам, квалам и продажам">
          <svg viewBox="0 0 160 160" aria-hidden="true">
            {planRingItems.map((item) => {
              const completion = percent(totals[item.metric].fact, totals[item.metric].plan);
              const capped = Math.min(Math.max(completion, 0), 100);
              return (
                <g key={item.metric}>
                  <circle className="plan-ring-bg" cx="80" cy="80" r={item.radius} pathLength="100" />
                  <circle
                    className={`plan-ring ${item.className}`}
                    cx="80"
                    cy="80"
                    r={item.radius}
                    pathLength="100"
                    style={{ strokeDasharray: `${capped} ${100 - capped}` }}
                  />
                </g>
              );
            })}
          </svg>
          <div className="plan-rings-center">
            <strong>{formatNumber(totals["Продажи"].fact)}</strong>
            <span>факт продаж</span>
          </div>
        </div>

        <div className="plan-completion-list">
          {planRingItems.map((item) => {
            const completion = percent(totals[item.metric].fact, totals[item.metric].plan);
            return (
              <div key={item.metric}>
                <i className={item.className} />
                <span>{item.metric === "Квалы" ? (trafficMode === "marketing" ? "КВАЛ маркетинг" : "КВАЛ ОП") : item.label}</span>
                <strong>{completion}%</strong>
                <small>{formatNumber(totals[item.metric].fact)} из {formatNumber(totals[item.metric].plan)}</small>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function FunnelOverview({ totals, conversions }: { totals: MetricTotals; conversions: ReturnType<typeof buildConversions> }) {
  const stages: Array<{ metric: Metric; label: string }> = [
    { metric: "Лиды", label: "Лиды" },
    { metric: "Квалы", label: "КВАЛ" },
    { metric: "Продажи", label: "Продажи" },
  ];

  return (
    <section className="funnel-panel">
      <PanelHead title="Воронка" description="Связка лиды → КВАЛ → продажи показывает, где теряется результат." />
      <div className="funnel-flow">
        {stages.map((stage, index) => (
          <div key={stage.metric} className="funnel-stage">
            <span>{stage.label}</span>
            <strong>{formatNumber(totals[stage.metric].fact)}</strong>
            {index < stages.length - 1 && (
              <em>{index === 0 ? conversions.leadToQualified : conversions.qualifiedToSale}%</em>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function ConversionCards({
  conversions,
  trafficMode,
}: {
  conversions: ReturnType<typeof buildConversions>;
  trafficMode: TrafficMode;
}) {
  const isMarketing = trafficMode === "marketing";
  return (
    <section className="conversion-panel">
      <PanelHead title="Конверсии" description="Главные управленческие переходы воронки." />
      <div className="conversion-grid">
        <article>
          <span>{isMarketing ? "Лид → КВАЛ маркетинг" : "Лид → КВАЛ ОП"}</span>
          <strong>{conversions.leadToQualified}%</strong>
          <small>{isMarketing ? `ОП отдельно: ${conversions.opLeadToQualified}%` : `Маркетинг: ${conversions.marketingLeadToQualified}%`}</small>
        </article>
        <article>
          <span>КВАЛ → продажа</span>
          <strong>{conversions.qualifiedToSale}%</strong>
          <small>{isMarketing ? "с учетом ОМ КВАЛ" : "по квалам ОП"}</small>
        </article>
        <article className="secondary">
          <span>{isMarketing ? "ОМ КВАЛ сверху" : "ОМ КВАЛ отдельно"}</span>
          <strong>{formatNumber(conversions.omQualified)}</strong>
          <small>не смешан с КВАЛ ОП</small>
        </article>
      </div>
    </section>
  );
}

function PanelHead({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="panel-heading">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {children}
    </div>
  );
}

function MetricSelect({ value, onChange }: { value: Metric; onChange: (metric: Metric) => void }) {
  return (
    <label className="inline-select">
      <select value={value} onChange={(event) => onChange(event.target.value as Metric)}>
        {metrics.map((metric) => <option key={metric}>{metric}</option>)}
      </select>
      <ChevronDown size={15} />
    </label>
  );
}

function ContinuousDashboardChart({
  months,
  metric,
  todayIso,
  trafficMode,
}: {
  months: Array<{ config: MonthConfig; weeks: WeekSummary[] }>;
  metric: Metric;
  todayIso: string;
  trafficMode: TrafficMode;
}) {
  const flatWeeks = months.flatMap((month) =>
    month.weeks.map((week) => ({
      monthLabel: month.config.label,
      monthKey: month.config.monthKey,
      monthWeekCount: month.weeks.length,
      week,
    })),
  );
  const values = flatWeeks.map((item, index) => {
    const metricTotal = item.week.totals[metric];
    const plan = metricTotal.plan;
    const fact = metricFactForTraffic(metric, metricTotal, trafficMode);
    const opFact = metricTotal.fact;
    const omQualified = metric === "Квалы" ? metricTotal.omQualified : 0;
    const forecast = metricTotal.forecast;
    const previous = index > 0 ? metricFactForTraffic(metric, flatWeeks[index - 1].week.totals[metric], trafficMode) : null;
    const delta = previous ? ((fact - previous) / previous) * 100 : 0;
    const isFutureEmpty = isFutureWeekWithoutFact(item.week, metric, todayIso);
    return {
      ...item,
      plan,
      fact,
      opFact,
      omQualified,
      forecast,
      delta,
      trend: isFutureEmpty ? "warning" as const : trendClass(delta, previous === null),
      hasForecast: shouldShowForecastForWeek(item.week, todayIso),
      isFutureEmpty,
    };
  });
  const max = Math.max(...values.flatMap((item) => [item.fact, item.plan, item.hasForecast ? item.forecast : 0]), 1);
  const chartHeight = 248;
  const chartMax = getNiceAxisMax(max * 1.12);
  const minWidth = `${Math.max(100, months.length * 25)}%`;
  const planSegments = buildLineSegments(values, chartMax, (item) => item.plan, () => true, undefined, { top: 7, height: 84 });
  let cursor = 1;

  return (
    <div className="dashboard-scroll" aria-label={`Общий график: ${metric}`}>
      <div className="continuous-chart" style={{ minWidth }}>
        <div className="continuous-months" style={{ gridTemplateColumns: `repeat(${values.length}, minmax(0, 1fr))` }}>
          {months.map((month) => {
            const start = cursor;
            cursor += month.weeks.length;
            return (
              <div
                className="continuous-month-label"
                key={month.config.monthKey}
                style={{ gridColumn: `${start} / span ${month.weeks.length}` }}
              >
                <strong>{month.config.label}</strong>
                <span>{month.weeks.length} недель</span>
              </div>
            );
          })}
        </div>
        <div className="continuous-plot">
          <ChartAxisLabels max={chartMax} />
          <ChartLine className="continuous-plan-line" segments={planSegments} pointRadius={0} />
          <div className="continuous-weeks" style={{ gridTemplateColumns: `repeat(${values.length}, minmax(0, 1fr))` }}>
            {values.map((item, index) => {
              const barTone = item.fact <= 0 ? "inactive" : item.trend;
              const deltaLabel = item.isFutureEmpty ? "нет FACT" : formatPercentDelta(item.delta, item.trend);
              const showOmSegment = metric === "Квалы" && trafficMode === "marketing" && item.omQualified > 0 && item.fact > 0;
              return (
              <div
                className={`continuous-week ${tooltipEdgeClass(index, values.length)}`}
                key={`${item.monthKey}-${item.week.week}`}
                data-tooltip={`${item.monthLabel}, ${item.week.week} неделя\nФакт: ${formatNumber(item.fact)}\nПрогноз Optima: ${formatNumber(item.plan)}\nДинамика: ${deltaLabel}`}
              >
                <div className="continuous-bar-area">
                  {showOmSegment ? (
                    <span
                      className={`continuous-bar continuous-bar-stack ${barTone}`}
                      style={{ height: `${Math.max((item.fact / chartMax) * chartHeight, 8)}px` }}
                    >
                      <i className="op-segment" style={{ height: `${Math.max((item.opFact / item.fact) * 100, 0)}%` }} />
                      <i className="om-segment" style={{ height: `${Math.min((item.omQualified / item.fact) * 100, 100)}%` }} />
                    </span>
                  ) : (
                    <span
                      className={`continuous-bar ${barTone}`}
                      style={{ height: `${Math.max((item.fact / chartMax) * chartHeight, 8)}px` }}
                    />
                  )}
                </div>
                <strong>{formatNumber(item.fact)}</strong>
                <small>{item.week.week} нед.</small>
                <EventDots events={item.week.events} />
                <em className={item.trend}>{deltaLabel}</em>
                {index < values.length - 1 && item.week.week === item.monthWeekCount && <i className="month-divider" />}
              </div>
              );
            })}
          </div>
          <div className="continuous-legend">
            <span><i className="legend-dot fact" /> Факт</span>
            {metric === "Квалы" && trafficMode === "marketing" && <span><i className="legend-dot om" /> ОМ КВАЛ</span>}
            <span><i className="legend-line plan" /> Прогноз Optima</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricWeekCard({
  metric,
  weeks,
  todayIso,
  trafficMode,
}: {
  metric: Metric;
  weeks: WeekSummary[];
  todayIso: string;
  trafficMode: TrafficMode;
}) {
  return (
    <article className="week-chart-card">
      <div className="chart-card-head">
        <div>
          <span className="chart-eyebrow">график по неделям</span>
          <div className="chart-title-row">
            <strong className="chart-title">{getMetricDisplayTitle(metric, trafficMode)}</strong>
            <Info size={15} aria-hidden="true" />
          </div>
        </div>
      </div>
      <WeeklyTrendChart weeks={weeks} metric={metric} todayIso={todayIso} trafficMode={trafficMode} />
    </article>
  );
}

function RecommendationWeekPanel({ weeks }: { weeks: WeekSummary[] }) {
  const totalRecommendations = metrics.reduce(
    (sum, metric) => sum + weeks.reduce((metricSum, week) => metricSum + week.totals[metric].recommendations, 0),
    0,
  );

  return (
    <section className="analytics-panel recommendation-panel">
      <PanelHead
        title="График по рекомендациям"
        description="Отдельно показывает рекомендации по лидам, КВАЛ и продажам. Эти значения вычитаются из FACT перед расчетом отчетов."
      />
      <div className="recommendation-grid">
        {metrics.map((metric) => (
          <RecommendationMetricCard key={metric} metric={metric} weeks={weeks} />
        ))}
      </div>
      {totalRecommendations === 0 && <p className="recommendation-empty">Рекомендации пока не внесены.</p>}
    </section>
  );
}

function RecommendationMetricCard({ metric, weeks }: { metric: Metric; weeks: WeekSummary[] }) {
  const values = weeks.map((week) => ({
    week: week.week,
    value: week.totals[metric].recommendations,
  }));
  const max = Math.max(...values.map((item) => item.value), 1);
  const totalValue = values.reduce((sum, item) => sum + item.value, 0);

  return (
    <article className="recommendation-card">
      <div className="recommendation-card-head">
        <span>{metric === "Квалы" ? "КВАЛ" : metric}</span>
        <strong>{formatNumber(totalValue)}</strong>
      </div>
      <div className="recommendation-chart" style={{ gridTemplateColumns: `repeat(${Math.max(values.length, 1)}, minmax(0, 1fr))` }}>
        {values.map((item) => (
          <div className="recommendation-week" key={item.week}>
            <span
              className={item.value > 0 ? "recommendation-bar" : "recommendation-bar empty"}
              style={{ height: `${item.value > 0 ? Math.max((item.value / max) * 96, 8) : 4}px` }}
            />
            <b>{formatNumber(item.value)}</b>
            <small>{item.week} нед.</small>
          </div>
        ))}
      </div>
    </article>
  );
}

function MetricMonthCard({
  metric,
  months,
  trafficMode,
}: {
  metric: Metric;
  months: Array<{ config: MonthConfig; events: EventItem[]; weeks: WeekSummary[] }>;
  trafficMode: TrafficMode;
}) {
  return (
    <article className="week-chart-card month-chart-card">
      <div className="chart-card-head">
        <div>
          <span className="chart-eyebrow">график по месяцам</span>
          <div className="chart-title-row">
            <strong className="chart-title">{getMonthMetricTitle(metric, trafficMode)}</strong>
            <Info size={15} aria-hidden="true" />
          </div>
        </div>
      </div>
      <MonthlyTrendChart months={months} metric={metric} trafficMode={trafficMode} />
    </article>
  );
}

function MonthlyTrendChart({
  months,
  metric,
  trafficMode,
}: {
  months: Array<{ config: MonthConfig; events: EventItem[]; weeks: WeekSummary[] }>;
  metric: Metric;
  trafficMode: TrafficMode;
}) {
  const chartHeight = 210;
  const monthTotals = months.map((month) => mergeTotals(month.weeks));
  const values = months.map((month, index) => {
    const totals = monthTotals[index];
    const plan = totals[metric].plan;
    const fact = metricFactForTraffic(metric, totals[metric], trafficMode);
    const opFact = totals[metric].fact;
    const omQualified = metric === "Квалы" ? totals[metric].omQualified : 0;
    const previous = index > 0 ? metricFactForTraffic(metric, monthTotals[index - 1][metric], trafficMode) : null;
    const delta = previous ? ((fact - previous) / previous) * 100 : 0;
    return {
      month,
      plan,
      fact,
      opFact,
      omQualified,
      delta,
      trend: trendClass(delta, previous === null),
      label: month.config.label,
      shortLabel: getShortMonthLabel(month.config),
    };
  });
  const max = Math.max(...values.flatMap((item) => [item.fact, item.plan]), 1);
  const chartMax = getNiceAxisMax(max * 1.12);
  const planSegments = buildLineSegments(values, chartMax, (item) => item.plan, () => true, undefined, { top: 8, height: 74 });

  return (
    <div className="trend-chart month-trend-chart" style={{ gridTemplateColumns: `repeat(${Math.max(values.length, 1)}, minmax(0, 1fr))` }}>
      <ChartAxisLabels max={chartMax} />
      <ChartLine className="plan-line" segments={planSegments} />
      <div className="mini-chart-legend">
        <span><i className="legend-dot fact" /> Факт</span>
        {metric === "Квалы" && trafficMode === "marketing" && <span><i className="legend-dot om" /> ОМ КВАЛ</span>}
        <span><i className="legend-line plan" /> Прогноз Optima</span>
      </div>
      {values.map((item, index) => {
        const barTone = item.fact <= 0 ? "inactive" : item.trend;
        const deltaLabel = formatPercentDelta(item.delta, item.trend);
        const showOmSegment = metric === "Квалы" && trafficMode === "marketing" && item.omQualified > 0 && item.fact > 0;
        return (
          <div
            key={item.month.config.monthKey}
            className={`trend-week month-trend-item ${tooltipEdgeClass(index, values.length)}`}
            data-tooltip={`${item.label}\nФакт: ${formatNumber(item.fact)}\nПрогноз Optima: ${formatNumber(item.plan)}\nДинамика: ${deltaLabel}`}
          >
            <div className="trend-plot" style={{ height: chartHeight }}>
              {showOmSegment ? (
                <span
                  className={`trend-bar trend-bar-stack ${barTone}`}
                  style={{ height: `${Math.max((item.fact / chartMax) * chartHeight, 8)}px` }}
                >
                  <i className="op-segment" style={{ height: `${Math.max((item.opFact / item.fact) * 100, 0)}%` }} />
                  <i className="om-segment" style={{ height: `${Math.min((item.omQualified / item.fact) * 100, 100)}%` }} />
                </span>
              ) : (
                <span
                  className={`trend-bar ${barTone}`}
                  style={{ height: `${Math.max((item.fact / chartMax) * chartHeight, 8)}px` }}
                />
              )}
            </div>
            <strong>{formatNumber(item.fact)}</strong>
            <small>{item.shortLabel}</small>
            <EventDots events={item.month.events} />
            <em className={item.trend}>{deltaLabel}</em>
          </div>
        );
      })}
    </div>
  );
}

function WeeklyTrendChart({
  weeks,
  metric,
  todayIso,
  trafficMode,
}: {
  weeks: WeekSummary[];
  metric: Metric;
  todayIso: string;
  trafficMode: TrafficMode;
}) {
  const chartHeight = 210;
  const values = weeks.map((week, index) => {
    const plan = week.totals[metric].plan;
    const fact = metricFactForTraffic(metric, week.totals[metric], trafficMode);
    const opFact = week.totals[metric].fact;
    const omQualified = metric === "Квалы" ? week.totals[metric].omQualified : 0;
    const previous = index > 0 ? metricFactForTraffic(metric, weeks[index - 1].totals[metric], trafficMode) : null;
    const delta = previous ? ((fact - previous) / previous) * 100 : 0;
    const isFutureEmpty = isFutureWeekWithoutFact(week, metric, todayIso);
    return {
      week,
      plan,
      fact,
      opFact,
      omQualified,
      delta,
      trend: isFutureEmpty ? "warning" as const : trendClass(delta, previous === null),
      hasForecast: shouldShowForecastForWeek(week, todayIso),
      isFutureEmpty,
    };
  });
  const max = Math.max(...values.flatMap((item) => [item.fact, item.plan]), 1);
  const chartMax = getNiceAxisMax(max * 1.12);
  const planSegments = buildLineSegments(values, chartMax, (item) => item.plan, () => true, undefined, { top: 8, height: 74 });

  return (
    <div className="trend-chart">
      <ChartAxisLabels max={chartMax} />
      <ChartLine className="plan-line" segments={planSegments} />
      <div className="mini-chart-legend">
        <span><i className="legend-dot fact" /> Факт</span>
        {metric === "Квалы" && trafficMode === "marketing" && <span><i className="legend-dot om" /> ОМ КВАЛ</span>}
        <span><i className="legend-line plan" /> Прогноз Optima</span>
      </div>
      {values.map((item, index) => {
        const barTone = item.fact <= 0 ? "inactive" : item.trend;
        const deltaLabel = item.isFutureEmpty ? "нет FACT" : formatPercentDelta(item.delta, item.trend);
        const showOmSegment = metric === "Квалы" && trafficMode === "marketing" && item.omQualified > 0 && item.fact > 0;
        return (
        <div
          key={item.week.week}
          className={`trend-week ${tooltipEdgeClass(index, values.length)}`}
          data-tooltip={`${item.week.week} неделя\nФакт: ${formatNumber(item.fact)}\nПрогноз Optima: ${formatNumber(item.plan)}\nДинамика: ${deltaLabel}`}
        >
          <div className="trend-plot" style={{ height: chartHeight }}>
            {showOmSegment ? (
              <span
                className={`trend-bar trend-bar-stack ${barTone}`}
                style={{ height: `${Math.max((item.fact / chartMax) * chartHeight, 8)}px` }}
              >
                <i className="op-segment" style={{ height: `${Math.max((item.opFact / item.fact) * 100, 0)}%` }} />
                <i className="om-segment" style={{ height: `${Math.min((item.omQualified / item.fact) * 100, 100)}%` }} />
              </span>
            ) : (
              <span
                className={`trend-bar ${barTone}`}
                style={{ height: `${Math.max((item.fact / chartMax) * chartHeight, 8)}px` }}
              />
            )}
          </div>
          <strong>{formatNumber(item.fact)}</strong>
          <small>{item.week.week} нед.</small>
          <EventDots events={item.week.events} />
          <em className={item.trend}>{deltaLabel}</em>
        </div>
        );
      })}
    </div>
  );
}

function ChartLine({
  className,
  segments,
  pointRadius = 1.45,
  smooth = false,
}: {
  className: string;
  segments: ChartLineSegment[];
  pointRadius?: number;
  smooth?: boolean;
}) {
  if (!segments.length) return null;

  return (
    <svg className={className} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {segments.map((segment, segmentIndex) => (
        <g key={segmentIndex}>
          {segment.length > 1 && (
            smooth
              ? <path d={buildSmoothPath(segment)} />
              : <polyline points={segment.map((point) => `${point.x},${point.y}`).join(" ")} />
          )}
          {pointRadius > 0 && segment.map((point) => <circle key={`${segmentIndex}-${point.x}-${point.y}`} cx={point.x} cy={point.y} r={pointRadius} />)}
        </g>
      ))}
    </svg>
  );
}

function EventDots({ events }: { events: EventItem[] }) {
  if (!events.length) return <span className="week-event-dots empty" aria-hidden="true" />;

  const visible = events.slice(0, 4);
  return (
    <span className="week-event-dots" title={events.map((event) => event.title).join(", ")}>
      {visible.map((event) => <i key={event.id} className={effectClass(event.actualEffect)} />)}
      {events.length > visible.length && <b>+{events.length - visible.length}</b>}
    </span>
  );
}

function ChartAxisLabels({ max }: { max: number }) {
  const labels = getAxisLabels(max);

  return (
    <div className="chart-axis-labels" aria-hidden="true">
      {labels.map((label) => <span key={label}>{formatNumber(label)}</span>)}
    </div>
  );
}

function MonthMatrix({
  months,
  trafficMode,
}: {
  months: Array<{ config: MonthConfig; events: EventItem[]; weeks: WeekSummary[] }>;
  trafficMode: TrafficMode;
}) {
  return (
    <section className="analytics-panel">
      <PanelHead title="Матрица месяцев" description="Итоги месяца, две конверсии и динамика к предыдущему месяцу." />
      <div className="month-matrix">
        {months.map((month, monthIndex) => {
          const rawTotals = mergeTotals(month.weeks);
          const previousRawTotals = monthIndex > 0 ? mergeTotals(months[monthIndex - 1].weeks) : null;
          const totals = applyTrafficModeToTotals(rawTotals, trafficMode);
          const previousTotals = previousRawTotals ? applyTrafficModeToTotals(previousRawTotals, trafficMode) : null;
          const conversions = buildConversions(rawTotals, trafficMode);
          const previousConversions = previousRawTotals ? buildConversions(previousRawTotals, trafficMode) : null;
          return (
            <article key={month.config.monthKey} className="month-matrix-row">
              <div>
                <strong>{month.config.label}</strong>
                <span>{month.events.length} событий</span>
              </div>
              {metrics.map((metric) => (
                <div key={metric}>
                  <span>{metric}</span>
                  <b className="matrix-value">
                    {percent(totals[metric].fact, totals[metric].plan)}%
                    <MatrixTrendArrow trend={getMonthMetricTrend(totals, previousTotals, metric)} />
                  </b>
                </div>
              ))}
              <div>
                <span>{trafficMode === "marketing" ? "Лид → квал маркетинг" : "Лид → квал ОП"}</span>
                <b className="matrix-value">
                  {conversions.leadToQualified}%
                  <MatrixTrendArrow trend={getValueTrend(conversions.leadToQualified, previousConversions?.leadToQualified ?? null)} />
                </b>
              </div>
              <div>
                <span>Квал → продажа</span>
                <b className="matrix-value">
                  {conversions.qualifiedToSale}%
                  <MatrixTrendArrow trend={getValueTrend(conversions.qualifiedToSale, previousConversions?.qualifiedToSale ?? null)} />
                </b>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function MatrixTrendArrow({ trend }: { trend: "up" | "down" | "flat" }) {
  if (trend === "flat") return null;
  return <span className={`matrix-arrow ${trend}`}>{trend === "up" ? "▲" : "▼"}</span>;
}

function PlanNeedGrid({ summaries }: { summaries: MetricSummary[] }) {
  return (
    <section className="plan-need-grid">
      <div className="plan-need-heading">
        <span>Средний дневной темп для выполнения плана</span>
        <p>Сколько нужно давать в день, чтобы закрыться в 100%.</p>
      </div>
      {summaries.map((summary) => (
        <article key={summary.metric}>
          <span>{summary.metric.toLowerCase()}</span>
          <strong>{formatNumber(summary.dailyTarget)}</strong>
          <small>{summary.dailyLabel} · {summary.endLabel}</small>
        </article>
      ))}
    </section>
  );
}

function InsightPanel({ items }: { items: string[] }) {
  return (
    <section className="attention-panel">
      <div className="attention-title">
        <Target size={18} />
        <h2>На что обратить внимание</h2>
      </div>
      <div className="attention-list">
        {(items.length ? items : ["Критичных отклонений по текущим данным нет. Продолжайте сверять план, прогноз и события."]).map((item) => (
          <p key={item}>{item}</p>
        ))}
      </div>
    </section>
  );
}

function AdminDashboard({
  dates,
  months,
  selectedMonthKey,
  selectedMonthConfig,
  records,
  events,
  sourceOptions,
  todayIso,
  selectMonth,
  onCreateMonth,
  onSaveDailyValues,
  isSavingDaily,
  onAddEvent,
  onDeleteEvent,
  forecastCoefficients,
  onUpdateForecastCoefficient,
  onSaveForecastCoefficients,
  tab,
  setTab,
}: {
  dates: string[];
  months: MonthConfig[];
  selectedMonthKey: string;
  selectedMonthConfig: MonthConfig;
  records: DailyRecord[];
  events: EventItem[];
  sourceOptions: string[];
  todayIso: string;
  selectMonth: (monthKey: string) => void;
  onCreateMonth: (draft: MonthDraft) => void;
  onSaveDailyValues: (values: DailyValueUpdate[], message?: string) => Promise<void>;
  isSavingDaily: boolean;
  onAddEvent: (event: EventItem) => void;
  onDeleteEvent: (eventId: string) => void;
  forecastCoefficients: ForecastCoefficients;
  onUpdateForecastCoefficient: (city: City, metric: Metric, weekday: WeekdayCoefficientKey, value: number) => void;
  onSaveForecastCoefficients: () => void;
  tab: AdminTab;
  setTab: (tab: AdminTab) => void;
}) {
  const firstDate = dates.includes(todayIso) ? todayIso : dates[0] ?? todayIso;
  const [selectedDate, setSelectedDate] = useState(firstDate);
  const reportTotals = buildMetricTotals(filterRecordsByScope(records, "Все"), metrics);

  useEffect(() => {
    if (!dates.includes(selectedDate)) {
      setSelectedDate(dates[0] ?? todayIso);
    }
  }, [dates, selectedDate, todayIso]);

  return (
    <div className="page-stack admin-dashboard">
      <ExecutiveSummary
        status={{ label: "режим ввода", tone: "good" }}
        eyebrow={selectedMonthConfig.label}
        title="Админка ежедневного отчета"
        facts={[
          "Итоги: МСК + СПБ без сообщений",
          "Сообщения только в отдельной вкладке",
          `Источников: ${sourceOptions.length}`,
          "План по каждому направлению",
          "День сохраняется пачкой",
          "Коэффициенты прогноза редактируются",
          `Событий месяца: ${events.length}`,
        ]}
      />

      <section className="admin-command-panel">
        <div className="admin-month-select">
          <label>
            Рабочий месяц
            <select value={selectedMonthKey} onChange={(event) => selectMonth(event.target.value)}>
              {months.map((config) => (
                <option key={config.monthKey} value={config.monthKey}>{config.label}</option>
              ))}
            </select>
          </label>
          <span>{dates.length} дней · {Object.keys(groupDatesByWeek(dates)).length} недель</span>
        </div>
        <div className="admin-tabs" role="tablist" aria-label="Режим админки">
          <button className={tab === "day" ? "active" : ""} type="button" onClick={() => setTab("day")}>День</button>
          <button className={tab === "month" ? "active" : ""} type="button" onClick={() => setTab("month")}>Месяц</button>
          <button className={tab === "sources" ? "active" : ""} type="button" onClick={() => setTab("sources")}>Источники</button>
          <button className={tab === "events" ? "active" : ""} type="button" onClick={() => setTab("events")}>События</button>
          <button className={tab === "coefficients" ? "active" : ""} type="button" onClick={() => setTab("coefficients")}>Коэф.</button>
        </div>
      </section>

      <section className="admin-total-strip">
        {metrics.map((metric) => (
          <article key={metric}>
            <span>{metric === "Квалы" ? "КВАЛ" : metric}</span>
            <strong>{formatNumber(reportTotals[metric].fact)}</strong>
            <small>чистый факт после вычета рекомендаций</small>
            <em>
              рекомендации: {formatNumber(reportTotals[metric].recommendations)}
              {metric === "Квалы" && <> · ОМ КВАЛ: {formatNumber(reportTotals[metric].omQualified)}</>}
            </em>
          </article>
        ))}
      </section>

      {tab === "day" && (
        <AdminDayPanel
          dates={dates}
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          records={records}
          onSaveDailyValues={onSaveDailyValues}
          isSavingDaily={isSavingDaily}
        />
      )}
      {tab === "month" && (
        <AdminMonthPanel
          dates={dates}
          records={records}
          selectedMonthConfig={selectedMonthConfig}
          forecastCoefficients={forecastCoefficients}
          onCreateMonth={onCreateMonth}
        />
      )}
      {tab === "sources" && (
        <SourceAdminPanel
          records={records}
          selectedMonthConfig={selectedMonthConfig}
          monthDates={dates}
          onSaveDailyValues={onSaveDailyValues}
          isSavingDaily={isSavingDaily}
        />
      )}
      {tab === "events" && (
        <AdminEventsPanel dates={dates} events={events} sourceOptions={sourceOptions} onAddEvent={onAddEvent} onDeleteEvent={onDeleteEvent} />
      )}
      {tab === "coefficients" && (
        <AdminForecastCoefficientsPanel
          coefficients={forecastCoefficients}
          onUpdate={onUpdateForecastCoefficient}
          onSave={onSaveForecastCoefficients}
        />
      )}
    </div>
  );
}

function AdminDayPanel({
  dates,
  selectedDate,
  setSelectedDate,
  records,
  onSaveDailyValues,
  isSavingDaily,
}: {
  dates: string[];
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  records: DailyRecord[];
  onSaveDailyValues: (values: DailyValueUpdate[], message?: string) => Promise<void>;
  isSavingDaily: boolean;
}) {
  const [draft, setDraft] = useState(() => createDailyFactDraft(records, selectedDate));

  useEffect(() => {
    setDraft(createDailyFactDraft(records, selectedDate));
  }, [records, selectedDate]);

  function setFact(city: City, metric: Metric, value: number) {
    setDraft((current) => ({
      ...current,
      [city]: {
        ...current[city],
        [metric]: {
          ...current[city][metric],
          fact: Math.max(0, value || 0),
        },
      },
    }));
  }

  function setRecommendations(city: City, metric: Metric, value: number) {
    setDraft((current) => ({
      ...current,
      [city]: {
        ...current[city],
        [metric]: {
          ...current[city][metric],
          recommendations: Math.max(0, value || 0),
        },
      },
    }));
  }

  function setOmQualified(city: City, value: number) {
    setDraft((current) => ({
      ...current,
      [city]: {
        ...current[city],
        Квалы: {
          ...current[city].Квалы,
          omQualified: Math.max(0, value || 0),
        },
      },
    }));
  }

  async function saveDay() {
    if (isSavingDaily) return;
    const values = adminCities.flatMap((city) =>
      metrics.map((metric) => ({
        date: selectedDate,
        city,
        metric,
        fact: draft[city][metric].fact,
        recommendations: draft[city][metric].recommendations,
        omQualified: metric === "Квалы" ? draft[city][metric].omQualified : 0,
      })),
    );
    await onSaveDailyValues(values, `${formatDay(selectedDate)} сохранен.`);
  }

  return (
    <section className="admin-entry-panel">
      <PanelHead title="День" description="КВАЛ ОП и ОМ КВАЛ хранятся отдельно. В режиме маркетинга отчет показывает КВАЛ ОП + ОМ КВАЛ.">
        <label className="admin-date-select">
          <span>Дата</span>
          <select value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)}>
            {dates.map((date) => (
              <option key={date} value={date}>{formatDay(date)} · {weekdayLabel(date)}</option>
            ))}
          </select>
        </label>
      </PanelHead>

      <div className="admin-day-grid">
        <div className="admin-day-row admin-day-head">
          <span>Направление</span>
          {metrics.map((metric) => <span key={metric}>{metric === "Квалы" ? "КВАЛ" : metric}</span>)}
        </div>
        {adminCities.map((city) => (
          <div className="admin-day-row" key={city}>
            <strong>{cityLabels[city]}</strong>
            {metrics.map((metric) => {
              const record = findDailyRecord(records, selectedDate, city, metric);
              const plan = record?.plan ?? 0;
              const cleanFact = Math.max(0, draft[city][metric].fact - draft[city][metric].recommendations);
              const isQualified = metric === "Квалы";
              const marketingQualified = cleanFact + draft[city][metric].omQualified;
              return (
                <label className="admin-fact-input" key={metric}>
                  <span className={isQualified ? "admin-input-labels three" : "admin-input-labels"}>
                    <b>{isQualified ? "КВАЛ ОП" : "FACT"}</b>
                    <b>Рекомендации</b>
                    {isQualified && <b>ОМ КВАЛ</b>}
                  </span>
                  <span className={isQualified ? "admin-metric-inputs three" : "admin-metric-inputs"}>
                    <input
                      type="number"
                      min="0"
                      value={draft[city][metric].fact}
                      onChange={(event) => setFact(city, metric, Number(event.target.value))}
                      aria-label={`${cityLabels[city]} ${metric} факт`}
                    />
                    <input
                      type="number"
                      min="0"
                      value={draft[city][metric].recommendations}
                      onChange={(event) => setRecommendations(city, metric, Number(event.target.value))}
                      aria-label={`${cityLabels[city]} ${metric} рекомендации`}
                    />
                    {isQualified && (
                      <input
                        type="number"
                        min="0"
                        value={draft[city][metric].omQualified}
                        onChange={(event) => setOmQualified(city, Number(event.target.value))}
                        aria-label={`${cityLabels[city]} ОМ КВАЛ`}
                      />
                    )}
                  </span>
                  <small>
                    план {formatNumber(plan)} · ОП <b>{formatNumber(cleanFact)}</b>
                    {isQualified && <> · маркетинг <b>{formatNumber(marketingQualified)}</b></>}
                  </small>
                </label>
              );
            })}
          </div>
        ))}
      </div>

      <div className="admin-actions">
        <span>Данные сообщений сохраняются отдельно и не попадают в общий дашборд МСК + СПБ.</span>
        <button className="primary-button" type="button" onClick={saveDay} disabled={isSavingDaily}>
          <Save size={16} />
          {isSavingDaily ? "Сохраняю..." : "Сохранить"}
        </button>
      </div>
    </section>
  );
}

function AdminMonthPanel({
  dates,
  records,
  selectedMonthConfig,
  forecastCoefficients,
  onCreateMonth,
}: {
  dates: string[];
  records: DailyRecord[];
  selectedMonthConfig: MonthConfig;
  forecastCoefficients: ForecastCoefficients;
  onCreateMonth: (draft: MonthDraft) => void;
}) {
  const [draft, setDraft] = useState<MonthDraft>(() => nextMonthDraft(selectedMonthConfig, forecastCoefficients));
  const datesByWeek = groupDatesByWeek(dates);
  const previewPlansByCity = buildMonthlyPlansFromDailyAverage(
    draft.year,
    draft.monthIndex,
    draft.dailyAverageByCity ?? estimateDailyAverageByCity(selectedMonthConfig, forecastCoefficients),
    forecastCoefficients,
  );
  const previewPlan = combineReportPlan(previewPlansByCity);

  useEffect(() => {
    setDraft(nextMonthDraft(selectedMonthConfig, forecastCoefficients));
  }, [selectedMonthConfig, forecastCoefficients]);

  function setDailyAverage(city: City, metric: Metric, value: number) {
    setDraft((current) => ({
      ...current,
      dailyAverageByCity: {
        ...(current.dailyAverageByCity ?? current.plansByCity),
        [city]: {
          ...(current.dailyAverageByCity ?? current.plansByCity)[city],
          [metric]: Math.max(0, value || 0),
        },
      },
    }));
  }

  return (
    <section className="admin-entry-panel">
      <PanelHead title="Месяц по неделям" description="Факт в недельных блоках рассчитан из дневных значений. Чтобы изменить неделю, отредактируйте конкретный день." />

      <form
        className="admin-month-create"
        onSubmit={(event) => {
          event.preventDefault();
          onCreateMonth({
            ...draft,
            plansByCity: previewPlansByCity,
            dailyAverageByCity: clonePlansByCity(draft.dailyAverageByCity ?? estimateDailyAverageByCity(selectedMonthConfig, forecastCoefficients)),
          });
        }}
      >
        <div className="admin-create-top">
          <label>
            Новый месяц
            <select value={draft.monthIndex} onChange={(event) => setDraft((current) => ({ ...current, monthIndex: Number(event.target.value) }))}>
              {monthNames.map((label, index) => (
                <option key={label} value={index}>{label}</option>
              ))}
            </select>
          </label>
          <label>
            Год
            <input type="number" value={draft.year} onChange={(event) => setDraft((current) => ({ ...current, year: Number(event.target.value) }))} />
          </label>
          <button className="primary-button" type="submit">
            <Plus size={16} />
            Создать месяц
          </button>
        </div>

        <div className="admin-plan-preview">
          {metrics.map((metric) => (
            <span key={metric}>
              <small>{metric === "Квалы" ? "КВАЛ" : metric}</small>
              <strong>{formatNumber(previewPlan[metric])}</strong>
              <em>план месяца по коэффициентам</em>
            </span>
          ))}
        </div>

        <div className="admin-plan-grid">
          {adminCities.map((city) => (
            <section key={city}>
              <h3>{cityLabels[city]}</h3>
              {metrics.map((metric) => (
                <label key={metric}>
                  {metric === "Квалы" ? "КВАЛ" : metric} в среднем за день
                  <input
                    type="number"
                    min="0"
                    value={(draft.dailyAverageByCity ?? draft.plansByCity)[city][metric]}
                    onChange={(event) => setDailyAverage(city, metric, Number(event.target.value))}
                  />
                  <small>месяц: {formatNumber(previewPlansByCity[city][metric])}</small>
                </label>
              ))}
            </section>
          ))}
        </div>
      </form>

      <div className="admin-week-list">
        {Object.entries(datesByWeek).map(([week, weekDates]) => (
          <section className="admin-week-block" key={week}>
            <div className="week-header">
              <h3>{week} неделя</h3>
              <span>{formatDay(weekDates[0])} - {formatDay(weekDates[weekDates.length - 1])}</span>
            </div>
            <div className="admin-week-days">
              {weekDates.map((date) => (
                <article key={date} className="admin-week-day">
                  <div className="date-cell">{formatDay(date)} <small>{weekdayLabel(date)}</small></div>
                  {adminCities.map((city) => (
                    <div className="admin-week-city" key={city}>
                      <strong>{cityLabels[city]}</strong>
                      {metrics.map((metric) => (
                        <label className="compact-input" key={metric}>
                          <span>{metric === "Квалы" ? "КВАЛ ОП" : metric}</span>
                          <input
                            type="number"
                            min="0"
                            value={dailyRecordNetFact(findDailyRecord(records, date, city, metric))}
                            readOnly
                            title="Чтобы изменить значение, откройте вкладку День и нажмите Сохранить."
                          />
                          {metric === "Квалы" && (
                            <small>ОМ {formatNumber(findDailyRecord(records, date, city, metric)?.omQualified ?? 0)}</small>
                          )}
                        </label>
                      ))}
                    </div>
                  ))}
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

function AdminEventsPanel({
  dates,
  events,
  sourceOptions,
  onAddEvent,
  onDeleteEvent,
}: {
  dates: string[];
  events: EventItem[];
  sourceOptions: string[];
  onAddEvent: (event: EventItem) => void;
  onDeleteEvent: (eventId: string) => void;
}) {
  const [selectedDate, setSelectedDate] = useState(dates[0] ?? getTodayIso());
  const [editingEvent, setEditingEvent] = useState<EventItem | null>(null);
  const selectedDayEvents = events.filter((event) => event.startDate <= selectedDate && selectedDate <= event.endDate);

  useEffect(() => {
    if (!dates.length || dates.includes(selectedDate)) return;
    setSelectedDate(dates[0]);
  }, [dates, selectedDate]);

  return (
    <section className="admin-entry-panel">
      <PanelHead title="События" description="Факторы можно привязать ко всему отчету, конкретному городу, сообщениям или метрике." />
      <div className="events-layout">
        <div className="event-calendar-column">
          <EventCalendar dates={dates} events={events} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
          <SelectedDayEvents selectedDate={selectedDate} events={selectedDayEvents} onDelete={onDeleteEvent} onEdit={setEditingEvent} />
        </div>
        <EventForm
          dates={dates}
          selectedDate={selectedDate}
          sourceOptions={sourceOptions}
          editingEvent={editingEvent}
          onCancelEdit={() => setEditingEvent(null)}
          onSave={(event) => {
            onAddEvent(event);
            setEditingEvent(null);
          }}
        />
      </div>
    </section>
  );
}

function AdminForecastCoefficientsPanel({
  coefficients,
  onUpdate,
  onSave,
}: {
  coefficients: ForecastCoefficients;
  onUpdate: (city: City, metric: Metric, weekday: WeekdayCoefficientKey, value: number) => void;
  onSave: () => void;
}) {
  const [city, setCity] = useState<City>("МСК");
  const [metric, setMetric] = useState<Metric>("Лиды");

  return (
    <section className="admin-entry-panel forecast-coefficients-panel">
      <PanelHead
        title="Коэффициенты прогноза"
        description="Прогноз на конец месяца: FACT + оставшиеся дни по плану, умноженные на коэффициент дня недели."
      />
      <div className="coefficient-toolbar">
        <label>
          Направление
          <select value={city} onChange={(event) => setCity(event.target.value as City)}>
            {adminCities.map((item) => <option key={item} value={item}>{cityLabels[item]}</option>)}
          </select>
        </label>
        <label>
          Метрика
          <select value={metric} onChange={(event) => setMetric(event.target.value as Metric)}>
            {metrics.map((item) => <option key={item} value={item}>{item === "Квалы" ? "КВАЛ" : item}</option>)}
          </select>
        </label>
      </div>
      <div className="coefficient-grid">
        {coefficientWeekdays.map((weekday) => (
          <label key={weekday.key}>
            <span>{weekday.label}</span>
            <input
              type="number"
              min="0"
              step="0.001"
              value={coefficients[city][metric][weekday.key]}
              onChange={(event) => onUpdate(city, metric, weekday.key, Number(event.target.value))}
            />
          </label>
        ))}
      </div>
      <p className="coefficient-note">
        1.000 = день идет ровно по дневному плану. 1.190 = ожидаем на 19% выше дневного плана, 0.825 = на 17.5% ниже.
      </p>
      <button className="primary-button coefficient-save-button" type="button" onClick={onSave}>
        <Save size={16} /> Сохранить коэффициенты
      </button>
    </section>
  );
}

function DailyWeekEditor({
  dates,
  records,
  trafficMode,
}: {
  dates: string[];
  records: DailyRecord[];
  trafficMode: TrafficMode;
}) {
  return (
    <section className="daily-editor-panel">
      <PanelHead title="Дни недели" description="Факт рассчитан из сохраненных дневных значений. Чтобы изменить неделю, отредактируйте день в админке." />
      <div className="week-table-wrapper">
        <div className="week-table day-table">
          <div className="table-row header">
            <span>День</span>
            {metrics.map((metric) => <span key={metric}>{metric}</span>)}
          </div>
          {dates.map((date) => (
            <div className="table-row" key={date}>
              <span className="date-cell">{formatDay(date)} <small>{weekdayLabel(date)}</small></span>
              {metrics.map((metric) => {
                const value = metricFactFromRecords(records.filter((record) => record.date === date && record.metric === metric), metric, trafficMode);
                return (
                  <label key={metric} className="compact-input">
                    <input type="number" value={value} readOnly title="Чтобы изменить неделю, отредактируйте значения конкретных дней." />
                  </label>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="week-day-cards">
        {dates.map((date) => (
          <article key={date}>
            <div className="date-cell">{formatDay(date)} <small>{weekdayLabel(date)}</small></div>
            <div>
              {metrics.map((metric) => {
                const value = metricFactFromRecords(records.filter((record) => record.date === date && record.metric === metric), metric, trafficMode);
                return (
                  <span key={metric}>
                    <small>{metric === "Квалы" ? "КВАЛ" : metric}</small>
                    <strong>{formatNumber(value)}</strong>
                  </span>
                );
              })}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function EventCalendar({
  dates,
  events,
  selectedDate,
  onSelectDate,
}: {
  dates: string[];
  events: EventItem[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
}) {
  return (
    <div className="calendar-grid">
      {dates.map((date) => {
        const dayEvents = events.filter((event) => event.startDate <= date && date <= event.endDate);
        return (
          <button className={date === selectedDate ? "calendar-day active" : "calendar-day"} key={date} type="button" onClick={() => onSelectDate(date)}>
            <strong>{formatDay(date)}</strong>
            <small>{weekdayLabel(date)}</small>
            <span className="day-dots">
              {dayEvents.map((event) => <i key={event.id} className={`${event.group} ${effectClass(event.actualEffect)}`} />)}
            </span>
            {dayEvents.length > 0 && <em>{dayEvents.length}</em>}
          </button>
        );
      })}
    </div>
  );
}

function SelectedDayEvents({
  selectedDate,
  events,
  onDelete,
  onEdit,
}: {
  selectedDate: string;
  events: EventItem[];
  onDelete: (eventId: string) => void;
  onEdit?: (event: EventItem) => void;
}) {
  return (
    <section className="selected-day-events">
      <h3>{formatDay(selectedDate)} · события дня</h3>
      {events.length === 0 && <p>На этот день событий нет. Кликни день и добавь фактор справа.</p>}
      {events.map((event) => (
        <EventCard key={event.id} event={event} onDelete={onDelete} onEdit={onEdit} compact />
      ))}
    </section>
  );
}

function createEventDraft(date: string) {
  return {
    title: "",
    startDate: date,
    endDate: date,
    type: "рекламные изменения" as EventType,
    group: "internal" as EventGroup,
    expectedEffect: "неизвестно" as Effect,
    actualEffect: "неизвестно" as Effect,
    city: "МСК + СПБ" as EventCity,
    metric: "все" as Metric | "все",
    leadSource: "",
    importance: 2 as 1 | 2 | 3,
    description: "",
  };
}

function eventToDraft(event: EventItem) {
  return {
    title: event.title,
    startDate: event.startDate,
    endDate: event.endDate,
    type: event.type,
    group: event.group,
    expectedEffect: event.expectedEffect,
    actualEffect: event.actualEffect,
    city: event.city,
    metric: event.metric,
    leadSource: normalizeEventLeadSource(event.leadSource ?? parseLeadSourceFromDescription(event.description)),
    importance: event.importance,
    description: stripLeadSourceFromDescription(event.description),
  };
}

function EventForm({
  dates,
  selectedDate,
  sourceOptions,
  editingEvent,
  onCancelEdit,
  onSave,
}: {
  dates: string[];
  selectedDate: string;
  sourceOptions: string[];
  editingEvent: EventItem | null;
  onCancelEdit: () => void;
  onSave: (event: EventItem) => void;
}) {
  const fallbackDate = selectedDate || dates[0] || getTodayIso();
  const [draft, setDraft] = useState(() => createEventDraft(fallbackDate));

  useEffect(() => {
    if (editingEvent) {
      setDraft(eventToDraft(editingEvent));
      return;
    }
    if (!selectedDate) return;
    setDraft((current) => ({ ...current, startDate: selectedDate, endDate: selectedDate }));
  }, [editingEvent, selectedDate]);

  function setType(type: EventType) {
    setDraft((current) => ({
      ...current,
      type,
      group: internalEventTypes.includes(type) ? "internal" : "external",
    }));
  }

  function setStartDate(startDate: string) {
    setDraft((current) => ({
      ...current,
      startDate,
      endDate: current.endDate < startDate ? startDate : current.endDate,
    }));
  }

  function resetForm() {
    setDraft(createEventDraft(selectedDate || dates[0] || getTodayIso()));
    onCancelEdit();
  }

  return (
    <form
      className="event-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!draft.title.trim()) return;
        const startDate = draft.startDate <= draft.endDate ? draft.startDate : draft.endDate;
        const endDate = draft.startDate <= draft.endDate ? draft.endDate : draft.startDate;
        onSave({
          id: editingEvent?.id ?? `evt-${Date.now()}`,
          ...draft,
          startDate,
          endDate,
          leadSource: normalizeEventLeadSource(draft.leadSource),
          source: "manual",
        });
        setDraft(createEventDraft(selectedDate || dates[0] || getTodayIso()));
      }}
    >
      <h2>{editingEvent ? "Редактировать фактор" : "Добавить фактор"}</h2>
      <p className="event-form-note">Выбранный день: {formatDay(draft.startDate)}</p>
      <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Название события" />
      <div className="form-pair">
        <label>Начало <input type="date" value={draft.startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
        <label>Конец <input type="date" value={draft.endDate} onChange={(event) => setDraft({ ...draft, endDate: event.target.value })} /></label>
      </div>
      <label>Категория <select value={draft.type} onChange={(event) => setType(event.target.value as EventType)}>{eventTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
      <label>
        Направление
        <select value={draft.city} onChange={(event) => setDraft({ ...draft, city: event.target.value as EventCity })}>
          <option value="все">все</option>
          <option value="МСК + СПБ">МСК + СПБ</option>
          {adminCities.map((city) => <option key={city} value={city}>{cityLabels[city]}</option>)}
        </select>
      </label>
      <label>
        Метрика
        <select value={draft.metric} onChange={(event) => setDraft({ ...draft, metric: event.target.value as Metric | "все" })}>
          <option value="все">все</option>
          {metrics.map((metric) => <option key={metric} value={metric}>{metric === "Квалы" ? "КВАЛ" : metric}</option>)}
        </select>
      </label>
      <label>
        Источник влияния
        <select
          value={draft.leadSource || noLeadSourceOption}
          onChange={(event) => setDraft({ ...draft, leadSource: event.target.value === noLeadSourceOption ? "" : event.target.value })}
        >
          <option value={noLeadSourceOption}>нет привязки</option>
          {sourceOptions.map((source) => <option key={source} value={source}>{source}</option>)}
          <option value={otherLeadSourceOption}>другое</option>
        </select>
      </label>
      <label>
        Важность
        <select value={draft.importance} onChange={(event) => setDraft({ ...draft, importance: Number(event.target.value) as 1 | 2 | 3 })}>
          <option value={1}>низкая</option>
          <option value={2}>средняя</option>
          <option value={3}>высокая</option>
        </select>
      </label>
      <label>Ожидаемый эффект <select value={draft.expectedEffect} onChange={(event) => setDraft({ ...draft, expectedEffect: event.target.value as Effect })}>{effectLabels.map((effect) => <option key={effect}>{effect}</option>)}</select></label>
      <label>Фактический эффект <select value={draft.actualEffect} onChange={(event) => setDraft({ ...draft, actualEffect: event.target.value as Effect })}>{effectLabels.map((effect) => <option key={effect}>{effect}</option>)}</select></label>
      <textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Описание без категоричных причинных выводов" />
      <div className="event-form-actions">
        <button className="primary-button" type="submit">
          {editingEvent ? <Save size={16} /> : <Plus size={16} />}
          {editingEvent ? "Сохранить событие" : "Добавить событие"}
        </button>
        {editingEvent && (
          <button className="event-cancel-button" type="button" onClick={resetForm}>
            Отмена
          </button>
        )}
      </div>
    </form>
  );
}

function EventsPanel({ title, events, onDelete }: { title: string; events: EventItem[]; onDelete: (eventId: string) => void }) {
  const groupedEvents = groupEventsByMonth(events);
  const showMonthGroups = title.toLowerCase().includes("период");

  return (
    <aside className="insight-panel">
      <h2>{title}</h2>
      <div className="event-stack">
        {events.length === 0 && <p className="empty-state">Событий за выбранный период нет</p>}
        {groupedEvents.map((group) => (
          <section className="event-month-group" key={group.monthKey}>
            {showMonthGroups && <h3>{group.label}</h3>}
            {group.events.map((event) => <EventCard key={event.id} event={event} onDelete={onDelete} />)}
          </section>
        ))}
      </div>
    </aside>
  );
}

function MonthDailyEventsPanel({
  events,
  highlightedEventId,
  onHover,
}: {
  events: EventItem[];
  highlightedEventId: string | null;
  onHover: (eventId: string | null) => void;
}) {
  const grouped = groupEventsByDateRange(events);

  return (
    <aside className="insight-panel month-daily-events-panel">
      <h2>События месяца</h2>
      <div className="event-stack">
        {events.length === 0 && <p className="empty-state">Событий за выбранный месяц нет</p>}
        {grouped.map((group) => (
          <section className="daily-event-date-group" key={group.label}>
            <h3>{group.label}</h3>
            {group.events.map((event) => (
              <article
                key={event.id}
                className={`event-card ${event.group} ${effectClass(event.actualEffect)} ${highlightedEventId === event.id ? "highlighted" : ""}`}
                onMouseEnter={() => onHover(event.id)}
                onMouseLeave={() => onHover(null)}
              >
                <div className="event-card-head">
                  <strong>{event.title}</strong>
                  <span>{event.group === "internal" ? "внутреннее" : "внешнее"}</span>
                </div>
                <p>{event.description}</p>
                <small>{eventMetaLine(event)}</small>
              </article>
            ))}
          </section>
        ))}
      </div>
    </aside>
  );
}

function EventCard({
  event,
  onDelete,
  onEdit,
  compact = false,
}: {
  event: EventItem;
  onDelete?: (eventId: string) => void;
  onEdit?: (event: EventItem) => void;
  compact?: boolean;
}) {
  return (
    <article className={`event-card ${event.group} ${effectClass(event.actualEffect)} ${compact ? "compact" : ""}`}>
      <div className="event-card-head">
        <strong>{event.title}</strong>
        <span>{event.group === "internal" ? "внутреннее" : "внешнее"}</span>
      </div>
      <p>{event.description}</p>
      <div className="event-card-bottom">
        <small>{eventMonthLabel(event.startDate)} · {formatDay(event.startDate)} - {formatDay(event.endDate)} · {eventMetaLine(event)}</small>
        {(onEdit || onDelete) && event.source !== "system" && (
          <span className="event-card-actions">
            {onEdit && (
              <button className="event-edit-button" type="button" onClick={() => onEdit(event)} aria-label={`Редактировать событие ${event.title}`}>
                Редактировать
              </button>
            )}
            {onDelete && (
              <button className="event-delete-button" type="button" onClick={() => onDelete(event.id)} aria-label={`Удалить событие ${event.title}`}>
                <Trash2 size={14} />
                Удалить
              </button>
            )}
          </span>
        )}
      </div>
    </article>
  );
}

function buildMetricSummary(
  metric: Metric,
  totals: { plan: number; fact: number; forecast: number },
  monthDates: string[],
  todayIso: string,
  isClosedMonth: boolean,
  projectedForecast?: number,
): MetricSummary {
  const endValue = isClosedMonth ? totals.fact : projectedForecast ?? totals.forecast;
  const remainingDays = isClosedMonth ? 0 : Math.max(monthDates.filter((date) => date >= todayIso).length, 1);
  const baseDaily = Math.ceil(totals.plan / Math.max(monthDates.length, 1));
  const needToPlan = Math.max(totals.plan - totals.fact, 0);
  const dailyTarget = endValue >= totals.plan || isClosedMonth ? baseDaily : Math.ceil(needToPlan / remainingDays);

  return {
    metric,
    plan: totals.plan,
    fact: totals.fact,
    forecast: isClosedMonth ? null : endValue,
    completion: percent(totals.fact, totals.plan),
    deltaAbs: totals.fact - totals.plan,
    endValue,
    endLabel: isClosedMonth ? "факт месяца" : "прогноз Optima",
    dailyTarget,
    dailyLabel: endValue >= totals.plan || isClosedMonth ? "среднее для 100%" : "нужно в день для 100%",
  };
}

function buildMonthEndForecast(
  records: DailyRecord[],
  monthDates: string[],
  isClosedMonth: boolean,
  coefficients: ForecastCoefficients,
  planOverride?: Record<Metric, number>,
  trafficMode: TrafficMode = "op",
) {
  const lastFactDate = getLastFactDate(records);
  const remainingDates = isClosedMonth ? [] : monthDates.filter((date) => !lastFactDate || date > lastFactDate);

  return {
    isClosed: isClosedMonth,
    lastFactDate,
    remainingDatesCount: remainingDates.length,
    metrics: metrics.reduce<Record<Metric, { plan: number; fact: number; projected: number; completion: number; delta: number; baseDaily: number }>>((acc, metric) => {
      const metricRecords = records.filter((record) => record.metric === metric);
      const forecastParts = forecastMetricByFactAverage(metricRecords, metric, monthDates, isClosedMonth, coefficients, trafficMode);
      const fact = forecastParts.fact;
      const rawPlan = total(metricRecords, "plan");
      const plan = planOverride?.[metric] ?? rawPlan;
      const projected = !isClosedMonth && fact === 0 && planOverride?.[metric] !== undefined ? plan : forecastParts.projected;
      acc[metric] = {
        plan,
        fact,
        projected,
        completion: percent(projected, plan),
        delta: projected - plan,
        baseDaily: Math.round(forecastParts.baseDaily),
      };
      return acc;
    }, {} as Record<Metric, { plan: number; fact: number; projected: number; completion: number; delta: number; baseDaily: number }>),
  };
}

function forecastMetricByFactAverage(
  metricRecords: DailyRecord[],
  metric: Metric,
  monthDates: string[],
  isClosedMonth: boolean,
  coefficients: ForecastCoefficients,
  trafficMode: TrafficMode,
) {
  const recordsByCity = adminCities.map((city) => ({
    city,
    records: metricRecords.filter((record) => record.city === city),
  })).filter((group) => group.records.length > 0);

  let fact = 0;
  let projected = 0;
  let baseDailyTotal = 0;

  recordsByCity.forEach(({ city, records }) => {
    const factDates = monthDates.filter((date) => {
      const dayRecords = records.filter((record) => record.date === date);
      return dayRecords.some((record) => record.fact > 0 || recommendationValue(record) > 0 || omQualifiedValue(record) > 0);
    });
    const cityFact = records
      .filter((record) => factDates.includes(record.date))
      .reduce((sum, record) => sum + metricFactForTraffic(metric, recordToMetricTotal(record), trafficMode), 0);
    const cityPlan = total(records, "plan");

    if (isClosedMonth) {
      const closedFact = records.reduce((sum, record) => sum + metricFactForTraffic(metric, recordToMetricTotal(record), trafficMode), 0);
      fact += closedFact;
      projected += closedFact;
      return;
    }

    if (!factDates.length) {
      projected += cityPlan;
      return;
    }

    const lastFactDate = factDates[factDates.length - 1];
    const coefficientSum = factDates.reduce((sum, date) => sum + coefficientForCityMetric(city, metric, date, coefficients), 0);
    const baseDaily = coefficientSum > 0 ? cityFact / coefficientSum : 0;
    const futureProjection = monthDates
      .filter((date) => date > lastFactDate)
      .reduce((sum, date) => sum + baseDaily * coefficientForCityMetric(city, metric, date, coefficients), 0);

    fact += cityFact;
    projected += cityFact + futureProjection;
    baseDailyTotal += baseDaily;
  });

  return {
    fact: Math.round(fact),
    projected: Math.round(projected),
    baseDaily: baseDailyTotal,
  };
}

function getLastFactDate(records: DailyRecord[]): string | null {
  const factDates = records
    .filter((record) => record.fact > 0 || recommendationValue(record) > 0 || omQualifiedValue(record) > 0)
    .map((record) => record.date)
    .sort();
  return factDates[factDates.length - 1] ?? null;
}

function coefficientForRecord(record: DailyRecord, metric: Metric, date: string, coefficients: ForecastCoefficients): number {
  if (record.city === "МСК" || record.city === "СПБ" || record.city === "сообщения") {
    return coefficientForCityMetric(record.city, metric, date, coefficients);
  }
  return (coefficientForCityMetric("МСК", metric, date, coefficients) + coefficientForCityMetric("СПБ", metric, date, coefficients)) / 2;
}

function coefficientForCityMetric(city: City, metric: Metric, date: string, coefficients: ForecastCoefficients): number {
  const weekday = weekdayCoefficientKey(date);
  return coefficients[city][metric][weekday];
}

function weekdayCoefficientKey(dateIso: string): WeekdayCoefficientKey {
  const dayIndex = new Date(`${dateIso}T00:00:00Z`).getUTCDay();
  return coefficientWeekdays.find((weekday) => weekday.dayIndex === dayIndex)?.key ?? "mon";
}

function mergeTotals(weeks: WeekSummary[]): MetricTotals {
  return metrics.reduce<MetricTotals>((acc, metric) => {
    acc[metric] = weeks.reduce(
      (sum, week) => ({
        plan: sum.plan + week.totals[metric].plan,
        fact: sum.fact + week.totals[metric].fact,
        forecast: sum.forecast + week.totals[metric].forecast,
        recommendations: sum.recommendations + week.totals[metric].recommendations,
        omQualified: sum.omQualified + week.totals[metric].omQualified,
      }),
      { plan: 0, fact: 0, forecast: 0, recommendations: 0, omQualified: 0 },
    );
    return acc;
  }, {} as MetricTotals);
}

function recordToMetricTotal(record: DailyRecord) {
  return {
    plan: Number(record.plan || 0),
    fact: netFact(record),
    forecast: Number(record.forecast || 0),
    recommendations: recommendationValue(record),
    omQualified: omQualifiedValue(record),
  };
}

function metricFactFromRecords(records: DailyRecord[], metric: Metric, trafficMode: TrafficMode): number {
  return records.reduce((sum, record) => sum + metricFactForTraffic(metric, recordToMetricTotal(record), trafficMode), 0);
}

function applyOverallPlanOverrideToWeeks(
  weeks: WeekSummary[],
  config: MonthConfig,
  selectedScope: ReportScope,
): WeekSummary[] {
  if (selectedScope !== "Все" || !weeks.length) return weeks;

  const rawTotals = mergeTotals(weeks);
  const plansByMetric = metrics.reduce<Record<Metric, number[]>>((acc, metric) => {
    const rawPlan = rawTotals[metric].plan;
    const targetPlan = Number(config.plan[metric] ?? rawPlan);

    if (!rawPlan || !Number.isFinite(targetPlan) || targetPlan === rawPlan) {
      acc[metric] = weeks.map((week) => week.totals[metric].plan);
      return acc;
    }

    let distributed = 0;
    acc[metric] = weeks.map((week, index) => {
      if (index === weeks.length - 1) {
        return Math.max(0, Math.round(targetPlan - distributed));
      }
      const nextPlan = Math.max(0, Math.round((week.totals[metric].plan / rawPlan) * targetPlan));
      distributed += nextPlan;
      return nextPlan;
    });
    return acc;
  }, {} as Record<Metric, number[]>);

  return weeks.map((week, weekIndex) => ({
    ...week,
    totals: metrics.reduce<WeekSummary["totals"]>((acc, metric) => {
      acc[metric] = {
        ...week.totals[metric],
        plan: plansByMetric[metric][weekIndex],
      };
      return acc;
    }, {} as WeekSummary["totals"]),
  }));
}

function pickMonthByCompletion(months: Array<{ config: MonthConfig; weeks: WeekSummary[] }>, mode: "best" | "worst", trafficMode: TrafficMode = "op") {
  if (!months.length) return "нет данных";
  const sorted = [...months].sort((a, b) => {
    const aTotals = applyTrafficModeToTotals(mergeTotals(a.weeks), trafficMode);
    const bTotals = applyTrafficModeToTotals(mergeTotals(b.weeks), trafficMode);
    return percent(aTotals["Продажи"].fact, aTotals["Продажи"].plan) - percent(bTotals["Продажи"].fact, bTotals["Продажи"].plan);
  });
  return (mode === "best" ? sorted[sorted.length - 1] : sorted[0]).config.label;
}

function getMonthRangeLabel(months: Array<{ config: MonthConfig }>): string {
  if (!months.length) return "нет данных";
  const first = months[0].config.label;
  const last = months[months.length - 1].config.label;
  return first === last ? first : `${first} → ${last}`;
}

function getShortMonthLabel(config: MonthConfig): string {
  const monthName = config.label.split(" ")[0] ?? config.label;
  return monthName.length <= 3 ? monthName : monthName.slice(0, 3);
}

function getMonthMetricTitle(metric: Metric, trafficMode: TrafficMode = "op"): string {
  if (metric === "Квалы") return trafficMode === "marketing" ? "КВАЛ маркетинг" : "КВАЛ ОП";
  return metric.toUpperCase();
}

function getMetricDisplayTitle(metric: Metric, trafficMode: TrafficMode = "op"): string {
  if (metric === "Квалы") return trafficMode === "marketing" ? "КВАЛ МАРКЕТИНГ" : "КВАЛ ОП";
  return metric.toUpperCase();
}

function getMonthMetricTrend(current: MetricTotals, previous: MetricTotals | null, metric: Metric): "up" | "down" | "flat" {
  if (!previous) return "flat";

  const currentCompletion = percent(current[metric].fact, current[metric].plan);
  const previousCompletion = percent(previous[metric].fact, previous[metric].plan);
  return getValueTrend(currentCompletion, previousCompletion);
}

function buildMetricDailyChartData(
  meta: { metric: DailyMetricKey; sourceMetric: Metric; title: string },
  records: DailyRecord[],
  events: EventItem[],
  monthDates: string[],
  todayIso: string,
  trafficMode: TrafficMode,
): MetricDailyChartData {
  const metricRecords = records.filter((record) => record.metric === meta.sourceMetric);
  const hasAnyFact = metricRecords.some((record) => Number.isFinite(record.fact) && (record.fact > 0 || recommendationValue(record) > 0 || omQualifiedValue(record) > 0));

  return {
    ...meta,
    title: meta.sourceMetric === "Квалы" && trafficMode === "marketing" ? "КВАЛ маркетинг" : meta.title,
    points: monthDates.map((date) => {
      const dayRecords = metricRecords.filter((record) => record.date === date);
      const dayEvents = events.filter((event) =>
        event.startDate <= date &&
        date <= event.endDate &&
        (event.metric === "все" || event.metric === meta.sourceMetric),
      );
      const plan = sumNullable(dayRecords, "plan");
      const factTotal = sumNullable(dayRecords, "fact", meta.sourceMetric, trafficMode);
      const forecastRaw = sumNullable(dayRecords, "forecast");
      const forecast = forecastRaw ?? plan;
      const fact = factTotal !== null && (factTotal > 0 || hasAnyFact || date <= todayIso) ? factTotal : null;
      const corridorBase = forecast ?? plan;
      const forecastMin = corridorBase === null ? null : Math.max(0, Math.round(corridorBase * 0.88));
      const forecastMax = corridorBase === null ? null : Math.max(forecastMin ?? 0, Math.round(corridorBase * 1.12));

      return {
        date,
        dayLabel: String(Number(date.slice(8, 10))),
        fact,
        forecast,
        forecastMin,
        forecastMax,
        events: dayEvents,
      };
    }),
  };
}

function sumNullable(
  records: DailyRecord[],
  key: "plan" | "fact" | "forecast" | "recommendations" | "omQualified",
  metric?: Metric,
  trafficMode: TrafficMode = "op",
): number | null {
  if (!records.length) return null;
  return records.reduce((sum, record) => {
    if (key === "fact") return sum + metricFactForTraffic(metric ?? record.metric, recordToMetricTotal(record), trafficMode);
    if (key === "recommendations") return sum + recommendationValue(record);
    if (key === "omQualified") return sum + omQualifiedValue(record);
    const value = Number(record[key]);
    return Number.isFinite(value) ? sum + value : sum;
  }, 0);
}

function buildDailyPathSegments<T>(items: T[], getPoint: (item: T, index: number) => ChartLinePoint | null): string[] {
  const paths: string[] = [];
  let segment: ChartLinePoint[] = [];

  items.forEach((item, index) => {
    const point = getPoint(item, index);
    if (!point) {
      if (segment.length) paths.push(pointsToSvgPath(segment));
      segment = [];
      return;
    }
    segment.push(point);
  });

  if (segment.length) paths.push(pointsToSvgPath(segment));
  return paths;
}

function buildDailyAreaSegments<T>(
  items: T[],
  getPoint: (item: T, index: number) => { x: number; minY: number; maxY: number } | null,
): string[] {
  const paths: string[] = [];
  let segment: Array<{ x: number; minY: number; maxY: number }> = [];

  items.forEach((item, index) => {
    const point = getPoint(item, index);
    if (!point) {
      if (segment.length > 1) paths.push(areaPointsToSvgPath(segment));
      segment = [];
      return;
    }
    segment.push(point);
  });

  if (segment.length > 1) paths.push(areaPointsToSvgPath(segment));
  return paths;
}

function pointsToSvgPath(points: ChartLinePoint[]): string {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

function areaPointsToSvgPath(points: Array<{ x: number; minY: number; maxY: number }>): string {
  const upper = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.maxY}`).join(" ");
  const lower = [...points].reverse().map((point) => `L ${point.x} ${point.minY}`).join(" ");
  return `${upper} ${lower} Z`;
}

function uniqueEvents(events: EventItem[]): EventItem[] {
  const byId = new Map<string, EventItem>();
  events.forEach((event) => byId.set(event.id, event));
  return [...byId.values()];
}

function getEventRangeOnDailyChart(
  event: EventItem,
  points: DailyForecastPoint[],
  xForIndex: (index: number) => number,
): { event: EventItem; x: number; width: number } | null {
  const indexes = points
    .map((point, index) => ({ point, index }))
    .filter(({ point }) => event.startDate <= point.date && point.date <= event.endDate)
    .map(({ index }) => index);

  if (!indexes.length) return null;
  const start = Math.min(...indexes);
  const end = Math.max(...indexes);
  const x = xForIndex(start) - 16;
  const width = Math.max(32, xForIndex(end) - xForIndex(start) + 32);
  return { event, x, width };
}

function dailyPointTooltip(point: DailyForecastPoint): string {
  const lines = [
    `Дата: ${formatLongDate(point.date)}`,
    `Факт: ${formatNullableNumber(point.fact)}`,
    `Прогноз Optima: ${formatNullableNumber(point.forecast)}`,
    `Нижняя граница: ${formatNullableNumber(point.forecastMin)}`,
    `Верхняя граница: ${formatNullableNumber(point.forecastMax)}`,
  ];

  if (point.events.length) {
    const event = point.events[0];
    lines.push(`Событие: ${event.title}`);
    lines.push(`Тип: ${event.group === "internal" ? "внутреннее" : "внешнее"}`);
    lines.push(`Категория: ${event.type}`);
  }

  return lines.join("\n");
}

function formatNullableNumber(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value) ? "нет данных" : formatNumber(value);
}

function formatLongDate(dateIso: string): string {
  const [year, month, day] = dateIso.split("-").map(Number);
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(new Date(year, month - 1, day));
}

function groupEventsByDateRange(events: EventItem[]): Array<{ label: string; events: EventItem[] }> {
  const groups = new Map<string, EventItem[]>();
  [...events]
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.endDate.localeCompare(b.endDate) || a.title.localeCompare(b.title))
    .forEach((event) => {
      const label = event.startDate === event.endDate
        ? formatDay(event.startDate)
        : `${formatDay(event.startDate)} - ${formatDay(event.endDate)}`;
      groups.set(label, [...(groups.get(label) ?? []), event]);
    });

  return [...groups.entries()].map(([label, groupEvents]) => ({ label, events: groupEvents }));
}

function getValueTrend(current: number, previous: number | null): "up" | "down" | "flat" {
  if (previous === null) return "flat";
  if (current > previous) return "up";
  if (current < previous) return "down";
  return "flat";
}

function trendClass(delta: number, isFirstWeek = false): "positive" | "negative" | "warning" {
  if (isFirstWeek) return "warning";
  if (delta > 1) return "positive";
  if (delta < -1) return "negative";
  return "warning";
}

function isFutureWeekWithoutFact(week: WeekSummary, metric: Metric, todayIso: string): boolean {
  return week.startDate > todayIso && week.totals[metric].fact <= 0;
}

function formatPercentDelta(delta: number, trend: "positive" | "negative" | "warning"): string {
  if (trend === "warning" && delta === 0) return "база";
  const rounded = Math.round(delta);
  if (trend === "positive") return `↑ +${Math.abs(rounded)}%`;
  if (trend === "negative") return `↓ -${Math.abs(rounded)}%`;
  return "0%";
}

function tooltipEdgeClass(index: number, length: number): string {
  if (index === 0) return "tooltip-left-edge";
  if (index === length - 1) return "tooltip-right-edge";
  return "";
}

function getNiceAxisMax(value: number): number {
  const safeValue = Math.max(value, 1);
  const power = 10 ** Math.floor(Math.log10(safeValue));
  const normalized = safeValue / power;
  const multiplier = [1, 1.5, 2, 3, 4, 5, 6, 8, 10].find((step) => normalized <= step) ?? 10;
  return multiplier * power;
}

function getAxisLabels(max: number): number[] {
  const step = max / 4;
  return [4, 3, 2, 1].map((part) => Math.round(step * part));
}

function buildLineSegments<T>(
  values: T[],
  max: number,
  getValue: (item: T) => number,
  shouldShow: (item: T) => boolean,
  shouldBreak?: (current: T, previous: T) => boolean,
  range: ChartLineRange = { top: 10, height: 78 },
): ChartLineSegment[] {
  const segments: ChartLineSegment[] = [];
  let currentSegment: ChartLineSegment = [];
  let previousVisible: T | null = null;

  values.forEach((item, index) => {
    if (!shouldShow(item)) {
      if (currentSegment.length) segments.push(currentSegment);
      currentSegment = [];
      previousVisible = null;
      return;
    }

    if (previousVisible && shouldBreak?.(item, previousVisible)) {
      if (currentSegment.length) segments.push(currentSegment);
      currentSegment = [];
    }

    currentSegment.push({
      x: values.length === 1 ? 50 : ((index + 0.5) / values.length) * 100,
      y: range.top + ((max - getValue(item)) / max) * range.height,
    });
    previousVisible = item;
  });

  if (currentSegment.length) segments.push(currentSegment);
  return segments;
}

function buildSmoothPath(segment: ChartLineSegment): string {
  return segment.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`;

    const previous = segment[index - 1];
    const controlX = (previous.x + point.x) / 2;
    return `${path} C ${controlX} ${previous.y}, ${controlX} ${point.y}, ${point.x} ${point.y}`;
  }, "");
}

function getPageCopy(mode: Mode) {
  const copy: Record<Mode, { title: string; subtitle: string }> = {
    allMonths: {
      title: "Все месяцы",
      subtitle: "Сравнение месяцев, недельная разбивка, прогноз и события в одном управленческом маршруте.",
    },
    month: {
      title: "Обзор месяца",
      subtitle: "Статус выбранного месяца, KPI, прогноз на конец, недельная динамика и события периода.",
    },
    monthDaily: {
      title: "Месяц по дням",
      subtitle: "Дневная динамика факта, прогнозный коридор Optima и события выбранного месяца.",
    },
    week: {
      title: "Неделя",
      subtitle: "Одна неделя по дням: где началось отклонение и какие события были рядом.",
    },
    admin: {
      title: "Админка",
      subtitle: "Ежедневный ввод факта по МСК, СПБ, сообщениям и карта событий для автоматической сборки отчетов.",
    },
    messages: {
      title: "Сообщения",
      subtitle: "Отдельная панель для сообщений, чтобы не смешивать их с основными лидами.",
    },
    sources: {
      title: "Источники",
      subtitle: "Лиды, КВАЛ и продажи по каналам привлечения без смешивания с городами и сообщениями.",
    },
    events: {
      title: "События",
      subtitle: "Карта внутренних и внешних факторов по датам и периодам.",
    },
  };
  return copy[mode];
}

function nextMonthDraft(config: MonthConfig, coefficients: ForecastCoefficients): MonthDraft {
  const nextMonth = new Date(config.year, config.monthIndex + 1, 1);
  const dailyAverageByCity = estimateDailyAverageByCity(config, coefficients);
  const plansByCity = buildMonthlyPlansFromDailyAverage(nextMonth.getFullYear(), nextMonth.getMonth(), dailyAverageByCity, coefficients);
  return {
    year: nextMonth.getFullYear(),
    monthIndex: nextMonth.getMonth(),
    plansByCity,
    dailyAverageByCity,
  };
}

function buildMonthlyPlansFromDailyAverage(
  year: number,
  monthIndex: number,
  dailyAverageByCity: PlanByCity,
  coefficients: ForecastCoefficients,
): PlanByCity {
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const dates = getMonthDates(year, monthIndex, daysInMonth);
  return adminCities.reduce<PlanByCity>((cityAcc, city) => {
    cityAcc[city] = metrics.reduce<Record<Metric, number>>((metricAcc, metric) => {
      metricAcc[metric] = dates.reduce(
        (sum, date) => sum + Math.round((dailyAverageByCity[city][metric] || 0) * coefficientForCityMetric(city, metric, date, coefficients)),
        0,
      );
      return metricAcc;
    }, {} as Record<Metric, number>);
    return cityAcc;
  }, {} as PlanByCity);
}

function buildWeightedPlanRecordsForMonth(
  config: MonthConfig,
  dailyAverageByCity: PlanByCity,
  coefficients: ForecastCoefficients,
): DailyRecord[] {
  const dates = getMonthDates(config.year, config.monthIndex, config.daysInMonth);
  return dates.flatMap((date) =>
    metrics.flatMap((metric) =>
      adminCities.map((city) => {
        const plan = Math.round((dailyAverageByCity[city][metric] || 0) * coefficientForCityMetric(city, metric, date, coefficients));
        return {
          id: `${date}-${city}-${metric}`,
          date,
          city,
          channel: city === "сообщения" ? "Сообщения" : "Город",
          metric,
          plan,
          fact: 0,
          forecast: plan,
          recommendations: 0,
          omQualified: 0,
          comment: "",
        };
      }),
    ),
  );
}

function estimateDailyAverageByCity(config: MonthConfig, coefficients: ForecastCoefficients): PlanByCity {
  if (config.dailyAverageByCity) return clonePlansByCity(config.dailyAverageByCity);

  const plansByCity = config.plansByCity ?? splitPlanByCity(config.plan);
  const dates = getMonthDates(config.year, config.monthIndex, config.daysInMonth);
  return adminCities.reduce<PlanByCity>((cityAcc, city) => {
    cityAcc[city] = metrics.reduce<Record<Metric, number>>((metricAcc, metric) => {
      const coefficientSum = dates.reduce((sum, date) => sum + coefficientForCityMetric(city, metric, date, coefficients), 0);
      metricAcc[metric] = coefficientSum > 0 ? Math.round(plansByCity[city][metric] / coefficientSum) : 0;
      return metricAcc;
    }, {} as Record<Metric, number>);
    return cityAcc;
  }, {} as PlanByCity);
}

function groupDatesByWeek(dates: string[]): Record<number, string[]> {
  return dates.reduce<Record<number, string[]>>((acc, date) => {
    const week = getWeekOfMonth(date);
    acc[week] = [...(acc[week] ?? []), date];
    return acc;
  }, {});
}

function buildAutomaticWeekEvents(months: MonthConfig[]): EventItem[] {
  const uniqueMonths = [...new Map(months.map((month) => [month.monthKey, month])).values()];

  return uniqueMonths.flatMap((month) => {
    const datesByWeek = groupDatesByWeek(getMonthDates(month.year, month.monthIndex, month.daysInMonth));
    return Object.entries(datesByWeek)
      .filter(([, dates]) => dates.length < 7)
      .map(([week, dates]) => ({
        id: `auto-short-week-${month.monthKey}-${week}`,
        startDate: dates[0],
        endDate: dates[dates.length - 1],
        title: "Короткая неделя",
        type: "прочее" as EventType,
        group: "external" as EventGroup,
        source: "system" as const,
        expectedEffect: "негативный" as Effect,
        actualEffect: "негативный" as Effect,
        importance: 2 as const,
        city: "МСК + СПБ" as EventCity,
        metric: "все" as const,
        description: `В неделе ${dates.length} дн. вместо 7, поэтому сравнение с полной неделей может быть ниже.`,
      }));
  });
}

function mergeEventLists(manualEvents: EventItem[], automaticEvents: EventItem[]): EventItem[] {
  const manualIds = new Set(manualEvents.map((event) => event.id));
  return [...manualEvents, ...automaticEvents.filter((event) => !manualIds.has(event.id))].sort(sortEvents);
}

function sortEvents(a: EventItem, b: EventItem): number {
  return a.startDate.localeCompare(b.startDate) || a.endDate.localeCompare(b.endDate) || a.title.localeCompare(b.title);
}

function groupEventsByMonth(events: EventItem[]): Array<{ monthKey: string; label: string; events: EventItem[] }> {
  const groups = new Map<string, EventItem[]>();
  [...events]
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title))
    .forEach((event) => {
      const monthKey = event.startDate.slice(0, 7);
      groups.set(monthKey, [...(groups.get(monthKey) ?? []), event]);
    });

  return [...groups.entries()].map(([monthKey, groupEvents]) => ({
    monthKey,
    label: eventMonthLabel(`${monthKey}-01`),
    events: groupEvents,
  }));
}

function eventMonthLabel(date: string): string {
  const [year, month] = date.split("-").map(Number);
  return `${monthNames[month - 1]} ${year}`;
}

function eventCityLabel(city: EventCity): string {
  if (city === "все") return "МСК + СПБ";
  return cityLabels[city as City] ?? city;
}

function eventMetaLine(event: EventItem): string {
  return [
    eventCityLabel(event.city),
    event.type,
    event.actualEffect,
    eventLeadSourceLabel(event.leadSource),
  ].filter(Boolean).join(" · ");
}

function eventLeadSourceLabel(source: string | undefined): string {
  const normalized = normalizeEventLeadSource(source ?? "");
  return normalized ? `источник: ${normalized}` : "";
}

function normalizeEventLeadSource(value: string | undefined): string {
  const normalized = normalizeSourceName(value ?? "");
  if (!normalized || normalized === noLeadSourceOption) return "";
  if (normalized.toLowerCase() === otherLeadSourceOption) return otherLeadSourceOption;
  return normalized;
}

function parseLeadSourceFromDescription(description: string | undefined): string {
  return description?.match(leadSourceCommentPattern)?.[1] ?? "";
}

function stripLeadSourceFromDescription(description: string | undefined): string {
  return String(description ?? "").replace(leadSourceCommentPattern, "").trim();
}

function encodeLeadSourceInDescription(description: string | undefined, leadSource: string | undefined): string {
  const cleanDescription = stripLeadSourceFromDescription(description);
  const normalizedSource = normalizeEventLeadSource(leadSource);
  if (!normalizedSource) return cleanDescription;
  return `${cleanDescription}${cleanDescription ? " " : ""}[LEAD_SOURCE=${normalizedSource}]`;
}

function serializeEventForRemote(event: EventItem): EventItem {
  return {
    ...event,
    leadSource: normalizeEventLeadSource(event.leadSource),
    description: encodeLeadSourceInDescription(event.description, event.leadSource),
  };
}

function normalizeSourceName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function sourceNameEquals(left: string, right: string): boolean {
  return normalizeSourceName(left).toLowerCase() === normalizeSourceName(right).toLowerCase();
}

function isSourceMetaRecord(record: DailyRecord): boolean {
  return record.city === sourceRecordCity && record.channel.startsWith(sourceMetaChannelPrefix);
}

function isSourceValueRecord(record: DailyRecord): boolean {
  return record.city === sourceRecordCity && !isSourceMetaRecord(record);
}

function sourceNameFromMeta(record: DailyRecord): string {
  return normalizeSourceName(record.channel.slice(sourceMetaChannelPrefix.length));
}

function getSourceMeta(records: DailyRecord[]) {
  return records.filter(isSourceMetaRecord).reduce(
    (acc, record) => {
      const source = sourceNameFromMeta(record);
      if (!source) return acc;
      if ((record.comment ?? "").includes(sourceMetaCommentHidden)) {
        acc.hidden.add(source.toLowerCase());
      } else {
        acc.active.add(source);
      }
      return acc;
    },
    { active: new Set<string>(), hidden: new Set<string>() },
  );
}

function getActiveLeadSources(records: DailyRecord[]): string[] {
  const meta = getSourceMeta(records);
  const names = new Set<string>(defaultLeadSources);

  meta.active.forEach((source) => {
    if (!meta.hidden.has(source.toLowerCase())) names.add(source);
  });

  records.filter(isSourceValueRecord).forEach((record) => {
    const source = normalizeSourceName(record.channel);
    if (!source || meta.hidden.has(source.toLowerCase())) return;
    if (record.fact > 0 || record.plan > 0 || record.forecast > 0 || record.recommendations > 0 || record.omQualified > 0) {
      names.add(source);
    }
  });

  return [...names].sort((a, b) => {
    const aDefault = defaultLeadSources.findIndex((source) => sourceNameEquals(source, a));
    const bDefault = defaultLeadSources.findIndex((source) => sourceNameEquals(source, b));
    if (aDefault >= 0 || bDefault >= 0) return (aDefault < 0 ? 999 : aDefault) - (bDefault < 0 ? 999 : bDefault);
    return a.localeCompare(b, "ru");
  });
}

function emptySourceMetricDraft(): SourceMetricDraft {
  return { Лиды: 0, Квалы: 0, Продажи: 0 };
}

function createSourceDraft(records: DailyRecord[], date: string, sources: string[]): Record<string, SourceMetricDraft> {
  return sources.reduce<Record<string, SourceMetricDraft>>((acc, source) => {
    acc[source] = metrics.reduce<SourceMetricDraft>((metricAcc, metric) => {
      metricAcc[metric] = findDailyRecord(records, date, sourceRecordCity, metric, source)?.fact ?? 0;
      return metricAcc;
    }, emptySourceMetricDraft());
    return acc;
  }, {});
}

function getSourceMetricTotals(records: DailyRecord[], source: string): Record<Metric, number> {
  return metrics.reduce<Record<Metric, number>>((acc, metric) => {
    acc[metric] = records
      .filter((record) => isSourceValueRecord(record) && sourceNameEquals(record.channel, source) && record.metric === metric)
      .reduce((sum, record) => sum + Math.max(0, Number(record.fact || 0)), 0);
    return acc;
  }, {} as Record<Metric, number>);
}

function sourceDailyUpdate(date: string, source: string, metric: Metric, fact: number): DailyValueUpdate {
  return {
    id: dailyRecordKey(date, sourceRecordCity, metric, source),
    date,
    city: sourceRecordCity,
    channel: source,
    metric,
    plan: 0,
    fact,
    forecast: 0,
    recommendations: 0,
    omQualified: 0,
    comment: "",
  };
}

function sourceMetaUpdate(date: string, source: string, active: boolean): DailyValueUpdate {
  const channel = `${sourceMetaChannelPrefix}${source}`;
  return {
    id: dailyRecordKey(date, sourceRecordCity, "Лиды", channel),
    date,
    city: sourceRecordCity,
    channel,
    metric: "Лиды",
    plan: 0,
    fact: 0,
    forecast: 0,
    recommendations: 0,
    omQualified: 0,
    comment: active ? sourceMetaCommentActive : sourceMetaCommentHidden,
  };
}

function createDailyFactDraft(records: DailyRecord[], date: string): DailyAdminDraft {
  return adminCities.reduce<DailyAdminDraft>((acc, city) => {
    acc[city] = metrics.reduce<Record<Metric, DailyAdminMetricDraft>>((metricAcc, metric) => {
      const record = findDailyRecord(records, date, city, metric);
      metricAcc[metric] = {
        fact: record?.fact ?? 0,
        recommendations: record?.recommendations ?? 0,
        omQualified: record?.omQualified ?? 0,
      };
      return metricAcc;
    }, {} as Record<Metric, DailyAdminMetricDraft>);
    return acc;
  }, {} as DailyAdminDraft);
}

function findDailyRecord(records: DailyRecord[], date: string, city: DailyRecordCity, metric: Metric, channel?: string): DailyRecord | undefined {
  return records.find((record) => {
    if (record.date !== date || record.city !== city || record.metric !== metric) return false;
    if (city === sourceRecordCity && channel) return sourceNameEquals(record.channel, channel);
    return true;
  });
}

function dailyRecordNetFact(record: DailyRecord | undefined): number {
  return record ? netFact(record) : 0;
}

function validateDailyValueUpdates(values: DailyValueUpdate[]): boolean {
  return values.some((value) => {
    const checkedValues = [value.plan, value.fact, value.forecast, value.recommendations, value.omQualified].filter((item) => item !== undefined);
    return checkedValues.some((item) => {
      const numericValue = Number(item);
      return !Number.isFinite(numericValue) || numericValue < 0;
    });
  });
}

function prepareDailyValuesForRemote(values: DailyValueUpdate[], currentRecords: DailyRecord[]): DailyValueUpdate[] {
  return values.map((value) => {
    const current = findDailyRecord(currentRecords, value.date, value.city, value.metric, value.channel);
    const plan = value.plan ?? current?.plan ?? 0;
    const forecast = value.forecast ?? current?.forecast ?? plan;
    const omQualified = value.metric === "Квалы" ? value.omQualified ?? current?.omQualified ?? 0 : 0;

    return {
      ...value,
      plan,
      forecast,
      omQualified,
      comment: encodeOmQualifiedInComment(value.comment ?? current?.comment ?? "", omQualified),
    };
  });
}

async function verifySharedDailySave(values: DailyValueUpdate[]) {
  const importantValues = values.filter((value) =>
    value.fact !== undefined || value.recommendations !== undefined || value.omQualified !== undefined,
  );
  if (!importantValues.length) return;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) {
      await waitForGoogleSheetRefresh(1200 * attempt);
    }

    const snapshot = await loadPublicSheetSnapshot(seedMonthConfigs);
    const recordMap = new Map(snapshot.records.map((record) => [dailyRecordKey(record.date, record.city, record.metric, record.channel), record]));
    const allSaved = importantValues.every((value) => {
      const record = recordMap.get(dailyRecordKey(value.date, value.city, value.metric, value.channel));
      if (!record) return false;
      if (value.fact !== undefined && record.fact !== Math.max(0, Number(value.fact) || 0)) return false;
      if (value.recommendations !== undefined && record.recommendations !== Math.max(0, Number(value.recommendations) || 0)) return false;
      if (value.metric === "Квалы" && value.omQualified !== undefined && record.omQualified !== Math.max(0, Number(value.omQualified) || 0)) return false;
      return true;
    });

    if (allSaved) return;
  }

  throw new Error("Google Sheets пока не вернул сохраненные значения. Нажмите сохранить еще раз или проверьте доступ Apps Script.");
}

function waitForGoogleSheetRefresh(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function sanitizeDailyValueUpdate(value: DailyValueUpdate): DailyValueUpdate {
  return {
    ...value,
    plan: value.plan === undefined ? undefined : Math.max(0, Number(value.plan) || 0),
    fact: value.fact === undefined ? undefined : Math.max(0, Number(value.fact) || 0),
    forecast: value.forecast === undefined ? undefined : Math.max(0, Number(value.forecast) || 0),
    recommendations: value.recommendations === undefined ? undefined : Math.max(0, Number(value.recommendations) || 0),
    omQualified: value.omQualified === undefined ? undefined : Math.max(0, Number(value.omQualified) || 0),
  };
}

function applyDailyValuesToRecords(current: DailyRecord[], values: DailyValueUpdate[]): DailyRecord[] {
  const byKey = new Map(current.map((record) => [dailyRecordKey(record.date, record.city, record.metric, record.channel), record]));

  values.forEach((value) => {
    const key = dailyRecordKey(value.date, value.city, value.metric, value.channel);
    const previous = byKey.get(key);
    byKey.set(key, mergeDailyRecord(previous, value));
  });

  return [...byKey.values()].sort((a, b) => a.date.localeCompare(b.date) || a.city.localeCompare(b.city) || a.metric.localeCompare(b.metric));
}

function mergeDailyRecord(previous: DailyRecord | undefined, value: DailyValueUpdate): DailyRecord {
  return {
    id: value.id ?? previous?.id ?? dailyRecordKey(value.date, value.city, value.metric, value.channel),
    date: value.date,
    city: value.city,
    channel: value.channel ?? previous?.channel ?? (value.city === "сообщения" ? "Сообщения" : value.city === sourceRecordCity ? "Источник" : "Город"),
    metric: value.metric,
    plan: value.plan ?? previous?.plan ?? 0,
    fact: value.fact ?? previous?.fact ?? 0,
    forecast: value.forecast ?? previous?.forecast ?? value.fact ?? previous?.fact ?? 0,
    recommendations: value.recommendations ?? previous?.recommendations ?? 0,
    omQualified: value.metric === "Квалы" ? value.omQualified ?? previous?.omQualified ?? 0 : 0,
    comment: stripOmQualifiedFromComment(value.comment ?? previous?.comment ?? ""),
    updatedAt: new Date().toISOString(),
  };
}

function normalizeDailyRecord(record: DailyRecord): DailyRecord {
  const comment = record.comment ?? "";
  return {
    ...record,
    plan: Number(record.plan || 0),
    fact: Number(record.fact || 0),
    forecast: Number(record.forecast || 0),
    recommendations: Number(record.recommendations || 0),
    omQualified: record.metric === "Квалы" ? Number(record.omQualified || 0) || parseOmQualifiedFromComment(comment) : 0,
    comment: stripOmQualifiedFromComment(comment),
    updatedAt: record.updatedAt ?? "",
  };
}

const omQualifiedCommentPattern = /\[OM_KVAL=([\d.,]+)\]/i;

function encodeOmQualifiedInComment(comment: string, value: number): string {
  const cleanComment = stripOmQualifiedFromComment(comment);
  if (value <= 0) return cleanComment;
  return `${cleanComment}${cleanComment ? " " : ""}[OM_KVAL=${Math.round(value)}]`;
}

function parseOmQualifiedFromComment(comment: string): number {
  const match = comment.match(omQualifiedCommentPattern);
  if (!match) return 0;
  const value = Number(match[1].replace(",", "."));
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function stripOmQualifiedFromComment(comment: string): string {
  return comment.replace(omQualifiedCommentPattern, "").trim();
}

function dailyRecordKey(date: string, city: DailyRecordCity, metric: Metric, channel?: string): string {
  if (city === sourceRecordCity && channel) {
    return `${date}-${city}-${channel}-${metric}`;
  }
  return `${date}-${city}-${metric}`;
}

function validateAggregates(records: DailyRecord[]): string | null {
  const monthMetricKeys = new Set(records.map((record) => `${record.date.slice(0, 7)}::${record.metric}`));

  for (const key of monthMetricKeys) {
    const [monthKey, metric] = key.split("::") as [string, Metric];
    const monthMetricRecords = records.filter((record) => record.date.startsWith(monthKey) && record.metric === metric);
    const mskFact = total(monthMetricRecords.filter((record) => record.city === "МСК"), "fact");
    const spbFact = total(monthMetricRecords.filter((record) => record.city === "СПБ"), "fact");
    const allFact = total(monthMetricRecords.filter((record) => record.city === "Все"), "fact");

    if (allFact > 0 && mskFact + spbFact > 0 && allFact !== mskFact + spbFact) {
      return "Сохранено. Итоги и графики обновлены.";
    }
  }

  return null;
}

function splitPlanByCity(plan: Record<Metric, number>): PlanByCity {
  return {
    МСК: {
      Лиды: Math.round(plan["Лиды"] * 0.58),
      Квалы: Math.round(plan["Квалы"] * 0.58),
      Продажи: Math.round(plan["Продажи"] * 0.58),
    },
    СПБ: {
      Лиды: Math.round(plan["Лиды"] * 0.42),
      Квалы: Math.round(plan["Квалы"] * 0.42),
      Продажи: Math.round(plan["Продажи"] * 0.42),
    },
    сообщения: {
      Лиды: Math.round(plan["Лиды"] * 0.1),
      Квалы: Math.round(plan["Квалы"] * 0.1),
      Продажи: Math.round(plan["Продажи"] * 0.1),
    },
  };
}

function clonePlansByCity(plansByCity: PlanByCity): PlanByCity {
  return adminCities.reduce<PlanByCity>((acc, city) => {
    acc[city] = { ...plansByCity[city] };
    return acc;
  }, {} as PlanByCity);
}

function upsertMonthConfig(configs: MonthConfig[], config: MonthConfig): MonthConfig[] {
  const exists = configs.some((item) => item.monthKey === config.monthKey);
  const next = exists ? configs.map((item) => (item.monthKey === config.monthKey ? config : item)) : [...configs, config];
  return next.sort((a, b) => a.monthKey.localeCompare(b.monthKey));
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function mergePublicSheetRecords(currentRecords: DailyRecord[], publicRecords: DailyRecord[]): DailyRecord[] {
  const recordMap = new Map(currentRecords.map((record) => [record.id, record]));

  publicRecords.forEach((record) => {
    const current = recordMap.get(record.id);
    const currentUpdatedAt = parseRecordUpdatedAt(current?.updatedAt);
    const publicUpdatedAt = parseRecordUpdatedAt(record.updatedAt);

    if (current && currentUpdatedAt && (!publicUpdatedAt || currentUpdatedAt > publicUpdatedAt)) {
      recordMap.set(record.id, {
        ...current,
        plan: record.plan || current.plan,
        forecast: record.forecast || current.forecast,
      });
      return;
    }

    recordMap.set(record.id, {
      ...record,
      recommendations: current?.recommendations ?? record.recommendations,
      omQualified: current?.omQualified ?? record.omQualified,
      comment: current?.comment ?? record.comment,
    });
  });

  return [...recordMap.values()].sort((a, b) => a.date.localeCompare(b.date) || a.city.localeCompare(b.city) || a.metric.localeCompare(b.metric));
}

function parseRecordUpdatedAt(value: string | undefined): number {
  if (!value) return 0;

  const iso = Date.parse(value);
  if (Number.isFinite(iso)) return iso;

  const match = value.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return 0;

  const [, day, month, year, hour, minute, second = "0"] = match;
  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  ).getTime();
}

function loadInitialState() {
  const fallback = {
    monthConfigs: seedMonthConfigs,
    records: buildSeedRecords(),
    events: seedEvents,
    selectedMonthKey: monthConfig.monthKey,
    forecastCoefficients: createDefaultForecastCoefficients(),
  };

  if (typeof window === "undefined") return fallback;

  try {
    const rawState =
      window.localStorage.getItem(storageKey) ??
      legacyStorageKeys.map((key) => window.localStorage.getItem(key)).find((state): state is string => Boolean(state));
    if (!rawState) return fallback;

    const parsed = JSON.parse(rawState) as Partial<typeof fallback>;
    if (!Array.isArray(parsed.monthConfigs) || !Array.isArray(parsed.records) || !Array.isArray(parsed.events)) {
      return fallback;
    }

    const storedMonthConfigs = dedupeMonthConfigs(parsed.monthConfigs.map(normalizeMonthConfig));
    const events = parsed.events.map(normalizeEvent).filter((event) => !legacySeedEventIds.has(event.id));
    const storedRecords = sanitizeStoredRecords(parsed.records, getTodayIso());
    const fallbackLatestDate = getLatestActualRecordDate(fallback.records);
    const storedLatestDate = getLatestActualRecordDate(storedRecords);

    if (fallbackLatestDate && (!storedLatestDate || storedLatestDate < fallbackLatestDate)) {
      return fallback;
    }

    const monthConfigs = mergeSeedMonthConfigs(fallback.monthConfigs, storedMonthConfigs);
    const records = mergeSeedRecords(fallback.records, storedRecords);

    return {
      monthConfigs,
      records,
      events,
      selectedMonthKey: parsed.selectedMonthKey || monthConfigs[monthConfigs.length - 1]?.monthKey || fallback.selectedMonthKey,
      forecastCoefficients: normalizeForecastCoefficients(parsed.forecastCoefficients),
    };
  } catch {
    return fallback;
  }
}

function mergeSeedMonthConfigs(seedConfigs: MonthConfig[], storedConfigs: MonthConfig[]): MonthConfig[] {
  const configMap = new Map(storedConfigs.map((config) => [config.monthKey, config]));
  seedConfigs.forEach((config) => {
    const stored = configMap.get(config.monthKey);
    configMap.set(config.monthKey, stored ? { ...stored, ...config } : config);
  });
  return [...configMap.values()].sort((a, b) => a.monthKey.localeCompare(b.monthKey));
}

function dedupeMonthConfigs(configs: MonthConfig[]): MonthConfig[] {
  return [...new Map(configs.map((config) => [config.monthKey, config])).values()]
    .sort((a, b) => a.monthKey.localeCompare(b.monthKey));
}

function mergeSeedRecords(seedRecords: DailyRecord[], storedRecords: DailyRecord[]): DailyRecord[] {
  const recordMap = new Map(seedRecords.map((record) => [record.id, record]));
  storedRecords.forEach((record) => recordMap.set(record.id, record));
  return [...recordMap.values()].sort((a, b) => a.date.localeCompare(b.date) || a.city.localeCompare(b.city) || a.metric.localeCompare(b.metric));
}

function getLatestActualRecordDate(records: DailyRecord[]): string | null {
  return records.reduce<string | null>((latestDate, record) => {
    if (record.fact <= 0 && record.recommendations <= 0 && record.omQualified <= 0) return latestDate;
    if (!latestDate || record.date > latestDate) return record.date;
    return latestDate;
  }, null);
}

function createDefaultForecastCoefficients(): ForecastCoefficients {
  return adminCities.reduce<ForecastCoefficients>((cityAcc, city) => {
    cityAcc[city] = metrics.reduce<Record<Metric, Record<WeekdayCoefficientKey, number>>>((metricAcc, metric) => {
      metricAcc[metric] = coefficientWeekdays.reduce<Record<WeekdayCoefficientKey, number>>((weekdayAcc, weekday) => {
        weekdayAcc[weekday.key] = weekday.defaultValue;
        return weekdayAcc;
      }, {} as Record<WeekdayCoefficientKey, number>);
      return metricAcc;
    }, {} as Record<Metric, Record<WeekdayCoefficientKey, number>>);
    return cityAcc;
  }, {} as ForecastCoefficients);
}

function normalizeForecastCoefficients(value: unknown): ForecastCoefficients {
  const defaults = createDefaultForecastCoefficients();
  if (!value || typeof value !== "object") return defaults;

  const source = value as Partial<ForecastCoefficients>;
  return adminCities.reduce<ForecastCoefficients>((cityAcc, city) => {
    cityAcc[city] = metrics.reduce<Record<Metric, Record<WeekdayCoefficientKey, number>>>((metricAcc, metric) => {
      metricAcc[metric] = coefficientWeekdays.reduce<Record<WeekdayCoefficientKey, number>>((weekdayAcc, weekday) => {
        const rawValue = source[city]?.[metric]?.[weekday.key];
        const numericValue = Number(rawValue);
        weekdayAcc[weekday.key] = Number.isFinite(numericValue) && numericValue >= 0 ? numericValue : defaults[city][metric][weekday.key];
        return weekdayAcc;
      }, {} as Record<WeekdayCoefficientKey, number>);
      return metricAcc;
    }, {} as Record<Metric, Record<WeekdayCoefficientKey, number>>);
    return cityAcc;
  }, {} as ForecastCoefficients);
}

function sanitizeStoredRecords(records: DailyRecord[], todayIso: string): DailyRecord[] {
  return records.map((record) => {
    const normalized = normalizeDailyRecord(record);
    if (normalized.date > todayIso && (normalized.fact > 0 || normalized.recommendations > 0 || normalized.omQualified > 0)) {
      return { ...normalized, fact: 0, recommendations: 0, omQualified: 0 };
    }
    return normalized;
  });
}

function normalizeMonthConfig(config: MonthConfig): MonthConfig {
  const plansByCity = config.plansByCity ?? splitPlanByCity(config.plan);
  const combinedPlan = combineReportPlan(plansByCity);
  const plan = metrics.reduce<Record<Metric, number>>((acc, metric) => {
    const explicitPlan = Number(config.plan?.[metric]);
    acc[metric] = Number.isFinite(explicitPlan) && explicitPlan >= 0 ? explicitPlan : combinedPlan[metric];
    return acc;
  }, {} as Record<Metric, number>);
  return {
    ...config,
    label: config.label.replace(/\sг\.$/, ""),
    plansByCity,
    plan,
    status: config.status ?? "active",
  };
}

function normalizeEvent(event: EventItem): EventItem {
  const type = event.type;
  const description = stripLeadSourceFromDescription(event.description);
  return {
    ...event,
    group: event.group ?? (internalEventTypes.includes(type) ? "internal" : "external"),
    source: event.source ?? "manual",
    leadSource: normalizeEventLeadSource(event.leadSource ?? parseLeadSourceFromDescription(event.description)),
    description,
  };
}

function loadAdminPassword(): string {
  if (typeof window === "undefined") return fallbackAdminPassword;
  return window.localStorage.getItem(adminPasswordStorageKey) || fallbackAdminPassword;
}

function saveAdminPassword(password: string) {
  if (typeof window === "undefined") return;

  const normalized = password.trim();
  if (normalized) {
    window.localStorage.setItem(adminPasswordStorageKey, normalized);
  } else {
    window.localStorage.removeItem(adminPasswordStorageKey);
  }
}

function saveLocalState(state: ReturnType<typeof loadInitialState>) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(storageKey, JSON.stringify({
      ...state,
      monthConfigs: dedupeMonthConfigs(state.monthConfigs),
    }));
  } catch {
    // Local storage can be blocked; the current session still works.
  }
}

function getTodayIso(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("ru-RU").format(Math.round(value));
}

function effectClass(effect: Effect) {
  if (effect === "положительный") return "positive";
  if (effect === "негативный") return "negative";
  return "unknown";
}

const monthNames = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];
