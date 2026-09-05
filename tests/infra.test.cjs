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
