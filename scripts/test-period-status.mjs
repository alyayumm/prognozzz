import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/metrics.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const psSource = readFileSync(new URL('../src/lib/psSales.ts', import.meta.url), 'utf8');
const psJs = ts.transpileModule(psSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const psExports = {};
runInNewContext(psJs, { exports: psExports });
const exports = {};
runInNewContext(js, { exports, require: (name) => name === './psSales' ? psExports : {} });
const totals = (fact, forecast, plan = 100) => ({ Лиды: { fact, forecast, plan, recommendations: 0, omQualified: 0 } });

test('status compares fact with forecast independently of plan', () => {
  assert.equal(exports.getPeriodStatus(totals(100, 100, 200)).label, '');
  assert.equal(exports.getPeriodStatus(totals(94, 100, 94)).tone, 'danger');
  assert.equal(exports.getPeriodStatus(totals(106, 100, 106)).tone, 'good');
});

test('exactly five percent is not a strong deviation in either direction', () => {
  for (const fact of [95, 105]) assert.equal(exports.getPeriodStatus(totals(fact, 100)).label, '');
  assert.equal(exports.getPeriodStatus(totals(94.99, 100)).tone, 'danger');
  assert.equal(exports.getPeriodStatus(totals(105.01, 100)).tone, 'good');
  assert.equal(exports.getPeriodStatus(totals(100, 0)).label, '');
});

const record = (date, fact, forecast, city = 'МСК', metric = 'Лиды') => ({ date, fact, forecast, city, metric, plan: 999, recommendations: 0, omQualified: 0 });

test('unfinished periods compare forecasts only through the last fact for each city and month', () => {
  const records = [
    record('2026-09-30', 100, 100),
    record('2026-10-01', 100, 100),
    record('2026-10-02', 0, 900),
    record('2026-10-01', 50, 50, 'СПБ'),
    record('2026-10-02', 50, 50, 'СПБ'),
    record('2026-11-01', 0, 1000),
  ];
  assert.equal(exports.getRecordsPeriodStatus(records).label, '');
});

test('zero qualified counts on an imported day and the selected traffic mode participate', () => {
  const records = [record('2026-10-01', 100, 100), record('2026-10-01', 0, 10, 'МСК', 'Квалы')];
  assert.equal(exports.getRecordsPeriodStatus(records).tone, 'danger');
  records[1].omQualified = 10;
  assert.equal(exports.getRecordsPeriodStatus(records, 'marketing').label, '');
});

test('PS sales compare only covered dates even when amoCRM has a later lead fact', () => {
  const records = [
    record('2026-10-25', 20, 20, 'МСК', 'Продажи'),
    record('2026-10-26', 100, 100),
    record('2026-10-26', 0, 30, 'МСК', 'Продажи'),
  ];
  records[0].channel = records[2].channel = 'Город';
  records[0].comment = '[SALES_SOURCE=PS] [PS_COVERED_TO=2026-10-25]';
  records[2].comment = '[SALES_SOURCE=PS] [PS_COVERED_TO=2026-10-25] [PS_PENDING=1]';
  assert.equal(exports.getRecordsPeriodStatus(records).label, '');
  assert.equal(exports.netFact({ ...records[2], fact: 8 }), 0);
});
