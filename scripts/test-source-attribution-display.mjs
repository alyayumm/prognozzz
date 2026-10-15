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
  "isRoistatDirectOverlayRecord", "applyDirectMonthlyRowsToSourceBuckets", "findSourceLabel"];
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

test("Direct with the new attribution is a visible source record", () => {
  assert.equal(api.overlay(imported("Директ", 22)), false);
});

test("monthly Direct from Roistat is not replaced by the old manual table", () => {
  const buckets = [{ key: "2026-09", values: { Директ: { Лиды: 22, Квалы: 10, Продажи: 2 } } }];
  api.direct(buckets, "month", ["Директ"], [{ monthKey: "2026-09", source: "Директ", leads: 999 }], [imported("Директ", 22)]);
  assert.equal(buckets[0].values.Директ.Лиды, 22);
});
