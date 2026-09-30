const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApi } = require("./helpers/api-harness.cjs");
const copy = value => JSON.parse(JSON.stringify(value));
const event = body => ({ body: JSON.stringify(body), requestContext: { authorizer: { jwt: { claims: { sub: "client", email: "client@example.invalid" } } } } });
const version = "terms-2026-09-30+privacy-2026-10-01";

test("terms acceptance is explicit, current-version and server-timestamped", async () => {
  let fields;
  const api = loadApi({ send: async command => {
    if (command.constructor.name === "GetCommand") return { Item: { userId: "client", role: "client", documents: [], points: 0, termsAcceptanceRequired: true } };
    if (command.constructor.name === "UpdateCommand") {
      fields = Object.fromEntries(Object.entries(command.input.ExpressionAttributeNames).filter(([key]) => key.startsWith("#field")).map(([key, name]) => [name, command.input.ExpressionAttributeValues[key.replace("#", ":")]]));
      return {};
    }
    return {};
  } }).test;
  assert.equal((await api.updateMeProfile(event({ name: "Client", acceptedTermsAt: "invented", acceptedTermsVersion: version }))).statusCode, 403);
  await assert.rejects(api.updateMeProfile(event({ acceptTerms: true, acceptedTermsVersion: "obsolete" })), error => error.statusCode === 400);
  assert.equal((await api.updateMeProfile(event({ acceptTerms: true, acceptedTermsVersion: version, acceptedTermsAt: "invented" }))).statusCode, 200);
  assert.equal(fields.acceptedTermsVersion, version);
  assert.equal(fields.termsAcceptanceRequired, false);
  assert.notEqual(fields.acceptedTermsAt, "invented");
  assert.ok(Number.isFinite(Date.parse(fields.acceptedTermsAt)));
  assert.deepEqual(JSON.parse(JSON.stringify(api.termsAcceptance({ acceptTerms: "true", acceptedTermsVersion: version }, "now"))), {});
});

test("new social profiles retain required consent across sessions; legacy profiles are not retrofitted", async () => {
  let stored;
  const api = loadApi({ send: async command => {
    if (command.constructor.name === "GetCommand") return { Item: command.input.Key.userId === "client" ? stored : undefined };
    if (command.constructor.name === "PutCommand" && command.input.Item.userId === "client") stored = copy(command.input.Item);
    if (command.constructor.name === "UpdateCommand") return { Attributes: stored };
    return {};
  } }).test;
  await api.bootstrapUser(event({ socialOnboarding: true }));
  assert.equal(stored.termsAcceptanceRequired, true);
  const second = JSON.parse((await api.bootstrapUser(event({}))).body);
  assert.equal(second.termsAcceptanceRequired, true);
  delete stored.termsAcceptanceRequired;
  const legacy = JSON.parse((await api.bootstrapUser(event({ socialOnboarding: true }))).body);
  assert.equal(legacy.termsAcceptanceRequired, undefined);
});

