# Social login setup (Google / Apple / LinkedIn)

This runbook walks you from "demo mode" to a real OAuth login. Until you complete the variables below, the social buttons on `/auth` run a **simulated prefill** (see `src/app/legacy/SiteAppLegacy.tsx` → `simulateSocialPrefill`). Once any single provider is fully configured, the real Cognito hosted UI redirect kicks in instead.

## TL;DR — what flips the switch

The frontend looks at `isCognitoHostedUiConfigured` (see `src/lib/config.ts`). Terraform infers `hosted_ui_enabled` from any of `google_enabled`, `apple_enabled`, `linkedin_enabled` (see `infra/terraform/main.tf` locals). Setting **one** provider's credentials is enough to enable the hosted UI.

## 1. Pick a Cognito domain prefix

Cognito hosted UI runs at `https://<prefix>.auth.<region>.amazoncognito.com`. The prefix must be globally unique within the region.

In `infra/terraform/terraform.tfvars`:

```hcl
cognito_domain_prefix = "careerlane-auth"   # or whatever's available
```

Leave blank to get a random suffix appended (handy for first deploy).

## 2. Register OAuth callback + logout URLs

The hosted UI redirects to your frontend after success/sign-out. Set both for every URL the app runs at (dev + prod):

```hcl
frontend_origins             = ["https://www.bobsnadenica.com", "http://localhost:5173"]
frontend_oauth_callback_urls = [
  "https://www.bobsnadenica.com/career/",
  "http://localhost:5173/"
]
frontend_oauth_logout_urls = [
  "https://www.bobsnadenica.com/career/",
  "http://localhost:5173/"
]
```

The trailing slash matters — Amplify's `redirectSignIn` must match exactly what Cognito has registered.

## 3. Per-provider setup

You can wire one, two, or all three providers — each is independent.

### Google

1. Open <https://console.cloud.google.com/> → APIs & Services → Credentials.
2. **Create OAuth client ID** → Application type: Web application.
3. **Authorised redirect URIs** — add the Cognito callback:
   ```
   https://<your-prefix>.auth.<region>.amazoncognito.com/oauth2/idpresponse
   ```
   (replace `<your-prefix>` and `<region>` with your real values).
4. Copy the **Client ID** and **Client secret**.
5. Set in `terraform.tfvars`:
   ```hcl
   google_client_id     = "1234...apps.googleusercontent.com"
   google_client_secret = "GOCSPX-..."
   ```

### Apple

1. Open <https://developer.apple.com/account/resources/identifiers/list>.
2. Register a **Services ID** (acts as OAuth client). Enable **Sign In with Apple** for it. Add a return URL — same `/oauth2/idpresponse` pattern as Google.
3. Register a **Sign In with Apple key** under Keys; download the `.p8` private key file.
4. Set:
   ```hcl
   apple_client_id   = "com.yourcompany.signin"
   apple_team_id     = "ABCDE12345"
   apple_key_id      = "XYZ789ABCD"
   apple_private_key = <<EOT
   -----BEGIN PRIVATE KEY-----
   MIGT...
   -----END PRIVATE KEY-----
   EOT
   ```
   Apple's private key is multi-line — use HCL heredoc to keep formatting.

### LinkedIn (OIDC)

LinkedIn doesn't have a first-class Cognito integration — we use the generic OIDC provider (`linkedin_provider_name = "LinkedInOIDC"` in `main.tf`).

1. Create an app at <https://www.linkedin.com/developers/apps>.
2. Under **Auth** → Redirect URLs, add the Cognito callback:
   ```
   https://<your-prefix>.auth.<region>.amazoncognito.com/oauth2/idpresponse
   ```
3. Request the **Sign In with LinkedIn using OpenID Connect** product (required for OIDC).
4. Copy the **Client ID** and **Client Secret**.
5. Set:
   ```hcl
   linkedin_client_id     = "78xxxxxx"
   linkedin_client_secret = "WPL_AP1..."
   ```

## 4. Apply Terraform

```
cd career/infra/terraform
terraform apply
```

Then capture the outputs:

```
terraform output cognito_user_pool_id
terraform output cognito_user_pool_client_id
terraform output api_base_url
```

## 5. Frontend env

Put the outputs into `career/.env.production` (and `.env.local` for dev). The relevant keys:

```
VITE_COGNITO_USER_POOL_ID=<output>
VITE_COGNITO_USER_POOL_CLIENT_ID=<output>
VITE_API_BASE_URL=<output>
VITE_COGNITO_HOSTED_UI_DOMAIN=<prefix>.auth.<region>.amazoncognito.com
VITE_OAUTH_REDIRECT_SIGN_IN=https://www.bobsnadenica.com/career/
VITE_OAUTH_REDIRECT_SIGN_OUT=https://www.bobsnadenica.com/career/
```

The frontend's `isCognitoHostedUiConfigured` (`src/lib/config.ts`) checks for `VITE_COGNITO_HOSTED_UI_DOMAIN` + a redirect URI. As soon as both are present, the demo prefill in `tryProviderLogin` is bypassed and `loginWithProvider` (Amplify `signInWithRedirect`) runs the real flow.

Re-run `npm run build` and redeploy.

## 6. Verification

1. Open `/auth` in an incognito window.
2. The social section now reads `Вход с външен профил` (no дашед "ДЕМО" banner).
3. Click **Google** → redirect to `accounts.google.com/...` → grant consent → bounced back to `/career/` signed in.
4. First-time login auto-bootstraps a user record via `POST /auth/bootstrap` (see `AppShell.tsx` social effect). Confirm the record exists in DynamoDB.
5. Repeat for Apple and LinkedIn if configured.

## Common pitfalls

- **`redirect_uri_mismatch`** from Google/Apple/LinkedIn → the callback URL registered with the provider doesn't match the Cognito IdP response URL. They must be byte-for-byte identical including trailing slashes.
- **`Invalid identity provider` from Cognito** → the provider's identity pool entry is missing or has wrong scope. `terraform apply` should create both `aws_cognito_identity_provider` and the corresponding `supported_identity_providers` array on the client. Re-check `cognito_user_pool_client.allowed_oauth_flows_user_pool_client` is `true`.
- **`User is not authorized to perform: cognito-idp:DescribeUserPoolClient`** → the IAM principal running `terraform apply` needs Cognito admin permissions, not just the Lambda role.
- **Apple key rotates every 6 months** → if logins suddenly fail, the `apple_private_key` may have expired. Regenerate from the developer portal.
- **LinkedIn rate limits** → 100 OAuth flows / app / day on the free tier. Plenty for dev, but watch on prod if you have a marketing push.

## Rolling back to demo mode

Just unset the three `*_client_id` variables and `cognito_domain_prefix`, then `terraform apply`. Frontend falls back to simulated prefill automatically — no code change required.
