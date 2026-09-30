const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApi } = require("./helpers/api-harness.cjs");
const copy = value => JSON.parse(JSON.stringify(value));
const request = sub => ({ pathParameters: { bookingId: "session" }, requestContext: { authorizer: { jwt: { claims: { sub } } } } });
const conditional = () => Object.assign(new Error("snapshot changed"), { name: "ConditionalCheckFailedException" });
const transactionConflict = () => Object.assign(new Error("already credited"), { name: "TransactionCanceledException", CancellationReasons: [{ Code: "ConditionalCheckFailed" }, { Code: "None" }] });

function sessionStore({ confirmation, concurrent = false, failCredit = false, reschedule = false } = {}) {
  const booking = { bookingId: "session", clientId: "client", consultantId: "expert", status: "confirmed", scheduledAt: "2020-01-01T10:00:00.000Z", sessionLengthMinutes: 60, paymentStatus: "unpaid", meetingLink: "https://example.invalid/private-meeting", ...(confirmation ? { sessionConfirmation: confirmation } : {}) };
  let reads = 0, writes = 0, points = 0, credits = 0;
  let release;
  const firstReads = new Promise(resolve => { release = resolve; });
  const api = loadApi({ send: async command => {
    const input = command.input;
    if (command.constructor.name === "GetCommand" && input.TableName === "unit-bookings") {
      assert.equal(input.ConsistentRead, true);
      const snapshot = copy(booking);
      if (concurrent && ++reads <= 2) {
        if (reads === 2) release();
        await firstReads;
      }
      return { Item: snapshot };
    }
    if (command.constructor.name === "GetCommand" && input.TableName === "unit-consultants") return { Item: { consultantId: "expert", ownerUserId: "consultant" } };
    if (command.constructor.name === "UpdateCommand" && input.TableName === "unit-bookings") {
      writes++;
      if (reschedule) { booking.scheduledAt = "2099-01-01T10:00:00.000Z"; reschedule = false; }
      assert.match(input.ConditionExpression, /scheduledAt = :scheduledAt/);
      const matchesMap = ":previous" in input.ExpressionAttributeValues
        ? JSON.stringify(booking.sessionConfirmation) === JSON.stringify(input.ExpressionAttributeValues[":previous"])
        : !Object.prototype.hasOwnProperty.call(booking, "sessionConfirmation");
      if (!matchesMap || booking.scheduledAt !== input.ExpressionAttributeValues[":scheduledAt"] || booking.status !== "confirmed") throw conditional();
      booking.sessionConfirmation = copy(input.ExpressionAttributeValues[":confirmation"]);
      return { Attributes: copy(booking) };
    }
    if (command.constructor.name === "TransactWriteCommand") {
      const [flag, credit] = input.TransactItems.map(item => item.Update);
      assert.equal(input.TransactItems.length, 2);
      assert.equal(flag.Key.bookingId, "session");
      assert.equal(credit.Key.userId, "client");
      assert.match(credit.ConditionExpression, /attribute_exists\(userId\)/);
      if (failCredit) { failCredit = false; throw new Error("temporary credit failure"); }
      if (booking.pointsAwardedSession) throw transactionConflict();
      assert.ok(booking.sessionConfirmation.clientConfirmedAt && booking.sessionConfirmation.consultantConfirmedAt);
      booking.pointsAwardedSession = true;
      points += credit.ExpressionAttributeValues[":amount"];
      credits++;
    }
    return {};
  } });
  return { api: api.test, booking, result: () => ({ writes, points, credits }) };
}

test("repeat session confirmation cannot reveal an unpaid meeting link; outsiders cannot confirm", async () => {
  const store = sessionStore({ confirmation: { clientConfirmedAt: "2020-01-01", consultantConfirmedAt: "" } });
  const result = await store.api.confirmBookingSession(request("client"));
  assert.equal(result.statusCode, 200);
  assert.equal(JSON.parse(result.body).meetingLink, "");
  assert.equal(JSON.parse(result.body).meetingLinkLocked, true);
  assert.equal((await store.api.confirmBookingSession(request("outsider"))).statusCode, 403);
  assert.equal(store.result().writes, 0);
});

test("simultaneous session confirmations retain both timestamps and award exactly once", async () => {
  const store = sessionStore({ concurrent: true });
  const results = await Promise.all([store.api.confirmBookingSession(request("client")), store.api.confirmBookingSession(request("consultant"))]);
  assert.ok(results.every(result => result.statusCode === 200));
  assert.ok(store.booking.sessionConfirmation.clientConfirmedAt);
  assert.ok(store.booking.sessionConfirmation.consultantConfirmedAt);
  assert.deepEqual(store.result(), { writes: 3, points: 10, credits: 1 });
  await Promise.all([store.api.confirmBookingSession(request("client")), store.api.confirmBookingSession(request("consultant"))]);
  assert.equal(store.result().credits, 1);
});

test("session reward failure leaves credit retryable without setting a premature once-only flag", async () => {
  const store = sessionStore({ confirmation: { clientConfirmedAt: "2020-01-01", consultantConfirmedAt: "2020-01-01" }, failCredit: true });
  await assert.rejects(store.api.confirmBookingSession(request("client")), /temporary credit failure/);
  assert.equal(store.booking.pointsAwardedSession, undefined);
  assert.equal(store.result().points, 0);
  assert.equal((await store.api.confirmBookingSession(request("client"))).statusCode, 200);
  assert.equal(store.result().points, 10);
  assert.equal(store.result().credits, 1);
});

test("confirmation racing a reschedule rechecks the new session end and cannot confirm a future session", async () => {
  const store = sessionStore({ reschedule: true });
  const result = await store.api.confirmBookingSession(request("client"));
  assert.equal(result.statusCode, 400);
  assert.equal(store.booking.sessionConfirmation, undefined);
  assert.equal(store.result().points, 0);
});
