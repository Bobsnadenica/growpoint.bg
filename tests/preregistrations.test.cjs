const test = require("node:test");
const assert = require("node:assert/strict");
const { createPreregistrations, normalizeRegistration, registrationsCsv } = require("../backend/api/preregistrations.cjs");
const { loadApi } = require("./helpers/api-harness.cjs");
const input = { firstName: "Мария", lastName: "Тестова", email: " Test+launch@EXAMPLE.com ", audience: "mentor", phone: "+359 888 123 456", comment: "Искам да споделям опит.", consent: true };

test("Pre-registration validates contact fields, role and explicit consent", () => {
  assert.equal(normalizeRegistration(input).email, "test+launch@example.com");
  for (const change of [{ consent: false }, { audience: "admin" }, { firstName: "" }, { email: "wrong" }, { phone: "<script>" }, { comment: "x".repeat(1001) }, { lastName: "a\nb" }, { email: {} }]) {
    assert.throws(() => normalizeRegistration({ ...input, ...change }), { statusCode: 400 });
  }
  assert.equal(normalizeRegistration({ ...input, phone: "", comment: "" }).phone, "");
});

test("Private launch storage uses atomic email deduplication, retention and hashed short-lived rate records", async () => {
  const calls = [];
  const store = createPreregistrations({ table: "private-launch", now: () => Date.parse("2026-11-10T12:00:00Z"), dynamo: { async send(c) {
    calls.push(c.input);
    if (c.constructor.name === "PutCommand" && calls.length > 2) throw Object.assign(new Error(), { name: "ConditionalCheckFailedException" });
    return {};
  } } });
  await store.submit(input, "192.0.2.1");
  await store.submit(input, "192.0.2.1"); // duplicate stays a generic accepted result
  assert.equal(calls.length, 4);
  assert.ok(!JSON.stringify(calls).includes("192.0.2.1"));
  assert.match(calls[0].ConditionExpression, /attempts < :limit/);
  assert.equal(calls[1].Item.expiresAt, Date.parse("2026-11-10T12:00:00Z") / 1000 + 180 * 86400);
  assert.match(calls[1].ConditionExpression, /attribute_not_exists\(id\)/);
  assert.equal(calls[1].Item.consentAt, "2026-11-10T12:00:00.000Z");
  assert.equal(calls[1].Item.email, "test+launch@example.com");
  assert.equal(calls[1].Item.id, calls[3].Item.id);
  await store.submit({ website: "bot.example" }, "192.0.2.1");
  assert.equal(calls.length, 4);
});

test("Rate limits and storage failures cannot masquerade as accepted real submissions", async () => {
  const rate = createPreregistrations({ table: "test", dynamo: { async send() { throw Object.assign(new Error(), { name: "ConditionalCheckFailedException" }); } } });
  await assert.rejects(rate.submit(input, "ip"), { statusCode: 429 });
  const broken = createPreregistrations({ table: "test", dynamo: { async send() { throw new Error("Unavailable"); } } });
  await assert.rejects(broken.submit(input, "ip"), /Unavailable/);
  await assert.rejects(createPreregistrations({ dynamo: {} }).submit(input, "ip"), { statusCode: 503 });
});

test("Export scans every page, excludes rate/expired items and fails instead of truncating", async () => {
  const calls = [];
  const store = createPreregistrations({ table: "private", dynamo: { async send(c) {
    calls.push(c.input);
    return calls.length === 1 ? { Items: [{ ...input, createdAt: "2026-11-09" }], LastEvaluatedKey: { id: "cursor" } } : { Items: [{ ...input, createdAt: "2026-11-10" }] };
  } } });
  const list = await store.list();
  assert.equal(list.length, 2);
  assert.equal(list[0].createdAt, "2026-11-10");
  assert.equal(calls[1].ExclusiveStartKey.id, "cursor");
  assert.match(calls[0].FilterExpression, /expiresAt > :now/);
  assert.equal(calls[0].ExpressionAttributeValues[":kind"], "registration");
  const infinite = createPreregistrations({ table: "test", dynamo: { async send() { return { LastEvaluatedKey: { id: "again" } }; } } });
  await assert.rejects(infinite.list(), { statusCode: 503 });
});

test("Excel CSV preserves Bulgarian and quoted multiline fields while neutralizing formulas", () => {
  const csv = registrationsCsv([{ ...input, firstName: "=HYPERLINK(\"bad\")", lastName: "  +SUM(1,2)", phone: "+359123456", comment: 'ред 1, "цитат"\nред 2', createdAt: "2026-11-10", consentVersion: "v1" }]);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes('"\'=HYPERLINK(""bad"")"'));
  assert.ok(csv.includes('"\'  +SUM(1,2)"'));
  assert.ok(csv.includes('"ред 1, ""цитат""\nред 2"'));
  assert.ok(csv.includes('"Ментор"'));
});

test("Anonymous pre-registration rejects unexpected origin/oversized input; admin export requires auth", async () => {
  let writes = 0;
  const { handler } = loadApi({ environment: { PREREGISTRATIONS_TABLE: "unit-launch" }, send: async () => { writes++; return {}; } });
  const event = { rawPath: "/preregistrations", headers: { "content-type": "application/json", origin: "https://www.growpoint.bg" }, body: JSON.stringify(input), requestContext: { http: { method: "POST", sourceIp: "192.0.2.1" } } };
  assert.equal((await handler(event)).statusCode, 202);
  assert.equal(writes, 2);
  assert.equal((await handler({ ...event, headers: { ...event.headers, origin: "https://unrelated.example" } })).statusCode, 403);
  assert.equal((await handler({ ...event, body: "x".repeat(12001) })).statusCode, 400);
  assert.equal((await handler({ ...event, headers: {} })).statusCode, 415);
  for (const rawPath of ["/admin/preregistrations", "/admin/preregistrations.csv"]) {
    assert.equal((await handler({ ...event, rawPath, requestContext: { http: { method: "GET" } } })).statusCode, 401);
  }
  assert.equal(writes, 2);
});

test("Only an admin can read summary or download full CSV", async () => {
  const api = loadApi({ environment: { PREREGISTRATIONS_TABLE: "unit-launch" }, send: async () => ({ Items: [{ ...input, createdAt: "2026-11-10", consentVersion: "v1" }] }) });
  const event = groups => ({ requestContext: { authorizer: { jwt: { claims: { sub: "qa", "cognito:groups": groups } } } } });
  await assert.rejects(api.test.adminPreregistrations(event("clients"), true), { statusCode: 403 });
  const summary = await api.test.adminPreregistrations(event("admin"));
  assert.deepEqual(JSON.parse(summary.body), { total: 1, clients: 0, mentors: 1 });
  const csv = await api.test.adminPreregistrations(event("admin"), true);
  assert.equal(csv.headers["Content-Type"], "text/csv; charset=utf-8");
  assert.equal(csv.headers["Cache-Control"], "no-store");
  assert.match(csv.headers["Content-Disposition"], /attachment;/);
  assert.ok(csv.body.startsWith("\uFEFF"));
});
