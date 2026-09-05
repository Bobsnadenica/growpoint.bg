const { AdminGetUserCommand, AdminListGroupsForUserCommand, ListUsersCommand } = require("@aws-sdk/client-cognito-identity-provider");

function createIdentityChecks({ cognito, userPoolId, now = Date.now }) {
  const publicCache = new Map();
  const unavailable = (statusCode = 401) => Object.assign(new Error("Акаунтът вече не е активен. Влез отново или се свържи с нас."), { statusCode, code: "ACCOUNT_UNAVAILABLE" });

  // Used only for a caller who is already using the app, never to inventory
  // inactive accounts (AdminGetUser counts toward Cognito MAUs).
  async function assertCallerActive(claims, { admin = false } = {}) {
    if (!userPoolId) throw Object.assign(new Error("Identity verification unavailable"), { statusCode: 503 });
    const Username = claims["cognito:username"] || claims.username || claims.sub;
    let user;
    try { user = await cognito.send(new AdminGetUserCommand({ UserPoolId: userPoolId, Username })); }
    catch (error) { if (error.name === "UserNotFoundException") throw unavailable(); throw error; }
    const sub = user.UserAttributes?.find((a) => a.Name === "sub")?.Value;
    if (user.Enabled !== true || sub !== claims.sub) throw unavailable();
    if (admin) {
      const groups = await cognito.send(new AdminListGroupsForUserCommand({ UserPoolId: userPoolId, Username }));
      if (!groups.Groups?.some((g) => g.GroupName === "admin")) throw Object.assign(new Error("Admin access required."), { statusCode: 403 });
    }
  }

  // Public browsing must not make inactive experts billable monthly users.
  // ListUsers is eventually consistent; recheck on demand after 60 seconds.
  async function publicAccountState(userId) {
    if (!userPoolId) throw Object.assign(new Error("Identity verification unavailable"), { statusCode: 503 });
    if (!/^[a-f0-9-]{36}$/i.test(String(userId || ""))) return { exists: false, enabled: false };
    const cached = publicCache.get(userId);
    if (cached && cached.until > now()) return cached.state;
    let PaginationToken; let found;
    do {
      const result = await cognito.send(new ListUsersCommand({ UserPoolId: userPoolId, Filter: `sub = "${userId}"`, Limit: 60, AttributesToGet: ["sub"], PaginationToken }));
      found = result.Users?.find((u) => u.Attributes?.some((a) => a.Name === "sub" && a.Value === userId));
      PaginationToken = result.PaginationToken;
    } while (!found && PaginationToken);
    const state = { exists: Boolean(found), enabled: found?.Enabled === true };
    if (publicCache.size >= 2000) publicCache.delete(publicCache.keys().next().value);
    publicCache.set(userId, { state, until: now() + 60000 });
    return state;
  }
  return { assertCallerActive, publicAccountState };
}
module.exports = { createIdentityChecks };
