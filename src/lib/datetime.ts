// Shared date/time formatting helpers (bg-BG locale).

export function formatDateTimeBg(date: string) {
  const parsed = new Date(date);

  if (!date || Number.isNaN(parsed.getTime())) {
    return "По договаряне";
  }

  return new Intl.DateTimeFormat("bg-BG", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(parsed);
}

export function formatRelativeBg(iso: string) {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diffSec = Math.round((Date.now() - then) / 1000);
  if (diffSec < 60) return "току-що";
  if (diffSec < 3600) return `преди ${Math.round(diffSec / 60)} мин`;
  if (diffSec < 86400) return `преди ${Math.round(diffSec / 3600)} ч`;
  if (diffSec < 7 * 86400) return `преди ${Math.round(diffSec / 86400)} дни`;
  return formatDateTimeBg(iso);
}
