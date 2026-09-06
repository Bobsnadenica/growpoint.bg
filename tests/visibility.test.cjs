const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApi } = require("./helpers/api-harness.cjs");
const sub = "11111111-1111-4111-8111-111111111111";
const complete = { consultantId: "expert", ownerUserId: sub, name: "Expert", city: "City", slug: "expert", headline: "Title", bio: "Bio", experienceSummary: "Experience", experienceHighlights: ["One"], educationHighlights: ["School"], specializations: ["Career"], languages: ["bg"], idealFor: ["People"], consultationTopics: ["Career"], workApproach: "Coaching", availability: ["2026-09-10"], comped: true, isPublic: false, profileStatus: "pending", sessionLengthMinutes: 60 };
const event = (mode, groups = ["admin"]) => ({ body: JSON.stringify({ visibilityMode: mode }), pathParameters: { consultantId: "expert" }, requestContext: { authorizer: { jwt: { claims: { sub: "admin", "cognito:groups": groups } } } } });

test("100% active profile publishes into the catalogue index without requiring a cover image", () => {
  const api = loadApi().test;
  const next = api.applyAutomaticVisibility(complete);
  assert.equal(next.isPublic, true);
  assert.equal(next.profileStatus, "approved");
  assert.equal(api.isVisibleConsultant(next), true);
  assert.equal(complete.isPublic, false);
});

test("auto publication never overrides explicit hiding, inactive membership or account safeguards", () => {
  const api = loadApi().test;
  for (const flags of [{ visibilityMode: "hidden" }, { comped: false }, { restricted: true }, { identityDisabled: true }, { identityDeleted: true }, { deletionScheduledAt: "2026-09-06" }, { anonymizedAt: "2026-09-06" }, { languages: [] }]) {
    assert.equal(api.applyAutomaticVisibility({ ...complete, ...flags }).isPublic, false, JSON.stringify(flags));
  }
  assert.equal(api.isVisibleConsultant({ ...complete, isPublic: true, visibilityMode: "hidden" }), false);
});

test("admin visibility updates only visibility fields and checks the live identity before showing", async () => {
  const updates = [];
  const api = loadApi({ environment: { USER_POOL_ID: "pool" }, send: async command => {
    if (command.constructor.name === "GetCommand") return { Item: command.input.TableName === "unit-users" ? { userId: sub } : complete };
    if (command.constructor.name === "ListUsersCommand") return { Users: [{ Enabled: true, Attributes: [{ Name: "sub", Value: sub }] }] };
    if (command.constructor.name === "UpdateCommand") updates.push(command.input);
    return {};
  } });
  const result = await api.test.setConsultantVisibility(event("shown"));
  assert.equal(result.statusCode, 200);
  assert.equal(JSON.parse(result.body).isPublic, true);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].ExpressionAttributeValues[":status"], "approved");
  assert.doesNotMatch(updates[0].UpdateExpression, /comped|package|restricted/);
  assert.match(updates[0].ConditionExpression, /updatedAt/);
});

test("non-admins cannot change visibility; invalid modes cannot write", async () => {
  let writes = 0;
  const api = loadApi({ send: async () => { writes++; return {}; } });
  await assert.rejects(() => api.test.setConsultantVisibility(event("shown", [])), error => error.statusCode === 403);
  assert.equal((await api.test.setConsultantVisibility(event("invalid"))).statusCode, 400);
  assert.equal(writes, 0);
});

test("admin cannot show an inactive or restricted expert", async () => {
  for (const flags of [{ comped: false }, { restricted: true }, { identityDeleted: true }]) {
    let wrote = false;
    const api = loadApi({ send: async command => {
      if (command.constructor.name === "GetCommand") return { Item: command.input.TableName === "unit-users" ? { userId: sub } : { ...complete, ...flags } };
      wrote = true; return {};
    } });
    assert.equal((await api.test.setConsultantVisibility(event("shown"))).statusCode, 400);
    assert.equal(wrote, false);
  }
});

test("granting Start is an active admin grant and publishes a complete profile", async () => {
  let item;
  const api = loadApi({ send: async command => {
    if (command.constructor.name === "GetCommand") return { Item: { ...complete, comped: false } };
    if (command.constructor.name === "PutCommand") item = command.input.Item;
    return {};
  } });
  const result = await api.test.setConsultantPackage({ ...event("auto"), body: JSON.stringify({ packageTier: "start" }) });
  assert.equal(result.statusCode, 200);
  assert.equal(item.packageSource, "granted");
  assert.equal(item.profileStatus, "approved");
  assert.equal(JSON.parse(result.body).isPublic, true);
});
