# AGENTS.md

Guide for AI/dev sessions on this repo. Keep it short; update it when something here goes stale.

## What this is
**GrowPoint** (growpoint.bg) — a Bulgarian career-mentoring marketplace. Clients book sessions with consultants/mentors. React SPA + serverless AWS backend.

## Stack & where things live
- **Frontend:** React + Vite SPA (`BrowserRouter`). Most UI is in `src/app/legacy/SiteAppLegacy.tsx` (large). Header/footer/nav in `src/app/layout/AppShell.tsx`. Thin route wrappers in `src/app/pages/*`. API client `src/lib/api.ts`, auth `src/lib/auth.tsx` + `src/lib/auth-flow.ts`, types `src/lib/types.ts`. Styles: one file `src/styles/global.css`.
- **Backend:** one Lambda, `backend/api/index.cjs`. Routes are dispatched at the bottom of the file; **every new route also needs an `aws_apigatewayv2_route` in `infra/terraform/main.tf`.**
- **Infra:** Terraform in `infra/terraform/`. Real values live in `infra/terraform/terraform.tfvars` (**gitignored — never commit**).
- **Helper scripts:** `scripts/` (build, smoke test, data migrations, seed).

## Hosting (important)
- **Production apex and `www.growpoint.bg` use CloudFront + private S3.** DNS routes and the issued certificate are verified; apex redirects to canonical HTTPS www. **A Git push does not publish CloudFront**; use `npm run deploy:cloudfront`.
- GitHub stores source/CI and legacy Pages root artifacts. The raw CloudFront domain (`d30m6jtjij7col.cloudfront.net`) remains a preview address. The authorized apex cutover passes the 4/4 domain gate; existing mail and ACM validation records are preserved.
- API: `https://zmajj05nm1.execute-api.eu-west-1.amazonaws.com`. Region `eu-west-1`.
- AWS resource names are `growpoint-dev-*`. AWS provider 6.63 supports renaming the existing Cognito pool friendly name to `growpoint-dev-users` in place. Its ID must remain unchanged; `prevent_destroy` protects accounts. Never use the old provider 5.x to perform this rename (it proposes replacement).

## Run & verify
```
npm run dev              # local dev server (vite)
npm run build            # GATE: check-theme + tsc + vite + route copies (run before commit)
npm run build:cloudfront # production build in ignored dist/; no upload
npm test                # full regression gate; record current release total
npm run smoke:prod       # read-only: 19/19 www; 20/20 with CloudFront SPA check
npm run check:launch-domains   # both hosts: valid TLS + HTTP-to-HTTPS (require 4/4)
npm run qa:identity      # safe default: zero requests; live flags need explicit disposable-test approval
bash scripts/check-secrets.sh   # secret scan
node --check backend/api/index.cjs   # backend syntax
```
`npm run build` writes legacy Pages artifacts into the repo root. Production deployment builds `dist/` separately and uploads it to private S3.

## Deploy
1. `npm run build` + `bash scripts/check-secrets.sh` (must pass).
2. Backend/infra change → review `terraform plan` first, then `terraform -chdir=infra/terraform apply`. **Never apply a plan that destroys a DynamoDB table or replaces the Cognito user pool.**
3. Commit + push to `main`, then `npm run deploy:cloudfront`. GitHub CI/Pages success is not a production CloudFront deployment.
4. Wait for invalidation completion; verify live www HTML/JS/CSS bytes, media MIME/bytes, direct routes, authentication and the full domain gate. Hashed JS/CSS are immutable; stable assets revalidate after 300 seconds. Old hashed chunks remain for open tabs.
5. The owner sometimes auto-commits to `main` as `ko` mid-session — re-check `git log` before committing.

