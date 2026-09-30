const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const { loadApi } = require("./helpers/api-harness.cjs");
const sdkRequire = createRequire(require.resolve("../backend/api/index.cjs"));
const request = body => ({ body: JSON.stringify(body), requestContext: { authorizer: { jwt: { claims: { sub: "client" } } } } });
const copy = value => JSON.parse(JSON.stringify(value));

test("upload signing binds the actual content length and rejects fractional or oversized requests", async () => {
  let signed;
  const api = loadApi({ presign: async (_, command, options) => { signed = { command, options }; return "https://example.invalid/upload"; }, send: async () => ({ Item: { userId: "client", documents: [] } }) }).test;
  for (const size of [0, 1.5, Number.MAX_SAFE_INTEGER, 50 * 1024 * 1024 + 1]) {
    assert.equal((await api.createUploadUrl(request({ fileName: "qa.txt", kind: "document", contentType: "text/plain", fileSize: size }))).statusCode, 400);
  }
  assert.equal((await api.createUploadUrl(request({ fileName: "qa.txt", kind: "document", contentType: "text/plain", fileSize: 64 }))).statusCode, 200);
  assert.equal(signed.command.input.ContentLength, 64);
  assert.equal(signed.options.signableHeaders.has("content-length"), true);
  // Real SDK signing, dummy credentials, no network request or AWS account.
  const { S3Client, PutObjectCommand } = sdkRequire("@aws-sdk/client-s3");
  const { getSignedUrl } = sdkRequire("@aws-sdk/s3-request-presigner");
  const client = new S3Client({ region: "eu-west-1", credentials: { accessKeyId: "unit-only", secretAccessKey: "unit-only" } });
  const url = await getSignedUrl(client, new PutObjectCommand({ Bucket: "unit-bucket", Key: "qa.txt", ContentLength: 64 }), { expiresIn: 300, signableHeaders: new Set(["content-length"]) });
  assert.ok(new URL(url).searchParams.get("X-Amz-SignedHeaders").split(";").includes("content-length"));
});

test("document registration uses actual S3 bytes, rejects missing objects and enforces total quota", async () => {
  const api = loadApi({ send: async command => {
    assert.equal(command.constructor.name, "HeadObjectCommand");
    return { ContentLength: 32 * 1024 * 1024 };
  } }).test;
  const next = { documents: [{ storageKey: "profiles/client/documents/a", sizeBytes: 1 }] };
  await api.validateStoredDocuments(next, {});
  assert.equal(next.documents[0].sizeBytes, 32 * 1024 * 1024);
  await assert.rejects(api.validateStoredDocuments({ documents: [{ storageKey: "a", sizeBytes: 1 }, { storageKey: "b", sizeBytes: 1 }] }, {}), error => error.statusCode === 400);
  const missing = loadApi({ send: async () => { throw Object.assign(new Error("missing"), { name: "NotFound" }); } }).test;
  await assert.rejects(missing.validateStoredDocuments({ documents: [{ storageKey: "a" }] }, {}), error => error.statusCode === 400);
});

test("notification mark-read and trimming retry snapshots without dropping newly appended alerts", async () => {
  for (const operation of ["markMyNotificationsRead", "getMyNotifications"]) {
    let stored = Array.from({ length: operation === "getMyNotifications" ? 51 : 2 }, (_, index) => ({ id: `n${index}`, createdAt: new Date(2020, 0, index + 1).toISOString() }));
    let writes = 0;
    const api = loadApi({ send: async command => {
      if (command.constructor.name === "GetCommand") return { Item: { notifications: copy(stored) } };
      writes++;
      if (writes === 1) stored.push({ id: "new", createdAt: "2099-01-01T00:00:00.000Z" });
      assert.match(command.input.ConditionExpression, /attribute_exists\(userId\).*notifications = :previous/);
      if (JSON.stringify(stored) !== JSON.stringify(command.input.ExpressionAttributeValues[":previous"])) {
        throw Object.assign(new Error("raced"), { name: "ConditionalCheckFailedException" });
      }
      stored = copy(command.input.ExpressionAttributeValues[":next"]);
      return {};
    } }).test;
    assert.equal((await api[operation](request({ notificationId: "n0" }))).statusCode, 200);
    assert.equal(writes, 2);
    assert.ok(stored.some(notification => notification.id === "new"));
    if (operation === "getMyNotifications") assert.equal(stored.length, 50);
    else {
      assert.ok(stored.find(notification => notification.id === "n0").readAt);
      assert.equal(stored.find(notification => notification.id === "new").readAt, undefined);
    }
  }
});

test("new bookings atomically guard active client and expert state, including point redemption", async () => {
  for (const useFreePoints of [false, true]) {
    let transaction;
    const expert = { consultantId: "expert", ownerUserId: "expert-owner", slug: "expert", name: "Expert", comped: true, isPublic: true, profileStatus: "approved", availability: ["2099-01-01T10:00:00.000Z"], bookedSlots: [] };
    const api = loadApi({ send: async command => {
      if (command.constructor.name === "GetCommand") return { Item: command.input.TableName === "unit-users" ? { userId: "client", role: "client", points: 100 } : expert };
      if (command.constructor.name === "QueryCommand") return { Items: [] };
      if (command.constructor.name === "TransactWriteCommand") transaction = command.input.TransactItems;
      return {};
    } }).test;
    assert.equal((await api.createBooking(request({ consultantId: "expert", scheduledAt: expert.availability[0], useFreePoints }))).statusCode, 201);
    const userCheck = transaction[2].Update || transaction[2].ConditionCheck;
    assert.match(userCheck.ConditionExpression, /attribute_exists\(userId\).*identityDisabled.*restricted/);
    if (useFreePoints) assert.match(userCheck.ConditionExpression, /points >= :cost/);
    assert.ok(Object.values(transaction[0].Update.ExpressionAttributeNames).includes("restricted"));
    assert.ok(Object.values(transaction[0].Update.ExpressionAttributeNames).includes("packageSource"));
  }
});

test("public availability respects the same five-minute booking cutoff as creation", () => {
  const api = loadApi().test;
  const near = new Date(Date.now() + 4 * 60 * 1000).toISOString();
  const later = new Date(Date.now() + 6 * 60 * 1000).toISOString();
  assert.deepEqual(copy(api.getBookableAvailability({ availability: [near, later] })), [later]);
});

test("past and attended booking history cannot be moved into a new session", async () => {
  for (const history of [{ scheduledAt: "2020-01-01T10:00:00.000Z" }, { sessionConfirmation: { clientConfirmedAt: "2020-01-01" } }, { review: { rating: 5 } }]) {
    let writes = 0;
    const api = loadApi({ send: async command => {
      if (command.constructor.name === "GetCommand") return { Item: command.input.TableName === "unit-bookings"
        ? { bookingId: "old", consultantId: "expert", clientId: "client", scheduledAt: "2099-01-01T10:00:00.000Z", status: "confirmed", ...history }
        : { consultantId: "expert", ownerUserId: "consultant" } };
      writes++;
      return {};
    } }).test;
    const result = await api.rescheduleBooking({ ...request({ scheduledAt: "2099-01-02T10:00:00.000Z" }), pathParameters: { bookingId: "old" } });
    assert.equal(result.statusCode, 400);
    assert.equal(writes, 0);
  }
});
