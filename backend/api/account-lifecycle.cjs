const { GetCommand, PutCommand, UpdateCommand, DeleteCommand } = require("@aws-sdk/lib-dynamodb");
const { AdminGetUserCommand, AdminDeleteUserCommand, ListUsersCommand } = require("@aws-sdk/client-cognito-identity-provider");
const { ListObjectsV2Command, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const uuid = (value) => /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(String(value || ""));

function createAccountLifecycle({ dynamo, cognito, s3, env, getUserBySub, listConsultantsByOwner, queryAllItems, scanAllItems, refundFreePointsIfNeeded }) {
  const cacheKey = { userId: "system#monitoring-snapshot" };
  const invalidateMetrics = () => dynamo.send(new DeleteCommand({ TableName: env.usersTable, Key: cacheKey }));

  async function releaseSlot(booking) {
    if (!booking.consultantId || !booking.scheduledAt) return;
    for (let attempt = 0; attempt < 5; attempt++) {
      const Key = { consultantId: booking.consultantId };
      const { Item } = await dynamo.send(new GetCommand({ TableName: env.consultantsTable, Key, ConsistentRead: true }));
      const index = Item?.bookedSlots?.indexOf(booking.scheduledAt) ?? -1;
      if (index < 0) return;
      try {
        await dynamo.send(new UpdateCommand({ TableName: env.consultantsTable, Key,
          UpdateExpression: `REMOVE bookedSlots[${index}]`,
          ConditionExpression: `bookedSlots[${index}] = :slot`,
          ExpressionAttributeValues: { ":slot": booking.scheduledAt }
        }));
        return;
      } catch (error) { if (error.name !== "ConditionalCheckFailedException") throw error; }
    }
    throw new Error("Concurrent availability changes; retry account cleanup");
  }

  async function authoritativeUser(user) {
    try {
      return await cognito.send(new AdminGetUserCommand({ UserPoolId: env.userPoolId, Username: user.cognitoUsername || user.userId }));
    } catch (error) { if (error.name === "UserNotFoundException") return null; throw error; }
  }

  async function purgeUserAccount(userId, { alreadyDeleted = false } = {}) {
    if (!uuid(userId) || !env.userPoolId) throw new Error("Refusing deletion without an exact Cognito sub and pool.");
    const user = await getUserBySub(userId);
    const consultants = await listConsultantsByOwner(userId);
    if (alreadyDeleted && await authoritativeUser(user || { userId })) return { deleted: false, reason: "identity-still-exists" };
    if (!alreadyDeleted) {
      // Self-service deletion reaches here only AFTER its seven-day grace period.
      try { await cognito.send(new AdminDeleteUserCommand({ UserPoolId: env.userPoolId, Username: user?.cognitoUsername || userId })); }
      catch (error) { if (error.name !== "UserNotFoundException") throw error; }
    }
    const now = new Date().toISOString();
    if (user) await dynamo.send(new UpdateCommand({ TableName: env.usersTable, Key: { userId },
      UpdateExpression: "SET identityDeleted = :yes, deletionEffectiveAt = :now", ExpressionAttributeValues: { ":yes": true, ":now": now }
    }));

    const bookings = await queryAllItems({ TableName: env.bookingsTable, IndexName: "client-index", KeyConditionExpression: "clientId = :id", ExpressionAttributeValues: { ":id": userId } });
    for (const consultant of consultants) bookings.push(...await queryAllItems({ TableName: env.bookingsTable, IndexName: "consultant-index", KeyConditionExpression: "consultantId = :id", ExpressionAttributeValues: { ":id": consultant.consultantId } }));
    const uniqueBookings = new Map(bookings.map((b) => [b.bookingId, b]));
    for (const booking of uniqueBookings.values()) {
      const clientDeleted = booking.clientId === userId;
      const upcoming = ["pending", "confirmed"].includes(booking.status) && booking.scheduledAt > now;
      // Release before closing the booking so a failed cleanup remains retryable.
      // Remove only this list entry, never overwrite another concurrent booking.
      if (upcoming && clientDeleted) await releaseSlot(booking);
      if (upcoming && !clientDeleted) await refundFreePointsIfNeeded(booking);
      const values = { ":now": now, ":name": "[Изтрит профил]", ":empty": "", ":count": Number(booking.messageCount) || booking.messages?.length || 0 };
      let expression = "SET anonymizedAt = :now, messageCount = :count, " + (clientDeleted ? "clientName = :name, clientEmail = :empty" : "consultantName = :name");
      if (!clientDeleted) delete values[":empty"];
      if (upcoming) { expression += ", #status = :cancelled, cancelledAt = :now"; values[":cancelled"] = "cancelled"; }
      if (booking.review) { expression += ", review = :review"; values[":review"] = { rating: Number(booking.review.rating) || 0, createdAt: booking.review.createdAt || now }; }
      // A closed account's conversation is not retained as identifiable content.
      expression += " REMOVE messages, note, meetingLink";
      await dynamo.send(new UpdateCommand({ TableName: env.bookingsTable, Key: { bookingId: booking.bookingId }, UpdateExpression: expression,
        ...(upcoming ? { ExpressionAttributeNames: { "#status": "status" } } : {}), ExpressionAttributeValues: values
      }));
    }

    // Delete every object in the exact owner's prefixes, including abandoned
    // uploads. Errors propagate so the identity row remains retryable.
    if (env.cvBucket) for (const Prefix of [`profiles/${userId}/`, `consultants/${userId}/`]) {
      let ContinuationToken;
      do {
        const page = await s3.send(new ListObjectsV2Command({ Bucket: env.cvBucket, Prefix, ContinuationToken }));
        for (const object of page.Contents || []) {
          if (!object.Key?.startsWith(Prefix)) throw new Error("Unexpected object outside deletion prefix");
          await s3.send(new DeleteObjectCommand({ Bucket: env.cvBucket, Key: object.Key }));
        }
        ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (ContinuationToken);
    }
    for (const consultant of consultants) {
      // Minimal non-public tombstone keeps counterpart booking history usable;
      // no personal biography, media, contact fields, slug, or availability.
      await dynamo.send(new PutCommand({ TableName: env.consultantsTable, Item: { consultantId: consultant.consultantId, ownerUserId: userId, name: "[Изтрит профил]", isPublic: false, profileStatus: "rejected", identityDeleted: true, anonymizedAt: now } }));
      if (consultant.slug) await dynamo.send(new DeleteCommand({ TableName: env.consultantsTable, Key: { consultantId: `slug-claim#${consultant.slug}` },
        ConditionExpression: "ownerUserId = :owner", ExpressionAttributeValues: { ":owner": userId }
      })).catch((error) => { if (error.name !== "ConditionalCheckFailedException") throw error; });
    }
    if (user?.referralCode) await dynamo.send(new DeleteCommand({ TableName: env.usersTable, Key: { userId: `referral#${user.referralCode}` },
      ConditionExpression: "refUserId = :owner", ExpressionAttributeValues: { ":owner": userId }
    })).catch((error) => { if (error.name !== "ConditionalCheckFailedException") throw error; });
    await dynamo.send(new DeleteCommand({ TableName: env.usersTable, Key: { userId } }));
    await invalidateMetrics();
    return { deleted: true, anonymizedBookings: uniqueBookings.size, cognitoSubRetained: false };
  }

  async function reconcile({ force = false } = {}) {
    if (!env.userPoolId) throw new Error("Cognito pool is required for reconciliation");
    const Key = { userId: "system#identity-sync" };
    const { Item } = await dynamo.send(new GetCommand({ TableName: env.usersTable, Key }));
    if (!force && Number(Item?.nextCheckAt) > Date.now()) return { skipped: true };
    const identities = new Map(); let PaginationToken;
    do {
      const page = await cognito.send(new ListUsersCommand({ UserPoolId: env.userPoolId, Limit: 60, AttributesToGet: ["sub"], PaginationToken }));
      for (const account of page.Users || []) {
        const sub = account.Attributes?.find((a) => a.Name === "sub")?.Value;
        if (sub) identities.set(sub, account.Enabled === true);
      }
      PaginationToken = page.PaginationToken;
    } while (PaginationToken);
    const users = (await scanAllItems(env.usersTable)).filter((u) => uuid(u.userId));
    let deleted = 0; let updated = 0;
    for (const user of users) {
      let disabled = identities.get(user.userId) === false;
      if (!identities.has(user.userId)) {
        // Never delete from an eventually-consistent ListUsers omission alone.
        const current = await authoritativeUser(user);
        if (!current) {
          if ((await purgeUserAccount(user.userId, { alreadyDeleted: true })).deleted) deleted++;
          continue;
        }
        disabled = current.Enabled !== true;
      }
      if (Boolean(user.identityDisabled) === disabled) continue;
      const rows = await listConsultantsByOwner(user.userId);
      for (const row of [{ table: env.usersTable, key: { userId: user.userId } }, ...rows.map((c) => ({ table: env.consultantsTable, key: { consultantId: c.consultantId } }))]) {
        await dynamo.send(new UpdateCommand({ TableName: row.table, Key: row.key, UpdateExpression: "SET identityDisabled = :disabled", ExpressionAttributeValues: { ":disabled": disabled } }));
      }
      updated++;
    }
    await dynamo.send(new PutCommand({ TableName: env.usersTable, Item: { ...Key, lastCompletedAt: new Date().toISOString(), nextCheckAt: Date.now() + 86400000, deleted, updated } }));
    if (deleted || updated || force) await invalidateMetrics();
    return { deleted, updated };
  }

  async function handleEvent(event) {
    const detail = event.detail || {};
    if (detail.errorCode) return { ignored: true };
    const pool = detail.requestParameters?.userPoolId || detail.additionalEventData?.userPoolId;
    if (pool !== env.userPoolId) return { ignored: true };
    if (!["AdminDeleteUser", "DeleteUser", "AdminDisableUser", "AdminEnableUser"].includes(detail.eventName)) return { ignored: true };
    const sub = [detail.additionalEventData?.sub, detail.additionalEventData?.userSub, detail.additionalEventData?.UserSub, detail.requestParameters?.username].find(uuid);
    if (sub && ["AdminDeleteUser", "DeleteUser"].includes(detail.eventName)) await purgeUserAccount(sub, { alreadyDeleted: true });
    return reconcile({ force: true });
  }
  return { purgeUserAccount, reconcile, handleEvent };
}
module.exports = { createAccountLifecycle };
