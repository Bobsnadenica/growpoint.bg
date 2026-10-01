import { useMemo, useState } from "react";
import {
  formatAvailabilityDayLabel, formatAvailabilityTimeLabel, generateAvailabilityPattern,
  getAvailabilityDayKey, getRelativeDateInputValue, groupAvailabilityByDay
} from "../legacy/availability";
import { AVAILABILITY_LIMIT, availabilityDraftChanged, buildEditorSlot, mergeEditorSlots, overlapsOccupiedSlot } from "../legacy/availability-editor";

const HOURS = Array.from({ length: 13 }, (_, index) => `${String(index + 8).padStart(2, "0")}:00`);
const WEEKDAYS = [{ value: 1, label: "Пон" }, { value: 2, label: "Вто" }, { value: 3, label: "Сря" }, { value: 4, label: "Чет" }, { value: 5, label: "Пет" }, { value: 6, label: "Съб" }, { value: 0, label: "Нед" }];

interface Props {
  availability: string[];
  savedAvailability: string[];
  occupiedSlots: string[];
  sessionLengthMinutes: number;
  onChange: (slots: string[]) => void;
  saving: boolean;
  saveError: string;
}

export default function ConsultantAvailabilityEditor({ availability, savedAvailability, occupiedSlots, sessionLengthMinutes, onChange, saving, saveError }: Props) {
  const [date, setDate] = useState(getRelativeDateInputValue(1));
  const [time, setTime] = useState("09:00");
  const [weekdays, setWeekdays] = useState([1, 2, 3, 4, 5]);
  const [hours, setHours] = useState([10, 14]);
  const [weeks, setWeeks] = useState(4);
  const [feedback, setFeedback] = useState("");
  const [invalid, setInvalid] = useState(false);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const changed = availabilityDraftChanged(availability, savedAvailability);
  const groups = groupAvailabilityByDay(availability);
  const dayHours = Array.from(new Set([...HOURS, ...availability.filter(slot => getAvailabilityDayKey(slot) === date).map(formatAvailabilityTimeLabel), ...occupiedSlots.filter(slot => getAvailabilityDayKey(slot) === date).map(formatAvailabilityTimeLabel)])).sort();
  const pattern = useMemo(() => generateAvailabilityPattern({ weekdays, hours, weeksAhead: weeks }), [weekdays, hours, weeks]);
  const patternResult = mergeEditorSlots(availability, pattern, occupiedSlots, sessionLengthMinutes);
  const freeCount = availability.filter(slot => !overlapsOccupiedSlot(slot, occupiedSlots, sessionLengthMinutes)).length;

  function announce(message: string, error = false) { setFeedback(message); setInvalid(error); }
  function add(slots: string[]) {
    const result = mergeEditorSlots(availability, slots, occupiedSlots, sessionLengthMinutes);
    if (result.overLimit) { announce(`Максимум ${AVAILABILITY_LIMIT} часа. Избери по-кратък период.`, true); return; }
    if (!result.added) { announce(result.duplicates ? "Този час вече е добавен." : "Избери бъдещ час, който не се застъпва с резервация.", !result.duplicates); return; }
    onChange(result.slots);
    announce(`Добавени: ${result.added}.${result.duplicates || result.unavailable ? ` Пропуснати повторени или заети: ${result.duplicates + result.unavailable}.` : ""} Запази профила, за да публикуваш промените.`);
  }
  function addManual() {
    const slot = buildEditorSlot(date, time);
    if (!slot) { announce("Избери валидна дата и час. Несъществуващите местни часове не могат да се добавят.", true); return; }
    add([slot]);
  }
  function remove(slot: string) {
    if (saving || overlapsOccupiedSlot(slot, occupiedSlots, sessionLengthMinutes)) return;
    onChange(availability.filter(value => value !== slot));
    announce("Часът е премахнат от черновата. Запази профила, за да публикуваш промяната.");
  }
  function clearFree() {
    if (!window.confirm("Да премахнем всички незаети часове? Резервациите остават.")) return;
    onChange(availability.filter(slot => overlapsOccupiedSlot(slot, occupiedSlots, sessionLengthMinutes)));
    announce("Незаетите часове са премахнати от черновата.");
  }
  const toggle = (values: number[], value: number) => values.includes(value) ? values.filter(item => item !== value) : [...values, value];

  return <section className="availability-editor" aria-label="Редактор на свободни часове" aria-busy={saving}>
    <header className="availability-editor__header">
      <div><strong>Свободни часове</strong><p>Избери дата, после натисни час. Повторно натискане го премахва.</p></div>
      <span className="plan-pill">{freeCount} свободни</span>
    </header>
    <p className="availability-editor__timezone">Местно време на устройството: <strong>{timezone}</strong>.</p>
    <fieldset disabled={saving} className="availability-editor__controls">
      <legend className="sr-only">Добавяне на свободни часове</legend>
      <label>Дата<input type="date" value={date} min={getRelativeDateInputValue()} onChange={event => { setDate(event.target.value); setFeedback(""); }} onKeyDown={event => { if (event.key === "Enter") event.preventDefault(); }} /></label>
      <div className="availability-editor__hours" aria-label="Часове за избраната дата">
        {dayHours.map(hour => {
          const slot = buildEditorSlot(date, hour);
          const existing = availability.find(value => new Date(value).getTime() === new Date(slot).getTime());
          const occupied = overlapsOccupiedSlot(slot, occupiedSlots, sessionLengthMinutes);
          const disabled = !slot || new Date(slot).getTime() <= Date.now() || occupied;
          return <button key={hour} type="button" className={`availability-editor__hour${existing && !occupied ? " availability-editor__hour--selected" : ""}`} disabled={disabled} aria-pressed={Boolean(existing && !occupied)} aria-label={`${hour}${occupied ? " — заето" : existing ? " — добавен, натисни за премахване" : " — добави"}`} onClick={() => existing ? remove(existing) : add([slot])}>
            <span>{hour}</span><small>{occupied ? "Заето" : existing ? "Добавен ✓" : "Добави"}</small>
          </button>;
        })}
      </div>
      <div className="availability-editor__manual">
        <label>Друг час<input type="time" value={time} onChange={event => setTime(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); addManual(); } }} /></label>
        <button type="button" className="ghost-button" onClick={addManual}>Добави час</button>
      </div>
      <details className="availability-editor__pattern">
        <summary>Добави седмичен график</summary>
        <div className="availability-editor__pattern-body">
          <span>Дни от седмицата</span>
          <div className="availability-editor__chips">{WEEKDAYS.map(day => <button type="button" className={`pattern-chip${weekdays.includes(day.value) ? " pattern-chip--active" : ""}`} key={day.value} aria-pressed={weekdays.includes(day.value)} onClick={() => setWeekdays(toggle(weekdays, day.value))}>{day.label}</button>)}</div>
          <span>Начални часове</span>
          <div className="availability-editor__chips">{HOURS.map(hour => <button type="button" className={`pattern-chip${hours.includes(Number(hour.slice(0, 2))) ? " pattern-chip--active" : ""}`} key={hour} aria-pressed={hours.includes(Number(hour.slice(0, 2)))} onClick={() => setHours(toggle(hours, Number(hour.slice(0, 2))))}>{hour}</button>)}</div>
          <label>Период<select value={weeks} onChange={event => setWeeks(Number(event.target.value))}>{[1, 2, 4, 6, 8, 12].map(value => <option value={value} key={value}>{value} {value === 1 ? "седмица" : "седмици"}</option>)}</select></label>
          <p className="form-note">{patternResult.added} нови · {patternResult.duplicates} повторени · {patternResult.unavailable} заети/минали</p>
          {patternResult.overLimit && <p className="form-note">Лимит: {AVAILABILITY_LIMIT} часа. Намали периода или избраните часове.</p>}
          <button type="button" className="ghost-button" disabled={!patternResult.added || patternResult.overLimit} onClick={() => add(pattern)}>Добави {patternResult.added} часа</button>
        </div>
      </details>
    </fieldset>
    {feedback && <p className={`availability-editor__feedback${invalid ? " availability-editor__feedback--error" : ""}`} role={invalid ? "alert" : "status"}>{feedback}</p>}
    <p className="availability-editor__save-state" role="status">{saving ? "Записваме профила…" : changed ? "Има незаписани промени в часовете." : "Няма незаписани промени в часовете."}</p>
    {saveError && <p className="availability-editor__feedback availability-editor__feedback--error" role="alert">{saveError} Черновата е запазена тук. Провери заетите часове и опитай пак.</p>}
    <details className="availability-editor__schedule">
      <summary>Всички добавени часове · {availability.length}</summary>
      {groups.length ? groups.map(group => <div className="availability-editor__day" key={group.key}><strong>{group.label}</strong><div className="availability-editor__chips">{group.slots.map(slot => {
        const occupied = overlapsOccupiedSlot(slot, occupiedSlots, sessionLengthMinutes);
        return <button type="button" key={slot} className="availability-editor__slot" disabled={saving || occupied} onClick={() => remove(slot)} aria-label={`${formatAvailabilityDayLabel(slot)}, ${formatAvailabilityTimeLabel(slot)} — ${occupied ? "заето" : "премахни"}`}>{formatAvailabilityTimeLabel(slot)} <span aria-hidden="true">{occupied ? "Заето" : "×"}</span></button>;
      })}</div></div>) : <p className="form-note">Няма добавени часове. Избери дата и час по-горе.</p>}
      <div className="availability-editor__actions">
        {!!freeCount && <button type="button" className="text-button" disabled={saving} onClick={clearFree}>Изчисти незаетите</button>}
        {changed && <button type="button" className="text-button" disabled={saving} onClick={() => { onChange(savedAvailability.filter(slot => new Date(slot).getTime() > Date.now())); announce("Промените в часовете са отменени."); }}>Отмени промените</button>}
      </div>
    </details>
  </section>;
}
