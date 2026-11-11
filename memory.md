# GrowPoint working memory

Last reviewed: 2026-11-11. This is the canonical project memory. The historical review is preserved below for context, **not as current instructions**; the latest dated sections supersede conflicting historical claims.

## Coming-soon interaction polish — 2026-11-11 (latest)

- Explicit owner preference: NO pause-control buttons. Do not add these to the maintenance page. Existing automatic ambient pause during form entry and device reduced-motion support remain.
- Keep the approved colours/font/headline/motion. Form fields now stay mounted but truly hidden when closed, preserving drafts in this page's DOM only (no local/session storage; navigation/reload clears them). Hidden fields are excluded from keyboard navigation. Required-field guidance and consistent green/gold focus styling added; raw fetch TypeErrors become a Bulgarian retry message. Confirmation receives focus after success and when reopened.
- Local browser evidence: name/role/comment/consent retained across close/reopen, next Tab skips hidden form, normal submission and confirmation focus/reopen pass against a PRIVATE localhost fixture. Exactly one synthetic local submission; no AWS/email request. Stopping the local server reproduces friendly network failure with draft preserved and busy cleared. 390px no-overflow and focused colours pass; no pause button exists. Backend/maintenance/payment configuration unchanged.

## Coming-soon visual polish — 2026-11-11

- Owner asked to remove “Безплатно” and “Админ вход” from the maintenance page, while preserving its wording/colours/font. Only that word and the visible admin footer link were removed; the remaining microcopy and direct admin/CSV routes are preserved.
- Added decorative SVG connection trails/nodes, stronger drifting existing green/gold light, rotating tape markers, a slow status beacon and occasional CTA shine/arrow movement. All effects use CSS/SVG and existing assets, no dependency, video, provider, per-frame JS or backend service. Ambient motion pauses while the registration form is open and resumes on close. Existing reduced-motion rule disables all decorative animations.
- Local browser checks: actual moving stroke offsets, pause/resume, visible form entrance, keyboard close, focused typed-comment colours, and 320/390px no-overflow pass. Both removed labels are absent from rendered content; headline/copy retained. Build/theme/type/secret checks and all 313 regressions pass. No form submitted during this UI-only follow-up; backend, payment settings and maintenance flag are unchanged.

- Release6c131792 pushed to main/preparation branch; CI and legacy Pages pass. CloudFront deployment/invalidation completed, live HTML and four entry assets match. Live browser verifies both labels absent, moving trail offsets, paused/resumed motion on form open/close, mobile no-overflow and readable focused comments. Smoke19/19 and HTTPS4/4 pass. Runtime flag remains1; backend/data/bank settings unchanged.

## Coming-soon presentation — 2026-11-10 (deployed)

- Focus-colour follow-up: reproduced the comment textarea turning white under the shared `textarea:focus` rule while retaining pale text. ComingSoon now scopes the shared control palette to its dark surface and explicitly preserves input/textarea colours on focus, without `!important` or changes to other pages. Local browser checks with no theme plus stored light/dark themes confirm a focused background rgb(16,39,27) and text rgb(241,248,239); typed comments were not submitted. Source0b8e1ed8 is pushed/deployed with CI/Pages passing; live typed focus and complete HTML/entry-asset bytes verified after invalidation, smoke19/19 and domains4/4. Focused text is now part of the visual check, not just the empty form.

- Owner requests hiding the site for tomorrow's presentation: blurred animated background, yellow construction tape “Очаквайте скоро”, and Bulgarian pre-registration form. `public/maintenance.txt` is the canonical runtime switch: 1 on, 0 normal. `npm run deploy:maintenance` publishes only the flag; local file changes are not a production publish. Root maintenance.txt is a generated legacy copy. Public routes are gated without mounting the normal app, admins bypass it, auth/legal pages remain available, and `/?preview=soon` lets admins preview. Initial fetch errors fail closed; focus/60-second checks observe changes.
- New module `backend/api/preregistrations.cjs`: validated first/last name, client/mentor interest, email, optional phone/comment and required consent; atomic email deduplication, honeypot and expiring hashed-IP counters. Private, on-demand separate table with 180-day expiry/TTL; no Cognito signup, email sending, package, payment or account metrics mutation. New public POST and JWT+admin-only summary/CSV routes. CSV includes UTF-8 BOM, quoting and spreadsheet-formula protection; no public/signed permanent contact-list URL.
- Admin panel has counts and CSV download. Direct owner link `/admin?download=preregistrations#preregistrations` preserves auth flow and triggers one download, with a manual fallback button. Source/app checks pass 313/313; local 320/390px and desktop layout, keyboard focus/close, flag 0 and hidden direct public routes checked. Backend plan reviewed/applied: 5 add / 2 change / 0 destroy. Lambda/module bytes, active on-demand table and enabled TTL verified; DSK flags remain false and live credentials empty. No existing account or payment state changed.
- Source release 165f92ab pushed to main/preparation branch; CI and legacy Pages passed. CloudFront deployment/invalidation completed; live HTML, all four entry assets and logo MIME/bytes match source. Runtime flag is 1; flag-only publisher also tested with 1, without exposing the normal site. Smoke19/19, domains4/4 and a fresh full Terraform plan with no managed changes pass. Normal mode0 restoration was local only. Signed-in admins deliberately bypass the reveal; use `/?preview=soon` if the owner wants to see it while logged in.
- Authenticated owner Safari direct-download link successfully downloaded CSV. One labelled synthetic registration was submitted from the actual public browser form, read back independently, retried without overwriting the original and matched in the Excel-compatible CSV. Anonymous summary/CSV401; non-admin denial and formula/multiline/retention/rate-limit/error handling covered in tests. Removed only the synthetic row and its Downloads test copy after proof; admin list verified0. No email sent or Cognito account created. Live mobile required-field validation, focus/escape return, no horizontal overflow, and hidden direct profile route pass. See docs/qa-coming-soon-2026-11-10.md. Private evidence/screenshots stay outside Git. DSK work stays paused.

## DSK configuration review — 2026-11-10 (latest)

- Follow-up: owner enabled email-code 2FA. Live portal explicitly shows Enabled; API users remains absent after both a full reload and an owner-completed fresh 2FA sign-in. Private screenshot retained outside Git. DSK docs require both 2FA and suitable permissions; bank-enabled API-user management or secure API password rotation is needed. Do not keep asking the owner to enable 2FA or search the operator-password page. Private bank diagnostic updated. No password/token was generated or changed by the agent. This supersedes the pending 2FA notes below.

- Owner asks to finish configuration and explicitly permits the browser. Authenticated live operator portal verified. Do not confuse operator login with API access. Its unlabeled top-right button is Logout; inspect native controls visually before clicking. Native screenshots are at2x scale; derive coordinates correctly instead of guessing. An accidental logout was recovered by owner-approved Safari Touch ID and re-login.
- Merchant Payments currently exposes session timeout only, not a recurring-permission toggle. Payment token has not been generated and cannot replace API credentials for recurrentPayment.do. Official DSK API-users documentation requires both2FA and suitable permissions. Operator2FA was off; verified existing email, selected email method as preparation, and asked the owner to complete credential setup. The bank warns2FA cannot later be disabled. New/rotated bank credentials and final real-card actions require owner handoff, never ask for passwords in chat.
- Prepared private owner-only ignored live tfvars with empty credentials/false flags. The owner should enter freshly rotated API credentials there; never overwrite an existing populated file or set confirmed flags without evidence. Sandbox credentials remain private and separate.
- One fresh sandbox registration reproduces error11 on10November with documented recurring frequency/expiry and no card submission. No funds, production payment flag or membership changed. Private evidence and an exact-reference bank-message draft are outside Git; owner sends any bank correspondence.
- Corrected gateway username/password length limits to DSK's documented100/200, retaining control-character/oversize rejection. Tests306/306 and build/theme/type/secret checks pass. See docs/qa-payments-2026-11-10.md. Bank recurring and rotated live authentication are still unverified; do not equate software/portal checks with working payments.
- Reviewed code-only Lambda apply0add/1change/0destroy, complete deployed gateway bytes match source and Lambda is Active/Successful. Public charging is off and live credentials remain empty. Fresh smoke19/19 and HTTPS4/4 pass; frontend bytes were unchanged so no CloudFront upload was needed. Owner authentication/API setup answer is still pending at this snapshot.

## Mail forwarding and alerts — 2026-11-08 (latest)

- Owner explicitly asked the agent to inspect the linked AWS message and complete the remaining confirmation. The linked message was the SES approval, with no reply/action required. No support reply, bank message, or policy acceptance was sent.
- ImprovMX had a mistyped `*contactus` alias. Corrected only that alias to `contactus`, preserving its existing private forwarding destination, and verified persistence after reload. Admin/legal/partnership routing destinations were not changed. Do not publish destination mailboxes, provider account details or confirmation URLs.
- SES had contactus suppressed specifically for BOUNCE after delivery failures. Removed only that entry after the forwarding repair, verified absence, sent one labelled new test and found the matching message in the owner's actual inbox. The earlier admin-address SES test is also visible. SES→ImprovMX→inbox delivery now passes for these two public aliases; this does not prove every booking/payment email template or a new signup flow.
- The first SNS contact-address confirmation remained undelivered. Replaced only the operational-alert subscription endpoint with the already working admin alias via reviewed Terraform (1add/0change/1destroy; no table/Cognito/Lambda/billing changes). Owner-authorized confirmation completed through the email link and AWS's second Confirm Subscription button. AWS UI and independent subscription attributes confirm active status.
- Published one clearly labelled SNS test only after checking that the only confirmed subscriber was the owned admin alias. Matched the exact test in the owner's actual inbox. A leftover unconfirmed contact-address record from the single resend cannot be unsubscribed while pending; AWS normally expires these automatically. It is not a confirmed duplicate recipient; do not repeatedly resend or treat it as a new payment/identity resource.
- Fresh full Terraform plan reports zero managed changes after confirmation. Build/theme/type and Terraform format/validation pass (existing provider deprecation warnings remain). SES stays GRANTED/production enabled; all DSK activation gates stay off and no membership, booking or paid state changed. Public readiness remains limited by independent bank/legal/customer-workflow gates.

## Mail activation — 2026-11-08 (earlier request)

- Owner confirms inbound forwarding for contactus/admin aliases is now directed to a monitored mailbox and authorizes activation/confirmation emails. Do not publish the private forwarding destination or confirm owner email links on their behalf.
- SES domain verified/DKIM success, sending enabled, feedback forwarding enabled and BOUNCE/COMPLAINT suppression enabled. Two explicitly requested direct tests to the public contact/admin aliases were accepted by SES; inbox arrival is still owner-unconfirmed. Acceptance does not prove forwarding or delivery. No duplicate tests should be sent without checking the existing evidence privately.
- Updated the SES production-access request through PutAccountDetails to the canonical GrowPoint website, transactional use case and the public contact/admin addresses. API returned200; independent readback shows ReviewDetails.Status=PENDING and ProductionAccessEnabled=false. This supersedes the old denied/obsolete-website request notes. The initial PENDING response was superseded by the GRANTED readback below; approval was not performed by clicking an email link. No paid plan, quota add-on, marketing campaign or bank setting was enabled.
- Reviewed targeted Terraform plan recreated only the existing SNS operational-alert email subscription to the public contact alias (1add/0change/0destroy). Readback is PendingConfirmation. Owner must click Confirm subscription in AWS Notifications email; this does not approve SES. Previous notes deliberately holding that subscription are superseded. Do not claim confirmed alerts or zero drift before fresh readback/plan.
- AWS subsequently approved the same request during this session: independent SDK readback now shows ReviewDetails.Status=GRANTED and ProductionAccessEnabled=true. Private approval evidence saved. This supersedes PENDING/denied/sandbox statements above and below. SES approval is now passed; received test messages and end-to-end customer notification delivery remain owner-unconfirmed. Do not claim inbox delivery from acceptance.
- DSK payment flags, credentials, disabled billing schedule, memberships and bookings were not changed. The bank recurring-init refusal and separate API-rotation/real-card gates remain independent of mail forwarding.

## DSK subscription implementation — 2026-11-08 (latest)

- Current work supersedes the earlier “unwired/preparation-only” architecture below. `backend/api/billing.cjs` now integrates checkout, immutable server prices/recurring consent, versioned payment/subscription records, calendar-month expiry, cancellation/resume, first/renewal recovery, refund requests and confirmed-refund revocation. Existing comped/granted access is preserved; session charging remains excluded.
- Customer `ExpertBillingPanel` and the unified admin billing queue are integrated. The browser never accepts card details or decides paid status. A bank return triggers authenticated server verification. Common bindings never enable recurring debit; zero-charge recurrent setup cannot grant access and uses a separately reserved first fee. Ambiguous requests are reconciled without another debit. New checkout/onboarding remains disabled until all live gates pass.
- Uses one sparse `billing-index` on the existing on-demand users table, scoped IAM Query and a dedicated five-minute rule disabled without configured rotated API access. No new always-on service. Notices are durable, bounded (four attempts), at least once; SES acceptance is not delivery. Pending/due reads are indexed; admin history is an on-demand scan. All flags default false, dedicated credentials empty. Keep unrelated SNS confirmation drift excluded.
- Local verification: 305/305 ordinary regressions and 27/27 real DynamoDB Local transaction cases pass, no skips; build/theme/type/secret checks pass. New CI runs the local transaction engine from an official checksum-verified archive. Synthetic browser checks at 320/390/1440px cover consent, focus, one registration on repeated click, history/cancel/resume/refund and disabled-preview zero writes. These do not prove live bank recurrence or deployed IAM.
- Real DSK sandbox: the earlier synthetic 9.99 EUR adapter payment was fully refunded this turn; authenticated bank status confirms refunded999/remaining deposit0. Corrected gateway handles this response. New billing service plus local DynamoDB and real sandbox reproduces recurring-init error11; no entitlement created. Test binding already disabled; no bank recurring task. No real money, production identity/booking/package changes or bank messages. Private evidence remains outside Git. The earlier note saying no refund test ran is superseded.
- Conditional terms and explicit checkout consent now implement the owner-authorized default: calendar monthly billing, stop future renewals, paid access until expiry, full refund on request within14days of first fee, mandatory rights preserved. Financial refunds are performed by the authorized bank operator; application records requests and verifies bank completion. Legal/retention/accounting and invoice issuance are still not approved/proven.
- Still blocked: bank recurring-init permission, separately rotated production API credential, successful/declined/interrupted complete bank/application lifecycle, verified general-customer email delivery (SES production false), accounting/legal review and owner real-card/refund proof. Never call this live/payment-ready solely from local tests. Owner sends the diagnostic in `docs/qa-payments-2026-11-08.md`; no new questionnaire or messages on their behalf.

- Deployment verified: source999bcc9f + cleanup fixc5c6897e on main and preparation branch, both CI/Pages green. Reviewed non-destructive apply12add/3change/0destroy plus Lambda code-only follow-up; billing GSI ACTIVE and all three Lambda payment-module bytes match source. Live/UAT flags false, credentials empty, billing schedule DISABLED. Public config/prices correct; unauthenticated billing401. Full plan only held SNS confirmation drift. CloudFront invalidation complete,12 complete HTML/chunk/media byte+MIME matches, smoke19/19 and HTTPS4/4.
- Live existing Google admin callback completed after the old Safari session expired; unified admin billing queue and expert billing/index Query loaded without error. Granted Spotlight remained current, no paid order created, profile/bookings untouched. This verifies Google existing-account callback and deployed read IAM; other providers/new signup delivery and actual financial transactions remain separate. Local temporary UI/Java servers stopped and viewport reset.

