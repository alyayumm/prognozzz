import type { EventItem, Metric } from "../types";
import type { MetricTotals } from "./metrics";
import { buildConversions, percent } from "./metrics";

export function buildAttentionItems(totals: MetricTotals, events: EventItem[]): string[] {
  const items: string[] = [];
  const conversions = buildConversions(totals);
  const leadsPct = metricCompletion(totals, "Лиды");
  const qualifiedPct = metricCompletion(totals, "Квалы");
  const salesPct = metricCompletion(totals, "Продажи");

  if (salesPct < 90 && qualifiedPct < 90) {
    items.push("Продажи ниже плана, при этом КВАЛ тоже ниже. Сначала проверьте объем и качество КВАЛ.");
  }

  if (qualifiedPct >= 90 && salesPct < 90) {
    items.push("КВАЛ близок к плану, но продажи ниже. Проверьте конверсию КВАЛ -> продажа.");
  }

  if (leadsPct >= 95 && qualifiedPct < 90) {
    items.push("Лиды выполняют план, но КВАЛ ниже. Проверьте качество трафика и обработку обращений.");
  }

  if (conversions.qualifiedToSale < 30) {
    items.push("Конверсия КВАЛ -> продажа ниже ожидаемой. Нужна проверка этапа продаж.");
  }

  if (events.length > 0) {
    items.push("Снижение или рост метрик мог совпасть с событием в периоде. Влияние нужно проверить вручную.");
  }

  return items.slice(0, 4);
}

function metricCompletion(totals: MetricTotals, metric: Metric) {
  const item = totals[metric];
  return item ? percent(item.fact, item.plan) : 0;
}
