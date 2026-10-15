import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";

const source = readFileSync(new URL("../apps-script/AppsScript.gs", import.meta.url), "utf8");
function runtime(extra = "", globals = {}) {
  return runInNewContext(`${source}\n${extra}\n({
    canonical: canonicalRoistatSource_,
    aggregate: ensureRoistatSourceAggregate_,
    redistribute: redistributeRoistatSourceOther_,
    write: writeRoistatSourceRows_,
    sync: syncRoistatSources_,
    extract: extractRoistatRows_,
    written: () => written,
    deleted: () => deleted,
    fetch: fetchRoistatAnalyticsData_,
    requests: () => requests,
  })`, globals);
}
const fields = {
  sourceDimensions: ["source", "marker"], domainDimension: "domain", cityDimension: "city",
  leadTypeDimension: "type", pipelineDimension: "pipeline", allDimensions: ["source", "marker", "domain", "city", "type", "pipeline"],
  dimensions: ["source", "marker", "domain", "city", "type"],
  metrics: ["leads", "qualified", "sales", "revenue", "budget"],
  metricMap: { leads: "leads", qualified: "qualified", sales: "sales", revenue: "revenue", budget: "budget" },
};

test("all recognized sources keep their proportions, including Direct and cashback", () => {
  const api = runtime();
  const rows = {};
  const originals = { SEO: 60, Директ: 30, "Рек/кешбэк": 10 };
  for (const [source, value] of Object.entries({ ...originals, Другие: 50 })) {
    Object.assign(api.aggregate(rows, "2026-09-01", "МСК", source), {
      leads: value, qualified: value, sales: value, revenue: value, budget: value,
    });
  }
  api.redistribute(rows, { byMonthCity: {} }, []);
  for (const [source, value] of Object.entries(originals)) {
    for (const metric of fields.metrics) assert.equal(rows[`2026-09-01|МСК|${source}`][metric], value * 1.5);
  }
  assert.equal(rows["2026-09-01|МСК|Другие"].leads, 0);
});

test("each metric uses its own original proportions", () => {
  const api = runtime();
  const rows = {};
  Object.assign(api.aggregate(rows, "2026-09-01", "МСК", "SEO"), { leads: 80, qualified: 30, sales: 10 });
  Object.assign(api.aggregate(rows, "2026-09-01", "МСК", "Директ"), { leads: 20, qualified: 70, sales: 90 });
  Object.assign(api.aggregate(rows, "2026-09-01", "МСК", "Другие"), { leads: 50, qualified: 50, sales: 50 });
  api.redistribute(rows, { byMonthCity: {} }, []);
  assert.equal(rows["2026-09-01|МСК|SEO"].leads, 120);
  assert.equal(rows["2026-09-01|МСК|SEO"].qualified, 45);
  assert.equal(rows["2026-09-01|МСК|SEO"].sales, 15);
});

test("monthly source proportions survive uneven unknown traffic while daily totals stay unchanged", () => {
  const api = runtime();
  const rows = {};
  for (const [date, seo, direct, other] of [["2026-09-01", 80, 20, 90], ["2026-09-02", 20, 80, 10]]) {
    api.aggregate(rows, date, "МСК", "SEO").leads = seo;
    api.aggregate(rows, date, "МСК", "Директ").leads = direct;
    api.aggregate(rows, date, "МСК", "Другие").leads = other;
  }
  api.redistribute(rows, null, []);
  for (const source of ["SEO", "Директ"]) assert.equal(Object.values(rows).filter(r => r.source === source).reduce((n, r) => n + r.leads, 0), 150);
  assert.equal(Object.values(rows).filter(r => r.date === "2026-09-01").reduce((n, r) => n + r.leads, 0), 190);
  assert.equal(Object.values(rows).filter(r => r.date === "2026-09-02").reduce((n, r) => n + r.leads, 0), 110);
});

test("rounding preserves totals, zero sources stay zero, and cities do not mix", () => {
  const api = runtime();
  const rows = {};
  for (const city of ["МСК", "СПБ"]) {
    for (const [source, value] of Object.entries({ SEO: 2, "Яндекс Карты": 1, Директ: 0, Другие: 2 })) {
      api.aggregate(rows, "2026-09-01", city, source).leads = value;
    }
  }
  api.redistribute(rows, { byMonthCity: {} }, []);
  for (const city of ["МСК", "СПБ"]) {
    assert.equal(rows[`2026-09-01|${city}|SEO`].leads, 3);
    assert.equal(rows[`2026-09-01|${city}|Яндекс Карты`].leads, 2);
    assert.equal(rows[`2026-09-01|${city}|Директ`].leads, 0);
    assert.equal(Object.values(rows).filter(r => r.city === city).reduce((n, r) => n + r.leads, 0), 5);
  }
});

test("source quotas preserve monthly proportions and every daily total across varied inputs", () => {
  const api = runtime();
  for (let scenario = 1; scenario <= 40; scenario += 1) {
    const rows = {};
    const dailyTotals = {};
    const original = { SEO: 0, Директ: 0, "Рек/кешбэк": 0 };
    let otherTotal = 0;
    for (let day = 1; day <= 8; day += 1) {
      const date = `2026-09-${String(day).padStart(2, "0")}`;
      dailyTotals[date] = 0;
      for (const [index, source] of Object.keys(original).entries()) {
        const value = (scenario * (index + 3) + day * 7) % 19;
        api.aggregate(rows, date, "МСК", source).leads = value;
        original[source] += value;
        dailyTotals[date] += value;
      }
      const other = (scenario * day) % 31;
      api.aggregate(rows, date, "МСК", "Другие").leads = other;
      otherTotal += other;
      dailyTotals[date] += other;
    }
    api.redistribute(rows, null, []);
    const knownTotal = Object.values(original).reduce((n, value) => n + value, 0);
    for (const [source, before] of Object.entries(original)) {
      const after = Object.values(rows).filter(row => row.source === source).reduce((n, row) => n + row.leads, 0);
      assert.ok(Math.abs(after - before - otherTotal * before / knownTotal) < 1);
    }
    for (const [date, expected] of Object.entries(dailyTotals)) assert.equal(Object.values(rows).filter(row => row.date === date).reduce((n, row) => n + row.leads, 0), expected);
  }
});

