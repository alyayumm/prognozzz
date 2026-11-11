import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

const directory = new URL('../apps-script/', import.meta.url);
const source = readdirSync(directory).filter(name => name.endsWith('.gs'))
  .map(name => readFileSync(new URL(name, directory), 'utf8')).join('\n');
const copy = value => JSON.parse(JSON.stringify(value));
const pipeline = (id, name) => ({ id, name, _embedded: { statuses: [{ id: 142, name: 'Успешно реализовано' }] } });
const response = rows => ({ _embedded: { pipelines: rows } });
function fixture(data) {
  const calls = [];
  const forbidden = () => { throw new Error('Unexpected sheet, lock or state access'); };
  const api = runInNewContext(`${source}
    fetchAmoCrmEndpoint_ = (path, params) => endpoint(path, params);
    ensureServiceSheets_ = readObjects_ = upsertRowsById_ = forbidden;
    verifyPassword_ = password => password === 'test-pass';
    jsonResponse = value => value;
    ({refresh: syncAmoCrmMonth_, post: doPost});`, {
    endpoint: (path, params) => { calls.push({path, params: copy(params)}); return data; }, forbidden,
    LockService: {getScriptLock: forbidden},
    PropertiesService: {getScriptProperties: forbidden},
    SpreadsheetApp: {openById: forbidden, getActiveSpreadsheet: forbidden},
  });
  return {api, calls};
}

test('filter metadata is read-only and returns only the four fixed pipeline IDs with safe stage fields', () => {
  const data = response([pipeline(4535035, 'СПБ АШ'), pipeline(4535038, 'МСК АШ'),
    pipeline(9926210, 'Отдельная воронка'), {...pipeline(999, 'Не выдавать'), secret: 'not-for-output'}]);
  data._embedded.pipelines[0]._embedded.statuses[0].private = 'not-for-output';
  const f = fixture(data);
  const result = copy(f.api.refresh({phase: 'filterMetadata', pipelineIds: [999], runId: 'ignored'}));
  assert.deepEqual(result, {pipelines: [
    {id: '4535035', found: true, name: 'СПБ АШ', cityRecognized: true, statuses: [{id: '142', name: 'Успешно реализовано'}]},
    {id: '4535038', found: true, name: 'МСК АШ', cityRecognized: true, statuses: [{id: '142', name: 'Успешно реализовано'}]},
    {id: '9926210', found: true, name: 'Отдельная воронка', cityRecognized: false, statuses: [{id: '142', name: 'Успешно реализовано'}]},
    {id: '9926246', found: false, name: '', cityRecognized: false, statuses: []},
  ]});
  assert.deepEqual(f.calls, [{path: '/api/v4/leads/pipelines', params: {limit: 250}}]);
});

test('filter metadata rejects incomplete paging and malformed pipeline or stage metadata', () => {
  for (const next of [{href: 'next'}, {}, false, '', null]) {
    const data = response([pipeline(4535035, 'СПБ АШ')]); data._links = {next};
    assert.throws(() => fixture(data).api.refresh({phase: 'filterMetadata'}), /полностью/);
  }
  const malformed = [null, {}, response({}), response([{id: 4535035, name: ''}]),
    response([{...pipeline(4535035, 'СПБ АШ'), name: 123}]),
    response([{...pipeline(4535035, 'СПБ АШ'), _embedded: {statuses: {}}}]),
    response([{...pipeline(4535035, 'СПБ АШ'), _embedded: {statuses: [{id: 142, name: '  '}]}}]),
    response([{...pipeline(4535035, 'СПБ АШ'), _embedded: {statuses: [{id: null, name: 'Этап'}]}}])];
  for (const data of malformed) assert.throws(() => fixture(data).api.refresh({phase: 'filterMetadata'}), /справочник|этап/);
});

test('filter metadata remains password-protected before API access without service setup or writes', () => {
  const f = fixture(response([]));
  const post = password => f.api.post({postData: {contents: JSON.stringify({action: 'syncAmoCrmMonth', password,
    payload: {phase: 'filterMetadata'}})}});
  const rejected = post('wrong');
  assert.equal(rejected.ok, false); assert.match(rejected.error, /пароль/); assert.equal(f.calls.length, 0);
  const allowed = post('test-pass');
  assert.equal(allowed.ok, true); assert.equal(f.calls.length, 1);
  assert.equal(allowed.data.pipelines.length, 4);
});
