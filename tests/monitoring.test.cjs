const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createMonitoring, profileCompletion, monitoringSummary } = require("../backend/api/monitoring.cjs");

test("telemetry increments lifetime and UTC daily counters together with no personal data", async () => {
  const transactions = [];
  const monitoring = createMonitoring({ table: "unit-users", dynamo: { send: async (command) => transactions.push(command.input) }, now: () => Date.parse("2026-09-05T12:00:00Z") });
  await monitoring.record("emailAccepted");
  await monitoring.record("arbitrary-field");
  assert.equal(transactions.length, 1);
  assert.deepEqual(transactions[0].TransactItems.map((i) => i.Update.Key.userId), ["system#telemetry", "system#telemetry#2026-09-05"]);
  assert.equal(transactions[0].TransactItems[0].Update.ExpressionAttributeNames["#metric"], "emailAccepted");
});

test("profile completeness uses six client fields and thirteen editable public expert fields", () => {
  const client = { userId: "c", name: "Client", avatarStorageKey: "avatar", city: "City", occupation: "Work", bio: "Bio", goals: "Goal" };
  const mentor = { userId: "m", role: "consultant", name: "Mentor", city: "City", occupation: "Work", age: 40, headline: "Headline", bio: "Bio" };
  const consultant = { ownerUserId: "m", name: "Mentor", city: "City", profileType: "mentor", headline: "Title", bio: "Bio", experienceSummary: "Experience", experienceHighlights: ["One"], educationHighlights: ["School"], specializations: ["Career"], languages: ["bg"], idealFor: ["People"], consultationTopics: ["Career"], workApproach: "Coaching", availability: ["2026-09-07"] };
  assert.equal(profileCompletion(client), 100);
  assert.equal(profileCompletion({ ...client, goals: "  " }), 83);
  assert.equal(profileCompletion(mentor, consultant), 100);
  assert.equal(profileCompletion(mentor, { ...consultant, languages: [] }), 92);
  assert.equal(profileCompletion({ role: "consultant" }, consultant), 100, "hidden private fields must not block experts");
  const summary = monitoringSummary({ users: [client, mentor], consultants: [consultant], bookings: [{ paymentStatus: "paid", createdAt: "2026-09-05T12:00:00Z" }], allUsers: [{ userId: "system#telemetry", startedAt: "2026-09-05", emailAccepted: 4 }], days: ["2026-09-05"] });
  assert.deepEqual(summary.completion, { total: 2, clients: 1, consultants: 0, mentors: 1, incomplete: 0 });
  assert.deepEqual(summary.expertTypes, { consultants: 0, mentors: 1 });
  assert.equal(summary.telemetry.emailAccepted, 4);
  assert.equal(summary.telemetry.emailFailed, 0);
  assert.equal(summary.payments.paid, 1);
  assert.equal(summary.bookingActivity[0].count, 1);
});

test("frontend expert completion matches backend for each missing editable field", () => {
  const { readFileSync } = require("node:fs");
  const ts = require("typescript");
  const vm = require("node:vm");
  const context = { exports: {} };
  const text = readFileSync(require("node:path").join(__dirname, "../src/lib/expert-completion.ts"), "utf8");
  vm.runInNewContext(ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
  const complete = { name: "Name", city: "City", headline: "Title", bio: "Bio", experienceSummary: "Experience", experienceHighlights: ["One"], educationHighlights: ["School"], specializations: ["Career"], languages: ["bg"], idealFor: ["People"], consultationTopics: ["Career"], workApproach: "Coaching", availability: ["2026-09-07"] };
  const frontend = context.exports.expertCompletion;
  assert.equal(frontend(complete), 100);
  for (const field of Object.keys(complete)) {
    const value = { ...complete, [field]: Array.isArray(complete[field]) ? [] : " " };
    assert.equal(frontend(value), 92, field);
    assert.equal(frontend(value), profileCompletion({ role: "consultant" }, value), field);
  }
  assert.equal(frontend(null), 0);
  assert.equal(profileCompletion({ role: "consultant" }, null), 0);
});

test("empty platform reports no tracking start, not fabricated historical activity", () => {
  const summary = monitoringSummary({ users: [], consultants: [], bookings: [], allUsers: [], days: ["2026-09-05"] });
  assert.equal(summary.telemetry.since, null);
  assert.equal(summary.completion.total, 0);
  assert.equal(summary.telemetry.perDay[0].emailAccepted, 0);
});
