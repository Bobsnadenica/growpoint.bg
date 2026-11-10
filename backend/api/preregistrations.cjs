const { createHash } = require("node:crypto");
const { PutCommand, UpdateCommand, ScanCommand } = require("@aws-sdk/lib-dynamodb");

const CONSENT_VERSION = "preregistration-2026-11-10";
const RETENTION_DAYS = 180;
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const hash = value => createHash("sha256").update(value).digest("hex");

function normalizeRegistration(body) {
  const text = (key, max, required = false) => {
    if (body[key] !== undefined && typeof body[key] !== "string") throw fail("Провери въведените данни.");
    const value = (body[key] || "").trim().normalize("NFC");
    if ((required && !value) || value.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)) throw fail("Провери въведените данни и дължината на полетата.");
    return value;
  };
  const firstName = text("firstName", 80, true);
  const lastName = text("lastName", 80, true);
  const email = text("email", 254, true).toLowerCase();
  const phone = text("phone", 30);
  const comment = text("comment", 1000);
  if (/[\r\n\t]/.test(firstName + lastName) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail("Въведи валидни имена и имейл адрес.");
  if (phone && !/^\+?[\d ()-]{6,29}$/.test(phone)) throw fail("Въведи валиден телефон или остави полето празно.");
  if (!["client", "mentor"].includes(body.audience)) throw fail("Избери потребител или ментор.");
  if (body.consent !== true) throw fail("Нужно е съгласие за връзка относно старта.");
  return { firstName, lastName, email, phone, comment, audience: body.audience };
}

function csvCell(value) {
  let text = String(value ?? "").replace(/\u0000/g, "");
  // Spreadsheet programs interpret leading whitespace + formula characters too.
  if (/^[\s\uFEFF]*[=+@-]/u.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

function registrationsCsv(items) {
  const rows = [["Име", "Фамилия", "Потребител или ментор", "Имейл", "Телефон", "Кратък коментар", "Дата (UTC)", "Съгласие (версия)"]];
  for (const item of items) rows.push([item.firstName, item.lastName, item.audience === "mentor" ? "Ментор" : "Потребител", item.email, item.phone, item.comment, item.createdAt, item.consentVersion]);
  return "\uFEFF" + rows.map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

function createPreregistrations({ dynamo, table, now = () => Date.now() }) {
  const configured = () => { if (!table) throw fail("Предварителната регистрация временно не е достъпна. Опитай отново по-късно.", 503); };
  return {
    async submit(body, sourceIp) {
      configured();
      if (body.website) return; // Invisible honeypot: never store bot submissions.
      const registration = normalizeRegistration(body);
      const timestamp = now();
      const seconds = Math.floor(timestamp / 1000);
      const minute = Math.floor(seconds / 60);
      try {
        await dynamo.send(new UpdateCommand({
          TableName: table, Key: { id: `rate#${minute}#${hash(String(sourceIp || "unknown"))}` },
          UpdateExpression: "SET expiresAt = :ttl ADD attempts :one",
          ConditionExpression: "attribute_not_exists(attempts) OR attempts < :limit",
          ExpressionAttributeValues: { ":ttl": seconds + 3600, ":one": 1, ":limit": 20 }
        }));
      } catch (error) {
        if (error.name === "ConditionalCheckFailedException") throw fail("Твърде много заявки. Опитай отново след минута.", 429);
        throw error;
      }
      try {
        await dynamo.send(new PutCommand({
          TableName: table,
          Item: { id: `signup#${hash(registration.email)}`, kind: "registration", ...registration,
            createdAt: new Date(timestamp).toISOString(), consentAt: new Date(timestamp).toISOString(),
            consentVersion: CONSENT_VERSION, expiresAt: seconds + RETENTION_DAYS * 86400 },
          ConditionExpression: "attribute_not_exists(id) OR expiresAt < :now",
          ExpressionAttributeValues: { ":now": seconds }
        }));
      } catch (error) {
        // Same acknowledgement for duplicates; do not disclose or overwrite data.
        if (error.name !== "ConditionalCheckFailedException") throw error;
      }
    },
    async list() {
      configured();
      const items = [];
      let cursor;
      let pages = 0;
      do {
        const result = await dynamo.send(new ScanCommand({
          TableName: table, ConsistentRead: true, ExclusiveStartKey: cursor,
          FilterExpression: "#kind = :kind AND expiresAt > :now",
          ExpressionAttributeNames: { "#kind": "kind" },
          ExpressionAttributeValues: { ":kind": "registration", ":now": Math.floor(now() / 1000) }
        }));
        items.push(...(result.Items || []));
        cursor = result.LastEvaluatedKey;
        // ponytail: on-demand scan for the small launch list; fail explicitly above
        // the Lambda download budget instead of returning a truncated export.
        if (++pages > 50 || Buffer.byteLength(JSON.stringify(items)) > 2_000_000) throw fail("Списъкът е твърде голям за директен експорт. Свържи се с администратора.", 503);
      } while (cursor);
      return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
  };
}

module.exports = { createPreregistrations, normalizeRegistration, registrationsCsv, CONSENT_VERSION, RETENTION_DAYS };
