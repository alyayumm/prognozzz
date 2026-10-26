import { BarChart3, ChevronDown, ExternalLink, Info, RefreshCw, TriangleAlert } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import {
  loadWordstatDemand,
  refreshWordstatDemand,
  type WordstatDemandRecord,
  type WordstatDemandSnapshot,
} from "../../api/wordstatApi";
import { buildDemandYearSeries, MONTH_LABELS } from "../../lib/wordstatDemand";
import "./demand.css";

type DemandViewProps = { writePassword: string; canRefresh: boolean };
type DemandCity = WordstatDemandRecord["city"];
type DemandYearSeries = { year: number; values: (number | null)[] };
type ChartSize = { width: number; height: number };

const MONTH_NAMES = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const SERIES_COLORS = ["#1c46f5", "#087b79", "#8645b0", "#b15a0d", "#253c66", "#b3316e"];
const SERIES_DASHES = [undefined, "9 4", "3 4", "12 4 3 4", undefined, "6 4"];
const numberFormat = new Intl.NumberFormat("ru-RU");

function currentMoscowMonth(): string {
  const parts = new Intl.DateTimeFormat("en", { timeZone: "Europe/Moscow", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}`;
}

function formatMonth(month: string): string {
  const date = new Date(`${month}-01T12:00:00+03:00`);
  return Number.isNaN(date.valueOf()) ? month : new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric", timeZone: "Europe/Moscow" }).format(date).replace(" г.", "");
}

function formatSyncedAt(value: string): string {
  const date = new Date(value);
  return !value || Number.isNaN(date.valueOf()) ? "" : new Intl.DateTimeFormat("ru-RU", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow",
  }).format(date);
}

function chartMaximum(series: DemandYearSeries[]): number {
  const max = Math.max(0, ...series.flatMap((item) => item.values.filter((value): value is number => value !== null)));
  if (max === 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  const step = magnitude / 2;
  return Math.ceil(max / step) * step;
}

function seriesPaths(values: (number | null)[], size: ChartSize, max: number): string[] {
  const paths: string[] = [];
  let current: string[] = [];
  values.forEach((value, index) => {
    if (value === null) {
      if (current.length) paths.push(current.join(" "));
      current = [];
      return;
    }
    const x = (index + 0.5) * size.width / 12;
    const y = 12 + (1 - value / max) * (size.height - 24);
    current.push(`${current.length ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`);
  });
  if (current.length) paths.push(current.join(" "));
  return paths;
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Не удалось загрузить данные Wordstat. Попробуйте ещё раз.";
}

export default function DemandView({ writePassword, canRefresh }: DemandViewProps) {
  const [snapshot, setSnapshot] = useState<WordstatDemandSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [city, setCity] = useState<DemandCity>("МСК");
  const [hiddenYears, setHiddenYears] = useState<number[]>([]);
  const [activeMonth, setActiveMonth] = useState<number | null>(null);
  const [chartSize, setChartSize] = useState<ChartSize>({ width: 960, height: 280 });
  const requestId = useRef(0);
  const chartRef = useRef<HTMLDivElement>(null);
  const monthButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const chartId = useId();
  const feedbackId = useId();
  const refreshHelpId = useId();

  useEffect(() => {
    let active = true;
    const id = ++requestId.current;
    loadWordstatDemand().then((result) => {
      if (active && id === requestId.current) setSnapshot(result);
    }).catch((reason: unknown) => {
      if (active && id === requestId.current) setError(errorMessage(reason));
    }).finally(() => {
      if (active && id === requestId.current) setLoading(false);
    });
    return () => { active = false; requestId.current += 1; };
  }, []);

  useEffect(() => {
    const element = chartRef.current;
    if (!element) return;
    const update = () => {
      const bounds = element.getBoundingClientRect();
      if (bounds.width && bounds.height) setChartSize({ width: bounds.width, height: bounds.height });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const records = useMemo<WordstatDemandRecord[]>(() => {
    const currentMonth = currentMoscowMonth();
    return (snapshot?.records ?? []).filter((record) => record.month < currentMonth && Number.isFinite(record.count) && record.count >= 0);
  }, [snapshot]);
  const allSeries = useMemo(() => buildDemandYearSeries(records, city), [records, city]);
  const selectedSeries = allSeries.filter((series) => !hiddenYears.includes(series.year));
  const chartMax = chartMaximum(selectedSeries.length ? selectedSeries : allSeries);
  const hasData = allSeries.some((series) => series.values.some((value) => value !== null));
  const hasSelectedData = selectedSeries.some((series) => series.values.some((value) => value !== null));
  const busy = loading || refreshing;
  const configured = snapshot?.configured ?? false;
  const apiError = error || (snapshot?.status === "error" ? snapshot.connectionMessage : "");
  const latestMonth = records.reduce((latest, record) => record.city === city && record.month > latest ? record.month : latest, "");
  const lastSyncedAt = formatSyncedAt(snapshot?.lastSyncedAt ?? "");
  const refreshHelp = !configured ? "Обновление станет доступно после подключения Wordstat." : !canRefresh ? "Для обновления войдите с правами редактора отчёта." : "";
  const warnings = [...new Set(snapshot?.warnings ?? [])].filter((warning) => warning && warning !== apiError);

  async function fetchDemand(forceRefresh: boolean) {
    if (busy || (forceRefresh && (!configured || !canRefresh))) return;
    const id = ++requestId.current;
    setError("");
    if (forceRefresh) setRefreshing(true); else setLoading(true);
    try {
      const result = await (forceRefresh ? refreshWordstatDemand(writePassword) : loadWordstatDemand());
      if (id === requestId.current) setSnapshot(result);
    } catch (reason: unknown) {
      if (id === requestId.current) setError(errorMessage(reason));
    } finally {
      if (id === requestId.current) { setLoading(false); setRefreshing(false); }
    }
  }

  function moveMonth(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const nextIndex = event.key === "ArrowRight" ? (index + 1) % 12 : event.key === "ArrowLeft" ? (index + 11) % 12 : event.key === "Home" ? 0 : event.key === "End" ? 11 : null;
    if (nextIndex === null) return;
    event.preventDefault();
    setActiveMonth(nextIndex);
    monthButtons.current[nextIndex]?.focus();
  }

  function monthDescription(index: number): string {
    const values = selectedSeries.map((series) => `${series.year}: ${series.values[index] === null ? "нет данных" : `${numberFormat.format(series.values[index] as number)} запросов`}`).join("; ");
    return `${MONTH_NAMES[index]}. ${values || "Выберите год для сравнения"}.`;
  }

  return (
    <div className="demand-view" aria-busy={busy}>
      <section className="demand-panel demand-controls" aria-label="Настройки спроса">
        <div className="demand-control-copy">
          <strong>Поисковый спрос</strong>
          <span>Запрос «автошкола» · Яндекс Wordstat</span>
        </div>
        <div className="demand-city-toggle" aria-label="Город">
          {([ ["МСК", "Москва"], ["СПБ", "Санкт-Петербург"] ] as const).map(([value, label]) => (
            <button key={value} type="button" className={city === value ? "active" : ""} aria-pressed={city === value} onClick={() => { setCity(value); setActiveMonth(null); }}>{label}</button>
          ))}
        </div>
        <div className="demand-refresh-control">
          <button className="select-button demand-refresh-button" type="button" disabled={busy || !configured || !canRefresh} aria-describedby={refreshHelp ? refreshHelpId : undefined} title={refreshHelp || "Загрузить свежие данные Wordstat"} onClick={() => void fetchDemand(true)}>
            <RefreshCw size={16} aria-hidden="true" />{refreshing ? "Обновляем…" : loading ? "Загрузка…" : "Обновить из Wordstat"}
          </button>
          {refreshHelp ? <small id={refreshHelpId}>{refreshHelp}</small> : lastSyncedAt ? <small>Обновлено {lastSyncedAt} МСК</small> : null}
        </div>
      </section>

      {apiError && (
        <div className="demand-feedback demand-feedback-error" role="alert">
          <TriangleAlert size={18} aria-hidden="true" />
          <div><strong>Не удалось обновить спрос</strong><p>{apiError}{hasData ? " На графике сохранены последние загруженные данные." : ""}</p></div>
          <button type="button" className="select-button" disabled={busy} onClick={() => void fetchDemand(false)}>Повторить</button>
        </div>
      )}

      <section className="demand-panel demand-chart-panel" aria-labelledby={`${chartId}-heading`}>
        <div className="demand-chart-heading">
          <div><h2 id={`${chartId}-heading`}>Сезонность спроса · {city === "МСК" ? "Москва" : "Санкт-Петербург"}</h2><p>Месяцы всегда на своих местах. Каждый год — отдельная линия.</p></div>
          {latestMonth && <span className="demand-period-note">Данные по {formatMonth(latestMonth)}</span>}
        </div>

        {allSeries.length > 0 && (
          <div className="demand-years" aria-label="Годы на графике">
            {allSeries.map((series, index) => {
              const selected = !hiddenYears.includes(series.year);
              return (
                <button type="button" className={`demand-year${selected ? " selected" : ""}`} key={series.year} aria-pressed={selected} title={`${selected ? "Скрыть" : "Показать"} ${series.year} год`} style={{ "--demand-series-color": SERIES_COLORS[index % SERIES_COLORS.length] } as CSSProperties} onClick={() => setHiddenYears((years) => selected ? [...years, series.year] : years.filter((year) => year !== series.year))}>
                  <svg viewBox="0 0 28 8" width="28" height="8" aria-hidden="true"><line x1="0" y1="4" x2="28" y2="4" stroke="currentColor" strokeWidth="3" strokeDasharray={SERIES_DASHES[index % SERIES_DASHES.length]} /></svg><span>{series.year}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className={`demand-chart${loading && !hasData ? " is-loading" : ""}`}>
          <div className="demand-axis-title">Запросы</div>
          <div className="demand-y-axis" aria-hidden="true">
            {[1, 0.75, 0.5, 0.25, 0].map((ratio) => <span key={ratio}>{hasData ? numberFormat.format(Math.round(chartMax * ratio)) : ""}</span>)}
          </div>
          <div className="demand-plot" ref={chartRef}>
            <svg viewBox={`0 0 ${chartSize.width} ${chartSize.height}`} preserveAspectRatio="none" role="img" aria-labelledby={`${chartId}-title ${chartId}-description`}>
              <title id={`${chartId}-title`}>Помесячный спрос на автошколы: {city === "МСК" ? "Москва" : "Санкт-Петербург"}</title>
              <desc id={`${chartId}-description`}>{hasData ? "По горизонтали месяцы с января по декабрь, по вертикали количество поисковых запросов. Каждый год показан отдельной линией. Пропуски данных не соединяются. Точные значения доступны в таблице ниже." : "Данные пока не загружены. Ось месяцев зафиксирована с января по декабрь."}</desc>
              {[1, 0.75, 0.5, 0.25, 0].map((ratio) => <line className="demand-grid-line" key={ratio} x1="0" y1={12 + (1 - ratio) * (chartSize.height - 24)} x2={chartSize.width} y2={12 + (1 - ratio) * (chartSize.height - 24)} />)}
              {selectedSeries.map((series) => {
                const index = allSeries.findIndex((item) => item.year === series.year);
                const color = SERIES_COLORS[index % SERIES_COLORS.length];
                return <g key={series.year} fill="none" stroke={color} strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round">
                  {seriesPaths(series.values, chartSize, chartMax).map((path, segment) => <path key={segment} d={path} strokeDasharray={SERIES_DASHES[index % SERIES_DASHES.length]} />)}
                  {series.values.map((value, monthIndex) => value === null ? null : <circle key={monthIndex} cx={(monthIndex + 0.5) * chartSize.width / 12} cy={12 + (1 - value / chartMax) * (chartSize.height - 24)} r={activeMonth === monthIndex ? 4.5 : 2.2} fill={color} stroke="white" strokeWidth={activeMonth === monthIndex ? 1.5 : 0} />)}
                </g>;
              })}
              {activeMonth !== null && hasSelectedData && <line className="demand-active-guide" x1={(activeMonth + 0.5) * chartSize.width / 12} y1="0" x2={(activeMonth + 0.5) * chartSize.width / 12} y2={chartSize.height} />}
            </svg>
            {hasData && hasSelectedData && <div className="demand-month-targets" aria-label="Значения по месяцам" onMouseLeave={(event) => { if (!event.currentTarget.contains(document.activeElement)) setActiveMonth(null); }} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setActiveMonth(null); }}>
              {MONTH_LABELS.map((month, index) => <button type="button" key={month} data-demand-month={index} ref={(element) => { monthButtons.current[index] = element; }} aria-label={monthDescription(index)} aria-describedby={feedbackId} onMouseEnter={() => setActiveMonth(index)} onFocus={() => setActiveMonth(index)} onClick={() => setActiveMonth(index)} onKeyDown={(event) => moveMonth(event, index)} />)}
            </div>}
            {!hasData && <div className="demand-chart-empty" role="status">
              {loading ? <><div className="demand-skeleton demand-skeleton-title" /><div className="demand-skeleton demand-skeleton-copy" /><span className="demand-sr-only">Загружаем данные спроса</span></> : <>
                <BarChart3 size={26} aria-hidden="true" />
                <strong>{apiError ? "Данные спроса пока недоступны" : !configured ? "Подключите Wordstat, чтобы увидеть сезонность" : "Помесячные данные ещё не загружены"}</strong>
                <p>{apiError ? "Повторите загрузку. После успешного обновления здесь появится график." : !configured ? "Здесь появятся реальные данные по запросу «автошкола» для Москвы и Санкт-Петербурга." : "Нажмите «Обновить из Wordstat», чтобы загрузить историю спроса."}</p>
              </>}
            </div>}
            {hasData && !hasSelectedData && <div className="demand-chart-empty" role="status"><strong>Выберите год для сравнения</strong><p>Нажмите на год над графиком, чтобы показать его линию.</p></div>}
          </div>
          <div className="demand-month-labels" aria-hidden="true">{MONTH_LABELS.map((month) => <span key={month}>{month}</span>)}</div>
        </div>

        {hasData && <div className="demand-month-inspector" id={feedbackId} aria-live="polite" aria-atomic="true">
          {activeMonth === null ? <p>Наведите на месяц или выберите его на графике, чтобы сравнить годы. Клавиши ← и → переключают месяцы.</p> : <><strong>{MONTH_NAMES[activeMonth]}</strong><div>{selectedSeries.map((series) => {
            const index = allSeries.findIndex((item) => item.year === series.year);
            return <span key={series.year}><i style={{ backgroundColor: SERIES_COLORS[index % SERIES_COLORS.length] }} aria-hidden="true" />{series.year}<b>{series.values[activeMonth] === null ? "Нет данных" : numberFormat.format(series.values[activeMonth] as number)}</b></span>;
          })}</div></>}
        </div>}

        <p className="demand-source-note"><Info size={15} aria-hidden="true" /><span>Широкая частотность: запросы со словом «автошкола» и его словоформами. Это количество запросов, а не уникальных людей. Текущий месяц не включён; пропуски не заменяются нулями.</span></p>

        {hasData && <details className="demand-data-details"><summary>Показать данные по месяцам<ChevronDown size={16} aria-hidden="true" /></summary><div className="demand-data-scroll" role="region" aria-label="Таблица спроса по месяцам" tabIndex={0}>
          <table><caption>Количество запросов «автошкола» · {city === "МСК" ? "Москва" : "Санкт-Петербург"}</caption><thead><tr><th scope="col">Месяц</th>{allSeries.map((series) => <th scope="col" key={series.year}>{series.year}</th>)}</tr></thead><tbody>{MONTH_NAMES.map((month, index) => <tr key={month}><th scope="row">{month}</th>{allSeries.map((series) => <td key={series.year}>{series.values[index] === null ? <span aria-label="Нет данных">—</span> : numberFormat.format(series.values[index] as number)}</td>)}</tr>)}</tbody></table>
        </div><p>«—» означает, что данных за месяц нет. Ноль означает отсутствие запросов в загруженных данных.</p></details>}
      </section>

      {snapshot && !configured && snapshot.status !== "error" && <details className="demand-panel demand-connection-details" open={!records.length}>
        <summary><span>Как подключить Wordstat</span><ChevronDown size={18} aria-hidden="true" /></summary>
        <p>{snapshot?.connectionMessage || "Для автоматической загрузки нужен доступ к Wordstat через Яндекс Облако."}</p>
        <ol><li>Создайте платёжный аккаунт и каталог в Яндекс Облаке, подключите Search API.</li><li>Выдайте сервисному аккаунту доступ к Search API и создайте API-ключ.</li><li>Добавьте API-ключ и ID каталога в защищённые настройки Apps Script, затем нажмите «Проверить подключение».</li></ol>
        <div className="demand-connection-actions"><button type="button" className="select-button" disabled={busy} onClick={() => void fetchDemand(false)}><RefreshCw size={15} aria-hidden="true" />{loading ? "Проверяем…" : "Проверить подключение"}</button><a href="https://yandex.cloud/ru/docs/search-api/" target="_blank" rel="noreferrer">Инструкция Яндекс Облака<ExternalLink size={14} aria-hidden="true" /></a></div>
        <small>Ключ хранится на сервере. Вводить его в публичном интерфейсе отчёта не нужно.</small>
      </details>}

      {warnings.length > 0 && <div className="demand-feedback" role="status"><Info size={18} aria-hidden="true" /><div>{warnings.map((warning) => <p key={warning}>{warning}</p>)}</div></div>}
    </div>
  );
}