## DSK and merchant review — 2026-11-08 (earlier release)

- Owner confirms automatic renewal, the existing final expert-tier prices and preservation of comped/granted memberships; authorizes sensible defaults and no further questionnaires. Supplied correspondence address is Sofia, Studentski, 8-mi dekemvri 13, 1700; merchant details are centralized in `src/lib/merchant.ts` and added to contact/terms/privacy. Legal policy versions are synchronized to 2026-11-08. Existing account consent is preserved; new explicit consent uses the displayed version. Default billing/refund policy is a draft, not advertised live functionality. The owner's statement that DSK issues invoices remains unverified; do not equate the bank receipt or portal payment request with a tax invoice.
- Native Safari confirms authenticated Live-mode portal, still with no generated payment token. Read-only AWS checks confirm no deployed live flag/credentials; SES production access remains false. Previously exposed production credentials were not reused. New credential generation/password changes and the actual real-card steps require owner handoff, not another questionnaire. Never send messages/reports to DSK; an owner-sendable diagnostic is in `docs/qa-payments-2026-11-08.md`.
- Same production-adapter code can now run explicitly against the fixed sandbox origin, with no environment fallback. Added guarded JSON `recurrentPayment.do` support, independent capture verification, exact client-to-binding matching, explicit save-card consent and recurring expiry/frequency validation. Ordinary `clientId` alone creates a common binding, unsuitable for recurring. The modules remain unwired; no production subscription charging or scheduler is activated.
- Actual provider-only sandbox test: bank-hosted fake-card 9.99 EUR payment passed, verified status 2/action 0, exact deposit/zero refund and matching saved binding. Subsequent common-binding debit refused with `Binding not recurrent`; a separate diagnostic confirmed it. Correct recurring-initial registration then refused with code 11, `Recurrent initialize payments are prohibited`; diagnostic registration confirmed the refusal. This is a bank configuration gate, despite owner-reported live permission. Re-test the corrected initial flow after DSK enables it. Test binding disabled successfully (active list 1 to 0); no recurring task, real payment, membership, profile, booking or platform email was created/modified by these bank tests. The initial fake payment remains bank history; no refund test was run. Private evidence stays outside Git.
- Purchased memberships now require current `packageStartsAt`/`packageExpiresAt` and no revocation; grant/comped behavior is unchanged. These fields are protected by consultant concurrency snapshots and stripped from public responses. Aggregate current-data audit found no purchased memberships, so no existing paid access was removed. Full suite 304/304, build/theme/TypeScript/secret checks pass. Runtime Lambda ZIP was tracked despite ignore rules; removed from the Git index while keeping the generated local deployment artifact.
- Source `8b35b6bd` pushed to main and the preparation branch; CI/legacy Pages pass. Reviewed Lambda-only Terraform apply changes source hash only; downloaded handler and adapter bytes match local files. No environment/IAM/Cognito/table changes. CloudFront invalidation completed; production HTML plus all four referenced entry assets match dist bytes. Smoke19/19, HTTPS domains4/4 and live mobile terms/merchant/preview disclosure pass. Local dark terms/contact at 390px and light privacy at 1440px fit without overflow; viewport reset. Current private sandbox credentials have zero exact matches in public files. The pre-existing SNS confirmation-subscription drift was excluded; do not claim zero full-plan drift. Full customer checkout, recurring billing/cancellation/refund state, reconciliation, onboarding, production email, accounting and real-card proof remain unfinished; no production-readiness claim.

## DSK production preparation — 2026-11-02 (in progress)

- The owner successfully opened the merchant portal in live mode. Its webhook settings show dynamic GET notifications enabled for Approved, with Deposited and Refunded not selected; no changes were made. The merchant payment-token screen says no token has been generated. Portal login is distinct from API authentication; live API credentials and permissions remain unverified. Never place credentials, merchant identifiers or tokens in this public repository.
- Added **unwired, undeployed** production-gateway and order-ledger preparation with server-owned tier prices, ownership and restricted-account checks, one unresolved order lock, reference idempotence, HTTPS bank URL validation and conservative bank-response checks. Mock-only tests cover failures, mismatches, concurrent starts and refunds; the complete suite is 299/299. These modules cannot accept customer payments and must not be wired up until settlement/entitlement transactions, lock recovery, expiry, refunds, reconciliation, secure credentials, policies and real bank evidence are completed and reviewed.
- The owner selected expert packages only, with automatic monthly renewal; session payments are excluded. The owner reset the operator-portal password only, not the separate API credential. The merchant legal name and registration number were supplied, but correspondence address and approved subscription/refund policy remain unconfirmed. Do not publish guessed terms. DSK documents separate permissions for saved-card payments and recurring features; whether this merchant has them is unverified. The previously shared API credential requires rotation before use. See `docs/dsk-recurring-launch-checklist.md` for the owner-sendable bank questions and remaining gates.
- Live customer checkout is still disabled. Bank response parsing now rejects contradictory success flags and error codes; a mock test checks both registration and status. No bank settings, AWS infrastructure, real payments or external messages were changed in this pass. The existing untracked production-integration document predates this work and remains untouched.

## Company profile and review labels — 2026-11-02 (latest)

- Owner confirmed company qualifications as AWS Cloud Architect and Microsoft Azure Cloud Architect; saved these without asserting specific credential levels. The company's public expert profile now shows 100% completion, 100 EUR per 60-minute session, and 392 slots on Saturdays and Sundays 10:00–23:00 starts, Europe/Sofia, from 7 November 2026 through 7 February 2027. Independent public API readback confirmed all 28 weekend dates, 14 starts per date, the price and qualifications. Existing bookings and membership were not altered.
- The existing weekly editor produces finite date batches, not a perpetual recurring rule. Fourteen weeks is the largest available batch under the 400-slot limit for this pattern; it must be renewed before the last date. The UI explicitly says slots do not extend automatically. The editor supports 21:00–23:00 and a per-session EUR price in 50 EUR increments, matching the backend's existing price tiers. This does not enable real payments.
- Fixed the public booking page silently limiting its calendar to the first 12 available starts. It now passes every upcoming bookable slot to the calendar while preserving the five-minute lead time. This is necessary for later weekends and late hours to be selectable.
- Unreviewed directory/profile cards use one accurate no-reviews label instead of repeating a potentially misleading new-profile label; rated profiles retain their numeric rating and review count.
- Release `cc9b809f` pushed and deployed; CI/Pages and CloudFront invalidation passed. Live directory shows a single no-review message and 100 EUR per session; the public calendar shows 14 starts on both weekend days, including 23:00. The complete 392-slot/date/price/qualification check was performed against the public API, without submitting a booking. Tests 287/287, smoke19/19 and domains4/4 pass. Source HTML and four referenced entry assets match production bytes.

## Profile and availability guidance — 2026-11-02 (latest)

- Profile setup now has contextual step guidance, a step-position indicator and reduced-motion-aware transitions. The consultant availability editor begins with a compact summary and reveals the separate single-day or weekly editor on demand. Weekly weekday/weekend presets only select days; a count preview appears before adding slots, and profile changes still require an explicit save. Drafts and occupied-slot protection remain in place. A new save button within the editor submits the entire profile, with the same existing save handler.
- The public booking calendar clears its selected time when the visitor changes the day or month, preventing the previous day from being submitted accidentally. Local browser previews with synthetic data cover 320/390/1440px, dark mode, weekday/weekend selection, draft retention and mobile booking-day selection. These are not a physical-device or authenticated live-save test. Guidance is rule-based and local; no AI provider, external processing or recurring cost was added.
- Source release `2ef64d0e` pushed with CI/Pages passing and deployed to CloudFront; invalidation completed. Production HTML and all four referenced entry JS/CSS assets match the build. Live public profile at 390px confirms switching day clears the selected booking time, with no booking submitted. Production smoke19/19 and domain4/4 pass. Automated tests 285/285; build, theme and secret checks pass. No existing profiles, availability or business records were changed in this UI pass.

## Live chat, sharing and SES review — 2026-11-02 (latest)

- Using the supplied client and expert, authenticated production API tests passed request/acceptance, two-way chat, both in-app notifications, unrelated-user chat denial, synthetic document upload/share, expert download with matching bytes, unrelated-user document denial, revocation of new links and cancellation. Cancelled chats remain readable but reject new sends. The temporary expert slot and synthetic document were removed, the example expert was returned to hidden and new refresh sessions revoked. Repeated email retests left additional labelled, cancelled/unpaid QA bookings. No membership, points or paid state was manufactured. This is real API-to-storage evidence, not a fresh browser/device walkthrough; already issued document links may remain valid for up to 15 minutes.
- App booking mail initially failed with SES AccessDenied on recipient identity. A reviewed, targeted IAM apply permits SES identity checks within the existing account/region while still requiring the exact configured From address; IAM simulation denies a different From address. After propagation, the latest three app attempts reached SES and were rejected as unverified sandbox recipients. Lambda logs now classify authorization failures without recording addresses or message bodies. Narrow policy/Lambda applies made no resource additions or deletions; existing unrelated SNS subscription drift remains held.
- SES production access is still disabled, sending enabled, domain verified and DKIM successful. The mailbox simulator and one direct test to the site's contact address were accepted by SES. A search of the open owner mailbox did not find the test; forwarding/inbox delivery remains unverified. The existing production-access request contains obsolete site/business details; the owner must correct them with AWS and obtain approval. No support request was submitted. Real customer delivery, signup delivery and bounce/complaint operations remain launch gates.

## Mobile dashboard review — 2026-11-01 (latest)

- Client/expert profile editor now precedes points, ads, recommended profiles and package promotions; compact two-column mobile dashboard navigation and four visible profile-step buttons reduce scrolling without reducing targets below 44px. Expert hours section opens on the availability editor first. Admin clients no longer see self-matching recommendations/points.
- Fixed next-session summary selecting past/cancelled bookings; session history is labelled “Моите сесии”. Regression covers past, cancelled and future selection. Suite 283/283, build, theme/TypeScript, secret guard and diff checks pass.
- Local same-origin QA proxy with approved client/expert test accounts: 320/390/1440 layouts, no horizontal overflow, profile tabs and unsaved draft retention; expert availability draft add/remove without saving; expert files and notifications views load. Live independent authenticated client/expert/admin profile/bookings/notifications reads all 200, expert profile and admin metrics 200. Production smoke19/19. Newly created refresh sessions revoked; no messages, bookings, file shares, payments or account data changed deliberately.
- Live SES read shows production access false, sending enabled: real general-recipient email remains blocked. Full new live booking/accept/reschedule/chat/file-sharing workflows, actual inbox delivery, production payments and legal/operator approvals remain unverified or pending; this review does not certify launch readiness. Existing SNS subscription drift is held.

## Dimitar weekend hours and full profile — 2026-11-01 (latest)

- Owner asked for every Saturday/Sunday availability and 100% completion. Through his signed-in admin editor, selected Saturday/Sunday only and one-hour starts 09:00–16:00 (ends 17:00), Europe/Sofia, for the editor's maximum 12-week batch. Saved 184 slots, 7 November 2026 through 23 January 2027; anonymous API verifies only weekend dates and those eight start times. This is finite date generation, not an ongoing recurrence rule. No booking, price, payment or attendance was changed.
- Completion now displays 100%. Education entry describes professional focus and explicitly says no particular diplomas/certificates have been published. It must not be interpreted as credential verification.
- Owner rejected illustrated avatar. New photorealistic fictional AI headshot is `public/assets/mentors/dimitar-photoreal-portrait.png`; biography disclosure remains. Earlier illustrated asset is historical, not the current portrait. Source prompt/provenance is in `docs/dimitar-avatar.md`.

## Dimitar Google-admin mentor and homepage split — 2026-11-01

- Owner's signed-in Google admin saved his own profile through Safari `/dashboard?profile=1`: Dimitar Todorov, mentor, `dimitar-todorov`, Cloud Architect / SRE / AIOps Engineer, owner-supplied 10 years of experience. Added Bulgarian biography, cloud/SRE/AIOps expertise, intended clients, practical approach, languages and tags. No invented employers, certifications, reviews, prices or calendar slots. Completion is 85%; education and availability remain empty. Admin access/account role preserved.
- Google image was only an initial placeholder. Generated an illustrated avatar with built-in image generation, uploaded it through the actual profile form, and disclosed it in the biography as an AI illustration rather than a photograph. Source/provenance is in `docs/dimitar-avatar.md`; no private provider identifiers or authentication material belong there.
- Independent admin-owned `spotlightBannerEnabled` boolean defaults to enabled for legacy profiles. Admin form saves it through the existing self-profile endpoint; clients cannot use it to grant privileges. Spotlight banner selection excludes explicit opt-outs; homepage expert cards exclude profiles already shown as banners. No hardcoded person/company IDs in layout logic.
- Dimitar received an admin-granted Spotlight tier and featured placement; banner explicitly off. Company retains banner on. Anonymous browser readback proves banner = company only and expert card = Dimitar only; mentor portrait loads. Demo was found shown again at the beginning of this task and explicitly hidden again. Its records are retained privately in admin, not deleted.
- Fixed self-publication status to match admin visibility publication, so showing a profile also makes it eligible for the admin featured control. Tests 282/282, build/theme/TypeScript/secrets pass. Lambda-only reviewed applies add/destroy no resources; existing SNS drift stays held. Live smoke19/19 and domains4/4 passed. New admin QA refresh sessions revoked; owner's Safari session remains signed in.

## Company mentor replaces demonstration — 2026-11-01 (latest)

### Optional admin expert profiles — 2026-11-01

- Admin role is a Cognito group capability, separate from the stored client/consultant role. `/admin` remains the normal landing page; its personal-profile link opens `/dashboard?profile=1` using the existing expert editor. Admin permissions/account role remain unchanged.
- Existing authenticated self-profile endpoints allow admins to create private drafts and save only their own expert data. Admin drafts default hidden and complimentary. Boolean `publicProfileEnabled` controls shown/hidden on save; non-admin clients cannot use this to create expert profiles. No new routes, resources or recurring service. Admin expert booking reads and benefit ownership also accept the separate admin capability.
- Regression suite 281/281 passes, including backend show/hide/client denial/role preservation and admin editor loading. Build/theme/TypeScript and secret checks pass. Deployment/live verification is recorded in the task handoff; the unrelated SNS subscription drift remains held.
- Released in `9b775541`: GitHub CI/Pages pass; reviewed Lambda-only Terraform apply changed one resource, no additions/destruction. CloudFront invalidation completed. Live supplied-admin API confirms hidden draft/save, anonymous 404, unchanged stored role and retained admin metrics access. Native browser confirms admin link → personal editor → switch → successful hidden save. Production smoke19/19 and domain4/4 pass. No real person/test profile was published to manufacture visible-toggle evidence; shown/hidden transitions are covered by regression tests. Google login itself was not repeated in this feature check.

