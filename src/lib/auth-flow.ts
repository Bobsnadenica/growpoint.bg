import type { ConsultantProfileType, PlanTier, UserRole } from "./types";

const PENDING_BOOTSTRAP_KEY = "growpoint.pending-bootstrap";
const SOCIAL_AUTH_INTENT_KEY = "growpoint.social-auth-intent";
const SOCIAL_ONBOARDING_KEY = "growpoint.social-onboarding-pending";
const INVITE_TOKEN_KEY = "growpoint.invite-token";
const REFERRAL_CODE_KEY = "growpoint.referral-code";

export type SocialAuthProviderKey = "google" | "apple" | "linkedin";
export type SocialAuthMode = "login" | "register";

export type PendingBootstrap = {
  name: string;
  email: string;
  role: UserRole;
  plan: PlanTier;
  city?: string;
  occupation?: string;
  headline?: string;
  consultantProfileType?: ConsultantProfileType;
  avatarUrl?: string;
};

export type SocialAuthIntent = {
  provider: SocialAuthProviderKey;
  mode: SocialAuthMode;
  redirect: string;
  createdAt: string;
};

export const socialProviders = [
  { key: "google", label: "Google" },
  { key: "apple", label: "Apple" },
  { key: "linkedin", label: "LinkedIn" }
] as const;

function readStorageItem<T>(key: string) {
  if (typeof window === "undefined") {
    return null;
  }

  let raw: string | null = null;

  try {
    raw = window.localStorage.getItem(key);
  } catch {
    return null;
  }

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeStorageItem(key: string, value: unknown) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage may be unavailable (Safari private mode, quota, disabled).
  }
}

function removeStorageItem(key: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(key);
  } catch {
    // Storage may be unavailable.
  }
}

export function readPendingBootstrap() {
  return readStorageItem<PendingBootstrap>(PENDING_BOOTSTRAP_KEY);
}

export function writePendingBootstrap(value: PendingBootstrap) {
  writeStorageItem(PENDING_BOOTSTRAP_KEY, value);
}

export function clearPendingBootstrap() {
  removeStorageItem(PENDING_BOOTSTRAP_KEY);
}

export function readSocialAuthIntent() {
  return readStorageItem<SocialAuthIntent>(SOCIAL_AUTH_INTENT_KEY);
}

export function writeSocialAuthIntent(value: SocialAuthIntent) {
  writeStorageItem(SOCIAL_AUTH_INTENT_KEY, value);
}

export function clearSocialAuthIntent() {
  removeStorageItem(SOCIAL_AUTH_INTENT_KEY);
}

// Set right after a brand-new social account is created so the dashboard can
// show a one-time onboarding modal (confirm name, photo, city/occupation).
export function markSocialOnboardingPending() {
  writeStorageItem(SOCIAL_ONBOARDING_KEY, true);
}

export function readSocialOnboardingPending() {
  return readStorageItem<boolean>(SOCIAL_ONBOARDING_KEY) === true;
}

export function clearSocialOnboardingPending() {
  removeStorageItem(SOCIAL_ONBOARDING_KEY);
}

// Admin email-invite token (?invite=TOKEN). Captured on page load so it survives
// the Cognito hosted-UI / social-login round-trip, then redeemed at bootstrap to
// grant a free comped consultant account. Stored as a raw string.
export function captureInviteTokenFromUrl() {
  if (typeof window === "undefined") return;
  try {
    const token = new URLSearchParams(window.location.search).get("invite");
    if (token && token.trim()) {
      window.localStorage.setItem(INVITE_TOKEN_KEY, token.trim());
    }
  } catch {
    // Storage / URL unavailable.
  }
}

export function readInviteToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(INVITE_TOKEN_KEY);
    return value && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

export function clearInviteToken() {
  removeStorageItem(INVITE_TOKEN_KEY);
}

// Referral code (?ref=CODE). Captured on load so it survives the auth round-trip,
// then sent at bootstrap to credit the referrer once this user completes signup.
export function captureReferralFromUrl() {
  if (typeof window === "undefined") return;
  try {
    const code = new URLSearchParams(window.location.search).get("ref");
    if (code && code.trim()) {
      window.localStorage.setItem(REFERRAL_CODE_KEY, code.trim());
    }
  } catch {
    // Storage / URL unavailable.
  }
}

export function readReferralCode(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(REFERRAL_CODE_KEY);
    return value && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

export function clearReferralCode() {
  removeStorageItem(REFERRAL_CODE_KEY);
}
