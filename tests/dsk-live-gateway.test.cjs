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
  for (const [patch, expected] of [[{ orderStatus: 1, actionCode: 0 }, "authorized"], [{ orderStatus: 4, actionCode: 0, paymentAmountInfo: {depositedAmount:999,refundedAmount:999,paymentState:"REFUNDED"} }, "refunded"], [{ paymentAmountInfo: { depositedAmount: 999, refundedAmount: 20, paymentState: "DEPOSITED" } }, "partially_refunded"]]) {
    const { gateway } = fixture([response(status(patch))]);
    assert.equal((await gateway.getStatus({ orderNumber: reference, amountMinor: 999 })).status, expected);
  }
  const f = fixture([new Error("secret bank error")]);
  await assert.rejects(f.gateway.register({ orderNumber: reference, checkoutId, amountMinor: 999 }), error => error.code === "DSK_LIVE_REQUEST_FAILED" && error.ambiguous === true && !String(error.stack).includes("secret bank error"));
  assert.equal(f.calls.length, 1, "ambiguous registration is never blindly retried");
  const duplicate = fixture([response({ errorCode: "1" })]);
  await assert.rejects(duplicate.gateway.register({ orderNumber: reference, checkoutId, amountMinor: 999 }), { code: "DSK_LIVE_DUPLICATE_ORDER", ambiguous: true });
  assert.equal(duplicate.calls.length, 1);
  await assert.rejects(f.gateway.register({ orderNumber: reference, checkoutId, amountMinor: 0 }), { code: "DSK_LIVE_INVALID_ORDER" });
});

test("bank timeouts, unexpected HTTP content and oversize replies fail closed", async () => {
  const timeout = createDskLiveGateway({ userName: "fixture", password: "fixture", timeoutMs: 5, fetchImpl: (_, init) => new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new Error("network detail")), { once: true })) });
  await assert.rejects(timeout.register({ orderNumber: reference, checkoutId, amountMinor: 999 }), { code: "DSK_LIVE_REQUEST_FAILED", ambiguous: true });
  for (const reply of [new Response("<html>unexpected</html>", { status: 200, headers: { "content-type": "text/html" } }), new Response("bad json", { status: 200, headers: { "content-type": "application/json" } }), new Response("x".repeat(65537), { status: 200, headers: { "content-type": "application/json" } }), new Response("{}", { status: 503, headers: { "content-type": "application/json" } })]) {
    const f = fixture([reply]);
    await assert.rejects(f.gateway.getStatus({ orderNumber: reference, amountMinor: 999 }), { code: "DSK_LIVE_INVALID_REPLY", ambiguous: true });
  }
});

test("renewals are explicitly gated, use DSK JSON endpoint, and independently verify captured state", async () => {
  let calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return calls.length === 1 ? response({ success: true, data: { orderId: id } }) : response(status({}));
  };
  const order = { orderNumber: reference, amountMinor: 999, bindingId: id };
  for (const config of [{ userName: "fixture", password: "fixture" }, { token: "fixture", recurringAllowed: true }]) {
    await assert.rejects(createDskLiveGateway({ ...config, fetchImpl }).chargeRecurring(order), { code: "DSK_LIVE_RECURRING_DISABLED", ambiguous: false });
  }
  assert.equal(calls.length, 0);
  const gateway = createDskLiveGateway({ userName: "fixture", password: "fixture", recurringAllowed: true, fetchImpl });
  const result = await gateway.chargeRecurring(order);
  assert.equal(result.status, "succeeded");
  assert.equal(calls[0].url, "https://epg.dskbank.bg/payment/recurrentPayment.do");
  assert.equal(calls[0].init.headers["Content-Type"], "application/json");
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.amount, 999); assert.equal(body.currency, "978"); assert.equal(body.preAuth, false);
  assert.equal(body.bindingId, id); assert.equal(body.orderNumber, reference);
  assert.equal(calls[1].url, "https://epg.dskbank.bg/payment/rest/getOrderStatusExtended.do");
  for (const field of ["pan", "cvc", "cardNumber"]) assert.equal(body[field], undefined);
});

test("renewal acceptance is not settlement and ambiguous outcomes never retry a debit", async () => {
  const order = { orderNumber: reference, amountMinor: 999, bindingId: id };
  for (const first of [new Error("secret network failure"), { success: true, data: { orderId: "invalid" } }, { success: false, error: { code: "1", description: "private description" } }, { success: true, errorCode: 1, data: { orderId: id } }]) {
    let count = 0;
    const gateway = createDskLiveGateway({ userName: "fixture", password: "fixture", recurringAllowed: true, fetchImpl: async () => { count++; if (first instanceof Error) throw first; return response(first); } });
    await assert.rejects(gateway.chargeRecurring(order), e => e.ambiguous === true && !String(e).includes("private description") && !String(e).includes("secret network"));
    assert.equal(count, 1);
  }
  const replies = [response({ success: true, data: { orderId: id } }), response(status({ orderStatus: 1 }))];
  const gateway = createDskLiveGateway({ userName: "fixture", password: "fixture", recurringAllowed: true, fetchImpl: async () => replies.shift() });
  assert.equal((await gateway.chargeRecurring(order)).status, "authorized");
});

