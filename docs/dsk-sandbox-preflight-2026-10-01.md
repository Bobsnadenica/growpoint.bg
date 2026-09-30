# DSK sandbox integration preflight — 1 October 2026

**This is not proof of successful bank transactions or bank approval.** No real funds, card details, memberships, bookings, meeting access, notifications or account credentials were changed. No emails/messages were sent by the agent. The owner submits any final test dossier to DSK; step 6 is not performed here.

## Integration checklist

| Bank step | Outcome | Evidence / remaining work |
| --- | --- | --- |
| 1. Documentation | Passed | Reviewed official redirect API, registration/status contract, test cards, merchant settings and production handoff. |
| 2. Code / module | Implemented; regression-tested | Custom React/Node integration uses bank-hosted redirects; CMS plugins are not appropriate for this stack. Only synthetic admin UAT orders are supported; public checkout stays mocked. |
| 3. Sandbox registration | Existing owner setup verified | Existing sandbox profile and test merchant portal are accessible. Used existing credentials; no account creation, credential rotation or browser password storage. |
| 4. Test configuration | Deployed disabled; private credentials prepared | Owner-approved UAT credentials are saved in an ignored owner-only local settings file. The deployed Lambda flag is false and its UAT credential fields are empty. Credentials, private references and card information are absent from GitHub/documentation. |
| 5. Successful and failed transactions | **Blocked; not executed** | Merchant notification email is populated. Clearing it produces “Email is not valid”; Save remains disabled. Notification triggers are not exposed in this portal. The unsaved edit was restored. DSK/owner must disable sandbox mail before checkout tests can respect the no-message boundary. |
| 6. Send results to bank | Owner only | No bank message was drafted or sent. This preflight report is not a substitute for the final transaction evidence pack. |
| 7–8. Production activation/configuration | Not attempted | Requires bank approval and production credentials. Operator password changes are completed by the owner. No production payment endpoint is configured. |

Read-only credential/environment preflight: a status lookup for a fresh, nonexistent synthetic reference returned HTTP 200, gateway error code 6, and no order status/reference. No order was registered. This is an API connectivity observation, **not a paid transaction or a complete credential/terminal certification**.

## Safety and local evidence

- API registration is fixed to **100 minor units / EUR 978**. Browser-supplied prices, card/email fields, arbitrary endpoints and return URLs are rejected or never sent.
- Only the UAT host is allowed. Credentials travel in the server-side POST body, never URLs, frontend bundles or logs. Card entry belongs to the bank page only.
- Browser return parameters never establish success. Status must match the stored merchant reference, gateway ID, amount and currency; one-phase success requires captured status 2 and action code 0. Missing evidence stays unknown.
- Conditional DynamoDB creation registers once, including concurrent requests. Ambiguous registration performs one status lookup, never a blind new registration. A bounded conditional merge preserves the bank URL when a concurrent status lookup wins.
- Synthetic records are excluded from registration metrics and isolated from account/payment state. Creation checks the owner is still active. Owner export includes sanitized test summaries; exact-owner deletion removes checkout/rate records and keeps retryable identity state on failure. No persistent test identity is deleted to prove this.
- Manual checks only; no new table, service, scheduler, polling loop or recurring bank request. New test creation is limited to one per admin per minute.
- Local fixtures cover success, authorization, failure, cancellation, refund, forged return values/URLs, amount/currency mismatches, duplicate requests, timeouts, stale UI responses, access denial and zero production entitlement/email effects. Fixtures are **not real DSK execution**.

## Released verification

- **171/171 automated tests**, no skips; frontend build, TypeScript, theme, backend syntax, secrets, Terraform format/validation and both production dependency audits pass. Exact private-credential comparison finds no public file match.
- Desktop/mobile light/dark isolated UI checks at 1440px/390px pass, including keyboard access, 44px actions, same-order reload and no uncaught errors. These use fixtures, not a bank transaction.
- Reviewed Terraform apply: **3 added, 1 updated, 0 destroyed** (three existing-authorizer API routes and the existing Lambda). Lambda is Active/Successful, deployed archive hash matches source, and the follow-up plan has no changes. No new fixed-cost/recurring service.
- CloudFront invalidation is complete. Canonical HTML, referenced JS/CSS and changed lazy admin chunks match the build; read-only smoke passes **19/19 www**, **20/20 preview** and HTTPS domain gate **4/4**.
- All four supplied accounts pass login and existing profile/bookings/notifications reads. Admin configuration reports disabled, the export contains a sanitized sandbox list and disabled creation is rejected with 403. Other accounts cannot read admin config (403); anonymous access to all three routes is rejected (401). Only newly issued refresh sessions were revoked; existing account/bookings/membership/payment state was preserved.

## Final transaction dossier still required

After notification controls are resolved, enable UAT deliberately and run several bank-executed cases: Mastercard 3DS challenge success, Visa frictionless success, documented declined card, invalid CVC/expiry, cancellation, reload/return and duplicate submission recovery. Use only the current official test-card list. Never use real cards or save a card binding.

For each case retain UTC time, synthetic case ID, environment, amount/currency, expected versus actual result, server-verified bank status/action code and redacted checkout/portal screenshots. Provider order references needed by the bank belong in a **private owner dossier outside Git**, not this public report. Confirm no production membership/booking/meeting access changed and no mail was emitted. Record incomplete cases as blocked/untested rather than successful.

Before paid launch, implement immutable price snapshots, monthly package expiry/renewal semantics and authoritative reconciliation when a browser never returns. Callbacks need provider-approved verification. Refunds, cancellations and legal/operator details also require approval. Existing paid/manual/comped states are preserved during UAT.

## Official references

- [Sandbox documentation](https://uat.dskbank.bg/sandbox/)
- [Redirect integration](https://uat.dskbank.bg/sandbox/en/integration/structure/redirect-integration.html)
- [API methods and status contract](https://uat.dskbank.bg/sandbox/en/integration/api/rest.html)
- [Test cards and scenarios](https://uat.dskbank.bg/sandbox/en/integration/structure/test-cards.html)
- [Merchant settings and notification controls](https://uat.dskbank.bg/sandbox/en/integration/mportal3/mp3.html#mp3-general-settings)