function reminders({ configured = true, failClient = false, secondPage = false, legacy = false, notificationFailure = false } = {}) {
  const booking = { bookingId: "booking", status: "confirmed", scheduledAt: new Date(Date.now() + 24 * 3600000).toISOString(), clientId: "client", consultantId: "expert" };
  if (legacy) booking.reminderSentAt = "2026-09-29T00:00:00.000Z";
  const notifications = { client: [], expert: [] }, emails = [];
  let scans = 0;
  const api = loadApi({ environment: configured ? { SES_FROM_EMAIL: "platform@example.invalid" } : {}, send: async command => {
    const input = command.input;
    switch (command.constructor.name) {
      case "ScanCommand":
        scans++;
        assert.match(input.FilterExpression, /attribute_exists\(reminderAttempts\)/);
        if (secondPage && !input.ExclusiveStartKey) return { Items: [], LastEvaluatedKey: { bookingId: "previous" } };
        // Deliberately return legacy rows too, exercising the defensive guard.
        return { Items: [copy(booking)] };
      case "GetCommand": return { Item: input.TableName === "unit-consultants" ? { ownerUserId: "expert", name: "Expert" } : { userId: input.Key.userId, email: `${input.Key.userId}@example.invalid`, name: "QA" } };
      case "SendEmailCommand": {
        const to = input.Destination.ToAddresses[0]; emails.push(to);
        if (to.startsWith("client") && failClient) throw Object.assign(new Error("SES test rejection"), { name: "MessageRejected" });
        return {};
      }
      case "UpdateCommand":
        if (input.TableName !== "unit-bookings") return {};
        if (input.UpdateExpression.includes("reminderAttempts =")) {
          assert.match(input.ConditionExpression, /reminderAttempts < :maximum/);
          assert.equal(input.ExpressionAttributeValues[":maximum"], 4);
          if (booking.reminderAttempts >= 4 || (booking.reminderRetryAfter && booking.reminderRetryAfter > input.ExpressionAttributeValues[":now"])) throw Object.assign(new Error("claimed"), { name: "ConditionalCheckFailedException" });
          booking.reminderAttempts = (booking.reminderAttempts || 0) + 1;
          booking.reminderRetryAfter = input.ExpressionAttributeValues[":retry"];
        } else {
          assert.match(input.ConditionExpression, /scheduledAt = :scheduled/);
          for (const [key, field] of Object.entries(input.ExpressionAttributeNames)) if (key.startsWith("#field")) booking[field] = input.ExpressionAttributeValues[key.replace("#", ":")];
        }
        return {};
      case "TransactWriteCommand": {
        const [marker, append] = input.TransactItems.map(item => item.Update);
        if (marker.TableName !== "unit-bookings") return {};
        const flag = marker.ExpressionAttributeNames["#notified"];
        assert.match(marker.ConditionExpression, /scheduledAt = :scheduled/);
        if (notificationFailure) { notificationFailure = false; throw new Error("transient notification failure"); }
        if (booking[flag]) throw Object.assign(new Error("notified"), { name: "TransactionCanceledException" });
        booking[flag] = marker.ExpressionAttributeValues[":field0"];
        notifications[append.Key.userId].push(...append.ExpressionAttributeValues[":item"]);
        return {};
      }
      default: return {};
    }
  } }).test;
  return { api, booking, notifications, emails, allowRetry: () => { booking.reminderRetryAfter = "2000-01-01"; }, recover: () => { failClient = false; }, scans: () => scans };
}

test("failed SES reminders retry only rejected recipient; in-app notifications commit once", async () => {
  const store = reminders({ failClient: true, secondPage: true });
  await store.api.sendDueReminders();
  assert.equal(store.booking.reminderSentAt, undefined);
  assert.equal(store.booking.clientReminderEmailAcceptedAt, undefined);
  assert.ok(store.booking.consultantReminderEmailAcceptedAt);
  assert.equal(store.scans(), 2);
  await store.api.sendDueReminders(); // Lease blocks overlapping invocation.
  assert.equal(store.emails.length, 2);
  store.allowRetry(); store.recover();
  await store.api.sendDueReminders();
  assert.ok(store.booking.reminderSentAt);
  assert.deepEqual(store.emails, ["client@example.invalid", "expert@example.invalid", "client@example.invalid"]);
  assert.equal(store.notifications.client.length, 1);
  assert.equal(store.notifications.expert.length, 1);
});

test("skipped SES is never marked sent and maintenance retries are bounded", async () => {
  const store = reminders({ configured: false });
  for (let i = 0; i < 6; i++) { store.allowRetry(); await store.api.sendDueReminders(); }
  assert.equal(store.booking.reminderSentAt, undefined);
  assert.equal(store.booking.reminderAttempts, 4);
  assert.equal(store.emails.length, 0);
  assert.equal(store.notifications.client.length, 1);
  assert.equal(store.notifications.expert.length, 1);
});

test("historical reminderSentAt never resends unknown delivery or already-appended notifications", async () => {
  const store = reminders({ legacy: true });
  const result = await store.api.sendDueReminders();
  assert.equal(result.processed, 0);
  assert.equal(store.booking.reminderAttempts, undefined);
  assert.equal(store.emails.length, 0);
  assert.equal(store.notifications.client.length, 0);
  assert.equal(store.notifications.expert.length, 0);
  assert.equal(store.booking.clientReminderEmailAcceptedAt, undefined);
});

test("new accepted-email rows still retry failed notifications without resending mail", async () => {
  const store = reminders({ notificationFailure: true });
  await store.api.sendDueReminders();
  assert.ok(store.booking.reminderSentAt);
  assert.equal(store.notifications.client.length, 0);
  assert.equal(store.notifications.expert.length, 0);
  assert.equal(store.emails.length, 2);
  store.allowRetry();
  await store.api.sendDueReminders();
  assert.equal(store.emails.length, 2);
  assert.equal(store.notifications.client.length, 1);
  assert.equal(store.notifications.expert.length, 1);
});
