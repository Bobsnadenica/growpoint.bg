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
- **Production `www.growpoint.bg` is GitHub Pages** — served from the committed repo root (`index.html`, `assets/`, route-copy folders). A push to `main` deploys it.
- **CloudFront (`d30m6jtjij7col.cloudfront.net`) is the test/cutover domain only**, served from an S3 bucket; refreshed with `npm run deploy:cloudfront`.
- API: `https://zmajj05nm1.execute-api.eu-west-1.amazonaws.com`. Region `eu-west-1`.
- AWS resource names are `growpoint-dev-*`. **Exception: the Cognito user pool name is pinned to `careerdoc-dev-users`** — a pool name is immutable; renaming destroys all accounts. Leave it.

## Run & verify
```
npm run dev              # local dev server (vite)
npm run build            # GATE: check-theme + tsc + vite + route copies (run before commit)
npm run smoke:prod       # 14 read-only prod checks (expect 14/14)
bash scripts/check-secrets.sh   # secret scan
node --check backend/api/index.cjs   # backend syntax
```
`npm run build` writes the built site into the repo root (that's what GitHub Pages serves).

## Deploy
1. `npm run build` + `bash scripts/check-secrets.sh` (must pass).
2. Backend/infra change → review `terraform plan` first, then `terraform -chdir=infra/terraform apply`. **Never apply a plan that destroys a DynamoDB table or replaces the Cognito user pool.**
3. Commit + push to `main` → GitHub Pages deploys `www`. Optionally `npm run deploy:cloudfront` for the test domain.
4. The owner sometimes auto-commits to `main` as `ko` mid-session — re-check `git log` before committing.

## Conventions & gotchas
- **Overlays:** all modals/lightboxes render via `createPortal(..., document.body)` — page CSS otherwise breaks `position:fixed` and the sticky header covers them.
- **Dark theme:** every color needs a `:root[data-theme="dark"]` override; enforced by `scripts/check-theme.mjs` (part of `npm run build`).
- **Assets:** static files referenced as `/assets/...` live in `public/assets/` (dev + build) and end up at the deployed root. The logo header uses `/assets/logo.svg` (light) + `/assets/logo-dark.svg` (dark theme swap).
- **CORS for local API testing:** temporarily add `http://localhost:5173` to `frontend_origins` in tfvars + apply; **always revert + re-verify** afterward.

## Business model (current)
- All expert tiers are **paid** (Start 9.99 / Grow 29.99 / Spotlight 99.99 €/mo). **Clients are free.** Online payment (Stripe) is **not built yet** — pricing buttons show "Очаквай скоро".
- **No approval step.** A consultant is public when their account is *active* (`comped` via admin invite, or a `granted`/`purchased` package) and the profile passes a completeness bar. Gate logic: `consultantMembershipActive()` in the backend.
- **Mentor onboarding is invite-only** until Stripe: admin sends an email invite (`/admin`) → recipient signs up free (`comped`). Self-serve consultant signup is blocked with a notice.
- **Admin** can invite, restrict/suspend (hides profile + disables Cognito login), message users, grant packages, feature profiles.

## Security rules
- Secrets only in gitignored `terraform.tfvars`. `README.md` and `test.txt` are **public** — no secrets.
- Auth comes from the API Gateway Cognito JWT authorizer; handlers call `requireAuth`/`requireAdmin`. No XSS sinks (no `innerHTML`/`dangerouslySetInnerHTML`).
- Don't dump production Cognito user data into logs/output.

## Known follow-ups
See `plan.txt` for ready-to-run prompts. Biggest items: Stripe checkout, SES production access (sandbox today — email doesn't deliver to arbitrary recipients yet), per-request `restricted` enforcement.
