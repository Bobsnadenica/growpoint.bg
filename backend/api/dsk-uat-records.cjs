"use strict";

const { ScanCommand, DeleteCommand } = require("@aws-sdk/lib-dynamodb");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = new Set(["created", "pending", "authorized", "succeeded", "failed", "cancelled", "refunded", "unknown"]);
const EXPORT_FIELDS = ["userId", "kind", "ownerId", "checkoutId", "status", "amountMinor", "currency", "createdAt", "verifiedAt"];

function createDskUatRecords({ dynamo, table }) {
  function ownerPrefix(ownerId) {
    if (typeof ownerId !== "string" || !UUID.test(ownerId)) throw new Error("Sandbox records require an exact account identifier.");
    return `system#dsk-uat#${ownerId}#`;
  }

  async function ownerRows(ownerId, fields) {
    const prefix = ownerPrefix(ownerId);
    const names = Object.fromEntries(fields.map((field, index) => [`#f${index}`, field]));
    const rows = [];
    let ExclusiveStartKey;
    // ponytail: infrequent export/deletion scans avoid a new index or service;
    // move sandbox rows to a partitioned key only if this table becomes large.
    do {
      const page = await dynamo.send(new ScanCommand({
        TableName: table, ConsistentRead: true, ExclusiveStartKey,
        FilterExpression: "begins_with(#f0, :prefix)",
        ProjectionExpression: Object.keys(names).join(", "),
        ExpressionAttributeNames: names, ExpressionAttributeValues: { ":prefix": prefix },
      }));
      for (const row of page.Items || []) {
        if (typeof row.userId !== "string" || !row.userId.startsWith(prefix) || !UUID.test(row.userId.slice(prefix.length))) {
          throw new Error("Unexpected record outside the exact sandbox owner namespace.");
        }
        rows.push(row);
      }
      ExclusiveStartKey = page.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return rows;
  }

  async function listForExport(ownerId) {
    const rows = await ownerRows(ownerId, EXPORT_FIELDS);
    return rows.map(row => {
      if (row.kind !== "dsk-uat" || row.ownerId !== ownerId || row.checkoutId !== row.userId.slice(ownerPrefix(ownerId).length) ||
          row.amountMinor !== 100 || row.currency !== "EUR") throw new Error("Invalid sandbox owner record.");
      return {
        checkoutId: row.checkoutId, status: row.status === "registering" ? "pending" : STATUSES.has(row.status) ? row.status : "unknown",
        amountMinor: row.amountMinor, currency: row.currency,
        ...(typeof row.createdAt === "string" && Number.isFinite(Date.parse(row.createdAt)) ? { createdAt: new Date(row.createdAt).toISOString() } : {}),
        ...(typeof row.verifiedAt === "string" && Number.isFinite(Date.parse(row.verifiedAt)) ? { verifiedAt: new Date(row.verifiedAt).toISOString() } : {}),
      };
    });
  }

  async function purge(ownerId) {
    // Collect every page before deleting; a scan failure leaves cleanup retryable.
    const rows = await ownerRows(ownerId, ["userId"]);
    for (const row of rows) await dynamo.send(new DeleteCommand({ TableName: table, Key: { userId: row.userId } }));
    await dynamo.send(new DeleteCommand({ TableName: table, Key: { userId: `system#dsk-uat-rate#${ownerId}` } }));
    return { deletedCheckouts: rows.length };
  }

  return { listForExport, purge };
}

module.exports = { createDskUatRecords };
