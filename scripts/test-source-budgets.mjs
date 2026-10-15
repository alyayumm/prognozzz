import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import ts from "typescript";

function extract(path, names, constants = []) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const selected = tree.statements.filter(node =>
    ts.isFunctionDeclaration(node) && names.includes(node.name?.text)
    || ts.isVariableStatement(node) && node.declarationList.declarations.some(d => constants.includes(d.name.getText(tree))),
  ).map(node => node.getText(tree)).join("\n");
  return ts.transpileModule(selected.replace(/export /g, ""), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
}

const parser = runInNewContext(`${extract("../src/api/brandAnalyticsApi.ts", [
  "parseDrrBudgetSheet", "readCell", "normalizeDrrBrandName", "normalizeBrandKey", "isDrrHeaderOrTotal",
  "canonicalDrrOtherSource", "canonicalSourceName", "stringValue", "toNumber",
], ["drrBudgetSheets"])}; ({ parse: parseDrrBudgetSheet, sheets: drrBudgetSheets });`);
const finance = runInNewContext(`
  const metrics = ['Лиды', 'Квалы', 'Продажи'];
  const isSourceValueRecord = r => r.city === 'источники';
  ${extract("../src/App.tsx", ["normalizeSourceName", "canonicalSourceName", "sourceNameEquals",
    "resolveSourceBudget", "recalculateSourceMoneyTotals", "sourceMoneyFromComment", "escapeRegExp"])}
  ({ resolve: typeof resolveSourceBudget === 'function' ? resolveSourceBudget : null, recalculate: recalculateSourceMoneyTotals });
`);
const row = (...values) => ({ c: values.map(v => ({ v })) });
const budget = (source, amount, monthKey = "2026-09") => ({ source, budget: amount, monthKey, city: "МСК", brand: "Тест" });
const record = (month, source, expense) => ({ city: "источники", date: `${month}-01`, channel: source,
  metric: "Продажи", comment: `расход: ${expense}`, fact: 1 });

test("September 2026 uses the explicitly dated tabs", () => {
  const september = parser.sheets.filter(s => s.monthKey === "2026-09");
  assert.equal(september.length, 2);
  assert.ok(september.every(s => s.sheet.endsWith("СЕНТЯБРЬ 26")));
});

test("expense parsing retains Avito, metro and unallocated amounts without counting footers twice", () => {
  const result = parser.parse({ rows: [
    row("бренд", "Яндекс", "2ГИС", "источник", "бюджет", "итого"),
    row("Топгир", 100, 200, "реклама метро", 50, 350),
    row("МСК Hermes", 10, 20, "Авито", 56, 86),
    row("Рулевой", 30, 40, "", 0, 80),
    row("", 140, 260, "", 106, 516),
    row("ИТОГО", 140, 260, "", 106, 516),
  ] }, { city: "МСК", monthKey: "2026-09" });
  assert.equal(result.find(r => r.source === "Авито")?.budget, 56);
  assert.equal(result.find(r => r.source === "Реклама в метро")?.budget, 50);
  assert.equal(result.find(r => r.source === "Прочие расходы")?.budget, 10);
  assert.equal(result.reduce((sum, r) => sum + r.budget, 0), 516);
});

test("DRR budgets override Roistat expenses and old performance for the same month", () => {
  const result = finance.resolve("Директ", [record("2026-09", "Директ", 999)],
    [budget("Директ", 307168.43)], [budget("Директ", 777)]);
  assert.equal(result.budget, 307168.43);
  assert.equal(result.budgetKnown, true);
});

test("a source without a budget in a covered month has zero expense, without a fabricated fallback", () => {
  const result = finance.resolve("SEO", [record("2026-09", "SEO", 10)], [budget("2ГИС", 100)]);
  assert.equal(result.budget, 0);
  assert.equal(result.budgetKnown, true);
});

test("missing October expense stays unknown and does not copy September", () => {
  const result = finance.resolve("SEO", [record("2026-10", "SEO", 0)], []);
  assert.equal(result.budget, 0);
  assert.equal(result.budgetKnown, false);
});

test("a mixed period resolves months independently and suppresses incomplete financial ratios", () => {
  const result = finance.resolve("Директ", [record("2026-09", "Директ", 999), record("2026-10", "Директ", 0)],
    [budget("Директ", 100)]);
  assert.equal(result.budget, 100);
  assert.equal(result.budgetKnown, false);
  const totals = finance.recalculate({ source: "Директ", totals: { Лиды: 10, Квалы: 5, Продажи: 2 },
    revenue: 1000, actualRevenue: 1000, ...result });
  assert.equal(totals.cpl, 0);
  assert.equal(totals.roas, null);
});

test("actual expenses remain available for a month that has no DRR budget", () => {
  const result = finance.resolve("Директ", [record("2026-09", "Директ", 999), record("2026-10", "Директ", 25)],
    [budget("Директ", 100)]);
  assert.equal(result.budget, 125);
  assert.equal(result.budgetKnown, true);
});

test("expenses load while the brand API is pending and concurrent consumers share one request", async () => {
  const loader = runInNewContext(`
    let calls = 0;
    const loadDrrBudgetRows = async () => { calls++; return [{ budget: 10 }]; };
    const loadBrandServiceFromAppsScript = () => new Promise(() => {});
    ${extract("../src/api/brandAnalyticsApi.ts", ["loadBrandAnalyticsSnapshot", "loadSourceBudgetSnapshot"], ["sourceBudgetRequest"])}
    loadBrandAnalyticsSnapshot();
    ({ load: loadSourceBudgetSnapshot, calls: () => calls });
  `);
  const first = loader.load();
  assert.equal(first, loader.load());
  assert.equal((await first)[0].budget, 10);
  assert.equal(loader.calls(), 1);
});

if (process.argv.includes("--live")) {
  test("live September DRR source sums match both city totals", async () => {
    for (const [city, gid, expected] of [["МСК", 1120920644, 1592743.8], ["СПБ", 1720486942, 1128962.07]]) {
      const url = new URL("https://docs.google.com/spreadsheets/d/1tl-e_HAxxgGv24l19GaKaVz_6NYDuLqEwQH5esjER3o/gviz/tq");
      url.searchParams.set("gid", gid);
      url.searchParams.set("tqx", "out:json");
      url.searchParams.set("tq", "select A,E,I,K,L,M");
      const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
      assert.equal(response.status, 200);
      const body = await response.text();
      const report = JSON.parse(body.slice(body.indexOf("{"), body.lastIndexOf("}") + 1));
      assert.equal(report.status, "ok");
      const rows = parser.parse(report.table, { city, monthKey: "2026-09" });
      const sum = Math.round(rows.reduce((total, r) => total + r.budget, 0) * 100) / 100;
      assert.equal(sum, expected);
      console.log(city, JSON.stringify(Object.fromEntries([...new Set(rows.map(r => r.source))].map(source =>
        [source, Math.round(rows.filter(r => r.source === source).reduce((total, r) => total + r.budget, 0) * 100) / 100],
      ))));
    }
  });
}
