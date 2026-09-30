const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const source = path => readFileSync(require.resolve(`../${path}`), "utf8");

function handler(name, context, path = "src/app/legacy/SiteAppLegacy.tsx") {
  const file = ts.createSourceFile(path, source(path), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found;
  const visit = node => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node;
    else ts.forEachChild(node, visit);
  };
  visit(file);
  assert.ok(found, name);
  const code = ts.transpileModule(found.getText(file), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(`${code}\nthis.run = ${name};`, context);
  return context.run;
}

function authContext(form) {
  const calls = [], errors = [];
  return {
    calls, errors, form: { name: "QA Client", email: "qa@example.invalid", password: "Example123", role: "client", newPassword: "", confirmNewPassword: "", ...form },
    canRegister: true, configured: true, isSocialOnboarding: false, user: null,
    clearFeedback() {}, setError: message => errors.push(message), setMessage() {}, setSubmitting() {}, setForm() {},
    readInviteToken: () => null, registerWithAuth: async input => calls.push(input),
    completeNewPassword: async () => calls.push("new-password"), readPendingBootstrap: () => null,
    writePendingBootstrap() {}, switchScreen() {}, navigate() {}, scorePasswordStrength: () => ({ length: true, lower: true, upper: true, digit: true })
  };
}

test("valid email signup reaches Cognito without nonexistent password-confirmation fields", async () => {
  const context = authContext();
  await handler("handleRegister", context)({ preventDefault() {} });
  assert.equal(context.calls.length, 1);
  assert.equal(context.calls[0].password, "Example123");
  assert.deepEqual(context.errors, []);
});

test("temporary-password completion checks its actual confirmation field", async () => {
  const context = authContext({ newPassword: "Example123", confirmNewPassword: "Different123" });
  await handler("handleNewPasswordRequired", context)({ preventDefault() {} });
  assert.equal(context.calls.length, 0);
  assert.deepEqual(context.errors, ["Двете пароли не съвпадат."]);
});

function apiFixture({ social = false, pending = null, existing = false, status = 404 } = {}) {
  const requests = [];
  let onboarding = 0;
  const authFlow = {
    readInviteToken: () => null, readReferralCode: () => null,
    clearInviteToken() {}, clearReferralCode() {},
    readSocialAuthIntent: () => social ? { mode: "register" } : null,
    readPendingBootstrap: () => pending, markSocialOnboardingPending: () => { onboarding++; }
  };
  const code = ts.transpileModule(source("src/lib/api.ts"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = {
    exports: {}, Headers, FormData, AbortController, Error, Map,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    window: { setTimeout, clearTimeout, dispatchEvent() {} },
    require: path => path === "./auth-flow" ? authFlow : path === "./config" ? { config: { apiBaseUrl: "https://qa.example.invalid" }, isApiConfigured: true } : {},
    fetch: async (url, options) => {
      requests.push({ path: url, body: options.body });
      const creating = url.endsWith("/auth/bootstrap");
      const ok = creating || existing;
      return { ok, status: ok ? 200 : status, text: async () => JSON.stringify({ message: status === 404 ? "Profile not found" : "Unauthorized" }), json: async () => ({ userId: "qa", name: "Provider Name", role: "client" }) };
    }
  };
  vm.runInNewContext(code, context);
  return { api: context.exports.api, requests, onboarding: () => onboarding };
}

test("concurrent social first-login reads share repair, preserve pending fields and flag onboarding once", async () => {
  const fixture = apiFixture({ social: true, pending: { name: "Chosen Name", email: "qa@example.invalid", role: "client", city: "София" } });
  await Promise.all([fixture.api.getMyProfile("fixture-token"), fixture.api.getMyProfile("fixture-token")]);
  const writes = fixture.requests.filter(request => request.path.endsWith("/auth/bootstrap"));
  assert.equal(writes.length, 1);
  assert.equal(JSON.parse(writes[0].body).city, "София");
  assert.equal(JSON.parse(writes[0].body).name, "Chosen Name");
  assert.equal(fixture.onboarding(), 1);
});

test("blank social form fields preserve provider identity and returning users skip onboarding", async () => {
  const first = apiFixture({ social: true, pending: { name: "", email: "", role: "client" } });
  await first.api.getMyProfile("fixture-token");
  const body = JSON.parse(first.requests.find(request => request.body).body);
  assert.equal(body.name, undefined);
  assert.equal(body.email, undefined);
  assert.equal(body.avatarUrl, undefined);
  const returning = apiFixture({ social: true, existing: true });
  await returning.api.getMyProfile("fixture-token");
  assert.equal(returning.onboarding(), 0);
  assert.equal(returning.requests.length, 1);
});

test("ordinary console accounts repair without social onboarding, auth errors never bootstrap", async () => {
  const ordinary = apiFixture();
  await ordinary.api.getMyProfile("fixture-token");
  assert.equal(ordinary.onboarding(), 0);
  const denied = apiFixture({ social: true, status: 401 });
  await assert.rejects(denied.api.getMyProfile("fixture-token"), /Unauthorized/);
  assert.equal(denied.requests.length, 1);
  assert.equal(denied.onboarding(), 0);
});

test("legacy dialogs use shared isolation and files/notifications expose recoverable load failures", () => {
  const legacy = source("src/app/legacy/SiteAppLegacy.tsx");
  for (const name of ["DeleteProfileModal", "SocialOnboardingModal", "ReviewModal", "RescheduleModal"]) {
    const start = legacy.indexOf(`function ${name}(`);
    const end = legacy.indexOf("\nfunction ", start + 1);
    const body = legacy.slice(start, end < 0 ? undefined : end);
    assert.match(body, /useModalFocus\(true, dialogRef/);
    assert.match(body, /ref=\{dialogRef\}/);
    assert.match(body, /aria-label=/);
  }
  assert.match(legacy, /useModalFocus\(sessionsOpen, sessionsDialog/);
  const files = legacy.slice(legacy.indexOf("export function FilesPageBody()"), legacy.indexOf("function UserDocumentList("));
  assert.match(files, /\.catch\(value =>/);
  assert.match(files, /setReloadKey\(current => current \+ 1\)/);
  assert.doesNotMatch(files, /loading \|\| !profile/);
  assert.match(source("src/app/pages/NotificationsPage.tsx"), /role="alert"/);
  assert.match(source("src/lib/use-modal-focus.ts"), /textarea:not\(\[disabled\]\), select:not\(\[disabled\]\)/);
  assert.match(source("src/app/components/NotificationDetailModal.tsx"), /useModalFocus\(true, dialog, onClose\)/);
});

test("dashboard offers real export and does not substitute a stale next-available date", () => {
  const legacy = source("src/app/legacy/SiteAppLegacy.tsx");
  assert.match(legacy, /onClick=\{\(\) => void exportMyDataAction\(\)\}/);
  assert.doesNotMatch(legacy, /getUpcomingAvailabilitySlots\(consultantAvailability, 1\)\[0\] \|\| consultantProfile\?\.nextAvailable/);
  assert.doesNotMatch(legacy, /Потребителят е уведомен по имейл|имейл и на двамата/);
});

test("booking lead time matches the API without dropping near-future owner slots", () => {
  const now = Date.parse("2099-01-01T10:00:00Z");
  class FixedDate extends Date { static now() { return now; } }
  const code = ts.transpileModule(source("src/app/legacy/availability.ts"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = { exports: {}, Date: FixedDate };
  vm.runInNewContext(code, context);
  const slots = ["2099-01-01T09:59:00Z", "2099-01-01T10:01:00Z", "2099-01-01T10:05:00Z", "2099-01-01T10:06:00Z"];
  assert.deepEqual(Array.from(context.exports.getUpcomingAvailabilitySlots(slots)), slots.slice(1));
  assert.deepEqual(Array.from(context.exports.getUpcomingAvailabilitySlots(slots, Infinity, 5)), slots.slice(3));
});

test("static expert routes retain routing without committing per-person metadata", () => {
  const route = handler("consultantRoute", {}, "scripts/site-build.mjs")({ slug: "qa-expert", name: "PRIVATE_NAME", headline: "PRIVATE_HEADLINE", bio: "PRIVATE_BIO", avatarUrl: "https://private.example.invalid/avatar.png" }, { siteName: "GrowPoint", defaultImage: "/assets/default.png" });
  assert.equal(route.path, "/consultants/qa-expert");
  assert.equal(route.renderStatic, true);
  assert.equal(route.image, "/assets/default.png");
  assert.doesNotMatch(JSON.stringify(route), /PRIVATE_|private\.example/);
  assert.match(source("src/app/pages/MemberProfilePage.tsx"), /applyUnavailableProfileSeo\(`\/u\/\$\{id\}`\)/);
  assert.match(source("src/app/legacy/SiteAppLegacy.tsx"), /applyUnavailableProfileSeo\(`\/consultants\/\$\{slug\}`\)/);
  const pricing = JSON.parse(source("src/lib/seo-data.json")).routes.find(route => route.path === "/pricing");
  assert.equal(pricing.renderStatic, true);
  assert.equal(pricing.index, false);
  assert.equal(pricing.canonicalPath, "/users");
});

test("modal keys isolate textarea focus, ignore inert parents and restore the trigger", () => {
  let cleanup, closeCount = 0;
  const listeners = new Map();
  const document = { activeElement: null, body: { style: { overflow: "auto" }, children: [] } };
  class Element {
    constructor() { this.inert = false; this.isConnected = true; }
    contains(node) { return node === this || this.controls?.includes(node); }
    getClientRects() { return [{}]; }
    focus() { document.activeElement = this; }
    hasAttribute() { return false; }
    closest() { return this.inert ? this : null; }
    querySelectorAll(selector) { assert.match(selector, /textarea/); return this.controls; }
  }
  const trigger = new Element(), root = new Element(), dialog = new Element();
  const button = new Element(), textarea = new Element();
  dialog.controls = [button, textarea];
  document.activeElement = trigger;
  document.body.children = [root, dialog];
  const code = ts.transpileModule(source("src/lib/use-modal-focus.ts"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = { exports: {}, HTMLElement: Element, document, window: { addEventListener: (key, callback) => listeners.set(key, callback), removeEventListener: key => listeners.delete(key) },
    require: () => ({ useRef: value => ({ current: value }), useEffect: callback => { cleanup = callback(); } }) };
  vm.runInNewContext(code, context);
  context.exports.useModalFocus(true, { current: dialog }, () => closeCount++);
  assert.equal(root.inert, true);
  assert.equal(document.activeElement, button);
  document.activeElement = textarea;
  listeners.get("keydown")({ key: "Tab", preventDefault() {} });
  assert.equal(document.activeElement, button);
  dialog.inert = true;
  listeners.get("keydown")({ key: "Escape", preventDefault() {} });
  assert.equal(closeCount, 0);
  dialog.inert = false;
  listeners.get("keydown")({ key: "Escape", preventDefault() {} });
  assert.equal(closeCount, 1);
  cleanup();
  assert.equal(root.inert, false);
  assert.equal(document.body.style.overflow, "auto");
  assert.equal(document.activeElement, trigger);
});
