import { ChevronDown, ExternalLink, RefreshCw, TriangleAlert } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { loadDemandOutcomes, refreshDemandOutcomes, type DemandOutcomeSnapshot } from "../../api/demandOutcomesApi";
import type { WordstatDemandRecord } from "../../api/wordstatApi";
import { buildDemandComparison, moscowCurrentMonth, preserveDemandOutcomeSources, type Correlation, type DemandComparisonCity, type DemandComparisonMode } from "../../lib/demandComparison";
import { MONTH_LABELS } from "../../lib/wordstatDemand";
import "./demandComparison.css";

type Props = { demandRecords: WordstatDemandRecord[]; writePassword: string; canRefresh: boolean };
type ChartConfiguration = {
  id: string; title: string; summary: string; height: number;
  spec: { type: "line"; x: string; y: [string, ...string[]]; xScale: "category"; xOrder: string[]; yLabel: string; startAtZero: boolean; showLegend: boolean; colors: Record<string, string>; valueFormat: { style: "percent" | "decimal"; maximumFractionDigits: number } };
  rows: { month: string; "Спрос": number | null; "Продажи": number | null; "Сливы": number | null }[];
};
type ChartElement = HTMLElement & { config: ChartConfiguration | null };
const CHART_MODULE = "https://persistent.oaistatic.com/plugins/visualize/charts/data-analytics-plugin/1.2.1/charts/element.js";
const numberFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });
const countFormat = new Intl.NumberFormat("ru-RU");
const percentFormat = new Intl.NumberFormat("ru-RU", { style: "percent", maximumFractionDigits: 1, signDisplay: "exceptZero" });
const MONTH_NAMES = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const WORDSTAT_URL = "https://docs.google.com/spreadsheets/d/1lBIgNVVyg7fT7j_rjVybfxUMBZ74NiuWDfPm3BZsIAY/edit";

function count(value: number | null) { return value === null ? "—" : countFormat.format(value); }
function percent(value: number | null) { return value === null ? "—" : percentFormat.format(value); }
function decimal(value: number | null) { return value === null ? "—" : numberFormat.format(value); }
function monthName(value: string) { return `${MONTH_LABELS[Number(value.slice(5)) - 1] ?? value} ${value.slice(0, 4)}`; }
function correlationText(value: Correlation) { return `r = ${value.r === null ? "не рассчитан" : value.r.toFixed(2).replace(".", ",")} · месяцев: ${value.n}`; }
function dateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "" : new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

function ComparisonChart({ config }: { config: ChartConfiguration }) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let element: ChartElement | undefined;
    setError("");
    import(/* @vite-ignore */ CHART_MODULE).then((module: { mountChart: (target: HTMLElement, configuration: ChartConfiguration) => ChartElement }) => {
      if (!active || !container.current) return;
      element = module.mountChart(container.current, config);
    }).catch(() => { if (active) setError("График не загрузился. Все значения доступны в таблице ниже; попробуйте обновить страницу."); });
    return () => { active = false; element?.remove(); };
  }, [config]);
  return <div className="demand-comparison-chart-frame"><div ref={container} className="demand-comparison-chart" aria-label={config.summary} />{error && <p role="alert" className="demand-comparison-chart-error">{error}</p>}</div>;
}

