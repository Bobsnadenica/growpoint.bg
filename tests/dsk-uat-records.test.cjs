const test = require("node:test");
const assert = require("node:assert/strict");
const { createDskUatRecords } = require("../backend/api/dsk-uat-records.cjs");
const { createAccountLifecycle } = require("../backend/api/account-lifecycle.cjs");
const owner = "22222222-2222-4222-8222-222222222222";
const stranger = "33333333-3333-4333-8333-333333333333";
const id = "ed30e455-53b3-4d9b-9d6c-98528d681d65";
const nextId = "ed30e455-53b3-4d9b-9d6c-98528d681d66";
const prefix = `system#dsk-uat#${owner}#`;
const rate = `system#dsk-uat-rate#${owner}`;
const record = (checkoutId = id, patch = {}) => ({
  userId: prefix + checkoutId, kind: "dsk-uat", ownerId: owner, checkoutId,
  status: "succeeded", amountMinor: 100, currency: "EUR", createdAt: "2026-10-01T12:00:00Z", verifiedAt: "2026-10-01T12:03:00Z",
  gatewayOrderId: "private-bank-reference", orderNumber: "private-merchant-reference", checkoutUrl: "private-checkout-url", privateCardData: "never-exported", ...patch,
});

test("owner-only sandbox export paginates empty pages and drops provider/card/owner fields", async () => {
  const calls = [];
  const pages = [
    { Items: [], LastEvaluatedKey: { userId: "page-one-cursor" } },
    { Items: [record()], LastEvaluatedKey: { userId: "page-two-cursor" } },
    { Items: [record(nextId, { status: "registering", verifiedAt: null })] },
  ];
  const records = createDskUatRecords({ table: "unit-users", dynamo: { send: async command => {
    calls.push(command);
    assert.equal(command.constructor.name, "ScanCommand");
    assert.equal(command.input.ConsistentRead, true);
    assert.equal(command.input.ExpressionAttributeValues[":prefix"], prefix);
    assert.equal(command.input.ExpressionAttributeNames["#f0"], "userId");
    assert.doesNotMatch(JSON.stringify(command.input), /gatewayOrderId|orderNumber|checkoutUrl|privateCardData/);
    return pages.shift();
  } } });
  const exported = await records.listForExport(owner);
  assert.deepEqual(exported, [
    { checkoutId: id, status: "succeeded", amountMinor: 100, currency: "EUR", createdAt: "2026-10-01T12:00:00.000Z", verifiedAt: "2026-10-01T12:03:00.000Z" },
    { checkoutId: nextId, status: "pending", amountMinor: 100, currency: "EUR", createdAt: "2026-10-01T12:00:00.000Z" },
  ]);
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[1].input.ExclusiveStartKey, { userId: "page-one-cursor" });
  assert.deepEqual(calls[2].input.ExclusiveStartKey, { userId: "page-two-cursor" });
  assert.doesNotMatch(JSON.stringify(exported), /private-|never-exported|ownerId|userId|gatewayOrderId|orderNumber|checkoutUrl/);
});

test("sandbox cleanup collects all pages then deletes only owner's exact checkout/rate keys", async () => {
  const calls = [];
  const records = createDskUatRecords({ table: "unit-users", dynamo: { send: async command => {
    calls.push(command);
    if (command.constructor.name === "ScanCommand") {
      assert.deepEqual(command.input.ExpressionAttributeNames, { "#f0": "userId" });
      assert.equal(command.input.ExpressionAttributeValues[":prefix"], prefix);
      return command.input.ExclusiveStartKey
        ? { Items: [{ userId: prefix + nextId }] }
        : { Items: [{ userId: prefix + id }], LastEvaluatedKey: { userId: prefix + id } };
    }
    assert.equal(command.constructor.name, "DeleteCommand");
    assert.equal(calls.filter(call => call.constructor.name === "ScanCommand").length, 2, "Complete discovery before any deletion");
    return {};
  } } });
  assert.deepEqual(await records.purge(owner), { deletedCheckouts: 2 });
  assert.deepEqual(calls.filter(call => call.constructor.name === "DeleteCommand").map(call => call.input.Key.userId), [prefix + id, prefix + nextId, rate]);
  assert.ok(calls.every(call => call.input.TableName === "unit-users"));
});

