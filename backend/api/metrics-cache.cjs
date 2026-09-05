const { randomUUID } = require("node:crypto");
const { GetCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const CACHE_SECONDS = 900;

// Shared, on-demand snapshot: zero refresh jobs when nobody views statistics.
// A short lease prevents concurrent Lambda instances from scanning together.
function createMetricsCache({ dynamo, table, collect, now = Date.now }) {
  const Key = { userId: "system#monitoring-snapshot" };
  return async function metrics({ revision = "", context } = {}) {
    const seconds = Math.floor(now() / 1000);
    const { Item } = await dynamo.send(new GetCommand({ TableName: table, Key, ConsistentRead: true }));
    const decorate = (payload, stale = false) => ({ ...payload, snapshot: { refreshMinutes: 15, stale } });
    if (Item?.payload && Item.validUntil > seconds && (Item.identityRevision || "") === revision) return decorate(Item.payload);
    const lease = randomUUID();
    try {
      await dynamo.send(new UpdateCommand({ TableName: table, Key,
        UpdateExpression: "SET leaseId = :lease, leaseUntil = :until",
        ConditionExpression: "attribute_not_exists(leaseUntil) OR leaseUntil < :now",
        ExpressionAttributeValues: { ":lease": lease, ":until": seconds + 35, ":now": seconds }
      }));
    } catch (error) {
      if (error.name !== "ConditionalCheckFailedException") throw error;
      if (Item?.payload && (Item.identityRevision || "") === revision) return decorate(Item.payload, true);
      throw Object.assign(new Error("Статистиката се обновява. Опитай отново след малко."), { statusCode: 409 });
    }
    try {
      const payload = await collect(context);
      await dynamo.send(new UpdateCommand({ TableName: table, Key,
        UpdateExpression: "SET payload = :payload, validUntil = :until, identityRevision = :revision REMOVE leaseId, leaseUntil",
        ConditionExpression: "leaseId = :lease",
        ExpressionAttributeValues: { ":payload": payload, ":until": seconds + CACHE_SECONDS, ":lease": lease, ":revision": revision }
      }));
      return decorate(payload);
    } catch (error) {
      await dynamo.send(new UpdateCommand({ TableName: table, Key,
        UpdateExpression: "REMOVE leaseId, leaseUntil", ConditionExpression: "leaseId = :lease", ExpressionAttributeValues: { ":lease": lease }
      })).catch(() => {});
      throw error;
    }
  };
}
module.exports = { createMetricsCache };
