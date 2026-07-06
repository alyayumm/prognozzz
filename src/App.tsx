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
  MoreHorizontal,
  Plus,
  Save,
  Settings,
  Target,
  TrendingUp,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  buildRecordsForMonth,
  buildSeedRecords,
  createMonthConfig,
  metrics,
  monthConfig,
  monthConfigs as seedMonthConfigs,
  seedEvents,
} from "./data/dashboardMock";
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
  percent,
  reportCities,
  reportScopes,
  shouldShowForecastForWeek,
  total,
  type MetricTotals,
  type ReportScope,
} from "./lib/metrics";
import type { City, DailyRecord, Effect, EventGroup, EventItem, EventType, Metric, MonthConfig, WeekSummary } from "./types";
import { formatDay, getMonthDates, getWeekOfMonth, weekdayLabel } from "./utils/date";
import { buildWeeklySummary } from "./utils/report";

type Mode = "allMonths" | "month" | "week" | "messages" | "events";
type EventGroupFilter = "all" | EventGroup;
type EventCategoryFilter = "all" | EventType;
type MonthDraft = {
  year: number;
  monthIndex: number;
  plan: Record<Metric, number>;
};
type ChartLinePoint = { x: number; y: number };
type ChartLineSegment = ChartLinePoint[];
type ChartLineRange = { top: number; height: number };
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

const storageKey = "weekly-report-local-v3";
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
const planRingItems: Array<{ metric: Metric; label: string; className: string; radius: number }> = [
  { metric: "Лиды", label: "Лиды", className: "leads", radius: 58 },
  { metric: "Квалы", label: "Квалы", className: "qualified", radius: 46 },
  { metric: "Продажи", label: "Продажи", className: "sales", radius: 34 },
];

