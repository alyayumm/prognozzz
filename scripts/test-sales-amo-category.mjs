import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../apps-script/AppsScript.gs", import.meta.url), "utf8");

runInNewContext(`${source}

function assertCase(name, condition) {
  if (!condition) throw new Error(name);
}

assertCase("A is not double A+B", salesAmoIsAB_("A") === false);
assertCase("B is not double A+B", salesAmoIsAB_("B") === false);
assertCase("Latin A+B is double", salesAmoIsAB_("A+B") === true);
assertCase("Latin AB is double", salesAmoIsAB_("AB") === true);
assertCase("Cyrillic А+В is double", salesAmoIsAB_("А+В") === true);
assertCase("Regular deal count is 1", salesAmoDealCount_({ isDoubleAB: false }) === 1);
assertCase("A+B deal count is 2", salesAmoDealCount_({ isDoubleAB: true }) === 2);
`, {
  console,
});

console.log("sales amo category logic ok");
