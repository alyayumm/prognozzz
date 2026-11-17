import { ChevronDown, ExternalLink, RefreshCw, TriangleAlert } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { loadDemandOutcomes, refreshDemandOutcomes, type DemandOutcomeSnapshot } from "../../api/demandOutcomesApi";
import type { WordstatDemandRecord } from "../../api/wordstatApi";
import { buildDemandComparison, buildDemandComparisonAnnualSummary, moscowCurrentMonth, preserveDemandOutcomeSources, type Correlation, type DemandComparisonCity, type DemandComparisonMode } from "../../lib/demandComparison";
import { MONTH_LABELS } from "../../lib/wordstatDemand";
import DemandDynamics from "./DemandDynamics";
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
const EXAM_GROUPS_URL = "https://docs.google.com/spreadsheets/d/1ZPbHfKN6smZKKRqPa-pqjYqf1U9pzUi1YLYhy_5wsnQ/edit?gid=522389953";

function sourceLabel(key: string) { return key === "sales" ? "Продажи" : key === "examGroups" ? "Группы ГИБДД · практика" : "Сливы"; }

function count(value: number | null) { return value === null ? "—" : countFormat.format(value); }
function percent(value: number | null) { return value === null ? "—" : percentFormat.format(value); }
function decimal(value: number | null) { return value === null ? "—" : numberFormat.format(value); }
function monthName(value: string) { return `${MONTH_LABELS[Number(value.slice(5)) - 1] ?? value} ${value.slice(0, 4)}`; }
function coverageText(coverage: { fromMonth: string; toMonth: string }) { return coverage.fromMonth && coverage.toMonth ? `${monthName(coverage.fromMonth)} — ${monthName(coverage.toMonth)}` : "нет данных"; }
function correlationText(value: Correlation) { return `r = ${value.r === null ? "не рассчитан" : value.r.toFixed(2).replace(".", ",")} · месяцев: ${value.n}`; }
function dateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "" : new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

