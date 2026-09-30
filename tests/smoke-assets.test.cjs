const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const script = import("../scripts/smoke-production.mjs");
const site = "https://site.example.invalid";
const html = `<script type="module" src="/assets/index-unit.js"></script><link href="/assets/vendor-unit.js" rel="modulepreload"><link rel="stylesheet" href="/assets/index-unit.css"><link rel="stylesheet" href="https://fonts.example.invalid/font.css">`;
const response = (type, length, status = 200) => ({ status, headers: new Headers({ "content-type": type, ...(length === undefined ? {} : { "content-length": length }) }) });

test("smoke verifies referenced root JS/preload/CSS MIME, excluding external font CSS", async () => {
  const { verifyEntrypointAssets } = await script;
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, method: options.method || "GET" });
    if (url === `${site}/`) return { ...response("text/html; charset=utf-8"), text: async () => html };
    assert.equal(options.method, "HEAD");
    return response(url.endsWith(".css") ? "text/css; charset=utf-8" : "text/javascript", "100");
  };
  assert.equal(await verifyEntrypointAssets(site, { fetchImpl }), "2 JS / 1 CSS headers verified");
  assert.equal(requests.length, 4);
  assert.ok(requests.every(request => request.url.startsWith(site)));
});

test("a missing JS/CSS/media asset returning SPA HTML 200 fails the smoke gate", async () => {
  const { verifyEntrypointAssets, verifyAssetHeaders } = await script;
  for (const badKind of [".js", ".css"]) {
    await assert.rejects(verifyEntrypointAssets(site, { fetchImpl: async url => {
      if (url === `${site}/`) return { ...response("text/html"), text: async () => html };
      return response(url.endsWith(badKind) ? "text/html" : url.endsWith(".css") ? "text/css" : "application/javascript", "100");
    } }), /SPA fallback is not an asset/);
  }
  await assert.rejects(verifyAssetHeaders(`${site}/assets/advertisement/1.mp4`, ["video/mp4"], { requireLength: true, fetchImpl: async () => response("text/html", "100") }), /SPA fallback is not an asset/);
});

test("homepage ad media stays aligned with UI, uses HEAD only and requires positive Content-Length", async () => {
  const { homepageAdMedia, verifyAssetHeaders } = await script;
  const source = readFileSync(path.resolve(__dirname, "../src/app/legacy/SiteAppLegacy.tsx"), "utf8");
  assert.equal(homepageAdMedia.length, 4);
  for (const media of homepageAdMedia) {
    assert.ok(source.includes(`"${media.path}"`));
    assert.equal(await verifyAssetHeaders(`${site}${media.path}`, [media.mime], { requireLength: true, fetchImpl: async (url, options) => {
      assert.equal(options.method, "HEAD");
      return response(media.mime, "12345"); // No body/text accessor: never downloaded.
    } }), media.mime);
  }
  for (const size of [undefined, "0", "-1", "oops"]) await assert.rejects(verifyAssetHeaders(`${site}/assets/advertisement/1.mp4`, ["video/mp4"], { requireLength: true, fetchImpl: async () => response("video/mp4", size) }), /Content-Length/);
});

test("entrypoint missing one required asset kind or HTTP errors do not pass", async () => {
  const { referencedEntrypointAssets, verifyAssetHeaders } = await script;
  assert.throws(() => referencedEntrypointAssets('<script src="/assets/index.js"></script>', site), /both local JS and CSS/);
  await assert.rejects(verifyAssetHeaders(`${site}/assets/index.js`, ["text/javascript"], { fetchImpl: async () => response("text/javascript", "100", 404) }), /expected HEAD 200/);
});
