"use strict";

// Used only by the guarded, server-owned billing service. Persist and reserve
// each purchase/cycle before any registration or debit request.
// A browser return is never proof of payment.
const BANK_ORIGIN = "https://epg.dskbank.bg";
const RETURN_ORIGIN = "https://www.growpoint.bg";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REFERENCE = /^[A-Za-z0-9_-]{1,36}$/;
const MAX_BYTES = 65536;
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

class DskLiveGatewayError extends Error {
  constructor(code, ambiguous = true) { super(code); this.name = "DskLiveGatewayError"; this.code = code; this.ambiguous = ambiguous; }
}
const invalid = () => new DskLiveGatewayError("DSK_LIVE_INVALID_REPLY");

function number(value, signed = false) {
  if (typeof value === "string" && (signed ? /^-?\d+$/ : /^\d+$/).test(value)) value = Number(value);
  if (!Number.isSafeInteger(value) || (!signed && value < 0)) throw invalid();
  return value;
}

function bankId(value) {
  if (typeof value !== "string" || !UUID.test(value)) throw invalid();
  return value;
}

function assertOrder(orderNumber, amountMinor) {
  // The billing ledger owns product prices. The transport must also reconcile
  // historical price snapshots after a catalogue change, within the card cap.
  if (typeof orderNumber !== "string" || !REFERENCE.test(orderNumber) || !Number.isSafeInteger(amountMinor) || amountMinor <= 0 || amountMinor > 400000) {
    throw new DskLiveGatewayError("DSK_LIVE_INVALID_ORDER", false);
  }
}

function validateCheckoutUrl(value, orderId, bankOrigin) {
  bankId(orderId);
  let url;
  try { url = new URL(value); } catch { throw invalid(); }
  const pathAllowed = url.pathname === "/payment/merchants/multiecom/payment.html" ||
    /^\/payment\/(?:payment\/)?merchants\/[A-Za-z0-9_-]+\/payment_(?:bg|en)\.html$/.test(url.pathname);
  const keys = [...url.searchParams.keys()];
  if (url.origin !== bankOrigin || url.username || url.password || url.hash || !pathAllowed ||
      keys.filter(key => key === "mdOrder").length !== 1 || keys.some(key => !["mdOrder", "language"].includes(key)) ||
      keys.filter(key => key === "language").length > 1 || url.searchParams.get("mdOrder") !== orderId ||
      (url.searchParams.has("language") && !["bg", "en"].includes(url.searchParams.get("language")))) throw invalid();
  return url.href;
}
function validateLiveCheckoutUrl(value, orderId) { return validateCheckoutUrl(value, orderId, BANK_ORIGIN); }

async function readReply(response) {
  if (response.status !== 200 || !/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") || "")) throw invalid();
  if (Number(response.headers.get("content-length")) > MAX_BYTES || !response.body?.getReader) throw invalid();
  const reader = response.body.getReader(), chunks = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) { await reader.cancel(); throw invalid(); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  let data;
  try { data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))); } catch { throw invalid(); }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw invalid();
  return data;
}

function accepted(reply) {
  const code = own(reply, "errorCode") ? number(reply.errorCode) : undefined;
  if (code !== undefined && code > 99) throw invalid();
  if (own(reply, "success")) {
    if (typeof reply.success !== "boolean") throw invalid();
    // Never let a success flag override a bank error code, or vice versa.
    // Conflicting signals require reconciliation rather than a payment grant.
    if (code !== undefined && reply.success !== (code === 0)) throw invalid();
    return reply.success;
  }
  return code === undefined || code === 0;
}

