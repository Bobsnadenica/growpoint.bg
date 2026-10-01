// Pure entitlement/quota rules. Stored on the expert's existing row; no timers,
// bank calls, mail, new tables, or entitlement changes.
const { randomUUID } = require("node:crypto");
const dateParts = value => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw Object.assign(new Error("Невалидна дата."), { statusCode: 400 });
  return Object.fromEntries(new Intl.DateTimeFormat("en", { timeZone: "Europe/Sofia", year: "numeric", month: "2-digit" }).formatToParts(date).map(part => [part.type, part.value]));
};
const monthOf = value => { const parts = dateParts(value); return `${parts.year}-${parts.month}`; };
const quarterOf = value => { const parts = dateParts(value); return `${parts.year}-Q${Math.ceil(Number(parts.month) / 3)}`; };
const nextQuarter = period => { const [year, quarter] = period.split("-Q").map(Number); return quarter === 4 ? `${year + 1}-Q1` : `${year}-Q${quarter + 1}`; };
const conflict = message => { throw Object.assign(new Error(message), { statusCode: 409 }); };
const quotaMap = consultant => consultant.monthlyFreeSessions && typeof consultant.monthlyFreeSessions === "object" && !Array.isArray(consultant.monthlyFreeSessions) ? { ...consultant.monthlyFreeSessions } : {};

function monthlyFreeMutation(consultant, booking, action, scheduledAt = booking.scheduledAt, now = Date.now()) {
  if (action !== "claim" && booking.freeSessionSource !== "monthly_offer") return null;
  const claims = quotaMap(consultant);
  const month = monthOf(scheduledAt);
  const oldMonth = booking.freeSessionMonth || monthOf(booking.scheduledAt);
  if (action === "release") {
    // Once the session starts, its monthly offer remains consumed even if a
    // participant later cancels the history record.
    if (Date.parse(booking.scheduledAt) <= now || booking.sessionConfirmation?.clientConfirmedAt || booking.sessionConfirmation?.consultantConfirmedAt || booking.review) return null;
    if (claims[oldMonth] !== booking.bookingId) return null;
    delete claims[oldMonth];
  } else {
    if (action === "move" && claims[oldMonth] !== booking.bookingId) conflict("Месечната безплатна сесия е променена. Обнови резервацията.");
    if (claims[month] && claims[month] !== booking.bookingId) conflict("Безплатната сесия на експерта за този месец вече е резервирана. Избери друг месец или платена сесия.");
    if (action === "move" && oldMonth !== month) delete claims[oldMonth];
    claims[month] = booking.bookingId;
  }
  return { claims, month };
}

function monthlyFreeSummary(consultant, eligible, now = Date.now()) {
  const month = monthOf(now);
  return { month, eligible: Boolean(eligible), remaining: eligible && !quotaMap(consultant)[month] ? 1 : 0 };
}
function monthlyFreeAvailableMonths(consultant, slots, eligible) {
  if (!eligible) return [];
  const claims = quotaMap(consultant);
  return [...new Set(slots.map(monthOf))].filter(month => !claims[month]).sort();
}

function withMonthlyQuota(update, consultant, mutation) {
  if (!mutation) return update;
  const hasMap = Object.prototype.hasOwnProperty.call(consultant, "monthlyFreeSessions");
  return { ...update,
    UpdateExpression: update.UpdateExpression.startsWith("REMOVE ") ? "SET monthlyFreeSessions = :monthlyFreeSessions " + update.UpdateExpression : update.UpdateExpression + ", monthlyFreeSessions = :monthlyFreeSessions",
    ConditionExpression: (update.ConditionExpression ? update.ConditionExpression + " AND " : "") + (hasMap ? "monthlyFreeSessions = :previousMonthlyFreeSessions" : "attribute_not_exists(monthlyFreeSessions)"),
    ExpressionAttributeValues: { ...update.ExpressionAttributeValues, ":monthlyFreeSessions": mutation.claims, ...(hasMap ? { ":previousMonthlyFreeSessions": consultant.monthlyFreeSessions } : {}) }
  };
}

