import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import type { DemandOutcomeRecord } from "../../api/demandOutcomesApi";
import type { WordstatDemandRecord } from "../../api/wordstatApi";
import type { DemandComparisonCity } from "../../lib/demandComparison";
import { buildDemandDynamics, formatDemandDynamicsCoverage, type DemandDynamicsMetric } from "../../lib/demandDynamics";
import { MONTH_LABELS } from "../../lib/wordstatDemand";
import "./demandDynamics.css";

type Props = { demandRecords: WordstatDemandRecord[]; outcomeRecords: DemandOutcomeRecord[]; city: DemandComparisonCity };
type ChartType = "line" | "bar";
const METRICS: Record<DemandDynamicsMetric, { label: string; unit: string; ratio: boolean }> = {
  salesRatio: { label: "Продажи / спрос, %", unit: "Продажи / спрос, %", ratio: true },
  lossesRatio: { label: "Сливы / спрос, %", unit: "Сливы / спрос, %", ratio: true },
  salesCount: { label: "Продажи, количество", unit: "Продажи, шт.", ratio: false },
  lossesCount: { label: "Сливы, количество", unit: "Сливы, шт.", ratio: false },
  demandCount: { label: "Спрос Wordstat, запросы", unit: "Спрос, запросов", ratio: false },
};
const YEAR_COLORS = ["#1c46f5", "#087b79", "#8645b0", "#b74b35", "#8b6509", "#475b82", "#9e397c", "#496e30", "#15708c"];
const YEAR_DASHES = [undefined, "7 4", "2 3", "10 3 2 3", "4 3", "10 5", "8 3 2 3", "3 3", "12 4"];
const FULL_MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const ANNUAL_METRICS = [["demand", "Спрос, запросов"], ["sales", "Продажи, шт."], ["losses", "Сливы, шт."], ["salesRatio", "Продажи / спрос"], ["lossesRatio", "Сливы / спрос"]] as const;
const countFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const ratioFormat = new Intl.NumberFormat("ru-RU", { style: "percent", maximumFractionDigits: 2 });
const axisCountFormat = new Intl.NumberFormat("ru-RU", { notation: "compact", maximumFractionDigits: 1 });
const count = (value: number | null) => value === null ? "—" : countFormat.format(value);
const ratio = (value: number | null) => value === null ? "—" : ratioFormat.format(value);
const yearColor = (year: number) => YEAR_COLORS[((year - 2026) % YEAR_COLORS.length + YEAR_COLORS.length) % YEAR_COLORS.length];
const yearDash = (year: number) => YEAR_DASHES[((year - 2026) % YEAR_DASHES.length + YEAR_DASHES.length) % YEAR_DASHES.length];

function chartScale(values: number[], isRatio: boolean) {
  const maximum = Math.max(0, ...values);
  if (maximum === 0) return { maximum: 1, ticks: isRatio ? [0, 0.25, 0.5, 0.75, 1] : [0, 1] };
  const rough = maximum / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const multiplier = [1, 2, 2.5, 5, 10].find((value) => value * magnitude >= rough) ?? 10;
  const step = isRatio ? multiplier * magnitude : Math.max(1, Math.ceil(multiplier * magnitude));
  const upper = Math.ceil(maximum / step) * step;
  return { maximum: upper, ticks: Array.from({ length: Math.round(upper / step) + 1 }, (_, index) => index * step) };
}

