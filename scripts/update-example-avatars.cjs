#!/usr/bin/env node
/**
 * Backfill avatarUrl on already-seeded example consultants by slug.
 * Looks up the consultant via the slug-index GSI, then UpdateCommand-s avatarUrl.
 *
 * Run:
 *   AWS_REGION=eu-west-1 \
 *   CONSULTANTS_TABLE=careerdoc-dev-consultants \
 *   node scripts/update-example-avatars.cjs
 */
const path = require("node:path");

const sdkRoot = path.join(__dirname, "..", "backend", "api", "node_modules");
const { DynamoDBClient } = require(path.join(sdkRoot, "@aws-sdk", "client-dynamodb"));
const {
  DynamoDBDocumentClient,
  QueryCommand,
  UpdateCommand
} = require(path.join(sdkRoot, "@aws-sdk", "lib-dynamodb"));

const REGION = process.env.AWS_REGION || "eu-west-1";
const TABLE = process.env.CONSULTANTS_TABLE || "careerdoc-dev-consultants";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

const avatars = {
  "elena-petrova-career-leadership": "https://randomuser.me/api/portraits/women/44.jpg",
  "georgi-dimitrov-tech-careers": "https://randomuser.me/api/portraits/men/32.jpg",
  "maria-stoyanova-pivot-coach": "https://randomuser.me/api/portraits/women/65.jpg",
  "ivan-todorov-startup-mentor": "https://randomuser.me/api/portraits/men/52.jpg",
  "ana-koleva-design-careers": "https://randomuser.me/api/portraits/women/26.jpg",
  "petar-andreev-finance-careers": "https://randomuser.me/api/portraits/men/77.jpg",
  "vesela-mihaylova-hr-mentor": "https://randomuser.me/api/portraits/women/8.jpg",
  "nikolay-georgiev-data-science": "https://randomuser.me/api/portraits/men/14.jpg",
  "kalina-ivanova-marketing-coach": "https://randomuser.me/api/portraits/women/79.jpg",
  "dimitar-petkov-product-management": "https://randomuser.me/api/portraits/men/41.jpg"
};

async function findConsultantBySlug(slug) {
  const result = await dynamo.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: "slug-index",
      KeyConditionExpression: "slug = :slug",
      ExpressionAttributeValues: { ":slug": slug },
      Limit: 1
    })
  );
  return result.Items?.[0] || null;
}

async function updateAvatar(slug, avatarUrl) {
  const consultant = await findConsultantBySlug(slug);
  if (!consultant) {
    console.log(`  · ${slug} → not found, skipping`);
    return { skipped: true };
  }
  await dynamo.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { consultantId: consultant.consultantId },
      UpdateExpression: "SET avatarUrl = :a, updatedAt = :now",
      ExpressionAttributeValues: {
        ":a": avatarUrl,
        ":now": new Date().toISOString()
      }
    })
  );
  console.log(`  ✓ ${slug} → ${avatarUrl}`);
  return { ok: true };
}

(async () => {
  console.log(`Updating avatars on example consultants in ${TABLE} (region=${REGION})...`);
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  for (const [slug, url] of Object.entries(avatars)) {
    try {
      const result = await updateAvatar(slug, url);
      if (result.ok) updated += 1;
      else if (result.skipped) skipped += 1;
    } catch (error) {
      console.error(`  ✗ ${slug} → ${error.message || error}`);
      failed += 1;
    }
  }
  console.log(`\nDone. updated=${updated} skipped=${skipped} failed=${failed}`);
  if (failed > 0) process.exit(1);
})();
