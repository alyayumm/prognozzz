import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';

const gs = readFileSync(new URL('../apps-script/AppsScript.gs', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const tree = ts.createSourceFile('App.tsx', app, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function appFunction(name) {
  let declaration;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) declaration = node.getText(tree);
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return ts.transpileModule(declaration, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
}

test('amo import refreshes the shared daily facts before reporting success', async () => {
  const calls = [];
  const sync = runInNewContext(`${appFunction('syncAmoCrmLeads')}; syncAmoCrmLeads;`, {
    apiConfigured: true, writePassword: 'test',
    setIsSavingDaily: value => calls.push(value ? 'loading' : 'idle'),
    setSavedMessage: message => { if (message.includes('done')) calls.push('success'); },
    callReportApi: async () => { calls.push('api'); return { message: 'done' }; },
    refreshMainReportSnapshot: async () => { calls.push('fresh-daily-facts'); },
    getErrorMessage: error => error.message,
  });
  await sync('2026-10-01', '2026-10-21');
  assert.deepEqual(calls, ['loading', 'api', 'fresh-daily-facts', 'success', 'idle']);
});

test('a failed amo import cannot appear successful to the refresh button', async () => {
  const calls = [];
  const sync = runInNewContext(`${appFunction('syncAmoCrmLeads')}; syncAmoCrmLeads;`, {
    apiConfigured: true, writePassword: 'test', setIsSavingDaily: () => {}, setSavedMessage: () => {},
    callReportApi: async () => { throw new Error('amo unavailable'); },
    refreshMainReportSnapshot: async () => calls.push('refresh'), getErrorMessage: error => error.message,
  });
  await assert.rejects(sync('2026-10-01', '2026-10-21'), /amo unavailable/);
  assert.deepEqual(calls, []);
});

function batchStore(initial, maxRows = initial.length) {
  const rows = initial.map(row => [...row]);
  const writes = [];
  const sheet = {
    getLastRow: () => rows.length,
    getLastColumn: () => rows[0].length,
    getMaxRows: () => maxRows,
    insertRowsAfter: (_, count) => { maxRows += count; },
    deleteRow: row => rows.splice(row - 1, 1),
    appendRow: values => { writes.push([values]); rows.push([...values]); },
    getRange(row, column, height, width) {
      return {
        getValues: () => rows.slice(row - 1, row - 1 + height).map(value => value.slice(column - 1, column - 1 + width)),
        setValues(values) {
          assert.ok(row + height - 1 <= maxRows);
          writes.push(values);
          values.forEach((value, index) => { rows[row - 1 + index] = [...value]; });
        },
      };
    },
  };
  const upsert = runInNewContext(`${gs}\nupsertRowsById_;`, {
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => sheet }) },
  });
  return { rows, writes, upsert: records => upsert('Test', ['id', 'fact'], records, record => [record.id, record.fact]) };
}

test('a full-month import batches existing and new rows and preserves untouched facts', () => {
  const store = batchStore([['id', 'fact'], ['manual', 90], ['a', 1], ['b', 2], ['c', 3]]);
  store.upsert([{ id: 'a', fact: 11 }, { id: 'b', fact: 22 }, { id: 'c', fact: 33 }, { id: 'new-1', fact: 44 }, { id: 'new-2', fact: 55 }]);
  assert.deepEqual(store.rows, [['id', 'fact'], ['manual', 90], ['a', 11], ['b', 22], ['c', 33], ['new-1', 44], ['new-2', 55]]);
  assert.equal(store.writes.length, 2);
});

test('separated updates preserve intervening rows and repeated ids use the final value', () => {
  const store = batchStore([['id', 'fact'], ['a', 1], ['manual', 90], ['b', 2]], 20);
  store.upsert([{ id: 'a', fact: 0 }, { id: 'b', fact: 22 }, { id: 'new', fact: 30 }, { id: 'new', fact: 31 }]);
  assert.deepEqual(store.rows, [['id', 'fact'], ['a', 0], ['manual', 90], ['b', 22], ['new', 31]]);
});

test('an incomplete amo page cannot overwrite the main report with partial counts', () => {
  const read = runInNewContext(`${gs}
    fetchAmoCrmEndpoint_ = (path, params) => {
      if (params.page === 1) return { _embedded: { leads: [{ id: 1 }] }, _links: { next: { href: 'next' } } };
      throw new Error('temporary HTTP 503');
    };
    fetchAmoCrmLeadsByDateField_;
  `);
  assert.throws(() => read('2026-10-01', '2026-10-21', 'created_at', '1', 80, []), /503/);
});

test('a missing target pipeline cannot turn a month of saved facts into zero', () => {
  const read = runInNewContext(`${gs}\nsalesFetchAmoLeadsForDateRange_;`);
  assert.throws(() => read('2026-10-01', '2026-10-21', [], { pipelines: {} }), /воронки/);
});
