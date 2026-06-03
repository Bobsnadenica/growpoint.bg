# CareerLane Implementation Tracker

This file tracks active execution work so the project can be resumed cleanly after interruption.

## Current Focus

Improve the public website from prototype UI toward user-test readiness.

## Active Slice

Started: 2026-05-07

Scope:

- Preserve the liked top-consultant hero image/spotlight.
- Make the homepage first viewport offer two clear choices:
  - users who need consultation or mentorship
  - consultants/mentors who want to create a public profile
- Improve the worst responsive heading/header behavior.
- Verify with build and in-app browser.

Status: Completed for this slice.

## Change Log

- 2026-05-07: Created this tracker before implementation.
- 2026-05-07: Updated the homepage hero copy so the first viewport clearly explains CareerLane as a consulting and mentorship platform.
- 2026-05-07: Added two primary homepage choice cards:
  - "Търся консултация или менторство" -> `/users`
  - "Аз съм консултант или ментор" -> `/auth?tab=register&role=consultant`
- 2026-05-07: Preserved the liked top-consultant hero image/spotlight and changed the responsive order so the choices stay primary on smaller screens while the image remains visible below.
- 2026-05-07: Improved mobile layout resilience by tightening hero/auth/profile headings, preventing horizontal overflow, hiding long helper text in the homepage choice cards on narrow screens, and shortening the auth header label to "Вход" on small screens.
- 2026-05-07: Verified production build with `npm run build`.
- 2026-05-07: Verified `/`, `/users`, and `/auth?tab=register&role=consultant` in the in-app browser. No runtime errors were seen; only React Router v7 future-flag warnings appeared.
- 2026-05-07: Captured desktop and mobile visual screenshots with headless Chrome fallback because the in-app browser screenshot API timed out. Home desktop looked balanced with the two choices and the top consultant image. Home mobile no longer clipped horizontally and keeps the consultant image visible after the primary choices.
- 2026-05-07: Added `.claude/` to `.gitignore` and removed the accidentally tracked embedded `.claude/worktrees/romantic-lumiere-dab21a` gitlink from the index. The local folder was kept on disk.

## Files Changed In This Slice

- `src/app/legacy/SiteAppLegacy.tsx`
  - Added `homeRoleChoices`.
  - Reworked `HomePage` hero copy and primary CTAs.
- `src/styles/global.css`
  - Added hero choice-card styling.
  - Adjusted heading sizing and mobile layout behavior.
  - Added mobile-specific auth label behavior.
- `src/app/layout/AppShell.tsx`
  - Split the auth link into full and short labels for responsive header fit.
- `IMPLEMENTATION_TRACKER.md`
  - Added this execution log for resumability.
- `.gitignore`
  - Ignores local `.claude/` worktrees so embedded repos are not added again.

## Current QA Notes

- Build: `npm run build` passes.
- Browser route checks:
  - `/` -> `Начало | CareerLane`
  - `/users` -> `За потребители | CareerLane`
  - `/auth?tab=register&role=consultant` -> `Вход и регистрация | CareerLane`
- Known non-blocking warning:
  - React Router future-flag warnings for `v7_startTransition` and `v7_relativeSplatPath`.
- Local workflow caveat:
  - `scripts/site-build.mjs build` rewrites root deploy artifacts. Restore or avoid committing generated root `index.html`, `assets/*`, `manifest.json`, and `sw.js` unless intentionally preparing a deploy artifact commit.

## Next Queue

- Audit and polish `/users` and `/consultants` as the next UX slice: search/filter layout, profile cards, empty/loading states, and mobile stacking.
- Rework consultant registration so it feels like a guided onboarding flow, not a generic auth form.
- Add real loading, error, and unauthenticated states for user-facing async backend paths.
- Decide whether to opt into React Router v7 future flags or defer until a routing upgrade pass.
- Add lightweight frontend regression coverage for home route CTAs and auth role preselection.
- Plan backend hardening after the UI pass: validation contracts, auth/role authorization, persistence boundaries, observability, and deploy readiness.

## Active Slice: Discovery UX Polish

Started: 2026-05-07

Scope:

- Improve `/users` and `/consultants` discovery composition.
- Make filters and result counts feel like one professional control surface.
- Replace plain loading/empty panels with clearer directory feedback states.
- Improve consultant profile card scanability on desktop and mobile.
- Verify with build and browser QA.

Status: Completed for this slice.

## Discovery UX Polish Change Log

- 2026-05-07: Added a shared directory filter summary pattern to `/users` and `/consultants`, including result counts, active filter chips, and a clearer reset action.
- 2026-05-07: Replaced plain loading/empty panels with `DirectoryFeedbackState` and visual card skeletons for a more professional loading state.
- 2026-05-07: Updated consultant cards with a scan-friendly fact grid for location, experience, next available time, and format.
- 2026-05-07: Added upcoming availability pills to consultant cards when slot data is present.
- 2026-05-07: Adjusted responsive CSS so directory controls, feedback states, and card fact grids collapse cleanly on tablet/mobile.
- 2026-05-07: Verified `npm run build` passes.
- 2026-05-07: Verified `/consultants`, `/consultants?kind=mentor`, and `/users?top=1` with the in-app browser DOM. Browser click/scroll translation was unreliable for below-fold controls, so filter states were also verified through routed URL state.
- 2026-05-07: Captured Browser screenshots for `/consultants` and `/users`; also captured headless Chrome desktop/tall and mobile screenshots as visual fallback. Only React Router v7 future-flag warnings were observed.

## Discovery UX Polish Files Changed

- `src/app/legacy/SiteAppLegacy.tsx`
  - Added directory filter-label helpers.
  - Updated `/users` and `/consultants` filter/result sections.
  - Added `DirectoryFeedbackState` and `ConsultantCardSkeleton`.
  - Enhanced `ConsultantCard` with fact-grid and availability slot pills.
- `src/styles/global.css`
  - Added directory control, active-filter, feedback, skeleton, and responsive card-fact styling.

## Discovery UX QA Notes

- Build: `npm run build` passes.
- Browser checks:
  - `/consultants` -> `Каталог на профили | CareerLane`
  - `/consultants?kind=mentor` renders the mentor filter state.
  - `/users?top=1` renders the top-profile filter state.
- Browser warnings:
  - Existing React Router v7 future-flag warnings remain.
- Visual QA caveat:
  - Headless Chrome sometimes failed to fetch remote profile images and showed fallback media blocks. Layout and text remained readable.

## Next Queue After Discovery Polish

- Rework consultant registration into a guided onboarding flow with clearer role context and section progress.
- Add real async error/loading states to backend-connected dashboard/profile flows.
- Add regression coverage for directory filter state and profile-card rendering.
- Decide whether to enable React Router v7 future flags.

## Active Slice: Homepage Hero And Overlap Cleanup

Started: 2026-05-07

Scope:

- Add two top consultant/mentor profiles to the homepage hero while preserving the liked lead hero image.
- Review overlap-prone CSS in hero, directory cards, chips, and mobile layouts.
- Remove brittle sizing where text/date/profile metadata can collide.
- Verify with build and rendered browser QA.

Status: Completed for this slice.

## Homepage Hero And Overlap Cleanup Change Log

- 2026-05-08: Reworked the homepage hero profile area to show two top consultant/mentor profiles, preserving the liked lead consultant image as the primary profile card.
- 2026-05-08: Added a compact secondary hero profile card so the first viewport communicates that users can choose between multiple high-quality experts, not just one featured person.
- 2026-05-08: Added defensive image fallback handling for avatar and cover media so broken remote images collapse into branded visual placeholders instead of exposing alt text or stretching layouts.
- 2026-05-08: Replaced the previous unused hero consultant visual CSS with scoped `home-hero-profile` styles for the new two-profile layout.
- 2026-05-08: Hardened overlap-prone header and hero text regions with `min-width: 0`, wrapping, and fixed card/profile spacing so long names, metadata, and CTAs do not collide.
- 2026-05-08: Changed compact consultant fact grids from four compressed columns to two balanced columns for better desktop and mobile readability.
- 2026-05-08: Added mobile-specific spacing, avatar sizing, and metadata wrapping rules for the homepage hero profiles.
- 2026-05-08: Removed redundant old hero CSS selectors that no longer map to rendered markup.

