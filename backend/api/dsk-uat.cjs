"use strict";

// An isolated one-phase sandbox adapter. It never grants production entitlements.
const UAT_ORIGIN = "https://uat.dskbank.bg";
const RETURN_ORIGIN = "https://www.growpoint.bg";
const AMOUNT_MINOR = 100;
const CURRENCY_NUMERIC = "978";
const MAX_REPLY_BYTES = 64 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const has = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

class DskUatError extends Error {
  constructor(code, { ambiguous = false, gatewayCode } = {}) {
    super(code);
    this.name = "DskUatError";
    this.code = code;
    this.ambiguous = ambiguous;
    if (gatewayCode !== undefined) this.gatewayCode = gatewayCode;
  }
}

function invalidReply() {
  return new DskUatError("DSK_UAT_REPLY_INVALID", { ambiguous: true });
}

function integer(value, { negative = false } = {}) {
  if (typeof value === "string" && (negative ? /^-?\d+$/ : /^\d+$/).test(value)) value = Number(value);
  if (typeof value !== "number" || !Number.isSafeInteger(value) || (!negative && value < 0)) throw invalidReply();
  return value;
}

function orderReference(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,36}$/.test(value)) throw new DskUatError("DSK_UAT_ORDER_REFERENCE_INVALID");
  return value;
}

function gatewayId(value) {
  if (typeof value !== "string" || !UUID.test(value)) throw invalidReply();
  return value;
}

function returnAddress(value) {
  let url;
  try { url = new URL(value); } catch { throw new DskUatError("DSK_UAT_RETURN_URL_INVALID"); }
  if (url.origin !== RETURN_ORIGIN || url.username || url.password || url.hash || url.pathname !== "/admin" ||
      [...url.searchParams.keys()].length !== 1 || !UUID.test(url.searchParams.get("paymentTest") || "")) {
    throw new DskUatError("DSK_UAT_RETURN_URL_INVALID");
  }
  return url.href;
}

function validateCheckoutUrl(value, orderId) {
  gatewayId(orderId);
  let url;
  try { url = new URL(value); } catch { throw invalidReply(); }
  // The current merchant's official register reply uses this shared form with
  // a language parameter; older documented merchant forms use mdOrder alone.
  const sharedForm = url.pathname === "/payment/merchants/multiecom/payment.html";
  const allowedKeys = sharedForm ? ["mdOrder", "language"] : ["mdOrder"];
  const keys = [...url.searchParams.keys()];
  if (url.origin !== UAT_ORIGIN || url.username || url.password || url.hash ||
      (!sharedForm && !/^\/payment\/(?:payment\/)?merchants\/[A-Za-z0-9_-]+\/payment_(?:bg|en)\.html$/.test(url.pathname)) ||
      keys.length !== allowedKeys.length || !keys.every(key => allowedKeys.includes(key)) ||
      url.searchParams.get("mdOrder") !== orderId || (sharedForm && !["bg", "en"].includes(url.searchParams.get("language")))) throw invalidReply();
  return url.href;
}

function processingResult(reply) {
  let code;
  if (has(reply, "errorCode")) {
    code = integer(reply.errorCode);
    if (code > 99) throw invalidReply();
  }
  // The gateway explicitly gives success precedence over errorCode.
  if (has(reply, "success")) {
    if (typeof reply.success !== "boolean") throw invalidReply();
    return { ok: reply.success, code };
  }
  return { ok: code === undefined || code === 0, code };
}

async function readReply(response) {
  if (response.status !== 200 || !/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") || "")) {
    throw new DskUatError("DSK_UAT_REQUEST_FAILED", { ambiguous: true });
  }
  const declaredBytes = Number(response.headers.get("content-length"));
  if (declaredBytes > MAX_REPLY_BYTES) throw invalidReply();
  const reader = response.body?.getReader();
  if (!reader) throw invalidReply();
  const chunks = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_REPLY_BYTES) {
        await reader.cancel();
        throw invalidReply();
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const joined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
  let reply;
  try { reply = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(joined)); } catch { throw invalidReply(); }
  if (!reply || typeof reply !== "object" || Array.isArray(reply)) throw invalidReply();
  return reply;
}

