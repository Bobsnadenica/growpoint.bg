import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const projectDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const envFiles = [".env", ".env.production", ".env.local"];
const args = new Set(process.argv.slice(2));
const liveMutate = args.has("--live-mutate");
const cloudfront = args.has("--cloudfront");

const state = {
  checks: [],
  runId: Math.random().toString(36).slice(2, 14),
  client: null,
  consultant: null,
  consultantId: "",
  bookingId: "",
  storageKeys: []
};

function stripEnvQuotes(value) {
  const trimmed = String(value || "").trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

async function readEnvFile(fileName) {
  try {
    const contents = await readFile(path.join(projectDir, fileName), "utf8");
    return contents.split(/\r?\n/).reduce((acc, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) return acc;
      const index = trimmed.indexOf("=");
      const key = trimmed.slice(0, index).trim();
      const value = stripEnvQuotes(trimmed.slice(index + 1));
      if (key) acc[key] = value;
      return acc;
    }, {});
  } catch {
    return {};
  }
}

async function loadEnv() {
  const loaded = {};
  for (const fileName of envFiles) {
    Object.assign(loaded, await readEnvFile(fileName));
  }
  return { ...loaded, ...process.env };
}

async function run(command, commandArgs, options = {}) {
  const { stdout, stderr } = await execFileAsync(command, commandArgs, {
    cwd: projectDir,
    maxBuffer: 1024 * 1024 * 16,
    ...options
  });
  if (options.showStderr && stderr?.trim()) process.stderr.write(stderr);
  return stdout.trim();
}

async function awsJson(commandArgs, { allowFail = false } = {}) {
  try {
    const stdout = await run("aws", [...commandArgs, "--output", "json"]);
    return stdout ? JSON.parse(stdout) : {};
  } catch (error) {
    if (allowFail) return null;
    throw error;
  }
}

async function terraformOutputs() {
  try {
    const stdout = await run("terraform", ["-chdir=infra/terraform", "output", "-json"]);
    return JSON.parse(stdout);
  } catch {
    return {};
  }
}

function outputValue(outputs, name, fallback = "") {
  return outputs[name]?.value ?? fallback;
}

async function loadConfig() {
  const env = await loadEnv();
  const outputs = await terraformOutputs();
  const cloudfrontDomain = outputValue(outputs, "frontend_cloudfront_domain_name", "");
  return {
    region: env.VITE_AWS_REGION || outputValue(outputs, "aws_region", "eu-west-1") || "eu-west-1",
    apiBaseUrl: String(outputValue(outputs, "api_base_url", env.VITE_API_BASE_URL || "")).replace(/\/+$/, ""),
    siteUrl: cloudfront && cloudfrontDomain
      ? `https://${cloudfrontDomain}`
      : String(env.GROWPOINT_SITE_URL || "https://www.growpoint.bg").replace(/\/+$/, ""),
    userPoolId: outputValue(outputs, "cognito_user_pool_id", env.VITE_COGNITO_USER_POOL_ID || ""),
    userPoolClientId: outputValue(outputs, "cognito_user_pool_client_id", env.VITE_COGNITO_USER_POOL_CLIENT_ID || ""),
    usersTable: outputValue(outputs, "users_table_name", "growpoint-dev-users"),
    consultantsTable: outputValue(outputs, "consultants_table_name", "growpoint-dev-consultants"),
    bookingsTable: outputValue(outputs, "bookings_table_name", "growpoint-dev-bookings"),
    cvBucket: outputValue(outputs, "cv_bucket_name", ""),
    adminEmail: env.GROWPOINT_ADMIN_EMAIL || "",
    adminPassword: env.GROWPOINT_ADMIN_PASSWORD || ""
  };
}

function decodeJwtPayload(token) {
  const payload = token.split(".")[1];
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}

async function httpJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  return { response, payload, text };
}

