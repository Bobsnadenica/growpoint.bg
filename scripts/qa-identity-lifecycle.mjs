// Explicit disposable-client QA only. Never changes supplied accounts, paid
// state, bookings, attendance or application data directly. No idle services.
import { randomBytes, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import path from "node:path";

const require = createRequire(new URL("../backend/api/package.json", import.meta.url));
const cognitoSdk = require("@aws-sdk/client-cognito-identity-provider");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand } = require("@aws-sdk/lib-dynamodb");
const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const uuid = value => /^[a-f0-9-]{36}$/i.test(String(value || ""));
const failure = message => Object.assign(new Error(message), { publicMessage: message });

export function executionMode(args) {
  const flags = new Set(args);
  for (const flag of flags) if (!["--live-identity", "--allow-disposable", "--help"].includes(flag)) throw failure("Unknown QA option; use --help.");
  if (flags.has("--help") || flags.size === 0) return "read-only";
  if (!flags.has("--live-identity") || !flags.has("--allow-disposable")) throw failure("Both --live-identity and --allow-disposable are required. No writes performed.");
  return "live";
}

export function isOwnIdentity(record, expected) {
  const attributes = Object.fromEntries((record?.UserAttributes || record?.Attributes || []).map(item => [item.Name, item.Value]));
  return record?.Username === expected.username && attributes.email === expected.email && attributes.name === expected.marker &&
    expected.email.endsWith("@example.invalid") && expected.marker.startsWith("GrowPoint disposable identity QA ") &&
    uuid(attributes.sub) && (!expected.sub || attributes.sub === expected.sub);
}

