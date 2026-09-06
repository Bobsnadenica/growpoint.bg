const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, existsSync } = require("node:fs");
const { resolve } = require("node:path");

test("catalogue and homepage use API profiles, not static fictional fixtures", () => {
  const source = readFileSync(resolve(__dirname, "../src/app/legacy/SiteAppLegacy.tsx"), "utf8");
  assert.doesNotMatch(source, /ExampleProfileCards|example-profiles\.json/);
  assert.ok(!existsSync(resolve(__dirname, "../src/app/components/example-profiles.json")));
  assert.match(source, /featured\.map\(\(consultant\)/);
});

test("retired example links redirect to the catalogue and remain unindexed", () => {
  const shell = readFileSync(resolve(__dirname, "../src/app/layout/AppShell.tsx"), "utf8");
  assert.match(shell, /path="\/examples\/:id" element=\{<Navigate to="\/users" replace \/>\}/);
  for (const route of require("../src/lib/seo-data.json").routes.filter((route) => route.path.startsWith("/examples/"))) {
    assert.equal(route.index, false);
    assert.equal(route.sitemap, false);
    assert.doesNotMatch(route.title, /Димова|Стоянов|Георгиева|Петров|Василева|Тодоров/);
  }
});
