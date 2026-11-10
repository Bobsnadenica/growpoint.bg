# DSK configuration review — 10 November 2026

Customer charging remains disabled. This review does not certify working production payments.

| Check | Outcome |
| --- | --- |
| Current sandbox recurring registration | Rejected again with error11: `Recurrent initialize payments are prohibited`. Correct register.do request, 999 EUR cents (€9.99), client ID and recurring frequency/expiry. No card submitted, no real money or production entitlement changed. Private reference/response retained outside Git. |
| Production operator portal | Authenticated live session verified. Merchant payment settings expose session timeout; no recurring-permission switch was found there. No setting was saved. |
| API credential setup | DSK documentation requires 2FA and suitable permissions for API users. Operator 2FA was off during inspection; its setup was prepared and handed to the owner. The existing operator email is already set. API password generation/rotation is an owner action. |
| Portal payment token | No token generated. The documented token supports limited APIs and does not substitute for the API-user password required by recurrentPayment.do. |
| Adapter compatibility | API-user credential length validation now matches DSK's documented username100/password200 limits. Oversized/control-character values still fail closed. |
| Software gates | 306/306 regressions pass with no skips; build/theme/TypeScript and public-file secret guard pass. These checks do not prove bank permissions or real-card transactions. |
| Deployment | Reviewed Lambda code-only apply (0add/1change/0destroy); active deployment and complete gateway source bytes match. Public checkout remains disabled and deployed live credentials remain empty. Production smoke19/19 and HTTPS4/4 pass. No frontend change/upload was required. |
| Private configuration | Owner-only, ignored live settings file prepared with empty credentials and all activation flags false; no live secret committed. |

Remaining financial proof: rotated API access, successful first/recurring/declined/interrupted bank flows, cancellation and refund, and owner-performed bounded real-card evidence. Sandbox permission must be resolved by the bank if unavailable through the merchant's authorized settings. The existing complimentary/granted packages and customer business records are preserved.

A private bank diagnostic with the exact sandbox reference is prepared for the owner. No message was sent to DSK. No operator/API password, 2FA credential, real payment, live payment flag or entitlement was changed by the agent during this review.

References: [DSK API-user/2FA setup](https://uat.dskbank.bg/sandbox/en/integration/mportal3/mp3.html), [production transition](https://uat.dskbank.bg/sandbox/en/integration/structure/test-to-production.html), [API specification](https://uat.dskbank.bg/sandbox/en/integration/api/rest.html).
