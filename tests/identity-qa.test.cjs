const { test } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const project = path.resolve(__dirname, "..");
const modulePromise = import("../scripts/qa-identity-lifecycle.mjs");
const sub = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

test("identity QA defaults to zero-request read-only and requires both explicit gates", async () => {
  const { executionMode } = await modulePromise;
  assert.equal(executionMode([]), "read-only");
  assert.equal(executionMode(["--help"]), "read-only");
  assert.throws(() => executionMode(["--live-identity"]), /Both/);
  assert.throws(() => executionMode(["--allow-disposable"]), /Both/);
  assert.throws(() => executionMode(["--live-identity", "--allow-disposable", "--username=user@example.invalid"]), /Unknown/);
  assert.equal(executionMode(["--live-identity", "--allow-disposable"]), "live");
  const output = execFileSync(process.execPath, ["scripts/qa-identity-lifecycle.mjs"], { cwd: project, encoding: "utf8", env: { PATH: "", AWS_ACCESS_KEY_ID: "invalid", AWS_SECRET_ACCESS_KEY: "invalid" } });
  assert.match(output, /READ-ONLY: no AWS requests or changes/);
});

test("retired unsafe smoke rejects mutation before configuration or AWS execution", () => {
  assert.throws(() => execFileSync(process.execPath, ["scripts/smoke-production.mjs", "--live-mutate"], { cwd: project, encoding: "utf8", env: { PATH: "" }, stdio: "pipe" }), error => error.status === 1 && /--live-mutate is retired/.test(error.stderr));
});

test("identity ownership requires every synthetic marker, username, email and sub", async () => {
  const { isOwnIdentity } = await modulePromise;
  const expected = { username: "qa@example.invalid", email: "qa@example.invalid", marker: "GrowPoint disposable identity QA unique", sub };
  const record = { Username: expected.username, UserAttributes: [{ Name: "sub", Value: sub }, { Name: "email", Value: expected.email }, { Name: "name", Value: expected.marker }] };
  assert.equal(isOwnIdentity(record, expected), true);
  for (const field of ["username", "email", "marker", "sub"]) assert.equal(isOwnIdentity(record, { ...expected, [field]: "wrong" }), false);
  assert.equal(isOwnIdentity(record, { ...expected, email: "real@example.com" }), false);
  const canonical = { ...record, Username: sub };
  assert.equal(isOwnIdentity(canonical, expected), true);
  assert.equal(isOwnIdentity({ ...canonical, Username: "11111111-2222-4333-8444-555555555555" }, expected), false);
  assert.equal(isOwnIdentity(canonical, { ...expected, username: "different-alias@example.invalid" }), false);
});

