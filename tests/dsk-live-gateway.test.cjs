const test = require("node:test");
const assert = require("node:assert/strict");
const { createDskLiveGateway, validateLiveCheckoutUrl } = require("../backend/api/dsk-live-gateway.cjs");

const id = "01491d0b-c848-7dd6-a20d-e96900a7d8c0";
const checkoutId = "11111111-1111-4111-8111-111111111111";
const reference = "gp-live-fixture-01";
const checkoutUrl = `https://epg.dskbank.bg/payment/merchants/multiecom/payment.html?mdOrder=${id}&language=bg`;
const response = value => new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
const status = extra => ({ orderNumber: reference, orderStatus: 2, actionCode: 0, amount: 999, currency: "978", attributes: [{ name: "mdOrder", value: id }], paymentAmountInfo: { depositedAmount: 999, refundedAmount: 0, paymentState: "DEPOSITED" }, ...extra });
function fixture(replies) {
  const calls = [];
  const gateway = createDskLiveGateway({ userName: "fixture-api", password: "fixture-password", fetchImpl: async (url, init) => {
    calls.push({ url, init, body: Object.fromEntries(init.body) });
    const next = replies.shift();
    if (next instanceof Error) throw next;
    return next;
  } });
  return { gateway, calls };
}

test("production registration fixes the bank and return origins and sends no card details", async () => {
  const { gateway, calls } = fixture([response({ orderId: id, formUrl: checkoutUrl })]);
  assert.deepEqual(await gateway.register({ orderNumber: reference, checkoutId, amountMinor: 999 }), { gatewayOrderId: id, checkoutUrl });
  assert.equal(calls[0].url, "https://epg.dskbank.bg/payment/rest/register.do");
  assert.equal(calls[0].init.redirect, "error");
  assert.equal(calls[0].body.amount, "999");
  assert.equal(calls[0].body.currency, "978");
  assert.equal(calls[0].body.returnUrl, `https://www.growpoint.bg/dashboard?payment=${checkoutId}`);
  for (const key of ["pan", "cvc", "cardNumber", "email", "bindingId"]) assert.equal(calls[0].body[key], undefined);
  assert.doesNotMatch(calls[0].url, /fixture-password|fixture-api/);
});

test("merchant token and API-user authentication remain separate and never enter URLs", async () => {
  let sent;
  const gateway = createDskLiveGateway({ token: "fixture-token", fetchImpl: async (url, init) => { sent = { url, body: Object.fromEntries(init.body) }; return response({ orderId: id, formUrl: checkoutUrl }); } });
  await gateway.register({ orderNumber: reference, checkoutId, amountMinor: 999 });
  assert.equal(sent.body.token, "fixture-token");
  assert.equal(sent.body.userName, undefined); assert.equal(sent.body.password, undefined);
  assert.doesNotMatch(sent.url, /fixture-token/);
  assert.throws(() => createDskLiveGateway({ token: "fixture", userName: "user", password: "pass" }), { code: "DSK_LIVE_INVALID_CONFIGURATION" });
  assert.throws(() => createDskLiveGateway({ token: "fixture\nsecret" }), { code: "DSK_LIVE_INVALID_CONFIGURATION" });
});

test("production checkout URLs reject untrusted hosts, paths and mismatched or duplicate IDs", () => {
  assert.equal(validateLiveCheckoutUrl(checkoutUrl, id), checkoutUrl);
  for (const url of [checkoutUrl.replace("https:", "http:"), checkoutUrl.replace("epg.dskbank.bg", "uat.dskbank.bg"), checkoutUrl.replace("epg.dskbank.bg", "epg.dskbank.bg.evil.invalid"), checkoutUrl.replace("multiecom/payment.html", "elsewhere"), checkoutUrl.replace(id, checkoutId), `${checkoutUrl}&mdOrder=${id}`, `${checkoutUrl}&next=https://evil.invalid`, `${checkoutUrl}#fragment`]) assert.throws(() => validateLiveCheckoutUrl(url, id), { code: "DSK_LIVE_INVALID_REPLY" });
});

