const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApi } = require("./helpers/api-harness.cjs");
const copy = value => JSON.parse(JSON.stringify(value));
const request = (body, sub = "client", parameters = {}) => ({ body: JSON.stringify(body), pathParameters: parameters, requestContext: { authorizer: { jwt: { claims: { sub, "cognito:groups": sub === "admin" ? ["admin"] : [] } } } } });
const fieldsFrom = input => Object.fromEntries(Object.entries(input.ExpressionAttributeNames || {}).filter(([key]) => key.startsWith("#field")).map(([key, field]) => [field, input.ExpressionAttributeValues[key.replace("#", ":")]]));
const conditional = () => Object.assign(new Error("snapshot changed"), { name: "ConditionalCheckFailedException" });

function checkGuard(input, record) {
  if (!record) throw conditional();
  if (input.ConditionExpression?.includes("attribute_not_exists(identityDeleted)") && "identityDeleted" in record) throw conditional();
  if (input.ConditionExpression?.includes("attribute_not_exists(deletionScheduledAt)") && "deletionScheduledAt" in record) throw conditional();
  if (input.ExpressionAttributeValues?.[":notRestricted"] && record.restricted) throw conditional();
  for (const [key, field] of Object.entries(input.ExpressionAttributeNames || {}).filter(([key]) => key.startsWith("#snapshot"))) {
    const valueKey = key.replace("#", ":");
    if (valueKey in input.ExpressionAttributeValues) {
      if (JSON.stringify(record[field]) !== JSON.stringify(input.ExpressionAttributeValues[valueKey])) throw conditional();
    } else if (Object.prototype.hasOwnProperty.call(record, field)) throw conditional();
  }
  if (input.ConditionExpression?.includes("bookedSlots = :previousSlots") && JSON.stringify(record.bookedSlots) !== JSON.stringify(input.ExpressionAttributeValues[":previousSlots"])) throw conditional();
}

function records({ mutateUser, mutateExpert, objectBytes = 32 * 1024 * 1024 } = {}) {
  const state = {
    user: { userId: "client", role: "client", name: "Saved", referralCode: "abcdefgh", points: 20, awardedProfileComplete: true, documents: [], restricted: false, notifications: [] },
    expert: { consultantId: "expert", ownerUserId: "client", slug: "expert", name: "Expert", city: "City", comped: true, isPublic: true, profileStatus: "approved", restricted: false, bookedSlots: [], reviewCount: 0, ratingSum: 0, availability: ["2099-01-01T10:00:00.000Z"] },
    writes: []
  };
  function update(input) {
    const isUser = input.TableName === "unit-users";
    if (isUser && mutateUser) { mutateUser(state, input); mutateUser = null; }
    if (!isUser && mutateExpert) { mutateExpert(state, input); mutateExpert = null; }
    const record = isUser ? state.user : state.expert;
    checkGuard(input, record);
    const fields = fieldsFrom(input);
    assert.ok(Object.keys(fields).length, "Expected targeted update");
    Object.assign(record, copy(fields));
    state.writes.push({ table: input.TableName, fields });
    return { Attributes: copy(record) };
  }
  const api = loadApi({ presign: async () => "https://example.invalid/document", send: async command => {
    const input = command.input;
    if (command.constructor.name === "HeadObjectCommand") return { ContentLength: objectBytes };
    if (command.constructor.name === "GetCommand") return { Item: copy(input.TableName === "unit-users" ? state.user : state.expert) };
    if (command.constructor.name === "QueryCommand") return { Items: [copy(state.expert)] };
    if (command.constructor.name === "PutCommand") {
      assert.ok(input.Item.userId?.startsWith("referral#"), "Existing records must not use whole-record Put");
      return {};
    }
    if (command.constructor.name === "UpdateCommand") return update(input);
    if (command.constructor.name === "TransactWriteCommand") {
      for (const item of input.TransactItems) { assert.ok(item.Update, "Unchanged slug must not need a whole-record Put"); update(item.Update); }
    }
    return {};
  } });
  return { api: api.test, state };
}

test("profile saves and repeat bootstrap preserve concurrent point spending and appended notifications", async () => {
  for (const operation of ["updateMeProfile", "bootstrapUser"]) {
    const { api, state } = records({ mutateUser: state => { state.user.points = 0; state.user.notifications.push({ id: "new" }); state.user.referralCredited = true; } });
    const result = await api[operation](request({ name: "Edited" }));
    assert.equal(result.statusCode, 200);
    assert.equal(state.user.name, "Edited");
    assert.equal(state.user.points, 0);
    assert.equal(state.user.referralCredited, true);
    assert.deepEqual(state.user.notifications, [{ id: "new" }]);
    assert.equal(JSON.parse(result.body).points, 0);
    assert.ok(state.writes.every(write => !["points", "notifications", "restricted", "plan"].some(field => field in write.fields)));
  }
});

test("profile saves and bootstrap cannot overwrite a concurrent suspension, deletion or missing account", async () => {
  for (const operation of ["updateMeProfile", "bootstrapUser"]) {
    for (const flags of [{ restricted: true }, { identityDeleted: true }, { deletionScheduledAt: "2026-09-30" }, null]) {
      const { api, state } = records({ mutateUser: state => { if (flags) Object.assign(state.user, flags); else state.user = null; } });
      await assert.rejects(api[operation](request({ name: "Cannot save" })), error => error.name === "ConditionalCheckFailedException");
      assert.equal(state.writes.length, 0);
      assert.notEqual(state.user?.name, "Cannot save");
    }
  }
});

