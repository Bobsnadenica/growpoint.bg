const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { createDskUatAdapter, DskUatError, validateCheckoutUrl, AMOUNT_MINOR, CURRENCY_NUMERIC } = require("../backend/api/dsk-uat.cjs");

const id = "01491d0b-c848-7dd6-a20d-e96900a7d8c0";
const otherId = "11111111-1111-1111-1111-111111111111";
const ref = "gp-uat-fixture-01";
const returnUrl = `https://www.growpoint.bg/admin?paymentTest=${otherId}`;
const formUrl = `https://uat.dskbank.bg/payment/payment/merchants/ecom/payment_bg.html?mdOrder=${id}`;
const sharedFormUrl = `https://uat.dskbank.bg/payment/merchants/multiecom/payment.html?mdOrder=${id}&language=bg`;
const fixedTime = "2026-10-01T12:00:00.000Z";
const response = (body, options = {}) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" }, ...options });
const statusReply = (patch = {}) => ({
  errorCode: "0", orderNumber: ref, orderStatus: 2, actionCode: 0, amount: 100, currency: "978",
  attributes: [{ name: "mdOrder", value: id }],
  paymentAmountInfo: { paymentState: "DEPOSITED", depositedAmount: 100, refundedAmount: 0 }, ...patch,
});
function fixture(replies, options = {}) {
  const calls = [];
  const adapter = createDskUatAdapter({
    userName: "fixture-api", password: "fixture-password", now: () => new Date(fixedTime),
    fetchImpl: async (url, init) => {
      calls.push({ url, init, fields: Object.fromEntries(init.body) });
      assert.ok(replies.length, "unexpected extra gateway request");
      const next = replies.shift();
      return typeof next === "function" ? next(url, init) : next;
    }, ...options,
  });
  return { adapter, calls };
}

test("UAT registration has fixed minor units, body-only auth, safe redirects and no notification fields", async () => {
  const { adapter, calls } = fixture([response({ orderId: id, formUrl })]);
  const result = await adapter.register({ orderNumber: ref, returnUrl, amount: 99999, currency: "USD", email: "ignored@example.invalid" });
  assert.equal(AMOUNT_MINOR, 100);
  assert.equal(CURRENCY_NUMERIC, "978");
  assert.deepEqual(result, { testMode: true, amountMinor: 100, currency: "EUR", orderNumber: ref, status: "created", gatewayOrderId: id, checkoutUrl: formUrl, recovered: false });
  assert.equal(calls.length, 1);
  const { url, init, fields } = calls[0];
  assert.equal(url, "https://uat.dskbank.bg/payment/rest/register.do");
  assert.equal(init.method, "POST");
  assert.equal(init.redirect, "error");
  assert.equal(init.headers["Content-Type"], "application/x-www-form-urlencoded");
  assert.ok(init.signal instanceof AbortSignal);
  assert.deepEqual(fields, {
    userName: "fixture-api", password: "fixture-password", orderNumber: ref, amount: "100", currency: "978",
    returnUrl, failUrl: returnUrl, language: "bg", sessionTimeoutSecs: "1200",
    description: "GrowPoint UAT synthetic payment - no production entitlement",
  });
  assert.doesNotMatch(url, /fixture-api|fixture-password/);
  for (const forbidden of ["email", "clientId", "bindingId", "jsonParams", "dynamicCallbackUrl", "pan", "cvc"]) assert.equal(fields[forbidden], undefined);
});

test("HTTP 200 gateway rejection is sanitized and is not retried", async () => {
  const secret = "private-gateway-detail";
  const { adapter, calls } = fixture([response({ errorCode: "5", errorMessage: secret })]);
  await assert.rejects(adapter.register({ orderNumber: ref, returnUrl }), error => {
    assert.ok(error instanceof DskUatError);
    assert.equal(error.code, "DSK_UAT_REGISTRATION_REJECTED");
    assert.equal(error.ambiguous, false);
    assert.equal(error.gatewayCode, 5);
    assert.ok(!JSON.stringify(error).includes(secret));
    assert.ok(!error.stack.includes(secret));
    return true;
  });
  assert.equal(calls.length, 1);
});

