// Availability / date-slot helpers extracted from SiteAppLegacy.tsx.
// Pure functions (Date/Intl only) — no React or app-state dependencies.

export function generateAvailabilityPattern({
  weekdays,
  hours,
  weeksAhead
}: {
  weekdays: number[];
  hours: number[];
  weeksAhead: number;
}): string[] {
  const slots: string[] = [];
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const totalDays = Math.max(1, weeksAhead) * 7;
  for (let offset = 0; offset < totalDays; offset += 1) {
    const day = new Date(start);
    day.setDate(day.getDate() + offset);
    if (!weekdays.includes(day.getDay())) continue;
    for (const hour of hours) {
      const slot = new Date(day);
      slot.setHours(hour, 0, 0, 0);
      if (slot.getTime() > now.getTime()) {
        slots.push(slot.toISOString());
      }
    }
  }
  return slots;
}

export function buildAvailabilityPreset(daysAhead: number, hour: number): {
  label: string;
  value: string;
} {
  const slot = new Date();
  slot.setDate(slot.getDate() + daysAhead);
  slot.setHours(hour, 0, 0, 0);

  return {
    label: `${daysAhead === 1 ? "Утре" : `След ${daysAhead} дни`} · ${slot.toLocaleTimeString(
      "bg-BG",
      {
        hour: "2-digit",
        minute: "2-digit"
      }
    )}`,
    value: slot.toISOString()
  };
}

export function formatDateInputValue(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

export function getRelativeDateInputValue(daysAhead = 0) {
  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + daysAhead);
  return formatDateInputValue(nextDate);
}

export function buildAvailabilitySlot(dateValue: string, timeValue: string) {
  if (!dateValue || !timeValue) {
    return "";
  }

  const [year, month, day] = dateValue.split("-").map(Number);
  const [hours, minutes] = timeValue.split(":").map(Number);

  if (!year || !month || !day || Number.isNaN(hours) || Number.isNaN(minutes)) {
    return "";
  }

  const slot = new Date(year, month - 1, day, hours, minutes, 0, 0);

  if (Number.isNaN(slot.getTime())) {
    return "";
  }

  return slot.toISOString();
}

export function normalizeAvailabilitySlots(value: string[]) {
  return Array.from(
    new Set(
      value
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .filter((item) => !Number.isNaN(new Date(item).getTime()))
    )
  ).sort((left, right) => new Date(left).getTime() - new Date(right).getTime());
}

export function getUpcomingAvailabilitySlots(
  value: string[],
  limit = Number.POSITIVE_INFINITY
) {
  const cutoff = Date.now() - 5 * 60 * 1000;

  return normalizeAvailabilitySlots(value)
    .filter((item) => new Date(item).getTime() >= cutoff)
    .slice(0, limit);
}

export function formatAvailabilityDayLabel(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "По договаряне";
  }

  return new Intl.DateTimeFormat("bg-BG", {
    weekday: "long",
    day: "numeric",
    month: "long"
  }).format(parsed);
}

export function formatAvailabilityTimeLabel(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "По договаряне";
  }

  return new Intl.DateTimeFormat("bg-BG", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(parsed);
}

export function formatAvailabilityShortLabel(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "По договаряне";
  }

  return new Intl.DateTimeFormat("bg-BG", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(parsed);
}

export function getAvailabilityDayKey(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return [
    parsed.getFullYear(),
    String(parsed.getMonth() + 1).padStart(2, "0"),
    String(parsed.getDate()).padStart(2, "0")
  ].join("-");
}

export function groupAvailabilityByDay(value: string[]) {
  const groups = new Map<
    string,
    {
      key: string;
      label: string;
      slots: string[];
    }
  >();

  getUpcomingAvailabilitySlots(value).forEach((slot) => {
    const key = getAvailabilityDayKey(slot);

    if (!key) {
      return;
    }

    const existing = groups.get(key);

    if (existing) {
      existing.slots.push(slot);
      return;
    }

    groups.set(key, {
      key,
      label: formatAvailabilityDayLabel(slot),
      slots: [slot]
    });
  });

  return Array.from(groups.values());
}