function simulated({ lag = false, wrongMarker = false, canonicalUsername = false } = {}) {
  let clock = 0, identity, row, referral, deleted = false, bootstrap = false;
  const commands = [], output = [];
  const config = { apiBaseUrl: "https://api.example.invalid", userPoolId: "pool", userPoolClientId: "app", usersTable: "growpoint-unit-users", pollSeconds: 5, timeoutSeconds: 30 };
  const token = () => `unit.${Buffer.from(JSON.stringify({ sub })).toString("base64url")}.unit`;
  const cognito = { send: async command => {
    const name = command.constructor.name, input = command.input;
    commands.push({ service: "cognito", name, input });
    if (name === "DescribeUserPoolCommand") return { UserPool: { Name: "growpoint-unit-users" } };
    if (name === "DescribeUserPoolClientCommand") return { UserPoolClient: { UserPoolId: "pool", ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH"] } };
    if (name === "AdminCreateUserCommand") {
      assert.equal(input.MessageAction, "SUPPRESS");
      assert.match(input.Username, /^qa-identity-.*@example\.invalid$/);
      identity = { Username: canonicalUsername ? sub : input.Username, Enabled: true, UserAttributes: [...input.UserAttributes, { Name: "sub", Value: sub }] };
      return { User: identity };
    }
    if (name === "AdminGetUserCommand") {
      if (!identity) throw Object.assign(new Error("missing"), { name: "UserNotFoundException" });
      return wrongMarker ? { ...identity, UserAttributes: identity.UserAttributes.map(attribute => attribute.Name === "name" ? { ...attribute, Value: "somebody else" } : attribute) } : identity;
    }
    if (name === "AdminSetUserPasswordCommand") return {};
    if (name === "InitiateAuthCommand") {
      if (!identity.Enabled) throw Object.assign(new Error("disabled"), { name: "NotAuthorizedException" });
      return { AuthenticationResult: { IdToken: token() } };
    }
    if (name === "AdminDisableUserCommand") { identity.Enabled = false; row.identityDisabled = true; return {}; }
    if (name === "AdminEnableUserCommand") { identity.Enabled = true; row.identityDisabled = false; return {}; }
    if (name === "AdminDeleteUserCommand") {
      identity = null; deleted = true;
      // Simulate event consumers, NOT script writes. Lag remains inconclusive.
      if (!lag) { row = null; referral = null; }
      return {};
    }
    throw new Error(`Unexpected mock command ${name}`);
  } };
  const dynamo = { send: async command => {
    commands.push({ service: "dynamo", name: command.constructor.name, input: command.input });
    assert.equal(command.constructor.name, "GetCommand");
    assert.equal(command.input.ConsistentRead, true);
    return { Item: command.input.Key.userId.startsWith("referral#") ? referral : row };
  } };
  const fetchImpl = async (url, options) => {
    const route = new URL(url).pathname;
    let status = 200, payload = {};
    if (route === "/health") payload = { service: "growpoint-api" };
    else if (route.startsWith("/public/users/")) status = 404;
    else if (!identity || !identity.Enabled) { status = 401; payload = { code: "ACCOUNT_UNAVAILABLE" }; }
    else if (route === "/auth/bootstrap") {
      bootstrap = true;
      row = { userId: sub, role: "client", points: 0, referralCode: "unit-referral", identityDisabled: row?.identityDisabled ?? false };
      referral = { userId: "referral#unit-referral", ownerUserId: sub };
    } else if (route === "/consultants/me" || !bootstrap) status = 404;
    else if (route === "/me/profile") payload = row;
    else throw new Error("Unexpected mock API route");
    return { status, json: async () => payload };
  };
  return { options: { config, clients: { cognito, dynamo }, fetchImpl, sleep: async duration => { clock += duration; }, now: () => clock, log: text => output.push(text) }, commands, output, deleted: () => deleted };
}

test("disposable lifecycle exercises old-token disable/enable/delete and only reads exact application rows", async () => {
  const { runIdentityLifecycle } = await modulePromise;
  const mock = simulated();
  const result = await runIdentityLifecycle(mock.options);
  assert.equal(result.inconclusive, false);
  assert.equal(mock.deleted(), true);
  assert.equal(result.results.length, 8);
  assert.ok(mock.commands.some(command => command.name === "AdminDisableUserCommand"));
  assert.ok(mock.commands.some(command => command.name === "AdminEnableUserCommand"));
  assert.equal(mock.commands.filter(command => command.name === "AdminDeleteUserCommand").length, 1);
  assert.ok(mock.commands.filter(command => command.service === "dynamo").every(command => command.name === "GetCommand"));
  assert.ok(mock.output.every(line => !line.includes(sub) && !line.includes("@example.invalid") && !line.includes("Bearer")));
});

test("lifecycle lag is inconclusive without manual cleanup; mismatched identity cannot be deleted", async () => {
  const { runIdentityLifecycle } = await modulePromise;
  const delayed = simulated({ lag: true });
  assert.equal((await runIdentityLifecycle(delayed.options)).inconclusive, true);
  assert.ok(delayed.output.some(line => line.startsWith("INCONCLUSIVE Automatic DynamoDB identity/referral cleanup")));
  assert.ok(delayed.commands.filter(command => command.service === "dynamo").every(command => command.name === "GetCommand"));
  const unrelated = simulated({ wrongMarker: true });
  await assert.rejects(runIdentityLifecycle(unrelated.options), /Ownership verification failed/);
  assert.ok(!unrelated.commands.some(command => ["AdminDisableUserCommand", "AdminEnableUserCommand", "AdminDeleteUserCommand"].includes(command.name)));
});

test("email-username pool binds its exact generated subject before further identity mutations", async () => {
  const { runIdentityLifecycle } = await modulePromise;
  const mock = simulated({ canonicalUsername: true });
  const result = await runIdentityLifecycle(mock.options);
  assert.equal(result.inconclusive, false);
  assert.equal(mock.deleted(), true);
  assert.ok(mock.commands.filter(command => ["AdminSetUserPasswordCommand", "AdminDisableUserCommand", "AdminEnableUserCommand", "AdminDeleteUserCommand"].includes(command.name)).every(command => command.input.Username === sub));
  assert.ok(mock.output.every(line => !line.includes(sub) && !line.includes("@example.invalid")));
});
