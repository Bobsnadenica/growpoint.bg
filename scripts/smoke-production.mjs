import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const projectDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const envFiles = [".env", ".env.production", ".env.local"];
const args = new Set(process.argv.slice(2));
if (args.has("--live-mutate")) {
  console.error("--live-mutate is retired: it fabricated paid packages/attendance and hid lifecycle failures. Use npm run qa:identity -- --live-identity --allow-disposable for explicitly gated client-only lifecycle QA. Payment/review tests stay local.");
  process.exit(1);
}
const cloudfront = args.has("--cloudfront");

const state = {
  checks: [],
  runId: Math.random().toString(36).slice(2, 14)
};

export const homepageAdMedia = [
  { path: "/assets/advertisement/1.mp4", mime: "video/mp4" },
  { path: "/assets/advertisement/2.mp4", mime: "video/mp4" },
  { path: "/assets/advertisement/3.jpg", mime: "image/jpeg" },
  { path: "/assets/advertisement/4.jpg", mime: "image/jpeg" }
];
const javascriptMimes = ["text/javascript", "application/javascript", "text/ecmascript", "application/ecmascript"];

export function referencedEntrypointAssets(html, siteUrl) {
  const origin = new URL(siteUrl).origin;
  const assets = new Map();
  for (const tag of String(html).match(/<(?:script|link)\b[^>]*>/gi) || []) {
    const reference = tag.match(/\b(?:src|href)\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!reference) continue;
    const url = new URL(reference, `${siteUrl.replace(/\/+$/, "")}/`);
    if (url.origin !== origin) continue; // External font CSS is not a root bundle.
    const kind = url.pathname.endsWith(".js") ? "js" : url.pathname.endsWith(".css") ? "css" : "";
    if (kind) assets.set(url.href, { url: url.href, kind });
  }
  const result = [...assets.values()];
  if (!result.some(asset => asset.kind === "js") || !result.some(asset => asset.kind === "css")) throw new Error("Homepage did not reference both local JS and CSS assets.");
  return result;
}

export async function verifyAssetHeaders(url, expectedMimes, { fetchImpl = fetch, requireLength = false } = {}) {
  // HEAD only: video bodies are never requested or downloaded.
  const response = await fetchImpl(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(15000) });
  const pathname = new URL(url).pathname;
  if (response.status !== 200) throw new Error(`${pathname}: expected HEAD 200, got ${response.status}.`);
  const mime = String(response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!expectedMimes.includes(mime)) throw new Error(`${pathname}: expected ${expectedMimes.join("/")}, got ${mime || "missing MIME"}; a 200 SPA fallback is not an asset.`);
  if (requireLength) {
    const length = String(response.headers.get("content-length") || "");
    if (!/^[1-9]\d*$/.test(length) || !Number.isSafeInteger(Number(length))) throw new Error(`${pathname}: missing or invalid positive Content-Length.`);
  }
  return mime;
}

export async function verifyEntrypointAssets(siteUrl, { fetchImpl = fetch } = {}) {
  const response = await fetchImpl(`${siteUrl.replace(/\/+$/, "")}/`, { signal: AbortSignal.timeout(15000) });
  if (response.status !== 200 || !String(response.headers.get("content-type") || "").toLowerCase().startsWith("text/html")) {
    await response.body?.cancel();
    throw new Error("Homepage must return HTML 200 before checking its bundle assets.");
  }
  const assets = referencedEntrypointAssets(await response.text(), siteUrl);
  await Promise.all(assets.map(asset => verifyAssetHeaders(asset.url, asset.kind === "js" ? javascriptMimes : ["text/css"], { fetchImpl })));
  return `${assets.filter(asset => asset.kind === "js").length} JS / ${assets.filter(asset => asset.kind === "css").length} CSS headers verified`;
}

