const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApi } = require("./helpers/api-harness.cjs");
const json = (value) => JSON.parse(JSON.stringify(value));
function event(method, path, body, claims) {
  return { rawPath: path, body: body === undefined ? undefined : JSON.stringify(body), headers: {}, requestContext: { http: { method, sourceIp: "192.0.2.1" }, authorizer: claims ? { jwt: { claims } } : undefined } };
}

test("point refunds atomically credit the client and flag the booking, without recreating deleted users", async () => {
  const commands = [];
  const api = loadApi({ send: async (command) => { commands.push(command); return {}; } });
  await api.test.refundFreePointsIfNeeded({ bookingId: "b", clientId: "c", freeViaPoints: true, status: "pending" });
  assert.equal(commands.length, 1);
  assert.equal(commands[0].constructor.name, "TransactWriteCommand");
  assert.equal(commands[0].input.TransactItems.length, 2);
  assert.match(commands[0].input.TransactItems[1].Update.ConditionExpression, /attribute_exists\(userId\)/);
  const failure = loadApi({ send: async () => { throw new Error("storage unavailable"); } });
  await assert.rejects(failure.test.refundFreePointsIfNeeded({ bookingId: "b", clientId: "c", freeViaPoints: true }), /storage unavailable/);
});

test("statistics require a Cognito admin, never a separate shared password", async () => {
  const api = loadApi({ environment: { USER_POOL_ID: "unit-pool" }, send: async (command) => {
    if (command.constructor.name === "AdminGetUserCommand") return { Enabled: true, UserAttributes: [{ Name: "sub", Value: "a" }] };
    if (command.constructor.name === "AdminListGroupsForUserCommand") return { Groups: [{ GroupName: "admin" }] };
    return {};
  } });
  assert.equal((await api.handler(event("GET", "/monitoring/metrics"))).statusCode, 404);
  assert.equal((await api.handler(event("GET", "/admin/metrics"))).statusCode, 401);
  assert.equal((await api.handler(event("GET", "/admin/metrics", undefined, { sub: "a", "cognito:groups": "clients" }))).statusCode, 403);
  assert.equal((await api.handler(event("GET", "/admin/metrics", undefined, { sub: "a", "cognito:groups": "admin" }))).statusCode, 200);
  assert.equal((await api.handler(event("POST", "/monitoring/session", { password: "obsolete" }))).statusCode, 404);
  const spoof = event("GET", "/admin/metrics"); spoof.headers.Authorization = `Bearer ${"a".repeat(43)}`;
  assert.equal((await api.handler(spoof)).statusCode, 401);
});

test("invalid JSON objects return 400, never server errors", async () => {
  const api = loadApi();
  for (const body of [null, [], 5, "string"]) assert.throws(() => api.test.parseBody({ body: JSON.stringify(body) }), (e) => e.statusCode === 400);
  assert.throws(() => api.test.parseBody({ body: "{" }), (e) => e.statusCode === 400);
  assert.deepEqual(json(api.test.parseBody({ body: Buffer.from('{"ok":true}').toString("base64"), isBase64Encoded: true })), { ok: true });
});

test("suspended and deleting accounts cannot mutate using an existing JWT", async () => {
  for (const flags of [{ restricted: true }, { deletionScheduledAt: "2026-09-05" }]) {
    const api = loadApi({ environment: { USER_POOL_ID: "unit-pool" }, send: async (command) => command.constructor.name === "AdminGetUserCommand" ? { Enabled: true, UserAttributes: [{ Name: "sub", Value: "a" }] } : { Item: { userId: "a", ...flags } } });
    const response = await api.handler(event("PUT", "/consultants/me", {}, { sub: "a" }));
    assert.equal(response.statusCode, 403);
  }
});

test("public member profile hides suspended, internal and deleting users", async () => {
  for (const flags of [{ restricted: true }, { deletionScheduledAt: "2026-09-05" }, { deletionEffectiveAt: "2026-09-05" }, { userId: "system#telemetry" }]) {
    const api = loadApi({ send: async () => ({ Item: { userId: "a", name: "Private", ...flags } }) });
    const response = await api.handler({ ...event("GET", "/public/users/a"), pathParameters: { id: "a" } });
    assert.equal(response.statusCode, 404);
    assert.ok(!response.body.includes("Private"));
  }
});

