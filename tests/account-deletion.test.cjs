const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { loadApi } = require("./helpers/api-harness.cjs");
const { createAccountLifecycle } = require("../backend/api/account-lifecycle.cjs");

const sub = "44444444-4444-4444-8444-444444444444";
const copy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const event = (path = "/me", method = "DELETE", body = {}) => ({ rawPath: path, body: JSON.stringify(body), requestContext: { http: { method }, authorizer: { jwt: { claims: { sub, iat: 2000, "cognito:groups": ["clients"] } } } } });
const conditional = () => Object.assign(new Error("fixture conflict"), { name: "ConditionalCheckFailedException" });
const cancelled = () => Object.assign(new Error("fixture conflict"), { name: "TransactionCanceledException" });
const future = () => new Date(Date.now() + 86400000).toISOString();

function fixture({ experts = [], beforeTransaction, staleScan, failRead = false, failClaim, logError } = {}) {
  const state = {
    user: { userId: sub, name: "Disposable fixture", role: "client", points: 25, authValidAfter: 1000, referralCode: "fixture1", documents: [], notifications: [{ id: "old" }] },
    experts: copy(experts), calls: [], transactions: [], beforeTransaction
  };
  const record = input => input.TableName === "unit-users" ? state.user : state.experts.find(row => row.consultantId === input.Key.consultantId);
  function check(input) {
    const row = record(input);
    const condition = input.ConditionExpression || "";
    if (!row && condition.includes("attribute_exists(")) throw conditional();
    if (!row) return;
    for (const field of ["identityDeleted", "deletionPurgeStartedAt"]) if (condition.includes(`attribute_not_exists(${field})`) && Object.prototype.hasOwnProperty.call(row, field)) throw conditional();
    if (condition.includes("restricted <>") && row.restricted === true) throw conditional();
    if (condition.includes("identityDisabled <>") && row.identityDisabled === true) throw conditional();
    for (const [alias, field] of Object.entries(input.ExpressionAttributeNames || {}).filter(([alias]) => alias.startsWith("#snapshot"))) {
      if (condition.includes(`attribute_not_exists(${alias})`)) {
        if (Object.prototype.hasOwnProperty.call(row, field)) throw conditional();
      } else {
        const token = condition.match(new RegExp(`${alias} = (:snapshot[0-9]+)`))?.[1];
        if (token && JSON.stringify(row[field]) !== JSON.stringify(input.ExpressionAttributeValues[token])) throw conditional();
      }
    }
    const values = input.ExpressionAttributeValues || {};
    if (condition.includes("deletionEffectiveAt > :now") && !(row.deletionEffectiveAt > values[":now"])) throw conditional();
    if (condition.includes("deletionEffectiveAt <= :now") && !(row.deletionScheduledAt === values[":scheduled"] && row.deletionEffectiveAt === values[":effective"] && row.deletionEffectiveAt <= values[":now"])) throw conditional();
  }
  function apply(input) {
    const row = record(input);
    const expression = input.UpdateExpression || "";
    const set = expression.split(" REMOVE ")[0].replace(/^SET /, "");
    for (const assignment of set.split(/, (?=[#A-Za-z])/)) {
      const match = assignment.match(/^([#A-Za-z0-9]+) = (:[A-Za-z0-9]+)$/);
      if (match) row[input.ExpressionAttributeNames?.[match[1]] || match[1]] = copy(input.ExpressionAttributeValues[match[2]]);
    }
    if (expression.includes("if_not_exists(deletionPurgeStartedAt")) row.deletionPurgeStartedAt ||= input.ExpressionAttributeValues[":now"];
    for (const field of expression.split(" REMOVE ")[1]?.split(/,\s*/) || []) delete row[input.ExpressionAttributeNames?.[field] || field];
  }
  const api = loadApi({ environment: { USER_POOL_ID: "unit-pool" }, logError, send: async command => {
    const input = command.input;
    state.calls.push({ name: command.constructor.name, input: copy(input) });
    if (command.constructor.name === "AdminGetUserCommand") return { Enabled: true, UserAttributes: [{ Name: "sub", Value: sub }] };
    if (command.constructor.name === "ListUsersCommand") return { Users: [{ Enabled: true, Attributes: [{ Name: "sub", Value: sub }] }] };
    if (command.constructor.name === "GetCommand") {
      if (failRead) throw new Error("fixture read failure");
      return { Item: copy(record(input)) };
    }
    if (command.constructor.name === "QueryCommand") return { Items: copy(state.experts.filter(row => !input.ExpressionAttributeValues?.[":slug"] || row.slug === input.ExpressionAttributeValues[":slug"])) };
    if (command.constructor.name === "ScanCommand") return { Items: copy(staleScan || (state.user ? [state.user] : [])) };
    if (command.constructor.name === "TransactWriteCommand") {
      state.transactions.push(copy(input));
      if (state.beforeTransaction) { const change = state.beforeTransaction; state.beforeTransaction = null; change(state); }
      try { for (const item of input.TransactItems) check(item.Update || item.ConditionCheck); }
      catch (error) { if (error.name === "ConditionalCheckFailedException") throw cancelled(); throw error; }
      for (const item of input.TransactItems) if (item.Update) apply(item.Update);
      return {};
    }
    if (command.constructor.name === "UpdateCommand") {
      check(input);
      if (failClaim && input.UpdateExpression.includes("deletionPurgeStartedAt")) throw failClaim;
      apply(input); return { Attributes: copy(record(input)) };
    }
    throw new Error(`Unexpected fixture operation ${command.constructor.name}`);
  } });
  return { api, state };
}

function expert(overrides = {}) {
  return { consultantId: "expert", ownerUserId: sub, name: "Fixture Expert", slug: "fixture-expert", comped: true, packageTier: "grow", packageSource: "granted", isPublic: true, profileStatus: "approved", updatedAt: "2026-10-01T00:00:00Z", availability: [], bookedSlots: ["2099-01-01"], ...overrides };
}

test("scheduling atomically hides all owned experts without changing business or financial state", async () => {
  const { api, state } = fixture({ experts: [expert(), expert({ consultantId: "second", isPublic: false, profileStatus: "pending" })] });
  const beforeUser = copy(state.user), beforeExperts = copy(state.experts);
  const result = JSON.parse((await api.test.deleteMyAccount(event())).body);
  assert.equal(result.deleted, false);
  assert.equal(Date.parse(result.deletionEffectiveAt) - Date.parse(result.deletionScheduledAt), 7 * 86400000);
  assert.equal(state.transactions[0].TransactItems.length, 3);
  for (const row of state.experts) assert.equal(row.isPublic, false);
  for (const field of ["points", "authValidAfter", "notifications", "documents", "role"]) assert.deepEqual(state.user[field], beforeUser[field]);
  for (let index = 0; index < beforeExperts.length; index++) for (const field of ["packageTier", "packageSource", "comped", "bookedSlots"]) assert.deepEqual(state.experts[index][field], beforeExperts[index][field]);
  assert.ok(!state.calls.some(call => ["AdminDeleteUserCommand", "SendEmailCommand"].includes(call.name)));
});

test("repeated scheduling preserves deadline and original visibility, then explicit cancellation restores it", async () => {
  const { api, state } = fixture({ experts: [expert(), expert({ consultantId: "hidden", isPublic: false, profileStatus: "pending" })] });
  const first = JSON.parse((await api.test.deleteMyAccount(event())).body);
  const repeat = JSON.parse((await api.test.deleteMyAccount(event())).body);
  assert.equal(first.deletionEffectiveAt, repeat.deletionEffectiveAt);
  assert.equal(first.deletionScheduledAt, repeat.deletionScheduledAt);
  const result = JSON.parse((await api.test.cancelMyDeletion(event("/me/deletion/cancel", "POST"))).body);
  assert.equal(result.cancelled, true);
  assert.equal(result.deletionScheduledAt, null);
  assert.equal(state.user.deletionScheduledAt, undefined);
  assert.equal(state.experts[0].isPublic, true);
  assert.equal(state.experts[0].profileStatus, "approved");
  assert.equal(state.experts[1].isPublic, false);
  assert.equal(state.experts[1].profileStatus, "pending");
  assert.ok(state.experts.every(row => !row.deletionRestoreVisibility && !row.deletionScheduledAt));
  assert.equal(JSON.parse((await api.test.cancelMyDeletion(event("/me/deletion/cancel", "POST"))).body).cancelled, false);
});

test("transaction failure cannot leave account scheduled while an expert remains visible", async () => {
  const { api, state } = fixture({ experts: [expert()], beforeTransaction: () => { throw new Error("fixture unavailable"); } });
  await assert.rejects(api.test.deleteMyAccount(event()), /fixture unavailable/);
  assert.equal(state.user.deletionScheduledAt, undefined);
  assert.equal(state.experts[0].isPublic, true);
});

test("conditional scheduling races retry fresh snapshots without recreating a deleted user", async () => {
  const { api, state } = fixture({ experts: [expert()], beforeTransaction: state => { state.user = null; } });
  assert.equal((await api.test.deleteMyAccount(event())).statusCode, 404);
  assert.equal(state.user, null);
  assert.equal(state.experts[0].isPublic, true);
});

test("repeat DELETE repairs legacy partial expert hiding without extending the grace deadline", async () => {
  const { api, state } = fixture({ experts: [expert()] });
  state.user.deletionScheduledAt = "2026-10-01T00:00:00Z";
  state.user.deletionEffectiveAt = future();
  const deadline = state.user.deletionEffectiveAt;
  await api.test.deleteMyAccount(event());
  assert.equal(state.user.deletionEffectiveAt, deadline);
  assert.equal(state.experts[0].isPublic, false);
  assert.equal(state.experts[0].deletionScheduledAt, state.user.deletionScheduledAt);
});

test("cancellation never restores old admin moderation or package changes", async () => {
  const { api, state } = fixture({ experts: [expert()] });
  await api.test.deleteMyAccount(event());
  Object.assign(state.experts[0], { isPublic: false, profileStatus: "rejected", visibilityMode: "hidden", packageTier: "start", packageSource: "granted", updatedAt: "2099-01-01T00:00:00Z" });
  await api.test.cancelMyDeletion(event("/me/deletion/cancel", "POST"));
  assert.equal(state.experts[0].isPublic, false);
  assert.equal(state.experts[0].visibilityMode, "hidden");
  assert.equal(state.experts[0].packageTier, "start");
  assert.equal(state.experts[0].deletionScheduledAt, undefined);
});

test("cancellation preserves concurrent balance/notification updates and rejects an intervening expert restriction", async () => {
  const { api, state } = fixture({ experts: [expert()] });
  await api.test.deleteMyAccount(event());
  state.beforeTransaction = state => { state.user.points = 100; state.user.notifications.push({ id: "new" }); state.user.authValidAfter = 3000; };
  await api.test.cancelMyDeletion(event("/me/deletion/cancel", "POST"));
  assert.equal(state.user.points, 100);
  assert.deepEqual(state.user.notifications.map(item => item.id), ["old", "new"]);
  assert.equal(state.user.authValidAfter, 3000);
  const race = fixture({ experts: [expert()] });
  await race.api.test.deleteMyAccount(event());
  race.state.beforeTransaction = state => { state.experts[0].restricted = true; };
  await assert.rejects(race.api.test.cancelMyDeletion(event("/me/deletion/cancel", "POST")), error => error.name === "TransactionCanceledException");
  assert.ok(race.state.user.deletionScheduledAt);
  assert.equal(race.state.experts[0].isPublic, false);
  assert.equal(race.state.experts[0].restricted, true);
});

test("cancellation restores absent legacy visibility fields without inventing approval", async () => {
  const legacy = expert();
  delete legacy.isPublic;
  delete legacy.profileStatus;
  const { api, state } = fixture({ experts: [legacy] });
  await api.test.deleteMyAccount(event());
  await api.test.cancelMyDeletion(event("/me/deletion/cancel", "POST"));
  assert.equal(Object.prototype.hasOwnProperty.call(state.experts[0], "isPublic"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(state.experts[0], "profileStatus"), false);
});

test("due, malformed or started-purge schedules cannot be cancelled and inputs cannot select another account", async () => {
  for (const flags of [{ deletionEffectiveAt: "2000-01-01T00:00:00Z" }, { deletionEffectiveAt: "invalid" }, { deletionEffectiveAt: future(), deletionPurgeStartedAt: "2026-10-03T00:00:00Z" }, { deletionEffectiveAt: future(), identityDeleted: true }]) {
    const { api, state } = fixture();
    Object.assign(state.user, { deletionScheduledAt: "2026-10-01T00:00:00Z", ...flags });
    assert.equal((await api.test.cancelMyDeletion(event("/me/deletion/cancel", "POST"))).statusCode, 409);
    assert.equal(state.transactions.length, 0);
  }
  const { api } = fixture();
  assert.equal((await api.test.cancelMyDeletion(event("/me/deletion/cancel", "POST", { userId: "foreign" }))).statusCode, 400);
  await assert.rejects(api.test.cancelMyDeletion({}), error => error.statusCode === 401);
});

test("purge claiming the user during cancellation rejects the entire cancellation transaction", async () => {
  const { api, state } = fixture({ experts: [expert()] });
  await api.test.deleteMyAccount(event());
  state.beforeTransaction = state => { state.user.deletionPurgeStartedAt = new Date().toISOString(); };
  await assert.rejects(api.test.cancelMyDeletion(event("/me/deletion/cancel", "POST")), error => error.name === "TransactionCanceledException");
  assert.ok(state.user.deletionScheduledAt);
  assert.equal(state.experts[0].isPublic, false);
});

test("hourly scan cannot purge a schedule cancelled before its conditional claim", async () => {
  const stale = { userId: sub, deletionScheduledAt: "2000-01-01T00:00:00Z", deletionEffectiveAt: "2000-01-08T00:00:00Z" };
  const { api, state } = fixture({ staleScan: [stale] });
  assert.equal((await api.test.processScheduledDeletions()).processed, 0);
  assert.equal(state.user.deletionPurgeStartedAt, undefined);
  assert.ok(!state.calls.some(call => call.name === "AdminDeleteUserCommand"));
});

test("pending profile reads retain dates but cannot run bonus, referral or role-repair writes", async () => {
  const { api, state } = fixture();
  Object.assign(state.user, { role: "consultant", deletionScheduledAt: "2026-10-01T00:00:00Z", deletionEffectiveAt: future() });
  const result = JSON.parse((await api.test.getMeProfile(event("/me/profile", "GET"))).body);
  assert.equal(result.deletionEffectiveAt, state.user.deletionEffectiveAt);
  assert.equal(result.role, "consultant");
  assert.ok(state.calls.every(call => call.name === "GetCommand"));
});

test("new cancel route bypasses only pending-deletion and agreement mutation guards; anonymous callers stay denied", async () => {
  const { api, state } = fixture();
  Object.assign(state.user, { deletionScheduledAt: "2026-10-01T00:00:00Z", deletionEffectiveAt: future(), termsAcceptanceRequired: true });
  assert.equal((await api.handler(event("/me/profile", "PUT"))).statusCode, 403);
  assert.equal((await api.handler(event("/me/deletion/cancel", "POST"))).statusCode, 200);
  assert.equal(state.user.termsAcceptanceRequired, true);
  assert.equal((await api.handler({ rawPath: "/me/deletion/cancel", requestContext: { http: { method: "POST" } } })).statusCode, 401);
  const source = readFileSync(require.resolve("../infra/terraform/main.tf"), "utf8");
  const route = source.match(/resource "aws_apigatewayv2_route" "me_deletion_cancel"\s*\{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(route, /route_key\s*=\s*"POST \/me\/deletion\/cancel"/);
  assert.match(route, /authorizer_id\s*=\s*aws_apigatewayv2_authorizer\.cognito\.id/);
  assert.match(route, /authorization_type\s*=\s*"JWT"/);
});

test("public experts respect current owner deletion state even if an expert flag was not hidden", async () => {
  const { api, state } = fixture({ experts: [expert()] });
  for (const field of ["deletionScheduledAt", "deletionEffectiveAt", "identityDeleted", "identityDisabled", "restricted"]) {
    state.user[field] = field.startsWith("deletion") ? future() : true;
    assert.equal(await api.test.publicConsultantOwnerAvailable(sub), false);
    assert.equal((await api.test.getConsultant({ pathParameters: { slug: "fixture-expert" } })).statusCode, 404);
    delete state.user[field];
  }
  assert.equal(await api.test.publicConsultantOwnerAvailable(sub), true);
  assert.equal(await api.test.publicConsultantOwnerAvailable(undefined), false);
  const failed = fixture({ failRead: true });
  await assert.rejects(failed.api.test.publicConsultantOwnerAvailable(sub), /fixture read failure/);
});

test("temporary expert visibility backup is never public", () => {
  const { api } = fixture();
  const result = api.test.stripSensitiveConsultantFields(expert({ deletionRestoreVisibility: { isPublic: true, profileStatus: "approved", hiddenAt: "fixture" } }));
  assert.equal(result.deletionRestoreVisibility, undefined);
});

test("scheduled failure diagnostics contain no account identifier, raw error or hostile error name", async () => {
  const due = { userId: sub, deletionScheduledAt: "2000-01-01T00:00:00Z", deletionEffectiveAt: "2000-01-08T00:00:00Z" };
  for (const name of ["AccessDeniedException", "private-hostile-name"]) {
    const logs = [];
    const failure = Object.assign(new Error(`private fixture diagnostic for ${sub}: not authorized to perform: dynamodb:UpdateItem on private resource`), { name });
    const { api, state } = fixture({ staleScan: [due], failClaim: failure, logError: (...args) => logs.push(args) });
    Object.assign(state.user, due);
    assert.equal((await api.test.processScheduledDeletions()).processed, 0);
    const logged = JSON.stringify(logs);
    assert.ok(!logged.includes(sub) && !logged.includes("private") && !logged.includes("resource"));
    assert.deepEqual(copy(logs[0][1]), name === "AccessDeniedException" ? { error: name, errorAction: "dynamodb:UpdateItem" } : { error: "Error" });
  }
});

test("purge removes only a deleted client's shared-file metadata, preserving another client's own metadata", async () => {
  const updates = [];
  const owned = { bookingId: "owned-client", clientId: sub, consultantId: "other-expert", status: "cancelled", scheduledAt: "2000-01-01T00:00:00Z", clientSharedDocuments: [{ fileName: "private fixture file", storageKey: "profiles/fixture/documents/file" }] };
  const counterpart = { ...owned, bookingId: "owned-expert", clientId: "other-client", consultantId: "expert" };
  const lifecycle = createAccountLifecycle({
    env: { userPoolId: "unit-pool", usersTable: "unit-users", consultantsTable: "unit-consultants", bookingsTable: "unit-bookings" },
    getUserBySub: async () => ({ userId: sub }), listConsultantsByOwner: async () => [{ consultantId: "expert", ownerUserId: sub }],
    queryAllItems: async input => input.IndexName === "client-index" ? [owned] : [counterpart], scanAllItems: async () => [], refundFreePointsIfNeeded: async () => {},
    cognito: { send: async () => { throw Object.assign(new Error("fixture missing"), { name: "UserNotFoundException" }); } },
    s3: { send: async () => { throw new Error("fixture has no storage"); } },
    dynamo: { send: async command => { if (command.constructor.name === "UpdateCommand" && command.input.TableName === "unit-bookings") updates.push(command.input); return { Items: [] }; } }
  });
  assert.equal((await lifecycle.purgeUserAccount(sub, { alreadyDeleted: true })).deleted, true);
  assert.match(updates.find(input => input.Key.bookingId === owned.bookingId).UpdateExpression, /REMOVE messages, note, meetingLink, clientSharedDocuments/);
  assert.doesNotMatch(updates.find(input => input.Key.bookingId === counterpart.bookingId).UpdateExpression, /clientSharedDocuments/);
  assert.ok(!updates.some(input => Object.values(input.ExpressionAttributeValues).some(value => JSON.stringify(value).includes("private fixture file"))));
});