function createDskUatAdapter(options = {}) {
  const { userName, password, fetchImpl = globalThis.fetch, timeoutMs = 8000, now = () => new Date() } = options;
  if (has(options, "token") || typeof userName !== "string" || !userName.length || userName.length > 50 ||
      typeof password !== "string" || !password.length || password.length > 30 ||
      /[\u0000-\u001f\u007f]/.test(userName + password) || typeof fetchImpl !== "function" ||
      !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000 || typeof now !== "function") {
    throw new DskUatError("DSK_UAT_CONFIG_INVALID");
  }

  async function request(method, fields) {
    // Never take a caller-supplied endpoint, method, credentials, or monetary value.
    const body = new URLSearchParams({ userName, password, ...fields });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${UAT_ORIGIN}/payment/rest/${method}`, {
        method: "POST", redirect: "error", signal: controller.signal,
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body,
      });
      return await readReply(response);
    } catch (error) {
      if (error instanceof DskUatError) throw error;
      // Never copy network errors, gateway descriptions, or response bodies into logs/errors.
      throw new DskUatError("DSK_UAT_REQUEST_FAILED", { ambiguous: true });
    } finally { clearTimeout(timer); }
  }

  function result(orderNumber, extra) {
    return { testMode: true, amountMinor: AMOUNT_MINOR, currency: "EUR", orderNumber, ...extra };
  }

  async function getStatus({ orderNumber, orderId } = {}) {
    orderReference(orderNumber);
    if (orderId !== undefined) gatewayId(orderId);
    const reply = await request("getOrderStatusExtended.do", orderId === undefined ? { orderNumber, language: "bg" } : { orderId, language: "bg" });
    const processing = processingResult(reply);
    if (!processing.ok) throw new DskUatError("DSK_UAT_STATUS_UNAVAILABLE", { ambiguous: true, gatewayCode: processing.code });
    if (reply.orderNumber !== orderNumber || integer(reply.amount) !== AMOUNT_MINOR || integer(reply.currency) !== Number(CURRENCY_NUMERIC)) throw invalidReply();
    const ids = Array.isArray(reply.attributes) ? reply.attributes.filter(item => item?.name === "mdOrder") : [];
    if (ids.length !== 1) throw invalidReply();
    const verifiedId = gatewayId(ids[0].value);
    if (orderId !== undefined && verifiedId !== orderId) throw invalidReply();
    if (has(reply, "orderId") && reply.orderId !== verifiedId) throw invalidReply();
    const actionCode = integer(reply.actionCode, { negative: true });
    const bankOrderStatus = integer(reply.orderStatus);
    const statuses = { 0: "created", 1: "authorized", 2: "succeeded", 3: "cancelled", 4: "refunded", 5: "pending", 6: "failed", 7: "pending", 8: "pending" };
    let status = statuses[bankOrderStatus] || "unknown";
    if (bankOrderStatus === 2) {
      if (actionCode !== 0) throw invalidReply();
      const amounts = reply.paymentAmountInfo;
      if (amounts !== undefined) {
        if (!amounts || typeof amounts !== "object" || Array.isArray(amounts) ||
            (has(amounts, "depositedAmount") && integer(amounts.depositedAmount) !== AMOUNT_MINOR) ||
            (has(amounts, "refundedAmount") && integer(amounts.refundedAmount) !== 0) ||
            (has(amounts, "paymentState") && amounts.paymentState !== "DEPOSITED")) throw invalidReply();
      }
    }
    // Probe-confirmed canonical UAT form, never an arbitrary merchant path.
    // Recover it only after the bank verifies reference, amount, currency and
    // identity above, and only while the order is still awaiting first payment.
    const checkoutUrl = bankOrderStatus === 0
      ? validateCheckoutUrl(`${UAT_ORIGIN}/payment/merchants/multiecom/payment.html?mdOrder=${verifiedId}&language=bg`, verifiedId)
      : undefined;
    return result(orderNumber, { status, gatewayOrderId: verifiedId, bankOrderStatus, actionCode, verifiedAt: now().toISOString(), ...(checkoutUrl ? { checkoutUrl } : {}) });
  }

  async function recover(orderNumber) {
    try { return { ...await getStatus({ orderNumber }), recovered: true }; }
    catch { return result(orderNumber, { status: "unknown", recovered: false }); }
  }

  async function register({ orderNumber, returnUrl } = {}) {
    orderReference(orderNumber);
    returnUrl = returnAddress(returnUrl);
    let reply;
    try {
      reply = await request("register.do", {
        orderNumber, amount: String(AMOUNT_MINOR), currency: CURRENCY_NUMERIC,
        returnUrl, failUrl: returnUrl, language: "bg", sessionTimeoutSecs: "1200",
        description: "GrowPoint UAT synthetic payment - no production entitlement",
      });
      const processing = processingResult(reply);
      if (!processing.ok) {
        if (processing.code === 1) return recover(orderNumber);
        throw new DskUatError("DSK_UAT_REGISTRATION_REJECTED", { gatewayCode: processing.code });
      }
      const orderId = gatewayId(reply.orderId);
      const checkoutUrl = validateCheckoutUrl(reply.formUrl, orderId);
      return result(orderNumber, { status: "created", gatewayOrderId: orderId, checkoutUrl, recovered: false });
    } catch (error) {
      if (error instanceof DskUatError && !error.ambiguous) throw error;
      return recover(orderNumber);
    }
  }

  return { register, getStatus };
}

module.exports = { createDskUatAdapter, DskUatError, validateCheckoutUrl, AMOUNT_MINOR, CURRENCY_NUMERIC };