async function api(config, pathName, options = {}, token = "") {
  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && options.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const result = await httpJson(`${config.apiBaseUrl}${pathName}`, { ...options, headers });
  if (!result.response.ok) {
    throw new Error(
      `${options.method || "GET"} ${pathName} returned ${result.response.status}: ${result.text.slice(0, 300)}`
    );
  }
  return result.payload;
}

async function check(name, fn) {
  const startedAt = Date.now();
  try {
    const detail = await fn();
    state.checks.push({ name, ok: true, ms: Date.now() - startedAt, detail: detail || "" });
    console.log(`PASS ${name}${detail ? ` - ${detail}` : ""}`);
  } catch (error) {
    state.checks.push({
      name,
      ok: false,
      ms: Date.now() - startedAt,
      detail: error instanceof Error ? error.message : String(error)
    });
    console.error(`FAIL ${name} - ${error instanceof Error ? error.message : error}`);
  }
}

function requireConfig(config, keys) {
  for (const key of keys) {
    if (!config[key]) throw new Error(`Missing required config: ${key}`);
  }
}

async function publicChecks(config) {
  requireConfig(config, ["apiBaseUrl", "siteUrl"]);

  await check("API health", async () => {
    const payload = await api(config, "/health");
    if (!payload?.ok) throw new Error("Health payload did not include ok=true.");
    return payload.service || "ok";
  });

  let firstConsultantSlug = "";
  await check("Public consultants list", async () => {
    const payload = await api(config, "/consultants");
    const items = Array.isArray(payload) ? payload : payload.items || [];
    if (!items.length) throw new Error("No public consultants returned.");
    firstConsultantSlug = items[0].slug;
    return `${items.length} profiles`;
  });

  await check("Known Cyrillic consultant profile", async () => {
    const payload = await api(config, "/consultants/%D0%B4%D0%B8%D0%BC%D0%B8%D1%82%D1%8A%D1%80-%D0%BC%D0%B5%D0%BD%D1%82%D0%BE%D1%80%D1%81%D0%BA%D0%B8");
    if (!payload?.consultantId) throw new Error("Profile payload missing consultantId.");
    return payload.name || payload.slug;
  });

  const siteRoutes = [
    "/",
    "/users/",
    "/consultants/",
    firstConsultantSlug ? `/consultants/${encodeURIComponent(firstConsultantSlug)}/` : "/consultants/",
    "/auth/",
    "/sitemap.xml",
    "/robots.txt"
  ];

  for (const route of siteRoutes) {
    await check(`Site route ${route}`, async () => {
      const response = await fetch(`${config.siteUrl}${route}`, { redirect: "follow" });
      if (response.status !== 200) throw new Error(`Expected 200, got ${response.status}.`);
      return response.headers.get("content-type") || "200";
    });
  }

  if (cloudfront) {
    await check("CloudFront SPA fallback for new profile paths", async () => {
      const response = await fetch(`${config.siteUrl}/consultants/smoke-new-profile-${state.runId}/`);
      const text = await response.text();
      if (response.status !== 200) throw new Error(`Expected 200, got ${response.status}.`);
      if (!text.includes('id="root"')) throw new Error("Response did not look like the SPA shell.");
      return "unknown route returned SPA shell";
    });
  }

  const protectedPaths = ["/me/notifications", "/bookings", "/admin/consultants"];
  for (const pathName of protectedPaths) {
    await check(`Protected route rejects anonymous ${pathName}`, async () => {
      const response = await fetch(`${config.apiBaseUrl}${pathName}`);
      if (response.status !== 401) throw new Error(`Expected 401, got ${response.status}.`);
      return "401";
    });
  }

  await check("CORS preflight from production origin", async () => {
    const response = await fetch(`${config.apiBaseUrl}/bookings`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://www.growpoint.bg",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type"
      }
    });
    if (![200, 204].includes(response.status)) throw new Error(`Expected 200/204, got ${response.status}.`);
    return String(response.status);
  });
}