## Homepage Hero And Overlap Cleanup Files Changed

- `src/app/legacy/SiteAppLegacy.tsx`
  - Added two-profile homepage hero selection logic.
  - Added `HomeHeroProfile` for primary and secondary profile cards.
  - Added avatar and cover media failure fallbacks.
- `src/styles/global.css`
  - Added scoped homepage hero profile styles.
  - Tightened responsive behavior for hero cards, profile metadata, header actions, and compact consultant fact grids.
- `IMPLEMENTATION_TRACKER.md`
  - Recorded the completed implementation and QA notes for resumability.

## Homepage Hero And Overlap Cleanup QA Notes

- Build: `npm run build` passes.
- Browser DOM checks passed for:
  - `/` -> homepage hero renders the two-profile area.
  - `/consultants` -> directory profile cards render without framework overlay errors.
  - `/users` -> user discovery route renders without framework overlay errors.
- Visual QA:
  - In-app browser screenshots confirmed the public routes render cleanly in the available narrow viewport.
  - Headless Chrome desktop screenshot confirmed the homepage hero keeps the two profiles visible and separated without overlap.
  - Headless Chrome mobile screenshot confirmed the hero choices, primary profile, and secondary profile stack cleanly without text collisions.
- Known non-blocking warning:
  - Existing React Router v7 future-flag warnings remain for `v7_startTransition` and `v7_relativeSplatPath`.
- Cleanup:
  - Generated deploy artifacts from local browser QA were restored or removed after verification.
  - Dev server was stopped after QA.

## Next Queue After Homepage Hero Cleanup

- Rework consultant registration into a guided onboarding flow with clearer consultant/mentor role context, section progress, and form validation states.
- Continue responsive visual QA on auth, profile, and dashboard routes after the onboarding pass.
- Add regression coverage for homepage hero rendering, directory cards, and role-specific auth preselection.
- Decide whether to enable React Router v7 future flags during a routing maintenance pass.

## Active Slice: Profile Documents And Public Profile Fixes

Started: 2026-05-25

Scope:

- Remove duplicated public-profile CTA copy from approved consultant profile state.
- Add a compact progress indicator for profile completion.
- Make saved consultant/mentor availability easier to open, review, and manage without long page expansion.
- Fix uploaded document download permissions and keep documents private per user.
- Add explicit sharing so a user can share uploaded files with a consultant or mentor, who can then see the shared files in that user's profile context.
- Ensure uploaded consultant top banner/cover media renders on the public profile.
- Make upload controls smaller and more professional.
- Fix profile photo thumbnail persistence after logout/login.
- Add stronger confirmations and scheduled deletion behavior for profile deletion.
- Reduce empty space on public consultant profiles and test the advertisement assets in `assets/advertisement/`.

Status: Completed for this slice.

Change log:

- 2026-05-25: Removed the duplicate approved-profile public page CTA by keeping the status banner informational and leaving the overview CTA as the single public-page action.
- 2026-05-25: Added profile completion progress bars/step indicators in the dashboard sidebar and overview.
- 2026-05-25: Made consultant availability summary controls clickable and routed them to the saved availability editor.
- 2026-05-25: Changed document downloads to request a fresh owner-only signed URL on click, avoiding stale/expired download links.
- 2026-05-25: Added per-document sharing metadata (`sharedWithConsultantIds`) and UI controls so users can explicitly share individual documents with selected consultants/mentors.
- 2026-05-25: Added shared user documents to consultant booking/session cards when the client has granted access.
- 2026-05-25: Rendered uploaded consultant top banners on the public profile hero.
- 2026-05-25: Tightened upload field sizing and file input styling across profile/document upload controls.
- 2026-05-25: Fixed consultant avatar persistence by syncing `avatarStorageKey` back to the user profile when consultant media is saved.
- 2026-05-25: Prevented temporary signed media URLs from being saved back into profile records when an uploaded media storage key already exists.
- 2026-05-25: Replaced immediate destructive profile deletion with a multi-confirmation modal and 7-day scheduled deletion flow, processed by the existing scheduled Lambda path.
- 2026-05-25: Bounded long saved availability lists with an internal scroll area so many slots do not stretch the whole page.
- 2026-05-25: Removed the empty public-profile hero column, added banner media, and added a profile-side advertisement card using `assets/advertisement/`.
- 2026-05-25: Updated the build script so `assets/advertisement/` survives deploy artifact rebuilds.
- 2026-05-25: Updated privacy copy to reflect explicit document sharing and scheduled deletion.

QA notes:

- `npm run build` passes.
- `node --check backend/api/index.cjs` passes.
- In-app browser public-profile QA passed against a local mock API for `#/consultants/ivan-todorov-startup-mentor`:
  - desktop: banner fills the hero width, no empty right column, advertisement media renders, booking panel exists, no framework overlay.
  - mobile 390px: banner/profile stack cleanly, text remains inside the card, no framework overlay.
- Live deployed profile still shows the old UI until the new build is deployed.

## Recovery Note: Local Site Not Loading

Date: 2026-05-11

What happened:

- The in-app browser was pointed at `http://127.0.0.1:5173/career/`, but the Vite dev server was no longer running.
- README confirms local development requires the Vite server, while `index.html` and `assets/` are GitHub Pages deploy artifacts.
- Tracker already warns that `npm run build` rewrites root deploy artifacts, so local QA should run `node scripts/site-build.mjs prepare` before serving with Vite when needed.

Recovery performed:

- Restarted local development with `npm run dev -- --host 127.0.0.1 --port 5173`.
- Verified TypeScript with `./node_modules/.bin/tsc --noEmit`.
- Verified `/consultants` in the in-app browser at `http://127.0.0.1:5173/career/?qa=1778150001#/consultants`.
- Confirmed no Vite/framework overlay and no console errors beyond the existing React Router v7 future-flag warnings.
- Confirmed `career/` git status was clean before this tracker note.

Guardrail:

- If the site shows `ERR_FAILED` or does not load locally, first check that Vite is running on port `5173`.
- For local browser work after a production build, prepare the dev entry again with `node scripts/site-build.mjs prepare`, then start or restart Vite.

## Active Slice: Consultant Registration Onboarding Polish

Started: 2026-05-11

Scope:

- Continue the consultant registration/onboarding improvement after the load recovery.
- Preserve the existing auth/backend flow and avoid introducing new auth behavior.
- Improve the responsive ordering so mobile users see the actual registration card before long explanatory copy.
- Verify with production build and in-app browser QA.

Status: Completed for this slice.

## Consultant Registration Onboarding Polish Change Log

- 2026-05-11: Kept the guided consultant registration flow intact and focused this pass on responsive usability.
- 2026-05-11: Changed tablet/mobile auth layout order so `.auth-card` appears before `.auth-copy`, making the usable registration flow visible immediately after the header.
- 2026-05-11: Preserved the desktop two-column auth layout so the explanatory side panel still supports the form on wider screens.
- 2026-05-11: Ran `npm run build`; build passed.
- 2026-05-11: Cleaned generated root deploy artifacts after the build and prepared the dev entry again with `node scripts/site-build.mjs prepare`.

## Consultant Registration Onboarding Polish Files Changed

- `src/styles/global.css`
  - Added responsive auth-card ordering under the tablet/mobile breakpoint.
- `IMPLEMENTATION_TRACKER.md`
  - Added this execution log and QA notes.

## Consultant Registration Onboarding Polish QA Notes

- Build: `npm run build` passes.
- Browser QA:
  - Desktop/default viewport `/auth?tab=register&role=consultant` loads with the guided consultant onboarding card and no framework overlay.
  - Mobile `390x900` viewport loads with the auth card first, before the explanatory copy.
  - No console errors were observed; existing React Router v7 future-flag warnings remain.
- Cleanup:
  - Restored generated deploy artifacts after build verification.
  - Reset the in-app browser viewport override after mobile QA.

## Next Queue After Consultant Onboarding Polish

