const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { renderToStaticMarkup } = require("react-dom/server");
const vm = require("node:vm");
const ts = require("typescript");
const source = readFileSync(require.resolve("../src/app/legacy/SiteAppLegacy.tsx"), "utf8");
const file = ts.createSourceFile("legacy.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(predicate, root = file) {
  let found;
  const visit = node => { if (!found && predicate(node)) found = node; else if (!found) ts.forEachChild(node, visit); };
  visit(root); assert.ok(found, "Expected public consultant content node"); return found;
}
const page = find(node => ts.isFunctionDeclaration(node) && node.name?.text === "ConsultantPage");
function render(node, extra = "") {
  const context = { exports: {}, require: name => {
    assert.equal(name, "react/jsx-runtime"); return require(name);
  } };
  const compiled = ts.transpileModule(`${extra}\nthis.render = (consultant, isOwnProfile = false) => (${node.getText(file)});`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
  }).outputText;
  vm.runInNewContext(compiled, context);
  return context.render;
}

test("actual public hero caps and normalizes biography while retaining experience and empty-profile fallbacks", () => {
  const summary = find(node => ts.isVariableDeclaration(node) && node.name.getText(file) === "profileSummary", page);
  const truncate = find(node => ts.isFunctionDeclaration(node) && node.name?.text === "truncateText");
  const summarize = render(summary.initializer, truncate.getText(file));
  assert.equal(summarize({ bio: "  Кратко\nописание.  ", experienceSummary: "Опит" }), "Кратко описание.");
  assert.equal(summarize({ bio: "", experienceSummary: "Опит и практика" }), "Опит и практика");
  assert.equal(summarize({}), "Профилът все още няма описание на работата.");
  assert.equal(summarize({ bio: "а".repeat(190) }), "а".repeat(190));
  const long = "Примерна биография.\n\n" + "Подробности от практиката. ".repeat(30);
  const shortened = summarize({ bio: long });
  assert.equal(shortened.length, 190);
  assert.ok(shortened.startsWith("Примерна биография. "));
  assert.ok(shortened.endsWith("…"));
  assert.ok(!shortened.includes("\n"));
});

test("complete biography and experience render as escaped multiline text rather than raw HTML", () => {
  for (const field of ["bio", "experienceSummary"]) {
    const paragraph = find(node => ts.isJsxElement(node) && node.openingElement.tagName.getText(file) === "p" && node.getText(file).includes(`{consultant.${field}}`), page);
    const value = "Първи абзац.\n\n<script>alert('fixture')</script>\nСледващ абзац.";
    const html = renderToStaticMarkup(render(paragraph)({ [field]: value }));
    assert.match(html, /class="consultant-detail-panel__text"/);
    assert.match(html, /Първи абзац\.\n\n&lt;script&gt;/);
    assert.match(html, /&lt;\/script&gt;\nСледващ абзац\./);
    assert.doesNotMatch(html, /<script>/);
  }
  const css = readFileSync(require.resolve("../src/styles/global.css"), "utf8");
  assert.match(css, /\.consultant-detail-panel__text\s*\{[^}]*white-space:\s*pre-line;/);
  assert.doesNotMatch(page.getText(file), /dangerouslySetInnerHTML|innerHTML/);
});

test("saved work approach is public, escaped, and omitted when absent or whitespace-only", () => {
  const conditional = find(node => ts.isConditionalExpression(node) && node.condition.getText(file) === "consultant.workApproach?.trim()", page);
  const approach = render(conditional);
  for (const workApproach of [undefined, null, "", "  \n\t"]) {
    assert.equal(approach({ workApproach }), null);
  }
  const html = renderToStaticMarkup(approach({ workApproach: "Преди срещата.\n\nСлед срещата: <ясен план>." }));
  assert.match(html, /<h2>Как протича консултацията<\/h2>/);
  assert.match(html, /class="consultant-detail-panel__text">Преди срещата\.\n\nСлед срещата: &lt;ясен план&gt;\./);
  assert.doesNotMatch(conditional.getText(file), /getConsultantWorkApproach/);
});
