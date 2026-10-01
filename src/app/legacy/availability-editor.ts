import { buildAvailabilitySlot, formatDateInputValue } from "./availability";

// Matches the backend limit; never silently truncate a consultant's draft.
export const AVAILABILITY_LIMIT = 400;

export function buildEditorSlot(date: string, time: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return "";
  const [hour, minute] = time.split(":").map(Number);
  if (hour > 23 || minute > 59) return "";
  const value = buildAvailabilitySlot(date, time);
  if (!value) return "";
  const parsed = new Date(value);
  // Reject calendar rollovers and a nonexistent local hour at the DST change.
  return formatDateInputValue(parsed) === date && parsed.getHours() === hour && parsed.getMinutes() === minute ? value : "";
}

export function overlapsOccupiedSlot(slot: string, occupied: string[], minutes = 60): boolean {
  const start = new Date(slot).getTime();
  const duration = Math.max(30, minutes || 60) * 60_000;
  return occupied.some(value => {
    const booked = new Date(value).getTime();
    return start < booked + duration && booked < start + duration;
  });
}

export function mergeEditorSlots(current: string[], candidates: string[], occupied: string[], minutes = 60, now = Date.now()) {
  const existing = new Set(current.map(value => new Date(value).getTime()));
  const added: string[] = [];
  let duplicates = 0, unavailable = 0;
  for (const slot of candidates) {
    const start = new Date(slot).getTime();
    if (!Number.isFinite(start) || start <= now || overlapsOccupiedSlot(slot, occupied, minutes)) { unavailable++; continue; }
    if (existing.has(start)) { duplicates++; continue; }
    existing.add(start);
    added.push(slot);
  }
  const overLimit = current.length + added.length > AVAILABILITY_LIMIT;
  return {
    slots: overLimit ? current : [...current, ...added].sort((a, b) => new Date(a).getTime() - new Date(b).getTime()),
    added: added.length,
    duplicates,
    unavailable,
    overLimit
  };
}

export function availabilityDraftChanged(current: string[], saved: string[]): boolean {
  const times = (values: string[]) => values.map(value => new Date(value).getTime()).filter(value => value > Date.now()).sort((a, b) => a - b);
  return JSON.stringify(times(current)) !== JSON.stringify(times(saved));
}
