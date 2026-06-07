#!/usr/bin/env node
/**
 * Rolls the availability of the seeded example consultants forward so the
 * public directory always shows real, bookable upcoming slots instead of
 * stale past dates. Only touches rows with isExample === true and only
 * rewrites `availability`, `nextAvailable`, and `updatedAt`. Real consultant
 * profiles are never modified.
 *
 * Dry run (default — prints what would change, writes nothing):
 *   AWS_REGION=eu-west-1 \
 *   CONSULTANTS_TABLE=careerdoc-dev-consultants \
 *   node scripts/refresh-example-availability.cjs
 *
 * Apply:
 *   AWS_REGION=eu-west-1 \
 *   CONSULTANTS_TABLE=careerdoc-dev-consultants \
 *   node scripts/refresh-example-availability.cjs --apply
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
const TABLE = process.env.CONSULTANTS_TABLE || "careerdoc-dev-consultants";
const APPLY = process.argv.includes("--apply");

// Span roughly the next two weeks; weekends are skipped below so the actual
// booked days are work days only.
const DAY_OFFSETS = [1, 2, 4, 7, 9, 11, 14];
const FALLBACK_HOURS = [10, 14, 17];

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

function uniqueHours(slots) {
  const hours = new Set();
  for (const slot of slots || []) {
    const date = new Date(slot);
    if (!Number.isNaN(date.getTime())) hours.add(date.getHours());
  }
  const list = Array.from(hours).sort((a, b) => a - b);
  return list.length ? list : FALLBACK_HOURS;
}

function futureSlots(hours) {
  const out = [];
  const now = new Date();
  for (const offset of DAY_OFFSETS) {
    const day = new Date(now);
    day.setDate(day.getDate() + offset);
    const weekday = day.getDay();
    if (weekday === 0 || weekday === 6) continue; // skip Sat/Sun
    for (const hour of hours) {
      const slot = new Date(day);
      slot.setHours(hour, 0, 0, 0);
      if (slot.getTime() > now.getTime()) out.push(slot.toISOString());
    }
  }
  return out;
}

function getNextAvailable(slots) {
  const now = Date.now();
  const future = slots
    .map((s) => new Date(s).getTime())
    .filter((t) => Number.isFinite(t) && t > now)
    .sort((a, b) => a - b);
  return future.length ? new Date(future[0]).toISOString() : "";
}

function countFuture(slots) {
  const now = Date.now();
  return (slots || []).filter((s) => new Date(s).getTime() > now).length;
}

async function scanExamples() {
  const items = [];
  let ExclusiveStartKey;
  do {
    const result = await dynamo.send(
      new ScanCommand({
        TableName: TABLE,
        FilterExpression: "isExample = :true",
        ExpressionAttributeValues: { ":true": true },
        ExclusiveStartKey
      })
    );
    for (const item of result.Items || []) {
      if (typeof item.consultantId === "string" && item.consultantId.startsWith("slug-claim#")) continue;
      items.push(item);
    }
    ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

(async () => {
  console.log(
    `${APPLY ? "Refreshing" : "[dry-run] Would refresh"} example availability in ${TABLE} (region=${REGION})...\n`
  );

  const examples = await scanExamples();
  if (!examples.length) {
    console.log("No example consultants found.");
    return;
  }

  let updated = 0;
  let failed = 0;

  for (const item of examples) {
    const hours = uniqueHours(item.availability);
    const availability = futureSlots(hours);
    const nextAvailable = getNextAvailable(availability);
    const beforeFuture = countFuture(item.availability);

    console.log(
      `  ${item.slug || item.consultantId}\n` +
        `    before: ${(item.availability || []).length} slots (${beforeFuture} future), nextAvailable=${item.nextAvailable || "—"}\n` +
        `    after:  ${availability.length} slots (all future), nextAvailable=${nextAvailable || "—"}`
    );

    if (!APPLY) continue;

    try {
      await dynamo.send(
        new UpdateCommand({
          TableName: TABLE,
          Key: { consultantId: item.consultantId },
          UpdateExpression: "SET availability = :a, nextAvailable = :n, updatedAt = :now",
          ExpressionAttributeValues: {
            ":a": availability,
            ":n": nextAvailable,
            ":now": new Date().toISOString()
          }
        })
      );
      updated += 1;
    } catch (error) {
      console.error(`    ✗ failed: ${error.message || error}`);
      failed += 1;
    }
  }

  console.log(
    `\n${APPLY ? "Done." : "[dry-run] Nothing written."} examples=${examples.length} updated=${updated} failed=${failed}`
  );
  if (!APPLY) console.log("Re-run with --apply to write these changes.");
  if (failed > 0) process.exit(1);
})();
