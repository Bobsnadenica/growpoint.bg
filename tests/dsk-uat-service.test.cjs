const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createDskUatService } = require("../backend/api/dsk-uat-service.cjs");
const { loadApi } = require("./helpers/api-harness.cjs");
const id = "ed30e455-53b3-4d9b-9d6c-98528d681d65";
const nextId = "ed30e455-53b3-4d9b-9d6c-98528d681d66";
const bankId = "01491d0b-c848-7dd6-a20d-e96900a7d8c0";
const checkoutUrl = `https://uat.dskbank.bg/payment/merchants/ecom/payment_bg.html?mdOrder=${bankId}`;
const event = (groups, body = {}) => ({ body: JSON.stringify(body), requestContext: { authorizer: { jwt: { claims: { sub: "unit-admin", "cognito:groups": groups } } } } });

function fixture({ register, getStatus, ownerActive = true } = {}) {
  const rows = new Map();
  const calls = [];
  let clock = Date.parse("2026-10-01T12:00:00Z");
  const dynamo = { async send(command) {
    const input = command.input;
    calls.push(command);
    if (command.constructor.name === "GetCommand") return { Item: structuredClone(rows.get(input.Key.userId)) };
    if (command.constructor.name === "TransactWriteCommand") {
      const put = input.TransactItems[0].Put;
      const rate = input.TransactItems[1].Update;
      assert.equal(input.TransactItems[2].ConditionCheck.Key.userId, "unit-admin");
      assert.match(input.TransactItems[2].ConditionCheck.ConditionExpression, /identityDeleted.*identityDisabled.*restricted.*deletionScheduledAt/);
      if (!ownerActive) throw Object.assign(new Error(), { name: "TransactionCanceledException", CancellationReasons: [{ Code: "None" }, { Code: "None" }, { Code: "ConditionalCheckFailed" }] });
      if (rows.has(put.Item.userId) || rows.get(rate.Key.userId)?.lastCreatedAtMs > rate.ExpressionAttributeValues[":cutoff"]) {
        throw Object.assign(new Error(), { name: "TransactionCanceledException" });
      }
      rows.set(put.Item.userId, structuredClone(put.Item));
      rows.set(rate.Key.userId, { lastCreatedAtMs: rate.ExpressionAttributeValues[":now"] });
      return {};
    }
    assert.equal(command.constructor.name, "UpdateCommand");
    const current = rows.get(input.Key.userId);
    if (current.version !== input.ExpressionAttributeValues[":version"]) throw Object.assign(new Error(), { name: "ConditionalCheckFailedException" });
    for (const field of ["status", "updatedAt", "gatewayOrderId", "checkoutUrl", "verifiedAt", "actionCode"]) current[field] = input.ExpressionAttributeValues[`:${field}`];
    current.version = input.ExpressionAttributeValues[":nextVersion"];
    return {};
  } };
  let registrations = 0, statusReads = 0;
  const service = createDskUatService({ dynamo, table: "unit-users", now: () => new Date(clock), adapter: {
    async register(input) { registrations++; return register ? register(input) : { status: "created", gatewayOrderId: bankId, checkoutUrl }; },
    async getStatus(input) { statusReads++; return getStatus ? getStatus(input) : { status: "succeeded", gatewayOrderId: bankId, actionCode: 0, verifiedAt: new Date(clock).toISOString() }; }
  } });
  return { service, rows, calls, registrations: () => registrations, statusReads: () => statusReads, advance: ms => { clock += ms; } };
}

test("UAT config and disabled endpoints require admin; disabled creation makes no external calls", async () => {
  let requests = 0;
  const api = loadApi({ send: async () => { requests++; return {}; } }).test;
  assert.throws(() => api.adminDskUatConfig(event("clients")), value => value.statusCode === 403);
  assert.throws(() => api.adminDskUatConfig({}), value => value.statusCode === 401);
  const reply = api.adminDskUatConfig(event("admin"));
  assert.deepEqual(JSON.parse(reply.body), { enabled: false, amountMinor: 100, currency: "EUR" });
  assert.equal(reply.headers["Cache-Control"], "no-store");
  await assert.rejects(api.adminDskUatCreate(event("admin", { checkoutId: id })), value => value.statusCode === 403);
  await assert.rejects(api.adminDskUatGet(event("clients"), id), value => value.statusCode === 403);
  assert.equal(requests, 0);
});

