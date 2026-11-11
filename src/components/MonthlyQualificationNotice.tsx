import { Info } from "lucide-react";
import type { MonthConfig } from "../types";
import { monthlyQualificationDeduction } from "../lib/monthlyQualificationAdjustment";

export default function MonthlyQualificationNotice({ config }: { config: MonthConfig }) {
  const deduction = monthlyQualificationDeduction(config, "Все");
  if (!deduction || !config.qualificationAdjustment) return null;
  return (
    <section className="notice monthly-qualification-notice" aria-label={`Корректировка КВАЛ: ${config.label}`}>
      <Info size={18} aria-hidden="true" />
      <p>
        <strong>{config.label}: РЕК/КЕШБЕК — {config.qualificationAdjustment.targetReferrals}.</strong>{" "}
        В общий месячный итог КВАЛ внесён дополнительный вычет {deduction} по вашему указанию.
        Распределение по городам, дням и неделям пока не задано.
      </p>
    </section>
  );
}