- Continue visual QA on the lower portions of the auth form after real registration data is available.
- Add lightweight regression coverage for the responsive auth ordering and role-specific registration route.
- Start the next backend-connected quality slice: explicit loading/error states for dashboard/profile flows.

## Active Slice: Dashboard Loading And Error States

Started: 2026-05-11

Scope:

- Improve backend-connected dashboard loading and first-load failure states.
- Keep existing API calls, auth flow, profile forms, and dashboard data contracts unchanged.
- Add a clearer retry path when dashboard profile data fails before the dashboard can render.
- Verify build and signed-out dashboard route behavior in the browser.

Status: Completed for this slice.

## Dashboard Loading And Error States Change Log

- 2026-05-11: Added explicit dashboard data loading state with `dashboardLoading` instead of relying only on `profile === null`.
- 2026-05-11: Added `dashboardReloadKey` retry flow so first-load dashboard failures can retry API loading without a full browser refresh.
- 2026-05-11: Added shared `DashboardRouteState` for auth loading, dashboard loading, profile loading, and first-load error states.
- 2026-05-11: Styled dashboard route states with clear marker, copy hierarchy, responsive layout, and error/loading tones.
- 2026-05-11: Preserved the parallel dashboard API loading pattern for profile, bookings, consultant profile, and public directory data.

## Dashboard Loading And Error States Files Changed

- `src/app/legacy/SiteAppLegacy.tsx`
  - Added dashboard loading/retry state.
  - Replaced plain loading/error panels before dashboard render with `DashboardRouteState`.
- `src/styles/global.css`
  - Added dashboard route-state styling and mobile stacking.
- `IMPLEMENTATION_TRACKER.md`
  - Added this execution log and QA notes.

## Dashboard Loading And Error States QA Notes

- Build: `npm run build` passes.
- Browser QA:
  - Signed-out `/dashboard` redirects to `/auth?redirect=/dashboard`.
  - Auth page renders without a framework overlay after the redirect.
  - No console errors were observed; existing React Router v7 future-flag warnings remain.
- Cleanup:
  - Generated root deploy artifacts from `npm run build` were restored/removed.
  - Dev entry was prepared again with `node scripts/site-build.mjs prepare`.
- Remaining QA gap:
  - Authenticated dashboard first-load success/failure screens still need live-session QA or a lightweight test harness because the current browser session is signed out.

## Next Queue After Dashboard Loading States

- Add a lightweight authenticated dashboard test harness or fixture path for loading/error state regression.
- Continue dashboard polish on empty bookings, empty documents, and consultant profile drafts.
- Decide whether to address React Router v7 future warnings in a routing maintenance slice.

## Active Slice: Router Warning Cleanup

Started: 2026-05-11

Scope:

- Opt into the React Router v7 future flags that are already supported by the current `HashRouter`.
- Keep the GitHub Pages compatible hash-routing model unchanged.
- Reduce console noise so future browser QA can spot real warnings faster.

Status: Completed for this slice.

## Router Warning Cleanup Change Log

- 2026-05-11: Added `v7_relativeSplatPath` and `v7_startTransition` future flags to the top-level `HashRouter`.
- 2026-05-11: Kept the existing `AuthProvider` and route shell unchanged.

## Router Warning Cleanup Files Changed

- `src/app/App.tsx`
  - Opted `HashRouter` into the supported React Router v7 future behavior.

## Router Warning Cleanup QA Notes

- Build: `npm run build` passes.
- Type check: `./node_modules/.bin/tsc --noEmit` passes.
- Browser QA:
  - Fresh `/consultants` tab rendered the catalog content.
  - Fresh signed-out `/dashboard` request redirected to `/auth?redirect=/dashboard`.
  - Fresh timestamp-filtered console checks showed no current warnings or errors.
- Cleanup:
  - Generated root deploy artifacts from `npm run build` were restored/removed.
  - Dev entry was prepared again with `node scripts/site-build.mjs prepare`.

## Active Slice: Dashboard Documents And Empty States

Started: 2026-05-11

Scope:

- Make the dashboard document upload area match the backend upload contract before calling the API.
- Improve the dashboard document active/empty states without changing backend behavior.
- Replace the plain sessions empty state with a clearer role-aware dashboard state.
- Keep changes small and reusable so the next dashboard pass can build on them.

Status: Completed for this slice.

## Dashboard Documents And Empty States Change Log

- 2026-05-11: Added shared CV upload contract helpers for accepted file types, size limit, content-type inference, and client validation.
- 2026-05-11: Updated the API client to send the same inferred CV content type that the dashboard uses for the S3 upload request.
- 2026-05-11: Added client-side CV validation before requesting a signed upload URL, matching the backend PDF/DOC/DOCX and 8 MB limits.
- 2026-05-11: Replaced the plain document panel with `DashboardDocumentCard` for active and empty document states.
- 2026-05-11: Added a role-aware `DashboardEmptyState` for the upcoming sessions section.
- 2026-05-11: Added responsive CSS for dashboard document and empty states so they collapse cleanly on tablet/mobile.

## Dashboard Documents And Empty States Files Changed

- `src/lib/uploads.ts`
  - Added the shared CV upload contract helpers.
- `src/lib/api.ts`
  - Uses the shared CV content-type inference when creating CV upload URLs.
- `src/app/legacy/SiteAppLegacy.tsx`
  - Validates CV files before backend calls.
  - Uses the inferred content type for the signed S3 PUT request.
  - Adds dashboard document and sessions empty-state components.
- `src/styles/global.css`
  - Adds dashboard document, upload field, and empty-state styling.
- `IMPLEMENTATION_TRACKER.md`
  - Added this execution log and QA notes.

## Dashboard Documents And Empty States QA Notes

- Type check: `./node_modules/.bin/tsc --noEmit` passes.
- Build: `npm run build` passes.
- Browser QA:
  - `/consultants` renders catalog content in a fresh tab with no current console warnings/errors.
  - Signed-out `/dashboard` redirects to `/auth?redirect=/dashboard` and renders the auth page with no current console warnings/errors.
- Cleanup:
  - Generated root deploy artifacts from `npm run build` were restored/removed.
  - Dev entry was prepared again with `node scripts/site-build.mjs prepare`.
- Remaining QA gap:
  - The authenticated dashboard document/session states still need live-account QA or a fixture route because the current browser session is signed out.

## Next Queue After Dashboard Documents And Empty States

- Add a lightweight authenticated dashboard fixture or test harness for profile/document/session states.
- Continue consultant dashboard polish around public profile draft readiness and availability management.
- Add regression coverage for CV upload validation and dashboard empty-state rendering.
- Review backend upload error messages and map them to localized frontend copy where needed.

## Recovery Note: Local Plain `/career/` Loading

Date: 2026-05-11

What happened:

- `http://127.0.0.1:5173/career/` could fail or appear stale even while Vite returned `200 OK`.
- The root cause was the production service worker caching `/career/` and `/career/index.html`, then serving stale HTML before Vite's dev entry could respond.
- Cache-busted URLs such as `?qa=...` could still work, which made the failure look inconsistent.

Recovery performed:

- Added development service-worker cleanup to the Vite source HTML so local dev unregisters `/career/` service workers and clears `careerlane-*` caches.
- Kept production builds registering the service worker, but changed registration to a relative `sw.js` URL so it resolves under the deployed `/career/` path.
- Updated `public/sw.js` and root `sw.js` to `careerlane-v2`, delete old caches on activate, claim clients, and use network-first handling for navigation requests.
- Replaced hard-coded `/career/...` icon and manifest paths in the source index template with relative paths to avoid `/career/career/...` URLs during Vite dev serving.

QA:

- `curl -I http://127.0.0.1:5173/career/` returns `200 OK`.
- `curl -L http://127.0.0.1:5173/career/` returns the dev entry with service worker cleanup.
- Browser QA on plain `http://127.0.0.1:5173/career/` renders the homepage with both hero choices visible and no current console warnings/errors.
- `npm run build` passes with the updated build script and service worker.
- Generated build bundle files were restored/removed after verification, and local dev remained controlled by the Vite source entry.

Guardrail:

- For local dev, always use `npm run dev -- --host 127.0.0.1 --port 5173` and open `http://127.0.0.1:5173/career/`.
- If `/career/` ever looks stale again in local dev, restart `npm run dev`; the Vite source entry should unregister the service worker and clear old `careerlane-*` caches.

## Recovery Note: GitHub Pages White Page On `/career/index.html`

Date: 2026-05-11

What happened:

- The live URL `https://www.bobsnadenica.com/career/index.html` served a development `index.html`.
- That file referenced `/src/main.tsx`, which only works when Vite is running locally.
- GitHub Pages is static, so it cannot compile or serve the Vite TypeScript source entry. The browser received an empty `#root` and no built app bundle, so the page appeared white.

Correct structure:

- `bobsnadenica.com/` is the separate root/main website.
- `bobsnadenica.com/career/index.html` is the static deploy entry for the nested CareerLane app.
- `career/src/index.html` is now the Vite source HTML entry.
- `career/src/main.tsx` is the React mount entry.
- `career/index.html` and `career/assets/*` are generated deploy artifacts that GitHub Pages serves directly.
- The AWS backend remains separate and is called by the frontend through the configured API/Cognito environment values.

Recovery performed:

- Added `src/index.html` as the Vite source HTML entry.
- Updated `vite.config.ts` so Vite uses `career/src` as the frontend root while still building for the `/career/` base path.
- Updated `scripts/site-build.mjs` so production builds copy Vite output into `career/index.html` and `career/assets/` without ever writing a dev index into the deploy artifact.
- Changed `npm run dev` so local development uses Vite directly and does not rewrite `career/index.html`.
- Ran `npm run build`; `career/index.html` now references `/career/assets/index-*.js` and `/career/assets/index-*.css`, not `/src/main.tsx`.

QA:

- `npm run build` passes.
- Static GitHub-Pages-like QA passed by serving the parent `bobsnadenica.com` folder and opening `http://127.0.0.1:8000/career/index.html`.
- Browser QA on the static `/career/index.html` rendered the homepage with both hero choices visible and no current console warnings/errors.
- Dev-server QA on `http://127.0.0.1:5174/career/` rendered the homepage with both hero choices visible and no current console warnings/errors.

Guardrail:

- Before pushing to GitHub Pages, always run `npm run build`.
- Do not run `node scripts/site-build.mjs prepare` as a deployment step; it is now a compatibility no-op.
- A deploy-ready `career/index.html` must contain `/career/assets/` script/style references and must not contain `/src/main.tsx`.

## Active Slice: Consultant Media Simplification

Started: 2026-05-11

Scope:

- Reduce consultant/mentor profile media to exactly two image concepts.
- Keep the profile picture as the image used everywhere.
- Keep the top banner optional and hide its visual area when missing.
- Remove the old third `mapImageUrl` media path from the frontend contract and future backend saves.

Status: Completed for this slice.

## Consultant Media Simplification Change Log

- 2026-05-11: Removed `mapImageUrl` from the frontend consultant type, API update input, demo data, and backend consultant draft/update writes.
- 2026-05-11: Removed the third booking-sidebar media block from public consultant profiles.
- 2026-05-11: Made public profile top banners conditional: when `heroUrl` is missing, the profile starts directly with the profile picture and text.
- 2026-05-11: Updated home and directory spotlight media so banner media is only rendered when the consultant has a banner.
- 2026-05-11: Updated consultant dashboard copy to explain the profile picture is used everywhere and the top banner is optional.
- 2026-05-11: Hid the top-banner preview card in the dashboard when no banner is present.
- 2026-05-11: Updated README media documentation to describe the two-image model.

## Consultant Media Simplification Files Changed

- `src/app/legacy/SiteAppLegacy.tsx`
  - Removed the third public profile media block.
  - Added conditional top-banner rendering.
  - Updated consultant media upload copy and preview behavior.
- `src/styles/global.css`
  - Removed unused booking-card media CSS.
  - Added no-banner spacing for profile, homepage, and spotlight cards.
- `src/lib/types.ts`
  - Removed `mapImageUrl` from `ConsultantProfile`.
- `src/lib/api.ts`
  - Removed `mapImageUrl` from consultant update input.
- `src/lib/demo-data.ts`
  - Removed third demo image URLs.
- `backend/api/index.cjs`
  - Stops creating or preserving `mapImageUrl` on consultant drafts/profile saves.
- `README.md`
  - Documents profile picture plus optional top-banner model.
- `index.html` and `assets/`
  - Regenerated GitHub Pages deploy artifacts with `npm run build`.

## Consultant Media Simplification QA Notes

- Type check: `./node_modules/.bin/tsc --noEmit` passes.
- Backend syntax: `node -c backend/api/index.cjs` passes.
- Build: `npm run build` passes.
- Static Browser QA:
  - Served the parent `bobsnadenica.com` folder and opened `http://127.0.0.1:8000/career/index.html#/consultants/ana-petrova`.
  - Public consultant profile rendered successfully with one top banner and one profile avatar.
  - `.booking-card__media` count was `0`, confirming the third media box is gone.
  - No current console warnings/errors were observed.

## Next Queue After Consultant Media Simplification

- Add authenticated dashboard QA or a fixture path to verify optional banner upload/remove behavior with real saved profiles.
- Decide whether consultants need an explicit "remove banner" control when a banner already exists.
- Continue consultant dashboard polish around public profile draft readiness and availability management.

## Active Slice: Demo Population and Paid Theme Preview

Started: 2026-05-11

Scope:

- Populate the local fallback catalogue with enough fake data to evaluate real page density.
- Add clearly marked My Little Pony / Powerpuff Girls inspired demo consultants and demo users.
- Introduce a typed consultant profile theme field that can become a paid profile customization feature.
- Render themed profiles consistently across home, directory, spotlight, and public profile surfaces.

Status: Completed for this slice.

## Demo Population and Paid Theme Preview Change Log

- 2026-05-11: Added 10 fake consultant/mentor profiles to `src/lib/demo-data.ts`.
- 2026-05-11: Added 10 fake user/client profiles to `src/lib/demo-data.ts` for the user matching preview grid.
- 2026-05-11: Added optional `theme` support to the frontend consultant type, API update payload, and backend consultant draft/update/decorate flow.
- 2026-05-11: Added backend validation for supported consultant theme tokens: `violet`, `sky`, `rose`, `mint`, and `amber`.
- 2026-05-11: Gated saved consultant themes at the backend so only `pro` consultant accounts can persist a non-standard theme.
- 2026-05-11: Added visible theme color styling to consultant cards, home hero profiles, directory spotlight rows, spotlight cards, and public profile pages.
- 2026-05-11: Updated README data-model notes with the demo-data and paid-theme preview behavior.
- 2026-05-11: Rebuilt the GitHub Pages deploy artifact so `career/index.html` points to the latest generated CSS/JS assets.

## Demo Population and Paid Theme Preview Files Changed

- `src/lib/demo-data.ts`
  - Added seeded fake consultants and fake users.
  - Some fake consultants include paid-theme preview values and some intentionally have no optional banner.
- `src/lib/types.ts`
  - Added `ConsultantProfileTheme` and optional `ConsultantProfile.theme`.
- `src/lib/api.ts`
  - Allows consultant profile updates to carry `theme`.
- `backend/api/index.cjs`
  - Normalizes supported profile theme tokens and persists them only for `pro` consultant accounts.
- `src/app/legacy/SiteAppLegacy.tsx`
  - Adds shared theme style helpers for reusable profile surfaces.
- `src/styles/global.css`
  - Adds theme badge styles and themed card/profile surface treatment.
- `README.md`
  - Documents the demo catalogue and future paid theme behavior.
- `index.html` and `assets/`
  - Regenerated static deploy artifacts with `npm run build`.

## Demo Population and Paid Theme Preview QA Notes

