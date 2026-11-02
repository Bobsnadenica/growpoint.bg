"use strict";

// Preparation only: not wired to any route or deployed for live payments.
// Callers must persist and reconcile purchases before calling this module.
// A browser return is never proof of payment.
const BANK_ORIGIN = "https://epg.dskbank.bg";
const RETURN_ORIGIN = "https://www.growpoint.bg";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REFERENCE = /^[A-Za-z0-9_-]{1,36}$/;
const VALID_AMOUNTS = new Set([999, 2999, 9999]);
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
  if (typeof orderNumber !== "string" || !REFERENCE.test(orderNumber) || !VALID_AMOUNTS.has(amountMinor)) {
    throw new DskLiveGatewayError("DSK_LIVE_INVALID_ORDER", false);
  }
}

function validateLiveCheckoutUrl(value, orderId) {
  bankId(orderId);
  let url;
  try { url = new URL(value); } catch { throw invalid(); }
  const pathAllowed = url.pathname === "/payment/merchants/multiecom/payment.html" ||
    /^\/payment\/(?:payment\/)?merchants\/[A-Za-z0-9_-]+\/payment_(?:bg|en)\.html$/.test(url.pathname);
  const keys = [...url.searchParams.keys()];
  if (url.origin !== BANK_ORIGIN || url.username || url.password || url.hash || !pathAllowed ||
      keys.filter(key => key === "mdOrder").length !== 1 || keys.some(key => !["mdOrder", "language"].includes(key)) ||
      keys.filter(key => key === "language").length > 1 || url.searchParams.get("mdOrder") !== orderId ||
      (url.searchParams.has("language") && !["bg", "en"].includes(url.searchParams.get("language")))) throw invalid();
  return url.href;
}

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
    return reply.success;
  }
  return code === undefined || code === 0;
}

function createDskLiveGateway({ userName, password, token, fetchImpl = globalThis.fetch, timeoutMs = 8000 } = {}) {
  const userAuth = typeof userName === "string" && userName.length > 0 && userName.length <= 50 && typeof password === "string" && password.length > 0 && password.length <= 128 && !/[\u0000-\u001f\u007f]/.test(userName + password);
  const tokenAuth = typeof token === "string" && token.length > 0 && token.length <= 4096 && !/[\u0000-\u001f\u007f]/.test(token);
  if (userAuth === tokenAuth || (tokenAuth && (userName !== undefined || password !== undefined)) ||
      (userAuth && token !== undefined) || typeof fetchImpl !== "function" || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000) {
    throw new DskLiveGatewayError("DSK_LIVE_INVALID_CONFIGURATION", false);
  }
  const auth = userAuth ? { userName, password } : { token };
  async function request(method, fields) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const reply = await fetchImpl(`${BANK_ORIGIN}/payment/rest/${method}`, {
        method: "POST", redirect: "error", signal: controller.signal,
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: new URLSearchParams({ ...auth, ...fields })
      });
      return await readReply(reply);
    } catch (error) {
      if (error instanceof DskLiveGatewayError) throw error;
      // Do not log bank responses, credentials, card data, or raw network errors.
      throw new DskLiveGatewayError("DSK_LIVE_REQUEST_FAILED");
    } finally { clearTimeout(timer); }
  }
  async function register({ orderNumber, checkoutId, amountMinor }) {
    assertOrder(orderNumber, amountMinor);
    if (typeof checkoutId !== "string" || !UUID.test(checkoutId)) throw new DskLiveGatewayError("DSK_LIVE_INVALID_ORDER", false);
    const returnUrl = `${RETURN_ORIGIN}/dashboard?payment=${encodeURIComponent(checkoutId)}`;
    const reply = await request("register.do", {
      orderNumber, amount: String(amountMinor), currency: "978", returnUrl, failUrl: returnUrl,
      language: "bg", sessionTimeoutSecs: "1200", description: "GrowPoint expert membership"
    });
    if (!accepted(reply)) {
      // A duplicate reference can mean a previous request succeeded before a
      // timeout. Reconcile it by reference; never treat it as a fresh failure.
      if (own(reply, "errorCode") && number(reply.errorCode) === 1) throw new DskLiveGatewayError("DSK_LIVE_DUPLICATE_ORDER");
      throw new DskLiveGatewayError("DSK_LIVE_REGISTRATION_REJECTED", false);
    }
    const gatewayOrderId = bankId(reply.orderId);
    return { gatewayOrderId, checkoutUrl: validateLiveCheckoutUrl(reply.formUrl, gatewayOrderId) };
  }
  async function getStatus({ orderNumber, amountMinor, gatewayOrderId }) {
    assertOrder(orderNumber, amountMinor);
    if (gatewayOrderId !== undefined) bankId(gatewayOrderId);
    const reply = await request("getOrderStatusExtended.do", gatewayOrderId === undefined ? { orderNumber, language: "bg" } : { orderId: gatewayOrderId, language: "bg" });
    if (!accepted(reply)) throw new DskLiveGatewayError("DSK_LIVE_STATUS_UNAVAILABLE");
    if (reply.orderNumber !== orderNumber || number(reply.amount) !== amountMinor || number(reply.currency) !== 978) throw invalid();
    const attributes = Array.isArray(reply.attributes) ? reply.attributes.filter(item => item?.name === "mdOrder") : [];
    if (attributes.length !== 1) throw invalid();
    const verifiedId = bankId(attributes[0].value);
    if ((gatewayOrderId !== undefined && verifiedId !== gatewayOrderId) || (own(reply, "orderId") && reply.orderId !== verifiedId)) throw invalid();
    const bankStatus = number(reply.orderStatus), actionCode = number(reply.actionCode, true);
    let status = ({ 0: "created", 1: "authorized", 2: "succeeded", 3: "cancelled", 4: "refunded", 5: "pending", 6: "failed", 7: "pending", 8: "pending" })[bankStatus] || "unknown";
    if (bankStatus === 2) {
      if (actionCode !== 0) throw invalid();
      const amounts = reply.paymentAmountInfo;
      // Missing refund/deposit evidence is not equivalent to zero. In
      // particular, never grant access to a partly refunded transaction.
      if (!amounts || typeof amounts !== "object" || Array.isArray(amounts) ||
          !own(amounts, "depositedAmount") || !own(amounts, "refundedAmount") ||
          number(amounts.depositedAmount) !== amountMinor || amounts.paymentState !== "DEPOSITED") throw invalid();
      const refunded = number(amounts.refundedAmount);
      if (refunded > amountMinor) throw invalid();
      if (refunded) status = refunded === amountMinor ? "refunded" : "partially_refunded";
    }
    return { gatewayOrderId: verifiedId, status, bankStatus, actionCode };
  }
  return { register, getStatus };
}

module.exports = { createDskLiveGateway, validateLiveCheckoutUrl, DskLiveGatewayError };
