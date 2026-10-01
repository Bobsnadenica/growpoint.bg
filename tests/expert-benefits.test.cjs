const { test } = require("node:test");
const assert = require("node:assert/strict");
const { monthOf, quarterOf, monthlyFreeMutation, monthlyFreeAvailableMonths, withMonthlyQuota, createBenefitRequest, updateBenefitRequest } = require("../backend/api/expert-benefits.cjs");
const { loadApi } = require("./helpers/api-harness.cjs");
const copy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const request = (body = {}, sub = "client", bookingId) => ({ body: JSON.stringify(body), pathParameters: { bookingId }, requestContext: { authorizer: { jwt: { claims: { sub, "cognito:groups": sub === "admin" ? ["admin"] : [] } } } } });
const conditional = () => Object.assign(new Error("changed"), { name: "ConditionalCheckFailedException" });
const cancelled = () => Object.assign(new Error("changed"), { name: "TransactionCanceledException", CancellationReasons: [{ Code: "ConditionalCheckFailed" }] });

function bookingStore({ failOnce = false, concurrent = false } = {}) {
  const slots = ["2099-01-03T10:00:00.000Z", "2099-01-04T10:00:00.000Z", "2099-02-05T10:00:00.000Z"];
  const state = { expert: { consultantId: "expert", ownerUserId: "consultant", name: "Fixture expert", slug: "fixture", comped: true, priceEur: 10, availability: slots, bookedSlots: [], sessionLengthMinutes: 60 },
    client: { userId: "client", role: "client", points: 150 }, bookings: {}, credits: 0 };
  let reads = 0, release;
  const ready = new Promise(resolve => { release = resolve; });
  const api = loadApi({ send: async command => {
    const input = command.input;
    if (command.constructor.name === "GetCommand") {
      if (input.TableName === "unit-users") return { Item: copy(state.client) };
      if (input.TableName === "unit-bookings") return { Item: copy(state.bookings[input.Key.bookingId]) };
      const snapshot = copy(state.expert);
      if (concurrent && ++reads <= 2) { if (reads === 2) release(); await ready; }
      return { Item: snapshot };
    }
    if (command.constructor.name === "QueryCommand") return { Items: copy(Object.values(state.bookings)) };
    if (command.constructor.name === "TransactWriteCommand") {
      if (failOnce) { failOnce = false; throw new Error("temporary transaction failure"); }
      for (const item of input.TransactItems) {
        const update = item.Update;
        if (!update || update.TableName !== "unit-consultants") continue;
        const values = update.ExpressionAttributeValues;
        if (values[":previousSlots"] && JSON.stringify(state.expert.bookedSlots) !== JSON.stringify(values[":previousSlots"])) throw cancelled();
        if (update.ConditionExpression.includes("attribute_not_exists(monthlyFreeSessions)") && "monthlyFreeSessions" in state.expert) throw cancelled();
        if (values[":previousMonthlyFreeSessions"] && JSON.stringify(values[":previousMonthlyFreeSessions"]) !== JSON.stringify(state.expert.monthlyFreeSessions)) throw cancelled();
        assert.match(update.ConditionExpression, /monthlyFreeSessions|previousSlots/);
      }
      // Atomic commit after all quota/reservation conditions pass.
      for (const item of input.TransactItems) {
        if (item.Put) state.bookings[item.Put.Item.bookingId] = copy(item.Put.Item);
        if (!item.Update) continue;
        const update = item.Update, values = update.ExpressionAttributeValues;
        if (update.TableName === "unit-consultants") {
          state.expert.bookedSlots = values[":slots"] ? copy(values[":slots"]) : [...state.expert.bookedSlots, ...values[":slotList"]];
          if (values[":monthlyFreeSessions"]) state.expert.monthlyFreeSessions = copy(values[":monthlyFreeSessions"]);
        } else if (update.TableName === "unit-bookings") {
          const booking = state.bookings[update.Key.bookingId];
          if (values[":new"]) booking.scheduledAt = values[":new"];
          if (values[":freeMonth"]) booking.freeSessionMonth = values[":freeMonth"];
          booking.status = values[":cancelled"] || values[":declined"] || values[":status"];
        } else throw new Error("monthly offer must not change user points");
      }
      return {};
    }
    if (command.constructor.name === "UpdateCommand") {
      assert.match(input.UpdateExpression, /notifications/, "monthly benefit must not credit/debit points");
      return {};
    }
    throw new Error("unexpected network operation");
  } }).test;
  return { api, state, slots };
}

