function normalizeBasePath(value: string) {
  if (!value) {
    return "/";
  }

  const withLeadingSlash = value.startsWith("/") ? value : `/${value}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
}

function splitCsv(value: string) {
  return Array.from(
    new Set(
      String(value || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

function normalizeCognitoDomain(value: string) {
  return String(value || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/g, "");
}

export const config = {
  appName: import.meta.env.VITE_APP_NAME || "GrowPoint",
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || "",
  basePath: normalizeBasePath(import.meta.env.VITE_BASE_PATH || "/"),
  region: import.meta.env.VITE_AWS_REGION || "eu-west-1",
  cognito: {
    userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID || "",
    userPoolClientId: import.meta.env.VITE_COGNITO_USER_POOL_CLIENT_ID || "",
    domain: normalizeCognitoDomain(import.meta.env.VITE_COGNITO_DOMAIN || ""),
    socialProviders: splitCsv(import.meta.env.VITE_COGNITO_SOCIAL_PROVIDERS || "")
  }
};

export const isApiConfigured = Boolean(config.apiBaseUrl);
export const isCognitoConfigured = Boolean(
  config.cognito.userPoolId && config.cognito.userPoolClientId
);
export const isCognitoHostedUiConfigured = Boolean(
  isCognitoConfigured && config.cognito.domain && config.cognito.socialProviders.length
);

export function resolveAuthRedirectUrl() {
  // Must exactly match a Cognito-registered OAuth callback URL. Use a stable
  // app-root URL (origin + base path) instead of the current pathname so the
  // redirect works regardless of which route starts the social login.
  if (typeof window !== "undefined") {
    return `${window.location.origin}${config.basePath}`;
  }

  return `http://localhost:5173${config.basePath}`;
}