test("synthetic orders are fixed, isolated, idempotent and provider references stay private", async () => {
  const f = fixture({ register: input => {
    assert.ok(input.orderNumber.length <= 36);
    assert.match(input.orderNumber, /^gp-uat-[a-f0-9]{26}$/);
    assert.equal(input.returnUrl, `https://www.growpoint.bg/admin?paymentTest=${id}`);
    return { status: "created", gatewayOrderId: bankId, checkoutUrl };
  } });
  const first = await f.service.create("unit-admin", { checkoutId: id });
  const second = await f.service.create("unit-admin", { checkoutId: id });
  assert.deepEqual(second, first);
  assert.equal(f.registrations(), 1);
  assert.equal(first.amountMinor, 100);
  assert.equal(first.currency, "EUR");
  assert.equal(first.gatewayOrderId, undefined);
  assert.equal(first.orderNumber, undefined);
  assert.equal(first.ownerId, undefined);
  for (const command of f.calls) {
    const items = command.input.TransactItems;
    assert.equal(command.input.TableName || items[0].Put.TableName, "unit-users");
    if (items) {
      assert.ok(items[0].Put.Item.userId.startsWith("system#dsk-uat#"));
      assert.ok(items[1].Update.Key.userId.startsWith("system#dsk-uat-rate#"));
    } else assert.ok(command.input.Key.userId.startsWith("system#dsk-uat#"));
  }
});

test("amount/card/email injection and invalid IDs never register or write", async () => {
  const f = fixture();
  for (const body of [{ checkoutId: "bad" }, { checkoutId: id, amount: 9999 }, { checkoutId: id, email: "not-sent@example.invalid" }, { checkoutId: id, card: {} }]) {
    await assert.rejects(f.service.create("unit-admin", body), value => value.statusCode === 400);
  }
  assert.equal(f.registrations(), 0);
  assert.equal(f.calls.length, 0);
});

test("another admin cannot retrieve an order; concurrent duplicates register only once", async () => {
  const f = fixture();
  const results = await Promise.all([f.service.create("unit-admin", { checkoutId: id }), f.service.create("unit-admin", { checkoutId: id })]);
  assert.equal(f.registrations(), 1);
  assert.ok(results.every(value => ["created", "pending"].includes(value.status)));
  await assert.rejects(f.service.get("other-admin", id), value => value.statusCode === 404);
});

test("new order rate limit bounds bank calls without blocking retries of original", async () => {
  const f = fixture();
  await f.service.create("unit-admin", { checkoutId: id });
  await assert.rejects(f.service.create("unit-admin", { checkoutId: nextId }), value => value.statusCode === 429);
  await f.service.create("unit-admin", { checkoutId: id });
  assert.equal(f.registrations(), 1);
  f.advance(60000);
  await f.service.create("unit-admin", { checkoutId: nextId });
  assert.equal(f.registrations(), 2);
});

test("verified success/failure/cancellation reflects provider only and never changes live state", async () => {
  for (const status of ["succeeded", "failed", "cancelled", "refunded"]) {
    const f = fixture({ getStatus: () => ({ status, gatewayOrderId: bankId, actionCode: status === "succeeded" ? 0 : 71015, verifiedAt: "2026-10-01T12:00:00Z" }) });
    await f.service.create("unit-admin", { checkoutId: id });
    const result = await f.service.get("unit-admin", id);
    assert.equal(result.status, status);
    assert.equal(result.checkoutUrl, undefined);
    assert.equal(result.gatewayOrderId, undefined);
    assert.equal(result.paymentStatus, undefined);
    assert.equal(result.packageSource, undefined);
    assert.equal(f.rows.size, 2);
    assert.ok(result.verifiedAt);
  }
});

