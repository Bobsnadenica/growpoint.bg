#!/usr/bin/env node
/**
 * One-off: grandfather existing consultants into the new paid/invite model.
 *
 * Approval is being removed — a consultant is now public only if their account
 * is "active" (comped/invited or paid). To keep every currently-approved profile
 * live, this sets `comped: true` on consultant rows whose legacy
 * profileStatus === "approved". Idempotent; never touches other rows.
 *
 * Run:
 *   AWS_REGION=eu-west-1 CONSULTANTS_TABLE=growpoint-dev-consultants \
 *   node scripts/grandfather-comped-consultants.cjs          # dry run
 *   ... node scripts/grandfather-comped-consultants.cjs --apply
 */
const path = require("node:path");

const sdkRoot = path.join(__dirname, "..", "backend", "api", "node_modules");
const { DynamoDBClient } = require(path.join(sdkRoot, "@aws-sdk", "client-dynamodb"));
const {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand
} = require(path.join(sdkRoot, "@aws-sdk", "lib-dynamodb"));

const REGION = process.env.AWS_REGION || "eu-west-1";
const TABLE = process.env.CONSULTANTS_TABLE || "growpoint-dev-consultants";
const APPLY = process.argv.includes("--apply");
const SLUG_CLAIM_PREFIX = "slug#";

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

(async () => {
  console.log(`${APPLY ? "APPLY" : "DRY RUN"}  table=${TABLE}  region=${REGION}`);
  let key;
  let scanned = 0;
  let toGrandfather = 0;
  let updated = 0;
  do {
    const page = await doc.send(new ScanCommand({ TableName: TABLE, ExclusiveStartKey: key }));
    for (const item of page.Items || []) {
      scanned += 1;
      const id = String(item.consultantId || "");
      if (!id || id.startsWith(SLUG_CLAIM_PREFIX)) continue;
      if (item.profileStatus !== "approved") continue;
      if (item.comped === true) continue;
      toGrandfather += 1;
      console.log(`  grandfather: ${item.slug || id} (${item.name || "?"})`);
      if (APPLY) {
        await doc.send(
          new UpdateCommand({
            TableName: TABLE,
            Key: { consultantId: id },
            UpdateExpression: "SET comped = :t, compedReason = :r, updatedAt = :now",
            ExpressionAttributeValues: {
              ":t": true,
              ":r": "grandfathered",
              ":now": new Date().toISOString()
            }
          })
        );
        updated += 1;
      }
    }
    key = page.LastEvaluatedKey;
  } while (key);

  console.log(
    `\nscanned=${scanned}  approved-needing-comp=${toGrandfather}  updated=${updated}${APPLY ? "" : "  (dry run — re-run with --apply)"}`
  );
})().catch((err) => {
  console.error("Failed:", err.message || err);
  process.exit(1);
});