async function loadConfig() {
  const environment = {};
  for (const name of [".env", ".env.production", ".env.local"]) {
    let content = "";
    try { content = await readFile(path.join(projectDir, name), "utf8"); } catch {}
    for (const line of content.split(/\r?\n/)) {
      const match = line.trim().match(/^([A-Z0-9_]+)=(.*)$/);
      if (match) environment[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
    }
  }
  Object.assign(environment, process.env);
  let outputs = {};
  try {
    const result = await promisify(execFile)("terraform", ["-chdir=infra/terraform", "output", "-json"], { cwd: projectDir, maxBuffer: 1024 * 1024 });
    outputs = JSON.parse(result.stdout);
  } catch {}
  const value = (key, fallback) => outputs[key]?.value || fallback;
  return {
    region: environment.VITE_AWS_REGION || "eu-west-1",
    apiBaseUrl: String(value("api_base_url", environment.VITE_API_BASE_URL || "")).replace(/\/+$/, ""),
    userPoolId: value("cognito_user_pool_id", environment.VITE_COGNITO_USER_POOL_ID),
    userPoolClientId: value("cognito_user_pool_client_id", environment.VITE_COGNITO_USER_POOL_CLIENT_ID),
    usersTable: value("users_table_name", environment.GROWPOINT_QA_USERS_TABLE),
    pollSeconds: Number(environment.GROWPOINT_QA_POLL_SECONDS || 15),
    timeoutSeconds: Number(environment.GROWPOINT_QA_TIMEOUT_SECONDS || 600)
  };
}

export async function runIdentityLifecycle({ config, clients, fetchImpl = fetch, sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)), now = Date.now, log = console.log }) {
  for (const field of ["apiBaseUrl", "userPoolId", "userPoolClientId", "usersTable"]) if (!config[field]) throw failure(`Missing QA configuration: ${field}. No account created.`);
  if (!config.apiBaseUrl.startsWith("https://") || !config.usersTable.startsWith("growpoint-")) throw failure("Refusing unexpected QA target. No account created.");
  if (!Number.isInteger(config.pollSeconds) || config.pollSeconds < 5 || config.pollSeconds > 60 || !Number.isInteger(config.timeoutSeconds) || config.timeoutSeconds < 30 || config.timeoutSeconds > 900) throw failure("Polling must be 5–60 seconds; timeout 30–900 seconds. No account created.");
  const { cognito, dynamo } = clients;
  const sendCognito = (name, input) => cognito.send(new cognitoSdk[name](input));
  const pool = await sendCognito("DescribeUserPoolCommand", { UserPoolId: config.userPoolId });
  if (!pool.UserPool?.Name?.startsWith("growpoint-")) throw failure("Refusing non-GrowPoint user pool. No account created.");
  const app = await sendCognito("DescribeUserPoolClientCommand", { UserPoolId: config.userPoolId, ClientId: config.userPoolClientId });
  if (app.UserPoolClient?.UserPoolId !== config.userPoolId || app.UserPoolClient?.ClientSecret || !app.UserPoolClient?.ExplicitAuthFlows?.includes("ALLOW_USER_PASSWORD_AUTH")) throw failure("Unexpected QA app client. No account created.");
  const api = async (route, token = "", options = {}) => {
    let response;
    try { response = await fetchImpl(`${config.apiBaseUrl}${route}`, { ...options, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, signal: AbortSignal.timeout(15000) }); }
    catch { throw failure("QA API request failed; private request details suppressed."); }
    let payload;
    try { payload = await response.json(); } catch { payload = null; }
    return { status: response.status, payload };
  };
  const health = await api("/health");
  if (health.status !== 200 || health.payload?.service !== "growpoint-api") throw failure("Unexpected API health. No account created.");
  const runId = randomUUID();
  const owned = { username: `qa-identity-${runId}@example.invalid`, email: `qa-identity-${runId}@example.invalid`, marker: `GrowPoint disposable identity QA ${runId}`, sub: "" };
  let password = `Aa9!${randomBytes(24).toString("base64url")}`, token = "", referralCode = "", mayExist = false, deleted = false;
  const results = [];
  const report = (name, status) => { results.push({ name, status }); log(`${status.toUpperCase()} ${name}`); };
  const requireStatus = (result, status, name) => { if (result.status !== status) throw failure(`${name}: expected HTTP ${status}, received ${result.status}.`); };
  const getOwned = async () => {
    const record = await sendCognito("AdminGetUserCommand", { UserPoolId: config.userPoolId, Username: owned.username });
    if (!isOwnIdentity(record, owned)) throw failure("Ownership verification failed; identity changes refused.");
    owned.sub = record.UserAttributes.find(item => item.Name === "sub").Value;
    return record;
  };
  const login = async () => {
    const result = await sendCognito("InitiateAuthCommand", { ClientId: config.userPoolClientId, AuthFlow: "USER_PASSWORD_AUTH", AuthParameters: { USERNAME: owned.username, PASSWORD: password } });
    const nextToken = result.AuthenticationResult?.IdToken;
    if (!nextToken) throw failure("Disposable login did not issue a token.");
    const claims = JSON.parse(Buffer.from(nextToken.split(".")[1], "base64url").toString("utf8"));
    if (claims.sub !== owned.sub) throw failure("Unexpected login identity; aborting.");
    return nextToken;
  };
  const getRow = key => dynamo.send(new GetCommand({ TableName: config.usersTable, Key: { userId: key }, ConsistentRead: true })).then(result => result.Item);
  const observe = async (name, predicate) => {
    const deadline = now() + config.timeoutSeconds * 1000;
    let nextProgress = now() + 60000;
    while (true) {
      if (await predicate()) { report(name, "passed"); return true; }
      if (now() >= deadline) { report(`${name} (bounded observation timed out; event lag or cleanup failure)`, "inconclusive"); return false; }
      if (now() >= nextProgress) { log(`WAIT ${name}; no manual application-data repair`); nextProgress = now() + 60000; }
      await sleep(config.pollSeconds * 1000);
    }
  };
  const deleteOwned = async () => {
    try { await getOwned(); }
    catch (error) { if (error.name === "UserNotFoundException") { deleted = true; return; } throw error; }
    // Capture the exact own referral key even if an earlier HTTP/read failed.
    const current = await getRow(owned.sub);
    referralCode = referralCode || current?.referralCode || "";
    await sendCognito("AdminDeleteUserCommand", { UserPoolId: config.userPoolId, Username: owned.username });
    deleted = true;
  };
  const observeCleanup = () => observe("Automatic DynamoDB identity/referral cleanup", async () => {
    const user = await getRow(owned.sub);
    const referral = referralCode ? await getRow(`referral#${referralCode}`) : null;
    return !user && !referral;
  });
  try {
    mayExist = true; // Recover only our exact marker after an ambiguous create.
    await sendCognito("AdminCreateUserCommand", { UserPoolId: config.userPoolId, Username: owned.username, MessageAction: "SUPPRESS", TemporaryPassword: password, UserAttributes: [{ Name: "email", Value: owned.email }, { Name: "name", Value: owned.marker }] });
    await getOwned();
    await sendCognito("AdminSetUserPasswordCommand", { UserPoolId: config.userPoolId, Username: owned.username, Password: password, Permanent: true });
    token = await login();
    requireStatus(await api("/me/profile", token), 404, "Fresh unbootstrapped identity");
    requireStatus(await api("/auth/bootstrap", token, { method: "POST", body: "{}" }), 200, "Fresh bootstrap");
    const profile = await api("/me/profile", token);
    requireStatus(profile, 200, "Saved client profile");
    if (profile.payload?.userId !== owned.sub || profile.payload?.role !== "client" || profile.payload?.points !== 0) throw failure("Disposable bootstrap unexpectedly granted a role or reward.");
    const row = await getRow(owned.sub);
    if (row?.userId !== owned.sub || row?.role !== "client") throw failure("Bootstrap did not persist the exact client row.");
    referralCode = row.referralCode || "";
    requireStatus(await api("/consultants/me", token), 404, "No expert profile or membership");
    report("Suppressed-mail client login/bootstrap/DynamoDB persistence", "passed");

    await getOwned();
    await sendCognito("AdminDisableUserCommand", { UserPoolId: config.userPoolId, Username: owned.username });
    const disabled = await api("/me/profile", token);
    requireStatus(disabled, 401, "Disabled old token");
    if (disabled.payload?.code !== "ACCOUNT_UNAVAILABLE") throw failure("Disabled identity did not return the expected account-unavailable code.");
    let rejectedLogin = false;
    try { await login(); } catch (error) { if (error.name === "NotAuthorizedException") rejectedLogin = true; else throw error; }
    if (!rejectedLogin) throw failure("Disabled identity could obtain a fresh login.");
    report("Disabled identity rejects fresh login and old token", "passed");
    await observe("Automatic DynamoDB disable synchronization", async () => (await getRow(owned.sub))?.identityDisabled === true);
    requireStatus(await api(`/public/users/${owned.sub}`), 404, "Disabled public profile");

    await getOwned();
    await sendCognito("AdminEnableUserCommand", { UserPoolId: config.userPoolId, Username: owned.username });
    token = await login();
    requireStatus(await api("/me/profile", token), 200, "Re-enabled login");
    const enableSynced = await observe("Automatic DynamoDB enable synchronization", async () => { const current = await getRow(owned.sub); return Boolean(current) && current.identityDisabled === false; });
    if (enableSynced) {
      requireStatus(await api("/auth/bootstrap", token, { method: "POST", body: "{}" }), 200, "Re-enabled bootstrap");
      report("Re-enabled fresh login/profile/bootstrap", "passed");
    } else report("Re-enabled bootstrap (not attempted while synchronized access state is stale)", "inconclusive");

    await deleteOwned();
    const removed = await api("/me/profile", token);
    requireStatus(removed, 401, "Deleted old token");
    if (removed.payload?.code !== "ACCOUNT_UNAVAILABLE") throw failure("Deleted identity did not return the expected account-unavailable code.");
    report("Deleted identity rejects old token", "passed");
    await observeCleanup();
    requireStatus(await api(`/public/users/${owned.sub}`), 404, "Deleted public profile");
    report("Deleted public profile unavailable", "passed");
  } finally {
    if (mayExist && !deleted) {
      await deleteOwned();
      if (owned.sub) await observeCleanup();
    }
    password = ""; token = "";
  }
  return { results, inconclusive: results.some(result => result.status === "inconclusive") };
}

