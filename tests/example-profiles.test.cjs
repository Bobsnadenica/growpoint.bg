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
    assert.doesNotMatch(html, /<(a|button|form|input)\b/);
    assert.doesNotMatch(html, /reviewCount|rating|https?:\/\//);
  }
});