test("monthly/quarter boundaries use Europe/Sofia, including UTC month and year edges", () => {
  assert.equal(monthOf("2099-01-31T22:30:00Z"), "2099-02");
  assert.equal(quarterOf("2098-12-31T22:30:00Z"), "2099-Q1");
  assert.equal(monthOf("2099-07-31T21:30:00Z"), "2099-08");
  assert.throws(() => monthOf("bad date"), error => error.statusCode === 400);
});

test("monthly offer creates a genuinely free session without touching client points; internal claims stay private", async () => {
  const { api, state, slots } = bookingStore();
  const result = await api.createBooking(request({ consultantId: "expert", scheduledAt: slots[0], useMonthlyFreeSession: true }));
  assert.equal(result.statusCode, 201);
  const booking = JSON.parse(result.body);
  assert.equal(booking.paymentStatus, "free");
  assert.equal(booking.freeViaPoints, false);
  assert.equal(booking.freeSessionSource, "monthly_offer");
  assert.equal(booking.freeSessionMonth, "2099-01");
  assert.equal(state.expert.monthlyFreeSessions["2099-01"], booking.bookingId);
  assert.equal(state.client.points, 150);
  state.expert.spotlightBenefitRequests = [{ requestId: "private-note" }];
  const publicProfile = api.stripSensitiveConsultantFields(state.expert);
  assert.equal(publicProfile.monthlyFreeSessions, undefined);
  assert.equal(publicProfile.spotlightBenefitRequests, undefined);
  assert.deepEqual(Array.from(publicProfile.monthlyFreeSessionAvailableMonths), ["2099-02"]);
  assert.throws(() => monthlyFreeMutation(state.expert, { bookingId: "other", scheduledAt: slots[1] }, "claim"), error => error.statusCode === 409);
});

test("concurrent different slots in one expert month cannot consume two free offers", async () => {
  const { api, state, slots } = bookingStore({ concurrent: true });
  const results = await Promise.all(slots.slice(0, 2).map(scheduledAt => api.createBooking(request({ consultantId: "expert", scheduledAt, useMonthlyFreeSession: true }))));
  assert.deepEqual(results.map(result => result.statusCode).sort(), [201, 409]);
  assert.equal(Object.keys(state.bookings).length, 1);
  assert.equal(Object.keys(state.expert.monthlyFreeSessions).length, 1);
  assert.equal(state.client.points, 150);
});

test("failed monthly booking leaves quota and slot reusable; combining point and monthly sources is rejected", async () => {
  const { api, state, slots } = bookingStore({ failOnce: true });
  const body = { consultantId: "expert", scheduledAt: slots[0], useMonthlyFreeSession: true };
  await assert.rejects(api.createBooking(request(body)), /temporary transaction failure/);
  assert.equal(state.expert.monthlyFreeSessions, undefined);
  assert.equal(state.expert.bookedSlots.length, 0);
  assert.equal((await api.createBooking(request({ ...body, useFreePoints: true }))).statusCode, 400);
  assert.equal((await api.createBooking(request(body))).statusCode, 201);
});

test("cancellation and decline release the monthly claim atomically; repeat close never changes points", async () => {
  for (const status of ["cancelled", "declined"]) {
    const { api, state, slots } = bookingStore();
    const created = await api.createBooking(request({ consultantId: "expert", scheduledAt: slots[0], useMonthlyFreeSession: true }));
    const bookingId = JSON.parse(created.body).bookingId;
    const event = request({ status }, status === "declined" ? "consultant" : "client", bookingId);
    assert.equal((await api.updateBookingStatus(event)).statusCode, 200);
    assert.deepEqual(state.expert.monthlyFreeSessions, {});
    assert.equal(state.expert.bookedSlots.length, 0);
    assert.equal((await api.updateBookingStatus(event)).statusCode, 200);
    assert.equal(state.client.points, 150);
  }
});

