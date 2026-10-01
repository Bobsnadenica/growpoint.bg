"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function fixture(settings = 'dsk_uat_username = "test-operator"\ndsk_uat_password = "test-password"\n') {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "growpoint-evidence-test-"));
  const repo = path.join(base, "repo");
  for (const dir of ["scripts", "backend/api", "infra/terraform"]) fs.mkdirSync(path.join(repo, dir), { recursive: true });
  fs.copyFileSync(path.join(__dirname, "../scripts/dsk-uat-evidence.mjs"), path.join(repo, "scripts/dsk-uat-evidence.mjs"));
  // No bank traffic: the real CLI imports only this local test adapter.
  fs.writeFileSync(path.join(repo, "backend/api/dsk-uat.cjs"), `module.exports = { createDskUatAdapter: () => ({ getStatus: async ({ orderNumber }) => ({ orderNumber, gatewayOrderId: "synthetic-gateway-id", status: "failed", amountMinor: 100, currency: "EUR", bankOrderStatus: 6, actionCode: -2025 }) }) };`);
  fs.writeFileSync(path.join(repo, "infra/terraform/dsk-uat.auto.tfvars"), settings);
  const run = (output, order = "synthetic-case-only") => spawnSync(process.execPath, [path.join(repo, "scripts/dsk-uat-evidence.mjs"), order, output], { cwd: base, encoding: "utf8" });
  return { base, repo, run };
}

test("private evidence is exclusive, owner-only and preserves earlier checks", () => {
  const { base, run } = fixture();
  const output = path.join(base, "private");
  const first = run(output);
  assert.equal(first.status, 0);
  const earlier = fs.readdirSync(output)[0];
  const contents = fs.readFileSync(path.join(output, earlier), "utf8");
  const second = run(output);
  assert.equal(second.status, 0);
  assert.equal(fs.readdirSync(output).length, 2);
  assert.equal(fs.readFileSync(path.join(output, earlier), "utf8"), contents);
  for (const name of fs.readdirSync(output)) assert.equal(fs.statSync(path.join(output, name)).mode & 0o777, 0o600);
  assert.equal(fs.statSync(output).mode & 0o777, 0o700);
  for (const value of ["synthetic-case-only", "synthetic-gateway-id", "test-password", "test-operator"]) assert.equal((first.stdout + first.stderr).includes(value), false);
});

test("an output directory symlink cannot write evidence into the public repo", () => {
  const { base, repo, run } = fixture();
  const link = path.join(base, "outside-link");
  fs.symlinkSync(repo, link, "dir");
  const result = run(path.join(link, "new-evidence"));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /UAT_EVIDENCE_PUBLIC_PATH_REJECTED/);
  assert.equal(fs.existsSync(path.join(repo, "new-evidence")), false);
});

test("a direct public output path is rejected even from a different cwd", () => {
  const { repo, run } = fixture();
  const result = run(path.join(repo, "evidence"));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /UAT_EVIDENCE_PUBLIC_PATH_REJECTED/);
  assert.equal(fs.existsSync(path.join(repo, "evidence")), false);
});

test("malformed private settings cannot leak their value through stderr", () => {
  const marker = "private-parse-marker";
  const { base, run } = fixture(`dsk_uat_username = "test-operator"\ndsk_uat_password = "${marker}\\q"\n`);
  const result = run(path.join(base, "private"));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /UAT_VERIFICATION_FAILED/);
  assert.equal((result.stdout + result.stderr).includes(marker), false);
  assert.equal(result.stderr.includes("SyntaxError"), false);
});

test("existing non-private directories are not silently used or chmodded", () => {
  const { base, run } = fixture();
  const output = path.join(base, "shared");
  fs.mkdirSync(output, { mode: 0o755 });
  fs.chmodSync(output, 0o755);
  const result = run(output);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /UAT_EVIDENCE_DIRECTORY_NOT_PRIVATE/);
  assert.equal(fs.statSync(output).mode & 0o777, 0o755);
  assert.deepEqual(fs.readdirSync(output), []);
});

test("invalid order references cannot traverse the private output directory", () => {
  const { base, run } = fixture();
  const output = path.join(base, "private");
  const result = run(output, "../invalid");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /UAT_EVIDENCE_ARGUMENTS_INVALID/);
  assert.equal(fs.existsSync(output), false);
});