- Owner's signed-in Apple account was edited through Safari: public name The Privileged Company, mentor type, slug `the-privileged-company`, Bulgarian company biography, expertise, target clients, practical session approach, languages and discovery tags. Branding uses the existing company logo uploaded through the normal profile form. Content follows the company's published services; no invented qualifications or testimonials.
- Existing authenticated admin APIs granted a promotional Spotlight package, explicitly shown visibility and featured placement to this company profile. This is an admin grant, not a payment. The former `growpoint-demo-consultant` was hidden using the visibility API; its account/history remains intact. No identity deletion or booking mutation. Fresh anonymous company API returns 200 and former demo API returns 404.
- Public browser confirms company logo loads, full text renders, and company appears in homepage Spotlight and featured expert card without the fictional example. Completion is 85%: education/certifications and future availability remain empty. No appointments were invented; booking remains unavailable until real slots are supplied. All new admin refresh sessions revoked. No frontend/backend deployment was necessary for these saved data changes.
- Earlier demonstration-profile instructions below are historical and superseded by this replacement.

## Professional demonstration profile — 2026-10-08 (latest)

- Owner asked to professionally fill the existing labelled demonstration consultant. Normal Cognito sign-in used the current private rotated access, not the retired shared password; no reset or new credentials. Saved 11 content/list fields through authenticated `PUT /consultants/me`: headline, biography, illustrative experience/education, languages, specializations, intended clients, consultation topics, work approach and tags. Kept the example name and explicit fictional-person/AI-portrait disclosure; no real employers, qualifications, ratings or outcomes claimed.
- Authenticated saved-profile readback and separate anonymous public readback match all 11 fields. Protected profile/media/price/membership/visibility fields, account privileges/points and existing booking records compare unchanged before/after. Only the newly created refresh session was revoked; no global sign-out, business-state repair, direct DynamoDB writes, email/messages, purchases or entitlement changes. Credentials/tokens remain out of public artifacts; a private content backup is retained for recovery.
- Stored profile completion is **100%** using existing fields and two pre-existing stored availability entries. There are **zero future bookable slots**; the live booking action is correctly disabled. No invented future availability was added just to make this fictional example bookable.
- Filling longer content exposed frontend omissions: the hero repeated the entire biography, newlines collapsed, and the saved `workApproach` was not shown publicly. Shared public-profile rendering now caps the header at 190 characters with the existing helper, keeps full escaped multiline biography/experience below and conditionally renders actual consultation approach. Empty approach fields do not invent a provider promise.
- Final suite **280/280**, no skips, plus build/theme/TypeScript, secret guard and diff checks pass. Three new rendering regressions cover the actual hero expression/fallbacks, escaped multiline content and optional approach. Source `dccf6ffe` pushed, CI/legacy Pages successful; existing CloudFront deployment/invalidation complete. Production HTML, six JS/CSS chunks and four preserved owner media files match MIME/full bytes (11/11); fresh smoke **19/19 www**, **20/20 CloudFront**, final TLS/redirect gate **4/4** after one earlier HTTP-apex timeout.
- Local same-origin, public-read-only API proxy and fresh native-origin browser checks pass at 390/1440px light/dark: portrait loaded, clear example label, bounded header, full paragraph formatting/session guide, no overflow and disabled unavailable booking. Temporary viewport restored and owned local servers stopped; no production CORS/CSP/DNS/infra changes. An occupied local proxy port and CSP-blocked cross-port QA request were setup issues, corrected with an OS-assigned port and a same-origin Vite proxy without loosening CSP. No fresh authenticated booking/chat/file/admin, payment or launch certification in this content pass.

## Portrait-first Spotlight banner — 2026-10-08

- Owner reported a text-only demonstration banner. Root cause: `SpotlightShowcase.tsx` displayed only optional `heroUrl`, ignoring the existing, working API portrait. Fixed the shared Spotlight card rather than modifying accounts or restoring retired static examples.
- Large portrait + actual specialization tags + profile CTA; optional cover complements the portrait. Separate URL-keyed avatar/cover failures leave initials, copy, disclosure and link usable, and recover when image URLs refresh. “Пример” stays in the profile name/headline; no fabricated reviews or expertise. Uses existing media, CSS tokens and routes, without new dependencies/services.
- Final local suite **277/277**, no skips; build/theme/TypeScript, public secret guard and diff checks pass. Six targeted regressions cover avatar-only, cover+avatar, missing/failed media, refreshed URL recovery, tier filtering and actual topic/disclosure/link preservation. Local public-read API proxy checks at 320/390/768/1440px light/dark pass: loaded portrait, no overflow, ≥44px CTA; keyboard profile navigation and simulated image-error fallback pass. No production CORS change or business writes.
- Source `baa993c7` pushed; CI and legacy Pages succeed. Existing CloudFront frontend deployment/invalidation complete. Production HTML, all six JS/CSS build chunks and four preserved owner media files pass MIME/full-byte comparisons (11/11). Fresh smoke **19/19 www**, **20/20 CloudFront**, TLS/redirects **4/4**. Fresh browser without interception verifies 390/1440px light/dark photo/layout/disclosure/topics/CTA and keyboard navigation to the correct public profile.
- Earlier local-proxy DNS/timeouts during cleanup and a QA attempt to use the desktop theme control while the mobile menu was closed were corrected with a fresh native-origin browser and the actual mobile menu. These were QA setup/selector failures, not new application defects. No account, authentication, email, booking, membership/payment, Terraform/backend/DNS changes. Existing launch gates below remain open.

## Simpler public discovery and homepage — 2026-10-08

- Public UX-only improvement: one primary homepage browse action plus a guide anchor and a free-client-profile note; six existing topic links in `HomeDiscovery.tsx`, three actual booking-request steps, native FAQs and one quiet expert contact action. No instant booking confirmation, blanket free-session claim, fake reviews/statistics or newly fabricated experts. Current expert joining remains invitation-only, so the public path leads to contacts rather than blocked self-signup. Existing demonstration profiles retain their visible example label.
- Directory now excludes profiles without a selected topic-keyword match; AI/CV are useful retained signals and generic skills tokens no longer make unrelated topics match. Existing expert-tier priority stays within the user's matching filters. Removed no-op “Водещи профили”; 4.5+ requires actual reviews and exposes its pressed state. Qualitative topic labels replace unexplained matching percentages. Keyword matching is not a suitability/qualification assessment.
- Query/city are local drafts; native form submission trims them and updates the URL once, rather than causing catalogue requests per keystroke. URL changes/back navigation restore submitted values. Result counts and resettable empty states explain what is shown. New sections use existing theme tokens, native links/details, mobile layouts and reduced-motion handling; no new libraries, media, backend routes, cloud services or recurring jobs.
- Final local verification passes **271/271 regressions**, no skips, plus build/theme/TypeScript, public secret guard and diff checks. A local production-mode browser with a read-only public API proxy verified home/directory at 320/360/390/768/1440px, light/dark (20 page/width/theme combinations): no overflow and all new targets ≥44px. Six topic links, selected pressed states, actual API empty recovery, guide anchor, FAQ Enter open/close, expert contacts and catalogue-to-public-profile navigation pass. Query/city typing causes zero catalogue GETs; trimmed submit causes exactly one GET and retains the topic, back restores inputs and reset clears filters. No production CORS change; telemetry POSTs suppressed.
- Separate empty/503 API fixtures preserve useful guide/topic navigation and avoid invented counts or dead ends. Reduced-motion topic transition is 0s and category scrolling respects the preference. Own QA selector/timing failures were corrected and re-tested; they were not product crashes. These are local browser/API-proxy and fixture results, not physical-device or deployed CORS proof. No customer-engagement/conversion uplift measured; no emails, authentication, account, booking or payment mutations were part of this UI work.
- Source `a5ea28bd` is pushed to main; CI and legacy Pages succeed. The existing S3/CloudFront frontend deployment and invalidation complete; fresh www smoke **19/19**, CloudFront **20/20** and full TLS/redirect domain gate **4/4** pass. Canonical HTML and all seven referenced entry/vendor/CSS/admin chunks match the reviewed production build. All four existing owner advertising media files pass MIME and full-file SHA-256 byte comparisons. No Terraform apply, backend/configuration or DNS change.
- Final live UI checks removed all proxy/fixture interception before using the native production origin. Homepage at 390/1440px light/dark shows six topics without overflow; guide anchor and FAQ Enter open/close pass. All six direct category links load through the real API with exactly one selected pressed state and no runtime errors; empty-topic recovery is visible. Career topic + query/city typing causes zero GETs, Enter causes one successful GET with trimmed CV query and retained topic; back restores fields and reset clears all filters. Mobile 390px dark directory fits, and its card opens the expected public-expert heading. The page-error listener recorded zero runtime errors in these flows. No authentication, emails or business-state mutations; public-read QA is not full launch certification or physical-device evidence.
- The 3 October launch gates and live lifecycle evidence below are retained, not newly re-tested or closed. Production payment, SES approval/customer delivery, operator/legal approval, completed real signup/social callbacks, natural seven-day purge, expert-booking purge and alert-subscription delivery remain independent. See `docs/qa-2026-10-08.md` for this public-UX pass and `docs/qa-2026-10-03.md` for the separate lifecycle release.

## Launch continuation and disposable identity QA — 2026-10-03 (earlier snapshot)

- Genuine owner-approved, suppressed-mail disposable external Cognito client lifecycle passes **8/8 live**: login/bootstrap/DynamoDB persistence; disabled fresh-login and old-token denial; automatic DynamoDB disable/enable convergence; re-enabled login/profile/bootstrap; deleted old-token denial; automatic user/referral cleanup; unavailable deleted public profile. The helper now uses Cognito's canonical username after exact identity verification. No manual DynamoDB repair or persistent supplied-account deletion; no real signup inbox, expert bookings or S3/file cleanup proved by this empty client.
- New backend/frontend scheduled-account deletion cancellation and atomic expert hiding pass shared **265/265 local regressions**, no skips, including stale-profile-generation protection. Frontend build/theme/TypeScript, secret guard/diff check, backend syntax and Terraform fmt/validate pass. Reviewed scoped backend apply completed1add1change0destroy (cancellation route + existing Lambda); Lambda Active/Successful, code hash matches archive, UAT false/credentials empty and anonymous cancellation401. Source33715795 pushed/CI+Pages passed; CloudFront deployment/invalidation completed, canonical HTML+seven entry/vendor/CSS/admin chunks match dist, fresh www19/19, CloudFront20/20 and domains4/4. Client cancellation/files now pass live as below; expert atomic hiding/restoration remains regression-only, not a paid expert live test.
- Separate genuine disposable client completed normal explicit current-terms bootstrap with no reward/membership; registered tiny PDF via signedPUT and downloaded via own normal API with matching bytes/MIME, plus one intentionally unregistered orphan upload. Normal DELETE twice preserved the same seven-day deadline; public profile404/edit403 while pending, own profile/export200. API cancel twice200 true/false cleared dates idempotently; all recorded business fields unchanged. Rescheduled, then actual mobile UI cancellationPOST200 removed panel; restored profile/export200 with unchanged business baseline. Actual390/1440 light/dark pending panel fits, mobile48px/desktop>44px actions. Separate source fixtures320/360/390/430/1440 light/dark pass failures/retry/expiry/export/logout; do not treat these as every real device or natural expiry proof.
- The private helper's RFCv4-only identifier guard was corrected to validate canonical Cognito-sub syntax plus exact ownership. Safely resumed the same untouched forced-change identity; no duplicate identity or manual DynamoDB repair. Final exact-owner external Cognito delete rejects old token401 ACCOUNT_UNAVAILABLE; automatic user/referral removal and both owned S3 prefixes empty (registered PDF + orphan removed), with no manual DynamoDB/S3 repair. Deleted-session dashboard reload redirects to sign-in, genuine sign-in heading shown and Cognito ID/access/refresh storage absent; two expected401 network entries, no React/runtime failure. All disposable identities from this pass removed, including a failed setup with no application record; persistent supplied accounts unchanged. Owned browser and one-use bridge closed/private journal credential cleared; fresh post-cleanup www smoke19/19. Natural seven-day timer and expert booking/file lifecycle remain untested live; no paid records, attendance, email or outbound messages fabricated.
- Fresh eu-west-1 SES read remains productionAccess false/review DENIED, sending enabled/enforcement HEALTHY, quota200/day1/sec. GrowPoint domain verified, DKIM SUCCESS/RSA2048 and all3 DNS CNAMEs match; deployed sender is under that domain. Bounce/complaint suppression and feedback forwarding enabled; no default configuration set, automatic delivery/feedback ingestion or SES reputation alarm. Public DMARC absent; custom MAIL FROM absent but aligned DKIM means it is not a mandatory prerequisite. Existing mailbox access/feedback operating procedure and actual inbox delivery need proof. Stored review website does not match current GrowPoint; authorized appeal should use current canonical site, without claiming that this caused denial.
- Cognito still uses COGNITO_DEFAULT for signup/verification mail, separate from Lambda platform SES. SES API acceptance does not prove delivery; suppressed disposable creation does not prove real signup verification mail. No SES support submission, message, email, DNS change or deployment was performed by the read-only SES audit. Support API case metadata is unavailable under current subscription; use authorized Support Center UI, not a paid support upgrade merely to read/reply. Exact operator/controller facts, recipient-consent/volume details and legal approval await owner answers.
- Genuine Google, Apple and LinkedIn provider handoffs reach blank sign-in pages, **not completed callbacks**. Do not authenticate provider accounts or publish OAuth URLs/private provider identifiers without the scoped owner handoff.
- Pre-apply full Terraform plan detected missing/expired SNS alert-email subscription drift (2add1change0destroy including subscription recreation); owner-monitored inbox/confirmation authorization awaits an answer. Root applied only the reviewed narrow cancellation-route/Lambda plan to avoid sending a confirmation. Fresh post-apply full plan now proposes **only** aws_sns_topic_subscription.alerts_email creation; no backend drift. SNS drift is held, not reconciled; do not claim zero overall drift. Private placeholder-only SES appeal/delivery checklist is kept under ignored owner-only output, not public docs; no request submitted or acknowledgement attested.
- Private legal/operator review draft covers actual export/data scope, retained booking identifiers as pseudonymous rather than automatically anonymous, necessary browser storage, third-party font requests, and contract/refund/retention rules. Exact operator facts and counsel/owner approval remain pending; no new policy published or compliance certified. Before real charging, counsel must review applicability of current online consumer-withdrawal functionality and durable acknowledgement requirements against official Bulgarian text; do not equate account-deletion cancellation with contract withdrawal.
- Architecture/payment baseline unchanged: production remains existing CloudFront/private S3; DSK public checkout remains preview, five earlier website fake-card cases and disabled sandbox documented separately. Paid billing/refunds/production approval, general email delivery, legal review and full social callbacks are still launch gates. Older notes claiming disposable lifecycle was entirely untested are superseded within the initial client-only8/8 and separate live client cancellation/files scope; natural seven-day purge and expert-booking cleanup are not certified. See docs/qa-2026-10-03.md for expected/actual and remaining evidence.

## Authorized credential remediation and website bank QA — 2026-10-01 (earlier snapshot)

