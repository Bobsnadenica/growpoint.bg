const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApi } = require("./helpers/api-harness.cjs");
const sub = "44444444-4444-4444-8444-444444444444";
const copy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const unavailable = error => error.statusCode === 401 && error.code === "ACCOUNT_UNAVAILABLE";
const event = (path, method = "GET", iat = 1001, body = {}) => ({ rawPath: path, body: JSON.stringify(body), requestContext: { http: { method }, authorizer: { jwt: { claims: { sub, iat, email: "fixture@example.invalid", "cognito:groups": ["admin"] } } } } });

function fixture({ user = { userId: sub, role: "client", name: "Fixture", referralCode: "abcdefgh", authValidAfter: 1000, documents: [] }, failRead = false, beforeSave } = {}) {
  const state = { user, reads: 0, writes: [] };
  const api = loadApi({ environment: { USER_POOL_ID: "unit-pool" }, send: async command => {
    const input = command.input;
    if (command.constructor.name === "AdminGetUserCommand") return { Enabled: true, UserAttributes: [{ Name: "sub", Value: sub }] };
    if (command.constructor.name === "AdminListGroupsForUserCommand") return { Groups: [{ GroupName: "admin" }] };
    if (command.constructor.name === "ListUsersCommand") return { Users: [{ Enabled: true, Attributes: [{ Name: "sub", Value: sub }] }] };
    if (command.constructor.name === "GetCommand") {
      state.reads++;
      if (input.Key.userId === sub) {
        assert.equal(input.ConsistentRead, true, "cutoff must use current authoritative account row");
        if (failRead) throw new Error("private database failure");
        return { Item: copy(state.user) };
      }
      return {};
    }
    if (command.constructor.name === "QueryCommand") return { Items: [] };
    state.writes.push(copy(input));
    if (command.constructor.name === "PutCommand" && input.Item.userId === sub) state.user = copy(input.Item);
    if (command.constructor.name === "UpdateCommand" && input.Key.userId === sub) {
      if (beforeSave) { const change = beforeSave; beforeSave = null; change(state); }
      for (const [alias, field] of Object.entries(input.ExpressionAttributeNames || {}).filter(([alias]) => alias.startsWith("#field"))) state.user[field] = copy(input.ExpressionAttributeValues[alias.replace("#", ":")]);
      return { Attributes: copy(state.user) };
    }
    return {};
  } });
  return { api, state };
}

test("operator cutoff uses whole Unix seconds; absent marker preserves legacy and bootstrap compatibility", () => {
  const { assertAuthValidAfter } = loadApi().test;
  for (const account of [undefined, null, {}, { role: "client" }]) assert.doesNotThrow(() => assertAuthValidAfter({}, account));
  for (const iat of [1001, "1001", 1000.5, "1000.5"]) assert.doesNotThrow(() => assertAuthValidAfter({ iat }, { authValidAfter: 1000 }));
  for (const iat of [999, 1000, "1000"]) assert.throws(() => assertAuthValidAfter({ iat }, { authValidAfter: 1000 }), unavailable);
});

test("present malformed cutoff or absent/malformed issued-at claim fails closed", () => {
  const { assertAuthValidAfter } = loadApi().test;
  for (const authValidAfter of [undefined, null, false, true, "1000", "", {}, [], -1, 1000.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => assertAuthValidAfter({ iat: 2000 }, { authValidAfter }), unavailable);
  }
  for (const iat of [undefined, null, true, false, "", " ", "1001x", "1e9", [], {}, -1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => assertAuthValidAfter({ iat }, { authValidAfter: 1000 }), unavailable);
  }
});

test("old and equal-cutoff JWTs stop every authenticated route before profile/bootstrap/application work", async () => {
  const paths = [["/health", "GET"], ["/me/profile", "GET"], ["/me/data-export", "GET"], ["/auth/bootstrap", "POST"], ["/bookings", "POST"], ["/bookings/fixture/status", "PATCH"], ["/consultants/me", "GET"], ["/admin/metrics", "GET"], ["/admin/payments/uat/config", "GET"]];
  for (const [path, method] of paths) {
    const { api, state } = fixture();
    const result = await api.handler(event(path, method, 1000, { authValidAfter: null }));
    assert.equal(result.statusCode, 401, `${method} ${path}`);
    assert.equal(JSON.parse(result.body).code, "ACCOUNT_UNAVAILABLE");
    assert.equal(state.reads, 1, "revoked caller may only reach the cutoff read");
    assert.equal(state.writes.length, 0);
  }
});

test("new JWT passes after cutoff; anonymous health keeps zero account reads and no idle service", async () => {
  const { api, state } = fixture();
  assert.equal((await api.handler(event("/health", "GET", "1001"))).statusCode, 200);
  assert.equal(state.reads, 1);
  const anonymous = fixture();
  assert.equal((await anonymous.api.handler({ rawPath: "/health", requestContext: { http: { method: "GET" } } })).statusCode, 200);
  assert.equal(anonymous.state.reads, 0);
  assert.equal(anonymous.state.writes.length, 0);
});

test("cutoff DynamoDB read failure never falls through to an authenticated endpoint", async () => {
  const { api, state } = fixture({ failRead: true });
  const result = await api.handler(event("/health"));
  assert.equal(result.statusCode, 500);
  assert.equal(JSON.parse(result.body).message, "Unexpected server error.");
  assert.equal(state.reads, 1);
  assert.ok(state.writes.every(write => (write.TransactItems || [{ Update: write }]).every(item => item.Update?.Key?.userId?.startsWith("system#"))), "only error monitoring may write after the failed cutoff read");
});

test("profile and bootstrap bodies cannot set, clear or overwrite a concurrently raised operator cutoff", async () => {
  for (const [path, method] of [["/me/profile", "PUT"], ["/auth/bootstrap", "POST"]]) {
    for (const injected of [null, 0, 9999999999]) {
      const { api, state } = fixture({ beforeSave: state => { state.user.authValidAfter = 2000; } });
      const result = await api.handler(event(path, method, 1001, { name: "Edited fixture", authValidAfter: injected }));
      assert.equal(result.statusCode, 200);
      assert.equal(state.user.authValidAfter, 2000);
      assert.ok(state.writes.every(write => !Object.values(write.ExpressionAttributeNames || {}).includes("authValidAfter")));
      assert.equal((await api.handler(event("/health", "GET", 1001))).statusCode, 401);
    }
  }
});

test("missing profile bootstraps without cutoff, and client-supplied cutoff is never persisted or published", async () => {
  const { api, state } = fixture({ user: undefined });
  // Explicitly remove the fixture's default row; absence is allowed to repair
  // a valid Cognito identity but cannot invent a revocation marker.
  state.user = undefined;
  const created = await api.handler(event("/auth/bootstrap", "POST", undefined, { name: "Fixture", authValidAfter: 9999999999 }));
  assert.equal(created.statusCode, 200);
  assert.equal(Object.prototype.hasOwnProperty.call(state.user, "authValidAfter"), false);
  state.user.authValidAfter = 1000;
  const publicProfile = await api.handler({ rawPath: `/public/users/${sub}`, requestContext: { http: { method: "GET" } } });
  assert.equal(publicProfile.statusCode, 200);
  assert.equal(Object.prototype.hasOwnProperty.call(JSON.parse(publicProfile.body), "authValidAfter"), false);
});
