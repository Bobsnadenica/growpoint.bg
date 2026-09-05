const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createIdentityChecks } = require("../backend/api/identity.cjs");
const { createAccountLifecycle } = require("../backend/api/account-lifecycle.cjs");
const { createMetricsCache } = require("../backend/api/metrics-cache.cjs");
const sub = "11111111-1111-4111-8111-111111111111";
const missing = () => Object.assign(new Error("missing"), { name: "UserNotFoundException" });

test("deleted, disabled and mismatched Cognito accounts cannot reuse a valid JWT", async () => {
  for (const result of [null, { Enabled: false, UserAttributes: [{ Name: "sub", Value: sub }] }, { Enabled: true, UserAttributes: [{ Name: "sub", Value: "other" }] }]) {
    const identity = createIdentityChecks({ userPoolId: "unit-pool", cognito: { send: async () => { if (!result) throw missing(); return result; } } });
    await assert.rejects(identity.assertCallerActive({ sub }), (e) => e.statusCode === 401 && e.code === "ACCOUNT_UNAVAILABLE");
  }
});

test("admin group removal is enforced even when JWT still claims admin", async () => {
  const identity = createIdentityChecks({ userPoolId: "unit-pool", cognito: { send: async (command) => command.constructor.name === "AdminGetUserCommand" ? { Enabled: true, UserAttributes: [{ Name: "sub", Value: sub }] } : { Groups: [] } } });
  await assert.rejects(identity.assertCallerActive({ sub }, { admin: true }), (e) => e.statusCode === 403);
});

test("public profile checks use ListUsers, cache briefly and fail closed on AWS failure", async () => {
  let now = 0; let calls = 0; let enabled = true;
  const identity = createIdentityChecks({ userPoolId: "unit-pool", now: () => now, cognito: { send: async (command) => {
    assert.equal(command.constructor.name, "ListUsersCommand"); calls++;
    return { Users: enabled ? [{ Enabled: true, Attributes: [{ Name: "sub", Value: sub }] }] : [] };
  } } });
  assert.equal((await identity.publicAccountState(sub)).enabled, true);
  await identity.publicAccountState(sub); assert.equal(calls, 1);
  enabled = false; now = 60001;
  assert.equal((await identity.publicAccountState(sub)).exists, false); assert.equal(calls, 2);
  const failing = createIdentityChecks({ userPoolId: "unit-pool", cognito: { send: async () => { throw new Error("AWS unavailable"); } } });
  await assert.rejects(failing.publicAccountState(sub), /AWS unavailable/);
});

function lifecycleHarness({ existing = false, failStorage = false, slotConflict = false } = {}) {
  const writes = [];
  let conflicted = false;
  const lifecycle = createAccountLifecycle({
    env: { usersTable: "users", consultantsTable: "consultants", bookingsTable: "bookings", userPoolId: "unit-pool", cvBucket: "unit-bucket" },
    getUserBySub: async () => ({ userId: sub, referralCode: "code" }),
    listConsultantsByOwner: async () => [{ consultantId: "consultant-1", ownerUserId: sub, slug: "former-profile" }],
    queryAllItems: async () => [{ bookingId: "b", consultantId: "other-consultant", clientId: sub, status: "pending", scheduledAt: "2099-01-01", messages: [{ body: "private" }] }],
    scanAllItems: async () => [{ userId: sub }],
    refundFreePointsIfNeeded: async () => {},
    dynamo: { send: async (command) => {
      writes.push(command);
      if (command.constructor.name === "GetCommand" && command.input.Key.consultantId === "other-consultant") return { Item: { bookedSlots: conflicted ? ["2099-01-01", "2099-02-01"] : ["2098-12-01", "2099-01-01", "2099-02-01"] } };
      if (slotConflict && !conflicted && command.input.UpdateExpression?.startsWith("REMOVE bookedSlots")) {
        conflicted = true; throw Object.assign(new Error("concurrent edit"), { name: "ConditionalCheckFailedException" });
      }
      return {};
    } },
    cognito: { send: async (command) => { if (command.constructor.name === "AdminGetUserCommand") { if (!existing) throw missing(); return { Enabled: true }; } return {}; } },
    s3: { send: async () => { if (failStorage) throw new Error("storage unavailable"); return {}; } }
  });
  return { lifecycle, writes };
}

