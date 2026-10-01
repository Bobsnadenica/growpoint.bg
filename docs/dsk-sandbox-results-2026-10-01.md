# DSK sandbox results — 1 October 2026

These are **sandbox results, not production payment approval**. Public checkout remains a labelled preview. The owner submits the evidence to DSK; no report or message was sent by the agent. Automatic bank sandbox notices were explicitly authorized.

| Test | Expected | Observed / evidence | Outcome |
| --- | --- | --- | --- |
| Bank portal link, Mastercard 3-D Secure rejection | No capture | Bank page reported declined; independent status lookup returned order status 6, action -2025, amount 100 minor units, EUR | **Passed** |
| Bank portal link, Mastercard challenge accepted | Fake capture only | Bank page reported success; independent lookup returned status 2, action 0, amount 100 minor units, EUR | **Passed** |
| GrowPoint admin sandbox registration | One synthetic order, usable bank URL | Initial AWS access denial; fixed scoped `ConditionCheckItem` permission. Registration then succeeded, but strict URL validation rejected the provider's actual checkout format | **Failed, corrected; full live re-test blocked** |
| Actual provider URL format | Bank-only, matching order ID | One authorized registration probe established the bank's fixed multiecom checkout path and language parameter. Saved reply now passes narrow validation and existing-order recovery fixtures | **Passed locally; not a completed website payment** |
| Reload/idempotence, mismatched amount/currency/identity, unrelated access, no production entitlements | Fail closed; same order retained | Automated adapter/service/UI regressions pass | **Passed locally** |
| Website redirect, fake-card entry, verified return end-to-end | Server status decides success | Paused after confirmed historical exposure of the shared QA credential; sandbox access disabled again | **Blocked** |
| Visa success, invalid CVC/expiry, explicit cancellation, bank-tested duplicate return | Several provider outcomes | Not completed in this run | **Untested** |
| Production charging, subscriptions and refunds | Bank-approved live integration | No production credentials or activation supplied | **Not implemented / not tested** |

The two completed portal cases used the bank's published test cards, EUR 1.00 and test mode. No real card, binding, customer invoice, real funds, paid membership, booking payment flag or meeting access was changed. Portal results alone do not certify GrowPoint's redirect integration.

## Fixes and safety

- DynamoDB transactional condition checks require their own IAM action, even when item reads/writes are allowed. The fix is restricted to the existing application tables; no wildcard table access or new service was added. See [AWS transaction IAM documentation](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis-iam.html).
- The bank currently returns `/payment/merchants/multiecom/payment.html` with `mdOrder` and `language`. Validation permits only that exact UAT shape (or the existing documented legacy shape), matching UUID and `bg`/`en`; extra/duplicate parameters, other hosts, credentials and fragments fail closed. Recovery uses a provider-verified reference, amount, currency and gateway ID, never browser return values.
- EUR 1.00 and currency are server-owned. Credentials travel only in server POST bodies. Card entry occurs on the bank page. Synthetic application records cannot activate memberships, change bookings/points, send platform emails or enter registration totals.
- Historical QA credential exposure is a separate security launch blocker. Password rotation/session revocation and owner-approved history cleanup are outstanding. No credential or history rewrite was performed. See the [security audit](public-repo-security-audit-2026-10-01.md).

## Owner evidence and remaining bank steps

Private evidence is saved outside Git in an owner-only directory: normalized server-verified JSON with provider references, gateway IDs and UTC checks, plus a private case index and checkout-format probe. Card data, API credentials and private references are intentionally absent from this public report. Do not publish the private dossier.

After credential rotation, deliberately re-enable sandbox access and complete the blocked/untested cases above. Keep expected/actual outcomes and provider status evidence for every case. The owner sends the final dossier to DSK (bank step 6); this report is incomplete certification evidence. Production activation and operator-password changes remain owner/bank steps.

Before paid launch, implement immutable server-owned price snapshots, monthly membership expiry/renewal and authoritative payment reconciliation, including missing browser returns. Approved cancellation/refund policies and legal/operator details are also required. Existing manually granted and complimentary memberships remain unchanged.

## Official references

- [Sandbox documentation](https://uat.dskbank.bg/sandbox/)
- [Redirect integration](https://uat.dskbank.bg/sandbox/en/integration/structure/redirect-integration.html)
- [API contract](https://uat.dskbank.bg/sandbox/en/integration/api/rest.html)
- [Current bank test cards](https://uat.dskbank.bg/sandbox/en/integration/structure/test-cards.html)