- Owner explicitly approved rotation and session revocation on four supplied QA accounts, **not a history rewrite**. All four now use distinct private credentials stored outside Git with 0600 permissions. Never use the historical shared credential or publish replacement values, account lists or incident locators. The old credential is retired on these four accounts; any other reuse needs separate remediation. Exact incident evidence remains private outside Git; history cleanup still needs explicit owner approval.
- Cognito global signout plus the final server-owned numeric `authValidAfter` cutoff are live. Pre-cutoff JWTs return 401, old refresh tokens are rejected, and fresh profile reads return 200 on all four accounts. Business profiles/groups are unchanged; the exact-hash snapshot remains four users, two experts and three bookings. This supersedes earlier pending-rotation/no-live-cutoff notes below.
- Five complete **website** EUR 1 fake-card workflows pass: Visa 3DS frictionless and Mastercard 3DS challenge success return bank 2/action 0; Mastercard challenge rejection 6/-2025; wrong CVC and expiry 6/71015. Each starts with admin UI create 200, bank-hosted card entry and merchant return GET 200 matching independent bank status. Two earlier portal-only transactions remain separate historical provider evidence. No real funds, production entitlements, booking payment flags, membership or meeting access changed; no agent outbound messages/platform email sent. Authorized automatic sandbox bank notices may occur.
- Sixth case is **abandonment without card submission**, not bank cancellation: bank 0/action -100/application `created` and no bank cancel button. Bank status 3 remains untested. A missing Visa return showed bank 2 while app `created`; merchant return GET recovered success. Abandoned reload reused the same UUID with 1 GET/0 POST; duplicate successful creation reused gateway/version with 200; altered amount/currency 400 created no row. Forged browser success/paid flags were ignored, preserving created state.
- Fresh profile/bookings/notifications reads return 200 for all four supplied accounts; non-admin sandbox access 403 and anonymous 401. At 390px the sandbox panel has no overflow and 48px controls. These authenticated checks do not imply paid benefit fulfillment, destructive identity lifecycle, real email/social-provider flows or every device is certified.
- Local regressions 235/235, no skips. Source `09738bd6` CI and legacy Pages passed; production frontend deployment/invalidation completed. Prior domain 4/4 and smoke 19/19 canonical/20/20 CloudFront evidence remains separately recorded below. No new recurring/fixed-cost service was added.
- Private dossier completed: three-page PDF visually inspected, bank evidence ZIP has 24 allowlisted files with verified SHA-256 checksums, and six merchant-result screenshots reviewed for private-data disclosure. Six current private values (four replacement passwords plus sandbox username/password) compared against 213 tracked files and that ZIP have zero matches; this is not a repeat full-history audit. Owner submits evidence to DSK; no delivery is claimed. Keep all private filenames/paths, order references, card data, emails and credentials outside public documentation.
- **Final sandbox disable is verified**: UAT false, both deployed credentials empty, Lambda Active/Successful and code hash matches the tracked ZIP. Disable apply changed only that Lambda (0 added, 1 changed, 0 destroyed); post-apply Terraform shows no changes. Fresh canonical smoke 19/19, CloudFront 20/20 and domain gate 4/4 pass; live HTML, entry JS/CSS and admin chunk match the production build. Owned test browser is logged out/closed; one-use credential bridge closed and private browser bindings reset.
- Public payments remain labelled preview. Production approval, immutable prices/entitlement purchases, monthly billing/renewal/expiry, unattended reconciliation and refunds remain unimplemented/untested. SES production remains denied/sandboxed; legal/operator and disposable lifecycle/social tests remain separate launch gates. Website sandbox success is not production certification.

## Mobile, tier benefits, public Git audit and bank tests — 2026-10-01 (earlier snapshot)

- **Security launch blocker:** exact comparison found the supplied shared QA password in historical public Git blobs. Current public files/build and recovered archives do not contain it. Treat all accounts using it, especially admin, as compromised. Owner notified and asked to rotate, approve session revocation and decide history cleanup. No passwords, exact leak locators or private account list belong here. No credential changes, broad signout, account suspension or history rewrite were performed. Root's own consultant/admin sessions were logged out normally. Detailed evidence is private outside Git; public report states the blocker without exposing the credential or its locator.
- Authenticated bank tests paused immediately after this finding; the temporary UAT flag was reverted to false. Do not resume with the old credential. Keep private sandbox credentials owner-only, ignored and absent from Lambda when disabled. Never send messages/reports to the bank; the owner performs DSK step 6. Owner now explicitly allows **automatic sandbox bank notifications**, superseding the earlier notification blocker below.
- Effective API-session revocation now supports server-owned `user.authValidAfter` as a DynamoDB Number containing whole Unix seconds. All authenticated routes consistently read it; JWT iat <= cutoff or invalid marked-row metadata rejects401 ACCOUNT_UNAVAILABLE. Unmarked users/bootstrap remain unchanged and browser inputs cannot set/clear it. After explicit owner approval, revocation must include Cognito global signout **and** this cutoff; Cognito revoked JWTs may remain signature-valid for API Gateway otherwise. Sign in after the next second. No live cutoff was set in this task.
- User confirmed each expert **offers one free client session per month**, not receives a free expert consultation. Implemented first explicit client claim per expert / scheduled calendar month Europe/Sofia, same-row CAS combined with slot/booking transaction. Uses paymentStatus free / freeSessionSource monthly_offer, never paid or points. Future cancel/decline releases quota; started/attended session consumes it. Cross-month moves atomically release/claim; client deletion releases its future claim with retries and preserves unrelated claims. Public payload exposes only available month list, never quota map or private requests.
- Review + expert aggregates + existing 10-point review reward now share one guarded transaction; no artificial attendance/reviews were produced. Ordinary/monthly booking and benefit request transactions needed DynamoDB ConditionCheckItem IAM permission, which was missing. Live sandbox creation exposed AccessDenied; applied a same-table scoped permission fix and registration subsequently worked. Safe error diagnostics log only an allowlisted action name, never raw AWS/provider descriptions or private identifiers.
- Grow/Spotlight priority now survives catalogue and client-dashboard sorting within chosen filters. Active Spotlight has a personal homepage banner using public headline/hero, plus color controls gated by packageTier rather than old user.plan Pro. All tiers retain normal profile media. Spotlight own/admin panels track podcast/campaign and one non-cancelled room request per current/next Sofia quarter; one open podcast/campaign each. Admin schedules then records completion after scheduled time, or cancels. No actual venue or guaranteed date invented, no automatic messages or new recurring service. Four matching JWT Terraform routes reuse the existing Lambda/tables. Private requests follow existing export/deletion.
- Mobile hours editor uses native date + roomy time controls, grouped draft list, explicit local timezone, collapsed weekly generator, occupied-slot checks, clear/cancel behavior, draft-preserving failed saves and busy guards. 320/360/390/430/1440px light/dark fixtures pass with >=44px controls. Additional 320px public booking clipping fixed; Spotlight banner and mutually exclusive monthly/points choices checked with keyboard. These are isolated browser fixtures, not real booking/email/fulfillment writes.
- Real DSK provider tests: one Mastercard 3DS rejection (bank status6/action-2025) and one challenge success (status2/action0), both EUR1 fake-card portal transactions, independently bank-verified. Private owner JSON evidence/case index stored outside Git. No real card/funds, paid membership/booking/meeting state changed. Provider results do **not** certify the whole website payment flow.
- GrowPoint admin UAT registration initially failed IAM, then registered successfully but lost its checkout URL because the validator assumed a legacy merchant path. A single authorized probe before the security stop established bank-returned multiecom/payment.html with mdOrder+language. Exact allowlist/recovery fixed and tested; recovery derives this fixed UAT template only after the bank verifies reference/amount/currency/UUID and orderStatus0. No blind new registration or manual row backfill. Website redirect/card/return re-test remains blocked by credential rotation; Visa, invalid CVC/expiry and cancellation bank cases remain untested.
- Public secret controls tightened: broad docs/assets/build/client-env/template exclusions removed, false positives allowed only exact content + specific rule/file; environment failure output prints line location, not secret. Full reachable history, 44 ZIP snapshots and exact-value comparisons were audited. Three old ZIPs are truncated; recovered contents passed but completeness cannot be guaranteed. Current archive intact. Heuristic scan success did not catch the human-readable historical QA credential; explicit known-secret checks are essential. Private evidence CLI requires realpath-outside-repo + owner-only directory, sanitized errors, exclusive0600 output; six regressions use a fake adapter only.
- Production billing still not implemented: immutable price/entitlement purchases, monthly expiry/renewal, refunds and authoritative live payment reconciliation remain DSK integration work. SES remains sandboxed/production denied; legal operator and real venue policy need owner approval. Read-only smoke and local tests cannot certify these gates. README and current DSK/security reports are the handoff; earlier dated sections below are historical.
- Final local suite:234/234, no skips. Build/TypeScript/theme/backend/helper syntax, current public secret guard, Terraform format/validation and both production dependency audits pass. Live public monthly availability payload excludes quota/request data; 320px public booking in both themes fits and selecting the offer renders a free price without submitting.
- Release `89b8cdd9` pushed to main; CI and legacy Pages jobs both succeeded. Reviewed final Terraform apply updated only the existing Lambda (0 added, 1 changed, 0 destroyed); follow-up plan has no changes. Lambda is Active/Successful and its archive hash matches; UAT is disabled and both deployed credential fields are empty. CloudFront invalidation completed; live HTML, entry JS/CSS and both lazy admin chunks match release bytes. Final smoke passes 19/19 canonical and 20/20 CloudFront; HTTPS/redirects pass 4/4; all four new benefit routes return401 anonymously. Owned QA browser closed and private browser bindings cleared. No authenticated tests resumed after the credential finding; launch remains blocked, not certified by these passing checks.

## Hosting completion and DSK preflight — 2026-10-01 (earlier snapshot)

- Owner explicitly confirmed replacement of only the eight old apex GitHub Pages A/AAAA records. Removed exactly those eight, added one DNS-only apex CNAME to the existing CloudFront target, verified the saved record and independent public DNS/TLS. All seven mail records and both ACM validation records are preserved. Backup remains outside Git for manual rollback. Hosting gate now passes 4/4; production smoke 19/19. Both domains use CloudFront; old Pages certificate UI is no longer authoritative. This supersedes all apex-pending statements below.
- Owner requests DSK sandbox integration/checks and explicitly forbids agent outbound messages, including bank step 6. Existing sandbox account/credentials already exist; test merchant portal login succeeds. Do not create accounts/change operator credentials, send invoices/email, run real payments or accept provider terms without the appropriate owner handoff.
- Isolated admin UAT implementation is fixed to 1 EUR/100 minor units/978, bank-hosted card entry and strict UAT URL/return allowlists. Authoritative matching bank status is required; captured status 2/actionCode 0 is success, never browser query values. Orders use system# namespaces excluded from registration metrics, conditional idempotency/rate limits, active-owner checks and bounded recovery; no booking/membership/meeting-link or notification changes. Public preview stays mocked. No new recurring/fixed-cost service.
- Owner approved UAT-only credential configuration. Existing credentials were copied through native controls into a one-use loopback form, saved only in ignored owner-only private settings; not disclosed in source/docs/logs. Temporary listener/script/tab closed, password-saving prompts declined and credential clipboard replaced. Execution flag remains false. Terraform state/plans also contain private configuration and must never be committed/shared.
- Bank notification precondition is unresolved: owner approved temporarily clearing only sandbox merchant notification email, but the portal rejects an empty address and hides notification trigger controls. No settings were saved; original field restored. Do not create orders/submit card transactions until bank-side mail can be disabled. A read-only nonexistent-reference API lookup returned HTTP 200/errorCode 6/no order status; no order registration. This is connectivity evidence, not a successful transaction or full terminal certification.
- See docs/dsk-sandbox-preflight-2026-10-01.md for the sanitized owner handoff. Successful/failed bank transactions, 3DS evidence, callback/refund/production checks remain blocked/untested. Monthly paid membership expiry and immutable server prices are separate production requirements; current purchased logic is not a recurring/monthly billing implementation. Preserve existing admin-granted/comped/payment states.
- Final disabled release: 171/171 tests, no skips; build/theme/TypeScript/syntax/secrets, Terraform fmt/validate and both production dependency audits pass. Added force-staging guards for all tfvars/state/backups/plans; exact private-credential scan has zero public matches. Owner settings/state/backup and saved plans are owner-only. Sanitized sandbox summaries are in personal export; exact-owner cleanup runs before removing retryable identity state. Both delayed-registration/status race cases preserve validated bank identity/URL without overwriting newer proof.
- Reviewed apply completed: 3 added, 1 changed, 0 destroyed (JWT routes and existing Lambda only). Deployed UAT flag false and credential fields empty. Lambda Active/Successful, rebuilt archive hash matches; post-apply plan no changes. CloudFront invalidation complete, canonical HTML/entry assets/lazy admin chunks match, smoke 19/19 www and 20/20 preview, full domain gate 4/4. No new recurring/fixed-cost service.
- Fresh read-only account checks pass for all four supplied roles: login/profile/bookings/notifications, expert self-profile, admin metrics/disabled UAT config and personal export. Non-admin config 403; all anonymous new routes 401; disabled admin order creation 403 with no bank registration. Only new refresh sessions revoked, no global signout/account/payment mutation. One test-helper notification path was corrected to the actual /me/notifications route; no product change needed. Temporary QA helper removed. These are not newly repeated booking/chat/file mutations or disposable deletion proof.
- Application release 45c3fa5a is pushed/deployed. Its Actions build/regressions and Terraform validation pass; initial generic secret scan flagged ordinary refund/cancellation prose in the public DSK report (not a credential). Reword that sentence without weakening scanners or excluding more documentation; verify follow-up CI before final handoff. No further AWS deployment is needed for a documentation-only correction.

## Readiness continuation — 2026-10-01 (earlier evidence)