function stripEnvQuotes(value) {
  const trimmed = String(value || "").trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

async function readEnvFile(fileName) {
  try {
    const contents = await readFile(path.join(projectDir, fileName), "utf8");
    return contents.split(/\r?\n/).reduce((acc, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) return acc;
      const index = trimmed.indexOf("=");
      const key = trimmed.slice(0, index).trim();
      const value = stripEnvQuotes(trimmed.slice(index + 1));
      if (key) acc[key] = value;
      return acc;
    }, {});
  } catch {
    return {};
  }
}

async function loadEnv() {
  const loaded = {};
  for (const fileName of envFiles) {
    Object.assign(loaded, await readEnvFile(fileName));
  }
  return { ...loaded, ...process.env };
}

async function run(command, commandArgs, options = {}) {
  const { stdout, stderr } = await execFileAsync(command, commandArgs, {
    cwd: projectDir,
    maxBuffer: 1024 * 1024 * 16,
    ...options
  });
  if (options.showStderr && stderr?.trim()) process.stderr.write(stderr);
  return stdout.trim();
}

async function terraformOutputs() {
  try {
    const stdout = await run("terraform", ["-chdir=infra/terraform", "output", "-json"]);
    return JSON.parse(stdout);
  } catch {
    return {};
  }
}

function outputValue(outputs, name, fallback = "") {
  return outputs[name]?.value ?? fallback;
}

async function loadConfig() {
  const env = await loadEnv();
  const outputs = await terraformOutputs();
  const cloudfrontDomain = outputValue(outputs, "frontend_cloudfront_domain_name", "");
  return {
    region: env.VITE_AWS_REGION || outputValue(outputs, "aws_region", "eu-west-1") || "eu-west-1",
    apiBaseUrl: String(outputValue(outputs, "api_base_url", env.VITE_API_BASE_URL || "")).replace(/\/+$/, ""),
    siteUrl: cloudfront && cloudfrontDomain
      ? `https://${cloudfrontDomain}`
      : String(env.GROWPOINT_SITE_URL || "https://www.growpoint.bg").replace(/\/+$/, ""),
  };
}

async function httpJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  return { response, payload, text };
}

async function api(config, pathName, options = {}, token = "") {
  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && options.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const result = await httpJson(`${config.apiBaseUrl}${pathName}`, { ...options, headers });
  if (!result.response.ok) {
    throw new Error(
      `${options.method || "GET"} ${pathName} returned ${result.response.status}: ${result.text.slice(0, 300)}`
    );
  }
  return result.payload;
}

async function check(name, fn) {
  const startedAt = Date.now();
  try {
    const detail = await fn();
    if (detail?.skipped) {
      state.checks.push({ name, ok: true, skipped: true, ms: Date.now() - startedAt, detail: detail.skipped });
      console.log(`SKIP ${name} - ${detail.skipped}`);
      return;
    }
    state.checks.push({ name, ok: true, ms: Date.now() - startedAt, detail: detail || "" });
    console.log(`PASS ${name}${detail ? ` - ${detail}` : ""}`);
  } catch (error) {
    state.checks.push({
      name,
      ok: false,
      ms: Date.now() - startedAt,
      detail: error instanceof Error ? error.message : String(error)
    });
    console.error(`FAIL ${name} - ${error instanceof Error ? error.message : error}`);
  }
}

function requireConfig(config, keys) {
  for (const key of keys) {
    if (!config[key]) throw new Error(`Missing required config: ${key}`);
  }
}

