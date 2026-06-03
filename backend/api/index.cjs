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

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});
const ses = new SESv2Client({});

const env = {
  usersTable: process.env.USERS_TABLE,
  consultantsTable: process.env.CONSULTANTS_TABLE,
  bookingsTable: process.env.BOOKINGS_TABLE,
  cvBucket: process.env.CV_BUCKET,
  allowedOrigin: process.env.ALLOWED_ORIGIN || "https://www.bobsnadenica.com",
  sesFromEmail: process.env.SES_FROM_EMAIL || "",
  appUrl: process.env.APP_URL || "https://www.bobsnadenica.com/career/"
};

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
const VISIBLE_CONSULTANT_STATUSES = new Set(["approved", "active"]);
const ADMIN_GROUP = "admin";

function response(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": env.allowedOrigin,
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
      "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
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
  "review_received"
]);

const NOTIFICATION_KEEP = 50;

async function appendUserNotification(userId, notification) {
  if (!userId || !notification) return;
  if (!NOTIFICATION_TYPES.has(notification.type)) return;

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
  } catch (error) {
    console.error("[notify] append failed", {
      userId,
      type: notification.type,
      error: error?.message || error
    });
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

async function getConsultantBySlug(slug) {
  const result = await dynamo.send(
    new QueryCommand({
      TableName: env.consultantsTable,
      IndexName: "slug-index",
      KeyConditionExpression: "slug = :slug",
      ExpressionAttributeValues: {
        ":slug": slug
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

async function getConsultantByOwner(ownerUserId) {
  const result = await dynamo.send(
    new QueryCommand({
      TableName: env.consultantsTable,
      IndexName: "owner-index",
      KeyConditionExpression: "ownerUserId = :ownerUserId",
      ExpressionAttributeValues: {
        ":ownerUserId": ownerUserId
      },
      Limit: 1
    })
  );

  return result.Items?.[0] || null;
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

async function sendEmail({ to, subject, text }) {
  if (!env.sesFromEmail) {
    console.log("[email] skipped (SES_FROM_EMAIL not set)", { to, subject });
    return;
  }
  if (!to) {
    return;
  }
  try {
    await ses.send(
      new SendEmailCommand({
        FromEmailAddress: env.sesFromEmail,
        Destination: { ToAddresses: [to] },
        Content: {
          Simple: {
            Subject: { Data: subject, Charset: "UTF-8" },
            Body: { Text: { Data: text, Charset: "UTF-8" } }
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
          `${env.appUrl}#/dashboard`
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
          `Виж заявките си в таблото: ${env.appUrl}#/dashboard`
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
          `Табло: ${env.appUrl}#/dashboard`
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
          `Табло: ${env.appUrl}#/dashboard`
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
      `Табло: ${env.appUrl}#/dashboard`;
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
      `Табло: ${env.appUrl}#/dashboard`;
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
      `${env.appUrl}#/consultants`
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
          `${env.appUrl}#/dashboard`
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
          `\nТабло: ${env.appUrl}#/dashboard`
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
        `Каталог: ${env.appUrl}#/consultants`
      : `Здравей, ${recipient.name || ""},\n\n` +
        `Потребителят отказа резервацията за ${when}.\n\n` +
        `Часът е свободен отново и може да бъде резервиран от друг потребител.\n\n` +
        `Табло: ${env.appUrl}#/dashboard`;

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
  "heroStorageKey"
];

function stripSensitiveConsultantFields(consultant) {
  if (!consultant) return consultant;
  const cleaned = { ...consultant };
  for (const key of PUBLIC_CONSULTANT_HIDDEN_FIELDS) {
    delete cleaned[key];
  }
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

function isVisibleConsultant(consultant) {
  if (!isConsultantRecord(consultant)) return false;
  if (consultant.isPublic === false) return false;
  const status = consultant.profileStatus || "approved";
  if (!VISIBLE_CONSULTANT_STATUSES.has(status)) return false;
  // Minimum quality bar — empty or junk profiles never appear in the public
  // catalog even when their flags read public+approved. Stops the catalog
  // from leaking half-set-up accounts or stale legacy rows.
  if (!String(consultant.name || "").trim()) return false;
  if (!String(consultant.headline || "").trim()) return false;
  if (!String(consultant.bio || "").trim()) return false;
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
  const highlights = Array.isArray(consultant.experienceHighlights)
    ? consultant.experienceHighlights.filter((x) => String(x || "").trim()).length
    : 0;
  const specializations = Array.isArray(consultant.specializations)
    ? consultant.specializations.filter((x) => String(x || "").trim()).length
    : 0;
  const languages = Array.isArray(consultant.languages)
    ? consultant.languages.filter((x) => String(x || "").trim()).length
    : 0;
  const availability = Array.isArray(consultant.availability)
    ? consultant.availability.length
    : 0;
  const sessionLength = Number(consultant.sessionLengthMinutes);

  return (
    name.length >= 2 &&
    headline.length >= 10 &&
    bio.length >= 80 &&
    experienceSummary.length >= 20 &&
    highlights >= 1 &&
    specializations >= 1 &&
    languages >= 1 &&
    Number.isFinite(sessionLength) &&
    sessionLength > 0 &&
    availability >= 1
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
  avatarUrl
}) {
  const baseName = String(name || email || "consultant").trim();
  const slug = normalizeSlug(baseName);

  return {
    consultantId: `consultant-${randomUUID()}`,
    ownerUserId: userId,
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
    priceBgn: 0,
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

  const { items, lastEvaluatedKey } = await scanWithFilter({
    tableName: env.consultantsTable,
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
    // Marketplace data updates whenever a consultant saves their profile;
    // a 60s cache made client-side updates appear with a lag. Keep this
    // fully fresh until traffic justifies a CDN with explicit invalidation.
    { "Cache-Control": "no-store" }
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
      // Match /consultants — no caching so profile edits are immediately
      // visible to clients without waiting for stale-while-revalidate.
      "Cache-Control": "no-store"
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
  const requestedRole = existing
    ? currentRole
    : normalizeUserRole(body.role, currentRole);
  const requestedConsultantProfileType =
    typeof body.consultantProfileType === "undefined"
      ? null
      : normalizeConsultantProfileType(body.consultantProfileType, "consultant");
  const nextUser = {
    userId: claims.sub,
    email: claims.email || normalizeText(body.email, "", 320),
    name: normalizeText(body.name || claims.name, existing?.name || "", 120),
    role: requestedRole,
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
        avatarUrl: nextUser.avatarUrl
      });
      await putConsultantDraftWithUniqueSlug(draft);
    } else {
      await dynamo.send(
        new PutCommand({
          TableName: env.consultantsTable,
          Item: {
            ...existingConsultant,
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
      "Този файл съдържа цялата информация, която CareerLane съхранява за теб.",
      "Документите (CV, сертификати) се пазят в S3 и се свалят чрез временни линкове, генерирани при поискване.",
      "За искане за пълно изтриване използвай функцията 'Изтрий профила' в таблото. Тя насрочва автоматично изтриване след 7 дни."
    ]
  };

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="careerlane-export-${claims.sub}.json"`,
      "Access-Control-Allow-Origin": env.allowedOrigin,
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
            min: 13,
            max: 120,
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

  return response(200, await decorateUserMedia(nextUser));
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
    priceBgn: normalizeBoundedNumber(body.priceBgn, baseConsultant.priceBgn ?? 0, {
      min: 0,
      max: 5000
    }),
    featured: baseConsultant.featured ?? false,
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
    ...preservedVisibility,
    ...planFields
  };

  nextConsultant.nextAvailable = getNextAvailableSlot(
    nextConsultant.availability,
    baseConsultant.nextAvailable || ""
  );

  // Silent auto-approve: a fully-fleshed-out profile becomes public without
  // waiting for explicit admin action. We only promote upward — pending →
  // approved+public. We never downgrade an admin-approved or admin-rejected
  // profile from here, and we don't communicate this rule to the UI; the
  // profile just appears in the catalog the moment it's ready.
  if (
    nextConsultant.profileStatus === "pending" &&
    isConsultantProfileReadyForAutoApprove(nextConsultant)
  ) {
    nextConsultant.profileStatus = "approved";
    nextConsultant.isPublic = true;
    nextConsultant.autoApprovedAt = new Date().toISOString();
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

  const existingBookings = await dynamo.send(
    new QueryCommand({
      TableName: env.bookingsTable,
      IndexName: "consultant-index",
      KeyConditionExpression: "consultantId = :consultantId",
      ExpressionAttributeValues: {
        ":consultantId": consultant.consultantId
      }
    })
  );

  const sessionLengthMinutes =
    Number(consultant.sessionLengthMinutes) > 0
      ? Number(consultant.sessionLengthMinutes)
      : 60;
  const sessionMs = sessionLengthMinutes * 60 * 1000;
  const newStart = scheduledDate.getTime();
  const newEnd = newStart + sessionMs;

  const hasConflictingBooking = (existingBookings.Items || []).some((item) => {
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
  const recentBookings = (existingBookings.Items || []).filter((item) => {
    if (item.clientId !== user.userId) return false;
    if (item.status === "cancelled") return false;
    const createdAt = new Date(item.createdAt || 0).getTime();
    return createdAt >= last24h;
  });

  if (recentBookings.length >= 5) {
    return response(429, {
      message:
        "Достигна лимита от 5 активни резервации с този консултант за 24 часа. Опитай отново по-късно."
    });
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
    note: String(body.note || "").trim().slice(0, 1200),
    createdAt: new Date().toISOString()
  };

  try {
    await dynamo.send(
      new TransactWriteCommand({
        TransactItems: [
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
        ]
      })
    );
  } catch (error) {
    if (error.name === "TransactionCanceledException") {
      return badRequest("The selected slot already has an active booking request.");
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

async function acceptBooking({ claims, bookingId }) {
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

  const now = new Date().toISOString();

  await dynamo.send(
    new UpdateCommand({
      TableName: env.bookingsTable,
      Key: { bookingId },
      UpdateExpression: "SET #s = :confirmed, decidedAt = :now",
      ConditionExpression: "#s = :pending",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: {
        ":confirmed": "confirmed",
        ":pending": "pending",
        ":now": now
      }
    })
  );

  const updated = { ...booking, status: "confirmed", decidedAt: now };

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
  const existingBookings = await dynamo.send(
    new QueryCommand({
      TableName: env.bookingsTable,
      IndexName: "consultant-index",
      KeyConditionExpression: "consultantId = :consultantId",
      ExpressionAttributeValues: { ":consultantId": consultant.consultantId }
    })
  );
  const sessionMs =
    (Number(consultant.sessionLengthMinutes) || 60) * 60 * 1000;
  const newStart = newScheduledAt.getTime();
  const newEnd = newStart + sessionMs;
  const hasConflict = (existingBookings.Items || []).some((item) => {
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
    return acceptBooking({ claims, bookingId });
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
  const uid = `${booking.bookingId}@careerlane`;

  const description =
    `Резервация през CareerLane.\n` +
    `Консултант: ${consultant.name}\n` +
    `Формат: ${(consultant.sessionModes || []).join(", ") || "Онлайн"}\n` +
    (booking.note ? `Бележка: ${booking.note}\n` : "") +
    `Табло: ${env.appUrl}#/dashboard`;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CareerLane//Booking//BG",
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
      "Content-Disposition": `attachment; filename="careerlane-${bookingId}.ics"`,
      "Access-Control-Allow-Origin": env.allowedOrigin,
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
  const sessionLengthMinutes =
    Number(booking.sessionLengthMinutes) > 0
      ? Number(booking.sessionLengthMinutes)
      : Number(consultant.sessionLengthMinutes) > 0
        ? Number(consultant.sessionLengthMinutes)
        : 60;
  const sessionStartMs = new Date(booking.scheduledAt).getTime();
  const sessionEndMs = sessionStartMs + sessionLengthMinutes * 60 * 1000;
  const now = Date.now();

  if (sessionEndMs > now) {
    return badRequest(
      "Сесията още не е приключила. Можеш да оставиш отзив след края ѝ."
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
  const next = stored.map((n) => (n.readAt ? n : { ...n, readAt: now }));
  await dynamo.send(
    new UpdateCommand({
      TableName: env.usersTable,
      Key: { userId: claims.sub },
      UpdateExpression: "SET notifications = :n",
      ExpressionAttributeValues: { ":n": next }
    })
  );
  return response(200, { ok: true, unreadCount: 0 });
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

  return response(200, result.Items || []);
}

async function listConsultantsForAdmin(event) {
  requireAdmin(event);

  const pageSize = parsePageSize(event.queryStringParameters?.limit);
  const startKey = decodeCursor(event.queryStringParameters?.cursor);

  const { items: consultants, lastEvaluatedKey } = await scanWithFilter({
    tableName: env.consultantsTable,
    pageSize,
    startKey,
    filter: isConsultantRecord
  });

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

  const consultant = result.Item;
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

async function setConsultantStatus(event) {
  const claims = requireAdmin(event);
  const body = parseBody(event);
  const consultantId = event.pathParameters?.consultantId;

  if (!consultantId) {
    return badRequest("consultantId is required.");
  }

  const status = normalizeConsultantStatus(body.status);

  if (!status) {
    return badRequest("status must be one of: pending, approved, rejected.");
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

  // Self-approval is allowed — single-admin teams need an escape hatch. We
  // record it as `selfApproved: true` so the audit trail makes the decision
  // visible to anyone reviewing later.
  const isSelfApproval = existing.Item.ownerUserId === claims.sub;
  const now = new Date().toISOString();
  const updated = {
    ...existing.Item,
    profileStatus: status,
    isPublic: status === "approved",
    statusUpdatedAt: now,
    statusUpdatedBy: claims.sub,
    statusUpdatedByEmail: claims.email || "",
    statusSelfApproved: isSelfApproval,
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
    profileStatus: updated.profileStatus,
    isPublic: updated.isPublic,
    statusUpdatedAt: updated.statusUpdatedAt,
    statusUpdatedBy: updated.statusUpdatedBy,
    statusUpdatedByEmail: updated.statusUpdatedByEmail,
    statusSelfApproved: updated.statusSelfApproved
  });
}

function health() {
  return response(200, { ok: true, service: "careerlane-api" }, {
    "Cache-Control": "no-store"
  });
}

exports.handler = async (event) => {
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

    if (method === "GET" && path === "/health") return health();
    if (method === "GET" && path === "/consultants") return listConsultants(event);
    if (method === "GET" && path === "/consultants/me") return getMyConsultant(event);
    if (method === "PUT" && path === "/consultants/me") return updateMyConsultant(event);
    if (method === "GET" && /^\/consultants\/[^/]+$/.test(path)) return getConsultant(event);
    if (method === "POST" && path === "/auth/bootstrap") return bootstrapUser(event);
    if (method === "GET" && path === "/me/profile") return getMeProfile(event);
    if (method === "GET" && path === "/me/data-export") return exportMyData(event);
    if (method === "DELETE" && path === "/me") return deleteMyAccount(event);
    if (method === "GET" && path === "/me/notifications") return getMyNotifications(event);
    if (method === "POST" && path === "/me/notifications/mark-read") return markMyNotificationsRead(event);
    if (method === "PUT" && path === "/me/profile") return updateMeProfile(event);
    if (method === "POST" && path === "/me/documents/download-url") return createMyDocumentDownloadUrl(event);
    if (method === "POST" && path === "/me/cv/upload-url") return createUploadUrl(event);
    if (method === "GET" && path === "/bookings") return listBookings(event);
    if (method === "POST" && path === "/bookings") return createBooking(event);

    const bookingStatusMatch = /^\/bookings\/([^/]+)\/status$/.exec(path);
    if (method === "PATCH" && bookingStatusMatch) {
      event.pathParameters = { ...(event.pathParameters || {}), bookingId: bookingStatusMatch[1] };
      return updateBookingStatus(event);
    }

    const bookingReviewMatch = /^\/bookings\/([^/]+)\/review$/.exec(path);
    if (method === "POST" && bookingReviewMatch) {
      event.pathParameters = { ...(event.pathParameters || {}), bookingId: bookingReviewMatch[1] };
      return submitReview(event);
    }

    const bookingRescheduleMatch = /^\/bookings\/([^/]+)\/reschedule$/.exec(path);
    if (method === "PATCH" && bookingRescheduleMatch) {
      event.pathParameters = { ...(event.pathParameters || {}), bookingId: bookingRescheduleMatch[1] };
      return rescheduleBooking(event);
    }

    const bookingIcsMatch = /^\/bookings\/([^/]+)\/ics$/.exec(path);
    if (method === "GET" && bookingIcsMatch) {
      event.pathParameters = { ...(event.pathParameters || {}), bookingId: bookingIcsMatch[1] };
      return downloadBookingIcs(event);
    }

    if (method === "GET" && path === "/admin/consultants") return listConsultantsForAdmin(event);

    const adminStatusMatch = /^\/admin\/consultants\/([^/]+)\/status$/.exec(path);
    if (method === "PUT" && adminStatusMatch) {
      event.pathParameters = { ...(event.pathParameters || {}), consultantId: adminStatusMatch[1] };
      return setConsultantStatus(event);
    }

    const adminGetMatch = /^\/admin\/consultants\/([^/]+)$/.exec(path);
    if (method === "GET" && adminGetMatch) {
      event.pathParameters = { ...(event.pathParameters || {}), consultantId: adminGetMatch[1] };
      return getConsultantForAdmin(event);
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
  }
};
