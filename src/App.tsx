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
import {
  legacyBrandRecordsToPerformance,
  loadBrandAnalyticsSnapshot,
  type BrandAnalyticsBundle,
  type BrandAnalyticsRecord,
  type BrandCity,
} from "./api/brandAnalyticsApi";
import type { CSSProperties, ReactNode } from "react";
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
  BrandAlias,
  BrandBranchPlatform,
  BrandBranchWeekly,
  BrandEvent,
  BrandPerformanceWeekly,
  WeekdayCoefficientKey,
  WeekSummary,
} from "./types";
import { formatDay, getMonthDates, getWeekOfMonth, weekdayLabel } from "./utils/date";
import { buildWeeklySummary } from "./utils/report";

type Mode = "allMonths" | "month" | "monthDaily" | "leadDaily" | "week" | "sources" | "brands" | "messages" | "events" | "admin";
type AdminTab = "day" | "month" | "sources" | "events" | "coefficients";
type EventGroupFilter = "all" | EventGroup;
type EventCategoryFilter = "all" | EventType;
type MonthDraft = CreateMonthPayload;
type DailyAdminMetricDraft = { fact: number; recommendations: number; omQualified: number };
type DailyAdminDraft = Record<City, Record<Metric, DailyAdminMetricDraft>>;
type SourceMetricDraft = Record<Metric, number>;
type SourcePeriodMode = "day" | "week" | "month";
type SourceCityFilter = "Все" | "МСК" | "СПБ";
type EditableSourceCity = Exclude<SourceCityFilter, "Все">;
type BrandTab = "overview" | "compare" | "brand" | "free";
type BrandViewMode = "overall" | "sources";
type BrandCompareMetricKey = "leads" | "qualified" | "sales" | "roas" | "roasFact" | "saleCost" | "avgCheck";
type BrandCompareChartMode = "values" | "index";
type SourceChartBucket = {
  key: string;
  label: string;
  caption: string;
  values: Record<string, Record<Metric, number>>;
};
type SourceMoneyTotals = {
  source: string;
  totals: Record<Metric, number>;
  budget: number;
  revenue: number;
  cpl: number;
  cpql: number;
  saleCost: number;
  roas: number | null;
  roasFact: number | null;
};
type ChartLinePoint = { x: number; y: number };
type ChartLineSegment = ChartLinePoint[];
type ChartLineRange = { top: number; height: number };
type WeekendLeadChartSeries = { label: string; className: string; values: number[] };
type WeekendLeadChartMonth = { key: string; label: string; dates: string[]; series: WeekendLeadChartSeries[] };
type BrandSummary = {
  brand: string;
  domain: string;
  cityLabel: string;
  records: BrandAnalyticsRecord[];
  leads: number;
  qualified: number;
  sales: number;
  revenue: number;
  budget: number;
  leadToQualified: number;
  qualifiedToSales: number;
  cpl: number;
  cpql: number;
  saleCost: number;
  roas: number | null;
  roasFact: number | null;
  avgCheck: number;
  monthly: BrandAnalyticsRecord["monthly"];
};
type BrandDashboardSummary = {
  brand: string;
  domain: string;
  cityLabel: string;
  records: BrandAnalyticsRecord[];
  performance: BrandPerformanceWeekly[];
  branches: BrandBranchWeekly[];
  leads: number;
  qualified: number;
  sales: number;
  revenue: number;
  budget: number;
  leadToQualified: number;
  qualifiedToSales: number;
  cpl: number;
  cpql: number;
  saleCost: number;
  roas: number | null;
  roasFact: number | null;
  avgCheck: number;
  latestBranches: Record<BrandBranchPlatform, number>;
  totalBranches: number;
  salesPerBranch: Record<BrandBranchPlatform, number>;
  revenuePerBranch: Record<BrandBranchPlatform, number>;
  leadsPerBranch: Record<BrandBranchPlatform, number>;
  weekly: BrandWeeklyPoint[];
  sourceBreakdown: BrandSourceSummary[];
  topBadges: BrandTopBadge[];
};
type BrandWeeklyPoint = {
  weekStart: string;
  label: string;
  leads: number;
  qualified: number;
  sales: number;
  revenue: number;
  budget: number;
  saleCost: number;
  roas: number | null;
  roasFact: number | null;
  avgCheck: number;
};
type BrandSourceSummary = {
  source: string;
  leads: number;
  qualified: number;
  sales: number;
  revenue: number;
  budget: number;
  roas: number | null;
  roasFact: number | null;
};
type BrandTopBadge = {
  label: string;
  rank: number;
  value: string;
};
type BrandTrendEvent = {
  id: string;
  brand: string;
  city: BrandCity;
  month: string;
  metric: string;
  direction: "рост" | "падение";
  percent: number;
};
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
const sourceCityCommentPattern = /\[SOURCE_CITY=(МСК|СПБ)\]/i;
const defaultLeadSources = ["SEO", "Яндекс Карты", "Директ", "2ГИС", "Гугл Карты", "Прямые визиты", "Рек/кешбэк"];
const sourcePeriodOptions: Array<{ value: SourcePeriodMode; label: string }> = [
  { value: "day", label: "По дням" },
  { value: "week", label: "По неделям" },
  { value: "month", label: "По месяцам" },
];
const sourceCityOptions: SourceCityFilter[] = ["Все", "МСК", "СПБ"];
const brandTabs: Array<{ value: BrandTab; label: string }> = [
  { value: "overview", label: "Общий дашборд" },
  { value: "compare", label: "Сравнение городов" },
  { value: "brand", label: "Бренд" },
  { value: "free", label: "Бесплатные бренды" },
];
const brandViewOptions: Array<{ value: BrandViewMode; label: string }> = [
  { value: "overall", label: "Общая динамика" },
  { value: "sources", label: "Динамика по источникам" },
];
const brandCompareMetricOptions: Array<{ value: BrandCompareMetricKey; label: string; lowerIsBetter?: boolean; suffix?: string }> = [
  { value: "leads", label: "Лиды" },
  { value: "qualified", label: "КВАЛ" },
  { value: "sales", label: "Продажи" },
  { value: "roas", label: "ROAS", suffix: "x" },
  { value: "roasFact", label: "ROAS факт", suffix: "x" },
  { value: "saleCost", label: "Стоимость продажи", lowerIsBetter: true, suffix: " ₽" },
  { value: "avgCheck", label: "Средний чек", suffix: " ₽" },
];
const brandCompareColors = ["#1C46F5", "#14B86A", "#7F5CFF", "#EAA900", "#111B2F", "#2CB8C5"];
const branchPlatforms: BrandBranchPlatform[] = ["Яндекс Карты", "Google Карты", "2ГИС"];
const comparedTwoCityBrands = ["Рулевой", "Автодрайв", "Изи Драйв", "Гермес", "Пора за руль"];
const emptyBrandAnalyticsBundle: BrandAnalyticsBundle = {
  records: [],
  performance: [],
  branches: [],
  aliases: [],
};
const noLeadSourceOption = "__none__";
const otherLeadSourceOption = "другое";
const leadSourceCommentPattern = /\[LEAD_SOURCE=([^\]]+)\]/i;
const planRingItems: Array<{ metric: Metric; label: string; className: string; radius: number }> = [
  { metric: "Лиды", label: "Лиды", className: "leads", radius: 58 },
  { metric: "Квалы", label: "Квалы", className: "qualified", radius: 46 },
  { metric: "Продажи", label: "Продажи", className: "sales", radius: 34 },
];
const weekendLeadManualMonths: WeekendLeadChartMonth[] = [
  {
    key: "2026-01-weekend",
    label: "Январь 2026",
    dates: ["2026-01-03", "2026-01-04", "2026-01-10", "2026-01-11", "2026-01-17", "2026-01-18", "2026-01-24", "2026-01-25", "2026-01-31"],
    series: [{ label: "Все", className: "all", values: [68, 75, 76, 76, 108, 102, 86, 88, 101] }],
  },
  {
    key: "2026-02-weekend",
    label: "Февраль 2026",
    dates: ["2026-02-01", "2026-02-07", "2026-02-08", "2026-02-14", "2026-02-15", "2026-02-21", "2026-02-22", "2026-02-28"],
    series: [{ label: "Все", className: "all", values: [90, 96, 82, 100, 97, 112, 84, 98] }],
  },
  {
    key: "2026-03-weekend",
    label: "Март 2026",
    dates: ["2026-03-01", "2026-03-07", "2026-03-08", "2026-03-14", "2026-03-15", "2026-03-21", "2026-03-22", "2026-03-28", "2026-03-29"],
    series: [{ label: "Все", className: "all", values: [124, 110, 66, 135, 133, 142, 106, 144, 156] }],
  },
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
  const [brandData, setBrandData] = useState<BrandAnalyticsBundle>(emptyBrandAnalyticsBundle);
  const [brandLoadMessage, setBrandLoadMessage] = useState("Бренды загружаются из Google Sheets...");
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

    loadBrandAnalyticsSnapshot()
      .then((snapshot) => {
        if (cancelled) return;
        setBrandData(snapshot);
        setBrandLoadMessage(
          snapshot.records.length || snapshot.performance.length || snapshot.branches.length
            ? `Бренды загружены: ${snapshot.records.length} строк аналитики, ${snapshot.performance.length} недельных строк, ${snapshot.branches.length} строк филиалов.`
            : "В таблице брендов пока нет строк для отображения.",
        );
      })
      .catch((error) => {
        if (!cancelled) {
          setBrandLoadMessage(`Бренды пока не загрузились: ${getErrorMessage(error)}.`);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

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

        <div className={mode === "events" || mode === "messages" || mode === "sources" || mode === "brands" || mode === "admin" || mode === "leadDaily" ? "content-single" : "content-grid"}>
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
            {mode === "leadDaily" && (
              <LeadsWeekendReport
                records={records}
                monthConfigs={monthConfigs}
                selectedScope={selectedScope}
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
              <SourcesAnalyticsDashboard
                records={records}
                selectedMonthConfig={selectedMonthConfig}
                monthConfigs={monthConfigs}
                selectedScope={selectedScope}
                setSelectedScope={setSelectedScope}
                brandData={brandData}
              />
            )}
            {mode === "brands" && (
              <BrandsDashboardV2
                data={brandData}
                selectedMonthConfig={selectedMonthConfig}
                selectedScope={selectedScope}
                setSelectedScope={setSelectedScope}
                loadMessage={brandLoadMessage}
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

          {mode !== "events" && mode !== "messages" && mode !== "brands" && mode !== "admin" && mode !== "monthDaily" && mode !== "leadDaily" && (
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
    { mode: "brands", label: "Бренды", icon: <TrendingUp /> },
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

      <button className={mode === "leadDaily" ? "designer-report-button active" : "designer-report-button"} type="button" onClick={() => setMode("leadDaily")}>
        <TrendingUp size={16} />
        <span>
          <strong>Лиды по дням</strong>
          <small>дизайнерский отчет</small>
        </span>
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

function LeadsWeekendReport({
  records,
  monthConfigs,
  selectedScope,
}: {
  records: DailyRecord[];
  monthConfigs: MonthConfig[];
  selectedScope: ReportScope;
}) {
  const [onlyWeekends, setOnlyWeekends] = useState(false);
  const chartMonths = useMemo(
    () => buildLeadChartMonths(records, monthConfigs, selectedScope, onlyWeekends),
    [monthConfigs, onlyWeekends, records, selectedScope],
  );
  const totalLeads = chartMonths.reduce((sum, month) => sum + month.series.reduce((seriesSum, item) => seriesSum + item.values.reduce((valueSum, value) => valueSum + value, 0), 0), 0);
  const activeDays = chartMonths.reduce((sum, month) => sum + month.dates.filter((_, index) => month.series.some((item) => item.values[index] > 0)).length, 0);
  const rangeLabel = chartMonths.length
    ? `${chartMonths[0].label} → ${chartMonths[chartMonths.length - 1].label}`
    : "нет месяцев";

  return (
    <div className="page-stack leads-daily-report">
      <ExecutiveSummary
        status={{ label: onlyWeekends ? "только выходные" : "все дни", tone: "good" }}
        eyebrow={rangeLabel}
        title="Лиды по дням"
        subtitle="Январь–март собраны только по выходным из отдельной таблицы; остальные месяцы показывают все дни, если не включен фильтр выходных."
        facts={[
          `Город: ${selectedScope === "Все" ? "МСК + СПБ / общий срез" : selectedScope}`,
          `Месяцев: ${chartMonths.length}`,
          `Дней с FACT: ${activeDays}`,
          `Лидов: ${formatNumber(totalLeads)}`,
        ]}
      />

      <section className="analytics-panel leads-daily-panel">
        <div className="leads-daily-panel-head">
          <PanelHead
            title="Lead curve"
            description="Наведи на любой день графика, чтобы увидеть конкретное количество лидов за дату. Линии без точек."
          />
          <button
            type="button"
            className={onlyWeekends ? "weekend-filter-button active" : "weekend-filter-button"}
            onClick={() => setOnlyWeekends((current) => !current)}
            aria-pressed={onlyWeekends}
          >
            Только выходные
          </button>
        </div>
        <div className="leads-daily-month-stack">
          {chartMonths.map((month) => (
            <LeadsWeekendMonthChart key={month.key} month={month} />
          ))}
        </div>
      </section>
    </div>
  );
}

function LeadsWeekendMonthChart({
  month,
}: {
  month: WeekendLeadChartMonth;
}) {
  const { dates, series } = month;
  const isWeekendOnlyMonth = dates.length > 0 && dates.every(isWeekend);
  const slotCount = isWeekendOnlyMonth ? 10 : 31;
  const chartWidth = 1000;
  const svgHeight = 318;
  const plot = { left: 54, right: 24, top: 48, height: 178, bottom: 54 };
  const plotWidth = chartWidth - plot.left - plot.right;
  const xForIndex = (index: number) => plot.left + (slotCount <= 1 ? plotWidth / 2 : (plotWidth / Math.max(slotCount - 1, 1)) * index);
  const chartMax = 200;
  const yForValue = (value: number) => plot.top + plot.height - (Math.min(Math.max(value, 0), chartMax) / chartMax) * plot.height;
  const axisLabels = [200, 150, 100, 50, 0];
  const dayStep = plotWidth / Math.max(slotCount - 1, 1);

  if (!dates.length) {
    return (
      <div className="leads-daily-empty">
        <strong>Пока нет дней для графика</strong>
        <span>Создай месяц или дождись загрузки Google Sheets.</span>
      </div>
    );
  }

  return (
    <article className="leads-daily-month-card">
      <div className="leads-daily-month-head">
        <div>
          <strong>{month.label}</strong>
          <span>{dates.length} дней · {dates.filter(isWeekend).length} выходных</span>
        </div>
        <div className="leads-daily-legend">
          {series.map((item) => (
            <span key={item.label} className={item.className}>
              <i />
              {item.label}
            </span>
          ))}
          <span className="weekend"><i /> выходные</span>
        </div>
      </div>
      <div className="leads-daily-scroll" aria-label={`График лидов по дням: ${month.label}`}>
      <svg className="leads-daily-svg" viewBox={`0 0 ${chartWidth} ${svgHeight}`} width={chartWidth} height={svgHeight} role="img">
        <title>Лиды по дням: {month.label}</title>
        <desc>Дневной график лидов за месяц. Выходные выделены фоном.</desc>

        <rect x="0" y="0" width={chartWidth} height={svgHeight} rx="22" className="lead-chart-bg" />

        <rect x="0" y="0" width={chartWidth} height="40" className="lead-month-band" />
        <text x="18" y="25" className="lead-month-title">{month.label}</text>

        {Array.from({ length: slotCount }).map((_, index) => {
          const date = dates[index];
          const centerX = xForIndex(index);
          if (!date) {
            return (
              <rect
                key={`empty-slot-${index}`}
                x={centerX - Math.max(10, dayStep * 0.42)}
                y={plot.top - 8}
                width={Math.max(20, dayStep * 0.84)}
                height={plot.height + 64}
                rx="12"
                className="lead-empty-slot"
              />
            );
          }
          if (date && !isWeekend(date)) return null;
          return (
            <rect
              key={`slot-${index}`}
              x={centerX - Math.max(10, dayStep * 0.42)}
              y={plot.top - 8}
              width={Math.max(20, dayStep * 0.84)}
              height={plot.height + 64}
              rx="12"
              className="lead-weekend-band"
            />
          );
        })}

        {axisLabels.map((label) => {
          const y = yForValue(label);
          return (
            <g key={label}>
              <line x1={plot.left} y1={y} x2={chartWidth - plot.right} y2={y} className="lead-grid-line" />
              <text x={plot.left - 12} y={y + 4} textAnchor="end" className="lead-axis-label">{formatNumber(label)}</text>
            </g>
          );
        })}

        {series.map((item) => {
          const segments = buildDailyPathSegments(item.values, (value, index) =>
            value <= 0 ? null : { x: xForIndex(index), y: yForValue(value) },
          );
          return (
            <g key={item.label} className={`lead-series lead-series-${item.className}`}>
              {segments.map((path, index) => <path key={index} d={path} />)}
            </g>
          );
        })}

        {dates.map((date, index) => {
          const showLabel = index === 0 || date.endsWith("-01") || isWeekend(date) || index === dates.length - 1;
          return (
            <g key={`label-${date}`}>
              <text
                x={xForIndex(index)}
                y={svgHeight - 36}
                textAnchor="middle"
                className={isWeekend(date) ? "lead-day-label weekend" : "lead-day-label"}
              >
                {Number(date.slice(8, 10))}
              </text>
              {showLabel && (
                <text x={xForIndex(index)} y={svgHeight - 18} textAnchor="middle" className="lead-weekday-label">
                  {weekdayLabel(date)}
                </text>
              )}
            </g>
          );
        })}

        {dates.map((date, index) => {
          const centerX = xForIndex(index);
          const width = Math.max(22, dayStep * 0.86);
          return (
            <rect
              key={`hover-${date}`}
              x={centerX - width / 2}
              y={plot.top - 14}
              width={width}
              height={plot.height + 96}
              className="lead-hover-zone"
            >
              <title>{leadDayTooltip(date, series, index)}</title>
            </rect>
          );
        })}
      </svg>
      </div>
    </article>
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

function SourcesAnalyticsDashboard({
  records,
  selectedMonthConfig,
  monthConfigs,
  selectedScope,
  setSelectedScope,
  brandData,
}: {
  records: DailyRecord[];
  selectedMonthConfig: MonthConfig;
  monthConfigs: MonthConfig[];
  selectedScope: ReportScope;
  setSelectedScope: (scope: ReportScope) => void;
  brandData: BrandAnalyticsBundle;
}) {
  const [periodMode, setPeriodMode] = useState<SourcePeriodMode>("day");
  const [selectedSourceBrandKey, setSelectedSourceBrandKey] = useState("all");
  const sourceCityFilter: SourceCityFilter = selectedScope;
  const sourceBrandRows = useMemo(
    () => brandData.performance.length ? brandData.performance : legacyBrandRecordsToPerformance(brandData.records),
    [brandData.performance, brandData.records],
  );
  const sourceBrandOptions = useMemo(() => {
    const rows = sourceBrandRows.filter((row) => sourceCityFilter === "Все" || row.city === sourceCityFilter);
    const brands = [...new Map(rows
      .filter((row) => row.brand)
      .map((row) => [normalizeBrandDashboardKey(row.brand), row.brand] as const))
      .values()]
      .sort((a, b) => a.localeCompare(b, "ru"));
    return [{ key: "all", label: "Все бренды" }, ...brands.map((brand) => ({ key: normalizeBrandDashboardKey(brand), label: brand }))];
  }, [sourceBrandRows, sourceCityFilter]);
  useEffect(() => {
    if (!sourceBrandOptions.some((option) => option.key === selectedSourceBrandKey)) setSelectedSourceBrandKey("all");
  }, [selectedSourceBrandKey, sourceBrandOptions]);
  const selectedSourceBrand = sourceBrandOptions.find((option) => option.key === selectedSourceBrandKey);
  const isBrandSourceMode = selectedSourceBrandKey !== "all";
  const chartPeriodMode: SourcePeriodMode = isBrandSourceMode && periodMode === "day" ? "week" : periodMode;
  const cityFilteredRecords = useMemo(
    () => getSourceRecordsForCity(records, sourceCityFilter),
    [records, sourceCityFilter],
  );
  const scopedRecords = useMemo(
    () => getSourceRecordsForPeriod(cityFilteredRecords, periodMode, selectedMonthConfig),
    [cityFilteredRecords, periodMode, selectedMonthConfig],
  );
  const scopedBrandRows = useMemo(
    () => getSourceBrandRowsForPeriod(sourceBrandRows, selectedSourceBrandKey, sourceCityFilter, chartPeriodMode, selectedMonthConfig),
    [sourceBrandRows, selectedSourceBrandKey, sourceCityFilter, chartPeriodMode, selectedMonthConfig],
  );
  const activeSources = useMemo(
    () => isBrandSourceMode ? getActiveSourcesFromBrandPerformance(scopedBrandRows) : getActiveLeadSources(scopedRecords),
    [isBrandSourceMode, scopedBrandRows, scopedRecords],
  );
  const [hiddenSourceKeys, setHiddenSourceKeys] = useState<string[]>([]);

  useEffect(() => {
    setHiddenSourceKeys((current) => current.filter((key) => activeSources.some((source) => sourceKey(source) === key)));
  }, [activeSources]);

  const visibleSources = activeSources.filter((source) => !hiddenSourceKeys.includes(sourceKey(source)));
  const sourceTotals = useMemo(
    () => isBrandSourceMode
      ? getSourceMoneyTotalsFromBrandPerformance(scopedBrandRows, visibleSources)
      : getSourceMoneyTotalsFromDaily(scopedRecords, visibleSources),
    [isBrandSourceMode, scopedBrandRows, visibleSources, scopedRecords],
  );
  const buckets = useMemo(
    () => isBrandSourceMode
      ? buildBrandSourceChartBuckets(scopedBrandRows, chartPeriodMode, selectedMonthConfig, monthConfigs, activeSources)
      : buildSourceChartBuckets(cityFilteredRecords, periodMode, selectedMonthConfig, monthConfigs, activeSources),
    [isBrandSourceMode, scopedBrandRows, chartPeriodMode, selectedMonthConfig, monthConfigs, activeSources, cityFilteredRecords, periodMode],
  );
  const summaryTotals = metrics.reduce<Record<Metric, number>>((acc, metric) => {
    acc[metric] = sourceTotals.reduce((sum, item) => sum + item.totals[metric], 0);
    return acc;
  }, {} as Record<Metric, number>);
  const periodLabel = periodMode === "month" ? getSourceMonthRangeLabel(monthConfigs) : selectedMonthConfig.label;
  const strongestMetric = metrics.reduce((best, metric) => (summaryTotals[metric] > summaryTotals[best] ? metric : best), "Лиды" as Metric);
  const strongestSource = sourceTotals
    .map((item) => ({ source: item.source, value: item.totals[strongestMetric] }))
    .sort((a, b) => b.value - a.value)[0];
  const activePeriodLabel = sourcePeriodOptions.find((option) => option.value === chartPeriodMode)?.label ?? "По дням";

  const toggleSource = (source: string) => {
    const key = sourceKey(source);
    setHiddenSourceKeys((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  };

  return (
    <div className="page-stack sources-dashboard">
      <ExecutiveSummary
        status={{ label: "источники отдельно", tone: "good" }}
        eyebrow={periodLabel}
        title="Источники"
        facts={[
          "Мониторинг трафика и эффективности по источникам",
          `Город: ${sourceCityFilter === "Все" ? "МСК + СПБ" : sourceCityFilter}`,
          `Бренд: ${selectedSourceBrand?.label ?? "Все бренды"}`,
          `Период: ${activePeriodLabel.toLowerCase()}`,
          `Включено: ${visibleSources.length} из ${activeSources.length}`,
          strongestSource?.value ? `Лидер: ${strongestSource.source}` : "FACT по источникам пока пустой",
        ]}
      />

      <section className="analytics-panel source-control-panel">
        <div>
          <span>Срез</span>
          <div className="source-period-toggle" role="group" aria-label="Переключить период источников">
            {sourcePeriodOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={periodMode === option.value ? "active" : ""}
                onClick={() => setPeriodMode(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span>Город</span>
          <div className="source-period-toggle source-city-toggle" role="group" aria-label="Переключить город источников">
            {sourceCityOptions.map((option) => (
              <button
                key={option}
                type="button"
                className={sourceCityFilter === option ? "active" : ""}
                onClick={() => setSelectedScope(option)}
              >
                {option === "Все" ? "Все" : option}
              </button>
            ))}
          </div>
        </div>
        <label className="source-brand-select">
          <span>Бренд</span>
          <select value={selectedSourceBrandKey} onChange={(event) => setSelectedSourceBrandKey(event.target.value)}>
            {sourceBrandOptions.map((option) => (
              <option key={option.key} value={option.key}>{option.label}</option>
            ))}
          </select>
        </label>
        <div>
          <span>Источники на графиках</span>
          <div className="source-source-toggles">
            {activeSources.map((source, index) => {
              const isVisible = !hiddenSourceKeys.includes(sourceKey(source));
              return (
                <button
                  key={source}
                  type="button"
                  className={isVisible ? "source-toggle-button active" : "source-toggle-button"}
                  onClick={() => toggleSource(source)}
                  style={{ "--source-color": getLeadSourceColor(source, index) } as CSSProperties}
                  aria-pressed={isVisible}
                >
                  <i aria-hidden="true" />
                  {source}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="source-kpi-strip">
        {metrics.map((metric) => (
          <article key={metric}>
            <span>{sourceMetricLabel(metric)}</span>
            <strong>{formatNumber(summaryTotals[metric])}</strong>
            <small>итог по включенным источникам</small>
          </article>
        ))}
      </section>

      <section className="analytics-panel source-share-panel">
        <PanelHead
          title="Доля по источникам"
          description="Круговая диаграмма показывает вклад каждого включенного источника в лиды, КВАЛ и продажи."
        />
        <div className="source-pie-grid">
          {metrics.map((metric) => (
            <SourceShareCard
              key={metric}
              metric={metric}
              sourceTotals={sourceTotals}
              activeSources={activeSources}
            />
          ))}
        </div>
      </section>

      <section className="analytics-panel source-chart-panel">
        <PanelHead
          title={`Динамика источников: ${activePeriodLabel.toLowerCase()}`}
          description="Ниже отдельные графики по лидам, КВАЛ и продажам. Любой источник можно временно выключить."
        />
        <div className="source-chart-stack">
          {metrics.map((metric) => (
            <SourceMetricLineChart
              key={metric}
              metric={metric}
              buckets={buckets}
              activeSources={activeSources}
              visibleSources={visibleSources}
            />
          ))}
        </div>
      </section>

      <section className="analytics-panel">
        <PanelHead
          title="Эффективность источников"
          description={isBrandSourceMode
            ? "В режиме одного бренда считаются бюджет, стоимость лида, КВАЛ, продажи и ROAS из ДРР."
            : strongestSource?.value ? `Самый сильный источник по ${sourceMetricLabel(strongestMetric).toLowerCase()}: ${strongestSource.source}.` : "Пока нет FACT по источникам за выбранный период."}
        />
        <SourceEfficiencyTable
          sourceTotals={sourceTotals}
          activeSources={activeSources}
          summaryTotals={summaryTotals}
        />
      </section>
    </div>
  );
}

function SourceShareCard({
  metric,
  sourceTotals,
  activeSources,
}: {
  metric: Metric;
  sourceTotals: SourceMoneyTotals[];
  activeSources: string[];
}) {
  const rows = sourceTotals
    .map((item) => ({
      source: item.source,
      value: item.totals[metric],
      color: getLeadSourceColor(item.source, activeSources.findIndex((source) => sourceNameEquals(source, item.source))),
    }))
    .sort((a, b) => b.value - a.value);
  const totalValue = rows.reduce((sum, item) => sum + item.value, 0);
  const donutBackground = totalValue > 0 ? buildSourceConicGradient(rows, totalValue) : "conic-gradient(#dbe7ff 0 100%)";

  return (
    <article className="source-pie-card">
      <div className="source-pie-head">
        <span>{sourceMetricLabel(metric)}</span>
        <strong>{formatNumber(totalValue)}</strong>
      </div>
      <div className="source-pie-body">
        <div className="source-donut" style={{ background: donutBackground }}>
          <div className="source-donut-center">
            <strong>{totalValue > 0 ? "100%" : "0%"}</strong>
            <small>{sourceMetricLabel(metric)}</small>
          </div>
        </div>
        <div className="source-pie-legend">
          {rows.map((item) => {
            const share = totalValue > 0 ? Math.round((item.value / totalValue) * 100) : 0;
            return (
              <div key={item.source}>
                <i style={{ background: item.color }} aria-hidden="true" />
                <span>{item.source}</span>
                <strong>{share}%</strong>
              </div>
            );
          })}
          {rows.length === 0 && <p className="empty-state">Выберите хотя бы один источник.</p>}
        </div>
      </div>
    </article>
  );
}

function SourceMetricLineChart({
  metric,
  buckets,
  activeSources,
  visibleSources,
}: {
  metric: Metric;
  buckets: SourceChartBucket[];
  activeSources: string[];
  visibleSources: string[];
}) {
  const chartWidth = Math.max(960, buckets.length * 42);
  const chartHeight = 230;
  const plot = { left: 44, right: 24, top: 18, bottom: 44 };
  const plotWidth = chartWidth - plot.left - plot.right;
  const plotHeight = chartHeight - plot.top - plot.bottom;
  const maxValue = Math.max(
    1,
    ...buckets.flatMap((bucket) => visibleSources.map((source) => bucket.values[source]?.[metric] ?? 0)),
  );
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => Math.round(maxValue * ratio));
  const xFor = (index: number) => plot.left + (buckets.length <= 1 ? plotWidth / 2 : (index / (buckets.length - 1)) * plotWidth);
  const yFor = (value: number) => plot.top + plotHeight - (value / maxValue) * plotHeight;
  const labelEvery = buckets.length > 20 ? 3 : buckets.length > 12 ? 2 : 1;

  return (
    <article className="source-line-card">
      <div className="source-line-head">
        <div>
          <span>график по источникам</span>
          <strong>{sourceMetricLabel(metric)}</strong>
        </div>
        <div className="source-line-legend">
          {visibleSources.map((source) => {
            const sourceIndex = activeSources.findIndex((item) => sourceNameEquals(item, source));
            return (
              <span key={source}>
                <i style={{ background: getLeadSourceColor(source, sourceIndex) }} aria-hidden="true" />
                {source}
              </span>
            );
          })}
        </div>
      </div>
      {visibleSources.length === 0 ? (
        <p className="empty-state">Выберите хотя бы один источник.</p>
      ) : (
        <div className="source-line-scroll">
          <svg className="source-line-svg" viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-label={`${sourceMetricLabel(metric)} по источникам`}>
            {ticks.map((tick) => {
              const y = yFor(tick);
              return (
                <g key={tick}>
                  <line x1={plot.left} x2={chartWidth - plot.right} y1={y} y2={y} className="source-grid-line" />
                  <text x={plot.left - 10} y={y + 4} className="source-axis-label">{formatNumber(tick)}</text>
                </g>
              );
            })}
            {visibleSources.map((source) => {
              const sourceIndex = activeSources.findIndex((item) => sourceNameEquals(item, source));
              const color = getLeadSourceColor(source, sourceIndex);
              const points = buckets.map((bucket, index) => ({
                x: xFor(index),
                y: yFor(bucket.values[source]?.[metric] ?? 0),
                value: bucket.values[source]?.[metric] ?? 0,
                bucket,
              }));
              const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
              return (
                <g key={source}>
                  <path d={path} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  {points.map((point) => (
                    <circle
                      key={`${source}-${point.bucket.key}`}
                      cx={point.x}
                      cy={point.y}
                      r="3.5"
                      fill={color}
                      data-tooltip={`${point.bucket.label}: ${source}\n${sourceMetricLabel(metric)}: ${formatNumber(point.value)}`}
                    />
                  ))}
                </g>
              );
            })}
            {buckets.map((bucket, index) => (
              index % labelEvery === 0 && (
                <g key={bucket.key}>
                  <text x={xFor(index)} y={chartHeight - 20} className="source-x-label">{bucket.label}</text>
                  <text x={xFor(index)} y={chartHeight - 7} className="source-x-caption">{bucket.caption}</text>
                </g>
              )
            ))}
          </svg>
        </div>
      )}
    </article>
  );
}

function SourceEfficiencyTable({
  sourceTotals,
  activeSources,
  summaryTotals,
}: {
  sourceTotals: SourceMoneyTotals[];
  activeSources: string[];
  summaryTotals: Record<Metric, number>;
}) {
  const rows = sourceTotals
    .map((item) => {
      const leads = item.totals["Лиды"];
      const qualified = item.totals["Квалы"];
      const sales = item.totals["Продажи"];
      return {
        ...item,
        leads,
        qualified,
        sales,
        share: percent(leads, summaryTotals["Лиды"]),
        leadToQualified: percent(qualified, leads),
        qualifiedToSales: percent(sales, qualified),
      };
    })
    .sort((a, b) => b.leads - a.leads);

  return (
    <div className="source-efficiency-table">
      <div className="source-efficiency-row source-efficiency-head">
        <span>Источник</span>
        <span>Доля</span>
        <span>Лиды</span>
        <span>КВАЛ</span>
        <span>Продажи</span>
        <span>Лид → КВАЛ</span>
        <span>КВАЛ → продажа</span>
        <span>CPL</span>
        <span>CPQL</span>
        <span>Цена продажи</span>
        <span>ROAS</span>
        <span>ROAS наш</span>
      </div>
      {rows.map((item) => {
        const sourceIndex = activeSources.findIndex((source) => sourceNameEquals(source, item.source));
        return (
          <div className="source-efficiency-row" key={item.source}>
            <strong><i style={{ background: getLeadSourceColor(item.source, sourceIndex) }} aria-hidden="true" />{item.source}</strong>
            <span>{item.share}%</span>
            <span>{formatNumber(item.leads)}</span>
            <span>{formatNumber(item.qualified)}</span>
            <span>{formatNumber(item.sales)}</span>
            <span>{item.leadToQualified}%</span>
            <span>{item.qualifiedToSales}%</span>
            <span>{formatBrandCurrency(item.cpl)}</span>
            <span>{formatBrandCurrency(item.cpql)}</span>
            <span>{formatBrandCurrency(item.saleCost)}</span>
            <span>{formatBrandRoas(item.roas)}</span>
            <span>{formatBrandRoas(item.roasFact)}</span>
          </div>
        );
      })}
      {rows.length === 0 && <p className="empty-state">Нет включенных источников для таблицы.</p>}
    </div>
  );
}

function BrandsDashboardV2({
  data,
  selectedMonthConfig,
  selectedScope,
  setSelectedScope,
  loadMessage,
}: {
  data: BrandAnalyticsBundle;
  selectedMonthConfig: MonthConfig;
  selectedScope: ReportScope;
  setSelectedScope: (scope: ReportScope) => void;
  loadMessage: string;
}) {
  const [activeTab, setActiveTab] = useState<BrandTab>("overview");
  const [sourceFilter, setSourceFilter] = useState("Все источники");
  const [platformFilter, setPlatformFilter] = useState<BrandBranchPlatform>("Яндекс Карты");
  const [selectedBrandKey, setSelectedBrandKey] = useState("");
  const [brandViewMode, setBrandViewMode] = useState<BrandViewMode>("overall");
  const [compareMetric, setCompareMetric] = useState<BrandCompareMetricKey>("sales");
  const [compareMode, setCompareMode] = useState<BrandCompareChartMode>("values");
  const [selectedCompareBrandKeys, setSelectedCompareBrandKeys] = useState<string[]>([]);

  const performanceRows = useMemo(
    () => data.performance.length ? data.performance : legacyBrandRecordsToPerformance(data.records),
    [data.performance, data.records],
  );
  const monthPerformance = useMemo(() => {
    const rows = performanceRows.filter((row) => row.monthKey === selectedMonthConfig.monthKey);
    return rows.length ? rows : performanceRows;
  }, [performanceRows, selectedMonthConfig.monthKey]);
  const scopedMonthPerformance = useMemo(
    () => monthPerformance.filter((row) => selectedScope === "Все" || row.city === selectedScope),
    [monthPerformance, selectedScope],
  );
  const sourceOptions = useMemo(() => {
    const options = [...new Set(scopedMonthPerformance.map((row) => row.source).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru"));
    return ["Все источники", ...options];
  }, [scopedMonthPerformance]);

  useEffect(() => {
    if (!sourceOptions.includes(sourceFilter)) setSourceFilter("Все источники");
  }, [sourceFilter, sourceOptions]);

  const filteredPerformance = useMemo(
    () => sourceFilter === "Все источники"
      ? scopedMonthPerformance
      : scopedMonthPerformance.filter((row) => row.source === sourceFilter),
    [scopedMonthPerformance, sourceFilter],
  );
  const scopedBranches = useMemo(
    () => data.branches.filter((row) => selectedScope === "Все" || row.city === selectedScope),
    [data.branches, selectedScope],
  );
  const scopedAllPerformance = useMemo(
    () => performanceRows.filter((row) => selectedScope === "Все" || row.city === selectedScope),
    [performanceRows, selectedScope],
  );
  const filteredAllPerformance = useMemo(
    () => sourceFilter === "Все источники"
      ? scopedAllPerformance
      : scopedAllPerformance.filter((row) => row.source === sourceFilter),
    [scopedAllPerformance, sourceFilter],
  );
  const summaries = useMemo(
    () => buildBrandDashboardSummaries(data.records, filteredPerformance, scopedBranches, selectedScope, selectedMonthConfig.monthKey),
    [data.records, filteredPerformance, scopedBranches, selectedScope, selectedMonthConfig.monthKey],
  );
  const unfilteredSummaries = useMemo(
    () => buildBrandDashboardSummaries(data.records, scopedMonthPerformance, scopedBranches, selectedScope, selectedMonthConfig.monthKey),
    [data.records, scopedMonthPerformance, scopedBranches, selectedScope, selectedMonthConfig.monthKey],
  );
  const allPeriodSummaries = useMemo(
    () => buildBrandDashboardSummaries(data.records, filteredAllPerformance, scopedBranches, selectedScope, selectedMonthConfig.monthKey),
    [data.records, filteredAllPerformance, scopedBranches, selectedScope, selectedMonthConfig.monthKey],
  );
  const topSummaries = useMemo(() => summaries.slice(0, 16), [summaries]);
  const totals = useMemo(() => buildBrandTotals(summaries), [summaries]);
  const trendEvents = useMemo(() => buildBrandDashboardEvents(monthPerformance, selectedScope), [monthPerformance, selectedScope]);
  const selectedBrand = useMemo(
    () => allPeriodSummaries.find((summary) => brandDashboardSummaryKey(summary) === selectedBrandKey)
      ?? topSummaries[0]
      ?? allPeriodSummaries[0]
      ?? summaries[0]
      ?? null,
    [allPeriodSummaries, selectedBrandKey, summaries, topSummaries],
  );
  const freeSummaries = useMemo(
    () => unfilteredSummaries.filter((summary) => summary.budget === 0 && summary.sales > 0).sort((a, b) => b.sales - a.sales),
    [unfilteredSummaries],
  );

  useEffect(() => {
    if (!summaries.length) {
      setSelectedBrandKey("");
      return;
    }
    setSelectedBrandKey((current) => allPeriodSummaries.some((summary) => brandDashboardSummaryKey(summary) === current)
      ? current
      : brandDashboardSummaryKey(allPeriodSummaries[0] ?? summaries[0]));
  }, [allPeriodSummaries, summaries]);

  useEffect(() => {
    const availableKeys = new Set(allPeriodSummaries.map(brandDashboardSummaryKey));
    const defaultKeys = allPeriodSummaries.slice(0, 5).map(brandDashboardSummaryKey);
    setSelectedCompareBrandKeys((current) => {
      const kept = current.filter((key) => availableKeys.has(key)).slice(0, 6);
      return kept.length ? kept : defaultKeys;
    });
  }, [allPeriodSummaries]);

  return (
    <div className="page-stack brands-dashboard brands-dashboard-v2">
      <ExecutiveSummary
        status={{ label: performanceRows.length ? "данные брендов" : "жду данные", tone: performanceRows.length ? "good" : "warning" }}
        eyebrow="RECTOP BRANDS"
        title="Бренды"
        facts={[
          `Период: ${selectedMonthConfig.label}`,
          `Город: ${selectedScope === "Все" ? "МСК + СПБ" : selectedScope}`,
          `Источник: ${sourceFilter}`,
          "Топ-16 по продажам",
          `Автособытий: ${trendEvents.length}`,
        ]}
      />

      <section className="analytics-panel brand-workbench">
        <div className="brand-toolbar">
          <div className="source-period-toggle source-city-toggle" role="group" aria-label="Город брендов">
            {sourceCityOptions.map((option) => (
              <button
                key={option}
                type="button"
                className={selectedScope === option ? "active" : ""}
                onClick={() => setSelectedScope(option)}
              >
                {option}
              </button>
            ))}
          </div>
          <label>
            <span>Источник</span>
            <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
              {sourceOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label>
            <span>Филиалы</span>
            <select value={platformFilter} onChange={(event) => setPlatformFilter(event.target.value as BrandBranchPlatform)}>
              {branchPlatforms.map((platform) => <option key={platform} value={platform}>{platform}</option>)}
            </select>
          </label>
        </div>
        <div className="brand-tabs" role="tablist" aria-label="Разделы брендов">
          {brandTabs.map((tab) => (
            <button key={tab.value} type="button" className={activeTab === tab.value ? "active" : ""} onClick={() => setActiveTab(tab.value)}>
              {tab.label}
            </button>
          ))}
        </div>
        <p className="brand-load-note">{loadMessage}</p>
      </section>

      {summaries.length === 0 ? (
        <section className="messages-placeholder">
          <div className="placeholder-icon"><Target size={28} /></div>
          <h2>Нет данных по брендам</h2>
          <p>Добавь строки в Brand_Performance_Weekly или оставь текущие листы МСК / СПБ: сайт подхватит данные автоматически.</p>
        </section>
      ) : (
        <>
          {activeTab === "overview" && (
            <BrandOverviewPanel
              summaries={topSummaries}
              comparisonSummaries={allPeriodSummaries}
              totals={totals}
              platform={platformFilter}
              selectedCompareBrandKeys={selectedCompareBrandKeys}
              setSelectedCompareBrandKeys={setSelectedCompareBrandKeys}
              compareMetric={compareMetric}
              setCompareMetric={setCompareMetric}
              compareMode={compareMode}
              setCompareMode={setCompareMode}
            />
          )}
          {activeTab === "compare" && (
            <BrandComparePanel performance={monthPerformance} sourceFilter={sourceFilter} />
          )}
          {activeTab === "brand" && selectedBrand && (
            <BrandDetailPanel
              summaries={summaries}
              selectedBrand={selectedBrand}
              selectedBrandKey={selectedBrandKey}
              setSelectedBrandKey={setSelectedBrandKey}
              brandViewMode={brandViewMode}
              setBrandViewMode={setBrandViewMode}
              trendEvents={trendEvents.filter((event) => normalizeBrandDashboardKey(event.brand) === normalizeBrandDashboardKey(selectedBrand.brand))}
            />
          )}
          {activeTab === "free" && (
            <BrandFreePanel summaries={freeSummaries} onSelectBrand={(summary) => {
              setSelectedBrandKey(brandDashboardSummaryKey(summary));
              setActiveTab("brand");
            }} />
          )}
        </>
      )}
    </div>
  );
}

function BrandOverviewPanel({
  summaries,
  comparisonSummaries,
  totals,
  platform,
  selectedCompareBrandKeys,
  setSelectedCompareBrandKeys,
  compareMetric,
  setCompareMetric,
  compareMode,
  setCompareMode,
}: {
  summaries: BrandDashboardSummary[];
  comparisonSummaries: BrandDashboardSummary[];
  totals: ReturnType<typeof buildBrandTotals>;
  platform: BrandBranchPlatform;
  selectedCompareBrandKeys: string[];
  setSelectedCompareBrandKeys: (keys: string[]) => void;
  compareMetric: BrandCompareMetricKey;
  setCompareMetric: (metric: BrandCompareMetricKey) => void;
  compareMode: BrandCompareChartMode;
  setCompareMode: (mode: BrandCompareChartMode) => void;
}) {
  return (
    <>
      <section className="brand-kpi-grid brand-kpi-grid-wide">
        <BrandMetricCard label="Брендов в топе" value={summaries.length} />
        <BrandMetricCard label="Лиды" value={totals.leads} />
        <BrandMetricCard label="КВАЛ" value={totals.qualified} helper={`${percent(totals.qualified, totals.leads)}% из лидов`} />
        <BrandMetricCard label="Продажи" value={totals.sales} helper={`${percent(totals.sales, totals.qualified)}% из КВАЛ`} />
        <BrandMetricCard label="Выручка" value={totals.revenue} suffix=" ₽" />
        <BrandMetricCard label="ROAS" value={totals.roas ?? 0} suffix="x" decimal />
        <BrandMetricCard label="ROAS факт" value={totals.roasFact ?? 0} suffix="x" decimal />
      </section>

      <section className="brand-ranking-grid brand-ranking-grid-v2">
        <BrandTopListCard title="Топ по продажам" caption="Топ-16 выбранного периода" rows={rankBrandDashboardSummaries(summaries, (summary) => summary.sales, "desc")} formatValue={formatNumber} />
        <BrandTopListCard title="Топ по выручке" caption="Бренды с максимальной выручкой" rows={rankBrandDashboardSummaries(summaries, (summary) => summary.revenue, "desc")} formatValue={(value) => formatBrandCurrency(value, { allowZero: true })} />
        <BrandTopListCard title="Цена КВАЛ" caption="Чем ниже, тем лучше" rows={rankBrandDashboardSummaries(summaries, (summary) => summary.cpql, "asc")} formatValue={(value) => formatBrandCurrency(value)} />
        <BrandTopListCard title={`Продаж на филиал: ${platform}`} caption="Только внутри выбранной площадки" rows={rankBrandDashboardSummaries(summaries, (summary) => summary.salesPerBranch[platform], "desc")} formatValue={(value) => formatCompactDecimal(value)} />
        <BrandTopListCard title="Топ по ROAS" caption="Выручка / бюджет ДРР" rows={rankBrandDashboardSummaries(summaries, (summary) => summary.roas ?? 0, "desc")} formatValue={(value) => `${formatCompactDecimal(value)}x`} />
        <BrandTopListCard title="Топ по ROAS факт" caption="ROAS / 2" rows={rankBrandDashboardSummaries(summaries, (summary) => summary.roasFact ?? 0, "desc")} formatValue={(value) => `${formatCompactDecimal(value)}x`} />
        <BrandTopListCard title="Лид → КВАЛ" caption="Лучшая конверсия в КВАЛ" rows={rankBrandDashboardSummaries(summaries, (summary) => summary.leadToQualified, "desc")} formatValue={(value) => `${formatCompactDecimal(value)}%`} />
        <BrandTopListCard title="КВАЛ → продажа" caption="Лучшая конверсия в продажу" rows={rankBrandDashboardSummaries(summaries, (summary) => summary.qualifiedToSales, "desc")} formatValue={(value) => `${formatCompactDecimal(value)}%`} />
        <BrandTopListCard title="Средний чек" caption="Топ по среднему чеку" rows={rankBrandDashboardSummaries(summaries, (summary) => summary.avgCheck, "desc")} formatValue={(value) => formatBrandCurrency(value)} />
        <BrandTopListCard title="Стоимость продажи" caption="Ниже — лучше" rows={rankBrandDashboardSummaries(summaries, (summary) => summary.saleCost, "asc")} formatValue={(value) => formatBrandCurrency(value)} />
      </section>

      <BrandCustomComparePanel
        summaries={comparisonSummaries}
        selectedKeys={selectedCompareBrandKeys}
        setSelectedKeys={setSelectedCompareBrandKeys}
        metric={compareMetric}
        setMetric={setCompareMetric}
        mode={compareMode}
        setMode={setCompareMode}
      />

      <section className="analytics-panel">
        <PanelHead
          title="Топ-16 брендов"
          description="В таблицу попадают только бренды с максимальным количеством продаж за выбранный период."
        />
        <BrandTopTable summaries={summaries} platform={platform} />
      </section>
    </>
  );
}

function BrandMetricCard({ label, value, suffix = "", helper, decimal = false }: { label: string; value: number; suffix?: string; helper?: string; decimal?: boolean }) {
  return (
    <article className="brand-kpi-card brand-metric-card">
      <span>{label}</span>
      <strong>{decimal ? formatCompactDecimal(value) : formatNumber(Math.round(value))}{suffix}</strong>
      {helper && <small>{helper}</small>}
    </article>
  );
}

function BrandTopListCard({
  title,
  caption,
  rows,
  formatValue,
}: {
  title: string;
  caption: string;
  rows: Array<{ summary: BrandDashboardSummary; value: number }>;
  formatValue: (value: number) => string;
}) {
  return (
    <article className="brand-ranking-card brand-top-list-card">
      <div>
        <h2>{title}</h2>
        <span>{caption}</span>
      </div>
      <ol>
        {rows.slice(0, 5).map((row) => (
          <li key={`${title}-${brandDashboardSummaryKey(row.summary)}`}>
            <span>{row.summary.brand}</span>
            <strong>{formatValue(row.value)}</strong>
          </li>
        ))}
      </ol>
    </article>
  );
}

function BrandCustomComparePanel({
  summaries,
  selectedKeys,
  setSelectedKeys,
  metric,
  setMetric,
  mode,
  setMode,
}: {
  summaries: BrandDashboardSummary[];
  selectedKeys: string[];
  setSelectedKeys: (keys: string[]) => void;
  metric: BrandCompareMetricKey;
  setMetric: (metric: BrandCompareMetricKey) => void;
  mode: BrandCompareChartMode;
  setMode: (mode: BrandCompareChartMode) => void;
}) {
  const selectedSet = new Set(selectedKeys);
  const selectedSummaries = selectedKeys
    .map((key) => summaries.find((summary) => brandDashboardSummaryKey(summary) === key))
    .filter((summary): summary is BrandDashboardSummary => Boolean(summary));
  const availableToAdd = summaries.filter((summary) => !selectedSet.has(brandDashboardSummaryKey(summary)));
  const series = buildBrandCompareSeries(selectedSummaries, metric, mode);
  const metricMeta = getBrandCompareMetricMeta(metric);
  const activeValues = series.flatMap((item) => item.values.filter((value): value is number => value !== null));
  const max = getNiceAxisMax(Math.max(mode === "index" ? 100 : 1, ...activeValues));
  const width = 1040;
  const height = 340;
  const plot = { left: 58, right: 26, top: 34, bottom: 52 };
  const plotWidth = width - plot.left - plot.right;
  const plotHeight = height - plot.top - plot.bottom;
  const weekKeys = series[0]?.weekKeys ?? [];
  const xFor = (index: number) => weekKeys.length <= 1
    ? plot.left + plotWidth / 2
    : plot.left + (plotWidth / (weekKeys.length - 1)) * index;
  const yFor = (value: number) => plot.top + plotHeight - (value / max) * plotHeight;

  function toggleKey(key: string) {
    if (selectedSet.has(key)) {
      setSelectedKeys(selectedKeys.filter((item) => item !== key));
      return;
    }
    if (selectedKeys.length >= 6) return;
    setSelectedKeys([...selectedKeys, key]);
  }

  return (
    <section className="analytics-panel brand-custom-compare">
      <div className="brand-custom-compare-head">
        <PanelHead
          title="Сравнить бренды"
          description="Выберите до 6 брендов и одну метрику: так можно сравнить любые бренды без огромной стены графиков."
        />
        <div className="brand-compare-builder">
          <label>
            <span>Метрика</span>
            <select value={metric} onChange={(event) => setMetric(event.target.value as BrandCompareMetricKey)}>
              {brandCompareMetricOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <div className="source-period-toggle brand-compare-mode" role="group" aria-label="Режим сравнения">
            <button type="button" className={mode === "values" ? "active" : ""} onClick={() => setMode("values")}>Значения</button>
            <button type="button" className={mode === "index" ? "active" : ""} onClick={() => setMode("index")}>Динамика %</button>
          </div>
          <label>
            <span>Добавить бренд</span>
            <select value="" onChange={(event) => {
              if (!event.target.value) return;
              toggleKey(event.target.value);
            }}>
              <option value="">Выбрать</option>
              {availableToAdd.map((summary) => (
                <option key={brandDashboardSummaryKey(summary)} value={brandDashboardSummaryKey(summary)}>
                  {summary.brand}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="brand-compare-chip-row">
        {summaries.slice(0, 24).map((summary) => {
          const key = brandDashboardSummaryKey(summary);
          return (
            <button
              type="button"
              key={key}
              className={selectedSet.has(key) ? "active" : ""}
              onClick={() => toggleKey(key)}
            >
              {summary.brand}
            </button>
          );
        })}
      </div>

      <div className="brand-compare-chart-shell">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Сравнение брендов: ${metricMeta.label}`}>
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = plot.top + plotHeight - ratio * plotHeight;
            return (
              <g key={ratio}>
                <line x1={plot.left} x2={width - plot.right} y1={y} y2={y} className="brand-grid-line" />
                <text x={plot.left - 12} y={y + 4} className="brand-axis-label">
                  {formatBrandCompareMetricValue(max * ratio, metric, mode, { allowZero: true })}
                </text>
              </g>
            );
          })}
          {weekKeys.map((week, index) => (
            <text key={week} x={xFor(index)} y={height - 18} className="brand-x-label">
              {formatWeekStartLabel(week)}
            </text>
          ))}
          {series.map((item) => {
            const segments = buildBrandComparePathSegments(item.values, xFor, yFor);
            return segments.map((segment, segmentIndex) => (
              <path
                key={`${item.key}-${segmentIndex}`}
                d={pointsToSvgPath(segment)}
                className="brand-compare-line"
                style={{ stroke: item.color }}
              />
            ));
          })}
          {series.map((item) => item.values.map((value, index) => {
            if (value === null) return null;
            return (
              <circle key={`${item.key}-${weekKeys[index]}`} cx={xFor(index)} cy={yFor(value)} r="10" className="brand-compare-hit">
                <title>{item.label} · {formatWeekStartLabel(weekKeys[index])}: {formatBrandCompareMetricValue(item.rawValues[index], metric, "values")}</title>
              </circle>
            );
          }))}
        </svg>
      </div>

      <div className="brand-compare-legend brand-custom-legend">
        {series.map((item) => (
          <span key={item.key}><i style={{ background: item.color }} /> {item.label}</span>
        ))}
        {!series.length && <span>Выберите хотя бы один бренд.</span>}
      </div>
    </section>
  );
}

function BrandTopTable({ summaries, platform }: { summaries: BrandDashboardSummary[]; platform: BrandBranchPlatform }) {
  return (
    <div className="brand-table-wrap">
      <div className="brand-table brand-table-head">
        <span>Бренд</span>
        <span>Лиды</span>
        <span>КВАЛ</span>
        <span>Продажи</span>
        <span>Выручка</span>
        <span>ROAS</span>
        <span>ROAS факт</span>
        <span>CPQL</span>
        <span>Стоимость продажи</span>
        <span>Продаж/филиал</span>
      </div>
      {summaries.map((summary) => (
        <div className="brand-table" key={brandDashboardSummaryKey(summary)}>
          <strong>{summary.brand}<small>{summary.domain || summary.cityLabel}</small></strong>
          <span>{formatNumber(summary.leads)}</span>
          <span>{formatNumber(summary.qualified)}</span>
          <span>{formatNumber(summary.sales)}</span>
          <span>{formatNumber(summary.revenue)} ₽</span>
          <span>{summary.roas === null ? "—" : `${formatCompactDecimal(summary.roas)}x`}</span>
          <span>{summary.roasFact === null ? "—" : `${formatCompactDecimal(summary.roasFact)}x`}</span>
          <span>{formatNumber(Math.round(summary.cpql))} ₽</span>
          <span>{formatBrandCurrency(summary.saleCost)}</span>
          <span>{summary.latestBranches[platform] ? formatCompactDecimal(summary.salesPerBranch[platform]) : "нет филиалов"}</span>
        </div>
      ))}
    </div>
  );
}

function BrandComparePanel({ performance, sourceFilter }: { performance: BrandPerformanceWeekly[]; sourceFilter: string }) {
  const availableBrands = useMemo(() => {
    const withData = comparedTwoCityBrands.filter((brand) => {
      const rows = performance.filter((row) => {
        return normalizeBrandDashboardKey(row.brand) === normalizeBrandDashboardKey(brand)
          && (sourceFilter === "Все источники" || row.source === sourceFilter);
      });
      const cities = new Set(rows.map((row) => row.city));
      return cities.has("МСК") && cities.has("СПБ");
    });
    return withData.length ? withData : comparedTwoCityBrands;
  }, [performance, sourceFilter]);
  const [selectedCompareBrand, setSelectedCompareBrand] = useState(availableBrands[0] ?? comparedTwoCityBrands[0]);

  useEffect(() => {
    if (!availableBrands.includes(selectedCompareBrand)) {
      setSelectedCompareBrand(availableBrands[0] ?? comparedTwoCityBrands[0]);
    }
  }, [availableBrands, selectedCompareBrand]);

  const activeBrand = availableBrands.includes(selectedCompareBrand)
    ? selectedCompareBrand
    : availableBrands[0] ?? comparedTwoCityBrands[0];
  const cityRows = (city: BrandCity) => performance.filter((row) => {
    return normalizeBrandDashboardKey(row.brand) === normalizeBrandDashboardKey(activeBrand)
      && row.city === city
      && (sourceFilter === "Все источники" || row.source === sourceFilter);
  });
  const msk = aggregateBrandPerformance(cityRows("МСК"));
  const spb = aggregateBrandPerformance(cityRows("СПБ"));
  const efficiencyCity = pickBrandEfficiencyCity(msk, spb);
  const volumeCity = pickBrandVolumeCity(msk, spb);
  const efficiency = efficiencyCity === "МСК" ? msk : spb;
  const volume = volumeCity === "МСК" ? msk : spb;

  return (
    <section className="analytics-panel brand-compare-panel brand-compare-focused-panel">
      <div className="brand-compare-head brand-compare-head-v2">
        <PanelHead
          title="Сравнение одного бренда"
          description="Сравните один и тот же бренд в Москве и Санкт-Петербурге."
        />
        <label>
          <span>Бренд</span>
          <select value={activeBrand} onChange={(event) => setSelectedCompareBrand(event.target.value)}>
            {availableBrands.map((brand) => (
              <option key={brand} value={brand}>{brand}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="brand-compare-filter-strip">
        <span><CalendarDays size={14} /> Период: неделя</span>
        <span><Target size={14} /> {sourceFilter}</span>
        <span><CheckCircle2 size={14} /> Обновлено сегодня</span>
      </div>

      <div className="brand-compare-insight-grid">
        <BrandCompareInsightCard
          tone="msk"
          icon={<TrendingUp size={26} />}
          title={`${efficiencyCity} эффективнее`}
          badge="Эффективность"
          metrics={[
            { label: "продаж", value: formatNumber(efficiency.sales) },
            { label: "КВАЛ → продажа", value: `${efficiency.qualifiedToSales}%` },
            { label: "стоимость продажи", value: formatBrandCurrency(efficiency.saleCost) },
            { label: "ROAS", value: formatBrandRoas(efficiency.roas) },
            { label: "ROAS факт", value: formatBrandRoas(efficiency.roasFact) },
          ]}
        />
        <BrandCompareInsightCard
          tone="spb"
          icon={<BarChart3 size={26} />}
          title={`${volumeCity} сильнее по объёму`}
          badge="Объём"
          metrics={[
            { label: "лида", value: formatNumber(volume.leads) },
            { label: "КВАЛ", value: formatNumber(volume.qualified) },
            { label: "выручка", value: formatBrandCurrency(volume.revenue) },
            { label: "средний чек", value: formatBrandCurrency(volume.avgCheck) },
          ]}
        />
      </div>

      <BrandCompareMirrorPanel msk={msk} spb={spb} />
      <BrandCompareDetailTable msk={msk} spb={spb} />
    </section>
  );
}

function BrandCompareInsightCard({
  tone,
  icon,
  title,
  badge,
  metrics,
}: {
  tone: "msk" | "spb";
  icon: ReactNode;
  title: string;
  badge: string;
  metrics: Array<{ label: string; value: string }>;
}) {
  return (
    <article className={`brand-compare-insight-card ${tone}`}>
      <div className="brand-compare-insight-icon">{icon}</div>
      <div className="brand-compare-insight-body">
        <div className="brand-compare-insight-title">
          <h3>{title}</h3>
          <span>{badge}</span>
        </div>
        <div className="brand-compare-insight-metrics">
          {metrics.map((metric) => (
            <div key={metric.label}>
              <strong>{metric.value}</strong>
              <span>{metric.label}</span>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

function BrandCompareMirrorPanel({
  msk,
  spb,
}: {
  msk: ReturnType<typeof aggregateBrandPerformance>;
  spb: ReturnType<typeof aggregateBrandPerformance>;
}) {
  const leadToSaleMsk = percent(msk.sales, msk.leads);
  const leadToSaleSpb = percent(spb.sales, spb.leads);
  const funnelMax = Math.max(1, msk.leads, spb.leads, msk.qualified, spb.qualified, msk.sales, spb.sales);
  return (
    <article className="brand-compare-mirror-card">
      <div className="brand-compare-mirror-head">
        <strong>Москва (МСК)</strong>
        <strong>Санкт-Петербург (СПБ)</strong>
      </div>
      <div className="brand-compare-mirror-grid">
        <BrandCompareMirrorRow label="Лиды" marker="Л" msk={msk.leads} spb={spb.leads} max={funnelMax} formatter={formatNumber} />
        <BrandCompareMirrorRow label="КВАЛ" marker="К" msk={msk.qualified} spb={spb.qualified} max={funnelMax} formatter={formatNumber} />
        <BrandCompareMirrorRow label="Продажи" marker="П" msk={msk.sales} spb={spb.sales} max={funnelMax} formatter={formatNumber} />
        <BrandCompareMirrorRow
          label="Лид → продажа"
          marker="%"
          msk={leadToSaleMsk}
          spb={leadToSaleSpb}
          scaleMsk={msk.sales}
          scaleSpb={spb.sales}
          max={funnelMax}
          formatter={(value) => `${value}%`}
        />
      </div>
    </article>
  );
}

function BrandCompareMirrorRow({
  label,
  marker,
  msk,
  spb,
  scaleMsk = msk,
  scaleSpb = spb,
  max,
  formatter,
}: {
  label: string;
  marker: string;
  msk: number;
  spb: number;
  scaleMsk?: number;
  scaleSpb?: number;
  max: number;
  formatter: (value: number) => string;
}) {
  const mskWidth = `${Math.max(scaleMsk > 0 ? 5 : 0, (scaleMsk / max) * 100)}%`;
  const spbWidth = `${Math.max(scaleSpb > 0 ? 5 : 0, (scaleSpb / max) * 100)}%`;
  return (
    <div className="brand-compare-mirror-row">
      <div className="brand-compare-mirror-label">
        <span>{marker}</span>
        <strong>{label}</strong>
      </div>
      <b className="msk-value">{formatter(msk)}</b>
      <i className="brand-compare-mirror-track msk-track"><em style={{ width: mskWidth }} /></i>
      <i className="brand-compare-center-line" />
      <i className="brand-compare-mirror-track spb-track"><em style={{ width: spbWidth }} /></i>
      <b className="spb-value">{formatter(spb)}</b>
    </div>
  );
}

type BrandCompareDetailRow = {
  label: string;
  msk: number | null;
  spb: number | null;
  mode: "percent-point" | "currency" | "roas" | "percent";
  higherBetter: boolean;
};

function BrandCompareDetailTable({
  msk,
  spb,
}: {
  msk: ReturnType<typeof aggregateBrandPerformance>;
  spb: ReturnType<typeof aggregateBrandPerformance>;
}) {
  const rows: BrandCompareDetailRow[] = [
    { label: "Лид → КВАЛ", msk: msk.leadToQualified, spb: spb.leadToQualified, mode: "percent-point", higherBetter: true },
    { label: "КВАЛ → продажа", msk: msk.qualifiedToSales, spb: spb.qualifiedToSales, mode: "percent-point", higherBetter: true },
    { label: "CPL", msk: msk.cpl, spb: spb.cpl, mode: "currency", higherBetter: false },
    { label: "CPQL", msk: msk.cpql, spb: spb.cpql, mode: "currency", higherBetter: false },
    { label: "Стоимость продажи", msk: msk.saleCost, spb: spb.saleCost, mode: "currency", higherBetter: false },
    { label: "Средний чек", msk: msk.avgCheck, spb: spb.avgCheck, mode: "currency", higherBetter: true },
    { label: "ROAS", msk: msk.roas, spb: spb.roas, mode: "roas", higherBetter: true },
    { label: "ROAS факт", msk: msk.roasFact, spb: spb.roasFact, mode: "roas", higherBetter: true },
    { label: "Бюджет", msk: msk.budget, spb: spb.budget, mode: "currency", higherBetter: false },
    { label: "Выручка", msk: msk.revenue, spb: spb.revenue, mode: "currency", higherBetter: true },
  ];

  return (
    <article className="brand-compare-detail-table">
      <div className="brand-compare-detail-row head">
        <span>Показатель</span>
        <span>МСК</span>
        <span>Разница</span>
        <span>СПБ</span>
      </div>
      {rows.map((row) => {
        const diff = buildBrandCompareDifference(row);
        return (
          <div className="brand-compare-detail-row" key={row.label}>
            <span>{row.label}</span>
            <strong className={diff.winner === "МСК" ? "best" : ""}>{formatBrandCompareDetailValue(row.msk, row.mode)}</strong>
            <em>{diff.label}</em>
            <strong className={diff.winner === "СПБ" ? "best" : ""}>{formatBrandCompareDetailValue(row.spb, row.mode)}</strong>
          </div>
        );
      })}
    </article>
  );
}

function pickBrandEfficiencyCity(
  msk: ReturnType<typeof aggregateBrandPerformance>,
  spb: ReturnType<typeof aggregateBrandPerformance>,
): BrandCity {
  const mskRoas = msk.roas ?? 0;
  const spbRoas = spb.roas ?? 0;
  if (mskRoas || spbRoas) {
    return mskRoas >= spbRoas ? "МСК" : "СПБ";
  }
  if (msk.saleCost || spb.saleCost) {
    const mskCost = msk.saleCost || Number.MAX_SAFE_INTEGER;
    const spbCost = spb.saleCost || Number.MAX_SAFE_INTEGER;
    return mskCost <= spbCost ? "МСК" : "СПБ";
  }
  return msk.qualifiedToSales >= spb.qualifiedToSales ? "МСК" : "СПБ";
}

function pickBrandVolumeCity(
  msk: ReturnType<typeof aggregateBrandPerformance>,
  spb: ReturnType<typeof aggregateBrandPerformance>,
): BrandCity {
  const mskVolume = msk.revenue || msk.leads + msk.qualified + msk.sales;
  const spbVolume = spb.revenue || spb.leads + spb.qualified + spb.sales;
  return mskVolume >= spbVolume ? "МСК" : "СПБ";
}

function formatBrandCurrency(value: number | null, options: { allowZero?: boolean } = {}) {
  if (value === null || !Number.isFinite(value) || (!options.allowZero && value <= 0)) return "—";
  return `${formatNumber(Math.round(value))} ₽`;
}

function formatBrandRoas(value: number | null) {
  return value === null ? "—" : `${formatCompactDecimal(value)}x`;
}

function formatBrandCompareDetailValue(value: number | null, mode: BrandCompareDetailRow["mode"]) {
  if (value === null) return "—";
  if (mode === "currency") return formatBrandCurrency(value);
  if (mode === "roas") return formatBrandRoas(value);
  return `${formatCompactDecimal(value)}%`;
}

function buildBrandCompareDifference(row: BrandCompareDetailRow) {
  const msk = row.msk ?? 0;
  const spb = row.spb ?? 0;
  if (!msk && !spb) return { label: "—", winner: null };
  if (Math.abs(msk - spb) < 0.01) return { label: "на одном уровне", winner: null };

  const mskWins = row.higherBetter ? msk > spb : msk < spb;
  const winner: BrandCity = mskWins ? "МСК" : "СПБ";
  const winnerValue = mskWins ? msk : spb;
  const loserValue = mskWins ? spb : msk;

  if (row.mode === "percent-point") {
    return {
      label: `${formatCompactDecimal(Math.abs(msk - spb))} п.п.`,
      winner,
    };
  }

  const base = Math.max(1, Math.abs(loserValue));
  const delta = Math.round((Math.abs(winnerValue - loserValue) / base) * 100);
  return { label: `${delta}%`, winner };
}

function getBrandCompareMetricMeta(metric: BrandCompareMetricKey) {
  return brandCompareMetricOptions.find((option) => option.value === metric) ?? brandCompareMetricOptions[0];
}

function brandWeeklyMetricValue(point: BrandWeeklyPoint | undefined, metric: BrandCompareMetricKey): number | null {
  if (!point) return null;
  if (metric === "roas" || metric === "roasFact") return point[metric];
  if (metric === "saleCost") return point.sales > 0 && point.saleCost > 0 ? point.saleCost : null;
  if (metric === "avgCheck") return point.sales > 0 && point.avgCheck > 0 ? point.avgCheck : null;
  return point[metric];
}

function formatBrandCompareMetricValue(value: number | null, metric: BrandCompareMetricKey, mode: BrandCompareChartMode, options: { allowZero?: boolean } = {}) {
  if (value === null || !Number.isFinite(value)) return "—";
  if (mode === "index") return `${formatCompactDecimal(value)}%`;
  if (metric === "roas" || metric === "roasFact") return `${formatCompactDecimal(value)}x`;
  if (metric === "saleCost" || metric === "avgCheck") return formatBrandCurrency(value, options);
  return formatNumber(Math.round(value));
}

function buildBrandCompareSeries(
  summaries: BrandDashboardSummary[],
  metric: BrandCompareMetricKey,
  mode: BrandCompareChartMode,
) {
  const weekKeys = [...new Set(summaries.flatMap((summary) => summary.weekly.map((week) => week.weekStart)))]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  return summaries.slice(0, 6).map((summary, index) => {
    const byWeek = new Map(summary.weekly.map((week) => [week.weekStart, week]));
    const rawValues = weekKeys.map((weekKey) => brandWeeklyMetricValue(byWeek.get(weekKey), metric));
    const base = rawValues.find((value): value is number => value !== null && value > 0) ?? null;
    const values = mode === "index"
      ? rawValues.map((value) => (value === null || base === null ? null : (value / base) * 100))
      : rawValues;
    return {
      key: brandDashboardSummaryKey(summary),
      label: summary.brand,
      color: brandCompareColors[index % brandCompareColors.length],
      weekKeys,
      rawValues,
      values,
    };
  });
}

function buildBrandComparePathSegments(
  values: Array<number | null>,
  xFor: (index: number) => number,
  yFor: (value: number) => number,
): ChartLineSegment[] {
  const segments: ChartLineSegment[] = [];
  let current: ChartLineSegment = [];
  values.forEach((value, index) => {
    if (value === null) {
      if (current.length) segments.push(current);
      current = [];
      return;
    }
    current.push({ x: xFor(index), y: yFor(value) });
  });
  if (current.length) segments.push(current);
  return segments.filter((segment) => segment.length > 1);
}

function formatWeekStartLabel(weekStart: string) {
  if (!weekStart) return "";
  const [, month, day] = weekStart.match(/^\d{4}-(\d{2})-(\d{2})/) ?? [];
  return month && day ? `${day}.${month}` : weekStart;
}

function BrandDetailPanel({
  summaries,
  selectedBrand,
  selectedBrandKey,
  setSelectedBrandKey,
  brandViewMode,
  setBrandViewMode,
  trendEvents,
}: {
  summaries: BrandDashboardSummary[];
  selectedBrand: BrandDashboardSummary;
  selectedBrandKey: string;
  setSelectedBrandKey: (key: string) => void;
  brandViewMode: BrandViewMode;
  setBrandViewMode: (mode: BrandViewMode) => void;
  trendEvents: BrandEvent[];
}) {
  return (
    <section className="analytics-panel brand-detail-panel brand-detail-panel-v2">
      <div className="brand-detail-head">
        <div>
          <span>{selectedBrand.domain || selectedBrand.cityLabel}</span>
          <h2>{selectedBrand.brand}</h2>
          <p>{selectedBrand.cityLabel} · {formatNumber(selectedBrand.sales)} продаж · {selectedBrand.topBadges.length ? "есть топ-позиции" : "без топ-5 плашек"}</p>
        </div>
        <label>
          <span>Бренд</span>
          <select value={selectedBrandKey} onChange={(event) => setSelectedBrandKey(event.target.value)}>
            {summaries.map((summary) => (
              <option key={brandDashboardSummaryKey(summary)} value={brandDashboardSummaryKey(summary)}>
                {summary.brand}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="brand-tabs brand-mode-tabs">
        {brandViewOptions.map((option) => (
          <button key={option.value} type="button" className={brandViewMode === option.value ? "active" : ""} onClick={() => setBrandViewMode(option.value)}>
            {option.label}
          </button>
        ))}
      </div>

      {selectedBrand.topBadges.length > 0 && (
        <div className="brand-badges">
          {selectedBrand.topBadges.map((badge) => (
            <span key={badge.label}>топ {badge.rank} · {badge.label}: {badge.value}</span>
          ))}
        </div>
      )}

      <div className="brand-detail-grid brand-detail-grid-v2">
        <aside className="brand-events-aside">
          <h3>События бренда</h3>
          {trendEvents.slice(0, 8).map((event) => (
            <article key={event.id} className={`brand-event-card ${event.direction === "рост" ? "positive" : "negative"}`}>
              <strong>{event.direction} {event.metric}</strong>
              <span>{event.city} · {event.weekStart} · {event.percent > 0 ? "+" : ""}{event.percent}%</span>
            </article>
          ))}
          {!trendEvents.length && <p className="empty-state">Изменений 16%+ по этому бренду нет.</p>}
        </aside>
        <div className="brand-main-analytics">
          {brandViewMode === "overall" ? (
            <BrandWeeklyBarsV2 summary={selectedBrand} />
          ) : (
            <BrandSourceBreakdownV2 summary={selectedBrand} />
          )}
        </div>
      </div>
    </section>
  );
}

function BrandWeeklyBarsV2({ summary }: { summary: BrandDashboardSummary }) {
  const width = 760;
  const height = 300;
  const plot = { left: 52, right: 24, top: 32, bottom: 56 };
  const plotWidth = width - plot.left - plot.right;
  const plotHeight = height - plot.top - plot.bottom;
  const weeks = summary.weekly.length ? summary.weekly : [{
    weekStart: "",
    label: "нет недель",
    leads: 0,
    qualified: 0,
    sales: 0,
    revenue: 0,
    budget: 0,
    saleCost: 0,
    roas: null,
    roasFact: null,
    avgCheck: 0,
  }];
  const max = getNiceAxisMax(Math.max(1, ...weeks.flatMap((week) => [week.leads, week.qualified, week.sales])));
  const groupWidth = plotWidth / weeks.length;
  const barWidth = Math.max(8, Math.min(24, groupWidth / 5));
  const yFor = (value: number) => plot.top + plotHeight - (value / max) * plotHeight;
  const bars = [
    { key: "leads", label: "Лиды", color: "var(--primary-blue)" },
    { key: "qualified", label: "КВАЛ", color: "#7fa7ff" },
    { key: "sales", label: "Продажи", color: "var(--deep-navy)" },
  ] as const;

  return (
    <article className="brand-chart-card brand-weekly-card">
      <div className="brand-chart-head">
        <div>
          <span>динамика по неделям</span>
          <strong>Лиды / КВАЛ / продажи</strong>
        </div>
        <div className="brand-chart-legend">
          {bars.map((bar) => <span key={bar.key}><i style={{ background: bar.color }} /> {bar.label}</span>)}
        </div>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Динамика бренда ${summary.brand}`}>
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = plot.top + plotHeight - ratio * plotHeight;
          return (
            <g key={ratio}>
              <line x1={plot.left} x2={width - plot.right} y1={y} y2={y} className="brand-grid-line" />
              <text x={plot.left - 10} y={y + 4} className="brand-axis-label">{formatNumber(Math.round(max * ratio))}</text>
            </g>
          );
        })}
        {weeks.map((week, index) => {
          const center = plot.left + groupWidth * index + groupWidth / 2;
          return (
            <g key={`${week.weekStart}-${index}`}>
              {bars.map((bar, barIndex) => {
                const value = week[bar.key];
                const previous = weeks[index - 1]?.[bar.key] ?? null;
                const opacity = previous === null ? 0.68 : value > previous * 1.01 ? 1 : value < previous * 0.99 ? 0.42 : 0.68;
                const x = center + (barIndex - 1) * (barWidth + 4);
                const y = yFor(value);
                return (
                  <rect key={bar.key} x={x - barWidth / 2} y={y} width={barWidth} height={plot.top + plotHeight - y} rx="7" fill={bar.color} opacity={opacity}>
                    <title>
                      {week.label}: {bar.label} {formatNumber(value)}
                      {previous === null ? "" : `, ${value >= previous ? "рост" : "спад"} к прошлой неделе`}
                    </title>
                  </rect>
                );
              })}
              <text x={center} y={height - 26} className="brand-x-label">{week.label}</text>
            </g>
          );
        })}
      </svg>
    </article>
  );
}

function BrandSourceBreakdownV2({ summary }: { summary: BrandDashboardSummary }) {
  const rows = summary.sourceBreakdown.filter((row) => row.leads || row.qualified || row.sales);
  const max = Math.max(1, ...rows.flatMap((row) => [row.leads, row.qualified, row.sales]));
  return (
    <article className="brand-source-breakdown">
      <div className="brand-chart-head">
        <div>
          <span>динамика по источникам</span>
          <strong>{summary.brand}</strong>
        </div>
      </div>
      <div className="brand-source-bars">
        {rows.length > 0 && (
          <div className="brand-source-row brand-source-row-head">
            <strong>Источник</strong>
            <b>Лиды</b>
            <b>КВАЛ</b>
            <b>Продажи</b>
          </div>
        )}
        {rows.map((row) => (
          <div className="brand-source-row" key={row.source}>
            <strong>{row.source}</strong>
            <span><i style={{ width: `${(row.leads / max) * 100}%` }} />{formatNumber(row.leads)}</span>
            <span><i style={{ width: `${(row.qualified / max) * 100}%` }} />{formatNumber(row.qualified)}</span>
            <span><i style={{ width: `${(row.sales / max) * 100}%` }} />{formatNumber(row.sales)}</span>
          </div>
        ))}
        {!rows.length && <p className="empty-state">По источникам пока нет данных.</p>}
      </div>
    </article>
  );
}

function BrandFreePanel({ summaries, onSelectBrand }: { summaries: BrandDashboardSummary[]; onSelectBrand: (summary: BrandDashboardSummary) => void }) {
  return (
    <section className="analytics-panel brand-free-panel">
      <PanelHead
        title="Бесплатные бренды"
        description="Бренд попадает сюда, если бюджет за выбранный месяц равен 0, но продажи есть."
      />
      <div className="brand-free-grid">
        {summaries.map((summary) => (
          <article key={brandDashboardSummaryKey(summary)} className="brand-free-card">
            <div>
              <span>{summary.cityLabel}</span>
              <h2>{summary.brand}</h2>
            </div>
            <strong>{formatNumber(summary.sales)} продаж</strong>
            <small>{formatNumber(summary.leads)} лидов · {formatNumber(summary.qualified)} КВАЛ</small>
            <button type="button" onClick={() => onSelectBrand(summary)}>Открыть бренд</button>
          </article>
        ))}
        {!summaries.length && <p className="empty-state">За выбранный период бесплатных брендов с продажами нет.</p>}
      </div>
    </section>
  );
}

function BrandsDashboard({
  records,
  selectedScope,
  setSelectedScope,
  loadMessage,
}: {
  records: BrandAnalyticsRecord[];
  selectedScope: ReportScope;
  setSelectedScope: (scope: ReportScope) => void;
  loadMessage: string;
}) {
  const scopedRecords = useMemo(
    () => records.filter((record) => selectedScope === "Все" || record.city === selectedScope),
    [records, selectedScope],
  );
  const summaries = useMemo(() => buildBrandSummaries(scopedRecords), [scopedRecords]);
  const [selectedBrandKey, setSelectedBrandKey] = useState("");

  useEffect(() => {
    if (!summaries.length) {
      setSelectedBrandKey("");
      return;
    }
    setSelectedBrandKey((current) => summaries.some((summary) => brandSummaryKey(summary) === current)
      ? current
      : brandSummaryKey(summaries[0]));
  }, [summaries]);

  const selectedBrand = summaries.find((summary) => brandSummaryKey(summary) === selectedBrandKey) ?? summaries[0] ?? null;
  const trendEvents = useMemo(() => buildBrandTrendEvents(scopedRecords), [scopedRecords]);
  const totals = useMemo(() => ({
    leads: summaries.reduce((sum, item) => sum + item.leads, 0),
    qualified: summaries.reduce((sum, item) => sum + item.qualified, 0),
    sales: summaries.reduce((sum, item) => sum + item.sales, 0),
    revenue: summaries.reduce((sum, item) => sum + item.revenue, 0),
  }), [summaries]);

  return (
    <div className="page-stack brands-dashboard">
      <ExecutiveSummary
        status={{ label: records.length ? "бренды из sheets" : "жду данные", tone: records.length ? "good" : "warning" }}
        eyebrow="Аналитика брендов"
        title="Бренды"
        facts={[
          `Город: ${selectedScope === "Все" ? "МСК + СПБ" : selectedScope}`,
          `Брендов: ${summaries.length}`,
          `QL: ${formatNumber(totals.qualified)}`,
          `Продаж: ${formatNumber(totals.sales)}`,
          `Автособытий: ${trendEvents.length}`,
        ]}
      />

      <section className="analytics-panel brand-control-panel">
        <div>
          <span>Город</span>
          <div className="source-period-toggle source-city-toggle" role="group" aria-label="Переключить город брендов">
            {sourceCityOptions.map((option) => (
              <button
                key={option}
                type="button"
                className={selectedScope === option ? "active" : ""}
                onClick={() => setSelectedScope(option)}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
        <label>
          <span>Бренд</span>
          <select value={selectedBrand ? brandSummaryKey(selectedBrand) : ""} onChange={(event) => setSelectedBrandKey(event.target.value)}>
            {summaries.map((summary) => (
              <option key={brandSummaryKey(summary)} value={brandSummaryKey(summary)}>
                {summary.brand}
              </option>
            ))}
          </select>
        </label>
        <div className="brand-load-note">{loadMessage}</div>
      </section>

      {summaries.length === 0 ? (
        <section className="messages-placeholder">
          <div className="placeholder-icon"><Target size={28} /></div>
          <h2>Нет данных по брендам</h2>
          <p>Проверь доступ к таблице брендов и наличие листов МСК / СПБ с детальной таблицей.</p>
        </section>
      ) : (
        <>
          {selectedScope === "Все" && (
            <section className="brand-ranking-grid">
              <BrandRankingCard title="Топ по стоимости КВАЛ" caption="Ниже CPQL — лучше" rows={rankBrandSummaries(summaries, "cpql", "asc")} formatValue={(value) => `${formatNumber(value)} ₽`} />
              <BrandRankingCard title="Топ по среднему чеку" caption="Выше чек — лучше" rows={rankBrandSummaries(summaries, "avgCheck", "desc")} formatValue={(value) => `${formatNumber(value)} ₽`} />
              <BrandRankingCard title="Топ по продажам" caption="Сумма МСК + СПБ" rows={rankBrandSummaries(summaries, "sales", "desc")} formatValue={formatNumber} />
              <BrandRankingCard title="Топ по ROAS" caption="Выручка / бюджет" rows={rankBrandSummaries(summaries, "roas", "desc")} formatValue={(value) => `${formatCompactDecimal(value)}x`} />
            </section>
          )}

          {selectedBrand && (
            <section className="analytics-panel brand-detail-panel">
              <div className="brand-detail-head">
                <div>
                  <span>{selectedBrand.domain}</span>
                  <h2>{selectedBrand.brand}</h2>
                  <p>{selectedBrand.cityLabel}</p>
                </div>
                <strong>{formatNumber(selectedBrand.sales)} продаж</strong>
              </div>
              <div className="brand-kpi-grid">
                <BrandKpiCard label="Заявки" value={selectedBrand.leads} />
                <BrandKpiCard label="КВАЛ" value={selectedBrand.qualified} helper={`${selectedBrand.leadToQualified}% из заявки`} />
                <BrandKpiCard label="Продажи" value={selectedBrand.sales} helper={`${selectedBrand.qualifiedToSales}% из КВАЛ`} />
                <BrandKpiCard label="CPQL" value={selectedBrand.cpql} suffix=" ₽" />
                <BrandKpiCard label="Средний чек" value={selectedBrand.avgCheck} suffix=" ₽" />
                <BrandKpiCard label="ROAS" value={selectedBrand.roas ?? 0} suffix="x" decimal />
              </div>
              <div className="brand-detail-grid">
                <BrandMonthlyChart summary={selectedBrand} />
                <BrandCityBreakdown records={selectedBrand.records} />
              </div>
            </section>
          )}

          <section className="analytics-panel brand-events-panel">
            <PanelHead
              title="Автособытия брендов"
              description="Рост или падение фиксируется, если показатель изменился больше чем на 16% к предыдущему месяцу."
            />
            <div className="brand-event-list">
              {trendEvents.slice(0, 18).map((event) => (
                <article key={event.id} className={`brand-event-card ${event.direction === "рост" ? "positive" : "negative"}`}>
                  <strong>{event.brand}: {event.direction} {event.metric}</strong>
                  <span>{event.city} · {event.month} · {event.percent > 0 ? "+" : ""}{event.percent}%</span>
                </article>
              ))}
              {trendEvents.length === 0 && <p className="empty-state">Изменений больше 16% в помесячных колонках продаж и ROAS не найдено.</p>}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function BrandRankingCard({
  title,
  caption,
  rows,
  formatValue,
}: {
  title: string;
  caption: string;
  rows: Array<{ summary: BrandSummary; value: number }>;
  formatValue: (value: number) => string;
}) {
  return (
    <article className="brand-ranking-card">
      <div>
        <h2>{title}</h2>
        <span>{caption}</span>
      </div>
      <ol>
        {rows.slice(0, 5).map((row) => (
          <li key={`${title}-${brandSummaryKey(row.summary)}`}>
            <span>{row.summary.brand}</span>
            <strong>{formatValue(row.value)}</strong>
          </li>
        ))}
      </ol>
    </article>
  );
}

function BrandKpiCard({ label, value, suffix = "", helper, decimal = false }: { label: string; value: number; suffix?: string; helper?: string; decimal?: boolean }) {
  return (
    <article className="brand-kpi-card">
      <span>{label}</span>
      <strong>{decimal ? formatCompactDecimal(value) : formatNumber(Math.round(value))}{suffix}</strong>
      {helper && <small>{helper}</small>}
    </article>
  );
}

function BrandMonthlyChart({ summary }: { summary: BrandSummary }) {
  const width = 620;
  const height = 250;
  const plot = { left: 46, right: 24, top: 28, bottom: 44 };
  const plotWidth = width - plot.left - plot.right;
  const plotHeight = height - plot.top - plot.bottom;
  const maxSales = Math.max(1, ...summary.monthly.map((point) => point.sales));
  const roasValues = summary.monthly.map((point) => point.roas ?? 0);
  const maxRoas = Math.max(1, ...roasValues);
  const xFor = (index: number) => plot.left + (summary.monthly.length <= 1 ? plotWidth / 2 : (index / (summary.monthly.length - 1)) * plotWidth);
  const ySales = (value: number) => plot.top + plotHeight - (value / maxSales) * plotHeight;
  const yRoas = (value: number) => plot.top + plotHeight - (value / maxRoas) * plotHeight;
  const barWidth = 48;
  const roasPath = summary.monthly
    .map((point, index) => `${index === 0 ? "M" : "L"} ${xFor(index)} ${yRoas(point.roas ?? 0)}`)
    .join(" ");

  return (
    <article className="brand-chart-card">
      <div className="brand-chart-head">
        <div>
          <span>динамика бренда</span>
          <strong>Продажи и ROAS</strong>
        </div>
        <div className="brand-chart-legend">
          <span><i className="sales" /> продажи</span>
          <span><i className="roas" /> ROAS</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Динамика бренда ${summary.brand}`}>
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = plot.top + plotHeight - ratio * plotHeight;
          return (
            <g key={ratio}>
              <line x1={plot.left} x2={width - plot.right} y1={y} y2={y} className="brand-grid-line" />
              <text x={plot.left - 10} y={y + 4} className="brand-axis-label">{formatNumber(Math.round(maxSales * ratio))}</text>
            </g>
          );
        })}
        {summary.monthly.map((point, index) => {
          const x = xFor(index);
          const barHeight = plot.top + plotHeight - ySales(point.sales);
          return (
            <g key={point.month}>
              <rect x={x - barWidth / 2} y={ySales(point.sales)} width={barWidth} height={barHeight} rx="10" className="brand-sales-bar">
                <title>{point.month}: продажи {formatNumber(point.sales)}, ROAS {point.roas === null ? "нет данных" : formatCompactDecimal(point.roas)}</title>
              </rect>
              <text x={x} y={height - 20} className="brand-x-label">{point.month.slice(0, 3)}</text>
              <text x={x} y={ySales(point.sales) - 8} className="brand-value-label">{formatNumber(point.sales)}</text>
            </g>
          );
        })}
        <path d={roasPath} className="brand-roas-line" />
        {summary.monthly.map((point, index) => (
          <circle key={`roas-${point.month}`} cx={xFor(index)} cy={yRoas(point.roas ?? 0)} r="4" className="brand-roas-dot">
            <title>{point.month}: ROAS {point.roas === null ? "нет данных" : formatCompactDecimal(point.roas)}</title>
          </circle>
        ))}
      </svg>
    </article>
  );
}

function BrandCityBreakdown({ records }: { records: BrandAnalyticsRecord[] }) {
  return (
    <article className="brand-city-card">
      <div>
        <span>разделение по городам</span>
        <strong>МСК / СПБ</strong>
      </div>
      <div className="brand-city-list">
        {records.map((record) => (
          <div key={record.id}>
            <strong>{record.city}</strong>
            <span>КВАЛ {formatNumber(record.qualified)}</span>
            <span>Продажи {formatNumber(record.sales)}</span>
            <span>CPQL {formatNumber(record.cpql)} ₽</span>
          </div>
        ))}
      </div>
    </article>
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
  const [sourceCity, setSourceCity] = useState<EditableSourceCity>("МСК");
  const [newSourceName, setNewSourceName] = useState("");
  const activeSources = useMemo(() => getActiveLeadSources(records), [records]);
  const [draft, setDraft] = useState<Record<string, SourceMetricDraft>>(() => createSourceDraft(records, selectedDate, activeSources, sourceCity));

  useEffect(() => {
    if (!monthDates.includes(selectedDate)) {
      setSelectedDate(firstDate);
    }
  }, [firstDate, monthDates, selectedDate]);

  useEffect(() => {
    setDraft(createSourceDraft(records, selectedDate, activeSources, sourceCity));
  }, [activeSources, records, selectedDate, sourceCity]);

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
      metrics.map((metric) => sourceDailyUpdate(selectedDate, source, metric, draft[source]?.[metric] ?? 0, sourceCity)),
    );
    await onSaveDailyValues(values, `Источники ${sourceCity} за ${formatDay(selectedDate)} сохранены.`);
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
        <label>
          Город
          <select value={sourceCity} onChange={(event) => setSourceCity(event.target.value as EditableSourceCity)}>
            <option value="МСК">МСК</option>
            <option value="СПБ">СПБ</option>
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
  if (!weeks.length) return weeks;

  const rawTotals = mergeTotals(weeks);
  const plansByMetric = metrics.reduce<Record<Metric, number[]>>((acc, metric) => {
    const rawPlan = rawTotals[metric].plan;
    const targetPlan = getPlanOverrideForScope(config, selectedScope, metric, rawPlan);

    if (!Number.isFinite(targetPlan) || targetPlan <= 0 || targetPlan === rawPlan) {
      acc[metric] = weeks.map((week) => week.totals[metric].plan);
      return acc;
    }

    const rawWeights = weeks.map((week) => week.totals[metric].plan);
    const weights = rawPlan > 0 ? rawWeights : weeks.map((week) => getWeekDurationDays(week));
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || weeks.length;
    let distributed = 0;
    acc[metric] = weeks.map((week, index) => {
      if (index === weeks.length - 1) {
        return Math.max(0, Math.round(targetPlan - distributed));
      }
      const nextPlan = Math.max(0, Math.round((weights[index] / totalWeight) * targetPlan));
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

function getPlanOverrideForScope(
  config: MonthConfig,
  selectedScope: ReportScope,
  metric: Metric,
  rawPlan: number,
): number {
  if (selectedScope === "Все") return Number(config.plan[metric] ?? rawPlan);
  return Number(config.plansByCity?.[selectedScope]?.[metric] ?? rawPlan);
}

function getWeekDurationDays(week: WeekSummary): number {
  const start = Date.parse(`${week.startDate}T00:00:00Z`);
  const end = Date.parse(`${week.endDate}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 1;
  return Math.max(1, Math.round((end - start) / 86400000) + 1);
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

function getSourceMonthRangeLabel(configs: MonthConfig[]): string {
  if (!configs.length) return "нет данных";
  const sorted = [...configs].sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  const first = sorted[0].label;
  const last = sorted[sorted.length - 1].label;
  return first === last ? first : `${first} → ${last}`;
}

function getLeadFactForCity(records: DailyRecord[], date: string, city: City): number {
  if (city === "сообщения") return 0;
  return records
    .filter((record) => record.date === date && record.city === city && record.metric === "Лиды")
    .reduce((sum, record) => sum + netFact(record), 0);
}

function buildLeadChartMonths(records: DailyRecord[], monthConfigs: MonthConfig[], selectedScope: ReportScope, onlyWeekends: boolean): WeekendLeadChartMonth[] {
  const sortedMonths = [...monthConfigs].sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  const manualMonths = selectedScope === "Все" ? weekendLeadManualMonths : [];
  const configuredMonths = sortedMonths
    .map((config) => {
      const allDates = getMonthDates(config.year, config.monthIndex, config.daysInMonth);
      const dates = onlyWeekends ? allDates.filter(isWeekend) : allDates;
      const citySeries = selectedScope === "Все"
        ? [
            { label: "МСК", className: "msk", values: dates.map((date) => getLeadFactForCity(records, date, "МСК")) },
            { label: "СПБ", className: "spb", values: dates.map((date) => getLeadFactForCity(records, date, "СПБ")) },
          ]
        : selectedScope === "МСК" || selectedScope === "СПБ"
          ? [{ label: selectedScope, className: selectedScope === "МСК" ? "msk" : "spb", values: dates.map((date) => getLeadFactForCity(records, date, selectedScope)) }]
          : [];

      return {
        key: config.monthKey,
        label: config.label,
        dates,
        series: citySeries,
      };
    })
    .filter((month) => month.dates.length && month.series.some((item) => item.values.some((value) => value > 0)));

  return [...manualMonths, ...configuredMonths];
}

function leadDayTooltip(date: string, series: WeekendLeadChartSeries[], index: number): string {
  const rows = [
    `${formatLongDate(date)}, ${weekdayLabel(date)}`,
    ...series.map((item) => `${item.label}: ${formatNumber(item.values[index] ?? 0)} лидов`),
  ];
  const total = series.length > 1 ? series.reduce((sum, item) => sum + (item.values[index] ?? 0), 0) : null;
  if (total !== null) rows.push(`Итого: ${formatNumber(total)} лидов`);
  return rows.join("\n");
}

function isWeekend(dateIso: string): boolean {
  const day = new Date(`${dateIso}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
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

function buildBrandSummaries(records: BrandAnalyticsRecord[]): BrandSummary[] {
  const groups = new Map<string, BrandAnalyticsRecord[]>();
  records.forEach((record) => {
    const key = record.brand.toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), record]);
  });

  return [...groups.values()]
    .map((group) => {
      const leads = group.reduce((sum, record) => sum + record.leads, 0);
      const qualified = group.reduce((sum, record) => sum + record.qualified, 0);
      const sales = group.reduce((sum, record) => sum + record.sales, 0);
      const revenue = group.reduce((sum, record) => sum + record.revenue, 0);
      const budget = group.reduce((sum, record) => sum + record.budget, 0);
      const monthly = combineBrandMonthly(group);
      return {
        brand: group[0].brand,
        domain: group.map((record) => record.domain).filter(Boolean).join(" · "),
        cityLabel: group.map((record) => record.city).join(" + "),
        records: group,
        leads,
        qualified,
        sales,
        revenue,
        budget,
        leadToQualified: percent(qualified, leads),
        qualifiedToSales: percent(sales, qualified),
        cpl: leads > 0 ? budget / leads : 0,
        cpql: qualified > 0 ? budget / qualified : 0,
        saleCost: sales > 0 ? budget / sales : 0,
        roas: budget > 0 ? revenue / budget : averageNullable(group.map((record) => record.roas)),
        roasFact: budget > 0 ? (revenue / budget) / 2 : averageNullable(group.map((record) => record.roasFact)),
        avgCheck: sales > 0 ? revenue / sales : averagePositive(group.map((record) => record.avgCheck)),
        monthly,
      };
    })
    .sort((a, b) => b.sales - a.sales || b.qualified - a.qualified || a.brand.localeCompare(b.brand, "ru"));
}

function combineBrandMonthly(records: BrandAnalyticsRecord[]): BrandSummary["monthly"] {
  const monthOrder = records[0]?.monthly.map((point) => point.month) ?? [];
  return monthOrder.map((month) => {
    const points = records.map((record) => record.monthly.find((point) => point.month === month));
    return {
      month,
      sales: points.reduce((sum, point) => sum + (point?.sales ?? 0), 0),
      roas: averageNullable(points.map((point) => point?.roas ?? null)),
    };
  });
}

function brandSummaryKey(summary: BrandSummary): string {
  return `${summary.brand}-${summary.cityLabel}`.toLowerCase();
}

function rankBrandSummaries(
  summaries: BrandSummary[],
  field: keyof Pick<BrandSummary, "cpql" | "avgCheck" | "sales" | "roas">,
  direction: "asc" | "desc",
): Array<{ summary: BrandSummary; value: number }> {
  return summaries
    .map((summary) => ({ summary, value: Number(summary[field] ?? 0) }))
    .filter((row) => row.value > 0)
    .sort((a, b) => direction === "asc" ? a.value - b.value : b.value - a.value)
    .slice(0, 8);
}

function buildBrandTrendEvents(records: BrandAnalyticsRecord[]): BrandTrendEvent[] {
  return records.flatMap((record) => {
    const events: BrandTrendEvent[] = [];
    record.monthly.forEach((point, index) => {
      const previous = record.monthly[index - 1];
      if (!previous) return;
      const salesDelta = percentChange(point.sales, previous.sales);
      if (salesDelta !== null && Math.abs(salesDelta) >= 16) {
        events.push({
          id: `${record.id}-sales-${point.month}`,
          brand: record.brand,
          city: record.city,
          month: point.month,
          metric: "продаж",
          direction: salesDelta > 0 ? "рост" : "падение",
          percent: Math.round(salesDelta),
        });
      }
      const roasDelta = point.roas !== null && previous.roas !== null ? percentChange(point.roas, previous.roas) : null;
      if (roasDelta !== null && Math.abs(roasDelta) >= 16) {
        events.push({
          id: `${record.id}-roas-${point.month}`,
          brand: record.brand,
          city: record.city,
          month: point.month,
          metric: "ROAS",
          direction: roasDelta > 0 ? "рост" : "падение",
          percent: Math.round(roasDelta),
        });
      }
    });
    return events;
  }).sort((a, b) => Math.abs(b.percent) - Math.abs(a.percent));
}

function percentChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

function averageNullable(values: Array<number | null | undefined>): number | null {
  const safeValues = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);
  if (!safeValues.length) return null;
  return safeValues.reduce((sum, value) => sum + value, 0) / safeValues.length;
}

function averagePositive(values: number[]): number {
  const safeValues = values.filter((value) => Number.isFinite(value) && value > 0);
  if (!safeValues.length) return 0;
  return safeValues.reduce((sum, value) => sum + value, 0) / safeValues.length;
}

function buildBrandDashboardSummaries(
  records: BrandAnalyticsRecord[],
  performance: BrandPerformanceWeekly[],
  branches: BrandBranchWeekly[],
  selectedScope: ReportScope,
  monthKey: string,
): BrandDashboardSummary[] {
  const legacyRecords = records.filter((record) => selectedScope === "Все" || record.city === selectedScope);
  const legacyByBrand = new Map<string, BrandAnalyticsRecord[]>();
  legacyRecords.forEach((record) => {
    const key = normalizeBrandDashboardKey(record.brand);
    legacyByBrand.set(key, [...(legacyByBrand.get(key) ?? []), record]);
  });

  const groups = new Map<string, BrandPerformanceWeekly[]>();
  performance.forEach((row) => {
    const key = normalizeBrandDashboardKey(row.brand);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  });

  const summaries = [...groups.entries()]
    .map(([key, rows]) => {
      const recordsForBrand = legacyByBrand.get(key) ?? [];
      const totals = aggregateBrandPerformance(rows);
      const brandBranches = branches.filter((row) => normalizeBrandDashboardKey(row.brand) === key);
      const latestBranches = latestBranchCounts(brandBranches, monthKey);
      const totalBranches = branchPlatforms.reduce((sum, platform) => sum + latestBranches[platform], 0);
      const weekly = buildBrandWeeklyPoints(rows);
      const sourceBreakdown = buildBrandSourceBreakdown(rows);
      const domain = [...new Set([
        ...rows.map((row) => row.domain).filter(Boolean),
        ...recordsForBrand.map((record) => record.domain).filter(Boolean),
      ])].slice(0, 3).join(" · ");

      return {
        brand: rows[0]?.brand ?? recordsForBrand[0]?.brand ?? "Бренд",
        domain,
        cityLabel: selectedScope === "Все" ? "МСК + СПБ" : selectedScope,
        records: recordsForBrand,
        performance: rows,
        branches: brandBranches,
        leads: totals.leads,
        qualified: totals.qualified,
        sales: totals.sales,
        revenue: totals.revenue,
        budget: totals.budget,
        leadToQualified: totals.leadToQualified,
        qualifiedToSales: totals.qualifiedToSales,
        cpl: totals.cpl,
        cpql: totals.cpql,
        saleCost: totals.saleCost,
        roas: totals.roas,
        roasFact: totals.roasFact,
        avgCheck: totals.avgCheck,
        latestBranches,
        totalBranches,
        salesPerBranch: perBranchValues(totals.sales, latestBranches),
        revenuePerBranch: perBranchValues(totals.revenue, latestBranches),
        leadsPerBranch: perBranchValues(totals.leads, latestBranches),
        weekly,
        sourceBreakdown,
        topBadges: [],
      };
    })
    .filter((summary) => summary.leads || summary.qualified || summary.sales || summary.revenue)
    .sort((a, b) => b.sales - a.sales || b.qualified - a.qualified || b.leads - a.leads || a.brand.localeCompare(b.brand, "ru"));

  return attachBrandTopBadges(summaries);
}

function aggregateBrandPerformance(rows: BrandPerformanceWeekly[]) {
  const leads = rows.reduce((sum, row) => sum + row.leads, 0);
  const qualified = rows.reduce((sum, row) => sum + row.qualified, 0);
  const sales = rows.reduce((sum, row) => sum + row.sales, 0);
  const revenue = rows.reduce((sum, row) => sum + row.revenue, 0);
  const budget = rows.reduce((sum, row) => sum + row.budget, 0);
  return {
    leads,
    qualified,
    sales,
    revenue,
    budget,
    leadToQualified: percent(qualified, leads),
    qualifiedToSales: percent(sales, qualified),
    cpl: leads > 0 ? budget / leads : 0,
    cpql: qualified > 0 ? budget / qualified : 0,
    saleCost: sales > 0 ? budget / sales : 0,
    roas: budget > 0 ? revenue / budget : averageNullable(rows.map((row) => row.roas)),
    roasFact: budget > 0 ? (revenue / budget) / 2 : averageNullable(rows.map((row) => row.roasFact)),
    avgCheck: sales > 0 ? revenue / sales : averagePositive(rows.map((row) => row.avgCheck)),
  };
}

function buildBrandTotals(summaries: BrandDashboardSummary[]) {
  const leads = summaries.reduce((sum, summary) => sum + summary.leads, 0);
  const qualified = summaries.reduce((sum, summary) => sum + summary.qualified, 0);
  const sales = summaries.reduce((sum, summary) => sum + summary.sales, 0);
  const revenue = summaries.reduce((sum, summary) => sum + summary.revenue, 0);
  const budget = summaries.reduce((sum, summary) => sum + summary.budget, 0);
  return {
    leads,
    qualified,
    sales,
    revenue,
    budget,
    roas: budget > 0 ? revenue / budget : null,
    roasFact: budget > 0 ? (revenue / budget) / 2 : null,
  };
}

function buildBrandWeeklyPoints(rows: BrandPerformanceWeekly[]): BrandWeeklyPoint[] {
  const groups = new Map<string, BrandPerformanceWeekly[]>();
  rows.forEach((row) => {
    groups.set(row.weekStart, [...(groups.get(row.weekStart) ?? []), row]);
  });
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, group], index) => {
      const totals = aggregateBrandPerformance(group);
      return {
        weekStart,
        label: `${index + 1} нед.`,
        leads: totals.leads,
        qualified: totals.qualified,
        sales: totals.sales,
        revenue: totals.revenue,
        budget: totals.budget,
        saleCost: totals.saleCost,
        roas: totals.roas,
        roasFact: totals.roasFact,
        avgCheck: totals.avgCheck,
      };
    });
}

function buildBrandSourceBreakdown(rows: BrandPerformanceWeekly[]): BrandSourceSummary[] {
  const groups = new Map<string, BrandPerformanceWeekly[]>();
  rows.forEach((row) => {
    groups.set(row.source, [...(groups.get(row.source) ?? []), row]);
  });
  return [...groups.entries()]
    .map(([source, group]) => {
      const totals = aggregateBrandPerformance(group);
      return {
        source,
        leads: totals.leads,
        qualified: totals.qualified,
        sales: totals.sales,
        revenue: totals.revenue,
        budget: totals.budget,
        roas: totals.roas,
        roasFact: totals.roasFact,
      };
    })
    .sort((a, b) => b.sales - a.sales || b.qualified - a.qualified || b.leads - a.leads);
}

function latestBranchCounts(rows: BrandBranchWeekly[], monthKey: string): Record<BrandBranchPlatform, number> {
  return branchPlatforms.reduce((acc, platform) => {
    const platformRows = rows
      .filter((row) => row.platform === platform && row.monthKey <= monthKey)
      .sort((a, b) => b.weekStart.localeCompare(a.weekStart));
    const latestByCity = new Map<BrandCity, BrandBranchWeekly>();
    platformRows.forEach((row) => {
      if (!latestByCity.has(row.city)) latestByCity.set(row.city, row);
    });
    acc[platform] = [...latestByCity.values()].reduce((sum, row) => sum + row.branches, 0);
    return acc;
  }, {} as Record<BrandBranchPlatform, number>);
}

function perBranchValues(value: number, counts: Record<BrandBranchPlatform, number>): Record<BrandBranchPlatform, number> {
  return branchPlatforms.reduce((acc, platform) => {
    acc[platform] = counts[platform] > 0 ? value / counts[platform] : 0;
    return acc;
  }, {} as Record<BrandBranchPlatform, number>);
}

function attachBrandTopBadges(summaries: BrandDashboardSummary[]): BrandDashboardSummary[] {
  const badgeDefinitions: Array<{
    label: string;
    direction: "asc" | "desc";
    getValue: (summary: BrandDashboardSummary) => number;
    format: (value: number) => string;
  }> = [
    { label: "продажи", direction: "desc", getValue: (summary) => summary.sales, format: formatNumber },
    { label: "выручка", direction: "desc", getValue: (summary) => summary.revenue, format: (value) => `${formatNumber(value)} ₽` },
    { label: "ROAS", direction: "desc", getValue: (summary) => summary.roas ?? 0, format: (value) => `${formatCompactDecimal(value)}x` },
    { label: "ROAS факт", direction: "desc", getValue: (summary) => summary.roasFact ?? 0, format: (value) => `${formatCompactDecimal(value)}x` },
    { label: "средний чек", direction: "desc", getValue: (summary) => summary.avgCheck, format: (value) => `${formatNumber(value)} ₽` },
    { label: "цена КВАЛ", direction: "asc", getValue: (summary) => summary.cpql, format: (value) => `${formatNumber(value)} ₽` },
    { label: "стоимость продажи", direction: "asc", getValue: (summary) => summary.saleCost, format: (value) => `${formatNumber(value)} ₽` },
  ];

  const badgesByKey = new Map<string, BrandTopBadge[]>();
  badgeDefinitions.forEach((definition) => {
    rankBrandDashboardSummaries(summaries, definition.getValue, definition.direction).slice(0, 5).forEach((row, index) => {
      const key = brandDashboardSummaryKey(row.summary);
      badgesByKey.set(key, [
        ...(badgesByKey.get(key) ?? []),
        { label: definition.label, rank: index + 1, value: definition.format(row.value) },
      ]);
    });
  });

  return summaries.map((summary) => ({
    ...summary,
    topBadges: (badgesByKey.get(brandDashboardSummaryKey(summary)) ?? []).slice(0, 4),
  }));
}

function rankBrandDashboardSummaries(
  summaries: BrandDashboardSummary[],
  getValue: (summary: BrandDashboardSummary) => number,
  direction: "asc" | "desc",
): Array<{ summary: BrandDashboardSummary; value: number }> {
  return summaries
    .map((summary) => ({ summary, value: getValue(summary) }))
    .filter((row) => Number.isFinite(row.value) && row.value > 0)
    .sort((a, b) => direction === "asc" ? a.value - b.value : b.value - a.value);
}

function buildBrandDashboardEvents(performance: BrandPerformanceWeekly[], selectedScope: ReportScope): BrandEvent[] {
  const rows = performance.filter((row) => selectedScope === "Все" || row.city === selectedScope);
  const groups = new Map<string, BrandPerformanceWeekly[]>();
  rows.forEach((row) => {
    const key = `${normalizeBrandDashboardKey(row.brand)}|${row.city}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  });

  return [...groups.values()].flatMap((group) => {
    const weekly = buildBrandWeeklyPoints(group);
    const brand = group[0]?.brand ?? "";
    const city = group[0]?.city ?? "МСК";
    return weekly.flatMap((point, index) => {
      const previous = weekly[index - 1];
      if (!previous) return [];
      const metricsToCheck = [
        { key: "leads", label: "лидов", current: point.leads, previous: previous.leads },
        { key: "qualified", label: "КВАЛ", current: point.qualified, previous: previous.qualified },
        { key: "sales", label: "продаж", current: point.sales, previous: previous.sales },
        { key: "leadToQualified", label: "конверсии в КВАЛ", current: percent(point.qualified, point.leads), previous: percent(previous.qualified, previous.leads) },
        { key: "avgCheck", label: "среднего чека", current: point.sales ? point.revenue / point.sales : 0, previous: previous.sales ? previous.revenue / previous.sales : 0 },
      ];
      return metricsToCheck.flatMap((metric) => {
        const delta = percentChange(metric.current, metric.previous);
        if (delta === null || Math.abs(delta) < 16) return [];
        return [{
          id: `${normalizeBrandDashboardKey(brand)}-${city}-${point.weekStart}-${metric.key}`,
          brand,
          city,
          weekStart: point.weekStart,
          metric: metric.label,
          direction: delta > 0 ? "рост" : "падение",
          percent: Math.round(delta),
        } satisfies BrandEvent];
      });
    });
  }).sort((a, b) => Math.abs(b.percent) - Math.abs(a.percent));
}

function brandDashboardSummaryKey(summary: BrandDashboardSummary): string {
  return `${summary.brand}-${summary.cityLabel}`.toLowerCase();
}

function normalizeBrandDashboardKey(value: string): string {
  return String(value || "").trim().toLowerCase().replace(/[\s._-]+/g, "");
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
    leadDaily: {
      title: "Лиды по дням",
      subtitle: "Дизайнерский отчет по лидам: месяцы отдельными графиками, города раздельными кривыми.",
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
    brands: {
      title: "Бренды",
      subtitle: "Динамика брендов по городам, рейтинги эффективности и автособытия по заметным изменениям.",
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

function canonicalSourceName(value: string): string {
  const normalized = normalizeSourceName(value);
  const lower = normalized.toLowerCase();
  const domain = lower.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
  if (domain === "изи-драйв.рф" || lower.includes("директ")) return "Директ";
  if (lower === "сайт" || lower === "сайты" || lower === "site" || lower === "sites") return "SEO";
  if (lower.includes("2gis") || lower.includes("2гис") || lower.includes("2 гис") || lower.includes("link.2gis")) return "2ГИС";
  if (lower.includes("google") || lower.includes("гугл") || lower.includes("gkart") || /(^|[:_\s-])go($|[:_\s-])/.test(lower)) return "Гугл Карты";
  if (lower.includes("ykart") || lower.includes("ykar") || /(^|[:_\s-])yk($|[:_\s-])/.test(lower) || /(^|[:_\s-])ya($|[:_\s-])/.test(lower) || lower.includes("geoadv_maps")) return "Яндекс Карты";
  if (lower === "прямой" || lower === "прямые" || lower === "прямые визиты" || lower === "direct visits") return "Прямые визиты";
  if (lower === "основные" || lower === "другое" || lower === "другие") return "Другие";
  return normalized;
}

function sourceNameEquals(left: string, right: string): boolean {
  return canonicalSourceName(left).toLowerCase() === canonicalSourceName(right).toLowerCase();
}

function sourceKey(source: string): string {
  return canonicalSourceName(source).toLowerCase();
}

function isSuppressedLeadSource(source: string): boolean {
  return sourceNameEquals(source, "Другие");
}

function sourceMetricLabel(metric: Metric): string {
  if (metric === "Квалы") return "КВАЛ";
  return metric;
}

function getLeadSourceColor(source: string, fallbackIndex = 0): string {
  const normalized = canonicalSourceName(source).toLowerCase();
  if (normalized.includes("seo") || normalized.includes("сео")) return "#1C46F5";
  if (normalized.includes("2гис") || normalized.includes("2gis")) return "#22B94B";
  if (normalized.includes("директ")) return "#F5B800";
  if (normalized.includes("яндекс") && normalized.includes("карт")) return "#FB6258";
  if (normalized.includes("гугл") || normalized.includes("google")) return "#34B7C7";
  if (normalized.includes("zoon")) return "#8B5CF6";
  if (normalized.includes("прям")) return "#64748B";
  if (normalized.includes("кеш") || normalized.includes("кэш") || normalized.includes("cashback")) return "#FF7A45";
  if (normalized.includes("друг")) return "#131B2F";

  const fallbackPalette = ["#7FA7FF", "#8B5CF6", "#14B8A6", "#F97316", "#64748B", "#EC4899"];
  return fallbackPalette[Math.abs(fallbackIndex) % fallbackPalette.length];
}

function createEmptySourceValues(sources: string[]): Record<string, Record<Metric, number>> {
  return sources.reduce<Record<string, Record<Metric, number>>>((acc, source) => {
    acc[source] = metrics.reduce<Record<Metric, number>>((metricAcc, metric) => {
      metricAcc[metric] = 0;
      return metricAcc;
    }, {} as Record<Metric, number>);
    return acc;
  }, {});
}

function findSourceLabel(source: string, sources: string[]): string | null {
  return sources.find((item) => sourceNameEquals(item, source)) ?? null;
}

function getSourceRecordCityScope(record: DailyRecord | DailyValueUpdate): SourceCityFilter | null {
  const match = (record.comment ?? "").match(sourceCityCommentPattern);
  if (match) return match[1].toUpperCase() as SourceCityFilter;

  const idMatch = String(record.id ?? "").match(/source-(?:recalc-)?(msk|spb)-/i);
  if (!idMatch) return null;
  return sourceCityFromCode(idMatch[1]);
}

function getSourceRecordsForCity(records: DailyRecord[], city: SourceCityFilter): DailyRecord[] {
  if (city === "Все") return records;
  return records.filter((record) => !isSourceValueRecord(record) || getSourceRecordCityScope(record) === city);
}

function getSourceRecordsForPeriod(records: DailyRecord[], periodMode: SourcePeriodMode, config: MonthConfig): DailyRecord[] {
  const sourceRecords = records.filter(isSourceValueRecord);
  if (periodMode === "month") return sourceRecords;
  return sourceRecords.filter((record) => record.date.startsWith(config.monthKey));
}

function buildSourceChartBuckets(
  records: DailyRecord[],
  periodMode: SourcePeriodMode,
  config: MonthConfig,
  configs: MonthConfig[],
  sources: string[],
): SourceChartBucket[] {
  const sortedConfigs = [...configs].sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  const buckets = periodMode === "month"
    ? sortedConfigs.map((monthConfig) => ({
      key: monthConfig.monthKey,
      label: getShortMonthLabel(monthConfig),
      caption: String(monthConfig.year),
      values: createEmptySourceValues(sources),
    }))
    : buildMonthSourceBuckets(periodMode, config, sources);

  const bucketByKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));

  records.filter(isSourceValueRecord).forEach((record) => {
    if (periodMode !== "month" && !record.date.startsWith(config.monthKey)) return;

    const bucketKey = periodMode === "month"
      ? record.date.slice(0, 7)
      : periodMode === "week"
        ? `${config.monthKey}-week-${getWeekOfMonth(record.date)}`
        : record.date;
    const bucket = bucketByKey.get(bucketKey);
    if (!bucket) return;

    const source = findSourceLabel(record.channel, sources);
    if (!source || !bucket.values[source]) return;

    bucket.values[source][record.metric] += Math.max(0, Number(record.fact || 0));
  });

  return buckets;
}

function buildMonthSourceBuckets(periodMode: SourcePeriodMode, config: MonthConfig, sources: string[]): SourceChartBucket[] {
  const dates = getMonthDates(config.year, config.monthIndex, config.daysInMonth);
  if (periodMode === "day") {
    return dates.map((date) => ({
      key: date,
      label: formatDay(date),
      caption: weekdayLabel(date),
      values: createEmptySourceValues(sources),
    }));
  }

  const weekNumbers = [...new Set(dates.map((date) => getWeekOfMonth(date)))];
  return weekNumbers.map((week) => {
    const weekDates = dates.filter((date) => getWeekOfMonth(date) === week);
    return {
      key: `${config.monthKey}-week-${week}`,
      label: `${week} нед.`,
      caption: `${formatDay(weekDates[0])} - ${formatDay(weekDates[weekDates.length - 1])}`,
      values: createEmptySourceValues(sources),
    };
  });
}

function buildSourceConicGradient(rows: Array<{ color: string; value: number }>, total: number): string {
  let cursor = 0;
  const segments = rows
    .filter((row) => row.value > 0)
    .map((row) => {
      const next = cursor + (row.value / total) * 100;
      const segment = `${row.color} ${cursor.toFixed(2)}% ${next.toFixed(2)}%`;
      cursor = next;
      return segment;
    });
  return segments.length ? `conic-gradient(${segments.join(", ")})` : "conic-gradient(#dbe7ff 0 100%)";
}

function isSourceMetaRecord(record: DailyRecord): boolean {
  return record.city === sourceRecordCity && record.channel.startsWith(sourceMetaChannelPrefix);
}

function isSourceValueRecord(record: DailyRecord): boolean {
  return record.city === sourceRecordCity && !isSourceMetaRecord(record) && !isSuppressedLeadSource(record.channel);
}

function sourceNameFromMeta(record: DailyRecord): string {
  return canonicalSourceName(record.channel.slice(sourceMetaChannelPrefix.length));
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
    if (isSuppressedLeadSource(source)) return;
    if (!meta.hidden.has(source.toLowerCase())) names.add(source);
  });

  records.filter(isSourceValueRecord).forEach((record) => {
    const source = canonicalSourceName(record.channel);
    if (!source || isSuppressedLeadSource(source) || meta.hidden.has(source.toLowerCase())) return;
    if (record.fact > 0 || record.plan > 0 || record.forecast > 0 || record.recommendations > 0 || record.omQualified > 0) {
      const existing = [...names].find((item) => sourceNameEquals(item, source));
      names.add(existing ?? source);
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

function createSourceDraft(records: DailyRecord[], date: string, sources: string[], sourceCity: EditableSourceCity): Record<string, SourceMetricDraft> {
  return sources.reduce<Record<string, SourceMetricDraft>>((acc, source) => {
    acc[source] = metrics.reduce<SourceMetricDraft>((metricAcc, metric) => {
      metricAcc[metric] = findSourceDailyRecord(records, date, source, metric, sourceCity)?.fact ?? 0;
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

function getSourceMoneyTotalsFromDaily(records: DailyRecord[], sources: string[]): SourceMoneyTotals[] {
  return sources.map((source) => ({
    source,
    totals: getSourceMetricTotals(records, source),
    budget: 0,
    revenue: 0,
    cpl: 0,
    cpql: 0,
    saleCost: 0,
    roas: null,
    roasFact: null,
  }));
}

function getSourceBrandRowsForPeriod(
  rows: BrandPerformanceWeekly[],
  selectedBrandKey: string,
  city: SourceCityFilter,
  periodMode: SourcePeriodMode,
  config: MonthConfig,
): BrandPerformanceWeekly[] {
  return rows.filter((row) => {
    if (selectedBrandKey !== "all" && normalizeBrandDashboardKey(row.brand) !== selectedBrandKey) return false;
    if (city !== "Все" && row.city !== city) return false;
    if (periodMode === "month") return true;
    return row.monthKey === config.monthKey;
  });
}

function getActiveSourcesFromBrandPerformance(rows: BrandPerformanceWeekly[]): string[] {
  const names = new Set<string>();
  rows.forEach((row) => {
    const source = canonicalSourceName(row.source);
    if (!source || isSuppressedLeadSource(source)) return;
    if (row.leads > 0 || row.qualified > 0 || row.sales > 0 || row.budget > 0 || row.revenue > 0) names.add(source);
  });
  defaultLeadSources.forEach((source) => {
    if ([...names].some((item) => sourceNameEquals(item, source))) return;
    if (rows.some((row) => sourceNameEquals(row.source, source))) names.add(source);
  });
  return [...names].sort((a, b) => {
    const aDefault = defaultLeadSources.findIndex((source) => sourceNameEquals(source, a));
    const bDefault = defaultLeadSources.findIndex((source) => sourceNameEquals(source, b));
    if (aDefault >= 0 || bDefault >= 0) return (aDefault < 0 ? 999 : aDefault) - (bDefault < 0 ? 999 : bDefault);
    return a.localeCompare(b, "ru");
  });
}

function getSourceMoneyTotalsFromBrandPerformance(rows: BrandPerformanceWeekly[], sources: string[]): SourceMoneyTotals[] {
  return sources.map((source) => {
    const sourceRows = rows.filter((row) => sourceNameEquals(row.source, source));
    const totals = metrics.reduce<Record<Metric, number>>((acc, metric) => {
      acc[metric] = sourceRows.reduce((sum, row) => {
        if (metric === "Лиды") return sum + row.leads;
        if (metric === "Квалы") return sum + row.qualified;
        return sum + row.sales;
      }, 0);
      return acc;
    }, {} as Record<Metric, number>);
    const budget = sourceRows.reduce((sum, row) => sum + row.budget, 0);
    const revenue = sourceRows.reduce((sum, row) => sum + row.revenue, 0);
    const roas = budget > 0 ? revenue / budget : null;
    return {
      source,
      totals,
      budget,
      revenue,
      cpl: totals["Лиды"] > 0 ? budget / totals["Лиды"] : 0,
      cpql: totals["Квалы"] > 0 ? budget / totals["Квалы"] : 0,
      saleCost: totals["Продажи"] > 0 ? budget / totals["Продажи"] : 0,
      roas,
      roasFact: roas === null ? null : roas / 2,
    };
  });
}

function buildBrandSourceChartBuckets(
  rows: BrandPerformanceWeekly[],
  periodMode: SourcePeriodMode,
  config: MonthConfig,
  configs: MonthConfig[],
  sources: string[],
): SourceChartBucket[] {
  const sortedConfigs = [...configs].sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  const buckets = periodMode === "month"
    ? sortedConfigs.map((monthConfig) => ({
      key: monthConfig.monthKey,
      label: getShortMonthLabel(monthConfig),
      caption: String(monthConfig.year),
      values: createEmptySourceValues(sources),
    }))
    : buildMonthSourceBuckets("week", config, sources);
  const bucketByKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));

  rows.forEach((row) => {
    const bucketKey = periodMode === "month" ? row.monthKey : `${row.monthKey}-week-${getWeekOfMonth(row.weekStart)}`;
    const bucket = bucketByKey.get(bucketKey);
    if (!bucket) return;
    const source = findSourceLabel(row.source, sources);
    if (!source || !bucket.values[source]) return;
    bucket.values[source]["Лиды"] += Math.max(0, Number(row.leads || 0));
    bucket.values[source]["Квалы"] += Math.max(0, Number(row.qualified || 0));
    bucket.values[source]["Продажи"] += Math.max(0, Number(row.sales || 0));
  });

  return buckets;
}

function findSourceDailyRecord(
  records: DailyRecord[],
  date: string,
  source: string,
  metric: Metric,
  sourceCity: EditableSourceCity,
): DailyRecord | undefined {
  return records.find((record) =>
    record.date === date &&
    record.city === sourceRecordCity &&
    record.metric === metric &&
    sourceNameEquals(record.channel, source) &&
    getSourceRecordCityScope(record) === sourceCity,
  );
}

function sourceCityCode(city: EditableSourceCity): string {
  return city === "МСК" ? "msk" : "spb";
}

function sourceCityFromCode(code: string): EditableSourceCity | null {
  const normalized = code.toLowerCase();
  if (normalized === "msk") return "МСК";
  if (normalized === "spb") return "СПБ";
  return null;
}

function sourceCityComment(city: EditableSourceCity): string {
  return `[SOURCE_CITY=${city}]`;
}

function sourceRecordId(date: string, source: string, metric: Metric, sourceCity: EditableSourceCity): string {
  return `${date}-source-${sourceCityCode(sourceCity)}-${sourceKey(source)}-${metric}`;
}

function sourceDailyUpdate(date: string, source: string, metric: Metric, fact: number, sourceCity: EditableSourceCity): DailyValueUpdate {
  return {
    id: sourceRecordId(date, source, metric, sourceCity),
    date,
    city: sourceRecordCity,
    channel: source,
    metric,
    plan: 0,
    fact,
    forecast: 0,
    recommendations: 0,
    omQualified: 0,
    comment: sourceCityComment(sourceCity),
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
    const recordMap = new Map(snapshot.records.map((record) => [dailyRecordLookupKey(record), record]));
    const allSaved = importantValues.every((value) => {
      const record = recordMap.get(dailyValueLookupKey(value));
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
  const byKey = new Map(current.map((record) => [dailyRecordLookupKey(record), record]));

  values.forEach((value) => {
    const key = dailyValueLookupKey(value);
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

function dailyRecordLookupKey(record: DailyRecord): string {
  const baseKey = dailyRecordKey(record.date, record.city, record.metric, record.channel);
  if (record.city === sourceRecordCity && isSourceValueRecord(record)) {
    return `${baseKey}-${getSourceRecordCityScope(record) ?? "all"}`;
  }
  return baseKey;
}

function dailyValueLookupKey(value: DailyValueUpdate): string {
  const baseKey = dailyRecordKey(value.date, value.city, value.metric, value.channel);
  if (value.city === sourceRecordCity && value.channel && !value.channel.startsWith(sourceMetaChannelPrefix)) {
    return `${baseKey}-${getSourceRecordCityScope(value) ?? "all"}`;
  }
  return baseKey;
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

function formatCompactDecimal(value: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(value);
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
