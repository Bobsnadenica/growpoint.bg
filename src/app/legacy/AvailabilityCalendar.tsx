import { useMemo, useState } from "react";
import {
  formatAvailabilityTimeLabel,
  getAvailabilityDayKey,
  getUpcomingAvailabilitySlots
} from "./availability";

// Monday-first weekday labels.
const WEEKDAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"] as const;
const MONTH_FORMAT = new Intl.DateTimeFormat("bg-BG", {
  month: "long",
  year: "numeric"
});
const DAY_FORMAT = new Intl.DateTimeFormat("bg-BG", {
  weekday: "long",
  day: "numeric",
  month: "long"
});
// Candidate booking hours offered when a consultant picks availability (08:00–20:00).
const CANDIDATE_HOURS = Array.from({ length: 13 }, (_, i) => i + 8);

type BaseProps = {
  /** ISO slot strings that are currently available. */
  availability: string[];
};

type BookProps = BaseProps & {
  mode: "book";
  selectedSlot: string;
  onSelectSlot: (slot: string) => void;
};

type PickProps = BaseProps & {
  mode: "pick";
  onToggleSlot: (slot: string) => void;
};

type AvailabilityCalendarProps = BookProps | PickProps;

function buildHourSlot(dayKey: string, hour: number) {
  const [year, month, day] = dayKey.split("-").map(Number);
  if (!year || !month || !day) return "";
  return new Date(year, month - 1, day, hour, 0, 0, 0).toISOString();
}

export default function AvailabilityCalendar(props: AvailabilityCalendarProps) {
  const { availability, mode } = props;

  // Group the upcoming available slots by day for the dots / hour chips.
  const slotsByDay = useMemo(() => {
    const map = new Map<string, string[]>();
    getUpcomingAvailabilitySlots(availability).forEach((slot) => {
      const key = getAvailabilityDayKey(slot);
      if (!key) return;
      const existing = map.get(key);
      if (existing) existing.push(slot);
      else map.set(key, [slot]);
    });
    return map;
  }, [availability]);

  const todayKey = getAvailabilityDayKey(new Date().toISOString());

  const [viewDate, setViewDate] = useState(() => {
    // In book mode start on the month of the first available day.
    const first = getUpcomingAvailabilitySlots(availability, 1)[0];
    const base = first ? new Date(first) : new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  const [selectedDayKey, setSelectedDayKey] = useState<string>(() => {
    if (mode === "book") {
      return getAvailabilityDayKey(
        getUpcomingAvailabilitySlots(availability, 1)[0] || ""
      );
    }
    return "";
  });

  const viewYear = viewDate.getFullYear();
  const viewMonth = viewDate.getMonth();

  const now = new Date();
  const nowMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const canGoPrev = viewDate > nowMonthStart;

  const cells = useMemo<(Date | null)[]>(() => {
    const monthStart = new Date(viewYear, viewMonth, 1);
    const leading = (monthStart.getDay() + 6) % 7; // Monday = 0
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const result: (Date | null)[] = [];
    for (let i = 0; i < leading; i += 1) result.push(null);
    for (let d = 1; d <= daysInMonth; d += 1) {
      result.push(new Date(viewYear, viewMonth, d));
    }
    while (result.length % 7 !== 0) result.push(null);
    return result;
  }, [viewYear, viewMonth]);

  const selectedDayHours = mode === "book" ? slotsByDay.get(selectedDayKey) || [] : [];

  function changeMonth(delta: number) {
    setViewDate((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  }

  return (
    <div className="cal" role="group" aria-label="Календар със свободни часове">
      <div className="cal__head">
        <button
          type="button"
          className="cal__nav"
          onClick={() => changeMonth(-1)}
          disabled={!canGoPrev}
          aria-label="Предишен месец"
        >
          ‹
        </button>
        <strong className="cal__title">{MONTH_FORMAT.format(viewDate)}</strong>
        <button
          type="button"
          className="cal__nav"
          onClick={() => changeMonth(1)}
          aria-label="Следващ месец"
        >
          ›
        </button>
      </div>

      <div className="cal__weekdays" aria-hidden="true">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>

      <div className="cal__grid">
        {cells.map((date, index) => {
          if (!date) {
            return <span className="cal__cell cal__cell--empty" key={`empty-${index}`} />;
          }
          const dayKey = getAvailabilityDayKey(date.toISOString());
          const isPast = dayKey < todayKey;
          const isToday = dayKey === todayKey;
          const count = (slotsByDay.get(dayKey) || []).length;
          const hasSlots = count > 0;
          const isSelected = dayKey === selectedDayKey;

          // Book mode: only days that actually have free hours are selectable.
          // Pick mode: today and any future day is selectable.
          const selectable = mode === "book" ? hasSlots && !isPast : !isPast;

          return (
            <button
              type="button"
              key={dayKey}
              className={[
                "cal__cell",
                "cal__day",
                isSelected ? "cal__day--selected" : "",
                isToday ? "cal__day--today" : "",
                hasSlots ? "cal__day--has-slots" : ""
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => setSelectedDayKey(dayKey)}
              disabled={!selectable}
              aria-pressed={isSelected}
              aria-label={`${DAY_FORMAT.format(date)}${count ? `, ${count} свободни часа` : ""}`}
            >
              <span className="cal__day-number">{date.getDate()}</span>
              {hasSlots ? <span className="cal__day-count">{count}</span> : null}
            </button>
          );
        })}
      </div>

      {selectedDayKey ? (
        <div className="cal__hours" aria-label="Часове за избрания ден">
          <span className="cal__hours-label">
            {DAY_FORMAT.format(new Date(`${selectedDayKey}T00:00:00`))}
          </span>
          <div className="cal__hours-grid">
            {mode === "book"
              ? selectedDayHours.length
                ? selectedDayHours.map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      className={`slot-button slot-button--compact ${
                        props.selectedSlot === slot ? "slot-button--active" : ""
                      }`}
                      onClick={() => props.onSelectSlot(slot)}
                      aria-pressed={props.selectedSlot === slot}
                    >
                      {formatAvailabilityTimeLabel(slot)}
                    </button>
                  ))
                : (
                    <p className="form-note">Няма свободни часове за този ден.</p>
                  )
              : CANDIDATE_HOURS.map((hour) => {
                  const slot = buildHourSlot(selectedDayKey, hour);
                  const isPastHour = new Date(slot).getTime() < Date.now();
                  const active = (slotsByDay.get(selectedDayKey) || []).includes(slot);
                  return (
                    <button
                      key={hour}
                      type="button"
                      className={`slot-button slot-button--compact ${
                        active ? "slot-button--active" : ""
                      }`}
                      onClick={() => props.onToggleSlot(slot)}
                      disabled={isPastHour}
                      aria-pressed={active}
                    >
                      {String(hour).padStart(2, "0")}:00
                    </button>
                  );
                })}
          </div>
        </div>
      ) : (
        <p className="form-note cal__hint">
          {mode === "book"
            ? "Избери ден със свободни часове, за да видиш наличните часове."
            : "Избери ден, за да отбележиш свободните си часове."}
        </p>
      )}
    </div>
  );
}
