const { randomUUID } = require("node:crypto");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  TransactWriteCommand,
  UpdateCommand
} = require("@aws-sdk/lib-dynamodb");
const {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { SESv2Client, SendEmailCommand } = require("@aws-sdk/client-sesv2");
const {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand
} = require("@aws-sdk/client-cognito-identity-provider");

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});
const ses = new SESv2Client({});
const cognito = new CognitoIdentityProviderClient({});

const env = {
  usersTable: process.env.USERS_TABLE,
  consultantsTable: process.env.CONSULTANTS_TABLE,
  bookingsTable: process.env.BOOKINGS_TABLE,
  userPoolId: process.env.USER_POOL_ID || "",
  cvBucket: process.env.CV_BUCKET,
  allowedOrigin: process.env.ALLOWED_ORIGIN || "https://www.growpoint.bg",
  allowedOrigins: String(
    process.env.ALLOWED_ORIGINS ||
      process.env.ALLOWED_ORIGIN ||
      "https://www.growpoint.bg"
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  sesFromEmail: process.env.SES_FROM_EMAIL || "",
  appUrl: process.env.APP_URL || "https://www.growpoint.bg/"
};

let activeRequestOrigin = "";

function headerValue(headers, name) {
  const expected = String(name || "").toLowerCase();
  const match = Object.entries(headers || {}).find(
    ([key]) => String(key || "").toLowerCase() === expected
  );
  return match ? String(match[1] || "") : "";
}

function corsOrigin() {
  if (activeRequestOrigin && env.allowedOrigins.includes(activeRequestOrigin)) {
    return activeRequestOrigin;
  }
  return env.allowedOrigins[0] || env.allowedOrigin;
}

function appUrl(path = "") {
  const rawBase = String(env.appUrl || "https://www.growpoint.bg/").trim();
  const base = rawBase.endsWith("/") ? rawBase : `${rawBase}/`;
  const normalizedPath = String(path || "").replace(/^\/+/, "");

  try {
    return new URL(normalizedPath, base).toString();
  } catch {
    return `${base}${normalizedPath}`;
  }
}

const APP_DASHBOARD_URL = appUrl("dashboard/");
const APP_USERS_URL = appUrl("users/");
const CONTACT_EMAIL = "contactus@growpoint.bg";
const BGN_PER_EUR = 1.95583;
const PRICE_TIER_STEP_EUR = 50;
const CONSULTANT_STATUS_INDEX = "profile-status-index";

const CONSULTANT_PROFILE_THEMES = new Set(["violet", "sky", "rose", "mint", "amber"]);
const USER_ROLES = new Set(["client", "consultant"]);
const CONSULTANT_PROFILE_TYPES = new Set(["consultant", "mentor"]);
const PLAN_TIERS = new Set(["free", "pro"]);
const ALLOWED_PROFILE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_DOCUMENT_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain"
]);
const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;
const MAX_USER_TOTAL_DOCUMENT_BYTES = 50 * 1024 * 1024;
const MAX_USER_DOCUMENTS = 50;
const ACCOUNT_DELETION_DELAY_DAYS = 7;
const CONSULTANT_PROFILE_STATUSES = new Set(["pending", "approved", "rejected"]);
const ADMIN_GROUP = "admin";
const CONSULTANT_GROUP = "consultants";
const CLIENT_GROUP = "clients";
const VISITS_ITEM_ID = "system#visits";

function response(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": corsOrigin(),
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
      "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      "Vary": "Origin",
      // Defense-in-depth headers. Even though API responses are JSON consumed
      // by fetch(), an attacker who tricks a victim into pasting a URL into
      // the browser or who finds an HTML-injection sink would otherwise rely
      // on these being unset. Cheap to set, defends multiple sinks.
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
      "Cache-Control": "no-store",
      ...extraHeaders
    },
    body: JSON.stringify(body)
  };
}

function badRequest(message) {
  return response(400, { message });
}

function forbidden(message) {
  return response(403, { message });
}

function notFound(message) {
  return response(404, { message });
}

function parseBody(event) {
  if (!event.body) {
    return {};
  }

  try {
    return JSON.parse(event.body);
  } catch {
    throw Object.assign(new Error("Request body must be valid JSON."), {
      statusCode: 400
    });
  }
}

function getClaims(event) {
  return event.requestContext?.authorizer?.jwt?.claims || null;
}

function requireAuth(event) {
  const claims = getClaims(event);

  if (!claims || !claims.sub) {
    throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  }

  return claims;
}

function getClaimGroups(claims) {
  const raw = claims?.["cognito:groups"];
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((value) => String(value).trim()).filter(Boolean);
  return String(raw)
    .replace(/^\[|\]$/g, "")
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function isAdmin(claims) {
  return getClaimGroups(claims).includes(ADMIN_GROUP);
}

function requireAdmin(event) {
  const claims = requireAuth(event);

  if (!isAdmin(claims)) {
    throw Object.assign(new Error("Admin access required."), { statusCode: 403 });
  }

  return claims;
}

const NOTIFICATION_TYPES = new Set([
  "booking_requested",
  "booking_accepted",
  "booking_declined",
  "booking_cancelled",
  "booking_rescheduled",
  "booking_reminder",
  "session_confirmed",
  "message_received",
  "admin_message",
  "review_received"
]);

const NOTIFICATION_KEEP = 50;
const BOOKING_MESSAGE_KEEP = 200;

async function appendUserNotification(userId, notification) {
  if (!userId || !notification) return null;
  if (!NOTIFICATION_TYPES.has(notification.type)) return null;

  const payload = {
    id: `n-${randomUUID()}`,
    type: notification.type,
    title: String(notification.title || "").slice(0, 160),
    body: String(notification.body || "").slice(0, 400),
    href: notification.href || "/dashboard",
    createdAt: new Date().toISOString()
  };

  try {
    // Append and let the read-side trim to NOTIFICATION_KEEP. DynamoDB has no
    // native "limit list size" expression, but on the next read we slice the
    // tail and overwrite the user record if it ballooned past the cap.
    await dynamo.send(
      new UpdateCommand({
        TableName: env.usersTable,
        Key: { userId },
        UpdateExpression:
          "SET notifications = list_append(if_not_exists(notifications, :empty), :item)",
        ExpressionAttributeValues: {
          ":empty": [],
          ":item": [payload]
        }
      })
    );
    return payload;
  } catch (error) {
    console.error("[notify] append failed", {
      userId,
      type: notification.type,
      error: error?.message || error
    });
    return null;
  }
}

async function getUserBySub(userId) {
  const result = await dynamo.send(
    new GetCommand({
      TableName: env.usersTable,
      Key: { userId },
      ConsistentRead: true
    })
  );

  return result.Item || null;
}

// --- Points / rewards (clients only) ----------------------------------------
// Users earn points for engagement and spend 100 for a free consultation.
const POINTS = Object.freeze({
  profileComplete: 20,
  referral: 30,
  sessionConfirmed: 10,
  review: 10,
  freeConsultation: 100
});
const POINTS_HISTORY_KEEP = 50;
const REFERRAL_PREFIX = "referral#";

function generateReferralCode() {
  return randomUUID().replace(/-/g, "").slice(0, 8);
}

function normalizeReferralCode(value) {
  return String(value || "").trim().toLowerCase();
}

function pointsHistoryEntry(amount, type, reason) {
  return {
    id: `p-${randomUUID()}`,
    type,
    points: amount,
    reason: String(reason || "").slice(0, 160),
    createdAt: new Date().toISOString()
  };
}

// Atomically add (or subtract) points and append a capped history entry.
async function addPointsEntry(userId, amount, type, reason) {
  if (!userId || !Number.isFinite(amount) || amount === 0) return;
  try {
    await dynamo.send(
      new UpdateCommand({
        TableName: env.usersTable,
        Key: { userId },
        UpdateExpression:
          "SET points = if_not_exists(points, :zero) + :amt, " +
          "pointsHistory = list_append(if_not_exists(pointsHistory, :empty), :entry)",
        ExpressionAttributeValues: {
          ":zero": 0,
          ":amt": amount,
          ":empty": [],
          ":entry": [pointsHistoryEntry(amount, type, reason)]
        }
      })
    );
  } catch (error) {
    console.error("[points] add failed", { userId, type, error: error?.message || error });
  }
}

// Award `amount` once, guarded by a boolean flag on the user record. Returns
// true only on the first award (so callers can chain referral payouts etc.).
async function awardOnceUser(userId, flagAttr, amount, type, reason) {
  if (!userId) return false;
  try {
    await dynamo.send(
      new UpdateCommand({
        TableName: env.usersTable,
        Key: { userId },
        UpdateExpression:
          "SET points = if_not_exists(points, :zero) + :amt, #flag = :true, " +
          "pointsHistory = list_append(if_not_exists(pointsHistory, :empty), :entry)",
        ConditionExpression: "attribute_not_exists(#flag) OR #flag <> :true",
        ExpressionAttributeNames: { "#flag": flagAttr },
        ExpressionAttributeValues: {
          ":zero": 0,
          ":amt": amount,
          ":true": true,
          ":empty": [],
          ":entry": [pointsHistoryEntry(amount, type, reason)]
        }
      })
    );
    return true;
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") return false;
    console.error("[points] awardOnce failed", { userId, flagAttr, error: error?.message || error });
    return false;
  }
}

// Spend points with a balance guard (no negative balances under races).
async function spendPoints(userId, amount, type, reason) {
  try {
    await dynamo.send(
      new UpdateCommand({
        TableName: env.usersTable,
        Key: { userId },
        UpdateExpression:
          "SET points = points - :amt, " +
          "pointsHistory = list_append(if_not_exists(pointsHistory, :empty), :entry)",
        ConditionExpression: "points >= :amt",
        ExpressionAttributeValues: {
          ":amt": amount,
          ":empty": [],
          ":entry": [pointsHistoryEntry(-amount, type, reason)]
        }
      })
    );
    return true;
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") return false;
    throw error;
  }
}

// Set a boolean flag on a booking only if unset; true on first set. Used to make
// per-booking point awards (and refunds) idempotent.
async function setBookingFlagOnce(bookingId, flagAttr) {
  try {
    await dynamo.send(
      new UpdateCommand({
        TableName: env.bookingsTable,
        Key: { bookingId },
        UpdateExpression: "SET #flag = :true",
        ConditionExpression: "attribute_not_exists(#flag)",
        ExpressionAttributeNames: { "#flag": flagAttr },
        ExpressionAttributeValues: { ":true": true }
      })
    );
    return true;
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") return false;
    throw error;
  }
}

// Set a boolean flag on a user once (no points). True on first set.
async function setUserFlagOnce(userId, flagAttr) {
  try {
    await dynamo.send(
      new UpdateCommand({
        TableName: env.usersTable,
        Key: { userId },
        UpdateExpression: "SET #flag = :true",
        ConditionExpression: "attribute_not_exists(#flag) OR #flag <> :true",
        ExpressionAttributeNames: { "#flag": flagAttr },
        ExpressionAttributeValues: { ":true": true }
      })
    );
    return true;
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") return false;
    throw error;
  }
}

// Client profile completeness (0-100). 100% earns the profile-complete bonus.
function computeUserProfileCompletion(user) {
  const has = (value) =>
    Array.isArray(value)
      ? value.length > 0
      : typeof value === "string"
        ? value.trim().length > 0
        : value != null && value !== "";
  const checks = [
    has(user.name),
    has(user.avatarUrl) || has(user.avatarStorageKey),
    has(user.city),
    has(user.occupation),
    has(user.bio),
    has(user.goals)
  ];
  const filled = checks.filter(Boolean).length;
  return Math.round((filled / checks.length) * 100);
}

// Validate + normalize a consultant-provided meeting link (https/http only).
function normalizeMeetingLink(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    return raw.slice(0, 2000);
  } catch {
    return "";
  }
}

// The meeting link is released to the client only once the booking is paid for
// (Stripe later), redeemed with points ("free"), or an admin marks it paid.
function isBookingPaid(booking) {
  return booking?.paymentStatus === "free" || booking?.paymentStatus === "paid";
}

// Refund the 100 points spent on a free consultation if the booking is
// declined/cancelled before it happens. Idempotent (pointsRefunded flag).
async function refundFreePointsIfNeeded(booking) {
  if (!booking || booking.freeViaPoints !== true || booking.pointsRefunded === true) {
    return;
  }
  if (await setBookingFlagOnce(booking.bookingId, "pointsRefunded")) {
    await addPointsEntry(
      booking.clientId,
      POINTS.freeConsultation,
      "refund",
      "Върнати точки за отменена безплатна консултация"
    );
  }
}

// Award the one-time profile-completion bonus (+ referral payout) the first time
// a client reaches 100%. Called on profile SAVE *and* READ, so accounts that were
// already complete before the points feature get credited on their next load.
// Returns the points delta added to this user (0 or POINTS.profileComplete).
async function awardProfileCompletionIfEligible(userId, user) {
  if (!user || user.role !== "client") return 0;
  if (user.awardedProfileComplete === true) return 0;
  if (computeUserProfileCompletion(user) !== 100) return 0;

  const first = await awardOnceUser(
    userId,
    "awardedProfileComplete",
    POINTS.profileComplete,
    "profile",
    "Попълнен профил на 100%"
  );
  if (!first) return 0;

  if (user.referredByUserId && user.referralCredited !== true) {
    const credited = await setUserFlagOnce(userId, "referralCredited");
    if (credited) {
      await addPointsEntry(
        user.referredByUserId,
        POINTS.referral,
        "referral",
        "Покана: приятел завърши профила си"
      );
      await appendUserNotification(user.referredByUserId, {
        type: "admin_message",
        title: `Спечели ${POINTS.referral} точки от покана`,
        body: "Приятел, когото покани, завърши профила си в GrowPoint."
      });
    }
  }
  return POINTS.profileComplete;
}

// Resolve a referral code -> owner userId via a mapping row (referral#<code>).
async function resolveReferralCode(code) {
  const normalized = normalizeReferralCode(code);
  if (!normalized) return null;
  const row = await getUserBySub(`${REFERRAL_PREFIX}${normalized}`);
  return row?.refUserId || null;
}

async function putReferralMapping(userId, code) {
  const normalized = normalizeReferralCode(code);
  if (!userId || !normalized) return false;

  try {
    await dynamo.send(
      new PutCommand({
        TableName: env.usersTable,
        Item: {
          userId: `${REFERRAL_PREFIX}${normalized}`,
          recordType: "referral",
          refUserId: userId
        },
        ConditionExpression: "attribute_not_exists(userId)"
      })
    );
    return true;
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") {
      const existing = await getUserBySub(`${REFERRAL_PREFIX}${normalized}`);
      return existing?.refUserId === userId;
    }
    console.error("[referral] mapping write failed", error?.message || error);
    return false;
  }
}

// Ensure the user has a referral code and an O(1) lookup mapping row. Returns
// the code. Idempotent.
async function ensureReferralCode(userId, existingCode) {
  const existing = normalizeReferralCode(existingCode);
  if (existing && await putReferralMapping(userId, existing)) {
    return existing;
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateReferralCode();
    if (await putReferralMapping(userId, code)) {
      return code;
    }
  }

  const fallback = `${generateReferralCode()}${Date.now().toString(36).slice(-4)}`;
  await putReferralMapping(userId, fallback);
  return fallback;
}

async function getConsultantBySlug(slug) {
  const normalizedSlug = normalizeSlug(decodePathSegment(slug), String(slug || ""));
  const result = await dynamo.send(
    new QueryCommand({
      TableName: env.consultantsTable,
      IndexName: "slug-index",
      KeyConditionExpression: "slug = :slug",
      ExpressionAttributeValues: {
        ":slug": normalizedSlug
      },
      Limit: 5
    })
  );

  const items = result.Items || [];
  if (!items.length) return null;
  // Legacy data sometimes has multiple rows on the same slug from before
  // slug-claim atomicity was added. Prefer a visible (approved + public)
  // match, falling back to the first row so the visibility check downstream
  // still rejects unapproved drafts cleanly with a 404.
  return items.find(isVisibleConsultant) || items[0];
}

const SLUG_CLAIM_PREFIX = "slug-claim#";

function slugClaimId(slug) {
  return `${SLUG_CLAIM_PREFIX}${slug}`;
}

class SlugConflictError extends Error {
  constructor(slug) {
    super(`Slug already in use: ${slug}`);
    this.name = "SlugConflictError";
    this.slug = slug;
  }
}

async function putConsultantWithSlugClaim({ consultant, previousSlug = null }) {
  const transactItems = [];
  const now = new Date().toISOString();

  if (consultant.slug && consultant.slug !== previousSlug) {
    transactItems.push({
      Put: {
        TableName: env.consultantsTable,
        Item: {
          consultantId: slugClaimId(consultant.slug),
          ownerUserId: consultant.ownerUserId,
          claimedAt: now
        },
        ConditionExpression: "attribute_not_exists(consultantId)"
      }
    });
  }

  transactItems.push({
    Put: {
      TableName: env.consultantsTable,
      Item: consultant
    }
  });

  if (previousSlug && previousSlug !== consultant.slug) {
    transactItems.push({
      Delete: {
        TableName: env.consultantsTable,
        Key: { consultantId: slugClaimId(previousSlug) }
      }
    });
  }

  try {
    await dynamo.send(new TransactWriteCommand({ TransactItems: transactItems }));
  } catch (error) {
    if (error.name === "TransactionCanceledException") {
      throw new SlugConflictError(consultant.slug);
    }
    throw error;
  }
}

async function putConsultantDraftWithUniqueSlug(draft) {
  let attempt = 0;
  let candidate = { ...draft };

  while (attempt < 5) {
    try {
      await putConsultantWithSlugClaim({ consultant: candidate });
      return candidate;
    } catch (error) {
      if (!(error instanceof SlugConflictError)) {
        throw error;
      }
      attempt += 1;
      const suffix = randomUUID().slice(0, 6);
      candidate = { ...candidate, slug: `${draft.slug}-${suffix}` };
    }
  }

  throw new SlugConflictError(draft.slug);
}

function getConsultantTimestamp(consultant) {
  const updatedAt = new Date(consultant?.updatedAt || consultant?.createdAt || 0).getTime();
  return Number.isFinite(updatedAt) ? updatedAt : 0;
}

function getCanonicalConsultantScore(consultant) {
  if (!isConsultantRecord(consultant)) return -1;

  let score = 0;
  const textFields = [
    consultant.name,
    consultant.headline,
    consultant.bio,
    consultant.experienceSummary,
    consultant.city,
    consultant.workApproach
  ];
  const listFields = [
    consultant.experienceHighlights,
    consultant.educationHighlights,
    consultant.languages,
    consultant.specializations,
    consultant.sessionModes,
    consultant.tags,
    consultant.idealFor,
    consultant.consultationTopics,
    consultant.availability
  ];

  for (const value of textFields) {
    if (String(value || "").trim()) score += 10;
  }

  for (const value of listFields) {
    if (Array.isArray(value) && value.some((item) => String(item || "").trim())) score += 12;
  }

  if (consultant.avatarUrl || consultant.avatarStorageKey) score += 8;
  if (consultant.heroUrl || consultant.heroStorageKey) score += 4;
  if (normalizeConsultantPriceEur(consultant) > 0) score += 6;
  if (Number(consultant.experienceYears) > 0) score += 4;
  if (consultant.profileStatus === "approved") score += 90;
  if (consultant.isPublic === true) score += 30;
  if (isConsultantProfileReadyForAutoApprove(consultant)) score += 140;
  if (isVisibleConsultant(consultant)) score += 220;

  return score;
}

function chooseCanonicalConsultant(consultants) {
  return [...(consultants || [])]
    .filter(isConsultantRecord)
    .sort((left, right) => {
      const scoreDelta = getCanonicalConsultantScore(right) - getCanonicalConsultantScore(left);
      if (scoreDelta !== 0) return scoreDelta;
      return getConsultantTimestamp(right) - getConsultantTimestamp(left);
    })[0] || null;
}

async function listConsultantsByOwner(ownerUserId) {
  const items = [];
  let exclusiveStartKey;
  let pages = 0;

  do {
    const result = await dynamo.send(
      new QueryCommand({
        TableName: env.consultantsTable,
        IndexName: "owner-index",
        KeyConditionExpression: "ownerUserId = :ownerUserId",
        ExpressionAttributeValues: {
          ":ownerUserId": ownerUserId
        },
        Limit: 100,
        ExclusiveStartKey: exclusiveStartKey
      })
    );

    items.push(...(result.Items || []).filter(isConsultantRecord));
    exclusiveStartKey = result.LastEvaluatedKey;
    pages += 1;
  } while (exclusiveStartKey && pages < 10);

  return items;
}

async function getConsultantByOwner(ownerUserId) {
  return chooseCanonicalConsultant(await listConsultantsByOwner(ownerUserId));
}

function dedupeConsultantsByOwner(consultants) {
  const byOwner = new Map();
  const withoutOwner = [];

  for (const consultant of consultants || []) {
    if (!isConsultantRecord(consultant)) continue;

    const ownerUserId = String(consultant.ownerUserId || "").trim();
    if (!ownerUserId) {
      withoutOwner.push(consultant);
      continue;
    }

    const current = byOwner.get(ownerUserId);
    byOwner.set(ownerUserId, chooseCanonicalConsultant([current, consultant]));
  }

  return [...byOwner.values(), ...withoutOwner].filter(Boolean);
}

function normalizeStringList(value, fallback = [], limit = 24, maxLength = 120) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  return Array.from(
    new Set(
      value
        .map((item) => String(item || "").trim().slice(0, maxLength))
        .filter(Boolean)
    )
  ).slice(0, limit);
}

function normalizeText(value, fallback = "", maxLength = 1200) {
  if (typeof value === "undefined" || value === null) {
    return fallback;
  }

  return String(value).trim().slice(0, maxLength);
}

