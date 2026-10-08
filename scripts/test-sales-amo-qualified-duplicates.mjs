import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../apps-script/AppsScript.gs", import.meta.url), "utf8");

runInNewContext(`${source}

function assertCase(name, condition) {
  if (!condition) throw new Error(name);
}

const duplicateCachedLead = {
  status_id: "143",
  cachedNormalized: {
    id: "amocrm-lead-duplicate-target",
    leadId: "duplicate-target",
    pipeline: "МСК АШ",
    stage: "\\u0437\\u0430\\u043a\\u0440\\u044b\\u0442\\u043e \\u0438 \\u043d\\u0435\\u0440\\u0435\\u0430\\u043b\\u0438\\u0437\\u043e\\u0432\\u0430\\u043d\\u043e(\\u0434\\u0443\\u0431\\u043b\\u044c \\u0446\\u0435\\u043b\\u0435\\u0432\\u043e\\u0439)",
    city: "МСК",
    manager: "Test Manager",
    createdDate: "2026-10-04",
    closedDate: "",
    isQualified: true,
    isNotQualifiedYet: false,
    isWon: false,
    isVip: false,
    isDistant: false,
    isAB: false,
    isDoubleAB: false,
    category: "",
    budget: 0,
    leadType: "",
    typeLabel: "",
    url: "",
    excludeReason: "",
    lossReasonId: "",
    lossReasonName: "\\u0434\\u0443\\u0431\\u043b\\u044c \\u0446\\u0435\\u043b\\u0435\\u0432\\u043e\\u0439",
  },
};

const normalizedDuplicate = salesNormalizeAmoLead_(duplicateCachedLead, { users: {}, pipelines: {}, statuses: {} }, { monthKey: "2026-10" });

assertCase("target duplicate from cached amo leads is not qualified", normalizedDuplicate.isQualified === false);
assertCase("target duplicate from cached amo leads is not waiting for qualification", normalizedDuplicate.isNotQualifiedYet === false);
`, {
  console,
  Utilities: {
    formatDate(date) {
      return date.toISOString().slice(0, 10);
    },
  },
  Session: {
    getScriptTimeZone() {
      return "Europe/Moscow";
    },
  },
});

console.log("sales amo qualified duplicate logic ok");
