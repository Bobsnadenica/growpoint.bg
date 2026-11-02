"use strict";

// Preparation only: this order ledger has no settlement, entitlement, refund,
// or lock-release flow yet and must not be exposed to customer traffic.
const { createHash } = require("node:crypto");
const { GetCommand, TransactWriteCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { validateLiveCheckoutUrl } = require("./dsk-live-gateway.cjs");

// Server-owned prices for a single expert-package purchase, in euro cents.
const PRICES = Object.freeze({ start: 999, grow: 2999, spotlight: 9999 });
const UUID4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const failure = (message, statusCode) => Object.assign(new Error(message), { statusCode });

function createDskLiveOrders({ dynamo, usersTable, consultantsTable, now = () => new Date() }) {
  function key(checkoutId) { return { userId: `system#dsk-live#${checkoutId}` }; }
  function lockKey(ownerId) { return { userId: `system#dsk-live-lock#${createHash("sha256").update(ownerId).digest("hex")}` }; }
  async function read(ownerId, checkoutId) {
    if (!UUID4.test(checkoutId || "")) throw failure("Невалиден идентификатор за плащане.", 400);
    const { Item } = await dynamo.send(new GetCommand({ TableName: usersTable, Key: key(checkoutId.toLowerCase()), ConsistentRead: true }));
    if (!Item || Item.kind !== "dsk-live" || Item.ownerId !== ownerId) return null;
    return Item;
  }
  async function create(ownerId, consultantId, body) {
    if (typeof ownerId !== "string" || !ownerId || typeof consultantId !== "string" || !consultantId ||
        !body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(k => !["checkoutId", "tier"].includes(k)) ||
        !UUID4.test(body.checkoutId || "") || !ownPrice(body.tier)) throw failure("Невалидна заявка за пакет.", 400);
    const checkoutId = body.checkoutId.toLowerCase();
    const previous = await read(ownerId, checkoutId);
    if (previous) {
      if (previous.tier !== body.tier || previous.consultantId !== consultantId) throw failure("Идентификаторът вече се използва за друга заявка.", 409);
      return previous;
    }
    const createdAt = now().toISOString();
    const record = {
      ...key(checkoutId), kind: "dsk-live", ownerId, consultantId, checkoutId, tier: body.tier,
      amountMinor: PRICES[body.tier], currency: "EUR", status: "registering", createdAt,
      orderNumber: `gp-${createHash("sha256").update(`${ownerId}:${checkoutId}`).digest("hex").slice(0, 30)}`
    };
    try {
      await dynamo.send(new TransactWriteCommand({ TransactItems: [
        { Put: { TableName: usersTable, Item: record, ConditionExpression: "attribute_not_exists(userId)" } },
        { Put: { TableName: usersTable, Item: { ...lockKey(ownerId), kind: "dsk-live-lock", checkoutId, createdAt }, ConditionExpression: "attribute_not_exists(userId)" } },
        { ConditionCheck: { TableName: usersTable, Key: { userId: ownerId }, ConditionExpression: "attribute_exists(userId) AND (attribute_not_exists(identityDeleted) OR identityDeleted = :no) AND (attribute_not_exists(identityDisabled) OR identityDisabled = :no) AND (attribute_not_exists(restricted) OR restricted = :no) AND attribute_not_exists(deletionScheduledAt)", ExpressionAttributeValues: { ":no": false } } },
        { ConditionCheck: { TableName: consultantsTable, Key: { consultantId }, ConditionExpression: "attribute_exists(consultantId) AND ownerUserId = :owner AND (attribute_not_exists(restricted) OR restricted = :no) AND (attribute_not_exists(identityDeleted) OR identityDeleted = :no) AND (attribute_not_exists(identityDisabled) OR identityDisabled = :no) AND attribute_not_exists(deletionScheduledAt) AND attribute_not_exists(anonymizedAt)", ExpressionAttributeValues: { ":owner": ownerId, ":no": false } } }
      ] }));
      return record;
    } catch (error) {
      if (error.name !== "TransactionCanceledException") throw error;
      const duplicate = await read(ownerId, checkoutId);
      if (duplicate && duplicate.tier === body.tier && duplicate.consultantId === consultantId) return duplicate;
      throw failure("Вече има активна заявка или профилът не е достъпен. Провери статуса и опитай отново.", 409);
    }
  }
  async function attachRegistration(ownerId, checkoutId, registration) {
    const order = await read(ownerId, checkoutId);
    if (!order) throw failure("Плащането не е намерено.", 404);
    if (!registration || typeof registration !== "object") throw failure("Невалиден банков отговор.", 502);
    const url = validateLiveCheckoutUrl(registration.checkoutUrl, registration.gatewayOrderId);
    try {
      await dynamo.send(new UpdateCommand({
        TableName: usersTable, Key: key(order.checkoutId),
        UpdateExpression: "SET #status = :created, gatewayOrderId = :gateway, checkoutUrl = :url, updatedAt = :now",
        ConditionExpression: "#status = :registering AND ownerId = :owner AND kind = :kind",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":created": "created", ":registering": "registering", ":owner": ownerId, ":kind": "dsk-live", ":gateway": registration.gatewayOrderId, ":url": url, ":now": now().toISOString() }
      }));
      return { ...order, status: "created", gatewayOrderId: registration.gatewayOrderId, checkoutUrl: url };
    } catch (error) {
      if (error.name !== "ConditionalCheckFailedException") throw error;
      const current = await read(ownerId, checkoutId);
      if (current && current.gatewayOrderId === registration.gatewayOrderId && current.checkoutUrl === url) return current;
      throw failure("Състоянието на плащането се промени. Обнови страницата.", 409);
    }
  }
  return { create, read, attachRegistration };
}

function ownPrice(tier) { return typeof tier === "string" && Object.hasOwn(PRICES, tier); }
module.exports = { createDskLiveOrders, PRICES };
