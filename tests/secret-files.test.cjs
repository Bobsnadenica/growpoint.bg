const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

test("secret guard rejects force-added automatic settings, state, backups and saved plans", () => {
  const source = readFileSync(join(__dirname, "../scripts/check-secrets.sh"), "utf8");
  const pattern = new RegExp(source.match(/grep -iE '([^']+)'/)[1], "i");
  for (const path of ["infra/terraform/terraform.tfvars", "infra/terraform/dsk-uat.auto.tfvars", "infra/terraform/settings.tfvars.json", "infra/terraform/terraform.tfstate", "infra/terraform/terraform.tfstate.backup", "release.tfplan", ".env.local", "private.key"]) {
    assert.ok(pattern.test(path), `${path} must be blocked even if force-added`);
  }
  for (const path of ["infra/terraform/terraform.tfvars.example", "backend/api/dsk-uat.cjs", "README.md"]) assert.ok(!pattern.test(path));
});
