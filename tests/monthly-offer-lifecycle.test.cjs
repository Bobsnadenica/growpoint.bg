const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createAccountLifecycle } = require("../backend/api/account-lifecycle.cjs");
const copy = value => JSON.parse(JSON.stringify(value));
const sub = "33333333-3333-4333-8333-333333333333";

test("client identity cleanup releases only its upcoming monthly offer and slot, retaining concurrent unrelated claims", async () => {
  const booking = { bookingId: "fixture", consultantId: "expert", clientId: sub, scheduledAt: "2099-01-03T10:00:00.000Z", status: "pending", freeSessionSource: "monthly_offer", freeSessionMonth: "2099-01", freeViaPoints: false };
  const expert = { consultantId: "expert", bookedSlots: [booking.scheduledAt, "2099-02-04T10:00:00.000Z"], monthlyFreeSessions: { "2099-01": booking.bookingId, "2099-02": "unrelated" } };
  let failFirst = true, userDeleted = false, releases = 0;
  const lifecycle = createAccountLifecycle({
    env: { usersTable: "users", consultantsTable: "consultants", bookingsTable: "bookings", userPoolId: "unit-pool" },
    getUserBySub: async () => ({ userId: sub }), listConsultantsByOwner: async () => [], scanAllItems: async () => [],
    queryAllItems: async () => [booking], refundFreePointsIfNeeded: async () => { throw new Error("monthly offer must never refund points"); },
    s3: { send: async () => { throw new Error("fixture has no files"); } },
    cognito: { send: async () => { throw Object.assign(new Error("deleted fixture"), { name: "UserNotFoundException" }); } },
    dynamo: { send: async command => {
      const input = command.input;
      if (command.constructor.name === "GetCommand" && input.TableName === "consultants") return { Item: copy(expert) };
      if (command.constructor.name === "UpdateCommand" && input.TableName === "consultants") {
        assert.match(input.ConditionExpression, /bookedSlots\[0\] = :slot AND monthlyFreeSessions = :previousMonthlyFreeSessions/);
        assert.match(input.UpdateExpression, /SET monthlyFreeSessions.*REMOVE bookedSlots\[0\]/);
        if (failFirst) {
          failFirst = false;
          expert.monthlyFreeSessions["2099-03"] = "new-concurrent-claim";
          throw Object.assign(new Error("concurrent quota"), { name: "ConditionalCheckFailedException" });
        }
        assert.deepEqual(input.ExpressionAttributeValues[":previousMonthlyFreeSessions"], expert.monthlyFreeSessions);
        expert.monthlyFreeSessions = copy(input.ExpressionAttributeValues[":monthlyFreeSessions"]);
        expert.bookedSlots.shift();
        releases++;
      }
      if (command.constructor.name === "DeleteCommand" && input.Key.userId === sub) {
        assert.equal(releases, 1, "cleanup must release quota before deleting identity record");
        userDeleted = true;
      }
      return {};
    } }
  });
  assert.equal((await lifecycle.purgeUserAccount(sub, { alreadyDeleted: true })).deleted, true);
  assert.deepEqual(expert.monthlyFreeSessions, { "2099-02": "unrelated", "2099-03": "new-concurrent-claim" });
  assert.deepEqual(expert.bookedSlots, ["2099-02-04T10:00:00.000Z"]);
  assert.equal(userDeleted, true);
});