function AnnualMeanCell({ value, months, paired = false }: { value: number | null; months: number; paired?: boolean }) {
  return <td>{paired ? percent(value) : decimal(value)}{months > 0 && <small>{months} {paired ? "общ. мес." : "мес."}</small>}</td>;
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
  const [showComparison, setShowComparison] = useState(false);
  const requestId = useRef(0);
  const cityId = useId();
  const yearId = useId();
  const modeId = useId();
  const tableHelpId = useId();
  const annualHelpId = useId();
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
  const annual = useMemo(() => buildDemandComparisonAnnualSummary(comparison.months), [comparison]);
  const summary = comparison.salesSummary;
  const lossRows = comparison.months.filter((row) => row.losses !== null);
  const lossCount = lossRows.length ? lossRows.reduce((sum, row) => sum + (row.losses as number), 0) : null;
  const showExamGroups = city === "СПБ";
  const visibleSources = snapshot?.sources.filter((source) => showExamGroups || source.key !== "examGroups") ?? [];
  const hasExamGroupSource = snapshot?.sources.some((source) => source.key === "examGroups") ?? false;
  const cityName = city === "МСК" ? "Москва" : city === "СПБ" ? "Санкт-Петербург" : "Москва + СПб";
  const hiddenWarnings = new Set(snapshot?.sources.filter((source) => !showExamGroups && source.key === "examGroups").flatMap((source) => source.warnings) ?? []);
  const sourceWarnings = [...new Set([...(snapshot?.warnings ?? []).filter((warning) => !hiddenWarnings.has(warning)), ...visibleSources.flatMap((source) => source.warnings)])];
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
      <div className="demand-comparison-intro"><h2>Количество и отношение к спросу</h2><p>Выберите город, показатель и годы. Спрос, продажи и сливы остаются отдельными величинами.{showExamGroups && " Для СПб доступны заявленные группы ГИБДД на практику."}</p></div>
      <div className="demand-comparison-fields">
        <label htmlFor={cityId}>Город<select id={cityId} value={city} onChange={(event) => setCity(event.target.value as DemandComparisonCity)}><option value="Все">Москва + СПб</option><option value="МСК">Москва</option><option value="СПБ">Санкт-Петербург</option></select></label>
        <button className="select-button demand-comparison-refresh" type="button" disabled={busy} onClick={() => void reload(canRefresh)}><RefreshCw size={15} aria-hidden="true" />{busy ? "Загрузка…" : canRefresh ? "Обновить таблицы" : "Перечитать данные"}</button>
      </div>
    </section>

    {snapshot && <ul className="demand-comparison-source-status" aria-label="Состояние источников">{visibleSources.map((source) => <li key={source.key}><strong>{sourceLabel(source.key)}:</strong> {source.status === "cached" ? "последняя успешная выгрузка" : source.status === "error" ? "источник недоступен" : "данные из таблицы"}{source.fromMonth && source.toMonth ? ` · ${source.key === "losses" ? "общая сводка: " : source.key === "examGroups" ? "доступные месяцы с разрывами: " : ""}${monthName(source.fromMonth)} — ${monthName(source.toMonth)}` : ""}{source.breakdown && ` · города: ${coverageText(source.breakdown)}`}{source.readAt && ` · ${dateTime(source.readAt)} МСК`}</li>)}{showExamGroups && !hasExamGroupSource && <li>Данные групп ГИБДД пока не загружены.</li>}</ul>}

    {(apiError || sourceWarnings.length > 0) && <div className={`demand-feedback${apiError ? " demand-feedback-error" : ""}`} role={apiError ? "alert" : "status"}><TriangleAlert size={17} aria-hidden="true" /><div>{apiError && <p>{apiError}</p>}{sourceWarnings.map((warning) => <p key={warning}>{warning}</p>)}</div></div>}

    <DemandDynamics demandRecords={demandRecords} outcomeRecords={outcomeRecords} city={city} />

    <details className="demand-comparison-additional" onToggle={(event) => setShowComparison(event.currentTarget.open)}>
      <summary>Сверка год к году и помесячные данные<ChevronDown size={16} aria-hidden="true" /></summary>
      {showComparison && <div className="demand-comparison-additional-content">
        <div className="demand-comparison-fields">
          <label htmlFor={yearId}>Год для сверки<select id={yearId} value={year} onChange={(event) => setRequestedYear(Number(event.target.value))}>{(years.length ? years : [currentYear]).map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label htmlFor={modeId}>Способ сверки<select id={modeId} value={mode} onChange={(event) => setMode(event.target.value as DemandComparisonMode)}><option value="yoy">Год к году</option><option value="index">Индекс от базового месяца</option></select></label>
        </div>
    <section className="demand-panel" aria-label="Сравнение динамики">
      <div className="demand-comparison-heading"><h3>{mode === "yoy" ? `${year} к ${year - 1}` : `Динамика ${year} года`}</h3><p>{mode === "yoy" ? "Тот же календарный месяц прошлого года = 0% изменения." : comparison.indexBaseMonth ? `${monthName(comparison.indexBaseMonth)} = 100 для всех доступных линий.` : "Нужен общий месяц со спросом и результатами больше нуля, чтобы задать базу 100."} Только завершённые месяцы по МСК.</p></div>
      <div className="demand-comparison-legend" aria-label="Линии графика"><span className="demand-comparison-demand">Спрос · Wordstat</span><span className="demand-comparison-sales">Продажи · договоры</span><span className="demand-comparison-losses">Сливы · {city === "Все" ? "сводка" : "город"}</span></div>
      {hasChartData ? <ComparisonChart config={config} /> : <div className="demand-comparison-empty" role="status"><strong>{busy ? "Читаем месячную историю…" : "Нет сопоставимых значений для графика"}</strong><p>{mode === "yoy" ? "Проверьте другой год или выберите «Динамика года», чтобы увидеть доступную историю без сравнения с прошлым годом." : "В таблице ниже показана вся доступная история выбранного года."}</p></div>}
      <div className="demand-comparison-correlations"><p><strong>Спрос ↔ продажи</strong><span>{correlationText(comparison.correlations.sales)}</span></p><p><strong>Спрос ↔ сливы</strong><span>{correlationText(comparison.correlations.losses)}</span></p></div>
      <p className="demand-comparison-method-note">r Пирсона рассчитан по совпавшим точкам графика, без сдвига по времени. Нужно минимум 3 месяца и меняющиеся значения. Совпадение динамики не доказывает причинную связь.</p>
      {lossRows.length > 0 && mode === "yoy" && !hasLossYoY && <p className="demand-comparison-history-note">У сливов пока нет совпавших месяцев прошлого года. Доступные значения сохранены в таблице. <button type="button" onClick={() => setMode("index")}>Посмотреть динамику года</button></p>}
      {city !== "Все" && <p className="demand-comparison-history-note">Сливы · {cityName}: {coverageText(comparison.lossCoverage.selected)}. Общая сводка Москвы и СПб: {coverageText(comparison.lossCoverage.all)}. {comparison.lossCoverage.selected.months.length ? "Пропуски городской разбивки остаются без значения." : "Городская разбивка пока не загружена; общая сводка не распределяется между городами."}</p>}
    </section>

    <section className="demand-panel" aria-label="Результат на сопоставимых месяцах">
      <div className="demand-comparison-heading"><h3>Продажи с поправкой на спрос</h3><p>{summary.months.length ? `Общие месяцы ${year} и ${year - 1}: ${summary.months.map((month) => MONTH_LABELS[Number(month.slice(5)) - 1]).join(", ")}.` : "Для модели нужны спрос и продажи за одинаковые месяцы двух лет."}</p></div>
      <dl className="demand-comparison-summary"><div><dt>Спрос на тех же месяцах</dt><dd>{percent(summary.demandYoY)}</dd><small>{count(summary.demandPrevious)} → {count(summary.demandCurrent)} запросов</small></div><div><dt>Продажи на тех же месяцах</dt><dd>{percent(summary.outcomeYoY)}</dd><small>{count(summary.outcomePrevious)} → {count(summary.outcomeCurrent)} договоров</small></div><div><dt>Модель при изменении спроса</dt><dd>{decimal(summary.expected)}</dd><small>Факт − модель: {decimal(summary.gap)} договора</small></div></dl>
      <p className="demand-comparison-method-note">Модель = продажи {year - 1} × спрос {year} / спрос {year - 1} на общем наборе месяцев. Это ориентир при прежнем соотношении спроса и продаж, а не план или прогноз. Изменение за период считается по суммам, без усреднения месячных процентов.</p>
      <p className="demand-comparison-loss-total"><strong>Сливы {year}: {count(lossCount)}</strong><span>{lossRows.length ? `${cityName} · ${lossRows.map((row) => row.label).join(", ")}. Отдельный показатель; с продажами не складывается.` : `За выбранный год ${city === "Все" ? "" : "городских "}данных нет.`}</span></p>
    </section>

    <section className="demand-panel demand-comparison-data" aria-label="Месячные значения и источники">
      <div className="demand-comparison-heading"><h3>Помесячно</h3><p id={tableHelpId}>Спрос — запросы «автошкола», продажи — количество договоров, сливы — количество из сводки.{showExamGroups && " Группы ГИБДД — заявленные группы категории B на практику, а не количество учеников."} «—» означает отсутствие данных, а 0 — подтверждённый ноль.</p></div>
      <div className={`demand-data-scroll demand-comparison-table${showExamGroups ? " demand-comparison-table-with-exam-groups" : ""}`} role="region" aria-label="Помесячные данные; таблицу можно прокручивать по горизонтали" aria-describedby={`${tableHelpId} ${annualHelpId}`} tabIndex={0}>
        <table>
          <caption>{city === "Все" ? "Москва + Санкт-Петербург" : city === "МСК" ? "Москва" : "Санкт-Петербург"} · {year} и {year - 1}. Продажи и сливы показаны отдельно.</caption>
          <thead><tr><th scope="col">Месяц</th><th scope="col">Спрос {year - 1}</th><th scope="col">Спрос {year}</th><th scope="col">Δ спроса</th><th scope="col">Продажи {year - 1}</th><th scope="col">Продажи {year}</th><th scope="col">Δ продаж</th><th scope="col">Модель продаж</th><th scope="col">Факт − модель</th><th scope="col">Сливы {year - 1}</th><th scope="col">Сливы {year}</th><th scope="col">Δ сливов</th>{showExamGroups && <><th scope="col">Группы ГИБДД {year - 1}</th><th scope="col">Группы ГИБДД {year}</th><th scope="col">Δ групп</th></>}</tr></thead>
          <tbody>{comparison.months.map((row, index) => <tr key={row.month} className={row.complete ? "" : "demand-comparison-incomplete"}><th scope="row">{MONTH_NAMES[index]}{!row.complete && <small>Месяц не завершён</small>}</th><td>{count(row.previousDemand)}</td><td>{count(row.demand)}</td><td>{percent(row.demandYoY)}</td><td>{count(row.previousSales)}</td><td>{count(row.sales)}</td><td>{percent(row.salesYoY)}</td><td>{decimal(row.expectedSales)}</td><td>{decimal(row.salesGap)}</td><td>{count(row.previousLosses)}</td><td>{count(row.losses)}</td><td>{percent(row.lossesYoY)}</td>{showExamGroups && <><td>{count(row.previousExamGroups)}</td><td>{count(row.examGroups)}</td><td>{percent(row.examGroupsYoY)}</td></>}</tr>)}</tbody>
          <tfoot className="demand-comparison-annual">
            <tr>
              <th scope="row">Среднее за месяц<small>По месяцам с данными</small></th>
              <AnnualMeanCell value={annual.previousDemand.average} months={annual.previousDemand.months} />
              <AnnualMeanCell value={annual.demand.average} months={annual.demand.months} />
              <AnnualMeanCell value={annual.demandYoY.value} months={annual.demandYoY.months} paired />
              <AnnualMeanCell value={annual.previousSales.average} months={annual.previousSales.months} />
              <AnnualMeanCell value={annual.sales.average} months={annual.sales.months} />
              <AnnualMeanCell value={annual.salesYoY.value} months={annual.salesYoY.months} paired />
              <AnnualMeanCell value={annual.expectedSales.average} months={annual.expectedSales.months} />
              <AnnualMeanCell value={annual.salesGap.average} months={annual.salesGap.months} />
              <AnnualMeanCell value={annual.previousLosses.average} months={annual.previousLosses.months} />
              <AnnualMeanCell value={annual.losses.average} months={annual.losses.months} />
              <AnnualMeanCell value={annual.lossesYoY.value} months={annual.lossesYoY.months} paired />
              {showExamGroups && <>
                <AnnualMeanCell value={annual.previousExamGroups.average} months={annual.previousExamGroups.months} />
                <AnnualMeanCell value={annual.examGroups.average} months={annual.examGroups.months} />
                <AnnualMeanCell value={annual.examGroupsYoY.value} months={annual.examGroupsYoY.months} paired />
              </>}
            </tr>
          </tfoot>
        </table>
      </div>
      <p id={annualHelpId} className="demand-comparison-method-note">Среднее = сумма / число завершённых месяцев с данными; их количество указано под значением. Пропуски не входят в расчёт. Δ сравнивает средние на одинаковых месяцах двух лет. Модель и отклонение усредняются по своим доступным месяцам.</p>
      <details className="demand-comparison-provenance">
        <summary>Источники и правила расчёта<ChevronDown size={15} aria-hidden="true" /></summary>
        <ul>
          <li><a href={WORDSTAT_URL} target="_blank" rel="noreferrer">Wordstat · история спроса<ExternalLink size={12} aria-hidden="true" /></a><p>Месячная частотность запроса «автошкола». Для двух городов нужны оба значения за месяц; последние 30 дней вместо месяца не используются.</p></li>
          {visibleSources.map((source) => <li key={source.key}>
            <a href={source.url} target="_blank" rel="noreferrer">{source.key === "losses" ? "Сливы · общая сводка" : sourceLabel(source.key)} · {source.sheetName}<ExternalLink size={12} aria-hidden="true" /></a>
            <p>{source.fromMonth && source.toMonth ? `${monthName(source.fromMonth)} — ${monthName(source.toMonth)}. ` : ""}{source.status === "cached" ? "Последняя успешная выгрузка. " : source.status === "error" ? "Источник недоступен. " : ""}{source.readAt && `Прочитано ${dateTime(source.readAt)} МСК.`}</p>
            {source.key === "examGroups" && <p>Сумма групп категории B по автошколам листа «СВОД». Заявленные группы на практику показаны отдельным показателем СПб; это группы, а не ученики. Пропуски не заполнены, другие листы не подмешиваются.</p>}
            {source.breakdown && <><a href={source.breakdown.url} target="_blank" rel="noreferrer">Сливы · разбивка по городам · {source.breakdown.sheetName}<ExternalLink size={12} aria-hidden="true" /></a><p>{coverageText(source.breakdown)}. Значения каждого города берутся из его столбца.</p></>}
          </li>)}
          {showExamGroups && !hasExamGroupSource && <li><a href={EXAM_GROUPS_URL} target="_blank" rel="noreferrer">Группы ГИБДД · практика · СВОД<ExternalLink size={12} aria-hidden="true" /></a><p>Данные групп ГИБДД пока не загружены. Сумма групп категории B по автошколам листа «СВОД»; пропуски не заполнены.</p></li>}
        </ul>
        <p>Продажи берутся целиком из листа «Договоры» предоставленной таблицы. Сливы Москвы и СПб берутся из городской разбивки; значение «Москва + СПб» — из общей сводки. Если их суммы расходятся, разница не распределяется между городами. Вычеты из лидов, показатели amoCRM и оплаты ПС здесь не применяются. Эти источники описывают разные совокупности: продажи и сливы не складываются. Проценты год к году не рассчитываются при отсутствии или нулевом значении прошлого года.</p>
      </details>
    </section>
      </div>}
    </details>
  </div>;
}