## Conventions & gotchas
- **Overlays:** all modals/lightboxes render via `createPortal(..., document.body)` — page CSS otherwise breaks `position:fixed` and the sticky header covers them.
- **Dark theme:** every color needs a `:root[data-theme="dark"]` override; enforced by `scripts/check-theme.mjs` (part of `npm run build`).
- **Assets:** static `/assets/...` files live in `public/assets/`; existing owner creatives are tracked in `assets/advertisement/` and copied into both deployment builds. Preserve those originals. Header logos use `/assets/logo/logo_dark.png` + `/assets/logo/logo_white.png`. Require real media MIME/bytes: CloudFront can return SPA HTML with status 200 for a missing asset.
- **Routes:** dynamic SPA documents return HTTP 200 on CloudFront. Missing profiles/routes show client not-found/noindex state, not a native server 404. Consultant visibility still comes from the live API.
- **CORS for local API testing:** temporarily add `http://localhost:5173` to `frontend_origins` in tfvars + apply; **always revert + re-verify** afterward.

## Business model (current)
- All expert tiers are **paid** (Start 9.99 / Grow 29.99 / Spotlight 99.99 €/mo). **Clients are free.** Public DSK checkout remains a labelled preview. Five website fake-card flows pass bank/return verification; two earlier portal cases are separate. Sandbox is verified disabled with empty deployed credentials and no Terraform drift. This is not production approval. Automatic bank sandbox notices are authorized, but never send reports/messages yourself. The owner submits results.
- Every active expert offers one free client session per scheduled Sofia calendar month; booking/quota/slot changes are atomic, not points or paid status. Grow/Spotlight rank first within filters; Spotlight owns banner/colors plus tracked request-based podcast/campaign/quarterly-room fulfillment. Existing manual/comped memberships are preserved; real monthly billing remains future integration work.
- **No approval step.** A consultant is public when their account is *active* (`comped` via admin invite, or a `granted`/`purchased` package) and the profile passes a completeness bar. Gate logic: `consultantMembershipActive()` in the backend.
- **Mentor onboarding is invite-only** until real payment integration: admin sends an email invite (`/admin`) → recipient signs up free (`comped`). Self-serve consultant signup is blocked with a notice.
- **Admin** can invite, restrict/suspend (hides profile + disables Cognito login), message users, grant packages, feature profiles.

## Security rules
- Secrets only in ignored owner-only backend settings (`*.tfvars`); state/plans are private too. UAT credentials must be empty when testing is disabled; that deployed state is now verified. `README.md`, `memory.md` and test reports are **public** — no secrets, tokens or private account/provider references.
- Auth comes from the API Gateway Cognito JWT authorizer; handlers call `requireAuth`/`requireAdmin`. No XSS sinks (no `innerHTML`/`dangerouslySetInnerHTML`).
- Don't dump production Cognito user data into logs/output.
- Historical shared QA credential exposure is confirmed. Owner-approved rotation and session revocation are verified on all four supplied accounts; old JWT/refresh access is rejected. Never reuse the retired credential. History rewriting is not approved; clean current files cannot erase old copies. Exact incident locators remain private outside Git.
- DynamoDB transaction `ConditionCheck` requires scoped `dynamodb:ConditionCheckItem`, not just ordinary writes. Local mocks do not prove deployed IAM.
- `--live-mutate` is retired: never fabricate paid packages/attendance or manually clean DynamoDB to claim lifecycle QA. Use the gated client-only identity script; report its S3/expert/email limitations.

## Known follow-ups
Read `memory.md` and `docs/qa-2026-09-30.md` for current release gates; historical plans may be stale. Both production hosts route to CloudFront; validation records are published, the issued certificate covers both names, and the full domain gate passes 4/4. Other gates: SES production delivery, approved operator/legal details, disposable-account lifecycle tests, real social callbacks and DKS integration. SES domain/DKIM verify, but production review is denied; sandbox/simulator acceptance is not delivery. `/admin/dashboard` uses existing Cognito admin access only. Recheck the full domain gate after releases. Keep updates brief and interact directly with the authorized Mac UI; never bypass a locked screen or unrelated app boundaries.
