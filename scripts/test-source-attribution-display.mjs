import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const tree = ts.createSourceFile("App.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ["normalizeSourceName", "canonicalSourceName", "sourceNameEquals", "reconcileSourceResidualsToReportFacts",
  "hasRoistatSourceAttribution", "isEditableSourceCity", "isDistributedSourceRecord", "canReceiveSourceResidual",
  "sourceResidualGroupKey", "allocateIntegerAmount", "getSourceRecordCityScope", "sourceCityFromCode",
  "isRoistatDirectOverlayRecord", "applyDirectMonthlyRowsToSourceBuckets", "findSourceLabel", "getPreferredSourceRecords"];
const functions = tree.statements.filter(n => ts.isFunctionDeclaration(n) && names.includes(n.name?.text)).map(n => n.getText(tree)).join("\n");
const js = ts.transpileModule(functions, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const api = runInNewContext(`
  const metrics = ['Лиды', 'Квалы', 'Продажи'];
  const sourceRecordCity = 'источники';
  const sourceResidualAdjustmentComment = '[SOURCE_RESIDUAL=distributed]';
  const sourceCityCommentPattern = /\\[SOURCE_CITY=(МСК|СПБ|Все)\\]/i;
  const isSourceValueRecord = r => r.city === sourceRecordCity;
  const netFact = r => r.fact;
  ${js}
  ({ reconcile: reconcileSourceResidualsToReportFacts, overlay: isRoistatDirectOverlayRecord, direct: applyDirectMonthlyRowsToSourceBuckets })
`);
const imported = (source, fact) => ({
  date: "2026-09-01", city: "источники", channel: source, metric: "Лиды", fact,
  comment: "[SOURCE_CITY=МСК] Roistat API [SOURCE_ATTRIBUTION=proportional-v1]",
});

test("the UI retains Roistat totals instead of topping them up to amoCRM totals", () => {
  const rows = [
    { date: "2026-09-01", city: "МСК", metric: "Лиды", fact: 200 },
    imported("SEO", 88), imported("Директ", 22),
  ];
  const result = api.reconcile(rows);
  assert.equal(result[1].fact, 88);
  assert.equal(result[2].fact, 22);
});

test("a fresh import replaces overlapping manual Avito facts without changing saved rows", () => {
  const manual = { ...imported('Авито', 23), comment: 'Авито ручной ввод: 01-03.09 [SOURCE_CITY=МСК]' };
  const rows = [imported('Авито', 15), imported('SEO', 85), manual];
  const result = api.reconcile(rows);
  assert.equal(result.reduce((sum, row) => sum + row.fact, 0), 100);
  assert.equal(rows.length, 3);
  assert.equal(manual.fact, 23);
});

test("manual facts outside the imported city, date or metric remain available", () => {
  const manual = { ...imported('Авито', 23), comment: '[SOURCE_CITY=МСК] ручной ввод' };
  const rows = [imported('SEO', 100), manual,
    { ...manual, date: '2026-09-02' },
    { ...manual, metric: 'Квалы' },
    { ...manual, comment: '[SOURCE_CITY=СПБ] ручной ввод' }];
  const result = api.reconcile(rows);
  assert.equal(result.length, 4);
  assert.equal(result.reduce((sum, row) => sum + row.fact, 0), 169);
});

test("Direct with the new attribution is a visible source record", () => {
  assert.equal(api.overlay(imported("Директ", 22)), false);
});

test("monthly Direct from Roistat is not replaced by the old manual table", () => {
  const buckets = [{ key: "2026-09", values: { Директ: { Лиды: 22, Квалы: 10, Продажи: 2 } } }];
  api.direct(buckets, "month", ["Директ"], [{ monthKey: "2026-09", source: "Директ", leads: 999 }], [imported("Директ", 22)]);
  assert.equal(buckets[0].values.Директ.Лиды, 22);
});
