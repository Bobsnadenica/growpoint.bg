# Social login setup (Google / Apple / LinkedIn)

GrowPoint uses Cognito's authorization-code flow for Google, Apple and LinkedIn OIDC. Unconfigured buttons are disabled and labelled **Скоро**. There is no simulated login or mock-account fallback. Configuration alone is not proof of a working provider callback.

## TL;DR — what flips the switch

The frontend looks at `isCognitoHostedUiConfigured` (see `src/lib/config.ts`). Terraform infers `hosted_ui_enabled` from any of `google_enabled`, `apple_enabled`, `linkedin_enabled` (see `infra/terraform/main.tf` locals). Setting **one** provider's credentials is enough to enable the hosted UI.

## 1. Pick a Cognito domain prefix

Cognito hosted UI runs at `https://<prefix>.auth.<region>.amazoncognito.com`. The prefix must be globally unique within the region.

In `infra/terraform/terraform.tfvars`:

```hcl
cognito_domain_prefix = "growpoint-auth"   # or whatever's available
```

Leave blank to use the project prefix and existing random suffix. Keep an established Cognito domain stable; changing it also requires updating provider callbacks.

## 2. Register OAuth callback + logout URLs

The hosted UI redirects to your frontend after success/sign-out. `resolveAuthRedirectUrl()` uses the current website origin plus `VITE_BASE_PATH`, normally the root URL with its trailing slash. Register that exact URL:

```hcl
frontend_origins             = ["https://www.growpoint.bg"]
frontend_oauth_callback_urls = [
  "https://www.growpoint.bg/"
]
frontend_oauth_logout_urls = [
  "https://www.growpoint.bg/"
]
```

The trailing slash matters — Amplify's `redirectSignIn` must match exactly what Cognito has registered.

Include the existing CloudFront test origin when testing there. Remove any temporarily authorized localhost origins after testing. A hosting cutover that preserves `https://www.growpoint.bg/` does not change the callback; redirect the apex domain to this canonical origin.

## 3. Per-provider setup

You can wire one, two, or all three providers — each is independent. The owner controls each provider application. Keep secrets in the ignored `terraform.tfvars` or a protected local environment, never in `VITE_*`, Git, public documentation or chat.

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
   apple_private_key = <<-KEY
   YOUR_COMPLETE_PRIVATE_KEY_CONTENTS
   KEY
   ```
   Paste the complete PEM contents with preserved line breaks into this ignored file. A `.tfvars` file accepts literal values; `file(...)` is not valid there. Keep the downloaded key outside the repository.

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
terraform -chdir=infra/terraform validate
terraform -chdir=infra/terraform plan
terraform -chdir=infra/terraform apply
```

Review the plan before applying; do not replace the user pool or destroy application tables. Then capture the public frontend configuration:

```
terraform -chdir=infra/terraform output -raw frontend_env_snippet
```

## 5. Frontend env

Put the outputs into `.env.production` (and `.env.local` for dev). The relevant keys:

```
VITE_COGNITO_USER_POOL_ID=<output>
VITE_COGNITO_USER_POOL_CLIENT_ID=<output>
VITE_API_BASE_URL=<output>
VITE_COGNITO_DOMAIN=<prefix>.auth.<region>.amazoncognito.com
VITE_COGNITO_SOCIAL_PROVIDERS=Google
VITE_BASE_PATH=/
```

The frontend's `isCognitoHostedUiConfigured` (`src/lib/config.ts`) checks for `VITE_COGNITO_DOMAIN` plus at least one `VITE_COGNITO_SOCIAL_PROVIDERS` entry. As soon as both are present, `loginWithProvider` (Amplify `signInWithRedirect`) runs the real flow.

The example enables only Google. Use the enabled labels from `frontend_env_snippet`; do not advertise an unconfigured provider. `.env.production` is tracked public browser configuration, not a secret store.

Re-run `npm run build` and redeploy.

## 6. Verification

1. Open `/auth` in an incognito window.
2. Only configured social buttons are enabled; unavailable providers say **Скоро**.
3. Click **Google** → redirect to `accounts.google.com/...` → grant consent → bounced back to `/` signed in.
4. Shared `GET /me/profile` handling repairs a missing application profile once via `POST /auth/bootstrap`. Confirm one Cognito identity and one application profile, correct name/role and no duplicate bootstrap.
5. Repeat for Apple and LinkedIn if configured.

Use an owner-authorized disposable identity and controlled inbox. Real terms acceptance requires the human user's confirmation. Test first and returning login, cancelled/denied provider login, callback/state errors, existing-email conflict, missing provider email, logout and a deep-link return on desktop/mobile.

New social registration requires explicit acceptance of the linked terms/privacy notices. A first social login can also create an account: if acceptance was not given, first-use onboarding requires it before saving; leaving without acceptance signs out to the public site. The backend stores the accepted version and server timestamp privately. Established accounts do not receive a retroactive terms gate. Expert invites must survive the redirect without granting access to another email; social login never grants admin access or paid membership.

## Common pitfalls

- **`redirect_uri_mismatch`** from Google/Apple/LinkedIn → the callback URL registered with the provider doesn't match the Cognito IdP response URL. They must be byte-for-byte identical including trailing slashes.
- **`Invalid identity provider` from Cognito** → the provider's identity pool entry is missing or has wrong scope. `terraform apply` should create both `aws_cognito_identity_provider` and the corresponding `supported_identity_providers` array on the client. Re-check `cognito_user_pool_client.allowed_oauth_flows_user_pool_client` is `true`.
- **`User is not authorized to perform: cognito-idp:DescribeUserPoolClient`** → the IAM principal running `terraform apply` needs Cognito admin permissions, not just the Lambda role.
- **Apple key rotation** → the Terraform provider treats this value as write-only. Follow the resource's rotation instructions and review the plan; do not replace the Cognito pool. Do not confuse a signed client-secret lifetime with private-key expiry.
- **LinkedIn claims/limits** → the email claim can be absent. Handle that error explicitly and check the application's actual limits; do not assume a fixed OAuth-flow quota. See [LinkedIn OIDC](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2).

## Hiding an unavailable provider

Remove its label from the frontend configuration and rebuild/deploy. Removing a Cognito provider can break established federated accounts; review account impact before changing infrastructure. Disabling a provider never enables a demo fallback. See [Cognito federation](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-identity-federation.html).
