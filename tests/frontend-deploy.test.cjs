const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");

const source = readFileSync("scripts/deploy-frontend-cloudfront.mjs", "utf8");
const mainSource = source.slice(source.indexOf("async function main()"), source.indexOf("\nmain().catch"));

async function deploy(failAssets = false) {
  const commands = [];
  const main = vm.runInNewContext(`${mainSource}\nmain`, {
    console: { log() {} },
    terraformOutput: async (name) => ({
      frontend_bucket_name: "qa-public-bucket",
      frontend_cloudfront_distribution_id: "qa-distribution",
      frontend_cloudfront_domain_name: "qa.cloudfront.net"
    })[name],
    run: async (command, args) => {
      commands.push({ command, args: [...args] });
      if (failAssets && args[2] === "dist/assets" && (failAssets === true || args[1] === failAssets)) {
        throw new Error("asset upload failed");
      }
      return "";
    }
  });
  return { commands, completion: main() };
}

test("CloudFront deploy uploads hashed assets before publishing HTML and retains older chunks", async () => {
  const { commands, completion } = await deploy();
  await completion;
  const syncs = commands.filter(({ args }) => args[0] === "s3" && args[1] === "sync");
  assert.equal(syncs[0].args[2], "dist/assets");
  assert.equal(syncs[0].args.includes("--delete"), false);
  assert.equal(syncs[1].args[2], "dist");
  assert.equal(syncs[1].args.includes("--delete"), true);
  assert.equal(syncs[1].args[syncs[1].args.indexOf("--exclude") + 1], "assets/*");
});

test("CloudFront deploy invalidates all routes with one wildcard path", async () => {
  const { commands, completion } = await deploy();
  await completion;
  const invalidation = commands.find(({ args }) => args[1] === "create-invalidation");
  assert.deepEqual(invalidation.args.slice(invalidation.args.indexOf("--paths") + 1), ["/*"]);
});

test("Failed asset publication prevents HTML publication", async () => {
  const { commands, completion } = await deploy(true);
  await assert.rejects(completion, /asset upload failed/);
  assert.equal(commands.some(({ args }) => args[1] === "sync" && args[2] === "dist"), false);
});

test("Only Vite-hashed JS/CSS are immutable; stable assets receive revalidating metadata", async () => {
  const { commands, completion } = await deploy();
  await completion;
  const assets = commands.filter(({ args }) => args[0] === "s3" && args[2] === "dist/assets");
  assert.equal(assets.length, 2);
  assert.deepEqual(assets[0].args.slice(4), [
    "--exclude", "*", "--include", "*-????????.js", "--include", "*-????????.css",
    "--cache-control", "public, max-age=31536000, immutable"
  ]);
  assert.deepEqual(assets[1].args.slice(1), [
    "cp", "dist/assets", "s3://qa-public-bucket/assets", "--recursive",
    "--exclude", "*-????????.js", "--exclude", "*-????????.css",
    "--cache-control", "public, max-age=300, must-revalidate"
  ]);
  assert.equal(assets[1].args.includes("--delete"), false);
  assert.ok(commands.indexOf(assets[1]) < commands.findIndex(({ args }) => args[1] === "sync" && args[2] === "dist"));
});

test("Failed stable-asset publication also prevents HTML publication", async () => {
  const { commands, completion } = await deploy("cp");
  await assert.rejects(completion, /asset upload failed/);
  assert.equal(commands.some(({ args }) => args[1] === "sync" && args[2] === "dist"), false);
});

test("CloudFront build copies existing owner creatives without changing the root source", async () => {
  const buildSource = readFileSync("scripts/site-build.mjs", "utf8");
  const start = buildSource.indexOf("async function runCloudfrontBuild()");
  const end = buildSource.indexOf("\nconst mode =", start);
  for (const hasCreatives of [true, false]) {
    const copied = [];
    const calls = [];
    const build = vm.runInNewContext(`${buildSource.slice(start, end)}\nrunCloudfrontBuild`, {
      process: { chdir() {} }, projectDir: "/qa", distDir: "/qa/dist", distAssetsDir: "/qa/dist/assets",
      rootAdvertisementDir: "/qa/assets/advertisement", path: require("node:path"),
      viteBuild: async () => calls.push("build"), existsSync: () => hasCreatives,
      cp: async (from, to, options) => { copied.push({ from, to, recursive: options.recursive }); calls.push("copy"); },
      loadEffectiveSeoData: async () => { calls.push("seo"); return {}; },
      readFile: async () => "<html></html>", writeSeoFiles: async () => {}
    });
    await build();
    assert.deepEqual(copied, hasCreatives ? [{
      from: "/qa/assets/advertisement", to: "/qa/dist/assets/advertisement", recursive: true
    }] : []);
    assert.deepEqual(calls, hasCreatives ? ["build", "copy", "seo"] : ["build", "seo"]);
  }
});