test("explicit success overrides a contradictory errorCode, false overrides zero", async () => {
  const first = fixture([response({ success: true, errorCode: "5", orderId: id, formUrl })]);
  assert.equal((await first.adapter.register({ orderNumber: ref, returnUrl })).status, "created");
  const second = fixture([response({ success: false, errorCode: "0", orderId: id, formUrl })]);
  await assert.rejects(second.adapter.register({ orderNumber: ref, returnUrl }), { code: "DSK_UAT_REGISTRATION_REJECTED" });
  assert.equal(second.calls.length, 1);
});

test("paid status verifies both IDs, reference, amount and currency and drops all private response fields", async () => {
  const { adapter, calls } = fixture([response(statusReply({
    errorMessage: "do not export", cardAuthInfo: { pan: "private-card", cardholderName: "private-name" },
    payerData: { email: "private-email" }, bankInfo: { bankName: "private-bank" },
  }))]);
  const result = await adapter.getStatus({ orderNumber: ref, orderId: id });
  assert.deepEqual(result, { testMode: true, amountMinor: 100, currency: "EUR", orderNumber: ref, status: "succeeded", gatewayOrderId: id, bankOrderStatus: 2, actionCode: 0, verifiedAt: fixedTime });
  assert.deepEqual(calls[0].fields, { userName: "fixture-api", password: "fixture-password", orderId: id, language: "bg" });
  assert.equal(calls[0].fields.orderNumber, undefined, "never send both lookup keys; bank gives ID priority");
  assert.doesNotMatch(JSON.stringify(result), /private-|cardAuthInfo|payerData|bankInfo|errorMessage/);
});

test("only one-phase captured status succeeds; other statuses retain their exact non-paid meaning", async () => {
  for (const [bankStatus, expected] of [[0, "created"], [1, "authorized"], [3, "cancelled"], [4, "refunded"], [5, "pending"], [6, "failed"], [7, "pending"], [8, "pending"], [99, "unknown"]]) {
    const { adapter, calls } = fixture([response(statusReply({ orderStatus: bankStatus, actionCode: "-100" }))]);
    const result = await adapter.getStatus({ orderNumber: ref });
    assert.equal(result.status, expected, `bank status ${bankStatus}`);
    assert.equal(result.actionCode, -100);
    assert.equal(calls[0].fields.orderNumber, ref);
    assert.equal(calls[0].fields.orderId, undefined);
  }
});

test("status validation fails closed on mismatched or missing financial/identity evidence", async () => {
  const invalid = [
    { orderNumber: "other-order" }, { amount: 101 }, { amount: null }, { amount: true }, { amount: "" },
    { currency: "975" }, { currency: undefined }, { orderStatus: undefined }, { orderStatus: "2x" },
    { actionCode: undefined }, { actionCode: null }, { actionCode: false }, { actionCode: " " }, { actionCode: 1 },
    { attributes: undefined }, { attributes: [] }, { attributes: [{ name: "mdOrder", value: otherId }] },
    { attributes: [{ name: "mdOrder", value: id }, { name: "mdOrder", value: id }] },
    { orderId: otherId }, { success: "true" }, { errorCode: 0.1 },
    { paymentAmountInfo: { depositedAmount: 99 } }, { paymentAmountInfo: { refundedAmount: 1 } },
    { paymentAmountInfo: { paymentState: "APPROVED" } }, { paymentAmountInfo: null },
  ];
  for (const patch of invalid) {
    const { adapter } = fixture([response(statusReply(patch))]);
    await assert.rejects(adapter.getStatus({ orderNumber: ref, orderId: id }), { code: "DSK_UAT_REPLY_INVALID", ambiguous: true });
  }
});

test("numeric bank strings are accepted without permissive JavaScript coercion", async () => {
  const { adapter } = fixture([response(statusReply({ orderStatus: "2", actionCode: "0", amount: "100", currency: 978 }))]);
  assert.equal((await adapter.getStatus({ orderNumber: ref })).status, "succeeded");
});

