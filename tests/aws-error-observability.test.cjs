const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApi } = require("./helpers/api-harness.cjs");

test("AWS denial diagnostics expose only a known exact IAM service/action token", () => {
  const { deniedAwsAction } = loadApi().test;
  for (const action of ["dynamodb:ConditionCheckItem", "dynamodb:TransactWriteItems", "s3:GetObject", "cognito-idp:AdminGetUser", "ses:SendEmail"]) {
    assert.equal(deniedAwsAction({ name: "AccessDeniedException", message: `User: arn:aws:iam::000000000000:role/private-role is not authorized to perform: ${action} on resource: arn:aws:private-resource email private@example.invalid` }), action);
  }
  for (const error of [
    { name: "Error", message: "not authorized to perform: dynamodb:GetItem" },
    { name: "AccessDeniedException", message: '{"bankResponse":"private-card-fixture","customer":"private@example.invalid"}' },
    { name: "AccessDeniedException", message: "not authorized to perform: private-service:PrivateCustomerName on resource private" },
    { name: "AccessDeniedException", message: "not authorized to perform: dynamodb:PrivateCustomerName on resource private" },
    { name: "AccessDeniedException", message: "not authorized to perform: dynamodb:GetItemPrivateSuffix on resource private" },
    { name: "AccessDeniedException", message: "not authorized to perform: dynamodb:GetItem@private.example.invalid" },
    { name: "AccessDeniedException", message: "not authorized to perform: dynamodb:getitem" },
    { name: "AccessDeniedException", message: "not authorized to perform: " + "x".repeat(10000) },
    { name: "AccessDeniedException", message: "x".repeat(2048) + "not authorized to perform: dynamodb:GetItem" },
    { name: "AccessDeniedException", message: { secret: "private" } }, null
  ]) assert.equal(deniedAwsAction(error), undefined);
});

test("HTTP handler logs the denied action without raw error, private principal, resource or bank fields", async () => {
  const privateValues = ["private-principal-fixture", "private-resource-fixture", "private@example.invalid", "private-bank-response"];
  const message = `${privateValues[0]} is not authorized to perform: dynamodb:ConditionCheckItem on resource: ${privateValues.slice(1).join(" ")}`;
  const logs = [];
  const api = loadApi({ environment: { USER_POOL_ID: "unit-pool" }, logError: (...args) => logs.push(args), send: async command => {
    if (command.constructor.name === "AdminGetUserCommand") return { Enabled: true, UserAttributes: [{ Name: "sub", Value: "fixture-user" }] };
    if (command.constructor.name === "GetCommand") throw Object.assign(new Error(message), { name: "AccessDeniedException" });
    return {};
  } });
  const result = await api.handler({ rawPath: "/me/profile", requestContext: { requestId: "fixture-request", http: { method: "GET" }, authorizer: { jwt: { claims: { sub: "fixture-user" } } } } });
  assert.equal(result.statusCode, 500);
  assert.equal(JSON.parse(result.body).message, "Unexpected server error.");
  const diagnostic = logs.find(args => args[0] === "[api] request failed")[1];
  assert.equal(diagnostic.error, "AccessDeniedException");
  assert.equal(diagnostic.errorAction, "dynamodb:ConditionCheckItem");
  assert.deepEqual(Object.keys(diagnostic).sort(), ["error", "errorAction", "requestId"]);
  for (const value of privateValues) assert.ok(!JSON.stringify({ logs, result }).includes(value));
});