export default function DemandComparison({ demandRecords, writePassword, canRefresh }: Props) {
  const [snapshot, setSnapshot] = useState<DemandOutcomeSnapshot | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [city, setCity] = useState<DemandComparisonCity>("Все");
  const [requestedYear, setRequestedYear] = useState<number | null>(null);
  const [mode, setMode] = useState<DemandComparisonMode>("yoy");
  const requestId = useRef(0);
  const cityId = useId();
  const yearId = useId();
  const modeId = useId();
  const tableHelpId = useId();
  const currentYear = Number(moscowCurrentMonth().slice(0, 4));

  useEffect(() => {
    let active = true;
    const id = ++requestId.current;
    loadDemandOutcomes().then((result) => { if (active && id === requestId.current) setSnapshot((previous) => preserveDemandOutcomeSources(previous, result)); }).catch((reason: unknown) => {
      if (active && id === requestId.current) setError(reason instanceof Error ? reason.message : "Не удалось прочитать таблицы продаж и сливов.");
    }).finally(() => { if (active && id === requestId.current) setBusy(false); });
    return () => { active = false; requestId.current += 1; };
  }, []);

  const outcomeRecords = snapshot?.records ?? [];
  const years = useMemo(() => [...new Set([...demandRecords, ...outcomeRecords].map((row) => Number(row.month.slice(0, 4))).filter((year) => Number.isInteger(year) && year > 0 && year <= currentYear))].sort((a, b) => b - a), [demandRecords, outcomeRecords, currentYear]);
  const year = requestedYear ?? (years.includes(currentYear) ? currentYear : years[0] ?? currentYear);
  const comparison = useMemo(() => buildDemandComparison(demandRecords, outcomeRecords, { city, year, mode }), [demandRecords, outcomeRecords, city, year, mode]);
  const summary = comparison.salesSummary;
  const lossRows = comparison.months.filter((row) => row.losses !== null);
  const lossCount = lossRows.length ? lossRows.reduce((sum, row) => sum + (row.losses as number), 0) : null;
  const sourceWarnings = [...new Set([...(snapshot?.warnings ?? []), ...(snapshot?.sources.flatMap((source) => source.warnings) ?? [])])];
  const apiError = error || (snapshot?.status === "error" ? "Таблицы продаж и сливов сейчас недоступны." : "");
  const hasChartData = comparison.months.some((row) => row.plotDemand !== null || row.plotSales !== null || row.plotLosses !== null);
  const hasLossYoY = comparison.months.some((row) => row.lossesYoY !== null);
  const config = useMemo<ChartConfiguration>(() => ({
    id: "demand-sales-losses", title: mode === "yoy" ? `${year} к ${year - 1}: спрос, продажи и сливы` : `${year}: динамика спроса, продаж и сливов`,
    summary: `${city === "Все" ? "Москва и Санкт-Петербург" : city === "СПБ" ? "Санкт-Петербург" : "Москва"}. ${mode === "yoy" ? "Помесячное изменение к тому же месяцу прошлого года" : "Индекс от первого общего месяца"}. Продажи и сливы показаны отдельно. Пропуски не заменяются нулями.`,
    height: 300,
    spec: { type: "line", x: "month", y: ["Спрос", "Продажи", "Сливы"], xScale: "category", xOrder: MONTH_LABELS, yLabel: mode === "yoy" ? "Изменение к прошлому году" : "Индекс, базовый месяц = 100", startAtZero: false, showLegend: false, colors: { "Спрос": "#1c46f5", "Продажи": "#087b79", "Сливы": "#8645b0" }, valueFormat: { style: mode === "yoy" ? "percent" : "decimal", maximumFractionDigits: 1 } },
    rows: comparison.months.map((row) => ({ month: row.label, "Спрос": row.plotDemand, "Продажи": row.plotSales, "Сливы": row.plotLosses })),
  }), [comparison, city, year, mode]);

  async function reload(refresh: boolean) {
    if (busy || (refresh && !canRefresh)) return;
    const id = ++requestId.current;
    setBusy(true);
    setError("");
    try {
      const result = await (refresh ? refreshDemandOutcomes(writePassword) : loadDemandOutcomes());
      if (id !== requestId.current) return;
      setSnapshot((previous) => preserveDemandOutcomeSources(previous, result));
    } catch (reason: unknown) {
      if (id === requestId.current) setError(`${reason instanceof Error ? reason.message : "Не удалось обновить таблицы."}${snapshot?.records.length ? " Показаны последние успешно загруженные данные." : ""}`);
    } finally { if (id === requestId.current) setBusy(false); }
  }

  return <div className="demand-comparison" aria-busy={busy}>
    <section className="demand-panel demand-comparison-controls" aria-label="Настройки сравнения спроса">
      <div className="demand-comparison-intro"><h2>Спрос, продажи и сливы</h2><p>Сравните изменение спроса с каждым результатом отдельно.</p></div>
      <div className="demand-comparison-fields">
        <label htmlFor={cityId}>Город<select id={cityId} value={city} onChange={(event) => setCity(event.target.value as DemandComparisonCity)}><option value="Все">Москва + СПб</option><option value="МСК">Москва</option><option value="СПБ">Санкт-Петербург</option></select></label>
        <label htmlFor={yearId}>Год<select id={yearId} value={year} onChange={(event) => setRequestedYear(Number(event.target.value))}>{(years.length ? years : [currentYear]).map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label htmlFor={modeId}>Сравнение<select id={modeId} value={mode} onChange={(event) => setMode(event.target.value as DemandComparisonMode)}><option value="yoy">Год к году</option><option value="index">Динамика года</option></select></label>
        <button className="select-button demand-comparison-refresh" type="button" disabled={busy} onClick={() => void reload(canRefresh)}><RefreshCw size={15} aria-hidden="true" />{busy ? "Загрузка…" : canRefresh ? "Обновить таблицы" : "Перечитать данные"}</button>
      </div>
    </section>

    {snapshot && <ul className="demand-comparison-source-status" aria-label="Состояние источников">{snapshot.sources.map((source) => <li key={source.key}><strong>{source.key === "sales" ? "Продажи" : "Сливы"}:</strong> {source.status === "cached" ? "последняя успешная выгрузка" : source.status === "error" ? "источник недоступен" : "данные из таблицы"}{source.fromMonth && source.toMonth ? ` · ${monthName(source.fromMonth)} — ${monthName(source.toMonth)}` : ""}{source.readAt && ` · ${dateTime(source.readAt)} МСК`}</li>)}</ul>}

    {(apiError || sourceWarnings.length > 0) && <div className={`demand-feedback${apiError ? " demand-feedback-error" : ""}`} role={apiError ? "alert" : "status"}><TriangleAlert size={17} aria-hidden="true" /><div>{apiError && <p>{apiError}</p>}{sourceWarnings.map((warning) => <p key={warning}>{warning}</p>)}</div></div>}

    <section className="demand-panel" aria-label="Сравнение динамики">
      <div className="demand-comparison-heading"><h3>{mode === "yoy" ? `${year} к ${year - 1}` : `Динамика ${year} года`}</h3><p>{mode === "yoy" ? "Тот же календарный месяц прошлого года = 0% изменения." : comparison.indexBaseMonth ? `${monthName(comparison.indexBaseMonth)} = 100 для всех доступных линий.` : "Нужен общий месяц со спросом и результатами больше нуля, чтобы задать базу 100."} Только завершённые месяцы по МСК.</p></div>
      <div className="demand-comparison-legend" aria-label="Линии графика"><span className="demand-comparison-demand">Спрос · Wordstat</span><span className="demand-comparison-sales">Продажи · договоры</span><span className="demand-comparison-losses">Сливы · сводка</span></div>
      {hasChartData ? <ComparisonChart config={config} /> : <div className="demand-comparison-empty" role="status"><strong>{busy ? "Читаем месячную историю…" : "Нет сопоставимых значений для графика"}</strong><p>{mode === "yoy" ? "Проверьте другой год или выберите «Динамика года», чтобы увидеть доступную историю без сравнения с прошлым годом." : "В таблице ниже показана вся доступная история выбранного года."}</p></div>}
      <div className="demand-comparison-correlations"><p><strong>Спрос ↔ продажи</strong><span>{correlationText(comparison.correlations.sales)}</span></p><p><strong>Спрос ↔ сливы</strong><span>{city === "Все" ? correlationText(comparison.correlations.losses) : "Сливы доступны только для Москвы + СПб"}</span></p></div>
      <p className="demand-comparison-method-note">r Пирсона рассчитан по совпавшим точкам графика, без сдвига по времени. Нужно минимум 3 месяца и меняющиеся значения. Совпадение динамики не доказывает причинную связь.</p>
      {city === "Все" && lossRows.length > 0 && mode === "yoy" && !hasLossYoY && <p className="demand-comparison-history-note">У сливов пока нет совпавших месяцев прошлого года. Доступные значения сохранены в таблице. <button type="button" onClick={() => setMode("index")}>Посмотреть динамику года</button></p>}
      {city !== "Все" && <p className="demand-comparison-history-note">В исходной сводке сливы объединяют Москву и СПб. Они не распределяются по городам.</p>}
    </section>

    <section className="demand-panel" aria-label="Результат на сопоставимых месяцах">
      <div className="demand-comparison-heading"><h3>Продажи с поправкой на спрос</h3><p>{summary.months.length ? `Общие месяцы ${year} и ${year - 1}: ${summary.months.map((month) => MONTH_LABELS[Number(month.slice(5)) - 1]).join(", ")}.` : "Для модели нужны спрос и продажи за одинаковые месяцы двух лет."}</p></div>
      <dl className="demand-comparison-summary"><div><dt>Спрос на тех же месяцах</dt><dd>{percent(summary.demandYoY)}</dd><small>{count(summary.demandPrevious)} → {count(summary.demandCurrent)} запросов</small></div><div><dt>Продажи на тех же месяцах</dt><dd>{percent(summary.outcomeYoY)}</dd><small>{count(summary.outcomePrevious)} → {count(summary.outcomeCurrent)} договоров</small></div><div><dt>Модель при изменении спроса</dt><dd>{decimal(summary.expected)}</dd><small>Факт − модель: {decimal(summary.gap)} договора</small></div></dl>
      <p className="demand-comparison-method-note">Модель = продажи {year - 1} × спрос {year} / спрос {year - 1} на общем наборе месяцев. Это ориентир при прежнем соотношении спроса и продаж, а не план или прогноз. Изменение за период считается по суммам, без усреднения месячных процентов.</p>
      <p className="demand-comparison-loss-total"><strong>Сливы {year}: {count(lossCount)}</strong><span>{city !== "Все" ? "Только в сводке двух городов." : lossRows.length ? `${lossRows.map((row) => row.label).join(", ")}. Отдельный показатель; с продажами не складывается.` : "За выбранный год данных нет."}</span></p>
    </section>

    <section className="demand-panel demand-comparison-data" aria-label="Месячные значения и источники">
      <div className="demand-comparison-heading"><h3>Помесячно</h3><p id={tableHelpId}>Спрос — запросы «автошкола», продажи — количество договоров, сливы — количество из сводки. «—» означает отсутствие данных, а 0 — подтверждённый ноль.</p></div>
      <div className="demand-data-scroll demand-comparison-table" role="region" aria-label="Помесячные данные; таблицу можно прокручивать по горизонтали" aria-describedby={tableHelpId} tabIndex={0}><table><caption>{city === "Все" ? "Москва + Санкт-Петербург" : city === "МСК" ? "Москва" : "Санкт-Петербург"} · {year} и {year - 1}. Продажи и сливы показаны отдельно.</caption><thead><tr><th scope="col">Месяц</th><th scope="col">Спрос {year - 1}</th><th scope="col">Спрос {year}</th><th scope="col">Δ спроса</th><th scope="col">Продажи {year - 1}</th><th scope="col">Продажи {year}</th><th scope="col">Δ продаж</th><th scope="col">Модель продаж</th><th scope="col">Факт − модель</th><th scope="col">Сливы {year - 1}</th><th scope="col">Сливы {year}</th><th scope="col">Δ сливов</th></tr></thead><tbody>{comparison.months.map((row, index) => <tr key={row.month} className={row.complete ? "" : "demand-comparison-incomplete"}><th scope="row">{MONTH_NAMES[index]}{!row.complete && <small>Месяц не завершён</small>}</th><td>{count(row.previousDemand)}</td><td>{count(row.demand)}</td><td>{percent(row.demandYoY)}</td><td>{count(row.previousSales)}</td><td>{count(row.sales)}</td><td>{percent(row.salesYoY)}</td><td>{decimal(row.expectedSales)}</td><td>{decimal(row.salesGap)}</td><td>{count(row.previousLosses)}</td><td>{count(row.losses)}</td><td>{percent(row.lossesYoY)}</td></tr>)}</tbody></table></div>
      <details className="demand-comparison-provenance"><summary>Источники и правила расчёта<ChevronDown size={15} aria-hidden="true" /></summary><ul><li><a href={WORDSTAT_URL} target="_blank" rel="noreferrer">Wordstat · история спроса<ExternalLink size={12} aria-hidden="true" /></a><p>Месячная частотность запроса «автошкола». Для двух городов нужны оба значения за месяц; последние 30 дней вместо месяца не используются.</p></li>{snapshot?.sources.map((source) => <li key={source.key}><a href={source.url} target="_blank" rel="noreferrer">{source.key === "sales" ? "Продажи" : "Сливы"} · {source.sheetName}<ExternalLink size={12} aria-hidden="true" /></a><p>{source.fromMonth && source.toMonth ? `${monthName(source.fromMonth)} — ${monthName(source.toMonth)}. ` : ""}{source.status === "cached" ? "Последняя успешная выгрузка. " : source.status === "error" ? "Источник недоступен. " : ""}{source.readAt && `Прочитано ${dateTime(source.readAt)} МСК.`}</p></li>)}</ul><p>Продажи берутся целиком из листа «Договоры» предоставленной таблицы. Сливы — из отдельной сводки Москвы и СПб. Вычеты из лидов, показатели amoCRM и оплаты ПС здесь не применяются. Эти источники описывают разные совокупности: продажи и сливы не складываются. Проценты год к году не рассчитываются при отсутствии или нулевом значении прошлого года.</p></details>
    </section>
  </div>;
}