test("only a verified captured order can be treated as successful", async () => {
  const { gateway } = fixture([response(status({}))]);
  assert.deepEqual(await gateway.getStatus({ orderNumber: reference, amountMinor: 999, gatewayOrderId: id }), { gatewayOrderId: id, status: "succeeded", bankStatus: 2, actionCode: 0 });
  for (const patch of [{ orderNumber: "wrong" }, { amount: 2999 }, { currency: "975" }, { orderStatus: null }, { actionCode: 1 }, { attributes: [] }, { paymentAmountInfo: undefined }, { paymentAmountInfo: { depositedAmount: 999, paymentState: "DEPOSITED" } }, { paymentAmountInfo: { depositedAmount: 998 } }, { paymentAmountInfo: { paymentState: "APPROVED" } }]) {
    const f = fixture([response(status(patch))]);
    await assert.rejects(f.gateway.getStatus({ orderNumber: reference, amountMinor: 999, gatewayOrderId: id }), { code: "DSK_LIVE_INVALID_REPLY" });
  }
});

test("contradictory bank success flags and error codes fail closed", async () => {
  for (const flags of [{ success: true, errorCode: 1 }, { success: false, errorCode: 0 }]) {
    const registration = fixture([response({ orderId: id, formUrl: checkoutUrl, ...flags })]);
    await assert.rejects(registration.gateway.register({ orderNumber: reference, checkoutId, amountMinor: 999 }), { code: "DSK_LIVE_INVALID_REPLY", ambiguous: true });
    const settlement = fixture([response(status(flags))]);
    await assert.rejects(settlement.gateway.getStatus({ orderNumber: reference, amountMinor: 999 }), { code: "DSK_LIVE_INVALID_REPLY", ambiguous: true });
  }
});

test("authorization, refunds and ambiguous failures never become captured payment", async () => {
  for (const [patch, expected] of [[{ orderStatus: 1, actionCode: 0 }, "authorized"], [{ orderStatus: 4, actionCode: 0 }, "refunded"], [{ paymentAmountInfo: { depositedAmount: 999, refundedAmount: 20, paymentState: "DEPOSITED" } }, "partially_refunded"]]) {
    const { gateway } = fixture([response(status(patch))]);
    assert.equal((await gateway.getStatus({ orderNumber: reference, amountMinor: 999 })).status, expected);
  }
  const f = fixture([new Error("secret bank error")]);
  await assert.rejects(f.gateway.register({ orderNumber: reference, checkoutId, amountMinor: 999 }), error => error.code === "DSK_LIVE_REQUEST_FAILED" && error.ambiguous === true && !String(error.stack).includes("secret bank error"));
  assert.equal(f.calls.length, 1, "ambiguous registration is never blindly retried");
  const duplicate = fixture([response({ errorCode: "1" })]);
  await assert.rejects(duplicate.gateway.register({ orderNumber: reference, checkoutId, amountMinor: 999 }), { code: "DSK_LIVE_DUPLICATE_ORDER", ambiguous: true });
  assert.equal(duplicate.calls.length, 1);
  await assert.rejects(f.gateway.register({ orderNumber: reference, checkoutId, amountMinor: 1 }), { code: "DSK_LIVE_INVALID_ORDER" });
});

test("bank timeouts, unexpected HTTP content and oversize replies fail closed", async () => {
  const timeout = createDskLiveGateway({ userName: "fixture", password: "fixture", timeoutMs: 5, fetchImpl: (_, init) => new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new Error("network detail")), { once: true })) });
  await assert.rejects(timeout.register({ orderNumber: reference, checkoutId, amountMinor: 999 }), { code: "DSK_LIVE_REQUEST_FAILED", ambiguous: true });
  for (const reply of [new Response("<html>unexpected</html>", { status: 200, headers: { "content-type": "text/html" } }), new Response("bad json", { status: 200, headers: { "content-type": "application/json" } }), new Response("x".repeat(65537), { status: 200, headers: { "content-type": "application/json" } }), new Response("{}", { status: 503, headers: { "content-type": "application/json" } })]) {
    const f = fixture([reply]);
    await assert.rejects(f.gateway.getStatus({ orderNumber: reference, amountMinor: 999 }), { code: "DSK_LIVE_INVALID_REPLY", ambiguous: true });
  }
});
