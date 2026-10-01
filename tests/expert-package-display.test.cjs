const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const source = fs.readFileSync("src/lib/expert-package-display.ts", "utf8");
const moduleFixture = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: moduleFixture.exports, module: moduleFixture, Intl, Date });
const { expertPackageRank, sessionMonthInSofia, hasMonthlyFreeSession } = moduleFixture.exports;

test("all display surfaces can rank Spotlight above Grow above Start", () => {
  assert.equal(expertPackageRank({ packageTier: "spotlight" }), 2);
  assert.equal(expertPackageRank({ packageTier: "grow" }), 1);
  assert.equal(expertPackageRank({}), 0);
  const legacy = fs.readFileSync("src/app/legacy/SiteAppLegacy.tsx", "utf8");
  assert.match(legacy, /const packageDiff = getConsultantPackageRank\(right.consultant\)/);
  assert.match(legacy, /expertPackageRank\(right.consultant\) - expertPackageRank\(left.consultant\)/);
});

test("free-session month respects Sofia at UTC month boundaries and daylight saving", () => {
  assert.equal(sessionMonthInSofia("2026-09-30T22:30:00Z"), "2026-10");
  assert.equal(sessionMonthInSofia("2026-12-31T22:30:00Z"), "2027-01");
  assert.equal(sessionMonthInSofia("invalid"), "");
  assert.equal(hasMonthlyFreeSession({ monthlyFreeSessionAvailableMonths: ["2026-10"] }, "2026-09-30T22:30:00Z"), true);
  assert.equal(hasMonthlyFreeSession({}, "2026-10-01T12:00:00Z"), false);
});

test("booking UI does not combine points and monthly offer and labels free price", () => {
  const source = fs.readFileSync("src/app/legacy/SiteAppLegacy.tsx", "utf8");
  assert.match(source, /useMonthlyFreeSession: useMonthlyFreeSession && hasMonthlyFreeSession/);
  assert.match(source, /if \(event.target.checked\) setUseFreePoints\(false\)/);
  assert.match(source, /if \(event.target.checked\) setUseMonthlyFreeSession\(false\)/);
  assert.match(source, /Цветова визия · Spotlight/);
  assert.match(source, /<SpotlightShowcase profiles=\{homeConsultants\}/);
});
