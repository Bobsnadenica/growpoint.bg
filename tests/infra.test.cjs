const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

test("CloudTrail management selector uses trail-supported filters, with Cognito filtering in EventBridge", () => {
  const source = readFileSync(join(__dirname, "../infra/terraform/identity-sync.tf"), "utf8");
  const trail = source.split('resource "aws_cloudtrail" "identity_lifecycle"')[1].split('resource "aws_cloudwatch_event_rule"')[0];
  assert.match(trail, /field\s*=\s*"readOnly"\s+equals\s*=\s*\["false"\]/);
  assert.doesNotMatch(trail, /field\s*=\s*"eventName"/);
  assert.doesNotMatch(trail, /equals\s*=\s*\["cognito-idp.amazonaws.com"\]/);
  assert.match(source, /eventName\s*=\s*\["AdminDeleteUser", "DeleteUser", "AdminDisableUser", "AdminEnableUser"\]/);
});

test("Production identities and tables are protected, and existing API logs have bounded retention", () => {
  const source = readFileSync(join(__dirname, "../infra/terraform/main.tf"), "utf8");
  for (const [type, name] of [["aws_cognito_user_pool", "main"], ["aws_dynamodb_table", "users"], ["aws_dynamodb_table", "consultants"], ["aws_dynamodb_table", "bookings"]]) {
    const resource = source.split(`resource "${type}" "${name}"`)[1].split(/\nresource |\ndata /)[0];
    assert.match(resource, /prevent_destroy\s*=\s*true/, `${type}.${name} must not be destroyed`);
    if (type === "aws_cognito_user_pool") assert.match(resource, /deletion_protection\s*=\s*"ACTIVE"/);
  }
  assert.match(source, /import\s*\{\s*to\s*=\s*aws_cloudwatch_log_group\.api\s+id\s*=\s*"\/aws\/lambda\/growpoint-dev-api"/);
  const logs = source.split('resource "aws_cloudwatch_log_group" "api"')[1].split('resource "aws_lambda_function"')[0];
  assert.match(logs, /retention_in_days\s*=\s*30/);
});
