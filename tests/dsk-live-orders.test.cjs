const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { createDskLiveOrders } = require("../backend/api/dsk-live-orders.cjs");

const id1 = "11111111-1111-4111-8111-111111111111", id2 = "22222222-2222-4222-8222-222222222222";
const bankId = "01491d0b-c848-7dd6-a20d-e96900a7d8c0";
const url = `https://epg.dskbank.bg/payment/merchants/multiecom/payment.html?mdOrder=${bankId}&language=bg`;
function fixture({ restricted = false } = {}) {
  const users = new Map([["owner", { userId: "owner", restricted }]]), experts = new Map([["expert", { consultantId: "expert", ownerUserId: "owner" }]]);
  const dynamo = { async send(command) {
    const input = command.input;
    if (command.constructor.name === "GetCommand") return { Item: users.get(input.Key.userId) };
    if (command.constructor.name === "TransactWriteCommand") {
      const [order, lock, user, expert] = input.TransactItems;
      const person = users.get(user.ConditionCheck.Key.userId), profile = experts.get(expert.ConditionCheck.Key.consultantId);
      if (users.has(order.Put.Item.userId) || users.has(lock.Put.Item.userId) || !person || person.restricted || person.identityDeleted || person.identityDisabled || person.deletionScheduledAt || !profile || profile.ownerUserId !== expert.ConditionCheck.ExpressionAttributeValues[":owner"] || profile.restricted || profile.identityDeleted || profile.identityDisabled || profile.deletionScheduledAt || profile.anonymizedAt) throw Object.assign(new Error("transaction blocked"), { name: "TransactionCanceledException" });
      users.set(order.Put.Item.userId, structuredClone(order.Put.Item));
      users.set(lock.Put.Item.userId, structuredClone(lock.Put.Item));
      return {};
    }
    if (command.constructor.name === "UpdateCommand") {
      const row = users.get(input.Key.userId), v = input.ExpressionAttributeValues;
      if (!row || row.status !== v[":registering"] || row.ownerId !== v[":owner"]) throw Object.assign(new Error("conflict"), { name: "ConditionalCheckFailedException" });
      Object.assign(row, { status: v[":created"], gatewayOrderId: v[":gateway"], checkoutUrl: v[":url"], updatedAt: v[":now"] });
      return {};
    }
    throw Error("Unexpected command");
  } };
  return { users, experts, orders: createDskLiveOrders({ dynamo, usersTable: "users", consultantsTable: "experts", now: () => new Date("2026-11-02T00:00:00Z") }) };
}

test("server chooses immutable tier price and identical requests are idempotent", async () => {
  const { orders, users } = fixture();
  const first = await orders.create("owner", "expert", { checkoutId: id1, tier: "grow" });
  assert.equal(first.amountMinor, 2999); assert.equal(first.currency, "EUR"); assert.equal(first.status, "registering");
  const repeat = await orders.create("owner", "expert", { checkoutId: id1, tier: "grow" });
  assert.equal(repeat.orderNumber, first.orderNumber);
  assert.equal([...users.values()].filter(x => x.kind === "dsk-live").length, 1);
  await assert.rejects(orders.create("owner", "expert", { checkoutId: id1, tier: "spotlight" }), { statusCode: 409 });
  await assert.rejects(orders.create("owner", "expert", { checkoutId: id2, tier: "start", amountMinor: 1 }), { statusCode: 400 });
  await assert.rejects(orders.create("owner", "expert", { checkoutId: id2, tier: "__proto__" }), { statusCode: 400 });
});

test("one owner cannot create a second unresolved order, including concurrent starts", async () => {
  const { orders, users } = fixture();
  const results = await Promise.allSettled([orders.create("owner", "expert", { checkoutId: id1, tier: "start" }), orders.create("owner", "expert", { checkoutId: id2, tier: "start" })]);
  assert.equal(results.filter(x => x.status === "fulfilled").length, 1);
  assert.equal(results.filter(x => x.status === "rejected")[0].reason.statusCode, 409);
  assert.equal([...users.values()].filter(x => x.kind === "dsk-live").length, 1);
});

test("restricted accounts, other owners and unknown orders cannot create or access purchases", async () => {
  const blocked = fixture({ restricted: true });
  await assert.rejects(blocked.orders.create("owner", "expert", { checkoutId: id1, tier: "start" }), { statusCode: 409 });
  assert.equal([...blocked.users.values()].filter(x => x.kind === "dsk-live").length, 0);
  const f = fixture();
  await f.orders.create("owner", "expert", { checkoutId: id1, tier: "start" });
  assert.equal(await f.orders.read("another-owner", id1), null);
  await assert.rejects(f.orders.attachRegistration("another-owner", id1, { gatewayOrderId: bankId, checkoutUrl: url }), { statusCode: 404 });
});

test("registration records only a bank-hosted URL with the matching order identifier", async () => {
  const { orders } = fixture();
  await orders.create("owner", "expert", { checkoutId: id1, tier: "start" });
  await assert.rejects(orders.attachRegistration("owner", id1, { gatewayOrderId: bankId, checkoutUrl: url.replace("epg.dskbank.bg", "evil.invalid") }), { code: "DSK_LIVE_INVALID_REPLY" });
  const result = await orders.attachRegistration("owner", id1, { gatewayOrderId: bankId, checkoutUrl: url });
  assert.equal(result.status, "created");
  assert.equal((await orders.attachRegistration("owner", id1, { gatewayOrderId: bankId, checkoutUrl: url })).checkoutUrl, url);
});

test("unfinished production-payment preparation is not exposed through the deployed handler", () => {
  const handler = readFileSync("backend/api/index.cjs", "utf8");
  assert.doesNotMatch(handler, /require\(["']\.\/dsk-live-(?:gateway|orders)\.cjs["']\)/);
});
