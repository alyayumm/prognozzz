import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';

const compile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
const source = readFileSync(new URL('../src/api/eventMapApi.ts', import.meta.url), 'utf8');
const js = compile(source);
function createReader(storage = new Map()) {
  const exports = {};
  runInNewContext(js, { exports, window: { localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) } } });
  return exports;
}
const table = rows => ({ cols: [{}, {}, {}], rows: rows.map(row => ({ c: row.map(value => value === null ? null : { v: value }) })) });
const nativeRow = (date = 'Date(2026,10,2)', title = 'Номера', description = 'Сбой номеров') => [date, title, description];
const plain = value => JSON.parse(JSON.stringify(value));

test('native Google dates preserve the actual year/month and both cities remain separate', () => {
  const reader = createReader();
  const sourceTable = table([[2026], ['Ноябрь'], nativeRow()]);
  const [spb] = reader.parseEventMapSheet(sourceTable, 'СПБ');
  const [msk] = reader.parseEventMapSheet(sourceTable, 'МСК');
  assert.equal(spb.startDate, '2026-11-02');
  assert.equal(spb.endDate, spb.startDate);
  assert.equal(spb.city, 'СПБ');
  assert.equal(msk.city, 'МСК');
  assert.notEqual(spb.id, msk.id);
  assert.equal(spb.description, 'Сбой номеров');
  assert.equal(spb.expectedEffect, 'неизвестно');
  assert.equal(spb.actualEffect, 'неизвестно');
  assert.equal(spb.source, 'google_sheets');
  assert.equal(spb.metric, 'все');
});

test('event IDs survive row insertion and sorting while full descriptions are retained', () => {
  const reader = createReader();
  const [before] = reader.parseEventMapSheet(table([nativeRow()]), 'МСК');
  const after = reader.parseEventMapSheet(table([nativeRow('Date(2026,9,30)', 'Дизайн', 'Изменение дизайна'), nativeRow()]), 'МСК');
  assert.equal(after[1].id, before.id);
  const [multiline] = reader.parseEventMapSheet(table([nativeRow(undefined, 'Замена товаров', 'Цена\r\nКатегория А+В')]), 'СПБ');
  assert.equal(multiline.description, 'Цена\nКатегория А+В');
});

test('only exact city, date, title and description duplicates are merged; manual events survive', () => {
  const reader = createReader();
  const [sourceEvent] = reader.parseEventMapSheet(table([nativeRow()]), 'МСК');
  const manual = { ...sourceEvent, id: 'manual-1', source: 'manual', expectedEffect: 'негативный' };
  const changedDescription = { ...sourceEvent, id: 'event-map-description', description: 'Другой сбой' };
  const otherCity = { ...sourceEvent, id: 'event-map-spb', city: 'СПБ' };
  const merged = reader.mergeEventMapEvents([manual], [sourceEvent, sourceEvent, changedDescription, otherCity]);
  assert.equal(merged.length, 3);
  assert.equal(merged.find(event => event.id === 'manual-1').expectedEffect, 'негативный');
  assert.ok(merged.some(event => event.id === changedDescription.id));
  assert.ok(merged.some(event => event.id === otherCity.id));
});

test('a new source snapshot replaces changed/removed imported rows without accumulating duplicates', () => {
  const reader = createReader();
  const [old] = reader.parseEventMapSheet(table([nativeRow()]), 'МСК');
  const [updated] = reader.parseEventMapSheet(table([nativeRow(undefined, 'Номера', 'Сбой исправлен')]), 'МСК');
  const manual = { ...old, id: 'manual-2', source: 'manual', title: 'Важное событие' };
  const merged = reader.mergeEventMapEvents([manual, old], [updated]);
  assert.deepEqual(plain(merged).map(event => event.id).sort(), [manual.id, updated.id].sort());
});

test('one failed city cannot replace the complete successful snapshot with partial data', async () => {
  const storage = new Map();
  const reader = createReader(storage);
  const successful = await reader.loadEventMapSnapshot(async () => table([nativeRow()]));
  const failed = await reader.loadEventMapSnapshot(async city => {
    if (city === 'СПб') throw new Error('temporary outage');
    return table([nativeRow(undefined, 'Номера', 'Новые данные только Москвы')]);
  });
  assert.equal(successful.events.length, 2);
  assert.equal(successful.available, true);
  assert.deepEqual(plain(failed.events), plain(successful.events));
  assert.equal(failed.available, true);
  assert.match(failed.warning, /последняя успешная/);
  assert.equal(storage.size, 1);
  const restoredReader = createReader(storage);
  const restored = await restoredReader.loadEventMapSnapshot(async () => { throw new Error('offline'); });
  assert.deepEqual(plain(restored.events), plain(successful.events));
});