test("invalid owners and unexpected foreign/malformed scan rows cannot cause a broad deletion", async () => {
  for (const invalidOwner of ["", "system#telemetry", `${owner}#`, "not-a-uuid"]) {
    let requests = 0;
    const records = createDskUatRecords({ table: "unit-users", dynamo: { send: async () => { requests++; return {}; } } });
    await assert.rejects(records.purge(invalidOwner), /exact account identifier/);
    await assert.rejects(records.listForExport(invalidOwner), /exact account identifier/);
    assert.equal(requests, 0);
  }
  for (const unexpectedKey of [`system#dsk-uat#${stranger}#${id}`, `${prefix}not-a-uuid`, owner, rate, `system#dsk-uat#${owner}extra#${id}`]) {
    let deletes = 0;
    const records = createDskUatRecords({ table: "unit-users", dynamo: { send: async command => {
      if (command.constructor.name === "DeleteCommand") { deletes++; return {}; }
      return { Items: [{ userId: unexpectedKey }] };
    } } });
    await assert.rejects(records.purge(owner), /exact sandbox owner namespace/);
    assert.equal(deletes, 0);
  }
});

test("export rejects mismatched owner identity, subtype, checkout ID or monetary data", async () => {
  for (const patch of [{ ownerId: stranger }, { kind: "other-system-row" }, { checkoutId: nextId }, { amountMinor: 101 }, { currency: "USD" }]) {
    const records = createDskUatRecords({ table: "unit-users", dynamo: { send: async () => ({ Items: [record(id, patch)] }) } });
    await assert.rejects(records.listForExport(owner), /Invalid sandbox owner record/);
  }
});

test("sandbox cleanup failure preserves identity and retries before its final deletion", async () => {
  const rows = new Map([[prefix + id, record()], [rate, { userId: rate }], [owner, { userId: owner }]]);
  const deletes = [];
  let failRate = true;
  const lifecycle = createAccountLifecycle({
    env: { usersTable: "unit-users", consultantsTable: "unit-experts", bookingsTable: "unit-bookings", userPoolId: "unit-pool" },
    getUserBySub: async () => rows.get(owner), listConsultantsByOwner: async () => [], queryAllItems: async () => [], scanAllItems: async () => [],
    refundFreePointsIfNeeded: async () => {}, s3: { send: async () => ({}) },
    cognito: { send: async () => { throw Object.assign(new Error(), { name: "UserNotFoundException" }); } },
    dynamo: { send: async command => {
      const input = command.input;
      if (command.constructor.name === "ScanCommand") return { Items: [...rows.keys()].filter(key => key.startsWith(input.ExpressionAttributeValues[":prefix"])).map(userId => ({ userId })) };
      if (command.constructor.name === "UpdateCommand") { rows.get(owner).identityDeleted = true; return {}; }
      assert.equal(command.constructor.name, "DeleteCommand");
      deletes.push(input.Key.userId);
      if (input.Key.userId === rate && failRate) { failRate = false; throw new Error("retryable sandbox cleanup failure"); }
      if (input.Key.userId === owner) {
        assert.equal(rows.has(prefix + id), false);
        assert.equal(rows.has(rate), false);
      }
      rows.delete(input.Key.userId);
      return {};
    } },
  });
  await assert.rejects(lifecycle.purgeUserAccount(owner, { alreadyDeleted: true }), /retryable sandbox cleanup failure/);
  assert.equal(rows.has(owner), true, "Identity must remain for EventBridge/maintenance retry");
  assert.equal(rows.get(owner).identityDeleted, true, "New UAT transactions can guard this deletion marker");
  assert.equal(deletes.includes(owner), false);
  assert.equal((await lifecycle.purgeUserAccount(owner, { alreadyDeleted: true })).deleted, true);
  assert.equal(rows.has(owner), false);
  assert.equal(rows.has(rate), false);
});

test("pagination failure propagates before deleting any discovered owner records", async () => {
  let deletes = 0;
  const records = createDskUatRecords({ table: "unit-users", dynamo: { send: async command => {
    if (command.constructor.name === "DeleteCommand") { deletes++; return {}; }
    if (command.input.ExclusiveStartKey) throw new Error("retryable scan failure");
    return { Items: [{ userId: prefix + id }], LastEvaluatedKey: { userId: prefix + id } };
  } } });
  await assert.rejects(records.purge(owner), /retryable scan failure/);
  assert.equal(deletes, 0);
});