test("ambiguous registration or status outage stays unknown and cannot blindly register again", async () => {
  const f = fixture({ register: () => { throw new Error("private gateway detail"); }, getStatus: () => { throw new Error("private gateway detail"); } });
  assert.equal((await f.service.create("unit-admin", { checkoutId: id })).status, "unknown");
  assert.equal((await f.service.create("unit-admin", { checkoutId: id })).status, "unknown");
  assert.equal((await f.service.get("unit-admin", id)).status, "unknown");
  assert.equal(f.registrations(), 1);
  assert.ok(!JSON.stringify([...f.rows.values()]).includes("private gateway detail"));
});

test("existing created order without checkout URL is repaired by verified status read, never another registration", async () => {
  const canonicalUrl = `https://uat.dskbank.bg/payment/merchants/multiecom/payment.html?mdOrder=${bankId}&language=bg`;
  const f = fixture({ register: () => ({ status: "created", gatewayOrderId: bankId }), getStatus: () => ({ status: "created", gatewayOrderId: bankId, checkoutUrl: canonicalUrl, actionCode: -100, verifiedAt: "2026-10-01T12:00:00Z" }) });
  assert.equal((await f.service.create("unit-admin", { checkoutId: id })).checkoutUrl, undefined);
  assert.equal((await f.service.get("unit-admin", id)).checkoutUrl, canonicalUrl);
  assert.equal((await f.service.create("unit-admin", { checkoutId: id })).checkoutUrl, canonicalUrl);
  assert.equal(f.registrations(), 1);
  assert.equal(f.statusReads(), 1);
  assert.equal(f.rows.size, 2);
});

test("status recovery winning registration race preserves both latest status and bank URL", async () => {
  let release;
  const f = fixture({ register: () => new Promise(resolve => { release = resolve; }), getStatus: () => ({ status: "created", gatewayOrderId: bankId, actionCode: -100, verifiedAt: "2026-10-01T12:00:21Z" }) });
  const creation = f.service.create("unit-admin", { checkoutId: id });
  while (!release) await new Promise(resolve => setImmediate(resolve));
  f.advance(21000);
  assert.equal((await f.service.get("unit-admin", id)).checkoutUrl, undefined);
  release({ status: "created", gatewayOrderId: bankId, checkoutUrl });
  const result = await creation;
  assert.equal(result.checkoutUrl, checkoutUrl);
  assert.equal(result.verifiedAt, "2026-10-01T12:00:21Z");
  assert.equal(result.actionCode, "-100");
  assert.equal(f.registrations(), 1);
});

test("purge/disable/restriction racing creation cannot leave new owner-linked test data", async () => {
  const f = fixture({ ownerActive: false });
  await assert.rejects(f.service.create("unit-admin", { checkoutId: id }), value => value.statusCode === 403);
  assert.equal(f.rows.size, 0);
  assert.equal(f.registrations(), 0);
});

test("status outage winning registration race keeps validated late bank identity for recovery", async () => {
  let release;
  let statusOutage = true;
  const f = fixture({ register: () => new Promise(resolve => { release = resolve; }), getStatus: input => {
    if (statusOutage) throw new Error("gateway unavailable");
    assert.equal(input.orderId, bankId);
    return { status: "created", gatewayOrderId: bankId, verifiedAt: "2026-10-01T12:00:21Z" };
  } });
  const creation = f.service.create("unit-admin", { checkoutId: id });
  while (!release) await new Promise(resolve => setImmediate(resolve));
  f.advance(21000);
  assert.equal((await f.service.get("unit-admin", id)).status, "unknown");
  release({ status: "created", gatewayOrderId: bankId, checkoutUrl });
  assert.equal((await creation).status, "unknown");
  assert.equal(f.rows.get(`system#dsk-uat#unit-admin#${id}`).gatewayOrderId, bankId);
  statusOutage = false;
  assert.equal((await f.service.get("unit-admin", id)).checkoutUrl, checkoutUrl);
  assert.equal(f.registrations(), 1);
});