test("rescheduling across month moves quota with booking/slot and fails if destination quota is occupied", async () => {
  const { api, state, slots } = bookingStore();
  const created = await api.createBooking(request({ consultantId: "expert", scheduledAt: slots[0], useMonthlyFreeSession: true }));
  const bookingId = JSON.parse(created.body).bookingId;
  state.expert.monthlyFreeSessions["2099-02"] = "different-booking";
  await assert.rejects(api.rescheduleBooking(request({ scheduledAt: slots[2] }, "client", bookingId)), error => error.statusCode === 409);
  assert.equal(state.bookings[bookingId].scheduledAt, slots[0]);
  delete state.expert.monthlyFreeSessions["2099-02"];
  assert.equal((await api.rescheduleBooking(request({ scheduledAt: slots[2] }, "client", bookingId))).statusCode, 200);
  assert.deepEqual(state.expert.monthlyFreeSessions, { "2099-02": bookingId });
  assert.equal(state.bookings[bookingId].freeSessionMonth, "2099-02");
  assert.equal(state.client.points, 150);
});

test("already-started/attended offers remain consumed; old-month release cannot erase a replacement claim", () => {
  const booking = { bookingId: "fixture", scheduledAt: "2020-01-01", freeSessionSource: "monthly_offer", freeSessionMonth: "2020-01" };
  assert.equal(monthlyFreeMutation({ monthlyFreeSessions: { "2020-01": "fixture" } }, booking, "release"), null);
  const future = { ...booking, scheduledAt: "2099-01-01", freeSessionMonth: "2099-01" };
  assert.equal(monthlyFreeMutation({ monthlyFreeSessions: { "2099-01": "replacement" } }, future, "release"), null);
  assert.equal(monthlyFreeMutation({ monthlyFreeSessions: { "2099-01": "fixture" } }, { ...future, sessionConfirmation: { clientConfirmedAt: "fixture" } }, "release"), null);
  const update = withMonthlyQuota({ UpdateExpression: "REMOVE bookedSlots[0]", ConditionExpression: "bookedSlots[0] = :slot", ExpressionAttributeValues: { ":slot": future.scheduledAt } }, { monthlyFreeSessions: { "2099-01": "fixture" } }, monthlyFreeMutation({ monthlyFreeSessions: { "2099-01": "fixture" } }, future, "release"));
  assert.match(update.UpdateExpression, /^SET monthlyFreeSessions.* REMOVE bookedSlots/);
  assert.match(update.ConditionExpression, /monthlyFreeSessions = :previousMonthlyFreeSessions/);
});

test("Spotlight room claims are per Sofia quarter; cancellation permits replacement but not resurrecting the old request", () => {
  const now = Date.parse("2099-01-01T12:00:00Z");
  const first = createBenefitRequest({}, { kind: "event_room", note: "Fixture", period: "2099-Q1" }, now);
  assert.equal(first.request.status, "pending");
  assert.throws(() => createBenefitRequest({ spotlightBenefitRequests: first.requests }, { kind: "event_room", period: "2099-Q1" }, now), error => error.statusCode === 409);
  assert.throws(() => createBenefitRequest({}, { kind: "event_room", period: "2099-Q3" }, now), error => error.statusCode === 400);
  const cancelledRequest = updateBenefitRequest({ spotlightBenefitRequests: first.requests }, first.request.requestId, { status: "cancelled" }, now);
  assert.equal(createBenefitRequest({ spotlightBenefitRequests: cancelledRequest.requests }, { kind: "event_room", period: "2099-Q1" }, now).request.status, "pending");
  assert.throws(() => updateBenefitRequest({ spotlightBenefitRequests: cancelledRequest.requests }, first.request.requestId, { status: "scheduled", scheduledAt: "2099-02-01" }, now), error => error.statusCode === 409);
});