- Type check: `./node_modules/.bin/tsc --noEmit` passes.
- Backend syntax: `node -c backend/api/index.cjs` passes.
- Build: `npm run build` passes and emits `/career/assets/index-1xpPYvp9.css` plus `/career/assets/index-CAp1ZVL8.js`.
- Static Browser QA:
  - Served the parent `bobsnadenica.com` folder and opened `http://127.0.0.1:8000/career/index.html?qa=demo-themes#/`.
  - Homepage rendered with 14 active consultant/mentor profiles, the two hero profile choices, and visible theme color treatment.
  - `/users` rendered 13 selectable demo user profiles and themed consultant matches with no console warnings/errors.
  - The themed demo profile `/consultants/blossom-utonium-demo` rendered one top banner, one profile avatar, and theme color treatment.
  - The no-banner demo profile `/consultants/pinkie-pie-demo` rendered with no empty top-banner area.
  - `.booking-card__media` count stayed `0`, confirming the removed third profile media slot did not return.

## Next Queue After Demo Population and Paid Theme Preview

- Add the real paid-plan UI for consultant theme selection in the dashboard after billing/plan rules are finalized.
- Add an admin/dev-only seed reset path before moving beyond local fallback demo data.
- Decide whether demo profiles should be hidden automatically when the backend returns enough real public consultants.

## Active Slice: Homepage Second Hero Banner

Started: 2026-05-11

Scope:

- Make the second hero profile on the homepage show its optional top banner image when one is available.
- Keep the fallback avatar behavior when the second profile has no top banner.
- Preserve responsive spacing so the second hero card does not crowd text on mobile.

Status: Completed for this slice.

## Homepage Second Hero Banner Change Log

- 2026-05-11: Updated `HomeHeroProfile` so both primary and secondary hero profile cards render `CoverMedia` when `heroUrl` exists.
- 2026-05-11: Added secondary hero banner sizing in CSS for desktop and compact mobile layouts.
- 2026-05-11: Rebuilt the GitHub Pages deploy artifact so `career/index.html` points to the latest generated CSS/JS assets.

## Homepage Second Hero Banner QA Notes

- Type check: `./node_modules/.bin/tsc --noEmit` passes.
- Backend syntax: `node -c backend/api/index.cjs` passes.
- Build: `npm run build` passes and emits `/career/assets/index-DyMW8EHg.css` plus `/career/assets/index-n3G0VnJm.js`.
- Static Browser QA:
  - Served the parent `bobsnadenica.com` folder and opened `http://127.0.0.1:8000/career/index.html?qa=second-hero-banner#/`.
  - Homepage title and URL matched the intended static CareerLane page.
  - The page rendered meaningful app content and no framework error overlay.
  - `.home-hero-profile` count was `2`.
  - `.home-hero-profile__media` count was `2` during this now-superseded banner-on-homepage pass.
  - `.home-hero-profile--secondary .home-hero-profile__media` count was `1` during this now-superseded banner-on-homepage pass.
  - `.home-hero-profile--secondary > .home-hero-profile__avatar` count was `0`, confirming the second hero profile uses its banner image instead of the avatar when a banner exists.
  - Browser console had no warnings/errors.

## Next Queue After Homepage Second Hero Banner

- Decide whether the hero right column should be compressed further so both hero profile cards are visible above the fold on shorter desktop viewports.

## Active Slice: Homepage Avatar-Only Hero Profiles and Theme Label Cleanup

Started: 2026-05-12

Scope:

- Remove public paid-feature labels from profile surfaces.
- Keep the underlying consultant color theme capability for later paid-plan UI work.
- Make both top homepage consultant/mentor hero cards avatar-only.
- Keep optional top banners on actual public consultant profile pages, where the banner belongs.

Status: Completed for this slice.

## Homepage Avatar-Only Hero Profiles and Theme Label Cleanup Change Log

- 2026-05-12: Removed public theme badge markup from public profiles, consultant cards, homepage hero profiles, directory spotlight rows, and spotlight cards.
- 2026-05-12: Removed the unused `.theme-pill` CSS.
- 2026-05-12: Updated `HomeHeroProfile` so it never renders `CoverMedia`; homepage hero consultant/mentor cards now use avatars only.
- 2026-05-12: Removed homepage-only hero banner CSS that became redundant after avatar-only behavior.
- 2026-05-12: Updated README notes so paid themes are documented as color treatment without public paid-feature copy.
- 2026-05-12: Rebuilt the GitHub Pages deploy artifact so `career/index.html` points to the latest generated CSS/JS assets.

## Homepage Avatar-Only Hero Profiles and Theme Label Cleanup QA Notes

- Type check: `./node_modules/.bin/tsc --noEmit` passes.
- Backend syntax: `node -c backend/api/index.cjs` passes.
- Build: `npm run build` passes and emits `/career/assets/index-DTAtyX1E.css` plus `/career/assets/index-HmHf6GIC.js`.
- Static Browser QA:
  - Served the parent `bobsnadenica.com` folder and opened `http://127.0.0.1:8000/career/index.html?qa=avatar-only-hero#/`.
  - Homepage title and URL matched the intended static CareerLane page.
  - The page rendered meaningful app content and no framework error overlay.
  - `.home-hero-profile` count was `2`.
  - `.home-hero-profile__media` count was `0`, confirming no homepage hero banner images are rendered.
  - `.home-hero-profile__avatar` count was `2`, confirming both top consultant/mentor hero cards use avatars.
  - The homepage DOM contained no public paid-theme wording.
  - The public profile `/consultants/blossom-utonium-demo` still rendered one `.profile-stage__cover`, confirming profile-page banners remain intact.
  - Browser console had no warnings/errors.

## Next Queue After Homepage Avatar-Only Hero Profiles and Theme Label Cleanup

- Decide whether paid theme selection should be shown only in the consultant dashboard, not on public profile cards.

## Active Slice: PR Repository Guardrails

Started: 2026-05-12

Scope:

- Add a GitHub Actions PR check that blocks accidental commits of local state and generated dependency folders.
- Block `.claude`, `.DS_Store`, `node_modules`, Dart/Flutter tool caches, and common Flutter platform dependency outputs.
- Clean already-tracked dependency and metadata files from the Git index while keeping local files on disk.

Status: Completed for this slice.

## PR Repository Guardrails Change Log

- 2026-05-12: Added `.github/workflows/pr-guardrails.yml` with a repository hygiene job for pull requests and pushes to `main`.
- 2026-05-12: Added `scripts/check-repo-guardrails.mjs`, which scans `git ls-files` and fails if forbidden generated/local paths are tracked.
- 2026-05-12: Expanded the root `.gitignore` for `.claude`, `.DS_Store`, `node_modules`, Dart/Flutter tool cache files, and generated build/dependency outputs.
- 2026-05-12: Removed already-tracked `career/node_modules`, `career/backend/api/node_modules`, and tracked `.DS_Store` files from the Git index using `git rm --cached`; local files remain on disk.
- 2026-05-12: Updated the PR Guardrails workflow from `actions/checkout@v4` / `actions/setup-node@v4` / Node 20 to `actions/checkout@v6` / `actions/setup-node@v6` / Node 24 to avoid GitHub Actions Node 20 runtime deprecation warnings.

## PR Repository Guardrails QA Notes

- Local guardrail check: `node scripts/check-repo-guardrails.mjs` passes.
- After cleanup, `git ls-files` no longer reports tracked `.claude`, `node_modules`, `.DS_Store`, Dart/Flutter tool caches, or common Flutter platform dependency outputs.

## Next Queue After PR Repository Guardrails

- Consider adding a second CI job for the CareerLane app itself: install dependencies from lockfiles, run `npm run build`, and optionally run backend syntax checks.

## Active Slice: Avatar And Layout Density Polish

Started: 2026-05-12

Scope:

- Make the two homepage top consultant/mentor avatars larger and better fill their cards.
- Show user profile pictures on the "За потребители" page, including the selected match summary and demo user cards.
- Reduce unused vertical space in the `/consultants` hero area by tightening the right spotlight panel without removing important content.
- Keep AI/test account labels visible and avoid public paid-feature wording.

Status: Completed for this slice.

## Avatar And Layout Density Polish Change Log