export default function DemandDynamics({ demandRecords, outcomeRecords, city }: Props) {
  const [metric, setMetric] = useState<DemandDynamicsMetric>("salesRatio");
  const [chartType, setChartType] = useState<ChartType>("line");
  const [requestedYears, setRequestedYears] = useState<number[] | null>(null);
  const [requestedMonth, setRequestedMonth] = useState<number | null>(null);
  const [size, setSize] = useState({ width: 0, height: 300 });
  const chartContainer = useRef<HTMLDivElement>(null);
  const monthTargets = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();
  const availableYears = useMemo(() => buildDemandDynamics(demandRecords, outcomeRecords, { city, years: [], metric }).availableYears.slice().sort((a, b) => b - a), [demandRecords, outcomeRecords, city, metric]);
  // Defaults follow asynchronously arriving sources until the user chooses years.
  const selectedYears = useMemo(() => (requestedYears ?? availableYears.slice(0, 2)).filter((year) => availableYears.includes(year)).sort((a, b) => a - b), [requestedYears, availableYears]);
  const dynamics = useMemo(() => buildDemandDynamics(demandRecords, outcomeRecords, { city, years: selectedYears, metric }), [demandRecords, outcomeRecords, city, selectedYears, metric]);
  const latestSeries = dynamics.series[dynamics.series.length - 1];
  const latestObservedMonth = latestSeries?.points.reduce((latest, point, index) => point.value !== null ? index : latest, 0) ?? 0;
  const activeMonth = requestedMonth ?? latestObservedMonth;
  const metricInfo = METRICS[metric];
  const cityName = city === "Все" ? "Москва + СПб" : city === "МСК" ? "Москва" : "Санкт-Петербург";
  const values = dynamics.series.flatMap((series) => series.points.flatMap((point) => point.value === null ? [] : [point.value]));
  const scale = chartScale(values, metricInfo.ratio);
  const width = size.width;
  const height = size.height;
  const left = metricInfo.ratio ? 62 : 56;
  const right = 10;
  const top = 12;
  const bottom = 32;
  const plotWidth = Math.max(0, width - left - right);
  const plotHeight = Math.max(0, height - top - bottom);
  const slotWidth = plotWidth / 12;
  const x = (index: number) => left + slotWidth * (index + 0.5);
  const y = (value: number) => top + plotHeight * (1 - value / scale.maximum);
  const displayedMonths = width < 500 ? [0, 2, 4, 6, 8, 11] : Array.from({ length: 12 }, (_, index) => index);
  const formatValue = (value: number | null) => metricInfo.ratio ? ratio(value) : count(value);

  useEffect(() => {
    const element = chartContainer.current;
    if (!element) return;
    const resize = () => {
      const rect = element.getBoundingClientRect();
      setSize({ width: Math.max(0, Math.round(rect.width)), height: Math.max(0, Math.round(rect.height)) });
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  function toggleYear(year: number) {
    setRequestedYears(selectedYears.includes(year) ? selectedYears.filter((value) => value !== year) : [...selectedYears, year]);
  }

  function navigateMonth(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % 12;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index + 11) % 12;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = 11;
    else return;
    event.preventDefault();
    setRequestedMonth(next);
    monthTargets.current[next]?.focus();
  }

  return <section className="demand-panel demand-dynamics" aria-labelledby={`${id}-heading`}>
    <div className="demand-dynamics-heading">
      <div><h3 id={`${id}-heading`}>Продажи и сливы относительно спроса</h3><p>{cityName}. Один год — одна линия или группа столбиков, месяцы всегда с января по декабрь.</p></div>
      <div className="demand-dynamics-controls">
        <label htmlFor={`${id}-metric`}>Показатель<select id={`${id}-metric`} value={metric} onChange={(event) => setMetric(event.target.value as DemandDynamicsMetric)}>{Object.entries(METRICS).map(([key, value]) => <option value={key} key={key}>{value.label}</option>)}</select></label>
        <label htmlFor={`${id}-type`}>График<select id={`${id}-type`} value={chartType} onChange={(event) => setChartType(event.target.value as ChartType)}><option value="line">Линии</option><option value="bar">Столбики</option></select></label>
      </div>
    </div>

    <fieldset className="demand-dynamics-years"><legend>Годы для сравнения</legend><div>{availableYears.map((year) => <label key={year} style={{ "--dynamics-year-color": yearColor(year) } as CSSProperties} className={selectedYears.includes(year) ? "is-selected" : ""}><input type="checkbox" checked={selectedYears.includes(year)} onChange={() => toggleYear(year)} /><span className="demand-dynamics-year-swatch" aria-hidden="true" style={{ borderTopStyle: yearDash(year) ? "dashed" : "solid" }} /><span>{year}</span></label>)}{!availableYears.length && <p>Годы появятся после загрузки месячной истории.</p>}</div></fieldset>

    <div className="demand-dynamics-unit">{metricInfo.unit}</div>
    <div className="demand-dynamics-plot" ref={chartContainer}>
      {width > left + right && <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${id}-chart-title ${id}-chart-desc`}>
        <title id={`${id}-chart-title`}>{metricInfo.label}: {cityName}, {selectedYears.join(", ") || "годы не выбраны"}</title>
        <desc id={`${id}-chart-desc`}>По горизонтали месяцы с января по декабрь. По вертикали {metricInfo.unit.toLowerCase()}, шкала начинается с нуля. Значения всех выбранных лет доступны в плашке месяца под графиком. Пропуски не соединяются.</desc>
        {scale.ticks.map((tick) => <g key={tick}><line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} className="demand-dynamics-grid" /><text x={left - 9} y={y(tick) + 4} textAnchor="end" className="demand-dynamics-axis">{metricInfo.ratio ? ratio(tick) : axisCountFormat.format(tick)}</text></g>)}
        {selectedYears.length > 0 && <line x1={x(activeMonth)} x2={x(activeMonth)} y1={top} y2={top + plotHeight} className="demand-dynamics-guide" />}
        {dynamics.series.map((series, seriesIndex) => {
          const color = yearColor(series.year);
          let previousObserved = false;
          const path = series.points.map((point, index) => {
            if (point.value === null) { previousObserved = false; return ""; }
            const command = previousObserved ? "L" : "M";
            previousObserved = true;
            return `${command}${x(index)},${y(point.value)}`;
          }).join(" ");
          const barWidth = slotWidth * 0.74 / dynamics.series.length;
          return <g key={series.year} className="demand-dynamics-series">
            {chartType === "line" && <path d={path} fill="none" stroke={color} strokeWidth={2.2} strokeDasharray={yearDash(series.year)} />}
            {series.points.map((point, index) => point.value === null ? null : chartType === "line"
              ? <circle key={point.month} cx={x(index)} cy={y(point.value)} r={index === activeMonth ? 4 : 2.6} fill={color} />
              : <rect key={point.month} x={left + slotWidth * index + slotWidth * 0.13 + barWidth * seriesIndex} y={y(point.value)} width={barWidth * 0.9} height={Math.max(0, top + plotHeight - y(point.value))} fill={color} opacity={index === activeMonth ? 1 : 0.82} />)}
          </g>;
        })}
        {displayedMonths.map((month) => <text key={month} x={x(month)} y={height - 9} textAnchor="middle" className="demand-dynamics-axis">{MONTH_LABELS[month]}</text>)}
      </svg>}
      {values.length > 0 && <div className="demand-dynamics-month-targets" style={{ left, right, top, bottom }}>{MONTH_LABELS.map((label, index) => <button key={label} type="button" ref={(element) => { monthTargets.current[index] = element; }} tabIndex={index === activeMonth ? 0 : -1} aria-label={`${FULL_MONTHS[index]}. ${dynamics.series.map((series) => `${series.year}: ${formatValue(series.points[index].value)}`).join("; ")}`} aria-describedby={`${id}-month-help`} onPointerEnter={() => setRequestedMonth(index)} onFocus={() => setRequestedMonth(index)} onClick={() => setRequestedMonth(index)} onKeyDown={(event) => navigateMonth(event, index)} />)}</div>}
      {values.length === 0 && <div className="demand-dynamics-empty" role="status"><strong>{selectedYears.length ? "Нет значений для выбранного показателя" : "Выберите годы для сравнения"}</strong><p>{!selectedYears.length ? "Отметьте хотя бы один год над графиком." : metricInfo.ratio ? "Выберите количество вместо отношения или другой год. Отношение доступно только при наличии результата и спроса за один месяц." : "Выберите другой год или показатель. Неизвестные значения не заменяются нулями."}</p></div>}
    </div>

    <div className="demand-dynamics-month-control"><label htmlFor={`${id}-month`}>Показатели за месяц<select id={`${id}-month`} value={activeMonth} onChange={(event) => setRequestedMonth(Number(event.target.value))}>{FULL_MONTHS.map((label, index) => <option value={index} key={label}>{label}</option>)}</select></label><p id={`${id}-month-help`}>Наведите на месяц, коснитесь графика или выберите месяц. На графике работают стрелки, Home и End.</p></div>
    <div className="demand-dynamics-inspector" role="region" aria-label={`${FULL_MONTHS[activeMonth]}: спрос, продажи, сливы и отношения`}>
      {dynamics.series.map((series) => {
        const point = series.points[activeMonth];
        return <div className="demand-dynamics-inspector-year" key={series.year}>
          <strong><i aria-hidden="true" style={{ background: yearColor(series.year) }} />{series.year}</strong>
          <dl><div><dt>Спрос, запросов</dt><dd>{count(point.demand)}</dd></div><div><dt>Продажи, шт.</dt><dd>{count(point.sales)}</dd></div><div><dt>Сливы, шт.</dt><dd>{count(point.losses)}</dd></div><div><dt>Продажи / спрос</dt><dd>{ratio(point.salesRatio)}</dd></div><div><dt>Сливы / спрос</dt><dd>{ratio(point.lossesRatio)}</dd></div></dl>
        </div>;
      })}
      {dynamics.series.length === 0 && <p>Выберите годы, чтобы увидеть значения за {FULL_MONTHS[activeMonth].toLowerCase()}.</p>}
    </div>
    <section className="demand-dynamics-annual" aria-labelledby={`${id}-annual-heading`}>
      <h4 id={`${id}-annual-heading`}>Итоги по годам</h4>
      <p>{cityName}. Суммы по доступным завершённым месяцам; период указан у каждого показателя.</p>
      {dynamics.series.map((series) => <div className="demand-dynamics-inspector-year" key={series.year}>
        <strong><i aria-hidden="true" style={{ background: yearColor(series.year) }} />{series.year}</strong>
        <dl>{ANNUAL_METRICS.map(([key, label]) => {
          const total = series.totals[key];
          const ratioTotal = key === "salesRatio" || key === "lossesRatio" ? series.totals[key] : null;
          return <div key={key}>
            <dt>{label}</dt><dd>{ratioTotal ? ratio(total.value) : count(total.value)}</dd>
            <small>{formatDemandDynamicsCoverage(total.months)}</small>
            {ratioTotal && total.months.length > 0 && <small>{count(ratioTotal.numerator)} / {count(ratioTotal.denominator)} запросов</small>}
          </div>;
        })}</dl>
      </div>)}
      {dynamics.series.length === 0 && <p>Выберите годы над графиком, чтобы увидеть итоги.</p>}
      <p className="demand-dynamics-annual-method">Для каждого отношения берутся суммы продаж или сливов и спроса только за общие месяцы. Месячные проценты не усредняются; продажи со сливами не складываются.</p>
    </section>
    <p className="demand-dynamics-note">Отношение = количество продаж или сливов / число запросов Wordstat × 100%. Это отношение к поисковому спросу, а не конверсия посетителей в продажу. Продажи и сливы показаны отдельно. «—» означает отсутствие данных, 0 — подтверждённый ноль; при нулевом спросе отношение не рассчитывается. Текущий и будущие месяцы не включены.</p>
  </section>;
}