- Owner authorizes needed in-scope readiness fixes, reviewed Terraform apply and Git push. Preserve supplied accounts, existing bookings, memberships and payment status; DSK stays a non-charging preview. No new paid/always-on service. Explicit permission for one disposable lifecycle identity was asked and remains unanswered; do not infer it from persistence instructions.
- Mentor invite profileType is preserved from the trusted invite, not overridden by request data. Reminders track SES acceptance per recipient, retry only failed/skipped recipients at most four existing hourly attempts, and atomically deduplicate independent in-app notices. Historical reminderSentAt-only rows are not resent; rescheduling clears old reminder state. SES acceptance is not delivery or an exactly-once guarantee after an ambiguous network/write failure.
- Explicit terms metadata uses current terms/privacy version and a server timestamp. Hosting disclosure now names AWS S3/CloudFront, privacy revision is 2026-10-01 and the matching version is terms-2026-09-30+privacy-2026-10-01. Pending outdated agreement is cleared without losing profile fields or inventing latest consent. All newly bootstrapped identities without current explicit acceptance require agreement, including console-created/email users; existing accounts are not retrofitted. Protected APIs are blocked until acceptance, agreement loads before protected dashboard data, and private routes wait for initial profile check. Leaving without agreement signs out. Intercepted browser fixtures are not real legal/provider acceptance.
- Consent/legacy browser fixtures pass at 1440/390 with no JS errors/overflow: pending agreement cannot trigger protected data reads, checkbox initially unchecked, save/reload persistence, Escape/decline logout with no write and inert cleanup, legacy accounts usable despite unrelated stale local flag. Owned fixture browser/server closed. Full suite now 129/129 after the CloudFront media/cache, smoke MIME, calendar and consent-version regressions; both production dependency audits clean; final build/theme/TypeScript/secrets pass. Public booking calendar no longer clips the bottom of time buttons; desktop/mobile light/dark fixtures confirm complete buttons and selection. The consultant editor's scrolling rule is unchanged.
- Further no-fixed-cost safeguards: HTTPS-only CV/frontend bucket policies preserve AWS-service/OAC traffic; SendEmail limited to verified domain identity and exact configured sender, GetAccount remains separate wildcard; all three DynamoDB tables have native deletion protection in addition to Terraform prevent_destroy; canonical CloudFront function also attached to assets. CV bucket had no prior policy, so new deny does not overwrite other policy rules. No automatic old-version deletion or concurrency/MFA change added. One visible regional CloudTrail exists, GrowPoint lifecycle only; no extra visible trail copy. API throttling/budget alerts are not hard spend caps.
- Retired unsafe --live-mutate/smoke:prod:live: it fabricated packages/attendance and manually erased data, masking synchronization failures. npm run qa:identity is zero-request by default; both --live-identity and --allow-disposable require explicit owner approval. The new client-only script checks login/bootstrap, disable/enable, old-token rejection and exact DynamoDB/referral cleanup with bounded observations, never manual row repair. S3/files, expert booking cleanup, social callbacks and recipient mail remain outside its proof.
- CloudFront deploy now publishes assets first, keeps old hashed chunks for open tabs and invalidates all routes with one wildcard. Only hashed JS/CSS are immutable; stable assets revalidate after 300 seconds. CloudFront builds now include all four existing owner advertisement files: their previously missing URLs returned SPA HTML despite HTTP 200. All four media MIME types/bytes match their sources, and browser decoding/video playback passes. The strengthened HEAD-only smoke rejects SPA HTML masquerading as missing JS/CSS/media: current www 19/19, CloudFront 20/20. Actual AWS CloudFront runtime canonical query test passes.
- Cloudflare is already signed in in Safari; no new API credential/token was created. Added only missing SES verification TXT; existing DKIM records preserved. Domain and DKIM now verify successfully. A single synthetic AWS simulator email was accepted, not real recipient delivery; SES production review remains DENIED/sandboxed. Private tfvars and deployed Lambda sender now use the existing advertised support address. Cognito default verification sender remains independent.
- Reviewed continuation apply completed: 1 added, 8 changed, 0 destroyed (new CV bucket policy plus in-place existing resources); separate certificate-request apply: 1 added, 0 destroyed. No pool/table replacement; aliases remain empty. Lambda Active/Successful, code hash and ZIP handler match source; all three tables ACTIVE/on-demand/natively protected; post-apply plan has no changes. Deployed bucket/OAC/SES policies verified; IAM simulation allows expected sender/domain and denies wrong sender/identity. Version the already tracked rebuilt ZIP with source. No new AWS service introduced.
- Owner explicitly approved finishing existing CloudFront cutover. Both ACM DNS-only validation CNAMEs are published, both validations succeed and the certificate is ISSUED. Reviewed saved apply completed: 1 added, 1 changed, 0 destroyed; the deferred frontend bucket policy remained semantically unchanged. The existing distribution is Deployed with apex/www aliases and TLSv1.2_2021. Strict origin TLS checks pass for both domains; canonical redirects preserve encoded/repeated query parameters. Only www DNS was switched to DNS-only CloudFront and its saved target was verified. Apex still uses the eight old Pages A/AAAA records: domain gate remains 2/4 until action-time deletion confirmation and replacement. Never confuse successful www migration with completed apex migration.
- Outstanding owner inputs: SES rejection/review and real inbox proof, SNS confirmation, disposable QA permission, actual operator/controller registration/address/privacy contact and approved cancellation/refund/retention/legal bases. Basic AWS Support API is unavailable on this account; no support reply or new production-access request was submitted. See docs/qa-2026-09-30.md for current evidence.
- Release d66b103f pushed; GitHub CI and Pages succeeded. Live www root/current expert HTML and referenced JS/CSS match release bytes; required-profile smoke 14/14. All four supplied account API logins/profile/bookings/notifications pass; expert profile 200, admin metrics 200 only for admin and 403 for others. Only newly created refresh sessions revoked, no global signout or deliberate account/payment edits. Preview client browser private routes work without agreement modal; native API profile/notification reads 200. Payment and destructive identity workflows were not used to manufacture live proof.
- Owner reports long-stuck Pages certificate screen. Fresh Pages API confirms bad_authz, expiry 6 September, HTTPS enforcement false. GitHub health sees www proxied/Cloudflare IPs/not HTTPS-eligible; apex A/AAAA correct, no CAA restriction. Treat proxy/ACME interaction as leading blocker, not a proved individual challenge trace. Do not disable www proxy while GitHub origin certificate is expired. Fresh AWS certificate validation remains the planned no-outage path before cutover.
- Earlier locked/window-switching attempts were superseded by the owner's ready Cloudflare window: both validation records were saved, and a DNS zone export was downloaded outside the repository for rollback. No credential or unrelated mail/DNS record was changed. Replacing the eight old apex Pages A/AAAA records still needs action-time deletion confirmation, requested after verified CloudFront HTTPS. Do not infer that confirmation from the new AGENTS instructions.
- Final matching consent backend apply completed: 0 added, 1 changed, 0 destroyed. Lambda Active/Successful, code hash matches rebuilt tracked ZIP; post-apply plan has no changes. Final CloudFront frontend is deployed, invalidation complete; canonical www HTML and all referenced JS/CSS match final build bytes. Read-only smoke passes 19/19 www and 20/20 raw CloudFront, with public-profile check required. All four supplied accounts repeat successful login/profile/bookings/notifications; expert self-profile 200, admin metrics 200 only for admin and 403 otherwise. Only new refresh sessions revoked; no global signout or account-state edits. No new fixed-cost or recurring service introduced.
- Application release 641f42e5 pushed to main; GitHub CI passed. www presents a trusted Amazon certificate valid through 15 April 2027; DNS-only routing and issued ACM validation records support managed renewal. Do not interpret the old GitHub Pages certificate screen as the www serving certificate anymore. Apex still needs its specific DNS record replacement confirmation; no old apex record has been deleted.
- Final canonical-www browser checks pass at 1440/390: existing client login, Dashboard/Messages/Files/Notifications, corrected mobile links, no unexpected agreement/errors/overflow, logout token clearance and protected-route redirect. Public calendar passes desktop/mobile light/dark without CSS injection; privacy disclosure/date are correct; fresh unavailable profile returns SPA HTTP 200 with unavailable UI/noindex. Empty Messages proves only its empty state; earlier mutation workflows are separately recorded. No application writes in this final browser run. Owned browser and one-use loopback credential helper are closed; temporary input is deleted, no listener or saved credentials remain.

## Launch review — 2026-09-30

- Owner requests fresh whole-site QA, minimal fixes and an agent-managed Git push. Prior Terraform apply authority remains applicable. Never replace the existing Cognito pool or destroy any application table. No new always-on service or recurring job is introduced.
- Review corrections: signup incorrectly checked temporary-password confirmation fields, so valid email signup never reached Cognito. Fixed with handler and isolated-browser proof. Social missing-profile repair is central/idempotent, preserves pending fields/provider defaults and flags onboarding once. Temporary-password confirmation uses its own fields.
- Session confirmation now merges concurrent participant writes, always applies payment-gated response serialization, and atomically credits points/its flag. Profile completion/referral rewards use atomic credit/flags. Invite failure retries are limited to the same identity/token; an existing clients-group identity gets explicit admin group-reassignment guidance before token consumption, then needs a fresh login.
- Targeted client/expert/admin updates preserve concurrent points, notifications, restrictions, reservations and review aggregation; document/access snapshots reject stale edits. Actual S3 document size enforces quota; signed PUT binds Content-Length. Notification marking/trimming retries concurrent appends. Booking transactions check active identities/application state, with the same five-minute cutoff in public calendars. Duration changes with active reservations and rescheduling of attended/past sessions are rejected; overlap checks use stored booking duration.
- Lifecycle disable/enable reconciliation retries each affected row after partial failures. Slug removal precedes anonymization so a failed deletion stays retryable. Cognito has deletion protection; all DynamoDB tables have prevent_destroy. Existing Lambda log group is adopted with 30-day retention; older entries become eligible for expiration.
- UI fixes: shared dialog isolation includes textarea/select and ignores inert parent dialogs; Files/Notifications failures are visible/retryable; notification single-read stays single; real data export now has a button; stale next-available dates removed; public chip text wraps. No claims of delivered emails without proof.
- Static expert HTML contains generic metadata only, avoiding new per-person data in build/Git history. Live unavailable/hidden profiles clear identity metadata. Existing historical Git/cache copies are not erased automatically. GitHub Pages still needs a rebuild or SPA-aware hosting for native HTTP 200 on arbitrary new expert/member routes; current known expert path passes.
- Live supplied-account QA: profiles persist; one newly labelled booking requested/accepted/rescheduled/reconfirmed; two-way chat updates expert's open thread without reload. Synthetic document uploads/shares/downloads with matching content, revokes in fresh expert data. Unrelated client receives 403 for document/chat/reschedule/admin endpoints. Calendar export works and unpaid meeting link remains hidden. Single-notification read persists. Admin metrics 200 and unified legacy redirect/mobile views work. Keep memberships/payment state and unrelated bookings unchanged.
- Public route matrix: 19 destinations at 1440px/390px, 38 checks, no document overflow or uncaught page exceptions; local fixes separately address clipped chips and pricing alias HTTP status. Light/dark public screenshots inspected. Payment preview has no card fields/API writes and explicitly reports mockup.
- Blocking operational findings: SES ProductionAccessEnabled=false and production review DENIED. Domain/sender unverified; DKIM status FAILED though CNAMEs match, verification TXT differs. Cloudflare manages DNS; no matching Route53 zone. Owner must repair DNS/verification, resolve SES rejection and prove general email delivery. SNS unconfirmed subscription expired; recreated subscription needs owner confirmation. Cognito default verification mail is separate from SES platform mail.
- Still unverified live: actual signup/invite recipient delivery/social callbacks, disposable disable/enable/delete, real attendance/reviews/reward redemption (do not fabricate payment or attendance), provider/legal readiness. Owner was asked for disposable QA authorization; persistent supplied accounts are never deleted. Operator/controller details must come from owner/legal reviewer, not assumptions. DSK remains intentionally pending.
- Current evidence and final deployment/test-data cleanup details: docs/qa-2026-09-30.md. Never put credentials, identities, private filenames/storage keys, signed URLs or production account contents in durable docs.
- Deployment completed: reviewed Terraform apply imported the existing log group, added the expired alert subscription again and changed three resources in place; zero destroyed. Lambda Active/Successful and code hash matches tracked ZIP; fresh plan no changes. Commit the already tracked rebuilt ZIP with source. SNS still awaits confirmation.
- Final backend gates: 89/89 tests, build/theme/TypeScript/syntax/secrets/Terraform checks pass; both dependency audits clean; post-apply smoke 14/14. Deployed expert save/upload, client file removal/chat/cancellation pass. Signed-length mismatch 403, invalid upload declarations/future-session confirmation 400. New QA booking cancelled/unpaid, archived chat GET 200 / POST 400, client points unchanged. Only two newly uploaded synthetic files removed; prior document and unrelated bookings retained. Demonstration future slots retained without active QA reservation.
- Release 049206ba pushed; CI/Pages succeeded. Live root/pricing/current expert/JS/CSS match release bytes; required-public-profile smoke 14/14; deployed mobile chips/archive read-only UI and export API pass. Final docs follow-up records this evidence; application assets remain unchanged.
- All four authenticated QA sessions signed out; identity tokens absent and unauthenticated profile endpoint returns 401. Only this run's browser sessions/local dev server are closed during cleanup; no other user's browser state is targeted.
- New launch blockers: apex HTTPS certificate expired 6 September; Pages API certificate state bad_authz, HTTPS enforcement false. www Cloudflare edge certificate is valid but HTTP apex redirects to HTTP www and HTTP www serves content. npm run check:launch-domains must pass 4/4; currently 1/4. Do not weaken TLS or reset the working custom domain before correct DNS/target verification.
- GitHub Pages commercial-transaction policy makes it unsuitable for this paid marketplace (business-model inference from official policy). Existing CloudFront has no custom aliases; current GrowPoint ACM certificates failed validation/time out and their DNS validation CNAMEs are absent. Owner Cloudflare DNS access is needed for fresh us-east-1 ACM validation, verified existing S3/CloudFront SPA deployment and deliberate cutover; no paid always-on service is necessary. Do not claim launch ready while TLS/HTTP or hosting gates fail.

## Latest functionality corrections — 2026-09-10

### Authorized deployment follow-up

- Owner explicitly authorized Terraform apply and push after the correction pass. Reviewed a saved plan and applied it: Lambda code updated in place, existing alert topic gained an email subscription, zero destroyed resources. Cognito pool and DynamoDB tables unchanged.
- Verified Lambda Active/Successful and deployed code hash equal to the reviewed package; ZIP handler matches source. Post-apply Terraform plan has no changes; post-apply live smoke 14/14. Backend rollout is no longer pending; full authenticated lifecycle retesting remains pending.
- Alert email subscription PendingConfirmation=true; owner must confirm the subscription email. SES rechecked on 10 September: sending enabled, production access disabled. No SES production-access request was submitted.
- Terraform regenerated the already tracked Lambda ZIP. Commit that deployment artifact and safe documentation only; never commit the plan, state, tfvars or credentials. Earlier notes about excluding the pre-existing ZIP describe the earlier frontend-only pass, not this explicitly authorized backend deployment.

### Earlier correction pass (before deployment)

- User explicitly requested fixes and push. That pass rebuilt/pushed the frontend without AWS apply or production data mutation, and excluded the pre-existing generated Lambda ZIP.
- Local tests 48/48, build, TypeScript, Lambda syntax, Terraform validate and secret scan pass. Frontend/backend production dependency audits report zero vulnerabilities. Live smoke now 14/14, including the expert detail document; old 404 is resolved in the live site. See `docs/qa-2026-09-10.md`.
- Prior fixes are present: current expert-completeness scoring, public occupied-slot filtering, conditional reservation-list writes and profile-write guards, shared first-use profile repair, group-role reconciliation on profile reads. These do not imply all backend behavior has been deployed or live-certified.
- Additional fixes: archived chat GET allowed for participants with existing history; POST still confirmed-only. GET now returns optional status. Both chat UIs update without reload, pause hidden/closed conversations, back off errors and avoid polling archives. Late reads/sends cannot contaminate a newly selected thread. Loading failures show retry instead of a false empty inbox.
- Dashboard awaits profile repair before role-dependent reads. Concurrent first bootstrap conditionally creates rather than overwrites. Missing expert draft initializes privately with no paid entitlement or membership bypass.
- Browser fixtures verified Messages/dashboard live refresh, archive read-only UI, delayed-send conversation isolation, visible failed-load retry and 390px no-overflow layout. No uncaught page exceptions. Local fixtures do not count as new live authenticated backend proof.
- Remaining owner rollout: backend plan/apply, deployed lifecycle and chat regression, SES production approval/general-recipient email delivery (sandbox last verified 8 September), social-provider callback checks. Payments intentionally stay mocked. Do not certify entire production readiness from build/smoke alone.

## Latest scoped live QA — 2026-09-08

