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
import { useEffect, useMemo, useState } from "react";
import {
  buildSeedRecords,
  combineReportPlan,
  createMonthConfig,
  metrics,
  monthConfig,
  monthConfigs as seedMonthConfigs,
  seedEvents,
} from "./data/dashboardMock";
import { callReportApi, isReportApiConfigured, type MonthPayload } from "./api/reportApi";
import { buildAttentionItems } from "./lib/insights";
import {
  buildConversions,
  buildMetricTotals,
  buildOverallMonths,
  filterEventsByScope,
  filterEventsForRange,
  filterRecordsByScope,
  getMonthTiming,
  getPeriodStatus,
  netFact,
  percent,
  recommendationValue,
  reportScopes,
  shouldShowForecastForWeek,
  total,
  type MetricTotals,
  type ReportScope,
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

type Mode = "allMonths" | "month" | "monthDaily" | "week" | "messages" | "events" | "admin";
type AdminTab = "day" | "month" | "events" | "coefficients";
type EventGroupFilter = "all" | EventGroup;
type EventCategoryFilter = "all" | EventType;
type MonthDraft = CreateMonthPayload;
type DailyAdminMetricDraft = { fact: number; recommendations: number };
type DailyAdminDraft = Record<City, Record<Metric, DailyAdminMetricDraft>>;
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

const storageKey = "weekly-report-local-v5";
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
const planRingItems: Array<{ metric: Metric; label: string; className: string; radius: number }> = [
  { metric: "Лиды", label: "Лиды", className: "leads", radius: 58 },
  { metric: "Квалы", label: "Квалы", className: "qualified", radius: 46 },
  { metric: "Продажи", label: "Продажи", className: "sales", radius: 34 },
];
const dailyChartMeta: Array<{ metric: DailyMetricKey; sourceMetric: Metric; title: string }> = [
  { metric: "leads", sourceMetric: "Лиды", title: "Лиды" },
  { metric: "qualifiedLeads", sourceMetric: "Квалы", title: "Квалы / целевые лиды" },
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
  const [initialState] = useState(loadInitialState);
  const [monthConfigs, setMonthConfigs] = useState<MonthConfig[]>(initialState.monthConfigs);
  const [records, setRecords] = useState<DailyRecord[]>(initialState.records);
  const [events, setEvents] = useState<EventItem[]>(initialState.events);
  const [forecastCoefficients, setForecastCoefficients] = useState<ForecastCoefficients>(initialState.forecastCoefficients);
  const [mode, setMode] = useState<Mode>("allMonths");
  const [selectedMetric, setSelectedMetric] = useState<Metric>("Лиды");
  const [selectedMonthKey, setSelectedMonthKey] = useState(initialState.selectedMonthKey);
  const [selectedScope, setSelectedScope] = useState<ReportScope>("Все");
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [adminTab, setAdminTab] = useState<AdminTab>("day");
  const [eventGroupFilter, setEventGroupFilter] = useState<EventGroupFilter>("all");
  const [eventCategoryFilter, setEventCategoryFilter] = useState<EventCategoryFilter>("all");
  const [highlightedDailyEventId, setHighlightedDailyEventId] = useState<string | null>(null);
  const [auth, setAuth] = useState("");
  const [savedMessage, setSavedMessage] = useState("Локальный режим: факты, месяцы и события сохраняются в этой панели.");
  const apiConfigured = isReportApiConfigured();
  const todayIso = useMemo(getTodayIso, []);

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
  const weeks = useMemo(() => buildWeeklySummary(currentMonthRecords, currentMonthEvents), [currentMonthRecords, currentMonthEvents]);
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
  const metricTotals = useMemo(() => buildMetricTotals(currentMonthRecords, metrics), [currentMonthRecords]);
  const conversions = useMemo(() => buildConversions(metricTotals), [metricTotals]);
  const periodStatus = useMemo(() => getPeriodStatus(metricTotals), [metricTotals]);
  const monthTiming = useMemo(() => getMonthTiming(monthDates, todayIso), [monthDates, todayIso]);
  const allMonths = useMemo(
    () => buildOverallMonths(reportRecords, reportEvents, monthConfigs),
    [reportRecords, reportEvents, monthConfigs],
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
    if (!apiConfigured) return;

    let cancelled = false;
    async function loadFromSheets() {
      try {
        const remoteMonths = await callReportApi<MonthConfig[]>("getMonths");
        if (cancelled) return;

        if (!remoteMonths.length) {
          setSavedMessage("Google Sheets подключен. Создайте первый месяц в админке, чтобы заполнить служебные листы.");
          return;
        }

        const normalizedMonths = remoteMonths.map(normalizeMonthConfig);
        setMonthConfigs(normalizedMonths);
        try {
          const remoteCoefficients = await callReportApi<unknown>("getForecastCoefficients");
          if (!cancelled) {
            setForecastCoefficients(normalizeForecastCoefficients(remoteCoefficients));
          }
        } catch {
          // Старый Apps Script без листа коэффициентов не должен ломать загрузку отчета.
        }
        const remoteMonthKey = normalizedMonths.some((config) => config.monthKey === selectedMonthKey)
          ? selectedMonthKey
          : normalizedMonths[normalizedMonths.length - 1].monthKey;

        if (remoteMonthKey !== selectedMonthKey) {
          setSelectedMonthKey(remoteMonthKey);
          return;
        }

        const payload = await callReportApi<MonthPayload>("getMonthData", { monthKey: remoteMonthKey });
        if (cancelled) return;
        applyRemotePayload(payload, remoteMonthKey);
        setSavedMessage("Данные загружены из Google Sheets. Запись доступна после ввода пароля.");
      } catch (error) {
        if (!cancelled) {
          setSavedMessage(`Google Sheets пока недоступен: ${getErrorMessage(error)}. Работаю в локальном fallback.`);
        }
      }
    }

    loadFromSheets();
    return () => {
      cancelled = true;
    };
  }, [apiConfigured, selectedMonthKey]);

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

  function applyRemotePayload(payload: MonthPayload, monthKey: string) {
    const remoteConfig = payload.config;
    if (remoteConfig) {
      setMonthConfigs((current) => upsertMonthConfig(current, normalizeMonthConfig(remoteConfig)));
    }
    setRecords((current) => [
      ...current.filter((record) => !record.date.startsWith(monthKey)),
      ...payload.records.map(normalizeDailyRecord),
    ]);
    setEvents(payload.events.map(normalizeEvent));
  }

  function mergeDailyValues(values: DailyValueUpdate[]) {
    const nextRecords = applyDailyValuesToRecords(records, values);
    setRecords(nextRecords);
    return nextRecords;
  }

  async function persistDailyValues(values: DailyValueUpdate[], _localMessage: string) {
    const hasInvalidValue = validateDailyValueUpdates(values);

    if (hasInvalidValue) {
      setSavedMessage("Не удалось сохранить данные. Проверьте подключение или формат значений.");
      return;
    }

    const sanitized = values.map(sanitizeDailyValueUpdate);

    if (!apiConfigured) {
      const nextRecords = mergeDailyValues(sanitized);
      const aggregateIssue = validateAggregates(nextRecords);
      setSavedMessage(aggregateIssue ?? "Сохранено. Итоги и графики обновлены.");
      return;
    }

    if (!auth.trim()) {
      setSavedMessage("Не удалось сохранить данные. Проверьте подключение или формат значений.");
      return;
    }

    try {
      const monthKey = sanitized[0]?.date.slice(0, 7);
      await callReportApi("upsertDailyValues", { monthKey, records: sanitized }, auth);

      if (monthKey) {
        const payload = await callReportApi<MonthPayload>("getMonthData", { monthKey });
        applyRemotePayload(payload, monthKey);
      }

      setSavedMessage("Сохранено. Итоги и графики обновлены.");
    } catch (error) {
      setSavedMessage(`Не удалось сохранить данные. Проверьте подключение или формат значений. ${getErrorMessage(error)}`);
    }
  }

  function updateDailyValues(values: DailyValueUpdate[], message = "День обновлен.") {
    persistDailyValues(values, message);
  }

  function addEvent(event: EventItem) {
    const isUpdate = events.some((item) => item.id === event.id);
    setEvents((current) => [event, ...current.filter((item) => item.id !== event.id)].sort(sortEvents));
    if (!apiConfigured) {
      setSavedMessage(isUpdate ? "Событие обновлено локально." : "Событие добавлено локально в карту факторов.");
      return;
    }
    if (!auth.trim()) {
      setSavedMessage(isUpdate ? "Событие обновлено локально. Для записи в Google Sheets введите пароль админки." : "Событие добавлено локально. Для записи в Google Sheets введите пароль админки.");
      return;
    }
    callReportApi("upsertEvent", { event }, auth)
      .then(() => setSavedMessage(isUpdate ? "Событие обновлено в Google Sheets." : "Событие добавлено и сохранено в Google Sheets."))
      .catch((error) => setSavedMessage(`Событие локально сохранено, но Sheets вернул ошибку: ${getErrorMessage(error)}.`));
  }

  function deleteEvent(eventId: string) {
    const event = events.find((item) => item.id === eventId);
    if (!event || event.source === "system") return;

    setEvents((current) => current.filter((item) => item.id !== eventId));
    if (!apiConfigured) {
      setSavedMessage("Событие удалено локально.");
      return;
    }
    if (!auth.trim()) {
      setSavedMessage("Событие удалено локально. Для удаления в Google Sheets введите пароль админки.");
      return;
    }
    callReportApi("deleteEvent", { id: eventId }, auth)
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
      setSavedMessage("Коэффициенты прогноза сохранены локально.");
      return;
    }
    if (!auth.trim()) {
      setSavedMessage("Коэффициенты изменены локально. Для записи в Google Sheets введите пароль админки.");
      return;
    }

    try {
      await callReportApi("updateForecastCoefficients", { coefficients: forecastCoefficients }, auth);
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
      setSavedMessage(exists ? `${nextConfig.label} уже есть, месяц открыт в панели.` : `${nextConfig.label} добавлен локально, можно вносить факт.`);
      return;
    }
    if (!auth.trim()) {
      setSavedMessage(`${nextConfig.label} подготовлен локально. Для создания в Google Sheets введите пароль админки.`);
      return;
    }

    callReportApi("createMonth", { ...draft, plansByCity: monthlyPlansByCity, dailyAverageByCity }, auth)
      .then(() => setSavedMessage(exists ? `${nextConfig.label} открыт в админке.` : `${nextConfig.label} создан в Google Sheets.`))
      .catch((error) => setSavedMessage(`${nextConfig.label} локально подготовлен, но Sheets вернул ошибку: ${getErrorMessage(error)}.`));
  }

  return (
    <div className="app-shell">
      <Sidebar mode={mode} setMode={setMode} auth={auth} setAuth={setAuth} />

      <main className="workspace">
        <Topbar
          title={pageCopy.title}
          subtitle={pageCopy.subtitle}
          monthConfigs={monthConfigs}
          selectedMonthKey={selectedMonthKey}
          selectedScope={selectedScope}
          todayIso={todayIso}
          selectMonth={selectMonth}
          setSelectedScope={setSelectedScope}
          onCreateMonth={openCreateMonth}
          onExport={printCurrentPage}
        />

        <section className="notice">
          <CheckCircle2 size={18} />
          {savedMessage}
        </section>

        <div className={mode === "events" || mode === "messages" || mode === "admin" ? "content-single" : "content-grid"}>
          <section className="main-panel">
            {mode === "allMonths" && (
              <AllMonthsDashboard
                months={allMonths}
                selectedMetric={selectedMetric}
                setSelectedMetric={setSelectedMetric}
                selectedScope={selectedScope}
                todayIso={todayIso}
                events={reportEvents}
              />
            )}
            {mode === "month" && (
              <MonthDashboard
                config={selectedMonthConfig}
                totals={metricTotals}
                conversions={conversions}
                weeks={weeks}
                events={currentMonthEvents}
                monthDates={monthDates}
                monthTiming={monthTiming}
                status={periodStatus}
                selectedScope={selectedScope}
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
                totals={metricTotals}
                records={currentMonthRecords}
                events={currentMonthEvents}
                monthDates={monthDates}
                monthTiming={monthTiming}
                selectedScope={selectedScope}
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
              />
            )}
            {mode === "messages" && (
              <MessagesDashboard records={records} selectedMonthKey={selectedMonthKey} />
            )}
            {mode === "events" && (
              <EventsDashboard
                dates={monthDates}
                events={allEvents}
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
                records={records.filter((record) => record.date.startsWith(selectedMonthConfig.monthKey))}
                events={currentMonthEvents}
                todayIso={todayIso}
                selectMonth={selectMonth}
                onCreateMonth={createMonthFromPanel}
                onSaveDailyValues={updateDailyValues}
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
}: {
  mode: Mode;
  setMode: (mode: Mode) => void;
  auth: string;
  setAuth: (value: string) => void;
}) {
  const items: Array<{ mode: Mode; label: string; icon: React.ReactNode }> = [
    { mode: "allMonths", label: "Все месяцы", icon: <BarChart3 /> },
    { mode: "month", label: "Обзор месяца", icon: <LayoutDashboard /> },
    { mode: "monthDaily", label: "Месяц по дням", icon: <TrendingUp /> },
    { mode: "week", label: "Неделя", icon: <CalendarDays /> },
    { mode: "admin", label: "Админка", icon: <Save /> },
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
        <span className={auth ? "status good" : "status muted"}>
          {auth ? "Готово к записи через Apps Script" : "Локальный просмотр"}
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
  todayIso,
  selectMonth,
  setSelectedScope,
  onCreateMonth,
  onExport,
}: {
  title: string;
  subtitle: string;
  monthConfigs: MonthConfig[];
  selectedMonthKey: string;
  selectedScope: ReportScope;
  todayIso: string;
  selectMonth: (monthKey: string) => void;
  setSelectedScope: (scope: ReportScope) => void;
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
  todayIso,
  events,
}: {
  months: Array<{ config: MonthConfig; dates: string[]; events: EventItem[]; weeks: WeekSummary[] }>;
  selectedMetric: Metric;
  setSelectedMetric: (metric: Metric) => void;
  selectedScope: ReportScope;
  todayIso: string;
  events: EventItem[];
}) {
  const totals = mergeTotals(months.flatMap((month) => month.weeks));
  const status = getPeriodStatus(totals);
  const insights = buildAttentionItems(totals, events);
  const worstMonth = pickMonthByCompletion(months, "worst");
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
          `Период: ${monthRange}`,
          `Зона риска: ${worstMonth}`,
          `Событий в периоде: ${events.length}`,
        ]}
      />

      <div className="weekly-sync-grid dashboard-weekly-grid">
        {metrics.map((metric) => (
          <MetricMonthCard key={metric} metric={metric} months={months} />
        ))}
      </div>

      <section className="analytics-panel">
        <PanelHead
          title="Недельная лента всех месяцев"
          description="Факт показан синими столбиками, прогноз Optima - пунктирной линией."
        >
          <MetricSelect value={selectedMetric} onChange={setSelectedMetric} />
        </PanelHead>
        <ContinuousDashboardChart months={months} metric={selectedMetric} todayIso={todayIso} />
      </section>

      <MonthMatrix months={months} />
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
  todayIso: string;
  months: MonthConfig[];
  selectedMonthKey: string;
  selectMonth: (monthKey: string) => void;
  onCreateMonth: (draft: MonthDraft) => void;
  records: DailyRecord[];
  forecastCoefficients: ForecastCoefficients;
}) {
  const monthForecast = buildMonthEndForecast(records, monthDates, monthTiming.isClosed, forecastCoefficients);
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
          `Событий: ${events.length}`,
        ]}
      />

      <MetricKpiStrip totals={totals} isClosedMonth={monthTiming.isClosed} summaries={summaries} />
      <MonthEndForecastPanel projection={monthForecast} />
      <PlanCompletionWidget totals={totals} periodLabel="План месяца" />

      <ConversionCards conversions={conversions} />

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
            />
          ))}
        </div>
      </section>

      <RecommendationWeekPanel weeks={weeks} />
      <PlanNeedGrid summaries={summaries} />
      <InsightPanel items={insights} />
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
  todayIso: string;
  highlightedEventId: string | null;
}) {
  const dailyCharts = dailyChartMeta.map((meta) => buildMetricDailyChartData(meta, records, events, monthDates, todayIso));
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
          `Событий месяца: ${events.length}`,
          monthTiming.isClosed ? "Месяц завершен" : `Осталось дней: ${monthTiming.left}`,
        ]}
      />

      <section className="daily-kpi-summary" aria-label="Краткие показатели месяца по дням">
        {summaries.map((summary) => (
          <article key={summary.metric} className="daily-kpi-card">
            <span>{summary.metric === "Квалы" ? "КВАЛ / целевые лиды" : summary.metric}</span>
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
}: {
  weeks: WeekSummary[];
  selectedWeek: number;
  setSelectedWeek: (week: number) => void;
  week: WeekSummary;
  dates: string[];
  records: DailyRecord[];
  events: EventItem[];
  selectedScope: ReportScope;
}) {
  const totals = buildMetricTotals(records.filter((record) => dates.includes(record.date)), metrics);
  const conversions = buildConversions(totals);
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

      <MetricKpiStrip totals={totals} isClosedMonth />
      <PlanCompletionWidget totals={totals} periodLabel="План недели" />

      <div className="dashboard-two-cols">
        <DailyWeekEditor dates={dates} records={records} />
        <ConversionCards conversions={conversions} />
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

function EventsDashboard({
  dates,
  events,
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
}: {
  totals: MetricTotals;
  isClosedMonth: boolean;
  summaries?: MetricSummary[];
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
            <span>{metric === "Квалы" ? "КВАЛ" : metric}</span>
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
}: {
  projection: ReturnType<typeof buildMonthEndForecast>;
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
              <span>{metric === "Квалы" ? "КВАЛ" : metric}</span>
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

function PlanCompletionWidget({ totals, periodLabel }: { totals: MetricTotals; periodLabel: string }) {
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
                <span>{item.label}</span>
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

function ConversionCards({ conversions }: { conversions: ReturnType<typeof buildConversions> }) {
  return (
    <section className="conversion-panel">
      <PanelHead title="Конверсии" description="Главные управленческие переходы воронки." />
      <div className="conversion-grid">
        <article>
          <span>Лид → КВАЛ</span>
          <strong>{conversions.leadToQualified}%</strong>
        </article>
        <article>
          <span>КВАЛ → продажа</span>
          <strong>{conversions.qualifiedToSale}%</strong>
        </article>
        <article className="secondary">
          <span>Лид → продажа</span>
          <strong>{conversions.leadToSale}%</strong>
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
}: {
  months: Array<{ config: MonthConfig; weeks: WeekSummary[] }>;
  metric: Metric;
  todayIso: string;
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
    const plan = item.week.totals[metric].plan;
    const fact = item.week.totals[metric].fact;
    const forecast = item.week.totals[metric].forecast;
    const previous = index > 0 ? flatWeeks[index - 1].week.totals[metric].fact : null;
    const delta = previous ? ((fact - previous) / previous) * 100 : 0;
    const isFutureEmpty = isFutureWeekWithoutFact(item.week, metric, todayIso);
    return {
      ...item,
      plan,
      fact,
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
              return (
              <div
                className={`continuous-week ${tooltipEdgeClass(index, values.length)}`}
                key={`${item.monthKey}-${item.week.week}`}
                data-tooltip={`${item.monthLabel}, ${item.week.week} неделя\nФакт: ${formatNumber(item.fact)}\nПрогноз Optima: ${formatNumber(item.plan)}\nДинамика: ${deltaLabel}`}
              >
                <div className="continuous-bar-area">
                  <span
                    className={`continuous-bar ${barTone}`}
                    style={{ height: `${Math.max((item.fact / chartMax) * chartHeight, 8)}px` }}
                  />
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
}: {
  metric: Metric;
  weeks: WeekSummary[];
  todayIso: string;
}) {
  return (
    <article className="week-chart-card">
      <div className="chart-card-head">
        <div>
          <span className="chart-eyebrow">график по неделям</span>
          <div className="chart-title-row">
            <strong className="chart-title">{metric.toUpperCase()}</strong>
            <Info size={15} aria-hidden="true" />
          </div>
        </div>
      </div>
      <WeeklyTrendChart weeks={weeks} metric={metric} todayIso={todayIso} />
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
        title="Рекомендации по неделям"
        description="Отдельно показывает значения, которые вычитаются из FACT перед расчетом отчетов."
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
}: {
  metric: Metric;
  months: Array<{ config: MonthConfig; events: EventItem[]; weeks: WeekSummary[] }>;
}) {
  return (
    <article className="week-chart-card month-chart-card">
      <div className="chart-card-head">
        <div>
          <span className="chart-eyebrow">график по месяцам</span>
          <div className="chart-title-row">
            <strong className="chart-title">{getMonthMetricTitle(metric)}</strong>
            <Info size={15} aria-hidden="true" />
          </div>
        </div>
      </div>
      <MonthlyTrendChart months={months} metric={metric} />
    </article>
  );
}

function MonthlyTrendChart({
  months,
  metric,
}: {
  months: Array<{ config: MonthConfig; events: EventItem[]; weeks: WeekSummary[] }>;
  metric: Metric;
}) {
  const chartHeight = 210;
  const monthTotals = months.map((month) => mergeTotals(month.weeks));
  const values = months.map((month, index) => {
    const totals = monthTotals[index];
    const plan = totals[metric].plan;
    const fact = totals[metric].fact;
    const previous = index > 0 ? monthTotals[index - 1][metric].fact : null;
    const delta = previous ? ((fact - previous) / previous) * 100 : 0;
    return {
      month,
      plan,
      fact,
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
        <span><i className="legend-line plan" /> Прогноз Optima</span>
      </div>
      {values.map((item, index) => {
        const barTone = item.fact <= 0 ? "inactive" : item.trend;
        const deltaLabel = formatPercentDelta(item.delta, item.trend);
        return (
          <div
            key={item.month.config.monthKey}
            className={`trend-week month-trend-item ${tooltipEdgeClass(index, values.length)}`}
            data-tooltip={`${item.label}\nФакт: ${formatNumber(item.fact)}\nПрогноз Optima: ${formatNumber(item.plan)}\nДинамика: ${deltaLabel}`}
          >
            <div className="trend-plot" style={{ height: chartHeight }}>
              <span
                className={`trend-bar ${barTone}`}
                style={{ height: `${Math.max((item.fact / chartMax) * chartHeight, 8)}px` }}
              />
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
}: {
  weeks: WeekSummary[];
  metric: Metric;
  todayIso: string;
}) {
  const chartHeight = 210;
  const values = weeks.map((week, index) => {
    const plan = week.totals[metric].plan;
    const fact = week.totals[metric].fact;
    const previous = index > 0 ? weeks[index - 1].totals[metric].fact : null;
    const delta = previous ? ((fact - previous) / previous) * 100 : 0;
    const isFutureEmpty = isFutureWeekWithoutFact(week, metric, todayIso);
    return {
      week,
      plan,
      fact,
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
        <span><i className="legend-line plan" /> Прогноз Optima</span>
      </div>
      {values.map((item, index) => {
        const barTone = item.fact <= 0 ? "inactive" : item.trend;
        const deltaLabel = item.isFutureEmpty ? "нет FACT" : formatPercentDelta(item.delta, item.trend);
        return (
        <div
          key={item.week.week}
          className={`trend-week ${tooltipEdgeClass(index, values.length)}`}
          data-tooltip={`${item.week.week} неделя\nФакт: ${formatNumber(item.fact)}\nПрогноз Optima: ${formatNumber(item.plan)}\nДинамика: ${deltaLabel}`}
        >
          <div className="trend-plot" style={{ height: chartHeight }}>
            <span
              className={`trend-bar ${barTone}`}
              style={{ height: `${Math.max((item.fact / chartMax) * chartHeight, 8)}px` }}
            />
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

function MonthMatrix({ months }: { months: Array<{ config: MonthConfig; events: EventItem[]; weeks: WeekSummary[] }> }) {
  return (
    <section className="analytics-panel">
      <PanelHead title="Матрица месяцев" description="Итоги месяца, две конверсии и динамика к предыдущему месяцу." />
      <div className="month-matrix">
        {months.map((month, monthIndex) => {
          const totals = mergeTotals(month.weeks);
          const previousTotals = monthIndex > 0 ? mergeTotals(months[monthIndex - 1].weeks) : null;
          const conversions = buildConversions(totals);
          const previousConversions = previousTotals ? buildConversions(previousTotals) : null;
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
                <span>Лид → квал</span>
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
  todayIso,
  selectMonth,
  onCreateMonth,
  onSaveDailyValues,
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
  todayIso: string;
  selectMonth: (monthKey: string) => void;
  onCreateMonth: (draft: MonthDraft) => void;
  onSaveDailyValues: (values: DailyValueUpdate[], message?: string) => void;
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
  const totals = buildMetricTotals(records, metrics);
  const messageTotals = buildMetricTotals(records.filter((record) => record.city === "сообщения"), metrics);

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
          "МСК, СПБ и сообщения отдельно",
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
          <button className={tab === "events" ? "active" : ""} type="button" onClick={() => setTab("events")}>События</button>
          <button className={tab === "coefficients" ? "active" : ""} type="button" onClick={() => setTab("coefficients")}>Коэф.</button>
        </div>
      </section>

      <section className="admin-total-strip">
        {metrics.map((metric) => (
          <article key={metric}>
            <span>{metric === "Квалы" ? "КВАЛ" : metric}</span>
            <strong>{formatNumber(totals[metric].fact)}</strong>
            <small>общий факт МСК + СПБ + сообщения</small>
          </article>
        ))}
        <article className="messages-total-card">
          <span>Сообщения</span>
          <strong>{formatNumber(messageTotals["Лиды"].fact)}</strong>
          <small>лиды сообщений отдельно от городов</small>
        </article>
      </section>

      {tab === "day" && (
        <AdminDayPanel
          dates={dates}
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          records={records}
          onSaveDailyValues={onSaveDailyValues}
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
      {tab === "events" && (
        <AdminEventsPanel dates={dates} events={events} onAddEvent={onAddEvent} onDeleteEvent={onDeleteEvent} />
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
}: {
  dates: string[];
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  records: DailyRecord[];
  onSaveDailyValues: (values: DailyValueUpdate[], message?: string) => void;
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

  function saveDay() {
    const values = adminCities.flatMap((city) =>
      metrics.map((metric) => ({
        date: selectedDate,
        city,
        metric,
        fact: draft[city][metric].fact,
        recommendations: draft[city][metric].recommendations,
      })),
    );
    onSaveDailyValues(values, `${formatDay(selectedDate)} сохранен.`);
  }

  return (
    <section className="admin-entry-panel">
      <PanelHead title="День" description="Одна форма сохраняет факт и рекомендации. Рекомендации вычитаются из факта в отчетах и графиках.">
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
              return (
                <label className="admin-fact-input" key={metric}>
                  <span className="admin-input-labels"><b>FACT</b><b>Рек.</b></span>
                  <span className="admin-metric-inputs">
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
                  </span>
                  <small>план {formatNumber(plan)} · чистый факт <b>{formatNumber(cleanFact)}</b></small>
                </label>
              );
            })}
          </div>
        ))}
      </div>

      <div className="admin-actions">
        <span>Данные сообщений сохраняются отдельно и не попадают в общий дашборд МСК + СПБ.</span>
        <button className="primary-button" type="button" onClick={saveDay}>
          <Save size={16} />
          Сохранить
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
                          <span>{metric === "Квалы" ? "КВАЛ" : metric}</span>
                          <input
                            type="number"
                            min="0"
                            value={dailyRecordNetFact(findDailyRecord(records, date, city, metric))}
                            readOnly
                            title="Чтобы изменить значение, откройте вкладку День и нажмите Сохранить."
                          />
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
  onAddEvent,
  onDeleteEvent,
}: {
  dates: string[];
  events: EventItem[];
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
}: {
  dates: string[];
  records: DailyRecord[];
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
                const value = total(records.filter((record) => record.date === date && record.metric === metric), "fact");
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
                const value = total(records.filter((record) => record.date === date && record.metric === metric), "fact");
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
    importance: event.importance,
    description: event.description,
  };
}

function EventForm({
  dates,
  selectedDate,
  editingEvent,
  onCancelEdit,
  onSave,
}: {
  dates: string[];
  selectedDate: string;
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
                <small>{eventCityLabel(event.city)} · {event.type} · {event.actualEffect}</small>
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
        <small>{eventMonthLabel(event.startDate)} · {formatDay(event.startDate)} - {formatDay(event.endDate)} · {eventCityLabel(event.city)} · {event.type} · {event.actualEffect}</small>
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
) {
  const lastFactDate = getLastFactDate(records);
  const remainingDates = isClosedMonth ? [] : monthDates.filter((date) => !lastFactDate || date > lastFactDate);

  return {
    isClosed: isClosedMonth,
    lastFactDate,
    remainingDatesCount: remainingDates.length,
    metrics: metrics.reduce<Record<Metric, { plan: number; fact: number; projected: number; completion: number; delta: number; baseDaily: number }>>((acc, metric) => {
      const metricRecords = records.filter((record) => record.metric === metric);
      const forecastParts = forecastMetricByFactAverage(metricRecords, metric, monthDates, isClosedMonth, coefficients);
      const fact = forecastParts.fact;
      const plan = total(metricRecords, "plan");
      const projected = forecastParts.projected;
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
      return dayRecords.some((record) => record.fact > 0 || recommendationValue(record) > 0);
    });
    const cityFact = total(records.filter((record) => factDates.includes(record.date)), "fact");
    const cityPlan = total(records, "plan");

    if (isClosedMonth) {
      fact += total(records, "fact");
      projected += total(records, "fact");
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
  const factDates = records.filter((record) => record.fact > 0 || recommendationValue(record) > 0).map((record) => record.date).sort();
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
      }),
      { plan: 0, fact: 0, forecast: 0, recommendations: 0 },
    );
    return acc;
  }, {} as MetricTotals);
}

function pickMonthByCompletion(months: Array<{ config: MonthConfig; weeks: WeekSummary[] }>, mode: "best" | "worst") {
  if (!months.length) return "нет данных";
  const sorted = [...months].sort((a, b) => {
    const aTotals = mergeTotals(a.weeks);
    const bTotals = mergeTotals(b.weeks);
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

function getMonthMetricTitle(metric: Metric): string {
  if (metric === "Квалы") return "Целевые лиды / Квалы";
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
): MetricDailyChartData {
  const metricRecords = records.filter((record) => record.metric === meta.sourceMetric);
  const hasAnyFact = metricRecords.some((record) => Number.isFinite(record.fact) && (record.fact > 0 || recommendationValue(record) > 0));

  return {
    ...meta,
    points: monthDates.map((date) => {
      const dayRecords = metricRecords.filter((record) => record.date === date);
      const dayEvents = events.filter((event) =>
        event.startDate <= date &&
        date <= event.endDate &&
        (event.metric === "все" || event.metric === meta.sourceMetric),
      );
      const plan = sumNullable(dayRecords, "plan");
      const factTotal = sumNullable(dayRecords, "fact");
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

function sumNullable(records: DailyRecord[], key: "plan" | "fact" | "forecast" | "recommendations"): number | null {
  if (!records.length) return null;
  return records.reduce((sum, record) => {
    if (key === "fact") return sum + netFact(record);
    if (key === "recommendations") return sum + recommendationValue(record);
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
  return months.flatMap((month) => {
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

function createDailyFactDraft(records: DailyRecord[], date: string): DailyAdminDraft {
  return adminCities.reduce<DailyAdminDraft>((acc, city) => {
    acc[city] = metrics.reduce<Record<Metric, DailyAdminMetricDraft>>((metricAcc, metric) => {
      const record = findDailyRecord(records, date, city, metric);
      metricAcc[metric] = {
        fact: record?.fact ?? 0,
        recommendations: record?.recommendations ?? 0,
      };
      return metricAcc;
    }, {} as Record<Metric, DailyAdminMetricDraft>);
    return acc;
  }, {} as DailyAdminDraft);
}

function findDailyRecord(records: DailyRecord[], date: string, city: City, metric: Metric): DailyRecord | undefined {
  return records.find((record) => record.date === date && record.city === city && record.metric === metric);
}

function dailyRecordNetFact(record: DailyRecord | undefined): number {
  return record ? netFact(record) : 0;
}

function validateDailyValueUpdates(values: DailyValueUpdate[]): boolean {
  return values.some((value) => {
    const checkedValues = [value.plan, value.fact, value.forecast, value.recommendations].filter((item) => item !== undefined);
    return checkedValues.some((item) => {
      const numericValue = Number(item);
      return !Number.isFinite(numericValue) || numericValue < 0;
    });
  });
}

function sanitizeDailyValueUpdate(value: DailyValueUpdate): DailyValueUpdate {
  return {
    ...value,
    plan: value.plan === undefined ? undefined : Math.max(0, Number(value.plan) || 0),
    fact: value.fact === undefined ? undefined : Math.max(0, Number(value.fact) || 0),
    forecast: value.forecast === undefined ? undefined : Math.max(0, Number(value.forecast) || 0),
    recommendations: value.recommendations === undefined ? undefined : Math.max(0, Number(value.recommendations) || 0),
  };
}

function applyDailyValuesToRecords(current: DailyRecord[], values: DailyValueUpdate[]): DailyRecord[] {
  const byKey = new Map(current.map((record) => [dailyRecordKey(record.date, record.city, record.metric), record]));

  values.forEach((value) => {
    const key = dailyRecordKey(value.date, value.city, value.metric);
    const previous = byKey.get(key);
    byKey.set(key, mergeDailyRecord(previous, value));
  });

  return [...byKey.values()].sort((a, b) => a.date.localeCompare(b.date) || a.city.localeCompare(b.city) || a.metric.localeCompare(b.metric));
}

function mergeDailyRecord(previous: DailyRecord | undefined, value: DailyValueUpdate): DailyRecord {
  return {
    id: previous?.id ?? dailyRecordKey(value.date, value.city, value.metric),
    date: value.date,
    city: value.city,
    channel: previous?.channel ?? (value.city === "сообщения" ? "Сообщения" : "Город"),
    metric: value.metric,
    plan: value.plan ?? previous?.plan ?? 0,
    fact: value.fact ?? previous?.fact ?? 0,
    forecast: value.forecast ?? previous?.forecast ?? value.fact ?? previous?.fact ?? 0,
    recommendations: value.recommendations ?? previous?.recommendations ?? 0,
    comment: value.comment ?? previous?.comment ?? "",
  };
}

function normalizeDailyRecord(record: DailyRecord): DailyRecord {
  return {
    ...record,
    plan: Number(record.plan || 0),
    fact: Number(record.fact || 0),
    forecast: Number(record.forecast || 0),
    recommendations: Number(record.recommendations || 0),
    comment: record.comment ?? "",
  };
}

function dailyRecordKey(date: string, city: DailyRecordCity, metric: Metric): string {
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
    const rawState = window.localStorage.getItem(storageKey);
    if (!rawState) return fallback;

    const parsed = JSON.parse(rawState) as Partial<typeof fallback>;
    if (!Array.isArray(parsed.monthConfigs) || !Array.isArray(parsed.records) || !Array.isArray(parsed.events)) {
      return fallback;
    }

    const monthConfigs = parsed.monthConfigs.map(normalizeMonthConfig);
    const events = parsed.events.map(normalizeEvent).filter((event) => !legacySeedEventIds.has(event.id));

    return {
      monthConfigs,
      records: sanitizeStoredRecords(parsed.records, getTodayIso()),
      events,
      selectedMonthKey: parsed.selectedMonthKey || monthConfigs[monthConfigs.length - 1]?.monthKey || fallback.selectedMonthKey,
      forecastCoefficients: normalizeForecastCoefficients(parsed.forecastCoefficients),
    };
  } catch {
    return fallback;
  }
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
    if (normalized.date > todayIso && (normalized.fact > 0 || normalized.recommendations > 0)) {
      return { ...normalized, fact: 0, recommendations: 0 };
    }
    return normalized;
  });
}

function normalizeMonthConfig(config: MonthConfig): MonthConfig {
  const plansByCity = config.plansByCity ?? splitPlanByCity(config.plan);
  return {
    ...config,
    label: config.label.replace(/\sг\.$/, ""),
    plansByCity,
    plan: combineReportPlan(plansByCity),
    status: config.status ?? "active",
  };
}

function normalizeEvent(event: EventItem): EventItem {
  const type = event.type;
  return {
    ...event,
    group: event.group ?? (internalEventTypes.includes(type) ? "internal" : "external"),
    source: event.source ?? "manual",
  };
}

function saveLocalState(state: ReturnType<typeof loadInitialState>) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(state));
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
