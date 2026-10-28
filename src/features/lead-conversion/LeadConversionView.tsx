import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, Info, RefreshCw, TriangleAlert } from "lucide-react";
import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  loadLeadConversion,
  refreshLeadConversion,
  type LeadConversionSnapshot,
} from "../../api/leadConversionApi";
import {
  buildLeadConversionReport,
  LEAD_CONVERSION_VISIBLE_SOURCES,
  leadConversionRefreshRange,
  sortLeadConversionRows,
  type LeadConversionGroup,
  type LeadConversionScope,
  type LeadConversionSortDirection,
  type LeadConversionSortKey,
  type LeadConversionTotals,
} from "../../lib/leadConversion";
import "./lead-conversion.css";

type ContainerProps = {
  selectedMonthKey: string;
  selectedScope: LeadConversionScope;
  writePassword: string;
  canRefresh: boolean;
  todayIso: string;
};
type ViewProps = {
  snapshot: LeadConversionSnapshot | null;
  loading: boolean;
  refreshing: boolean;
  error: string;
  selectedMonthKey: string;
  selectedScope: LeadConversionScope;
  canRefresh: boolean;
  futureMonth: boolean;
  onRefresh: () => void;
  onRetry: () => void;
};
const countFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const percentFormat = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatCount = (value: number) => countFormat.format(value);
const formatRate = (value: number | null) => value === null ? "—" : `${percentFormat.format(value)}%`;
const formatDay = (date: string) => `${date.slice(8, 10)}.${date.slice(5, 7)}`;
const errorText = (error: unknown) => error instanceof Error ? error.message : "Не удалось загрузить конверсию. Повторите попытку.";

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  return !value || Number.isNaN(date.valueOf()) ? "" : new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(date);
}

export default function LeadConversionView({ selectedMonthKey, selectedScope, writePassword, canRefresh, todayIso }: ContainerProps) {
  const [snapshot, setSnapshot] = useState<LeadConversionSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef(0);
  const refreshRange = useMemo(() => leadConversionRefreshRange(selectedMonthKey, todayIso), [selectedMonthKey, todayIso]);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setRefreshing(false);
    setError("");
    try {
      const next = await loadLeadConversion(selectedMonthKey);
      if (requestId.current === id) setSnapshot(next);
    } catch (cause) {
      if (requestId.current === id) setError(errorText(cause));
    } finally {
      if (requestId.current === id) setLoading(false);
    }
  }, [selectedMonthKey]);

  useEffect(() => {
    setSnapshot(null);
    void load();
    return () => { requestId.current += 1; };
  }, [load]);

  async function refresh() {
    if (!canRefresh || !refreshRange || loading || refreshing) return;
    const id = ++requestId.current;
    setRefreshing(true);
    setError("");
    try {
      const next = await refreshLeadConversion(refreshRange.fromDate, refreshRange.toDate, writePassword);
      if (requestId.current === id) setSnapshot(next);
    } catch (cause) {
      if (requestId.current === id) setError(errorText(cause));
    } finally {
      if (requestId.current === id) setRefreshing(false);
    }
  }

  return <LeadConversionDashboard
    snapshot={snapshot}
    loading={loading}
    refreshing={refreshing}
    error={error}
    selectedMonthKey={selectedMonthKey}
    selectedScope={selectedScope}
    canRefresh={canRefresh && Boolean(refreshRange) && snapshot?.configured !== false}
    futureMonth={selectedMonthKey > todayIso.slice(0, 7)}
    onRefresh={() => void refresh()}
    onRetry={() => void load()}
  />;
}

