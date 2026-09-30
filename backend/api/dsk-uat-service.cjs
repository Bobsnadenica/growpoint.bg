"use strict";

const { createHash } = require("node:crypto");
const { GetCommand, TransactWriteCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const AMOUNT_MINOR = 100;
const error = (message, statusCode) => Object.assign(new Error(message), { statusCode });

// Synthetic bank orders only: never touches an account, booking, notification,
// package, card data or payment entitlement. System rows are excluded from metrics.
function createDskUatService({ dynamo, table, adapter, now = () => new Date() }) {
  function key(ownerId, checkoutId) {
    if (!ownerId || !UUID.test(checkoutId || "")) throw error("Невалиден тестов идентификатор.", 400);
    return { userId: `system#dsk-uat#${ownerId}#${checkoutId.toLowerCase()}` };
  }

  async function read(ownerId, checkoutId) {
    const { Item } = await dynamo.send(new GetCommand({ TableName: table, Key: key(ownerId, checkoutId), ConsistentRead: true }));
    return Item;
  }

  function summary(item) {
    return {
      checkoutId: item.checkoutId, status: item.status === "registering" ? "pending" : item.status,
      amountMinor: AMOUNT_MINOR, currency: "EUR", testMode: true,
      ...(item.checkoutUrl && ["created", "pending"].includes(item.status) ? { checkoutUrl: item.checkoutUrl } : {}),
      ...(item.verifiedAt ? { verifiedAt: item.verifiedAt } : {}),
      ...(Number.isSafeInteger(item.actionCode) ? { actionCode: String(item.actionCode) } : {})
    };
  }

  async function save(item, result, retries = 0) {
    const next = {
      status: result.status, version: item.version + 1, updatedAt: now().toISOString(),
      gatewayOrderId: result.gatewayOrderId || item.gatewayOrderId || null,
      checkoutUrl: result.checkoutUrl || item.checkoutUrl || null,
      verifiedAt: result.verifiedAt || null,
      actionCode: Number.isSafeInteger(result.actionCode) ? result.actionCode : null
    };
    try {
      await dynamo.send(new UpdateCommand({
        TableName: table, Key: { userId: item.userId },
        UpdateExpression: "SET #status = :status, #version = :nextVersion, updatedAt = :updatedAt, gatewayOrderId = :gatewayOrderId, checkoutUrl = :checkoutUrl, verifiedAt = :verifiedAt, actionCode = :actionCode",
        ConditionExpression: "#version = :version AND #kind = :kind",
        ExpressionAttributeNames: { "#status": "status", "#version": "version", "#kind": "kind" },
        ExpressionAttributeValues: Object.fromEntries([
          ...Object.entries(next).map(([name, value]) => [name === "version" ? ":nextVersion" : `:${name}`, value]),
          [":version", item.version], [":kind", "dsk-uat"]
        ])
      }));
      return summary({ ...item, ...next });
    } catch (value) {
      if (value.name !== "ConditionalCheckFailedException") throw value;
      const latest = await read(item.ownerId, item.checkoutId);
      if (!latest) throw error("Тестът не е намерен.", 404);
      // A status lookup can win while registration is still returning. Keep
      // its latest status and merge only validated bank identity/URL when no
      // conflicting identity exists (including an earlier lookup outage).
      if (retries < 2 && result.checkoutUrl && !latest.checkoutUrl &&
          (!latest.gatewayOrderId || latest.gatewayOrderId === result.gatewayOrderId)) {
        return save(latest, { ...latest, gatewayOrderId: result.gatewayOrderId, checkoutUrl: result.checkoutUrl }, retries + 1);
      }
      return summary(latest);
    }
  }

  async function create(ownerId, body) {
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(name => name !== "checkoutId")) {
      throw error("Изпрати само тестов идентификатор. Сумата се определя от сървъра.", 400);
    }
    const checkoutId = String(body.checkoutId || "").toLowerCase();
    const itemKey = key(ownerId, checkoutId);
    const existing = await read(ownerId, checkoutId);
    if (existing) return summary(existing); // Idempotent: never registers again.
    const createdAt = now();
    const item = {
      ...itemKey, kind: "dsk-uat", ownerId, checkoutId, status: "registering", version: 0,
      amountMinor: AMOUNT_MINOR, currency: "EUR", createdAt: createdAt.toISOString(),
      orderNumber: `gp-uat-${createHash("sha256").update(`${ownerId}:${checkoutId}`).digest("hex").slice(0,26)}`
    };
    try {
      await dynamo.send(new TransactWriteCommand({ TransactItems: [
        { Put: { TableName: table, Item: item, ConditionExpression: "attribute_not_exists(userId)" } },
        { Update: {
          TableName: table, Key: { userId: `system#dsk-uat-rate#${ownerId}` },
          UpdateExpression: "SET lastCreatedAtMs = :now",
          ConditionExpression: "attribute_not_exists(lastCreatedAtMs) OR lastCreatedAtMs <= :cutoff",
          ExpressionAttributeValues: { ":now": createdAt.getTime(), ":cutoff": createdAt.getTime() - 60000 }
        } },
        { ConditionCheck: {
          TableName: table, Key: { userId: ownerId },
          ConditionExpression: "attribute_exists(userId) AND (attribute_not_exists(identityDeleted) OR identityDeleted = :no) AND (attribute_not_exists(identityDisabled) OR identityDisabled = :no) AND (attribute_not_exists(restricted) OR restricted = :no) AND attribute_not_exists(deletionScheduledAt)",
          ExpressionAttributeValues: { ":no": false }
        } }
      ] }));
    } catch (value) {
      if (value.name !== "TransactionCanceledException") throw value;
      const duplicate = await read(ownerId, checkoutId);
      if (duplicate) return summary(duplicate);
      if (value.CancellationReasons?.[2]?.Code === "ConditionalCheckFailed") throw error("Акаунтът не е активен.", 403);
      throw error("Изчакай една минута преди нов тест.", 429);
    }
    let result;
    try {
      result = await adapter.register({ orderNumber: item.orderNumber, returnUrl: `https://www.growpoint.bg/admin?paymentTest=${checkoutId}` });
    } catch (value) {
      result = { status: value.name === "DskUatError" && value.ambiguous === false ? "failed" : "unknown" };
    }
    return save(item, result);
  }

  async function get(ownerId, checkoutId) {
    const item = await read(ownerId, checkoutId);
    if (!item || item.kind !== "dsk-uat") throw error("Тестът не е намерен.", 404);
    const age = now().getTime() - new Date(item.createdAt).getTime();
    if (item.status === "registering" && age < 20000) return summary(item);
    if (item.verifiedAt && now().getTime() - new Date(item.verifiedAt).getTime() < 3000) return summary(item);
    let result;
    try {
      result = await adapter.getStatus({ orderNumber: item.orderNumber, ...(item.gatewayOrderId ? { orderId: item.gatewayOrderId } : {}) });
    } catch { result = { status: "unknown" }; }
    return save(item, result);
  }

  return { create, get };
}

module.exports = { createDskUatService };