function normalizeBoundedNumber(value, fallback, { min = 0, max = 1000, integer = false } = {}) {
  if (typeof value === "undefined" || value === null || value === "") {
    return fallback;
  }

  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }

  const bounded = Math.min(max, Math.max(min, number));
  return integer ? Math.round(bounded) : Math.round(bounded * 100) / 100;
}

function roundUpPriceTierEur(value) {
  const number = normalizeBoundedNumber(value, 0, { min: 0, max: 2500 });
  if (!number) return 0;
  return Math.min(2500, Math.ceil(number / PRICE_TIER_STEP_EUR) * PRICE_TIER_STEP_EUR);
}

function normalizeConsultantPriceEur(consultantOrValue, fallback = 0) {
  if (
    consultantOrValue &&
    typeof consultantOrValue === "object" &&
    !Array.isArray(consultantOrValue)
  ) {
    const explicit = normalizeBoundedNumber(consultantOrValue.priceEur, null, {
      min: 0,
      max: 2500
    });
    if (explicit !== null) return roundUpPriceTierEur(explicit);

    const legacyBgn = normalizeBoundedNumber(consultantOrValue.priceBgn, null, {
      min: 0,
      max: 5000
    });
    return legacyBgn === null ? roundUpPriceTierEur(fallback) : roundUpPriceTierEur(legacyBgn / BGN_PER_EUR);
  }

  return roundUpPriceTierEur(
    normalizeBoundedNumber(consultantOrValue, fallback, { min: 0, max: 2500 })
  );
}

function normalizeUserRole(value, fallback = "client") {
  const role = String(value || "").trim().toLowerCase();
  return USER_ROLES.has(role) ? role : fallback;
}

function normalizePlanTier(value, fallback = "free") {
  const plan = String(value || "").trim().toLowerCase();
  return PLAN_TIERS.has(plan) ? plan : fallback;
}

function normalizeConsultantProfileType(value, fallback = "consultant") {
  const profileType = String(value || "").trim().toLowerCase();
  return CONSULTANT_PROFILE_TYPES.has(profileType) ? profileType : fallback;
}

function normalizeConsultantTheme(value, fallback = "") {
  if (typeof value === "undefined") {
    return fallback;
  }

  if (value === null || value === "") {
    return "";
  }

  const theme = String(value || "").trim().toLowerCase();
  return CONSULTANT_PROFILE_THEMES.has(theme) ? theme : fallback;
}

const MAX_AVAILABILITY_SLOTS = 400;

function normalizeAvailabilitySlots(value, fallback = []) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  return Array.from(
    new Set(
      value
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .filter((item) => !Number.isNaN(new Date(item).getTime()))
    )
  )
    .sort((left, right) => new Date(left).getTime() - new Date(right).getTime())
    .slice(0, MAX_AVAILABILITY_SLOTS);
}

function getNextAvailableSlot(value, fallback = "") {
  const availability = normalizeAvailabilitySlots(value, []);
  const cutoff = Date.now() - 5 * 60 * 1000;

  return (
    availability.find((item) => new Date(item).getTime() >= cutoff) ||
    availability[0] ||
    fallback
  );
}

function formatBookingDateTimeBg(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value || "");
  }
  try {
    return new Intl.DateTimeFormat("bg-BG", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: "Europe/Sofia"
    }).format(parsed);
  } catch {
    return parsed.toISOString();
  }
}

function appendEmailFooter(text) {
  return `${String(text || "").trim()}\n\nС уважение,\nЕкипът на GrowPoint\n${appUrl()}\n${CONTACT_EMAIL}`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function textToEmailHtml(text) {
  return `<html><body style="margin:0;padding:0;background:#eef2ef;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1b2722;">
  <div style="max-width:560px;margin:0 auto;padding:28px 22px;">
    <div style="background:#ffffff;border:1px solid #d7ddd9;border-radius:18px;padding:24px;box-shadow:0 16px 36px rgba(15,23,42,0.08);">
      <p style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#56695f;margin:0 0 16px;">GrowPoint</p>
      <p style="font-size:15px;line-height:1.65;color:#1b2722;margin:0;">${escapeHtml(text).replace(/\n/g, "<br>")}</p>
    </div>
  </div>
</body></html>`;
}

async function sendEmail({ to, subject, text, html }) {
  if (!env.sesFromEmail) {
    console.log("[email] skipped (SES_FROM_EMAIL not set)", { to, subject });
    return;
  }
  if (!to) {
    return;
  }
  const textBody = appendEmailFooter(text);
  try {
    const body = {
      Text: { Data: textBody, Charset: "UTF-8" }
    };

    if (html) {
      body.Html = { Data: html, Charset: "UTF-8" };
    } else {
      body.Html = { Data: textToEmailHtml(textBody), Charset: "UTF-8" };
    }

    await ses.send(
      new SendEmailCommand({
        FromEmailAddress: env.sesFromEmail,
        ReplyToAddresses: [CONTACT_EMAIL],
        Destination: { ToAddresses: [to] },
        Content: {
          Simple: {
            Subject: { Data: subject, Charset: "UTF-8" },
            Body: body
          }
        }
      })
    );
  } catch (error) {
    console.error("[email] send failed", { to, subject, error: error?.message || error });
  }
}

async function sendBookingRequestedEmails({ consultantOwner, consultant, client, booking }) {
  const when = formatBookingDateTimeBg(booking.scheduledAt);
  const noteLine = booking.note ? `\n\nБележка от потребителя:\n${booking.note}` : "";

  const tasks = [];

  if (consultantOwner?.email) {
    tasks.push(
      sendEmail({
        to: consultantOwner.email,
        subject: `Нова заявка за консултация от ${client.name || client.email}`,
        text:
          `Здравей, ${consultantOwner.name || consultant.name},\n\n` +
          `${client.name || client.email} (${client.email}) заяви консултация с теб.\n\n` +
          `Час: ${when}\n` +
          `Продължителност: ${consultant.sessionLengthMinutes || 60} минути\n` +
          `Статус: чака потвърждение${noteLine}\n\n` +
          `Отвори таблото си, за да приемеш или откажеш заявката:\n` +
          `${APP_DASHBOARD_URL}`
      })
    );
  }

  if (client?.email) {
    tasks.push(
      sendEmail({
        to: client.email,
        subject: `Заявката ти за консултация с ${consultant.name} е изпратена`,
        text:
          `Здравей, ${client.name || ""},\n\n` +
          `Заявката ти за консултация с ${consultant.name} е изпратена и чака потвърждение.\n\n` +
          `Час: ${when}\n` +
          `Продължителност: ${consultant.sessionLengthMinutes || 60} минути\n` +
          `Формат: ${(consultant.sessionModes || []).join(", ") || "Онлайн"}\n\n` +
          `Ще получиш отделно известие, когато консултантът приеме или откаже заявката.\n\n` +
          `Виж заявките си в таблото: ${APP_DASHBOARD_URL}`
      })
    );
  }

  await Promise.allSettled(tasks);
}

async function sendBookingAcceptedEmails({ consultantOwner, consultant, client, booking }) {
  const when = formatBookingDateTimeBg(booking.scheduledAt);

  const tasks = [];

  if (client?.email) {
    tasks.push(
      sendEmail({
        to: client.email,
        subject: `${consultant.name} потвърди резервацията ти`,
        text:
          `Здравей, ${client.name || ""},\n\n` +
          `${consultant.name} потвърди заявката ти за консултация.\n\n` +
          `Час: ${when}\n` +
          `Продължителност: ${consultant.sessionLengthMinutes || 60} минути\n` +
          `Формат: ${(consultant.sessionModes || []).join(", ") || "Онлайн"}\n\n` +
          `Ще получиш напомняне 24 часа преди срещата.\n\n` +
          `Табло: ${APP_DASHBOARD_URL}`
      })
    );
  }

  if (consultantOwner?.email) {
    tasks.push(
      sendEmail({
        to: consultantOwner.email,
        subject: `Потвърди консултация с ${booking.clientName || "потребител"}`,
        text:
          `Здравей, ${consultantOwner.name || consultant.name},\n\n` +
          `Ти потвърди заявката за консултация:\n\n` +
          `Час: ${when}\n` +
          `Потребител: ${booking.clientName || ""} (${booking.clientEmail || ""})\n` +
          (booking.note ? `Бележка: ${booking.note}\n` : "") +
          `\nЩе получиш напомняне 24 часа преди срещата.\n\n` +
          `Табло: ${APP_DASHBOARD_URL}`
      })
    );
  }

  await Promise.allSettled(tasks);
}

async function sendBookingRescheduledEmails({
  consultantOwner,
  consultant,
  client,
  booking,
  previousScheduledAt,
  rescheduledBy,
  needsReConfirmation
}) {
  const newWhen = formatBookingDateTimeBg(booking.scheduledAt);
  const oldWhen = formatBookingDateTimeBg(previousScheduledAt);
  const actorLabel = rescheduledBy === "consultant" ? "консултантът" : "потребителят";
  const tasks = [];

  if (client?.email) {
    const clientSubject =
      rescheduledBy === "consultant"
        ? `${consultant.name} промени часа на резервацията ти`
        : "Преместихме часа на твоята резервация";
    const clientBody =
      `Здравей, ${client.name || ""},\n\n` +
      `Часът на резервацията ти с ${consultant.name} е променен.\n\n` +
      `Старо време: ${oldWhen}\n` +
      `Ново време: ${newWhen}\n\n` +
      (needsReConfirmation
        ? `Тъй като часът беше потвърден преди, ${consultant.name} ще трябва да приеме новия час. Ще получиш отделно известие при потвърждение.\n\n`
        : `Резервацията остава с актуален статус.\n\n`) +
      `Табло: ${APP_DASHBOARD_URL}`;
    tasks.push(sendEmail({ to: client.email, subject: clientSubject, text: clientBody }));
  }

  if (consultantOwner?.email) {
    const consultantSubject =
      rescheduledBy === "client"
        ? `Преместен час за консултация от ${booking.clientName || "потребител"}`
        : "Преместване на твоя резервация";
    const consultantBody =
      `Здравей, ${consultantOwner.name || consultant.name},\n\n` +
      `${actorLabel === "консултантът" ? "Ти" : actorLabel} премести часа за консултация с ${booking.clientName || "потребител"}.\n\n` +
      `Старо време: ${oldWhen}\n` +
      `Ново време: ${newWhen}\n\n` +
      (needsReConfirmation
        ? `Новият час чака твоето потвърждение. Отвори таблото си, за да приемеш или откажеш.\n\n`
        : `Резервацията е актуализирана.\n\n`) +
      `Табло: ${APP_DASHBOARD_URL}`;
    tasks.push(
      sendEmail({ to: consultantOwner.email, subject: consultantSubject, text: consultantBody })
    );
  }

  await Promise.allSettled(tasks);
}

async function sendBookingDeclinedEmail({ recipient, consultant, booking, reason = "" }) {
  if (!recipient?.email) return;
  const when = formatBookingDateTimeBg(booking.scheduledAt);
  const reasonLine = reason ? `\nПричина: ${reason}\n` : "";
  await sendEmail({
    to: recipient.email,
    subject: `${consultant.name} не може да поеме заявката ти`,
    text:
      `Здравей, ${recipient.name || ""},\n\n` +
      `${consultant.name} не може да поеме заявката ти за консултация на ${when}.${reasonLine}\n\n` +
      `Часът отново е свободен в системата и може да избереш друг подходящ слот или друг консултант:\n` +
      `${APP_USERS_URL}`
  });
}

async function sendBookingReminderEmails({ consultantOwner, consultant, client, booking }) {
  const when = formatBookingDateTimeBg(booking.scheduledAt);
  const tasks = [];

  if (client?.email) {
    tasks.push(
      sendEmail({
        to: client.email,
        subject: `Напомняне: консултация с ${booking.consultantName || consultant?.name || ""} утре`,
        text:
          `Здравей, ${client.name || ""},\n\n` +
          `Напомняме ти за резервираната консултация:\n\n` +
          `Час: ${when}\n` +
          `Консултант: ${booking.consultantName || consultant?.name || ""}\n` +
          (consultant?.sessionModes?.length
            ? `Формат: ${consultant.sessionModes.join(", ")}\n`
            : "") +
          `\nАко не можеш да присъстваш, моля откажи резервацията от таблото:\n` +
          `${APP_DASHBOARD_URL}`
      })
    );
  }

  if (consultantOwner?.email) {
    tasks.push(
      sendEmail({
        to: consultantOwner.email,
        subject: `Напомняне: консултация с ${booking.clientName || "потребител"} утре`,
        text:
          `Здравей, ${consultantOwner.name || consultant?.name || ""},\n\n` +
          `Напомняме ти за резервираната консултация:\n\n` +
          `Час: ${when}\n` +
          `Потребител: ${booking.clientName || ""} (${booking.clientEmail || ""})\n` +
          (booking.note ? `\nБележка: ${booking.note}\n` : "") +
          `\nТабло: ${APP_DASHBOARD_URL}`
      })
    );
  }

  await Promise.allSettled(tasks);
}

async function sendDueReminders() {
  const now = Date.now();
  const windowStart = now + 22 * 60 * 60 * 1000;
  const windowEnd = now + 26 * 60 * 60 * 1000;

  const result = await dynamo.send(
    new ScanCommand({
      TableName: env.bookingsTable,
      FilterExpression:
        "#s = :confirmed AND attribute_not_exists(reminderSentAt) AND scheduledAt BETWEEN :start AND :end",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: {
        ":confirmed": "confirmed",
        ":start": new Date(windowStart).toISOString(),
        ":end": new Date(windowEnd).toISOString()
      }
    })
  );

  const due = result.Items || [];
  if (!due.length) {
    console.log("[reminders] no bookings due");
    return { processed: 0 };
  }

  let processed = 0;
  for (const booking of due) {
    try {
      const consultantResult = await dynamo.send(
        new GetCommand({
          TableName: env.consultantsTable,
          Key: { consultantId: booking.consultantId }
        })
      );
      const consultant = consultantResult.Item || null;
      const consultantOwner = consultant?.ownerUserId
        ? await getUserBySub(consultant.ownerUserId)
        : null;
      const client = await getUserBySub(booking.clientId);

      await sendBookingReminderEmails({
        consultantOwner,
        consultant,
        client: client || { email: booking.clientEmail, name: booking.clientName },
        booking
      });

      const reminderWhen = formatBookingDateTimeBg(booking.scheduledAt);
      await appendUserNotification(booking.clientId, {
        type: "booking_reminder",
        title: `Утре имаш консултация с ${booking.consultantName || consultant?.name || ""}`,
        body: `Час: ${reminderWhen}.`
      });
      if (consultant?.ownerUserId) {
        await appendUserNotification(consultant.ownerUserId, {
          type: "booking_reminder",
          title: `Утре имаш консултация с ${booking.clientName || "потребител"}`,
          body: `Час: ${reminderWhen}.`
        });
      }

      await dynamo.send(
        new UpdateCommand({
          TableName: env.bookingsTable,
          Key: { bookingId: booking.bookingId },
          UpdateExpression: "SET reminderSentAt = :now",
          ConditionExpression: "attribute_not_exists(reminderSentAt)",
          ExpressionAttributeValues: { ":now": new Date().toISOString() }
        })
      );
      processed += 1;
    } catch (error) {
      console.error("[reminders] booking failed", {
        bookingId: booking.bookingId,
        error: error?.message || error
      });
    }
  }

  console.log(`[reminders] processed ${processed} of ${due.length}`);
  return { processed };
}

async function sendBookingCancelledEmail({ recipient, consultantName, scheduledAt, cancelledBy }) {
  if (!recipient?.email) return;
  const when = formatBookingDateTimeBg(scheduledAt);
  const subject =
    cancelledBy === "consultant"
      ? `Консултантът отказа резервацията ти`
      : `Резервацията беше отказана`;
  const text =
    cancelledBy === "consultant"
      ? `Здравей, ${recipient.name || ""},\n\n` +
        `${consultantName} не може да поеме резервацията за ${when}.\n\n` +
        `Можеш да избереш друг свободен час от профила или да опиташ с друг консултант.\n\n` +
        `Каталог: ${APP_USERS_URL}`
      : `Здравей, ${recipient.name || ""},\n\n` +
        `Потребителят отказа резервацията за ${when}.\n\n` +
        `Часът е свободен отново и може да бъде резервиран от друг потребител.\n\n` +
        `Табло: ${APP_DASHBOARD_URL}`;

  await sendEmail({ to: recipient.email, subject, text });
}

function sanitizeFileName(fileName) {
  const normalized = String(fileName || "upload")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized || "upload";
}

function normalizeUploadKind(value) {
  const kind = String(value || "cv").trim().toLowerCase();

  if (
    kind === "cv" ||
    kind === "document" ||
    kind === "avatar" ||
    kind === "hero" ||
    kind === "user-avatar"
  ) {
    return kind;
  }

  return null;
}

function assertOwnedStorageKey(value, fallback, allowedPrefixes, label = "storage key") {
  if (typeof value === "undefined") {
    return fallback || "";
  }

  if (value === null || value === "") {
    return "";
  }

  const storageKey = String(value || "").trim();
  const isOwned = allowedPrefixes.some((prefix) => storageKey.startsWith(prefix));

  if (!storageKey || !isOwned) {
    throw Object.assign(new Error(`Invalid ${label}.`), { statusCode: 400 });
  }

  return storageKey;
}

const DOCUMENT_CATEGORIES = new Set(["cv", "certificate", "portfolio", "other"]);

function normalizeDocumentCategory(value, fallback) {
  const next = String(value || "").trim().toLowerCase();
  if (DOCUMENT_CATEGORIES.has(next)) return next;
  const prev = String(fallback || "").trim().toLowerCase();
  if (DOCUMENT_CATEGORIES.has(prev)) return prev;
  return "other";
}

function normalizeSharedConsultantIds(value, fallback = []) {
  const source = typeof value === "undefined" ? fallback : value;

  if (!Array.isArray(source)) {
    return [];
  }

  const seen = new Set();
  const ids = [];

  for (const item of source) {
    const id = String(item || "").trim();
    if (!id || !id.startsWith("consultant-") || seen.has(id)) {
      continue;
    }
    seen.add(id);
    ids.push(id);
    if (ids.length >= 50) break;
  }

  return ids;
}

function collectSharedConsultantIdsFromDocuments(user) {
  const ids = new Set();
  const documents = [
    user?.cvDocument,
    ...(Array.isArray(user?.documents) ? user.documents : [])
  ].filter(Boolean);

  for (const doc of documents) {
    for (const consultantId of normalizeSharedConsultantIds(doc.sharedWithConsultantIds)) {
      ids.add(consultantId);
    }
  }

  return ids;
}

// Page through every item of a Query so callers that need a complete set (e.g.
// conflict detection, document-sharing checks) aren't silently capped at the
// first 1 MB page once a client/consultant accumulates many bookings.
async function queryAllItems(input, { maxPages = 50 } = {}) {
  const items = [];
  let exclusiveStartKey;
  let pages = 0;
  do {
    const result = await dynamo.send(
      new QueryCommand({ ...input, ExclusiveStartKey: exclusiveStartKey })
    );
    items.push(...(result.Items || []));
    exclusiveStartKey = result.LastEvaluatedKey;
    pages += 1;
  } while (exclusiveStartKey && pages < maxPages);
  return items;
}

async function getConfirmedConsultantIdsForClient(clientId) {
  if (!clientId) return new Set();

  const items = await queryAllItems({
    TableName: env.bookingsTable,
    IndexName: "client-index",
    KeyConditionExpression: "clientId = :clientId",
    ExpressionAttributeValues: {
      ":clientId": clientId
    }
  });

  return new Set(
    items
      .filter((booking) => booking.status === "confirmed")
      .map((booking) => booking.consultantId)
      .filter(Boolean)
  );
}

async function assertDocumentSharingAllowed(userId, nextUser, body) {
  const sharingMayHaveChanged =
    typeof body.cvDocument !== "undefined" || typeof body.documents !== "undefined";

  if (!sharingMayHaveChanged) {
    return;
  }

  const requestedIds = collectSharedConsultantIdsFromDocuments(nextUser);

  if (!requestedIds.size) {
    return;
  }

  const allowedIds = await getConfirmedConsultantIdsForClient(userId);
  const invalid = Array.from(requestedIds).filter(
    (consultantId) => !allowedIds.has(consultantId)
  );

  if (invalid.length) {
    throw Object.assign(
      new Error(
        "Можеш да споделяш документи само с консултанти или ментори от потвърдени сесии."
      ),
      { statusCode: 403 }
    );
  }
}

function normalizeCvDocument(value, fallback, userId) {
  if (typeof value === "undefined") {
    return fallback ?? null;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== "object" || Array.isArray(value) || !value.storageKey) {
    throw Object.assign(new Error("Invalid CV document."), { statusCode: 400 });
  }

  const storageKey = assertOwnedStorageKey(
    value.storageKey,
    "",
    [`profiles/${userId}/documents/`],
    "CV storage key"
  );

  const sizeBytes =
    Number(value.sizeBytes) > 0
      ? Number(value.sizeBytes)
      : Number(fallback?.sizeBytes) > 0
        ? Number(fallback.sizeBytes)
        : undefined;
  return {
    fileName: sanitizeFileName(value.fileName || fallback?.fileName || "cv"),
    storageKey,
    category: "cv",
    sharedWithConsultantIds: normalizeSharedConsultantIds(
      value.sharedWithConsultantIds,
      fallback?.sharedWithConsultantIds
    ),
    ...(sizeBytes ? { sizeBytes } : {}),
    uploadedAt:
      normalizeText(value.uploadedAt, fallback?.uploadedAt || "", 40) ||
      new Date().toISOString()
  };
}

function normalizeUserDocuments(value, fallback, userId) {
  if (typeof value === "undefined") {
    return Array.isArray(fallback) ? fallback : [];
  }

  if (!Array.isArray(value)) {
    throw Object.assign(new Error("documents must be a list."), { statusCode: 400 });
  }

  const fallbackByKey = new Map(
    (Array.isArray(fallback) ? fallback : []).map((item) => [item.storageKey, item])
  );

  const seenKeys = new Set();
  const sanitized = [];

  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item) || !item.storageKey) {
      throw Object.assign(new Error("Invalid document entry."), { statusCode: 400 });
    }
    const storageKey = assertOwnedStorageKey(
      item.storageKey,
      "",
      [`profiles/${userId}/documents/`],
      "document storage key"
    );
    if (seenKeys.has(storageKey)) {
      continue;
    }
    seenKeys.add(storageKey);
    const previous = fallbackByKey.get(storageKey);
    const itemSize =
      Number(item.sizeBytes) > 0
        ? Number(item.sizeBytes)
        : Number(previous?.sizeBytes) > 0
          ? Number(previous.sizeBytes)
          : undefined;
    sanitized.push({
      fileName: sanitizeFileName(item.fileName || previous?.fileName || "document"),
      storageKey,
      category: normalizeDocumentCategory(item.category, previous?.category),
      sharedWithConsultantIds: normalizeSharedConsultantIds(
        item.sharedWithConsultantIds,
        previous?.sharedWithConsultantIds
      ),
      ...(itemSize ? { sizeBytes: itemSize } : {}),
      uploadedAt:
        normalizeText(item.uploadedAt, previous?.uploadedAt || "", 40) ||
        previous?.uploadedAt ||
        new Date().toISOString()
    });
  }

  if (sanitized.length > MAX_USER_DOCUMENTS) {
    throw Object.assign(
      new Error(`Можеш да качиш до ${MAX_USER_DOCUMENTS} документа.`),
      { statusCode: 400 }
    );
  }

  return sanitized;
}