test("checkout URL is limited to documented HTTPS UAT forms and matching unique mdOrder", () => {
  assert.equal(validateCheckoutUrl(formUrl, id), formUrl);
  const alternate = `https://uat.dskbank.bg/payment/merchants/pay/payment_en.html?mdOrder=${id}`;
  assert.equal(validateCheckoutUrl(alternate, id), alternate);
  for (const url of [
    formUrl.replace("https:", "http:"), formUrl.replace("uat.dskbank.bg", "epg.dskbank.bg"),
    formUrl.replace("uat.dskbank.bg", "uat.dskbank.bg.evil.invalid"), formUrl.replace("uat.dskbank.bg", "127.0.0.1"),
    formUrl.replace("uat.dskbank.bg", "private:secret@uat.dskbank.bg"), formUrl.replace("uat.dskbank.bg", "uat.dskbank.bg:444"),
    formUrl.replace("/payment/payment/merchants/ecom/payment_bg.html", "/payment/rest/register.do"),
    formUrl.replace(id, otherId), `${formUrl}&mdOrder=${id}`, `${formUrl}&next=https://evil.invalid`, `${formUrl}#fragment`,
  ]) assert.throws(() => validateCheckoutUrl(url, id), { code: "DSK_UAT_REPLY_INVALID" });
});

test("actual sandbox register multiecom form keeps its matching UUID and explicit language without status fallback", async () => {
  const { adapter, calls } = fixture([response({ orderId: id, formUrl: sharedFormUrl })]);
  const result = await adapter.register({ orderNumber: ref, returnUrl });
  assert.equal(result.checkoutUrl, sharedFormUrl);
  assert.equal(result.recovered, false);
  assert.equal(calls.length, 1);
  assert.equal(validateCheckoutUrl(sharedFormUrl.replace("language=bg", "language=en"), id).endsWith("language=en"), true);
  for (const url of [
    sharedFormUrl.replace("multiecom", "other-merchant"), sharedFormUrl.replace("payment.html", "finish.html"),
    sharedFormUrl.replace("https:", "http:"), sharedFormUrl.replace("uat.dskbank.bg", "epg.dskbank.bg"),
    sharedFormUrl.replace(id, otherId), sharedFormUrl.replace("&language=bg", ""),
    sharedFormUrl.replace("language=bg", "language=../private"), sharedFormUrl.replace("language=bg", "language=BG"),
    `${sharedFormUrl}&language=bg`, `${sharedFormUrl}&mdOrder=${id}`, `${sharedFormUrl}&redirect=https://evil.invalid`, `${sharedFormUrl}#fragment`,
  ]) assert.throws(() => validateCheckoutUrl(url, id), { code: "DSK_UAT_REPLY_INVALID" });
  assert.throws(() => validateCheckoutUrl(sharedFormUrl, "not-a-uuid"), { code: "DSK_UAT_REPLY_INVALID" });
});

test("registration timeout recovers once by merchant orderNumber and verified canonical UAT form without duplicate registration", async () => {
  const { adapter, calls } = fixture([
    (_, init) => new Promise((resolve, reject) => init.signal.addEventListener("abort", () => reject(new Error("private network detail")), { once: true })),
    response(statusReply({ orderStatus: 0, actionCode: -100 })),
  ], { timeoutMs: 5 });
  const result = await adapter.register({ orderNumber: ref, returnUrl });
  assert.equal(result.status, "created");
  assert.equal(result.recovered, true);
  assert.equal(result.gatewayOrderId, id);
  assert.equal(result.checkoutUrl, sharedFormUrl);
  assert.deepEqual(calls.map(call => new URL(call.url).pathname), ["/payment/rest/register.do", "/payment/rest/getOrderStatusExtended.do"]);
  assert.equal(calls[1].fields.orderNumber, ref);
  assert.equal(calls[1].fields.orderId, undefined);
});