async function signUpUser(config, email, password, name) {
  const result = await awsJson([
    "cognito-idp",
    "sign-up",
    "--region",
    config.region,
    "--client-id",
    config.userPoolClientId,
    "--username",
    email,
    "--password",
    password,
    "--user-attributes",
    JSON.stringify([
      { Name: "email", Value: email },
      { Name: "name", Value: name }
    ])
  ]);

  await awsJson([
    "cognito-idp",
    "resend-confirmation-code",
    "--region",
    config.region,
    "--client-id",
    config.userPoolClientId,
    "--username",
    email
  ]);

  await awsJson([
    "cognito-idp",
    "admin-confirm-sign-up",
    "--region",
    config.region,
    "--user-pool-id",
    config.userPoolId,
    "--username",
    email
  ]);

  return result.UserSub;
}

async function login(config, email, password) {
  const result = await awsJson([
    "cognito-idp",
    "initiate-auth",
    "--region",
    config.region,
    "--client-id",
    config.userPoolClientId,
    "--auth-flow",
    "USER_PASSWORD_AUTH",
    "--auth-parameters",
    `USERNAME=${email},PASSWORD=${password}`
  ]);
  const token = result.AuthenticationResult?.IdToken;
  if (!token) throw new Error(`Login did not return an ID token for ${email}.`);
  return { token, claims: decodeJwtPayload(token) };
}

async function deleteDynamoItem(config, tableName, key) {
  await awsJson([
    "dynamodb",
    "delete-item",
    "--region",
    config.region,
    "--table-name",
    tableName,
    "--key",
    JSON.stringify(key)
  ], { allowFail: true });
}

async function deleteS3Object(config, storageKey) {
  if (!config.cvBucket || !storageKey) return;
  await awsJson([
    "s3api",
    "delete-object",
    "--region",
    config.region,
    "--bucket",
    config.cvBucket,
    "--key",
    storageKey
  ], { allowFail: true });
}

async function scanDynamo(config, tableName, filterExpression, values, projectionExpression) {
  const args = [
    "dynamodb",
    "scan",
    "--region",
    config.region,
    "--table-name",
    tableName,
    "--filter-expression",
    filterExpression,
    "--expression-attribute-values",
    JSON.stringify(values)
  ];
  if (projectionExpression) {
    args.push("--projection-expression", projectionExpression);
  }
  const result = await awsJson(args, { allowFail: true });
  return result?.Items || [];
}

async function cleanup(config) {
  const consultantSub = state.consultant?.sub;
  const clientSub = state.client?.sub;

  if (clientSub || state.consultantId) {
    const bookingItems = await scanDynamo(
      config,
      config.bookingsTable,
      "clientId = :clientId OR consultantId = :consultantId",
      {
        ":clientId": { S: clientSub || "" },
        ":consultantId": { S: state.consultantId || "" }
      },
      "bookingId"
    );
    for (const item of bookingItems) {
      if (item.bookingId?.S) {
        await deleteDynamoItem(config, config.bookingsTable, { bookingId: { S: item.bookingId.S } });
      }
    }
  }

  if (consultantSub) {
    const consultantItems = await scanDynamo(
      config,
      config.consultantsTable,
      "ownerUserId = :ownerUserId",
      { ":ownerUserId": { S: consultantSub } },
      "consultantId"
    );
    for (const item of consultantItems) {
      if (item.consultantId?.S) {
        await deleteDynamoItem(config, config.consultantsTable, { consultantId: { S: item.consultantId.S } });
      }
    }
  }

  if (clientSub) {
    await deleteDynamoItem(config, config.usersTable, { userId: { S: clientSub } });
  }
  if (consultantSub) {
    await deleteDynamoItem(config, config.usersTable, { userId: { S: consultantSub } });
  }

  for (const account of [state.client, state.consultant].filter(Boolean)) {
    await awsJson([
      "cognito-idp",
      "admin-delete-user",
      "--region",
      config.region,
      "--user-pool-id",
      config.userPoolId,
      "--username",
      account.email
    ], { allowFail: true });
  }

  for (const storageKey of state.storageKeys) {
    await deleteS3Object(config, storageKey);
  }
}

