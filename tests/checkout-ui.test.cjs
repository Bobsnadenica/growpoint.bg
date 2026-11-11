const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const source = path => readFileSync(new URL(`../${path}`, `file://${__filename}`), "utf8");

test("customer checkout requires server enablement and explicit recurring consent", () => {
  const billing = source("src/app/components/ExpertBillingPanel.tsx");
  assert.match(billing, /if\(!selected \|\| !consent \|\| !data\?\.enabled \|\| submitted\) return/);
  assert.match(billing, /data\?\.enabled\?<button/);
  assert.doesNotMatch(billing, /PaymentPlaceholder|демонстрац|mockup/i);
  assert.doesNotMatch(source("src/app/legacy/SiteAppLegacy.tsx"), /PaymentPlaceholder/);
});

test("terms describe card and refund rules when card payment is available", () => {
  const terms = source("src/app/pages/TermsPage.tsx");
  for (const text of ["V-POS", "Visa, Mastercard и bCard", "Mastercard Identity Check и Visa Secure", "4 000 EUR", "Не съхраняваме данни за банковите карти", "възстановява по същата карта", "Когато за избраната услуга е налично плащане с карта"]) {
    assert.ok(terms.includes(text), text);
  }
  assert.doesNotMatch(terms, /демонстрац|mockup/i);
});

test("mobile shortcuts use standalone destinations and portrait uses modal isolation", () => {
  const shell = source("src/app/layout/AppShell.tsx");
  assert.doesNotMatch(shell, /to="\/dashboard#(?:notifications|sessions)"/);
  assert.match(shell, /to="\/notifications"/);
  assert.match(shell, /to="\/messages"/);
  assert.match(source("src/app/legacy/SiteAppLegacy.tsx"), /useModalFocus\(true, dialogRef, onClose\)/);
});