function normalizeSlug(value, fallback = "") {
  const normalized = String(value || fallback || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-я]+/gi, "-")
    .replace(/^-|-$/g, "");

  return normalized || fallback || "";
}

function decodePathSegment(value) {
  try {
    return decodeURIComponent(String(value || ""));
  } catch {
    return String(value || "");
  }
}

function validateUploadRequest({ kind, contentType, fileSize }) {
  const safeContentType = String(contentType || "").trim().toLowerCase();
  const safeFileSize = Number(fileSize || 0);

  if (!safeContentType) {
    return "contentType is required.";
  }

  if (!Number.isFinite(safeFileSize) || safeFileSize <= 0) {
    return "fileSize must be a positive number.";
  }

  // CV and Document slots share the same rules now: any file type, up to
  // 50 MB per file (total quota of 50 MB per user enforced separately in
  // createUploadUrl). Downloads are forced via Content-Disposition so
  // arbitrary content types can't render inline from S3.
  if (kind === "cv" || kind === "document") {
    if (safeFileSize > MAX_DOCUMENT_BYTES) {
      return "Файлът надвишава 50 MB.";
    }
    return null;
  }

  if (!ALLOWED_PROFILE_IMAGE_TYPES.has(safeContentType)) {
    return "Profile media must be a JPEG, PNG, or WebP image.";
  }

  if (safeFileSize > 5 * 1024 * 1024) {
    return "Profile images must be 5 MB or smaller.";
  }

  return null;
}

async function getSignedObjectUrl(storageKey, options = {}) {
  if (!storageKey) {
    return "";
  }

  const isDocument = options.purpose === "document";
  const commandInput = {
    Bucket: env.cvBucket,
    Key: storageKey
  };

  if (isDocument) {
    const baseName = storageKey.split("/").pop() || "document";
    const safeName = baseName.replace(/"/g, "");
    commandInput.ResponseContentDisposition = `attachment; filename="${safeName}"`;
  }

  return getSignedUrl(s3, new GetObjectCommand(commandInput), {
    expiresIn: isDocument ? 900 : 3600
  });
}

async function deleteS3Object(storageKey) {
  if (!storageKey) return;
  try {
    await s3.send(
      new DeleteObjectCommand({
        Bucket: env.cvBucket,
        Key: storageKey
      })
    );
  } catch (error) {
    console.error("[s3] delete failed", { storageKey, error: error?.message || error });
  }
}

async function deleteOrphanedStorageKeys(previous, next) {
  const nextKeys = new Set();
  for (const key of next) {
    if (key) nextKeys.add(key);
  }
  const orphans = [];
  for (const key of previous) {
    if (key && !nextKeys.has(key)) orphans.push(key);
  }
  await Promise.allSettled(orphans.map((key) => deleteS3Object(key)));
}

// Fields that exist on the DynamoDB consultant item but must never leak to
// unauthenticated/public callers. Removed from listConsultants + getConsultant
// responses. Admin and owner endpoints get the full object.
const PUBLIC_CONSULTANT_HIDDEN_FIELDS = [
  "ownerUserId",
  "bookedSlots",
  "statusUpdatedAt",
  "statusUpdatedBy",
  "statusUpdatedByEmail",
  "statusSelfApproved",
  "deletionScheduledAt",
  "avatarStorageKey",
  "heroStorageKey",
  "priceBgn",
  // Package business internals stay private; only the tier itself is public.
  "packageSource",
  "packageUpdatedAt",
  "packageUpdatedBy",
  "packageUpdatedByEmail"
];

// Visibility packages (Start / Grow / Spotlight). Profiles created before the
// package model (or never assigned one) are grandfathered as "start".
const CONSULTANT_PACKAGE_TIERS = ["start", "grow", "spotlight"];

function normalizeConsultantPackageTier(value, fallback = "start") {
  const tier = String(value || "").trim().toLowerCase();
  return CONSULTANT_PACKAGE_TIERS.includes(tier) ? tier : fallback;
}

function getConsultantPackageRank(item) {
  const tier = normalizeConsultantPackageTier(item?.packageTier);
  return tier === "spotlight" ? 2 : tier === "grow" ? 1 : 0;
}

function stripSensitiveConsultantFields(consultant) {
  if (!consultant) return consultant;
  const cleaned = { ...consultant };
  for (const key of PUBLIC_CONSULTANT_HIDDEN_FIELDS) {
    delete cleaned[key];
  }
  cleaned.packageTier = normalizeConsultantPackageTier(cleaned.packageTier);
  return cleaned;
}

function computeAggregateRating(consultant) {
  const sum = Number(consultant?.ratingSum);
  const count = Number(consultant?.reviewCount) || 0;
  if (Number.isFinite(sum) && count > 0) {
    return Math.round((sum / count) * 10) / 10;
  }
  // Legacy rows (seeded examples) carry a static rating field.
  return Number(consultant?.rating) || 0;
}

async function getRecentConsultantReviews(consultantId, limit = 10) {
  if (!consultantId) return [];
  const result = await dynamo.send(
    new QueryCommand({
      TableName: env.bookingsTable,
      IndexName: "consultant-index",
      KeyConditionExpression: "consultantId = :c",
      ExpressionAttributeValues: { ":c": consultantId },
      ProjectionExpression:
        "bookingId, clientName, #r",
      ExpressionAttributeNames: { "#r": "review" },
      Limit: 100
    })
  );
  return (result.Items || [])
    .filter((item) => item.review && item.review.rating)
    .sort(
      (a, b) =>
        new Date(b.review.createdAt).getTime() -
        new Date(a.review.createdAt).getTime()
    )
    .slice(0, limit)
    .map((item) => ({
      bookingId: item.bookingId,
      clientName: item.clientName || "Потребител",
      rating: Number(item.review.rating) || 0,
      comment: String(item.review.comment || "").slice(0, 600),
      createdAt: item.review.createdAt
    }));
}

async function decorateConsultantMedia(consultant) {
  if (!consultant) {
    return consultant;
  }

  const availability = normalizeAvailabilitySlots(consultant.availability || [], []);
  const languages = normalizeStringList(consultant.languages, []);
  const specializations = normalizeStringList(consultant.specializations, []);
  const sessionModes = normalizeStringList(consultant.sessionModes, ["Онлайн"]);
  const tags = normalizeStringList(consultant.tags, []);
  const idealFor = normalizeStringList(consultant.idealFor, []);
  const consultationTopics = normalizeStringList(consultant.consultationTopics, []);
  const experienceHighlights = normalizeStringList(consultant.experienceHighlights, []);
  const educationHighlights = normalizeStringList(consultant.educationHighlights, []);
  const [avatarUrl, heroUrl] = await Promise.all([
    consultant.avatarStorageKey
      ? getSignedObjectUrl(consultant.avatarStorageKey)
      : Promise.resolve(""),
    consultant.heroStorageKey
      ? getSignedObjectUrl(consultant.heroStorageKey)
      : Promise.resolve("")
  ]);

  return {
    ...consultant,
    bio: consultant.bio || "",
    experienceSummary: consultant.experienceSummary || "",
    experienceHighlights,
    educationHighlights,
    priceEur: normalizeConsultantPriceEur(consultant),
    theme: normalizeConsultantTheme(consultant.theme),
    languages,
    specializations,
    sessionModes,
    tags,
    idealFor,
    consultationTopics,
    workApproach: consultant.workApproach || "",
    availability,
    nextAvailable: getNextAvailableSlot(availability, consultant.nextAvailable || ""),
    rating: computeAggregateRating(consultant),
    reviewCount: Number(consultant.reviewCount) || 0,
    avatarUrl: avatarUrl || consultant.avatarUrl,
    heroUrl: heroUrl || consultant.heroUrl
  };
}

async function decorateUserMedia(user) {
  if (!user) {
    return user;
  }

  const [avatarUrl, cvDownloadUrl, documents] = await Promise.all([
    user.avatarStorageKey ? getSignedObjectUrl(user.avatarStorageKey) : Promise.resolve(""),
    user.cvDocument?.storageKey
      ? getSignedObjectUrl(user.cvDocument.storageKey, { purpose: "document" })
      : Promise.resolve(""),
    Promise.all(
      (Array.isArray(user.documents) ? user.documents : []).map(async (item) => ({
        ...item,
        downloadUrl: item.storageKey
          ? await getSignedObjectUrl(item.storageKey, { purpose: "document" })
          : ""
      }))
    )
  ]);

  return {
    ...user,
    headline: user.headline || "",
    bio: user.bio || "",
    experienceSummary: user.experienceSummary || "",
    experienceHighlights: normalizeStringList(user.experienceHighlights, []),
    educationHighlights: normalizeStringList(user.educationHighlights, []),
    skills: normalizeStringList(user.skills, []),
    interests: normalizeStringList(user.interests, []),
    keywords: normalizeStringList(user.keywords, []),
    preferredSessionModes: normalizeStringList(user.preferredSessionModes, []),
    avatarUrl: avatarUrl || user.avatarUrl || "",
    cvDocument: user.cvDocument
      ? { ...user.cvDocument, downloadUrl: cvDownloadUrl }
      : null,
    documents
  };
}

function getConsultantPlanFields(plan) {
  return {
    subscriptionStatus: "active",
    membershipTier: plan === "pro" ? "enhanced" : "standard"
  };
}

const INITIAL_CONSULTANT_VISIBILITY = {
  isPublic: false,
  profileStatus: "pending"
};

function isConsultantRecord(item) {
  if (!item || typeof item.consultantId !== "string") return false;
  return !item.consultantId.startsWith(SLUG_CLAIM_PREFIX);
}

function isPlaceholderPublicText(value) {
  const compact = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s._-]+/g, "");

  if (!compact) return true;
  return /^(test|testing|sample|placeholder|asdf|qwerty|none|null|na)+$/.test(compact);
}

function hasUsefulPublicList(value) {
  return (
    Array.isArray(value) &&
    value.some((item) => {
      const text = String(item || "").trim();
      return text.length >= 2 && !isPlaceholderPublicText(text);
    })
  );
}

function hasValidPublicMediaUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return true;

  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function hasFutureAvailability(value) {
  const cutoff = Date.now() - 5 * 60 * 1000;
  return normalizeAvailabilitySlots(value || [], []).some(
    (item) => new Date(item).getTime() >= cutoff
  );
}

function isReasonablePublicNumber(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max;
}

// A consultant has an active membership (and may be public) when they are a
// paying or admin-comped/invited expert. Approval is no longer required — paid
// (or invited) accounts are the gate. `comped` is set by an admin invite or by
// grandfathering existing live profiles; `packageSource` purchased|granted comes
// from Stripe (future) or an admin package grant. Restricted accounts are never
// active.
function consultantMembershipActive(consultant) {
  if (!consultant || consultant.restricted === true) return false;
  if (consultant.comped === true) return true;
  const source = consultant.packageSource || "";
  return source === "granted" || source === "purchased";
}

function isVisibleConsultant(consultant) {
  if (!isConsultantRecord(consultant)) return false;
  if (consultant.isPublic === false) return false;
  if (consultant.restricted === true) return false;
  if (consultant.deletionScheduledAt || consultant.anonymizedAt) return false;
  if (!consultantMembershipActive(consultant)) return false;

  const name = String(consultant.name || "").trim();
  const headline = String(consultant.headline || "").trim();
  const bio = String(consultant.bio || "").trim();
  const experienceSummary = String(consultant.experienceSummary || "").trim();

  if (name.length < 2) return false;
  if (!normalizeSlug(consultant.slug, "")) return false;
  if (!hasValidPublicMediaUrl(consultant.avatarUrl)) return false;
  if (!hasValidPublicMediaUrl(consultant.heroUrl)) return false;
  if (!isReasonablePublicNumber(normalizeConsultantPriceEur(consultant), 0, 2500)) return false;
  if (!isReasonablePublicNumber(consultant.sessionLengthMinutes || 60, 15, 240)) return false;

  // An admin-established membership (invited/comped, or a granted/purchased
  // package) is authoritative — the profile is not hidden by the automated
  // completeness heuristics below. Self-built profiles still pass the stricter
  // quality bar before appearing in the catalog.
  if (
    consultant.comped === true ||
    consultant.packageSource === "granted" ||
    consultant.packageSource === "purchased"
  ) {
    return true;
  }

  // Minimum quality bar for auto-approved profiles — empty or junk profiles
  // should not appear only because their flags read public+approved.
  if (isPlaceholderPublicText(name)) return false;
  if (headline.length < 10 || isPlaceholderPublicText(headline)) return false;
  if (bio.length < 80 || isPlaceholderPublicText(bio)) return false;
  if (experienceSummary.length < 20 || isPlaceholderPublicText(experienceSummary)) return false;
  if (!hasUsefulPublicList(consultant.languages)) return false;
  if (!hasUsefulPublicList(consultant.specializations)) return false;
  if (!hasUsefulPublicList(consultant.sessionModes)) return false;
  if (!isReasonablePublicNumber(consultant.experienceYears || 0, 0, 70)) return false;
  return true;
}

// Internal completeness check — used by updateMyConsultant to silently
// promote a pending profile to approved+public once enough fields are
// filled. The threshold deliberately covers the same fields a client
// would scan when choosing a consultant: identity, expertise, format,
// availability. We do NOT surface this rule in the UI; the profile just
// goes live when it's ready.
function isConsultantProfileReadyForAutoApprove(consultant) {
  const name = String(consultant.name || "").trim();
  const headline = String(consultant.headline || "").trim();
  const bio = String(consultant.bio || "").trim();
  const experienceSummary = String(consultant.experienceSummary || "").trim();
  const sessionLength = Number(consultant.sessionLengthMinutes);

  return (
    name.length >= 2 &&
    !isPlaceholderPublicText(name) &&
    headline.length >= 10 &&
    !isPlaceholderPublicText(headline) &&
    bio.length >= 80 &&
    !isPlaceholderPublicText(bio) &&
    experienceSummary.length >= 20 &&
    !isPlaceholderPublicText(experienceSummary) &&
    hasUsefulPublicList(consultant.experienceHighlights) &&
    hasUsefulPublicList(consultant.specializations) &&
    hasUsefulPublicList(consultant.languages) &&
    Number.isFinite(sessionLength) &&
    sessionLength > 0 &&
    hasFutureAvailability(consultant.availability)
  );
}

const LIST_PAGE_SIZE = 24;
const LIST_MAX_PAGE_SIZE = 100;
const LIST_MAX_SCAN_PAGES = 5;
const LIST_SCAN_PAGE_LIMIT = 100;

function encodeCursor(key) {
  if (!key) return null;
  return Buffer.from(JSON.stringify(key), "utf8").toString("base64url");
}

function decodeCursor(cursor) {
  if (!cursor) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(String(cursor), "base64url").toString("utf8"));
    return parsed && typeof parsed === "object" ? parsed : undefined;
  } catch (error) {
    return undefined;
  }
}

function parsePageSize(value, fallback = LIST_PAGE_SIZE) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, LIST_MAX_PAGE_SIZE);
}

async function scanWithFilter({ tableName, filter, pageSize, startKey }) {
  const collected = [];
  let exclusiveStartKey = startKey;
  let lastEvaluatedKey = null;
  let scanned = 0;

  while (scanned < LIST_MAX_SCAN_PAGES) {
    const result = await dynamo.send(
      new ScanCommand({
        TableName: tableName,
        Limit: LIST_SCAN_PAGE_LIMIT,
        ExclusiveStartKey: exclusiveStartKey
      })
    );
    scanned += 1;

    for (const item of result.Items || []) {
      if (filter(item)) {
        collected.push(item);
        if (collected.length >= pageSize) {
          lastEvaluatedKey = result.LastEvaluatedKey || null;
          return { items: collected, lastEvaluatedKey };
        }
      }
    }

    exclusiveStartKey = result.LastEvaluatedKey;
    if (!exclusiveStartKey) {
      lastEvaluatedKey = null;
      return { items: collected, lastEvaluatedKey };
    }
  }

  return { items: collected, lastEvaluatedKey: exclusiveStartKey };
}

function isMissingIndexError(error) {
  const name = String(error?.name || "");
  const message = String(error?.message || "");
  return (
    name === "ResourceNotFoundException" ||
    name === "ValidationException" ||
    message.includes(CONSULTANT_STATUS_INDEX)
  );
}

async function queryConsultantsByStatus({ status, filter, pageSize, startKey }) {
  const collected = [];
  let exclusiveStartKey = startKey;
  let lastEvaluatedKey = null;
  let scanned = 0;

  while (scanned < LIST_MAX_SCAN_PAGES) {
    const result = await dynamo.send(
      new QueryCommand({
        TableName: env.consultantsTable,
        IndexName: CONSULTANT_STATUS_INDEX,
        KeyConditionExpression: "#profileStatus = :status",
        ExpressionAttributeNames: { "#profileStatus": "profileStatus" },
        ExpressionAttributeValues: { ":status": status },
        Limit: LIST_SCAN_PAGE_LIMIT,
        ExclusiveStartKey: exclusiveStartKey
      })
    );
    scanned += 1;

    for (const item of result.Items || []) {
      if (filter(item)) {
        collected.push(item);
        if (collected.length >= pageSize) {
          lastEvaluatedKey = result.LastEvaluatedKey || null;
          return { items: collected, lastEvaluatedKey };
        }
      }
    }

    exclusiveStartKey = result.LastEvaluatedKey;
    if (!exclusiveStartKey) {
      return { items: collected, lastEvaluatedKey: null };
    }
  }

  return { items: collected, lastEvaluatedKey: exclusiveStartKey };
}

async function listApprovedConsultantsWithFallback({ filter, pageSize, startKey }) {
  try {
    return await queryConsultantsByStatus({
      status: "approved",
      filter,
      pageSize,
      startKey
    });
  } catch (error) {
    if (!isMissingIndexError(error)) {
      throw error;
    }

    console.warn("[consultants] profile-status-index unavailable, falling back to scan", {
      error: error?.message || error
    });
    return scanWithFilter({
      tableName: env.consultantsTable,
      filter,
      pageSize,
      startKey
    });
  }
}

function normalizeConsultantStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  return CONSULTANT_PROFILE_STATUSES.has(status) ? status : null;
}

function createConsultantDraft({
  userId,
  name,
  email,
  plan,
  profileType,
  city,
  headline,
  avatarUrl,
  comped = false
}) {
  const baseName = String(name || email || "consultant").trim();
  const slug = normalizeSlug(baseName);

  return {
    consultantId: `consultant-${randomUUID()}`,
    ownerUserId: userId,
    comped: comped === true,
    restricted: false,
    profileType: normalizeConsultantProfileType(profileType),
    slug: slug || `consultant-${Date.now()}`,
    name: baseName || "Нов профил",
    headline: String(headline || "").trim() || "Кариерен консултант",
    bio: "",
    experienceSummary: "",
    experienceHighlights: [],
    educationHighlights: [],
    city: String(city || "").trim(),
    languages: [],
    specializations: [],
    experienceYears: 0,
    priceEur: 0,
    sessionModes: ["Онлайн"],
    featured: false,
    rating: 0,
    reviewCount: 0,
    nextAvailable: "",
    avatarUrl: String(avatarUrl || "").trim(),
    heroUrl: "",
    theme: "",
    tags: [],
    availability: [],
    idealFor: [],
    consultationTopics: [],
    workApproach: "",
    sessionLengthMinutes: 60,
    ...INITIAL_CONSULTANT_VISIBILITY,
    ...getConsultantPlanFields(plan || "free")
  };
}

