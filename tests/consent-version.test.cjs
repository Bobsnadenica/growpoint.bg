const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const { loadApi } = require("./helpers/api-harness.cjs");
const source = file => readFileSync(require.resolve(`../${file}`), "utf8");
const version = "terms-2026-09-30+privacy-2026-10-01";
const event = body => ({ body: JSON.stringify(body), requestContext: { authorizer: { jwt: { claims: { sub: "client", email: "client@example.invalid" } } } } });

function authFlow() {
  const storage = new Map();
  const context = { exports: {}, window: { localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) } } };
  const code = ts.transpileModule(source("src/lib/auth-flow.ts"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, context);
  return { api: context.exports, storage };
}

test("privacy hosting/date and both consent versions match the displayed legal pages", () => {
  const privacy = source("src/app/pages/PrivacyPage.tsx");
  const terms = source("src/app/pages/TermsPage.tsx");
  const privacyDate = privacy.match(/LAST_UPDATED_ISO = "([\d-]+)"/)[1];
  const termsDate = terms.match(/LAST_UPDATED_ISO = "([\d-]+)"/)[1];
  const displayedVersion = `terms-${termsDate}+privacy-${privacyDate}`;
  assert.equal(displayedVersion, version);
  assert.equal(authFlow().api.CURRENT_TERMS_VERSION, displayedVersion);
  assert.ok(source("backend/api/index.cjs").includes(`const TERMS_VERSION = "${displayedVersion}"`));
  assert.match(privacy, /AWS S3 и CloudFront/);
  assert.doesNotMatch(privacy, /GitHub Pages/);
});

test("stale pending consent is cleared and persisted without changing profile fields or fabricating consent", () => {
  const { api, storage } = authFlow();
  const profile = { name: "Pending Client", email: "client@example.invalid", role: "client", plan: "free" };
  api.writePendingBootstrap({ ...profile, acceptTerms: true, acceptedTermsVersion: "terms-2026-09-30+privacy-2026-09-30" });
  const read = api.readPendingBootstrap();
  assert.deepEqual(JSON.parse(JSON.stringify(read)), profile);
  assert.equal(read.acceptTerms, undefined);
  assert.equal(read.acceptedTermsVersion, undefined);
  assert.deepEqual(JSON.parse(storage.get("growpoint.pending-bootstrap")), profile);
});

test("current explicit pending consent is retained; no agreement is invented for a plain pending profile", () => {
  const { api } = authFlow();
  api.writePendingBootstrap({ name: "Pending", acceptTerms: true, acceptedTermsVersion: version });
  assert.equal(api.readPendingBootstrap().acceptTerms, true);
  assert.equal(api.readPendingBootstrap().acceptedTermsVersion, version);
  api.writePendingBootstrap({ name: "Pending" });
  assert.equal(api.readPendingBootstrap().acceptTerms, undefined);
  assert.equal(api.readPendingBootstrap().acceptedTermsVersion, undefined);
});

function bootstrap(existing) {
  let stored = existing, writes = 0;
  const api = loadApi({ send: async command => {
    const input = command.input;
    if (command.constructor.name === "GetCommand") return { Item: input.Key.userId === "client" ? stored : undefined };
    writes++;
    if (command.constructor.name === "PutCommand" && input.Item.userId === "client") stored = JSON.parse(JSON.stringify(input.Item));
    if (command.constructor.name === "UpdateCommand" && input.Key.userId === "client") {
      for (const [key, field] of Object.entries(input.ExpressionAttributeNames)) if (key.startsWith("#field")) stored[field] = input.ExpressionAttributeValues[key.replace("#", ":")];
      return { Attributes: stored };
    }
    return {};
  } }).test;
  return { api, stored: () => stored, writes: () => writes };
}

test("new email or console identity requires explicit current consent before profile completion", async () => {
  for (const body of [{}, { role: "client", name: "Email Client" }, { acceptedTermsVersion: version, acceptedTermsAt: "forged", termsAcceptanceRequired: false }]) {
    const store = bootstrap();
    assert.equal((await store.api.bootstrapUser(event(body))).statusCode, 200);
    assert.equal(store.stored().termsAcceptanceRequired, true);
    assert.equal(store.stored().acceptedTermsVersion, undefined);
    assert.equal((await store.api.updateMeProfile(event({ name: "Client" }))).statusCode, 403);
  }
  const accepted = bootstrap();
  await accepted.api.bootstrapUser(event({ acceptTerms: true, acceptedTermsVersion: version, acceptedTermsAt: "forged" }));
  assert.equal(accepted.stored().termsAcceptanceRequired, false);
  assert.equal(accepted.stored().acceptedTermsVersion, version);
  assert.notEqual(accepted.stored().acceptedTermsAt, "forged");
});

test("legacy accounts are not required to accept again after this hosting-only policy update", async () => {
  for (const original of [{}, { acceptedTermsVersion: "terms-2026-09-30+privacy-2026-09-30", acceptedTermsAt: "2026-09-30T00:00:00.000Z", termsAcceptanceRequired: false }]) {
    const store = bootstrap({ userId: "client", role: "client", referralCode: "abcdefgh", ...original });
    await store.api.bootstrapUser(event({}));
    assert.equal(store.stored().termsAcceptanceRequired, original.termsAcceptanceRequired);
    assert.equal(store.stored().acceptedTermsVersion, original.acceptedTermsVersion);
    assert.equal(store.stored().acceptedTermsAt, original.acceptedTermsAt);
  }
});

test("obsolete explicit bootstrap acceptance is rejected before any write with reload guidance", async () => {
  const store = bootstrap();
  await assert.rejects(store.api.bootstrapUser(event({ acceptTerms: true, acceptedTermsVersion: "terms-2026-09-30+privacy-2026-09-30" })), error => error.statusCode === 400 && /Обнови страницата/.test(error.message));
  assert.equal(store.writes(), 0);
  assert.equal(store.stored(), undefined);
});
