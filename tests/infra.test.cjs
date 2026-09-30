const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { runInNewContext } = require("node:vm");

function cloudFrontHandler() {
  const source = readFileSync(join(__dirname, "../infra/terraform/main.tf"), "utf8");
  const code = source.match(/resource "aws_cloudfront_function" "frontend_rewrite"[\s\S]*?code\s*=\s*<<-EOT\n([\s\S]*?)\n\s*EOT/)[1];
  const context = {};
  runInNewContext(code, context);
  return context.handler;
}

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
    else assert.match(resource, /deletion_protection_enabled\s*=\s*true/, `${name} must also reject deletion outside Terraform`);
  }
  assert.match(source, /import\s*\{\s*to\s*=\s*aws_cloudwatch_log_group\.api\s+id\s*=\s*"\/aws\/lambda\/growpoint-dev-api"/);
  const logs = source.split('resource "aws_cloudwatch_log_group" "api"')[1].split('resource "aws_lambda_function"')[0];
  assert.match(logs, /retention_in_days\s*=\s*30/);
});

test("Private CV and frontend buckets reject non-HTTPS clients without denying AWS service calls", () => {
  const source = readFileSync(join(__dirname, "../infra/terraform/main.tf"), "utf8");
  for (const [name, bucket] of [["cv_documents_bucket", "cv_documents"], ["frontend_bucket", "frontend[0]"]]) {
    const policy = source.split(`data "aws_iam_policy_document" "${name}"`)[1].split(/\nresource |\ndata /)[0];
    const deny = policy.split('sid     = "DenyInsecureTransport"')[1].split('sid     = "AllowCloudFrontRead"')[0];
    assert.match(deny, /effect\s*=\s*"Deny"/);
    assert.match(deny, /actions\s*=\s*\["s3:\*"\]/);
    assert.ok(deny.includes(`aws_s3_bucket.${bucket}.arn,`), "Deny must cover bucket operations");
    assert.ok(deny.includes(`"\${aws_s3_bucket.${bucket}.arn}/*"`), "Deny must cover object operations");
    assert.match(deny, /principals\s*\{\s*type\s*=\s*"\*"\s+identifiers\s*=\s*\["\*"\]/);
    for (const key of ["aws:SecureTransport", "aws:PrincipalIsAWSService"]) {
      assert.ok(deny.match(new RegExp(`test\\s*=\\s*"Bool"\\s+variable\\s*=\\s*"${key}"\\s+values\\s*=\\s*\\["false"\\]`)), `${key} must only match false`);
    }
  }
  assert.match(source, /resource "aws_s3_bucket_policy" "cv_documents"\s*\{\s*bucket\s*=\s*aws_s3_bucket\.cv_documents\.id\s+policy\s*=\s*data\.aws_iam_policy_document\.cv_documents_bucket\.json/);
  const frontend = source.split('data "aws_iam_policy_document" "frontend_bucket"')[1].split('resource "aws_s3_bucket_policy" "frontend"')[0];
  assert.match(frontend, /identifiers\s*=\s*\["cloudfront.amazonaws.com"\]/);
  assert.match(frontend, /variable\s*=\s*"AWS:SourceArn"\s+values\s*=\s*\[aws_cloudfront_distribution\.frontend\[0\]\.arn\]/);
});

test("Lambda SES sending is identity- and sender-scoped, while account readiness remains read-only", () => {
  const source = readFileSync(join(__dirname, "../infra/terraform/main.tf"), "utf8");
  const policy = source.split('resource "aws_iam_role_policy" "lambda"')[1].split('data "archive_file" "api"')[0];
  const sending = policy.split('Action   = ["ses:SendEmail"]')[1].split('Action   = ["ses:GetAccount"]')[0];
  assert.match(sending, /Resource\s*=\s*var\.ses_domain_identity != "" \? aws_ses_domain_identity\.platform\[0\]\.arn : "arn:aws:ses:/);
  assert.doesNotMatch(sending, /Resource\s*=\s*"\*"/);
  assert.match(sending, /StringEquals\s*=\s*\{\s*"ses:FromAddress"\s*=\s*var\.ses_from_email/);
  const account = policy.split('Action   = ["ses:GetAccount"]')[1].split("      },")[0];
  assert.match(account, /Resource\s*=\s*"\*"/);
  assert.doesNotMatch(policy, /ses:SendRawEmail|ses:\*/);
});

test("CloudFront custom domains wait for managed certificate validation without blocking its initial request", () => {
  const source = readFileSync(join(__dirname, "../infra/terraform/main.tf"), "utf8");
  assert.match(source, /frontend_use_managed_certificate\s*=.*length\(var.frontend_domain_aliases\) > 0/);
  assert.match(source, /frontend_certificate_arn\s*=.*aws_acm_certificate_validation\.frontend\[0\]\.certificate_arn/);
  const validation = source.split('resource "aws_acm_certificate_validation" "frontend"')[1].split('resource "aws_dynamodb_table"')[0];
  assert.match(validation, /count\s*=\s*local\.frontend_use_managed_certificate \? 1 : 0/);
  assert.match(validation, /provider\s*=\s*aws\.us_east_1/);
  assert.match(validation, /certificate_arn\s*=\s*aws_acm_certificate\.frontend\[0\]\.arn/);
  const viewerCertificate = source.split("viewer_certificate {")[1].split("\n  }")[0];
  assert.match(viewerCertificate, /acm_certificate_arn\s*=\s*local\.frontend_certificate_arn/);
  assert.match(viewerCertificate, /TLSv1\.2_2021/);
});

test("Both CloudFront behaviors run canonical redirects, including encoded asset requests", () => {
  const source = readFileSync(join(__dirname, "../infra/terraform/main.tf"), "utf8");
  const distribution = source.split('resource "aws_cloudfront_distribution" "frontend"')[1].split('data "aws_iam_policy_document" "frontend_bucket"')[0];
  const behaviors = [distribution.split("default_cache_behavior {")[1].split("ordered_cache_behavior {")[0], distribution.split("ordered_cache_behavior {")[1].split("custom_error_response {")[0]];
  for (const behavior of behaviors) {
    assert.match(behavior, /function_association\s*\{\s*event_type\s*=\s*"viewer-request"\s+function_arn\s*=\s*aws_cloudfront_function\.frontend_rewrite\[0\]\.arn/);
  }
  const response = cloudFrontHandler()({ request: { uri: "/assets/portrait%20one.webp", headers: { host: { value: "growpoint.bg" } }, querystring: { v: { value: "qa%2B1%3D" } } } });
  assert.equal(response.statusCode, 301);
  assert.equal(response.headers.location.value, "https://www.growpoint.bg/assets/portrait%20one.webp?v=qa%2B1%3D");
});

test("Actual CloudFront apex redirect preserves encoded referral, invite, OAuth and duplicate query values", () => {
  const handler = cloudFrontHandler();
  const querystring = {
    ref: { value: "mentor%2F%D0%BF%D1%80%D0%B8%D0%BC%D0%B5%D1%80" },
    invite: { value: "qa%2Binvite%3D100%25" },
    state: { value: "https%3A%2F%2Fwww.growpoint.bg%2Fauth%3Fa%3Db%26c%3Dd" },
    code: { value: "qa%2Fcode%2Btoken%3D" },
    "tag%5B%5D": { value: "A%26B", multiValue: [{ value: "A%26B" }, { value: "C+D" }, { value: "" }] },
    empty: { value: "" }
  };
  const response = handler({ request: { uri: "/auth/%D0%BF%D1%80%D0%BE%D1%84%D0%B8%D0%BB", headers: { host: { value: "growpoint.bg" } }, querystring } });
  assert.equal(response.statusCode, 301);
  assert.equal(response.headers["cache-control"].value, "no-store");
  assert.equal(response.headers.location.value, "https://www.growpoint.bg/auth/%D0%BF%D1%80%D0%BE%D1%84%D0%B8%D0%BB?ref=mentor%2F%D0%BF%D1%80%D0%B8%D0%BC%D0%B5%D1%80&invite=qa%2Binvite%3D100%25&state=https%3A%2F%2Fwww.growpoint.bg%2Fauth%3Fa%3Db%26c%3Dd&code=qa%2Fcode%2Btoken%3D&tag%5B%5D=A%26B&tag%5B%5D=C+D&tag%5B%5D=&empty=");
  const params = new URL(response.headers.location.value).searchParams;
  assert.equal(params.get("invite"), "qa+invite=100%");
  assert.equal(params.get("state"), "https://www.growpoint.bg/auth?a=b&c=d");
  assert.deepEqual(params.getAll("tag[]"), ["A&B", "C D", ""]);
  assert.equal(handler({ request: { uri: "/", headers: { host: { value: "GROWPOINT.BG:443" } }, querystring: {} } }).headers.location.value, "https://www.growpoint.bg/");
});

test("Actual CloudFront www and preview requests keep their directory rewrite and query untouched", () => {
  const handler = cloudFrontHandler();
  for (const host of ["www.growpoint.bg", "d30m6jtjij7col.cloudfront.net"]) {
    for (const [uri, expected] of [["/", "/index.html"], ["/auth", "/auth/index.html"], ["/legal/terms/", "/legal/terms/index.html"], ["/assets/main.js", "/assets/main.js"]]) {
      const querystring = { code: { value: "qa%2Btoken%3D" } };
      const request = { uri, headers: { host: { value: host } }, querystring };
      const result = handler({ request });
      assert.equal(result, request);
      assert.equal(result.uri, expected);
      assert.equal(result.querystring, querystring);
    }
  }
});