function createDskLiveGateway({ userName, password, token, bankMode = "production", recurringAllowed = false, fetchImpl = globalThis.fetch, timeoutMs = 8000 } = {}) {
  const userAuth = typeof userName === "string" && userName.length > 0 && userName.length <= 100 && typeof password === "string" && password.length > 0 && password.length <= 200 && !/[\u0000-\u001f\u007f]/.test(userName + password);
  const tokenAuth = typeof token === "string" && token.length > 0 && token.length <= 4096 && !/[\u0000-\u001f\u007f]/.test(token);
  if (userAuth === tokenAuth || (tokenAuth && (userName !== undefined || password !== undefined)) ||
      (userAuth && token !== undefined) || !["production", "sandbox"].includes(bankMode) || typeof recurringAllowed !== "boolean" || typeof fetchImpl !== "function" || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000) {
    throw new DskLiveGatewayError("DSK_LIVE_INVALID_CONFIGURATION", false);
  }
  const auth = userAuth ? { userName, password } : { token };
  // Sandbox execution of this same adapter is explicit. No caller-supplied URL,
  // fallback between environments, or customer route can select the bank host.
  const bankOrigin = bankMode === "sandbox" ? "https://uat.dskbank.bg" : BANK_ORIGIN;
  async function request(method, fields, json = false) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      // recurrentPayment.do uses JSON and lives outside /rest/ in DSK's API.
      const reply = await fetchImpl(`${bankOrigin}/payment/${json ? "" : "rest/"}${method}`, {
        method: "POST", redirect: "error", signal: controller.signal,
        headers: { "Content-Type": json ? "application/json" : "application/x-www-form-urlencoded", Accept: "application/json" },
        body: json ? JSON.stringify({ ...auth, ...fields }) : new URLSearchParams({ ...auth, ...fields })
      });
      return await readReply(reply);
    } catch (error) {
      if (error instanceof DskLiveGatewayError) throw error;
      // Do not log bank responses, credentials, card data, or raw network errors.
      throw new DskLiveGatewayError("DSK_LIVE_REQUEST_FAILED");
    } finally { clearTimeout(timer); }
  }
  async function register({ orderNumber, checkoutId, amountMinor, clientId, saveCardConsent, recurringExpiry }) {
    assertOrder(orderNumber, amountMinor);
    if (typeof checkoutId !== "string" || !UUID.test(checkoutId)) throw new DskLiveGatewayError("DSK_LIVE_INVALID_ORDER", false);
    if ((clientId !== undefined || saveCardConsent !== undefined || recurringExpiry !== undefined) &&
        (saveCardConsent !== true || !recurringAllowed || !userAuth || typeof clientId !== "string" || !REFERENCE.test(clientId) ||
          typeof recurringExpiry !== "string" || !/^\d{8}$/.test(recurringExpiry))) throw new DskLiveGatewayError("DSK_LIVE_INVALID_ORDER", false);
    if (recurringExpiry !== undefined) {
      const date = new Date(`${recurringExpiry.slice(0,4)}-${recurringExpiry.slice(4,6)}-${recurringExpiry.slice(6,8)}T23:59:59.999Z`);
      if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10).replaceAll("-", "") !== recurringExpiry || date.getTime() <= Date.now()) throw new DskLiveGatewayError("DSK_LIVE_INVALID_ORDER", false);
    }
    const returnUrl = `${RETURN_ORIGIN}/dashboard?payment=${encodeURIComponent(checkoutId)}`;
    const reply = await request("register.do", {
      orderNumber, amount: String(amountMinor), currency: "978", returnUrl, failUrl: returnUrl,
      language: "bg", sessionTimeoutSecs: "1200", description: "GrowPoint expert membership",
      // clientId alone creates a COMMON credential, which DSK rejects for
      // recurringPayment. These documented attributes create a recurrent one.
      // 28 is the minimum interval; the subscription scheduler must separately
      // enforce its monthly anchor and expiry. Do not schedule every 28 days.
      ...(clientId !== undefined ? { clientId, features: "FORCE_TDS", jsonParams: JSON.stringify({ recurringFrequency: "28", recurringExpiry }) } : {})
    });
    if (!accepted(reply)) {
      // A duplicate reference can mean a previous request succeeded before a
      // timeout. Reconcile it by reference; never treat it as a fresh failure.
      if (own(reply, "errorCode") && number(reply.errorCode) === 1) throw new DskLiveGatewayError("DSK_LIVE_DUPLICATE_ORDER");
      throw new DskLiveGatewayError("DSK_LIVE_REGISTRATION_REJECTED", false);
    }
    const gatewayOrderId = bankId(reply.orderId);
    return { gatewayOrderId, checkoutUrl: validateCheckoutUrl(reply.formUrl, gatewayOrderId, bankOrigin) };
  }
  async function getStatus({ orderNumber, amountMinor, gatewayOrderId, clientId }) {
    assertOrder(orderNumber, amountMinor);
    if (gatewayOrderId !== undefined) bankId(gatewayOrderId);
    if (clientId !== undefined && (typeof clientId !== "string" || !REFERENCE.test(clientId))) throw new DskLiveGatewayError("DSK_LIVE_INVALID_ORDER", false);
    const reply = await request("getOrderStatusExtended.do", gatewayOrderId === undefined ? { orderNumber, language: "bg" } : { orderId: gatewayOrderId, language: "bg" });
    if (!accepted(reply)) throw new DskLiveGatewayError("DSK_LIVE_STATUS_UNAVAILABLE");
    if (reply.orderNumber !== orderNumber || number(reply.amount) !== amountMinor || number(reply.currency) !== 978) throw invalid();
    const attributes = Array.isArray(reply.attributes) ? reply.attributes.filter(item => item?.name === "mdOrder") : [];
    if (attributes.length !== 1) throw invalid();
    const verifiedId = bankId(attributes[0].value);
    if ((gatewayOrderId !== undefined && verifiedId !== gatewayOrderId) || (own(reply, "orderId") && reply.orderId !== verifiedId)) throw invalid();
    const bankStatus = number(reply.orderStatus), actionCode = number(reply.actionCode, true);
    let status = ({ 0: "created", 1: "authorized", 2: "succeeded", 3: "cancelled", 4: "refunded", 5: "pending", 6: "failed", 7: "pending", 8: "pending" })[bankStatus] || "unknown";
    if (bankStatus === 2 || bankStatus === 4) {
      if (actionCode !== 0) throw invalid();
      const amounts = reply.paymentAmountInfo;
      // Missing refund/deposit evidence is not equivalent to zero. In
      // particular, never grant access to a partly refunded transaction.
      if (!amounts || typeof amounts !== "object" || Array.isArray(amounts) ||
          !own(amounts, "depositedAmount") || !own(amounts, "refundedAmount") ||
          !["DEPOSITED","REFUNDED"].includes(amounts.paymentState)) throw invalid();
      const refunded = number(amounts.refundedAmount);
      const deposited=number(amounts.depositedAmount);
      if (refunded > amountMinor) throw invalid();
      // DSK can report either the captured total or the remaining deposited
      // balance after a refund. Both must reconcile to the original order.
      if (deposited !== amountMinor && deposited+refunded !== amountMinor) throw invalid();
      if (bankStatus === 4 && (refunded !== amountMinor || amounts.paymentState !== "REFUNDED")) throw invalid();
      if (bankStatus === 2 && amounts.paymentState !== "DEPOSITED") throw invalid();
      if (refunded) status = refunded === amountMinor ? "refunded" : "partially_refunded";
    }
    if (reply.chargeback === true) status="disputed";
    let bindingId;
    if (clientId !== undefined) {
      // Bindings are private server data. Never infer their owner from a callback.
      if (reply.bindingInfo) {
        if (reply.bindingInfo.clientId !== clientId) throw invalid();
        bindingId = bankId(reply.bindingInfo.bindingId);
      }
    }
    const cardSetupVerified=Boolean(bindingId && bankStatus===3 && actionCode===0 && reply.paymentAmountInfo?.paymentState === "REVERSED" && number(reply.paymentAmountInfo.depositedAmount)===0 && number(reply.paymentAmountInfo.refundedAmount)===0);
    return { gatewayOrderId: verifiedId, status, bankStatus, actionCode, ...(bindingId ? { bindingId } : {}),...(cardSetupVerified?{cardSetupVerified:true}:{}) };
  }
  async function chargeRecurring({ orderNumber, amountMinor, bindingId }) {
    // A portal token is not documented for this API. No credential substitution.
    if (!recurringAllowed || !userAuth) throw new DskLiveGatewayError("DSK_LIVE_RECURRING_DISABLED", false);
    assertOrder(orderNumber, amountMinor);
    bankId(bindingId);
    // The caller must atomically reserve this exact cycle/reference BEFORE the
    // request. A timeout is ambiguous and must never cause a fresh debit retry.
    const reply = await request("recurrentPayment.do", {
      orderNumber, bindingId, amount: amountMinor, currency: "978", language: "bg",
      preAuth: false, description: "GrowPoint expert membership renewal"
    }, true);
    if (reply.success !== true) {
      if (reply.success !== false || !reply.error || typeof reply.error.code !== "string") throw invalid();
      // Even a provider error can follow an earlier accepted duplicate request.
      // Keep the order unresolved until an authenticated lookup reconciles it.
      throw new DskLiveGatewayError("DSK_LIVE_RENEWAL_UNRESOLVED");
    }
    if (reply.error || (own(reply, "errorCode") && number(reply.errorCode) !== 0)) throw invalid();
    const gatewayOrderId = bankId(reply.data?.orderId);
    // success=true means processed, not paid. Always verify capture separately.
    return getStatus({ orderNumber, amountMinor, gatewayOrderId });
  }
  async function isRecurringBinding({clientId,bindingId}) {
    if (!userAuth || typeof clientId !== "string" || !REFERENCE.test(clientId)) throw new DskLiveGatewayError("DSK_LIVE_INVALID_ORDER",false);
    bankId(bindingId);
    const reply=await request("getBindings.do",{clientId,bindingType:"R",language:"bg"});
    if (!accepted(reply) || !Array.isArray(reply.bindings)) throw invalid();
    return reply.bindings.some(binding => binding?.bindingId === bindingId);
  }
  async function disableBinding({clientId,bindingId}) {
    if(!await isRecurringBinding({clientId,bindingId}))return true;
    const reply=await request("unBindCard.do",{bindingId,language:"bg"});
    if(!accepted(reply) || await isRecurringBinding({clientId,bindingId}))throw invalid();
    return true;
  }
  return { register, getStatus, chargeRecurring, isRecurringBinding, disableBinding };
}

module.exports = { createDskLiveGateway, validateLiveCheckoutUrl, DskLiveGatewayError };
