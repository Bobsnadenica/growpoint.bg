const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function readError(url) {
  const source = ts.createSourceFile("auth.tsx", readFileSync(require.resolve("../src/lib/auth.tsx"), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const functions = source.statements.filter(node => ts.isFunctionDeclaration(node) && ["describeOAuthError", "readOAuthErrorFromUrl"].includes(node.name?.text)).map(node => node.getText(source)).join("\n");
  let replaced;
  const context = { URL, URLSearchParams, document: { title: "GrowPoint" }, window: { location: new URL(url), history: { replaceState: (_state, _title, value) => { replaced = value; } } } };
  vm.runInNewContext(ts.transpileModule(functions, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText + "\nthis.result = readOAuthErrorFromUrl();", context);
  return { message: context.result, replaced };
}

test("malformed percent escapes in OAuth errors never crash authentication or expose raw details", () => {
  for (const query of ["error_description=%25", "error_description=%ZZ", "error_description=private-provider-detail"]) {
    const result = readError(`https://example.invalid/auth?${query}&redirect=/dashboard`);
    assert.match(result.message, /не беше завършен/);
    assert.doesNotMatch(result.message, /private-provider|%/);
    assert.equal(result.replaced, "/auth?redirect=%2Fdashboard");
  }
});

test("known provider errors have actionable copy without promising unsupported account linking", () => {
  const result = readError("https://example.invalid/auth?error_description=account%20exists");
  assert.match(result.message, /Вече има профил/);
  assert.doesNotMatch(result.message, /добавиш|LinkedIn/);
});