function futureIso(daysFromNow, hourOffset = 0) {
  return new Date(
    Date.now() + daysFromNow * 24 * 60 * 60 * 1000 + hourOffset * 60 * 60 * 1000
  ).toISOString();
}

function tinyPngBytes() {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
    "base64"
  );
}

async function uploadViaSignedUrl({ uploadUrl, bytes, contentType }) {
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: bytes
  });
  if (!response.ok) {
    throw new Error(`S3 upload returned ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
}

async function expectApiError(config, pathName, options, token, expectedStatus) {
  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && options.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const result = await httpJson(`${config.apiBaseUrl}${pathName}`, { ...options, headers });
  if (result.response.status !== expectedStatus) {
    throw new Error(
      `Expected ${expectedStatus} from ${options.method || "GET"} ${pathName}, got ${result.response.status}: ${result.text.slice(0, 300)}`
    );
  }
  return result.payload;
}

async function liveMutationChecks(config) {
  requireConfig(config, [
    "apiBaseUrl",
    "region",
    "userPoolId",
    "userPoolClientId",
    "usersTable",
    "consultantsTable",
    "bookingsTable"
  ]);

  const password = `Aa1GrowPoint${state.runId}`;
  const clientEmail = `codex-${state.runId}-client@growpoint.bg`;
  const consultantEmail = `codex-${state.runId}-consultant@growpoint.bg`;
  const clientName = `Codex QA Client ${state.runId}`;
  const consultantName = `Codex QA Mentor ${state.runId}`;
  const slug = `codex-qa-${state.runId}`;
  const futureSlot = futureIso(14, 0);
  const declineSlot = futureIso(15, 0);
  const cancelSlot = futureIso(16, 0);
  const rescheduleOriginalSlot = futureIso(17, 0);
  const rescheduleTargetSlot = futureIso(18, 0);
  const availability = [
    futureSlot,
    declineSlot,
    cancelSlot,
    rescheduleOriginalSlot,
    rescheduleTargetSlot
  ];
  const consultantProfileInput = {
    slug,
    name: consultantName,
    headline: "Career mentor for production smoke testing",
    bio: "This disposable production smoke profile verifies that GrowPoint consultant profile updates, public visibility, and bookings work end to end without affecting real users.",
    experienceSummary: "Eight years of career coaching, interview preparation, and structured mentoring for professionals changing roles.",
    experienceHighlights: ["Career transitions", "Interview preparation"],
    educationHighlights: ["Certified coaching practice"],
    city: "Sofia",
    experienceYears: 8,
    priceEur: 100,
    profileType: "mentor",
    languages: ["Bulgarian", "English"],
    specializations: ["Career change", "CV and LinkedIn"],
    sessionModes: ["Online"],
    tags: ["smoke-test"],
    idealFor: ["Professionals preparing for interviews"],
    consultationTopics: ["CV review", "Interview strategy"],
    workApproach: "Structured discovery, practical next steps, and follow-up actions after each session.",
    sessionLengthMinutes: 60,
    availability
  };

  await check("Live signup + resend confirmation + admin confirm", async () => {
    const clientSub = await signUpUser(config, clientEmail, password, clientName);
    const consultantSub = await signUpUser(config, consultantEmail, password, consultantName);
    state.client = { email: clientEmail, sub: clientSub };
    state.consultant = { email: consultantEmail, sub: consultantSub };
    return "2 disposable users";
  });

  let clientToken = "";
  let consultantToken = "";

  await check("Live login for disposable users", async () => {
    const clientLogin = await login(config, clientEmail, password);
    const consultantLogin = await login(config, consultantEmail, password);
    state.client.sub = clientLogin.claims.sub;
    state.consultant.sub = consultantLogin.claims.sub;
    clientToken = clientLogin.token;
    consultantToken = consultantLogin.token;
    return "client + consultant tokens";
  });

  await check("Live bootstrap client and consultant", async () => {
    await api(config, "/auth/bootstrap", {
      method: "POST",
      body: JSON.stringify({
        email: clientEmail,
        name: clientName,
        role: "client",
        plan: "free"
      })
    }, clientToken);
    await api(config, "/auth/bootstrap", {
      method: "POST",
      body: JSON.stringify({
        email: consultantEmail,
        name: consultantName,
        role: "consultant",
        plan: "free"
      })
    }, consultantToken);
    return "profiles created";
  });

  await check("Live consultant profile save and public route", async () => {
    const consultant = await api(config, "/consultants/me", {
      method: "PUT",
      body: JSON.stringify(consultantProfileInput)
    }, consultantToken);
    state.consultantId = consultant.consultantId;
    const publicProfile = await api(config, `/consultants/${encodeURIComponent(slug)}`);
    if (publicProfile.consultantId !== consultant.consultantId) {
      throw new Error("Public route did not return the saved consultant.");
    }
    return consultant.profileStatus || "saved";
  });

  await check("Live consultant avatar and cover upload", async () => {
    const imageBytes = tinyPngBytes();
    const [avatarUpload, heroUpload] = await Promise.all([
      api(config, "/me/cv/upload-url", {
        method: "POST",
        body: JSON.stringify({
          fileName: `avatar-${state.runId}.png`,
          contentType: "image/png",
          fileSize: imageBytes.length,
          kind: "avatar"
        })
      }, consultantToken),
      api(config, "/me/cv/upload-url", {
        method: "POST",
        body: JSON.stringify({
          fileName: `hero-${state.runId}.png`,
          contentType: "image/png",
          fileSize: imageBytes.length,
          kind: "hero"
        })
      }, consultantToken)
    ]);

    state.storageKeys.push(avatarUpload.storageKey, heroUpload.storageKey);
    await Promise.all([
      uploadViaSignedUrl({
        uploadUrl: avatarUpload.uploadUrl,
        bytes: imageBytes,
        contentType: "image/png"
      }),
      uploadViaSignedUrl({
        uploadUrl: heroUpload.uploadUrl,
        bytes: imageBytes,
        contentType: "image/png"
      })
    ]);

    const updated = await api(config, "/consultants/me", {
      method: "PUT",
      body: JSON.stringify({
        ...consultantProfileInput,
        avatarStorageKey: avatarUpload.storageKey,
        heroStorageKey: heroUpload.storageKey
      })
    }, consultantToken);
    const publicProfile = await api(config, `/consultants/${encodeURIComponent(slug)}`);
    if (updated.avatarStorageKey !== avatarUpload.storageKey) {
      throw new Error("Avatar storage key was not saved.");
    }
    if (updated.heroStorageKey !== heroUpload.storageKey) {
      throw new Error("Hero storage key was not saved.");
    }
    if (!String(publicProfile.avatarUrl || "").startsWith("https://")) {
      throw new Error("Public avatar URL was not signed.");
    }
    if (!String(publicProfile.heroUrl || "").startsWith("https://")) {
      throw new Error("Public hero URL was not signed.");
    }
    return "avatar + hero signed";
  });

  await check("Live booking create and accept", async () => {
    const booking = await api(config, "/bookings", {
      method: "POST",
      body: JSON.stringify({
        consultantId: state.consultantId,
        scheduledAt: futureSlot,
        note: "Production smoke booking"
      })
    }, clientToken);
    state.bookingId = booking.bookingId;
    const accepted = await api(config, `/bookings/${encodeURIComponent(state.bookingId)}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: "confirmed" })
    }, consultantToken);
    if (accepted.status !== "confirmed") throw new Error("Booking did not become confirmed.");
    return state.bookingId;
  });

  await check("Live booking decline, cancel, and reschedule", async () => {
    const declinedBooking = await api(config, "/bookings", {
      method: "POST",
      body: JSON.stringify({
        consultantId: state.consultantId,
        scheduledAt: declineSlot,
        note: "Production smoke decline booking"
      })
    }, clientToken);
    const declined = await api(config, `/bookings/${encodeURIComponent(declinedBooking.bookingId)}/status`, {
      method: "PATCH",
      body: JSON.stringify({
        status: "declined",
        reason: "Production smoke decline"
      })
    }, consultantToken);
    if (declined.status !== "declined") throw new Error("Decline flow did not return declined status.");

    const cancelBooking = await api(config, "/bookings", {
      method: "POST",
      body: JSON.stringify({
        consultantId: state.consultantId,
        scheduledAt: cancelSlot,
        note: "Production smoke cancel booking"
      })
    }, clientToken);
    await api(config, `/bookings/${encodeURIComponent(cancelBooking.bookingId)}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: "confirmed" })
    }, consultantToken);
    const cancelled = await api(config, `/bookings/${encodeURIComponent(cancelBooking.bookingId)}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: "cancelled" })
    }, clientToken);
    if (cancelled.status !== "cancelled") throw new Error("Cancel flow did not return cancelled status.");

    const rescheduleBooking = await api(config, "/bookings", {
      method: "POST",
      body: JSON.stringify({
        consultantId: state.consultantId,
        scheduledAt: rescheduleOriginalSlot,
        note: "Production smoke reschedule booking"
      })
    }, clientToken);
    await api(config, `/bookings/${encodeURIComponent(rescheduleBooking.bookingId)}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: "confirmed" })
    }, consultantToken);
    const rescheduled = await api(config, `/bookings/${encodeURIComponent(rescheduleBooking.bookingId)}/reschedule`, {
      method: "PATCH",
      body: JSON.stringify({ scheduledAt: rescheduleTargetSlot })
    }, clientToken);
    if (rescheduled.status !== "pending") {
      throw new Error("Client reschedule of confirmed booking should return to pending.");
    }
    if (rescheduled.rescheduledBy !== "client") {
      throw new Error("Reschedule actor was not recorded as client.");
    }
    const reaccepted = await api(config, `/bookings/${encodeURIComponent(rescheduleBooking.bookingId)}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: "confirmed" })
    }, consultantToken);
    if (reaccepted.status !== "confirmed") throw new Error("Re-accept after reschedule failed.");

    return "declined + cancelled + rescheduled";
  });

  await check("Live booking messages both directions", async () => {
    await api(config, `/bookings/${encodeURIComponent(state.bookingId)}/messages`, {
      method: "POST",
      body: JSON.stringify({ body: "Client smoke message" })
    }, clientToken);
    await api(config, `/bookings/${encodeURIComponent(state.bookingId)}/messages`, {
      method: "POST",
      body: JSON.stringify({ body: "Consultant smoke reply" })
    }, consultantToken);
    const messages = await api(config, `/bookings/${encodeURIComponent(state.bookingId)}/messages`, {}, clientToken);
    if ((messages.items || []).length < 2) throw new Error("Expected at least two messages.");
    return `${messages.items.length} messages`;
  });

  await check("Live ICS download", async () => {
    const result = await httpJson(`${config.apiBaseUrl}/bookings/${encodeURIComponent(state.bookingId)}/ics`, {
      headers: { Authorization: `Bearer ${clientToken}` }
    });
    if (!result.response.ok) throw new Error(`ICS returned ${result.response.status}.`);
    if (!result.text.includes("BEGIN:VCALENDAR")) throw new Error("ICS did not include VCALENDAR.");
    return "VCALENDAR";
  });

  await check("Live document upload, sharing, and privacy", async () => {
    const documentBody = `GrowPoint production smoke document ${state.runId}`;
    const upload = await api(config, "/me/cv/upload-url", {
      method: "POST",
      body: JSON.stringify({
        fileName: `growpoint-smoke-${state.runId}.txt`,
        contentType: "text/plain",
        fileSize: Buffer.byteLength(documentBody),
        kind: "document"
      })
    }, clientToken);
    state.storageKeys.push(upload.storageKey);
    await uploadViaSignedUrl({
      uploadUrl: upload.uploadUrl,
      bytes: Buffer.from(documentBody),
      contentType: "text/plain"
    });

    const consultantsPayload = await api(config, "/consultants");
    const publicConsultants = Array.isArray(consultantsPayload)
      ? consultantsPayload
      : consultantsPayload.items || [];
    const unrelated = publicConsultants.find((item) => item.consultantId !== state.consultantId);
    if (!unrelated?.consultantId) {
      throw new Error("Could not find an unrelated consultant for privacy rejection test.");
    }

    await expectApiError(config, "/me/profile", {
      method: "PUT",
      body: JSON.stringify({
        documents: [{
          ...upload.document,
          category: "portfolio",
          sharedWithConsultantIds: [unrelated.consultantId]
        }]
      })
    }, clientToken, 403);

    const savedProfile = await api(config, "/me/profile", {
      method: "PUT",
      body: JSON.stringify({
        documents: [{
          ...upload.document,
          category: "portfolio",
          sharedWithConsultantIds: [state.consultantId]
        }]
      })
    }, clientToken);
    const savedDocument = (savedProfile.documents || []).find(
      (item) => item.storageKey === upload.storageKey
    );
    if (!savedDocument) throw new Error("Uploaded document was not saved to the client profile.");
    if (!savedDocument.sharedWithConsultantIds?.includes(state.consultantId)) {
      throw new Error("Document was not shared with the confirmed consultant.");
    }

    const clientDownload = await api(config, "/me/documents/download-url", {
      method: "POST",
      body: JSON.stringify({ storageKey: upload.storageKey })
    }, clientToken);
    const clientDownloadResponse = await fetch(clientDownload.downloadUrl);
    const clientDownloadText = await clientDownloadResponse.text();
    if (clientDownloadText !== documentBody) {
      throw new Error("Client document download did not return the uploaded contents.");
    }

    const consultantBookings = await api(config, "/bookings", {}, consultantToken);
    const mainBooking = consultantBookings.find((item) => item.bookingId === state.bookingId);
    const sharedDocument = mainBooking?.clientSharedDocuments?.find(
      (item) => item.storageKey === upload.storageKey
    );
    if (!sharedDocument?.downloadUrl) {
      throw new Error("Consultant booking did not include the shared document download URL.");
    }
    const consultantDownloadResponse = await fetch(sharedDocument.downloadUrl);
    const consultantDownloadText = await consultantDownloadResponse.text();
    if (consultantDownloadText !== documentBody) {
      throw new Error("Consultant shared-document download did not return uploaded contents.");
    }

    return "upload + owner download + shared consultant download + unrelated rejection";
  });

  await check("Live past-session confirmation and review", async () => {
    const pastSlot = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    await awsJson([
      "dynamodb",
      "update-item",
      "--region",
      config.region,
      "--table-name",
      config.bookingsTable,
      "--key",
      JSON.stringify({ bookingId: { S: state.bookingId } }),
      "--update-expression",
      "SET scheduledAt = :past, sessionLengthMinutes = :length",
      "--expression-attribute-values",
      JSON.stringify({
        ":past": { S: pastSlot },
        ":length": { N: "60" }
      })
    ]);
    await api(config, `/bookings/${encodeURIComponent(state.bookingId)}/session-confirm`, { method: "POST" }, clientToken);
    await api(config, `/bookings/${encodeURIComponent(state.bookingId)}/session-confirm`, { method: "POST" }, consultantToken);
    const review = await api(config, `/bookings/${encodeURIComponent(state.bookingId)}/review`, {
      method: "POST",
      body: JSON.stringify({ rating: 5, comment: "Production smoke review" })
    }, clientToken);
    if (review.consultant?.reviewCount < 1) throw new Error("Review count did not update.");
    return `rating ${review.consultant.rating}`;
  });

  await check("Live notifications list and mark-read", async () => {
    const before = await api(config, "/me/notifications", {}, consultantToken);
    await api(config, "/me/notifications/mark-read", { method: "POST" }, consultantToken);
    const after = await api(config, "/me/notifications", {}, consultantToken);
    if (after.unreadCount !== 0) throw new Error("Notifications did not mark read.");
    return `${before.unreadCount || 0} unread before`;
  });

  if (config.adminEmail && config.adminPassword) {
    const adminLogin = await login(config, config.adminEmail, config.adminPassword);

    await check("Optional admin auth and message", async () => {
      const list = await api(config, "/admin/consultants", {}, adminLogin.token);
      const items = Array.isArray(list) ? list : list.items || [];
      await api(config, `/admin/users/${encodeURIComponent(state.client.sub)}/message`, {
        method: "POST",
        body: JSON.stringify({
          subject: "Production smoke admin message",
          message: "Disposable smoke notification"
        })
      }, adminLogin.token);
      return `${items.length} admin profiles visible`;
    });

    // Exercise the admin moderation lifecycle against the DISPOSABLE consultant
    // only (never a real profile). Cleanup at the end removes the row.
    await check("Admin consultant lifecycle (preview/reject/approve/feature)", async () => {
      if (!state.consultantId) throw new Error("No disposable consultant to manage.");
      const id = encodeURIComponent(state.consultantId);

      await api(config, `/admin/consultants/${id}`, {}, adminLogin.token);

      const rejected = await api(config, `/admin/consultants/${id}/status`, {
        method: "PUT",
        body: JSON.stringify({ status: "rejected" })
      }, adminLogin.token);
      if (rejected.profileStatus !== "rejected" || rejected.isPublic !== false) {
        throw new Error("Reject did not unpublish the profile.");
      }

      const approved = await api(config, `/admin/consultants/${id}/status`, {
        method: "PUT",
        body: JSON.stringify({ status: "approved" })
      }, adminLogin.token);
      if (approved.profileStatus !== "approved" || approved.isPublic !== true) {
        throw new Error("Approve did not publish the profile.");
      }

      const featured = await api(config, `/admin/consultants/${id}/featured`, {
        method: "PUT",
        body: JSON.stringify({ featured: true })
      }, adminLogin.token);
      if (featured.featured !== true) throw new Error("Featuring failed.");

      // Leave it un-featured before cleanup.
      await api(config, `/admin/consultants/${id}/featured`, {
        method: "PUT",
        body: JSON.stringify({ featured: false })
      }, adminLogin.token);

      return "preview + reject + approve + feature on/off";
    });
  } else {
    console.log("SKIP Optional admin auth and message - set GROWPOINT_ADMIN_EMAIL and GROWPOINT_ADMIN_PASSWORD");
  }
}

function printSummary() {
  const failed = state.checks.filter((item) => !item.ok);
  console.log("\nProduction smoke summary");
  console.log(`Run id: ${state.runId}`);
  console.log(`Checks: ${state.checks.length - failed.length}/${state.checks.length} passed`);
  if (failed.length) {
    console.log("Failures:");
    for (const item of failed) {
      console.log(`- ${item.name}: ${item.detail}`);
    }
  }
  return failed.length;
}

async function main() {
  const config = await loadConfig();
  console.log(`Production smoke target: ${config.siteUrl}`);
  console.log(`API target: ${config.apiBaseUrl}`);

  try {
    await publicChecks(config);
    if (liveMutate) {
      await liveMutationChecks(config);
    } else {
      console.log("SKIP Live mutation lifecycle - rerun with --live-mutate");
    }
  } finally {
    if (liveMutate) {
      await check("Disposable production data cleanup", async () => {
        await cleanup(config);
        return "cleanup attempted";
      });
    }
  }

  const failures = printSummary();
  if (failures > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
