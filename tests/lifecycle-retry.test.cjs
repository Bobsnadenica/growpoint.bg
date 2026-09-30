const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createAccountLifecycle } = require("../backend/api/account-lifecycle.cjs");
const sub = "22222222-2222-4222-8222-222222222222";
const env = { usersTable: "users", consultantsTable: "consultants", bookingsTable: "bookings", userPoolId: "unit-pool" };

test("identity synchronization repairs a failed expert write on disable and restore without changing bookings", async () => {
  for (const enabled of [false, true]) {
    const user = { userId: sub, identityDisabled: enabled };
    const consultant = { consultantId: "expert", ownerUserId: sub, identityDisabled: enabled };
    let failExpert = true;
    let bookingQueries = 0;
    const lifecycle = createAccountLifecycle({
      env, getUserBySub: async () => user, listConsultantsByOwner: async () => [consultant],
      scanAllItems: async () => [user], queryAllItems: async () => { bookingQueries++; return []; },
      refundFreePointsIfNeeded: async () => {}, s3: { send: async () => ({}) },
      cognito: { send: async () => ({ Users: [{ Enabled: enabled, Attributes: [{ Name: "sub", Value: sub }] }] }) },
      dynamo: { send: async (command) => {
        if (command.constructor.name === "UpdateCommand") {
          if (command.input.TableName === "consultants" && failExpert) { failExpert = false; throw new Error("temporary write failure"); }
          assert.match(command.input.ConditionExpression, /attribute_exists/);
          const row = command.input.TableName === "users" ? user : consultant;
          row.identityDisabled = command.input.ExpressionAttributeValues[":disabled"];
        }
        return {};
      } }
    });
    await assert.rejects(lifecycle.reconcile({ force: true }), /temporary write failure/);
    assert.equal(user.identityDisabled, !enabled);
    assert.equal(consultant.identityDisabled, enabled);
    assert.equal((await lifecycle.reconcile({ force: true })).updated, 1);
    assert.equal(consultant.identityDisabled, !enabled);
    assert.equal((await lifecycle.reconcile({ force: true })).updated, 0);
    assert.equal(bookingQueries, 0, "Disabling/restoring must preserve existing bookings");
  }
});

test("failed slug-claim deletion keeps enough profile state for account cleanup to retry", async () => {
  const user = { userId: sub };
  let consultant = { consultantId: "expert", ownerUserId: sub, slug: "former-expert" };
  let failClaim = true;
  let claimDeleted = false;
  let userDeleted = false;
  const lifecycle = createAccountLifecycle({
    env, getUserBySub: async () => user, listConsultantsByOwner: async () => [consultant],
    scanAllItems: async () => [user], queryAllItems: async () => [], refundFreePointsIfNeeded: async () => {},
    s3: { send: async () => ({}) },
    cognito: { send: async () => { throw Object.assign(new Error("missing"), { name: "UserNotFoundException" }); } },
    dynamo: { send: async (command) => {
      if (command.constructor.name === "DeleteCommand" && command.input.Key.consultantId === "slug-claim#former-expert") {
        if (failClaim) { failClaim = false; throw new Error("temporary claim failure"); }
        claimDeleted = true;
      }
      if (command.constructor.name === "PutCommand" && command.input.TableName === "consultants") {
        assert.equal(claimDeleted, true, "Claim must be removed before discarding its slug");
        consultant = command.input.Item;
      }
      if (command.constructor.name === "DeleteCommand" && command.input.Key.userId === sub) userDeleted = true;
      return {};
    } }
  });
  await assert.rejects(lifecycle.purgeUserAccount(sub, { alreadyDeleted: true }), /temporary claim failure/);
  assert.equal(consultant.slug, "former-expert");
  assert.equal(userDeleted, false);
  assert.equal((await lifecycle.purgeUserAccount(sub, { alreadyDeleted: true })).deleted, true);
  assert.equal(claimDeleted, true);
  assert.equal(consultant.slug, undefined);
  assert.equal(consultant.identityDeleted, true);
  assert.equal(userDeleted, true);
});