- 2026-05-12: Added avatar URLs for the first three demo user profiles so every demo user can render a profile picture.
- 2026-05-12: Added selected-user avatar rendering to the `/users` hero card.
- 2026-05-12: Added avatars to every demo user selection card while keeping the AI test user label.
- 2026-05-12: Enlarged homepage top consultant/mentor avatars and made the secondary avatar fill the card height to remove the empty area below it.
- 2026-05-12: Compacted the `/consultants` hero spotlight panel, secondary spotlight rows, and next-slot card to reduce unused area below the active profile stats.
- 2026-05-12: Changed the `/consultants` hero secondary spotlight cards to a compact two-column desktop layout, with a single-column fallback on smaller screens.
- 2026-05-12: Adjusted demo user card headers after rendered QA so AI test labels and profile selection buttons no longer crowd each other.

## Avatar And Layout Density Polish QA Notes

- Build: `npm run build` passes and emits `/career/assets/index-BhA4eiWW.css` plus `/career/assets/index-yfK4Y14d.js`.
- Backend syntax: `node -c backend/api/index.cjs` passes.
- Repository guardrail check: `node scripts/check-repo-guardrails.mjs` passes.
- Diff hygiene: `git diff --check` passes.
- Static Browser QA:
  - Served the parent `bobsnadenica.com` folder and opened `http://127.0.0.1:8000/career/index.html?qa=avatar-density-3#/`.
  - Homepage title and URL matched the intended static CareerLane page.
  - Homepage rendered meaningful app content with `.home-hero-profile` count `2`, `.home-hero-profile__avatar` count `2`, and `.home-hero-profile__media` count `0`.
  - `/users` rendered meaningful app content with `.user-match-card__avatar` count `1`, `.demo-user-card` count `13`, `.demo-user-card__avatar` count `13`, and `.demo-user-card .demo-account-badge` count `13`.
  - `/users` interaction check: selecting the second demo user changed that card button to "Избран профил" and updated the hero context to Георги Петров.
  - `/consultants` rendered meaningful app content with one lead hero spotlight, two compact secondary spotlights, visible AI test labels, and no console warnings/errors.

## Next Queue After Avatar And Layout Density Polish

- Continue the professional-grade pass through the catalogue cards below the hero, especially mobile density and long Bulgarian label wrapping.
- Add a real CI app job for `npm run build`, backend syntax, and repository guardrails so these checks run automatically with pull requests.

## Active Slice: Portrait Avatar Framing

Started: 2026-05-12

Scope:

- Fix avatar images that felt too zoomed-in after the previous avatar sizing pass.
- Convert avatar frames from square crops to portrait-ratio surfaces across homepage, `/users`, `/consultants`, and public consultant profile pages.
- Preserve full uploaded/generated images inside the portrait frame until the product has a dedicated upload cropper.
- Patch any obvious responsive header polish found during mobile QA.

Status: Completed for this slice.

## Portrait Avatar Framing Change Log

- 2026-05-12: Changed homepage top consultant/mentor avatars from square frames to taller portrait frames.
- 2026-05-12: Changed user demo cards, selected-user hero avatars, consultant cards, directory spotlights, lead spotlight cards, and public profile avatars to portrait dimensions.
- 2026-05-12: Switched rendered avatar images to `object-fit: contain` inside their portrait frames so uploaded/generated images are not aggressively cropped before crop tooling exists.
- 2026-05-12: Tightened the narrow-mobile header auth button width after rendered QA showed it could sit too close to the viewport edge.
- 2026-05-12: Rebuilt the GitHub Pages deploy artifact so `career/index.html` points to the latest generated CSS/JS assets.

## Portrait Avatar Framing QA Notes

- Build: `npm run build` passes and emits `/career/assets/index-C5jF8ExL.css` plus `/career/assets/index-DVq_4BgN.js`.
- Static Browser QA:
  - Homepage at `http://127.0.0.1:8000/career/index.html?qa=portrait-contain#/` rendered two avatar-only top profiles and no homepage banner media.
  - `/users` rendered `13` demo user avatars and one selected-user avatar with no console warnings/errors.
  - `/consultants` rendered `14` consultant-card avatars with no console warnings/errors.
  - `/consultants/blossom-utonium-demo` rendered the public profile avatar as a portrait frame with no console warnings/errors.
  - Mobile `/consultants` at `390x844` rendered portrait avatars and the header auth button without console warnings/errors.
  - Mobile `/users` at `390x844` rendered `13` demo avatars and one selected-user avatar without console warnings/errors.

## Next Queue After Portrait Avatar Framing

- Add an actual image crop/preview step to profile editing so real users can control how their avatar fits the portrait frame.
- Continue mobile header polish if authenticated states with long user names need extra compression.

## Active Slice: Demo Avatar Upload Test Assets

Started: 2026-05-12

Scope:

- Add local AI/demo avatar assets that simulate uploaded images for portrait, landscape, and square aspect ratios.
- Use original demo artwork rather than official copyrighted character artwork.
- Wire the assets into Powerpuff-inspired demo consultant and user accounts so avatar framing can be inspected in real UI surfaces.
- Ensure the GitHub Pages build copies those local demo assets into the deployed `/career/` directory.

Status: Completed for this slice.

## Demo Avatar Upload Test Assets Change Log

- 2026-05-12: Added three original local SVG demo avatar assets:
  - `/career/demo-avatars/sugar-pop-portrait.svg`
  - `/career/demo-avatars/sugar-pop-landscape.svg`
  - `/career/demo-avatars/sugar-pop-square.svg`
- 2026-05-12: Updated Blossom, Bubbles, and Buttercup demo consultant avatars to use the local portrait, landscape, and square test assets.
- 2026-05-12: Updated Bliss, Mojo Jojo, and Princess demo user avatars to use the same local portrait, landscape, and square test assets.
- 2026-05-12: Updated `scripts/site-build.mjs` to copy the Vite public `demo-avatars` directory into the static GitHub Pages deploy artifact.
- 2026-05-12: Rebuilt the static deploy artifact so `career/index.html` points at the latest generated JS asset.

## Demo Avatar Upload Test Assets QA Notes

- Build: `npm run build` passes and emits `/career/assets/index-C5jF8ExL.css` plus `/career/assets/index-C5fBJAQw.js`.
- Static file check: `http://127.0.0.1:8000/career/demo-avatars/sugar-pop-portrait.svg` returns `200 OK`.
- Static Browser QA:
  - `/consultants` rendered meaningful app content with `4` currently visible local demo avatar images: portrait `2`, landscape `1`, square `1`, and no console warnings/errors.
  - `/users` rendered meaningful app content with `13` demo-card avatars and `6` local demo avatar images across the current route state: portrait `2`, landscape `2`, square `2`, and no console warnings/errors.
  - Scrolling to the `/users` demo card section kept cards rendered without console warnings/errors.

## Next Queue After Demo Avatar Upload Test Assets

- Add upload-time guidance and a crop/fit selector so real users can choose between "fill frame" and "show full image" behavior.
- Consider marking these local assets as demo-only in admin/dev documentation if the seed data grows.

## Active Slice: Avatar Card Fill Polish

Started: 2026-05-12

Scope:

- Remove the unprofessional empty space inside portrait avatar frames on consultant catalogue cards.
- Keep the portrait-frame direction, but fill the frame for public display surfaces.
- Preserve the local portrait, landscape, and square demo upload assets as visual test cases.

Status: Completed for this slice.

## Avatar Card Fill Polish Change Log

- 2026-05-12: Changed rendered avatar images from `object-fit: contain` to `object-fit: cover` with a face-friendly `object-position`.
- 2026-05-12: Rebuilt the static deploy artifact so the latest CSS is used by `/career/index.html`.

## Avatar Card Fill Polish QA Notes

- Build: `npm run build` passes and emits `/career/assets/index-RtA51r8R.css` plus `/career/assets/index-Cr-s1uIe.js`.
- Static Browser QA:
  - `/consultants` rendered meaningful app content with `14` consultant-card avatars, `4` visible local demo avatar images, and no console warnings/errors.
  - Scrolled to the lower consultant catalogue card section matching the reported screenshot; the avatar frames were filled instead of leaving dead space below the image.

## Next Queue After Avatar Card Fill Polish

