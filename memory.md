# GrowPoint working memory

Last reviewed: 2026-09-06. This is the canonical project memory. The historical review is preserved below for context, **not as current instructions**; the latest dated sections supersede conflicting historical claims.

## Latest authenticated QA and demonstration policy — 2026-09-06

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
- Requested DKS payment is deliberately a mock preview, not Stripe and not a functioning checkout. No card fields, requests, payment state changes, or package activation. Keep the preview labels until provider specifications and verified webhooks arrive.
- Management and statistics are ONE admin panel at /admin; /admin/dashboard redirects there for existing bookmarks. Existing Cognito admin authorization only. The earlier separate-password request was cancelled; never restore it or put credentials in documentation.
- Production www.growpoint.bg is GitHub Pages from committed root artifacts. Optional S3/CloudFront is test/cutover only. User handles Terraform apply and GitHub push. No apply, commit, or push performed by this implementation session.
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
