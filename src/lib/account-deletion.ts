import type { UserProfile } from "./types";

type DeletionDates = Pick<UserProfile, "deletionScheduledAt" | "deletionEffectiveAt">;

export function hasPendingAccountDeletion(profile: DeletionDates | null | undefined) {
  return Boolean(profile?.deletionScheduledAt || profile?.deletionEffectiveAt);
}

export function accountDeletionDeadline(profile: DeletionDates) {
  const value = Date.parse(profile.deletionEffectiveAt || "");
  return Number.isFinite(value) ? value : null;
}

export function canCancelAccountDeletion(profile: DeletionDates, now = Date.now()) {
  const deadline = accountDeletionDeadline(profile);
  return hasPendingAccountDeletion(profile) && deadline !== null && deadline > now;
}