test("previously registered order without URL recovers only from bank-verified unpaid identity/financial evidence", async () => {
  const recovered = fixture([response(statusReply({ orderStatus: 0, actionCode: -100 }))]);
  assert.equal((await recovered.adapter.getStatus({ orderNumber: ref, orderId: id })).checkoutUrl, sharedFormUrl);
  assert.equal(recovered.calls.length, 1);
  assert.ok(recovered.calls[0].url.endsWith("/getOrderStatusExtended.do"));
  for (const patch of [{ orderNumber: "other-ref" }, { amount: 200 }, { currency: "975" }, { attributes: [{ name: "mdOrder", value: otherId }] }]) {
    const mismatch = fixture([response(statusReply({ orderStatus: 0, actionCode: -100, ...patch }))]);
    await assert.rejects(mismatch.adapter.getStatus({ orderNumber: ref, orderId: id }), { code: "DSK_UAT_REPLY_INVALID" });
  }
  for (const bankStatus of [1, 2, 3, 4, 5, 6, 7, 8, 99]) {
    const nonInitial = fixture([response(statusReply({ orderStatus: bankStatus }))]);
    assert.equal((await nonInitial.adapter.getStatus({ orderNumber: ref, orderId: id })).checkoutUrl, undefined);
  }
});

test("duplicate merchant order is reconciled rather than registered again", async () => {
  const { adapter, calls } = fixture([response({ errorCode: "1", errorMessage: "private detail" }), response(statusReply())]);
  const result = await adapter.register({ orderNumber: ref, returnUrl });
  assert.equal(result.status, "succeeded");
  assert.equal(result.recovered, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].fields.orderNumber, ref);
});

test("uncertain registration plus unavailable lookup remains unknown without re-registering", async () => {
  for (const first of [
    response({ errorCode: "1" }), response({ orderId: id, formUrl: "https://evil.invalid" }),
    new Response("private html error", { status: 502 }), new Response("not json", { headers: { "Content-Type": "application/json" } }),
    response({ success: "true", orderId: id, formUrl }), response({ orderId: otherId, formUrl }),
  ]) {
    const { adapter, calls } = fixture([first, response({ errorCode: "6", errorMessage: "private not-found response" })]);
    assert.deepEqual(await adapter.register({ orderNumber: ref, returnUrl }), { testMode: true, amountMinor: 100, currency: "EUR", orderNumber: ref, status: "unknown", recovered: false });
    assert.equal(calls.length, 2);
    assert.equal(calls.filter(call => call.url.endsWith("/register.do")).length, 1);
  }
});

test("configuration and return references reject unsupported auth and arbitrary hosts before any network request", async () => {
  for (const patch of [{ token: "unsupported-token" }, { userName: "" }, { password: "" }, { password: "a".repeat(31) }, { userName: "bad\nvalue" }, { timeoutMs: 10001 }]) {
    assert.throws(() => createDskUatAdapter({ userName: "fixture-api", password: "fixture-password", ...patch }), { code: "DSK_UAT_CONFIG_INVALID" });
  }
  const { adapter, calls } = fixture([]);
  for (const badReturn of [returnUrl.replace("www.growpoint.bg", "evil.invalid"), returnUrl.replace("/admin", "/dashboard"), `${returnUrl}&success=true`, `${returnUrl}#x`, returnUrl.replace(otherId, "not-a-uuid")]) {
    await assert.rejects(adapter.register({ orderNumber: ref, returnUrl: badReturn }), { code: "DSK_UAT_RETURN_URL_INVALID" });
  }
  for (const badRef of ["", "x".repeat(37), "email@example.invalid", "ref\nvalue"]) {
    await assert.rejects(adapter.register({ orderNumber: badRef, returnUrl }), { code: "DSK_UAT_ORDER_REFERENCE_INVALID" });
  }
  await assert.rejects(adapter.getStatus({ orderNumber: ref, orderId: "bad-id" }), { code: "DSK_UAT_REPLY_INVALID" });
  assert.equal(calls.length, 0);
});

test("gateway reply size is bounded and adapter cannot import production mutations or log bank bodies", async () => {
  const { adapter } = fixture([response(statusReply({ irrelevant: "x".repeat(65536) }))]);
  await assert.rejects(adapter.getStatus({ orderNumber: ref }), { code: "DSK_UAT_REPLY_INVALID" });
  const source = readFileSync(require.resolve("../backend/api/dsk-uat.cjs"), "utf8");
  assert.doesNotMatch(source, /require\(|import\s|console\.|SendEmail|sendEmail|booking|notifications|membership|epg\.dskbank/);
});
