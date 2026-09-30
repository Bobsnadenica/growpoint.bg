const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApi } = require("./helpers/api-harness.cjs");
const copy = value => JSON.parse(JSON.stringify(value));
const complete = { userId: "client", role: "client", name: "Client", avatarUrl: "https://example.invalid/portrait", city: "City", occupation: "Work", bio: "Bio", goals: "Goals", referredByUserId: "referrer", points: 0 };

function rewards({ failOnce = false, missingReferrer = false } = {}) {
  const users = { client: copy(complete), referrer: missingReferrer ? null : { userId: "referrer", points: 0 } };
  let awards = 0;
  const api = loadApi({ send: async command => {
    if (command.constructor.name === "GetCommand") return { Item: users[command.input.Key.userId] ? copy(users[command.input.Key.userId]) : undefined };
    if (command.constructor.name === "TransactWriteCommand") {
      if (failOnce) { failOnce = false; throw new Error("temporary transaction failure"); }
      const items = command.input.TransactItems.map(item => item.Update);
      assert.match(items[0].UpdateExpression, /awardedProfileComplete = :yes/);
      if (users.client.awardedProfileComplete) throw Object.assign(new Error("already credited"), { name: "TransactionCanceledException", CancellationReasons: [{ Code: "ConditionalCheckFailed" }] });
      if (!missingReferrer) {
        assert.equal(items.length, 2);
        assert.match(items[0].UpdateExpression, /referralCredited = :yes/);
        assert.equal(items[1].Key.userId, "referrer");
      } else assert.equal(items.length, 1);
      // Both balances and flags are applied only after every condition passes.
      for (const item of items) users[item.Key.userId].points += item.ExpressionAttributeValues[":amount"];
      users.client.awardedProfileComplete = true;
      if (!missingReferrer) users.client.referralCredited = true;
      awards++;
    }
    return {};
  } }).test;
  return { api, users, awards: () => awards };
}

test("profile and referral rewards commit once with their flags despite concurrent completion reads", async () => {
  const store = rewards();
  const snapshot = copy(store.users.client);
  const results = await Promise.all([store.api.awardProfileCompletionIfEligible("client", snapshot), store.api.awardProfileCompletionIfEligible("client", snapshot)]);
  assert.deepEqual(results.sort((a, b) => a - b), [0, 20]);
  assert.equal(store.users.client.points, 20);
  assert.equal(store.users.referrer.points, 30);
  assert.equal(store.users.client.referralCredited, true);
  assert.equal(store.awards(), 1);
});

test("a failed referral transaction leaves every flag and balance retryable; missing referrers are not recreated", async () => {
  const store = rewards({ failOnce: true });
  await assert.rejects(store.api.awardProfileCompletionIfEligible("client", copy(store.users.client)), /temporary transaction failure/);
  assert.equal(store.users.client.awardedProfileComplete, undefined);
  assert.equal(store.users.client.referralCredited, undefined);
  assert.equal(store.users.client.points, 0);
  assert.equal(store.users.referrer.points, 0);
  assert.equal(await store.api.awardProfileCompletionIfEligible("client", copy(store.users.client)), 20);
  assert.equal(store.users.referrer.points, 30);
  const missing = rewards({ missingReferrer: true });
  assert.equal(await missing.api.awardProfileCompletionIfEligible("client", copy(missing.users.client)), 20);
  assert.equal(missing.users.referrer, null);
});

test("a redeemed invite resumes only for the same identity and token", async () => {
  const invite = { status: "redeemed", redeemedBy: "client", token: "unit-token", expiresAt: "2020-01-01" };
  let writes = 0;
  const api = loadApi({ send: async command => { if (command.constructor.name === "GetCommand") return { Item: invite }; writes++; return {}; } }).test;
  assert.ok(await api.redeemInvite("client@example.invalid", "unit-token", "client"));
  assert.equal(await api.redeemInvite("client@example.invalid", "wrong-token", "client"), null);
  assert.equal(await api.redeemInvite("client@example.invalid", "unit-token", "stranger"), null);
  assert.equal(writes, 0);
});

test("invite redemption can recover a failed profile grant for an existing client without granting a stranger", async () => {
  const invite = { userId: "invite#client@example.invalid", status: "pending", token: "unit-token", expiresAt: "2099-01-01" };
  const user = { userId: "client", role: "client", referralCode: "abcdefgh", documents: [], points: 20 };
  let failGrant = true, draft;
  const api = loadApi({ send: async command => {
    const input = command.input;
    if (command.constructor.name === "GetCommand") return { Item: copy(input.Key.userId.startsWith("invite#") ? invite : user) };
    if (command.constructor.name === "QueryCommand") return { Items: draft ? [draft] : [] };
    if (command.constructor.name === "UpdateCommand") {
      if (input.Key.userId === invite.userId) Object.assign(invite, { status: "redeemed", redeemedBy: "client" });
      else if (input.TableName === "unit-users") {
        if (failGrant) { failGrant = false; throw new Error("temporary profile failure"); }
        for (const [key, field] of Object.entries(input.ExpressionAttributeNames)) if (key.startsWith("#field")) user[field] = input.ExpressionAttributeValues[key.replace("#", ":")];
        return { Attributes: copy(user) };
      }
    }
    if (command.constructor.name === "TransactWriteCommand") draft = input.TransactItems.map(item => item.Put?.Item).find(item => item?.name !== undefined);
    return {};
  } }).test;
  const event = { body: JSON.stringify({ inviteToken: "unit-token" }), requestContext: { authorizer: { jwt: { claims: { sub: "client", email: "client@example.invalid" } } } } };
  await assert.rejects(api.bootstrapUser(event), /temporary profile failure/);
  assert.equal(invite.status, "redeemed");
  assert.equal(user.compedConsultant, undefined);
  const result = await api.bootstrapUser(event);
  assert.equal(result.statusCode, 200);
  assert.equal(user.role, "consultant");
  assert.equal(user.compedConsultant, true);
  assert.equal(draft.comped, true);
  assert.equal(user.points, 20);
  assert.equal(await api.redeemInvite("client@example.invalid", "unit-token", "stranger"), null);
});

test("group-designated clients get actionable guidance before their expert invite is consumed", async () => {
  let writes = 0, reads = 0;
  const api = loadApi({ send: async command => {
    if (command.constructor.name === "GetCommand") { reads++; return { Item: { userId: "client", role: "client" } }; }
    writes++;
    return {};
  } }).test;
  const result = await api.bootstrapUser({ body: JSON.stringify({ inviteToken: "unit-token" }), requestContext: { authorizer: { jwt: { claims: { sub: "client", email: "client@example.invalid", "cognito:groups": ["clients"] } } } } });
  assert.equal(result.statusCode, 400);
  assert.match(JSON.parse(result.body).message, /clients.*consultants/);
  assert.equal(reads, 1);
  assert.equal(writes, 0);
});
