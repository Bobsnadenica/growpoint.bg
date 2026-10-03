const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const source = path => readFileSync(require.resolve(`../${path}`), "utf8");
const PANEL = "src/app/components/ScheduledDeletionPanel.tsx";

function compile(path, requireModule = require) {
  const context = { exports: {}, require: requireModule, Date, Intl };
  vm.runInNewContext(ts.transpileModule(source(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
  }).outputText, context);
  return context.exports;
}
const helpers = compile("src/lib/account-deletion.ts");
const futureProfile = () => ({ userId: "fixture-client", name: "Fixture", role: "client",
  deletionScheduledAt: new Date().toISOString(), deletionEffectiveAt: new Date(Date.now() + 86400000).toISOString() });

function extract(name, context, path = PANEL) {
  const file = ts.createSourceFile(path, source(path), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found;
  const visit = node => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node;
    else ts.forEachChild(node, visit);
  };
  visit(file); assert.ok(found, name);
  vm.runInNewContext(ts.transpileModule(`${found.getText(file)}\nthis.run = ${name};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 }
  }).outputText, context);
  return context.run;
}
function fixture() {
  const calls = [], errors = [];
  return { ...helpers, Error, calls, errors, profile: futureProfile(), token: "fixture-token", activeToken: { current: "fixture-token" },
    operation: { current: false }, busy: false, needsRefresh: false,
    setAction: value => calls.push(["action", value]), setError: value => errors.push(value),
    setNeedsRefresh: value => calls.push(["refresh-needed", value]),
    onCancelled: () => calls.push("cancelled"), onRefresh: () => calls.push("refresh"),
    onLogout: async () => calls.push("logout"),
    api: { cancelMyAccountDeletion: async () => ({ cancelled: true, deletionScheduledAt: null, deletionEffectiveAt: null }), getMyProfile: async () => futureProfile() }
  };
}

test("pending deletion is detected from either date and cancellation has a strict, valid future deadline", () => {
  const deadline = Date.parse("2026-11-01T10:00:00Z");
  const profile = { deletionScheduledAt: "2026-10-25T10:00:00Z", deletionEffectiveAt: "2026-11-01T10:00:00Z" };
  assert.equal(helpers.hasPendingAccountDeletion(null), false);
  assert.equal(helpers.hasPendingAccountDeletion({ deletionEffectiveAt: profile.deletionEffectiveAt }), true);
  assert.equal(helpers.hasPendingAccountDeletion({ deletionScheduledAt: profile.deletionScheduledAt }), true);
  assert.equal(helpers.canCancelAccountDeletion(profile, deadline - 1), true);
  assert.equal(helpers.canCancelAccountDeletion(profile, deadline), false);
  assert.equal(helpers.canCancelAccountDeletion(profile, deadline + 1), false);
  assert.equal(helpers.canCancelAccountDeletion({ deletionScheduledAt: "scheduled", deletionEffectiveAt: "invalid" }, deadline), false);
  assert.equal(helpers.canCancelAccountDeletion({ deletionScheduledAt: "scheduled" }, deadline), false);
});

test("cancel posts once and clears state only after a server-confirmed cancellation", async () => {
  const context = fixture();
  let resolve;
  context.api.cancelMyAccountDeletion = async token => { context.calls.push(["post", token]); return new Promise(done => { resolve = done; }); };
  const cancel = extract("cancelDeletion", context);
  const first = cancel(); await cancel();
  assert.equal(context.calls.filter(call => call[0] === "post").length, 1);
  assert.equal(context.calls.includes("cancelled"), false);
  resolve({ cancelled: true, deletionScheduledAt: null, deletionEffectiveAt: null }); await first;
  assert.equal(context.calls.includes("cancelled"), true);
  assert.equal(context.operation.current, false);
});

test("expired, invalid or refresh-required cancellation never calls the API", async () => {
  for (const override of [{ profile: { deletionScheduledAt: "scheduled", deletionEffectiveAt: "2020-01-01" } }, { profile: { deletionScheduledAt: "scheduled" } }, { needsRefresh: true }, { busy: true }]) {
    const context = { ...fixture(), ...override };
    context.api.cancelMyAccountDeletion = async () => { throw new Error("Unexpected request"); };
    await extract("cancelDeletion", context)();
    assert.equal(context.calls.length, 0);
  }
});

test("failed or malformed cancellation remains pending and requires a manual read before retry", async () => {
  for (const response of ["network failure", { cancelled: true, deletionScheduledAt: "still scheduled", deletionEffectiveAt: null }]) {
    const context = fixture();
    context.api.cancelMyAccountDeletion = async () => { if (typeof response === "string") throw new Error(response); return response; };
    await extract("cancelDeletion", context)();
    assert.equal(context.calls.includes("cancelled"), false);
    assert.ok(context.errors.at(-1));
    assert.ok(context.calls.some(call => call[0] === "refresh-needed" && call[1] === true));
    await extract("refreshStatus", context)();
    assert.equal(context.calls.includes("refresh"), true);
    assert.ok(context.calls.some(call => call[0] === "refresh-needed" && call[1] === false));
  }
});

test("manual status read recovers an already-cancelled operation without another mutation", async () => {
  const context = fixture();
  context.api.getMyProfile = async () => ({ userId: "fixture-client", deletionScheduledAt: null, deletionEffectiveAt: null });
  await extract("refreshStatus", context)();
  assert.equal(context.calls.includes("cancelled"), true);
  assert.equal(context.calls.includes("refresh"), false);
  context.api.getMyProfile = async () => { throw new Error("Unavailable"); };
  context.calls.length = 0;
  await extract("refreshStatus", context)();
  assert.equal(context.calls.includes("cancelled"), false);
  assert.equal(context.errors.at(-1), "Unavailable");
});

test("logout is read-only and an old session cannot update a new account", async () => {
  const context = fixture();
  await extract("leave", context)();
  assert.equal(context.calls.includes("logout"), true);
  context.activeToken.current = "different-session";
  context.calls.length = 0;
  await extract("cancelDeletion", context)();
  assert.equal(context.calls.includes("cancelled"), false);
});

test("pending client or admin dashboard skips all ordinary protected reads", async () => {
  const file = ts.createSourceFile("legacy.tsx", source("src/app/legacy/SiteAppLegacy.tsx"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let loader;
  const visit = node => {
    if (ts.isArrowFunction(node) && node.parameters[0]?.name.getText(file) === "nextProfile" && node.getText(file).includes("api.listBookings(token)")) loader = node;
    else ts.forEachChild(node, visit);
  };
  visit(file); assert.ok(loader);
  const calls = [];
  const context = { ...helpers, Promise, mounted: true, token: "fixture-token", isAdmin: false, navigate: path => calls.push(path),
    api: { listBookings: () => { throw new Error("Unexpected bookings read"); }, getMyConsultantProfile: () => { throw new Error("Unexpected consultant read"); }, listConsultants: () => { throw new Error("Unexpected directory read"); }, listMyNotifications: () => { throw new Error("Unexpected notifications read"); } } };
  vm.runInNewContext(ts.transpileModule(`this.run = ${loader.getText(file)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  for (const isAdmin of [false, true]) {
    context.isAdmin = isAdmin;
    const profile = futureProfile();
    const result = await context.run(profile);
    assert.equal(result[0], profile);
    assert.equal(result[1].length, 0);
    assert.equal(calls.length, 0);
  }
});

test("cancel API uses the current token, POST empty body, and profile read publishes cleared dates", async () => {
  const calls = [], events = [];
  const context = { exports: {}, Headers, FormData, AbortController, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    window: { setTimeout, clearTimeout, dispatchEvent: event => events.push(event) },
    require: path => path === "./config" ? { config: { apiBaseUrl: "https://fixture.invalid" }, isApiConfigured: true } : {},
    fetch: async (url, options) => { calls.push({ url, options }); return { ok: true, status: 200, json: async () => ({ userId: "fixture-client", name: "Fixture", cancelled: true, deletionScheduledAt: null, deletionEffectiveAt: null }) }; } };
  vm.runInNewContext(ts.transpileModule(source("src/lib/api.ts"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  await context.exports.api.cancelMyAccountDeletion("current-fixture-token");
  assert.equal(calls[0].url, "https://fixture.invalid/me/deletion/cancel");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.body, "{}");
  assert.equal(calls[0].options.headers.get("Authorization"), "Bearer current-fixture-token");
  await context.exports.api.getMyProfile("current-fixture-token");
  assert.equal(events[0].detail.deletionScheduledAt, null);
  assert.equal(events[0].detail.deletionEffectiveAt, null);
});

function generationFixture() {
  const events = [], reads = [];
  const response = profile => ({ ok: true, status: 200, json: async () => profile });
  const context = { exports: {}, Headers, FormData, AbortController, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    window: { setTimeout, clearTimeout, dispatchEvent: event => events.push(event.detail) },
    require: path => path === "./config" ? { config: { apiBaseUrl: "https://fixture.invalid" }, isApiConfigured: true }
      : path === "./auth-flow" ? { readInviteToken: () => null, readReferralCode: () => null } : {},
    fetch: async (url, options) => {
      if (options.method !== "POST" && options.method !== "PUT") return new Promise(resolve => reads.push(profile => resolve(response(profile))));
      if (url.endsWith("/me/deletion/cancel")) return response({ cancelled: true, deletionScheduledAt: null, deletionEffectiveAt: null });
      return response({ name: "New name", deletionScheduledAt: null, deletionEffectiveAt: null });
    } };
  vm.runInNewContext(ts.transpileModule(source("src/lib/api.ts"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return { api: context.exports.api, events, reads };
}

test("older profile GET cannot overwrite the header after profile save, bootstrap or expert-name save", async () => {
  for (const write of ["updateMyProfile", "bootstrapUser", "updateMyConsultantProfile"]) {
    const fixture = generationFixture();
    const oldRead = fixture.api.getMyProfile("fixture-token");
    await fixture.api[write]("fixture-token", { name: "New name" });
    assert.equal(fixture.events.length, 1);
    assert.equal(fixture.events[0].name, "New name");
    fixture.reads[0]({ name: "Old name", deletionScheduledAt: "scheduled", deletionEffectiveAt: "2099-01-01" });
    await oldRead;
    assert.equal(fixture.events.length, 1);
    assert.equal(fixture.events[0].name, "New name");
  }
});

test("older pending profile GET cannot restore deletion dates after confirmed cancellation", async () => {
  const fixture = generationFixture();
  const oldRead = fixture.api.getMyProfile("fixture-token");
  await fixture.api.cancelMyAccountDeletion("fixture-token");
  assert.equal(fixture.events[0].deletionScheduledAt, null);
  assert.equal(fixture.events[0].name, undefined);
  fixture.reads[0]({ name: "Old name", deletionScheduledAt: "scheduled", deletionEffectiveAt: "2099-01-01" });
  await oldRead;
  assert.equal(fixture.events.length, 1);
  assert.equal(fixture.events[0].deletionScheduledAt, null);
});

test("single-token generations reject stale reads across a token change and back", async () => {
  const fixture = generationFixture();
  const firstA = fixture.api.getMyProfile("fixture-a");
  const firstB = fixture.api.getMyProfile("fixture-b");
  const currentA = fixture.api.getMyProfile("fixture-a");
  fixture.reads[2]({ name: "Current A" }); await currentA;
  fixture.reads[0]({ name: "Stale A" }); await firstA;
  fixture.reads[1]({ name: "Stale B" }); await firstB;
  assert.equal(fixture.events.length, 1);
  assert.equal(fixture.events[0].name, "Current A");
  assert.doesNotMatch(source("src/app/layout/AppShell.tsx"), /api\.getMyProfile\(token\)\.then\(profile =>/);
});

test("pending screen is accessible, deadline is explicitly Sofia time and expired cancellation is disabled", () => {
  const { default: Panel } = compile(PANEL, path => path === "../../lib/api" ? { api: {} }
    : path === "../../lib/account-deletion" ? helpers : path === "react-router-dom" ? { Link: ({to,children}) => React.createElement("a", {href:to}, children) }
    : path.endsWith(".css") ? {} : require(path));
  const props = { token: "fixture-token", profile: futureProfile(), refreshing: false, exporting: false, exportError: "", exportMessage: "", onCancelled() {}, onRefresh() {}, async onExport() {}, async onLogout() {} };
  const html = renderToStaticMarkup(React.createElement(Panel, props));
  assert.match(html, /aria-labelledby="scheduled-deletion-title"/);
  assert.match(html, /българско време/);
  for (const control of ["Отмени изтриването", "Провери статуса", "Свали моите данни", "Изход"]) assert.ok(html.includes(control));
  assert.match(html, /href="\/contact"/);
  const expired = renderToStaticMarkup(React.createElement(Panel, { ...props, profile: { ...props.profile, deletionEffectiveAt: "2020-01-01T00:00:00Z" } }));
  assert.match(expired, /disabled="">Отмени изтриването/);
  assert.match(source("src/app/components/ScheduledDeletionPanel.css"), /min-height: 44px/);
  assert.match(source("src/app/components/ScheduledDeletionPanel.css"), /:root\[data-theme="dark"\]/);
  const legacy = source("src/app/legacy/SiteAppLegacy.tsx");
  assert.ok(legacy.indexOf("<ScheduledDeletionPanel") < legacy.indexOf("async function cancelBookingAction"));
  assert.match(legacy, /влез отново и избери „Отмени изтриването“/);
  const shell = source("src/app/layout/AppShell.tsx");
  assert.match(shell, /\(awaitingTerms \|\| awaitingDeletion\) && privateRouteWithoutOnboarding/);
  assert.match(shell, /savedIdentity\?\.token !== token \|\| awaitingTerms \|\| awaitingDeletion/);
  assert.match(shell, /path="\/legal" element=\{<Navigate to="\/terms" replace/);
});