test("Spotlight requests prevent duplicate open work and require real scheduling before completion", () => {
  const now = Date.parse("2099-01-01T12:00:00Z");
  const first = createBenefitRequest({}, { kind: "podcast", note: "x".repeat(1000) }, now);
  assert.equal(first.request.note.length, 600);
  assert.throws(() => createBenefitRequest({ spotlightBenefitRequests: first.requests }, { kind: "podcast" }, now), error => error.statusCode === 409);
  assert.throws(() => updateBenefitRequest({ spotlightBenefitRequests: first.requests }, first.request.requestId, { status: "completed" }, now), error => error.statusCode === 409);
  const scheduled = updateBenefitRequest({ spotlightBenefitRequests: first.requests }, first.request.requestId, { status: "scheduled", scheduledAt: "2099-02-01T10:00:00Z", adminNote: "Confirmed arrangement" }, now);
  assert.throws(() => updateBenefitRequest({ spotlightBenefitRequests: scheduled.requests }, first.request.requestId, { status: "completed" }, now), error => error.statusCode === 400);
  const completed = updateBenefitRequest({ spotlightBenefitRequests: scheduled.requests }, first.request.requestId, { status: "completed" }, Date.parse("2099-02-02"));
  assert.ok(completed.request.completedAt);
  assert.throws(() => updateBenefitRequest({ spotlightBenefitRequests: completed.requests }, first.request.requestId, { status: "cancelled" }, Date.parse("2099-02-02")), error => error.statusCode === 409);
  const room = createBenefitRequest({}, { kind: "event_room" }, now);
  assert.throws(() => updateBenefitRequest({ spotlightBenefitRequests: room.requests }, room.request.requestId, { status: "scheduled", scheduledAt: "2099-04-01" }, now), error => error.statusCode === 400);
});