test('malformed or yearless dates cannot silently erase a valid cached snapshot', async () => {
  const reader = createReader();
  await reader.loadEventMapSnapshot(async () => table([nativeRow()]));
  for (const invalid of ['Date(2026,1,31)', '02.11', '2026-13-02', '']) {
    const snapshot = await reader.loadEventMapSnapshot(async () => table([nativeRow(invalid)]));
    assert.equal(snapshot.events.length, 2);
    assert.match(snapshot.warning, /недоступна/);
  }
  const [explicitYear] = reader.parseEventMapSheet(table([[2027], ['Январь'], nativeRow('02.01')]), 'МСК');
  assert.equal(explicitYear.startDate, '2027-01-02');
});

test('an unavailable map on first use warns without inventing events or accepting corrupt cache', async () => {
  const storage = new Map([['rectop:event-map:1o4qyb30kxjUuCx2H-xStbD5Xw2P3m9d784NAE3dPyg4:v1', '[{"id":"manual"}]']]);
  const reader = createReader(storage);
  const snapshot = await reader.loadEventMapSnapshot(async () => { throw new Error('offline'); });
  assert.equal(snapshot.events.length, 0);
  assert.equal(snapshot.available, false);
  assert.match(snapshot.warning, /пока не загрузилась/);
});

test('the normal public refresh reads both external tabs and merges them with saved report events', async () => {
  const reader = createReader();
  const calls = [];
  const savedEvent = { ...reader.parseEventMapSheet(table([nativeRow()]), 'МСК')[0], id: 'manual-3', source: 'manual', title: 'Ручное событие' };
  const source = readFileSync(new URL('../src/api/publicSheetApi.ts', import.meta.url), 'utf8');
  const exports = {};
  const context = { exports, require: () => ({...reader, callReportApi: async () => [{monthKey: '2026-11'}]}),
    request: async (sheetName, sourceId, query) => {
      calls.push({ sheetName, sourceId, query });
      return sourceId === reader.eventMapSpreadsheetId ? table([nativeRow()]) : table([]);
    },
    savedEvent,
  };
  runInNewContext(`${compile(source)}
    loadGvizSheetOnce = request;
    parseServiceDailySheet = () => [{date: '2026-11-02'}];
    parseServiceMonthConfigs = () => [{monthKey: '2026-11'}];
    parseServiceEventSheet = () => [savedEvent];
  `, context);
  const snapshot = await exports.loadPublicSheetSnapshot([], { requireServiceSheets: true });
  assert.equal(snapshot.events.length, 3);
  assert.equal(snapshot.eventsLoaded, true);
  assert.equal(snapshot.eventsWarning, undefined);
  assert.ok(snapshot.events.some(event => event.id === savedEvent.id));
  const mapCalls = calls.filter(call => call.sourceId === reader.eventMapSpreadsheetId);
  assert.deepEqual(mapCalls.map(call => call.sheetName).sort(), ['МСК', 'СПб']);
  assert.ok(mapCalls.every(call => call.query === 'select A,B,C'));
});

test('the external map remains available when the saved report events cannot be read', async () => {
  const reader = createReader();
  const source = readFileSync(new URL('../src/api/publicSheetApi.ts', import.meta.url), 'utf8');
  const exports = {};
  runInNewContext(`${compile(source)}
    loadGvizSheetOnce = request;
    parseServiceDailySheet = () => [{date: '2026-11-02'}];
    parseServiceMonthConfigs = () => [{monthKey: '2026-11'}];
  `, { exports, require: () => ({...reader, callReportApi: async () => [{monthKey: '2026-11'}]}), request: async (sheetName, sourceId) => {
    if (sheetName === 'Event_Map') throw new Error('saved events unavailable');
    return sourceId === reader.eventMapSpreadsheetId ? table([nativeRow()]) : table([]);
  } });
  const snapshot = await exports.loadPublicSheetSnapshot([], { requireServiceSheets: true });
  assert.equal(snapshot.eventsLoaded, false);
  assert.match(snapshot.eventsWarning, /Сохранённые события/);
  assert.equal(snapshot.eventMapEvents.length, 2);
  const manual = { ...snapshot.eventMapEvents[0], id: 'manual-existing', source: 'manual', title: 'Сохранённое вручную событие' };
  const preserved = reader.mergeEventMapEvents([manual], snapshot.eventMapEvents);
  assert.equal(preserved.length, 3);
  assert.ok(preserved.some(event => event.id === manual.id));
});

test('a confirmed empty source can clear imported events while retaining manual entries', async () => {
  const reader = createReader();
  const before = await reader.loadEventMapSnapshot(async () => table([nativeRow()]));
  const empty = await reader.loadEventMapSnapshot(async () => table([]));
  assert.equal(empty.available, true);
  const manual = { ...before.events[0], id: 'manual-existing', source: 'manual' };
  assert.deepEqual(plain(reader.mergeEventMapEvents([manual, ...before.events], empty.events)), [plain(manual)]);
  const offline = await reader.loadEventMapSnapshot(async () => { throw new Error('offline'); });
  assert.equal(offline.available, true);
  assert.equal(offline.events.length, 0);
});
