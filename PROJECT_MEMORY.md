# CareerLane Production Readiness Memory

Review date: 2026-05-06
Workspace: `/Users/privileged/Projects/BobSNadenica.com/bobsnadenica.com/career`

This file is the working memory for taking CareerLane from early-stage prototype to a professional, production-ready user test. It should be used as the execution plan in future implementation sessions.

## Product Intent

CareerLane is a two-sided career platform:

- Clients/professionals create a profile, upload a CV, browse consultants or mentors, and request a session.
- Consultants/mentors create a public profile, manage presentation/media/availability, and receive booking requests.

Current deployment model:

- React + Vite SPA under `/career/` using `HashRouter`.
- AWS Cognito for auth.
- AWS HTTP API Gateway + Lambda + DynamoDB + S3 for backend.
- Terraform for AWS infrastructure.
- GitHub Pages root `index.html` and `assets/` are generated deployment artifacts.

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

Rendered checks performed in the in-app browser against:

- `http://127.0.0.1:5173/career/#/`
- `http://127.0.0.1:5173/career/#/consultants`
- `http://127.0.0.1:5173/career/#/consultants/ana-petrova`
- `http://127.0.0.1:5173/career/#/auth?tab=register&role=consultant`
- `http://127.0.0.1:5173/career/#/users`

Observed:

- App loads and is not blank.
- No Vite/React error overlay.
- Directory keyword filter works and updates the URL, for example `#/consultants?q=Product`.
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

Goal: make first-time users understand CareerLane immediately.

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