- Add an upload crop/position editor so users can control how non-portrait uploads are cropped instead of relying only on automatic `cover` behavior.
- Consider a per-profile focal point field if users upload many landscape headshots.

## Continuity Checkpoint: Professional-Grade Push

Recorded: 2026-05-12

This is the current memory checkpoint before the larger professional redesign/polish phase.

Current product shape:

- CareerLane is the nested product at `/career/index.html` inside the main `bobsnadenica.com` GitHub Pages site.
- The root website remains separate; CareerLane must continue to build as a static GitHub Pages-compatible app under `/career/`.
- The backend is AWS-based and remains separate from GitHub Pages hosting.
- The app supports two roles:
  - users/clients looking for career consultation or mentorship
  - consultants/mentors publishing profiles and managing their presence

Important product decisions already made:

- Consultant/mentor media model has exactly two image concepts:
  - `avatarUrl` / `avatarStorageKey`: profile picture used everywhere
  - `heroUrl` / `heroStorageKey`: optional profile-page top banner
- The homepage top consultant/mentor hero cards use avatars only; no banner images on the front page.
- Public profile pages may still render an optional top banner when present.
- If a consultant has no top banner, the banner area is hidden rather than left as an empty box.
- Public UI must not show paid-feature copy like "Pro theme" on profile cards.
- The paid color-theme concept exists in the data/model path, but the user-facing paid setting UI is not built yet.
- Fake demo profiles are intentionally obvious and use My Little Pony / Powerpuff Girls inspired demo names.
- Demo images must remain generic generated avatars/placeholders, not copyrighted character artwork.
- `.claude`, `node_modules`, `.DS_Store`, Dart/Flutter caches, and generated Flutter dependency outputs must not be committed.

Current quality/verification baseline:

- Static deploy artifact must be generated with `npm run build`.
- A deploy-ready `career/index.html` must reference `/career/assets/index-*.js` and `/career/assets/index-*.css`.
- It must not reference `/src/main.tsx`.
- Existing verified checks include:
  - TypeScript frontend check: `./node_modules/.bin/tsc --noEmit`
  - Backend syntax check: `node -c backend/api/index.cjs`
  - Production build: `npm run build`
  - Static Browser QA via parent-folder static server and `/career/index.html`
  - Repository guardrail check: `node scripts/check-repo-guardrails.mjs`

Professional-grade improvement priorities:

1. Visual system and layout polish:
   - Reduce overlap and crowded text across desktop/mobile.
   - Create a tighter design system for cards, chips, buttons, forms, spacing, and responsive grids.
   - Make consultant cards, profile pages, dashboards, and auth flows feel consistent and production-grade.
2. Homepage and discovery experience:
   - Make the first viewport clearer and more premium.
   - Keep the two top consultant/mentor profile choices avatar-only.
   - Improve the catalogue preview, filtering, and empty/error/loading states.
3. Consultant dashboard:
   - Improve profile readiness, editing ergonomics, media upload/remove flows, availability management, and preview fidelity.
   - Add paid color-theme selection later, gated by plan.
4. User/client experience:
   - Improve user profile creation, matching explanations, consultant comparison, and booking entry points.
   - Make demo personalization useful without feeling like production data.
5. Backend and production hardening:
   - Add stronger validation for public profile fields.
   - Add safer auth/profile edge-case handling.
   - Add booking lifecycle rules and clearer error responses.
6. CI and release safety:
   - Keep repository hygiene checks.
   - Add a CareerLane CI job for install/build/backend syntax.
   - Consider lightweight browser smoke tests against the static build.

Do-not-regress checklist:

- Do not reintroduce a third consultant image slot.
- Do not show empty top-banner boxes.
- Do not show public paid-theme badges/copy.
- Do not make the homepage top profiles use banners.
- Do not rewrite `career/index.html` into a dev entry file.
- Do not commit local dependency folders or agent worktrees.

## Active Slice: Production Readiness And Security Pass

Started: 2026-05-12

Scope:

- Continue from the implementation tracker and audit the repo, frontend build, backend Lambda, Terraform deploy config, and CI guardrails.
- Fix low-risk production/security issues immediately instead of only recording them as future work.
- Keep changes compatible with the current GitHub Pages `/career/` frontend and separate AWS backend.
- Record what is fixed, what was verified, and what still blocks a true production-ready/security-ready claim.

Status: In progress. This pass improves readiness, but the project is **not yet 100% production-grade/security-ready** until the remaining blockers below are finished and verified against the live AWS environment.

## Production Readiness And Security Pass Change Log

- 2026-05-12: Improved profile photo presentation so consultant avatars render as larger portrait blocks on homepage hero cards, directory cards, spotlight cards, and public profile headers instead of feeling like small square thumbnails.
- 2026-05-12: Moved review count text such as `22 мнения` out of the cramped separate rating column and into a normal review chip inside consultant card identity content.
- 2026-05-12: Added visible AI/test labels for demo consultant and demo user accounts: `AI тестов профил` and `AI тестов потребител`.
- 2026-05-12: Extended repository hygiene guardrails to block Terraform local state, `terraform.tfvars`, Terraform plan files, `.terraform/`, and `.terraform-build/` packaged deployment artifacts.
- 2026-05-12: Extended repository hygiene guardrails to ignore and block local `.env.local` / `.env.*.local` override files while keeping intentional Vite public environment templates/artifacts separate.
- 2026-05-12: Removed tracked `infra/terraform/terraform.tfvars` and `infra/terraform/.terraform-build/careerdoc-api.zip` from the Git index while keeping local files on disk.
- 2026-05-12: Added the CareerLane CI job to `.github/workflows/pr-guardrails.yml`: install frontend deps, run `npm run build`, install backend Lambda deps, and run `node -c backend/api/index.cjs`.
- 2026-05-12: Confirmed `actions/checkout@v6`, `actions/setup-node@v6`, and Node 24 are the correct current GitHub Actions direction for the Node 20 action-runtime deprecation.
- 2026-05-12: Hardened backend CORS fallback from permissive `*` to the production origin fallback.
- 2026-05-12: Changed invalid JSON bodies to return `400` instead of falling through as server errors.
- 2026-05-12: Stopped self-service role/plan escalation:
  - existing users keep their stored role during bootstrap
  - client request bodies can no longer set `plan`
  - `updateMeProfile` preserves the current server-side plan
- 2026-05-12: Stopped consultants from self-setting marketplace ranking fields: `featured`, `rating`, and `reviewCount` now preserve server-stored values.
- 2026-05-12: Restricted profile image uploads to JPEG, PNG, and WebP; SVG and arbitrary `image/*` uploads are no longer accepted.
- 2026-05-12: Added bounded backend normalization for profile text, string lists, ages, prices, years of experience, and session length.
- 2026-05-12: Added storage-key ownership checks so users can only attach CV/avatar/banner keys under their own S3 upload prefixes.
- 2026-05-12: Changed unexpected backend errors to return generic `500` messages while still logging the actual error server-side.
- 2026-05-12: Reduced booking race risk by writing booking requests through a DynamoDB transaction that records the chosen slot on the consultant item and fails if the slot was already booked.
- 2026-05-12: Added Terraform IAM permission for `dynamodb:TransactWriteItems` so the Lambda can perform the transactional booking write after deployment.
- 2026-05-12: Fixed a rendered frontend bug where the `/consultants` hero button linked to `#consultant-directory`, which HashRouter interpreted as a missing route and sent users to the 404 page.
- 2026-05-12: Normalized CSS typography guardrails by removing negative `letter-spacing` and viewport-scaled font-size rules from `src/styles/global.css`.

## Production Readiness And Security Pass Files Changed

- `.gitignore`
  - Ignores Terraform state, plans, local variable files, and packaged build artifacts.
- `.github/workflows/pr-guardrails.yml`
  - Adds the CareerLane build/backend syntax CI job.
- `scripts/check-repo-guardrails.mjs`
  - Blocks tracked Terraform local/deploy artifacts and local environment overrides in addition to existing local-state/dependency rules.
- `backend/api/index.cjs`
  - Adds safer CORS fallback, validation, plan/ranking protections, owned storage-key checks, safer upload MIME rules, generic 500 responses, and transactional booking writes.