test("external deletion removes private profile, keeps only anonymous booking tombstone and invalidates metrics", async () => {
  const { lifecycle, writes } = lifecycleHarness();
  const result = await lifecycle.purgeUserAccount(sub, { alreadyDeleted: true });
  assert.equal(result.deleted, true);
  assert.ok(writes.some((c) => c.constructor.name === "DeleteCommand" && c.input.Key.userId === sub));
  assert.ok(writes.some((c) => c.input.Key?.userId === "system#monitoring-snapshot"));
  const tombstone = writes.find((c) => c.constructor.name === "PutCommand" && c.input.TableName === "consultants").input.Item;
  assert.equal(tombstone.identityDeleted, true); assert.equal(tombstone.slug, undefined);
  assert.equal(tombstone.isPublic, false);
  assert.match(writes.find((c) => c.input.TableName === "bookings").input.UpdateExpression, /REMOVE messages, note, meetingLink/);
});

test("stale deletion event cannot purge a currently existing identity", async () => {
  const { lifecycle, writes } = lifecycleHarness({ existing: true });
  assert.equal((await lifecycle.purgeUserAccount(sub, { alreadyDeleted: true })).deleted, false);
  assert.equal(writes.length, 0);
});

test("deleted client releases only its slot and retries concurrent list edits before cancellation", async () => {
  const { lifecycle, writes } = lifecycleHarness({ slotConflict: true });
  await lifecycle.purgeUserAccount(sub, { alreadyDeleted: true });
  const removals = writes.filter((c) => c.input.UpdateExpression?.startsWith("REMOVE bookedSlots"));
  assert.equal(removals.length, 2);
  assert.equal(removals[0].input.UpdateExpression, "REMOVE bookedSlots[1]");
  assert.equal(removals[1].input.UpdateExpression, "REMOVE bookedSlots[0]");
  assert.equal(removals[1].input.ConditionExpression, "bookedSlots[0] = :slot");
  assert.ok(writes.indexOf(removals[1]) < writes.findIndex((c) => c.input.TableName === "bookings"));
});

test("cleanup failure leaves profile retryable; foreign pool events cannot delete local data", async () => {
  const { lifecycle, writes } = lifecycleHarness({ failStorage: true });
  await assert.rejects(lifecycle.purgeUserAccount(sub, { alreadyDeleted: true }), /storage unavailable/);
  assert.ok(!writes.some((c) => c.constructor.name === "DeleteCommand" && c.input.Key.userId === sub));
  assert.deepEqual(await lifecycle.handleEvent({ detail: { eventName: "AdminDeleteUser", requestParameters: { userPoolId: "other-pool", username: sub } } }), { ignored: true });
});

test("eventually consistent inventory omission never deletes an existing Cognito identity", async () => {
  const { lifecycle, writes } = lifecycleHarness({ existing: true });
  assert.equal((await lifecycle.reconcile({ force: true })).deleted, 0);
  assert.ok(!writes.some((c) => c.constructor.name === "DeleteCommand" && c.input.Key.userId === sub));
});

test("statistics cache avoids repeat scans for 15 minutes and refreshes on demand", async () => {
  let row; let now = 0; let collected = 0;
  const metrics = createMetricsCache({ table: "users", now: () => now, collect: async () => ({ total: ++collected }), dynamo: { send: async (command) => {
    if (command.constructor.name === "GetCommand") return { Item: row };
    const values = command.input.ExpressionAttributeValues;
    if (values[":payload"]) row = { payload: values[":payload"], validUntil: values[":until"] };
    return {};
  } } });
  assert.equal((await metrics()).total, 1);
  assert.equal((await metrics()).total, 1); assert.equal(collected, 1);
  now = 901000; assert.equal((await metrics()).total, 2);
});
