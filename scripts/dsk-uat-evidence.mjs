// Read-only bank verification. Private order references never go to stdout.
// Usage: node scripts/dsk-uat-evidence.mjs <order-reference> <private-output-dir>
import { readFile, mkdir, realpath, stat, open } from "node:fs/promises";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { createDskUatAdapter } = require("../backend/api/dsk-uat.cjs");
const repo = await realpath(fileURLToPath(new URL("../", import.meta.url)));
const insideRepo = path => path === repo || path.startsWith(repo + "/");
const fail = code => { throw Object.assign(new Error(code), { code }); };

async function privateDirectory(requested) {
  // Resolve existing ancestors before creating anything; symlinks cannot bypass
  // the public-repository boundary even when the final directory does not exist.
  let ancestor = resolve(requested);
  const missing = [];
  for (;;) {
    try { ancestor = await realpath(ancestor); break; }
    catch (error) {
      if (error.code !== "ENOENT") throw error;
      missing.unshift(basename(ancestor));
      ancestor = dirname(ancestor);
    }
  }
  const candidate = resolve(ancestor, ...missing);
  if (insideRepo(candidate)) fail("UAT_EVIDENCE_PUBLIC_PATH_REJECTED");
  await mkdir(candidate, { recursive: true, mode: 0o700 });
  const target = await realpath(candidate);
  if (insideRepo(target)) fail("UAT_EVIDENCE_PUBLIC_PATH_REJECTED");
  if ((await stat(target)).mode & 0o077) fail("UAT_EVIDENCE_DIRECTORY_NOT_PRIVATE");
  return target;
}

try {
  const [orderNumber, outputDirectory] = process.argv.slice(2);
  if (!/^[A-Za-z0-9_-]{1,36}$/.test(orderNumber || "") || !outputDirectory) fail("UAT_EVIDENCE_ARGUMENTS_INVALID");
  const target = await privateDirectory(outputDirectory);
  const settings = await readFile(resolve(repo, "infra/terraform/dsk-uat.auto.tfvars"), "utf8");
  const field = key => JSON.parse(settings.match(new RegExp(`^${key}\\s*=\\s*(\".*\")\\s*$`, "m"))?.[1] || "null");
  const adapter = createDskUatAdapter({ userName: field("dsk_uat_username"), password: field("dsk_uat_password") });
  const result = await adapter.getStatus({ orderNumber });
  const checkedAt = new Date().toISOString();
  const filename = `${orderNumber}-${checkedAt.replace(/[:.]/g, "-")}-${randomUUID()}.json`;
  // Exclusive creation refuses existing files/symlinks and preserves prior proof.
  const evidence = await open(resolve(target, filename), "wx", 0o600);
  try { await evidence.writeFile(JSON.stringify({ checkedAt, ...result }, null, 2)); }
  finally { await evidence.close(); }
  console.log(JSON.stringify({ status: result.status, amountMinor: result.amountMinor, currency: result.currency, bankOrderStatus: result.bankOrderStatus, actionCode: result.actionCode, privateEvidenceSaved: true }));
} catch (error) {
  const code = /^(?:DSK_UAT_[A-Z_]+|UAT_EVIDENCE_[A-Z_]+|E[A-Z]+)$/.test(error.code || "") ? error.code : "UAT_VERIFICATION_FAILED";
  const gatewayCode = Number.isSafeInteger(error.gatewayCode) ? error.gatewayCode : undefined;
  console.error(JSON.stringify({ code, gatewayCode }));
  process.exitCode = 1;
}
