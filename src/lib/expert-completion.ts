import type { ConsultantProfile } from "./types";

/** Only fields that the expert can edit; independent of paid visibility. */
export function expertCompletion(profile: ConsultantProfile | null) {
  const fields = [
    profile?.name, profile?.city, profile?.headline, profile?.bio,
    profile?.experienceSummary, profile?.experienceHighlights,
    profile?.educationHighlights, profile?.specializations, profile?.languages,
    profile?.idealFor, profile?.consultationTopics, profile?.workApproach,
    profile?.availability
  ];
  const has = (value: unknown) => Array.isArray(value) ? value.length > 0 : Boolean(String(value ?? "").trim());
  return Math.round(fields.filter(has).length / fields.length * 100);
}
