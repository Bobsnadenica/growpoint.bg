# DSK sandbox results — 1 October 2026

These are **sandbox results, not production payment approval**. Public checkout remains a labelled preview. The owner submits the evidence to DSK; no report or message was sent by the agent. Automatic bank sandbox notices were explicitly authorized.

## Website-to-bank-and-return cases

Each card case began in the GrowPoint admin UI, created one synthetic order with HTTP 200, opened bank-hosted card entry, and returned to the merchant with HTTP 200. The application result matched an independent bank status lookup. All amounts were EUR 1.00 in test mode using the bank's fake cards.

| Website card case | Expected | Bank status / action | Outcome |
| --- | --- | --- | --- |
| Visa 3DS frictionless success | Sandbox capture | 2 / 0 | **Passed** |
| Mastercard 3DS challenge success | Sandbox capture | 2 / 0 | **Passed** |
| Mastercard challenge rejection | No capture | 6 / -2025 | **Passed** |
| Wrong CVC | No capture | 6 / 71015 | **Passed** |
| Wrong expiry | No capture | 6 / 71015 | **Passed** |

No real funds, production payment flags, memberships, paid entitlements or meeting access changed. The business snapshot stayed at four users, two experts and three bookings with the same exact snapshot hash.

## Recovery, permissions and UI

| Check | Observed | Outcome / scope |
| --- | --- | --- |
| Abandon checkout without entering a card | Bank 0 / -100; application remains `created`; bank page had no cancel button | **Passed abandonment check**, not cancellation; bank status 3 **untested** |
| Missing browser return after Visa success | Bank already 2 while application remained `created`; merchant return GET recovered success | **Passed**; does not prove unattended production reconciliation |
| Reload abandoned checkout | Same bank order; one GET, zero POST registrations | **Passed** |
| Duplicate Visa creation request | HTTP 200, same gateway identity/version and succeeded state | **Passed**, no second order |
| Altered amount/currency | HTTP 400, no application record created | **Passed** |
| Forged browser success/paid flags | Ignored; authoritative `created` state retained | **Passed** |
| Access control | Non-admin sandbox operations return 403; anonymous access returns 401 | **Passed** |
| Rotated QA accounts | All four profile/bookings/notifications reads return 200; old JWTs return 401 and refresh is rejected | **Passed** |
| Mobile sandbox panel at 390px | No horizontal overflow; 48px controls | **Passed** for the tested viewport |

The full regression suite passed **235/235**, with no skips. Source release `09738bd6` passed CI and the legacy Pages job; the production frontend was deployed and its invalidation completed. These checks do not certify every production billing or device workflow.

## Earlier portal-only evidence

Two earlier EUR 1.00 Mastercard portal-link cases independently returned success **2 / 0** and challenge rejection **6 / -2025**. These are historical provider-only checks, separate from the five website card cases above; they are not counted as full GrowPoint integration flows.

## Fixes and safety

- DynamoDB transactional condition checks require their own IAM action, even when item reads/writes are allowed. The fix is restricted to the existing application tables; no wildcard table access or new service was added. See [AWS transaction IAM documentation](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis-iam.html).
- The provider's actual checkout path is `/payment/merchants/multiecom/payment.html` with `mdOrder` and `language`. Validation accepts only the fixed UAT shapes, matching UUID and `bg`/`en`; extra/duplicate parameters, other hosts, credentials and fragments fail closed. Recovery requires provider-verified reference, amount, currency and gateway ID, never browser return flags.
- Amount and currency are server-owned. Credentials travel only in server POST bodies; card entry occurs on the bank page. Synthetic records cannot activate memberships, change bookings/points, send platform emails or enter registration totals.
- Historical QA credential exposure was remediated on the four supplied accounts with owner-approved distinct password replacements, global signout and an API cutoff. Old access is rejected. History rewriting was not approved or performed; incident locators stay private. See the [security audit](public-repo-security-audit-2026-10-01.md).

## Owner handoff and remaining gates

Private server-verified JSON, timestamps and case evidence remain outside Git with owner-only permissions. The completed dossier contains a visually inspected three-page PDF and 24 allowlisted ZIP files with verified SHA-256 checksums. Six merchant-result screenshots were reviewed for private-data disclosure, and the ZIP passed an exact-current-secret comparison. No evidence delivery is claimed. Card data, credentials, private contacts and order references are absent from this report. The owner submits the dossier to DSK (bank step 6).

**Sandbox is verified disabled again**, with both deployed credential fields empty. The reviewed disable apply changed only the existing Lambda (0 added, 1 changed, 0 destroyed); it is Active/Successful and its code hash matches the tracked archive. Post-apply Terraform reports no changes. Final smoke passes 19/19 canonical and 20/20 CloudFront; the domain gate passes 4/4. Live HTML/entry JS/CSS/admin chunk match the production build. Owned test browser sessions and the temporary credential bridge are closed. The current sandbox evidence does not authorize production activation.

Bank cancellation status 3 is untested. Real charging, production approval, monthly billing/renewal/expiry and refunds are not implemented or tested. Paid launch additionally needs immutable server-owned prices, authoritative unattended reconciliation, approved cancellation/refund policies and legal/operator details. Existing manually granted and complimentary memberships are unchanged. Production activation and production API-user credential setup remain owner/bank steps.

## Official references

- [Sandbox documentation](https://uat.dskbank.bg/sandbox/)
- [Redirect integration](https://uat.dskbank.bg/sandbox/en/integration/structure/redirect-integration.html)
- [API contract](https://uat.dskbank.bg/sandbox/en/integration/api/rest.html)
- [Current bank test cards](https://uat.dskbank.bg/sandbox/en/integration/structure/test-cards.html)
- [Moving from sandbox to production](https://uat.dskbank.bg/sandbox/en/integration/structure/test-to-production.html)
