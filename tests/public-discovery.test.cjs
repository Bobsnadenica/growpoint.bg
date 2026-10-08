const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const source = path => readFileSync(require.resolve(`../${path}`), "utf8");
const legacy = source("src/app/legacy/SiteAppLegacy.tsx");
const file = ts.createSourceFile("legacy.tsx", legacy, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const compile = text => ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
function find(predicate, root = file) {
  let found;
  const visit = node => { if (!found && predicate(node)) found = node; else if (!found) ts.forEachChild(node, visit); };
  visit(root); assert.ok(found, "Expected discovery source node"); return found;
}
const fn = name => find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
function run(node, context) {
  vm.runInNewContext(compile(`this.run = ${node.getText(file)};`), context);
  return context.run;
}
function helpers() {
  const context = { exports: {}, Intl, Date };
  vm.runInNewContext(compile(source("src/lib/expert-package-display.ts")), context);
  context.expertPackageRank = context.exports.expertPackageRank;
  const declarations = file.statements.filter(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(item => item.name.getText(file).startsWith("MATCH_")));
  const names = ["tokenizeText", "formatSignalLabel", "getConsultantProfileType", "getConsultantPackageRank", "getConsultantIdealFor", "getConsultationTopics", "getProfileSignalTokens", "getConsultantSignalTokens", "getConsultantMatch", "getPersonaMatch"];
  vm.runInNewContext(compile([...declarations, ...names.map(fn)].map(node => node.getText(file)).join("\n") + `\nthis.helpers = { ${names.join(",")} };`), context);
  return Object.assign(context, context.helpers);
}
const presetsContext = { exports: {} };
vm.runInNewContext(compile(source("src/lib/personas.ts")), presetsContext);
const presets = presetsContext.exports.personaPresets;
const expert = (consultantId, overrides = {}) => ({ consultantId, profileType: "consultant", packageTier: "start", headline: "", bio: "", experienceSummary: "", specializations: [], tags: [], idealFor: [], consultationTopics: [], rating: 4.9, reviewCount: 3, featured: false, ...overrides });
const plain = value => JSON.parse(JSON.stringify(value));

test("discovery retains AI and CV without accepting arbitrary two-letter noise", () => {
  const tokens = helpers().tokenizeText("AI CV on to xx and for the with Кариера");
  assert.ok(tokens.includes("ai")); assert.ok(tokens.includes("cv")); assert.ok(tokens.includes("кариера"));
  for (const noise of ["on", "to", "xx", "and", "for", "the", "with"]) assert.ok(!tokens.includes(noise), noise);
});

test("topic matching accepts AI-only expertise, rejects generic skills, and respects persona type", () => {
  const { getPersonaMatch } = helpers();
  const ai = presets.find(preset => preset.id === "ai-technology");
  const career = presets.find(preset => preset.id === "career-leadership");
  const creative = presets.find(preset => preset.id === "creative-practical");
  assert.ok(getPersonaMatch(ai, expert("ai", { headline: "AI" })));
  assert.ok(getPersonaMatch(career, expert("cv", { headline: "CV" })));
  assert.equal(getPersonaMatch(ai, expert("unrelated", { headline: "Лидерство" })), null);
  assert.equal(getPersonaMatch(creative, expert("generic", { headline: "Лидерски умения и skills" })), null);
  assert.equal(getPersonaMatch({ ...ai, type: "mentor" }, expert("wrong-type", { headline: "AI" })), null);
  assert.equal(getPersonaMatch(null, expert("no-topic")), null);
});

test("actual directory ranking excludes unrelated paid experts and combines topic, type and rating", () => {
  const declaration = find(node => ts.isVariableDeclaration(node) && node.name.getText(file) === "rankedConsultants");
  const callback = declaration.initializer.arguments[0];
  const context = { ...helpers(), persona: presets.find(preset => preset.id === "ai-technology"), kind: "all", recommendedOnly: false, profile: null,
    consultants: [expert("start", { headline: "AI" }), expert("unrelated-spotlight", { headline: "Лидерство", packageTier: "spotlight", rating: 5 }), expert("spotlight", { headline: "AI", packageTier: "spotlight", rating: 4.5 }), expert("mentor", { headline: "AI", profileType: "mentor" }), expert("low-grow", { headline: "AI", packageTier: "grow", rating: 4.49 })] };
  const rank = run(callback, context);
  const ids = () => Array.from(rank(), item => item.consultant.consultantId);
  assert.deepEqual(ids(), ["spotlight", "low-grow", "start", "mentor"]);
  context.recommendedOnly = true;
  assert.deepEqual(ids(), ["spotlight", "start", "mentor"]);
  context.consultants.push(expert("unreviewed", { headline: "AI", packageTier: "spotlight", rating: 5, reviewCount: 0 }));
  assert.deepEqual(ids(), ["spotlight", "start", "mentor"]);
  context.kind = "mentor";
  assert.deepEqual(ids(), ["mentor"]);
  context.persona = null; context.kind = "all";
  assert.ok(ids().includes("unrelated-spotlight"));
});

test("committed URL filters preserve other selections and explicit reset removes all filters", () => {
  const context = { query: "AI", city: "София", queryDraft: "unsubmitted query", cityDraft: "unsubmitted city", kind: "mentor", recommendedOnly: true, persona: { id: "ai-technology" } };
  const build = run(fn("buildSearchParams"), context);
  assert.deepEqual(plain(build({ persona: "finance" })), { q: "AI", city: "София", kind: "mentor", recommended: "1", persona: "finance" });
  assert.deepEqual(plain(build({ query: "CV", city: "" })), { q: "CV", kind: "mentor", recommended: "1", persona: "ai-technology" });
  assert.deepEqual(plain(build({ query: "", city: "", kind: "all", recommendedOnly: false, persona: null })), {});
  const calls = [];
  context.buildSearchParams = build;
  context.setSearchParams = value => calls.push(plain(value));
  context.applyDirectoryFilters = run(fn("applyDirectoryFilters"), context);
  run(fn("selectPersona"), context)(presets.find(preset => preset.id === "finance"));
  assert.deepEqual(calls, [{ q: "AI", city: "София", recommended: "1", persona: "finance" }]);
});

test("native search submission trims and commits once while URL navigation resynchronizes drafts", () => {
  const calls = [];
  const context = { query: "old", city: "old city", queryDraft: "  CV  ", cityDraft: "  София  ", kind: "mentor", recommendedOnly: true, persona: { id: "career-leadership" }, setSearchParams: value => calls.push(plain(value)) };
  context.buildSearchParams = run(fn("buildSearchParams"), context);
  context.applyDirectoryFilters = run(fn("applyDirectoryFilters"), context);
  let prevented = false;
  run(fn("handleDirectorySearch"), context)({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.deepEqual(calls, [{ q: "CV", city: "София", kind: "mentor", recommended: "1", persona: "career-leadership" }]);
  const users = fn("UsersPage");
  const sync = find(node => ts.isCallExpression(node) && node.expression.getText(file) === "useEffect" && node.arguments[0]?.getText(file).includes("setQueryDraft(query)") && node.arguments[0]?.getText(file).includes("setCityDraft(city)"), users);
  const drafts = {};
  const syncContext = { query: "back query", city: "back city", setQueryDraft: value => drafts.query = value, setCityDraft: value => drafts.city = value };
  run(sync.arguments[0], syncContext)();
  assert.deepEqual(drafts, { query: "back query", city: "back city" });
  assert.deepEqual(sync.arguments[1].elements.map(item => item.getText(file)), ["query", "city"]);
  const load = find(node => ts.isCallExpression(node) && node.expression.getText(file) === "useEffect" && node.arguments[0]?.getText(file).includes(".listConsultants({ query, city })"), users);
  assert.deepEqual(load.arguments[1].elements.map(item => item.getText(file)), ["city", "query", "publicRevision"]);
});

test("directory controls expose real form and pressed states without the retired no-op filter", () => {
  const users = fn("UsersPage").getText(file);
  assert.match(users, /<form\b[^>]*onSubmit=\{handleDirectorySearch\}/);
  assert.match(users, /onChange=\{\(event\) => setQueryDraft\(event\.target\.value\)\}/);
  assert.match(users, /onChange=\{\(event\) => setCityDraft\(event\.target\.value\)\}/);
  assert.match(users, /aria-pressed=\{kind === option\.value\}/);
  assert.match(users, /aria-pressed=\{recommendedOnly\}/);
  assert.match(users, /С оценка 4\.5\+/);
  assert.doesNotMatch(users, /topOnly|params\.top|searchParams\.get\("top"\)|Водещи профили/);
  assert.match(users, /actionTo=\{hasActiveFilters \? undefined : "\/(?:contact|#how-it-works)"\}/);
  assert.match(users, /onAction=\{hasActiveFilters/);
  assert.match(users, /role="status"[^>]*aria-live="polite"/);
});