test("bank bindings are returned privately only after an exact client match", async () => {
  const clientId = "gp-fixture-owner";
  const bindingInfo = { clientId, bindingId: id };
  const matching = fixture([response(status({ bindingInfo }))]);
  assert.equal((await matching.gateway.getStatus({ orderNumber: reference, amountMinor: 999, clientId })).bindingId, id);
  const other = fixture([response(status({ bindingInfo: { ...bindingInfo, clientId: "someone-else" } }))]);
  await assert.rejects(other.gateway.getStatus({ orderNumber: reference, amountMinor: 999, clientId }), { code: "DSK_LIVE_INVALID_REPLY" });
  const ordinary = fixture([response(status({ bindingInfo }))]);
  assert.equal((await ordinary.gateway.getStatus({ orderNumber: reference, amountMinor: 999 })).bindingId, undefined);
});

test("sandbox uses only its own origin; saving a card requires explicit consent and recurring permission", async () => {
  const calls = [];
  const config = { bankMode: "sandbox", userName: "fixture", password: "fixture", recurringAllowed: true, fetchImpl: async (url, init) => {
    calls.push({ url, body: Object.fromEntries(init.body) });
    return response({ orderId: id, formUrl: checkoutUrl.replace("epg.dskbank.bg", "uat.dskbank.bg") });
  } };
  const gateway = createDskLiveGateway(config);
  const order = { orderNumber: reference, checkoutId, amountMinor: 999, clientId: "gp-fixture-client" };
  await assert.rejects(gateway.register(order), { code: "DSK_LIVE_INVALID_ORDER" });
  assert.equal(calls.length, 0);
  await assert.rejects(gateway.register({ ...order, saveCardConsent: true }), { code: "DSK_LIVE_INVALID_ORDER" });
  for (const recurringExpiry of ["20300230", "20000101", "2030-12-31"]) await assert.rejects(gateway.register({ ...order, saveCardConsent: true, recurringExpiry }), { code: "DSK_LIVE_INVALID_ORDER" });
  const result = await gateway.register({ ...order, saveCardConsent: true, recurringExpiry: "20991231" });
  assert.equal(new URL(calls[0].url).origin, "https://uat.dskbank.bg");
  assert.equal(new URL(result.checkoutUrl).origin, "https://uat.dskbank.bg");
  assert.equal(calls[0].body.clientId, order.clientId);
  assert.equal(calls[0].body.features, "FORCE_TDS", "never overrides the bank's save-card choice");
  assert.deepEqual(JSON.parse(calls[0].body.jsonParams), { recurringFrequency: "28", recurringExpiry: "20991231" });
  assert.throws(() => validateLiveCheckoutUrl(result.checkoutUrl, id), { code: "DSK_LIVE_INVALID_REPLY" });
  assert.throws(() => createDskLiveGateway({ ...config, bankMode: "https://evil.invalid" }), { code: "DSK_LIVE_INVALID_CONFIGURATION" });
});
test("bank-confirmed remaining refund balance matches the observed sandbox response",async()=>{
  const f=fixture([response(status({orderStatus:4,paymentAmountInfo:{depositedAmount:0,refundedAmount:999,paymentState:"REFUNDED"}}))]);
  assert.equal((await f.gateway.getStatus({orderNumber:reference,amountMinor:999})).status,"refunded");
  const invalid=fixture([response(status({orderStatus:4,paymentAmountInfo:{depositedAmount:0,refundedAmount:998,paymentState:"REFUNDED"}}))]);
  await assert.rejects(invalid.gateway.getStatus({orderNumber:reference,amountMinor:999}),{code:"DSK_LIVE_INVALID_REPLY"});
});
test("zero-charge setup is recognized only with exact bank and binding-owner evidence",async()=>{
  const clientId="gp-fixture-client";
  const value=status({orderStatus:3,bindingInfo:{clientId,bindingId:id},paymentAmountInfo:{depositedAmount:0,refundedAmount:0,paymentState:"REVERSED"}});
  const f=fixture([response(value)]);
  assert.equal((await f.gateway.getStatus({orderNumber:reference,amountMinor:999,clientId})).cardSetupVerified,true);
  const cancelled=fixture([response({...value,bindingInfo:undefined})]);
  assert.equal((await cancelled.gateway.getStatus({orderNumber:reference,amountMinor:999,clientId})).cardSetupVerified,undefined);
});
test("recurring-card lookup uses the typed bank endpoint and never treats a common card as recurrent",async()=>{
  const f=fixture([response({errorCode:0,bindings:[]}),response({errorCode:0,bindings:[{bindingId:id}]})]);
  assert.equal(await f.gateway.isRecurringBinding({clientId:"gp-fixture-client",bindingId:id}),false);
  assert.equal(await f.gateway.isRecurringBinding({clientId:"gp-fixture-client",bindingId:id}),true);
  assert.equal(f.calls[0].body.bindingType,"R");
  assert.equal(f.calls[0].url,"https://epg.dskbank.bg/payment/rest/getBindings.do");
});
