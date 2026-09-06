const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const source = path => readFileSync(new URL(`../${path}`, `file://${__filename}`), "utf8");

test("payment preview retains the no-card-data and no-payment-API boundary", () => {
  const checkout = source("src/app/components/PaymentPlaceholder.tsx");
  assert.doesNotMatch(checkout, /<input|<form|fetch\(|\bapi\.|localStorage|sessionStorage/);
  assert.match(checkout, /setAttempted\(current => !current\)/);
  assert.match(checkout, /role="status"/);
  assert.match(checkout, /mockup/);
  assert.match(checkout, /useModalFocus\(open, dialog/);
});

test("terms include requested card clauses and disclose that payments are not live", () => {
  const terms = source("src/app/pages/TermsPage.tsx");
  for (const text of ["V-POS", "Visa, Mastercard и bCard", "MasterCard Identity Check и VISA Secure", "4000 EUR", "Не съхраняваме данни за банковите карти", "възстановява по същата карта", "след активиране на реалната платежна услуга"]) {
    assert.ok(terms.includes(text), text);
  }
});

test("mobile shortcuts use standalone destinations and portrait uses modal isolation", () => {
  const shell = source("src/app/layout/AppShell.tsx");
  assert.doesNotMatch(shell, /to="\/dashboard#(?:notifications|sessions)"/);
  assert.match(shell, /to="\/notifications"/);
  assert.match(shell, /to="\/messages"/);
  assert.match(source("src/app/legacy/SiteAppLegacy.tsx"), /useModalFocus\(true, dialogRef, onClose\)/);
});