test("document edits reject a stale list instead of deleting a document uploaded concurrently", async () => {
  const { api, state } = records({ mutateUser: state => { state.user.documents = [{ fileName: "Concurrent upload" }]; } });
  await assert.rejects(api.updateMeProfile(request({ documents: [] })), error => error.name === "ConditionalCheckFailedException");
  assert.deepEqual(state.user.documents, [{ fileName: "Concurrent upload" }]);
  assert.equal(state.writes.length, 0);
});

test("CV and document changes guard both collections so concurrent uploads cannot bypass their shared quota", async () => {
  for (const [body, other] of [[{ documents: [] }, "cvDocument"], [{ cvDocument: null }, "documents"]]) {
    const concurrentUpload = { fileName: "Other collection", sizeBytes: 32 * 1024 * 1024 };
    const { api, state } = records({ mutateUser: state => { state.user[other] = other === "documents" ? [concurrentUpload] : concurrentUpload; } });
    await assert.rejects(api.updateMeProfile(request(body)), error => error.name === "ConditionalCheckFailedException");
    assert.equal(state.writes.length, 0);
    assert.deepEqual(state.user[other], other === "documents" ? [concurrentUpload] : concurrentUpload);
  }
});

test("file submissions repair untouched legacy collection sizes without modifying the read snapshot", async () => {
  const { api, state } = records();
  const legacy = { fileName: "Legacy CV", storageKey: "profiles/client/documents/cv", sizeBytes: 1 };
  state.user.cvDocument = legacy;
  const result = await api.updateMeProfile(request({ documents: [] }));
  assert.equal(result.statusCode, 200);
  assert.equal(state.user.cvDocument.sizeBytes, 32 * 1024 * 1024);
  assert.equal(legacy.sizeBytes, 1);
  assert.equal(state.writes[0].fields.cvDocument.sizeBytes, 32 * 1024 * 1024);
});

test("known legacy one-byte metadata cannot bypass actual CV plus document storage quota", async () => {
  const { api, state } = records();
  state.user.cvDocument = { fileName: "CV", storageKey: "profiles/client/documents/cv", sizeBytes: 1 };
  state.user.documents = [{ fileName: "Document", storageKey: "profiles/client/documents/file", sizeBytes: 1 }];
  await assert.rejects(api.updateMeProfile(request({ documents: copy(state.user.documents) })), error => error.statusCode === 400);
  assert.equal(state.writes.length, 0);
  assert.equal(state.user.cvDocument.sizeBytes, 1);
  assert.equal(state.user.documents[0].sizeBytes, 1);
});

test("expert edits retain concurrent review aggregation and never rewrite reservations", async () => {
  const { api, state } = records({ mutateExpert: state => { state.expert.reviewCount = 1; state.expert.ratingSum = 5; } });
  state.user.role = "consultant";
  assert.equal((await api.updateMyConsultant(request({ city: "New city" }))).statusCode, 200);
  assert.equal(state.expert.city, "New city");
  assert.equal(state.expert.reviewCount, 1);
  assert.equal(state.expert.ratingSum, 5);
  assert.ok(state.writes.filter(write => write.table === "unit-consultants").every(write => !("bookedSlots" in write.fields)));
});

test("expert profile edits reject concurrent package and access changes", async () => {
  for (const flags of [{ packageSource: "granted", packageTier: "grow" }, { restricted: true }, { identityDeleted: true }]) {
    const { api, state } = records({ mutateExpert: state => Object.assign(state.expert, flags) });
    state.user.role = "consultant";
    await assert.rejects(api.updateMyConsultant(request({ city: "Cannot save" })), error => error.name === "ConditionalCheckFailedException");
    assert.notEqual(state.expert.city, "Cannot save");
  }
});

test("admin package and featuring edits preserve a reservation appended after their read", async () => {
  for (const [operation, body] of [["setConsultantPackage", { packageTier: "grow" }], ["setConsultantFeatured", { featured: true }]]) {
    const { api, state } = records({ mutateExpert: state => { state.expert.bookedSlots.push("2099-01-01T10:00:00.000Z"); state.expert.reviewCount = 1; } });
    const result = await api[operation](request(body, "admin", { consultantId: "expert" }));
    assert.equal(result.statusCode, 200);
    assert.deepEqual(state.expert.bookedSlots, ["2099-01-01T10:00:00.000Z"]);
    assert.equal(state.expert.reviewCount, 1);
    assert.ok(state.writes.every(write => !("bookedSlots" in write.fields)));
  }
});

test("admin restriction updates preserve concurrent points and expert reservations", async () => {
  const { api, state } = records({ mutateUser: state => { state.user.points = 50; }, mutateExpert: state => { state.expert.bookedSlots.push("2099-01-01T10:00:00.000Z"); } });
  assert.equal((await api.setUserRestricted(request({ restricted: true }, "admin", { userId: "client" }))).statusCode, 200);
  assert.equal(state.user.points, 50);
  assert.equal(state.user.restricted, true);
  assert.equal(state.expert.restricted, true);
  assert.deepEqual(state.expert.bookedSlots, ["2099-01-01T10:00:00.000Z"]);
});

test("session duration cannot change with active reservations but remains editable without them", async () => {
  const { api, state } = records();
  state.user.role = "consultant";
  state.expert.sessionLengthMinutes = 60;
  state.expert.bookedSlots = ["2099-01-01T10:00:00.000Z"];
  assert.equal((await api.updateMyConsultant(request({ sessionLengthMinutes: 30 }))).statusCode, 400);
  assert.equal(state.writes.length, 0);
  assert.equal(state.expert.sessionLengthMinutes, 60);
  state.expert.bookedSlots = [];
  assert.equal((await api.updateMyConsultant(request({ sessionLengthMinutes: 30 }))).statusCode, 200);
  assert.equal(state.expert.sessionLengthMinutes, 30);
});