- See `docs/qa-2026-09-08.md`. This QA-only pass changed documentation and explicitly authorized test data, not application code, memberships, payment state or deployment. Owner handles publication/AWS apply.
- Current regression result is **39/40**, not the older 40-pass claim: `getCanonicalConsultantScore` still calls removed `isConsultantProfileReadyForAutoApprove`. Production smoke **13/14**: one public expert API works, but direct detail-page document returns 404. TypeScript, backend syntax and secret scan pass.
- Second supplied client was filled in the preceding portion of this run with a labelled fictional profile and AI portrait; 100% completion and 20 points persisted. Never record credentials, emails, identity IDs, tokens or private storage keys in durable docs.
- One newly labelled QA booking was created, accepted by the authorized expert, rescheduled to another published slot, then cancelled by its client. Final state cancelled/unpaid, points unchanged. Pre-existing unrelated booking remains pending at original time. Cancelled QA booking/messages remain as audit data; do not delete unrelated records or falsify metrics.
- Two UI chat sends returned 201 and persisted. Expert open thread, including hide/reopen, stayed stale until full page reload. Fresh reload displays both messages. This is a remaining UX issue, not full real-time chat proof.
- Synthetic document shared through UI, downloaded by expert with correct content, then unshared. Fresh expert booking data contains zero shared files. Previously issued S3 document links have a 900-second TTL; immediate revocation of those URLs was not demonstrated. Synthetic document remains private. Unrelated client receives 403 for QA chat and admin metrics.
- Public calendar/reschedule list still offers occupied pending-booking slot; backend correctly rejects overlap. Correct availability presentation without changing the unrelated booking.
- Payment preview has no card fields; clicking its action shows explicit mockup notice and no write requests were observed. No payment, grant, completion or review was fabricated.
- Admin metrics API 200: six Cognito identities, four linked application profiles. Different count populations; missing relationships not individually investigated. SES productionAccess=false, sendingEnabled=true; general email delivery remains unverified.
- 390px client/expert/admin checks found no horizontal overflow; dark mobile menu inspected and mobile messages route verified. Notification API contains lifecycle/message events; read-state and full accessibility matrix remain untested. See report for remaining release gates. No production-ready claim.
- All four QA sessions signed out successfully; stored identity tokens disappeared and protected dashboard navigation redirected to sign-in.

## Latest authenticated QA and demonstration policy — 2026-09-06

- Owner requested admin shown/hidden control and automatic publication at 100%. Added PUT /admin/consultants/{consultantId}/visibility with Cognito admin route, mode auto/shown/hidden, targeted conditional update and live identity check before explicit showing. Admin cards show completion and visibility selector; summaries use computed public eligibility, not raw flags. Explicit hiding wins on future saves.
- Fixed catalogue indexing: automatic publication sets isPublic=true AND profileStatus=approved (catalogue queries approved index). The 13-field completion meter now controls publication on profile save and package grant; active membership still required. Granting Start now records granted instead of clearing membership. Images optional with fallback, supplied URLs still validated. Existing complete hidden profiles are not bulk-mutated; use admin shown/auto or save after deployment. No account activation, AWS apply or push by this pass. 40 tests pass; deploy backend/new route before frontend.

- Production-readiness recheck: SES still ProductionAccessEnabled=false, SendingEnabled=true; public API catalogue empty. 34 regression tests pass, Terraform validates, frontend/backend production-dependency audits report zero vulnerabilities, secret scan passes. These do not certify launch. Smoke reporting corrected: empty-catalogue profile check is SKIP, not PASS (13 executed + 1 skipped); --require-public-profile fails explicitly. Automatic role reconciliation, live booking/chat/sharing, SES general delivery and disposable identity lifecycle remain release gates. No AWS mutation or deployment in this check.

- Owner requested a slick Apple-like overall feel. Shared CSS now uses native system typography, sage-accent rounded buttons, subtle pressed/hover feedback, segmented auth tabs, quieter navigation, translucent header and restrained card/modal shadows. Maintain light/dark --ui-* tokens, focus rings, red destructive actions, disabled styling, 44–48px control targets and reduced-motion overrides. No dependencies, backend changes or infrastructure added for this visual pass. Build output still needs normal publication.

- Second QA/fix pass: expert completion now counts 13 editable public fields, not hidden private occupation/age/bio or duplicated headline. Frontend helper and backend monitoring have parity tests for every missing field. A synthetic expert with no private fields reaches 100% in the actual dashboard. Requires both frontend and Lambda deployment; does not activate membership.
- Added /legal static alias with /terms canonical and noindex; FAQ now links directly to /terms. Expert form tolerates missing optional list fields rather than crashing. Checkout Shift+Tab from initial container focus stays inside; result action returns to checkout rather than doing nothing. Browser fixture checks passed without production writes.
- Repeated bootstrap now preserves saved name/portrait against stale JWT attributes unless explicitly supplied in the request. Regression covers both preservation and explicit edits. This does NOT yet solve automatic role reconciliation or missing-profile onboarding on all destinations; those remain open. Latest local suite: 34 tests; production read-only smoke: 14/14 with individual public profile skipped because catalogue is empty. README QA table distinguishes local/live/blocked scope.

- Follow-up requested implementation: mobile notification/message shortcuts now target /notifications and /messages. Portrait and checkout dialogs share focus trapping, background inertness, Escape dismissal and focus restoration. Header names load from the application profile once per session and update after successful client/expert saves; authentication remains Cognito-owned. No polling or infrastructure added.
- Card checkout is now bank-neutral (no “Payment with DSK” label), with order summary, card schemes and a clickable payment action that explicitly reports mockup/no payment. Still no card fields, payment requests, entitlements or paid state changes. This supersedes the earlier disabled-button preview description below.
- /terms contains all six owner-supplied card-payment clauses, explicitly conditional on live activation; maximum 4000 EUR and refunds to the same card are documented future-provider requirements, not implemented payment controls. Provider/legal confirmation is required before real checkout. Four requested UI fixes are local changes until owner publication; unrelated role/completion/SES blockers remain.

- User supplied two test accounts and authorized signing in, filling profiles, uploads and testing the client/expert workflows. Do not store their credentials, email addresses, tokens or private storage paths in public documentation. No new account was created; no password was changed.
- User reversed the static-example policy: remove the six frontend fictional cards/detail pages and use the supplied consultant account as the labelled demonstration instead. Removed static components/JSON/styles; old /examples/:id routes now redirect to /users and remain noindex. Portrait source files moved out of public assets into ignored recoverable QA output. The first/fourth AI portraits were uploaded through the actual expert/client forms and remain in S3.
- Both supplied accounts already existed in DynamoDB BEFORE this pass signed in. The expert's Cognito group was consultants but DynamoDB role was client. Normal login issued no bootstrap because /me/profile succeeded. Calling the existing POST /auth/bootstrap once as that account correctly synchronized the role and created an expert draft. No direct DynamoDB mutation was used. This is a diagnosed stale-role bug, not evidence that DynamoDB writes fail.
- Missing-account creation is currently dashboard-specific via fetchProfileWithRetry; returning an existing profile skips role synchronization. Login to other destinations does not guarantee bootstrap. A central, idempotent onboarding/role reconciliation fix is pending user direction; avoid replacing user-entered profile fields on routine session restoration.
- Client filled through all four UI steps, portrait saved/reloaded, completion 100%, exactly 20 completion points. Direct DynamoDB verification confirms role, saved fields, avatar key and QA document.
- Expert draft filled via UI: name includes Пример, biography explicitly fictional/AI/demo, slug growpoint-demo-consultant, topics/experience/languages/approach plus three slots on 2026-09-08/09/10 at 14:00 local browser time. Type switched to mentor, persisted across reload, then restored to consultant.
- Expert completion stays at 82% despite all exposed fields: frontend getProfileCompletion and backend monitoring.profileCompletion require occupation/age/private bio, while expert UI hides profile-basics. Do not silently fill hidden fields or claim 100%. Completion-criteria/UI fix pending.
- Expert has comped=false, no granted/purchased membership, isPublic=false; public API correctly returns 404. Asked owner for permission to activate a complimentary membership for this account only; no approval received yet. Public replacement, booking, acceptance/reschedule/cancel, two-party chat and shared-file/revocation tests remain blocked by this prerequisite. Do not bypass membership globally or invent paid state.
- Tested synthetic document upload/reload/owner download (byte-identical), temporary-file removal, unshared consultant access denied 403, own data export 200, client admin-metrics access denied 403. Main synthetic QA file retained for future sharing test; temporary extra file removed. No sensitive/real CV data uploaded.
- DKS preview on actual expert dashboard: zero card inputs/API writes, payment disabled, Escape closes, focus restored. No booking paid/completed, fake review or referral created. Account deletion was deliberately not tested on the supplied persistent accounts.
- Actual dashboards checked at 390/1440px: portraits loaded, no horizontal overflow. Public QA previously checked 18 routes at both sizes; /legal has direct HTTP 404 before SPA /terms redirect. Social buttons reach Google/Apple/LinkedIn sign-in; callback completion remains unverified.
- SES account read-only check still productionAccess=false, sendingEnabled=true; broad email delivery is not certified. No AWS apply/commit/push by this pass. Source replacement rebuilt locally, requires owner's publication. See docs/qa-2026-09-06.md for findings and scope.
- Local regression suite now has 29 passing tests after replacing four retired-example tests with two API-catalogue policy tests. TypeScript/theme/build pass; final secret scan and read-only smoke should be rerun after any further edits. Tests do not certify the blocked authenticated workflows.

## Current product and deployment decisions

- Bulgarian career marketplace: free clients; paid expert tiers Start 9.99, Grow 29.99, Spotlight 99.99 EUR/month. Expert onboarding is admin-invite/comped until real checkout. No manual approval step: active membership plus backend visibility/completeness rules.
- Public DSK payment remains a mock preview: no card fields/provider requests, payment changes or package activation. Default-off admin UAT is separate synthetic testing only; five website card flows and two historical portal cases passed after owner-approved credential remediation/automatic bank notices. Sandbox is verified disabled with empty deployed credentials and no Terraform drift. Keep public preview labels until production provider reconciliation/prices/monthly entitlement/refund/legal requirements pass.
- Management and statistics are ONE admin panel at /admin; /admin/dashboard redirects there for existing bookmarks. Existing Cognito admin authorization only. The earlier separate-password request was cancelled; never restore it or put credentials in documentation.
- Production apex and www.growpoint.bg use existing private S3/CloudFront with DNS-only Cloudflare records; apex redirects to canonical HTTPS www. Full domain gate passes 4/4 and the authorized exact old-record replacement is complete. GitHub remains source/CI and legacy Pages artifacts; a Git push alone does not publish the AWS frontend. Use npm run deploy:cloudfront, then verify invalidation, canonical bytes/assets/routes/TLS. Agent applies reviewed plans and pushes when authorized; current authorization includes both. Historical Pages-only, apex-pending and owner-only deployment claims are superseded.
- Protect DynamoDB tables and the existing Cognito pool from replacement. AWS provider 6.63 supports in-place pool friendly-name rename to growpoint-dev-users; the immutable pool ID must stay unchanged and prevent_destroy is enabled. Old provider 5.x would replace it. Secrets/state/tfvars stay ignored.
- User wants near-zero idle cost, not weakened access control. No new always-on services; on-demand DynamoDB, shared 15-minute admin snapshot and refresh lease, daily reconciliation inside existing hourly maintenance, regional write-management audit trail with 30-day retention and narrow EventBridge lifecycle filtering.
- Budget warns at about $1 actual / $5 forecast monthly account-wide; it is NOT a spending cap. Storage, PITR, alarms, domain and free-tier eligibility prevent promising $0.

## Implementation map

- Frontend React 18, React Router 7, Vite 6; Node 22 build/runtime. Most product UI remains src/app/legacy/SiteAppLegacy.tsx; routing/nav/notifications in AppShell.tsx.
- AdminPage is a lazy chunk and embeds MonitoringDashboardPage.tsx as its only metrics component. It covers account/role/completion, booking/payment, chat, email, invitation, document and 30-day activity statistics. Do not restore the old duplicate counters or separate navigation item.
- backend/api/index.cjs is route dispatch/business logic. New routes require matching Terraform API Gateway routes.
- identity.cjs validates current caller existence/enabled state on every authenticated API request, plus current admin group on admin routes. Public checks use ListUsers (not bulk AdminGetUser MAU activation), cached 60 seconds.
- account-lifecycle.cjs reconciles Cognito with DynamoDB and private S3; exact pool/sub required, authoritative absence check before deletion. CloudTrail records regional write-management events (excluding KMS/RDS Data API); EventBridge selects four Cognito operations. Trail management-event selectors cannot use eventName or eventSource Equals; the previous version failed at AWS apply. Daily fallback repairs missed events.
- External deletion removes private user/uploads, tombstones experts, anonymizes booking content, cancels future bookings, releases deleted-client slots with conditional list edits and retries, refunds other clients' points atomically. Self-service deletion retains seven-day grace. Direct DynamoDB edits are not a supported identity workflow.
- ListUsers is eventually consistent; events are not instant/guaranteed. Public HTTP cache 30 seconds; visible public pages refresh every minute/focus. Private requests check Cognito independently of event delivery. Explain this honestly; never promise instant synchronization.
- monitoring.cjs records aggregate lifetime/daily counters atomically. metrics-cache.cjs stores one shared snapshot in users table; no idle statistics scans. No personal messages/emails in aggregate payload.
- Email counters mean SES accepted/failed/skipped from deployment onward, not delivery and not Cognito verification emails. Visits are browser-session/day, not unique humans. Old chat history may be incomplete before cumulative counts.
- PaymentPlaceholder.tsx is portal-based, focus-managed, Escape-close, no backend mutation.
- use-public-refresh.ts handles visible/focus catalogue and profile refresh. API ACCOUNT_UNAVAILABLE triggers local sign-out.
- Tests use Node built-in test runner and stubbed SDK clients; no real AWS writes. tests/helpers/api-harness.cjs loads actual Lambda logic in VM.

## Work completed and evidence

- Removed 10 explicitly marked production example consultant records and their 10 matching slug claims earlier in this session; real accounts were not targeted. Latest dry-run found zero examples. Demo seed/avatar/availability jobs and generated sample routes removed. Recovery depends on existing DynamoDB PITR, not a separate export.
- Fixed filtered pagination, meeting-link privacy in client serialization, restricted/deletion guards, JSON-object validation, bootstrap field preservation, chat write conflicts and byte-size cap, email outcome reporting.
- Replaced Lottie with lightweight SVG and updated dependencies; clean warning-free production build. Root and backend npm audits report zero vulnerabilities.
- 25 regression tests passed at latest verification; TypeScript/theme/build and secret scan passed; Terraform fmt/validate passed without warnings. Latest plan: 0 add, 3 in-place changes (trail, pool friendly name, Lambda), 0 destroy. Read-only production smoke: 14/14 with an empty catalogue; individual profile check is not exercised when no real profiles exist. Re-run gates after further edits.
- Browser: anonymous admin dashboard redirects to auth; local deterministic fixtures used to verify dashboard/mobile/dark charts and DKS modal. Fixtures/screenshots are ignored output/playwright files, never production accounts. These checks do not prove deployed authenticated flows.
- Owner auto-committed changes during this session (HEAD observed 0a310dfe); preserve their work and recheck status/log before any future commit.
- Terraform plan is read-only; review final plan again before apply. Temporary plan is outside repo. A deployment archive under infra/terraform/.terraform-build was already tracked by an owner commit despite ignore rules; do not add future generated archives to Git.

## Remaining release gates and operational follow-ups

