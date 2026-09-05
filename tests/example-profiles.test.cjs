const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { createRequire } = require("node:module");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const filename = resolve(__dirname, "../src/app/components/ExampleProfileCards.tsx");
const code = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
const component = { exports: {} };
new Function("require", "module", "exports", code)(createRequire(filename), component, component.exports);

test("homepage examples are labelled, non-bookable and limited to remaining showcase slots", () => {
  for (const count of [0, 1, 2, 3]) {
    const html = renderToStaticMarkup(React.createElement(component.exports.default, { count }));
    assert.equal((html.match(/<article /g) || []).length, count);
    assert.equal((html.match(/class="example-profile__badge">Example \/ Пример/g) || []).length, count);
    assert.doesNotMatch(html, /<(button|form|input)\b/);
    assert.equal((html.match(/href="\/examples\//g) || []).length, count);
    assert.doesNotMatch(html, /reviewCount|rating|https?:\/\//);
  }
});

const profiles = require("../src/app/components/example-profiles.json");
test("every catalogue category has exactly one complete fictional profile and a local portrait", () => {
  const personas = readFileSync(resolve(__dirname, "../src/lib/personas.ts"), "utf8");
  const ids = [...personas.matchAll(/id: "([^"]+)"/g)].map((match) => match[1]);
  assert.equal(profiles.length, 6);
  assert.deepEqual(profiles.map((profile) => profile.category).sort(), ids.sort());
  for (const profile of profiles) {
    for (const key of ["description", "experience", "audience", "outcomes"]) assert.ok(profile[key].length > 30, key);
    assert.ok(profile.education.length > 10);
    assert.equal(profile.approach.length, 3);
    assert.ok(profile.topics.length >= 3);
    assert.ok(profile.languages.length);
    assert.ok(readFileSync(resolve(__dirname, "../public" + profile.photo)).length > 1000);
    const html = renderToStaticMarkup(React.createElement(component.exports.default, { count: 6, category: profile.category }));
    assert.equal((html.match(/<article /g) || []).length, 1);
    assert.ok(html.includes(`href="/examples/${profile.id}"`));
    assert.ok(html.includes("AI портрет"));
  }
});

test("all example detail routes are generated but excluded from search indexing", () => {
  const routes = require("../src/lib/seo-data.json").routes;
  for (const profile of profiles) {
    const route = routes.find((item) => item.path === `/examples/${profile.id}`);
    assert.ok(route);
    assert.equal(route.index, false);
    assert.equal(route.sitemap, false);
    assert.equal(route.renderStatic, true);
  }
});

test("examples respect catalogue text, city and role filters without using real accounts", () => {
  for (const filters of [{ query: "несъществуващтекст" }, { city: "Лондон" }, { category: "finance", kind: "mentor" }]) {
    assert.equal(renderToStaticMarkup(React.createElement(component.exports.default, { count: 6, ...filters })), "");
  }
  const html = renderToStaticMarkup(React.createElement(component.exports.default, { count: 6, query: "александра", city: "София", kind: "consultant" }));
  assert.equal((html.match(/<article /g) || []).length, 1);
  assert.doesNotMatch(JSON.stringify(profiles), /cognito|userId|email|password|reviewCount|rating/);
});