export default function App() {
  const [initialState] = useState(loadInitialState);
  const [monthConfigs, setMonthConfigs] = useState<MonthConfig[]>(initialState.monthConfigs);
  const [records, setRecords] = useState<DailyRecord[]>(initialState.records);
  const [events, setEvents] = useState<EventItem[]>(initialState.events);
  const [mode, setMode] = useState<Mode>("allMonths");
  const [selectedMetric, setSelectedMetric] = useState<Metric>("Лиды");
  const [selectedMonthKey, setSelectedMonthKey] = useState(initialState.selectedMonthKey);
  const [selectedScope, setSelectedScope] = useState<ReportScope>("Все");
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [eventGroupFilter, setEventGroupFilter] = useState<EventGroupFilter>("all");
  const [eventCategoryFilter, setEventCategoryFilter] = useState<EventCategoryFilter>("all");
  const [auth, setAuth] = useState("");
  const [savedMessage, setSavedMessage] = useState("Локальный режим: факты, месяцы и события сохраняются в этой панели.");
  const todayIso = useMemo(getTodayIso, []);

  const selectedMonthConfig = useMemo(
    () => monthConfigs.find((config) => config.monthKey === selectedMonthKey) ?? monthConfigs[monthConfigs.length - 1] ?? monthConfig,
    [monthConfigs, selectedMonthKey],
  );
  const monthDates = useMemo(
    () => getMonthDates(selectedMonthConfig.year, selectedMonthConfig.monthIndex, selectedMonthConfig.daysInMonth),
    [selectedMonthConfig],
  );
  const reportRecords = useMemo(() => filterRecordsByScope(records, selectedScope), [records, selectedScope]);
  const reportEvents = useMemo(() => filterEventsByScope(events, selectedScope), [events, selectedScope]);
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
    if (mode === "month") return currentMonthEvents;
    return reportEvents;
  }, [activeWeekEvents, currentMonthEvents, mode, reportEvents]);
  const pageCopy = getPageCopy(mode);

  useEffect(() => {
    saveLocalState({ monthConfigs, records, events, selectedMonthKey });
  }, [monthConfigs, records, events, selectedMonthKey]);

  function selectMonth(monthKey: string) {
    const config = monthConfigs.find((item) => item.monthKey === monthKey);
    if (!config) return;
    setSelectedMonthKey(monthKey);
    setSelectedWeek(1);
  }

  function updateRecord(date: string, city: City, metric: Metric, field: "plan" | "fact" | "forecast", value: number) {
    setRecords((current) =>
      current.map((record) =>
        record.date === date && record.city === city && record.metric === metric
          ? { ...record, [field]: Math.max(0, value || 0) }
          : record,
      ),
    );
    setSavedMessage("Факт внесен локально и сохранится в этой панели.");
  }

  function updateAggregatedFact(date: string, metric: Metric, value: number) {
    const splitCities = selectedScope === "Все" ? reportCities : [selectedScope as City];
    const nextValue = Math.max(0, value || 0);
    const baseValue = Math.floor(nextValue / splitCities.length);
    const remainder = nextValue - baseValue * splitCities.length;
    splitCities.forEach((city, index) => {
      updateRecord(date, city, metric, "fact", baseValue + (index < remainder ? 1 : 0));
    });
  }

  function addEvent(event: EventItem) {
    setEvents((current) => [event, ...current]);
    setSavedMessage("Событие добавлено в карту факторов.");
  }

  function createMonthFromPanel(draft: MonthDraft) {
    const nextConfig = createMonthConfig(draft.year, draft.monthIndex, draft.plan);
    const exists = monthConfigs.some((config) => config.monthKey === nextConfig.monthKey);

    if (!exists) {
      setMonthConfigs((current) => [...current, nextConfig].sort((a, b) => a.monthKey.localeCompare(b.monthKey)));
      setRecords((current) => [...current, ...buildRecordsForMonth(nextConfig, monthConfigs.length)]);
    }

    setSelectedMonthKey(nextConfig.monthKey);
    setSelectedWeek(1);
    setMode("month");
    setSavedMessage(exists ? `${nextConfig.label} уже есть, месяц открыт в панели.` : `${nextConfig.label} добавлен, можно вносить факт.`);
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
          onCreateMonth={() => setMode("month")}
        />

        <section className="notice">
          <CheckCircle2 size={18} />
          {savedMessage}
        </section>

        <div className={mode === "events" || mode === "messages" ? "content-single" : "content-grid"}>
          <section className="main-panel">
            {mode === "allMonths" && (
              <AllMonthsDashboard
                months={allMonths}
                selectedMetric={selectedMetric}
                setSelectedMetric={setSelectedMetric}
                selectedScope={selectedScope}
                todayIso={todayIso}
                events={reportEvents}
                selectedMonthConfig={selectedMonthConfig}
                selectedMonthWeeks={weeks}
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
                updateAggregatedFact={updateAggregatedFact}
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
                updateAggregatedFact={updateAggregatedFact}
              />
            )}
            {mode === "messages" && (
              <MessagesDashboard records={records} selectedMonthKey={selectedMonthKey} />
            )}
            {mode === "events" && (
              <EventsDashboard
                dates={monthDates}
                events={events}
                selectedScope={selectedScope}
                groupFilter={eventGroupFilter}
                setGroupFilter={setEventGroupFilter}
                categoryFilter={eventCategoryFilter}
                setCategoryFilter={setEventCategoryFilter}
                onAdd={addEvent}
              />
            )}
          </section>

          {mode !== "events" && mode !== "messages" && (
            <EventsPanel
              title={mode === "week" ? "События недели" : mode === "month" ? "События месяца" : "События периода"}
              events={visibleEvents}
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
    { mode: "week", label: "Неделя", icon: <CalendarDays /> },
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

      <button className="ghost-button" type="button">
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
        <button className="select-button" type="button">
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
  selectedMonthConfig,
  selectedMonthWeeks,
}: {
  months: Array<{ config: MonthConfig; dates: string[]; events: EventItem[]; weeks: WeekSummary[] }>;
  selectedMetric: Metric;
  setSelectedMetric: (metric: Metric) => void;
  selectedScope: ReportScope;
  todayIso: string;
  events: EventItem[];
  selectedMonthConfig: MonthConfig;
  selectedMonthWeeks: WeekSummary[];
}) {
  const totals = mergeTotals(months.flatMap((month) => month.weeks));
  const status = getPeriodStatus(totals);
  const insights = buildAttentionItems(totals, events);
  const worstMonth = pickMonthByCompletion(months, "worst");

  return (
    <div className="page-stack">
      <ExecutiveSummary
        status={status}
        eyebrow=""
        title="Динамика по неделям"
        facts={[
          `Город: ${selectedScope === "Все" ? "МСК + СПБ" : selectedScope}`,
          `Период: ${selectedMonthConfig.label}`,
          `Зона риска: ${worstMonth}`,
          `Событий в периоде: ${events.length}`,
        ]}
      />

      <div className="weekly-sync-grid dashboard-weekly-grid">
        {metrics.map((metric) => (
          <MetricWeekCard key={metric} metric={metric} weeks={selectedMonthWeeks} todayIso={todayIso} />
        ))}
      </div>

      <section className="analytics-panel">
        <PanelHead
          title="Недельная лента всех месяцев"
          description="Факт показан синими столбиками, план - пунктирной линией, прогноз Optima - светло-синей линией."
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
  updateAggregatedFact,
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
  updateAggregatedFact: (date: string, metric: Metric, value: number) => void;
}) {
  const summaries = metrics.map((metric) => buildMetricSummary(metric, totals[metric], monthDates, todayIso, monthTiming.isClosed));
  const insights = buildAttentionItems(totals, events);

  return (
    <div className="page-stack">
      <ExecutiveSummary
        status={status}
        eyebrow={config.label}
        title={monthTiming.isClosed ? "Месяц завершен" : "Месяц идет, прогноз Optima важен"}
        facts={[
          `Прошло дней: ${monthTiming.passed}`,
          `Осталось дней: ${monthTiming.left}`,
          `Город: ${selectedScope === "Все" ? "МСК + СПБ" : selectedScope}`,
          `Событий: ${events.length}`,
        ]}
      />

      <MetricKpiStrip totals={totals} isClosedMonth={monthTiming.isClosed} summaries={summaries} />
      <PlanCompletionWidget totals={totals} periodLabel="План месяца" />

      <div className="dashboard-two-cols">
        <FunnelOverview totals={totals} conversions={conversions} />
        <ConversionCards conversions={conversions} />
      </div>

      <section className="analytics-panel">
        <PanelHead
          title="Динамика по неделям"
          description="Три графика используют одну шкалу: цветной факт, черная пунктирная линия прогноза и события над неделями."
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

      <PlanNeedGrid summaries={summaries} />
      <InsightPanel items={insights} />

      <MonthAdminPanel
        dates={monthDates}
        months={months}
        selectedMonthKey={selectedMonthKey}
        selectedScope={selectedScope}
        selectedMonthConfig={config}
        records={records}
        selectMonth={selectMonth}
        onCreateMonth={onCreateMonth}
        updateAggregatedFact={updateAggregatedFact}
      />
    </div>
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
  updateAggregatedFact,
}: {
  weeks: WeekSummary[];
  selectedWeek: number;
  setSelectedWeek: (week: number) => void;
  week: WeekSummary;
  dates: string[];
  records: DailyRecord[];
  events: EventItem[];
  selectedScope: ReportScope;
  updateAggregatedFact: (date: string, metric: Metric, value: number) => void;
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
        <DailyWeekEditor dates={dates} records={records} updateAggregatedFact={updateAggregatedFact} />
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
}: {
  dates: string[];
  events: EventItem[];
  selectedScope: ReportScope;
  groupFilter: EventGroupFilter;
  setGroupFilter: (value: EventGroupFilter) => void;
  categoryFilter: EventCategoryFilter;
  setCategoryFilter: (value: EventCategoryFilter) => void;
  onAdd: (event: EventItem) => void;
}) {
  const scopedEvents = filterEventsByScope(events, selectedScope);
  const filteredEvents = scopedEvents.filter((event) => {
    const groupMatch = groupFilter === "all" || event.group === groupFilter;
    const categoryMatch = categoryFilter === "all" || event.type === categoryFilter;
    return groupMatch && categoryMatch;
  });

  return (
    <div className="page-stack">
      <ExecutiveSummary
        status={{ label: "карта факторов", tone: "good" }}
        eyebrow="События не доказывают причину, а показывают совпадения по датам"
        title="Карта событий"
        facts={[
          `Всего событий: ${filteredEvents.length}`,
          `Город: ${selectedScope === "Все" ? "all + msk + spb" : selectedScope}`,
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
        <EventCalendar dates={dates} events={filteredEvents} />
        <EventForm dates={dates} onAdd={onAdd} />
      </div>
    </div>
  );
}

function ExecutiveSummary({
  status,
  eyebrow,
  title,
  facts,
}: {
  status: { label: string; tone: "good" | "warning" | "danger" };
  eyebrow: string;
  title: string;
  facts: string[];
}) {
  return (
    <section className={`executive-summary ${status.tone}`}>
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
      </div>
      <strong>{status.label}</strong>
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
            <span>продажи факт</span>
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
    return { ...item, plan, fact, forecast, delta, trend: trendClass(delta, previous === null), hasForecast: shouldShowForecastForWeek(item.week, todayIso) };
  });
  const max = Math.max(...values.flatMap((item) => [item.fact, item.plan, item.hasForecast ? item.forecast : 0]), 1);
  const chartHeight = 248;
  const chartMax = getNiceAxisMax(max * 1.12);
  const minWidth = `${Math.max(100, months.length * 25)}%`;
  const planSegments = buildLineSegments(values, chartMax, (item) => item.plan, () => true, undefined, { top: 7, height: 84 });
  const forecastSegments = buildLineSegments(values, chartMax, (item) => item.forecast, (item) => item.hasForecast, undefined, { top: 7, height: 84 });
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
          <ChartLine className="continuous-forecast-line" segments={forecastSegments} pointRadius={0} />
          <div className="continuous-weeks" style={{ gridTemplateColumns: `repeat(${values.length}, minmax(0, 1fr))` }}>
            {values.map((item, index) => {
              const barTone = item.hasForecast || index === values.length - 1 ? "selected" : item.fact <= 0 ? "inactive" : "normal";
              const deltaLabel = formatPercentDelta(item.delta, item.trend);
              return (
              <div
                className="continuous-week"
                key={`${item.monthKey}-${item.week.week}`}
                data-tooltip={`${item.monthLabel}, ${item.week.week} неделя\nФакт: ${formatNumber(item.fact)}\nПлан: ${formatNumber(item.plan)}\nДинамика: ${deltaLabel}`}
              >
                <div className="continuous-bar-area">
                  <span
                    className={`continuous-bar ${barTone}`}
                    style={{ height: `${Math.max((item.fact / chartMax) * chartHeight, 8)}px` }}
                  />
                </div>
                <strong>{formatNumber(item.fact)}</strong>
                <small>{item.week.week} нед.</small>
                <em className={item.trend}>{deltaLabel}</em>
                {index < values.length - 1 && item.week.week === item.monthWeekCount && <i className="month-divider" />}
              </div>
              );
            })}
          </div>
          <div className="continuous-legend">
            <span><i className="legend-dot fact" /> Факт</span>
            <span><i className="legend-line plan" /> План</span>
            <span><i className="legend-line optima" /> Прогноз Optima</span>
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
        <button className="chart-more-button" type="button" aria-label="Действия графика">
          <MoreHorizontal size={18} />
        </button>
      </div>
      <WeeklyTrendChart weeks={weeks} metric={metric} todayIso={todayIso} />
    </article>
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
    return { week, plan, fact, delta, trend: trendClass(delta, previous === null), hasForecast: shouldShowForecastForWeek(week, todayIso) };
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
        <span><i className="legend-line plan" /> План</span>
      </div>
      {values.map((item, index) => {
        const barTone = item.hasForecast || index === values.length - 1 ? "selected" : item.fact <= 0 ? "inactive" : "normal";
        const deltaLabel = formatPercentDelta(item.delta, item.trend);
        return (
        <div
          key={item.week.week}
          className="trend-week"
          data-tooltip={`${item.week.week} неделя\nФакт: ${formatNumber(item.fact)}\nПлан: ${formatNumber(item.plan)}\nДинамика: ${deltaLabel}`}
        >
          <div className="trend-plot" style={{ height: chartHeight }}>
            <span
              className={`trend-bar ${barTone}`}
              style={{ height: `${Math.max((item.fact / chartMax) * chartHeight, 8)}px` }}
            />
          </div>
          <strong>{formatNumber(item.fact)}</strong>
          <small>{item.week.week} нед.</small>
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
        {(items.length ? items : ["Критичных отклонений по текущим данным нет. Продолжайте сверять план, воронку и события."]).map((item) => (
          <p key={item}>{item}</p>
        ))}
      </div>
    </section>
  );
}

function MonthAdminPanel({
  dates,
  months,
  selectedMonthKey,
  selectedScope,
  selectedMonthConfig,
  records,
  selectMonth,
  onCreateMonth,
  updateAggregatedFact,
}: {
  dates: string[];
  months: MonthConfig[];
  selectedMonthKey: string;
  selectedScope: ReportScope;
  selectedMonthConfig: MonthConfig;
  records: DailyRecord[];
  selectMonth: (monthKey: string) => void;
  onCreateMonth: (draft: MonthDraft) => void;
  updateAggregatedFact: (date: string, metric: Metric, value: number) => void;
}) {
  const [draft, setDraft] = useState<MonthDraft>(() => nextMonthDraft(selectedMonthConfig));
  const datesByWeek = dates.reduce<Record<number, string[]>>((acc, date) => {
    const week = getWeekOfMonth(date);
    acc[week] = [...(acc[week] ?? []), date];
    return acc;
  }, {});

  return (
    <section className="month-control-panel">
      <PanelHead title="Администрирование месяца" description="Месяц можно создать в панели, а факт быстро заполнить по неделям." />
      <div className="month-picker-row">
        <label>
          Месяц
          <select value={selectedMonthKey} onChange={(event) => selectMonth(event.target.value)}>
            {months.map((config) => (
              <option key={config.monthKey} value={config.monthKey}>{config.label}</option>
            ))}
          </select>
        </label>
        <span>Факт: {selectedScope === "Все" ? "МСК + СПБ" : selectedScope}</span>
      </div>
      <form
        className="month-create-form"
        onSubmit={(event) => {
          event.preventDefault();
          onCreateMonth(draft);
        }}
      >
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
        {metrics.map((metric) => (
          <label key={metric}>
            План: {metric}
            <input
              type="number"
              value={draft.plan[metric]}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  plan: { ...current.plan, [metric]: Math.max(0, Number(event.target.value) || 0) },
                }))
              }
            />
          </label>
        ))}
        <button className="primary-button" type="submit"><Plus size={16} /> Добавить месяц</button>
      </form>

      <div className="month-weeks">
        {Object.entries(datesByWeek).map(([week, weekDates]) => (
          <section className="week-block" key={week}>
            <div className="week-header">
              <h3>{week} неделя</h3>
              <span>{formatDay(weekDates[0])} - {formatDay(weekDates[weekDates.length - 1])}</span>
            </div>
            <div className="week-table">
              <div className="table-row header">
                <span>День</span>
                {metrics.map((metric) => <span key={metric}>{metric}</span>)}
              </div>
              {weekDates.map((date) => (
                <div className="table-row" key={date}>
                  <span className="date-cell">{formatDay(date)} <small>{weekdayLabel(date)}</small></span>
                  {metrics.map((metric) => {
                    const value = total(records.filter((record) => record.date === date && record.metric === metric), "fact");
                    return (
                      <label key={metric} className="compact-input">
                        <input type="number" value={value} onChange={(event) => updateAggregatedFact(date, metric, Number(event.target.value))} />
                      </label>
                    );
                  })}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

function DailyWeekEditor({
  dates,
  records,
  updateAggregatedFact,
}: {
  dates: string[];
  records: DailyRecord[];
  updateAggregatedFact: (date: string, metric: Metric, value: number) => void;
}) {
  return (
    <section className="daily-editor-panel">
      <PanelHead title="Дни недели" description="Факт редактируется прямо в строках, чтобы быстро найти день отклонения." />
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
                  <input type="number" value={value} onChange={(event) => updateAggregatedFact(date, metric, Number(event.target.value))} />
                </label>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

function EventCalendar({ dates, events }: { dates: string[]; events: EventItem[] }) {
  return (
    <div className="calendar-grid">
      {dates.map((date) => {
        const dayEvents = events.filter((event) => event.startDate <= date && date <= event.endDate);
        return (
          <button className="calendar-day" key={date} type="button">
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

function EventForm({ dates, onAdd }: { dates: string[]; onAdd: (event: EventItem) => void }) {
  const [draft, setDraft] = useState({
    title: "",
    startDate: dates[0],
    endDate: dates[0],
    type: "рекламные изменения" as EventType,
    group: "internal" as EventGroup,
    expectedEffect: "неизвестно" as Effect,
    actualEffect: "неизвестно" as Effect,
    city: "все" as City | "все",
    metric: "все" as Metric | "все",
    description: "",
  });

  function setType(type: EventType) {
    setDraft((current) => ({
      ...current,
      type,
      group: internalEventTypes.includes(type) ? "internal" : "external",
    }));
  }

  return (
    <form
      className="event-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!draft.title.trim()) return;
        onAdd({
          id: `evt-${Date.now()}`,
          ...draft,
          source: "manual",
          importance: 2,
        });
        setDraft((current) => ({ ...current, title: "", description: "" }));
      }}
    >
      <h2>Добавить фактор</h2>
      <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Название события" />
      <div className="form-pair">
        <label>Начало <input type="date" value={draft.startDate} onChange={(event) => setDraft({ ...draft, startDate: event.target.value })} /></label>
        <label>Конец <input type="date" value={draft.endDate} onChange={(event) => setDraft({ ...draft, endDate: event.target.value })} /></label>
      </div>
      <label>Категория <select value={draft.type} onChange={(event) => setType(event.target.value as EventType)}>{eventTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
      <label>Город <select value={draft.city} onChange={(event) => setDraft({ ...draft, city: event.target.value as City | "все" })}><option value="все">все</option><option value="МСК">МСК</option><option value="СПБ">СПБ</option></select></label>
      <label>Ожидаемый эффект <select value={draft.expectedEffect} onChange={(event) => setDraft({ ...draft, expectedEffect: event.target.value as Effect })}>{effectLabels.map((effect) => <option key={effect}>{effect}</option>)}</select></label>
      <label>Фактический эффект <select value={draft.actualEffect} onChange={(event) => setDraft({ ...draft, actualEffect: event.target.value as Effect })}>{effectLabels.map((effect) => <option key={effect}>{effect}</option>)}</select></label>
      <textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Описание без категоричных причинных выводов" />
      <button className="primary-button" type="submit"><Plus size={16} /> Добавить событие</button>
    </form>
  );
}

function EventsPanel({ title, events }: { title: string; events: EventItem[] }) {
  return (
    <aside className="insight-panel">
      <h2>{title}</h2>
      <div className="event-stack">
        {events.length === 0 && <p className="empty-state">Событий за выбранный период нет</p>}
        {events.map((event) => <EventCard key={event.id} event={event} />)}
      </div>
    </aside>
  );
}

function EventCard({ event }: { event: EventItem }) {
  return (
    <article className={`event-card ${event.group} ${effectClass(event.actualEffect)}`}>
      <div className="event-card-head">
        <strong>{event.title}</strong>
        <span>{event.group === "internal" ? "внутреннее" : "внешнее"}</span>
      </div>
      <p>{event.description}</p>
      <small>{formatDay(event.startDate)} - {formatDay(event.endDate)} · {event.type} · {event.actualEffect}</small>
    </article>
  );
}

function buildMetricSummary(
  metric: Metric,
  totals: { plan: number; fact: number; forecast: number },
  monthDates: string[],
  todayIso: string,
  isClosedMonth: boolean,
): MetricSummary {
  const endValue = isClosedMonth ? totals.fact : totals.forecast;
  const remainingDays = isClosedMonth ? 0 : Math.max(monthDates.filter((date) => date >= todayIso).length, 1);
  const baseDaily = Math.ceil(totals.plan / Math.max(monthDates.length, 1));
  const needToPlan = Math.max(totals.plan - totals.fact, 0);
  const dailyTarget = endValue >= totals.plan || isClosedMonth ? baseDaily : Math.ceil(needToPlan / remainingDays);

  return {
    metric,
    plan: totals.plan,
    fact: totals.fact,
    forecast: isClosedMonth ? null : totals.forecast,
    completion: percent(totals.fact, totals.plan),
    deltaAbs: totals.fact - totals.plan,
    endValue,
    endLabel: isClosedMonth ? "факт месяца" : "прогноз Optima",
    dailyTarget,
    dailyLabel: endValue >= totals.plan || isClosedMonth ? "среднее для 100%" : "нужно в день для 100%",
  };
}

function mergeTotals(weeks: WeekSummary[]): MetricTotals {
  return metrics.reduce<MetricTotals>((acc, metric) => {
    acc[metric] = weeks.reduce(
      (sum, week) => ({
        plan: sum.plan + week.totals[metric].plan,
        fact: sum.fact + week.totals[metric].fact,
        forecast: sum.forecast + week.totals[metric].forecast,
      }),
      { plan: 0, fact: 0, forecast: 0 },
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

function getMonthMetricTrend(current: MetricTotals, previous: MetricTotals | null, metric: Metric): "up" | "down" | "flat" {
  if (!previous) return "flat";

  const currentCompletion = percent(current[metric].fact, current[metric].plan);
  const previousCompletion = percent(previous[metric].fact, previous[metric].plan);
  return getValueTrend(currentCompletion, previousCompletion);
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

function formatPercentDelta(delta: number, trend: "positive" | "negative" | "warning"): string {
  if (trend === "warning" && delta === 0) return "база";
  const rounded = Math.round(delta);
  if (trend === "positive") return `↑ +${Math.abs(rounded)}%`;
  if (trend === "negative") return `↓ -${Math.abs(rounded)}%`;
  return "0%";
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
  return [4, 3, 2, 1, 0].map((part) => Math.round(step * part));
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
      subtitle: "Сравнение месяцев, недельная разбивка, воронка и события в одном управленческом маршруте.",
    },
    month: {
      title: "Обзор месяца",
      subtitle: "Статус выбранного месяца, KPI, воронка, недельная динамика и события периода.",
    },
    week: {
      title: "Неделя",
      subtitle: "Одна неделя по дням: где началось отклонение и какие события были рядом.",
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

function nextMonthDraft(config: MonthConfig): MonthDraft {
  const nextMonth = new Date(config.year, config.monthIndex + 1, 1);
  return {
    year: nextMonth.getFullYear(),
    monthIndex: nextMonth.getMonth(),
    plan: { ...config.plan },
  };
}

function loadInitialState() {
  const fallback = {
    monthConfigs: seedMonthConfigs,
    records: buildSeedRecords(),
    events: seedEvents,
    selectedMonthKey: monthConfig.monthKey,
  };

  if (typeof window === "undefined") return fallback;

  try {
    const rawState = window.localStorage.getItem(storageKey) ?? window.localStorage.getItem("weekly-report-local-v2");
    if (!rawState) return fallback;

    const parsed = JSON.parse(rawState) as Partial<typeof fallback>;
    if (!Array.isArray(parsed.monthConfigs) || !Array.isArray(parsed.records) || !Array.isArray(parsed.events)) {
      return fallback;
    }

    const monthConfigs = parsed.monthConfigs.map(normalizeMonthConfig);
    const events = parsed.events.map(normalizeEvent);

    return {
      monthConfigs,
      records: parsed.records,
      events,
      selectedMonthKey: parsed.selectedMonthKey || monthConfigs[monthConfigs.length - 1]?.monthKey || fallback.selectedMonthKey,
    };
  } catch {
    return fallback;
  }
}

function normalizeMonthConfig(config: MonthConfig): MonthConfig {
  return {
    ...config,
    label: config.label.replace(/\sг\.$/, ""),
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