- Apply reviewed Terraform, publish fresh frontend artifacts, then explicitly test disposable-account Cognito disable/enable/delete end-to-end: event delivery, DynamoDB cleanup, public disappearance, old-session rejection and fallback. Local tests alone are not production certification.
- Verify SES production access and actual delivery to a non-verified recipient. Dashboard displays SES state; sandbox remains a potential launch blocker.
- Exercise deployed registration/invites, booking lifecycle, uploads, chat, points and role boundaries with explicitly disposable accounts. Default smoke is read-only; live-mutate requires deliberate authorization.
- DKS real integration remains intentionally pending provider details.
- Existing CloudWatch log retention was unset at inspection; choose an explicit retention policy with owner before long-term accumulation. Keep recovery protections. Budget alerts are not an automatic kill switch.
- Review residual legacy scaling/concurrency limitations as traffic grows: large handlers/UI, bounded scans, embedded histories. Do not claim all routes have exhaustive concurrency or browser test coverage.
- No new password or sensitive configuration belongs in README, memory, fixtures or bundle.

## Verification commands

npm test
npm run build
node --check backend/api/index.cjs
bash scripts/check-secrets.sh
npm audit
npm --prefix backend/api audit
terraform -chdir=infra/terraform fmt -check -recursive
terraform -chdir=infra/terraform validate
terraform -chdir=infra/terraform plan
npm run smoke:prod

Build regenerates root GitHub Pages assets/routes. Preserve unrelated changes. Render overlays with createPortal(document.body); add dark-theme overrides. No production CORS changes were needed for local fixture tests.

## Latest apply failure and count investigation (2026-09-05)

- Fixed invalid CloudTrail management selectors; AWS supports regional write-only selection, not eventName or Cognito eventSource Equals for trails. Corrected documentation about the broader S3 audit volume.
- Upgraded AWS provider to 6.63 for safe pool friendly-name rename. Added prevent_destroy, migrated deprecated GSI hash_key blocks to key_schema without changing keys. Verified plan must retain pool ID and all tables.
- Existing failed trail was tainted; verified it exists and removed the local taint to permit in-place repair. No AWS apply performed by agent.
- Live read-only inventory now shows 3 Cognito accounts, 0 linked DynamoDB user profiles, 0 active consultant/bookings records. This supersedes earlier one-expert smoke results; external state changed during the session. No account content dumped.
- Dashboard previously loaded only once in /admin and cached identity counts 15 minutes. Now refreshes on focus, reads current Cognito inventory per request, invalidates snapshot on identity changes, filters application profiles from the same inventory, and rejects unavailable/partial identity reads instead of substituting a misleading account count.
- Legacy inventory: three careerdoc-dev DynamoDB tables empty; old CV bucket 36 objects (~36.6 MB), old frontend bucket 35 objects (~1.45 MB), old Lambda log group ~1.66 MB. Live Lambda/table/CloudFront references point to growpoint resources. Files/logs have not been deleted or archived; determine retention before irreversible cleanup. Do not delete the Cognito pool.
- SES live check: ProductionAccess=false, SendingEnabled=true. Sandbox is a confirmed release limitation.
- Default production smoke must accept an empty real catalogue; never recreate mocks to satisfy a test.

## Homepage examples and website review — 2026-09-05 follow-up

- User now explicitly requests labelled homepage examples, superseding the earlier no-examples visual policy. Implemented three fictional display-only cards in ExampleProfileCards.tsx/example-profiles.json. Do not reintroduce Cognito/DynamoDB mock identities or fake ratings. Real experts take priority; examples fill remaining positions up to three only after a successful public-list load. Errors stay visible instead of being masked by examples.
- Example cards use local inline vector silhouettes, Example / Пример badges, illustrative prices, and an expandable disclosure. No booking/profile links; no stats pollution or extra cloud resources. Disappear when three real experts exist.
- Fixed active workspace copy that incorrectly required admin approval, leftover Stripe labels in admin, and inaccurate FAQ signup/document descriptions.
- Browser interaction found the mobile menu overlay covering its header close button. Added a close button inside the portalled menu, initial focus, Tab wrapping, focus restoration, and Escape dismissal. Homepage background refresh keeps example disclosures mounted.
- Booking lists and data export now paginate through DynamoDB query pages; unpaid links remain locked. Consultant booking lists no longer issue shared-document links for cancelled-only relationships.
- Added regression coverage for pagination/export privacy, cancelled-relationship document privacy, and non-bookable labelled example markup. Latest suite: 28 passing tests. Browser route checks: 12 paths at 390/1440 widths, no horizontal overflow or page errors, protected redirects and not-found page correct. Local browser public reads proxy the actual API without changing production CORS. Authenticated live mutation flows remain unverified.
- README and root deployment artifacts rebuilt; no AWS apply, GitHub push, or real/example account creation performed in this pass.

## Unified admin, complete examples and animation — latest 2026-09-05 update

This section supersedes the earlier three-silhouette/no-profile-link implementation above.

- User requested one admin panel, not two. /admin now contains management plus the full statistics component, with one metrics fetch loop. /admin/dashboard redirects to /admin. Admin group/endpoint authorization is unchanged; no new password or cloud resources.
- Six frontend-only fictional profiles, exactly one per persona category: career-leadership, business-entrepreneurship, ai-technology, communication-growth, finance, creative-practical. Each has a local AI portrait, biography, topics, illustrative experience/education, language/location, price, audience, session approach and outcomes.
- Home fills remaining showcase places up to three; /users has a separate six-category example section. Filters apply locally; recommended/top-only and API-error states do not show examples. Fixed null persona clearing so selecting all actually clears a category.
- Cards retain conspicuous Example / Пример labels and now link to dedicated /examples/:id pages. Pages are noindex, excluded from sitemap, and explicitly fictional/unbookable. No real profile/booking/payment/message endpoint receives fixture IDs. No Cognito or DynamoDB example identities are created; statistics remain real-data-only.
- Portrait source assets: public/assets/examples/portrait-1.jpg through portrait-6.jpg, optimized 720px JPEGs. Built-in image generation; prompt/provenance in docs/example-portraits.md. Build copies files and six detail routes to repository root for GitHub Pages.
- HeroAnimation.tsx uses lightweight animated SVG, not a Lottie dependency: card/orb movement, drawing curve/check, progress and typing dots. Pauses offscreen/hidden tab and respects prefers-reduced-motion. No new external runtime or recurring AWS cost.
- README now documents the single panel, display-only examples, GitHub Mermaid architecture, identity lifecycle, session workflow, cost safeguards and launch limitations without secret configuration.
- This pass changes frontend/docs/tests only. No AWS apply, production account creation, Git commit or push. The existing owner-modified Terraform deployment archive is untouched.
- Verification for this pass: 31 isolated tests pass; warning-free TypeScript/theme/build, backend syntax and secret scan pass. Browser verified one example per category, all-filter reset, three homepage examples, all six detailed pages at 390/1440px with loaded portraits/no overflow/noindex, reduced-motion/offscreen animation pausing, and anonymous legacy-admin redirect. Live API proxy timed out, so these UI checks used a local empty-catalogue response; do not report them as deployed authenticated end-to-end evidence.

## Historical review archive

The following May/June notes are retained verbatim. They contain obsolete findings (no tests, old approval model, prototype statuses, missing implemented features, old file sizes and transient deployment issues). Verify against current code before acting; use the current section above as authority.

# GrowPoint Production Readiness Memory

Review date: 2026-05-06
Domain migration review: 2026-06-04
Production-readiness follow-up: 2026-06-04
Implementation pass: 2026-06-05
Production collaboration pass: 2026-06-06
Production route/visibility fix pass: 2026-06-06
Workspace: `/Users/privileged/Projects/growpoint.bg/growpoint.bg`

This file is the working memory for taking GrowPoint from early-stage prototype to a professional, production-ready user test. It should be used as the execution plan in future implementation sessions.

## Product Intent

GrowPoint is a two-sided career platform:

- Clients/professionals create a profile, upload a CV, browse consultants or mentors, and request a session.
- Consultants/mentors create a public profile, manage presentation/media/availability, and receive booking requests.

Current deployment model:

- React + Vite SPA at `https://www.growpoint.bg/` using `BrowserRouter`.
- AWS Cognito for auth.
- AWS HTTP API Gateway + Lambda + DynamoDB + S3 for backend.
- Terraform for AWS infrastructure.
- GitHub Pages root `index.html`, generated route copies, `sitemap.xml`, `robots.txt`, and `assets/` are deployment artifacts.

Latest production decisions:

- Brand is GrowPoint everywhere user-facing; old CareerLane references should remain only in archival notes or stale-cache cleanup.
- Public/contact email channels are `contactus@growpoint.bg` and `partners@growpoint.bg`.
- Pricing is EUR-only in the UI/API contract (`priceEur`) and should display as clean 50 EUR tiers with no cents. Legacy `priceBgn` records are converted at read time, rounded up to the nearest 50 EUR, and removed on the next consultant save.
- Registration has two roles only: user/professional or expert profile. Consultant vs mentor is chosen later in the profile editor.
- Confirmation-code resend must use Cognito `resendSignUpCode`; do not call `signUp` again from "Изпрати нов код".
- Cognito signup verification currently uses the built-in Cognito sender so code delivery is not blocked by an unverified SES identity. Set `cognito_ses_from_email` only after `contactus@growpoint.bg` or the GrowPoint domain is verified in SES `eu-west-1`.
- Platform notification emails from the Lambda still require `ses_from_email` to be a verified SES identity in `eu-west-1`. The email templates are GrowPoint-branded, but delivery depends on SES verification.
- Users can choose light/dark site theme through `growpoint.theme` in local storage.
- White/light theme is the default for first-time visitors; dark mode is used only after the user explicitly saves that preference.
- The desktop theme toggle belongs at the far right of the header, after `Изход` or `Вход / Регистрация`.
- Uploaded profile photos should open in a full-screen, accessible lightbox from profile/dashboard/edit-preview surfaces. Directory cards remain navigation links unless their card structure is explicitly refactored.
- Cognito login must handle the temporary-password/new-password-required challenge with a dedicated password-change screen, separate from forgotten-password email-code reset.
- The temporary-password/new-password-required screen must collect the new password twice before submitting to Cognito.
- Admin Cognito users are management-only accounts. They should use `/admin` for approval/deletion/messaging workflows and should not be forced through `/me/profile` or a normal user dashboard.
- Consultant profile ownership is one-profile-per-consultant. If duplicate DynamoDB consultant rows exist for one owner, frontend/backend/admin should use the most complete, latest canonical profile and not an old empty draft.
- In-app notifications now cover booking requests, status changes, reminders, session confirmations, booking-thread messages, admin messages, and received reviews. Notifications are stored on the user profile and capped to the latest 50.
- Booking messages are scoped to the booking record, capped to the latest 200 messages, and are available only to the client and consultant owner after the booking is confirmed.
- User document sharing is allowed only with consultants/mentors from confirmed sessions. The frontend only offers confirmed-session targets, and the backend rejects manual sharing to unrelated consultant IDs.
- Reviews require a confirmed booking, the session time to have passed, and both the client and consultant to confirm that the session was held. The review window remains 60 days after session end.
- Admins can message consultant/mentor profile owners from the admin panel. Messages are delivered as in-app notifications and mirrored by email when SES is configured.
- Backend Lambda routes are not enough for production: every user-facing endpoint must also have a matching API Gateway route in `infra/terraform/main.tf`. Missing API Gateway routes caused production clicks for booking messages and "Потвърди проведена сесия" to fail before reaching Lambda.
- Manual admin approval is authoritative for public visibility. Once an admin approves a consultant/mentor profile, the public profile should appear if the record is sane, even if automated profile-completeness heuristics would not auto-approve it.
- Cyrillic consultant slugs must be URL-encoded by the frontend API client and decoded/normalized by the backend before DynamoDB slug lookup. This keeps routes like `/consultants/димитър-менторски` stable on `www.growpoint.bg`.
- Logged-in non-admin users should see top-bar notification and message indicators. The notification bell links to `/dashboard#notifications`; the message indicator links to `/dashboard#sessions` and counts unread `message_received` notifications.
- Subtle animated particles may be used only as optimized public-page background polish. They must stay out of admin/dashboard work surfaces, pause in hidden tabs, and respect reduced-motion preferences.
- Backend emails use direct BrowserRouter URLs such as `/dashboard/` and `/users/`, not old hash routes.
- DynamoDB now has point-in-time recovery enabled in Terraform, and public consultant listing can use `profile-status-index` with bounded-scan fallback during rollout.
- `www.growpoint.bg` is the canonical GitHub Pages domain. Direct `https://growpoint.bg/` currently fails TLS before redirect; fix the apex GitHub Pages certificate/DNS setup before public launch.

Important user preference from the review:

- Keep the hero picture / top-consultant visual from the start page. The user likes that strong image-led consultant spotlight.
- Improve it into a first-viewport decision experience with two clear choices:
  - "I need a consultation / mentorship"
  - "I am a consultant / mentor"
- Do not remove the top-consultant hero concept. Refine it so the image supports the product message instead of hiding it.

## Validation Performed During Review

Commands run:

- `npm run build` - passed.
- `node --check backend/api/index.cjs` - passed.
- `terraform validate` from `infra/terraform` - passed.
- `terraform fmt -check -diff` - failed because `infra/terraform/main.tf` needs formatting alignment only.
- `npm --prefix backend/api ls --depth=0` - backend dependencies resolved.

Legacy nested test paths were retired when the app moved to `www.growpoint.bg`.
Current root-domain smoke checks use:

- `http://127.0.0.1:8000/`
- `http://127.0.0.1:8000/users/`
- `https://www.growpoint.bg/`

Observed:

- App loads and is not blank.
- No Vite/React error overlay.
- Directory keyword filter works and updates the URL, for example `/users/?q=Product`.
- Console shows React Router v7 future flag warnings only.
- Mobile/narrow layout has real visual issues around hierarchy, oversized headings, header wrapping, card dominance, and route-transition fade timing.

## Highest Priority Product/UI Findings

1. The first viewport does not clearly explain the two-sided product.

The homepage currently lets the consultant spotlight card dominate the top of the mobile viewport. The image is liked and should stay, but the top screen needs a clearer split:

- Primary path for users: find a consultant or mentor.
- Primary path for consultants/mentors: create a public profile.
- Supporting spotlight: show top consultant with image, trust signals, next available slot, and CTA.

Desired result: a new visitor understands in 5 seconds what the product is, which role they are, and what to click.

2. Responsive typography is not production-grade yet.

Several Bulgarian headings wrap into awkward tall stacks on narrow screens, especially auth and users pages. Current CSS uses very large hero type, tight line-height, negative letter-spacing, and narrow `max-width` values. Fix by introducing page-specific responsive heading scales and wider text measures on mobile.

3. Navigation/header needs a real mobile pattern.

Current mobile-ish behavior stacks a top auth button plus horizontal nav chips. It is functional, but it consumes too much vertical space and feels like a desktop nav compressed onto mobile. Implement a professional mobile header:

- Brand left.
- One primary auth/profile action right.
- Compact menu or tab bar for primary routes.
- Sticky only when it helps; avoid bulky first viewport header.

4. UI code is too centralized.

Most product UI still lives in `src/app/legacy/SiteAppLegacy.tsx` at about 5,900 lines. Global CSS is about 4,600 lines. This makes layout regressions likely and slows feature work.

Execution direction:

