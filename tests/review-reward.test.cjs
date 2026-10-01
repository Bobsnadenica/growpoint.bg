const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApi } = require("./helpers/api-harness.cjs");
const copy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const cancelled = () => Object.assign(new Error("eligibility changed"), {
  name: "TransactionCanceledException", CancellationReasons: [{ Code: "ConditionalCheckFailed" }]
});
const request = (sub = "client") => ({
  pathParameters: { bookingId: "review-session" }, body: JSON.stringify({ rating: 5, comment: "QA fixture" }),
  requestContext: { authorizer: { jwt: { claims: { sub } } } }
});

function reviewStore({ failOnce, beforeCommit, concurrent = false, legacy = false } = {}) {
  const state = {
    booking: { bookingId: "review-session", clientId: "client", consultantId: "expert", status: "confirmed",
      scheduledAt: new Date(Date.now() - 7200000).toISOString(), sessionLengthMinutes: 60,
      sessionConfirmation: { clientConfirmedAt: "fixture", consultantConfirmedAt: "fixture" },
      paymentStatus: "unpaid", meetingLink: "https://example.invalid/private" },
    expert: { consultantId: "expert", ownerUserId: "consultant", sessionLengthMinutes: 60, rating: 4, reviewCount: 2 },
    client: { userId: "client", points: 20, pointsHistory: [] }, commits: 0, notifications: 0
  };
  if (legacy) delete state.booking.sessionLengthMinutes;
  let reads = 0, release;
  const ready = new Promise(resolve => { release = resolve; });
  const matchesSnapshot = (row, item) => Object.entries(item.ExpressionAttributeNames || {}).every(([alias, field]) => {
    if (!alias.startsWith("#snapshot")) return true;
    const value = alias.replace("#", ":");
    return Object.prototype.hasOwnProperty.call(item.ExpressionAttributeValues, value)
      ? JSON.stringify(row?.[field]) === JSON.stringify(item.ExpressionAttributeValues[value])
      : row && !Object.prototype.hasOwnProperty.call(row, field);
  });
  const api = loadApi({ send: async command => {
    const input = command.input;
    if (command.constructor.name === "GetCommand") {
      const row = input.TableName === "unit-bookings" ? state.booking : state.expert;
      const snapshot = copy(row);
      if (input.TableName === "unit-bookings") {
        assert.equal(input.ConsistentRead, true);
        if (concurrent && ++reads <= 2) {
          if (reads === 2) release();
          await ready;
        }
      }
      return { Item: snapshot };
    }
    if (command.constructor.name === "TransactWriteCommand") {
      assert.equal(input.TransactItems.length, 3, "reward must commit with review and rating");
      const [review, aggregate, credit] = input.TransactItems.map(item => item.Update);
      assert.equal(review.TableName, "unit-bookings");
      assert.equal(aggregate.TableName, "unit-consultants");
      assert.equal(credit.TableName, "unit-users");
      assert.equal(credit.Key.userId, "client");
      assert.equal(credit.ExpressionAttributeValues[":amount"], 10);
      assert.match(review.ConditionExpression, /attribute_not_exists\(#r\)/);
      assert.match(aggregate.ConditionExpression, /attribute_exists\(consultantId\).*identityDeleted.*anonymizedAt/);
      assert.match(credit.ConditionExpression, /attribute_exists\(userId\).*identityDeleted.*deletionScheduledAt.*identityDisabled.*restricted/);
      if (failOnce) { failOnce = false; throw new Error("temporary transaction failure"); }
      if (beforeCommit) { const mutate = beforeCommit; beforeCommit = null; mutate(state); }
      if (!state.booking || state.booking.review || state.booking.status !== "confirmed" || !matchesSnapshot(state.booking, review) ||
          !state.expert || state.expert.identityDeleted !== undefined || state.expert.anonymizedAt !== undefined || !matchesSnapshot(state.expert, aggregate) ||
          !state.client || state.client.identityDeleted !== undefined || state.client.deletionScheduledAt !== undefined || state.client.identityDisabled === true || state.client.restricted === true) throw cancelled();
      // Apply nothing until every condition has passed: model DynamoDB atomicity.
      state.booking.review = copy(review.ExpressionAttributeValues[":review"]);
      state.expert.ratingSum = (state.expert.ratingSum ?? aggregate.ExpressionAttributeValues[":legacySum"]) + aggregate.ExpressionAttributeValues[":newRating"];
      state.expert.reviewCount = (state.expert.reviewCount || 0) + 1;
      state.client.points += credit.ExpressionAttributeValues[":amount"];
      state.client.pointsHistory.push(...copy(credit.ExpressionAttributeValues[":entry"]));
      state.commits++;
      return {};
    }
    if (command.constructor.name === "UpdateCommand") {
      assert.match(input.UpdateExpression, /notifications/, "no separate non-atomic bonus update");
      state.notifications++;
      return {};
    }
    throw new Error("unexpected command");
  } }).test;
  return { api, state };
}

test("review, legacy aggregate, and ten-point reward commit together once without leaking an unpaid meeting", async () => {
  const { api, state } = reviewStore();
  const result = await api.submitReview(request());
  assert.equal(result.statusCode, 200);
  assert.equal(JSON.parse(result.body).booking.meetingLink, "");
  assert.equal(state.expert.ratingSum, 13);
  assert.equal(state.expert.reviewCount, 3);
  assert.equal(state.client.points, 30);
  assert.equal(state.client.pointsHistory.length, 1);
  assert.equal(state.client.pointsHistory[0].type, "review");
  assert.equal((await api.submitReview(request())).statusCode, 400);
  assert.equal(state.commits, 1);
  assert.equal(state.notifications, 1);
});

test("temporary transaction failure leaves every review/reward write retryable", async () => {
  const { api, state } = reviewStore({ failOnce: true });
  await assert.rejects(api.submitReview(request()), /temporary transaction failure/);
  assert.equal(state.booking.review, undefined);
  assert.equal(state.expert.reviewCount, 2);
  assert.equal(state.client.points, 20);
  assert.equal(state.notifications, 0);
  assert.equal((await api.submitReview(request())).statusCode, 200);
  assert.equal(state.client.points, 30);
  assert.equal(state.commits, 1);
});

test("simultaneous reviews cannot duplicate aggregate or bonus", async () => {
  const { api, state } = reviewStore({ concurrent: true });
  const results = await Promise.all([api.submitReview(request()), api.submitReview(request())]);
  assert.deepEqual(results.map(result => result.statusCode).sort(), [200, 400]);
  assert.equal(state.expert.reviewCount, 3);
  assert.equal(state.client.points, 30);
  assert.equal(state.commits, 1);
});

test("booking eligibility snapshots reject concurrent attendance/date/owner changes", async () => {
  const mutations = [
    state => { state.booking.scheduledAt = "2099-01-01T00:00:00.000Z"; },
    state => { state.booking.sessionLengthMinutes = 180; },
    state => { state.booking.sessionConfirmation = {}; },
    state => { state.booking.clientId = "other"; },
    state => { state.booking.status = "cancelled"; }
  ];
  for (const beforeCommit of mutations) {
    const { api, state } = reviewStore({ beforeCommit });
    assert.equal((await api.submitReview(request())).statusCode, 400);
    assert.equal(state.booking.review, undefined);
    assert.equal(state.client.points, 20);
    assert.equal(state.expert.reviewCount, 2);
  }
});

test("deleted/deleting/disabled/restricted clients or deleted experts cannot be recreated by review credit", async () => {
  const mutations = [
    state => { state.client = undefined; },
    state => { state.client.identityDeleted = true; },
    state => { state.client.deletionScheduledAt = "fixture"; },
    state => { state.client.identityDisabled = true; },
    state => { state.client.restricted = true; },
    state => { state.expert = undefined; },
    state => { state.expert.identityDeleted = true; },
    state => { state.expert.anonymizedAt = "fixture"; }
  ];
  for (const beforeCommit of mutations) {
    const { api, state } = reviewStore({ beforeCommit });
    assert.equal((await api.submitReview(request())).statusCode, 400);
    assert.equal(state.booking.review, undefined);
    assert.equal(state.commits, 0);
    if (state.client) assert.equal(state.client.points, 20);
  }
});

test("legacy booking duration fallback is guarded; unrelated clients cannot review", async () => {
  const legacy = reviewStore({ legacy: true, beforeCommit: state => { state.expert.sessionLengthMinutes = 180; } });
  assert.equal((await legacy.api.submitReview(request())).statusCode, 400);
  assert.equal(legacy.state.commits, 0);
  const unrelated = reviewStore();
  assert.equal((await unrelated.api.submitReview(request("other"))).statusCode, 403);
  assert.equal(unrelated.state.commits, 0);
});