for (const operation of ["scanWithFilter", "queryConsultantsByStatus"]) {
  test(`${operation} paginates 61 matching profiles without gaps`, async () => {
    const rows = Array.from({ length: 61 }, (_, i) => ({ consultantId: String(i), visible: i % 3 !== 0 }));
    const api = loadApi({ send: async ({ input }) => {
      const start = input.ExclusiveStartKey ? Number(input.ExclusiveStartKey.consultantId) + 1 : 0;
      const Items = rows.slice(start, start + input.Limit);
      return { Items, LastEvaluatedKey: start + input.Limit < rows.length ? { consultantId: Items[Items.length - 1].consultantId } : undefined };
    } });
    let startKey; const collected = [];
    do {
      const result = await api.test[operation]({ tableName: "unit-consultants", status: "approved", filter: (r) => r.visible, pageSize: 7, startKey });
      collected.push(...result.items.map((r) => r.consultantId)); startKey = result.lastEvaluatedKey;
    } while (startKey);
    assert.deepEqual(collected, rows.filter((r) => r.visible).map((r) => r.consultantId));
  });
}

test("full scans fail rather than silently report incomplete statistics", async () => {
  const api = loadApi({ send: async () => ({ Items: [{}], LastEvaluatedKey: { userId: "next" } }) });
  await assert.rejects(api.test.scanAllItems("unit-users", { maxPages: 2 }), (e) => e.statusCode === 503);
});

test("metrics exclude internal/example rows and deduplicate experts, without exposing personal data", async () => {
  const tables = {
    "unit-users": [{ userId: "client", role: "client", email: "private@example.invalid" }, { userId: "expert", role: "consultant" }, { userId: "system#monitoring-session#secret" }, { userId: "invite#private@example.invalid" }, { userId: "referral#test" }, { userId: "example-owner-1", isExample: true }],
    "unit-consultants": [{ consultantId: "expert1", ownerUserId: "expert", profileType: "mentor" }, { consultantId: "expert2", ownerUserId: "expert", profileType: "mentor" }, { consultantId: "mock", ownerUserId: "example-owner-1", isExample: true }, { consultantId: "slug-claim#test", ownerUserId: "expert" }],
    "unit-bookings": [{ bookingId: "1", messages: [{ body: "private message" }], messageCount: 201, status: "confirmed" }, { bookingId: "2", messages: [{}, {}] }]
  };
  const api = loadApi({ send: async (command) => ({ Items: tables[command.input.TableName] || [] }) });
  const metrics = await api.test.buildAdminMetrics();
  assert.equal(metrics.users.total, 2);
  assert.equal(metrics.consultants.total, 1);
  assert.equal(metrics.expertTypes.mentors, 1);
  assert.equal(metrics.messages, 203);
  assert.equal(metrics.cognito.available, false);
  assert.ok(!JSON.stringify(metrics).includes("private"));
  assert.ok(!JSON.stringify(metrics).includes("secret"));
});

test("meeting links remain locked in every client serialization until paid/free", () => {
  const api = loadApi();
  const booking = { clientId: "client", meetingLink: "https://example.invalid/private-meeting", paymentStatus: "unpaid" };
  assert.equal(api.test.bookingForViewer(booking, "client").meetingLink, "");
  assert.equal(api.test.bookingForViewer(booking, "owner").meetingLink, booking.meetingLink);
  for (const paymentStatus of ["paid", "free"]) assert.equal(api.test.bookingForViewer({ ...booking, paymentStatus }, "client").meetingLinkLocked, false);
});

test("SES accepted, failed and skipped outcomes count correctly", async () => {
  for (const expected of ["accepted", "failed", "skipped"]) {
    const counters = [];
    const api = loadApi({ environment: { SES_FROM_EMAIL: expected === "skipped" ? "" : "sender@example.invalid" }, send: async (command) => {
      if (command.constructor.name === "SendEmailCommand" && expected === "failed") throw new Error("SES rejected");
      if (command.constructor.name === "TransactWriteCommand") counters.push(command.input.TransactItems[0].Update.ExpressionAttributeNames["#metric"]);
      return {};
    } });
    assert.equal((await api.test.sendEmail({ to: "recipient@example.invalid", subject: "Test", text: "Test" })).status, expected);
    assert.deepEqual(counters, [{ accepted: "emailAccepted", failed: "emailFailed", skipped: "emailSkipped" }[expected]]);
  }
});