- Keep route wrappers in `src/app/pages`.
- Move page implementations out of `legacy` one page at a time.
- Extract shared components into `src/app/components`.
- Extract domain helpers into `src/lib` or page-local helper files.
- Split global CSS into component/page sections or CSS modules while preserving the current color palette.

5. Visual language has a good base but needs restraint.

The color palette is liked and should be preserved. The current UI uses many cards, pills, glows, shadows, and large rounded shapes. For professional-grade SaaS/product polish:

- Keep the green/soft neutral palette.
- Reduce nested panels and decorative effects.
- Use clearer spacing, type hierarchy, and section rhythm.
- Prefer fewer, stronger cards over many competing cards.
- Make dashboards denser and more work-focused than marketing pages.

6. Demo imagery is not suitable for production.

Demo consultants use remote placeholder services (`i.pravatar.cc`, `picsum.photos`). This is okay for prototype, but not for user testing if users may judge trust.

Needed:

- Replace demo images with owned/licensed assets or real uploaded consultant images.
- Add image fallback states that look intentional.
- Decide whether demo profiles remain visible in production or are hidden behind a demo/dev mode.

7. Auth page is too heavy and unclear when services are not configured.

The auth page explains a lot, shows disabled social buttons, and has a large form. In production, it needs:

- Clear login/register split.
- Better error handling for Cognito states.
- Password requirements shown before submit.
- Confirmation code flow that is easy to recover.
- Social buttons hidden or explained only when configured.
- Role choice presented as a first-class onboarding choice.

8. Dashboard is promising but too large for one component.

The dashboard includes profile setup, document upload, consultant public profile setup, availability composer, matches, sessions, and upsell preview. It needs to become a structured workspace:

- Dashboard shell.
- Profile setup wizard.
- Documents section.
- Public consultant profile editor.
- Availability editor.
- Bookings/session inbox.
- Match recommendations.

Each section should have loading, empty, error, saved, dirty, and success states.

## Backend/API Findings

1. Backend is a single Lambda file.

`backend/api/index.cjs` is about 930 lines and contains routing, validation, persistence, media URL generation, booking logic, and response handling. This is acceptable for prototype but should be modularized before production.

Target structure:

- `router`
- `auth/claims`
- `validation/schemas`
- `repositories/users`
- `repositories/consultants`
- `repositories/bookings`
- `services/uploads`
- `services/bookings`
- `responses/errors`

2. Input validation is too permissive.

Current backend accepts many body fields directly and normalizes some arrays. Production should use explicit schemas for:

- Bootstrap user.
- Update user profile.
- Update consultant profile.
- Create upload URL.
- Create booking.

Validation must enforce required fields, max lengths, valid enum values, numeric ranges, slug rules, allowed content types, and safe URL rules.

3. Booking has a race condition.

Create booking checks existing bookings and then writes a new item. Two clients could book the same slot concurrently. Production fix:

- Add a deterministic booking slot key, for example `consultantId#scheduledAt`.
- Use DynamoDB conditional write or transaction.
- Optionally remove or mark availability slot as reserved.

4. Booking lifecycle is incomplete.

Current statuses are `requested`, `confirmed`, `cancelled`, but API only creates/list bookings. Need endpoints and UI for:

- Consultant confirms request.
- Client cancels request.
- Consultant declines/cancels request.
- Optional reschedule.
- Status history/audit timestamp.
- Email notification on each state change.

5. Public consultant listing uses DynamoDB Scan.

This is fine for demo but will not scale. Add queryable indexes/search strategy:

- Public profiles by `isPublic/profileStatus`.
- Featured profiles.
- Profile type.
- City.
- Search keywords.
- Next available slot.

For MVP user testing, this can remain if dataset is small, but add pagination and limits.

6. Upload endpoint is overloaded.

Frontend calls `/me/cv/upload-url` for CV, consultant avatar, hero, and user avatar. Rename/add clearer endpoints:

- `/me/documents/upload-url`
- `/me/avatar/upload-url`
- `/consultants/me/media/upload-url`

Also add:

- Content length enforcement strategy.
- Image dimensions/type validation after upload if possible.
- Virus/malware scanning plan for CV files before broader launch.
- Delete/replacement cleanup so old S3 objects do not accumulate.

7. Signed media URLs expire and may be over-generated.

Profile responses generate signed S3 URLs for media. This is secure, but every list call can generate many signed URLs. Add caching strategy or public-safe resized images if images are intended to be visible publicly.

8. Error handling and observability are minimal.

Add structured logs, request IDs, safe error messages, CloudWatch metrics/alarms, and a known error shape:

```json
{ "message": "Human readable message", "code": "ERROR_CODE", "requestId": "..." }
```

9. Authorization needs a policy pass.

Current route protection exists via API Gateway JWT and backend claim checks. Add explicit checks for:

- Only owner edits own user profile.
- Only consultant owner edits consultant profile.
- Clients cannot book themselves.
- Consultants can only see bookings for their own profile.
- Admin/moderator future role if needed.
- Role changes cannot be abused by updating `plan` or `role` client-side.

10. GDPR/privacy features are missing.

Before real users:

- Account deletion request path.
- Data export path.
- CV deletion/replacement.
- Privacy policy reviewed by legal counsel.
- Cookie/analytics consent if analytics are added.

## Infrastructure Findings

1. Terraform validates but formatting fails.

Run `terraform fmt` in `infra/terraform` before production work. The current diff is alignment-only in `main.tf`.

2. Production environment config is tracked.

`.env.production` is tracked. Values are public frontend config, not private secrets, but decide if environment-specific config should remain in repo. If yes, document it clearly.

3. API protection exists but needs production hardening.

Already present:

- HTTP API throttling variables.
- Lambda reserved concurrency variable.
- S3 public access block.
- S3 SSE AES256.
- Cognito JWT authorizer on private routes.

Add:

- CloudWatch alarms for Lambda errors/throttles/duration.
- API Gateway 4xx/5xx dashboards.
- DynamoDB point-in-time recovery.
- S3 lifecycle policy for replaced uploads if appropriate.
- Backend deployment package process outside `node_modules` in source directory.
- Separate dev/staging/prod variables.
- Remote Terraform state with locking before team usage.

4. CORS is simple.

Lambda uses one `ALLOWED_ORIGIN`; API Gateway uses `frontend_origins`. Ensure all real origins are configured:

- GitHub Pages production.
- Localhost dev.
- Any staging preview.

## Testing Gaps

There are currently no app tests found in source.

Add test layers in this order:

1. Frontend unit tests for pure helpers:
   - profile completion
   - slug formatting
   - availability grouping
   - match scoring
   - date formatting edge cases

2. API unit tests:
   - validation schemas
   - booking conflict prevention
   - auth/role guards
   - upload kind/content type/size validation
   - consultant slug uniqueness

3. Frontend integration tests:
   - directory filtering
   - consultant profile booking form state
   - auth register/login/forgot UI states
   - dashboard profile save form serialization

4. End-to-end smoke tests:
   - public homepage loads
   - directory search works
   - consultant profile opens
   - auth page renders
   - dashboard redirects unauthenticated users

5. Visual regression checks:
   - desktop 1440px
   - tablet 820px
   - mobile 390px
   - Bulgarian text wrapping in hero/header/cards/buttons

## Execution Plan

### Phase 0 - Stabilize The Ground

Goal: make the repo safer to work in before redesign/refactor.

Tasks:

- Run `terraform fmt`.
- Add lint/test tooling:
  - ESLint
  - Prettier or equivalent formatting decision
  - Vitest
  - Testing Library
  - Playwright
- Add scripts:
  - `npm run lint`
  - `npm run test`
  - `npm run test:e2e`
  - `npm run check`
- Add a small CI workflow or documented local check order.
- Add `.env.example` entries for social auth variables.
- Document generated deployment files and when to commit them.

Acceptance:

- `npm run build`, lint, unit tests, and Terraform validate are clean.
- Formatting is deterministic.
- Build artifacts are not accidentally churned during normal dev unless intentionally building for deploy.

### Phase 1 - Product UX And Information Architecture

Goal: make first-time users understand GrowPoint immediately.

Tasks:

- Redesign homepage first viewport with two choices:
  - user looking for consultation/mentorship
  - consultant/mentor creating a profile
- Preserve top-consultant hero image/spotlight as the emotional visual anchor.
- Make CTA labels concrete:
  - "Find a consultant"
  - "Become a consultant/mentor"
  - Bulgarian equivalent in final copy.
- Add concise trust signals:
  - active profiles
  - next available sessions
  - consultants and mentors
- Make `/users` and `/consultants` distinct:
  - `/users` explains matching and browsing from client perspective.
  - `/consultants` explains public profiles and onboarding from provider perspective.
- Tighten copy across all public pages.
- Decide final Bulgarian/English language strategy. Current UI mixes Bulgarian with English professional terms; make that intentional.

Acceptance:

- A new visitor can choose the correct path without reading long text.
- Mobile first viewport shows brand, role choice, and part of spotlight without awkward clipping.
- Desktop first viewport feels premium and focused.

### Phase 2 - Responsive UI Polish

Goal: keep the liked colors but make the UI professional and stable.

Tasks:

- Define design tokens:
  - colors
  - spacing
  - type scale
  - radii
  - shadows
  - z-index
  - motion durations
- Fix mobile header and nav.
- Fix hero heading wrapping on all major routes.
- Remove excessive negative letter-spacing from small/mobile text.
- Reduce nested card usage.
- Standardize button styles and sizes.
- Add icons where useful for actions, not decoration.
- Improve focus, hover, disabled, loading, and active states.
- Make card grids stable with explicit min/max sizes.
- Review every page at 390px, 820px, 1280px, and 1440px.
- Tune route animations to avoid washed-out pages or awkward screenshot states.
- Respect `prefers-reduced-motion`.

Acceptance:

- No text overlap or clipped controls.
- Buttons fit labels.
- Cards do not jump or resize unexpectedly.
- Header/nav is professional on mobile and desktop.

### Phase 3 - Frontend Refactor

Goal: make future feature work fast and safe.

Tasks:

- Extract from `src/app/legacy/SiteAppLegacy.tsx` in this order:
  1. shared media components: `AvatarMedia`, `CoverMedia`
  2. formatting helpers
  3. consultant card components
  4. homepage
  5. consultants directory
  6. consultant profile
  7. auth page
  8. dashboard
- Create folders:
  - `src/app/components`
  - `src/app/features/consultants`
  - `src/app/features/auth`
  - `src/app/features/dashboard`
  - `src/app/features/profile`
- Keep route files small.
- Move page-specific styles out of the giant global file as practical.
- Add data-testid attributes for key e2e flows.
- Keep API calls in `src/lib/api.ts` or feature-specific service wrappers.

Acceptance:

- `SiteAppLegacy.tsx` is deleted or reduced to zero active route exports.
- Components have clear ownership.
- Tests can import helpers without rendering the whole app.

### Phase 4 - Auth And Onboarding

Goal: make registration/login dependable enough for real testers.

Tasks:

- Improve role selection before/inside registration.
- Validate form fields before submit with clear inline errors.
- Show password requirements.
- Improve confirmation code resend/change email flow.
- Improve forgot password flow.
- Add clear backend/API/Cognito not configured states for local/dev.
- Hide social providers unless configured or show a compact "coming soon" state.
- After signup, guide user to first useful task:
  - client: finish profile and browse matches
  - consultant: finish public profile and add availability
- Store pending bootstrap data with version/expiry and safe cleanup.

Acceptance:

- A new client can register and land in the dashboard.
- A new consultant can register and start a public profile.
- Failed auth states are understandable.

### Phase 5 - Dashboard And Consultant Workspace

Goal: make the dashboard useful, not just present.

Tasks:

- Split dashboard into sections with tabs or side nav.
- Add save state:
  - dirty
  - saving
  - saved
  - failed
- Add form-level validation.
- Add media upload previews.
- Add CV upload status and delete/replace action.
- Add consultant profile preview.
- Add availability editor that prevents duplicates and past times.
- Add booking inbox:
  - requested
  - confirmed
  - cancelled
  - empty states
- Add client matches based on profile signals.

Acceptance:

- Client dashboard supports profile, CV, matches, sessions.
- Consultant dashboard supports public profile, media, availability, booking management.
- Empty states explain exactly what to do next.

### Phase 6 - Backend Production Hardening

Goal: make the API safe enough for real users.

Tasks:

- Modularize Lambda backend.
- Add validation schemas.
- Add error codes/request IDs.
- Add conditional booking write or transaction.
- Add booking status update endpoints.
- Add upload endpoint split.
- Add pagination to list endpoints.
- Add DynamoDB indexes for common access patterns.
- Add role/plan protection so client cannot self-upgrade or change unsafe fields.
- Add server-side sanitization/max length for all text fields.
- Add structured logs and metrics.
- Add email notification service plan.

Acceptance:

- API tests cover main success and failure paths.
- Double booking is prevented atomically.
- Invalid input receives stable 400 errors.
- Authorization behavior is explicit and tested.

### Phase 7 - Trust, Legal, And Content

Goal: make the product credible to user testers.

Tasks:

- Replace placeholder demo images.
- Decide demo profile policy.
- Add real terms/privacy/cookie content reviewed for Bulgaria/EU context.
- Add contact form backend or clearly keep mailto for MVP.
- Add consultant profile moderation/status if public profiles are user-generated.
- Add report profile/contact support path.
- Add "no career outcome guarantee" copy in legal and booking flow.
- Add consent/analytics banner only if analytics are used.

Acceptance:

- User testers are not confused by fake/placeholder data.
- Legal pages are not just placeholder summaries.
- Public consultant content has a moderation plan.

### Phase 8 - Observability, Security, And Release

Goal: know when production breaks and reduce operational risk.

Tasks:

- CloudWatch alarms:
  - Lambda errors
  - Lambda throttles
  - Lambda duration
  - API 5xx
  - API 4xx spike
- Add basic frontend error reporting if budget allows.
- Add CSP/security headers if hosting path supports them.
- Add dependency audit routine.
- Add S3 lifecycle and object cleanup.
- Add DynamoDB PITR.
- Add staging environment.
- Add release checklist.

Acceptance:

- There is a staging smoke test path.
- There is a rollback plan.
- Basic production incidents can be detected.

## MVP User-Test Readiness Checklist

Before inviting real testers, all of this should be true:

- Homepage has two clear role choices and keeps the liked consultant hero visual.
- Mobile and desktop layouts are visually stable.
- Directory search/filter works.
- Consultant profile pages are readable and trustworthy.
- Booking request flow works for real consultant profiles.
- Auth signup/login/confirmation/forgot password works.
- Client dashboard supports profile and CV.
- Consultant dashboard supports public profile and availability.
- Backend prevents duplicate bookings.
- Placeholder images are removed or clearly marked demo.
- Legal/privacy/contact content is ready for a private beta.
- Build, tests, lint, and Terraform validation pass.
- Monitoring basics are in place.

## Suggested Immediate Next Implementation Order

1. Fix Terraform formatting and add project check scripts.
2. Redesign homepage hero around the two choices while preserving top-consultant image.
3. Fix responsive typography/header across homepage, users, consultants, auth, and profile pages.
4. Extract shared components from `SiteAppLegacy.tsx`.
5. Add basic tests for helpers and directory filtering.
6. Harden booking API against duplicate slot booking.
7. Split dashboard into manageable feature components.
8. Add booking lifecycle actions.
9. Replace demo media and tighten production copy.
10. Add observability and final release checklist.