async function main() {
  if (executionMode(process.argv.slice(2)) !== "live") {
    console.log("READ-ONLY: no AWS requests or changes. To authorize ONE suppressed-mail disposable client lifecycle: npm run qa:identity -- --live-identity --allow-disposable");
    console.log("Uses current local Terraform target and AWS credentials. Polls exact own rows every 15s, up to 10min per transition; timeout = inconclusive. Never deletes/repairs DynamoDB or tests paid states. Does not prove expert-booking/file cleanup or recipient email delivery.");
    return;
  }
  const config = await loadConfig();
  const clients = { cognito: new cognitoSdk.CognitoIdentityProviderClient({ region: config.region }), dynamo: DynamoDBDocumentClient.from(new DynamoDBClient({ region: config.region })) };
  console.log("AUTHORIZED disposable client-only QA; credentials and private identifiers suppressed.");
  const result = await runIdentityLifecycle({ config, clients });
  console.log(`Identity lifecycle: ${result.results.filter(item => item.status === "passed").length} passed; ${result.results.filter(item => item.status === "inconclusive").length} inconclusive.`);
  if (result.inconclusive) process.exitCode = 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => {
  console.error(`FAIL ${error.publicMessage || `Identity QA stopped (${error.name || "Error"}); private details suppressed.`}`);
  process.exitCode = 1;
});