async function listConsultants(event) {
  const query = String(event.queryStringParameters?.query || "")
    .trim()
    .toLowerCase();
  const city = String(event.queryStringParameters?.city || "")
    .trim()
    .toLowerCase();
  const pageSize = parsePageSize(event.queryStringParameters?.limit);
  const startKey = decodeCursor(event.queryStringParameters?.cursor);

  const { items, lastEvaluatedKey } = await listApprovedConsultantsWithFallback({
    pageSize,
    startKey,
    filter: (item) => {
      if (!isVisibleConsultant(item)) return false;
      const matchesQuery =
        !query ||
        item.name?.toLowerCase().includes(query) ||
        item.headline?.toLowerCase().includes(query) ||
        item.experienceSummary?.toLowerCase().includes(query) ||
        (item.specializations || []).join(" ").toLowerCase().includes(query) ||
        (item.tags || []).join(" ").toLowerCase().includes(query) ||
        (item.experienceHighlights || []).join(" ").toLowerCase().includes(query) ||
        (item.educationHighlights || []).join(" ").toLowerCase().includes(query) ||
        (item.consultationTopics || []).join(" ").toLowerCase().includes(query) ||
        (item.idealFor || []).join(" ").toLowerCase().includes(query);
      const matchesCity = !city || item.city?.toLowerCase().includes(city);
      return matchesQuery && matchesCity;
    }
  });

  const orderedItems = [...items].sort((left, right) => {
    // Paid visibility first: Spotlight ahead of Grow ahead of Start (Стр. 6 —
    // "по-предно позициониране в каталога" / "приоритетно позициониране").
    const packageDiff = getConsultantPackageRank(right) - getConsultantPackageRank(left);
    if (packageDiff !== 0) {
      return packageDiff;
    }
    if (left.featured !== right.featured) {
      return left.featured ? -1 : 1;
    }
    if ((right.reviewCount || 0) !== (left.reviewCount || 0)) {
      return (right.reviewCount || 0) - (left.reviewCount || 0);
    }
    if ((right.rating || 0) !== (left.rating || 0)) {
      return (right.rating || 0) - (left.rating || 0);
    }
    return String(left.name || "").localeCompare(String(right.name || ""), "bg");
  });

  const decoratedItems = await Promise.all(
    orderedItems.map((item) => decorateConsultantMedia(item))
  );

  return response(
    200,
    {
      items: decoratedItems.map(stripSensitiveConsultantFields),
      nextCursor: encodeCursor(lastEvaluatedKey)
    },
    // Public marketplace data. A short max-age plus stale-while-revalidate lets
    // browsers and any CDN layer serve repeat/concurrent reads without hitting
    // Lambda (lower latency + cost), while consultant profile edits still
    // surface within ~60s. Note: responses include short-lived signed media
    // URLs, so the TTL is intentionally kept under their expiry.
    { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" }
  );
}

async function getConsultant(event) {
  const slug = event.pathParameters?.slug;

  if (!slug) {
    return badRequest("Consultant slug is required.");
  }

  const consultant = await getConsultantBySlug(slug);

  if (!isVisibleConsultant(consultant)) {
    return notFound("Consultant profile not found.");
  }

  const [decorated, recentReviews] = await Promise.all([
    decorateConsultantMedia(consultant),
    getRecentConsultantReviews(consultant.consultantId, 10)
  ]);

  return response(
    200,
    stripSensitiveConsultantFields({ ...decorated, recentReviews }),
    {
      // Match /consultants — short public cache with revalidation. Signed media
      // URLs in the payload are valid for 3600s, comfortably longer than the
      // max served age (max-age + stale-while-revalidate), so cached responses
      // never hand out an expired image URL.
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300"
    }
  );
}

// Public, link-shareable member card. Returns ONLY safe public fields — never
// email, age, goals, keywords, documents, plan, or booking data. The id is the
// user's Cognito sub (a UUID), so the profile is effectively unlisted: only
// someone with the share link can resolve it.
async function getPublicUser(event) {
  const id =
    event.pathParameters?.id ||
    decodeURIComponent(String(event.rawPath || event.path || "").split("/").pop() || "");

  if (!id) {
    return badRequest("User id is required.");
  }

  if (id.startsWith("system#")) {
    return notFound("Profile not found.");
  }

  const user = await getUserBySub(id);

  if (!user || String(user.userId || "").startsWith("system#")) {
    return notFound("Profile not found.");
  }

  // A missing name must not 404 the page (e.g. social signups that skipped the
  // onboarding step) — fall back to the email local-part so the owner's own
  // "виж публичния си профил" always resolves.
  const displayName =
    normalizeText(user.name, "", 120) ||
    String(user.email || "").split("@")[0] ||
    "Потребител GrowPoint";

  const avatarUrl = user.avatarStorageKey
    ? await getSignedObjectUrl(user.avatarStorageKey)
    : user.avatarUrl || "";

  return response(
    200,
    {
      userId: user.userId,
      name: displayName,
      role: normalizeUserRole(user.role, "client"),
      avatarUrl,
      city: user.city || "",
      occupation: user.occupation || "",
      headline: user.headline || "",
      bio: user.bio || "",
      experienceSummary: user.experienceSummary || "",
      experienceHighlights: normalizeStringList(user.experienceHighlights, []),
      educationHighlights: normalizeStringList(user.educationHighlights, []),
      skills: normalizeStringList(user.skills, []),
      interests: normalizeStringList(user.interests, [])
    },
    {
      // Same short public cache as /consultants; signed avatar URL lives 3600s,
      // longer than the max served age, so cached responses never go stale.
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300"
    }
  );
}

async function bootstrapUser(event) {
  const claims = requireAuth(event);
  const body = parseBody(event);
  const now = new Date().toISOString();

  const existing = await getUserBySub(claims.sub);
  const currentPlan = normalizePlanTier(existing?.plan, "free");
  const currentRole = normalizeUserRole(existing?.role, "client");
  // Redeem an admin email invite (?invite=TOKEN) — grants a free, "comped"
  // consultant account (the only way to onboard a mentor until Stripe is live).
  // The invite is keyed by the invited email and the verified token must match.
  let redeemedInvite = false;
  const inviteEmail = String(claims.email || body.email || "").trim().toLowerCase();
  if (body.inviteToken && inviteEmail) {
    const redeemed = await redeemInvite(inviteEmail, String(body.inviteToken), claims.sub);
    if (redeemed) redeemedInvite = true;
  }
  const compedConsultant = existing?.compedConsultant === true || redeemedInvite;
  // Cognito group membership is authoritative, so a manually-created Cognito user
  // can be designated by assigning a group (picked up on next login):
  //   - "consultants" group -> mentor/consultant
  //   - "clients" group      -> regular user (also lets an admin demote)
  // If "consultants" wins when both are set. Without either group, fall back to
  // the existing role, then the role chosen at registration, then "client".
  const groups = getClaimGroups(claims);
  const groupRole = groups.includes(CONSULTANT_GROUP)
    ? "consultant"
    : groups.includes(CLIENT_GROUP)
      ? "client"
      : null;
  // Cognito group membership stays authoritative. Otherwise: a brand-new user
  // (or an explicit `setRole` request, e.g. the social-onboarding role choice)
  // applies the requested role; without `setRole`, an existing user keeps their
  // current role so routine bootstrap calls can never silently demote them.
  const allowRoleChange = body.setRole === true;
  const requestedRole = redeemedInvite
    ? "consultant"
    : groupRole ||
      (existing && !allowRoleChange
        ? currentRole
        : normalizeUserRole(body.role, currentRole));
  const requestedConsultantProfileType =
    typeof body.consultantProfileType === "undefined"
      ? null
      : normalizeConsultantProfileType(body.consultantProfileType, "consultant");

  // Points / referral state. Bootstrap rewrites the whole user record (PutCommand
  // below), so every persistent field must be carried over or points reset to 0.
  const referralCode = await ensureReferralCode(claims.sub, existing?.referralCode);
  let referredByUserId = existing?.referredByUserId || "";
  if (!existing && body.ref) {
    const refOwner = await resolveReferralCode(body.ref);
    if (refOwner && refOwner !== claims.sub) referredByUserId = refOwner;
  }

  const nextUser = {
    userId: claims.sub,
    email: claims.email || normalizeText(body.email, "", 320),
    name: normalizeText(body.name || claims.name, existing?.name || "", 120),
    role: requestedRole,
    compedConsultant,
    restricted: existing?.restricted === true,
    points: existing?.points ?? 0,
    pointsHistory: Array.isArray(existing?.pointsHistory)
      ? existing.pointsHistory.slice(-POINTS_HISTORY_KEEP)
      : [],
    referralCode,
    referredByUserId,
    awardedProfileComplete: existing?.awardedProfileComplete === true,
    referralCredited: existing?.referralCredited === true,
    plan: currentPlan,
    avatarUrl: normalizeText(
      body.avatarUrl ?? claims.picture,
      existing?.avatarUrl ?? "",
      2000
    ),
    avatarStorageKey: existing?.avatarStorageKey || "",
    city: normalizeText(body.city, existing?.city ?? "", 120),
    occupation: normalizeText(body.occupation, existing?.occupation ?? "", 140),
    age: existing?.age ?? null,
    headline: normalizeText(body.headline, existing?.headline ?? "", 180),
    bio: existing?.bio || "",
    experienceSummary: existing?.experienceSummary || "",
    experienceHighlights: existing?.experienceHighlights || [],
    educationHighlights: existing?.educationHighlights || [],
    skills: existing?.skills || [],
    interests: existing?.interests || [],
    keywords: existing?.keywords || [],
    goals: existing?.goals || "",
    preferredSessionModes: existing?.preferredSessionModes || [],
    cvDocument: existing?.cvDocument || null,
    documents: Array.isArray(existing?.documents) ? existing.documents : [],
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
  const planFields = getConsultantPlanFields(nextUser.plan);

  await dynamo.send(
    new PutCommand({
      TableName: env.usersTable,
      Item: nextUser
    })
  );

  if (nextUser.role === "consultant") {
    const existingConsultant = await getConsultantByOwner(claims.sub);

    if (!existingConsultant) {
      const draft = createConsultantDraft({
        userId: claims.sub,
        name: nextUser.name,
        email: claims.email || body.email || "",
        plan: nextUser.plan,
        profileType: requestedConsultantProfileType || "consultant",
        city: nextUser.city,
        headline: nextUser.headline,
        avatarUrl: nextUser.avatarUrl,
        comped: compedConsultant
      });
      await putConsultantDraftWithUniqueSlug(draft);
    } else {
      await dynamo.send(
        new PutCommand({
          TableName: env.consultantsTable,
          Item: {
            ...existingConsultant,
            comped: existingConsultant.comped === true || compedConsultant,
            profileType:
              requestedConsultantProfileType ||
              existingConsultant.profileType ||
              "consultant",
            avatarUrl:
              body.avatarUrl ??
              existingConsultant.avatarUrl ??
              nextUser.avatarUrl ??
              "",
            ...planFields
          }
        })
      );
    }
  }

  return response(200, await decorateUserMedia(nextUser));
}

async function exportMyData(event) {
  const claims = requireAuth(event);

  const [user, consultant, clientBookings] = await Promise.all([
    getUserBySub(claims.sub),
    getConsultantByOwner(claims.sub),
    dynamo.send(
      new QueryCommand({
        TableName: env.bookingsTable,
        IndexName: "client-index",
        KeyConditionExpression: "clientId = :id",
        ExpressionAttributeValues: { ":id": claims.sub }
      })
    )
  ]);

  let consultantBookings = { Items: [] };
  if (consultant) {
    consultantBookings = await dynamo.send(
      new QueryCommand({
        TableName: env.bookingsTable,
        IndexName: "consultant-index",
        KeyConditionExpression: "consultantId = :c",
        ExpressionAttributeValues: { ":c": consultant.consultantId }
      })
    );
  }

  const exportPayload = {
    exportedAt: new Date().toISOString(),
    cognitoSub: claims.sub,
    email: claims.email || user?.email || "",
    profile: user || null,
    consultantProfile: consultant || null,
    bookingsAsClient: clientBookings.Items || [],
    bookingsAsConsultant: consultantBookings.Items || [],
    notes: [
      "Този файл съдържа цялата информация, която GrowPoint съхранява за теб.",
      "Документите (CV, сертификати) се пазят в S3 и се свалят чрез временни линкове, генерирани при поискване.",
      "За искане за пълно изтриване използвай функцията 'Изтрий профила' в таблото. Тя насрочва автоматично изтриване след 7 дни."
    ]
  };

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="growpoint-export-${claims.sub}.json"`,
      "Access-Control-Allow-Origin": corsOrigin(),
      "Vary": "Origin",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(exportPayload, null, 2)
  };
}

async function purgeUserAccount(userId) {
  const user = await getUserBySub(userId);

  // Collect all storage keys to scrub from S3.
  const storageKeysToDelete = new Set();
  if (user?.avatarStorageKey) storageKeysToDelete.add(user.avatarStorageKey);
  if (user?.cvDocument?.storageKey) storageKeysToDelete.add(user.cvDocument.storageKey);
  for (const doc of Array.isArray(user?.documents) ? user.documents : []) {
    if (doc.storageKey) storageKeysToDelete.add(doc.storageKey);
  }

  const consultant = await getConsultantByOwner(userId);
  if (consultant) {
    if (consultant.avatarStorageKey) storageKeysToDelete.add(consultant.avatarStorageKey);
    if (consultant.heroStorageKey) storageKeysToDelete.add(consultant.heroStorageKey);
  }

  // Anonymize bookings the user was the client on (we keep them for the consultant's history).
  const clientBookings = await dynamo.send(
    new QueryCommand({
      TableName: env.bookingsTable,
      IndexName: "client-index",
      KeyConditionExpression: "clientId = :id",
      ExpressionAttributeValues: { ":id": userId }
    })
  );
  await Promise.allSettled(
    (clientBookings.Items || []).map((booking) =>
      dynamo.send(
        new UpdateCommand({
          TableName: env.bookingsTable,
          Key: { bookingId: booking.bookingId },
          UpdateExpression:
            "SET clientName = :n, clientEmail = :e, anonymizedAt = :now REMOVE note",
          ExpressionAttributeValues: {
            ":n": "[Изтрит потребител]",
            ":e": "",
            ":now": new Date().toISOString()
          }
        })
      )
    )
  );

  // If the user is a consultant, hide their public profile and free remaining slots.
  if (consultant) {
    await dynamo.send(
      new UpdateCommand({
        TableName: env.consultantsTable,
        Key: { consultantId: consultant.consultantId },
        UpdateExpression:
          "SET isPublic = :false, profileStatus = :rejected, anonymizedAt = :now, " +
          "#n = :placeholder, bio = :empty, headline = :empty",
        ExpressionAttributeNames: { "#n": "name" },
        ExpressionAttributeValues: {
          ":false": false,
          ":rejected": "rejected",
          ":now": new Date().toISOString(),
          ":placeholder": "[Изтрит профил]",
          ":empty": ""
        }
      })
    );
  }

  // Delete the user row outright; profile is gone from this point.
  await dynamo.send(
    new DeleteCommand({
      TableName: env.usersTable,
      Key: { userId }
    })
  );

  // Best-effort S3 scrub. Don't fail the request if some objects can't be deleted.
  await Promise.allSettled(
    Array.from(storageKeysToDelete).map((key) => deleteS3Object(key))
  );

  return {
    deleted: true,
    anonymizedBookings: (clientBookings.Items || []).length,
    cognitoSubRetained: true
  };
}

async function processScheduledDeletions() {
  const nowIso = new Date().toISOString();
  const { items } = await scanWithFilter({
    tableName: env.usersTable,
    pageSize: 25,
    filter: (item) =>
      Boolean(item?.deletionEffectiveAt) &&
      String(item.deletionEffectiveAt) <= nowIso
  });

  let processed = 0;
  for (const item of items) {
    try {
      await purgeUserAccount(item.userId);
      processed += 1;
    } catch (error) {
      console.error("[deletion] scheduled purge failed", {
        userId: item?.userId,
        error: error?.message || error
      });
    }
  }

  return { processed };
}

async function deleteMyAccount(event) {
  const claims = requireAuth(event);
  const user = await getUserBySub(claims.sub);

  if (!user) {
    return notFound("Profile not found.");
  }

  const alreadyScheduledAt = user.deletionScheduledAt || "";
  const alreadyEffectiveAt = user.deletionEffectiveAt || "";

  if (alreadyScheduledAt && alreadyEffectiveAt) {
    return response(200, {
      deleted: false,
      deletionScheduledAt: alreadyScheduledAt,
      deletionEffectiveAt: alreadyEffectiveAt,
      note: "Изтриването вече е насрочено."
    });
  }

  const now = new Date();
  const deletionScheduledAt = now.toISOString();
  const deletionEffectiveAt = new Date(
    now.getTime() + ACCOUNT_DELETION_DELAY_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  await dynamo.send(
    new UpdateCommand({
      TableName: env.usersTable,
      Key: { userId: claims.sub },
      UpdateExpression:
        "SET deletionScheduledAt = :scheduledAt, deletionEffectiveAt = :effectiveAt, " +
        "updatedAt = :scheduledAt",
      ExpressionAttributeValues: {
        ":scheduledAt": deletionScheduledAt,
        ":effectiveAt": deletionEffectiveAt
      }
    })
  );

  const consultant = await getConsultantByOwner(claims.sub);

  if (consultant) {
    await dynamo.send(
      new UpdateCommand({
        TableName: env.consultantsTable,
        Key: { consultantId: consultant.consultantId },
        UpdateExpression:
          "SET isPublic = :false, profileStatus = :rejected, " +
          "deletionScheduledAt = :scheduledAt, updatedAt = :scheduledAt",
        ExpressionAttributeValues: {
          ":false": false,
          ":rejected": "rejected",
          ":scheduledAt": deletionScheduledAt
        }
      })
    );
  }

  // We don't delete the Cognito identity here (no IAM permission granted, see infra/terraform/main.tf).
  // The scheduled purge removes app data and S3 files after the grace window.
  return response(200, {
    deleted: false,
    deletionScheduledAt,
    deletionEffectiveAt,
    publicProfileHidden: Boolean(consultant),
    cognitoSubRetained: true,
    note: `Профилът е насрочен за автоматично изтриване след ${ACCOUNT_DELETION_DELAY_DAYS} дни.`
  });
}

async function getMeProfile(event) {
  const claims = requireAuth(event);
  const user = await getUserBySub(claims.sub);

  if (!user) {
    return notFound("Profile not found. Call /auth/bootstrap first.");
  }

  // Backfill/repair referral codes for accounts created before the points
  // feature, including users that have a code but are missing the lookup row.
  const referralCode = await ensureReferralCode(claims.sub, user.referralCode);
  if (referralCode && referralCode !== user.referralCode) {
    user.referralCode = referralCode;
    try {
      await dynamo.send(
        new UpdateCommand({
          TableName: env.usersTable,
          Key: { userId: claims.sub },
          UpdateExpression: "SET referralCode = :code",
          ExpressionAttributeValues: { ":code": referralCode }
        })
      );
    } catch (error) {
      console.error("[referral] backfill failed", error?.message || error);
    }
  } else if (referralCode) {
    user.referralCode = referralCode;
  }

  // Retroactively credit the profile-completion bonus for accounts that were
  // already 100% complete before the points feature shipped.
  const delta = await awardProfileCompletionIfEligible(claims.sub, user);
  if (delta) {
    user.points = (user.points || 0) + delta;
    user.awardedProfileComplete = true;
  }

  return response(200, await decorateUserMedia(user));
}

function getStoredUserDocuments(user) {
  return [
    ...(user?.cvDocument ? [user.cvDocument] : []),
    ...(Array.isArray(user?.documents) ? user.documents : [])
  ].filter((item) => item?.storageKey);
}

async function createMyDocumentDownloadUrl(event) {
  const claims = requireAuth(event);
  const body = parseBody(event);
  const storageKey = String(body.storageKey || "").trim();

  if (!storageKey) {
    return badRequest("storageKey is required.");
  }

  const user = await getUserBySub(claims.sub);

  if (!user) {
    return notFound("Profile not found.");
  }

  const document = getStoredUserDocuments(user).find((item) => item.storageKey === storageKey);

  if (!document) {
    return forbidden("Document is not owned by this user.");
  }

  return response(200, {
    downloadUrl: await getSignedObjectUrl(document.storageKey, { purpose: "document" }),
    expiresIn: 900
  });
}

async function updateMeProfile(event) {
  const claims = requireAuth(event);
  const body = parseBody(event);
  const current = await getUserBySub(claims.sub);

  if (!current) {
    return notFound("Profile not found.");
  }

  const nextUser = {
    ...current,
    name: normalizeText(body.name, current.name, 120),
    avatarUrl: normalizeText(body.avatarUrl, current.avatarUrl ?? "", 2000),
    avatarStorageKey: assertOwnedStorageKey(
      body.avatarStorageKey,
      current.avatarStorageKey,
      [`profiles/${claims.sub}/avatar/`],
      "avatar storage key"
    ),
    city: normalizeText(body.city, current.city, 120),
    occupation: normalizeText(body.occupation, current.occupation ?? "", 140),
    age:
      body.age === null
        ? null
        : normalizeBoundedNumber(body.age, current.age ?? null, {
            min: 18,
            max: 95,
            integer: true
          }),
    headline: normalizeText(body.headline, current.headline, 180),
    bio: normalizeText(body.bio, current.bio, 2400),
    experienceSummary: normalizeText(
      body.experienceSummary,
      current.experienceSummary ?? "",
      1200
    ),
    experienceHighlights: normalizeStringList(
      body.experienceHighlights,
      current.experienceHighlights ?? []
    ),
    educationHighlights: normalizeStringList(
      body.educationHighlights,
      current.educationHighlights ?? []
    ),
    skills: normalizeStringList(body.skills, current.skills ?? []),
    interests: normalizeStringList(body.interests, current.interests ?? []),
    keywords: normalizeStringList(body.keywords, current.keywords ?? []),
    goals: normalizeText(body.goals, current.goals ?? "", 1600),
    preferredSessionModes: normalizeStringList(
      body.preferredSessionModes,
      current.preferredSessionModes ?? []
    ),
    plan: normalizePlanTier(current.plan, "free"),
    cvDocument: normalizeCvDocument(body.cvDocument, current.cvDocument, claims.sub),
    documents: normalizeUserDocuments(body.documents, current.documents, claims.sub),
    updatedAt: new Date().toISOString()
  };

  await assertDocumentSharingAllowed(claims.sub, nextUser, body);

  await dynamo.send(
    new PutCommand({
      TableName: env.usersTable,
      Item: nextUser
    })
  );

  try {
    const previousKeys = [
      current.cvDocument?.storageKey,
      ...(Array.isArray(current.documents) ? current.documents.map((d) => d.storageKey) : [])
    ].filter(Boolean);
    const nextKeys = [
      nextUser.cvDocument?.storageKey,
      ...(Array.isArray(nextUser.documents) ? nextUser.documents.map((d) => d.storageKey) : [])
    ].filter(Boolean);
    await deleteOrphanedStorageKeys(previousKeys, nextKeys);
  } catch (error) {
    console.error("[profile] orphan cleanup failed", error?.message || error);
  }

  // Points: first time a client's profile reaches 100% -> +20 (and pay the
  // referrer +30, once). Shared with getMeProfile so it's awarded consistently.
  let resultUser = nextUser;
  const delta = await awardProfileCompletionIfEligible(claims.sub, nextUser);
  if (delta) {
    resultUser = {
      ...nextUser,
      awardedProfileComplete: true,
      points: (nextUser.points || 0) + delta
    };
  }

  return response(200, await decorateUserMedia(resultUser));
}

async function getMyConsultant(event) {
  const claims = requireAuth(event);
  const consultant = await getConsultantByOwner(claims.sub);

  if (!consultant) {
    return notFound("Consultant profile not found.");
  }

  return response(200, await decorateConsultantMedia(consultant));
}

async function updateMyConsultant(event) {
  const claims = requireAuth(event);
  const body = parseBody(event);
  const user = await getUserBySub(claims.sub);

  if (!user || user.role !== "consultant") {
    return forbidden("Only consultant accounts can manage consultant profiles.");
  }

  const current = await getConsultantByOwner(claims.sub);
  const baseConsultant =
    current ||
    createConsultantDraft({
      userId: claims.sub,
      name: user.name,
      email: user.email,
      plan: user.plan,
      profileType: normalizeConsultantProfileType(body.profileType),
      city: user.city,
      headline: user.headline
    });

  const planFields = getConsultantPlanFields(user.plan);
  const preservedVisibility = {
    isPublic: baseConsultant.isPublic ?? INITIAL_CONSULTANT_VISIBILITY.isPublic,
    profileStatus:
      baseConsultant.profileStatus || INITIAL_CONSULTANT_VISIBILITY.profileStatus
  };
  const requestedTheme = normalizeConsultantTheme(body.theme, baseConsultant.theme || "");
  const now = new Date().toISOString();

  const normalizedSlug = body.slug ? normalizeSlug(body.slug, baseConsultant.slug) : null;
  const previousSlug = current?.slug || null;

  const { mapImageUrl, ...baseConsultantWithoutDeprecatedMedia } = baseConsultant;

  const nextConsultant = {
    ...baseConsultantWithoutDeprecatedMedia,
    profileType: normalizeConsultantProfileType(
      body.profileType,
      baseConsultant.profileType ?? "consultant"
    ),
    slug: normalizedSlug || baseConsultant.slug,
    name: normalizeText(body.name, baseConsultant.name, 120),
    headline: normalizeText(body.headline, baseConsultant.headline, 180),
    bio: normalizeText(body.bio, baseConsultant.bio, 2800),
    experienceSummary: normalizeText(
      body.experienceSummary,
      baseConsultant.experienceSummary ?? "",
      1400
    ),
    experienceHighlights: normalizeStringList(
      body.experienceHighlights,
      baseConsultant.experienceHighlights ?? []
    ),
    educationHighlights: normalizeStringList(
      body.educationHighlights,
      baseConsultant.educationHighlights ?? []
    ),
    city: normalizeText(body.city, baseConsultant.city, 120),
    experienceYears: normalizeBoundedNumber(
      body.experienceYears,
      baseConsultant.experienceYears ?? 0,
      { min: 0, max: 70, integer: true }
    ),
    priceEur: normalizeConsultantPriceEur(
      typeof body.priceEur === "undefined" ? baseConsultant : body.priceEur,
      normalizeConsultantPriceEur(baseConsultant)
    ),
    featured: baseConsultant.featured ?? false,
    // Active membership flows from an admin invite (comped) — preserve it, and
    // pick it up from the owner's user record for a freshly-created draft.
    comped: baseConsultant.comped === true || user.compedConsultant === true,
    restricted: baseConsultant.restricted === true,
    rating: baseConsultant.rating ?? 0,
    reviewCount: baseConsultant.reviewCount ?? 0,
    theme: normalizePlanTier(user.plan, "free") === "pro" ? requestedTheme : "",
    avatarUrl: normalizeText(body.avatarUrl, baseConsultant.avatarUrl ?? "", 2000),
    heroUrl: normalizeText(body.heroUrl, baseConsultant.heroUrl ?? "", 2000),
    avatarStorageKey: assertOwnedStorageKey(
      body.avatarStorageKey,
      baseConsultant.avatarStorageKey,
      [`consultants/${claims.sub}/avatar/`],
      "consultant avatar storage key"
    ),
    heroStorageKey: assertOwnedStorageKey(
      body.heroStorageKey,
      baseConsultant.heroStorageKey,
      [`consultants/${claims.sub}/hero/`],
      "consultant banner storage key"
    ),
    languages: normalizeStringList(body.languages, baseConsultant.languages ?? []),
    specializations: normalizeStringList(
      body.specializations,
      baseConsultant.specializations ?? []
    ),
    sessionModes: normalizeStringList(
      body.sessionModes,
      baseConsultant.sessionModes ?? ["Онлайн"]
    ),
    tags: normalizeStringList(body.tags, baseConsultant.tags ?? []),
    idealFor: normalizeStringList(body.idealFor, baseConsultant.idealFor ?? []),
    consultationTopics: normalizeStringList(
      body.consultationTopics,
      baseConsultant.consultationTopics ?? []
    ),
    workApproach: normalizeText(
      body.workApproach,
      baseConsultant.workApproach ?? "",
      1800
    ),
    sessionLengthMinutes: normalizeBoundedNumber(
      body.sessionLengthMinutes,
      baseConsultant.sessionLengthMinutes ?? 60,
      { min: 15, max: 240, integer: true }
    ),
    availability: normalizeAvailabilitySlots(
      body.availability ?? baseConsultant.availability ?? [],
      []
    ),
    createdAt: baseConsultant.createdAt || now,
    updatedAt: now,
    ...preservedVisibility,
    ...planFields
  };

  nextConsultant.nextAvailable = getNextAvailableSlot(
    nextConsultant.availability,
    baseConsultant.nextAvailable || ""
  );
  delete nextConsultant.priceBgn;

  // Auto-publish: an ACTIVE (paid or admin-invited/comped) consultant whose
  // profile is complete becomes public automatically — no admin approval step.
  // Inactive accounts never go public; they must be invited or pay first.
  if (
    consultantMembershipActive(nextConsultant) &&
    nextConsultant.isPublic !== true &&
    isConsultantProfileReadyForAutoApprove(nextConsultant)
  ) {
    nextConsultant.isPublic = true;
    nextConsultant.autoPublishedAt = new Date().toISOString();
  }

  try {
    await putConsultantWithSlugClaim({
      consultant: nextConsultant,
      previousSlug
    });
  } catch (error) {
    if (error instanceof SlugConflictError) {
      return badRequest("This slug is already in use.");
    }
    throw error;
  }

  // Keep the user-account display fields in sync so dashboard greetings,
  // emails and matched-consultant cards reflect the consultant's latest profile.
  try {
    await dynamo.send(
      new UpdateCommand({
        TableName: env.usersTable,
        Key: { userId: claims.sub },
        UpdateExpression:
          "SET #n = :name, headline = :headline, city = :city, " +
          "avatarUrl = :avatarUrl, avatarStorageKey = :avatarStorageKey, updatedAt = :now",
        ExpressionAttributeNames: { "#n": "name" },
        ExpressionAttributeValues: {
          ":name": nextConsultant.name,
          ":headline": nextConsultant.headline,
          ":city": nextConsultant.city,
          ":avatarUrl": nextConsultant.avatarUrl,
          ":avatarStorageKey": nextConsultant.avatarStorageKey || "",
          ":now": new Date().toISOString()
        }
      })
    );
  } catch (error) {
    console.error("[consultant] user-sync failure", error?.message || error);
  }

  return response(200, await decorateConsultantMedia(nextConsultant));
}

async function createUploadUrl(event) {
  const claims = requireAuth(event);
  const body = parseBody(event);

  if (!body.fileName) {
    return badRequest("fileName is required.");
  }

  const kind = normalizeUploadKind(body.kind);

  if (!kind) {
    return badRequest("Invalid upload kind.");
  }

  const uploadValidationError = validateUploadRequest({
    kind,
    contentType: body.contentType,
    fileSize: body.fileSize
  });

  if (uploadValidationError) {
    return badRequest(uploadValidationError);
  }

  // Per-user document quota: sum the bytes the user already has stored
  // and reject if this upload would put them over 50 MB total. Applies
  // to cv + document kinds; avatars/consultant-media are not counted.
  if (kind === "cv" || kind === "document") {
    const fileSize = Number(body.fileSize) || 0;
    const user = await getUserBySub(claims.sub);
    let usedBytes = 0;
    if (user?.cvDocument?.sizeBytes) {
      usedBytes += Number(user.cvDocument.sizeBytes) || 0;
    }
    for (const doc of Array.isArray(user?.documents) ? user.documents : []) {
      usedBytes += Number(doc?.sizeBytes) || 0;
    }
    if (usedBytes + fileSize > MAX_USER_TOTAL_DOCUMENT_BYTES) {
      const remainingMb = Math.max(
        0,
        Math.floor((MAX_USER_TOTAL_DOCUMENT_BYTES - usedBytes) / (1024 * 1024))
      );
      return badRequest(
        `Достигна лимита от 50 MB общо за документи. Свободни още ${remainingMb} MB.`
      );
    }
  }

  const safeFileName = sanitizeFileName(body.fileName);
  const storageKey =
    kind === "cv" || kind === "document"
      ? `profiles/${claims.sub}/documents/${Date.now()}-${safeFileName}`
      : kind === "user-avatar"
        ? `profiles/${claims.sub}/avatar/${Date.now()}-${safeFileName}`
      : `consultants/${claims.sub}/${kind}/${Date.now()}-${safeFileName}`;
  const command = new PutObjectCommand({
    Bucket: env.cvBucket,
    Key: storageKey,
    ContentType: body.contentType || "application/octet-stream"
  });

  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });

  return response(200, {
    uploadUrl,
    storageKey,
    document: {
      fileName: body.fileName,
      storageKey,
      uploadedAt: new Date().toISOString(),
      sizeBytes: Number(body.fileSize) || undefined
    }
  });
}

async function createBooking(event) {
  const claims = requireAuth(event);
  const body = parseBody(event);

  if (!body.consultantId || !body.scheduledAt) {
    return badRequest("consultantId and scheduledAt are required.");
  }

  const scheduledDate = new Date(String(body.scheduledAt || ""));

  if (Number.isNaN(scheduledDate.getTime())) {
    return badRequest("scheduledAt must be a valid ISO date.");
  }

  if (scheduledDate.getTime() <= Date.now() + 5 * 60 * 1000) {
    return badRequest("The selected booking time must be in the future.");
  }

  const user = await getUserBySub(claims.sub);

  if (!user) {
    return notFound("User profile not found.");
  }

  if (user.role !== "client") {
    return forbidden("Only users can create consultation bookings.");
  }

  const consultantResult = await dynamo.send(
    new GetCommand({
      TableName: env.consultantsTable,
      Key: { consultantId: body.consultantId }
    })
  );
  const consultant = consultantResult.Item;

  if (!consultant) {
    return notFound("Consultant not found.");
  }

  if (!isVisibleConsultant(consultant)) {
    return badRequest("Consultant profile is not yet approved.");
  }

  if (consultant.ownerUserId === user.userId) {
    return badRequest("You cannot book your own consultant profile.");
  }

  const normalizedAvailability = normalizeAvailabilitySlots(consultant.availability || [], []);
  const normalizedScheduledAt = scheduledDate.toISOString();

  if (!normalizedAvailability.includes(normalizedScheduledAt)) {
    return badRequest("The selected slot is no longer available.");
  }

  const existingBookings = await queryAllItems({
    TableName: env.bookingsTable,
    IndexName: "consultant-index",
    KeyConditionExpression: "consultantId = :consultantId",
    ExpressionAttributeValues: {
      ":consultantId": consultant.consultantId
    }
  });

  const sessionLengthMinutes =
    Number(consultant.sessionLengthMinutes) > 0
      ? Number(consultant.sessionLengthMinutes)
      : 60;
  const sessionMs = sessionLengthMinutes * 60 * 1000;
  const newStart = scheduledDate.getTime();
  const newEnd = newStart + sessionMs;

  const hasConflictingBooking = existingBookings.some((item) => {
    if (item.status === "cancelled") return false;
    const existingStart = new Date(item.scheduledAt).getTime();
    if (Number.isNaN(existingStart)) return false;
    const existingEnd = existingStart + sessionMs;
    return newStart < existingEnd && existingStart < newEnd;
  });

  if (hasConflictingBooking) {
    return badRequest(
      "Този час се припокрива с друга активна резервация. Избери различен час."
    );
  }

  // Per-(client, consultant) rate limit: at most 5 active bookings against the
  // same consultant in any rolling 24h window. Defends against accidental
  // duplicate submits and intentional spam without locking out legit re-bookings.
  const last24h = Date.now() - 24 * 60 * 60 * 1000;
  const recentBookings = existingBookings.filter((item) => {
    if (item.clientId !== user.userId) return false;
    if (item.status === "cancelled" || item.status === "declined") return false;
    const createdAt = new Date(item.createdAt || 0).getTime();
    return createdAt >= last24h;
  });

  if (recentBookings.length >= 5) {
    return response(429, {
      message:
        "Достигна лимита от 5 активни резервации с този консултант за 24 часа. Опитай отново по-късно."
    });
  }

  // Redeem points for a free consultation (decided at booking time). The points
  // deduction is part of the booking transaction below, so it's all-or-nothing.
  const useFreePoints = body.useFreePoints === true;
  if (useFreePoints && (Number(user.points) || 0) < POINTS.freeConsultation) {
    return badRequest(
      `Нямаш достатъчно точки. Безплатна консултация струва ${POINTS.freeConsultation} точки.`
    );
  }

  const booking = {
    bookingId: `booking-${randomUUID()}`,
    consultantId: consultant.consultantId,
    consultantName: consultant.name,
    clientId: user.userId,
    clientName: user.name || "",
    clientEmail: user.email || "",
    scheduledAt: normalizedScheduledAt,
    sessionLengthMinutes,
    status: "pending",
    // Payment gate: "free" (redeemed with points) reveals the meeting link once
    // the consultant adds it; "unpaid" stays gated until Stripe (or admin marks
    // it paid). The link is only released to the client when free/paid.
    paymentStatus: useFreePoints ? "free" : "unpaid",
    freeViaPoints: useFreePoints,
    meetingLink: "",
    note: String(body.note || "").trim().slice(0, 1200),
    createdAt: new Date().toISOString()
  };

  const bookingTransactItems = [
    {
      Update: {
        TableName: env.consultantsTable,
        Key: { consultantId: consultant.consultantId },
        UpdateExpression:
          "SET bookedSlots = list_append(if_not_exists(bookedSlots, :emptySlots), :slotList)",
        ConditionExpression:
          "contains(availability, :scheduledAt) AND (attribute_not_exists(bookedSlots) OR NOT contains(bookedSlots, :scheduledAt))",
        ExpressionAttributeValues: {
          ":scheduledAt": normalizedScheduledAt,
          ":emptySlots": [],
          ":slotList": [normalizedScheduledAt]
        }
      }
    },
    {
      Put: {
        TableName: env.bookingsTable,
        Item: booking,
        ConditionExpression: "attribute_not_exists(bookingId)"
      }
    }
  ];

  if (useFreePoints) {
    bookingTransactItems.push({
      Update: {
        TableName: env.usersTable,
        Key: { userId: user.userId },
        UpdateExpression:
          "SET points = points - :cost, " +
          "pointsHistory = list_append(if_not_exists(pointsHistory, :empty), :entry)",
        ConditionExpression: "points >= :cost",
        ExpressionAttributeValues: {
          ":cost": POINTS.freeConsultation,
          ":empty": [],
          ":entry": [
            pointsHistoryEntry(-POINTS.freeConsultation, "redeem", "Безплатна консултация")
          ]
        }
      }
    });
  }

  try {
    await dynamo.send(new TransactWriteCommand({ TransactItems: bookingTransactItems }));
  } catch (error) {
    if (error.name === "TransactionCanceledException") {
      return badRequest(
        useFreePoints
          ? "Слотът вече е зает или точките ти не достигат. Опитай отново."
          : "The selected slot already has an active booking request."
      );
    }

    throw error;
  }

  try {
    const consultantOwner = await getUserBySub(consultant.ownerUserId);
    await sendBookingRequestedEmails({
      consultantOwner,
      consultant,
      client: user,
      booking
    });
  } catch (error) {
    console.error("[booking] notification failure", error?.message || error);
  }

  // In-app notifications for both parties — independent of email delivery so
  // they appear on the dashboard even if SES sandbox / verification blocks
  // the outbound mail.
  const whenLabel = formatBookingDateTimeBg(booking.scheduledAt);
  await appendUserNotification(consultant.ownerUserId, {
    type: "booking_requested",
    title: `Нова заявка от ${booking.clientName || "потребител"}`,
    body: `Час: ${whenLabel}. Отвори таблото, за да приемеш или откажеш.`
  });
  await appendUserNotification(user.userId, {
    type: "booking_requested",
    title: `Заявката ти за ${consultant.name} е изпратена`,
    body: `Час: ${whenLabel}. Ще получиш известие при отговор от консултанта.`
  });

  return response(201, booking);
}

async function loadBookingAndConsultant(bookingId) {
  const bookingResult = await dynamo.send(
    new GetCommand({
      TableName: env.bookingsTable,
      Key: { bookingId }
    })
  );
  const booking = bookingResult.Item;
  if (!booking) return { booking: null, consultant: null };

  const consultantResult = await dynamo.send(
    new GetCommand({
      TableName: env.consultantsTable,
      Key: { consultantId: booking.consultantId }
    })
  );
  return { booking, consultant: consultantResult.Item || null };
}

function getBookingSessionEndMs(booking, consultant) {
  const sessionLengthMinutes =
    Number(booking?.sessionLengthMinutes) > 0
      ? Number(booking.sessionLengthMinutes)
      : Number(consultant?.sessionLengthMinutes) > 0
        ? Number(consultant.sessionLengthMinutes)
        : 60;
  const sessionStartMs = new Date(booking?.scheduledAt || 0).getTime();
  return sessionStartMs + sessionLengthMinutes * 60 * 1000;
}

function getBookingParticipantRole({ claims, booking, consultant }) {
  if (!claims || !booking || !consultant) return null;
  if (booking.clientId === claims.sub) return "client";
  if (consultant.ownerUserId === claims.sub) return "consultant";
  return null;
}

function normalizeBookingMessages(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item) => item && typeof item === "object" && item.body)
    .map((item) => ({
      id: String(item.id || `message-${randomUUID()}`),
      senderUserId: String(item.senderUserId || ""),
      senderName: String(item.senderName || "GrowPoint").slice(0, 120),
      senderRole:
        item.senderRole === "consultant" || item.senderRole === "admin"
          ? item.senderRole
          : "client",
      body: String(item.body || "").trim().slice(0, 1200),
      createdAt: String(item.createdAt || new Date().toISOString())
    }))
    .filter((item) => item.body)
    .sort(
      (left, right) =>
        new Date(left.createdAt || 0).getTime() -
        new Date(right.createdAt || 0).getTime()
    )
    .slice(-BOOKING_MESSAGE_KEEP);
}

function getBookingSessionConfirmation(booking) {
  const stored =
    booking && typeof booking.sessionConfirmation === "object" && !Array.isArray(booking.sessionConfirmation)
      ? booking.sessionConfirmation
      : {};

  return {
    clientConfirmedAt: String(stored.clientConfirmedAt || ""),
    consultantConfirmedAt: String(stored.consultantConfirmedAt || "")
  };
}

function isBookingSessionConfirmedByBoth(booking) {
  const confirmation = getBookingSessionConfirmation(booking);
  return Boolean(confirmation.clientConfirmedAt && confirmation.consultantConfirmedAt);
}

async function confirmBookingSession(event) {
  const claims = requireAuth(event);
  const bookingId = event.pathParameters?.bookingId;

  if (!bookingId) return badRequest("bookingId is required.");

  const { booking, consultant } = await loadBookingAndConsultant(bookingId);
  if (!booking) return notFound("Booking not found.");
  if (!consultant) return notFound("Consultant not found.");

  const participantRole = getBookingParticipantRole({ claims, booking, consultant });
  if (!participantRole) {
    return forbidden("Not allowed to confirm this session.");
  }

  if (booking.status !== "confirmed") {
    return badRequest("Само потвърдени резервации могат да бъдат маркирани като проведени.");
  }

  const sessionEndMs = getBookingSessionEndMs(booking, consultant);
  if (sessionEndMs > Date.now()) {
    return badRequest("Сесията още не е приключила.");
  }

  const confirmation = getBookingSessionConfirmation(booking);
  const field =
    participantRole === "client"
      ? "clientConfirmedAt"
      : "consultantConfirmedAt";

  if (confirmation[field]) {
    return response(200, {
      ...booking,
      sessionConfirmation: confirmation
    });
  }

  const now = new Date().toISOString();
  const nextConfirmation = {
    ...confirmation,
    [field]: now
  };

  await dynamo.send(
    new UpdateCommand({
      TableName: env.bookingsTable,
      Key: { bookingId },
      UpdateExpression: "SET sessionConfirmation = :confirmation",
      ConditionExpression: "#s = :confirmed",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: {
        ":confirmation": nextConfirmation,
        ":confirmed": "confirmed"
      }
    })
  );

  const updated = {
    ...booking,
    sessionConfirmation: nextConfirmation
  };
  const otherUserId =
    participantRole === "client" ? consultant.ownerUserId : booking.clientId;
  await appendUserNotification(otherUserId, {
    type: "session_confirmed",
    title:
      participantRole === "client"
        ? `${booking.clientName || "Потребител"} потвърди проведената сесия`
        : `${consultant.name || booking.consultantName || "Консултант"} потвърди проведената сесия`,
    body: isBookingSessionConfirmedByBoth(updated)
      ? "И двете страни потвърдиха срещата. Отзивът вече може да бъде оставен от потребителя."
      : "Очаква се потвърждение и от другата страна."
  });

  // Both parties confirmed an attended session -> award the client points (once).
  if (isBookingSessionConfirmedByBoth(updated)) {
    if (await setBookingFlagOnce(bookingId, "pointsAwardedSession")) {
      await addPointsEntry(
        booking.clientId,
        POINTS.sessionConfirmed,
        "session",
        "Проведена и потвърдена консултация"
      );
    }
  }

  return response(200, updated);
}

function assertConfirmedBookingThread({ booking, participantRole }) {
  if (!participantRole) {
    throw Object.assign(new Error("Not allowed to access this booking thread."), {
      statusCode: 403
    });
  }
  if (booking.status !== "confirmed") {
    throw Object.assign(
      new Error("Съобщенията са достъпни само за потвърдени сесии."),
      { statusCode: 400 }
    );
  }
}

async function listBookingMessages(event) {
  const claims = requireAuth(event);
  const bookingId = event.pathParameters?.bookingId;

  if (!bookingId) return badRequest("bookingId is required.");

  const { booking, consultant } = await loadBookingAndConsultant(bookingId);
  if (!booking) return notFound("Booking not found.");
  if (!consultant) return notFound("Consultant not found.");

  const participantRole = getBookingParticipantRole({ claims, booking, consultant });
  assertConfirmedBookingThread({ booking, participantRole });

  return response(200, { items: normalizeBookingMessages(booking.messages) });
}

async function sendBookingMessage(event) {
  const claims = requireAuth(event);
  const bookingId = event.pathParameters?.bookingId;
  const body = parseBody(event);

  if (!bookingId) return badRequest("bookingId is required.");

  const messageBody = String(body.body || "").trim().slice(0, 1200);
  if (messageBody.length < 1) {
    return badRequest("Съобщението не може да бъде празно.");
  }

  const { booking, consultant } = await loadBookingAndConsultant(bookingId);
  if (!booking) return notFound("Booking not found.");
  if (!consultant) return notFound("Consultant not found.");

  const participantRole = getBookingParticipantRole({ claims, booking, consultant });
  assertConfirmedBookingThread({ booking, participantRole });

  const senderUser = await getUserBySub(claims.sub);
  const message = {
    id: `message-${randomUUID()}`,
    senderUserId: claims.sub,
    senderName:
      senderUser?.name ||
      (participantRole === "consultant"
        ? consultant.name || booking.consultantName
        : booking.clientName) ||
      claims.email ||
      "GrowPoint",
    senderRole: participantRole,
    body: messageBody,
    createdAt: new Date().toISOString()
  };
  const nextMessages = normalizeBookingMessages([...(booking.messages || []), message]);

  await dynamo.send(
    new UpdateCommand({
      TableName: env.bookingsTable,
      Key: { bookingId },
      UpdateExpression: "SET messages = :messages",
      ConditionExpression: "#s = :confirmed",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: {
        ":messages": nextMessages,
        ":confirmed": "confirmed"
      }
    })
  );

  const otherUserId =
    participantRole === "client" ? consultant.ownerUserId : booking.clientId;
  await appendUserNotification(otherUserId, {
    type: "message_received",
    title:
      participantRole === "client"
        ? `Ново съобщение от ${booking.clientName || "потребител"}`
        : `Ново съобщение от ${consultant.name || booking.consultantName || "консултант"}`,
    body: `${messageBody.slice(0, 160)}${messageBody.length > 160 ? "..." : ""}`
  });

  return response(201, {
    booking: {
      ...booking,
      messages: nextMessages
    },
    message
  });
}

async function acceptBooking({ claims, bookingId, meetingLink }) {
  const { booking, consultant } = await loadBookingAndConsultant(bookingId);

  if (!booking) return notFound("Booking not found.");
  if (!consultant) return notFound("Consultant not found.");
  if (consultant.ownerUserId !== claims.sub) {
    return forbidden("Only the consultant can accept this booking.");
  }
  if (booking.status === "confirmed") {
    return response(200, booking);
  }
  if (booking.status !== "pending") {
    return badRequest("Only pending bookings can be accepted.");
  }

  const normalizedLink = normalizeMeetingLink(meetingLink);
  if (typeof meetingLink === "string" && meetingLink.trim() && !normalizedLink) {
    return badRequest("Линкът за срещата трябва да е валиден https адрес.");
  }

  const now = new Date().toISOString();

  await dynamo.send(
    new UpdateCommand({
      TableName: env.bookingsTable,
      Key: { bookingId },
      UpdateExpression:
        "SET #s = :confirmed, decidedAt = :now" +
        (normalizedLink ? ", meetingLink = :link" : ""),
      ConditionExpression: "#s = :pending",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: normalizedLink
        ? { ":confirmed": "confirmed", ":pending": "pending", ":now": now, ":link": normalizedLink }
        : { ":confirmed": "confirmed", ":pending": "pending", ":now": now }
    })
  );

  const updated = {
    ...booking,
    status: "confirmed",
    decidedAt: now,
    ...(normalizedLink ? { meetingLink: normalizedLink } : {})
  };

  try {
    const consultantOwner = await getUserBySub(consultant.ownerUserId);
    const client = await getUserBySub(booking.clientId);
    await sendBookingAcceptedEmails({
      consultantOwner,
      consultant,
      client: client || { email: booking.clientEmail, name: booking.clientName },
      booking: updated
    });
  } catch (error) {
    console.error("[booking] accept email failure", error?.message || error);
  }

  const acceptWhen = formatBookingDateTimeBg(booking.scheduledAt);
  await appendUserNotification(booking.clientId, {
    type: "booking_accepted",
    title: `${consultant.name} потвърди резервацията`,
    body: `Час: ${acceptWhen}. Ще получиш напомняне 24 часа преди срещата.`
  });
  await appendUserNotification(consultant.ownerUserId, {
    type: "booking_accepted",
    title: `Потвърди консултация с ${booking.clientName || "потребител"}`,
    body: `Час: ${acceptWhen}.`
  });

  return response(200, updated);
}

async function declineBooking({ claims, bookingId, reason }) {
  const { booking, consultant } = await loadBookingAndConsultant(bookingId);

  if (!booking) return notFound("Booking not found.");
  if (!consultant) return notFound("Consultant not found.");
  if (consultant.ownerUserId !== claims.sub) {
    return forbidden("Only the consultant can decline this booking.");
  }
  if (booking.status === "declined") {
    return response(200, booking);
  }
  if (booking.status !== "pending") {
    return badRequest("Only pending bookings can be declined.");
  }

  const now = new Date().toISOString();
  const trimmedReason = String(reason || "").trim().slice(0, 600);
  const nextBookedSlots = Array.isArray(consultant.bookedSlots)
    ? consultant.bookedSlots.filter((slot) => slot !== booking.scheduledAt)
    : [];

  const declineUpdate = {
    TableName: env.bookingsTable,
    Key: { bookingId },
    UpdateExpression: "SET #s = :declined, decidedAt = :now" + (trimmedReason ? ", declineReason = :reason" : ""),
    ConditionExpression: "#s = :pending",
    ExpressionAttributeNames: { "#s": "status" },
    ExpressionAttributeValues: trimmedReason
      ? { ":declined": "declined", ":pending": "pending", ":now": now, ":reason": trimmedReason }
      : { ":declined": "declined", ":pending": "pending", ":now": now }
  };

  await dynamo.send(
    new TransactWriteCommand({
      TransactItems: [
        { Update: declineUpdate },
        {
          Update: {
            TableName: env.consultantsTable,
            Key: { consultantId: consultant.consultantId },
            UpdateExpression: "SET bookedSlots = :slots",
            ExpressionAttributeValues: { ":slots": nextBookedSlots }
          }
        }
      ]
    })
  );

  const updated = {
    ...booking,
    status: "declined",
    decidedAt: now,
    ...(trimmedReason ? { declineReason: trimmedReason } : {})
  };

  await refundFreePointsIfNeeded(booking);

  try {
    const client = await getUserBySub(booking.clientId);
    await sendBookingDeclinedEmail({
      recipient: client || { email: booking.clientEmail, name: booking.clientName },
      consultant,
      booking: updated,
      reason: trimmedReason
    });
  } catch (error) {
    console.error("[booking] decline email failure", error?.message || error);
  }

  await appendUserNotification(booking.clientId, {
    type: "booking_declined",
    title: `${consultant.name} не може да поеме заявката`,
    body: trimmedReason
      ? `Причина: ${trimmedReason}. Можеш да избереш друг час или друг консултант.`
      : "Можеш да избереш друг час или друг консултант."
  });

  return response(200, updated);
}

async function rescheduleBooking(event) {
  const claims = requireAuth(event);
  const bookingId = event.pathParameters?.bookingId;
  const body = parseBody(event);

  if (!bookingId) return badRequest("bookingId is required.");

  const newScheduledAt = new Date(String(body.scheduledAt || ""));
  if (Number.isNaN(newScheduledAt.getTime())) {
    return badRequest("scheduledAt must be a valid ISO date.");
  }
  if (newScheduledAt.getTime() <= Date.now() + 5 * 60 * 1000) {
    return badRequest("The new time must be in the future.");
  }

  const { booking, consultant } = await loadBookingAndConsultant(bookingId);
  if (!booking) return notFound("Booking not found.");
  if (!consultant) return notFound("Consultant not found.");

  const isClient = booking.clientId === claims.sub;
  const isConsultantOwner = consultant.ownerUserId === claims.sub;
  if (!isClient && !isConsultantOwner) {
    return forbidden("Not allowed to reschedule this booking.");
  }

  if (booking.status !== "pending" && booking.status !== "confirmed") {
    return badRequest("Only pending or confirmed bookings can be rescheduled.");
  }

  const oldScheduledAt = booking.scheduledAt;
  const normalizedNew = newScheduledAt.toISOString();
  if (normalizedNew === oldScheduledAt) {
    return badRequest("Новият час е същият като текущия.");
  }

  const availability = normalizeAvailabilitySlots(consultant.availability || [], []);
  if (!availability.includes(normalizedNew)) {
    return badRequest("The new slot is not in the consultant's availability.");
  }

  // Check the new slot isn't already taken by another booking
  const existingBookings = await queryAllItems({
    TableName: env.bookingsTable,
    IndexName: "consultant-index",
    KeyConditionExpression: "consultantId = :consultantId",
    ExpressionAttributeValues: { ":consultantId": consultant.consultantId }
  });
  const sessionMs =
    (Number(consultant.sessionLengthMinutes) || 60) * 60 * 1000;
  const newStart = newScheduledAt.getTime();
  const newEnd = newStart + sessionMs;
  const hasConflict = existingBookings.some((item) => {
    if (item.bookingId === bookingId) return false;
    if (item.status === "cancelled" || item.status === "declined") return false;
    const start = new Date(item.scheduledAt).getTime();
    if (Number.isNaN(start)) return false;
    const end = start + sessionMs;
    return newStart < end && start < newEnd;
  });
  if (hasConflict) {
    return badRequest(
      "Този час се припокрива с друга активна резервация. Избери различен."
    );
  }

  // Client-initiated reschedule of a confirmed booking → back to pending (consultant must re-accept).
  // Consultant-initiated reschedule keeps current status (or pending stays pending).
  const nextStatus =
    isClient && booking.status === "confirmed" ? "pending" : booking.status;

  const currentBookedSlots = Array.isArray(consultant.bookedSlots)
    ? consultant.bookedSlots
    : [];
  const nextBookedSlots = currentBookedSlots.filter((s) => s !== oldScheduledAt);
  if (!nextBookedSlots.includes(normalizedNew)) {
    nextBookedSlots.push(normalizedNew);
  }

  const now = new Date().toISOString();
  const rescheduledBy = isConsultantOwner ? "consultant" : "client";

  try {
    await dynamo.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: env.bookingsTable,
              Key: { bookingId },
              UpdateExpression:
                "SET scheduledAt = :new, #s = :status, rescheduledAt = :now, rescheduledBy = :actor, " +
                "rescheduleCount = if_not_exists(rescheduleCount, :zero) + :one",
              ConditionExpression:
                "(#s = :pending OR #s = :confirmed) AND scheduledAt = :oldAt",
              ExpressionAttributeNames: { "#s": "status" },
              ExpressionAttributeValues: {
                ":new": normalizedNew,
                ":oldAt": oldScheduledAt,
                ":status": nextStatus,
                ":pending": "pending",
                ":confirmed": "confirmed",
                ":now": now,
                ":actor": rescheduledBy,
                ":zero": 0,
                ":one": 1
              }
            }
          },
          {
            Update: {
              TableName: env.consultantsTable,
              Key: { consultantId: consultant.consultantId },
              UpdateExpression: "SET bookedSlots = :slots",
              ExpressionAttributeValues: { ":slots": nextBookedSlots }
            }
          }
        ]
      })
    );
  } catch (error) {
    if (error.name === "TransactionCanceledException") {
      return badRequest("Booking state changed; please refresh and try again.");
    }
    throw error;
  }

  const updated = {
    ...booking,
    scheduledAt: normalizedNew,
    status: nextStatus,
    rescheduledAt: now,
    rescheduledBy,
    rescheduleCount: (Number(booking.rescheduleCount) || 0) + 1
  };

  try {
    const consultantOwner = await getUserBySub(consultant.ownerUserId);
    const client = await getUserBySub(booking.clientId);
    await sendBookingRescheduledEmails({
      consultantOwner,
      consultant,
      client: client || { email: booking.clientEmail, name: booking.clientName },
      booking: updated,
      previousScheduledAt: oldScheduledAt,
      rescheduledBy,
      needsReConfirmation: nextStatus === "pending"
    });
  } catch (error) {
    console.error("[booking] reschedule email failure", error?.message || error);
  }

  // Notify only the OTHER party (the actor knows they did the action).
  const otherUserId =
    rescheduledBy === "consultant" ? booking.clientId : consultant.ownerUserId;
  const newWhen = formatBookingDateTimeBg(normalizedNew);
  const oldWhen = formatBookingDateTimeBg(oldScheduledAt);
  await appendUserNotification(otherUserId, {
    type: "booking_rescheduled",
    title:
      rescheduledBy === "consultant"
        ? `${consultant.name} премести часа на резервацията`
        : `Преместен час за консултация с ${booking.clientName || "потребител"}`,
    body:
      `${oldWhen} → ${newWhen}.` +
      (nextStatus === "pending"
        ? " Новият час чака потвърждение."
        : "")
  });

  return response(200, updated);
}

async function updateBookingStatus(event) {
  const claims = requireAuth(event);
  const bookingId = event.pathParameters?.bookingId;
  const body = parseBody(event);
  const requestedStatus = String(body.status || "").trim().toLowerCase();

  if (!bookingId) {
    return badRequest("bookingId is required.");
  }

  if (requestedStatus === "confirmed") {
    return acceptBooking({ claims, bookingId, meetingLink: body.meetingLink });
  }

  if (requestedStatus === "declined") {
    return declineBooking({ claims, bookingId, reason: body.reason });
  }

  if (requestedStatus !== "cancelled") {
    return badRequest("status must be one of: confirmed, declined, cancelled.");
  }

  const bookingResult = await dynamo.send(
    new GetCommand({
      TableName: env.bookingsTable,
      Key: { bookingId }
    })
  );
  const booking = bookingResult.Item;

  if (!booking) {
    return notFound("Booking not found.");
  }

  const consultantResult = await dynamo.send(
    new GetCommand({
      TableName: env.consultantsTable,
      Key: { consultantId: booking.consultantId }
    })
  );
  const consultant = consultantResult.Item;
  const isOwnerConsultant = consultant?.ownerUserId === claims.sub;
  const isClient = booking.clientId === claims.sub;

  if (!isOwnerConsultant && !isClient) {
    return forbidden("Not allowed to cancel this booking.");
  }

  if (booking.status === "cancelled") {
    return response(200, booking);
  }

  const cancelledBy = isOwnerConsultant ? "consultant" : "client";
  const nextBookedSlots = Array.isArray(consultant?.bookedSlots)
    ? consultant.bookedSlots.filter((slot) => slot !== booking.scheduledAt)
    : [];

  const transactItems = [
    {
      Update: {
        TableName: env.bookingsTable,
        Key: { bookingId },
        UpdateExpression:
          "SET #s = :cancelled, cancelledAt = :now, cancelledBy = :actor",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: {
          ":cancelled": "cancelled",
          ":now": new Date().toISOString(),
          ":actor": cancelledBy
        }
      }
    }
  ];

  if (consultant) {
    transactItems.push({
      Update: {
        TableName: env.consultantsTable,
        Key: { consultantId: booking.consultantId },
        UpdateExpression: "SET bookedSlots = :slots",
        ExpressionAttributeValues: { ":slots": nextBookedSlots }
      }
    });
  }

  await dynamo.send(new TransactWriteCommand({ TransactItems: transactItems }));

  const updated = {
    ...booking,
    status: "cancelled",
    cancelledAt: new Date().toISOString(),
    cancelledBy
  };

  await refundFreePointsIfNeeded(booking);

  try {
    if (cancelledBy === "consultant") {
      const client = await getUserBySub(booking.clientId);
      await sendBookingCancelledEmail({
        recipient: client || { email: booking.clientEmail, name: booking.clientName },
        consultantName: booking.consultantName || consultant?.name || "",
        scheduledAt: booking.scheduledAt,
        cancelledBy: "consultant"
      });
    } else if (consultant) {
      const consultantOwner = await getUserBySub(consultant.ownerUserId);
      await sendBookingCancelledEmail({
        recipient: consultantOwner,
        consultantName: booking.consultantName || consultant.name || "",
        scheduledAt: booking.scheduledAt,
        cancelledBy: "client"
      });
    }
  } catch (error) {
    console.error("[booking] cancellation email failure", error?.message || error);
  }

  // Notify the OTHER party in-app (the canceller knows what they did).
  const cancelWhen = formatBookingDateTimeBg(booking.scheduledAt);
  const otherUserId =
    cancelledBy === "consultant" ? booking.clientId : consultant?.ownerUserId;
  if (otherUserId) {
    await appendUserNotification(otherUserId, {
      type: "booking_cancelled",
      title:
        cancelledBy === "consultant"
          ? `${booking.consultantName || consultant?.name || "Консултант"} отказа резервацията`
          : `${booking.clientName || "Потребител"} отказа резервацията`,
      body: `Час: ${cancelWhen}. Слотът отново е свободен в графика.`
    });
  }

  return response(200, updated);
}

function formatIcsTimestamp(date) {
  // VCALENDAR DTSTART/DTEND in UTC: YYYYMMDDTHHMMSSZ
  return (
    date.getUTCFullYear().toString().padStart(4, "0") +
    (date.getUTCMonth() + 1).toString().padStart(2, "0") +
    date.getUTCDate().toString().padStart(2, "0") +
    "T" +
    date.getUTCHours().toString().padStart(2, "0") +
    date.getUTCMinutes().toString().padStart(2, "0") +
    date.getUTCSeconds().toString().padStart(2, "0") +
    "Z"
  );
}

function icsEscape(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function foldIcsLine(line) {
  // RFC 5545 §3.1: lines should not exceed 75 octets — fold with CRLF + space.
  if (line.length <= 75) return line;
  const chunks = [];
  let i = 0;
  while (i < line.length) {
    chunks.push((i === 0 ? "" : " ") + line.slice(i, i + 73));
    i += 73;
  }
  return chunks.join("\r\n");
}

function buildIcsForBooking({ booking, consultant }) {
  const start = new Date(booking.scheduledAt);
  const sessionMs = (Number(consultant.sessionLengthMinutes) || 60) * 60 * 1000;
  const end = new Date(start.getTime() + sessionMs);
  const now = new Date();
  const uid = `${booking.bookingId}@growpoint`;

  const description =
    `Резервация през GrowPoint.\n` +
    `Консултант: ${consultant.name}\n` +
    `Формат: ${(consultant.sessionModes || []).join(", ") || "Онлайн"}\n` +
    (booking.note ? `Бележка: ${booking.note}\n` : "") +
    `Табло: ${APP_DASHBOARD_URL}`;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//GrowPoint//Booking//BG",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${icsEscape(uid)}`,
    `DTSTAMP:${formatIcsTimestamp(now)}`,
    `DTSTART:${formatIcsTimestamp(start)}`,
    `DTEND:${formatIcsTimestamp(end)}`,
    `SUMMARY:${icsEscape(`Консултация с ${consultant.name}`)}`,
    `DESCRIPTION:${icsEscape(description)}`,
    `STATUS:${booking.status === "confirmed" ? "CONFIRMED" : "TENTATIVE"}`,
    "END:VEVENT",
    "END:VCALENDAR"
  ];
  return lines.map(foldIcsLine).join("\r\n");
}

async function downloadBookingIcs(event) {
  const claims = requireAuth(event);
  const bookingId = event.pathParameters?.bookingId;
  if (!bookingId) return badRequest("bookingId is required.");

  const { booking, consultant } = await loadBookingAndConsultant(bookingId);
  if (!booking) return notFound("Booking not found.");
  if (!consultant) return notFound("Consultant not found.");

  const isOwner =
    booking.clientId === claims.sub || consultant.ownerUserId === claims.sub;
  if (!isOwner) return forbidden("Not allowed.");

  const ics = buildIcsForBooking({ booking, consultant });
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="growpoint-${bookingId}.ics"`,
      "Access-Control-Allow-Origin": corsOrigin(),
      "Vary": "Origin",
      "Cache-Control": "no-store"
    },
    body: ics
  };
}

async function submitReview(event) {
  const claims = requireAuth(event);
  const bookingId = event.pathParameters?.bookingId;
  const body = parseBody(event);

  if (!bookingId) return badRequest("bookingId is required.");

  const rating = Number(body.rating);
  if (
    !Number.isFinite(rating) ||
    rating < 1 ||
    rating > 5 ||
    rating !== Math.round(rating)
  ) {
    return badRequest("rating must be an integer between 1 and 5.");
  }
  const comment = String(body.comment || "").trim().slice(0, 600);

  const { booking, consultant } = await loadBookingAndConsultant(bookingId);
  if (!booking) return notFound("Booking not found.");
  if (!consultant) return notFound("Consultant not found.");

  // Only the original client of the booking can review it.
  if (booking.clientId !== claims.sub) {
    return forbidden("Only the client can submit a review.");
  }

  // Hard whitelist on status: the booking must be a confirmed session (both
  // parties committed via accept). Pending / declined / cancelled all block.
  if (booking.status !== "confirmed") {
    if (booking.status === "pending") {
      return badRequest("Резервацията още не е потвърдена от консултанта.");
    }
    if (booking.status === "declined") {
      return badRequest("Консултантът е отказал тази заявка — не може да оставиш отзив.");
    }
    if (booking.status === "cancelled") {
      return badRequest("Резервацията е отменена — не може да оставиш отзив.");
    }
    return badRequest("Only confirmed bookings can be reviewed.");
  }

  if (booking.review) {
    return badRequest("Вече си оставил отзив за тази сесия.");
  }

  // Session-end uses the SNAPSHOT length stored on the booking when it was
  // created, so the eligibility window can't shift if the consultant edits
  // their session length later. Fall back to the consultant's current value
  // for legacy bookings created before the snapshot was introduced.
  const sessionEndMs = getBookingSessionEndMs(booking, consultant);
  const now = Date.now();

  if (sessionEndMs > now) {
    return badRequest(
      "Сесията още не е приключила. Можеш да оставиш отзив след края ѝ."
    );
  }

  if (!isBookingSessionConfirmedByBoth(booking)) {
    return badRequest(
      "Отзив може да бъде оставен след като и потребителят, и консултантът потвърдят, че сесията е проведена."
    );
  }

  // Review window: 60 days after session end. Prevents stale reviews from
  // showing up months/years later and skewing the active rating.
  const REVIEW_WINDOW_MS = 60 * 24 * 60 * 60 * 1000;
  if (now - sessionEndMs > REVIEW_WINDOW_MS) {
    return badRequest("Срокът за отзив е изтекъл (60 дни след сесията).");
  }

  const review = {
    rating,
    comment,
    createdAt: new Date().toISOString()
  };

  const priorRating = Number(consultant.rating) || 0;
  const priorCount = Number(consultant.reviewCount) || 0;
  const legacySum = priorRating * priorCount;

  try {
    await dynamo.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: env.bookingsTable,
              Key: { bookingId },
              UpdateExpression: "SET #r = :review",
              ConditionExpression: "attribute_not_exists(#r) AND #s = :confirmed",
              ExpressionAttributeNames: { "#r": "review", "#s": "status" },
              ExpressionAttributeValues: {
                ":review": review,
                ":confirmed": "confirmed"
              }
            }
          },
          {
            Update: {
              TableName: env.consultantsTable,
              Key: { consultantId: consultant.consultantId },
              UpdateExpression:
                "SET ratingSum = if_not_exists(ratingSum, :legacySum) + :newRating, " +
                "reviewCount = if_not_exists(reviewCount, :zero) + :one",
              ExpressionAttributeValues: {
                ":legacySum": legacySum,
                ":newRating": rating,
                ":zero": 0,
                ":one": 1
              }
            }
          }
        ]
      })
    );
  } catch (error) {
    if (error.name === "TransactionCanceledException") {
      return badRequest("Booking is no longer eligible for review.");
    }
    throw error;
  }

  // The transaction above writes the review exactly once (attribute_not_exists),
  // so this awards the client review points exactly once.
  await addPointsEntry(booking.clientId, POINTS.review, "review", "Оставен отзив след консултация");

  await appendUserNotification(consultant.ownerUserId, {
    type: "review_received",
    title: `${booking.clientName || "Потребител"} остави отзив`,
    body: `${"★".repeat(rating)}${"☆".repeat(5 - rating)}${
      comment ? ` — „${comment.slice(0, 120)}${comment.length > 120 ? "…" : ""}"` : ""
    }`
  });

  return response(200, {
    booking: { ...booking, review },
    consultant: {
      consultantId: consultant.consultantId,
      reviewCount: priorCount + 1,
      rating: Math.round(((legacySum + rating) / (priorCount + 1)) * 10) / 10
    }
  });
}

async function getMyNotifications(event) {
  const claims = requireAuth(event);
  const result = await dynamo.send(
    new GetCommand({
      TableName: env.usersTable,
      Key: { userId: claims.sub },
      ProjectionExpression: "notifications",
      ConsistentRead: true
    })
  );
  const stored = Array.isArray(result.Item?.notifications)
    ? result.Item.notifications
    : [];
  // Newest first, capped at NOTIFICATION_KEEP. Also trim the row in DynamoDB
  // if it grew past the cap, so lists stay bounded over time.
  const sorted = [...stored].sort(
    (a, b) =>
      new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  );
  if (sorted.length > NOTIFICATION_KEEP) {
    const trimmed = sorted.slice(0, NOTIFICATION_KEEP);
    try {
      await dynamo.send(
        new UpdateCommand({
          TableName: env.usersTable,
          Key: { userId: claims.sub },
          UpdateExpression: "SET notifications = :n",
          ExpressionAttributeValues: { ":n": trimmed }
        })
      );
    } catch {
      /* best effort */
    }
    return response(200, { items: trimmed, unreadCount: trimmed.filter((n) => !n.readAt).length });
  }
  return response(200, {
    items: sorted,
    unreadCount: sorted.filter((n) => !n.readAt).length
  });
}

async function markMyNotificationsRead(event) {
  const claims = requireAuth(event);
  // Optional body.notificationId marks a single notification; without it the
  // whole list is marked read (the original behaviour).
  const body = parseBody(event);
  const notificationId = String(body.notificationId || "").trim();
  const result = await dynamo.send(
    new GetCommand({
      TableName: env.usersTable,
      Key: { userId: claims.sub },
      ProjectionExpression: "notifications",
      ConsistentRead: true
    })
  );
  const stored = Array.isArray(result.Item?.notifications)
    ? result.Item.notifications
    : [];
  const now = new Date().toISOString();
  const next = stored.map((n) => {
    if (n.readAt) return n;
    if (notificationId && n.id !== notificationId) return n;
    return { ...n, readAt: now };
  });
  await dynamo.send(
    new UpdateCommand({
      TableName: env.usersTable,
      Key: { userId: claims.sub },
      UpdateExpression: "SET notifications = :n",
      ExpressionAttributeValues: { ":n": next }
    })
  );
  const unreadCount = next.filter((n) => !n.readAt).length;
  return response(200, { ok: true, unreadCount });
}

async function listBookings(event) {
  const claims = requireAuth(event);
  const user = await getUserBySub(claims.sub);

  if (!user) {
    return notFound("Profile not found.");
  }

  if (user.role === "consultant") {
    const consultant = await getConsultantByOwner(claims.sub);

    if (!consultant) {
      return response(200, []);
    }

    const result = await dynamo.send(
      new QueryCommand({
        TableName: env.bookingsTable,
        IndexName: "consultant-index",
        KeyConditionExpression: "consultantId = :consultantId",
        ExpressionAttributeValues: {
          ":consultantId": consultant.consultantId
        }
      })
    );

    const bookings = result.Items || [];
    const clientIds = Array.from(new Set(bookings.map((item) => item.clientId).filter(Boolean)));
    const sharedByClient = new Map();

    await Promise.all(
      clientIds.map(async (clientId) => {
        const client = await getUserBySub(clientId);
        const sharedDocuments = await Promise.all(
          getStoredUserDocuments(client)
            .filter((doc) =>
              normalizeSharedConsultantIds(doc.sharedWithConsultantIds).includes(
                consultant.consultantId
              )
            )
            .map(async (doc) => ({
              ...doc,
              downloadUrl: await getSignedObjectUrl(doc.storageKey, { purpose: "document" })
            }))
        );
        sharedByClient.set(clientId, sharedDocuments);
      })
    );

    return response(
      200,
      bookings.map((booking) => ({
        ...booking,
        clientSharedDocuments: sharedByClient.get(booking.clientId) || []
      }))
    );
  }

  const result = await dynamo.send(
    new QueryCommand({
      TableName: env.bookingsTable,
      IndexName: "client-index",
      KeyConditionExpression: "clientId = :clientId",
      ExpressionAttributeValues: {
        ":clientId": user.userId
      }
    })
  );

  // Gate the meeting link: the client only sees it once the booking is paid
  // (Stripe later), free (redeemed with points), or admin-marked paid.
  const clientBookings = (result.Items || []).map((booking) => {
    if (isBookingPaid(booking)) {
      return { ...booking, meetingLinkLocked: false };
    }
    return { ...booking, meetingLink: "", meetingLinkLocked: true };
  });

  return response(200, clientBookings);
}

async function scanAllItems(tableName, { maxPages = 100 } = {}) {
  const items = [];
  let exclusiveStartKey;
  let pages = 0;
  do {
    const result = await dynamo.send(
      new ScanCommand({
        TableName: tableName,
        Limit: 500,
        ExclusiveStartKey: exclusiveStartKey
      })
    );
    items.push(...(result.Items || []));
    exclusiveStartKey = result.LastEvaluatedKey;
    pages += 1;
  } while (exclusiveStartKey && pages < maxPages);
  return items;
}

function lastNDays(n) {
  const days = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

// Maps a Cognito user (federated or native) to an identity provider bucket.
// Federated users carry an "identities" attribute (JSON) and/or a username
// prefixed by the IdP name; native email/password users have neither.
function cognitoUserProvider(user) {
  const attrs = user.Attributes || [];
  const identitiesAttr = attrs.find((a) => a.Name === "identities");
  if (identitiesAttr?.Value) {
    try {
      const parsed = JSON.parse(identitiesAttr.Value);
      const providerName = String(parsed?.[0]?.providerName || "").toLowerCase();
      if (providerName.includes("google")) return "google";
      if (providerName.includes("apple")) return "apple";
      if (providerName.includes("linkedin")) return "linkedin";
      if (providerName) return "other";
    } catch {
      // fall through to username heuristic
    }
  }
  const username = String(user.Username || "").toLowerCase();
  if (username.startsWith("google_")) return "google";
  if (username.startsWith("signinwithapple_") || username.startsWith("apple_")) return "apple";
  if (username.startsWith("linkedinoidc_") || username.startsWith("linkedin_")) return "linkedin";
  return "email";
}

// Authoritative account stats straight from the Cognito user pool — the real
// source of truth for "who has registered" (the DynamoDB users table is only
// populated on first authenticated request, so it can lag the pool). Degrades
// gracefully: if the pool id is unset or the call fails, returns
// { available: false } and the caller falls back to DynamoDB counts.
async function getCognitoUserStats() {
  if (!env.userPoolId) return { available: false };

  const stats = {
    available: true,
    total: 0,
    confirmed: 0,
    unconfirmed: 0,
    disabled: 0,
    newLast7: 0,
    byProvider: { email: 0, google: 0, apple: 0, linkedin: 0, other: 0 },
    capped: false
  };
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const MAX_PAGES = 200; // 200 * 60 = 12k users — far beyond current scale

  try {
    let paginationToken;
    let pages = 0;
    do {
      const result = await cognito.send(
        new ListUsersCommand({
          UserPoolId: env.userPoolId,
          Limit: 60,
          PaginationToken: paginationToken
        })
      );
      for (const user of result.Users || []) {
        stats.total += 1;
        if (user.Enabled === false) stats.disabled += 1;
        const status = String(user.UserStatus || "");
        if (status === "UNCONFIRMED") stats.unconfirmed += 1;
        else stats.confirmed += 1; // CONFIRMED + EXTERNAL_PROVIDER (federated)
        const created = user.UserCreateDate ? new Date(user.UserCreateDate).getTime() : 0;
        if (created && created >= weekAgo) stats.newLast7 += 1;
        const provider = cognitoUserProvider(user);
        stats.byProvider[provider] = (stats.byProvider[provider] || 0) + 1;
      }
      paginationToken = result.PaginationToken;
      pages += 1;
    } while (paginationToken && pages < MAX_PAGES);
    if (paginationToken) stats.capped = true;
  } catch (error) {
    console.error("[metrics] cognito stats failed", { error: error?.message || error });
    return { available: false };
  }

  return stats;
}

async function getAdminMetrics(event) {
  requireAdmin(event);

  const [allUsers, consultantRows, bookings, visitsItem, cognitoStats] = await Promise.all([
    scanAllItems(env.usersTable),
    scanAllItems(env.consultantsTable),
    scanAllItems(env.bookingsTable),
    dynamo
      .send(new GetCommand({ TableName: env.usersTable, Key: { userId: VISITS_ITEM_ID } }))
      .then((r) => r.Item || {})
      .catch(() => ({})),
    getCognitoUserStats()
  ]);

  // Exclude internal rows (page-view counter, invites, referral maps) from metrics.
  const users = allUsers.filter((u) => {
    const id = String(u.userId || "");
    return (
      !id.startsWith("system#") &&
      !id.startsWith(INVITE_PREFIX) &&
      !id.startsWith(REFERRAL_PREFIX)
    );
  });

  // Dedupe by owner: an owner can have several draft rows, which would inflate
  // the "consultants by status" counts. Use the same canonical-pick logic as the
  // admin list so the metrics match what admins actually see.
  const consultants = dedupeConsultantsByOwner(consultantRows);

  // Page views (first-party counter stored as v_<date> on the system#visits row)
  const visitsPerDay = lastNDays(30).map((date) => ({
    date,
    count: Number(visitsItem[`v_${date}`]) || 0
  }));
  const visitsLast7 = visitsPerDay.slice(-7).reduce((sum, d) => sum + d.count, 0);
  const visitsTotal = Object.entries(visitsItem)
    .filter(([key]) => key.startsWith("v_"))
    .reduce((sum, [, value]) => sum + (Number(value) || 0), 0);

  // Users
  let clientUsers = 0;
  let consultantUsers = 0;
  const regByDay = {};
  for (const u of users) {
    if (normalizeUserRole(u.role, "client") === "consultant") consultantUsers += 1;
    else clientUsers += 1;
    const day = String(u.createdAt || "").slice(0, 10);
    if (day) regByDay[day] = (regByDay[day] || 0) + 1;
  }
  const registrationsPerDay = lastNDays(30).map((date) => ({
    date,
    count: regByDay[date] || 0
  }));
  const registrationsLast7 = registrationsPerDay.slice(-7).reduce((s, d) => s + d.count, 0);

  // Consultants
  const consultantsByStatus = { pending: 0, approved: 0, rejected: 0 };
  let publicConsultants = 0;
  for (const c of consultants) {
    const status = normalizeConsultantStatus(c.profileStatus) || "pending";
    consultantsByStatus[status] = (consultantsByStatus[status] || 0) + 1;
    if (isVisibleConsultant(c)) publicConsultants += 1;
  }

  // Bookings, messages, reviews
  const now = Date.now();
  const bookingsByStatus = { pending: 0, confirmed: 0, declined: 0, cancelled: 0 };
  let totalMessages = 0;
  let totalReviews = 0;
  let reviewRatingSum = 0;
  let confirmedSessions = 0;
  let upcomingConfirmed = 0;
  for (const b of bookings) {
    if (bookingsByStatus[b.status] !== undefined) bookingsByStatus[b.status] += 1;
    if (Array.isArray(b.messages)) totalMessages += b.messages.length;
    const rating = Number(b.review?.rating);
    if (b.review && rating > 0) {
      totalReviews += 1;
      reviewRatingSum += rating;
    }
    if (b.sessionConfirmation?.clientConfirmedAt && b.sessionConfirmation?.consultantConfirmedAt) {
      confirmedSessions += 1;
    }
    if (b.status === "confirmed" && b.scheduledAt) {
      const when = new Date(b.scheduledAt).getTime();
      if (Number.isFinite(when) && when >= now) upcomingConfirmed += 1;
    }
  }
  const averageRating = totalReviews
    ? Math.round((reviewRatingSum / totalReviews) * 10) / 10
    : 0;

  return response(200, {
    generatedAt: new Date().toISOString(),
    // Authoritative account count from the Cognito user pool (source of truth
    // for registrations). `users` below is the DynamoDB mirror, which only fills
    // in on a user's first authenticated request — comparing the two surfaces
    // accounts that registered but never activated an app profile.
    cognito: cognitoStats,
    users: {
      total: users.length,
      clients: clientUsers,
      consultants: consultantUsers,
      registrationsLast7,
      registrationsPerDay
    },
    consultants: {
      total: consultants.length,
      public: publicConsultants,
      pending: consultantsByStatus.pending,
      approved: consultantsByStatus.approved,
      rejected: consultantsByStatus.rejected
    },
    bookings: {
      total: bookings.length,
      pending: bookingsByStatus.pending,
      confirmed: bookingsByStatus.confirmed,
      declined: bookingsByStatus.declined,
      cancelled: bookingsByStatus.cancelled,
      confirmedSessions,
      upcomingConfirmed
    },
    messages: totalMessages,
    reviews: totalReviews,
    averageRating,
    visits: {
      total: visitsTotal,
      last7: visitsLast7,
      perDay: visitsPerDay
    }
  });
}

// Public, unauthenticated page-view beacon. Atomically increments a per-day
// counter on a single system row. It's a vanity metric (no PII); the worst an
// abuser can do is inflate the counter, so we keep it cheap and unguarded.
async function recordVisit() {
  const day = new Date().toISOString().slice(0, 10);
  try {
    await dynamo.send(
      new UpdateCommand({
        TableName: env.usersTable,
        Key: { userId: VISITS_ITEM_ID },
        UpdateExpression: "ADD #day :one",
        ExpressionAttributeNames: { "#day": `v_${day}` },
        ExpressionAttributeValues: { ":one": 1 }
      })
    );
  } catch (error) {
    console.error("[visit] failed", { error: error?.message || error });
  }
  return response(200, { ok: true });
}

async function listConsultantsForAdmin(event) {
  requireAdmin(event);

  const pageSize = parsePageSize(event.queryStringParameters?.limit);
  const startKey = decodeCursor(event.queryStringParameters?.cursor);

  const { items: scannedConsultants, lastEvaluatedKey } = await scanWithFilter({
    tableName: env.consultantsTable,
    pageSize,
    startKey,
    filter: isConsultantRecord
  });
  const consultants = dedupeConsultantsByOwner(scannedConsultants);

  const ownerIds = Array.from(
    new Set(consultants.map((item) => item.ownerUserId).filter(Boolean))
  );

  const owners = new Map();
  await Promise.all(
    ownerIds.map(async (ownerId) => {
      const ownerRecord = await getUserBySub(ownerId);
      if (ownerRecord) {
        owners.set(ownerId, {
          email: ownerRecord.email || "",
          name: ownerRecord.name || ""
        });
      }
    })
  );

  const items = await Promise.all(
    consultants.map(async (item) => {
      const owner = owners.get(item.ownerUserId);
      const avatarUrl = item.avatarStorageKey
        ? await getSignedObjectUrl(item.avatarStorageKey)
        : item.avatarUrl || "";
      return {
        consultantId: item.consultantId,
        ownerUserId: item.ownerUserId,
        ownerEmail: owner?.email || "",
        ownerName: owner?.name || "",
        slug: item.slug,
        name: item.name,
        headline: item.headline || "",
        bio: item.bio || "",
        city: item.city || "",
        profileType: item.profileType,
        profileStatus: item.profileStatus || "approved",
        isPublic: item.isPublic !== false,
        featured: Boolean(item.featured),
        comped: item.comped === true,
        restricted: item.restricted === true,
        packageTier: normalizeConsultantPackageTier(item.packageTier),
        packageSource: item.packageSource || "",
        membershipTier: item.membershipTier || "standard",
        avatarUrl,
        experienceYears: item.experienceYears || 0,
        languages: Array.isArray(item.languages) ? item.languages : [],
        sessionModes: Array.isArray(item.sessionModes) ? item.sessionModes : [],
        specializations: Array.isArray(item.specializations) ? item.specializations : [],
        consultationTopics: Array.isArray(item.consultationTopics)
          ? item.consultationTopics
          : [],
        availabilityCount: Array.isArray(item.availability) ? item.availability.length : 0,
        createdAt: item.createdAt || "",
        updatedAt: item.updatedAt || "",
        statusUpdatedAt: item.statusUpdatedAt || "",
        statusUpdatedBy: item.statusUpdatedBy || "",
        statusUpdatedByEmail: item.statusUpdatedByEmail || "",
        statusSelfApproved: Boolean(item.statusSelfApproved)
      };
    })
  );

  items.sort((left, right) => {
    const order = { pending: 0, approved: 1, rejected: 2 };
    const leftRank = order[left.profileStatus] ?? 3;
    const rightRank = order[right.profileStatus] ?? 3;
    if (leftRank !== rightRank) return leftRank - rightRank;
    return String(left.name || "").localeCompare(String(right.name || ""), "bg");
  });

  return response(
    200,
    { items, nextCursor: encodeCursor(lastEvaluatedKey) },
    { "Cache-Control": "no-store" }
  );
}

async function getConsultantForAdmin(event) {
  requireAdmin(event);
  const consultantId = event.pathParameters?.consultantId;

  if (!consultantId) {
    return badRequest("consultantId is required.");
  }

  const result = await dynamo.send(
    new GetCommand({
      TableName: env.consultantsTable,
      Key: { consultantId }
    })
  );

  if (!result.Item) {
    return notFound("Consultant not found.");
  }

  let consultant = result.Item;

  if (consultant.ownerUserId) {
    const canonical = await getConsultantByOwner(consultant.ownerUserId);
    if (canonical) {
      consultant = canonical;
    }
  }

  const decorated = await decorateConsultantMedia(consultant);

  // Owner info + audit metadata — surface what the list endpoint shows so
  // the preview page has the same admin context as the card.
  const owner = consultant.ownerUserId
    ? await getUserBySub(consultant.ownerUserId)
    : null;

  return response(200, {
    ...decorated,
    ownerEmail: owner?.email || "",
    ownerName: owner?.name || "",
    profileStatus: consultant.profileStatus || "approved",
    isPublic: consultant.isPublic !== false,
    createdAt: consultant.createdAt || "",
    updatedAt: consultant.updatedAt || "",
    statusUpdatedAt: consultant.statusUpdatedAt || "",
    statusUpdatedBy: consultant.statusUpdatedBy || "",
    statusUpdatedByEmail: consultant.statusUpdatedByEmail || "",
    statusSelfApproved: Boolean(consultant.statusSelfApproved)
  }, { "Cache-Control": "no-store" });
}

// Admin-assigned visibility package (Стр. 6). Until Stripe checkout exists this
// is the only way a profile gets Grow/Spotlight — the admin grants it (e.g. a
// promotional arrangement), recorded as packageSource: "granted".
async function setConsultantPackage(event) {
  const claims = requireAdmin(event);
  const body = parseBody(event);
  const consultantId = event.pathParameters?.consultantId;

  if (!consultantId) {
    return badRequest("consultantId is required.");
  }

  const packageTier = normalizeConsultantPackageTier(body.packageTier, null);

  if (!packageTier) {
    return badRequest("packageTier must be one of: start, grow, spotlight.");
  }

  const existing = await dynamo.send(
    new GetCommand({
      TableName: env.consultantsTable,
      Key: { consultantId }
    })
  );

  if (!existing.Item) {
    return notFound("Consultant not found.");
  }

  const now = new Date().toISOString();
  const updated = {
    ...existing.Item,
    packageTier,
    packageSource: packageTier === "start" ? "" : "granted",
    packageUpdatedAt: now,
    packageUpdatedBy: claims.sub,
    packageUpdatedByEmail: claims.email || "",
    updatedAt: now
  };

  await dynamo.send(
    new PutCommand({
      TableName: env.consultantsTable,
      Item: updated
    })
  );

  return response(200, {
    consultantId: updated.consultantId,
    packageTier: updated.packageTier,
    packageSource: updated.packageSource,
    packageUpdatedAt: updated.packageUpdatedAt,
    packageUpdatedByEmail: updated.packageUpdatedByEmail
  });
}

async function setConsultantFeatured(event) {
  const claims = requireAdmin(event);
  const body = parseBody(event);
  const consultantId = event.pathParameters?.consultantId;

  if (!consultantId) {
    return badRequest("consultantId is required.");
  }

  if (typeof body.featured !== "boolean") {
    return badRequest("featured must be a boolean.");
  }

  const existing = await dynamo.send(
    new GetCommand({
      TableName: env.consultantsTable,
      Key: { consultantId }
    })
  );

  if (!existing.Item) {
    return notFound("Consultant not found.");
  }

  const isApproved =
    existing.Item.profileStatus === "approved" || existing.Item.profileStatus === "active";
  const isPublic = existing.Item.isPublic !== false;

  if (body.featured && (!isApproved || !isPublic)) {
    return badRequest("Only approved public consultant profiles can be featured.");
  }

  const currentFeatured = Boolean(existing.Item.featured);

  if (currentFeatured === body.featured) {
    return response(
      200,
      {
        consultantId,
        featured: currentFeatured,
        unchanged: true
      },
      { "Cache-Control": "no-store" }
    );
  }

  const now = new Date().toISOString();
  const updated = {
    ...existing.Item,
    featured: body.featured,
    featuredUpdatedAt: now,
    featuredUpdatedBy: claims.sub,
    featuredUpdatedByEmail: claims.email || "",
    updatedAt: now
  };

  await dynamo.send(
    new PutCommand({
      TableName: env.consultantsTable,
      Item: updated
    })
  );

  return response(
    200,
    {
      consultantId,
      featured: updated.featured,
      featuredUpdatedAt: updated.featuredUpdatedAt,
      featuredUpdatedBy: updated.featuredUpdatedBy,
      featuredUpdatedByEmail: updated.featuredUpdatedByEmail
    },
    { "Cache-Control": "no-store" }
  );
}

// --- Admin invites: a free, "comped" consultant onboarding path -------------
// Until Stripe is live, mentor accounts only come from an admin invite. An
// invite is stored on the users table keyed by the invited email and redeemed
// at bootstrap when that email signs up with the matching token.
const INVITE_PREFIX = "invite#";
const INVITE_TTL_DAYS = 30;

function inviteKey(email) {
  return `${INVITE_PREFIX}${String(email || "").trim().toLowerCase()}`;
}

async function redeemInvite(email, token, userId) {
  const key = inviteKey(email);
  const invite = await getUserBySub(key);
  if (!invite || invite.status !== "pending") return null;
  if (String(invite.token || "") !== String(token || "")) return null;
  if (invite.expiresAt && new Date(invite.expiresAt).getTime() < Date.now()) return null;
  const now = new Date().toISOString();
  try {
    await dynamo.send(
      new UpdateCommand({
        TableName: env.usersTable,
        Key: { userId: key },
        UpdateExpression: "SET #s = :redeemed, redeemedAt = :now, redeemedBy = :uid",
        ConditionExpression: "#s = :pending",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: {
          ":redeemed": "redeemed",
          ":pending": "pending",
          ":now": now,
          ":uid": userId || ""
        }
      })
    );
  } catch {
    // Lost the race (already redeemed) — treat as not redeemable.
    return null;
  }
  return invite;
}

async function createInvite(event) {
  const claims = requireAdmin(event);
  const body = parseBody(event);
  const email = String(body.email || "").trim().toLowerCase();

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return badRequest("A valid email is required.");
  }

  const profileType = normalizeConsultantProfileType(body.profileType, "consultant");
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86400000).toISOString();
  const token = randomUUID();
  const invite = {
    userId: inviteKey(email),
    recordType: "invite",
    email,
    token,
    profileType,
    status: "pending",
    invitedBy: claims.sub,
    invitedByEmail: claims.email || "",
    invitedAt: now,
    expiresAt,
    redeemedAt: null
  };

  await dynamo.send(new PutCommand({ TableName: env.usersTable, Item: invite }));

  const link = appUrl(`auth?invite=${encodeURIComponent(token)}`);
  try {
    await sendEmail({
      to: email,
      subject: "Покана за GrowPoint — създай безплатен експертен профил",
      text:
        "Здравей,\n\n" +
        "Екипът на GrowPoint те кани да създадеш безплатен експертен профил (консултант или ментор) в платформата.\n\n" +
        `Активирай поканата си тук:\n${link}\n\n` +
        `Линкът е валиден до ${new Date(expiresAt).toLocaleDateString("bg-BG")}. ` +
        "Ако не очакваш тази покана, просто игнорирай това съобщение."
    });
  } catch (error) {
    console.error("[invite] email failed", error?.message || error);
  }

  return response(
    201,
    {
      email: invite.email,
      status: invite.status,
      profileType: invite.profileType,
      invitedAt: invite.invitedAt,
      expiresAt: invite.expiresAt
    },
    { "Cache-Control": "no-store" }
  );
}

async function listInvites(event) {
  requireAdmin(event);
  const items = await scanAllItems(env.usersTable);
  const invites = items
    .filter((it) => typeof it.userId === "string" && it.userId.startsWith(INVITE_PREFIX))
    .map((it) => ({
      email: it.email || "",
      status: it.status || "pending",
      profileType: it.profileType || "consultant",
      invitedByEmail: it.invitedByEmail || "",
      invitedAt: it.invitedAt || "",
      expiresAt: it.expiresAt || "",
      redeemedAt: it.redeemedAt || null
    }))
    .sort((a, b) => String(b.invitedAt).localeCompare(String(a.invitedAt)));
  return response(200, { items: invites }, { "Cache-Control": "no-store" });
}

// --- Admin restrict / full-suspend ------------------------------------------
// Hides the public profile, and disables sign-in at Cognito so the account can
// no longer authenticate. Reversible. Cognito disable blocks new logins; an
// already-issued token stays valid until it expires (~1h).
async function setUserRestricted(event) {
  const claims = requireAdmin(event);
  const body = parseBody(event);
  const userId = event.pathParameters?.userId;

  if (!userId) return badRequest("userId is required.");
  if (typeof body.restricted !== "boolean") {
    return badRequest("restricted must be a boolean.");
  }
  if (userId === claims.sub) {
    return badRequest("You cannot restrict your own account.");
  }

  const user = await getUserBySub(userId);
  if (!user) return notFound("User not found.");

  const now = new Date().toISOString();
  const restricted = body.restricted;

  await dynamo.send(
    new PutCommand({
      TableName: env.usersTable,
      Item: {
        ...user,
        restricted,
        restrictedAt: restricted ? now : "",
        restrictedBy: restricted ? claims.sub : "",
        restrictedByEmail: restricted ? claims.email || "" : "",
        updatedAt: now
      }
    })
  );

  const consultant = await getConsultantByOwner(userId);
  if (consultant) {
    await dynamo.send(
      new PutCommand({
        TableName: env.consultantsTable,
        Item: { ...consultant, restricted, updatedAt: now }
      })
    );
  }

  if (env.userPoolId) {
    try {
      await cognito.send(
        restricted
          ? new AdminDisableUserCommand({ UserPoolId: env.userPoolId, Username: userId })
          : new AdminEnableUserCommand({ UserPoolId: env.userPoolId, Username: userId })
      );
    } catch (error) {
      console.error("[restrict] cognito toggle failed", error?.message || error);
    }
  }

  return response(
    200,
    {
      userId,
      restricted,
      restrictedAt: restricted ? now : "",
      restrictedByEmail: restricted ? claims.email || "" : ""
    },
    { "Cache-Control": "no-store" }
  );
}

async function adminMessageUser(event) {
  const claims = requireAdmin(event);
  const userId = event.pathParameters?.userId;
  const body = parseBody(event);

  if (!userId) {
    return badRequest("userId is required.");
  }

  const subject = normalizeText(
    body.subject,
    "Съобщение от екипа на GrowPoint",
    160
  );
  const message = normalizeText(body.message, "", 1200);

  if (message.length < 2) {
    return badRequest("message is required.");
  }

  const user = await getUserBySub(userId);
  if (!user) {
    return notFound("User not found.");
  }

  const notification = await appendUserNotification(userId, {
    type: "admin_message",
    title: subject,
    body: message,
    href: "/dashboard"
  });

  try {
    await sendEmail({
      to: user.email,
      subject,
      text:
        `Здравей, ${user.name || ""},\n\n` +
        `${message}\n\n` +
        `Изпратено от администратор на GrowPoint (${claims.email || "админ"}).`
    });
  } catch (error) {
    console.error("[admin] message email failure", error?.message || error);
  }

  return response(201, {
    ok: true,
    notificationId: notification?.id || ""
  });
}

// Consultant adds/updates the meeting link on a confirmed booking (e.g. when
// they approved without one). Released to the client only once paid/free.
async function setBookingMeetingLink(event) {
  const claims = requireAuth(event);
  const bookingId = event.pathParameters?.bookingId;
  const body = parseBody(event);
  if (!bookingId) return badRequest("bookingId is required.");

  const link = normalizeMeetingLink(body.meetingLink);
  if (!link) return badRequest("Линкът за срещата трябва да е валиден https адрес.");

  const { booking, consultant } = await loadBookingAndConsultant(bookingId);
  if (!booking) return notFound("Booking not found.");
  if (!consultant) return notFound("Consultant not found.");
  if (consultant.ownerUserId !== claims.sub) {
    return forbidden("Only the consultant can set the meeting link.");
  }
  if (booking.status !== "confirmed") {
    return badRequest("Линк може да се добави само към потвърдена резервация.");
  }

  await dynamo.send(
    new UpdateCommand({
      TableName: env.bookingsTable,
      Key: { bookingId },
      UpdateExpression: "SET meetingLink = :link",
      ExpressionAttributeValues: { ":link": link }
    })
  );

  await appendUserNotification(booking.clientId, {
    type: "booking_accepted",
    title: "Линк за срещата е добавен",
    body: isBookingPaid(booking)
      ? "Линкът за онлайн срещата вече е наличен в таблото ти."
      : "Линкът ще се отвори след плащане на консултацията."
  });

  return response(200, { ...booking, meetingLink: link });
}

// Admin manually marks a booking as paid (bridge until Stripe). Releases the
// meeting link to the client.
async function adminMarkBookingPaid(event) {
  const claims = requireAdmin(event);
  const bookingId = event.pathParameters?.bookingId;
  if (!bookingId) return badRequest("bookingId is required.");

  const result = await dynamo.send(
    new GetCommand({ TableName: env.bookingsTable, Key: { bookingId } })
  );
  const booking = result.Item;
  if (!booking) return notFound("Booking not found.");

  const now = new Date().toISOString();
  await dynamo.send(
    new UpdateCommand({
      TableName: env.bookingsTable,
      Key: { bookingId },
      UpdateExpression: "SET paymentStatus = :paid, paidAt = :now, paidBy = :by",
      ExpressionAttributeValues: {
        ":paid": "paid",
        ":now": now,
        ":by": claims.email || claims.sub
      }
    })
  );

  await appendUserNotification(booking.clientId, {
    type: "booking_accepted",
    title: "Плащането е потвърдено",
    body: booking.meetingLink
      ? "Линкът за онлайн срещата вече е наличен в таблото ти."
      : "Линкът ще се появи, щом консултантът го добави."
  });

  return response(
    200,
    { bookingId, paymentStatus: "paid", paidAt: now },
    { "Cache-Control": "no-store" }
  );
}

// Admin booking list (for the manual-paid bridge). Returns lightweight rows.
async function adminListBookings(event) {
  requireAdmin(event);
  const bookings = await scanAllItems(env.bookingsTable);
  const items = bookings
    .filter((b) => typeof b.bookingId === "string")
    .map((b) => ({
      bookingId: b.bookingId,
      consultantName: b.consultantName || "",
      clientName: b.clientName || "",
      clientEmail: b.clientEmail || "",
      scheduledAt: b.scheduledAt || "",
      status: b.status || "",
      paymentStatus: b.paymentStatus || "unpaid",
      freeViaPoints: b.freeViaPoints === true,
      hasMeetingLink: Boolean(b.meetingLink),
      createdAt: b.createdAt || ""
    }))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return response(200, { items }, { "Cache-Control": "no-store" });
}

function health() {
  return response(200, { ok: true, service: "growpoint-api" }, {
    "Cache-Control": "no-store"
  });
}

exports.handler = async (event) => {
  activeRequestOrigin = headerValue(event?.headers, "origin");
  try {
    if (
      event?.source === "aws.events" ||
      event?.["detail-type"] === "Scheduled Event"
    ) {
      const deletionSweep = await processScheduledDeletions();
      const reminders = await sendDueReminders();
      return { deletionSweep, reminders };
    }

    if (event.requestContext?.http?.method === "OPTIONS") {
      return response(204, {});
    }

    const method = event.requestContext?.http?.method;
    const path = event.rawPath;

    if (method === "GET" && path === "/health") return await health();
    if (method === "POST" && path === "/metrics/visit") return await recordVisit();
    if (method === "GET" && path === "/consultants") return await listConsultants(event);
    if (method === "GET" && path === "/consultants/me") return await getMyConsultant(event);
    if (method === "PUT" && path === "/consultants/me") return await updateMyConsultant(event);
    if (method === "GET" && /^\/consultants\/[^/]+$/.test(path)) return await getConsultant(event);
    if (method === "GET" && /^\/public\/users\/[^/]+$/.test(path)) return await getPublicUser(event);
    if (method === "POST" && path === "/auth/bootstrap") return await bootstrapUser(event);
    if (method === "GET" && path === "/me/profile") return await getMeProfile(event);
    if (method === "GET" && path === "/me/data-export") return await exportMyData(event);
    if (method === "DELETE" && path === "/me") return await deleteMyAccount(event);
    if (method === "GET" && path === "/me/notifications") return await getMyNotifications(event);
    if (method === "POST" && path === "/me/notifications/mark-read") return await markMyNotificationsRead(event);
    if (method === "PUT" && path === "/me/profile") return await updateMeProfile(event);
    if (method === "POST" && path === "/me/documents/download-url") return await createMyDocumentDownloadUrl(event);
    if (method === "POST" && path === "/me/cv/upload-url") return await createUploadUrl(event);
    if (method === "GET" && path === "/bookings") return await listBookings(event);
    if (method === "POST" && path === "/bookings") return await createBooking(event);

    const bookingStatusMatch = /^\/bookings\/([^/]+)\/status$/.exec(path);
    if (method === "PATCH" && bookingStatusMatch) {
      event.pathParameters = { ...(event.pathParameters || {}), bookingId: bookingStatusMatch[1] };
      return await updateBookingStatus(event);
    }

    const bookingReviewMatch = /^\/bookings\/([^/]+)\/review$/.exec(path);
    if (method === "POST" && bookingReviewMatch) {
      event.pathParameters = { ...(event.pathParameters || {}), bookingId: bookingReviewMatch[1] };
      return await submitReview(event);
    }

    const bookingSessionConfirmMatch = /^\/bookings\/([^/]+)\/session-confirm$/.exec(path);
    if (method === "POST" && bookingSessionConfirmMatch) {
      event.pathParameters = {
        ...(event.pathParameters || {}),
        bookingId: bookingSessionConfirmMatch[1]
      };
      return await confirmBookingSession(event);
    }

    const bookingMessagesMatch = /^\/bookings\/([^/]+)\/messages$/.exec(path);
    if (bookingMessagesMatch) {
      event.pathParameters = {
        ...(event.pathParameters || {}),
        bookingId: bookingMessagesMatch[1]
      };
      if (method === "GET") return await listBookingMessages(event);
      if (method === "POST") return await sendBookingMessage(event);
    }

    const bookingRescheduleMatch = /^\/bookings\/([^/]+)\/reschedule$/.exec(path);
    if (method === "PATCH" && bookingRescheduleMatch) {
      event.pathParameters = { ...(event.pathParameters || {}), bookingId: bookingRescheduleMatch[1] };
      return await rescheduleBooking(event);
    }

    const bookingIcsMatch = /^\/bookings\/([^/]+)\/ics$/.exec(path);
    if (method === "GET" && bookingIcsMatch) {
      event.pathParameters = { ...(event.pathParameters || {}), bookingId: bookingIcsMatch[1] };
      return await downloadBookingIcs(event);
    }

    const bookingMeetingLinkMatch = /^\/bookings\/([^/]+)\/meeting-link$/.exec(path);
    if (method === "PUT" && bookingMeetingLinkMatch) {
      event.pathParameters = { ...(event.pathParameters || {}), bookingId: bookingMeetingLinkMatch[1] };
      return await setBookingMeetingLink(event);
    }

    if (method === "GET" && path === "/admin/metrics") return await getAdminMetrics(event);
    if (method === "GET" && path === "/admin/consultants") return await listConsultantsForAdmin(event);
    if (method === "GET" && path === "/admin/bookings") return await adminListBookings(event);

    const adminBookingPaidMatch = /^\/admin\/bookings\/([^/]+)\/paid$/.exec(path);
    if (method === "PUT" && adminBookingPaidMatch) {
      event.pathParameters = { ...(event.pathParameters || {}), bookingId: adminBookingPaidMatch[1] };
      return await adminMarkBookingPaid(event);
    }

    if (method === "POST" && path === "/admin/invites") return await createInvite(event);
    if (method === "GET" && path === "/admin/invites") return await listInvites(event);

    const adminUserMessageMatch = /^\/admin\/users\/([^/]+)\/message$/.exec(path);
    if (method === "POST" && adminUserMessageMatch) {
      event.pathParameters = {
        ...(event.pathParameters || {}),
        userId: adminUserMessageMatch[1]
      };
      return await adminMessageUser(event);
    }

    const adminRestrictMatch = /^\/admin\/users\/([^/]+)\/restrict$/.exec(path);
    if (method === "PUT" && adminRestrictMatch) {
      event.pathParameters = {
        ...(event.pathParameters || {}),
        userId: adminRestrictMatch[1]
      };
      return await setUserRestricted(event);
    }

    const adminFeaturedMatch = /^\/admin\/consultants\/([^/]+)\/featured$/.exec(path);
    if (method === "PUT" && adminFeaturedMatch) {
      event.pathParameters = { ...(event.pathParameters || {}), consultantId: adminFeaturedMatch[1] };
      return await setConsultantFeatured(event);
    }

    const adminPackageMatch = /^\/admin\/consultants\/([^/]+)\/package$/.exec(path);
    if (method === "PUT" && adminPackageMatch) {
      event.pathParameters = { ...(event.pathParameters || {}), consultantId: adminPackageMatch[1] };
      return await setConsultantPackage(event);
    }

    const adminGetMatch = /^\/admin\/consultants\/([^/]+)$/.exec(path);
    if (method === "GET" && adminGetMatch) {
      event.pathParameters = { ...(event.pathParameters || {}), consultantId: adminGetMatch[1] };
      return await getConsultantForAdmin(event);
    }

    return notFound("Route not found.");
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode >= 500) {
      console.error(error);
    }
    return response(statusCode, {
      message:
        statusCode >= 500
          ? "Unexpected server error."
          : error.message || "Unexpected server error."
    });
  } finally {
    activeRequestOrigin = "";
  }
};
