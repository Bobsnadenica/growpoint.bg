#!/usr/bin/env node
/**
 * Removes only consultants explicitly marked `isExample: true` and their
 * matching slug-claim rows. Dry-run by default.
 *
 * Usage:
 *   AWS_REGION=eu-west-1 CONSULTANTS_TABLE=your-table \
 *     node scripts/remove-example-consultants.cjs
 *
 * Apply after reviewing the dry run:
 *   AWS_REGION=eu-west-1 CONSULTANTS_TABLE=your-table \
 *     node scripts/remove-example-consultants.cjs --apply
 */
const path = require("node:path");

const sdkRoot = path.join(__dirname, "..", "backend", "api", "node_modules");
const { DynamoDBClient } = require(path.join(sdkRoot, "@aws-sdk", "client-dynamodb"));
const {
  DynamoDBDocumentClient,
  GetCommand,
  ScanCommand,
  TransactWriteCommand
} = require(path.join(sdkRoot, "@aws-sdk", "lib-dynamodb"));

const REGION = process.env.AWS_REGION || "eu-west-1";
const TABLE = process.env.CONSULTANTS_TABLE || "growpoint-dev-consultants";
const APPLY = process.argv.includes("--apply");
const SLUG_CLAIM_PREFIX = "slug-claim#";
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

async function listExamples() {
  const items = [];
  let ExclusiveStartKey;

  do {
    const result = await dynamo.send(
      new ScanCommand({
        TableName: TABLE,
        FilterExpression: "isExample = :example",
        ExpressionAttributeValues: { ":example": true },
        ProjectionExpression: "consultantId, slug, ownerUserId, isExample",
        ExclusiveStartKey
      })
    );
    items.push(...(result.Items || []));
    ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  return items.sort((left, right) => String(left.slug).localeCompare(String(right.slug)));
}

async function assertMatchingSlugClaim(item) {
  if (!item.consultantId || !item.slug || !item.ownerUserId) {
    throw new Error(`Example row ${item.consultantId || "(missing id)"} is missing ownership metadata.`);
  }

  const claimId = `${SLUG_CLAIM_PREFIX}${item.slug}`;
  const result = await dynamo.send(
    new GetCommand({ TableName: TABLE, Key: { consultantId: claimId } })
  );
  const claim = result.Item;

  if (!claim || claim.ownerUserId !== item.ownerUserId) {
    throw new Error(`Slug claim for ${item.slug} is missing or belongs to another profile.`);
  }

  return claimId;
}

async function removeExample(item) {
  const claimId = await assertMatchingSlugClaim(item);

  await dynamo.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Delete: {
            TableName: TABLE,
            Key: { consultantId: item.consultantId },
            ConditionExpression: "isExample = :example",
            ExpressionAttributeValues: { ":example": true }
          }
        },
        {
          Delete: {
            TableName: TABLE,
            Key: { consultantId: claimId },
            ConditionExpression: "ownerUserId = :owner",
            ExpressionAttributeValues: { ":owner": item.ownerUserId }
          }
        }
      ]
    })
  );
}

(async () => {
  const examples = await listExamples();
  console.log(`${APPLY ? "Removing" : "[dry-run] Found"} ${examples.length} example consultant(s) in ${TABLE}.`);

  for (const item of examples) {
    console.log(`  - ${item.slug || item.consultantId}`);
  }

  if (!APPLY || examples.length === 0) {
    if (!APPLY && examples.length) console.log("Re-run with --apply to remove only these explicitly marked records.");
    return;
  }

  let removed = 0;
  for (const item of examples) {
    await removeExample(item);
    removed += 1;
  }

  console.log(`Removed ${removed} example consultant(s) and their matching slug claims.`);
})().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