async function publicChecks(config) {
  requireConfig(config, ["apiBaseUrl", "siteUrl"]);

  await check("API health", async () => {
    const payload = await api(config, "/health");
    if (!payload?.ok) throw new Error("Health payload did not include ok=true.");
    return payload.service || "ok";
  });

  let firstConsultantSlug = "";
  await check("Public consultants list", async () => {
    const payload = await api(config, "/consultants");
    const items = Array.isArray(payload) ? payload : payload.items || [];
    if (items.some((item) => item.isExample || String(item.ownerUserId || "").startsWith("example-owner-"))) throw new Error("Example profiles are still publicly visible.");
    firstConsultantSlug = items[0]?.slug || "";
    return `${items.length} profiles`;
  });

  await check("Live consultant profile", async () => {
    if (!firstConsultantSlug) {
      if (args.has("--require-public-profile")) throw new Error("No public expert is available for live profile verification.");
      return { skipped: "empty catalogue; individual public profile not verified" };
    }
    const payload = await api(config, `/consultants/${encodeURIComponent(firstConsultantSlug)}`);
    if (!payload?.consultantId) throw new Error("Profile payload missing consultantId.");
    return "active profile returned";
  });

  const siteRoutes = [
    "/",
    "/users/",
    "/consultants/",
    firstConsultantSlug ? `/consultants/${encodeURIComponent(firstConsultantSlug)}/` : "/consultants/",
    "/auth/",
    "/sitemap.xml",
    "/robots.txt"
  ];

  for (const route of siteRoutes) {
    await check(`Site route ${route}`, async () => {
      const response = await fetch(`${config.siteUrl}${route}`, { redirect: "follow" });
      if (response.status !== 200) throw new Error(`Expected 200, got ${response.status}.`);
      return response.headers.get("content-type") || "200";
    });
  }

  await check("Homepage referenced JS/CSS asset MIME", () => verifyEntrypointAssets(config.siteUrl));
  for (const media of homepageAdMedia) {
    await check(`Homepage media ${media.path}`, async () => {
      await verifyAssetHeaders(`${config.siteUrl}${media.path}`, [media.mime], { requireLength: true });
      return `${media.mime}; positive Content-Length; HEAD only`;
    });
  }

  if (cloudfront) {
    await check("CloudFront SPA fallback for new profile paths", async () => {
      const response = await fetch(`${config.siteUrl}/consultants/smoke-new-profile-${state.runId}/`);
      const text = await response.text();
      if (response.status !== 200) throw new Error(`Expected 200, got ${response.status}.`);
      if (!text.includes('id="root"')) throw new Error("Response did not look like the SPA shell.");
      return "unknown route returned SPA shell";
    });
  }

  const protectedPaths = ["/me/notifications", "/bookings", "/admin/consultants"];
  for (const pathName of protectedPaths) {
    await check(`Protected route rejects anonymous ${pathName}`, async () => {
      const response = await fetch(`${config.apiBaseUrl}${pathName}`);
      if (response.status !== 401) throw new Error(`Expected 401, got ${response.status}.`);
      return "401";
    });
  }

  await check("CORS preflight from production origin", async () => {
    const response = await fetch(`${config.apiBaseUrl}/bookings`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://www.growpoint.bg",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type"
      }
    });
    if (![200, 204].includes(response.status)) throw new Error(`Expected 200/204, got ${response.status}.`);
    return String(response.status);
  });
}


function printSummary() {
  const failed = state.checks.filter((item) => !item.ok);
  const skipped = state.checks.filter((item) => item.skipped);
  console.log("\nProduction smoke summary");
  console.log(`Run id: ${state.runId}`);
  const executed = state.checks.length - skipped.length;
  console.log(`Checks: ${executed - failed.length}/${executed} passed; ${skipped.length} skipped`);
  console.log("Smoke checks alone do not certify authenticated workflows, email delivery, or production readiness.");
  if (failed.length) {
    console.log("Failures:");
    for (const item of failed) {
      console.log(`- ${item.name}: ${item.detail}`);
    }
  }
  return failed.length;
}

async function main() {
  const config = await loadConfig();
  console.log(`Production smoke target: ${config.siteUrl}`);
  console.log(`API target: ${config.apiBaseUrl}`);

  await publicChecks(config);
  console.log("SKIP Authenticated lifecycle - separate explicit npm run qa:identity gates required");

  const failures = printSummary();
  if (failures > 0) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