test("a day without known sources uses frozen period proportions rather than equal shares", () => {
  const api = runtime();
  const rows = {};
  api.aggregate(rows, "2026-09-01", "МСК", "SEO").leads = 80;
  api.aggregate(rows, "2026-09-01", "МСК", "Директ").leads = 20;
  api.aggregate(rows, "2026-09-02", "МСК", "Другие").leads = 10;
  api.redistribute(rows, { byMonthCity: {} }, []);
  assert.equal(rows["2026-09-02|МСК|SEO"].leads, 8);
  assert.equal(rows["2026-09-02|МСК|Директ"].leads, 2);
});

test("no known metric is an explicit failure, never an invented equal split", () => {
  const api = runtime();
  const rows = {};
  api.aggregate(rows, "2026-09-01", "МСК", "Другие").sales = 4;
  assert.throws(() => api.redistribute(rows, { byMonthCity: {} }, []), /пропорц|распознан/i);
});

test("messengers and unknown labels take precedence over unrelated domain labels", () => {
  const api = runtime();
  for (const name of ["Мессенджеры", "Нераспознанное", "Telegram", "WhatsApp", "Ватсап", "Viber", "unknown"]) {
    assert.equal(api.canonical(name, "изи-драйв.рф"), "Другие", name);
  }
  assert.equal(api.canonical("SEO", "изи-драйв.рф"), "SEO");
  assert.equal(api.canonical("Авито", ""), "Авито");
  assert.equal(api.canonical("ВКонтакте", ""), "ВКонтакте");
});

test("source import uses the token-backed API rather than a stale spreadsheet snapshot", () => {
  const api = runtime(`
    syncRoistatRange_ = function(payload, kind) { return { api: kind, fromDate: payload.fromDate }; };
    syncRoistatSourcesFromSheet_ = function() { throw new Error('stale spreadsheet'); };
  `);
  assert.equal(api.sync({ fromDate: "2026-09-01" }).api, "sources");
});

test("temporary Roistat errors retry the identical complete report without dropping metrics", () => {
  const api = runtime(`
    var requests = [];
    fetchRoistatEndpoint_ = function(method, payload) {
      requests.push(JSON.stringify(payload));
      if (requests.length < 2) throw new Error('Roistat HTTP 504: Gateway Time-out');
      return { data: [] };
    };
  `, { Utilities: { sleep() {} } });
  assert.ok(api.fetch({ dimensions: ["source", "city"], metrics: ["leads", "sales"] }, fields, "sources").response);
  assert.equal(api.requests().length, 2);
  assert.equal(api.requests()[0], api.requests()[1]);
});

test("nested API subtotals are not counted again alongside detail rows", () => {
  const api = runtime();
  const response = { data: [{ items: [{
    dimensions: { city: { value: "msk", title: "МСК АШ" } }, metrics: { leads: { value: 10 } },
    items: [{ dimensions: { source: { value: "seo", title: "SEO" } }, metrics: { leads: { value: 10 } } }],
  }] }] };
  const rows = api.extract(response, fields, "2026-09-01");
  assert.equal(rows.reduce((n, r) => n + r.metrics.leads, 0), 10);
  assert.equal(rows[0].dimensions.city, "МСК АШ");
});

test("writer replaces the imported period, ignores message funnels, and marks estimated attribution", () => {
  const api = runtime(`
    var written = [];
    var deleted = [];
    deleteRoistatSourceRowsInRange_ = function(from, to) { deleted.push([from, to]); };
    upsertRowsById_ = function(sheet, headers, rows) { written = rows; return { updated: rows.length }; };
    rebuildWeeklySummary_ = function() {};
    readRoistatDirectMonthlyMetrics_ = function() { throw new Error('unrelated manual Direct table'); };
  `, { Utilities: { formatDate: d => d.toISOString().slice(0, 10) } });
  const raw = [
    { source: "SEO", city: "МСК АШ", leads: 80 },
    { source: "Директ", city: "МСК АШ", leads: 20 },
    { source: "Мессенджеры", city: "МСК АШ", leads: 10 },
    { source: "SEO", city: "МСК АШ Сообщения", leads: 999 },
    { source: "SEO", pipeline: "АШ Сообщения", city: "", leads: 999 },
  ].map(row => ({ dimensions: { source: row.source, city: row.city, domain: "", pipeline: row.pipeline || "" }, metrics: { leads: row.leads }, syncDate: "2026-09-01" }));
  const range = { fromDate: "2026-09-01", toDate: "2026-09-01" };
  api.write(raw, fields, range, []);
  // Inspect the actual records written, not the implementation of the allocation.
  const leads = api.written().filter(r => r.metric === "Лиды");
  assert.equal(leads.reduce((n, r) => n + r.fact, 0), 110);
  assert.equal(leads.find(r => r.channel === "SEO").fact, 88);
  assert.equal(leads.find(r => r.channel === "Директ").fact, 22);
  assert.ok(leads.every(r => r.comment.includes("[SOURCE_ATTRIBUTION=proportional-v1]")));
  assert.equal(api.deleted().length, 1);
  api.write(raw, fields, range, []);
  assert.equal(api.written().filter(r => r.metric === "Лиды").reduce((n, r) => n + r.fact, 0), 110);
});