const BENEFIT_KINDS = ["podcast", "campaign", "event_room"];
const BENEFIT_STATUSES = ["pending", "scheduled", "completed", "cancelled"];
const requestsOf = consultant => Array.isArray(consultant.spotlightBenefitRequests) ? consultant.spotlightBenefitRequests : [];
function spotlightSummary(consultant, eligible, now = Date.now()) {
  const quarter = quarterOf(now);
  return { eligible: Boolean(eligible), quarter, eventRoomRemaining: eligible && !requestsOf(consultant).some(request => request.kind === "event_room" && request.period === quarter && request.status !== "cancelled") ? 1 : 0 };
}
function createBenefitRequest(consultant, body, now = Date.now()) {
  if (!BENEFIT_KINDS.includes(body.kind)) throw Object.assign(new Error("Избери подкаст, кампания или зала."), { statusCode: 400 });
  const requests = requestsOf(consultant);
  if (requests.length >= 100) conflict("Историята на заявките е запълнена. Свържи се с администратор.");
  const quarter = quarterOf(now);
  const period = body.kind === "event_room" ? String(body.period || quarter) : quarter;
  if (body.kind === "event_room" && ![quarter, nextQuarter(quarter)].includes(period)) throw Object.assign(new Error("Залата може да се заяви за текущото или следващото тримесечие."), { statusCode: 400 });
  if (requests.some(request => request.kind === body.kind && (body.kind === "event_room" ? request.period === period && request.status !== "cancelled" : ["pending", "scheduled"].includes(request.status)))) conflict("Вече има активна заявка за тази привилегия.");
  const request = { requestId: randomUUID(), kind: body.kind, period, status: "pending", note: String(body.note || "").trim().slice(0, 600), createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString() };
  const next = [...requests, request];
  if (Buffer.byteLength(JSON.stringify(next), "utf8") > 200000) conflict("Историята на заявките е запълнена. Свържи се с администратор.");
  return { request, requests: next };
}
function updateBenefitRequest(consultant, requestId, body, now = Date.now()) {
  const requests = requestsOf(consultant);
  const current = requests.find(request => request.requestId === requestId);
  if (!current) throw Object.assign(new Error("Заявката не е намерена."), { statusCode: 404 });
  if (!BENEFIT_STATUSES.includes(body.status)) throw Object.assign(new Error("Невалиден статус."), { statusCode: 400 });
  const allowed = { pending: ["pending", "scheduled", "cancelled"], scheduled: ["scheduled", "completed", "cancelled"], completed: ["completed"], cancelled: ["cancelled"] };
  if (!allowed[current.status]?.includes(body.status)) conflict("Завършена или отменена заявка не може да бъде отворена отново.");
  const request = { ...current, status: body.status, adminNote: String(body.adminNote ?? current.adminNote ?? "").trim().slice(0, 600), updatedAt: new Date(now).toISOString() };
  if (body.status === "scheduled") {
    const scheduledAt = new Date(body.scheduledAt || current.scheduledAt || "");
    if (!Number.isFinite(scheduledAt.getTime()) || scheduledAt.getTime() <= now) throw Object.assign(new Error("Избери бъдеща дата за изпълнение."), { statusCode: 400 });
    if (current.kind === "event_room" && quarterOf(scheduledAt) !== current.period) throw Object.assign(new Error("Датата за залата трябва да е в заявеното тримесечие."), { statusCode: 400 });
    request.scheduledAt = scheduledAt.toISOString();
  }
  if (body.status === "completed" && Date.parse(current.scheduledAt) > now) throw Object.assign(new Error("Изпълнението може да се потвърди след планираната дата."), { statusCode: 400 });
  if (body.status === "completed") request.completedAt = current.completedAt || new Date(now).toISOString();
  const next = requests.map(item => item.requestId === requestId ? request : item);
  if (Buffer.byteLength(JSON.stringify(next), "utf8") > 200000) conflict("Намали текста в заявката. Достигнат е лимитът за съхранение.");
  return { request, requests: next };
}

module.exports = { monthOf, quarterOf, monthlyFreeMutation, monthlyFreeSummary, monthlyFreeAvailableMonths, withMonthlyQuota, spotlightSummary, createBenefitRequest, updateBenefitRequest };
