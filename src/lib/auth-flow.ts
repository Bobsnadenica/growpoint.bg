import type { ConsultantProfileType, PlanTier, UserRole } from "./types";

const PENDING_BOOTSTRAP_KEY = "careerdoc.pending-bootstrap";
const SOCIAL_AUTH_INTENT_KEY = "careerdoc.social-auth-intent";
const SOCIAL_ONBOARDING_KEY = "careerdoc.social-onboarding-pending";

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
