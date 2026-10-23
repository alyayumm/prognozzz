import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/api/publicSheetApi.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const reader = request => runInNewContext(`${js}; loadGvizSheetOnce = request; loadGvizSheet;`, { exports: {}, request });

test('a transient Sheets read retries the same sheet and returns the fresh response', async () => {
  const calls = [];
  const read = reader(async sheet => {
    calls.push(sheet);
    if (calls.length === 1) throw new Error('temporary timeout');
    return { rows: ['fresh'] };
  });
  assert.equal((await read('Data_Daily')).rows[0], 'fresh');
  assert.deepEqual(calls, ['Data_Daily', 'Data_Daily']);
});

test('a persistent read error stops after two attempts and reaches the report notice', async () => {
  let calls = 0;
  const read = reader(async () => { calls++; throw new Error('service unavailable'); });
  await assert.rejects(read('Month_Config'), /service unavailable/);
  assert.equal(calls, 2);
});
