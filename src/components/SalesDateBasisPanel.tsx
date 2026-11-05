import type { DailyRecord, SalesDateBasis } from "../types";
import { isCitySale, optionalSalesCount, salesDateBasisLabel, selectSalesDateBasis, getSelectedSalesCoverage, selectedSalesFactsAvailable } from "../lib/salesDateBasis";
import "./salesDateBasis.css";

export default function SalesDateBasisPanel({ records, basis, onChange, monthLabel }: {
  records: DailyRecord[];
  basis: SalesDateBasis;
  onChange: (basis: SalesDateBasis) => void;
  monthLabel: string;
}) {
  const sales = records.filter(isCitySale);
  const cities = [...new Set(sales.map((record) => record.city))];
  return <section className="sales-date-basis-panel" aria-label="Два способа учёта продаж">
    <div className="sales-date-basis-heading">
      <div><strong>Продажи · {monthLabel}</strong><p>По дате прихода лида и по дате оплаты. Показатели не складываются.</p></div>
      <label>Дата продажи в отчёте
        <select value={basis} onChange={(event) => onChange(event.target.value as SalesDateBasis)}>
          <option value="traffic">По дате обращения · amoCRM</option>
          <option value="payment">По дате оплаты · ПС</option>
        </select>
      </label>
    </div>
    <div className="sales-date-basis-figures">
      {(["traffic", "payment"] as const).map((item) => {
        const known = sales.map((record) => optionalSalesCount(item === "traffic" ? record.trafficSales : record.paidSales)).filter((value): value is number => value !== undefined);
        const available = selectedSalesFactsAvailable(selectSalesDateBasis(sales, item));
        const count = available ? new Intl.NumberFormat("ru-RU").format(known.reduce((sum, value) => sum + value, 0)) : "—";
        return <article key={item} className={basis === item ? "selected" : ""}>
          <span>{salesDateBasisLabel(item)}</span><strong>{count}</strong>
          <small>{item === "traffic" ? "Успешные сделки по дате обращения лида; А+Б = 2" : "Продажи по дате фактической оплаты; А+Б = 2"}</small>
          <small>{cities.map((city) => {
            const coverage = getSelectedSalesCoverage(selectSalesDateBasis(sales.filter((record) => record.city === city), item));
            return `${city}: ${coverage ? `${coverage.fromDate} — ${coverage.toDate}` : "нет загруженных данных"}`;
          }).join(" · ") || "Нет загруженных данных"}</small>
        </article>;
      })}
    </div>
    <p className="sales-date-basis-note">{basis === "traffic"
      ? "В воронке и графиках — продажи от трафика: дата обращения совпадает с датой отбора лидов и КВАЛ."
      : "В графиках — оплаты периода. Отношение оплат к лидам и КВАЛ периода не является конверсией одной когорты."}</p>
  </section>;
}
