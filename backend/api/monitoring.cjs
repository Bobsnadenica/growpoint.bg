const { TransactWriteCommand } = require("@aws-sdk/lib-dynamodb");
const TOTALS_ID = "system#telemetry";

function createMonitoring({ dynamo, table, now = Date.now }) {

  // Lifetime + UTC-day counters, no recipient addresses or message bodies.
  async function record(metric) {
    if (!["emailAccepted", "emailFailed", "emailSkipped", "chatSent", "adminMessages", "apiErrors"].includes(metric)) return;
    const timestamp = new Date(now()).toISOString();
    try {
      await dynamo.send(new TransactWriteCommand({ TransactItems: [TOTALS_ID, `${TOTALS_ID}#${timestamp.slice(0, 10)}`].map((userId) => ({
        Update: {
          TableName: table, Key: { userId },
          UpdateExpression: "SET startedAt = if_not_exists(startedAt, :now), updatedAt = :now ADD #metric :one",
          ExpressionAttributeNames: { "#metric": metric },
          ExpressionAttributeValues: { ":now": timestamp, ":one": 1 }
        }
      })) }));
    } catch (error) {
      console.error("[monitoring] counter failed", { metric, error: error.name });
    }
  }
  return { record };
}

const has = (value) => Array.isArray(value) ? value.length > 0 : typeof value === "string" ? value.trim().length > 0 : Boolean(value);
function profileCompletion(user, consultant) {
  const fields = user.role === "consultant" ? [
    consultant?.name, consultant?.city,
    consultant?.headline, consultant?.bio, consultant?.experienceSummary,
    consultant?.experienceHighlights, consultant?.educationHighlights,
    consultant?.specializations, consultant?.languages, consultant?.idealFor,
    consultant?.consultationTopics, consultant?.workApproach, consultant?.availability
  ] : [user.name, user.avatarUrl || user.avatarStorageKey, user.city, user.occupation, user.bio, user.goals];
  return Math.round(fields.filter(has).length / fields.length * 100);
}

function monitoringSummary({ users, consultants, bookings, allUsers, days }) {
  const ownerMap = new Map(consultants.map((c) => [c.ownerUserId, c]));
  const completion = { total: 0, clients: 0, consultants: 0, mentors: 0, incomplete: 0 };
  for (const user of users) {
    const consultant = ownerMap.get(user.userId);
    if (profileCompletion(user, consultant) !== 100) { completion.incomplete++; continue; }
    completion.total++;
    completion[user.role !== "consultant" ? "clients" : consultant?.profileType === "mentor" ? "mentors" : "consultants"]++;
  }
  const totals = allUsers.find((u) => u.userId === TOTALS_ID) || {};
  const counters = (row = {}) => Object.fromEntries(["emailAccepted", "emailFailed", "emailSkipped", "chatSent", "adminMessages", "apiErrors"].map((key) => [key, Number(row[key]) || 0]));
  const timeline = days.map((date) => ({ date, ...counters(allUsers.find((u) => u.userId === `${TOTALS_ID}#${date}`)) }));
  const invitations = allUsers.filter((u) => u.recordType === "invite");
  return {
    completion,
    expertTypes: { consultants: consultants.filter((c) => c.profileType !== "mentor").length, mentors: consultants.filter((c) => c.profileType === "mentor").length },
    telemetry: { since: totals.startedAt || null, ...counters(totals), perDay: timeline },
    accounts: { restricted: users.filter((u) => u.restricted).length, deleting: users.filter((u) => u.deletionScheduledAt).length },
    files: { total: users.reduce((sum, u) => sum + (u.cvDocument ? 1 : 0) + (u.documents || []).length, 0) },
    payments: Object.fromEntries(["paid", "free", "unpaid"].map((state) => [state, bookings.filter((b) => (b.paymentStatus || "unpaid") === state).length])),
    invitations: { total: invitations.length, redeemed: invitations.filter((i) => i.status === "redeemed").length, pending: invitations.filter((i) => i.status === "pending" && i.expiresAt > new Date().toISOString()).length },
    bookingActivity: days.map((date) => ({ date, count: bookings.filter((b) => String(b.createdAt || "").startsWith(date)).length }))
  };
}

module.exports = { createMonitoring, monitoringSummary, profileCompletion };