- `infra/terraform/main.tf`
  - Adds Lambda permission for DynamoDB transactional writes.
- `src/app/legacy/SiteAppLegacy.tsx`
  - Replaces the hash-anchor catalogue button with a scroll button so HashRouter stays on `/consultants`.
  - Adds AI/test badges for demo accounts and moves consultant card reviews into a non-overlapping chip row.
- `src/styles/global.css`
  - Removes negative letter spacing and viewport-driven font-size scaling.
  - Enlarges avatar/profile-photo treatments and adds demo/review badge styling.
- `infra/terraform/terraform.tfvars`
  - Removed from Git tracking; remains local and ignored.
- `infra/terraform/.terraform-build/careerdoc-api.zip`
  - Removed from Git tracking; remains local and ignored.

## Production Readiness And Security Pass QA Notes

- Repository hygiene: `node scripts/check-repo-guardrails.mjs` passes and reports 192 tracked files.
- Backend syntax: `node -c backend/api/index.cjs` passes.
- Terraform formatting: `terraform fmt` passes and formatted `infra/terraform/main.tf`.
- Terraform checks: `terraform fmt -check` passes and `terraform validate` reports the configuration is valid.
- Frontend production build: `npm run build` passes and emits `/career/assets/index-CRvtUYmr.css` plus `/career/assets/index-CDHzTufU.js`.
- Staged diff hygiene: `git diff --cached --check` passes after cleaning generated asset trailing whitespace.
- In-app browser smoke QA:
  - `/career/#/` renders `Начало | CareerLane`, shows meaningful homepage content, and has no console warnings/errors.
  - `/career/#/consultants` renders `Каталог на профили | CareerLane`, shows meaningful catalogue content, and has no console warnings/errors.
  - Clicking `Виж профилите` on `/consultants` now keeps the URL on `#/consultants`, scrolls to the catalogue controls, and does not show the 404 page.
  - `/career/#/auth?tab=register&role=consultant` renders `Вход и регистрация | CareerLane`, preselects the consultant flow, and has no console warnings/errors.
  - `/career/#/consultants` shows `AI тестов профил` labels and review-count chips without console warnings/errors.
  - `/career/#/users` shows `AI тестов потребител` labels for demo users and `AI тестов профил` labels for matched demo consultants without console warnings/errors.
  - `/career/#/consultants/blossom-utonium-demo` shows the larger public-profile avatar plus the AI/test label without console warnings/errors.
- Static GitHub-Pages-style QA:
  - Served the parent `bobsnadenica.com` folder and opened `http://127.0.0.1:8000/career/index.html#/consultants`.
  - Static `/career/index.html` rendered `Каталог на профили | CareerLane`, loaded the generated CSS/JS assets, and had no console warnings/errors.
  - The static catalogue `Виж профилите` button stayed on `#/consultants`, exposed the catalogue controls, and did not show the 404 page.
  - Static `/career/index.html#/consultants/blossom-utonium-demo` rendered the larger public-profile avatar and `AI тестов профил` label without console warnings/errors.

## Mobile Hero Avatar Crop Polish

Started: 2026-05-13

Scope:

- Fix the mobile homepage hero profile cards where the first avatar left too much dead space below the media area.
- Stop square and landscape avatar uploads from being aggressively cropped and zoomed in on public profile surfaces.
- Keep the current avatar-only front-page direction, with no hero/banner media on those two profile cards.

Status: Completed for this slice.

Change Log:

- 2026-05-13: Added aspect-ratio detection in `AvatarMedia` so rendered profile images receive portrait, square, or landscape classes after load.
- 2026-05-13: Kept portrait avatars as filled portrait treatments, while square and landscape uploads now use contained presentation inside the same frame instead of face-cutting cover crops.
- 2026-05-13: Reworked the mobile homepage hero profile card sizing so both top profile cards use the same larger avatar frame and the secondary card no longer stretches the avatar to the full card height.
- 2026-05-13: Rebuilt the static deploy artifact for `/career/index.html` so GitHub Pages serves the updated avatar CSS and component code.

QA Notes:

- Build: `npm run build` passes and emits `/career/assets/index-DH7JQZfN.css` plus `/career/assets/index-Fl6H--G1.js`.
- Static Browser QA:
  - `/career/index.html?qa=avatar-mobile-polish#/` rendered `Начало | CareerLane` with meaningful homepage content and no console warnings/errors in the in-app browser.
  - Headless mobile screenshot at `390x1600` showed the first hero avatar card without the previous large dead area, and the second square/DiceBear avatar displayed contained rather than zoomed/cropped.

Next:

- Add a real upload preview/crop-position control in profile editing so users can choose how portrait, square, and landscape images are framed before publishing.
- Add automated route screenshot checks for the homepage hero cards at mobile width once the static browser smoke-test suite is added to CI.

## Mobile Profile Card Centering Polish

Started: 2026-05-13

Scope:

- Make the phone layout feel intentionally centered instead of squeezed into a desktop-style side-by-side card.
- Center homepage hero consultant/mentor avatars, badges, titles, and metadata on narrow screens.
- Center consultant catalogue card headers, avatar blocks, badges, review pills, and actions on narrow screens while preserving readable left-aligned long summary copy.

Status: Completed for this slice.

Change Log:

- 2026-05-13: Re-centered the mobile container instead of forcing a left margin.
- 2026-05-13: Changed mobile homepage hero profile cards to a one-column centered layout with consistent avatar sizing for both top profile choices.
- 2026-05-13: Changed mobile consultant cards to center their profile header, avatar, status chips, review chips, topic chips, slots, and footer action.
- 2026-05-13: Rebuilt the static deploy artifact for `/career/index.html` so GitHub Pages serves the centered mobile CSS.

QA Notes:

- Build: `npm run build` passes and emits `/career/assets/index-BxMoGNXi.css` plus `/career/assets/index-DZPqyWRM.js`.
- Static Browser QA:
  - `/career/index.html?qa=mobile-centered#/` rendered `Начало | CareerLane` with meaningful homepage content and no console warnings/errors.
  - `/career/index.html?qa=mobile-centered#/consultants` rendered `Каталог на профили | CareerLane` with meaningful catalogue content and no console warnings/errors.
  - Narrow screenshots at `500x1600` showed centered homepage hero profile cards and centered consultant catalogue profile headers/actions.

Next:

- Re-check on a real iPhone/Safari session after deploy because desktop headless Chrome uses slightly different viewport behavior from the user's phone browser.
- Continue mobile polish on auth, dashboard, and profile editing after the public profile-card surfaces are stable.

## Remaining Production Blockers

- Deploy/apply required:
  - The backend and Terraform changes are local until the Lambda package is rebuilt and deployed and Terraform is applied.
  - After deploy, re-test `/health`, authenticated bootstrap/profile update, upload URL creation, and booking creation against the real AWS API.
- Secret/state hygiene:
  - `terraform.tfvars` and `.terraform-build` are no longer tracked, but if any sensitive values were ever pushed previously, rotate them.
  - Move Terraform state to a remote encrypted backend before serious production use; do not rely on local state files.
- Backend tests:
  - Add mocked Lambda tests for role/plan escalation, ranking-field preservation, owned storage-key rejection, upload MIME rejection, invalid JSON, and booking transaction conflicts.
- Authenticated browser QA:
  - The current QA is signed-out/public-route QA. Dashboard profile editing, uploads, consultant settings, and bookings need live authenticated QA or a fixture harness.
- Booking lifecycle:
  - Transactional slot locking exists for creation, but cancellation/rescheduling endpoints must remove or manage `bookedSlots` before this is a complete booking lifecycle.
- Abuse/security controls:
  - Add rate limiting/WAF or API throttling policy, structured audit logs for booking/profile changes, and a production monitoring/alarm plan.
- CI coverage:
  - CI now builds and checks syntax, but it still needs automated static browser smoke tests for `/career/index.html` and route-level regression tests.
- Frontend polish:
  - Public pages load and are cleaner, but the product still needs a full professional visual pass over auth, dashboard, profile editing, empty states, and mobile breakpoints before user testing.
