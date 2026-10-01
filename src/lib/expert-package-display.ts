import type { ConsultantProfile } from "./types";

export function expertPackageRank(profile: Pick<ConsultantProfile, "packageTier">) {
  return profile.packageTier === "spotlight" ? 2 : profile.packageTier === "grow" ? 1 : 0;
}

export function sessionMonthInSofia(slot: string) {
  const date = new Date(slot);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Sofia", year: "numeric", month: "2-digit"
  }).formatToParts(date);
  return `${parts.find(part => part.type === "year")?.value}-${parts.find(part => part.type === "month")?.value}`;
}

export function hasMonthlyFreeSession(profile: Pick<ConsultantProfile, "monthlyFreeSessionAvailableMonths">, slot: string) {
  return Boolean(slot && profile.monthlyFreeSessionAvailableMonths?.includes(sessionMonthInSofia(slot)));
}