export function LeadConversionDashboard({ snapshot, loading, refreshing, error, selectedMonthKey, selectedScope, canRefresh, futureMonth, onRefresh, onRetry }: ViewProps) {
  const [brand, setBrand] = useState("all");
  const [source, setSource] = useState("all");
  const report = useMemo(() => buildLeadConversionReport(snapshot?.records ?? [], { monthKey: selectedMonthKey, scope: selectedScope, brand, source, visibleSources: LEAD_CONVERSION_VISIBLE_SOURCES }), [snapshot, selectedMonthKey, selectedScope, brand, source]);
  const updatedAt = formatUpdatedAt(snapshot?.updatedAt ?? "");
  const warnings = [...(snapshot?.warnings ?? []), ...(report.invalidRows ? [`Не включено строк с некорректными датами или значениями: ${report.invalidRows}.`] : [])];
  const coverage = snapshot?.coverage;
  const hasKnownData = report.totals.recordCount > 0;
  const unknown = report.unknownCity;

  useEffect(() => {
    if (brand !== "all" && !report.options.brands.some((option) => option.value === brand)) setBrand("all");
    if (source !== "all" && !report.options.sources.some((option) => option.value === source)) setSource("all");
  }, [brand, source, report.options]);

  return (
    <div className="page-stack lead-conversion-view">
      <section className="analytics-panel lead-conversion-intro">
        <div>
          <span className="lead-conversion-eyebrow">Roistat · переходы и заявки</span>
          <h2>Какие переходы становятся лидами</h2>
          <p>Яндекс Карты, 2ГИС, Гугл Карты, Сайт и Директ. Все показатели рассчитаны по этим пяти источникам. Раскройте бренд, чтобы сравнить его источники. Конверсия = лиды / переходы × 100%.</p>
          <div className="lead-conversion-meta" aria-live="polite">
            <span>{selectedScope === "Все" ? "МСК + СПБ" : selectedScope}</span>
            <span>{loading ? "Читаю данные…" : coverage ? `Данные: ${formatDay(coverage.fromDate)}–${formatDay(coverage.toDate)}` : "Период ещё не загружен"}</span>
            {updatedAt && <span>Обновлено {updatedAt}</span>}
          </div>
        </div>
        <button className="select-button lead-conversion-refresh" type="button" onClick={onRefresh} disabled={!canRefresh || loading || refreshing}
          title={futureMonth ? "Будущий месяц ещё нельзя загрузить" : !canRefresh ? "Для обновления нужен доступ к общей записи и подключённый Roistat" : "Загрузить переходы и лиды выбранного месяца из Roistat"}
          aria-busy={refreshing}>
          <RefreshCw size={16} />{refreshing ? "Обновляю…" : "Обновить Roistat"}
        </button>
      </section>

      {error && <div className="lead-conversion-error" role="alert">
        <TriangleAlert size={18} /><div><strong>Данные не обновились</strong><p>{error}</p>{snapshot && <small>Показана последняя сохранённая выгрузка.</small>}</div>
        <button className="select-button" type="button" onClick={onRetry} disabled={loading || refreshing}>Повторить чтение</button>
      </div>}

      {loading && !snapshot ? <ConversionSkeleton /> : <>
        <section className="analytics-panel lead-conversion-filters" aria-label="Фильтры конверсии">
          <label><span>Бренд</span><select value={brand} onChange={(event) => setBrand(event.target.value)}>
            <option value="all">Все бренды</option>{report.options.brands.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select></label>
          <label><span>Источник</span><select value={source} onChange={(event) => setSource(event.target.value)}>
            <option value="all">Все пять источников</option>{report.options.sources.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select></label>
          {(brand !== "all" || source !== "all") && <button type="button" className="ghost-button" onClick={() => { setBrand("all"); setSource("all"); }}>Сбросить фильтры</button>}
          <span className="lead-conversion-filter-note">Месяц и город — вверху страницы</span>
        </section>

        {warnings.length > 0 && <details className="lead-conversion-warnings"><summary><Info size={16} />Особенности выгрузки: {warnings.length}<ChevronDown size={15} /></summary><ul>{warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul></details>}

        {unknown.totals.recordCount > 0 && <details className="analytics-panel lead-conversion-unknown">
          <summary>
            <Info size={19} /><div><strong>Без города — отдельно от МСК и СПБ</strong><span>{formatCount(unknown.totals.visits)} переходов · {formatCount(unknown.totals.leads)} лидов · CR {formatRate(unknown.totals.conversionRate)}</span><small>Город определён для {formatRate(report.cityCoverage.visitsShare)} переходов и {formatRate(report.cityCoverage.leadsShare)} лидов выбранных брендов и источников</small></div><ChevronDown size={18} />
          </summary>
          <p>Для этих строк нет однозначной привязки школы к городу в справочнике и UTM. Они не включены в показатели выбранного города. Здесь можно проверить каждый бренд и источник.</p>
          <div className="lead-conversion-table-grid lead-conversion-unknown-aggregates">
            <section><h3>Источники без города</h3><ConversionTable title="Конверсия источников без города" rows={unknown.bySource} dimension="source" /></section>
            <section><h3>Бренды без города</h3><ConversionTable title="Конверсия брендов без города" rows={unknown.byBrand} dimension="brand" brandSources={unknown.byBrandSource} /></section>
          </div>
          <h3 className="lead-conversion-unknown-detail-title">Бренд × источник без города</h3>
          <ConversionTable title="Бренды и источники без города" rows={unknown.byBrandSource} dimension="brandSource" />
        </details>}

        {hasKnownData ? <>
          <ConversionKpis totals={report.totals} />
          <div className="lead-conversion-table-grid">
            <section className="analytics-panel lead-conversion-table-panel"><div className="lead-conversion-panel-head"><h2>По источникам</h2><p>Какой канал приводит заявки</p></div><ConversionTable title="Конверсия по источникам" rows={report.bySource} dimension="source" /></section>
            <section className="analytics-panel lead-conversion-table-panel"><div className="lead-conversion-panel-head"><h2>По брендам</h2><p>Нажмите на бренд, чтобы раскрыть источники</p></div><ConversionTable title="Конверсия по брендам" rows={report.byBrand} dimension="brand" brandSources={report.byBrandSource} /></section>
          </div>
          <ConversionComparison rows={report.bySource} />
          <details className="analytics-panel lead-conversion-detail">
            <summary><div><strong>Бренд × источник</strong><span>Полный совместный срез · {report.byBrandSource.length} сочетаний</span></div><ChevronDown size={18} /></summary>
            <ConversionTable title="Конверсия в разрезе бренда и источника" rows={report.byBrandSource} dimension="brandSource" />
          </details>
        </> : <section className="analytics-panel lead-conversion-empty">
          <Info size={24} /><h2>{brand !== "all" || source !== "all" ? "В этом срезе нет строк с городом" : "Пока нет данных выбранного города"}</h2>
          <p>{futureMonth ? "Выбран будущий месяц. Данные появятся после его начала." : snapshot?.configured === false ? "Подключение Roistat для этой выгрузки пока не настроено. Проверьте настройки в админке." : unknown.totals.recordCount ? "Доступные данные без города можно раскрыть выше. Они не подмешиваются в итоги МСК и СПБ." : coverage ? "Выгрузка за указанный период получена. В выбранном городе и срезе нет строк с переходами или лидами." : "Загрузите выбранный месяц из Roistat. Если выгрузка уже есть, проверьте месяц, город и фильтры."}</p>
          {canRefresh && !error && <button type="button" className="select-button" onClick={onRefresh} disabled={refreshing}>{refreshing ? "Обновляю…" : "Загрузить выбранный месяц"}</button>}
        </section>}
      </>}
    </div>
  );
}

function ConversionKpis({ totals }: { totals: LeadConversionTotals }) {
  return <section className="lead-conversion-kpis" aria-label="Конверсия выбранного среза">
    <article><span>Переходы</span><strong>{formatCount(totals.visits)}</strong><small>визиты Roistat</small></article>
    <article><span>Лиды</span><strong>{formatCount(totals.leads)}</strong><small>заявки Roistat</small></article>
    <article className="lead-conversion-rate-kpi"><span>Переход → лид</span><strong>{formatRate(totals.conversionRate)}</strong><small>{totals.visits > 0 ? "лиды / переходы × 100%" : "нет переходов для расчёта"}</small></article>
  </section>;
}

function ConversionTable({ title, rows, dimension, brandSources, nested = false }: { title: string; rows: LeadConversionGroup[]; dimension: "source" | "brand" | "brandSource"; brandSources?: LeadConversionGroup[]; nested?: boolean }) {
  const [sort, setSort] = useState<{ key: LeadConversionSortKey; direction: LeadConversionSortDirection }>({ key: "visits", direction: "desc" });
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const tableId = useId();
  const sorted = useMemo(() => sortLeadConversionRows(rows, sort.key, sort.direction), [rows, sort]);
  const sourcesByBrand = useMemo(() => {
    const result = new Map<string, LeadConversionGroup[]>();
    for (const row of brandSources ?? []) result.set(row.brand, [...(result.get(row.brand) ?? []), { ...row, label: row.source }]);
    return result;
  }, [brandSources]);
  const columns: Array<{ key: LeadConversionSortKey; label: string }> = [
    { key: "label", label: dimension === "source" ? "Источник" : dimension === "brand" ? "Бренд" : "Бренд / источник" },
    { key: "visits", label: "Переходы" }, { key: "leads", label: "Лиды" }, { key: "conversionRate", label: "CR, %" },
  ];
  function changeSort(key: LeadConversionSortKey) {
    setSort((current) => ({ key, direction: current.key === key && current.direction === "desc" ? "asc" : "desc" }));
  }
  function toggleBrand(key: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }
  return <div className={`lead-conversion-table-scroll${nested ? " lead-conversion-nested-table" : ""}`} tabIndex={0} role="region" aria-label={title}>
    <table className={`lead-conversion-table${dimension === "brand" ? " lead-conversion-brand-table" : ""}`}><caption className="lead-conversion-sr-only">{title}. CR — доля переходов, ставших лидами.</caption><thead><tr>
      {columns.map((column) => <th key={column.key} scope="col" aria-sort={sort.key === column.key ? sort.direction === "asc" ? "ascending" : "descending" : "none"}>
        <button type="button" onClick={() => changeSort(column.key)} title={`Сортировать: ${column.label}`}>
          {column.label}{sort.key !== column.key ? <ArrowUpDown size={12} /> : sort.direction === "desc" ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
        </button>
      </th>)}
    </tr></thead><tbody>{sorted.map((row) => {
      const sourceRows = dimension === "brand" ? sourcesByBrand.get(row.brand) ?? [] : [];
      const canExpand = sourceRows.length > 0;
      const isExpanded = expanded.has(row.key);
      const detailId = `${tableId}-${encodeURIComponent(row.key)}`;
      return <Fragment key={row.key}><tr className={canExpand && isExpanded ? "lead-conversion-brand-open" : undefined}>
        <th scope="row" title={row.domains.join(", ")}>
          {canExpand ? <button type="button" className="lead-conversion-brand-toggle" aria-label={`Источники бренда ${row.brand}`} aria-expanded={isExpanded} aria-controls={detailId} onClick={() => toggleBrand(row.key)}>
            <ChevronDown size={15} aria-hidden="true" /><strong>{row.label}</strong>
          </button> : <strong>{dimension === "brandSource" ? row.brand : row.label}</strong>}
          {!nested && <small>{dimension === "source" ? `Бренды: ${row.brandCount}` : dimension === "brandSource" ? row.source : row.domains.length === 1 ? row.domains[0] : `Домены: ${row.domains.length}`}</small>}
          {!nested && dimension !== "brand" && row.sourceLabels.length > 0 && <details className="lead-conversion-source-labels"><summary>Исходные метки: {row.sourceLabels.length}</summary><span>{row.sourceLabels.join(", ")}</span></details>}
        </th><td>{formatCount(row.visits)}</td><td>{formatCount(row.leads)}</td><td className="lead-conversion-rate-cell" title={row.conversionRate === null ? "Нет переходов для расчёта" : undefined}>{row.conversionRate === null ? "—" : percentFormat.format(row.conversionRate)}</td>
      </tr>{canExpand && isExpanded && <tr className="lead-conversion-brand-detail" id={detailId}><td colSpan={4}>
        <ConversionTable title={`Источники бренда ${row.brand}`} rows={sourceRows} dimension="source" nested />
      </td></tr>}</Fragment>;
    })}</tbody></table>
  </div>;
}

function ConversionComparison({ rows }: { rows: LeadConversionGroup[] }) {
  const chartRows = [...rows].filter((row) => row.conversionRate !== null).sort((a, b) => b.visits - a.visits).slice(0, 8);
  const maximum = Math.max(1, ...chartRows.map((row) => row.conversionRate ?? 0));
  if (!chartRows.length) return null;
  return <section className="analytics-panel lead-conversion-comparison">
    <div className="lead-conversion-panel-head"><h2>Конверсия источников</h2><p>Сравнивайте CR показанных источников вместе с объёмом.</p></div>
    <ol>{chartRows.map((row) => <li key={row.key}>
      <div className="lead-conversion-bar-label"><strong>{row.label}</strong><span>{formatCount(row.visits)} переходов · {formatCount(row.leads)} лидов</span></div>
      <div className="lead-conversion-bar-track" aria-hidden="true"><i style={{ width: `${(row.conversionRate ?? 0) / maximum * 100}%` }} /></div>
      <span className="lead-conversion-bar-value">{formatRate(row.conversionRate)}</span>
    </li>)}</ol>
  </section>;
}

function ConversionSkeleton() {
  return <div className="lead-conversion-loading" role="status" aria-label="Загрузка переходов и лидов"><div /><div /><div /><span>Загружаю сохранённую выгрузку Roistat…</span></div>;
}
