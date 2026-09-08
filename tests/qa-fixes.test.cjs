const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const { loadApi } = require("./helpers/api-harness.cjs");
const plain = x => JSON.parse(JSON.stringify(x));

test("public availability excludes occupied overlaps and past slots without leaking reservations", () => {
  const api = loadApi().test;
  const profile = { availability: ["2099-01-01T10:00:00Z", "2099-01-01T10:30:00Z", "2099-01-01T11:00:00Z", "2020-01-01T10:00:00Z"], bookedSlots: ["2099-01-01T10:00:00Z"], sessionLengthMinutes: 60, ownerUserId: "private" };
  const publicProfile = api.stripSensitiveConsultantFields(profile);
  assert.deepEqual(plain(publicProfile.availability), ["2099-01-01T11:00:00Z"]);
  assert.equal(publicProfile.nextAvailable, "2099-01-01T11:00:00Z");
  assert.equal(publicProfile.bookedSlots, undefined);
  assert.equal(publicProfile.ownerUserId, undefined);
  assert.equal(profile.availability.length, 4);
  assert.equal(api.getBookableAvailability({ ...profile, bookedSlots: profile.availability }).length, 0);
});

test("slot snapshot guards distinguish a legacy absent list from an existing empty list", () => {
  const api = loadApi().test;
  assert.equal(api.bookedSlotsSnapshot({}).condition, "attribute_not_exists(bookedSlots)");
  assert.deepEqual(plain(api.bookedSlotsSnapshot({ bookedSlots: [] }).values), { ":previousSlots": [] });
  const source = readFileSync(require.resolve("../backend/api/index.cjs"), "utf8");
  // Every whole reservation-list replacement must compare its snapshot.
  for (const match of source.matchAll(/UpdateExpression: "SET bookedSlots = :slots",([\s\S]{0,400})/g)) {
    assert.match(match[1], /ConditionExpression: .*bookedSlotsSnapshot\(consultant\).condition/);
  }
});

test("ordinary profile reads reconcile Cognito role without overwriting profile fields", async () => {
  const writes = [];
  const user = { userId: "qa", role: "client", name: "Saved", referralCode: "abcdefgh", points: 20 };
  const api = loadApi({ send: async command => {
    if (command.constructor.name === "GetCommand") return { Item: user };
    if (command.constructor.name === "UpdateCommand") writes.push(command.input);
    return {};
  } });
  const result = await api.test.getMeProfile({ requestContext: { authorizer: { jwt: { claims: { sub: "qa", "cognito:groups": ["consultants"] } } } } });
  const profile = JSON.parse(result.body);
  assert.equal(profile.role, "consultant");
  assert.equal(profile.name, "Saved");
  assert.equal(profile.points, 20);
  const roleWrite = writes.find(x => x.UpdateExpression === "SET #role = :role");
  assert.ok(roleWrite);
  assert.match(roleWrite.ConditionExpression, /attribute_exists\(userId\)/);
});

function messagesModule() {
  const code = ts.transpileModule(readFileSync(require.resolve("../src/lib/live-messages.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = { exports: {}, Map };
  vm.runInNewContext(code, context);
  return context.exports;
}

test("chat merges late snapshots without losing or duplicating a sent message", () => {
  const { mergeMessages } = messagesModule();
  const a = { id: "a", createdAt: "2026-01-01", body: "first" };
  const b = { id: "b", createdAt: "2026-01-02", body: "sent" };
  assert.deepEqual(plain(mergeMessages([a, b], [a])), [a, b]);
  assert.deepEqual(plain(mergeMessages([a, b], [b])), [a, b]);
});

test("chat refresh pauses hidden tabs, prevents concurrent reads, backs off and stops", async () => {
  const { startMessageRefresh } = messagesModule();
  let visible = false, reads = 0, fail = false;
  const timers = new Map(); let id = 0;
  const refresh = startMessageRefresh({ visible: () => visible,
    read: async () => { reads++; if (fail) throw new Error("offline"); },
    schedule: (fn, delay) => { timers.set(++id, { fn, delay }); return id; },
    cancel: id => timers.delete(id)
  });
  assert.equal(reads, 0);
  visible = true; await refresh.wake();
  assert.equal(reads, 1); assert.equal([...timers.values()][0].delay, 15000);
  fail = true; await refresh.wake();
  assert.equal([...timers.values()][0].delay, 30000);
  await refresh.wake(); assert.equal([...timers.values()][0].delay, 60000);
  visible = false; await refresh.wake(); assert.equal(timers.size, 0);
  refresh.stop(); visible = true; await refresh.wake(); assert.equal(reads, 3);
});
