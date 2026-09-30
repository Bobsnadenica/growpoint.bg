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
      if (failAssets && args[2] === "dist/assets") throw new Error("asset upload failed");
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