function benefitsStore({ tier = "spotlight", active = true, beforeWrite } = {}) {
  const state = { user: { userId: "consultant", role: "consultant" }, expert: { consultantId: "expert", ownerUserId: "consultant", name: "Fixture expert", slug: "fixture", packageTier: tier, packageSource: active ? "granted" : "none", availability: [], bookedSlots: [] }, writes: 0 };
  const api = loadApi({ send: async command => {
    const input = command.input;
    if (command.constructor.name === "GetCommand") return { Item: copy(input.TableName === "unit-users" ? state.user : state.expert) };
    if (command.constructor.name === "QueryCommand" || command.constructor.name === "ScanCommand") return { Items: [copy(state.expert)] };
    const update = command.constructor.name === "TransactWriteCommand" ? input.TransactItems.map(item => item.Update).find(Boolean) : input;
    if (beforeWrite) { const change = beforeWrite; beforeWrite = null; change(state); }
    if (command.constructor.name === "TransactWriteCommand" && input.TransactItems.some(item => item.ConditionCheck)) {
      const check = input.TransactItems.find(item => item.ConditionCheck).ConditionCheck;
      assert.match(check.ConditionExpression, /attribute_exists\(userId\).*identityDisabled.*restricted.*#benefitRole/);
      if (!state.user || state.user.identityDeleted || state.user.identityDisabled || state.user.restricted || state.user.deletionScheduledAt || state.user.role !== "consultant") throw conditional();
    }
    for (const [alias, field] of Object.entries(update.ExpressionAttributeNames || {}).filter(([alias]) => alias.startsWith("#snapshot"))) {
      const value = alias.replace("#", ":");
      if (value in update.ExpressionAttributeValues ? JSON.stringify(state.expert[field]) !== JSON.stringify(update.ExpressionAttributeValues[value]) : field in state.expert) throw conditional();
    }
    for (const [alias, field] of Object.entries(update.ExpressionAttributeNames || {}).filter(([alias]) => alias.startsWith("#field"))) state.expert[field] = copy(update.ExpressionAttributeValues[alias.replace("#", ":")]);
    state.writes++;
    return { Attributes: copy(state.expert) };
  } }).test;
  return { api, state };
}

test("only an active Spotlight owner can create requests; admin alone may schedule them", async () => {
  for (const options of [{ tier: "start" }, { tier: "grow" }, { active: false }]) {
    const { api, state } = benefitsStore(options);
    assert.equal((await api.createMyBenefitRequest(request({ kind: "campaign" }, "consultant"))).statusCode, 403);
    assert.equal(state.writes, 0);
  }
  const { api, state } = benefitsStore();
  const created = await api.createMyBenefitRequest(request({ kind: "campaign" }, "consultant"));
  assert.equal(created.statusCode, 201);
  const id = JSON.parse(created.body).request.requestId;
  await assert.rejects(api.adminUpdateBenefitRequest(request({ consultantId: "expert", status: "cancelled" }, "consultant"), id), error => error.statusCode === 403);
  assert.equal((await api.adminUpdateBenefitRequest(request({ consultantId: "expert", status: "cancelled" }, "admin"), id)).statusCode, 200);
  assert.equal(state.expert.spotlightBenefitRequests[0].status, "cancelled");
  const summary = JSON.parse((await api.getMyBenefitRequests(request({}, "consultant"))).body);
  assert.equal(summary.benefits.spotlight.eligible, true);
  assert.equal(summary.items.length, 1);
});

test("benefit request CAS rejects concurrent downgrade, deletion and append instead of overwriting them", async () => {
  for (const beforeWrite of [state => { state.expert.packageTier = "start"; }, state => { state.expert.identityDeleted = true; }, state => { state.expert.spotlightBenefitRequests = [{ requestId: "other" }]; }, state => { state.user = null; }, state => { state.user.identityDisabled = true; }, state => { state.user.deletionScheduledAt = "fixture"; }]) {
    const { api, state } = benefitsStore({ beforeWrite });
    await assert.rejects(api.createMyBenefitRequest(request({ kind: "campaign" }, "consultant")), error => error.name === "ConditionalCheckFailedException");
    assert.equal(state.writes, 0);
  }
});

test("profile personalization uses active Spotlight tier rather than obsolete Pro user-plan flag", async () => {
  for (const [options, expected] of [[{}, "mint"], [{ tier: "start" }, ""], [{ tier: "grow" }, ""], [{ active: false }, ""]]) {
    const { api, state } = benefitsStore(options);
    const result = await api.updateMyConsultant(request({ theme: "mint" }, "consultant"));
    assert.equal(result.statusCode, 200);
    assert.equal(state.expert.theme, expected);
  }
});

test("public theme presentation requires active Spotlight while preserving private legacy saved data", () => {
  const api = loadApi().test;
  for (const [patch, expected] of [
    [{ packageTier: "spotlight", packageSource: "granted" }, "mint"],
    [{ packageTier: "spotlight", comped: true }, "mint"],
    [{ packageTier: "start", packageSource: "granted" }, ""],
    [{ packageTier: "grow", comped: true }, ""],
    [{ packageTier: "spotlight" }, ""],
    [{ packageTier: "spotlight", comped: true, restricted: true }, ""],
    [{ packageTier: "spotlight", comped: true, identityDisabled: true }, ""],
    [{ packageTier: "spotlight", comped: true, identityDeleted: true }, ""],
    [{ packageTier: "spotlight", comped: true, deletionScheduledAt: "fixture" }, ""],
    [{ packageTier: "spotlight", comped: true, anonymizedAt: "fixture" }, ""]
  ]) {
    const privateProfile = { consultantId: "expert", ownerUserId: "consultant", name: "Fixture expert", slug: "fixture", plan: "pro", theme: "mint", availability: [], ...patch };
    const snapshot = copy(privateProfile);
    assert.equal(api.stripSensitiveConsultantFields(privateProfile).theme, expected);
    assert.deepEqual(privateProfile, snapshot, "public serialization must not change saved legacy data");
  }
});
